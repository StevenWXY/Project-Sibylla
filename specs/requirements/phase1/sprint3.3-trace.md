# Phase 1 Sprint 3.3 - Trace 系统、任务台账与可观测性

## 一、概述

### 1.1 目标与价值

在 Sprint 3.1（Harness 状态机）、Sprint 3.2（记忆演化）建立的基础上，
引入统一的 Trace 基础设施，将系统内所有执行事件纳入同一份 Span 层次化模型，
并以此驱动两个用户可感知的产物：

1. **progress.md 任务台账**——用户随时可见的"AI 正在做/做过什么"
2. **Trace Inspector**——开发者与高级用户可用的执行链路检查工具

Sprint 3.3 是 Sibylla 可观测性的奠基石：从这里开始，所有 AI 行为都**可追溯、
可解释、可复现**。

### 1.2 与其他 Sprint 的关系

| Sprint | 关系 |
|---|---|
| Sprint 3.1（前序）| Guardrails、Sensors、Evaluators 是 Trace 的主要生产方 |
| Sprint 3.2（前序）| `appendHarnessTrace` 保留，Tracer 内部调用；演化日志新增 `traceSpanId` |
| Sprint 3.4（后续）| AI 模式切换作为 Trace 事件记录；Plan 模式生成的 plan 文件通过 progress.md 链接 |
| Sprint 4（并行）| 云端语义搜索的每次调用作为 Span；ContextEngine v2 全程纳入 Trace |

### 1.3 设计原则

- **一切皆 Span**：LLM 调用、工具调用、上下文组装、记忆检索、文件读写都是 Span
- **OTel 数据模型**：自研 SDK 但数据结构兼容未来外接标准可观测性后端
- **零阻塞**：Trace 写入绝不阻塞主流程，失败降级为内存队列或丢弃（可配置）
- **分层展示**：普通用户看 progress.md（简化任务视图），开发者看 Trace Inspector（完整 Span 树）
- **用户可控**：Trace 数据默认保留 7 天，可配置；导出前自动脱敏敏感字段
- **progress.md 是投影**：progress.md 由 Trace 数据自动渲染，不是独立真相源

### 1.4 涉及模块

- 模块 4：AI 系统（所有 AI 调用纳入 Trace）
- 模块 15：记忆系统（与 Trace 交叉引用）
- 模块 16（新增）：Trace 系统
- 模块 17（新增）：任务台账（progress.md 管理器）
- 模块 18（新增）：Trace Inspector UI

### 1.5 里程碑定义

**完成标志：**
- Tracer SDK 可用，所有 AI 请求自动产出根 Span 及子 Span 树
- Trace 数据持久化到独立 SQLite，支持按 trace_id / 时间 / attributes 查询
- progress.md 按任务级实时更新，AI 自声明任务、状态迁移、完成归档
- 对话气泡可展开"执行轨迹"简化视图
- Trace Inspector 面板可查看完整 Span 树、attributes、events、timeline
- 性能预警：慢调用（> 10s）、高 token 消耗（> 30K）、异常率（> 5%）自动标记
- Trace 回放可重建任一历史时刻的上下文快照
- Sprint 3.1 的 Harness 组件完成 Tracer 注入改造
- Sprint 3.2 的演化日志新增 traceSpanId 交叉引用

---

## 二、功能需求

### 需求 3.3.1 - 统一 Trace 事件模型与 Tracer SDK

**用户故事：** 作为系统，我需要一个统一的 API，让所有模块都能产出
结构化的、层次化的、可追溯的执行事件。

#### 功能描述

Tracer SDK 提供 Span 创建、嵌套、属性记录、事件挂载、状态标记的能力。
数据模型严格遵循 OpenTelemetry 子集，为未来外接标准后端留出道路。
SDK 轻量（< 3KB gzip），无运行时外部依赖。

Span 生命周期：
```
startSpan(name, parent?) 
  → setAttribute(key, value) × N
  → addEvent(name, attributes) × N
  → setStatus('ok' | 'error', message?)
  → end()
```

所有 Span 自动捕获：创建时间戳、结束时间戳、持续时长、调用栈深度、
所属对话 ID（如果存在）、所属任务 ID（如果存在）。

#### 验收标准

1. When a module calls `tracer.startSpan(name)`, the system shall return a Span handle with unique span_id and auto-generated trace_id (or inherited from parent)
2. When a Span is created with a parent Span, the system shall set parent_span_id and inherit trace_id
3. When `span.setAttribute(key, value)` is called, the system shall store the attribute; if value is an object, it shall be JSON-stringified with max depth 5 and max length 10KB (truncated with indicator)
4. When `span.addEvent(name, attrs)` is called, the system shall record the event with current timestamp
5. When `span.end()` is called, the system shall compute duration_ms, emit to persistence layer asynchronously, and mark the Span as finalized
6. When `span.end()` is called twice, the system shall log warning and ignore second call (idempotency)
7. When `span.setStatus('error', message)` is called, the system shall store status and message, and propagate 'error' status to parent Span if configured
8. When persistence layer is unavailable, the system shall buffer up to 1000 Spans in memory, then drop oldest with warning log
9. When Tracer is disabled via config, all operations shall be no-op with minimal overhead (< 100 nanoseconds per call)
10. When a Span exists for more than 5 minutes without end(), the system shall auto-finalize with status 'error: span timeout' and log warning
11. When serializing Span for persistence, sensitive attributes (keys matching `*_token`, `*_key`, `password`, `credential*`) shall be redacted to `[REDACTED]`

#### 技术规格

```typescript
// sibylla-desktop/src/main/services/trace/types.ts

export type SpanStatus = 'ok' | 'error' | 'unset'
export type SpanKind = 
  | 'internal'      // 普通内部调用
  | 'ai-call'       // LLM API 调用
  | 'tool-call'     // 工具调用（文件、搜索等）
  | 'user-action'   // 用户触发的动作
  | 'system'        // 系统自动行为

export interface SpanContext {
  traceId: string         // 16-byte hex
  spanId: string          // 8-byte hex
  parentSpanId?: string
}

export interface SpanEvent {
  name: string
  timestamp: number       // epoch ms
  attributes: Record<string, unknown>
}

export interface SerializedSpan {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  kind: SpanKind
  startTimeMs: number
  endTimeMs: number
  durationMs: number
  status: SpanStatus
  statusMessage?: string
  attributes: Record<string, unknown>
  events: SpanEvent[]
  // Sibylla-specific metadata
  conversationId?: string
  taskId?: string
  userId?: string
  workspaceId?: string
}

export interface Span {
  readonly context: SpanContext
  readonly name: string
  readonly kind: SpanKind
  setAttribute(key: string, value: unknown): void
  setAttributes(attrs: Record<string, unknown>): void
  addEvent(name: string, attributes?: Record<string, unknown>): void
  setStatus(status: SpanStatus, message?: string): void
  end(): void
  isFinalized(): boolean
}
```

```typescript
// sibylla-desktop/src/main/services/trace/tracer.ts

export interface TracerConfig {
  enabled: boolean
  spanTimeoutMs: number            // default 5 min
  bufferLimit: number              // default 1000
  sensitiveKeyPatterns: RegExp[]   // default below
  propagateErrorToParent: boolean  // default true
}

const DEFAULT_SENSITIVE_PATTERNS = [
  /.*_token$/i,
  /.*_key$/i,
  /^password$/i,
  /^credential.*/i,
  /^api_key$/i,
  /^secret.*/i
]

export class Tracer {
  private activeSpans: Map<string, SpanImpl> = new Map()
  private buffer: SerializedSpan[] = []
  private timeoutChecker?: NodeJS.Timer

  constructor(
    private config: TracerConfig,
    private persistence: TraceStore,
    private eventBus: EventBus,
    private logger: Logger
  ) {}

  start(): void {
    this.timeoutChecker = setInterval(() => this.checkTimeouts(), 30_000)
  }

  stop(): Promise<void> {
    if (this.timeoutChecker) clearInterval(this.timeoutChecker)
    return this.flush()
  }

  startSpan(
    name: string,
    options?: {
      kind?: SpanKind
      parent?: SpanContext
      attributes?: Record<string, unknown>
      conversationId?: string
      taskId?: string
    }
  ): Span {
    if (!this.config.enabled) return NO_OP_SPAN

    const traceId = options?.parent?.traceId ?? this.generateTraceId()
    const spanId = this.generateSpanId()
    
    const span = new SpanImpl({
      context: { traceId, spanId, parentSpanId: options?.parent?.spanId },
      name,
      kind: options?.kind ?? 'internal',
      startTimeMs: Date.now(),
      attributes: options?.attributes ?? {},
      conversationId: options?.conversationId,
      taskId: options?.taskId,
      tracer: this
    })
    
    this.activeSpans.set(spanId, span)
    return span
  }

  /**
   * Context manager style for automatic end() and error capture.
   */
  async withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    options?: Parameters<Tracer['startSpan']>[1]
  ): Promise<T> {
    const span = this.startSpan(name, options)
    try {
      const result = await fn(span)
      if (span.status === 'unset') span.setStatus('ok')
      return result
    } catch (err) {
      span.setStatus('error', String(err))
      span.setAttribute('error.stack', err instanceof Error ? err.stack : undefined)
      throw err
    } finally {
      span.end()
    }
  }

  /** Called by Span.end() */
  onSpanEnd(span: SpanImpl): void {
    this.activeSpans.delete(span.context.spanId)
    const serialized = this.serialize(span)
    this.persistAsync(serialized)
    this.eventBus.emit('trace:span-ended', serialized)
  }

  private async persistAsync(span: SerializedSpan): Promise<void> {
    try {
      await this.persistence.write(span)
    } catch (err) {
      this.buffer.push(span)
      if (this.buffer.length > this.config.bufferLimit) {
        const dropped = this.buffer.shift()
        this.logger.warn('trace.buffer.overflow.dropped', { 
          droppedSpanId: dropped?.spanId 
        })
      }
    }
  }

  private serialize(span: SpanImpl): SerializedSpan {
    return {
      traceId: span.context.traceId,
      spanId: span.context.spanId,
      parentSpanId: span.context.parentSpanId,
      name: span.name,
      kind: span.kind,
      startTimeMs: span.startTimeMs,
      endTimeMs: span.endTimeMs ?? Date.now(),
      durationMs: (span.endTimeMs ?? Date.now()) - span.startTimeMs,
      status: span.status,
      statusMessage: span.statusMessage,
      attributes: this.redactAttributes(span.attributes),
      events: span.events.map(e => ({
        ...e,
        attributes: this.redactAttributes(e.attributes)
      })),
      conversationId: span.conversationId,
      taskId: span.taskId
    }
  }

  private redactAttributes(attrs: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(attrs)) {
      if (this.config.sensitiveKeyPatterns.some(p => p.test(key))) {
        result[key] = '[REDACTED]'
      } else {
        result[key] = this.truncateIfLarge(value)
      }
    }
    return result
  }

  private checkTimeouts(): void {
    const now = Date.now()
    for (const [id, span] of this.activeSpans.entries()) {
      if (now - span.startTimeMs > this.config.spanTimeoutMs) {
        this.logger.warn('trace.span.timeout', { 
          spanId: id, 
          name: span.name 
        })
        span.setStatus('error', 'span timeout')
        span.end()  // triggers onSpanEnd, which removes from activeSpans
      }
    }
  }

  async flush(): Promise<void> {
    while (this.buffer.length > 0) {
      const batch = this.buffer.splice(0, 100)
      try {
        await this.persistence.writeBatch(batch)
      } catch (err) {
        this.logger.error('trace.flush.failed', { err, remainingCount: batch.length })
        this.buffer.unshift(...batch)
        break
      }
    }
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 3.3.2 - Trace 持久化存储与查询

**用户故事：** 作为系统，我需要将所有 Span 持久化到可查询的存储中，
以便支持回放、审计和可观测性查询。

#### 功能描述

Trace 数据存储在 `.sibylla/trace/trace.db`（独立 SQLite），与记忆索引隔离。
表结构针对两种查询优化：

- **按 trace_id 查询完整 Span 树**（用于 Trace Inspector）
- **按时间范围 + attributes 过滤**（用于性能分析、异常排查）

保留策略：默认 7 天自动清理；用户可锁定特定 trace_id 永不清理；
每日 02:00 执行清理任务（可配置）。

#### 验收标准

1. When a Span is finalized, the system shall insert it into trace.db within 1 second
2. When multiple Spans write concurrently, the system shall use WAL mode and batch commits to prevent lock contention
3. When querying by trace_id, the system shall return full Span tree sorted by start_time within 50ms for traces with < 100 spans
4. When querying by time range with attribute filter, the system shall use composite indexes and return within 200ms for databases < 1M rows
5. When database size exceeds 500MB, the system shall log warning and suggest cleanup
6. When daily cleanup runs, the system shall delete Spans older than retention_days (default 7) except those in locked_traces table
7. When database is corrupted, the system shall log error, rename to `trace.db.corrupted-{timestamp}`, and recreate (zero-downtime recovery)
8. When user requests export, the system shall produce a self-contained JSON bundle with all Spans for specified trace_ids

#### 技术规格

```typescript
// sibylla-desktop/src/main/services/trace/trace-store.ts

