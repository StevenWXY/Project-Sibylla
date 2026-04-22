import type { PromptOptimizer } from '../../services/prompt-optimizer/prompt-optimizer'
import type { OptimizeRequest } from '../../services/prompt-optimizer/types'
import { logger } from '../../utils/logger'
import { IPC_CHANNELS } from '../../../shared/types'

const VALID_ACTIONS = new Set(['applied', 'merged', 'edited', 'ignored'])

export function registerPromptOptimizerHandlers(
  ipcMainInstance: Electron.IpcMain,
  promptOptimizer: PromptOptimizer,
): () => void {
  ipcMainInstance.handle(
    IPC_CHANNELS.PROMPT_OPTIMIZER_OPTIMIZE,
    async (_event, req: OptimizeRequest) => {
      try {
        return await promptOptimizer.optimize(req)
      } catch (error) {
        logger.error('promptOptimizer.ipc.error', {
          channel: 'promptOptimizer:optimize',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.PROMPT_OPTIMIZER_RECORD_ACTION,
    async (_event, requestId: string, action: string, suggestionId?: string) => {
      try {
        if (!VALID_ACTIONS.has(action)) {
          throw new Error(`Invalid action: ${action}`)
        }
        await promptOptimizer.recordUserAction(
          requestId,
          action as 'applied' | 'merged' | 'edited' | 'ignored',
          suggestionId,
        )
      } catch (error) {
        logger.error('promptOptimizer.ipc.error', {
          channel: 'promptOptimizer:recordAction',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  return () => {
    ipcMainInstance.removeHandler(IPC_CHANNELS.PROMPT_OPTIMIZER_OPTIMIZE)
    ipcMainInstance.removeHandler(IPC_CHANNELS.PROMPT_OPTIMIZER_RECORD_ACTION)
  }
}
