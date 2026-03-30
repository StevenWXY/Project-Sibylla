/**
 * Database type definitions
 * Types for database models
 */

// ============ User Types ============

export interface User {
  id: string
  email: string
  passwordHash: string
  name: string
  avatarUrl: string | null
  /** Phase 1+: Email verification flow not yet implemented. Field reserved for forward compatibility. */
  emailVerified: boolean
  lastLoginAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateUserInput {
  email: string
  passwordHash: string
  name: string
  avatarUrl?: string
}

export interface UpdateUserInput {
  name?: string
  avatarUrl?: string
  /** Phase 1+: Updating email_verified is reserved for future verification flow */
  emailVerified?: boolean
}

// ============ Workspace Types ============

export type GitProvider = 'sibylla' | 'github' | 'gitlab'

export interface Workspace {
  id: string
  name: string
  description: string | null
  icon: string | null
  gitProvider: GitProvider
  gitRemoteUrl: string | null
  defaultModel: string
  syncInterval: number
  createdAt: Date
  updatedAt: Date
}

export interface CreateWorkspaceInput {
  name: string
  description?: string
  icon?: string
  gitProvider?: GitProvider
  gitRemoteUrl?: string
  defaultModel?: string
  syncInterval?: number
}

export interface UpdateWorkspaceInput {
  name?: string
  /** Set to null to clear, omit to keep current value */
  description?: string | null
  /** Set to null to clear, omit to keep current value */
  icon?: string | null
  gitProvider?: GitProvider
  /** Set to null to clear, omit to keep current value */
  gitRemoteUrl?: string | null
  defaultModel?: string
  syncInterval?: number
}

// ============ Workspace Member Types ============

export type WorkspaceMemberRole = 'admin' | 'editor' | 'viewer'

export interface WorkspaceMember {
  id: string
  userId: string
  workspaceId: string
  role: WorkspaceMemberRole
  joinedAt: Date
}

export interface WorkspaceMemberWithUser extends WorkspaceMember {
  user: {
    id: string
    email: string
    name: string
    avatarUrl: string | null
  }
}

export interface AddWorkspaceMemberInput {
  userId: string
  workspaceId: string
  role?: WorkspaceMemberRole
}

// ============ Refresh Token Types ============

export interface RefreshToken {
  id: string
  userId: string
  tokenHash: string
  expiresAt: Date
  createdAt: Date
  revokedAt: Date | null
  userAgent: string | null
  ipAddress: string | null
}
