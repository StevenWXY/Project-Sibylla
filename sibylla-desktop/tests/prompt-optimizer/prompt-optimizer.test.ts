import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PromptOptimizer } from '../../src/main/services/prompt-optimizer/prompt-optimizer'
import type { OptimizeRequest, OptimizeResponse } from '../../src/main/services/prompt-optimizer/types'
import { OptimizationError } from '../../src/main/services/prompt-optimizer/types'

function createMockTracer() {
  return {
    withSpan: vi.fn(async (_name: string, fn: (span: {
      setAttribute: (key: string, value: unknown) => void
      setAttributes: (attrs: Record<string, unknown>) => void
      context: { spanId: string; traceId: string }
    }) => Promise<unknown>, _opts?: unknown) => {
      const span = {
        setAttribute: vi.fn(),
        setAttributes: vi.fn(),
        context: { spanId: 'test-span-123', traceId: 'test-trace-456' },
      }
      return fn(span)
    }),
  }
}

function createMockAiGateway(response: { content: string }) {
  return {
    createSession: vi.fn(() => ({
      chat: vi.fn().mockResolvedValue(response),
      close: vi.fn(),
      sessionId: 'test-session',
      role: 'optimizer',
    })),
  }
}

function createMockModeRegistry() {
  return {
    get: vi.fn((id: string) => ({
      id,
      label: id.charAt(0).toUpperCase() + id.slice(1),
      description: `${id} mode description`,
    })),
  }
}

const defaultConfig = {
  optimizerModel: 'gpt-4o-mini',
  maxCacheSize: 50,
  cacheTtlMs: 60_000,
  timeoutMs: 8_000,
  maxSuggestions: 3,
}

const validResponse = {
  content: JSON.stringify({
    suggestions: [
      {
        text: '优化后的文本',
        rationale: '更加清晰',
        keyChanges: [
          { type: 'added', description: '补充了目标读者' },
          { type: 'clarified', description: '把模糊表述改为具体' },
        ],
        estimatedImprovementScore: 0.75,
      },
      {
        text: '另一个优化版本',
        rationale: '结构更好',
        keyChanges: [
          { type: 'restructured', description: '拆分为列表' },
        ],
        estimatedImprovementScore: 0.65,
      },
    ],
  }),
}

describe('PromptOptimizer', () => {
  let optimizer: PromptOptimizer
  let mockTracer: ReturnType<typeof createMockTracer>
  let mockGateway: ReturnType<typeof createMockAiGateway>
  let mockModeRegistry: ReturnType<typeof createMockModeRegistry>

  beforeEach(() => {
    mockTracer = createMockTracer()
    mockGateway = createMockAiGateway(validResponse)
    mockModeRegistry = createMockModeRegistry()
    optimizer = new PromptOptimizer(
      mockGateway as never,
      mockModeRegistry as never,
      mockTracer as never,
      defaultConfig,
    )
  })

  it('should return optimization suggestions', async () => {
    const request: OptimizeRequest = {
      originalText: '帮我写一个方案',
      currentMode: 'plan',
    }

    const result = await optimizer.optimize(request)

    expect(result.suggestions).toHaveLength(2)
    expect(result.suggestions[0].text).toBe('优化后的文本')
    expect(result.suggestions[0].rationale).toBe('更加清晰')
    expect(result.suggestions[0].keyChanges).toHaveLength(2)
    expect(result.requestId).toBe('test-span-123')
    expect(result.optimizationMode).toBe('quick')
  })

  it('should cache results and not call LLM on cache hit', async () => {
    const request: OptimizeRequest = {
      originalText: '帮我写一个方案',
      currentMode: 'plan',
    }

    await optimizer.optimize(request)
    const callCountAfterFirst = mockGateway.createSession.mock.calls.length

    const result = await optimizer.optimize(request)
    expect(mockGateway.createSession.mock.calls.length).toBe(callCountAfterFirst)
    expect(result.suggestions).toHaveLength(2)
  })

  it('should inject mode context from mode registry', async () => {
    const request: OptimizeRequest = {
      originalText: '分析一下这段代码',
      currentMode: 'analyze',
    }

    await optimizer.optimize(request)
    expect(mockModeRegistry.get).toHaveBeenCalledWith('analyze')
  })

  it('should parse JSON from markdown code block', async () => {
    const codeBlockResponse = {
      content: '```json\n' + JSON.stringify({
        suggestions: [
          {
            text: '优化文本',
            rationale: '更好',
            keyChanges: [],
            estimatedImprovementScore: 0.8,
          },
        ],
      }) + '\n```',
    }

    const gateway = createMockAiGateway(codeBlockResponse)
    const opt = new PromptOptimizer(
      gateway as never,
      mockModeRegistry as never,
      mockTracer as never,
      defaultConfig,
    )

    const result = await opt.optimize({
      originalText: '写个方案',
      currentMode: 'free',
    })

    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions[0].text).toBe('优化文本')
  })

  it('should throw OptimizationError on unparseable response', async () => {
    const badGateway = createMockAiGateway({ content: 'not valid json at all' })
    const opt = new PromptOptimizer(
      badGateway as never,
      mockModeRegistry as never,
      mockTracer as never,
      defaultConfig,
    )

    await expect(opt.optimize({
      originalText: '写个方案',
      currentMode: 'free',
    })).rejects.toThrow(OptimizationError)
  })

  it('should record user action via tracer', async () => {
    await optimizer.recordUserAction('req-123', 'applied', 'sug-456')
    expect(mockTracer.withSpan).toHaveBeenCalledWith(
      'prompt.optimize.user-action',
      expect.any(Function),
      { kind: 'user-action' },
    )
  })

  it('should increment session count', () => {
    expect(optimizer.incrementSessionCount('sess-1')).toBe(1)
    expect(optimizer.incrementSessionCount('sess-1')).toBe(2)
    expect(optimizer.incrementSessionCount('sess-1')).toBe(3)
    expect(optimizer.incrementSessionCount('sess-1')).toBe(4)
    expect(optimizer.incrementSessionCount('sess-1')).toBe(5)
  })

  it('should use tracer.withSpan for optimize call', async () => {
    await optimizer.optimize({
      originalText: '测试文本内容',
      currentMode: 'free',
    })
    expect(mockTracer.withSpan).toHaveBeenCalledWith(
      'prompt.optimize',
      expect.any(Function),
      { kind: 'ai-call' },
    )
  })
})
