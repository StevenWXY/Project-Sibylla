# PHASE1-TASK007: 同步状态 UI — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task007_sync-status-ui.md](../specs/tasks/phase1/phase1-task007_sync-status-ui.md)
> 创建日期：2026-04-17
> 最后更新：2026-04-17

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK007 |
| **任务标题** | 同步状态 UI |
| **优先级** | P0 |
| **复杂度** | 简单 |
| **预估工时** | 1-2 工作日 |
| **前置依赖** | ✅ TASK006（sync:stateChanged IPC + sync.getState）、✅ TASK001（TreeNode 组件） |

### 目标

将散落在 `AppLayout.tsx` 和 `WorkspaceStudioPage.tsx` 中的同步状态逻辑，重构为独立的 Zustand store + 可复用组件体系。实现底栏同步状态指示器、点击展开详情面板、文件树同步状态标识。用户可随时了解文件同步状况——"我的文件是否安全"。

### 核心命题

CLAUDE.md "Git 不可见"哲学在前端的直接呈现——用户只看到"已同步 ✓""同步中 ↻""离线（本地已保存）"等自然语言状态，不看到任何 Git 术语。

### 范围边界

**包含：**
- `syncStatusStore` — Zustand 同步状态 store（替代 AppLayout/WorkspaceStudioPage 中的 useState）
- `useSyncStatus` — IPC 事件监听 Hook（统一消费 sync:stateChanged）
- `SyncStatusIndicator` — 底栏同步状态指示器组件
- `SyncDetailPanel` — 同步详情弹出面板
- `StatusBar` — 底栏容器组件重构（从 AppLayout 中抽离）
- `FileSyncIndicator` — 文件树中单文件同步状态小圆点
- Mock API 扩展 — `mockElectronAPI.ts` 补充 `sync.getState()`
- 测试 setup 扩展 — `setup.ts` 补充 `sync.getState()` mock

**不包含：**
- 冲突解决界面（TASK008）
- 版本历史展示（TASK009）
- 成员管理（TASK010）

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 路径 | 关键约束 |
|------|------|---------|
| 项目宪法 | `CLAUDE.md` | TypeScript 严格模式禁止 any；主进程与渲染进程严格隔离；注释英文/commit 中文；所有异步操作必须有错误处理；关键操作结构化日志 |
| 系统架构 | `specs/design/architecture.md` | 渲染进程禁止直接访问文件系统；IPC 通信严格隔离 |
| UI/UX 规范 | `specs/design/ui-ux-design.md` | 底栏 32px；文件状态标识：已同步 ✓ Emerald / 同步中 ↻ Blue / 本地修改 ● Amber / 有冲突 ⚠ Red；暗色模式色值映射 |
| 数据模型与 API | `specs/design/data-and-api.md` | IPC 通信模式：invoke/handle + send/on |
| 需求规格 | `specs/requirements/phase1/sprint2-git-sync.md` | 需求 2.3 六条验收标准：底栏状态指示、颜色图标映射、点击展开详情 |
| 任务规格 | `specs/tasks/phase1/phase1-task007_sync-status-ui.md` | 5 个子任务、6 条功能验收标准、4 类测试用例、6 步实施计划 |

### 2.2 Skill 依赖

| Skill | 路径 | 使用场景 |
|-------|------|---------|
| `zustand-state-management` | `.kilocode/skills/phase1/zustand-state-management/SKILL.md` | syncStatusStore 设计：selector 精确订阅避免全局重渲染、devtools 中间件集成 |
| `electron-ipc-patterns` | `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` | `sync:stateChanged` 事件监听模式（send/on）、`sync:getState` invoke/handle 模式 |
| `typescript-strict-mode` | `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` | SyncStatus 类型严格约束、store 类型定义、组件 props 类型 |
| `vercel-react-best-practices` | `.kilocode/skills/common/vercel-react-best-practices/SKILL.md` | 组件 memo 化避免不必要的重渲染、useCallback 稳定引用 |

### 2.3 前置代码依赖

| 模块 | 路径 | 行数 | 状态 | 说明 |
|------|------|------|------|------|
| SyncStatus / SyncStatusData 类型 | `src/shared/types.ts:699-716` | 886 | ✅ 已完成 | `SyncStatus`（6 种状态枚举）、`SyncStatusData`（status/timestamp/message/conflictFiles） |
| IPC_CHANNELS 同步通道 | `src/shared/types.ts:106-111` | — | ✅ 已完成 | `SYNC_FORCE` / `SYNC_STATUS_CHANGED` / `SYNC_GET_STATE` |
| Preload sync API | `src/preload/index.ts:107-111,449-462` | 569 | ✅ 已完成 | `sync.force()` / `sync.getState()` / `sync.onStatusChange()` |
| AppLayout（含 getSyncMeta） | `src/renderer/components/layout/AppLayout.tsx:36-76,113-126,259-266,301-313` | 317 | ⚠️ 需重构 | 同步状态分散在 header 和 footer 中，使用 useState + getSyncMeta，需抽离到独立 store + 组件 |
| WorkspaceStudioPage 同步监听 | `src/renderer/pages/WorkspaceStudioPage.tsx:1100-1141` | 1332 | ⚠️ 需重构 | 独立的 `onStatusChange` 监听 + `setSyncStatus` useState，需迁移到统一 store |
| TreeNode 组件 | `src/renderer/components/layout/TreeNode.tsx:168-172` | 274 | ⚠️ 需扩展 | 已有 `isDirty`（星号）和 `isOpen`（绿点）标识，需新增同步状态小圆点 |
| SaveStatusIndicator | `src/renderer/components/editor/SaveStatusIndicator.tsx` | 41 | ✅ 参考 | 同类组件模式：Zustand selector + 条件渲染 + 时间格式化 |
| editorStore | `src/renderer/store/editorStore.ts` | 76 | ✅ 参考 | Zustand store 标准模式：devtools 中间件 + selector 导出 |
| cn 工具函数 | `src/renderer/utils/cn.ts` | 9 | ✅ 已完成 | clsx + tailwind-merge |
| Mock ElectronAPI | `src/renderer/dev/mockElectronAPI.ts:415-430` | 475 | ⚠️ 需扩展 | 已有 `sync.force()` 和 `sync.onStatusChange()`，缺 `sync.getState()` |
| 测试 setup | `tests/renderer/setup.ts:41-44` | 85 | ⚠️ 需扩展 | 已有 `sync.force` 和 `sync.onStatusChange` mock，缺 `sync.getState` |
| Tooltip 组件 | `src/renderer/components/ui/Tooltip.tsx` | 92 | ✅ 已完成 | 可用于状态指示器的 tooltip |

