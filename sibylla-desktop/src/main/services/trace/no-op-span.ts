import type { Span, SpanContext, SpanKind } from './types'

class NoOpSpan implements Span {
  readonly context: SpanContext = Object.freeze({ traceId: '', spanId: '' })
  readonly name: string = 'no-op'
  readonly kind: SpanKind = 'internal'

  setAttribute(): void {}
  setAttributes(): void {}
  addEvent(): void {}
  setStatus(): void {}
  end(): void {}
  isFinalized(): boolean { return true }
}

export const NO_OP_SPAN: Span = new NoOpSpan()
