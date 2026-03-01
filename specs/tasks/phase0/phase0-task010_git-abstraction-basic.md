# Git 抽象层基础实现

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE0-TASK010 |
| **任务标题** | Git 抽象层基础实现 |
| **所属阶段** | Phase 0 - 基础设施搭建 |
| **优先级** | P0 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

实现 Git 抽象层，封装所有 Git 操作，对上层提供语义化接口，确保上层代码无需直接调用 Git 命令或 Git 库 API。这是"Git 不可见"设计哲学的核心技术实现。

### 背景

根据 CLAUDE.md 第四节架构约束："封装为独立模块，对上层暴露语义化接口：`saveFile()`、`sync()`、`getHistory()`、`resolveConflict()`。禁止上层代码直接调用任何 git 命令或 git 库 API。"

Git 抽象层是 Sibylla 的关键基础设施，需要将复杂的 Git 操作转换为用户友好的语义化操作。

### 范围

**包含：**
- Git 仓库初始化
- 文件暂存（add）和提交（commit）
- 状态查询（status）
- 提交历史查询（log）
- 文件差异查询（diff）
- 基础错误处理和日志记录

**不包含：**
- 远程同步（push/pull）- TASK011
- 冲突解决 - Phase 1
- 分支管理 - Phase 1
- 审核流程 - Phase 2

## 技术要求

### 技术栈

- **isomorphic-git:** ^1.25.0（纯 JS Git 实现）
- **fs/promises:** Node.js 内置（文件系统操作）
- **path:** Node.js 内置（路径处理）

### 架构设计

```typescript
// src/main/services/git-abstraction.ts

export interface GitConfig {
  workspaceRoot: string
  userName: string
  userEmail: string
}

export interface GitStatus {
  modified: string[]      // 已修改但未暂存
  staged: string[]        // 已暂存
  untracked: string[]     // 未跟踪
}

export interface CommitInfo {
  oid: string            // commit hash
  message: string
  author: {
    name: string
    email: string
    timestamp: number
  }
  committer: {
    name: string
    email: string
    timestamp: number
  }
}

export interface FileDiff {
  path: string
  oldContent: string
  newContent: string
  hunks: DiffHunk[]
}

export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

export class GitAbstraction {
  private workspaceRoot: string
  private userName: string
  private userEmail: string
  
  constructor(config: GitConfig)
  
  // 初始化
  async init(): Promise<void>
  async isInitialized(): Promise<boolean>
  
  // 文件操作
  async stageFile(filepath: string): Promise<void>
  async stageAll(): Promise<void>
  async unstageFile(filepath: string): Promise<void>
  
  // 提交
  async commit(message: string): Promise<string>
  async commitAll(message: string): Promise<string>
  
  // 状态查询
  async getStatus(): Promise<GitStatus>
  async getFileStatus(filepath: string): Promise<'modified' | 'staged' | 'untracked' | 'unmodified'>
  
  // 历史查询
  async getHistory(options?: { depth?: number, filepath?: string }): Promise<CommitInfo[]>
  async getCommit(oid: string): Promise<CommitInfo>
  
  // 差异查询
  async getFileDiff(filepath: string, commitA?: string, commitB?: string): Promise<FileDiff>
  async getCommitDiff(oid: string): Promise<FileDiff[]>
  
  // 工具方法
  async getCurrentBranch(): Promise<string>
  async listFiles(): Promise<string[]>
}
```

### 实现细节

#### 关键实现点

1. **Git 仓库初始化**
   ```typescript
   import git from 'isomorphic-git'
   import fs from 'fs/promises'
   import path from 'path'
   
   async init(): Promise<void> {
     // 检查是否已初始化
     const gitDir = path.join(this.workspaceRoot, '.git')
     const exists = await fs.access(gitDir).then(() => true).catch(() => false)
     
     if (exists) {
       throw new Error('Git repository already initialized')
     }
     
     // 初始化仓库
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
     const gitignoreContent = [
       '.sibylla/index/',
       'node_modules/',
       '.DS_Store',
       'Thumbs.db',
       '*.log'
     ].join('\n')
     
     await fs.writeFile(
       path.join(this.workspaceRoot, '.gitignore'),
       gitignoreContent,
       'utf-8'
     )
     
     // 初始提交
     await this.stageAll()
     await this.commit('Initial commit')
     
     console.log('[GitAbstraction] Repository initialized')
   }
   ```

