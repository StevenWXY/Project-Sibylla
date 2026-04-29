# 事件总线基础设施扩展

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK001 |
| **任务标题** | 事件总线基础设施扩展 |
| **所属阶段** | Phase 2 - 跨源数据统一与上下文引擎 v2 (Sprint 4) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

在 Sprint 3.3 的 `AppEventBus` 基础上，扩展为全系统级事件中心。定义统一事件类型目录与信封格式，新增通用 `emitEvent()`/`subscribe()`/`subscribeAny()` 接口，建立事件持久化机制与渲染进程 IPC 事件桥接。本任务是 Sprint 4 所有后续任务的地基——统一搜索、ContextEngine v2、双向链接、多端同步均依赖事件总线进行模块间通信。

### 背景

Sprint 3.3 引入了 `AppEventBus`（基于 Node.js EventEmitter），定义了 17 个具名方法（如 `emitSpanEnded`、`emitTaskDeclared`）和 `EventMap` 类型（冒号分隔键如 `trace:span-ended`）。Sprint 3.2 的 `MemoryEventBus` 是记忆模块内部的事件总线。当前系统中存在两个独立事件总线，模块间事件无法互通。

Sprint 4 需要将所有模块连接起来：
- 双向链接需要监听 `file.updated` 事件来更新链接索引
- 统一搜索需要在 `index.completed` 后通知结果刷新
- ContextEngine v2 需要感知 `memory.checkpoint-completed` 事件
- 多端同步需要监听 `git.pull-completed` 事件

**核心设计约束：**

1. **追加式改造**：保留全部 17 个具名方法和 `EventMap` 类型，不破坏任何现有消费者
2. **不引入第三个 EventBus**：扩展现有 `AppEventBus`，通过桥接器连接 `MemoryEventBus`
3. **点分隔命名**：新事件类型采用 `file.updated` 格式，与现有 `trace:span-ended` 通过内部映射表桥接
4. **可选持久化**：`persist: true` 标记的事件写入 JSONL，不侵入核心分发路径
5. **异常隔离**：单个订阅者异常不影响其他订阅者的事件投递
6. **渲染进程桥接**：渲染进程通过 IPC（`event:subscribe`/`event:push`）订阅主进程事件

### 范围

**包含：**

- `SibyllaEventType` 统一事件类型目录（~35 种事件）
- `SibyllaEvent<T>` 统一事件信封接口
- `AppEventBus` 扩展：`emitEvent()`/`subscribe()`/`subscribeAny()` 通用接口
- 现有 17 个具名方法到通用事件流的桥接映射
- `EventLogStore` 事件持久化（JSONL 格式，按月分文件）
- `MemoryEventBusBridge` 桥接器（`MemoryEventBus` → `AppEventBus`）
- 渲染进程 IPC 事件桥接（`event:subscribe`/`event:unsubscribe`/`event:push`）
- 背压机制（事件流量 > 100/sec 时警告）
- 优雅关闭（flush in-flight handlers，5 秒超时）
- 单元测试

**不包含：**

- Sprint 3.3 已有的 `Tracer`、`TraceStore`（本任务仅可选注入 Tracer）
- Sprint 3.2 `MemoryEventBus` 本身的修改
- 各业务模块的事件生产/消费逻辑（由后续 TASK002-005 各自实现）

## 依赖关系

### 前置依赖

- [x] PHASE1-TASK027 — Tracer SDK 与 Trace 持久化存储（`AppEventBus`、`Tracer` 来源）
- [x] PHASE1-TASK022 — MEMORY.md v2 数据层（`MemoryEventBus` 来源）

### 被依赖任务

- [ ] PHASE2-TASK002 — 跨源统一搜索引擎与搜索 UI（消费 `index.*`、`search.executed` 事件）
- [ ] PHASE2-TASK003 — ContextEngine v2 与 AI 主动检索（消费 `memory.*`、`search.executed` 事件）
- [ ] PHASE2-TASK004 — 双向链接系统与文档关系图谱（消费 `file.*`、`wiki-links.updated` 事件）
- [ ] PHASE2-TASK005 — 多端同步增强与跨源引用追溯（消费 `git.pull-completed` 等事件）
- [ ] Sprint 5 — 通知系统（消费 `collab.*`、`notification.*` 事件）
- [ ] Sprint 6 — 工作流触发器（消费 `task.*`、`file.*` 事件）

