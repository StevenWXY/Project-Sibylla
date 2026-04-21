import crypto from 'crypto'
import type { Span, SpanContext, SpanKind, TracerConfig, SerializedSpan } from './types'
import { DEFAULT_SENSITIVE_PATTERNS } from './types'
import { NO_OP_SPAN } from './no-op-span'
import { SpanImpl } from './span-impl'
import type { SpanImplOptions } from './span-impl'
import type { AppEventBus } from '../event-bus'
import { logger } from '../../utils/logger'

export interface TracerOptions {
  enabled?: boolean
  spanTimeoutMs?: number
  bufferLimit?: number
  sensitiveKeyPatterns?: RegExp[]
  propagateErrorToParent?: boolean
}

export interface TracePersistence {
  write(span: SerializedSpan): Promise<void>
  writeBatch(spans: SerializedSpan[]): Promise<void>
  initialize(): Promise<void>
  close(): void
}

export class Tracer {
  readonly config: TracerConfig
  private readonly persistence: TracePersistence
  private readonly eventBus: AppEventBus
  private readonly activeSpans: Map<string, SpanImpl> = new Map()
  private readonly sensitiveKeyPatterns: RegExp[]
  private readonly buffer: SerializedSpan[] = []
  private timeoutChecker?: ReturnType<typeof setInterval>

  constructor(
    options: TracerOptions,
    persistence: TracePersistence,
    eventBus: AppEventBus,
  ) {
    this.config = {
      enabled: options.enabled ?? true,
      spanTimeoutMs: options.spanTimeoutMs ?? 300000,
      bufferLimit: options.bufferLimit ?? 1000,
      propagateErrorToParent: options.propagateErrorToParent ?? true,
    }
    this.sensitiveKeyPatterns = options.sensitiveKeyPatterns ?? DEFAULT_SENSITIVE_PATTERNS
    this.persistence = persistence
    this.eventBus = eventBus
  }

  start(): void {
    if (!this.config.enabled) return
    this.timeoutChecker = setInterval(() => this.checkTimeouts(), 30000)
  }

  async stop(): Promise<void> {
    if (this.timeoutChecker !== undefined) {
      clearInterval(this.timeoutChecker)
      this.timeoutChecker = undefined
    }
    await this.flush()
  }

  isEnabled(): boolean {
    return this.config.enabled
  }

  startSpan(name: string, options?: SpanImplOptions): Span {
    if (!this.config.enabled) return NO_OP_SPAN

    const traceId = options?.parent?.traceId ?? this.generateTraceId()
    const spanId = this.generateSpanId()
    const parentSpanId = options?.parent?.spanId

    const context: SpanContext = {
      traceId,
      spanId,
      ...(parentSpanId !== undefined ? { parentSpanId } : {}),
    }

    const initAttrs = new Map<string, unknown>()
    if (options?.attributes) {
      for (const [k, v] of Object.entries(options.attributes)) {
        initAttrs.set(k, v)
      }
    }

    const span = new SpanImpl({
      context,
      name,
      kind: options?.kind ?? 'internal',
      startTimeMs: Date.now(),
      attributes: initAttrs,
      conversationId: options?.conversationId,
      taskId: options?.taskId,
      tracer: this as unknown as import('./types').TracerRef,
    })

    this.activeSpans.set(spanId, span)
    return span
  }

  async withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    options?: SpanImplOptions,
  ): Promise<T> {
    const span = this.startSpan(name, options)
    try {
      const result = await fn(span)
      if (!span.isFinalized()) {
        span.setStatus('ok')
      }
      return result
    } catch (err: unknown) {
      if (!span.isFinalized()) {
        span.setStatus('error', err instanceof Error ? err.message : String(err))
        if (err instanceof Error) {
          span.setAttribute('error.stack', err.stack ?? '')
        }
      }
      throw err
    } finally {
      if (!span.isFinalized()) {
        span.end()
      }
    }
  }

  onSpanEnd(span: SpanImpl): void {
    this.activeSpans.delete(span.context.spanId)
    const serialized = this.serialize(span)
    void this.persistAsync(serialized)
    this.eventBus.emitSpanEnded(serialized)
  }

  generateTraceId(): string {
    return crypto.randomBytes(16).toString('hex')
  }

  generateSpanId(): string {
    return crypto.randomBytes(8).toString('hex')
  }

  serialize(span: SpanImpl): SerializedSpan {
    return {
      traceId: span.context.traceId,
      spanId: span.context.spanId,
      parentSpanId: span.context.parentSpanId,
      name: span.name,
      kind: span.kind,
      startTimeMs: span.startTimeMs,
      endTimeMs: span.endTimeMs ?? Date.now(),
      durationMs: span.durationMs,
      status: span.status,
      statusMessage: span.statusMessage,
      attributes: this.redactAttributes(Object.fromEntries(span.attributes)),
      events: span.events.map(e => ({
        ...e,
        attributes: this.redactAttributes(e.attributes),
      })),
      conversationId: span.conversationId,
      taskId: span.taskId,
    }
  }

  redactAttributes(attrs: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(attrs)) {
      const isSensitive = this.sensitiveKeyPatterns.some(p => p.test(key))
      if (isSensitive) {
        result[key] = '[REDACTED]'
      } else {
        result[key] = this.truncateIfLarge(value)
      }
    }
    return result
  }

  truncateIfLarge(value: unknown): unknown {
    if (typeof value === 'string') {
      if (value.length > 10240) {
        return value.substring(0, 10240) + `...[TRUNCATED:${value.length}chars]`
      }
      return value
    }
    if (typeof value === 'object' && value !== null) {
      const json = JSON.stringify(value)
      if (json.length > 10240) {
        return json.substring(0, 10240) + `...[TRUNCATED:${json.length}chars]`
      }
      return value
    }
    return value
  }

  async persistAsync(span: SerializedSpan): Promise<void> {
    try {
      await this.persistence.write(span)
    } catch {
      this.buffer.push(span)
      if (this.buffer.length > this.config.bufferLimit) {
        const dropped = this.buffer.shift()
        logger.warn('trace.buffer.overflow.dropped', { droppedSpanId: dropped?.spanId })
      }
    }
  }

  checkTimeouts(): void {
    const now = Date.now()
    const entries = Array.from(this.activeSpans.entries())
    for (const [, span] of entries) {
      if (now - span.startTimeMs > this.config.spanTimeoutMs) {
        logger.warn('trace.span.timeout', { spanId: span.context.spanId, name: span.name })
        span.setStatus('error', 'span timeout')
        span.end()
      }
    }
  }

  async flush(): Promise<void> {
    while (this.buffer.length > 0) {
      const batch = this.buffer.splice(0, 100)
      try {
        await this.persistence.writeBatch(batch)
      } catch (err: unknown) {
        this.buffer.unshift(...batch)
        logger.error('trace.flush.batch-failed', {
          batchSize: batch.length,
          error: err instanceof Error ? err.message : String(err),
        })
        break
      }
    }
  }
}
