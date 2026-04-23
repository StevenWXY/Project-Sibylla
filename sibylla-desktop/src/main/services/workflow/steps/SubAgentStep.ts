import type { WorkflowStep, StepResult } from '../../../../shared/types'
import type { StepExecutor, TemplateRenderContext } from '../types'
import type { SubAgentExecutor } from '../../sub-agent/SubAgentExecutor'
import type { SubAgentRegistry } from '../../sub-agent/SubAgentRegistry'
import { logger } from '../../../utils/logger'

export class SubAgentStep implements StepExecutor {
  constructor(
    private readonly subAgentRegistry: SubAgentRegistry,
    private readonly subAgentExecutor: SubAgentExecutor,
  ) {}

  async execute(
    step: WorkflowStep,
    input: Record<string, unknown> | undefined,
    _context: TemplateRenderContext,
  ): Promise<StepResult> {
    const agentId = step.sub_agent
    if (!agentId) {
      return { status: 'failed', error: '步骤缺少 sub_agent 字段' }
    }

    const agent = this.subAgentRegistry.get(agentId)
    if (!agent) {
      return { status: 'failed', error: `Sub-agent 不存在: ${agentId}` }
    }

    const timeoutMs = (step.timeout ?? 300) * 1000

    try {
      const result = await this.subAgentExecutor.run({
        agent,
        task: input ? JSON.stringify(input) : '',
        parentTraceId: '',
        parentAllowedTools: agent.allowedTools,
        timeoutMs,
      })

      logger.info('[SubAgentStep] Sub-agent 执行完成', {
        agentId,
        success: result.success,
        turnsUsed: result.turnsUsed,
      })

      return {
        status: result.success ? 'completed' : 'failed',
        output: result.structuredOutput ?? { summary: result.summary },
        error: result.errors.length > 0 ? result.errors.join('; ') : undefined,
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error('[SubAgentStep] Sub-agent 执行失败', { agentId, error: errorMsg })
      return { status: 'failed', error: errorMsg }
    }
  }
}
