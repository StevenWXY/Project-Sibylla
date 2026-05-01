# Phase 2 Sprint 6 - 项目管理闭环需求

## 一、概述

### 1.1 目标与价值

将 Sibylla 从"个人 AI 助手"升级为"团队虚拟项目经理",通过统一的任务看板、决策日志、工作产出分析、AI 日报和管理员 Dashboard,让 AI 深度参与项目管理的全生命周期。本 Sprint 是**团队版的核心卖点**——所有团队功能在此 Sprint 完成闭环。

### 1.2 范围与边界

**本 Sprint 做什么:**

- 任务看板 UI 与多源任务系统的整合(tasks.md / TaskStateMachine / ProgressLedger / PlanManager)
- AI 辅助任务创建与状态自动追踪
- 结构化决策日志系统
- AI 日报/周报(个人 + 团队)
- 工作产出分析引擎
- 管理员 Dashboard
- AI 项目管理建议(扩展 ProactiveEngine 触发器)

**本 Sprint 明确不做(已在前序 Sprint 完成):**

| 不做项 | 已完成于 | 备注 |
|---|---|---|
| 记忆归档机制 | Sprint 3.2 §3.2.5 MemoryCompressor 三阶段 | 复用现有 ARCHIVE.md + 24h 快照 |
| 记忆压缩与预冲洗 | Sprint 3.2 + Sprint 3.5 §4.7 Reactive Compact | 5 层 compact 链已覆盖 |
| 记忆自愈优化 | Sprint 3.2 重复检测 + LLM 合并 + 索引重建 | 余弦相似度 > 0.85 已实现 |
| 记忆可视化 Dashboard | Sprint 3.2 §3.2.7 MemoryPanel | Token 进度、健康指标已存在 |
| 知识图谱基础渲染 | Sprint 4 §4.7 文档关系图谱 | 节点/边/聚焦/过滤已具备 |
| 个人空间隔离硬性拦截 | CLAUDE.md 第七章 + Sprint 3.1 PersonalSpaceGuard | 仅做回归验证 + Admin 警告 UI |

### 1.3 涉及模块

- 模块10:AI 项目管理(完整版)
- 模块12:权限与访问控制(回归验证)
- 模块5:UI 工作区(Kanban 面板、Admin Dashboard、决策日志面板)
- 模块7:Sub-agent(新增 task-extractor、decision-curator、team-report-curator)
- 模块8:Workflow / Skill(新增 daily-personal-report、weekly-team-report 模板)
- 模块11:主动建议(扩展 ProactiveEngine 三个新触发器)

### 1.4 与前序 Sprint 的依赖关系

```
Sprint 1  ─▶ Markdown 编辑器、个人空间隔离基线
Sprint 2  ─▶ Workspace 成员管理(Admin/Editor/Viewer)
Sprint 3.1 ─▶ TaskStateMachine、PersonalSpaceGuard
Sprint 3.2 ─▶ MEMORY.md v2(technical_decision section)
Sprint 3.3 ─▶ ProgressLedger、Trace Store ──┐
Sprint 3.4 ─▶ PlanManager                    ├─▶ 本 Sprint 6 整合
Sprint 3.5 ─▶ Workflow / Skill / Sub-agent ──┤
Sprint 4   ─▶ 事件总线、双向链接、知识图谱 ──┤
Sprint 5   ─▶ ProactiveEngine、NotificationCenter、Presence ──┘
```

本 Sprint 不引入新的底层基础设施,所有功能均建立在前序 Sprint 之上。

### 1.5 里程碑定义

**完成标志:**

- 任务看板可双向同步 tasks.md
- AI 能从对话中识别可执行任务并辅助创建
- AI 能根据文件变更建议任务状态更新
- 决策日志可结构化记录并自动提取至 MEMORY.md
- AI 日报/周报通过 Workflow 自动触发
- 管理员可通过 Dashboard 查看团队状态
- AI 能主动推送项目风险与工作量预警
- 跨 personal/ 访问被正确拦截且 Admin 访问有警告 UI

---

## 二、关键架构决策

### 2.1 任务系统四件套的层次关系

本 Sprint 最大的架构挑战是**避免引入"第五套任务概念"**。以下规则必须严格遵守。

**用户视角(只看到三个表面):**

- **Kanban 看板**:本 Sprint 新增 UI,渲染源是 `tasks.md`(用户主导)+ ProgressLedger 的活跃任务(AI 主导,只读侧边栏)
- **progress.md**:Sprint 3.3 已交付,只读投影,记录 AI 在做什么
- **Plans 文件**:Sprint 3.4 已交付,Plan 模式产物

**机器视角(底层持久化):**

- **tasks.md**:用户可编辑的项目任务清单,**本 Sprint 的主战场**
- **TaskStateMachine**(`.sibylla/agents/{taskId}/state.json`):底层任务状态持久化,Sprint 3.1 已实现
- **ProgressLedger**(内存模型 + progress.md 投影):AI 自声明任务台账,Sprint 3.3 已实现
- **PlanManager**(`.sibylla/plans/plan-*.md`):Plan 模式产物,Sprint 3.4 已实现

**桥接关系(必须遵循):**

```
tasks.md 任务 (用户主导)
   │
   ├─ 用户在 Kanban 拖拽 ─▶ KanbanService 改写 tasks.md
   │
   └─ 用户点"派发给 AI 执行"
        ▼
   ProgressLedger.declare()  ──▶  TaskStateMachine.create()
                                       │
                                       ▼
                                  AI 实际执行
                                       │
                                       ▼
                              progress.md / tasks.md 状态自动回写

PlanManager 任务 (Plan 模式)
   │
   └─ 用户 approve plan ─▶ TaskStateMachine.create() (Sprint 3.4 已实现)
                                       │
                                       ▼
                              可选回写 tasks.md (本 Sprint 新增能力)
```

**核心规则:**

1. **tasks.md 是用户层的唯一真相源**(Source of Truth for user-managed tasks)
2. ProgressLedger 任务可"提升"为 tasks.md 任务(显式提升,不自动)
3. tasks.md 任务可"派发"为 ProgressLedger/TaskStateMachine 任务(显式派发,不自动)
4. 两者通过任务 ID 关联(tasks.md 任务带 `<!-- task-id: xxx -->` 注释,Kanban 解析后建立映射)
5. 本 Sprint **不创建新的任务存储介质**,KanbanService 仅是 tasks.md 的解析器/写入器

**三套状态模型映射表(C3 调整):**

本 Sprint 涉及三套独立的状态系统,以下映射表定义它们之间的转换规则,KanbanService 在 "派发" 和 "完成回写" 时必须严格遵守:

| Kanban (tasks.md) | ProgressLedger | TaskStateMachine | 触发条件 |
|---|---|---|---|
| 待开始 | — | — | 初始状态,用户创建或 AI 建议采纳 |
| 进行中 | `running` | `executing` | 用户手动拖拽,或 AI 派发后 ProgressLedger 进入 running |
| 进行中 | `queued` | `planning` | AI 已派发但尚未开始执行(显示为 "AI 已认领") |
| 进行中 | `paused` | `awaiting_confirmation` | AI 等待用户确认,UI 显示暂停图标 |
| 已完成 | `completed` | `completed` | 用户手动确认,或 `ai-linked` 任务自动回写 |
| — | `failed` | `failed` | AI 执行失败,UI 显示失败标记,不自动回写 tasks.md(需用户处理) |

转换规则:
- **派发时:** Kanban "进行中" → ProgressLedger `queued`(不直接 `running`,等待 AI 实际启动)
- **AI 启动:** ProgressLedger `queued` → `running`,Kanban 保持 "进行中"
- **AI 完成(自动):** `ai-linked` 任务的 ProgressLedger `completed` → Kanban 自动更新为 "已完成"
- **AI 完成(手动):** 非 `ai-linked` 任务的用户需手动确认拖拽
- **AI 失败:** ProgressLedger `failed` → Kanban 保持 "进行中" 但 UI 显示失败警告

### 2.2 决策日志与 MEMORY.md 的分层

```
.sibylla/memory/decisions/{YYYY-MM-DD}-{slug}.md
   │  完整结构化记录(问题、选项、对比、选择、理由、结果)
   │  人类可读 + Markdown frontmatter
   ▼
DecisionProjectionProcessor (本 Sprint 新增,C4 调整)
   │  实现 ExtractionPostProcessor 接口
   │  在 CheckpointScheduler.run() 的后处理扩展点中调用
   │  扫描 .sibylla/memory/decisions/ 目录,解析新增/更新的决策日志
   ▼
MEMORY.md technical_decision section
   │  精炼摘要 + confidence + 反向链接到决策日志
   ▼
MemoryIndexer (sqlite-vec + FTS5)
   │  支持检索
   ▼
ContextEngine 在 AI 对话中召回
```

