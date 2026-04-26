/**
 * SyncDataTransformer — Converts MCP tool JSON results to Markdown.
 *
 * Supports built-in templates for common data sources:
 * - github-issues: GitHub issue list
 * - github-prs: GitHub pull request list
 * - slack-messages: Slack channel messages
 * - generic-list: Universal JSON → Markdown list (fallback)
 *
 * Also resolves target path templates with date variables (YYYY/MM/DD).
 *
 * @see specs/tasks/phase1/phase1-task043_mcp-continuous-sync.md — Step 3
 */

/** Max recursion depth for generic list transformation */
const MAX_GENERIC_DEPTH = 3

export class SyncDataTransformer {
  /**
   * Transform raw MCP tool result data to Markdown.
   *
   * @param rawData - The raw data from MCPClient.callTool()
   * @param template - Transform template identifier
   * @returns Formatted Markdown string
   */
  transform(rawData: unknown, template?: string): string {
    if (rawData === null || rawData === undefined) return ''

    if (!template || template === 'generic-list') {
      return this.transformGenericList(rawData)
    }

    switch (template) {
      case 'github-issues':
        return this.transformGitHubIssues(rawData)
      case 'github-prs':
        return this.transformGitHubPRs(rawData)
      case 'slack-messages':
        return this.transformSlackMessages(rawData)
      default:
        return this.transformGenericList(rawData)
    }
  }

  /**
   * Resolve target path template variables.
   * Replaces YYYY, MM, DD with current date values.
   *
   * @example
   * resolveTargetPath('docs/logs/slack/YYYY-MM-DD.md', new Date('2026-04-26'))
   * // => 'docs/logs/slack/2026-04-26.md'
   */
  resolveTargetPath(template: string, now: Date): string {
    return template
      .replace(/YYYY/g, String(now.getFullYear()))
      .replace(/MM/g, String(now.getMonth() + 1).padStart(2, '0'))
      .replace(/DD/g, String(now.getDate()).padStart(2, '0'))
  }

  // ─── Built-in Transform Templates ───

  /**
   * Transform GitHub issues data to Markdown list.
   *
   * Expected input: { items: [{ number, title, state, html_url, updated_at, labels }] }
   */
  private transformGitHubIssues(data: unknown): string {
    const items = this.extractArray(data, 'items')
    if (items.length === 0) return ''

    const lines: string[] = ['# GitHub Issues', '']

    for (const item of items) {
      const record = item as Record<string, unknown>
      const number = record.number ?? ''
      const title = record.title ?? ''
      const state = record.state ?? ''
      const url = record.html_url ?? ''
      const labels = Array.isArray(record.labels)
        ? (record.labels as Array<Record<string, unknown>>).map(l => l.name ?? l).join(', ')
        : ''

      let line = `- #${number} ${title} [${state}]`
      if (url) line += ` ${url}`
      if (labels) line += `\n  Labels: ${labels}`

      lines.push(line)
    }

    return lines.join('\n')
  }

  /**
   * Transform GitHub pull requests data to Markdown list.
   *
   * Expected input: { items: [{ number, title, state, author, html_url, updated_at }] }
   */
  private transformGitHubPRs(data: unknown): string {
    const items = this.extractArray(data, 'items')
    if (items.length === 0) return ''

    const lines: string[] = ['# Pull Requests', '']

    for (const item of items) {
      const record = item as Record<string, unknown>
      const number = record.number ?? ''
      const title = record.title ?? ''
      const state = record.state ?? ''
      const author = record.author ?? record.user
      const authorName = typeof author === 'object' && author !== null
        ? (author as Record<string, unknown>).login ?? ''
        : author ?? ''
      const url = record.html_url ?? ''

      let line = `- #${number} ${title} [${state}]`
      if (authorName) line += ` @${authorName}`
      if (url) line += ` ${url}`

      lines.push(line)
    }

    return lines.join('\n')
  }

