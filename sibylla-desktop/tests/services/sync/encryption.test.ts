import { describe, it, expect } from 'vitest'
import { deriveKeyFromPassword, encrypt, decrypt, DecryptionError } from '../../../src/main/services/sync/encryption'

describe('encryption', () => {
  const password = 'test-password-123'
  const salt = 'workspace-abc'

  describe('deriveKeyFromPassword', () => {
    it('should derive a 32-byte key', () => {
      const key = deriveKeyFromPassword(password, salt)
      expect(key).toBeInstanceOf(Buffer)
      expect(key.length).toBe(32)
    })

    it('should throw on empty password', () => {
      expect(() => deriveKeyFromPassword('', salt)).toThrow('Password must not be empty')
    })

    it('should throw on empty salt', () => {
      expect(() => deriveKeyFromPassword(password, '')).toThrow('Salt must not be empty')
    })

    it('should produce different keys for different salts', () => {
      const key1 = deriveKeyFromPassword(password, 'salt-1')
      const key2 = deriveKeyFromPassword(password, 'salt-2')
      expect(key1.equals(key2)).toBe(false)
    })

    it('should produce the same key for same inputs', () => {
      const key1 = deriveKeyFromPassword(password, salt)
      const key2 = deriveKeyFromPassword(password, salt)
      expect(key1.equals(key2)).toBe(true)
    })
  })

  describe('encrypt/decrypt roundtrip', () => {
    it('should encrypt and decrypt text correctly', () => {
      const key = deriveKeyFromPassword(password, salt)
      const plaintext = 'Hello, World! This is a test message.'
      const ciphertext = encrypt(plaintext, key)
      const decrypted = decrypt(ciphertext, key)
      expect(decrypted).toBe(plaintext)
    })

    it('should handle empty plaintext', () => {
      const key = deriveKeyFromPassword(password, salt)
      const plaintext = ''
      const ciphertext = encrypt(plaintext, key)
      const decrypted = decrypt(ciphertext, key)
      expect(decrypted).toBe(plaintext)
    })

    it('should handle large text (>10KB)', () => {
      const key = deriveKeyFromPassword(password, salt)
      const plaintext = 'A'.repeat(15_000)
      const ciphertext = encrypt(plaintext, key)
      const decrypted = decrypt(ciphertext, key)
      expect(decrypted).toBe(plaintext)
    })

    it('should handle unicode content', () => {
      const key = deriveKeyFromPassword(password, salt)
      const plaintext = '中文测试 🎉 日本語テスト 한국어'
      const ciphertext = encrypt(plaintext, key)
      const decrypted = decrypt(ciphertext, key)
      expect(decrypted).toBe(plaintext)
    })
  })

  describe('decrypt error handling', () => {
    it('should throw DecryptionError on wrong key', () => {
      const key1 = deriveKeyFromPassword(password, salt)
      const key2 = deriveKeyFromPassword('wrong-password', salt)
      const ciphertext = encrypt('secret data', key1)

      expect(() => decrypt(ciphertext, key2)).toThrow(DecryptionError)
      expect(() => decrypt(ciphertext, key2)).toThrow('Decryption failed')
    })

    it('should throw DecryptionError on corrupted data', () => {
      const key = deriveKeyFromPassword(password, salt)
      const corrupted = Buffer.from('invalid:data:here').toString('base64')

      expect(() => decrypt(corrupted, key)).toThrow()
    })

    it('should throw DecryptionError on invalid base64', () => {
      const key = deriveKeyFromPassword(password, salt)
      expect(() => decrypt('not-valid-base64!!!', key)).toThrow()
    })

    it('should throw on invalid key length', () => {
      const badKey = Buffer.alloc(16)
      expect(() => encrypt('test', badKey)).toThrow('Invalid key length')
      expect(() => decrypt('dGVzdA==', badKey)).toThrow('Invalid key length')
    })
  })
})
