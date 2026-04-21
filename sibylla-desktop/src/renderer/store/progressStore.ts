import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type {
  TaskRecordShared,
  ProgressSnapshotShared,
} from '../../shared/types'

interface ProgressState {
  snapshot: ProgressSnapshotShared | null
  loading: boolean
  error: string | null
}

interface ProgressActions {
  fetchSnapshot: () => Promise<void>
  editUserNote: (taskId: string, note: string) => Promise<void>
  getArchive: (month: string) => Promise<string | null>
  updateTaskInSnapshot: (task: TaskRecordShared) => void
  reset: () => void
}

export type ProgressStore = ProgressState & ProgressActions

const initialState: ProgressState = {
  snapshot: null,
  loading: false,
  error: null,
}

export const useProgressStore = create<ProgressStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      fetchSnapshot: async () => {
        set({ loading: true, error: null }, false, 'progress/fetchStart')
        try {
          const response = await window.electronAPI.progress.getSnapshot()
          if (response.success && response.data) {
            set({ snapshot: response.data, loading: false }, false, 'progress/fetchSuccess')
          } else {
            set({ error: response.error?.message ?? 'Failed to fetch snapshot', loading: false }, false, 'progress/fetchError')
          }
        } catch (err) {
          set({ error: String(err), loading: false }, false, 'progress/fetchError')
        }
      },

      editUserNote: async (taskId: string, note: string) => {
        try {
          const response = await window.electronAPI.progress.editUserNote(taskId, note)
          if (response.success) {
            const snapshot = get().snapshot
            if (snapshot) {
              const updated = {
                ...snapshot,
                active: snapshot.active.map(t => t.id === taskId ? { ...t, userNotes: note } : t),
                completedRecent: snapshot.completedRecent.map(t => t.id === taskId ? { ...t, userNotes: note } : t),
              }
              set({ snapshot: updated }, false, 'progress/noteUpdated')
            }
          }
        } catch {
          // ignore note edit errors
        }
      },

      getArchive: async (month: string) => {
        try {
          const response = await window.electronAPI.progress.getArchive(month)
          if (response.success && response.data) {
            return response.data
          }
          return null
        } catch {
          return null
        }
      },

      updateTaskInSnapshot: (task: TaskRecordShared) => {
        const snapshot = get().snapshot
        if (!snapshot) return

        const isInList = (list: TaskRecordShared[] | undefined, id: string) =>
          Array.isArray(list) && list.some(t => t.id === id)

        const updateList = (list: TaskRecordShared[] | undefined, id: string, updated: TaskRecordShared) =>
          Array.isArray(list) ? list.map(t => t.id === id ? updated : t) : [updated]

        const removeFromList = (list: TaskRecordShared[] | undefined, id: string) =>
          Array.isArray(list) ? list.filter(t => t.id !== id) : []

        let newActive = snapshot.active ?? []
        let newCompleted = snapshot.completedRecent ?? []
        let newQueued = snapshot.queued ?? []

        const isActive = isInList(snapshot.active, task.id)
        const isQueued = isInList(snapshot.queued, task.id)
        const isCompleted = isInList(snapshot.completedRecent, task.id)

        switch (task.state) {
          case 'queued':
            if (isQueued) {
              newQueued = updateList(snapshot.queued, task.id, task)
            } else {
              newQueued = [...(snapshot.queued ?? []), task]
            }
            newActive = removeFromList(snapshot.active, task.id)
            newCompleted = removeFromList(snapshot.completedRecent, task.id)
            break
          case 'running':
          case 'paused':
            if (isActive) {
              newActive = updateList(snapshot.active, task.id, task)
            } else {
              newActive = [...(snapshot.active ?? []), task]
            }
            newQueued = removeFromList(snapshot.queued, task.id)
            newCompleted = removeFromList(snapshot.completedRecent, task.id)
            break
          case 'completed':
          case 'failed':
            if (isCompleted) {
              newCompleted = updateList(snapshot.completedRecent, task.id, task)
            } else {
              newCompleted = [...(snapshot.completedRecent ?? []), task]
            }
            newActive = removeFromList(snapshot.active, task.id)
            newQueued = removeFromList(snapshot.queued, task.id)
            break
        }

        set({
          snapshot: {
            ...snapshot,
            active: newActive,
            completedRecent: newCompleted,
            queued: newQueued,
            updatedAt: new Date().toISOString(),
          },
        }, false, 'progress/taskUpdated')
      },

      reset: () => {
        set({
          snapshot: null,
          loading: false,
          error: null,
        }, false, 'progress/reset')
      },
    }),
    { name: 'ProgressStore' },
  ),
)

export const selectSnapshot = (state: ProgressStore) => state.snapshot
export const selectProgressLoading = (state: ProgressStore) => state.loading
export const selectProgressError = (state: ProgressStore) => state.error
