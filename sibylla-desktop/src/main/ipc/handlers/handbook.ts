import type { HandbookService } from '../../services/handbook/handbook-service'
import { logger } from '../../utils/logger'
import { IPC_CHANNELS } from '../../../shared/types'

export function registerHandbookHandlers(
  ipcMainInstance: Electron.IpcMain,
  handbookService: HandbookService,
): () => void {
  ipcMainInstance.handle(
    IPC_CHANNELS.HANDBOOK_SEARCH,
    async (_event, query: string, options?: { limit?: number; language?: string }) => {
      try {
        return handbookService.search(query, options)
      } catch (error) {
        logger.error('handbook.ipc.search.error', {
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.HANDBOOK_GET_ENTRY,
    async (_event, id: string, language?: string) => {
      try {
        return handbookService.getEntry(id, language)
      } catch (error) {
        logger.error('handbook.ipc.getEntry.error', {
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.HANDBOOK_CLONE,
    async () => {
      try {
        return await handbookService.cloneToWorkspace()
      } catch (error) {
        logger.error('handbook.ipc.clone.error', {
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.HANDBOOK_CHECK_UPDATES,
    async () => {
      try {
        return handbookService.checkUpdates()
      } catch (error) {
        logger.error('handbook.ipc.checkUpdates.error', {
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  return () => {
    ipcMainInstance.removeHandler(IPC_CHANNELS.HANDBOOK_SEARCH)
    ipcMainInstance.removeHandler(IPC_CHANNELS.HANDBOOK_GET_ENTRY)
    ipcMainInstance.removeHandler(IPC_CHANNELS.HANDBOOK_CLONE)
    ipcMainInstance.removeHandler(IPC_CHANNELS.HANDBOOK_CHECK_UPDATES)
  }
}
