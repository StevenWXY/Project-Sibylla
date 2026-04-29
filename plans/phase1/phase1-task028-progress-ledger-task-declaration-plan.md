# PHASE1-TASK028: progress.md 任务台账与 AI 自声明集成 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task028_progress-ledger-task-declaration.md](../specs/tasks/phase1/phase1-task028_progress-ledger-task-declaration.md)
> 创建日期：2026-04-21
> 最后更新：2026-04-21

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK028 |
| **任务标题** | progress.md 任务台账与 AI 自声明集成 |
| **所属阶段** | Phase 1 - Trace 系统、任务台账与可观测性 (Sprint 3.3) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | TASK027 + TaskStateMachine + AIHandler + FileManager |

### 1.1 目标

构建用户可感知的任务台账系统——实现 progress.md 格式规范与 ProgressLedger 管理器、AI 自声明契约解析与集成、TaskStateMachine 分层复用，让用户一眼看出"AI 正在做什么、刚做完什么、下一步要做什么"。

### 1.2 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| Progress 类型定义 | `src/main/services/progress/types.ts` | TaskRecord / TaskState / ProgressSnapshot |
| ProgressLedger 管理器 | `src/main/services/progress/progress-ledger.ts` | declare/update/complete/fail/渲染/冲突/归档 |
| 统一导出 | `src/main/services/progress/index.ts` | 公共 API 导出 |
| TaskDeclarationParser | `src/main/services/ai/task-declaration-parser.ts` | AI 输出块解析器 |
| IPC Handler | `src/main/ipc/handlers/progress.ts` | 任务查询/编辑通道 |
| shared/types 扩展 | `src/shared/types.ts` | Progress IPC 通道常量 |
| AIHandler 集成 | `src/main/ipc/handlers/ai.handler.ts` | 后置解析 task-declare 块 |
| Orchestrator 集成 | `src/main/services/harness/orchestrator.ts` | 声明提示注入 system prompt |
| 主进程初始化 | `src/main/index.ts` | ProgressLedger 生命周期管理 |
| 单元测试 | `tests/progress/progress-ledger.test.ts` | Ledger 核心 API 测试 |
| 单元测试 | `tests/progress/task-declaration-parser.test.ts` | 解析器测试 |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；文件即真相；原子写入；AI 建议/人类决策；所有写入操作先写临时文件再原子替换 | 全局约束 |
| `specs/design/architecture.md` | 进程隔离 IPC 通信；主进程文件管理 | 模块划分 |
| `specs/design/data-and-api.md` | IPC 通道命名规范；Preload API 设计 | IPC 设计 |
| `specs/requirements/phase1/sprint3.3-trace.md` | 需求 3.3.3 + 3.3.4 — progress.md 格式、ProgressLedger API、AI 自声明契约 | 验收标准 |
| `specs/tasks/phase1/phase1-task028_progress-ledger-task-declaration.md` | 13 步执行路径、全部验收标准 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `electron-ipc-patterns` | Progress IPC 通道设计；Preload API 扩展；事件推送注册 | shared/types.ts + progress handler + preload |
| `typescript-strict-mode` | 类型定义；禁止 any；discriminated union | types.ts + 全部实现 |
| `zustand-state-management` | TASK029 前置——IPC 接口设计需考虑后续 Store 消费方式 | IPC 接口预留 |

### 2.3 前置代码依赖（TASK027 产物 + 现有模块）

| 模块 | 文件 | 复用方式 |
|------|------|---------|
| `Tracer` | `src/main/services/trace/tracer.ts` | ProgressLedger 注入，声明时绑定 traceId |
| `TraceStore` | `src/main/services/trace/trace-store.ts` | 可选：通过 Tracer 间接使用 |
| `AppEventBus` | `src/main/services/event-bus.ts` | 已有 `emitTaskDeclared/Updated/Completed/Failed` 桩方法 |
| `TaskStateMachine` | `src/main/services/harness/task-state-machine.ts` | 委托 `create()` + `advance()` / `updateStatus()` 做持久化 |
| `AIHandler` | `src/main/ipc/handlers/ai.handler.ts` | 后置解析声明块，注入 ProgressLedger |
| `HarnessOrchestrator` | `src/main/services/harness/orchestrator.ts` | 声明提示注入（通过 ContextEngine） |
| `FileManager` | `src/main/services/file-manager.ts` | `writeFile()` 原子写入；需补充 `appendFile()` 或使用 read+write |
| `IpcHandler` | `src/main/ipc/handler.ts` | 基类 `safeHandle()` + `wrapResponse()` + `wrapError()` |
| `ContextEngine` | `src/main/services/context-engine.ts` | `assembleForHarness()` 生成 systemPrompt |
| `IPC_CHANNELS` | `src/shared/types.ts` | 通道常量已有定义模式 |
| `IPCChannelMap` | `src/shared/types.ts` | 类型安全注册模式 |

