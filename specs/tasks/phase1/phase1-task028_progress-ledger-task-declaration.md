# progress.md 任务台账与 AI 自声明集成

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK028 |
| **任务标题** | progress.md 任务台账与 AI 自声明集成 |
| **所属阶段** | Phase 1 - Trace 系统、任务台账与可观测性 (Sprint 3.3) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

构建用户可感知的任务台账系统——实现 progress.md 格式规范与 ProgressLedger 管理器、AI 自声明契约解析与集成、TaskStateMachine 分层复用，让用户一眼看出"AI 正在做什么、刚做完什么、下一步要做什么"。

### 背景

TASK027 已实现 Tracer SDK 和 TraceStore 持久化，每一次 AI 调用都产出层次化的 Span 树。但 Span 树是面向开发者的细粒度数据，普通用户需要的是"任务级"的简化视图。progress.md 是 Trace 数据的用户级投影——由 AI 自声明任务、Trace 系统自动渲染、用户可附加备注。

**设计原则核心：**
- progress.md 是投影，不是独立真相源——数据来自 Trace Span 和 ProgressLedger 内部状态
- AI 自声明是契约——AI 必须在多步骤工作前声明"我要做什么"
- TaskStateMachine 复用——ProgressLedger 委托 TSM 做持久化，不重复建设

**现有代码关键约束：**

| 维度 | 现状 | TASK028 改造 |
|------|------|-------------|
| TaskStateMachine | `src/main/services/harness/task-state-machine.ts` — 崩溃恢复持久化 | ProgressLedger 委托 TSM 做持久化，状态映射 |
| AIHandler | `src/main/ipc/handlers/ai.handler.ts` — 流式响应一次性发送 | 后置解析 `sibylla:task-declare` 块 |
| progress.md | 不存在 | 新建工作区根目录 progress.md |
| 用户备注 | 无机制 | `<!-- user-note:taskId -->` 块跨更新保留 |

### 范围

**包含：**
- `types.ts` — TaskRecord / TaskState / ChecklistItem / ProgressSnapshot 全部类型
- `progress-ledger.ts` — progress.md 管理器（declare / update / complete / fail / 渲染 / 冲突检测 / 归档）
- `index.ts` — 统一导出
- `task-declaration-parser.ts` — AI 输出块解析器（declare / update / complete 块）
- AIHandler 集成 — 后置解析 task-declare 块 + ProgressLedger 调用
- HarnessOrchestrator 集成 — AI 自声明提示注入 system prompt
- TaskStateMachine 分层复用 — ProgressLedger 委托 TSM 持久化
- IPC handler（progress.ts）— 任务查询 / 编辑通道注册
- `shared/types.ts` 扩展 — progress 相关 IPC 通道常量
- 单元测试

**不包含：**
- ExecutionTrace UI（TASK029）
- TraceInspector UI（TASK029）
- PerformanceMonitor（TASK029）
- ProgressPanel UI（TASK029）

## 验收标准

### ProgressLedger 核心 API

- [ ] `declare(input)` 创建 TaskRecord，插入 progress.md `进行中` 区域，含 task ID、开始时间、模式、空 checklist
- [ ] `update(taskId, patch)` 修改目标任务的 checklist / output，原子操作无竞态
- [ ] `complete(taskId, summary)` 移至 `已完成` 区域，更新 duration、添加结果摘要
- [ ] `fail(taskId, reason)` 移至 `已完成` 区域，添加 ❌ 标记和失败原因
- [ ] `editUserNote(taskId, note)` 更新 user-note 块内容
- [ ] `getSnapshot()` 返回 ProgressSnapshot（active + completedRecent + queued）

### progress.md 格式

- [ ] YAML frontmatter 含 version / updated / active_count / completed_today
- [ ] 三区域：🔄 进行中 / ✅ 已完成（最近 10 条）/ 📋 排队中
- [ ] 进行中条目含：任务 ID、标题、开始时间、模式、已耗时、Trace 链接、进度清单
- [ ] 已完成条目含：任务 ID、标题、耗时、Trace 链接、产出、结果/失败原因
- [ ] `<!-- user-note:taskId -->` 块跨更新保留
- [ ] 排队中区域预留

