import { BrowserWindow } from 'electron'
import type { PlanManager } from '../../services/plan/plan-manager'
import type { AppEventBus } from '../../services/event-bus'
import { logger } from '../../utils/logger'
import { IPC_CHANNELS } from '../../../shared/types'

export function registerPlanHandlers(
  ipcMainInstance: Electron.IpcMain,
  planManager: PlanManager,
  eventBus: AppEventBus,
  _mainWindowGetter: () => BrowserWindow | null,
): () => void {
  const handlerChannels = [
    IPC_CHANNELS.PLAN_GET_ACTIVE,
    IPC_CHANNELS.PLAN_GET,
    IPC_CHANNELS.PLAN_START_EXECUTION,
    IPC_CHANNELS.PLAN_ARCHIVE,
    IPC_CHANNELS.PLAN_ABANDON,
    IPC_CHANNELS.PLAN_FOLLOW_UP,
  ]

  ipcMainInstance.handle(IPC_CHANNELS.PLAN_GET_ACTIVE, async () => {
    try {
      return await planManager.getActivePlans()
    } catch (error) {
      logger.error('plan.ipc.error', {
        channel: 'plan:getActive',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })

  ipcMainInstance.handle(IPC_CHANNELS.PLAN_GET, async (_event, id: string) => {
    try {
      return await planManager.getPlan(id)
    } catch (error) {
      logger.error('plan.ipc.error', {
        channel: 'plan:get',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })

  ipcMainInstance.handle(IPC_CHANNELS.PLAN_START_EXECUTION, async (_event, id: string) => {
    try {
      await planManager.startExecution(id)
    } catch (error) {
      logger.error('plan.ipc.error', {
        channel: 'plan:startExecution',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })

  ipcMainInstance.handle(IPC_CHANNELS.PLAN_ARCHIVE, async (_event, id: string, targetPath: string) => {
    try {
      return await planManager.archiveAsFormalDocument(id, targetPath)
    } catch (error) {
      logger.error('plan.ipc.error', {
        channel: 'plan:archive',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })

  ipcMainInstance.handle(IPC_CHANNELS.PLAN_ABANDON, async (_event, id: string) => {
    try {
      await planManager.abandon(id)
    } catch (error) {
      logger.error('plan.ipc.error', {
        channel: 'plan:abandon',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })

  ipcMainInstance.handle(IPC_CHANNELS.PLAN_FOLLOW_UP, async (_event, id: string) => {
    try {
      return await planManager.followUp(id)
    } catch (error) {
      logger.error('plan.ipc.error', {
        channel: 'plan:followUp',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })

  type EventForwardEntry = { event: string; channel: string }
  const eventsToForward: EventForwardEntry[] = [
    { event: 'plan:created', channel: IPC_CHANNELS.PLAN_CREATED },
    { event: 'plan:execution-started', channel: IPC_CHANNELS.PLAN_EXECUTION_STARTED },
    { event: 'plan:steps-completed', channel: IPC_CHANNELS.PLAN_STEPS_COMPLETED },
    { event: 'plan:archived', channel: IPC_CHANNELS.PLAN_ARCHIVED },
    { event: 'plan:abandoned', channel: IPC_CHANNELS.PLAN_ABANDONED },
  ]

  const eventHandlers: Array<{ event: string; handler: (...args: unknown[]) => void }> = []

  for (const { event, channel } of eventsToForward) {
    const handler = ((data: unknown) => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) {
          window.webContents.send(channel, data)
        }
      }
    }) as (...args: unknown[]) => void
    eventBus.on(event as never, handler)
    eventHandlers.push({ event, handler })
  }

  return () => {
    for (const ch of handlerChannels) {
      ipcMainInstance.removeHandler(ch)
    }
    for (const { event, handler } of eventHandlers) {
      eventBus.removeListener(event, handler)
    }
  }
}
