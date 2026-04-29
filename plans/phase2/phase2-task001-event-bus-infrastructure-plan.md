# PHASE2-TASK001: 事件总线基础设施扩展 — 实施计划

> 任务来源：[specs/tasks/phase2/phase2-task001_event-bus-infrastructure.md](../../specs/tasks/phase2/phase2-task001_event-bus-infrastructure.md)
> 创建日期：2026-04-28
> 最后更新：2026-04-28

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK001 |
| **任务标题** | 事件总线基础设施扩展 |
| **所属阶段** | Phase 2 - 跨源数据统一与上下文引擎 v2 (Sprint 4) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | PHASE1-TASK027（Tracer SDK）+ PHASE1-TASK022（MEMORY.md v2 数据层） |

### 1.1 目标

在 Sprint 3.3 的 `AppEventBus`（71 行，基于 Node.js EventEmitter）基础上，扩展为全系统级事件中心。核心交付：

1. **统一事件类型目录** — `SibyllaEventType` 联合类型，覆盖 6 大领域 ~35 种事件
2. **统一事件信封** — `SibyllaEvent<T>` 接口（ULID id / type / source / timestamp / payload / persist）
3. **通用事件接口** — `emitEvent()` / `subscribe()` / `subscribeAny()` 追加到 `AppEventBus`
4. **桥接机制** — 现有 17 个具名方法到统一事件流 + `MemoryEventBus` → `AppEventBus` 转发
5. **事件持久化** — `EventLogStore`（JSONL 格式，按月分文件，append-only）
6. **渲染进程 IPC 桥接** — `event:subscribe` / `event:unsubscribe` / `event:push` 三通道
7. **背压与优雅关闭** — 流量 > 100/sec 警告 + 5 秒超时 flush

### 1.2 核心设计约束（来自 CLAUDE.md + 任务文档）

| 约束 | 来源 | 具体要求 |
|------|------|----------|
| 追加式改造 | 任务文档 §核心设计约束 | 保留全部现有具名方法和 `EventMap` 类型，不破坏任何现有消费者 |
| 不引入第三个 EventBus | 任务文档 §核心设计约束 | 扩展现有 `AppEventBus`，通过桥接器连接 `MemoryEventBus` |
| TypeScript 严格模式 | CLAUDE.md §四 | 禁止 `any`，所有新增类型必须严格 |
| IPC 安全隔离 | CLAUDE.md §四 | 渲染进程不得直接访问文件系统，通过 IPC 通信 |
| 结构化日志 | CLAUDE.md §四 | 关键操作必须有 who/what/when/result 日志 |
| 错误不可静默 | CLAUDE.md §四 | 所有异步操作必须有明确错误处理 |
| 文件即真相 | CLAUDE.md §二 | 事件日志以 JSONL 明文存储在 `.sibylla/events/` |

### 1.3 核心交付物

| 交付物 | 文件路径 | 类型 |
|--------|---------|------|
| 统一事件类型 | `src/main/services/event-bus-types.ts` | 新建 |
| AppEventBus 扩展 | `src/main/services/event-bus.ts` | 修改（追加） |
| 事件持久化 | `src/main/services/event-log-store.ts` | 新建 |
| 桥接器 | `src/main/services/event-bus-bridges.ts` | 新建 |
| IPC 事件处理器 | `src/main/ipc/handlers/event.ts` | 新建 |
| Preload API 扩展 | `src/preload/index.ts` | 修改（扩展） |
| IPC 通道常量 | `src/shared/types.ts` | 修改（扩展） |
| 主进程装配 | `src/main/index.ts` | 修改 |
| 单元测试 | `tests/main/services/event-bus.test.ts` | 新建 |
| 桥接器测试 | `tests/main/services/event-bus-bridges.test.ts` | 新建 |
| 持久化测试 | `tests/main/services/event-log-store.test.ts` | 新建 |
| IPC 桥接测试 | `tests/main/ipc/event-handler.test.ts` | 新建 |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------| 
| `CLAUDE.md` §二 | 文件即真相——事件日志必须以 JSONL 明文存储 | EventLogStore 持久化设计 |
| `CLAUDE.md` §四 | TS 严格模式禁止 `any`；结构化日志（who/what/when/result）；异步操作必须有错误处理 | 全局代码约束 |
| `CLAUDE.md` §四 | 主进程与渲染进程严格隔离，通过 IPC 通信 | IPC 事件桥接设计 |
| `specs/design/architecture.md` §3.2 | 进程通信架构：Renderer ↔ IPC ↔ Main | IPC 通道设计与 Preload API 扩展 |
| `specs/design/architecture.md` §2.1 | 技术栈：Electron + React + TypeScript 严格模式 + Zustand | 技术选型约束 |
| `specs/design/testing-and-security.md` | 测试金字塔、覆盖率要求 | 单元测试策略（≥ 80%） |
| `specs/requirements/phase2/sprint4-semantic-search.md` §需求 4.1 | 事件总线验收标准 7 条；技术规格伪代码 | 验收标准来源 |
| `specs/requirements/phase1/sprint3.3-trace.md` | `AppEventBus` 与 `Tracer` 原始设计 | 现有 EventMap 和具名方法约束 |
| `specs/requirements/phase1/sprint3.2-memory.md` | `MemoryEventBus` 设计：12 个事件方法 | 桥接器映射源 |
| `specs/tasks/phase2/phase2-task001_event-bus-infrastructure.md` | 8 步技术执行路径、完整验收标准 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------| 
| `electron-ipc-patterns` | IPC 通道设计、类型安全接口、双向通信 | `event:subscribe`/`event:push` IPC handler + Preload API |
| `typescript-strict-mode` | 泛型事件类型设计、类型守卫、联合类型约束 | `SibyllaEvent<T>` 信封、`EventHandler<T>` 泛型、`SibyllaEventType` 联合类型 |

