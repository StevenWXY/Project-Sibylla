# PHASE1-TASK026: 记忆面板 UI 与 IPC 集成 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task026_memory-panel-ui.md](../specs/tasks/phase1/phase1-task026_memory-panel-ui.md)
> 创建日期：2026-04-21
> 最后更新：2026-04-21

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK026 |
| **任务标题** | 记忆面板 UI 与 IPC 集成 |
| **所属阶段** | Phase 1 - 记忆系统 v2 (Sprint 3.2) |
| **优先级** | P1 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **前置依赖** | TASK022 + TASK023 + TASK024 + TASK025 |

### 1.1 目标

构建记忆系统的用户可见层——记忆面板 UI 和完整的 v2 IPC 通道集成。用户可通过面板查看、搜索、编辑、锁定、删除记忆条目，查看演化历史，手动触发检查点和压缩，并实时感知系统状态。

### 1.2 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| Zustand Store | `src/renderer/store/memoryStore.ts` | 记忆状态管理 |
| 记忆面板组件 | `src/renderer/components/memory/MemoryPanel.tsx` | 主面板容器 |
| 头部状态条 | `src/renderer/components/memory/MemoryHeader.tsx` | Token 用量、检查点状态 |
| 搜索框 | `src/renderer/components/memory/MemorySearchBar.tsx` | 混合检索入口 |
| 分节组件 | `src/renderer/components/memory/MemorySection.tsx` | 按 section 分组展示 |
| 记忆卡片 | `src/renderer/components/memory/MemoryEntryCard.tsx` | 单条记忆展示 |
| 条目编辑器 | `src/renderer/components/memory/MemoryEntryEditor.tsx` | 编辑记忆内容 |
| 演化历史 | `src/renderer/components/memory/MemoryEntryHistory.tsx` | 查看变更历史 |
| 检查点状态 | `src/renderer/components/memory/CheckpointStatusIndicator.tsx` | 运行状态指示 |
| IPC Handler 扩展 | `src/main/ipc/handlers/memory.handler.ts` | v2 handler 完整注册 |
| Preload API 扩展 | `src/preload/index.ts` | 暴露 memory v2 方法 |
| 单元测试 | `tests/renderer/memory/memoryStore.test.ts` | Store 测试 |
| 单元测试 | `tests/renderer/memory/MemoryPanel.test.tsx` | 组件测试 |
| 单元测试 | `tests/main/memory-handler.test.ts` | IPC Handler 测试 |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；UI 等待超 2 秒需进度反馈；所有按钮有 loading 状态 | 全局约束 |
| `specs/design/ui-ux-design.md` | 布局结构、色彩体系（主色 #6366F1）、组件规范（按钮 6px 圆角） | UI 设计 |
| `specs/requirements/phase1/sprint3.2-memory.md` | 需求 3.2.7 记忆面板 UI；IPC 接口清单 | 验收标准 |
| `specs/tasks/phase1/phase1-task026_memory-panel-ui.md` | 14 步执行路径、全部验收标准 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `zustand-state-management` | memoryStore 设计；selector 性能优化；IPC 封装在 action 中 | memoryStore.ts 全文件 |
| `electron-ipc-patterns` | Preload API 扩展；事件监听注册（checkpointStarted/Completed） | preload/index.ts + memory.handler.ts |

### 2.3 前置代码依赖（TASK022-025 产物）

| 模块 | 文件 | 复用方式 |
|------|------|---------|
| `MemoryEntry` | `memory/types.ts:11-22` | Store 和组件的类型定义 |
| `MemorySection` | `memory/types.ts:3-9` | Section 分组映射 |
| `MEMORY_SECTION_LABELS` | `memory/types.ts:79-86` | 中文标签展示 |
| `HybridSearchResult` | `memory/types.ts:234-252` | 搜索结果类型 |
| `EvolutionEvent` | `memory/types.ts:201-215` | 演化历史类型 |
| `CheckpointRecord` | `memory/types.ts:148-156` | 检查点状态 |
| `CompressionResult` | `memory/types.ts:158-165` | 压缩结果 |
| `MemoryConfig` | `memory/types.ts:167-176` | 配置展示 |
| `DEFAULT_MEMORY_CONFIG` | `memory/types.ts:178-187` | 默认阈值 |
| `MemoryManager` | `memory-manager.ts` | IPC Handler 调用 |
| `MemoryEventBus` | `memory/memory-event-bus.ts` | IPC Handler 事件发射 |
| `IPC_CHANNELS` v2 | `shared/types.ts:165-180` | 通道常量（已定义） |
| `IPCChannelMap` | `shared/types.ts` | 类型安全注册（已定义） |

### 2.4 v2 IPC 通道清单（已定义在 shared/types.ts）

