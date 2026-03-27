# Git 远程同步实现

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE0-TASK011 |
| **任务标题** | Git 远程同步实现 |
| **所属阶段** | Phase 0 - 基础设施搭建 |
| **优先级** | P0 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

在 TASK010 基础之上，扩展 Git 抽象层以支持远程仓库交互。实现安全、可靠的远程同步（Push/Pull）机制，与 Gitea 或 GitHub 进行通信，支持凭证管理和网络重试机制，为自动保存与同步（TASK012）奠定基础。这是实现 Sibylla "协作"设计的核心支撑。

### 背景

根据 `CLAUDE.md` 第二节设计哲学中的"文件级协作"和第四节架构约束："Git 不可见：底层使用 Git 实现版本控制与同步，但用户界面中严禁出现 branch、merge、commit、pull、push 等术语。用'版本''同步''历史''审批'等自然语言替代。"以及"客户端在离线状态下必须可正常编辑和保存，联网后自动同步。"

TASK010 已经完成了本地仓库的基础操作。本任务需要建立系统与云端托管仓库的连接管道。

### 范围

**包含：**
- 凭证与远程信息配置
- 远程同步（push）操作及进度反馈
- 远程拉取（pull/fetch/merge）操作及冲突检测
- `sync()` 语义化接口实现（集成拉取和推送）
- 指数退避的重试机制实现
- 网络错误和认证错误处理

**不包含：**
- 冲突解决界面的实现 - Phase 1
- 定时自动同步触发器 - TASK012
- SSH 协议支持（MVP 仅支持 HTTP/HTTPS 基本认证）
- 分支管理（Phase 0/MVP 仅操作主分支 `main`）

## 技术要求

### 技术栈

- **isomorphic-git:** ^1.25.0（复用 TASK010 依赖）
- **isomorphic-git/http/node:** Node.js HTTP 客户端用于 git 操作
- **Node.js内置:** `events`（事件派发）

### 架构设计

在 `GitAbstraction` 类中扩展以下接口和数据模型：

```typescript
// src/main/services/types/git-abstraction.types.ts (在原有基础上扩展)

export interface SyncResult {
  readonly success: boolean
  readonly hasConflicts?: boolean
  readonly conflicts?: readonly string[]
  readonly error?: string
}

export interface PushResult {
  readonly success: boolean
  readonly result?: any
  readonly error?: string
}

export interface PullResult {
  readonly success: boolean
  readonly hasConflicts?: boolean
  readonly conflicts?: readonly string[]
  readonly result?: any
  readonly error?: string
}

export interface GitRemoteConfig {
  readonly url: string
  readonly token: string
}

// EventEmitter 定义
export interface GitSyncEvents {
  'sync:progress': (progress: { phase: string; loaded: number; total: number }) => void;
  'sync:error': (error: Error) => void;
}
```

```typescript
// src/main/services/git-abstraction.ts (在原有基础上扩展)
import http from 'isomorphic-git/http/node'
import { EventEmitter } from 'events'

export class GitAbstraction extends EventEmitter {
  // ... 原有属性
  private remoteUrl?: string
  private authToken?: string
  
  // 凭证配置
  async setRemote(url: string, token: string): Promise<void>
  
  // 远程操作
  async push(): Promise<PushResult>
  async pull(): Promise<PullResult>
  async sync(): Promise<SyncResult>
  
  // 内部辅助方法
  private async retryWithBackoff<T>(operation: () => Promise<T>, maxRetries?: number): Promise<T>
}
```

### 实现细节

#### 关键实现点

1. **设置远程仓库与凭证**
   ```typescript
   async setRemote(url: string, token: string): Promise<void> {
     if (!url || !token) {
       throw new GitAbstractionError(
         GitAbstractionErrorCode.CONFIG_FAILED,
         'Remote URL and token are required'
       )
     }
     
     this.remoteUrl = url
     this.authToken = token
     
     try {
       // 添加 remote origin
       await git.addRemote({
         fs,
         dir: this.workspaceDir,
         remote: 'origin',
         url
       })
       logger.info(`[GitAbstraction] Remote configured: ${url}`)
     } catch (error) {
       // 如果 remote 已经存在则静默忽略或进行更新
       logger.debug(`[GitAbstraction] Remote might already exist: ${error.message}`)
     }
   }
   ```

