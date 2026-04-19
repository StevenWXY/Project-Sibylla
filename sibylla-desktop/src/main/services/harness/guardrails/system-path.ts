/**
 * SystemPathGuard — Blocks AI from writing to system directories
 *
 * Protected prefixes: .sibylla/, .git/, node_modules/
 * Only activates for source='ai' and non-read operations.
 * Read operations are always allowed (AI needs to read .sibylla/memory/).
 *
 * For rename operations, both source and target paths are checked
 * to prevent moving files into system directories.
 */

import type { GuardrailRule, FileOperation, OperationContext, GuardrailVerdict } from './types'

/** System directories that AI must not write to */
const FORBIDDEN_PREFIXES = ['.sibylla/', '.git/', 'node_modules/'] as const

/** Directory names that are also forbidden (without trailing slash) */
const FORBIDDEN_EXACT = ['.sibylla', '.git', 'node_modules'] as const

/**
 * Normalize a workspace-relative path for prefix matching.
 * Strips leading `./ ` and `/` to produce a clean relative path.
 */
function normalizePath(p: string): string {
  let normalized = p
  // Strip leading ./
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2)
  }
  // Strip leading /
  while (normalized.startsWith('/')) {
    normalized = normalized.slice(1)
  }
  return normalized
}

/**
 * Check whether a normalized path falls under any forbidden prefix.
 */
function isForbiddenPath(normalizedPath: string): string | null {
  // Check exact directory name matches (e.g., ".git" without trailing slash)
  for (const exact of FORBIDDEN_EXACT) {
    if (normalizedPath === exact) {
      return exact
    }
  }
  // Check prefix matches (e.g., ".git/HEAD")
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (normalizedPath.startsWith(prefix)) {
      return prefix
    }
  }
  return null
}

export class SystemPathGuard implements GuardrailRule {
  readonly id = 'system-path'
  readonly description = 'Blocks AI from writing to .sibylla/, .git/, and node_modules/ directories'

  async check(op: FileOperation, ctx: OperationContext): Promise<GuardrailVerdict> {
    // Only activate for AI-sourced operations
    if (ctx.source !== 'ai') {
      return { allow: true }
    }

    // Read operations are always allowed
    if (op.type === 'read') {
      return { allow: true }
    }

    // Check primary path
    const normalizedPath = normalizePath(op.path)
    const matchedPrefix = isForbiddenPath(normalizedPath)
    if (matchedPrefix) {
      return {
        allow: false,
        ruleId: this.id,
        severity: 'block',
        reason: `AI cannot write to system directory '${matchedPrefix}': ${op.path}`,
      }
    }

    // For rename operations, also check the target path
    if (op.type === 'rename' && op.newPath) {
      const normalizedNewPath = normalizePath(op.newPath)
      const matchedNewPrefix = isForbiddenPath(normalizedNewPath)
      if (matchedNewPrefix) {
        return {
          allow: false,
          ruleId: this.id,
          severity: 'block',
          reason: `AI cannot move files into system directory '${matchedNewPrefix}': ${op.newPath}`,
        }
      }
    }

    return { allow: true }
  }
}
