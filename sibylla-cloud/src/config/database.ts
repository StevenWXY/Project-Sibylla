/**
 * Database configuration
 * Parses DATABASE_URL or individual environment variables
 */

import { z } from 'zod'
import { env } from './env.js'

export const databaseConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.number().default(5432),
  database: z.string().default('sibylla'),
  user: z.string().default('sibylla'),
  password: z.string(),
  ssl: z.boolean().default(false),
  max: z.number().default(20), // Connection pool max connections
  idleTimeout: z.number().default(30), // Idle timeout (seconds)
  connectionTimeout: z.number().default(10), // Connection timeout (seconds)
})

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>

function parseConnectionString(url: string): DatabaseConfig {
  const parsed = new URL(url)
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port) || 5432,
    database: parsed.pathname.slice(1),
    user: parsed.username,
    password: parsed.password,
    ssl: parsed.searchParams.get('sslmode') === 'require',
    max: 20,
    idleTimeout: 30,
    connectionTimeout: 10,
  }
}

export const databaseConfig: DatabaseConfig = env.DATABASE_URL
  ? parseConnectionString(env.DATABASE_URL)
  : databaseConfigSchema.parse({
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      ssl: env.DB_SSL,
      max: 20,
      idleTimeout: 30,
      connectionTimeout: 10,
    })
