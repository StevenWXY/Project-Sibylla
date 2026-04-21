import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Tracer } from '../../src/main/services/trace/tracer'
import { TraceStore } from '../../src/main/services/trace/trace-store'
import { AppEventBus } from '../../src/main/services/event-bus'
import { SpanImpl } from '../../src/main/services/trace/span-impl'
import { NO_OP_SPAN } from '../../src/main/services/trace/no-op-span'
import type { Span, SerializedSpan, TracerConfig } from '../../src/main/services/trace/types'
import path from 'path'
import fs from 'fs'
import os from 'os'

vi.mock('../../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    setLevel: vi.fn(),
  },
}))

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trace-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('NO_OP_SPAN', () => {
  it('is finalized and all methods are no-ops', () => {
    expect(NO_OP_SPAN.isFinalized()).toBe(true)
    expect(NO_OP_SPAN.name).toBe('no-op')
    expect(() => NO_OP_SPAN.setAttribute('k', 'v')).not.toThrow()
    expect(() => NO_OP_SPAN.setAttributes({ k: 'v' })).not.toThrow()
    expect(() => NO_OP_SPAN.addEvent('e')).not.toThrow()
    expect(() => NO_OP_SPAN.setStatus('ok')).not.toThrow()
    expect(() => NO_OP_SPAN.end()).not.toThrow()
  })
})

