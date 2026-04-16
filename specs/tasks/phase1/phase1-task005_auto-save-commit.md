# 自动保存与隐式提交

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK005 |
| **任务标题** | 自动保存与隐式提交 |
| **所属阶段** | Phase 1 - MVP 核心功能（Sprint 2） |
| **优先级** | P0 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

在 Phase 0 SyncManager 框架之上，完善自动保存与隐式提交的完整闭环。实现"用户停止输入 1 秒后自动保存 → 批量聚合 commit → 友好 commit message 生成"的核心链路，彻底消除用户的手动保存负担。

### 背景

需求 2.1 要求："作为用户，我希望文件修改后自动保存，不需要手动操作。" Phase 0 TASK012 已搭建 SyncManager 骨架，具备防抖提交和定时同步的基础框架。本任务需要在此基础上完成三项关键升级：

1. **多文件批量聚合**：5 秒内修改的多个文件合并为一次 commit，避免产生过多碎片提交
2. **友好的 commit message 生成**：遵循格式 `[成员名] 更新 文件名: 变更摘要`，在版本历史中对用户可读
3. **错误重试与通知**：保存失败时向用户展示警告并提供重试入口

这符合 CLAUDE.md"Git 不可见"哲学——用户只看到"已保存"，不看到任何 Git 术语。

### 范围

**包含：**
- 升级 SyncManager 的防抖提交逻辑，支持多文件批量聚合
- 实现友好的 commit message 生成策略
- 实现保存失败的错误通知与自动重试
- 集成到现有文件编辑流程（Tiptap 编辑器内容变更 → 保存触发）
- 文件保存使用原子写入（临时文件 + rename）

**不包含：**
- 远程同步逻辑（TASK006）
- 同步状态 UI（TASK007）
- 冲突处理（TASK008）
- 版本历史展示（TASK009）

## 技术要求

### 技术栈

- **SyncManager** — Phase 0 已有基础（`src/main/services/sync-manager.ts`）
- **GitAbstraction** — Phase 0 已有（`src/main/services/git-abstraction.ts`）
- **FileManager** — Phase 0 已有（`src/main/services/file-manager.ts`）
- **TypeScript strict mode** — 禁止 any
- **Vitest** — 单元测试

### 架构设计

```
主进程 (Main Process)
├── src/main/services/
│   ├── sync-manager.ts              # 升级：批量聚合 + 友好 commit message
│   └── auto-save-manager.ts         # 新增：独立的自动保存管理器
└── src/main/ipc/handlers/
    └── file.handler.ts              # 扩展：保存状态通知
```

#### 核心类型定义

```typescript
// src/main/services/types/auto-save.types.ts

/** Auto-save configuration */
export interface AutoSaveConfig {
  /** Debounce delay in milliseconds (default: 1000) */
  readonly debounceMs: number
  /** Batch window for aggregating multiple files (default: 5000) */
  readonly batchWindowMs: number
  /** Maximum retry attempts on failure (default: 3) */
  readonly maxRetries: number
}

/** Single file save result */
export interface SaveResult {
  readonly filePath: string
  readonly success: boolean
  readonly error?: string
}

/** Batch commit result */
export interface BatchCommitResult {
  readonly commitOid: string
  readonly files: readonly string[]
  readonly message: string
}
```

### 实现细节

#### 子任务 5.1：AutoSaveManager 独立模块

将自动保存逻辑从 SyncManager 中解耦，创建独立的 `AutoSaveManager`：

