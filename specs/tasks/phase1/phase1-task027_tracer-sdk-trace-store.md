# Tracer SDK 与 Trace 持久化存储

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK027 |
| **任务标题** | Tracer SDK 与 Trace 持久化存储 |
| **所属阶段** | Phase 1 - Trace 系统、任务台账与可观测性 (Sprint 3.3) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

构建 Sprint 3.3 的基础设施层——实现统一的 Tracer SDK（Span 创建、嵌套、属性记录、事件挂载、状态标记）和 Trace 持久化存储（独立 SQLite trace.db），完成 AppEventBus 全局事件总线，并将 Tracer 注入到 Sprint 3.1 Harness 组件和 Sprint 3.2 记忆系统中。这是所有后续可观测性功能的地基。

### 背景

Sprint 3.1 的 Harness 状态机已具备 `appendHarnessTrace` 写入 MemoryManager 的能力，但这是扁平的事件追加，无法构建层次化的执行链路。Sprint 3.3 引入 OTel 数据模型兼容的 Span 层次化模型，让每一次 AI 调用的完整生命周期——上下文组装、Guardrail 检查、LLM 调用、Sensor 评估、Evaluator 审查、文件写入——都可以追溯为嵌套的 Span 树。

**现有代码关键约束：**

| 维度 | 现状 | TASK027 改造 |
|------|------|-------------|
| Trace 事件 | `appendHarnessTrace()` 写入 MemoryManager 日志 | 保留双写，新增 Tracer Span 通道 |
| 持久化 | 无独立 Trace 存储 | 新增 `.sibylla/trace/trace.db` SQLite |
| 事件总线 | `MemoryEventBus` 仅限记忆模块内部 | 新增 `AppEventBus` 全局总线，不修改 MemoryEventBus |
| HarnessOrchestrator | 同步执行，无 Span 包裹 | 可选注入 Tracer，`execute()` 可用 `withSpan` 包裹 |
| ContextEngine | 无 Tracer 集成 | 可选注入，`assembleContext()` 产生 Span |
| FileManager | 无 Tracer 集成 | 可选注入，`atomicWrite()` 产生 Span |

### 范围

**包含：**
- `types.ts` — Span / SpanContext / SpanEvent / SerializedSpan / SpanKind / SpanStatus 全部类型
- `no-op-span.ts` — 禁用模式下的零开销空实现
- `span-impl.ts` — SpanImpl 具体实现（属性存储、事件追加、状态管理、finalized 标记）
- `tracer.ts` — Tracer 主类（startSpan / withSpan / onSpanEnd / flush / 序列化 / 脱敏 / 超时检查）
- `trace-store.ts` — SQLite 持久化（schema、写入、查询、清理、锁定、导出、完整性检查）
- `event-bus.ts` — AppEventBus 全局事件总线
- `index.ts` — 统一导出
- Sprint 3.1 集成改造 — HarnessOrchestrator / GuardrailEngine / Sensor / Evaluator 可选注入 Tracer
- Sprint 3.2 集成改造 — EvolutionEvent.traceSpanId 扩展 + MemoryManager.getSnapshotAt()
- ContextEngine 可选注入 — 上下文组装产生 Span
- FileManager 可选注入 — 文件写入产生 Span
- `shared/types.ts` 扩展 — AIStreamEnd.traceId / HarnessResult.traceId / 新增 IPC 通道常量
- `src/main/index.ts` 扩展 — Tracer / TraceStore / AppEventBus 初始化与生命周期
- 单元测试

**不包含：**
- ProgressLedger（TASK028）
- ExecutionTrace UI（TASK029）
- TraceInspector UI（TASK029）
- PerformanceMonitor（TASK029）
- ReplayEngine（TASK029）
- TraceExporter（TASK029）

## 验收标准

### Tracer SDK 核心 API

- [ ] `tracer.startSpan(name)` 返回 Span handle，含唯一 span_id 和自动生成的 trace_id
- [ ] 带 parent SpanContext 创建 Span 时，设置 parent_span_id 并继承 trace_id
- [ ] `span.setAttribute(key, value)` 存储属性；对象值 JSON 序列化，最大深度 5，最大长度 10KB（超限截断并标记）
- [ ] `span.addEvent(name, attrs)` 记录事件，带当前时间戳
- [ ] `span.end()` 计算 duration_ms，异步发送到持久化层，标记 finalized
- [ ] `span.end()` 重复调用时记录 warning 并忽略（幂等性）
- [ ] `span.setStatus('error', message)` 存储 status 和 message
- [ ] `tracer.withSpan(name, fn)` 自动调用 end() 和错误捕获
- [ ] Span 超过 5 分钟未 end() 时自动标为 `error: span timeout` 并记录 warning
- [ ] 禁用模式下所有操作为 no-op，单次调用开销 < 100 纳秒

### 敏感字段脱敏

- [ ] 默认敏感模式覆盖：`*_token`、`*_key`、`password`、`credential*`、`api_key`、`secret*`
- [ ] 匹配的属性值替换为 `[REDACTED]`
- [ ] 序列化时对 attributes 和 events.attributes 均执行脱敏

