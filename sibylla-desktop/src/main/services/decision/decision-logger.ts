import * as path from 'path'
import * as fs from 'fs'
import { logger } from '../../utils/logger'
import type { AppEventBus } from '../event-bus'
import type {
  DecisionLog,
  DecisionOption,
  CreateDecisionInput,
  DecisionListFilters,
  DecisionStatus,
} from './types'

const MEMORY_DECISIONS_DIR = '.sibylla/memory/decisions'
const DOCS_DECISIONS_DIR = 'docs/decisions'
const SLUG_MAX_LENGTH = 60

export class DecisionLogger {
  constructor(
    private readonly eventBus: AppEventBus,
    private readonly workspaceRoot: string,
  ) {}

  async create(input: CreateDecisionInput): Promise<DecisionLog> {
    const now = new Date()
    const dateStr = this.formatDate(now)
    const slug = this.generateSlug(input.title)
    const id = `dec_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}_${String(now.getDate()).padStart(2, '0')}_${slug}`

    const location = input.location ?? 'memory'
    const dirRelative = location === 'memory' ? MEMORY_DECISIONS_DIR : DOCS_DECISIONS_DIR
    const dirAbsolute = path.join(this.workspaceRoot, dirRelative)

    await fs.promises.mkdir(dirAbsolute, { recursive: true })

    const fileName = await this.resolveUniqueFileName(dirAbsolute, dateStr, slug)
    const filePathRelative = path.join(dirRelative, fileName)
    const filePathAbsolute = path.join(this.workspaceRoot, filePathRelative)

    const frontmatter = {
      id,
      title: input.title,
      status: 'decided' as DecisionStatus,
      decided_at: dateStr,
      decided_by: input.decidedBy ?? [],
      tags: input.tags ?? [],
      related_files: input.relatedFiles ?? [],
    }

    const content = this.renderMarkdown(frontmatter, input)
    await this.atomicWriteFile(filePathAbsolute, content)

    const decision: DecisionLog = {
      id,
      title: input.title,
      status: 'decided',
      decidedAt: dateStr,
      decidedBy: input.decidedBy ?? [],
      tags: input.tags ?? [],
      relatedFiles: input.relatedFiles ?? [],
      problem: input.problem,
      options: input.options,
      chosen: input.chosen,
      reason: input.reason,
      filePath: filePathRelative,
      updatedAt: Date.now(),
    }

    this.eventBus.emitEvent({
      type: 'decision.recorded',
      source: 'DecisionLogger',
      payload: { decisionId: id, title: input.title, filePath: filePathRelative },
    })

    logger.info('decision.created', { id, filePath: filePathRelative })
    return decision
  }

  async updateOutcome(decisionId: string, actualResult: string): Promise<void> {
    const decision = await this.get(decisionId)
    if (!decision) {
      throw new Error(`Decision not found: ${decisionId}`)
    }

    const filePathAbsolute = path.join(this.workspaceRoot, decision.filePath)
    let content = await fs.promises.readFile(filePathAbsolute, 'utf-8')

    const outcomeSectionRegex = /## 实际结果\n[\s\S]*?(?=\n## |$)/
    const newOutcomeSection = `## 实际结果\n${actualResult}`

    if (outcomeSectionRegex.test(content)) {
      content = content.replace(outcomeSectionRegex, newOutcomeSection)
    } else {
      content = `${content.trimEnd()}\n\n${newOutcomeSection}\n`
    }

    const revertedKeywords = ['回退', '废弃', '放弃', 'reverted', 'abandoned', 'rolled back']
    const isReverted = revertedKeywords.some((kw) => actualResult.toLowerCase().includes(kw))
    if (isReverted && decision.status !== 'reverted') {
      content = content.replace(/^(status:\s*)\S+/m, `$1reverted`)
    }

    await this.atomicWriteFile(filePathAbsolute, content)

    this.eventBus.emitEvent({
      type: 'decision.outcome-updated',
      source: 'DecisionLogger',
      payload: { decisionId, newOutcome: actualResult },
    })

    logger.info('decision.outcome_updated', { decisionId })
  }

