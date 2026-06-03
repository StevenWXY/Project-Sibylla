import type { LocalSearchEngine } from '../../local-search-engine'
import type { FileManager } from '../../file-manager'
import type { SearchSource, SearchSourceAdapter, UnifiedSearchQuery, UnifiedSearchResult } from '../types'
import { logger } from '../../../utils/logger'

const MCP_PATH_MAP: ReadonlyArray<{ prefix: string; source: SearchSource }> = [
  { prefix: 'docs/logs/slack/', source: 'mcp:slack' },
  { prefix: 'docs/logs/discord/', source: 'mcp:notion' },
  { prefix: '.sibylla/inbox/prs/', source: 'mcp:github' },
  { prefix: 'docs/announcements/', source: 'mcp:notion' },
]

export class McpAdapter implements SearchSourceAdapter {
  private discoveredSources: SearchSource[] = []

  constructor(
    private readonly localSearch: LocalSearchEngine,
    private readonly fileManager: FileManager,
  ) {}

  async discoverSources(): Promise<SearchSource[]> {
    this.discoveredSources = []

    for (const mapping of MCP_PATH_MAP) {
      try {
        const files = await this.fileManager.listFiles(mapping.prefix, { recursive: false })
        if (files.length > 0) {
          this.discoveredSources.push(mapping.source)
        }
      } catch {
        // Directory does not exist, skip
      }
    }

    logger.info('[McpAdapter] Discovered MCP sources', {
      sources: this.discoveredSources,
    })

    return this.discoveredSources
  }

  getDiscoveredSources(): SearchSource[] {
    return this.discoveredSources
  }

  async search(query: UnifiedSearchQuery): Promise<UnifiedSearchResult[]> {
    const allResults: UnifiedSearchResult[] = []

    for (const mapping of MCP_PATH_MAP) {
      if (!this.discoveredSources.includes(mapping.source)) continue

      const syncResults = this.localSearch.search({
        query: query.query,
        limit: (query.limit ?? 20) * 2,
      })

      const filtered = syncResults.filter(r => r.path.startsWith(mapping.prefix))

      allResults.push(...filtered.map(r => ({
        id: `mcp:${r.path}::${r.rank}`,
        source: mapping.source,
        type: 'mcp-record' as const,
        title: r.path.split('/').pop() ?? r.path,
        snippet: r.snippet,
        fullPath: r.path,
        metadata: {
          score: r.rank,
          bm25Score: r.rank,
          matchCount: r.matchCount,
        },
        navigation: { kind: 'file' as const, path: r.path },
      })))
    }

    return allResults
  }
}
