import type { KanbanService } from '../../services/kanban/kanban-service'
import type { TaskStatusTracker } from '../../services/kanban/task-status-tracker'
import type { ProgressLedger } from '../../services/progress/progress-ledger'
import type { KanbanColumn, CreateTaskInput } from '../../services/kanban/types'
import { logger } from '../../utils/logger'
import { IPC_CHANNELS } from '../../../shared/types'

export function registerKanbanHandlers(
  ipcMainInstance: Electron.IpcMain,
  kanbanService: KanbanService,
  taskStatusTracker: TaskStatusTracker,
  progressLedger: ProgressLedger,
  workspacePath: string,
): () => void {
  ipcMainInstance.handle(
    IPC_CHANNELS.KANBAN_PARSE,
    async () => {
      try {
        return await kanbanService.parseTasksMd(workspacePath)
      } catch (error) {
        logger.error('kanban.ipc.error', {
          channel: 'kanban:parse',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.KANBAN_CREATE,
    async (_event, input: CreateTaskInput) => {
      try {
        return await kanbanService.createTask(input)
      } catch (error) {
        logger.error('kanban.ipc.error', {
          channel: 'kanban:create',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.KANBAN_UPDATE_STATUS,
    async (_event, taskId: string, newStatus: KanbanColumn, trigger?: string) => {
      try {
        await kanbanService.updateTaskStatus(taskId, newStatus, (trigger as 'drag' | 'ai-auto' | 'dispatch') ?? 'drag')
      } catch (error) {
        logger.error('kanban.ipc.error', {
          channel: 'kanban:updateStatus',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.KANBAN_DISPATCH_AI,
    async (_event, taskId: string) => {
      try {
        return await kanbanService.dispatchToAI(taskId)
      } catch (error) {
        logger.error('kanban.ipc.error', {
          channel: 'kanban:dispatchAI',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.KANBAN_PROMOTE,
    async (_event, ledgerTaskId: string) => {
      try {
        return await kanbanService.promoteFromLedger(ledgerTaskId)
      } catch (error) {
        logger.error('kanban.ipc.error', {
          channel: 'kanban:promote',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.KANBAN_AI_SIDEBAR,
    async () => {
      try {
        const snapshot = progressLedger.getSnapshot()
        const activeTasks = [...snapshot.active, ...snapshot.queued]
        return activeTasks.filter((t) => !t.kanbanTaskId)
      } catch (error) {
        logger.error('kanban.ipc.error', {
          channel: 'kanban:aiSidebar',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.KANBAN_DISMISS_SUGGESTION,
    async (_event, taskId: string, suggestedStatus: KanbanColumn) => {
      try {
        taskStatusTracker.recordDismissal(taskId, suggestedStatus)
      } catch (error) {
        logger.error('kanban.ipc.error', {
          channel: 'kanban:dismissSuggestion',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.KANBAN_ACCEPT_SUGGESTION,
    async (_event, taskId: string, suggestedStatus: KanbanColumn) => {
      try {
        await kanbanService.updateTaskStatus(taskId, suggestedStatus, 'ai-auto')
      } catch (error) {
        logger.error('kanban.ipc.error', {
          channel: 'kanban:acceptSuggestion',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  return () => {
    ipcMainInstance.removeHandler(IPC_CHANNELS.KANBAN_PARSE)
    ipcMainInstance.removeHandler(IPC_CHANNELS.KANBAN_CREATE)
    ipcMainInstance.removeHandler(IPC_CHANNELS.KANBAN_UPDATE_STATUS)
    ipcMainInstance.removeHandler(IPC_CHANNELS.KANBAN_DISPATCH_AI)
    ipcMainInstance.removeHandler(IPC_CHANNELS.KANBAN_PROMOTE)
    ipcMainInstance.removeHandler(IPC_CHANNELS.KANBAN_AI_SIDEBAR)
    ipcMainInstance.removeHandler(IPC_CHANNELS.KANBAN_DISMISS_SUGGESTION)
    ipcMainInstance.removeHandler(IPC_CHANNELS.KANBAN_ACCEPT_SUGGESTION)
  }
}
