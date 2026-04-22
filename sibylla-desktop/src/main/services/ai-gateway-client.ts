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
  private readonly maxRetries: number
  private readonly baseDelayMs: number

  constructor(baseUrl: string = 'http://localhost:3000', maxRetries: number = 3, baseDelayMs: number = 1000) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.maxRetries = maxRetries
    this.baseDelayMs = baseDelayMs
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) return false
    const msg = error.message.toLowerCase()
    return (
      msg.includes('rate limit') ||
      msg.includes('429') ||
      msg.includes('timeout') ||
      msg.includes('etimedout') ||
      msg.includes('network') ||
      msg.includes('econnrefused') ||
      msg.includes('enetunreach') ||
      msg.includes('fetch failed')
    )
  }

  createSession(options: { role: AiGatewaySessionRole }, accessToken?: string): AiGatewaySession {
    return new AiGatewaySession(this, options.role, accessToken)
  }

  async *chatStream(
    request: AiGatewayChatRequest,
    accessToken?: string,
    signal?: AbortSignal
  ): AsyncGenerator<string, void, undefined> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = this.baseDelayMs * Math.pow(2, attempt - 1)
        const jitter = Math.random() * delay * 0.2
        logger.info('[AiGatewayClient] Retrying stream request', {
          attempt,
          delayMs: delay + jitter,
        })
        await this.sleep(delay + jitter)
        if (signal?.aborted) return
      }

      try {
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

        yield* this.parseSSEStream(response.body)
        return
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (signal?.aborted) {
          return
        }

        if (!this.isRetryableError(lastError) || attempt === this.maxRetries) {
          throw lastError
        }

        logger.warn('[AiGatewayClient] Stream request failed, will retry', {
          attempt: attempt + 1,
          maxRetries: this.maxRetries,
          error: lastError.message,
        })
      }
    }

    throw lastError
  }

  private async *parseSSEStream(body: ReadableStream<Uint8Array>): AsyncGenerator<string, void, undefined> {
    const reader = body.getReader()
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

export type AiGatewaySessionRole = 'generator' | 'evaluator' | 'memory-extractor' | 'memory-compressor'

export class AiGatewaySession {
  readonly sessionId: string
  readonly role: AiGatewaySessionRole
  private readonly client: AiGatewayClient
  private readonly accessToken?: string
  private chatCallCount = 0

  constructor(client: AiGatewayClient, role: AiGatewaySessionRole, accessToken?: string) {
    this.client = client
    this.role = role
    this.sessionId = `session-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    this.accessToken = accessToken
  }

  async chat(request: AiGatewayChatRequest): Promise<AiGatewayChatResponse> {
    this.chatCallCount += 1
    return this.client.chat(request, this.accessToken)
  }

  async *chatStream(request: AiGatewayChatRequest, signal?: AbortSignal): AsyncGenerator<string, void, undefined> {
    yield* this.client.chatStream(request, this.accessToken, signal)
  }

  /**
   * Close the session and release resources.
   * Currently a noop — AiGatewaySession delegates to stateless HTTP calls on AiGatewayClient.
   * If future versions introduce persistent connections (WebSocket, SSE keepalive),
   * this method must be updated to perform actual cleanup.
   */
  close(): void {
    logger.info('[AiGatewaySession] Session closed', {
      sessionId: this.sessionId,
      role: this.role,
      chatCalls: this.chatCallCount,
    })
  }
}
