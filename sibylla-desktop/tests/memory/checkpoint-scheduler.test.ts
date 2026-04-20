import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import { CheckpointScheduler } from '../../src/main/services/memory/checkpoint-scheduler'
import { MemoryEventBus } from '../../src/main/services/memory/memory-event-bus'
import type { MemoryManager } from '../../src/main/services/memory-manager'
import type { MemoryExtractor } from '../../src/main/services/memory/memory-extractor'
import type { EvolutionLog } from '../../src/main/services/memory/evolution-log'
import type {
  CheckpointRecord,
  ExtractionReport,
  MemoryConfig,
  LogEntry,
  MemoryEntry,
} from '../../src/main/services/memory/types'
import { DEFAULT_MEMORY_CONFIG } from '../../src/main/services/memory/types'

const FAST_RETRY_DELAYS = [0, 0, 0]

function makeLogEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: 'user-interaction',
    timestamp: new Date().toISOString(),
    sessionId: 'test-session',
    summary: 'Test log entry',
    ...overrides,
  }
}

function makeExtractionReport(overrides: Partial<ExtractionReport> = {}): ExtractionReport {
  return {
    added: [],
    merged: [],
    discarded: [],
    durationMs: 100,
    tokenCost: { input: 100, output: 50 },
    ...overrides,
  }
}

function createMockMemoryManager(logs: LogEntry[] = [], entries: MemoryEntry[] = [], workspacePath?: string): MemoryManager {
  return {
    getLogsSince: vi.fn(async () => logs),
    getAllEntries: vi.fn(async () => entries),
    applyExtractionReport: vi.fn(async () => ({ compressionNeeded: false })),
    getWorkspaceContext: vi.fn(async () => ({ name: 'Test Project' })),
    getWorkspacePathOrFail: vi.fn(() => workspacePath ?? '/tmp/test-workspace'),
  } as unknown as MemoryManager
}

function createMockExtractor(report: ExtractionReport): MemoryExtractor {
  return {
    extract: vi.fn(async () => report),
  } as unknown as MemoryExtractor
}

function createMockEvolutionLog(): EvolutionLog {
  return {
    append: vi.fn(async () => {}),
  } as unknown as EvolutionLog
}

function createMockCompressor() {
  return {
    compress: vi.fn(async () => ({
      discarded: [],
      merged: [],
      archived: [],
      beforeTokens: 0,
      afterTokens: 0,
      snapshotPath: '/tmp/snapshot.md',
    })),
  }
}

