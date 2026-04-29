# PHASE1-TASK027: Tracer SDK 与 Trace 持久化存储 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task027_tracer-sdk-trace-store.md](../specs/tasks/phase1/phase1-task027_tracer-sdk-trace-store.md)
> 创建日期：2026-04-21
> 最后更新：2026-04-21

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK027 |
| **任务标题** | Tracer SDK 与 Trace 持久化存储 |
| **所属阶段** | Phase 1 - Trace 系统、任务台账与可观测性 (Sprint 3.3) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | TASK017-021 (Harness) + TASK022-026 (记忆 v2) |

### 1.1 目标

构建 Sprint 3.3 基础设施层——实现 OTel 数据模型兼容的 Tracer SDK（Span 创建、嵌套、属性记录、事件挂载、状态标记）、Trace 持久化存储（独立 SQLite trace.db）、AppEventBus 全局事件总线，并将 Tracer 以可选注入方式集成到 Harness、ContextEngine、FileManager、MemoryManager。

### 1.2 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| Trace 类型定义 | `src/main/services/trace/types.ts` | Span/SpanContext/SpanEvent/SerializedSpan 等 |
| NoOpSpan 空实现 | `src/main/services/trace/no-op-span.ts` | 禁用模式零开销 |
| SpanImpl 实现 | `src/main/services/trace/span-impl.ts` | Span 具体行为 |
| Tracer 主类 | `src/main/services/trace/tracer.ts` | startSpan/withSpan/flush/serialize/redact |
| TraceStore 持久化 | `src/main/services/trace/trace-store.ts` | SQLite WAL + 6 索引 |
| AppEventBus | `src/main/services/event-bus.ts` | 全局事件总线 |
| 统一导出 | `src/main/services/trace/index.ts` | 公共 API 导出 |
| shared/types 扩展 | `src/shared/types.ts` | IPC 通道 + 类型扩展 |
| Harness 集成 | `src/main/services/harness/orchestrator.ts` | setTracer + withSpan |
| Guardrail/Sensor/Evaluator 集成 | `src/main/services/harness/guardrails/*.ts` 等 | 可选注入 |
| MemoryManager 集成 | `src/main/services/memory-manager.ts` | getSnapshotAt + traceSpanId |
| ContextEngine 集成 | `src/main/services/context-engine.ts` | setTracer + withSpan |
| FileManager 集成 | `src/main/services/file-manager.ts` | setTracer + withSpan |
| 主进程初始化 | `src/main/index.ts` | Tracer/TraceStore/AppEventBus 生命周期 |
| 单元测试 | `tests/trace/*.test.ts` | 4 个测试文件 |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；文件即真相；所有写入先写临时文件再原子替换；结构化日志 | 全局约束 |
| `specs/design/architecture.md` | 主进程与渲染进程 IPC 隔离；better-sqlite3 主进程专用 | 架构约束 |
| `specs/design/data-and-api.md` | IPC 通道命名规范；类型安全 IPCChannelMap | IPC 设计 |
| `specs/requirements/phase1/sprint3.3-trace.md` | 需求 3.3.1 + 3.3.2 完整技术规格 | 验收标准 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `sqlite-local-storage` | trace.db 设计；WAL 模式；索引策略；integrity check；better-sqlite3 API | trace-store.ts 全文件 |
| `electron-ipc-patterns` | IPC 通道类型安全注册；IPCChannelMap 扩展 | shared/types.ts 修改 |
| `typescript-strict-mode` | Span 接口严格类型；泛型 withSpan<T>；联合类型 SpanStatus | types.ts + 全部 TS 文件 |

### 2.3 前置代码依赖

