/**
 * Sync Extra Handler — IPC handlers for memory sync and task state machine sync
 *
 * Registers handlers for:
 *   sync:memory:enable     — enable encrypted memory sync
 *   sync:memory:disable    — disable encrypted memory sync
 *   sync:memory:setPassword — set encryption password and trigger initial push
 *   sync:memory:isLocked   — check if memory is locked (encrypted but no password)
 *   sync:task:listCrossDevice — list cross-device resumeable tasks
 *
 * @see plans/phase2/phase2-task005-sync-enhancement-citation-tracing-plan.md §Phase G2
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { IpcHandler } from '../handler'
import { IPC_CHANNELS } from '../../../shared/types'
import { logger } from '../../utils/logger'
import type { MemorySyncManager } from '../../services/sync/memory-sync'
import type { TaskStateMachineSync, CrossDeviceTask } from '../../services/sync/task-state-machine-sync'

interface SyncExtraDeps {
  memorySyncManager: MemorySyncManager
  taskStateMachineSync: TaskStateMachineSync
}

export class SyncExtraHandler extends IpcHandler {
  readonly namespace = 'sync-extra'
  private deps: SyncExtraDeps | null = null

  setDeps(deps: SyncExtraDeps): void {
    this.deps = deps
    logger.info('[SyncExtraHandler] Dependencies set')
  }

  register(): void {
    ipcMain.handle(
      IPC_CHANNELS.SYNC_MEMORY_ENABLE,
      this.safeHandle(this.handleMemoryEnable.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.SYNC_MEMORY_DISABLE,
      this.safeHandle(this.handleMemoryDisable.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.SYNC_MEMORY_SET_PASSWORD,
      this.safeHandle(this.handleSetPassword.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.SYNC_MEMORY_IS_LOCKED,
      this.safeHandle(this.handleIsLocked.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.SYNC_TASK_LIST_CROSS_DEVICE,
      this.safeHandle(this.handleListCrossDeviceTasks.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.SYNC_MEMORY_GET_CONFIG,
      this.safeHandle(this.handleGetConfig.bind(this)),
    )

    logger.info('[SyncExtraHandler] All handlers registered')
  }

  override cleanup(): void {
    ipcMain.removeHandler(IPC_CHANNELS.SYNC_MEMORY_ENABLE)
    ipcMain.removeHandler(IPC_CHANNELS.SYNC_MEMORY_DISABLE)
    ipcMain.removeHandler(IPC_CHANNELS.SYNC_MEMORY_SET_PASSWORD)
    ipcMain.removeHandler(IPC_CHANNELS.SYNC_MEMORY_IS_LOCKED)
    ipcMain.removeHandler(IPC_CHANNELS.SYNC_TASK_LIST_CROSS_DEVICE)
    ipcMain.removeHandler(IPC_CHANNELS.SYNC_MEMORY_GET_CONFIG)
    logger.info('[SyncExtraHandler] Cleanup completed')
  }

  private ensureDeps(): SyncExtraDeps {
    if (!this.deps) {
      throw new Error('SyncExtraHandler dependencies not set')
    }
    return this.deps
  }

  private async handleMemoryEnable(_event: IpcMainInvokeEvent): Promise<{ success: boolean }> {
    const { memorySyncManager } = this.ensureDeps()
    memorySyncManager.updateConfig({ syncMemory: true })
    logger.info('[SyncExtraHandler] Memory sync enabled')
    return { success: true }
  }

  private async handleMemoryDisable(_event: IpcMainInvokeEvent): Promise<{ success: boolean }> {
    const { memorySyncManager } = this.ensureDeps()
    memorySyncManager.updateConfig({ syncMemory: false })
    logger.info('[SyncExtraHandler] Memory sync disabled')
    return { success: true }
  }

  private async handleSetPassword(
    _event: IpcMainInvokeEvent,
    password: string,
  ): Promise<{ success: boolean }> {
    if (!password || typeof password !== 'string' || password.length < 6) {
      throw new Error('Password must be at least 6 characters')
    }
    const { memorySyncManager } = this.ensureDeps()
    memorySyncManager.setPassword(password)
    await memorySyncManager.beforePush()
    logger.info('[SyncExtraHandler] Password set and initial push triggered')
    return { success: true }
  }

  private async handleIsLocked(_event: IpcMainInvokeEvent): Promise<{ locked: boolean }> {
    const { memorySyncManager } = this.ensureDeps()
    const locked = await memorySyncManager.isLocked()
    return { locked }
  }

  private async handleListCrossDeviceTasks(
    _event: IpcMainInvokeEvent,
  ): Promise<readonly CrossDeviceTask[]> {
    const { taskStateMachineSync } = this.ensureDeps()
    return taskStateMachineSync.detectCrossDeviceTasks()
  }

  private async handleGetConfig(
    _event: IpcMainInvokeEvent,
  ): Promise<{ syncMemory: boolean; locked: boolean }> {
    const { memorySyncManager } = this.ensureDeps()
    const config = memorySyncManager.getConfig()
    const locked = await memorySyncManager.isLocked()
    return { syncMemory: config.syncMemory, locked }
  }
}