### 2.4 被依赖任务

| 任务 | 依赖方式 |
|------|---------|
| PHASE1-TASK008（冲突检测与合并） | 将使用 syncStatusStore 的 `conflict` 状态和 `conflictFiles` 数据 |
| PHASE1-TASK009（版本历史展示） | 可能复用 StatusBar 组件框架 |

### 2.5 npm 依赖

无需新增 npm 包。所有核心依赖已安装：
- `lucide-react` ^0.577.0 — 图标（Loader2, Check, AlertTriangle, CloudOff, Clock3, CloudUpload, RefreshCw, X 等）
- `zustand` ^5.0.11 — 状态管理
- `clsx` + `tailwind-merge` — 样式工具
- `@testing-library/react` + `vitest` — 测试框架

**不引入 Framer Motion。** 同步中旋转动画使用 TailwindCSS `animate-spin`，面板弹出动画使用 CSS transition，避免引入新依赖。

---

## 三、现有代码盘点与差距分析

### 3.1 现有同步状态实现详解

> **关键发现：** 同步状态逻辑分散在 3 处，均为 `useState` + `onStatusChange` 直接监听，无统一 store。UI 渲染分散在 header 和 footer 中，无独立组件。

**现状数据流：**

```
主进程 SyncManager → IPC sync:stateChanged → AppLayout useState
                                                → WorkspaceStudioPage useState
                                                → （两个独立的监听器，两个独立的 state）
```

**目标数据流：**

```
主进程 SyncManager → IPC sync:stateChanged → useSyncStatus Hook → syncStatusStore
                                                                     ↓
                                              SyncStatusIndicator ← selector(status)
                                              SyncDetailPanel    ← 全量 state
                                              WorkspaceStudioPage ← selector(status)
                                              AppLayout          ← 组件替换
```

### 3.2 差距矩阵

| 能力 | 现有 | 缺口 | 本任务产出 |
|------|------|------|-----------|
| SyncStatus 类型定义 | ✅ `SyncStatus` / `SyncStatusData` | — | — |
| Preload sync API | ✅ `force()` / `getState()` / `onStatusChange()` | — | — |
| 统一 Zustand store | ❌ useState 分散 | 无 store | `syncStatusStore` |
| 统一 Hook | ❌ 直接调 `onStatusChange` | 无 Hook | `useSyncStatus` |
| 底栏独立组件 | ❌ 内联在 AppLayout footer | 无组件 | `SyncStatusIndicator` |
| 详情弹出面板 | ❌ 无 | 无面板 | `SyncDetailPanel` |
| 文件树同步标识 | ❌ TreeNode 无同步标识 | 无标识 | `FileSyncIndicator` |
| 中文状态标签 | ❌ 英文标签（Syncing/Synced） | 需中文化 | STATUS_CONFIG 中文映射 |
| 暗色模式适配 | ✅ AppLayout 已用 dark: 变体 | — | 组件内继承 |
| Mock API 完整性 | ⚠️ 缺 `sync.getState()` | 需补全 | mockElectronAPI 扩展 |
| 测试 setup 完整性 | ⚠️ 缺 `sync.getState` mock | 需补全 | setup.ts 扩展 |

### 3.3 需新建的文件

| # | 文件路径 | 类型 | 说明 |
|---|---------|------|------|
| 1 | `src/renderer/store/syncStatusStore.ts` | 新增 | 同步状态 Zustand store |
| 2 | `src/renderer/hooks/useSyncStatus.ts` | 新增 | IPC 事件监听 Hook |
| 3 | `src/renderer/components/statusbar/SyncStatusIndicator.tsx` | 新增 | 底栏同步状态指示器 |
| 4 | `src/renderer/components/statusbar/SyncDetailPanel.tsx` | 新增 | 同步详情弹出面板 |
| 5 | `src/renderer/components/statusbar/StatusBar.tsx` | 新增 | 底栏容器组件 |
| 6 | `src/renderer/components/statusbar/index.ts` | 新增 | 模块导出 |
| 7 | `tests/renderer/syncStatusStore.test.ts` | 新增 | Store 单元测试 |
| 8 | `tests/renderer/SyncStatusIndicator.test.tsx` | 新增 | 指示器组件测试 |
| 9 | `tests/renderer/SyncDetailPanel.test.tsx` | 新增 | 详情面板测试 |
| 10 | `tests/renderer/useSyncStatus.test.ts` | 新增 | Hook 测试 |