### 2.4 IPC 通道清单（TASK028 新增）

**Renderer→Main 调用通道：**

| 通道常量 | 通道名 | Handler 方法 | 返回类型 |
|---------|--------|-------------|---------|
| `PROGRESS_GET_SNAPSHOT` | `progress:getSnapshot` | `handleGetSnapshot` | `ProgressSnapshot` |
| `PROGRESS_GET_TASK` | `progress:getTask` | `handleGetTask` | `TaskRecord \| null` |
| `PROGRESS_EDIT_NOTE` | `progress:editUserNote` | `handleEditUserNote` | `void` |
| `PROGRESS_GET_ARCHIVE` | `progress:getArchive` | `handleGetArchive` | `string` |

**Main→Renderer 推送事件：**

| 事件 | 通道名 | 用途 |
|------|--------|------|
| `PROGRESS_TASK_DECLARED` | `progress:taskDeclared` | 任务已声明 |
| `PROGRESS_TASK_UPDATED` | `progress:taskUpdated` | 任务进度已更新 |
| `PROGRESS_TASK_COMPLETED` | `progress:taskCompleted` | 任务已完成 |
| `PROGRESS_TASK_FAILED` | `progress:taskFailed` | 任务已失败 |
| `PROGRESS_USER_EDIT_CONFLICT` | `progress:userEditConflict` | 用户编辑冲突 |

---

## 三、现有代码盘点与差距分析

### 3.1 AppEventBus 现状

已有 `emitTaskDeclared/Updated/Completed/Failed` 桩方法，参数类型为 `unknown`。
**缺口：** 需将 `unknown` 替换为 `TaskRecord` 类型；需新增 `emitUserEditConflict` 方法。

### 3.2 TaskStateMachine 现状

- `create(goal, plannedSteps)` → `TaskState`（status='planning'）
- `advance(taskId, stepSummary, artifacts)` → 递增步骤
- `updateStatus(taskId, status)` → 更新状态
- `abandon(taskId)` → 取消

**状态映射：**
| TSM Status | PL TaskState | 说明 |
|-----------|-------------|------|
| `executing` | `running` | 执行中 |
| `completed` | `completed` | 已完成 |
| `failed` | `failed` | 已失败 |
| `cancelled` | `failed` | 取消视为失败 |

**缺口：** TSM 步骤粒度（`planning/executing/awaiting_confirmation`）与 PL 状态（`queued/running/paused/completed/failed`）不完全对齐。需在 PL 内部做状态映射。

### 3.3 AIHandler 现状

- `handleHarnessStream` 在流完成后一次性发送内容
- `setHarnessOrchestrator(orchestrator)` 已有 setter 模式
- 无 ProgressLedger 引用

**缺口：** 需新增 `setProgressLedger()` setter；流完成后需调用 `TaskDeclarationParser` 解析并处理声明块。

### 3.4 HarnessOrchestrator 现状

- 无 `buildSystemPrompt()` 方法，systemPrompt 由 `ContextEngine.assembleForHarness()` 生成
- `isMultiStepTask()` 已存在（步骤≥3 或 `longRunning=true`）
- `setTracer(tracer)` 已有 setter 模式

**缺口：** 声明提示需在 ContextEngine 层面注入，或在 Orchestrator 的 `executeInternal()` 中补充 prompt 段落。推荐在 Orchestrator 中拦截 assembledContext.systemPrompt 并追加声明提示段落。

### 3.5 FileManager 现状

- `writeFile()` 原子写入（默认 temp+rename）
- **无 `appendFile()` 方法**

**缺口：** 归档写入需追加内容。方案：实现 `appendFile()` 或在 ProgressLedger 内部做 read+write。

