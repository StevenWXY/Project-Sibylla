export type SearchSource =
  | 'local-files'
  | 'memory'
  | 'memory-archive'
  | 'handbook'
  | 'mcp:github'
  | 'mcp:slack'
  | 'mcp:notion'
  | 'plans-archive'

export interface RankingWeights {
  vector: number
  fts: number
  recency: number
  sourcePriority: number
}

export interface UnifiedSearchQuery {
  query: string
  sources?: SearchSource[]
  filters?: {
    fileTypes?: string[]
    pathPrefix?: string
    minConfidence?: number
    timeRange?: { from: string; to: string }
  }
  limit?: number
  offset?: number
  rankingWeights?: RankingWeights
  timeoutMs?: number
}

export type SearchResultType = 'file' | 'memory-entry' | 'handbook-entry' | 'mcp-record'

export interface UnifiedSearchResult {
  id: string
  source: SearchSource
  type: SearchResultType
  title: string
  snippet: string
  fullPath?: string
  stale?: boolean
  metadata: {
    score: number
    vectorScore?: number
    bm25Score?: number
    recencyScore?: number
    confidence?: number
    updatedAt?: string
    fromCache?: boolean
    [key: string]: unknown
  }
  navigation:
    | { kind: 'file'; path: string; line?: number }
    | { kind: 'memory'; entryId: string }
    | { kind: 'handbook'; entryId: string }
    | { kind: 'external'; url: string }
}

export interface UnifiedSearchResponse {
  results: UnifiedSearchResult[]
  totalCount: number
  partial: boolean
  timing: {
    totalMs: number
    perSource: Record<string, number>
  }
}

export interface SearchSourceAdapter {
  search(query: UnifiedSearchQuery): Promise<UnifiedSearchResult[]>
}

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  vector: 0.4,
  fts: 0.4,
  recency: 0.1,
  sourcePriority: 0.1,
}

export interface ParsedSourcePrefix {
  cleanQuery: string
  sources?: SearchSource[]
}
