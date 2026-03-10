/**
 * Application configuration
 * Aggregates all configuration modules
 */

import { env } from './env.js'
export { databaseConfig } from './database.js'

const INSECURE_JWT_SECRETS = new Set([
  '',
  'dev-secret-change-in-production',
  'your-super-secret-jwt-key-change-in-production',
])

export function isSecureJwtSecret(secret: string): boolean {
  return !INSECURE_JWT_SECRETS.has(secret) && secret.length >= 32
}

function assertProductionSecurity(): void {
  if (env.NODE_ENV !== 'production') {
    return
  }

  if (!isSecureJwtSecret(env.JWT_SECRET)) {
    throw new Error(
      'JWT_SECRET is insecure in production. Provide a strong secret with at least 32 characters.'
    )
  }
}

assertProductionSecurity()

export const config = {
  // Environment
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  nodeEnv: env.NODE_ENV,

  // Server
  port: env.PORT,
  host: env.HOST,
  logLevel: env.LOG_LEVEL,

  // CORS
  cors: {
    origin: env.CORS_ORIGIN,
  },

  // JWT
  jwt: {
    secret: env.JWT_SECRET,
    accessTokenExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    accessTokenExpiresInSeconds: parseExpiresIn(env.JWT_ACCESS_EXPIRES_IN),
    refreshTokenExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
    refreshTokenExpiresInMs: parseExpiresIn(env.JWT_REFRESH_EXPIRES_IN) * 1000,
  },

  // Gitea
  gitea: {
    url: env.GITEA_URL,
    adminToken: env.GITEA_ADMIN_TOKEN,
    adminUsername: env.GITEA_ADMIN_USERNAME,
  },
}

/**
 * Parse expires in string to seconds
 * Supports: 15m, 1h, 7d, 30d
 */
function parseExpiresIn(value: string): number {
  const match = value.match(/^(\d+)([mhd])$/)
  if (!match || !match[1] || !match[2]) {
    return 900 // Default 15 minutes
  }

  const num = parseInt(match[1])
  const unit = match[2]

  switch (unit) {
    case 'm':
      return num * 60
    case 'h':
      return num * 60 * 60
    case 'd':
      return num * 24 * 60 * 60
    default:
      return 900
  }
}
