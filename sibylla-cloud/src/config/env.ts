/**
 * Environment variables configuration
 * Uses zod for runtime validation
 */

import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config()

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Database
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.string().transform(Number).default('5432'),
  DB_NAME: z.string().default('sibylla'),
  DB_USER: z.string().default('sibylla'),
  DB_PASSWORD: z.string().default('sibylla'),
  DB_SSL: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  // JWT
  JWT_SECRET: z.string().default('dev-secret-change-in-production'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // CORS
  CORS_ORIGIN: z.string().default('*'),

  // Gitea
  GITEA_URL: z.string().default('http://localhost:3001'),
  GITEA_ADMIN_TOKEN: z.string().default(''),
  GITEA_ADMIN_USERNAME: z.string().default('sibylla-admin'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  console.error(parsed.error.format())
  process.exit(1)
}

export const env = parsed.data