### 3.6 shared/types.ts 现状

- 无任何 `PROGRESS_*` 通道常量
- `IPCChannelMap` 无 progress 条目

### 3.7 不存在的文件/目录

| 文件 | 状态 |
|------|------|
| `src/main/services/progress/` | **目录不存在**，需创建 |
| `src/main/services/ai/task-declaration-parser.ts` | **不存在**，需新建（`ai/` 目录存在） |
| `src/main/ipc/handlers/progress.ts` | **不存在**，需新建 |
| `tests/progress/` | **目录不存在**，需创建 |

---

## 四、分步实施计划

### 阶段 A：Progress 类型定义（Step 1） — 预计 0.3 天

#### A1：创建 types.ts

**文件：** `sibylla-desktop/src/main/services/progress/types.ts`

```typescript
export type TaskState = 'queued' | 'running' | 'paused' | 'completed' | 'failed'

export type ChecklistItemStatus = 'pending' | 'in_progress' | 'done' | 'skipped'

export interface ChecklistItem {
  description: string
  status: ChecklistItemStatus
}

export interface TaskOutput {
  type: 'file' | 'message'
  ref: string
}

export interface TaskRecord {
  id: string
  title: string
  state: TaskState
  mode?: 'plan' | 'analyze' | 'review' | 'free'
  traceId?: string
  conversationId?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  durationMs?: number
  checklist: ChecklistItem[]
  outputs: TaskOutput[]
  resultSummary?: string
  failureReason?: string
  userNotes?: string
}

export interface ProgressSnapshot {
  active: TaskRecord[]
  completedRecent: TaskRecord[]
  queued: TaskRecord[]
  updatedAt: string
}

export interface DeclareInput {
  title: string
  mode?: TaskRecord['mode']
  traceId?: string
  conversationId?: string
  plannedChecklist?: string[]
}

export interface UpdatePatch {
  checklistUpdates?: Array<{ index: number; status: ChecklistItemStatus }>
  newChecklistItems?: string[]
  output?: TaskOutput
}
```

**约束：** 禁止 `any`；所有类型严格导出；与 `sprint3.3-trace.md` §3.3.3 技术规格对齐。

---

### 阶段 B：TaskDeclarationParser（Step 2） — 预计 0.5 天

#### B1：创建 task-declaration-parser.ts

**文件：** `sibylla-desktop/src/main/services/ai/task-declaration-parser.ts`

**核心设计：**

```typescript
interface DeclareBlockData {
  title: string
  planned_steps: string[]
  estimated_duration_min?: number
}

interface UpdateBlockData {
  checklistUpdates?: Array<{ index: number; status: string }>
  newChecklistItems?: string[]
  output?: { type: 'file' | 'message'; ref: string }
}

interface CompleteBlockData {
  summary: string
}

type ParsedBlock =
  | { type: 'declare'; data: DeclareBlockData }
  | { type: 'update'; data: UpdateBlockData }
  | { type: 'complete'; data: CompleteBlockData }

class TaskDeclarationParser {
  private consumedRanges: Array<[number, number]> = []

  parseNewBlocks(accumulatedContent: string): ParsedBlock[]
  reset(): void
}
```

**实现要点：**
1. 正则 `<!--\s*sibylla:task-(declare|update|complete)\s*([\s\S]*?)-->` 匹配
2. `consumedRanges` 防止重复解析
3. `JSON.parse` 失败时 `console.warn` 跳过，不抛错（非阻塞）
4. `reset()` 清空 `consumedRanges`，每个流式请求使用新实例
5. `UpdateBlockData.status` 值需校验为合法 `ChecklistItemStatus`

---

### 阶段 C：ProgressLedger 核心（Step 3-7） — 预计 2 天

#### C1：创建 progress-ledger.ts 基本结构

**文件：** `sibylla-desktop/src/main/services/progress/progress-ledger.ts`

**构造函数注入：**

```typescript
constructor(
  private readonly taskStateMachine: TaskStateMachine,
  private readonly workspaceRoot: string,
  private readonly fileManager: FileManager,
  private readonly tracer: Tracer,
  private readonly eventBus: AppEventBus,
  private readonly logger: Logger,
)
```

**内部状态：**