### 3.4 需修改的文件

| # | 文件路径 | 修改内容 | 风险 |
|---|---------|---------|------|
| 1 | `src/renderer/components/layout/AppLayout.tsx` | 删除 getSyncMeta + useState + onStatusChange 监听；header 和 footer 的同步状态替换为 SyncStatusIndicator 组件和 StatusBar 组件 | 中 — 主布局文件变更 |
| 2 | `src/renderer/pages/WorkspaceStudioPage.tsx` | 删除 useState(syncStatus) + onStatusChange 监听；改用 syncStatusStore selector | 中 — Studio 页面变更 |
| 3 | `src/renderer/components/layout/TreeNode.tsx` | 新增 syncStatus prop；渲染 FileSyncIndicator 小圆点 | 低 — 新增可选 prop |
| 4 | `src/renderer/components/layout/FileTree.tsx` | 传递 syncStatus 数据到 TreeNode | 低 — 透传 prop |
| 5 | `src/renderer/dev/mockElectronAPI.ts` | 新增 `sync.getState()` mock 方法 | 低 — 纯新增 |
| 6 | `tests/renderer/setup.ts` | 新增 `sync.getState` mock | 低 — 纯新增 |

### 3.4 不修改的文件

| 文件 | 原因 |
|------|------|
| `src/shared/types.ts` | SyncStatus / SyncStatusData / SyncResult / IPC_CHANNELS 已完整定义，无需变更 |
| `src/preload/index.ts` | sync API 已完整暴露（force/getState/onStatusChange），无需变更 |
| `src/main/**` | 主进程代码已在 TASK006 中完成，本任务仅消费 IPC 事件 |

---

## 四、类型系统设计

### 4.1 复用现有类型（无需新建类型文件）

本任务无需新建独立类型文件。所有类型均复用 `src/shared/types.ts` 中的已有定义：

```typescript
import type { SyncStatus, SyncStatusData, SyncResult } from '../../shared/types'
```

**设计决策：**
- `SyncStatus` = `'idle' | 'syncing' | 'synced' | 'conflict' | 'error' | 'offline'` — 已定义于 `types.ts:699`
- `SyncStatusData` = `{ status, timestamp, message?, conflictFiles? }` — 已定义于 `types.ts:704-716`
- 无需新增 `SyncState` 类型（任务 spec 中提到的 `SyncState` 与 `SyncStatusData` 等价，直接复用后者）
- Store 内部状态类型在 store 文件内局部定义即可

### 4.2 状态配置常量

```typescript
const STATUS_CONFIG: Record<SyncStatus, {
  readonly label: string
  readonly colorClass: string
  readonly animate: boolean
}> = {
  idle:     { label: '等待同步',   colorClass: 'text-sys-darkMuted', animate: false },
  synced:   { label: '已同步',     colorClass: 'text-emerald-500',   animate: false },
  syncing:  { label: '同步中',     colorClass: 'text-blue-500',      animate: true  },
  offline:  { label: '离线（本地已保存）', colorClass: 'text-sys-darkMuted', animate: false },
  conflict: { label: '有冲突',     colorClass: 'text-red-500',       animate: false },
  error:    { label: '同步失败',   colorClass: 'text-amber-500',     animate: false },
}
```

**视觉规范映射（来源 ui-ux-design.md 5.1）：**
- 已同步 ✓ → Emerald-500
- 同步中 ↻ → Blue-500 + animate-spin
- 离线 → Gray-400（暗色模式下使用 `text-sys-darkMuted`）
- 有冲突 ⚠ → Red-500
- 同步失败 ⚠ → Amber-500

---

## 五、syncStatusStore 设计

### 5.1 设计原则

1. **单例 store** — 全局唯一同步状态源，替代 AppLayout 和 WorkspaceStudioPage 中的两套独立 useState
2. **selector 精确订阅** — 各组件按需订阅 `status`、`lastSyncedAt`、`error` 等字段，避免全局重渲染
3. **devtools 集成** — 遵循 editorStore 模式，集成 devtools 中间件便于调试
4. **不使用 persist** — 同步状态是运行时临时状态，无需持久化到 localStorage

### 5.2 Store 接口

```typescript
interface SyncStatusState {
  status: SyncStatus
  lastSyncedAt: number | null
  errorMessage: string | null
  conflictFiles: readonly string[]
}

interface SyncStatusActions {
  setState: (data: SyncStatusData) => void
  reset: () => void
}

type SyncStatusStore = SyncStatusState & SyncStatusActions
```

### 5.3 Store 实现

```typescript
// src/renderer/store/syncStatusStore.ts

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { SyncStatus, SyncStatusData } from '../../shared/types'

interface SyncStatusState {
  status: SyncStatus
  lastSyncedAt: number | null
  errorMessage: string | null
  conflictFiles: readonly string[]
}

interface SyncStatusActions {
  setState: (data: SyncStatusData) => void
  reset: () => void
}

type SyncStatusStore = SyncStatusState & SyncStatusActions

const initialState: SyncStatusState = {
  status: 'idle',
  lastSyncedAt: null,
  errorMessage: null,
  conflictFiles: [],
}

export const useSyncStatusStore = create<SyncStatusStore>()(
  devtools(
    (set) => ({
      ...initialState,

      setState: (data) =>
        set({
          status: data.status,
          lastSyncedAt: data.status === 'synced' ? data.timestamp : null,
          errorMessage: data.message ?? null,
          conflictFiles: data.conflictFiles ?? [],
        }, false, 'syncStatus/setState'),

      reset: () =>
        set(initialState, false, 'syncStatus/reset'),
    }),
    { name: 'SyncStatusStore' }
  )
)

export const selectStatus = (state: SyncStatusStore) => state.status
export const selectLastSyncedAt = (state: SyncStatusStore) => state.lastSyncedAt
export const selectErrorMessage = (state: SyncStatusStore) => state.errorMessage
export const selectConflictFiles = (state: SyncStatusStore) => state.conflictFiles
```

