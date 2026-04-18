import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { IpcHandler } from '../handler'
import { IPC_CHANNELS } from '../../../shared/types'
import type {
  MemorySnapshotResponse,
  MemoryUpdateRequest,
  MemoryFlushRequest,
  MemoryFlushResponse,
  DailyLogQueryRequest,
  DailyLogEntry,
  RagSearchRequest,
  RagSearchHit,
} from '../../../shared/types'
import type { MemoryManager, MemoryUpdate, MemorySnapshot } from '../../services/memory-manager'
import type { LocalRagEngine, LocalRagSearchHit } from '../../services/local-rag-engine'
import type { WorkspaceManager } from '../../services/workspace-manager'
import { logger } from '../../utils/logger'

export class MemoryHandler extends IpcHandler {
  readonly namespace = 'memory'

  constructor(
    private readonly memoryManager: MemoryManager,
    private readonly ragEngine: LocalRagEngine,
    private readonly workspaceManager: WorkspaceManager,
  ) {
    super()
  }

  register(): void {
    ipcMain.handle(
      IPC_CHANNELS.MEMORY_SNAPSHOT,
      this.safeHandle(this.handleSnapshot.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.MEMORY_UPDATE,
      this.safeHandle(this.handleUpdate.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.MEMORY_FLUSH,
      this.safeHandle(this.handleFlush.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.MEMORY_DAILY_LOG_QUERY,
      this.safeHandle(this.handleDailyLogQuery.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.RAG_SEARCH,
      this.safeHandle(this.handleRagSearch.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.RAG_REBUILD,
      this.safeHandle(this.handleRagRebuild.bind(this)),
    )
    logger.info('[MemoryHandler] All handlers registered')
  }

  override cleanup(): void {
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_SNAPSHOT)
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_UPDATE)
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_FLUSH)
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_DAILY_LOG_QUERY)
    ipcMain.removeHandler(IPC_CHANNELS.RAG_SEARCH)
    ipcMain.removeHandler(IPC_CHANNELS.RAG_REBUILD)
    logger.info('[MemoryHandler] Cleanup completed')
  }

  private ensureWorkspaceServices(): void {
    const workspacePath = this.workspaceManager.getWorkspacePath()
    if (!workspacePath) {
      throw new Error('Please open a workspace before using memory features')
    }
    this.memoryManager.setWorkspacePath(workspacePath)
    this.ragEngine.setWorkspacePath(workspacePath)
  }

  private mapSnapshot(snapshot: MemorySnapshot): MemorySnapshotResponse {
    return {
      content: snapshot.content,
      tokenCount: snapshot.tokenCount,
      tokenDebt: snapshot.tokenDebt,
    }
  }

  private async handleSnapshot(
    _event: IpcMainInvokeEvent,
  ): Promise<MemorySnapshotResponse> {
    this.ensureWorkspaceServices()
    const snapshot = await this.memoryManager.getMemorySnapshot()
    return this.mapSnapshot(snapshot)
  }

  private async handleUpdate(
    _event: IpcMainInvokeEvent,
    request: MemoryUpdateRequest,
  ): Promise<MemorySnapshotResponse> {
    this.ensureWorkspaceServices()
    const updates: MemoryUpdate[] = request.updates.map((item) => ({
      section: item.section,
      content: item.content,
      priority: item.priority,
      tags: item.tags,
    }))
    const snapshot = await this.memoryManager.updateMemory(updates)
    return this.mapSnapshot(snapshot)
  }

  private async handleFlush(
    _event: IpcMainInvokeEvent,
    request: MemoryFlushRequest,
  ): Promise<MemoryFlushResponse> {
    this.ensureWorkspaceServices()
    const result = await this.memoryManager.flushIfNeeded(
      request.sessionTokens,
      request.contextWindowTokens,
      request.pendingInsights,
    )
    return {
      triggered: result.triggered,
      thresholdTokens: result.thresholdTokens,
      sessionTokens: result.sessionTokens,
      snapshot: this.mapSnapshot(result.snapshot),
    }
  }

  private async handleDailyLogQuery(
    _event: IpcMainInvokeEvent,
    request: DailyLogQueryRequest,
  ): Promise<DailyLogEntry[]> {
    this.ensureWorkspaceServices()
    return this.memoryManager.queryDailyLog(request.date)
  }

  private async handleRagSearch(
    _event: IpcMainInvokeEvent,
    request: RagSearchRequest,
  ): Promise<RagSearchHit[]> {
    this.ensureWorkspaceServices()
    const hits: LocalRagSearchHit[] = await this.ragEngine.search(
      request.query,
      { limit: request.limit },
    )
    return hits.map((hit): RagSearchHit => ({
      path: hit.path,
      score: hit.score,
      snippet: hit.snippet,
    }))
  }

  private async handleRagRebuild(
    _event: IpcMainInvokeEvent,
  ): Promise<void> {
    this.ensureWorkspaceServices()
    await this.ragEngine.rebuildIndex()
  }
}
