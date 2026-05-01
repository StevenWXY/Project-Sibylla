# 任务看板与 AI 任务管理

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK010 |
| **任务标题** | 任务看板与 AI 任务管理 |
| **所属阶段** | Phase 2 - 项目管理闭环 (Sprint 6) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 5-6 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

构建 Sprint 6 的任务管理核心——Kanban 看板 UI、tasks.md 双向同步、AI 辅助任务创建和 AI 任务状态自动追踪。以 `tasks.md` 作为用户层唯一真相源，通过 `KanbanService` 桥接 ProgressLedger（AI 自声明任务台账）和 TaskStateMachine（底层任务状态机），实现"用户任务"与"AI 任务"的统一管理。

### 背景

Sprint 3.1-3.5 已建立 AI 侧的任务执行基础设施（TaskStateMachine、ProgressLedger、PlanManager），但用户没有可视化的任务管理界面。当前任务状态分散在 `progress.md`（AI 维护）和 `tasks.md`（用户手写 Markdown）中，两者互不关联：

| 问题 | 现状 | 本任务解决 |
|------|------|-----------|
| 无可视化看板 | tasks.md 纯文本，无拖拽/状态管理 | KanbanBoard 三列拖拽 UI |
| AI 任务与用户任务割裂 | ProgressLedger 和 tasks.md 完全独立 | 双向绑定 + "派发给 AI" + "提升为正式任务" |
| 任务创建全靠手写 | 用户需手动编辑 tasks.md | AI 从对话中提取可执行任务建议 |
| 任务状态全靠手动更新 | 用户需自行检查进度 | AI 根据文件变更自动建议状态更新 |
| AI 任务完成不回写 | AI 完成任务后 tasks.md 不变 | ai-linked 任务完成后自动更新 tasks.md |

**核心设计约束：**

1. **tasks.md 是用户层唯一真相源**——KanbanService 仅是 tasks.md 的解析器/写入器，不创建新的任务存储介质
2. **不修改 ProgressLedger 核心接口**——仅在 `TaskRecord` 和 `DeclareInput` 新增可选 `kanbanTaskId` 字段（C9 最小侵入）
3. **三套状态模型严格映射**——Kanban 3态、ProgressLedger 5态、TaskStateMachine 6态之间的转换规则由 KanbanService 强制执行（C3）
4. **事件命名使用 kanban.* 前缀**——避免与现有 task.*（TaskStateMachine 级别）冲突（C2）
5. **AI 建议必须可追溯**——每个 AI 任务建议必须引用具体对话片段作为来源
6. **启发式评估不调用 LLM**——TaskStatusTracker 使用纯函数信号加权，不调用 AI
7. **tasks.md 格式兼容**——支持多种 GFM checklist 缩进风格，解析失败降级为只读模式

### 范围

**包含：**

- `KanbanService` — tasks.md 解析/写入/双向同步核心服务
- `KanbanBoard` 组件 — 三列（待开始/进行中/已完成）拖拽看板 UI
- `KanbanTaskDetail` 组件 — 任务详情面板（元数据、AI 链接状态）
- `AiTaskSidebar` 组件 — "AI 工作中"只读侧边栏（ProgressLedger 活跃任务）
- `task-extractor` Sub-agent prompt — 从对话中提取可执行任务
- `TaskStatusTracker` — 文件变更启发式状态追踪服务
- `task-decomposition` 触发器对接 — 衔接 Sprint 5 ProactiveEngine 占位触发器
- IPC handlers（kanban.ts）— 看板相关 IPC 通道
- Zustand store（kanbanStore.ts）— 看板 UI 状态
- 事件类型扩展 — 新增 `kanban.*` 系列事件到 SibyllaEventType
- 通知规则扩展 — 新增 `kanban-status-suggestion` 和 `kanban-task-risk` 两条规则（C10）
- L7 上下文扩展 — CollabContextProvider 新增任务概览段（C7）
- `TaskRecord.kanbanTaskId` 字段扩展（C9）
- 单元测试

**不包含：**

- 决策日志系统（TASK011）
- AI 日报/周报生成（TASK012）
- 管理员 Dashboard（TASK013）
- 权限回归测试（TASK014）
- ProactiveEngine PatrolTrigger 扩展（TASK013）
- ProgressLedger 核心逻辑修改（仅新增可选字段）
- TaskStateMachine 核心逻辑修改

## 依赖关系

### 前置依赖

- [x] PHASE2-TASK001 — 事件总线（`AppEventBus` + `SibyllaEventType` + 事件注册）
- [x] PHASE2-TASK004 — WikiLinks 双向链接（`WikiLinksStore` 被知识贡献度计算引用）
- [x] PHASE2-TASK006 — 通知中心（`NotificationEngine` + `NotificationRule` + `NotificationCenter`）
- [x] PHASE2-TASK007 — Presence 与协作上下文（`CollabContextProvider` L7 层扩展）
- [x] PHASE2-TASK008 — ProactiveEngine（`TriggerRegistry` + `task-decomposition` 占位触发器）
- [x] Sprint 3.1 — Harness（`TaskStateMachine` + `PersonalSpaceGuard`）
- [x] Sprint 3.3 — ProgressLedger（`ProgressLedger` + `TaskRecord` + `DeclareInput`）
- [x] Sprint 3.4 — PlanManager（`PlanManager` + Plan 模式产物）
- [x] Sprint 3.5 — Sub-agent 系统（`SubAgentExecutor` + `SubAgentRegistry`）
- [x] Sprint 1 — Tiptap 编辑器、文件树

