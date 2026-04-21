import type { TraceStore } from './trace-store'
import type { AppEventBus } from '../event-bus'
import type { logger as loggerType } from '../../utils/logger'
import type {
  PerformanceMetricsShared,
  PerformanceAlertShared,
  PerformanceConfigShared,
  PerformanceAlertTypeShared,
  PerformanceAlertSeverityShared,
} from '../../../shared/types'
import type { SerializedSpan } from './types'

export interface PerformanceMetrics {
  windowStart: number
  windowEnd: number
  llmCallCount: number
  llmCallAvgDurationMs: number
  llmCallP95DurationMs: number
  errorRate: number
  totalTokens: number
  estimatedCostUSD: number
  degradationCount: number
  activeSpanCount: number
}

export interface PerformanceAlert {
  id: string
  type: PerformanceAlertTypeShared
  severity: PerformanceAlertSeverityShared
  message: string
  metrics: Partial<PerformanceMetrics>
  firstSeenAt: number
  consecutiveWindows: number
}

export interface PerformanceConfig {
  slowCallThresholdMs: number
  tokenSpikeThreshold: number
  errorRateThreshold: number
  degradationThreshold: number
  activeSpanLeakThreshold: number
  modelPricingConfig: Record<string, number>
}

interface AlertState {
  consecutiveCount: number
  wasAlerting: boolean
  firstSeenAt: number | null
}

interface AlertChecker {
  type: PerformanceAlertTypeShared
  severity: PerformanceAlertSeverityShared
  check(metrics: PerformanceMetrics, config: PerformanceConfig): boolean
  buildMessage(metrics: PerformanceMetrics, config: PerformanceConfig): string
}

const DEFAULT_CONFIG: PerformanceConfig = {
  slowCallThresholdMs: 10_000,
  tokenSpikeThreshold: 30_000,
  errorRateThreshold: 0.05,
  degradationThreshold: 3,
  activeSpanLeakThreshold: 100,
  modelPricingConfig: {},
}

const CONSECUTIVE_WINDOWS_TO_ALERT = 3
const AGGREGATION_INTERVAL_MS = 60_000
const WINDOW_DURATION_MS = 15 * 60 * 1000

export class PerformanceMonitor {
  private readonly traceStore: TraceStore
  private readonly config: PerformanceConfig
  private readonly eventBus: AppEventBus
  private readonly logger: typeof loggerType
  private readonly alertStates: Map<string, AlertState> = new Map()
  private readonly suppressions: Map<string, number> = new Map()
  private aggregationInterval: ReturnType<typeof setInterval> | null = null
  private lastMetrics: PerformanceMetrics | null = null
  private readonly activeAlerts: Map<string, PerformanceAlert> = new Map()

  constructor(
    traceStore: TraceStore,
    config: Partial<PerformanceConfig> = {},
    eventBus: AppEventBus,
    loggerImpl: typeof loggerType,
  ) {
    this.traceStore = traceStore
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.eventBus = eventBus
    this.logger = loggerImpl
  }

  start(): void {
    if (this.aggregationInterval) {
      return
    }
    this.aggregationInterval = setInterval(() => {
      try {
        this.aggregateAndAlert()
      } catch (err) {
        this.logger.error('[PerformanceMonitor] Error in aggregation cycle', err)
      }
    }, AGGREGATION_INTERVAL_MS)
    this.logger.info('[PerformanceMonitor] Started with 60s aggregation interval')
  }

  stop(): void {
    if (this.aggregationInterval) {
      clearInterval(this.aggregationInterval)
      this.aggregationInterval = null
    }
    this.logger.info('[PerformanceMonitor] Stopped')
  }

  private aggregateAndAlert(): void {
    const metrics = this.computeMetrics()
    this.lastMetrics = metrics
    this.eventBus.emitPerformanceMetrics(metrics)

    const checkers = this.alertCheckers()
    for (const checker of checkers) {
      const state = this.alertStates.get(checker.type) ?? {
        consecutiveCount: 0,
        wasAlerting: false,
        firstSeenAt: null,
      }

      const isBreaching = checker.check(metrics, this.config)

      if (isBreaching) {
        state.consecutiveCount++
        if (state.firstSeenAt === null) {
          state.firstSeenAt = Date.now()
        }
      } else {
        state.consecutiveCount = Math.max(0, state.consecutiveCount - 1)
      }

      if (state.consecutiveCount >= CONSECUTIVE_WINDOWS_TO_ALERT && !state.wasAlerting) {
        if (!this.isSuppressed(checker.type)) {
          const alert: PerformanceAlert = {
            id: `perf-alert-${checker.type}-${Date.now()}`,
            type: checker.type,
            severity: checker.severity,
            message: checker.buildMessage(metrics, this.config),
            metrics: this.extractRelevantMetrics(checker.type, metrics),
            firstSeenAt: state.firstSeenAt ?? Date.now(),
            consecutiveWindows: state.consecutiveCount,
          }
          this.activeAlerts.set(checker.type, alert)
          state.wasAlerting = true
          this.eventBus.emitPerformanceAlert(alert)
        }
      }

      if (state.consecutiveCount === 0 && state.wasAlerting) {
        this.activeAlerts.delete(checker.type)
        state.wasAlerting = false
        state.firstSeenAt = null
        this.eventBus.emitPerformanceAlertCleared({ type: checker.type })
      }

      this.alertStates.set(checker.type, state)
    }
  }

