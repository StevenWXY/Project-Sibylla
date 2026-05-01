import { describe, it, expect } from 'vitest'
import { PersonalSpaceGuard } from '../../../src/main/services/harness/guardrails/personal-space'
import type { FileOperation, OperationContext } from '../../../src/main/services/harness/guardrails/types'

const guard = new PersonalSpaceGuard()

function ctx(userId: string, userRole: 'admin' | 'editor' | 'viewer' = 'editor'): OperationContext {
  return {
    source: 'user',
    userId,
    userRole,
    workspaceRoot: '/workspace',
  }
}

describe('Sprint 6 write validation regression', () => {
  it('daily report save to self personal/ — allowed', async () => {
    const op: FileOperation = {
      type: 'write',
      path: 'personal/alice/reports/daily/2026-05-01.md',
      content: '# Daily Report',
    }
    const verdict = await guard.check(op, ctx('alice'))
    expect(verdict.allow).toBe(true)
  })

  it('daily report save to other personal/ — denied', async () => {
    const op: FileOperation = {
      type: 'write',
      path: 'personal/bob/reports/daily/2026-05-01.md',
      content: '# Daily Report',
    }
    const verdict = await guard.check(op, ctx('alice'))
    expect(verdict.allow).toBe(false)
  })

  it('decision log save to system directory — allowed (not personal/)', async () => {
    const op: FileOperation = {
      type: 'write',
      path: '.sibylla/memory/decisions/2026-05-01-xxx.md',
      content: '# Decision',
    }
    const verdict = await guard.check(op, ctx('alice'))
    expect(verdict.allow).toBe(true)
  })

  it('decision log save to other personal/ — denied', async () => {
    const op: FileOperation = {
      type: 'write',
      path: 'personal/bob/decisions/xxx.md',
      content: '# Decision',
    }
    const verdict = await guard.check(op, ctx('alice'))
    expect(verdict.allow).toBe(false)
  })
})
