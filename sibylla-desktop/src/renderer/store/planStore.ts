import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { PlanMetadataShared, ParsedPlanShared, PlanFollowUpResultShared } from '../../shared/types'

interface PlanState {
  activePlans: PlanMetadataShared[]
  currentPlan: ParsedPlanShared | null
  loading: boolean
  error: string | null
}

interface PlanActions {
  fetchActivePlans: () => Promise<void>
  fetchPlan: (id: string) => Promise<void>
  startExecution: (id: string) => Promise<void>
  archive: (id: string, targetPath: string) => Promise<void>
  abandon: (id: string) => Promise<void>
  followUp: (id: string) => Promise<PlanFollowUpResultShared>
  clearError: () => void
}

type PlanStore = PlanState & PlanActions

const initialState: PlanState = {
  activePlans: [],
  currentPlan: null,
  loading: false,
  error: null,
}

const unsubscribers: Array<() => void> = []

export const usePlanStore = create<PlanStore>()(
  devtools(
    (set, _get) => ({
      ...initialState,

      fetchActivePlans: async () => {
        set({ loading: true, error: null }, false, 'plan/fetchActivePlansStart')
        try {
          const response = await window.electronAPI.plan.getActivePlans()
          if (response.success && response.data) {
            set({ activePlans: response.data, loading: false }, false, 'plan/fetchActivePlansSuccess')
          } else {
            set(
              { error: (response.error as { message: string })?.message ?? 'Failed to fetch plans', loading: false },
              false,
              'plan/fetchActivePlansError',
            )
          }
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : String(error), loading: false },
            false,
            'plan/fetchActivePlansError',
          )
        }
      },

      fetchPlan: async (id: string) => {
        try {
          const response = await window.electronAPI.plan.getPlan(id)
          if (response.success) {
            set({ currentPlan: response.data ?? null }, false, 'plan/fetchPlan')
          }
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : String(error) },
            false,
            'plan/fetchPlanError',
          )
        }
      },

      startExecution: async (id: string) => {
        try {
          const response = await window.electronAPI.plan.startExecution(id)
          if (response.success) {
            set(
              (state) => ({
                activePlans: state.activePlans.map(p =>
                  p.id === id ? { ...p, status: 'in_progress' as const } : p
                ),
              }),
              false,
              'plan/startExecution',
            )
          }
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : String(error) },
            false,
            'plan/startExecutionError',
          )
        }
      },

      archive: async (id: string, targetPath: string) => {
        try {
          const response = await window.electronAPI.plan.archive(id, targetPath)
          if (response.success) {
            set(
              (state) => ({
                activePlans: state.activePlans.filter(p => p.id !== id),
              }),
              false,
              'plan/archive',
            )
          }
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : String(error) },
            false,
            'plan/archiveError',
          )
        }
      },

      abandon: async (id: string) => {
        try {
          const response = await window.electronAPI.plan.abandon(id)
          if (response.success) {
            set(
              (state) => ({
                activePlans: state.activePlans.filter(p => p.id !== id),
              }),
              false,
              'plan/abandon',
            )
          }
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : String(error) },
            false,
            'plan/abandonError',
          )
        }
      },

      followUp: async (id: string) => {
        const response = await window.electronAPI.plan.followUp(id)
        if (response.success && response.data) {
          return response.data
        }
        throw new Error((response.error as { message: string })?.message ?? 'Follow-up failed')
      },

      clearError: () => set({ error: null }, false, 'plan/clearError'),
    }),
    { name: 'PlanStore' },
  ),
)

function registerEventListeners(): void {
  if (unsubscribers.length > 0) return

  unsubscribers.push(
    window.electronAPI.plan.onPlanCreated((plan) => {
      usePlanStore.setState(
        (state) => ({ activePlans: [plan, ...state.activePlans] }),
        false,
        'plan/onPlanCreated',
      )
    }),
  )

  unsubscribers.push(
    window.electronAPI.plan.onPlanExecutionStarted((plan) => {
      usePlanStore.setState(
        (state) => ({
          activePlans: state.activePlans.map(p =>
            p.id === plan.id ? plan : p
          ),
        }),
        false,
        'plan/onPlanExecutionStarted',
      )
    }),
  )

  unsubscribers.push(
    window.electronAPI.plan.onStepsCompleted(({ planId }) => {
      const current = usePlanStore.getState().currentPlan
      if (current && current.metadata.id === planId) {
        void usePlanStore.getState().fetchPlan(planId)
      }
    }),
  )

  unsubscribers.push(
    window.electronAPI.plan.onPlanArchived((plan) => {
      usePlanStore.setState(
        (state) => ({
          activePlans: state.activePlans.filter(p => p.id !== plan.id),
        }),
        false,
        'plan/onPlanArchived',
      )
    }),
  )

  unsubscribers.push(
    window.electronAPI.plan.onPlanAbandoned((plan) => {
      usePlanStore.setState(
        (state) => ({
          activePlans: state.activePlans.filter(p => p.id !== plan.id),
        }),
        false,
        'plan/onPlanAbandoned',
      )
    }),
  )
}

registerEventListeners()

usePlanStore.getState().fetchActivePlans().catch(() => {})

export type { PlanStore, PlanState, PlanActions }
