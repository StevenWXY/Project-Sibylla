import { ReactiveCompact } from './reactive-compact'
import type { ReactiveCompactTrigger } from './types'
import type { HookExecutor } from '../hooks/HookExecutor'
import type { Tracer } from '../trace/tracer'
import type { BrowserWindow } from 'electron'
import { estimateTokens } from '../context-engine/token-utils'
import { logger } from '../../utils/logger'

export interface CompactOrchestratorContext {
  maxTokens?: number
  conversationId: string
  workspacePath: string
}

export interface CompactProgressEvent {
  type: 'compact:started' | 'compact:completed' | 'compact:failed'
  strategy?: string
  conversationId: string
  tokensAfterRecovery?: number
  warnings?: string[]
  boundaryMessage?: string
}

export class CompactOrchestrator {
  constructor(
    private readonly reactiveCompact: ReactiveCompact,
    private readonly hookExecutor?: HookExecutor,
    private readonly browserWindow?: BrowserWindow,
    private readonly tracer?: Tracer,
  ) {}

  async handleApiError(
    error: Error,
    messages: ReadonlyArray<{ role: string; content: string }>,
    context: CompactOrchestratorContext,
  ): Promise<{
    recovered: boolean
    messages: Array<{ role: string; content: string }>
    escalatedMaxTokens?: number
    metaMessage?: string
  }> {
    const trigger = this.identifyTrigger(error, messages, context.maxTokens)
    if (!trigger) {
      return { recovered: false, messages: [...messages] }
    }

    this.pushEvent('compact:started', {
      strategy: trigger.type,
      conversationId: context.conversationId,
    })

    const tokensBefore = this.estimateTokens(messages)

    if (this.tracer?.isEnabled()) {
      await this.tracer.withSpan('compact.boundary', async (span) => {
        span.setAttribute('compact.trigger_type', trigger.type)
        span.setAttribute('compact.tokens_before', tokensBefore)
        span.setAttribute('compact.conversation_id', context.conversationId)
        span.addEvent('compact_boundary', {
          triggerType: trigger.type,
          tokensBefore,
          conversationId: context.conversationId,
        })
      }, { kind: 'internal' })
    }

    if (this.hookExecutor) {
      await this.hookExecutor.executeNode('PreCompaction', {
        node: 'PreCompaction',
        trigger: { userMessage: undefined },
        conversationId: context.conversationId,
        workspacePath: context.workspacePath,
      })
    }

    const result = await this.reactiveCompact.tryRecover(trigger)

    const tokensAfter = this.estimateTokens(result.recoveredMessages)

    if (this.tracer?.isEnabled()) {
      await this.tracer.withSpan('compact.boundary.post', async (span) => {
        span.setAttribute('compact.recovered', result.recovered)
        span.setAttribute('compact.tokens_after', tokensAfter)
        span.addEvent('compact_boundary', {
          recovered: result.recovered,
          strategy: result.strategy,
          tokensAfter,
          tokensBefore,
          conversationId: context.conversationId,
        })
      }, { kind: 'internal' })
    }

    if (this.hookExecutor) {
      await this.hookExecutor.executeNode('PostCompaction', {
        node: 'PostCompaction',
        trigger: { userMessage: undefined },
        conversationId: context.conversationId,
        workspacePath: context.workspacePath,
      })
    }

    if (result.recovered) {
      this.pushEvent('compact:completed', {
        strategy: result.strategy,
        tokensAfterRecovery: tokensAfter,
        conversationId: context.conversationId,
        boundaryMessage: `compact_boundary: ${result.strategy} recovered (${tokensBefore} -> ${tokensAfter} tokens)`,
      })
    } else {
      this.pushEvent('compact:failed', {
        strategy: result.strategy,
        warnings: result.warnings,
        conversationId: context.conversationId,
        boundaryMessage: `compact_boundary: ${result.strategy} failed`,
      })
    }

    return {
      recovered: result.recovered,
      messages: result.recoveredMessages,
      escalatedMaxTokens: result.escalatedMaxTokens,
      metaMessage: result.metaMessage,
    }
  }

  resetForNewTurn(): void {
    this.reactiveCompact.resetRetryCount()
  }

  private identifyTrigger(
    error: Error,
    messages: ReadonlyArray<{ role: string; content: string }>,
    maxTokens?: number,
  ): ReactiveCompactTrigger | null {
    const msg = error.message.toLowerCase()

    if (msg.includes('413') || msg.includes('prompt_too_long') || msg.includes('context_length')) {
      return {
        type: 'prompt_too_long',
        error,
        messagesAtFailure: messages,
      }
    }

    if (msg.includes('max_output_tokens') || msg.includes('output_length')) {
      return {
        type: 'max_output_tokens',
        error,
        messagesAtFailure: messages,
        originalMaxTokens: maxTokens,
      }
    }

    if (msg.includes('media_size') || msg.includes('media_too_large')) {
      return {
        type: 'media_size',
        error,
        messagesAtFailure: messages,
      }
    }

    return null
  }

  private pushEvent(channel: string, data: Record<string, unknown>): void {
    try {
      this.browserWindow?.webContents.send(channel, data)
    } catch {
      // Window may be closed
    }
    logger.info(`[CompactOrchestrator] Event: ${channel}`, data)
  }

  private estimateTokens(messages: ReadonlyArray<{ role: string; content: string }>): number {
    return messages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0)
  }
}
