import { describe, it, expect, vi } from 'vitest'
import { LocalFilesAdapter } from '@main/services/unified-search/adapters/local-files-adapter'
import type { UnifiedSearchQuery } from '@main/services/unified-search/types'

function createMockLocalSearch(results: Array<{ id: string; path: string; snippet: string; rank: number; matchCount: number; lineNumber?: number }>) {
  return {
    search: vi.fn().mockReturnValue(results),
  }
}

describe('LocalFilesAdapter', () => {
  const query: UnifiedSearchQuery = { query: 'test', limit: 10 }

  it('wraps synchronous results as Promise', async () => {
    const mock = createMockLocalSearch([
      { id: 'a::0.5', path: 'docs/test.md', snippet: 'test snippet', rank: 0.5, matchCount: 3 },
    ])
    const adapter = new LocalFilesAdapter(mock as never, {
      exclude: [],
      currentUser: 'alice',
      isAdmin: false,
    })

    const results = await adapter.search(query)
    expect(results).toHaveLength(1)
    expect(results[0].source).toBe('local-files')
    expect(results[0].type).toBe('file')
    expect(results[0].title).toBe('test.md')
    expect(results[0].metadata.score).toBe(0.5)
    expect(results[0].metadata.bm25Score).toBe(0.5)
  })

  it('filters excluded paths', async () => {
    const mock = createMockLocalSearch([
      { id: 'a', path: 'handbook/guide.md', snippet: 'test', rank: 0.8, matchCount: 1 },
      { id: 'b', path: 'docs/readme.md', snippet: 'test', rank: 0.6, matchCount: 1 },
    ])
    const adapter = new LocalFilesAdapter(mock as never, {
      exclude: ['handbook/'],
      currentUser: 'alice',
      isAdmin: false,
    })

    const results = await adapter.search(query)
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('readme.md')
  })

  it('filters personal space for non-admin users', async () => {
    const mock = createMockLocalSearch([
      { id: 'a', path: 'personal/alice/notes.md', snippet: 'test', rank: 0.8, matchCount: 1 },
      { id: 'b', path: 'personal/bob/notes.md', snippet: 'test', rank: 0.6, matchCount: 1 },
    ])
    const adapter = new LocalFilesAdapter(mock as never, {
      exclude: [],
      currentUser: 'alice',
      isAdmin: false,
    })

    const results = await adapter.search(query)
    expect(results).toHaveLength(1)
    expect(results[0].fullPath).toBe('personal/alice/notes.md')
  })

  it('shows all personal spaces for admin users', async () => {
    const mock = createMockLocalSearch([
      { id: 'a', path: 'personal/alice/notes.md', snippet: 'test', rank: 0.8, matchCount: 1 },
      { id: 'b', path: 'personal/bob/notes.md', snippet: 'test', rank: 0.6, matchCount: 1 },
    ])
    const adapter = new LocalFilesAdapter(mock as never, {
      exclude: [],
      currentUser: 'alice',
      isAdmin: true,
    })

    const results = await adapter.search(query)
    expect(results).toHaveLength(2)
  })

  it('maps rank to both score and bm25Score', async () => {
    const mock = createMockLocalSearch([
      { id: 'a', path: 'test.md', snippet: 'test', rank: 0.75, matchCount: 2 },
    ])
    const adapter = new LocalFilesAdapter(mock as never, {
      exclude: [],
      currentUser: 'alice',
      isAdmin: false,
    })

    const results = await adapter.search(query)
    expect(results[0].metadata.score).toBe(0.75)
    expect(results[0].metadata.bm25Score).toBe(0.75)
  })
})
