/**
 * Fastify application factory
 * Creates and configures the Fastify instance
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { config } from './config/index.js'
import { registerPlugins } from './plugins/index.js'
import { registerRoutes } from './routes/index.js'
import { errorMiddleware } from './middleware/error.middleware.js'

/**
 * Build and configure Fastify application
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.isDevelopment
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          },
        }
      : true,
    trustProxy: true,
    // Disable default error handler, we use custom one
    disableRequestLogging: false,
  })

  // Register plugins (CORS, etc.)
  await registerPlugins(app)

  // Register custom error handler
  app.setErrorHandler(errorMiddleware)

  // Register routes
  await registerRoutes(app)

  return app
}