| 模块 | 文件 | 复用/改造方式 |
|------|------|-------------|
| `DatabaseManager` | `src/main/services/database-manager.ts:21-51` | 参照 WAL/configure/openDatabase 模式 |
| `HarnessOrchestrator` | `src/main/services/harness/orchestrator.ts:34-61,73-192` | 新增 setTracer + withSpan 包裹 execute() |
| `GuardrailEngine` | `src/main/services/harness/guardrails/engine.ts` | 新增 setTracer + withSpan |
| `Evaluator` | `src/main/services/harness/evaluator.ts` | 新增 setTracer + withSpan |
| `SensorFeedbackLoop` | `src/main/services/harness/sensors/feedback-loop.ts` | 新增 setTracer + withSpan |
| `MemoryManager` | `src/main/services/memory-manager.ts:1-80` | 新增 setTracer + getSnapshotAt + traceSpanId |
| `EvolutionLog` | `src/main/services/memory/evolution-log.ts:20-60` | parseEvent 增加 traceSpanId 提取 |
| `EvolutionEvent` | `src/main/services/memory/types.ts:201-215` | 新增可选 traceSpanId 字段 |
| `ContextEngine` | `src/main/services/context-engine.ts:1-60` | 新增 setTracer + withSpan 包裹 |
| `FileManager` | `src/main/services/file-manager.ts:1-60` | 新增 setTracer + withSpan 包裹 |
| `IPC_CHANNELS` | `src/shared/types.ts:72-280` | 追加 Trace + Performance 通道常量 |
| `IPCChannelMap` | `src/shared/types.ts:322-474` | 追加 Trace 通道类型映射 |
| `AIStreamEnd` | `src/shared/types.ts:790-805` | 新增可选 traceId 字段 |
| `HarnessResult` | `src/shared/types.ts:1531-1540` | 新增可选 traceId 字段 |
| `EvolutionEvent (shared)` | `src/shared/types.ts:1361-1371` | 同步新增 traceSpanId |
| `logger` | `src/main/utils/logger.ts` | 结构化日志依赖 |
| `TypedEventEmitter` | `src/main/services/utils/typed-event-emitter.ts` | AppEventBus 可选基类 |

### 2.4 被依赖任务

| 任务 | 依赖内容 |
|------|---------|
| TASK028 (ProgressLedger) | 依赖 Tracer、TraceStore、AppEventBus |
| TASK029 (可观测性 UI) | 依赖 TraceStore 查询接口、IPC 通道 |

---

## 三、实施阶段与步骤分解

### 阶段 A：Trace 核心类型与 SDK（预计 1.5 工作日）

> 产出可独立编译的 Tracer SDK，不依赖任何外部模块。

#### 步骤 A1：定义 Trace 共享类型

**文件：** `sibylla-desktop/src/main/services/trace/types.ts`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| A1.1 | 定义 `SpanStatus = 'ok' \| 'error' \| 'unset'` | 联合类型，禁止 any |
| A1.2 | 定义 `SpanKind = 'internal' \| 'ai-call' \| 'tool-call' \| 'user-action' \| 'system'` | 与 sprint3.3-trace.md 对齐 |
| A1.3 | 定义 `SpanContext { traceId, spanId, parentSpanId? }` | traceId 16-byte hex (32 chars)，spanId 8-byte hex (16 chars) |
| A1.4 | 定义 `SpanEvent { name, timestamp, attributes }` | timestamp 为 epoch ms |
| A1.5 | 定义 `SerializedSpan` | 全字段映射：traceId/spanId/parentSpanId?/name/kind/startTimeMs/endTimeMs/durationMs/status/statusMessage?/attributes/events/conversationId?/taskId?/userId?/workspaceId? |
| A1.6 | 定义 `Span` 接口（公开 API） | readonly context/name/kind；setAttribute/setAttributes/addEvent/setStatus/end/isFinalized |
| A1.7 | 定义 `TracerConfig` | enabled/spanTimeoutMs(300000)/bufferLimit(1000)/sensitiveKeyPatterns/propagateErrorToParent(true) |
| A1.8 | 定义 `DEFAULT_SENSITIVE_PATTERNS` | 6 个 RegExp 常量数组 |
| A1.9 | 定义 `TraceQueryFilter` | traceId?/spanName?/kind?/status?/conversationId?/taskId?/startTimeFrom?/startTimeTo?/minDurationMs?/attributeFilters?/limit?/offset? |
| A1.10 | 定义 `SpanInitData`（内部） | context/name/kind/startTimeMs/attributes/conversationId?/taskId?/tracer |

