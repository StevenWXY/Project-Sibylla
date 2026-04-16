/**
 * SyncManager Service
 *
 * Orchestrates automatic saving and synchronization by combining:
 * - FileManager's file change events (debounced auto-commit)
 * - GitAbstraction's commit and sync capabilities
 * - Electron's network state detection (online/offline awareness)
 *
 * Data flow:
 *   FileWatchEvent → debounce(1s) → stageFile + commit → sync(30s interval)
 *
 * Concurrency safety:
 *   All Git operations (stage, commit, sync) are serialized through an internal
 *   operation queue to prevent isomorphic-git index corruption.
 *
 * SyncManager emits events consumed by SyncHandler to broadcast
 * sync status changes to the renderer process via IPC.
 *
 * @see plans/phase0-task012-auto-save-plan.md for full design rationale
 */

import { EventEmitter } from 'events'
import { logger } from '../utils/logger'
import type { FileManager } from './file-manager'
import type { GitAbstraction } from './git-abstraction'
import {
  GitAbstractionError,
  GitAbstractionErrorCode,
} from './types/git-abstraction.types'
import type { SyncResult } from './types/git-abstraction.types'
import type {
  SyncManagerConfig,
  SyncManagerEvents,
} from './types/sync-manager.types'
import {
  DEFAULT_RECONNECT_SYNC_DELAY_MS,
  DEFAULT_INITIAL_SYNC_DELAY_MS,
} from './types/sync-manager.types'
import type { SyncStatus, SyncStatusData } from '../../../shared/types'
import type { NetworkMonitor } from './network-monitor'
import type { AutoSaveManager } from './auto-save-manager'

/** Log prefix for all SyncManager operations */
const LOG_PREFIX = '[SyncManager]'

/** Default debounce delay for auto-save (1 second) */
const DEFAULT_SAVE_DEBOUNCE_MS = 1000

/** Default sync interval (30 seconds) */
const DEFAULT_SYNC_INTERVAL_MS = 30000

// ─── Typed EventEmitter ─────────────────────────────────────────────────

/**
 * Type-safe EventEmitter base class
 *
 * Provides compile-time type checking for event names and argument types
 * to prevent typos and incorrect event payloads.
 */
interface TypedEventEmitter<Events extends Record<string, unknown[]>> {
  on<E extends keyof Events & string>(event: E, listener: (...args: Events[E]) => void): this
  off<E extends keyof Events & string>(event: E, listener: (...args: Events[E]) => void): this
  emit<E extends keyof Events & string>(event: E, ...args: Events[E]): boolean
  removeAllListeners(event?: keyof Events & string): this
}

/**
 * Network status provider interface
 *
 * Abstracted to allow mocking in tests where Electron's net module
 * is not available.
 */
export interface NetworkStatusProvider {
  /** Check if the system is currently online */
  isOnline(): boolean
}

/**
 * Default network status provider using Electron's net module
 *
 * Caches the net module reference on construction to avoid repeated
 * dynamic imports. Falls back to assuming online if Electron's net
 * module is unavailable (e.g., in test environments).
 */
export class ElectronNetworkProvider implements NetworkStatusProvider {
  private readonly electronNet: { isOnline(): boolean } | null

  constructor() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { net } = require('electron')
      this.electronNet = net
    } catch {
      this.electronNet = null
      logger.warn('[ElectronNetworkProvider] Electron net module unavailable, assuming online')
    }
  }

  isOnline(): boolean {
    return this.electronNet?.isOnline() ?? true
  }
}

/**
 * SyncManager — automatic save and sync orchestrator
 *
 * Lifecycle:
 *   new SyncManager(config, fileManager, gitAbstraction)
 *   → start()   — begins debounced auto-commit and timed sync
 *   → stop()    — cleans up all timers and listeners
 *
 * Events emitted (see SyncManagerEvents):
 *   sync:start, sync:success, sync:conflict, sync:error, sync:end,
 *   status:changed
 *
 * Concurrency:
 *   All Git operations are serialized through an internal operation queue
 *   (Promise chain). This prevents concurrent stageFile/commit/sync calls
 *   from corrupting isomorphic-git's index.
 */
