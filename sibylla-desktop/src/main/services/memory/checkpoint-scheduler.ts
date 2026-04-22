import { promises as fs } from 'fs'
import * as path from 'path'
import { logger } from '../../utils/logger'
import { estimateTokensFromEntries } from './utils'
import type { MemoryManager } from '../memory-manager'
import type { MemoryExtractor } from './memory-extractor'
import type { SimilarityIndexProvider, MemoryConfig, ExtractionReport } from './types'
import type { CheckpointTrigger, CheckpointRecord } from './types'
import type { EvolutionLog } from './evolution-log'
import type { MemoryEventBus } from './memory-event-bus'

const CHECKPOINTS_FILE = 'checkpoints.jsonl'
const DEFAULT_RETRY_DELAYS = [1000, 5000, 30000]

export class CheckpointScheduler {
  private lastCheckpoint: Date = new Date(0)
  private interactionCount: number = 0
  private isRunning: boolean = false
  private queue: CheckpointTrigger[] = []
  private readonly MAX_QUEUE = 3
  private currentRecord?: CheckpointRecord
  private abortFlag: boolean = false
  private timerRef?: ReturnType<typeof setInterval>
  private readonly workspaceRoot: string
  private readonly retryDelays: number[]

  /** Tracked listeners for targeted cleanup in stop() */
  private readonly boundListeners: Array<{ event: string; fn: (...args: unknown[]) => void }> = []

  constructor(
    private readonly memoryManager: MemoryManager,
    private readonly extractor: MemoryExtractor,
    private readonly indexer: (SimilarityIndexProvider & { indexReport?: (report: ExtractionReport) => Promise<void> }) | null,
    private readonly evolutionLog: EvolutionLog,
    private readonly compressor: { compress: () => Promise<unknown> } | null,
    private readonly eventBus: MemoryEventBus,
    private readonly config: MemoryConfig,
    private readonly loggerInstance: typeof logger = logger,
    retryDelays?: number[],
  ) {
    this.workspaceRoot = this.memoryManager.getWorkspacePathOrFail()
    this.retryDelays = retryDelays ?? DEFAULT_RETRY_DELAYS
  }

  start(): void {
    this.timerRef = setInterval(() => this.maybeRun('timer'), 60 * 1000)

    const onUserInteraction = () => {
      this.interactionCount += 1
      if (this.interactionCount >= this.config.interactionThreshold) {
        this.maybeRun('interaction_count')
      }
    }
    const onSpecFileMajorEdit = () => { this.maybeRun('key_event') }
    const onGuardrailRepeated = () => { this.maybeRun('key_event') }
    const onManualCheckpoint = () => { this.maybeRun('manual') }

    this.eventBus.on('user-interaction', onUserInteraction)
    this.eventBus.on('spec-file-major-edit', onSpecFileMajorEdit)
    this.eventBus.on('guardrail-repeated', onGuardrailRepeated)
    this.eventBus.on('memory:manual-checkpoint', onManualCheckpoint)

    this.boundListeners.push(
      { event: 'user-interaction', fn: onUserInteraction },
      { event: 'spec-file-major-edit', fn: onSpecFileMajorEdit },
      { event: 'guardrail-repeated', fn: onGuardrailRepeated },
      { event: 'memory:manual-checkpoint', fn: onManualCheckpoint },
    )

    this.loggerInstance.info('memory.checkpoint.scheduler.started')
  }

  async stop(): Promise<void> {
    if (this.timerRef !== undefined) {
      clearInterval(this.timerRef)
      this.timerRef = undefined
    }

    // Remove only the listeners this scheduler registered
    for (const { event, fn } of this.boundListeners) {
      this.eventBus.off(event, fn)
    }
    this.boundListeners.length = 0

    if (this.isRunning) {
      this.abortFlag = true
      const timeout = 30_000
      const start = Date.now()
      while (this.isRunning && Date.now() - start < timeout) {
        await this.sleep(100)
      }
    }

    this.loggerInstance.info('memory.checkpoint.scheduler.stopped')
  }

  /** @internal — Exposed for testing. Evaluates the trigger and either runs or queues. */
  async maybeRun(trigger: CheckpointTrigger): Promise<void> {
    if (trigger === 'timer') {
      const elapsed = Date.now() - this.lastCheckpoint.getTime()
      if (elapsed < this.config.checkpointIntervalMs) {
        return
      }
    }

    if (this.isRunning) {
      if (this.queue.length < this.MAX_QUEUE) {
        this.queue.push(trigger)
      } else {
        this.loggerInstance.warn('memory.checkpoint.queue_full_discarded', { trigger })
      }
      return
    }

    await this.run(trigger)

    // Drain the full queue after the initial run completes
    while (this.queue.length > 0) {
      const next = this.queue.shift()!
      await this.run(next)
    }
  }