## 参考文档

- [`specs/requirements/phase2/sprint4-semantic-search.md`](../../requirements/phase2/sprint4-semantic-search.md) — 需求 4.1
- [`specs/requirements/phase1/sprint3.3-trace.md`](../../requirements/phase1/sprint3.3-trace.md) — `AppEventBus` 与 `Tracer` 原始设计
- [`specs/requirements/phase1/sprint3.2-memory.md`](../../requirements/phase1/sprint3.2-memory.md) — `MemoryEventBus` 设计
- [`specs/design/architecture.md`](../../design/architecture.md) — 进程通信架构
- [`CLAUDE.md`](../../../CLAUDE.md) — 可观测性、本地优先、个人空间隔离

## 验收标准

### 通用事件接口

- [ ] `AppEventBus` 新增 `emitEvent<T>()` 方法，发布 `SibyllaEvent<T>` 事件
- [ ] `AppEventBus` 新增 `subscribe<T>(type, handler)` 方法，返回取消订阅函数
- [ ] `AppEventBus` 新增 `subscribeAny(handler)` 方法，接收所有事件
- [ ] 现有 17 个具名方法全部保留且功能不变
- [ ] 现有 `EventMap` 类型定义不变

### 事件类型目录

- [ ] `SibyllaEventType` 定义覆盖 6 大领域：文件系统、记忆、MCP、索引、AI、Wiki Links
- [ ] 现有 EventMap 事件到点分隔命名的桥接映射正确（如 `trace:span-ended` → `trace.span-ended`）
- [ ] 新事件类型采用点分隔命名（如 `file.updated`）

### 异常隔离

- [ ] 单个订阅者 throw 异常时，其他订阅者正常收到事件
- [ ] 异常被捕获并输出结构化日志（`[AppEventBus] event.handler.failed`）

### Trace 集成

- [ ] 每个事件发布时创建 Trace span，kind='system'
- [ ] span attributes 包含 `event.id` 和 `event.source`

### 事件持久化

- [ ] `persist: true` 标记的事件写入 `.sibylla/events/YYYY-MM.jsonl`
- [ ] `EventLogStore.append()` 异步写入不阻塞分发路径
- [ ] 持久化失败仅输出 warn 日志，不影响事件分发

### 桥接

- [ ] `MemoryEventBusBridge` 将 `MemoryEventBus` 的 `checkpoint-completed` 等事件转发到 `AppEventBus`
- [ ] 现有 17 个具名方法内部追加 `emitEvent()` 调用，桥接到统一事件流

### 渲染进程 IPC 桥接

- [ ] 渲染进程可通过 `event:subscribe` IPC 订阅指定类型事件
- [ ] 主进程通过 `event:push` IPC 推送事件到渲染进程
- [ ] 渲染进程取消订阅后不再收到推送

### 背压与关闭

- [ ] 事件流量 > 100/sec 时输出 warn 日志
- [ ] 应用关闭时 flush 所有 in-flight handler，5 秒超时后强制退出

### 单元测试

- [ ] `emitEvent()` 分发正确性测试
- [ ] `subscribe()` / `unsubscribe()` 测试
- [ ] `subscribeAny()` 通配订阅测试
- [ ] 异常隔离测试（单个 handler 异常不影响其他）
- [ ] 持久化测试（`persist: true` 写入 JSONL）
- [ ] 桥接映射测试（具名方法 → `emitEvent` 桥接）
- [ ] `MemoryEventBusBridge` 转发测试
- [ ] 渲染进程 IPC 桥接测试
- [ ] 背压警告测试
- [ ] 优雅关闭测试
- [ ] 覆盖率 ≥ 80%

## 技术策略

### 核心架构：追加式扩展 + 双层分发

```
AppEventBus (Sprint 3.3 已有)
    │
    ├── Layer 1: 现有 EventEmitter + EventMap（不修改）
    │   ├── emit('trace:span-ended', span)     ← 现有路径
    │   ├── emit('progress:task-declared', t)  ← 现有路径
    │   └── ... (17 个具名方法)
    │
    └── Layer 2: 统一事件流（本 Sprint 新增）
        ├── unifiedHandlers: Map<SibyllaEventType, Set<EventHandler>>
        ├── wildcards: Set<EventHandler>
        ├── emitEvent<T>() → Trace + 持久化 + 分发
        ├── subscribe<T>() → 注册到 unifiedHandlers
        └── subscribeAny() → 注册到 wildcards
            │
            └── 桥接：现有具名方法末尾追加 emitEvent() 调用
                emitSpanEnded(span) {
                  this.emit('trace:span-ended', span)     // 原有
                  this.emitEvent({ type: 'trace.span-ended', ... })  // 新增桥接
                }
```

