# PHASE1-TASK016: 记忆系统 IPC 暴露与联调 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task016_memory-ipc-integration.md](../specs/tasks/phase1/phase1-task016_memory-ipc-integration.md)
> 创建日期：2026-04-18
> 最后更新：2026-04-18

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK016 |
| **任务标题** | 记忆系统 IPC 暴露与联调 |
| **优先级** | P1 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **前置依赖** | ✅ MemoryManager（415行，95%完成）、✅ LocalRagEngine（293行，90%完成）、✅ FileLock（74行，100%完成）、⚠️ TASK011（AI 流式对话，需对话完成后展示记忆状态） |

### 目标

将已完成的后端记忆系统（MemoryManager + LocalRagEngine + FileLock）通过 IPC 暴露给渲染进程，完成 AI 对话与记忆系统的端到端联调。当前 MemoryManager 和 RAG 引擎仅在 AIHandler 内部使用，渲染进程无法直接查询 MEMORY 状态、RAG 检索结果或 Daily Log。

### 核心命题

当前 `ai.handler.ts` 内部已正确调用 MemoryManager（appendLog、getMemorySnapshot、flushIfNeeded）和 RAG 引擎（search），但存在三层隔离缺口：

1. **MEMORY 查询缺口**：渲染进程无法独立查询 MEMORY.md 的 Token 用量、债务、内容
2. **RAG 检索缺口**：渲染进程无法独立搜索归档内容或重建索引
3. **Daily Log 查询缺口**：渲染进程无法查询指定日期的日志条目

AI 对话完成后，`AIStreamEnd` 虽包含 `memory: AIMemoryState` 和 `ragHits: AIRagHit[]`，但渲染进程仅在 `WorkspaceStudioPage.tsx:683` 做了简单的 flush 通知，无独立查询能力。

### 范围边界

**包含：**
- 新增 6 个 IPC 通道：`memory:snapshot`、`memory:update`、`memory:flush`、`memory:daily-log:query`、`rag:search`、`rag:rebuild`
- 新增 `MemoryHandler` IPC 处理器（`src/main/ipc/handlers/memory.handler.ts`）
- `src/shared/types.ts` 扩展：通道常量 + IPCChannelMap 类型映射 + 新类型定义
- `src/preload/index.ts` 扩展：`memory` 和 `rag` 命名空间 API
- `src/main/index.ts` 注册 MemoryHandler
- `src/renderer/store/aiChatStore.ts` 扩展：存储 memory 状态到每条消息
- `src/renderer/components/studio/StudioAIPanel.tsx` 扩展：展示 RAG 命中片段和 MEMORY flush 状态
- 端到端联调：AI 对话 → memory flush → UI 状态更新完整链路

**不包含：**
- MEMORY 可视化编辑器（Phase 2）
- Daily Log 可视化面板（Phase 2）
- 归档管理 UI（Phase 2）

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 路径 | 关键约束 |
|------|------|---------|
| 项目宪法 | `CLAUDE.md` | TypeScript 严格模式禁止 any；主进程与渲染进程严格隔离通过 IPC 通信；所有异步操作必须有错误处理；关键操作结构化日志；渲染进程禁止直接访问文件系统 |
| 系统架构 | `specs/design/architecture.md` | IPC 通信模式：invoke/handle + send/on；渲染进程禁止直接调用 git 或文件系统 API |
| 数据模型与 API | `specs/design/data-and-api.md` | IPCChannelMap 类型映射规范；IPC 命名空间划分 |
| 记忆系统设计 | `specs/design/memory-system-design.md` | 三层存储架构；MEMORY.md 8-12K tokens 维护；flush 75% 阈值机制 |
| 需求规格 | `specs/requirements/phase1/sprint3-ai-mvp.md` | 需求 2.8（Memory 基础设施）、需求 2.9（AI 交互自动记录） |
| 任务规格 | `specs/tasks/phase1/phase1-task016_memory-ipc-integration.md` | IPC 通道定义、验收标准、范围边界 |
| UI/UX 规范 | `specs/design/ui-ux-design.md` | AI 对话窗口交互规范；loading 状态；2 秒等待需进度反馈 |

### 2.2 Skill 依赖

| Skill | 路径 | 使用场景 |
|-------|------|---------|
| `electron-ipc-patterns` | `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` | invoke/handle 模式、safeHandle 包装、IPCChannelMap 类型安全、Preload bridge 设计、错误分类 |
| `zustand-state-management` | `.kilocode/skills/phase1/zustand-state-management/SKILL.md` | memory 状态 store 设计、selector 精确订阅、devtools 集成 |
| `typescript-strict-mode` | `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` | IPC 通道类型严格约束、共享类型扩展、泛型与高级类型 |
| `vercel-react-best-practices` | `.kilocode/skills/common/vercel-react-best-practices/SKILL.md` | 避免不必要的重渲染、selector 稳定引用 |

### 2.3 前置代码依赖