describe('SpanImpl', () => {
  function createSpan(overrides: Record<string, unknown> = {}): SpanImpl {
    const tracer = {
      onSpanEnd: vi.fn(),
      config: { spanTimeoutMs: 300000, propagateErrorToParent: false } as unknown as TracerConfig,
    }
    return new SpanImpl({
      context: { traceId: 't1', spanId: 's1' },
      name: 'test-span',
      kind: 'internal',
      startTimeMs: Date.now(),
      attributes: new Map(),
      tracer: tracer as unknown as import('../../src/main/services/trace/types').TracerRef,
      ...overrides,
    })
  }

  it('records attributes and events', () => {
    const span = createSpan()
    span.setAttribute('key', 'value')
    span.setAttributes({ k2: 'v2' })
    span.addEvent('my-event', { detail: 42 })
    expect(span.attributes.get('key')).toBe('value')
    expect(span.attributes.get('k2')).toBe('v2')
    expect(span.events).toHaveLength(1)
    expect(span.events[0].name).toBe('my-event')
  })

  it('sets status and ends', () => {
    const span = createSpan()
    span.setStatus('ok')
    expect(span.status).toBe('ok')
    expect(span.isFinalized()).toBe(false)
    span.end()
    expect(span.isFinalized()).toBe(true)
    expect(span.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('ignores operations after end', () => {
    const span = createSpan()
    span.end()
    span.setAttribute('after', 'should-be-ignored')
    span.addEvent('after-end')
    span.setStatus('error')
    expect(span.attributes.has('after')).toBe(false)
    expect(span.events).toHaveLength(0)
    expect(span.status).toBe('unset')
  })

  it('double end is idempotent', () => {
    const span = createSpan()
    span.end()
    span.end()
    expect(span.isFinalized()).toBe(true)
  })
})

describe('Tracer', () => {
  it('returns NO_OP_SPAN when disabled', () => {
    const store = new TraceStore(tmpDir)
    const bus = new AppEventBus()
    const tracer = new Tracer({ enabled: false }, store, bus)
    const span = tracer.startSpan('test')
    expect(span).toBe(NO_OP_SPAN)
    store.close()
  })

  it('starts spans and collects them', async () => {
    const store = new TraceStore(tmpDir)
    await store.initialize()
    const bus = new AppEventBus()
    const tracer = new Tracer({ enabled: true }, store, bus)
    tracer.start()

    const span = tracer.startSpan('my-span', { kind: 'ai-call' })
    expect(span).not.toBe(NO_OP_SPAN)
    span.setAttribute('foo', 'bar')
    span.setStatus('ok')
    span.end()

    await new Promise(r => setTimeout(r, 50))
    await tracer.flush()

    const tree = store.getTraceTree((span as SpanImpl).context.traceId)
    expect(tree.length).toBe(1)
    expect(tree[0].name).toBe('my-span')
    expect(tree[0].attributes.foo).toBe('bar')

    tracer.stop()
    store.close()
  })

  it('withSpan wraps fn and auto-ends', async () => {
    const store = new TraceStore(tmpDir)
    await store.initialize()
    const bus = new AppEventBus()
    const tracer = new Tracer({ enabled: true }, store, bus)
    tracer.start()

    const result = await tracer.withSpan('wrapped', async (span) => {
      span.setAttribute('inner', true)
      return 42
    })

    expect(result).toBe(42)

    await tracer.flush()
    const recent = store.getRecentTraces(5)
    expect(recent.length).toBeGreaterThanOrEqual(1)

    tracer.stop()
    store.close()
  })

  it('withSpan captures error and re-throws', async () => {
    const store = new TraceStore(tmpDir)
    await store.initialize()
    const bus = new AppEventBus()
    const tracer = new Tracer({ enabled: true }, store, bus)
    tracer.start()

    await expect(
      tracer.withSpan('failing', async (span) => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    await tracer.flush()
    const spans = store.query({ spanName: 'failing' })
    expect(spans.length).toBe(1)
    expect(spans[0].status).toBe('error')
    expect(spans[0].statusMessage).toBe('boom')

    tracer.stop()
    store.close()
  })

  it('redacts sensitive keys', async () => {
    const store = new TraceStore(tmpDir)
    await store.initialize()
    const bus = new AppEventBus()
    const tracer = new Tracer({ enabled: true }, store, bus)
    tracer.start()

    await tracer.withSpan('sensitive', async (span) => {
      span.setAttribute('api_key', 'super-secret')
      span.setAttribute('normal_field', 'visible')
    })

    await tracer.flush()
    const spans = store.query({ spanName: 'sensitive' })
    expect(spans[0].attributes.api_key).toBe('[REDACTED]')
    expect(spans[0].attributes.normal_field).toBe('visible')

    tracer.stop()
    store.close()
  })
})

describe('TraceStore', () => {
  it('initializes, writes, and queries', async () => {
    const store = new TraceStore(tmpDir)
    await store.initialize()

    const span: SerializedSpan = {
      traceId: 't1',
      spanId: 's1',
      name: 'test',
      kind: 'internal',
      startTimeMs: Date.now() - 100,
      endTimeMs: Date.now(),
      durationMs: 100,
      status: 'ok',
      attributes: { foo: 'bar' },
      events: [],
    }

    await store.write(span)
    const tree = store.getTraceTree('t1')
    expect(tree).toHaveLength(1)
    expect(tree[0].name).toBe('test')

    store.close()
  })

  it('query with filters', async () => {
    const store = new TraceStore(tmpDir)
    await store.initialize()

    await store.write({
      traceId: 't1', spanId: 's1', name: 'ai-call', kind: 'ai-call',
      startTimeMs: 1000, endTimeMs: 2000, durationMs: 1000, status: 'ok',
      attributes: {}, events: [],
    })
    await store.write({
      traceId: 't1', spanId: 's2', name: 'file-op', kind: 'tool-call',
      startTimeMs: 2000, endTimeMs: 3000, durationMs: 1000, status: 'error',
      attributes: {}, events: [],
    })

    const aiCalls = store.query({ kind: 'ai-call' })
    expect(aiCalls).toHaveLength(1)
    expect(aiCalls[0].kind).toBe('ai-call')

    const errors = store.query({ status: 'error' })
    expect(errors).toHaveLength(1)

    store.close()
  })

  it('cleanup respects locked traces', async () => {
    const store = new TraceStore(tmpDir)
    await store.initialize()

    const oldTime = Date.now() - 100 * 24 * 60 * 60 * 1000
    await store.write({
      traceId: 't-old', spanId: 's-old', name: 'old', kind: 'internal',
      startTimeMs: oldTime, endTimeMs: oldTime + 100, durationMs: 100, status: 'ok',
      attributes: {}, events: [],
    })

    store.lockTrace('t-old', 'important')

    const result = store.cleanup(30)
    expect(result.deleted).toBe(0)

    store.unlockTrace('t-old')
    const result2 = store.cleanup(30)
    expect(result2.deleted).toBe(1)

    store.close()
  })

  it('stats and recent traces', async () => {
    const store = new TraceStore(tmpDir)
    await store.initialize()

    await store.writeBatch([
      { traceId: 't1', spanId: 's1', name: 'a', kind: 'internal', startTimeMs: 1000, endTimeMs: 2000, durationMs: 1000, status: 'ok', attributes: {}, events: [] },
      { traceId: 't1', spanId: 's2', name: 'b', kind: 'internal', startTimeMs: 2000, endTimeMs: 3000, durationMs: 1000, status: 'ok', attributes: {}, events: [] },
      { traceId: 't2', spanId: 's3', name: 'c', kind: 'internal', startTimeMs: 3000, endTimeMs: 4000, durationMs: 1000, status: 'ok', attributes: {}, events: [] },
    ])

    const stats = store.getStats()
    expect(stats.totalSpans).toBe(3)
    expect(stats.totalTraces).toBe(2)

    const recent = store.getRecentTraces(10)
    expect(recent.length).toBe(2)

    store.close()
  })

  it('integrity check renames corrupted db', async () => {
    const traceDir = path.join(tmpDir, '.sibylla', 'trace')
    fs.mkdirSync(traceDir, { recursive: true })
    const dbPath = path.join(traceDir, 'trace.db')
    fs.writeFileSync(dbPath, 'not a valid sqlite db')

    const store = new TraceStore(tmpDir)
    await store.initialize()
    const stats = store.getStats()
    expect(stats.totalSpans).toBe(0)
    store.close()
  })
})

describe('AppEventBus', () => {
  it('emits span-ended events', () => {
    const bus = new AppEventBus()
    const handler = vi.fn()
    bus.on('trace:span-ended', handler)

    const fakeSpan: SerializedSpan = {
      traceId: 't1', spanId: 's1', name: 'test', kind: 'internal',
      startTimeMs: 0, endTimeMs: 0, durationMs: 0, status: 'ok', attributes: {}, events: [],
    }
    bus.emitSpanEnded(fakeSpan)
    expect(handler).toHaveBeenCalledWith(fakeSpan)

    bus.removeAllListeners('trace:span-ended')
  })
})