> **C4 调整说明:** 原文引用 "MemoryExtractor 提取" 是不准确的——`MemoryExtractor.extract()` 的输入是 `LogEntry[]`(对话交互日志),不会扫描文件系统。决策日志的投影改由新增的 `DecisionProjectionProcessor` 实现,该 processor 实现 Sprint 3.2 已预留的 `ExtractionPostProcessor` 接口,在 `CheckpointScheduler` 的后处理阶段执行,不修改 `MemoryExtractor` 本身。
   ▼
MEMORY.md technical_decision section
   │  精炼摘要 + confidence + 反向链接到决策日志
   ▼
MemoryIndexer (sqlite-vec + FTS5)
   │  支持检索
   ▼
ContextEngine 在 AI 对话中召回
```

**核心规则:**

1. 决策日志是**源**,MEMORY.md 是**投影**——MEMORY.md 中的 `technical_decision` 条目必须带反向链接
2. 修改决策结果时,改源文件(决策日志),由 MemoryExtractor 重新投影
3. 决策日志走 `personal/` 还是 `docs/decisions/` 由用户在创建时选择(默认根据当前对话上下文判断)

### 2.3 工作产出分析的数据源

**严格限制:不新建数据库**。所有指标从已有数据源聚合。

| 维度 | 数据源 | 计算方式 |
|---|---|---|
| 任务完成率 | `tasks.md` 解析结果 | `已完成 / (已完成 + 进行中 + 待开始)`,按负责人分组 |
| 文档贡献度 | GitAbstraction.getHistory() | 按作者统计 commits 数、文件变更行数,按文件类型加权 |
| 协作响应速度 | Sprint 5 NotificationCenter + 评论事件流 | 评论被回复的 P50/P90 时延 |
| 知识贡献度 | Sprint 4 双向链接索引 | 谁的文档被引用次数最多 |
| AI 协作活跃度 | Sprint 3.3 Trace Store | 按用户统计 `ai.turn` Span 数(可选,P2) |

聚合查询通过 `ProductivityAnalyzer` 服务实现,带 60 秒结果缓存。

### 2.4 IPC / 事件 / Sub-agent / Workflow 命名空间

**新增 IPC 通道:**

```
tasks:list / tasks:create / tasks:update / tasks:delete / tasks:dispatch
kanban:render / kanban:reorder
decisions:list / decisions:create / decisions:update / decisions:detect
report:generate / report:list / report:get
productivity:query / productivity:aggregate
dashboard:overview
```

**新增 SibyllaEventType(扩展 Sprint 4 事件总线):**

> **命名约定(C2 调整):** 现有 `task.created`/`task.completed` 属于 TaskStateMachine 级别(payload 为 `{taskId: string}`),本 Sprint 新增的看板层事件使用 `kanban.*` 前缀以避免语义混淆。两者可同时存在、互不干扰。

```
kanban.task-created / kanban.task-status-changed / kanban.task-completed / kanban.task-dispatched
decision.recorded / decision.outcome-updated
report.generated
admin.access-personal-space      // Admin 访问他人 personal/ 时触发
```

**新增 Sub-agent prompt 文件(位于 `resources/prompts/agents/`):**

- `task-extractor.md`:从对话中提取可执行任务
- `decision-curator.md`:从对话中识别并结构化决策讨论
- `team-report-curator.md`:聚合多源数据生成团队周报

**新增 Workflow 模板(位于 `resources/workflows/`):**

- `daily-personal-report.yaml`:每日 18:00 触发,调用 `daily-report` skill
- `weekly-team-report.yaml`:每周日 17:00 触发,Admin 角色专属

**复用 Sprint 3.5 Skill:**

- `daily-report`(Sprint 3.5 §4.2.4 已列为内置 Skill,本 Sprint 实装其 prompt)

**扩展 Sprint 5 ProactiveEngine 触发器:**

- `risk-task-delay`
- `workload-imbalance`
- `decision-contradiction`

---

## 三、功能需求

### 需求 6.1 - 任务看板与多源任务整合

**用户故事:** 作为用户,我想要在看板中管理任务并选择性派发给 AI 执行,以便统一管理"自己做的"和"AI 做的"事情。

#### 验收标准

1. When workspace is opened, the system shall parse `tasks.md` and render kanban with three columns (待开始/进行中/已完成)
2. When user drags task to different column, the system shall update task status in `tasks.md` within 500ms
3. When user clicks task, the system shall show detail panel with metadata (assignee, priority, deadline, related files)
4. When user creates task in kanban, the system shall append to `tasks.md` with auto-generated `task-id` HTML comment
5. When `tasks.md` is modified externally, the system shall reload board within 2 seconds
6. When user clicks "派发给 AI" on a task, the system shall create corresponding ProgressLedger task and start execution
7. When ProgressLedger reports active task without matching `tasks.md` entry, the system shall show it in a separate "AI 工作中" sidebar (read-only)
8. When user clicks "提升为正式任务" on AI sidebar entry, the system shall append to `tasks.md` and link by `task-id`
9. When ProgressLedger task completes, the system shall auto-update linked `tasks.md` task status to "已完成"
10. When task has `task-id` HTML comment, kanban shall display a small AI icon to indicate it is linked to AI execution

#### tasks.md 规范格式

沿用初始 Sprint 6 §2.1 的格式,扩展 `task-id` 关联:

```markdown
# 任务清单

## 待开始

- [ ] 完成 PRD 初稿 <!-- task-id: tsk_a1b2c3 -->
  - 负责人: Alice
  - 优先级: P0
  - 截止日期: 2026-05-15
  - 关联文件: docs/product/prd.md

## 进行中

- [ ] 设计系统架构 <!-- task-id: tsk_d4e5f6 ai-linked -->
  - 负责人: Bob (AI 协助)
  - 优先级: P0
  - 截止日期: 2026-05-20

## 已完成

- [x] 项目启动会议 <!-- task-id: tsk_g7h8i9 -->
  - 负责人: Alice
  - 完成时间: 2026-04-25
```

#### 技术规格

```typescript
// src/main/services/kanban-service.ts
export class KanbanService {
  constructor(
    private fileSystem: FileSystemService,
    private progressLedger: ProgressLedger,        // Sprint 3.3
    private taskStateMachine: TaskStateMachine,    // Sprint 3.1
    private eventBus: EventBus                      // Sprint 4
  ) {}

  async parseTasksMd(workspacePath: string): Promise<KanbanModel> { /* ... */ }
  async updateTaskStatus(taskId: string, newStatus: TaskStatus): Promise<void> { /* ... */ }
  async dispatchToAI(taskId: string): Promise<string> {
    // 1. 在 ProgressLedger 创建对应任务,传入 kanbanTaskId 建立双向绑定
    //    (C9 调整: TaskRecord 新增可选 kanbanTaskId 字段)
    // 2. 启动 TaskStateMachine
    // 3. 在 tasks.md 中追加 ai-linked 标记
    // 4. 触发 SibyllaEventType.kanban.task-dispatched
  }
  async promoteFromLedger(ledgerTaskId: string): Promise<string> { /* ... */ }
}
```

> **C9 调整:** 为支持 tasks.md 与 ProgressLedger 的双向绑定,需在 `TaskRecord`(`src/main/services/progress/types.ts`)中新增可选字段 `kanbanTaskId?: string`。`ProgressLedger.declare()` 的 `DeclareInput` 同步新增此字段。这是对 Sprint 3.3 类型的最小扩展,不影响现有 ProgressLedger 的其他调用方。

#### 优先级

P0 - 必须完成

---

### 需求 6.2 - AI 辅助任务创建

**用户故事:** 作为用户,我希望 AI 能识别对话中的可执行项并自动建议创建任务,以便不遗漏行动项。

#### 验收标准

1. When user discusses work in AI chat, the system shall trigger `task-extractor` Sub-agent every N turns (default 5) to detect actionable items
2. When actionable items are detected, the system shall show task preview with structured fields (title, suggested assignee, priority, deadline)
3. When user clicks "采纳", the system shall append tasks to `tasks.md` and assign `task-id`
4. When user clicks "修改", the system shall open inline editor before creating
5. When user clicks "忽略", the system shall not show the same suggestion again for current conversation
6. When tasks are created from AI suggestion, the system shall add `<!-- ai-suggested -->` comment for traceability
7. When ProactiveEngine `task-decomposition` trigger fires (Sprint 5 placeholder), the system shall route to this Sub-agent

#### Sub-agent 设计

`task-extractor` 提示词核心要求:

- 输入:最近 N 轮对话 + 当前 `tasks.md` 内容(去重)
- 输出:JSON 数组,每项包含 `title`、`assignee`、`priority`、`deadline`、`relatedFiles`、`reason`
- 约束:仅提取**明确表述的行动项**,不臆测;若对话中无可执行项,返回空数组
- 反幻觉:每个建议必须能引用具体对话片段作为来源

#### 与 Sprint 5 ProactiveEngine 的衔接

Sprint 5 §需求 5.5 已注册 `task-decomposition` 触发器作为占位。本 Sprint 完成后,该触发器的 `handler` 才真正可用——它会调用 `task-extractor` Sub-agent 并通过 NotificationCenter 推送建议。Sprint 5 已有的偏好学习、冷却、聚合机制全部复用。

#### 优先级

P0 - 必须完成

---

### 需求 6.3 - AI 任务状态自动追踪

**用户故事:** 作为用户,我希望 AI 能根据文件变更和对话进展自动建议更新任务状态,以便不必手动维护状态。

#### 验收标准

1. When file referenced by task's `关联文件` field is modified, the system shall trigger status review for that task
2. When AI detects substantial progress signals (new commits, file growth, related discussions), the system shall suggest changing status to "进行中" if currently "待开始"
3. When AI detects completion signals (file marked done, milestone commit, explicit "完成"/"done"), the system shall suggest changing to "已完成"
4. When suggestion is shown, the system shall display reasoning chain (which file changed, what signal detected)
5. When user confirms, the system shall update `tasks.md` automatically
6. When user dismisses, the system shall record dismissal and avoid same suggestion for 24 hours
7. When task is `ai-linked` and ProgressLedger reports completion, the system shall auto-update without confirmation (already user-approved at dispatch time)

#### 触发机制

复用 Sprint 4 事件总线的 `file.updated` 事件,无需新建 watcher:

```
SibyllaEventType.file.updated
   │
   ▼