```typescript
// src/main/services/auto-save-manager.ts

export class AutoSaveManager extends EventEmitter {
  private readonly pendingFiles: Map<string, string> = new Map()
  private saveTimer: NodeJS.Timeout | null = null
  private batchTimer: NodeJS.Timeout | null = null
  private readonly config: AutoSaveConfig

  constructor(
    config: AutoSaveConfig,
    private readonly fileManager: FileManager,
    private readonly gitAbstraction: GitAbstraction,
    private readonly userName: string
  ) {
    super()
    this.config = config
  }

  /**
   * Called when a file's content changes in the editor.
   * Starts debounce timer and batches files.
   */
  onFileChanged(filePath: string, content: string): void {
    this.pendingFiles.set(filePath, content)

    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.flush(), this.config.debounceMs)
  }

  /**
   * Flush all pending file saves and create a batch commit.
   */
  private async flush(): Promise<void> {
    if (this.pendingFiles.size === 0) return

    const files = new Map(this.pendingFiles)
    this.pendingFiles.clear()

    const results: SaveResult[] = []

    for (const [filePath, content] of files) {
      try {
        await this.fileManager.writeFile(filePath, content)
        results.push({ filePath, success: true })
      } catch (error) {
        results.push({
          filePath,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    const succeededFiles = results.filter(r => r.success).map(r => r.filePath)
    if (succeededFiles.length > 0) {
      const message = this.generateCommitMessage(succeededFiles)
      try {
        const oid = await this.gitAbstraction.commitAll(message)
        this.emit('committed', { commitOid: oid, files: succeededFiles, message })
      } catch (error) {
        this.emit('error', { type: 'commit', error })
      }
    }

    const failedResults = results.filter(r => !r.success)
    if (failedResults.length > 0) {
      this.emit('save-failed', failedResults)
    }
  }

  /**
   * Generate human-readable commit message.
   * Format: [成员名] 更新 文件名 for single file,
   *         [成员名] 更新 N 个文件 for multiple files.
   */
  private generateCommitMessage(files: string[]): string {
    if (files.length === 1) {
      const baseName = path.basename(files[0])
      return `[${this.userName}] 更新 ${baseName}`
    }
    return `[${this.userName}] 更新 ${files.length} 个文件`
  }
}
```

**设计决策**：
- 使用 `Map<filePath, content>` 而非 `Set<filePath>` 跟踪待保存文件，确保总是保存最新内容
- 继承 `EventEmitter`，向外发出 `committed`、`save-failed`、`error` 事件
- commit message 严格遵循需求 2.1 的格式规范

#### 子任务 5.2：批量聚合窗口

```typescript
// 在 flush 方法基础上，增加 batch window 支持

onFileChanged(filePath: string, content: string): void {
  this.pendingFiles.set(filePath, content)

  // First file in batch: start batch window
  if (!this.batchTimer && this.pendingFiles.size === 1) {
    this.batchTimer = setTimeout(() => {
      this.batchTimer = null
      this.flush()
    }, this.config.batchWindowMs)
  }

  // Debounce: reset the immediate flush timer
  if (this.saveTimer) clearTimeout(this.saveTimer)
  this.saveTimer = setTimeout(() => {
    this.saveTimer = null
    if (this.batchTimer) {
      clearTimeout(this.batchTimer)
      this.batchTimer = null
    }
    this.flush()
  }, this.config.debounceMs)
}
```

**时序逻辑**：
1. 用户停止输入 1 秒 → 触发 `debounceMs` 计时器到时 → 立即 flush
2. 如果 1 秒内用户继续输入 → 计时器重置，继续等待
3. 如果 5 秒内持续有文件变更 → `batchWindowMs` 到时强制 flush，聚合所有文件

#### 子任务 5.3：原子写入与错误重试

```typescript
private async saveWithRetry(
  filePath: string,
  content: string,
  attempt: number = 1
): Promise<SaveResult> {
  try {
    await this.fileManager.writeFile(filePath, content)
    return { filePath, success: true }
  } catch (error) {
    if (attempt < this.config.maxRetries) {
      this.emit('retry', { filePath, attempt })
      await new Promise(resolve => setTimeout(resolve, attempt * 1000))
      return this.saveWithRetry(filePath, content, attempt + 1)
    }
    return {
      filePath,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
```

- FileManager.writeFile 内部已实现原子写入（临时文件 + rename）
- 重试间隔递增（1s, 2s, 3s）
- 超过最大重试次数后发出 `save-failed` 事件

#### 子任务 5.4：IPC 通知与前端集成

```typescript
// src/main/ipc/handlers/file.handler.ts (扩展)

// AutoSaveManager events → IPC → Renderer
autoSaveManager.on('committed', (result: BatchCommitResult) => {
  mainWindow?.webContents.send('file:autoSaved', {
    files: result.files,
    timestamp: Date.now()
  })
})

autoSaveManager.on('save-failed', (failedResults: SaveResult[]) => {
  mainWindow?.webContents.send('file:saveFailed', {
    files: failedResults.map(r => ({ path: r.filePath, error: r.error }))
  })
})
```

渲染进程通过监听 `file:autoSaved` 和 `file:saveFailed` 事件更新 UI 状态。文件保存失败时在编辑器顶部显示黄色警告条，提供"重试"按钮。

#### 子任务 5.5：编辑器集成

将 Tiptap 编辑器的内容变更桥接到 AutoSaveManager：

```typescript
// 渲染进程侧
editor.on('update', ({ editor }) => {
  const content = editor.getHTML()
  // 通过 IPC 通知主进程文件变更
  window.electronAPI.file.notifyChange(activeFilePath, content)
})
```

