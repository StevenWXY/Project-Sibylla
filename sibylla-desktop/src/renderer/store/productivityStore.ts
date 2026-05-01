import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import type { AnalysisPeriod, ProductivityReport } from '../../../main/services/productivity/types'

interface ProductivityState {
  report: ProductivityReport | null
  isLoading: boolean
  period: AnalysisPeriod
  selectedMemberId: string | null
  error: string | null
}

interface ProductivityActions {
  analyze: (period: AnalysisPeriod, memberId?: string, viewerId?: string) => Promise<void>
  setPeriod: (period: AnalysisPeriod) => void
  selectMember: (memberId: string | null) => void
  reset: () => void
}

type ProductivityStore = ProductivityState & ProductivityActions

const initialState: ProductivityState = {
  report: null,
  isLoading: false,
  period: 'week',
  selectedMemberId: null,
  error: null,
}

export const useProductivityStore = create<ProductivityStore>()(
  devtools(
    (set) => ({
      ...initialState,

      analyze: async (period: AnalysisPeriod, memberId?: string, viewerId?: string) => {
        set({ isLoading: true, error: null, period }, false, 'productivity/analyzeStart')
        try {
          const response = await window.electronAPI.productivity.analyze(period, memberId, viewerId)
          if (response.success && response.data) {
            set(
              { report: response.data as ProductivityReport, isLoading: false },
              false,
              'productivity/analyzeSuccess',
            )
          } else {
            set(
              { isLoading: false, error: response.error?.message ?? 'Analysis failed' },
              false,
              'productivity/analyzeError',
            )
          }
        } catch (err) {
          set(
            { error: String(err), isLoading: false },
            false,
            'productivity/analyzeError',
          )
        }
      },

      setPeriod: (period: AnalysisPeriod) => {
        set({ period }, false, 'productivity/setPeriod')
      },

      selectMember: (memberId: string | null) => {
        set({ selectedMemberId: memberId }, false, 'productivity/selectMember')
      },

      reset: () => {
        set(initialState, false, 'productivity/reset')
      },
    }),
    { name: 'ProductivityStore' },
  ),
)

export type { ProductivityStore, ProductivityState }