### 用户编辑保护

- [ ] 用户在 `<!-- user-note:taskId -->` 块内编辑，系统跨更新保留
- [ ] 用户在 user-note 块外编辑，系统检测冲突并创建 `.progress.conflict.md` 备份
- [ ] 冲突时通过 eventBus 发射 `progress:user-edit-conflict` 事件

### 归档

- [ ] `已完成` 区域超过 10 条时，最旧条目归档至 `.sibylla/trace/progress-archive/{YYYY-MM}.md`
- [ ] 归档文件按月组织
- [ ] 归档后任务从内存 Map 中删除

### Trace 链接

- [ ] 任务有 traceId 时，条目含可点击 `sibylla://trace/{traceId}` 链接
- [ ] 无 traceId 时显示 `(无)`

### AI 自声明契约

- [ ] `sibylla:task-declare` 块被 TaskDeclarationParser 正确解析
- [ ] 解析失败时记录 warning，不中断对话（非阻塞）
- [ ] AI 主动声明任务 → `ProgressLedger.declare()` → task 绑定到当前 Trace
- [ ] AI 输出 `sibylla:task-update` 块 → `ProgressLedger.update()`
- [ ] AI 输出 `sibylla:task-complete` 块 → `ProgressLedger.complete()`
- [ ] AI 未显式归档时自动调用 `complete(taskId, '（AI 未显式归档）')`

### 声明启发式

- [ ] 长消息（> 200 字符）自动注入声明提示到 system prompt
- [ ] 含计划/步骤/分析/撰写等关键词的消息自动注入声明提示
- [ ] 简短单轮对话（< 30s，无文件变更）不强制声明
- [ ] 应声明但未声明时，整个响应包裹为 unnamed 任务

### TaskStateMachine 复用

- [ ] ProgressLedger 委托 TSM 的 `create()` 获取持久化 taskId
- [ ] 状态映射：TSM `executing` ↔ PL `running`，TSM `completed` ↔ PL `completed`
- [ ] TSM 不被替换或修改

### 写入可靠性

- [ ] progress.md 写入使用序列化队列（`writeQueue`），避免并发写入竞态
- [ ] 写入失败重试 3 次（指数退避）
- [ ] 最终失败不中断任务执行（降级但继续）

### IPC 集成

- [ ] progress IPC 通道注册到 `shared/types.ts`
- [ ] IPC handler（progress.ts）注册
- [ ] v1 IPC 通道继续正常工作

## 依赖关系

### 前置依赖

- [x] TASK027 — Tracer SDK 与 Trace 持久化存储（Tracer / TraceStore / AppEventBus）
- [x] TaskStateMachine（`src/main/services/harness/task-state-machine.ts`）
- [x] AIHandler（`src/main/ipc/handlers/ai.handler.ts`）
- [x] FileManager（`src/main/services/file-manager.ts`）— 原子写入

### 被依赖任务

- TASK029（可观测性 UI）— 依赖 ProgressLedger 查询接口、IPC 通道

## 参考文档

- [`specs/requirements/phase1/sprint3.3-trace.md`](../../requirements/phase1/sprint3.3-trace.md) — 需求 3.3.3 + 3.3.4 + §4.7.3 + §4.7.4
- [`specs/design/architecture.md`](../../design/architecture.md) — 模块划分
- [`CLAUDE.md`](../../../CLAUDE.md) — 文件即真相、原子写入、AI 建议/人类决策
- `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` — IPC 类型安全设计
- `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` — 类型设计规范
- `.kilocode/skills/phase1/zustand-state-management/SKILL.md` — 渲染进程状态管理（TASK029 前置）

## 技术执行路径

### 架构设计

