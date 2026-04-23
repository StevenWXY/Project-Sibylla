import type {
  WorkflowDefinition,
  WorkflowStep,
  StepResult,
  WorkflowRun,
  WorkflowRunStatus,
} from '../../../shared/types'

export interface ParseResult<T> {
  success: boolean
  data?: T
  errors: string[]
  warnings: string[]
}

export interface TemplateRenderContext {
  params: Record<string, unknown>
  steps: Record<string, StepResult>
}

export type UserConfirmationDecision = 'confirm' | 'skip' | 'cancel'

export interface WorkflowRunContext {
  workflow: WorkflowDefinition
  params: Record<string, unknown>
  runId: string
  parentTraceId?: string
  userConfirmationHandler: (
    step: WorkflowStep,
    previousSteps: Record<string, StepResult>,
  ) => Promise<UserConfirmationDecision>
}

export interface WorkflowRunResult {
  runId: string
  workflowId: string
  workflowVersion: string
  status: WorkflowRunStatus
  startedAt: number
  endedAt?: number
  params: Record<string, unknown>
  steps: Record<string, StepResult>
  errors: WorkflowRun['errors']
}

export interface StepExecutor {
  execute(
    step: WorkflowStep,
    input: Record<string, unknown> | undefined,
    context: TemplateRenderContext,
  ): Promise<StepResult>
}
