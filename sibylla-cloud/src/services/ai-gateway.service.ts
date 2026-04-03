import { config } from '../config/index.js'
import { logger } from '../utils/logger.js'

type AiProvider = 'openai' | 'anthropic' | 'mock'

export interface GatewayChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface GatewayChatRequest {
  model: string
  messages: GatewayChatMessage[]
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

export interface GatewayUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number
}

export interface GatewayChatResponse {
  id: string
  model: string
  provider: AiProvider
  content: string
  finishReason: string | null
  usage: GatewayUsage
  intercepted: boolean
  warnings: string[]
}

export interface GatewayEmbeddingRequest {
  input: string | string[]
  model?: string
  dimensions?: number
}

export interface GatewayEmbeddingResponse {
  provider: AiProvider
  model: string
  vectors: number[][]
  warnings: string[]
}

export class AiGatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'AiGatewayError'
  }
}

interface InterceptedChatRequest {
  sanitizedMessages: GatewayChatMessage[]
  estimatedInputTokens: number
  warnings: string[]
}

interface UsageCounter {
  date: string
  tokens: number
}

const usageCounters = new Map<string, UsageCounter>()

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bghp_[A-Za-z0-9]{20,}\b/g,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/g,
]

const MODEL_PRICING_PER_1K = {
  default: 0.01,
  claude: 0.012,
  gpt: 0.01,
} as const

function estimateTokensFromText(input: string): number {
  return Math.max(1, Math.ceil(input.length / 4))
}

function estimateTokensFromMessages(messages: GatewayChatMessage[]): number {
  return messages.reduce((total, message) => {
    return total + estimateTokensFromText(message.content)
  }, 0)
}

function getPricingPer1k(model: string): number {
  const loweredModel = model.toLowerCase()
  if (loweredModel.includes('claude')) {
    return MODEL_PRICING_PER_1K['claude']
  }
  if (loweredModel.includes('gpt') || loweredModel.startsWith('o')) {
    return MODEL_PRICING_PER_1K['gpt']
  }
  return MODEL_PRICING_PER_1K['default']
}

function estimateCostUsd(totalTokens: number, model: string): number {
  const per1k = getPricingPer1k(model)
  return Number(((totalTokens / 1000) * per1k).toFixed(6))
}

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0] ?? 'unknown-date'
}

function ensureUserQuota(userId: string, estimatedTokens: number): void {
  const today = getTodayKey()
  const counter = usageCounters.get(userId)
  const current = counter?.date === today ? counter.tokens : 0
  const nextTotal = current + estimatedTokens

  if (nextTotal > config.ai.dailyTokenLimit) {
    throw new AiGatewayError(
      'AI_DAILY_QUOTA_EXCEEDED',
      'Daily AI token quota exceeded for current user',
      429,
      {
        current,
        requested: estimatedTokens,
        limit: config.ai.dailyTokenLimit,
      }
    )
  }
}

function recordUsage(userId: string, consumedTokens: number): void {
  const today = getTodayKey()
  const counter = usageCounters.get(userId)

  if (!counter || counter.date !== today) {
    usageCounters.set(userId, { date: today, tokens: consumedTokens })
    return
  }

  usageCounters.set(userId, { date: today, tokens: counter.tokens + consumedTokens })
}

function selectProvider(model: string): AiProvider {
  const loweredModel = model.toLowerCase()
  if (loweredModel.includes('claude')) {
    return 'anthropic'
  }
  if (
    loweredModel.includes('gpt') ||
    loweredModel.startsWith('o') ||
    loweredModel.includes('text-embedding')
  ) {
    return 'openai'
  }
  return 'openai'
}

function sanitizeMessageContent(content: string): { content: string; warnings: string[] } {
  let sanitizedContent = content
  const warnings: string[] = []

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(sanitizedContent)) {
      sanitizedContent = sanitizedContent.replace(pattern, '[REDACTED_SECRET]')
      warnings.push('Sensitive token-like content was redacted by gateway policy')
    }
    pattern.lastIndex = 0
  }

  return { content: sanitizedContent, warnings }
}

