import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type {
  SerializedSpanShared,
  RecentTraceInfoShared,
  TraceStatsShared,
  TraceQueryFilterShared,
  RedactionRuleShared,
  TraceSnapshotShared,
} from '../../shared/types'

interface TraceState {
  recentTraces: RecentTraceInfoShared[]
  selectedTraceId: string | null
  selectedSpanId: string | null
  currentSpans: SerializedSpanShared[]
  viewMode: 'flamegraph' | 'tree' | 'timeline' | 'perf'
  compareTraceId: string | null
  compareSpans: SerializedSpanShared[]
  stats: TraceStatsShared | null
  loading: boolean
  error: string | null
}

interface TraceActions {
  fetchRecentTraces: (limit: number) => Promise<void>
  selectTrace: (traceId: string) => Promise<void>
  fetchTraceTree: (traceId: string) => Promise<void>
  selectSpan: (spanId: string | null) => void
  setViewMode: (mode: TraceState['viewMode']) => void
  setCompareTrace: (traceId: string | null) => Promise<void>
  fetchStats: () => Promise<void>
  lockTrace: (traceId: string, reason?: string) => Promise<void>
  unlockTrace: (traceId: string) => Promise<void>
  previewExport: (traceIds: string[], customRules?: RedactionRuleShared[]) => Promise<void>
  exportTrace: (traceIds: string[], outputPath: string, customRules?: RedactionRuleShared[]) => Promise<void>
  importTrace: (filePath: string) => Promise<void>
  rebuildSnapshot: (traceId: string) => Promise<TraceSnapshotShared | null>
  rerun: (traceId: string) => Promise<string | null>
  reset: () => void
}

export type TraceStore = TraceState & TraceActions

const initialState: TraceState = {
  recentTraces: [],
  selectedTraceId: null,
  selectedSpanId: null,
  currentSpans: [],
  viewMode: 'flamegraph',
  compareTraceId: null,
  compareSpans: [],
  stats: null,
  loading: false,
  error: null,
}

