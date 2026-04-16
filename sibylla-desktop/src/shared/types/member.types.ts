/**
 * Member type definitions shared between main and renderer processes
 *
 * These types are used for workspace member management,
 * role-based permissions, and member invitations.
 */

export type MemberRole = 'admin' | 'editor' | 'viewer'

export interface WorkspaceMember {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly role: MemberRole
  readonly avatarUrl?: string
  readonly joinedAt: string
}

export interface InviteRequest {
  readonly email: string
  readonly role: MemberRole
}

export interface InviteResult {
  readonly success: boolean
  readonly error?: string
}

export interface PermissionCheck {
  readonly canEdit: boolean
  readonly canCreate: boolean
  readonly canDelete: boolean
  readonly canComment: boolean
  readonly canManageMembers: boolean
  readonly canManageSettings: boolean
}

export const ROLE_PERMISSIONS: Record<MemberRole, PermissionCheck> = {
  admin: {
    canEdit: true,
    canCreate: true,
    canDelete: true,
    canComment: true,
    canManageMembers: true,
    canManageSettings: true,
  },
  editor: {
    canEdit: true,
    canCreate: true,
    canDelete: true,
    canComment: true,
    canManageMembers: false,
    canManageSettings: false,
  },
  viewer: {
    canEdit: false,
    canCreate: false,
    canDelete: false,
    canComment: true,
    canManageMembers: false,
    canManageSettings: false,
  },
}
