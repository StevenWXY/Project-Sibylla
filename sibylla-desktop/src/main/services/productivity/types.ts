export type AnalysisPeriod = 'week' | 'month' | 'quarter'

export interface DimensionScore {
  raw: number
  normalized: number
  weight: number
  label: string
  details?: string
  isNA?: boolean
}

export interface ProductivityReport {
  period: AnalysisPeriod
  memberId?: string
  viewerId: string
  dimensions: {
    taskCompletion: DimensionScore
    docContribution: DimensionScore
    collabResponsiveness: DimensionScore
    knowledgeContribution: DimensionScore
  }
  overall: number
  generatedAt: string
  dataSufficient: boolean
  insufficientNotice?: string
  isAnonymized: boolean
  adminView?: boolean
}

export interface AnalyzeOptions {
  period: AnalysisPeriod
  memberId?: string
  viewerId: string
}

export interface CacheEntry {
  report: ProductivityReport
  cachedAt: number
}

export interface DateRange {
  since: Date
  until: Date
}

export const PRIORITY_WEIGHTS: Readonly<Record<string, number>> = {
  P0: 3,
  P1: 2,
  P2: 1,
}

export const FILE_TYPE_WEIGHTS: Readonly<Record<string, number>> = {
  'docs/': 1.5,
  'personal/': 0.5,
}

export const DEFAULT_FILE_WEIGHT = 1.0

export const CACHE_TTL_MS = 60000

export const DATA_SUFFICIENCY_DAYS = 7

export const DEFAULT_DIMENSION_WEIGHT = 0.25