| 通道常量 | 通道名 | 方向 | Handler 方法 |
|---------|--------|------|-------------|
| `MEMORY_V2_LIST_ENTRIES` | `memory:listEntries` | Renderer→Main | `handleListEntries` |
| `MEMORY_V2_LIST_ARCHIVED` | `memory:listArchived` | Renderer→Main | `handleListArchived` |
| `MEMORY_V2_SEARCH` | `memory:search` | Renderer→Main | `handleSearch` |
| `MEMORY_V2_GET_ENTRY` | `memory:getEntry` | Renderer→Main | `handleGetEntry` |
| `MEMORY_V2_GET_STATS` | `memory:getStats` | Renderer→Main | `handleGetStats` |
| `MEMORY_V2_UPDATE_ENTRY` | `memory:updateEntry` | Renderer→Main | `handleUpdateEntry` |
| `MEMORY_V2_DELETE_ENTRY` | `memory:deleteEntry` | Renderer→Main | `handleDeleteEntry` |
| `MEMORY_V2_LOCK_ENTRY` | `memory:lockEntry` | Renderer→Main | `handleLockEntry` |
| `MEMORY_V2_TRIGGER_CHECKPOINT` | `memory:triggerCheckpoint` | Renderer→Main | `handleTriggerCheckpoint` |
| `MEMORY_V2_TRIGGER_COMPRESSION` | `memory:triggerCompression` | Renderer→Main | `handleTriggerCompression` |
| `MEMORY_V2_UNDO_LAST_COMPRESSION` | `memory:undoLastCompression` | Renderer→Main | `handleUndoLastCompression` |
| `MEMORY_V2_GET_EVOLUTION_HISTORY` | `memory:getEvolutionHistory` | Renderer→Main | `handleGetEvolutionHistory` |
| `MEMORY_V2_REBUILD_INDEX` | `memory:rebuildIndex` | Renderer→Main | `handleRebuildIndex` |
| `MEMORY_V2_GET_INDEX_HEALTH` | `memory:getIndexHealth` | Renderer→Main | `handleGetIndexHealth` |
| `MEMORY_V2_GET_CONFIG` | `memory:getConfig` | Renderer→Main | `handleGetConfig` |
| `MEMORY_V2_UPDATE_CONFIG` | `memory:updateConfig` | Renderer→Main | `handleUpdateConfig` |

**主进程→渲染进程推送事件**（需在 ALLOWED_CHANNELS 注册）：

| 事件 | 通道名 | 用途 |
|------|--------|------|
| checkpointStarted | `memory:checkpointStarted` | 检查点开始运行 |
| checkpointCompleted | `memory:checkpointCompleted` | 检查点完成 |
| checkpointFailed | `memory:checkpointFailed` | 检查点失败 |
| entryAdded | `memory:entryAdded` | 新增条目 |
| entryUpdated | `memory:entryUpdated` | 更新条目 |
| entryDeleted | `memory:entryDeleted` | 删除条目 |

---

## 三、现有代码盘点与差距分析

### 3.1 IPC Handler 现状

**现有 `memory.handler.ts`：**
- 仅注册了 3 个 v1 通道 + 3 个 TASK025 搜索通道
- 缺少全部 16 个 v2 通道的 handler
- 无事件推送注册（webContents.send）

**缺口：**

| 缺失 Handler | 对应通道 |
|-------------|---------|
| `handleListEntries` | `memory:listEntries` |
| `handleListArchived` | `memory:listArchived` |
| `handleSearch` | `memory:search` |
| `handleGetEntry` | `memory:getEntry` |
| `handleGetStats` | `memory:getStats` |
| `handleUpdateEntry` | `memory:updateEntry` |
| `handleDeleteEntry` | `memory:deleteEntry` |
| `handleLockEntry` | `memory:lockEntry` |
| `handleTriggerCheckpoint` | `memory:triggerCheckpoint` |
| `handleTriggerCompression` | `memory:triggerCompression` |
| `handleUndoLastCompression` | `memory:undoLastCompression` |
| `handleGetEvolutionHistory` | `memory:getEvolutionHistory` |
| `handleRebuildIndex` | `memory:rebuildIndex` |
| `handleGetConfig` | `memory:getConfig` |
| `handleUpdateConfig` | `memory:updateConfig` |

### 3.2 Preload API 现状

**现有 `memory:` 命名空间（preload/index.ts:737-754）：**
```typescript
memory: {
  snapshot: () => Promise<IPCResponse<MemorySnapshotResponse>>
  update: (request: MemoryUpdateRequest) => Promise<IPCResponse<MemorySnapshotResponse>>
  flush: (request: MemoryFlushRequest) => Promise<IPCResponse<MemoryFlushResponse>>
  queryDailyLog: (request: DailyLogQueryRequest) => Promise<IPCResponse<DailyLogEntry[]>>
}
```

**缺失：** 全部 v2 memory API

### 3.3 Renderer 现状

| 缺失项 | 说明 |
|--------|------|
| `memoryStore.ts` | 不存在，需新建 |
| `MemoryPanel.tsx` | 不存在，需新建 |
| `MemoryHeader.tsx` | 不存在，需新建 |
| `MemorySearchBar.tsx` | 不存在，需新建 |
| `MemorySection.tsx` | 不存在，需新建 |
| `MemoryEntryCard.tsx` | 不存在，需新建 |
| `MemoryEntryEditor.tsx` | 不存在，需新建 |
| `MemoryEntryHistory.tsx` | 不存在，需新建 |
| `CheckpointStatusIndicator.tsx` | 不存在，需新建 |

### 3.4 不存在的文件