### 事件信封设计

```
SibyllaEvent<T>
    ├── id: string (ULID)          ← 全局唯一，用于持久化和追溯
    ├── type: SibyllaEventType     ← 点分隔命名
    ├── source: string             ← 发起模块标识
    ├── timestamp: number          ← Date.now()
    ├── payload: T                 ← 业务数据（泛型）
    ├── workspaceId?: string       ← workspace 上下文
    ├── traceId?: string           ← 关联 Trace span
    └── persist?: boolean          ← 是否持久化到 JSONL
```

### 渲染进程事件桥接

```
渲染进程                          主进程
    │                              │
    │── event:subscribe(type) ────>│── 注册渲染进程回调
    │                              │
    │                              │── emitEvent() 触发
    │                              │── webContents.send('event:push', event)
    │<─ event:push(event) ─────────│
    │                              │
    │── event:unsubscribe() ──────>│── 移除回调
```

### 依赖注入方案

```
AppEventBus 构造函数不变（零参数）
    │
    ├── setEventLogStore(store)    ← 可选注入，Sprint 4 的 EventLogStore
    ├── setTracer(tracer)          ← 可选注入，Sprint 3.3 的 Tracer
    │
    └── 两个依赖均通过 setter 注入，不修改构造函数签名
```

### 依赖库选型

| 用途 | 库 | 说明 |
|------|-----|------|
| ULID 生成 | `ulid`（需新增） | 比 UUID 更适合事件排序（时间戳前缀） |
| 持久化格式 | JSONL（内置） | 每行一个 JSON 事件，append-only |
| 事件分发 | Node.js `events`（已有） | 现有 EventEmitter 基础 |

## 技术执行路径

### 步骤 1：定义统一事件类型与信封

**文件：** `src/main/services/event-bus-types.ts`（新建）

1. 定义 `SibyllaEventType` 联合类型，覆盖 6 大领域共 ~35 种事件类型
2. 定义 `SibyllaEvent<T>` 接口，包含 id/type/source/timestamp/payload/workspaceId/traceId/persist
3. 定义 `EventHandler<T>` 类型别名
4. 定义 `EventMap` 到 `SibyllaEventType` 的桥接映射常量 `EVENT_MAP_BRIDGE: Record<string, SibyllaEventType>`

**验证：** TypeScript 类型检查通过，无 `any`

### 步骤 2：扩展 AppEventBus 通用事件接口

**文件：** `src/main/services/event-bus.ts`（修改，追加式）

1. 在 `AppEventBus` 类中新增私有属性：
   - `unifiedHandlers: Map<SibyllaEventType, Set<EventHandler>>`
   - `wildcards: Set<EventHandler>`
   - `eventLogStore?: EventLogStore`
   - `tracer?: Tracer`

2. 新增 setter 注入方法：
   - `setEventLogStore(store: EventLogStore): void`
   - `setTracer(tracer: Tracer): void`

3. 新增 `emitEvent<T>()` 方法：
   - 生成 ULID id 和 timestamp
   - 可选注入 Tracer → 创建 kind='system' 的 span
   - 可选 persist → 异步写入 EventLogStore
   - 遍历 targeted handlers + wildcards，逐个 try/catch 调用

4. 新增 `subscribe<T>()` 方法：
   - 注册到 `unifiedHandlers` 对应类型的 Set
   - 返回取消订阅函数

5. 新增 `subscribeAny()` 方法：
   - 注册到 `wildcards` Set
   - 返回取消订阅函数

6. 现有具名方法桥接：在每个现有具名方法（如 `emitSpanEnded`）末尾追加一行 `this.emitEvent()` 调用

**验证：** 现有 17 个具名方法的消费者行为不变；新增方法类型安全

### 步骤 3：实现 EventLogStore 事件持久化

**文件：** `src/main/services/event-log-store.ts`（新建）

1. 定义 `EventLogStore` 类：
   - 构造函数接收 `baseDir: string`（默认 `.sibylla/events/`）
   - 确保 baseDir 目录存在

