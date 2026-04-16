# PHASE1-TASK005: 自动保存与隐式提交 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task005_auto-save-commit.md](../specs/tasks/phase1/phase1-task005_auto-save-commit.md)
> 创建日期：2026-04-17
> 最后更新：2026-04-17

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK005 |
| **任务标题** | 自动保存与隐式提交 |
| **优先级** | P0 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **前置依赖** | ✅ Phase0 SyncManager、✅ Phase0 GitAbstraction、✅ Phase0 FileManager、🔄 PHASE1-TASK002（Tiptap 编辑器） |

### 目标

在 Phase 0 SyncManager 框架之上，构建完整的自动保存与隐式提交闭环。核心链路：用户停止输入 1 秒后自动保存 → 批量聚合多文件变更 → 生成友好 commit message → 静默完成 Git commit。用户全程无感知，彻底消除手动保存负担。

### 核心命题

CLAUDE.md"Git 不可见"哲学的直接实现——用户只看到"已保存"，不看到任何 Git 术语。本任务是连接渲染进程编辑器与主进程 Git 抽象层的关键桥梁。

### 范围边界

**包含：**
- 新建独立 `AutoSaveManager` 服务，从 SyncManager 中解耦自动保存职责
- 实现防抖写入（1 秒）+ 批量聚合窗口（5 秒）
- 友好 commit message 生成（`[成员名] 更新 文件名`）
- 错误重试与失败通知
- IPC 通道 `file:notifyChange` / `file:autoSaved` / `file:saveFailed` / `file:retrySave`
- Tiptap 编辑器 `onUpdate` → IPC → AutoSaveManager 集成
- 保存失败警告条 UI 组件

**不包含：**
- 远程同步逻辑（TASK006）
- 同步状态 UI（TASK007）
- 冲突处理（TASK008）
- 版本历史展示（TASK009）

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 路径 | 关键约束 |
|------|------|---------|
| 项目宪法 | `CLAUDE.md` | TypeScript 严格模式禁止 any；文件即真相；Git 不可见；注释英文/commit 中文；主进程与渲染进程严格隔离；所有写入操作必须先写临时文件再原子替换 |
| 系统架构 | `specs/design/architecture.md` | 渲染进程禁止直接访问文件系统；IPC 通信严格隔离；编辑器→Git抽象层→云端 数据流：防抖1秒→自动保存→Git add+commit |
| UI/UX 规范 | `specs/design/ui-ux-design.md` | >2s 操作需进度反馈；文件丢失不可接受；AI 输出涉及文件修改必须展示 diff 预览 |
| 数据模型与 API | `specs/design/data-and-api.md` | `file:write` IPC 通道定义；`FileInfo` / `FileContent` 类型；IPC 通信模式：invoke/handle + send/on |
| 需求规格 | `specs/requirements/phase1/sprint2-git-sync.md` | 需求 2.1 五条验收标准：防抖1秒保存、2秒内commit、5秒内多文件聚合、友好message、失败通知+重试 |
| 任务规格 | `specs/tasks/phase1/phase1-task005_auto-save-commit.md` | 5 个子任务、5 条功能验收标准、5 类测试用例、6 步实施计划 |

### 2.2 Skill 依赖

| Skill | 路径 | 使用场景 |
|-------|------|---------|
| `electron-ipc-patterns` | `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` | `file:notifyChange` 单向通知（send/on 模式）；`file:autoSaved` / `file:saveFailed` 主进程→渲染进程事件推送（webContents.send）；类型安全 IPCChannelMap 扩展；错误处理与超时 |
| `isomorphic-git-integration` | `.kilocode/skills/phase0/isomorphic-git-integration/SKILL.md` | Git 抽象层调用规范：`stageFile()` + `commit()` 流程；批量提交策略（多文件单次 commit）；错误码处理（NOTHING_TO_COMMIT / NOT_INITIALIZED） |
| `typescript-strict-mode` | `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` | `AutoSaveConfig` / `SaveResult` / `BatchCommitResult` 严格类型；EventEmitter 类型安全；泛型约束 |
| `zustand-state-management` | `.kilocode/skills/phase1/zustand-state-management/SKILL.md` | 保存状态管理（saving / saved / error）；selector 优化避免编辑器重渲染 |
| `tiptap-wysiwyg-editor` | `.kilocode/skills/phase1/tiptap-wysiwyg-editor/SKILL.md` | Tiptap `onUpdate` 回调集成；编辑器内容变更→保存触发桥接 |
| `vercel-react-best-practices` | `.kilocode/skills/common/vercel-react-best-practices/SKILL.md` | 警告条组件 memo 优化；useCallback 稳定引用；避免保存状态引起全局重渲染 |

### 2.3 前置代码依赖