export class SyncManager extends (EventEmitter as new () => TypedEventEmitter<SyncManagerEvents> & EventEmitter) {
  // ─── Dependencies ─────────────────────────────────────────────────────
  private readonly fileManager: FileManager
  private readonly gitAbstraction: GitAbstraction
  private readonly networkMonitor: NetworkMonitor | null

  // ─── Configuration ────────────────────────────────────────────────────
  private readonly workspaceDir: string
  private readonly saveDebounceMs: number
  private readonly syncIntervalMs: number
  private readonly reconnectSyncDelayMs: number
  private readonly initialSyncDelayMs: number

  // ─── Per-file debounce timers ─────────────────────────────────────────
  private readonly saveTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map()

  // ─── Sync timer ───────────────────────────────────────────────────────
  private syncTimer: ReturnType<typeof setInterval> | null = null

  // ─── State flags ──────────────────────────────────────────────────────
  private isOnline: boolean = true
  private isSyncing: boolean = false
  private isStarted: boolean = false

  // ─── Network provider ─────────────────────────────────────────────────
  private readonly networkProvider: NetworkStatusProvider

  // ─── Current status (for external query) ──────────────────────────────
  private currentStatus: SyncStatus = 'idle'

  // ─── Git operation queue (serializes all Git operations) ──────────────
  private gitOpQueue: Promise<void> = Promise.resolve()

  // ─── Listener cleanup references ──────────────────────────────────────
  private powerResumeHandler: (() => void) | null = null