TaskStatusTracker (本 Sprint 新增)
   │  匹配文件路径与 tasks.md 中的 "关联文件"
   ▼
若命中 ─▶ 启发式分析(commit 消息、内容增量、关键词)
   │
   ▼
若达到置信度阈值 ─▶ NotificationCenter 推送建议
```

#### 启发式信号

| 信号 | 权重 | 推断状态 |
|---|---|---|
| 文件首次创建 | +0.3 | 待开始 → 进行中 |
| 文件内容增量 > 200 字 | +0.2 | 进行中 |
| commit 消息包含"完成/done/finish/closed" | +0.5 | 进行中 → 已完成 |
| 文件被标记为 frozen/published | +0.4 | 已完成 |
| 关联文件 24h 内无变更 + deadline 临近 | +0.3 | 风险预警(走 Sprint 6.8) |

置信度 ≥ 0.6 触发建议;≥ 0.9 才允许"快速采纳"按钮。

#### 优先级

P0 - 必须完成

---

### 需求 6.4 - 决策日志系统

**用户故事:** 作为团队成员,我希望系统记录重要决策的完整背景,以便未来回顾决策理由和实际结果。

#### 验收标准

1. When AI detects decision discussion in chat (multiple options, pros/cons analysis, final choice), the system shall suggest creating decision log via `decision-curator` Sub-agent
2. When user confirms, the system shall create structured decision log file in `.sibylla/memory/decisions/{YYYY-MM-DD}-{slug}.md`
3. When decision log is created, the system shall queue it for next checkpoint cycle, where `DecisionProjectionProcessor` (implements `ExtractionPostProcessor`) extracts summary into MEMORY.md `technical_decision` section with back-link
4. When decision result becomes available, the user shall be able to update `actual_result` field via UI or chat command
5. When `actual_result` is updated, the system shall re-trigger `DecisionProjectionProcessor` at next checkpoint to update MEMORY.md projection
6. When decision log is queried via UnifiedSearch, the system shall return with relevance score
7. When two decision logs contain contradictory `chosen` for same `problem` (semantic similarity > 0.85), the system shall flag via Sprint 6.8 `decision-contradiction` trigger
8. When user creates decision log manually (without AI detection), the system shall provide template form

#### 决策日志格式

```markdown
---
id: dec_2026_05_03_database_choice
title: 选择主数据库
status: decided | in-progress | reverted
decided_at: 2026-05-03
decided_by: [Alice, Bob]
tags: [database, infrastructure, "#phase-2"]
related_files: [docs/architecture/storage.md]
---

# 选择主数据库

## 问题
...

## 选项

### 方案 A: PostgreSQL
- 优势: ...
- 劣势: ...
- 风险: ...

### 方案 B: MySQL
- 优势: ...
- 劣势: ...

## 决策
**选择: 方案 A**

## 理由
...

## 实际结果
<!-- 上线后回填 -->
```

#### 与 MEMORY.md 的分层

决策日志是**完整记录**(可能数百行),MEMORY.md 中存的是**精炼摘要**(约 50-100 字)+ 反向链接。`DecisionProjectionProcessor`(本 Sprint 新增,实现 `ExtractionPostProcessor` 接口)在 CheckpointScheduler 后处理阶段执行时:

- 扫描 `.sibylla/memory/decisions/` 目录,识别自上次 checkpoint 以来新增/更新的决策日志(基于 mtime)
- 解析 frontmatter + Markdown 结构,提取 `title`、`chosen`、`reason` 摘要,生成 `technical_decision` section 的 `ExtractionCandidate`
- 在条目元数据中记录 `source: .sibylla/memory/decisions/{filename}`
- 当源文件更新(mtime 变化),下次 checkpoint 自动重新投影

#### 优先级

P0 - 必须完成

---

### 需求 6.5 - AI 日报/周报(个人 + 团队)

**用户故事:** 作为用户/管理员,我希望系统自动生成日报和周报,以便节省撰写时间并获得 AI 视角的产出洞察。

#### 验收标准

1. When daily report time arrives (default 18:00 local), the system shall auto-generate personal report via `daily-personal-report` Workflow
2. When personal report is generated, it shall include: 工作摘要、任务进展、提交记录、明日计划、阻塞项
3. When user is admin and weekly time arrives (default Sunday 17:00), the system shall additionally generate team weekly report via `weekly-team-report` Workflow
4. When team report is generated, it shall include: 整体进度、风险任务高亮、工作产出概览(匿名化非自己数据)、下周优先级建议
5. When report is generated, the system shall save to:
   - 个人日报:`personal/{userName}/reports/daily/{YYYY-MM-DD}.md`
   - 团队周报:`docs/reports/weekly/{YYYY-WW}.md`
6. When user opens report file, the system shall show formatted markdown view with charts (任务完成柱状图、提交活跃度折线)
7. When report generation fails (Workflow execution error), the system shall log error and notify user via NotificationCenter
8. When user manually triggers report via command palette, the system shall run Workflow immediately
9. When team report references individual data, the system shall apply Sprint 5 PrivacyFilter for non-self members

#### 实现路径

完全走 Sprint 3.5 Workflow 框架,**不新建生成器**。

> **C5/C8 调整说明:** 现有 Workflow 系统的 step 格式使用 `skill:` / `sub_agent:` / `action:` 字段(参见 `resources/workflows/daily-summary-flow.yaml`),不支持 `type: tool` + `tool:` 组合。下方 YAML 已调整为与现有格式一致。同时,现有 `daily-summary-flow.yaml`(晨间 9:00 轻量 diff 回顾)与本 Workflow(傍晚 18:00 多源聚合报告)分工不同,两者共存。

```yaml
# resources/workflows/daily-personal-report.yaml
id: daily-personal-report
version: 1.0.0
name: 每日个人工作日报
description: 傍晚自动生成包含任务进展、提交记录、明日计划的结构化日报
scope: personal

triggers:
  - type: schedule
    cron: "0 18 * * *"
  - type: manual
    name: 手动生成今日日报

params:
  - name: date
    type: string
    required: false
    description: "日报日期,默认为今日"

steps:
  - id: collect-data
    name: 收集工作数据
    sub_agent: doc-summarizer
    input:
      task: "收集今日个人工作数据(任务变更、文件修改、AI 对话摘要)"
      source: "daily-personal"
    on_failure: stop

  - id: generate
    name: 生成日报
    skill: daily-report
    input:
      data: ${{ steps.collect-data.output }}

  - id: save
    name: 保存日报并通知
    action: internal_notification
    input:
      title: "今日日报已生成"
      body: ${{ steps.generate.output.summary }}
      channel: personal
    requires_user_confirm: false

on_workflow_failure:
  notify_user: true
  rollback: false
```

```yaml
# resources/workflows/weekly-team-report.yaml
id: weekly-team-report
version: 1.0.0
name: 每周团队工作周报
description: 每周日为管理员自动生成团队工作周报
scope: admin

triggers:
  - type: schedule
    cron: "0 17 * * 0"
  - type: manual
    name: 手动生成本周周报

steps:
  - id: collect-team-data
    name: 收集团队数据
    sub_agent: team-report-curator
    input:
      task: "收集本周全体成员的工作数据(任务进展、文档贡献、协作活跃度)"
      source: "weekly-team"
    on_failure: stop

  - id: generate-team-report
    name: 生成团队周报
    skill: daily-report
    input:
      data: ${{ steps.collect-team-data.output }}
      mode: "weekly-team"

  - id: save-team-report
    name: 保存周报并通知管理员
    action: internal_notification
    input:
      title: "本周团队周报已生成"
      body: ${{ steps.generate-team-report.output.summary }}
      channel: admin
    requires_user_confirm: false

on_workflow_failure:
  notify_user: true
  rollback: false
