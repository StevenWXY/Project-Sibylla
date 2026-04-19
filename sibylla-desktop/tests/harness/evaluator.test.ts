/**
 * Evaluator unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Evaluator } from '../../src/main/services/harness/evaluator'
import type { AiGatewayClient, AiGatewayChatResponse } from '../../src/main/services/ai-gateway-client'
import type { AssembledContext, AIChatRequest, AIChatResponse } from '../../src/shared/types'

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}

const mockContext: AssembledContext = {
  layers: [],
  systemPrompt: 'You are a helpful assistant.',
  totalTokens: 100,
  budgetUsed: 100,
  budgetTotal: 16000,
  sources: [],
  warnings: [],
}

const mockSuggestion: AIChatResponse = {
  id: 'sugg-1',
  model: 'claude-sonnet-4-20250514',
  provider: 'anthropic',
  content: 'Suggested content',
  usage: { inputTokens: 50, outputTokens: 30, totalTokens: 80, estimatedCostUsd: 0.001 },
  intercepted: false,
  warnings: [],
  ragHits: [],
  memory: { tokenCount: 0, tokenDebt: 0, flushTriggered: false },
}

function createMockGateway(content: string) {
  const chatResponse: AiGatewayChatResponse = {
    id: 'eval-resp-1',
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    content,
    finishReason: 'stop',
    usage: { inputTokens: 50, outputTokens: 100, totalTokens: 150, estimatedCostUsd: 0.002 },
    intercepted: false,
    warnings: [],
  }

  const mockSession = {
    sessionId: 'session-evaluator-test',
    role: 'evaluator' as const,
    chat: vi.fn().mockResolvedValue(chatResponse),
    chatStream: vi.fn(),
    close: vi.fn(),
  }
  return {
    client: {
      createSession: vi.fn().mockReturnValue(mockSession),
      chat: vi.fn(),
      chatStream: vi.fn(),
    } as unknown as AiGatewayClient,
    session: mockSession,
  }
}

describe('Evaluator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('evaluate()', () => {
    it('should create an evaluator session with temperature 0.1', async () => {
      const validJson = JSON.stringify({
        verdict: 'pass',
        dimensions: {
          factual_consistency: { pass: true, issues: [] },
        },
        critical_issues: [],
        minor_issues: [],
        rationale: 'All checks passed.',
      })

      const { client, session } = createMockGateway(validJson)
      const evaluator = new Evaluator(client, 'claude-sonnet-4-20250514', mockLogger as never)

      const report = await evaluator.evaluate({
        request: { message: 'Edit file' },
        suggestion: mockSuggestion,
        context: mockContext,
        history: [],
      })

      expect(client.createSession).toHaveBeenCalledWith({ role: 'evaluator' }, undefined)
      expect(session.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.1,
        })
      )
      expect(report.verdict).toBe('pass')
      expect(report.evaluatorId).toBe('evaluator-default')
      expect(session.close).toHaveBeenCalled()
    })

    it('should parse JSON wrapped in markdown code block', async () => {
      const wrappedJson = '```json\n' + JSON.stringify({
        verdict: 'fail',
        dimensions: {
          no_hallucination: { pass: false, issues: ['File not found'] },
        },
        critical_issues: ['Hallucinated path'],
        minor_issues: [],
        rationale: 'File does not exist.',
      }) + '\n```'

      const { client } = createMockGateway(wrappedJson)
      const evaluator = new Evaluator(client, 'claude-sonnet-4-20250514', mockLogger as never)

      const report = await evaluator.evaluate({
        request: { message: 'Edit file' },
        suggestion: mockSuggestion,
        context: mockContext,
        history: [],
      })

      expect(report.verdict).toBe('fail')
      expect(report.criticalIssues).toContain('Hallucinated path')
    })

    it('should use custom evaluatorId', async () => {
      const validJson = JSON.stringify({
        verdict: 'pass',
        dimensions: {},
        critical_issues: [],
        minor_issues: [],
        rationale: 'OK',
      })

      const { client } = createMockGateway(validJson)
      const evaluator = new Evaluator(client, 'claude-sonnet-4-20250514', mockLogger as never)

      const report = await evaluator.evaluate({
        request: { message: 'Edit file' },
        suggestion: mockSuggestion,
        context: mockContext,
        history: [],
        evaluatorId: 'architecture',
      })

      expect(report.evaluatorId).toBe('architecture')
    })
  })

  describe('parseReport()', () => {
    it('should throw on missing verdict', () => {
      const evaluator = new Evaluator({} as AiGatewayClient, 'model', mockLogger as never)
      const invalidJson = JSON.stringify({
        dimensions: {},
        critical_issues: [],
        minor_issues: [],
        rationale: 'ok',
      })

      expect(() => evaluator.parseReport(invalidJson, 'test')).toThrow('verdict')
    })

    it('should throw on missing critical_issues', () => {
      const evaluator = new Evaluator({} as AiGatewayClient, 'model', mockLogger as never)
      const invalidJson = JSON.stringify({
        verdict: 'pass',
        dimensions: {},
        minor_issues: [],
        rationale: 'ok',
      })

      expect(() => evaluator.parseReport(invalidJson, 'test')).toThrow('critical_issues')
    })

    it('should throw on non-JSON content', () => {
      const evaluator = new Evaluator({} as AiGatewayClient, 'model', mockLogger as never)

      expect(() => evaluator.parseReport('not json at all', 'test')).toThrow('not valid JSON')
    })

    it('should extract JSON from { to } when no code block', () => {
      const evaluator = new Evaluator({} as AiGatewayClient, 'model', mockLogger as never)
      const content = 'Some preamble text\n' + JSON.stringify({
        verdict: 'pass',
        dimensions: {},
        critical_issues: [],
        minor_issues: [],
        rationale: 'Good',
      }) + '\nSome trailing text'

      const report = evaluator.parseReport(content, 'test')
      expect(report.verdict).toBe('pass')
    })
  })
})
