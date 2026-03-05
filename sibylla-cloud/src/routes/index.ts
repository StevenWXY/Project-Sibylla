/**
 * Routes index
 * Registers all route modules
 */

import type { FastifyInstance } from 'fastify'
import { healthRoutes } from './health.js'
import { authRoutes } from './auth.js'
import { gitRoutes } from './git.js'

/**
 * Register all routes
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Health check routes (no prefix, direct access)
  await app.register(healthRoutes, { prefix: '/api/v1' })

  // Auth routes
  await app.register(authRoutes, { prefix: '/api/v1/auth' })

  // Git routes
  await app.register(gitRoutes, { prefix: '/api/v1/git' })
}
