import type { MemoryIndexer } from '../../memory/memory-indexer'
import type { SearchSource, SearchSourceAdapter, UnifiedSearchQuery, UnifiedSearchResult } from '../types'

export class MemoryAdapter implements SearchSourceAdapter {
  constructor(
    private readonly indexer: MemoryIndexer,
    private readonly options: { archived: boolean },
  ) {}

  async search(query: UnifiedSearchQuery): Promise<UnifiedSearchResult[]> {
    const hits = await this.indexer.search(query.query, {
      limit: (query.limit ?? 20) * 2,
      includeArchived: this.options.archived,
    })

    return hits.map(h => ({
      id: `memory:${h.id}`,
      source: (this.options.archived ? 'memory-archive' : 'memory') as SearchSource,
      type: 'memory-entry' as const,
      title: this.deriveTitle(h.content),
      snippet: this.highlightMatch(h.content, query.query),
      metadata: {
        score: h.finalScore,
        vectorScore: h.vecScore,
        bm25Score: h.bm25Score,
        confidence: h.confidence,
        section: h.section,
      },
      navigation: { kind: 'memory' as const, entryId: h.id },
    }))
  }

  private deriveTitle(content: string): string {
    const titleMatch = content.match(/^#\s+(.+)$/m)
    if (titleMatch?.[1]) return titleMatch[1].trim()
    return content.slice(0, 50).replace(/\n/g, ' ') + (content.length > 50 ? '...' : '')
  }

  private highlightMatch(content: string, query: string): string {
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0)
    if (terms.length === 0) return content.slice(0, 160)

    const lowerContent = content.toLowerCase()
    const firstIdx = terms
      .map(t => lowerContent.indexOf(t))
      .filter(i => i >= 0)
      .sort((a, b) => a - b)[0]

    if (firstIdx === undefined) return content.slice(0, 160)

    const start = Math.max(0, firstIdx - 80)
    const end = Math.min(content.length, firstIdx + 80)
    const prefix = start > 0 ? '...' : ''
    const suffix = end < content.length ? '...' : ''
    return prefix + content.slice(start, end) + suffix
  }
}