#### 步骤 A2：实现 NoOpSpan 空实现

**文件：** `sibylla-desktop/src/main/services/trace/no-op-span.ts`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| A2.1 | 创建 `NO_OP_SPAN` 常量满足 `Span` 接口 | 所有方法空函数体 |
| A2.2 | `context` 返回 `{ traceId: '', spanId: '' }` | 固定空值 |
| A2.3 | `name` 返回 `'no-op'`，`kind` 返回 `'internal'` | |
| A2.4 | `isFinalized()` 返回 `true` | 阻止重复操作 |
| A2.5 | 所有方法体内零计算零条件 | 性能 < 100ns |

#### 步骤 A3：实现 SpanImpl

**文件：** `sibylla-desktop/src/main/services/trace/span-impl.ts`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| A3.1 | 构造函数接收 `SpanInitData` | context/name/kind/startTimeMs/attributes/conversationId?/taskId?/tracer |
| A3.2 | 内部状态：attributes Map / events[] / status / statusMessage? / endTimeMs? / finalized | |
| A3.3 | `setAttribute(key, value)` | finalized 时 warn + return；对象 JSON 序列化，深度 ≤ 5 长度 ≤ 10KB |
| A3.4 | `setAttributes(attrs)` | 遍历调用 setAttribute |
| A3.5 | `addEvent(name, attributes?)` | finalized 时 warn + return；追加 SpanEvent |
| A3.6 | `setStatus(status, message?)` | finalized 时 warn + return；error + propagateErrorToParent 时创建 propagation span |
| A3.7 | `end()` | finalized 时 warn + return（幂等）；设置 endTimeMs/finalized；调用 tracer.onSpanEnd(this) |
| A3.8 | `isFinalized()` | 返回 this.finalized |
| A3.9 | `durationMs` getter | endTimeMs 存在返回差值，否则 Date.now() - startTimeMs |
| A3.10 | `truncateLargeValue` 私有方法 | 字符串 > 10KB 截断 + `[TRUNCATED]`；JSON.stringify 后检查 |

#### 步骤 A4：实现 Tracer 主类

**文件：** `sibylla-desktop/src/main/services/trace/tracer.ts`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| A4.1 | 构造函数注入 config/TraceStore/AppEventBus/logger | 依赖注入 |
| A4.2 | 内部状态：activeSpans Map / buffer[] / timeoutChecker? | |
| A4.3 | `start()` | 启动 setInterval(checkTimeouts, 30000) |
| A4.4 | `stop()` | 清除 timeoutChecker + 返回 flush() Promise |
| A4.5 | `isEnabled()` | 返回 config.enabled |
| A4.6 | `startSpan(name, options?)` | disabled → NO_OP_SPAN；生成 traceId/spanId；创建 SpanImpl；存入 activeSpans |
| A4.7 | `withSpan<T>(name, fn, options?)` | try: 执行 fn → status unset 时 setStatus('ok')；catch: setStatus('error') + setAttribute('error.stack')；finally: end() |
| A4.8 | `onSpanEnd(span)` | activeSpans.delete → serialize → persistAsync → eventBus.emitSpanEnded |
| A4.9 | `generateTraceId()` | crypto.randomBytes(16).toString('hex') → 32 chars |
| A4.10 | `generateSpanId()` | crypto.randomBytes(8).toString('hex') → 16 chars |
| A4.11 | `serialize(span)` | 映射所有字段 + redactAttributes |
| A4.12 | `redactAttributes(attrs)` | sensitiveKeyPatterns 匹配 → [REDACTED]；否则 truncateIfLarge |
| A4.13 | `truncateIfLarge(value)` | 字符串 > 10240 → 截断 + `...[TRUNCATED:Nchars]`；对象 JSON 后检查 |
| A4.14 | `persistAsync(span)` | try: persistence.write；catch: buffer.push + overflow 丢弃最旧 + warn |
| A4.15 | `checkTimeouts()` | Array.from(activeSpans.entries()) 遍历；超时 → warn + setStatus('error','span timeout') + end() |
| A4.16 | `flush()` | while buffer: splice(0,100) → writeBatch；失败 → unshift + break |

