import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { SyncStatus, SyncStatusData } from '../../shared/types'

interface SyncStatusState {
  status: SyncStatus
  lastSyncedAt: number | null
  errorMessage: string | null
  conflictFiles: readonly string[]
}

interface SyncStatusActions {
  setState: (data: SyncStatusData) => void
  reset: () => void
}

type SyncStatusStore = SyncStatusState & SyncStatusActions

const initialState: SyncStatusState = {
  status: 'idle',
  lastSyncedAt: null,
  errorMessage: null,
  conflictFiles: [],
}

export const useSyncStatusStore = create<SyncStatusStore>()(
  devtools(
    (set) => ({
      ...initialState,

      setState: (data) =>
        set((_state) => ({
          status: data.status,
          lastSyncedAt: data.status === 'synced' ? data.timestamp : null,
          errorMessage: data.message ?? null,
          conflictFiles: data.conflictFiles ?? [],
        }), false, 'syncStatus/setState'),

      reset: () =>
        set(initialState, false, 'syncStatus/reset'),
    }),
    { name: 'SyncStatusStore' }
  )
)

export const selectStatus = (state: SyncStatusStore) => state.status
export const selectLastSyncedAt = (state: SyncStatusStore) => state.lastSyncedAt
export const selectErrorMessage = (state: SyncStatusStore) => state.errorMessage
export const selectConflictFiles = (state: SyncStatusStore) => state.conflictFiles
