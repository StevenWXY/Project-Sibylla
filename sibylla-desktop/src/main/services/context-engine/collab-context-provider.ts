import type { PresenceStore } from '../presence/presence-store'
import type { PrivacyFilter } from '../presence/privacy-filter'
import type { EventLogStore } from '../event-log-store'
import type { SibyllaEvent } from '../event-bus-types'
import type { ContextLayerV2 } from './types-v2'
import type { WorkspaceMember } from '../../../shared/types/member.types'
import { estimateTokens } from './token-utils'
import { COLLAB_KEYWORDS, ACTIVITY_WINDOW_MS } from '../presence/constants'
import { logger } from '../../utils/logger'

export interface CollabContext {
  layers: ContextLayerV2[]
  unresolvedReferences?: string[]
}

export class CollabContextProvider {
  private readonly presenceStore: PresenceStore
  private readonly eventLogStore: EventLogStore
  private readonly getMembers: () => Promise<WorkspaceMember[]>
  private readonly privacyFilter: PrivacyFilter
  private cachedMembers: WorkspaceMember[] = []
  private membersCacheTime = 0
  private static readonly MEMBERS_CACHE_TTL = 60000
  private static readonly collabKeywordPattern = new RegExp(
    Array.from(COLLAB_KEYWORDS).join('|'),
  )

  constructor(
    presenceStore: PresenceStore,
    eventLogStore: EventLogStore,
    getMembers: () => Promise<WorkspaceMember[]>,
    privacyFilter: PrivacyFilter,
  ) {
    this.presenceStore = presenceStore
    this.eventLogStore = eventLogStore
    this.getMembers = getMembers
    this.privacyFilter = privacyFilter
  }

  async shouldInject(userMessage: string): Promise<boolean> {
    if (CollabContextProvider.collabKeywordPattern.test(userMessage)) return true

    const members = await this.getFreshMembers()
    for (const member of members) {
      if (userMessage.includes(member.name)) return true
    }

    const atMentionPattern = /@(\S+)/g
    let match: RegExpExecArray | null
    while ((match = atMentionPattern.exec(userMessage)) !== null) {
      const mentioned = match[1]
      if (mentioned && members.some(m => m.name === mentioned)) return true
    }

    return false
  }

  async collect(
    userMessage: string,
    budget: number,
    forUserId?: string,
  ): Promise<CollabContext> {
    try {
      if (!this.presenceStore.isServiceAvailable()) {
        return { layers: [] }
      }

      const onlineMembers = this.presenceStore.getOnlineMembers()
      const memberLines = onlineMembers.map(peer =>
        `- ${peer.displayName} (${peer.status}${peer.viewingFile ? ', 查看: ' + peer.viewingFile : ''})`,
      )

      const since = Date.now() - ACTIVITY_WINDOW_MS
      const events = await this.queryRecentEvents(since)
      const activityLines = this.formatActivityEvents(events, forUserId)

      const members = await this.getFreshMembers()
      const filteredActivity = this.privacyFilter.filterActivityEvents(
        activityLines.map(line => ({
          content: line,
          filePath: undefined,
          userId: undefined,
        })),
        forUserId ?? '',
      )

      const allActivityLines = filteredActivity.map(e => e.content)

      let content = this.buildCollabContent(memberLines, allActivityLines)

      while (estimateTokens(content) > budget && allActivityLines.length > 1) {
        allActivityLines.shift()
        content = this.buildCollabContent(memberLines, allActivityLines)
      }

      const memberNames = members.map(m => m.name)
      const mentionedNames = this.extractMentionedNames(userMessage)
      const unresolvedReferences = mentionedNames.filter(n => !memberNames.includes(n))

      return {
        layers: [{
          type: 'collab',
          priority: 7,
          content,
          tokens: estimateTokens(content),
          sources: [
            ...onlineMembers.map(p => ({ kind: 'presence' as const, id: p.userId })),
            { kind: 'events' as const },
          ],
        }],
        unresolvedReferences: unresolvedReferences.length > 0 ? unresolvedReferences : undefined,
      }
    } catch (err) {
      logger.warn('[CollabContextProvider] collect failed, returning empty', {
        error: err instanceof Error ? err.message : String(err),
      })
      return { layers: [] }
    }
  }

  private async getFreshMembers(): Promise<WorkspaceMember[]> {
    const now = Date.now()
    if (now - this.membersCacheTime < CollabContextProvider.MEMBERS_CACHE_TTL && this.cachedMembers.length > 0) {
      return this.cachedMembers
    }
    try {
      this.cachedMembers = await this.getMembers()
      this.membersCacheTime = now
    } catch {
      return this.cachedMembers
    }
    return this.cachedMembers
  }

  private async queryRecentEvents(since: number): Promise<SibyllaEvent[]> {
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const allEvents = await this.eventLogStore.read(month)
    return allEvents.filter(e => {
      if (e.timestamp < since) return false
      const type = e.type as string
      return (
        type === 'file.updated' ||
        type === 'git.conflict-detected' ||
        type === 'presence.user-editing' ||
        type === 'presence.user-online' ||
        type === 'collab.conflict-detected'
      )
    })
  }

  private formatActivityEvents(events: SibyllaEvent[], _forUserId?: string): string[] {
    return events.map(e => {
      const payload = e.payload as Record<string, unknown> | undefined
      const actor = (payload?.userName as string) ?? '系统'
      const type = e.type as string
      const action =
        type === 'file.updated' ? '修改了' :
        type === 'git.conflict-detected' ? '遇到冲突' :
        type === 'presence.user-editing' ? '正在编辑' :
        type === 'presence.user-online' ? '上线了' :
        type === 'collab.conflict-detected' ? '遇到协作冲突' : '操作了'
      const target = (payload?.filePath as string) ?? (payload?.path as string) ?? ''
      const time = this.formatRelativeTime(e.timestamp)
      return `- ${actor} ${action} ${target} (${time})`
    })
  }

  private formatRelativeTime(timestamp: number): string {
    const diffMs = Date.now() - timestamp
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return '刚刚'
    if (diffMin < 60) return `${diffMin}分钟前`
    const diffHour = Math.floor(diffMin / 60)
    return `${diffHour}小时前`
  }

  private buildCollabContent(memberLines: string[], activityLines: string[]): string {
    const sections: string[] = ['## 团队协作上下文']
    if (memberLines.length > 0) {
      sections.push('### 在线成员')
      sections.push(...memberLines)
    }
    if (activityLines.length > 0) {
      sections.push('### 最近活动')
      sections.push(...activityLines)
    }
    return sections.join('\n')
  }

  extractMentionedNames(text: string): string[] {
    const names: string[] = []
    const atPattern = /@(\S+)/g
    let match: RegExpExecArray | null
    while ((match = atPattern.exec(text)) !== null) {
      if (match[1]) names.push(match[1])
    }

    const cjkPattern = /[\u4e00-\u9fff]{2,4}/g
    while ((match = cjkPattern.exec(text)) !== null) {
      if (match[0]) names.push(match[0])
    }

    return [...new Set(names)]
  }
}
