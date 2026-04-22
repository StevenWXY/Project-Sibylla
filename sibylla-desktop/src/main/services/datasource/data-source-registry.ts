import crypto from 'crypto'
import type { Tracer } from '../trace/tracer'
import type { AppEventBus } from '../event-bus'
import { RateLimiter } from './rate-limiter'
import { QuotaExhaustedError } from './types'
import type {
  DataSourceProvider,
  DataSourceQuery,
  DataSourceResult,
  ProviderManifest,
  ProviderStatus,
  ProviderConfig,
  ConfigField,
} from './types'
import { RateLimitError } from './types'
import { logger } from '../../utils/logger'

interface CacheEntry {
  result: DataSourceResult
  expiresAt: number
}

const MAX_CACHE_SIZE = 500
const CACHE_EVICTION_COUNT = 100

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export class DataSourceRegistry {
  private providers: Map<string, DataSourceProvider> = new Map()
  private rateLimiters: Map<string, RateLimiter> = new Map()
  private manifests: Map<string, ProviderManifest> = new Map()
  private cache: Map<string, CacheEntry> = new Map()
  private cacheInsertionOrder: string[] = []
  private exhaustedCooldowns: Map<string, number> = new Map()

  constructor(
    private tracer: Tracer,
    private eventBus: AppEventBus,
    private secureStorage?: { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void> },
  ) {}

  async registerProvider(provider: DataSourceProvider, manifest: ProviderManifest): Promise<void> {
    if (this.providers.has(provider.id)) {
      throw new Error(`Provider already registered: ${provider.id}`)
    }

    const config = await this.loadProviderConfig(provider.id, manifest)
    await provider.initialize(config)

    this.providers.set(provider.id, provider)
    this.rateLimiters.set(provider.id, new RateLimiter(manifest.rateLimits))
    this.manifests.set(provider.id, manifest)

    this.eventBus.emit('datasource:provider-registered' as never, {
      id: provider.id,
      name: provider.name,
    } as never)

    logger.info('datasource.provider.registered', {
      id: provider.id,
      name: provider.name,
    })
  }

  async query<T>(providerId: string, query: DataSourceQuery): Promise<DataSourceResult<T>> {
    if (!this.tracer.isEnabled()) {
      return this.queryInternal<T>(providerId, query)
    }

    return this.tracer.withSpan('datasource.fetch', async (span) => {
      span.setAttribute('datasource.provider_id', providerId)
      span.setAttribute('datasource.operation', query.operation)
      return this.queryInternal<T>(providerId, query, span)
    }, { kind: 'tool-call' })
  }

  private async queryInternal<T>(
    providerId: string,
    query: DataSourceQuery,
    span?: import('../trace/types').Span,
  ): Promise<DataSourceResult<T>> {
    const provider = this.providers.get(providerId)
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`)
    }

    if (!provider.capabilities.includes(query.operation)) {
      throw new Error(`Provider ${providerId} does not support operation: ${query.operation}`)
    }

    const limiter = this.rateLimiters.get(providerId)!
    const manifest = this.manifests.get(providerId)!

    if (limiter.isDailyExhausted()) {
      span?.setAttribute('datasource.quota_exhausted', true)
      const now = Date.now()
      const cooldownUntil = this.exhaustedCooldowns.get(providerId) ?? 0
      if (now >= cooldownUntil) {
        this.exhaustedCooldowns.set(providerId, now + 60 * 60 * 1000)
        this.eventBus.emit('datasource:rate-limit-exhausted' as never, {
          providerId,
          resetAt: limiter.getDailyResetAt(),
        } as never)
      }
      const cached = this.getFromCache<T>(providerId, query)
      if (cached) return { ...cached, fromCache: true }
      const resetAt = limiter.getDailyResetAt()
      throw new QuotaExhaustedError(providerId, resetAt)
    }

    const cached = this.getFromCache<T>(providerId, query)
    if (cached) {
      span?.setAttribute('datasource.cache_hit', true)
      return { ...cached, fromCache: true }
    }

    try {
      limiter.acquire()
    } catch (err) {
      if (err instanceof RateLimitError) {
        span?.setAttribute('datasource.rate_limited', true)
        span?.setAttribute('datasource.retry_after_ms', err.retryAfterMs)
      }
      throw err
    }

    try {
      const result = await this.callWithRetry(provider, query, span)
      limiter.release()
      limiter.incrementDaily()

      this.saveToCache(providerId, query, result, manifest.defaultCacheTTLSeconds)
      return result as DataSourceResult<T>
    } catch (error) {
      limiter.release()
      throw error
    }
  }

  async getProviderStatus(id: string): Promise<ProviderStatus> {
    const provider = this.providers.get(id)
    const limiter = this.rateLimiters.get(id)
    const manifest = this.manifests.get(id)

    if (!provider || !limiter || !manifest) {
      throw new Error(`Provider not found: ${id}`)
    }

    let healthy = false
    try {
      healthy = await provider.isHealthy()
    } catch {
      healthy = false
    }

    return {
      id,
      healthy,
      dailyQuotaUsed: limiter.getDailyCount(),
      dailyQuotaTotal: manifest.rateLimits.requestsPerDay ?? Infinity,
      cacheSize: this.cache.size,
    }
  }

  listProviders(): Array<{ id: string; name: string; capabilities: readonly string[] }> {
    return [...this.providers.values()].map(p => ({
      id: p.id,
      name: p.name,
      capabilities: p.capabilities,
    }))
  }

  async dispose(): Promise<void> {
    for (const provider of this.providers.values()) {
      await provider.dispose()
    }
    this.providers.clear()
    this.rateLimiters.clear()
    this.manifests.clear()
    this.cache.clear()
    this.cacheInsertionOrder = []
  }

  private async loadProviderConfig(providerId: string, manifest: ProviderManifest): Promise<ProviderConfig> {
    const config: Record<string, unknown> = {}
    for (const [key, field] of Object.entries(manifest.configSchema)) {
      const configField = field as ConfigField
      if (configField.sensitive) {
        let value: string | undefined
        if (this.secureStorage) {
          const storageKey = `${providerId}.${key}`
          value = (await this.secureStorage.get(storageKey)) ?? undefined
        }
        if (!value) {
          value = process.env[`${providerId.toUpperCase().replace(/-/g, '_')}_${key.toUpperCase()}`] ?? configField.default as string | undefined
        }
        config[key] = value
      } else {
        config[key] = configField.default
      }
    }
    return config
  }

  private async callWithRetry(
    provider: DataSourceProvider,
    query: DataSourceQuery,
    span?: import('../trace/types').Span,
  ): Promise<DataSourceResult> {
    const maxAttempts = 3
    const retryDelays = [1000, 3000]
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await provider.query(query)
        span?.setAttribute('datasource.attempt', attempt)
        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        if (attempt >= maxAttempts) break

        const delay = retryDelays[attempt - 1] ?? 1000
        span?.addEvent('datasource.retry', {
          attempt,
          error: lastError.message,
          delay,
        })
        await sleep(delay)
      }
    }

    throw lastError ?? new Error('Unknown error in callWithRetry')
  }

  private getFromCache<T>(providerId: string, query: DataSourceQuery): DataSourceResult<T> | null {
    const cacheKey = this.computeCacheKey(providerId, query)
    const entry = this.cache.get(cacheKey)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(cacheKey)
      return null
    }

    return entry.result as DataSourceResult<T>
  }

  private saveToCache(
    providerId: string,
    query: DataSourceQuery,
    result: DataSourceResult,
    ttlSeconds: number,
  ): void {
    const cacheKey = this.computeCacheKey(providerId, query)

    if (this.cache.size >= MAX_CACHE_SIZE) {
      for (let i = 0; i < CACHE_EVICTION_COUNT && this.cacheInsertionOrder.length > 0; i++) {
        const oldestKey = this.cacheInsertionOrder.shift()
        if (oldestKey) this.cache.delete(oldestKey)
      }
    }

    this.cache.set(cacheKey, {
      result,
      expiresAt: Date.now() + ttlSeconds * 1000,
    })
    this.cacheInsertionOrder.push(cacheKey)
  }

  private computeCacheKey(providerId: string, query: DataSourceQuery): string {
    const raw = JSON.stringify({ providerId, operation: query.operation, params: query.params })
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16)
  }
}
