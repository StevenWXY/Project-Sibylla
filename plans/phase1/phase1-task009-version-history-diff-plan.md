# PHASE1-TASK009: 版本历史浏览与 Diff — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task009_version-history-diff.md](../specs/tasks/phase1/phase1-task009_version-history-diff.md)
> 创建日期：2026-04-17
> 最后更新：2026-04-17

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK009 |
| **任务标题** | 版本历史浏览与 Diff |
| **优先级** | P1 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **前置依赖** | ✅ Phase0 GitAbstraction（getHistory/getFileDiff）、✅ PHASE1-TASK001（文件树+右键菜单）、✅ PHASE1-TASK005（自动保存 commit 产生版本历史） |

### 目标

实现文件的版本历史浏览和 Diff 对比功能，让用户无需理解 Git 即可查看文件的变更过程、对比不同版本的差异、以及回滚到历史版本。

### 核心命题

CLAUDE.md "Git 不可见"哲学的直接落地——用户只看到"版本""恢复""与当前版本的差异"等自然语言，不看到 commit、branch、revert、SHA 等 Git 术语。

### 范围边界

**包含：**
- GitAbstraction 扩展：`readFileAtCommit()` 公开方法 + `restoreVersion()` 新方法
- IPC 通道：`git:history`、`git:diff`、`git:restore` 三个双向 invoke/handle 通道
- Preload API 扩展：`git.history()`、`git.diff()`、`git.restore()` 三个方法
- 文件树右键菜单新增"查看历史"入口
- `VersionHistoryPanel` — 版本历史侧面板
- `VersionList` — 版本列表组件（摘要、作者、相对时间）
- `DiffHunkView` — 结构化 Diff 渲染组件（绿增红删）
- `RestoreConfirmDialog` — 恢复确认对话框（二次确认）
- `versionHistoryStore` — Zustand 版本历史状态管理
- Mock API 扩展 + 测试 setup 扩展

**不包含：**
- 全局变更时间线（跨文件历史）— Phase 2
- 版本标签/里程碑 — Phase 2
- 变更审批流程 — Phase 2
- 版本对比（任选两个版本）— 后续迭代，当前仅支持"选中版本 vs 当前版本"

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 路径 | 关键约束 |
|------|------|---------|
| 项目宪法 | `CLAUDE.md` | TypeScript 严格模式禁止 any；主进程与渲染进程严格隔离；注释英文/commit 中文；所有异步操作必须有错误处理；关键操作结构化日志；不可逆操作需用户确认 |
| 系统架构 | `specs/design/architecture.md` | 渲染进程禁止直接访问文件系统；IPC 通信严格隔离 |
| UI/UX 规范 | `specs/design/ui-ux-design.md` | 品牌色 Indigo-500；>2s 操作需进度反馈；文件丢失不可接受（原子写入） |
| 数据模型与 API | `specs/design/data-and-api.md` | IPC 通信模式：invoke/handle + send/on |
| 需求规格 | `specs/requirements/phase1/sprint2-git-sync.md` | 需求 2.5 验收标准：版本列表、Diff 对比、恢复功能 |
| 任务规格 | `specs/tasks/phase1/phase1-task009_version-history-diff.md` | 7 个子任务、5 条功能验收标准、4 类测试用例 |

### 2.2 Skill 依赖

| Skill | 路径 | 使用场景 |
|-------|------|---------|
| `isomorphic-git-integration` | `.kilocode/skills/phase0/isomorphic-git-integration/SKILL.md` | `readBlob()` 读取指定 commit 的文件内容；`log()` 分页查询；`stageFile()` + `commit()` 恢复版本流程 |
| `electron-ipc-patterns` | `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` | `git:history/diff/restore` invoke/handle 模式；类型安全 IPC 扩展；错误处理与超时 |
| `zustand-state-management` | `.kilocode/skills/phase1/zustand-state-management/SKILL.md` | `versionHistoryStore` 设计：selector 精确订阅、devtools 中间件 |
| `typescript-strict-mode` | `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` | `VersionEntry` / `VersionDiff` / `HistoryQuery` 严格类型；类型复用与映射 |
| `vercel-react-best-practices` | `.kilocode/skills/common/vercel-react-best-practices/SKILL.md` | 组件 memo 优化；useCallback 稳定引用；虚拟滚动优化 |

### 2.3 前置代码依赖

