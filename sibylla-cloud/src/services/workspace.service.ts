import type {
  AddWorkspaceMemberInput,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceMember,
  WorkspaceMemberRole,
} from '../types/database.js'
import type { GitRepoInfo } from '../types/git.js'
import { WorkspaceModel } from '../models/workspace.model.js'
import { MemberModel } from '../models/member.model.js'
import { UserModel } from '../models/user.model.js'
import { GitService } from './git.service.js'
import { logger } from '../utils/logger.js'

export class WorkspaceError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
    this.name = 'WorkspaceError'
  }
}

interface WorkspaceServiceDeps {
  workspaceModel: {
    create: (input: CreateWorkspaceInput) => Promise<Workspace>
    update: (id: string, input: UpdateWorkspaceInput) => Promise<Workspace | null>
    delete: (id: string) => Promise<boolean>
  }
  memberModel: {
    add: (input: AddWorkspaceMemberInput) => Promise<WorkspaceMember>
    findByUserAndWorkspace: (userId: string, workspaceId: string) => Promise<WorkspaceMember | null>
    updateRole: (
      userId: string,
      workspaceId: string,
      role: WorkspaceMemberRole
    ) => Promise<WorkspaceMember | null>
    remove: (userId: string, workspaceId: string) => Promise<boolean>
  }
  userModel: {
    findById: (id: string) => Promise<{ id: string; email: string } | null>
  }
  gitService: {
    createWorkspaceRepo: (params: {
      workspaceId: string
      workspaceName: string
      ownerUserId: string
      ownerEmail: string
    }) => Promise<GitRepoInfo>
    addCollaborator: (
      workspaceId: string,
      userId: string,
      email: string,
      role: WorkspaceMemberRole
    ) => Promise<void>
    removeCollaborator: (workspaceId: string, userId: string) => Promise<void>
    deleteWorkspaceRepo: (workspaceId: string) => Promise<void>
  }
}

function shouldSyncGit(provider: string): boolean {
  return provider === 'sibylla'
}

export function createWorkspaceService(deps: WorkspaceServiceDeps) {
  return {
    async createWorkspaceWithOwner(
      ownerUserId: string,
      input: CreateWorkspaceInput
    ): Promise<Workspace> {
      const owner = await deps.userModel.findById(ownerUserId)
      if (!owner) {
        throw new WorkspaceError('USER_NOT_FOUND', 'Owner user not found')
      }

      const workspace = await deps.workspaceModel.create(input)
      try {
        await deps.memberModel.add({
          userId: ownerUserId,
          workspaceId: workspace.id,
          role: 'admin',
        })

        if (shouldSyncGit(workspace.gitProvider)) {
          await deps.gitService.createWorkspaceRepo({
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            ownerUserId,
            ownerEmail: owner.email,
          })
          await deps.gitService.addCollaborator(workspace.id, ownerUserId, owner.email, 'admin')
        }

        return workspace
      } catch (error) {
        await deps.memberModel.remove(ownerUserId, workspace.id)
        await deps.workspaceModel.delete(workspace.id)
        logger.error(
          { error, ownerUserId, workspaceId: workspace.id },
          'Workspace creation failed and rollback executed'
        )
        throw error
      }
    },

    async addMemberWithGitSync(input: AddWorkspaceMemberInput): Promise<WorkspaceMember> {
      const user = await deps.userModel.findById(input.userId)
      if (!user) {
        throw new WorkspaceError('USER_NOT_FOUND', 'Target user not found')
      }

      const existing = await deps.memberModel.findByUserAndWorkspace(
        input.userId,
        input.workspaceId
      )
      if (existing) {
        throw new WorkspaceError('MEMBER_EXISTS', 'User is already a workspace member')
      }

      const member = await deps.memberModel.add(input)
      try {
        await deps.gitService.addCollaborator(
          input.workspaceId,
          input.userId,
          user.email,
          member.role
        )
        return member
      } catch (error) {
        await deps.memberModel.remove(input.userId, input.workspaceId)
        logger.error(
          { error, workspaceId: input.workspaceId, userId: input.userId },
          'Add member failed and rollback executed'
        )
        throw error
      }
    },

    async updateMemberRoleWithGitSync(
      userId: string,
      workspaceId: string,
      role: WorkspaceMemberRole
    ): Promise<WorkspaceMember | null> {
      const user = await deps.userModel.findById(userId)
      if (!user) {
        throw new WorkspaceError('USER_NOT_FOUND', 'Target user not found')
      }

      const current = await deps.memberModel.findByUserAndWorkspace(userId, workspaceId)
      if (!current) {
        return null
      }

      const updated = await deps.memberModel.updateRole(userId, workspaceId, role)
      if (!updated) {
        return null
      }

      try {
        await deps.gitService.addCollaborator(workspaceId, userId, user.email, role)
        return updated
      } catch (error) {
        await deps.memberModel.updateRole(userId, workspaceId, current.role)
        logger.error(
          { error, workspaceId, userId, role },
          'Update member role failed and rollback executed'
        )
        throw error
      }
    },

    async removeMemberWithGitSync(userId: string, workspaceId: string): Promise<boolean> {
      const existing = await deps.memberModel.findByUserAndWorkspace(userId, workspaceId)
      if (!existing) {
        return false
      }

      await deps.gitService.removeCollaborator(workspaceId, userId)
      return deps.memberModel.remove(userId, workspaceId)
    },

    async deleteWorkspaceWithGitSync(workspaceId: string): Promise<boolean> {
      await deps.gitService.deleteWorkspaceRepo(workspaceId)
      return deps.workspaceModel.delete(workspaceId)
    },
  }
}

export const WorkspaceService = createWorkspaceService({
  workspaceModel: WorkspaceModel,
  memberModel: MemberModel,
  userModel: UserModel,
  gitService: GitService,
})
