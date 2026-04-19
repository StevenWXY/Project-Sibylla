/**
 * SecretLeakGuard — Detects API keys, private keys, and JWT tokens in file content
 *
 * Activates for ALL sources (not just AI) — users should not write secrets either.
 * Only checks write operations that have content.
 *
 * IMPORTANT: Logs only record the matched pattern name, never the actual secret value.
 */

import type { GuardrailRule, FileOperation, OperationContext, GuardrailVerdict } from './types'

/**
 * Named regex patterns for detecting secrets.
 * Each entry: [humanName, regex]
 */
const SECRET_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['OpenAI API Key', /sk-[a-zA-Z0-9]{32,}/],
  ['Anthropic API Key', /sk-ant-[a-zA-Z0-9_-]{95,}/],
  ['GitHub Personal Access Token', /ghp_[a-zA-Z0-9]{36}/],
  ['AWS Access Key ID', /AKIA[0-9A-Z]{16}/],
  ['Private Key Header', /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['JWT Token', /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],
] as const

export class SecretLeakGuard implements GuardrailRule {
  readonly id = 'secret-leak'
  readonly description = 'Detects API keys, private keys, and JWT tokens in file content'

  async check(op: FileOperation, _ctx: OperationContext): Promise<GuardrailVerdict> {
    // Only check write operations with content
    if (op.type !== 'write' || !op.content) {
      return { allow: true }
    }

    // Scan content against all patterns
    for (const [patternName, regex] of SECRET_PATTERNS) {
      if (regex.test(op.content)) {
        return {
          allow: false,
          ruleId: this.id,
          severity: 'block',
          reason: `Content contains pattern matching ${patternName}`,
        }
      }
    }

    return { allow: true }
  }
}
