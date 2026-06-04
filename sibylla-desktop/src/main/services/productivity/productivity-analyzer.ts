import type { KanbanService } from '../kanban/kanban-service'
import type { GitAbstraction } from '../git-abstraction'
import type { EventLogStore } from '../event-log-store'
import type { WikiLinksStore } from '../wiki-links/wiki-links-store'
import type { PrivacyFilter } from '../presence/privacy-filter'
import type { SibyllaEvent } from '../event-bus-types'

import type { MemberRole } from '../../../shared/types/member.types'

import { logger } from '../../utils/logger'

import type {
  AnalysisPeriod,
  AnalyzeOptions,
  CacheEntry,
  DateRange,
  DimensionScore,
  ProductivityReport,
} from './types'

import {
  CACHE_TTL_MS,
  DATA_SUFFICIENCY_DAYS,
  DEFAULT_DIMENSION_WEIGHT,
  DEFAULT_FILE_WEIGHT,
  FILE_TYPE_WEIGHTS,
  PRIORITY_WEIGHTS,
} from './types'

export interface MemberInfo {
  userId: string
  role: MemberRole
  displayName: string
}

export interface MemberDirectory {
  getMember(userId: string): MemberInfo | undefined
  getAllMembers(): MemberInfo[]
}

export class ProductivityAnalyzer {
  private cache = new Map<string, CacheEntry>()

  constructor(
    private readonly kanbanService: KanbanService,
    private readonly gitAbstraction: GitAbstraction,
    private readonly eventLogStore: EventLogStore,
    private readonly wikiLinksStore: WikiLinksStore,
    private readonly memberDirectory: MemberDirectory,
    _privacyFilter: PrivacyFilter,
    private readonly workspaceRoot: string,
  ) {}

  async analyze(opts: AnalyzeOptions): Promise<ProductivityReport> {
    const cacheKey = `${opts.period}:${opts.memberId ?? 'all'}:${opts.viewerId}`

    const cached = this.cache.get(cacheKey)
    if (cached && cached.cachedAt + CACHE_TTL_MS > Date.now()) {
      return cached.report
    }

    const dateRange = this.computeDateRange(opts.period)

    const dataSufficient = await this.checkDataSufficiency()
    const insufficientNotice = !dataSufficient
      ? `数据积累不足 ${DATA_SUFFICIENCY_DAYS} 天，以下指标仅供参考`
      : undefined

    const [taskCompletion, docContribution, collabResponsiveness, knowledgeContribution] =
      await Promise.all([
        this.calculateTaskCompletion(opts.memberId, dateRange),
        this.calculateDocContribution(opts.memberId, dateRange),
        this.calculateCollabResponsiveness(opts.memberId, dateRange),
        this.calculateKnowledgeContribution(opts.memberId, dateRange),
      ])

    const dimensions = {
      taskCompletion,
      docContribution,
      collabResponsiveness,
      knowledgeContribution,
    }

    const validDimensions = Object.values(dimensions).filter((d) => !d.isNA)
    const overall =
      validDimensions.length > 0
        ? validDimensions.reduce((sum, d) => sum + d.normalized * DEFAULT_DIMENSION_WEIGHT, 0) /
          (validDimensions.length * DEFAULT_DIMENSION_WEIGHT)
        : 0

    const report: ProductivityReport = {
      period: opts.period,
      memberId: opts.memberId,
      viewerId: opts.viewerId,
      dimensions,
      overall,
      generatedAt: new Date().toISOString(),
      dataSufficient,
      insufficientNotice,
      isAnonymized: false,
    }

    this.applyPrivacyFilter(report, opts.viewerId, opts.memberId)

    this.cache.set(cacheKey, { report, cachedAt: Date.now() })

    return report
  }

  queryCached(opts: AnalyzeOptions): ProductivityReport | null {
    const cacheKey = `${opts.period}:${opts.memberId ?? 'all'}:${opts.viewerId}`
    const cached = this.cache.get(cacheKey)
    if (cached && cached.cachedAt + CACHE_TTL_MS > Date.now()) {
      return cached.report
    }
    return null
  }

