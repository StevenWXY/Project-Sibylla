import type { SubAgentResult } from '../../../shared/types'
import type { SubAgentRunOptions, StructuredOutputExtractionResult } from './types'
import type { AiGatewayClient } from '../ai-gateway-client'
import type { Tracer } from '../trace/tracer'
import type { logger as loggerType } from '../../utils/logger'
import { SubAgentContext } from './SubAgentContext'
import { SubAgentRegistry } from './SubAgentRegistry'
import { logger } from '../../utils/logger'

export class SubAgentExecutor {
  private static readonly MAX_RETRIES = 2
  private static readonly MAX_CONCURRENT = 3
  private static readonly GRACEFUL_EXIT_MS = 5000
  private static readonly MAX_NESTING_DEPTH = 3

  private activeCount = 0
  private pendingQueue: Array<() => void> = []
  private activeContexts = new Set<SubAgentContext>()

  constructor(
    private readonly gateway: AiGatewayClient,
    private readonly defaultModel: string,
    private readonly registry: SubAgentRegistry,
    private readonly tracer?: Tracer,
    private readonly log: typeof loggerType = logger,
    private readonly workspaceBoundary?: string,
  ) {}

  async run(opts: SubAgentRunOptions): Promise<SubAgentResult> {
    const nestingDepth = opts.nestingDepth ?? 0
    if (nestingDepth >= SubAgentExecutor.MAX_NESTING_DEPTH) {
      return {
        success: false,
        summary: '',
        turnsUsed: 0,
        tokensUsed: 0,
        traceId: opts.parentTraceId,
        errors: [`Sub-agent nesting depth exceeded: ${nestingDepth} >= ${SubAgentExecutor.MAX_NESTING_DEPTH}`],
      }
    }

    if (this.activeCount >= SubAgentExecutor.MAX_CONCURRENT) {
      await this.waitForSlot()
    }

    let ctx: SubAgentContext | undefined

    try {
      this.activeCount++

      ctx = await SubAgentContext.create({
        agent: opts.agent,
        task: opts.task,
        params: opts.params,
        parentTraceId: opts.parentTraceId,
        parentAllowedTools: opts.parentAllowedTools,
        timeoutMs: opts.timeoutMs,
        gateway: this.gateway,
        defaultModel: this.defaultModel,
        registry: this.registry,
        workspaceBoundary: this.workspaceBoundary,
        nestingDepth,
        tracer: this.tracer,
        logger: this.log,
      })

      this.activeContexts.add(ctx)

      if (this.tracer?.isEnabled()) {
        return await this.tracer.withSpan('sub-agent.run', async (span) => {
          span.setAttribute('agent.id', opts.agent.id)
          span.setAttribute('parent_trace_id', opts.parentTraceId)
          return this.executeLoop(ctx, opts, span)
        }, {
          kind: 'ai-call',
          parent: opts.parentTraceId ? { traceId: opts.parentTraceId, spanId: '' } : undefined,
        })
      }

      return this.executeLoop(ctx, opts)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.log.error('sub-agent.executor.run-failed', { error: message })
      return {
        success: false,
        summary: '',
        turnsUsed: 0,
        tokensUsed: 0,
        traceId: opts.parentTraceId,
        errors: [message],
      }
    } finally {
      if (ctx) {
        this.activeContexts.delete(ctx)
      }
      this.activeCount--
      this.releaseSlot()
    }
  }

