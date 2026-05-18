import type { LocalSearchEngine } from '../local-search-engine'
import type { MemoryIndexer } from '../memory/memory-indexer'
import type { HandbookService } from '../handbook/handbook-service'
import type { FileManager } from '../file-manager'
import type { Tracer } from '../trace/tracer'
import type { AppEventBus } from '../event-bus'
import type { SearchSource, SearchSourceAdapter, UnifiedSearchQuery, UnifiedSearchResponse, UnifiedSearchResult } from './types'
import { mergeAndRank } from './ranking'
import { LocalFilesAdapter } from './adapters/local-files-adapter'
import { MemoryAdapter } from './adapters/memory-adapter'
import { HandbookAdapter } from './adapters/handbook-adapter'
import { McpAdapter } from './adapters/mcp-adapter'
import { logger } from '../../utils/logger'
import { promises as fsp } from 'fs'
import path from 'path'

export class UnifiedSearchEngine {
  private readonly sources = new Map<SearchSource, SearchSourceAdapter>()
  private readonly mcpAdapter: McpAdapter
  private readonly fileManager: FileManager

  constructor(
    private readonly localSearch: LocalSearchEngine,
    private readonly memoryIndexer: MemoryIndexer,
    private readonly handbookService: HandbookService,
    fileManager: FileManager,
    private readonly tracer: Tracer,
    private readonly eventBus: AppEventBus,
    private readonly userOptions: { currentUser: string; isAdmin: boolean },
  ) {
    this.fileManager = fileManager
    this.mcpAdapter = new McpAdapter(localSearch, fileManager)
    this.registerBuiltinSources()
  }

  private registerBuiltinSources(): void {
    this.sources.set('local-files', new LocalFilesAdapter(this.localSearch, {
      exclude: ['handbook/', '.sibylla/inbox/', '.sibylla/handbook-local/'],
      currentUser: this.userOptions.currentUser,
      isAdmin: this.userOptions.isAdmin,
    }))

    this.sources.set('memory', new MemoryAdapter(this.memoryIndexer, { archived: false }))
    this.sources.set('memory-archive', new MemoryAdapter(this.memoryIndexer, { archived: true }))
    this.sources.set('handbook', new HandbookAdapter(this.handbookService))

    void this.discoverMcpSources()
  }

  async discoverMcpSources(): Promise<void> {
    try {
      const mcpSources = await this.mcpAdapter.discoverSources()
      for (const source of mcpSources) {
        if (!this.sources.has(source)) {
          this.sources.set(source, this.mcpAdapter)
        }
      }
      logger.info('[UnifiedSearchEngine] MCP sources registered', { sources: mcpSources })
    } catch (err) {
      logger.warn('[UnifiedSearchEngine] MCP discovery failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  async search(query: UnifiedSearchQuery): Promise<UnifiedSearchResponse> {
    return this.tracer.withSpan('unified-search.query', async (span) => {
      const startTime = Date.now()

      const enabledSources = (query.sources ?? Array.from(this.sources.keys()))
        .filter(s => this.sources.has(s))

      span.setAttributes({
        'search.query': query.query,
        'search.sources': enabledSources.join(','),
        'search.limit': query.limit ?? 20,
      })

      const timeoutMs = query.timeoutMs ?? 500
      const timing: Record<string, number> = {}
      let partial = false

      const sourceResults = await Promise.all(
        enabledSources.map(async (source): Promise<UnifiedSearchResult[]> => {
          const adapter = this.sources.get(source)
          if (!adapter) return []

          const sourceStart = Date.now()
          try {
            const result = await this.queryWithTimeout(adapter, query, timeoutMs)
            timing[source] = Date.now() - sourceStart
            return result
          } catch {
            timing[source] = Date.now() - sourceStart
            partial = true
            return []
          }
        }),
      )

      const merged = mergeAndRank(
        sourceResults.flat(),
        query.rankingWeights,
      )

      const marked = await this.markStaleResults(merged)

      const offset = query.offset ?? 0
      const final = marked.slice(offset, offset + (query.limit ?? 20))

      this.eventBus.emitEvent({
        type: 'search.executed',
        source: 'unified-search',
        payload: { query: query.query, resultCount: final.length, partial },
      })

      return {
        results: final,
        totalCount: merged.length,
        partial,
        timing: { totalMs: Date.now() - startTime, perSource: timing },
      }
    }, { kind: 'tool-call' })
  }

  private queryWithTimeout(
    adapter: SearchSourceAdapter,
    query: UnifiedSearchQuery,
    timeoutMs: number,
  ): Promise<UnifiedSearchResult[]> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Source timeout after ${timeoutMs}ms`)), timeoutMs)
    })

    // Race the adapter search against a timeout.
    // NOTE: adapter.search() is not abortable — it continues in background even if timeout wins.
    // This is a known limitation of the SearchSourceAdapter interface.
    return Promise.race([
      adapter.search(query).finally(() => { if (timer !== undefined) clearTimeout(timer) }),
      timeout,
    ])
  }

  private async markStaleResults(results: UnifiedSearchResult[]): Promise<UnifiedSearchResult[]> {
    const workspaceRoot = this.fileManager.getWorkspaceRoot()
    const checks = results.map(async r => {
      if (r.fullPath && r.navigation.kind === 'file') {
        const absPath = path.join(workspaceRoot, r.fullPath)
        try {
          await fsp.access(absPath)
        } catch {
          return { ...r, stale: true }
        }
      }
      return r
    })
    return Promise.all(checks)
  }

  listSources(): SearchSource[] {
    return Array.from(this.sources.keys())
  }
}
