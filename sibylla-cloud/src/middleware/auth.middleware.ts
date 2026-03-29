/**
 * Authentication middleware
 */

import type { FastifyRequest, FastifyReply } from 'fastify'

/**
 * Require authentication middleware
 * Use as preHandler on protected routes
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify()
  } catch {
    reply.status(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    })
  }
}

/**
 * Optional authentication middleware
 * Verifies token if present, but doesn't require it
 */
export async function optionalAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const auth = request.headers.authorization
  if (auth && auth.startsWith('Bearer ')) {
    try {
      await request.jwtVerify()
    } catch {
      // Token invalid, but don't block - just don't set user
    }
  }
}

/**
 * Check if user has specific role in workspace
 * Factory function that returns middleware
 */
export function requireWorkspaceRole(_roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await requireAuth(request, reply)
    // Role checking will be implemented when workspace routes are added
    // For now, just verify authentication
  }
}