  async list(filters?: DecisionListFilters): Promise<DecisionLog[]> {
    const decisions: DecisionLog[] = []

    const dirs = [
      path.join(this.workspaceRoot, MEMORY_DECISIONS_DIR),
      path.join(this.workspaceRoot, DOCS_DECISIONS_DIR),
    ]

    for (const dir of dirs) {
      const items = await this.safeReadDir(dir)
      for (const item of items) {
        if (!item.endsWith('.md')) continue
        const fullPath = path.join(dir, item)
        const decision = await this.parseDecisionFile(fullPath)
        if (decision) {
          decisions.push(decision)
        }
      }
    }

    let filtered = decisions
    if (filters?.tags && filters.tags.length > 0) {
      filtered = filtered.filter((d) => filters.tags!.some((tag) => d.tags.includes(tag)))
    }
    if (filters?.status) {
      filtered = filtered.filter((d) => d.status === filters.status)
    }
    if (filters?.searchQuery) {
      const query = filters.searchQuery.toLowerCase()
      filtered = filtered.filter(
        (d) =>
          d.title.toLowerCase().includes(query) ||
          d.problem.toLowerCase().includes(query),
      )
    }

    const sortBy = filters?.sortBy ?? 'date'
    const sortOrder = filters?.sortOrder ?? 'desc'
    filtered.sort((a, b) => {
      let cmp: number
      if (sortBy === 'title') {
        cmp = a.title.localeCompare(b.title)
      } else {
        cmp = a.decidedAt.localeCompare(b.decidedAt)
      }
      return sortOrder === 'desc' ? -cmp : cmp
    })

    return filtered
  }

  async get(decisionId: string): Promise<DecisionLog | null> {
    const dirs = [
      path.join(this.workspaceRoot, MEMORY_DECISIONS_DIR),
      path.join(this.workspaceRoot, DOCS_DECISIONS_DIR),
    ]

    for (const dir of dirs) {
      const items = await this.safeReadDir(dir)
      for (const item of items) {
        if (!item.endsWith('.md')) continue
        const fullPath = path.join(dir, item)
        const content = await this.safeReadFile(fullPath)
        if (!content) continue
        const fm = this.parseFrontmatter(content)
        if (fm && fm.id === decisionId) {
          return this.parseDecisionFile(fullPath)
        }
      }
    }

    return null
  }

  async getByFilePath(filePath: string): Promise<DecisionLog | null> {
    const fullPath = path.join(this.workspaceRoot, filePath)
    return this.parseDecisionFile(fullPath)
  }

  private generateSlug(title: string): string {
    let slug = title
      .toLowerCase()
      .replace(/[\u4e00-\u9fff]/g, (ch) => {
        const code = ch.charCodeAt(0)
        return `u${code.toString(16)}`
      })
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')

    if (slug.length > SLUG_MAX_LENGTH) {
      slug = slug.slice(0, SLUG_MAX_LENGTH)
    }

    return slug || 'decision'
  }

  private async resolveUniqueFileName(dir: string, dateStr: string, slug: string): Promise<string> {
    const baseName = `${dateStr}-${slug}`
    let fileName = `${baseName}.md`
    let counter = 2

    let exists = await this
      .safeAccess(path.join(dir, fileName))
      .then(() => true)
      .catch(() => false)
    while (exists) {
      fileName = `${baseName}-${counter}.md`
      counter++
      exists = await this
        .safeAccess(path.join(dir, fileName))
        .then(() => true)
        .catch(() => false)
    }

    return fileName
  }

  private renderMarkdown(
    fm: {
      id: string
      title: string
      status: DecisionStatus
      decided_at: string
      decided_by: string[]
      tags: string[]
      related_files: string[]
    },
    input: CreateDecisionInput,
  ): string {
    const optionsMd = input.options
      .map(
        (opt: DecisionOption) =>
          `### ${opt.name}\n${opt.pros ? `- 优势: ${opt.pros}\n` : ''}${opt.cons ? `- 劣势: ${opt.cons}\n` : ''}${opt.risks ? `- 风险: ${opt.risks}\n` : ''}`,
      )
      .join('\n')

    return `---
id: ${fm.id}
title: ${fm.title}
status: ${fm.status}
decided_at: ${fm.decided_at}
decided_by: [${fm.decided_by.join(', ')}]
tags: [${fm.tags.join(', ')}]
related_files: [${fm.related_files.join(', ')}]
---

# ${fm.title}

## 问题
${input.problem}

## 选项
${optionsMd}

## 决策
**选择: ${input.chosen}**

## 理由
${input.reason}

## 实际结果
<!-- 上线后回填 -->
`
  }

