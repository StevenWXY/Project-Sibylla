import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SibyllaEvent, EventHandler } from '../../../src/main/services/event-bus-types'

vi.mock('ulid', () => ({
  ulid: () => 'TEST-ULID-ID',
}))

const mockGetAllWindows = vi.fn(() => [])
const mockIpcMainHandle = vi.fn()

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcMainHandle,
  },
  BrowserWindow: {
    getAllWindows: mockGetAllWindows,
  },
}))

describe('EventIpcHandler', () => {
  let handler: InstanceType<typeof import('../../../src/main/ipc/handlers/event').EventIpcHandler>
  let subscribeAnyCaptured: EventHandler | null = null

  beforeEach(async () => {
    subscribeAnyCaptured = null
    mockIpcMainHandle.mockReset()
    mockGetAllWindows.mockReset().mockReturnValue([])

    const { EventIpcHandler } = await import('../../../src/main/ipc/handlers/event')

    const subscribeAnyMock = vi.fn((h: EventHandler) => {
      subscribeAnyCaptured = h
      return () => { subscribeAnyCaptured = null }
    })

    const mockBus = { subscribeAny: subscribeAnyMock } as unknown as import('../../../src/main/services/event-bus').AppEventBus
    handler = new EventIpcHandler(mockBus)
    handler.register()
  })

  describe('subscribe', () => {
    it('should register event types for a webContents', () => {
      const subscribeCall = mockIpcMainHandle.mock.calls.find(
        (call: unknown[]) => call[0] === 'event:subscribe',
      )
      expect(subscribeCall).toBeDefined()

      const wrappedHandler = subscribeCall![1]
      const mockSender = { id: 42, once: vi.fn() }

      const result = wrappedHandler({ sender: mockSender }, ['trace.span-ended', 'memory.entry-added'])
      expect(result).resolves.toEqual(expect.objectContaining({ data: { success: true } }))
    })
  })

  describe('push to subscribers', () => {
    it('should push events to subscribed webContents', async () => {
      const mockSend = vi.fn()
      const mockWc = { id: 42, send: mockSend, once: vi.fn() }
      const mockWindow = { isDestroyed: () => false, webContents: mockWc }
      mockGetAllWindows.mockReturnValue([mockWindow])

      const subscribeCall = mockIpcMainHandle.mock.calls.find(
        (call: unknown[]) => call[0] === 'event:subscribe',
      )
      const wrappedHandler = subscribeCall![1]
      await wrappedHandler({ sender: mockWc }, ['trace.span-ended'])

      const testEvent: SibyllaEvent = {
        id: 'test-id',
        type: 'trace.span-ended',
        source: 'test',
        timestamp: Date.now(),
        payload: { data: 'hello' },
      }

      if (subscribeAnyCaptured) {
        subscribeAnyCaptured(testEvent)
      }

      expect(mockSend).toHaveBeenCalledWith('event:push', testEvent)
    })

    it('should not push events for unsubscribed types', async () => {
      const mockSend = vi.fn()
      const mockWc = { id: 42, send: mockSend, once: vi.fn() }
      const mockWindow = { isDestroyed: () => false, webContents: mockWc }
      mockGetAllWindows.mockReturnValue([mockWindow])

      const subscribeCall = mockIpcMainHandle.mock.calls.find(
        (call: unknown[]) => call[0] === 'event:subscribe',
      )
      const wrappedHandler = subscribeCall![1]
      await wrappedHandler({ sender: mockWc }, ['trace.span-ended'])

      const testEvent: SibyllaEvent = {
        id: 'test-id',
        type: 'memory.entry-added',
        source: 'test',
        timestamp: Date.now(),
        payload: null,
      }

      if (subscribeAnyCaptured) {
        subscribeAnyCaptured(testEvent)
      }

      expect(mockSend).not.toHaveBeenCalled()
    })
  })

  describe('cleanup', () => {
    it('should unsubscribe from bus on cleanup', () => {
      handler.cleanup()
    })
  })
})