  /**
   * Create a new SyncManager instance
   *
   * @param config - SyncManager configuration
   * @param fileManager - FileManager instance (reserved for future file-level checks)
   * @param gitAbstraction - GitAbstraction instance for Git operations
   * @param networkProvider - Optional network status provider (defaults to Electron net)
   * @param networkMonitor - Optional NetworkMonitor for proactive network detection (TASK006)
   */
  constructor(
    config: SyncManagerConfig,
    fileManager: FileManager,
    gitAbstraction: GitAbstraction,
    networkProvider?: NetworkStatusProvider,
    networkMonitor?: NetworkMonitor,
  ) {
    super()

    this.workspaceDir = config.workspaceDir
    this.saveDebounceMs = config.saveDebounceMs ?? DEFAULT_SAVE_DEBOUNCE_MS
    this.syncIntervalMs = config.syncIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS
    this.reconnectSyncDelayMs = config.reconnectSyncDelayMs ?? DEFAULT_RECONNECT_SYNC_DELAY_MS
    this.initialSyncDelayMs = config.initialSyncDelayMs ?? DEFAULT_INITIAL_SYNC_DELAY_MS
    this.fileManager = fileManager
    this.gitAbstraction = gitAbstraction
    this.networkProvider = networkProvider ?? new ElectronNetworkProvider()
    this.networkMonitor = networkMonitor ?? null

    logger.info(`${LOG_PREFIX} Initialized`, {
      workspaceDir: this.workspaceDir,
      saveDebounceMs: this.saveDebounceMs,
      syncIntervalMs: this.syncIntervalMs,
      reconnectSyncDelayMs: this.reconnectSyncDelayMs,
      initialSyncDelayMs: this.initialSyncDelayMs,
    })
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────

  /**
   * Start the SyncManager
   *
   * Begins the automatic save/sync pipeline:
   * 1. Detects initial network status
   * 2. Starts the periodic sync timer (if syncIntervalMs > 0)
   *
   * This method is idempotent — calling it multiple times has no effect.
   */
  start(): void {
    if (this.isStarted) {
      logger.warn(`${LOG_PREFIX} Already started, ignoring start() call`)
      return
    }

    this.isStarted = true

    // Detect initial network status
    this.isOnline = this.networkProvider.isOnline()
    if (!this.isOnline) {
      this.updateStatus('offline')
    }

    // Start NetworkMonitor if provided
    if (this.networkMonitor) {
      this.networkMonitor.start()
      this.setupNetworkMonitorListeners()
    }

    // Setup power monitor listeners
    this.setupPowerListeners()

    // Start periodic sync timer (only if interval > 0)
    if (this.syncIntervalMs > 0) {
      this.syncTimer = setInterval(() => {
        this.scheduledSync().catch((error: unknown) => {
          // Errors inside scheduledSync are handled internally;
          // this catch is a safety net for truly unexpected failures.
          logger.error(`${LOG_PREFIX} Unhandled error in scheduled sync`, error)
        })
      }, this.syncIntervalMs)
    }

    // Trigger initial sync after delay
    if (this.initialSyncDelayMs > 0) {
      setTimeout(() => {
        this.scheduledSync().catch((error: unknown) => {
          logger.error(`${LOG_PREFIX} Unhandled error in initial sync`, error)
        })
      }, this.initialSyncDelayMs)
    }

    logger.info(`${LOG_PREFIX} Started`, {
      isOnline: this.isOnline,
      syncIntervalMs: this.syncIntervalMs,
      hasNetworkMonitor: this.networkMonitor !== null,
    })
  }

  /**
   * Stop the SyncManager
   *
   * Cleans up all timers and resets state.
   * This method is idempotent — calling it multiple times has no effect.
   */
  stop(): void {
    if (!this.isStarted) {
      logger.warn(`${LOG_PREFIX} Not started, ignoring stop() call`)
      return
    }

    // Stop NetworkMonitor if provided
    if (this.networkMonitor) {
      this.networkMonitor.stop()
      this.networkMonitor.removeAllListeners()
    }

    // Remove powerMonitor resume listener
    this.cleanupPowerListener()

    // Clear AutoSaveManager listener reference
    if (this.autoSaveManagerRef && this.boundAutoSaveCommitted) {
      this.autoSaveManagerRef.off('committed', this.boundAutoSaveCommitted)
    }
    this.autoSaveManagerRef = null
    this.boundAutoSaveCommitted = null

    // Clear sync timer
    if (this.syncTimer !== null) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
    }

    // Clear all per-file debounce timers
    for (const [filepath, timeout] of this.saveTimeouts.entries()) {
      clearTimeout(timeout)
      logger.debug(`${LOG_PREFIX} Cleared debounce timer for: ${filepath}`)
    }
    this.saveTimeouts.clear()

    this.isStarted = false

    logger.info(`${LOG_PREFIX} Stopped`)
  }

  // ─── Network Status ───────────────────────────────────────────────────

  /**
   * Notify SyncManager that network status has changed
   *
   * Called by the main process when network connectivity changes
   * (e.g., via Electron's powerMonitor or net module events).
   *
   * @param online - Whether the system is now online
   */
  setNetworkStatus(online: boolean): void {
    const wasOnline = this.isOnline
    this.isOnline = online

    if (wasOnline !== online) {
      logger.info(`${LOG_PREFIX} Network status changed`, {
        wasOnline,
        isOnline: online,
      })

      if (online) {
        // Came back online — update status (will sync on next interval)
        this.updateStatus('idle')
      } else {
        // Went offline — update status
        this.updateStatus('offline')
      }
    }
  }

  /**
   * Get current network online status
   */
  getIsOnline(): boolean {
    return this.isOnline
  }

  /**
   * Get current sync status
   */
  getCurrentStatus(): SyncStatus {
    return this.currentStatus
  }

  /**
   * Check if SyncManager is currently started
   */
  getIsStarted(): boolean {
    return this.isStarted
  }