  private async atomicWriteFile(filePath: string, content: string): Promise<void> {
    const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`
    await fs.promises.writeFile(tmpPath, content, 'utf-8')
    await fs.promises.rename(tmpPath, filePath)
  }

  private async parseDecisionFile(fullPath: string): Promise<DecisionLog | null> {
    const content = await this.safeReadFile(fullPath)
    if (!content) return null

    const fm = this.parseFrontmatter(content)
    if (!fm) return null

    const sections = this.extractSections(content)

    const relativePath = path.relative(this.workspaceRoot, fullPath)
    const stat = await fs.promises.stat(fullPath).catch(() => null)

    return {
      id: fm.id ?? '',
      title: fm.title ?? '',
      status: (fm.status as DecisionStatus) ?? 'decided',
      decidedAt: fm.decided_at ?? '',
      decidedBy: Array.isArray(fm.decided_by) ? fm.decided_by : [],
      tags: Array.isArray(fm.tags) ? fm.tags : [],
      relatedFiles: Array.isArray(fm.related_files) ? fm.related_files : [],
      problem: sections.problem ?? '',
      options: sections.options ?? [],
      chosen: sections.chosen ?? '',
      reason: sections.reason ?? '',
      actualResult: sections.actualResult,
      filePath: relativePath,
      updatedAt: stat?.mtimeMs ?? 0,
    }
  }

  private parseFrontmatter(
    content: string,
  ): Record<string, unknown> | null {
    const match = content.match(/^---\n([\s\S]*?)\n---/)
    if (!match) return null

    const yaml = match[1]
    const result: Record<string, unknown> = {}

    for (const line of yaml.split('\n')) {
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue
      const key = line.slice(0, colonIdx).trim()
      let value: unknown = line.slice(colonIdx + 1).trim()

      if (typeof value === 'string') {
        if (value.startsWith('[') && value.endsWith(']')) {
          const inner = value.slice(1, -1).trim()
          value = inner.length === 0 ? [] : inner.split(',').map((s) => s.trim())
        }
      }

      result[key] = value
    }

    return result
  }

  private extractSections(content: string): {
    problem: string | null
    options: DecisionOption[] | null
    chosen: string | null
    reason: string | null
    actualResult: string | undefined
  } {
    const sectionRegex = /^## (.+)$/gm
    const sectionIndices: Array<{ title: string; index: number }> = []
    let m: RegExpExecArray | null

    while ((m = sectionRegex.exec(content)) !== null) {
      sectionIndices.push({ title: m[1].trim(), index: m.index })
    }

    const getSectionContent = (title: string): string | null => {
      const idx = sectionIndices.findIndex((s) => s.title === title)
      if (idx === -1) return null
      const start = sectionIndices[idx].index + sectionIndices[idx].title.length + 3
      const end = idx + 1 < sectionIndices.length ? sectionIndices[idx + 1].index : content.length
      return content.slice(start, end).trim()
    }

    const problem = getSectionContent('问题')

    const optionsRaw = getSectionContent('选项')
    let options: DecisionOption[] | null = null
    if (optionsRaw) {
      const optionBlocks = optionsRaw.split(/^### /m).filter((b) => b.trim())
      options = optionBlocks.map((block) => {
        const lines = block.split('\n')
        const name = lines[0]?.trim() ?? ''
        let pros: string | undefined
        let cons: string | undefined
        let risks: string | undefined
        for (const line of lines.slice(1)) {
          const trimmed = line.trim()
          if (trimmed.startsWith('- 优势:') || trimmed.startsWith('- 优势：')) {
            pros = trimmed.replace(/^-\s*优势[:：]\s*/, '')
          } else if (trimmed.startsWith('- 劣势:') || trimmed.startsWith('- 劣势：')) {
            cons = trimmed.replace(/^-\s*劣势[:：]\s*/, '')
          } else if (trimmed.startsWith('- 风险:') || trimmed.startsWith('- 风险：')) {
            risks = trimmed.replace(/^-\s*风险[:：]\s*/, '')
          }
        }
        return { name, pros, cons, risks }
      })
    }

    const chosenRaw = getSectionContent('决策')
    const chosen = chosenRaw?.replace(/^\*\*选择:\s*/, '').replace(/\*\*$/, '').trim() ?? null

    const reason = getSectionContent('理由')

    const actualRaw = getSectionContent('实际结果')
    const actualResult = actualRaw && !actualRaw.startsWith('<!--') ? actualRaw : undefined

    return { problem, options, chosen, reason, actualResult }
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  private async safeReadDir(dir: string): Promise<string[]> {
    try {
      return await fs.promises.readdir(dir)
    } catch {
      return []
    }
  }

  private async safeReadFile(fullPath: string): Promise<string | null> {
    try {
      return await fs.promises.readFile(fullPath, 'utf-8')
    } catch {
      return null
    }
  }

  private safeAccess(fullPath: string): Promise<void> {
    return fs.promises.access(fullPath)
  }
}
