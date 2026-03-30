import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { WorkspaceModel } from '../models/workspace.model.js'
import { MemberModel } from '../models/member.model.js'
import { WorkspaceService, WorkspaceError } from '../services/workspace.service.js'
import type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  WorkspaceMemberRole,
} from '../types/database.js'

const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  icon: z.string().max(10).optional(),
  gitProvider: z.enum(['sibylla', 'github', 'gitlab']).optional(),
  gitRemoteUrl: z.string().url().optional(),
  defaultModel: z.string().max(100).optional(),
  syncInterval: z.number().int().min(1).max(3600).optional(),
})

const updateWorkspaceSchema = createWorkspaceSchema.partial()

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['admin', 'editor', 'viewer']).default('editor'),
})

const updateMemberRoleSchema = z.object({
  role: z.enum(['admin', 'editor', 'viewer']),
})

function buildCreateWorkspaceInput(
  input: z.infer<typeof createWorkspaceSchema>
): CreateWorkspaceInput {
  const payload: CreateWorkspaceInput = {
    name: input.name,
  }
  if (input.description !== undefined) payload.description = input.description
  if (input.icon !== undefined) payload.icon = input.icon
  if (input.gitProvider !== undefined) payload.gitProvider = input.gitProvider
  if (input.gitRemoteUrl !== undefined) payload.gitRemoteUrl = input.gitRemoteUrl
  if (input.defaultModel !== undefined) payload.defaultModel = input.defaultModel
  if (input.syncInterval !== undefined) payload.syncInterval = input.syncInterval
  return payload
}

function buildUpdateWorkspaceInput(
  input: z.infer<typeof updateWorkspaceSchema>
): UpdateWorkspaceInput {
  const payload: UpdateWorkspaceInput = {}
  if (input.name !== undefined) payload.name = input.name
  if (input.description !== undefined) payload.description = input.description
  if (input.icon !== undefined) payload.icon = input.icon
  if (input.gitProvider !== undefined) payload.gitProvider = input.gitProvider
  if (input.gitRemoteUrl !== undefined) payload.gitRemoteUrl = input.gitRemoteUrl
  if (input.defaultModel !== undefined) payload.defaultModel = input.defaultModel
  if (input.syncInterval !== undefined) payload.syncInterval = input.syncInterval
  return payload
}

async function ensureWorkspaceAccess(
  userId: string,
  workspaceId: string,
  reply: FastifyReply
): Promise<boolean> {
  const hasAccess = await MemberModel.hasAccess(userId, workspaceId)
  if (!hasAccess) {
    await reply.status(403).send({
      error: {
        code: 'FORBIDDEN',
        message: 'No access to this workspace',
      },
    })
    return false
  }
  return true
}

async function ensureWorkspaceAdmin(
  userId: string,
  workspaceId: string,
  reply: FastifyReply
): Promise<boolean> {
  const isAdmin = await MemberModel.hasRole(userId, workspaceId, ['admin'])
  if (!isAdmin) {
    await reply.status(403).send({
      error: {
        code: 'FORBIDDEN',
        message: 'Admin role required',
      },
    })
    return false
  }
  return true
}

