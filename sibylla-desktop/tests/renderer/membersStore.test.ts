import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  useMembersStore,
  selectMembers,
  selectIsLoading,
  selectMembersError,
} from '../../src/renderer/store/membersStore'
import { useAppStore } from '../../src/renderer/store/appStore'
import type { WorkspaceMember } from '../../src/shared/types'

const MOCK_MEMBERS: WorkspaceMember[] = [
  {
    id: 'user-1',
    name: 'Admin User',
    email: 'admin@example.com',
    role: 'admin',
    joinedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user-2',
    name: 'Editor User',
    email: 'editor@example.com',
    role: 'editor',
    joinedAt: '2026-01-02T00:00:00Z',
  },
  {
    id: 'user-3',
    name: 'Viewer User',
    email: 'viewer@example.com',
    role: 'viewer',
    joinedAt: '2026-01-03T00:00:00Z',
  },
]

const okResponse = <T>(data: T) => ({
  success: true as const,
  data,
  timestamp: Date.now(),
})

const errorResponse = (message: string) => ({
  success: false as const,
  error: { type: 'IPC_ERROR' as const, message },
  timestamp: Date.now(),
})

describe('membersStore', () => {
  beforeEach(() => {
    useMembersStore.getState().reset()
    useAppStore.getState().clearAuth()
    vi.clearAllMocks()
  })

  it('has correct initial state', () => {
    const state = useMembersStore.getState()
    expect(state.members).toEqual([])
    expect(state.isLoading).toBe(false)
    expect(state.error).toBeNull()
  })

  describe('loadMembers', () => {
    it('loads members and updates state', async () => {
      const mockGetMembers = vi.fn().mockResolvedValue(okResponse(MOCK_MEMBERS))
      window.electronAPI.workspace.getMembers = mockGetMembers

      await useMembersStore.getState().loadMembers('ws-test')

      const state = useMembersStore.getState()
      expect(state.members).toHaveLength(3)
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
      expect(mockGetMembers).toHaveBeenCalledWith('ws-test')
    })

    it('sets error on IPC failure', async () => {
      const mockGetMembers = vi.fn().mockResolvedValue(errorResponse('Network error'))
      window.electronAPI.workspace.getMembers = mockGetMembers

      await useMembersStore.getState().loadMembers('ws-test')

      const state = useMembersStore.getState()
      expect(state.members).toEqual([])
      expect(state.error).toBe('Network error')
      expect(state.isLoading).toBe(false)
    })

    it('sets error on exception', async () => {
      const mockGetMembers = vi.fn().mockRejectedValue(new Error('IPC crashed'))
      window.electronAPI.workspace.getMembers = mockGetMembers

      await useMembersStore.getState().loadMembers('ws-test')

      const state = useMembersStore.getState()
      expect(state.error).toBe('IPC crashed')
      expect(state.isLoading).toBe(false)
    })
  })

  describe('inviteMember', () => {
    it('returns success and reloads members', async () => {
      const mockInvite = vi.fn().mockResolvedValue(okResponse({ success: true }))
      const mockGetMembers = vi.fn().mockResolvedValue(okResponse(MOCK_MEMBERS))
      window.electronAPI.workspace.inviteMember = mockInvite
      window.electronAPI.workspace.getMembers = mockGetMembers

      const result = await useMembersStore.getState().inviteMember('ws-test', 'new@example.com', 'editor')

      expect(result.success).toBe(true)
      expect(mockInvite).toHaveBeenCalledWith('ws-test', {
        email: 'new@example.com',
        role: 'editor',
      })
      expect(mockGetMembers).toHaveBeenCalledWith('ws-test')
    })

    it('returns error when IPC fails', async () => {
      const mockInvite = vi.fn().mockResolvedValue(errorResponse('Invite failed'))
      window.electronAPI.workspace.inviteMember = mockInvite

      const result = await useMembersStore.getState().inviteMember('ws-test', 'new@example.com', 'editor')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invite failed')
    })

    it('returns error when invite API returns failure', async () => {
      const mockInvite = vi.fn().mockResolvedValue(
        okResponse({ success: false, error: '用户已存在' }),
      )
      window.electronAPI.workspace.inviteMember = mockInvite

      const result = await useMembersStore.getState().inviteMember('ws-test', 'existing@example.com', 'editor')

      expect(result.success).toBe(false)
      expect(result.error).toBe('用户已存在')
    })
  })

  describe('updateRole', () => {
    it('optimistically updates role in members list', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(okResponse(undefined))
      window.electronAPI.workspace.updateMemberRole = mockUpdate

      useMembersStore.setState({ members: MOCK_MEMBERS })

      await useMembersStore.getState().updateRole('ws-test', 'user-2', 'viewer')

      const state = useMembersStore.getState()
      const updated = state.members.find((m) => m.id === 'user-2')
      expect(updated?.role).toBe('viewer')
      expect(mockUpdate).toHaveBeenCalledWith('ws-test', 'user-2', 'viewer')
    })

    it('throws on IPC failure', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(errorResponse('Forbidden'))
      window.electronAPI.workspace.updateMemberRole = mockUpdate

      useMembersStore.setState({ members: MOCK_MEMBERS })

      await expect(
        useMembersStore.getState().updateRole('ws-test', 'user-2', 'viewer'),
      ).rejects.toThrow('Forbidden')
    })
  })

  describe('removeMember', () => {
    it('optimistically removes member from list', async () => {
      const mockRemove = vi.fn().mockResolvedValue(okResponse(undefined))
      window.electronAPI.workspace.removeMember = mockRemove

      useMembersStore.setState({ members: MOCK_MEMBERS })

      await useMembersStore.getState().removeMember('ws-test', 'user-3')

      const state = useMembersStore.getState()
      expect(state.members).toHaveLength(2)
      expect(state.members.find((m) => m.id === 'user-3')).toBeUndefined()
    })

    it('throws on IPC failure', async () => {
      const mockRemove = vi.fn().mockResolvedValue(errorResponse('Cannot remove'))
      window.electronAPI.workspace.removeMember = mockRemove

      useMembersStore.setState({ members: MOCK_MEMBERS })

      await expect(
        useMembersStore.getState().removeMember('ws-test', 'user-3'),
      ).rejects.toThrow('Cannot remove')
    })
  })

  describe('getPermissions', () => {
    it('returns admin permissions for admin user', () => {
      useAppStore.getState().setAuthenticated(true, {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin',
      })
      useMembersStore.setState({ members: MOCK_MEMBERS })

      const perm = useMembersStore.getState().getPermissions()
      expect(perm.canEdit).toBe(true)
      expect(perm.canCreate).toBe(true)
      expect(perm.canDelete).toBe(true)
      expect(perm.canManageMembers).toBe(true)
      expect(perm.canManageSettings).toBe(true)
    })

    it('returns editor permissions for editor user', () => {
      useAppStore.getState().setAuthenticated(true, {
        id: 'user-2',
        email: 'editor@example.com',
        name: 'Editor',
      })
      useMembersStore.setState({ members: MOCK_MEMBERS })

      const perm = useMembersStore.getState().getPermissions()
      expect(perm.canEdit).toBe(true)
      expect(perm.canCreate).toBe(true)
      expect(perm.canManageMembers).toBe(false)
      expect(perm.canManageSettings).toBe(false)
    })

    it('returns viewer permissions for viewer user', () => {
      useAppStore.getState().setAuthenticated(true, {
        id: 'user-3',
        email: 'viewer@example.com',
        name: 'Viewer',
      })
      useMembersStore.setState({ members: MOCK_MEMBERS })

      const perm = useMembersStore.getState().getPermissions()
      expect(perm.canEdit).toBe(false)
      expect(perm.canCreate).toBe(false)
      expect(perm.canDelete).toBe(false)
      expect(perm.canComment).toBe(true)
      expect(perm.canManageMembers).toBe(false)
    })

    it('returns viewer permissions when not logged in', () => {
      useAppStore.getState().clearAuth()

      const perm = useMembersStore.getState().getPermissions()
      expect(perm.canEdit).toBe(false)
      expect(perm.canManageMembers).toBe(false)
    })
  })

  describe('isAdmin', () => {
    it('returns true for admin user', () => {
      useAppStore.getState().setAuthenticated(true, {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin',
      })
      useMembersStore.setState({ members: MOCK_MEMBERS })

      expect(useMembersStore.getState().isAdmin()).toBe(true)
    })

    it('returns false for editor user', () => {
      useAppStore.getState().setAuthenticated(true, {
        id: 'user-2',
        email: 'editor@example.com',
        name: 'Editor',
      })
      useMembersStore.setState({ members: MOCK_MEMBERS })

      expect(useMembersStore.getState().isAdmin()).toBe(false)
    })

    it('returns false when not logged in', () => {
      useAppStore.getState().clearAuth()
      expect(useMembersStore.getState().isAdmin()).toBe(false)
    })
  })

  describe('reset', () => {
    it('resets state to initial', () => {
      useMembersStore.setState({
        members: MOCK_MEMBERS,
        isLoading: true,
        error: 'some error',
      })

      useMembersStore.getState().reset()

      const state = useMembersStore.getState()
      expect(state.members).toEqual([])
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })
  })

  describe('selectors', () => {
    it('selectMembers returns members', () => {
      useMembersStore.setState({ members: MOCK_MEMBERS })
      expect(selectMembers(useMembersStore.getState())).toHaveLength(3)
    })

    it('selectIsLoading returns isLoading', () => {
      useMembersStore.setState({ isLoading: true })
      expect(selectIsLoading(useMembersStore.getState())).toBe(true)
    })

    it('selectMembersError returns error', () => {
      useMembersStore.setState({ error: 'test error' })
      expect(selectMembersError(useMembersStore.getState())).toBe('test error')
    })
  })
})
