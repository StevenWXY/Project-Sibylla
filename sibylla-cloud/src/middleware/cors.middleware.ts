/**
 * CORS middleware configuration
 */

import cors from '@fastify/cors'
import type { FastifyInstance } from 'fastify'
import { config } from '../config/index.js'

interface CorsRuntimeOptions {
  origin: true | string[]
  methods: string[]
  allowedHeaders: string[]
  exposedHeaders: string[]
  credentials: boolean
  maxAge: number
}

export function resolveCorsOptions(
  corsOrigin: string,
  isProduction: boolean
): CorsRuntimeOptions {
  const origins = corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)

  const wildcard = origins.length === 1 && origins[0] === '*'
  if (isProduction && wildcard) {
    throw new Error('CORS_ORIGIN cannot be "*" in production')
  }

  return {
    origin: wildcard ? true : origins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Request-Id'],
    credentials: !wildcard,
    maxAge: 86400,
  }
}

/**
 * Register CORS plugin with configuration
 */
export async function corsMiddleware(app: FastifyInstance): Promise<void> {
  await app.register(cors, resolveCorsOptions(config.cors.origin, config.isProduction))
}