### 5.4 设计决策

**`lastSyncedAt` 仅在 `synced` 状态更新：**
- `SyncStatusData.timestamp` 是每次状态变更的时间戳，不等价于"上次同步完成时间"
- 仅当 `status === 'synced'` 时将 `timestamp` 存入 `lastSyncedAt`，UI 显示"上次同步: 10:23"
- 其他状态变更不覆盖 `lastSyncedAt`（保留最近一次成功同步的时间）

**`conflictFiles` 使用 readonly string[]：**
- 与 `SyncStatusData.conflictFiles` 类型一致
- 避免外部修改引用

**`errorMessage` 而非 `error`：**
- 避免与 JavaScript Error 对象混淆
- 存储用户可读的错误描述字符串

### 5.5 文件级同步状态（TreeNode 使用）

> **设计决策：** 文件级同步状态从全局 `conflictFiles` 列表派生，无需独立的 IPC 通道或 store。

TreeNode 通过以下方式判断单文件同步状态：

```typescript
// 在 TreeNode 内部或 FileTree 组件层派生
function getFileSyncStatus(filePath: string, conflictFiles: readonly string[]): 'synced' | 'conflict' {
  return conflictFiles.includes(filePath) ? 'conflict' : 'synced'
}
```

当前阶段（TASK007）仅实现 `conflict` 标识（红点）。`modified`（本地未同步修改，Amber 点）的检测需要 Git status 信息，暂不在本任务实现——后续可通过扩展 `SyncStatusData` 新增 `modifiedFiles` 字段支持。

---

## 六、组件设计

### 6.1 StatusBar 组件（底栏容器）

**文件：** `src/renderer/components/statusbar/StatusBar.tsx`

从 `AppLayout.tsx` 的 `<footer>` 区域抽离为独立组件。包含 AI 模式选择、模型、积分、同步状态。

```typescript
interface StatusBarProps {
  className?: string
}

export function StatusBar({ className }: StatusBarProps) {
  return (
    <footer className={cn(
      'flex h-8 shrink-0 items-center justify-between border-t border-sys-darkBorder bg-[#050505] px-4 font-mono text-[12px] text-gray-400',
      className
    )}>
      <StatusBarLeft />
      <StatusBarRight />
    </footer>
  )
}

function StatusBarLeft() {
  // AI mode, model selector — 与现有 AppLayout 一致
}

function StatusBarRight() {
  return (
    <div className="flex items-center gap-4">
      <CreditsDisplay />
      <div className="h-3 w-px bg-sys-darkBorder" />
      <SyncStatusIndicator />
    </div>
  )
}
```

**设计决策：**
- `SyncStatusIndicator` 作为 StatusBar 的子组件，自动获取底栏的定位上下文
- `SyncDetailPanel` 的弹出定位相对于 `SyncStatusIndicator` 的父容器

### 6.2 SyncStatusIndicator 组件

**文件：** `src/renderer/components/statusbar/SyncStatusIndicator.tsx`

底栏右侧的同步状态指示器，6 种状态的图标/颜色/文字映射：

```typescript
const STATUS_CONFIG: Record<SyncStatus, {
  readonly label: string
  readonly colorClass: string
  readonly animate: boolean
}> = {
  idle:     { label: '等待同步',              colorClass: 'text-gray-400',    animate: false },
  synced:   { label: '已同步',                colorClass: 'text-emerald-500', animate: false },
  syncing:  { label: '同步中',                colorClass: 'text-blue-500',    animate: true  },
  offline:  { label: '离线（本地已保存）',     colorClass: 'text-gray-400',    animate: false },
  conflict: { label: '有冲突',                colorClass: 'text-red-500',     animate: false },
  error:    { label: '同步失败',              colorClass: 'text-amber-500',   animate: false },
}
```

**图标映射：**

| 状态 | Lucide 图标 | 说明 |
|------|------------|------|
| idle | `Clock3` | 等待首次同步 |
| synced | `Check` | 已同步 ✓ |
| syncing | `Loader2` + animate-spin | 同步中 ↻ |
| offline | `CloudOff` | 离线 |
| conflict | `AlertTriangle` | 有冲突 ⚠ |
| error | `AlertTriangle` | 同步失败 ⚠ |

**组件逻辑：**

```
SyncStatusIndicator:
  1. selector 订阅 status、lastSyncedAt
  2. 根据 status 查 STATUS_CONFIG 获取 label/colorClass/animate
  3. 渲染 <button> 含图标 + label + 时间
  4. 点击 → setShowDetail(true) → 渲染 SyncDetailPanel
  5. syncing 状态图标添加 animate-spin class
  6. lastSyncedAt 格式化为 HH:MM 显示
```

**性能优化：**
- 使用精确 selector：`useSyncStatusStore(selectStatus)` 和 `useSyncStatusStore(selectLastSyncedAt)` 分开订阅
- `STATUS_CONFIG` 为模块级常量，不在渲染函数内创建
- `useCallback` 包裹 `handleForceSync`，避免 SyncDetailPanel 不必要的重渲染

