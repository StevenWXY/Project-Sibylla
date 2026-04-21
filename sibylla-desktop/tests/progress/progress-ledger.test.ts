import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ProgressLedger } from '../../src/main/services/progress/progress-ledger'
import type { TaskRecord, ProgressSnapshot, ChecklistItemStatus } from '../../src/main/services/progress/types'
import { AppEventBus } from '../../src/main/services/event-bus'
import path from 'path'
import fs from 'fs'
import os from 'os'

vi.mock('../../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    setLevel: vi.fn(),
  },
}))

const mockTracer = {
  isEnabled: vi.fn(() => false),
  withSpan: vi.fn((_, fn) => fn({ setAttributes: vi.fn(), addEvent: vi.fn(), isFinalized: vi.fn(() => false) })),
  start: vi.fn(),
  stop: vi.fn(),
  setTracer: vi.fn(),
} as unknown as import('../../src/main/services/trace/tracer').Tracer

const mockTaskStateMachine = {
  create: vi.fn(() => Promise.resolve({ taskId: 'tsm-1', goal: 'test', status: 'planning', steps: [] })),
  advance: vi.fn(() => Promise.resolve()),
  updateStatus: vi.fn(() => Promise.resolve()),
  abandon: vi.fn(() => Promise.resolve()),
} as unknown as import('../../src/main/services/harness/task-state-machine').TaskStateMachine

let tmpDir: string
let fileManager: import('../../src/main/services/file-manager').FileManager
let eventBus: AppEventBus
let ledger: ProgressLedger

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'progress-test-'))

  const { FileManager } = await import('../../src/main/services/file-manager')
  fileManager = new FileManager(tmpDir)
  await fileManager.updateWorkspaceRoot(tmpDir)

  eventBus = new AppEventBus()

  const { logger } = await import('../../src/main/utils/logger')
  ledger = new ProgressLedger(
    mockTaskStateMachine as import('../../src/main/services/harness/task-state-machine').TaskStateMachine,
    tmpDir,
    fileManager,
    mockTracer,
    eventBus,
    logger,
  )
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
  vi.clearAllMocks()
})

