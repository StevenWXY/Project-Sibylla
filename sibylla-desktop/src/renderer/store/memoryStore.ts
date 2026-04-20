import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type {
  MemoryEntry,
  MemorySection,
  HybridSearchResult,
  EvolutionEvent,
  CheckpointRecord,
  CompressionResult,
  MemoryConfig,
  MemoryV2StatsResponse,
} from '../../shared/types'

// ─── State Types ───

interface MemoryStats {
  totalTokens: number
  entryCount: number
  lastCheckpoint: string
  sections: Record<MemorySection, number>
}

interface MemoryState {
  /** Active memory entries */
  entries: MemoryEntry[]
  /** Archived entries */
  archivedEntries: MemoryEntry[]
  /** Total token count across all entries */
  totalTokens: number
  /** ISO timestamp of last checkpoint */
  lastCheckpoint: string | null
  /** Whether a checkpoint is currently running */
  isCheckpointRunning: boolean
  /** Whether compression can be undone (within 24h) */
  canUndoCompression: boolean
  /** Current search results (null = not searching) */
  searchResults: HybridSearchResult[] | null
  /** Current search query */
  searchQuery: string
  /** ID of selected entry for detail view */
  selectedEntryId: string | null
  /** Global loading state */
  isLoading: boolean
  /** Error message */
  error: string | null
  /** Stats snapshot */
  stats: MemoryStats | null
  /** Memory config */
  config: MemoryConfig | null
  /** Editing entry ID */
  editingEntryId: string | null
  /** History view entry ID */
  historyEntryId: string | null
  /** Evolution events for current history view */
  evolutionEvents: EvolutionEvent[]
}

interface MemoryActions {
  /** Load all active entries from main process */
  loadEntries: () => Promise<void>
  /** Load archived entries */
  loadArchived: () => Promise<void>
  /** Load memory stats */
  loadStats: () => Promise<void>
  /** Load memory config */
  loadConfig: () => Promise<void>
  /** Search entries via hybrid search */
  searchEntries: (query: string) => Promise<void>
  /** Edit an entry's content */
  editEntry: (id: string, newContent: string) => Promise<void>
  /** Delete an entry */
  deleteEntry: (id: string) => Promise<void>
  /** Lock or unlock an entry */
  lockEntry: (id: string, locked: boolean) => Promise<void>
  /** Trigger manual checkpoint */
  triggerCheckpoint: () => Promise<void>
  /** Trigger compression */
  triggerCompression: () => Promise<void>
  /** Undo last compression */
  undoLastCompression: () => Promise<void>
  /** Get evolution history for an entry */
  getEvolutionHistory: (entryId?: string) => Promise<EvolutionEvent[]>
  /** Select an entry for detail view */
  selectEntry: (id: string | null) => void
  /** Set editing entry */
  setEditingEntry: (id: string | null) => void
  /** Set history view entry */
  setHistoryEntry: (id: string | null) => void
  /** Clear search results */
  clearSearch: () => void
  /** Set error message */
  setError: (error: string | null) => void
  /** Initialize IPC event listeners */
  initializeListeners: () => void
  /** Cleanup listeners and reset state */
  reset: () => void
}

type MemoryStore = MemoryState & MemoryActions

// ─── Initial State ───

const initialState: MemoryState = {
  entries: [],
  archivedEntries: [],
  totalTokens: 0,
  lastCheckpoint: null,
  isCheckpointRunning: false,
  canUndoCompression: false,
  searchResults: null,
  searchQuery: '',
  selectedEntryId: null,
  isLoading: false,
  error: null,
  stats: null,
  config: null,
  editingEntryId: null,
  historyEntryId: null,
  evolutionEvents: [],
}

// ─── Listener Management ───

const unsubscribers: Array<() => void> = []

function cleanupListeners(): void {
  for (const unsub of unsubscribers) {
    unsub()
  }
  unsubscribers.length = 0
}

// ─── Store ───

