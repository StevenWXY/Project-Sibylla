/**
 * Authentication service
 * Handles user registration, login, and token management
 */

import { hash, verify } from '@node-rs/argon2'
import { nanoid } from 'nanoid'
import { createHash } from 'crypto'
import type { FastifyInstance } from 'fastify'
import { sql } from '../db/client.js'
import { UserModel } from '../models/user.model.js'
import { config } from '../config/index.js'
import { logger } from '../utils/logger.js'
import type { User } from '../types/database.js'
import { AuthError, type AuthTokens, type RegisterInput, type LoginInput } from '../types/auth.js'

// Argon2 configuration (OWASP recommended)
const ARGON2_OPTIONS = {
  memoryCost: 65536, // 64 MB
  timeCost: 3,
  parallelism: 4,
}

export const AuthService = {
  /**
   * Register a new user
   */
  async register(input: RegisterInput): Promise<User> {
    // Check if email already exists
    const existing = await UserModel.findByEmail(input.email)
    if (existing) {
      throw new AuthError('EMAIL_EXISTS', 'Email already registered')
    }

    // Validate password strength
    validatePassword(input.password)

    // Hash password
    const passwordHash = await hash(input.password, ARGON2_OPTIONS)

    // Create user
    const user = await UserModel.create({
      email: input.email,
      passwordHash,
      name: input.name,
    })

    logger.info({ userId: user.id, email: user.email }, 'User registered')
    return user
  },

  /**
   * Login user and return tokens
   */
  async login(
    input: LoginInput,
    app: FastifyInstance,
    metadata?: { userAgent?: string | undefined; ipAddress?: string | undefined }
  ): Promise<AuthTokens> {
    // Find user
    const user = await UserModel.findByEmail(input.email)
    if (!user) {
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password')
    }

    // Verify password
    const valid = await verify(user.passwordHash, input.password)
    if (!valid) {
      throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password')
    }

    // Update last login
    await UserModel.updateLastLogin(user.id)

    // Generate tokens
    const tokens = await this.generateTokens(app, user, metadata)

    logger.info({ userId: user.id }, 'User logged in')
    return tokens
  },

  /**
   * Generate access and refresh tokens
   */
  async generateTokens(
    app: FastifyInstance,
    user: User,
    metadata?: { userAgent?: string | undefined; ipAddress?: string | undefined }
  ): Promise<AuthTokens> {
    // Generate access token
    const accessToken = app.jwt.sign({
      userId: user.id,
      email: user.email,
    })

    // Generate refresh token
    const refreshToken = nanoid(64)
    const tokenId = nanoid(32)
    const tokenHash = hashToken(refreshToken)
    const expiresAt = new Date(Date.now() + config.jwt.refreshTokenExpiresInMs)

    // Store refresh token
    await sql`
      INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, user_agent, ip_address)
      VALUES (${tokenId}, ${user.id}, ${tokenHash}, ${expiresAt},
              ${metadata?.userAgent ?? null}, ${metadata?.ipAddress ?? null})
    `

    return {
      accessToken,
      refreshToken: `${tokenId}.${refreshToken}`,
      expiresIn: config.jwt.accessTokenExpiresInSeconds,
    }
  },

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(app: FastifyInstance, refreshToken: string): Promise<AuthTokens> {
    // Parse refresh token
    const [tokenId, token] = refreshToken.split('.')
    if (!tokenId || !token) {
      throw new AuthError('INVALID_TOKEN', 'Invalid refresh token format')
    }

    const tokenHash = hashToken(token)

    // Find and validate refresh token
    const result = await sql`
      SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at,
             u.id as uid, u.email, u.name, u.avatar_url, u.email_verified
      FROM refresh_tokens rt
      JOIN users u ON u.id = rt.user_id
      WHERE rt.id = ${tokenId}
        AND rt.token_hash = ${tokenHash}
    `

    const record = result[0] as Record<string, unknown> | undefined
    if (!record) {
      throw new AuthError('INVALID_TOKEN', 'Refresh token not found')
    }

    if (record['revoked_at']) {
      throw new AuthError('TOKEN_REVOKED', 'Refresh token has been revoked')
    }

    if (new Date(record['expires_at'] as string) < new Date()) {
      throw new AuthError('TOKEN_EXPIRED', 'Refresh token has expired')
    }

    // Revoke old refresh token (rotation)
    await sql`
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE id = ${tokenId}
    `

    // Generate new tokens
    const user: User = {
      id: record['uid'] as string,
      email: record['email'] as string,
      name: record['name'] as string,
      passwordHash: '',
      avatarUrl: record['avatar_url'] as string | null,
      emailVerified: record['email_verified'] as boolean,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    return await this.generateTokens(app, user)
  },

  /**
   * Logout - revoke refresh token
   */
  async logout(refreshToken: string): Promise<void> {
    const [tokenId] = refreshToken.split('.')
    if (!tokenId) return

    await sql`
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE id = ${tokenId} AND revoked_at IS NULL
    `

    logger.info({ tokenId }, 'User logged out')
  },

  /**
   * Revoke all refresh tokens for a user
   */
  async revokeAllTokens(userId: string): Promise<void> {
    await sql`
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE user_id = ${userId} AND revoked_at IS NULL
    `

    logger.info({ userId }, 'All tokens revoked')
  },
}

// Helper functions
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function validatePassword(password: string): void {
  if (password.length < 8) {
    throw new AuthError('WEAK_PASSWORD', 'Password must be at least 8 characters')
  }
  if (password.length > 128) {
    throw new AuthError('WEAK_PASSWORD', 'Password must be at most 128 characters')
  }
}

export { AuthError }
