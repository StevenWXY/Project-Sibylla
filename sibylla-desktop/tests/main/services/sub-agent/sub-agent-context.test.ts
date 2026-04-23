import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SubAgentDefinition, SubAgentContextConfig } from '../../../../src/shared/types'
import type { SubAgentRegistry } from '../../../../src/main/services/sub-agent/SubAgentRegistry'

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}

vi.mock('../../../../src/main/utils/logger', () => ({
  logger: mockLogger,
}))

vi.mock('../../../../src/main/services/harness/generator', () => ({
  Generator: vi.fn().mockImplementation(() => ({
    generate: vi.fn().mockResolvedValue({
      content: 'test response',
      usage: { totalTokens: 50, estimatedCostUsd: 0.001 },
    }),
  })),
}))

vi.mock('../../../../src/main/services/harness/guardrails/engine', () => ({
  GuardrailEngine: vi.fn().mockImplementation(() => ({
    check: vi.fn().mockResolvedValue({ allow: true }),
    listRules: vi.fn().mockReturnValue([]),
  })),
}))

import { SubAgentContext } from '../../../../src/main/services/sub-agent/SubAgentContext'

const baseAgent: SubAgentDefinition = {
  id: 'test-agent',
  version: '1.0.0',
  name: 'Test Agent',
  description: 'A test agent',
  allowedTools: ['read-file', 'search'],
  context: {
    inheritMemory: false,
    inheritTrace: true,
    inheritWorkspaceBoundary: true,
  } as SubAgentContextConfig,
  maxTurns: 10,
  maxTokens: 30000,
  builtin: true,
  filePath: '/test/agent.md',
}

function createMockRegistry(): SubAgentRegistry {
  return {
    get: vi.fn(),
    getAll: vi.fn().mockReturnValue([]),
    loadAgentPrompt: vi.fn().mockResolvedValue('You are a test agent.'),
  } as unknown as SubAgentRegistry
}

function createMockGateway() {
  return {
    createSession: vi.fn().mockReturnValue({
      chat: vi.fn(),
      close: vi.fn(),
      sessionId: 'test-session',
      role: 'sub-agent',
    }),
  } as unknown as never
}

describe('SubAgentContext', () => {
  let mockRegistry: SubAgentRegistry

  beforeEach(() => {
    vi.clearAllMocks()
    mockRegistry = createMockRegistry()
  })

  it('creates independent Generator instance', async () => {
    const ctx = await SubAgentContext.create({
      agent: baseAgent,
      task: 'Review the code',
      parentTraceId: 'trace-123',
      parentAllowedTools: ['read-file', 'search', 'write-file'],
      timeoutMs: 600000,
      gateway: createMockGateway(),
      defaultModel: 'claude-sonnet-4-20250514',
      registry: mockRegistry,
      logger: mockLogger as never,
    })

    expect(ctx.generator).toBeDefined()
  })

  it('creates independent GuardrailEngine instance', async () => {
    const ctx = await SubAgentContext.create({
      agent: baseAgent,
      task: 'Review the code',
      parentTraceId: 'trace-123',
      parentAllowedTools: ['read-file', 'search', 'write-file'],
      timeoutMs: 600000,
      gateway: createMockGateway(),
      defaultModel: 'claude-sonnet-4-20250514',
      registry: mockRegistry,
      logger: mockLogger as never,
    })

    expect(ctx.guardrailEngine).toBeDefined()
  })

  it('allowed_tools correctly trimmed (intersection)', async () => {
    const ctx = await SubAgentContext.create({
      agent: { ...baseAgent, allowedTools: ['read-file', 'write-file'] },
      task: 'Review the code',
      parentTraceId: 'trace-123',
      parentAllowedTools: ['read-file', 'search'],
      timeoutMs: 600000,
      gateway: createMockGateway(),
      defaultModel: 'claude-sonnet-4-20250514',
      registry: mockRegistry,
      logger: mockLogger as never,
    })

    expect(ctx.allowedTools).toEqual(['read-file'])
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'sub-agent.context.tool-trimmed',
      expect.objectContaining({ tool: 'write-file' }),
    )
  })

  it('spawnSubAgent not included by default at depth 2', async () => {
    const ctx = await SubAgentContext.create({
      agent: { ...baseAgent, allowedTools: ['read-file', 'spawnSubAgent'] },
      task: 'Review the code',
      parentTraceId: 'trace-123',
      parentAllowedTools: ['read-file', 'search', 'spawnSubAgent'],
      timeoutMs: 600000,
      gateway: createMockGateway(),
      defaultModel: 'claude-sonnet-4-20250514',
      registry: mockRegistry,
      nestingDepth: 2,
      logger: mockLogger as never,
    })

    expect(ctx.allowedTools).not.toContain('spawnSubAgent')
  })

  it('rejects creation when nesting depth >= 3', async () => {
    await expect(
      SubAgentContext.create({
        agent: baseAgent,
        task: 'Review the code',
        parentTraceId: 'trace-123',
        parentAllowedTools: ['read-file'],
        timeoutMs: 600000,
        gateway: createMockGateway(),
        defaultModel: 'claude-sonnet-4-20250514',
        registry: mockRegistry,
        nestingDepth: 3,
        logger: mockLogger as never,
      }),
    ).rejects.toThrow('Sub-agent nesting depth exceeded')
  })

  it('abort / isAborted / getElapsedMs work correctly', async () => {
    const ctx = await SubAgentContext.create({
      agent: baseAgent,
      task: 'Review the code',
      parentTraceId: 'trace-123',
      parentAllowedTools: ['read-file'],
      timeoutMs: 600000,
      gateway: createMockGateway(),
      defaultModel: 'claude-sonnet-4-20250514',
      registry: mockRegistry,
      logger: mockLogger as never,
    })

    expect(ctx.isAborted()).toBe(false)
    expect(ctx.getElapsedMs()).toBeGreaterThanOrEqual(0)

    ctx.abort()
    expect(ctx.isAborted()).toBe(true)
  })

  it('addMessage appends to messages array', async () => {
    const ctx = await SubAgentContext.create({
      agent: baseAgent,
      task: 'Review the code',
      parentTraceId: 'trace-123',
      parentAllowedTools: ['read-file'],
      timeoutMs: 600000,
      gateway: createMockGateway(),
      defaultModel: 'claude-sonnet-4-20250514',
      registry: mockRegistry,
      logger: mockLogger as never,
    })

    const initialLength = ctx.messages.length
    ctx.addMessage('user', 'Test message')
    expect(ctx.messages).toHaveLength(initialLength + 1)
    expect(ctx.messages[ctx.messages.length - 1]).toEqual({ role: 'user', content: 'Test message' })
  })
})