| 模块 | 路径 | 行数 | 状态 | 说明 |
|------|------|------|------|------|
| MemoryManager | `src/main/services/memory-manager.ts` | 415 | ✅ 已完成 | `appendLog`、`getMemorySnapshot`、`updateMemory`、`flushIfNeeded` 全部可用 |
| LocalRagEngine | `src/main/services/local-rag-engine.ts` | 293 | ✅ 已完成 | `search(query, options?)`、`rebuildIndex()`、`createEmbedding()` 全部可用 |
| FileLock | `src/main/services/file-lock.ts` | 74 | ✅ 已完成 | `acquireExclusive`、`release` 可用 |
| AIHandler | `src/main/ipc/handlers/ai.handler.ts` | 510 | ✅ 已完成 | 内部已正确使用 MemoryManager/RAG，`AIStreamEnd` 含 `memory` + `ragHits` |
| IpcHandler 基类 | `src/main/ipc/handler.ts` | 221 | ✅ 已完成 | `safeHandle` 包装、`wrapResponse`/`wrapError` 工具方法 |
| IPC_CHANNELS | `src/shared/types.ts:72-199` | 1139 | ⚠️ 需扩展 | 缺少 memory/rag 通道常量 |
| IPCChannelMap | `src/shared/types.ts:241-348` | — | ⚠️ 需扩展 | 缺少 memory/rag 通道映射 |
| Preload API | `src/preload/index.ts` | 766 | ⚠️ 需扩展 | 缺少 `memory` 和 `rag` 命名空间 |
| Main 入口 | `src/main/index.ts` | 379 | ⚠️ 需扩展 | 需注册 MemoryHandler |
| aiChatStore | `src/renderer/store/aiChatStore.ts` | 216 | ⚠️ 需扩展 | `FinalizeData` 含 memory 但未持久化到 ChatMessage |
| ChatMessage | `src/renderer/components/studio/types.ts:54-64` | — | ⚠️ 需扩展 | 缺少 `memoryState` 和 `ragHits` 字段 |
| StudioAIPanel | `src/renderer/components/studio/StudioAIPanel.tsx` | 336 | ⚠️ 需扩展 | 有 `contextSources` badge 但无 RAG snippet 或 MEMORY 状态展示 |
| WorkspaceStudioPage | `src/renderer/pages/WorkspaceStudioPage.tsx:683` | 1186 | ⚠️ 需扩展 | 仅做 flush 通知，未展示详细 memory/rag 信息 |
| SearchHandler | `src/main/ipc/handlers/search.handler.ts` | 65 | ✅ 参考模式 | MemoryHandler 可直接参照此模式创建 |

### 2.4 被依赖任务

| 任务 | 依赖方式 |
|------|---------|
| Phase 2 Sprint 4 记忆管理 UI | 需本任务的 IPC 通道和 preload API 基础 |

### 2.5 npm 依赖

无需新增 npm 包。所有核心依赖已安装：
- `zustand` ^5.0.11 — 状态管理
- `lucide-react` ^0.577.0 — 图标
- `clsx` + `tailwind-merge` — 样式工具

---

## 三、现有代码盘点与差距分析

### 3.1 当前记忆系统数据流（仅内部）

```
渲染进程 WorkspaceStudioPage     主进程 AIHandler              MemoryManager + RAG
    │                              │                              │
    │ ipcRenderer.send('ai:stream')│                              │
    │─────────────────────────────▶│                              │
    │                              │ memoryManager.appendLog()    │
    │                              │─────────────────────────────▶│
    │                              │ ragEngine.search()           │
    │                              │─────────────────────────────▶│
    │                              │ memoryManager.getSnapshot()  │
    │                              │─────────────────────────────▶│
    │                              │ ... gateway call ...         │
    │                              │ memoryManager.flushIfNeeded()│
    │                              │─────────────────────────────▶│
    │◀── ai:stream:end ───────────│                              │
    │   (memory: {tokenCount,      │                              │
    │    tokenDebt, flushTriggered}│                              │
    │    ragHits: [{path,score,    │                              │
    │    snippet}])                │                              │
    │                              │                              │
    │  ╳ 无法独立查询 MEMORY 状态   │                              │
    │  ╳ 无法独立搜索 RAG          │                              │
    │  ╳ 无法查询 Daily Log        │                              │
```

**问题：** 渲染进程只能通过 AI 对话的副作用获取记忆信息，无法独立发起查询。MEMORY 状态、RAG 检索、Daily Log 三类核心能力均未暴露给渲染进程。

### 3.2 目标数据流（IPC 通道开放后）

```
渲染进程                         主进程 MemoryHandler              MemoryManager + RAG
    │                              │                              │
    │ ── memory:snapshot ────────▶│ safeHandle ─────────────────▶│ getMemorySnapshot()
    │◀─ IPCResponse<MemorySnapshot>│                              │
    │                              │                              │
    │ ── memory:update ──────────▶│ safeHandle ─────────────────▶│ updateMemory(updates)
    │◀─ IPCResponse<MemorySnapshot>│                              │
    │                              │                              │
    │ ── memory:flush ───────────▶│ safeHandle ─────────────────▶│ flushIfNeeded(...)
    │◀─ IPCResponse<MemoryFlushResult>│                           │
    │                              │                              │
    │ ── rag:search ─────────────▶│ safeHandle ─────────────────▶│ search(query, opts)
    │◀─ IPCResponse<RagSearchHit[]>│                              │
    │                              │                              │
    │ ── rag:rebuild ────────────▶│ safeHandle ─────────────────▶│ rebuildIndex()
    │◀─ IPCResponse<void>          │                              │
    │                              │                              │
    │ ── memory:daily-log:query ─▶│ safeHandle ─────────────────▶│ queryDailyLog(date)
    │◀─ IPCResponse<DailyLogEntry[]>│                             │
```

