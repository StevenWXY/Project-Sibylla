import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAIStream } from '../../src/renderer/hooks/useAIStream'
import { useAIChatStore } from '../../src/renderer/store/aiChatStore'

describe('useAIStream', () => {
  let chunkCallbacks: Array<(chunk: { id: string; delta: string }) => void>
  let endCallbacks: Array<(end: Record<string, unknown>) => void>
  let errorCallbacks: Array<(error: Record<string, unknown>) => void>

  beforeEach(() => {
    useAIChatStore.getState().reset()
    chunkCallbacks = []
    endCallbacks = []
    errorCallbacks = []

    const mockAi = {
      stream: vi.fn().mockReturnValue('mock-stream-123'),
      abortStream: vi.fn(),
      onStreamChunk: vi.fn((cb: (chunk: { id: string; delta: string }) => void) => {
        chunkCallbacks.push(cb)
        return () => {
          chunkCallbacks = chunkCallbacks.filter((c) => c !== cb)
        }
      }),
      onStreamEnd: vi.fn((cb: (end: Record<string, unknown>) => void) => {
        endCallbacks.push(cb)
        return () => {
          endCallbacks = endCallbacks.filter((c) => c !== cb)
        }
      }),
      onStreamError: vi.fn((cb: (error: Record<string, unknown>) => void) => {
        errorCallbacks.push(cb)
        return () => {
          errorCallbacks = errorCallbacks.filter((c) => c !== cb)
        }
      }),
    }

    Object.defineProperty(window, 'electronAPI', {
      value: { ai: mockAi },
      writable: true,
    })
  })

  it('registers stream event listeners on mount', () => {
    renderHook(() => useAIStream())

    expect(window.electronAPI?.ai.onStreamChunk).toHaveBeenCalled()
    expect(window.electronAPI?.ai.onStreamEnd).toHaveBeenCalled()
    expect(window.electronAPI?.ai.onStreamError).toHaveBeenCalled()
  })

  it('startStream calls window.electronAPI.ai.stream and returns streamId', () => {
    const { result } = renderHook(() => useAIStream())

    let streamId: string = ''
    act(() => {
      streamId = result.current.startStream({ message: 'test' })
    })

    expect(streamId).toBe('mock-stream-123')
    expect(window.electronAPI?.ai.stream).toHaveBeenCalledWith({ message: 'test' })
  })

  it('abortStream calls window.electronAPI.ai.abortStream and stops store', () => {
    useAIChatStore.getState().addAssistantPlaceholder('mock-stream-123')

    const { result } = renderHook(() => useAIStream())

    act(() => {
      result.current.abortStream('mock-stream-123')
    })

    expect(window.electronAPI?.ai.abortStream).toHaveBeenCalledWith('mock-stream-123')
    expect(useAIChatStore.getState().isStreaming).toBe(false)
  })

  it('chunk event updates store via appendToAssistant', () => {
    useAIChatStore.getState().addAssistantPlaceholder('stream-1')

    renderHook(() => useAIStream())

    act(() => {
      for (const cb of chunkCallbacks) {
        cb({ id: 'stream-1', delta: 'Hello' })
      }
    })

    expect(useAIChatStore.getState().messages[0]?.content).toBe('Hello')
  })

  it('end event finalizes assistant in store', () => {
    const onEnd = vi.fn()
    useAIChatStore.getState().addAssistantPlaceholder('stream-1')

    renderHook(() => useAIStream({ onStreamEnd: onEnd }))

    act(() => {
      for (const cb of endCallbacks) {
        cb({
          id: 'stream-1',
          content: 'final content',
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, estimatedCostUsd: 0.001 },
          ragHits: [],
          memory: { tokenCount: 30, tokenDebt: 0, flushTriggered: false },
          provider: 'mock',
          model: 'test',
          intercepted: false,
          warnings: [],
        })
      }
    })

    const state = useAIChatStore.getState()
    expect(state.messages[0]?.content).toBe('final content')
    expect(state.messages[0]?.streaming).toBe(false)
    expect(state.isStreaming).toBe(false)
    expect(onEnd).toHaveBeenCalled()
  })

  it('error event marks assistant error in store', () => {
    const onError = vi.fn()
    useAIChatStore.getState().addAssistantPlaceholder('stream-1')

    renderHook(() => useAIStream({ onStreamError: onError }))

    act(() => {
      for (const cb of errorCallbacks) {
        cb({
          id: 'stream-1',
          code: 'network',
          message: 'Connection lost',
          retryable: true,
          partialContent: 'some text',
        })
      }
    })

    const state = useAIChatStore.getState()
    expect(state.messages[0]?.content).toContain('Connection lost')
    expect(state.messages[0]?.streaming).toBe(false)
    expect(state.isStreaming).toBe(false)
    expect(onError).toHaveBeenCalled()
  })

  it('unlistens all events on unmount', () => {
    const { unmount } = renderHook(() => useAIStream())

    unmount()

    act(() => {
      for (const cb of chunkCallbacks) {
        cb({ id: 'x', delta: 'leak' })
      }
    })

    expect(useAIChatStore.getState().messages).toHaveLength(0)
  })
})