2. **实现 Pull 和 Push 操作**
   ```typescript
   async push(): Promise<PushResult> {
     this.requireRemoteConfig()
     
     try {
       const result = await this.retryWithBackoff(async () => {
         return await git.push({
           fs,
           http,
           dir: this.workspaceDir,
           remote: 'origin',
           ref: this.defaultBranch,
           onAuth: () => ({
             username: this.authToken,
             password: 'x-oauth-basic' // Gitea/GitHub Token 认证方式
           }),
           onProgress: (progress) => {
             this.emit('sync:progress', { phase: 'push', ...progress })
           }
         })
       })
       
       return { success: true, result }
     } catch (error) {
       logger.error(`[GitAbstraction] Push failed: ${error.message}`)
       return { success: false, error: error.message }
     }
   }
   
   async pull(): Promise<PullResult> {
     this.requireRemoteConfig()
     
     try {
       // Fetch 操作
       await this.retryWithBackoff(async () => {
         await git.fetch({
           fs,
           http,
           dir: this.workspaceDir,
           remote: 'origin',
           ref: this.defaultBranch,
           onAuth: () => ({
             username: this.authToken,
             password: 'x-oauth-basic'
           }),
           onProgress: (progress) => {
             this.emit('sync:progress', { phase: 'fetch', ...progress })
           }
         })
       })
       
       // Merge 操作
       const result = await git.merge({
         fs,
         dir: this.workspaceDir,
         ours: this.defaultBranch,
         theirs: `origin/${this.defaultBranch}`,
         author: {
           name: this.authorName,
           email: this.authorEmail
         }
       })
       
       // 检查冲突
       if (result.conflicts && result.conflicts.length > 0) {
         logger.warn(`[GitAbstraction] Pull completed with conflicts: ${result.conflicts.join(', ')}`)
         return {
           success: false,
           hasConflicts: true,
           conflicts: result.conflicts
         }
       }
       
       return { success: true, result }
     } catch (error) {
       logger.error(`[GitAbstraction] Pull failed: ${error.message}`)
       return { success: false, error: error.message }
     }
   }
   ```

3. **集成 Sync 操作**
   ```typescript
   async sync(): Promise<SyncResult> {
     // 按照 Git 最佳实践，先 pull 再 push
     logger.info(`[GitAbstraction] Starting sync process`)
     
     const pullResult = await this.pull()
     
     // 如果 pull 出现冲突，中断 sync 流程，将冲突交给上层处理
     if (!pullResult.success && pullResult.hasConflicts) {
       return {
         success: false,
         hasConflicts: true,
         conflicts: pullResult.conflicts
       }
     }
     
     // 如果网络或认证失败
     if (!pullResult.success) {
       return pullResult
     }
     
     // pull 成功后执行 push
     const pushResult = await this.push()
     
     if (!pushResult.success) {
       return {
         success: false,
         error: pushResult.error
       }
     }
     
     logger.info(`[GitAbstraction] Sync completed successfully`)
     return { success: true }
   }
   ```

4. **指数退避重试机制**
   ```typescript
   private async retryWithBackoff<T>(
     operation: () => Promise<T>,
     maxRetries: number = 3
   ): Promise<T> {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await operation()
       } catch (error) {
         const isAuthError = error.message.includes('401') || error.message.includes('403')
         
         // 认证错误不重试
         if (isAuthError || i === maxRetries - 1) {
           throw error
         }
         
         const delay = Math.pow(2, i) * 1000 // 1s, 2s
         logger.debug(`[GitAbstraction] Operation failed, retrying in ${delay}ms...`)
         await new Promise(resolve => setTimeout(resolve, delay))
       }
     }
     throw new Error('Max retries exceeded')
   }
   ```

### API 规范

不涉及 HTTP API，为内部 TypeScript 接口扩展。`GitAbstraction` 需继承 `EventEmitter`，在 Preload 和 IPC 层需要暴露相应的调用和事件监听能力（若尚未完成）。

## 验收标准

### 功能完整性

