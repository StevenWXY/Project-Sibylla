import { BrowserWindow } from 'electron'
import type { FocusModeController } from '../../services/mode/focus-mode-controller'
import type { AppEventBus } from '../../services/event-bus'
import { logger } from '../../utils/logger'
import { IPC_CHANNELS } from '../../../shared/types'

export function registerFocusModeHandlers(
  ipcMainInstance: Electron.IpcMain,
  focusModeController: FocusModeController,
  eventBus: AppEventBus,
  mainWindowGetter: () => BrowserWindow | null,
): () => void {
  ipcMainInstance.handle(IPC_CHANNELS.FOCUS_TOGGLE, async (_event, { conversationId, focused }: { conversationId: string; focused: boolean }) => {
    try {
      focusModeController.setFocused(conversationId, focused)
    } catch (error) {
      logger.error('focus.ipc.error', {
        channel: 'focus:toggle',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })

  ipcMainInstance.handle(IPC_CHANNELS.FOCUS_SET_UNTIL, async (_event, { conversationId, until }: { conversationId: string; until: string }) => {
    try {
      focusModeController.setFocused(conversationId, true, until)
    } catch (error) {
      logger.error('focus.ipc.error', {
        channel: 'focus:setUntil',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })

  ipcMainInstance.handle(IPC_CHANNELS.FOCUS_GET_STATE, async (_event, { conversationId }: { conversationId: string }) => {
    try {
      return {
        focused: focusModeController.isFocused(conversationId),
        queueLength: focusModeController.getQueuePreview().length,
      }
    } catch (error) {
      logger.error('focus.ipc.error', {
        channel: 'focus:getState',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })

  ipcMainInstance.handle(IPC_CHANNELS.FOCUS_GET_QUEUE_PREVIEW, async () => {
    try {
      return focusModeController.getQueuePreview()
    } catch (error) {
      logger.error('focus.ipc.error', {
        channel: 'focus:getQueuePreview',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })

  const onModeChanged = (data: unknown) => {
    const win = mainWindowGetter()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.FOCUS_MODE_CHANGED, data)
    }
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && window !== win) {
        window.webContents.send(IPC_CHANNELS.FOCUS_MODE_CHANGED, data)
      }
    }
  }

  const unsubModeChanged = eventBus.subscribe('aiMode.focused-changed', onModeChanged)

  return () => {
    unsubModeChanged()
  }
}