#### 步骤 A5：实现统一导出

**文件：** `sibylla-desktop/src/main/services/trace/index.ts`

| 序号 | 操作 |
|------|------|
| A5.1 | 导出 types.ts 全部类型和常量 |
| A5.2 | 导出 NO_OP_SPAN |
| A5.3 | 导出 SpanImpl（内部，可选导出） |
| A5.4 | 导出 Tracer |
| A5.5 | 导出 TraceStore |

---

### 阶段 B：TraceStore 持久化 + AppEventBus（预计 1 工作日）

> 产出可查询的 Trace 存储和全局事件总线。

#### 步骤 B1：实现 TraceStore

**文件：** `sibylla-desktop/src/main/services/trace/trace-store.ts`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| B1.1 | 构造函数注入 workspaceRoot / logger | |
| B1.2 | `storePath()` | path.join(workspaceRoot, '.sibylla/trace/trace.db') |
| B1.3 | `initialize()` | mkdir recursive → runIntegrityCheck → openSQLite → 建表 + 6 索引 → PRAGMA WAL + NORMAL |
| B1.4 | spans 表 DDL | 15 列 + TEXT PRIMARY KEY；attributes/events 为 JSON TEXT |
| B1.5 | locked_traces 表 DDL | trace_id PK / locked_at / reason |
| B1.6 | 6 索引 | idx_trace_id / idx_start_time / idx_conversation / idx_task / idx_status_duration / idx_name_time |
| B1.7 | `write(span)` | db.prepare().run() INSERT OR REPLACE |
| B1.8 | `writeSync(span)` | 同步版本，事务内使用 |
| B1.9 | `writeBatch(spans)` | db.transaction() 包裹，遍历 writeSync |
| B1.10 | `getTraceTree(traceId)` | SELECT WHERE trace_id=? ORDER BY start_time_ms ASC → rowToSpan[] |
| B1.11 | `getMultipleTraces(traceIds)` | SELECT WHERE trace_id IN (placeholders) → rowToSpan[] |
| B1.12 | `query(filter)` | buildQuery 动态 WHERE + limit/offset → rowToSpan[] |
| B1.13 | `buildQuery(filter)` 私有 | 动态 WHERE 子句 + 参数数组；attributeFilters 用 json_extract |
| B1.14 | `lockTrace(traceId, reason?)` | INSERT OR REPLACE INTO locked_traces |
| B1.15 | `unlockTrace(traceId)` | DELETE FROM locked_traces |
| B1.16 | `cleanup(retentionDays)` | DELETE WHERE start_time_ms < cutoff AND trace_id NOT IN locked |
| B1.17 | `getStats()` | COUNT + COUNT DISTINCT + fs.statSync db size + 500MB warn |
| B1.18 | `getRecentTraces(limit)` | GROUP BY trace_id ORDER BY start_time DESC |
| B1.19 | `exportTrace(traceIds)` | getMultipleTraces → bundle {version, exportedAt, workspaceId, spans, checksum} |
| B1.20 | `runIntegrityCheck()` 私有 | PRAGMA integrity_check → 非 ok 时重命名为 .corrupted-{timestamp} |
| B1.21 | `close()` | db.close() |
| B1.22 | `rowToSpan(row)` 私有 | JSON.parse attributes/events；null 值处理 |

#### 步骤 B2：实现 AppEventBus

**文件：** `sibylla-desktop/src/main/services/event-bus.ts`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| B2.1 | 继承 EventEmitter 或使用 TypedEventEmitter | 独立于 MemoryEventBus |
| B2.2 | `emitSpanEnded(span: SerializedSpan)` | emit('trace:span-ended', span) |
| B2.3 | `emitTaskDeclared(task: unknown)` | emit('progress:task-declared', task) |
| B2.4 | `emitTaskUpdated(task: unknown)` | emit('progress:task-updated', task) |
| B2.5 | `emitTaskCompleted(task: unknown)` | emit('progress:task-completed', task) |
| B2.6 | `emitTaskFailed(task: unknown)` | emit('progress:task-failed', task) |
| B2.7 | `emitPerformanceMetrics(metrics: unknown)` | emit('performance:metrics', metrics) |
| B2.8 | `emitPerformanceAlert(alert: unknown)` | emit('performance:alert', alert) |
| B2.9 | `emitPerformanceAlertCleared(payload: { type: string })` | emit('performance:alert-cleared', payload) |

