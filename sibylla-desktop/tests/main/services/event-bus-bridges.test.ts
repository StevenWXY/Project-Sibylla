import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryEventBusBridge } from '../../../src/main/services/event-bus-bridges'
import { AppEventBus } from '../../../src/main/services/event-bus'
import { MemoryEventBus } from '../../../src/main/services/memory/memory-event-bus'
import type { SibyllaEvent } from '../../../src/main/services/event-bus-types'

vi.mock('ulid', () => ({
  ulid: () => 'TEST-ULID-ID',
}))

describe('MemoryEventBusBridge', () => {
  let memBus: MemoryEventBus
  let appBus: AppEventBus
  let bridge: MemoryEventBusBridge

  beforeEach(() => {
    memBus = new MemoryEventBus()
    appBus = new AppEventBus()
    bridge = new MemoryEventBusBridge(memBus, appBus)
  })

  it('should forward memory:checkpoint-completed to memory.checkpoint-completed', () => {
    const handler = vi.fn()
    appBus.subscribe('memory.checkpoint-completed', handler)

    const record = { id: 'cp-1', timestamp: Date.now() }
    memBus.emit('memory:checkpoint-completed', record)

    expect(handler).toHaveBeenCalledTimes(1)
    const event = handler.mock.calls[0][0] as SibyllaEvent
    expect(event.type).toBe('memory.checkpoint-completed')
    expect(event.payload).toBe(record)
  })

  it('should forward all 5 bridge mappings', () => {
    const mappings = [
      { memEvent: 'memory:checkpoint-completed', sibyllaType: 'memory.checkpoint-completed' },
      { memEvent: 'memory:entry-added', sibyllaType: 'memory.entry-added' },
      { memEvent: 'memory:entry-updated', sibyllaType: 'memory.entry-updated' },
      { memEvent: 'memory:entry-deleted', sibyllaType: 'memory.entry-deleted' },
      { memEvent: 'memory:compression-completed', sibyllaType: 'memory.compression-completed' },
    ]

    for (const mapping of mappings) {
      const handler = vi.fn()
      appBus.subscribe(mapping.sibyllaType, handler)

      memBus.emit(mapping.memEvent, { test: true })
      expect(handler).toHaveBeenCalledTimes(1)

      const unsub = appBus.subscribe(mapping.sibyllaType, vi.fn())
      unsub()
    }
  })

  it('should set source to memory-manager on forwarded events', () => {
    const handler = vi.fn()
    appBus.subscribe('memory.entry-added', handler)

    memBus.emit('memory:entry-added', { entryId: 'e1' })

    expect(handler).toHaveBeenCalledTimes(1)
    const event = handler.mock.calls[0][0] as SibyllaEvent
    expect(event.source).toBe('memory-manager')
  })

  it('should stop forwarding after dispose()', () => {
    const handler = vi.fn()
    appBus.subscribe('memory.checkpoint-completed', handler)

    bridge.dispose()

    memBus.emit('memory:checkpoint-completed', { id: 'cp-2' })
    expect(handler).not.toHaveBeenCalled()
  })
})
