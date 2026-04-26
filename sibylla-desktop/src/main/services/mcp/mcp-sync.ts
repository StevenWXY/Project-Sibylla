/**
 * McpSyncManager — Pull-based continuous sync scheduler for MCP data sources.
 *
 * Responsibilities:
 * - Manage sync task lifecycle (add/remove/update/pause/resume)
 * - Independent per-task timers (not shared with Git SyncManager)
 * - Incremental sync via updated_at / cursor / etag
 * - Concurrency guard: max 1 active run per task
 * - Error tolerance: pause after 3 consecutive failures
 * - State persistence to .sibylla/mcp/sync-state.json (restart-safe)
 *
 * @see specs/tasks/phase1/phase1-task043_mcp-continuous-sync.md
 */

import * as fs from 'fs'
import * as path from 'path'
import type { MCPClient } from './mcp-client'
import type { MCPRegistry } from './mcp-registry'
import type { FileManager } from '../file-manager'
import type { SyncTaskConfig, SyncState, SyncProgress } from './types'
import { SyncDataTransformer } from './sync-data-transformer'
import { logger } from '../../utils/logger'

/** Maximum consecutive errors before auto-pausing a task */
const MAX_CONSECUTIVE_ERRORS = 3

/** Shutdown timeout for waiting on active runs (ms) */
const SHUTDOWN_TIMEOUT_MS = 5000

export class McpSyncManager {
  private tasks = new Map<string, SyncTaskConfig>()
  private states = new Map<string, SyncState>()
  private timers = new Map<string, NodeJS.Timeout>()
  private activeRuns = new Set<string>()
  private readonly transformer = new SyncDataTransformer()
  private shutdownRequested = false

  constructor(
    private readonly client: MCPClient,
    private readonly registry: MCPRegistry,
    private readonly fileManager: FileManager,
    private readonly statePath: string,
    private readonly tasksPath: string,
    private readonly onProgress?: (progress: SyncProgress) => void,
  ) {}

  // ─── Lifecycle ───

  /**
   * Initialize the sync manager: load persisted tasks/state, start timers.
   */
  async initialize(): Promise<void> {
    await this.loadTasks()
    await this.loadStates()

    const now = Date.now()
    for (const [taskId, task] of this.tasks) {
      const state = this.states.get(taskId)
      if (!task.enabled) continue
      if (state?.status === 'error') continue

      this.startTimer(taskId)

      // Compensate for missed intervals (e.g. app was closed)
      if (task.intervalMinutes > 0 && state?.lastSyncAt) {
        const elapsedMs = now - state.lastSyncAt
        const intervalMs = task.intervalMinutes * 60 * 1000
        if (elapsedMs >= intervalMs) {
          // Schedule immediate compensating sync (non-blocking)
          void this.triggerSync(taskId).catch((err: unknown) => {
            logger.warn('[McpSyncManager] Compensating sync failed', {
              taskId,
              error: err instanceof Error ? err.message : String(err),
            })
          })
        }
      }
    }

    logger.info('[McpSyncManager] Initialized', {
      taskCount: this.tasks.size,
      activeCount: [...this.states.values()].filter(s => s.status === 'active').length,
    })
  }

  /**
   * Graceful shutdown: stop all timers, wait for active runs, persist state.
   */
  async shutdown(): Promise<void> {
    this.shutdownRequested = true

    // 1. Clear all timers
    const timerTaskIds = [...this.timers.keys()]
    for (const taskId of timerTaskIds) {
      this.stopTimer(taskId)
    }

    // 2. Wait for active runs to complete (with timeout)
    if (this.activeRuns.size > 0) {
      const start = Date.now()
      while (this.activeRuns.size > 0 && Date.now() - start < SHUTDOWN_TIMEOUT_MS) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      if (this.activeRuns.size > 0) {
        logger.warn('[McpSyncManager] Shutdown timeout, forcing exit', {
          activeRuns: [...this.activeRuns],
        })
      }
    }

    // 3. Persist final state
    await this.persistState()

    logger.info('[McpSyncManager] Shutdown complete')
  }

  // ─── Task Management ───

