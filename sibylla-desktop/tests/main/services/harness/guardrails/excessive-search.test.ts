import { describe, it, expect, beforeEach } from 'vitest'
import { ExcessiveSearchGuard } from '../../../../../src/main/services/harness/guardrails/excessive-search'

describe('ExcessiveSearchGuard', () => {
  let guard: ExcessiveSearchGuard

  beforeEach(() => {
    guard = new ExcessiveSearchGuard()
  })

  it('should allow non-unified_search tools directly', async () => {
    const verdict = await guard.check('reference_file', 'session-1')
    expect(verdict.allow).toBe(true)
  })

  it('should allow up to 3 unified_search calls', async () => {
    const v1 = await guard.check('unified_search', 'session-1')
    expect(v1.allow).toBe(true)

    const v2 = await guard.check('unified_search', 'session-1')
    expect(v2.allow).toBe(true)

    const v3 = await guard.check('unified_search', 'session-1')
    expect(v3.allow).toBe(true)
  })

  it('should return conditional after 3 unified_search calls', async () => {
    await guard.check('unified_search', 'session-1')
    await guard.check('unified_search', 'session-1')
    await guard.check('unified_search', 'session-1')

    const verdict = await guard.check('unified_search', 'session-1')
    expect(verdict.allow).toBe('conditional')
    if (verdict.allow === 'conditional') {
      expect(verdict.ruleId).toBe('excessive-search')
      expect(verdict.requireConfirmation).toBe(true)
      expect(verdict.reason).toContain('4')
    }
  })

  it('should reset counter on resetTurn', async () => {
    await guard.check('unified_search', 'session-1')
    await guard.check('unified_search', 'session-1')
    await guard.check('unified_search', 'session-1')

    guard.resetTurn('session-1')

    const verdict = await guard.check('unified_search', 'session-1')
    expect(verdict.allow).toBe(true)
  })

  it('should isolate counters by sessionId', async () => {
    await guard.check('unified_search', 'session-1')
    await guard.check('unified_search', 'session-1')
    await guard.check('unified_search', 'session-1')

    const verdict = await guard.check('unified_search', 'session-2')
    expect(verdict.allow).toBe(true)
  })
})
