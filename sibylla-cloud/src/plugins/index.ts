/**
 * Plugins index
 * Registers all Fastify plugins
 */

import type { FastifyInstance } from 'fastify'
import { corsMiddleware } from '../middleware/cors.middleware.js'
import { jwtPlugin } from './jwt.js'

/**
 * Register all plugins
 */
export async function registerPlugins(app: FastifyInstance): Promise<void> {
  // Register CORS
  await corsMiddleware(app)

  // Register JWT
  await jwtPlugin(app)
}
