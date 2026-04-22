import { BrowserWindow } from 'electron'
import type { AiModeRegistry } from '../../services/mode/ai-mode-registry'
import type { AppEventBus } from '../../services/event-bus'
import { logger } from '../../utils/logger'
import { IPC_CHANNELS } from '../../../shared/types'

export function registerAiModeHandlers(
  ipcMainInstance: Electron.IpcMain,
  aiModeRegistry: AiModeRegistry,
  eventBus: AppEventBus,
  mainWindowGetter: () => BrowserWindow | null,
): () => void {
  ipcMainInstance.handle(IPC_CHANNELS.AI_MODE_GET_ALL, async () => {
    try {
      return aiModeRegistry.getAll()
    } catch (error) {
      logger.error('aiMode.ipc.error', {
        channel: 'aiMode:getAll',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })

  ipcMainInstance.handle(IPC_CHANNELS.AI_MODE_GET_ACTIVE, async (_event, conversationId: string) => {
    try {
      return aiModeRegistry.getActiveMode(conversationId)
    } catch (error) {
      logger.error('aiMode.ipc.error', {
        channel: 'aiMode:getActive',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })

  ipcMainInstance.handle(IPC_CHANNELS.AI_MODE_SWITCH, async (_event, conversationId: string, aiModeId: string) => {
    try {
      await aiModeRegistry.switchMode(conversationId, aiModeId, 'user')
    } catch (error) {
      logger.error('aiMode.ipc.error', {
        channel: 'aiMode:switch',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })

  const handler = (data: unknown) => {
    const win = mainWindowGetter()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.AI_MODE_CHANGED, data)
    }
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && window !== win) {
        window.webContents.send(IPC_CHANNELS.AI_MODE_CHANGED, data)
      }
    }
  }
  eventBus.on('aiMode:changed', handler)

  return () => {
    eventBus.removeListener('aiMode:changed', handler)
  }
}
