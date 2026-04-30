import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  useProactiveStore,
  initProactiveListener,
} from '@renderer/store/proactiveStore'

function makeSuggestion(id = 'sug_1') {
  return {
    id,
    triggerId: 'task-decomposition' as const,
    title: '想要拆解任务吗？',
    body: '检测到您写了目标',
    acceptAction: { command: 'ai.extractTasks', args: {} },
    declineAction: 'dismiss' as const,
    priority: 'normal' as const,
    createdAt: Date.now(),
  }
}

describe('proactiveStore', () => {
  beforeEach(() => {
    useProactiveStore.setState({
      currentSuggestion: null,
      pendingQueue: [],
      config: null,
      _shownAt: null,
    })
  })

  it('pushSuggestion immediately shows when no current suggestion', () => {
    const suggestion = makeSuggestion()
    useProactiveStore.getState().pushSuggestion(suggestion)

    const state = useProactiveStore.getState()
    expect(state.currentSuggestion).toEqual(suggestion)
    expect(state._shownAt).not.toBeNull()
  })

  it('pushSuggestion queues when current suggestion exists', () => {
    useProactiveStore.getState().pushSuggestion(makeSuggestion('sug_1'))
    useProactiveStore.getState().pushSuggestion(makeSuggestion('sug_2'))

    const state = useProactiveStore.getState()
    expect(state.currentSuggestion!.id).toBe('sug_1')
    expect(state.pendingQueue).toHaveLength(1)
    expect(state.pendingQueue[0]!.id).toBe('sug_2')
  })

  it('dismissCurrent pops next from queue', () => {
    const mockDismiss = vi.fn().mockResolvedValue({ success: true })
    const original = window.electronAPI
    Object.defineProperty(window, 'electronAPI', {
      value: {
        ...original,
        proactive: {
          ...original?.proactive,
          dismissSuggestion: mockDismiss,
          acceptSuggestion: vi.fn().mockResolvedValue({ success: true }),
        },
      },
      writable: true,
    })

    useProactiveStore.getState().pushSuggestion(makeSuggestion('sug_1'))
    useProactiveStore.getState().pushSuggestion(makeSuggestion('sug_2'))
    useProactiveStore.getState().dismissCurrent()

    const state = useProactiveStore.getState()
    expect(state.currentSuggestion!.id).toBe('sug_2')
    expect(state.pendingQueue).toHaveLength(0)

    Object.defineProperty(window, 'electronAPI', { value: original, writable: true })
  })

  it('acceptCurrent pops next from queue', () => {
    const mockAccept = vi.fn().mockResolvedValue({ success: true })
    const original = window.electronAPI
    Object.defineProperty(window, 'electronAPI', {
      value: {
        ...original,
        proactive: {
          ...original?.proactive,
          acceptSuggestion: mockAccept,
          dismissSuggestion: vi.fn().mockResolvedValue({ success: true }),
        },
      },
      writable: true,
    })

    useProactiveStore.getState().pushSuggestion(makeSuggestion('sug_1'))
    useProactiveStore.getState().pushSuggestion(makeSuggestion('sug_2'))
    useProactiveStore.getState().acceptCurrent()

    const state = useProactiveStore.getState()
    expect(state.currentSuggestion!.id).toBe('sug_2')

    Object.defineProperty(window, 'electronAPI', { value: original, writable: true })
  })

  it('sets currentSuggestion to null when queue is empty after dismiss', () => {
    const mockDismiss = vi.fn().mockResolvedValue({ success: true })
    const original = window.electronAPI
    Object.defineProperty(window, 'electronAPI', {
      value: {
        ...original,
        proactive: {
          ...original?.proactive,
          dismissSuggestion: mockDismiss,
          acceptSuggestion: vi.fn().mockResolvedValue({ success: true }),
        },
      },
      writable: true,
    })

    useProactiveStore.getState().pushSuggestion(makeSuggestion('sug_1'))
    useProactiveStore.getState().dismissCurrent()

    const state = useProactiveStore.getState()
    expect(state.currentSuggestion).toBeNull()
    expect(state._shownAt).toBeNull()

    Object.defineProperty(window, 'electronAPI', { value: original, writable: true })
  })

  it('timeoutCurrent pops next without IPC call', () => {
    useProactiveStore.getState().pushSuggestion(makeSuggestion('sug_1'))
    useProactiveStore.getState().pushSuggestion(makeSuggestion('sug_2'))
    useProactiveStore.getState().timeoutCurrent()

    const state = useProactiveStore.getState()
    expect(state.currentSuggestion!.id).toBe('sug_2')
  })
})
