# Git 托管服务配置

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE0-TASK007 |
| **任务标题** | Git 托管服务配置 |
| **所属阶段** | Phase 0 - 基础设施搭建 |
| **优先级** | P0 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

配置和集成 Gitea 作为 Sibylla 的自托管 Git 服务，实现 workspace 的 Git 仓库自动创建、用户权限同步，为客户端的 Git 操作（clone、push、pull）提供后端支持。

### 背景

Sibylla 采用 Git 作为底层同步机制，但对用户隐藏 Git 概念。云端需要托管 Git 仓库，支持两种模式：
1. **Sibylla 自托管**（默认）：使用 Gitea 托管，面向非技术用户
2. **用户自带 GitHub**（可选）：用户连接自己的 GitHub 仓库，面向技术用户

本任务聚焦于 Sibylla 自托管模式的 Gitea 配置和集成。

### 范围

**包含：**
- Gitea 服务 Docker 配置
- Gitea Admin API 集成（创建用户、仓库、权限）
- Workspace 创建时自动创建 Git 仓库
- 用户加入 Workspace 时同步 Git 权限
- Git HTTP/HTTPS 访问认证代理
- 仓库信息查询 API

**不包含：**
- 客户端 Git 操作实现（TASK010）
- GitHub 集成（后续迭代）
- Git LFS 配置（后续迭代）
- Webhook 通知（后续迭代）

## 技术要求

### 技术栈

- **Gitea:** 1.21.x（轻量级 Git 托管）
- **Docker:** 用于运行 Gitea
- **HTTP Proxy:** 用于 Git 认证代理

### 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    Sibylla Cloud                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐     ┌─────────────────┐                  │
│  │  Sibylla API │────>│ Git Service     │                  │
│  │  (Fastify)   │     │ (Gitea 集成)    │                  │
│  └──────────────┘     └─────────────────┘                  │
│         │                     │                             │
│         │                     │ Gitea Admin API             │
│         │                     ▼                             │
│         │           ┌─────────────────┐                    │
│         └──────────>│     Gitea       │<──── Client        │
│           Auth      │   (Git 托管)     │     (git clone)   │
│           Proxy     └─────────────────┘                    │
│                             │                               │
│                             ▼                               │
│                     ┌─────────────────┐                    │
│                     │  Git Repos      │                    │
│                     │  (文件存储)      │                    │
│                     └─────────────────┘                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**目录结构：**

```
sibylla-cloud/
├── src/
│   ├── services/
│   │   └── git.service.ts         # Git 服务（Gitea 集成）
│   ├── routes/
│   │   └── git.ts                 # Git 相关路由
│   └── types/
│       └── git.ts                 # Git 相关类型
├── migrations/
│   └── 007_create_git_repos.sql   # Git 仓库表
└── docker/
    └── gitea/
        └── app.ini                # Gitea 配置
```

### 实现细节

#### 关键实现点

1. **Docker Compose Gitea 配置**
   ```yaml
   # docker-compose.yml (追加)
   services:
     gitea:
       image: gitea/gitea:1.21
       container_name: sibylla-gitea
       environment:
         - USER_UID=1000
         - USER_GID=1000
         - GITEA__database__DB_TYPE=postgres
         - GITEA__database__HOST=postgres:5432
         - GITEA__database__NAME=gitea
         - GITEA__database__USER=gitea
         - GITEA__database__PASSWD=gitea
         - GITEA__server__ROOT_URL=https://git.sibylla.io/
         - GITEA__server__HTTP_PORT=3001
         - GITEA__server__DISABLE_SSH=true
         - GITEA__security__INSTALL_LOCK=true
         - GITEA__service__DISABLE_REGISTRATION=true
         - GITEA__service__REQUIRE_SIGNIN_VIEW=true
         - GITEA__api__ENABLE_SWAGGER=false
       volumes:
         - gitea_data:/data
         - gitea_config:/etc/gitea
       ports:
         - "3001:3001"
       depends_on:
         postgres:
           condition: service_healthy
       restart: unless-stopped
       networks:
         - sibylla-network

     # 需要为 Gitea 创建单独的数据库
     postgres:
       environment:
         # 添加 Gitea 数据库
         POSTGRES_MULTIPLE_DATABASES: sibylla,gitea

   volumes:
     gitea_data:
     gitea_config:

   networks:
     sibylla-network:
       driver: bridge
   ```