  /**
   * Add a new sync task. Validates server/tool availability.
   */
  async addTask(config: SyncTaskConfig): Promise<void> {
    // Validate server exists and tool is available
    const serverInfo = this.registry.listServers().find(s => s.name === config.serverName)
    if (!serverInfo || serverInfo.state !== 'connected') {
      throw new Error(`MCPSync: server "${config.serverName}" is not connected`)
    }

    const tool = this.registry.getTool(config.serverName, config.toolName)
    if (!tool) {
      throw new Error(`MCPSync: tool "${config.toolName}" not found on server "${config.serverName}"`)
    }

    // Create initial state
    const state: SyncState = {
      taskId: config.id,
      lastSyncAt: null,
      cursor: null,
      errorCount: 0,
      status: 'active',
      totalSyncedItems: 0,
    }

    this.tasks.set(config.id, config)
    this.states.set(config.id, state)

    if (config.enabled) {
      this.startTimer(config.id)
    }

    await this.persistState()

    logger.info('[McpSyncManager] Task added', {
      taskId: config.id,
      name: config.name,
      interval: config.intervalMinutes,
    })
  }

  /**
   * Remove a sync task entirely.
   */
  async removeTask(taskId: string): Promise<void> {
    this.stopTimer(taskId)
    this.tasks.delete(taskId)
    this.states.delete(taskId)
    await this.persistState()

    logger.info('[McpSyncManager] Task removed', { taskId })
  }

  /**
   * Update an existing sync task with a partial config patch.
   */
  async updateTask(taskId: string, patch: Partial<SyncTaskConfig>): Promise<void> {
    const existing = this.tasks.get(taskId)
    if (!existing) {
      throw new Error(`MCPSync: task "${taskId}" not found`)
    }

    const updated: SyncTaskConfig = { ...existing, ...patch, id: taskId }
    this.tasks.set(taskId, updated)

    // Rebuild timer if interval changed
    if (patch.intervalMinutes !== undefined || patch.enabled !== undefined) {
      this.stopTimer(taskId)
      if (updated.enabled) {
        this.startTimer(taskId)
      }
    }

    await this.persistState()

    logger.info('[McpSyncManager] Task updated', { taskId, patch: Object.keys(patch) })
  }

  /**
   * Pause a sync task: stop timer, set status to 'paused'.
   */
  async pauseTask(taskId: string): Promise<void> {
    const state = this.states.get(taskId)
    if (!state) throw new Error(`MCPSync: state for task "${taskId}" not found`)

    this.stopTimer(taskId)
    state.status = 'paused'
    await this.persistState()

    logger.info('[McpSyncManager] Task paused', { taskId })
  }

  /**
   * Resume a paused/errored sync task: reset errors, restart timer.
   */
  async resumeTask(taskId: string): Promise<void> {
    const state = this.states.get(taskId)
    if (!state) throw new Error(`MCPSync: state for task "${taskId}" not found`)

    state.errorCount = 0
    state.status = 'active'
    state.lastError = undefined

    this.startTimer(taskId)
    await this.persistState()

    logger.info('[McpSyncManager] Task resumed', { taskId })
  }

  /**
   * List all tasks with their current states.
   */
  listTasks(): Array<{ task: SyncTaskConfig; state: SyncState }> {
    const result: Array<{ task: SyncTaskConfig; state: SyncState }> = []
    for (const [taskId, task] of this.tasks) {
      const state = this.states.get(taskId) ?? {
        taskId,
        lastSyncAt: null,
        cursor: null,
        errorCount: 0,
        status: 'active' as const,
      }
      result.push({ task, state })
    }
    return result
  }

  // ─── Sync Execution ───

