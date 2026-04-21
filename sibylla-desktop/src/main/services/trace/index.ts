export type {
  SpanStatus,
  SpanKind,
  SpanContext,
  SpanEvent,
  SerializedSpan,
  Span,
  TracerConfig,
  TraceQueryFilter,
  SpanInitData,
  TracerRef,
  SpanImpl as SpanImplType,
} from './types'

export { DEFAULT_SENSITIVE_PATTERNS } from './types'

export { NO_OP_SPAN } from './no-op-span'

export { SpanImpl } from './span-impl'
export type { SpanImplOptions } from './span-impl'

export { Tracer } from './tracer'
export type { TracePersistence, TracerOptions } from './tracer'

export { TraceStore } from './trace-store'