### 3.3 差距矩阵

| 能力 | 现有 | 缺口 | 本任务产出 |
|------|------|------|-----------|
| MEMORY 状态查询 | ❌ 仅 AI 对话副作用 | 无独立 IPC 通道 | `memory:snapshot` 通道 + MemoryHandler |
| MEMORY 手动更新 | ❌ 不存在 | 无 IPC 通道 + 无 API | `memory:update` 通道 + handler |
| MEMORY 手动 flush | ❌ 不存在 | 无 IPC 通道 | `memory:flush` 通道 + handler |
| RAG 独立搜索 | ❌ 仅 AIHandler 内部 | 无 IPC 通道 | `rag:search` 通道 + handler |
| RAG 索引重建 | ❌ 仅 workspace open 时 | 无 IPC 通道 | `rag:rebuild` 通道 + handler |
| Daily Log 查询 | ❌ 不存在 | MemoryManager 无此方法 | `memory:daily-log:query` + MemoryManager 新方法 |
| IPCChannelMap 类型 | ❌ 缺 memory/rag 映射 | 无类型安全保证 | 6 个新映射条目 |
| Preload API | ❌ 无 memory/rag 命名空间 | 渲染进程无法调用 | `memory` + `rag` 命名空间 |
| ChatMessage 持久化 | ⚠️ FinalizeData 含 memory 但未存入消息 | 信息丢失 | ChatMessage 新增 `memoryState` + `ragHits` |
| RAG 命中片段展示 | ⚠️ 仅 contextSources badge | 无 snippet 展示 | 可折叠 RAG 引用面板 |
| MEMORY flush 状态展示 | ⚠️ 仅 notification toast | 无持久化展示 | 消息下方 flush 状态徽章 |

---

## 四、类型系统设计

### 4.1 新增 IPC 通道常量（`src/shared/types.ts`）

在 `IPC_CHANNELS` 对象中新增，插入位置：Search 操作之前、AI 操作之后。

```typescript
// Memory operations
MEMORY_SNAPSHOT: 'memory:snapshot',
MEMORY_UPDATE: 'memory:update',
MEMORY_FLUSH: 'memory:flush',
MEMORY_DAILY_LOG_QUERY: 'memory:daily-log:query',

// RAG operations
RAG_SEARCH: 'rag:search',
RAG_REBUILD: 'rag:rebuild',
```

### 4.2 新增共享类型（`src/shared/types.ts`）

```typescript
// ─── Memory IPC Types ───

export interface MemorySnapshotResponse {
  content: string
  tokenCount: number
  tokenDebt: number
}

export interface MemoryUpdateRequest {
  updates: MemoryUpdateItem[]
}

export interface MemoryUpdateItem {
  section: string
  content: string
  priority?: 'P0' | 'P1' | 'P2'
  tags?: string[]
}

export interface MemoryFlushRequest {
  sessionTokens: number
  contextWindowTokens: number
  pendingInsights: string[]
}

export interface MemoryFlushResponse {
  triggered: boolean
  thresholdTokens: number
  sessionTokens: number
  snapshot: MemorySnapshotResponse
}

export interface DailyLogQueryRequest {
  date: string  // YYYY-MM-DD format
}

export interface DailyLogEntry {
  timestamp: string
  type: string
  operator: string
  sessionId: string
  summary: string
  details: string[]
  tags: string[]
  relatedFiles: string[]
}

// ─── RAG IPC Types ───

export interface RagSearchRequest {
  query: string
  limit?: number
}

export interface RagSearchHit {
  path: string
  score: number
  snippet: string
}
```

**设计说明：**
- `MemorySnapshotResponse` 与 MemoryManager 内部的 `MemorySnapshot` 结构一致，但作为共享类型独立定义，避免主进程内部类型泄漏
- `MemoryUpdateItem` 与 MemoryManager 的 `MemoryUpdate` 结构一致，同样独立定义
- `DailyLogEntry` 为新增类型，对应 Daily Log 文件中的单条记录
- `RagSearchHit` 与 `AIRagHit` 结构一致（path/score/snippet），作为独立查询通道的返回类型
- 不复用 `AIRagHit`：`AIRagHit` 是 AI 对话语境下的类型，RAG 独立查询语义不同，保持独立性

### 4.3 IPCChannelMap 扩展（`src/shared/types.ts`）