```

`daily-report` Skill 的 prompt 文件位于 `resources/skills/daily-report/_index.md`(已存在),接受结构化数据,输出 markdown 报告。

#### 团队报告的隐私处理

非 Admin 看自己的报告:全部细节
非 Admin 看团队周报:看到匿名化的"团队 X 人完成 Y 任务",不看到具体成员细节
Admin 看团队周报:全部细节,但仍受 personal/ 隔离(只看到 docs/ 与 tasks.md 中的可见内容)

通过 `team-report-curator` Sub-agent 在生成时应用过滤规则,而非渲染时。

#### 优先级

P0 - 必须完成

---

### 需求 6.6 - 工作产出分析引擎

**用户故事:** 作为管理员,我想要了解团队成员的工作产出分布,以便合理分配资源。

#### 验收标准

1. When analysis is triggered (manual or scheduled), the system shall calculate four-dimension metrics for each member: 任务完成率、文档贡献度、协作响应速度、知识贡献度
2. When analysis runs, the system shall reuse existing data sources without creating new database (per §2.3)
3. When analysis completes, the system shall cache results for 60 seconds to avoid recomputation
4. When member views own analysis, the system shall show full details
5. When other members view analysis, the system shall show anonymized team aggregates only (受 Sprint 5 PrivacyFilter)
6. When admin views analysis, the system shall show all members' details with explicit "管理员视图" indicator
7. When analysis result is rendered, charts shall be generated client-side (no external chart service)
8. When data is insufficient (< 7 days of history), the system shall show informational notice instead of misleading metrics

#### 分析维度详情

沿用初始 Sprint 7 §2.2 的四维度,数据源严格按 §2.3 规定:

| 维度 | 计算公式(简化) |
|---|---|
| 任务完成率 | `已完成任务数 / 总分配任务数`,加权:P0 任务权重 3,P1 权重 2,P2 权重 1 |
| 文档贡献度 | `Σ(commits 中文件类型权重 × 行变更数)`,docs/ 权重 1.5,personal/ 权重 0.5 |
| 协作响应速度 | 评论被回复的中位时延的倒数,归一化到 [0, 1] |
| 知识贡献度 | `Σ(自己创建的文档被他人引用次数)`,基于 Sprint 4 双向链接索引 |

每个维度归一化到 [0, 1],综合分 = 加权平均(默认权重各 0.25,Admin 可调)。

#### 服务接口

```typescript
// src/main/services/productivity-analyzer.ts
export class ProductivityAnalyzer {
  async analyze(opts: {
    period: 'week' | 'month' | 'quarter'
    memberId?: string                    // undefined = 全体
    viewerId: string                     // 用于隐私过滤
  }): Promise<ProductivityReport> {
    // 1. 检查缓存
    // 2. 并行从 Trace / Git / tasks.md / 双向链接索引 拉数据
    // 3. 应用 PrivacyFilter
    // 4. 计算指标 + 归一化
    // 5. 缓存结果 60 秒
  }
}
```

#### 优先级

P1 - 应该完成

---

### 需求 6.7 - 管理员 Dashboard

**用户故事:** 作为管理员,我想要一个全局视图掌握团队状态、任务进度、风险与活跃度。

#### 验收标准

1. When admin opens Dashboard, the system shall show team overview within 1 second (使用缓存)
2. When Dashboard loads, the system shall display: 任务进度图(柱状/饼图)、成员活跃度(基于 Sprint 5 Presence)、近 7 天提交热力图、风险任务列表、待处理 AI 建议数量
3. When risk is detected (delayed task, workload imbalance, contradiction), the system shall show warning indicator with badge count
4. When admin clicks risk indicator, the system shall navigate to corresponding detail view
5. When non-admin user opens Dashboard, the system shall show "权限不足" with link to personal report instead
6. When workspace has < 2 members, the system shall hide team-specific widgets and show single-user simplified view
7. When Dashboard is open, the system shall refresh data every 30 seconds without full page reload

#### 数据组合

Dashboard 不引入新数据源,完全聚合现有服务:

```
管理员 Dashboard
   │
   ├─▶ ProductivityAnalyzer (需求 6.6)
   ├─▶ KanbanService (需求 6.1) - 任务统计
   ├─▶ Sprint 5 PresenceService - 在线成员
   ├─▶ Sprint 5 NotificationCenter - 待处理建议数
   ├─▶ Sprint 3.3 Trace Store - 性能与活跃指标
   └─▶ GitAbstraction - 提交热力图
```

#### UI 布局

四象限布局,响应式:

- 左上:**任务概览卡片**(待开始/进行中/已完成数量,占比饼图)
- 右上:**风险与建议卡片**(逾期任务列表,Top 5;ProactiveEngine 待处理建议数)
- 左下:**成员活跃度卡片**(在线/离开/离线状态 + 近 24h 提交数)
- 右下:**进度热力图**(7 天 × 成员数的网格,色深表示当日产出)

#### 优先级

P1 - 应该完成

---

### 需求 6.8 - AI 项目管理建议(扩展 ProactiveEngine)

**用户故事:** 作为管理员,我希望 AI 能主动推送项目风险预警和资源建议,而不是被动等我去查 Dashboard。

#### 验收标准

1. When `risk-task-delay` trigger condition matches (任务逾期 或 deadline 临近且无进展), the system shall push notification to assignee + admin
2. When `workload-imbalance` trigger fires (24h 内某成员 commit 数 > 团队均值 3 倍 或 < 1/3), the system shall suggest task redistribution to admin only
3. When `decision-contradiction` trigger fires (两份决策日志的 `chosen` 在同一 `problem` 上互斥), the system shall flag and link both decisions
4. When admin clicks "采纳", the system shall execute corresponding action:
   - 风险预警:打开任务详情面板
   - 工作量失衡:打开任务重分配建议表单
   - 决策冲突:打开决策对比视图
5. When admin clicks "忽略", the system shall dismiss suggestion and apply Sprint 5 偏好学习
6. When suggestion is dismissed 3 times for same condition pattern, ProactiveEngine shall lower trigger sensitivity automatically
7. When trigger fires, the system shall record full reasoning trace via Sprint 3.3 Trace for auditability

#### 复用 Sprint 5 基础设施

本需求**完全不新建推送系统**,严格作为 ProactiveEngine 的扩展。

> **C1 调整说明:** 现有 `ProactiveEngine` 的 `Trigger` 接口面向编辑器快照(`EditorSnapshot`)驱动的评估模式,适用于"用户正在编辑时触发建议"的场景。本需求的三个触发器基于任务/决策数据的**定时巡检**,不属于编辑器驱动模式。因此新增 `PatrolTrigger` 概念,与现有编辑器触发器分离:
>
> - 现有 `Trigger`(编辑器驱动):通过 `onSnapshot()` 触发评估,产出 `SuggestionToast`
> - 新增 `PatrolTrigger`(定时巡检):通过 `ProactiveEngine` 内置定时器触发(默认 30 分钟间隔),产出 `Notification` 推送到 `NotificationCenter`
>
> 两者共享冷却机制、偏好学习、Trace 记录,但评估入口和展现形式不同。

```typescript
// src/main/services/proactive-engine/types.ts 新增
export type PatrolTriggerId = 'risk-task-delay' | 'workload-imbalance' | 'decision-contradiction'

export interface PatrolTrigger {
  id: PatrolTriggerId
  description: string
  enabled: boolean
  cooldownMs: number
  evaluate(): Promise<PatrolResult | null>
}

