/**
 * TaskStateMachine unit tests
 *
 * Tests cover: creation, step advancement, archiving, crash recovery,
 * corrupted file handling, path traversal, atomic write safety, and resume context.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  TaskStateMachine,
  isResumeableStatus,
  isTerminalStatus,
  AGENTS_DIR,
  TASK_STATE_FILE,
} from '../../src/main/services/harness/task-state-machine'
import type { TaskState } from '../../src/main/services/harness/task-state-machine'

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  setLevel: vi.fn(),
}

let tmpDir: string
let machine: TaskStateMachine

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tsm-test-'))
  machine = new TaskStateMachine(tmpDir, mockLogger)
  vi.clearAllMocks()
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('TaskStateMachine', () => {
  // ─── Test 1: Create task → state.json exists and format is correct ───
  it('creates a task with valid state.json', async () => {
    const state = await machine.create('Test goal', ['step1', 'step2', 'step3'])

    expect(state.taskId).toMatch(/^task-\d+-[a-z0-9]+$/)
    expect(state.goal).toBe('Test goal')
    expect(state.status).toBe('planning')
    expect(state.steps).toHaveLength(3)
    expect(state.currentStepIndex).toBe(0)

    // Verify file exists on disk
    const statePath = path.join(tmpDir, AGENTS_DIR, state.taskId, TASK_STATE_FILE)
    const raw = await fs.readFile(statePath, 'utf-8')
    const parsed = JSON.parse(raw) as TaskState
    expect(parsed.taskId).toBe(state.taskId)
    expect(parsed.goal).toBe('Test goal')
  })

  // ─── Test 2: Advance step → currentStepIndex increments ───
  it('advances step and updates currentStepIndex', async () => {
    const state = await machine.create('goal', ['s1', 's2', 's3'])

    await machine.advance(state.taskId, 'Step 1 done', ['file.md'])

    const statePath = path.join(tmpDir, AGENTS_DIR, state.taskId, TASK_STATE_FILE)
    const raw = await fs.readFile(statePath, 'utf-8')
    const updated = JSON.parse(raw) as TaskState

    expect(updated.currentStepIndex).toBe(1)
    expect(updated.steps[0]?.status).toBe('done')
    expect(updated.steps[0]?.summary).toBe('Step 1 done')
    expect(updated.steps[1]?.status).toBe('in_progress')
    expect(updated.status).toBe('executing')
    expect(updated.artifacts.modifiedFiles).toContain('file.md')
  })

  // ─── Test 3: Advance to last step → auto-archive to completed/ ───
  it('archives to completed/ when all steps are done', async () => {
    const state = await machine.create('goal', ['s1', 's2'])

    await machine.advance(state.taskId, 'done1', [])
    await machine.advance(state.taskId, 'done2', [])

    // Original location should not exist
    const originalDir = path.join(tmpDir, AGENTS_DIR, state.taskId)
    await expect(fs.access(originalDir)).rejects.toThrow()

    // Should be in completed/
    const archivedPath = path.join(tmpDir, AGENTS_DIR, 'completed', state.taskId, TASK_STATE_FILE)
    const raw = await fs.readFile(archivedPath, 'utf-8')
    const archived = JSON.parse(raw) as TaskState
    expect(archived.status).toBe('completed')
  })

  // ─── Test 4: Abandon → archive to cancelled/ ───
  it('abandons task and archives to cancelled/', async () => {
    const state = await machine.create('goal', ['s1', 's2'])

    await machine.abandon(state.taskId)

    const archivedPath = path.join(tmpDir, AGENTS_DIR, 'cancelled', state.taskId, TASK_STATE_FILE)
    const raw = await fs.readFile(archivedPath, 'utf-8')
    const archived = JSON.parse(raw) as TaskState
    expect(archived.status).toBe('cancelled')
  })

  // ─── Test 5: Corrupted state.json → move to corrupted/ ───
  it('moves corrupted state.json to corrupted/ on findResumeable', async () => {
    const badTaskId = 'task-9999-bad'
    const badDir = path.join(tmpDir, AGENTS_DIR, badTaskId)
    await fs.mkdir(badDir, { recursive: true })
    await fs.writeFile(path.join(badDir, TASK_STATE_FILE), 'NOT VALID JSON', 'utf-8')

    const result = await machine.findResumeable()
    expect(result).toHaveLength(0)

    // Should be in corrupted/
    const corruptedPath = path.join(tmpDir, AGENTS_DIR, 'corrupted', badTaskId)
    const exists = await fs.access(corruptedPath).then(() => true).catch(() => false)
    expect(exists).toBe(true)

    expect(mockLogger.warn).toHaveBeenCalledWith('task-state-machine.corrupted', { taskId: badTaskId })
  })

  // ─── Test 6: findResumeable → only returns executing/awaiting_confirmation ───
  it('findResumeable returns only resumeable statuses', async () => {
    // Create executing task
    const s1 = await machine.create('executing task', ['s1', 's2', 's3'])
    await machine.advance(s1.taskId, 'started', [])

    // Create completed task (should be filtered out)
    const s2 = await machine.create('completed task', ['s1'])
    await machine.advance(s2.taskId, 'done', [])

    const resumeable = await machine.findResumeable()
    expect(resumeable).toHaveLength(1)
    expect(resumeable[0]?.taskId).toBe(s1.taskId)
    expect(resumeable[0]?.status).toBe('executing')
  })

  // ─── Test 7: Write failure → logs error but does not throw ───
  it('persist failure logs error but does not throw', async () => {
    // Create with a read-only directory to force write failure
    const readOnlyDir = path.join(tmpDir, 'readonly-workspace')
    await fs.mkdir(readOnlyDir, { recursive: true })

    // Make agents dir a file to cause mkdir failure
    const agentsPath = path.join(readOnlyDir, '.sibylla')
    await fs.mkdir(agentsPath, { recursive: true })
    const agentsSubPath = path.join(agentsPath, 'agents')
    await fs.writeFile(agentsSubPath, 'not a directory', 'utf-8')

    const readOnlyMachine = new TaskStateMachine(readOnlyDir, mockLogger)

    // Should not throw
    const state = await readOnlyMachine.create('goal', ['s1'])
    // State is returned even if persist fails
    expect(state.goal).toBe('goal')
    expect(mockLogger.error).toHaveBeenCalled()
  })

  // ─── Test 8: Path traversal → throws error ───
  it('throws on path traversal in taskId', async () => {
    await expect(
      machine.advance('../../../etc/passwd', 'hacked', []),
    ).rejects.toThrow('path traversal')
  })

  // ─── Test 9: Resume → context includes completed step summaries ───
  it('resume builds context prompt with completed steps', async () => {
    const state = await machine.create('Build feature X', ['Design API', 'Implement', 'Test'])
    await machine.advance(state.taskId, 'API designed', [])
    await machine.advance(state.taskId, 'Implementation done', [])

    const result = await machine.resume(state.taskId)
    expect(result.resumePrompt).toContain('Build feature X')
    expect(result.resumePrompt).toContain('API designed')
    expect(result.resumePrompt).toContain('Implementation done')
    expect(result.resumePrompt).toContain('步骤 3')
    expect(result.state.status).toBe('executing')
  })

  // ─── Test 10: Atomic write → no .tmp file remains ───
  it('does not leave .tmp files after persist', async () => {
    const state = await machine.create('goal', ['s1'])
    const taskDir = path.join(tmpDir, AGENTS_DIR, state.taskId)
    const entries = await fs.readdir(taskDir)

    expect(entries).toContain(TASK_STATE_FILE)
    expect(entries.filter((e) => e.endsWith('.tmp'))).toHaveLength(0)
  })

  // ─── Test 11: No agents/ dir → findResumeable returns empty ───
  it('findResumeable returns empty when agents/ does not exist', async () => {
    const emptyDir = path.join(tmpDir, 'empty-workspace')
    await fs.mkdir(emptyDir, { recursive: true })

    const emptyMachine = new TaskStateMachine(emptyDir, mockLogger)
    const result = await emptyMachine.findResumeable()
    expect(result).toEqual([])
    // Should log info, not error
    expect(mockLogger.info).toHaveBeenCalledWith('task-state-machine.no-agents-dir')
  })

  // ─── Test 12: generateId format ───
  it('generates IDs matching task-{timestamp}-{random} format', async () => {
    const state = await machine.create('goal', ['s1'])
    expect(state.taskId).toMatch(/^task-\d+-[a-z0-9]+$/)
    // Step IDs also match
    expect(state.steps[0]?.id).toMatch(/^task-\d+-[a-z0-9]+$/)
  })
})

describe('Type Guards', () => {
  it('isResumeableStatus identifies executing and awaiting_confirmation', () => {
    expect(isResumeableStatus('executing')).toBe(true)
    expect(isResumeableStatus('awaiting_confirmation')).toBe(true)
    expect(isResumeableStatus('planning')).toBe(false)
    expect(isResumeableStatus('completed')).toBe(false)
    expect(isResumeableStatus('cancelled')).toBe(false)
    expect(isResumeableStatus('failed')).toBe(false)
  })

  it('isTerminalStatus identifies completed, cancelled, and failed', () => {
    expect(isTerminalStatus('completed')).toBe(true)
    expect(isTerminalStatus('cancelled')).toBe(true)
    expect(isTerminalStatus('failed')).toBe(true)
    expect(isTerminalStatus('planning')).toBe(false)
    expect(isTerminalStatus('executing')).toBe(false)
    expect(isTerminalStatus('awaiting_confirmation')).toBe(false)
  })
})
