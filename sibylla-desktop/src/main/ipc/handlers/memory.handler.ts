import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron'
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
  MemoryV2StatsResponse,
} from '../../../shared/types'
import type { MemoryManager, MemoryUpdate, MemorySnapshot } from '../../services/memory-manager'
import type { LocalRagEngine, LocalRagSearchHit } from '../../services/local-rag-engine'
import type { WorkspaceManager } from '../../services/workspace-manager'
import type {
  HybridSearchResult,
  SearchOptions,
  MemoryEntry,
  CheckpointRecord,
  EvolutionEvent,
  MemoryConfig,
} from '../../services/memory/types'
import { DEFAULT_MEMORY_CONFIG } from '../../services/memory/types'
import type { MemoryEventBus } from '../../services/memory/memory-event-bus'
import { logger } from '../../utils/logger'

export class MemoryHandler extends IpcHandler {
  readonly namespace = 'memory'
  private mainWindow: BrowserWindow | null = null
  private eventBus: MemoryEventBus | null = null

  constructor(
    private readonly memoryManager: MemoryManager,
    private readonly ragEngine: LocalRagEngine,
    private readonly workspaceManager: WorkspaceManager,
  ) {
    super()
  }

  /**
   * Set BrowserWindow reference for push events and EventBus for bridging
   */
  setWindowAndEventBus(window: BrowserWindow, eventBus: MemoryEventBus): void {
    this.mainWindow = window
    this.eventBus = eventBus
    this.registerEventPush()
  }