### 缓冲与降级

- [ ] 持久化层不可用时，内存缓冲最多 1000 个 Span
- [ ] 缓冲区满时丢弃最旧 Span 并记录 warning
- [ ] `flush()` 批量写出缓冲区内容（每批 100 个）
- [ ] Trace 写入失败不阻塞主流程

### TraceStore 持久化

- [ ] trace.db 独立 SQLite，启用 WAL 模式
- [ ] 表结构含 spans 表 + locked_traces 表 + 6 个索引
- [ ] 单条 Span 写入完成于 1 秒内
- [ ] 批量写入使用事务（batch commit），吞吐 > 1000 spans/sec
- [ ] 按 trace_id 查询完整 Span 树 < 50ms（< 100 spans）
- [ ] 按时间范围 + 属性过滤查询 < 200ms（< 1M rows）
- [ ] 锁定 trace 永不被清理
- [ ] 每日清理删除超过 retention_days 的 Span（默认 7 天），排除 locked_traces
- [ ] 数据库大小超过 500MB 时记录 warning
- [ ] 数据库损坏时重命名为 `trace.db.corrupted-{timestamp}` 并重建

### AppEventBus

- [ ] `emitSpanEnded(span)` / `emitTaskDeclared(task)` / `emitPerformanceAlert(alert)` 等方法可用
- [ ] 独立于 MemoryEventBus，不修改 MemoryEventBus

### Sprint 3.1 集成（双写过渡）

- [ ] HarnessOrchestrator 新增 `setTracer(tracer)` 可选注入
- [ ] Tracer 可用时，`execute()` 用 `withSpan('ai.handle-message')` 包裹，生成 OTel traceId
- [ ] Tracer 不可用时，fallback 到现有 harness-xxx traceId，行为不变
- [ ] `this.trace()` 双写：同时写入 MemoryManager + 当前 Span 作为 event
- [ ] GuardrailEngine / Sensor / Evaluator 各自可选注入 Tracer，用 `withSpan('harness.xxx')` 包裹
- [ ] HarnessResult 新增可选 `traceId` 字段

### Sprint 3.2 集成

- [ ] EvolutionEvent 接口新增可选 `traceSpanId` 字段（主定义 + IPC 镜像同步）
- [ ] evolution-log.ts 的 `parseEvent()` 增加 traceSpanId 字段提取
- [ ] MemoryManager 新增 `getSnapshotAt(date)` 方法（回放引擎依赖）
- [ ] MemoryManager 写入演化日志时传入可选 `traceSpanId`

### ContextEngine 集成

- [ ] ContextEngine 新增 `setTracer(tracer)` 可选注入
- [ ] `assembleContext()` / `assembleForHarness()` 用 `withSpan('context.assemble')` 包裹
- [ ] Tracer 未注入时无行为变更

### FileManager 集成

- [ ] FileManager 新增 `setTracer(tracer)` 可选注入
- [ ] `atomicWrite()` 产生 `tool.file-write` Span
- [ ] Tracer 未注入时无行为变更

### IPC 通道注册

- [ ] 新增 IPC_CHANNELS 常量追加到 `shared/types.ts`
- [ ] IPCChannelMap 类型映射同步新增
- [ ] 不修改任何已有 IPC 通道定义

### 性能与可靠性

- [ ] startSpan < 100μs
- [ ] 批量写入 > 1000 spans/sec
- [ ] Trace 写入失败不阻塞主流程

## 依赖关系

### 前置依赖

- [x] Sprint 3.1 Harness 基础设施（TASK017-021）— Guardrails / Sensors / Evaluators 是 Trace 的主要生产方
- [x] Sprint 3.2 记忆系统 v2（TASK022-026）— 演化日志新增 traceSpanId 交叉引用
- [x] MemoryManager v1/v2（`src/main/services/memory-manager.ts`）
- [x] HarnessOrchestrator（`src/main/services/harness/orchestrator.ts`）
- [x] ContextEngine（`src/main/services/context-engine.ts`）
- [x] FileManager（`src/main/services/file-manager.ts`）
- [x] DatabaseManager 模式参照（`src/main/services/database-manager.ts`）

### 被依赖任务

- TASK028（progress.md 任务台账）— 依赖 Tracer、TraceStore、AppEventBus
- TASK029（可观测性 UI）— 依赖 TraceStore 查询接口、IPC 通道

## 参考文档

- [`specs/requirements/phase1/sprint3.3-trace.md`](../../requirements/phase1/sprint3.3-trace.md) — 需求 3.3.1 + 3.3.2 + §4 技术约束 + §4.7 兼容性约束
- [`specs/design/architecture.md`](../../design/architecture.md) — 模块划分、进程通信架构
- [`specs/design/data-and-api.md`](../../design/data-and-api.md) — IPC 通信接口
- [`CLAUDE.md`](../../../CLAUDE.md) — 文件即真相、原子写入、TypeScript 严格模式
- `.kilocode/skills/phase1/sqlite-local-storage/SKILL.md` — SQLite WAL 模式、索引策略、better-sqlite3 最佳实践
- `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` — IPC 类型安全设计模式
- `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` — 类型设计规范

