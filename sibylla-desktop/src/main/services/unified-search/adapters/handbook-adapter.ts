import type { HandbookService } from '../../handbook/handbook-service'
import type { SearchSourceAdapter, UnifiedSearchQuery, UnifiedSearchResult } from '../types'

export class HandbookAdapter implements SearchSourceAdapter {
  constructor(private readonly handbookService: HandbookService) {}

  async search(query: UnifiedSearchQuery): Promise<UnifiedSearchResult[]> {
    const entries = this.handbookService.search(query.query, {
      limit: (query.limit ?? 20) * 2,
    })

    return entries.map(entry => ({
      id: `handbook:${entry.id}`,
      source: 'handbook' as const,
      type: 'handbook-entry' as const,
      title: entry.title,
      snippet: this.computeSnippet(entry.content, query.query),
      metadata: {
        score: this.computeScore(entry.content, query.query),
        category: entry.tags,
      },
      navigation: { kind: 'handbook' as const, entryId: entry.id },
    }))
  }

  private computeScore(content: string, query: string): number {
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0)
    if (terms.length === 0) return 0
    const lowerContent = content.toLowerCase()
    const hits = terms.filter(t => lowerContent.includes(t)).length
    return hits / terms.length
  }

  private computeSnippet(content: string, query: string): string {
    const firstTerm = query.toLowerCase().split(/\s+/).find(t => t.length > 0) ?? ''
    const idx = content.toLowerCase().indexOf(firstTerm)
    if (idx === -1) return content.slice(0, 160)
    const start = Math.max(0, idx - 80)
    const end = Math.min(content.length, idx + firstTerm.length + 80)
    return (start > 0 ? '...' : '') + content.slice(start, end) + (end < content.length ? '...' : '')
  }
}