| 模块 | 路径 | 行数 | 状态 | 说明 |
|------|------|------|------|------|
| GitAbstraction.getHistory | `src/main/services/git-abstraction.ts:825` | 2226 | ✅ 已完成 | `getHistory(options?: HistoryOptions)` 支持 `depth`/`filepath`/`ref`，返回 `CommitInfo[]`；内部有 `filterHistoryByFile()` 按文件过滤 |
| GitAbstraction.getFileDiff | `src/main/services/git-abstraction.ts:967` | — | ✅ 已完成 | `getFileDiff(filepath, commitA?, commitB?)` 返回 `FileDiff { filepath, oldContent, newContent, hunks }` |
| GitAbstraction.getFileContent | `src/main/services/git-abstraction.ts:2016` | — | ⚠️ private | 私有方法，读取指定 ref 的文件内容；需公开为 `readFileAtCommit` |
| GitAbstraction.stageFile + commit | `src/main/services/git-abstraction.ts:389,571` | — | ✅ 已完成 | 恢复版本需要调用 |
| GitAbstraction types | `src/main/services/types/git-abstraction.types.ts:112-199` | 366 | ✅ 已完成 | `CommitInfo`、`HistoryOptions`、`DiffLine`、`DiffHunk`、`FileDiff` 已完整定义 |
| GitHandler | `src/main/ipc/handlers/git.handler.ts` | 109 | ⚠️ 需扩展 | 仅注册冲突相关 handler（getConflicts/resolve）；需扩展 history/diff/restore |
| IPC_CHANNELS | `src/shared/types.ts:93-106,240-245` | 932 | ⚠️ 需更新 | `GIT_HISTORY`/`GIT_DIFF` 已作为常量存在但 typed as `unknown`；缺 `GIT_RESTORE` 常量 |
| Preload git API | `src/preload/index.ts:116-123` | 610 | ⚠️ 需扩展 | 仅 `getConflicts`/`resolve`/`onConflictDetected`；缺 `history`/`diff`/`restore` |
| TreeContextMenu | `src/renderer/components/layout/TreeContextMenu.tsx` | 150 | ⚠️ 需扩展 | 已有菜单项框架；需为文件类型新增"查看历史"菜单项 + `onViewHistory` prop |
| Modal 组件 | `src/renderer/components/ui/Modal.tsx` | 108 | ✅ 已完成 | `ModalProps { isOpen, onClose, title, description, children, size, showCloseButton }` |
| DiffHighlight | `src/renderer/components/conflict/DiffHighlight.tsx` | 59 | ✅ 可参考 | 基于 `diffLines` 的行级高亮，不直接适配 `DiffHunk[]`；需新建 `DiffHunkView` |
| cn 工具 | `src/renderer/utils/cn.ts` | 9 | ✅ 已完成 | clsx + tailwind-merge |
| Mock ElectronAPI | `src/renderer/dev/mockElectronAPI.ts:436-440` | 485 | ⚠️ 需扩展 | 仅有 git 冲突 mock；缺 history/diff/restore mock |
| 测试 setup | `tests/renderer/setup.ts:46-50` | 91 | ⚠️ 需扩展 | 仅有 git 冲突 mock；缺 history/diff/restore mock |
| editorStore | `src/renderer/store/editorStore.ts` | 76 | ✅ 参考 | Zustand store 标准模式：devtools 中间件 + selector 导出 |

### 2.4 被依赖任务

本任务无直接被依赖任务。后续可扩展：全局变更时间线、版本标签、变更审批流程。

### 2.5 npm 依赖

无需新增 npm 包。所有核心依赖已安装：
- `diff` — 已安装（GitAbstraction 内部使用 `structuredPatch`，DiffHighlight 使用 `diffLines`）
- `zustand` ^5.0.11 — 状态管理
- `lucide-react` ^0.577.0 — 图标（History, Clock, User, RotateCcw, ChevronLeft, ChevronRight, X, Loader2）
- `clsx` + `tailwind-merge` — 样式工具

**不引入 `diff-match-patch`**——复用现有 `diff` 库 + GitAbstraction 已有的 `computeDiffHunks()` 结构化 Diff 输出。

---

## 三、现有代码盘点与差距分析

### 3.1 现有版本历史数据通路

```
主进程:
  GitAbstraction.getHistory({ depth, filepath }) → CommitInfo[]   ✅ 完整实现
  GitAbstraction.getFileDiff(filepath, commitA, commitB) → FileDiff ✅ 完整实现
  GitAbstraction.getFileContent(filepath, ref) → string           ✅ 私有方法，需公开

IPC 层:
  GitHandler.register()                                           ⚠️ 仅冲突 handler
  IPC_CHANNELS.GIT_HISTORY / GIT_DIFF                             ⚠️ 常量存在，类型 unknown
  Preload git.history() / git.diff() / git.restore()              ❌ 不存在

渲染进程:
  TreeContextMenu "查看历史" 菜单项                                ❌ 不存在
  VersionHistoryPanel / VersionList                               ❌ 不存在
  DiffHunkView（结构化 DiffHunk[] 渲染）                          ❌ 不存在
  RestoreConfirmDialog                                            ❌ 不存在
  versionHistoryStore                                             ❌ 不存在
```

### 3.2 差距矩阵

| 能力 | 现有 | 缺口 | 本任务产出 |
|------|------|------|-----------|
| GitAbstraction 分页查询 | ✅ `getHistory({ depth, filepath })` | 无 offset 分页 | 利用 depth + slice 实现客户端分页（单文件历史通常 <200 条） |
| GitAbstraction readFileAtCommit | ⚠️ 私有 `getFileContent()` | 无公开方法 | 新增 `readFileAtCommit()` 公开方法 |
| GitAbstraction restoreVersion | ❌ 无 | 无恢复方法 | 新增 `restoreVersion()` |
| IPC 通道 | ⚠️ 常量存在，类型 unknown | 未注册 handler | GitHandler 扩展 + 类型补全 |
| Preload API | ❌ 仅冲突方法 | 无历史 API | 扩展 `git.history/diff/restore` |
| DiffHunk 渲染组件 | ⚠️ DiffHighlight 用 diffLines | 无 DiffHunk[] 渲染 | 新建 `DiffHunkView` |
| 右键菜单历史入口 | ❌ 无 | 无入口 | TreeContextMenu 扩展 |
| 版本历史 Store | ❌ 无 | 无状态管理 | 新建 `versionHistoryStore` |
| Mock + Test setup | ❌ 仅冲突 | 无历史 mock | 扩展 mock/setup |

### 3.3 需新建的文件

| # | 文件路径 | 类型 | 说明 |
|---|---------|------|------|
| 1 | `src/renderer/components/version-history/VersionHistoryPanel.tsx` | 新增 | 版本历史侧面板容器 |
| 2 | `src/renderer/components/version-history/VersionList.tsx` | 新增 | 版本列表组件 |
| 3 | `src/renderer/components/version-history/DiffHunkView.tsx` | 新增 | DiffHunk 结构化渲染 |
| 4 | `src/renderer/components/version-history/RestoreConfirmDialog.tsx` | 新增 | 恢复确认对话框 |
| 5 | `src/renderer/components/version-history/index.ts` | 新增 | 模块桶导出 |
| 6 | `src/renderer/store/versionHistoryStore.ts` | 新增 | 版本历史 Zustand store |
| 7 | `src/renderer/utils/formatRelativeTime.ts` | 新增 | 人性化时间格式化工具 |
| 8 | `tests/renderer/VersionHistoryPanel.test.tsx` | 新增 | 面板组件测试 |
| 9 | `tests/renderer/VersionList.test.tsx` | 新增 | 列表组件测试 |
| 10 | `tests/renderer/DiffHunkView.test.tsx` | 新增 | Diff 渲染测试 |
| 11 | `tests/renderer/RestoreConfirmDialog.test.tsx` | 新增 | 恢复对话框测试 |
| 12 | `tests/renderer/versionHistoryStore.test.ts` | 新增 | Store 测试 |
| 13 | `tests/main/git-abstraction-version-history.test.ts` | 新增 | GitAbstraction 扩展测试 |

