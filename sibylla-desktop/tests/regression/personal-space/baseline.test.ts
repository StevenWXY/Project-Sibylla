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

describe('Personal-space baseline regression', () => {
  it('user read self personal/ — allowed', async () => {
    const op: FileOperation = { type: 'read', path: 'personal/alice/notes/test.md' }
    const verdict = await guard.check(op, ctx('alice'))
    expect(verdict.allow).toBe(true)
  })

  it('user read other personal/ — denied', async () => {
    const op: FileOperation = { type: 'read', path: 'personal/bob/notes/test.md' }
    const verdict = await guard.check(op, ctx('alice'))
    expect(verdict.allow).toBe(false)
  })

  it('user write self personal/ — allowed', async () => {
    const op: FileOperation = { type: 'write', path: 'personal/alice/notes/new.md', content: 'x' }
    const verdict = await guard.check(op, ctx('alice'))
    expect(verdict.allow).toBe(true)
  })

  it('user write other personal/ — denied', async () => {
    const op: FileOperation = { type: 'write', path: 'personal/bob/notes/new.md', content: 'x' }
    const verdict = await guard.check(op, ctx('alice'))
    expect(verdict.allow).toBe(false)
  })

  it('admin read self personal/ — allowed', async () => {
    const op: FileOperation = { type: 'read', path: 'personal/alice/notes/test.md' }
    const verdict = await guard.check(op, ctx('alice', 'admin'))
    expect(verdict.allow).toBe(true)
  })

  it('admin read other personal/ — allowed', async () => {
    const op: FileOperation = { type: 'read', path: 'personal/bob/notes/test.md' }
    const verdict = await guard.check(op, ctx('alice', 'admin'))
    expect(verdict.allow).toBe(true)
  })

  it('admin write self personal/ — allowed', async () => {
    const op: FileOperation = { type: 'write', path: 'personal/alice/notes/new.md', content: 'x' }
    const verdict = await guard.check(op, ctx('alice', 'admin'))
    expect(verdict.allow).toBe(true)
  })

  it('admin write other personal/ — denied (admin cannot write to others)', async () => {
    const op: FileOperation = { type: 'write', path: 'personal/bob/notes/new.md', content: 'x' }
    const verdict = await guard.check(op, ctx('alice', 'admin'))
    expect(verdict.allow).toBe(false)
  })

  it('admin delete other personal/ — denied', async () => {
    const op: FileOperation = { type: 'delete', path: 'personal/bob/notes/test.md' }
    const verdict = await guard.check(op, ctx('alice', 'admin'))
    expect(verdict.allow).toBe(false)
  })

  it('admin rename into other personal/ — denied', async () => {
    const op: FileOperation = { type: 'rename', path: 'docs/readme.md', newPath: 'personal/bob/readme.md' }
    const verdict = await guard.check(op, ctx('alice', 'admin'))
    expect(verdict.allow).toBe(false)
  })

  it('admin rename within own personal/ — allowed', async () => {
    const op: FileOperation = { type: 'rename', path: 'personal/alice/old.md', newPath: 'personal/alice/new.md' }
    const verdict = await guard.check(op, ctx('alice', 'admin'))
    expect(verdict.allow).toBe(true)
  })
})