2. **Git 仓库表（migrations/007_create_git_repos.sql）**
   ```sql
   -- Create git_repos table for tracking workspace Git repositories
   
   CREATE TABLE git_repos (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
       
       -- Gitea internal info
       gitea_repo_id INTEGER,
       gitea_owner_name VARCHAR(100) NOT NULL,    -- Gitea organization or user
       gitea_repo_name VARCHAR(100) NOT NULL,     -- Repository name
       
       -- Git URLs
       clone_url_http TEXT NOT NULL,
       clone_url_ssh TEXT,
       
       -- Metadata
       default_branch VARCHAR(100) DEFAULT 'main',
       size_bytes BIGINT DEFAULT 0,
       last_push_at TIMESTAMP WITH TIME ZONE,
       
       -- Timestamps
       created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
       updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
       
       UNIQUE(workspace_id),
       UNIQUE(gitea_owner_name, gitea_repo_name)
   );
   
   -- Indexes
   CREATE INDEX idx_git_repos_workspace ON git_repos(workspace_id);
   
   -- Trigger for updated_at
   CREATE TRIGGER update_git_repos_updated_at
       BEFORE UPDATE ON git_repos
       FOR EACH ROW
       EXECUTE FUNCTION update_updated_at_column();
   
   -- Track user access tokens for Git operations
   CREATE TABLE git_access_tokens (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       
       -- Token info (encrypted)
       gitea_token_id INTEGER,
       token_name VARCHAR(100) NOT NULL,
       token_hash VARCHAR(64) NOT NULL,          -- For revocation lookup
       
       -- Timestamps
       created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
       expires_at TIMESTAMP WITH TIME ZONE,
       revoked_at TIMESTAMP WITH TIME ZONE
   );
   
   CREATE INDEX idx_git_access_tokens_user ON git_access_tokens(user_id);
   
   COMMENT ON TABLE git_repos IS 'Git repositories for workspaces (Gitea integration)';
   COMMENT ON TABLE git_access_tokens IS 'User access tokens for Git operations';
   ```

3. **Gitea 客户端（src/services/gitea.client.ts）**
   ```typescript
   import { config } from '../config'
   import { logger } from '../utils/logger'

   interface GiteaUser {
     id: number
     login: string
     email: string
     full_name: string
   }

   interface GiteaRepo {
     id: number
     name: string
     full_name: string
     clone_url: string
     ssh_url: string
     default_branch: string
     size: number
   }

   interface GiteaAccessToken {
     id: number
     name: string
     sha1: string
   }

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

       const response = await fetch(url, {
         method,
         headers: {
           'Authorization': `token ${authToken}`,
           'Content-Type': 'application/json'
         },
         body: body ? JSON.stringify(body) : undefined
       })

       if (!response.ok) {
         const error = await response.text()
         logger.error({ status: response.status, error, path }, 'Gitea API error')
         throw new Error(`Gitea API error: ${response.status} - ${error}`)
       }

       if (response.status === 204) {
         return undefined as T
       }

       return await response.json() as T
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
         visibility: 'private'
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
         readme: 'Default'
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
         permission
       })
     }

     /**
      * Remove collaborator from repository
      */
     async removeCollaborator(
       owner: string,
       repo: string,
       username: string
     ): Promise<void> {
       await this.request<void>('DELETE', `/repos/${owner}/${repo}/collaborators/${username}`)
     }

     // ========== Access Token Management ==========

     /**
      * Create access token for user
      */
     async createAccessToken(
       username: string,
       tokenName: string
     ): Promise<GiteaAccessToken> {
       return await this.request<GiteaAccessToken>(
         'POST',
         `/users/${username}/tokens`,
         {
           name: tokenName,
           scopes: ['write:repository']
         }
       )
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
   ```