```typescript
// Memory operations
[IPC_CHANNELS.MEMORY_SNAPSHOT]: { params: []; return: MemorySnapshotResponse }
[IPC_CHANNELS.MEMORY_UPDATE]: { params: [request: MemoryUpdateRequest]; return: MemorySnapshotResponse }
[IPC_CHANNELS.MEMORY_FLUSH]: { params: [request: MemoryFlushRequest]; return: MemoryFlushResponse }
[IPC_CHANNELS.MEMORY_DAILY_LOG_QUERY]: { params: [request: DailyLogQueryRequest]; return: DailyLogEntry[] }

// RAG operations
[IPC_CHANNELS.RAG_SEARCH]: { params: [request: RagSearchRequest]; return: RagSearchHit[] }
[IPC_CHANNELS.RAG_REBUILD]: { params: []; return: void }
```

### 4.4 ChatMessage 类型扩展（`src/renderer/components/studio/types.ts`）

```typescript
export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
  contextSources?: string[]
  streaming?: boolean
  diffProposal?: DiffProposal | null
  diffProposals?: ParsedFileDiff[]
  // ── 新增：记忆系统字段 ──
  memoryState?: {
    tokenCount: number
    tokenDebt: number
    flushTriggered: boolean
  } | null
  ragHits?: Array<{
    path: string
    score: number
    snippet: string
  }>
}
```

**设计决策：**
- `memoryState` 使用 nullable（`| null`）区分"未获取"和"已获取但无数据"
- `ragHits` 使用 optional（`?`），仅 assistant 消息且有 RAG 命中时填充
- 类型结构与 `AIMemoryState` / `AIRagHit` 一致，但直接在组件层定义避免跨层依赖

---

## 五、MemoryHandler 实现

### 5.1 模块职责

新建 `src/main/ipc/handlers/memory.handler.ts`，参照 `search.handler.ts` 的构造器注入模式。

**职责边界：**
- 仅做 IPC 通道注册和参数转换
- 调用 MemoryManager / LocalRagEngine 已有方法
- 不包含业务逻辑，不直接操作文件系统
- 错误处理委托给 `safeHandle` 基类

### 5.2 构造函数设计

```typescript
export class MemoryHandler extends IpcHandler {
  readonly namespace = 'memory'

  constructor(
    private readonly memoryManager: MemoryManager,
    private readonly ragEngine: LocalRagEngine,
    private readonly workspaceManager: WorkspaceManager,
  ) {
    super()
  }

  register(): void {
    ipcMain.handle(
      IPC_CHANNELS.MEMORY_SNAPSHOT,
      this.safeHandle(this.handleSnapshot.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.MEMORY_UPDATE,
      this.safeHandle(this.handleUpdate.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.MEMORY_FLUSH,
      this.safeHandle(this.handleFlush.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.MEMORY_DAILY_LOG_QUERY,
      this.safeHandle(this.handleDailyLogQuery.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.RAG_SEARCH,
      this.safeHandle(this.handleRagSearch.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.RAG_REBUILD,
      this.safeHandle(this.handleRagRebuild.bind(this)),
    )
    logger.info('[MemoryHandler] All handlers registered')
  }

  override cleanup(): void {
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_SNAPSHOT)
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_UPDATE)
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_FLUSH)
    ipcMain.removeHandler(IPC_CHANNELS.MEMORY_DAILY_LOG_QUERY)
    ipcMain.removeHandler(IPC_CHANNELS.RAG_SEARCH)
    ipcMain.removeHandler(IPC_CHANNELS.RAG_REBUILD)
    logger.info('[MemoryHandler] Cleanup completed')
  }
}
```

### 5.3 Handler 方法实现

各 handler 方法均为 `ensureWorkspaceServices()` + 代理调用的模式：

| 方法 | 参数 | 代理调用 | 返回转换 |
|------|------|---------|---------|
| `handleSnapshot` | 无 | `memoryManager.getMemorySnapshot()` | `MemorySnapshot` → `MemorySnapshotResponse`（字段映射） |
| `handleUpdate` | `MemoryUpdateRequest` | `memoryManager.updateMemory(updates)` | 共享类型 `MemoryUpdateItem[]` → 内部 `MemoryUpdate[]` 转换后调用 |
| `handleFlush` | `MemoryFlushRequest` | `memoryManager.flushIfNeeded(...)` | `MemoryFlushResult` → `MemoryFlushResponse`（嵌套 snapshot 映射） |
| `handleDailyLogQuery` | `DailyLogQueryRequest` | `memoryManager.queryDailyLog(date)` | 直接透传（见第七章新增方法） |
| `handleRagSearch` | `RagSearchRequest` | `ragEngine.search(query, {limit})` | `LocalRagSearchHit[]` → `RagSearchHit[]`（map 确保类型隔离） |
| `handleRagRebuild` | 无 | `ragEngine.rebuildIndex()` | void |

**`ensureWorkspaceServices` 私有方法：**

```typescript
private ensureWorkspaceServices(): void {
  const workspacePath = this.workspaceManager.getWorkspacePath()
  if (!workspacePath) {
    throw new Error('Please open a workspace before using memory features')
  }
  this.memoryManager.setWorkspacePath(workspacePath)
  this.ragEngine.setWorkspacePath(workspacePath)
}
```