## 技术执行路径

### 架构设计

```
Tracer SDK 整体架构

src/main/services/
├── event-bus.ts                    ← AppEventBus（新建）
│   └── emitSpanEnded / emitTaskDeclared / emitPerformanceAlert / emitPerformanceMetrics
│
├── trace/                          ← Trace 系统（新建目录）
│   ├── types.ts                    ← Span / SpanContext / SpanEvent / SerializedSpan / SpanKind / SpanStatus
│   ├── no-op-span.ts               ← 禁用模式零开销空实现
│   ├── span-impl.ts                ← SpanImpl 具体实现
│   ├── tracer.ts                   ← Tracer 主类
│   ├── trace-store.ts              ← SQLite 持久化
│   └── index.ts                    ← 统一导出
│
└── (现有模块扩展 — 可选注入 Tracer)
    ├── harness/orchestrator.ts      ← setTracer() + withSpan 包裹
    ├── harness/guardrails/*.ts      ← setTracer() + withSpan 包裹
    ├── context-engine.ts            ← setTracer() + withSpan 包裹
    ├── file-manager.ts              ← setTracer() + withSpan 包裹
    └── memory-manager.ts            ← getSnapshotAt() + traceSpanId 传入

数据流向：

startSpan(name, parent?)
  → SpanImpl 创建，加入 activeSpans Map
  → setAttribute / addEvent / setStatus 操作 SpanImpl 内部状态
  → end()
    → activeSpans 删除
    → serialize(span) → redactAttributes → truncateIfLarge
    → persistAsync(serialized)
      → TraceStore.write(span) 成功 → 完毕
      → TraceStore.write(span) 失败 → buffer.push(span)
        → buffer.length > bufferLimit → buffer.shift() + warn
    → eventBus.emitSpanEnded(serialized)

checkTimeouts (每 30s)
  → 遍历 activeSpans
  → 超时 span → setStatus('error', 'span timeout') → end()

flush (shutdown / 定期)
  → buffer.splice(0, 100) → TraceStore.writeBatch(batch)
  → 失败 → buffer.unshift(...batch) + break
```

### 步骤 1：定义 Trace 共享类型

**文件：** `src/main/services/trace/types.ts`

1. 定义 `SpanStatus` 联合类型：`'ok' | 'error' | 'unset'`
2. 定义 `SpanKind` 联合类型：`'internal' | 'ai-call' | 'tool-call' | 'user-action' | 'system'`
3. 定义 `SpanContext` 接口：traceId（16-byte hex）、spanId（8-byte hex）、parentSpanId?
4. 定义 `SpanEvent` 接口：name、timestamp（epoch ms）、attributes
5. 定义 `SerializedSpan` 接口：traceId、spanId、parentSpanId?、name、kind、startTimeMs、endTimeMs、durationMs、status、statusMessage?、attributes、events、conversationId?、taskId?、userId?、workspaceId?
6. 定义 `Span` 接口（公开 API）：readonly context、name、kind；setAttribute / setAttributes / addEvent / setStatus / end / isFinalized 方法
7. 定义 `TracerConfig` 接口：enabled、spanTimeoutMs（默认 300000）、bufferLimit（默认 1000）、sensitiveKeyPatterns（RegExp[]）、propagateErrorToParent（默认 true）
8. 定义 `DEFAULT_SENSITIVE_PATTERNS` 常量数组：
   - `/.*_token$/i`
   - `/.*_key$/i`
   - `/^password$/i`
   - `/^credential.*/i`
   - `/^api_key$/i`
   - `/^secret.*/i`
9. 定义 `TraceQueryFilter` 接口：traceId?、spanName?、kind?、status?、conversationId?、taskId?、startTimeFrom?、startTimeTo?、minDurationMs?、attributeFilters?、limit?、offset?
10. 导出所有类型和常量

### 步骤 2：实现 NoOpSpan 空实现

**文件：** `src/main/services/trace/no-op-span.ts`

1. 实现 `NO_OP_SPAN` 常量，满足 `Span` 接口
2. 所有方法为空函数体，无副作用
3. `context` 返回固定空值（traceId: '', spanId: ''）
4. `isFinalized()` 返回 `true`（阻止重复操作）
5. `setAttribute` / `setAttributes` / `addEvent` / `setStatus` / `end` 均为 `() => {}`
6. 确保性能开销 < 100ns：方法体内不做任何计算或条件判断
7. 导出 `NO_OP_SPAN` 单例

### 步骤 3：实现 SpanImpl

**文件：** `src/main/services/trace/span-impl.ts`

1. 构造函数接收 `SpanInitData`：context、name、kind、startTimeMs、attributes（初始）、conversationId?、taskId?、tracer（引用回 Tracer）
2. 内部状态：
   - `attributes: Map<string, unknown>` — 属性存储
   - `events: SpanEvent[]` — 事件列表
   - `status: SpanStatus` — 默认 `'unset'`
   - `statusMessage?: string`
   - `endTimeMs?: number`
   - `finalized: boolean` — 默认 `false`