| 文件 | 状态 |
|------|------|
| `src/renderer/store/memoryStore.ts` | **不存在**，需新建 |
| `src/renderer/components/memory/` | **目录不存在**，需创建 |
| `tests/renderer/memory/` | **目录不存在**，需创建 |
| `tests/main/memory-handler.test.ts` | **不存在**，需新建 |

---

## 四、分步实施计划

### 阶段 A：memoryStore（Step 1-2） — 预计 0.5 天

#### A1：创建 memoryStore.ts

**文件：** `sibylla-desktop/src/renderer/store/memoryStore.ts`

**类型定义：**

```typescript
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type {
  MemoryEntry,
  MemorySection,
  HybridSearchResult,
  EvolutionEvent,
  CheckpointRecord,
  CompressionResult,
  MemoryConfig,
} from '../../main/services/memory/types'

interface MemoryStats {
  totalTokens: number
  entryCount: number
  lastCheckpoint: string | null
  sections: Record<MemorySection, number>
}

interface MemoryState {
  entries: MemoryEntry[]
  archivedEntries: MemoryEntry[]
  totalTokens: number
  lastCheckpoint: string | null
  isCheckpointRunning: boolean
  isCompressionAvailable: boolean
  canUndoCompression: boolean
  searchResults: HybridSearchResult[] | null
  searchQuery: string
  selectedEntryId: string | null
  isLoading: boolean
  error: string | null
  stats: MemoryStats | null
  config: MemoryConfig | null
}

interface MemoryActions {
  loadEntries: () => Promise<void>
  loadArchived: () => Promise<void>
  loadStats: () => Promise<void>
  searchEntries: (query: string) => Promise<void>
  editEntry: (id: string, newContent: string) => Promise<void>
  deleteEntry: (id: string) => Promise<void>
  lockEntry: (id: string, locked: boolean) => Promise<void>
  triggerCheckpoint: () => Promise<void>
  triggerCompression: () => Promise<void>
  undoLastCompression: () => Promise<void>
  getEvolutionHistory: (entryId?: string) => Promise<EvolutionEvent[]>
  selectEntry: (id: string | null) => void
  clearSearch: () => void
  setError: (error: string | null) => void
  reset: () => void
}

type MemoryStore = MemoryState & MemoryActions
```

**实现要点：**
1. 所有 IPC 调用封装在 action 内部
2. `loadEntries()` 调用 `memory:listEntries` + `memory:listArchived` + `memory:getStats`
3. 搜索防抖在组件层处理（300ms），Store 直接接收防抖后的 query
4. IPC 事件监听在 Store 初始化时注册，在 `reset()` 时清理
5. 使用 `devtools` 中间件便于调试

**IPC 事件监听：**

```typescript
// 在 Store 初始化时注册
const unsubscribers: Array<() => void> = []

function initializeListeners() {
  unsubscribers.push(
    window.electronAPI.on('memory:checkpointStarted', () => {
      set({ isCheckpointRunning: true })
    })
  )
  unsubscribers.push(
    window.electronAPI.on('memory:checkpointCompleted', () => {
      set({ isCheckpointRunning: false })
      get().loadEntries()
      get().loadStats()
    })
  )
  unsubscribers.push(
    window.electronAPI.on('memory:checkpointFailed', () => {
      set({ isCheckpointRunning: false })
    })
  )
  unsubscribers.push(
    window.electronAPI.on('memory:entryAdded', () => get().loadEntries())
  )
  unsubscribers.push(
    window.electronAPI.on('memory:entryUpdated', () => get().loadEntries())
  )
  unsubscribers.push(
    window.electronAPI.on('memory:entryDeleted', () => get().loadEntries())
  )
}

function cleanupListeners() {
  unsubscribers.forEach(unsub => unsub())
  unsubscribers.length = 0
}
```

#### A2：验证 Store 类型安全

- 确保所有 IPC 响应类型与 `shared/types.ts` 中的 `IPCChannelMap` 一致
- 禁止使用 `any` 类型

---

### 阶段 B：Preload API 扩展（Step 3） — 预计 0.3 天

#### B1：扩展 memory namespace

**文件：** `sibylla-desktop/src/preload/index.ts`

**1. 新增类型导入（从 shared/types）：**

需要确认 `shared/types.ts` 中是否已定义 `MemoryV2StatsResponse`。若未定义，需补充：

```typescript
// shared/types.ts 新增
export interface MemoryV2StatsResponse {
  totalTokens: number
  entryCount: number
  lastCheckpoint: string | null
  sections: Record<MemorySection, number>
}
```

**2. 扩展 ElectronAPI.memory namespace：**

