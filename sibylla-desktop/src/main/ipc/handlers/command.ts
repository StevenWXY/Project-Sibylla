import type { CommandRegistry } from '../../services/command/command-registry'
import type { SlashCommandParser } from '../../services/command/SlashCommandParser'
import { logger } from '../../utils/logger'
import { IPC_CHANNELS } from '../../../shared/types'
import type { SlashCommandTemplate, CommandSuggestion } from '../../../shared/types'

export function registerCommandHandlers(
  ipcMainInstance: Electron.IpcMain,
  commandRegistry: CommandRegistry,
  slashParser?: SlashCommandParser,
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
          isSlashCommand: cmd.isSlashCommand,
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

  ipcMainInstance.handle(
    IPC_CHANNELS.COMMAND_PARSE_SLASH,
    async (_event, input: string) => {
      try {
        if (!slashParser) return null
        return slashParser.parse(input)
      } catch (error) {
        logger.error('command.ipc.error', {
          channel: 'command:parse-slash',
          error: error instanceof Error ? error.message : String(error),
        })
        return null
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.COMMAND_CREATE_SLASH,
    async (_event, template: SlashCommandTemplate) => {
      try {
        return { commandId: template.id }
      } catch (error) {
        logger.error('command.ipc.error', {
          channel: 'command:create-slash',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.COMMAND_GET_SUGGESTIONS,
    async (_event, partial: string): Promise<CommandSuggestion[]> => {
      try {
        if (!slashParser) return []
        return slashParser.getSuggestions(partial)
      } catch (error) {
        logger.error('command.ipc.error', {
          channel: 'command:get-suggestions',
          error: error instanceof Error ? error.message : String(error),
        })
        return []
      }
    },
  )

  return () => {
    ipcMainInstance.removeHandler(IPC_CHANNELS.COMMAND_SEARCH)
    ipcMainInstance.removeHandler(IPC_CHANNELS.COMMAND_EXECUTE)
    ipcMainInstance.removeHandler(IPC_CHANNELS.COMMAND_PARSE_SLASH)
    ipcMainInstance.removeHandler(IPC_CHANNELS.COMMAND_CREATE_SLASH)
    ipcMainInstance.removeHandler(IPC_CHANNELS.COMMAND_GET_SUGGESTIONS)
  }
}
