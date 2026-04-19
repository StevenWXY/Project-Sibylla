/**
 * BulkOperationGuard Test Suite
 *
 * Tests that bulk delete/rename operations (>3 files) require confirmation,
 * while smaller operations and writes are allowed through.
 */

import { describe, it, expect } from 'vitest'
import { BulkOperationGuard } from '../../../src/main/services/harness/guardrails/bulk-operation'
import type { FileOperation, OperationContext } from '../../../src/main/services/harness/guardrails/types'

const guard = new BulkOperationGuard()

/** Helper to create a default context */
function ctx(): OperationContext {
  return {
    source: 'ai',
    userId: 'user-1',
    userRole: 'editor',
    workspaceRoot: '/workspace',
  }
}

/** Helper to create N file paths */
function paths(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `file-${i + 1}.md`)
}

describe('BulkOperationGuard', () => {
  it('should have correct id and description', () => {
    expect(guard.id).toBe('bulk-operation')
    expect(guard.description).toBeTruthy()
  })

  // ─── Conditional cases ───

  it('should return conditional for delete with 4 affected files', async () => {
    const op: FileOperation = {
      type: 'delete',
      path: 'batch/',
      affectedPaths: paths(4),
    }
    const verdict = await guard.check(op, ctx())
    expect(verdict.allow).toBe('conditional')
    if (verdict.allow === 'conditional') {
      expect(verdict.ruleId).toBe('bulk-operation')
      expect(verdict.requireConfirmation).toBe(true)
      expect(verdict.reason).toContain('4')
    }
  })

  it('should return conditional for rename with 5 affected files', async () => {
    const op: FileOperation = {
      type: 'rename',
      path: 'batch/',
      newPath: 'new-batch/',
      affectedPaths: paths(5),
    }
    const verdict = await guard.check(op, ctx())
    expect(verdict.allow).toBe('conditional')
  })

  it('should return conditional for delete with 100 affected files', async () => {
    const op: FileOperation = {
      type: 'delete',
      path: 'bulk/',
      affectedPaths: paths(100),
    }
    const verdict = await guard.check(op, ctx())
    expect(verdict.allow).toBe('conditional')
    if (verdict.allow === 'conditional') {
      expect(verdict.reason).toContain('100')
    }
  })

  // ─── Allow cases ───

  it('should allow delete with exactly 3 affected files (at threshold)', async () => {
    const op: FileOperation = {
      type: 'delete',
      path: 'batch/',
      affectedPaths: paths(3),
    }
    const verdict = await guard.check(op, ctx())
    expect(verdict.allow).toBe(true)
  })

  it('should allow delete with 2 affected files', async () => {
    const op: FileOperation = {
      type: 'delete',
      path: 'batch/',
      affectedPaths: paths(2),
    }
    const verdict = await guard.check(op, ctx())
    expect(verdict.allow).toBe(true)
  })

  it('should allow delete without affectedPaths (single file)', async () => {
    const op: FileOperation = {
      type: 'delete',
      path: 'single-file.md',
    }
    const verdict = await guard.check(op, ctx())
    expect(verdict.allow).toBe(true)
  })

  it('should allow write even with many affected files', async () => {
    const op: FileOperation = {
      type: 'write',
      path: 'output.md',
      content: 'content',
      affectedPaths: paths(10),
    }
    const verdict = await guard.check(op, ctx())
    expect(verdict.allow).toBe(true)
  })

  it('should allow read operation', async () => {
    const op: FileOperation = {
      type: 'read',
      path: 'docs/',
      affectedPaths: paths(10),
    }
    const verdict = await guard.check(op, ctx())
    expect(verdict.allow).toBe(true)
  })

  it('should allow rename with empty affectedPaths', async () => {
    const op: FileOperation = {
      type: 'rename',
      path: 'a.md',
      newPath: 'b.md',
      affectedPaths: [],
    }
    const verdict = await guard.check(op, ctx())
    expect(verdict.allow).toBe(true)
  })
})