### 被依赖任务

- [ ] PHASE2-TASK012 — AI 日报周报与工作产出分析（消费 `KanbanService` 任务统计数据）
- [ ] PHASE2-TASK013 — 管理员 Dashboard 与巡检触发器（消费 `KanbanService` 任务统计 + `kanban.task-risk-detected` 事件）

## 参考文档

- [`specs/requirements/phase2/sprint6-task-management.md`](../../requirements/phase2/sprint6-task-management.md) — 需求 6.1（任务看板）、6.2（AI 辅助创建）、6.3（AI 状态追踪）、§2.1（四件套层次关系）、§9.2-9.4（C2/C3/C9 冲突分析）、§9.7（C7 L7 预算）、§9.10（C9 字段扩展）、§9.11（C10 通知规则）
- [`specs/design/architecture.md`](../../design/architecture.md) — 进程通信架构、IPC 模式
- [`specs/design/data-and-api.md`](../../design/data-and-api.md) — Workspace 文件结构（tasks.md 位置）
- [`specs/design/ui-ux-design.md`](../../design/ui-ux-design.md) — UI/UX 设计规范
- [`specs/design/sub-agent-system.md`](../../design/sub-agent-system.md) — Sub-agent 注册与执行
- [`CLAUDE.md`](../../../CLAUDE.md) — 文件即真相、AI 建议人类决策、个人空间隔离
- `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` — Electron IPC 通信模式
- `.kilocode/skills/phase1/zustand-state-management/SKILL.md` — Zustand store 设计
- `.kilocode/skills/phase1/ai-context-engine/SKILL.md` — AI 上下文引擎设计

## 验收标准

### 需求 6.1 — 任务看板与多源任务整合

#### 看板渲染与 tasks.md 解析

- [ ] `KanbanService.parseTasksMd(workspacePath)` 正确解析 tasks.md，返回 `KanbanModel`（三列任务数组）
- [ ] 解析支持 `<!-- task-id: xxx -->` 和 `<!-- task-id: xxx ai-linked -->` HTML 注释元数据（正则 `<!--\s*task-id:\s*(\S+)(?:\s+(ai-linked))?\s*-->`)
- [ ] 解析支持 `<!-- ai-suggested -->` 标记
- [ ] 解析失败时降级为只读模式，显示提示"tasks.md 格式异常，看板已切换为只读"
- [ ] KanbanBoard 组件渲染三列布局：待开始、进行中、已完成
- [ ] 每个任务卡片显示：标题、负责人、优先级标记（P0/P1/P2 颜色区分）、截止日期、AI 图标（如有 task-id）
- [ ] 首次渲染（< 100 个任务）< 300ms

#### 拖拽与状态更新

- [ ] 用户拖拽任务到不同列，`KanbanService.updateTaskStatus()` 在 500ms 内更新 tasks.md
- [ ] 拖拽触发 `kanban.task-status-changed` 事件，payload `{ taskId, from, to, trigger: 'drag' }`
- [ ] tasks.md 写入使用原子写入（FileManager.writeFile 的默认行为）
- [ ] 拖拽过程中 UI 显示拖拽预览效果

#### 任务创建

- [ ] 用户在看板中创建任务，`KanbanService.createTask()` 追加到 tasks.md 对应列
- [ ] 自动生成 `task-id`（格式 `tsk_{6位随机字母数字}`）以 HTML 注释形式嵌入
- [ ] 新建任务支持填写：标题（必填）、负责人、优先级、截止日期、关联文件

#### tasks.md 外部变更监听

- [ ] tasks.md 被外部编辑器修改后，看板在 2 秒内重新加载（复用 `file.updated` 事件）
- [ ] 外部变更与本地未保存变更冲突时，弹出提示让用户选择保留哪个版本

#### AI 派发与双向绑定

- [ ] 用户点击"派发给 AI"按钮，`KanbanService.dispatchToAI()` 执行：
  1. 调用 `ProgressLedger.declare({ title, kanbanTaskId })` 创建 AI 侧任务
  2. 调用 `TaskStateMachine.create()` 初始化状态机
  3. 在 tasks.md 对应任务行追加 `ai-linked` 标记
  4. 触发 `kanban.task-dispatched` 事件
- [ ] 派发后看板任务卡片显示"AI 已认领"状态标记（ProgressLedger `queued` → Kanban "进行中" + 认领图标）
- [ ] ProgressLedger 任务完成后，ai-linked 任务自动更新 tasks.md 状态为"已完成"（ProgressLedger `completed` → Kanban 自动回写）
- [ ] ProgressLedger `failed` 时，看板保持"进行中"但显示失败警告图标，不自动回写 tasks.md
- [ ] ProgressLedger `paused`（awaiting_confirmation）时，看板保持"进行中"但显示暂停图标

#### AI 工作中侧边栏

- [ ] `AiTaskSidebar` 组件显示 ProgressLedger 中无 tasks.md 匹配的活跃任务（只读）
- [ ] 用户点击"提升为正式任务"，`KanbanService.promoteFromLedger()` 追加到 tasks.md 并建立 task-id 关联
- [ ] 提升后 ProgressLedger 任务自动获得 `kanbanTaskId` 绑定

#### 任务详情面板

- [ ] 用户点击任务卡片，展开详情面板，显示完整元数据
- [ ] 详情面板包含：标题、负责人、优先级、截止日期、关联文件列表、AI 执行状态（如有）
- [ ] AI 链接任务显示 AI 执行进度（从 ProgressLedger 获取 checklist 进度）
- [ ] 详情面板支持内联编辑元数据并保存到 tasks.md

