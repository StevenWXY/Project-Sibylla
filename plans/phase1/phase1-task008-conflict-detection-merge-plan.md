# PHASE1-TASK008: 冲突检测与合并界面 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task008_conflict-detection-merge.md](../specs/tasks/phase1/phase1-task008_conflict-detection-merge.md)
> 创建日期：2026-04-17
> 最后更新：2026-04-17

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK008 |
| **任务标题** | 冲突检测与合并界面 |
| **优先级** | P0 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **前置依赖** | ✅ TASK011（Git pull 冲突检测）、✅ TASK006（SyncManager sync:conflict 事件）、✅ TASK007（syncStatusStore + TreeNode 冲突红点） |

### 目标

实现 Git 冲突的检测、展示和解决全流程。当自动同步 pull 到远端变更导致文件冲突时，系统需检测冲突文件、弹出冲突通知、展示左右对比视图（我的版本/对方的版本），并支持用户选择解决方案后自动 commit。

### 核心命题

CLAUDE.md UI/UX 红线的直接实现——"冲突解决界面必须让用户能清楚看到'我的版本'和'对方的版本'的差异"，同时遵循"AI 建议，人类决策"原则——解决冲突的最终决策权在用户。

### 范围边界

**包含：**
- `ConflictResolver` 服务——主进程冲突标记解析与解决
- `git.handler.ts` IPC 通道——`git:getConflicts` / `git:resolve` / `git:conflictDetected`
- `conflictStore` — Zustand 冲突状态管理
- `ConflictNotification` — 冲突 Toast 通知组件
- `ConflictCompareView` — 左右对比视图组件
- `ConflictEditor` — 手动合并编辑器
- `DiffHighlight` — Diff 行级高亮组件
- `ConflictResolutionPanel` — 升级现有骨架组件
- Preload API 扩展 + 共享类型扩展

**不包含：**
- AI 自动合并建议（Phase 2，UI 预留灰化按钮位置）
- 三方合并算法（使用 isomorphic-git 内置 merge）
- 实时协作冲突预防（CRDT/OT 不在范围内）

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 路径 | 关键约束 |
|------|------|---------|
| 项目宪法 | `CLAUDE.md` | TypeScript 严格模式禁止 any；主进程与渲染进程严格隔离；注释英文/commit 中文；冲突解决界面必须让用户清楚看到差异；AI 输出涉及文件修改必须展示 diff 预览 |
| 系统架构 | `specs/design/architecture.md` | GitAbstraction.getConflicts() / resolveConflict() 语义接口定义；渲染进程禁止直接访问文件系统 |
| UI/UX 规范 | `specs/design/ui-ux-design.md` §5.3 | 冲突解决界面布局：左右对比 + AI 建议区 + 四个操作按钮（采用我的/采用对方的/采用AI建议/手动编辑） |
| 数据模型与 API | `specs/design/data-and-api.md` §5.2 | `ipc:git:resolve(path, Resolution) → void` IPC 接口定义 |
| 需求规格 | `specs/requirements/phase1/sprint2-git-sync.md` §2.4 | 需求 2.4 七条验收标准：冲突通知、三栏视图、左右版本展示、三种解决策略、自动 commit+push |
| 任务规格 | `specs/tasks/phase1/phase1-task008_conflict-detection-merge.md` | 6 个子任务、7 条功能验收标准、5 类测试用例、8 步实施计划 |

### 2.2 Skill 依赖

| Skill | 路径 | 使用场景 |
|-------|------|---------|
| `isomorphic-git-integration` | `.kilocode/skills/phase0/isomorphic-git-integration/SKILL.md` §5 | `getConflicts()` 冲突标记解析模式（`statusMatrix` 检测 + `<<<<<<< HEAD` 标记解析）；`resolveConflict()` 三策略解决模式（OURS/THEIRS/MANUAL + stage + commit） |
| `electron-ipc-patterns` | `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` | `git:getConflicts` / `git:resolve` invoke/handle 模式；`git:conflictDetected` webContents.send 推送模式；类型安全 IPCChannelMap 扩展 |
| `zustand-state-management` | `.kilocode/skills/phase1/zustand-state-management/SKILL.md` | conflictStore 设计：state/actions 分离、selector 精确订阅、devtools 中间件、IPC 调用封装在 action 中 |
| `typescript-strict-mode` | `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` | ConflictInfo / ResolutionType / ConflictResolution 严格类型；泛型约束 store 类型 |
| `vercel-react-best-practices` | `.kilocode/skills/common/vercel-react-best-practices/SKILL.md` | ConflictCompareView memo 化避免不必要的重渲染；DiffHighlight 纯组件优化 |

### 2.3 前置代码依赖

