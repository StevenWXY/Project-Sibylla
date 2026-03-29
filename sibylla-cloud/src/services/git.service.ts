/**
 * Git service
 * Manages Git repositories for workspaces
 */

import { nanoid } from 'nanoid'
import { createHash } from 'crypto'
import { sql } from '../db/client.js'
import { giteaClient } from './gitea.client.js'
import { logger } from '../utils/logger.js'
import type { GitRepoInfo, CreateRepoParams } from '../types/git.js'
import type { WorkspaceMemberRole } from '../types/database.js'

/**
 * Map database row to GitRepoInfo
 */
function mapToGitRepoInfo(row: Record<string, unknown>): GitRepoInfo {
  return {
    id: row['id'] as string,
    workspaceId: row['workspace_id'] as string,
    cloneUrlHttp: row['clone_url_http'] as string,
    cloneUrlSsh: row['clone_url_ssh'] as string | null,
    defaultBranch: row['default_branch'] as string,
    sizeBytes: Number(row['size_bytes']),
    lastPushAt: row['last_push_at'] ? new Date(row['last_push_at'] as string) : null,
  }
}

export function mapRoleToPermission(role: WorkspaceMemberRole): 'read' | 'write' | 'admin' {
  if (role === 'admin') {
    return 'admin'
  }
  if (role === 'editor') {
    return 'write'
  }
  return 'read'
}

