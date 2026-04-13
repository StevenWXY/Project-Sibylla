import { logger } from '../utils/logger'

export interface AiGatewayChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AiGatewayChatRequest {
  model: string
  messages: AiGatewayChatMessage[]
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

export interface AiGatewayChatResponse {
  id: string
  model: string
  provider: 'openai' | 'anthropic' | 'mock'
  content: string
  finishReason: string | null
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    estimatedCostUsd: number
  }
  intercepted: boolean
  warnings: string[]
}

export class AiGatewayClient {
  private readonly baseUrl: string

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
  }

  async chat(request: AiGatewayChatRequest, accessToken?: string): Promise<AiGatewayChatResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const fallbackText = await response.text()
        throw new Error(`AI gateway request failed: ${response.status} ${fallbackText}`)
      }

      return (await response.json()) as AiGatewayChatResponse
    } catch (error) {
      const estimatedInputTokens = request.messages.reduce((sum, message) => {
        return sum + Math.max(1, Math.ceil(message.content.length / 4))
      }, 0)

      logger.warn('[AiGatewayClient] Using local fallback due to gateway error', {
        error: error instanceof Error ? error.message : String(error),
      })

      return {
        id: `desktop-fallback-${Date.now()}`,
        model: request.model,
        provider: 'mock',
        content: '云端 LLM Gateway 当前不可用，已切换到本地回退响应。',
        finishReason: 'stop',
        usage: {
          inputTokens: estimatedInputTokens,
          outputTokens: 20,
          totalTokens: estimatedInputTokens + 20,
          estimatedCostUsd: 0,
        },
        intercepted: false,
        warnings: ['Cloud AI gateway unavailable; desktop fallback response applied'],
      }
    }
  }
}
