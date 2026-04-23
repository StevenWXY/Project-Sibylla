export type ReactiveCompactTriggerType =
  | 'prompt_too_long'
  | 'max_output_tokens'
  | 'media_size'

export interface ReactiveCompactTrigger {
  type: ReactiveCompactTriggerType
  error: Error
  messagesAtFailure: ReadonlyArray<{ role: string; content: string }>
  originalMaxTokens?: number
}

export interface RecoveryResult {
  recovered: boolean
  strategy: string
  recoveredMessages: Array<{ role: string; content: string }>
  tokensAfterRecovery: number
  warnings: string[]
  userAction?: 'retry' | 'clear' | 'compact'
  escalatedMaxTokens?: number
  metaMessage?: string
}

export interface RecoveryAttempt {
  trigger: ReactiveCompactTrigger
  strategy: string
  success: boolean
  timestamp: number
  tokensBefore: number
  tokensAfter: number
}
