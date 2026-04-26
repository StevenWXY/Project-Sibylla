import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MCPAuditLog } from '../../../../src/main/services/mcp/mcp-audit'
import type { MCPAuditEntry } from '../../../../src/main/services/mcp/types'
import * as fs from 'fs'

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
      appendFile: vi.fn().mockResolvedValue(undefined),
    },
  },
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    appendFile: vi.fn().mockResolvedValue(undefined),
  },
}))

describe('MCPAuditLog', () => {
  let auditLog: MCPAuditLog

  beforeEach(() => {
    vi.clearAllMocks()
    auditLog = new MCPAuditLog('/tmp/.sibylla/mcp/audit-log.jsonl', true)
  })

  describe('record', () => {
    it('should append entry when enabled', async () => {
      const entry: MCPAuditEntry = {
        timestamp: Date.now(),
        serverName: 'github',
        toolName: 'list_issues',
        args: '{"repo": "test"}',
        result: 'success',
        durationMs: 150,
        userDecision: 'confirmed',
      }
      await auditLog.record(entry)
      expect(fs.promises.appendFile).toHaveBeenCalled()
    })

    it('should skip when disabled', async () => {
      auditLog.setEnabled(false)
      const entry: MCPAuditEntry = {
        timestamp: Date.now(),
        serverName: 'github',
        toolName: 'list_issues',
        args: '{}',
        result: 'success',
        durationMs: 100,
        userDecision: 'auto',
      }
      await auditLog.record(entry)
      expect(fs.promises.appendFile).not.toHaveBeenCalled()
    })
  })

  describe('sanitizeArgs', () => {
    it('should mask token fields', () => {
      const result = auditLog.sanitizeArgs({
        token: 'secret-value',
        normal_field: 'visible',
      })
      expect(result).toContain('"token":"***"')
      expect(result).toContain('"normal_field":"visible"')
    })

    it('should mask password fields', () => {
      const result = auditLog.sanitizeArgs({ password: 'pass123' })
      expect(result).toContain('"password":"***"')
    })

    it('should mask key fields', () => {
      const result = auditLog.sanitizeArgs({ api_key: 'key123' })
      expect(result).toContain('"api_key":"***"')
    })

    it('should mask secret fields', () => {
      const result = auditLog.sanitizeArgs({ client_secret: 'sec123' })
      expect(result).toContain('"client_secret":"***"')
    })

    it('should mask credential fields', () => {
      const result = auditLog.sanitizeArgs({ credential: 'cred123' })
      expect(result).toContain('"credential":"***"')
    })
  })

  describe('sanitizeArgsJson', () => {
    it('should parse JSON and sanitize', () => {
      const result = auditLog.sanitizeArgsJson('{"token":"secret","repo":"test"}')
      expect(result).toContain('"token":"***"')
      expect(result).toContain('"repo":"test"')
    })

    it('should return [] for invalid JSON', () => {
      const result = auditLog.sanitizeArgsJson('not json')
      expect(result).toBe('[]')
    })
  })

  describe('setEnabled', () => {
    it('should toggle audit logging', async () => {
      auditLog.setEnabled(false)
      const entry: MCPAuditEntry = {
        timestamp: Date.now(),
        serverName: 's',
        toolName: 't',
        args: '{}',
        result: 'success',
        durationMs: 10,
        userDecision: 'auto',
      }
      await auditLog.record(entry)
      expect(fs.promises.appendFile).not.toHaveBeenCalled()

      auditLog.setEnabled(true)
      await auditLog.record(entry)
      expect(fs.promises.appendFile).toHaveBeenCalled()
    })
  })
})