  /**
   * Trigger a sync for a specific task. Core execution flow.
   * Returns sync progress or throws on failure.
   */
  async triggerSync(taskId: string): Promise<SyncProgress> {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error(`MCPSync: task "${taskId}" not found`)

    const state = this.states.get(taskId)
    if (!state) throw new Error(`MCPSync: state for task "${taskId}" not found`)

    // Prevent new syncs after shutdown is requested
    if (this.shutdownRequested) {
      return {
        taskId,
        taskName: task.name,
        status: 'error',
        itemsSynced: 0,
        durationMs: 0,
        error: 'Sync manager is shutting down',
        timestamp: Date.now(),
      }
    }

    // Concurrency guard: max 1 active run per task
    if (this.activeRuns.has(taskId)) {
      return {
        taskId,
        taskName: task.name,
        status: 'error',
        itemsSynced: 0,
        durationMs: 0,
        error: 'Sync already running for this task',
        timestamp: Date.now(),
      }
    }

    this.activeRuns.add(taskId)
    const startTime = Date.now()

    // Notify: running
    const runningProgress: SyncProgress = {
      taskId,
      taskName: task.name,
      status: 'running',
      itemsSynced: 0,
      durationMs: 0,
      timestamp: Date.now(),
    }
    this.onProgress?.(runningProgress)

    try {
      // Build incremental args
      const mergedArgs: Record<string, unknown> = { ...task.args }
      if (state.lastSyncAt) {
        mergedArgs.since = new Date(state.lastSyncAt).toISOString()
      }
      if (state.cursor) {
        mergedArgs.cursor = state.cursor
      }

      // Call MCP tool
      const rawResult = await this.client.callTool(task.serverName, task.toolName, mergedArgs)

      // Parse result content
      const resultData = this.parseToolResult(rawResult)

      // Transform to Markdown
      const markdown = this.transformer.transform(resultData, task.transformTemplate)

      // Resolve target path
      const targetPath = this.transformer.resolveTargetPath(task.targetPath, new Date())

      // Write to file
      if (task.writeMode === 'append') {
        let existingContent = ''
        try {
          const existing = await this.fileManager.readFile(targetPath)
          existingContent = existing.content
        } catch {
          // File doesn't exist yet — start fresh
        }
        const content = existingContent ? existingContent + '\n\n' + markdown : markdown
        await this.fileManager.writeFile(targetPath, content)
      } else {
        await this.fileManager.writeFile(targetPath, markdown)
      }

      // Extract new cursor from result if available
      const newCursor = this.extractCursor(resultData)

      // Count synced items
      const itemsSynced = this.countItems(resultData)

      // Update state
      const durationMs = Date.now() - startTime
      state.lastSyncAt = Date.now()
      state.cursor = newCursor
      state.errorCount = 0
      state.lastError = undefined
      state.lastSyncDurationMs = durationMs
      state.totalSyncedItems = (state.totalSyncedItems ?? 0) + itemsSynced

      await this.persistState()

      // Notify: success
      const successProgress: SyncProgress = {
        taskId,
        taskName: task.name,
        status: 'success',
        itemsSynced,
        durationMs,
        timestamp: Date.now(),
      }
      this.onProgress?.(successProgress)
      this.activeRuns.delete(taskId)

      logger.info('[McpSyncManager] Sync completed', {
        taskId,
        name: task.name,
        itemsSynced,
        durationMs,
      })

      return successProgress
    } catch (error) {
      this.activeRuns.delete(taskId)
      const err = error instanceof Error ? error : new Error(String(error))
      this.handleError(taskId, err)

      const durationMs = Date.now() - startTime
      const errorProgress: SyncProgress = {
        taskId,
        taskName: task.name,
        status: 'error',
        itemsSynced: 0,
        durationMs,
        error: err.message,
        timestamp: Date.now(),
      }
      this.onProgress?.(errorProgress)

      return errorProgress
    }
  }

  // ─── Timer Management ───