export interface PatrolResult {
  title: string
  detail: string
  actions: Array<{ id: string; label: string }>
  audience: string[]
  priority: NotificationPriority
  groupKey: string
}
```

```typescript
// src/main/services/proactive-engine/triggers/risk-task-delay.ts
export const riskTaskDelayTrigger: PatrolTrigger = {
  id: 'risk-task-delay',
  description: '检测逾期或即将到期且无进展的任务',
  enabled: true,
  cooldownMs: 4 * 60 * 60 * 1000,

  async evaluate(): Promise<PatrolResult | null> {
    const tasks = await kanbanService.parseTasksMd(workspacePath)
    const overdueTasks = tasks.filter(t =>
      t.deadline && t.deadline < new Date() && t.status !== '已完成'
    )
    if (overdueTasks.length === 0) return null

    return {
      title: `${overdueTasks.length} 个任务已逾期`,
      detail: overdueTasks.map(t => t.title).join(', '),
      actions: [
        { id: 'view', label: '查看' },
        { id: 'dismiss', label: '忽略' }
      ],
      audience: ['admin', ...overdueTasks.map(t => t.assignee)],
      priority: 'high',
      groupKey: `patrol:risk-task-delay:${overdueTasks.map(t => t.id).sort().join(',')}`,
    }
  }
}
```

`workload-imbalance` 与 `decision-contradiction` 触发器结构同上,仅 `evaluate` 逻辑和 `cooldownMs` 不同。

`ProactiveEngine` 新增 `registerPatrolTrigger()` 方法和内部定时评估循环(复用现有冷却机制)。PatrolTrigger 的 `evaluate()` 结果通过 `NotificationEngine` 创建通知(类型为 `system.suggestion`),而非 SuggestionToast,因为巡检触发器不需要编辑器上下文。

#### 隐私与权限

- `risk-task-delay`:可推送给任务负责人 + 管理员
- `workload-imbalance`:仅推送给管理员
- `decision-contradiction`:推送给两份决策日志的所有相关者

#### 优先级

P1 - 应该完成

---

### 需求 6.9 - 个人空间权限回归与 Admin 警告

**用户故事:** 作为用户,我希望确认个人空间的隔离在新功能下仍然生效;作为管理员,当我访问他人的个人空间时希望有明显的提醒。

#### 验收标准

1. When non-admin user attempts to access `personal/{otherUser}/`, the system shall deny access (existing behavior, regression test only)
2. When AI assembles context, the system shall exclude other users' personal files (existing behavior, regression test only)
3. When user searches via UnifiedSearch, the system shall not return results from others' personal space (existing behavior, regression test only)
4. When admin accesses `personal/{otherUser}/`, the system shall:
   - 显示顶部警告条 "您正在访问 {otherUser} 的个人空间(管理员模式)"
   - 触发 SibyllaEventType.admin.access-personal-space 事件
   - 在 audit log 中记录访问(为 Sprint 9 SSO/审计 预留接口)
5. When admin Dashboard 数据涉及他人 personal/ 内容, the system shall show "管理员视图,包含个人空间数据" 提示
6. When new features (Kanban, Decision Log, Reports) write to personal/, the system shall verify path is current user's personal/ before write
7. When tasks.md 引用的"关联文件"位于他人 personal/, the system shall not auto-load content for AI context (但 task 元数据本身可见)

#### 回归测试覆盖

本需求 70% 工作量是测试。测试矩阵:

| 操作 | 普通用户 | 管理员 |
|---|---|---|
| 读 personal/{self}/ | ✅ | ✅ |
| 读 personal/{other}/ | ❌ | ✅ + 警告 |
| 写 personal/{self}/ | ✅ | ✅ |
| 写 personal/{other}/ | ❌ | ❌(管理员也不能写) |
| AI Context 包含 personal/{other}/ | ❌ | ❌(即使 admin 也不在 AI Context 中) |
| Search 返回 personal/{other}/ | ❌ | ✅(显式标记) |
| 团队周报包含 personal/{other}/ 数据 | 匿名化 | 匿名化(报告级别) |

#### 优先级

P2 - 可以延后

---

## 四、数据流与状态图

### 4.1 任务生命周期完整流

```
┌─ 用户在 Kanban 创建任务 ──┐
│                           │
├─ AI 从对话中辅助创建 ─────┤
│                           ▼
└─ Plan approved ───▶  tasks.md (Source of Truth)
                            │
                            ├─ 用户拖拽 ─▶ 状态更新
                            │
                            ├─ 文件变更触发 §6.3 ─▶ 状态建议
                            │
                            └─ 用户点"派发给 AI"
                                    │
                                    ▼
                            ProgressLedger.declare()
                                    │
                                    ▼
                            TaskStateMachine.create()
                                    │
                                    ▼
                            AI 执行(Sprint 3.1/3.4 已实现)
                                    │
                                    ▼
                            完成事件回写 tasks.md
                                    │
                                    ▼
                            SibyllaEventType.tasks.completed
                                    │
                                    ├─▶ NotificationCenter
                                    ├─▶ ProductivityAnalyzer (缓存失效)
                                    └─▶ Dashboard 刷新
```

### 4.2 决策日志生命周期

```
对话中讨论 ──▶ decision-curator Sub-agent (定期评估)
                  │
                  ▼
         检测到决策模式? ──否──▶ 不动作
                  │
                  是
                  ▼
            建议创建决策日志
                  │
                  ├─ 用户采纳 ─▶ 创建 .sibylla/memory/decisions/{...}.md
                  │                    │
                  │                    ▼
                  │             DecisionProjectionProcessor 提取
                  │             (ExtractionPostProcessor,在 CheckpointScheduler 后处理阶段)
                  │                    │
                  │                    ▼
                  │             MEMORY.md technical_decision
                  │                    │
                  │                    ▼
                  │             MemoryIndexer 索引
                  │
                  └─ 用户忽略 ─▶ 偏好学习,降低敏感度

后续:用户回填 actual_result ──▶ DecisionProjectionProcessor 重新投影
```

### 4.3 报告生成流

```
Cron 触发 (Workflow Scheduler, Sprint 3.5)
    │
    ▼
collect-data step
    │
    ├─▶ tasks.md (Kanban Service)
    ├─▶ Git history (GitAbstraction)
    ├─▶ Trace Store (ai.turn / tool.* spans)
    └─▶ NotificationCenter (待处理建议)
    │
    ▼
generate step (daily-report skill)
    │
    ▼
LLM 生成结构化 Markdown
    │
    ▼
save step (file.write tool)
    │
    ├─▶ personal/{user}/reports/daily/{date}.md
    └─▶ docs/reports/weekly/{week}.md (admin only)
    │
    ▼
SibyllaEventType.report.generated
    │
    ▼