2. 实现 `append(event: SibyllaEvent): Promise<void>` 方法：
   - 按 `YYYY-MM` 格式确定目标文件名（如 `2026-04.jsonl`）
   - 使用 `fs.appendFile` 追加一行 JSON（`JSON.stringify(event) + '\n'`）
   - 写入失败时 reject，由调用方 catch 处理

3. 实现 `read(month: string): Promise<SibyllaEvent[]>` 方法（用于未来回放功能）：
   - 读取指定月份的 JSONL 文件
   - 逐行 JSON.parse，跳过空行和格式错误的行

4. 实现 `cleanup(olderThanMonths: number): Promise<number>` 方法：
   - 删除超过指定月份的事件日志文件
   - 返回删除的文件数量

**验证：** 事件持久化写入正确、append-only 行为正确、文件按月分割

### 步骤 4：实现 MemoryEventBusBridge 桥接器

**文件：** `src/main/services/event-bus-bridges.ts`（新建）

1. 定义 `MemoryEventBusBridge` 类：
   - 构造函数接收 `memBus: MemoryEventBus` 和 `appBus: AppEventBus`
   - 在构造函数中注册桥接监听

2. 桥接 `MemoryEventBus` 事件到 `AppEventBus`：
   - `checkpoint-completed` → `memory.checkpoint-completed`
   - `entry-added` → `memory.entry-added`
   - `entry-updated` → `memory.entry-updated`
   - `entry-deleted` → `memory.entry-deleted`
   - `compression-completed` → `memory.compression-completed`

3. 桥接时设置 `source: 'memory-manager'`

4. 提供 `dispose()` 方法，移除所有桥接监听

**验证：** MemoryEventBus 事件正确转发到 AppEventBus，不修改 MemoryEventBus 本身

### 步骤 5：实现背压与优雅关闭

**文件：** `src/main/services/event-bus.ts`（修改，追加式）

1. 背压机制：
   - 新增私有属性 `emitCounter: number` 和 `lastCountReset: number`
   - 在 `emitEvent()` 中递增计数器
   - 每秒重置计数器，若上一秒 > 100 则输出 `console.warn`
   - 不拒绝事件，仅警告（避免中断业务逻辑）

2. 优雅关闭：
   - 新增 `async flushAndShutdown(timeoutMs: number = 5000): Promise<void>` 方法
   - 等待所有 in-flight 的异步 handler 完成（使用 Promise.race + setTimeout）
   - 超时后强制清理所有订阅者

**验证：** 背压警告触发正确；关闭流程在超时内完成

### 步骤 6：实现渲染进程 IPC 事件桥接

**文件：** `src/main/ipc/handlers/event.ts`（新建）

1. 定义渲染进程事件订阅数据结构：
   - 维护 `Map<WebContentsID, Map<SibyllaEventType, Set<callback>>>` 注册表
   - 或简化为 `Map<WebContentsID, Set<SibyllaEventType>>` + 通过 `subscribeAny` 统一转发

2. 注册 IPC handler：

   **`event:subscribe`（Renderer → Main）：**
   - 接收 `types: SibyllaEventType[]`
   - 将该 WebContents 注册到对应事件类型的推送列表
   - 返回成功确认

   **`event:unsubscribe`（Renderer → Main）：**
   - 接收 `types?: SibyllaEventType[]`（空则取消全部）
   - 从推送列表移除该 WebContents

3. 在 `AppEventBus.subscribeAny()` 中注入 IPC 推送逻辑：
   - 每个事件被分发时，检查是否有渲染进程订阅了该类型
   - 如有，通过 `webContents.send('event:push', event)` 推送
   - 仅推送已序列化的纯对象版本（剥离函数等不可序列化字段）

4. 处理 WebContents 销毁：
   - 监听 `webContents.on('destroyed')`，自动清理注册表

**文件：** `src/preload/index.ts`（修改，扩展）

5. 新增 `events` 命名空间：
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

**文件：** `src/shared/types.ts`（修改，扩展）

6. 新增 IPC 通道常量：
   ```typescript
   EVENT_SUBSCRIBE: 'event:subscribe',
   EVENT_UNSUBSCRIBE: 'event:unsubscribe',
   EVENT_PUSH: 'event:push',
   ```