```typescript
private tasks: Map<string, TaskRecord> = new Map()
private writeQueue: Promise<void> = Promise.resolve()
private userNoteBlocks: Map<string, string> = new Map()
private lastRenderHash: string | null = null
```

#### C2：实现核心 API

**declare(input: DeclareInput): Promise<TaskRecord>**

1. 生成 taskId：`T-${YYYYMMDD}-${HHMMSS}`
2. 调用 `taskStateMachine.create(input.title, input.plannedChecklist ?? [])` — 委托 TSM
3. 创建 TaskRecord：state='running'、startedAt=now、checklist 初始化
4. `this.tasks.set(id, task)`
5. `await this.persist()`
6. `this.eventBus.emitTaskDeclared(task)`
7. 返回 task

**update(taskId: string, patch: UpdatePatch): Promise<TaskRecord>**

1. 获取 task，校验 state='running'
2. 应用 checklistUpdates：遍历更新指定 index 的 status
3. 追加 newChecklistItems 为 pending 项
4. 追加 output 到 outputs 数组
5. `await this.persist()`
6. `this.eventBus.emitTaskUpdated(task)`
7. 返回 task

**complete(taskId: string, summary: string): Promise<TaskRecord>**

1. 获取 task
2. 设置 state='completed'、completedAt=now、durationMs、resultSummary
3. 调用 `taskStateMachine.updateStatus(tsmTaskId, 'completed')` — 委托 TSM
4. `await this.persist()`
5. `await this.maybeArchive()`
6. `this.eventBus.emitTaskCompleted(task)`
7. 返回 task

**fail(taskId: string, reason: string): Promise<TaskRecord>**

1. 获取 task
2. 设置 state='failed'、completedAt=now、durationMs、failureReason
3. 调用 `taskStateMachine.updateStatus(tsmTaskId, 'failed')`
4. `await this.persist()`
5. `await this.maybeArchive()`
6. `this.eventBus.emitTaskFailed(task)`
7. 返回 task

**editUserNote(taskId: string, note: string): Promise<void>**

1. `this.userNoteBlocks.set(taskId, note)`
2. 更新 task.userNotes = note
3. `await this.persist()`

**getSnapshot(): ProgressSnapshot**

1. 从 tasks Map 中提取 active / completedRecent / queued
2. completedRecent 取最近 10 条，按 completedAt 降序
3. 返回 ProgressSnapshot

**getTask(id: string): TaskRecord | null**

1. 返回 `this.tasks.get(id) ?? null`

#### C3：实现 progress.md 渲染与写入

**persist()** — 序列化写入：

```typescript
private persist(): Promise<void> {
  this.writeQueue = this.writeQueue.then(() => this.doPersist())
  return this.writeQueue
}
```

**doPersist()** — 实际写入逻辑：

1. `const snapshot = this.buildSnapshot()`
2. `const content = this.render(snapshot)`
3. 使用 `withRetry(fn, 3)` 包裹写入操作
4. 读取现有文件 → `detectUserEdits(existingContent)` → `fileManager.writeFile(path, content)`
5. 更新 `this.lastRenderHash`

**withRetry(fn, retries)** — 指数退避重试：

```typescript
private async withRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  delayMs: number = 100,
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === retries) {
        this.logger.error('progress.write.failed.after-retries', { attempts: attempt + 1, err })
        return undefined as unknown as T // degrade but continue
      }
      await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt)))
    }
  }
  return undefined as unknown as T
}
```

**render(snapshot: ProgressSnapshot): string**

1. 生成 YAML frontmatter（version:1、updated、active_count、completed_today）
2. 渲染 `## 🔄 进行中` 区域
3. 渲染 `## ✅ 已完成（最近 10 条）` 区域
4. 渲染 `## 📋 排队中` 区域
5. 渲染归档提示

**renderTaskEntry(task, mode)** — 单条任务渲染：

running 模式：
- `### [${task.id}] ${task.title}`
- 开始时间、模式、已耗时
- Trace 链接：`[查看执行轨迹](sibylla://trace/${task.traceId})` 或 `(无)`
- 进度清单：⏸/🔄/✅/⏭ 图标
- `<!-- user-note:${task.id} -->\n${note}\n<!-- /user-note:${task.id} -->`