| 模块 | 路径 | 行数 | 状态 | 说明 |
|------|------|------|------|------|
| GitAbstraction.pull() | `src/main/services/git-abstraction.ts:1363-1548` | 2185 | ⚠️ 需扩展 | pull() 检测冲突返回 `hasConflicts:true` 但 `conflicts` 为空数组（L1477），不解析冲突标记；无 `getConflicts()` / `resolveConflict()` 方法 |
| SyncManager.performSync() | `src/main/services/sync-manager.ts:521-524` | 671 | ✅ 已完成 | 检测 `result.hasConflicts` 后 emit `sync:conflict` 事件 + `updateStatus('conflict')` + `conflictFiles` |
| SyncHandler | `src/main/ipc/handlers/sync.handler.ts` | 146 | ✅ 已完成 | 广播 `sync:status-changed`（含 conflictFiles）到渲染进程 |
| syncStatusStore | `src/renderer/store/syncStatusStore.ts` | ~50 | ✅ 已完成 | 追踪 `conflictFiles: readonly string[]`；提供 `selectConflictFiles` selector |
| TreeNode 冲突标识 | `src/renderer/components/layout/TreeNode.tsx:75-76,175-177` | 274 | ✅ 已完成 | 已接收 `conflictPaths` prop 并渲染红点标识 |
| ConflictResolutionPanel | `src/renderer/components/studio/ConflictResolutionPanel.tsx` | 163 | ⚠️ 需升级 | UI 骨架，硬编码 mock 数据，未连接 IPC/store |
| IPC Git 通道 | `src/shared/types.ts:93-98,232-237` | 886 | ⚠️ 需扩展 | 5 个 Git 通道已注册但 `return: unknown`，需类型化并新增冲突专用通道 |
| Preload sync API | `src/preload/index.ts:107-111` | 575 | ⚠️ 需扩展 | 无 git 命名空间 API，需新增 `git.getConflicts()` / `git.resolve()` / `git.onConflictDetected()` |
| `diff` npm 包 | `package.json:53` (dependencies) | — | ✅ 已安装 | `diff@^8.0.3` + `@types/diff@^7.0.2`；GitAbstraction L24 已 import `structuredPatch` |
| FileTree | `src/renderer/components/layout/FileTree.tsx` | — | ✅ 已完成 | 已透传 `conflictPaths` 到 TreeNode（TASK007） |
| Logger | `src/main/utils/logger.ts` | — | ✅ 已完成 | 结构化日志 `logger.info()` / `logger.warn()` / `logger.error()` |

### 2.4 被依赖任务

| 任务 | 依赖方式 |
|------|---------|
| PHASE1-TASK009（版本历史展示） | 可查看冲突解决的 commit 历史 |

### 2.5 npm 依赖

无需新增 npm 包。`diff@^8.0.3` 已安装，用于 `diffLines()` 行级差异计算。

---

## 三、现有代码盘点与差距分析

### 3.1 冲突检测现状

> **关键发现：** 冲突检测链路已基本打通（SyncManager → SyncHandler → syncStatusStore → TreeNode 红点），但**冲突文件内容解析、冲突解决、冲突 UI 交互**三层完全缺失。

**现状数据流（检测层，存在断裂）：**
```
GitAbstraction.pull() → hasConflicts:true, conflicts:[]（空数组！）
  → SyncManager → sync:conflict → SyncHandler → syncStatusStore → TreeNode
  → conflictFiles 为空 → 红点不显示
```

**目标数据流（本任务修补）：**
```
pull() → enumerateConflictFiles() 填充 conflicts 路径列表
  → SyncManager → ConflictResolver.getConflicts() 解析标记提取 ours/theirs
  → git:conflictDetected IPC → conflictStore → ConflictNotification Toast
  → ConflictCompareView 左右对比 → 用户选择策略 → git:resolve IPC
  → ConflictResolver.resolve() 写入 + stage + commit → 自动 push
```

### 3.2 差距矩阵

| 能力 | 现有 | 缺口 | 本任务产出 |
|------|------|------|-----------|
| 冲突检测（pull 时） | ✅ `hasConflicts:true` | `conflicts:[]` 为空，未枚举文件 | GitAbstraction.pull() 扩展枚举冲突文件 |
| 冲突标记解析 | ❌ 无 | 无法提取 ours/theirs 内容 | `ConflictResolver.parseConflictFile()` |
| 冲突解决 | ❌ 无 | 无 accept ours/theirs/manual 方法 | `ConflictResolver.resolve()` |
| 冲突 IPC 通道 | ❌ Git 通道 `return:unknown` | 无冲突专用通道 | `git.handler.ts` + 3 个新通道 |
| 冲突 Preload API | ❌ 无 git 命名空间 | 渲染进程无法调用冲突 API | `git.getConflicts()` / `git.resolve()` / `git.onConflictDetected()` |
| 冲突状态管理 | ⚠️ syncStatusStore 仅存文件路径列表 | 无 ConflictInfo 详细数据 | `conflictStore`（独立 store） |
| 冲突通知 | ❌ 无 | 无 Toast 通知 | `ConflictNotification` 组件 |
| 对比视图 | ⚠️ 骨架存在但硬编码 | 未连接真实数据 | `ConflictCompareView` + `DiffHighlight` |
| 手动合并编辑器 | ❌ 无 | 无编辑能力 | `ConflictEditor` 组件 |
| 冲突文件内容读取 | ❌ 无 | ConflictResolver 需读工作区文件 | `ConflictResolver.readFileContent()` |

### 3.3 核心架构决策

1. **ConflictResolver 独立服务类** — GitAbstraction 已 2185 行，冲突解析涉及文件 I/O + 文本解析 + 业务逻辑，注入 GitAbstraction 调用 stageFile/commit。
2. **新建 `git.handler.ts`** — SyncHandler 处理同步状态广播，冲突解决属于 Git 操作层，职责分离。
3. **conflictStore 独立于 syncStatusStore** — syncStatusStore 存全局同步状态（轻量），conflictStore 存 ConflictInfo[]（含文件内容，重量），各司其职。
4. **从工作区 conflict markers 解析** — isomorphic-git statusMatrix 在 merge 冲突后不稳定，`<<<<<<< HEAD` 标记是最可靠的冲突信号。