| 模块 | 路径 | 行数 | 状态 | 说明 |
|------|------|------|------|------|
| SyncManager | `src/main/services/sync-manager.ts` | 534 | ✅ 已完成 | 提供 `notifyFileChanged()` 防抖提交 + `enqueueGitOp()` Git 操作串行队列；**关键缺口：`notifyFileChanged()` 从未被调用，缺少渲染进程→主进程的桥接** |
| GitAbstraction | `src/main/services/git-abstraction.ts` | 2185 | ✅ 已完成 | 提供 `stageFile()` / `commit()` / `commitAll()` 方法；commit 返回 OID；支持 NOT_INITIALIZED / NOTHING_TO_COMMIT 错误码 |
| FileManager | `src/main/services/file-manager.ts` | 1581 | ✅ 已完成 | 提供 `writeFile()` 原子写入（临时文件+rename）+ 3次重试；`startWatching()` chokidar 文件监听 |
| FileHandler | `src/main/ipc/handlers/file.handler.ts` | 389 | ✅ 已完成 | 已注册 `file:read` / `file:write` 等 16 个 IPC 通道；需扩展 `file:notifyChange` / `file:retrySave` |
| SyncHandler | `src/main/ipc/handlers/sync.handler.ts` | 130 | ✅ 已完成 | 监听 SyncManager `status:changed` 事件广播到渲染进程；本任务需扩展监听 AutoSaveManager 事件 |
| Preload API | `src/preload/index.ts` | 532 | ✅ 已完成 | `safeInvoke()` + 30s 超时 + 白名单；需扩展 `file.notifyChange` / `file.onAutoSaved` / `file.onSaveFailed` / `file.retrySave` |
| 共享类型 | `src/shared/types.ts` | 847 | ✅ 已完成 | 33 个 IPC_CHANNELS、IPCChannelMap、IPCResponse<T>；需扩展 auto-save 相关通道和类型 |
| WysiwygEditor | `src/renderer/components/editor/WysiwygEditor.tsx` | 270 | ✅ 已完成 | 使用 `useAutoSave` Hook 处理防抖保存；`onDirtyChange` / `onSave` 回调；Cmd+S 手动保存 |
| useAutoSave Hook | `src/renderer/hooks/useAutoSave.ts` | 115 | ✅ 已完成 | 渲染进程侧防抖保存逻辑；直接调用 `window.electronAPI.file.write()`；需改造为通过 AutoSaveManager 统一管理 |
| editorStore | `src/renderer/store/editorStore.ts` | 76 | ✅ 已完成 | `isDirty` / `isSaving` / `lastSavedAt` / `saveError` 状态；setters + selectors |
| tabStore | `src/renderer/store/tabStore.ts` | — | ✅ 已完成 | Tab 脏标记管理；保存后需清除脏标记 |
| Logger | `src/main/utils/logger.ts` | — | ✅ 已完成 | 结构化日志 `logger.info()` / `logger.warn()` / `logger.error()` |
| sync-manager.types | `src/main/services/types/sync-manager.types.ts` | 79 | ✅ 已完成 | `SyncManagerConfig` / `SyncManagerEvents` / `SyncManagerEventName` |

### 2.4 被依赖任务

| 任务 | 依赖方式 |
|------|---------|
| PHASE1-TASK006（自动同步） | AutoSaveManager 发出 `committed` 事件后，SyncManager 可监听该事件触发即时同步 |
| PHASE1-TASK007（同步状态 UI） | 复用本任务的 `file:autoSaved` / `file:saveFailed` IPC 事件通道 |

### 2.5 npm 依赖

无需新增 npm 包。所有核心依赖（isomorphic-git、electron、events、react）已安装。

---

## 三、现有代码盘点与差距分析

> **关键发现：** 当前代码库存在两条平行的保存链路，缺少统一编排层。
>
> **链路 A（渲染进程侧）：** WysiwygEditor → useAutoSave（防抖1s）→ `window.electronAPI.file.write()` → FileHandler.writeFile → FileManager.writeFile（原子写入）→ 磁盘。此链路 **不触发 Git commit**。
>
> **链路 B（主进程侧）：** SyncManager.notifyFileChanged()（防抖1s）→ autoCommitFile → stageFile + commit。此链路 **从未被调用**——`notifyFileChanged()` 是一个等待集成的公开 API。
>
> **核心缺口：** 链路 A 和链路 B 之间没有桥接。文件写入磁盘后没有触发 Git commit，SyncManager 的 auto-commit 逻辑处于休眠状态。

### 3.1 需新建的文件

| # | 文件路径 | 类型 | 说明 |
|---|---------|------|------|
| 1 | `src/main/services/auto-save-manager.ts` | 新增 | 独立的自动保存管理器，统一编排 写入+commit+重试+通知 |
| 2 | `src/main/services/types/auto-save.types.ts` | 新增 | AutoSaveConfig / SaveResult / BatchCommitResult / AutoSaveManagerEvents 类型定义 |
| 3 | `src/renderer/components/editor/SaveFailureBanner.tsx` | 新增 | 保存失败警告条组件（编辑器顶部黄色横幅 + 重试按钮） |

### 3.2 需修改的文件

| # | 文件路径 | 修改内容 | 风险 |
|---|---------|---------|------|
| 1 | `src/shared/types.ts` | 新增 `FILE_NOTIFY_CHANGE` / `FILE_AUTO_SAVED` / `FILE_SAVE_FAILED` / `FILE_RETRY_SAVE` 四个 IPC 通道常量；扩展 `IPCChannelMap`；新增 `AutoSavePayload` / `SaveFailedPayload` 类型 | 低 — 纯新增 |
| 2 | `src/main/ipc/handlers/file.handler.ts` | 新增 `file:notifyChange`（send/on 模式）和 `file:retrySave`（invoke/handle 模式）handler；注入 AutoSaveManager 实例；连接 AutoSaveManager 事件→IPC 推送 | 中 — 扩展现有 handler |
| 3 | `src/preload/index.ts` | 新增 `file.notifyChange()` / `file.onAutoSaved()` / `file.onSaveFailed()` / `file.retrySave()` 四个 API 方法；更新白名单 | 中 — 修改 preload 桥接 |
| 4 | `src/renderer/hooks/useAutoSave.ts` | 改造为通过 `file.notifyChange` IPC 通知主进程（而非直接调用 `file.write`），保留渲染进程侧的 dirty/saving 状态管理 | 高 — 核心保存逻辑变更 |
| 5 | `src/renderer/components/editor/WysiwygEditor.tsx` | 集成 `SaveFailureBanner` 组件；监听 `file:autoSaved` / `file:saveFailed` 事件更新 UI | 中 — 扩展编辑器组件 |
| 6 | `src/main/services/sync-manager.ts` | 可选改造：SyncManager 监听 AutoSaveManager 的 `committed` 事件触发即时同步（本任务仅预留接口，TASK006 完善） | 低 — 可选扩展 |

### 3.3 现有保存链路详解与桥接决策

**渲染进程侧链路（useAutoSave Hook，115行）：** 监听 Tiptap `update` 事件 → 防抖 1s → `file.write()` 写入磁盘。**问题：不触发 Git commit。**

**主进程侧链路（SyncManager.notifyFileChanged()，:330-358）：** Per-file 防抖 1s → `stageFile` + `commit`。**问题：从未被任何代码调用。**

