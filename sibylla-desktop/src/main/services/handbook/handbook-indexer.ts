import crypto from 'crypto'
import type { DatabaseManager } from '../database-manager'
import type { HandbookEntry } from './types'
import { logger } from '../../utils/logger'

export class HandbookIndexer {
  constructor(
    private dbManager: DatabaseManager,
  ) {}

  async indexEntries(entries: readonly HandbookEntry[]): Promise<void> {
    for (const entry of entries) {
      try {
        const ftsPath = `handbook/${entry.language}/${entry.path}`
        const indexContent = `${entry.title}\n\n${entry.content}\n\n${entry.tags.join(' ')} ${entry.keywords.join(' ')}`
        this.dbManager.indexFileContent(ftsPath, indexContent)
      } catch (error) {
        logger.warn('handbook.index.failed', {
          id: entry.id,
          language: entry.language,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  async removeEntries(entries: readonly HandbookEntry[]): Promise<void> {
    for (const entry of entries) {
      try {
        const ftsPath = `handbook/${entry.language}/${entry.path}`
        this.dbManager.removeFileIndex(ftsPath)
      } catch (error) {
        logger.warn('handbook.remove.failed', {
          id: entry.id,
          language: entry.language,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 12)
  }
}