```
Progress 系统 整体架构

src/main/services/
├── progress/                          ← 任务台账系统（新建目录）
│   ├── types.ts                       ← TaskRecord / TaskState / ProgressSnapshot
│   ├── progress-ledger.ts             ← progress.md 管理器
│   └── index.ts                       ← 统一导出
│
├── ai/                                ← 任务声明解析器（新建目录）
│   └── task-declaration-parser.ts     ← AI 输出块解析器
│
├── ipc/handlers/
│   └── progress.ts                    ← IPC: 任务查询/编辑（新建）
│
└── (现有模块扩展)
    ├── harness/orchestrator.ts        ← system prompt 注入声明提示
    ├── ipc/handlers/ai.handler.ts     ← 后置解析 task-declare 块
    └── harness/task-state-machine.ts  ← 被 ProgressLedger 委托复用

数据流向：

AI 响应流完成 → TaskDeclarationParser.parseNewBlocks(fullContent)
  → declare 块 → ProgressLedger.declare() → TaskStateMachine.create()
    → 渲染 progress.md → atomicWrite
    → eventBus.emitTaskDeclared
  → update 块 → ProgressLedger.update()
    → 渲染 progress.md → atomicWrite
    → eventBus.emitTaskUpdated
  → complete 块 → ProgressLedger.complete() → TaskStateMachine.advance()
    → 归档检查 → maybeArchive()
    → 渲染 progress.md → atomicWrite
    → eventBus.emitTaskCompleted

AI 响应流结束但无 complete 块 → auto-complete('（AI 未显式归档）')

用户编辑 progress.md → detectUserEdits()
  → user-note 块保留
  → 非 user-note 区域编辑 → createConflictBackup() + emitUserEditConflict
```

### 步骤 1：定义 Progress 共享类型

**文件：** `src/main/services/progress/types.ts`

1. 定义 `TaskState` 联合类型：`'queued' | 'running' | 'paused' | 'completed' | 'failed'`
2. 定义 `ChecklistItemStatus` 联合类型：`'pending' | 'in_progress' | 'done' | 'skipped'`
3. 定义 `ChecklistItem` 接口：description、status
4. 定义 `TaskOutput` 接口：type（'file' | 'message'）、ref
5. 定义 `TaskRecord` 接口：
   - id（格式 `T-YYYYMMDD-HHMMSS`）
   - title
   - state: TaskState
   - mode?: 'plan' | 'analyze' | 'review' | 'free'
   - traceId?: string
   - conversationId?: string
   - createdAt: string
   - startedAt?: string
   - completedAt?: string
   - durationMs?: number
   - checklist: ChecklistItem[]
   - outputs: TaskOutput[]
   - resultSummary?: string
   - failureReason?: string
   - userNotes?: string
6. 定义 `ProgressSnapshot` 接口：
   - active: TaskRecord[]
   - completedRecent: TaskRecord[]（last 10）
   - queued: TaskRecord[]
   - updatedAt: string
7. 导出所有类型

### 步骤 2：实现 TaskDeclarationParser

**文件：** `src/main/services/ai/task-declaration-parser.ts`

1. 定义 `ParsedBlock` 联合类型：
   - `{ type: 'declare'; data: DeclareBlockData }` — title、planned_steps、estimated_duration_min
   - `{ type: 'update'; data: UpdateBlockData }` — checklistUpdates、newChecklistItems、output
   - `{ type: 'complete'; data: CompleteBlockData }` — summary
2. 内部状态 `consumedRanges: Array<[number, number]>` — 已解析块的位置范围，避免重复解析
3. 实现 `parseNewBlocks(accumulatedContent: string): ParsedBlock[]` 方法：
   - 正则匹配 `<!--\s*sibylla:task-(declare|update|complete)\s*([\s\S]*?)-->`
   - 对每个匹配：
     - 计算范围 `[match.index, match.index + match[0].length]`
     - 若范围已在 consumedRanges 中，跳过
     - 尝试 `JSON.parse(match[2].trim())`
     - 解析成功：追加到 results，记录 range 到 consumedRanges
     - 解析失败：console.warn（`task-declaration-parser.malformed`），跳过该块
   - 返回 ParsedBlock[]
