# PHASE2-TASK010: 任务看板与 AI 任务管理 — 实施计划

> 任务来源：[specs/tasks/phase2/phase2-task010_kanban-ai-task-management.md](../../specs/tasks/phase2/phase2-task010_kanban-ai-task-management.md)
> 创建日期：2026-05-01
> 最后更新：2026-05-01

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK010 |
| **任务标题** | 任务看板与 AI 任务管理 |
| **所属阶段** | Phase 2 - 项目管理闭环 (Sprint 6) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 5-6 工作日 |
| **前置依赖** | TASK001(事件总线) + TASK004(WikiLinks) + TASK006(通知中心) + TASK007(Presence/L7) + TASK008(ProactiveEngine) + Sprint 3.1~3.5 |

### 1.1 目标

构建 Sprint 6 的任务管理核心——Kanban 看板 UI、tasks.md 双向同步、AI 辅助任务创建和 AI 任务状态自动追踪。以 `tasks.md` 作为用户层唯一真相源，通过 `KanbanService` 桥接 ProgressLedger 和 TaskStateMachine，实现"用户任务"与"AI 任务"的统一管理。

### 1.2 核心设计约束（不可违反）

1. **tasks.md 是用户层唯一真相源**——KanbanService 仅是解析器/写入器，不创建新存储介质
2. **不修改 ProgressLedger 核心接口**——仅在 `TaskRecord` 和 `DeclareInput` 新增可选 `kanbanTaskId` 字段
3. **三套状态模型严格映射**——Kanban 3态 / ProgressLedger 5态 / TaskStateMachine 6态，转换规则由 KanbanService 强制执行
4. **事件命名使用 kanban.* 前缀**——避免与现有 `task.*`（TaskStateMachine 级别）冲突
5. **AI 建议必须可追溯**——每个 AI 任务建议必须引用具体对话片段作为来源
6. **启发式评估不调用 LLM**——TaskStatusTracker 使用纯函数信号加权
7. **tasks.md 格式兼容**——支持多种 GFM checklist 缩进风格，解析失败降级为只读模式

