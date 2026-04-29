import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AppEventBus } from '../../../src/main/services/event-bus'
import type { SibyllaEvent, EventHandler } from '../../../src/main/services/event-bus-types'
import type { SerializedSpan } from '../../../src/main/services/trace/types'

vi.mock('ulid', () => ({
  ulid: () => 'TEST-ULID-ID',
}))

function createMockSpan(): SerializedSpan {
  return {
    traceId: 'trace-1',
    spanId: 'span-1',
    name: 'test-span',
    kind: 'internal',
    startTimeMs: Date.now(),
    endTimeMs: Date.now() + 100,
    durationMs: 100,
    status: 'ok',
    attributes: {},
    events: [],
  }
}

describe('AppEventBus', () => {
  let bus: AppEventBus

  beforeEach(() => {
    bus = new AppEventBus()
  })

  describe('emitEvent()', () => {
    it('should dispatch SibyllaEvent with ULID id and timestamp', () => {
      const handler = vi.fn()
      bus.subscribe('trace.span-ended', handler)

      bus.emitEvent({
        type: 'trace.span-ended',
        source: 'test',
        payload: { data: 'hello' },
      })

      expect(handler).toHaveBeenCalledTimes(1)
      const event = handler.mock.calls[0][0] as SibyllaEvent
      expect(event.id).toBe('TEST-ULID-ID')
      expect(event.type).toBe('trace.span-ended')
      expect(event.source).toBe('test')
      expect(event.payload).toEqual({ data: 'hello' })
      expect(typeof event.timestamp).toBe('number')
    })

    it('should deliver events to targeted subscribers only', () => {
      const handlerA = vi.fn()
      const handlerB = vi.fn()
      bus.subscribe('trace.span-ended', handlerA)
      bus.subscribe('memory.entry-added', handlerB)

      bus.emitEvent({ type: 'trace.span-ended', source: 'test', payload: null })

      expect(handlerA).toHaveBeenCalledTimes(1)
      expect(handlerB).not.toHaveBeenCalled()
    })

    it('should return unsubscribe function from subscribe()', () => {
      const handler = vi.fn()
      const unsub = bus.subscribe('trace.span-ended', handler)

      bus.emitEvent({ type: 'trace.span-ended', source: 'test', payload: 1 })
      expect(handler).toHaveBeenCalledTimes(1)

      unsub()
      bus.emitEvent({ type: 'trace.span-ended', source: 'test', payload: 2 })
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('should deliver events to subscribeAny() wildcard handlers', () => {
      const handler = vi.fn()
      bus.subscribeAny(handler)

      bus.emitEvent({ type: 'trace.span-ended', source: 'test', payload: 'a' })
      bus.emitEvent({ type: 'memory.entry-added', source: 'test', payload: 'b' })

      expect(handler).toHaveBeenCalledTimes(2)
    })

    it('should isolate handler exceptions', () => {
      const handlerA = vi.fn(() => { throw new Error('boom') })
      const handlerB = vi.fn()
      bus.subscribe('trace.span-ended', handlerA)
      bus.subscribe('trace.span-ended', handlerB)

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      bus.emitEvent({ type: 'trace.span-ended', source: 'test', payload: null })

      expect(handlerA).toHaveBeenCalledTimes(1)
      expect(handlerB).toHaveBeenCalledTimes(1)
      expect(consoleSpy).toHaveBeenCalledWith(
        '[AppEventBus] event.handler.failed',
        expect.objectContaining({ eventType: 'trace.span-ended' }),
      )
      consoleSpy.mockRestore()
    })

    it('should call EventLogStore.append when persist is true', () => {
      const appendMock = vi.fn()
      const mockStore = { append: appendMock }
      bus.setEventLogStore(mockStore as never)

      bus.emitEvent({
        type: 'trace.span-ended',
        source: 'test',
        payload: 'data',
        persist: true,
      })

      expect(appendMock).toHaveBeenCalledTimes(1)
      expect(appendMock.mock.calls[0][0].type).toBe('trace.span-ended')
    })

    it('should not call append when persist is false or undefined', () => {
      const appendMock = vi.fn()
      const mockStore = { append: appendMock }
      bus.setEventLogStore(mockStore as never)

      bus.emitEvent({ type: 'trace.span-ended', source: 'test', payload: null })
      bus.emitEvent({ type: 'trace.span-ended', source: 'test', payload: null, persist: false })

      expect(appendMock).not.toHaveBeenCalled()
    })

    it('should continue dispatch even if EventLogStore throws during flush', async () => {
      const flushMock = vi.fn().mockRejectedValue(new Error('disk full'))
      const mockStore = { append: vi.fn(), flush: flushMock, read: vi.fn(), cleanup: vi.fn() }
      bus.setEventLogStore(mockStore as never)

      const handler = vi.fn()
      bus.subscribe('trace.span-ended', handler)

      bus.emitEvent({
        type: 'trace.span-ended',
        source: 'test',
        payload: null,
        persist: true,
      })

      expect(handler).toHaveBeenCalledTimes(1)
      expect(mockStore.append).toHaveBeenCalledTimes(1)
    })

    it('should create Trace span via Tracer.withSpan', () => {
      const withSpanMock = vi.fn().mockResolvedValue(undefined)
      const mockTracer = { withSpan: withSpanMock }
      bus.setTracer(mockTracer as never)

      bus.emitEvent({ type: 'trace.span-ended', source: 'test', payload: null })

      expect(withSpanMock).toHaveBeenCalledWith(
        'event:trace.span-ended',
        expect.any(Function),
        { kind: 'system' },
      )
    })
  })

  describe('bridge from named methods', () => {
    it('should bridge emitSpanEnded to trace.span-ended', () => {
      const handler = vi.fn()
      bus.subscribe('trace.span-ended', handler)

      const span = createMockSpan()
      bus.emitSpanEnded(span)

      expect(handler).toHaveBeenCalledTimes(1)
      const event = handler.mock.calls[0][0] as SibyllaEvent
      expect(event.type).toBe('trace.span-ended')
      expect(event.payload).toBe(span)
    })

    it('should bridge emitPerformanceMetrics to performance.metrics', () => {
      const handler = vi.fn()
      bus.subscribe('performance.metrics', handler)

      bus.emitPerformanceMetrics({ cpuUsage: 50, memoryUsage: 60 } as never)

      expect(handler).toHaveBeenCalledTimes(1)
      const event = handler.mock.calls[0][0] as SibyllaEvent
      expect(event.type).toBe('performance.metrics')
    })

    it('should preserve original EventEmitter behavior for named methods', () => {
      const listener = vi.fn()
      bus.on('trace:span-ended', listener)

      const span = createMockSpan()
      bus.emitSpanEnded(span)

      expect(listener).toHaveBeenCalledWith(span)
    })
  })

  describe('backpressure', () => {
    it('should warn when events exceed threshold per second', () => {
      const warnCalls: unknown[][] = []
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
        warnCalls.push(args)
      })

      const now = Date.now()
      const freshBus = new AppEventBus()

      // Manually test by emitting 150 events and advancing time
      // Since checkBackpressure uses Date.now(), we need fake timers
      vi.useFakeTimers({ shouldAdvanceTime: false })
      vi.setSystemTime(now)

      // Create a new bus after setting fake timers so lastCountReset uses fake Date.now()
      const fakeTimerBus = new AppEventBus()
      const handler = vi.fn()
      fakeTimerBus.subscribeAny(handler)

      for (let i = 0; i < 150; i++) {
        fakeTimerBus.emitEvent({ type: 'trace.span-ended', source: 'test', payload: i })
      }

      vi.advanceTimersByTime(1100)
      // Emit one more to trigger the check with the updated time
      fakeTimerBus.emitEvent({ type: 'trace.span-ended', source: 'test', payload: 999 })

      const backpressureCall = warnCalls.find(
        (args) => args[0] === '[AppEventBus] backpressure.warning',
      )
      expect(backpressureCall).toBeDefined()

      warnSpy.mockRestore()
      vi.useRealTimers()
    })
  })

  describe('flushAndShutdown()', () => {
    it('should wait for in-flight async handlers', async () => {
      let resolvePromise: () => void
      const handler = vi.fn(() => new Promise<void>((resolve) => {
        resolvePromise = resolve
      }))
      bus.subscribe('trace.span-ended', handler)

      bus.emitEvent({ type: 'trace.span-ended', source: 'test', payload: null })
      expect(handler).toHaveBeenCalledTimes(1)

      const flushPromise = bus.flushAndShutdown(5000)
      resolvePromise!()
      await flushPromise
    })

    it('should force cleanup after timeout', async () => {
      vi.useFakeTimers()

      const handler = vi.fn(() => new Promise<void>(() => {}))
      bus.subscribe('trace.span-ended', handler)

      bus.emitEvent({ type: 'trace.span-ended', source: 'test', payload: null })

      const flushPromise = bus.flushAndShutdown(5000)
      vi.advanceTimersByTime(6000)
      await flushPromise

      vi.useRealTimers()
    })

    it('should not dispatch after shutdown', () => {
      const handler = vi.fn()
      bus.subscribe('trace.span-ended', handler)

      bus.flushAndShutdown(0)

      bus.emitEvent({ type: 'trace.span-ended', source: 'test', payload: null })
      expect(handler).not.toHaveBeenCalled()
    })
  })
})