### 需求 6.2 — AI 辅助任务创建

#### task-extractor Sub-agent

- [ ] `resources/prompts/agents/task-extractor.md` 创建，包含 YAML frontmatter（id、version、name、description、model、allowed_tools、max_turns、max_tokens、output_schema）
- [ ] Sub-agent 输入：最近 N 轮对话 + 当前 tasks.md 内容（去重）
- [ ] Sub-agent 输出：JSON 数组，每项包含 `title`、`assignee`、`priority`、`deadline`、`relatedFiles`、`reason`
- [ ] 仅提取明确表述的行动项，返回空数组表示无提取
- [ ] 每个建议必须引用具体对话片段作为来源（反幻觉约束）
- [ ] 通过 `SubAgentRegistry` 自动发现，无需代码注册

#### 对话中任务提取触发

- [ ] 每 N 轮对话（默认 5）触发 `task-extractor` Sub-agent 检测可执行项
- [ ] 检测到可执行项后，NotificationCenter 推送任务预览通知
- [ ] 预览显示结构化字段：标题、建议负责人、优先级、截止日期
- [ ] 用户点击"采纳"，追加到 tasks.md 并标记 `<!-- ai-suggested -->`
- [ ] 用户点击"修改"，打开内联编辑器后创建
- [ ] 用户点击"忽略"，不再次为当前对话展示相同建议

#### ProactiveEngine 对接

- [ ] Sprint 5 `task-decomposition` 占位触发器的 handler 连接到 `task-extractor` Sub-agent
- [ ] 通过 NotificationCenter 推送建议（复用 Sprint 5 偏好学习、冷却、聚合机制）

### 需求 6.3 — AI 任务状态自动追踪

#### TaskStatusTracker 核心逻辑

- [ ] `TaskStatusTracker` 订阅 `file.updated` 事件，匹配文件路径与 tasks.md 中的"关联文件"字段
- [ ] 命中关联文件时，执行启发式信号分析：
  - 文件首次创建：+0.3 → 待开始转进行中
  - 文件内容增量 > 200 字：+0.2 → 进行中
  - commit 消息包含"完成/done/finish/closed"：+0.5 → 进行中转已完成
  - 文件被标记为 frozen/published：+0.4 → 已完成
  - 关联文件 24h 内无变更 + deadline 临近：+0.3 → 风险预警
- [ ] 置信度 ≥ 0.6 触发 NotificationCenter 建议
- [ ] 置信度 ≥ 0.9 允许"快速采纳"按钮（一键确认）

#### 状态建议交互

- [ ] 建议通知包含推理链（哪个文件变更、检测到什么信号）
- [ ] 用户确认后，自动更新 tasks.md 状态
- [ ] 用户忽略后，记录 dismissal 并 24 小时内不再为同一任务建议相同状态变更
- [ ] ai-linked 任务 ProgressLedger 报告完成时，自动更新无需用户确认

#### 通知规则扩展

- [ ] `notification-rules.ts` 新增 `kanban-status-suggestion` 规则：订阅 `kanban.task-status-changed`，条件 `trigger === 'ai-auto'`，优先级 normal
- [ ] `notification-rules.ts` 新增 `kanban-task-risk` 规则：订阅 `kanban.task-risk-detected`，总是触发，优先级 high

### L7 上下文扩展

- [ ] `CollabContextProvider.collect()` 新增"任务概览"段（从 `KanbanService` 获取）
- [ ] 内容格式：待开始/进行中/已完成计数 + 当前用户负责的任务列表
- [ ] 裁剪优先级：任务概览 < 最近活动 < 在线成员（超出预算时优先裁剪任务段）
- [ ] 注入条件：用户消息包含任务相关关键词（"任务"/"待办"/"进度"/"看板"）时才注入

### 性能要求

- [ ] 看板首次渲染（< 100 个任务）< 300ms
- [ ] 拖拽响应 < 500ms（tasks.md 写入完成）
- [ ] TaskStatusTracker 单次启发式评估 < 100ms
- [ ] task-extractor Sub-agent 执行 < 5s（后台异步）

### 单元测试

- [ ] KanbanService tasks.md 解析测试（标准格式、多种缩进、ai-linked 标记、空文件、损坏格式降级）
- [ ] KanbanService tasks.md 写入测试（创建、状态更新、派发标记、原子写入）
- [ ] KanbanService 状态映射测试（三套状态模型的 6 种转换场景）
- [ ] TaskStatusTracker 启发式信号测试（各信号权重、置信度阈值、dismissal 24h 冷却）
- [ ] task-extractor prompt 测试（有可执行项对话、无可执行项对话、去重逻辑）
- [ ] 通知规则测试（kanban-status-suggestion、kanban-task-risk）
- [ ] 覆盖率 ≥ 85%

## 技术策略

### 核心架构：tasks.md 作为用户层唯一真相源