  invalidateCache(): void {
    this.cache.clear()
  }

  private computeDateRange(period: AnalysisPeriod): DateRange {
    const until = new Date()
    const since = new Date()

    switch (period) {
      case 'week':
        since.setDate(since.getDate() - 7)
        break
      case 'month':
        since.setMonth(since.getMonth() - 1)
        break
      case 'quarter':
        since.setMonth(since.getMonth() - 3)
        break
    }

    return { since, until }
  }

  private async checkDataSufficiency(): Promise<boolean> {
    try {
      const now = new Date()
      const months: string[] = []
      for (let i = 0; i < DATA_SUFFICIENCY_DAYS; i++) {
        const d = new Date(now)
        d.setDate(d.getDate() - i)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        if (!months.includes(key)) months.push(key)
      }

      const events: SibyllaEvent[] = []
      for (const month of months) {
        const monthEvents = await this.eventLogStore.read(month)
        events.push(...monthEvents)
      }

      if (events.length === 0) return false

      const earliest = Math.min(...events.map((e) => e.timestamp))
      const daysDiff = (Date.now() - earliest) / (1000 * 60 * 60 * 24)
      return daysDiff >= DATA_SUFFICIENCY_DAYS
    } catch {
      return false
    }
  }

  async calculateTaskCompletion(memberId: string | undefined, _dateRange: DateRange): Promise<DimensionScore> {
    try {
      const model = await this.kanbanService.parseTasksMd(this.workspaceRoot)

      const assignedTasks = memberId
        ? model.tasks.filter((t) => t.assignee === memberId)
        : model.tasks

      if (assignedTasks.length === 0) {
        return {
          raw: 0,
          normalized: 0,
          weight: DEFAULT_DIMENSION_WEIGHT,
          label: '任务完成率',
          isNA: true,
        }
      }

      let completedWeight = 0
      let totalWeight = 0

      for (const task of assignedTasks) {
        const weight = PRIORITY_WEIGHTS[task.priority ?? 'P1'] ?? PRIORITY_WEIGHTS.P1 ?? DEFAULT_DIMENSION_WEIGHT
        totalWeight += weight
        if (task.status === '已完成') {
          completedWeight += weight
        }
      }

      const raw = totalWeight > 0 ? completedWeight / totalWeight : 0

      return {
        raw,
        normalized: raw,
        weight: DEFAULT_DIMENSION_WEIGHT,
        label: '任务完成率',
        details: `${assignedTasks.filter((t) => t.status === '已完成').length}/${assignedTasks.length} 任务完成`,
      }
    } catch (error) {
      logger.error('productivity.taskCompletion.error', { error })
      return {
        raw: 0,
        normalized: 0,
        weight: DEFAULT_DIMENSION_WEIGHT,
        label: '任务完成率',
        isNA: true,
      }
    }
  }

  async calculateDocContribution(memberId: string | undefined, dateRange: DateRange): Promise<DimensionScore> {
    try {
      const history = await this.gitAbstraction.getHistory({
        depth: 500,
      })

      const sinceTs = dateRange.since.getTime()
      const untilTs = dateRange.until.getTime()

      const commitsInRange = history.filter(
        (c) => c.timestamp >= sinceTs && c.timestamp <= untilTs,
      )

      if (commitsInRange.length === 0) {
        return {
          raw: 0,
          normalized: 0,
          weight: DEFAULT_DIMENSION_WEIGHT,
          label: '文档贡献度',
          isNA: true,
        }
      }

      const authorScores = new Map<string, number>()
      for (const commit of commitsInRange) {
        try {
          const diffs = await this.gitAbstraction.getCommitDiff(commit.oid)
          let commitScore = 0
          for (const diff of diffs) {
            const fileWeight = this.getFileWeight(diff.filepath)
            const changes = diff.hunks.reduce(
              (sum, h) =>
                sum + h.lines.filter((l) => l.type === 'add' || l.type === 'delete').length,
              0,
            )
            commitScore += fileWeight * changes
          }
          const prev = authorScores.get(commit.authorName) ?? 0
          authorScores.set(commit.authorName, prev + commitScore)
        } catch {
          // skip commits whose diff fails
        }
      }

      const filteredCommits = memberId
        ? commitsInRange.filter((c) => c.authorName === memberId || c.authorEmail === memberId)
        : commitsInRange
      const rawScore = filteredCommits.reduce((sum, c) => sum + (authorScores.get(c.authorName) ?? 0), 0)

      let teamMax = 0
      for (const score of authorScores.values()) {
        if (score > teamMax) teamMax = score
      }
      const normalized = teamMax > 0 ? Math.min(rawScore / teamMax, 1) : 0

      return {
        raw: rawScore,
        normalized,
        weight: DEFAULT_DIMENSION_WEIGHT,
        label: '文档贡献度',
        details: `${filteredCommits.length} commits`,
      }
    } catch (error) {
      logger.error('productivity.docContribution.error', { error })
      return {
        raw: 0,
        normalized: 0,
        weight: DEFAULT_DIMENSION_WEIGHT,
        label: '文档贡献度',
        isNA: true,
      }
    }
  }