```typescript
memory: {
  // v1（保留，标记 @deprecated）
  snapshot: () => Promise<IPCResponse<MemorySnapshotResponse>>
  update: (request: MemoryUpdateRequest) => Promise<IPCResponse<MemorySnapshotResponse>>
  flush: (request: MemoryFlushRequest) => Promise<IPCResponse<MemoryFlushResponse>>
  queryDailyLog: (request: DailyLogQueryRequest) => Promise<IPCResponse<DailyLogEntry[]>>
  
  // v2 新增
  listEntries: () => Promise<IPCResponse<MemoryEntry[]>>
  listArchived: () => Promise<IPCResponse<MemoryEntry[]>>
  search: (query: string, options?: SearchOptions) => Promise<IPCResponse<HybridSearchResult[]>>
  getEntry: (id: string) => Promise<IPCResponse<MemoryEntry | null>>
  getStats: () => Promise<IPCResponse<MemoryV2StatsResponse>>
  updateEntry: (id: string, updates: Partial<MemoryEntry>) => Promise<IPCResponse<void>>
  deleteEntry: (id: string) => Promise<IPCResponse<void>>
  lockEntry: (id: string, locked: boolean) => Promise<IPCResponse<void>>
  triggerCheckpoint: () => Promise<IPCResponse<CheckpointRecord>>
  triggerCompression: () => Promise<IPCResponse<CompressionResult>>
  undoLastCompression: () => Promise<IPCResponse<void>>
  getEvolutionHistory: (entryId?: string) => Promise<IPCResponse<EvolutionEvent[]>>
  rebuildIndex: () => Promise<IPCResponse<void>>
  getIndexHealth: () => Promise<IPCResponse<{ healthy: boolean; entryCount: number }>>
  getConfig: () => Promise<IPCResponse<MemoryConfig>>
  updateConfig: (patch: Partial<MemoryConfig>) => Promise<IPCResponse<void>>
  
  // v2 事件监听
  onCheckpointStarted: (callback: (record: CheckpointRecord) => void) => () => void
  onCheckpointCompleted: (callback: (record: CheckpointRecord) => void) => () => void
  onCheckpointFailed: (callback: (record: CheckpointRecord) => void) => () => void
  onEntryAdded: (callback: (entry: MemoryEntry) => void) => () => void
  onEntryUpdated: (callback: (entry: MemoryEntry) => void) => () => void
  onEntryDeleted: (callback: (entryId: string) => void) => () => void
}
```

**3. 注册新通道到 ALLOWED_CHANNELS：**

```typescript
IPC_CHANNELS.MEMORY_V2_LIST_ENTRIES,
IPC_CHANNELS.MEMORY_V2_LIST_ARCHIVED,
IPC_CHANNELS.MEMORY_V2_SEARCH,
IPC_CHANNELS.MEMORY_V2_GET_ENTRY,
IPC_CHANNELS.MEMORY_V2_GET_STATS,
IPC_CHANNELS.MEMORY_V2_UPDATE_ENTRY,
IPC_CHANNELS.MEMORY_V2_DELETE_ENTRY,
IPC_CHANNELS.MEMORY_V2_LOCK_ENTRY,
IPC_CHANNELS.MEMORY_V2_TRIGGER_CHECKPOINT,
IPC_CHANNELS.MEMORY_V2_TRIGGER_COMPRESSION,
IPC_CHANNELS.MEMORY_V2_UNDO_LAST_COMPRESSION,
IPC_CHANNELS.MEMORY_V2_GET_EVOLUTION_HISTORY,
IPC_CHANNELS.MEMORY_V2_REBUILD_INDEX,
IPC_CHANNELS.MEMORY_V2_GET_INDEX_HEALTH,
IPC_CHANNELS.MEMORY_V2_GET_CONFIG,
IPC_CHANNELS.MEMORY_V2_UPDATE_CONFIG,
// 推送事件
'memory:checkpointStarted',
'memory:checkpointCompleted',
'memory:checkpointFailed',
'memory:entryAdded',
'memory:entryUpdated',
'memory:entryDeleted',
```

**4. 实现 API 方法：**

```typescript
// Memory v2 operations
memory: {
  listEntries: async () => {
    return await safeInvoke<MemoryEntry[]>(IPC_CHANNELS.MEMORY_V2_LIST_ENTRIES)
  },
  listArchived: async () => {
    return await safeInvoke<MemoryEntry[]>(IPC_CHANNELS.MEMORY_V2_LIST_ARCHIVED)
  },
  search: async (query, options) => {
    return await safeInvoke<HybridSearchResult[]>(IPC_CHANNELS.MEMORY_V2_SEARCH, query, options)
  },
  // ... 其他方法
},
// Event listeners
onCheckpointStarted: (callback) => {
  const handler = (_event: IpcRendererEvent, record: CheckpointRecord) => callback(record)
  ipcRenderer.on('memory:checkpointStarted', handler)
  return () => ipcRenderer.off('memory:checkpointStarted', handler)
},
// ... 其他事件监听
```

---

### 阶段 C：IPC Handler v2 扩展（Step 4） — 预计 0.5 天

#### C1：扩展 MemoryHandler

**文件：** `sibylla-desktop/src/main/ipc/handlers/memory.handler.ts`

**新增依赖导入：**

```typescript
import type {
  V2MemoryEntry,  // 若 types.ts 中有定义
  CheckpointRecord,
  CompressionResult,
  EvolutionEvent,
  HybridSearchResult,
  SearchOptions,
  MemoryConfig,
} from '../../services/memory/types'
import type { MemoryV2StatsResponse } from '../../../shared/types'
```

**新增 handler 方法注册到 register()：**

