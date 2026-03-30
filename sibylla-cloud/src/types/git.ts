/**
 * Git service type definitions
 */

// ============ Sibylla Git Repo Types ============

export interface GitRepo {
  id: string
  workspaceId: string
  giteaRepoId: number | null
  giteaOwnerName: string
  giteaRepoName: string
  cloneUrlHttp: string
  cloneUrlSsh: string | null
  defaultBranch: string
  sizeBytes: number
  lastPushAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface GitRepoInfo {
  id: string
  workspaceId: string
  cloneUrlHttp: string
  cloneUrlSsh: string | null
  defaultBranch: string
  sizeBytes: number
  lastPushAt: Date | null
}

export interface CreateRepoParams {
  workspaceId: string
  workspaceName: string
  ownerUserId: string
  ownerEmail: string
}

// ============ Git Access Token Types ============

export interface GitAccessToken {
  id: string
  userId: string
  giteaTokenId: number | null
  tokenName: string
  tokenHash: string
  createdAt: Date
  expiresAt: Date | null
  revokedAt: Date | null
}

// ============ Gitea API Types ============

export interface GiteaUser {
  id: number
  login: string
  email: string
  full_name: string
  avatar_url?: string
}

export interface GiteaRepo {
  id: number
  name: string
  full_name: string
  clone_url: string
  ssh_url: string
  html_url?: string
  default_branch: string
  size: number
  private: boolean
  owner: {
    login: string
  }
}

export interface GiteaAccessToken {
  id: number
  name: string
  sha1: string
}

/**
 * Gitea commit object from API response
 * @see https://gitea.io/en-us/api-usage/ GET /repos/:owner/:repo/git/commits
 */
export interface GiteaCommit {
  sha: string
  message: string
  created: string
  author: {
    name: string
    email: string
    date: string
  }
  committer: {
    name: string
    email: string
    date: string
  }
}
