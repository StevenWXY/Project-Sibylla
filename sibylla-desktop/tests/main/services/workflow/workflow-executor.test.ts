import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkflowExecutor } from '../../../../src/main/services/workflow/WorkflowExecutor'
import type { WorkflowRunContext, StepExecutor } from '../../../../src/main/services/workflow/types'
import type { WorkflowDefinition, WorkflowStep, StepResult } from '../../../../src/shared/types'

function createWorkflow(overrides?: Partial<WorkflowDefinition>): WorkflowDefinition {
  return {
    metadata: {
      id: 'test-wf',
      version: '1.0.0',
      name: 'Test Workflow',
      description: 'Test',
      scope: 'public',
    },
    triggers: [{ type: 'manual' }],
    steps: [
      { id: 'step1', name: 'Step 1', skill: 'test-skill' },
      { id: 'step2', name: 'Step 2', skill: 'test-skill-2' },
    ],
    ...overrides,
  }
}

function createMockExecutor(stepResults: Record<string, StepResult>): StepExecutor {
  return {
    execute: vi.fn().mockImplementation(async (step: WorkflowStep) => {
      const result = stepResults[step.id]
      if (result) return result
      return { status: 'completed', output: { stepId: step.id } }
    }),
  }
}

describe('WorkflowExecutor', () => {
  let executor: WorkflowExecutor

  beforeEach(() => {
    executor = new WorkflowExecutor()
    const mockStepExecutor = createMockExecutor({})
    executor.registerStepExecutor('skill', mockStepExecutor)
    executor.registerStepExecutor('sub_agent', mockStepExecutor)
    executor.registerStepExecutor('condition', mockStepExecutor)
    executor.registerStepExecutor('notify', mockStepExecutor)
  })

  it('should execute steps sequentially', async () => {
    const workflow = createWorkflow()
    const ctx: WorkflowRunContext = {
      workflow,
      params: {},
      runId: 'test-run-1',
      userConfirmationHandler: vi.fn(),
    }

    const result = await executor.run(ctx)

    expect(result.status).toBe('completed')
    expect(result.runId).toBe('test-run-1')
    expect(result.steps['step1']).toBeDefined()
    expect(result.steps['step2']).toBeDefined()
    expect(result.steps['step1']?.status).toBe('completed')
    expect(result.steps['step2']?.status).toBe('completed')
  })

  it('should skip steps when when condition evaluates to false', async () => {
    const parser = new (await import('../../../../src/main/services/workflow/WorkflowParser')).WorkflowParser()
    const executorWithParser = new WorkflowExecutor(parser)
    executorWithParser.registerStepExecutor('skill', createMockExecutor({}))

    const workflow = createWorkflow({
      steps: [
        { id: 'step1', name: 'Always Run', skill: 'test-skill' },
        { id: 'step2', name: 'Conditional', skill: 'test-skill', when: '${{ steps.step1.output.skip_me }}' },
        { id: 'step3', name: 'After Skip', skill: 'test-skill' },
      ],
    })

    const ctx: WorkflowRunContext = {
      workflow,
      params: {},
      runId: 'test-run-2',
      userConfirmationHandler: vi.fn(),
    }

    const result = await executorWithParser.run(ctx)

    expect(result.status).toBe('completed')
    expect(result.steps['step2']?.status).toBe('skipped')
    expect(result.steps['step3']?.status).toBe('completed')
  })

  it('should pause for user confirmation when requires_user_confirm is true', async () => {
    const confirmationHandler = vi.fn().mockResolvedValue('confirm')
    const workflow = createWorkflow({
      steps: [
        { id: 'step1', name: 'Needs Confirm', skill: 'test-skill', requires_user_confirm: true },
      ],
    })

    const ctx: WorkflowRunContext = {
      workflow,
      params: {},
      runId: 'test-run-3',
      userConfirmationHandler: confirmationHandler,
    }

    const result = await executor.run(ctx)

    expect(confirmationHandler).toHaveBeenCalled()
    expect(result.status).toBe('completed')
    expect(result.steps['step1']?.status).toBe('completed')
  })

  it('should cancel workflow when user confirms cancel', async () => {
    const confirmationHandler = vi.fn().mockResolvedValue('cancel')
    const workflow = createWorkflow({
      steps: [
        { id: 'step1', name: 'Confirm Step', skill: 'test-skill', requires_user_confirm: true },
        { id: 'step2', name: 'Should Not Run', skill: 'test-skill' },
      ],
    })

    const ctx: WorkflowRunContext = {
      workflow,
      params: {},
      runId: 'test-run-4',
      userConfirmationHandler: confirmationHandler,
    }

    const result = await executor.run(ctx)

    expect(result.status).toBe('cancelled')
    expect(result.steps['step1']?.status).toBe('cancelled')
    expect(result.steps['step2']).toBeUndefined()
  })

  it('should stop on failure when on_failure is stop', async () => {
    const failingExecutor: StepExecutor = {
      execute: vi.fn().mockImplementation(async (step: WorkflowStep) => {
        if (step.id === 'step1') {
          throw new Error('Step failed')
        }
        return { status: 'completed' } as StepResult
      }),
    }

    const failingWorkflowExecutor = new WorkflowExecutor()
    failingWorkflowExecutor.registerStepExecutor('skill', failingExecutor)

    const workflow = createWorkflow({
      steps: [
        { id: 'step1', name: 'Failing Step', skill: 'bad-skill', on_failure: 'stop' },
        { id: 'step2', name: 'Should Not Run', skill: 'test-skill' },
      ],
    })

    const ctx: WorkflowRunContext = {
      workflow,
      params: {},
      runId: 'test-run-5',
      userConfirmationHandler: vi.fn(),
    }

    const result = await failingWorkflowExecutor.run(ctx)

    expect(result.status).toBe('failed')
    expect(result.steps['step1']?.status).toBe('failed')
    expect(result.steps['step2']).toBeUndefined()
  })

  it('should continue on failure when on_failure is continue', async () => {
    const failingExecutor: StepExecutor = {
      execute: vi.fn().mockImplementation(async (step: WorkflowStep) => {
        if (step.id === 'step1') {
          throw new Error('Step failed')
        }
        return { status: 'completed' } as StepResult
      }),
    }

    const continueExecutor = new WorkflowExecutor()
    continueExecutor.registerStepExecutor('skill', failingExecutor)

    const workflow = createWorkflow({
      steps: [
        { id: 'step1', name: 'Failing Step', skill: 'bad-skill', on_failure: 'continue' },
        { id: 'step2', name: 'Should Still Run', skill: 'test-skill' },
      ],
    })

    const ctx: WorkflowRunContext = {
      workflow,
      params: {},
      runId: 'test-run-6',
      userConfirmationHandler: vi.fn(),
    }

    const result = await continueExecutor.run(ctx)

    expect(result.status).toBe('completed')
    expect(result.steps['step1']?.status).toBe('failed')
    expect(result.steps['step2']?.status).toBe('completed')
  })

  it('should cancel a running workflow', async () => {
    const slowExecutor: StepExecutor = {
      execute: vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5000))
        return { status: 'completed' } as StepResult
      }),
    }

    const slowWorkflowExecutor = new WorkflowExecutor()
    slowWorkflowExecutor.registerStepExecutor('skill', slowExecutor)

    const workflow = createWorkflow()
    const ctx: WorkflowRunContext = {
      workflow,
      params: {},
      runId: 'test-run-7',
      userConfirmationHandler: vi.fn(),
    }

    const runPromise = slowWorkflowExecutor.run(ctx)

    slowWorkflowExecutor.cancelRun('test-run-7')

    const result = await runPromise
    expect(result.status).toBe('cancelled')
  })
})