### 3.4 需新建的文件

| # | 文件路径 | 类型 | 说明 |
|---|---------|------|------|
| 1 | `src/main/services/conflict-resolver.ts` | 新增 | 冲突标记解析与解决服务 |
| 2 | `src/main/services/types/conflict.types.ts` | 新增 | ConflictInfo / ResolutionType / ConflictResolution 类型 |
| 3 | `src/main/ipc/handlers/git.handler.ts` | 新增 | Git 操作 IPC handler（冲突专用） |
| 4 | `src/renderer/store/conflictStore.ts` | 新增 | 冲突状态 Zustand store |
| 5 | `src/renderer/components/conflict/ConflictNotification.tsx` | 新增 | 冲突通知 Toast |
| 6 | `src/renderer/components/conflict/ConflictCompareView.tsx` | 新增 | 左右对比视图 |
| 7 | `src/renderer/components/conflict/ConflictEditor.tsx` | 新增 | 手动合并编辑器 |
| 8 | `src/renderer/components/conflict/DiffHighlight.tsx` | 新增 | Diff 行级高亮 |
| 9 | `src/renderer/components/conflict/index.ts` | 新增 | 模块导出 |

### 3.5 需修改的文件

| # | 文件路径 | 修改内容 | 风险 |
|---|---------|---------|------|
| 1 | `src/shared/types.ts` | 新增 `GIT_GET_CONFLICTS` / `GIT_RESOLVE` / `GIT_CONFLICT_DETECTED` 三个 IPC 通道；扩展 `IPCChannelMap`；新增 `ConflictInfo` / `ResolutionType` / `ConflictResolution` 共享类型 | 低 — 纯新增 |
| 2 | `src/main/services/git-abstraction.ts` | pull() 中检测到冲突时枚举冲突文件路径（扫描工作区 `<<<<<<< HEAD` 标记），填充 `conflicts` 数组 | 中 — 修改 pull 核心方法 |
| 3 | `src/main/services/sync-manager.ts` | 新增 ConflictResolver 注入；在 performSync() 冲突分支中调用 `conflictResolver.getConflicts()` 获取详细冲突信息 | 中 — 扩展同步流程 |
| 4 | `src/preload/index.ts` | 新增 `git` 命名空间 API：`getConflicts()` / `resolve()` / `onConflictDetected()` | 中 — 修改 preload 桥接 |
| 5 | `src/renderer/components/studio/ConflictResolutionPanel.tsx` | 升级为使用 conflictStore + ConflictCompareView，移除硬编码 mock 数据 | 中 — 重写组件 |
| 6 | `src/renderer/dev/mockElectronAPI.ts` | 新增 `git` 命名空间 mock 方法 | 低 — 纯新增 |

### 3.6 不修改的文件

| 文件 | 原因 |
|------|------|
| `src/renderer/store/syncStatusStore.ts` | 已完整实现，通过 IPC 事件自动获取 conflictFiles，无需变更 |
| `src/renderer/components/layout/TreeNode.tsx` | 已有冲突红点标识（TASK007），无需变更 |
| `src/renderer/components/layout/FileTree.tsx` | 已透传 conflictPaths，无需变更 |
| `src/main/ipc/handlers/sync.handler.ts` | 仅处理同步状态广播，冲突解决走 git.handler.ts |

---

## 四、类型系统设计

> 类型定义分三处：服务层内部类型放 `conflict.types.ts`，IPC 通信层类型放 `shared/types.ts`，渲染进程 store 类型在 store 文件内局部定义。

### 4.1 服务层类型（conflict.types.ts 新增）

```typescript
// src/main/services/types/conflict.types.ts

/** Single file conflict information */
export interface ConflictInfo {
  /** Workspace-relative file path */
  readonly filePath: string
  /** Local (ours) version content — extracted from <<<<<<< HEAD section */
  readonly localContent: string
  /** Remote (theirs) version content — extracted from >>>>>>> section */
  readonly remoteContent: string
  /** Common ancestor (base) version content */
  readonly baseContent: string
  /** Name of the remote author (if available) */
  readonly remoteAuthor?: string
}

/** Conflict resolution strategy */
export type ResolutionType = 'mine' | 'theirs' | 'manual'

/** Resolution request — sent from renderer via IPC */
export interface ConflictResolution {
  /** Workspace-relative file path */
  readonly filePath: string
  /** Resolution strategy */
  readonly type: ResolutionType
  /** Required when type is 'manual' */
  readonly content?: string
}
```

**设计决策：**
- `ConflictInfo` 使用 `readonly` 属性——冲突信息是不可变快照
- `localContent` / `remoteContent` 命名与任务 spec 一致（不用 ours/theirs），避免与 Git 术语混淆
- `baseContent` 预留用于未来 AI 合并建议（需要 base 版本计算双方 diff）
- `ResolutionType` 三值枚举：`mine` / `theirs` / `manual`，对应三种用户操作
- `ConflictResolution.content` 仅在 `type === 'manual'` 时必填，用可选类型 + 运行时校验

### 4.2 共享类型（shared/types.ts 扩展）

#### 新增 IPC 通道常量

