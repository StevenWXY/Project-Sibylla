import { dialog } from 'electron'
import type { Tracer } from '../trace/tracer'
import type { Span } from '../trace/types'
import type { Command, CommandExecutionRecord } from './types'

export class CommandRegistry {
  private readonly commands: Map<string, Command> = new Map()
  private readonly recentExecutions: CommandExecutionRecord[] = []
  private readonly MAX_RECENT = 50

  constructor(
    private readonly tracer: Tracer,
  ) {}

  register(command: Command): void {
    if (this.commands.has(command.id)) {
      throw new Error(`Command already registered: ${command.id}`)
    }
    this.commands.set(command.id, command)
  }

  unregister(id: string): void {
    this.commands.delete(id)
  }

  async search(query: string, language?: string): Promise<Command[]> {
    const allCommands = Array.from(this.commands.values())
    const available = await this.filterByPredicate(allCommands)

    if (!query.trim()) {
      return this.rankByRecency(available)
    }

    return this.fuzzyMatch(available, query, language ?? 'en')
  }

  async execute(id: string): Promise<void> {
    const cmd = this.commands.get(id)
    if (!cmd) {
      throw new Error(`Command not found: ${id}`)
    }

    if (cmd.requiresConfirmation) {
      const confirmed = await this.showConfirm(cmd.requiresConfirmation)
      if (!confirmed) return
    }

    await this.tracer.withSpan(
      'command.execute',
      async (span: Span) => {
        span.setAttributes({
          'command.id': cmd.id,
          'command.category': cmd.category,
        })
        await cmd.execute()
      },
      { kind: 'internal' },
    )

    this.recordExecution(id)
  }

  getAll(): Command[] {
    return Array.from(this.commands.values())
  }

  getRecentCommands(limit?: number): CommandExecutionRecord[] {
    return this.recentExecutions.slice(0, limit ?? this.MAX_RECENT)
  }

  private async filterByPredicate(commands: Command[]): Promise<Command[]> {
    const results: Command[] = []
    for (const cmd of commands) {
      try {
        const available = cmd.predicate ? await cmd.predicate() : true
        if (available) {
          results.push(cmd)
        }
      } catch {
        // predicate error → include command anyway
        results.push(cmd)
      }
    }
    return results
  }

  private rankByRecency(commands: Command[]): Command[] {
    return [...commands].sort((a, b) => {
      const aIdx = this.recentExecutions.findIndex(r => r.commandId === a.id)
      const bIdx = this.recentExecutions.findIndex(r => r.commandId === b.id)
      const aBonus = aIdx >= 0 ? Math.max(0, 20 - aIdx) : 0
      const bBonus = bIdx >= 0 ? Math.max(0, 20 - bIdx) : 0
      return bBonus - aBonus
    })
  }

  private fuzzyMatch(commands: Command[], query: string, language: string): Command[] {
    const lowerQuery = query.toLowerCase()

    const scored = commands.map(cmd => {
      let score = 0
      const title = cmd.titleI18n?.[language] ?? cmd.title
      const lowerTitle = title.toLowerCase()

      if (lowerTitle.startsWith(lowerQuery)) {
        score += 100
      } else if (lowerTitle.includes(lowerQuery)) {
        score += 50
      }

      if (cmd.keywords?.some(k => k.toLowerCase().includes(lowerQuery))) {
        score += 30
      }

      if (cmd.category.toLowerCase().includes(lowerQuery)) {
        score += 10
      }

      if (cmd.shortcut?.toLowerCase().includes(lowerQuery)) {
        score += 15
      }

      const recencyIndex = this.recentExecutions.findIndex(r => r.commandId === cmd.id)
      if (recencyIndex >= 0) {
        score += Math.max(0, 20 - recencyIndex)
      }

      return { command: cmd, score }
    })

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(s => s.command)
  }

  private recordExecution(id: string): void {
    this.recentExecutions.unshift({ commandId: id, executedAt: Date.now() })
    if (this.recentExecutions.length > this.MAX_RECENT) {
      this.recentExecutions.length = this.MAX_RECENT
    }
  }

  private async showConfirm(config: { message: string; destructive: boolean }): Promise<boolean> {
    const result = await dialog.showMessageBox({
      type: config.destructive ? 'warning' : 'question',
      title: config.destructive ? '确认破坏性操作' : '确认操作',
      message: config.message,
      buttons: ['取消', '确认'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })
    return result.response === 1
  }
}
