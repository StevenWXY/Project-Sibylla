import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SearchSourceAdapter, UnifiedSearchQuery, UnifiedSearchResult } from '@main/services/unified-search/types'

class MockAdapter implements SearchSourceAdapter {
  constructor(private results: UnifiedSearchResult[], private delayMs = 0) {}

  async search(query: UnifiedSearchQuery): Promise<UnifiedSearchResult[]> {
    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs))
    }
    return this.results
  }
}

function makeResult(source: string, score: number): UnifiedSearchResult {
  return {
    id: `${source}:${score}`,
    source: source as UnifiedSearchResult['source'],
    type: 'file',
    title: `${source} result`,
    snippet: `Result from ${source} with score ${score}`,
    metadata: { score },
    navigation: { kind: 'file', path: `/${source}/test.md` },
  }
}

const mockTracer = {
  withSpan: vi.fn((_name: string, fn: (span: unknown) => Promise<unknown>, _opts?: unknown) => {
    const mockSpan = { setAttributes: vi.fn() }
    return fn(mockSpan)
  }),
}

const mockEventBus = { emitEvent: vi.fn() }

describe('UnifiedSearchEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('can be constructed and list sources', async () => {
    const { UnifiedSearchEngine } = await import('@main/services/unified-search/unified-search-engine')
    const mockLocalSearch = { search: vi.fn().mockReturnValue([]) }
    const mockMemoryIndexer = { search: vi.fn().mockResolvedValue([]) }
    const mockHandbook = { search: vi.fn().mockReturnValue([]) }
    const mockFM = { listFiles: vi.fn().mockRejectedValue(new Error('not found')), getWorkspaceRoot: vi.fn().mockReturnValue('/tmp/test-workspace') }

    const engine = new UnifiedSearchEngine(
      mockLocalSearch as never,
      mockMemoryIndexer as never,
      mockHandbook as never,
      mockFM as never,
      mockTracer as never,
      mockEventBus as never,
      { currentUser: 'alice', isAdmin: true },
    )

    const sources = engine.listSources()
    expect(sources).toContain('local-files')
    expect(sources).toContain('memory')
    expect(sources).toContain('memory-archive')
    expect(sources).toContain('handbook')
  })

  it('emits search.executed event', async () => {
    const { UnifiedSearchEngine } = await import('@main/services/unified-search/unified-search-engine')
    const mockLocalSearch = { search: vi.fn().mockReturnValue([]) }
    const mockMemoryIndexer = { search: vi.fn().mockResolvedValue([]) }
    const mockHandbook = { search: vi.fn().mockReturnValue([]) }
    const mockFM = { listFiles: vi.fn().mockRejectedValue(new Error('not found')), getWorkspaceRoot: vi.fn().mockReturnValue('/tmp/test-workspace') }

    const engine = new UnifiedSearchEngine(
      mockLocalSearch as never,
      mockMemoryIndexer as never,
      mockHandbook as never,
      mockFM as never,
      mockTracer as never,
      mockEventBus as never,
      { currentUser: 'alice', isAdmin: true },
    )

    await engine.search({ query: 'test' })
    expect(mockEventBus.emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'search.executed',
        source: 'unified-search',
      }),
    )
  })
})