**说明：** 所有方法均遵循 `safeHandle` 包装模式（基类自动处理 requestId、错误分类、IPCResponse 包装）。与 `search.handler.ts` 模式一致。

### 5.4 Main 入口注册（`src/main/index.ts`）

在 AI 基础设施创建区域（约第 100-111 行之后），新增 MemoryHandler 创建：

```typescript
// Create MemoryHandler
const memoryHandler = new MemoryHandler(
  memoryManager,
  localRagEngine,
  workspaceManager,
)
```

在 handlers 数组（约第 299-309 行）中添加：

```typescript
const handlers = [
  new SystemHandler(),
  new TestHandler(),
  fileHandler,
  workspaceHandler,
  syncHandler,
  gitHandler,
  authHandler,
  aiHandler,
  memoryHandler,  // 新增
  windowHandler,
]
```

---

## 六、Preload Bridge 扩展

### 6.1 ElectronAPI 接口扩展（`src/preload/index.ts`）

在 `ElectronAPI` 接口中新增 `memory` 和 `rag` 命名空间，插入位置：在 `ai` 之后、`auth` 之前。

```typescript
// Memory operations
memory: {
  snapshot: () => Promise<IPCResponse<MemorySnapshotResponse>>
  update: (request: MemoryUpdateRequest) => Promise<IPCResponse<MemorySnapshotResponse>>
  flush: (request: MemoryFlushRequest) => Promise<IPCResponse<MemoryFlushResponse>>
  queryDailyLog: (request: DailyLogQueryRequest) => Promise<IPCResponse<DailyLogEntry[]>>
}

// RAG operations
rag: {
  search: (request: RagSearchRequest) => Promise<IPCResponse<RagSearchHit[]>>
  rebuild: () => Promise<IPCResponse<void>>
}
```

### 6.2 ALLOWED_CHANNELS 扩展

在白名单数组中追加 6 个新通道，插入位置：AI 操作之后。

```typescript
// Memory operations
IPC_CHANNELS.MEMORY_SNAPSHOT,
IPC_CHANNELS.MEMORY_UPDATE,
IPC_CHANNELS.MEMORY_FLUSH,
IPC_CHANNELS.MEMORY_DAILY_LOG_QUERY,
// RAG operations
IPC_CHANNELS.RAG_SEARCH,
IPC_CHANNELS.RAG_REBUILD,
```

### 6.3 contextBridge API 实现

在 `contextBridge.exposeInMainWorld('electronAPI', { ... })` 中新增：

```typescript
// Memory operations
memory: {
  snapshot: () => safeInvoke<MemorySnapshotResponse>(IPC_CHANNELS.MEMORY_SNAPSHOT),
  update: (request: MemoryUpdateRequest) =>
    safeInvoke<MemorySnapshotResponse>(IPC_CHANNELS.MEMORY_UPDATE, request),
  flush: (request: MemoryFlushRequest) =>
    safeInvoke<MemoryFlushResponse>(IPC_CHANNELS.MEMORY_FLUSH, request),
  queryDailyLog: (request: DailyLogQueryRequest) =>
    safeInvoke<DailyLogEntry[]>(IPC_CHANNELS.MEMORY_DAILY_LOG_QUERY, request),
},

// RAG operations
rag: {
  search: (request: RagSearchRequest) =>
    safeInvoke<RagSearchHit[]>(IPC_CHANNELS.RAG_SEARCH, request),
  rebuild: () => safeInvoke<void>(IPC_CHANNELS.RAG_REBUILD),
},
```

---

## 七、MemoryManager Daily Log 查询方法

### 7.1 新增方法

在 `src/main/services/memory-manager.ts` 中新增 `queryDailyLog` 公有方法：

```typescript
async queryDailyLog(date: string): Promise<DailyLogEntry[]> {
  const workspacePath = this.ensureWorkspacePath()
  const dailyDirPath = path.join(workspacePath, MEMORY_DAILY_DIR)
  const logPath = path.join(dailyDirPath, `${date}.md`)

  try {
    const content = await fs.readFile(logPath, 'utf-8')
    return this.parseDailyLog(content)
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code === 'ENOENT') {
      return []
    }
    throw error
  }
}
```

### 7.2 Daily Log 解析器

`parseDailyLog(content: string): DailyLogEntry[]` 私有方法，按 `<!-- entry-start -->` / `<!-- entry-end -->` 分割文本块，逐块提取字段：

- 使用 `extractField(text, label)` 正则提取单行字段值（时间/类型/操作者/会话ID/摘要/标签/关联文件）
- 使用 `extractListItems(text, label)` 提取 `- ` 开头的列表项（详情）
- 标签字段按空格分割并去除 `#` 前缀
- 关联文件按逗号分割
- `(none)` 值转为空数组
- 仅当 timestamp + type + summary 均存在时才产出条目

解析器约 35 行，辅助方法约 25 行。**设计原则：** 宽松匹配，容忍多余空行和字段顺序变化。