completed 模式：
- `### [${task.id}] ${task.title} ✓` 或 `❌`
- 耗时 + Trace 链接
- 产出列表、结果摘要或失败原因

**辅助方法：**

| 方法 | 功能 |
|------|------|
| `generateTaskId()` | `T-YYYYMMDD-HHMMSS` |
| `formatDuration(ms)` | `Xm Ys` 格式 |
| `formatTimestamp(iso)` | `YYYY-MM-DD HH:MM` 格式 |
| `formatMode(mode)` | plan→计划、analyze→分析、review→审查、free→自由 |
| `buildSnapshot()` | 从 tasks Map 构建 ProgressSnapshot |
| `countCompletedToday()` | 今日已完成任务数 |
| `progressPath()` | `path.join(workspaceRoot, 'progress.md')` |

#### C4：用户编辑检测与冲突处理

**detectUserEdits(existingContent: string): void**

1. 调用 `extractUserNotes(existingContent)` 更新 `this.userNoteBlocks`
2. 调用 `stripUserNotes(existingContent)` 去除 user-note 块
3. 调用 `stripUserNotes(render(buildLastSnapshot()))` 去除上次渲染的 user-note 块
4. 比较两个 stripped 内容
5. 不一致且 `lastRenderHash` 存在 → 用户在 user-note 块外编辑
6. `createConflictBackup(existingContent)`
7. `this.eventBus.emit('progress:user-edit-conflict')`

**extractUserNotes(content: string): Map<string, string>**

正则匹配 `<!-- user-note:([^"]*?) -->\n([\s\S]*?)\n<!-- /user-note:\1 -->`

**stripUserNotes(content: string): string**

正则替换 user-note 块为空字符串

**createConflictBackup(content: string): Promise<void>**

写入 `workspaceRoot/.progress.conflict.md`

#### C5：归档

**maybeArchive(): Promise<void>**

1. 获取 completed/failed 任务，按 completedAt 降序
2. 若总数 ≤ 10，不归档
3. 取第 11 条及之后为 toArchive
4. 归档路径：`.sibylla/trace/progress-archive/${YYYY-MM}.md`
5. 渲染 toArchive 条目为 Markdown
6. 使用 `appendFileSafe()` 写入归档文件
7. 从 `this.tasks` Map 中删除已归档任务

**appendFileSafe(filePath, content)** — 内部辅助：

1. 读取已有内容（若文件存在）
2. 拼接新内容
3. 使用 `fileManager.writeFile()` 原子写入

**getArchive(month: string): Promise<string>**

1. 读取归档文件内容
2. 返回原始 Markdown 内容

#### C6：ProgressLedger 加载

**initialize(): Promise<void>**

1. 若 progress.md 存在，调用 `load()` 解析现有内容
2. 否则调用 `persist()` 创建初始空 progress.md

**load(): Promise<void>**

1. 读取 progress.md 内容
2. 解析 YAML frontmatter
3. 解析 `## 🔄 进行中` 区域 → 运行中任务
4. 解析 `## ✅ 已完成` 区域 → 已完成任务
5. 解析 `## 📋 排队中` 区域 → 排队任务
6. 提取 user-note 块
7. 构建 `this.tasks` Map
8. 计算 `this.lastRenderHash`

**parseTaskEntries(sectionContent, mode): TaskRecord[]**

1. 按 `### [` 分割任务条目
2. 对每个条目提取 id、title、状态、时间、Trace 链接、checklist、output
3. 返回 TaskRecord[]

---

### 阶段 D：统一导出 + shared/types 扩展（Step 8-9） — 预计 0.3 天

#### D1：创建 index.ts

**文件：** `sibylla-desktop/src/main/services/progress/index.ts`

导出所有类型 + `ProgressLedger`

#### D2：扩展 shared/types.ts

**新增 IPC 通道常量：**

```typescript
PROGRESS_GET_SNAPSHOT: 'progress:getSnapshot',
PROGRESS_GET_TASK: 'progress:getTask',
PROGRESS_EDIT_NOTE: 'progress:editUserNote',
PROGRESS_GET_ARCHIVE: 'progress:getArchive',

PROGRESS_TASK_DECLARED: 'progress:taskDeclared',
PROGRESS_TASK_UPDATED: 'progress:taskUpdated',
PROGRESS_TASK_COMPLETED: 'progress:taskCompleted',
PROGRESS_TASK_FAILED: 'progress:taskFailed',
PROGRESS_USER_EDIT_CONFLICT: 'progress:userEditConflict',
```

