import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface NotificationDraft {
  type: string
  priority: string
  source: { provider: string; ref?: string }
  title: string
  body: string
  groupKey: string
  navigation?: Record<string, unknown>
  metadata: Record<string, unknown>
}

interface FocusStateType {
  isFocused: boolean
  focusUntil: string | null
  queueLength: number
  queuePreview: NotificationDraft[]
  summary: string | null
  error: string | null
}

interface FocusActions {
  toggle: (conversationId: string, focused: boolean) => Promise<void>
  setUntil: (conversationId: string, until: string) => Promise<void>
  fetchState: (conversationId: string) => Promise<void>
  fetchQueuePreview: () => Promise<void>
  setSummary: (summary: string) => void
}

type FocusStore = FocusStateType & FocusActions

const initialState: FocusStateType = {
  isFocused: false,
  focusUntil: null,
  queueLength: 0,
  queuePreview: [],
  summary: null,
  error: null,
}

let modeChangedUnsubscribe: (() => void) | null = null
let summaryReadyUnsubscribe: (() => void) | null = null

export const useFocusStore = create<FocusStore>()(
  devtools(
    (set, _get) => ({
      ...initialState,

      toggle: async (conversationId: string, focused: boolean) => {
        try {
          await window.electronAPI.focusMode.toggle(conversationId, focused)
          set({ isFocused: focused, error: null }, false, 'focus/toggle')
        } catch (err) {
          set({ error: String(err) }, false, 'focus/toggleError')
        }
      },

      setUntil: async (conversationId: string, until: string) => {
        try {
          await window.electronAPI.focusMode.setUntil(conversationId, until)
          set({ isFocused: true, focusUntil: until, error: null }, false, 'focus/setUntil')
        } catch (err) {
          set({ error: String(err) }, false, 'focus/setUntilError')
        }
      },

      fetchState: async (conversationId: string) => {
        try {
          const response = await window.electronAPI.focusMode.getState(conversationId)
          if (response.success && response.data) {
            set(
              {
                isFocused: response.data.focused,
                focusUntil: response.data.focusUntil ?? null,
                queueLength: response.data.queueLength,
              },
              false,
              'focus/fetchState',
            )
          }

          if (!modeChangedUnsubscribe) {
            modeChangedUnsubscribe = window.electronAPI.focusMode.onModeChanged((data) => {
              const event = data as { focused: boolean; focusUntil?: string }
              set(
                {
                  isFocused: event.focused,
                  focusUntil: event.focusUntil ?? null,
                },
                false,
                'focus/onModeChanged',
              )
            })
          }

          if (!summaryReadyUnsubscribe) {
            summaryReadyUnsubscribe = window.electronAPI.focusMode.onSummaryReady((data) => {
              const event = data as { summary: string }
              set(
                { summary: event.summary },
                false,
                'focus/onSummaryReady',
              )
            })
          }
        } catch (err) {
          set({ error: String(err) }, false, 'focus/fetchStateError')
        }
      },

      fetchQueuePreview: async () => {
        try {
          const response = await window.electronAPI.focusMode.getQueuePreview()
          if (response.success && response.data) {
            set(
              { queuePreview: response.data as NotificationDraft[] },
              false,
              'focus/fetchQueuePreview',
            )
          }
        } catch (err) {
          set({ error: String(err) }, false, 'focus/fetchQueuePreviewError')
        }
      },

      setSummary: (summary: string) => {
        set({ summary }, false, 'focus/setSummary')
      },
    }),
    { name: 'FocusStore' },
  ),
)

export type { FocusStore, NotificationDraft }