### 3.4 需修改的文件

| # | 文件路径 | 修改内容 | 风险 |
|---|---------|---------|------|
| 1 | `src/main/services/git-abstraction.ts` | 新增 `readFileAtCommit()` 公开方法（封装私有 `getFileContent()`）；新增 `restoreVersion()` 方法 | 中 — 扩展核心服务 |
| 2 | `src/main/ipc/handlers/git.handler.ts` | 注入 GitAbstraction；注册 `git:history`/`git:diff`/`git:restore` handler | 中 — 扩展 IPC handler |
| 3 | `src/shared/types.ts` | 新增 `GIT_RESTORE` IPC 通道常量；更新 `IPCChannelMap` 类型（从 unknown 改为实际类型） | 低 — 类型补全 |
| 4 | `src/preload/index.ts` | 新增 `git.history()`/`git.diff()`/`git.restore()` 方法；更新白名单 | 中 — 修改 preload 桥接 |
| 5 | `src/renderer/components/layout/TreeContextMenu.tsx` | 新增 `onViewHistory` prop + 文件类型"查看历史"菜单项 | 低 — 新增可选 prop |
| 6 | `src/renderer/components/layout/FileTree.tsx` | 新增"查看历史"菜单回调逻辑 + `VersionHistoryPanel` 挂载 | 低 — 扩展回调 |
| 7 | `src/renderer/dev/mockElectronAPI.ts` | 新增 `git.history`/`git.diff`/`git.restore` mock | 低 — 纯新增 |
| 8 | `tests/renderer/setup.ts` | 新增 git history/diff/restore mock | 低 — 纯新增 |

### 3.5 不修改的文件

| 文件 | 原因 |
|------|------|
| `src/main/services/types/git-abstraction.types.ts` | `CommitInfo`/`HistoryOptions`/`DiffHunk`/`DiffLine`/`FileDiff` 已完整定义，无需变更 |
| `src/renderer/components/conflict/DiffHighlight.tsx` | 独立组件，不修改；版本历史使用新建的 `DiffHunkView` |
| `src/renderer/components/ui/Modal.tsx` | 现有 Modal 组件接口已满足需求 |

---

## 四、类型系统设计

### 4.1 设计原则

- **最大化复用** — `CommitInfo`、`FileDiff`、`DiffHunk`、`DiffLine`、`HistoryOptions` 均复用 `git-abstraction.types.ts` 已有定义
- **渲染进程类型映射** — 在 store 层将 `CommitInfo` 映射为 `VersionEntry`（增加 `summary` 字段用于 UI 展示）
- **不新建独立类型文件** — 类型直接定义在 store 和组件文件中（或 `shared/types.ts` 扩展）

### 4.2 IPCChannelMap 类型补全（shared/types.ts）

```typescript
// 将现有 unknown 替换为实际类型
[IPC_CHANNELS.GIT_HISTORY]: {
  params: [options?: HistoryQuery]
  return: IPCResponse<readonly CommitInfo[]>
}
[IPC_CHANNELS.GIT_DIFF]: {
  params: [filepath: string, commitA?: string, commitB?: string]
  return: IPCResponse<FileDiff>
}

// 新增通道
GIT_RESTORE: 'git:restore'  // 新增常量
[IPC_CHANNELS.GIT_RESTORE]: {
  params: [filepath: string, commitSha: string]
  return: IPCResponse<string>
}
```

### 4.3 渲染进程类型（store 内部定义）

```typescript
// src/renderer/store/versionHistoryStore.ts 内部

interface VersionEntry {
  readonly oid: string
  readonly message: string
  readonly author: string
  readonly timestamp: number
  readonly summary: string
}

interface HistoryQuery {
  readonly filePath: string
  readonly limit?: number
  readonly offset?: number
}
```

**设计决策：**
- `VersionEntry` 不复用 `CommitInfo`（含 `authorEmail`/`parents` 等渲染进程不需要的字段），保持渲染进程类型精简
- `summary` 在渲染进程从 `CommitInfo.message` 派生（取第一行，截断 60 字符），不在主进程计算
- `HistoryQuery` 包含 `offset` 用于客户端分页逻辑

---

## 五、GitAbstraction 扩展设计

### 5.1 新增 readFileAtCommit 公开方法

将现有私有 `getFileContent()` 封装为公开方法，供 IPC handler 和 `restoreVersion()` 使用。

```typescript
// src/main/services/git-abstraction.ts 新增

async readFileAtCommit(filepath: string, ref: string): Promise<string> {
  const normalizedPath = this.normalizePath(filepath)
  logger.debug(`${LOG_PREFIX} Reading file at commit`, { filepath: normalizedPath, ref })
  return this.getFileContent(normalizedPath, ref)
}
```

**设计决策：**
- 封装而非直接公开 `getFileContent()`——公开方法增加 `normalizePath` 和日志，保持内部方法职责清晰
- 返回空字符串表示文件在指定 commit 中不存在（与 `getFileContent` 行为一致）

### 5.2 新增 restoreVersion 方法

```typescript
// src/main/services/git-abstraction.ts 新增

async restoreVersion(filepath: string, commitSha: string): Promise<string> {
  const normalizedPath = this.normalizePath(filepath)
  logger.info(`${LOG_PREFIX} Restoring file to version`, { filepath: normalizedPath, commitSha })

  const content = await this.getFileContent(normalizedPath, commitSha)

  const fullPath = path.join(this.workspaceDir, normalizedPath)
  await fs.promises.writeFile(fullPath, content, 'utf-8')

  await this.stageFile(normalizedPath)

  const shortSha = commitSha.slice(0, 7)
  const message = `恢复 ${path.basename(normalizedPath)} 到版本 ${shortSha}`
  const oid = await this.commit(message)

  logger.info(`${LOG_PREFIX} File restored`, { filepath: normalizedPath, commitOid: oid })
  return oid
}
```

