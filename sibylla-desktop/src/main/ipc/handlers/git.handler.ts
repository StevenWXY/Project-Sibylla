/**
 * Git Handler - IPC handler for Git conflict operations
 *
 * Bridges ConflictResolver service to IPC channels, enabling the
 * renderer process to:
 * - Get detailed conflict info (git:getConflicts)
 * - Resolve a conflict (git:resolve)
 * - Receive conflict detection push events (git:conflictDetected)
 *
 * Follows the same setter-injection pattern as SyncHandler.
 */

import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron'
import { IpcHandler } from '../handler'
import { IPC_CHANNELS } from '../../../shared/types'
import type { ConflictInfo, ConflictResolution } from '../../../shared/types'
import type { HistoryOptions, CommitInfo, FileDiff } from '../../services/types/git-abstraction.types'
import { logger } from '../../utils/logger'
import type { ConflictResolver } from '../../services/conflict-resolver'
import type { GitAbstraction } from '../../services/git-abstraction'

export class GitHandler extends IpcHandler {
  readonly namespace = 'git'
  private conflictResolver: ConflictResolver | null = null
  private gitAbstraction: GitAbstraction | null = null

  setConflictResolver(resolver: ConflictResolver): void {
    this.conflictResolver = resolver
    logger.info('[GitHandler] ConflictResolver instance set')
  }

  setGitAbstraction(gitAbs: GitAbstraction): void {
    this.gitAbstraction = gitAbs
    logger.info('[GitHandler] GitAbstraction instance set')
  }

  register(): void {
    ipcMain.handle(
      IPC_CHANNELS.GIT_GET_CONFLICTS,
      this.safeHandle(this.handleGetConflicts.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.GIT_RESOLVE,
      this.safeHandle(this.handleResolve.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.GIT_HISTORY,
      this.safeHandle(this.handleHistory.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.GIT_DIFF,
      this.safeHandle(this.handleDiff.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.GIT_RESTORE,
      this.safeHandle(this.handleRestore.bind(this)),
    )

    logger.info('[GitHandler] All handlers registered')
  }

  override cleanup(): void {
    ipcMain.removeHandler(IPC_CHANNELS.GIT_GET_CONFLICTS)
    ipcMain.removeHandler(IPC_CHANNELS.GIT_RESOLVE)
    ipcMain.removeHandler(IPC_CHANNELS.GIT_HISTORY)
    ipcMain.removeHandler(IPC_CHANNELS.GIT_DIFF)
    ipcMain.removeHandler(IPC_CHANNELS.GIT_RESTORE)
    logger.info('[GitHandler] Cleanup completed')
  }

  /**
   * Broadcast conflict detection to all open BrowserWindows
   *
   * Called when SyncManager detects conflicts during sync.
   * Pushes ConflictInfo[] to all renderer windows via webContents.send.
   *
   * @param conflicts - Array of parsed conflict info
   */
  broadcastConflict(conflicts: ConflictInfo[]): void {
    const windows = BrowserWindow.getAllWindows()

    for (const win of windows) {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send(IPC_CHANNELS.GIT_CONFLICT_DETECTED, conflicts)
      }
    }

    logger.debug('[GitHandler] Broadcast conflict detection', {
      conflictCount: conflicts.length,
      windowCount: windows.length,
    })
  }

  // ─── Handler Methods ──────────────────────────────────────────────────

  private async handleGetConflicts(
    _event: IpcMainInvokeEvent,
  ): Promise<ConflictInfo[]> {
    if (!this.conflictResolver) {
      throw new Error('ConflictResolver not initialized')
    }

    logger.info('[GitHandler] Get conflicts requested')
    return this.conflictResolver.getConflicts()
  }

  private async handleResolve(
    _event: IpcMainInvokeEvent,
    resolution: ConflictResolution,
  ): Promise<string> {
    if (!this.conflictResolver) {
      throw new Error('ConflictResolver not initialized')
    }

    logger.info('[GitHandler] Resolve conflict requested', {
      filePath: resolution.filePath,
      type: resolution.type,
    })
    return this.conflictResolver.resolve(resolution)
  }

  private async handleHistory(
    _event: IpcMainInvokeEvent,
    options?: HistoryOptions,
  ): Promise<readonly CommitInfo[]> {
    if (!this.gitAbstraction) {
      throw new Error('GitAbstraction not initialized')
    }
    logger.info('[GitHandler] History requested', { filepath: options?.filepath })
    return this.gitAbstraction.getHistory(options)
  }

  private async handleDiff(
    _event: IpcMainInvokeEvent,
    filepath: string,
    commitA?: string,
    commitB?: string,
  ): Promise<FileDiff> {
    if (!this.gitAbstraction) {
      throw new Error('GitAbstraction not initialized')
    }
    logger.info('[GitHandler] Diff requested', { filepath, commitA, commitB })
    return this.gitAbstraction.getFileDiff(filepath, commitA, commitB)
  }

  private async handleRestore(
    _event: IpcMainInvokeEvent,
    filepath: string,
    commitSha: string,
  ): Promise<string> {
    if (!this.gitAbstraction) {
      throw new Error('GitAbstraction not initialized')
    }
    logger.info('[GitHandler] Restore version requested', { filepath, commitSha })
    return this.gitAbstraction.restoreVersion(filepath, commitSha)
  }
}
