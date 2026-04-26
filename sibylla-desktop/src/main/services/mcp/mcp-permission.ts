import * as fs from 'fs'
import * as path from 'path'
import type { MCPPermissionEntry, MCPPermissionLevel } from './types'
import { logger } from '../../utils/logger'

const SENSITIVE_PATTERNS = [
  /^delete_/i,
  /^write_/i,
  /^transfer_/i,
  /^create_/i,
]

export class MCPPermission {
  private permissions = new Map<string, MCPPermissionEntry>()
  private readonly currentSessionId: string

  constructor(
    private readonly permissionsPath: string,
    private readonly sensitivePatterns: string[] = [],
    currentSessionId?: string,
  ) {
    this.currentSessionId = currentSessionId ?? `session-${Date.now()}`
  }

  async initialize(): Promise<void> {
    await this.loadPermissions()
    await this.cleanup()
  }

  checkPermission(serverName: string, toolName: string): MCPPermissionLevel | null {
    const key = this.makeKey(serverName, toolName)
    const entry = this.permissions.get(key)
    if (!entry) return null

    if (entry.level === 'once') {
      this.permissions.delete(key)
      return null
    }

    if (entry.level === 'session') {
      if (entry.grantedBySession !== this.currentSessionId) {
        this.permissions.delete(key)
        return null
      }
    }

    return entry.level
  }

  isSensitiveTool(_serverName: string, toolName: string): boolean {
    const allPatterns = [...SENSITIVE_PATTERNS]
    for (const pattern of this.sensitivePatterns) {
      try {
        allPatterns.push(new RegExp(pattern, 'i'))
      } catch {
        // ignore invalid patterns
      }
    }
    return allPatterns.some(p => p.test(toolName))
  }

  grantPermission(serverName: string, toolName: string, level: MCPPermissionLevel): void {
    if (this.isSensitiveTool(serverName, toolName) && level === 'permanent') {
      throw new Error(
        `Cannot permanently allow sensitive tool "${toolName}" on "${serverName}". ` +
        `Sensitive tools (delete_*/write_*/transfer_*/create_*) require per-call confirmation.`
      )
    }

    const key = this.makeKey(serverName, toolName)
    const entry: MCPPermissionEntry = {
      serverName,
      toolName,
      level,
      grantedAt: Date.now(),
      grantedBySession: level === 'session' ? this.currentSessionId : undefined,
    }

    this.permissions.set(key, entry)
    this.persistPermissions().catch((err) => {
      logger.warn('[MCPPermission] Failed to persist', {
        error: err instanceof Error ? err.message : String(err),
      })
    })
  }

  revokePermission(serverName: string, toolName: string): void {
    const key = this.makeKey(serverName, toolName)
    this.permissions.delete(key)
    this.persistPermissions().catch((err) => {
      logger.warn('[MCPPermission] Failed to persist after revoke', {
        error: err instanceof Error ? err.message : String(err),
      })
    })
  }

  revokeAll(serverName: string): void {
    for (const [key, entry] of this.permissions) {
      if (entry.serverName === serverName) {
        this.permissions.delete(key)
      }
    }
    this.persistPermissions().catch((err) => {
      logger.warn('[MCPPermission] Failed to persist after revokeAll', {
        error: err instanceof Error ? err.message : String(err),
      })
    })
  }

  async cleanup(): Promise<void> {
    let changed = false
    for (const [key, entry] of this.permissions) {
      if (entry.level === 'session' && entry.grantedBySession !== this.currentSessionId) {
        this.permissions.delete(key)
        changed = true
      }
    }
    if (changed) {
      await this.persistPermissions()
    }
  }

  private makeKey(serverName: string, toolName: string): string {
    return `${serverName}::${toolName}`
  }

  private async loadPermissions(): Promise<void> {
    try {
      if (fs.existsSync(this.permissionsPath)) {
        const content = await fs.promises.readFile(this.permissionsPath, 'utf-8')
        const entries = JSON.parse(content) as MCPPermissionEntry[]
        for (const entry of entries) {
          const key = this.makeKey(entry.serverName, entry.toolName)
          this.permissions.set(key, entry)
        }
      }
    } catch (err) {
      logger.warn('[MCPPermission] Failed to load permissions', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private async persistPermissions(): Promise<void> {
    try {
      const entries = [...this.permissions.values()]
        .filter(e => e.level === 'permanent' || e.level === 'deny')
      const dir = path.dirname(this.permissionsPath)
      await fs.promises.mkdir(dir, { recursive: true })
      await fs.promises.writeFile(this.permissionsPath, JSON.stringify(entries, null, 2), 'utf-8')
    } catch (err) {
      logger.error('[MCPPermission] Failed to persist permissions', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}