### 2.3 前置代码依赖

| 模块 | 文件路径 | 行数 | 复用方式 |
|------|---------|------|----------|
| `AppEventBus` | `src/main/services/event-bus.ts` | 71 行 | **追加式扩展**：保留全部 `EventMap`（20 种事件）+ 现有 `emit*` 方法 |
| `EventMap` | `src/main/services/event-bus.ts:6-27` | — | 保留不变，新增 `EVENT_MAP_BRIDGE` 映射到点分隔命名 |
| `MemoryEventBus` | `src/main/services/memory/memory-event-bus.ts` | 53 行 | **不修改**，通过 `MemoryEventBusBridge` 转发 12 种事件到 `AppEventBus` |
| `Tracer` | `src/main/services/trace/tracer.ts` | 235 行 | **可选注入**：通过 `setTracer()` 注入，为每个事件创建 Trace span |
| `TracePersistence` | `src/main/services/trace/tracer.ts:18-23` | — | 参考接口模式设计 `EventLogStore` |
| `IPC_CHANNELS` | `src/shared/types.ts:76-482` | — | **扩展**：新增 `EVENT_SUBSCRIBE`/`EVENT_UNSUBSCRIBE`/`EVENT_PUSH` 常量 |
| `IPCChannelMap` | `src/shared/types.ts:524-825` | — | **扩展**：注册新通道的类型签名 |
| `Preload API` | `src/preload/index.ts` | 1700+ 行 | **扩展**：新增 `events` 命名空间 |
| `ALLOWED_CHANNELS` | `src/preload/index.ts` | — | **扩展**：注册 3 个新 IPC 通道 |
| `forwardToRenderer` | `src/main/index.ts:751-772` | — | **参考模式**：现有事件转发机制，IPC 桥接将替代此模式 |
| 主进程服务装配 | `src/main/index.ts` | 1012 行 | **修改**：注入 `EventLogStore`、`Tracer`、创建 `MemoryEventBusBridge` |

### 2.4 新增外部依赖

| 库 | 版本 | 用途 | 说明 |
|-----|------|------|------|
| `ulid` | `^2.3.0` | ULID 生成 | 事件 ID 生成，比 UUID 更适合事件排序（时间戳前缀，单调递增） |

### 2.5 被依赖关系（下游消费者）

| 下游任务 | 消费的事件类型 | 阻塞关系 |
|---------|--------------|----------|
| PHASE2-TASK002 跨源统一搜索 | `index.*`、`search.executed` | 强依赖：需要 `subscribe()` 接口 |
| PHASE2-TASK003 ContextEngine v2 | `memory.*`、`search.executed` | 强依赖：需要事件驱动的上下文刷新 |
| PHASE2-TASK004 双向链接 | `file.*`、`wiki-links.updated` | 强依赖：文件变更触发链接索引更新 |
| PHASE2-TASK005 多端同步增强 | `git.pull-completed` | 中依赖：同步后事件通知 |
| Sprint 5 通知系统 | `collab.*`、`notification.*` | 弱依赖：预留事件类型 |
| Sprint 6 工作流触发器 | `task.*`、`file.*` | 弱依赖：预留事件类型 |

---

## 三、现有代码盘点与差距分析

### 3.1 AppEventBus 现状（`event-bus.ts`，71 行）

**已有能力：**
- `EventMap` 类型定义 20 种事件（冒号分隔键，如 `trace:span-ended`）
- `AppEventBus extends EventEmitter` — **注意：`EventMap` 仅为文档型类型定义，未约束 EventEmitter 泛型**
- 部分事件有 `emit*` 具名方法（`emitSpanEnded`、`emitTaskDeclared` 等），但 `datasource:*`、`model:*`、`plan:*`、`aiMode:*` 缺少对应 `emit*` 方法
- 构造函数零参数

**缺口（本任务需补充）：**

| 缺失能力 | 说明 |
|---------|------|
| 通用 `emitEvent<T>()` 方法 | 当前仅有具名 emit 方法，无法发布自定义事件类型 |
| `subscribe<T>()` / `subscribeAny()` | 当前仅有 EventEmitter 的 `.on()`，无法接收 `SibyllaEvent` 信封 |
| 异常隔离 | 当前 EventEmitter 默认行为：handler 异常会中断后续 handler |
| Trace 集成 | 事件发布时不自动创建 Trace span |
| 持久化支持 | 无 `EventLogStore` 注入能力 |
| 背压检测 | 无流量监控 |
| 优雅关闭 | 无 `flushAndShutdown()` 方法 |

