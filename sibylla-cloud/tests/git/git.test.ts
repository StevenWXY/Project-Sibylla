/**
 * Git service tests
 * Tests Git types and validation
 *
 * Note: Full integration tests require running Gitea service
 */

import { describe, it, expect } from 'vitest'
import type {
  GitRepo,
  GitRepoInfo,
  CreateRepoParams,
  GitAccessToken,
  GiteaUser,
  GiteaRepo,
} from '../../src/types/git.js'

describe('Git Types', () => {
  it('should define GitRepo type', () => {
    const repo: GitRepo = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      workspaceId: '123e4567-e89b-12d3-a456-426614174001',
      giteaRepoId: 1,
      giteaOwnerName: 'sibylla',
      giteaRepoName: 'ws-12345678',
      cloneUrlHttp: 'https://git.sibylla.io/sibylla/ws-12345678.git',
      cloneUrlSsh: null,
      defaultBranch: 'main',
      sizeBytes: 1024,
      lastPushAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    expect(repo.id).toBeDefined()
    expect(repo.workspaceId).toBeDefined()
    expect(repo.cloneUrlHttp).toContain('git')
  })

  it('should define GitRepoInfo type', () => {
    const info: GitRepoInfo = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      workspaceId: '123e4567-e89b-12d3-a456-426614174001',
      cloneUrlHttp: 'https://git.sibylla.io/sibylla/ws-12345678.git',
      cloneUrlSsh: null,
      defaultBranch: 'main',
      sizeBytes: 1024,
      lastPushAt: new Date(),
    }

    expect(info.cloneUrlHttp).toBeDefined()
    expect(info.defaultBranch).toBe('main')
  })

  it('should define CreateRepoParams type', () => {
    const params: CreateRepoParams = {
      workspaceId: '123e4567-e89b-12d3-a456-426614174000',
      workspaceName: 'Test Workspace',
      ownerUserId: '123e4567-e89b-12d3-a456-426614174001',
      ownerEmail: 'owner@example.com',
    }

    expect(params.workspaceId).toBeDefined()
    expect(params.workspaceName).toBeDefined()
    expect(params.ownerUserId).toBeDefined()
    expect(params.ownerEmail).toContain('@')
  })

  it('should define GitAccessToken type', () => {
    const token: GitAccessToken = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      userId: '123e4567-e89b-12d3-a456-426614174001',
      giteaTokenId: 1,
      tokenName: 'sibylla-abc123',
      tokenHash: 'sha256hash',
      createdAt: new Date(),
      expiresAt: null,
      revokedAt: null,
    }

    expect(token.userId).toBeDefined()
    expect(token.tokenName).toContain('sibylla')
  })
})

describe('Gitea Types', () => {
  it('should define GiteaUser type', () => {
    const user: GiteaUser = {
      id: 1,
      login: 'u-abc123',
      email: 'user@example.com',
      full_name: 'Test User',
      avatar_url: 'https://gitea.io/avatar/1',
    }

    expect(user.id).toBe(1)
    expect(user.login).toBeDefined()
  })

  it('should define GiteaRepo type', () => {
    const repo: GiteaRepo = {
      id: 1,
      name: 'ws-12345678',
      full_name: 'sibylla/ws-12345678',
      clone_url: 'https://git.sibylla.io/sibylla/ws-12345678.git',
      ssh_url: 'git@git.sibylla.io:sibylla/ws-12345678.git',
      html_url: 'https://git.sibylla.io/sibylla/ws-12345678',
      default_branch: 'main',
      size: 1024,
      private: true,
      owner: {
        login: 'sibylla',
      },
    }

    expect(repo.id).toBe(1)
    expect(repo.private).toBe(true)
    expect(repo.owner.login).toBe('sibylla')
  })
})

// Note: Git service integration tests require running Gitea and PostgreSQL
// Run with: docker-compose up -d && npm run migrate:up && npm run test
