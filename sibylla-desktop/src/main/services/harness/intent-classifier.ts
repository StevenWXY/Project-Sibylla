/**
 * IntentClassifier — Rule-based + LLM fallback intent classification
 *
 * Classifies user requests into one of 5 intent categories:
 * chat, edit_file, analyze, plan, search
 *
 * Strategy:
 * - Rule-based classification handles ~95% of requests (< 5ms)
 * - LLM fallback handles ambiguous cases (~5% of requests)
 * - 3-second timeout on LLM calls with automatic fallback to chat
 *
 * @see plans/phase1-task020-tool-scope-intent-classifier-plan.md §五
 */

import type { AIChatRequest } from '../../../shared/types'
import type { AiGatewayClient } from '../ai-gateway-client'
import type { logger as loggerType } from '../../utils/logger'
import type { HarnessIntent } from './tool-scope'

// ─── Classification Result Types ───

export interface ClassifyResult {
  readonly intent: HarnessIntent
  readonly confidence: number
  readonly source: 'rule' | 'llm' | 'fallback'
  readonly elapsedMs: number
}

export interface ClassifierConfig {
  readonly classifierModel: string
  readonly llmTimeoutMs: number
  readonly confidenceThreshold: number
}

export const DEFAULT_CLASSIFIER_CONFIG: ClassifierConfig = {
  classifierModel: 'claude-3-haiku-20240307',
  llmTimeoutMs: 3000,
  confidenceThreshold: 0.8,
}

// ─── Valid intents for LLM response parsing ───

const VALID_INTENTS: readonly HarnessIntent[] = ['chat', 'edit_file', 'analyze', 'plan', 'search']

// ─── IntentClassifier Class ───

export class IntentClassifier {
  private readonly CLASSIFIER_SYSTEM_PROMPT = `Classify the user message into exactly one intent:
- chat: general conversation, greeting, casual question
- edit_file: wants to modify, create, delete, or rename a file
- analyze: wants analysis, comparison, evaluation, or explanation
- plan: wants planning, task breakdown, roadmap, or strategy
- search: wants to search, find, or locate something

Reply with ONLY the intent label, nothing else.`

  constructor(
    private readonly gateway: AiGatewayClient,
    private readonly config: ClassifierConfig = DEFAULT_CLASSIFIER_CONFIG,
    private readonly logger: typeof loggerType,
  ) {}

  /**
   * Classify a request's intent.
   *
   * 1. Try rule-based classification first
   * 2. If confidence > threshold, return immediately (< 5ms)
   * 3. Otherwise fall back to LLM classification (3s timeout)
   */
  async classify(request: AIChatRequest): Promise<ClassifyResult> {
    const start = performance.now()

    const ruleResult = this.ruleBasedClassify(request)
    if (ruleResult.confidence > this.config.confidenceThreshold) {
      const elapsed = performance.now() - start
      this.logger.info('intent-classifier.rule.hit', {
        intent: ruleResult.intent,
        confidence: ruleResult.confidence,
        elapsedMs: elapsed,
      })
      return { ...ruleResult, source: 'rule', elapsedMs: elapsed }
    }

    // confidence ≤ threshold → LLM fallback
    const llmResult = await this.llmClassify(request)
    const elapsed = performance.now() - start
    return { ...llmResult, elapsedMs: elapsed }
  }

  /**
   * Rule-based intent classification using bilingual (Chinese + English) keyword matching.
   *
   * Rules are ordered by priority:
   * edit_file > analyze > plan > search > chat (default)
   */
  private ruleBasedClassify(req: AIChatRequest): Omit<ClassifyResult, 'source' | 'elapsedMs'> {
    const msg = req.message.toLowerCase()

    // edit_file: file modification related keywords
    if (
      /(?:修改|edit|update|change|删除|delete|新增|add|创建|create|重命名|rename).*(?:文件|file|doc|文档|\.md|\.ts|\.tsx|\.json)/i.test(msg)
      || /(?:文件|file).*(?:修改|edit|update|change|删除|delete)/i.test(msg)
    ) {
      return { intent: 'edit_file', confidence: 0.95 }
    }

    // analyze: analysis/comparison related keywords
    if (/(?:分析|analyze|compare|对比|比较|为什么|why|评估|evaluate|审查|review|检查|check|inspect)/i.test(msg)) {
      return { intent: 'analyze', confidence: 0.9 }
    }

    // plan: planning/breakdown related keywords
    if (/(?:计划|plan|拆解|break.?down|路线图|roadmap|步骤|steps|方案|approach|策略|strategy)/i.test(msg)) {
      return { intent: 'plan', confidence: 0.9 }
    }

    // search: search/locate related keywords
    if (/(?:搜索|find|search|查找|locate|定位|哪里|where|是否存在)/i.test(msg)) {
      return { intent: 'search', confidence: 0.95 }
    }

    // Default: chat with low confidence (triggers LLM fallback)
    return { intent: 'chat', confidence: 0.5 }
  }

  /**
   * LLM-based intent classification fallback.
   * Uses a lightweight model with 3-second timeout.
   * Falls back to chat on any failure.
   */
  private async llmClassify(req: AIChatRequest): Promise<Omit<ClassifyResult, 'elapsedMs'>> {
    const session = this.gateway.createSession({ role: 'evaluator' })

    try {
      // NOTE: AbortController created for timeout safety, but AiGatewaySession.chat()
      // does not currently accept an AbortSignal. The timeout acts as a cleanup guard;
      // actual request cancellation requires future API extension.
      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        controller.abort()
        session.close()
      }, this.config.llmTimeoutMs)

      const response = await session.chat({
        model: this.config.classifierModel,
        messages: [
          { role: 'system', content: this.CLASSIFIER_SYSTEM_PROMPT },
          { role: 'user', content: this.formatLlmPrompt(req) },
        ],
        temperature: 0,
        maxTokens: 10,
      })

      clearTimeout(timeoutId)

      const parsed = this.parseLlmResponse(response.content)
      if (parsed) {
        this.logger.info('intent-classifier.llm.success', { intent: parsed })
        return { intent: parsed, confidence: 0.85, source: 'llm' }
      }

      this.logger.warn('intent-classifier.llm.parse-failed', { raw: response.content })
      return { intent: 'chat', confidence: 0.5, source: 'fallback' }
    } catch (err) {
      this.logger.warn('intent-classifier.llm.failed', { err })
      return { intent: 'chat', confidence: 0.5, source: 'fallback' }
    } finally {
      session.close()
    }
  }

  /** Format the user message for LLM classification prompt */
  private formatLlmPrompt(req: AIChatRequest): string {
    return `User message: "${req.message}"`
  }

  /**
   * Parse LLM response into a valid HarnessIntent.
   * Tries exact match first, then substring match.
   * Returns null on parse failure.
   */
  private parseLlmResponse(raw: string): HarnessIntent | null {
    const trimmed = raw.trim().toLowerCase()

    // Direct match
    if (VALID_INTENTS.includes(trimmed as HarnessIntent)) {
      return trimmed as HarnessIntent
    }

    // Extract first matching keyword
    for (const intent of VALID_INTENTS) {
      if (trimmed.includes(intent)) return intent
    }

    return null
  }
}