### 7.4 新增类型导入

在 `memory-manager.ts` 顶部新增 import：

```typescript
import type { DailyLogEntry } from '../../shared/types'
```

并在文件顶部确保 `DailyLogEntry` 类型从 shared/types 导出后可用。因 MemoryManager 已定义内部类型，此处依赖共享层类型。

---

## 八、渲染进程 Store 与组件改造

### 8.1 aiChatStore 扩展（`src/renderer/store/aiChatStore.ts`）

**改动点：`finalizeAssistant` action 持久化 memory 和 ragHits 到消息**

当前 `finalizeAssistant` 仅提取 `contextSources`（从 ragHits 路径），不保留完整 ragHits 和 memory。

修改 `finalizeAssistant` 内的消息构建：

```typescript
finalizeAssistant: (streamId: string, data: FinalizeData) => {
  const state = get()
  const existingMessage = state.messages.find((msg) => msg.id === streamId)
  const existingContent = existingMessage?.content ?? ''
  const finalContent = data.content || existingContent

  const contextSources: string[] = [
    ...(data.contextSources ?? []),
    ...data.ragHits.map((h) => h.path),
  ]

  set(
    (state) => ({
      messages: state.messages.map((msg) =>
        msg.id === streamId
          ? {
              ...msg,
              content: finalContent,
              streaming: false,
              contextSources: contextSources.length > 0
                ? contextSources
                : msg.contextSources,
              // ── 新增：持久化 memory 和 ragHits ──
              memoryState: data.memory
                ? {
                    tokenCount: data.memory.tokenCount,
                    tokenDebt: data.memory.tokenDebt,
                    flushTriggered: data.memory.flushTriggered,
                  }
                : null,
              ragHits: data.ragHits.length > 0
                ? data.ragHits.map((h) => ({
                    path: h.path,
                    score: h.score,
                    snippet: h.snippet,
                  }))
                : undefined,
            }
          : msg
      ),
      isStreaming: false,
      activeStreamId: null,
      sessionTokenUsage: state.sessionTokenUsage + data.usage.totalTokens,
    }),
    false,
    'aiChat/finalizeAssistant'
  )
},
```

### 8.2 StudioAIPanel 扩展（`src/renderer/components/studio/StudioAIPanel.tsx`）

**新增：MEMORY flush 状态徽章**

在 assistant 消息气泡下方（现有 `contextSources` badge 区域之后），新增 flush 状态展示：

```tsx
{!message.streaming && message.memoryState && (
  <div className="flex items-center gap-1.5 text-[10px] text-sys-darkMuted">
    <span className="font-mono">
      MEMORY: {message.memoryState.tokenCount} tokens
      {message.memoryState.tokenDebt > 0 && (
        <span className="text-amber-400">
          {' '}(debt: {message.memoryState.tokenDebt})
        </span>
      )}
    </span>
    {message.memoryState.flushTriggered && (
      <span className="rounded bg-amber-500/20 px-1 py-0.5 text-amber-400">
        flush triggered
      </span>
    )}
  </div>
)}
```

**新增：可折叠 RAG 引用面板**

在 assistant 消息中，当 `ragHits` 存在且长度 > 0 时，展示可折叠的 RAG 引用列表：

```tsx
{!message.streaming && message.ragHits && message.ragHits.length > 0 && (
  <details className="group/details">
    <summary className="cursor-pointer text-[10px] text-sys-darkMuted hover:text-gray-400">
      RAG 引用 ({message.ragHits.length})
    </summary>
    <div className="mt-1 space-y-1">
      {message.ragHits.map((hit, index) => (
        <div
          key={`${message.id}-rag-${index}`}
          className="rounded border border-white/5 bg-sys-darkSurface p-2 text-[11px]"
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-sys-darkMuted truncate max-w-[200px]">
              {hit.path.split('/').pop()}
            </span>
            <span className="text-sys-darkMuted">
              score: {hit.score.toFixed(3)}
            </span>
          </div>
          <p className="mt-1 text-gray-400 line-clamp-2">
            {hit.snippet}
          </p>
        </div>
      ))}
    </div>
  </details>
)}
```

**设计决策：**
- 使用原生 `<details>` 元素，无需额外状态管理
- RAG 引用面板默认折叠，不干扰主对话流
- MEMORY 状态徽章始终可见（当数据存在时），提供即时反馈

### 8.3 WorkspaceStudioPage 联调增强（`src/renderer/pages/WorkspaceStudioPage.tsx`）

**当前代码**（约第 683-689 行）：

```typescript
if (end.memory.flushTriggered) {
  pushNotification(
    'warning',
    'MEMORY 已触发压缩',
    `token=${end.memory.tokenCount} debt=${end.memory.tokenDebt}`
  )
}
```

**保持不变**。notification toast 作为全局提示保留，消息内的 memory 状态徽章作为持久化展示互补。两者不冲突。

### 8.4 useAIStream 无需修改

`useAIStream.ts` 已正确将 `end.ragHits` 和 `end.memory` 传递给 `store.finalizeAssistant`（第 27-37 行）。store 扩展后，数据自动持久化到 ChatMessage。