```typescript
// 主进程侧 IPC handler
ipcMain.on('file:notifyChange', (_, filePath: string, content: string) => {
  autoSaveManager.onFileChanged(filePath, content)
})
```

### 数据模型

无新增数据库模型。复用 FileManager 和 GitAbstraction 的现有数据结构。

### API 规范

**新增 IPC 通道：**

| IPC 通道 | 方向 | 参数 | 返回值 | 说明 |
|---------|------|------|--------|------|
| `file:notifyChange` | Renderer → Main | `(filePath: string, content: string)` | void | 编辑器内容变更通知 |
| `file:autoSaved` | Main → Renderer | — | `{ files: string[], timestamp: number }` | 自动保存成功事件 |
| `file:saveFailed` | Main → Renderer | — | `{ files: Array<{path: string, error: string}> }` | 保存失败事件 |
| `file:retrySave` | Renderer → Main | `(filePath: string)` | `IPCResponse<void>` | 手动重试保存 |

## 验收标准

### 功能完整性

> 以下标准直接追溯自需求 2.1。

- [ ] 用户停止输入 1 秒后系统自动保存文件到磁盘（需求 2.1 AC1）
- [ ] 文件自动保存后 2 秒内创建 Git commit（需求 2.1 AC2）
- [ ] 5 秒内修改的多个文件合并为单次 commit（需求 2.1 AC3）
- [ ] commit message 格式为 `[成员名] 更新 文件名` 或 `[成员名] 更新 N 个文件`（需求 2.1 AC4）
- [ ] 自动保存失败时显示警告通知并提供重试（需求 2.1 AC5）

### 性能指标

- [ ] 防抖后保存延迟 < 1 秒
- [ ] Git commit 操作 < 500ms
- [ ] 批量保存 10 个文件 < 3 秒
- [ ] 不阻塞渲染进程（保存操作在主进程执行）

### 用户体验

- [ ] 编辑器无"保存"按钮，用户无需手动操作
- [ ] 文件树中已修改文件有视觉标识（如小圆点）
- [ ] 保存失败时编辑器顶部显示黄色警告条
- [ ] 成功保存后文件树标识自动消失

### 代码质量

- [ ] TypeScript strict mode 无错误
- [ ] ESLint 检查通过，无警告
- [ ] 所有公共函数有 JSDoc 注释
- [ ] 代码审查通过

## 测试标准

### 单元测试

**测试覆盖率目标：** ≥ 80%

**关键测试用例：**

1. **防抖逻辑测试**
   - 输入：连续 5 次对同一文件调用 onFileChanged，每次间隔 200ms
   - 预期：仅触发 1 次 flush，保存最新内容
   - 边界条件：恰好 1 秒后触发

2. **批量聚合测试**
   - 输入：在 3 秒内对 3 个不同文件调用 onFileChanged
   - 预期：合并为 1 次 commit，包含 3 个文件
   - 边界条件：第 4 个文件在 6 秒后才到达，应触发第二次独立 commit

3. **commit message 生成测试**
   - 输入：单文件路径 `docs/product/prd.md`
   - 预期：`[Alice] 更新 prd.md`
   - 边界条件：多个文件时格式正确

4. **错误重试测试**
   - 输入：FileManager.writeFile 连续失败 3 次
   - 预期：发出 save-failed 事件，错误信息清晰
   - 边界条件：第 2 次重试成功

5. **空内容处理测试**
   - 输入：文件内容为空字符串
   - 预期：正常保存（允许清空文件）

### 集成测试

**测试场景：**

1. 编辑器变更 → IPC notifyChange → AutoSaveManager → FileManager 写入 → GitAbstraction commit → 验证 .git 中有对应提交
2. 多文件并发变更 → 验证批量聚合 → 验证 commit message 格式
3. 保存失败 → 验证前端收到 saveFailed 事件

## 依赖关系

### 前置依赖

- [x] PHASE0-TASK010（Git 抽象层基础）— 提供 commit/stageFile 接口
- [x] PHASE0-TASK011（Git 远程同步）— GitAbstraction 完整接口
- [x] PHASE0-TASK012（自动保存机制）— SyncManager 框架
- [x] PHASE1-TASK002（WYSIWYG 编辑器）— Tiptap 编辑器集成点

### 被依赖任务

- PHASE1-TASK006（自动同步）— 需要 AutoSaveManager 产生 commit 后才触发同步
- PHASE1-TASK007（同步状态 UI）— 需要本任务的 IPC 事件

### 阻塞风险

- FileManager 的原子写入实现可能影响保存延迟
- Tiptap 编辑器的 update 事件频率可能很高，需确保防抖有效