export const GitService = {
  /**
   * Create Git repository for a workspace
   * Called when a new workspace is created
   */
  async createWorkspaceRepo(params: CreateRepoParams): Promise<GitRepoInfo> {
    const { workspaceId, workspaceName, ownerUserId, ownerEmail } = params

    // Generate unique repo name
    const repoName = `ws-${workspaceId.slice(0, 8)}`
    const ownerName = 'sibylla' // All repos under sibylla organization

    const existing = await this.getRepoByWorkspace(workspaceId)
    if (existing) {
      return existing
    }

    // Ensure owner user exists in Gitea
    await this.ensureGiteaUser(ownerUserId, ownerEmail)

    // Create repository in Gitea
    const giteaRepo = await giteaClient.createRepo({
      owner: ownerName,
      name: repoName,
      description: `Sibylla workspace: ${workspaceName}`,
      isPrivate: true,
    })

    let result
    try {
      result = await sql`
        INSERT INTO git_repos (
          workspace_id, gitea_repo_id, gitea_owner_name, gitea_repo_name,
          clone_url_http, clone_url_ssh, default_branch
        )
        VALUES (
          ${workspaceId}, ${giteaRepo.id}, ${ownerName}, ${repoName},
          ${giteaRepo.clone_url}, ${giteaRepo.ssh_url || null}, ${giteaRepo.default_branch}
        )
        RETURNING id, workspace_id, clone_url_http, clone_url_ssh,
                  default_branch, size_bytes, last_push_at
      `
    } catch (error) {
      logger.error(
        { error, workspaceId, giteaRepoId: giteaRepo.id },
        'Failed to persist repository metadata, attempting compensation'
      )
      try {
        await giteaClient.deleteRepo(ownerName, repoName)
      } catch (compensationError) {
        logger.error(
          { compensationError, workspaceId, giteaRepoId: giteaRepo.id },
          'Compensation failed while deleting orphan Gitea repository'
        )
      }
      throw error
    }

    logger.info({ workspaceId, repoName }, 'Created workspace Git repository')

    return mapToGitRepoInfo(result[0] as Record<string, unknown>)
  },

  /**
   * Delete workspace repository
   */
  async deleteWorkspaceRepo(workspaceId: string): Promise<void> {
    const repo = await this.getRepoByWorkspace(workspaceId)
    if (!repo) return

    // Get repo details
    const result = await sql`
      SELECT gitea_owner_name, gitea_repo_name
      FROM git_repos
      WHERE workspace_id = ${workspaceId}
    `

    const record = result[0] as Record<string, unknown> | undefined
    if (record) {
      const ownerName = record['gitea_owner_name'] as string
      const repoNameStr = record['gitea_repo_name'] as string

      // Delete from Gitea
      try {
        await giteaClient.deleteRepo(ownerName, repoNameStr)
      } catch (error) {
        logger.error({ error, workspaceId }, 'Failed to delete Gitea repo')
      }

      // Delete from database
      await sql`
        DELETE FROM git_repos
        WHERE workspace_id = ${workspaceId}
      `

      logger.info({ workspaceId }, 'Deleted workspace Git repository')
    }
  },

  /**
   * Get repository info by workspace ID
   */
  async getRepoByWorkspace(workspaceId: string): Promise<GitRepoInfo | null> {
    const result = await sql`
      SELECT id, workspace_id, clone_url_http, clone_url_ssh,
             default_branch, size_bytes, last_push_at
      FROM git_repos
      WHERE workspace_id = ${workspaceId}
    `

    return result[0] ? mapToGitRepoInfo(result[0] as Record<string, unknown>) : null
  },

  /**
   * Add user as collaborator to workspace repository
   * Called when user joins a workspace
   */
  async addCollaborator(
    workspaceId: string,
    userId: string,
    email: string,
    role: WorkspaceMemberRole
  ): Promise<void> {
    // Get repo info
    const result = await sql`
      SELECT gitea_owner_name, gitea_repo_name
      FROM git_repos
      WHERE workspace_id = ${workspaceId}
    `

    const record = result[0] as Record<string, unknown> | undefined
    if (!record) {
      throw new Error('Repository not found for workspace')
    }

    const ownerName = record['gitea_owner_name'] as string
    const repoNameStr = record['gitea_repo_name'] as string

    // Ensure user exists in Gitea
    const giteaUsername = await this.ensureGiteaUser(userId, email)

    // Map Sibylla role to Gitea permission
    const permission = mapRoleToPermission(role)

    // Add collaborator in Gitea
    await giteaClient.addCollaborator(ownerName, repoNameStr, giteaUsername, permission)

    logger.info({ workspaceId, userId, role }, 'Added collaborator to repository')
  },

  /**
   * Remove user from workspace repository
   */
  async removeCollaborator(workspaceId: string, userId: string): Promise<void> {
    const result = await sql`
      SELECT gr.gitea_owner_name, gr.gitea_repo_name
      FROM git_repos gr
      WHERE gr.workspace_id = ${workspaceId}
    `

    const record = result[0] as Record<string, unknown> | undefined
    if (!record) return

    const ownerName = record['gitea_owner_name'] as string
    const repoNameStr = record['gitea_repo_name'] as string

    // Get Gitea username for user
    const giteaUsername = this.generateGiteaUsername(userId)

    try {
      await giteaClient.removeCollaborator(ownerName, repoNameStr, giteaUsername)
    } catch (error) {
      logger.error({ error, workspaceId, userId }, 'Failed to remove collaborator')
    }

    logger.info({ workspaceId, userId }, 'Removed collaborator from repository')
  },

  /**
   * Generate Git access token for user
   * Used by client for Git operations
   */
  async generateAccessToken(userId: string): Promise<string> {
    const giteaUsername = this.generateGiteaUsername(userId)
    const tokenName = `sibylla-${nanoid(8)}`

    // Create token in Gitea
    const giteaToken = await giteaClient.createAccessToken(giteaUsername, tokenName)

    // Store token info (hash only)
    const tokenHash = createHash('sha256').update(giteaToken.sha1).digest('hex')

    await sql`
      INSERT INTO git_access_tokens (user_id, gitea_token_id, token_name, token_hash)
      VALUES (${userId}, ${giteaToken.id}, ${tokenName}, ${tokenHash})
    `

    logger.info({ userId }, 'Generated Git access token')

    // Return the actual token (only time it's available)
    return giteaToken.sha1
  },

  /**
   * Revoke all Git access tokens for user
   */
  async revokeAccessTokens(userId: string): Promise<void> {
    const giteaUsername = this.generateGiteaUsername(userId)

    // Get all tokens
    const tokens = await sql`
      SELECT gitea_token_id
      FROM git_access_tokens
      WHERE user_id = ${userId} AND revoked_at IS NULL
    `

    // Revoke in Gitea
    for (const token of tokens) {
      const record = token as Record<string, unknown>
      try {
        await giteaClient.deleteAccessToken(giteaUsername, record['gitea_token_id'] as number)
      } catch (error) {
        logger.error({ error, userId }, 'Failed to delete Gitea token')
      }
    }

    // Mark as revoked in database
    await sql`
      UPDATE git_access_tokens
      SET revoked_at = NOW()
      WHERE user_id = ${userId} AND revoked_at IS NULL
    `

    logger.info({ userId }, 'Revoked all Git access tokens')
  },

  /**
   * Ensure user exists in Gitea
   */
  async ensureGiteaUser(userId: string, email: string): Promise<string> {
    const username = this.generateGiteaUsername(userId)

    // Check if user exists
    const existing = await giteaClient.getUser(username)
    if (existing) return username

    // Create user with random password (they'll use tokens)
    const password = nanoid(32)
    const emailName = email.split('@')[0] || 'user'

    await giteaClient.createUser({
      username,
      email,
      fullName: emailName,
      password,
    })

    return username
  },

  /**
   * Generate Gitea username from Sibylla user ID
   */
  generateGiteaUsername(userId: string): string {
    // Use first 16 chars of user ID to keep it short
    return `u-${userId.replace(/-/g, '').slice(0, 16)}`
  },
}
