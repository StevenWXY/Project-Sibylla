import { promises as fs } from 'fs'
import * as path from 'path'
import { logger } from '../../utils/logger'
import {
  type EvolutionEvent,
  type EvolutionEventType,
  type MemorySection,
  type MemoryEntry,
  CHANGELOG_HEADER,
} from './types'

const MEMORY_DIR = '.sibylla/memory'
const CHANGELOG_FILE = 'CHANGELOG.md'
const CHANGELOG_GLOB = /^CHANGELOG-\d{4}-\d{2}\.md$/

const VALID_EVOLUTION_TYPES = new Set<string>([
  'add', 'update', 'merge', 'archive', 'delete', 'manual-edit', 'lock', 'unlock',
])

export class EvolutionLog {
  private readonly MAX_ENTRIES_PER_FILE = 5000

  constructor(
    private readonly workspaceRoot: string,
    private readonly loggerInstance: typeof logger = logger,
  ) {}

  async append(event: EvolutionEvent): Promise<void> {
    try {
      const logPath = await this.getCurrentLogPath()
      const formatted = this.formatEvent(event)
      await fs.appendFile(logPath, formatted + '\n', 'utf-8')
    } catch (err) {
      this.loggerInstance.error('memory.evolution.append.failed', {
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }

  async query(filter: {
    entryId?: string
    type?: EvolutionEventType
    since?: string
    limit?: number
  }): Promise<EvolutionEvent[]> {
    const allFiles = await this.getAllChangelogFiles()
    const results: EvolutionEvent[] = []

    for (const filePath of allFiles) {
      let content: string
      try {
        content = await fs.readFile(filePath, 'utf-8')
      } catch {
        continue
      }

      const blocks = this.splitEventBlocks(content)
      for (const block of blocks) {
        const event = this.parseEvent(block)
        if (!event) continue

        if (filter.entryId && event.entryId !== filter.entryId) continue
        if (filter.type && event.type !== filter.type) continue
        if (filter.since && event.timestamp < filter.since) continue

        results.push(event)
      }
    }

    results.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

    if (filter.limit && filter.limit > 0) {
      return results.slice(0, filter.limit)
    }

    return results
  }

  private async getCurrentLogPath(): Promise<string> {
    const dirPath = path.join(this.workspaceRoot, MEMORY_DIR)
    const logPath = path.join(dirPath, CHANGELOG_FILE)

    const exists = await this.fileExists(logPath)
    if (!exists) {
      await fs.mkdir(dirPath, { recursive: true })
      await fs.writeFile(logPath, CHANGELOG_HEADER, 'utf-8')
      return logPath
    }

    const count = await this.countEntries(logPath)
    if (count >= this.MAX_ENTRIES_PER_FILE) {
      await this.rotateLog(logPath, dirPath)
    }

    return logPath
  }

  private async rotateLog(currentPath: string, dirPath: string): Promise<void> {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const rotatedName = `CHANGELOG-${year}-${month}.md`
    const rotatedPath = path.join(dirPath, rotatedName)

    const rotatedExists = await this.fileExists(rotatedPath)
    if (rotatedExists) {
      const currentContent = await fs.readFile(currentPath, 'utf-8')
      const headerlessContent = this.stripHeader(currentContent)
      await fs.appendFile(rotatedPath, headerlessContent, 'utf-8')
    } else {
      await fs.rename(currentPath, rotatedPath)
    }

    await fs.writeFile(currentPath, CHANGELOG_HEADER, 'utf-8')
  }

  private stripHeader(content: string): string {
    const headerEnd = content.indexOf('\n---\n')
    if (headerEnd === -1) return content
    return content.slice(headerEnd + 5)
  }

  private formatEvent(event: EvolutionEvent): string {
    const lines: string[] = []
    lines.push(`## ${event.timestamp} — ${event.type} — ${event.entryId}`)
    lines.push('')
    lines.push(`- **Section:** ${event.section}`)

    const triggerText = event.trigger.checkpointId
      ? `${event.trigger.source} (${event.trigger.checkpointId})`
      : event.trigger.source
    lines.push(`- **Trigger:** ${triggerText}`)

    if (event.rationale) {
      lines.push(`- **Rationale:** ${event.rationale}`)
    }

    if (event.before) {
      lines.push('')
      lines.push('### Before')
      lines.push('```json')
      lines.push(JSON.stringify(event.before, null, 2))
      lines.push('```')
    }

    if (event.after) {
      lines.push('')
      lines.push('### After')
      lines.push('```json')
      lines.push(JSON.stringify(event.after, null, 2))
      lines.push('```')
    }

    lines.push('')
    lines.push('---')

    return lines.join('\n')
  }

  private parseEvent(block: string): EvolutionEvent | null {
    try {
      const headerMatch = block.match(/^##\s+(\S+)\s+—\s+(\S+)\s+—\s+(\S+)/)
      if (!headerMatch) {
        this.loggerInstance.warn('memory.evolution.parse.malformed', { reason: 'header parse failed' })
        return null
      }

      const timestamp = headerMatch[1]
      const rawType = headerMatch[2]
      if (!VALID_EVOLUTION_TYPES.has(rawType)) {
        this.loggerInstance.warn('memory.evolution.parse.malformed', { reason: `invalid type: ${rawType}` })
        return null
      }
      const type = rawType as EvolutionEventType
      const entryId = headerMatch[3]

      const sectionMatch = block.match(/- \*\*Section:\*\*\s+(\S+)/)
      const section = (sectionMatch?.[1] ?? 'project_convention') as MemorySection

      const triggerMatch = block.match(/- \*\*Trigger:\*\*\s+(\S+)(?:\s+\(([^)]+)\))?/)
      const triggerSource = (triggerMatch?.[1] ?? 'checkpoint') as EvolutionEvent['trigger']['source']
      const checkpointId = triggerMatch?.[2]

      const rationaleMatch = block.match(/- \*\*Rationale:\*\*\s+(.+)/)
      const rationale = rationaleMatch?.[1]

      const before = this.extractJsonBlock(block, 'Before')
      const after = this.extractJsonBlock(block, 'After')

      const idMatch = block.match(/<!--\s*eventId:\s*(\S+)\s*-->/)

      return {
        id: idMatch?.[1] ?? `ev-${timestamp}-${entryId}`,
        timestamp,
        type,
        entryId,
        section,
        before: before ?? undefined,
        after: after ?? undefined,
        trigger: {
          source: triggerSource,
          checkpointId: checkpointId ?? undefined,
        },
        rationale: rationale ?? undefined,
      }
    } catch (err) {
      this.loggerInstance.warn('memory.evolution.parse.malformed', {
        err: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  private extractJsonBlock(block: string, heading: string): Partial<MemoryEntry> | null {
    const pattern = '### ' + heading + '\\n```json\\n([\\s\\S]*?)\\n```'
    const regex = new RegExp(pattern)
    const match = block.match(regex)
    if (!match) return null
    try {
      return JSON.parse(match[1]) as Partial<MemoryEntry>
    } catch {
      return null
    }
  }

  private splitEventBlocks(content: string): string[] {
    const blocks: string[] = []
    const headerRegex = /^## \S+ — \S+ — \S+/m
    const lines = content.split('\n')
    let currentBlock: string[] = []
    let inBlock = false

    for (const line of lines) {
      if (headerRegex.test(line)) {
        if (inBlock && currentBlock.length > 0) {
          blocks.push(currentBlock.join('\n'))
        }
        currentBlock = [line]
        inBlock = true
      } else if (inBlock) {
        currentBlock.push(line)
      }
    }

    if (inBlock && currentBlock.length > 0) {
      blocks.push(currentBlock.join('\n'))
    }

    return blocks
  }

  private async countEntries(filePath: string): Promise<number> {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const matches = content.match(/^## \S+ — \S+ — \S+/gm)
      return matches?.length ?? 0
    } catch {
      return 0
    }
  }

  private async getAllChangelogFiles(): Promise<string[]> {
    const dirPath = path.join(this.workspaceRoot, MEMORY_DIR)

    let files: string[]
    try {
      files = await fs.readdir(dirPath)
    } catch {
      return []
    }

    const changelogFiles: string[] = []

    const currentPath = path.join(dirPath, CHANGELOG_FILE)
    if (await this.fileExists(currentPath)) {
      changelogFiles.push(currentPath)
    }

    const rotatedFiles = files
      .filter((f) => CHANGELOG_GLOB.test(f))
      .sort()
      .reverse()
      .map((f) => path.join(dirPath, f))

    changelogFiles.push(...rotatedFiles)

    return changelogFiles
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }
}
