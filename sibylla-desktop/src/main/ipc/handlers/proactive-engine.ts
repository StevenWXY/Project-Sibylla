import { BrowserWindow } from 'electron'
import type { ProactiveEngine } from '../../services/proactive-engine'
import type { EditorSnapshot, ProactiveConfig } from '../../services/proactive-engine/types'
import { IPC_CHANNELS } from '../../../shared/types'
import { logger } from '../../utils/logger'

export function registerProactiveEngineHandlers(
  ipcMainInstance: Electron.IpcMain,
  engine: ProactiveEngine,
  _mainWindowGetter: () => BrowserWindow | null,
): () => void {
  ipcMainInstance.on(
    IPC_CHANNELS.PROACTIVE_EDITOR_SNAPSHOT,
    (_event, { snapshot }: { snapshot: EditorSnapshot }) => {
      try {
        engine.onSnapshot(snapshot)
      } catch (error) {
        logger.error('proactive.ipc.snapshotError', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.PROACTIVE_GET_CONFIG,
    async () => {
      try {
        return engine.getConfig()
      } catch (error) {
        logger.error('proactive.ipc.error', {
          channel: 'proactive:getConfig',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.PROACTIVE_UPDATE_CONFIG,
    async (_event, { updates }: { updates: Partial<ProactiveConfig> }) => {
      try {
        engine.updateConfig(updates)
      } catch (error) {
        logger.error('proactive.ipc.error', {
          channel: 'proactive:updateConfig',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.PROACTIVE_DISMISS_SUGGESTION,
    async (_event, { suggestionId, dwellMs }: { suggestionId: string; dwellMs: number }) => {
      try {
        engine.recordSuggestionOutcome(suggestionId, 'dismissed', dwellMs)
      } catch (error) {
        logger.error('proactive.ipc.error', {
          channel: 'proactive:dismissSuggestion',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.PROACTIVE_ACCEPT_SUGGESTION,
    async (_event, { suggestionId, dwellMs }: { suggestionId: string; dwellMs: number }) => {
      try {
        engine.recordSuggestionOutcome(suggestionId, 'accepted', dwellMs)
      } catch (error) {
        logger.error('proactive.ipc.error', {
          channel: 'proactive:acceptSuggestion',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  return () => {
    ipcMainInstance.removeHandler(IPC_CHANNELS.PROACTIVE_GET_CONFIG)
    ipcMainInstance.removeHandler(IPC_CHANNELS.PROACTIVE_UPDATE_CONFIG)
    ipcMainInstance.removeHandler(IPC_CHANNELS.PROACTIVE_DISMISS_SUGGESTION)
    ipcMainInstance.removeHandler(IPC_CHANNELS.PROACTIVE_ACCEPT_SUGGESTION)
  }
}
