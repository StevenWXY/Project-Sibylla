import { describe, it, expect, vi } from 'vitest'
import { HandbookAdapter } from '@main/services/unified-search/adapters/handbook-adapter'
import type { UnifiedSearchQuery } from '@main/services/unified-search/types'
import type { HandbookEntry } from '@main/services/handbook/types'

function createMockHandbook(entries: HandbookEntry[]) {
  return { search: vi.fn().mockReturnValue(entries) }
}

const sampleEntry: HandbookEntry = {
  id: 'getting-started',
  path: 'getting-started.md',
  title: 'Getting Started Guide',
  tags: ['guide', 'beginner'],
  language: 'zh',
  version: 'abc123',
  source: 'builtin',
  content: 'This guide helps you get started with Sibylla quickly. Follow the steps below to set up your workspace.',
  keywords: ['setup', 'workspace'],
  updatedAt: '2026-01-01T00:00:00Z',
}

describe('HandbookAdapter', () => {
  const query: UnifiedSearchQuery = { query: 'getting started', limit: 10 }

  it('computes score from keyword matches', async () => {
    const mock = createMockHandbook([sampleEntry])
    const adapter = new HandbookAdapter(mock as never)

    const results = await adapter.search(query)
    expect(results).toHaveLength(1)
    expect(results[0].metadata.score).toBeGreaterThan(0)
    expect(results[0].source).toBe('handbook')
    expect(results[0].navigation).toEqual({ kind: 'handbook', entryId: 'getting-started' })
  })

  it('computes snippet around matched keyword', async () => {
    const mock = createMockHandbook([sampleEntry])
    const adapter = new HandbookAdapter(mock as never)

    const results = await adapter.search(query)
    expect(results[0].snippet.length).toBeGreaterThan(0)
    expect(results[0].snippet.length).toBeLessThanOrEqual(200)
  })

  it('returns score 0 for no keyword matches', async () => {
    const mock = createMockHandbook([sampleEntry])
    const adapter = new HandbookAdapter(mock as never)

    const noMatchQuery: UnifiedSearchQuery = { query: 'xyznonexistent', limit: 10 }
    const results = await adapter.search(noMatchQuery)
    expect(results[0].metadata.score).toBe(0)
  })
})