**新增 IPCChannelMap 类型映射：**

```typescript
[IPC_CHANNELS.PROGRESS_GET_SNAPSHOT]: { params: []; return: ProgressSnapshot }
[IPC_CHANNELS.PROGRESS_GET_TASK]: { params: [id: string]; return: TaskRecord | null }
[IPC_CHANNELS.PROGRESS_EDIT_NOTE]: { params: [taskId: string, note: string]; return: void }
[IPC_CHANNELS.PROGRESS_GET_ARCHIVE]: { params: [month: string]; return: string }
```

#### D3：扩展 AppEventBus

**文件：** `sibylla-desktop/src/main/services/event-bus.ts`

1. 将 `emitTaskDeclared/Updated/Completed/Failed` 参数类型从 `unknown` 改为 `TaskRecord`
2. 新增 `emitUserEditConflict(): void` 方法

---

### 阶段 E：AIHandler 集成（Step 10） — 预计 0.5 天

#### E1：AIHandler 后置解析

**文件：** `sibylla-desktop/src/main/ipc/handlers/ai.handler.ts`

**新增字段与方法：**

```typescript
private progressLedger: ProgressLedger | null = null

setProgressLedger(ledger: ProgressLedger): void {
  this.progressLedger = ledger
}
```

**在 `handleHarnessStream` / `handleStream` 完成后插入声明解析逻辑：**

```typescript
const finalContent = fullContent
if (this.progressLedger && finalContent) {
  const parser = new TaskDeclarationParser()
  const blocks = parser.parseNewBlocks(finalContent)
  let taskId: string | null = null

  for (const block of blocks) {
    if (block.type === 'declare') {
      const task = await this.progressLedger.declare({
        title: block.data.title,
        traceId: currentTraceId,
        conversationId: request.sessionId,
        plannedChecklist: block.data.planned_steps,
      })
      taskId = task.id
    } else if (block.type === 'update' && taskId) {
      await this.progressLedger.update(taskId, {
        checklistUpdates: block.data.checklistUpdates?.map(u => ({
          index: u.index,
          status: u.status as ChecklistItemStatus,
        })),
        newChecklistItems: block.data.newChecklistItems,
        output: block.data.output,
      })
    } else if (block.type === 'complete' && taskId) {
      await this.progressLedger.complete(taskId, block.data.summary)
      taskId = null
    }
  }

  if (taskId) {
    await this.progressLedger.complete(taskId, '（AI 未显式归档）')
  }
}
```

**从最终响应中去除声明块：**

```typescript
const cleanedContent = finalContent.replace(
  /<!--\s*sibylla:task-(declare|update|complete)\s*[\s\S]*?-->/g,
  '',
)
```

**约束：** 解析在流完成后执行，不侵入流式路径内部逻辑；解析失败不中断对话。

---

### 阶段 F：Orchestrator 声明提示注入（Step 11） — 预计 0.3 天

#### F1：注入声明提示到 systemPrompt

**文件：** `sibylla-desktop/src/main/services/harness/orchestrator.ts`

**方案：** 在 `executeInternal()` 中，获取 `assembledContext.systemPrompt` 后，若 `shouldRequireTaskDeclaration(request)` 为 true，追加声明提示段落。

```typescript
private shouldRequireTaskDeclaration(request: AIChatRequest): boolean {
  const msg = request.message.toLowerCase()
  if (msg.length > 200) return true
  if (/计划|步骤|分析|撰写|生成文档/.test(msg)) return true
  return false
}

private buildDeclarationHint(): string {
  return [
    '',
    '## 任务声明规范',
    '在开始多步骤工作前，请先输出任务声明：',
    '<!-- sibylla:task-declare',
    '{',
    '  "title": "任务标题",',
    '  "planned_steps": ["步骤1", "步骤2", ...],',
    '  "estimated_duration_min": 预估分钟',
    '}',
    '-->',
    '执行过程中可输出进度更新：',
    '<!-- sibylla:task-update',
    '{',
    '  "checklistUpdates": [{"index": 0, "status": "done"}],',
    '  "newChecklistItems": ["新步骤"]',
    '}',
    '-->',
    '完成时输出归档：',
    '<!-- sibylla:task-complete',
    '{"summary": "完成摘要"}',
    '-->',
  ].join('\n')
}
```