3. 实现 `setAttribute(key, value)`：
   - 若 finalized，记录 warning 并返回
   - 若 value 为对象且非 null，调用 `JSON.stringify(value)` 序列化，检查深度 ≤ 5、长度 ≤ 10KB
   - 超限时截断并追加 `[TRUNCATED]` 标记
   - 存入 attributes Map
4. 实现 `setAttributes(attrs)`：
   - 遍历 entries 调用 `setAttribute`
5. 实现 `addEvent(name, attributes?)`：
   - 若 finalized，记录 warning 并返回
   - 创建 SpanEvent：name、timestamp = Date.now()、attributes = attributes ?? {}
   - 追加到 events 数组
6. 实现 `setStatus(status, message?)`：
   - 若 finalized，记录 warning 并返回
   - 设置 this.status 和 this.statusMessage
   - 若 status === 'error' 且 tracer.config.propagateErrorToParent 且存在 parentSpan：
     - 调用 `tracer.startSpan('error-propagation', { parent: this.context, kind: 'internal' })`
     - 该 propagation span 自动 setStatus('error') 并 end()
7. 实现 `end()`：
   - 若 finalized，记录 warning 并返回（幂等性）
   - 设置 `this.endTimeMs = Date.now()`
   - 标记 `this.finalized = true`
   - 调用 `this.tracer.onSpanEnd(this)` 触发序列化和持久化
8. 实现 `isFinalized()`：
   - 返回 `this.finalized`
9. 实现 `durationMs` getter：
   - 若 endTimeMs 存在，返回 `endTimeMs - startTimeMs`
   - 否则返回 `Date.now() - startTimeMs`

### 步骤 4：实现 Tracer 主类

**文件：** `src/main/services/trace/tracer.ts`

1. 构造函数注入 config: TracerConfig、persistence: TraceStore、eventBus: AppEventBus、logger: Logger
2. 内部状态：
   - `activeSpans: Map<string, SpanImpl>` — 活跃 Span 索引
   - `buffer: SerializedSpan[]` — 持久化失败缓冲
   - `timeoutChecker?: NodeJS.Timeout` — 超时检查定时器
3. 实现 `start()` 方法：
   - 启动 `setInterval(checkTimeouts, 30000)` 存储为 timeoutChecker
4. 实现 `stop()` 方法：
   - 清除 timeoutChecker
   - 返回 `this.flush()` Promise
5. 实现 `isEnabled()` 方法：返回 `this.config.enabled`
6. 实现 `startSpan(name, options?)` 方法：
   - 若 `!this.config.enabled`，返回 `NO_OP_SPAN`
   - traceId = options?.parent?.traceId ?? `generateTraceId()`
   - spanId = `generateSpanId()`
   - 创建 SpanImpl 实例，设置 context、name、kind（默认 'internal'）、startTimeMs、初始 attributes、conversationId、taskId
   - 存入 `activeSpans.set(spanId, span)`
   - 返回 span
7. 实现 `withSpan<T>(name, fn, options?)` 方法：
   - 调用 `this.startSpan(name, options)`
   - try：执行 `await fn(span)`，若 status === 'unset' 则 setStatus('ok')，返回 result
   - catch：setStatus('error', String(err))，setAttribute('error.stack', err.stack)，re-throw
   - finally：span.end()
8. 实现 `onSpanEnd(span: SpanImpl)` 方法：
   - `this.activeSpans.delete(span.context.spanId)`
   - `const serialized = this.serialize(span)`
   - `this.persistAsync(serialized)`
   - `this.eventBus.emitSpanEnded(serialized)`
9. 实现 `generateTraceId()` 方法：
   - 使用 `crypto.randomBytes(16).toString('hex')` 生成 32 字符 hex
10. 实现 `generateSpanId()` 方法：
    - 使用 `crypto.randomBytes(8).toString('hex')` 生成 16 字符 hex
11. 实现 `serialize(span: SpanImpl): SerializedSpan` 方法：
    - 映射所有字段到 SerializedSpan 结构
    - 对 attributes 和 events.attributes 调用 `redactAttributes()`
12. 实现 `redactAttributes(attrs): Record<string, unknown>` 方法：
    - 遍历 entries
    - 若 key 匹配 `config.sensitiveKeyPatterns` 任一模式，值替换为 `'[REDACTED]'`
    - 否则调用 `truncateIfLarge(value)`
13. 实现 `truncateIfLarge(value): unknown` 方法：
    - 若为字符串且长度 > 10240，截断并追加 `...[TRUNCATED:${originalLength}chars]`
    - 若为对象/数组，JSON.stringify 后检查长度
14. 实现 `persistAsync(span: SerializedSpan)` 方法：
    - try：`await this.persistence.write(span)`
    - catch：`this.buffer.push(span)`
    - 若 buffer.length > config.bufferLimit：
      - `const dropped = this.buffer.shift()`
      - `this.logger.warn('trace.buffer.overflow.dropped', { droppedSpanId: dropped?.spanId })`