  private startTimer(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (!task || task.intervalMinutes === 0) return

    this.stopTimer(taskId)
    const intervalMs = task.intervalMinutes * 60 * 1000

    const timer = setInterval(async () => {
      try {
        await this.triggerSync(taskId)
      } catch (err) {
        logger.warn('[McpSyncManager] Scheduled sync failed', {
          taskId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }, intervalMs)
    this.timers.set(taskId, timer)
  }

  private stopTimer(taskId: string): void {
    const timer = this.timers.get(taskId)
    if (timer) {
      clearInterval(timer)
      this.timers.delete(taskId)
    }
  }

  // ─── Error Handling ───

  private handleError(taskId: string, error: Error): void {
    const state = this.states.get(taskId)
    if (!state) return

    state.errorCount++
    state.lastError = error.message

    if (state.errorCount >= MAX_CONSECUTIVE_ERRORS) {
      state.status = 'error'
      this.stopTimer(taskId)

      const task = this.tasks.get(taskId)
      this.onProgress?.({
        taskId,
        taskName: task?.name ?? taskId,
        status: 'error',
        itemsSynced: 0,
        durationMs: 0,
        error: `连续 ${state.errorCount} 次同步失败，已暂停。最后错误: ${error.message}`,
        timestamp: Date.now(),
      })

      logger.warn('[McpSyncManager] Task paused after consecutive failures', {
        taskId,
        errorCount: state.errorCount,
        lastError: error.message,
      })
    }

    // Persist updated error state (fire-and-forget)
    void this.persistState().catch((err: unknown) => {
      logger.error('[McpSyncManager] Failed to persist error state', {
        error: err instanceof Error ? err.message : String(err),
      })
    })
  }

  // ─── Data Parsing Helpers ───

  /**
   * Parse MCPToolResult content into a usable data structure.
   */
  private parseToolResult(result: { content: string | Array<{ type: string; text: string }>; isError?: boolean }): unknown {
    if (result.isError) {
      throw new Error(`MCP tool returned error: ${typeof result.content === 'string' ? result.content : JSON.stringify(result.content)}`)
    }

    let text: string
    if (typeof result.content === 'string') {
      text = result.content
    } else if (Array.isArray(result.content) && result.content.length > 0) {
      text = result.content.map(c => c.text).join('\n')
    } else {
      return {}
    }

    try {
      return JSON.parse(text) as unknown
    } catch {
      // Not JSON — return as raw text
      return { text }
    }
  }

  /**
   * Extract pagination cursor from result data.
   */
  private extractCursor(data: unknown): string | null {
    if (typeof data !== 'object' || data === null) return null
    const record = data as Record<string, unknown>
    if (typeof record.cursor === 'string') return record.cursor
    if (typeof record.next_cursor === 'string') return record.next_cursor
    if (typeof record.etag === 'string') return record.etag
    return null
  }

  /**
   * Count the number of synced items from result data.
   */
  private countItems(data: unknown): number {
    if (typeof data !== 'object' || data === null) return 0
    const record = data as Record<string, unknown>
    if (Array.isArray(record.items)) return record.items.length
    if (Array.isArray(record.messages)) return record.messages.length
    if (Array.isArray(record.data)) return record.data.length
    if (typeof record.text === 'string') return 1
    return 0
  }

  // ─── State Persistence ───

  /**
   * Load sync tasks from sync-tasks.json.
   */
  private async loadTasks(): Promise<void> {
    try {
      if (!fs.existsSync(this.tasksPath)) return
      const content = await fs.promises.readFile(this.tasksPath, 'utf-8')
      const parsed = JSON.parse(content) as SyncTaskConfig[]
      for (const task of parsed) {
        this.tasks.set(task.id, task)
      }
    } catch (err) {
      logger.error('[McpSyncManager] Failed to load tasks, starting fresh', {
        error: err instanceof Error ? err.message : String(err),
      })
      // Start with empty tasks — don't crash
    }
  }

  /**
   * Load sync states from sync-state.json.
   */
  private async loadStates(): Promise<void> {
    try {
      if (!fs.existsSync(this.statePath)) return
      const content = await fs.promises.readFile(this.statePath, 'utf-8')
      const parsed = JSON.parse(content) as SyncState[]
      for (const state of parsed) {
        this.states.set(state.taskId, state)
      }
    } catch (err) {
      logger.error('[McpSyncManager] Failed to load states, starting fresh', {
        error: err instanceof Error ? err.message : String(err),
      })
      // Start with empty states — don't crash
    }
  }

  /**
   * Persist current tasks + states to JSON files.
   * Uses atomic write (temp file → rename) to prevent corruption.
   */
  private async persistState(): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(this.statePath)
    await fs.promises.mkdir(dir, { recursive: true })

    // Atomic write for tasks
    const tasksData = JSON.stringify([...this.tasks.values()], null, 2)
    const tasksTmpPath = this.tasksPath + '.tmp'
    await fs.promises.writeFile(tasksTmpPath, tasksData, 'utf-8')
    await fs.promises.rename(tasksTmpPath, this.tasksPath)

    // Atomic write for states
    const statesData = JSON.stringify([...this.states.values()], null, 2)
    const statesTmpPath = this.statePath + '.tmp'
    await fs.promises.writeFile(statesTmpPath, statesData, 'utf-8')
    await fs.promises.rename(statesTmpPath, this.statePath)
  }
}
