import type { Hook, HookContext, HookContextModifications, HookNode, HookResult } from './types'
import type { HookRegistry } from './HookRegistry'
import type { Tracer } from '../trace/tracer'
import { logger } from '../../utils/logger'

export class HookExecutor {
  private static readonly HOOK_TIMEOUT_MS = 5000

  constructor(
    private readonly registry: HookRegistry,
    private readonly tracer?: Tracer,
  ) {}

  async executeNode(node: HookNode, ctx: HookContext): Promise<HookResult[]> {
    const hooks = this.registry.getByNode(node)
    const results: HookResult[] = []
    let mutableCtx: HookContext = { ...ctx, trigger: { ...ctx.trigger } }

    for (const hook of hooks) {
      const start = Date.now()
      const result = await this.runWithTimeout(hook, mutableCtx, HookExecutor.HOOK_TIMEOUT_MS)
      const durationMs = Date.now() - start

      this.recordTrace(hook, node, durationMs, result)

      results.push(result)

      if (result.decision === 'block') {
        break
      }

      if (result.decision === 'modify' && result.modifications) {
        mutableCtx = this.applyModifications(mutableCtx, result.modifications)
      }
    }

    return results
  }

  private async runWithTimeout(
    hook: Hook,
    ctx: HookContext,
    timeoutMs: number,
  ): Promise<HookResult> {
    return Promise.race([
      hook.execute(ctx),
      new Promise<HookResult>((_, reject) =>
        setTimeout(() => reject(new Error('Hook timeout')), timeoutMs),
      ),
    ]).catch((err: unknown) => {
      logger.warn('[HookExecutor] Hook execution failed/timed out', {
        hookId: hook.metadata.id,
        error: err instanceof Error ? err.message : String(err),
      })
      return { decision: 'allow', reason: 'hook-error-fail-open' } satisfies HookResult
    })
  }

  private applyModifications(ctx: HookContext, mods: HookContextModifications): HookContext {
    return {
      ...ctx,
      trigger: {
        ...ctx.trigger,
        userMessage: mods.userMessageOverride ?? ctx.trigger.userMessage,
      },
    }
  }

  private recordTrace(hook: Hook, node: HookNode, durationMs: number, result: HookResult): void {
    if (!this.tracer?.isEnabled()) return

    try {
      const span = this.tracer.startSpan(`hook:${hook.metadata.id}`, {
        attributes: {
          'hook.node': node,
          'hook.id': hook.metadata.id,
          'hook.source': hook.metadata.source,
          'hook.decision': result.decision,
          'hook.duration_ms': durationMs,
        },
      })
      if (durationMs > HookExecutor.HOOK_TIMEOUT_MS) {
        span.addEvent('timeout_warning', { durationMs })
      }
      span.setStatus('ok')
      span.end()
    } catch {
      // Trace failure should not block hook execution
    }
  }
}