  // ─── Git Operation Queue ──────────────────────────────────────────────

  /**
   * Enqueue a Git operation for serial execution
   *
   * All Git operations (stageFile, commit, sync) MUST go through this queue
   * to prevent concurrent access to isomorphic-git's index, which would
   * cause corruption. Operations are executed in FIFO order.
   *
   * @param fn - Async function performing Git operations
   * @returns Promise resolving to the function's return value
   */
  private enqueueGitOp<T>(fn: () => Promise<T>): Promise<T> {
    const resultPromise = this.gitOpQueue.then(fn, fn)
    // Keep the queue chain alive regardless of success/failure
    this.gitOpQueue = resultPromise.then(
      () => { /* success — continue queue */ },
      () => { /* failure — swallow to keep chain alive */ },
    )
    return resultPromise
  }

  // ─── File Change Notification (Debounce) ──────────────────────────────

  /**
   * Notify SyncManager of a file change
   *
   * Applies per-file debouncing: if the same file changes multiple times
   * within saveDebounceMs, only the last change triggers an auto-commit.
   *
   * @param filepath - Relative path of the changed file (from workspace root)
   */
  notifyFileChanged(filepath: string): void {
    if (!this.isStarted) {
      logger.warn(`${LOG_PREFIX} Not started, ignoring file change: ${filepath}`)
      return
    }

    // Clear existing debounce timer for this file
    const existingTimeout = this.saveTimeouts.get(filepath)
    if (existingTimeout !== undefined) {
      clearTimeout(existingTimeout)
    }

    // Set new debounce timer
    const timeout = setTimeout(() => {
      // Remove from map after timer fires
      this.saveTimeouts.delete(filepath)

      this.autoCommitFile(filepath).catch((error: unknown) => {
        logger.error(`${LOG_PREFIX} Unhandled error in autoCommitFile`, {
          filepath,
          error,
        })
      })
    }, this.saveDebounceMs)

    this.saveTimeouts.set(filepath, timeout)

    logger.debug(`${LOG_PREFIX} File change debounced`, { filepath })
  }

  // ─── Auto-commit Logic ────────────────────────────────────────────────

  /**
   * Auto-commit a single file
   *
   * Stages and commits the specified file via the Git operation queue.
   * Handles:
   * - File existence check (deleted files are staged as removals)
   * - NOTHING_TO_COMMIT errors (silently ignored — file may not have actually changed)
   * - Git not initialized (logs error and returns)
   *
   * @param filepath - Relative path of the file to auto-commit
   */
  private async autoCommitFile(filepath: string): Promise<void> {
    logger.debug(`${LOG_PREFIX} Auto-committing file`, { filepath })

    try {
      await this.enqueueGitOp(async () => {
        // Stage the file (GitAbstraction handles both add and remove internally)
        await this.gitAbstraction.stageFile(filepath)

        // Commit with auto-save message
        await this.gitAbstraction.commit(`Auto-save: ${filepath}`)
      })

      logger.info(`${LOG_PREFIX} Auto-commit successful`, { filepath })
    } catch (error: unknown) {
      if (error instanceof GitAbstractionError) {
        // NOTHING_TO_COMMIT is a normal scenario — file may not have actually changed
        if (error.code === GitAbstractionErrorCode.NOTHING_TO_COMMIT) {
          logger.debug(`${LOG_PREFIX} Nothing to commit for file`, { filepath })
          return
        }

        // NOT_INITIALIZED means Git repo is not set up
        if (error.code === GitAbstractionErrorCode.NOT_INITIALIZED) {
          logger.warn(`${LOG_PREFIX} Git not initialized, skipping auto-commit`, {
            filepath,
          })
          return
        }
      }

      // All other errors: log and emit sync:error
      const errorObj = error instanceof Error ? error : new Error(String(error))
      logger.error(`${LOG_PREFIX} Auto-commit failed`, {
        filepath,
        error: errorObj.message,
      })
      this.emit('sync:error', errorObj)
    }
  }

