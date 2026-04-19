/**
 * BulkOperationGuard — Requires confirmation for bulk delete/rename operations
 *
 * Rules:
 * - Only activates for delete and rename operations
 * - When `affectedPaths.length > BULK_THRESHOLD`, returns conditional verdict
 * - Write operations are never affected (write is always single-file in current API)
 * - If `affectedPaths` is missing, treats as single-file operation (allow)
 *
 * This is the only guard that returns `allow: 'conditional'` verdicts.
 */

import type { GuardrailRule, FileOperation, OperationContext, GuardrailVerdict } from './types'

/** Number of affected files that triggers the confirmation requirement */
const BULK_THRESHOLD = 3

export class BulkOperationGuard implements GuardrailRule {
  readonly id = 'bulk-operation'
  readonly description = 'Requires confirmation when deleting or renaming more than 3 files at once'

  async check(op: FileOperation, _ctx: OperationContext): Promise<GuardrailVerdict> {
    // Only check delete and rename operations
    if (op.type !== 'delete' && op.type !== 'rename') {
      return { allow: true }
    }

    // If affectedPaths is not provided, treat as single-file operation
    if (!op.affectedPaths || op.affectedPaths.length <= BULK_THRESHOLD) {
      return { allow: true }
    }

    return {
      allow: 'conditional',
      ruleId: this.id,
      requireConfirmation: true,
      reason: `This operation affects ${op.affectedPaths.length} files (threshold: ${BULK_THRESHOLD}). User confirmation required.`,
    }
  }
}
