/**
 * Error handling middleware
 */

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { logger } from '../utils/logger.js'
import type { ApiError } from '../types/index.js'

type RequestHeaderValue = string | string[] | undefined
type SafeHeaders = Record<string, RequestHeaderValue>

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'proxy-authorization',
])

export function sanitizeHeaders(
  headers: Record<string, RequestHeaderValue>
): SafeHeaders {
  const sanitized: SafeHeaders = {}
  for (const [key, value] of Object.entries(headers)) {
    const normalizedKey = key.toLowerCase()
    sanitized[key] = SENSITIVE_HEADERS.has(normalizedKey) ? '[REDACTED]' : value
  }
  return sanitized
}

/**
 * Global error handler for Fastify
 */
export function errorMiddleware(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  logger.error(
    {
      err: error,
      request: {
        method: request.method,
        url: request.url,
        headers: sanitizeHeaders(request.headers as Record<string, RequestHeaderValue>),
      },
    },
    'Request error'
  )

  const statusCode = error.statusCode || 500
  const response: ApiError = {
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'An unexpected error occurred',
    },
  }

  // Add validation details if present
  if (error.validation) {
    response.error.code = 'VALIDATION_ERROR'
    response.error.details = { validation: error.validation }
  }

  reply.status(statusCode).send(response)
}