  async calculateCollabResponsiveness(_memberId: string | undefined, dateRange: DateRange): Promise<DimensionScore> {
    try {
      const sinceMonth = `${dateRange.since.getFullYear()}-${String(dateRange.since.getMonth() + 1).padStart(2, '0')}`
      const untilMonth = `${dateRange.until.getFullYear()}-${String(dateRange.until.getMonth() + 1).padStart(2, '0')}`

      const months = this.getMonthsInRange(sinceMonth, untilMonth)

      const allEvents: SibyllaEvent[] = []
      for (const month of months) {
        const events = await this.eventLogStore.read(month)
        allEvents.push(...events)
      }

      const sinceTs = dateRange.since.getTime()
      const untilTs = dateRange.until.getTime()

      const commentEvents = allEvents.filter((e) => {
        if (e.timestamp < sinceTs || e.timestamp > untilTs) return false
        return (
          e.type === 'mcp.sync-completed' ||
          e.type === 'ai.message-completed' ||
          e.type === 'notification.created'
        )
      })

      if (commentEvents.length < 2) {
        return {
          raw: 0,
          normalized: 0,
          weight: DEFAULT_DIMENSION_WEIGHT,
          label: '协作响应速度',
          isNA: true,
        }
      }

      const delays: number[] = []
      for (let i = 1; i < commentEvents.length; i++) {
        const current = commentEvents[i]
        const previous = commentEvents[i - 1]
        if (!current || !previous) continue
        const delay = current.timestamp - previous.timestamp
        delays.push(delay / (1000 * 60 * 60))
      }

      delays.sort((a, b) => a - b)
      const medianDelayHours = delays[Math.floor(delays.length / 2)] ?? 0
      const raw = 1 / (1 + medianDelayHours)
      const normalized = raw

      return {
        raw,
        normalized,
        weight: DEFAULT_DIMENSION_WEIGHT,
        label: '协作响应速度',
        details: `中位响应时延 ${medianDelayHours.toFixed(1)}h`,
      }
    } catch (error) {
      logger.error('productivity.collabResponsiveness.error', { error })
      return {
        raw: 0,
        normalized: 0,
        weight: DEFAULT_DIMENSION_WEIGHT,
        label: '协作响应速度',
        isNA: true,
      }
    }
  }

