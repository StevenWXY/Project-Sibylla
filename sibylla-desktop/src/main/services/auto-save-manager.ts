/**
 * AutoSaveManager Service
 *
 * Handles automatic file saving with debouncing, batch aggregation,
 * and implicit Git commits. Follows CLAUDE.md "Git 不可见" philosophy —
 * users only see "已保存", no Git terminology.
 *
 * Data flow:
 *   Renderer file:notifyChange → onFileChanged() → debounce(1s) + batchWindow(5s)
 *   → flush() → saveWithRetry(fileManager.writeFile) × N → stageFile × N → commit
 *   → emit events → IPC broadcast to renderer
 *
 * Concurrency:
 *   Git operations are serialized through an internal Promise chain
 *   to prevent isomorphic-git index corruption.
 *
 * @see plans/phase1-task005-auto-save-commit-plan.md for full design rationale
 */

import { EventEmitter } from 'events'
import path from 'path'
import { logger } from '../utils/logger'
import type { FileManager } from './file-manager'
import type { GitAbstraction } from './git-abstraction'
import type {
  AutoSaveConfig,
  AutoSaveManagerEvents,
  BatchCommitResult,
  SaveResult,
} from './types/auto-save.types'
import { DEFAULT_AUTO_SAVE_CONFIG } from './types/auto-save.types'
import type { TypedEventEmitter } from './utils/typed-event-emitter'

const LOG_PREFIX = '[AutoSaveManager]'

/**
 * AutoSaveManager — automatic save and implicit commit orchestrator
 *
 * Lifecycle:
 *   new AutoSaveManager(config, fileManager, gitAbstraction, userName)
 *   → onFileChanged()  — called by IPC handler when editor content changes
 *   → destroy()        — cleans up timers and listeners
 *
 * Events emitted (see AutoSaveManagerEvents):
 *   committed, save-failed, error, retry
 */
export class AutoSaveManager extends (EventEmitter as new () => TypedEventEmitter<AutoSaveManagerEvents> & EventEmitter) {
  private readonly fileManager: FileManager
  private readonly gitAbstraction: GitAbstraction
  private readonly config: AutoSaveConfig
  private readonly userName: string

  private readonly pendingFiles: Map<string, string> = new Map()

  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private batchTimer: ReturnType<typeof setTimeout> | null = null

  private readonly contentCache: Map<string, string> = new Map()

  private gitOpQueue: Promise<void> = Promise.resolve()

  private destroyed = false

  constructor(
    config: Partial<AutoSaveConfig>,
    fileManager: FileManager,
    gitAbstraction: GitAbstraction,
    userName: string,
  ) {
    super()

    this.config = { ...DEFAULT_AUTO_SAVE_CONFIG, ...config }
    this.fileManager = fileManager
    this.gitAbstraction = gitAbstraction
    this.userName = userName

    logger.info(`${LOG_PREFIX} Initialized`, {
      debounceMs: this.config.debounceMs,
      batchWindowMs: this.config.batchWindowMs,
      maxRetries: this.config.maxRetries,
      userName: this.userName,
    })
  }