NotificationCenter 通知 "今日报告已生成"
```

---

## 五、性能与可用性目标

| 指标 | 目标 |
|---|---|
| Kanban 首次渲染(< 100 个任务) | < 300ms |
| Kanban 拖拽响应 | < 500ms 完成 tasks.md 写入 |
| 决策检测 Sub-agent 执行 | < 5s(后台异步) |
| Productivity 分析(单成员,周维度) | < 2s 首次,< 100ms 缓存命中 |
| Dashboard 首屏 | < 1s |
| 报告生成(个人日报) | < 30s |
| 报告生成(团队周报) | < 90s |
| ProactiveEngine 触发器评估 | < 1s 单次评估 |

---

## 六、测试策略

### 6.1 单元测试覆盖目标

| 模块 | 覆盖率 |
|---|---|
| KanbanService(tasks.md 解析/写入) | ≥ 90% |
| TaskStatusTracker(启发式判断) | ≥ 80% |
| ProductivityAnalyzer(指标计算) | ≥ 85% |
| DecisionLogger(检测与提取) | ≥ 80% |
| 新增 ProactiveEngine 触发器 | ≥ 80% |

### 6.2 集成测试场景

1. **任务派发链路**:Kanban 创建 → 派发给 AI → ProgressLedger 创建 → AI 执行完成 → tasks.md 自动更新
2. **决策投影链路**:对话讨论 → 决策日志创建 → DecisionProjectionProcessor(ExtractionPostProcessor)提取 → MEMORY.md 更新 → 通过 MemoryIndexer 检索可召回
3. **报告生成链路**:Workflow 触发 → 收集数据 → LLM 生成 → 文件保存 → 通知
4. **权限隔离回归**:跨用户 personal/ 访问、AI Context 过滤、Search 过滤、Dashboard 数据过滤

### 6.3 端到端场景

E2E 用例 1:**用户从对话讨论到任务完成的完整流程**

E2E 用例 2:**Admin 周末查看 Dashboard,采纳一条工作量失衡建议,完成任务重分配**

E2E 用例 3:**两份决策日志冲突 → 触发 decision-contradiction → Admin 采纳 → 进入决策对比视图 → 修订其中一份**

---

## 七、验收检查清单

- [ ] 任务看板正确解析与渲染 tasks.md(三列布局,拖拽流畅)
- [ ] tasks.md 双向同步正常(看板 ↔ 文件 < 2s)
- [ ] task-id 注释正确生成与维护
- [ ] tasks.md 任务可派发到 ProgressLedger 执行
- [ ] ProgressLedger 任务可提升为 tasks.md 任务
- [ ] AI 辅助任务创建可用(task-extractor Sub-agent 正常工作)
- [ ] AI 任务状态自动追踪可用(置信度阈值合理,无误报骚扰)
- [ ] 决策日志检测、创建、投影到 MEMORY.md 完整链路通过
- [ ] 决策日志可回填 actual_result 并重新投影
- [ ] AI 个人日报每日 18:00 自动生成
- [ ] AI 团队周报每周日 17:00 自动生成(仅 Admin)
- [ ] 报告内容包含工作摘要、任务进展、明日/下周计划
- [ ] 工作产出分析四维度指标计算正确
- [ ] 工作产出分析隐私过滤生效(他人数据匿名化)
- [ ] 管理员 Dashboard 四象限正确渲染,30s 自动刷新
- [ ] Dashboard 风险指标准确高亮逾期任务与失衡告警
- [ ] ProactiveEngine 三个新触发器正常工作
- [ ] AI 建议"采纳/忽略"行为正确,偏好学习生效
- [ ] 个人空间权限隔离回归测试全部通过
- [ ] Admin 访问他人 personal/ 显示警告且记录事件
- [ ] 跨 Sprint 集成验证:Sprint 3.3 Trace、Sprint 3.5 Workflow、Sprint 4 双向链接、Sprint 5 ProactiveEngine 全链路畅通
- [ ] 性能指标全部达标(参见 §五)
- [ ] 单元测试覆盖率达标
- [ ] E2E 用例 1/2/3 全部通过

---

## 八、风险与缓解

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| tasks.md 格式多样,解析失败 | 高 | 兼容 GFM checklist 多种缩进,失败时降级为只读模式并提示用户 |
| AI 任务状态追踪误报骚扰用户 | 中 | 严格置信度阈值(0.6 起),3 次忽略后自动降低敏感度 |
| 决策日志检测漏报 | 中 | 提供命令面板手动创建入口,不强依赖自动检测 |
| 团队周报跨用户数据泄漏 | 高 | PrivacyFilter 在生成阶段而非渲染阶段应用,Sub-agent 提示词内置约束 |
| Dashboard 性能瓶颈(全量扫描) | 中 | ProductivityAnalyzer 60s 缓存,Trace 索引化查询,增量计算 |
| 与 Sprint 3.3 ProgressLedger 概念混淆 | 高 | 在 §2.1 严格定义层次关系,UI 上明确标注"用户任务" vs "AI 工作中" |
| Admin 警告 UI 实现晚于功能 | 低 | P2 优先级,允许在 Sprint 6 末期或 Sprint 7 早期补充 |
---

## 九、冲突分析与架构调整记录

> 本节记录 Sprint 6 需求与已有代码实现(Sprint 0-5 交付物)之间的冲突分析结果,以及据此对本文档的调整。分析覆盖 `sibylla-desktop` 与 `sibylla-cloud` 两个子项目。

### 9.1 冲突总览

共识别 **12 类冲突**,按影响程度降序排列:

| # | 冲突 | 影响范围 | 破坏风险 | 调整措施 |
|---|------|---------|---------|---------|
| C1 | ProactiveEngine 触发器架构不兼容——§6.8 三个新触发器的评估模式与现有 `Trigger` 接口根本不同 | §6.8 主动建议 | 高 | 新增 `PatrolTrigger` 概念,与编辑器触发器分离,通过 NotificationCenter 推送 |
| C2 | EventTypes 命名冲突与缺失——现有 `task.created`/`task.completed` 与 §2.4 的 `tasks.*` 复数形式不一致,7 个新事件类型缺失 | §2.4 全局 | 高 | 保持现有 `task.*` 不变,新增 `kanban.*` 前缀替代 `tasks.*`;补齐 `decision.*`/`report.*`/`admin.*` |
| C3 | 三套状态模型映射缺失——Kanban 3 态、TaskStateMachine 6 态、ProgressLedger 5 态之间无明确映射 | §6.1/§2.1 任务看板 | 高 | 在 §2.1 补充状态映射表,明确"派发"和"完成回写"的转换规则 |
| C4 | MemoryExtractor 对决策日志的投影机制假设错误——`extract()` 输入是 `LogEntry[]` 而非文件系统 Markdown | §6.4 决策日志 | 中 | 通过 `ExtractionPostProcessor` 扩展点实现 `DecisionProjectionProcessor`,不修改 MemoryExtractor |
| C5 | Workflow step type 不兼容——§6.5 YAML 示例使用 `type: tool` + `tool:` 字段,现有 Workflow 使用 `skill:`/`sub_agent:`/`action:` | §6.5 日报周报 | 中 | 重写 Workflow YAML 使用与现有 `daily-summary-flow.yaml` 一致的 step 格式 |
| C6 | Sub-agent 注册路径未明确——§2.4 声明 3 个新 sub-agent 但未指定 YAML 定义文件格式与位置 | §2.4 命名空间 | 中 | 明确放入 `resources/prompts/agents/`,含 YAML frontmatter,由 SubAgentRegistry 自动发现 |
| C7 | CollabContextProvider L7 预算已满——Sprint 5 已占用 5%,Sprint 6 任务上下文无处注入 | §6.1/§6.8 | 中 | 将任务摘要作为 L7 扩展内容注入,通过预算裁剪保证不超限 |
| C8 | 日报 Workflow 已存在但设计冲突——现有 `daily-summary-flow.yaml`(晨间 9:00)与 §6.5 傍晚报告设计重叠 | §6.5 日报周报 | 中 | 两者共存并明确分工:晨间轻量 diff 回顾 vs 傍晚多源聚合报告 |
| C9 | ProgressLedger TaskRecord 缺少 tasks.md 关联字段——无法建立双向绑定 | §6.1 任务看板 | 低 | 在 `TaskRecord` 新增可选 `kanbanTaskId?: string` 字段 |
| C10 | NotificationRule 缺少任务相关事件订阅——现有 8 条规则无任务状态变化通知 | §6.3 状态追踪 | 低 | 新增 `task-status-suggestion` 和 `task-risk-alert` 两条规则 |
| C11 | Cloud 端无任务/报告/分析 API——Sprint 6 的 ProductivityAnalyzer 纯本地可实现,但 Dashboard 跨设备场景受限 | §6.6/§6.7 | 低 | Sprint 6 阶段纯本地实现,标注"跨设备聚合"为未来扩展点 |
| C12 | tasks.md HTML comment 解析复杂度被低估——`<!-- task-id: xxx ai-linked -->` 需要健壮的 key-value 解析 | §6.1 任务看板 | 低 | KanbanService 使用正则提取,解析失败降级为不显示 AI 图标 |

### 9.2 C1: ProactiveEngine 触发器架构不兼容

**冲突定位:**

Sprint 6 §6.8 定义的三个新触发器(`risk-task-delay`、`workload-imbalance`、`decision-contradiction`)使用了 `ProactiveTrigger` 接口(含 `evaluate(ctx: ProactiveContext)` 方法),但现有 `ProactiveEngine` 使用完全不同的 `Trigger` 接口。

**现有代码分析:**

- `src/main/services/proactive-engine/types.ts:57-67` — `Trigger` 接口签名为 `condition(snapshot: EditorSnapshot, deps: TriggerDeps) => boolean` + `buildDraft(snapshot, deps) => SuggestionDraft`,评估入口严格依赖 `EditorSnapshot`
- `src/main/services/proactive-engine/index.ts:77-80` — 触发评估入口为 `onSnapshot(snapshot)`,由渲染进程的 `proactive:editorSnapshot` IPC 驱动
- `src/main/services/proactive-engine/index.ts:58-61` — 4 个内置触发器均基于编辑器状态(task-decomposition 检测文档内容、related-content 检测文件切换等)
- `TriggerDeps` 仅暴露 `searchEngine`、`memoryStore`、`fileStats`、`knownMemoryPatterns`,不包含 `KanbanService` 或 `DecisionLogger`

**冲突本质:**

Sprint 6 的三个触发器是**数据巡检型**(定时检查任务逾期、工作量失衡、决策冲突),而现有 4 个触发器是**编辑器状态型**(检测用户正在写什么)。两者的驱动源、评估频率、展现形式完全不同。强行将巡检触发器塞入 `Trigger` 接口会导致 `condition()` 永远返回 `false`(因为没有编辑器快照能反映"任务逾期"这种信息)。

**影响评估:** 高。§6.8 的代码示例与实际 `Trigger` 接口完全不兼容,直接实现会导致编译错误。

**调整方案:**

已在 §6.8 中完成调整——新增 `PatrolTrigger` 概念:

1. 在 `proactive-engine/types.ts` 新增 `PatrolTrigger`、`PatrolResult`、`PatrolTriggerId` 类型
2. 在 `ProactiveEngine` 中新增 `registerPatrolTrigger()` 方法和内部定时评估循环(默认 30 分钟间隔)
3. `PatrolTrigger.evaluate()` 无参数,内部通过构造注入的 `KanbanService`/`ProductivityAnalyzer` 获取数据
4. 巡检结果通过 `NotificationEngine` 创建通知(类型 `system.suggestion`),而非 `SuggestionToast`
5. 两者共享冷却机制(`TriggerRegistry` 管理)、偏好学习、Trace 记录

**涉及文件变更:**

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `proactive-engine/types.ts` | 新增类型 | `PatrolTrigger`/`PatrolResult`/`PatrolTriggerId` |
| `proactive-engine/index.ts` | 扩展方法 | 新增 `registerPatrolTrigger()`/`startPatrol()`/`stopPatrol()` |
| `proactive-engine/trigger-registry.ts` | 扩展 | 新增 patrol 冷却管理 |
| `proactive-engine/triggers/risk-task-delay.ts` | 新增文件 | 逾期任务检测 |
| `proactive-engine/triggers/workload-imbalance.ts` | 新增文件 | 工作量失衡检测 |
| `proactive-engine/triggers/decision-contradiction.ts` | 新增文件 | 决策冲突检测 |

**对现有功能的零破坏保证:** `PatrolTrigger` 是独立注册表,与现有 `Trigger` 注册表分离。`ProactiveEngine.initialize()` 不修改,现有 4 个编辑器触发器的注册和评估路径完全不变。巡检定时器在 `startPatrol()` 中启动(由 Sprint 6 初始化代码调用),不影响 `onSnapshot()` 路径。

### 9.3 C2: EventTypes 命名冲突与缺失

**冲突定位:**

Sprint 6 §2.4 声明的新事件类型 `tasks.created`/`tasks.status-changed`/`tasks.completed`/`tasks.dispatched` 使用复数 `tasks` 前缀,但现有 `SibyllaEventType` 已有 `task.created`/`task.completed`(单数),属于 TaskStateMachine 级别的事件。

**现有代码分析:**

`src/main/services/event-bus-types.ts` 当前包含 62 个事件类型,其中:
- `task.created` (line 49) — payload: `{ taskId: string }`,由 TaskStateMachine 在任务创建时触发
- `task.completed` (line 50) — payload: `{ taskId: string }`,由 TaskStateMachine 在任务完成时触发
- `task.cross-device-resumeable` (line 61) — 跨设备恢复事件

**冲突点:**

1. `task.created` 与 `tasks.created` 仅差一个 `s`,极易在订阅时混淆。两者的语义也不同:前者是 TaskStateMachine 内部状态变更,后者是看板层任务创建(写入 tasks.md)
2. Sprint 6 还需要 `decision.recorded`、`decision.outcome-updated`、`report.generated`、`admin.access-personal-space` 共 7 个新事件,全部不在现有类型列表中

**调整方案:**

已在 §2.4 中完成调整——使用 `kanban.*` 前缀:

| 调整后事件名 | 对应原文 | Payload 类型 |
|---|---|---|
| `kanban.task-created` | 原 `tasks.created` | `{ taskId: string; title: string; assignee?: string; source: 'user' \| 'ai-suggest' }` |
| `kanban.task-status-changed` | 原 `tasks.status-changed` | `{ taskId: string; from: string; to: string; trigger: 'drag' \| 'ai-auto' \| 'dispatch' }` |
| `kanban.task-completed` | 原 `tasks.completed` | `{ taskId: string; completedBy: 'user' \| 'ai-auto' }` |
| `kanban.task-dispatched` | 原 `tasks.dispatched` | `{ taskId: string; ledgerTaskId: string }` |
| `decision.recorded` | 不变 | `{ decisionId: string; title: string; filePath: string }` |
| `decision.outcome-updated` | 不变 | `{ decisionId: string; newOutcome: string }` |
| `report.generated` | 不变 | `{ reportType: 'daily-personal' \| 'weekly-team'; filePath: string; date: string }` |
| `admin.access-personal-space` | 不变 | `{ adminId: string; targetUser: string; timestamp: number }` |

**涉及文件变更:**

| 文件 | 变更类型 |
|------|---------|
| `event-bus-types.ts` | 新增 8 个事件类型到 `SibyllaEventType` 联合类型 + `EventPayloadMap` |

### 9.4 C3: 三套状态模型映射缺失

**冲突定位:**

Sprint 6 §2.1 定义 Kanban 三状态(待开始/进行中/已完成),但系统实际存在三套独立的状态模型,且映射关系在原文中缺失。

**现有代码分析:**

| 状态系统 | 枚举值 | 来源文件 |
|---|---|---|
| TaskStateMachine | `planning \| executing \| awaiting_confirmation \| completed \| cancelled \| failed` | `harness/task-state-machine.ts:21` |
| ProgressLedger | `queued \| running \| paused \| completed \| failed` | `progress/types.ts:1` |
| Kanban(本 Sprint) | `待开始 \| 进行中 \| 已完成` | 本文档 §2.1 |

**冲突点:**

原文只说"派发时创建 ProgressLedger 任务",但未说明:
1. ProgressLedger 的 `queued` 应映射到 Kanban 的哪个状态("待开始"还是"进行中"?)
2. TaskStateMachine 的 `awaiting_confirmation` 和 `cancelled` 在 Kanban 中如何体现
3. ProgressLedger `failed` 时 tasks.md 应如何处理

**调整方案:**

已在 §2.1 中补充完整的状态映射表和转换规则。核心决策:
- `queued` 映射到 Kanban "进行中"(AI 已认领),因为从用户视角"已派发 = 在处理中"
- `failed` 不自动回写 Kanban,需用户手动处理(可能是重新派发或标记为"待开始")
- `awaiting_confirmation` 在 Kanban 保持"进行中"但 UI 显示暂停图标

### 9.5 C4: MemoryExtractor 对决策日志的投影机制假设错误

**冲突定位:**

Sprint 6 §6.4 和 §4.2 数据流图假设 `MemoryExtractor` 能自动从决策日志文件中提取摘要进入 MEMORY.md,但 `MemoryExtractor` 的实际输入是 `LogEntry[]`(对话交互日志),不是文件系统上的 Markdown 文件。

**现有代码分析:**

- `memory/memory-extractor.ts` — `extract()` 接受 `ExtractionInput { logs: LogEntry[], existingMemory: MemoryEntry[], workspaceContext }`,从对话交互日志中提取记忆条目
- `memory/types.ts:96-98` — `ExtractionPostProcessor` 接口已存在:
  ```typescript
  interface ExtractionPostProcessor {
    process(report: ExtractionReport, context: ExtractionInput): ExtractionCandidate[]
  }
  ```
- `memory/checkpoint-scheduler.ts` — 在 `extract()` 之后、`applyExtractionReport()` 之前有后处理扩展点(Sprint 5 已为 `NotificationPreferenceExtractor` 建立)

**冲突本质:**

`MemoryExtractor` 不是文件索引器,它不会扫描 `.sibylla/memory/decisions/` 目录。决策日志作为独立的 Markdown 文件存在,不在 `LogEntry[]` 流中。原文"MemoryExtractor 提取"的描述在技术实现上不可行。

**调整方案:**

已在 §2.2、§6.4、§4.2 中完成调整——通过 `ExtractionPostProcessor` 扩展点实现 `DecisionProjectionProcessor`:

1. 新增 `src/main/services/memory/decision-projection-processor.ts`,实现 `ExtractionPostProcessor` 接口
2. `process()` 方法:
   - 扫描 `.sibylla/memory/decisions/` 目录
   - 通过 mtime 识别自上次 checkpoint 以来新增/更新的决策日志
   - 解析 YAML frontmatter(`title`/`status`/`decided_at`/`tags`)和 Markdown 结构(问题/选项/决策/理由)
   - 生成 `ExtractionCandidate[]`,section=`technical_decision`
   - 在 `content` 中包含反向链接 `source: .sibylla/memory/decisions/{filename}`
3. 在 `CheckpointScheduler` 构造时注册,与现有 `NotificationPreferenceExtractor` 并列
4. 每次 checkpoint 自动触发,决策日志更新后下一个 checkpoint 周期自动重新投影

**对 MemoryExtractor 的零修改保证:** `MemoryExtractor.extract()` 方法完全不动。投影逻辑通过后处理扩展点注入,这是 Sprint 3.2 设计预留的插件机制。

### 9.6 C5: Workflow step type 不兼容

**冲突定位:**

Sprint 6 §6.5 的 Workflow YAML 示例使用了 `type: tool` + `tool: productivity.collectPersonalData` 的 step 格式,但现有 Workflow 系统不支持这种格式。

**现有代码分析:**

- `resources/workflows/daily-summary-flow.yaml` — 使用 `skill:` / `sub_agent:` / `action:` 字段定义 step
- `shared/types.ts` 中 `WorkflowStep` 类型的 step 字段为 `skill`/`sub_agent`/`action`(需确认具体定义)
- `WorkflowExecutor` 通过 `StepExecutor` 接口分发到不同的 step handler

**冲突点:**

`type: tool` + `tool:` 组合在现有 Workflow 框架中无对应 handler。`productivity.collectPersonalData` 和 `file.write` 不是已注册的 step 类型。

**调整方案:**

已在 §6.5 中完成调整——重写两个 Workflow YAML:
- `daily-personal-report.yaml`:使用 `sub_agent: doc-summarizer`(已有)收集数据 + `skill: daily-report`(已有)生成 + `action: internal_notification` 通知
- `weekly-team-report.yaml`:使用 `sub_agent: team-report-curator`(本 Sprint 新增)收集 + `skill: daily-report` 生成 + `action: internal_notification` 通知

### 9.7 C6: Sub-agent 注册路径未明确

**冲突定位:**

Sprint 6 §2.4 声明 3 个新 sub-agent(`task-extractor`、`decision-curator`、`team-report-curator`),但未指定定义文件格式和注册路径。

**现有代码分析:**

- `sub-agent/SubAgentRegistry.ts` — 从 `resources/prompts/agents/` 目录扫描 YAML frontmatter 格式的 agent 定义文件
- 已有 8 个 agent prompt 文件:`suggestion-curator.md`、`memory-curator.md`、`focus-summary-curator.md`、`merge-curator.md`、`pr-reviewer.md`、`doc-summarizer.md`、`meeting-note-writer.md`、`spec-reviewer.md`
- 注册方式:文件放入目录后由 `SubAgentRegistry` 自动发现,无需代码注册

**调整方案:**

在 §2.4 中明确位置为 `resources/prompts/agents/`,按现有格式创建。每个文件包含 YAML frontmatter:

```markdown
---
id: task-extractor
version: "1.0"
name: 任务提取器
description: 从对话中识别可执行任务并结构化输出
model: claude-haiku
allowed_tools:
  - reference_file
  - unified_search