4. **Git 服务（src/services/git.service.ts）**
   ```typescript
   import { nanoid } from 'nanoid'
   import { createHash } from 'crypto'
   import { sql } from '../db/client'
   import { withTransaction } from '../db/transaction'
   import { giteaClient } from './gitea.client'
   import { config } from '../config'
   import { logger } from '../utils/logger'

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

   export const GitService = {
     /**
      * Create Git repository for a workspace
      * Called when a new workspace is created
      */
     async createWorkspaceRepo(params: CreateRepoParams): Promise<GitRepoInfo> {
       const { workspaceId, workspaceName, ownerUserId, ownerEmail } = params

       // Generate unique repo name
       const repoName = `ws-${workspaceId.slice(0, 8)}`
       const ownerName = `sibylla`  // All repos under sibylla organization

       return await withTransaction(async (tx) => {
         // Ensure owner user exists in Gitea
         await this.ensureGiteaUser(ownerUserId, ownerEmail)

         // Create repository in Gitea
         const giteaRepo = await giteaClient.createRepo({
           owner: ownerName,
           name: repoName,
           description: `Sibylla workspace: ${workspaceName}`,
           isPrivate: true
         })

         // Store repo info in database
         const result = await tx`
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

         logger.info({ workspaceId, repoName }, 'Created workspace Git repository')

         return mapToGitRepoInfo(result[0])
       })
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

       if (result[0]) {
         const { gitea_owner_name, gitea_repo_name } = result[0] as Record<string, string>

         // Delete from Gitea
         await giteaClient.deleteRepo(gitea_owner_name, gitea_repo_name)

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

       return result[0] ? mapToGitRepoInfo(result[0]) : null
     },

     /**
      * Add user as collaborator to workspace repository
      * Called when user joins a workspace
      */
     async addCollaborator(
       workspaceId: string,
       userId: string,
       email: string,
       role: 'admin' | 'editor' | 'viewer'
     ): Promise<void> {
       // Get repo info
       const result = await sql`
         SELECT gitea_owner_name, gitea_repo_name
         FROM git_repos
         WHERE workspace_id = ${workspaceId}
       `

       if (!result[0]) {
         throw new Error('Repository not found for workspace')
       }

       const { gitea_owner_name, gitea_repo_name } = result[0] as Record<string, string>

       // Ensure user exists in Gitea
       const giteaUsername = await this.ensureGiteaUser(userId, email)

       // Map Sibylla role to Gitea permission
       const permission = role === 'admin' ? 'admin' : role === 'editor' ? 'write' : 'read'

       // Add collaborator in Gitea
       await giteaClient.addCollaborator(
         gitea_owner_name,
         gitea_repo_name,
         giteaUsername,
         permission
       )

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

       if (!result[0]) return

       const { gitea_owner_name, gitea_repo_name } = result[0] as Record<string, string>

       // Get Gitea username for user
       const giteaUsername = this.generateGiteaUsername(userId)

       await giteaClient.removeCollaborator(
         gitea_owner_name,
         gitea_repo_name,
         giteaUsername
       )

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
         await giteaClient.deleteAccessToken(giteaUsername, token.gitea_token_id as number)
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

       await giteaClient.createUser({
         username,
         email,
         fullName: email.split('@')[0],
         password
       })

       return username
     },

     /**
      * Generate Gitea username from Sibylla user ID
      */
     generateGiteaUsername(userId: string): string {
       // Use first 16 chars of user ID to keep it short
       return `u-${userId.replace(/-/g, '').slice(0, 16)}`
     }
   }

   // Helper function
   function mapToGitRepoInfo(row: Record<string, unknown>): GitRepoInfo {
     return {
       id: row.id as string,
       workspaceId: row.workspace_id as string,
       cloneUrlHttp: row.clone_url_http as string,
       cloneUrlSsh: row.clone_url_ssh as string | null,
       defaultBranch: row.default_branch as string,
       sizeBytes: Number(row.size_bytes),
       lastPushAt: row.last_push_at ? new Date(row.last_push_at as string) : null
     }
   }
   ```

5. **Git 路由（src/routes/git.ts）**
   ```typescript
   import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
   import { z } from 'zod'
   import { GitService } from '../services/git.service'
   import { sql } from '../db/client'

   export async function gitRoutes(app: FastifyInstance): Promise<void> {
     // All Git routes require authentication
     app.addHook('preHandler', app.authenticate)

     /**
      * GET /api/v1/git/:workspaceId/info
      * Get repository info for workspace
      */
     app.get('/:workspaceId/info', async (request: FastifyRequest, reply: FastifyReply) => {
       const { workspaceId } = request.params as { workspaceId: string }
       const { userId } = request.user

       // Check user has access to workspace
       const hasAccess = await checkWorkspaceAccess(userId, workspaceId)
       if (!hasAccess) {
         return reply.status(403).send({
           error: {
             code: 'FORBIDDEN',
             message: 'No access to this workspace'
           }
         })
       }

       const repo = await GitService.getRepoByWorkspace(workspaceId)
       if (!repo) {
         return reply.status(404).send({
           error: {
             code: 'NOT_FOUND',
             message: 'Repository not found for workspace'
           }
         })
       }

       return reply.send({
         cloneUrl: repo.cloneUrlHttp,
         defaultBranch: repo.defaultBranch,
         sizeBytes: repo.sizeBytes,
         lastPushAt: repo.lastPushAt
       })
     })

     /**
      * POST /api/v1/git/token
      * Generate Git access token for current user
      */
     app.post('/token', async (request: FastifyRequest, reply: FastifyReply) => {
       const { userId } = request.user

       const token = await GitService.generateAccessToken(userId)

       return reply.send({
         token,
         message: 'Store this token securely. It will not be shown again.'
       })
     })

     /**
      * DELETE /api/v1/git/token
      * Revoke all Git access tokens for current user
      */
     app.delete('/token', async (request: FastifyRequest, reply: FastifyReply) => {
       const { userId } = request.user

       await GitService.revokeAccessTokens(userId)

       return reply.status(204).send()
     })

     /**
      * GET /api/v1/git/:workspaceId/commits
      * Get recent commits for workspace repository
      */
     app.get('/:workspaceId/commits', async (request: FastifyRequest, reply: FastifyReply) => {
       const { workspaceId } = request.params as { workspaceId: string }
       const { userId } = request.user
       const query = request.query as { limit?: string; page?: string }

       // Check access
       const hasAccess = await checkWorkspaceAccess(userId, workspaceId)
       if (!hasAccess) {
         return reply.status(403).send({
           error: { code: 'FORBIDDEN', message: 'No access to this workspace' }
         })
       }

       const limit = Math.min(parseInt(query.limit || '20'), 100)
       const page = parseInt(query.page || '1')

       // TODO: Implement commit fetching via Gitea API
       // For now, return placeholder
       return reply.send({
         commits: [],
         pagination: { page, limit, total: 0 }
       })
     })
   }

   // Helper function
   async function checkWorkspaceAccess(userId: string, workspaceId: string): Promise<boolean> {
     const result = await sql`
       SELECT 1 FROM workspace_members
       WHERE user_id = ${userId} AND workspace_id = ${workspaceId}
     `
     return result.length > 0
   }
   ```

6. **配置更新（src/config/index.ts）**
   ```typescript
   export const config = {
     // ... existing config

     gitea: {
       url: env.GITEA_URL || 'http://gitea:3001',
       adminToken: env.GITEA_ADMIN_TOKEN || '',
       adminUsername: env.GITEA_ADMIN_USERNAME || 'sibylla-admin'
     }
   }
   ```

7. **Workspace 服务集成钩子（src/services/workspace.service.ts 片段）**
   ```typescript
   import { GitService } from './git.service'

   // 在创建 Workspace 后调用
   async function onWorkspaceCreated(
     workspaceId: string,
     workspaceName: string,
     ownerUserId: string,
     ownerEmail: string
   ): Promise<void> {
     // Create Git repository for workspace
     await GitService.createWorkspaceRepo({
       workspaceId,
       workspaceName,
       ownerUserId,
       ownerEmail
     })
   }

   // 在用户加入 Workspace 后调用
   async function onMemberAdded(
     workspaceId: string,
     userId: string,
     email: string,
     role: 'admin' | 'editor' | 'viewer'
   ): Promise<void> {
     // Add user as collaborator to Git repository
     await GitService.addCollaborator(workspaceId, userId, email, role)
   }

   // 在用户离开 Workspace 后调用
   async function onMemberRemoved(
     workspaceId: string,
     userId: string
   ): Promise<void> {
     // Remove user from Git repository
     await GitService.removeCollaborator(workspaceId, userId)
   }

   // 在删除 Workspace 后调用
   async function onWorkspaceDeleted(workspaceId: string): Promise<void> {
     // Delete Git repository
     await GitService.deleteWorkspaceRepo(workspaceId)
   }
   ```

### 数据模型

**ER 图更新：**

```
┌─────────────┐       ┌─────────────────┐       ┌─────────────┐
│   users     │       │   git_repos     │       │ workspaces  │
├─────────────┤       ├─────────────────┤       ├─────────────┤
│ id (PK)     │       │ id (PK)         │       │ id (PK)     │
│ ...         │       │ workspace_id(FK)│<──────│ ...         │
└─────────────┘       │ gitea_repo_id   │       └─────────────┘
       │              │ clone_url_http  │
       │              │ clone_url_ssh   │
       ▼              │ default_branch  │