### 1.3 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| KanbanService | `src/main/services/kanban/kanban-service.ts` | tasks.md 解析/写入/双向同步核心 |
| KanbanModel 类型 | `src/main/services/kanban/types.ts` | KanbanTask / KanbanModel / KanbanColumn |
| TaskStatusTracker | `src/main/services/kanban/task-status-tracker.ts` | 文件变更启发式状态追踪 |
| task-extractor Prompt | `resources/prompts/agents/task-extractor.md` | 从对话中提取可执行任务 |
| IPC Handlers | `src/main/ipc/handlers/kanban.ts` | 看板 IPC 通道 |
| Zustand Store | `src/renderer/store/kanbanStore.ts` | 看板 UI 状态管理 |
| KanbanBoard | `src/renderer/components/kanban/KanbanBoard.tsx` | 三列拖拽看板 |
| KanbanTaskCard | `src/renderer/components/kanban/KanbanTaskCard.tsx` | 任务卡片组件 |
| KanbanTaskDetail | `src/renderer/components/kanban/KanbanTaskDetail.tsx` | 任务详情面板 |
| KanbanCreateForm | `src/renderer/components/kanban/KanbanCreateForm.tsx` | 任务创建表单 |
| AiTaskSidebar | `src/renderer/components/kanban/AiTaskSidebar.tsx` | AI 工作中侧边栏 |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；文件即真相；AI 建议人类决策；原子写入先临时后替换 | 全局约束 |
| `specs/design/architecture.md` | 进程通信架构(§3.2)、IPC 模式 | IPC 设计 |
| `specs/design/data-and-api.md` | Workspace 文件结构（tasks.md 位置） | KanbanService 读写 |
| `specs/design/ui-ux-design.md` | 色彩体系(#6366F1 主色)、组件规范、Toast 规范 | UI 组件设计 |
| `specs/design/sub-agent-system.md` | Sub-agent 注册与执行、YAML frontmatter 格式 | task-extractor prompt |
| `specs/requirements/phase2/sprint6-task-management.md` | 需求 6.1~6.3、§2.1 四件套层次关系、§9.2~9.13 冲突分析 | 验收标准 |
| `specs/tasks/phase2/phase2-task010_kanban-ai-task-management.md` | 9 步执行路径、全部验收标准 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `electron-ipc-patterns` | Kanban IPC 设计；M→R 推送事件；类型安全通道映射 | `kanban.ts` handler + `preload/index.ts` 扩展 |
| `zustand-state-management` | `kanbanStore.ts` 设计；selector 性能优化；IPC 封装在 action 中 | `src/renderer/store/kanbanStore.ts` |
| `ai-context-engine` | L7 任务概览段扩展；Token 预算裁剪策略；与 `assembleContextV2()` 集成 | `collab-context-provider.ts` 修改 |
| `vite-electron-build` | 新增 `@dnd-kit` 依赖后的构建配置 | `package.json` 依赖管理 |

### 2.3 前置代码依赖

| 模块 | 实际文件路径 | 复用方式 |
|------|------------|---------|
| `TaskRecord` / `DeclareInput` | `sibylla-desktop/src/main/services/progress/types.ts:15-46` | 新增可选 `kanbanTaskId?: string`（C9 最小侵入） |
| `SibyllaEventType` | `sibylla-desktop/src/main/services/event-bus-types.ts:5-62` | 追加 5 个 `kanban.*` 事件类型 |
| `EventPayloadMap` | `sibylla-desktop/src/main/services/event-bus-types.ts:76-133` | 追加 kanban 事件 payload 类型 |
| `AppEventBus` | `sibylla-desktop/src/main/services/event-bus.ts` | 发射 kanban 事件，订阅 progress.task-* / file.updated |
| `ProgressLedger` | `sibylla-desktop/src/main/services/progress/progress-ledger.ts` | `declare({ kanbanTaskId })` 创建 AI 侧任务 |
| `TaskStateMachine` | `sibylla-desktop/src/main/services/harness/task-state-machine.ts` | `create()` 初始化 AI 任务状态机 |
| `FileManager` | `sibylla-desktop/src/main/services/file-manager.ts` | KanbanService 读写 tasks.md |
| `NotificationRule` | `sibylla-desktop/src/main/services/notifications/notification-rules.ts` | 追加 2 条看板通知规则（C10） |
| `NotificationEngine` | `sibylla-desktop/src/main/services/notifications/notification-engine.ts` | TaskStatusTracker 推送状态建议 |
| `SubAgentRegistry` | `sibylla-desktop/src/main/services/sub-agent/SubAgentRegistry.ts` | 自动发现 task-extractor.md |
| `SubAgentExecutor` | `sibylla-desktop/src/main/services/sub-agent/SubAgentExecutor.ts` | 执行 task-extractor Sub-agent |
| `ProactiveEngine` | `sibylla-desktop/src/main/services/proactive-engine/index.ts` | task-decomposition 触发器对接 |
| `task-decomposition` 触发器 | `sibylla-desktop/src/main/services/proactive-engine/triggers/task-decomposition.ts` | 将占位 buildDraft() 连接到 task-extractor |
| `CollabContextProvider` | `sibylla-desktop/src/main/services/context-engine/collab-context-provider.ts` | L7 新增任务概览段（C7） |
| `V2_BUDGET_WEIGHTS` | `sibylla-desktop/src/main/services/context-engine/types-v2.ts` | collab 层 5% 预算内裁剪 |
| `IpcHandler` | `sibylla-desktop/src/main/ipc/handler.ts` | 新建 kanban handler 继承此类 |
| `IPC_CHANNELS` | `sibylla-desktop/src/shared/types.ts` | 追加 kanban:* 通道常量 |
| `preload/index.ts` | `sibylla-desktop/src/preload/index.ts` | 新增 kanban 命名空间 |
| `GitAbstraction` | `sibylla-desktop/src/main/services/git-abstraction.ts` | TaskStatusTracker 获取 commit 消息 |
| `PrivacyFilter` | `sibylla-desktop/src/main/services/presence/privacy-filter.ts` | AI 侧边栏过滤 personal/ 路径 |

### 2.4 IPC 通道清单（本任务新增）

| 通道常量 | 通道名 | 方向 | 用途 |
|---------|--------|------|------|
| `KANBAN_PARSE` | `kanban:parse` | R→M | 解析 tasks.md 返回 KanbanModel |
| `KANBAN_CREATE` | `kanban:create` | R→M | 创建新任务追加到 tasks.md |
| `KANBAN_UPDATE_STATUS` | `kanban:updateStatus` | R→M | 更新任务状态（拖拽/确认） |
| `KANBAN_DISPATCH_AI` | `kanban:dispatchAI` | R→M | 派发任务给 AI 执行 |
| `KANBAN_PROMOTE` | `kanban:promote` | R→M | 提升 ProgressLedger 任务到 tasks.md |
| `KANBAN_AI_SIDEBAR` | `kanban:aiSidebar` | R→M | 获取 AI 侧边栏活跃任务列表 |
| `KANBAN_DISMISS_SUGGESTION` | `kanban:dismissSuggestion` | R→M | 忽略 AI 状态建议 |
| `KANBAN_ACCEPT_SUGGESTION` | `kanban:acceptSuggestion` | R→M | 接受 AI 状态建议 |
| — | `kanban:onTaskCreated` | M→R | 任务创建推送 |
| — | `kanban:onStatusChanged` | M→R | 状态变更推送 |

 注：复用现有 `event:*` 通道推送看板事件变更到渲染进程。

---

## 三、现有代码盘点与差距分析

### 3.1 事件类型（需扩展 ⚠️）

`event-bus-types.ts` 当前包含 62 个事件类型，其中：
- `task.created` (line 49) — TaskStateMachine 级别，payload `{ taskId: string }`
- `task.completed` (line 50) — TaskStateMachine 级别
- `progress.task-declared` (line 29) — ProgressLedger 级别，payload `TaskRecord`
- `progress.task-completed` (line 31) — ProgressLedger 级别
- `progress.task-failed` (line 32) — ProgressLedger 级别
- `file.updated` (line 7) — TaskStatusTracker 将订阅此事件

**缺口：** 缺少 5 个 `kanban.*` 事件类型和对应的 `EventPayloadMap` 条目。

### 3.2 ProgressLedger 类型（需扩展 ⚠️）

**现有 `progress/types.ts`:**

```typescript
interface TaskRecord { // line 15-31, 共 11 个字段
  id, title, state, mode?, traceId?, conversationId?,
  createdAt, startedAt?, completedAt?, durationMs?,
  checklist, outputs, resultSummary?, failureReason?, userNotes?
}

interface DeclareInput { // line 40-46, 共 5 个字段
  title, mode?, traceId?, conversationId?, plannedChecklist?
}
```

**缺口：** 两个接口均缺少 `kanbanTaskId?: string`。新增后所有现有 `declare()` 调用无需修改（可选字段，自动传递）。

### 3.3 NotificationRules（需扩展 ⚠️）

`notification-rules.ts` 当前有 8 条内置规则（mcp-mention, mcp-assigned, mcp-urgent, collab-conflict, collab-peer-active, memory-insight, performance-alert-relay, system-indexed）。

**缺口：** 缺少 `kanban-status-suggestion` 和 `kanban-task-risk` 两条规则。

### 3.4 CollabContextProvider（需扩展 ⚠️）

**现有 `collab-context-provider.ts`（206 行）:**
- `collect()` 方法返回 `CollabContext { layers, unresolvedReferences? }`
- 构造函数注入 `PresenceStore`、`EventLogStore`、`getMembers()`、`PrivacyFilter`
- `shouldInject()` 检测协作关键词（COLLAB_KEYWORDS）和成员名匹配

**缺口：**
- 构造函数缺少 `kanbanService` 依赖
- `shouldInject()` 缺少任务关键词检测
- `collect()` 缺少任务概览段生成与裁剪

### 3.5 task-decomposition 触发器（需修改 ⚠️）

**现有 `task-decomposition.ts`（22 行）:**
- `condition()` 检测目标/需求关键词 + 缺少列表格式
- `buildDraft()` 返回占位的 `SuggestionDraft`，未连接 Sub-agent

**缺口：** `buildDraft()` 需要连接到 `task-extractor` Sub-agent，生成包含 `conversationSnippet` 的上下文。

### 3.6 IPC 通道与 Preload（需扩展 ⚠️）

- `shared/types.ts` IPC_CHANNELS 缺少 8 个 kanban 通道常量
- `preload/index.ts` ElectronAPI 缺少 `kanban` 命名空间
- `ALLOWED_CHANNELS` 列表需追加新通道名

### 3.7 依赖库缺口

`@dnd-kit/core` + `@dnd-kit/sortable` 不在当前 `package.json` 中，需新增安装。

### 3.8 完全缺失的文件

| 文件 | 说明 |
|------|------|
| `src/main/services/kanban/` 目录 | 需创建整个目录 |
| `src/main/services/kanban/types.ts` | KanbanModel / KanbanTask / KanbanColumn 类型 |
| `src/main/services/kanban/kanban-service.ts` | 核心看板服务 |
| `src/main/services/kanban/task-status-tracker.ts` | 启发式状态追踪 |
| `resources/prompts/agents/task-extractor.md` | 任务提取 Sub-agent prompt |
| `src/main/ipc/handlers/kanban.ts` | 看板 IPC handler |
| `src/renderer/store/kanbanStore.ts` | Zustand store |
| `src/renderer/components/kanban/` 目录 | 全部 UI 组件 |
| `tests/main/services/kanban/` | 单元测试目录 |

---

## 四、分步实施计划

### 阶段 A：类型扩展与事件注册（Step 1-2） — 预计 0.5 天

#### A1：扩展 ProgressLedger 类型（C9 最小侵入）

**文件：** `sibylla-desktop/src/main/services/progress/types.ts`（修改）

在 `TaskRecord` 接口（line 30）末尾 `userNotes` 之后新增：

```typescript
kanbanTaskId?: string
```

在 `DeclareInput` 接口（line 45）末尾 `plannedChecklist` 之后新增：

```typescript
kanbanTaskId?: string
```

**零破坏保证：** `kanbanTaskId` 为可选字段，ProgressLedger `declare()` 已将 `DeclareInput` 展开到 `TaskRecord`，新增字段自动传递。所有现有调用无需修改。

#### A2：新增 kanban.* 事件类型（C2）

**文件：** `sibylla-desktop/src/main/services/event-bus-types.ts`（修改）

1. 在 `SibyllaEventType` 联合类型（line 61 `task.cross-device-resumeable` 之后）追加：

```typescript
| 'kanban.task-created'
| 'kanban.task-status-changed'
| 'kanban.task-completed'
| 'kanban.task-dispatched'
| 'kanban.task-risk-detected'
```

2. 在 `EventPayloadMap`（line 132 `task.cross-device-resumeable` 之后）追加：

```typescript
'kanban.task-created': { taskId: string; title: string; assignee?: string; source: 'user' | 'ai-suggest' }
'kanban.task-status-changed': { taskId: string; from: string; to: string; trigger: 'drag' | 'ai-auto' | 'dispatch' }
'kanban.task-completed': { taskId: string; completedBy: 'user' | 'ai-auto' }
'kanban.task-dispatched': { taskId: string; ledgerTaskId: string }
'kanban.task-risk-detected': { taskId: string; riskType: string; confidence: number; signals: string[] }
```

**零破坏保证：** 新增事件类型不影响现有事件订阅。`kanban.*` 与 `task.*` 命名空间完全独立。

#### A3：创建 Kanban 类型定义

**文件：** `sibylla-desktop/src/main/services/kanban/types.ts`（新建）

```typescript
export type KanbanColumn = '待开始' | '进行中' | '已完成'

export interface KanbanTask {
  id: string
  title: string
  status: KanbanColumn
  assignee?: string
  priority?: 'P0' | 'P1' | 'P2'
  deadline?: string
  relatedFiles?: string[]
  isAiLinked: boolean
  isAiSuggested: boolean
  completedAt?: string
  rawLine: string
  metadataLines: string[]
}

export interface KanbanModel {
  tasks: KanbanTask[]
  columns: Record<KanbanColumn, KanbanTask[]>
  rawContent: string
  parsedAt: number
  parseError?: boolean
}

export interface CreateTaskInput {
  title: string
  assignee?: string
  priority?: 'P0' | 'P1' | 'P2'
  deadline?: string
  relatedFiles?: string[]
  status?: KanbanColumn
  isAiSuggested?: boolean
}

export interface StatusSuggestion {
  taskId: string
  currentStatus: KanbanColumn
  suggestedStatus: KanbanColumn
  confidence: number
  signals: Array<{ type: string; weight: number; description: string }>
  reasoning: string
}
```

**验证：** TypeScript 编译通过；ProgressLedger 现有 `declare()` 调用不受影响。

---

### 阶段 B：KanbanService 核心实现（Step 3） — 预计 1.5 天

#### B1：实现 KanbanService

**文件：** `sibylla-desktop/src/main/services/kanban/kanban-service.ts`（新建）

**依赖注入：**

```typescript
constructor(
  private readonly fileManager: FileManager,
  private readonly progressLedger: ProgressLedger,
  private readonly taskStateMachine: TaskStateMachine,
  private readonly eventBus: AppEventBus,
)
```

**核心方法实现：**

**1. `parseTasksMd(workspacePath: string): Promise<KanbanModel>`**

解析流程：
- 通过 `FileManager.readFile()` 读取 `tasks.md`
- 按 `## (待开始|进行中|已完成)` 正则分割三列 section
- 逐行解析 `- [ ]` / `- [x]` 为 `KanbanTask`
- 正则提取 HTML 注释：`/<!--\s*task-id:\s*(\S+)(?:\s+(ai-linked))?\s*-->/`
- 正则提取 `<!-- ai-suggested -->` 标记
- 解析 `  - key: value` 格式元数据行（负责人/优先级/截止日期/关联文件）
- 解析失败时设置 `parseError = true`

**关键设计：**
- `[x]` 始终映射到"已完成"列，`[ ]` 根据所在 section header 确定列
- task-id 缺失时自动分配空字符串（非致命错误）
- 空文件返回空 KanbanModel（三列空数组）

**2. `updateTaskStatus(taskId: string, newStatus: KanbanColumn, trigger?: string): Promise<void>`**

- 重新读取最新 content（防止覆盖外部修改）
- 定位目标任务行和当前列 section
- 修改 checkbox 标记（已完成 ↔ 未完成）
- 移动行到目标列 section
- `FileManager.writeFile()` 原子写入
- 发射 `kanban.task-status-changed` 事件

**3. `createTask(input: CreateTaskInput): Promise<KanbanTask>`**

- 生成 task-id：`tsk_${randomBytes(3).toString('hex')}`
- 构造 Markdown 行：
  ```
  - [ ] {title} <!-- task-id: {id} -->
    - 负责人: {assignee}
    - 优先级: {priority}
    - 截止日期: {deadline}
    - 关联文件: {relatedFiles}
  ```
- 追加到目标列（默认"待开始"）
- `isAiSuggested` 时追加 `<!-- ai-suggested -->`
- 发射 `kanban.task-created` 事件

**4. `dispatchToAI(taskId: string): Promise<string>`**

执行流程：
1. 从当前 KanbanModel 查找任务
2. 调用 `progressLedger.declare({ title, kanbanTaskId: taskId })`
3. 调用 `taskStateMachine.create(ledgerTaskId)`
4. 在 tasks.md 对应行追加 `ai-linked` 标记
5. 发射 `kanban.task-dispatched` 事件
6. 返回 `ledgerTaskId`

**5. `promoteFromLedger(ledgerTaskId: string): Promise<string>`**

- 从 ProgressLedger.getSnapshot() 获取任务详情
- 在 tasks.md "进行中"列追加新条目（含 `ai-linked` 标记）
- 调用 ProgressLedger 更新 `kanbanTaskId`
- 发射 `kanban.task-created`（`source: 'ai-suggest'`）事件
- 返回新 task-id

**6. AI 完成自动回写（事件订阅）**

在构造函数中订阅：
- `progress.task-completed`：检查 `kanbanTaskId` 存在且 `isAiLinked` → 自动调用 `updateTaskStatus(kanbanTaskId, '已完成', 'ai-auto')` → 发射 `kanban.task-completed`（`completedBy: 'ai-auto'`）
- `progress.task-failed`：检查 `kanbanTaskId` 存在 → 不自动回写，仅触发 UI 状态更新（通过事件通知渲染进程）

**7. 三套状态映射执行**

```
KanbanService 内部严格执行映射：
  派发时: Kanban "进行中" ← ProgressLedger queued (不直接 running)
  AI 启动: ProgressLedger queued → running, Kanban 保持 "进行中"
  AI 完成(ai-linked): ProgressLedger completed → Kanban 自动 "已完成"
  AI 完成(手动): 非 ai-linked → 用户手动拖拽
  AI 失败: ProgressLedger failed → Kanban 保持 "进行中" + 失败标记
  AI 暂停: ProgressLedger paused → Kanban 保持 "进行中" + 暂停标记
```

**验证：** 单元测试覆盖解析（标准格式/多种缩进/ai-linked/空文件/损坏格式降级）、写入（创建/状态更新/派发标记）、状态映射（6 种转换场景）。

---

### 阶段 C：TaskStatusTracker 实现（Step 4） — 预计 1 天

#### C1：实现 TaskStatusTracker

**文件：** `sibylla-desktop/src/main/services/kanban/task-status-tracker.ts`（新建）

**依赖注入：**

```typescript
constructor(
  private readonly kanbanService: KanbanService,
  private readonly eventBus: AppEventBus,
  private readonly notificationEngine: NotificationEngine,
  private readonly gitAbstraction: GitAbstraction,
)
```

**5 个启发式信号检测器（纯函数，不调用 LLM）：**

| 检测器 | 函数 | 触发条件 | 权重 | 目标状态 |
|--------|------|---------|------|---------|
| 文件创建 | `detectFileCreated()` | 关联文件首次出现 | +0.3 | 待开始 → 进行中 |
| 内容增长 | `detectFileGrowth()` | 增量 > 200 字 | +0.2 | 进行中 |
| Commit 关键词 | `detectCommitKeyword()` | 匹配 `/(完成\|done\|finish\|closed)/i` | +0.5 | 进行中 → 已完成 |
| 文件冻结 | `detectFileFrozen()` | 匹配 `frozen\|published` 标记 | +0.4 | 已完成 |
| 过期风险 | `detectStaleRisk()` | 24h 无变更 + deadline 临近 | +0.3 | 风险预警 |

**核心方法 `evaluate(taskId, fileEvent)`：**

1. 从 KanbanModel 查找任务的 `relatedFiles`
2. 匹配 fileEvent.path 与 relatedFiles
3. 运行所有匹配信号检测器，累加权重
4. 风险信号（`stale-risk`）单独触发 `kanban.task-risk-detected` 事件
5. 置信度 ≥ 0.6 → 返回 `StatusSuggestion`（通过 NotificationEngine 推送）
6. 置信度 ≥ 0.9 → 允许"快速采纳"按钮

**Dismissal 管理：**

```typescript
private readonly dismissals = new Map<string, { suggestedStatus: KanbanColumn; dismissedAt: number }>()

isDismissed(taskId: string, suggestedStatus: KanbanColumn): boolean {
  const key = `${taskId}:${suggestedStatus}`
  const entry = this.dismissals.get(key)
  if (!entry) return false
  return Date.now() - entry.dismissedAt < 24 * 60 * 60 * 1000
}

recordDismissal(taskId: string, suggestedStatus: KanbanColumn): void {
  this.dismissals.set(`${taskId}:${suggestedStatus}`, { suggestedStatus, dismissedAt: Date.now() })
}
```

**事件订阅：**

在 `start()` 方法中订阅 `file.updated`：
- 匹配文件路径与所有任务的 `relatedFiles`
- 命中时调用 `evaluate()`
- 返回的 `StatusSuggestion` 通过 NotificationEngine 推送

**验证：** 单元测试覆盖各信号权重、多信号累加、置信度阈值（0.6/0.9）、dismissal 24h 冷却、风险信号独立触发。

---

### 阶段 D：task-extractor Sub-agent Prompt（Step 5） — 预计 0.5 天

#### D1：创建 task-extractor Prompt

**文件：** `sibylla-desktop/resources/prompts/agents/task-extractor.md`（新建）

遵循 `memory-curator.md` 格式。关键字段：

```yaml
id: task-extractor
model: claude-haiku
allowed_tools: [reference_file, unified_search]
max_turns: 3
max_tokens: 2000
output_schema: # JSON array，每项含 title/assignee/priority/deadline/relatedFiles/reason/sourceQuote
```

- `context.inherit_memory: false`, `inherit_trace: false`, `inherit_workspace_boundary: true`
- 输出 JSON 数组，`sourceQuote` 为必填字段（反幻觉约束）

**Prompt 正文核心约束：**

1. 输入：最近 N 轮对话 + 当前 tasks.md 内容（去重用）
2. 仅提取**明确表述的行动项**，不臆测
3. 每个建议必须包含 `sourceQuote`（引用具体对话片段作为来源，反幻觉约束）
4. 对话中无可执行项时返回空数组 `[]`
5. 去重：已存在于 tasks.md 的任务不重复提取
6. 输出严格为 JSON 数组

**自动发现：** 文件放入 `resources/prompts/agents/` 后，`SubAgentRegistry` 自动发现，无需代码注册。

**验证：** 手动测试 3 种场景（有可执行项对话、无可执行项对话、与 tasks.md 重复的任务）。

---

### 阶段 E：Kanban IPC Handler 与 Preload 扩展（Step 6） — 预计 0.5 天

#### E1：实现 Kanban IPC Handlers

**文件：** `sibylla-desktop/src/main/ipc/handlers/kanban.ts`（新建）

继承 `IpcHandler`，namespace `'kanban'`。

| Handler | 通道 | 实现 |
|---------|------|------|
| `handleParse` | `kanban:parse` | `kanbanService.parseTasksMd(workspacePath)` |
| `handleCreate` | `kanban:create` | `kanbanService.createTask(input)` |
| `handleUpdateStatus` | `kanban:updateStatus` | `kanbanService.updateTaskStatus(taskId, newStatus)` |
| `handleDispatchAI` | `kanban:dispatchAI` | `kanbanService.dispatchToAI(taskId)` |
| `handlePromote` | `kanban:promote` | `kanbanService.promoteFromLedger(ledgerTaskId)` |
| `handleAiSidebar` | `kanban:aiSidebar` | `progressLedger.getSnapshot()` 过滤无 `kanbanTaskId` 的活跃任务 |
| `handleDismissSuggestion` | `kanban:dismissSuggestion` | `taskStatusTracker.recordDismissal(taskId, suggestedStatus)` |
| `handleAcceptSuggestion` | `kanban:acceptSuggestion` | `kanbanService.updateTaskStatus(taskId, suggestedStatus, 'ai-auto')` |

#### E2：扩展 shared/types.ts

追加 `IPC_CHANNELS` 常量：

```typescript
KANBAN_PARSE: 'kanban:parse',
KANBAN_CREATE: 'kanban:create',
KANBAN_UPDATE_STATUS: 'kanban:updateStatus',
KANBAN_DISPATCH_AI: 'kanban:dispatchAI',
KANBAN_PROMOTE: 'kanban:promote',
KANBAN_AI_SIDEBAR: 'kanban:aiSidebar',
KANBAN_DISMISS_SUGGESTION: 'kanban:dismissSuggestion',
KANBAN_ACCEPT_SUGGESTION: 'kanban:acceptSuggestion',
```

追加 `IPCChannelMap` 类型签名。

#### E3：扩展 preload/index.ts

追加 `kanban` 命名空间到 `ElectronAPI`，暴露 8 个 R→M 方法（parse/create/updateStatus/dispatchAI/promote/aiSidebar/dismissSuggestion/acceptSuggestion）和 2 个 M→R 监听（onTaskCreated/onStatusChanged）。

追加 `ALLOWED_CHANNELS` 注册全部 8 个通道名。

**验证：** IPC 通道类型安全注册、handler 正确调用 KanbanService 方法、错误处理和 IPCResponse 包装。

---

### 阶段 F：通知规则扩展 + L7 上下文扩展（Step 8 部分） — 预计 0.5 天

#### F1：新增 2 条通知规则（C10）

**文件：** `sibylla-desktop/src/main/services/notifications/notification-rules.ts`（修改）

在 `createBuiltinRules(deps)` 返回数组末尾追加：

**规则 `kanban-status-suggestion`：**

```typescript
{
  id: 'kanban-status-suggestion',
  eventType: 'kanban.task-status-changed',
  description: 'AI suggested task status update',
  enabled: true,
  condition: (event: SibyllaEvent) => {
    const payload = event.payload as { trigger: string }
    return payload.trigger === 'ai-auto'
  },
  build: (event: SibyllaEvent) => {
    const payload = event.payload as { taskId: string; from: string; to: string }
    return {
      type: 'kanban.status-suggestion' as const,
      priority: 'normal' as const,
      source: { provider: 'kanban' },
      title: 'AI 建议更新任务状态',
      body: `任务 ${payload.taskId}: ${payload.from} → ${payload.to}`,
      groupKey: `kanban-status:${payload.taskId}`,
      metadata: {},
    }
  },
},
```

**规则 `kanban-task-risk`：**

```typescript
{
  id: 'kanban-task-risk',
  eventType: 'kanban.task-risk-detected',
  description: 'Task risk detected by status tracker',
  enabled: true,
  condition: () => true,
  build: (event: SibyllaEvent) => {
    const payload = event.payload as { taskId: string; riskType: string; signals: string[] }
    return {
      type: 'kanban.task-risk' as const,
      priority: 'high' as const,
      source: { provider: 'kanban' },
      title: '任务风险预警',
      body: `${payload.riskType}: ${payload.signals.join(', ')}`,
      groupKey: `kanban-risk:${payload.taskId}`,
      metadata: {},
    }
  },
},
```

**对 NotificationEngine 的零修改：** 规则驱动架构，新增规则只需追加到返回数组。

#### F2：扩展 CollabContextProvider L7 任务概览段（C7）

**文件：** `sibylla-desktop/src/main/services/context-engine/collab-context-provider.ts`（修改）

**变更 1 — 构造函数新增可选依赖：**

```typescript
private readonly kanbanService?: KanbanService

constructor(
  presenceStore: PresenceStore,
  eventLogStore: EventLogStore,
  getMembers: () => Promise<WorkspaceMember[]>,
  privacyFilter: PrivacyFilter,
  kanbanService?: KanbanService, // 新增
)
```

**变更 2 — shouldInject() 新增任务关键词检测：**

```typescript
private static readonly taskKeywordPattern = /(任务|待办|进度|看板|todo|task)/i

async shouldInject(userMessage: string): Promise<boolean> {
  // 现有检测...
  if (CollabContextProvider.collabKeywordPattern.test(userMessage)) return true
  // 新增任务关键词
  if (CollabContextProvider.taskKeywordPattern.test(userMessage)) return true
  // 成员名匹配...
}
```

**变更 3 — collect() 新增任务概览段：**

在 `collect()` 方法中，构建 content 时追加任务概览：

```typescript
if (this.kanbanService) {
  try {
    const model = await this.kanbanService.parseTasksMd(workspacePath)
    const taskOverview = this.buildTaskOverview(model)
    // 裁剪优先级：任务概览 < 最近活动 < 在线成员
    // 超出预算时优先裁剪任务段
    sections.push(taskOverview)
  } catch { /* graceful degradation */ }
}
```

任务概览格式：
```
### 任务概览
- 待开始: 5, 进行中: 3, 已完成: 12
- 你负责的任务: [设计系统架构](进行中), [API 文档](待开始)
```

**裁剪策略：** `buildCollabContent()` 中的 while 循环优先裁剪任务概览段（优先级最低），再裁剪最近活动，最后才裁剪在线成员。

**验证：** kanbanService 为可选注入、任务概览注入正确、超预算时优先裁剪任务段。

---

### 阶段 G：KanbanBoard UI 组件（Step 7） — 预计 1.5 天

> **前置条件：** 安装 `@dnd-kit/core` + `@dnd-kit/sortable` 依赖

```bash
cd sibylla-desktop && pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

#### G1：kanbanStore.ts

**文件：** `sibylla-desktop/src/renderer/store/kanbanStore.ts`（新建）

State: `model / isLoading / parseError / selectedTaskId / aiSidebarOpen`

Actions: `fetchBoard / createTask / updateStatus / dispatchToAI / promoteFromLedger / selectTask / toggleAiSidebar / acceptSuggestion / dismissSuggestion`

- `fetchBoard()` 调用 `window.electronAPI.kanban.parse()`
- 初始化时注册 `onTaskCreated` / `onStatusChanged` 监听，自动刷新 model
- 订阅 `file.onNotifyChange` 监听 tasks.md 外部修改
- 使用 `devtools` 中间件

#### G2：KanbanBoard.tsx

三列布局（`DndContext` + `SortableContext`）：待开始(#F9FAFB)/进行中(#EEF2FF)/已完成(#F0FDF4)。每列：标题+计数+卡片列表。列头可折叠。parseError 时显示只读横幅。onDragEnd → `kanbanStore.updateStatus()`。

#### G3：KanbanTaskCard.tsx

可拖拽卡片：标题(单行截断) / 负责人 / 优先级色条(P0红#EF4444/P1橙#F97316/P2蓝#3B82F6) / 截止日期(逾期红) / AI图标(isAiLinked) / 闪光图标(isAiSuggested) / 失败警告 / 暂停图标。点击 → selectTask。

#### G4：KanbanTaskDetail.tsx

右侧抽屉：完整元数据 + 内联编辑 + AI执行进度条(checklist) + "派发给 AI"按钮(非ai-linked时)。

#### G5：KanbanCreateForm.tsx

弹出对话框：标题(必填)/负责人/优先级下拉/日期选择器/关联文件。提交 → kanbanStore.createTask()。

#### G6：AiTaskSidebar.tsx

右侧固定可折叠：标题"AI 工作中"+ProgressLedger 无 kanbanTaskId 活跃任务。每条：标题/状态/运行时长 + "提升为正式任务"按钮。只读。PrivacyFilter 过滤 personal/。

**验证：** 看板三列渲染正确、拖拽流畅、任务卡片信息完整、详情面板可编辑并保存、AI 侧边栏正确展示。

---

### 阶段 H：对接 task-decomposition 触发器（Step 9 部分） — 预计 0.5 天

#### H1：修改 task-decomposition 触发器

**文件：** `sibylla-desktop/src/main/services/proactive-engine/triggers/task-decomposition.ts`（修改）

将占位 `buildDraft()` 连接到 `task-extractor` Sub-agent：

```typescript
buildDraft: (snapshot: EditorSnapshot, _deps: TriggerDeps): SuggestionDraft => ({
  triggerId: 'task-decomposition',
  priority: 'normal',
  context: {
    filePath: snapshot.filePath,
    contentLength: snapshot.contentSummary.length,
    conversationSnippet: snapshot.contentSummary.recentText,
  },
  previewTitle: '检测到可能的待办任务',
})
```

SuggestionToast 的 accept action 触发 `task-extractor` Sub-agent 执行：
- Sub-agent 返回的任务建议通过 NotificationCenter 推送
- 用户点击"采纳" → 追加到 tasks.md + `<!-- ai-suggested -->`
- 用户点击"修改" → 打开内联编辑器后创建
- 用户点击"忽略" → 不再次为当前对话展示相同建议

#### H2：对接偏好学习

- 用户 dismiss → `PreferenceLearner.recordAction('task-decomposition', 'dismiss')`
- 用户 accept → `PreferenceLearner.recordAction('task-decomposition', 'accept')`
- 冷却期自适应生效（复用 TASK008 已实现的冷却机制）

**验证：** 触发器 condition 不变，buildDraft 返回包含 conversationSnippet 的上下文，Sub-agent 可被正确调度。

---

### 阶段 I：单元测试（Step 9） — 预计 1 天

#### I1：KanbanService 测试

**文件：** `sibylla-desktop/tests/main/services/kanban/kanban-service.test.ts`（新建）

| 测试用例 | 覆盖场景 |
|---------|---------|
| 标准格式解析 | 三列各含任务的 tasks.md |
| 多种缩进解析 | 2/4 空格缩进的元数据行 |
| ai-linked 标记解析 | `<!-- task-id: tsk_xxx ai-linked -->` |
| ai-suggested 标记解析 | `<!-- ai-suggested -->` |
| 空文件解析 | 返回空 KanbanModel |
| 损坏格式降级 | parseError = true |
| 创建任务 | task-id 生成 + Markdown 格式正确 |
| 更新状态 | 列间移动 + checkbox 标记 |
| 派发给 AI | ProgressLedger declare + TaskStateMachine create + ai-linked 追加 |
| AI 完成自动回写 | progress.task-completed → 自动更新 tasks.md |
| AI 失败标记 | progress.task-failed → 不回写 + UI 标记 |
| 状态映射 6 种转换 | Kanban/ProgressLedger/TaskStateMachine 全覆盖 |

#### I2：TaskStatusTracker 测试

**文件：** `sibylla-desktop/tests/main/services/kanban/task-status-tracker.test.ts`（新建）

| 测试用例 | 覆盖场景 |
|---------|---------|
| 各信号权重正确性 | fileCreated=0.3, fileGrowth=0.2 等 |
| 多信号累加 | fileCreated + fileGrowth = 0.5 |
| 置信度阈值 0.6 | 累加 ≥ 0.6 触发建议 |
| 置信度阈值 0.9 | 累加 ≥ 0.9 快速采纳 |
| dismissal 24h 冷却 | 忽略后 24h 内不重复建议 |
| 风险信号独立触发 | staleRisk → kanban.task-risk-detected |

#### I3：IPC Handler 测试

**文件：** `sibylla-desktop/tests/main/services/kanban/kanban-ipc.test.ts`（新建）

| 测试用例 | 覆盖场景 |
|---------|---------|
| 各通道正确调用 | kanban:parse → parseTasksMd 等 |
| 错误处理 | KanbanService 异常 → IPCResponse 错误包装 |

#### I4：通知规则测试

| 测试用例 | 覆盖场景 |
|---------|---------|
| kanban-status-suggestion | trigger=ai-auto 时触发 |
| kanban-task-risk | 总是触发 |

**覆盖率目标：** KanbanService ≥ 90%、TaskStatusTracker ≥ 80%、IPC handler ≥ 80%。

---

## 五、验收标准追踪

### 需求 6.1 — 任务看板与多源任务整合（23 项）

| 实现位置 | 验收要点 |
|---------|---------|
| B1 parseTasksMd() | 标准格式/ai-linked/ai-suggested/空文件/损坏格式降级 → parseError |
| B1 updateTaskStatus() | 拖拽 < 500ms 写入 + kanban.task-status-changed 事件 |
| B1 createTask() | tsk_xxx 自动生成 + 追加到目标列 |
| B1 dispatchToAI() | ProgressLedger declare + TaskStateMachine create + ai-linked 标记 |
| B1 promoteFromLedger() | tasks.md 追加 + kanbanTaskId 绑定 |
| B1 事件订阅 | progress.task-completed → 自动回写；progress.task-failed → 不回写 + 警告 |
| G2 KanbanBoard | 三列渲染 < 300ms、parseError 只读横幅 |
| G3 KanbanTaskCard | 标题/负责人/优先级色条/截止日期/AI图标/失败警告/暂停图标 |
| G4 KanbanTaskDetail | 元数据内联编辑 + AI checklist 进度 + "派发给 AI"按钮 |
| G6 AiTaskSidebar | 无 kanbanTaskId 的活跃任务 + "提升为正式任务" |
| G1 kanbanStore | file.onNotifyChange 2s 重新加载 + 外部变更冲突提示 |

### 需求 6.2 — AI 辅助任务创建（8 项）

| 实现位置 | 验收要点 |
|---------|---------|
| D1 task-extractor.md | YAML frontmatter + 输出 JSON 数组 + sourceQuote 反幻觉 |
| D1 SubAgentRegistry | 自动发现，无需代码注册 |
| H1 task-decomposition | buildDraft() 连接 task-extractor + 采纳/修改/忽略交互 |
| H2 偏好学习 | accept/dismiss → PreferenceLearner + 冷却期自适应 |

### 需求 6.3 — AI 任务状态自动追踪（10 项）

| 实现位置 | 验收要点 |
|---------|---------|
| C1 TaskStatusTracker | 5 个信号检测器权重正确（0.2/0.3/0.4/0.5） |
| C1 evaluate() | 置信度 ≥ 0.6 触发建议、≥ 0.9 快速采纳 |
| C1 dismissal | 24h 冷却、忽略后不重复 |
| C1 事件订阅 | file.updated 匹配 relatedFiles → evaluate() |
| F1 通知规则 | kanban-status-suggestion(trigger=ai-auto) + kanban-task-risk(总是) |

### L7 上下文扩展（4 项）

| 实现位置 | 验收要点 |
|---------|---------|
| F2 shouldInject() | 任务关键词(任务/待办/进度/看板)触发 |
| F2 collect() | 任务概览段注入 + 裁剪优先级(概览<活动<成员) |
| F2 构造函数 | kanbanService 可选，不破坏现有调用 |

### 性能要求

| 指标 | 目标 | 实现方式 |
|------|------|---------|
| 看板首次渲染 | < 300ms (< 100 任务) | KanbanModel 内存缓存 + React.memo |
| 拖拽响应 | < 500ms | FileManager 原子写入 + async |
| 启发式评估 | < 100ms | 纯函数信号计算 |
| task-extractor | < 5s | 后台异步 Sub-agent |

---

## 六、风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| tasks.md 格式多样导致解析失败 | 高 | 兼容多种缩进，失败降级只读 + 提示 |
| @dnd-kit 与 React 版本冲突 | 中 | 检查兼容性，备选 HTML5 DnD polyfill |
| 三套状态映射逻辑复杂易出错 | 高 | 映射集中 KanbanService，严格测试 6 种转换 |
| TaskStatusTracker 误报骚扰 | 中 | 阈值 0.6 起 + dismissal 24h 冷却 |
| L7 任务概览超 Token 预算 | 低 | 裁剪优先级：概览 < 活动 < 成员 |
| declare() 未传递 kanbanTaskId | 中 | 验证展开逻辑，必要时手动赋值 |
| 外部编辑器并发写入冲突 | 高 | updateTaskStatus 重新读取 + 原子写入 |
| CollabContextProvider 签名变更 | 低 | kanbanService 可选末尾参数 |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 |
|----|------|--------|
| Day 1 上午 | A1-A3 | types.ts 扩展 + 事件类型 + kanban types |
| Day 1 下午 | B1 | KanbanService parseTasksMd() + updateTaskStatus() |
| Day 2 上午 | B1 续 | KanbanService createTask() + dispatchToAI() + promoteFromLedger() + 事件订阅 |
| Day 2 下午 | C1 | TaskStatusTracker 完整实现 |
| Day 3 上午 | D1 | task-extractor prompt + Sub-agent 验证 |
| Day 3 下午 | E1-E3 | IPC Handlers + shared/types + preload 扩展 |
| Day 4 上午 | F1-F2 | 通知规则扩展 + CollabContextProvider L7 扩展 |
| Day 4 下午 | G1-G3 | kanbanStore + KanbanBoard + KanbanTaskCard |
| Day 5 上午 | G4-G6 | KanbanTaskDetail + KanbanCreateForm + AiTaskSidebar |
| Day 5 下午 | H1-H2 | task-decomposition 触发器对接 + 偏好学习 |
| Day 6 上午 | I1-I2 | KanbanService 单元测试 + TaskStatusTracker 单元测试 |
| Day 6 下午 | I3-I4 | IPC 测试 + 通知规则测试 + 全量验证修复 |

---

## 八、涉及文件变更汇总

### 新建文件（14 个）

| 文件路径 | 说明 |
|---------|------|
| `src/main/services/kanban/types.ts` | Kanban 类型定义 |
| `src/main/services/kanban/kanban-service.ts` | 核心看板服务 |
| `src/main/services/kanban/task-status-tracker.ts` | 启发式状态追踪 |
| `resources/prompts/agents/task-extractor.md` | 任务提取 Sub-agent prompt |
| `src/main/ipc/handlers/kanban.ts` | IPC handlers |
| `src/renderer/store/kanbanStore.ts` | Zustand store |
| `src/renderer/components/kanban/KanbanBoard.tsx` | 三列拖拽看板 |
| `src/renderer/components/kanban/KanbanTaskCard.tsx` | 任务卡片 |
| `src/renderer/components/kanban/KanbanTaskDetail.tsx` | 任务详情面板 |
| `src/renderer/components/kanban/KanbanCreateForm.tsx` | 任务创建表单 |
| `src/renderer/components/kanban/AiTaskSidebar.tsx` | AI 侧边栏 |
| `tests/main/services/kanban/kanban-service.test.ts` | KanbanService 测试 |
| `tests/main/services/kanban/task-status-tracker.test.ts` | TaskStatusTracker 测试 |
| `tests/main/services/kanban/kanban-ipc.test.ts` | IPC handler 测试 |

### 修改文件（7 个）

| 文件路径 | 变更内容 |
|---------|---------|
| `src/main/services/progress/types.ts` | TaskRecord/DeclareInput 新增 `kanbanTaskId?` |
| `src/main/services/event-bus-types.ts` | 新增 5 个 kanban.* 事件类型 + payload |
| `src/main/services/notifications/notification-rules.ts` | 新增 2 条看板通知规则 |
| `src/main/services/context-engine/collab-context-provider.ts` | collect() 新增任务概览段 + 构造函数新增可选 kanbanService |
| `src/main/services/proactive-engine/triggers/task-decomposition.ts` | buildDraft() 连接 task-extractor |
| `src/shared/types.ts` | IPC_CHANNELS 新增 kanban:* 常量 + IPCChannelMap |
| `src/preload/index.ts` | 新增 kanban 命名空间 + ALLOWED_CHANNELS |

### 不修改的文件

| 文件路径 | 原因 |
|---------|------|
| `src/main/services/progress/progress-ledger.ts` | declare() 自动传递新增可选字段 |
| `src/main/services/harness/task-state-machine.ts` | 接口不变 |
| `src/main/services/event-bus.ts` | 仅新增事件类型，不改发射逻辑 |
| `src/main/services/sub-agent/SubAgentRegistry.ts` | 自动发现机制已支持 |
| `src/main/services/notifications/notification-engine.ts` | 规则驱动，无需改引擎 |

### 新增依赖

| 依赖 | 版本 | 说明 |
|------|------|------|
| `@dnd-kit/core` | ^6.x | 拖拽核心库 |
| `@dnd-kit/sortable` | ^8.x | 排序拖拽 |
| `@dnd-kit/utilities` | ^3.x | 工具函数 |

---

**文档版本**: v1.0
**最后更新**: 2026-05-01
**维护者**: Sibylla 架构团队