**桥接决策——方案 A（选用）：** 创建独立 AutoSaveManager，将文件写入和 Git commit 统一在主进程完成。渲染进程仅通过 IPC 发送 `file:notifyChange` 通知内容变更。

选择理由：1) 职责更清晰 2) 批量聚合更容易 3) 符合 CLAUDE.md 进程隔离约束

### 3.4 现有 SyncManager 与 AutoSaveManager 的职责划分

| 职责 | SyncManager（保留） | AutoSaveManager（新增） |
|------|---------------------|------------------------|
| 定时同步（30s push/pull） | ✅ | ❌ |
| 网络监听（online/offline） | ✅ | ❌ |
| 强制同步（forceSync） | ✅ | ❌ |
| 文件写入（原子写入） | ❌ | ✅ |
| 防抖写入（1s） | ❌ | ✅ |
| 批量聚合（5s 窗口） | ❌ | ✅ |
| 友好 commit message | ❌ | ✅ |
| 错误重试（写入失败） | ❌ | ✅ |
| 保存状态通知（IPC） | ❌ | ✅ |

SyncManager 保留定时同步和网络监听职责（TASK006 完善），AutoSaveManager 专注写入+提交链路。AutoSaveManager 发出 `committed` 事件后，SyncManager 可监听该事件触发即时同步（TASK006 集成点）。

---

## 四、类型系统设计

> 类型定义分两处：服务层内部类型放 `src/main/services/types/auto-save.types.ts`，IPC 通信层类型放 `src/shared/types.ts`。

### 4.1 服务层类型（auto-save.types.ts 新增）

```typescript
// src/main/services/types/auto-save.types.ts

export interface AutoSaveConfig {
  readonly debounceMs: number
  readonly batchWindowMs: number
  readonly maxRetries: number
}

export interface SaveResult {
  readonly filePath: string
  readonly success: boolean
  readonly error?: string
}

export interface BatchCommitResult {
  readonly commitOid: string
  readonly files: readonly string[]
  readonly message: string
}

export interface AutoSaveManagerEvents {
  committed: [result: BatchCommitResult]
  'save-failed': [failedResults: SaveResult[]]
  error: [data: { type: 'commit' | 'write'; error: Error }]
  retry: [data: { filePath: string; attempt: number }]
}

export const DEFAULT_AUTO_SAVE_CONFIG: AutoSaveConfig = {
  debounceMs: 1000,
  batchWindowMs: 5000,
  maxRetries: 3,
} as const
```

**设计决策：**
- `AutoSaveConfig` 使用 `readonly` 属性，防止运行时修改
- `BatchCommitResult.files` 使用 `readonly string[]`，表明 commit 不可变
- `AutoSaveManagerEvents` 使用元组类型（`[result: BatchCommitResult]`），与 SyncManager 的 `SyncManagerEvents` 模式一致，支持类型安全 EventEmitter
- `DEFAULT_AUTO_SAVE_CONFIG` 提供默认值常量

### 4.2 共享类型（shared/types.ts 扩展）

#### 新增 IPC 通道常量

```typescript
// 在 IPC_CHANNELS 对象中新增：
FILE_NOTIFY_CHANGE: 'file:notifyChange',
FILE_AUTO_SAVED: 'file:autoSaved',
FILE_SAVE_FAILED: 'file:saveFailed',
FILE_RETRY_SAVE: 'file:retrySave',
```

#### 新增 IPC 负载类型

```typescript
export interface AutoSavedPayload {
  readonly files: string[]
  readonly timestamp: number
}

export interface SaveFailedPayload {
  readonly files: ReadonlyArray<{ path: string; error: string }>
}
```

#### IPCChannelMap 扩展

```typescript
// Renderer → Main (invoke/handle)
[IPC_CHANNELS.FILE_RETRY_SAVE]: {
  params: [filePath: string]
  return: IPCResponse<void>
}

// Renderer → Main (send/on，不走 IPCChannelMap)
// FILE_NOTIFY_CHANGE: 单向通知，无返回值

// Main → Renderer (webContents.send，不走 IPCChannelMap)
// FILE_AUTO_SAVED: AutoSavedPayload
// FILE_SAVE_FAILED: SaveFailedPayload
```

**设计决策：**
- `file:notifyChange` 使用 `send/on` 单向模式（渲染进程不需要等待保存完成，由事件推送通知结果）
- `file:autoSaved` / `file:saveFailed` 是 Main→Renderer 事件推送，不走 IPCChannelMap
- `file:retrySave` 使用 `invoke/handle` 模式（用户点击重试按钮，需要等待结果）

### 4.3 渲染进程组件类型（组件内部定义）

```typescript
// SaveFailureBanner 组件 Props
interface SaveFailureBannerProps {
  readonly failedFiles: ReadonlyArray<{ path: string; error: string }>
  readonly onRetry: (filePath: string) => void
  readonly onDismiss: () => void
}
```

---

## 五、AutoSaveManager 服务设计

### 5.1 类结构

```typescript
// src/main/services/auto-save-manager.ts

export class AutoSaveManager extends (
  EventEmitter as new () => TypedEventEmitter<AutoSaveManagerEvents> & EventEmitter
) {
  // ─── Dependencies ──────────────────────────────────
  private readonly fileManager: FileManager
  private readonly gitAbstraction: GitAbstraction

  // ─── Configuration ─────────────────────────────────
  private readonly config: AutoSaveConfig
  private readonly userName: string

  // ─── Pending files (content awaiting save) ─────────
  private readonly pendingFiles: Map<string, string> = new Map()

  // ─── Timers ────────────────────────────────────────
  private saveTimer: ReturnType<typeof setTimeout> | null = null
  private batchTimer: ReturnType<typeof setTimeout> | null = null

  // ─── Content cache for retry ───────────────────────
  private readonly contentCache: Map<string, string> = new Map()
}
```

**设计决策：**
- 使用 `Map<filePath, content>` 跟踪待保存文件（而非 `Set<filePath>`），确保总是保存最新内容
- `contentCache` 保存最近一次成功发送的内容，用于手动重试时获取内容
- 继承 `TypedEventEmitter<AutoSaveManagerEvents>`，与 SyncManager 的类型安全 EventEmitter 模式一致
- 构造函数注入 `FileManager`、`GitAbstraction`、`userName`（来自 workspace 配置）

