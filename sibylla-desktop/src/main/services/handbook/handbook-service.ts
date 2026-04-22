import path from 'path'
import fs from 'fs'
import YAML from 'yaml'
import type { DatabaseManager } from '../database-manager'
import type { FileManager } from '../file-manager'
import { HandbookIndexer } from './handbook-indexer'
import type {
  HandbookEntry,
  HandbookIndex,
  HandbookDiff,
  HandbookSearchOptions,
  CloneResult,
  UpdateCheckResult,
} from './types'
import { logger } from '../../utils/logger'

const HOW_TO_PATTERNS = [
  /怎么|如何|什么是|为什么|能不能|可以/,
  /how to|what is|why|can i|how can/i,
]

export class HandbookService {
  private builtinEntries: Map<string, HandbookEntry> = new Map()
  private localEntries: Map<string, HandbookEntry> = new Map()
  private indexer: HandbookIndexer
  private indexData: HandbookIndex | null = null

  constructor(
    private appResourcesPath: string,
    private workspaceRoot: string,
    _fileManager: FileManager,
    private dbManager: DatabaseManager,
  ) {
    this.indexer = new HandbookIndexer(dbManager)
  }

  async initialize(): Promise<void> {
    await this.loadBuiltin()
    await this.loadLocal()

    const allEntries = [...this.builtinEntries.values(), ...this.localEntries.values()]
    await this.indexer.indexEntries(allEntries)

    logger.info('handbook.initialized', {
      builtin: this.builtinEntries.size,
      local: this.localEntries.size,
    })
  }

