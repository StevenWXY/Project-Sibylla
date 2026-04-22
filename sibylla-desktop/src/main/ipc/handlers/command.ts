import type { CommandRegistry } from '../../services/command/command-registry'
import { logger } from '../../utils/logger'
import { IPC_CHANNELS } from '../../../shared/types'

export function registerCommandHandlers(
  ipcMainInstance: Electron.IpcMain,
  commandRegistry: CommandRegistry,
): () => void {
  ipcMainInstance.handle(
    IPC_CHANNELS.COMMAND_SEARCH,
    async (_event, query: string, language?: string) => {
      try {
        const commands = await commandRegistry.search(query, language)
        return commands.map(cmd => ({
          id: cmd.id,
          title: cmd.title,
          titleI18n: cmd.titleI18n,
          category: cmd.category,
          keywords: cmd.keywords,
          shortcut: cmd.shortcut,
          icon: cmd.icon,
          requiresConfirmation: cmd.requiresConfirmation,
        }))
      } catch (error) {
        logger.error('command.ipc.error', {
          channel: 'command:search',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.COMMAND_EXECUTE,
    async (_event, id: string) => {
      try {
        await commandRegistry.execute(id)
      } catch (error) {
        logger.error('command.ipc.error', {
          channel: 'command:execute',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  return () => {
    ipcMainInstance.removeHandler(IPC_CHANNELS.COMMAND_SEARCH)
    ipcMainInstance.removeHandler(IPC_CHANNELS.COMMAND_EXECUTE)
  }
}