```typescript
// handleListEntries
ipcMain.handle(
  IPC_CHANNELS.MEMORY_V2_LIST_ENTRIES,
  this.safeHandle(this.handleListEntries.bind(this)),
)

// handleListArchived
ipcMain.handle(
  IPC_CHANNELS.MEMORY_V2_LIST_ARCHIVED,
  this.safeHandle(this.handleListArchived.bind(this)),
)

// handleGetStats
ipcMain.handle(
  IPC_CHANNELS.MEMORY_V2_GET_STATS,
  this.safeHandle(this.handleGetStats.bind(this)),
)

// handleUpdateEntry
ipcMain.handle(
  IPC_CHANNELS.MEMORY_V2_UPDATE_ENTRY,
  this.safeHandle(this.handleUpdateEntry.bind(this)),
)

// handleDeleteEntry
ipcMain.handle(
  IPC_CHANNELS.MEMORY_V2_DELETE_ENTRY,
  this.safeHandle(this.handleDeleteEntry.bind(this)),
)

// handleLockEntry
ipcMain.handle(
  IPC_CHANNELS.MEMORY_V2_LOCK_ENTRY,
  this.safeHandle(this.handleLockEntry.bind(this)),
)

// handleTriggerCheckpoint
ipcMain.handle(
  IPC_CHANNELS.MEMORY_V2_TRIGGER_CHECKPOINT,
  this.safeHandle(this.handleTriggerCheckpoint.bind(this)),
)

// handleTriggerCompression
ipcMain.handle(
  IPC_CHANNELS.MEMORY_V2_TRIGGER_COMPRESSION,
  this.safeHandle(this.handleTriggerCompression.bind(this)),
)

// handleUndoLastCompression
ipcMain.handle(
  IPC_CHANNELS.MEMORY_V2_UNDO_LAST_COMPRESSION,
  this.safeHandle(this.handleUndoLastCompression.bind(this)),
)

// handleGetEvolutionHistory
ipcMain.handle(
  IPC_CHANNELS.MEMORY_V2_GET_EVOLUTION_HISTORY,
  this.safeHandle(this.handleGetEvolutionHistory.bind(this)),
)

// handleGetConfig
ipcMain.handle(
  IPC_CHANNELS.MEMORY_V2_GET_CONFIG,
  this.safeHandle(this.handleGetConfig.bind(this)),
)

// handleUpdateConfig
ipcMain.handle(
  IPC_CHANNELS.MEMORY_V2_UPDATE_CONFIG,
  this.safeHandle(this.handleUpdateConfig.bind(this)),
)
```

#### C2：实现 handler 方法

```typescript
private async handleListEntries(
  _event: IpcMainInvokeEvent,
): Promise<MemoryEntry[]> {
  this.ensureWorkspaceServices()
  return this.memoryManager.getAllEntries()
}

private async handleListArchived(
  _event: IpcMainInvokeEvent,
): Promise<MemoryEntry[]> {
  this.ensureWorkspaceServices()
  return this.memoryManager.getAllArchivedEntries()
}

private async handleGetStats(
  _event: IpcMainInvokeEvent,
): Promise<MemoryV2StatsResponse> {
  this.ensureWorkspaceServices()
  const snapshot = await this.memoryManager.getMemorySnapshot()
  const entries = await this.memoryManager.getAllEntries()
  const sections = entries.reduce((acc, entry) => {
    acc[entry.section] = (acc[entry.section] || 0) + 1
    return acc
  }, {} as Record<MemorySection, number>)
  
  return {
    totalTokens: snapshot.tokenCount + snapshot.tokenDebt,
    entryCount: entries.length,
    lastCheckpoint: this.memoryManager.v2Components?.scheduler?.getLastCheckpoint()?.toISOString() ?? null,
    sections,
  }
}

private async handleUpdateEntry(
  _event: IpcMainInvokeEvent,
  entryId: string,
  updates: Partial<MemoryEntry>,
): Promise<void> {
  this.ensureWorkspaceServices()
  const entry = await this.memoryManager.v2Components?.fileManager?.load().then(s => s.entries.find(e => e.id === entryId))
  if (!entry) throw new Error(`Entry not found: ${entryId}`)
  
  const updated = { ...entry, ...updates, updatedAt: new Date().toISOString() }
  await this.memoryManager.v2Components?.fileManager?.save({ metadata: { version: 2, lastCheckpoint: new Date().toISOString(), totalTokens: 0, entryCount: 0 }, entries: [] })
  // 需要调用 MemoryManager.updateEntry 方法
  await this.memoryManager.updateEntry(entryId, updates.content ?? entry.content)
  
  // 记录演化日志
  await this.memoryManager.v2Components?.evolutionLog?.append({
    id: `ev-${Date.now()}`,
    timestamp: new Date().toISOString(),
    type: 'manual-edit',
    entryId,
    section: entry.section,
    before: { content: entry.content },
    after: { content: updated.content },
    trigger: { source: 'manual' },
    rationale: 'User manually edited entry via memory panel',
  })
}

private async handleDeleteEntry(
  _event: IpcMainInvokeEvent,
  entryId: string,
): Promise<void> {
  this.ensureWorkspaceServices()
  // 获取条目信息用于演化日志
  const entry = await this.memoryManager.v2Components?.fileManager?.load().then(s => s.entries.find(e => e.id === entryId))
  if (entry) {
    await this.memoryManager.v2Components?.evolutionLog?.append({
      id: `ev-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: 'delete',
      entryId,
      section: entry.section,
      before: { content: entry.content },
      trigger: { source: 'manual' },
      rationale: 'User manually deleted entry via memory panel',
    })
  }
  await this.memoryManager.deleteEntry(entryId)
  await this.memoryManager.v2Components?.indexer?.remove(entryId)
}

