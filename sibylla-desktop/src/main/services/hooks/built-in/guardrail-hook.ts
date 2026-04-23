import type { Hook, HookContext, HookMetadata, HookResult } from '../types'
import type { GuardrailEngine } from '../../harness/guardrails/engine'
import type { FileOperation, FileOperationType, OperationContext } from '../../harness/guardrails/types'

function inferOperationType(toolName: string): FileOperationType {
  const lower = toolName.toLowerCase()
  if (lower.includes('delete') || lower.includes('remove')) return 'delete'
  if (lower.includes('rename') || lower.includes('move')) return 'rename'
  if (lower.includes('read') || lower.includes('get') || lower.includes('list')) return 'read'
  return 'write'
}

export class GuardrailHook implements Hook {
  readonly metadata: HookMetadata = {
    id: 'builtin.guardrail',
    version: '1.0.0',
    name: '安全护栏',
    description: '检查工具调用安全性，拦截危险操作',
    nodes: ['PreToolUse'],
    priority: 1000,
    source: 'builtin',
    enabled: true,
  }

  constructor(private readonly guardrailEngine: GuardrailEngine) {}

  async execute(ctx: HookContext): Promise<HookResult> {
    if (!ctx.trigger.tool) return { decision: 'allow' }

    const op: FileOperation = {
      type: inferOperationType(ctx.trigger.tool.name),
      path: (ctx.trigger.tool.input['path'] as string) ?? '',
      content: (ctx.trigger.tool.input['content'] as string) ?? undefined,
      affectedPaths: (ctx.trigger.tool.input['paths'] as string[] | undefined) ?? undefined,
    }

    const opCtx: OperationContext = {
      source: 'ai',
      userId: '',
      userRole: 'editor',
      workspaceRoot: ctx.workspacePath,
      sessionId: ctx.conversationId,
    }

    const verdict = await this.guardrailEngine.check(op, opCtx)

    if (verdict.allow === true) {
      return { decision: 'allow' }
    }

    if (verdict.allow === 'conditional' && 'requireConfirmation' in verdict) {
      const approved = ctx.userApprovalHandler
        ? await ctx.userApprovalHandler(verdict)
        : false
      if (!approved) {
        return { decision: 'block', reason: verdict.reason, message: '用户拒绝了此操作' }
      }
      return { decision: 'allow' }
    }

    return { decision: 'block', reason: verdict.allow === false ? verdict.reason : 'unknown', message: '操作被安全护栏拦截' }
  }
}