15. 实现 `checkTimeouts()` 方法：
    - `const now = Date.now()`
    - 遍历 `this.activeSpans.entries()`
    - 若 `now - span.startTimeMs > this.config.spanTimeoutMs`：
      - `this.logger.warn('trace.span.timeout', { spanId, name: span.name })`
      - `span.setStatus('error', 'span timeout')`
      - `span.end()`（触发 onSpanEnd，从 activeSpans 删除）
    - 注意：遍历时不能直接修改 Map，使用 `Array.from()` 复制 entries 再遍历
16. 实现 `flush(): Promise<void>` 方法：
    - while `this.buffer.length > 0`：
      - `const batch = this.buffer.splice(0, 100)`
      - try：`await this.persistence.writeBatch(batch)`
      - catch：`this.buffer.unshift(...batch)` + `this.logger.error(...)` + break

### 步骤 5：实现 TraceStore 持久化

**文件：** `src/main/services/trace/trace-store.ts`

1. 构造函数注入 workspaceRoot: string、logger: Logger
2. 内部状态：`db: Database`（better-sqlite3 实例）
3. 实现 `storePath()` 方法：
   - 返回 `path.join(workspaceRoot, '.sibylla/trace/trace.db')`
4. 实现 `initialize()` 方法：
   - 确保目录存在（`mkdir recursive`）
   - 执行完整性检查 `runIntegrityCheck()`
   - 打开 SQLite：`openSQLite(this.storePath(), { mode: 'wal' })`
   - 执行建表 SQL：
     - `spans` 表：trace_id TEXT NOT NULL、span_id TEXT PRIMARY KEY、parent_span_id TEXT、name TEXT NOT NULL、kind TEXT NOT NULL、start_time_ms INTEGER NOT NULL、end_time_ms INTEGER NOT NULL、duration_ms INTEGER NOT NULL、status TEXT NOT NULL、status_message TEXT、attributes TEXT NOT NULL（JSON）、events TEXT NOT NULL（JSON array）、conversation_id TEXT、task_id TEXT、workspace_id TEXT
     - `locked_traces` 表：trace_id TEXT PRIMARY KEY、locked_at INTEGER NOT NULL、reason TEXT
     - 6 个索引：
       - `idx_trace_id ON spans(trace_id)`
       - `idx_start_time ON spans(start_time_ms DESC)`
       - `idx_conversation ON spans(conversation_id, start_time_ms DESC)`
       - `idx_task ON spans(task_id)`
       - `idx_status_duration ON spans(status, duration_ms DESC)`
       - `idx_name_time ON spans(name, start_time_ms DESC)`
   - 执行 `PRAGMA journal_mode=WAL` 和 `PRAGMA synchronous=NORMAL`
5. 实现 `write(span: SerializedSpan)` 方法：
   - 使用 `db.prepare().run(...)` 插入或替换
   - attributes 和 events 字段 JSON.stringify
   - conversation_id / task_id / status_message 为 null 若不存在
6. 实现 `writeSync(span: SerializedSpan)` 方法：
   - 同步版本，用于事务内调用
7. 实现 `writeBatch(spans: SerializedSpan[])` 方法：
   - 使用 `db.transaction()` 包裹
   - 事务内遍历调用 `writeSync()`
8. 实现 `getTraceTree(traceId: string)` 方法：
   - `SELECT * FROM spans WHERE trace_id = ? ORDER BY start_time_ms ASC`
   - 结果映射为 SerializedSpan[]
9. 实现 `getMultipleTraces(traceIds: string[])` 方法：
   - `SELECT * FROM spans WHERE trace_id IN (${placeholders}) ORDER BY start_time_ms ASC`
   - 用于导出和对比
10. 实现 `query(filter: TraceQueryFilter)` 方法：
    - 调用 `buildQuery(filter)` 构建 SQL 和参数
    - 支持的过滤条件：traceId、spanName（LIKE）、kind、status、conversationId、taskId、startTimeFrom/To、minDurationMs、limit/offset
    - attributeFilters 通过 JSON 函数 `json_extract(attributes, ?)` 过滤（基础实现，性能优化留后续）
    - 返回 SerializedSpan[]
11. 实现 `buildQuery(filter)` 私有方法：
    - 动态构建 WHERE 子句和参数数组
    - 条件组合使用 AND
    - 默认按 start_time_ms DESC 排序
    - 支持 limit/offset 分页
12. 实现 `lockTrace(traceId, reason?)` 方法：
    - `INSERT OR REPLACE INTO locked_traces`
13. 实现 `unlockTrace(traceId)` 方法：
    - `DELETE FROM locked_traces WHERE trace_id = ?`
14. 实现 `cleanup(retentionDays)` 方法：
    - 计算截止时间戳：`Date.now() - retentionDays * 24 * 60 * 60 * 1000`
    - `DELETE FROM spans WHERE start_time_ms < ? AND trace_id NOT IN (SELECT trace_id FROM locked_traces)`
    - 返回 `{ deleted: result.changes }`