## 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 高频编辑场景下 Git commit 性能瓶颈 | 中 | 中 | 批量聚合减少 commit 频率；commit 在主进程不阻塞渲染 |
| 并发文件写入冲突 | 低 | 低 | FileManager 原子写入保证数据安全 |
| commit message 中文编码问题 | 低 | 低 | isomorphic-git 原生支持 UTF-8 |

### 时间风险

编辑器集成可能需要与 TASK002（Tiptap 编辑器）协调，确保 on('update') 事件正确触发。

### 资源风险

无额外依赖。

## 参考文档

- [`CLAUDE.md`](../../../CLAUDE.md) — 项目规范（"Git 不可见"、"原子写入"）
- [`specs/design/architecture.md`](../../design/architecture.md) — 系统架构（数据流概览）
- [`specs/design/data-and-api.md`](../../design/data-and-api.md) — IPC 接口定义
- [`specs/design/ui-ux-design.md`](../../design/ui-ux-design.md) — UI/UX 设计规范
- [`specs/requirements/phase1/sprint2-git-sync.md`](../../requirements/phase1/sprint2-git-sync.md) — 需求 2.1
- [isomorphic-git Skill](../../../../.kilocode/skills/phase0/isomorphic-git-integration/SKILL.md)
- [Electron IPC Skill](../../../../.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md)
- `src/main/services/sync-manager.ts` — Phase 0 SyncManager
- `src/main/services/git-abstraction.ts` — Phase 0 GitAbstraction

## 实施计划

### 第 1 步：定义类型和接口

- 创建 `src/main/services/types/auto-save.types.ts`
- 定义 `AutoSaveConfig`、`SaveResult`、`BatchCommitResult` 接口
- 预计耗时：1 小时

### 第 2 步：实现 AutoSaveManager 核心逻辑

- 创建 `src/main/services/auto-save-manager.ts`
- 实现防抖逻辑（debounceMs = 1000）
- 实现批量聚合窗口（batchWindowMs = 5000）
- 实现 `generateCommitMessage()` 格式化方法
- 预计耗时：3 小时

### 第 3 步：集成 FileManager 和 GitAbstraction

- 依赖注入 FileManager 和 GitAbstraction
- 实现原子写入 + 自动 stage + commit 流程
- 实现错误重试机制（指数退避，最多 3 次）
- 预计耗时：2 小时

### 第 4 步：IPC 通道注册

- 新增 `file:notifyChange` IPC 通道
- 新增 `file:autoSaved` 和 `file:saveFailed` 事件推送
- 新增 `file:retrySave` 手动重试通道
- 扩展 Preload API 和 IPCChannelMap
- 预计耗时：2 小时

### 第 5 步：编辑器集成

- 在 Tiptap 编辑器的 `onUpdate` 回调中触发 `file:notifyChange`
- 在渲染进程监听 `file:autoSaved` 和 `file:saveFailed` 更新 UI
- 实现保存失败警告条组件
- 预计耗时：2 小时

### 第 6 步：测试编写

- AutoSaveManager 单元测试（防抖、聚合、message 生成、重试）
- IPC 集成测试
- 确保 ≥ 80% 覆盖率
- 预计耗时：4 小时

## 完成标准

**本任务完成的标志：**

1. 用户在编辑器中修改文件后 1 秒自动保存，产生 Git commit
2. 多文件并发修改在 5 秒内聚合为单次 commit
3. commit message 对用户友好，不包含 Git 术语
4. 保存失败有清晰的错误通知和重试入口
5. 单元测试覆盖率 ≥ 80%

**交付物：**

- [ ] `src/main/services/auto-save-manager.ts`（新增）
- [ ] `src/main/services/types/auto-save.types.ts`（新增）
- [ ] `src/main/ipc/handlers/file.handler.ts`（扩展）
- [ ] `src/preload/index.ts`（扩展）
- [ ] `src/shared/types.ts`（扩展：IPC 通道常量）
- [ ] 保存失败警告条 UI 组件
- [ ] 对应的测试文件

## 备注

- 本任务将 AutoSaveManager 从 SyncManager 中解耦，职责更清晰
- SyncManager 保留定时同步和网络监听职责（TASK006 负责）
- AutoSaveManager 发出 `committed` 事件后，SyncManager 可监听该事件触发即时同步
- 后续可扩展：保存前 AI 内容预处理、自动格式化

---

**创建时间：** 2026-04-17
**最后更新：** 2026-04-17
**更新记录：**
- 2026-04-17 — 创建任务文档
