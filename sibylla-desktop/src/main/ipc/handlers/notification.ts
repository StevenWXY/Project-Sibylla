import { BrowserWindow } from 'electron'
import type { NotificationEngine } from '../../services/notifications/notification-engine'
import type { NotificationStore } from '../../services/notifications/notification-store'
import type { PreferenceLearner } from '../../services/notifications/preference-learner'
import type { AppEventBus } from '../../services/event-bus'
import type { NotificationPreferences, MutedRule, ScheduledFocusConfig } from '../../services/notifications/types'
import { logger } from '../../utils/logger'
import { IPC_CHANNELS } from '../../../shared/types'

export function registerNotificationHandlers(
  ipcMainInstance: Electron.IpcMain,
  engine: NotificationEngine,
  store: NotificationStore,
  preferenceLearner: PreferenceLearner,
  eventBus: AppEventBus,
  mainWindowGetter: () => BrowserWindow | null,
): () => void {
  ipcMainInstance.handle(IPC_CHANNELS.NOTIFICATION_LIST, async (_event, options?: { limit?: number; offset?: number }) => {
    try {
      return store.getUnread(options)
    } catch (error) {
      logger.error('notification.ipc.error', {
        channel: 'notification:list',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })

  ipcMainInstance.handle(IPC_CHANNELS.NOTIFICATION_MARK_READ, async (_event, { id }: { id: string }) => {
    try {
      engine.recordAction(id, 'click')
    } catch (error) {
      logger.error('notification.ipc.error', {
        channel: 'notification:markRead',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })

  ipcMainInstance.handle(IPC_CHANNELS.NOTIFICATION_DISMISS, async (_event, { id }: { id: string }) => {
    try {
      engine.recordAction(id, 'dismiss')
    } catch (error) {
      logger.error('notification.ipc.error', {
        channel: 'notification:dismiss',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })

  ipcMainInstance.handle(IPC_CHANNELS.NOTIFICATION_NAVIGATE, async (_event, { id }: { id: string }) => {
    try {
      engine.navigate(id)
    } catch (error) {
      logger.error('notification.ipc.error', {
        channel: 'notification:navigate',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })

  ipcMainInstance.handle(IPC_CHANNELS.NOTIFICATION_GET_PREFS, async () => {
    try {
      return preferenceLearner.getPreferences() as NotificationPreferences
    } catch (error) {
      logger.error('notification.ipc.error', {
        channel: 'notification:getPreferences',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })

  ipcMainInstance.handle(IPC_CHANNELS.NOTIFICATION_UPDATE_PREFS, async (
    _event,
    updates: { mutedRules?: MutedRule[]; scheduledFocus?: ScheduledFocusConfig },
  ) => {
    try {
      preferenceLearner.updatePreferences(updates)
    } catch (error) {
      logger.error('notification.ipc.error', {
        channel: 'notification:updatePreferences',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })

  const onCreated = (data: unknown) => {
    const win = mainWindowGetter()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.NOTIFICATION_CREATED, data)
    }
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && window !== win) {
        window.webContents.send(IPC_CHANNELS.NOTIFICATION_CREATED, data)
      }
    }
  }

  const onUpdated = (data: unknown) => {
    const win = mainWindowGetter()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.NOTIFICATION_UPDATED, data)
    }
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && window !== win) {
        window.webContents.send(IPC_CHANNELS.NOTIFICATION_UPDATED, data)
      }
    }
  }

  const unsubCreated = eventBus.subscribe('notification.created', onCreated)
  const unsubClicked = eventBus.subscribe('notification.clicked', onUpdated)
  const unsubDismissed = eventBus.subscribe('notification.dismissed', onUpdated)

  return () => {
    unsubCreated()
    unsubClicked()
    unsubDismissed()
  }
}
