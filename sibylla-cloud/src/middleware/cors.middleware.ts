/**
 * CORS middleware configuration
 */

import cors from '@fastify/cors'
import type { FastifyInstance } from 'fastify'
import { config } from '../config/index.js'

/**
 * Register CORS plugin with configuration
 */
export async function corsMiddleware(app: FastifyInstance): Promise<void> {
  await app.register(cors, {
    origin: config.cors.origin === '*' ? true : config.cors.origin.split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Request-Id'],
    credentials: true,
    maxAge: 86400, // 24 hours
  })
}
