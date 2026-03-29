/**
 * Gitea API client
 * Communicates with Gitea for Git repository management
 */

import { config } from '../config/index.js'
import { logger } from '../utils/logger.js'
import type { GiteaUser, GiteaRepo, GiteaAccessToken } from '../types/git.js'

export class GiteaClient {
  private baseUrl: string
  private adminToken: string

  constructor() {
    this.baseUrl = config.gitea.url
    this.adminToken = config.gitea.adminToken
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    token?: string
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`
    const authToken = token || this.adminToken

    const init: RequestInit = {
      method,
      headers: {
        Authorization: `token ${authToken}`,
        'Content-Type': 'application/json',
      },
    }

    if (body !== undefined) {
      init.body = JSON.stringify(body)
    }

    const response = await fetch(url, init)

    if (!response.ok) {
      const error = await response.text()
      logger.error({ status: response.status, error, path }, 'Gitea API error')
      throw new Error(`Gitea API error: ${response.status} - ${error}`)
    }

    if (response.status === 204) {
      return undefined as T
    }

    return (await response.json()) as T
  }

  // ========== User Management ==========

  /**
   * Create a Gitea user for Sibylla user
   */
  async createUser(params: {
    username: string
    email: string
    fullName: string
    password: string
  }): Promise<GiteaUser> {
    return await this.request<GiteaUser>('POST', '/admin/users', {
      username: params.username,
      email: params.email,
      full_name: params.fullName,
      password: params.password,
      must_change_password: false,
      visibility: 'private',
    })
  }

  /**
   * Get user by username
   */
  async getUser(username: string): Promise<GiteaUser | null> {
    try {
      return await this.request<GiteaUser>('GET', `/users/${username}`)
    } catch {
      return null
    }
  }

  /**
   * Delete a Gitea user
   */
  async deleteUser(username: string): Promise<void> {
    await this.request<void>('DELETE', `/admin/users/${username}`)
  }

  // ========== Repository Management ==========

  /**
   * Create a repository for workspace
   */
  async createRepo(params: {
    owner: string
    name: string
    description?: string
    isPrivate?: boolean
  }): Promise<GiteaRepo> {
    return await this.request<GiteaRepo>('POST', `/admin/users/${params.owner}/repos`, {
      name: params.name,
      description: params.description || '',
      private: params.isPrivate ?? true,
      auto_init: true,
      default_branch: 'main',
      readme: 'Default',
    })
  }

  /**
   * Get repository info
   */
  async getRepo(owner: string, repo: string): Promise<GiteaRepo | null> {
    try {
      return await this.request<GiteaRepo>('GET', `/repos/${owner}/${repo}`)
    } catch {
      return null
    }
  }

  /**
   * Delete a repository
   */
  async deleteRepo(owner: string, repo: string): Promise<void> {
    await this.request<void>('DELETE', `/repos/${owner}/${repo}`)
  }

  // ========== Collaborator Management ==========

  /**
   * Add collaborator to repository
   */
  async addCollaborator(
    owner: string,
    repo: string,
    username: string,
    permission: 'read' | 'write' | 'admin'
  ): Promise<void> {
    await this.request<void>('PUT', `/repos/${owner}/${repo}/collaborators/${username}`, {
      permission,
    })
  }

  /**
   * Remove collaborator from repository
   */
  async removeCollaborator(owner: string, repo: string, username: string): Promise<void> {
    await this.request<void>('DELETE', `/repos/${owner}/${repo}/collaborators/${username}`)
  }

  // ========== Access Token Management ==========

  /**
   * Create access token for user
   */
  async createAccessToken(username: string, tokenName: string): Promise<GiteaAccessToken> {
    return await this.request<GiteaAccessToken>('POST', `/users/${username}/tokens`, {
      name: tokenName,
      scopes: ['write:repository'],
    })
  }

  /**
   * Delete access token
   */
  async deleteAccessToken(username: string, tokenId: number): Promise<void> {
    await this.request<void>('DELETE', `/users/${username}/tokens/${tokenId}`)
  }
}

// Singleton instance
export const giteaClient = new GiteaClient()
