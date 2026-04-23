import type { WorkflowStep, StepResult, WorkflowError, WorkflowRun } from '../../../shared/types'
import type { WorkflowRunContext, WorkflowRunResult, StepExecutor } from './types'
import type { WorkflowParser } from './WorkflowParser'
import { logger } from '../../utils/logger'

const TIMEOUT_WARNING_MS = 30 * 60 * 1000

export class WorkflowExecutor {
  private activeRuns = new Map<string, AbortController>()
  private stepExecutors: Map<string, StepExecutor> = new Map()

  constructor(
    private readonly parser?: WorkflowParser,
    private readonly runStore?: import('./WorkflowRunStore').WorkflowRunStore,
  ) {}

  registerStepExecutor(type: string, executor: StepExecutor): void {
    this.stepExecutors.set(type, executor)
  }

  async run(ctx: WorkflowRunContext): Promise<WorkflowRunResult> {
    const { workflow, params, runId } = ctx
    const errors: WorkflowError[] = []

    const result: WorkflowRunResult = {
      runId,
      workflowId: workflow.metadata.id,
      workflowVersion: workflow.metadata.version,
      status: 'running',
      startedAt: Date.now(),
      params,
      steps: {},
      errors,
    }

    const abortController = new AbortController()
    this.activeRuns.set(runId, abortController)

    const timeoutTimer = setTimeout(() => {
      logger.warn('[WorkflowExecutor] 运行超过 30 分钟', { runId })
    }, TIMEOUT_WARNING_MS)

    try {
      logger.info('[WorkflowExecutor] 开始运行', {
        runId,
        workflowId: workflow.metadata.id,
        stepCount: workflow.steps.length,
      })

      if (this.runStore) {
        await this.runStore.persist(this.toWorkflowRun(result))
      }

      for (const step of workflow.steps) {
        if (abortController.signal.aborted) {
          result.status = 'cancelled'
          break
        }

        if (step.when && this.parser) {
          if (!this.parser.evaluateWhen(step.when, result.steps)) {
            result.steps[step.id] = { status: 'skipped' }
            continue
          }
        }

        if (step.requires_user_confirm) {
          const decision = await ctx.userConfirmationHandler(step, result.steps)
          if (decision === 'cancel') {
            result.steps[step.id] = { status: 'cancelled' }
            result.status = 'cancelled'
            break
          }
          if (decision === 'skip') {
            result.steps[step.id] = { status: 'skipped' }
            continue
          }
        }

        const renderedInput = this.parser
          ? this.parser.renderTemplate(step.input, { params, steps: result.steps })
          : step.input

        const stepStartedAt = Date.now()
        try {
          const stepResult = await this.executeStep(step, renderedInput, { params, steps: result.steps })
          stepResult.startedAt = stepStartedAt
          stepResult.endedAt = Date.now()
          result.steps[step.id] = stepResult
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err)
          result.steps[step.id] = {
            status: 'failed',
            error: errorMsg,
            startedAt: stepStartedAt,
            endedAt: Date.now(),
          }
          errors.push({
            stepId: step.id,
            message: errorMsg,
            timestamp: Date.now(),
          })

          if (step.on_failure === 'stop') {
            result.status = 'failed'
            break
          }
        }

        if (this.runStore) {
          await this.runStore.persist(this.toWorkflowRun(result))
        }
      }

      if (result.status === 'running') {
        result.status = 'completed'
      }
    } finally {
      clearTimeout(timeoutTimer)
      this.activeRuns.delete(runId)
      result.endedAt = Date.now()
    }

    logger.info('[WorkflowExecutor] 运行结束', {
      runId,
      status: result.status,
      stepCount: Object.keys(result.steps).length,
      errorCount: result.errors.length,
    })

    return result
  }

  cancelRun(runId: string): boolean {
    const controller = this.activeRuns.get(runId)
    if (controller) {
      controller.abort()
      logger.info('[WorkflowExecutor] 取消运行', { runId })
      return true
    }
    return false
  }

  private async executeStep(
    step: WorkflowStep,
    input: Record<string, unknown> | undefined,
    context: { params: Record<string, unknown>; steps: Record<string, StepResult> },
  ): Promise<StepResult> {
    const stepType = this.inferStepType(step)

    const executor = this.stepExecutors.get(stepType)
    if (executor) {
      return executor.execute(step, input, context)
    }

    throw new Error(`未知步骤类型: ${stepType} (步骤: ${step.id})`)
  }

  private inferStepType(step: WorkflowStep): string {
    if (step.type) return step.type
    if (step.skill) return 'skill'
    if (step.sub_agent) return 'sub_agent'
    if (step.expression) return 'condition'
    if (step.action) return 'notify'
    return 'unknown'
  }

  private toWorkflowRun(result: WorkflowRunResult): WorkflowRun {
    return {
      runId: result.runId,
      workflowId: result.workflowId,
      workflowVersion: result.workflowVersion,
      status: result.status,
      startedAt: result.startedAt,
      endedAt: result.endedAt,
      params: result.params,
      steps: result.steps,
      errors: result.errors,
    }
  }
}
