/**
 * Members Store — Zustand state management for workspace members
 *
 * Manages member list, invitations, role changes, and permission checks.
 * IPC calls are encapsulated in actions — components never call
 * window.electronAPI directly for member operations.
 *
 * Design decisions:
 * - IPC calls inside actions (same pattern as conflictStore)
 * - Optimistic updates for updateRole and removeMember
 * - Cross-store read from appStore for currentUser (getState sync read)
 * - No persist middleware (members fetched from cloud API)
 * - devtools middleware for debugging
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type {
  MemberRole,
  WorkspaceMember,
  InviteRequest,
  InviteResult,
  PermissionCheck,
} from '../../shared/types'
import { ROLE_PERMISSIONS } from '../../shared/types'
import { useAppStore } from './appStore'

interface MembersState {
  readonly members: readonly WorkspaceMember[]
  readonly isLoading: boolean
  readonly error: string | null
}

interface MembersActions {
  loadMembers: (workspaceId: string) => Promise<void>
  inviteMember: (workspaceId: string, email: string, role: MemberRole) => Promise<InviteResult>
  updateRole: (workspaceId: string, userId: string, role: MemberRole) => Promise<void>
  removeMember: (workspaceId: string, userId: string) => Promise<void>
  getPermissions: () => PermissionCheck
  isAdmin: () => boolean
  reset: () => void
}

type MembersStore = MembersState & MembersActions

const initialState: MembersState = {
  members: [],
  isLoading: false,
  error: null,
}

export const useMembersStore = create<MembersStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      loadMembers: async (workspaceId) => {
        set({ isLoading: true, error: null }, false, 'members/loadStart')

        try {
          const response = await window.electronAPI.workspace.getMembers(workspaceId)

          if (!response.success) {
            set(
              { error: response.error?.message ?? '加载成员失败', isLoading: false },
              false,
              'members/loadError',
            )
            return
          }

          set({ members: response.data ?? [], isLoading: false }, false, 'members/loadSuccess')
        } catch (error: unknown) {
          set(
            {
              error: error instanceof Error ? error.message : '加载成员失败',
              isLoading: false,
            },
            false,
            'members/loadException',
          )
        }
      },

      inviteMember: async (workspaceId, email, role) => {
        const request: InviteRequest = { email, role }

        const response = await window.electronAPI.workspace.inviteMember(workspaceId, request)

        if (!response.success) {
          return { success: false, error: response.error?.message ?? '邀请失败' }
        }

        const result = response.data ?? { success: true }
        if (result.success) {
          await get().loadMembers(workspaceId)
        }

        return result
      },

      updateRole: async (workspaceId, userId, role) => {
        const response = await window.electronAPI.workspace.updateMemberRole(workspaceId, userId, role)

        if (!response.success) {
          throw new Error(response.error?.message ?? '更新角色失败')
        }

        set(
          (state) => ({
            members: state.members.map((m) =>
              m.id === userId ? { ...m, role } : m,
            ),
          }),
          false,
          'members/updateRole',
        )
      },

      removeMember: async (workspaceId, userId) => {
        const response = await window.electronAPI.workspace.removeMember(workspaceId, userId)

        if (!response.success) {
          throw new Error(response.error?.message ?? '移除成员失败')
        }

        set(
          (state) => ({
            members: state.members.filter((m) => m.id !== userId),
          }),
          false,
          'members/removeMember',
        )
      },

      getPermissions: () => {
        const currentUser = useAppStore.getState().currentUser
        if (!currentUser) {
          return ROLE_PERMISSIONS.viewer
        }

        const member = get().members.find((m) => m.id === currentUser.id)
        const role = member?.role ?? 'viewer'
        return ROLE_PERMISSIONS[role]
      },

      isAdmin: () => {
        const currentUser = useAppStore.getState().currentUser
        if (!currentUser) return false

        const member = get().members.find((m) => m.id === currentUser.id)
        return member?.role === 'admin'
      },

      reset: () => set(initialState, false, 'members/reset'),
    }),
    { name: 'MembersStore' },
  ),
)

export const selectMembers = (state: MembersStore) => state.members
export const selectIsLoading = (state: MembersStore) => state.isLoading
export const selectMembersError = (state: MembersStore) => state.error