```
┌─────────────────────────────────────────────────────────────┐
│                     渲染进程 (React)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ KanbanBoard  │  │AiTaskSidebar │  │KanbanTaskDetail   │ │
│  │  (三列拖拽)   │  │ (只读侧边栏)  │  │  (详情面板)       │ │
│  └──────┬───────┘  └──────┬───────┘  └────────┬──────────┘ │
│         │ IPC              │ IPC               │ IPC         │
│         ▼                  ▼                   ▼             │
│  ┌──────────────────────────────────────────────────────────┐│
│  │              kanbanStore (Zustand)                       ││
│  └──────────────────────────┬───────────────────────────────┘│
└─────────────────────────────┼────────────────────────────────┘
                              │ IPC (kanban:* channels)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     主进程 (Node.js)                         │
│  ┌──────────────────────────────────────────────────────────┐│
│  │              KanbanService (核心服务)                      ││
│  │                                                          ││
│  │  parseTasksMd() ──▶ tasks.md 解析器 ──▶ KanbanModel     ││
│  │  updateTaskStatus() ──▶ tasks.md 写入器                  ││
│  │  dispatchToAI() ──▶ ProgressLedger.declare()             ││
│  │  promoteFromLedger() ──▶ tasks.md 追加 + 关联             ││
│  └──────────┬──────────────┬──────────────────┬─────────────┘│
│             │              │                  │              │
│             ▼              ▼                  ▼              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ FileManager  │ │ProgressLedger│ │ TaskStateMachine     │ │
│  │ (文件读写)    │ │(AI任务台账)   │ │ (底层状态机)         │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────────────────────┐ │
│  │TaskStatusTracker │  │ AppEventBus                      │ │
│  │(启发式状态追踪)    │  │ kanban.task-* / kanban.task-risk│ │
│  └──────────────────┘  └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 三套状态模型映射（C3 严格执行）

| Kanban (tasks.md) | ProgressLedger | TaskStateMachine | 触发条件 |
|---|---|---|---|
| 待开始 | — | — | 初始状态，用户创建或 AI 建议采纳 |
| 进行中 | `running` | `executing` | 用户手动拖拽，或 AI 派发后 ProgressLedger 进入 running |
| 进行中 | `queued` | `planning` | AI 已派发但尚未开始执行（"AI 已认领"） |
| 进行中 | `paused` | `awaiting_confirmation` | AI 等待用户确认，UI 显示暂停图标 |
| 已完成 | `completed` | `completed` | 用户手动确认，或 ai-linked 任务自动回写 |
| 进行中(带失败标记) | `failed` | `failed` | AI 执行失败，不自动回写 tasks.md |

**转换规则：**

- **派发时：** Kanban "进行中" ← ProgressLedger `queued`（等待 AI 实际启动，不直接 running）
- **AI 启动：** ProgressLedger `queued` → `running`，Kanban 保持"进行中"
- **AI 完成（自动）：** ai-linked 任务的 ProgressLedger `completed` → Kanban 自动更新为"已完成"
- **AI 完成（手动）：** 非 ai-linked 任务需用户手动拖拽确认
- **AI 失败：** ProgressLedger `failed` → Kanban 保持"进行中"但 UI 显示失败警告

### 事件命名策略（C2 — kanban.* 前缀）

| 新增事件名 | Payload 类型 | 触发时机 |
|---|---|---|
| `kanban.task-created` | `{ taskId, title, assignee?, source: 'user' \| 'ai-suggest' }` | 任务被创建到 tasks.md |
| `kanban.task-status-changed` | `{ taskId, from, to, trigger: 'drag' \| 'ai-auto' \| 'dispatch' }` | 任务状态变更 |
| `kanban.task-completed` | `{ taskId, completedBy: 'user' \| 'ai-auto' }` | 任务标记完成 |
| `kanban.task-dispatched` | `{ taskId, ledgerTaskId }` | 任务派发给 AI |
| `kanban.task-risk-detected` | `{ taskId, riskType, confidence, signals }` | TaskStatusTracker 检测到风险 |

> 与现有 `task.created`/`task.completed`（TaskStateMachine 级别）完全独立，互不干扰。

### tasks.md 格式规范

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

**解析策略：** 以 `## 标题` 分隔列，`- [ ]` / `- [x]` 标识任务行，`  - key: value` 标识元数据行。HTML 注释 `<!-- ... -->` 携带 task-id 和 ai-linked 标记。

### TaskRecord 扩展（C9 最小侵入）

在 `src/main/services/progress/types.ts` 新增可选字段：

