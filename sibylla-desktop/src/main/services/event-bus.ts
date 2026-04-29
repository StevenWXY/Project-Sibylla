import { EventEmitter } from 'events'
import { ulid } from 'ulid'
import type { SerializedSpan } from './trace/types'
import type { TaskRecord } from './progress/types'
import type { PerformanceMetrics, PerformanceAlert } from './trace/performance-monitor'
import type {
  SibyllaEvent,
  SibyllaEventType,
  EventHandler,
} from './event-bus-types'
import type { Tracer } from './trace/tracer'

type EventMap = {
  'trace:span-ended': [span: SerializedSpan]
  'trace:update': [traceId: string]
  'progress:task-declared': [task: TaskRecord]
  'progress:task-updated': [task: TaskRecord]
  'progress:task-completed': [task: TaskRecord]
  'progress:task-failed': [task: TaskRecord]
  'progress:user-edit-conflict': []
  'performance:metrics': [metrics: PerformanceMetrics]
  'performance:alert': [alert: PerformanceAlert]
  'performance:alert-cleared': [payload: { type: string }]
  'datasource:rate-limit-exhausted': [payload: { providerId: string; resetAt: number }]
  'datasource:provider-registered': [payload: { id: string; name: string }]
  'conversation:export': [payload: { format: string; conversationId: string }]
  'model:switched': [payload: { conversationId: string; oldModel: string; newModel: string }]
  'aiMode:changed': [payload: { conversationId: string; from?: string; to: string }]
  'plan:created': [payload: Record<string, unknown>]
  'plan:execution-started': [payload: Record<string, unknown>]
  'plan:steps-completed': [payload: Record<string, unknown>]
  'plan:archived': [payload: Record<string, unknown>]
  'plan:abandoned': [payload: Record<string, unknown>]
  'git:pull-completed': [payload: { commitCount: number }]
  'memory:sync-locked': [payload: { reason: string }]
  'task:cross-device-resumeable': [payload: { taskId: string; lastSessionId?: string }]
}

interface EventLogStore {
  append(event: SibyllaEvent): Promise<void>
}

export class AppEventBus extends EventEmitter {
  private readonly unifiedHandlers = new Map<SibyllaEventType, Set<EventHandler>>()
  private readonly wildcards = new Set<EventHandler>()
  private eventLogStore?: EventLogStore
  private tracer?: Tracer

  private emitCounter = 0
  private lastCountReset = Date.now()
  private readonly BACKPRESSURE_THRESHOLD = 100

  private readonly inFlightHandlers = new Set<Promise<unknown>>()
  private isShuttingDown = false

  setEventLogStore(store: EventLogStore): void {
    this.eventLogStore = store
  }

  setTracer(tracer: Tracer): void {
    this.tracer = tracer
  }

  emitEvent<T>(partial: Omit<SibyllaEvent<T>, 'id' | 'timestamp'>): void {
    if (this.isShuttingDown) return

    const event: SibyllaEvent<T> = {
      ...partial,
      id: ulid(),
      timestamp: Date.now(),
    }

    if (this.tracer) {
      void this.tracer.withSpan(`event:${event.type}`, (span) => {
        span.setAttributes({ 'event.id': event.id, 'event.source': event.source })
        return Promise.resolve(undefined)
      }, { kind: 'system' })
    }

    if (event.persist && this.eventLogStore) {
      this.eventLogStore.append(event as SibyllaEvent)
    }

    this.checkBackpressure()

    const targeted = this.unifiedHandlers.get(event.type)
    const allHandlers = [...(targeted ?? []), ...this.wildcards]
    for (const handler of allHandlers) {
      try {
        const result = handler(event as SibyllaEvent)
        if (result instanceof Promise) {
          this.inFlightHandlers.add(result)
          result.finally(() => this.inFlightHandlers.delete(result))
        }
      } catch (err) {
        console.error('[AppEventBus] event.handler.failed', {
          eventType: event.type,
          handlerName: handler.name || 'anonymous',
          err,
        })
      }
    }
  }

  subscribe<T = unknown>(type: SibyllaEventType, handler: EventHandler<T>): () => void {
    if (!this.unifiedHandlers.has(type)) {
      this.unifiedHandlers.set(type, new Set())
    }
    const typedHandler = handler as EventHandler
    this.unifiedHandlers.get(type)!.add(typedHandler)
    return () => {
      this.unifiedHandlers.get(type)?.delete(typedHandler)
    }
  }

