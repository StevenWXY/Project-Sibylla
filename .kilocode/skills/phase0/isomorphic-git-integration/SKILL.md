---
name: isomorphic-git-integration
description: >-
  isomorphic-git 纯 JS Git 实现的集成与使用。当需要实现 Git 抽象层、设计自动提交与同步策略、处理冲突检测与解决、实现版本历史与 diff 操作、或构建审核流程时使用此 skill。
license: MIT
metadata:
  category: development
  tags:
    - git
    - isomorphic-git
    - version-control
    - typescript
---

# isomorphic-git 集成

此 skill 提供 isomorphic-git 纯 JavaScript Git 实现的集成指南，涵盖 Git 抽象层设计、自动提交与同步、冲突处理、版本历史、审核流程等核心主题。

## 何时使用此 Skill

在以下场景中使用此 skill：

- 集成 isomorphic-git 到 Electron 应用
- 设计 Git 抽象层，封装底层 Git 操作
- 实现自动提交与同步策略
- 处理 Git 冲突检测与解决
- 实现版本历史查询与 diff 操作
- 构建审核流程（submit/approve/reject）
- 避免依赖系统 git 命令

## 核心概念

### 1. 为什么选择 isomorphic-git

[`isomorphic-git`](https://isomorphic-git.org/) 是纯 JavaScript 实现的 Git 客户端，相比系统 git 命令有以下优势：

**优势**：
- 无需依赖系统 git 安装，跨平台一致性更好
- 纯 JavaScript 实现，可在 Node.js 和浏览器中运行
- API 设计友好，易于集成和测试
- 支持 TypeScript 类型定义
- 可以精确控制 Git 操作的每个细节

**适用场景**：
- Electron 桌面应用的版本控制
- 需要自动化 Git 操作的场景
- 需要精细控制 Git 行为的应用
- 跨平台一致性要求高的项目

### 2. 安装与基础配置

```bash
npm install isomorphic-git
```

基础配置示例：

```typescript
// services/GitAbstraction.ts
import git from 'isomorphic-git';
import fs from 'fs';
import path from 'path';

export class GitAbstraction {
  private workspaceDir: string;
  private author: { name: string; email: string };
  
  constructor(workspaceDir: string) {
    this.workspaceDir = workspaceDir;
    this.author = {
      name: 'Sibylla User',
      email: 'user@sibylla.local',
    };
  }
  
  // 初始化 Git 仓库
  async init(): Promise<void> {
    await git.init({
      fs,
      dir: this.workspaceDir,
      defaultBranch: 'main',
    });
  }
  
  // 检查是否已初始化
  async isInitialized(): Promise<boolean> {
    try {
      await git.resolveRef({
        fs,
        dir: this.workspaceDir,
        ref: 'HEAD',
      });
      return true;
    } catch {
      return false;
    }
  }
}
```

**最佳实践**：
- 在应用启动时检查并初始化 Git 仓库
- 配置默认的 author 信息
- 使用 Node.js 的 `fs` 模块作为文件系统接口

### 3. Git 抽象层设计模式

设计语义化的 Git 抽象层，隐藏底层 Git 操作细节：

```typescript
// types/git.ts
export interface GitStatus {
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
}

export interface SyncResult {
  success: boolean;
  commits: number;
  conflicts: string[];
}

export interface VersionEntry {
  oid: string;
  message: string;
  author: string;
  timestamp: number;
}

export interface Diff {
  path: string;
  oldContent: string;
  newContent: string;
  hunks: DiffHunk[];
}

export interface ConflictInfo {
  path: string;
  ours: string;
  theirs: string;
  base: string;
}

export enum Resolution {
  OURS = 'ours',
  THEIRS = 'theirs',
  MANUAL = 'manual',
}

// services/GitAbstraction.ts
export class GitAbstraction {
  // 文件操作：保存文件并自动提交
  async saveFile(filePath: string, content: string): Promise<void> {
    const fullPath = path.join(this.workspaceDir, filePath);
    
    // 写入文件
    await fs.promises.writeFile(fullPath, content, 'utf-8');
    
    // 添加到暂存区
    await git.add({
      fs,
      dir: this.workspaceDir,
      filepath: filePath,
    });
    
    // 自动提交
    await this.autoCommit(filePath, 'Update file');
  }
  
  // 自动提交
  private async autoCommit(filePath: string, message: string): Promise<string> {
    const oid = await git.commit({
      fs,
      dir: this.workspaceDir,
      message: `${message}: ${filePath}`,
      author: this.author,
    });
    
    console.log(`Auto-committed: ${oid.slice(0, 7)} - ${message}`);
    return oid;
  }
  
  // 获取状态
  async getStatus(): Promise<GitStatus> {
    const status: GitStatus = {
      modified: [],
      added: [],
      deleted: [],
      untracked: [],
    };
    
    const statusMatrix = await git.statusMatrix({
      fs,
      dir: this.workspaceDir,
    });
    
    for (const [filepath, headStatus, workdirStatus, stageStatus] of statusMatrix) {
      // 未跟踪文件
      if (headStatus === 0 && workdirStatus === 2 && stageStatus === 0) {
        status.untracked.push(filepath);
      }
      // 已修改文件
      else if (headStatus === 1 && workdirStatus === 2 && stageStatus === 1) {
        status.modified.push(filepath);
      }
      // 新增文件
      else if (headStatus === 0 && workdirStatus === 2 && stageStatus === 2) {
        status.added.push(filepath);
      }
      // 已删除文件
      else if (headStatus === 1 && workdirStatus === 0 && stageStatus === 0) {
        status.deleted.push(filepath);
      }
    }
    
    return status;
  }
  
  // 获取历史记录
  async getHistory(filePath?: string): Promise<VersionEntry[]> {
    const commits = await git.log({
      fs,
      dir: this.workspaceDir,
      ref: 'HEAD',
      depth: 100, // 限制深度
    });
    
    const history: VersionEntry[] = commits.map(commit => ({
      oid: commit.oid,
      message: commit.commit.message,
      author: commit.commit.author.name,
      timestamp: commit.commit.author.timestamp * 1000,
    }));
    
    // 如果指定了文件路径，过滤只包含该文件的提交
    if (filePath) {
      const filtered: VersionEntry[] = [];
      for (const entry of history) {
        const changes = await this.getCommitChanges(entry.oid);
        if (changes.includes(filePath)) {
          filtered.push(entry);
        }
      }
      return filtered;
    }
    
    return history;
  }
  
  // 获取提交中的文件变更
  private async getCommitChanges(oid: string): Promise<string[]> {
    try {
      const commit = await git.readCommit({
        fs,
        dir: this.workspaceDir,
        oid,
      });
      
      // 获取父提交
      const parentOid = commit.commit.parent[0];
      if (!parentOid) return [];
      
      // 比较树对象
      const changes = await this.compareTreeObjects(parentOid, oid);
      return changes;
    } catch {
      return [];
    }
  }
  
  // 比较两个提交的树对象
  private async compareTreeObjects(oidA: string, oidB: string): Promise<string[]> {
    // 简化实现：返回所有文件
    // 实际应用中需要递归比较树对象
    const files = await this.listFiles(oidB);
    return files;
  }
  
  // 列出提交中的所有文件
  private async listFiles(oid: string): Promise<string[]> {
    const commit = await git.readCommit({
      fs,
      dir: this.workspaceDir,
      oid,
    });
    
    const tree = await git.readTree({
      fs,
      dir: this.workspaceDir,
      oid: commit.commit.tree,
    });
    
    return tree.tree.map(entry => entry.path);
  }
  
  // 获取文件 diff
  async getFileDiff(commitA: string, commitB: string, filePath: string): Promise<Diff> {
    // 读取两个版本的文件内容
    const contentA = await this.readFileAtCommit(commitA, filePath);
    const contentB = await this.readFileAtCommit(commitB, filePath);
    
    return {
      path: filePath,
      oldContent: contentA,
      newContent: contentB,
      hunks: this.computeDiffHunks(contentA, contentB),
    };
  }
  
  // 读取指定提交中的文件内容
  private async readFileAtCommit(oid: string, filePath: string): Promise<string> {
    try {
      const { blob } = await git.readBlob({
        fs,
        dir: this.workspaceDir,
        oid,
        filepath: filePath,
      });
      
      return new TextDecoder().decode(blob);
    } catch {
      return '';
    }
  }
  
  // 计算 diff hunks（简化实现）
  private computeDiffHunks(oldContent: string, newContent: string): DiffHunk[] {
    // 实际应用中应使用专业的 diff 算法库（如 diff-match-patch）
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');
    
    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;
    
    const maxLen = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i] || '';
      const newLine = newLines[i] || '';
      
      if (oldLine !== newLine) {
        if (!currentHunk) {
          currentHunk = {
            oldStart: i + 1,
            oldLines: 0,
            newStart: i + 1,
            newLines: 0,
            lines: [],
          };
        }
        
        if (oldLine) {
          currentHunk.lines.push({ type: 'delete', content: oldLine });
          currentHunk.oldLines++;
        }
        if (newLine) {
          currentHunk.lines.push({ type: 'add', content: newLine });
          currentHunk.newLines++;
        }
      } else if (currentHunk) {
        hunks.push(currentHunk);
        currentHunk = null;
      }
    }
    
    if (currentHunk) {
      hunks.push(currentHunk);
    }
    
    return hunks;
  }
}

interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: Array<{ type: 'add' | 'delete' | 'context'; content: string }>;
}
```

**最佳实践**：
- 封装所有 Git 操作为语义化方法
- 禁止上层直接调用 isomorphic-git API
- 使用 TypeScript 定义清晰的接口
- 自动提交文件变更，减少用户操作
- 提供详细的错误处理和日志

### 4. 同步策略

实现自动同步到远程仓库：

```typescript
export class GitAbstraction {
  private remoteUrl?: string;
  
  // 配置远程仓库
  async setRemote(url: string, name: string = 'origin'): Promise<void> {
    this.remoteUrl = url;
    
    await git.addRemote({
      fs,
      dir: this.workspaceDir,
      remote: name,
      url,
    });
  }
  
  // 同步（拉取 + 推送）
  async sync(remote: string = 'origin', branch: string = 'main'): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      commits: 0,
      conflicts: [],
    };
    
    try {
      // 1. 拉取远程更新
      const pullResult = await this.pull(remote, branch);
      
      if (pullResult.conflicts.length > 0) {
        result.conflicts = pullResult.conflicts;
        return result;
      }
      
      // 2. 推送本地提交
      await this.push(remote, branch);
      
      result.success = true;
      result.commits = pullResult.commits;
      
      return result;
    } catch (error) {
      console.error('Sync failed:', error);
      throw new Error(`Sync failed: ${error.message}`);
    }
  }
  
  // 拉取远程更新
  private async pull(remote: string, branch: string): Promise<{ commits: number; conflicts: string[] }> {
    // 获取远程更新
    await git.fetch({
      fs,
      http: require('isomorphic-git/http/node'),
      dir: this.workspaceDir,
      remote,
      ref: branch,
      singleBranch: true,
      depth: 10,
    });
    
    // 合并远程分支
    const mergeResult = await git.merge({
      fs,
      dir: this.workspaceDir,
      ours: branch,
      theirs: `${remote}/${branch}`,
      author: this.author,
    });
    
    // 检查冲突
    if (mergeResult.conflicts) {
      return {
        commits: 0,
        conflicts: mergeResult.conflicts,
      };
    }
    
    return {
      commits: 1, // 简化实现
      conflicts: [],
    };
  }
  
  // 推送到远程
  private async push(remote: string, branch: string): Promise<void> {
    await git.push({
      fs,
      http: require('isomorphic-git/http/node'),
      dir: this.workspaceDir,
      remote,
      ref: branch,
    });
  }
}
```

**最佳实践**：
- 在文件保存后自动同步
- 使用心跳机制定期同步（如每 5 分钟）
- 检测冲突并提示用户解决
- 支持离线工作，在线时自动同步
- 使用 `depth` 参数限制拉取深度，提升性能

### 5. 冲突检测与解决

处理 Git 合并冲突：

```typescript
export class GitAbstraction {
  // 获取冲突列表
  async getConflicts(): Promise<ConflictInfo[]> {
    const conflicts: ConflictInfo[] = [];
    
    const statusMatrix = await git.statusMatrix({
      fs,
      dir: this.workspaceDir,
    });
    
    for (const [filepath, headStatus, workdirStatus, stageStatus] of statusMatrix) {
      // 检测冲突状态
      if (stageStatus === 1 && workdirStatus === 2) {
        const conflictInfo = await this.readConflictFile(filepath);
        conflicts.push(conflictInfo);
      }
    }
    
    return conflicts;
  }
  
  // 读取冲突文件的三方内容
  private async readConflictFile(filePath: string): Promise<ConflictInfo> {
    const fullPath = path.join(this.workspaceDir, filePath);
    const content = await fs.promises.readFile(fullPath, 'utf-8');
    
    // 解析冲突标记
    const oursMatch = content.match(/<<<<<<< HEAD\n([\s\S]*?)\n=======/);
    const theirsMatch = content.match(/=======\n([\s\S]*?)\n>>>>>>>/);
    
    return {
      path: filePath,
      ours: oursMatch ? oursMatch[1] : '',
      theirs: theirsMatch ? theirsMatch[1] : '',
      base: '', // 简化实现，实际需要读取 base 版本
    };
  }
  
  // 解决冲突
  async resolveConflict(filePath: string, resolution: Resolution, manualContent?: string): Promise<void> {
    const fullPath = path.join(this.workspaceDir, filePath);
    
    let resolvedContent: string;
    
    switch (resolution) {
      case Resolution.OURS:
        const conflictInfo = await this.readConflictFile(filePath);
        resolvedContent = conflictInfo.ours;
        break;
      
      case Resolution.THEIRS:
        const conflictInfo2 = await this.readConflictFile(filePath);
        resolvedContent = conflictInfo2.theirs;
        break;
      
      case Resolution.MANUAL:
        if (!manualContent) {
          throw new Error('Manual content is required for MANUAL resolution');
        }
        resolvedContent = manualContent;
        break;
      
      default:
        throw new Error(`Unknown resolution: ${resolution}`);
    }
    
    // 写入解决后的内容
    await fs.promises.writeFile(fullPath, resolvedContent, 'utf-8');
    
    // 添加到暂存区
    await git.add({
      fs,
      dir: this.workspaceDir,
      filepath: filePath,
    });
    
    // 提交解决
    await git.commit({
      fs,
      dir: this.workspaceDir,
      message: `Resolve conflict: ${filePath}`,
      author: this.author,
    });
  }
}
```

**最佳实践**：
- 自动检测冲突并通知用户
- 提供三种解决策略：保留本地、保留远程、手动合并
- 在 UI 中高亮显示冲突内容
- 解决冲突后自动提交
- 记录冲突解决历史

### 6. 审核流程实现

实现代码审核工作流：

```typescript
// types/review.ts
export interface ReviewInfo {
  id: string;
  paths: string[];
  author: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  reviewedAt?: number;
  reviewer?: string;
  comment?: string;
}

export class GitAbstraction {
  private reviews: Map<string, ReviewInfo> = new Map();
  
  // 提交审核
  async submitForReview(paths: string[]): Promise<ReviewInfo> {
    // 创建审核分支
    const reviewId = `review-${Date.now()}`;
    const reviewBranch = `review/${reviewId}`;
    
    await git.branch({
      fs,
      dir: this.workspaceDir,
      ref: reviewBranch,
      checkout: false,
    });
    
    // 创建审核信息
    const reviewInfo: ReviewInfo = {
      id: reviewId,
      paths,
      author: this.author.name,
      status: 'pending',
      createdAt: Date.now(),
    };
    
    this.reviews.set(reviewId, reviewInfo);
    
    // 保存审核元数据
    await this.saveReviewMetadata(reviewInfo);
    
    return reviewInfo;
  }
  
  // 批准变更
  async approveChanges(reviewId: string, reviewer: string): Promise<void> {
    const reviewInfo = this.reviews.get(reviewId);
    if (!reviewInfo) {
      throw new Error(`Review not found: ${reviewId}`);
    }
    
    // 合并审核分支到主分支
    const reviewBranch = `review/${reviewId}`;
    
    await git.merge({
      fs,
      dir: this.workspaceDir,
      ours: 'main',
      theirs: reviewBranch,
      author: { name: reviewer, email: 'reviewer@sibylla.local' },
    });
    
    // 更新审核状态
    reviewInfo.status = 'approved';
    reviewInfo.reviewedAt = Date.now();
    reviewInfo.reviewer = reviewer;
    
    await this.saveReviewMetadata(reviewInfo);
    
    // 删除审核分支
    await git.deleteBranch({
      fs,
      dir: this.workspaceDir,
      ref: reviewBranch,
    });
  }
  
  // 拒绝变更
  async rejectChanges(reviewId: string, reviewer: string, reason: string): Promise<void> {
    const reviewInfo = this.reviews.get(reviewId);
    if (!reviewInfo) {
      throw new Error(`Review not found: ${reviewId}`);
    }
    
    // 更新审核状态
    reviewInfo.status = 'rejected';
    reviewInfo.reviewedAt = Date.now();
    reviewInfo.reviewer = reviewer;
    reviewInfo.comment = reason;
    
    await this.saveReviewMetadata(reviewInfo);
    
    // 保留审核分支，允许作者修改后重新提交
  }
  
  // 保存审核元数据
  private async saveReviewMetadata(reviewInfo: ReviewInfo): Promise<void> {
    const metadataPath = path.join(this.workspaceDir, '.sibylla', 'reviews', `${reviewInfo.id}.json`);
    await fs.promises.mkdir(path.dirname(metadataPath), { recursive: true });
    await fs.promises.writeFile(metadataPath, JSON.stringify(reviewInfo, null, 2), 'utf-8');
  }
  
  // 获取所有审核
  async listReviews(): Promise<ReviewInfo[]> {
    const reviewsDir = path.join(this.workspaceDir, '.sibylla', 'reviews');
    
    try {
      const files = await fs.promises.readdir(reviewsDir);
      const reviews: ReviewInfo[] = [];
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const content = await fs.promises.readFile(path.join(reviewsDir, file), 'utf-8');
          reviews.push(JSON.parse(content));
        }
      }
      
      return reviews.sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [];
    }
  }
}
```

**最佳实践**：
- 使用分支隔离审核中的变更
- 保存审核元数据到 `.sibylla/reviews/` 目录
- 支持审核状态跟踪（pending/approved/rejected）
- 批准后自动合并到主分支
- 拒绝后保留分支，允许修改后重新提交

### 7. 性能优化

优化 Git 操作性能：

```typescript
export class GitAbstraction {
  private statusCache?: { data: GitStatus; timestamp: number };
  private readonly CACHE_TTL = 5000; // 5 秒缓存
  
  // 缓存状态查询
  async getStatus(useCache: boolean = true): Promise<GitStatus> {
    if (useCache && this.statusCache) {
      const age = Date.now() - this.statusCache.timestamp;
      if (age < this.CACHE_TTL) {
        return this.statusCache.data;
      }
    }
    
    const status = await this.computeStatus();
    
    this.statusCache = {
      data: status,
      timestamp: Date.now(),
    };
    
    return status;
  }
  
  // 批量提交
  async commitMultipleFiles(files: Array<{ path: string; content: string }>, message: string): Promise<string> {
    // 批量写入文件
    await Promise.all(
      files.map(({ path: filePath, content }) => {
        const fullPath = path.join(this.workspaceDir, filePath);
        return fs.promises.writeFile(fullPath, content, 'utf-8');
      })
    );
    
    // 批量添加到暂存区
    await Promise.all(
      files.map(({ path: filePath }) =>
        git.add({
          fs,
          dir: this.workspaceDir,
          filepath: filePath,
        })
      )
    );
    
    // 单次提交
    const oid = await git.commit({
      fs,
      dir: this.workspaceDir,
      message,
      author: this.author,
    });
    
    return oid;
  }
  
  // 浅克隆
  async clone(url: string, depth: number = 1): Promise<void> {
    await git.clone({
      fs,
      http: require('isomorphic-git/http/node'),
      dir: this.workspaceDir,
      url,
      depth, // 浅克隆，只拉取最近的提交
      singleBranch: true,
    });
  }
}
```

**最佳实践**：
- 缓存频繁查询的状态信息
- 批量操作多个文件，减少提交次数
- 使用浅克隆（`depth: 1`）加速初始化
- 限制历史查询深度（`depth: 100`）
- 使用 `singleBranch: true` 只拉取当前分支

## 与现有 Skills 的关系

- 与 [`electron-desktop-app`](.kilocode/skills/electron-desktop-app/SKILL.md) 互补：在 Electron 主进程中集成 Git 操作
- 与 [`electron-ipc-patterns`](.kilocode/skills/electron-ipc-patterns/SKILL.md) 互补：通过 IPC 暴露 Git 操作给渲染进程
- 与 [`typescript-strict-mode`](.kilocode/skills/typescript-strict-mode/SKILL.md) 互补：使用严格类型定义 Git 接口

## 参考资源

- [isomorphic-git 官方文档](https://isomorphic-git.org/)
- [isomorphic-git API 参考](https://isomorphic-git.org/docs/en/alphabetic)
- [Git 内部原理](https://git-scm.com/book/zh/v2/Git-%E5%86%85%E9%83%A8%E5%8E%9F%E7%90%86-Git-%E5%AF%B9%E8%B1%A1)