private async handleLockEntry(
  _event: IpcMainInvokeEvent,
  entryId: string,
  locked: boolean,
): Promise<void> {
  this.ensureWorkspaceServices()
  await this.memoryManager.lockEntry(entryId, locked)
  await this.memoryManager.v2Components?.evolutionLog?.append({
    id: `ev-${Date.now()}`,
    timestamp: new Date().toISOString(),
    type: locked ? 'lock' : 'unlock',
    entryId,
    section: '', // 需要从 entry 获取
    trigger: { source: 'manual' },
  })
}

private async handleTriggerCheckpoint(
  _event: IpcMainInvokeEvent,
): Promise<CheckpointRecord> {
  this.ensureWorkspaceServices()
  await this.memoryManager.triggerManualCheckpoint()
  return { id: '', trigger: 'manual', startedAt: new Date().toISOString(), status: 'running' }
}

private async handleTriggerCompression(
  _event: IpcMainInvokeEvent,
): Promise<CompressionResult> {
  this.ensureWorkspaceServices()
  return await this.memoryManager.compress()
}

private async handleUndoLastCompression(
  _event: IpcMainInvokeEvent,
): Promise<void> {
  this.ensureWorkspaceServices()
  await this.memoryManager.undoLastCompression()
}

private async handleGetEvolutionHistory(
  _event: IpcMainInvokeEvent,
  entryId?: string,
): Promise<EvolutionEvent[]> {
  this.ensureWorkspaceServices()
  return await this.memoryManager.v2Components?.evolutionLog?.query({ entryId }) ?? []
}

private async handleGetConfig(
  _event: IpcMainInvokeEvent,
): Promise<MemoryConfig> {
  return DEFAULT_MEMORY_CONFIG
}

private async handleUpdateConfig(
  _event: IpcMainInvokeEvent,
  patch: Partial<MemoryConfig>,
): Promise<void> {
  // 配置更新逻辑
}
```

#### C3：实现事件推送

在 MemoryHandler 中注入 BrowserWindow，通过 webContents.send 推送事件：

```typescript
export class MemoryHandler extends IpcHandler {
  constructor(
    private readonly memoryManager: MemoryManager,
    private readonly ragEngine: LocalRagEngine,
    private readonly workspaceManager: WorkspaceManager,
    private readonly eventBus: MemoryEventBus,
    private readonly mainWindow: BrowserWindow,
  ) {
    super()
    this.registerEventPush()
  }
  
