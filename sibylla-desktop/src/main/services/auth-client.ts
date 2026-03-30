/**
 * Auth Client - HTTP client for Sibylla Cloud authentication API
 *
 * Provides type-safe HTTP communication with the cloud authentication endpoints.
 * Uses native fetch() for HTTP requests (no external dependencies).
 *
 * Endpoints consumed:
 * - POST /api/v1/auth/register
 * - POST /api/v1/auth/login
 * - POST /api/v1/auth/refresh
 * - POST /api/v1/auth/logout
 * - GET  /api/v1/auth/me
 */

import { logger } from '../utils/logger'
import type {
  AuthLoginInput,
  AuthRegisterInput,
  AuthTokens,
  AuthUser,
} from '../../shared/types'

/** Log prefix for all AuthClient operations */
const LOG_PREFIX = '[AuthClient]'

/** Default cloud API base URL (development) */
const DEFAULT_API_BASE_URL = 'http://localhost:3000'

/**
 * Error thrown by AuthClient for API errors
 */
export class AuthClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message)
    this.name = 'AuthClientError'
  }
}

/**
 * Login response from the cloud API
 */
interface LoginApiResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: {
    id: string
    email: string
    name: string
  }
}

/**
 * Register response from the cloud API
 */
interface RegisterApiResponse {
  user: {
    id: string
    email: string
    name: string
  }
  accessToken: string
  refreshToken: string
  expiresIn: number
}

/**
 * User info response from GET /me
 */
interface MeApiResponse {
  id: string
  email: string
  name: string
  avatarUrl?: string
  emailVerified?: boolean
  createdAt?: string
}

/**
 * AuthClient — HTTP client for Sibylla Cloud authentication
 */
export class AuthClient {
  private readonly baseUrl: string

  constructor(baseUrl?: string) {
    this.baseUrl = (baseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, '')
    logger.info(`${LOG_PREFIX} Initialized`, { baseUrl: this.baseUrl })
  }

  /**
   * Register a new user account
   *
   * @param input - Registration credentials
   * @returns Auth tokens and user info
   */
  async register(
    input: AuthRegisterInput,
  ): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    logger.info(`${LOG_PREFIX} Registering user`, { email: input.email })

    const data = await this.post<RegisterApiResponse>(
      '/api/v1/auth/register',
      input,
    )

    return {
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
      },
      tokens: {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn,
      },
    }
  }

  /**
   * Login with email and password
   *
   * @param input - Login credentials
   * @returns Auth tokens (user info fetched separately via getMe)
   */
  async login(
    input: AuthLoginInput,
  ): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    logger.info(`${LOG_PREFIX} Logging in`, { email: input.email })

    const data = await this.post<LoginApiResponse>(
      '/api/v1/auth/login',
      input,
    )

    return {
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
      },
      tokens: {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn,
      },
    }
  }

  /**
   * Refresh the access token using a refresh token
   *
   * @param refreshToken - The current refresh token
   * @returns New auth tokens
   */
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    logger.info(`${LOG_PREFIX} Refreshing token`)

    const data = await this.post<AuthTokens>('/api/v1/auth/refresh', {
      refreshToken,
    })

    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresIn: data.expiresIn,
    }
  }

  /**
   * Logout and revoke the refresh token
   *
   * @param refreshToken - The refresh token to revoke
   */
  async logout(refreshToken: string): Promise<void> {
    logger.info(`${LOG_PREFIX} Logging out`)

    try {
      await this.post<void>('/api/v1/auth/logout', { refreshToken })
    } catch (error) {
      // Logout failure is non-fatal — token will expire naturally
      logger.warn(`${LOG_PREFIX} Logout request failed (non-fatal)`, {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Get the current authenticated user info
   *
   * @param accessToken - The JWT access token
   * @returns User info
   */
  async getMe(accessToken: string): Promise<AuthUser> {
    logger.info(`${LOG_PREFIX} Getting current user`)

    const data = await this.get<MeApiResponse>('/api/v1/auth/me', accessToken)

    return {
      id: data.id,
      email: data.email,
      name: data.name,
      avatarUrl: data.avatarUrl,
    }
  }

  // ─── Private HTTP helpers ──────────────────────────────────────────────

  private async post<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    return this.handleResponse<T>(response)
  }

  private async get<T>(path: string, accessToken: string): Promise<T> {
    const url = `${this.baseUrl}${path}`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    return this.handleResponse<T>(response)
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (response.status === 204) {
      return undefined as unknown as T
    }

    const contentType = response.headers.get('content-type') ?? ''
    const isJson = contentType.includes('application/json')

    if (!response.ok) {
      let errorCode = 'UNKNOWN_ERROR'
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`

      if (isJson) {
        try {
          const errorBody = (await response.json()) as {
            error?: { code?: string; message?: string }
          }
          if (errorBody.error) {
            errorCode = errorBody.error.code ?? errorCode
            errorMessage = errorBody.error.message ?? errorMessage
          }
        } catch {
          // Failed to parse error body — use default message
        }
      }

      logger.error(`${LOG_PREFIX} API error`, {
        status: response.status,
        code: errorCode,
        message: errorMessage,
      })

      throw new AuthClientError(errorCode, errorMessage, response.status)
    }

    if (!isJson) {
      return undefined as unknown as T
    }

    return (await response.json()) as T
  }
}