15. 实现 `getStats()` 方法：
    - `SELECT COUNT(*) as totalSpans, COUNT(DISTINCT trace_id) as totalTraces FROM spans`
    - 检查数据库文件大小（`fs.statSync`）
    - 超过 500MB 时 logger.warn
    - 返回 `{ totalSpans, totalTraces, dbSizeBytes }`
16. 实现 `getRecentTraces(limit)` 方法：
    - `SELECT trace_id, MIN(start_time_ms) as start_time, COUNT(*) as span_count FROM spans GROUP BY trace_id ORDER BY start_time DESC LIMIT ?`
17. 实现 `exportTrace(traceIds)` 方法：
    - 调用 `getMultipleTraces(traceIds)`
    - 构建导出 bundle：version=1、exportedAt、workspaceId、spans、checksum
18. 实现 `runIntegrityCheck()` 私有方法：
    - 若数据库文件存在：
      - 执行 `PRAGMA integrity_check`
      - 若结果非 'ok'：logger.error，重命名为 `trace.db.corrupted-{Date.now()}`
    - 若文件不存在，initialize 会自动创建
19. 实现 `close()` 方法：
    - `this.db.close()`
20. 实现 `rowToSpan(row)` 私有方法：
    - 将数据库行映射为 SerializedSpan
    - attributes 和 events 字段 JSON.parse
    - 处理 null 值（parentSpanId、statusMessage、conversationId、taskId）

### 步骤 6：实现 AppEventBus

**文件：** `src/main/services/event-bus.ts`

1. 继承 `EventEmitter`
2. 实现 `emitSpanEnded(span: SerializedSpan)`：
   - `this.emit('trace:span-ended', span)`
3. 实现 `emitTaskDeclared(task: TaskRecord)`：
   - `this.emit('progress:task-declared', task)`（TaskRecord 类型待 TASK028 定义，暂用 `unknown`）
4. 实现 `emitTaskUpdated(task: unknown)`：
   - `this.emit('progress:task-updated', task)`
5. 实现 `emitTaskCompleted(task: unknown)`：
   - `this.emit('progress:task-completed', task)`
6. 实现 `emitTaskFailed(task: unknown)`：
   - `this.emit('progress:task-failed', task)`
7. 实现 `emitPerformanceMetrics(metrics: unknown)`：
   - `this.emit('performance:metrics', metrics)`
8. 实现 `emitPerformanceAlert(alert: unknown)`：
   - `this.emit('performance:alert', alert)`
9. 实现 `emitPerformanceAlertCleared(payload: { type: string })`：
   - `this.emit('performance:alert-cleared', payload)`
10. 导出 `AppEventBus` 类

### 步骤 7：实现统一导出

**文件：** `src/main/services/trace/index.ts`

1. 从 `types.ts` 导出所有类型和常量
2. 从 `no-op-span.ts` 导出 `NO_OP_SPAN`
3. 从 `span-impl.ts` 导出 `SpanImpl`（内部使用，可选导出）
4. 从 `tracer.ts` 导出 `Tracer`
5. 从 `trace-store.ts` 导出 `TraceStore`

### 步骤 8：扩展 shared/types.ts

**文件：** `src/shared/types.ts`

1. 在 `IPC_CHANNELS` 常量中追加 Trace 相关通道：
   ```
   TRACE_GET_TREE: 'trace:getTraceTree'
   TRACE_QUERY: 'trace:query'
   TRACE_GET_RECENT: 'trace:getRecent'
   TRACE_GET_STATS: 'trace:getStats'
   TRACE_LOCK: 'trace:lockTrace'
   TRACE_UNLOCK: 'trace:unlockTrace'
   TRACE_CLEANUP: 'trace:cleanupNow'
   TRACE_PREVIEW_EXPORT: 'trace:previewExport'
   TRACE_EXPORT: 'trace:export'
   TRACE_IMPORT: 'trace:import'
   TRACE_REBUILD_SNAPSHOT: 'trace:rebuildSnapshot'
   TRACE_RERUN: 'trace:rerun'
   PERFORMANCE_GET_METRICS: 'performance:getMetrics'
   PERFORMANCE_GET_ALERTS: 'performance:getAlerts'
   PERFORMANCE_SUPPRESS: 'performance:suppressAlert'
   ```
2. 在 `IPCChannelMap` 中追加类型映射：
   - `TRACE_GET_TREE` → `{ params: [traceId: string]; return: SerializedSpan[] }`
   - `TRACE_QUERY` → `{ params: [filter: TraceQueryFilter]; return: SerializedSpan[] }`
   - `TRACE_GET_RECENT` → `{ params: [limit: number]; return: Array<{ traceId: string; startTime: number; spanCount: number }> }`
   - `TRACE_GET_STATS` → `{ params: []; return: { totalSpans: number; totalTraces: number; dbSizeBytes: number } }`
   - `TRACE_LOCK` / `TRACE_UNLOCK` → void
   - `TRACE_CLEANUP` → `{ params: []; return: { deleted: number } }`
   - 其他通道类型映射按需求文档补充
