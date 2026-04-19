/**
 * Generator — AI 产出封装层
 *
 * 职责：
 * 1. 接收用户请求和组装后的上下文，通过独立 session 调用 LLM 生成初始建议
 * 2. 接收 Evaluator 拒绝报告，通过新 session 调用 LLM 进行改进
 * 3. 所有异常向上抛出，不在 Generator 内部吞掉
 */

import type { AIChatRequest, AIChatResponse, AssembledContext, EvaluationReport } from '../../../shared/types'
import type { AiGatewayClient, AiGatewayChatResponse } from '../ai-gateway-client'
import type { logger as loggerType } from '../../utils/logger'

export interface GeneratorGenerateInput {
  readonly request: AIChatRequest
  readonly context: AssembledContext
}

export interface GeneratorRefineInput {
  readonly originalRequest: AIChatRequest
  readonly previousResponse: AIChatResponse
  readonly rejectionReport: EvaluationReport
  readonly context: AssembledContext
  readonly attemptNumber: number
}

export class Generator {
  constructor(
    private readonly gateway: AiGatewayClient,
    private readonly defaultModel: string,
    private readonly logger: typeof loggerType
  ) {}

  async generate(input: GeneratorGenerateInput): Promise<AIChatResponse> {
    const session = this.gateway.createSession({ role: 'generator' })

    try {
      const model = input.request.model ?? this.defaultModel
      const temperature = input.request.temperature ?? 0.7

      const response = await session.chat({
        model,
        messages: [
          { role: 'system', content: input.context.systemPrompt },
          { role: 'user', content: input.request.message },
        ],
        temperature,
        maxTokens: input.request.maxTokens,
      })

      this.logger.info('harness.generator.generated', {
        sessionId: session.sessionId,
        model: response.model,
        totalTokens: response.usage.totalTokens,
      })

      return this.mapToAIChatResponse(response)
    } finally {
      session.close()
    }
  }

  async refine(input: GeneratorRefineInput): Promise<AIChatResponse> {
    const session = this.gateway.createSession({ role: 'generator' })

    try {
      const model = input.originalRequest.model ?? this.defaultModel
      const refinePrompt = this.formatRefinePrompt(input)

      const response = await session.chat({
        model,
        messages: [
          { role: 'system', content: input.context.systemPrompt },
          { role: 'user', content: input.originalRequest.message },
          { role: 'assistant', content: input.previousResponse.content },
          { role: 'user', content: refinePrompt },
        ],
        temperature: 0.5,
        maxTokens: input.originalRequest.maxTokens,
      })

      this.logger.info('harness.generator.refined', {
        sessionId: session.sessionId,
        attempt: input.attemptNumber,
        model: response.model,
        totalTokens: response.usage.totalTokens,
      })

      return this.mapToAIChatResponse(response)
    } finally {
      session.close()
    }
  }

  private formatRefinePrompt(input: GeneratorRefineInput): string {
    const { rejectionReport, attemptNumber } = input
    const parts: string[] = ['评审者拒绝了你的上次建议，原因如下：\n']

    for (const issue of rejectionReport.criticalIssues) {
      parts.push(`严重问题: ${issue}`)
    }
    for (const issue of rejectionReport.minorIssues) {
      parts.push(`次要问题: ${issue}`)
    }

    for (const [dimensionName, dimension] of Object.entries(rejectionReport.dimensions)) {
      if (!dimension.pass) {
        const issuesList = dimension.issues.join('; ')
        parts.push(`${dimensionName}: ${issuesList}`)
      }
    }

    parts.push(`\n请根据以上反馈重新生成建议。这是第 ${attemptNumber} 次改进。`)
    return parts.join('\n')
  }

  private mapToAIChatResponse(response: AiGatewayChatResponse): AIChatResponse {
    return {
      id: response.id,
      model: response.model,
      provider: response.provider,
      content: response.content,
      usage: response.usage,
      intercepted: response.intercepted,
      warnings: [...response.warnings],
      ragHits: [],
      memory: { tokenCount: 0, tokenDebt: 0, flushTriggered: false },
    }
  }
}