2. **文件暂存和提交**
   ```typescript
   async stageFile(filepath: string): Promise<void> {
     try {
       await git.add({
         fs,
         dir: this.workspaceRoot,
         filepath: this.normalizePath(filepath)
       })
       console.log(`[GitAbstraction] Staged: ${filepath}`)
     } catch (error) {
       throw new Error(`Failed to stage file ${filepath}: ${error.message}`)
     }
   }
   
   async stageAll(): Promise<void> {
     try {
       await git.add({
         fs,
         dir: this.workspaceRoot,
         filepath: '.'
       })
       console.log('[GitAbstraction] Staged all changes')
     } catch (error) {
       throw new Error(`Failed to stage all files: ${error.message}`)
     }
   }
   
   async commit(message: string): Promise<string> {
     try {
       const sha = await git.commit({
         fs,
         dir: this.workspaceRoot,
         message,
         author: {
           name: this.userName,
           email: this.userEmail,
           timestamp: Math.floor(Date.now() / 1000)
         }
       })
       
       console.log(`[GitAbstraction] Committed: ${sha.slice(0, 7)} - ${message}`)
       return sha
     } catch (error) {
       throw new Error(`Failed to commit: ${error.message}`)
     }
   }
   
   async commitAll(message: string): Promise<string> {
     await this.stageAll()
     return await this.commit(message)
   }
   ```

3. **状态查询**
   ```typescript
   async getStatus(): Promise<GitStatus> {
     try {
       const statusMatrix = await git.statusMatrix({
         fs,
         dir: this.workspaceRoot
       })
       
       const status: GitStatus = {
         modified: [],
         staged: [],
         untracked: []
       }
       
       for (const [filepath, headStatus, worktreeStatus, stageStatus] of statusMatrix) {
         // 忽略 .git 目录
         if (filepath.startsWith('.git/')) continue
         
         // headStatus: 0=absent, 1=present
         // worktreeStatus: 0=absent, 1=present, 2=modified
         // stageStatus: 0=absent, 1=present, 2=modified, 3=added
         
         if (headStatus === 0 && worktreeStatus === 2 && stageStatus === 0) {
           status.untracked.push(filepath)
         } else if (headStatus === 1 && worktreeStatus === 2 && stageStatus === 1) {
           status.modified.push(filepath)
         } else if (stageStatus === 2 || stageStatus === 3) {
           status.staged.push(filepath)
         }
       }
       
       return status
     } catch (error) {
       throw new Error(`Failed to get status: ${error.message}`)
     }
   }
   
   async getFileStatus(filepath: string): Promise<'modified' | 'staged' | 'untracked' | 'unmodified'> {
     const status = await this.getStatus()
     
     if (status.staged.includes(filepath)) return 'staged'
     if (status.modified.includes(filepath)) return 'modified'
     if (status.untracked.includes(filepath)) return 'untracked'
     return 'unmodified'
   }
   ```

4. **历史查询**
   ```typescript
   async getHistory(options: { depth?: number, filepath?: string } = {}): Promise<CommitInfo[]> {
     try {
       const commits = await git.log({
         fs,
         dir: this.workspaceRoot,
         depth: options.depth || 50,
         ref: 'main'
       })
       
       // 如果指定了文件路径，过滤只包含该文件的提交
       if (options.filepath) {
         const filtered: CommitInfo[] = []
         for (const commit of commits) {
           const files = await this.getCommitFiles(commit.oid)
           if (files.includes(options.filepath)) {
             filtered.push(this.formatCommitInfo(commit))
           }
         }
         return filtered
       }
       
       return commits.map(c => this.formatCommitInfo(c))
     } catch (error) {
       throw new Error(`Failed to get history: ${error.message}`)
     }
   }
   
   private formatCommitInfo(commit: any): CommitInfo {
     return {
       oid: commit.oid,
       message: commit.commit.message,
       author: {
         name: commit.commit.author.name,
         email: commit.commit.author.email,
         timestamp: commit.commit.author.timestamp
       },
       committer: {
         name: commit.commit.committer.name,
         email: commit.commit.committer.email,
         timestamp: commit.commit.committer.timestamp
       }
     }
   }
   ```

