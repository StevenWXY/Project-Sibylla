import { describe, it, expect, vi } from 'vitest'
import { MemoryAdapter } from '@main/services/unified-search/adapters/memory-adapter'
import type { UnifiedSearchQuery } from '@main/services/unified-search/types'
import type { HybridSearchResult } from '@main/services/memory/types'

function createMockIndexer(hits: HybridSearchResult[]) {
  return { search: vi.fn().mockResolvedValue(hits) }
}

const sampleHit: HybridSearchResult = {
  id: 'pref-001',
  section: 'user_preference',
  content: '# Dark Mode Preference\n\nUser prefers dark theme with indigo accents.',
  confidence: 0.9,
  hits: 5,
  isArchived: false,
  vecScore: 0.85,
  bm25Score: 0.7,
  finalScore: 0.78,
}

describe('MemoryAdapter', () => {
  const query: UnifiedSearchQuery = { query: 'dark mode', limit: 10 }

  it('maps field names correctly', async () => {
    const mock = createMockIndexer([sampleHit])
    const adapter = new MemoryAdapter(mock as never, { archived: false })

    const results = await adapter.search(query)
    expect(results).toHaveLength(1)

    const r = results[0]
    expect(r.metadata.score).toBe(0.78)
    expect(r.metadata.vectorScore).toBe(0.85)
    expect(r.metadata.bm25Score).toBe(0.7)
    expect(r.metadata.confidence).toBe(0.9)
    expect(r.source).toBe('memory')
    expect(r.navigation).toEqual({ kind: 'memory', entryId: 'pref-001' })
  })

  it('uses memory-archive source when archived=true', async () => {
    const mock = createMockIndexer([{ ...sampleHit, isArchived: true }])
    const adapter = new MemoryAdapter(mock as never, { archived: true })

    const results = await adapter.search(query)
    expect(results[0].source).toBe('memory-archive')
  })

  it('derives title from markdown heading', async () => {
    const mock = createMockIndexer([sampleHit])
    const adapter = new MemoryAdapter(mock as never, { archived: false })

    const results = await adapter.search(query)
    expect(results[0].title).toBe('Dark Mode Preference')
  })

  it('derives title from first 50 chars when no heading', async () => {
    const hit = { ...sampleHit, content: 'This is plain text without any markdown heading at all.' }
    const mock = createMockIndexer([hit])
    const adapter = new MemoryAdapter(mock as never, { archived: false })

    const results = await adapter.search(query)
    expect(results[0].title).toContain('This is plain text')
  })

  it('produces snippet around matched term', async () => {
    const mock = createMockIndexer([sampleHit])
    const adapter = new MemoryAdapter(mock as never, { archived: false })

    const results = await adapter.search(query)
    expect(results[0].snippet).toBeTruthy()
    expect(results[0].snippet.length).toBeGreaterThan(0)
  })
})