3. 在 `AIStreamEnd` 接口中新增可选字段 `traceId?: string`
4. 在 `HarnessResult` 接口中新增可选字段 `traceId?: string`
5. 在 `EvolutionEvent` 接口（IPC 镜像）中新增可选字段 `traceSpanId?: string`
6. 新增事件通道常量（Main→Renderer push）：
   ```
   TRACE_SPAN_ENDED: 'trace:spanEnded'
   TRACE_UPDATE: 'trace:update'
   PERFORMANCE_METRICS: 'performance:metrics'
   PERFORMANCE_ALERT: 'performance:alert'
   PERFORMANCE_ALERT_CLEARED: 'performance:alertCleared'
   ```

### 步骤 9：Sprint 3.1 集成改造

**涉及文件：**
- `src/main/services/harness/orchestrator.ts`
- `src/main/services/harness/guardrails/*.ts`
- `src/main/services/harness/sensors/*.ts`
- `src/main/services/harness/evaluators/*.ts`

#### 9.1 HarnessOrchestrator 改造

1. 新增 `private tracer?: Tracer` 字段
2. 新增 `setTracer(tracer: Tracer): void` 方法
3. 改造 `execute()` 方法：
   - 判断 `this.tracer?.isEnabled()`
   - 若启用：`return this.tracer.withSpan('ai.handle-message', async (rootSpan) => { ... }, { kind: 'ai-call', conversationId: request.sessionId })`
   - 在 withSpan 内部：rootSpan.setAttributes 设置 conversation.id、workspace.id
   - 调用 `executeInternal(request, rootSpan)` 执行原逻辑
   - 返回时在 result 上附加 `traceId: rootSpan.context.traceId`
   - 若未启用：`return this.executeInternal(request, undefined)` — 完全兼容现有行为
4. 改造 `trace()` 方法（双写）：
   - 通道 1（保留）：`await this.memoryManager.appendHarnessTrace(traceId, event)` — 不变
   - 通道 2（新增）：若 span 存在，`span.addEvent(\`${event.component}:${event.action}\`, { result: event.result, details: event.details?.join(', ') ?? '' })`
5. 将原 `execute()` 逻辑提取到 `executeInternal(request, rootSpan?)` 私有方法

#### 9.2 GuardrailEngine / Sensor / Evaluator 改造

各组件遵循相同模式：

1. 新增 `private tracer?: Tracer` 字段
2. 新增 `setTracer(tracer: Tracer): void` 方法
3. 改造核心方法（check / evaluate / detect）：
   - 若 `!this.tracer?.isEnabled()`：执行原路径，无行为变更
   - 若启用：`return this.tracer.withSpan('harness.guardrail' / 'harness.sensor' / 'harness.evaluator', async (span) => { ... }, { kind: 'system' })`
   - 在 withSpan 内部：span.setAttribute 设置 rule_id / verdict 等关键属性
   - 执行原逻辑，返回原结果

### 步骤 10：Sprint 3.2 集成改造

**涉及文件：**
- `src/main/services/memory/types.ts`
- `src/main/services/memory/evolution-log.ts`
- `src/main/services/memory-manager.ts`

#### 10.1 EvolutionEvent 扩展

1. 在 `src/main/services/memory/types.ts` 的 `EvolutionEvent` 接口中新增 `traceSpanId?: string`
2. 在 `src/shared/types.ts` 的 IPC 镜像 `EvolutionEvent` 中同步新增 `traceSpanId?: string`

#### 10.2 evolution-log.ts 适配

1. `parseEvent()` 方法增加 `traceSpanId` 字段提取
2. `formatEvent()` 已使用结构化格式，天然兼容新增字段

#### 10.3 MemoryManager 改造

1. 新增 `private tracer?: Tracer` 字段
2. 新增 `setTracer(tracer: Tracer): void` 方法
3. 在 `updateEntry` / `lockEntry` / `applyExtractionReport` 中：
   - 若 tracer 可用，从 `tracer.activeSpans` 中获取当前活跃 Span 的 spanId
   - 传入 `evolutionLog.append()` 的 `traceSpanId` 参数
4. 新增 `getSnapshotAt(date: Date)` 方法：
   - 通过 EvolutionLog.query() 逆向回放至指定时刻的状态
   - 返回 `{ data: { entries: MemoryEntry[]; totalTokens: number }; exact: boolean }`
   - exact=false 时标记为近似重建
   - 若 CHANGELOG 无对应时刻条目，使用最近的前序条目，标记 approximate

### 步骤 11：ContextEngine 集成

**文件：** `src/main/services/context-engine.ts`

1. 新增 `private tracer?: Tracer` 字段
2. 新增 `setTracer(tracer: Tracer): void` 方法
3. 改造 `assembleContext()` 方法：
   - 若 `!this.tracer?.isEnabled()`：执行原路径
   - 若启用：`return this.tracer.withSpan('context.assemble', async (span) => { ... }, { kind: 'tool-call' })`
   - span.setAttributes 设置 files_count、memory_tokens、budget_total 等上下文元数据
