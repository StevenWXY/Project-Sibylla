export type SpanStatus = 'ok' | 'error' | 'unset'

export type SpanKind = 'internal' | 'ai-call' | 'tool-call' | 'user-action' | 'system'

export interface SpanContext {
  readonly traceId: string
  readonly spanId: string
  readonly parentSpanId?: string
}

export interface SpanEvent {
  name: string
  timestamp: number
  attributes: Record<string, unknown>
}

export interface SerializedSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  kind: SpanKind
  startTimeMs: number
  endTimeMs: number
  durationMs: number
  status: SpanStatus
  statusMessage?: string
  attributes: Record<string, unknown>
  events: SpanEvent[]
  conversationId?: string
  taskId?: string
  userId?: string
  workspaceId?: string
}

export interface Span {
  readonly context: SpanContext
  readonly name: string
  readonly kind: SpanKind

  setAttribute(key: string, value: unknown): void
  setAttributes(attributes: Record<string, unknown>): void
  addEvent(name: string, attributes?: Record<string, unknown>): void
  setStatus(status: SpanStatus, message?: string): void
  end(): void
  isFinalized(): boolean
}

export interface TracerConfig {
  enabled: boolean
  spanTimeoutMs: number
  bufferLimit: number
  propagateErrorToParent: boolean
}

export const DEFAULT_SENSITIVE_PATTERNS: RegExp[] = [
  /.*_token$/i,
  /.*_key$/i,
  /^password$/i,
  /^credential.*/i,
  /^api_key$/i,
  /^secret.*/i,
]

export interface TraceQueryFilter {
  traceId?: string
  spanName?: string
  kind?: SpanKind
  status?: SpanStatus
  conversationId?: string
  taskId?: string
  startTimeFrom?: number
  startTimeTo?: number
  minDurationMs?: number
  attributeFilters?: Array<{ key: string; value: string }>
  limit?: number
  offset?: number
}

export interface SpanInitData {
  context: SpanContext
  name: string
  kind: SpanKind
  startTimeMs: number
  attributes: Map<string, unknown>
  conversationId?: string
  taskId?: string
  tracer: TracerRef
}

export interface TracerRef {
  onSpanEnd(span: SpanImpl): void
  startSpan?(name: string, options?: SpanImplOptions): Span
  readonly config: TracerConfig
}

export interface SpanImpl extends Span {
  readonly startTimeMs: number
  readonly conversationId?: string
  readonly taskId?: string
  readonly durationMs: number
}