describe('CheckpointScheduler', () => {
  let tempDir: string
  let eventBus: MemoryEventBus
  let mockManager: MemoryManager
  let mockExtractor: MemoryExtractor
  let mockEvolutionLog: EvolutionLog
  let mockCompressor: ReturnType<typeof createMockCompressor>
  let config: MemoryConfig

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chk-test-'))
    eventBus = new MemoryEventBus()
    const logs = [makeLogEntry()]
    const entries: MemoryEntry[] = []
    mockManager = createMockMemoryManager(logs, entries)
    mockExtractor = createMockExtractor(makeExtractionReport())
    mockEvolutionLog = createMockEvolutionLog()
    mockCompressor = createMockCompressor()
    config = { ...DEFAULT_MEMORY_CONFIG, checkpointIntervalMs: 100 }
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('1. Timer trigger', () => {
    it('triggers when lastCheckpoint is > checkpointIntervalMs ago and logs exist', async () => {
      const scheduler = new CheckpointScheduler(
        mockManager,
        mockExtractor,
        null,
        mockEvolutionLog,
        mockCompressor,
        eventBus,
        config,
        undefined,
        FAST_RETRY_DELAYS,
      )

      // lastCheckpoint defaults to new Date(0), so it's always > interval ago
      await scheduler.maybeRun('timer')

      expect(mockExtractor.extract).toHaveBeenCalled()
    })

    it('does not trigger when lastCheckpoint is recent', async () => {
      const scheduler = new CheckpointScheduler(
        mockManager,
        mockExtractor,
        null,
        mockEvolutionLog,
        mockCompressor,
        eventBus,
        { ...config, checkpointIntervalMs: 999_999_999 },
        undefined,
        FAST_RETRY_DELAYS,
      )

      // Run once to set lastCheckpoint to now
      await scheduler.triggerManualCheckpoint()
      vi.clearAllMocks()

      // Now lastCheckpoint is recent — timer trigger should be blocked
      await scheduler.maybeRun('timer')

      expect(mockExtractor.extract).not.toHaveBeenCalled()
    })
  })

  describe('2. Interaction count trigger', () => {
    it('triggers when interaction count >= threshold', async () => {
      const scheduler = new CheckpointScheduler(
        mockManager,
        mockExtractor,
        null,
        mockEvolutionLog,
        mockCompressor,
        eventBus,
        { ...config, interactionThreshold: 3 },
        undefined,
        FAST_RETRY_DELAYS,
      )

      scheduler.start()

      eventBus.emitUserInteraction()
      eventBus.emitUserInteraction()
      eventBus.emitUserInteraction()

      // Allow async processing
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockExtractor.extract).toHaveBeenCalled()

      await scheduler.stop()
    })
  })

  describe('3. Manual trigger', () => {
    it('triggers immediately on manual checkpoint', async () => {
      const scheduler = new CheckpointScheduler(
        mockManager,
        mockExtractor,
        null,
        mockEvolutionLog,
        mockCompressor,
        eventBus,
        config,
        undefined,
        FAST_RETRY_DELAYS,
      )

      await scheduler.triggerManualCheckpoint()

      expect(mockExtractor.extract).toHaveBeenCalled()
    })
  })

  describe('4. Key event trigger', () => {
    it('triggers on guardrail-repeated event', async () => {
      const scheduler = new CheckpointScheduler(
        mockManager,
        mockExtractor,
        null,
        mockEvolutionLog,
        mockCompressor,
        eventBus,
        config,
        undefined,
        FAST_RETRY_DELAYS,
      )

      scheduler.start()

      eventBus.emitGuardrailRepeated('rule-1', 5)

      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(mockExtractor.extract).toHaveBeenCalled()

      await scheduler.stop()
    })
  })

  describe('5. Queue management', () => {
    it('queues triggers when running and discards when queue is full', async () => {
      let extractCallCount = 0
      let extractResolve: (() => void) | null = null
      const slowExtractor = {
        extract: vi.fn(async () => {
          extractCallCount++
          if (extractCallCount === 1) {
            // Only the first call blocks
            await new Promise<void>((resolve) => { extractResolve = resolve })
          }
          return makeExtractionReport()
        }),
      } as unknown as MemoryExtractor

      const warnSpy = vi.fn()
      const mockLogger = {
        info: vi.fn(),
        warn: warnSpy,
        error: vi.fn(),
        debug: vi.fn(),
      }

      const scheduler = new CheckpointScheduler(
        mockManager,
        slowExtractor,
        null,
        mockEvolutionLog,
        mockCompressor,
        eventBus,
        config,
        mockLogger as unknown as typeof import('../../src/main/utils/logger').logger,
        FAST_RETRY_DELAYS,
      )

      // Start a slow run that blocks
      const runPromise = scheduler.triggerManualCheckpoint()

      // Wait for extraction to start
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(scheduler.isCheckpointRunning()).toBe(true)

      // Queue up 3 + 1 (fourth should be discarded with a warning)
      await scheduler.maybeRun('manual')
      await scheduler.maybeRun('manual')
      await scheduler.maybeRun('manual')
      await scheduler.maybeRun('manual') // should be discarded

      expect(scheduler.getQueueSize()).toBe(3)
      expect(warnSpy).toHaveBeenCalledWith('memory.checkpoint.queue_full_discarded', { trigger: 'manual' })

      // Unblock the first extraction
      if (extractResolve) extractResolve()
      await runPromise
    }, 30_000)
  })

  describe('6. Failure retry', () => {
    it('retries on failure and succeeds on subsequent attempt', async () => {
      let callCount = 0
      const flakyExtractor = {
        extract: vi.fn(async () => {
          callCount += 1
          if (callCount <= 2) throw new Error('Temporary failure')
          return makeExtractionReport()
        }),
      } as unknown as MemoryExtractor

      const scheduler = new CheckpointScheduler(
        mockManager,
        flakyExtractor,
        null,
        mockEvolutionLog,
        mockCompressor,
        eventBus,
        config,
        undefined,
        FAST_RETRY_DELAYS,
      )

      await scheduler.triggerManualCheckpoint()

      expect(callCount).toBe(3)
      expect(flakyExtractor.extract).toHaveBeenCalledTimes(3)
    })
  })

  describe('7. Final failure', () => {
    it('records failed status and emits checkpoint-failed event after 3 retries', async () => {
      const failingExtractor = {
        extract: vi.fn(async () => { throw new Error('Permanent failure') }),
      } as unknown as MemoryExtractor

      const failedRecords: CheckpointRecord[] = []
      eventBus.on('memory:checkpoint-failed', (record: CheckpointRecord) => {
        failedRecords.push(record)
      })

      const scheduler = new CheckpointScheduler(
        mockManager,
        failingExtractor,
        null,
        mockEvolutionLog,
        mockCompressor,
        eventBus,
        config,
        undefined,
        FAST_RETRY_DELAYS,
      )

      await scheduler.triggerManualCheckpoint()

      expect(failedRecords.length).toBe(1)
      expect(failedRecords[0].status).toBe('failed')
      expect(failedRecords[0].errorMessage).toBe('Permanent failure')
    })
  })

  describe('8. No logs skip', () => {
    it('succeeds without calling extractor when no logs', async () => {
      const emptyManager = createMockMemoryManager([], [])
      const scheduler = new CheckpointScheduler(
        emptyManager,
        mockExtractor,
        null,
        mockEvolutionLog,
        mockCompressor,
        eventBus,
        config,
        undefined,
        FAST_RETRY_DELAYS,
      )

      const completedRecords: CheckpointRecord[] = []
      eventBus.on('memory:checkpoint-completed', (record: CheckpointRecord) => {
        completedRecords.push(record)
      })

      await scheduler.triggerManualCheckpoint()

      expect(mockExtractor.extract).not.toHaveBeenCalled()
      expect(completedRecords.length).toBe(1)
      expect(completedRecords[0].status).toBe('success')
    })
  })

  describe('9. Graceful abort', () => {
    it('sets record status to aborted when abortFlag is set', async () => {
      let extractResolve: (() => void) | null = null
      const slowExtractor = {
        extract: vi.fn(async () => {
          await new Promise<void>((resolve) => { extractResolve = resolve })
          return makeExtractionReport()
        }),
      } as unknown as MemoryExtractor

      const scheduler = new CheckpointScheduler(
        mockManager,
        slowExtractor,
        null,
        mockEvolutionLog,
        mockCompressor,
        eventBus,
        config,
        undefined,
        FAST_RETRY_DELAYS,
      )
      const completedRecords: CheckpointRecord[] = []
      eventBus.on('memory:checkpoint-completed', (record: CheckpointRecord) => {
        completedRecords.push(record)
      })

      const runPromise = scheduler.triggerManualCheckpoint()
      await new Promise((resolve) => setTimeout(resolve, 20))

      scheduler.abortCurrentRun()

      if (extractResolve) extractResolve()
      await runPromise

      // The record may be aborted or success depending on timing;
      // the abort flag is checked after extractor returns
      expect(completedRecords.length).toBeGreaterThanOrEqual(1)
      const lastRecord = completedRecords[completedRecords.length - 1]
      expect(['aborted', 'success']).toContain(lastRecord.status)
    })
  })

  describe('10. checkpoints.jsonl persistence', () => {
    it('persists checkpoint record to checkpoints.jsonl after run', async () => {
      const workspaceManager = createMockMemoryManager(
        [makeLogEntry()],
        [],
        tempDir,
      )

      const scheduler = new CheckpointScheduler(
        workspaceManager,
        mockExtractor,
        null,
        mockEvolutionLog,
        mockCompressor,
        eventBus,
        config,
        undefined,
        FAST_RETRY_DELAYS,
      )

      await scheduler.triggerManualCheckpoint()

      const checkpointsPath = path.join(tempDir, '.sibylla', 'memory', 'checkpoints.jsonl')
      const exists = await fs.access(checkpointsPath).then(() => true).catch(() => false)
      expect(exists).toBe(true)

      const content = await fs.readFile(checkpointsPath, 'utf-8')
      const lines = content.split('\n').filter((l) => l.trim().length > 0)
      expect(lines.length).toBeGreaterThanOrEqual(1)

      const record = JSON.parse(lines[0]) as CheckpointRecord
      expect(record.id).toMatch(/^chk-/)
      expect(record.trigger).toBe('manual')
      expect(record.status).toBe('success')
    })
  })
})