  search(query: string, options?: HandbookSearchOptions): HandbookEntry[] {
    const limit = options?.limit ?? 10
    const lang = options?.language ?? this.currentLanguage()

    try {
      const rawResults = this.dbManager.searchFiles(query, limit * 2)

      return rawResults
        .filter(r => r.path.startsWith(`handbook/${lang}/`))
        .map(r => this.getEntry(this.pathToEntryId(r.path), lang))
        .filter((e): e is HandbookEntry => e !== null)
        .slice(0, limit)
    } catch (err) {
      logger.warn('handbook.search.failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }

  getEntry(id: string, language?: string): HandbookEntry | null {
    const lang = language ?? this.currentLanguage()
    const key = `${id}:${lang}`
    return (
      this.localEntries.get(key) ??
      this.builtinEntries.get(key) ??
      this.builtinEntries.get(`${id}:en`) ??
      null
    )
  }

  async cloneToWorkspace(): Promise<CloneResult> {
    const localPath = path.join(this.workspaceRoot, '.sibylla', 'handbook-local')
    let clonedCount = 0

    for (const entry of this.builtinEntries.values()) {
      const targetPath = path.join(localPath, entry.language, entry.path)
      if (fs.existsSync(targetPath)) continue

      fs.mkdirSync(path.dirname(targetPath), { recursive: true })
      fs.writeFileSync(targetPath, entry.content, 'utf-8')
      clonedCount++
    }

    const metadata = JSON.stringify({
      version: this.getBuiltinVersion(),
      clonedAt: new Date().toISOString(),
    })
    const metaPath = path.join(localPath, '.cloned-from-version')
    fs.mkdirSync(localPath, { recursive: true })
    fs.writeFileSync(metaPath, metadata, 'utf-8')

    await this.loadLocal()

    const newLocalEntries = [...this.localEntries.values()]
    if (newLocalEntries.length > 0) {
      await this.indexer.indexEntries(newLocalEntries)
    }

    return { clonedCount, localPath }
  }

  suggestForQuery(userQuery: string): HandbookEntry[] {
    const isHowTo = HOW_TO_PATTERNS.some(p => p.test(userQuery))
    if (!isHowTo) return []
    return this.search(userQuery, { limit: 2 })
  }

  checkUpdates(): UpdateCheckResult {
    const localPath = path.join(this.workspaceRoot, '.sibylla', 'handbook-local', '.cloned-from-version')
    if (!fs.existsSync(localPath)) {
      return { hasUpdates: false }
    }

    const added: string[] = []
    const modified: string[] = []
    const removed: string[] = []

    const localIds = new Set<string>()
    for (const [key, entry] of this.localEntries) {
      const id = entry.id
      localIds.add(id)

      const builtin = this.builtinEntries.get(key)
      if (!builtin) {
        removed.push(id)
      } else if (this.indexer.hashContent(builtin.content) !== this.indexer.hashContent(entry.content)) {
        modified.push(id)
      }
    }

    for (const [key, entry] of this.builtinEntries) {
      if (!localIds.has(entry.id)) {
        const lang = key.split(':').pop() ?? 'zh'
        if (lang === this.currentLanguage() || lang === 'en') {
          added.push(entry.id)
        }
      }
    }

    const diff: HandbookDiff = { added, modified, removed }
    const hasUpdates = added.length > 0 || modified.length > 0 || removed.length > 0

    return { hasUpdates, diff }
  }

  private async loadBuiltin(): Promise<void> {
    const indexPath = path.join(this.appResourcesPath, 'handbook', 'index.yaml')
    if (!fs.existsSync(indexPath)) {
      logger.error('handbook.builtin.missing', { path: indexPath })
      return
    }

    try {
      const yamlContent = fs.readFileSync(indexPath, 'utf-8')
      this.indexData = YAML.parse(yamlContent) as HandbookIndex
    } catch (error) {
      logger.error('handbook.builtin.parse-failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      return
    }

    if (!this.indexData) return

    const now = new Date().toISOString()

    for (const entryMeta of this.indexData.entries) {
      for (const lang of this.indexData.languages) {
        const filePath = path.join(this.appResourcesPath, 'handbook', lang, entryMeta.path)
        if (!fs.existsSync(filePath)) continue

        try {
          const content = fs.readFileSync(filePath, 'utf-8')
          const title = entryMeta.title[lang] ?? entryMeta.title['en'] ?? entryMeta.id
          const entry: HandbookEntry = {
            id: entryMeta.id,
            path: entryMeta.path,
            title,
            tags: entryMeta.tags,
            language: lang,
            version: this.indexer.hashContent(content),
            source: 'builtin',
            content,
            keywords: entryMeta.keywords,
            updatedAt: now,
          }
          this.builtinEntries.set(`${entryMeta.id}:${lang}`, entry)
        } catch (error) {
          logger.warn('handbook.builtin.entry-failed', {
            id: entryMeta.id,
            language: lang,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }
  }

  private async loadLocal(): Promise<void> {
    const localDir = path.join(this.workspaceRoot, '.sibylla', 'handbook-local')
    if (!fs.existsSync(localDir)) return

    this.localEntries.clear()

    const languages = this.indexData?.languages ?? ['zh', 'en']
    const now = new Date().toISOString()

    for (const lang of languages) {
      const langDir = path.join(localDir, lang)
      if (!fs.existsSync(langDir)) continue
      const stat = fs.statSync(langDir)
      if (!stat.isDirectory()) continue

      this.loadLocalDirectory(langDir, lang, now)
    }
  }

  private loadLocalDirectory(dir: string, lang: string, now: string, prefix: string = ''): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue

      const fullPath = path.join(dir, entry.name)
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        this.loadLocalDirectory(fullPath, lang, now, relativePath)
      } else if (entry.name.endsWith('.md')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8')
          const entryId = relativePath.replace(/\.md$/, '').replace(/\//g, '.')
          const entryPath = relativePath
          const meta = this.indexData?.entries.find(e => e.path === entryPath)
          const title = meta?.title[lang] ?? meta?.title['en'] ?? entryId

          const handbookEntry: HandbookEntry = {
            id: entryId,
            path: entryPath,
            title,
            tags: meta?.tags ?? [],
            language: lang,
            version: this.indexer.hashContent(content),
            source: 'local',
            content,
            keywords: meta?.keywords ?? [],
            updatedAt: now,
          }
          this.localEntries.set(`${entryId}:${lang}`, handbookEntry)
        } catch (error) {
          logger.warn('handbook.local.entry-failed', {
            path: relativePath,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    }
  }

  private pathToEntryId(searchPath: string): string {
    return searchPath
      .replace(/^handbook\/[^/]+\//, '')
      .replace(/\.md$/, '')
      .replace(/\//g, '.')
  }

  private currentLanguage(): string {
    return 'zh'
  }

  private getBuiltinVersion(): string {
    return this.indexData?.version ?? '0.0.0'
  }
}