function handleWorkspaceError(error: unknown, reply: FastifyReply): FastifyReply {
  if (error instanceof z.ZodError) {
    return reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: error.errors,
      },
    })
  }

  if (error instanceof WorkspaceError) {
    const statusMap: Record<string, number> = {
      USER_NOT_FOUND: 404,
      MEMBER_EXISTS: 409,
    }
    return reply.status(statusMap[error.code] || 400).send({
      error: {
        code: error.code,
        message: error.message,
      },
    })
  }

  throw error
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function workspaceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.authenticate)

  app.get('/', async (request: FastifyRequest) => {
    const { userId } = request.user
    return WorkspaceModel.findByUserId(userId)
  })

  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.user
      const parsedBody = createWorkspaceSchema.parse(request.body)
      const body = buildCreateWorkspaceInput(parsedBody)
      const workspace = await WorkspaceService.createWorkspaceWithOwner(userId, body)
      return reply.status(201).send(workspace)
    } catch (error) {
      return handleWorkspaceError(error, reply)
    }
  })

  app.get('/:workspaceId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { workspaceId } = request.params as { workspaceId: string }
    const { userId } = request.user
    const hasAccess = await ensureWorkspaceAccess(userId, workspaceId, reply)
    if (!hasAccess) {
      return reply
    }

    const workspace = await WorkspaceModel.findById(workspaceId)
    if (!workspace) {
      return reply.status(404).send({
        error: {
          code: 'WORKSPACE_NOT_FOUND',
          message: 'Workspace not found',
        },
      })
    }

    return reply.send(workspace)
  })

  app.patch('/:workspaceId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { workspaceId } = request.params as { workspaceId: string }
      const { userId } = request.user
      const isAdmin = await ensureWorkspaceAdmin(userId, workspaceId, reply)
      if (!isAdmin) {
        return reply
      }

      const parsedBody = updateWorkspaceSchema.parse(request.body)
      const body = buildUpdateWorkspaceInput(parsedBody)
      const workspace = await WorkspaceModel.update(workspaceId, body)
      if (!workspace) {
        return reply.status(404).send({
          error: {
            code: 'WORKSPACE_NOT_FOUND',
            message: 'Workspace not found',
          },
        })
      }

      return reply.send(workspace)
    } catch (error) {
      return handleWorkspaceError(error, reply)
    }
  })

  app.delete('/:workspaceId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { workspaceId } = request.params as { workspaceId: string }
      const { userId } = request.user
      const isAdmin = await ensureWorkspaceAdmin(userId, workspaceId, reply)
      if (!isAdmin) {
        return reply
      }

      const deleted = await WorkspaceService.deleteWorkspaceWithGitSync(workspaceId)
      if (!deleted) {
        return reply.status(404).send({
          error: {
            code: 'WORKSPACE_NOT_FOUND',
            message: 'Workspace not found',
          },
        })
      }
      return reply.status(204).send()
    } catch (error) {
      return handleWorkspaceError(error, reply)
    }
  })

  app.get('/:workspaceId/members', async (request: FastifyRequest, reply: FastifyReply) => {
    const { workspaceId } = request.params as { workspaceId: string }
    const { userId } = request.user
    const hasAccess = await ensureWorkspaceAccess(userId, workspaceId, reply)
    if (!hasAccess) {
      return reply
    }

    return MemberModel.findByWorkspace(workspaceId)
  })

  app.post('/:workspaceId/members', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { workspaceId } = request.params as { workspaceId: string }
      const { userId } = request.user
      const isAdmin = await ensureWorkspaceAdmin(userId, workspaceId, reply)
      if (!isAdmin) {
        return reply
      }

      const body = addMemberSchema.parse(request.body)
      const member = await WorkspaceService.addMemberWithGitSync({
        workspaceId,
        userId: body.userId,
        role: body.role,
      })
      return reply.status(201).send(member)
    } catch (error) {
      return handleWorkspaceError(error, reply)
    }
  })

  app.patch(
    '/:workspaceId/members/:memberUserId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { workspaceId, memberUserId } = request.params as {
          workspaceId: string
          memberUserId: string
        }
        const { userId } = request.user
        const isAdmin = await ensureWorkspaceAdmin(userId, workspaceId, reply)
        if (!isAdmin) {
          return reply
        }

        const body = updateMemberRoleSchema.parse(request.body)
        const updated = await WorkspaceService.updateMemberRoleWithGitSync(
          memberUserId,
          workspaceId,
          body.role as WorkspaceMemberRole
        )
        if (!updated) {
          return reply.status(404).send({
            error: {
              code: 'MEMBER_NOT_FOUND',
              message: 'Workspace member not found',
            },
          })
        }
        return reply.send(updated)
      } catch (error) {
        return handleWorkspaceError(error, reply)
      }
    }
  )

  app.delete(
    '/:workspaceId/members/:memberUserId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { workspaceId, memberUserId } = request.params as {
          workspaceId: string
          memberUserId: string
        }
        const { userId } = request.user
        const isAdmin = await ensureWorkspaceAdmin(userId, workspaceId, reply)
        if (!isAdmin) {
          return reply
        }

        if (memberUserId === userId) {
          return reply.status(400).send({
            error: {
              code: 'INVALID_OPERATION',
              message: 'Workspace admin cannot remove self',
            },
          })
        }

        const removed = await WorkspaceService.removeMemberWithGitSync(memberUserId, workspaceId)
        if (!removed) {
          return reply.status(404).send({
            error: {
              code: 'MEMBER_NOT_FOUND',
              message: 'Workspace member not found',
            },
          })
        }
        return reply.status(204).send()
      } catch (error) {
        return handleWorkspaceError(error, reply)
      }
    }
  )
}
