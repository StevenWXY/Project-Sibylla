/**
 * Token Storage - Secure token persistence using Electron safeStorage
 *
 * Stores authentication tokens (access token, refresh token) encrypted
 * on disk using Electron's safeStorage API, which leverages the OS keychain
 * (macOS Keychain, Windows DPAPI, Linux libsecret).
 *
 * Security design:
 * - Tokens are encrypted before writing to disk
 * - safeStorage uses OS-level key management (not user-space encryption)
 * - Refresh tokens are stored encrypted; access tokens are stored in memory
 * - On safeStorage unavailable (e.g. headless CI), falls back to in-memory only
 *
 * File locations:
 * - ${app.getPath('userData')}/auth-tokens.enc (encrypted)
 */

import { safeStorage, app } from 'electron'
import { promises as fs } from 'fs'
import * as path from 'path'
import { logger } from '../utils/logger'

/** Log prefix for all TokenStorage operations */
const LOG_PREFIX = '[TokenStorage]'

/** File name for persisted encrypted tokens */
const TOKEN_FILE_NAME = 'auth-tokens.enc'

/**
 * Serialized token data structure (before encryption)
 */
interface TokenData {
  accessToken: string
  refreshToken: string
  expiresAt: number // Unix timestamp (ms) when accessToken expires
}

/**
 * TokenStorage — encrypted token persistence via Electron safeStorage
 */
export class TokenStorage {
  private tokenFilePath: string
  private memoryCache: TokenData | null = null

  constructor() {
    this.tokenFilePath = path.join(app.getPath('userData'), TOKEN_FILE_NAME)
    logger.info(`${LOG_PREFIX} Initialized`, { path: this.tokenFilePath })
  }

  /**
   * Check if safeStorage encryption is available
   */
  isEncryptionAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  /**
   * Save tokens (encrypted to disk + in-memory cache)
   *
   * @param accessToken - JWT access token
   * @param refreshToken - Refresh token for rotation
   * @param expiresIn - Token lifetime in seconds
   */
  async saveTokens(
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
  ): Promise<void> {
    const expiresAt = Date.now() + expiresIn * 1000

    const tokenData: TokenData = {
      accessToken,
      refreshToken,
      expiresAt,
    }

    // Always update in-memory cache
    this.memoryCache = tokenData

    // Persist to disk if encryption is available
    if (this.isEncryptionAvailable()) {
      try {
        const plainText = JSON.stringify(tokenData)
        const encrypted = safeStorage.encryptString(plainText)

        // Atomic write: write to temp file then rename
        const tempPath = `${this.tokenFilePath}.tmp`
        await fs.writeFile(tempPath, encrypted)
        await fs.rename(tempPath, this.tokenFilePath)

        logger.info(`${LOG_PREFIX} Tokens saved to disk (encrypted)`)
      } catch (error) {
        logger.error(`${LOG_PREFIX} Failed to persist tokens to disk`, {
          error: error instanceof Error ? error.message : String(error),
        })
        // Non-fatal: tokens are still in memory
      }
    } else {
      logger.warn(
        `${LOG_PREFIX} safeStorage not available, tokens stored in memory only`,
      )
    }
  }

  /**
   * Load tokens (from memory cache, or from encrypted disk file)
   *
   * @returns Token data, or null if no tokens are stored
   */
  async loadTokens(): Promise<TokenData | null> {
    // Return from memory cache if available
    if (this.memoryCache) {
      return this.memoryCache
    }

    // Try to load from disk
    if (!this.isEncryptionAvailable()) {
      logger.debug(`${LOG_PREFIX} safeStorage not available, no tokens on disk`)
      return null
    }

    try {
      const encrypted = await fs.readFile(this.tokenFilePath)
      const plainText = safeStorage.decryptString(Buffer.from(encrypted))
      const tokenData = JSON.parse(plainText) as TokenData

      // Validate structure
      if (!tokenData.accessToken || !tokenData.refreshToken || !tokenData.expiresAt) {
        logger.warn(`${LOG_PREFIX} Invalid token data structure on disk, clearing`)
        await this.clearTokens()
        return null
      }

      this.memoryCache = tokenData
      logger.info(`${LOG_PREFIX} Tokens loaded from disk`)
      return tokenData
    } catch (error) {
      const isNotFound =
        error instanceof Error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'

      if (isNotFound) {
        logger.debug(`${LOG_PREFIX} No token file found (first launch)`)
      } else {
        logger.warn(`${LOG_PREFIX} Failed to load tokens from disk`, {
          error: error instanceof Error ? error.message : String(error),
        })
      }
      return null
    }
  }

  /**
   * Get the current access token (from memory cache)
   *
   * @returns Access token, or null if not available or expired
   */
  getAccessToken(): string | null {
    if (!this.memoryCache) {
      return null
    }

    // Check if access token has expired (with 30s buffer)
    if (Date.now() >= this.memoryCache.expiresAt - 30000) {
      logger.debug(`${LOG_PREFIX} Access token expired`)
      return null
    }

    return this.memoryCache.accessToken
  }

  /**
   * Get the current refresh token (from memory cache)
   *
   * @returns Refresh token, or null if not available
   */
  getRefreshToken(): string | null {
    return this.memoryCache?.refreshToken ?? null
  }

  /**
   * Clear all stored tokens (memory + disk)
   */
  async clearTokens(): Promise<void> {
    this.memoryCache = null

    try {
      await fs.unlink(this.tokenFilePath)
      logger.info(`${LOG_PREFIX} Token file deleted`)
    } catch (error) {
      const isNotFound =
        error instanceof Error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'

      if (!isNotFound) {
        logger.warn(`${LOG_PREFIX} Failed to delete token file`, {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  /**
   * Check if tokens are available and not expired
   */
  hasValidTokens(): boolean {
    if (!this.memoryCache) {
      return false
    }
    // Access token not expired (with 30s buffer)
    return Date.now() < this.memoryCache.expiresAt - 30000
  }
}
