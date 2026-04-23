import type { WorkflowStep, StepResult } from '../../../../shared/types'
import type { StepExecutor, TemplateRenderContext } from '../types'
import { WorkflowParser } from '../WorkflowParser'
import { logger } from '../../../utils/logger'

export class ConditionStep implements StepExecutor {
  constructor(private readonly parser: WorkflowParser) {}

  async execute(
    step: WorkflowStep,
    _input: Record<string, unknown> | undefined,
    context: TemplateRenderContext,
  ): Promise<StepResult> {
    const expression = step.expression
    if (!expression) {
      return { status: 'failed', error: '步骤缺少 expression 字段' }
    }

    try {
      const result = this.parser.evaluateWhen(expression, context.steps)

      logger.info('[ConditionStep] 条件评估完成', {
        expression,
        result,
      })

      return {
        status: 'completed',
        output: { result, expression },
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error('[ConditionStep] 条件评估失败', { expression, error: errorMsg })
      return { status: 'failed', error: errorMsg }
    }
  }
}
