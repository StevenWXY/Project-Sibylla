import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DataSourceRegistry } from '../../src/main/services/datasource/data-source-registry'
import type { DataSourceProvider, DataSourceQuery, DataSourceResult, ProviderManifest } from '../../src/main/services/datasource/types'
import type { AppEventBus } from '../../src/main/services/event-bus'

vi.mock('../../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    setLevel: vi.fn(),
  },
}))

function createMockProvider(overrides: Partial<DataSourceProvider> = {}): DataSourceProvider {
  return {
    id: 'test-provider',
    name: 'Test Provider',
    version: '1.0.0',
    capabilities: ['fetch', 'search'],
    initialize: vi.fn(),
    isHealthy: vi.fn(async () => true),
    query: vi.fn(async (): Promise<DataSourceResult> => ({
      data: { result: 'ok' },
      fromCache: false,
      fetchedAt: new Date().toISOString(),
      providerId: 'test-provider',
    })),
    dispose: vi.fn(),
    ...overrides,
  }
}

const defaultManifest: ProviderManifest = {
  id: 'test-provider',
  name: 'Test Provider',
  version: '1.0.0',
  capabilities: ['fetch', 'search'],
  configSchema: {},
  rateLimits: { requestsPerMinute: 60, requestsPerDay: 1000 },
  defaultCacheTTLSeconds: 300,
}

function createMockTracer() {
  return {
    isEnabled: vi.fn(() => false),
    withSpan: vi.fn(async (_name: string, fn: (span: unknown) => Promise<unknown>) => fn({ setAttribute: vi.fn(), addEvent: vi.fn() })),
    startSpan: vi.fn(),
  }
}

function createMockEventBus() {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {}
  return {
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(cb)
    }),
    emit: vi.fn((event: string, ...args: unknown[]) => {
      for (const cb of listeners[event] ?? []) cb(...args)
    }),
    removeAllListeners: vi.fn(),
  } as unknown as AppEventBus
}

describe('DataSourceRegistry', () => {
  let registry: DataSourceRegistry
  let tracer: ReturnType<typeof createMockTracer>
  let eventBus: ReturnType<typeof createMockEventBus>

  beforeEach(() => {
    tracer = createMockTracer()
    eventBus = createMockEventBus()
    registry = new DataSourceRegistry(tracer, eventBus)
  })

  describe('registerProvider', () => {
    it('registers a provider successfully', async () => {
      const provider = createMockProvider()
      await registry.registerProvider(provider, defaultManifest)

      const providers = registry.listProviders()
      expect(providers).toHaveLength(1)
      expect(providers[0]?.id).toBe('test-provider')
    })

    it('throws on duplicate ID', async () => {
      const provider = createMockProvider()
      await registry.registerProvider(provider, defaultManifest)

      await expect(registry.registerProvider(provider, defaultManifest)).rejects.toThrow(
        'Provider already registered',
      )
    })

    it('emits provider-registered event', async () => {
      const provider = createMockProvider()
      await registry.registerProvider(provider, defaultManifest)

      expect(eventBus.emit).toHaveBeenCalledWith(
        'datasource:provider-registered' as never,
        expect.objectContaining({ id: 'test-provider' }) as never,
      )
    })
  })

  describe('query', () => {
    it('returns successful result', async () => {
      const provider = createMockProvider()
      await registry.registerProvider(provider, defaultManifest)

      const result = await registry.query('test-provider', {
        operation: 'fetch',
        params: { path: '/test' },
      })

      expect(result.data).toEqual({ result: 'ok' })
      expect(result.fromCache).toBe(false)
    })

    it('throws when provider not found', async () => {
      await expect(
        registry.query('nonexistent', { operation: 'fetch', params: {} }),
      ).rejects.toThrow('Provider not found')
    })

    it('throws when operation not supported', async () => {
      const provider = createMockProvider({ capabilities: ['fetch'] })
      await registry.registerProvider(provider, defaultManifest)

      await expect(
        registry.query('test-provider', { operation: 'write', params: {} }),
      ).rejects.toThrow('does not support operation')
    })

    it('caches results', async () => {
      const provider = createMockProvider()
      await registry.registerProvider(provider, defaultManifest)

      const query: DataSourceQuery = { operation: 'fetch', params: { path: '/test' } }
      await registry.query('test-provider', query)
      await registry.query('test-provider', query)

      expect(provider.query).toHaveBeenCalledTimes(1)
    })
  })

  describe('getProviderStatus', () => {
    it('returns provider status', async () => {
      const provider = createMockProvider()
      await registry.registerProvider(provider, defaultManifest)

      const status = await registry.getProviderStatus('test-provider')
      expect(status.id).toBe('test-provider')
      expect(status.dailyQuotaTotal).toBe(1000)
    })

    it('throws for unknown provider', async () => {
      await expect(registry.getProviderStatus('unknown')).rejects.toThrow('Provider not found')
    })
  })

  describe('dispose', () => {
    it('cleans up all providers', async () => {
      const provider = createMockProvider()
      await registry.registerProvider(provider, defaultManifest)

      await registry.dispose()

      expect(provider.dispose).toHaveBeenCalled()
      expect(registry.listProviders()).toHaveLength(0)
    })
  })
})