┌─────────────────┐   │ size_bytes      │
│git_access_tokens│   │ last_push_at    │
├─────────────────┤   └─────────────────┘
│ id (PK)         │
│ user_id (FK)    │
│ gitea_token_id  │
│ token_hash      │
│ created_at      │
│ expires_at      │
│ revoked_at      │
└─────────────────┘
```

### API 规范

**获取仓库信息 API：**

```
GET /api/v1/git/:workspaceId/info
Authorization: Bearer <accessToken>

Response 200:
{
  "cloneUrl": "https://git.sibylla.io/sibylla/ws-12345678.git",
  "defaultBranch": "main",
  "sizeBytes": 1024000,
  "lastPushAt": "2026-03-04T10:00:00.000Z"
}

Response 403:
{
  "error": {
    "code": "FORBIDDEN",
    "message": "No access to this workspace"
  }
}
```

**生成 Git Token API：**

```
POST /api/v1/git/token
Authorization: Bearer <accessToken>

Response 200:
{
  "token": "gitea_xxxxxxxxxxxxxxxx",
  "message": "Store this token securely. It will not be shown again."
}
```

**吊销 Git Token API：**

```
DELETE /api/v1/git/token
Authorization: Bearer <accessToken>

Response 204: (No Content)
```

**获取提交历史 API：**

```
GET /api/v1/git/:workspaceId/commits?limit=20&page=1
Authorization: Bearer <accessToken>