**验证：** 渲染进程通过 IPC 订阅事件后能正确接收推送；取消订阅后不再收到

### 步骤 7：主进程装配

**文件：** `src/main/main.ts` 或服务装配文件（修改）

1. 创建 `EventLogStore` 实例，注入到 `AppEventBus`
2. 注入现有 `Tracer` 实例到 `AppEventBus`
3. 创建 `MemoryEventBusBridge` 实例，连接两个 EventBus
4. 注册 `event.ts` IPC handler
5. 在 app `will-quit` 事件中调用 `appEventBus.flushAndShutdown()`

**验证：** 应用启动后事件总线完整运行；关闭时优雅 flush

### 步骤 8：单元测试

**文件：** `tests/main/services/event-bus.test.ts`（新建）

1. **`emitEvent()` 分发测试**：发布事件后，已注册的 handler 收到完整 `SibyllaEvent`，包含 ULID id、timestamp、payload

2. **`subscribe()` / `unsubscribe()` 测试**：注册后收到事件；取消注册后不再收到

3. **`subscribeAny()` 测试**：通配 handler 收到所有类型事件

4. **异常隔离测试**：handler A throw Error，handler B 仍正常收到后续事件

5. **持久化测试**：`persist: true` 事件写入 JSONL 文件；`persist: false` 不写入；写入失败不阻塞分发

6. **桥接映射测试**：调用 `emitSpanEnded(span)` 后，`subscribe('trace.span-ended', handler)` 的 handler 被触发

7. **`MemoryEventBusBridge` 测试**：MemoryEventBus emit `checkpoint-completed` 后，AppEventBus 的 `memory.checkpoint-completed` handler 被触发

8. **渲染进程 IPC 桥接测试**：mock WebContents，验证 `event:push` 发送正确

9. **背压测试**：快速发布 150 个事件，验证 warn 日志输出

10. **优雅关闭测试**：验证 `flushAndShutdown()` 在超时内完成

**覆盖率目标：** ≥ 80%

## 现有代码基础

| 已有模块 | 文件路径 | 本任务使用方式 |
|---------|---------|-------------|
| AppEventBus | `src/main/services/event-bus.ts`（Sprint 3.3） | 追加式扩展，保留全部现有方法 |
| Tracer | `src/main/services/trace/tracer.ts`（Sprint 3.3） | 可选注入，用于事件 Trace span |
| MemoryEventBus | `src/main/services/memory/memory-event-bus.ts`（Sprint 3.2） | 不修改，通过桥接器转发 |
| MemoryManager | `src/main/services/memory-manager.ts` | 桥接器的 MemoryEventBus 来源 |
| shared/types.ts | `src/shared/types.ts` | 扩展 IPC 通道常量 |
| preload/index.ts | `src/preload/index.ts` | 扩展 events 命名空间 |

**完全缺失、需新建的模块：**

| 模块 | 说明 |
|------|------|
| `event-bus-types.ts` | 统一事件类型目录与信封接口 |
| `event-log-store.ts` | 事件 JSONL 持久化 |
| `event-bus-bridges.ts` | MemoryEventBus → AppEventBus 桥接器 |
| `ipc/handlers/event.ts` | 渲染进程 IPC 事件桥接 |

## 新增 IPC 通道

| IPC 通道 | 方向 | 说明 |
|---------|------|------|
| `event:subscribe` | Renderer → Main | 渲染进程订阅指定类型事件 |
| `event:unsubscribe` | Renderer → Main | 渲染进程取消订阅 |
| `event:push` | Main → Renderer | 主进程推送事件到渲染进程 |

## 涉及的现有文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/main/services/event-bus.ts` | 扩展（追加） | 新增通用事件接口 + 具名方法桥接 |
| `src/shared/types.ts` | 扩展 | 新增 EVENT_* IPC 通道常量 |
| `src/preload/index.ts` | 扩展 | 新增 events 命名空间 |
| `src/main/main.ts`（或装配文件） | 修改 | 注入 EventLogStore、Tracer、Bridge |

**不修改的文件：**
- `src/main/services/memory/memory-event-bus.ts` — 通过桥接器转发，不直接修改
- `src/main/services/trace/tracer.ts` — 可选注入，不修改

---

**创建时间：** 2026-04-27
**最后更新：** 2026-04-27
**更新记录：**
- 2026-04-27 — 创建任务文档（含完整技术执行路径 8 步）
