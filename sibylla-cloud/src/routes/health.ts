/**
 * Health check routes
 */

import type { FastifyInstance } from 'fastify'
import { checkDatabaseHealth } from '../db/health.js'
import type { HealthResponse, ReadyResponse, LiveResponse } from '../types/index.js'

export function healthRoutes(app: FastifyInstance): void {
  /**
   * GET /api/v1/health
   * Main health check endpoint
   */
  app.get<{ Reply: HealthResponse }>('/health', async () => {
    const dbHealth = await checkDatabaseHealth()

    return {
      status: dbHealth.connected ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env['npm_package_version'] || '0.0.1',
      checks: {
        database: dbHealth.connected,
      },
    }
  })

  /**
   * GET /api/v1/health/ready
   * Readiness check for Kubernetes
   */
  app.get<{ Reply: ReadyResponse }>('/health/ready', async () => {
    const dbHealth = await checkDatabaseHealth()

    return {
      ready: dbHealth.connected,
      database: {
        connected: dbHealth.connected,
        latencyMs: dbHealth.latencyMs,
      },
    }
  })

  /**
   * GET /api/v1/health/live
   * Liveness check for Kubernetes
   */
  app.get<{ Reply: LiveResponse }>('/health/live', () => {
    return { live: true }
  })
}
