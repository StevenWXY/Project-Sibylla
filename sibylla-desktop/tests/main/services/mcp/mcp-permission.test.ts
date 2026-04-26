import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MCPPermission } from '../../../../src/main/services/mcp/mcp-permission'
import type { MCPPermissionLevel } from '../../../../src/main/services/mcp/types'

vi.mock('fs', () => ({
  ...vi.importActual('fs'),
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    promises: {
      readFile: vi.fn().mockResolvedValue('[]'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
    },
  },
  existsSync: vi.fn().mockReturnValue(false),
  promises: {
    readFile: vi.fn().mockResolvedValue('[]'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}))
vi.mock('path', () => ({
  ...vi.importActual('path'),
  dirname: vi.fn().mockReturnValue('/tmp/test'),
}))
vi.mock('../../../../src/main/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

describe('MCPPermission', () => {
  let permission: MCPPermission

  beforeEach(() => {
    vi.clearAllMocks()
    permission = new MCPPermission('/tmp/test/permissions.json', [], 'test-session-1')
  })

  describe('checkPermission', () => {
    it('should return null when no permission exists', () => {
      expect(permission.checkPermission('server', 'tool')).toBeNull()
    })

    it('should return permanent permission level', () => {
      permission.grantPermission('server', 'safe_tool', 'permanent')
      expect(permission.checkPermission('server', 'safe_tool')).toBe('permanent')
    })

    it('should return session permission within same session', () => {
      permission.grantPermission('server', 'tool', 'session')
      expect(permission.checkPermission('server', 'tool')).toBe('session')
    })

    it('should return deny level', () => {
      permission.grantPermission('server', 'tool', 'deny')
      expect(permission.checkPermission('server', 'tool')).toBe('deny')
    })

    it('should consume once permission after check', () => {
      permission.grantPermission('server', 'tool', 'once')
      expect(permission.checkPermission('server', 'tool')).toBeNull()
    })
  })

  describe('session cleanup', () => {
    it('should invalidate session permissions from another session', () => {
      permission.grantPermission('server', 'tool', 'session')
      const newPermission = new MCPPermission('/tmp/test/permissions.json', [], 'test-session-2')
      newPermission['permissions'] = permission['permissions']
      expect(newPermission.checkPermission('server', 'tool')).toBeNull()
    })

    it('should keep session permissions from current session', () => {
      permission.grantPermission('server', 'tool', 'session')
      expect(permission.checkPermission('server', 'tool')).toBe('session')
    })
  })

  describe('isSensitiveTool', () => {
    it('should detect delete_ as sensitive', () => {
      expect(permission.isSensitiveTool('server', 'delete_file')).toBe(true)
    })

    it('should detect write_ as sensitive', () => {
      expect(permission.isSensitiveTool('server', 'write_config')).toBe(true)
    })

    it('should detect transfer_ as sensitive', () => {
      expect(permission.isSensitiveTool('server', 'transfer_money')).toBe(true)
    })

    it('should detect create_ as sensitive', () => {
      expect(permission.isSensitiveTool('server', 'create_user')).toBe(true)
    })

    it('should not flag safe tools', () => {
      expect(permission.isSensitiveTool('server', 'search')).toBe(false)
      expect(permission.isSensitiveTool('server', 'read_file')).toBe(false)
      expect(permission.isSensitiveTool('server', 'list_items')).toBe(false)
    })

    it('should respect custom sensitive patterns', () => {
      const customPermission = new MCPPermission('/tmp/test/p.json', ['^admin_'], 'session-1')
      expect(customPermission.isSensitiveTool('server', 'admin_reset')).toBe(true)
      expect(customPermission.isSensitiveTool('server', 'search')).toBe(false)
    })

    it('should do case-insensitive matching', () => {
      expect(permission.isSensitiveTool('server', 'DELETE_ALL')).toBe(true)
      expect(permission.isSensitiveTool('server', 'Write_File')).toBe(true)
    })
  })

  describe('grantPermission', () => {
    it('should throw when permanently allowing sensitive tool', () => {
      expect(() => permission.grantPermission('server', 'delete_all', 'permanent')).toThrow(
        'Cannot permanently allow sensitive tool'
      )
    })

    it('should allow session-level for sensitive tool', () => {
      expect(() => permission.grantPermission('server', 'delete_all', 'session')).not.toThrow()
    })

    it('should allow once-level for sensitive tool', () => {
      expect(() => permission.grantPermission('server', 'delete_all', 'once')).not.toThrow()
    })

    it('should allow permanent for non-sensitive tool', () => {
      expect(() => permission.grantPermission('server', 'search', 'permanent')).not.toThrow()
    })
  })

  describe('revokePermission', () => {
    it('should remove permission after revoke', () => {
      permission.grantPermission('server', 'search', 'permanent')
      expect(permission.checkPermission('server', 'search')).toBe('permanent')
      permission.revokePermission('server', 'search')
      expect(permission.checkPermission('server', 'search')).toBeNull()
    })
  })

  describe('revokeAll', () => {
    it('should revoke all permissions for a server', () => {
      permission.grantPermission('server', 'tool_a', 'permanent')
      permission.grantPermission('server', 'tool_b', 'session')
      permission.grantPermission('other', 'tool_c', 'permanent')
      permission.revokeAll('server')
      expect(permission.checkPermission('server', 'tool_a')).toBeNull()
      expect(permission.checkPermission('server', 'tool_b')).toBeNull()
      expect(permission.checkPermission('other', 'tool_c')).toBe('permanent')
    })
  })

  describe('cleanup', () => {
    it('should remove stale session permissions', async () => {
      permission.grantPermission('server', 'tool', 'session')
      const stalePermission = new MCPPermission('/tmp/test/p.json', [], 'other-session')
      stalePermission['permissions'] = permission['permissions']
      await stalePermission.cleanup()
      expect(stalePermission.checkPermission('server', 'tool')).toBeNull()
    })

    it('should keep current session permissions', async () => {
      permission.grantPermission('server', 'tool', 'session')
      await permission.cleanup()
      expect(permission.checkPermission('server', 'tool')).toBe('session')
    })
  })
})