- [ ] 能够成功设置远程仓库 URL 和认证 Token
- [ ] `pull()` 能够从远端拉取并合并代码
- [ ] 当存在代码冲突时，`pull()` 能安全中止并返回明确的冲突文件列表
- [ ] `push()` 能够将本地提交推送到远端
- [ ] `sync()` 方法能够顺畅执行 pull-then-push 工作流
- [ ] 遇到暂时性网络错误时，系统能自动进行指数退避重试（最多 3 次）
- [ ] 遇到 401/403 认证错误时，系统不进行重试并立即返回错误
- [ ] 同步过程通过 `EventEmitter` 发出进度事件

### 性能指标

- [ ] 同步无变更的仓库（空 Sync）耗时 < 1.5 秒（依赖网络条件）
- [ ] 本地与远端差异不大时（<1MB），同步过程不阻塞应用渲染进程
- [ ] 内存使用稳定，不因大文件同步引发 OOM

### 用户体验

- [ ] 错误信息能明确区分"网络问题"、"认证失败"和"代码冲突"
- [ ] 进度事件颗粒度足以支持前端展示进度条或 Loading 状态

### 代码质量

- [ ] TypeScript strict mode 零警告/错误
- [ ] 扩展功能具有对应的单元测试和模拟测试（Mock `fetch` 或 `isomorphic-git/http`）
- [ ] 保持原 TASK010 的单测覆盖率（>80%）

## 测试标准

### 单元测试

**新增测试用例要求：**

1. **凭证配置测试**
   - 能够正常设置和读取远程配置
   - URL/Token 为空时抛出预期错误

2. **重试机制测试**
   - Mock 失败操作 1-2 次然后成功，验证操作返回成功
   - Mock 认证错误（401），验证立刻抛出异常不重试
   - Mock 持续失败，验证达到重试次数上限后抛出错误

3. **同步流程测试（Mock isomorphic-git 接口）**
   - `pull` 返回成功时，验证 `push` 被调用
   - `pull` 发现冲突时，验证 `push` 未被调用并返回冲突信息
   - `pull` 抛出异常时，验证 `sync` 返回对应错误状态

### 集成测试（需 Mock 远端或使用本地文件路径模拟远端）

1. **基本同步路径**
   - 创建本地仓库和模拟远端仓库
   - 测试完整的 pull -> modify -> stage -> commit -> push 流程

## 依赖关系

### 前置依赖

- ✅ PHASE0-TASK010 - Git 抽象层基础实现

### 被依赖任务

- PHASE0-TASK012 - 自动保存机制实现（强依赖此任务提供的 `sync()` 接口）
- Phase 1 所有冲突解决及远程团队协作功能

## 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 网络连接超时不可控 | 中 | 高 | 设定明确的 HTTP timeout，提供合理的指数退避策略 |
| isomorphic-git 与真实远端交互时可能遇到难以 Mock 的深层错误 | 中 | 中 | 对外输出错误前增加格式化过滤器，保障应用层获得标准错误结构 |
| 跨平台下 HTTP 代理配置导致 Node fetch 异常 | 低 | 中 | MVP 阶段暂不考虑复杂代理场景，后期通过支持自定义 http agent 解决 |

## 实施计划

1. **扩展类型定义与基础结构**（0.5天）
   - 在 types 中加入 SyncResult 等接口
   - 让 GitAbstraction 继承 EventEmitter
2. **凭证管理与 Push/Pull 实现**（1天）
   - 实现 `setRemote`
   - 集成 `isomorphic-git/http/node` 实现 `push` 和 `pull`
3. **退避重试与 Sync 整合**（1天）
   - 实现通用的 `retryWithBackoff` 装饰器或函数
   - 实现并封装 `sync()` 逻辑
4. **单元测试与集成测试**（1天）
   - 编写 Mock 测试
   - 处理各种网络异常的分支覆盖
   - 修复潜在的 Bug

## 备注

为了使上层 IPC/UI 能够感知同步进度，请确保 `EventEmitter` 事件能够顺利桥接到 TASK008 中建立的 IPC 系统，或者为此建立专门的 `SyncHandler`（可以推迟到 TASK012 实施，但本任务必须留下触发点）。