---

## 九、分步实施计划

### Step 1：共享类型层扩展（预估 0.5 天）

**目标：** 建立所有 IPC 通道和类型的编译期安全基础。

**操作清单：**

| 序号 | 文件 | 改动 | 行数估计 |
|------|------|------|---------|
| 1.1 | `src/shared/types.ts` | 新增 6 个 IPC_CHANNELS 常量 | +6 行 |
| 1.2 | `src/shared/types.ts` | 新增 Memory/RAG 相关共享类型（7 个 interface） | +65 行 |
| 1.3 | `src/shared/types.ts` | 扩展 IPCChannelMap（6 个新条目） | +12 行 |
| 1.4 | `src/renderer/components/studio/types.ts` | ChatMessage 新增 `memoryState` + `ragHits` 字段 | +10 行 |

**验证：** `npx tsc --noEmit` 编译通过，无类型错误。

**自检清单：**
- [ ] 所有新 IPC 通道名符合 `namespace:action` 命名规范
- [ ] IPCChannelMap 中 params/return 类型与共享类型一致
- [ ] ChatMessage 新字段为 optional/nullable，不破坏现有代码

---

### Step 2：MemoryManager Daily Log 查询能力（预估 0.5 天）

**目标：** 为 MemoryManager 补充 `queryDailyLog` 方法，支持按日期查询日志条目。

**操作清单：**

| 序号 | 文件 | 改动 | 行数估计 |
|------|------|------|---------|
| 2.1 | `src/main/services/memory-manager.ts` | 新增 `queryDailyLog(date: string): Promise<DailyLogEntry[]>` | +8 行 |
| 2.2 | `src/main/services/memory-manager.ts` | 新增 `parseDailyLog(content: string): DailyLogEntry[]` 私有方法 | +35 行 |
| 2.3 | `src/main/services/memory-manager.ts` | 新增 `extractField` / `extractListItems` 辅助方法 | +25 行 |
| 2.4 | `src/main/services/memory-manager.ts` | 顶部 import DailyLogEntry | +1 行 |

**验证：** 可在主进程中直接调用 `memoryManager.queryDailyLog('2026-04-18')` 返回解析后的日志条目数组。

**自检清单：**
- [ ] 无日志文件时返回空数组而非抛异常
- [ ] 解析器容忍格式微变（多余空行、字段顺序变化）
- [ ] DailyLogEntry 类型从 shared/types 导入，不在 memory-manager.ts 重复定义

---

### Step 3：MemoryHandler 创建与注册（预估 0.5 天）

**目标：** 新建 MemoryHandler，注册所有 6 个 IPC 通道，完成主进程侧桥接。

**操作清单：**

| 序号 | 文件 | 改动 | 行数估计 |
|------|------|------|---------|
| 3.1 | `src/main/ipc/handlers/memory.handler.ts` | 新建文件，实现 MemoryHandler 类 | +140 行 |
| 3.2 | `src/main/index.ts` | 创建 MemoryHandler 实例并加入 handlers 数组 | +5 行 |

**验证：** 应用启动后控制台可见 `[MemoryHandler] All handlers registered`。

**自检清单：**
- [ ] 所有 6 个通道使用 `safeHandle` 包装
- [ ] cleanup() 正确移除所有 6 个 handler
- [ ] ensureWorkspaceServices() 在 workspace 未打开时抛出明确错误
- [ ] MemoryHandler 不直接导入 Node.js fs/path 模块

---

### Step 4：Preload Bridge 扩展（预估 0.5 天）

**目标：** 在 preload 层暴露 `memory` 和 `rag` 命名空间 API。

**操作清单：**

| 序号 | 文件 | 改动 | 行数估计 |
|------|------|------|---------|
| 4.1 | `src/preload/index.ts` | ElectronAPI 接口新增 `memory` 和 `rag` 命名空间 | +15 行 |
| 4.2 | `src/preload/index.ts` | ALLOWED_CHANNELS 新增 6 个通道 | +6 行 |
| 4.3 | `src/preload/index.ts` | contextBridge 实现新增 `memory` 和 `rag` API | +14 行 |
| 4.4 | `src/preload/index.ts` | 顶部 import 新增共享类型 | +7 行 |

**验证：** 渲染进程中 `window.electronAPI.memory.snapshot()` 可调用并返回 IPCResponse。

**自检清单：**
- [ ] 所有新方法使用 `safeInvoke<T>` 包装，有 30s 超时保护
- [ ] 通道名使用 IPC_CHANNELS 常量，不硬编码字符串
- [ ] 渲染进程 TypeScript 可正确推断返回类型

---

### Step 5：渲染进程 Store 与 UI 组件改造（预估 1 天）

**目标：** 扩展 aiChatStore 和 StudioAIPanel，持久化并展示 memory/rag 信息。

**操作清单：**