**设计决策：**
- 使用"创建新 commit 恢复旧内容"策略，而非 `git revert`——历史可追溯，不引入 revert 的复杂性
- commit message 使用中文"恢复"而非"revert"，遵循 CLAUDE.md 术语规范
- 通过 `this.stageFile()` + `this.commit()` 复用已有方法，保证 commit 串行化和错误处理一致性
- 如果内容与当前版本相同，`commit()` 将抛出 `NOTHING_TO_COMMIT`——由 IPC handler 层捕获并返回友好错误

### 5.3 分页策略

**客户端分页（非服务端分页）：** `getHistory()` 的 `isomorphic-git.log()` 不支持 offset，仅支持 `depth`。策略：

1. 首次加载请求 `depth=PAGE_SIZE`（50），全部返回给渲染进程
2. 翻页时不重新请求 IPC，而是在渲染进程缓存中 slice
3. 如果本地缓存不足（当前页已到最后一条），再请求 `depth=PAGE_SIZE * (page+1)` 获取更多

**为什么不用服务端 offset：** isomorphic-git `log()` 返回从 HEAD 开始的线性历史，无法跳过中间 commit。对于单文件历史（通常 <200 条），全量加载 + 客户端分页性能可接受。

---

## 六、IPC 通道设计与 Preload 扩展

### 6.1 IPC 通道总览

| 通道 | 方向 | 模式 | 参数 | 返回值 | 说明 |
|------|------|------|------|--------|------|
| `git:history` | Renderer → Main | invoke/handle | `options?: HistoryOptions` | `IPCResponse<readonly CommitInfo[]>` | 获取文件版本历史 |
| `git:diff` | Renderer → Main | invoke/handle | `filepath: string, commitA?: string, commitB?: string` | `IPCResponse<FileDiff>` | 获取两个版本的 Diff |
| `git:restore` | Renderer → Main | invoke/handle | `filepath: string, commitSha: string` | `IPCResponse<string>` | 恢复到指定版本，返回新 commit OID |

**全部使用 invoke/handle 双向模式：** 渲染进程需要等待结果（版本列表、Diff 内容、恢复结果），不使用 fire-and-forget。

### 6.2 GitHandler 扩展

```typescript
// src/main/ipc/handlers/git.handler.ts 扩展

export class GitHandler extends IpcHandler {
  readonly namespace = 'git'
  private conflictResolver: ConflictResolver | null = null
  private gitAbstraction: GitAbstraction | null = null  // 新增

  setConflictResolver(resolver: ConflictResolver): void { ... }

  setGitAbstraction(gitAbs: GitAbstraction): void {      // 新增
    this.gitAbstraction = gitAbs
    logger.info('[GitHandler] GitAbstraction instance set')
  }

  register(): void {
    // 现有冲突 handler 不变
    ipcMain.handle(IPC_CHANNELS.GIT_GET_CONFLICTS, ...)
    ipcMain.handle(IPC_CHANNELS.GIT_RESOLVE, ...)

    // 新增版本历史 handler
    ipcMain.handle(
      IPC_CHANNELS.GIT_HISTORY,
      this.safeHandle(this.handleHistory.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.GIT_DIFF,
      this.safeHandle(this.handleDiff.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.GIT_RESTORE,
      this.safeHandle(this.handleRestore.bind(this)),
    )
  }

  private async handleHistory(
    _event: IpcMainInvokeEvent,
    options?: HistoryOptions,
  ): Promise<readonly CommitInfo[]> {
    if (!this.gitAbstraction) throw new Error('GitAbstraction not initialized')
    return this.gitAbstraction.getHistory(options)
  }

  private async handleDiff(
    _event: IpcMainInvokeEvent,
    filepath: string,
    commitA?: string,
    commitB?: string,
  ): Promise<FileDiff> {
    if (!this.gitAbstraction) throw new Error('GitAbstraction not initialized')
    return this.gitAbstraction.getFileDiff(filepath, commitA, commitB)
  }

  private async handleRestore(
    _event: IpcMainInvokeEvent,
    filepath: string,
    commitSha: string,
  ): Promise<string> {
    if (!this.gitAbstraction) throw new Error('GitAbstraction not initialized')
    logger.info('[GitHandler] Restore version requested', { filepath, commitSha })
    return this.gitAbstraction.restoreVersion(filepath, commitSha)
  }
}
```

**关键点：**
- 使用 setter 注入 `GitAbstraction`（与 `ConflictResolver` 注入模式一致）
- 复用 `safeHandle()` 自动错误包装为 `IPCResponse`
- `handleRestore` 记录结构化日志（who/what/when/result）

### 6.3 shared/types.ts 扩展

```typescript
// 新增 IPC 通道常量
GIT_RESTORE: 'git:restore',

// IPCChannelMap 类型从 unknown 改为实际类型
[IPC_CHANNELS.GIT_HISTORY]: {
  params: [options?: import('./types-git').HistoryOptions]
  return: import('../../../sibylla-desktop/src/main/services/types/git-abstraction.types').CommitInfo[]
}
// ... 类似更新 GIT_DIFF, GIT_RESTORE
```

> **注意：** `CommitInfo`/`HistoryOptions`/`FileDiff` 定义在 `git-abstraction.types.ts` 中（主进程内部类型），而 `IPCChannelMap` 在 `shared/types.ts` 中。有两种方案：
> 1. 将 `CommitInfo`/`FileDiff` 移到 `shared/types.ts` — 影响范围大
> 2. 在 `IPCChannelMap` 中引用 `git-abstraction.types.ts` — 跨层引用
>
> **选用方案 2**（跨层 import），因为 `git-abstraction.types.ts` 中的这些类型已经是纯数据接口，无主进程依赖，且已有先例（`ConflictInfo` 在 `shared/types.ts` 中定义但依赖结构类似）。后续重构时可考虑统一迁移到 shared。

