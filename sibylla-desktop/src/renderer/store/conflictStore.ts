/**
 * Conflict Store — Zustand state management for Git conflict resolution
 *
 * Manages conflict information received from the main process via IPC
 * and provides actions for resolving conflicts through the renderer UI.
 *
 * Design decisions:
 * - Independent from syncStatusStore (conflict info is heavyweight data)
 * - IPC calls encapsulated in actions, components never call window.electronAPI directly
 * - No persist middleware (conflicts are runtime transient state)
 * - devtools middleware for debugging
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { ConflictInfo, ConflictResolution } from '../../shared/types'

interface ConflictState {
  readonly conflicts: ConflictInfo[]
  readonly activeIndex: number
  readonly isResolving: boolean
  readonly resolveError: string | null
}

interface ConflictActions {
  setConflicts: (conflicts: ConflictInfo[]) => void
  setActiveIndex: (index: number) => void
  resolveConflict: (resolution: ConflictResolution) => Promise<void>
  clearConflicts: () => void
}

type ConflictStore = ConflictState & ConflictActions

const initialState: ConflictState = {
  conflicts: [],
  activeIndex: 0,
  isResolving: false,
  resolveError: null,
}

export const useConflictStore = create<ConflictStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      setConflicts: (conflicts) =>
        set({ conflicts, activeIndex: 0, resolveError: null }, false, 'conflict/setConflicts'),

      setActiveIndex: (index) =>
        set({ activeIndex: index }, false, 'conflict/setActiveIndex'),

      resolveConflict: async (resolution) => {
        set({ isResolving: true, resolveError: null }, false, 'conflict/resolveStart')

        try {
          const response = await window.electronAPI.git.resolve(resolution)

          if (!response.success) {
            set(
              { isResolving: false, resolveError: response.error?.message ?? '解决冲突失败' },
              false,
              'conflict/resolveError',
            )
            return
          }

          const { conflicts, activeIndex } = get()
          const remaining = conflicts.filter((c) => c.filePath !== resolution.filePath)

          set(
            {
              conflicts: remaining,
              activeIndex: Math.min(activeIndex, Math.max(0, remaining.length - 1)),
              isResolving: false,
              resolveError: null,
            },
            false,
            'conflict/resolveSuccess',
          )
        } catch (error: unknown) {
          set(
            {
              isResolving: false,
              resolveError: error instanceof Error ? error.message : '解决冲突时发生未知错误',
            },
            false,
            'conflict/resolveException',
          )
        }
      },

      clearConflicts: () =>
        set(initialState, false, 'conflict/clear'),
    }),
    { name: 'ConflictStore' },
  ),
)

export const selectConflicts = (state: ConflictStore) => state.conflicts
export const selectActiveConflict = (state: ConflictStore) =>
  state.conflicts[state.activeIndex] ?? null
export const selectActiveIndex = (state: ConflictStore) => state.activeIndex
export const selectIsResolving = (state: ConflictStore) => state.isResolving
export const selectResolveError = (state: ConflictStore) => state.resolveError
export const selectConflictCount = (state: ConflictStore) => state.conflicts.length
