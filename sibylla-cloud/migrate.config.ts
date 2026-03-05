/**
 * Migration configuration for node-pg-migrate
 */

import type { RunnerOption } from 'node-pg-migrate'
import { databaseConfig } from './src/config/database.js'

const connectionString = `postgresql://${databaseConfig.user}:${databaseConfig.password}@${databaseConfig.host}:${databaseConfig.port}/${databaseConfig.database}`

const config: Partial<RunnerOption> = {
  databaseUrl:
    process.env.DATABASE_URL || connectionString,
  migrationsTable: 'pgmigrations',
  dir: 'migrations',
  direction: 'up',
  log: console.log,
  verbose: true,
}

export default config
