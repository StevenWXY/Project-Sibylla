/**
 * Workspace member model
 * Database operations for workspace_members table
 */

import { sql } from '../db/client.js'
import type {
  WorkspaceMember,
  WorkspaceMemberWithUser,
  AddWorkspaceMemberInput,
  WorkspaceMemberRole,
} from '../types/database.js'

/**
 * Map database row to WorkspaceMember type
 */
function mapToMember(row: Record<string, unknown>): WorkspaceMember {
  return {
    id: row['id'] as string,
    userId: row['user_id'] as string,
    workspaceId: row['workspace_id'] as string,
    role: row['role'] as WorkspaceMemberRole,
    joinedAt: new Date(row['joined_at'] as string),
  }
}

/**
 * Map database row to WorkspaceMemberWithUser type
 */
function mapToMemberWithUser(row: Record<string, unknown>): WorkspaceMemberWithUser {
  return {
    id: row['id'] as string,
    userId: row['user_id'] as string,
    workspaceId: row['workspace_id'] as string,
    role: row['role'] as WorkspaceMemberRole,
    joinedAt: new Date(row['joined_at'] as string),
    user: {
      id: row['user_id'] as string,
      email: row['email'] as string,
      name: row['name'] as string,
      avatarUrl: row['avatar_url'] as string | null,
    },
  }
}

export const MemberModel = {
  /**
   * Find member by user and workspace
   */
  async findByUserAndWorkspace(
    userId: string,
    workspaceId: string
  ): Promise<WorkspaceMember | null> {
    const result = await sql`
      SELECT id, user_id, workspace_id, role, joined_at
      FROM workspace_members
      WHERE user_id = ${userId} AND workspace_id = ${workspaceId}
    `
    return result[0] ? mapToMember(result[0] as Record<string, unknown>) : null
  },

  /**
   * Find all members of a workspace
   */
  async findByWorkspace(workspaceId: string): Promise<WorkspaceMemberWithUser[]> {
    const result = await sql`
      SELECT wm.id, wm.user_id, wm.workspace_id, wm.role, wm.joined_at,
             u.email, u.name, u.avatar_url
      FROM workspace_members wm
      INNER JOIN users u ON wm.user_id = u.id
      WHERE wm.workspace_id = ${workspaceId}
      ORDER BY wm.joined_at
    `
    return result.map((row) => mapToMemberWithUser(row as Record<string, unknown>))
  },

  /**
   * Add a member to workspace
   */
  async add(input: AddWorkspaceMemberInput): Promise<WorkspaceMember> {
    const result = await sql`
      INSERT INTO workspace_members (user_id, workspace_id, role)
      VALUES (${input.userId}, ${input.workspaceId}, ${input.role || 'editor'})
      RETURNING id, user_id, workspace_id, role, joined_at
    `
    return mapToMember(result[0] as Record<string, unknown>)
  },

  /**
   * Update member role
   */
  async updateRole(
    userId: string,
    workspaceId: string,
    role: WorkspaceMemberRole
  ): Promise<WorkspaceMember | null> {
    const result = await sql`
      UPDATE workspace_members
      SET role = ${role}
      WHERE user_id = ${userId} AND workspace_id = ${workspaceId}
      RETURNING id, user_id, workspace_id, role, joined_at
    `
    return result[0] ? mapToMember(result[0] as Record<string, unknown>) : null
  },

  /**
   * Remove member from workspace
   */
  async remove(userId: string, workspaceId: string): Promise<boolean> {
    const result = await sql`
      DELETE FROM workspace_members
      WHERE user_id = ${userId} AND workspace_id = ${workspaceId}
      RETURNING id
    `
    return result.length > 0
  },

  /**
   * Check if user has access to workspace
   */
  async hasAccess(userId: string, workspaceId: string): Promise<boolean> {
    const result = await sql`
      SELECT 1 FROM workspace_members
      WHERE user_id = ${userId} AND workspace_id = ${workspaceId}
    `
    return result.length > 0
  },

  /**
   * Check if user has specific role in workspace
   */
  async hasRole(
    userId: string,
    workspaceId: string,
    roles: WorkspaceMemberRole[]
  ): Promise<boolean> {
    const result = await sql`
      SELECT 1 FROM workspace_members
      WHERE user_id = ${userId}
        AND workspace_id = ${workspaceId}
        AND role = ANY(${roles})
    `
    return result.length > 0
  },
}
