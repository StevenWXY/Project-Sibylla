import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface Notification {
  id: string
  type: string
  priority: string
  source: { provider: string; ref?: string }
  title: string
  body: string
  groupKey: string
  navigation?: Record<string, unknown>
  actions?: Array<{ label: string; action: string; payload?: unknown }>
  createdAt: number
  readAt?: number
  dismissedAt?: number
  stale: boolean
  metadata: Record<string, unknown>
}

interface NotificationPreferences {
  schemaVersion: 1
  mutedRules: Array<{ type: string; sourceProvider?: string; mutedAt: number }>
  scheduledFocus?: { enabled: boolean; startHour: number; endHour: number }
}

interface NotificationState {
  notifications: Notification[]
  isLoading: boolean
  unreadCount: number
  preferences: NotificationPreferences | null
  error: string | null
}

interface NotificationActions {
  fetchNotifications: (options?: { limit?: number; offset?: number }) => Promise<void>
  markRead: (id: string) => Promise<void>
  dismiss: (id: string) => Promise<void>
  navigate: (id: string) => Promise<void>
  fetchPreferences: () => Promise<void>
  updatePreferences: (updates: Record<string, unknown>) => Promise<void>
  addNotification: (notification: Notification) => void
  updateNotification: (id: string, updates: Partial<Notification>) => void
}

type NotificationStore = NotificationState & NotificationActions

const initialState: NotificationState = {
  notifications: [],
  isLoading: false,
  unreadCount: 0,
  preferences: null,
  error: null,
}

let createdUnsubscribe: (() => void) | null = null
let updatedUnsubscribe: (() => void) | null = null

export const useNotificationStore = create<NotificationStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      fetchNotifications: async (options?: { limit?: number; offset?: number }) => {
        set({ isLoading: true, error: null }, false, 'notifications/fetchStart')
        try {
          const response = await window.electronAPI.notifications.list(options)
          if (response.success && response.data) {
            set(
              {
                notifications: response.data as Notification[],
                isLoading: false,
                unreadCount: (response.data as Notification[]).filter(n => !n.readAt).length,
              },
              false,
              'notifications/fetchSuccess',
            )
          }

          if (!createdUnsubscribe) {
            createdUnsubscribe = window.electronAPI.notifications.onCreated((data) => {
              const notification = data as Notification
              set(
                (state) => ({
                  notifications: [notification, ...state.notifications],
                  unreadCount: state.unreadCount + 1,
                }),
                false,
                'notifications/onCreated',
              )
            })
          }

          if (!updatedUnsubscribe) {
            updatedUnsubscribe = window.electronAPI.notifications.onUpdated((data) => {
              const update = data as { notificationId: string }
              set(
                (state) => ({
                  notifications: state.notifications.map(n =>
                    n.id === update.notificationId ? { ...n, readAt: n.readAt ?? Date.now() } : n,
                  ),
                }),
                false,
                'notifications/onUpdated',
              )
            })
          }
        } catch (err) {
          set(
            { error: String(err), isLoading: false },
            false,
            'notifications/fetchError',
          )
        }
      },

      markRead: async (id: string) => {
        try {
          await window.electronAPI.notifications.markRead(id)
          set(
            (state) => ({
              notifications: state.notifications.map(n =>
                n.id === id ? { ...n, readAt: Date.now() } : n,
              ),
              unreadCount: Math.max(0, state.unreadCount - 1),
            }),
            false,
            'notifications/markRead',
          )
        } catch (err) {
          set({ error: String(err) }, false, 'notifications/markReadError')
        }
      },

      dismiss: async (id: string) => {
        try {
          await window.electronAPI.notifications.dismiss(id)
          set(
            (state) => ({
              notifications: state.notifications.map(n =>
                n.id === id ? { ...n, dismissedAt: Date.now() } : n,
              ),
            }),
            false,
            'notifications/dismiss',
          )
        } catch (err) {
          set({ error: String(err) }, false, 'notifications/dismissError')
        }
      },

      navigate: async (id: string) => {
        try {
          await window.electronAPI.notifications.navigate(id)
        } catch (err) {
          set({ error: String(err) }, false, 'notifications/navigateError')
        }
      },

      fetchPreferences: async () => {
        try {
          const response = await window.electronAPI.notifications.getPreferences()
          if (response.success && response.data) {
            set(
              { preferences: response.data as NotificationPreferences },
              false,
              'notifications/fetchPrefs',
            )
          }
        } catch (err) {
          set({ error: String(err) }, false, 'notifications/fetchPrefsError')
        }
      },

      updatePreferences: async (updates: Record<string, unknown>) => {
        try {
          await window.electronAPI.notifications.updatePreferences(updates)
          await get().fetchPreferences()
        } catch (err) {
          set({ error: String(err) }, false, 'notifications/updatePrefsError')
        }
      },

      addNotification: (notification: Notification) => {
        set(
          (state) => ({
            notifications: [notification, ...state.notifications],
            unreadCount: state.unreadCount + 1,
          }),
          false,
          'notifications/add',
        )
      },

      updateNotification: (id: string, updates: Partial<Notification>) => {
        set(
          (state) => ({
            notifications: state.notifications.map(n =>
              n.id === id ? { ...n, ...updates } : n,
            ),
          }),
          false,
          'notifications/update',
        )
      },
    }),
    { name: 'NotificationStore' },
  ),
)

export type { NotificationStore, Notification, NotificationPreferences }
