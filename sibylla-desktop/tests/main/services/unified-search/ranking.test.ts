import { describe, it, expect } from 'vitest'
import { calculateFinalScore, dedupKey, mergeAndRank, groupBySource, SOURCE_DISPLAY_ORDER } from '@main/services/unified-search/ranking'
import type { UnifiedSearchResult } from '@main/services/unified-search/types'
import { DEFAULT_RANKING_WEIGHTS } from '@main/services/unified-search/types'

function makeResult(overrides: Partial<UnifiedSearchResult>): UnifiedSearchResult {
  return {
    id: 'test-1',
    source: 'local-files',
    type: 'file',
    title: 'Test File',
    snippet: 'A test snippet for search',
    metadata: { score: 0.8 },
    navigation: { kind: 'file', path: '/test.md' },
    ...overrides,
  }
}

describe('calculateFinalScore', () => {
  it('computes weighted score with default weights', () => {
    const result = makeResult({
      metadata: { score: 0.5, vectorScore: 0.8, bm25Score: 0.6, recencyScore: 0.9 },
      source: 'memory',
    })

    const score = calculateFinalScore(result)
    const expected = 0.4 * 0.8 + 0.4 * 0.6 + 0.1 * 0.9 + 0.1 * 1.0
    expect(score).toBeCloseTo(expected, 4)
  })

  it('falls back to metadata.score when vectorScore/bm25Score missing', () => {
    const result = makeResult({
      metadata: { score: 0.7 },
      source: 'local-files',
    })

    const score = calculateFinalScore(result)
    const expected = 0.4 * 0.7 + 0.4 * 0.7 + 0.1 * 0.5 + 0.1 * 0.9
    expect(score).toBeCloseTo(expected, 4)
  })

  it('uses custom weights', () => {
    const result = makeResult({
      metadata: { score: 0.5, vectorScore: 1.0, bm25Score: 0.0 },
      source: 'memory',
    })

    const customWeights = { vector: 1.0, fts: 0.0, recency: 0.0, sourcePriority: 0.0 }
    const score = calculateFinalScore(result, customWeights)
    expect(score).toBeCloseTo(1.0, 4)
  })
})

describe('dedupKey', () => {
  it('uses fullPath when available', () => {
    const result = makeResult({ fullPath: '/docs/test.md' })
    expect(dedupKey(result)).toBe('/docs/test.md')
  })

  it('uses snippet hash when no fullPath', () => {
    const result = makeResult({ snippet: 'Hello world test content' })
    const key = dedupKey(result)
    expect(key).toMatch(/^local-files:\d+$/)
  })

  it('produces same key for same content', () => {
    const r1 = makeResult({ snippet: 'Same content here' })
    const r2 = makeResult({ snippet: 'Same content here' })
    expect(dedupKey(r1)).toBe(dedupKey(r2))
  })
})

describe('mergeAndRank', () => {
  it('sorts by calculated score descending', () => {
    const results = [
      makeResult({ id: 'low', metadata: { score: 0.1 }, source: 'plans-archive' }),
      makeResult({ id: 'high', metadata: { score: 0.9, vectorScore: 0.9, bm25Score: 0.9 }, source: 'memory' }),
    ]

    const ranked = mergeAndRank(results)
    expect(ranked[0].id).toBe('high')
    expect(ranked[1].id).toBe('low')
  })

  it('deduplicates by fullPath', () => {
    const results = [
      makeResult({ id: 'first', fullPath: '/same.md', metadata: { score: 0.5 } }),
      makeResult({ id: 'second', fullPath: '/same.md', metadata: { score: 0.9 } }),
    ]

    const ranked = mergeAndRank(results)
    expect(ranked).toHaveLength(1)
    expect(ranked[0].id).toBe('second')
  })

  it('returns empty for empty input', () => {
    expect(mergeAndRank([])).toEqual([])
  })
})

describe('groupBySource', () => {
  it('groups results and sorts by display order', () => {
    const results = [
      makeResult({ source: 'handbook' }),
      makeResult({ source: 'memory' }),
      makeResult({ source: 'local-files' }),
    ]

    const groups = groupBySource(results)
    expect(groups.map(g => g.source)).toEqual(['memory', 'local-files', 'handbook'])
  })

  it('returns empty for no results', () => {
    expect(groupBySource([])).toEqual([])
  })
})