  private computeMetrics(): PerformanceMetrics {
    const now = Date.now()
    const windowStart = now - WINDOW_DURATION_MS

    const spans = this.traceStore.query({
      kind: 'ai-call',
      startTimeFrom: windowStart,
      startTimeTo: now,
    })

    const llmCallCount = spans.length
    const durations = spans.map(s => s.durationMs).sort((a, b) => a - b)
    const llmCallAvgDurationMs = llmCallCount > 0
      ? durations.reduce((sum, d) => sum + d, 0) / llmCallCount
      : 0
    const llmCallP95DurationMs = llmCallCount > 0
      ? durations[Math.floor(llmCallCount * 0.95)] ?? durations[durations.length - 1] ?? 0
      : 0

    const errorCount = spans.filter(s => s.status === 'error').length
    const errorRate = llmCallCount > 0 ? errorCount / llmCallCount : 0

    const totalTokens = spans.reduce((sum, s) => {
      const tc = s.attributes['token_count']
      return sum + (typeof tc === 'number' ? tc : 0)
    }, 0)

    const estimatedCostUSD = this.computeEstimatedCost(spans)

    const allSpansInWindow = this.traceStore.query({
      startTimeFrom: windowStart,
    })
    const recentAllSpans = allSpansInWindow.filter(s => s.endTimeMs <= now || s.endTimeMs === 0)
    const degradationCount = recentAllSpans.filter(
      s => s.attributes['degradation'] === true || s.status === 'error',
    ).length

    const activeSpanCount = recentAllSpans.filter(
      s => s.endTimeMs === 0 || s.endTimeMs > now,
    ).length

    return {
      windowStart,
      windowEnd: now,
      llmCallCount,
      llmCallAvgDurationMs,
      llmCallP95DurationMs,
      errorRate,
      totalTokens,
      estimatedCostUSD,
      degradationCount,
      activeSpanCount,
    }
  }

  private computeEstimatedCost(spans: SerializedSpan[]): number {
    let total = 0
    for (const span of spans) {
      const model = String(span.attributes['model'] ?? '')
      const inputTokens = typeof span.attributes['input_tokens'] === 'number'
        ? span.attributes['input_tokens'] as number : 0
      const outputTokens = typeof span.attributes['output_tokens'] === 'number'
        ? span.attributes['output_tokens'] as number : 0
      const pricePer1k = this.config.modelPricingConfig[model]
      if (pricePer1k !== undefined) {
        total += ((inputTokens + outputTokens) / 1000) * pricePer1k
      }
    }
    return total
  }

  private alertCheckers(): AlertChecker[] {
    return [
      {
        type: 'slow_call',
        severity: 'warn',
        check: (m, c) => m.llmCallP95DurationMs > c.slowCallThresholdMs,
        buildMessage: (m, c) =>
          `P95 LLM call duration ${Math.round(m.llmCallP95DurationMs)}ms exceeds threshold ${c.slowCallThresholdMs}ms`,
      },
      {
        type: 'token_spike',
        severity: 'warn',
        check: (m, c) => m.totalTokens > c.tokenSpikeThreshold,
        buildMessage: (m, c) =>
          `Total tokens ${m.totalTokens} exceeds threshold ${c.tokenSpikeThreshold}`,
      },
      {
        type: 'error_rate',
        severity: 'critical',
        check: (m, c) => m.llmCallCount > 0 && m.errorRate > c.errorRateThreshold,
        buildMessage: (m, c) =>
          `Error rate ${(m.errorRate * 100).toFixed(1)}% exceeds threshold ${(c.errorRateThreshold * 100).toFixed(1)}%`,
      },
      {
        type: 'degradation',
        severity: 'warn',
        check: (m, c) => m.degradationCount > c.degradationThreshold,
        buildMessage: (m, c) =>
          `Degradation count ${m.degradationCount} exceeds threshold ${c.degradationThreshold}`,
      },
      {
        type: 'leak',
        severity: 'critical',
        check: (m, c) => m.activeSpanCount > c.activeSpanLeakThreshold,
        buildMessage: (m, c) =>
          `Active span count ${m.activeSpanCount} exceeds threshold ${c.activeSpanLeakThreshold}`,
      },
    ]
  }

  private extractRelevantMetrics(
    type: PerformanceAlertTypeShared,
    metrics: PerformanceMetrics,
  ): Partial<PerformanceMetrics> {
    switch (type) {
      case 'slow_call':
        return {
          llmCallCount: metrics.llmCallCount,
          llmCallAvgDurationMs: metrics.llmCallAvgDurationMs,
          llmCallP95DurationMs: metrics.llmCallP95DurationMs,
        }
      case 'token_spike':
        return { totalTokens: metrics.totalTokens, estimatedCostUSD: metrics.estimatedCostUSD }
      case 'error_rate':
        return { llmCallCount: metrics.llmCallCount, errorRate: metrics.errorRate }
      case 'degradation':
        return { degradationCount: metrics.degradationCount }
      case 'leak':
        return { activeSpanCount: metrics.activeSpanCount }
    }
  }

  suppress(alertType: string, durationMs: number = 86_400_000): void {
    this.suppressions.set(alertType, Date.now() + durationMs)
    this.logger.info(`[PerformanceMonitor] Suppressed alert type '${alertType}' for ${durationMs}ms`)
  }

  isSuppressed(alertType: string): boolean {
    const expiry = this.suppressions.get(alertType)
    if (expiry === undefined) return false
    if (Date.now() > expiry) {
      this.suppressions.delete(alertType)
      return false
    }
    return true
  }

  getMetrics(): PerformanceMetrics | null {
    return this.lastMetrics
  }

  getAlerts(): PerformanceAlert[] {
    return Array.from(this.activeAlerts.values())
  }

  toSharedMetrics(metrics: PerformanceMetrics): PerformanceMetricsShared {
    return { ...metrics }
  }

  toSharedAlert(alert: PerformanceAlert): PerformanceAlertShared {
    return { ...alert }
  }

  toSharedConfig(): PerformanceConfigShared {
    return { ...this.config }
  }
}