```typescript
// 在 IPC_CHANNELS 对象中新增（Git 冲突专用通道）：
GIT_GET_CONFLICTS: 'git:getConflicts',
GIT_RESOLVE: 'git:resolve',
GIT_CONFLICT_DETECTED: 'git:conflictDetected',
```

#### IPCChannelMap 扩展

```typescript
// 替换原有 return: unknown 的 Git 通道，并新增冲突通道：
[IPC_CHANNELS.GIT_STATUS]: { params: []; return: unknown }
[IPC_CHANNELS.GIT_SYNC]: { params: []; return: unknown }
[IPC_CHANNELS.GIT_COMMIT]: { params: [message?: string]; return: unknown }
[IPC_CHANNELS.GIT_HISTORY]: { params: []; return: unknown }
[IPC_CHANNELS.GIT_DIFF]: { params: []; return: unknown }

// 新增冲突专用通道：
[IPC_CHANNELS.GIT_GET_CONFLICTS]: {
  params: []
  return: ConflictInfo[]
}
[IPC_CHANNELS.GIT_RESOLVE]: {
  params: [resolution: ConflictResolution]
  return: string  // commit OID
}
// GIT_CONFLICT_DETECTED: Main→Renderer push, 不走 IPCChannelMap
```

**注意：** `git:conflictDetected` 是 Main→Renderer 推送事件（webContents.send），不走 IPCChannelMap，与 `sync:status-changed` 模式一致。

#### 新增共享类型

从 `conflict.types.ts` re-export 到 shared/types.ts 供渲染进程使用：

```typescript
// 在 shared/types.ts 中新增 re-export
export type { ConflictInfo, ResolutionType, ConflictResolution } from './services/types/conflict.types'
```

> **备选方案：** 如果 re-export 路径不合理（shared 不应引用 main 层），则将 `ConflictInfo` / `ResolutionType` / `ConflictResolution` 直接定义在 `shared/types.ts` 中，服务层从 shared 导入。**选用此方案**——与现有 `SyncStatus` / `SyncResult` 模式一致。

### 4.3 Preload API 类型扩展

```typescript
interface ElectronAPI {
  // ... 现有命名空间保持不变
  git: {
    /** Get detailed conflict info for all conflicting files */
    getConflicts: () => Promise<IPCResponse<ConflictInfo[]>>
    /** Resolve a conflict with chosen strategy */
    resolve: (resolution: ConflictResolution) => Promise<IPCResponse<string>>
    /** Listen for conflict detection events (pushed on sync conflict) */
    onConflictDetected: (callback: (conflicts: ConflictInfo[]) => void) => () => void
  }
}
```

---

## 五、ConflictResolver 服务设计

### 5.1 类结构

```typescript
export class ConflictResolver {
  private readonly gitAbstraction: GitAbstraction
  private readonly workspaceDir: string
  private static readonly MARKER_OURS_START = '<<<<<<< '
  private static readonly MARKER_SEPARATOR = '======='
  private static readonly MARKER_THEIRS_END = '>>>>>>> '
}
```

### 5.2 核心方法概览

| 方法 | 签名 | 说明 |
|------|------|------|
| `getConflicts` | `async () → ConflictInfo[]` | 扫描工作区含 `<<<<<<<` 标记的文件，逐文件 parseConflictFile |
| `parseConflictFile` | `private async (filePath) → ConflictInfo` | 读文件内容 + extractVersions + 空 baseContent |
| `extractVersions` | `private (content) → { ours, theirs }` | 解析标记：共享行加入双方 + ours 段 + theirs 段 |
| `resolve` | `async (ConflictResolution) → string` | 三策略选内容 → writeFile → stageFile → commit → 返回 OID |

### 5.3 extractVersions 算法

```typescript
private extractVersions(content: string): { ours: string; theirs: string } {
  const lines = content.split('\n')
  const oursLines: string[] = []
  const theirsLines: string[] = []
  let inOurs = false, inTheirs = false

  for (const line of lines) {
    if (line.startsWith(ConflictResolver.MARKER_OURS_START)) {
      inOurs = true; inTheirs = false; continue
    }
    if (line === ConflictResolver.MARKER_SEPARATOR) {
      inOurs = false; inTheirs = true; continue
    }
    if (line.startsWith(ConflictResolver.MARKER_THEIRS_END)) {
      inOurs = false; inTheirs = false; continue
    }
    if (inOurs) { oursLines.push(line) }
    else if (inTheirs) { theirsLines.push(line) }
    else { oursLines.push(line); theirsLines.push(line) } // 共享行 → 双方都包含
  }
  return { ours: oursLines.join('\n'), theirs: theirsLines.join('\n') }
}
```

### 5.4 resolve 方法逻辑

```
1. mine → content = parseConflictFile().localContent
2. theirs → content = parseConflictFile().remoteContent
3. manual → 校验 content 非空 → content = resolution.content
4. writeFile → stageFile → commit('[冲突解决] 文件名') → 返回 OID
5. 错误: manual content 为空 → throw Error
```

commit message 规范：`[冲突解决] 文件名.md`，中文，不使用 Git 术语。

### 5.5 GitAbstraction.pull() 扩展

在 `git-abstraction.ts:1468-1478` 的冲突检测分支中，将 `conflicts: []` 替换为实际的冲突文件路径枚举：

```typescript
if (mergeResult.tree === undefined) {
  const conflictFiles = await this.enumerateConflictFiles()
  return { success: false, hasConflicts: true, conflicts: conflictFiles }
}
```

