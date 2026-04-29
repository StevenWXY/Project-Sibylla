import type Database from 'better-sqlite3'
import type { FileManager } from '../file-manager'
import type { AppEventBus } from '../event-bus'
import type { EventPayloadMap } from '../event-bus-types'
import type { ExtractedLink } from './types'
import { logger } from '../../utils/logger'

const WIKI_LINK_REGEX = /\[\[([^\]]+)\]\]/g
const BROKEN_PREFIX = '__broken__:'

export class WikiLinksIndexer {
  private readonly db: Database.Database
  private readonly fileManager: FileManager
  private readonly eventBus: AppEventBus
  private readonly unsubscribers: Array<() => void> = []

  constructor(
    db: Database.Database,
    fileManager: FileManager,
    eventBus: AppEventBus,
  ) {
    this.db = db
    this.fileManager = fileManager
    this.eventBus = eventBus
    this.subscribeToEvents()
  }

  extractLinks(content: string): ExtractedLink[] {
    const links: ExtractedLink[] = []
    let match: RegExpExecArray | null

    const regex = new RegExp(WIKI_LINK_REGEX.source, 'g')
    while ((match = regex.exec(content)) !== null) {
      const inner = match[1].trim()
      if (inner.length === 0) continue

      const pipeIndex = inner.indexOf('|')
      const target = pipeIndex >= 0 ? inner.slice(0, pipeIndex).trim() : inner
      const text = pipeIndex >= 0 ? inner.slice(pipeIndex + 1).trim() : inner

      if (target.length === 0) continue

      links.push({
        target,
        text: text || target,
        position: match.index,
      })
    }

    return links
  }

  async rebuildIndexForFile(filePath: string): Promise<void> {
    if (!filePath.endsWith('.md')) return

    const startTime = Date.now()
    logger.info('[WikiLinksIndexer] Rebuilding index for file', { filePath })

    let content: string
    try {
      const result = await this.fileManager.readFile(filePath)
      content = result.content
    } catch (err: unknown) {
      logger.error('[WikiLinksIndexer] Failed to read file for indexing', {
        filePath,
        error: String(err),
      })
      return
    }

    const links = this.extractLinks(content)
    const now = new Date().toISOString()

    const rebuild = this.db.transaction(() => {
      this.db.prepare('DELETE FROM wiki_links WHERE source_path = ?').run(filePath)

      const insert = this.db.prepare(
        'INSERT INTO wiki_links (source_path, target_path, link_text, position, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      for (const link of links) {
        insert.run(filePath, link.target, link.text, link.position, now)
      }
    })

    rebuild()

    const duration = Date.now() - startTime
    logger.info('[WikiLinksIndexer] Index rebuilt for file', {
      filePath,
      linkCount: links.length,
      duration,
    })

    this.eventBus.emitEvent({
      type: 'wiki-links.updated',
      source: 'wiki-links-indexer',
      payload: { path: filePath },
    })
  }

  async handleRename(oldPath: string, newPath: string): Promise<void> {
    const affectedRows = this.db
      .prepare('SELECT DISTINCT source_path FROM wiki_links WHERE target_path = ?')
      .all(oldPath) as Array<{ source_path: string }>

    if (affectedRows.length === 0) return

    logger.info('[WikiLinksIndexer] Handling rename', {
      oldPath,
      newPath,
      affectedLinks: affectedRows.length,
    })

    const oldName = oldPath.split('/').pop() ?? oldPath
    const newName = newPath.split('/').pop() ?? newPath

    for (const row of affectedRows) {
      try {
        const result = await this.fileManager.readFile(row.source_path)
        const original = result.content
        const updated = original.replaceAll(`[[${oldPath}]]`, `[[${newPath}]]`)
        const updated2 = updated.replaceAll(`[[${oldPath}|`, `[[${newPath}|`)
        const updated3 = updated2.replaceAll(`[[${oldName}]]`, `[[${newName}]]`)
        const updated4 = updated3.replaceAll(`[[${oldName}|`, `[[${newName}|`)

        if (updated4 !== original) {
          await this.fileManager.writeFile(row.source_path, updated4)
          logger.info('[WikiLinksIndexer] Updated source file backlinks', {
            sourcePath: row.source_path,
          })
        }
      } catch (err) {
        logger.warn('[WikiLinksIndexer] Failed to update source file', {
          sourcePath: row.source_path,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    this.db.prepare(
      'UPDATE wiki_links SET target_path = ? WHERE target_path = ?',
    ).run(newPath, oldPath)

    this.eventBus.emitEvent({
      type: 'wiki-links.updated',
      source: 'wiki-links-indexer',
      payload: { path: newPath },
    })
  }

  markBroken(filePath: string): void {
    const likeBroken = BROKEN_PREFIX + '%'
    this.db.prepare(
      `UPDATE wiki_links SET target_path = '${BROKEN_PREFIX}' || target_path WHERE target_path = ? AND target_path NOT LIKE ?`,
    ).run(filePath, likeBroken)

    logger.info('[WikiLinksIndexer] Marked links as broken', { filePath })

    this.eventBus.emitEvent({
      type: 'wiki-links.updated',
      source: 'wiki-links-indexer',
      payload: { path: filePath },
    })
  }

  async rebuildAllIndex(): Promise<void> {
    const startTime = Date.now()
    logger.info('[WikiLinksIndexer] Starting full index rebuild')

    const files = await this.fileManager.listFiles('', { recursive: true })
    const mdFiles = files.filter((f) => f.name.endsWith('.md'))

    logger.info('[WikiLinksIndexer] Found markdown files to index', {
      count: mdFiles.length,
    })

    let indexed = 0
    let errors = 0

    for (const file of mdFiles) {
      try {
        await this.rebuildIndexForFile(file.path)
        indexed++
      } catch (err: unknown) {
        errors++
        logger.error('[WikiLinksIndexer] Failed to index file', {
          filePath: file.path,
          error: String(err),
        })
      }
    }

    const duration = Date.now() - startTime
    logger.info('[WikiLinksIndexer] Full index rebuild completed', {
      total: mdFiles.length,
      indexed,
      errors,
      duration,
    })
  }

  private subscribeToEvents(): void {
    const unsubUpdated = this.eventBus.subscribe<EventPayloadMap['file.updated']>(
      'file.updated',
      (event) => {
        void this.rebuildIndexForFile(event.payload.path)
      },
    )
    this.unsubscribers.push(unsubUpdated)

    const unsubDeleted = this.eventBus.subscribe<EventPayloadMap['file.deleted']>(
      'file.deleted',
      (event) => {
        this.markBroken(event.payload.path)
        this.db.prepare('DELETE FROM wiki_links WHERE source_path = ?').run(event.payload.path)
      },
    )
    this.unsubscribers.push(unsubDeleted)

    const unsubRenamed = this.eventBus.subscribe<EventPayloadMap['file.renamed']>(
      'file.renamed',
      (event) => {
        void this.handleRename(event.payload.oldPath, event.payload.newPath)
      },
    )
    this.unsubscribers.push(unsubRenamed)
  }

  destroy(): void {
    for (const unsub of this.unsubscribers) {
      unsub()
    }
    this.unsubscribers.length = 0
  }
}
