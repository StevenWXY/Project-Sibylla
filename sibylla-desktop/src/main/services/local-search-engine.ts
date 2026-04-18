import type { BrowserWindow } from 'electron'
import type { DatabaseManager } from './database-manager'
import type { FileManager } from './file-manager'
import type {
  FileWatchEvent,
  SearchQueryParams,
  SearchResult,
  SearchIndexStatus,
  SearchIndexProgress,
} from '../../shared/types'
import { IPC_CHANNELS } from '../../shared/types'

const INDEXABLE_EXTENSIONS = new Set([
  '.md', '.txt', '.markdown',
  '.json', '.yaml', '.yml', '.toml',
  '.csv',
  '.js', '.ts', '.tsx', '.jsx',
  '.css', '.scss', '.less',
  '.html', '.xml', '.svg',
])

const EXCLUDED_PATHS = [
  '.git/',
  'node_modules/',
  '.sibylla/index/',
  '.sibylla/memory/',
]

export class LocalSearchEngine {
  private dbManager: DatabaseManager
  private fileManager: FileManager
  private readonly workspacePath: string
  private sender: BrowserWindow | null = null
  private isInitialized = false

  constructor(
    dbManager: DatabaseManager,
    fileManager: FileManager,
    workspacePath: string,
  ) {
    this.dbManager = dbManager
    this.fileManager = fileManager
    this.workspacePath = workspacePath
  }

  async initialize(sender: BrowserWindow): Promise<void> {
    this.sender = sender

    if (!this.dbManager.checkIntegrity()) {
      console.warn('[LocalSearchEngine] Database integrity check failed, rebuilding')
      this.dbManager.clearAllIndexes()
    }

    await this.buildIndex()
    this.isInitialized = true
    console.log('[LocalSearchEngine] Initialized')
  }

  dispose(): void {
    this.sender = null
    this.isInitialized = false
  }

  search(params: SearchQueryParams): SearchResult[] {
    if (!this.isInitialized) {
      return []
    }

    const sanitizedQuery = this.sanitizeFTSQuery(params.query)
    if (!sanitizedQuery) {
      return []
    }

    const prefixQuery = sanitizedQuery
      .split(/\s+/)
      .filter((t) => t.length > 0)
      .join(' NEAR ')

    const limit = params.limit ?? 20
    const rawResults = this.dbManager.searchFiles(prefixQuery, limit)

    return rawResults.map((r) => ({
      id: `${r.path}::${r.rank}`,
      path: r.path,
      snippet: r.snippet,
      rank: r.rank,
      matchCount: r.matchCount,
    }))
  }

  async buildIndex(): Promise<void> {
    this.emitProgress({ phase: 'scanning', current: 0, total: 0 })

    const allFiles = await this.fileManager.listFiles('/', { recursive: true })
    const indexableFiles = allFiles.filter(
      (f) => !f.isDirectory && this.isIndexableFile(f.path),
    )

    this.emitProgress({
      phase: 'indexing',
      current: 0,
      total: indexableFiles.length,
    })

    const existingMeta = new Map(
      this.dbManager.getAllFileMeta().map((m) => [m.path, m]),
    )

    let indexed = 0
    const indexedPaths = new Set<string>()

    for (const file of indexableFiles) {
      indexedPaths.add(file.path)

      const existing = existingMeta.get(file.path)
      const currentModified = new Date(file.modifiedTime).getTime()

      if (existing && existing.last_modified === currentModified) {
        indexed++
        if (indexed % 50 === 0) {
          this.emitProgress({
            phase: 'indexing',
            current: indexed,
            total: indexableFiles.length,
            filePath: file.path,
          })
        }
        continue
      }

      try {
        await this.indexFile(file.path)
      } catch (error) {
        console.warn('[LocalSearchEngine] Failed to index file', file.path, error)
      }

      indexed++
      if (indexed % 50 === 0) {
        this.emitProgress({
          phase: 'indexing',
          current: indexed,
          total: indexableFiles.length,
          filePath: file.path,
        })
      }
    }

    for (const [existingPath] of existingMeta) {
      if (!indexedPaths.has(existingPath)) {
        this.dbManager.removeFileIndex(existingPath)
      }
    }

    this.emitProgress({
      phase: 'complete',
      current: indexed,
      total: indexableFiles.length,
    })
  }

  async rebuildIndex(): Promise<void> {
    this.dbManager.clearAllIndexes()
    await this.buildIndex()
  }

  getIndexStatus(): SearchIndexStatus {
    const totalFiles = this.dbManager.getIndexedFileCount()
    return {
      totalFiles,
      indexedFiles: totalFiles,
      indexSizeBytes: this.dbManager.getDatabaseSize(),
      lastIndexedAt: Date.now(),
      isIndexing: false,
    }
  }

  async onFileChange(event: FileWatchEvent): Promise<void> {
    if (!this.isInitialized) {
      return
    }

    switch (event.type) {
      case 'add':
      case 'change':
        if (this.isIndexableFile(event.path)) {
          try {
            await this.indexFile(event.path)
          } catch (error) {
            console.warn('[LocalSearchEngine] Failed to update index for', event.path, error)
          }
        }
        break
      case 'unlink':
        this.dbManager.removeFileIndex(event.path)
        break
      default:
        break
    }
  }

  private async indexFile(relativePath: string): Promise<void> {
    try {
      const result = await this.fileManager.readFile(relativePath, {
        maxSize: 512 * 1024,
      })
      this.dbManager.indexFileContent(relativePath, result.content)
    } catch {
      // File might be binary or unreadable, skip silently
    }
  }

  private isIndexableFile(filePath: string): boolean {
    for (const excluded of EXCLUDED_PATHS) {
      if (filePath.startsWith(excluded) || filePath.includes('/' + excluded)) {
        return false
      }
    }

    const ext = this.getExtension(filePath)
    if (!ext) {
      return false
    }
    return INDEXABLE_EXTENSIONS.has(ext)
  }

  private getExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.')
    if (lastDot === -1) {
      return ''
    }
    return filePath.substring(lastDot).toLowerCase()
  }

  private sanitizeFTSQuery(query: string): string {
    return query
      .replace(/[{}()^"~*:]/g, ' ')
      .replace(/'/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  private emitProgress(progress: SearchIndexProgress): void {
    if (this.sender && !this.sender.isDestroyed()) {
      try {
        this.sender.webContents.send(IPC_CHANNELS.SEARCH_INDEX_PROGRESS, progress)
      } catch {
        // Sender might be destroyed during shutdown
      }
    }
  }
}
