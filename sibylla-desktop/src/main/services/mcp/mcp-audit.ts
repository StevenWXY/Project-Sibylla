import * as fs from 'fs'
import * as path from 'path'
import type { MCPAuditEntry } from './types'
import { logger } from '../../utils/logger'

const SENSITIVE_KEY_PATTERNS = [
  /\btoken$/i,
  /\bpassword$/i,
  /\bsecret$/i,
  /\bapi[-_]?key$/i,
  /\bauth$/i,
  /\bcredential$/i,
  /\bprivate[-_]?key$/i,
]

export class MCPAuditLog {
  private enabled: boolean

  constructor(
    private readonly logPath: string,
    enabled: boolean,
  ) {
    this.enabled = enabled
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  async record(entry: MCPAuditEntry): Promise<void> {
    if (!this.enabled) return

    try {
      const dir = path.dirname(this.logPath)
      await fs.promises.mkdir(dir, { recursive: true })

      const sanitizedArgs = typeof entry.args === 'string'
        ? this.sanitizeArgsJson(entry.args)
        : '[]'

      const sanitizedEntry: MCPAuditEntry = {
        ...entry,
        args: sanitizedArgs,
      }

      const line = JSON.stringify(sanitizedEntry) + '\n'
      await fs.promises.appendFile(this.logPath, line, 'utf-8')
    } catch (err) {
      logger.error('[MCPAuditLog] Failed to record entry', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  sanitizeArgs(args: Record<string, unknown>): string {
    const sanitized = this.sanitizeObject(args)
    return JSON.stringify(sanitized)
  }

  sanitizeArgsJson(argsJson: string): string {
    try {
      const parsed = JSON.parse(argsJson) as Record<string, unknown>
      return this.sanitizeArgs(parsed)
    } catch {
      return '[]'
    }
  }

  async query(filter: {
    serverName?: string
    since?: number
    limit?: number
  }): Promise<MCPAuditEntry[]> {
    if (!fs.existsSync(this.logPath)) return []

    const effectiveLimit = Math.min(filter.limit ?? 1000, 5000)

    try {
      const content = await fs.promises.readFile(this.logPath, 'utf-8')
      const lines = content.trim().split('\n').filter(Boolean)

      const entries: MCPAuditEntry[] = []
      const startIdx = Math.max(0, lines.length - effectiveLimit)
      for (let i = startIdx; i < lines.length; i++) {
        try {
          const entry = JSON.parse(lines[i]!) as MCPAuditEntry
          entries.push(entry)
        } catch {
          // skip malformed lines
        }
      }

      let filtered = entries
      if (filter.serverName) {
        filtered = filtered.filter(e => e.serverName === filter.serverName)
      }
      if (filter.since) {
        filtered = filtered.filter(e => e.timestamp >= filter.since!)
      }

      filtered.sort((a, b) => b.timestamp - a.timestamp)

      if (filter.limit) {
        filtered = filtered.slice(0, filter.limit)
      }

      return filtered
    } catch (err) {
      logger.error('[MCPAuditLog] Failed to query', {
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }

  private sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_KEY_PATTERNS.some(p => p.test(key))) {
        result[key] = '***'
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        result[key] = this.sanitizeObject(value as Record<string, unknown>)
      } else {
        result[key] = value
      }
    }
    return result
  }
}