function interceptChatRequest(userId: string, input: GatewayChatRequest): InterceptedChatRequest {
  if (input.messages.length === 0) {
    throw new AiGatewayError('AI_EMPTY_MESSAGES', 'Messages cannot be empty', 400)
  }

  const warnings: string[] = []
  const sanitizedMessages: GatewayChatMessage[] = input.messages.map((message) => {
    const { content, warnings: localWarnings } = sanitizeMessageContent(message.content)
    warnings.push(...localWarnings)
    return { ...message, content }
  })

  const estimatedInputTokens = estimateTokensFromMessages(sanitizedMessages)
  if (estimatedInputTokens > config.ai.maxInputTokens) {
    throw new AiGatewayError(
      'AI_INPUT_TOO_LARGE',
      'Input exceeds maximum token budget',
      413,
      {
        estimatedInputTokens,
        maxInputTokens: config.ai.maxInputTokens,
      }
    )
  }

  ensureUserQuota(userId, estimatedInputTokens)

  return {
    sanitizedMessages,
    estimatedInputTokens,
    warnings,
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, config.ai.gatewayTimeoutMs)

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    })
    return response
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiGatewayError('AI_GATEWAY_TIMEOUT', 'AI upstream request timed out', 504)
    }
    throw new AiGatewayError(
      'AI_GATEWAY_NETWORK_ERROR',
      error instanceof Error ? error.message : 'AI upstream network request failed',
      502
    )
  } finally {
    clearTimeout(timeout)
  }
}

async function parseErrorResponse(response: Response): Promise<AiGatewayError> {
  let details: unknown
  let message = `Upstream AI provider error: ${response.status}`

  try {
    details = await response.json()
    if (
      typeof details === 'object' &&
      details !== null &&
      'error' in details &&
      typeof (details as { error?: unknown }).error === 'object'
    ) {
      const errObj = (details as { error?: { message?: string } }).error
      if (errObj?.message) {
        message = errObj.message
      }
    }
  } catch {
    details = undefined
  }

  return new AiGatewayError('AI_UPSTREAM_ERROR', message, 502, details)
}

async function forwardToOpenAI(
  request: GatewayChatRequest,
  messages: GatewayChatMessage[],
  estimatedInputTokens: number
): Promise<GatewayChatResponse> {
  if (!config.ai.openaiApiKey) {
    return {
      id: `mock-openai-${Date.now()}`,
      model: request.model,
      provider: 'mock',
      content: 'OpenAI API key is not configured. Returning gateway mock response.',
      finishReason: 'stop',
      usage: {
        inputTokens: estimatedInputTokens,
        outputTokens: 16,
        totalTokens: estimatedInputTokens + 16,
        estimatedCostUsd: estimateCostUsd(estimatedInputTokens + 16, request.model),
      },
      intercepted: false,
      warnings: ['OPENAI_API_KEY is not configured, using mock response'],
    }
  }

  interface OpenAiResponse {
    id: string
    model: string
    choices: Array<{
      finish_reason: string | null
      message?: {
        content?: string | null
      }
    }>
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
      total_tokens?: number
    }
  }

  const response = await fetchWithTimeout(`${config.ai.openaiBaseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.ai.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: request.model,
      messages,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 1024,
      stream: false,
    }),
  })

  if (!response.ok) {
    throw await parseErrorResponse(response)
  }

  const body = (await response.json()) as OpenAiResponse
  const firstChoice = body.choices[0]
  const content = firstChoice?.message?.content ?? ''
  const usage = {
    inputTokens: body.usage?.prompt_tokens ?? estimatedInputTokens,
    outputTokens: body.usage?.completion_tokens ?? estimateTokensFromText(content),
    totalTokens:
      body.usage?.total_tokens ??
      (body.usage?.prompt_tokens ?? estimatedInputTokens) +
        (body.usage?.completion_tokens ?? estimateTokensFromText(content)),
  }

  return {
    id: body.id,
    model: body.model,
    provider: 'openai',
    content,
    finishReason: firstChoice?.finish_reason ?? null,
    usage: {
      ...usage,
      estimatedCostUsd: estimateCostUsd(usage.totalTokens, body.model),
    },
    intercepted: false,
    warnings: [],
  }
}

async function forwardToAnthropic(
  request: GatewayChatRequest,
  messages: GatewayChatMessage[],
  estimatedInputTokens: number
): Promise<GatewayChatResponse> {
  if (!config.ai.anthropicApiKey) {
    return {
      id: `mock-anthropic-${Date.now()}`,
      model: request.model,
      provider: 'mock',
      content: 'Anthropic API key is not configured. Returning gateway mock response.',
      finishReason: 'stop',
      usage: {
        inputTokens: estimatedInputTokens,
        outputTokens: 16,
        totalTokens: estimatedInputTokens + 16,
        estimatedCostUsd: estimateCostUsd(estimatedInputTokens + 16, request.model),
      },
      intercepted: false,
      warnings: ['ANTHROPIC_API_KEY is not configured, using mock response'],
    }
  }

  interface AnthropicResponse {
    id: string
    model: string
    stop_reason?: string | null
    content?: Array<{ type: string; text?: string }>
    usage?: {
      input_tokens?: number
      output_tokens?: number
    }
  }

  const systemPrompts = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
  const conversation = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: message.content,
    }))

  const payload: {
    model: string
    max_tokens: number
    temperature: number
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    system?: string
  } = {
    model: request.model,
    max_tokens: request.maxTokens ?? 1024,
    temperature: request.temperature ?? 0.2,
    messages: conversation,
  }
  if (systemPrompts.length > 0) {
    payload.system = systemPrompts.join('\n\n')
  }

  const response = await fetchWithTimeout(`${config.ai.anthropicBaseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.ai.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw await parseErrorResponse(response)
  }

  const body = (await response.json()) as AnthropicResponse
  const contentText = (body.content ?? [])
    .filter((item) => item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text ?? '')
    .join('\n')
    .trim()
  const outputTokens = body.usage?.output_tokens ?? estimateTokensFromText(contentText)
  const inputTokens = body.usage?.input_tokens ?? estimatedInputTokens
  const totalTokens = inputTokens + outputTokens

  return {
    id: body.id,
    model: body.model,
    provider: 'anthropic',
    content: contentText,
    finishReason: body.stop_reason ?? null,
    usage: {
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCostUsd: estimateCostUsd(totalTokens, body.model),
    },
    intercepted: false,
    warnings: [],
  }
}

