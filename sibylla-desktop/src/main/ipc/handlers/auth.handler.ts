/**
 * Auth Handler - IPC handler for authentication operations
 *
 * Bridges the renderer process authentication UI to the cloud authentication API
 * via the AuthClient and TokenStorage services.
 *
 * IPC Channels:
 * - auth:login      — Login with email/password
 * - auth:register   — Register new account
 * - auth:logout     — Logout and clear tokens
 * - auth:get-current-user — Get currently authenticated user (from stored tokens)
 * - auth:refresh-token    — Refresh the access token
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { IpcHandler } from '../handler'
import { AuthClient } from '../../services/auth-client'
import { TokenStorage } from '../../services/token-storage'
import { IPC_CHANNELS } from '../../../shared/types'
import { logger } from '../../utils/logger'
import type {
  AuthLoginInput,
  AuthRegisterInput,
  AuthSession,
  AuthUser,
} from '../../../shared/types'

/** Log prefix for AuthHandler */
const LOG_PREFIX = '[AuthHandler]'

/**
 * AuthHandler class
 *
 * Handles all authentication-related IPC communications between
 * the main and renderer processes.
 */
export class AuthHandler extends IpcHandler {
  readonly namespace = 'auth'
  private readonly authClient: AuthClient
  private readonly tokenStorage: TokenStorage

  /** Cached user info to avoid redundant /me calls */
  private cachedUser: AuthUser | null = null

  constructor(authClient: AuthClient, tokenStorage: TokenStorage) {
    super()
    this.authClient = authClient
    this.tokenStorage = tokenStorage
  }

