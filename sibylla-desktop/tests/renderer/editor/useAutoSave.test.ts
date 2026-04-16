import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAutoSave } from '../../../src/renderer/hooks/useAutoSave'
import { useEditorStore } from '../../../src/renderer/store/editorStore'

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useEditorStore.getState().reset()

    Object.defineProperty(globalThis, 'window', {
      value: {
        electronAPI: {
          file: {
            notifyChange: vi.fn(),
            onAutoSaved: vi.fn(() => () => {}),
            onSaveFailed: vi.fn(() => () => {}),
          },
        },
      },
      writable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    useEditorStore.getState().reset()
  })

  it('returns flush function', () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onError = vi.fn()

    const { result } = renderHookWithNullEditor(onSave, onError)

    expect(result.current).toHaveProperty('flush')
    expect(typeof result.current.flush).toBe('function')
  })

  it('does not call onSave immediately on mount', () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onError = vi.fn()

    renderHookWithNullEditor(onSave, onError)

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(onSave).not.toHaveBeenCalled()
  })

  it('does not trigger save when editor is null', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onError = vi.fn()

    const { result } = renderHookWithNullEditor(onSave, onError)

    await act(async () => {
      await result.current.flush()
    })

    expect(onSave).not.toHaveBeenCalled()
  })

  it('handles null editor gracefully', () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onError = vi.fn()

    expect(() => renderHookWithNullEditor(onSave, onError)).not.toThrow()
  })
})

function renderHookWithNullEditor(
  onSave: (content: string) => Promise<void>,
  onError: (error: Error) => void
) {
  const { renderHook } = require('@testing-library/react')
  const React = require('react')

  return renderHook(() =>
    useAutoSave(null, '/test.md', {
      enabled: true,
      debounceMs: 1000,
      onSave,
      onError,
    })
  )
}

const { renderHook, act } = require('@testing-library/react')
