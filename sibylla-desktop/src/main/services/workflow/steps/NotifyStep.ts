import type { WorkflowStep, StepResult } from '../../../../shared/types'
import type { StepExecutor, TemplateRenderContext } from '../types'
import { logger } from '../../../utils/logger'

export class NotifyStep implements StepExecutor {
  async execute(
    step: WorkflowStep,
    input: Record<string, unknown> | undefined,
    _context: TemplateRenderContext,
  ): Promise<StepResult> {
    logger.info('[NotifyStep] 发送通知', {
      stepId: step.id,
      title: input?.title,
    })

    return {
      status: 'completed',
      output: {
        notified: true,
        title: input?.title ?? '',
        body: input?.body ?? '',
        channel: input?.channel ?? 'workspace',
      },
    }
  }
}
