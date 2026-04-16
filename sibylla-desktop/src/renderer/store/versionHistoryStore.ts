import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { CommitInfo, FileDiff } from '../../shared/types/git.types'

interface VersionEntry {
  readonly oid: string
  readonly message: string
  readonly author: string
  readonly timestamp: number
  readonly summary: string
}

interface VersionHistoryState {
  readonly isOpen: boolean
  readonly filePath: string | null
  readonly versions: readonly VersionEntry[]
  readonly selectedVersion: VersionEntry | null
  readonly diff: FileDiff | null
  readonly isLoadingHistory: boolean
  readonly isLoadingDiff: boolean
  readonly isRestoring: boolean
  readonly error: string | null
  readonly page: number
}

interface VersionHistoryActions {
  openPanel: (filePath: string) => void
  closePanel: () => void
  loadHistory: () => Promise<void>
  selectVersion: (version: VersionEntry) => void
  restoreVersion: () => Promise<void>
  setPage: (page: number) => void
  clearError: () => void
}

const PAGE_SIZE = 50

function extractSummary(message: string): string {
  const firstLine = message.split('\n')[0] ?? ''
  return firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : firstLine
}

function commitInfoToVersionEntry(info: CommitInfo): VersionEntry {
  return {
    oid: info.oid,
    message: info.message,
    author: info.authorName,
    timestamp: info.timestamp,
    summary: extractSummary(info.message),
  }
}

type VersionHistoryStore = VersionHistoryState & VersionHistoryActions

const initialState: VersionHistoryState = {
  isOpen: false,
  filePath: null,
  versions: [],
  selectedVersion: null,
  diff: null,
  isLoadingHistory: false,
  isLoadingDiff: false,
  isRestoring: false,
  error: null,
  page: 0,
}

export const useVersionHistoryStore = create<VersionHistoryStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      openPanel: (filePath: string) => {
        set({
          isOpen: true,
          filePath,
          versions: [],
          selectedVersion: null,
          diff: null,
          error: null,
          page: 0,
          isLoadingHistory: true,
        }, false, 'versionHistory/openPanel')

        const load = get().loadHistory
        void load()
      },

      closePanel: () => {
        set({ ...initialState }, false, 'versionHistory/closePanel')
      },

      loadHistory: async () => {
        const { filePath, page } = get()
        if (!filePath) return

        set({ isLoadingHistory: true, error: null }, false, 'versionHistory/loadHistoryStart')

        try {
          const response = await window.electronAPI.git.history({
            filepath: filePath,
            depth: PAGE_SIZE * (page + 1),
          })

          if (!response.success || !response.data) {
            set({
              isLoadingHistory: false,
              error: response.error?.message ?? '加载版本历史失败',
            }, false, 'versionHistory/loadHistoryError')
            return
          }

          const versions = response.data.map(commitInfoToVersionEntry)
          set({ versions, isLoadingHistory: false }, false, 'versionHistory/loadHistorySuccess')
        } catch (error: unknown) {
          set({
            isLoadingHistory: false,
            error: error instanceof Error ? error.message : '加载版本历史失败',
          }, false, 'versionHistory/loadHistoryError')
        }
      },

      selectVersion: (version: VersionEntry) => {
        set({ selectedVersion: version, diff: null, isLoadingDiff: true }, false, 'versionHistory/selectVersion')

        const { filePath } = get()
        if (!filePath) return

        void (async () => {
          try {
            const response = await window.electronAPI.git.diff(filePath, version.oid)

            if (!response.success || !response.data) {
              set({
                isLoadingDiff: false,
                error: response.error?.message ?? '加载差异失败',
              }, false, 'versionHistory/diffError')
              return
            }

            set({ diff: response.data, isLoadingDiff: false }, false, 'versionHistory/diffSuccess')
          } catch (error: unknown) {
            set({
              isLoadingDiff: false,
              error: error instanceof Error ? error.message : '加载差异失败',
            }, false, 'versionHistory/diffError')
          }
        })()
      },

      restoreVersion: async () => {
        const { filePath, selectedVersion } = get()
        if (!filePath || !selectedVersion) return

        set({ isRestoring: true, error: null }, false, 'versionHistory/restoreStart')

        try {
          const response = await window.electronAPI.git.restore(filePath, selectedVersion.oid)

          if (!response.success) {
            set({
              isRestoring: false,
              error: response.error?.message ?? '恢复版本失败',
            }, false, 'versionHistory/restoreError')
            return
          }

          set({ ...initialState }, false, 'versionHistory/restoreSuccess')
        } catch (error: unknown) {
          set({
            isRestoring: false,
            error: error instanceof Error ? error.message : '恢复版本失败',
          }, false, 'versionHistory/restoreError')
        }
      },

      setPage: (page: number) => {
        set({ page }, false, 'versionHistory/setPage')
        const load = get().loadHistory
        void load()
      },

      clearError: () => {
        set({ error: null }, false, 'versionHistory/clearError')
      },
    }),
    { name: 'VersionHistoryStore' },
  ),
)

export type { VersionEntry, VersionHistoryState, VersionHistoryActions }
export { PAGE_SIZE }
