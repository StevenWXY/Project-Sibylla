import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeSpawnSubAgent, SPAWN_SUB_AGENT_TOOL } from '../../../../src/main/services/sub-agent/spawnSubAgentTool'
import type { SubAgentDefinition } from '../../../../src/shared/types'
import type { SubAgentExecutor } from '../../../../src/main/services/sub-agent/SubAgentExecutor'
import type { SubAgentRegistry } from '../../../../src/main/services/sub-agent/SubAgentRegistry'

const mockAgent: SubAgentDefinition = {
  id: 'pr-reviewer',
  version: '1.0.0',
  name: 'PR 审查员',
  description: '专门审查 Pull Request 的子智能体',
  allowedTools: ['read-file', 'search', 'list-files'],
  context: { inheritMemory: false, inheritTrace: true, inheritWorkspaceBoundary: true },
  maxTurns: 15,
  maxTokens: 50000,
  builtin: true,
  filePath: '/agents/pr-reviewer.md',
}

describe('spawnSubAgentTool', () => {
  let mockRegistry: SubAgentRegistry
  let mockExecutor: SubAgentExecutor

  beforeEach(() => {
    vi.clearAllMocks()

    mockRegistry = {
      get: vi.fn(),
    } as unknown as SubAgentRegistry

    mockExecutor = {
      run: vi.fn().mockResolvedValue({
        success: true,
        summary: 'Review complete',
        turnsUsed: 5,
        tokensUsed: 12345,
        traceId: 'sub-trace-123',
        errors: [],
      }),
    } as unknown as SubAgentExecutor
  })

  it('executes correctly when agentId exists', async () => {
    vi.mocked(mockRegistry.get).mockReturnValue(mockAgent)

    const result = await executeSpawnSubAgent(
      { agentId: 'pr-reviewer', task: 'Review PR-123' },
      {
        subAgentRegistry: mockRegistry,
        subAgentExecutor: mockExecutor,
        parentAllowedTools: ['read-file', 'search'],
        parentTraceId: 'parent-trace-1',
      },
    )

    expect(result.success).toBe(true)
    expect(result.summary).toBe('Review complete')
    expect(mockExecutor.run).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: mockAgent,
        task: 'Review PR-123',
      }),
    )
  })

  it('returns error when agentId does not exist', async () => {
    vi.mocked(mockRegistry.get).mockReturnValue(undefined)

    const result = await executeSpawnSubAgent(
      { agentId: 'non-existent', task: 'Do something' },
      {
        subAgentRegistry: mockRegistry,
        subAgentExecutor: mockExecutor,
        parentAllowedTools: [],
        parentTraceId: 'parent-trace-1',
      },
    )

    expect(result.success).toBe(false)
    expect(result.errors[0]).toContain('Sub-agent not found')
  })

  it('passes parameters correctly', async () => {
    vi.mocked(mockRegistry.get).mockReturnValue(mockAgent)

    await executeSpawnSubAgent(
      { agentId: 'pr-reviewer', task: 'Review PR-123', params: { files: ['a.ts'] }, timeout: 300 },
      {
        subAgentRegistry: mockRegistry,
        subAgentExecutor: mockExecutor,
        parentAllowedTools: ['read-file'],
        parentTraceId: 'trace-1',
      },
    )

    expect(mockExecutor.run).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { files: ['a.ts'] },
        timeoutMs: 300000,
      }),
    )
  })

  it('default timeout is 600 seconds', async () => {
    vi.mocked(mockRegistry.get).mockReturnValue(mockAgent)

    await executeSpawnSubAgent(
      { agentId: 'pr-reviewer', task: 'Review PR-123' },
      {
        subAgentRegistry: mockRegistry,
        subAgentExecutor: mockExecutor,
        parentAllowedTools: ['read-file'],
        parentTraceId: 'trace-1',
      },
    )

    expect(mockExecutor.run).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutMs: 600000,
      }),
    )
  })

  it('tool definition schema format is correct', () => {
    expect(SPAWN_SUB_AGENT_TOOL.id).toBe('spawnSubAgent')
    expect(SPAWN_SUB_AGENT_TOOL.schema.required).toEqual(['agentId', 'task'])
    const props = SPAWN_SUB_AGENT_TOOL.schema.properties as Record<string, unknown>
    expect(props).toHaveProperty('agentId')
    expect(props).toHaveProperty('task')
    expect(props).toHaveProperty('params')
    expect(props).toHaveProperty('timeout')
  })
})
