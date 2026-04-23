import type { FileManager } from '../file-manager'
import type { CommandRegistry } from './command-registry'
import type { CommandParam, SlashCommandTemplate } from '../../../shared/types'
import type { Command } from './types'
import { logger } from '../../utils/logger'

export class SlashCommandLoader {
  constructor(
    private readonly registry: CommandRegistry,
    private readonly fileManager: FileManager,
  ) {}

  async loadBuiltin(builtinDir: string): Promise<void> {
    await this.loadFromDir(builtinDir)
  }

  async loadUser(userDir: string): Promise<void> {
    await this.loadFromDir(userDir)
  }

  private async loadFromDir(dir: string): Promise<void> {
    let files: Array<{ path: string; isDirectory: boolean }>
    try {
      files = await this.fileManager.listFiles(dir, { recursive: false })
    } catch {
      return
    }

    for (const file of files) {
      if (file.isDirectory || !file.path.endsWith('.md')) continue

      try {
        const result = await this.fileManager.readFile(file.path)
        const parsed = this.parseSlashCommandFile(result.content, file.path)
        if (parsed) {
          this.registerCommand(parsed)
        }
      } catch (error) {
        logger.warn('[SlashCommandLoader] Failed to load command', {
          path: file.path,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  private parseSlashCommandFile(
    content: string,
    filePath: string,
  ): SlashCommandTemplate | null {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
    if (!match) return null

    const frontmatterRaw = match[1]
    const body = match[2].trim()

    const fm: Record<string, unknown> = {}
    for (const line of frontmatterRaw.split('\n')) {
      const colonIdx = line.indexOf(':')
      if (colonIdx < 0) continue

      const key = line.slice(0, colonIdx).trim()
      const value = line.slice(colonIdx + 1).trim()
      fm[key] = this.parseValue(value)
    }

    const id = fm.id as string | undefined
    if (!id) return null

    let params: CommandParam[] | undefined
    if (fm.params && Array.isArray(fm.params)) {
      params = fm.params as CommandParam[]
    }

    return {
      id,
      name: (fm.name as string) ?? id,
      description: (fm.description as string) ?? '',
      aliases: Array.isArray(fm.aliases) ? (fm.aliases as string[]) : undefined,
      params,
      promptTemplate: body,
    }
  }

  private registerCommand(template: SlashCommandTemplate): void {
    const command: Command = {
      id: template.id,
      title: template.name,
      category: 'slash',
      keywords: [template.name, template.id],
      isSlashCommand: true,
      aliases: template.aliases,
      params: template.params,
      promptTemplate: template.promptTemplate,
      execute: async () => {
        // Slash commands are not executed directly;
        // they are parsed and their promptTemplate is injected
      },
    }

    try {
      this.registry.registerOrReplace(command)
      logger.info('[SlashCommandLoader] Registered slash command', {
        id: template.id,
        aliases: template.aliases,
      })
    } catch {
      logger.warn('[SlashCommandLoader] Command already registered', {
        id: template.id,
      })
    }
  }

  private parseValue(value: string): unknown {
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim()
      if (!inner) return []
      return inner.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''))
    }
    if (value === 'true') return true
    if (value === 'false') return false
    if (/^\d+$/.test(value)) return parseInt(value, 10)
    return value.replace(/^["']|["']$/g, '')
  }
}