### 6.4 Preload API 扩展

```typescript
// src/preload/index.ts 扩展

interface ElectronAPI {
  git: {
    // 现有冲突方法保持不变
    getConflicts: ...
    resolve: ...
    onConflictDetected: ...

    // 新增版本历史方法
    history: (options?: HistoryOptions) => Promise<IPCResponse<readonly CommitInfo[]>>
    diff: (filepath: string, commitA?: string, commitB?: string) => Promise<IPCResponse<FileDiff>>
    restore: (filepath: string, commitSha: string) => Promise<IPCResponse<string>>
  }
}
```

实现：

```typescript
// git 对象内新增
history: (options?: HistoryOptions) =>
  safeInvoke<readonly CommitInfo[]>(IPC_CHANNELS.GIT_HISTORY, options),

diff: (filepath: string, commitA?: string, commitB?: string) =>
  safeInvoke<FileDiff>(IPC_CHANNELS.GIT_DIFF, filepath, commitA, commitB),

restore: (filepath: string, commitSha: string) =>
  safeInvoke<string>(IPC_CHANNELS.GIT_RESTORE, filepath, commitSha),
```

**白名单更新：** `ALLOWED_CHANNELS` 数组新增 `IPC_CHANNELS.GIT_HISTORY`、`IPC_CHANNELS.GIT_DIFF`、`IPC_CHANNELS.GIT_RESTORE`。

---

## 七、渲染进程组件设计

### 7.1 组件层级

```
FileTree (改造 — 新增 onViewHistory 回调)
├── TreeContextMenu (改造 — 文件类型新增"查看历史"菜单项)
└── VersionHistoryPanel (新增 — 挂载于 FileTree 或 WorkspaceStudioPage 侧边)
    ├── VersionList (新增 — 版本列表)
    ├── DiffHunkView (新增 — Diff 渲染)
    └── RestoreConfirmDialog (新增 — 恢复确认)
```

### 7.2 versionHistoryStore 设计

```typescript
// src/renderer/store/versionHistoryStore.ts

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface VersionEntry {
  readonly oid: string
  readonly message: string
  readonly author: string
  readonly timestamp: number
  readonly summary: string
}

interface FileDiff {
  readonly filepath: string
  readonly oldContent: string
  readonly newContent: string
  readonly hunks: readonly DiffHunk[]
}

interface VersionHistoryState {
  readonly isOpen: boolean
  readonly filePath: string | null
  readonly versions: readonly VersionEntry[]
  readonly selectedVersion: VersionEntry | null
  readonly diff: FileDiff | null
  readonly isLoadingHistory: boolean
  readonly isLoadingDiff: boolean
  readonly isRestoring: boolean
  readonly error: string | null
  readonly page: number
}

interface VersionHistoryActions {
  openPanel: (filePath: string) => void
  closePanel: () => void
  loadHistory: () => Promise<void>
  selectVersion: (version: VersionEntry) => void
  restoreVersion: () => Promise<void>
  setPage: (page: number) => void
  clearError: () => void
}

const PAGE_SIZE = 50

function extractSummary(message: string): string {
  const firstLine = message.split('\n')[0] ?? ''
  return firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : firstLine
}

function commitInfoToVersionEntry(info: CommitInfo): VersionEntry {
  return {
    oid: info.oid,
    message: info.message,
    author: info.authorName,
    timestamp: info.timestamp,
    summary: extractSummary(info.message),
  }
}
```

**设计决策：**
- `isOpen` + `filePath` 控制面板显示状态，由 FileTree 中的"查看历史"菜单项触发 `openPanel(filePath)`
- `loadHistory()` 封装 IPC 调用 + CommitInfo→VersionEntry 映射 + 错误处理
- `selectVersion()` 触发 Diff 加载（version.oid vs HEAD）
- 不使用 persist——版本历史是运行时临时状态
- `page` 支持客户端分页（versions 缓存翻页）

### 7.3 VersionHistoryPanel 组件

**文件：** `src/renderer/components/version-history/VersionHistoryPanel.tsx`

```
Props: 无外部 props（所有状态从 store 获取）

布局 (侧面板, w-80):
┌──────────────────────────────────┐
│ 📄 prd.md                    [×] │  ← header: 文件名 + 关闭
├──────────────────────────────────┤
│                                  │
│  VersionList                     │  ← 版本列表区域
│  ┌────────────────────────────┐  │
│  │ 更新 prd.md                │  │
│  │ Alice · 3 分钟前           │  │  ← 选中态: bg-indigo-50
│  ├────────────────────────────┤  │
│  │ 添加需求描述               │  │
│  │ Bob · 昨天                 │  │
│  ├────────────────────────────┤  │
│  │ ...                        │  │
│  └────────────────────────────┘  │
│                                  │
│  [ 上一页 ]  第 1 页  [ 下一页 ]  │  ← 分页 (versions >= PAGE_SIZE)
├──────────────────────────────────┤
│ 与当前版本的差异                 │  ← Diff 区域 (选中版本后出现)
│                                  │
│ - 旧内容行 (红色背景)           │
│ + 新增内容行 (绿色背景)         │
│   上下文行 (灰色)               │
│                                  │
│              [ 恢复到此版本 ]     │  ← 恢复按钮
└──────────────────────────────────┘

状态映射:
  isOpen=false → return null
  isLoadingHistory=true → Loader2 旋转
  error !== null → 错误提示
  selectedVersion !== null → 显示 Diff 区域
  isRestoring=true → 恢复按钮 disabled + Loader2
```

**组件逻辑：**

