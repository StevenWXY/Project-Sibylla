import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorkspaceService } from '../../src/services/workspace.service.js'
import type { WorkspaceMemberRole } from '../../src/types/database.js'

function createMocks() {
  return {
    workspaceModel: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    memberModel: {
      add: vi.fn(),
      findByUserAndWorkspace: vi.fn(),
      updateRole: vi.fn(),
      remove: vi.fn(),
    },
    userModel: {
      findById: vi.fn(),
    },
    gitService: {
      createWorkspaceRepo: vi.fn(),
      addCollaborator: vi.fn(),
      removeCollaborator: vi.fn(),
      deleteWorkspaceRepo: vi.fn(),
    },
  }
}

describe('WorkspaceService lifecycle sync', () => {
  const workspace = {
    id: 'w-1',
    name: 'Workspace A',
    description: null,
    icon: null,
    gitProvider: 'sibylla',
    gitRemoteUrl: null,
    defaultModel: 'claude-sonnet-4-20250514',
    syncInterval: 30,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const member = {
    id: 'm-1',
    userId: 'u-1',
    workspaceId: 'w-1',
    role: 'editor' as WorkspaceMemberRole,
    joinedAt: new Date(),
  }

  let mocks: ReturnType<typeof createMocks>

  beforeEach(() => {
    mocks = createMocks()
  })

  it('creates workspace and triggers git repo + owner collaborator sync', async () => {
    mocks.userModel.findById.mockResolvedValue({ id: 'u-1', email: 'u1@example.com' })
    mocks.workspaceModel.create.mockResolvedValue(workspace)
    mocks.memberModel.add.mockResolvedValue({ ...member, role: 'admin' })
    mocks.gitService.createWorkspaceRepo.mockResolvedValue({ id: 'gr-1' })
    mocks.gitService.addCollaborator.mockResolvedValue(undefined)

    const service = createWorkspaceService(mocks)
    const result = await service.createWorkspaceWithOwner('u-1', { name: 'Workspace A' })

    expect(result.id).toBe('w-1')
    expect(mocks.workspaceModel.create).toHaveBeenCalledTimes(1)
    expect(mocks.memberModel.add).toHaveBeenCalledWith({
      userId: 'u-1',
      workspaceId: 'w-1',
      role: 'admin',
    })
    expect(mocks.gitService.createWorkspaceRepo).toHaveBeenCalledTimes(1)
    expect(mocks.gitService.addCollaborator).toHaveBeenCalledWith(
      'w-1',
      'u-1',
      'u1@example.com',
      'admin'
    )
  })

  it('rolls back add member when git sync fails', async () => {
    mocks.userModel.findById.mockResolvedValue({ id: 'u-2', email: 'u2@example.com' })
    mocks.memberModel.findByUserAndWorkspace.mockResolvedValue(null)
    mocks.memberModel.add.mockResolvedValue({ ...member, userId: 'u-2' })
    mocks.memberModel.remove.mockResolvedValue(true)
    mocks.gitService.addCollaborator.mockRejectedValue(new Error('gitea error'))

    const service = createWorkspaceService(mocks)
    await expect(
      service.addMemberWithGitSync({
        userId: 'u-2',
        workspaceId: 'w-1',
        role: 'editor',
      })
    ).rejects.toThrow('gitea error')

    expect(mocks.memberModel.remove).toHaveBeenCalledWith('u-2', 'w-1')
  })

  it('reverts role update when git sync fails', async () => {
    mocks.userModel.findById.mockResolvedValue({ id: 'u-2', email: 'u2@example.com' })
    mocks.memberModel.findByUserAndWorkspace.mockResolvedValue({
      ...member,
      userId: 'u-2',
      role: 'viewer',
    })
    mocks.memberModel.updateRole
      .mockResolvedValueOnce({ ...member, userId: 'u-2', role: 'admin' })
      .mockResolvedValueOnce({ ...member, userId: 'u-2', role: 'viewer' })
    mocks.gitService.addCollaborator.mockRejectedValue(new Error('gitea error'))

    const service = createWorkspaceService(mocks)
    await expect(
      service.updateMemberRoleWithGitSync('u-2', 'w-1', 'admin')
    ).rejects.toThrow('gitea error')

    expect(mocks.memberModel.updateRole).toHaveBeenCalledWith('u-2', 'w-1', 'viewer')
  })

  it('deletes git repo before workspace deletion', async () => {
    mocks.gitService.deleteWorkspaceRepo.mockResolvedValue(undefined)
    mocks.workspaceModel.delete.mockResolvedValue(true)

    const service = createWorkspaceService(mocks)
    const deleted = await service.deleteWorkspaceWithGitSync('w-1')

    expect(deleted).toBe(true)
    expect(mocks.gitService.deleteWorkspaceRepo).toHaveBeenCalledWith('w-1')
    expect(mocks.workspaceModel.delete).toHaveBeenCalledWith('w-1')
  })
})