5. **差异查询**
   ```typescript
   async getFileDiff(
     filepath: string,
     commitA?: string,
     commitB?: string
   ): Promise<FileDiff> {
     try {
       // 如果未指定 commitA，使用 HEAD
       const refA = commitA || 'HEAD'
       // 如果未指定 commitB，使用工作区
       const refB = commitB || undefined
       
       const contentA = await this.getFileContent(filepath, refA)
       const contentB = refB 
         ? await this.getFileContent(filepath, refB)
         : await fs.readFile(path.join(this.workspaceRoot, filepath), 'utf-8')
       
       return {
         path: filepath,
         oldContent: contentA,
         newContent: contentB,
         hunks: this.computeDiffHunks(contentA, contentB)
       }
     } catch (error) {
       throw new Error(`Failed to get diff for ${filepath}: ${error.message}`)
     }
   }
   
   private async getFileContent(filepath: string, ref: string): Promise<string> {
     try {
       const { blob } = await git.readBlob({
         fs,
         dir: this.workspaceRoot,
         oid: ref,
         filepath
       })
       return new TextDecoder().decode(blob)
     } catch (error) {
       return '' // 文件不存在时返回空字符串
     }
   }
   
   private computeDiffHunks(oldContent: string, newContent: string): DiffHunk[] {
     // 简化实现：使用第三方库如 diff 或自己实现
     // 这里返回空数组，实际应该计算 diff hunks
     // TODO: 实现 diff 算法或集成 diff 库
     return []
   }
   ```

6. **工具方法**
   ```typescript
   private normalizePath(filepath: string): string {
     // 移除开头的 /
     return filepath.replace(/^\/+/, '')
   }
   
   async isInitialized(): Promise<boolean> {
     try {
       const gitDir = path.join(this.workspaceRoot, '.git')
       await fs.access(gitDir)
       return true
     } catch {
       return false
     }
   }
   
   async getCurrentBranch(): Promise<string> {
     try {
       return await git.currentBranch({
         fs,
         dir: this.workspaceRoot,
         fullname: false
       }) || 'main'
     } catch (error) {
       throw new Error(`Failed to get current branch: ${error.message}`)
     }
   }
   
   async listFiles(): Promise<string[]> {
     try {
       const statusMatrix = await git.statusMatrix({
         fs,
         dir: this.workspaceRoot
       })
       
       return statusMatrix
         .filter(([filepath]) => !filepath.startsWith('.git/'))
         .map(([filepath]) => filepath)
     } catch (error) {
       throw new Error(`Failed to list files: ${error.message}`)
     }
   }
   ```

### 数据模型

本任务使用的数据模型已在架构设计部分定义（GitStatus, CommitInfo, FileDiff 等）。

### API 规范

本任务不涉及 HTTP API，仅提供内部 TypeScript 接口。

## 验收标准

### 功能完整性

- [ ] 能够初始化 Git 仓库
- [ ] 能够暂存单个文件和所有文件
- [ ] 能够创建提交并返回 commit hash
- [ ] 能够查询仓库状态（modified/staged/untracked）
- [ ] 能够查询提交历史（支持深度限制和文件过滤）
- [ ] 能够查询文件差异
- [ ] 所有操作有清晰的错误处理和日志输出
- [ ] 上层代码无需直接调用 isomorphic-git API

### 性能指标

- [ ] Git init 操作 < 1 秒
- [ ] Git commit 操作 < 2 秒
- [ ] Git status 查询 < 500ms
- [ ] Git log 查询（50条）< 1 秒

### 用户体验

- [ ] 所有错误信息清晰易懂
- [ ] 关键操作有日志输出
- [ ] 不阻塞主线程

### 代码质量

- [ ] TypeScript strict mode 无错误
- [ ] ESLint 检查通过，无警告
- [ ] 所有公共方法有 JSDoc 注释
- [ ] 代码审查通过

## 测试标准

### 单元测试

**测试覆盖率目标：** ≥ 80%

**关键测试用例：**

1. **仓库初始化测试**
   - 输入：空目录
   - 预期输出：创建 .git 目录，配置用户信息，创建初始提交
   - 边界条件：已存在 .git 目录时抛出错误

2. **文件暂存测试**
   - 输入：修改后的文件路径
   - 预期输出：文件状态变为 staged
   - 边界条件：不存在的文件路径抛出错误

3. **提交测试**
   - 输入：提交信息
   - 预期输出：返回 commit hash，状态清空
   - 边界条件：无暂存文件时不创建提交

4. **状态查询测试**
   - 输入：无
   - 预期输出：正确分类 modified/staged/untracked 文件
   - 边界条件：空仓库返回空状态

5. **历史查询测试**
   - 输入：深度限制、文件路径过滤
   - 预期输出：返回符合条件的提交列表
   - 边界条件：无提交时返回空数组

### 集成测试

**测试场景：**

1. **完整工作流测试**
   - 初始化仓库 → 创建文件 → 暂存 → 提交 → 查询历史
   - 验证每一步状态正确

2. **多文件操作测试**
   - 修改多个文件 → 批量暂存 → 单次提交
   - 验证所有文件都被正确提交

