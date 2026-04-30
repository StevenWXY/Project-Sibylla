import { ipcMain, IpcMainInvokeEvent } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { IpcHandler } from '../handler'
import { IPC_CHANNELS } from '../../../shared/types'
import type { ConflictInfo, MergeResult, AdoptMergeParams } from '../../../shared/types'
import { logger } from '../../utils/logger'
import type { MergeAssistant } from '../../services/sync/merge-assistant'
import type { GitAbstraction } from '../../services/git-abstraction'

export class SyncMergeHandler extends IpcHandler {
  readonly namespace = 'sync-merge'
  private mergeAssistant: MergeAssistant | null = null
  private gitAbstraction: GitAbstraction | null = null
  private workspaceDir: string | null = null

  setMergeAssistant(assistant: MergeAssistant): void {
    this.mergeAssistant = assistant
  }

  setGitAbstraction(git: GitAbstraction, workspaceDir: string): void {
    this.gitAbstraction = git
    this.workspaceDir = workspaceDir
  }

  register(): void {
    ipcMain.handle(
      IPC_CHANNELS.SYNC_PROPOSE_AI_MERGE,
      this.safeHandle(this.handleProposeAIMerge.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.SYNC_ADOPT_AI_MERGE,
      this.safeHandle(this.handleAdoptAIMerge.bind(this)),
    )
    logger.info('[SyncMergeHandler] All handlers registered')
  }

  override cleanup(): void {
    ipcMain.removeHandler(IPC_CHANNELS.SYNC_PROPOSE_AI_MERGE)
    ipcMain.removeHandler(IPC_CHANNELS.SYNC_ADOPT_AI_MERGE)
    logger.info('[SyncMergeHandler] Cleanup completed')
  }

  private async handleProposeAIMerge(
    _event: IpcMainInvokeEvent,
    conflict: ConflictInfo,
  ): Promise<MergeResult> {
    if (!this.mergeAssistant) {
      throw new Error('MergeAssistant not initialized')
    }
    return this.mergeAssistant.propose(conflict)
  }

  private async handleAdoptAIMerge(
    _event: IpcMainInvokeEvent,
    params: AdoptMergeParams,
  ): Promise<{ success: boolean }> {
    if (!this.mergeAssistant || !this.gitAbstraction || !this.workspaceDir) {
      throw new Error('MergeAssistant, GitAbstraction, or workspaceDir not initialized')
    }

    this.mergeAssistant.adoptMerge({
      conflictId: params.conflictId,
      filePath: params.filePath,
      mergedContent: params.mergedContent,
      attribution: params.attribution,
      rationale: params.rationale,
      userId: 'current-user',
    })

    const fullPath = path.join(this.workspaceDir, params.filePath)
    const tempPath = fullPath + '.tmp'
    await fs.promises.writeFile(tempPath, params.mergedContent, 'utf-8')
    await fs.promises.rename(tempPath, fullPath)

    await this.gitAbstraction.stageFile(params.filePath)

    const shortId = params.conflictId.slice(0, 8)
    const commitMsg = `[user] AI 辅助合并 ${params.filePath} (cherry-picked from 冲突 #${shortId})`
    await this.gitAbstraction.commit(commitMsg)

    return { success: true }
  }
}
