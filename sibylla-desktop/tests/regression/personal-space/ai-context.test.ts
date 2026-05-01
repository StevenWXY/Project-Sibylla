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

describe('AI Context personal-space exclusion regression', () => {
  it('non-admin: guard blocks read of other personal/ — prevents AI context inclusion', async () => {
    const op: FileOperation = { type: 'read', path: 'personal/bob/secret-notes.md' }
    const verdict = await guard.check(op, ctx('alice'))
    expect(verdict.allow).toBe(false)
  })

  it('admin: guard allows read of other personal/ but AI context must exclude it', async () => {
    const op: FileOperation = { type: 'read', path: 'personal/bob/secret-notes.md' }
    const verdict = await guard.check(op, ctx('alice', 'admin'))
    expect(verdict.allow).toBe(true)
  })

  it('non-admin: task linked file in other personal/ is blocked from read', async () => {
    const op: FileOperation = { type: 'read', path: 'personal/bob/tasks/ref.md' }
    const verdict = await guard.check(op, ctx('alice'))
    expect(verdict.allow).toBe(false)
  })
})