  /**
   * Register all auth IPC handlers
   */
  register(): void {
    ipcMain.handle(
      IPC_CHANNELS.AUTH_LOGIN,
      this.safeHandle(this.login.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.AUTH_REGISTER,
      this.safeHandle(this.registerUser.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.AUTH_LOGOUT,
      this.safeHandle(this.logout.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.AUTH_GET_CURRENT_USER,
      this.safeHandle(this.getCurrentUser.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.AUTH_REFRESH_TOKEN,
      this.safeHandle(this.refreshToken.bind(this)),
    )

    logger.info(`${LOG_PREFIX} All handlers registered`)
  }

  /**
   * Get the cached user info (for use by other main process services)
   */
  getCachedUser(): AuthUser | null {
    return this.cachedUser
  }

  // ─── IPC Handler Methods ──────────────────────────────────────────────

  /**
   * Login with email and password
   */
  private async login(
    _event: IpcMainInvokeEvent,
    input: AuthLoginInput,
  ): Promise<AuthSession> {
    logger.info(`${LOG_PREFIX} Login request`, { email: input.email })

    const result = await this.authClient.login(input)

    // Store tokens securely
    await this.tokenStorage.saveTokens(
      result.tokens.accessToken,
      result.tokens.refreshToken,
      result.tokens.expiresIn,
    )

    // Cache user info
    this.cachedUser = result.user

    logger.info(`${LOG_PREFIX} Login successful`, {
      userId: result.user.id,
    })

    return {
      isAuthenticated: true,
      user: result.user,
    }
  }

  /**
   * Register a new account
   */
  private async registerUser(
    _event: IpcMainInvokeEvent,
    input: AuthRegisterInput,
  ): Promise<AuthSession> {
    logger.info(`${LOG_PREFIX} Register request`, { email: input.email })

    const result = await this.authClient.register(input)

    // Store tokens securely (auto-login after registration)
    await this.tokenStorage.saveTokens(
      result.tokens.accessToken,
      result.tokens.refreshToken,
      result.tokens.expiresIn,
    )

    // Cache user info
    this.cachedUser = result.user

    logger.info(`${LOG_PREFIX} Registration successful`, {
      userId: result.user.id,
    })

    return {
      isAuthenticated: true,
      user: result.user,
    }
  }

  /**
   * Logout and clear stored tokens
   */
  private async logout(_event: IpcMainInvokeEvent): Promise<void> {
    logger.info(`${LOG_PREFIX} Logout request`)

    const refreshToken = this.tokenStorage.getRefreshToken()

    // Revoke token on server (best-effort)
    if (refreshToken) {
      await this.authClient.logout(refreshToken)
    }

    // Clear local tokens and cache
    await this.tokenStorage.clearTokens()
    this.cachedUser = null

    logger.info(`${LOG_PREFIX} Logout successful`)
  }

  /**
   * Get the currently authenticated user
   *
   * Attempts to restore session from stored tokens:
   * 1. Check memory cache
   * 2. Load tokens from disk
   * 3. If access token is valid, fetch user info
   * 4. If access token expired, try refresh
   */
  private async getCurrentUser(
    _event: IpcMainInvokeEvent,
  ): Promise<AuthSession> {
    // Fast path: return cached user if tokens are valid
    if (this.cachedUser && this.tokenStorage.hasValidTokens()) {
      return {
        isAuthenticated: true,
        user: this.cachedUser,
      }
    }

    // Try loading tokens from disk
    const tokenData = await this.tokenStorage.loadTokens()
    if (!tokenData) {
      return { isAuthenticated: false, user: null }
    }

    // Try using the access token to get user info
    const accessToken = this.tokenStorage.getAccessToken()
    if (accessToken) {
      try {
        const user = await this.authClient.getMe(accessToken)
        this.cachedUser = user
        return { isAuthenticated: true, user }
      } catch (error) {
        logger.warn(`${LOG_PREFIX} getMe failed, attempting token refresh`, {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // Access token expired — try refresh
    const refreshToken = this.tokenStorage.getRefreshToken()
    if (refreshToken) {
      try {
        const newTokens = await this.authClient.refreshToken(refreshToken)
        await this.tokenStorage.saveTokens(
          newTokens.accessToken,
          newTokens.refreshToken,
          newTokens.expiresIn,
        )

        const user = await this.authClient.getMe(newTokens.accessToken)
        this.cachedUser = user
        return { isAuthenticated: true, user }
      } catch (error) {
        logger.warn(`${LOG_PREFIX} Token refresh failed, clearing session`, {
          error: error instanceof Error ? error.message : String(error),
        })
        await this.tokenStorage.clearTokens()
        this.cachedUser = null
      }
    }

    return { isAuthenticated: false, user: null }
  }

  /**
   * Refresh the access token
   */
  private async refreshToken(
    _event: IpcMainInvokeEvent,
  ): Promise<AuthSession> {
    const refreshToken = this.tokenStorage.getRefreshToken()
    if (!refreshToken) {
      logger.warn(`${LOG_PREFIX} No refresh token available`)
      return { isAuthenticated: false, user: null }
    }

    try {
      const newTokens = await this.authClient.refreshToken(refreshToken)
      await this.tokenStorage.saveTokens(
        newTokens.accessToken,
        newTokens.refreshToken,
        newTokens.expiresIn,
      )

      // Refresh user info if not cached
      if (!this.cachedUser) {
        const user = await this.authClient.getMe(newTokens.accessToken)
        this.cachedUser = user
      }

      return {
        isAuthenticated: true,
        user: this.cachedUser,
      }
    } catch (error) {
      logger.error(`${LOG_PREFIX} Token refresh failed`, {
        error: error instanceof Error ? error.message : String(error),
      })
      await this.tokenStorage.clearTokens()
      this.cachedUser = null
      return { isAuthenticated: false, user: null }
    }
  }

  /**
   * Cleanup — remove all registered IPC handlers
   */
  override cleanup(): void {
    ipcMain.removeHandler(IPC_CHANNELS.AUTH_LOGIN)
    ipcMain.removeHandler(IPC_CHANNELS.AUTH_REGISTER)
    ipcMain.removeHandler(IPC_CHANNELS.AUTH_LOGOUT)
    ipcMain.removeHandler(IPC_CHANNELS.AUTH_GET_CURRENT_USER)
    ipcMain.removeHandler(IPC_CHANNELS.AUTH_REFRESH_TOKEN)
    this.cachedUser = null
    super.cleanup()
  }
}
