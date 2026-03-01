# Phase 0 - 文件系统与 Git 基础需求

## 一、概述

### 1.1 目标与价值

实现 Sibylla 的核心基础能力：本地文件系统操作和 Git 版本控制。这是"文件即真相"设计哲学的技术实现，确保用户数据以明文文件形式存储，并通过 Git 实现版本控制和多端同步。

### 1.2 涉及模块

- 模块1：文件系统与存储（基础部分）
- 模块3：Git 抽象层（基础部分）

### 1.3 里程碑定义

**完成标志：**
- 能够创建 workspace 并初始化标准文件结构
- 能够读写 Markdown 文件
- 能够执行 Git 基础操作（init/add/commit/push/pull）
- 能够在两台电脑之间同步文件变更

---

## 二、功能需求

### 需求 2.1 - Workspace 创建与初始化

**用户故事：** 作为用户，我想要创建一个新的 workspace，以便开始使用 Sibylla。

#### 功能描述

创建 workspace 时，在本地文件系统中创建标准目录结构，初始化配置文件和 Git 仓库。

#### 验收标准

1. When user clicks "Create Workspace" button, the system shall show folder selection dialog
2. When user selects folder and confirms, the system shall create standard directory structure within 2 seconds
3. When workspace is created, the system shall generate initial files: `CLAUDE.md`, `requirements.md`, `design.md`, `tasks.md`, `changelog.md`
4. When workspace is created, the system shall initialize Git repository with initial commit
5. When workspace creation fails due to permission error, the system shall show error message and rollback partial changes
6. When user tries to create workspace in non-empty folder, the system shall show warning and ask for confirmation

#### 技术规格

**标准目录结构（参见 [`data-and-api.md`](../../design/data-and-api.md)）：**
```
Workspace-Root/
├── .sibylla/
│   ├── config.json
│   ├── members.json
│   ├── points.json
│   └── index/
├── .git/
├── CLAUDE.md
├── requirements.md
├── design.md
├── tasks.md
├── changelog.md
├── tokenomics.md
├── skills/
│   └── _index.md
├── docs/
├── personal/
├── data/
└── assets/
```

**初始文件内容模板：**
```markdown
# CLAUDE.md 模板
# 项目宪法

> 本文件是项目的最高优先级上下文。AI 在参与本项目任何工作时，必须首先加载并遵循本文件中的所有约定。

## 一、项目定义

[项目名称] - [一句话描述]

## 二、设计哲学

1. 文件即真相
2. AI 建议，人类决策
3. [其他核心原则]

## 三、当前阶段

Phase 0 - 项目初始化
```

**FileManager 接口：**
```typescript
// src/main/services/file-manager.ts
export class FileManager {
  async createWorkspace(path: string, config: WorkspaceConfig): Promise<void> {
    // 1. 验证路径
    // 2. 创建目录结构
    // 3. 生成初始文件
    // 4. 初始化配置
  }
  
  async openWorkspace(path: string): Promise<WorkspaceInfo> {
    // 1. 验证 workspace 有效性
    // 2. 加载配置
    // 3. 返回 workspace 信息
  }
}
```

#### 依赖关系

- 前置依赖：Phase 0 基础设施搭建
- 被依赖项：所有文件操作功能

#### 优先级

P0 - 必须完成

---

### 需求 2.2 - 文件读写操作

**用户故事：** 作为用户，我想要读写文件，以便编辑文档内容。

#### 功能描述

提供安全的文件读写接口，支持 Markdown、JSON、CSV 等文本文件格式。

#### 验收标准

1. When user opens file, the system shall read file content and return within 100ms for files < 1MB
2. When user saves file, the system shall write to temporary file first, then atomically replace o
3. When file write fails, the system shall preserve original file and show error message
4. When user tries to read non-existent file, the system shall return error with clear message
5. When user tries to write to read-only file, the system shall return permission error
6. When file encoding is not UTF-8, the system shall detect and convert to UTF-8

#### 技术规格

**文件操作接口：**
```typescript
// src/main/services/file-manager.ts
export class FileManager {
  async readFile(path: string): Promise<string> {
    const fullPath = this.resolvePath(path)
    this.validatePath(fullPath)
    return await fs.readFile(fullPath, 'utf-8')
  }
  
  async writeFile(path: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(path)
    this.validatePath(fullPath)
    
    // 原子写入：先写临时文件，再替换
    const tempPath = `${fullPath}.tmp`
    await fs.writeFile(tempPath, content, 'utf-8')
    await fs.rename(tempPath, fullPath)
    
    // 触发 Git 操作
    await this.gitAbstraction.stageFile(path)
  }
  
  async deleteFile(path: string): Promise<void> {
    const fullPath = this.resolvePath(path)
    this.validatePath(fullPath)
    await fs.unlink(fullPath)
  }
  
  async listFiles(dirPath: string): Promise<FileInfo[]> {
    const fullPath = this.resolvePath(dirPath)
    const entries = await fs.readdir(fullPath, { withFileTypes: true })
    return entries.map(entry => ({
      name: entry.name,
      path: path.join(dirPath, entry.name),
      isDirectory: entry.isDirectory(),
      size: entry.isFile() ? (await fs.stat(path.join(fullPath, entry.name))).size : 0
    }))
  }
}
```