### 5.2 核心方法：onFileChanged

```
签名: onFileChanged(filePath: string, content: string): void

调用时机: 渲染进程编辑器内容变更 → IPC file:notifyChange → 此方法

逻辑:
  1. pendingFiles.set(filePath, content)  — 覆盖旧内容，保留最新
  2. contentCache.set(filePath, content)  — 缓存用于重试
  3. 如果 saveTimer 存在 → clearTimeout(saveTimer)
  4. 启动新的 saveTimer (debounceMs):
     - 到期后 → 清除 batchTimer → flush()
  5. 如果 batchTimer 不存在 且 pendingFiles.size === 1:
     - 启动 batchTimer (batchWindowMs):
       - 到期后 → batchTimer = null → flush()

时序逻辑:
  用户停止输入 1秒 → debounceMs 到期 → 清除 batchTimer → flush()
  如果 1秒内继续输入 → 计时器重置
  如果 5秒内持续有变更 → batchWindowMs 到期强制 flush
```

**为什么两个计时器：**
- `saveTimer`（debounce）：确保用户停止输入 1 秒后立即保存，响应灵敏
- `batchTimer`（batch window）：如果用户持续编辑不同文件，5 秒后强制 flush 聚合所有变更，避免无限延迟

### 5.3 核心方法：flush

```
签名: private async flush(): Promise<void>

逻辑:
  1. 如果 pendingFiles.size === 0 → return
  2. 快照当前 pendingFiles → files = new Map(this.pendingFiles)
  3. this.pendingFiles.clear()
  4. 清除所有计时器（saveTimer = null, batchTimer = null）
  5. 遍历 files，逐文件调用 saveWithRetry(filePath, content):
     - 成功 → 加入 succeededFiles[]
     - 失败（超过 maxRetries）→ 加入 failedResults[]
  6. 如果 succeededFiles.length > 0:
     a. 生成 commit message: generateCommitMessage(succeededFiles)
     b. 尝试 commitBatch(succeededFiles, message):
        - 成功 → emit('committed', { commitOid, files, message })
        - 失败 → emit('error', { type: 'commit', error })
  7. 如果 failedResults.length > 0:
     - emit('save-failed', failedResults)
  8. 结构化日志记录 flush 结果
```

**关键点：**
- flush 开始时立即快照并清空 pendingFiles，允许新的变更在 flush 执行期间继续累积到 pendingFiles
- 所有 Git 操作通过 SyncManager 的 `enqueueGitOp` 串行化（如果 SyncManager 可访问），否则自行管理 Promise 链
- commit 失败不阻塞其他文件的保存结果通知

### 5.4 错误重试：saveWithRetry

```
签名: private async saveWithRetry(filePath: string, content: string, attempt?: number): Promise<SaveResult>

逻辑:
  1. attempt 默认为 1
  2. try: await this.fileManager.writeFile(filePath, content)
     - 成功 → return { filePath, success: true }
  3. catch:
     - 如果 attempt < config.maxRetries:
       a. emit('retry', { filePath, attempt })
       b. await sleep(attempt * 1000)  — 递增退避: 1s, 2s, 3s
       c. return saveWithRetry(filePath, content, attempt + 1)
     - 否则:
       return { filePath, success: false, error: error.message }

重试策略: 线性递增退避（1s, 2s, 3s），最多 3 次
FileManager.writeFile 内部已有原子写入（临时文件+rename）+ 3 次重试，
这里额外加一层业务重试，应对磁盘繁忙等极端场景
```

### 5.5 友好 commit message：generateCommitMessage

```
签名: private generateCommitMessage(files: string[]): string

逻辑:
  files.length === 1 → `[${userName}] 更新 ${basename(files[0])}`
  files.length <= 3  → `[${userName}] 更新 ${basenames.join(', ')}`
  files.length > 3   → `[${userName}] 更新 ${files.length} 个文件`

示例: [Alice] 更新 prd.md | [Alice] 更新 prd.md, design.md | [Alice] 更新 5 个文件
```

### 5.6 批量提交：commitBatch

```
签名: private async commitBatch(files: string[], message: string): Promise<string>
逻辑: 遍历 files → stageFile(filePath) → commit(message) → return oid
异常: NOTHING_TO_COMMIT → 静默返回；NOT_INITIALIZED → emit error；其他 → emit error
```

### 5.7 手动重试：retrySave

```
签名: async retrySave(filePath: string): Promise<void>

逻辑:
  1. 从 contentCache 获取 filePath 的最新内容
  2. 如果不存在 → throw new Error('No cached content for file')
  3. result = await saveWithRetry(filePath, content, 1)
  4. 如果 result.success:
     a. await commitBatch([filePath], generateCommitMessage([filePath]))
     b. emit('committed', ...)
  5. 否则: emit('save-failed', [result])
```

### 5.8 生命周期：destroy

```
签名: destroy(): void

逻辑:
  1. 清除 saveTimer
  2. 清除 batchTimer
  3. pendingFiles.clear()
  4. contentCache.clear()
  5. removeAllListeners()
  ```

---

## 六、IPC 通道设计与 Preload 扩展

### 6.1 新增 IPC 通道总览

| 通道 | 方向 | 模式 | 参数 | 返回值 | 说明 |
|------|------|------|------|--------|------|
| `file:notifyChange` | Renderer → Main | send/on（单向） | `(filePath: string, content: string)` | void | 编辑器内容变更通知，不等待保存完成 |
| `file:autoSaved` | Main → Renderer | webContents.send | — | `AutoSavedPayload` | 自动保存成功事件推送 |
| `file:saveFailed` | Main → Renderer | webContents.send | — | `SaveFailedPayload` | 保存失败事件推送 |
| `file:retrySave` | Renderer → Main | invoke/handle | `(filePath: string)` | `IPCResponse<void>` | 手动重试保存，等待结果 |

