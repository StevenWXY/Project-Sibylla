/**
 * Sync Handler - IPC handler for sync operations
 *
 * This handler bridges SyncManager events to IPC channels, enabling
 * the renderer process to:
 * - Force trigger a sync operation (sync:force)
 * - Receive sync status change notifications (sync:status-changed)
 *
 * It follows the same setter-injection pattern as WorkspaceHandler.
 */

import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron'
import { IpcHandler } from '../handler'
import { IPC_CHANNELS } from '../../../shared/types'
import type { SyncStatusData } from '../../../shared/types'
import { logger } from '../../utils/logger'
import type { SyncManager } from '../../services/sync-manager'
import type { SyncResult } from '../../services/types/git-abstraction.types'

/**
 * SyncHandler class
 *
 * Handles all sync-related IPC communications between main and renderer processes.
 * Listens to SyncManager's status:changed events and broadcasts them to all windows.
 */
export class SyncHandler extends IpcHandler {
  readonly namespace = 'sync'
  private syncManager: SyncManager | null = null

  /**
   * Bound event handler reference for cleanup
   */
  private statusChangeHandler: ((data: SyncStatusData) => void) | null = null

  /**
   * Set SyncManager instance and wire up event listeners
   *
   * @param syncManager - SyncManager instance to bridge to IPC
   */
  setSyncManager(syncManager: SyncManager): void {
    // Remove old listeners if replacing SyncManager
    this.removeStatusListener()

    this.syncManager = syncManager

    // Listen to status:changed events and broadcast to all windows
    this.statusChangeHandler = (data: SyncStatusData) => {
      this.broadcastStatusChange(data)
    }
    this.syncManager.on('status:changed', this.statusChangeHandler)

    logger.info('[SyncHandler] SyncManager instance set')
  }

  /**
   * Register all sync operation IPC handlers
   */
  register(): void {
    ipcMain.handle(
      IPC_CHANNELS.SYNC_FORCE,
      this.safeHandle(this.handleForceSync.bind(this)),
    )

    logger.info('[SyncHandler] All handlers registered')
  }

  /**
   * Cleanup — remove SyncManager event listeners and IPC handlers
   */
  override cleanup(): void {
    ipcMain.removeHandler(IPC_CHANNELS.SYNC_FORCE)
    this.removeStatusListener()
    logger.info('[SyncHandler] Cleanup completed')
  }

  // ─── Handler Methods ──────────────────────────────────────────────────

  /**
   * Handle sync:force IPC request
   *
   * Triggers a forced sync operation via SyncManager.
   *
   * @returns SyncResult from the sync operation
   */
  private async handleForceSync(_event: IpcMainInvokeEvent): Promise<SyncResult> {
    if (!this.syncManager) {
      throw new Error('SyncManager not initialized')
    }

    logger.info('[SyncHandler] Force sync requested')
    return this.syncManager.forceSync()
  }

  // ─── Broadcasting ─────────────────────────────────────────────────────

  /**
   * Broadcast sync status change to all open BrowserWindows
   *
   * Iterates over all windows and sends the status data via IPC.
   * Skips windows whose webContents have been destroyed.
   *
   * @param data - The sync status data to broadcast
   */
  private broadcastStatusChange(data: SyncStatusData): void {
    const windows = BrowserWindow.getAllWindows()

    for (const win of windows) {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.SYNC_STATUS_CHANGED, data)
      }
    }

    logger.debug('[SyncHandler] Broadcast sync status change', {
      status: data.status,
      windowCount: windows.length,
    })
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  /**
   * Remove the status change event listener from SyncManager
   */
  private removeStatusListener(): void {
    if (this.syncManager && this.statusChangeHandler) {
      this.syncManager.off('status:changed', this.statusChangeHandler)
      this.statusChangeHandler = null
    }
  }
}