```typescript
interface TaskRecord {
  // ... 现有 17 个字段完全不变
  kanbanTaskId?: string  // 关联 tasks.md 中的 task-id
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

`kanbanTaskId` 为可选字段，所有现有 `declare()` 调用无需修改。

### L7 上下文扩展策略（C7）

`CollabContextProvider` 在 `collect()` 方法中新增任务概览段：

```
### 任务概览
- 待开始: 5, 进行中: 3, 已完成: 12
- 你负责的任务: [设计系统架构](进行中), [API 文档](待开始)
```

- 裁剪优先级：任务概览 < 最近活动 < 在线成员
- 注入条件：用户消息包含"任务"/"待办"/"进度"/"看板"关键词
- 新增依赖：`KanbanService` 通过构造函数注入

## 技术执行路径

### 步骤 1：扩展 ProgressLedger 类型（C9）

**文件：** `src/main/services/progress/types.ts`（修改）

1. 在 `TaskRecord` 接口（line 15-31）末尾新增可选字段：
   ```typescript
   kanbanTaskId?: string
   ```

2. 在 `DeclareInput` 接口（line 40-46）末尾新增可选字段：
   ```typescript
   kanbanTaskId?: string
   ```

3. 不修改 `ProgressLedger` 类的任何方法——`declare()` 已将 `DeclareInput` 展开到 `TaskRecord`，新增可选字段自动传递。

**验证：** TypeScript 编译通过；现有 `declare()` 调用（无 `kanbanTaskId`）不受影响。

### 步骤 2：新增 kanban.* 事件类型（C2）

**文件：** `src/main/services/event-bus-types.ts`（修改）

1. 在 `SibyllaEventType` 联合类型（line 5-61）中追加 5 个新事件：
   ```typescript
   | 'kanban.task-created'
   | 'kanban.task-status-changed'
   | 'kanban.task-completed'
   | 'kanban.task-dispatched'
   | 'kanban.task-risk-detected'
   ```

2. 在 `EventPayloadMap`（line 76-133）中追加对应 payload 类型：
   ```typescript
   'kanban.task-created': { taskId: string; title: string; assignee?: string; source: 'user' | 'ai-suggest' }
   'kanban.task-status-changed': { taskId: string; from: string; to: string; trigger: 'drag' | 'ai-auto' | 'dispatch' }
   'kanban.task-completed': { taskId: string; completedBy: 'user' | 'ai-auto' }
   'kanban.task-dispatched': { taskId: string; ledgerTaskId: string }
   'kanban.task-risk-detected': { taskId: string; riskType: string; confidence: number; signals: string[] }
   ```

**验证：** TypeScript 编译通过；现有事件类型不受影响。

### 步骤 3：实现 KanbanService 核心

**文件：** `src/main/services/kanban/kanban-service.ts`（新建）

1. 定义核心类型：
   ```typescript
   type KanbanColumn = '待开始' | '进行中' | '已完成'

   interface KanbanTask {
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

   interface KanbanModel {
     tasks: KanbanTask[]
     columns: Record<KanbanColumn, KanbanTask[]>
     rawContent: string
     parsedAt: number
     parseError?: boolean
   }
   ```

2. 实现 `parseTasksMd(workspacePath)`：
   - 读取 `tasks.md`（通过 `FileManager.readFile()`）
   - 按 `## 标题` 分割列（匹配 `## (待开始|进行中|已完成)`）
   - 解析每个 `- [ ]` / `- [x]` 行为 `KanbanTask`
   - 正则提取 HTML 注释：`<!--\s*task-id:\s*(\S+)(?:\s+(ai-linked))?\s*-->`
   - 正则提取 `<!-- ai-suggested -->` 标记
   - 解析 `  - key: value` 格式元数据行
   - 解析失败时设置 `parseError = true`，UI 降级为只读模式

3. 实现 `updateTaskStatus(taskId, newStatus)`：
   - 重新解析获取最新内容
   - 定位目标任务行，修改 `- [ ]` / `- [x]` 标记
   - 移动任务行到目标列 section
   - 通过 `FileManager.writeFile()` 原子写入
   - 触发 `kanban.task-status-changed` 事件

4. 实现 `createTask(task)`：
   - 生成 `task-id`（`tsk_${randomBytes(3).toString('hex')}`）
   - 构造 Markdown 行并追加元数据行
   - 追加到目标列 section（默认"待开始"）
   - 触发 `kanban.task-created` 事件

5. 实现 `dispatchToAI(taskId)`：
   - 从 KanbanModel 查找任务
   - 调用 `ProgressLedger.declare({ title, kanbanTaskId: taskId })`
   - 调用 `TaskStateMachine.create()` 初始化状态机
   - 在 tasks.md 追加 `ai-linked` 标记
   - 触发 `kanban.task-dispatched` 事件

6. 实现 `promoteFromLedger(ledgerTaskId)`：
   - 从 ProgressLedger 获取任务详情
   - 在 tasks.md "进行中"列追加新条目
   - 调用 `ProgressLedger.update(ledgerTaskId, { kanbanTaskId })` 建立反向绑定
   - 触发 `kanban.task-created` 事件

7. 实现 AI 完成自动回写：
   - 订阅 `progress.task-completed` 事件
   - 检查 `task.kanbanTaskId` 是否存在且 `isAiLinked`
   - 自动调用 `updateTaskStatus(kanbanTaskId, '已完成')`
   - 触发 `kanban.task-completed`（`completedBy: 'ai-auto'`）

8. 实现 AI 失败标记：
   - 订阅 `progress.task-failed` 事件
   - 检查 `task.kanbanTaskId` 是否存在
   - 不自动回写 tasks.md，仅触发 UI 状态更新（失败警告图标）

**验证：** 单元测试覆盖解析（标准格式/多种缩进/ai-linked/空文件/损坏格式降级）、写入（创建/状态更新/派发标记/原子写入）、状态映射（6 种转换场景）。

### 步骤 4：实现 TaskStatusTracker

**文件：** `src/main/services/kanban/task-status-tracker.ts`（新建）

1. 定义启发式信号接口：
   ```typescript
   interface StatusSignal {
     type: 'file-created' | 'file-growth' | 'commit-keyword' | 'file-frozen' | 'stale-risk'
     weight: number
     description: string
   }

   interface StatusSuggestion {
     taskId: string
     currentStatus: KanbanColumn
     suggestedStatus: KanbanColumn
     confidence: number
     signals: StatusSignal[]
     reasoning: string
   }
   ```

2. 实现 5 个信号检测器（纯函数，不调用 LLM）：
   - `detectFileCreated(filePath)` → 文件首次出现 +0.3
   - `detectFileGrowth(filePath, diff)` → 内容增量 > 200 字 +0.2
   - `detectCommitKeyword(message)` → 匹配 `/(完成|done|finish|closed)/i` +0.5
   - `detectFileFrozen(content)` → 匹配 `frozen|published` 标记 +0.4
   - `detectStaleRisk(task, now)` → 24h 无变更 + deadline 临近 +0.3

3. 实现 `evaluate(taskId, fileEvent)`：
   - 从 KanbanModel 查找任务的 `relatedFiles`
   - 运行所有匹配信号检测器，累加权重
   - 置信度 ≥ 0.6 返回 `StatusSuggestion`
   - 风险信号单独触发 `kanban.task-risk-detected` 事件

4. 实现 dismissal 管理：
   - 内存 `Map<taskId, { suggestedStatus, dismissedAt }>`
   - `isDismissed(taskId, suggestedStatus)` — 24h 冷却检查
   - `recordDismissal(taskId, suggestedStatus)` — 记录忽略

5. 订阅 `file.updated` 事件：
   - 匹配文件路径与所有任务的 `relatedFiles`
   - 命中时调用 `evaluate()`
   - 返回的 `StatusSuggestion` 通过 NotificationCenter 推送

**验证：** 单元测试覆盖各信号权重、置信度阈值计算、dismissal 24h 冷却、多信号累加场景。

### 步骤 5：创建 task-extractor Sub-agent Prompt

**文件：** `resources/prompts/agents/task-extractor.md`（新建）

1. YAML frontmatter（遵循 `memory-curator.md` 格式）：
   ```yaml
   ---
   id: task-extractor
   version: 1.0.0
   name: 任务提取器
   description: 从对话中识别可执行任务并结构化输出
   model: claude-haiku
   allowed_tools:
     - read-file
     - search
   context:
     inherit_memory: false
     inherit_trace: false
     inherit_workspace_boundary: true
   max_turns: 3
   max_tokens: 2000
   output_schema:
     type: array
     items:
       type: object
       required:
         - title
         - reason
       properties:
         title:
           type: string
         assignee:
           type: string
         priority:
           type: string
           enum: [P0, P1, P2]
         deadline:
           type: string
         relatedFiles:
           type: array
           items:
             type: string
         reason:
           type: string
         sourceQuote:
           type: string
   ---
   ```

2. Prompt 正文核心约束：
   - 输入：最近 N 轮对话 + 当前 tasks.md 内容（去重用）
   - 仅提取**明确表述的行动项**，不臆测
   - 每个建议必须包含 `sourceQuote`（引用具体对话片段）
   - 对话中无可执行项时返回空数组 `[]`
   - 去重：已存在于 tasks.md 的任务不重复提取

**验证：** 手动测试 3 种场景（有可执行项对话、无可执行项对话、与 tasks.md 重复的任务）。

### 步骤 6：实现 Kanban IPC Handler

**文件：** `src/main/ipc/handlers/kanban.ts`（新建）

1. 新增 IPC 通道常量到 `src/shared/types.ts` 的 `IPC_CHANNELS`：
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

2. 实现 handler（继承 `IpcHandler`，namespace `'kanban'`）：
   - `kanban:parse` → `KanbanService.parseTasksMd()`
   - `kanban:create` → `KanbanService.createTask()`
   - `kanban:updateStatus` → `KanbanService.updateTaskStatus()`
   - `kanban:dispatchAI` → `KanbanService.dispatchToAI()`
   - `kanban:promote` → `KanbanService.promoteFromLedger()`
   - `kanban:aiSidebar` → `ProgressLedger.getSnapshot()` 过滤无 kanbanTaskId 的活跃任务
   - `kanban:dismissSuggestion` → `TaskStatusTracker.recordDismissal()`
   - `kanban:acceptSuggestion` → `KanbanService.updateTaskStatus()` + 标记来源为 ai-auto

3. 在 `src/preload/index.ts` 新增 `kanban` 命名空间，暴露上述通道。

4. 在 `ALLOWED_CHANNELS` 数组中追加新通道名。

**验证：** IPC 通道类型安全（`IPCChannelMap` 正确映射 params/return）。

### 步骤 7：实现 KanbanBoard UI 组件

**文件：** `src/renderer/components/kanban/KanbanBoard.tsx`（新建）

1. 三列布局组件：
   - 使用 `@dnd-kit/core` 实现拖拽（需检查是否已有依赖，如无则新增）
   - 三列：待开始（灰色）、进行中（蓝色）、已完成（绿色）
   - 每列显示任务数量和任务卡片列表
   - 列头可折叠

2. 任务卡片组件 `KanbanTaskCard`：
   - 显示标题、负责人头像、优先级色条（P0 红色/P1 橙色/P2 蓝色）
   - 截止日期显示（逾期红色高亮）
   - AI 图标（`isAiLinked` 时显示机器人图标）
   - AI 建议标记（`isAiSuggested` 时显示闪光图标）
   - 点击展开详情面板

3. 任务详情面板 `KanbanTaskDetail`：
   - 右侧抽屉式面板
   - 显示完整元数据（可内联编辑）
   - AI 链接任务显示 AI 执行进度条
   - "派发给 AI"按钮（非 ai-linked 任务显示）
   - 保存按钮调用 `kanban:updateStatus` IPC

4. 任务创建表单 `KanbanCreateForm`：
   - 弹出对话框
   - 字段：标题（必填）、负责人、优先级下拉、截止日期选择器、关联文件（可多选）
   - 提交调用 `kanban:create` IPC

**文件：** `src/renderer/components/kanban/AiTaskSidebar.tsx`（新建）

5. AI 工作中侧边栏：
   - 右侧固定面板，可折叠
   - 列出 ProgressLedger 中无 `kanbanTaskId` 的活跃任务
   - 每个条目显示：标题、状态（queued/running/paused/failed）、运行时长
   - "提升为正式任务"按钮（调用 `kanban:promote` IPC）
   - 只读，不可编辑

**验证：** 看板三列渲染正确、拖拽流畅、任务卡片信息完整、详情面板可编辑并保存、AI 侧边栏正确展示。

### 步骤 8：实现 kanbanStore + 通知规则扩展 + L7 扩展

**文件：** `src/renderer/store/kanbanStore.ts`（新建）

1. Zustand store 定义：
   ```typescript
   interface KanbanState {
     model: KanbanModel | null
     isLoading: boolean
     parseError: boolean
     selectedTaskId: string | null
     aiSidebarOpen: boolean

     fetchBoard: () => Promise<void>
     createTask: (task: CreateTaskInput) => Promise<void>
     updateStatus: (taskId: string, status: KanbanColumn) => Promise<void>
     dispatchToAI: (taskId: string) => Promise<void>
     promoteFromLedger: (ledgerTaskId: string) => Promise<void>
     selectTask: (taskId: string | null) => void
     toggleAiSidebar: () => void
   }
   ```

2. 实现各 action：
   - `fetchBoard` 调用 `kanban:parse` IPC
   - 订阅 `kanban.onTaskCreated`、`kanban.onStatusChanged` IPC push 事件自动刷新
   - 订阅 `file.onNotifyChange` 监听 tasks.md 外部修改

**文件：** `src/main/services/notifications/notification-rules.ts`（修改）

3. 在 `createBuiltinRules(deps)` 中追加 2 条规则：

   **规则 `kanban-status-suggestion`：**
   - eventType: `kanban.task-status-changed`
   - condition: `event.payload.trigger === 'ai-auto'`
   - build: 返回 `{ title: 'AI 建议更新任务状态', body: reasoning, priority: 'normal', ... }`

   **规则 `kanban-task-risk`：**
   - eventType: `kanban.task-risk-detected`
   - condition: 总是触发
   - build: 返回 `{ title: '任务风险预警', body: signals 描述, priority: 'high', ... }`

**文件：** `src/main/services/context-engine/collab-context-provider.ts`（修改）

4. 扩展 `collect()` 方法：
   - 构造函数新增 `kanbanService?: KanbanService` 可选依赖
   - 在 `collect()` 中，当 `shouldInject()` 返回 true 或消息包含任务关键词时：
     - 调用 `kanbanService.parseTasksMd()` 获取任务概览
     - 生成任务概览段内容
     - 裁剪优先级：任务概览 < 最近活动 < 在线成员
   - `kanbanService` 为可选——未注入时跳过任务概览段

**验证：** kanbanStore 状态管理正确、通知规则触发正确、L7 任务概览注入正确且不超预算。

### 步骤 9：对接 task-decomposition 触发器 + 单元测试

**文件：** `src/main/services/proactive-engine/triggers/task-decomposition.ts`（修改）

1. 将 Sprint 5 的 `task-decomposition` 占位触发器的 `buildDraft()` 实现连接到 `task-extractor`：
   - `condition()` 保持现有逻辑不变
   - `buildDraft()` 返回 `{ triggerId: 'task-decomposition', priority: 'normal', context: { conversationSnippet: recentText }, previewTitle: '检测到可能的待办任务' }`
   - 生成的 SuggestionToast 的 accept action 触发 `task-extractor` Sub-agent 执行
   - Sub-agent 返回的任务建议通过 NotificationCenter 推送

2. 对接 Sprint 5 偏好学习：
   - 用户 dismiss 建议 → `PreferenceLearner.recordAction('task-decomposition', 'dismiss')`
   - 用户 accept 建议 → `PreferenceLearner.recordAction('task-decomposition', 'accept')`
   - 冷却期自适应生效

**测试文件：** `tests/main/services/kanban/`（新建目录）

3. `kanban-service.test.ts`：
   - 解析标准格式 tasks.md
   - 解析带 ai-linked 和 ai-suggested 标记
   - 解析空文件
   - 解析损坏格式（降级为只读）
   - 创建任务（验证 task-id 生成和 Markdown 格式）
   - 更新状态（验证列间移动和 checkbox 标记）
   - 派发给 AI（验证 ProgressLedger declare + TaskStateMachine create）
   - AI 完成自动回写
   - AI 失败标记（不自动回写）
   - 状态映射 6 种转换场景

4. `task-status-tracker.test.ts`：
   - 各信号权重正确性
   - 多信号累加置信度
   - 置信度阈值（0.6 触发、0.9 快速采纳）
   - dismissal 24h 冷却
   - 风险信号独立触发

5. `kanban-ipc.test.ts`：
   - 各 IPC 通道正确调用 KanbanService 方法
   - 错误处理和 IPCResponse 包装

**覆盖率目标：** KanbanService ≥ 90%、TaskStatusTracker ≥ 80%、IPC handler ≥ 80%

## 现有代码基础

| 已有模块 | 文件路径 | 本任务使用方式 |
|---------|---------|-------------|
| FileManager | `src/main/services/file-manager.ts` | KanbanService 读写 tasks.md |
| ProgressLedger | `src/main/services/progress/progress-ledger.ts` | `declare({ kanbanTaskId })` 创建 AI 侧任务 |
| TaskRecord / DeclareInput | `src/main/services/progress/types.ts` | 新增可选 `kanbanTaskId` 字段（C9） |
| TaskStateMachine | `src/main/services/harness/task-state-machine.ts` | `create()` 初始化 AI 任务状态机 |
| AppEventBus | `src/main/services/event-bus.ts` | 发射 `kanban.*` 事件，订阅 `progress.task-*` / `file.updated` |
| SibyllaEventType | `src/main/services/event-bus-types.ts` | 追加 5 个 `kanban.*` 事件类型 |
| NotificationRule | `src/main/services/notifications/notification-rules.ts` | 追加 2 条看板相关规则（C10） |
| NotificationEngine | `src/main/services/notifications/notification-engine.ts` | TaskStatusTracker 推送状态建议 |
| SubAgentRegistry | `src/main/services/sub-agent/SubAgentRegistry.ts` | 自动发现 `task-extractor.md`，无需代码注册 |
| SubAgentExecutor | `src/main/services/sub-agent/SubAgentExecutor.ts` | 执行 task-extractor Sub-agent |
| ProactiveEngine | `src/main/services/proactive-engine/index.ts` | `task-decomposition` 触发器 handler 对接 |
| Trigger (task-decomposition) | `src/main/services/proactive-engine/triggers/task-decomposition.ts` | 将占位 buildDraft() 连接到 task-extractor |
| CollabContextProvider | `src/main/services/context-engine/collab-context-provider.ts` | L7 新增任务概览段（C7） |
| V2_BUDGET_WEIGHTS | `src/main/services/context-engine/types-v2.ts` | collab 层 5% 预算内裁剪 |
| IpcHandler | `src/main/ipc/handler.ts` | 新建 kanban handler 继承此类 |
| IPC_CHANNELS | `src/shared/types.ts` | 追加 kanban:* 通道常量 |
| preload/index.ts | `src/preload/index.ts` | 新增 kanban 命名空间 |
| GitAbstraction | `src/main/services/git-abstraction.ts` | TaskStatusTracker 获取 commit 消息 |
| PrivacyFilter | `src/main/services/presence/privacy-filter.ts` | AI 侧边栏过滤 personal/ 路径 |

**完全缺失、需新建的模块：**

| 模块 | 说明 |
|------|------|
| `services/kanban/kanban-service.ts` | 核心看板服务（tasks.md 解析/写入/双向同步） |
| `services/kanban/task-status-tracker.ts` | 文件变更启发式状态追踪 |
| `resources/prompts/agents/task-extractor.md` | 任务提取 Sub-agent prompt |
| `ipc/handlers/kanban.ts` | 看板 IPC handler |
| `renderer/store/kanbanStore.ts` | 看板 Zustand store |
| `renderer/components/kanban/KanbanBoard.tsx` | 看板三列拖拽组件 |
| `renderer/components/kanban/KanbanTaskCard.tsx` | 任务卡片组件 |
| `renderer/components/kanban/KanbanTaskDetail.tsx` | 任务详情面板 |
| `renderer/components/kanban/KanbanCreateForm.tsx` | 任务创建表单 |
| `renderer/components/kanban/AiTaskSidebar.tsx` | AI 工作中侧边栏 |
| `tests/main/services/kanban/` | 单元测试目录 |

## 新增 IPC 通道

| IPC 通道 | 方向 | 说明 |
|---------|------|------|
| `kanban:parse` | Renderer → Main | 解析 tasks.md 返回 KanbanModel |
| `kanban:create` | Renderer → Main | 创建新任务追加到 tasks.md |
| `kanban:updateStatus` | Renderer → Main | 更新任务状态（拖拽/确认） |
| `kanban:dispatchAI` | Renderer → Main | 派发任务给 AI 执行 |
| `kanban:promote` | Renderer → Main | 提升 ProgressLedger 任务到 tasks.md |
| `kanban:aiSidebar` | Renderer → Main | 获取 AI 侧边栏活跃任务列表 |
| `kanban:dismissSuggestion` | Renderer → Main | 忽略 AI 状态建议 |
| `kanban:acceptSuggestion` | Renderer → Main | 接受 AI 状态建议 |

注：复用现有 `event:*` 通道推送看板事件变更到渲染进程。

## 涉及的现有文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/main/services/progress/types.ts` | 扩展 | TaskRecord/DeclareInput 新增 `kanbanTaskId?` |
| `src/main/services/event-bus-types.ts` | 扩展 | 新增 5 个 kanban.* 事件类型 + payload |
| `src/main/services/notifications/notification-rules.ts` | 扩展 | 新增 2 条看板通知规则 |
| `src/main/services/context-engine/collab-context-provider.ts` | 扩展 | collect() 新增任务概览段 |
| `src/main/services/proactive-engine/triggers/task-decomposition.ts` | 修改 | buildDraft() 对接 task-extractor |
| `src/shared/types.ts` | 扩展 | IPC_CHANNELS 新增 kanban:* 常量 |
| `src/preload/index.ts` | 扩展 | 新增 kanban 命名空间 |

**不修改的文件：**

- `src/main/services/progress/progress-ledger.ts` — declare() 自动传递新增可选字段
- `src/main/services/harness/task-state-machine.ts` — 接口不变
- `src/main/services/event-bus.ts` — 仅新增事件类型，不改发射逻辑
- `src/main/services/sub-agent/SubAgentRegistry.ts` — 自动发现机制已支持
- `src/main/services/notifications/notification-engine.ts` — 规则驱动，无需改引擎

---

**创建时间：** 2026-05-01
**最后更新：** 2026-05-01
**更新记录：**
- 2026-05-01 — 创建任务文档（含完整技术执行路径 9 步）
