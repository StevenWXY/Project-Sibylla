import type { SubAgentResult } from '../../../shared/types'
import type { SubAgentExecutor } from './SubAgentExecutor'
import type { SubAgentRegistry } from './SubAgentRegistry'
import type { ToolDefinition } from '../harness/tool-scope'

export const SPAWN_SUB_AGENT_TOOL: ToolDefinition = {
  id: 'spawnSubAgent',
  name: 'spawnSubAgent',
  description: 'Start a sub-agent to handle a specific task. The sub-agent has its own conversation context and tool permissions, and does not pollute the current conversation.',
  schema: {
    type: 'object',
    required: ['agentId', 'task'],
    properties: {
      agentId: {
        type: 'string',
        description: 'Sub-agent ID (e.g. pr-reviewer)',
      },
      task: {
        type: 'string',
        description: 'Task description to delegate to the sub-agent',
      },
      params: {
        type: 'object',
        description: 'Custom parameters for the sub-agent (optional)',
      },
      timeout: {
        type: 'integer',
        description: 'Timeout in seconds (default: 600)',
        default: 600,
      },
    },
  },
  tags: ['sub-agent', 'delegate'],
  handler: async () => ({ delegated: true }),
}

export interface SpawnContext {
  subAgentRegistry: SubAgentRegistry
  subAgentExecutor: SubAgentExecutor
  parentAllowedTools: string[]
  parentTraceId: string
  nestingDepth?: number
}

export async function executeSpawnSubAgent(
  args: {
    agentId: string
    task: string
    params?: Record<string, unknown>
    timeout?: number
  },
  context: SpawnContext,
): Promise<SubAgentResult> {
  const agent = context.subAgentRegistry.get(args.agentId)
  if (!agent) {
    return {
      success: false,
      summary: '',
      turnsUsed: 0,
      tokensUsed: 0,
      traceId: context.parentTraceId,
      errors: [`Sub-agent not found: ${args.agentId}`],
    }
  }

  const timeoutMs = (args.timeout ?? 600) * 1000

  return context.subAgentExecutor.run({
    agent,
    task: args.task,
    params: args.params,
    parentTraceId: context.parentTraceId,
    parentAllowedTools: context.parentAllowedTools,
    timeoutMs,
    nestingDepth: context.nestingDepth,
  })
}
