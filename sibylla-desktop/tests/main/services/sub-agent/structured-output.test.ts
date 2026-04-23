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
    create: vi.fn().mockResolvedValue({
      agent: { id: 'test-agent', maxTurns: 5, maxTokens: 30000, outputSchema: undefined },
      messages: [
        { role: 'system', content: 'test' },
        { role: 'user', content: 'task' },
      ],
      usage: { totalTokens: 0, totalCost: 0 },
      isAborted: vi.fn().mockReturnValue(false),
      getElapsedMs: vi.fn().mockReturnValue(100),
      addUsage: vi.fn(),
      addMessage: vi.fn(),
      abort: vi.fn(),
      generator: {
        generate: vi.fn().mockResolvedValue({
          content: '{"summary":"ok","findings":[]}',
          usage: { totalTokens: 100, estimatedCostUsd: 0.001 },
        }),
      },
      allowedTools: ['read-file'],
      systemPrompt: 'test',
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

describe('Structured Output', () => {
  let executor: SubAgentExecutor

  const agentWithSchema: SubAgentDefinition = {
    id: 'test-agent',
    version: '1.0.0',
    name: 'Test Agent',
    description: 'Test',
    allowedTools: ['read-file'],
    context: { inheritMemory: false, inheritTrace: true, inheritWorkspaceBoundary: true },
    maxTurns: 5,
    maxTokens: 30000,
    outputSchema: {
      type: 'object',
      required: ['summary'],
      properties: { summary: { type: 'string' } },
    },
    builtin: true,
    filePath: '/test/agent.md',
  }

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

  it('JSON code block correctly extracted', async () => {
    const result = await executor.run({
      agent: agentWithSchema,
      task: 'Summarize',
      parentTraceId: 'trace-1',
      parentAllowedTools: ['read-file'],
      timeoutMs: 600000,
    })

    expect(result.success).toBe(true)
  })

  it('no output_schema returns summary', async () => {
    const agentNoSchema: SubAgentDefinition = {
      ...agentWithSchema,
      outputSchema: undefined,
    }

    const result = await executor.run({
      agent: agentNoSchema,
      task: 'Summarize',
      parentTraceId: 'trace-1',
      parentAllowedTools: ['read-file'],
      timeoutMs: 600000,
    })

    expect(result.summary).toBeDefined()
  })
})
