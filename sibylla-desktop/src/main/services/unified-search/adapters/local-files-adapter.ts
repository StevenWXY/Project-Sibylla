import type { LocalSearchEngine } from '../../local-search-engine'
import type { SearchSourceAdapter, UnifiedSearchQuery, UnifiedSearchResult } from '../types'

export class LocalFilesAdapter implements SearchSourceAdapter {
  constructor(
    private readonly localSearch: LocalSearchEngine,
    private readonly options: {
      exclude: string[]
      currentUser: string
      isAdmin: boolean
    },
  ) {}

  async search(query: UnifiedSearchQuery): Promise<UnifiedSearchResult[]> {
    const syncResults = this.localSearch.search({
      query: query.query,
      limit: (query.limit ?? 20) * 2,
    })

    return syncResults
      .filter(r => !this.options.exclude.some(e => r.path.startsWith(e)))
      .filter(r => this.filterPersonalSpace(r.path))
      .map(r => ({
        id: `local:${r.path}::${r.rank}`,
        source: 'local-files' as const,
        type: 'file' as const,
        title: r.path.split('/').pop() ?? r.path,
        snippet: r.snippet,
        fullPath: r.path,
        metadata: {
          score: r.rank,
          bm25Score: r.rank,
          matchCount: r.matchCount,
        },
        navigation: { kind: 'file' as const, path: r.path, line: r.lineNumber },
      }))
  }

  private filterPersonalSpace(filePath: string): boolean {
    if (this.options.isAdmin) return true
    const personalPrefix = 'personal/'
    if (!filePath.startsWith(personalPrefix)) return true
    return filePath.startsWith(`personal/${this.options.currentUser}/`)
  }
}