### 6.3 SyncDetailPanel 组件

**文件：** `src/renderer/components/statusbar/SyncDetailPanel.tsx`

点击 SyncStatusIndicator 后展开的浮动面板，显示同步详情。

**布局：**

```
┌─────────────────────────────────┐
│ 同步详情                    [×] │
├─────────────────────────────────┤
│ 状态: 已同步                    │
│ 上次同步: 2026/04/17 10:23:45  │
│                                 │
│ [错误信息 / 冲突文件列表]       │
│                                 │
├─────────────────────────────────┤
│ [  立即同步  ] [  重试  ]       │
└─────────────────────────────────┘
```

**组件逻辑：**

```
SyncDetailPanel({ onClose }):
  1. 全量订阅 syncStatusStore
  2. 渲染状态行（STATUS_CONFIG[status].label）
  3. 渲染上次同步时间（lastSyncedAt 格式化）
  4. 条件渲染：errorMessage → 红色错误框
  5. 条件渲染：conflictFiles.length > 0 → 冲突文件列表
  6. "立即同步"按钮 → sync.force() IPC
  7. "重试"按钮（仅 error 状态显示）→ sync.force() IPC
  8. 点击面板外部 → onClose()
```

**交互细节：**
- 面板定位：`absolute bottom-8 right-0`，相对 SyncStatusIndicator 定位
- 点击外部关闭：使用 `useEffect` + `pointerdown` 事件监听（与 AppLayout 的 workspaceMenuRef 模式一致）
- `z-index: 50` 确保在其他 UI 之上
- 宽度 `w-72`（288px）

**"立即同步"按钮逻辑：**

```typescript
const handleForceSync = useCallback(async () => {
  const result = await window.electronAPI.sync.force()
  if (!result.success) {
    // 错误由 IPC 事件自动推送到 store
  }
}, [])
```

### 6.4 FileSyncIndicator 组件

**文件：** 嵌入 `TreeNode.tsx`，不独立成文件

在文件树中为每个文件节点显示同步状态小圆点：

```typescript
function FileSyncIndicator({ isConflict }: { readonly isConflict: boolean }) {
  if (!isConflict) return null
  return (
    <span
      className="h-2 w-2 shrink-0 rounded-full bg-red-500"
      title="文件冲突"
    />
  )
}
```

**渲染位置：** 在 TreeNode 的文件名之后、dirty 星号之后（`TreeNode.tsx:168-172`）：

```typescript
<span className="flex min-w-0 flex-1 items-center gap-1">
  <span className="truncate">{node.name}</span>
  {isDirty && <span className="text-amber-500 dark:text-amber-400">*</span>}
  {isOpen && <span className="h-1.5 w-1.5 rounded-full bg-green-500" />}
  <FileSyncIndicator isConflict={isFileSyncConflict} />
</span>
```

---

## 七、Hook 设计与集成改造

### 7.1 useSyncStatus Hook

**文件：** `src/renderer/hooks/useSyncStatus.ts`

统一的 IPC 事件监听 Hook，替代 AppLayout 和 WorkspaceStudioPage 中的两套独立监听。

```typescript
import { useEffect } from 'react'
import { useSyncStatusStore } from '../store/syncStatusStore'

export function useSyncStatus(): void {
  const setState = useSyncStatusStore((s) => s.setState)
  const reset = useSyncStatusStore((s) => s.reset)

  useEffect(() => {
    const syncApi = window.electronAPI?.sync
    if (!syncApi?.onStatusChange) return

    const unlisten = syncApi.onStatusChange((data) => {
      setState(data)
    })

    return () => {
      unlisten()
      reset()
    }
  }, [setState, reset])
}
```

**设计决策：**
- 返回 `void` — 纯副作用 Hook，不返回状态（状态从 store 获取）
- 清理函数调用 `reset()` — 组件卸载时清空 store，避免残留状态
- `setState` 和 `reset` 通过 selector 获取，作为 useEffect 依赖
- `syncApi` 在 effect 内获取，避免顶层访问可能不存在的 `window.electronAPI`

### 7.2 AppLayout 集成改造

**变更范围：** `src/renderer/components/layout/AppLayout.tsx`

**删除的代码：**
- `getSyncMeta()` 函数（L36-76）→ 由 `SyncStatusIndicator` 内部 STATUS_CONFIG 替代
- `const [syncStatus, setSyncStatus] = useState<SyncStatusData | null>(null)`（L90）
- `const [statusTime, setStatusTime] = useState(...)`（L91-93）
- `syncApi` 变量（L102）
- `useEffect` 中的 `onStatusChange` 监听（L113-126）
- header 中的内联同步状态 JSX（L259-266）
- footer 中的内联同步状态 JSX（L301-313）

**新增的代码：**
- `import { StatusBar } from '../statusbar'`
- `import { SyncStatusIndicator } from '../statusbar/SyncStatusIndicator'`
- header 中：`<SyncStatusIndicator />`（紧凑模式，仅图标 + label）
- `<footer>` 替换为 `<StatusBar />`

**改造后的 AppLayout footer：**

```typescript
// 替换原 L287-314
<StatusBar />
```

**改造后的 AppLayout header 同步区域：**

```typescript
// 替换原 L259-266
<div className="flex items-center gap-4">
  <SyncStatusIndicator variant="compact" />
  {/* ... avatar button */}
</div>
```

