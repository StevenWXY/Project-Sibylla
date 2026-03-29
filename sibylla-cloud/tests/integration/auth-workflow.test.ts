/**
 * Auth Workflow Integration Tests
 *
 * End-to-end tests for the cloud authentication lifecycle:
 *   Register -> Login -> Refresh -> Access protected route -> Logout
 *
 * These tests hit the real Fastify app backed by the test Postgres instance.
 * They validate the full JWT + Refresh Token flow as experienced by a client.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { setup, teardown, getApp } from './setup'

// ─── Response type helpers (strict, no `any`) ─────────────────────────

interface RegisterResponse {
  user: { id: string; email: string; name: string }
  accessToken: string
  refreshToken: string
  expiresIn: number
}

interface LoginResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

interface RefreshResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

interface MeResponse {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  emailVerified: boolean
  createdAt: string
}

interface ErrorResponse {
  error: { code: string; message: string }
}

// ─── Test Suite ───────────────────────────────────────────────────────

describe('Auth Workflow Integration', () => {
  let app: FastifyInstance

  // Unique per-run email to avoid collisions if tests are re-run
  // without nuking the DB volume.
  const testEmail = `test-${Date.now()}@sibylla-test.local`
  const testPassword = 'SecurePassword123!'
  const testName = 'Integration Tester'

  beforeAll(async () => {
    await setup()
    app = getApp()
  })

  afterAll(async () => {
    await teardown()
  })

  // ─── 1. Registration ─────────────────────────────────────────────

  describe('Registration', () => {
    it('should register a new user and return JWT tokens', async () => {
      // Arrange — nothing to set up beyond the running app

      // Act
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: testEmail,
          password: testPassword,
          name: testName,
        },
      })

      // Assert
      expect(response.statusCode).toBe(201)

      const body = response.json<RegisterResponse>()
      expect(body.user.email).toBe(testEmail)
      expect(body.user.name).toBe(testName)
      expect(body.user.id).toBeDefined()
      expect(body.accessToken).toBeDefined()
      expect(body.refreshToken).toBeDefined()
      expect(body.expiresIn).toBeGreaterThan(0)
    })

    it('should reject duplicate email registration with 409', async () => {
      // Act — register the same email again
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: testEmail,
          password: testPassword,
          name: testName,
        },
      })

      // Assert
      expect(response.statusCode).toBe(409)
      const body = response.json<ErrorResponse>()
      expect(body.error.code).toBe('EMAIL_EXISTS')
    })

    it('should reject weak password with 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'weak@sibylla-test.local',
          password: 'short',
          name: 'Weak Pass User',
        },
      })

      expect(response.statusCode).toBe(400)
    })

    it('should reject invalid email format with 400', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'not-an-email',
          password: testPassword,
          name: testName,
        },
      })

      expect(response.statusCode).toBe(400)
      const body = response.json<ErrorResponse>()
      expect(body.error.code).toBe('VALIDATION_ERROR')
    })
  })

  // ─── 2. Login ─────────────────────────────────────────────────────

  describe('Login', () => {
    let loginRefreshToken: string

    it('should login with valid credentials and return tokens', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: testEmail,
          password: testPassword,
        },
      })

      expect(response.statusCode).toBe(200)

      const body = response.json<LoginResponse>()
      expect(body.accessToken).toBeDefined()
      expect(body.refreshToken).toBeDefined()
      expect(body.expiresIn).toBeGreaterThan(0)

      loginRefreshToken = body.refreshToken
    })

    it('should reject invalid password with 401', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: testEmail,
          password: 'wrong-password',
        },
      })

      expect(response.statusCode).toBe(401)
      const body = response.json<ErrorResponse>()
      expect(body.error.code).toBe('INVALID_CREDENTIALS')
    })

    it('should reject non-existent email with 401', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'nonexistent@sibylla-test.local',
          password: testPassword,
        },
      })

      expect(response.statusCode).toBe(401)
      const body = response.json<ErrorResponse>()
      expect(body.error.code).toBe('INVALID_CREDENTIALS')
    })

    // ─── 3. Token Refresh ───────────────────────────────────────────

    describe('Token Refresh', () => {
      it('should refresh tokens using a valid refresh token', async () => {
        // Need a fresh login token since the previous test may have consumed it
        const loginRes = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: { email: testEmail, password: testPassword },
        })
        const loginBody = loginRes.json<LoginResponse>()

        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/refresh',
          payload: {
            refreshToken: loginBody.refreshToken,
          },
        })

        expect(response.statusCode).toBe(200)

        const body = response.json<RefreshResponse>()
        expect(body.accessToken).toBeDefined()
        expect(body.refreshToken).toBeDefined()
        // New refresh token should differ (rotation)
        expect(body.refreshToken).not.toBe(loginBody.refreshToken)
      })

      it('should reject an already-used (rotated) refresh token with 401', async () => {
        // Login to get a fresh pair of tokens
        const loginRes = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: { email: testEmail, password: testPassword },
        })
        const loginBody = loginRes.json<LoginResponse>()

        // First refresh — should succeed and rotate the token
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/refresh',
          payload: { refreshToken: loginBody.refreshToken },
        })

        // Second refresh with the same (now-revoked) token — should fail
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/refresh',
          payload: { refreshToken: loginBody.refreshToken },
        })

        expect(response.statusCode).toBe(401)
      })

      it('should reject an invalid refresh token format with 401', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/refresh',
          payload: {
            refreshToken: 'garbage-token-value',
          },
        })

        expect(response.statusCode).toBe(401)
      })
    })
  })

  // ─── 4. Protected Route (GET /me) ─────────────────────────────────

  describe('Protected Route (/me)', () => {
    it('should return user info with a valid access token', async () => {
      // Arrange — login to get a fresh access token
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: testEmail, password: testPassword },
      })
      const { accessToken } = loginRes.json<LoginResponse>()

      // Act
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      })

      // Assert
      expect(response.statusCode).toBe(200)
      const body = response.json<MeResponse>()
      expect(body.email).toBe(testEmail)
      expect(body.name).toBe(testName)
      expect(body.id).toBeDefined()
    })

    it('should reject request without authorization header with 401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
      })

      expect(response.statusCode).toBe(401)
      const body = response.json<ErrorResponse>()
      expect(body.error.code).toBe('UNAUTHORIZED')
    })

    it('should reject request with an invalid token with 401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: 'Bearer invalid.jwt.token',
        },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  // ─── 5. Logout ────────────────────────────────────────────────────

  describe('Logout', () => {
    it('should revoke refresh token on logout', async () => {
      // Arrange — login to get tokens
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: testEmail, password: testPassword },
      })
      const { refreshToken } = loginRes.json<LoginResponse>()

      // Act — logout
      const logoutRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        payload: { refreshToken },
      })
      expect(logoutRes.statusCode).toBe(204)

      // Assert — the refresh token should now be revoked
      const refreshRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken },
      })
      expect(refreshRes.statusCode).toBe(401)
    })
  })
})
