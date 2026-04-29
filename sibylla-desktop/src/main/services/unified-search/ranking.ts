import type { UnifiedSearchResult, RankingWeights, SearchSource } from './types'
import { DEFAULT_RANKING_WEIGHTS } from './types'

export const SOURCE_PRIORITY: Record<SearchSource, number> = {
  'memory': 1.0,
  'local-files': 0.9,
  'mcp:github': 0.85,
  'mcp:notion': 0.85,
  'mcp:slack': 0.8,
  'handbook': 0.7,
  'memory-archive': 0.5,
  'plans-archive': 0.5,
}

export function calculateFinalScore(
  result: UnifiedSearchResult,
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS,
): number {
  const { metadata, source } = result
  const vecScore = metadata.vectorScore ?? metadata.score
  const ftsScore = metadata.bm25Score ?? metadata.score
  const recency = metadata.recencyScore ?? 0.5
  const sourcePri = SOURCE_PRIORITY[source] ?? 0.5

  return weights.vector * vecScore
    + weights.fts * ftsScore
    + weights.recency * recency
    + weights.sourcePriority * sourcePri
}

export function dedupKey(result: UnifiedSearchResult): string {
  if (result.fullPath) return result.fullPath
  const snippetHead = result.snippet.slice(0, 100)
  let hash = 0
  for (let i = 0; i < snippetHead.length; i++) {
    hash = ((hash << 5) - hash + snippetHead.charCodeAt(i)) | 0
  }
  return `${result.source}:${Math.abs(hash)}`
}

export function mergeAndRank(
  results: UnifiedSearchResult[],
  weights?: RankingWeights,
): UnifiedSearchResult[] {
  const w = weights ?? DEFAULT_RANKING_WEIGHTS

  const scored = results.map(r => {
    const finalScore = calculateFinalScore(r, w)
    return { ...r, metadata: { ...r.metadata, score: finalScore } }
  })

  const seen = new Map<string, UnifiedSearchResult>()
  for (const r of scored.sort((a, b) => b.metadata.score - a.metadata.score)) {
    const key = dedupKey(r)
    if (!seen.has(key)) seen.set(key, r)
  }

  return Array.from(seen.values())
    .sort((a, b) => b.metadata.score - a.metadata.score)
}

export const SOURCE_DISPLAY_ORDER: ReadonlyArray<SearchSource> = [
  'memory',
  'local-files',
  'mcp:github',
  'mcp:notion',
  'mcp:slack',
  'handbook',
  'memory-archive',
  'plans-archive',
]

export function groupBySource(
  results: UnifiedSearchResult[],
): Array<{ source: SearchSource; results: UnifiedSearchResult[] }> {
  const groups = new Map<SearchSource, UnifiedSearchResult[]>()

  for (const r of results) {
    const existing = groups.get(r.source)
    if (existing) {
      existing.push(r)
    } else {
      groups.set(r.source, [r])
    }
  }

  return SOURCE_DISPLAY_ORDER
    .filter(s => groups.has(s))
    .map(s => ({ source: s, results: groups.get(s)! }))
}