**模式选择依据：**
- `file:notifyChange`：渲染进程不需要等待保存结果（异步保存），使用 send/on 避免阻塞编辑器
- `file:autoSaved` / `file:saveFailed`：主进程主动推送，使用 webContents.send
- `file:retrySave`：用户点击重试按钮需要等待结果，使用 invoke/handle

### 6.2 FileHandler 扩展

在现有 `FileHandler` 类中新增：

```typescript
// 新增属性
private autoSaveManager: AutoSaveManager | null = null

// 新增 setter
setAutoSaveManager(autoSaveManager: AutoSaveManager): void {
  this.autoSaveManager = autoSaveManager
}

// 在 register() 中新增:
// file:notifyChange — send/on 模式（单向通知）
ipcMain.on(IPC_CHANNELS.FILE_NOTIFY_CHANGE, (_event, filePath: string, content: string) => {
  if (!this.autoSaveManager) {
    logger.warn('[FileHandler] AutoSaveManager not initialized, ignoring notifyChange')
    return
  }
  this.autoSaveManager.onFileChanged(filePath, content)
})

// file:retrySave — invoke/handle 模式
ipcMain.handle(
  IPC_CHANNELS.FILE_RETRY_SAVE,
  this.safeHandle(async (_event, filePath: string) => {
    if (!this.autoSaveManager) {
      throw new Error('AutoSaveManager not initialized')
    }
    await this.autoSaveManager.retrySave(filePath)
  })
)

// AutoSaveManager 事件 → IPC 推送
// 在 setAutoSaveManager 中连接:
autoSaveManager.on('committed', (result: BatchCommitResult) => {
  this.broadcastToAllWindows(IPC_CHANNELS.FILE_AUTO_SAVED, {
    files: result.files,
    timestamp: Date.now(),
  } satisfies AutoSavedPayload)
})

autoSaveManager.on('save-failed', (failedResults: SaveResult[]) => {
  this.broadcastToAllWindows(IPC_CHANNELS.FILE_SAVE_FAILED, {
    files: failedResults.map(r => ({ path: r.filePath, error: r.error ?? 'Unknown error' })),
  } satisfies SaveFailedPayload)
})
```

**关键点：**
- 使用 `broadcastToAllWindows` 而非硬编码 `mainWindow`（与 SyncHandler 一致），支持多窗口场景
- `file:notifyChange` 使用 `ipcMain.on` 而非 `ipcMain.handle`（单向通知不需要返回值）
- `file:retrySave` 使用 `safeHandle` 包装（复用现有错误处理和 IPCResponse 封装）
- AutoSaveManager 事件监听在 `setAutoSaveManager` 时连接，确保实例就绪后才注册

### 6.3 Preload API 扩展

在 `ElectronAPI` 接口的 `file` 命名空间中新增：

```typescript
interface ElectronAPI {
  file: {
    // ... 现有方法保持不变 (read, write, delete, copy, move, list, ...)

    notifyChange: (filePath: string, content: string) => void
    onAutoSaved: (callback: (data: AutoSavedPayload) => void) => () => void
    onSaveFailed: (callback: (data: SaveFailedPayload) => void) => () => void
    retrySave: (filePath: string) => Promise<IPCResponse<void>>
  }
}
```

实现：

```typescript
// file 对象内新增
notifyChange: (filePath: string, content: string) => {
  ipcRenderer.send(IPC_CHANNELS.FILE_NOTIFY_CHANGE, filePath, content)
},

onAutoSaved: (callback: (data: AutoSavedPayload) => void) => {
  const handler = (_event: IpcRendererEvent, data: AutoSavedPayload) => callback(data)
  ipcRenderer.on(IPC_CHANNELS.FILE_AUTO_SAVED, handler)
  return () => {
    ipcRenderer.removeListener(IPC_CHANNELS.FILE_AUTO_SAVED, handler)
  }
},

onSaveFailed: (callback: (data: SaveFailedPayload) => void) => {
  const handler = (_event: IpcRendererEvent, data: SaveFailedPayload) => callback(data)
  ipcRenderer.on(IPC_CHANNELS.FILE_SAVE_FAILED, handler)
  return () => {
    ipcRenderer.removeListener(IPC_CHANNELS.FILE_SAVE_FAILED, handler)
  }
},

retrySave: (filePath: string) =>
  safeInvoke<void>(IPC_CHANNELS.FILE_RETRY_SAVE, filePath),
```

**设计要点：**
- `notifyChange` 使用 `ipcRenderer.send`（单向，不等待），不使用 `safeInvoke`
- `onAutoSaved` / `onSaveFailed` 返回取消函数（cleanup），防止内存泄漏（与现有 `onFileChange` / `onStatusChange` 模式一致）
- `retrySave` 使用 `safeInvoke`（需要等待结果）
- `safeInvoke` 白名单需新增 `IPC_CHANNELS.FILE_RETRY_SAVE`

### 6.4 whiteList 更新

在 `preload/index.ts` 的 channel 白名单中新增：

```typescript
IPC_CHANNELS.FILE_NOTIFY_CHANGE,
IPC_CHANNELS.FILE_AUTO_SAVED,
IPC_CHANNELS.FILE_SAVE_FAILED,
IPC_CHANNELS.FILE_RETRY_SAVE,
```

`notifyChange` 使用 `send` 而非 `invoke`，不受白名单限制，但为了一致性和安全审计，仍加入白名单注释标记。

---

## 七、渲染进程集成设计

### 7.1 useAutoSave Hook 改造策略

**现有行为（需改造）：**
```
Tiptap onUpdate → useAutoSave (debounce 1s) → file.write(content) → 磁盘
问题: 不触发 Git commit
```

**改造后行为：**
```
Tiptap onUpdate → useAutoSave (debounce 1s) → file.notifyChange(filePath, content) → IPC → AutoSaveManager
                                                  ↓
                                          (同时调用 file.write 保留即时写入)

file:autoSaved 事件 ← AutoSaveManager committed → setSaved() + setDirty(false)
file:saveFailed 事件 ← AutoSaveManager save-failed → setSaveError() + 显示警告
```

**改造细节：**