| 序号 | 文件 | 改动 | 行数估计 |
|------|------|------|---------|
| 5.1 | `src/renderer/store/aiChatStore.ts` | `finalizeAssistant` 持久化 memoryState + ragHits 到 ChatMessage | +15 行 |
| 5.2 | `src/renderer/components/studio/StudioAIPanel.tsx` | 新增 MEMORY flush 状态徽章 | +15 行 |
| 5.3 | `src/renderer/components/studio/StudioAIPanel.tsx` | 新增可折叠 RAG 引用面板 | +25 行 |

**验证：**
1. 发送 AI 消息后，assistant 回复下方可见 MEMORY token 计数
2. 若 RAG 有命中，可见"RAG 引用 (N)"可折叠面板
3. 点击展开后可见每个命中的路径、分数、snippet
4. 若 flush 触发，可见 amber 色"flush triggered"徽章

**自检清单：**
- [ ] 无 ragHits 时不渲染 RAG 面板（不显示空的"RAG 引用 (0)"）
- [ ] 无 memoryState 时不渲染 MEMORY 徽章
- [ ] RAG 面板折叠时不影响消息列表布局
- [ ] 样式与现有 contextSources badge 一致（暗色系 + mono 字体）

---

### Step 6：端到端联调与验证（预估 0.5 天）

**目标：** 验证完整链路：AI 对话 → memory flush → UI 状态更新 + 独立查询。

**联调场景：**

| 场景 | 操作 | 预期结果 |
|------|------|---------|
| 独立 MEMORY 查询 | 调用 `window.electronAPI.memory.snapshot()` | 返回 IPCResponse `{content, tokenCount, tokenDebt}` |
| 独立 RAG 搜索 | 调用 `window.electronAPI.rag.search({query: 'test'})` | 返回 IPCResponse<RagSearchHit[]> |
| RAG 索引重建 | 调用 `window.electronAPI.rag.rebuild()` | 返回 IPCResponse<void>，无报错 |
| Daily Log 查询 | 调用 `window.electronAPI.memory.queryDailyLog({date: '2026-04-18'})` | 返回当天的日志条目数组 |
| AI 对话后展示 RAG | 在 AI 对话中提问，若 RAG 命中 | 回复下方可见 RAG 引用面板 |
| AI 对话后展示 flush | 连续对话触发 75% 阈值 | 回复下方可见 flush triggered 徽章 |
| Workspace 未打开 | 不打开 workspace 直接调用 memory API | 返回 IPCResponse error: "Please open a workspace..." |

---

## 十、验收标准映射

| 验收标准 | 对应步骤 | 验证方法 |
|---------|---------|---------|
| 渲染进程可查询 MEMORY 状态（Token 数、债务、内容） | Step 3+4 | `window.electronAPI.memory.snapshot()` 返回完整数据 |
| AI 对话后 UI 展示本次 RAG 检索命中的归档片段 | Step 5 | AI 回复下方可见可折叠 RAG 引用面板 |
| AI 对话后 UI 展示 MEMORY flush 是否触发 | Step 5 | AI 回复下方可见 flush triggered 徽章（触发时） |
| 手动触发 RAG 索引重建可用 | Step 3+4 | `window.electronAPI.rag.rebuild()` 成功返回 |
| Daily Log 可通过 IPC 查询指定日期的条目 | Step 2+3+4 | `window.electronAPI.memory.queryDailyLog({date})` 返回条目 |
| 所有新增 IPC 通道类型安全（IPCChannelMap） | Step 1 | `npx tsc --noEmit` 编译通过 |

---

## 十一、风险评估与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| Daily Log 解析器对格式变化敏感 | 中 | 中 | 解析器使用宽松匹配（正则而非行号），新增字段被忽略而非报错 |
| RAG rebuild 长时间阻塞 preload 超时 | 低 | 低 | safeInvoke 默认 30s 超时；归档文件少（MVP 阶段）不触发；可在后续版本改为异步任务+进度推送 |
| MemoryHandler 与 AIHandler 重复调用 setWorkspacePath | 低 | 低 | setWorkspacePath 是幂等操作，重复调用无副作用 |
| ChatMessage 新字段影响序列化/持久化 | 低 | 低 | ChatMessage 仅存在于 Zustand store 内存中，不持久化到磁盘，新字段 optional 不影响反序列化 |
| Preload 接口变更导致渲染进程类型不匹配 | 中 | 中 | 使用 IPCChannelMap 编译期类型检查；preload 和 shared/types 在同一个 TypeScript 项目中同步编译 |

---

## 十二、文件变更清单

| 文件 | 操作 | 行数变化 |
|------|------|---------|
| `src/shared/types.ts` | 修改 | +83 行 |
| `src/renderer/components/studio/types.ts` | 修改 | +10 行 |
| `src/main/services/memory-manager.ts` | 修改 | +69 行 |
| `src/main/ipc/handlers/memory.handler.ts` | **新建** | +140 行 |
| `src/main/index.ts` | 修改 | +5 行 |
| `src/preload/index.ts` | 修改 | +42 行 |
| `src/renderer/store/aiChatStore.ts` | 修改 | +15 行 |
| `src/renderer/components/studio/StudioAIPanel.tsx` | 修改 | +40 行 |
| **合计** | — | **+404 行** |