Response 200:
{
  "commits": [
    {
      "sha": "abc123...",
      "message": "Update requirements.md",
      "author": "alice@example.com",
      "date": "2026-03-04T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 50
  }
}
```

## 验收标准

### 功能完整性

- [ ] Gitea 服务在 Docker Compose 中正常启动
- [ ] 创建 Workspace 时自动创建 Git 仓库
- [ ] 用户加入 Workspace 时自动获得仓库权限
- [ ] 用户离开 Workspace 时权限被移除
- [ ] 删除 Workspace 时仓库被删除
- [ ] 可以生成 Git 访问 Token
- [ ] 可以吊销 Git 访问 Token
- [ ] 获取仓库信息 API 正常工作

### 性能指标

- [ ] Gitea 服务启动时间 < 30 秒
- [ ] 创建仓库时间 < 5 秒
- [ ] 仓库信息查询时间 < 100ms

### 用户体验

- [ ] Gitea 配置完全自动化，无需手动干预
- [ ] 错误信息清晰
- [ ] Token 只在生成时显示一次（安全）

### 代码质量

- [ ] TypeScript strict mode 无错误
- [ ] Gitea API 调用有错误处理
- [ ] 所有数据库操作有事务保护
- [ ] 敏感信息（Token）不记录到日志

## 测试标准

### 单元测试

**测试覆盖率目标：** ≥ 70%

**关键测试用例：**

1. **仓库创建测试**
   - Workspace 创建触发仓库创建
   - 仓库信息正确存储

2. **权限同步测试**
   - 成员添加触发权限同步
   - 角色映射正确

3. **Token 管理测试**
   - Token 生成
   - Token 吊销

### 集成测试

**测试场景：**

1. 完整 Workspace 生命周期
   - 创建 Workspace → 创建仓库 → 添加成员 → 移除成员 → 删除 Workspace

2. Git 操作测试
   - 生成 Token → 使用 Token clone 仓库 → push 代码

### 端到端测试

暂不要求 E2E 测试。

## 依赖关系

### 前置依赖

- [ ] TASK004 - 云端服务框架搭建
- [ ] TASK005 - 数据库初始化与 Migration（需要 workspaces 表）

### 被依赖任务

- TASK010 - Git 抽象层基础实现（客户端需要连接此服务）
- TASK011 - Git 远程同步实现
- TASK013 - 客户端与云端集成测试

### 阻塞风险

- Gitea 配置复杂度
- Gitea API 兼容性
- Docker 网络配置

## 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| Gitea API 变更 | 中 | 低 | 锁定 Gitea 版本 |
| Gitea 配置复杂 | 中 | 中 | 使用 Docker Compose，文档详细 |
| 权限同步延迟 | 低 | 中 | 同步操作使用事务 |
| Gitea 服务不可用 | 高 | 低 | 健康检查、重试机制 |

### 时间风险

- Gitea 初始配置调试可能耗时
- 权限模型映射可能需要迭代

### 资源风险

- Gitea 需要额外的存储空间
- 需要测试环境验证 Git 操作

## 参考文档

- [`CLAUDE.md`](../../../CLAUDE.md) - 项目宪法
- [`specs/design/architecture.md`](../../design/architecture.md) - 系统架构
- [`specs/design/data-and-api.md`](../../design/data-and-api.md) - 数据与 API 设计
- [Gitea 官方文档](https://docs.gitea.com/)
- [Gitea API 文档](https://try.gitea.io/api/swagger)
- [Gitea Docker 部署](https://docs.gitea.com/installation/install-with-docker)

## 实施计划

### 第1步：Gitea Docker 配置

- 添加 Gitea 到 docker-compose.yml
- 配置 Gitea 环境变量
- 创建 Gitea 管理员账户
- 预计耗时：3 小时

### 第2步：数据库表设计

- 创建 git_repos 表 migration
- 创建 git_access_tokens 表 migration
- 预计耗时：2 小时

### 第3步：Gitea 客户端

- 实现 Gitea API 客户端
- 用户管理 API
- 仓库管理 API
- 预计耗时：4 小时

### 第4步：Git 服务实现

- 实现 createWorkspaceRepo
- 实现权限同步
- 实现 Token 管理
- 预计耗时：5 小时

### 第5步：路由和集成

- 实现 Git 相关路由
- 集成 Workspace 生命周期钩子
- 预计耗时：3 小时

### 第6步：测试和文档

- 单元测试
- 集成测试
- 更新 README
- 预计耗时：4 小时

## 完成标准

**本任务完成的标志：**

1. Gitea 服务正常运行
2. Workspace 创建/删除与仓库同步
3. 成员权限与 Git 权限同步
4. Git Token 管理正常工作
5. 所有测试通过

**交付物：**

- [ ] Gitea Docker 配置
- [ ] Git 相关数据库 migration
- [ ] Gitea 客户端
- [ ] Git 服务
- [ ] Git 路由
- [ ] 单元测试和集成测试
- [ ] 配置和部署文档

## 备注

### 开发建议

1. Gitea 使用 SQLite 或独立的 PostgreSQL 数据库
2. 所有 Gitea 用户使用自动生成的用户名，避免冲突
3. Git Token 使用短期 Token，定期轮换
4. 预留 GitHub 集成接口，但不在此任务实现
5. 考虑使用 Gitea 的 Hook 功能实现推送通知（可后续迭代）

### 安全考虑

- Gitea Admin Token 必须从环境变量读取
- Git Access Token 不得记录到日志
- Gitea 服务不对外暴露，只通过 Sibylla API 访问
- 所有 Git 操作通过 HTTPS

### 已知问题

- Gitea 初次启动需要手动创建管理员（可通过环境变量自动化）
- SSH 访问暂不支持（使用 HTTPS）
- GitHub 集成将在后续迭代实现

---

**创建时间：** 2026-03-04  
**最后更新：** 2026-03-04  
**更新记录：**
- 2026-03-04 - 初始创建
