import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SubAgentDefinition } from '../../../../src/shared/types'

vi.mock('../../../../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../../../../src/main/services/harness/guardrails/engine', () => ({
  GuardrailEngine: vi.fn().mockImplementation(() => ({
    check: vi.fn().mockResolvedValue({ allow: true }),
    listRules: vi.fn().mockReturnValue([]),
  })),
}))

vi.mock('../../../../src/main/services/sub-agent/SubAgentContext', () => ({
  SubAgentContext: {
    create: vi.fn().mockResolvedValue({
      agent: { id: 'test-agent', maxTurns: 2, maxTokens: 30000 },
      messages: [{ role: 'system', content: 'test' }, { role: 'user', content: 'task' }],
      usage: { totalTokens: 0, totalCost: 0 },
      isAborted: vi.fn().mockReturnValue(false),
      getElapsedMs: vi.fn().mockReturnValue(100),
      addUsage: vi.fn(),
      addMessage: vi.fn(),
      abort: vi.fn(),
      generator: {
        generate: vi.fn().mockResolvedValue({
          content: 'Done',
          usage: { totalTokens: 100, estimatedCostUsd: 0.001 },
        }),
      },
      guardrailEngine: { check: vi.fn().mockResolvedValue({ allow: true }) },
      allowedTools: ['read-file'],
      systemPrompt: 'You are a test agent.',
    }),
  },
}))

import { SubAgentExecutor } from '../../../../src/main/services/sub-agent/SubAgentExecutor'
import type { SubAgentRegistry } from '../../../../src/main/services/sub-agent/SubAgentRegistry'

const baseAgent: SubAgentDefinition = {
  id: 'test-agent',
  version: '1.0.0',
  name: 'Test Agent',
  description: 'A test agent',
  allowedTools: ['read-file'],
  context: { inheritMemory: false, inheritTrace: true, inheritWorkspaceBoundary: true },
  maxTurns: 2,
  maxTokens: 30000,
  builtin: true,
  filePath: '/test/agent.md',
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

function createMockRegistry(): SubAgentRegistry {
  return {
    get: vi.fn(),
    getAll: vi.fn().mockReturnValue([]),
    loadAgentPrompt: vi.fn().mockResolvedValue('Test prompt'),
  } as unknown as SubAgentRegistry
}

describe('SubAgentExecutor', () => {
  let executor: SubAgentExecutor

  beforeEach(() => {
    vi.clearAllMocks()
    executor = new SubAgentExecutor(
      createMockGateway(),
      'claude-sonnet-4-20250514',
      createMockRegistry(),
      undefined,
      { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
    )
  })

  it('executes independent loop and returns structured result', async () => {
    const result = await executor.run({
      agent: baseAgent,
      task: 'Review the code',
      parentTraceId: 'trace-123',
      parentAllowedTools: ['read-file'],
      timeoutMs: 600000,
    })

    expect(result.success).toBe(true)
    expect(result.summary).toBeDefined()
    expect(result.turnsUsed).toBeGreaterThan(0)
  })

  it('nesting depth >= 3 returns error', async () => {
    const result = await executor.run({
      agent: baseAgent,
      task: 'Review the code',
      parentTraceId: 'trace-123',
      parentAllowedTools: ['read-file'],
      timeoutMs: 600000,
      nestingDepth: 3,
    })

    expect(result.success).toBe(false)
    expect(result.errors[0]).toContain('nesting depth exceeded')
  })

  it('concurrent limit: 4th task waits', async () => {
    const run1 = executor.run({ agent: baseAgent, task: 't1', parentTraceId: 't1', parentAllowedTools: ['read-file'], timeoutMs: 600000 })
    const run2 = executor.run({ agent: baseAgent, task: 't2', parentTraceId: 't2', parentAllowedTools: ['read-file'], timeoutMs: 600000 })
    const run3 = executor.run({ agent: baseAgent, task: 't3', parentTraceId: 't3', parentAllowedTools: ['read-file'], timeoutMs: 600000 })

    expect(executor.activeAgentCount).toBeLessThanOrEqual(3)

    const results = await Promise.all([run1, run2, run3])
    expect(results).toHaveLength(3)
  })

  it('gracefulAbort aborts all active contexts', async () => {
    const runPromise = executor.run({ agent: baseAgent, task: 't1', parentTraceId: 't1', parentAllowedTools: ['read-file'], timeoutMs: 600000 })

    await executor.gracefulAbort()

    const result = await runPromise
    expect(result).toBeDefined()
  })

  it('abortAll forces abort without waiting', () => {
    executor.abortAll()
    expect(executor.activeAgentCount).toBe(0)
  })

  it('activeAgentCount returns current count', () => {
    expect(executor.activeAgentCount).toBe(0)
  })
})