  /**
   * Transform Slack messages data to Markdown.
   * Groups messages by channel with timestamps.
   *
   * Expected input: { messages: [{ user, text, ts, channel }] }
   */
  private transformSlackMessages(data: unknown): string {
    const messages = this.extractArray(data, 'messages')
    if (messages.length === 0) return ''

    // Group by channel
    const byChannel = new Map<string, Array<Record<string, unknown>>>()
    for (const msg of messages) {
      const record = msg as Record<string, unknown>
      const channel = String(record.channel ?? 'general')
      const existing = byChannel.get(channel) ?? []
      existing.push(record)
      byChannel.set(channel, existing)
    }

    const lines: string[] = []

    for (const [channel, channelMessages] of byChannel) {
      // Derive date from first message's timestamp, fallback to current date
      const firstTs = channelMessages[0]?.ts
      const headerDate = typeof firstTs === 'number'
        ? this.formatDate(new Date(firstTs * 1000))
        : typeof firstTs === 'string' && !isNaN(parseFloat(firstTs))
          ? this.formatDate(new Date(parseFloat(firstTs) * 1000))
          : this.formatDate(new Date())
      lines.push(`## #${channel} — ${headerDate}`, '')

      for (const msg of channelMessages) {
        const user = msg.user ?? 'unknown'
        const text = msg.text ?? ''
        const ts = msg.ts
        const time = typeof ts === 'number'
          ? this.formatTime(new Date(ts * 1000))
          : typeof ts === 'string'
            ? this.formatTime(new Date(parseFloat(ts) * 1000))
            : ''

        lines.push(`> **@${user}**${time ? ` (${time})` : ''}: ${text}`)
      }

      lines.push('')
    }

    return lines.join('\n').trimEnd()
  }

  /**
   * Generic JSON → Markdown list transformation.
   * Recursively expands nested objects up to MAX_GENERIC_DEPTH levels.
   */
  private transformGenericList(data: unknown, depth: number = 0): string {
    if (depth >= MAX_GENERIC_DEPTH) {
      return typeof data === 'object' ? JSON.stringify(data) : String(data ?? '')
    }

    if (data === null || data === undefined) return ''

    if (typeof data === 'string') return data

    if (typeof data === 'number' || typeof data === 'boolean') {
      return String(data)
    }

    if (Array.isArray(data)) {
      if (data.length === 0) return ''
      return data.map(item => {
        const content = this.transformGenericList(item, depth + 1)
        return `- ${content}`
      }).join('\n')
    }

    if (typeof data === 'object') {
      const record = data as Record<string, unknown>
      const entries = Object.entries(record)
      if (entries.length === 0) return ''

      // Special case: if has 'text' field, return it directly
      if (typeof record.text === 'string') return record.text

      // Special case: if has 'items', 'messages', or 'data' array, recurse
      for (const key of ['items', 'messages', 'data']) {
        if (Array.isArray(record[key])) {
          return this.transformGenericList(record[key], depth)
        }
      }

      const indent = '  '.repeat(depth)
      return entries.map(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          const nested = this.transformGenericList(value, depth + 1)
          return `${indent}- **${key}**:\n${nested}`
        }
        return `${indent}- **${key}**: ${String(value ?? '')}`
      }).join('\n')
    }

    return String(data)
  }

  // ─── Helpers ───

  /**
   * Safely extract an array from data by key name.
   */
  private extractArray(data: unknown, key: string): unknown[] {
    if (typeof data !== 'object' || data === null) return []
    const record = data as Record<string, unknown>
    if (Array.isArray(record[key])) return record[key] as unknown[]
    // Fallback: if data itself is an array
    if (Array.isArray(data)) return data
    return []
  }

  /**
   * Format date as YYYY-MM-DD.
   */
  private formatDate(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  /**
   * Format time as HH:mm.
   */
  private formatTime(date: Date): string {
    if (isNaN(date.getTime())) return ''
    const h = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    return `${h}:${min}`
  }
}
