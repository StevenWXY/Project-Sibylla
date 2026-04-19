/**
 * Generator unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Generator } from '../../src/main/services/harness/generator'
import type { AiGatewayClient, AiGatewayChatResponse } from '../../src/main/services/ai-gateway-client'
import type { AiGatewaySession } from '../../src/main/services/ai-gateway-client'
import type { AssembledContext, AIChatRequest, EvaluationReport } from '../../src/shared/types'

function createMockGateway(chatResult: AiGatewayChatResponse) {
  const mockSession = {
    sessionId: 'session-generator-test',
    role: 'generator' as const,
    chat: vi.fn().mockResolvedValue(chatResult),
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

const mockChatResponse: AiGatewayChatResponse = {
  id: 'resp-1',
  model: 'claude-sonnet-4-20250514',
  provider: 'anthropic',
  content: 'Generated content',
  finishReason: 'stop',
  usage: { inputTokens: 50, outputTokens: 30, totalTokens: 80, estimatedCostUsd: 0.001 },
  intercepted: false,
  warnings: [],
}

describe('Generator', () => {
  let generator: Generator

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generate()', () => {
    it('should create a generator session and return AIChatResponse', async () => {
      const { client, session } = createMockGateway(mockChatResponse)
      generator = new Generator(client, 'claude-sonnet-4-20250514', mockLogger as never)

      const request: AIChatRequest = { message: 'Hello' }
      const result = await generator.generate({ request, context: mockContext })

      expect(client.createSession).toHaveBeenCalledWith({ role: 'generator' })
      expect(session.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-20250514',
          messages: expect.arrayContaining([
            { role: 'system', content: mockContext.systemPrompt },
            { role: 'user', content: 'Hello' },
          ]),
        })
      )
      expect(result.content).toBe('Generated content')
      expect(result.id).toBe('resp-1')
      expect(session.close).toHaveBeenCalled()
    })

    it('should use request model and temperature when provided', async () => {
      const { client, session } = createMockGateway(mockChatResponse)
      generator = new Generator(client, 'default-model', mockLogger as never)

      const request: AIChatRequest = { message: 'Hello', model: 'custom-model', temperature: 0.3 }
      await generator.generate({ request, context: mockContext })

      expect(session.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'custom-model',
          temperature: 0.3,
        })
      )
    })

    it('should close session even on error', async () => {
      const mockSession = {
        sessionId: 'session-generator-err',
        role: 'generator' as const,
        chat: vi.fn().mockRejectedValue(new Error('API error')),
        chatStream: vi.fn(),
        close: vi.fn(),
      }
      const client = {
        createSession: vi.fn().mockReturnValue(mockSession),
        chat: vi.fn(),
        chatStream: vi.fn(),
      } as unknown as AiGatewayClient

      generator = new Generator(client, 'model', mockLogger as never)

      await expect(generator.generate({
        request: { message: 'Hello' },
        context: mockContext,
      })).rejects.toThrow('API error')

      expect(mockSession.close).toHaveBeenCalled()
    })
  })

  describe('refine()', () => {
    it('should create a new session and use lower temperature', async () => {
      const { client, session } = createMockGateway(mockChatResponse)
      generator = new Generator(client, 'claude-sonnet-4-20250514', mockLogger as never)

      const rejectionReport: EvaluationReport = {
        evaluatorId: 'evaluator-default',
        verdict: 'fail',
        dimensions: {
          factual_consistency: { pass: false, issues: ['Wrong file path'] },
        },
        criticalIssues: ['Incorrect path reference'],
        minorIssues: ['Typo in response'],
        rationale: 'The suggestion references a non-existent file',
        timestamp: Date.now(),
      }

      await generator.refine({
        originalRequest: { message: 'Edit file' },
        previousResponse: {
          id: 'prev-1', model: 'claude-sonnet-4-20250514', provider: 'anthropic',
          content: 'Previous suggestion', usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, estimatedCostUsd: 0 },
          intercepted: false, warnings: [], ragHits: [], memory: { tokenCount: 0, tokenDebt: 0, flushTriggered: false },
        },
        rejectionReport,
        context: mockContext,
        attemptNumber: 1,
      })

      expect(session.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.5,
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'user', content: expect.stringContaining('评审者拒绝了') }),
          ]),
        })
      )
      expect(session.close).toHaveBeenCalled()
    })
  })
})