---

### 阶段 C：shared/types.ts IPC 扩展（预计 0.5 工作日）

> 产出类型安全的 Trace IPC 通道定义，为 TASK029 UI 层铺路。

#### 步骤 C1：IPC 通道常量追加

**文件：** `sibylla-desktop/src/shared/types.ts`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| C1.1 | 在 IPC_CHANNELS 追加 TRACE_GET_TREE | 'trace:getTraceTree' |
| C1.2 | 追加 TRACE_QUERY | 'trace:query' |
| C1.3 | 追加 TRACE_GET_RECENT | 'trace:getRecent' |
| C1.4 | 追加 TRACE_GET_STATS | 'trace:getStats' |
| C1.5 | 追加 TRACE_LOCK / TRACE_UNLOCK | 'trace:lockTrace' / 'trace:unlockTrace' |
| C1.6 | 追加 TRACE_CLEANUP | 'trace:cleanupNow' |
| C1.7 | 追加 TRACE_PREVIEW_EXPORT / TRACE_EXPORT / TRACE_IMPORT | |
| C1.8 | 追加 TRACE_REBUILD_SNAPSHOT / TRACE_RERUN | |
| C1.9 | 追加 PERFORMANCE_GET_METRICS / GET_ALERTS / SUPPRESS | |
| C1.10 | 追加 Main→Renderer push 事件常量 | TRACE_SPAN_ENDED / TRACE_UPDATE / PERFORMANCE_METRICS / PERFORMANCE_ALERT / PERFORMANCE_ALERT_CLEARED |

#### 步骤 C2：IPCChannelMap 类型映射追加

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| C2.1 | TRACE_GET_TREE → `{ params: [traceId: string]; return: SerializedSpan[] }` | |
| C2.2 | TRACE_QUERY → `{ params: [filter: TraceQueryFilter]; return: SerializedSpan[] }` | |
| C2.3 | TRACE_GET_RECENT → `{ params: [limit: number]; return: Array<{ traceId: string; startTime: number; spanCount: number }> }` | |
| C2.4 | TRACE_GET_STATS → `{ params: []; return: { totalSpans: number; totalTraces: number; dbSizeBytes: number } }` | |
| C2.5 | TRACE_LOCK / TRACE_UNLOCK → `{ params: [traceId: string, ...]; return: void }` | |
| C2.6 | TRACE_CLEANUP → `{ params: []; return: { deleted: number } }` | |
| C2.7 | 其他通道类型映射按需求补充 | |

#### 步骤 C3：接口扩展

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| C3.1 | AIStreamEnd 新增 `traceId?: string` | 可选字段，不破坏现有 |
| C3.2 | HarnessResult 新增 `traceId?: string` | 可选字段，不破坏现有 |
| C3.3 | EvolutionEvent (shared) 新增 `traceSpanId?: string` | 与 main/types.ts 同步 |

---

### 阶段 D：Sprint 3.1 集成改造（预计 1 工作日）

> 可选注入模式，Tracer 不可用时完全无行为变更。

#### 步骤 D1：HarnessOrchestrator 改造

**文件：** `sibylla-desktop/src/main/services/harness/orchestrator.ts`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| D1.1 | 新增 `private tracer?: Tracer` 字段 | 类型从 trace/index 导入 |
| D1.2 | 新增 `setTracer(tracer: Tracer): void` 方法 | |
| D1.3 | 提取 `execute()` 逻辑到 `executeInternal(request, rootSpan?)` | |
| D1.4 | 改造 `execute()` 入口 | tracer?.isEnabled() → withSpan('ai.handle-message') 包裹；否则 executeInternal(undefined) |
| D1.5 | withSpan 内设置 rootSpan 属性 | conversation.id / workspace.id |
| D1.6 | 返回时附加 `traceId: rootSpan.context.traceId` | |
| D1.7 | 改造 `trace()` 双写 | 通道 1: MemoryManager.appendHarnessTrace 不变；通道 2: rootSpan?.addEvent() |