4. 对 `assembleForHarness()` 做相同改造

### 步骤 12：FileManager 集成

**文件：** `src/main/services/file-manager.ts`

1. 新增 `private tracer?: Tracer` 字段
2. 新增 `setTracer(tracer: Tracer): void` 方法
3. 改造 `atomicWrite()` 方法：
   - 若 `!this.tracer?.isEnabled()`：执行原路径
   - 若启用：`this.tracer.withSpan('tool.file-write', async (span) => { ... }, { kind: 'tool-call' })`
   - span.setAttribute('file.path', filePath)
   - span.setAttribute('file.size_bytes', content.length)
4. 对 `readFile()` 做相同改造（span name: `tool.file-read`）

### 步骤 13：主进程初始化与生命周期

**文件：** `src/main/index.ts`

1. 在 `onWorkspaceOpened` 中初始化 Trace 组件：
   ```typescript
   const traceStore = new TraceStore(workspaceRoot, logger)
   await traceStore.initialize()

   const appEventBus = new AppEventBus()

   const tracerConfig: TracerConfig = {
     enabled: configManager.get('trace.enabled', true),
     spanTimeoutMs: configManager.get('trace.spanTimeoutMs', 300000),
     bufferLimit: configManager.get('trace.bufferLimit', 1000),
     sensitiveKeyPatterns: DEFAULT_SENSITIVE_PATTERNS,
     propagateErrorToParent: configManager.get('trace.propagateErrorToParent', true)
   }

   const tracer = new Tracer(tracerConfig, traceStore, appEventBus, logger)
   tracer.start()
   ```
2. 将 tracer 注入到各依赖模块：
   ```typescript
   harnessOrchestrator.setTracer(tracer)
   contextEngine.setTracer(tracer)
   fileManager.setTracer(tracer)
   memoryManager.setTracer(tracer)
   // Guardrails / Sensors / Evaluators 遍历注入
   ```
3. 在 `onWorkspaceClosed` 中：
   ```typescript
   await tracer.stop()
   traceStore.close()
   ```
4. 在 `will-quit` 中确保 traceStore 关闭

## 测试计划

### 单元测试文件结构

```
tests/trace/
├── tracer.test.ts          ← Tracer 核心 API 测试
├── trace-store.test.ts     ← TraceStore 持久化测试
├── span-impl.test.ts       ← SpanImpl 行为测试
└── no-op-span.test.ts      ← NoOpSpan 性能测试
```

### tracer.test.ts 测试用例

1. **startSpan** — 创建 Span 返回正确 context（traceId、spanId）
2. **startSpan with parent** — 子 Span 继承 traceId，设置 parentSpanId
3. **withSpan success** — 自动 setStatus('ok') 和 end()
4. **withSpan error** — 自动 setStatus('error') 和 end()，re-throw
5. **withSpan double end** — end() 重复调用幂等
6. **span timeout** — 超时 Span 自动 setStatus('error', 'span timeout') 并 end()
7. **disabled mode** — 所有操作返回 NO_OP_SPAN，无副作用
8. **sensitive redaction** — 匹配 sensitiveKeyPatterns 的属性值替换为 [REDACTED]
9. **truncate large value** — 超 10KB 字符串截断并标记
10. **buffer overflow** — 持久化失败时 buffer 填充到 limit 后丢弃最旧
11. **flush** — buffer 内容批量写出成功
12. **flush failure** — 写出失败时 buffer 恢复

### trace-store.test.ts 测试用例

1. **initialize** — 创建表和索引，WAL 模式启用
2. **write and read** — 写入 Span 后按 trace_id 查询返回完整数据
3. **writeBatch** — 批量写入使用事务，全部成功或全部回滚
4. **query with filter** — 按 kind/status/time/conversationId 过滤
5. **lockTrace** — 锁定后 cleanup 不删除该 trace 的 Span
6. **cleanup** — 清理超期 Span，保留 locked_traces
7. **getStats** — 返回正确的 totalSpans/totalTraces/dbSizeBytes
8. **integrity check** — 损坏数据库重命名并重建
9. **performance** — 单次写入 < 1s，按 trace_id 查询 < 50ms（100 spans）

### span-impl.test.ts 测试用例

1. **setAttribute** — 属性正确存储
2. **setAttribute object** — 对象值 JSON 序列化
3. **setAttribute after finalized** — finalized 后设置属性被忽略
4. **addEvent** — 事件正确追加，timestamp 为当前时间
5. **setStatus** — 状态和消息正确设置
6. **end** — finalized 标记为 true，endTimeMs 设置
7. **end idempotency** — 重复 end() 不触发 onSpanEnd 两次

### no-op-span.test.ts 测试用例

1. **all methods no-op** — 调用任何方法无副作用
2. **performance** — 单次调用 < 100ns（benchmark 测试）
