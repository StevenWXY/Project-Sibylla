/**
 * Encryption utilities for MEMORY.md sync
 *
 * Provides AES-256-GCM encryption/decryption with scrypt key derivation.
 * Key is derived from user password + workspaceId salt, ensuring per-workspace uniqueness.
 * Key is never persisted — only held in memory during the application session.
 *
 * Ciphertext format (base64): iv_hex:cipher_hex:authTag_hex
 *
 * @see plans/phase2/phase2-task005-sync-enhancement-citation-tracing-plan.md §Phase B
 */

import crypto from 'crypto'
import { logger } from '../../utils/logger'

const LOG_PREFIX = '[Encryption]'
const KEY_LENGTH = 32
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const SCRYPT_COST = 16384
const SCRYPT_BLOCK_SIZE = 8
const SCRYPT_PARALLELIZATION = 1

export class DecryptionError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'DecryptionError'
  }
}

export function deriveKeyFromPassword(password: string, salt: string): Buffer {
  if (!password || password.length === 0) {
    throw new Error('Password must not be empty')
  }
  if (!salt || salt.length === 0) {
    throw new Error('Salt must not be empty')
  }

  return crypto.scryptSync(
    password,
    salt,
    KEY_LENGTH,
    { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELIZATION },
  )
}

export function encrypt(plaintext: string, key: Buffer): string {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Invalid key length: expected ${KEY_LENGTH} bytes, got ${key.length}`)
  }

  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  const payload = `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`

  return Buffer.from(payload, 'utf-8').toString('base64')
}

export function decrypt(ciphertext: string, key: Buffer): string {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Invalid key length: expected ${KEY_LENGTH} bytes, got ${key.length}`)
  }

  let decoded: string
  try {
    decoded = Buffer.from(ciphertext, 'base64').toString('utf-8')
  } catch {
    throw new DecryptionError('Failed to base64-decode ciphertext')
  }

  const parts = decoded.split(':')
  if (parts.length !== 3) {
    throw new DecryptionError(
      `Invalid ciphertext format: expected 3 colon-separated parts, got ${parts.length}`,
    )
  }

  const [ivHex, cipherHex, authTagHex] = parts as [string, string, string]

  let iv: Buffer
  let encrypted: Buffer
  let authTag: Buffer

  try {
    iv = Buffer.from(ivHex, 'hex')
  } catch {
    throw new DecryptionError('Failed to decode IV from hex')
  }

  try {
    encrypted = Buffer.from(cipherHex, 'hex')
  } catch {
    throw new DecryptionError('Failed to decode cipher from hex')
  }

  try {
    authTag = Buffer.from(authTagHex, 'hex')
  } catch {
    throw new DecryptionError('Failed to decode authTag from hex')
  }

  if (iv.length !== IV_LENGTH) {
    throw new DecryptionError(
      `Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}`,
    )
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new DecryptionError(
      `Invalid authTag length: expected ${AUTH_TAG_LENGTH} bytes, got ${authTag.length}`,
    )
  }

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ])

    logger.debug(`${LOG_PREFIX} Decryption successful`)
    return decrypted.toString('utf-8')
  } catch (error: unknown) {
    throw new DecryptionError(
      'Decryption failed — wrong key or corrupted data',
      error,
    )
  }
}