`enumerateConflictFiles()` 扫描 `status.modified` 文件中包含 `<<<<<<< ` 标记的文件路径。此方法仅返回路径列表，详细内容解析由 ConflictResolver 负责。

---

## 六、IPC 通道设计与集成

### 6.1 IPC 通道总览

| 通道 | 方向 | 模式 | 参数 | 返回值 | 说明 |
|------|------|------|------|--------|------|
| `git:getConflicts` | Renderer → Main | invoke/handle | — | `IPCResponse<ConflictInfo[]>` | 获取冲突详情列表 |
| `git:resolve` | Renderer → Main | invoke/handle | `ConflictResolution` | `IPCResponse<string>` | 解决冲突（返回 commit OID） |
| `git:conflictDetected` | Main → Renderer | webContents.send | — | `ConflictInfo[]` | 冲突检测推送（sync 时自动触发） |

### 6.2 GitHandler 新增

新建 `src/main/ipc/handlers/git.handler.ts`，继承 `IpcHandler`，遵循 SyncHandler 的 setter 注入模式：

- `register()`: 注册 `git:getConflicts` (invoke/handle) + `git:resolve` (invoke/handle)
- `setConflictResolver(resolver)`: setter 注入
- `broadcastConflict(conflicts)`: 遍历 `BrowserWindow.getAllWindows()` → `webContents.send(GIT_CONFLICT_DETECTED, conflicts)`
- `cleanup()`: `ipcMain.removeHandler` 两个通道
- handler 方法使用 `safeHandle` 包装错误处理

### 6.3 SyncManager 集成点

在 `sync-manager.ts:521-524` 的 `performSync()` 冲突分支中新增：

```typescript
if (this.conflictResolver && conflicts.length > 0) {
  const conflictInfos = await this.conflictResolver.getConflicts()
  this.emit('conflict:details', conflictInfos)
}
```

GitHandler 监听 `conflict:details` 事件 → `broadcastConflict()`。主进程入口连接两个实例。

### 6.4 Preload API 扩展

新增 `git` 命名空间：

- `getConflicts()` → `safeInvoke<ConflictInfo[]>(GIT_GET_CONFLICTS)`
- `resolve(resolution)` → `safeInvoke<string>(GIT_RESOLVE, resolution)`
- `onConflictDetected(callback)` → `ipcRenderer.on` + cleanup 返回函数（与 `onStatusChange` 模式一致）

白名单更新：`ALLOWED_CHANNELS` 新增三个 Git 冲突通道。

---

## 七、conflictStore 设计

### 7.1 设计原则

1. **独立 store** — 与 syncStatusStore 分离，专注 ConflictInfo[] 详细数据
2. **IPC 封装在 action 中** — 组件不直接调用 `window.electronAPI`，通过 store action 触发
3. **devtools 集成** — 遵循 editorStore / syncStatusStore 模式
4. **不使用 persist** — 冲突信息是运行时临时状态

### 7.2 Store 接口

```typescript
interface ConflictState {
  readonly conflicts: ConflictInfo[]
  readonly activeIndex: number
  readonly isResolving: boolean
  readonly resolveError: string | null
}

interface ConflictActions {
  setConflicts: (conflicts: ConflictInfo[]) => void
  setActiveIndex: (index: number) => void
  resolveConflict: (resolution: ConflictResolution) => Promise<void>
  clearConflicts: () => void
}
```

### 7.3 Store 实现要点

- `create<ConflictStore>()(devtools(...))` + `{ name: 'ConflictStore' }`
- `resolveConflict` action 内部调用 `window.electronAPI.git.resolve(resolution)` — IPC 封装在 action 中
- 解决成功后 `conflicts.filter(c => c.filePath !== resolution.filePath)` 自动移除已解决文件
- `activeIndex` 边界保护：`Math.min(activeIndex, Math.max(0, remaining.length - 1))`
- Selectors: `selectConflicts` / `selectActiveConflict` / `selectIsResolving` / `selectResolveError` / `selectConflictCount`

### 7.4 设计决策

**resolveConflict action 内部调用 IPC** — 组件不直接调 `window.electronAPI`，符合 zustand-state-management skill 推荐。**解决后自动从列表移除** — 解决所有冲突后 `conflicts` 为空，UI 自动关闭。

---

## 八、组件设计

### 8.1 ConflictNotification（冲突通知 Toast）

**文件：** `src/renderer/components/conflict/ConflictNotification.tsx`

**双重职责：** (1) useEffect 监听 `git:conflictDetected` IPC 事件 → `conflictStore.setConflicts` (2) selector 订阅 `conflicts` → 渲染浮动通知。

```
视觉: fixed top-4 right-4 z-50 w-96, bg-white dark:bg-gray-800
      AlertTriangle 图标 + "发现文件冲突" + 文件列表 + [查看并解决冲突] 按钮
交互: 按钮点击 → 触发 WorkspaceStudioPage 展示 ConflictResolutionPanel
```

### 8.2 ConflictCompareView（左右对比视图）

**文件：** `src/renderer/components/conflict/ConflictCompareView.tsx`