  private async run(trigger: CheckpointTrigger): Promise<void> {
    this.isRunning = true
    this.abortFlag = false

    const record: CheckpointRecord = {
      id: this.generateId(),
      trigger,
      startedAt: new Date().toISOString(),
      status: 'running',
    }
    this.currentRecord = record

    this.eventBus.emitCheckpointStarted(record)

    try {
      const logs = await this.memoryManager.getLogsSince(this.lastCheckpoint.toISOString())

      if (logs.length === 0) {
        record.status = 'success'
        record.completedAt = new Date().toISOString()
        this.loggerInstance.info('memory.checkpoint.no_logs', { trigger })
        return
      }

      if (this.abortFlag) {
        record.status = 'aborted'
        record.completedAt = new Date().toISOString()
        return
      }

      const existingMemory = await this.memoryManager.getAllEntries()

      const workspaceContext = await this.memoryManager.getWorkspaceContext()
      const report = await this.withRetry(
        () => this.extractor.extract({
          logs,
          existingMemory,
          workspaceContext,
        }),
        3,
      )

      if (this.abortFlag) {
        record.status = 'aborted'
        record.completedAt = new Date().toISOString()
        return
      }

      await this.memoryManager.applyExtractionReport(report)

      if (this.indexer?.isAvailable() && this.indexer.indexReport) {
        try {
          await this.indexer.indexReport(report)
        } catch (idxErr) {
          this.loggerInstance.warn('memory.checkpoint.index_failed', {
            err: idxErr instanceof Error ? idxErr.message : String(idxErr),
          })
        }
      }

      await this.evolutionLog.append({
        id: `ev-chk-${Date.now()}`,
        timestamp: new Date().toISOString(),
        type: 'add',
        entryId: record.id,
        section: 'project_convention',
        trigger: { source: 'checkpoint', checkpointId: record.id },
        rationale: `checkpoint triggered by ${trigger}`,
      })

      this.lastCheckpoint = new Date()
      this.interactionCount = 0

      record.status = 'success'
      record.report = report
      record.completedAt = new Date().toISOString()

      const snapshot = await this.memoryManager.getAllEntries()
      const totalTokens = estimateTokensFromEntries(snapshot)
      if (totalTokens > this.config.compressionThreshold && this.compressor) {
        try {
          await this.compressor.compress()
        } catch (compressErr) {
          this.loggerInstance.error('memory.checkpoint.compression_failed', {
            err: compressErr instanceof Error ? compressErr.message : String(compressErr),
          })
        }
      }

      this.loggerInstance.info('memory.checkpoint.completed', {
        trigger,
        added: report.added.length,
        merged: report.merged.length,
        discarded: report.discarded.length,
        durationMs: report.durationMs,
      })
    } catch (err) {
      record.status = 'failed'
      record.errorMessage = err instanceof Error ? err.message : String(err)
      record.completedAt = new Date().toISOString()
      this.loggerInstance.error('memory.checkpoint.failed', {
        trigger,
        err: record.errorMessage,
      })
      this.eventBus.emitCheckpointFailed(record)
    } finally {
      await this.persistCheckpointRecord(record)
      // Only emit completed for non-failure statuses to avoid double-signal
      if (record.status !== 'failed') {
        this.eventBus.emitCheckpointCompleted(record)
      }
      this.isRunning = false
      this.currentRecord = undefined
    }
  }

  private async withRetry<T>(fn: () => Promise<T>, maxAttempts: number): Promise<T> {
    let lastErr: unknown

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (this.abortFlag) {
        throw new Error('Checkpoint aborted')
      }
      try {
        return await fn()
      } catch (err) {
        lastErr = err
        if (attempt < maxAttempts - 1) {
          this.loggerInstance.warn('memory.checkpoint.retry', {
            attempt: attempt + 1,
            maxAttempts,
            err: err instanceof Error ? err.message : String(err),
          })
          await this.sleep(this.retryDelays[attempt] ?? 1000)
        }
      }
    }
    throw lastErr
  }

  abortCurrentRun(): void {
    this.abortFlag = true
  }

  async triggerManualCheckpoint(): Promise<void> {
    await this.maybeRun('manual')
  }

  getLastCheckpoint(): Date {
    return this.lastCheckpoint
  }

  isCheckpointRunning(): boolean {
    return this.isRunning
  }

  /** @internal — Exposed for testing. Returns the current queue depth. */
  getQueueSize(): number {
    return this.queue.length
  }

  private generateId(): string {
    const hex = Math.random().toString(16).slice(2, 6)
    return `chk-${Date.now()}-${hex}`
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async persistCheckpointRecord(record: CheckpointRecord): Promise<void> {
    try {
      const dirPath = path.join(this.workspaceRoot, '.sibylla', 'memory')
      await fs.mkdir(dirPath, { recursive: true })
      const filePath = path.join(dirPath, CHECKPOINTS_FILE)
      const line = JSON.stringify(record) + '\n'
      // Atomic append: read existing, append new line, write to temp, rename
      const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`
      let existing = ''
      try {
        existing = await fs.readFile(filePath, 'utf-8')
      } catch {
        // File doesn't exist yet — that's fine
      }
      await fs.writeFile(tempPath, existing + line, 'utf-8')
      await fs.rename(tempPath, filePath)
    } catch (err) {
      this.loggerInstance.error('memory.checkpoint.persist_failed', {
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }
}
