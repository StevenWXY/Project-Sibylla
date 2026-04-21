import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PerformanceMonitor, type PerformanceMetrics, type PerformanceConfig } from '../../src/main/services/trace/performance-monitor'
import { AppEventBus } from '../../src/main/services/event-bus'
import type { TraceStore } from '../../src/main/services/trace/trace-store'
import type { SerializedSpan, TraceQueryFilter } from '../../src/main/services/trace/types'

vi.mock('../../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    setLevel: vi.fn(),
  },
}))

function createMockTraceStore(spans: SerializedSpan[] = []): TraceStore {
  return {
    query: vi.fn((filter: TraceQueryFilter) => {
      let result = [...spans]
      if (filter.kind) result = result.filter(s => s.kind === filter.kind)
      if (filter.startTimeFrom) result = result.filter(s => s.startTimeMs >= filter.startTimeFrom!)
      if (filter.startTimeTo) result = result.filter(s => s.endTimeMs <= filter.startTimeTo!)
      if (filter.status) result = result.filter(s => s.status === filter.status)
      return result
    }),
    getTraceTree: vi.fn(() => spans),
    getRecentTraces: vi.fn(() => []),
    getStats: vi.fn(() => ({ totalSpans: spans.length, totalTraces: 1, dbSizeBytes: 0 })),
    close: vi.fn(),
  } as unknown as TraceStore
}