```typescript
// src/renderer/hooks/useAutoSave.ts 核心变更

// doSave 函数改造为双重策略:
const doSave = useCallback(async (content: string) => {
  setSaving(true)
  try {
    // 1. 先写入磁盘（即时写入，保证数据安全）
    await onSave(content)
    // 2. 通知 AutoSaveManager（触发 Git commit）
    window.electronAPI.file.notifyChange(filePath, content)
    // 注意：不在此处调用 setSaved()
    // setSaved 由 file:autoSaved 事件回调触发
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    setSaveError(error.message)
    onError(error)
  }
}, [onSave, onError, filePath, setSaving, setSaveError])

// 新增：监听 file:autoSaved 事件
useEffect(() => {
  if (!filePath) return
  const cleanup = window.electronAPI.file.onAutoSaved((data) => {
    if (data.files.includes(filePath)) {
      setSaved()
      setDirty(false)
    }
  })
  return cleanup
}, [filePath, setSaved, setDirty])

// 新增：监听 file:saveFailed 事件
useEffect(() => {
  if (!filePath) return
  const cleanup = window.electronAPI.file.onSaveFailed((data) => {
    const failed = data.files.find(f => f.path === filePath)
    if (failed) {
      setSaveError(failed.error)
    }
  })
  return cleanup
}, [filePath, setSaveError])
```

**设计决策——双重写入策略：**
- 保留 `file.write()` 即时写入磁盘（保证数据安全，文件不会因为 commit 失败而丢失）
- 新增 `file.notifyChange()` 通知 AutoSaveManager（触发 Git commit）
- AutoSaveManager 收到通知后再次写入文件并 commit（幂等操作，内容相同时 stageFile + commit 会抛出 NOTHING_TO_COMMIT，静默处理）
- 如果未来验证二次写入不必要，可优化为仅 notifyChange 不重复写入

**备选方案（更激进）：** 渲染进程完全不调用 `file.write()`，仅通过 `notifyChange` 发送内容，由 AutoSaveManager 统一负责写入和 commit。优点是职责更清晰，缺点是保存延迟略增（IPC 传输 + 主进程调度）。建议先采用双重写入策略保证可靠性，后续优化时评估是否切换。

### 7.2 SaveFailureBanner 组件

**文件：** `src/renderer/components/editor/SaveFailureBanner.tsx`

```
Props:
  failedFiles: ReadonlyArray<{ path: string; error: string }>
  onRetry: (filePath: string) => void
  onDismiss: () => void

条件渲染: failedFiles.length === 0 → return null

视觉设计:
  ┌─────────────────────────────────────────────────────┐
  │ ⚠ 文件保存失败                                       │
  │                                                     │
  │ prd.md: 磁盘空间不足                                  │
  │                                                     │
  │ [ 重试 ]                                [ 忽略 ]     │
  └─────────────────────────────────────────────────────┘

样式:
  - bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200
  - 文字 text-amber-800 dark:text-amber-200
  - 固定在编辑器顶部 (position: sticky top-0 z-20)
  - 失败图标: AlertTriangle (lucide-react)
  - 重试按钮: Button variant="outline" size="sm"
  - 忽略按钮: 文字按钮 text-amber-600 hover:underline

交互:
  - 重试 → 调用 onRetry(failedFiles[0].path)
  - 忽略 → 调用 onDismiss()（清除错误状态，不重试）
  - 如果多个文件失败 → 列表展示，每个文件独立重试按钮
```

**React.memo：** 纯展示组件，使用 `React.memo` 避免编辑器内容更新引起重渲染。

### 7.3 WysiwygEditor 集成

在现有 `WysiwygEditor.tsx` 中新增：

```typescript
// 新增状态
const [saveFailures, setSaveFailures] = useState<SaveFailedPayload['files']>([])

// 监听保存失败事件
useEffect(() => {
  const cleanup = window.electronAPI.file.onSaveFailed((data) => {
    const relevant = data.files.filter(f => f.path === filePath)
    if (relevant.length > 0) {
      setSaveFailures(relevant)
    }
  })
  return cleanup
}, [filePath])

// 监听保存成功事件 → 清除失败状态
useEffect(() => {
  const cleanup = window.electronAPI.file.onAutoSaved((data) => {
    if (data.files.includes(filePath)) {
      setSaveFailures([])
    }
  })
  return cleanup
}, [filePath])

// 重试处理
const handleRetry = useCallback(async (failPath: string) => {
  await window.electronAPI.file.retrySave(failPath)
}, [])

const handleDismissFailure = useCallback(() => {
  setSaveFailures([])
}, [])

// JSX 新增（在编辑器容器顶部）
{saveFailures.length > 0 && (
  <SaveFailureBanner
    failedFiles={saveFailures}
    onRetry={handleRetry}
    onDismiss={handleDismissFailure}
  />
)}
```

### 7.4 数据流时序

