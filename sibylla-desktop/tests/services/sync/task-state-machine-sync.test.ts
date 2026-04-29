import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import { TaskStateMachineSync } from '../../../src/main/services/sync/task-state-machine-sync'
import { AppEventBus } from '../../../src/main/services/event-bus'
import type { TaskState } from '../../../src/main/services/harness/task-state-machine'
import type { SibyllaEvent } from '../../../src/main/services/event-bus-types'

function createMockEventBus(): AppEventBus {
  return new AppEventBus()
}

function createTaskState(overrides: Partial<TaskState> = {}): TaskState {
  return {
    taskId: 'task-test-001',
    goal: 'Test task',
    createdAt: Date.now() - 1000,
    updatedAt: Date.now(),
    status: 'executing',
    steps: [],
    currentStepIndex: 0,
    artifacts: { referencedFiles: [], modifiedFiles: [], evaluations: [] },
    lastSessionId: 'session-remote',
    ...overrides,
  }
}

describe('TaskStateMachineSync', () => {
  let tempDir: string
  let eventBus: AppEventBus

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sibylla-task-sync-test-'))
    await fs.mkdir(path.join(tempDir, '.sibylla/agents'), { recursive: true })
    eventBus = createMockEventBus()
  })

  afterEach(async () => {
    await eventBus.flushAndShutdown(1000)
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('detectCrossDeviceTasks', () => {
    it('should detect tasks from different sessions', async () => {
      const state = createTaskState({
        taskId: 'task-cross-001',
        lastSessionId: 'session-other-device',
      })
      await fs.mkdir(path.join(tempDir, '.sibylla/agents/task-cross-001'), { recursive: true })
      await fs.writeFile(
        path.join(tempDir, '.sibylla/agents/task-cross-001/state.json'),
        JSON.stringify(state),
        'utf-8',
      )

      const sync = new TaskStateMachineSync(tempDir, eventBus, 'session-current')
      const results = await sync.detectCrossDeviceTasks()

      expect(results).toHaveLength(1)
      expect(results[0]!.taskId).toBe('task-cross-001')
      expect(results[0]!.lastSessionId).toBe('session-other-device')
    })

    it('should not detect tasks from same session', async () => {
      const state = createTaskState({
        taskId: 'task-same-001',
        lastSessionId: 'session-current',
      })
      await fs.mkdir(path.join(tempDir, '.sibylla/agents/task-same-001'), { recursive: true })
      await fs.writeFile(
        path.join(tempDir, '.sibylla/agents/task-same-001/state.json'),
        JSON.stringify(state),
        'utf-8',
      )

      const sync = new TaskStateMachineSync(tempDir, eventBus, 'session-current')
      const results = await sync.detectCrossDeviceTasks()
      expect(results).toHaveLength(0)
    })

    it('should skip tasks without lastSessionId', async () => {
      const state = createTaskState({ taskId: 'task-no-session' })
      delete (state as Record<string, unknown>)['lastSessionId']

      await fs.mkdir(path.join(tempDir, '.sibylla/agents/task-no-session'), { recursive: true })
      await fs.writeFile(
        path.join(tempDir, '.sibylla/agents/task-no-session/state.json'),
        JSON.stringify(state),
        'utf-8',
      )

      const sync = new TaskStateMachineSync(tempDir, eventBus, 'session-current')
      const results = await sync.detectCrossDeviceTasks()
      expect(results).toHaveLength(0)
    })

    it('should handle empty agents directory', async () => {
      const sync = new TaskStateMachineSync(tempDir, eventBus, 'session-current')
      const results = await sync.detectCrossDeviceTasks()
      expect(results).toEqual([])
    })

    it('should handle missing agents directory', async () => {
      const emptyDir = path.join(tempDir, 'empty')
      await fs.mkdir(emptyDir, { recursive: true })
      const sync = new TaskStateMachineSync(emptyDir, eventBus, 'session-current')
      const results = await sync.detectCrossDeviceTasks()
      expect(results).toEqual([])
    })

    it('should emit event for cross-device task', async () => {
      const state = createTaskState({
        taskId: 'task-event-001',
        lastSessionId: 'session-remote',
      })
      await fs.mkdir(path.join(tempDir, '.sibylla/agents/task-event-001'), { recursive: true })
      await fs.writeFile(
        path.join(tempDir, '.sibylla/agents/task-event-001/state.json'),
        JSON.stringify(state),
        'utf-8',
      )

      let emittedEvent: SibyllaEvent | undefined
      eventBus.subscribe('task.cross-device-resumeable', (e) => {
        emittedEvent = e as SibyllaEvent
      })

      const sync = new TaskStateMachineSync(tempDir, eventBus, 'session-current')
      await sync.detectCrossDeviceTasks()

      expect(emittedEvent).toBeDefined()
      expect(emittedEvent!.payload).toEqual({
        taskId: 'task-event-001',
        lastSessionId: 'session-remote',
      })
    })
  })

  describe('validateStateJson', () => {
    it('should validate correct state.json', async () => {
      const statePath = path.join(tempDir, 'valid-state.json')
      await fs.writeFile(
        statePath,
        JSON.stringify({ taskId: 't1', status: 'executing', updatedAt: Date.now() }),
        'utf-8',
      )
      expect(await TaskStateMachineSync.validateStateJson(statePath)).toBe(true)
    })

    it('should reject missing taskId', async () => {
      const statePath = path.join(tempDir, 'no-taskid.json')
      await fs.writeFile(
        statePath,
        JSON.stringify({ status: 'executing', updatedAt: Date.now() }),
        'utf-8',
      )
      expect(await TaskStateMachineSync.validateStateJson(statePath)).toBe(false)
    })

    it('should reject missing status', async () => {
      const statePath = path.join(tempDir, 'no-status.json')
      await fs.writeFile(
        statePath,
        JSON.stringify({ taskId: 't1', updatedAt: Date.now() }),
        'utf-8',
      )
      expect(await TaskStateMachineSync.validateStateJson(statePath)).toBe(false)
    })

    it('should reject missing updatedAt', async () => {
      const statePath = path.join(tempDir, 'no-updated.json')
      await fs.writeFile(
        statePath,
        JSON.stringify({ taskId: 't1', status: 'executing' }),
        'utf-8',
      )
      expect(await TaskStateMachineSync.validateStateJson(statePath)).toBe(false)
    })

    it('should reject invalid JSON', async () => {
      const statePath = path.join(tempDir, 'invalid.json')
      await fs.writeFile(statePath, '{not json', 'utf-8')
      expect(await TaskStateMachineSync.validateStateJson(statePath)).toBe(false)
    })

    it('should reject non-existent file', async () => {
      expect(await TaskStateMachineSync.validateStateJson('/nonexistent/file.json')).toBe(false)
    })
  })

  describe('resolveConflict', () => {
    it('should pick remote when updatedAt is newer', () => {
      const local = createTaskState({ updatedAt: 1000 })
      const remote = createTaskState({ updatedAt: 2000 })
      const result = TaskStateMachineSync.resolveConflict(local, remote)
      expect(result.updatedAt).toBe(2000)
    })

    it('should pick local when updatedAt is newer', () => {
      const local = createTaskState({ updatedAt: 3000 })
      const remote = createTaskState({ updatedAt: 2000 })
      const result = TaskStateMachineSync.resolveConflict(local, remote)
      expect(result.updatedAt).toBe(3000)
    })

    it('should pick local when updatedAt is equal', () => {
      const local = createTaskState({ updatedAt: 2000 })
      const remote = createTaskState({ updatedAt: 2000 })
      const result = TaskStateMachineSync.resolveConflict(local, remote)
      expect(result.updatedAt).toBe(2000)
    })
  })
})
