import { describe, it, expect, beforeEach } from 'vitest'
import { WorkflowRunStore } from '../../../../src/main/services/workflow/WorkflowRunStore'
import type { WorkflowRun } from '../../../../src/shared/types'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'

function createRun(overrides?: Partial<WorkflowRun>): WorkflowRun {
  return {
    runId: `run-${Date.now()}`,
    workflowId: 'test-wf',
    workflowVersion: '1.0.0',
    status: 'completed',
    startedAt: Date.now(),
    endedAt: Date.now(),
    params: {},
    steps: {
      step1: { status: 'completed', output: { result: 'ok' } },
    },
    errors: [],
    ...overrides,
  }
}

describe('WorkflowRunStore', () => {
  let store: WorkflowRunStore
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wf-runs-'))
    store = new WorkflowRunStore(tempDir)
  })

  it('should persist and retrieve a run', async () => {
    const run = createRun({ runId: 'test-persist-run' })

    await store.persist(run)

    const retrieved = await store.get('test-persist-run')

    expect(retrieved).toBeDefined()
    expect(retrieved?.runId).toBe('test-persist-run')
    expect(retrieved?.workflowId).toBe('test-wf')
    expect(retrieved?.steps['step1']?.status).toBe('completed')
  })

  it('should return null for non-existent run', async () => {
    const result = await store.get('non-existent-id')

    expect(result).toBeNull()
  })

  it('should return incomplete runs', async () => {
    const runningRun = createRun({
      runId: 'running-1',
      status: 'running',
      endedAt: undefined,
    })
    const pausedRun = createRun({
      runId: 'paused-1',
      status: 'paused',
    })
    const completedRun = createRun({
      runId: 'completed-1',
      status: 'completed',
    })

    await store.persist(runningRun)
    await store.persist(pausedRun)
    await store.persist(completedRun)

    const incomplete = await store.getIncompleteRuns()

    expect(incomplete).toHaveLength(2)
    const ids = incomplete.map((r) => r.runId)
    expect(ids).toContain('running-1')
    expect(ids).toContain('paused-1')
  })

  it('should list runs with filters', async () => {
    const run1 = createRun({ runId: 'run-a', workflowId: 'wf-a', status: 'completed' })
    const run2 = createRun({ runId: 'run-b', workflowId: 'wf-b', status: 'failed' })
    const run3 = createRun({ runId: 'run-c', workflowId: 'wf-a', status: 'completed' })

    await store.persist(run1)
    await store.persist(run2)
    await store.persist(run3)

    const allRuns = await store.listRuns()
    expect(allRuns).toHaveLength(3)

    const wfARuns = await store.listRuns({ workflowId: 'wf-a' })
    expect(wfARuns).toHaveLength(2)

    const failedRuns = await store.listRuns({ status: 'failed' })
    expect(failedRuns).toHaveLength(1)
    expect(failedRuns[0]!.runId).toBe('run-b')
  })

  it('should update run status', async () => {
    const run = createRun({ runId: 'update-test', status: 'running', endedAt: undefined })

    await store.persist(run)
    await store.updateStatus('update-test', 'cancelled')

    const updated = await store.get('update-test')
    expect(updated?.status).toBe('cancelled')
    expect(updated?.endedAt).toBeDefined()
  })

  it('should respect limit filter', async () => {
    for (let i = 0; i < 5; i++) {
      await store.persist(createRun({ runId: `run-limit-${i}`, startedAt: Date.now() + i }))
    }

    const limited = await store.listRuns({ limit: 2 })
    expect(limited).toHaveLength(2)
  })
})