  private async executeLoop(
    ctx: SubAgentContext,
    opts: SubAgentRunOptions,
    span?: { addEvent: (name: string, attrs: Record<string, unknown>) => void },
  ): Promise<SubAgentResult> {
    let turnsUsed = 0
    const errors: string[] = []

    for (let turn = 1; turn <= opts.agent.maxTurns; turn++) {
      if (ctx.isAborted()) break
      if (ctx.getElapsedMs() > opts.timeoutMs) {
        this.log.info('sub-agent.executor.timeout', { turn })
        break
      }

      try {
        const lastUserMsg = this.getLastUserMessage(ctx.messages) ?? ctx.task
        const response = await ctx.generator.generate({
          request: {
            message: lastUserMsg,
            model: opts.agent.model,
          },
          context: {
            systemPrompt: ctx.systemPrompt,
            layers: [],
            totalTokens: 0,
            budgetUsed: 0,
            budgetTotal: opts.agent.maxTokens,
            sources: [],
            warnings: [],
          },
        })

        ctx.addUsage(response.usage.totalTokens, response.usage.estimatedCostUsd)
        ctx.addMessage('assistant', response.content)
        turnsUsed = turn

        span?.addEvent('sub-agent.turn', {
          turn,
          tokensUsed: ctx.usage.totalTokens,
        })

        // TODO(TASK038): Replace string-based tool_use detection with structured tool call API once available
        const toolUsePattern = /<tool_use>|"type"\s*:\s*"tool_use"|```tool/
        if (!toolUsePattern.test(response.content)) {
          break
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        errors.push(`Generator error on turn ${turn}: ${message}`)
        this.log.error('sub-agent.executor.generator-error', { turn, error: message })
        break
      }

      // Token budget check
      if (ctx.usage.totalTokens > opts.agent.maxTokens) {
        this.log.info('sub-agent.executor.token-budget-exceeded', {
          tokens: ctx.usage.totalTokens,
          max: opts.agent.maxTokens,
        })
        break
      }
    }

    // Extract structured output if schema defined
    let structuredOutput: Record<string, unknown> | undefined
    const lastAssistantMsg = this.getLastAssistantMessage(ctx.messages)

    if (opts.agent.outputSchema && lastAssistantMsg) {
      const extraction = this.extractStructuredOutput(lastAssistantMsg, opts.agent.outputSchema)

      if (extraction.valid) {
        structuredOutput = extraction.output
      } else {
        let retried = false
        for (let retry = 0; retry < SubAgentExecutor.MAX_RETRIES; retry++) {
          ctx.addMessage('user', `Previous output did not conform to the required schema: ${extraction.errors.join(', ')}. Please output the result strictly following the JSON schema.`)

          try {
            const retryResponse = await ctx.generator.generate({
              request: {
                message: this.getLastUserMessage(ctx.messages) ?? '',
                model: opts.agent.model,
              },
              context: {
                systemPrompt: ctx.systemPrompt,
                layers: [],
                totalTokens: 0,
                budgetUsed: 0,
                budgetTotal: opts.agent.maxTokens,
                sources: [],
                warnings: [],
              },
            })

            ctx.addUsage(retryResponse.usage.totalTokens, retryResponse.usage.estimatedCostUsd)
            ctx.addMessage('assistant', retryResponse.content)
            turnsUsed++

            const retryExtraction = this.extractStructuredOutput(retryResponse.content, opts.agent.outputSchema)
            if (retryExtraction.valid) {
              structuredOutput = retryExtraction.output
              retried = true
              break
            }
          } catch {
            break
          }
        }

        if (!retried) {
          errors.push('Structured output extraction failed after retries')
        }
      }
    }

    const summary = structuredOutput
      ? (structuredOutput.summary as string ?? lastAssistantMsg ?? '')
      : (lastAssistantMsg ?? '')

    return {
      success: errors.length === 0,
      structuredOutput,
      summary,
      turnsUsed,
      tokensUsed: ctx.usage.totalTokens,
      traceId: opts.parentTraceId,
      errors,
    }
  }

  private extractStructuredOutput(
    content: string,
    schema: Record<string, unknown>,
  ): StructuredOutputExtractionResult {
    const jsonStr = this.extractJson(content)
    if (!jsonStr) {
      return { valid: false, errors: ['No JSON found in response'] }
    }

    try {
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>
      const errors = this.validateAgainstSchema(parsed, schema)
      if (errors.length === 0) {
        return { valid: true, output: parsed }
      }
      return { valid: false, errors }
    } catch (err) {
      return {
        valid: false,
        errors: [`JSON parse error: ${err instanceof Error ? err.message : String(err)}`],
      }
    }
  }

  private extractJson(content: string): string | null {
    const codeBlockMatch = content.match(/```json\s*\n?([\s\S]*?)\n?\s*```/)
    if (codeBlockMatch?.[1]) {
      return codeBlockMatch[1].trim()
    }

    const pureJsonMatch = content.match(/\{[\s\S]*\}/)
    if (pureJsonMatch) {
      return pureJsonMatch[0]
    }

    return null
  }

  private validateAgainstSchema(
    data: Record<string, unknown>,
    schema: Record<string, unknown>,
  ): string[] {
    const errors: string[] = []
    const required = schema.required as string[] | undefined

    if (required) {
      for (const field of required) {
        if (data[field] === undefined) {
          errors.push(`Missing required field: ${field}`)
        }
      }
    }

    return errors
  }

  private getLastAssistantMessage(messages: Array<{ role: string; content: string }>): string | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.role === 'assistant') {
        return messages[i]!.content
      }
    }
    return undefined
  }

  private getLastUserMessage(messages: Array<{ role: string; content: string }>): string | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.role === 'user') {
        return messages[i]!.content
      }
    }
    return undefined
  }

  private waitForSlot(): Promise<void> {
    return new Promise((resolve) => {
      this.pendingQueue.push(resolve)
    })
  }

  private releaseSlot(): void {
    const next = this.pendingQueue.shift()
    if (next) {
      next()
    }
  }

  get activeAgentCount(): number {
    return this.activeCount
  }

  async gracefulAbort(): Promise<void> {
    for (const ctx of this.activeContexts) {
      ctx.abort()
    }

    const deadline = Date.now() + SubAgentExecutor.GRACEFUL_EXIT_MS
    while (this.activeContexts.size > 0 && Date.now() < deadline) {
      await new Promise<void>((resolve) => setTimeout(resolve, 200))
    }

    this.log.info('sub-agent.executor.graceful-abort', {
      remaining: this.activeContexts.size,
    })
  }

  abortAll(): void {
    for (const ctx of this.activeContexts) {
      ctx.abort()
    }
    this.log.info('sub-agent.executor.abort-all')
  }
}
