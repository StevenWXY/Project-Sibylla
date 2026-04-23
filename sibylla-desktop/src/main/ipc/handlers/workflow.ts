import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../shared/types'
import type { RunFilter } from '../../../shared/types'
import { IpcHandler } from '../handler'
import type { WorkflowRegistry } from '../../services/workflow/WorkflowRegistry'
import type { WorkflowExecutor } from '../../services/workflow/WorkflowExecutor'
import type { WorkflowScheduler } from '../../services/workflow/WorkflowScheduler'
import type { WorkflowRunStore } from '../../services/workflow/WorkflowRunStore'

export class WorkflowHandler extends IpcHandler {
  readonly namespace = 'workflow'

  constructor(
    private readonly registry: WorkflowRegistry,
    private readonly executor: WorkflowExecutor,
    private readonly scheduler: WorkflowScheduler,
    private readonly runStore: WorkflowRunStore,
  ) {
    super()
  }

  register(): void {
    ipcMain.handle(IPC_CHANNELS.WORKFLOW_LIST, this.safeHandle(async () => {
      return this.registry.getAll()
    }))

    ipcMain.handle(IPC_CHANNELS.WORKFLOW_TRIGGER_MANUAL, this.safeHandle(async (_event, workflowId: string, params: Record<string, unknown>) => {
      const runId = await this.scheduler.triggerManual(workflowId, params)
      return { runId }
    }))

    ipcMain.handle(IPC_CHANNELS.WORKFLOW_GET_RUN, this.safeHandle(async (_event, runId: string) => {
      return await this.runStore.get(runId)
    }))

    ipcMain.handle(IPC_CHANNELS.WORKFLOW_CANCEL_RUN, this.safeHandle(async (_event, runId: string) => {
      this.executor.cancelRun(runId)
      await this.runStore.updateStatus(runId, 'cancelled')
    }))

    ipcMain.handle(IPC_CHANNELS.WORKFLOW_LIST_RUNS, this.safeHandle(async (_event, filter?: RunFilter) => {
      return await this.runStore.listRuns(filter)
    }))

    ipcMain.handle(IPC_CHANNELS.WORKFLOW_CONFIRM_STEP, this.safeHandle(async (_event, runId: string, decision: 'confirm' | 'skip' | 'cancel') => {
      this.scheduler.resolveConfirmation(runId, decision)
    }))
  }

  cleanup(): void {
    ipcMain.removeHandler(IPC_CHANNELS.WORKFLOW_LIST)
    ipcMain.removeHandler(IPC_CHANNELS.WORKFLOW_TRIGGER_MANUAL)
    ipcMain.removeHandler(IPC_CHANNELS.WORKFLOW_GET_RUN)
    ipcMain.removeHandler(IPC_CHANNELS.WORKFLOW_CANCEL_RUN)
    ipcMain.removeHandler(IPC_CHANNELS.WORKFLOW_LIST_RUNS)
    ipcMain.removeHandler(IPC_CHANNELS.WORKFLOW_CONFIRM_STEP)
    super.cleanup()
  }
}
