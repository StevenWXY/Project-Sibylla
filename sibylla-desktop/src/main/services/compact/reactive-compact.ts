import type { ReactiveCompactTrigger, RecoveryAttempt, RecoveryResult } from './types'
import { logger } from '../../utils/logger'

export type CompactFn = (messages: ReadonlyArray<{ role: string; content: string }>) => Promise<Array<{ role: string; content: string }>>

export class ReactiveCompact {
  private static readonly MAX_RETRIES = 3
  private static readonly ESCALATED_MAX_TOKENS = 64000
  private static readonly RECENT_MESSAGES_TO_KEEP = 10

  private retryCount = 0
  private compactedThisTurn = false
  private readonly attempts: RecoveryAttempt[] = []

  constructor(
    private readonly tokenEstimator: (text: string) => number,
    private readonly autoCompactFn: CompactFn,
  ) {}

  async tryRecover(trigger: ReactiveCompactTrigger): Promise<RecoveryResult> {
    if (this.retryCount >= ReactiveCompact.MAX_RETRIES) {
      return {
        recovered: false,
        strategy: 'max_retries_exceeded',
        recoveredMessages: [...trigger.messagesAtFailure],
        tokensAfterRecovery: this.estimateTokens(trigger.messagesAtFailure),
        warnings: ['已达到最大重试次数（3 次）'],
        userAction: 'clear',
      }
    }

    this.retryCount++

    switch (trigger.type) {
      case 'prompt_too_long':
        return this.handlePromptTooLong(trigger)
      case 'max_output_tokens':
        return this.handleMaxOutputTokens(trigger)
      case 'media_size':
        return this.handleMediaSize(trigger)
    }
  }

  hasCompactedThisTurn(): boolean {
    return this.compactedThisTurn
  }

  resetRetryCount(): void {
    this.retryCount = 0
    this.compactedThisTurn = false
  }

  getRecoveryHistory(): readonly RecoveryAttempt[] {
    return this.attempts
  }

  private async handlePromptTooLong(trigger: ReactiveCompactTrigger): Promise<RecoveryResult> {
    const tokensBefore = this.estimateTokens(trigger.messagesAtFailure)

    if (!this.compactedThisTurn) {
      try {
        const compacted = await this.autoCompactFn(trigger.messagesAtFailure)
        this.compactedThisTurn = true
        const tokensAfter = this.estimateTokens(compacted)

        this.recordAttempt(trigger, 'auto_compact', true, tokensBefore, tokensAfter)

        return {
          recovered: true,
          strategy: 'auto_compact',
          recoveredMessages: compacted,
          tokensAfterRecovery: tokensAfter,
          warnings: ['已自动压缩上下文以继续对话'],
        }
      } catch (err) {
        logger.warn('[ReactiveCompact] Auto compact failed', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const truncated = this.aggressiveTruncate(trigger.messagesAtFailure)
    const tokensAfter = this.estimateTokens(truncated)

    this.recordAttempt(trigger, 'aggressive_truncate', true, tokensBefore, tokensAfter)

    const warnings = ['已裁剪早期对话以继续，部分历史消息被移除']
    if (this.compactedThisTurn) {
      warnings.unshift('自动压缩未能充分减少上下文，改用激进裁剪')
    }

    return {
      recovered: true,
      strategy: 'aggressive_truncate',
      recoveredMessages: truncated,
      tokensAfterRecovery: tokensAfter,
      warnings,
    }
  }

  private async handleMaxOutputTokens(trigger: ReactiveCompactTrigger): Promise<RecoveryResult> {
    const tokensBefore = this.estimateTokens(trigger.messagesAtFailure)

    if (this.retryCount === 1) {
      this.recordAttempt(trigger, 'escalate_max_tokens', true, tokensBefore, tokensBefore)

      return {
        recovered: true,
        strategy: 'escalate_max_tokens',
        recoveredMessages: [...trigger.messagesAtFailure],
        tokensAfterRecovery: tokensBefore,
        warnings: [],
        escalatedMaxTokens: ReactiveCompact.ESCALATED_MAX_TOKENS,
      }
    }

    if (this.retryCount === 2) {
      const messages = [
        ...trigger.messagesAtFailure,
        { role: 'user', content: '从上次中断处继续' },
      ]
      const tokensAfter = this.estimateTokens(messages)

      this.recordAttempt(trigger, 'inject_continue_meta', true, tokensBefore, tokensAfter)

      return {
        recovered: true,
        strategy: 'inject_continue_meta',
        recoveredMessages: messages,
        tokensAfterRecovery: tokensAfter,
        warnings: [],
        metaMessage: '从上次中断处继续',
      }
    }

    this.recordAttempt(trigger, 'max_retries_exceeded', false, tokensBefore, tokensBefore)

    return {
      recovered: false,
      strategy: 'max_retries_exceeded',
      recoveredMessages: [...trigger.messagesAtFailure],
      tokensAfterRecovery: tokensBefore,
      warnings: ['输出长度已达上限，请尝试缩短您的请求或使用 /compact 压缩上下文'],
      userAction: 'compact',
    }
  }

  private async handleMediaSize(trigger: ReactiveCompactTrigger): Promise<RecoveryResult> {
    const tokensBefore = this.estimateTokens(trigger.messagesAtFailure)

    const truncated = trigger.messagesAtFailure.map(msg => {
      if (msg.content.length > 10000) {
        return { ...msg, content: msg.content.slice(0, 10000) + '\n[媒体内容已截断]' }
      }
      return msg
    })

    const tokensAfter = this.estimateTokens(truncated)
    this.recordAttempt(trigger, 'media_truncate', true, tokensBefore, tokensAfter)

    return {
      recovered: true,
      strategy: 'media_truncate',
      recoveredMessages: truncated,
      tokensAfterRecovery: tokensAfter,
      warnings: ['媒体内容过大，已截断处理'],
    }
  }

  private aggressiveTruncate(messages: ReadonlyArray<{ role: string; content: string }>): Array<{ role: string; content: string }> {
    const result: Array<{ role: string; content: string }> = []

    let firstUserMessage: { role: string; content: string } | undefined
    let systemPrompt: { role: string; content: string } | undefined

    for (const msg of messages) {
      if (msg.role === 'system' && !systemPrompt) {
        systemPrompt = msg
      } else if (msg.role === 'user' && !firstUserMessage) {
        firstUserMessage = msg
      }
    }

    if (systemPrompt) result.push(systemPrompt)
    if (firstUserMessage) {
      result.push({ ...firstUserMessage, content: '[任务锚点] ' + firstUserMessage.content })
    }

    const recent = messages.slice(-ReactiveCompact.RECENT_MESSAGES_TO_KEEP)
    for (const msg of recent) {
      if (msg === systemPrompt || msg === firstUserMessage) continue
      result.push(msg)
    }

    return result
  }

  private estimateTokens(messages: ReadonlyArray<{ role: string; content: string }>): number {
    return messages.reduce((sum, msg) => sum + this.tokenEstimator(msg.content), 0)
  }

  private recordAttempt(
    trigger: ReactiveCompactTrigger,
    strategy: string,
    success: boolean,
    tokensBefore: number,
    tokensAfter: number,
  ): void {
    this.attempts.push({
      trigger,
      strategy,
      success,
      timestamp: Date.now(),
      tokensBefore,
      tokensAfter,
    })
    logger.info('[ReactiveCompact] Recovery attempt recorded', {
      strategy,
      success,
      tokensBefore,
      tokensAfter,
    })
  }
}