```
VersionHistoryPanel:
  1. 从 store 获取 isOpen, filePath, versions, selectedVersion, diff, isLoading*, page, error
  2. isOpen=false → return null
  3. useEffect on filePath → store.loadHistory()
  4. 渲染 header (文件名 + 关闭按钮)
  5. 渲染 <VersionList />
  6. 渲染分页
  7. selectedVersion → 渲染 Diff 区域
  8. 恢复按钮 → store.restoreVersion()
```

**性能优化：**
- 使用精确 selector：`useVersionHistoryStore(s => s.isOpen)` 等逐字段订阅
- Diff 区域使用 `React.memo` 包裹（diff 对象引用稳定时不重渲染）
- 分页组件独立 memo

### 7.4 VersionList 组件

**文件：** `src/renderer/components/version-history/VersionList.tsx`

```
Props:
  versions: readonly VersionEntry[]
  selected: VersionEntry | null
  isLoading: boolean
  onSelect: (version: VersionEntry) => void

渲染:
  isLoading → 居中 Loader2
  versions.length === 0 → "暂无版本记录" 空状态
  versions.map → 版本项 button:
    - summary (text-sm font-medium truncate)
    - author · formatRelativeTime(timestamp) (text-xs text-gray-500)
    - 选中态: bg-indigo-50 dark:bg-indigo-900/20
    - hover: bg-gray-50 dark:bg-gray-700/50
```

### 7.5 DiffHunkView 组件

**文件：** `src/renderer/components/version-history/DiffHunkView.tsx`

```
Props:
  hunks: readonly DiffHunk[]

渲染逻辑:
  hunks.map → 每个 hunk:
    hunk header: @@ -oldStart,oldLines +newStart,newLines @@
    hunk.lines.map → 每行:
      type='add'    → bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300
                       前缀 "+"
      type='delete' → bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300
                       前缀 "-"
      type='context'→ text-gray-600 dark:text-gray-400
                       前缀 " "

样式:
  max-h-64 overflow-auto
  font-mono text-xs whitespace-pre-wrap
  每行 px-3 py-0.5 border-l-2
    add → border-emerald-400
    delete → border-red-400
    context → border-transparent
```

**与 DiffHighlight 的区别：**
- `DiffHighlight` 使用 `diffLines()` 从原始文本计算 diff，适合编辑器内联展示
- `DiffHunkView` 直接渲染 GitAbstraction 返回的 `DiffHunk[]`，包含行号信息，适合版本对比场景

### 7.6 RestoreConfirmDialog 组件

**文件：** `src/renderer/components/version-history/RestoreConfirmDialog.tsx`

```
Props:
  version: VersionEntry
  onConfirm: () => void
  onCancel: () => void

使用 Modal 组件:
  <Modal isOpen onClose={onCancel} title="恢复到历史版本" size="sm">
    <p>确定要将文件恢复到以下版本吗？这将创建一个新的版本来记录此操作。</p>
    <div className="rounded bg-gray-50 p-3">
      <p className="font-medium">{version.summary}</p>
      <p className="text-gray-500">{version.author} · {toLocaleString('zh-CN')}</p>
    </div>
    <div className="flex gap-3 justify-end">
      <Button variant="outline" onClick={onCancel}>取消</Button>
      <Button onClick={onConfirm}>确认恢复</Button>
    </div>
  </Modal>
```

**设计决策：**
- 明确告知用户"这将创建一个新的版本"（非覆盖历史），消除用户顾虑
- 恢复按钮使用 Indigo 品牌色，表示主要操作
- 使用现有 Modal 组件（已支持暗色模式、动画、键盘 Escape 关闭）

### 7.7 TreeContextMenu 扩展

```typescript
// src/renderer/components/layout/TreeContextMenu.tsx 扩展

interface TreeContextMenuProps {
  // ... 现有 props
  onViewHistory?: () => void  // 新增：可选，仅文件类型显示
}

// items 构建中新增（仅在 !isFolder && onViewHistory 时）:
if (!isFolder && onViewHistory) {
  baseItems.splice(baseItems.length - 2, 0, {
    key: 'view-history',
    label: '查看历史',
    icon: <History className="h-3.5 w-3.5" />,
    action: onViewHistory,
  })
}
```

**插入位置：** "复制路径"之后、"删除"分隔线之前。

### 7.8 formatRelativeTime 工具