  async calculateKnowledgeContribution(memberId: string | undefined, _dateRange: DateRange): Promise<DimensionScore> {
    try {
      const history = await this.gitAbstraction.getHistory({ depth: 500 })

      const authorFiles = new Map<string, Set<string>>()
      for (const commit of history) {
        try {
          const diffs = await this.gitAbstraction.getCommitDiff(commit.oid)
          for (const diff of diffs) {
            if (diff.newContent.length > 0 && diff.oldContent.length === 0) {
              const author = commit.authorName
              if (!authorFiles.has(author)) {
                authorFiles.set(author, new Set())
              }
              authorFiles.get(author)!.add(diff.filepath)
            }
          }
        } catch {
          // skip
        }
      }

      if (!memberId) {
        let totalRaw = 0
        for (const files of authorFiles.values()) {
          for (const filePath of files) {
            const linkCount = this.wikiLinksStore.getLinkCount(filePath)
            totalRaw += linkCount.incoming
          }
        }
        const teamMax = this.computeTeamMaxKnowledge(authorFiles)
        const normalized = teamMax > 0 ? Math.min(totalRaw / teamMax, 1) : 0
        return {
          raw: totalRaw,
          normalized,
          weight: DEFAULT_DIMENSION_WEIGHT,
          label: '知识贡献度',
          details: `全体 ${authorFiles.size} 位贡献者, ${totalRaw} 被引用`,
        }
      }

      const memberFiles = authorFiles.get(memberId)

      if (!memberFiles || memberFiles.size === 0) {
        return {
          raw: 0,
          normalized: 0,
          weight: DEFAULT_DIMENSION_WEIGHT,
          label: '知识贡献度',
          isNA: true,
        }
      }

      let rawScore = 0
      for (const filePath of memberFiles) {
        const linkCount = this.wikiLinksStore.getLinkCount(filePath)
        rawScore += linkCount.incoming
      }

      const teamMax = this.computeTeamMaxKnowledge(authorFiles)
      const normalized = teamMax > 0 ? Math.min(rawScore / teamMax, 1) : 0

      return {
        raw: rawScore,
        normalized,
        weight: DEFAULT_DIMENSION_WEIGHT,
        label: '知识贡献度',
        details: `${memberFiles.size} 文档, ${rawScore} 被引用`,
      }
    } catch (error) {
      logger.error('productivity.knowledgeContribution.error', { error })
      return {
        raw: 0,
        normalized: 0,
        weight: DEFAULT_DIMENSION_WEIGHT,
        label: '知识贡献度',
        isNA: true,
      }
    }
  }

  private applyPrivacyFilter(
    report: ProductivityReport,
    viewerId: string,
    memberId: string | undefined,
  ): void {
    if (!memberId || viewerId === memberId) {
      report.isAnonymized = false
      return
    }

    const viewerMember = this.memberDirectory.getMember(viewerId)
    if (viewerMember?.role === 'admin') {
      report.isAnonymized = false
      report.adminView = true
      return
    }

    report.isAnonymized = true
    report.memberId = undefined
    const dims = report.dimensions
    for (const key of Object.keys(dims) as Array<keyof typeof dims>) {
      dims[key].details = undefined
    }
  }

  private getFileWeight(filepath: string): number {
    for (const [prefix, weight] of Object.entries(FILE_TYPE_WEIGHTS)) {
      if (filepath.startsWith(prefix)) return weight
    }
    return DEFAULT_FILE_WEIGHT
  }

  private computeTeamMaxKnowledge(authorFiles: Map<string, Set<string>>): number {
    let max = 0
    for (const [, files] of authorFiles) {
      let score = 0
      for (const filePath of files) {
        const linkCount = this.wikiLinksStore.getLinkCount(filePath)
        score += linkCount.incoming
      }
      if (score > max) max = score
    }
    return max
  }

  private getMonthsInRange(sinceMonth: string, untilMonth: string): string[] {
    const months: string[] = []
    const [sinceYRaw, sinceMRaw] = sinceMonth.split('-')
    const [untilYRaw, untilMRaw] = untilMonth.split('-')
    const sinceY = Number(sinceYRaw)
    const sinceM = Number(sinceMRaw)
    const untilY = Number(untilYRaw)
    const untilM = Number(untilMRaw)
    if (![sinceY, sinceM, untilY, untilM].every(Number.isFinite)) return []

    let y = sinceY
    let m = sinceM
    while (y < untilY || (y === untilY && m <= untilM)) {
      months.push(`${y}-${String(m).padStart(2, '0')}`)
      m++
      if (m > 12) {
        m = 1
        y++
      }
    }
    return months
  }
}