### 3.2 MemoryEventBus 现状（`memory-event-bus.ts`，53 行）

**已有能力：**
- 12 个 `emit*` 方法，涵盖检查点、压缩、条目增删改、手动检查点等
- 独立于 `AppEventBus`，仅在记忆子系统内部使用

**缺口：**
- 与 `AppEventBus` 完全隔离，无事件互通
- 需通过 `MemoryEventBusBridge` 将关键事件转发到 `AppEventBus`

**桥接映射表（5 种核心事件）：**

| MemoryEventBus 事件名 | → SibyllaEventType | source |
|----------------------|-------------------|--------|
| `memory:checkpoint-completed` | `memory.checkpoint-completed` | `memory-manager` |
| `memory:entry-added` | `memory.entry-added` | `memory-manager` |
| `memory:entry-updated` | `memory.entry-updated` | `memory-manager` |
| `memory:entry-deleted` | `memory.entry-deleted` | `memory-manager` |
| `memory:compression-completed` | `memory.compression-completed` | `memory-manager` |

### 3.3 主进程事件转发现状（`index.ts:751-772`）

**现有模式：**
```typescript
const forwardToRenderer = (eventName: string, channel: string) => {
  appEventBus.on(eventName, (payload: unknown) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, payload)
      }
    }
  })
}
```

**问题：**
1. 手动注册每个事件的转发（约 15 个 `forwardToRenderer` 调用）
2. 无订阅机制——所有窗口无条件收到所有事件
3. 无 WebContents 销毁处理（依赖 `isDestroyed()` 检查）
4. 清理时需逐个 `removeAllListeners()`（`index.ts:779-901`）

**改进方向：** IPC 事件桥接（`event:subscribe`/`event:push`）将提供按需订阅机制，替代全量广播。现有 `forwardToRenderer` 调用保留不变（向后兼容），新事件通过统一桥接分发。

### 3.4 IPC 通道与 Preload 现状

**`shared/types.ts`（2956 行）：**
- `IPC_CHANNELS` 常量已定义 100+ 个通道
- `IPCChannelMap` 接口提供完整类型映射
- **缺失：** `EVENT_SUBSCRIBE`、`EVENT_UNSUBSCRIBE`、`EVENT_PUSH` 三个通道常量

**`preload/index.ts`（1700+ 行）：**
- `ElectronAPI` 接口已有 25+ 命名空间
- `ALLOWED_CHANNELS` 白名单安全校验
- `safeInvoke<T>()` 统一 IPC 调用封装
- **缺失：** `events` 命名空间（subscribe/unsubscribe/on 方法）

### 3.5 不存在的文件（需新建）

| 文件 | 用途 |
|------|------|
| `src/main/services/event-bus-types.ts` | 统一事件类型目录与信封接口 |
| `src/main/services/event-log-store.ts` | 事件 JSONL 持久化 |
| `src/main/services/event-bus-bridges.ts` | MemoryEventBus → AppEventBus 桥接器 |
| `src/main/ipc/handlers/event.ts` | 渲染进程 IPC 事件桥接 handler |
| `tests/main/services/event-bus.test.ts` | 核心事件总线测试 |
| `tests/main/services/event-bus-bridges.test.ts` | 桥接器测试 |
| `tests/main/services/event-log-store.test.ts` | 持久化测试 |
| `tests/main/ipc/event-handler.test.ts` | IPC 桥接测试 |

---

## 四、分步实施计划

### 阶段 A：类型基础设施（Step 1） — 预计 0.5 天

#### A1：定义统一事件类型与信封

**文件：** `sibylla-desktop/src/main/services/event-bus-types.ts`（新建）

**1. `SibyllaEventType` 联合类型（~35 种事件，6 大领域）：**

```typescript
export type SibyllaEventType =
  // 文件系统（4 种）
  | 'file.created' | 'file.updated' | 'file.deleted' | 'file.renamed'
  // 记忆系统（5 种，从 MemoryEventBus 桥接）
  | 'memory.entry-added' | 'memory.entry-updated' | 'memory.entry-deleted'
  | 'memory.checkpoint-completed' | 'memory.compression-completed'
  // MCP（4 种）
  | 'mcp.connected' | 'mcp.disconnected' | 'mcp.sync-completed' | 'mcp.tool-called'
  // 索引（3 种）
  | 'index.document-added' | 'index.document-updated' | 'index.completed'
  // AI（3 种）
  | 'ai.message-completed' | 'ai.tool-called' | 'ai.degraded'
  // Wiki Links + 搜索（2 种）
  | 'wiki-links.updated' | 'search.executed'
  // 桥接别名：现有 EventMap 到点分隔命名（8 种）
  | 'trace.span-ended' | 'progress.task-declared' | 'progress.task-completed'
  | 'performance.alert' | 'performance.metrics'
  | 'aiMode.changed' | 'plan.created' | 'plan.execution-started'
  // 未来预留（6 种，仅类型定义，本 Sprint 不实现消费者）
  | 'collab.user-joined' | 'collab.conflict-detected'
  | 'task.created' | 'task.completed'
  | 'notification.created' | 'git.pull-completed'
```

