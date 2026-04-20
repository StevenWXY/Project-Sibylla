import { promises as fs } from 'fs'
import * as path from 'path'
import { logger } from '../../utils/logger'
import type { LogEntry, HarnessTraceType } from './types'

const LOGS_DIR = '.sibylla/memory/logs'

export interface LogFilter {
  type?: string
  traceType?: HarnessTraceType
  since?: string
  details?: Record<string, unknown>
}

export class LogStore {
  private readonly workspaceRoot: string

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot
  }

  logsDir(): string {
    return path.join(this.workspaceRoot, LOGS_DIR)
  }

  async append(entry: LogEntry): Promise<void> {
    try {
      const timestamp = entry.timestamp ?? new Date().toISOString()
      const month = timestamp.slice(0, 7)
      const dirPath = this.logsDir()
      const filePath = path.join(dirPath, `${month}.jsonl`)

      await fs.mkdir(dirPath, { recursive: true })
      const line = JSON.stringify({ ...entry, timestamp }) + '\n'
      await fs.appendFile(filePath, line, 'utf-8')
    } catch (error) {
      logger.error('[LogStore] append() failed', {
        error: error instanceof Error ? error.message : String(error),
        entryId: entry.id,
      })
    }
  }

  async getSince(timestamp: string): Promise<LogEntry[]> {
    const dirPath = this.logsDir()

    let files: string[]
    try {
      files = await fs.readdir(dirPath)
    } catch {
      return []
    }

    const jsonlFiles = files
      .filter((f) => f.endsWith('.jsonl'))
      .sort()

    const sinceMonth = timestamp.slice(0, 7)
    const relevantFiles = jsonlFiles.filter((f) => {
      const fileMonth = f.replace('.jsonl', '')
      return fileMonth >= sinceMonth
    })

    const results: LogEntry[] = []

    for (const file of relevantFiles) {
      const filePath = path.join(dirPath, file)
      let content: string
      try {
        content = await fs.readFile(filePath, 'utf-8')
      } catch {
        continue
      }

      const lines = content.split('\n').filter((line) => line.trim().length > 0)
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as LogEntry
          if (entry.timestamp >= timestamp) {
            results.push(entry)
          }
        } catch {
          logger.warn('[LogStore] Skipping malformed JSONL line', { file, line: line.slice(0, 100) })
        }
      }
    }

    return results
  }

  async countByFilter(filter: LogFilter): Promise<number> {
    const dirPath = this.logsDir()

    let files: string[]
    try {
      files = await fs.readdir(dirPath)
    } catch {
      return 0
    }

    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'))

    let count = 0

    for (const file of jsonlFiles) {
      if (filter.since) {
        const fileMonth = file.replace('.jsonl', '')
        const sinceMonth = filter.since.slice(0, 7)
        if (fileMonth < sinceMonth) continue
      }

      const filePath = path.join(dirPath, file)
      let content: string
      try {
        content = await fs.readFile(filePath, 'utf-8')
      } catch {
        continue
      }

      const lines = content.split('\n').filter((line) => line.trim().length > 0)
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as LogEntry
          if (this.matchesFilter(entry, filter)) {
            count += 1
          }
        } catch {
          // skip malformed
        }
      }
    }

    return count
  }

  private matchesFilter(entry: LogEntry, filter: LogFilter): boolean {
    if (filter.type && entry.type !== filter.type) return false
    if (filter.traceType && entry.traceType !== filter.traceType) return false
    if (filter.since && entry.timestamp < filter.since) return false
    if (filter.details) {
      const entryDetails = entry.details ?? {}
      for (const [key, value] of Object.entries(filter.details)) {
        if (entryDetails[key] !== value) return false
      }
    }
    return true
  }
}
