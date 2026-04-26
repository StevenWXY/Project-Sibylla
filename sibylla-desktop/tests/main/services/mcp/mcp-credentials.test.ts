import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MCPCredentials } from '../../../../src/main/services/mcp/mcp-credentials'
import * as fs from 'fs'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(true),
    encryptString: vi.fn().mockReturnValue(Buffer.from('encrypted')),
    decryptString: vi.fn().mockReturnValue('decrypted'),
  },
}))

vi.mock('fs', () => ({
  ...vi.importActual('fs'),
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    promises: {
      readFile: vi.fn().mockResolvedValue('{}'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
    },
  },
  existsSync: vi.fn().mockReturnValue(false),
  promises: {
    readFile: vi.fn().mockResolvedValue('{}'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}))

describe('MCPCredentials', () => {
  let credentials: MCPCredentials

  beforeEach(() => {
    credentials = new MCPCredentials('/tmp/workspace', 'test-encryption-key')
  })

  describe('saveCredential / getCredential', () => {
    it('should save and retrieve a credential', async () => {
      await credentials.saveCredential('github', 'PAT', 'ghp_abc123')
      const value = await credentials.getCredential('github', 'PAT')
      expect(value).toBe('ghp_abc123')
    })

    it('should return null for non-existent credential', async () => {
      const value = await credentials.getCredential('unknown', 'KEY')
      expect(value).toBeNull()
    })
  })

  describe('deleteCredential', () => {
    it('should delete a credential', async () => {
      await credentials.saveCredential('github', 'PAT', 'ghp_abc123')
      await credentials.deleteCredential('github', 'PAT')
      const value = await credentials.getCredential('github', 'PAT')
      expect(value).toBeNull()
    })
  })

  describe('deleteAllCredentials', () => {
    it('should delete all credentials for a server', async () => {
      await credentials.saveCredential('github', 'PAT', 'val1')
      await credentials.saveCredential('github', 'SECRET', 'val2')
      await credentials.saveCredential('gitlab', 'TOKEN', 'val3')
      await credentials.deleteAllCredentials('github')
      expect(await credentials.getCredential('github', 'PAT')).toBeNull()
      expect(await credentials.getCredential('github', 'SECRET')).toBeNull()
      expect(await credentials.getCredential('gitlab', 'TOKEN')).toBe('val3')
    })
  })

  describe('replacePlaceholders', () => {
    it('should replace {{KEY}} placeholders with stored credentials', async () => {
      await credentials.saveCredential('github', 'GITHUB_PAT', 'ghp_real_value')
      const result = await credentials.replacePlaceholders(
        { TOKEN: '{{GITHUB_PAT}}', OTHER: 'static-value' },
        'github',
      )
      expect(result.TOKEN).toBe('ghp_real_value')
      expect(result.OTHER).toBe('static-value')
    })

    it('should keep placeholder when credential not found', async () => {
      const result = await credentials.replacePlaceholders(
        { TOKEN: '{{MISSING_KEY}}' },
        'server',
      )
      expect(result.TOKEN).toBe('{{MISSING_KEY}}')
    })
  })
})
