import type { WorkflowStep, StepResult } from '../../../../shared/types'
import type { StepExecutor, TemplateRenderContext } from '../types'
import type { SkillRegistry } from '../../skill-system/SkillRegistry'
import type { SkillExecutor } from '../../skill-system/SkillExecutor'
import { logger } from '../../../utils/logger'

export class SkillStep implements StepExecutor {
  constructor(
    private readonly skillRegistry: SkillRegistry,
    private readonly skillExecutor: SkillExecutor,
  ) {}

  async execute(
    step: WorkflowStep,
    input: Record<string, unknown> | undefined,
    _context: TemplateRenderContext,
  ): Promise<StepResult> {
    const skillId = step.skill
    if (!skillId) {
      return { status: 'failed', error: '步骤缺少 skill 字段' }
    }

    const skill = this.skillRegistry.get(skillId)
    if (!skill) {
      return { status: 'failed', error: `Skill 不存在: ${skillId}` }
    }

    try {
      const plan = await this.skillExecutor.execute({
        skill,
        userInput: input ? JSON.stringify(input) : '',
        parentTraceId: '',
      })

      logger.info('[SkillStep] Skill 执行计划创建成功', { skillId })

      return {
        status: 'completed',
        output: {
          promptParts: plan.additionalPromptParts.length,
          toolFilter: plan.toolFilter,
        },
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error('[SkillStep] Skill 执行失败', { skillId, error: errorMsg })
      return { status: 'failed', error: errorMsg }
    }
  }
}
