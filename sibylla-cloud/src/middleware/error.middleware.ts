/**
 * Error handling middleware
 */

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { logger } from '../utils/logger.js'
import type { ApiError } from '../types/index.js'

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
        headers: request.headers,
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