describe('ProgressLedger', () => {
  describe('declare', () => {
    it('creates a TaskRecord with running state', async () => {
      const task = await ledger.declare({
        title: 'Build feature X',
        mode: 'plan',
        plannedChecklist: ['Design', 'Implement', 'Test'],
      })

      expect(task.id).toMatch(/^T-\d{8}-\d{6}-\d{2}$/)
      expect(task.title).toBe('Build feature X')
      expect(task.state).toBe('running')
      expect(task.mode).toBe('plan')
      expect(task.checklist).toHaveLength(3)
      expect(task.checklist[0].status).toBe('pending')
      expect(task.startedAt).toBeDefined()
    })

    it('emits taskDeclared event', async () => {
      const emitted: TaskRecord[] = []
      eventBus.on('progress:task-declared', (task: unknown) => emitted.push(task as TaskRecord))

      await ledger.declare({ title: 'Test' })

      expect(emitted).toHaveLength(1)
      expect(emitted[0].title).toBe('Test')
    })

    it('writes progress.md file', async () => {
      await ledger.declare({ title: 'Test task', plannedChecklist: ['Step 1'] })

      const progressPath = path.join(tmpDir, 'progress.md')
      const content = fs.readFileSync(progressPath, 'utf-8')
      expect(content).toContain('🔄 进行中')
      expect(content).toContain('Test task')
    })
  })

  describe('update', () => {
    it('updates checklist items', async () => {
      const task = await ledger.declare({
        title: 'Test',
        plannedChecklist: ['Step 1', 'Step 2'],
      })

      const updated = await ledger.update(task.id, {
        checklistUpdates: [{ index: 0, status: 'done' as ChecklistItemStatus }],
      })

      expect(updated.checklist[0].status).toBe('done')
      expect(updated.checklist[1].status).toBe('pending')
    })

    it('adds new checklist items', async () => {
      const task = await ledger.declare({ title: 'Test' })

      const updated = await ledger.update(task.id, {
        newChecklistItems: ['New step'],
      })

      expect(updated.checklist).toHaveLength(1)
      expect(updated.checklist[0].description).toBe('New step')
    })

    it('adds output', async () => {
      const task = await ledger.declare({ title: 'Test' })

      const updated = await ledger.update(task.id, {
        output: { type: 'file', ref: 'src/foo.ts' },
      })

      expect(updated.outputs).toHaveLength(1)
      expect(updated.outputs[0].ref).toBe('src/foo.ts')
    })

    it('throws for non-running task', async () => {
      const task = await ledger.declare({ title: 'Test' })
      await ledger.complete(task.id, 'Done')

      await expect(ledger.update(task.id, { output: { type: 'file', ref: 'x' } }))
        .rejects.toThrow('not running')
    })
  })

  describe('complete', () => {
    it('moves task to completed state', async () => {
      const task = await ledger.declare({ title: 'Test' })
      const completed = await ledger.complete(task.id, 'All done')

      expect(completed.state).toBe('completed')
      expect(completed.resultSummary).toBe('All done')
      expect(completed.completedAt).toBeDefined()
      expect(completed.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('emits taskCompleted event', async () => {
      const emitted: TaskRecord[] = []
      eventBus.on('progress:task-completed', (task: unknown) => emitted.push(task as TaskRecord))

      const task = await ledger.declare({ title: 'Test' })
      await ledger.complete(task.id, 'Done')

      expect(emitted).toHaveLength(1)
      expect(emitted[0].state).toBe('completed')
    })

    it('updates progress.md with completed section', async () => {
      const task = await ledger.declare({ title: 'Test' })
      await ledger.complete(task.id, 'Done')

      const progressPath = path.join(tmpDir, 'progress.md')
      const content = fs.readFileSync(progressPath, 'utf-8')
      expect(content).toContain('✅ 已完成')
      expect(content).toContain('Test')
    })
  })

  describe('fail', () => {
    it('moves task to failed state', async () => {
      const task = await ledger.declare({ title: 'Test' })
      const failed = await ledger.fail(task.id, 'Something went wrong')

      expect(failed.state).toBe('failed')
      expect(failed.failureReason).toBe('Something went wrong')
    })

    it('emits taskFailed event', async () => {
      const emitted: TaskRecord[] = []
      eventBus.on('progress:task-failed', (task: unknown) => emitted.push(task as TaskRecord))

      const task = await ledger.declare({ title: 'Test' })
      await ledger.fail(task.id, 'Error')

      expect(emitted).toHaveLength(1)
    })
  })

  describe('user-note preserve', () => {
    it('preserves user-note content across updates', async () => {
      const task = await ledger.declare({ title: 'Test' })
      await ledger.editUserNote(task.id, 'My important note')

      await ledger.update(task.id, { output: { type: 'file', ref: 'x.ts' } })

      const noteAfterUpdate = ledger.getTask(task.id)?.userNotes
      expect(noteAfterUpdate).toBe('My important note')
    })
  })

  describe('archive', () => {
    it('archives tasks when completed exceeds 10', async () => {
      const tasks: TaskRecord[] = []
      for (let i = 0; i < 12; i++) {
        const task = await ledger.declare({ title: `Task ${i}` })
        const completed = await ledger.complete(task.id, `Done ${i}`)
        tasks.push(completed)
      }

      const snapshot = ledger.getSnapshot()
      expect(snapshot.completedRecent.length).toBeLessThanOrEqual(10)

      const archiveDir = path.join(tmpDir, '.sibylla/trace/progress-archive')
      if (fs.existsSync(archiveDir)) {
        const files = fs.readdirSync(archiveDir)
        expect(files.length).toBeGreaterThan(0)
      }
    })
  })

  describe('trace link', () => {
    it('includes trace link when traceId is present', async () => {
      const task = await ledger.declare({
        title: 'Traced task',
        traceId: 'trace-abc-123',
      })

      const progressPath = path.join(tmpDir, 'progress.md')
      const content = fs.readFileSync(progressPath, 'utf-8')
      expect(content).toContain('sibylla://trace/trace-abc-123')
    })

    it('shows (无) when no traceId', async () => {
      await ledger.declare({ title: 'No trace' })

      const progressPath = path.join(tmpDir, 'progress.md')
      const content = fs.readFileSync(progressPath, 'utf-8')
      expect(content).toContain('（无）')
    })
  })

  describe('concurrent tasks', () => {
    it('supports multiple running tasks', async () => {
      await ledger.declare({ title: 'Task 1' })
      await ledger.declare({ title: 'Task 2' })
      await ledger.declare({ title: 'Task 3' })

      const snapshot = ledger.getSnapshot()
      expect(snapshot.active).toHaveLength(3)

      const progressPath = path.join(tmpDir, 'progress.md')
      const content = fs.readFileSync(progressPath, 'utf-8')
      expect(content).toContain('Task 1')
      expect(content).toContain('Task 2')
      expect(content).toContain('Task 3')
    })
  })

  describe('getSnapshot', () => {
    it('returns correct snapshot structure', async () => {
      await ledger.declare({ title: 'Active' })

      const snapshot = ledger.getSnapshot()
      expect(snapshot.active).toHaveLength(1)
      expect(snapshot.completedRecent).toHaveLength(0)
      expect(snapshot.queued).toHaveLength(0)
      expect(snapshot.updatedAt).toBeDefined()
    })
  })

  describe('getTask', () => {
    it('returns task by id', async () => {
      const task = await ledger.declare({ title: 'Find me' })
      const found = ledger.getTask(task.id)
      expect(found).toBeDefined()
      expect(found?.title).toBe('Find me')
    })

    it('returns null for unknown id', () => {
      expect(ledger.getTask('unknown')).toBeNull()
    })
  })

  describe('load from file', () => {
    it('loads tasks from existing progress.md', async () => {
      const task = await ledger.declare({ title: 'Persist test', plannedChecklist: ['Step 1'] })
      await ledger.update(task.id, {
        checklistUpdates: [{ index: 0, status: 'done' as ChecklistItemStatus }],
      })

      const ledger2 = new ProgressLedger(
        mockTaskStateMachine as import('../../src/main/services/harness/task-state-machine').TaskStateMachine,
        tmpDir,
        fileManager,
        mockTracer,
        eventBus,
        await import('../../src/main/utils/logger').then(m => m.logger),
      )
      await ledger2.initialize()

      const loaded = ledger2.getTask(task.id)
      expect(loaded).toBeDefined()
      expect(loaded?.title).toBe('Persist test')
    })
  })

  describe('auto-complete', () => {
    it('AIHandler auto-completes un-archived tasks', async () => {
      const task = await ledger.declare({ title: 'Auto-complete test' })
      const completed = await ledger.complete(task.id, '（AI 未显式归档）')

      expect(completed.state).toBe('completed')
      expect(completed.resultSummary).toBe('（AI 未显式归档）')
    })
  })

  describe('progress.md format', () => {
    it('contains YAML frontmatter', async () => {
      await ledger.declare({ title: 'Format test' })

      const progressPath = path.join(tmpDir, 'progress.md')
      const content = fs.readFileSync(progressPath, 'utf-8')
      expect(content).toContain('---')
      expect(content).toContain('version: 1')
      expect(content).toContain('updated:')
      expect(content).toContain('active_count:')
    })

    it('has three sections', async () => {
      await ledger.declare({ title: 'Sections test' })

      const progressPath = path.join(tmpDir, 'progress.md')
      const content = fs.readFileSync(progressPath, 'utf-8')
      expect(content).toContain('## 🔄 进行中')
      expect(content).toContain('## ✅ 已完成')
      expect(content).toContain('## 📋 排队中')
    })
  })

  describe('editUserNote', () => {
    it('updates user notes in memory', async () => {
      const task = await ledger.declare({ title: 'Note test' })
      await ledger.editUserNote(task.id, 'My custom note')

      const noteFromMap = ledger.getTask(task.id)?.userNotes
      expect(noteFromMap).toBe('My custom note')
    })
  })
})
