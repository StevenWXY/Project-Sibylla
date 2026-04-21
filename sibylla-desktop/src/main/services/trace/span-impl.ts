import type { Span, SpanContext, SpanKind, SpanStatus, SpanEvent, TracerRef } from './types'
import { logger } from '../../utils/logger'

const MAX_ATTRIBUTE_SIZE = 10240

export class SpanImpl implements Span {
  readonly context: SpanContext
  readonly name: string
  readonly kind: SpanKind
  readonly startTimeMs: number
  readonly conversationId?: string
  readonly taskId?: string

  private readonly _attributes: Map<string, unknown> = new Map()
  private readonly _events: SpanEvent[] = []
  private _status: SpanStatus = 'unset'
  private _statusMessage?: string
  private _endTimeMs?: number
  private _finalized = false
  private readonly _tracer: TracerRef

  constructor(init: {
    context: SpanContext
    name: string
    kind: SpanKind
    startTimeMs: number
    attributes: Map<string, unknown>
    conversationId?: string
    taskId?: string
    tracer: TracerRef
  }) {
    this.context = init.context
    this.name = init.name
    this.kind = init.kind
    this.startTimeMs = init.startTimeMs
    this.conversationId = init.conversationId
    this.taskId = init.taskId
    this._tracer = init.tracer

    for (const [k, v] of init.attributes) {
      this._attributes.set(k, v)
    }
  }

  get durationMs(): number {
    if (this._endTimeMs !== undefined) {
      return this._endTimeMs - this.startTimeMs
    }
    return Date.now() - this.startTimeMs
  }

  get attributes(): ReadonlyMap<string, unknown> {
    return this._attributes
  }

  get events(): readonly SpanEvent[] {
    return this._events
  }

  get status(): SpanStatus {
    return this._status
  }

  get statusMessage(): string | undefined {
    return this._statusMessage
  }

  get endTimeMs(): number | undefined {
    return this._endTimeMs
  }

  setAttribute(key: string, value: unknown): void {
    if (this._finalized) {
      logger.warn('trace.span.setAttribute.after-finalized', { spanId: this.context.spanId, key })
      return
    }
    this._attributes.set(key, this.truncateLargeValue(value))
  }

  setAttributes(attrs: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(attrs)) {
      this.setAttribute(key, value)
    }
  }

  addEvent(name: string, attributes?: Record<string, unknown>): void {
    if (this._finalized) {
      logger.warn('trace.span.addEvent.after-finalized', { spanId: this.context.spanId, name })
      return
    }
    this._events.push({
      name,
      timestamp: Date.now(),
      attributes: attributes ?? {},
    })
  }

  setStatus(status: SpanStatus, message?: string): void {
    if (this._finalized) {
      logger.warn('trace.span.setStatus.after-finalized', { spanId: this.context.spanId })
      return
    }
    this._status = status
    this._statusMessage = message

    if (
      status === 'error' &&
      this._tracer.config.propagateErrorToParent &&
      this.context.parentSpanId
    ) {
      const propagationSpan = this._tracer.startSpan?.('error-propagation', {
        parent: this.context,
        kind: 'internal',
      })
      if (propagationSpan && !propagationSpan.isFinalized()) {
        propagationSpan.setStatus('error', message ?? 'propagated error')
        propagationSpan.end()
      }
    }
  }

  end(): void {
    if (this._finalized) {
      logger.warn('trace.span.end.already-finalized', { spanId: this.context.spanId, name: this.name })
      return
    }
    this._endTimeMs = Date.now()
    this._finalized = true
    this._tracer.onSpanEnd(this)
  }

  isFinalized(): boolean {
    return this._finalized
  }

  private truncateLargeValue(value: unknown): unknown {
    if (typeof value === 'string') {
      if (value.length > MAX_ATTRIBUTE_SIZE) {
        return value.substring(0, MAX_ATTRIBUTE_SIZE) + `...[TRUNCATED:${value.length}chars]`
      }
      return value
    }
    if (typeof value === 'object' && value !== null) {
      const json = JSON.stringify(value)
      if (json.length > MAX_ATTRIBUTE_SIZE) {
        return json.substring(0, MAX_ATTRIBUTE_SIZE) + `...[TRUNCATED:${json.length}chars]`
      }
      return value
    }
    return value
  }
}

export interface SpanImplOptions {
  parent?: SpanContext
  kind?: SpanKind
  conversationId?: string
  taskId?: string
  attributes?: Record<string, unknown>
}
