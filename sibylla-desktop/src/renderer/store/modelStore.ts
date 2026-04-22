import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { ConfiguredModelShared } from '../../shared/types'

interface ModelState {
  models: ConfiguredModelShared[]
  currentModelId: string | null
  loading: boolean
  error: string | null
}

interface ModelActions {
  fetchModels: () => Promise<void>
  fetchCurrent: (conversationId: string) => Promise<void>
  switchModel: (conversationId: string, modelId: string) => Promise<void>
  reset: () => void
}

type ModelStore = ModelState & ModelActions

const initialState: ModelState = {
  models: [],
  currentModelId: null,
  loading: false,
  error: null,
}

export const useModelStore = create<ModelStore>()(
  devtools(
    (set, _get) => ({
      ...initialState,

      fetchModels: async () => {
        set({ loading: true, error: null }, false, 'model/fetchModelsStart')
        try {
          const resp = await window.electronAPI.model.getAvailable()
          if (resp.success && resp.data) {
            set({ models: resp.data, loading: false }, false, 'model/fetchModelsSuccess')
          } else {
            set({ loading: false, error: resp.error?.message ?? 'Failed to fetch models' }, false, 'model/fetchModelsError')
          }
        } catch (err) {
          set({ loading: false, error: String(err) }, false, 'model/fetchModelsError')
        }
      },

      fetchCurrent: async (conversationId: string) => {
        try {
          const resp = await window.electronAPI.model.getCurrent(conversationId)
          if (resp.success && resp.data) {
            set({ currentModelId: resp.data }, false, 'model/fetchCurrentSuccess')
          }
        } catch {
          // ignore
        }
      },

      switchModel: async (conversationId: string, modelId: string) => {
        try {
          const resp = await window.electronAPI.model.switchModel(conversationId, modelId)
          if (resp.success) {
            set({ currentModelId: modelId }, false, 'model/switchSuccess')
          }
        } catch {
          // ignore
        }
      },

      reset: () => set(initialState, false, 'model/reset'),
    }),
    { name: 'ModelStore' },
  ),
)
