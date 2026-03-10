/**
 * Type definitions index
 * Re-exports all types for convenient imports
 */

export * from './database.js'
export * from './auth.js'
export * from './git.js'

// ============ API Response Types ============

export interface ApiError {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error'
  timestamp: string
  version: string
  checks?: {
    database?: boolean
  }
}

export interface ReadyResponse {
  ready: boolean
  database?: {
    connected: boolean
    latencyMs: number
  }
}

export interface LiveResponse {
  live: boolean
}