```
渲染进程: Tiptap onUpdate → useAutoSave(debounce 1s) → file.write(content) + file.notifyChange(path, content)
主进程:   FileHandler → autoSaveManager.onFileChanged → pendingFiles.set → debounce(1s)/batchWindow(5s)
主进程:   flush() → saveWithRetry(fileManager.writeFile) → stageFile × N → commit(message) → emit events
渲染进程: file:autoSaved → setSaved()+setDirty(false) | file:saveFailed → setSaveError()+SaveFailureBanner
````

---

## 八、分步实施计划

> 共 6 步，每步产出可独立验证的增量。Step 1-3 为核心骨架（类型+服务+IPC），Step 4 为编辑器集成，Step 5 为 UI 组件，Step 6 为测试。

### Step 1：类型定义 + IPC 通道注册（预估 1.5h）

**产出：** 类型文件、IPC 通道常量扩展

**实施内容：**

1. 创建 `src/main/services/types/auto-save.types.ts`：
   - `AutoSaveConfig` 接口
   - `SaveResult` 接口
   - `BatchCommitResult` 接口
   - `AutoSaveManagerEvents` 事件类型
   - `DEFAULT_AUTO_SAVE_CONFIG` 默认配置常量

2. 扩展 `src/shared/types.ts`：
   - `IPC_CHANNELS` 新增 4 个通道常量
   - 新增 `AutoSavedPayload` / `SaveFailedPayload` 类型
   - `IPCChannelMap` 新增 `FILE_RETRY_SAVE` 映射

**验证标准：**
- [ ] `npm run type-check` 通过
- [ ] `npm run lint` 通过
- [ ] 新增类型在 IDE 中有正确的智能提示

### Step 2：AutoSaveManager 核心服务（预估 3h）

**产出：** `auto-save-manager.ts` 完整实现

**实施内容：**

1. 创建 `src/main/services/auto-save-manager.ts`：
   - 类骨架（构造函数、依赖注入）
   - `onFileChanged()` — 防抖 + 批量聚合双计时器
   - `flush()` — 快照 pendingFiles → 逐文件 saveWithRetry → commitBatch → 事件发射
   - `saveWithRetry()` — 递增退避重试（1s/2s/3s）
   - `generateCommitMessage()` — 友好中文 message 生成
   - `commitBatch()` — stageFile × N + commit
   - `retrySave()` — 手动重试入口
   - `destroy()` — 资源清理

2. 编写基础单元测试：
   - `generateCommitMessage()` 各分支
   - `onFileChanged()` 计时器逻辑
   - `saveWithRetry()` 重试行为

**验证标准：**
- [ ] 单个文件变更 → 1s 防抖后 flush → writeFile + stageFile + commit
- [ ] 3 个文件 3s 内变更 → 聚合为 1 次 commit
- [ ] commit message 格式正确
- [ ] writeFile 失败 3 次后发出 save-failed 事件
- [ ] `npm run type-check` 通过

### Step 3：IPC 通道 + Preload 扩展（预估 2h）

**产出：** FileHandler 扩展、Preload API 扩展

**实施内容：**

1. 扩展 `src/main/ipc/handlers/file.handler.ts`：
   - 新增 `autoSaveManager` 属性和 `setAutoSaveManager()` setter
   - 注册 `file:notifyChange` handler（ipcMain.on 单向）
   - 注册 `file:retrySave` handler（ipcMain.handle 双向）
   - 连接 AutoSaveManager 事件 → `broadcastToAllWindows` 推送

2. 扩展 `src/preload/index.ts`：
   - `file.notifyChange()` — ipcRenderer.send
   - `file.onAutoSaved()` — ipcRenderer.on + cleanup
   - `file.onSaveFailed()` — ipcRenderer.on + cleanup
   - `file.retrySave()` — safeInvoke
   - 更新白名单

3. 在主进程入口文件中初始化 AutoSaveManager 并注入 FileHandler：
   - `new AutoSaveManager(DEFAULT_AUTO_SAVE_CONFIG, fileManager, gitAbstraction, userName)`
   - `fileHandler.setAutoSaveManager(autoSaveManager)`

**验证标准：**
- [ ] 从渲染进程 DevTools 调用 `window.electronAPI.file.notifyChange('test.md', 'hello')` → 主进程日志显示收到通知
- [ ] `window.electronAPI.file.onAutoSaved(callback)` 返回 cleanup 函数
- [ ] `npm run type-check` 通过

### Step 4：useAutoSave Hook 改造 + 编辑器集成（预估 2h）

**产出：** useAutoSave 改造、WysiwygEditor 集成

**实施内容：**

1. 改造 `src/renderer/hooks/useAutoSave.ts`：
   - `doSave()` 新增 `window.electronAPI.file.notifyChange(filePath, content)` 调用
   - 新增 `file:autoSaved` 事件监听 useEffect（setSaved + setDirty(false)）
   - 新增 `file:saveFailed` 事件监听 useEffect（setSaveError）
   - 保留 `file.write()` 即时写入（双重写入策略）
   - 卸载时保留 fire-and-forget 保存行为

2. 改造 `src/renderer/components/editor/WysiwygEditor.tsx`：
   - 新增 `saveFailures` 状态
   - 新增 `file:saveFailed` 事件监听
   - 新增 `file:autoSaved` 事件监听（清除失败状态）
   - 新增 `handleRetry` / `handleDismissFailure` 回调
   - 挂载 `<SaveFailureBanner />`（先用 placeholder）

**验证标准：**
- [ ] 编辑器输入 → 1s 后 useAutoSave 触发 → file.write + file.notifyChange
- [ ] 主进程收到通知 → flush → writeFile + commit
- [ ] commit 成功 → 渲染进程收到 file:autoSaved → setSaved()
- [ ] `npm run type-check` 通过

### Step 5：SaveFailureBanner UI 组件（预估 2h）

**产出：** SaveFailureBanner 组件、暗色模式适配

**实施内容：**

1. 创建 `src/renderer/components/editor/SaveFailureBanner.tsx`：
   - 黄色警告横幅（amber 配色）
   - 失败文件列表展示
   - 重试按钮 + 忽略按钮
   - React.memo 优化
   - 暗色模式适配（dark: 变体）

2. 在 WysiwygEditor 中替换 placeholder 为实际组件

3. 边界情况处理：
   - 多文件失败 → 逐个展示
   - 重试中 loading 状态
   - 保存成功后自动清除

**验证标准：**
- [ ] 保存失败时编辑器顶部出现黄色警告条
- [ ] 点击重试 → 文件重新保存
- [ ] 保存成功后警告条自动消失
- [ ] 暗色模式下正确显示
- [ ] 不影响编辑器正常输入

### Step 6：测试补全 + 联调验证（预估 3h）

**产出：** 完整测试套件

**实施内容：**

1. AutoSaveManager 单元测试（扩展 Step 2 基础测试）：
   - 防抖逻辑：连续 5 次调用，间隔 200ms → 仅 1 次 flush
   - 批量聚合：3s 内 3 个文件 → 1 次 commit
   - 批量窗口：6s 后第 4 个文件 → 独立 commit
   - commit message 生成：单文件 / 多文件 / 边界
   - 错误重试：3 次失败 → save-failed 事件
   - 空内容处理：content = '' → 正常保存
   - destroy 清理：计时器清除

2. useAutoSave Hook 测试：
   - notifyChange 调用验证
   - file:autoSaved 事件 → setSaved
   - file:saveFailed 事件 → setSaveError

3. SaveFailureBanner 组件测试：
   - 条件渲染：无失败 → null
   - 重试按钮点击 → onRetry 调用
   - 忽略按钮点击 → onDismiss 调用

4. 集成测试（手动验证）：
   - 完整链路：编辑器输入 → 1s 防抖 → 磁盘写入 → Git commit → UI 状态更新
   - 多文件编辑：2 个 Tab 同时编辑 → 聚合 commit
   - 保存失败：FileManager stub 抛出异常 → 警告条出现 → 重试成功
   - Cmd+S 手动保存：立即 flush → commit

**验证标准：**
- [ ] AutoSaveManager 测试覆盖率 ≥ 80%
- [ ] `npm run lint` 无警告
- [ ] `npm run type-check` 无错误
- [ ] 所有功能验收标准通过

---

## 九、验收标准与风险评估

### 9.1 功能验收清单

**需求 2.1 对应验收：**

| # | 验收项 | 需求来源 | 对应 Step | 验证方式 |
|---|--------|---------|----------|---------|
| 1 | 用户停止输入 1 秒后系统自动保存文件到磁盘 | AC1 | Step 2-4 | 手动 + 单元测试 |
| 2 | 文件自动保存后 2 秒内创建 Git commit | AC2 | Step 2-4 | 检查 .git log 时间戳 |
| 3 | 5 秒内修改的多个文件合并为单次 commit | AC3 | Step 2 | 单元测试（vi.useFakeTimers） |
| 4 | commit message 格式为 `[成员名] 更新 文件名` | AC4 | Step 2 | 单元测试 |
| 5 | 自动保存失败时显示警告通知并提供重试 | AC5 | Step 5 | 手动验证 |

### 9.2 性能指标

| # | 指标 | 目标 | 验证方式 |
|---|------|------|---------|
| 1 | 防抖后保存延迟 | < 1 秒 | 手动计时 |
| 2 | Git commit 操作 | < 500ms | 主进程日志时间戳差 |
| 3 | 批量保存 10 个文件 | < 3 秒 | 自动化测试 |
| 4 | 保存操作不阻塞渲染进程 | 0ms 渲染进程阻塞 | Chrome DevTools Performance |

### 9.3 用户体验验收

| # | 验收项 | 验证方式 |
|---|--------|---------|
| 1 | 编辑器无"保存"按钮 | 代码审查 |
| 2 | Cmd+S 手动保存仍然可用 | 手动验证 |
| 3 | 保存失败时编辑器顶部显示黄色警告条 | 手动验证 |
| 4 | 成功保存后警告条自动消失 | 手动验证 |
| 5 | 重试按钮可触发重新保存 | 手动验证 |

### 9.4 代码质量验收

| # | 验收项 | 验证方式 |
|---|--------|---------|
| 1 | TypeScript strict mode 无错误 | `npm run type-check` |
| 2 | ESLint 检查通过，无警告 | `npm run lint` |
| 3 | 所有公共函数有 JSDoc 注释 | 代码审查 |
| 4 | AutoSaveManager 单元测试覆盖率 ≥ 80% | Vitest 覆盖率报告 |

### 9.5 交付物清单

| # | 文件 | 类型 | 状态 |
|---|------|------|------|
| 1 | `src/main/services/auto-save-manager.ts` | 新增 | 待创建 |
| 2 | `src/main/services/types/auto-save.types.ts` | 新增 | 待创建 |
| 3 | `src/renderer/components/editor/SaveFailureBanner.tsx` | 新增 | 待创建 |
| 4 | `src/shared/types.ts` | 更新 | 扩展 IPC 通道 + 类型 |
| 5 | `src/main/ipc/handlers/file.handler.ts` | 更新 | 扩展 auto-save handlers |
| 6 | `src/preload/index.ts` | 更新 | 扩展 file.notifyChange / onAutoSaved / onSaveFailed / retrySave |
| 7 | `src/renderer/hooks/useAutoSave.ts` | 更新 | 改造为双重写入策略 |
| 8 | `src/renderer/components/editor/WysiwygEditor.tsx` | 更新 | 集成 SaveFailureBanner |
| 9 | 测试文件（`__tests__/`） | 新增 | 待创建 |

### 9.6 风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 双重写入导致 FileManager 写入冲突 | 中 | 低 | FileManager.writeFile 内部已有原子写入（临时文件+rename）+ 3 次重试；幂等写入不会造成数据损坏 |
| 高频编辑场景下 Git commit 性能瓶颈 | 中 | 中 | 批量聚合减少 commit 频率（5s 窗口）；commit 在主进程不阻塞渲染；NOTHING_TO_COMMIT 静默处理 |
| useAutoSave 改造破坏现有保存功能 | 高 | 低 | 保留原有 file.write() 调用；新增 notifyChange 为附加行为；完整回归测试 |
| Tiptap onUpdate 事件频率过高 | 低 | 中 | useAutoSave 已有 debounce（1s）+ IME 合成跳过；notifyChange 是轻量 IPC send 不阻塞 |
| IPC 传输大量 Markdown 内容性能问题 | 低 | 低 | 典型文档 < 100KB，IPC 传输可接受；超大文件考虑分片（后续优化） |
| commit message 中文编码问题 | 低 | 低 | isomorphic-git 原生支持 UTF-8 |

### 9.7 回滚策略

1. `AutoSaveManager` 为新增服务类，可安全删除而不影响现有功能
2. `useAutoSave` 改造为增量修改：`notifyChange` 调用可移除，恢复原有行为
3. `SaveFailureBanner` 为独立组件，移除挂载代码即可回退
4. `src/shared/types.ts` 扩展为纯新增常量和类型，删除新增部分不影响现有类型
5. IPC 通道新增不影响现有通道，可安全移除 handler 注册

---

**创建时间：** 2026-04-17
**最后更新：** 2026-04-17
**更新记录：**
- 2026-04-17 — 初始创建

