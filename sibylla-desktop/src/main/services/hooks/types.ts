export type HookNode =
  | 'PreUserMessage'
  | 'PreSystemPrompt'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PreCompaction'
  | 'PostCompaction'
  | 'StopCheck'
  | 'PostMessage'

export interface HookMetadata {
  id: string
  version: string
  name: string
  description: string
  nodes: readonly HookNode[]
  priority: number
  source: 'builtin' | 'user'
  condition?: string
  enabled: boolean
}

export interface HookContextModifications {
  systemPromptAppend?: string
  userMessageOverride?: string
  contextAdditions?: ReadonlyArray<{ key: string; value: string }>
}

export interface HookResult {
  decision: 'allow' | 'block' | 'warn' | 'modify'
  reason?: string
  message?: string
  modifications?: HookContextModifications
}

export interface HookContext {
  node: HookNode
  trigger: {
    userMessage?: string
    tool?: { name: string; input: Record<string, unknown> }
    toolResult?: unknown
    assistantMessage?: string
  }
  conversationId: string
  workspacePath: string
  parentTraceId?: string
  userApprovalHandler?: (assessment: unknown) => Promise<boolean>
}

export interface Hook {
  readonly metadata: HookMetadata
  execute(ctx: HookContext): Promise<HookResult>
}
