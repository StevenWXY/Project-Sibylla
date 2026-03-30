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
              ${input.defaultModel || 'claude-sonnet-4-20250514'}, ${input.syncInterval || 30})
      RETURNING id, name, description, icon, git_provider, git_remote_url,
                default_model, sync_interval, created_at, updated_at
    `
    return mapToWorkspace(result[0] as Record<string, unknown>)
  },

  /**
   * Update workspace
   *
   * Uses explicit CASE WHEN expressions instead of COALESCE to correctly
   * support setting nullable fields (description, icon, gitRemoteUrl) to NULL.
   * Fields not present in the input are left unchanged.
   */
  async update(id: string, input: UpdateWorkspaceInput): Promise<Workspace | null> {
    // Distinguish "field provided (possibly null)" from "field not provided (undefined)"
    // - 'key' in input && input[key] === undefined  →  not provided, keep current
    // - 'key' in input && input[key] === null        →  explicitly set to NULL
    // - 'key' in input && input[key] === 'value'     →  set to new value
    const nameProvided = 'name' in input
    const descriptionProvided = 'description' in input
    const iconProvided = 'icon' in input
    const gitProviderProvided = 'gitProvider' in input
    const gitRemoteUrlProvided = 'gitRemoteUrl' in input
    const defaultModelProvided = 'defaultModel' in input
    const syncIntervalProvided = 'syncInterval' in input

    const result = await sql`
      UPDATE workspaces
      SET name = CASE WHEN ${nameProvided} THEN ${input.name ?? null} ELSE name END,
          description = CASE WHEN ${descriptionProvided} THEN ${input.description ?? null} ELSE description END,
          icon = CASE WHEN ${iconProvided} THEN ${input.icon ?? null} ELSE icon END,
          git_provider = CASE WHEN ${gitProviderProvided} THEN ${input.gitProvider ?? null} ELSE git_provider END,
          git_remote_url = CASE WHEN ${gitRemoteUrlProvided} THEN ${input.gitRemoteUrl ?? null} ELSE git_remote_url END,
          default_model = CASE WHEN ${defaultModelProvided} THEN ${input.defaultModel ?? null} ELSE default_model END,
          sync_interval = CASE WHEN ${syncIntervalProvided} THEN ${input.syncInterval ?? null} ELSE sync_interval END,
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
