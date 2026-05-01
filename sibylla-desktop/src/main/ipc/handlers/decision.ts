import type { DecisionLogger } from '../../services/decision/decision-logger'
import type { SubAgentExecutor } from '../../services/sub-agent/SubAgentExecutor'
import type { CreateDecisionInput, DecisionListFilters } from '../../services/decision/types'
import { logger } from '../../utils/logger'
import { IPC_CHANNELS } from '../../../shared/types'

export function registerDecisionHandlers(
  ipcMainInstance: Electron.IpcMain,
  decisionLogger: DecisionLogger,
  subAgentExecutor: SubAgentExecutor | null,
): () => void {
  ipcMainInstance.handle(
    IPC_CHANNELS.DECISION_LIST,
    async (_event, filters?: DecisionListFilters) => {
      try {
        return await decisionLogger.list(filters)
      } catch (error) {
        logger.error('decision.ipc.error', {
          channel: 'decision:list',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.DECISION_GET,
    async (_event, decisionId: string) => {
      try {
        return await decisionLogger.get(decisionId)
      } catch (error) {
        logger.error('decision.ipc.error', {
          channel: 'decision:get',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.DECISION_CREATE,
    async (_event, input: CreateDecisionInput) => {
      try {
        return await decisionLogger.create(input)
      } catch (error) {
        logger.error('decision.ipc.error', {
          channel: 'decision:create',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.DECISION_UPDATE_OUTCOME,
    async (_event, decisionId: string, actualResult: string) => {
      try {
        await decisionLogger.updateOutcome(decisionId, actualResult)
      } catch (error) {
        logger.error('decision.ipc.error', {
          channel: 'decision:updateOutcome',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.DECISION_DETECT,
    async (_event, conversation: string) => {
      try {
        if (!subAgentExecutor) {
          throw new Error('Sub-agent executor not available')
        }
        const result = await subAgentExecutor.execute('decision-curator', {
          conversation,
        })
        return result
      } catch (error) {
        logger.error('decision.ipc.error', {
          channel: 'decision:detect',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  return () => {
    ipcMainInstance.removeHandler(IPC_CHANNELS.DECISION_LIST)
    ipcMainInstance.removeHandler(IPC_CHANNELS.DECISION_GET)
    ipcMainInstance.removeHandler(IPC_CHANNELS.DECISION_CREATE)
    ipcMainInstance.removeHandler(IPC_CHANNELS.DECISION_UPDATE_OUTCOME)
    ipcMainInstance.removeHandler(IPC_CHANNELS.DECISION_DETECT)
  }
}