#### 步骤 D2：GuardrailEngine / Sensor / Evaluator 改造

**文件：** `src/main/services/harness/guardrails/engine.ts` + `sensors/feedback-loop.ts` + `evaluator.ts`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| D2.1 | 各组件新增 `private tracer?: Tracer` + `setTracer()` | 统一模式 |
| D2.2 | GuardrailEngine.check 包裹 | withSpan('harness.guardrail', { kind: 'system' }) |
| D2.3 | SensorFeedbackLoop.run 包裹 | withSpan('harness.sensor', { kind: 'system' }) |
| D2.4 | Evaluator.evaluate 包裹 | withSpan('harness.evaluator', { kind: 'system' }) |
| D2.5 | Tracer 不可用时走原路径 | 无行为变更 |

---

### 阶段 E：Sprint 3.2 集成 + ContextEngine + FileManager（预计 0.5 工作日）

> 扩展演化日志交叉引用 + 上下文/文件管理器 Span 追踪。

#### 步骤 E1：EvolutionEvent 扩展

**文件：** `sibylla-desktop/src/main/services/memory/types.ts:201-215` + `src/shared/types.ts:1361-1371`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| E1.1 | main/types.ts EvolutionEvent 新增 `traceSpanId?: string` | 可选字段 |
| E1.2 | shared/types.ts EvolutionEvent 同步新增 `traceSpanId?: string` | IPC 镜像同步 |

#### 步骤 E2：evolution-log.ts 适配

**文件：** `sibylla-desktop/src/main/services/memory/evolution-log.ts`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| E2.1 | `parseEvent()` 增加 traceSpanId 字段提取 | |
| E2.2 | `formatEvent()` 天然兼容新增字段（结构化格式） | |

#### 步骤 E3：MemoryManager 改造

**文件：** `sibylla-desktop/src/main/services/memory-manager.ts`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| E3.1 | 新增 `private tracer?: Tracer` + `setTracer()` | |
| E3.2 | updateEntry/lockEntry/applyExtractionReport 传入 traceSpanId | 从 tracer.activeSpans 获取当前 spanId |
| E3.3 | 新增 `getSnapshotAt(date: Date)` | 通过 EvolutionLog.query() 回放；返回 `{ data, exact }` |

#### 步骤 E4：ContextEngine 集成

**文件：** `sibylla-desktop/src/main/services/context-engine.ts`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| E4.1 | 新增 `private tracer?: Tracer` + `setTracer()` | |
| E4.2 | `assembleContext()` withSpan 包裹 | 'context.assemble', kind: 'tool-call' |
| E4.3 | `assembleForHarness()` withSpan 包裹 | 同上 |
| E4.4 | span.setAttributes 设置 files_count/memory_tokens/budget_total | |

#### 步骤 E5：FileManager 集成

**文件：** `sibylla-desktop/src/main/services/file-manager.ts`

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| E5.1 | 新增 `private tracer?: Tracer` + `setTracer()` | |
| E5.2 | `atomicWrite()` withSpan 包裹 | 'tool.file-write', kind: 'tool-call' |
| E5.3 | span.setAttribute('file.path', 'file.size_bytes') | |
| E5.4 | `readFile()` withSpan 包裹 | 'tool.file-read' |

---

### 阶段 F：主进程初始化与生命周期（预计 0.5 工作日）

> 将 Trace 组件接入 Electron 应用生命周期。

#### 步骤 F1：初始化 Trace 组件

