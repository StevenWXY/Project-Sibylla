import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface KanbanTask {
  id: string
  title: string
  status: '待开始' | '进行中' | '已完成'
  assignee?: string
  priority?: 'P0' | 'P1' | 'P2'
  deadline?: string
  relatedFiles?: string[]
  isAiLinked: boolean
  isAiSuggested: boolean
  completedAt?: string
}

interface KanbanModel {
  tasks: KanbanTask[]
  columns: Record<'待开始' | '进行中' | '已完成', KanbanTask[]>
  parseError?: boolean
}

interface CreateTaskInput {
  title: string
  assignee?: string
  priority?: 'P0' | 'P1' | 'P2'
  deadline?: string
  relatedFiles?: string[]
  status?: '待开始' | '进行中' | '已完成'
  isAiSuggested?: boolean
}

interface KanbanState {
  model: KanbanModel | null
  isLoading: boolean
  parseError: boolean
  selectedTaskId: string | null
  selectedColumn: KanbanTask['status'] | null
  aiSidebarOpen: boolean
  error: string | null
}

interface KanbanActions {
  fetchBoard: () => Promise<void>
  createTask: (input: CreateTaskInput) => Promise<void>
  updateStatus: (taskId: string, status: '待开始' | '进行中' | '已完成') => Promise<void>
  dispatchToAI: (taskId: string) => Promise<void>
  promoteFromLedger: (ledgerTaskId: string) => Promise<void>
  selectTask: (taskId: string | null) => void
  setSelectedColumn: (column: KanbanTask['status'] | null) => void
  toggleAiSidebar: () => void
  acceptSuggestion: (taskId: string, suggestedStatus: '待开始' | '进行中' | '已完成') => Promise<void>
  dismissSuggestion: (taskId: string, suggestedStatus: '待开始' | '进行中' | '已完成') => Promise<void>
  reset: () => void
}

type KanbanStore = KanbanState & KanbanActions

const initialState: KanbanState = {
  model: null,
  isLoading: false,
  parseError: false,
  selectedTaskId: null,
  selectedColumn: null,
  aiSidebarOpen: false,
  error: null,
}

let pushUnsubscribe: (() => void) | null = null

export const useKanbanStore = create<KanbanStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      fetchBoard: async () => {
        set({ isLoading: true, error: null }, false, 'kanban/fetchStart')
        try {
          const response = await window.electronAPI.kanban.parse()
          if (response.success && response.data) {
            const model = response.data as KanbanModel
            set(
              {
                model,
                isLoading: false,
                parseError: model.parseError ?? false,
              },
              false,
              'kanban/fetchSuccess',
            )
          } else {
            set(
              { isLoading: false, error: response.error?.message ?? 'Failed to fetch board' },
              false,
              'kanban/fetchError',
            )
          }

          if (!pushUnsubscribe) {
            pushUnsubscribe = window.electronAPI.kanban.onStatusChanged(() => {
              get().fetchBoard()
            })
          }
        } catch (err) {
          set(
            { error: String(err), isLoading: false },
            false,
            'kanban/fetchError',
          )
        }
      },

      createTask: async (input: CreateTaskInput) => {
        try {
          const response = await window.electronAPI.kanban.create(input as unknown as Record<string, unknown>)
          if (response.success) {
            await get().fetchBoard()
          }
        } catch (err) {
          set({ error: String(err) }, false, 'kanban/createError')
        }
      },

      updateStatus: async (taskId: string, status: '待开始' | '进行中' | '已完成') => {
        try {
          const response = await window.electronAPI.kanban.updateStatus(taskId, status)
          if (response.success) {
            await get().fetchBoard()
          }
        } catch (err) {
          set({ error: String(err) }, false, 'kanban/updateError')
        }
      },

      dispatchToAI: async (taskId: string) => {
        try {
          const response = await window.electronAPI.kanban.dispatchAI(taskId)
          if (response.success) {
            await get().fetchBoard()
          }
        } catch (err) {
          set({ error: String(err) }, false, 'kanban/dispatchError')
        }
      },

      promoteFromLedger: async (ledgerTaskId: string) => {
        try {
          const response = await window.electronAPI.kanban.promote(ledgerTaskId)
          if (response.success) {
            await get().fetchBoard()
          }
        } catch (err) {
          set({ error: String(err) }, false, 'kanban/promoteError')
        }
      },

      selectTask: (taskId: string | null) => {
        set({ selectedTaskId: taskId }, false, 'kanban/selectTask')
      },

      setSelectedColumn: (column: KanbanTask['status'] | null) => {
        set({ selectedColumn: column }, false, 'kanban/selectColumn')
      },

      toggleAiSidebar: () => {
        set((state) => ({ aiSidebarOpen: !state.aiSidebarOpen }), false, 'kanban/toggleAiSidebar')
      },

      acceptSuggestion: async (taskId: string, suggestedStatus: '待开始' | '进行中' | '已完成') => {
        try {
          await window.electronAPI.kanban.acceptSuggestion(taskId, suggestedStatus)
          await get().fetchBoard()
        } catch (err) {
          set({ error: String(err) }, false, 'kanban/acceptError')
        }
      },

      dismissSuggestion: async (taskId: string, suggestedStatus: '待开始' | '进行中' | '已完成') => {
        try {
          await window.electronAPI.kanban.dismissSuggestion(taskId, suggestedStatus)
        } catch (err) {
          set({ error: String(err) }, false, 'kanban/dismissError')
        }
      },

      reset: () => {
        if (pushUnsubscribe) {
          pushUnsubscribe()
          pushUnsubscribe = null
        }
        set(initialState, false, 'kanban/reset')
      },
    }),
    { name: 'KanbanStore' },
  ),
)

export type { KanbanStore, KanbanState, KanbanTask, KanbanModel, CreateTaskInput }