3. **错误恢复测试**
   - 模拟各种错误场景
   - 验证错误处理和状态一致性

### 端到端测试

暂不要求 E2E 测试，将在 TASK013 集成测试阶段补充。

## 依赖关系

### 前置依赖

- [x] TASK008 - 文件管理器实现
- [x] TASK009 - Workspace 创建与初始化

### 被依赖任务

- TASK011 - Git 远程同步实现
- TASK012 - 自动保存机制实现
- Phase 1 所有涉及版本控制的功能

### 阻塞风险

- **高风险：** isomorphic-git 学习曲线陡峭，API 与原生 Git 有差异
- **中风险：** 性能问题（大仓库、大文件）
- **中风险：** 边界情况处理（文件权限、特殊字符）

## 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| isomorphic-git API 不熟悉 | 高 | 高 | 提前阅读文档，参考示例代码 |
| 性能不达标 | 中 | 中 | 使用性能分析工具，优化关键路径 |
| 边界情况未覆盖 | 中 | 中 | 编写全面的单元测试 |
| diff 算法实现复杂 | 低 | 中 | 使用成熟的 diff 库（如 diff 或 jsdiff） |

### 时间风险

- isomorphic-git 学习和调试可能超出预期
- 测试用例编写耗时较长

### 资源风险

- 需要对 Git 内部机制有深入理解
- 需要熟悉 isomorphic-git 的特殊用法

## 参考文档

- [`CLAUDE.md`](../../../CLAUDE.md) - 项目宪法（第四节 Git 抽象层）
- [`specs/design/architecture.md`](../../design/architecture.md) - 系统架构（第三节 Git 抽象层接口）
- [`specs/requirements/phase0/file-system-git-basic.md`](../../requirements/phase0/file-system-git-basic.md) - Git 基础需求
- [isomorphic-git 官方文档](https://isomorphic-git.org/)
- [Git 内部原理](https://git-scm.com/book/zh/v2/Git-%E5%86%85%E9%83%A8%E5%8E%9F%E7%90%86-Git-%E5%AF%B9%E8%B1%A1)

## 实施计划

### 第1步：环境准备和学习

- 安装 isomorphic-git
- 阅读官方文档和示例
- 搭建测试环境
- 预计耗时：4 小时

### 第2步：实现初始化和基础操作

- 实现 init()
- 实现 stageFile() 和 stageAll()
- 实现 commit() 和 commitAll()
- 编写对应单元测试
- 预计耗时：8 小时

### 第3步：实现状态查询

- 实现 getStatus()
- 实现 getFileStatus()
- 处理各种文件状态
- 编写对应单元测试
- 预计耗时：6 小时

### 第4步：实现历史查询

- 实现 getHistory()
- 实现 getCommit()
- 实现文件过滤逻辑
- 编写对应单元测试
- 预计耗时：6 小时

### 第5步：实现差异查询

- 实现 getFileDiff()
- 集成 diff 库
- 实现 diff hunks 计算
- 编写对应单元测试
- 预计耗时：6 小时

### 第6步：集成测试和优化

- 编写集成测试
- 性能测试和优化
- 错误处理完善
- 代码审查和重构
- 预计耗时：6 小时

## 完成标准

**本任务完成的标志：**

1. 所有公共接口实现完成并通过测试
2. 单元测试覆盖率 ≥ 80%
3. 集成测试通过
4. 性能指标达标
5. 代码审查通过
6. 文档完整（JSDoc + README）

**交付物：**

- [ ] GitAbstraction 类完整实现
- [ ] 单元测试套件（≥ 80% 覆盖率）
- [ ] 集成测试套件
- [ ] API 文档（JSDoc）
- [ ] 使用示例代码

## 备注

### 开发建议

1. 优先实现核心功能，diff 算法可以使用第三方库
2. 注意 isomorphic-git 的异步特性，所有操作都是 Promise
3. 充分利用 TypeScript 类型系统，确保类型安全
4. 关键操作添加结构化日志，便于调试
5. 考虑后续扩展性，预留接口

### 已知限制

- isomorphic-git 不支持所有 Git 功能（如 submodule）
- 大文件性能可能不如原生 Git
- 某些高级 Git 操作需要额外实现

### 技术债务

- diff hunks 计算可以在 Phase 1 优化
- 性能优化（缓存、增量计算）可以延后
- 更复杂的 Git 操作（rebase、cherry-pick）Phase 1 补充

---

**创建时间：** 2026-03-01  
**最后更新：** 2026-03-01  
**更新记录：**
- 2026-03-01 - 初始创建