export interface TraceQueryFilter {
  traceId?: string
  spanName?: string
  kind?: SpanKind
  status?: SpanStatus
  conversationId?: string
  taskId?: string
  startTimeFrom?: number
  startTimeTo?: number
  minDurationMs?: number
  attributeFilters?: Record<string, unknown>
  limit?: number
  offset?: number
}

export class TraceStore {
  private db: SQLiteDB

  async initialize(): Promise<void> {
    this.db = openSQLite(this.storePath(), { mode: 'wal' })
    
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS spans (
        trace_id TEXT NOT NULL,
        span_id TEXT PRIMARY KEY,
        parent_span_id TEXT,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        start_time_ms INTEGER NOT NULL,
        end_time_ms INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        status TEXT NOT NULL,
        status_message TEXT,
        attributes TEXT NOT NULL,    -- JSON
        events TEXT NOT NULL,        -- JSON array
        conversation_id TEXT,
        task_id TEXT,
        workspace_id TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_trace_id ON spans(trace_id);
      CREATE INDEX IF NOT EXISTS idx_start_time ON spans(start_time_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_conversation ON spans(conversation_id, start_time_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_task ON spans(task_id);
      CREATE INDEX IF NOT EXISTS idx_status_duration ON spans(status, duration_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_name_time ON spans(name, start_time_ms DESC);
      
      CREATE TABLE IF NOT EXISTS locked_traces (
        trace_id TEXT PRIMARY KEY,
        locked_at INTEGER NOT NULL,
        reason TEXT
      );
    `)
    
    await this.runIntegrityCheck()
  }

  async write(span: SerializedSpan): Promise<void> {
    this.db.prepare(`
      INSERT OR REPLACE INTO spans 
      (trace_id, span_id, parent_span_id, name, kind,
       start_time_ms, end_time_ms, duration_ms, status, status_message,
       attributes, events, conversation_id, task_id, workspace_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      span.traceId, span.spanId, span.parentSpanId ?? null,
      span.name, span.kind,
      span.startTimeMs, span.endTimeMs, span.durationMs,
      span.status, span.statusMessage ?? null,
      JSON.stringify(span.attributes),
      JSON.stringify(span.events),
      span.conversationId ?? null,
      span.taskId ?? null,
      this.currentWorkspaceId()
    )
  }

  async writeBatch(spans: SerializedSpan[]): Promise<void> {
    const tx = this.db.transaction((items: SerializedSpan[]) => {
      for (const span of items) this.writeSync(span)
    })
    tx(spans)
  }

  async getTraceTree(traceId: string): Promise<SerializedSpan[]> {
    const rows = this.db.prepare(`
      SELECT * FROM spans WHERE trace_id = ? ORDER BY start_time_ms ASC
    `).all(traceId)
    return rows.map(r => this.rowToSpan(r))
  }

  async query(filter: TraceQueryFilter): Promise<SerializedSpan[]> {
    const { sql, params } = this.buildQuery(filter)
    const rows = this.db.prepare(sql).all(...params)
    return rows.map(r => this.rowToSpan(r))
  }

  async lockTrace(traceId: string, reason?: string): Promise<void> {
    this.db.prepare(`
      INSERT OR REPLACE INTO locked_traces (trace_id, locked_at, reason)
      VALUES (?, ?, ?)
    `).run(traceId, Date.now(), reason ?? null)
  }

  async cleanup(retentionDays: number): Promise<{ deleted: number }> {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    const result = this.db.prepare(`
      DELETE FROM spans 
      WHERE start_time_ms < ?
        AND trace_id NOT IN (SELECT trace_id FROM locked_traces)
    `).run(cutoff)
    
    return { deleted: result.changes }
  }

  async exportTrace(traceIds: string[]): Promise<TraceExportBundle> {
    const spans = traceIds.flatMap(id => this.getTraceTreeSync(id))
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      workspaceId: this.currentWorkspaceId(),
      spans,
      checksum: this.computeChecksum(spans)
    }
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 3.3.3 - progress.md 任务台账格式与管理器

**用户故事：** 作为用户，我希望有一份实时更新的任务台账，让我一眼看出
"AI 现在在做什么、刚做完什么、下一步要做什么"。

#### 功能描述

progress.md 位于工作区根目录，格式为结构化 Markdown，分三区：

```markdown
---
version: 1
updated: 2026-04-18T10:30:00Z
active_count: 1
completed_today: 5
---

# AI 任务台账

## 🔄 进行中

### [T-20260418-103000] 整理 Sprint 3.3 设计文档
- **开始：** 2026-04-18 10:30
- **模式：** Plan
- **已耗时：** 3m 12s
- **Trace：** [查看执行轨迹](sibylla://trace/7f3a2b1c...)
- **进度：**
  - ✅ 读取 Sprint 3.1、3.2 文档
  - ✅ 分析兼容性
  - 🔄 起草需求章节（需求 3.3.1 已完成，3.3.2 进行中）
  - ⏸ 待完成：验收清单、风险分析

## ✅ 已完成（最近 10 条）

### [T-20260418-094500] 生成 PRD 初稿 ✓
- **耗时：** 8m 23s | **Trace：** [查看](sibylla://trace/...)
- **产出：** `specs/requirements/payment-flow-v2.md`
- **结果：** 成功（2 个低置信度章节已标注）

### [T-20260418-090100] 分析竞品数据 ✓
- **耗时：** 5m 11s | **Trace：** [查看](sibylla://trace/...)
- **产出：** `specs/analysis/competitor-q1.md`
- **结果：** 成功

## 📋 排队中

（暂无）

---

## 归档

> 3 天前及更早的任务已归档至 `.sibylla/trace/progress-archive/`
```

AI 在执行任一任务前**必须**调用 `ProgressLedger.declare()` 声明任务；
执行过程中调用 `update()` 更新进度；完成时调用 `complete()` 或 `fail()`。

progress.md 由 Trace 系统自动渲染，**不是手动维护的文本文件**——虽然
用户可以手动编辑附加备注，但 AI 自动写入的部分会被下次更新覆盖。
用户备注需写在专门的 `<!-- user-note -->` 区域内。

#### 验收标准

1. When AI declares a new task, the system shall insert entry into `进行中` section with task ID, start time, current mode, and empty checklist
2. When AI updates task progress, the system shall modify only the target task's entry (atomic, no race with concurrent tasks)
3. When task completes, the system shall move entry from `进行中` to `已完成` section, update duration, and add result summary
4. When task fails, the system shall move to `已完成` with ❌ marker and failure reason
5. When `已完成` section exceeds 10 entries, the system shall archive oldest to `.sibylla/trace/progress-archive/{YYYY-MM}.md`
6. When progress.md is edited by user within `<!-- user-note -->` blocks, the system shall preserve those blocks across updates
7. When progress.md is edited by user outside user-note blocks, the system shall detect conflict on next AI update, prompt user via notification, and create `.progress.conflict.md` backup
8. When task has associated Trace, the entry shall include clickable `sibylla://trace/{traceId}` link
9. When multiple tasks run concurrently (e.g. background memory checkpoint while user chats), all shall appear in `进行中` section
10. When progress.md write fails, the system shall retry 3 times with backoff; final failure does NOT abort task execution (degraded but continues)

#### 技术规格

```typescript
// sibylla-desktop/src/main/services/progress/types.ts

export type TaskState = 'queued' | 'running' | 'paused' | 'completed' | 'failed'

export interface TaskRecord {
  id: string                    // T-YYYYMMDD-HHMMSS
  title: string
  state: TaskState
  mode?: 'plan' | 'analyze' | 'review' | 'free'   // Sprint 3.4 dependency
  traceId?: string
  conversationId?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  durationMs?: number
  checklist: Array<{
    description: string
    status: 'pending' | 'in_progress' | 'done' | 'skipped'
  }>
  outputs: Array<{ type: 'file' | 'message'; ref: string }>
  resultSummary?: string
  failureReason?: string
  userNotes?: string
}

export interface ProgressSnapshot {
  active: TaskRecord[]
  completedRecent: TaskRecord[]    // last 10
  queued: TaskRecord[]
  updatedAt: string
}
```

```typescript
// sibylla-desktop/src/main/services/progress/progress-ledger.ts

export class ProgressLedger {
  private tasks: Map<string, TaskRecord> = new Map()
  private writeQueue: Promise<void> = Promise.resolve()
  private userNoteBlocks: Map<string, string> = new Map()

  constructor(
    private workspaceRoot: string,
    private fileManager: FileManager,
    private tracer: Tracer,
    private eventBus: EventBus,
    private logger: Logger
  ) {}

  async initialize(): Promise<void> {
    await this.load()
  }

  async declare(input: {
    title: string
    mode?: TaskRecord['mode']
    traceId?: string
    conversationId?: string
    plannedChecklist?: string[]
  }): Promise<TaskRecord> {
    const id = this.generateTaskId()
    const now = new Date().toISOString()
    
    const task: TaskRecord = {
      id,
      title: input.title,
      state: 'running',
      mode: input.mode,
      traceId: input.traceId,
      conversationId: input.conversationId,
      createdAt: now,
      startedAt: now,
      checklist: (input.plannedChecklist ?? []).map(desc => ({
        description: desc,
        status: 'pending'
      })),
      outputs: []
    }
    
    this.tasks.set(id, task)
    await this.persist()
    this.eventBus.emit('progress:task-declared', task)
    return task
  }

  async update(taskId: string, patch: {
    checklistUpdates?: Array<{ index: number; status: ChecklistItemStatus }>
    newChecklistItems?: string[]
    output?: { type: 'file' | 'message'; ref: string }
  }): Promise<TaskRecord> {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error(`Task not found: ${taskId}`)
    if (task.state !== 'running') throw new Error(`Task not running: ${taskId}`)

    if (patch.checklistUpdates) {
      for (const { index, status } of patch.checklistUpdates) {
        if (task.checklist[index]) task.checklist[index].status = status
      }
    }
    if (patch.newChecklistItems) {
      for (const desc of patch.newChecklistItems) {
        task.checklist.push({ description: desc, status: 'pending' })
      }
    }
    if (patch.output) {
      task.outputs.push(patch.output)
    }
    
    await this.persist()
    this.eventBus.emit('progress:task-updated', task)
    return task
  }

  async complete(taskId: string, summary: string): Promise<TaskRecord> {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error(`Task not found: ${taskId}`)
    
    task.state = 'completed'
    task.completedAt = new Date().toISOString()
    task.durationMs = Date.now() - new Date(task.startedAt!).getTime()
    task.resultSummary = summary
    
    await this.persist()
    await this.maybeArchive()
    this.eventBus.emit('progress:task-completed', task)
    return task
  }

  async fail(taskId: string, reason: string): Promise<TaskRecord> {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error(`Task not found: ${taskId}`)
    
    task.state = 'failed'
    task.completedAt = new Date().toISOString()
    task.durationMs = Date.now() - new Date(task.startedAt!).getTime()
    task.failureReason = reason
    
    await this.persist()
    await this.maybeArchive()
    this.eventBus.emit('progress:task-failed', task)
    return task
  }

  /** Serialize writes to avoid race conditions. */
  private persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(() => this.doPersist())
    return this.writeQueue
  }

  private async doPersist(): Promise<void> {
    const snapshot = this.buildSnapshot()
    const content = this.render(snapshot)
    
    await this.withRetry(async () => {
      const existingFile = await this.fileManager.exists(this.progressPath())
        ? await this.fileManager.readFile(this.progressPath())
        : null
      
      if (existingFile) {
        await this.detectUserEdits(existingFile)
      }
      
      await this.fileManager.atomicWrite(this.progressPath(), content)
    }, 3)
  }

  private render(snapshot: ProgressSnapshot): string {
    const fm = stringifyYaml({
      version: 1,
      updated: snapshot.updatedAt,
      active_count: snapshot.active.length,
      completed_today: this.countCompletedToday()
    })
    
    const sections = [
      `---\n${fm}---\n`,
      `# AI 任务台账\n`,
      this.renderActiveSection(snapshot.active),
      this.renderCompletedSection(snapshot.completedRecent),
      this.renderQueuedSection(snapshot.queued),
      this.renderArchiveNote()
    ]
    
    return sections.join('\n\n')
  }

  private renderActiveSection(active: TaskRecord[]): string {
    if (active.length === 0) return `## 🔄 进行中\n\n（暂无进行中的任务）`
    
    const entries = active.map(t => this.renderTaskEntry(t, 'running')).join('\n\n')
    return `## 🔄 进行中\n\n${entries}`
  }

  private renderTaskEntry(task: TaskRecord, mode: 'running' | 'completed'): string {
    const traceLink = task.traceId 
      ? `[查看执行轨迹](sibylla://trace/${task.traceId})` 
      : '(无)'
    
    if (mode === 'running') {
      const elapsed = this.formatDuration(Date.now() - new Date(task.startedAt!).getTime())
      const checklistStr = task.checklist.map(c => {
        const icon = { pending: '⏸', in_progress: '🔄', done: '✅', skipped: '⏭' }[c.status]
        return `  - ${icon} ${c.description}`
      }).join('\n')
      
      const userNote = this.userNoteBlocks.get(task.id)
      const noteBlock = `<!-- user-note:${task.id} -->\n${userNote ?? ''}\n<!-- /user-note:${task.id} -->`
      
      return [
        `### [${task.id}] ${task.title}`,
        `- **开始：** ${this.formatTimestamp(task.startedAt!)}`,
        task.mode ? `- **模式：** ${this.formatMode(task.mode)}` : '',
        `- **已耗时：** ${elapsed}`,
        `- **Trace：** ${traceLink}`,
        `- **进度：**\n${checklistStr}`,
        noteBlock
      ].filter(Boolean).join('\n')
    }
    
    // completed
    const icon = task.state === 'completed' ? '✓' : '❌'
    const duration = this.formatDuration(task.durationMs!)
    const outputsStr = task.outputs.map(o => 
      o.type === 'file' ? `\`${o.ref}\`` : o.ref
    ).join(', ')
    
    return [
      `### [${task.id}] ${task.title} ${icon}`,
      `- **耗时：** ${duration} | **Trace：** [查看](sibylla://trace/${task.traceId ?? 'none'})`,
      task.outputs.length > 0 ? `- **产出：** ${outputsStr}` : '',
      task.state === 'completed' 
        ? `- **结果：** ${task.resultSummary}` 
        : `- **失败原因：** ${task.failureReason}`
    ].filter(Boolean).join('\n')
  }

  private async detectUserEdits(existingContent: string): Promise<void> {
    const existingNotes = this.extractUserNotes(existingContent)
    this.userNoteBlocks = existingNotes
    
    // Detect edits outside user-note blocks
    const strippedExisting = this.stripUserNotes(existingContent)
    const expectedStripped = this.stripUserNotes(this.render(this.buildLastSnapshot()))
    
    if (strippedExisting !== expectedStripped && this.lastRenderHash) {
      // User edited the file outside user-note blocks
      this.logger.warn('progress.user-edit.detected')
      await this.createConflictBackup(existingContent)
      this.eventBus.emit('progress:user-edit-conflict')
    }
  }

  private async maybeArchive(): Promise<void> {
    const completed = Array.from(this.tasks.values())
      .filter(t => t.state === 'completed' || t.state === 'failed')
      .sort((a, b) => 
        new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime()
      )
    
    if (completed.length <= 10) return
    
    const toArchive = completed.slice(10)
    const month = new Date().toISOString().substring(0, 7)
    const archivePath = path.join(
      this.workspaceRoot, 
      `.sibylla/trace/progress-archive/${month}.md`
    )
    
    const archiveContent = toArchive.map(t => 
      this.renderTaskEntry(t, 'completed')
    ).join('\n\n')
    
    await this.fileManager.appendFile(archivePath, archiveContent + '\n\n')
    
    for (const task of toArchive) {
      this.tasks.delete(task.id)
    }
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 3.3.4 - AI 任务自声明契约与 Tracer 集成

**用户故事：** 作为用户，我希望 AI 在开始任何多步骤工作前，主动声明"我要做什么"，
让我有机会在它跑偏前叫停。

#### 功能描述

这是一条**契约性需求**：任何涉及多步骤或文件变更的 AI 执行，必须遵循：

1. **声明**：通过 system prompt 指令要求 AI 在开始前输出结构化任务声明
2. **拦截**：AI Orchestrator 解析声明，调用 `ProgressLedger.declare()` 创建任务
3. **绑定**：AI 后续生成的每个 span 自动带上该 `taskId`，形成 Trace 与任务的双向关联
4. **汇报**：AI 执行过程中输出 checkpoint 指令（格式化 JSON 或特殊 Markdown 块），
   自动调用 `update()`
5. **归档**：响应结束时自动调用 `complete()` 或 `fail()`

任务声明格式（AI 输出中的特殊块）：

```
<!-- sibylla:task-declare
{
  "title": "整理 Sprint 3.3 设计文档",
  "planned_steps": [
    "读取 Sprint 3.1、3.2 文档",
    "分析兼容性",
    "起草需求章节",
    "撰写验收清单"
  ],
  "estimated_duration_min": 10
}
-->
```

#### 验收标准

1. When AI response contains a `sibylla:task-declare` block, the Orchestrator shall parse it, call `ProgressLedger.declare()`, and bind the returned taskId to the current Trace
2. When AI response contains a `sibylla:task-update` block, the system shall call `ProgressLedger.update()` accordingly
3. When AI response ends without explicit completion block, the system shall auto-complete with summary "（AI 未显式归档）"
4. When AI declares a task but errors before updates, the system shall auto-fail after 2x estimated_duration_min with reason "任务超时未更新"
5. When AI response has malformed declare/update block, the system shall log warning, skip the block, and allow execution to continue (non-blocking)
6. When a simple single-turn response (no file changes, < 30s duration) occurs, the system shall NOT require task declaration
7. When task declaration is required (via prompt hint) but AI fails to declare, the system shall wrap the entire response as a single "unnamed" task

#### 技术规格

```typescript
// sibylla-desktop/src/main/services/ai/orchestrator.ts (Sprint 3.1 扩展)

export class AIOrchestrator {
  // ... existing fields
  
  constructor(
    // ... existing dependencies
    private progressLedger: ProgressLedger,
    private tracer: Tracer
  ) {}

  async handleMessage(request: AIMessageRequest): Promise<AIMessageResponse> {
    return await this.tracer.withSpan(
      'ai.handle-message',
      async (rootSpan) => {
        rootSpan.setAttributes({
          'conversation.id': request.conversationId,
          'message.role': 'user',
          'workspace.id': this.workspaceId
        })
        
        // Inject task declaration hint into system prompt
        const systemPrompt = this.buildSystemPrompt({
          ...request,
          taskDeclarationHint: this.shouldRequireTaskDeclaration(request)
        })
        
        // Stream response and parse task blocks on-the-fly
        const stream = await this.llmCall(systemPrompt, request, rootSpan)
        const parser = new TaskDeclarationParser()
        let taskId: string | null = null
        let accumulatedContent = ''
        
        for await (const chunk of stream) {
          accumulatedContent += chunk.content
          const blocks = parser.parseNewBlocks(accumulatedContent)
          
          for (const block of blocks) {
            if (block.type === 'declare') {
              const task = await this.progressLedger.declare({
                title: block.data.title,
                traceId: rootSpan.context.traceId,
                conversationId: request.conversationId,
                plannedChecklist: block.data.planned_steps
              })
              taskId = task.id
              rootSpan.setAttribute('task.id', task.id)
              
            } else if (block.type === 'update' && taskId) {
              await this.progressLedger.update(taskId, block.data)
              
            } else if (block.type === 'complete' && taskId) {
              await this.progressLedger.complete(taskId, block.data.summary)
              taskId = null
            }
          }
          
          yield chunk
        }
        
        // Auto-complete if task was declared but never explicitly completed
        if (taskId) {
          await this.progressLedger.complete(taskId, '（AI 未显式归档）')
        }
      },
      { kind: 'ai-call', conversationId: request.conversationId }
    )
  }

  private shouldRequireTaskDeclaration(request: AIMessageRequest): boolean {
    // Heuristics: if user message is long, mentions multiple steps, 
    // or explicitly asks for a plan
    const msg = request.message.toLowerCase()
    if (msg.length > 200) return true
    if (/计划|步骤|分析|撰写|生成文档/.test(msg)) return true
    return false
  }
}
```

```typescript
// sibylla-desktop/src/main/services/ai/task-declaration-parser.ts

export type ParsedBlock =
  | { type: 'declare'; data: DeclareBlockData }
  | { type: 'update'; data: UpdateBlockData }
  | { type: 'complete'; data: CompleteBlockData }

export class TaskDeclarationParser {
  private consumedRanges: Array<[number, number]> = []

  parseNewBlocks(accumulatedContent: string): ParsedBlock[] {
    const results: ParsedBlock[] = []
    const regex = /<!--\s*sibylla:task-(declare|update|complete)\s*([\s\S]*?)-->/g
    let match
    
    while ((match = regex.exec(accumulatedContent)) !== null) {
      const range: [number, number] = [match.index, match.index + match[0].length]
      if (this.consumedRanges.some(r => r[0] === range[0])) continue
      
      try {
        const data = JSON.parse(match[2].trim())
        results.push({ type: match[1] as any, data })
        this.consumedRanges.push(range)
      } catch (err) {
        // Malformed block - skip, log warning
        console.warn('task-declaration-parser.malformed', { match: match[0] })
      }
    }
    
    return results
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 3.3.5 - 对话气泡执行轨迹视图（用户级）

**用户故事：** 作为用户，当 AI 回复给我一条消息后，我想能展开查看"AI 这条回复
背后都做了什么"，不需要打开专门的开发者工具。

#### 功能描述

每条 AI 消息气泡下方显示一个"展开执行轨迹"按钮，点击后在气泡内展开一个
**简化的时间线视图**（不是完整 Span 树）：

```
🔍 执行轨迹（用时 12.3s）
├─ 📥 读取上下文（0.3s）— 5 个文件，1 条记忆
├─ 🧠 AI 思考（8.2s）— Claude Sonnet, 4,230 tokens
│   └─ 🛡️ Guardrail 检查（通过）
├─ 📊 Sensor 评估（1.1s）— 3/3 通过
├─ ⚖️ Evaluator 审查（2.5s）— Dual harness 一致
└─ 💾 写入 specs/requirements/xxx.md（0.2s）

[查看完整 Trace →]
```

用户视图过滤规则：
- 只展示用户能理解的 Span（隐藏实现细节类 Span）
- 按 kind 和 name 白名单过滤
- 耗时异常的 Span（> 均值 3 倍）高亮显示
- 失败或降级的 Span 红色标记

#### 验收标准

1. When AI message is complete, the bubble shall show "🔍 展开执行轨迹" button
2. When user clicks the button, the system shall render simplified timeline inline within 100ms
3. When rendering timeline, the system shall apply user-visible Span filter (whitelist) and group similar consecutive Spans
4. When any Span has status=error or kind=degradation-event, it shall be highlighted red with tooltip showing error message
5. When a Span's duration exceeds 3x the median of same-name Spans in the same trace, it shall be highlighted orange as "unusually slow"
6. When user clicks a Span row, the system shall show detail popover with attributes (redacted)
7. When user clicks "查看完整 Trace", the system shall open Trace Inspector in a new panel/window with the trace_id pre-selected
8. When Trace data is still being written (e.g. late-arriving events), the view shall auto-refresh once on buffer flush

#### 技术规格

```typescript
// sibylla-desktop/src/renderer/components/conversation/ExecutionTrace.tsx

const USER_VISIBLE_SPANS: Record<string, { 
  label: string
  icon: string
  order: number
}> = {
  'context.assemble': { label: '读取上下文', icon: '📥', order: 1 },
  'ai.llm-call': { label: 'AI 思考', icon: '🧠', order: 2 },
  'harness.guardrail': { label: 'Guardrail 检查', icon: '🛡️', order: 3 },
  'harness.sensor': { label: 'Sensor 评估', icon: '📊', order: 4 },
  'harness.evaluator': { label: 'Evaluator 审查', icon: '⚖️', order: 5 },
  'tool.file-write': { label: '写入文件', icon: '💾', order: 6 },
  'tool.file-read': { label: '读取文件', icon: '📄', order: 7 },
  'memory.search': { label: '检索记忆', icon: '🧩', order: 8 }
}

export function ExecutionTrace({ messageId, traceId }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [spans, setSpans] = useState<SerializedSpan[] | null>(null)
  const [loading, setLoading] = useState(false)

  const loadTrace = async () => {
    setLoading(true)
    try {
      const data = await window.sibylla.trace.getTraceTree(traceId)
      setSpans(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (expanded && !spans) loadTrace()
  }, [expanded])

  // Listen for late-arriving spans
  useEffect(() => {
    if (!expanded) return
    const unsubscribe = window.sibylla.onTraceUpdate(traceId, () => loadTrace())
    return unsubscribe
  }, [expanded, traceId])

  if (!expanded) {
    return (
      <button 
        className="execution-trace-toggle" 
        onClick={() => setExpanded(true)}
      >
        🔍 展开执行轨迹
      </button>
    )
  }

  if (loading || !spans) {
    return <div className="execution-trace-loading">加载中…</div>
  }

  const filteredSpans = filterAndGroupSpans(spans)
  const rootDuration = spans.find(s => !s.parentSpanId)?.durationMs ?? 0
  const medians = computeMedianDurationsByName(spans)

  return (
    <div className="execution-trace-view">
      <div className="trace-header">
        🔍 执行轨迹（用时 {formatDuration(rootDuration)}）
      </div>
      <ul className="trace-timeline">
        {filteredSpans.map(span => (
          <TraceSpanRow 
            key={span.spanId}
            span={span}
            medianDuration={medians[span.name]}
          />
        ))}
      </ul>
      <button 
        className="view-full-trace"
        onClick={() => window.sibylla.inspector.open(traceId)}
      >
        查看完整 Trace →
      </button>
    </div>
  )
}

function filterAndGroupSpans(spans: SerializedSpan[]): FilteredSpan[] {
  const visible = spans.filter(s => USER_VISIBLE_SPANS[s.name])
  const grouped = groupConsecutiveSameName(visible)
  return grouped.sort((a, b) => a.startTimeMs - b.startTimeMs)
}
```

#### 优先级

P0 - 必须完成

---

### 需求 3.3.6 - Trace Inspector 开发者视图

**用户故事：** 作为开发者或高级用户，我需要一个功能完整的 Trace 检查工具，
可以深入每一个 Span、查看所有属性、追踪错误根因。

#### 功能描述

Trace Inspector 是独立的面板（可通过命令面板 `Ctrl+Shift+T` 打开），包含：

- **左侧：Trace 列表**（按时间倒序，支持搜索、过滤）
- **中间：Span 树**（类似 Chrome DevTools 的 Performance 火焰图）
- **右侧：Span 详情**（attributes、events、timing、父子链）
- **底部：搜索栏**（全文搜索 attribute values）

核心能力：
- **火焰图视图**：横轴时间，纵轴父子层级，块的宽度表示耗时
- **调用链视图**：传统的嵌套树形
- **时间线视图**：纯时间顺序列表
- **性能分析**：按 name 聚合的统计表（平均耗时、P95、次数）
- **对比模式**：选两条 Trace 并排对比
- **导出**：JSON / HAR-like 格式

#### 验收标准

1. When user presses `Ctrl+Shift+T` (or `Cmd+Shift+T` on macOS), the system shall open Trace Inspector panel
2. When inspector opens, left list shall show last 100 traces sorted by start time DESC
3. When user selects a trace, middle view shall render flame graph within 300ms for traces with < 500 spans
4. When user clicks a span in flame graph, right detail pane shall show all attributes, events, status, timing
5. When user searches in bottom bar, the system shall search attribute values across all spans in current trace and highlight matches
6. When user enables "compare mode", a second trace can be loaded and displayed alongside; common spans aligned by name
7. When user exports, the system shall produce a self-contained JSON bundle including all Spans and a summary header
8. When trace contains errors (status=error), error spans shall be visually distinct (red border) and inspector shall auto-expand to error
9. When user clicks "⚡ Performance" tab, the system shall show aggregated stats (by span name) with sortable columns

#### 技术规格

```typescript
// sibylla-desktop/src/renderer/components/inspector/TraceInspector.tsx

export function TraceInspector() {
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null)
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'flamegraph' | 'tree' | 'timeline' | 'perf'>('flamegraph')
  const [compareTraceId, setCompareTraceId] = useState<string | null>(null)

  return (
    <div className="trace-inspector">
      <div className="inspector-sidebar">
        <TraceList 
          selected={selectedTraceId}
          onSelect={setSelectedTraceId}
        />
      </div>
      
      <div className="inspector-main">
        <InspectorToolbar 
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onCompareMode={() => setCompareTraceId(selectedTraceId)}
          onExport={() => selectedTraceId && exportTrace(selectedTraceId)}
        />
        
        <div className="inspector-content">
          {viewMode === 'flamegraph' && selectedTraceId && (
            <FlameGraph 
              traceId={selectedTraceId}
              onSpanClick={setSelectedSpanId}
            />
          )}
          {viewMode === 'tree' && selectedTraceId && (
            <SpanTreeView traceId={selectedTraceId} onSpanClick={setSelectedSpanId} />
          )}
          {viewMode === 'timeline' && selectedTraceId && (
            <TimelineView traceId={selectedTraceId} onSpanClick={setSelectedSpanId} />
          )}
          {viewMode === 'perf' && selectedTraceId && (
            <PerformanceStats traceId={selectedTraceId} />
          )}
        </div>
      </div>
      
      <div className="inspector-detail">
        {selectedSpanId && <SpanDetailPane spanId={selectedSpanId} />}
      </div>
      
      <SearchBar traceId={selectedTraceId} />
    </div>
  )
}
```

```typescript
// FlameGraph uses Canvas for performance with large traces
export function FlameGraph({ traceId, onSpanClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [spans, setSpans] = useState<SerializedSpan[]>([])
  
  useEffect(() => {
    window.sibylla.trace.getTraceTree(traceId).then(setSpans)
  }, [traceId])

  useEffect(() => {
    if (!canvasRef.current || spans.length === 0) return
    renderFlameGraph(canvasRef.current, spans)
  }, [spans])

  return (
    <canvas 
      ref={canvasRef}
      onClick={(e) => {
        const span = hitTest(e.nativeEvent, spans, canvasRef.current!)
        if (span) onSpanClick(span.spanId)
      }}
    />
  )
}
```

#### 优先级

P1 - 应该完成

---

### 需求 3.3.7 - 性能指标与阈值预警

**用户故事：** 作为用户，当 AI 变慢、Token 消耗异常、错误率升高时，
我希望系统主动告诉我，而不是等我察觉。

#### 功能描述

Trace 系统内置 PerformanceMonitor，每分钟聚合一次滚动窗口内的指标：

- **慢调用**：LLM 调用 > 10 秒（可配置）
- **Token 异常**：单次调用 > 30K tokens
- **错误率**：最近 50 次 AI 调用错误 > 5%
- **降级频次**：15 分钟内降级事件 > 3 次
- **未结束 Span**：活跃 Span 数 > 100

告警策略：
- **静默累积**：首次达标记录但不打扰
- **持续达标**：连续 3 次窗口仍达标，弹出通知
- **可屏蔽**：用户可屏蔽特定告警类型 24 小时

#### 验收标准

1. When an LLM span's duration exceeds `slowCallThresholdMs` (default 10000), the system shall tag it with `alert.slow=true` attribute
2. When aggregation runs (every 60s), the system shall compute: avg/p95/p99 duration, error rate, token stats for rolling 15-minute window
3. When any threshold is breached 3 consecutive windows, the system shall emit notification via `eventBus.emit('performance:alert', payload)`
4. When user dismisses an alert with "屏蔽 24 小时", the system shall suppress same alert type until specified time
5. When the performance stats panel is opened, the system shall show current metrics, historical chart, and recent alerts
6. When alert is about cost (token consumption), the system shall include estimated $ cost based on model pricing config
7. When the Electron app restarts, persisted alert suppressions shall be restored
8. When all thresholds return to normal for 5 consecutive windows, the system shall auto-clear the alert

#### 技术规格

```typescript
// sibylla-desktop/src/main/services/trace/performance-monitor.ts

export interface PerformanceMetrics {
  windowStart: number
  windowEnd: number
  llmCallCount: number
  llmCallAvgDurationMs: number
  llmCallP95DurationMs: number
  errorRate: number
  totalTokens: number
  estimatedCostUSD: number
  degradationCount: number
  activeSpanCount: number
}

export interface PerformanceAlert {
  id: string
  type: 'slow_call' | 'token_spike' | 'error_rate' | 'degradation' | 'leak'
  severity: 'info' | 'warn' | 'critical'
  message: string
  metrics: Partial<PerformanceMetrics>
  firstSeenAt: number
  consecutiveWindows: number
}

export class PerformanceMonitor {
  private readonly WINDOW_MS = 15 * 60 * 1000
  private readonly AGGREGATION_INTERVAL_MS = 60 * 1000
  private alertsStates: Map<string, AlertState> = new Map()
  private suppressions: Map<string, number> = new Map()

  constructor(
    private traceStore: TraceStore,
    private config: PerformanceConfig,
    private eventBus: EventBus,
    private logger: Logger
  ) {}

  start(): void {
    setInterval(() => this.aggregateAndAlert(), this.AGGREGATION_INTERVAL_MS)
  }

  private async aggregateAndAlert(): Promise<void> {
    const metrics = await this.computeMetrics()
    this.eventBus.emit('performance:metrics', metrics)
    
    for (const checker of this.alertCheckers()) {
      const breach = checker.check(metrics, this.config)
      const state = this.alertsStates.get(checker.type) ?? { consecutiveCount: 0 }
      
      if (breach) {
        state.consecutiveCount++
        
        if (state.consecutiveCount === 3 && !this.isSuppressed(checker.type)) {
          const alert: PerformanceAlert = {
            id: `alert-${Date.now()}`,
            type: checker.type,
            severity: checker.severity,
            message: checker.buildMessage(metrics),
            metrics,
            firstSeenAt: Date.now(),
            consecutiveWindows: 3
          }
          this.eventBus.emit('performance:alert', alert)
        }
      } else {
        if (state.consecutiveCount > 0) {
          state.consecutiveCount--
          if (state.consecutiveCount === 0 && state.wasAlerting) {
            this.eventBus.emit('performance:alert-cleared', { type: checker.type })
          }
        }
      }
      
      this.alertsStates.set(checker.type, state)
    }
  }

  suppress(alertType: string, durationMs: number): void {
    this.suppressions.set(alertType, Date.now() + durationMs)
  }

  private isSuppressed(alertType: string): boolean {
    const until = this.suppressions.get(alertType)
    return until !== undefined && until > Date.now()
  }
}
```

#### 优先级

P1 - 应该完成

---

### 需求 3.3.8 - Trace 回放与上下文重建

**用户故事：** 作为开发者，当我发现 AI 在某时刻给出了错误答案时，我想能
"回到那个时刻"，重建当时的上下文、记忆状态、配置，以便排查根因。

#### 功能描述

回放系统利用 Trace 中的 attributes 重建历史时刻的输入快照：

- **输入重建**：从 `ai.llm-call` span 的 attributes 提取完整 prompt、上下文、参数
- **状态重建**：查询 MEMORY.md 演化日志，还原该时刻的记忆状态
- **只读回放**：不能真的重新执行（副作用不可逆），但可在 Trace Inspector 中
  查看"如果给今天的 AI 同样输入会怎样"（需用户显式触发 `Rerun` 按钮）

`Rerun` 行为：
- 使用当前 AI 配置重新请求相同 prompt
- 新响应单独记录为新 Trace，通过 `replay_of` 属性关联原 Trace
- 用户可并排对比两次响应

#### 验收标准

1. When user clicks "重建快照" on a trace, the system shall gather: original prompt, context files at that time, memory snapshot, model params
2. When snapshot is requested but memory CHANGELOG has no entry for that time, the system shall use best-effort reconstruction and mark as "approximate"
3. When user clicks "Rerun", the system shall confirm via dialog (costs tokens, creates new trace), then execute with current config
4. When rerun completes, a new trace shall be created with attribute `replay.of=<original_trace_id>`
5. When user opens original trace, a "相关回放" section shall show all its reruns
6. When file that was referenced in original trace no longer exists, the rebuilt snapshot shall substitute with placeholder "[文件已删除]" and continue
7. When rerun feature is disabled in config, the button shall be hidden

#### 技术规格

```typescript
// sibylla-desktop/src/main/services/trace/replay-engine.ts

export interface TraceSnapshot {
  traceId: string
  reconstructedAt: string
  originalTimestamp: number
  isApproximate: boolean
  approximationReasons: string[]
  prompt: { system: string; user: string; assistant?: string }
  contextFiles: Array<{ path: string; contentAtTime: string; existsNow: boolean }>
  memorySnapshot: { entries: MemoryEntry[]; totalTokens: number }
  modelConfig: { model: string; temperature: number; maxTokens: number }
}

export class ReplayEngine {
  constructor(
    private traceStore: TraceStore,
    private memoryManager: MemoryManager,
    private fileManager: FileManager,
    private aiGateway: AIGatewayClient,
    private tracer: Tracer,
    private logger: Logger
  ) {}

  async rebuildSnapshot(traceId: string): Promise<TraceSnapshot> {
    const spans = await this.traceStore.getTraceTree(traceId)
    const rootSpan = spans.find(s => !s.parentSpanId)
    const llmSpan = spans.find(s => s.name === 'ai.llm-call')
    
    if (!llmSpan) {
      throw new Error('Trace does not contain LLM call; cannot rebuild.')
    }
    
    const approximationReasons: string[] = []
    
    // Prompt reconstruction
    const prompt = {
      system: llmSpan.attributes['prompt.system'] as string,
      user: llmSpan.attributes['prompt.user'] as string,
      assistant: llmSpan.attributes['response.content'] as string
    }
    
    // Context files
    const contextFiles = await this.reconstructContextFiles(
      llmSpan.attributes['context.files'] as string[],
      llmSpan.startTimeMs,
      approximationReasons
    )
    
    // Memory snapshot (via CHANGELOG reverse-replay)
    const memorySnapshot = await this.memoryManager.getSnapshotAt(
      new Date(llmSpan.startTimeMs)
    )
    if (!memorySnapshot.exact) {
      approximationReasons.push('memory_snapshot_approximate')
    }
    
    return {
      traceId,
      reconstructedAt: new Date().toISOString(),
      originalTimestamp: llmSpan.startTimeMs,
      isApproximate: approximationReasons.length > 0,
      approximationReasons,
      prompt,
      contextFiles,
      memorySnapshot: memorySnapshot.data,
      modelConfig: {
        model: llmSpan.attributes['model'] as string,
        temperature: llmSpan.attributes['temperature'] as number,
        maxTokens: llmSpan.attributes['max_tokens'] as number
      }
    }
  }

  async rerun(traceId: string): Promise<{ newTraceId: string }> {
    const snapshot = await this.rebuildSnapshot(traceId)
    
    const newTrace = await this.tracer.withSpan(
      'ai.llm-call.rerun',
      async (span) => {
        span.setAttributes({
          'replay.of': traceId,
          'replay.original_timestamp': snapshot.originalTimestamp,
          'replay.is_approximate': snapshot.isApproximate
        })
        
        const response = await this.aiGateway.chat({
          messages: [
            { role: 'system', content: snapshot.prompt.system },
            { role: 'user', content: snapshot.prompt.user }
          ],
          model: snapshot.modelConfig.model,
          temperature: snapshot.modelConfig.temperature
        })
        
        span.setAttribute('response.content', response.content)
        return span.context.traceId
      },
      { kind: 'ai-call' }
    )
    
    return { newTraceId: newTrace }
  }
}
```

#### 优先级

P2 - 可选完成

---

### 需求 3.3.9 - Trace 导出与脱敏

**用户故事：** 作为用户，我想把某条 Trace 分享给同事或提交给支持团队排查，
但我不希望把我的 API Key、个人数据等敏感信息一起发出去。

#### 功能描述

导出流程分三步：

1. **预检**：扫描所有 attributes，识别敏感字段（除默认规则外，用户可自定义）
2. **脱敏预览**：用户看到将被导出的全部内容，高亮哪些字段会被替换为 `[REDACTED]`
3. **确认导出**：生成 JSON 文件，包含完整 Span 树、Sibylla 版本、工作区匿名标识

导出包格式版本化（`export_version`），未来可被 Sibylla 或外部工具导入查看。

#### 验收标准

1. When user clicks "导出 Trace"，the system shall scan and show redaction preview within 1 second
2. When preview shows, all sensitive fields shall be listed with reason (matched pattern name)
3. When user adds custom redaction rule (regex on key or value), the preview shall update immediately
4. When user confirms export, the system shall write JSON file to user-chosen path with all [REDACTED] applied
5. When exported file exists, the system shall NOT contain raw values for: API keys, user emails, file paths containing usernames (e.g. `/Users/john/...` → `/Users/[USER]/...`)
6. When export file is imported back via "导入 Trace", the system shall display it in Trace Inspector with "imported" marker
7. When the export includes references to files, file contents shall NOT be embedded by default (user must explicitly opt-in with warning)

#### 技术规格

```typescript
// sibylla-desktop/src/main/services/trace/trace-exporter.ts

export interface RedactionRule {
  id: string
  keyPattern?: RegExp
  valuePattern?: RegExp
  reason: string
}

export interface TraceExportBundle {
  exportVersion: 1
  exportedAt: string
  sibyllaVersion: string
  workspaceIdAnonymized: string
  redactionRules: string[]
  spans: SerializedSpan[]
  checksum: string
}

export class TraceExporter {
  private readonly DEFAULT_RULES: RedactionRule[] = [
    { id: 'api_key', keyPattern: /.*_key$/i, reason: 'API key pattern' },
    { id: 'token', keyPattern: /.*_token$/i, reason: 'Token pattern' },
    { id: 'email', valuePattern: /[\w.+-]+@[\w-]+\.[\w.-]+/, reason: 'Email address' },
    { id: 'user_path', valuePattern: /\/Users\/[^/]+/, reason: 'User home path' },
    { id: 'home_linux', valuePattern: /\/home\/[^/]+/, reason: 'User home path (Linux)' },
    { id: 'user_windows', valuePattern: /C:\\Users\\[^\\]+/i, reason: 'User home path (Windows)' }
  ]

  async preview(traceIds: string[], customRules: RedactionRule[] = []): Promise<{
    spans: SerializedSpan[]
    redactionReport: Array<{
      spanId: string
      fieldPath: string
      ruleId: string
      reason: string
    }>
  }> {
    const rules = [...this.DEFAULT_RULES, ...customRules]
    const spans = await this.traceStore.getMultipleTraces(traceIds)
    const report: Array<any> = []
    
    const redactedSpans = spans.map(span => {
      return this.redactSpan(span, rules, report)
    })
    
    return { spans: redactedSpans, redactionReport: report }
  }

  async export(
    traceIds: string[],
    outputPath: string,
    customRules: RedactionRule[] = [],
    options: { includeFileContents?: boolean } = {}
  ): Promise<void> {
    const { spans } = await this.preview(traceIds, customRules)
    
    const bundle: TraceExportBundle = {
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      sibyllaVersion: app.getVersion(),
      workspaceIdAnonymized: this.anonymizeWorkspaceId(),
      redactionRules: [...this.DEFAULT_RULES, ...customRules].map(r => r.id),
      spans,
      checksum: ''
    }
    bundle.checksum = this.computeChecksum(bundle.spans)
    
    await fs.writeFile(outputPath, JSON.stringify(bundle, null, 2), 'utf-8')
  }

  async import(filePath: string): Promise<{ traceIds: string[] }> {
    const raw = await fs.readFile(filePath, 'utf-8')
    const bundle = JSON.parse(raw) as TraceExportBundle
    
    if (bundle.exportVersion !== 1) {
      throw new Error(`Unsupported export version: ${bundle.exportVersion}`)
    }
    
    // Mark imported spans with prefix to avoid collision
    const importedSpans = bundle.spans.map(s => ({
      ...s,
      traceId: `imported-${s.traceId}`,
      spanId: `imported-${s.spanId}`,
      parentSpanId: s.parentSpanId ? `imported-${s.parentSpanId}` : undefined,
      attributes: { ...s.attributes, '_imported': true, '_source_file': filePath }
    }))
    
    await this.traceStore.writeBatch(importedSpans)
    return { traceIds: [...new Set(importedSpans.map(s => s.traceId))] }
  }
}
```

#### 优先级

P2 - 可选完成

---

## 三、非功能需求

### 3.1 性能要求

- Tracer.startSpan 开销 < 100 微秒
- Span 持久化写入（batch）吞吐 > 1000 spans/sec
- Trace 查询按 trace_id < 50ms（< 100 spans）
- Trace 查询按时间+属性 < 200ms（< 1M rows）
- progress.md 单次更新 < 100ms（含磁盘 IO）
- 对话气泡执行轨迹渲染 < 100ms
- Trace Inspector 火焰图渲染 < 300ms（< 500 spans）
- 性能监控聚合 < 500ms/窗口

### 3.2 可靠性要求

- Trace 写入失败降级为内存缓冲（最多 1000 spans），不阻塞主流程
- progress.md 写入失败重试 3 次，最终失败不中断任务执行
- Trace 数据库损坏自动重建（保留旧文件供排查）
- 未结束 Span 5 分钟自动标为错误并清理
- AI 自声明契约解析失败不中断对话

### 3.3 存储与保留

- Trace 数据库默认 7 天保留，可配置（1-90 天）
- 锁定的 Trace 永不清理
- progress.md 已完成任务超过 10 条自动归档
- 归档文件按月组织
- Trace 数据库文件大小告警 > 500MB

### 3.4 隐私与安全要求

- 默认敏感字段模式覆盖 API key、token、email、用户路径
- 导出前必须脱敏预览确认
- 导出包不包含文件内容（除非用户显式启用）
- Trace 数据不上传云端（与记忆系统一致）
- Tracer 可全局禁用（隐私模式）

### 3.5 可配置性要求

- Trace 开关、保留天数、span 超时、敏感字段模式全部可配置
- 性能告警阈值（慢调用、token、错误率）可配置
- 告警屏蔽时长可配置
- progress.md 归档条数阈值可配置
- 用户可视化 Span 白名单可扩展

### 3.6 可观测性自洽

- Tracer 自身的错误、缓冲区溢出、超时 Span 通过 `electron-log` 记录
- 性能监控的指标本身通过 Trace 记录（元自观测）
- 导出/回放等操作也产生 Trace（可审计谁做了什么）

---

## 四、技术约束

### 4.1 架构约束

- Tracer 位于 `sibylla-desktop/src/main/services/trace/`
- 所有 Tracer 接口在主进程；渲染进程通过 IPC 查询
- 独立 SQLite 数据库：`.sibylla/trace/trace.db`
- 不引入 `@opentelemetry/*` 运行时依赖；仅借用数据模型
- Span 数据结构兼容 OTel JSON 导出格式（便于未来外接）

### 4.2 与现有模块的集成

> **原则：最小侵入**。所有集成通过依赖注入 + 可选字段扩展完成，不删除或破坏已有功能。

| 现有文件 | 改造策略 | 影响程度 |
|---|---|---|
| `src/main/services/harness/orchestrator.ts` | 新增 `tracer?: Tracer` 可选注入 + `setTracer()`；`execute()` 中若有 tracer 则用 `withSpan` 包裹，否则 fallback 到现有 `harness-xxx` traceId；`this.trace()` 方法扩展为同时写入 Tracer span event 和旧 MemoryManager 日志（双写） | 低侵入 |
| `src/main/ipc/handlers/ai.handler.ts` | 新增 `progressLedger?: ProgressLedger` 注入；流式响应完成后解析 `sibylla:task-declare` 块（后置解析，不改动流式路径内部） | 低侵入 |
| `src/main/services/context-engine.ts` | 新增 `tracer?: Tracer` 注入；`assembleContext()` / `assembleForHarness()` 用 `withSpan('context.assemble')` 包裹（可选，tracer 未注入时无行为变更） | 低侵入 |
| `src/main/services/harness/guardrails/*` (Sprint 3.1) | 各 Guardrule 的 `check()` 方法新增 `tracer.withSpan('harness.guardrail')` 包裹；同时保留 `appendHarnessTrace` 写入（双写兼容） | 低侵入 |
| `src/main/services/memory/types.ts` (Sprint 3.2) | `EvolutionEvent` 接口新增 `traceSpanId?: string` 可选字段 | 纯扩展 |
| `src/shared/types.ts` | `EvolutionEvent`（IPC 镜像）同步新增 `traceSpanId?: string`；`HarnessResult` 新增 `traceId?: string`；`AIStreamEnd` 新增 `traceId?: string` | 纯扩展 |
| `src/main/services/memory-manager.ts` | `updateEntry` / `lockEntry` / `applyExtractionReport` 中调用 `evolutionLog.append()` 时传入可选 `traceSpanId`；新增 `getSnapshotAt(date)` 方法（回放引擎依赖） | 扩展 + 新增 |
| `src/main/services/file-manager.ts` | 新增 `tracer?: Tracer` 注入；`atomicWrite()`、`delete()` 产生 `tool.file-write` / `tool.file-read` Span（tracer 未注入时无行为变更） | 低侵入 |
| `src/main/services/database-manager.ts` | 无改动。TraceStore 是独立的 SQLite 实例，参照 DatabaseManager 的管理模式但不修改它 | 无侵入 |
| `src/main/index.ts` | 新增 Tracer / TraceStore / AppEventBus / ProgressLedger / PerformanceMonitor 的初始化、注入和生命周期管理 | 新增代码 |
| `src/main/services/memory/memory-event-bus.ts` | 无改动。新建独立的 `AppEventBus`，不修改现有 MemoryEventBus | 无侵入 |
| `src/renderer/components/studio/StudioAIPanel.tsx` | 消息气泡组件新增 `traceId` prop 和 `<ExecutionTrace>` 子组件挂载点 | 扩展 |

### 4.3 与 Sprint 3.1 的契约

Sprint 3.1 的 Harness 组件通过**可选注入 + 双写过渡**策略集成 Tracer。
核心原则：Tracer 注入前，系统行为与 Sprint 3.1 完全一致。

#### 4.3.1 HarnessOrchestrator 改造

```typescript
// src/main/services/harness/orchestrator.ts
class HarnessOrchestrator {
  private tracer?: Tracer  // 新增：可选注入

  setTracer(tracer: Tracer): void {
    this.tracer = tracer
  }

  async execute(request: AIChatRequest): Promise<HarnessResult> {
    const useTracer = this.tracer?.isEnabled() ?? false

    // 若 Tracer 可用，用 withSpan 包裹整个 execute，生成 OTel traceId
    // 否则 fallback 到现有 harness-xxx traceId（向后兼容）
    if (useTracer) {
      return this.tracer!.withSpan('ai.handle-message', async (rootSpan) => {
        rootSpan.setAttributes({
          'conversation.id': request.sessionId,
          'workspace.id': this.workspaceId,
        })
        const result = await this.executeInternal(request, rootSpan)
        return { ...result, traceId: rootSpan.context.traceId }
      }, { kind: 'ai-call', conversationId: request.sessionId })
    }

    // Fallback: 无 Tracer，完全兼容 Sprint 3.1 行为
    const result = await this.executeInternal(request, undefined)
    return result
  }

  private async executeInternal(
    request: AIChatRequest,
    rootSpan?: Span
  ): Promise<HarnessResult> {
    // 原 execute 逻辑，但 this.trace() 改为双写
    // ...
  }

  // 双写：同时写入旧 MemoryManager + 新 Tracer
  private async trace(
    traceId: string,
    event: HarnessTraceEvent,
    span?: Span
  ): Promise<void> {
    // 通道 1（保留）：写入 MemoryManager（向后兼容）
    try {
      await this.memoryManager.appendHarnessTrace(traceId, event)
    } catch { /* 已有空 catch */ }

    // 通道 2（新增）：写入当前 Span 作为 event
    if (span) {
      span.addEvent(`${event.component}:${event.action}`, {
        result: event.result,
        details: event.details?.join(', ') ?? '',
      })
    }
  }
}
```

#### 4.3.2 HarnessResult 扩展

在 `src/shared/types.ts` 中扩展（纯新增可选字段，不影响已有 IPC 契约）：

```typescript
export interface HarnessResult {
  // ... existing fields unchanged
  readonly traceId?: string  // 新增: Sprint 3.3 OTel traceId
}
```

#### 4.3.3 AIStreamEnd 扩展

```typescript
// src/shared/types.ts
export interface AIStreamEnd {
  // ... existing fields unchanged
  traceId?: string  // 新增: 用于渲染进程查询执行轨迹
}
```

#### 4.3.4 Guardrail / Sensor / Evaluator 的 Tracer 包裹

各组件遵循相同模式——可选 Tracer 注入，不改变现有接口：

```typescript
class GuardrailEngine {
  private tracer?: Tracer

  setTracer(tracer: Tracer): void {
    this.tracer = tracer
  }

  async check(input: unknown): Promise<GuardrailResult> {
    if (!this.tracer?.isEnabled()) {
      return this.checkInternal(input)  // 原路径
    }
    return this.tracer.withSpan('harness.guardrail', async (span) => {
      span.setAttribute('guardrail.rule_id', this.ruleId)
      const result = await this.checkInternal(input)
      span.setAttribute('guardrail.verdict', result.verdict)
      return result
    }, { kind: 'system' })
  }
}
```

### 4.4 与 Sprint 3.2 的集成

演化日志扩展（纯可选字段，向后兼容）：

#### 4.4.1 主定义扩展

```typescript
// src/main/services/memory/types.ts
export interface EvolutionEvent {
  // ... existing fields unchanged
  traceSpanId?: string     // 新增，指向触发该变更的 Trace Span
}
```

#### 4.4.2 IPC 镜像同步

```typescript
// src/shared/types.ts
export interface EvolutionEvent {
  // ... existing fields unchanged
  traceSpanId?: string     // 同步新增
}
```

#### 4.4.3 evolution-log.ts 适配

`src/main/services/memory/evolution-log.ts` 的 `parseEvent()` 方法增加 `traceSpanId` 字段提取。
`formatEvent()` 已使用结构化格式，天然兼容新增字段。

#### 4.4.4 memory-manager.ts 传入 traceSpanId

```typescript
// src/main/services/memory-manager.ts — updateEntry 改造示例
async updateEntry(entryId: string, content: string): Promise<void> {
  // ... existing logic
  await this.v2Components.evolutionLog?.append({
    // ... existing fields
    traceSpanId: this.currentTraceSpanId,  // 新增: 从 Tracer 当前活跃 Span 获取
  })
}

// 新增方法（回放引擎依赖）
async getSnapshotAt(date: Date): Promise<{
  data: { entries: MemoryEntry[]; totalTokens: number }
  exact: boolean
}> {
  // 通过 EvolutionLog.query() 逆向回放至指定时刻的状态
  // exact=false 时标记为近似重建
}
```

#### 4.4.5 记忆面板 UI 扩展

记忆面板新增"查看触发 Trace"按钮，点击后在 Trace Inspector 中打开。
`MemoryEntryHistory` 组件增加 `traceSpanId` 展示和跳转逻辑。

### 4.5 与 CLAUDE.md 的一致性

- **"文件即真相"**：progress.md 是用户可见的 Markdown
- **"AI 自声明"**：通过 `sibylla:task-declare` 块实现
- **"原子写入"**：progress.md 使用 temp + rename
- **"本地优先"**：Trace 数据不上传
- **"个人空间隔离"**：遵循工作区规则
- **"Git 不可见"**：`.sibylla/trace/` 通过 `.gitignore` 排除；progress.md 是否纳入 Git 由用户决定（默认排除，可选纳入用于团队共享当前任务状态）

### 4.6 未来扩展预留

- Span kind 设计预留 `cloud-call`（Sprint 4 云端调用）
- 导出格式 `exportVersion` 预留版本升级
- Tracer 配置预留 `externalExporter` 字段（未来对接 Jaeger/OTLP）

### 4.7 兼容性约束与实施顺序

本节记录 Sprint 3.3 与已有代码的兼容性约束，确保开发过程中不破坏已稳定运行的功能。

#### 4.7.1 EventBus 兼容

现有 `MemoryEventBus`（`src/main/services/memory/memory-event-bus.ts`）仅限记忆模块内部使用。
Sprint 3.3 新建独立的 `AppEventBus`（`src/main/services/event-bus.ts`），不修改 `MemoryEventBus`。

```typescript
// src/main/services/event-bus.ts (新建)
import { EventEmitter } from 'events'

export class AppEventBus extends EventEmitter {
  emitSpanEnded(span: SerializedSpan): void {
    this.emit('trace:span-ended', span)
  }
  emitTaskDeclared(task: TaskRecord): void {
    this.emit('progress:task-declared', task)
  }
  emitPerformanceAlert(alert: PerformanceAlert): void {
    this.emit('performance:alert', alert)
  }
  emitPerformanceMetrics(metrics: PerformanceMetrics): void {
    this.emit('performance:metrics', metrics)
  }
}
```

在 `src/main/index.ts` 中创建单例并注入到 Tracer、ProgressLedger、PerformanceMonitor。

#### 4.7.2 TraceStore 生命周期

`TraceStore` 参照现有 `DatabaseManager`（`src/main/services/database-manager.ts`）的管理模式：
- 构造函数中创建 `better-sqlite3` 实例，启用 WAL 模式
- 在 `onWorkspaceOpened` 中初始化，在 `onWorkspaceClosed` 和 `will-quit` 中关闭
- 不修改 `DatabaseManager` 本身

#### 4.7.3 TaskStateMachine 与 ProgressLedger 的关系

Sprint 3.1 的 `TaskStateMachine`（`src/main/services/harness/task-state-machine.ts`）侧重**崩溃恢复**（文件系统持久化 `.sibylla/agents/{taskId}/state.json`），
Sprint 3.3 的 `ProgressLedger` 侧重**用户可视化**（progress.md 渲染）。

两者分层复用：
- `ProgressLedger` 内部委托 `TaskStateMachine` 做持久化
- `ProgressLedger.declare()` 调用 `taskStateMachine.create()` 获取持久化 taskId
- `ProgressLedger.complete()` / `fail()` 调用 `taskStateMachine.advance()` / `updateStatus()`
- 进度渲染（progress.md）由 `ProgressLedger` 独立负责

```typescript
// progress-ledger.ts 构造函数
constructor(
  private taskStateMachine: TaskStateMachine,  // 复用已有持久化
  private workspaceRoot: string,
  private fileManager: FileManager,
  private tracer: Tracer,
  private eventBus: AppEventBus,
  private logger: Logger
) {}
```

#### 4.7.4 AIHandler 流式路径与任务自声明

现有 `AIHandler`（`src/main/ipc/handlers/ai.handler.ts`）的 Harness 模式是同步执行后一次性发送结果。
任务自声明（需求 3.3.4）采用**后置解析**策略：流完成后解析 `sibylla:task-declare` 块，
而非在流中间拦截。这避免了对流式路径内部逻辑的侵入。

```typescript
// ai.handler.ts — handleStream / handleHarnessStream 结束时
const finalContent = fullContent.join('')  // 或 result.finalResponse.content
if (this.progressLedger) {
  const blocks = new TaskDeclarationParser().parseNewBlocks(finalContent)
  for (const block of blocks) {
    if (block.type === 'declare') {
      await this.progressLedger.declare({ title: block.data.title, ... })
    }
    // ... handle update/complete
  }
}
```

#### 4.7.5 IPC 通道注册

新增的约 25 个 IPC 通道遵循现有 `IPC_CHANNELS` 常量命名规范，追加到 `src/shared/types.ts`。
所有新通道均为可选功能，对应 `IPCChannelMap` 中的类型映射也一并新增。
不修改任何已有 IPC 通道定义。

新建两个 Handler 文件：
- `src/main/ipc/handlers/trace.ts` — Trace 查询/导出/回放
- `src/main/ipc/handlers/progress.ts` — Progress 查询/编辑

#### 4.7.6 实施顺序

建议按以下顺序实施，确保每一步都可独立验证：

| 阶段 | 内容 | 依赖 |
|---|---|---|
| Phase A | `AppEventBus` + `TraceStore` + `Tracer` SDK | 无 |
| Phase B | `Tracer` 注入到 `HarnessOrchestrator`（双写过渡） | Phase A |
| Phase C | `ProgressLedger` + `TaskDeclarationParser` | Phase A + B |
| Phase D | IPC Handler（trace.ts / progress.ts）+ preload 暴露 | Phase A + C |
| Phase E | `PerformanceMonitor` | Phase A |
| Phase F | 渲染进程组件（ExecutionTrace / TraceInspector / ProgressPanel） | Phase D |
| Phase G | `EvolutionEvent.traceSpanId` 扩展 + `getSnapshotAt()` | Phase B |
| Phase H | `ReplayEngine` + `TraceExporter` | Phase A + G |

---

## 五、目录结构

```
sibylla-desktop/src/main/services/
├── event-bus.ts                     # 全局 AppEventBus（新增）
├── trace/                           # Trace 系统（新增）
│   ├── types.ts                     # Span / TraceContext / Event
│   ├── tracer.ts                    # Tracer 主类
│   ├── span-impl.ts                 # SpanImpl 具体实现
│   ├── trace-store.ts               # SQLite 持久化
│   ├── performance-monitor.ts       # 性能聚合与告警
│   ├── replay-engine.ts             # 回放与快照重建
│   ├── trace-exporter.ts            # 导出与脱敏
│   ├── no-op-span.ts                # 禁用模式下的空实现
│   └── index.ts                     # 统一导出
├── progress/                        # 任务台账系统（新增）
│   ├── types.ts                     # TaskRecord
│   ├── progress-ledger.ts           # progress.md 管理器
│   └── index.ts
└── (existing modules unchanged)

sibylla-desktop/src/main/services/ai/          # 任务声明解析器（新增目录）
└── task-declaration-parser.ts                  # AI 输出块解析器

sibylla-desktop/src/main/ipc/handlers/
├── (existing handlers unchanged)
├── trace.ts                         # IPC: Trace 查询、导出（新增）
└── progress.ts                      # IPC: 任务查询、编辑（新增）

sibylla-desktop/src/renderer/store/
├── (existing stores unchanged)
├── traceStore.ts                    # Trace Inspector 状态（新增）
└── progressStore.ts                 # progress.md 实时状态（新增）

sibylla-desktop/src/renderer/components/conversation/
└── ExecutionTrace.tsx               # 对话气泡执行轨迹视图（新增）

sibylla-desktop/src/renderer/components/inspector/  # 新增目录
├── TraceInspector.tsx               # 主面板
├── TraceList.tsx                    # 左侧列表
├── FlameGraph.tsx                   # 火焰图（Canvas）
├── SpanTreeView.tsx                 # 树形视图
├── TimelineView.tsx                 # 时间线视图
├── PerformanceStats.tsx             # 性能统计
├── SpanDetailPane.tsx               # 右侧详情
├── SearchBar.tsx                    # 全文搜索
└── ExportDialog.tsx                 # 导出脱敏对话框

sibylla-desktop/src/renderer/components/progress/  # 新增目录
├── ProgressPanel.tsx                # 独立的 progress 面板
├── TaskCard.tsx                     # 任务卡片
└── TaskChecklist.tsx                # 清单渲染

sibylla-desktop/tests/trace/
├── tracer.test.ts
├── trace-store.test.ts
├── performance-monitor.test.ts
├── replay-engine.test.ts
└── trace-exporter.test.ts

sibylla-desktop/tests/progress/
├── progress-ledger.test.ts
└── task-declaration-parser.test.ts

# Workspace 运行时目录
<workspace>/
├── progress.md                      # 任务台账
└── .sibylla/
    ├── trace/                       # 新增
    │   ├── trace.db                 # SQLite 主数据库
    │   ├── trace.db-wal
    │   ├── trace.db-shm
    │   └── progress-archive/        # progress.md 归档
    │       ├── 2026-03.md
    │       └── 2026-04.md
    └── agents/                      # 已有（TaskStateMachine），不变
```

---

## 六、IPC 接口清单

> 所有新增 IPC 通道遵循现有 `IPC_CHANNELS` 常量命名规范，追加到 `src/shared/types.ts`。
> 对应 `IPCChannelMap` 中的类型映射也一并新增。不修改任何已有通道定义。

```typescript
// === 新增 IPC_CHANNELS 常量（追加到 shared/types.ts）===

// Trace 查询
TRACE_GET_TREE: 'trace:getTraceTree'
TRACE_QUERY: 'trace:query'
TRACE_GET_RECENT: 'trace:getRecent'
TRACE_GET_STATS: 'trace:getStats'
TRACE_LOCK: 'trace:lockTrace'
TRACE_UNLOCK: 'trace:unlockTrace'
TRACE_CLEANUP: 'trace:cleanupNow'

// Trace 导出
TRACE_PREVIEW_EXPORT: 'trace:previewExport'
TRACE_EXPORT: 'trace:export'
TRACE_IMPORT: 'trace:import'

// 回放
TRACE_REBUILD_SNAPSHOT: 'trace:rebuildSnapshot'
TRACE_RERUN: 'trace:rerun'

// 性能
PERFORMANCE_GET_METRICS: 'performance:getMetrics'
PERFORMANCE_GET_ALERTS: 'performance:getAlerts'
PERFORMANCE_SUPPRESS: 'performance:suppressAlert'

// progress.md
PROGRESS_GET_SNAPSHOT: 'progress:getSnapshot'
PROGRESS_GET_TASK: 'progress:getTask'
PROGRESS_EDIT_NOTE: 'progress:editUserNote'
PROGRESS_GET_ARCHIVE: 'progress:getArchive'

// === Events (主→渲染, webContents.send) ===
TRACE_SPAN_ENDED: 'trace:spanEnded'
TRACE_UPDATE: 'trace:update'
PROGRESS_TASK_DECLARED: 'progress:taskDeclared'
PROGRESS_TASK_UPDATED: 'progress:taskUpdated'
PROGRESS_TASK_COMPLETED: 'progress:taskCompleted'
PROGRESS_TASK_FAILED: 'progress:taskFailed'
PROGRESS_USER_EDIT_CONFLICT: 'progress:userEditConflict'
PERFORMANCE_METRICS: 'performance:metrics'
PERFORMANCE_ALERT: 'performance:alert'
PERFORMANCE_ALERT_CLEARED: 'performance:alertCleared'
```

```typescript
// === IPCChannelMap 类型映射（追加）===

// Trace 查询
[IPC_CHANNELS.TRACE_GET_TREE]: { params: [traceId: string]; return: SerializedSpan[] }
[IPC_CHANNELS.TRACE_QUERY]: { params: [filter: TraceQueryFilter]; return: SerializedSpan[] }
[IPC_CHANNELS.TRACE_GET_RECENT]: { params: [limit: number]; return: SerializedSpan[] }
[IPC_CHANNELS.TRACE_GET_STATS]: { params: []; return: { totalSpans: number; totalTraces: number; dbSizeBytes: number } }
[IPC_CHANNELS.TRACE_LOCK]: { params: [traceId: string, reason?: string]; return: void }
[IPC_CHANNELS.TRACE_UNLOCK]: { params: [traceId: string]; return: void }
[IPC_CHANNELS.TRACE_CLEANUP]: { params: []; return: { deleted: number } }

// Trace 导出
[IPC_CHANNELS.TRACE_PREVIEW_EXPORT]: { params: [traceIds: string[], customRules: RedactionRule[]]; return: ExportPreview }
[IPC_CHANNELS.TRACE_EXPORT]: { params: [traceIds: string[], outputPath: string, options?: ExportOptions]; return: void }
[IPC_CHANNELS.TRACE_IMPORT]: { params: [filePath: string]; return: { traceIds: string[] } }

// 回放
[IPC_CHANNELS.TRACE_REBUILD_SNAPSHOT]: { params: [traceId: string]; return: TraceSnapshot }
[IPC_CHANNELS.TRACE_RERUN]: { params: [traceId: string]; return: { newTraceId: string } }

// 性能
[IPC_CHANNELS.PERFORMANCE_GET_METRICS]: { params: []; return: PerformanceMetrics }
[IPC_CHANNELS.PERFORMANCE_GET_ALERTS]: { params: []; return: PerformanceAlert[] }
[IPC_CHANNELS.PERFORMANCE_SUPPRESS]: { params: [type: string, durationMs: number]; return: void }

// progress.md
[IPC_CHANNELS.PROGRESS_GET_SNAPSHOT]: { params: []; return: ProgressSnapshot }
[IPC_CHANNELS.PROGRESS_GET_TASK]: { params: [id: string]; return: TaskRecord | null }
[IPC_CHANNELS.PROGRESS_EDIT_NOTE]: { params: [taskId: string, note: string]; return: void }
[IPC_CHANNELS.PROGRESS_GET_ARCHIVE]: { params: [month: string]; return: TaskRecord[] }
```

---

## 七、验收检查清单

### Tracer SDK
- [ ] startSpan / setAttribute / addEvent / setStatus / end API 可用
- [ ] withSpan 自动处理错误与结束
- [ ] Span 超时自动清理（5 分钟）
- [ ] 敏感字段自动脱敏
- [ ] 禁用模式下 < 100ns 开销
- [ ] 缓冲区满时丢弃最旧并记录

### 持久化存储
- [ ] trace.db 独立 SQLite，WAL 模式
- [ ] 按 trace_id 查询 < 50ms
- [ ] 按属性过滤 < 200ms
- [ ] 每日自动清理（默认 7 天）
- [ ] 锁定 trace 永不清理
- [ ] 数据库损坏自动重建

### progress.md
- [ ] 格式规范（frontmatter + 三区）
- [ ] 声明 → 更新 → 完成流程可用
- [ ] user-note 块跨更新保留
- [ ] 用户编辑冲突检测
- [ ] 超 10 条完成任务自动归档
- [ ] Trace 链接可跳转

### AI 自声明
- [ ] sibylla:task-declare 块解析正确
- [ ] 声明失败降级不中断对话
- [ ] 长消息自动注入声明提示
- [ ] 简短对话不强制声明
- [ ] 未归档任务超时自动 fail

### 对话气泡执行轨迹
- [ ] 展开按钮存在
- [ ] 渲染 < 100ms
- [ ] 白名单过滤生效
- [ ] 异常 Span 高亮
- [ ] 慢 Span 橙色标记
- [ ] 查看完整 Trace 跳转 Inspector

### Trace Inspector
- [ ] Ctrl+Shift+T 打开面板
- [ ] Trace 列表按时间倒序
- [ ] 火焰图渲染 < 300ms
- [ ] 树形 / 时间线 / 性能四种视图可切换
- [ ] Span 详情显示 attributes、events、timing
- [ ] 对比模式可用
- [ ] 错误 Span 视觉突出

### 性能监控
- [ ] 每分钟聚合
- [ ] 慢调用 / Token / 错误率 / 降级阈值检测
- [ ] 连续 3 窗口触发告警
- [ ] 告警 24 小时屏蔽可用
- [ ] 告警自动清除
- [ ] 告警含预估成本

### 回放
- [ ] 快照重建提取 prompt、上下文、记忆状态
- [ ] 文件缺失降级为 placeholder
- [ ] Rerun 创建新 Trace（replay.of 属性）
- [ ] 原 Trace 显示相关回放

### 导出
- [ ] 脱敏预览列出所有被替换字段
- [ ] 自定义规则可添加
- [ ] 导出文件不含敏感信息
- [ ] 导入标记 imported
- [ ] 文件内容默认不嵌入

### 集成
- [ ] Sprint 3.1 Harness 完成 Tracer 注入（可选，setTracer 注入）
- [ ] Sprint 3.2 演化日志含 traceSpanId（可选字段）
- [ ] ContextEngine 所有上下文组装产生 Span
- [ ] FileManager 重要写入产生 Span
- [ ] HarnessOrchestrator 双写：同时写入 Tracer + MemoryManager
- [ ] Tracer 未注入时，所有现有功能行为不变（向后兼容）
- [ ] TaskStateMachine 被 ProgressLedger 委托复用（不替换）
- [ ] AIHandler 流式路径后置解析 task-declare 块（不侵入流内部）
- [ ] MemoryEventBus 不被修改（独立于新 AppEventBus）
- [ ] DatabaseManager 不被修改（TraceStore 独立实例）
- [ ] AIStreamEnd / HarnessResult 新增可选 traceId 字段
- [ ] MemoryManager.getSnapshotAt() 方法可用（回放引擎依赖）

### 性能与可靠性
- [ ] startSpan < 100μs
- [ ] 批量写入 > 1000 spans/sec
- [ ] progress.md 写入 < 100ms
- [ ] Trace 写入失败不阻塞主流程
- [ ] progress.md 写入失败不中断任务

---

## 八、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| Span 数据膨胀导致数据库过大 | 高 | 中 | 默认 7 天保留 + 大小告警 + 手动清理入口 |
| Tracer 开销拖慢主流程 | 中 | 高 | 严格的性能预算（< 100μs）+ 禁用开关 + 缓冲区异步刷新 |
| progress.md 被用户和 AI 同时写入冲突 | 高 | 中 | user-note 块隔离 + 冲突检测 + 备份文件 |
| AI 不遵守自声明契约 | 中 | 中 | Prompt 指令 + 自动 fallback（整个响应作为 unnamed 任务） |
| 火焰图在大 Trace 下卡顿 | 中 | 低 | Canvas 渲染 + 虚拟化 + 大 Trace 降级为树形视图 |
| 导出时漏掉自定义敏感字段 | 中 | 高 | 预览页强制确认 + 用户可追加规则 + 默认规则尽量宽 |
| 回放结果与原结果差异大误导用户 | 中 | 中 | 明确"近似重建"标记 + 说明"模型版本/配置可能变化" |
| 并发 Span 时 ID 冲突 | 低 | 高 | 16 字节 trace_id + 8 字节 span_id（足够大）+ crypto.randomBytes |
| Trace 数据库 WAL 文件在崩溃后无法恢复 | 低 | 中 | 启动时 integrity check + 损坏时重建（旧文件保留） |
| 性能告警过于嘈杂 | 中 | 低 | 连续 3 窗口阈值 + 24 小时屏蔽 + 用户反馈调参 |
| TaskStateMachine 与 ProgressLedger 任务模型不一致 | 中 | 中 | ProgressLedger 委托 TSM 做持久化，统一 taskId；状态映射：TSM `executing` ↔ PL `running`，TSM `completed` ↔ PL `completed` |
| 双写导致 Tracer 与 MemoryManager 数据不一致 | 低 | 中 | Tracer 写入失败不阻塞 MemoryManager 写入；MemoryManager 写入失败不阻塞 Tracer；两者独立降级 |
| Harness 同步执行模式下任务自声明延迟感知 | 中 | 低 | 后置解析策略（流完成后解析 declare 块），用户感知延迟 < 100ms |

---

## 九、参考资料

- [CLAUDE.md](../../../CLAUDE.md) - 项目宪法
- [sprint3-ai-mvp.md](./sprint3-ai-mvp.md) - 基础 AI 能力
- [sprint3.1-harness-infrastructure.md](./sprint3.1-harness-infrastructure.md) - Trace 事件主要生产方
- [sprint3.2-memory-system-v2.md](./sprint3.2-memory-system-v2.md) - 记忆演化与 Trace 交叉引用
- [OpenTelemetry Specification](https://opentelemetry.io/docs/specs/otel/) - Span 数据模型参考

---

## 十、交付物清单

### 代码
- `src/main/services/trace/` 8 个文件
- `src/main/services/progress/` 3 个文件
- `src/main/ipc/handlers/trace.ts`、`progress.ts`
- `src/renderer/store/traceStore.ts`、`progressStore.ts`
- `src/renderer/components/conversation/ExecutionTrace.tsx`
- `src/renderer/components/inspector/` 9 个文件
- `src/renderer/components/progress/` 3 个文件

### 测试
- `tests/trace/` 5 个测试套件
- `tests/progress/` 2 个测试套件
- 目标覆盖率 ≥ 80%（主进程）、≥ 70%（渲染进程）

### 文档
- 本 Sprint 文档
- 更新 `memory-system-design.md` 添加 Trace 交叉引用章节
- 新增 `trace-system-design.md` 详细设计文档
- 更新 CLAUDE.md 中 progress.md 章节（从"将实现"改为"已实现"）

### 配置
- 默认配置文件新增 Trace 相关默认值
- 设置面板新增"Trace 与性能"标签页
```

---