  // ─── Scheduled Sync ───────────────────────────────────────────────────

  /**
   * Execute a scheduled sync cycle
   *
   * Called by the periodic interval timer. Skips if:
   * - Offline (isOnline === false)
   * - Already syncing (isSyncing === true)
   */
  private async scheduledSync(): Promise<void> {
    if (!this.isOnline) {
      logger.debug(`${LOG_PREFIX} Skipping scheduled sync — offline`)
      return
    }

    if (this.isSyncing) {
      logger.debug(`${LOG_PREFIX} Skipping scheduled sync — already syncing`)
      return
    }

    await this.performSync()
  }

  /**
   * Force a sync operation
   *
   * Unlike scheduledSync(), this method:
   * - Warns if offline but still attempts the sync (user explicitly requested it)
   * - Returns the SyncResult for the caller
   * - Rejects if already syncing
   *
   * @returns The result of the sync operation
   * @throws {Error} If a sync operation is already in progress
   */
  async forceSync(): Promise<SyncResult> {
    if (this.isSyncing) {
      const error = new Error('Sync operation already in progress')
      logger.warn(`${LOG_PREFIX} Force sync rejected — already syncing`)
      throw error
    }

    if (!this.isOnline) {
      logger.warn(`${LOG_PREFIX} Force sync requested while offline — attempting anyway`)
    }

    return this.performSync()
  }

  /**
   * Perform the actual sync operation
   *
   * Shared logic between scheduledSync() and forceSync().
   * Manages the isSyncing lock, emits lifecycle events, and updates status.
   * All Git operations are serialized through the operation queue.
   *
   * @returns The result of the sync operation
   */
  private async performSync(): Promise<SyncResult> {
    this.isSyncing = true
    this.emit('sync:start')
    this.updateStatus('syncing')

    try {
      const result = await this.enqueueGitOp(() => this.gitAbstraction.sync())

      if (result.success) {
        this.emit('sync:success')
        this.updateStatus('synced')
      } else if (result.hasConflicts) {
        const conflicts = result.conflicts ? [...result.conflicts] : []
        this.emit('sync:conflict', conflicts)
        this.updateStatus('conflict', undefined, conflicts)
      } else {
        const errorMsg = result.error ?? 'Unknown sync error'
        this.emit('sync:error', new Error(errorMsg))
        this.updateStatus('error', errorMsg)
      }

      return result
    } catch (error: unknown) {
      const errorObj = error instanceof Error ? error : new Error(String(error))
      logger.error(`${LOG_PREFIX} Sync operation failed`, {
        error: errorObj.message,
      })
      this.emit('sync:error', errorObj)
      this.updateStatus('error', errorObj.message)

      return { success: false, error: errorObj.message }
    } finally {
      this.isSyncing = false
      this.emit('sync:end')
    }
  }

  // ─── AutoSaveManager Integration (TASK006) ────────────────────────────

  /**
   * Connect AutoSaveManager's committed event to trigger sync
   *
   * Uses loose coupling — AutoSaveManager is injected, not a constructor dependency.
   * Listening to the 'committed' event (not 'save-failed') because only successful
   * commits need to trigger sync.
   *
   * @param autoSaveManager - AutoSaveManager instance to listen to
   */
  private autoSaveManagerRef: AutoSaveManager | null = null

  connectAutoSaveManager(autoSaveManager: AutoSaveManager): void {
    if (this.autoSaveManagerRef) {
      this.autoSaveManagerRef.off('committed', this.boundAutoSaveCommitted)
    }

    this.autoSaveManagerRef = autoSaveManager
    this.boundAutoSaveCommitted = () => {
      this.scheduleImmediateSync()
    }
    autoSaveManager.on('committed', this.boundAutoSaveCommitted)

    logger.info(`${LOG_PREFIX} AutoSaveManager connected`)
  }