export const useMemoryStore = create<MemoryStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      loadEntries: async () => {
        set({ isLoading: true, error: null }, false, 'memory/loadEntries:start')
        try {
          const response = await window.electronAPI.memory.listEntries()
          if (response.success && response.data) {
            set({ entries: response.data, isLoading: false }, false, 'memory/loadEntries:success')
          } else {
            set({
              isLoading: false,
              error: response.error?.message ?? 'Failed to load entries',
            }, false, 'memory/loadEntries:error')
          }
        } catch (err) {
          set({
            isLoading: false,
            error: `Failed to load entries: ${err instanceof Error ? err.message : String(err)}`,
          }, false, 'memory/loadEntries:exception')
        }
      },

      loadArchived: async () => {
        try {
          const response = await window.electronAPI.memory.listArchived()
          if (response.success && response.data) {
            set({ archivedEntries: response.data }, false, 'memory/loadArchived:success')
          }
        } catch (err) {
          console.error('[memoryStore] Failed to load archived entries:', err)
        }
      },

      loadStats: async () => {
        try {
          const response = await window.electronAPI.memory.getStats()
          if (response.success && response.data) {
            const statsData = response.data as MemoryV2StatsResponse
            set({
              stats: {
                totalTokens: statsData.totalTokens,
                entryCount: statsData.entryCount,
                lastCheckpoint: statsData.lastCheckpoint,
                sections: statsData.sections,
              },
              totalTokens: statsData.totalTokens,
              lastCheckpoint: statsData.lastCheckpoint || null,
            }, false, 'memory/loadStats:success')
          }
        } catch (err) {
          console.error('[memoryStore] Failed to load stats:', err)
        }
      },

      loadConfig: async () => {
        try {
          const response = await window.electronAPI.memory.getConfig()
          if (response.success && response.data) {
            set({ config: response.data }, false, 'memory/loadConfig:success')
          }
        } catch (err) {
          console.error('[memoryStore] Failed to load config:', err)
        }
      },

      searchEntries: async (query: string) => {
        set({ searchQuery: query, isLoading: true }, false, 'memory/search:start')
        try {
          const response = await window.electronAPI.memory.search(query)
          if (response.success && response.data) {
            set({
              searchResults: response.data,
              isLoading: false,
            }, false, 'memory/search:success')
          } else {
            set({
              isLoading: false,
              error: response.error?.message ?? 'Search failed',
            }, false, 'memory/search:error')
          }
        } catch (err) {
          set({
            isLoading: false,
            error: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
          }, false, 'memory/search:exception')
        }
      },

      editEntry: async (id: string, newContent: string) => {
        set({ isLoading: true, error: null }, false, 'memory/editEntry:start')
        try {
          const response = await window.electronAPI.memory.updateEntry(id, { content: newContent })
          if (response.success) {
            set({ editingEntryId: null }, false, 'memory/editEntry:success')
            await get().loadEntries()
            await get().loadStats()
          } else {
            set({
              isLoading: false,
              error: response.error?.message ?? 'Failed to update entry',
            }, false, 'memory/editEntry:error')
          }
        } catch (err) {
          set({
            isLoading: false,
            error: `Failed to update entry: ${err instanceof Error ? err.message : String(err)}`,
          }, false, 'memory/editEntry:exception')
        }
      },

      deleteEntry: async (id: string) => {
        set({ isLoading: true, error: null }, false, 'memory/deleteEntry:start')
        try {
          const response = await window.electronAPI.memory.deleteEntry(id)
          if (response.success) {
            await get().loadEntries()
            await get().loadStats()
          } else {
            set({
              isLoading: false,
              error: response.error?.message ?? 'Failed to delete entry',
            }, false, 'memory/deleteEntry:error')
          }
        } catch (err) {
          set({
            isLoading: false,
            error: `Failed to delete entry: ${err instanceof Error ? err.message : String(err)}`,
          }, false, 'memory/deleteEntry:exception')
        }
      },

      lockEntry: async (id: string, locked: boolean) => {
        try {
          const response = await window.electronAPI.memory.lockEntry(id, locked)
          if (response.success) {
            // Optimistic update
            set(
              (state) => ({
                entries: state.entries.map((e) =>
                  e.id === id ? { ...e, locked } : e,
                ),
              }),
              false,
              'memory/lockEntry:success',
            )
          } else {
            set({
              error: response.error?.message ?? 'Failed to lock/unlock entry',
            }, false, 'memory/lockEntry:error')
          }
        } catch (err) {
          set({
            error: `Failed to lock/unlock entry: ${err instanceof Error ? err.message : String(err)}`,
          }, false, 'memory/lockEntry:exception')
        }
      },

      triggerCheckpoint: async () => {
        set({ isCheckpointRunning: true, error: null }, false, 'memory/triggerCheckpoint:start')
        try {
          const response = await window.electronAPI.memory.triggerCheckpoint()
          if (!response.success) {
            set({
              isCheckpointRunning: false,
              error: response.error?.message ?? 'Failed to trigger checkpoint',
            }, false, 'memory/triggerCheckpoint:error')
          }
          // isCheckpointRunning will be cleared by event listener
        } catch (err) {
          set({
            isCheckpointRunning: false,
            error: `Failed to trigger checkpoint: ${err instanceof Error ? err.message : String(err)}`,
          }, false, 'memory/triggerCheckpoint:exception')
        }
      },

      triggerCompression: async () => {
        set({ isLoading: true, error: null }, false, 'memory/triggerCompression:start')
        try {
          const response = await window.electronAPI.memory.triggerCompression()
          if (response.success) {
            set({ canUndoCompression: true, isLoading: false }, false, 'memory/triggerCompression:success')
            await get().loadEntries()
            await get().loadStats()
          } else {
            set({
              isLoading: false,
              error: response.error?.message ?? 'Failed to trigger compression',
            }, false, 'memory/triggerCompression:error')
          }
        } catch (err) {
          set({
            isLoading: false,
            error: `Compression failed: ${err instanceof Error ? err.message : String(err)}`,
          }, false, 'memory/triggerCompression:exception')
        }
      },

      undoLastCompression: async () => {
        set({ isLoading: true, error: null }, false, 'memory/undoCompression:start')
        try {
          const response = await window.electronAPI.memory.undoLastCompression()
          if (response.success) {
            set({ canUndoCompression: false, isLoading: false }, false, 'memory/undoCompression:success')
            await get().loadEntries()
            await get().loadStats()
          } else {
            set({
              isLoading: false,
              error: response.error?.message ?? 'Failed to undo compression',
            }, false, 'memory/undoCompression:error')
          }
        } catch (err) {
          set({
            isLoading: false,
            error: `Undo compression failed: ${err instanceof Error ? err.message : String(err)}`,
          }, false, 'memory/undoCompression:exception')
        }
      },

      getEvolutionHistory: async (entryId?: string) => {
        try {
          const response = await window.electronAPI.memory.getEvolutionHistory(entryId)
          if (response.success && response.data) {
            set({ evolutionEvents: response.data }, false, 'memory/getHistory:success')
            return response.data
          }
          return []
        } catch (err) {
          console.error('[memoryStore] Failed to get evolution history:', err)
          return []
        }
      },

      selectEntry: (id: string | null) => {
        set({ selectedEntryId: id }, false, 'memory/selectEntry')
      },

      setEditingEntry: (id: string | null) => {
        set({ editingEntryId: id }, false, 'memory/setEditingEntry')
      },

      setHistoryEntry: (id: string | null) => {
        set({ historyEntryId: id }, false, 'memory/setHistoryEntry')
        if (id) {
          void get().getEvolutionHistory(id)
        } else {
          set({ evolutionEvents: [] }, false, 'memory/clearHistory')
        }
      },

      clearSearch: () => {
        set({ searchResults: null, searchQuery: '' }, false, 'memory/clearSearch')
      },

      setError: (error: string | null) => {
        set({ error }, false, 'memory/setError')
      },

      initializeListeners: () => {
        // Clean up any existing listeners first
        cleanupListeners()

        const { loadEntries, loadStats } = get()

        // Checkpoint events
        unsubscribers.push(
          window.electronAPI.memory.onCheckpointStarted(() => {
            set({ isCheckpointRunning: true }, false, 'memory/event:checkpointStarted')
          }),
        )
        unsubscribers.push(
          window.electronAPI.memory.onCheckpointCompleted(() => {
            set({ isCheckpointRunning: false }, false, 'memory/event:checkpointCompleted')
            void loadEntries()
            void loadStats()
          }),
        )
        unsubscribers.push(
          window.electronAPI.memory.onCheckpointFailed(() => {
            set({ isCheckpointRunning: false }, false, 'memory/event:checkpointFailed')
          }),
        )

        // Entry change events
        unsubscribers.push(
          window.electronAPI.memory.onEntryAdded(() => {
            void loadEntries()
          }),
        )
        unsubscribers.push(
          window.electronAPI.memory.onEntryUpdated(() => {
            void loadEntries()
          }),
        )
        unsubscribers.push(
          window.electronAPI.memory.onEntryDeleted(() => {
            void loadEntries()
          }),
        )
      },

      reset: () => {
        cleanupListeners()
        set(initialState, false, 'memory/reset')
      },
    }),
    { name: 'MemoryStore' },
  ),
)