  subscribeWithFilter<T = unknown>(
    types: SibyllaEventType[],
    filter: (event: SibyllaEvent<T>) => boolean,
    handler: EventHandler<T>,
  ): () => void {
    const filteredHandler: EventHandler = (event) => {
      if (filter(event as SibyllaEvent<T>)) {
        handler(event as SibyllaEvent<T>)
      }
    }
    const unsubscribers: Array<() => void> = []
    for (const type of types) {
      if (!this.unifiedHandlers.has(type)) {
        this.unifiedHandlers.set(type, new Set())
      }
      this.unifiedHandlers.get(type)!.add(filteredHandler)
      const typeRef = type
      unsubscribers.push(() => this.unifiedHandlers.get(typeRef)?.delete(filteredHandler))
    }
    return () => { for (const unsub of unsubscribers) unsub() }
  }

  subscribeAny(handler: EventHandler): () => void {
    this.wildcards.add(handler)
    return () => {
      this.wildcards.delete(handler)
    }
  }

  private checkBackpressure(): void {
    this.emitCounter++
    const now = Date.now()
    if (now - this.lastCountReset >= 1000) {
      if (this.emitCounter > this.BACKPRESSURE_THRESHOLD) {
        console.warn('[AppEventBus] backpressure.warning', {
          eventsPerSecond: this.emitCounter,
          threshold: this.BACKPRESSURE_THRESHOLD,
        })
      }
      this.emitCounter = 0
      this.lastCountReset = now
    }
  }

  async flushAndShutdown(timeoutMs = 5000): Promise<void> {
    this.isShuttingDown = true
    const pending = Array.from(this.inFlightHandlers)

    await Promise.race([
      pending.length > 0 ? Promise.allSettled(pending) : Promise.resolve(),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ])

    if (this.eventLogStore) {
      await this.eventLogStore.flush()
    }

    this.unifiedHandlers.clear()
    this.wildcards.clear()
    this.inFlightHandlers.clear()
  }

  // ── Layer 1: Existing named methods (preserved, with bridge to Layer 2) ──

  emitSpanEnded(span: SerializedSpan): void {
    this.emit('trace:span-ended', span)
    this.emitEvent({ type: 'trace.span-ended', source: 'tracer', payload: span })
  }

  emitTraceUpdate(traceId: string): void {
    this.emit('trace:update', traceId)
    this.emitEvent({ type: 'trace.update', source: 'tracer', payload: traceId })
  }

  emitTaskDeclared(task: TaskRecord): void {
    this.emit('progress:task-declared', task)
    this.emitEvent({ type: 'progress.task-declared', source: 'progress-ledger', payload: task })
  }

  emitTaskUpdated(task: TaskRecord): void {
    this.emit('progress:task-updated', task)
    this.emitEvent({ type: 'progress.task-updated', source: 'progress-ledger', payload: task })
  }

  emitTaskCompleted(task: TaskRecord): void {
    this.emit('progress:task-completed', task)
    this.emitEvent({ type: 'progress.task-completed', source: 'progress-ledger', payload: task })
  }

  emitTaskFailed(task: TaskRecord): void {
    this.emit('progress:task-failed', task)
    this.emitEvent({ type: 'progress.task-failed', source: 'progress-ledger', payload: task })
  }

  emitUserEditConflict(): void {
    this.emit('progress:user-edit-conflict')
    this.emitEvent({ type: 'progress.user-edit-conflict', source: 'progress-ledger', payload: undefined })
  }

  emitPerformanceMetrics(metrics: PerformanceMetrics): void {
    this.emit('performance:metrics', metrics)
    this.emitEvent({ type: 'performance.metrics', source: 'performance-monitor', payload: metrics })
  }

  emitPerformanceAlert(alert: PerformanceAlert): void {
    this.emit('performance:alert', alert)
    this.emitEvent({ type: 'performance.alert', source: 'performance-monitor', payload: alert })
  }

  emitPerformanceAlertCleared(payload: { type: string }): void {
    this.emit('performance:alert-cleared', payload)
    this.emitEvent({ type: 'performance.alert-cleared', source: 'performance-monitor', payload })
  }
}

export type AppEventBusEvents = keyof EventMap