  private boundAutoSaveCommitted: (() => void) | null = null

  // ─── Immediate Sync Scheduling (TASK006) ─────────────────────────────

  /**
   * Schedule an immediate sync with a short delay
   *
   * Called when AutoSaveManager commits changes. The 2-second delay allows
   * the AutoSaveManager's flush operation to complete fully before syncing.
   * Uses scheduledSync() internally which respects the isSyncing lock.
   */
  private scheduleImmediateSync(): void {
    if (!this.isOnline && this.networkMonitor && !this.networkMonitor.getIsOnline()) {
      return
    }

    setTimeout(() => {
      this.scheduledSync().catch((error: unknown) => {
        logger.error(`${LOG_PREFIX} Unhandled error in immediate sync`, error)
      })
    }, 2000)
  }

  // ─── NetworkMonitor Listeners (TASK006) ──────────────────────────────

  /**
   * Set up event listeners on the NetworkMonitor instance
   *
   * - reconnected: triggers sync after reconnectSyncDelayMs (default 5s)
   * - disconnected: updates status to offline immediately
   * - status-changed: syncs the isOnline flag
   */
  private setupNetworkMonitorListeners(): void {
    if (!this.networkMonitor) return

    this.networkMonitor.on('reconnected', () => {
      logger.info(`${LOG_PREFIX} Network reconnected, scheduling sync`)
      setTimeout(() => {
        this.scheduledSync().catch((error: unknown) => {
          logger.error(`${LOG_PREFIX} Unhandled error in reconnect sync`, error)
        })
      }, this.reconnectSyncDelayMs)
    })

    this.networkMonitor.on('disconnected', () => {
      this.isOnline = false
      this.updateStatus('offline')
    })

    this.networkMonitor.on('status-changed', (online: boolean) => {
      this.isOnline = online
    })
  }

  // ─── Power Monitor Listeners (TASK006) ───────────────────────────────

  /**
   * Set up system power event listeners via Electron's powerMonitor
   *
   * On resume from sleep, triggers sync after a 3-second delay to allow
   * the network adapter to reconnect. Uses dynamic require() to avoid
   * errors in non-Electron environments (e.g., unit tests).
   */
  private setupPowerListeners(): void {
    this.cleanupPowerListener()

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { powerMonitor } = require('electron') as { powerMonitor: Electron.PowerMonitor }

      const handler = () => {
        logger.info(`${LOG_PREFIX} System resumed from sleep`)
        setTimeout(() => {
          this.scheduledSync().catch((error: unknown) => {
            logger.error(`${LOG_PREFIX} Unhandled error in resume sync`, error)
          })
        }, 3000)
      }

      powerMonitor.on('resume', handler)
      this.powerResumeHandler = () => {
        powerMonitor.off('resume', handler)
      }
    } catch {
      logger.warn(`${LOG_PREFIX} powerMonitor unavailable (non-Electron environment)`)
    }
  }

  private cleanupPowerListener(): void {
    if (this.powerResumeHandler) {
      this.powerResumeHandler()
      this.powerResumeHandler = null
    }
  }

  // ─── Status Management ────────────────────────────────────────────────

  /**
   * Update the current sync status and emit status:changed event
   *
   * @param status - New sync status
   * @param message - Optional error message (for 'error' status)
   * @param conflictFiles - Optional list of conflicting files (for 'conflict' status)
   */
  private updateStatus(
    status: SyncStatus,
    message?: string,
    conflictFiles?: string[],
  ): void {
    this.currentStatus = status

    const data: SyncStatusData = {
      status,
      timestamp: Date.now(),
      ...(message !== undefined && { message }),
      ...(conflictFiles !== undefined && { conflictFiles }),
    }

    this.emit('status:changed', data)

    logger.debug(`${LOG_PREFIX} Status changed`, { status, message })
  }
}