**2. `SibyllaEvent<T>` 信封接口：**

```typescript
export interface SibyllaEvent<T = unknown> {
  readonly id: string              // ULID
  readonly type: SibyllaEventType
  readonly source: string          // 发起模块标识
  readonly timestamp: number       // Date.now()
  readonly payload: T              // 业务数据
  readonly workspaceId?: string
  readonly traceId?: string        // 关联 Trace span
  readonly persist?: boolean       // 是否持久化到 JSONL
}
```

**3. `EventHandler<T>` 类型别名 + `EventPayloadMap` 条件映射：**

```typescript
export type EventHandler<T = unknown> = (event: SibyllaEvent<T>) => void | Promise<void>

// 用于在 subscribe<T> 中推断 payload 类型的映射
export interface EventPayloadMap {
  'file.created': { path: string; size: number }
  'file.updated': { path: string; changes: string }
  'file.deleted': { path: string }
  // ... 其他事件的 payload 类型
  [key: string]: unknown  // 兜底，允许未注册事件
}
```

**4. 桥接映射常量（现有 EventMap key → SibyllaEventType）：**

```typescript
export const EVENT_MAP_BRIDGE: ReadonlyMap<string, SibyllaEventType> = new Map([
  ['trace:span-ended',        'trace.span-ended'],
  ['trace:update',             'trace.span-ended'],  // 合并到同一事件
  ['progress:task-declared',   'progress.task-declared'],
  ['progress:task-completed',  'progress.task-completed'],
  ['performance:metrics',      'performance.metrics'],
  ['performance:alert',        'performance.alert'],
  ['aiMode:changed',           'aiMode.changed'],
  ['plan:created',             'plan.created'],
  ['plan:execution-started',   'plan.execution-started'],
])
```

**验证：** `npx tsc --noEmit` 类型检查通过，无 `any`

---

### 阶段 B：AppEventBus 通用接口扩展（Step 2） — 预计 1 天

#### B1：新增私有属性

**文件：** `sibylla-desktop/src/main/services/event-bus.ts`（追加式修改）

在 `AppEventBus` 类中追加：

```typescript
// ── Layer 2: 统一事件流（新增） ──
private readonly unifiedHandlers = new Map<SibyllaEventType, Set<EventHandler>>()
private readonly wildcards = new Set<EventHandler>()
private eventLogStore?: EventLogStore
private tracer?: Tracer

// ── 背压检测 ──
private emitCounter = 0
private lastCountReset = Date.now()
private readonly BACKPRESSURE_THRESHOLD = 100

// ── 优雅关闭 ──
private inFlightHandlers = new Set<Promise<unknown>>()
private isShuttingDown = false
```

#### B2：Setter 注入方法

```typescript
setEventLogStore(store: EventLogStore): void {
  this.eventLogStore = store
}

setTracer(tracer: Tracer): void {
  this.tracer = tracer
}
```

#### B3：`emitEvent<T>()` 核心方法

**关键实现要点：**
1. 生成 ULID id 和 timestamp
2. 可选 Trace span 创建（`kind='system'`，attributes 含 `event.id` 和 `event.source`）
3. 可选持久化——异步 `appendFile` 不阻塞分发，失败仅 `console.warn`
4. 遍历 targeted handlers + wildcards，每个 handler 独立 try/catch
5. 异步 handler 返回 Promise 时加入 `inFlightHandlers` 集合（用于优雅关闭）
6. 背压检测：每秒计数器 > 100 时 `console.warn`

```typescript
emitEvent<T>(partial: Omit<SibyllaEvent<T>, 'id' | 'timestamp'>): void {
  if (this.isShuttingDown) return

  const event: SibyllaEvent<T> = {
    ...partial,
    id: ulid(),
    timestamp: Date.now(),
  }

  // Trace span
  if (this.tracer) {
    this.tracer.withSpan(`event:${event.type}`, (span) => {
      span.setAttributes({ 'event.id': event.id, 'event.source': event.source })
    }, { kind: 'system' })
  }

  // 持久化
  if (event.persist && this.eventLogStore) {
    this.eventLogStore.append(event as SibyllaEvent).catch((err) => {
      console.warn('[AppEventBus] event.persist.failed', { type: event.type, err })
    })
  }

  // 背压检测
  this.checkBackpressure()

  // 分发（异常隔离）
  const targeted = this.unifiedHandlers.get(event.type)
  const allHandlers = [...(targeted ?? []), ...this.wildcards]
  for (const handler of allHandlers) {
    try {
      const result = handler(event as SibyllaEvent)
      if (result instanceof Promise) {
        this.inFlightHandlers.add(result)
        result.finally(() => this.inFlightHandlers.delete(result))
      }
    } catch (err) {
      console.error('[AppEventBus] event.handler.failed', {
        eventType: event.type, handlerName: handler.name || 'anonymous', err,
      })
    }
  }
}
```

#### B4：`subscribe<T>()` 和 `subscribeAny()` 方法

