import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PlanManager } from '../../src/main/services/plan/plan-manager'
import type { FileManager } from '../../src/main/services/file-manager'
import type { Tracer } from '../../src/main/services/trace/tracer'
import type { AppEventBus } from '../../src/main/services/event-bus'
import type { ProgressLedger } from '../../src/main/services/progress/progress-ledger'
import type { TaskStateMachine } from '../../src/main/services/harness/task-state-machine'
import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

function createMockFileManager(workspaceRoot: string): FileManager {
  return {
    getWorkspaceRoot: () => workspaceRoot,
    getRelativePath: (fullPath: string) => path.relative(workspaceRoot, fullPath),
    writeFile: vi.fn(async (relPath: string, content: string) => {
      const full = path.join(workspaceRoot, relPath)
      await fs.promises.mkdir(path.dirname(full), { recursive: true })
      await fs.promises.writeFile(full, content, 'utf-8')
    }),
    readFile: vi.fn(async (relPath: string) => {
      const full = path.join(workspaceRoot, relPath)
      const content = await fs.promises.readFile(full, 'utf-8')
      return { path: relPath, content, encoding: 'utf-8', size: content.length }
    }),
  } as unknown as FileManager
}

function createMockTracer() {
  return {
    isEnabled: vi.fn().mockReturnValue(true),
    withSpan: vi.fn(async (_name: string, fn: (span: { setAttributes: (attrs: Record<string, unknown>) => void; setAttribute: (key: string, val: unknown) => void }) => Promise<unknown>) => {
      const span = {
        setAttributes: vi.fn(),
        setAttribute: vi.fn(),
      }
      return await fn(span)
    }),
  } as unknown as Tracer
}

function createMockEventBus(): AppEventBus {
  const emitter = new EventEmitter() as AppEventBus
  return emitter
}

function createMockProgressLedger() {
  return {
    declare: vi.fn(async () => ({})),
  } as unknown as ProgressLedger
}

function createMockTaskStateMachine() {
  return {
    create: vi.fn(async () => ({ taskId: 'tsm-1', goal: '', steps: [], status: 'executing', createdAt: Date.now(), updatedAt: Date.now(), currentStepIndex: 0, artifacts: { referencedFiles: [], modifiedFiles: [], evaluations: [] } })),
  } as unknown as TaskStateMachine
}

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    setLevel: vi.fn(),
  }
}