**安全验证：**
```typescript
private validatePath(fullPath: string): void {
  // 防止路径遍历攻击
  if (!fullPath.startsWith(this.workspaceRoot)) {
    throw new Error('Path outside workspace')
  }
  
  // 禁止访问系统目录
  const forbidden = ['.git', 'node_modules']
  if (forbidden.some(dir => fullPath.includes(dir))) {
    throw new Error('Access to system directory forbidden')
  }
}
```

#### 依赖关系

- 前置依赖：需求 2.1（Workspace 创建）
- 被依赖项：编辑器、Git 抽象层

#### 优先级

P0 - 必须完成

---

### 需求 2.3 - Git 仓库初始化

**用户故事：** 作为系统，我需要为每个 workspace 初始化 Git 仓库，以便实现版本控制。

#### 功能描述

使用 isomorphic-git 在 workspace 目录中初始化 Git 仓库，配置用户信息和远程仓库。

#### 验收标准

1. When workspace is created, the system shall initialize Git repository with `git init`
2. When Git is initialized, the system shall create initial commit with message "Initial commit"
3. When Git is initialized, the system shall configure user name and email from user profile
4. When remote URL is provided, the system shall add remote origin
5. When Git initialization fails, the system shall log error and allow workspace to function without Git

#### 技术规格

**Git 抽象层接口：**
```typescript
// src/main/services/git-abstraction.ts
import git from 'isomorphic-git'
import fs from 'fs'
import http from 'isomorphic-git/http/node'

export class GitAbstraction {
  private workspaceRoot: string
  
  async init(): Promise<void> {
    await git.init({
      fs,
      dir: this.workspaceRoot,
      defaultBranch: 'main'
    })
    
    // 配置用户信息
    await git.setConfig({
      fs,
      dir: this.workspaceRoot,
      path: 'user.name',
      value: this.userName
    })
    
    await git.setConfig({
      fs,
      dir: this.workspaceRoot,
      path: 'user.email',
      value: this.userEmail
    })
    
    // 创建 .gitignore
    await fs.writeFile(
      path.join(this.workspaceRoot, '.gitignore'),
      '.sibylla/index/\nnode_modules/\n.DS_Store\n'
    )
    
    // 初始提交
    await this.commitAll('Initial commit')
  }
  
  async addRemote(url: string): Promise<void> {
    await git.addRemote({
      fs,
      dir: this.workspaceRoot,
      remote: 'origin',
      url
    })
  }
}
```

#### 依赖关系

- 前置依赖：需求 2.1（Workspace 创建）
- 被依赖项：Git 同步功能

#### 优先级

P0 - 必须完成

---

### 需求 2.4 - Git 基础操作

**用户故事：** 作为系统，我需要执行 Git 基础操作，以便跟踪文件变更。

#### 功能描述

实现 Git 的 add、commit、status 等基础操作，为自动同步奠定基础。

#### 验收标准

1. When file is modified, the system shall detect change via `git status`
2. When `stageFile()` is called, the system shall add file to Git staging area
3. When `commit()` is called, the system shall create commit with provided message
4. When commit is created, the system shall include author name, email and timestamp
5. When no changes to commit, the system shall return without error
6. When Git operation fails, the system shall throw error with clear message

#### 技术规格

**Git 操作实现：**
```typescript
// src/main/services/git-abstraction.ts
export class GitAbstraction {
  async stageFile(filepath: string): Promise<void> {
    await git.add({
      fs,
      dir: this.workspaceRoot,
      filepath
    })
  }
  
  async stageAll(): Promise<void> {
    await git.add({
      fs,
      dir: this.workspaceRoot,
      filepath: '.'
    })
  }
  
  async commit(message: string): Promise<string> {
    const sha = await git.commit({
      fs,
      dir: this.workspaceRoot,
      message,
      author: {
        name: this.userName,
        email: this.userEmail
      }
    })
    return sha
  }
  
  async commitAll(message: string): Promise<string> {
    await this.stageAll()
    return await this.commit(message)
  }
  
  async getStatus(): Promise<GitStatus> {
    const status = await git.statusMatrix({
      fs,
      dir: this.workspaceRoot
    })
    
    return {
      modified: status.filter(([, head, workdir]) => head !== workdir).map(([filepath]) => filepath),
      staged: status.filter(([, , , stage]) => stage === 2).map(([filepath]) => filepath),
      untracked: status.filter(([, head]) => head === 0).map(([filepath]) => filepath)
    }
  }
}
```

