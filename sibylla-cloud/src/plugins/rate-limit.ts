/**
 * Rate limiting plugin
 * Protects authentication endpoints from brute-force attacks
 */

import type { FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'

/**
 * Register global rate limit plugin with default settings.
 * Individual routes can override with stricter limits via route config.
 */
export async function rateLimitPlugin(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    global: false, // Do not apply globally — only on opted-in routes
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) => ({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests. Please try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
      },
    }),
  })
}

/**
 * Strict rate limit config for auth endpoints (login/register)
 * 10 requests per minute per IP — prevents brute-force attacks
 */
export const AUTH_RATE_LIMIT = {
  config: {
    rateLimit: {
      max: 10,
      timeWindow: '1 minute',
    },
  },
}

/**
 * Moderate rate limit config for token refresh
 * 30 requests per minute per IP
 */
export const REFRESH_RATE_LIMIT = {
  config: {
    rateLimit: {
      max: 30,
      timeWindow: '1 minute',
    },
  },
}