```
Props: conflict: ConflictInfo, onResolve, isResolving
State: activeTab('compare'|'manual'), manualContent

布局:
  ┌──────────────────────────────────────────────────────┐
  │  ⚠ 冲突: path                        [对比] [手动合并] │
  ├────────────────────────┬─────────────────────────────┤
  │  你的版本               │  对方的版本（author）          │
  │  (DiffHighlight)        │  (DiffHighlight)             │
  ├────────────────────────┴─────────────────────────────┤
  │  [采用我的版本] [采用对方的版本] [采用AI建议(灰化)] [确认手动合并] │
  └──────────────────────────────────────────────────────┘

Diff 高亮: 左侧 content=local compareAgainst=remote; 右侧反向
AI 建议按钮: disabled + tooltip "Phase 2 可用"
```

### 8.3 DiffHighlight（Diff 高亮组件）

**文件：** `src/renderer/components/conflict/DiffHighlight.tsx`

使用 `diffLines(compareAgainst, content)` 计算差异。added → emerald 高亮，removed → red 高亮。React.memo + useMemo 缓存。

### 8.4 ConflictEditor（手动合并编辑器）

**文件：** `src/renderer/components/conflict/ConflictEditor.tsx`

基于 `<textarea>` 的手动合并编辑器（不引入 Monaco），预填充 localContent，font-mono text-sm，onChange 实时回传。

### 8.5 ConflictResolutionPanel 升级

**文件：** `src/renderer/components/studio/ConflictResolutionPanel.tsx`

删除所有硬编码 mock 数据，连接 conflictStore。多文件导航（← 1/3 →），渲染 ConflictCompareView。resolveError → 显示错误提示。

---

## 九、分步实施计划

> 共 7 步，每步产出可独立验证的增量。Step 1-2 为类型+服务（主进程），Step 3 为 IPC 通道，Step 4-6 为 UI 组件+store，Step 7 为测试。

### Step 1：类型定义 + GitAbstraction.pull() 扩展（预估 1.5h）

**产出：** 共享类型文件、冲突文件枚举能力

**实施内容：**

1. 在 `src/shared/types.ts` 中新增：
   - `GIT_GET_CONFLICTS` / `GIT_RESOLVE` / `GIT_CONFLICT_DETECTED` 三个 IPC 通道常量
   - `ConflictInfo` / `ResolutionType` / `ConflictResolution` 类型定义
   - `IPCChannelMap` 扩展（新增两个 invoke/handle 通道）

2. 扩展 `src/main/services/git-abstraction.ts`：
   - 新增 `enumerateConflictFiles()` 私有方法
   - 在 pull() 冲突分支（L1468-1478）调用此方法填充 `conflicts` 数组

**验证标准：**
- [ ] `npm run type-check` 通过
- [ ] `npm run lint` 通过
- [ ] pull() 返回 `hasConflicts:true` 时 `conflicts` 为具体文件路径列表

### Step 2：ConflictResolver 服务（预估 3h）

**产出：** 冲突标记解析 + 解决核心服务

**实施内容：**

1. 创建 `src/main/services/types/conflict.types.ts`：
   - 服务层内部的辅助类型（如有需要）

2. 创建 `src/main/services/conflict-resolver.ts`：
   - `constructor(gitAbstraction, workspaceDir)`
   - `getConflicts()` — 扫描工作区冲突文件 + parseConflictFile
   - `parseConflictFile(filePath)` — 读取文件内容 + extractVersions
   - `extractVersions(content)` — 解析 `<<<<<<<` / `=======` / `>>>>>>>` 标记
   - `resolve(resolution)` — 三策略解决 + writeFile + stageFile + commit

3. 在主进程入口文件中初始化 ConflictResolver 并注入 SyncManager

**验证标准：**
- [ ] 包含冲突标记的文件 → getConflicts() 返回正确的 localContent/remoteContent
- [ ] resolve('mine') → 写入 localContent + stage + commit
- [ ] resolve('manual') 无 content → 抛出 Error
- [ ] `npm run type-check` 通过

### Step 3：GitHandler IPC + Preload 扩展（预估 2h）

**产出：** IPC 通道 + Preload API + SyncManager 集成

**实施内容：**

1. 创建 `src/main/ipc/handlers/git.handler.ts`：
   - `GitHandler` 类（继承 IpcHandler）
   - `register()` — 注册 `git:getConflicts` + `git:resolve`
   - `broadcastConflict()` — webContents.send `git:conflictDetected`
   - `setConflictResolver()` setter

2. 扩展 `src/preload/index.ts`：
   - 新增 `git` 命名空间：`getConflicts()` / `resolve()` / `onConflictDetected()`
   - 更新 ALLOWED_CHANNELS 白名单

3. 扩展 `src/main/services/sync-manager.ts`：
   - 新增 `conflictResolver` 注入
   - 在 performSync() 冲突分支中调用 `conflictResolver.getConflicts()`
   - emit `conflict:details` 事件

4. 主进程入口连接：
   - GitHandler 监听 SyncManager `conflict:details` 事件 → `broadcastConflict()`

**验证标准：**
- [ ] 渲染进程 DevTools 调用 `window.electronAPI.git.getConflicts()` → 返回 ConflictInfo[]
- [ ] `window.electronAPI.git.onConflictDetected(callback)` 返回 cleanup 函数
- [ ] SyncManager 触发冲突 → 渲染进程收到 `git:conflictDetected` 事件
- [ ] `npm run type-check` 通过

### Step 4：conflictStore（预估 1h）

**产出：** Zustand 冲突状态 store

**实施内容：**