```typescript
// src/renderer/utils/formatRelativeTime.ts

export function formatRelativeTime(timestampMs: number): string {
  const diff = Date.now() - timestampMs
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`
  return new Date(timestampMs).toLocaleDateString('zh-CN')
}
```

---

## 八、分步实施计划

> 共 7 步，每步产出可独立验证的增量。Step 1-3 为后端骨架（类型+服务+IPC），Step 4-5 为前端组件，Step 6 为集成，Step 7 为测试。

### Step 1：类型补全 + IPC 通道常量（预估 1h）

**产出：** shared/types.ts 扩展、IPC 通道注册

**实施内容：**

1. 扩展 `src/shared/types.ts`：
   - 新增 `GIT_RESTORE` IPC 通道常量
   - 更新 `IPCChannelMap` 中 `GIT_HISTORY`/`GIT_DIFF` 从 `unknown` 改为实际类型
   - 新增 `GIT_RESTORE` 映射

2. 更新 GitHandler 注入点：在主进程入口确认 `GitHandler.setGitAbstraction()` 调用位置

**验证标准：**
- [ ] `npm run type-check` 通过
- [ ] `npm run lint` 通过
- [ ] 新增常量在 IDE 中有正确智能提示

### Step 2：GitAbstraction 扩展（预估 2h）

**产出：** `readFileAtCommit()` + `restoreVersion()` 方法

**实施内容：**

1. 在 `src/main/services/git-abstraction.ts` 中新增：
   - `readFileAtCommit(filepath, ref)` 公开方法
   - `restoreVersion(filepath, commitSha)` 方法

2. 编写主进程单元测试：
   - `readFileAtCommit()` 读取指定 commit 的文件内容
   - `readFileAtCommit()` 文件不存在返回空字符串
   - `restoreVersion()` 成功恢复并产生新 commit
   - `restoreVersion()` NOTHING_TO_COMMIT 场景

**验证标准：**
- [ ] 单元测试通过
- [ ] `npm run type-check` 通过
- [ ] 恢复后的文件内容与指定 commit 一致

### Step 3：IPC Handler + Preload 扩展（预估 2h）

**产出：** GitHandler 扩展 + Preload API + Mock + Test setup

**实施内容：**

1. 扩展 `src/main/ipc/handlers/git.handler.ts`：
   - 新增 `gitAbstraction` 属性和 `setGitAbstraction()` setter
   - 注册 `git:history`/`git:diff`/`git:restore` handler
   - 实现 `handleHistory`/`handleDiff`/`handleRestore` 方法

2. 扩展 `src/preload/index.ts`：
   - 新增 `git.history()`/`git.diff()`/`git.restore()` 方法
   - 更新 `ALLOWED_CHANNELS` 白名单

3. 扩展 `src/renderer/dev/mockElectronAPI.ts`：
   - `git.history()` 返回空数组
   - `git.diff()` 返回空 diff
   - `git.restore()` 返回 mock OID

4. 扩展 `tests/renderer/setup.ts`：
   - 新增 `git.history`/`git.diff`/`git.restore` vi.fn() mock

5. 在主进程入口注入 `gitHandler.setGitAbstraction(gitAbstraction)`

**验证标准：**
- [ ] 从渲染进程 DevTools 调用 `window.electronAPI.git.history()` → 返回 `IPCResponse<CommitInfo[]>`
- [ ] `npm run type-check` 通过
- [ ] Mock API 测试通过

### Step 4：versionHistoryStore + formatRelativeTime（预估 1.5h）

**产出：** Zustand store + 时间格式化工具

**实施内容：**

1. 创建 `src/renderer/store/versionHistoryStore.ts`：
   - `VersionHistoryState` / `VersionHistoryActions` 接口
   - `extractSummary()` 辅助函数
   - `commitInfoToVersionEntry()` 映射函数
   - `openPanel()` / `closePanel()` / `loadHistory()` / `selectVersion()` / `restoreVersion()` / `setPage()`
   - devtools 中间件
   - 导出 selectors

2. 创建 `src/renderer/utils/formatRelativeTime.ts`

3. 编写 store 测试 `tests/renderer/versionHistoryStore.test.ts`

**验证标准：**
- [ ] store 操作正确更新状态
- [ ] `loadHistory()` 调用 IPC 并映射结果
- [ ] `selectVersion()` 触发 diff 加载
- [ ] `restoreVersion()` 成功后关闭面板

### Step 5：VersionHistoryPanel + VersionList + DiffHunkView（预估 3h）

**产出：** 版本历史 UI 组件

**实施内容：**

1. 创建 `src/renderer/components/version-history/DiffHunkView.tsx`
2. 创建 `src/renderer/components/version-history/VersionList.tsx`
3. 创建 `src/renderer/components/version-history/RestoreConfirmDialog.tsx`
4. 创建 `src/renderer/components/version-history/VersionHistoryPanel.tsx`
5. 创建 `src/renderer/components/version-history/index.ts` 桶导出

**验证标准：**
- [ ] 各组件独立渲染正确
- [ ] 选中版本后 Diff 显示
- [ ] 分页按钮在 >= PAGE_SIZE 条目时出现
- [ ] 暗色模式正确显示
- [ ] `npm run type-check` 通过

### Step 6：文件树集成（预估 1.5h）

**产出：** 右键菜单入口 + 面板挂载

**实施内容：**

1. 修改 `TreeContextMenu.tsx`：
   - 新增 `onViewHistory` 可选 prop
   - 文件类型菜单中插入"查看历史"项

2. 修改 `FileTree.tsx`：
   - 传入 `onViewHistory` 回调
   - 挂载 `<VersionHistoryPanel />`

**验证标准：**
- [ ] 右键文件显示"查看历史"菜单项
- [ ] 点击后版本历史面板弹出
- [ ] 右键文件夹不显示"查看历史"
- [ ] 现有测试通过（无回归）

### Step 7：测试编写（预估 3h）

**产出：** 完整测试套件

**实施内容：**

1. `tests/renderer/versionHistoryStore.test.ts`：
   - openPanel/closePanel 状态切换
   - loadHistory IPC 调用 + 映射
   - selectVersion diff 加载
   - restoreVersion 成功/失败
   - 分页逻辑

2. `tests/renderer/VersionHistoryPanel.test.tsx`：
   - isOpen=false 不渲染
   - 加载中状态
   - 版本列表渲染
   - 选中版本后 diff 区域出现
   - 关闭按钮调用 closePanel

3. `tests/renderer/VersionList.test.tsx`：
   - 版本项渲染（摘要、作者、时间）
   - 选中态高亮
   - 空状态展示

4. `tests/renderer/DiffHunkView.test.tsx`：
   - add/delete/context 行颜色
   - hunk header 显示
   - 空 hunks

5. `tests/renderer/RestoreConfirmDialog.test.tsx`：
   - 确认按钮调用 onConfirm
   - 取消/关闭调用 onCancel

6. 更新现有测试 `tests/renderer/TreeNode.test.tsx`/`FileTree.test.tsx`：
   - TreeContextMenu 新增 onViewHistory prop 兼容

**验证标准：**
- [ ] 新增测试覆盖率 ≥ 60%
- [ ] `npm run lint` 无警告
- [ ] `npm run type-check` 无错误
- [ ] 现有测试全部通过（无回归）

---

## 九、验收标准与交付物

### 9.1 功能验收清单

| # | 验收项 | 需求来源 | 对应 Step | 验证方式 |
|---|--------|---------|----------|---------|
| 1 | 右键文件选择"查看历史"显示版本列表 | 需求 2.5 AC1 | Step 6 | 手动验证 |
| 2 | 版本列表显示时间、作者、变更摘要 | 需求 2.5 AC2 | Step 4-5 | 单元测试 + 手动验证 |
| 3 | 选中版本显示与当前版本的 diff 对比 | 需求 2.5 AC3 | Step 5 | 单元测试 + 手动验证 |
| 4 | 点击"恢复到此版本"创建新 commit 恢复旧内容 | 需求 2.5 AC4 | Step 2 | 单元测试 + 手动验证 |
| 5 | 超过 50 个版本时分页显示 | 需求 2.5 AC5 | Step 4-5 | 单元测试 |
| 6 | Diff 高亮清晰（绿增红删） | 补充 | Step 5 | 手动验证 |
| 7 | 恢复操作有二次确认 | CLAUDE.md | Step 5 | 手动验证 |
| 8 | 所有 UI 文字不出现 Git 术语 | CLAUDE.md | Step 5-6 | 代码审查 |

### 9.2 性能指标

| # | 指标 | 目标 | 验证方式 |
|---|------|------|---------|
| 1 | 版本历史加载 | < 1 秒 | Chrome DevTools Network |
| 2 | Diff 计算 | < 500ms | 主进程日志时间戳 |
| 3 | 版本恢复 | < 2 秒 | 手动计时 |
| 4 | 版本列表滚动 | 流畅无卡顿 | 手动验证 |

### 9.3 代码质量验收

| # | 验收项 | 验证方式 |
|---|--------|---------|
| 1 | TypeScript strict mode 无错误 | `npm run type-check` |
| 2 | ESLint 检查通过 | `npm run lint` |
| 3 | 所有公共函数有 JSDoc 注释 | 代码审查 |
| 4 | 新增代码测试覆盖率 ≥ 60% | Vitest 覆盖率 |
| 5 | 现有测试全部通过 | `npm run test` |

### 9.4 交付物清单

| # | 文件 | 类型 | 状态 |
|---|------|------|------|
| 1 | `src/main/services/git-abstraction.ts` | 扩展 | 新增 readFileAtCommit + restoreVersion |
| 2 | `src/main/ipc/handlers/git.handler.ts` | 扩展 | 新增 history/diff/restore handler |
| 3 | `src/shared/types.ts` | 更新 | 新增 GIT_RESTORE + 类型补全 |
| 4 | `src/preload/index.ts` | 更新 | 新增 git.history/diff/restore |
| 5 | `src/renderer/store/versionHistoryStore.ts` | 新增 | 版本历史状态管理 |
| 6 | `src/renderer/utils/formatRelativeTime.ts` | 新增 | 人性化时间 |
| 7 | `src/renderer/components/version-history/VersionHistoryPanel.tsx` | 新增 | 版本历史面板 |
| 8 | `src/renderer/components/version-history/VersionList.tsx` | 新增 | 版本列表 |
| 9 | `src/renderer/components/version-history/DiffHunkView.tsx` | 新增 | Diff 渲染 |
| 10 | `src/renderer/components/version-history/RestoreConfirmDialog.tsx` | 新增 | 恢复确认 |
| 11 | `src/renderer/components/version-history/index.ts` | 新增 | 桶导出 |
| 12 | `src/renderer/components/layout/TreeContextMenu.tsx` | 扩展 | 新增查看历史菜单项 |
| 13 | `src/renderer/components/layout/FileTree.tsx` | 扩展 | 挂载面板 |
| 14 | `src/renderer/dev/mockElectronAPI.ts` | 扩展 | git mock |
| 15 | `tests/renderer/setup.ts` | 扩展 | git mock |
| 16 | `tests/renderer/versionHistoryStore.test.ts` | 新增 | Store 测试 |
| 17 | `tests/renderer/VersionHistoryPanel.test.tsx` | 新增 | 面板测试 |
| 18 | `tests/renderer/VersionList.test.tsx` | 新增 | 列表测试 |
| 19 | `tests/renderer/DiffHunkView.test.tsx` | 新增 | Diff 测试 |
| 20 | `tests/renderer/RestoreConfirmDialog.test.tsx` | 新增 | 对话框测试 |
| 21 | `tests/main/git-abstraction-version-history.test.ts` | 新增 | 主进程扩展测试 |

---

## 十、风险评估与回滚策略

### 10.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| isomorphic-git log 对单文件的过滤效率不理想（需遍历所有 commit） | 中 | 中 | 使用 `depth` 限制查询数量；现有 `filterHistoryByFile()` 已实现；单文件历史通常 <200 条 |
| 超长历史（>500 条）加载超时 | 低 | 低 | 客户端分页策略，仅请求 PAGE_SIZE 条 |
| Diff hunks 计算不准 | 中 | 低 | 复用 GitAbstraction 已有的 `computeDiffHunks()`（使用 diff 库 `structuredPatch`），已验证可靠 |
| 恢复版本后文件树/编辑器不刷新 | 低 | 低 | 恢复后触发 `file:change` 事件（file watcher 自动检测） |
| IPCChannelMap 跨层引用 git-abstraction.types | 低 | 中 | 纯数据接口，无运行时依赖；后续可迁移到 shared |
| TreeContextMenu 新增 prop 破坏现有测试 | 低 | 低 | `onViewHistory` 为可选 prop，现有测试无需修改 |

### 10.2 时间风险

本任务复杂度中等，核心接口已由 Phase 0 实现（getHistory/getFileDiff），主要是 IPC 桥接 + 前端 UI 构建。预估 2-3 个工作日，风险较低。

### 10.3 回滚策略

1. **GitAbstraction 扩展** — 新增方法不影响现有方法，可安全移除
2. **GitHandler 扩展** — 新增 handler 注册可安全移除，不影响冲突 handler
3. **version-history/ 目录** — 独立新增目录，可安全删除
4. **versionHistoryStore** — 独立新增文件，可安全删除
5. **TreeContextMenu 扩展** — 移除 `onViewHistory` prop 和对应菜单项即可恢复
6. **shared/types.ts 扩展** — 删除新增常量和类型映射即可恢复
7. **preload 扩展** — 删除新增方法即可恢复

---

**创建时间：** 2026-04-17
**最后更新：** 2026-04-17
**更新记录：**
- 2026-04-17 — 初始创建