#### 依赖关系

- 前置依赖：需求 2.3（Git 初始化）
- 被依赖项：自动保存、自动同步

#### 优先级

P0 - 必须完成

---

### 需求 2.5 - Git 远程同步

**用户故事：** 作为用户，我想要将本地变更同步到云端，以便在其他设备访问。

#### 功能描述

实现 Git 的 push 和 pull 操作，支持与 Sibylla Git Host 或用户自带 GitHub 同步。

#### 验收标准

1. When `push()` is called, the system shall push local commits to remote repository
2. When `pull()` is called, the system shall fetch and merge remote changes
3. When push succeeds, the system shall update sync status to "synced"
4. When push fails due to network error, the system shall retry up to 3 times with exponential backoff
5. When pull detects conflicts, the system shall mark files as conflicted and not auto-merge
6. When authentication fails, the system shall return auth error with clear message

#### 技术规格

**同步操作实现：**
```typescript
// src/main/services/git-abstraction.ts
export class GitAbstraction {
  async push(): Promise<PushResult> {
    try {
      const result = await git.push({
        fs,
        http,
        dir: this.workspaceRoot,
        remote: 'origin',
        ref: 'main',
        onAuth: () => ({
          username: this.authToken,
          password: 'x-oauth-basic'
        }),
        onProgress: (progress) => {
          this.emit('push:progress', progress)
        }
      })
      
      return { success: true, result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }
  
  async pull(): Promise<PullResult> {
    try {
      // Fetch
      await git.fetch({
        fs,
        http,
        dir: this.workspaceRoot,
        remote: 'origin',
        ref: 'main',
        onAuth: () => ({
          username: this.authToken,
          password: 'x-oauth-basic'
        })
      })
      
      // Merge
      const result = await git.merge({
        fs,
        dir: this.workspaceRoot,
        ours: 'main',
        theirs: 'origin/main',
        author: {
          name: this.userName,
          email: this.userEmail
        }
      })
      
      if (result.conflicts && result.conflicts.length > 0) {
        return {
          success: false,
          hasConflicts: true,
          conflicts: result.conflicts
        }
      }
      
      return { success: true, result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }
  
  async sync(): Promise<SyncResult> {
    // 先 pull 再 push
    const pullResult = await this.pull()
    if (!pullResult.success) {
      return pullResult
    }
    
    const pushResult = await this.push()
    return pushResult
  }
}
```

**重试机制：**
```typescript
private async retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation()
    } catch (error) {
      if (i === maxRetries - 1) throw error
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000))
    }
  }
  throw new Error('Max retries exceeded')
}
```

#### 依赖关系

- 前置依赖：需求 2.4（Git 基础操作）、云端 Git 托管服务
- 被依赖项：自动同步功能

#### 优先级

P0 - 必须完成

---

### 需求 2.6 - 云端 Git 托管服务

**用户故事：** 作为用户，我需要云端 Git 托管服务，以便存储和同步我的 workspace。

#### 功能描述

部署 Gitea 作为 Git 托管服务，提供仓库创建、认证和访问控制。

#### 验收标准

1. When user creates workspace, the system shall create corresponding Git repository on Gitea
2. When client pushes to repository, the system shall authenticate using JWT token
3. When authentication succeeds, the system shall allow push operation
4. When authentication fails, the system shall return 401 status
5. When repository is created, the system shall set default branch to "main"
6. When user is removed from workspace, the system shall revoke their repository access

#### 技术规格

**Gitea 部署配置：**
```yaml
# docker-compose.yml
version: '3'

services:
  gitea:
    image: gitea/gitea:latest
    environment:
      - USER_UID=1000
      - USER_GID=1000
      - GITEA__database__DB_TYPE=postgres
      - GITEA__database__HOST=db:5432
      - GITEA__database__NAME=gitea
      - GITEA__database__USER=gitea
      - GITEA__database__PASSWD=${DB_PASSWORD}
    volumes:
      - gitea_data:/data
    ports:
      - "3000:3000"
      - "222:22"
    depends_on:
      - db

  db:
    image: postgres:14
    environment:
      - POSTGRES_USER=gitea
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=gitea
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  gitea_data:
  postgres_data:
```

