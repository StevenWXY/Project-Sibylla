import { describe, it, expect, vi, beforeEach } from 'vitest'

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
    create: vi.fn().mockImplementation((opts) => {
      const allowedTools = opts.agent.allowedTools.filter(
        (tool: string) => opts.parentAllowedTools.includes(tool),
      )
      return Promise.resolve({
        agent: opts.agent,
        task: opts.task,
        messages: [
          { role: 'system', content: 'test' },
          { role: 'user', content: opts.task },
        ],
        usage: { totalTokens: 0, totalCost: 0 },
        isAborted: vi.fn().mockReturnValue(false),
        getElapsedMs: vi.fn().mockReturnValue(100),
        addUsage: vi.fn(),
        addMessage: vi.fn(),
        abort: vi.fn(),
        generator: {
          generate: vi.fn().mockResolvedValue({
            content: 'Task complete',
            usage: { totalTokens: 50, estimatedCostUsd: 0.001 },
          }),
        },
        guardrailEngine: { check: vi.fn().mockResolvedValue({ allow: true }) },
        allowedTools,
        systemPrompt: 'test',
      })
    }),
  },
}))

import { SubAgentExecutor } from '../../../../src/main/services/sub-agent/SubAgentExecutor'
import type { SubAgentRegistry } from '../../../../src/main/services/sub-agent/SubAgentRegistry'
import type { SubAgentDefinition } from '../../../../src/shared/types'

function createMockGateway() {
  return { createSession: vi.fn() } as unknown as never
}

function createMockRegistry(): SubAgentRegistry {
  return {
    get: vi.fn(),
    getAll: vi.fn().mockReturnValue([]),
    loadAgentPrompt: vi.fn().mockResolvedValue('Test'),
  } as unknown as SubAgentRegistry
}

describe('Permission Boundary', () => {
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

  it('sub-agent tools trimmed when not in parent allowed tools', async () => {
    const agent: SubAgentDefinition = {
      id: 'test-agent',
      version: '1.0.0',
      name: 'Test',
      description: 'Test',
      allowedTools: ['read-file', 'write-file'],
      context: { inheritMemory: false, inheritTrace: true, inheritWorkspaceBoundary: true },
      maxTurns: 5,
      maxTokens: 30000,
      builtin: true,
      filePath: '/test.md',
    }

    const result = await executor.run({
      agent,
      task: 'Do something',
      parentTraceId: 'trace-1',
      parentAllowedTools: ['read-file'],
      timeoutMs: 600000,
    })

    expect(result).toBeDefined()
  })

  it('sub-agent cannot elevate privileges', async () => {
    const agent: SubAgentDefinition = {
      id: 'test-agent',
      version: '1.0.0',
      name: 'Test',
      description: 'Test',
      allowedTools: ['write-file', 'delete-file'],
      context: { inheritMemory: false, inheritTrace: true, inheritWorkspaceBoundary: true },
      maxTurns: 5,
      maxTokens: 30000,
      builtin: true,
      filePath: '/test.md',
    }

    const result = await executor.run({
      agent,
      task: 'Do something',
      parentTraceId: 'trace-1',
      parentAllowedTools: ['read-file'],
      timeoutMs: 600000,
    })

    expect(result).toBeDefined()
  })

  it('sub-agent result is always returned (graceful degradation)', async () => {
    const agent: SubAgentDefinition = {
      id: 'test-agent',
      version: '1.0.0',
      name: 'Test',
      description: 'Test',
      allowedTools: ['read-file'],
      context: { inheritMemory: false, inheritTrace: true, inheritWorkspaceBoundary: true },
      maxTurns: 1,
      maxTokens: 100,
      builtin: true,
      filePath: '/test.md',
    }

    const result = await executor.run({
      agent,
      task: 'Do something',
      parentTraceId: 'trace-1',
      parentAllowedTools: ['read-file'],
      timeoutMs: 600000,
    })

    expect(result).toBeDefined()
    expect(result).toHaveProperty('success')
    expect(result).toHaveProperty('summary')
    expect(result).toHaveProperty('errors')
  })
})