export const useTraceStore = create<TraceStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      fetchRecentTraces: async (limit: number) => {
        set({ loading: true, error: null }, false, 'trace/fetchRecentStart')
        try {
          const response = await window.electronAPI.trace.getRecentTraces(limit)
          if (response.success && response.data) {
            set({ recentTraces: response.data, loading: false }, false, 'trace/fetchRecentSuccess')
          } else {
            set({ error: response.error?.message ?? 'Failed to fetch traces', loading: false }, false, 'trace/fetchRecentError')
          }
        } catch (err) {
          set({ error: String(err), loading: false }, false, 'trace/fetchRecentError')
        }
      },

      selectTrace: async (traceId: string) => {
        set({ selectedTraceId: traceId, loading: true, error: null }, false, 'trace/selectTrace')
        await get().fetchTraceTree(traceId)
      },

      fetchTraceTree: async (traceId: string) => {
        set({ loading: true, error: null }, false, 'trace/fetchTreeStart')
        try {
          const response = await window.electronAPI.trace.getTraceTree(traceId)
          if (response.success && response.data) {
            set({ currentSpans: response.data, loading: false }, false, 'trace/fetchTreeSuccess')
          } else {
            set({ error: response.error?.message ?? 'Failed to fetch trace tree', loading: false }, false, 'trace/fetchTreeError')
          }
        } catch (err) {
          set({ error: String(err), loading: false }, false, 'trace/fetchTreeError')
        }
      },

      selectSpan: (spanId: string | null) => {
        set({ selectedSpanId: spanId }, false, 'trace/selectSpan')
      },

      setViewMode: (mode: TraceState['viewMode']) => {
        set({ viewMode: mode }, false, 'trace/setViewMode')
      },

      setCompareTrace: async (traceId: string | null) => {
        if (traceId === null) {
          set({ compareTraceId: null, compareSpans: [] }, false, 'trace/clearCompare')
          return
        }
        set({ compareTraceId: traceId }, false, 'trace/setCompare')
        try {
          const response = await window.electronAPI.trace.getTraceTree(traceId)
          if (response.success && response.data) {
            set({ compareSpans: response.data }, false, 'trace/setCompareSpans')
          }
        } catch {
          // ignore compare fetch errors
        }
      },

      fetchStats: async () => {
        try {
          const response = await window.electronAPI.trace.getStats()
          if (response.success && response.data) {
            set({ stats: response.data }, false, 'trace/fetchStats')
          }
        } catch {
          // ignore stats fetch errors
        }
      },

      lockTrace: async (traceId: string, reason?: string) => {
        try {
          await window.electronAPI.trace.lockTrace(traceId, reason)
        } catch {
          // ignore lock errors
        }
      },

      unlockTrace: async (traceId: string) => {
        try {
          await window.electronAPI.trace.unlockTrace(traceId)
        } catch {
          // ignore unlock errors
        }
      },

      previewExport: async (traceIds: string[], customRules?: RedactionRuleShared[]) => {
        set({ loading: true, error: null }, false, 'trace/previewExportStart')
        try {
          const response = await window.electronAPI.trace.previewExport(traceIds, customRules)
          if (response.success) {
            set({ loading: false }, false, 'trace/previewExportSuccess')
          } else {
            set({ error: response.error?.message ?? 'Preview export failed', loading: false }, false, 'trace/previewExportError')
          }
        } catch (err) {
          set({ error: String(err), loading: false }, false, 'trace/previewExportError')
        }
      },

      exportTrace: async (traceIds: string[], outputPath: string, customRules?: RedactionRuleShared[]) => {
        set({ loading: true }, false, 'trace/exportStart')
        try {
          const response = await window.electronAPI.trace.exportTrace(traceIds, outputPath, customRules)
          if (response.success) {
            set({ loading: false }, false, 'trace/exportSuccess')
          } else {
            set({ error: response.error?.message ?? 'Export failed', loading: false }, false, 'trace/exportError')
          }
        } catch (err) {
          set({ error: String(err), loading: false }, false, 'trace/exportError')
        }
      },

      importTrace: async (filePath: string) => {
        set({ loading: true }, false, 'trace/importStart')
        try {
          const response = await window.electronAPI.trace.importTrace(filePath)
          if (response.success) {
            set({ loading: false }, false, 'trace/importSuccess')
          } else {
            set({ error: response.error?.message ?? 'Import failed', loading: false }, false, 'trace/importError')
          }
        } catch (err) {
          set({ error: String(err), loading: false }, false, 'trace/importError')
        }
      },

      rebuildSnapshot: async (traceId: string) => {
        try {
          const response = await window.electronAPI.trace.rebuildSnapshot(traceId)
          if (response.success && response.data) {
            return response.data
          }
          return null
        } catch {
          return null
        }
      },

      rerun: async (traceId: string) => {
        try {
          const response = await window.electronAPI.trace.rerun(traceId)
          if (response.success && response.data) {
            return response.data.newTraceId
          }
          return null
        } catch {
          return null
        }
      },

      reset: () => {
        set({
          recentTraces: [],
          selectedTraceId: null,
          selectedSpanId: null,
          currentSpans: [],
          viewMode: 'flamegraph',
          compareTraceId: null,
          compareSpans: [],
          stats: null,
          loading: false,
          error: null,
        }, false, 'trace/reset')
      },
    }),
    { name: 'TraceStore' },
  ),
)

export const selectRecentTraces = (state: TraceStore) => state.recentTraces
export const selectSelectedTraceId = (state: TraceStore) => state.selectedTraceId
export const selectSelectedSpanId = (state: TraceStore) => state.selectedSpanId
export const selectCurrentSpans = (state: TraceStore) => state.currentSpans
export const selectViewMode = (state: TraceStore) => state.viewMode
export const selectCompareTraceId = (state: TraceStore) => state.compareTraceId
export const selectStats = (state: TraceStore) => state.stats
export const selectTraceLoading = (state: TraceStore) => state.loading
export const selectTraceError = (state: TraceStore) => state.error