1. 创建 `src/renderer/store/conflictStore.ts`：
   - `ConflictState` / `ConflictActions` 接口
   - `initialState` 常量
   - `useConflictStore` create（devtools 中间件）
   - `setConflicts` / `setActiveIndex` / `resolveConflict` / `clearConflicts` actions
   - 导出 selectors

2. 扩展 `src/renderer/dev/mockElectronAPI.ts`：
   - 新增 `git` 命名空间 mock 方法

**验证标准：**
- [ ] `setConflicts` 正确更新 conflicts + activeIndex
- [ ] `resolveConflict` 调用 `window.electronAPI.git.resolve`
- [ ] 解决后从列表移除已解决文件
- [ ] DevTools 可查看 ConflictStore 状态

### Step 5：冲突通知 + DiffHighlight（预估 2h）

**产出：** 冲突通知组件 + Diff 高亮组件

**实施内容：**

1. 创建 `src/renderer/components/conflict/DiffHighlight.tsx`：
   - 使用 `diffLines` 计算差异
   - 绿色 added / 红色 removed 高亮
   - React.memo + useMemo 优化

2. 创建 `src/renderer/components/conflict/ConflictNotification.tsx`：
   - useEffect 监听 `git:conflictDetected` → `conflictStore.setConflicts`
   - selector 订阅 conflicts
   - 渲染浮动 Toast（AlertTriangle + 文件列表 + 按钮）
   - 按钮点击 → 触发打开冲突解决面板

3. 在 `AppLayout.tsx` 或 `WorkspaceStudioPage.tsx` 中挂载 `<ConflictNotification />`

**验证标准：**
- [ ] SyncManager 触发冲突 → Toast 弹出显示冲突文件列表
- [ ] DiffHighlight 正确高亮新增行（绿）和删除行（红）
- [ ] 暗色模式下正确显示

### Step 6：对比视图 + 编辑器 + 面板整合（预估 3h）

**产出：** 完整冲突解决 UI

**实施内容：**

1. 创建 `src/renderer/components/conflict/ConflictEditor.tsx`：
   - textarea 手动合并编辑器
   - 预填充 localContent
   - onChange 回传

2. 创建 `src/renderer/components/conflict/ConflictCompareView.tsx`：
   - 左右对比布局（grid-cols-2）
   - DiffHighlight 双向 diff
   - 三个操作按钮 + 灰化 AI 按钮预留
   - Tab 切换（compare / manual）

3. 升级 `src/renderer/components/studio/ConflictResolutionPanel.tsx`：
   - 删除硬编码 mock 数据
   - 连接 conflictStore
   - 多文件导航（← 1/3 →）
   - 渲染 ConflictCompareView

4. 创建 `src/renderer/components/conflict/index.ts` 模块导出

**验证标准：**
- [ ] 点击冲突通知 → 打开对比视图
- [ ] 左侧"你的版本"/右侧"对方的版本"内容正确
- [ ] "采用我的版本" → 写入 localContent + commit
- [ ] "采用对方的版本" → 写入 remoteContent + commit
- [ ] 手动编辑 → "确认手动合并" → 写入编辑内容 + commit
- [ ] 多文件冲突 → 左右箭头切换
- [ ] 所有 UI 无 Git 术语
- [ ] `npm run type-check` + `npm run lint` 通过

### Step 7：测试补全（预估 3h）

**产出：** 完整测试套件

**实施内容：**

1. ConflictResolver 单元测试：
   - extractVersions: 标准冲突标记 / 多冲突区域 / 空 ours 或 theirs / 无冲突标记
   - getConflicts: 有冲突文件 / 无冲突文件 / 混合文件
   - resolve: mine / theirs / manual（有内容） / manual（无内容应抛错）

2. conflictStore 测试：
   - setConflicts → setActiveIndex → resolveConflict 链路
   - 解决后冲突列表正确减少
   - 最后一个冲突解决后列表清空
   - resolve 失败 → resolveError 设置

3. 组件测试：
   - ConflictNotification: 有冲突时渲染 / 无冲突时返回 null / 按钮点击
   - ConflictCompareView: Tab 切换 / 按钮点击回调 / Diff 高亮渲染
   - DiffHighlight: 有 compareAgainst 时高亮 / 无 compareAgainst 时纯文本

4. GitHandler 集成测试（可选）：
   - getConflicts IPC → ConflictResolver.getConflicts
   - resolve IPC → ConflictResolver.resolve

**验证标准：**
- [ ] 新增测试覆盖率 ≥ 80%
- [ ] `npm run lint` 无警告
- [ ] `npm run type-check` 无错误
- [ ] 现有测试全部通过（无回归）

---

## 十、验收标准与风险评估

### 10.1 功能验收清单

