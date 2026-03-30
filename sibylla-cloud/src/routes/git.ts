/**
 * Git routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { GitService } from '../services/git.service.js'
import { MemberModel } from '../models/member.model.js'

// eslint-disable-next-line @typescript-eslint/require-await
export async function gitRoutes(app: FastifyInstance): Promise<void> {
  // All Git routes require authentication
  app.addHook('preHandler', app.authenticate)

  /**
   * GET /api/v1/git/:workspaceId/info
   * Get repository info for workspace
   */
  app.get('/:workspaceId/info', async (request: FastifyRequest, reply: FastifyReply) => {
    const { workspaceId } = request.params as { workspaceId: string }
    const { userId } = request.user

    // Check user has access to workspace
    const hasAccess = await MemberModel.hasAccess(userId, workspaceId)
    if (!hasAccess) {
      return reply.status(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'No access to this workspace',
        },
      })
    }

    const repo = await GitService.getRepoByWorkspace(workspaceId)
    if (!repo) {
      return reply.status(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Repository not found for workspace',
        },
      })
    }

    return reply.send({
      cloneUrl: repo.cloneUrlHttp,
      defaultBranch: repo.defaultBranch,
      sizeBytes: repo.sizeBytes,
      lastPushAt: repo.lastPushAt,
    })
  })

  /**
   * POST /api/v1/git/token
   * Generate Git access token for current user
   */
  app.post('/token', async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = request.user

    const token = await GitService.generateAccessToken(userId)

    return reply.send({
      token,
      message: 'Store this token securely. It will not be shown again.',
    })
  })

  /**
   * DELETE /api/v1/git/token
   * Revoke all Git access tokens for current user
   */
  app.delete('/token', async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = request.user

    await GitService.revokeAccessTokens(userId)

    return reply.status(204).send()
  })

  /**
   * GET /api/v1/git/:workspaceId/commits
   * Get recent commits for workspace repository
   */
  app.get('/:workspaceId/commits', async (request: FastifyRequest, reply: FastifyReply) => {
    const { workspaceId } = request.params as { workspaceId: string }
    const { userId } = request.user
    const query = request.query as { limit?: string; page?: string }

    // Check access
    const hasAccess = await MemberModel.hasAccess(userId, workspaceId)
    if (!hasAccess) {
      return reply.status(403).send({
        error: { code: 'FORBIDDEN', message: 'No access to this workspace' },
      })
    }

    const limit = Math.min(parseInt(query.limit || '20'), 100)
    const page = parseInt(query.page || '1')

    const result = await GitService.getWorkspaceCommits(workspaceId, { page, limit })

    return reply.send({
      commits: result.commits.map((c) => ({
        sha: c.sha,
        message: c.message,
        author: { name: c.author.name, email: c.author.email, date: c.author.date },
        committer: { name: c.committer.name, email: c.committer.email, date: c.committer.date },
        created: c.created,
      })),
      pagination: { page, limit, total: result.total },
    })
  })
}