4. 导出 `TaskDeclarationParser` 类

### 步骤 3：实现 ProgressLedger 核心

**文件：** `src/main/services/progress/progress-ledger.ts`

1. 构造函数注入：
   - `taskStateMachine: TaskStateMachine` — 复用已有持久化
   - `workspaceRoot: string`
   - `fileManager: FileManager`
   - `tracer: Tracer`
   - `eventBus: AppEventBus`
   - `logger: Logger`
2. 内部状态：
   - `tasks: Map<string, TaskRecord>` — 任务索引
   - `writeQueue: Promise<void>` — 序列化写入队列
   - `userNoteBlocks: Map<string, string>` — 用户备注块
   - `lastRenderHash?: string` — 上次渲染的哈希（用于冲突检测）
3. 实现 `initialize()` 方法：
   - 若 progress.md 存在，调用 `load()` 解析现有内容
   - 否则调用 `persist()` 创建初始空 progress.md
4. 实现 `declare(input)` 方法：
   - 生成 taskId：`T-${YYYYMMDD}-${HHMMSS}`
   - 调用 `taskStateMachine.create()` 获取持久化 taskId（委托 TSM）
   - 创建 TaskRecord：state='running'、startedAt=now、checklist 根据 plannedChecklist 初始化
   - `this.tasks.set(id, task)`
   - `await this.persist()`
   - `this.eventBus.emitTaskDeclared(task)`
   - 返回 task
5. 实现 `update(taskId, patch)` 方法：
   - 获取 task，若不存在或非 running 状态则抛错
   - 应用 checklistUpdates：遍历并更新指定 index 的 status
   - 追加 newChecklistItems
   - 追加 output
   - `await this.persist()`
   - `this.eventBus.emitTaskUpdated(task)`
   - 返回 task
6. 实现 `complete(taskId, summary)` 方法：
   - 获取 task
   - 设置 state='completed'、completedAt=now、durationMs 计算、resultSummary
   - 调用 `taskStateMachine.advance(taskId, 'completed')`（委托 TSM）
   - `await this.persist()`
   - `await this.maybeArchive()`
   - `this.eventBus.emitTaskCompleted(task)`
   - 返回 task
7. 实现 `fail(taskId, reason)` 方法：
   - 获取 task
   - 设置 state='failed'、completedAt=now、durationMs 计算、failureReason
   - 调用 `taskStateMachine.advance(taskId, 'failed')`（委托 TSM）
   - `await this.persist()`
   - `await this.maybeArchive()`
   - `this.eventBus.emitTaskFailed(task)`
   - 返回 task
8. 实现 `editUserNote(taskId, note)` 方法：
   - `this.userNoteBlocks.set(taskId, note)`
   - `await this.persist()`
9. 实现 `getSnapshot()` 方法：
   - 构建并返回 ProgressSnapshot

### 步骤 4：实现 progress.md 渲染与写入

**文件：** `src/main/services/progress/progress-ledger.ts`（续）

1. 实现 `persist()` 方法：
   - 序列化写入：`this.writeQueue = this.writeQueue.then(() => this.doPersist())`
   - 返回 `this.writeQueue`
   - 确保多个 `persist()` 调用按序执行，无竞态
2. 实现 `doPersist()` 方法：
   - `const snapshot = this.buildSnapshot()`
   - `const content = this.render(snapshot)`
   - 使用 `withRetry()` 包裹写入操作（3 次重试）
   - 读取现有文件内容 → `detectUserEdits(existingFile)` → `fileManager.atomicWrite(path, content)`
   - 更新 `this.lastRenderHash = hash(content_without_user_notes)`
3. 实现 `render(snapshot: ProgressSnapshot): string` 方法：
   - 生成 YAML frontmatter（version: 1、updated、active_count、completed_today）
   - 渲染 `## 🔄 进行中` 区域：调用 `renderActiveSection()`
   - 渲染 `## ✅ 已完成（最近 10 条）` 区域：调用 `renderCompletedSection()`
   - 渲染 `## 📋 排队中` 区域
   - 渲染归档提示
   - 拼接所有区域