| # | 验收项 | 需求来源 | 对应 Step | 验证方式 |
|---|--------|---------|----------|---------|
| 1 | Pull 检测到冲突时弹出冲突通知 | 需求 2.4 AC1 | Step 5 | 手动 + 单元测试 |
| 2 | 打开冲突文件展示左右对比视图 | 需求 2.4 AC2 | Step 6 | 手动验证 |
| 3 | 左侧显示"你的版本"，右侧显示"对方的版本" | 需求 2.4 AC3 | Step 6 | 手动 + 截图对比 |
| 4 | 点击"采用我的版本"保留本地内容 | 需求 2.4 AC4 | Step 6 | 单元测试 + 验证 commit 内容 |
| 5 | 点击"采用对方的版本"使用远端内容 | 需求 2.4 AC5 | Step 6 | 单元测试 + 验证 commit 内容 |
| 6 | 支持手动编辑合并结果 | 需求 2.4 AC6 | Step 6 | 手动验证 |
| 7 | 冲突解决后自动 commit 并 push | 需求 2.4 AC7 | Step 2-3 | 检查 .git log |
| 8 | 所有 UI 不出现 Git 术语 | CLAUDE.md | Step 5-6 | 代码审查 |
| 9 | 文件树冲突文件显示红点 | TASK007 | — | 已完成，无需额外工作 |

### 10.2 性能指标

| # | 指标 | 目标 | 验证方式 |
|---|------|------|---------|
| 1 | 冲突检测（扫描工作区） | < 1 秒 | 主进程日志 |
| 2 | Diff 计算（diffLines） | < 500ms | 单元测试计时 |
| 3 | 冲突文件内容加载 | < 1 秒 | 手动验证 |
| 4 | 解决冲突（commit + push） | < 3 秒 | 主进程日志 |

### 10.3 代码质量验收

| # | 验收项 | 验证方式 |
|---|--------|---------|
| 1 | TypeScript strict mode 无错误 | `npm run type-check` |
| 2 | ESLint 检查通过 | `npm run lint` |
| 3 | 所有公共函数有 JSDoc 注释 | 代码审查 |
| 4 | ConflictResolver 测试覆盖率 ≥ 80% | Vitest 覆盖率 |
| 5 | 现有测试全部通过 | `npm run test` |

### 10.4 交付物清单

| # | 文件 | 类型 | 状态 |
|---|------|------|------|
| 1 | `src/shared/types.ts` | 更新 | 扩展 IPC 通道 + 冲突类型 |
| 2 | `src/main/services/git-abstraction.ts` | 更新 | pull() 冲突文件枚举 |
| 3 | `src/main/services/conflict-resolver.ts` | 新增 | 待创建 |
| 4 | `src/main/services/types/conflict.types.ts` | 新增 | 待创建 |
| 5 | `src/main/ipc/handlers/git.handler.ts` | 新增 | 待创建 |
| 6 | `src/main/services/sync-manager.ts` | 更新 | 冲突详情解析集成 |
| 7 | `src/preload/index.ts` | 更新 | git 命名空间 API |
| 8 | `src/renderer/store/conflictStore.ts` | 新增 | 待创建 |
| 9 | `src/renderer/components/conflict/ConflictNotification.tsx` | 新增 | 待创建 |
| 10 | `src/renderer/components/conflict/ConflictCompareView.tsx` | 新增 | 待创建 |
| 11 | `src/renderer/components/conflict/ConflictEditor.tsx` | 新增 | 待创建 |
| 12 | `src/renderer/components/conflict/DiffHighlight.tsx` | 新增 | 待创建 |
| 13 | `src/renderer/components/conflict/index.ts` | 新增 | 待创建 |
| 14 | `src/renderer/components/studio/ConflictResolutionPanel.tsx` | 升级 | 移除 mock + 连接 store |
| 15 | `src/renderer/dev/mockElectronAPI.ts` | 更新 | git 命名空间 mock |
| 16 | 测试文件 | 新增 | 待创建 |

### 10.5 风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| conflict markers 解析不完整（嵌套/畸形标记） | 高 | 中 | 编写全面的测试用例覆盖各种边界情况；对解析失败的文件记录 warn 日志并降级为"选择版本"模式 |
| isomorphic-git merge 后 conflict markers 格式与预期不符 | 高 | 低 | 在 Step 2 中通过手动构造冲突文件验证解析逻辑 |
| 二进制文件冲突（图片等）无法 diff 展示 | 中 | 低 | 检测到二进制文件冲突时仅提供"选择版本"选项，不展示 diff |
| pull() 扩展引入回归 | 高 | 低 | 新增 `enumerateConflictFiles()` 为独立方法，不修改现有 pull 核心流程（仅在返回前调用） |
| 大文件 diff 计算卡顿 | 中 | 低 | 对超过 500 行的文件使用 React.memo + useMemo 缓存 diffLines 结果；后续可引入虚拟滚动 |
| 解决冲突后 push 失败 | 中 | 低 | 本地已 commit 不丢数据，下次同步自动重试 push |
| ConflictResolutionPanel 重写破坏现有布局 | 中 | 低 | 现有组件为独立骨架且未被其他组件依赖（无真实数据流），重写影响范围可控 |

### 10.6 回滚策略

1. **ConflictResolver** — 新增服务类，可安全删除
2. **git.handler.ts** — 新增 IPC handler，可安全删除和取消注册
3. **conflictStore** — 新增 store，可安全删除
4. **conflict/ 组件目录** — 新增目录，可安全删除
5. **ConflictResolutionPanel 升级** — 可通过 git revert 恢复原始骨架
6. **shared/types.ts 扩展** — 删除新增通道常量和类型即可恢复
7. **git-abstraction.ts pull() 扩展** — 删除 `enumerateConflictFiles()` 调用恢复原始空数组
8. **preload/index.ts 扩展** — 删除 git 命名空间即可恢复

---

**创建时间：** 2026-04-17
**最后更新：** 2026-04-17
**更新记录：**
- 2026-04-17 — 初始创建