  register(): void {
    // v1 handlers (kept for backward compatibility)
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

    // TASK025: Memory search IPC channels
    ipcMain.handle(
      IPC_CHANNELS.MEMORY_V2_SEARCH,
      this.safeHandle(this.handleMemorySearch.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.MEMORY_V2_REBUILD_INDEX,
      this.safeHandle(this.handleMemoryRebuildIndex.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.MEMORY_V2_GET_INDEX_HEALTH,
      this.safeHandle(this.handleMemoryGetIndexHealth.bind(this)),
    )

    // TASK026: Memory v2 CRUD handlers
    ipcMain.handle(
      IPC_CHANNELS.MEMORY_V2_LIST_ENTRIES,
      this.safeHandle(this.handleListEntries.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.MEMORY_V2_LIST_ARCHIVED,
      this.safeHandle(this.handleListArchived.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.MEMORY_V2_GET_ENTRY,
      this.safeHandle(this.handleGetEntry.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.MEMORY_V2_GET_STATS,
      this.safeHandle(this.handleGetStats.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.MEMORY_V2_UPDATE_ENTRY,
      this.safeHandle(this.handleUpdateEntry.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.MEMORY_V2_DELETE_ENTRY,
      this.safeHandle(this.handleDeleteEntry.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.MEMORY_V2_LOCK_ENTRY,
      this.safeHandle(this.handleLockEntry.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.MEMORY_V2_TRIGGER_CHECKPOINT,
      this.safeHandle(this.handleTriggerCheckpoint.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.MEMORY_V2_TRIGGER_COMPRESSION,
      this.safeHandle(this.handleTriggerCompression.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.MEMORY_V2_UNDO_LAST_COMPRESSION,
      this.safeHandle(this.handleUndoLastCompression.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.MEMORY_V2_GET_EVOLUTION_HISTORY,
      this.safeHandle(this.handleGetEvolutionHistory.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.MEMORY_V2_GET_CONFIG,
      this.safeHandle(this.handleGetConfig.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.MEMORY_V2_UPDATE_CONFIG,
      this.safeHandle(this.handleUpdateConfig.bind(this)),
    )

    logger.info('[MemoryHandler] All handlers registered (v1 + v2)')
  }

  override cleanup(): void {
    // v1 channels
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_SNAPSHOT)
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_UPDATE)
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_FLUSH)
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_DAILY_LOG_QUERY)
    ipcMain.removeHandler(IPC_CHANNELS.RAG_SEARCH)
    ipcMain.removeHandler(IPC_CHANNELS.RAG_REBUILD)
    // TASK025 channels
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_V2_SEARCH)
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_V2_REBUILD_INDEX)
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_V2_GET_INDEX_HEALTH)
    // TASK026 v2 channels
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_V2_LIST_ENTRIES)
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_V2_LIST_ARCHIVED)
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_V2_GET_ENTRY)
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_V2_GET_STATS)
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_V2_UPDATE_ENTRY)
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_V2_DELETE_ENTRY)
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_V2_LOCK_ENTRY)
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_V2_TRIGGER_CHECKPOINT)
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_V2_TRIGGER_COMPRESSION)
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_V2_UNDO_LAST_COMPRESSION)
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_V2_GET_EVOLUTION_HISTORY)
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_V2_GET_CONFIG)
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_V2_UPDATE_CONFIG)
    logger.info('[MemoryHandler] Cleanup completed')
  }

  // ─── Event Push (Main → Renderer) ───

  private registerEventPush(): void {
    if (!this.eventBus || !this.mainWindow) return

    this.eventBus.on('memory:checkpoint-started', (record: CheckpointRecord) => {
      if (!this.mainWindow?.isDestroyed()) {
        this.mainWindow?.webContents.send(IPC_CHANNELS.MEMORY_V2_CHECKPOINT_STARTED, record)
      }
    })
    this.eventBus.on('memory:checkpoint-completed', (record: CheckpointRecord) => {
      if (!this.mainWindow?.isDestroyed()) {
        this.mainWindow?.webContents.send(IPC_CHANNELS.MEMORY_V2_CHECKPOINT_COMPLETED, record)
      }
    })
    this.eventBus.on('memory:checkpoint-failed', (record: CheckpointRecord) => {
      if (!this.mainWindow?.isDestroyed()) {
        this.mainWindow?.webContents.send(IPC_CHANNELS.MEMORY_V2_CHECKPOINT_FAILED, record)
      }
    })
    this.eventBus.on('memory:entry-added', (entry: MemoryEntry) => {
      if (!this.mainWindow?.isDestroyed()) {
        this.mainWindow?.webContents.send(IPC_CHANNELS.MEMORY_V2_ENTRY_ADDED, entry)
      }
    })
    this.eventBus.on('memory:entry-updated', (entry: MemoryEntry) => {
      if (!this.mainWindow?.isDestroyed()) {
        this.mainWindow?.webContents.send(IPC_CHANNELS.MEMORY_V2_ENTRY_UPDATED, entry)
      }
    })
    this.eventBus.on('memory:entry-deleted', (entryId: string) => {
      if (!this.mainWindow?.isDestroyed()) {
        this.mainWindow?.webContents.send(IPC_CHANNELS.MEMORY_V2_ENTRY_DELETED, entryId)
      }
    })

    logger.info('[MemoryHandler] Event push listeners registered')
  }

  // ─── Utility ───

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

  // ─── v1 Handlers ───

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

  /**
   * rag:search — prioritize MemoryIndexer, fallback to LocalRagEngine.
   */
  private async handleRagSearch(
    _event: IpcMainInvokeEvent,
    request: RagSearchRequest,
  ): Promise<RagSearchHit[]> {
    this.ensureWorkspaceServices()

    // Try MemoryIndexer first (via MemoryManager.search)
    try {
      const results = await this.memoryManager.search(request.query, { limit: request.limit })
      if (results.length > 0) {
        return results.map((hit): RagSearchHit => ({
          path: `memory:${hit.section}/${hit.id}`,
          score: hit.finalScore,
          snippet: hit.content.slice(0, 200),
        }))
      }
    } catch {
      // MemoryIndexer not available, fall through to LocalRagEngine
    }

    // Fallback: LocalRagEngine
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

  /**
   * rag:rebuild — trigger both MemoryIndexer and LocalRagEngine rebuild.
   */
  private async handleRagRebuild(
    _event: IpcMainInvokeEvent,
  ): Promise<void> {
    this.ensureWorkspaceServices()
    const results = await Promise.allSettled([
      this.memoryManager.v2Components?.indexer?.rebuild() ?? Promise.resolve(),
      this.ragEngine.rebuildIndex(),
    ])
    for (const [i, result] of results.entries()) {
      if (result.status === 'rejected') {
        const subsystem = i === 0 ? 'MemoryIndexer' : 'LocalRagEngine'
        logger.warn(`[MemoryHandler] ${subsystem} rebuild failed`, {
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        })
      }
    }
  }

  // ─── TASK025: Search Handlers ───

  /**
   * memory:search — direct MemoryIndexer search via MemoryManager.
   */
  private async handleMemorySearch(
    _event: IpcMainInvokeEvent,
    query: string,
    options?: SearchOptions,
  ): Promise<HybridSearchResult[]> {
    this.ensureWorkspaceServices()
    return this.memoryManager.search(query, options)
  }

  /**
   * memory:rebuildIndex — rebuild MemoryIndexer only.
   */
  private async handleMemoryRebuildIndex(
    _event: IpcMainInvokeEvent,
  ): Promise<void> {
    this.ensureWorkspaceServices()
    const indexer = this.memoryManager.v2Components?.indexer
    if (!indexer) {
      throw new Error('MemoryIndexer not initialized')
    }
    await indexer.rebuild()
  }

  /**
   * memory:getIndexHealth — return index health status.
   */
  private async handleMemoryGetIndexHealth(
    _event: IpcMainInvokeEvent,
  ): Promise<{ healthy: boolean; entryCount: number }> {
    this.ensureWorkspaceServices()
    const indexer = this.memoryManager.v2Components?.indexer
    if (!indexer) {
      return { healthy: false, entryCount: 0 }
    }
    const health = await indexer.verifyHealth()
    return {
      healthy: health.healthy,
      entryCount: indexer.getEntryCount(),
    }
  }

  // ─── TASK026: Memory v2 CRUD Handlers ───

  private async handleListEntries(
    _event: IpcMainInvokeEvent,
  ): Promise<MemoryEntry[]> {
    this.ensureWorkspaceServices()
    return this.memoryManager.getAllEntries()
  }

  private async handleListArchived(
    _event: IpcMainInvokeEvent,
  ): Promise<MemoryEntry[]> {
    this.ensureWorkspaceServices()
    return this.memoryManager.getAllArchivedEntries()
  }

  private async handleGetEntry(
    _event: IpcMainInvokeEvent,
    entryId: string,
  ): Promise<MemoryEntry | null> {
    this.ensureWorkspaceServices()
    return this.memoryManager.getEntry(entryId)
  }

  private async handleGetStats(
    _event: IpcMainInvokeEvent,
  ): Promise<MemoryV2StatsResponse> {
    this.ensureWorkspaceServices()
    const stats = await this.memoryManager.getStats()
    return {
      totalTokens: stats.totalTokens,
      entryCount: stats.entryCount,
      lastCheckpoint: stats.lastCheckpoint,
      sections: stats.sections as Record<string, number>,
    }
  }

  private async handleUpdateEntry(
    _event: IpcMainInvokeEvent,
    entryId: string,
    updates: Partial<MemoryEntry>,
  ): Promise<void> {
    this.ensureWorkspaceServices()
    if (updates.content !== undefined) {
      await this.memoryManager.updateEntry(entryId, updates.content)
    }
  }

  private async handleDeleteEntry(
    _event: IpcMainInvokeEvent,
    entryId: string,
  ): Promise<void> {
    this.ensureWorkspaceServices()
    await this.memoryManager.deleteEntry(entryId)
  }

  private async handleLockEntry(
    _event: IpcMainInvokeEvent,
    entryId: string,
    locked: boolean,
  ): Promise<void> {
    this.ensureWorkspaceServices()
    await this.memoryManager.lockEntry(entryId, locked)
  }

  /**
   * Trigger manual checkpoint. Status updates are pushed via IPC events
   * (checkpoint-started, checkpoint-completed, checkpoint-failed).
   */
  private async handleTriggerCheckpoint(
    _event: IpcMainInvokeEvent,
  ): Promise<void> {
    this.ensureWorkspaceServices()
    await this.memoryManager.triggerManualCheckpoint()
  }

  /**
   * Trigger compression and return a flattened summary for the renderer.
   * The main-process CompressionResult contains full MemoryEntry objects;
   * we serialize only counts + token deltas for IPC transport.
   */
  private async handleTriggerCompression(
    _event: IpcMainInvokeEvent,
  ): Promise<{ discardedCount: number; mergedCount: number; archivedCount: number; beforeTokens: number; afterTokens: number }> {
    this.ensureWorkspaceServices()
    const result = await this.memoryManager.compress()
    return {
      discardedCount: result.discarded.length,
      mergedCount: result.merged.length,
      archivedCount: result.archived.length,
      beforeTokens: result.beforeTokens,
      afterTokens: result.afterTokens,
    }
  }

  private async handleUndoLastCompression(
    _event: IpcMainInvokeEvent,
  ): Promise<void> {
    this.ensureWorkspaceServices()
    await this.memoryManager.undoLastCompression()
  }

  private async handleGetEvolutionHistory(
    _event: IpcMainInvokeEvent,
    entryId?: string,
  ): Promise<EvolutionEvent[]> {
    this.ensureWorkspaceServices()
    const evolutionLog = this.memoryManager.v2Components?.evolutionLog
    if (!evolutionLog) {
      return []
    }
    return await evolutionLog.query({ entryId })
  }

  private async handleGetConfig(
    _event: IpcMainInvokeEvent,
  ): Promise<MemoryConfig> {
    return DEFAULT_MEMORY_CONFIG
  }

  private async handleUpdateConfig(
    _event: IpcMainInvokeEvent,
    _patch: Partial<MemoryConfig>,
  ): Promise<void> {
    // Configuration update is a future feature — currently returns void
    logger.info('[MemoryHandler] Config update requested (not yet implemented)')
  }
}
