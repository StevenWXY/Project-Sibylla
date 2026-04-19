/**
 * PersonalSpaceGuard Test Suite
 *
 * Tests access control for personal/ directories.
 * Non-admin users should only access their own personal space.
 */

import { describe, it, expect } from 'vitest'
import { PersonalSpaceGuard } from '../../../src/main/services/harness/guardrails/personal-space'
import type { FileOperation, OperationContext } from '../../../src/main/services/harness/guardrails/types'

const guard = new PersonalSpaceGuard()

/** Helper to create a context with given userId and role */
function ctx(userId: string, userRole: 'admin' | 'editor' | 'viewer' = 'editor'): OperationContext {
  return {
    source: 'user',
    userId,
    userRole,
    workspaceRoot: '/workspace',
  }
}

describe('PersonalSpaceGuard', () => {
  it('should have correct id and description', () => {
    expect(guard.id).toBe('personal-space')
    expect(guard.description).toBeTruthy()
  })

  // ─── Block cases ───

  it('should block non-admin reading another member personal file', async () => {
    const op: FileOperation = { type: 'read', path: 'personal/alice/notes.md' }
    const verdict = await guard.check(op, ctx('bob'))
    expect(verdict.allow).toBe(false)
    if (verdict.allow === false) {
      expect(verdict.ruleId).toBe('personal-space')
      expect(verdict.reason).toContain('alice')
    }
  })

  it('should block non-admin writing to another member personal space', async () => {
    const op: FileOperation = { type: 'write', path: 'personal/alice/draft.md', content: 'hello' }
    const verdict = await guard.check(op, ctx('bob'))
    expect(verdict.allow).toBe(false)
  })

  it('should block non-admin deleting from another member personal space', async () => {
    const op: FileOperation = { type: 'delete', path: 'personal/alice/old.md' }
    const verdict = await guard.check(op, ctx('bob'))
    expect(verdict.allow).toBe(false)
  })

  it('should block rename moving file into another member personal space', async () => {
    const op: FileOperation = {
      type: 'rename',
      path: 'personal/bob/a.md',
      newPath: 'personal/alice/a.md',
    }
    const verdict = await guard.check(op, ctx('bob'))
    expect(verdict.allow).toBe(false)
    if (verdict.allow === false) {
      expect(verdict.reason).toContain('alice')
    }
  })

  it('should block viewer accessing another member personal space', async () => {
    const op: FileOperation = { type: 'read', path: 'personal/charlie/report.md' }
    const verdict = await guard.check(op, ctx('bob', 'viewer'))
    expect(verdict.allow).toBe(false)
  })

  // ─── Allow cases ───

  it('should allow user reading their own personal space', async () => {
    const op: FileOperation = { type: 'read', path: 'personal/bob/notes.md' }
    const verdict = await guard.check(op, ctx('bob'))
    expect(verdict.allow).toBe(true)
  })

  it('should allow user writing to their own personal space', async () => {
    const op: FileOperation = { type: 'write', path: 'personal/bob/draft.md', content: 'content' }
    const verdict = await guard.check(op, ctx('bob'))
    expect(verdict.allow).toBe(true)
  })

  it('should allow admin reading any personal space', async () => {
    const op: FileOperation = { type: 'read', path: 'personal/alice/notes.md' }
    const verdict = await guard.check(op, ctx('admin-user', 'admin'))
    expect(verdict.allow).toBe(true)
  })

  it('should allow admin writing to any personal space', async () => {
    const op: FileOperation = { type: 'write', path: 'personal/alice/notes.md', content: 'updated' }
    const verdict = await guard.check(op, ctx('admin-user', 'admin'))
    expect(verdict.allow).toBe(true)
  })

  it('should allow access to non-personal paths', async () => {
    const op: FileOperation = { type: 'write', path: 'docs/shared/readme.md', content: '# Docs' }
    const verdict = await guard.check(op, ctx('bob'))
    expect(verdict.allow).toBe(true)
  })

  it('should allow access to root personal/ directory (no specific member)', async () => {
    const op: FileOperation = { type: 'read', path: 'personal/' }
    const verdict = await guard.check(op, ctx('bob'))
    expect(verdict.allow).toBe(true)
  })

  // ─── Path normalization ───

  it('should handle paths with leading ./', async () => {
    const op: FileOperation = { type: 'read', path: './personal/alice/notes.md' }
    const verdict = await guard.check(op, ctx('bob'))
    expect(verdict.allow).toBe(false)
  })

  it('should handle paths with leading /', async () => {
    const op: FileOperation = { type: 'read', path: '/personal/alice/notes.md' }
    const verdict = await guard.check(op, ctx('bob'))
    expect(verdict.allow).toBe(false)
  })
})