**文件：** `sibylla-desktop/src/main/index.ts`（或 workspace 生命周期管理文件）

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| F1.1 | onWorkspaceOpened 中创建 TraceStore | new TraceStore(workspaceRoot, logger) → initialize() |
| F1.2 | 创建 AppEventBus | new AppEventBus() |
| F1.3 | 读取 TracerConfig | configManager.get('trace.enabled') 等 |
| F1.4 | 创建 Tracer 并 start() | new Tracer(config, traceStore, eventBus, logger) → start() |
| F1.5 | 注入到各模块 | harnessOrchestrator.setTracer / contextEngine.setTracer / fileManager.setTracer / memoryManager.setTracer / guards.setTracer / sensors.setTracer / evaluator.setTracer |

#### 步骤 F2：关闭与清理

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| F2.1 | onWorkspaceClosed 中 await tracer.stop() | flush buffer |
| F2.2 | traceStore.close() | 关闭 SQLite 连接 |
| F2.3 | will-quit 事件中确保 traceStore 关闭 | 防止数据丢失 |

---

### 阶段 G：单元测试（预计 0.5 工作日）

> 覆盖核心 API 行为和持久化逻辑。

#### 步骤 G1：tracer.test.ts

| 序号 | 测试用例 | 验收要点 |
|------|---------|---------|
| G1.1 | startSpan — 创建 Span 返回正确 context | traceId 32 chars, spanId 16 chars |
| G1.2 | startSpan with parent — 子 Span 继承 traceId + parentSpanId | |
| G1.3 | withSpan success — 自动 setStatus('ok') + end() | |
| G1.4 | withSpan error — setStatus('error') + end() + re-throw | |
| G1.5 | end idempotency — 重复 end() 不触发 onSpanEnd 两次 | |
| G1.6 | span timeout — 超时自动 setStatus('error','span timeout') + end() | |
| G1.7 | disabled mode — 返回 NO_OP_SPAN，无副作用 | |
| G1.8 | sensitive redaction — 匹配 key → [REDACTED] | |
| G1.9 | truncate large value — 超 10KB 截断 + 标记 | |
| G1.10 | buffer overflow — 持久化失败 → buffer 填满 → 丢弃最旧 + warn | |
| G1.11 | flush success — buffer 批量写出 | |
| G1.12 | flush failure — 写出失败 → buffer 恢复 | |

#### 步骤 G2：trace-store.test.ts

| 序号 | 测试用例 | 验收要点 |
|------|---------|---------|
| G2.1 | initialize — 创建表 + 索引，WAL 启用 | |
| G2.2 | write and read — 写入 + trace_id 查询返回完整数据 | |
| G2.3 | writeBatch — 事务批量写入，全部成功或回滚 | |
| G2.4 | query with filter — kind/status/time/conversationId 过滤 | |
| G2.5 | lockTrace — 锁定后 cleanup 不删除 | |
| G2.6 | cleanup — 清理超期 + 保留 locked | |
| G2.7 | getStats — totalSpans/totalTraces/dbSizeBytes 正确 | |
| G2.8 | integrity check — 损坏数据库重命名 + 重建 | |

#### 步骤 G3：span-impl.test.ts

| 序号 | 测试用例 |
|------|---------|
| G3.1 | setAttribute — 属性正确存储 |
| G3.2 | setAttribute object — 对象值 JSON 序列化 |
| G3.3 | setAttribute after finalized — 被忽略 + warn |
| G3.4 | addEvent — 事件正确追加 + timestamp |
| G3.5 | setStatus — 状态和消息正确设置 |
| G3.6 | end — finalized=true + endTimeMs 设置 |
| G3.7 | end idempotency — 不触发 onSpanEnd 两次 |

#### 步骤 G4：no-op-span.test.ts

| 序号 | 测试用例 |
|------|---------|
| G4.1 | all methods no-op — 调用任何方法无副作用 |
| G4.2 | performance — 单次调用 < 100ns（benchmark） |

---

## 四、关键设计决策

### 4.1 可选注入模式

所有集成改造遵循 `setTracer(tracer?: Tracer)` 模式，Tracer 不可用时走原路径，**零行为变更**。这确保：
- 渐进式接入，不破坏现有功能
- Tracer 初始化失败不影响应用启动
- 可通过配置 `trace.enabled=false` 全局关闭