```typescript
subscribe<T = unknown>(type: SibyllaEventType, handler: EventHandler<T>): () => void {
  if (!this.unifiedHandlers.has(type)) {
    this.unifiedHandlers.set(type, new Set())
  }
  const typedHandler = handler as EventHandler
  this.unifiedHandlers.get(type)!.add(typedHandler)
  return () => { this.unifiedHandlers.get(type)?.delete(typedHandler) }
}

subscribeAny(handler: EventHandler): () => void {
  this.wildcards.add(handler)
  return () => { this.wildcards.delete(handler) }
}
```

#### B5：现有具名方法桥接

**策略：** 在每个现有具名方法末尾追加一行 `this.emitEvent()` 调用。示例：

```typescript
emitSpanEnded(span: SerializedSpan): void {
  this.emit('trace:span-ended', span)  // 原有逻辑不变
  this.emitEvent({
    type: 'trace.span-ended',
    source: 'tracer',
    payload: span,
  })
}
```

**覆盖范围：** 所有在 `EventMap` 中定义且有 `emit*` 方法的事件（约 10 个方法需要追加桥接行）。没有 `emit*` 方法的 EventMap 事件（如 `datasource:*`、`model:*`）暂不桥接——它们通过 `this.emit()` 直接发布到 Layer 1，后续需求时再追加。

#### B6：背压检测与优雅关闭

```typescript
private checkBackpressure(): void {
  this.emitCounter++
  const now = Date.now()
  if (now - this.lastCountReset >= 1000) {
    if (this.emitCounter > this.BACKPRESSURE_THRESHOLD) {
      console.warn('[AppEventBus] backpressure.warning', {
        eventsPerSecond: this.emitCounter,
        threshold: this.BACKPRESSURE_THRESHOLD,
      })
    }
    this.emitCounter = 0
    this.lastCountReset = now
  }
}

async flushAndShutdown(timeoutMs = 5000): Promise<void> {
  this.isShuttingDown = true
  const pending = Array.from(this.inFlightHandlers)
  if (pending.length === 0) return

  await Promise.race([
    Promise.allSettled(pending),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ])

  this.unifiedHandlers.clear()
  this.wildcards.clear()
  this.inFlightHandlers.clear()
}
```

**验证：** 现有 17 个具名方法的消费者行为不变；新增方法类型安全；`npx tsc --noEmit` 通过

---

### 阶段 C：EventLogStore 事件持久化（Step 3） — 预计 0.5 天

#### C1：实现 EventLogStore 类

**文件：** `sibylla-desktop/src/main/services/event-log-store.ts`（新建）

```typescript
import { promises as fs } from 'fs'
import path from 'path'
import type { SibyllaEvent } from './event-bus-types'

export class EventLogStore {
  private readonly baseDir: string

  constructor(baseDir: string) {
    this.baseDir = baseDir  // 默认 `.sibylla/events/`
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true })
  }

  async append(event: SibyllaEvent): Promise<void> {
    const fileName = this.getMonthlyFileName(event.timestamp)
    const filePath = path.join(this.baseDir, fileName)
    const line = JSON.stringify(event) + '\n'
    await fs.appendFile(filePath, line, 'utf-8')
  }

  async read(month: string): Promise<SibyllaEvent[]> {
    const filePath = path.join(this.baseDir, `${month}.jsonl`)
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return content.split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          try { return JSON.parse(line) as SibyllaEvent }
          catch { return null }
        })
        .filter((e): e is SibyllaEvent => e !== null)
    } catch {
      return []  // File not found → empty
    }
  }

  async cleanup(olderThanMonths: number): Promise<number> {
    const files = await fs.readdir(this.baseDir)
    const cutoff = this.getMonthOffset(-olderThanMonths)
    let deleted = 0
    for (const file of files) {
      const month = file.replace('.jsonl', '')
      if (month < cutoff) {
        await fs.unlink(path.join(this.baseDir, file))
        deleted++
      }
    }
    return deleted
  }

  private getMonthlyFileName(timestamp: number): string {
    const d = new Date(timestamp)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    return `${yyyy}-${mm}.jsonl`
  }

  private getMonthOffset(offset: number): string {
    const d = new Date()
    d.setMonth(d.getMonth() + offset)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
}
```

**验证：** append 异步不阻塞；JSONL 格式正确；按月分文件；清理逻辑正确

---

### 阶段 D：MemoryEventBusBridge 桥接器（Step 4） — 预计 0.3 天

#### D1：实现桥接器

**文件：** `sibylla-desktop/src/main/services/event-bus-bridges.ts`（新建）

