import crypto from 'crypto'
import type { AiGatewayClient, AiGatewaySession } from '../ai-gateway-client'
import type { AiModeRegistry } from '../mode/ai-mode-registry'
import type { Tracer } from '../trace/tracer'
import type { Span } from '../trace/types'
import { OPTIMIZER_SYSTEM_PROMPT, MODE_OPTIMIZATION_HINTS } from './optimizer-prompts'
import type {
  OptimizeRequest,
  OptimizeResponse,
  OptimizationSuggestion,
  OptimizerConfig,
} from './types'
import { OptimizationError } from './types'

interface CacheEntry {
  response: OptimizeResponse
  expiresAt: number
}

export class PromptOptimizer {
  private readonly cache: Map<string, CacheEntry> = new Map()
  private readonly requestCount: Map<string, number> = new Map()

  constructor(
    private readonly aiGateway: AiGatewayClient,
    private readonly modeRegistry: AiModeRegistry,
    private readonly tracer: Tracer,
    private readonly config: OptimizerConfig,
  ) {}

  async optimize(request: OptimizeRequest): Promise<OptimizeResponse> {
    return this.tracer.withSpan(
      'prompt.optimize',
      async (span: Span) => {
        span.setAttributes({
          'prompt.original_length': request.originalText.length,
          'prompt.mode': request.currentMode,
          'prompt.has_context': !!request.conversationContext,
        })

        const cacheKey = this.buildCacheKey(request)
        const cached = this.getFromCache(cacheKey)
        if (cached) {
          span.setAttribute('prompt.cache_hit', true)
          return cached
        }

        const mode = this.modeRegistry.get(request.currentMode)
        const modeContext = mode
          ? `用户选择的是 ${mode.label} 模式：${mode.description}。优化建议应侧重：${MODE_OPTIMIZATION_HINTS.get(request.currentMode) ?? '通用优化'}`
          : '用户在自由模式'

        const systemPrompt = OPTIMIZER_SYSTEM_PROMPT
          .replace('{{mode}}', request.currentMode)
          .replace('{{modeContext}}', modeContext)
          .replace('{{contextSummary}}', request.conversationContext?.summary ?? '（无）')
          .replace('{{originalText}}', request.originalText)

        const startTime = Date.now()
        const session: AiGatewaySession = this.aiGateway.createSession({ role: 'optimizer' })
        try {
          const response = await Promise.race([
            session.chat({
              model: this.config.optimizerModel,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: 'Generate optimization suggestions.' },
              ],
              temperature: 0.3,
              maxTokens: 1200,
            }),
            this.createTimeout(this.config.timeoutMs),
          ])

          const parsed = this.parseResponse(response.content)
          const result: OptimizeResponse = {
            requestId: span.context.spanId,
            suggestions: parsed.suggestions.slice(0, this.config.maxSuggestions).map((s: Partial<OptimizationSuggestion> & { text: string; rationale: string; keyChanges: OptimizationSuggestion['keyChanges']; estimatedImprovementScore: number }, i: number) => ({
              id: `sug-${span.context.spanId}-${i}`,
              text: s.text,
              rationale: s.rationale,
              keyChanges: s.keyChanges ?? [],
              estimatedImprovementScore: Math.min(1, Math.max(0, s.estimatedImprovementScore ?? 0.5)),
            })),
            optimizationMode: 'quick',
            durationMs: Date.now() - startTime,
          }

          span.setAttributes({
            'prompt.suggestion_count': result.suggestions.length,
            'prompt.duration_ms': result.durationMs,
          })

          this.setToCache(cacheKey, result)
          return result
        } finally {
          session.close()
        }
      },
      { kind: 'ai-call' },
    )
  }

  async recordUserAction(
    requestId: string,
    action: 'applied' | 'merged' | 'edited' | 'ignored',
    suggestionId?: string,
  ): Promise<void> {
    await this.tracer.withSpan(
      'prompt.optimize.user-action',
      async (span: Span) => {
        span.setAttributes({
          'prompt.optimize.request_id': requestId,
          'prompt.optimize.action': action,
          'prompt.optimize.suggestion_id': suggestionId ?? '',
        })
      },
      { kind: 'user-action' },
    )
  }

  incrementSessionCount(sessionId: string): number {
    const count = (this.requestCount.get(sessionId) ?? 0) + 1
    this.requestCount.set(sessionId, count)
    return count
  }

  private parseResponse(content: string): { suggestions: Array<Partial<OptimizationSuggestion> & { text: string; rationale: string; keyChanges: OptimizationSuggestion['keyChanges']; estimatedImprovementScore: number }> } {
    try {
      const parsed = JSON.parse(content)
      if (Array.isArray(parsed.suggestions)) {
        return parsed
      }
    } catch {
      // fallback to markdown code block extraction
    }

    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch?.[1]) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1])
        if (Array.isArray(parsed.suggestions)) {
          return parsed
        }
      } catch {
        // still failed
      }
    }

    throw new OptimizationError('Cannot parse optimizer response')
  }

  private buildCacheKey(req: OptimizeRequest): string {
    const raw = JSON.stringify({
      text: req.originalText.trim(),
      mode: req.currentMode,
      contextSummary: req.conversationContext?.summary ?? '',
    })
    return crypto.createHash('sha256').update(raw).digest('hex')
  }

  private getFromCache(key: string): OptimizeResponse | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }
    return entry.response
  }

  private setToCache(key: string, response: OptimizeResponse): void {
    this.evictExpired()
    if (this.cache.size >= this.config.maxCacheSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) {
        this.cache.delete(firstKey)
      }
    }
    this.cache.set(key, {
      response,
      expiresAt: Date.now() + this.config.cacheTtlMs,
    })
  }

  private evictExpired(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
      }
    }
  }

  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new OptimizationError('优化请求超时')), ms)
    })
  }
}