**注入位置：** `executeInternal()` 中 `assembledContext.systemPrompt` 获取后、调用 generator 之前。

---

### 阶段 G：IPC Handler + 主进程初始化（Step 12-13） — 预计 0.5 天

#### G1：创建 progress handler

**文件：** `sibylla-desktop/src/main/ipc/handlers/progress.ts`

```typescript
export class ProgressHandler extends IpcHandler {
  namespace = 'progress'

  constructor(
    private readonly progressLedger: ProgressLedger,
  ) { super() }

  register(): void {
    ipcMain.handle(
      IPC_CHANNELS.PROGRESS_GET_SNAPSHOT,
      this.safeHandle(this.handleGetSnapshot.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.PROGRESS_GET_TASK,
      this.safeHandle(this.handleGetTask.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.PROGRESS_EDIT_NOTE,
      this.safeHandle(this.handleEditUserNote.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.PROGRESS_GET_ARCHIVE,
      this.safeHandle(this.handleGetArchive.bind(this)),
    )
  }

  private handleGetSnapshot(): ProgressSnapshot {
    return this.progressLedger.getSnapshot()
  }

  private handleGetTask(_event, id: string): TaskRecord | null {
    return this.progressLedger.getTask(id)
  }

  private async handleEditUserNote(
    _event, taskId: string, note: string,
  ): Promise<void> {
    await this.progressLedger.editUserNote(taskId, note)
  }

  private async handleGetArchive(
    _event, month: string,
  ): Promise<string> {
    return await this.progressLedger.getArchive(month)
  }
}
```

#### G2：主进程初始化

**文件：** `sibylla-desktop/src/main/index.ts`

**onWorkspaceOpened 回调中追加：**

```typescript
const progressLedger = new ProgressLedger(
  taskStateMachine,
  workspacePath,
  fileManager,
  tracer,
  appEventBus,
  logger,
)
await progressLedger.initialize()
aiHandler.setProgressLedger(progressLedger)

const progressHandler = new ProgressHandler(progressLedger)
progressHandler.register()
```

**onWorkspaceClosed 回调中追加：** 无需特殊清理，ProgressLedger 无需 stop()。

**事件推送注册：** 在创建 ProgressHandler 后，注册 AppEventBus 事件到 webContents.send：

```typescript
appEventBus.on('progress:task-declared', (task: TaskRecord) => {
  mainWindow.webContents.send('progress:taskDeclared', task)
})
// ... 其他事件同理
```

---

## 五、验收标准追踪

### ProgressLedger 核心 API

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | `declare(input)` 创建 TaskRecord，插入进行中区域 | C2 declare() | F1-1 |
| 2 | `update(taskId, patch)` 原子修改 checklist/output | C2 update() | F1-2 |
| 3 | `complete(taskId, summary)` 移至已完成区域 | C2 complete() | F1-3 |
| 4 | `fail(taskId, reason)` 移至已完成区域，❌ 标记 | C2 fail() | F1-4 |
| 5 | `editUserNote(taskId, note)` 更新 user-note 块 | C2 editUserNote() | F1-5 |
| 6 | `getSnapshot()` 返回 ProgressSnapshot | C2 getSnapshot() | — |

### progress.md 格式

| # | 验收标准 | 实现位置 |
|---|---------|---------|
| 1 | YAML frontmatter 含 version/updated/active_count/completed_today | C3 render() |
| 2 | 三区域：🔄 进行中 / ✅ 已完成 / 📋 排队中 | C3 render() |
| 3 | 进行中条目含：任务 ID、标题、开始时间、模式、已耗时、Trace 链接、进度清单 | C3 renderTaskEntry() |
| 4 | 已完成条目含：任务 ID、标题、耗时、Trace 链接、产出、结果/失败原因 | C3 renderTaskEntry() |
| 5 | `<!-- user-note:taskId -->` 块跨更新保留 | C4 detectUserEdits() |
| 6 | 排队中区域预留 | C3 render() |

