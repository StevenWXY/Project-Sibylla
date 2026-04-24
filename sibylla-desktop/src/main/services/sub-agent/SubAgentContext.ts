import type { SubAgentDefinition } from '../../../shared/types'
import type { SubAgentContextData, SubAgentContextOptions } from './types'
import { Generator } from '../harness/generator'
import { GuardrailEngine } from '../harness/guardrails/engine'
import type { logger as loggerType } from '../../utils/logger'

const MAX_NESTING_DEPTH = 3

export class SubAgentContext {
  readonly agent: SubAgentDefinition
  readonly task: string
  readonly params: Record<string, unknown>
  readonly parentTraceId: string
  readonly allowedTools: string[]
  readonly timeoutMs: number
  readonly generator: Generator
  readonly guardrailEngine: GuardrailEngine
  readonly systemPrompt: string
  readonly messages: Array<{ role: string; content: string }>
  readonly usage: { totalTokens: number; totalCost: number }
  readonly abortController: AbortController
  readonly startedAt: number
  readonly workspaceBoundary?: string

  private constructor(data: SubAgentContextData) {
    this.agent = data.agent
    this.task = data.task
    this.params = data.params
    this.parentTraceId = data.parentTraceId
    this.allowedTools = data.allowedTools
    this.timeoutMs = data.timeoutMs
    this.generator = data.generator
    this.guardrailEngine = data.guardrailEngine
    this.systemPrompt = data.systemPrompt
    this.messages = data.messages
    this.usage = data.usage
    this.abortController = data.abortController
    this.startedAt = data.startedAt
    this.workspaceBoundary = data.workspaceBoundary
  }

  static async create(opts: SubAgentContextOptions): Promise<SubAgentContext> {
    const nestingDepth = opts.nestingDepth ?? 0
    if (nestingDepth >= MAX_NESTING_DEPTH) {
      throw new Error(`Sub-agent nesting depth exceeded: ${nestingDepth} >= ${MAX_NESTING_DEPTH}`)
    }

    if (opts.workspaceBoundary) {
      const boundary = opts.workspaceBoundary
      const boundaryUser = boundary.match(/personal\/([^/]+)/)?.[1]
      if (boundaryUser) {
        const allText = [
          opts.task,
          JSON.stringify(opts.params ?? {}),
        ].join(' ')
        const personalMatches = allText.matchAll(/personal\/([^/]+)/g)
        for (const match of personalMatches) {
          if (match[1] !== boundaryUser) {
            throw new Error(`Sub-agent access denied: personal space boundary violation (attempted access to personal/${match[1]}, boundary is personal/${boundaryUser})`)
          }
        }
      }
    }

    const model = opts.agent.model ?? opts.defaultModel

    const generator = new Generator(opts.gateway, model, opts.logger)

    const guardrailEngine = new GuardrailEngine()

    const systemPrompt = await opts.registry.loadAgentPrompt(opts.agent.id)

    const shouldLoadMemory = opts.agent.context.inheritMemory === true
    let memoryContent: string | null = null
    if (shouldLoadMemory && opts.workspaceBoundary) {
      try {
        memoryContent = await opts.registry.loadMemoryFile(opts.workspaceBoundary)
      } catch {
        // MEMORY.md optional
      }
    }

    const allowedTools = SubAgentContext.computeAllowedTools(
      opts.agent.allowedTools,
      opts.parentAllowedTools,
      nestingDepth,
      opts.logger,
    )

    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ]

    if (memoryContent) {
      messages.push({ role: 'system', content: `[Memory Context]\n${memoryContent}` })
    }

    messages.push({ role: 'user', content: opts.task })

    if (opts.params && Object.keys(opts.params).length > 0) {
      messages.push({
        role: 'user',
        content: `Additional parameters: ${JSON.stringify(opts.params)}`,
      })
    }

    const data: SubAgentContextData = {
      agent: opts.agent,
      task: opts.task,
      params: opts.params ?? {},
      parentTraceId: opts.parentTraceId,
      allowedTools,
      timeoutMs: opts.timeoutMs,
      generator,
      guardrailEngine,
      systemPrompt,
      messages,
      usage: { totalTokens: 0, totalCost: 0 },
      abortController: new AbortController(),
      startedAt: Date.now(),
      workspaceBoundary: opts.workspaceBoundary,
    }

    return new SubAgentContext(data)
  }

  addMessage(role: string, content: string): void {
    this.messages.push({ role, content })
  }

  addUsage(tokens: number, cost: number): void {
    this.usage.totalTokens += tokens
    this.usage.totalCost += cost
  }

  isAborted(): boolean {
    return this.abortController.signal.aborted
  }

  getElapsedMs(): number {
    return Date.now() - this.startedAt
  }

  abort(): void {
    this.abortController.abort()
  }

  private static computeAllowedTools(
    agentTools: string[],
    parentTools: string[],
    nestingDepth: number,
    log: typeof loggerType,
  ): string[] {
    const parentSet = new Set(parentTools)
    const result = agentTools.filter((tool) => {
      if (!parentSet.has(tool)) {
        log.warn('sub-agent.context.tool-trimmed', {
          tool,
          reason: 'not in parent allowed tools',
        })
        return false
      }
      return true
    })

    // Remove spawnSubAgent unless explicitly declared and within nesting limit
    const spawnIdx = result.indexOf('spawnSubAgent')
    if (spawnIdx !== -1) {
      // Only allow if nesting depth + 1 < MAX (i.e., current depth < 2)
      if (nestingDepth + 1 >= MAX_NESTING_DEPTH) {
        result.splice(spawnIdx, 1)
        log.warn('sub-agent.context.spawn-removed', {
          reason: 'nesting depth would exceed limit',
          nestingDepth,
        })
      }
    }

    return result
  }
}