4. 实现 `renderActiveSection(active: TaskRecord[])` 方法：
   - 空时返回 `（暂无进行中的任务）`
   - 非空时遍历调用 `renderTaskEntry(t, 'running')`
5. 实现 `renderCompletedSection(completed: TaskRecord[])` 方法：
   - 遍历调用 `renderTaskEntry(t, 'completed')`
6. 实现 `renderTaskEntry(task, mode)` 方法：
   - running 模式：
     - 标题：`### [${task.id}] ${task.title}`
     - 开始时间、模式、已耗时
     - Trace 链接：`[查看执行轨迹](sibylla://trace/${task.traceId})` 或 `(无)`
     - 进度清单：每个 checklist 项用 ⏸/🔄/✅/⏭ 图标
     - user-note 块：`<!-- user-note:${task.id} -->\n${note}\n<!-- /user-note:${task.id} -->`
   - completed 模式：
     - 标题：`### [${task.id}] ${task.title} ✓` 或 `❌`
     - 耗时 + Trace 链接
     - 产出列表
     - 结果摘要或失败原因
7. 实现 `formatDuration(ms)` 辅助方法：
   - 转换为 `Xm Ys` 格式
8. 实现 `formatTimestamp(iso)` 辅助方法：
   - 转换为 `YYYY-MM-DD HH:MM` 格式
9. 实现 `formatMode(mode)` 辅助方法：
   - 映射为中文名称：plan→计划、analyze→分析、review→审查、free→自由
10. 实现 `generateTaskId()` 方法：
    - 格式 `T-YYYYMMDD-HHMMSS`

### 步骤 5：实现用户编辑检测与冲突处理

**文件：** `src/main/services/progress/progress-ledger.ts`（续）

1. 实现 `detectUserEdits(existingContent: string)` 方法：
   - 调用 `extractUserNotes(existingContent)` 提取现有 user-note 块内容
   - 更新 `this.userNoteBlocks` 为提取到的最新值
   - 调用 `stripUserNotes(existingContent)` 去除 user-note 块
   - 调用 `stripUserNotes(this.render(this.buildLastSnapshot()))` 去除上次渲染的 user-note 块
   - 比较两个 stripped 内容是否一致
   - 若不一致且 `this.lastRenderHash` 存在：检测到用户在 user-note 块外编辑
   - 调用 `createConflictBackup(existingContent)`
   - `this.eventBus.emit('progress:user-edit-conflict')`
2. 实现 `extractUserNotes(content: string): Map<string, string>` 方法：
   - 正则匹配 `<!-- user-note:([^"]*?) -->\n([\s\S]*?)\n<!-- /user-note:\1 -->`
   - 返回 Map<taskId, noteContent>
3. 实现 `stripUserNotes(content: string): string` 方法：
   - 正则替换 user-note 块为空字符串
4. 实现 `createConflictBackup(content: string)` 方法：
   - 将 content 写入 `workspaceRoot/.progress.conflict.md`
   - logger.warn('progress.user-edit.detected')

### 步骤 6：实现归档

**文件：** `src/main/services/progress/progress-ledger.ts`（续）

1. 实现 `maybeArchive()` 方法：
   - 获取所有 completed/failed 任务，按 completedAt 降序排列
   - 若总数 ≤ 10，不归档
   - 取第 11 条及之后为 toArchive
   - 计算归档月份：`new Date().toISOString().substring(0, 7)`
   - 归档路径：`.sibylla/trace/progress-archive/${month}.md`
   - 渲染 toArchive 条目为 Markdown（调用 renderTaskEntry）
   - `await fileManager.appendFile(archivePath, archiveContent + '\n\n')`
   - 从 `this.tasks` Map 中删除已归档任务
2. 实现 `getArchive(month: string)` 方法：
   - 读取归档文件内容
   - 解析并返回 TaskRecord[]（简化实现：返回原始 Markdown 内容或按行解析）

