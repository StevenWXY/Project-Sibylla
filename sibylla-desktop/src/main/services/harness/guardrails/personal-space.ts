/**
 * PersonalSpaceGuard — Prevents unauthorized access to other members' personal spaces
 *
 * Rules:
 * - Paths not under `personal/` are always allowed
 * - Admin users can READ any personal space (with audit trail)
 * - Admin users CANNOT WRITE to other members' personal space
 * - Non-admin users can only access `personal/{ownUserId}/...`
 * - For rename operations, both source and target paths are checked
 *
 * References CLAUDE.md §七: "个人空间 personal/[name]/ 的内容不得出现在其他成员的 AI 上下文中（Admin 除外）"
 */

import type { GuardrailRule, FileOperation, FileOperationType, OperationContext, GuardrailVerdict } from './types'

const PERSONAL_PREFIX = 'personal/'

/**
 * Normalize path by stripping leading `./ ` and `/`.
 */
function normalizePath(p: string): string {
  let normalized = p
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2)
  }
  while (normalized.startsWith('/')) {
    normalized = normalized.slice(1)
  }
  return normalized
}

/**
 * Extract the member name from a personal space path.
 * Returns null if path is not under personal/ or is the personal/ root itself.
 *
 * Examples:
 *   "personal/alice/notes.md" → "alice"
 *   "personal/bob/"          → "bob"
 *   "personal/"              → null (root, no specific member)
 *   "docs/readme.md"         → null (not personal)
 */
function extractPersonalMember(normalizedPath: string): string | null {
  if (!normalizedPath.startsWith(PERSONAL_PREFIX)) {
    return null
  }

  const remainder = normalizedPath.slice(PERSONAL_PREFIX.length)
  if (!remainder) {
    return null // bare "personal/" root
  }

  const slashIdx = remainder.indexOf('/')
  if (slashIdx === -1) {
    // Could be "personal/alice" (directory itself)
    return remainder || null
  }

  return remainder.slice(0, slashIdx) || null
}

/**
 * Check if a path violates personal space access for the given context.
 * Returns the blocked member name, or null if access is allowed.
 */
function checkPersonalAccess(normalizedPath: string, ctx: OperationContext, opType: FileOperationType): string | null {
  const memberName = extractPersonalMember(normalizedPath)

  if (memberName === null) {
    return null
  }

  if (ctx.userRole === 'admin') {
    if (opType === 'write' || opType === 'delete' || opType === 'rename') {
      if (memberName !== ctx.userId) {
        return memberName
      }
    }
    return null
  }

  if (memberName === ctx.userId) {
    return null
  }

  return memberName
}

export class PersonalSpaceGuard implements GuardrailRule {
  readonly id = 'personal-space'
  readonly description = 'Prevents unauthorized access to other members\' personal spaces'

  async check(op: FileOperation, ctx: OperationContext): Promise<GuardrailVerdict> {
    const normalizedPath = normalizePath(op.path)
    const blockedMember = checkPersonalAccess(normalizedPath, ctx, op.type)

    if (blockedMember) {
      return {
        allow: false,
        ruleId: this.id,
        severity: 'block',
        reason: `Access denied to personal space of '${blockedMember}'`,
      }
    }

    if (op.type === 'rename' && op.newPath) {
      const normalizedNewPath = normalizePath(op.newPath)
      const blockedNewMember = checkPersonalAccess(normalizedNewPath, ctx, op.type)

      if (blockedNewMember) {
        return {
          allow: false,
          ruleId: this.id,
          severity: 'block',
          reason: `Cannot move file into personal space of '${blockedNewMember}'`,
        }
      }
    }

    return { allow: true }
  }
}
