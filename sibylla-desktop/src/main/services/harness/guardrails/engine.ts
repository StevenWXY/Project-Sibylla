/**
 * GuardrailEngine — Core engine that orchestrates guardrail rule execution
 *
 * Responsibilities:
 * 1. Sequential rule execution in priority order
 * 2. Fail-closed: any rule exception defaults to block
 * 3. First block/conditional result terminates the chain
 * 4. Rule enable/disable management
 * 5. Structured logging for all check results
 *
 * Rule execution order (fixed):
 *   1. SystemPathGuard   — cheapest check (string prefix), highest priority
 *   2. SecretLeakGuard   — content scan, critical for data safety
 *   3. PersonalSpaceGuard — path + role semantics
 *   4. BulkOperationGuard — conditional confirmation, lowest priority
 */

import type {
  GuardrailRule,
  GuardrailRuleSummary,
  FileOperation,
  OperationContext,
  GuardrailVerdict,
} from './types'
import { SystemPathGuard } from './system-path'
import { SecretLeakGuard } from './secret-leak'
import { PersonalSpaceGuard } from './personal-space'
import { BulkOperationGuard } from './bulk-operation'
import { logger } from '../../../utils/logger'
import type { Tracer } from '../../trace/tracer'

export class GuardrailEngine {
  private readonly rules: GuardrailRule[]
  private readonly enabledRules: Map<string, boolean>
  private tracer?: Tracer

  constructor() {
    // Fixed execution order — see class docblock for rationale
    this.rules = [
      new SystemPathGuard(),
      new SecretLeakGuard(),
      new PersonalSpaceGuard(),
      new BulkOperationGuard(),
    ]

    // All rules enabled by default
    this.enabledRules = new Map(this.rules.map(rule => [rule.id, true]))
  }

  setTracer(tracer: Tracer): void {
    this.tracer = tracer
  }

  /**
   * Execute all enabled guardrail rules sequentially.
   *
   * Returns the first non-allow verdict, or `{ allow: true }` if all pass.
   * Any exception thrown by a rule triggers fail-closed behavior.
   */
  async check(op: FileOperation, ctx: OperationContext): Promise<GuardrailVerdict> {
    if (!this.tracer?.isEnabled()) {
      return this.checkInternal(op, ctx)
    }
    return this.tracer.withSpan('harness.guardrail', async (span) => {
      const verdict = await this.checkInternal(op, ctx)
      span.setAttribute('rule.verdict', verdict.allow ? 'allow' : 'blocked')
      return verdict
    }, { kind: 'system' })
  }

  private async checkInternal(op: FileOperation, ctx: OperationContext): Promise<GuardrailVerdict> {
    for (const rule of this.rules) {
      // Skip disabled rules
      if (!this.enabledRules.get(rule.id)) {
        continue
      }

      try {
        const verdict = await rule.check(op, ctx)

        if (verdict.allow !== true) {
          // Log the block/conditional result
          logger.warn('guardrail.triggered', {
            ruleId: rule.id,
            path: op.path,
            operationType: op.type,
            source: ctx.source,
            user: ctx.userId,
            result: verdict.allow === false ? 'blocked' : 'conditional',
            reason: verdict.allow !== true ? verdict.reason : undefined,
          })

          return verdict
        }
      } catch (error: unknown) {
        // Fail-closed: rule exception → block the operation
        const errorMessage = error instanceof Error ? error.message : String(error)

        logger.error('guardrail.rule-error', {
          ruleId: rule.id,
          path: op.path,
          operationType: op.type,
          source: ctx.source,
          user: ctx.userId,
          error: errorMessage,
        })

        return {
          allow: false,
          ruleId: rule.id,
          severity: 'block',
          reason: `Guardrail rule '${rule.id}' failed with error (fail-closed): ${errorMessage}`,
        }
      }
    }

    // All rules passed
    return { allow: true }
  }

  /**
   * Return a summary of all rules with their enabled/disabled status.
   */
  listRules(): GuardrailRuleSummary[] {
    return this.rules.map(rule => ({
      id: rule.id,
      description: rule.description,
      enabled: this.enabledRules.get(rule.id) ?? true,
    }))
  }

  /**
   * Enable or disable a specific rule by ID.
   *
   * @throws Error if ruleId is not recognized
   */
  setRuleEnabled(ruleId: string, enabled: boolean): void {
    if (!this.enabledRules.has(ruleId)) {
      throw new Error(`Unknown guardrail rule ID: '${ruleId}'`)
    }

    this.enabledRules.set(ruleId, enabled)

    logger.info('guardrail.rule-toggled', {
      ruleId,
      enabled,
    })
  }
}