function makeSpan(overrides: Partial<SerializedSpan> = {}): SerializedSpan {
  return {
    traceId: 'test-trace',
    spanId: `span-${Math.random().toString(36).slice(2)}`,
    name: 'ai.llm-call',
    kind: 'ai-call',
    startTimeMs: Date.now() - 5000,
    endTimeMs: Date.now(),
    durationMs: 5000,
    status: 'ok',
    attributes: {},
    events: [],
    ...overrides,
  }
}

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor
  let eventBus: AppEventBus

  beforeEach(() => {
    eventBus = new AppEventBus()
  })

  afterEach(() => {
    monitor?.stop()
  })

  it('computeMetrics — correctly computes LLM call statistics', () => {
    const spans = [
      makeSpan({ durationMs: 100, attributes: { token_count: 500, model: 'gpt-4' } }),
      makeSpan({ durationMs: 200, attributes: { token_count: 1000, model: 'gpt-4' } }),
      makeSpan({ durationMs: 300, attributes: { token_count: 1500, model: 'gpt-4' } }),
      makeSpan({ durationMs: 10000, status: 'error', attributes: { token_count: 2000, model: 'gpt-4' } }),
    ]
    const traceStore = createMockTraceStore(spans)
    const config: Partial<PerformanceConfig> = {
      modelPricingConfig: { 'gpt-4': 0.03 },
    }
    monitor = new PerformanceMonitor(traceStore, config, eventBus, {
      info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), setLevel: vi.fn(),
    })

    monitor.start()
    monitor.stop()

    const metrics = monitor.getMetrics()
    expect(metrics).not.toBeNull()
    expect(metrics!.llmCallCount).toBe(4)
    expect(metrics!.llmCallAvgDurationMs).toBeCloseTo(2650, -2)
    expect(metrics!.errorRate).toBeCloseTo(0.25)
    expect(metrics!.totalTokens).toBe(5000)
  })

  it('slow call detection — marks calls above threshold', () => {
    const spans = [
      makeSpan({ durationMs: 12000 }),
      makeSpan({ durationMs: 11000 }),
      makeSpan({ durationMs: 11000 }),
    ]
    const traceStore = createMockTraceStore(spans)
    const config: Partial<PerformanceConfig> = {
      slowCallThresholdMs: 10000,
    }
    monitor = new PerformanceMonitor(traceStore, config, eventBus, {
      info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), setLevel: vi.fn(),
    })

    monitor.start()
    monitor.stop()
    const metrics = monitor.getMetrics()
    expect(metrics!.llmCallP95DurationMs).toBeGreaterThanOrEqual(10000)
  })

  it('error rate detection — error rate above threshold', () => {
    const spans = [
      makeSpan({ status: 'error' }),
      makeSpan({ status: 'error' }),
      makeSpan({ status: 'error' }),
      makeSpan({ status: 'ok' }),
      makeSpan({ status: 'ok' }),
    ]
    const traceStore = createMockTraceStore(spans)
    monitor = new PerformanceMonitor(traceStore, { errorRateThreshold: 0.05 }, eventBus, {
      info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), setLevel: vi.fn(),
    })

    monitor.start()
    monitor.stop()
    const metrics = monitor.getMetrics()
    expect(metrics!.errorRate).toBeGreaterThan(0.05)
  })

  it('token spike detection — total tokens above threshold', () => {
    const spans = [
      makeSpan({ attributes: { token_count: 40000 } }),
    ]
    const traceStore = createMockTraceStore(spans)
    monitor = new PerformanceMonitor(traceStore, { tokenSpikeThreshold: 30000 }, eventBus, {
      info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), setLevel: vi.fn(),
    })

    monitor.start()
    monitor.stop()
    const metrics = monitor.getMetrics()
    expect(metrics!.totalTokens).toBeGreaterThan(30000)
  })

  it('consecutive alert — triggers after 3 consecutive windows', () => {
    const spans = [makeSpan({ durationMs: 12000 })]
    const traceStore = createMockTraceStore(spans)
    const alertSpy = vi.fn()
    eventBus.on('performance:alert', alertSpy)

    monitor = new PerformanceMonitor(traceStore, { slowCallThresholdMs: 10000 }, eventBus, {
      info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), setLevel: vi.fn(),
    })

    for (let i = 0; i < 3; i++) {
      const internalMonitor = monitor as unknown as { aggregateAndAlert: () => void }
      internalMonitor.aggregateAndAlert()
    }

    expect(alertSpy).toHaveBeenCalled()
    const alerts = monitor.getAlerts()
    expect(alerts.length).toBeGreaterThan(0)
    expect(alerts[0].type).toBe('slow_call')
  })

  it('suppress alert — does not trigger when suppressed', () => {
    const spans = [makeSpan({ durationMs: 12000 })]
    const traceStore = createMockTraceStore(spans)
    const alertSpy = vi.fn()
    eventBus.on('performance:alert', alertSpy)

    monitor = new PerformanceMonitor(traceStore, { slowCallThresholdMs: 10000 }, eventBus, {
      info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), setLevel: vi.fn(),
    })

    monitor.suppress('slow_call', 60000)

    for (let i = 0; i < 5; i++) {
      const internalMonitor = monitor as unknown as { aggregateAndAlert: () => void }
      internalMonitor.aggregateAndAlert()
    }

    expect(alertSpy).not.toHaveBeenCalled()
    expect(monitor.isSuppressed('slow_call')).toBe(true)
  })

  it('auto-clear alert — clears after 5 consecutive normal windows', () => {
    const highDurationSpans = [makeSpan({ durationMs: 12000 })]
    const normalSpans = [makeSpan({ durationMs: 100 })]
    let currentSpans = highDurationSpans
    const traceStore = {
      query: vi.fn(() => currentSpans),
    } as unknown as TraceStore

    const clearedSpy = vi.fn()
    eventBus.on('performance:alert-cleared', clearedSpy)

    monitor = new PerformanceMonitor(traceStore, { slowCallThresholdMs: 10000 }, eventBus, {
      info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), setLevel: vi.fn(),
    })

    for (let i = 0; i < 3; i++) {
      const internalMonitor = monitor as unknown as { aggregateAndAlert: () => void }
      internalMonitor.aggregateAndAlert()
    }

    expect(monitor.getAlerts().length).toBeGreaterThan(0)

    currentSpans = normalSpans
    for (let i = 0; i < 5; i++) {
      const internalMonitor = monitor as unknown as { aggregateAndAlert: () => void }
      internalMonitor.aggregateAndAlert()
    }

    expect(clearedSpy).toHaveBeenCalledWith({ type: 'slow_call' })
  })

  it('estimated cost — includes USD cost in metrics', () => {
    const spans = [
      makeSpan({ attributes: { model: 'gpt-4', input_tokens: 1000, output_tokens: 500 } }),
    ]
    const traceStore = createMockTraceStore(spans)
    monitor = new PerformanceMonitor(traceStore, { modelPricingConfig: { 'gpt-4': 0.03 } }, eventBus, {
      info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), setLevel: vi.fn(),
    })

    monitor.start()
    monitor.stop()
    const metrics = monitor.getMetrics()
    expect(metrics!.estimatedCostUSD).toBeCloseTo(0.045, 2)
  })
})