```typescript
import type { MemoryEventBus } from './memory/memory-event-bus'
import type { AppEventBus } from './event-bus'
import type { SibyllaEventType } from './event-bus-types'

interface BridgeMapping {
  memoryEvent: string
  sibyllaType: SibyllaEventType
}

const BRIDGE_MAPPINGS: readonly BridgeMapping[] = [
  { memoryEvent: 'memory:checkpoint-completed', sibyllaType: 'memory.checkpoint-completed' },
  { memoryEvent: 'memory:entry-added',          sibyllaType: 'memory.entry-added' },
  { memoryEvent: 'memory:entry-updated',        sibyllaType: 'memory.entry-updated' },
  { memoryEvent: 'memory:entry-deleted',        sibyllaType: 'memory.entry-deleted' },
  { memoryEvent: 'memory:compression-completed', sibyllaType: 'memory.compression-completed' },
] as const

export class MemoryEventBusBridge {
  private readonly disposers: Array<() => void> = []

  constructor(
    private readonly memBus: MemoryEventBus,
    private readonly appBus: AppEventBus,
  ) {
    this.registerBridges()
  }

  private registerBridges(): void {
    for (const mapping of BRIDGE_MAPPINGS) {
      const handler = (payload: unknown) => {
        this.appBus.emitEvent({
          type: mapping.sibyllaType,
          source: 'memory-manager',
          payload,
        })
      }
      this.memBus.on(mapping.memoryEvent, handler)
      this.disposers.push(() => this.memBus.off(mapping.memoryEvent, handler))
    }
  }

  dispose(): void {
    for (const disposer of this.disposers) disposer()
    this.disposers.length = 0
  }
}
```

**验证：** MemoryEventBus 事件正确转发；dispose 后不再转发；不修改 MemoryEventBus 本身

---

### 阶段 E：渲染进程 IPC 事件桥接（Step 5-6） — 预计 1 天

#### E1：IPC 通道常量扩展

**文件：** `sibylla-desktop/src/shared/types.ts`（扩展）

在 `IPC_CHANNELS` 中新增：

```typescript
EVENT_SUBSCRIBE: 'event:subscribe' as const,
EVENT_UNSUBSCRIBE: 'event:unsubscribe' as const,
EVENT_PUSH: 'event:push' as const,
```

在 `IPCChannelMap` 中新增类型签名：

```typescript
'event:subscribe': { params: [types: string[]]; return: { success: boolean } }
'event:unsubscribe': { params: [types?: string[]]; return: { success: boolean } }
```

#### E2：IPC Handler 实现

**文件：** `sibylla-desktop/src/main/ipc/handlers/event.ts`（新建）

**核心数据结构：**

```typescript
// WebContents ID → 订阅的事件类型集合
private readonly subscriptions = new Map<number, Set<SibyllaEventType>>()
private unsubscribeAny?: () => void
```

**关键实现：**

1. `event:subscribe` handler：将 WebContents ID + 事件类型注册到 subscriptions Map
2. `event:unsubscribe` handler：移除指定类型或全部订阅
3. 通过 `appEventBus.subscribeAny()` 注入全局监听，当事件发生时检查哪些 WebContents 订阅了该类型，通过 `webContents.send('event:push', serializedEvent)` 推送
4. 监听 `webContents.on('destroyed')`，自动清理已销毁窗口的订阅
5. 序列化安全：推送前剥离不可序列化字段（函数、循环引用）

#### E3：Preload API 扩展

**文件：** `sibylla-desktop/src/preload/index.ts`（扩展）

1. 在 `ALLOWED_CHANNELS` 白名单中注册 3 个新通道
2. 在 `ElectronAPI` 接口中新增 `events` 命名空间：

```typescript
events: {
  subscribe: (types: string[]) => ipcRenderer.invoke('event:subscribe', types),
  unsubscribe: (types?: string[]) => ipcRenderer.invoke('event:unsubscribe', types),
  on: (callback: (event: SibyllaEvent) => void) => {
    const handler = (_: unknown, data: SibyllaEvent) => callback(data)
    ipcRenderer.on('event:push', handler)
    return () => ipcRenderer.removeListener('event:push', handler)
  },
}
```

**验证：** 渲染进程订阅后收到事件推送；取消订阅后不再收到；窗口销毁后自动清理

---

### 阶段 F：主进程装配（Step 7） — 预计 0.3 天

#### F1：服务初始化顺序

**文件：** `sibylla-desktop/src/main/index.ts`（修改）

在 workspace 初始化阶段，按以下顺序装配：

```typescript
// 1. 创建 EventLogStore（在 workspace 初始化后）
const eventLogStore = new EventLogStore(
  path.join(workspaceRoot, '.sibylla', 'events')
)
await eventLogStore.initialize()

// 2. 注入到 AppEventBus
appEventBus.setEventLogStore(eventLogStore)

// 3. 注入现有 Tracer（已在 line 446 创建）
appEventBus.setTracer(tracer)

// 4. 创建 MemoryEventBusBridge（在 MemoryManager 初始化后）
const memoryBridge = new MemoryEventBusBridge(
  memoryManager.getEventBus(),  // 获取 MemoryEventBus 实例
  appEventBus,
)

// 5. 注册 IPC event handler
const eventHandler = new EventHandler(appEventBus)
eventHandler.register()

// 6. 在 app will-quit 时优雅关闭
app.on('will-quit', async () => {
  memoryBridge.dispose()
  await appEventBus.flushAndShutdown(5000)
})
```

**注意事项：**
- `EventLogStore` 的 `baseDir` 必须在 workspace 初始化后才能确定
- `MemoryEventBusBridge` 的创建必须在 `MemoryManager` 初始化之后
- 现有 `forwardToRenderer` 调用保留不变（向后兼容）

---