### 步骤 7：实现 ProgressLedger 加载

**文件：** `src/main/services/progress/progress-ledger.ts`（续）

1. 实现 `load()` 方法：
   - 读取 progress.md 内容
   - 解析 YAML frontmatter
   - 解析 `## 🔄 进行中` 区域下的任务条目
   - 解析 `## ✅ 已完成` 区域下的任务条目
   - 解析 `## 📋 排队中` 区域下的任务条目
   - 提取 user-note 块
   - 构建 `this.tasks` Map
   - 计算 `this.lastRenderHash`
2. 实现 `parseTaskEntries(sectionContent: string, mode: 'running' | 'completed'): TaskRecord[]` 方法：
   - 按 `### [` 分割任务条目
   - 对每个条目提取 id、title、状态、时间、Trace 链接、checklist、output 等
   - 返回 TaskRecord[]
3. 实现 `buildSnapshot()` 方法：
   - 从 tasks Map 中提取 active / completedRecent / queued
   - completedRecent 取最近 10 条

### 步骤 8：实现统一导出

**文件：** `src/main/services/progress/index.ts`

1. 从 `types.ts` 导出所有类型
2. 从 `progress-ledger.ts` 导出 `ProgressLedger`

### 步骤 9：扩展 shared/types.ts

**文件：** `src/shared/types.ts`

1. 在 `IPC_CHANNELS` 中追加 Progress 相关通道：
   ```
   PROGRESS_GET_SNAPSHOT: 'progress:getSnapshot'
   PROGRESS_GET_TASK: 'progress:getTask'
   PROGRESS_EDIT_NOTE: 'progress:editUserNote'
   PROGRESS_GET_ARCHIVE: 'progress:getArchive'
   ```
2. 在 `IPCChannelMap` 中追加类型映射：
   - `PROGRESS_GET_SNAPSHOT` → `{ params: []; return: ProgressSnapshot }`
   - `PROGRESS_GET_TASK` → `{ params: [id: string]; return: TaskRecord | null }`
   - `PROGRESS_EDIT_NOTE` → `{ params: [taskId: string, note: string]; return: void }`
   - `PROGRESS_GET_ARCHIVE` → `{ params: [month: string]; return: string }`
3. 新增事件通道常量（Main→Renderer push）：
   ```
   PROGRESS_TASK_DECLARED: 'progress:taskDeclared'
   PROGRESS_TASK_UPDATED: 'progress:taskUpdated'
   PROGRESS_TASK_COMPLETED: 'progress:taskCompleted'
   PROGRESS_TASK_FAILED: 'progress:taskFailed'
   PROGRESS_USER_EDIT_CONFLICT: 'progress:userEditConflict'
   ```

### 步骤 10：AIHandler 集成（后置解析）

**文件：** `src/main/ipc/handlers/ai.handler.ts`

