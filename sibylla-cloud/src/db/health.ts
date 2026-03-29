/**
 * Database health check utilities
 */

import { sql } from './client.js'
import { logger } from '../utils/logger.js'

export interface DatabaseHealth {
  connected: boolean
  latencyMs: number
  version?: string | undefined
  error?: string | undefined
}

/**
 * Check database connection health
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const start = Date.now()

  try {
    const result = await sql`SELECT version()`
    const latencyMs = Date.now() - start
    const version = result[0]?.['version'] as string | undefined

    const health: DatabaseHealth = {
      connected: true,
      latencyMs,
    }
    if (version) {
      health.version = version
    }
    return health
  } catch (error) {
    const latencyMs = Date.now() - start
    logger.error({ error }, 'Database health check failed')

    return {
      connected: false,
      latencyMs,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Wait for database to be ready (for startup)
 * Retries connection until successful or max retries reached
 */
export async function waitForDatabase(maxRetries = 30, retryIntervalMs = 1000): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    const health = await checkDatabaseHealth()

    if (health.connected) {
      logger.info({ latencyMs: health.latencyMs }, 'Database connected')
      return true
    }

    logger.warn({ attempt: i + 1, maxRetries }, 'Database not ready, retrying...')
    await new Promise((resolve) => setTimeout(resolve, retryIntervalMs))
  }

  logger.error('Database connection failed after max retries')
  return false
}