**仓库管理 API：**
```typescript
// src/services/git-hosting.service.ts
export class GitHostingService {
  async createRepository(workspaceId: string, userId: string): Promise<string> {
    // 调用 Gitea API 创建仓库
    const response = await fetch(`${this.giteaUrl}/api/v1/user/repos`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${this.giteaAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: workspaceId,
        private: true,
        default_branch: 'main'
      })
    })
    
    const repo = await response.json()
    return repo.clone_url
  }
  
  async grantAccess(workspaceId: string, userId: string, role: string): Promise<void> {
    // 添加协作者
    await fetch(`${this.giteaUrl}/api/v1/repos/${workspaceId}/collaborators/${userId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${this.giteaAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        permission: role === 'admin' ? 'admin' : role === 'editor' ? 'write' : 'read'
      })
    })
  }
}
```

#### 依赖关系

- 前置依赖：云端服务框架、数据库
- 被依赖项：需求 2.5（Git 同步）

#### 优先级

P0 - 必须完成

---

## 三、非功能需求

### 3.1 性能要求

- 文件读取 < 100ms（1MB 以内文件）
- 文件写入 < 200ms（包含原子替换）
- Git commit < 500ms（单文件）
- Git push/pull < 5 秒（正常网络，< 10MB 变更）
- Workspace 创建 < 2 秒

### 3.2 安全要求

- 文件写入必须使用原子操作，防止数据丢失
- 路径验证防止目录遍历攻击
- Git 认证使用 Token，不存储明文密码
- 禁止访问 `.git` 等系统目录

### 3.3 可靠性要求

- 文件写入失败时保留原文件
- Git 操作失败时不影响本地文件
- 网络错误时自动重试（最多 3 次）
- 所有错误有清晰的日志记录

### 3.4 可用性要求

- 离线状态下本地文件操作正常
- Git 同步失败不阻塞用户编辑
- 错误信息对用户友好，不暴露技术细节

---

## 四、技术约束

### 4.1 架构约束

遵循 [`CLAUDE.md`](../../../CLAUDE.md) 的设计哲学：

1. **文件即真相** - 所有内容以明文文件存储
2. **Git 不可见** - 用户界面不出现 Git 术语
3. **文件级协作** - 协作最小单位是文件

### 4.2 技术选型

- Git 实现：isomorphic-git（纯 JS，跨平台一致）
- Git 托管：Gitea（轻量、自托管）
- 文件系统：Node.js fs/promises API

### 4.3 兼容性要求

- 支持 UTF-8 编码的文本文件
- 支持 Windows、macOS、Linux 路径格式
- Git 仓库兼容标准 Git 客户端

---

## 五、验收检查清单

### 5.1 功能完整性

- [ ] 能够创建 workspace 并生成标准目录结构
- [ ] 能够读写 Markdown 文件
- [ ] 能够列出目录内容
- [ ] Git 仓库初始化成功
- [ ] Git add/commit 操作正常
- [ ] Git push/pull 操作正常
- [ ] 云端 Git 仓库创建成功
- [ ] 两台电脑能够同步文件变更

### 5.2 测试覆盖

- [ ] 文件操作有单元测试（读/写/删除/列表）
- [ ] Git 操作有单元测试（init/add/commit/push/pull）
- [ ] 路径验证有安全测试
- [ ] 原子写入有可靠性测试
- [ ] 网络错误重试有集成测试

### 5.3 文档完备

- [ ] FileManager API 文档完整
- [ ] GitAbstraction API 文档完整
- [ ] 错误码和错误信息文档
- [ ] Gitea 部署文档

### 5.4 性能达标

- [ ] 文件读取 < 100ms
- [ ] 文件写入 < 200ms
- [ ] Git commit < 500ms
- [ ] Git push/pull < 5 秒

---

## 六、风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| isomorphic-git 性能不足 | 高 | 中 | 准备降级方案（调用系统 git） |
| 大文件同步慢 | 中 | 高 | 限制单文件大小，提供进度反馈 |
| 网络不稳定导致同步失败 | 中 | 高 | 实现重试机制和离线队列 |
| 文件编码问题 | 低 | 中 | 强制 UTF-8，提供编码检测 |
| Gitea 资源占用高 | 低 | 低 | 监控资源使用，优化配置 |

---

## 七、参考资料

- [isomorphic-git 文档](https://isomorphic-git.org/)
- [Gitea 文档](https://docs.gitea.io/)
- [`CLAUDE.md`](../../../CLAUDE.md) - 项目宪法
- [`architecture.md`](../../design/architecture.md) - 系统架构
- [`data-and-api.md`](../../design/data-and-api.md) - 数据模型
