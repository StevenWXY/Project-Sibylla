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

  async *chatStream(
    request: AiGatewayChatRequest,
    accessToken?: string,
    signal?: AbortSignal
  ): AsyncGenerator<string, void, undefined> {
    const response = await fetch(`${this.baseUrl}/api/v1/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ ...request, stream: true }),
      signal,
    })

    if (!response.ok) {
      const fallbackText = await response.text()
      throw new Error(`AI gateway stream request failed: ${response.status} ${fallbackText}`)
    }

    if (!response.body) {
      throw new Error('AI gateway stream response body is null')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') return

          try {
            const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }
            const content = parsed.choices?.[0]?.delta?.content
            if (content) {
              yield content
            }
          } catch {
            yield data
          }
        }
      }

      if (buffer.trim()) {
        const trimmed = buffer.trim()
        if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
          const data = trimmed.slice(6)
          try {
            const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }
            const content = parsed.choices?.[0]?.delta?.content
            if (content) {
              yield content
            }
          } catch {
            yield data
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
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
