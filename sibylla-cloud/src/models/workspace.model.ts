/**
 * Workspace model
 * Database operations for workspaces table
 */

import { sql } from '../db/client.js'
import type {
  Workspace,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  GitProvider,
} from '../types/database.js'

/**
 * Map database row to Workspace type
 */
function mapToWorkspace(row: Record<string, unknown>): Workspace {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    description: row['description'] as string | null,
    icon: row['icon'] as string | null,
    gitProvider: row['git_provider'] as GitProvider,
    gitRemoteUrl: row['git_remote_url'] as string | null,
    defaultModel: row['default_model'] as string,
    syncInterval: row['sync_interval'] as number,
    createdAt: new Date(row['created_at'] as string),
    updatedAt: new Date(row['updated_at'] as string),
  }
}

export const WorkspaceModel = {
  /**
   * Find workspace by ID
   */
  async findById(id: string): Promise<Workspace | null> {
    const result = await sql`
      SELECT id, name, description, icon, git_provider, git_remote_url,
             default_model, sync_interval, created_at, updated_at
      FROM workspaces
      WHERE id = ${id}
    `
    return result[0] ? mapToWorkspace(result[0] as Record<string, unknown>) : null
  },

  /**
   * Find all workspaces for a user
   */
  async findByUserId(userId: string): Promise<Workspace[]> {
    const result = await sql`
      SELECT w.id, w.name, w.description, w.icon, w.git_provider, w.git_remote_url,
             w.default_model, w.sync_interval, w.created_at, w.updated_at
      FROM workspaces w
      INNER JOIN workspace_members wm ON w.id = wm.workspace_id
      WHERE wm.user_id = ${userId}
      ORDER BY w.created_at DESC
    `
    return result.map((row) => mapToWorkspace(row as Record<string, unknown>))
  },

  /**
   * Create a new workspace
   */
  async create(input: CreateWorkspaceInput): Promise<Workspace> {
    const result = await sql`
      INSERT INTO workspaces (name, description, icon, git_provider, git_remote_url,
                              default_model, sync_interval)
      VALUES (${input.name}, ${input.description || null}, ${input.icon || null},
              ${input.gitProvider || 'sibylla'}, ${input.gitRemoteUrl || null},
              ${input.defaultModel || 'claude-3-opus'}, ${input.syncInterval || 30})
      RETURNING id, name, description, icon, git_provider, git_remote_url,
                default_model, sync_interval, created_at, updated_at
    `
    return mapToWorkspace(result[0] as Record<string, unknown>)
  },

  /**
   * Update workspace
   */
  async update(id: string, input: UpdateWorkspaceInput): Promise<Workspace | null> {
    const name = input.name ?? null
    const description = input.description ?? null
    const icon = input.icon ?? null
    const gitProvider = input.gitProvider ?? null
    const gitRemoteUrl = input.gitRemoteUrl ?? null
    const defaultModel = input.defaultModel ?? null
    const syncInterval = input.syncInterval ?? null

    const result = await sql`
      UPDATE workspaces
      SET name = COALESCE(${name}, name),
          description = COALESCE(${description}, description),
          icon = COALESCE(${icon}, icon),
          git_provider = COALESCE(${gitProvider}, git_provider),
          git_remote_url = COALESCE(${gitRemoteUrl}, git_remote_url),
          default_model = COALESCE(${defaultModel}, default_model),
          sync_interval = COALESCE(${syncInterval}, sync_interval),
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, name, description, icon, git_provider, git_remote_url,
                default_model, sync_interval, created_at, updated_at
    `
    return result[0] ? mapToWorkspace(result[0] as Record<string, unknown>) : null
  },

  /**
   * Delete workspace
   */
  async delete(id: string): Promise<boolean> {
    const result = await sql`
      DELETE FROM workspaces
      WHERE id = ${id}
      RETURNING id
    `
    return result.length > 0
  },
}