### 用户编辑保护

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | user-note 块内编辑跨更新保留 | C4 extractUserNotes() | F1-5 |
| 2 | user-note 块外编辑创建 .progress.conflict.md 备份 | C4 detectUserEdits() | F1-6 |
| 3 | 冲突时发射 `progress:user-edit-conflict` 事件 | C4 + D3 | F1-6 |

### 归档

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 已完成区域超 10 条时归档 | C5 maybeArchive() | F1-7 |
| 2 | 归档文件按月组织 | C5 maybeArchive() | F1-7 |
| 3 | 归档后从内存 Map 中删除 | C5 maybeArchive() | F1-7 |

### Trace 链接

| # | 验收标准 | 实现位置 |
|---|---------|---------|
| 1 | 有 traceId 时含 `sibylla://trace/{traceId}` 链接 | C3 renderTaskEntry() |
| 2 | 无 traceId 时显示 `(无)` | C3 renderTaskEntry() |

### AI 自声明契约

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | `sibylla:task-declare` 块被正确解析 | B1 + E1 | F2-1 |
| 2 | 解析失败时不中断对话 | B1 + E1 | F2-4 |
| 3 | declare → ProgressLedger.declare() → 绑定 Trace | E1 | F2-1 |
| 4 | update → ProgressLedger.update() | E1 | F2-2 |
| 5 | complete → ProgressLedger.complete() | E1 | F2-3 |
| 6 | 未归档时自动 complete | E1 | F2-5 |

### 声明启发式

| # | 验收标准 | 实现位置 |
|---|---------|---------|
| 1 | 长消息（>200 字符）注入声明提示 | F1 shouldRequireTaskDeclaration() |
| 2 | 含关键词消息注入声明提示 | F1 shouldRequireTaskDeclaration() |
| 3 | 简短单轮对话不强制声明 | F1 shouldRequireTaskDeclaration() |

### TaskStateMachine 复用

| # | 验收标准 | 实现位置 |
|---|---------|---------|
| 1 | declare 委托 TSM `create()` | C2 declare() |
| 2 | 状态映射：TSM executing ↔ PL running | C2 |
| 3 | TSM 不被替换或修改 | 架构约束 |

### 写入可靠性

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 序列化写入队列避免竞态 | C3 persist() | — |
| 2 | 写入失败重试 3 次 | C3 withRetry() | F1-10 |
| 3 | 最终失败不中断任务 | C3 withRetry() | F1-10 |

### IPC 集成

| # | 验收标准 | 实现位置 |
|---|---------|---------|
| 1 | progress IPC 通道注册到 shared/types.ts | D2 |
| 2 | IPC handler（progress.ts）注册 | G1 |
| 3 | v1 IPC 通道继续正常工作 | 现有代码不变 |

---

## 六、风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| TSM 状态映射不完全对齐 | 中 | PL 内部维护自己的 TaskState，仅委托 TSM 做持久化 |
| progress.md 解析失败（格式变更） | 高 | `load()` 中 try/catch，解析失败时从空状态重建 |
| 并发写入竞态 | 高 | `writeQueue` 序列化写入队列 |
| FileManager 无 appendFile | 低 | 内部实现 read+write 辅助方法 |
| 声明块残留泄漏给用户 | 中 | 发送前正则替换移除声明块 |
| 流式完成后的解析阻塞响应 | 低 | 解析在流结束后执行，不阻塞已发送的流式内容 |
| AppEventBus 类型变更破坏现有代码 | 中 | 使用类型断言渐进迁移，先改为 TaskRecord 后检查编译 |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 |
|----|------|--------|
| Day 1 上午 | A1 | types.ts 完整定义 |
| Day 1 下午 | B1 | TaskDeclarationParser 完整实现 |
| Day 2 | C1-C4 | ProgressLedger 核心 API + 渲染 + 冲突检测 |
| Day 3 | C5-C6 | 归档 + 加载 + index.ts |
| Day 4 上午 | D1-D3 + E1 + F1 | shared/types 扩展 + AIHandler 集成 + Orchestrator 注入 |
| Day 4 下午 | G1-G2 | IPC Handler + 主进程初始化 |
| Day 5 | F1-F2 | 单元测试全部通过 |

---

**文档版本**: v1.0
**最后更新**: 2026-04-21
**维护者**: Sibylla 架构团队
