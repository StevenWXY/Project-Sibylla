/**
 * Guardrail Type Definitions
 *
 * Core types for the Guardrails hard protection layer.
 * All Guardrail modules import their types from this single source.
 *
 * Design constraints:
 * - All fields are `readonly` to prevent rule implementations from mutating input
 * - `GuardrailVerdict` uses tagged union for strict discrimination
 * - `OperationContext.userRole` reuses `MemberRole` from shared types
 */

import type { MemberRole } from '../../../../shared/types/member.types'

// ─── Operation Types ───

/** Type of file operation being checked */
export type FileOperationType = 'write' | 'delete' | 'rename' | 'read'

/** Source of the operation — determines which guards activate */
export type OperationSource = 'user' | 'ai' | 'sync'

/**
 * Describes the file operation being evaluated by guardrail rules.
 * All fields are readonly — rules must not mutate the operation descriptor.
 */
export interface FileOperation {
  readonly type: FileOperationType
  readonly path: string
  /** Target path for rename operations */
  readonly newPath?: string
  /** File content (only present for write operations) */
  readonly content?: string
  /** Affected file paths for bulk operations */
  readonly affectedPaths?: readonly string[]
}

/**
 * Context in which the operation is performed.
 * Built from AuthHandler cached user + FileManager workspace root.
 */
export interface OperationContext {
  readonly source: OperationSource
  readonly userId: string
  readonly userRole: MemberRole
  readonly workspaceRoot: string
  /** AI session identifier (optional, for future harness integration) */
  readonly sessionId?: string
}

// ─── Verdict Types (Tagged Union) ───

/**
 * Three-way verdict returned by each guardrail rule:
 * - `{ allow: true }` — operation is permitted
 * - `{ allow: false, ... }` — operation is blocked with reason
 * - `{ allow: 'conditional', ... }` — operation requires user confirmation
 */
export type GuardrailVerdict =
  | { readonly allow: true }
  | {
      readonly allow: false
      readonly ruleId: string
      readonly reason: string
      readonly severity: 'block'
    }
  | {
      readonly allow: 'conditional'
      readonly ruleId: string
      readonly requireConfirmation: true
      readonly reason: string
    }

// ─── Type Guards ───

/**
 * Narrows a verdict to the blocked variant.
 * Enables safe property access to `ruleId`, `reason`, `severity`
 * without explicit casting in handler code.
 */
export function isBlockedVerdict(
  verdict: GuardrailVerdict,
): verdict is Extract<GuardrailVerdict, { allow: false }> {
  return verdict.allow === false
}

/**
 * Narrows a verdict to the conditional variant.
 * Enables safe property access to `ruleId`, `reason`, `requireConfirmation`
 * without explicit casting in handler code.
 */
export function isConditionalVerdict(
  verdict: GuardrailVerdict,
): verdict is Extract<GuardrailVerdict, { allow: 'conditional' }> {
  return verdict.allow === 'conditional'
}

// ─── Rule Interface ───

/**
 * Contract for all guardrail rules.
 * Each rule is a stateless checker that evaluates a file operation
 * against its specific security concern.
 *
 * Rules must:
 * - Be pure functions (no I/O, no network, no LLM calls)
 * - Complete in < 5ms
 * - Never throw (engine wraps in fail-closed try-catch as safety net)
 * - Never mutate `op` or `ctx`
 */
export interface GuardrailRule {
  readonly id: string
  readonly description: string
  check(op: FileOperation, ctx: OperationContext): Promise<GuardrailVerdict>
}

/**
 * Lightweight summary of a rule for IPC queries (e.g., `harness:listGuardrails`).
 */
export interface GuardrailRuleSummary {
  readonly id: string
  readonly description: string
  readonly enabled: boolean
}