  private registerEventPush(): void {
    this.eventBus.on('memory:checkpoint-started', (record: CheckpointRecord) => {
      this.mainWindow.webContents.send('memory:checkpointStarted', record)
    })
    this.eventBus.on('memory:checkpoint-completed', (record: CheckpointRecord) => {
      this.mainWindow.webContents.send('memory:checkpointCompleted', record)
    })
    this.eventBus.on('memory:checkpoint-failed', (record: CheckpointRecord) => {
      this.mainWindow.webContents.send('memory:checkpointFailed', record)
    })
    this.eventBus.on('memory:entry-added', (entry: MemoryEntry) => {
      this.mainWindow.webContents.send('memory:entryAdded', entry)
    })
    this.eventBus.on('memory:entry-updated', (entry: MemoryEntry) => {
      this.mainWindow.webContents.send('memory:entryUpdated', entry)
    })
    this.eventBus.on('memory:entry-deleted', (entryId: string) => {
      this.mainWindow.webContents.send('memory:entryDeleted', entryId)
    })
  }
}
```

---

### 阶段 D：UI 组件（Step 5-12） — 预计 2 天

#### D1：目录结构

创建目录：`src/renderer/components/memory/`

#### D2：MemoryHeader.tsx

**功能：** Token 用量进度条、检查点状态、立即检查按钮、压缩按钮

**Props：**
```typescript
interface MemoryHeaderProps {
  totalTokens: number
  threshold?: number  // 默认 12000
  isCheckpointRunning: boolean
  lastCheckpoint: string | null
  canUndoCompression: boolean
  onRunCheckpoint: () => Promise<void>
  onCompress: () => Promise<void>
  onUndoCompression: () => Promise<void>
}
```

**设计要点：**
- Token 进度条颜色：< 8K 灰色 / 8K-10K 绿色 / 10K-12K 黄色 / > 12K 红色
- "立即检查"按钮：检查点运行中时 disabled + loading spinner
- "压缩"按钮：仅 totalTokens > 10000 时显示
- "撤销压缩"按钮：仅 canUndoCompression 时显示

#### D3：CheckpointStatusIndicator.tsx

**功能：** 检查点运行状态指示器

**Props：**
```typescript
interface CheckpointStatusIndicatorProps {
  isRunning: boolean
  lastCheckpoint: string | null
}
```

**显示：**
- 运行中：旋转图标 + "检查点运行中..."
- 空闲：上次检查点相对时间（"2 小时前"）+ 下次预估时间
- 从未运行："尚未运行检查点"

#### D4：MemorySearchBar.tsx

**功能：** 搜索输入框（带防抖）

**Props：**
```typescript
interface MemorySearchBarProps {
  onSearch: (query: string) => void
  onClear: () => void
  isLoading?: boolean
}
```

**实现：**
- 搜索图标输入框
- 300ms 防抖
- 清除按钮（×）
- loading 状态指示器

#### D5：MemorySection.tsx

**功能：** 分节展示

**Props：**
```typescript
interface MemorySectionProps {
  section: MemorySection
  entries: MemoryEntry[]
  searchQuery?: string
  onEdit: (entry: MemoryEntry) => void
  onLock: (entry: MemoryEntry, locked: boolean) => void
  onDelete: (entry: MemoryEntry) => void
  onViewHistory: (entry: MemoryEntry) => void
}
```

**逻辑：**
- 标题映射：`MEMORY_SECTION_LABELS[section]`
- 条目排序：`confidence × Math.log(hits + 1)` 降序
- 可折叠：点击标题切换展开/折叠
- 条目数量 badge

#### D6：MemoryEntryCard.tsx

**功能：** 单条记忆卡片

**Props：**
```typescript
interface MemoryEntryCardProps {
  entry: MemoryEntry
  searchQuery?: string
  onEdit: () => void
  onLock: (locked: boolean) => void
  onDelete: () => void
  onViewHistory: () => void
}
```

**渲染内容：**
- 内容摘要（≤ 3 行，超长截断 + "展开"）
- 搜索关键词高亮（`searchQuery` 匹配处标记 `<mark>`）
- 置信度进度条：宽度 = confidence × 100%，颜色 ≥ 0.8 绿 / 0.5-0.8 黄 / < 0.5 红
- 命中次数 badge
- 最后更新时间（相对时间）
- 锁定图标（locked 时显示）
- 操作按钮：编辑 | 锁定 | 删除 | 查看历史

#### D7：MemoryEntryEditor.tsx

**功能：** 条目编辑器（Modal）

**Props：**
```typescript
interface MemoryEntryEditorProps {
  entry: MemoryEntry
  onSave: (newContent: string) => Promise<void>
  onCancel: () => void
}
```

**渲染：**
- 文本域（autoFocus）
- 保存/取消按钮
- loading 状态
- 错误提示

#### D8：MemoryEntryHistory.tsx

**功能：** 演化历史抽屉

**Props：**
```typescript
interface MemoryEntryHistoryProps {
  entryId: string
  events: EvolutionEvent[]
  onClose: () => void
}
```

**渲染：**
- 时间线视图（垂直排列）
- 事件类型中文标签映射
- before/after 对比（折叠）
- 无历史时显示"暂无变更记录"

#### D9：MemoryPanel.tsx（主面板）

**功能：** 组合所有子组件

**实现：**
```tsx
export function MemoryPanel() {
  const {
    entries,
    archivedEntries,
    totalTokens,
    lastCheckpoint,
    isCheckpointRunning,
    canUndoCompression,
    searchResults,
    searchQuery,
    isLoading,
    error,
    loadEntries,
    searchEntries,
    clearSearch,
    editEntry,
    deleteEntry,
    lockEntry,
    triggerCheckpoint,
    triggerCompression,
    undoLastCompression,
    getEvolutionHistory,
  } = useMemoryStore()
  
  useEffect(() => { loadEntries() }, [])
  
  const sections: MemorySection[] = [
    'user_preference', 'technical_decision', 'common_issue',
    'project_convention', 'risk_note', 'glossary'
  ]
  
  const handleSearch = useDebouncedCallback((query: string) => {
    if (query) searchEntries(query)
    else clearSearch()
  }, 300)
  
  // 无条目空状态
  if (!isLoading && entries.length === 0 && !searchQuery) {
    return (
      <div className="memory-panel-empty">
        <BrainIcon className="w-12 h-12 text-gray-400" />
        <p>暂无精选记忆。检查点运行后将自动提取。</p>
      </div>
    )
  }
  
  return (
    <div className="memory-panel">
      <MemoryHeader
        totalTokens={totalTokens}
        isCheckpointRunning={isCheckpointRunning}
        lastCheckpoint={lastCheckpoint}
        canUndoCompression={canUndoCompression}
        onRunCheckpoint={triggerCheckpoint}
        onCompress={triggerCompression}
        onUndoCompression={undoLastCompression}
      />
      <MemorySearchBar
        onSearch={handleSearch}
        onClear={clearSearch}
      />
      {/* 搜索结果跨 section 展示 */}
      {searchResults ? (
        <SearchResultsList results={searchResults} />
      ) : (
        sections.map(section => (
          <MemorySection
            key={section}
            section={section}
            entries={entries.filter(e => e.section === section)}
            onEdit={...}
            onLock={...}
            onDelete={...}
            onViewHistory={...}
          />
        ))
      )}
    </div>
  )
}
```

---

### 阶段 E：集成到 Studio（Step 13） — 预计 0.2 天

#### E1：在侧边栏添加记忆入口

**文件：** `src/renderer/components/layout/Sidebar.tsx`（或相应布局组件）

添加"记忆"标签页入口：
- 图标：🧠 或 brain icon
- 标签文字："精选记忆"
- 路由/状态切换到 MemoryPanel

---

### 阶段 F：单元测试（Step 14） — 预计 0.5 天

#### F1：memoryStore.test.ts

测试用例：
1. `loadEntries` 正确加载条目
2. `searchEntries` 调用 IPC 搜索
3. `editEntry` 更新条目内容
4. `deleteEntry` 移除条目
5. `lockEntry` 切换锁定状态
6. `triggerCheckpoint` 设置运行状态
7. IPC 事件监听更新 store

#### F2：MemoryPanel.test.tsx

测试用例：
1. 面板渲染 6 个 section
2. 条目按排序展示
3. 搜索框触发搜索
4. 编辑流程
5. 删除确认对话框
6. 锁定切换

#### F3：memory-handler.test.ts

测试用例：
1. `handleListEntries` 返回条目列表
2. `handleSearch` 调用 MemoryIndexer
3. `handleUpdateEntry` 触发 EvolutionLog
4. `handleTriggerCheckpoint` emit 正确事件

---

## 五、验收标准追踪

### 记忆面板 UI

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 打开面板时按 section 分组展示所有条目，section 内按 confidence × log(hits+1) 排序 | D9 MemoryPanel + D5 MemorySection | F2-2 |
| 2 | 每条展示：内容、置信度进度条、命中次数、最后更新时间、来源日志链接 | D6 MemoryEntryCard | F2-1 |
| 3 | 点击条目展开详情抽屉 | D7 MemoryEntryEditor | F2-4 |
| 4 | 编辑条目后保存，触发 EvolutionLog type='manual-edit' | C2 handleUpdateEntry | F3-3 |
| 5 | 点击锁定按钮设置 locked=true，显示锁定图标 | D6 MemoryEntryCard + C2 handleLockEntry | F2-6 |
| 6 | 点击删除按钮弹出确认对话框，确认后移除 | D6 + D9 + C2 handleDeleteEntry | F2-5 |
| 7 | 搜索框调用混合检索，高亮匹配结果 | D4 + D6 searchQuery 高亮 | F2-3 |
| 8 | "立即检查"按钮触发手动检查点，显示运行进度 | D2 MemoryHeader + C2 handleTriggerCheckpoint | F1-6 |
| 9 | 检查点运行中面板显示实时状态 | A1 memoryStore 事件监听 | F1-7 |
| 10 | totalTokens 接近 12K 时显示警告 + "压缩"按钮 | D2 MemoryHeader | — |
| 11 | 压缩后 24 小时内显示"撤销压缩"按钮 | D2 MemoryHeader | — |

### IPC 集成

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 所有 v2 IPC 通道类型安全注册（IPCChannelMap） | C1 MemoryHandler.register | F3-1 |
| 2 | Preload API 暴露 memory v2 方法 | B1 preload/index.ts | — |
| 3 | v1 IPC 通道继续正常工作 | 现有代码不变 | — |
| 4 | 主进程→渲染进程事件正确推送 | C3 registerEventPush | F3-4 |

### 可用性

| # | 验收标准 | 实现位置 |
|---|---------|---------|
| 1 | 面板加载 < 500ms（1000 条以下） | 架构级保障 |
| 2 | 搜索响应 < 300ms | TASK025 已保证 |
| 3 | 所有按钮有 loading 状态和错误兜底 | D2-D9 所有组件 |
| 4 | 使用自然语言（"精选记忆""置信度""检查点"） | D2-D9 所有组件 |

---

## 六、风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| IPC 通道类型不匹配 | 高 | 严格对照 `shared/types.ts` 中的 `IPCChannelMap` 定义 |
| 事件推送未注册到 ALLOWED_CHANNELS | 中 | 在 B1 步骤中明确列出所有推送事件 |
| memoryStore 事件监听内存泄漏 | 高 | 在 `reset()` 中调用 `cleanupListeners()` |
| 大量条目渲染性能 | 中 | 使用 `useShallow` selector；考虑虚拟列表 |
| MemoryManager 缺少某些方法 | 中 | 先检查 `memory-manager.ts`，如有缺失先补充再连接 |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 |
|----|------|--------|
| Day 1 上午 | A1 | memoryStore.ts 完整实现 |
| Day 1 下午 | B1 + B2 | Preload API 扩展 + 通道注册 |
| Day 2 | C1-C3 | IPC Handler v2 扩展完整实现 |
| Day 3 | D1-D9 | 全部 UI 组件实现 |
| Day 4 上午 | E1 | Studio 集成 |
| Day 4 下午 | F1-F3 | 单元测试全部通过 |
| Day 5 | — | 集成验证 + 修复 |

---

**文档版本**: v1.0
**最后更新**: 2026-04-21
**维护者**: Sibylla 架构团队