### 4.2 双写过渡策略

HarnessOrchestrator 的 `trace()` 方法保留 MemoryManager.appendHarnessTrace 写入（通道 1），同时新增 rootSpan.addEvent 写入（通道 2）。两个通道并行，不互斥。

### 4.3 TraceStore 独立 SQLite

`.sibylla/trace/trace.db` 与记忆索引 `.sibylla/index/search.db` 隔离：
- 不同的数据生命周期（Trace 7 天清理 vs 索引永久）
- 不同的查询模式（Span 树查询 vs FTS 搜索）
- 不同的故障域（一个损坏不影响另一个）

### 4.4 缓冲降级策略

```
persistAsync(span)
  → TraceStore.write 成功 → 完毕
  → TraceStore.write 失败 → buffer.push(span)
    → buffer.length > 1000 → buffer.shift() + logger.warn

flush()
  → buffer.splice(0, 100) → TraceStore.writeBatch
  → writeBatch 失败 → buffer.unshift(...batch) + break
```

关键原则：**Trace 写入绝不阻塞主流程**。

### 4.5 OTel 兼容性

数据模型严格遵循 OpenTelemetry Span 子集：
- traceId: 16-byte hex（OTel W3C 格式）
- spanId: 8-byte hex（OTel 格式）
- parentSpanId: 8-byte hex
- SpanKind 映射：internal→INTERNAL, ai-call→CLIENT, tool-call→CLIENT, system→INTERNAL
- 未来可外接 OTLP exporter，无需数据转换

---

## 五、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| better-sqlite3 原生模块打包失败 | TraceStore 不可用 | 沿用 DatabaseManager 已验证的打包配置；TraceStore 失败时 Tracer 降级为纯内存 buffer |
| Span 超时检查遍历性能 | 高活跃时 activeSpans 过大 | 每 30s 检查；超时 span 立即 end() 从 Map 删除；可配置 spanTimeoutMs |
| trace.db 增长过快 | 磁盘占用超 500MB | 每日 cleanup + locked_traces 保护 + getStats 监控 + 500MB warn 阈值 |
| serialize + redact CPU 开销 | 高吞吐时阻塞 | persistAsync 异步不阻塞；redact 仅遍历 attributes Map；buffer 削峰 |
| 集成改造破坏现有行为 | Harness/ContextEngine 功能回归 | 严格可选注入 + Tracer 不可用走原路径 + 单元测试覆盖 fallback |

---

## 六、执行顺序总览

```
阶段 A (1.5d): Trace SDK 核心
  A1: types.ts       ──→ A2: no-op-span.ts
                          A3: span-impl.ts      ──→ A4: tracer.ts ──→ A5: index.ts

阶段 B (1d): 持久化 + 事件总线
  B1: trace-store.ts  (依赖 A1 类型)
  B2: event-bus.ts    (依赖 A1 SerializedSpan)

阶段 C (0.5d): IPC 通道扩展
  C1-C3: shared/types.ts  (依赖 A1 类型 + B1 TraceQueryFilter)

阶段 D (1d): Sprint 3.1 集成
  D1: orchestrator.ts   (依赖 A4 Tracer)
  D2: guardrails/sensors/evaluator  (依赖 A4 Tracer)

阶段 E (0.5d): Sprint 3.2 + Context + File 集成
  E1-E2: EvolutionEvent + evolution-log  (依赖 C3)
  E3: memory-manager.ts  (依赖 A4 Tracer)
  E4: context-engine.ts  (依赖 A4 Tracer)
  E5: file-manager.ts    (依赖 A4 Tracer)

阶段 F (0.5d): 主进程初始化
  F1-F2: index.ts  (依赖 A4 + B1 + B2 + D1 + E3-E5)

阶段 G (0.5d): 单元测试
  G1-G4: tests/trace/*.test.ts  (依赖 A1-A5 + B1 + B2)
```

**总预估：5.5 工作日（含测试），核心路径 A → B → C → D → F 可并行推进 E。**
