/**
 * SecretLeakGuard Test Suite
 *
 * Tests detection of API keys, private keys, and JWT tokens
 * in file content. This guard applies to all sources (user, ai, sync).
 */

import { describe, it, expect } from 'vitest'
import { SecretLeakGuard } from '../../../src/main/services/harness/guardrails/secret-leak'
import type { FileOperation, OperationContext } from '../../../src/main/services/harness/guardrails/types'

const guard = new SecretLeakGuard()

/** Helper to create a default operation context */
function ctx(overrides?: Partial<OperationContext>): OperationContext {
  return {
    source: 'user',
    userId: 'user-1',
    userRole: 'editor',
    workspaceRoot: '/workspace',
    ...overrides,
  }
}

describe('SecretLeakGuard', () => {
  it('should have correct id and description', () => {
    expect(guard.id).toBe('secret-leak')
    expect(guard.description).toBeTruthy()
  })

  // ─── Block cases ───

  it('should block content containing OpenAI API key', async () => {
    const fakeKey = 'sk-' + 'a'.repeat(48)
    const op: FileOperation = {
      type: 'write',
      path: 'config.md',
      content: `API Key: ${fakeKey}`,
    }
    const verdict = await guard.check(op, ctx())
    expect(verdict.allow).toBe(false)
    if (verdict.allow === false) {
      expect(verdict.ruleId).toBe('secret-leak')
      expect(verdict.reason).toContain('OpenAI API Key')
    }
  })

  it('should block content containing GitHub PAT', async () => {
    const fakePat = 'ghp_' + 'A'.repeat(36)
    const op: FileOperation = {
      type: 'write',
      path: 'notes.md',
      content: `Token: ${fakePat}`,
    }
    const verdict = await guard.check(op, ctx())
    expect(verdict.allow).toBe(false)
    if (verdict.allow === false) {
      expect(verdict.reason).toContain('GitHub Personal Access Token')
    }
  })

  it('should block content containing AWS Access Key ID', async () => {
    const fakeAws = 'AKIA' + 'ABCDEFGHIJKLMNOP'
    const op: FileOperation = {
      type: 'write',
      path: 'deploy.md',
      content: `AWS Key: ${fakeAws}`,
    }
    const verdict = await guard.check(op, ctx())
    expect(verdict.allow).toBe(false)
    if (verdict.allow === false) {
      expect(verdict.reason).toContain('AWS Access Key ID')
    }
  })

  it('should block content containing private key header', async () => {
    const op: FileOperation = {
      type: 'write',
      path: 'key.pem',
      content: '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAK...',
    }
    const verdict = await guard.check(op, ctx())
    expect(verdict.allow).toBe(false)
    if (verdict.allow === false) {
      expect(verdict.reason).toContain('Private Key Header')
    }
  })

  it('should block content containing JWT token', async () => {
    // Generate a realistic-looking JWT (header.payload.signature)
    const header = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
    const payload = 'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4iLCJpYXQiOjE1MTYyMzkwMjJ9'
    const signature = 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
    const jwt = `${header}.${payload}.${signature}`
    const op: FileOperation = {
      type: 'write',
      path: 'auth.md',
      content: `Bearer ${jwt}`,
    }
    const verdict = await guard.check(op, ctx())
    expect(verdict.allow).toBe(false)
    if (verdict.allow === false) {
      expect(verdict.reason).toContain('JWT Token')
    }
  })

  it('should block content containing Anthropic API key', async () => {
    const fakeKey = 'sk-ant-' + 'a'.repeat(100)
    const op: FileOperation = {
      type: 'write',
      path: 'config.md',
      content: `Key: ${fakeKey}`,
    }
    const verdict = await guard.check(op, ctx())
    expect(verdict.allow).toBe(false)
    if (verdict.allow === false) {
      expect(verdict.reason).toContain('Anthropic API Key')
    }
  })

  it('should block even for AI source (all sources checked)', async () => {
    const fakeKey = 'sk-' + 'X'.repeat(48)
    const op: FileOperation = {
      type: 'write',
      path: 'output.md',
      content: `Generated: ${fakeKey}`,
    }
    const verdict = await guard.check(op, ctx({ source: 'ai' }))
    expect(verdict.allow).toBe(false)
  })

  // ─── Allow cases ───

  it('should allow normal markdown content', async () => {
    const op: FileOperation = {
      type: 'write',
      path: 'docs/readme.md',
      content: '# Hello World\n\nThis is a normal document with no secrets.',
    }
    const verdict = await guard.check(op, ctx())
    expect(verdict.allow).toBe(true)
  })

  it('should allow delete operation (no content to check)', async () => {
    const op: FileOperation = { type: 'delete', path: 'secret-file.md' }
    const verdict = await guard.check(op, ctx())
    expect(verdict.allow).toBe(true)
  })

  it('should allow read operation', async () => {
    const op: FileOperation = { type: 'read', path: 'config.md' }
    const verdict = await guard.check(op, ctx())
    expect(verdict.allow).toBe(true)
  })

  it('should allow write operation without content', async () => {
    const op: FileOperation = { type: 'write', path: 'empty.md' }
    const verdict = await guard.check(op, ctx())
    expect(verdict.allow).toBe(true)
  })

  it('should allow content with short sk- prefix (not a real key)', async () => {
    const op: FileOperation = {
      type: 'write',
      path: 'notes.md',
      content: 'The variable sk-test is just a label, not a real key.',
    }
    const verdict = await guard.check(op, ctx())
    expect(verdict.allow).toBe(true)
  })

  // ─── EC and OPENSSH private keys ───

  it('should block EC private key header', async () => {
    const op: FileOperation = {
      type: 'write',
      path: 'key.pem',
      content: '-----BEGIN EC PRIVATE KEY-----\nMHQCAQEE...',
    }
    const verdict = await guard.check(op, ctx())
    expect(verdict.allow).toBe(false)
  })

  it('should block OPENSSH private key header', async () => {
    const op: FileOperation = {
      type: 'write',
      path: 'id_ed25519',
      content: '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1...',
    }
    const verdict = await guard.check(op, ctx())
    expect(verdict.allow).toBe(false)
  })
})
