import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import type { DashboardOverviewData } from '../../../shared/types'

interface DashboardState {
  data: DashboardOverviewData | null
  isLoading: boolean
  lastRefreshedAt: number | null
  autoRefreshInterval: number
  error: string | null
}

interface DashboardActions {
  fetchOverview: (viewerId: string, viewerRole: string) => Promise<void>
  startAutoRefresh: (viewerId: string, viewerRole: string) => void
  stopAutoRefresh: () => void
  reset: () => void
}

type DashboardStore = DashboardState & DashboardActions

let autoRefreshTimer: ReturnType<typeof setInterval> | null = null

const initialState: DashboardState = {
  data: null,
  isLoading: false,
  lastRefreshedAt: null,
  autoRefreshInterval: 30000,
  error: null,
}

export const useDashboardStore = create<DashboardStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      fetchOverview: async (viewerId: string, viewerRole: string) => {
        set({ isLoading: true, error: null }, false, 'dashboard/fetchStart')
        try {
          const response = await window.electronAPI.dashboard.overview(viewerId, viewerRole)
          if (response.success && response.data) {
            set(
              {
                data: response.data,
                isLoading: false,
                lastRefreshedAt: Date.now(),
              },
              false,
              'dashboard/fetchSuccess',
            )
          } else {
            set(
              { isLoading: false, error: response.error?.message ?? 'Fetch failed' },
              false,
              'dashboard/fetchError',
            )
          }
        } catch (err) {
          set(
            { error: String(err), isLoading: false },
            false,
            'dashboard/fetchError',
          )
        }
      },

      startAutoRefresh: (viewerId: string, viewerRole: string) => {
        const { autoRefreshInterval, fetchOverview } = get()
        if (autoRefreshTimer) clearInterval(autoRefreshTimer)
        autoRefreshTimer = setInterval(() => {
          fetchOverview(viewerId, viewerRole)
        }, autoRefreshInterval)
      },

      stopAutoRefresh: () => {
        if (autoRefreshTimer) {
          clearInterval(autoRefreshTimer)
          autoRefreshTimer = null
        }
      },

      reset: () => {
        set(initialState, false, 'dashboard/reset')
      },
    }),
    { name: 'DashboardStore' },
  ),
)

export type { DashboardStore, DashboardState }
