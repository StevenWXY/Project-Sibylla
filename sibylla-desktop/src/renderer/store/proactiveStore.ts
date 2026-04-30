import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface Suggestion {
  id: string
  triggerId: string
  title: string
  body: string
  acceptAction: { command: string; args: Record<string, unknown> }
  declineAction: 'dismiss' | 'snooze-1h' | 'never'
  priority: 'urgent' | 'normal'
  createdAt: number
}

interface ProactiveState {
  currentSuggestion: Suggestion | null
  pendingQueue: Suggestion[]
  config: Record<string, unknown> | null
  _shownAt: number | null
}

interface ProactiveActions {
  pushSuggestion: (suggestion: Suggestion) => void
  dismissCurrent: () => void
  acceptCurrent: () => void
  timeoutCurrent: () => void
  fetchConfig: () => Promise<void>
  updateConfig: (updates: Record<string, unknown>) => Promise<void>
  _popNext: () => void
}

type ProactiveStore = ProactiveState & ProactiveActions

const initialState: ProactiveState = {
  currentSuggestion: null,
  pendingQueue: [],
  config: null,
  _shownAt: null,
}

let suggestionUnsubscribe: (() => void) | null = null

export const useProactiveStore = create<ProactiveStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      pushSuggestion: (suggestion: Suggestion) => {
        const { currentSuggestion } = get()
        if (currentSuggestion === null) {
          set(
            { currentSuggestion: suggestion, _shownAt: Date.now() },
            false,
            'proactive/pushSuggestion',
          )
        } else {
          set(
            (state) => ({ pendingQueue: [...state.pendingQueue, suggestion] }),
            false,
            'proactive/queueSuggestion',
          )
        }
      },

      dismissCurrent: () => {
        const { currentSuggestion, _shownAt } = get()
        if (!currentSuggestion || !_shownAt) return
        const dwellMs = Date.now() - _shownAt
        window.electronAPI.proactive
          .dismissSuggestion(currentSuggestion.id, dwellMs)
          .catch(() => {})
        get()._popNext()
      },

      acceptCurrent: () => {
        const { currentSuggestion, _shownAt } = get()
        if (!currentSuggestion || !_shownAt) return
        const dwellMs = Date.now() - _shownAt
        window.electronAPI.proactive
          .acceptSuggestion(currentSuggestion.id, dwellMs)
          .catch(() => {})
        get()._popNext()
      },

      timeoutCurrent: () => {
        get()._popNext()
      },

      fetchConfig: async () => {
        try {
          const response = await window.electronAPI.proactive.getConfig()
          if (response.success && response.data) {
            set({ config: response.data as Record<string, unknown> }, false, 'proactive/fetchConfig')
          }
        } catch {
          // silent
        }
      },

      updateConfig: async (updates: Record<string, unknown>) => {
        try {
          await window.electronAPI.proactive.updateConfig(updates)
          set(
            (state) => ({
              config: state.config ? { ...state.config, ...updates } : updates,
            }),
            false,
            'proactive/updateConfig',
          )
        } catch {
          // silent
        }
      },

      _popNext: () => {
        set(
          (state) => {
            const [next, ...rest] = state.pendingQueue
            return {
              currentSuggestion: next ?? null,
              pendingQueue: rest,
              _shownAt: next ? Date.now() : null,
            }
          },
          false,
          'proactive/popNext',
        )
      },
    }),
    { name: 'ProactiveStore' },
  ),
)

export function initProactiveListener(): () => void {
  if (suggestionUnsubscribe) return suggestionUnsubscribe

  suggestionUnsubscribe = window.electronAPI.proactive.onSuggestionShown(
    (suggestion) => {
      useProactiveStore.getState().pushSuggestion(suggestion as Suggestion)
    },
  )

  return suggestionUnsubscribe
}

export type { ProactiveStore, ProactiveState, ProactiveActions, Suggestion }