function generateLocalEmbedding(text: string, dimensions: number): number[] {
  const vector = new Array<number>(dimensions).fill(0)
  const normalized = text.toLowerCase()

  for (let i = 0; i < normalized.length; i += 1) {
    const code = normalized.charCodeAt(i)
    const slot = code % dimensions
    vector[slot] = (vector[slot] ?? 0) + 1
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (norm > 0) {
    for (let i = 0; i < vector.length; i += 1) {
      vector[i] = Number(((vector[i] ?? 0) / norm).toFixed(8))
    }
  }

  return vector
}

export class AiGatewayService {
  static async chat(userId: string, request: GatewayChatRequest): Promise<GatewayChatResponse> {
    const intercepted = interceptChatRequest(userId, request)
    const provider = selectProvider(request.model)

    let result: GatewayChatResponse
    if (provider === 'anthropic') {
      result = await forwardToAnthropic(request, intercepted.sanitizedMessages, intercepted.estimatedInputTokens)
    } else {
      result = await forwardToOpenAI(request, intercepted.sanitizedMessages, intercepted.estimatedInputTokens)
    }

    const combinedWarnings = [...intercepted.warnings, ...result.warnings]
    const response: GatewayChatResponse = {
      ...result,
      intercepted: combinedWarnings.length > 0,
      warnings: combinedWarnings,
    }

    recordUsage(userId, response.usage.totalTokens)

    logger.info(
      {
        userId,
        provider: response.provider,
        model: response.model,
        tokens: response.usage,
        intercepted: response.intercepted,
      },
      'AI gateway request completed'
    )

    return response
  }

  static async embeddings(
    userId: string,
    request: GatewayEmbeddingRequest
  ): Promise<GatewayEmbeddingResponse> {
    const inputs = Array.isArray(request.input) ? request.input : [request.input]
    const dimensions = request.dimensions ?? 128
    const totalEstimatedTokens = inputs.reduce((sum, input) => sum + estimateTokensFromText(input), 0)
    ensureUserQuota(userId, totalEstimatedTokens)

    if (config.ai.openaiApiKey) {
      interface OpenAiEmbeddingResponse {
        data: Array<{ embedding: number[] }>
        model: string
      }

      const model = request.model ?? 'text-embedding-3-small'
      const response = await fetchWithTimeout(`${config.ai.openaiBaseUrl}/v1/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.ai.openaiApiKey}`,
        },
        body: JSON.stringify({
          model,
          input: inputs,
          dimensions,
        }),
      })

      if (!response.ok) {
        throw await parseErrorResponse(response)
      }

      const body = (await response.json()) as OpenAiEmbeddingResponse
      recordUsage(userId, totalEstimatedTokens)

      return {
        provider: 'openai',
        model: body.model,
        vectors: body.data.map((item) => item.embedding),
        warnings: [],
      }
    }

    const vectors = inputs.map((input) => generateLocalEmbedding(input, dimensions))
    recordUsage(userId, totalEstimatedTokens)
    return {
      provider: 'mock',
      model: request.model ?? 'local-hash-embedding-v1',
      vectors,
      warnings: ['OPENAI_API_KEY is not configured, using local hash embedding fallback'],
    }
  }

  static async summarize(
    userId: string,
    text: string,
    model?: string
  ): Promise<GatewayChatResponse> {
    const summarizeRequest: GatewayChatRequest = {
      model: model ?? 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a summarization engine. Produce concise, structured Chinese markdown with key decisions, risks, and next actions.',
        },
        {
          role: 'user',
          content: text,
        },
      ],
      temperature: 0.1,
      maxTokens: 512,
      stream: false,
    }

    return this.chat(userId, summarizeRequest)
  }
}
