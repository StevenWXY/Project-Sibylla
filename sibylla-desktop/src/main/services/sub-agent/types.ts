import type {
  SubAgentDefinition,
  SubAgentResult,
} from '../../../shared/types'
import type { Generator } from '../harness/generator'
import type { GuardrailEngine } from '../harness/guardrails/engine'
import type { AiGatewayClient } from '../ai-gateway-client'
import type { PromptComposer } from '../context-engine/PromptComposer'
import type { Tracer } from '../trace/tracer'
import type { logger as loggerType } from '../../utils/logger'

export interface SubAgentRunOptions {
  agent: SubAgentDefinition
  task: string
  params?: Record<string, unknown>
  parentTraceId: string
  parentAllowedTools: string[]
  timeoutMs: number
  nestingDepth?: number
}

export interface SubAgentContextData {
  agent: SubAgentDefinition
  task: string
  params: Record<string, unknown>
  parentTraceId: string
  allowedTools: string[]
  timeoutMs: number
  generator: Generator
  guardrailEngine: GuardrailEngine
  systemPrompt: string
  messages: Array<{ role: string; content: string }>
  usage: { totalTokens: number; totalCost: number }
  abortController: AbortController
  startedAt: number
  workspaceBoundary?: string
}

export interface SubAgentContextOptions {
  agent: SubAgentDefinition
  task: string
  params?: Record<string, unknown>
  parentTraceId: string
  parentAllowedTools: string[]
  timeoutMs: number
  gateway: AiGatewayClient
  defaultModel: string
  registry: import('./SubAgentRegistry').SubAgentRegistry
  workspaceBoundary?: string
  nestingDepth?: number
  tracer?: Tracer
  logger: typeof loggerType
}

export interface ToolCallResult {
  success: boolean
  content: string
  error?: string
}

export interface StructuredOutputExtractionResult {
  valid: boolean
  output?: Record<string, unknown>
  errors: string[]
}