describe('PlanManager', () => {
  let tempDir: string
  let manager: PlanManager
  let fileManager: FileManager
  let tracer: Tracer
  let eventBus: AppEventBus
  let progressLedger: ProgressLedger
  let taskStateMachine: TaskStateMachine
  let logger: ReturnType<typeof createMockLogger>

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'plan-test-'))
    fileManager = createMockFileManager(tempDir)
    tracer = createMockTracer()
    eventBus = createMockEventBus()
    progressLedger = createMockProgressLedger()
    taskStateMachine = createMockTaskStateMachine()
    logger = createMockLogger()

    manager = new PlanManager(
      tempDir,
      fileManager,
      tracer,
      eventBus,
      progressLedger,
      taskStateMachine,
      logger as unknown as typeof import('../../src/main/utils/logger').logger,
    )
  })

  afterEach(async () => {
    manager.dispose()
    await fs.promises.rm(tempDir, { recursive: true, force: true })
  })

  describe('initialize', () => {
    it('should load existing plans from directory', async () => {
      const plansDir = path.join(tempDir, '.sibylla/plans')
      await fs.promises.mkdir(plansDir, { recursive: true })
      await fs.promises.writeFile(
        path.join(plansDir, 'plan-existing.md'),
        '---\nid: plan-existing\ntitle: Existing\nstatus: draft\ncreated_at: "2026-01-01"\nupdated_at: "2026-01-01"\n---\n\n# Existing\n\n## 步骤\n\n- [ ] Step',
        'utf-8',
      )

      await manager.initialize()
      const active = await manager.getActivePlans()
      expect(active).toHaveLength(1)
      expect(active[0].title).toBe('Existing')
    })

    it('should create plans directory if not exists', async () => {
      await manager.initialize()
      const plansDir = path.join(tempDir, '.sibylla/plans')
      const exists = await fs.promises.stat(plansDir).then(() => true).catch(() => false)
      expect(exists).toBe(true)
    })
  })

  describe('createFromAIOutput', () => {
    beforeEach(async () => {
      await manager.initialize()
    })

    it('should create plan from valid AI output', async () => {
      const metadata = await manager.createFromAIOutput({
        aiContent: '# My Plan\n\n## 步骤\n\n- [ ] Step 1\n- [ ] Step 2',
        conversationId: 'conv-1',
        traceId: 'trace-1',
      })

      expect(metadata.title).toBe('My Plan')
      expect(metadata.status).toBe('draft')
      expect(metadata.conversationId).toBe('conv-1')
    })

    it('should save as draft-unparsed when parsing fails', async () => {
      const metadata = await manager.createFromAIOutput({
        aiContent: 'Just some random text without any plan structure',
        conversationId: 'conv-2',
        traceId: 'trace-2',
      })

      expect(metadata.status).toBe('draft-unparsed')
    })

    it('should emit plan:created event', async () => {
      const handler = vi.fn()
      eventBus.on('plan:created' as never, handler as never)

      await manager.createFromAIOutput({
        aiContent: '# Plan\n\n## 步骤\n\n- [ ] Step',
        conversationId: 'c',
        traceId: 't',
      })

      expect(handler).toHaveBeenCalledTimes(1)
    })
  })

  describe('startExecution', () => {
    beforeEach(async () => {
      await manager.initialize()
      await manager.createFromAIOutput({
        aiContent: '# Exec Plan\n\n## 步骤\n\n- [ ] Step 1\n- [ ] Step 2',
        conversationId: 'c',
        traceId: 't',
      })
    })

    it('should update status to in_progress', async () => {
      const plans = await manager.getActivePlans()
      const planId = plans[0].id

      await manager.startExecution(planId)

      const updated = await manager.getActivePlans()
      const plan = updated.find(p => p.id === planId)
      expect(plan?.status).toBe('in_progress')
    })

    it('should call taskStateMachine.create', async () => {
      const plans = await manager.getActivePlans()
      await manager.startExecution(plans[0].id)
      expect(taskStateMachine.create).toHaveBeenCalled()
    })

    it('should call progressLedger.declare', async () => {
      const plans = await manager.getActivePlans()
      await manager.startExecution(plans[0].id)
      expect(progressLedger.declare).toHaveBeenCalled()
    })

    it('should throw for non-existent plan', async () => {
      await expect(manager.startExecution('non-existent')).rejects.toThrow('Plan not found')
    })
  })

  describe('archiveAsFormalDocument', () => {
    it('should archive plan and create stub', async () => {
      await manager.initialize()
      const meta = await manager.createFromAIOutput({
        aiContent: '# Archive Plan\n\n## 步骤\n\n- [x] Step 1',
        conversationId: 'c',
        traceId: 't',
      })

      const archiveTarget = path.join(tempDir, 'specs/plans/archived.md')
      const result = await manager.archiveAsFormalDocument(meta.id, archiveTarget)

      expect(result.status).toBe('archived')
      expect(result.archivedTo).toBe(archiveTarget)

      const archivedContent = await fs.promises.readFile(archiveTarget, 'utf-8')
      expect(archivedContent).toContain('Archive Plan')
    })
  })

  describe('abandon', () => {
    it('should set status to abandoned', async () => {
      await manager.initialize()
      const meta = await manager.createFromAIOutput({
        aiContent: '# Abandon Plan\n\n## 步骤\n\n- [ ] Step',
        conversationId: 'c',
        traceId: 't',
      })

      await manager.abandon(meta.id)
      const active = await manager.getActivePlans()
      expect(active.find(p => p.id === meta.id)).toBeUndefined()
    })
  })

  describe('getActivePlans', () => {
    it('should return draft and in_progress plans', async () => {
      await manager.initialize()
      await manager.createFromAIOutput({
        aiContent: '# Plan A\n\n## 步骤\n\n- [ ] Step',
        conversationId: 'c1',
        traceId: 't1',
      })
      await new Promise(r => setTimeout(r, 1100))
      await manager.createFromAIOutput({
        aiContent: '# Plan B\n\n## 步骤\n\n- [ ] Step',
        conversationId: 'c2',
        traceId: 't2',
      })

      const active = await manager.getActivePlans()
      expect(active.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('getPlan', () => {
    it('should return parsed plan by id', async () => {
      await manager.initialize()
      const meta = await manager.createFromAIOutput({
        aiContent: '# Detail Plan\n\n## 步骤\n\n- [ ] Step 1\n- [x] Step 2',
        conversationId: 'c',
        traceId: 't',
      })

      const plan = await manager.getPlan(meta.id)
      expect(plan).not.toBeNull()
      expect(plan?.steps).toHaveLength(2)
      expect(plan?.steps[1].done).toBe(true)
    })

    it('should return null for non-existent plan', async () => {
      await manager.initialize()
      const plan = await manager.getPlan('non-existent')
      expect(plan).toBeNull()
    })
  })

  describe('followUp', () => {
    it('should calculate progress correctly', async () => {
      await manager.initialize()
      const meta = await manager.createFromAIOutput({
        aiContent: '# Follow Plan\n\n## 步骤\n\n- [x] Done\n- [ ] Pending\n- [x] Done 2',
        conversationId: 'c',
        traceId: 't',
      })

      const result = await manager.followUp(meta.id)
      expect(result.completedSteps).toBe(2)
      expect(result.totalSteps).toBe(3)
      expect(result.progress).toBeCloseTo(2 / 3)
    })
  })

  describe('cleanupStalePlans', () => {
    it('should archive stale draft plans', async () => {
      await manager.initialize()
      const meta = await manager.createFromAIOutput({
        aiContent: '# Stale Plan\n\n## 步骤\n\n- [ ] Step',
        conversationId: 'c',
        traceId: 't',
      })

      const plan = (await manager.getActivePlans()).find(p => p.id === meta.id)!
      plan.updatedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()

      const count = await manager.cleanupStalePlans()
      expect(count).toBe(1)
    })

    it('should not affect recent plans', async () => {
      await manager.initialize()
      await manager.createFromAIOutput({
        aiContent: '# Fresh Plan\n\n## 步骤\n\n- [ ] Step',
        conversationId: 'c',
        traceId: 't',
      })

      const count = await manager.cleanupStalePlans()
      expect(count).toBe(0)
    })
  })

  describe('dispose', () => {
    it('should clean up resources', async () => {
      await manager.initialize()
      manager.dispose()
      const active = await manager.getActivePlans()
      expect(active).toHaveLength(0)
    })
  })
})