### 阶段 G：单元测试（Step 8） — 预计 1 天

#### G1：核心事件总线测试（`event-bus.test.ts`）

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | `emitEvent()` 分发正确性 | handler 收到完整 `SibyllaEvent`，含 ULID id、timestamp、payload |
| 2 | `subscribe()` 精确类型匹配 | 仅收到订阅类型的事件 |
| 3 | `subscribe()` 返回取消函数 | 调用后不再收到事件 |
| 4 | `subscribeAny()` 通配 | 收到所有类型的事件 |
| 5 | 异常隔离 | handler A throw，handler B 仍正常收到 |
| 6 | 异常日志输出 | `console.error` 包含 `event.handler.failed` |
| 7 | 持久化 `persist: true` | mock EventLogStore 的 `append()` 被调用 |
| 8 | 持久化 `persist: false/undefined` | `append()` 不被调用 |
| 9 | 持久化失败不阻塞 | `append()` reject 后分发仍继续 |
| 10 | Trace span 创建 | mock Tracer 的 `withSpan()` 被调用，kind='system' |
| 11 | 桥接映射 | `emitSpanEnded(span)` → `subscribe('trace.span-ended')` 触发 |
| 12 | 背压警告 | 1 秒内发 150 个事件 → `console.warn` 包含 `backpressure.warning` |
| 13 | 优雅关闭 | `flushAndShutdown()` 等待异步 handler 完成 |
| 14 | 优雅关闭超时 | 超时后强制清理 |
| 15 | 关闭后不分发 | `isShuttingDown = true` 后 `emitEvent()` 静默跳过 |

#### G2：桥接器测试（`event-bus-bridges.test.ts`）

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 桥接转发 | MemoryEventBus emit `checkpoint-completed` → AppEventBus 的 handler 收到 `memory.checkpoint-completed` |
| 2 | 所有映射覆盖 | 5 种桥接事件全部转发正确 |
| 3 | source 设置 | 转发事件的 `source` 为 `memory-manager` |
| 4 | dispose 清理 | dispose 后不再转发 |

#### G3：持久化测试（`event-log-store.test.ts`）

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | append 写入 JSONL | 文件内容为 JSON 行格式 |
| 2 | 按月分文件 | 不同月份事件写入不同文件 |
| 3 | read 解析正确 | 读取后返回 `SibyllaEvent[]` |
| 4 | read 跳过无效行 | 空行和格式错误行被忽略 |
| 5 | cleanup 删除旧文件 | 超过月数的文件被删除 |
| 6 | 目录不存在时初始化 | `initialize()` 创建目录 |

#### G4：IPC 桥接测试（`event-handler.test.ts`）

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 订阅后收到推送 | mock WebContents，`event:push` 被发送 |
| 2 | 类型过滤 | 仅推送已订阅类型 |
| 3 | 取消订阅 | 调用后不再推送 |
| 4 | 窗口销毁清理 | WebContents destroyed 后自动移除 |
| 5 | 多窗口独立订阅 | 不同窗口订阅不同类型 |

**覆盖率目标：** ≥ 80%

---

## 五、验收标准追踪

### 通用事件接口

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | `emitEvent<T>()` 方法发布 `SibyllaEvent<T>` | B3 | G1-1 |
| 2 | `subscribe<T>(type, handler)` 返回取消订阅函数 | B4 | G1-2, G1-3 |
| 3 | `subscribeAny(handler)` 接收所有事件 | B4 | G1-4 |
| 4 | 现有 17 个具名方法全部保留且功能不变 | B5（桥接行追加，原有逻辑不动） | G1-11 |
| 5 | 现有 `EventMap` 类型定义不变 | A1（不修改 EventMap） | TypeScript 编译检查 |

### 事件类型目录

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | `SibyllaEventType` 覆盖 6 大领域 | A1 | TypeScript 编译检查 |
| 2 | EventMap → 点分隔桥接映射正确 | A1 `EVENT_MAP_BRIDGE` + B5 | G1-11 |
| 3 | 新事件类型采用点分隔命名 | A1 | TypeScript 编译检查 |

### 异常隔离

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 单个 handler throw 不影响其他 handler | B3 try/catch 隔离 | G1-5 |
| 2 | 异常输出结构化日志 `event.handler.failed` | B3 console.error | G1-6 |

### Trace 集成

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 每个事件发布时创建 Trace span（kind='system'） | B3 Tracer.withSpan | G1-10 |
| 2 | span attributes 包含 `event.id` 和 `event.source` | B3 setAttributes | G1-10 |

### 事件持久化

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | `persist: true` 写入 `.sibylla/events/YYYY-MM.jsonl` | C1 EventLogStore.append | G3-1, G3-2 |
| 2 | 异步写入不阻塞分发 | B3 `.catch()` 模式 | G1-9 |
| 3 | 持久化失败仅 warn 日志 | B3 console.warn | G1-9 |

### 桥接

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | `MemoryEventBusBridge` 转发事件到 AppEventBus | D1 | G2-1, G2-2 |
| 2 | 现有具名方法桥接到统一事件流 | B5 | G1-11 |