1. 新增 `private progressLedger?: ProgressLedger` 字段
2. 新增 `setProgressLedger(ledger: ProgressLedger): void` 方法
3. 在 `handleStream` / `handleHarnessStream` 完成后：
   ```typescript
   const finalContent = fullContent.join('')
   if (this.progressLedger) {
     const blocks = new TaskDeclarationParser().parseNewBlocks(finalContent)
     let taskId: string | null = null

     for (const block of blocks) {
       if (block.type === 'declare') {
         const task = await this.progressLedger.declare({
           title: block.data.title,
           traceId: currentTraceId,
           conversationId: request.sessionId,
           plannedChecklist: block.data.planned_steps
         })
         taskId = task.id
       } else if (block.type === 'update' && taskId) {
         await this.progressLedger.update(taskId, block.data)
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
4. 从最终响应内容中去除 `<!-- sibylla:task-* -->` 块后再发送给渲染进程（用户不应看到声明块）
5. 注意：解析在流完成后执行，不侵入流式路径内部逻辑

### 步骤 11：HarnessOrchestrator 声明提示注入

**文件：** `src/main/services/harness/orchestrator.ts`

1. 在 `buildSystemPrompt()` 方法中：
   - 新增声明提示段落（当 `shouldRequireTaskDeclaration(request)` 为 true 时注入）
   - 提示格式说明：
     ```
     在开始多步骤工作前，请先输出任务声明：
     <!-- sibylla:task-declare
     {
       "title": "任务标题",
       "planned_steps": ["步骤1", "步骤2", ...],
       "estimated_duration_min": 预估分钟
     }
     -->
     执行过程中可输出进度更新：
     <!-- sibylla:task-update
     {
       "checklistUpdates": [{"index": 0, "status": "done"}],
       "newChecklistItems": ["新步骤"]
     }
     -->
     完成时输出归档：
     <!-- sibylla:task-complete
     {"summary": "完成摘要"}
     -->
     ```
2. 实现 `shouldRequireTaskDeclaration(request)` 方法：
   - 消息长度 > 200 字符 → true
   - 含关键词（计划|步骤|分析|撰写|生成文档）→ true
   - 否则 → false

### 步骤 12：实现 IPC Handler

**文件：** `src/main/ipc/handlers/progress.ts`（新建）

1. 注册 `IPC_CHANNELS.PROGRESS_GET_SNAPSHOT` handler：
   - 调用 `progressLedger.getSnapshot()`
2. 注册 `IPC_CHANNELS.PROGRESS_GET_TASK` handler：
   - 调用 `progressLedger.getTask(id)`
3. 注册 `IPC_CHANNELS.PROGRESS_EDIT_NOTE` handler：
   - 调用 `progressLedger.editUserNote(taskId, note)`
4. 注册 `IPC_CHANNELS.PROGRESS_GET_ARCHIVE` handler：
   - 调用 `progressLedger.getArchive(month)`
5. 在 `src/main/index.ts` 中注册此 handler

### 步骤 13：主进程初始化

**文件：** `src/main/index.ts`（扩展）

1. 在 `onWorkspaceOpened` 中创建 ProgressLedger：
   ```typescript
   const progressLedger = new ProgressLedger(
     taskStateMachine,
     workspaceRoot,
     fileManager,
     tracer,
     appEventBus,
     logger
   )
   await progressLedger.initialize()
   ```
2. 注入到 AIHandler：
   ```typescript
   aiHandler.setProgressLedger(progressLedger)
   ```
3. 在 `onWorkspaceClosed` 中清理 ProgressLedger

## 测试计划

### 单元测试文件结构

```
tests/progress/
├── progress-ledger.test.ts      ← ProgressLedger 核心 API 测试
└── task-declaration-parser.test.ts  ← 解析器测试
```

### progress-ledger.test.ts 测试用例

1. **declare** — 创建 TaskRecord，progress.md 含正确条目
2. **update checklist** — 更新 checklist 状态，progress.md 反映变更
3. **complete** — 移至已完成区域，duration 计算
4. **fail** — 移至已完成区域，❌ 标记
5. **user-note preserve** — 更新 progress.md 时保留 user-note 块
6. **user-edit conflict** — 检测 user-note 外编辑，创建 .progress.conflict.md
7. **archive** — 超 10 条已完成时归档到 progress-archive/
8. **trace link** — 有 traceId 时含 sibylla://trace/ 链接
9. **concurrent tasks** — 多任务同时进行，均出现在进行中区域
10. **write retry** — 写入失败重试 3 次，最终失败不中断任务
11. **load from file** — 从已有 progress.md 加载任务状态
12. **auto-complete** — 未归档任务自动完成

### task-declaration-parser.test.ts 测试用例

1. **parse declare block** — 正确解析 task-declare 块
2. **parse update block** — 正确解析 task-update 块
3. **parse complete block** — 正确解析 task-complete 块
4. **malformed JSON** — 解析失败时跳过，不抛错
5. **multiple blocks** — 一次解析多个不同类型块
6. **duplicate block** — 已解析块不重复返回
7. **no blocks** — 无匹配时返回空数组