  /**
   * Called when a file's content changes in the editor.
   *
   * Starts a debounce timer (1s) and a batch window timer (5s).
   * - If the user stops typing for 1s, the debounce timer fires and flushes.
   * - If the user keeps typing across files, the batch window forces a flush after 5s.
   */
  onFileChanged(filePath: string, content: string): void {
    if (this.destroyed) {
      logger.warn(`${LOG_PREFIX} Manager destroyed, ignoring file change: ${filePath}`)
      return
    }

    this.pendingFiles.set(filePath, content)
    this.contentCache.set(filePath, content)

    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer)
    }

    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      if (this.batchTimer !== null) {
        clearTimeout(this.batchTimer)
        this.batchTimer = null
      }
      this.flush().catch((error: unknown) => {
        logger.error(`${LOG_PREFIX} Unhandled error in flush`, error instanceof Error ? error : new Error(String(error)))
      })
    }, this.config.debounceMs)

    if (this.batchTimer === null && this.pendingFiles.size === 1) {
      this.batchTimer = setTimeout(() => {
        this.batchTimer = null
        this.flush().catch((error: unknown) => {
          logger.error(`${LOG_PREFIX} Unhandled error in batch flush`, error instanceof Error ? error : new Error(String(error)))
        })
      }, this.config.batchWindowMs)
    }

    logger.debug(`${LOG_PREFIX} File change received`, {
      filePath,
      pendingCount: this.pendingFiles.size,
    })
  }

  /**
   * Flush all pending file saves and create a batch commit.
   *
   * Snapshots pendingFiles immediately, allowing new changes to accumulate
   * during the flush operation.
   */
  private async flush(): Promise<void> {
    if (this.pendingFiles.size === 0) return

    const files = new Map(this.pendingFiles)
    this.pendingFiles.clear()

    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    if (this.batchTimer !== null) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }

    logger.info(`${LOG_PREFIX} Flushing ${files.size} file(s)`)

    const results: SaveResult[] = []

    for (const [filePath, content] of files) {
      const result = await this.saveWithRetry(filePath, content)
      results.push(result)
    }

    const succeededFiles = results.filter(r => r.success).map(r => r.filePath)
    if (succeededFiles.length > 0) {
      const message = this.generateCommitMessage(succeededFiles)
      try {
        const oid = await this.enqueueGitOp(async () => {
          for (const filePath of succeededFiles) {
            await this.gitAbstraction.stageFile(filePath)
          }
          return this.gitAbstraction.commit(message)
        })
        const batchResult: BatchCommitResult = {
          commitOid: oid,
          files: succeededFiles,
          message,
        }
        this.emit('committed', batchResult)
        logger.info(`${LOG_PREFIX} Batch commit successful`, {
          oid: oid.slice(0, 7),
          fileCount: succeededFiles.length,
          message,
        })
      } catch (error: unknown) {
        const commitError = error instanceof Error ? error : new Error(String(error))
        this.emit('error', {
          type: 'commit' as const,
          error: commitError,
        })
        logger.error(`${LOG_PREFIX} Batch commit failed`, commitError)
      }
    }

    const failedResults = results.filter(r => !r.success)
    if (failedResults.length > 0) {
      this.emit('save-failed', failedResults)
      logger.warn(`${LOG_PREFIX} ${failedResults.length} file(s) failed to save`, {
        failedFiles: failedResults.map(r => r.filePath),
      })
    }
  }

  /**
   * Save a single file with retry logic.
   *
   * Retries up to maxRetries times with linear backoff (1s, 2s, 3s).
   */
  private async saveWithRetry(
    filePath: string,
    content: string,
    attempt: number = 1,
  ): Promise<SaveResult> {
    try {
      await this.fileManager.writeFile(filePath, content)
      return { filePath, success: true }
    } catch (error: unknown) {
      if (attempt < this.config.maxRetries) {
        this.emit('retry', { filePath, attempt })
        logger.info(`${LOG_PREFIX} Retrying save`, { filePath, attempt })

        await new Promise<void>(resolve => {
          setTimeout(resolve, attempt * 1000)
        })

        return this.saveWithRetry(filePath, content, attempt + 1)
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`${LOG_PREFIX} Save failed after ${attempt} attempt(s)`, {
        filePath,
        error: errorMessage,
      })
      return { filePath, success: false, error: errorMessage }
    }
  }

  /**
   * Generate a human-readable commit message.
   *
   * Format:
   * - Single file:  [userName] 更新 prd.md
   * - 2-3 files:    [userName] 更新 prd.md, design.md
   * - 4+ files:     [userName] 更新 5 个文件
   */
  private generateCommitMessage(files: string[]): string {
    if (files.length === 1) {
      return `[${this.userName}] 更新 ${path.basename(files[0])}`
    }
    if (files.length <= 3) {
      const names = files.map(f => path.basename(f)).join(', ')
      return `[${this.userName}] 更新 ${names}`
    }
    return `[${this.userName}] 更新 ${files.length} 个文件`
  }

  /**
   * Manual retry for a failed save.
   *
   * Called by IPC handler when user clicks the retry button.
   */
  async retrySave(filePath: string): Promise<void> {
    const content = this.contentCache.get(filePath)
    if (content === undefined) {
      throw new Error(`No cached content for file: ${filePath}`)
    }

    logger.info(`${LOG_PREFIX} Manual retry for file`, { filePath })

    const result = await this.saveWithRetry(filePath, content)
    if (result.success) {
      const message = this.generateCommitMessage([filePath])
      try {
        const oid = await this.enqueueGitOp(async () => {
          await this.gitAbstraction.stageFile(filePath)
          return this.gitAbstraction.commit(message)
        })
        const batchResult: BatchCommitResult = {
          commitOid: oid,
          files: [filePath],
          message,
        }
        this.emit('committed', batchResult)
      } catch (error: unknown) {
        this.emit('error', {
          type: 'commit' as const,
          error: error instanceof Error ? error : new Error(String(error)),
        })
      }
    } else {
      this.emit('save-failed', [result])
    }
  }

  /**
   * Enqueue a Git operation for serial execution.
   *
   * Prevents concurrent Git operations from corrupting isomorphic-git's index.
   */
  private enqueueGitOp<T>(fn: () => Promise<T>): Promise<T> {
    const resultPromise = this.gitOpQueue.then(fn, fn)
    this.gitOpQueue = resultPromise.then(
      () => { /* success — continue queue */ },
      () => { /* failure — swallow to keep chain alive */ },
    )
    return resultPromise
  }

  /**
   * Clean up all resources.
   *
   * Clears timers, pending files, content cache, and event listeners.
   */
  destroy(): void {
    this.destroyed = true

    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
    if (this.batchTimer !== null) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }

    this.pendingFiles.clear()
    this.contentCache.clear()
    this.removeAllListeners()

    logger.info(`${LOG_PREFIX} Destroyed`)
  }
}
