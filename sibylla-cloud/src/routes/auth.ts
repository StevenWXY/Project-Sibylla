/**
 * Authentication routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { AuthService, AuthError } from '../services/auth.service.js'
import { UserModel } from '../models/user.model.js'

// Request schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').max(100),
})

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
})

// eslint-disable-next-line @typescript-eslint/require-await
export async function authRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /api/v1/auth/register
   * Register a new user
   */
  app.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = registerSchema.parse(request.body)
      const user = await AuthService.register(body)

      // Auto-login after registration
      const tokens = await AuthService.generateTokens(app, user, {
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
      })

      return reply.status(201).send({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        ...tokens,
      })
    } catch (error) {
      return handleAuthError(error, reply)
    }
  })

  /**
   * POST /api/v1/auth/login
   * Login and get tokens
   */
  app.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = loginSchema.parse(request.body)
      const tokens = await AuthService.login(body, app, {
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
      })

      return reply.send(tokens)
    } catch (error) {
      return handleAuthError(error, reply)
    }
  })

  /**
   * POST /api/v1/auth/refresh
   * Refresh access token
   */
  app.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = refreshSchema.parse(request.body)
      const tokens = await AuthService.refreshAccessToken(app, body.refreshToken)

      return reply.send(tokens)
    } catch (error) {
      return handleAuthError(error, reply)
    }
  })

  /**
   * POST /api/v1/auth/logout
   * Logout and revoke refresh token
   */
  app.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = refreshSchema.parse(request.body)
      await AuthService.logout(body.refreshToken)

      return reply.status(204).send()
    } catch (error) {
      return handleAuthError(error, reply)
    }
  })

  /**
   * GET /api/v1/auth/me
   * Get current user info (requires authentication)
   */
  app.get(
    '/me',
    {
      preHandler: [app.authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userId } = request.user
      const user = await UserModel.findById(userId)

      if (!user) {
        return reply.status(404).send({
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        })
      }

      return reply.send({
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      })
    }
  )
}

/**
 * Handle authentication errors
 */
function handleAuthError(error: unknown, reply: FastifyReply): FastifyReply {
  if (error instanceof z.ZodError) {
    return reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.errors,
      },
    })
  }

  if (error instanceof AuthError) {
    const statusMap: Record<string, number> = {
      EMAIL_EXISTS: 409,
      INVALID_CREDENTIALS: 401,
      INVALID_TOKEN: 401,
      TOKEN_REVOKED: 401,
      TOKEN_EXPIRED: 401,
      WEAK_PASSWORD: 400,
    }
    const status = statusMap[error.code] || 400

    return reply.status(status).send({
      error: {
        code: error.code,
        message: error.message,
      },
    })
  }

  // Unexpected error
  throw error
}
