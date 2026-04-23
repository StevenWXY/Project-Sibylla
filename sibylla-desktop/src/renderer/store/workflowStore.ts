import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type {
  WorkflowDefinition,
  WorkflowRunSummary,
  WorkflowRun,
  WorkflowConfirmationRequest,
  RunFilter,
} from '../../../shared/types'

interface WorkflowState {
  workflows: WorkflowDefinition[]
  runs: WorkflowRunSummary[]
  selectedWorkflowId: string | null
  loading: boolean
  error: string | null
  confirmationRequest: WorkflowConfirmationRequest | null
}

interface WorkflowActions {
  fetchWorkflows: () => Promise<void>
  triggerManual: (workflowId: string, params: Record<string, unknown>) => Promise<string>
  fetchRuns: (filter?: RunFilter) => Promise<void>
  getRun: (runId: string) => Promise<WorkflowRun | null>
  cancelRun: (runId: string) => Promise<void>
  confirmStep: (runId: string, decision: 'confirm' | 'skip' | 'cancel') => Promise<void>
  selectWorkflow: (id: string | null) => void
  setConfirmationRequest: (request: WorkflowConfirmationRequest | null) => void
  reset: () => void
}

type WorkflowStore = WorkflowState & WorkflowActions

const initialState: WorkflowState = {
  workflows: [],
  runs: [],
  selectedWorkflowId: null,
  loading: false,
  error: null,
  confirmationRequest: null,
}

const cleanupFns: Array<() => void> = []

export const useWorkflowStore = create<WorkflowStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      fetchWorkflows: async () => {
        set({ loading: true, error: null }, false, 'workflow/fetchStart')
        try {
          const result = await window.electronAPI.safeInvoke('workflow:list')
          if (result.success && result.data) {
            set({ workflows: result.data as WorkflowDefinition[], loading: false }, false, 'workflow/fetchSuccess')
          } else {
            set({ error: result.error?.message ?? '获取 Workflow 列表失败', loading: false }, false, 'workflow/fetchError')
          }
        } catch (err) {
          set({ error: err instanceof Error ? err.message : '获取 Workflow 列表失败', loading: false }, false, 'workflow/fetchError')
        }
      },

      triggerManual: async (workflowId, params) => {
        try {
          const result = await window.electronAPI.safeInvoke('workflow:trigger-manual', workflowId, params)
          if (result.success && result.data) {
            get().fetchRuns()
            return (result.data as { runId: string }).runId
          }
          throw new Error(result.error?.message ?? '触发 Workflow 失败')
        } catch (err) {
          set({ error: err instanceof Error ? err.message : '触发 Workflow 失败' }, false, 'workflow/triggerError')
          throw err
        }
      },

      fetchRuns: async (filter?: RunFilter) => {
        try {
          const result = await window.electronAPI.safeInvoke('workflow:list-runs', filter)
          if (result.success && result.data) {
            set({ runs: result.data as WorkflowRunSummary[] }, false, 'workflow/fetchRunsSuccess')
          }
        } catch {
          // silently handle
        }
      },

      getRun: async (runId: string) => {
        try {
          const result = await window.electronAPI.safeInvoke('workflow:get-run', runId)
          if (result.success && result.data) {
            return result.data as WorkflowRun
          }
          return null
        } catch {
          return null
        }
      },

      cancelRun: async (runId: string) => {
        try {
          await window.electronAPI.safeInvoke('workflow:cancel-run', runId)
          get().fetchRuns()
        } catch (err) {
          set({ error: err instanceof Error ? err.message : '取消 Workflow 失败' }, false, 'workflow/cancelError')
        }
      },

      confirmStep: async (runId: string, decision: 'confirm' | 'skip' | 'cancel') => {
        try {
          await window.electronAPI.safeInvoke('workflow:confirm-step', runId, decision)
          set({ confirmationRequest: null }, false, 'workflow/confirmStep')
          get().fetchRuns()
        } catch (err) {
          set({ error: err instanceof Error ? err.message : '确认步骤失败' }, false, 'workflow/confirmError')
        }
      },

      selectWorkflow: (id) => {
        set({ selectedWorkflowId: id }, false, 'workflow/select')
      },

      setConfirmationRequest: (request) => {
        set({ confirmationRequest: request }, false, 'workflow/setConfirmation')
      },

      reset: () => {
        for (const cleanup of cleanupFns) {
          cleanup()
        }
        cleanupFns.length = 0
        set(initialState, false, 'workflow/reset')
      },
    }),
    { name: 'WorkflowStore' },
  ),
)

export const selectWorkflows = (state: WorkflowStore) => state.workflows
export const selectSelectedWorkflowId = (state: WorkflowStore) => state.selectedWorkflowId
export const selectRuns = (state: WorkflowStore) => state.runs
export const selectLoading = (state: WorkflowStore) => state.loading
export const selectError = (state: WorkflowStore) => state.error
export const selectConfirmationRequest = (state: WorkflowStore) => state.confirmationRequest
