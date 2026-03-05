/**
 * Database client
 * Uses postgres.js for PostgreSQL connection
 */

import postgres from 'postgres'
import { databaseConfig } from '../config/database.js'
import { logger } from '../utils/logger.js'

// Create postgres.js client with connection pool
export const sql = postgres({
  host: databaseConfig.host,
  port: databaseConfig.port,
  database: databaseConfig.database,
  username: databaseConfig.user,
  password: databaseConfig.password,
  ssl: databaseConfig.ssl ? 'require' : false,
  max: databaseConfig.max,
  idle_timeout: databaseConfig.idleTimeout,
  connect_timeout: databaseConfig.connectionTimeout,
  onnotice: () => {}, // Suppress notices
  debug: (_connection, query, params) => {
    if (process.env['DEBUG_SQL']) {
      logger.debug({ query, params }, 'SQL query')
    }
  },
})

/**
 * Close database connection pool
 * Call this during graceful shutdown
 */
export async function closeDatabaseConnection(): Promise<void> {
  await sql.end({ timeout: 5 })
  logger.info('Database connection closed')
}