> **注意：** header 中的 `SyncStatusIndicator` 使用 `variant="compact"` 模式（仅图标 + label，无时间），footer 使用默认完整模式。两个位置的组件共享同一个 store，状态始终一致。

### 7.3 WorkspaceStudioPage 集成改造

**变更范围：** `src/renderer/pages/WorkspaceStudioPage.tsx`

**删除的代码：**
- `const [syncStatus, setSyncStatus] = useState<SyncStatusData | null>(null)` 及相关类型导入
- `unlistenSync = window.electronAPI.sync.onStatusChange(...)` 监听（L1100-1141）

**新增的代码：**
- `import { useSyncStatusStore, selectStatus, selectConflictFiles, selectErrorMessage } from '../store/syncStatusStore'`
- 在需要 syncStatus 的位置改为 selector：`const syncStatus = useSyncStatusStore(selectStatus)`

**通知逻辑迁移：**
- 原 WorkspaceStudioPage 的 `onStatusChange` 回调中有 `pushNotification` 逻辑
- 迁移到 `useSyncStatus` 之外的一个辅助 Hook `useSyncNotifications`（可选），或在 WorkspaceStudioPage 中通过 `useEffect` 监听 store 变化触发通知

```typescript
// 方案：在 WorkspaceStudioPage 中新增 useEffect 监听 store
useEffect(() => {
  const status = useSyncStatusStore.getState().status
  const errorMessage = useSyncStatusStore.getState().errorMessage
  const conflictFiles = useSyncStatusStore.getState().conflictFiles

  if (status === 'error') {
    pushNotification('error', '同步失败', errorMessage ?? '请检查网络与仓库状态')
  } else if (status === 'synced') {
    pushNotification('success', '同步完成', '工作区已与云端保持一致')
  } else if (status === 'conflict') {
    // ... 冲突处理逻辑保持不变
  }
}, [useSyncStatusStore.getState().status])
```

> **更优方案：** 使用 Zustand `subscribe` API 监听变化，避免依赖 `useEffect` 的闭包问题：

```typescript
useEffect(() => {
  const unsubscribe = useSyncStatusStore.subscribe((state, prevState) => {
    if (state.status === prevState.status) return
    // 处理状态变化通知
  })
  return unsubscribe
}, [])
```

### 7.4 FileTree / TreeNode 集成改造

**变更范围：** `src/renderer/components/layout/FileTree.tsx` + `TreeNode.tsx`

**FileTree.tsx 新增逻辑：**
- 从 `syncStatusStore` 获取 `conflictFiles`
- 透传到 TreeNode 的 `conflictPaths` prop

```typescript
// FileTree.tsx 中
const conflictFiles = useSyncStatusStore(selectConflictFiles)
const conflictPaths = useMemo(() => new Set(conflictFiles), [conflictFiles])

// 传递给 TreeNode
<TreeNode
  // ... existing props
  conflictPaths={conflictPaths}
/>
```

**TreeNode.tsx 新增逻辑：**
- 接口新增 `conflictPaths: ReadonlySet<string>` prop
- 计算 `const isFileSyncConflict = !isFolder && conflictPaths.has(node.path)`
- 渲染 `FileSyncIndicator`

**TreeNodeProps 扩展：**

```typescript
interface TreeNodeProps {
  // ... existing props
  /** Set of file paths that have sync conflicts */
  conflictPaths: ReadonlySet<string>
}
```

**向后兼容：**
- `conflictPaths` 为必选 prop（无默认值），调用方必须传入
- `FileTree.test.tsx` 和 `TreeNode.test.tsx` 需更新传入 `conflictPaths={new Set()}`
- FileSyncIndicator 仅对文件节点渲染（`!isFolder`），文件夹不显示

---

## 八、分步实施计划

> 共 6 步，每步产出可独立验证的增量。Step 1 为基础设施，Step 2-4 为核心组件，Step 5 为集成改造，Step 6 为测试。

### Step 1：syncStatusStore + useSyncStatus Hook（预估 1.5h）

**产出：** Store + Hook + Mock API 扩展

**实施内容：**

1. 创建 `src/renderer/store/syncStatusStore.ts`：
   - `SyncStatusState` / `SyncStatusActions` / `SyncStatusStore` 接口
   - `initialState` 常量
   - `useSyncStatusStore` create（devtools 中间件）
   - `setState` action：从 SyncStatusData 映射到内部状态
   - `reset` action：回到 initialState
   - 导出 selectors：`selectStatus` / `selectLastSyncedAt` / `selectErrorMessage` / `selectConflictFiles`

2. 创建 `src/renderer/hooks/useSyncStatus.ts`：
   - 监听 `window.electronAPI.sync.onStatusChange`
   - 调用 `setState` 更新 store
   - 清理函数调用 `reset`

3. 扩展 `src/renderer/dev/mockElectronAPI.ts`：
   - 新增 `sync.getState()` mock（返回 `{ status: 'synced', timestamp: Date.now() }`）

4. 扩展 `tests/renderer/setup.ts`：
   - `mockElectronAPI.sync` 新增 `getState: vi.fn()` mock

**验证标准：**
- [ ] `npm run type-check` 通过
- [ ] `npm run lint` 通过
- [ ] DevTools 可查看 SyncStatusStore 状态

### Step 2：SyncStatusIndicator 组件（预估 1.5h）

**产出：** 同步状态指示器组件

**实施内容：**

1. 创建 `src/renderer/components/statusbar/` 目录