### 渲染进程 IPC 桥接

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | `event:subscribe` 订阅指定类型 | E2 | G4-1 |
| 2 | `event:push` 推送事件到渲染进程 | E2 | G4-1, G4-2 |
| 3 | 取消订阅后不再推送 | E2 | G4-3 |

### 背压与关闭

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 流量 > 100/sec 输出 warn | B6 checkBackpressure | G1-12 |
| 2 | 关闭时 flush in-flight handler，5 秒超时 | B6 flushAndShutdown | G1-13, G1-14 |

---

## 六、风险与缓解

| # | 风险 | 影响 | 概率 | 缓解策略 |
|---|------|------|------|---------|
| 1 | **EventMap 类型不约束 EventEmitter** — 现有 `AppEventBus extends EventEmitter` 未使用 `EventMap` 泛型约束，运行时 emit/on 调用无类型保障 | 中 | 已确认 | 本任务不修改现有 EventEmitter 泛型（避免破坏性变更）；Layer 2 的 `emitEvent/subscribe` 提供严格类型安全；后续 Sprint 可考虑迁移到 typed-emitter |
| 2 | **桥接行遗漏** — 部分 EventMap 事件没有 `emit*` 具名方法（如 `datasource:*`、`model:*`），无法通过追加桥接行桥接到统一流 | 中 | 高 | 仅桥接有 `emit*` 方法的事件（~10 个）；无具名方法的事件保留在 Layer 1，后续任务按需追加 |
| 3 | **ULID 依赖引入** — 新增 `ulid` npm 包，需确认与项目构建的兼容性 | 低 | 低 | `ulid` 是零依赖纯 JS 包（~3KB），无 native 模块；若构建冲突，可退化为 `Date.now()-random` 方案 |
| 4 | **IPC 序列化安全** — `event:push` 推送 `SibyllaEvent` 到渲染进程时，payload 可能包含不可序列化对象（函数、循环引用） | 高 | 中 | 在 IPC handler 中对 payload 执行 `JSON.parse(JSON.stringify(event))` 安全序列化；序列化失败时跳过该事件并记录 warn |
| 5 | **MemoryEventBus 内部事件名变更** — 如果后续 Sprint 修改了 MemoryEventBus 的事件名，桥接器会失效 | 中 | 低 | 桥接映射表集中定义在 `BRIDGE_MAPPINGS` 常量中，单点维护；添加集成测试验证映射完整性 |
| 6 | **背压检测精度** — 基于 `Date.now()` 差值的每秒计数器可能在高频调用下不精确 | 低 | 低 | 背压仅为警告机制（不拒绝事件），精度要求不高；如需更精确可改用 `performance.now()` |
| 7 | **优雅关闭竞态** — `flushAndShutdown()` 调用后可能仍有 handler 被触发（handler 尚在事件循环中） | 中 | 中 | `isShuttingDown` 标志位在 `emitEvent()` 入口检查；设置标志后不再分发新事件 |
| 8 | **现有 `forwardToRenderer` 与 IPC 桥接重复** — 同一事件可能通过两条路径到达渲染进程 | 低 | 高 | 设计上接受重复：现有 `forwardToRenderer` 保留（向后兼容），新事件仅通过 IPC 桥接分发；渲染进程消费者按需选择监听方式 |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 | 验证方式 |
|----|------|--------|---------|
| Day 1 上午 | A1 | `event-bus-types.ts` 完成 | `npx tsc --noEmit` 通过 |
| Day 1 下午 | B1-B4 | `emitEvent`/`subscribe`/`subscribeAny` 实现 | 手动调用测试 |
| Day 2 上午 | B5-B6 | 具名方法桥接 + 背压 + 优雅关闭 | 编译通过 + 单元测试 G1 |
| Day 2 下午 | C1 | `EventLogStore` 完成 | 单元测试 G3 |
| Day 3 上午 | D1 | `MemoryEventBusBridge` 完成 | 单元测试 G2 |
| Day 3 下午 | E1-E3 | IPC 桥接（通道 + handler + preload） | 单元测试 G4 |
| Day 4 上午 | F1 | 主进程装配 | 应用启动验证 |
| Day 4 下午 | G1-G4 | 全部单元测试通过 | `npx vitest run` 覆盖率 ≥ 80% |
| Day 5 | — | 集成验证 + Bug 修复 + 文档更新 | 全量回归 |

### 关键里程碑

| 里程碑 | 时间点 | 判定标准 |
|--------|--------|---------|
| M1: 类型基础就绪 | Day 1 结束 | `SibyllaEventType` + `SibyllaEvent<T>` 定义完成，`tsc --noEmit` 通过 |
| M2: 核心事件流可用 | Day 2 结束 | `emitEvent()` → `subscribe()` 链路工作，异常隔离 + 持久化 + Trace 集成 |
| M3: 桥接与 IPC 就绪 | Day 3 结束 | Memory 桥接 + 渲染进程 IPC 桥接全部工作 |
| M4: 全量验收通过 | Day 4 结束 | 所有单元测试通过，覆盖率 ≥ 80%，应用启动正常 |

---

**文档版本**: v1.0
**最后更新**: 2026-04-28
**维护者**: Sibylla 架构团队