// ─── Selectors ───

export const selectEntries = (state: MemoryStore): MemoryEntry[] => state.entries
export const selectArchivedEntries = (state: MemoryStore): MemoryEntry[] => state.archivedEntries
export const selectTotalTokens = (state: MemoryStore): number => state.totalTokens
export const selectIsCheckpointRunning = (state: MemoryStore): boolean => state.isCheckpointRunning
export const selectSearchResults = (state: MemoryStore): HybridSearchResult[] | null => state.searchResults
export const selectIsLoading = (state: MemoryStore): boolean => state.isLoading
export const selectError = (state: MemoryStore): string | null => state.error
export const selectStats = (state: MemoryStore): MemoryStats | null => state.stats
export const selectConfig = (state: MemoryStore): MemoryConfig | null => state.config
export const selectCanUndoCompression = (state: MemoryStore): boolean => state.canUndoCompression

/** Entries grouped by section */
export const selectEntriesBySection = (section: MemorySection) => (state: MemoryStore): MemoryEntry[] =>
  state.entries
    .filter((e) => e.section === section)
    .sort((a, b) => {
      // Sort by confidence × log(hits + 1) descending
      const scoreA = a.confidence * Math.log(a.hits + 1)
      const scoreB = b.confidence * Math.log(b.hits + 1)
      return scoreB - scoreA
    })

export type { MemoryStore, MemoryState, MemoryActions }