2. 创建 `src/renderer/components/statusbar/SyncStatusIndicator.tsx`：
   - `STATUS_CONFIG` 常量（6 种状态映射）
   - `ICON_MAP`：状态到 Lucide 图标的映射
   - 主组件：selector 订阅 status + lastSyncedAt
   - `variant` prop：`'default' | 'compact'`（header 用 compact，footer 用 default）
   - 点击展开 SyncDetailPanel

3. 创建 `src/renderer/components/statusbar/SyncDetailPanel.tsx`：
   - 全量订阅 syncStatusStore
   - 状态行 + 上次同步时间
   - 错误信息框（条件渲染）
   - 冲突文件列表（条件渲染）
   - "立即同步"按钮 + "重试"按钮
   - 点击外部关闭逻辑

**验证标准：**
- [ ] 6 种状态正确渲染对应图标和文字
- [ ] syncing 状态图标有 animate-spin
- [ ] 点击弹出详情面板
- [ ] 暗色模式下正确显示

### Step 3：StatusBar 组件（预估 1h）

**产出：** 底栏容器组件

**实施内容：**

1. 创建 `src/renderer/components/statusbar/StatusBar.tsx`：
   - 从 AppLayout footer 抽离底栏 UI
   - 左侧：AI 模式 + 模型选择器
   - 右侧：积分 + SyncStatusIndicator

2. 创建 `src/renderer/components/statusbar/index.ts`：
   - 导出 `StatusBar` / `SyncStatusIndicator` / `SyncDetailPanel`

**验证标准：**
- [ ] 底栏 UI 与现有 AppLayout footer 一致
- [ ] SyncStatusIndicator 正确嵌入右侧

### Step 4：AppLayout + WorkspaceStudioPage 改造（预估 2h）

**产出：** 现有页面集成新组件

**实施内容：**

1. 修改 `src/renderer/components/layout/AppLayout.tsx`：
   - 删除 `getSyncMeta` 函数
   - 删除 `syncStatus` / `statusTime` useState
   - 删除 `syncApi` 变量和 `onStatusChange` useEffect
   - header 同步区域替换为 `<SyncStatusIndicator variant="compact" />`
   - footer 替换为 `<StatusBar />`
   - 清理不再需要的 Lucide import（Check, Loader2, CloudOff, Clock3, AlertTriangle）

2. 修改 `src/renderer/pages/WorkspaceStudioPage.tsx`：
   - 删除 `syncStatus` useState
   - 删除 `unlistenSync` 和 `onStatusChange` 监听
   - 使用 `useSyncStatusStore.subscribe` 监听状态变化触发通知
   - 使用 `useSyncStatusStore.getState()` 获取当前状态

**验证标准：**
- [ ] `npm run type-check` 通过
- [ ] `npm run lint` 通过
- [ ] 底栏显示同步状态，与改造前行为一致
- [ ] header 显示紧凑同步状态
- [ ] WorkspaceStudioPage 通知逻辑正常触发

### Step 5：TreeNode 文件同步标识（预估 1h）

**产出：** 文件树冲突文件标识

**实施内容：**

1. 修改 `src/renderer/components/layout/TreeNode.tsx`：
   - 接口新增 `conflictPaths: ReadonlySet<string>` prop
   - 新增 `FileSyncIndicator` 内联组件（红点）
   - 在文件名行内渲染冲突标识

2. 修改 `src/renderer/components/layout/FileTree.tsx`：
   - 从 `syncStatusStore` 获取 `conflictFiles`
   - 转换为 `Set` 并透传给 TreeNode

3. 更新现有测试 `tests/renderer/TreeNode.test.tsx`：
   - 所有 `render` 调用新增 `conflictPaths={new Set()}` prop

4. 更新现有测试 `tests/renderer/FileTree.test.tsx`：
   - Mock `useSyncStatusStore` 返回空 `conflictFiles`

**验证标准：**
- [ ] 冲突文件在文件树中显示红点
- [ ] 非冲突文件不显示额外标识
- [ ] 现有 TreeNode 和 FileTree 测试全部通过

### Step 6：测试编写（预估 2h）

**产出：** 完整测试套件

**实施内容：**

1. 创建 `tests/renderer/syncStatusStore.test.ts`：
   - `setState` 正确更新各字段
   - `setState` 仅在 `synced` 状态更新 `lastSyncedAt`
   - `reset` 清空所有状态
   - 多次 `setState` 只保留最新值
   - `conflictFiles` 默认为空数组

2. 创建 `tests/renderer/SyncStatusIndicator.test.tsx`：
   - 各 SyncStatus 状态下正确渲染对应图标和文字
   - syncing 状态有 animate-spin class
   - synced 状态显示时间文本
   - idle 状态不显示时间
   - 点击按钮弹出详情面板
   - compact variant 不显示时间

3. 创建 `tests/renderer/SyncDetailPanel.test.tsx`：
   - 显示当前状态标签
   - 显示上次同步时间
   - error 状态显示错误信息
   - conflict 状态显示冲突文件列表
   - "立即同步"按钮调用 `sync.force()`
   - error 状态显示"重试"按钮
   - 非 error 状态不显示"重试"按钮

