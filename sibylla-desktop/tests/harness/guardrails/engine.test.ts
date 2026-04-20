/**
 * GuardrailEngine Test Suite
 *
 * Tests the engine's rule orchestration: sequential execution, fail-closed,
 * rule enable/disable, and listRules functionality.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GuardrailEngine } from '../../../src/main/services/harness/guardrails/engine'
import type { FileOperation, OperationContext, GuardrailRule, GuardrailVerdict } from '../../../src/main/services/harness/guardrails/types'

/** Default operation for testing */
const defaultOp: FileOperation = {
  type: 'write',
  path: 'docs/test.md',
  content: 'Hello, world!',
}

/** Default context for testing */
const defaultCtx: OperationContext = {
  source: 'user',
  userId: 'user-1',
  userRole: 'editor',
  workspaceRoot: '/workspace',
}

describe('GuardrailEngine', () => {
  let engine: GuardrailEngine

  beforeEach(() => {
    engine = new GuardrailEngine()
  })

  // ─── Basic functionality ───

  it('should return allow:true when all rules pass', async () => {
    const verdict = await engine.check(defaultOp, defaultCtx)
    expect(verdict.allow).toBe(true)
  })

  it('should list 4 rules', () => {
    const rules = engine.listRules()
    expect(rules).toHaveLength(4)
    expect(rules.map(r => r.id)).toEqual([
      'system-path',
      'secret-leak',
      'personal-space',
      'bulk-operation',
    ])
  })

  it('should list all rules as enabled by default', () => {
    const rules = engine.listRules()
    expect(rules.every(r => r.enabled)).toBe(true)
  })

  // ─── Block behavior ───

  it('should return block when SystemPathGuard triggers', async () => {
    const op: FileOperation = { type: 'write', path: '.git/HEAD', content: '' }
    const ctx: OperationContext = { ...defaultCtx, source: 'ai' }
    const verdict = await engine.check(op, ctx)
    expect(verdict.allow).toBe(false)
    if (verdict.allow === false) {
      expect(verdict.ruleId).toBe('system-path')
    }
  })

  it('should return block when SecretLeakGuard triggers', async () => {
    const fakeKey = 'sk-' + 'a'.repeat(48)
    const op: FileOperation = { type: 'write', path: 'config.md', content: fakeKey }
    const verdict = await engine.check(op, defaultCtx)
    expect(verdict.allow).toBe(false)
    if (verdict.allow === false) {
      expect(verdict.ruleId).toBe('secret-leak')
    }
  })

  it('should stop execution at first block (SystemPath before SecretLeak)', async () => {
    // This operation would trigger both SystemPath and SecretLeak
    // But SystemPath runs first and should block
    const fakeKey = 'sk-' + 'a'.repeat(48)
    const op: FileOperation = { type: 'write', path: '.git/config', content: fakeKey }
    const ctx: OperationContext = { ...defaultCtx, source: 'ai' }
    const verdict = await engine.check(op, ctx)
    expect(verdict.allow).toBe(false)
    if (verdict.allow === false) {
      // Should be blocked by system-path, not secret-leak
      expect(verdict.ruleId).toBe('system-path')
    }
  })

  // ─── Conditional behavior ───

  it('should return conditional for bulk delete', async () => {
    const op: FileOperation = {
      type: 'delete',
      path: 'batch/',
      affectedPaths: ['a.md', 'b.md', 'c.md', 'd.md'],
    }
    const verdict = await engine.check(op, defaultCtx)
    expect(verdict.allow).toBe('conditional')
  })

  // ─── Rule enable/disable ───

  it('should skip disabled rules', async () => {
    // Disable SecretLeakGuard
    engine.setRuleEnabled('secret-leak', false)

    // This would normally be blocked by SecretLeakGuard
    const fakeKey = 'sk-' + 'a'.repeat(48)
    const op: FileOperation = { type: 'write', path: 'config.md', content: fakeKey }
    const verdict = await engine.check(op, defaultCtx)
    // Should pass because SecretLeakGuard is disabled
    expect(verdict.allow).toBe(true)
  })

  it('should re-enable rules after disabling', async () => {
    engine.setRuleEnabled('secret-leak', false)
    engine.setRuleEnabled('secret-leak', true)

    const fakeKey = 'sk-' + 'a'.repeat(48)
    const op: FileOperation = { type: 'write', path: 'config.md', content: fakeKey }
    const verdict = await engine.check(op, defaultCtx)
    expect(verdict.allow).toBe(false)
  })

  it('should throw error for unknown ruleId in setRuleEnabled', () => {
    expect(() => engine.setRuleEnabled('non-existent-rule', false)).toThrow(
      "Unknown guardrail rule ID: 'non-existent-rule'"
    )
  })

  it('should reflect disabled state in listRules', () => {
    engine.setRuleEnabled('bulk-operation', false)
    const rules = engine.listRules()
    const bulkRule = rules.find(r => r.id === 'bulk-operation')
    expect(bulkRule?.enabled).toBe(false)
  })

  // ─── Fail-closed behavior ───

  it('should return block when a rule throws an error (fail-closed)', async () => {
    // We need to test fail-closed. Since we can't easily inject a throwing rule
    // into the engine's private array, we'll test via a more targeted approach.
    // Disable all built-in rules and verify the engine handles edge cases.

    // Actually, let's verify by accessing the engine internally.
    // In production code we'd use dependency injection, but for testing:
    const throwingRule: GuardrailRule = {
      id: 'test-throwing',
      description: 'A rule that always throws',
      check: async () => {
        throw new Error('Simulated rule failure')
      },
    }

    // Create engine with custom rule injection via type assertion
    const testEngine = new GuardrailEngine()
    // Access private rules array for testing purposes
    const rulesArray = (testEngine as unknown as { rules: GuardrailRule[] }).rules
    rulesArray.unshift(throwingRule)
    const enabledMap = (testEngine as unknown as { enabledRules: Map<string, boolean> }).enabledRules
    enabledMap.set('test-throwing', true)

    const verdict = await testEngine.check(defaultOp, defaultCtx)
    expect(verdict.allow).toBe(false)
    if (verdict.allow === false) {
      expect(verdict.ruleId).toBe('test-throwing')
      expect(verdict.reason).toContain('fail-closed')
      expect(verdict.reason).toContain('Simulated rule failure')
    }
  })

  // ─── Performance baseline ───

  it('should complete 1000 checks in reasonable time for non-triggering operations', async () => {
    const op: FileOperation = { type: 'write', path: 'docs/test.md', content: 'Normal content' }
    const start = performance.now()
    for (let i = 0; i < 1000; i++) {
      await engine.check(op, defaultCtx)
    }
    const elapsed = performance.now() - start
    // 1000 checks should complete well under 5 seconds (averaging < 5ms per check)
    expect(elapsed).toBeLessThan(5000)
  })
})
