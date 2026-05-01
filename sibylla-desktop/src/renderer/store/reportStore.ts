import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface ReportListEntry {
  type: 'daily' | 'weekly'
  date: string
  filePath: string
}

interface ReportState {
  reports: ReportListEntry[]
  currentReport: string | null
  isGenerating: boolean
  generateError: string | null
  isLoading: boolean
}

interface ReportActions {
  fetchReportList: () => Promise<void>
  getReport: (filePath: string) => Promise<string>
  generateReport: (type: 'daily-personal' | 'weekly-team') => Promise<void>
  reset: () => void
}

type ReportStore = ReportState & ReportActions

const initialState: ReportState = {
  reports: [],
  currentReport: null,
  isGenerating: false,
  generateError: null,
  isLoading: false,
}

export const useReportStore = create<ReportStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      fetchReportList: async () => {
        set({ isLoading: true }, false, 'report/fetchStart')
        try {
          const response = await window.electronAPI.report.list()
          if (response.success && response.data) {
            set(
              { reports: response.data as ReportListEntry[], isLoading: false },
              false,
              'report/fetchSuccess',
            )
          } else {
            set(
              { isLoading: false, generateError: response.error?.message ?? 'Failed to fetch reports' },
              false,
              'report/fetchError',
            )
          }
        } catch (err) {
          set(
            { generateError: String(err), isLoading: false },
            false,
            'report/fetchError',
          )
        }
      },

      getReport: async (filePath: string) => {
        const response = await window.electronAPI.report.get(filePath)
        if (response.success && response.data !== undefined) {
          set(
            { currentReport: response.data as string },
            false,
            'report/getSuccess',
          )
          return response.data as string
        }
        throw new Error(response.error?.message ?? 'Failed to get report')
      },

      generateReport: async (type: 'daily-personal' | 'weekly-team') => {
        set({ isGenerating: true, generateError: null }, false, 'report/generateStart')
        try {
          const response = await window.electronAPI.report.generate(type)
          if (response.success) {
            set(
              { isGenerating: false },
              false,
              'report/generateSuccess',
            )
            await get().fetchReportList()
          } else {
            set(
              { isGenerating: false, generateError: response.error?.message ?? 'Generation failed' },
              false,
              'report/generateError',
            )
          }
        } catch (err) {
          set(
            { generateError: String(err), isGenerating: false },
            false,
            'report/generateError',
          )
        }
      },

      reset: () => {
        set(initialState, false, 'report/reset')
      },
    }),
    { name: 'ReportStore' },
  ),
)

export type { ReportStore, ReportState, ReportListEntry }