max_turns: 3
max_tokens: 2000
output_schema:
  type: array
  items:
    type: object
    properties:
      title: { type: string }
      assignee: { type: string }
      priority: { type: string, enum: [P0, P1, P2] }
      deadline: { type: string }
      relatedFiles: { type: array, items: { type: string } }
      reason: { type: string }
---

(提示词正文)
```

**对 SubAgentRegistry 的零修改:** `SubAgentRegistry` 的自动发现机制已支持此格式,无需代码变更。

### 9.8 C7: CollabContextProvider L7 预算已满

**冲突定位:**

Sprint 6 的任务看板功能需要 AI 在对话中感知任务状态(如"当前有哪些待办"),但 `ContextEngine v2` 的 7 层预算权重已分配完毕(100%),L7(collab)仅占 5%,且已用于 Presence/协作上下文。

**现有代码分析:**

- `context-engine/types-v2.ts:39-47` — `V2_BUDGET_WEIGHTS` 总和 100%,各层权重已固定
- `context-engine/collab-context-provider.ts` — L7 已实现,注入在线成员 + 最近活动

**调整方案:**

不新增 L8 层(保持最小侵入)。将任务摘要作为 `CollabContextProvider` 的扩展内容:

1. 在 `collect()` 方法中新增"任务概览"段(从 `KanbanService` 获取)
2. 内容格式:
   ```
   ### 任务概览
   - 待开始: 5, 进行中: 3, 已完成: 12
   - 你负责的任务: [设计系统架构](进行中), [API 文档](待开始)
   ```
3. 裁剪优先级:任务概览 < 最近活动 < 在线成员(超出预算时优先裁剪任务段)
4. 注入条件:用户消息包含任务相关关键词("任务"/"待办"/"进度"/"看板")时才注入

**涉及文件变更:**

| 文件 | 变更类型 |
|------|---------|
| `context-engine/collab-context-provider.ts` | 扩展 `collect()` 方法,新增 `KanbanService` 依赖注入 |

### 9.9 C8: 日报 Workflow 已存在但设计冲突

**冲突定位:**

现有 `resources/workflows/daily-summary-flow.yaml` 每天早上 9:00 触发,使用 `doc-summarize` skill 生成轻量 diff 回顾。Sprint 6 §6.5 要求每天 18:00 触发多源聚合报告。

**调整方案:**

两者共存,分工明确:
- **晨间 9:00** (`daily-summary-flow.yaml`,已有):基于文件 diff 的轻量回顾,无 AI 深度参与
- **傍晚 18:00** (`daily-personal-report.yaml`,本 Sprint 新增):AI 深度参与,多源聚合(任务进展 + 提交记录 + AI 对话摘要 + 明日计划)

用户可在设置中选择启用其中一个或两个。不删除现有 Workflow。

### 9.10 C9: ProgressLedger TaskRecord 缺少 tasks.md 关联字段

**冲突定位:**

Sprint 6 §2.1 要求通过 `task-id` 在 tasks.md 和 ProgressLedger 之间建立双向关联,但 `TaskRecord` 接口(`progress/types.ts:15-31`)没有 `kanbanTaskId` 或类似字段。

**现有代码分析:**

```typescript
interface TaskRecord {
  id: string           // ProgressLedger 自身的任务 ID
  title: string
  state: TaskState
  mode?: 'plan' | 'analyze' | 'review' | 'write' | 'free'
  traceId?: string
  conversationId?: string
  // ... 无外部关联字段
}
```

**调整方案:**

在 `TaskRecord` 新增可选字段 `kanbanTaskId?: string`,在 `DeclareInput` 中同步新增。这是对 Sprint 3.3 类型的最小扩展:

```typescript
interface TaskRecord {
  // ... 现有字段
  kanbanTaskId?: string  // 关联 tasks.md 中的 task-id(如 tsk_a1b2c3)
}

