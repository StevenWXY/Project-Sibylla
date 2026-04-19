/**
 * SystemPathGuard Test Suite
 *
 * Tests that AI is blocked from writing to system directories
 * (.sibylla/, .git/, node_modules/) while user operations and
 * AI reads are allowed.
 */

import { describe, it, expect } from 'vitest'
import { SystemPathGuard } from '../../../src/main/services/harness/guardrails/system-path'
import type { FileOperation, OperationContext } from '../../../src/main/services/harness/guardrails/types'

const guard = new SystemPathGuard()

/** Helper to create an AI operation context */
function aiCtx(overrides?: Partial<OperationContext>): OperationContext {
  return {
    source: 'ai',
    userId: 'user-1',
    userRole: 'editor',
    workspaceRoot: '/workspace',
    ...overrides,
  }
}

/** Helper to create a user operation context */
function userCtx(overrides?: Partial<OperationContext>): OperationContext {
  return {
    source: 'user',
    userId: 'user-1',
    userRole: 'editor',
    workspaceRoot: '/workspace',
    ...overrides,
  }
}

describe('SystemPathGuard', () => {
  it('should have correct id and description', () => {
    expect(guard.id).toBe('system-path')
    expect(guard.description).toBeTruthy()
  })

  // ─── Block cases ───

  it('should block AI writing to .sibylla/config.json', async () => {
    const op: FileOperation = { type: 'write', path: '.sibylla/config.json', content: '{}' }
    const verdict = await guard.check(op, aiCtx())
    expect(verdict.allow).toBe(false)
    if (verdict.allow === false) {
      expect(verdict.ruleId).toBe('system-path')
      expect(verdict.severity).toBe('block')
    }
  })

  it('should block AI writing to .git/HEAD', async () => {
    const op: FileOperation = { type: 'write', path: '.git/HEAD', content: 'ref: refs/heads/main' }
    const verdict = await guard.check(op, aiCtx())
    expect(verdict.allow).toBe(false)
  })

  it('should block AI writing to node_modules/foo/index.js', async () => {
    const op: FileOperation = { type: 'write', path: 'node_modules/foo/index.js', content: '// code' }
    const verdict = await guard.check(op, aiCtx())
    expect(verdict.allow).toBe(false)
  })

  it('should block AI deleting .sibylla/memory/daily/2026-04-18.md', async () => {
    const op: FileOperation = { type: 'delete', path: '.sibylla/memory/daily/2026-04-18.md' }
    const verdict = await guard.check(op, aiCtx())
    expect(verdict.allow).toBe(false)
  })

  it('should block AI move to .git directory (rename target)', async () => {
    const op: FileOperation = { type: 'rename', path: 'docs/a.md', newPath: '.git/a.md' }
    const verdict = await guard.check(op, aiCtx())
    expect(verdict.allow).toBe(false)
  })

  it('should block AI move from .sibylla directory (rename source)', async () => {
    const op: FileOperation = { type: 'rename', path: '.sibylla/config.json', newPath: 'config-backup.json' }
    const verdict = await guard.check(op, aiCtx())
    expect(verdict.allow).toBe(false)
  })

  it('should block AI writing to bare .git (directory itself)', async () => {
    const op: FileOperation = { type: 'write', path: '.git', content: '' }
    const verdict = await guard.check(op, aiCtx())
    expect(verdict.allow).toBe(false)
  })

  // ─── Allow cases ───

  it('should allow AI reading .sibylla/memory/daily/...', async () => {
    const op: FileOperation = { type: 'read', path: '.sibylla/memory/daily/2026-04-18.md' }
    const verdict = await guard.check(op, aiCtx())
    expect(verdict.allow).toBe(true)
  })

  it('should allow user writing to .sibylla/config.json', async () => {
    const op: FileOperation = { type: 'write', path: '.sibylla/config.json', content: '{}' }
    const verdict = await guard.check(op, userCtx())
    expect(verdict.allow).toBe(true)
  })

  it('should allow AI writing to docs/product/prd.md', async () => {
    const op: FileOperation = { type: 'write', path: 'docs/product/prd.md', content: '# PRD' }
    const verdict = await guard.check(op, aiCtx())
    expect(verdict.allow).toBe(true)
  })

  it('should allow sync source writing to .sibylla/', async () => {
    const op: FileOperation = { type: 'write', path: '.sibylla/config.json', content: '{}' }
    const verdict = await guard.check(op, { ...aiCtx(), source: 'sync' })
    expect(verdict.allow).toBe(true)
  })

  // ─── Path normalization ───

  it('should handle paths with leading ./', async () => {
    const op: FileOperation = { type: 'write', path: './.git/HEAD', content: '' }
    const verdict = await guard.check(op, aiCtx())
    expect(verdict.allow).toBe(false)
  })

  it('should handle paths with leading /', async () => {
    const op: FileOperation = { type: 'write', path: '/.sibylla/config.json', content: '' }
    const verdict = await guard.check(op, aiCtx())
    expect(verdict.allow).toBe(false)
  })
})
