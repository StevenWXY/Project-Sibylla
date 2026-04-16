import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  useConflictStore,
  selectConflicts,
  selectActiveConflict,
  selectActiveIndex,
  selectConflictCount,
  selectIsResolving,
  selectResolveError,
} from '../../src/renderer/store/conflictStore'
import type { ConflictInfo } from '../../src/shared/types'

const MOCK_CONFLICT_A: ConflictInfo = {
  filePath: 'docs/a.md',
  localContent: 'local-a',
  remoteContent: 'remote-a',
  baseContent: '',
}

const MOCK_CONFLICT_B: ConflictInfo = {
  filePath: 'docs/b.md',
  localContent: 'local-b',
  remoteContent: 'remote-b',
  baseContent: '',
}

describe('conflictStore', () => {
  beforeEach(() => {
    useConflictStore.getState().clearConflicts()
    vi.clearAllMocks()
  })

  it('has correct initial state', () => {
    const state = useConflictStore.getState()
    expect(state.conflicts).toEqual([])
    expect(state.activeIndex).toBe(0)
    expect(state.isResolving).toBe(false)
    expect(state.resolveError).toBeNull()
  })

  describe('setConflicts', () => {
    it('sets conflicts and resets activeIndex', () => {
      useConflictStore.getState().setConflicts([MOCK_CONFLICT_A, MOCK_CONFLICT_B])

      const state = useConflictStore.getState()
      expect(state.conflicts).toHaveLength(2)
      expect(state.activeIndex).toBe(0)
      expect(state.resolveError).toBeNull()
    })

    it('overwrites previous conflicts', () => {
      useConflictStore.getState().setConflicts([MOCK_CONFLICT_A])
      useConflictStore.getState().setConflicts([MOCK_CONFLICT_B])

      expect(useConflictStore.getState().conflicts).toHaveLength(1)
      expect(useConflictStore.getState().conflicts[0].filePath).toBe('docs/b.md')
    })
  })

  describe('setActiveIndex', () => {
    it('updates active index', () => {
      useConflictStore.getState().setConflicts([MOCK_CONFLICT_A, MOCK_CONFLICT_B])
      useConflictStore.getState().setActiveIndex(1)

      expect(useConflictStore.getState().activeIndex).toBe(1)
    })
  })

  describe('resolveConflict', () => {
    it('removes resolved file from conflicts list', async () => {
      const mockResolve = vi.fn().mockResolvedValue({
        success: true,
        data: 'commit-oid',
      })
      ;(window as unknown as { electronAPI: { git: { resolve: typeof mockResolve } } }).electronAPI = {
        git: { resolve: mockResolve },
      } as never

      useConflictStore.getState().setConflicts([MOCK_CONFLICT_A, MOCK_CONFLICT_B])

      await useConflictStore.getState().resolveConflict({
        filePath: 'docs/a.md',
        type: 'mine',
      })

      const state = useConflictStore.getState()
      expect(state.conflicts).toHaveLength(1)
      expect(state.conflicts[0].filePath).toBe('docs/b.md')
      expect(state.isResolving).toBe(false)
    })

    it('sets resolveError on IPC failure', async () => {
      const mockResolve = vi.fn().mockResolvedValue({
        success: false,
        error: { message: 'Resolve failed' },
      })
      ;(window as unknown as { electronAPI: { git: { resolve: typeof mockResolve } } }).electronAPI = {
        git: { resolve: mockResolve },
      } as never

      useConflictStore.getState().setConflicts([MOCK_CONFLICT_A])

      await useConflictStore.getState().resolveConflict({
        filePath: 'docs/a.md',
        type: 'mine',
      })

      const state = useConflictStore.getState()
      expect(state.resolveError).toBe('Resolve failed')
      expect(state.conflicts).toHaveLength(1)
    })

    it('clamps activeIndex when resolving last conflict', async () => {
      const mockResolve = vi.fn().mockResolvedValue({
        success: true,
        data: 'commit-oid',
      })
      ;(window as unknown as { electronAPI: { git: { resolve: typeof mockResolve } } }).electronAPI = {
        git: { resolve: mockResolve },
      } as never

      useConflictStore.getState().setConflicts([MOCK_CONFLICT_A, MOCK_CONFLICT_B])
      useConflictStore.getState().setActiveIndex(1)

      await useConflictStore.getState().resolveConflict({
        filePath: 'docs/b.md',
        type: 'theirs',
      })

      const state = useConflictStore.getState()
      expect(state.conflicts).toHaveLength(1)
      expect(state.activeIndex).toBe(0)
    })

    it('results in empty list after resolving all conflicts', async () => {
      const mockResolve = vi.fn().mockResolvedValue({
        success: true,
        data: 'commit-oid',
      })
      ;(window as unknown as { electronAPI: { git: { resolve: typeof mockResolve } } }).electronAPI = {
        git: { resolve: mockResolve },
      } as never

      useConflictStore.getState().setConflicts([MOCK_CONFLICT_A])

      await useConflictStore.getState().resolveConflict({
        filePath: 'docs/a.md',
        type: 'mine',
      })

      const state = useConflictStore.getState()
      expect(state.conflicts).toHaveLength(0)
      expect(state.activeIndex).toBe(0)
    })
  })

  describe('clearConflicts', () => {
    it('resets to initial state', () => {
      useConflictStore.getState().setConflicts([MOCK_CONFLICT_A])
      useConflictStore.getState().clearConflicts()

      const state = useConflictStore.getState()
      expect(state.conflicts).toEqual([])
      expect(state.activeIndex).toBe(0)
      expect(state.isResolving).toBe(false)
      expect(state.resolveError).toBeNull()
    })
  })

  describe('selectors', () => {
    it('selectActiveConflict returns active conflict', () => {
      useConflictStore.getState().setConflicts([MOCK_CONFLICT_A, MOCK_CONFLICT_B])
      useConflictStore.getState().setActiveIndex(1)

      const active = selectActiveConflict(useConflictStore.getState())
      expect(active?.filePath).toBe('docs/b.md')
    })

    it('selectActiveConflict returns null when empty', () => {
      const active = selectActiveConflict(useConflictStore.getState())
      expect(active).toBeNull()
    })

    it('selectConflictCount returns count', () => {
      useConflictStore.getState().setConflicts([MOCK_CONFLICT_A, MOCK_CONFLICT_B])
      expect(selectConflictCount(useConflictStore.getState())).toBe(2)
    })

    it('selectIsResolving returns isResolving', () => {
      expect(selectIsResolving(useConflictStore.getState())).toBe(false)
    })

    it('selectResolveError returns resolveError', () => {
      expect(selectResolveError(useConflictStore.getState())).toBeNull()
    })
  })
})
