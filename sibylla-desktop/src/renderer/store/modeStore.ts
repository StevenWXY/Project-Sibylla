import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { AiModeDefinitionShared } from '../../shared/types'

interface ModeState {
  modes: AiModeDefinitionShared[]
  activeModes: Record<string, AiModeDefinitionShared>
  currentConversationId: string | null
  loading: boolean
  error: string | null
}

interface ModeActions {
  fetchModes: () => Promise<void>
  fetchActiveMode: (conversationId: string) => Promise<void>
  switchMode: (conversationId: string, aiModeId: string) => Promise<void>
  setCurrentConversation: (conversationId: string) => void
  getActiveMode: () => AiModeDefinitionShared | null
}

type ModeStore = ModeState & ModeActions

const initialState: ModeState = {
  modes: [],
  activeModes: {},
  currentConversationId: null,
  loading: false,
  error: null,
}

let modeChangedUnsubscribe: (() => void) | null = null

export const useModeStore = create<ModeStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      fetchModes: async () => {
        set({ loading: true, error: null }, false, 'mode/fetchModesStart')
        try {
          const response = await window.electronAPI.aiMode.getAll()
          if (response.success && response.data) {
            set({ modes: response.data, loading: false }, false, 'mode/fetchModesSuccess')

            if (!modeChangedUnsubscribe) {
              modeChangedUnsubscribe = window.electronAPI.aiMode.onModeChanged(
                (event) => {
                  const { modes } = get()
                  const modeDef = modes.find(m => m.id === event.to)
                  if (modeDef) {
                    set(
                      (state) => ({
                        activeModes: { ...state.activeModes, [event.conversationId]: modeDef },
                      }),
                      false,
                      'mode/onModeChanged'
                    )
                  }
                },
              )
            }
          } else {
            set(
              { error: (response.error as { message: string })?.message ?? 'Failed to fetch modes', loading: false },
              false,
              'mode/fetchModesError',
            )
          }
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : String(error), loading: false },
            false,
            'mode/fetchModesError',
          )
        }
      },

      fetchActiveMode: async (conversationId: string) => {
        try {
          const response = await window.electronAPI.aiMode.getActive(conversationId)
          if (response.success && response.data) {
            set(
              (state) => ({
                activeModes: { ...state.activeModes, [conversationId]: response.data! },
              }),
              false,
              'mode/fetchActiveMode',
            )
          }
        } catch {
          // silent — fallback to free mode
        }
      },

      switchMode: async (conversationId: string, aiModeId: string) => {
        try {
          await window.electronAPI.aiMode.switchMode(conversationId, aiModeId)
        } catch (error) {
          set(
            { error: error instanceof Error ? error.message : String(error) },
            false,
            'mode/switchError',
          )
        }
      },

      setCurrentConversation: (conversationId: string) => {
        set({ currentConversationId: conversationId }, false, 'mode/setCurrentConversation')
        const { activeModes } = get()
        if (!activeModes[conversationId]) {
          get().fetchActiveMode(conversationId)
        }
      },

      getActiveMode: () => {
        const { activeModes, currentConversationId } = get()
        if (!currentConversationId) return null
        return activeModes[currentConversationId] ?? null
      },
    }),
    { name: 'ModeStore' },
  ),
)

export type { ModeStore, ModeState, ModeActions }