interface DeclareInput {
  title: string
  mode?: TaskRecord['mode']
  traceId?: string
  conversationId?: string
  plannedChecklist?: string[]
  kanbanTaskId?: string  // 新增
}
```

**对现有调用方的零破坏:** `kanbanTaskId` 为可选字段,所有现有 `declare()` 调用无需修改。仅 `KanbanService.dispatchToAI()` 在调用 `declare()` 时传入此字段。

### 9.11 C10: NotificationRule 缺少任务相关事件订阅

**冲突定位:**

Sprint 6 §6.3 要求在任务状态变化时推送通知,但现有 `notification-rules.ts` 的 8 条内置规则中没有任务相关的订阅。

**调整方案:**

在 `notification-rules.ts` 的 `createBuiltinRules()` 中新增 2 条规则:

| 规则 ID | 订阅事件 | 触发条件 | 优先级 |
|---|---|---|---|
| `kanban-status-suggestion` | `kanban.task-status-changed` | trigger = 'ai-auto' | normal |
| `kanban-task-risk` | `kanban.task-risk-detected`(需新增事件) | 总是 | high |

第 1 条规则用于 AI 自动状态更新时的用户通知;第 2 条规则用于 `TaskStatusTracker` 检测到风险时推送预警。

### 9.12 C11: Cloud 端无任务/报告/分析 API

**冲突定位:**

`ProductivityAnalyzer` 的数据源规划中,`GitAbstraction.getHistory()` 在本地可用,但跨设备场景下需要云端支持。当前 `sibylla-cloud/src/routes/` 仅有 health/auth/git/workspace/ai 五个路由模块,无 task/report/productivity 端点。

**调整方案:**

Sprint 6 阶段 `ProductivityAnalyzer` 纯本地实现。数据源:
- 任务完成率:本地 `tasks.md` 解析
- 文档贡献度:本地 `GitAbstraction.getHistory()`
- 协作响应速度:本地 `EventLogStore`(JSONL)
- 知识贡献度:本地 `WikiLinksStore`(`wiki-links-store.ts` 已有 `getBacklinksCount()` 方法)

Dashboard 数据来源限于当前设备的本地数据。在 §6.6/§6.7 中标注"跨设备聚合"为未来扩展点(Sprint 7+ 或 Cloud v2)。

### 9.13 C12: tasks.md HTML comment 解析复杂度被低估

**冲突定位:**

Sprint 6 §6.1 tasks.md 格式使用 `<!-- task-id: tsk_a1b2c3 -->` 和 `<!-- task-id: tsk_d4e5f6 ai-linked -->` HTML 注释携带元数据。解析这种 key-value 对(以空格分隔、包含布尔标记)比简单的 ID 提取更复杂。

**调整方案:**

在 `KanbanService` 中使用正则 `<!--\s*task-id:\s*(\S+)(?:\s+(ai-linked))?\s*-->` 提取:
- 捕获组 1: task-id 值(如 `tsk_a1b2c3`)
- 捕获组 2: 可选的 `ai-linked` 标记

解析失败时降级:不显示 AI 图标,任务仍可正常显示和操作。`ai-suggested` 标记同理处理。

---

## 十、关键架构决策总结

基于以上冲突分析,本 Sprint 做出以下架构决策(按决策编号引用):

| 决策 | 选择 | 理由 |
|------|------|------|
| D1: ProactiveEngine 扩展方式 | 新增 `PatrolTrigger` 概念而非修改现有 `Trigger` | 巡检型与编辑器驱动型的评估入口根本不同;分离后互不干扰 |
| D2: 看板事件命名 | `kanban.*` 前缀替代 `tasks.*` | 避免与现有 `task.*`(TaskStateMachine 级别)混淆 |
| D3: 决策日志投影路径 | `DecisionProjectionProcessor`(ExtractionPostProcessor) | 不修改 `MemoryExtractor`,复用 Sprint 3.2 预留的插件机制 |
| D4: Workflow step 格式 | 沿用 `skill:`/`sub_agent:`/`action:` | 不扩展 WorkflowExecutor,与现有 YAML 格式一致 |
| D5: 任务上下文注入位置 | 扩展 L7 CollabContextProvider | 不新增 L8 层,通过裁剪策略保证不超预算 |
| D6: ProgressLedger 扩展 | 新增可选 `kanbanTaskId` 字段 | 最小侵入,不影响现有 declare() 调用方 |
| D7: ProductivityAnalyzer 数据源 | 纯本地实现 | 不依赖云端 API,跨设备聚合留作未来扩展 |

所有决策遵循**最小侵入原则**:对现有系统的修改仅限于新增可选字段(`C9`)、新增注册(事件类型/通知规则)和后处理扩展(`C4`),不修改任何现有接口的核心签名或行为。
