export type DataSourceOperation = 'fetch' | 'search' | 'list' | 'write'

export interface DataSourceQuery {
  readonly operation: DataSourceOperation
  readonly params: Readonly<Record<string, unknown>>
  readonly timeoutMs?: number
}

export interface DataSourceResult<T = unknown> {
  readonly data: T
  readonly fromCache: boolean
  readonly fetchedAt: string
  readonly providerId: string
  readonly truncated?: boolean
  readonly truncationReason?: string
}

export interface DataSourceProvider {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly capabilities: readonly DataSourceOperation[]
  initialize(config: ProviderConfig): Promise<void>
  isHealthy(): Promise<boolean>
  query(q: DataSourceQuery): Promise<DataSourceResult>
  dispose(): Promise<void>
}

export interface ProviderConfig {
  readonly [key: string]: unknown
}

export interface ConfigField {
  readonly type: 'string' | 'number' | 'boolean'
  readonly required?: boolean
  readonly sensitive?: boolean
  readonly default?: unknown
}

export interface ProviderManifest {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly capabilities: readonly DataSourceOperation[]
  readonly configSchema: Readonly<Record<string, ConfigField>>
  readonly rateLimits: {
    readonly requestsPerMinute?: number
    readonly requestsPerDay?: number
    readonly concurrent?: number
  }
  readonly defaultCacheTTLSeconds: number
}

export interface ProviderStatus {
  readonly id: string
  readonly healthy: boolean
  readonly dailyQuotaUsed: number
  readonly dailyQuotaTotal: number
  readonly cacheSize: number
}

export class RateLimitError extends Error {
  readonly retryAfterMs: number
  constructor(providerId: string, retryAfterMs: number) {
    super(`Rate limit exceeded for ${providerId}. Retry after ${retryAfterMs}ms`)
    this.name = 'RateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}

export class QuotaExhaustedError extends Error {
  readonly providerId: string
  readonly resetAt: number
  constructor(providerId: string, resetAt: number) {
    super(`Daily quota exhausted for ${providerId}`)
    this.name = 'QuotaExhaustedError'
    this.providerId = providerId
    this.resetAt = resetAt
  }
}
