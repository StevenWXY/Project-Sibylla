/**
 * IntentClassifier unit tests
 *
 * Tests rule-based classification (bilingual keywords),
 * LLM fallback, timeout handling, and parse logic.
 *
 * @see plans/phase1-task020-tool-scope-intent-classifier-plan.md §九.2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IntentClassifier, DEFAULT_CLASSIFIER_CONFIG } from '../../src/main/services/harness/intent-classifier'
import type { ClassifierConfig } from '../../src/main/services/harness/intent-classifier'
import type { AiGatewayClient } from '../../src/main/services/ai-gateway-client'
import type { AIChatRequest } from '../../src/shared/types'

// ─── Mocks ───

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}

function createMockRequest(message: string): AIChatRequest {
  return { message }
}

function createMockGateway(llmResponse?: string, shouldThrow?: boolean): AiGatewayClient {
  const mockSession = {
    sessionId: 'test-session',
    role: 'evaluator' as const,
    chat: shouldThrow
      ? vi.fn().mockRejectedValue(new Error('LLM timeout'))
      : vi.fn().mockResolvedValue({
          id: 'resp-1',
          model: 'claude-3-haiku-20240307',
          provider: 'anthropic',
          content: llmResponse ?? 'chat',
          finishReason: 'stop',
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0 },
          intercepted: false,
          warnings: [],
        }),
    chatStream: vi.fn(),
    close: vi.fn(),
  }

  return {
    createSession: vi.fn().mockReturnValue(mockSession),
    chat: vi.fn(),
    chatStream: vi.fn(),
  } as unknown as AiGatewayClient
}

// ─── Tests ───

describe('IntentClassifier', () => {
  let classifier: IntentClassifier

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('ruleBasedClassify — Chinese keywords', () => {
    // Test 1: 修改文件 → edit_file
    it('should classify "修改文件 src/foo.ts" as edit_file with confidence 0.95', async () => {
      const gateway = createMockGateway()
      classifier = new IntentClassifier(gateway, DEFAULT_CLASSIFIER_CONFIG, mockLogger as never)

      const result = await classifier.classify(createMockRequest('修改文件 src/foo.ts'))

      expect(result.intent).toBe('edit_file')
      expect(result.confidence).toBe(0.95)
      expect(result.source).toBe('rule')
    })

    // Test 3: 分析 → analyze
    it('should classify "分析一下这个设计" as analyze with confidence 0.9', async () => {
      const gateway = createMockGateway()
      classifier = new IntentClassifier(gateway, DEFAULT_CLASSIFIER_CONFIG, mockLogger as never)

      const result = await classifier.classify(createMockRequest('分析一下这个设计'))

      expect(result.intent).toBe('analyze')
      expect(result.confidence).toBe(0.9)
      expect(result.source).toBe('rule')
    })

    // Test 5: 拆解 → plan
    it('should classify "帮我拆解这个任务" as plan with confidence 0.9', async () => {
      const gateway = createMockGateway()
      classifier = new IntentClassifier(gateway, DEFAULT_CLASSIFIER_CONFIG, mockLogger as never)

      const result = await classifier.classify(createMockRequest('帮我拆解这个任务'))

      expect(result.intent).toBe('plan')
      expect(result.confidence).toBe(0.9)
      expect(result.source).toBe('rule')
    })

    // Test 7: 搜索 → search
    it('should classify "搜索关于 auth 的内容" as search with confidence 0.95', async () => {
      const gateway = createMockGateway()
      classifier = new IntentClassifier(gateway, DEFAULT_CLASSIFIER_CONFIG, mockLogger as never)

      const result = await classifier.classify(createMockRequest('搜索关于 auth 的内容'))

      expect(result.intent).toBe('search')
      expect(result.confidence).toBe(0.95)
      expect(result.source).toBe('rule')
    })
  })

  describe('ruleBasedClassify — English keywords', () => {
    // Test 2: edit + file → edit_file
    it('should classify "edit the config file" as edit_file with confidence 0.95', async () => {
      const gateway = createMockGateway()
      classifier = new IntentClassifier(gateway, DEFAULT_CLASSIFIER_CONFIG, mockLogger as never)

      const result = await classifier.classify(createMockRequest('edit the config file'))

      expect(result.intent).toBe('edit_file')
      expect(result.confidence).toBe(0.95)
      expect(result.source).toBe('rule')
    })

    // Test 4: compare → analyze
    it('should classify "compare these two approaches" as analyze with confidence 0.9', async () => {
      const gateway = createMockGateway()
      classifier = new IntentClassifier(gateway, DEFAULT_CLASSIFIER_CONFIG, mockLogger as never)

      const result = await classifier.classify(createMockRequest('compare these two approaches'))

      expect(result.intent).toBe('analyze')
      expect(result.confidence).toBe(0.9)
      expect(result.source).toBe('rule')
    })

    // Test 6: roadmap → plan
    it('should classify "create a roadmap for v2" as plan with confidence 0.9', async () => {
      const gateway = createMockGateway()
      classifier = new IntentClassifier(gateway, DEFAULT_CLASSIFIER_CONFIG, mockLogger as never)

      const result = await classifier.classify(createMockRequest('create a roadmap for v2'))

      expect(result.intent).toBe('plan')
      expect(result.confidence).toBe(0.9)
      expect(result.source).toBe('rule')
    })

    // Test 8: find → search
    it('should classify "find all spec files" as search with confidence 0.95', async () => {
      const gateway = createMockGateway()
      classifier = new IntentClassifier(gateway, DEFAULT_CLASSIFIER_CONFIG, mockLogger as never)

      const result = await classifier.classify(createMockRequest('find all spec files'))

      expect(result.intent).toBe('search')
      expect(result.confidence).toBe(0.95)
      expect(result.source).toBe('rule')
    })
  })

  describe('LLM fallback', () => {
    // Test 9: 你好 → chat + LLM fallback triggered
    it('should trigger LLM fallback for ambiguous message "你好"', async () => {
      const gateway = createMockGateway('chat')
      classifier = new IntentClassifier(gateway, DEFAULT_CLASSIFIER_CONFIG, mockLogger as never)

      const result = await classifier.classify(createMockRequest('你好'))

      expect(result.intent).toBe('chat')
      // LLM was called because rule confidence was ≤ 0.8
      expect(gateway.createSession).toHaveBeenCalled()
    })

    // Test 10: LLM returns valid intent
    it('should accept valid LLM response "plan"', async () => {
      const gateway = createMockGateway('plan')
      classifier = new IntentClassifier(gateway, DEFAULT_CLASSIFIER_CONFIG, mockLogger as never)

      const result = await classifier.classify(createMockRequest('这该怎么处理'))

      expect(result.intent).toBe('plan')
      expect(result.source).toBe('llm')
      expect(result.confidence).toBe(0.85)
    })

    // Test 11: LLM timeout → fallback
    it('should fallback to chat on LLM error/timeout', async () => {
      const gateway = createMockGateway(undefined, true)
      classifier = new IntentClassifier(gateway, DEFAULT_CLASSIFIER_CONFIG, mockLogger as never)

      const result = await classifier.classify(createMockRequest('随便聊聊'))

      expect(result.intent).toBe('chat')
      expect(result.source).toBe('fallback')
      expect(result.confidence).toBe(0.5)
    })

    // Test 12: LLM returns invalid intent → fallback
    it('should fallback to chat when LLM returns invalid intent', async () => {
      const gateway = createMockGateway('invalid_intent_value')
      classifier = new IntentClassifier(gateway, DEFAULT_CLASSIFIER_CONFIG, mockLogger as never)

      const result = await classifier.classify(createMockRequest('今天天气如何'))

      expect(result.intent).toBe('chat')
      expect(result.source).toBe('fallback')
    })
  })

  describe('Performance', () => {
    // Test 13: Rule classification performance < 5ms
    it('should complete rule-based classification in under 5ms', async () => {
      const gateway = createMockGateway()
      classifier = new IntentClassifier(gateway, DEFAULT_CLASSIFIER_CONFIG, mockLogger as never)

      const result = await classifier.classify(createMockRequest('修改文件 test.ts'))

      expect(result.elapsedMs).toBeLessThan(5)
      expect(result.source).toBe('rule')
    })
  })

  describe('Mixed language', () => {
    // Test 14: Chinese + English mixed
    it('should classify "update 这个 file" as edit_file', async () => {
      const gateway = createMockGateway()
      classifier = new IntentClassifier(gateway, DEFAULT_CLASSIFIER_CONFIG, mockLogger as never)

      const result = await classifier.classify(createMockRequest('update 这个 file'))

      expect(result.intent).toBe('edit_file')
      expect(result.confidence).toBe(0.95)
      expect(result.source).toBe('rule')
    })
  })

  describe('ClassifyResult structure', () => {
    it('should always include elapsedMs in the result', async () => {
      const gateway = createMockGateway()
      classifier = new IntentClassifier(gateway, DEFAULT_CLASSIFIER_CONFIG, mockLogger as never)

      const result = await classifier.classify(createMockRequest('edit file foo.ts'))

      expect(result).toHaveProperty('intent')
      expect(result).toHaveProperty('confidence')
      expect(result).toHaveProperty('source')
      expect(result).toHaveProperty('elapsedMs')
      expect(typeof result.elapsedMs).toBe('number')
    })
  })

  describe('Custom config', () => {
    it('should respect custom confidence threshold', async () => {
      const gateway = createMockGateway('analyze')
      const customConfig: ClassifierConfig = {
        classifierModel: 'claude-3-haiku-20240307',
        llmTimeoutMs: 3000,
        confidenceThreshold: 0.99, // Very high threshold — forces LLM fallback even for rules
      }
      classifier = new IntentClassifier(gateway, customConfig, mockLogger as never)

      const result = await classifier.classify(createMockRequest('分析一下这个'))

      // Rule returns 0.9, but threshold is 0.99, so LLM fallback is triggered
      expect(result.source).toBe('llm')
      expect(result.intent).toBe('analyze')
    })
  })
})