4. 创建 `tests/renderer/useSyncStatus.test.ts`：
   - IPC 事件触发 store 更新
   - 组件卸载时调用 reset
   - 多次事件只保留最新状态
   - `syncApi` 不存在时不报错

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
| 1 | 应用启动时底栏显示同步状态 | 需求 2.3 AC1 | Step 2-4 | 手动启动应用观察底栏 |
| 2 | 已同步显示绿色 ✓ "已同步" | 需求 2.3 AC2 | Step 2 | 单元测试 + 手动验证 |
| 3 | 同步中显示旋转图标 "同步中 ↻" | 需求 2.3 AC3 | Step 2 | 单元测试 + 手动验证 |
| 4 | 离线显示灰色 "离线（本地已保存）" | 需求 2.3 AC4 | Step 2 | 单元测试 + 手动验证 |
| 5 | 有冲突显示红色警告 "有冲突 ⚠" | 需求 2.3 AC5 | Step 2 | 单元测试 + 手动验证 |
| 6 | 点击状态指示器弹出同步详情面板 | 需求 2.3 AC6 | Step 2 | 手动点击验证 |
| 7 | 详情面板显示错误信息和冲突文件 | 补充 | Step 2 | 单元测试 |
| 8 | "立即同步"按钮触发 sync:force | 补充 | Step 2 | 单元测试 + DevTools |
| 9 | 文件树冲突文件显示红点标识 | 补充 | Step 5 | 手动验证 |
| 10 | 暗色模式下正确显示 | 补充 | Step 2 | 手动切换暗色模式 |

### 9.2 性能指标

| # | 指标 | 目标 | 验证方式 |
|---|------|------|---------|
| 1 | 状态切换渲染响应 | < 100ms | React DevTools Profiler |
| 2 | 详情面板弹出动画 | CSS transition 流畅 | 手动验证 |
| 3 | IPC 监听不导致额外渲染 | 仅 SyncStatusIndicator 重渲染 | Zustand selector 验证 |

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
| 1 | `src/renderer/store/syncStatusStore.ts` | 新增 | 待创建 |
| 2 | `src/renderer/hooks/useSyncStatus.ts` | 新增 | 待创建 |
| 3 | `src/renderer/components/statusbar/SyncStatusIndicator.tsx` | 新增 | 待创建 |
| 4 | `src/renderer/components/statusbar/SyncDetailPanel.tsx` | 新增 | 待创建 |
| 5 | `src/renderer/components/statusbar/StatusBar.tsx` | 新增 | 待创建 |
| 6 | `src/renderer/components/statusbar/index.ts` | 新增 | 待创建 |
| 7 | `src/renderer/components/layout/AppLayout.tsx` | 重构 | 删除内联同步逻辑 |
| 8 | `src/renderer/pages/WorkspaceStudioPage.tsx` | 重构 | 迁移到 store |
| 9 | `src/renderer/components/layout/TreeNode.tsx` | 扩展 | 新增 conflictPaths prop |
| 10 | `src/renderer/components/layout/FileTree.tsx` | 扩展 | 透传 conflictPaths |
| 11 | `src/renderer/dev/mockElectronAPI.ts` | 扩展 | 新增 sync.getState |
| 12 | `tests/renderer/setup.ts` | 扩展 | 新增 sync.getState mock |
| 13 | `tests/renderer/syncStatusStore.test.ts` | 新增 | 待创建 |
| 14 | `tests/renderer/SyncStatusIndicator.test.tsx` | 新增 | 待创建 |
| 15 | `tests/renderer/SyncDetailPanel.test.tsx` | 新增 | 待创建 |
| 16 | `tests/renderer/useSyncStatus.test.ts` | 新增 | 待创建 |
| 17 | `tests/renderer/TreeNode.test.tsx` | 更新 | 新增 conflictPaths prop |
| 18 | `tests/renderer/FileTree.test.tsx` | 更新 | Mock syncStatusStore |

---

## 十、风险评估与回滚策略

### 10.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| AppLayout 改造引入 UI 回归 | 高 | 低 | 改造前后截图对比；现有测试覆盖；StatusBar 组件独立可测试 |
| WorkspaceStudioPage 通知逻辑迁移丢失 | 高 | 低 | 使用 Zustand subscribe API 替代 useEffect，确保不遗漏状态变化 |
| TreeNode 新增 prop 破坏现有测试 | 中 | 中 | conflictPaths 为新增必选 prop，批量更新测试文件 |
| IPC 事件格式与 TASK006 不一致 | 中 | 低 | 复用 shared/types.ts 的 SyncStatusData 类型，编译期保证一致 |
| Zustand selector 导致多余重渲染 | 低 | 低 | 各组件精确订阅所需字段；React DevTools Profiler 验证 |
| SyncDetailPanel 定位溢出屏幕 | 低 | 中 | 使用 `bottom-8 right-0` + `max-h-[80vh] overflow-y-auto` |

### 10.2 时间风险

本任务复杂度低，预计 1-2 天内完成。主要时间在于 AppLayout 和 WorkspaceStudioPage 的改造需要仔细处理，确保不丢失现有功能。

### 10.3 回滚策略

1. **syncStatusStore** — 独立新增文件，可安全删除
2. **useSyncStatus** — 独立新增 Hook，可安全删除
3. **StatusBar 组件族** — 独立新增目录，可安全删除
4. **AppLayout 改造** — 可通过 git revert 恢复原始内联逻辑
5. **WorkspaceStudioPage 改造** — 可通过 git revert 恢复原始 onStatusChange 监听
6. **TreeNode 扩展** — 删除 conflictPaths prop 和 FileSyncIndicator 即可恢复

---

**创建时间：** 2026-04-17
**最后更新：** 2026-04-17
**更新记录：**
- 2026-04-17 — 初始创建
