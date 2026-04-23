import type { SkillV2, SkillExecutionPlan, SkillResult } from '../../../shared/types'
import type { FileManager } from '../file-manager'
import type { SkillResources, SkillExecutionContext } from './types'
import type { Tracer } from '../trace/tracer'
import { logger } from '../../utils/logger'

export class SkillNotAllowedError extends Error {
  constructor(skillId: string, invalidTools: string[]) {
    super(`Skill "${skillId}" declares tools not available in parent agent: ${invalidTools.join(', ')}`)
    this.name = 'SkillNotAllowedError'
  }
}

export class SkillExecutor {
  constructor(
    private readonly fileManager: FileManager,
    private readonly tokenEstimator: (text: string) => number,
    private readonly tracer?: Tracer,
    private readonly parentAllowedTools?: string[],
  ) {}

  validateAllowedTools(skill: SkillV2): void {
    if (!skill.allowedTools || skill.allowedTools.length === 0) return
    if (!this.parentAllowedTools || this.parentAllowedTools.length === 0) return

    const parentSet = new Set(this.parentAllowedTools)
    const invalidTools = skill.allowedTools.filter((t) => !parentSet.has(t))
    if (invalidTools.length > 0) {
      throw new SkillNotAllowedError(skill.id, invalidTools)
    }
  }

  async execute(ctx: SkillExecutionContext): Promise<SkillExecutionPlan> {
    const { skill, parentTraceId } = ctx

    this.validateAllowedTools(skill)

    const span = this.tracer?.startSpan('skill.invocation', {
      attributes: {
        'skill.id': skill.id,
        'skill.version': skill.version,
        'skill.formatVersion': skill.formatVersion,
        'skill.source': skill.source,
      },
      kind: 'internal',
    })

    try {
      const resources = await this.loadSkillResources(skill)

      const trimmedExamples = this.trimExamples(
        resources.examples,
        skill.estimatedTokens ?? resources.totalTokens,
      )

      const additionalPromptParts = [
        resources.prompt,
        ...trimmedExamples,
      ]

      const plan: SkillExecutionPlan = {
        skill,
        additionalPromptParts,
        toolFilter: skill.allowedTools,
        budget: resources.toolsConfig?.budget,
      }

      logger.info('[SkillExecutor] Execution plan created', {
        skillId: skill.id,
        promptParts: additionalPromptParts.length,
        toolFilter: skill.allowedTools?.length ?? 'all',
        parentTraceId,
      })

      span?.setAttributes({ 'skill.success': true })
      return plan
    } catch (error) {
      span?.setAttributes({
        'skill.success': false,
        'skill.error': error instanceof Error ? error.message : String(error),
      })
      throw error
    } finally {
      if (span && !span.isFinalized()) {
        span.end()
      }
    }
  }

  async loadSkillResources(skill: SkillV2): Promise<SkillResources> {
    let prompt = skill.instructions
    const examples: string[] = []

    if (skill.formatVersion === 2) {
      const dirPath = skill.filePath

      try {
        const promptResult = await this.fileManager.readFile(`${dirPath}/prompt.md`)
        prompt = promptResult.content
      } catch {
        // fallback to skill.instructions
      }

      try {
        const exampleFiles = await this.fileManager.listFiles(
          `${dirPath}/examples`,
          { recursive: false },
        )
        for (const file of exampleFiles) {
          if (!file.isDirectory && file.path.endsWith('.md')) {
            try {
              const result = await this.fileManager.readFile(file.path)
              examples.push(result.content)
            } catch {
              // skip unreadable examples
            }
          }
        }
      } catch {
        // examples dir optional
      }
    }

    if (skill.examples && examples.length === 0) {
      examples.push(skill.examples)
    }

    let toolsConfig: SkillResources['toolsConfig'] = null
    if (skill.formatVersion === 2) {
      try {
        const toolsResult = await this.fileManager.readFile(`${skill.filePath}/tools.yaml`)
        toolsConfig = this.parseToolsYaml(toolsResult.content)
      } catch {
        // optional
      }
    }

    const allText = prompt + '\n' + examples.join('\n')
    const totalTokens = this.tokenEstimator(allText)

    return {
      prompt,
      examples,
      toolsConfig,
      totalTokens,
    }
  }

  private trimExamples(examples: string[], estimatedTokens: number): string[] {
    if (examples.length === 0) return []

    const maxExampleTokens = Math.floor(estimatedTokens * 0.5)

    const exampleTokens = examples.map((e) => this.tokenEstimator(e))
    const totalExampleTokens = exampleTokens.reduce((sum, t) => sum + t, 0)

    if (totalExampleTokens <= maxExampleTokens) {
      return examples
    }

    const sortedByTokens = examples
      .map((e, i) => ({ content: e, tokens: exampleTokens[i] }))
      .sort((a, b) => a.tokens - b.tokens)

    const trimmed: string[] = []
    let used = 0
    for (const item of sortedByTokens) {
      if (used + item.tokens > maxExampleTokens) break
      trimmed.push(item.content)
      used += item.tokens
    }

    if (trimmed.length === 0 && sortedByTokens.length > 0) {
      trimmed.push(sortedByTokens[0].content)
    }

    logger.debug('[SkillExecutor] Examples trimmed', {
      original: examples.length,
      trimmed: trimmed.length,
      maxTokens: maxExampleTokens,
    })

    return trimmed.slice(0, 3)
  }

  private parseToolsYaml(
    content: string,
  ): { allowed_tools: string[]; required_context?: string[]; budget?: { max_tokens: number; max_tool_calls: number } } | null {
    const result: Record<string, unknown> = {}
    let currentKey = ''
    let currentArray: string[] = []
    let inArray = false

    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      if (inArray && trimmed.startsWith('- ')) {
        currentArray.push(trimmed.slice(2).trim().replace(/^["']|["']$/g, ''))
        continue
      }

      if (inArray && currentKey) {
        result[currentKey] = currentArray
        inArray = false
      }

      const colonIdx = trimmed.indexOf(':')
      if (colonIdx < 0) continue

      const key = trimmed.slice(0, colonIdx).trim()
      const value = trimmed.slice(colonIdx + 1).trim()

      if (!value) {
        currentKey = key
        currentArray = []
        inArray = true
      } else if (value.startsWith('[') && value.endsWith(']')) {
        const inner = value.slice(1, -1).trim()
        result[key] = inner
          ? inner.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''))
          : []
      } else if (/^\d+$/.test(value)) {
        result[key] = parseInt(value, 10)
      } else {
        result[key] = value.replace(/^["']|["']$/g, '')
      }
    }

    if (inArray && currentKey) {
      result[currentKey] = currentArray
    }

    return Object.keys(result).length > 0
      ? (result as { allowed_tools: string[]; required_context?: string[]; budget?: { max_tokens: number; max_tool_calls: number } })
      : null
  }

  recordResult(skillId: string, result: SkillResult): void {
    const span = this.tracer?.startSpan('skill.result', {
      attributes: {
        'skill.id': skillId,
        'skill.result.success': result.success,
        'skill.result.tokensUsed': result.tokensUsed,
        'skill.result.toolCallsCount': result.toolCallsCount,
      },
      kind: 'internal',
    })

    if (span && !span.isFinalized()) {
      span.end()
    }

    logger.info('[SkillExecutor] Skill execution result recorded', {
      skillId,
      success: result.success,
      tokensUsed: result.tokensUsed,
      toolCallsCount: result.toolCallsCount,
    })
  }
}
