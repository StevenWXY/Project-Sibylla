/**
 * Routes index
 * Registers all route modules
 */

import type { FastifyInstance } from 'fastify'
import { healthRoutes } from './health.js'
import { authRoutes } from './auth.js'
import { gitRoutes } from './git.js'
import { workspaceRoutes } from './workspace.js'
import { aiRoutes } from './ai.js'

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

  // Workspace routes
  await app.register(workspaceRoutes, { prefix: '/api/v1/workspaces' })

  // AI gateway routes
  await app.register(aiRoutes, { prefix: '/api/v1/ai' })
}
