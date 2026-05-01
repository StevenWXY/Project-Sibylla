# PHASE2-TASK012: AI 日报周报与工作产出分析 — 实施计划

> 任务来源：[specs/tasks/phase2/phase2-task012_report-productivity.md](../../specs/tasks/phase2/phase2-task012_report-productivity.md)
> 创建日期：2026-05-01
> 最后更新：2026-05-01

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK012 |
| **任务标题** | AI 日报周报与工作产出分析 |
| **所属阶段** | Phase 2 - 项目管理闭环 (Sprint 6) |
| **优先级** | P0 (日报周报) / P1 (工作产出分析) |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | TASK010(看板) + TASK001(事件总线) + TASK004(WikiLinks) + TASK006(通知中心) + TASK007(Presence/PrivacyFilter) + Sprint 3.2~3.5 + Sprint 2(GitAbstraction) |

### 1.1 目标

构建 Sprint 6 的 AI 自动报告与工作产出分析能力——通过 Sprint 3.5 Workflow 框架自动触发每日个人日报和每周团队周报，通过 `ProductivityAnalyzer` 从已有数据源聚合四维度工作产出指标，为管理员 Dashboard（TASK013）提供数据基础。

### 1.2 核心设计约束（不可违反）

1. **严格不新建数据库**——所有指标从已有数据源聚合（tasks.md、GitAbstraction、EventLogStore、WikiLinksStore）
2. **报告生成完全走 Workflow 框架**——不新建生成器，使用 `skill:` / `sub_agent:` / `action:` step 格式（C5/D4）
3. **晨间与傍晚报告共存**——现有 `daily-summary-flow.yaml`（9:00 轻量 diff 回顾）与本任务新增的 `daily-personal-report.yaml`（18:00 多源聚合）分工不同（C8）
4. **隐私在生成阶段过滤**——团队周报通过 `team-report-curator` Sub-agent 在生成时应用 PrivacyFilter，而非渲染时
5. **ProductivityAnalyzer 纯本地实现**——不依赖云端 API，跨设备聚合为未来扩展点（C11/D7）
6. **60 秒结果缓存**——避免频繁重复计算

### 1.3 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| ProductivityAnalyzer | `src/main/services/productivity/productivity-analyzer.ts` | 四维度工作产出分析核心服务 |
| Productivity 类型 | `src/main/services/productivity/types.ts` | AnalysisPeriod / DimensionScore / ProductivityReport |
| daily-report Skill | `resources/skills/daily-report/_index.md` | 日报/周报 Skill prompt 实装 |
| team-report-curator | `resources/prompts/agents/team-report-curator.md` | 团队报告策展 Sub-agent |
| daily-personal-report | `resources/workflows/daily-personal-report.yaml` | 每日 18:00 个人日报 Workflow |
| weekly-team-report | `resources/workflows/weekly-team-report.yaml` | 每周日 17:00 团队周报 Workflow |
| Report IPC | `src/main/ipc/handlers/report.ts` | 报告 IPC handler |
| Productivity IPC | `src/main/ipc/handlers/productivity.ts` | 产出分析 IPC handler |
| ReportStore | `src/renderer/store/reportStore.ts` | 报告 Zustand store |
| ProductivityStore | `src/renderer/store/productivityStore.ts` | 产出分析 Zustand store |
| ReportViewer | `src/renderer/components/report/ReportViewer.tsx` | 报告格式化查看组件 |
| ProductivityPanel | `src/renderer/components/productivity/ProductivityPanel.tsx` | 产出分析可视化面板 |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；文件即真相；AI 建议人类决策；原子写入先临时后替换；personal/ 隔离 | 全局约束 |
| `specs/design/architecture.md` | 进程通信架构(§3.2)、IPC 模式 | IPC 设计 |
| `specs/design/data-and-api.md` | Workspace 文件结构（personal/、docs/） | 报告路径规划 |
| `specs/design/ui-ux-design.md` | 色彩体系(#6366F1 主色)、组件规范 | UI 组件设计 |
| `specs/design/workflow-system.md` | YAML 规范、Step 类型、触发器、模板渲染 | Workflow YAML 编写 |
| `specs/design/skill-system.md` | _index.md 格式、三源加载、scope 作用域 | daily-report Skill 编写 |
| `specs/design/sub-agent-system.md` | Agent 定义格式、output_schema、工具权限 | team-report-curator 编写 |
| `specs/design/testing-and-security.md` | 测试覆盖率≥80%、隐私保护 | 测试与安全 |
| `specs/requirements/phase2/sprint6-task-management.md` | 需求 6.5(AI 日报周报)、6.6(工作产出分析)、§2.3(数据源)、§2.4(命名空间) | 验收标准 |
| `specs/tasks/phase2/phase2-task012_report-productivity.md` | 9 步执行路径、全部验收标准 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `electron-ipc-patterns` | Report/Productivity IPC 设计；M→R 推送；类型安全通道映射 | `report.ts` + `productivity.ts` + `preload/index.ts` |
| `zustand-state-management` | reportStore + productivityStore 设计；selector 性能优化 | `src/renderer/store/reportStore.ts` + `productivityStore.ts` |
| `typescript-strict-mode` | ProductivityAnalyzer 类型安全；泛型约束 | 全部 TS 文件 |

### 2.3 前置代码依赖

| 模块 | 实际文件路径 | 复用方式 |
|------|------------|---------|
| `SibyllaEventType` | `sibylla-desktop/src/main/services/event-bus-types.ts:5-68` | 追加 `report.generated` 事件类型 |
| `EventPayloadMap` | `sibylla-desktop/src/main/services/event-bus-types.ts:83-147` | 追加 `report.generated` payload 类型 |
| `AppEventBus` | `sibylla-desktop/src/main/services/event-bus.ts` | 发射 `report.generated` 事件 |
| `KanbanService` | `sibylla-desktop/src/main/services/kanban/kanban-service.ts:71` | `parseTasksMd()` 提供任务完成率数据源 |
| `GitAbstraction` | `sibylla-desktop/src/main/services/git-abstraction.ts` | `getHistory()` :829 + `getCommitDiff()` :1047 |
| `EventLogStore` | `sibylla-desktop/src/main/services/event-log-store.ts:57` | `read(month)` 评论事件流 |
| `WikiLinksStore` | `sibylla-desktop/src/main/services/wiki-links/wiki-links-store.ts:52` | `getLinkCount()` 被引用次数 |
| `PrivacyFilter` | `sibylla-desktop/src/main/services/presence/privacy-filter.ts:11-85` | 报告隐私过滤 |
| `FileManager` | `sibylla-desktop/src/main/services/file-manager.ts:423` | `writeFile()` 报告文件写入 |
| `NotificationEngine` | `sibylla-desktop/src/main/services/notifications/notification-engine.ts:22-257` | 报告生成通知推送 |
| `WorkspaceMemberDirectory` | Sprint 2 成员管理 | 成员列表查询 |
| `SubAgentRegistry` | `sibylla-desktop/src/main/services/sub-agent/SubAgentRegistry.ts` | 自动发现 team-report-curator |
| `SubAgentExecutor` | `sibylla-desktop/src/main/services/sub-agent/SubAgentExecutor.ts` | 执行 team-report-curator |
| `SkillEngine` | Sprint 3.5 | 执行 daily-report Skill |
| `WorkflowScheduler` | Sprint 3.5 | 触发 daily-personal-report / weekly-team-report |
| `WorkflowExecutor` | Sprint 3.5 | 执行 Workflow 步骤 |
| `WorkflowParser` | Sprint 3.5 | 解析 YAML 格式校验 |
| `doc-summarizer` | `resources/prompts/agents/doc-summarizer.md` | 日报 Step 1 数据收集（已有） |
| `IpcHandler` | `sibylla-desktop/src/main/ipc/handler.ts:29-218` | 新建 handler 继承此类 |
| `IPC_CHANNELS` | `sibylla-desktop/src/shared/types.ts:88-578` | 追加 report:* / productivity:* 常量 |
| `preload/index.ts` | `sibylla-desktop/src/preload/index.ts:187-670` | 新增 report + productivity 命名空间 |
| `daily-summary-flow.yaml` | `resources/workflows/daily-summary-flow.yaml` | 共存参考，不修改 |

### 2.4 IPC 通道清单（本任务新增）

| 通道常量 | 通道名 | 方向 | 用途 |
|---------|--------|------|------|
| `REPORT_GENERATE` | `report:generate` | R→M | 手动触发报告生成（调 WorkflowScheduler） |
| `REPORT_LIST` | `report:list` | R→M | 查询报告文件列表（扫描 personal/ + docs/） |
| `REPORT_GET` | `report:get` | R→M | 获取报告文件内容 |
| `PRODUCTIVITY_ANALYZE` | `productivity:analyze` | R→M | 执行工作产出分析 |
| `PRODUCTIVITY_QUERY` | `productivity:query` | R→M | 查询缓存的产出数据（不触发计算） |

---

## 三、现有代码盘点与差距分析

### 3.1 事件类型（需扩展 ⚠️）

`event-bus-types.ts` 当前包含 62+ 个事件类型。已有相关类型：`kanban.task-*`（TASK010）、`task.created/completed`（TaskStateMachine）、`notification.created`、`file.updated`。

**缺口：** 缺少 `report.generated` 事件类型和对应的 `EventPayloadMap` 条目。

### 3.2 数据源服务（已就绪 ✅）

| 服务 | 方法 | 状态 | 说明 |
|------|------|------|------|
| `KanbanService` | `parseTasksMd(workspacePath)` | ✅ TASK010 已实现 | 返回 `KanbanModel`，含 tasks 数组与状态 |
| `GitAbstraction` | `getHistory(options?)` | ✅ 已实现 | 返回 `CommitInfo[]`，含 author/oid/message |
| `GitAbstraction` | `getCommitDiff(oid)` | ✅ 已实现 | 返回 `FileDiff[]`，含文件路径与变更行数 |
| `EventLogStore` | `read(month)` | ✅ 已实现 | 返回 `SibyllaEvent[]`，按月读取 |
| `WikiLinksStore` | `getLinkCount(filePath)` | ✅ 已实现 | 返回 `LinkCount { incoming, outgoing }` |
| `PrivacyFilter` | `filterPeerStateForViewer()` | ✅ 已实现 | 角色过滤，非 admin 匿名化 |
| `FileManager` | `writeFile(relativePath, content)` | ✅ 已实现 | 原子写入，路径校验 |
| `NotificationEngine` | `registerRules()` | ✅ 已实现 | 规则驱动通知推送 |

### 3.3 Workflow 框架（已就绪 ✅）

- `WorkflowScheduler`：支持 cron + manual 触发
- `WorkflowExecutor`：支持 skill/sub_agent/action 三种 step 类型
- `WorkflowParser`：YAML 格式校验与模板渲染
- 现有 `daily-summary-flow.yaml`（9:00 晨间轻量回顾）确认共存

**关键约束确认（C5）：** Workflow step 格式使用 `sub_agent:` / `skill:` / `action:` 字段，与 `daily-summary-flow.yaml` 一致。

### 3.4 Skill / Sub-agent 框架（已就绪 ✅）

- `SkillEngine`：支持 prompt 类型 Skill 执行
- `SubAgentExecutor`：支持独立对话循环 + 结构化输出
- `SubAgentRegistry`：`resources/prompts/agents/` 自动发现
- `SkillRegistry`：`resources/skills/` 三源扫描

**缺口：** `daily-report` Skill 已在 Sprint 3.5 技能清单中注册 id，但 `_index.md` 文件未实装（占位状态）。

### 3.5 IPC 通道与 Preload（需扩展 ⚠️）

- `shared/types.ts` IPC_CHANNELS 缺少 5 个 report/productivity 通道常量
- `preload/index.ts` ElectronAPI 缺少 `report` 和 `productivity` 命名空间
- `ALLOWED_CHANNELS` 列表需追加新通道名

### 3.6 完全缺失的文件

| 文件 | 说明 |
|------|------|
| `src/main/services/productivity/types.ts` | ProductivityAnalyzer 类型定义 |
| `src/main/services/productivity/productivity-analyzer.ts` | 四维度工作产出分析核心服务 |
| `resources/skills/daily-report/_index.md` | 日报/周报 Skill prompt 实装 |
| `resources/prompts/agents/team-report-curator.md` | 团队报告策展 Sub-agent |
| `resources/workflows/daily-personal-report.yaml` | 每日个人日报 Workflow |
| `resources/workflows/weekly-team-report.yaml` | 每周团队周报 Workflow |
| `src/main/ipc/handlers/report.ts` | 报告 IPC handler |
| `src/main/ipc/handlers/productivity.ts` | 产出分析 IPC handler |
| `src/renderer/store/reportStore.ts` | 报告 Zustand store |
| `src/renderer/store/productivityStore.ts` | 产出分析 Zustand store |
| `src/renderer/components/report/ReportViewer.tsx` | 报告查看组件 |
| `src/renderer/components/productivity/ProductivityPanel.tsx` | 产出分析面板 |
| `tests/main/services/productivity/` | 单元测试目录 |

---

## 四、分步实施计划

### 阶段 A：类型扩展与事件注册（Step 1） — 预计 0.3 天

#### A1：新增 report.generated 事件类型

**文件：** `sibylla-desktop/src/main/services/event-bus-types.ts`（修改）

1. 在 `SibyllaEventType` 联合类型（`decision.outcome-updated` 之后）追加 `| 'report.generated'`

2. 在 `EventPayloadMap` 中追加：

```typescript
'report.generated': { reportType: 'daily-personal' | 'weekly-team'; filePath: string; date: string }
```

**零破坏保证：** 新增事件类型不影响现有事件订阅。

#### A2：创建 Productivity 类型定义

**文件：** `sibylla-desktop/src/main/services/productivity/types.ts`（新建）

核心类型：

| 类型 | 用途 |
|------|------|
| `AnalysisPeriod` | 分析周期：`'week' \| 'month' \| 'quarter'` |
| `DimensionScore` | 单维度评分：raw / normalized / weight / label / isNA? |
| `ProductivityReport` | 完整报告：period + memberId + viewerId + 4 维度 + overall + dataSufficient + isAnonymized |
| `AnalyzeOptions` | analyze() 入参：period + memberId? + viewerId |
| `CacheEntry` | 缓存条目：report + cachedAt |

常量导出：

| 常量 | 值 | 用途 |
|------|------|------|
| `PRIORITY_WEIGHTS` | `{ P0: 3, P1: 2, P2: 1 }` | 任务完成率加权 |
| `FILE_TYPE_WEIGHTS` | `{ 'docs/': 1.5, 'personal/': 0.5 }` | 文档贡献度加权 |
| `DEFAULT_FILE_WEIGHT` | `1.0` | 默认文件权重 |
| `CACHE_TTL_MS` | `60000` | 缓存过期时间 |
| `DATA_SUFFICIENCY_DAYS` | `7` | 数据充足性阈值 |
| `DEFAULT_DIMENSION_WEIGHT` | `0.25` | 四维度等权 |

**验证：** TypeScript 编译通过。

---

### 阶段 B：ProductivityAnalyzer 核心实现（Step 2） — 预计 1.5 天

#### B1：实现 ProductivityAnalyzer

**文件：** `sibylla-desktop/src/main/services/productivity/productivity-analyzer.ts`（新建）

**依赖注入（6 个已有服务 + workspaceRoot + logger）：**

```typescript
constructor(
  private readonly kanbanService: KanbanService,
  private readonly gitAbstraction: GitAbstraction,
  private readonly eventLogStore: EventLogStore,
  private readonly wikiLinksStore: WikiLinksStore,
  private readonly memberDirectory: WorkspaceMemberDirectory,
  private readonly privacyFilter: PrivacyFilter,
  private readonly workspaceRoot: string,
  private readonly logger: Logger,
)
```

**核心方法 `analyze(opts: AnalyzeOptions): Promise<ProductivityReport>`：**

```
1. 构建 cacheKey = `${period}:${memberId || 'all'}:${viewerId}`
2. 检查缓存 → 命中且未过期（cachedAt + CACHE_TTL_MS > Date.now()）→ 直接返回
3. 计算时间范围 dateRange（period → { since, until } 日期对象）
4. 检查数据充足性：EventLogStore 最早记录距今 vs DATA_SUFFICIENCY_DAYS
   - 不足时设置 dataSufficient=false, insufficientNotice="数据积累不足 7 天，以下指标仅供参考"
5. 并行调用 4 个维度计算方法
6. 应用隐私过滤（基于 viewerId vs memberId + memberDirectory 查角色）
7. 计算综合分 = Σ(dim.normalized × DEFAULT_DIMENSION_WEIGHT)
8. 缓存结果到 this.cache
9. 返回 ProductivityReport
```

**维度 1 `calculateTaskCompletion(memberId, dateRange)`：**

```
数据源: kanbanService.parseTasksMd(workspaceRoot)
计算:
  - 过滤 assignee === memberId 的任务
  - Σ(已完成任务 PRIORITY_WEIGHTS[priority]) / Σ(所有分配任务 PRIORITY_WEIGHTS[priority])
归一化: raw / maxPossible
边界: 无分配任务 → { isNA: true, normalized: 0 }
```

**维度 2 `calculateDocContribution(memberId, dateRange)`：**

```
数据源: gitAbstraction.getHistory({ since, until }) → getCommitDiff(oid)
计算:
  - 按 author 过滤 memberId 的 commits
  - Σ(FILE_TYPE_WEIGHTS[prefix] × fileDiff.totalChanges)
  - 未匹配前缀的使用 DEFAULT_FILE_WEIGHT
归一化: raw / teamMax（遍历全体成员计算最高分）
边界: 无 commit → { isNA: true, normalized: 0 }
```

**维度 3 `calculateCollabResponsiveness(memberId, dateRange)`：**

```
数据源: eventLogStore.read(months) → 过滤评论相关事件
计算:
  - 构建 comment→reply 时延对
  - 计算 median delay (P50)
归一化: 1 / (1 + medianDelayHours)
边界: 无评论事件 → { isNA: true, normalized: 0 }
```

**维度 4 `calculateKnowledgeContribution(memberId, dateRange)`：**

```
数据源: wikiLinksStore.getLinkCount(path) + gitAbstraction (确定文件作者)
计算:
  - 遍历 memberId 创建的文件
  - Σ(getLinkCount(path).incoming)，排除自引用
归一化: raw / teamMax
边界: 无被引用文档 → { isNA: true, normalized: 0 }
```

**隐私过滤 `applyPrivacyFilter(report, viewerId, memberId)`：**

| 场景 | 处理 |
|------|------|
| `viewerId === memberId` | 完整细节，`isAnonymized=false` |
| viewer 非 admin 且非 self | 匿名化：details 清空，成员名→"团队成员"，`isAnonymized=true` |
| viewer 是 admin | 完整细节 + "管理员视图"标记，`isAnonymized=false` |

**缓存逻辑：**

```
结构: private cache = new Map<string, CacheEntry>()
key: `${period}:${memberId || 'all'}:${viewerId}`
命中: cachedAt + CACHE_TTL_MS > Date.now()
失效: 订阅 kanban.task-status-changed / file.updated 事件清除全部缓存
```

**验证：** 单元测试覆盖四维度计算（归一化/加权/边界）、缓存命中/失效/TTL、隐私过滤、数据不足提示。

---

### 阶段 C：Skill 与 Sub-agent Prompt（Step 3-4） — 预计 0.5 天

#### C1：创建 daily-report Skill Prompt

**文件：** `sibylla-desktop/resources/skills/daily-report/_index.md`（新建）

Frontmatter 遵循 `specs/design/skill-system.md` V2 格式，关键字段：`id: daily-report`, `scope: public`, `triggers: [{ slash: /daily-report }, { pattern: "生成(日报|周报)" }]`。

Prompt 正文定义两种输出模式：

**mode: daily-personal — 5 个 section：**

1. `## 工作摘要` — 1-2 句话总结今日工作重点
2. `## 任务进展` — 列出有变化的任务（新增/状态变更/完成）
3. `## 提交记录` — 今日 commit 列表含简要说明
4. `## 明日计划` — 从待开始和进行中任务推断
5. `## 阻塞项` — 标记为阻塞或逾期的任务

**mode: weekly-team — 5 个 section：**

1. `## 整体进度` — 任务完成率、本周完成/新增数
2. `## 风险任务` — 逾期/即将到期/无进展任务高亮
3. `## 工作产出概览` — 各成员产出概要（匿名化处理）
4. `## 下周优先级建议` — 基于待开始高优先级任务推荐
5. `## 成员活跃度` — 各成员提交数/文档编辑数概要

**验证：** Skill 格式符合 SkillValidator 校验。

#### C2：创建 team-report-curator Sub-agent Prompt

**文件：** `sibylla-desktop/resources/prompts/agents/team-report-curator.md`（新建）

遵循 `specs/design/sub-agent-system.md` 格式，关键配置：

| 字段 | 值 |
|------|------|
| `id` | `team-report-curator` |
| `model` | `claude-sonnet-4-20250514` |
| `allowed_tools` | `[read-file, search]` |
| `context.inherit_memory` | `true` |
| `context.inherit_trace` | `false` |
| `context.inherit_workspace_boundary` | `true` |
| `max_turns` | `5` |
| `max_tokens` | `10000` |

`output_schema` 定义 4 个 required 字段：`summary`(string)、`tasks`(array)、`commits`(array)、`risks`(array)，以及可选 `memberActivity`(array)。

Prompt 核心约束：

1. 输入：周报时间范围 + 团队成员列表 + 当前触发者角色
2. 数据收集：从 tasks.md、Git history、Trace Store 聚合
3. **隐私约束**：触发者非 Admin → 成员名称替换为"成员A/B/C"，不显示具体个人数据
4. 风险识别：逾期任务、即将到期（3天内）、连续 3 天无进展
5. 输出为结构化 JSON

**验证：** 放入 `resources/prompts/agents/` 后 SubAgentRegistry 自动发现。

---

### 阶段 D：Workflow YAML 文件（Step 5） — 预计 0.3 天

#### D1：创建 daily-personal-report.yaml

**文件：** `sibylla-desktop/resources/workflows/daily-personal-report.yaml`（新建）

| 属性 | 值 |
|------|------|
| `id` | `daily-personal-report` |
| `scope` | `personal` |
| `triggers` | `cron: "0 18 * * *"` + `manual` |

步骤定义：

| Step ID | 类型 | 调用 | input | on_failure |
|---------|------|------|-------|-----------|
| `collect-data` | `sub_agent: doc-summarizer` | 收集工作数据 | `{ task: "收集今日个人工作数据(任务变更、文件修改、AI 对话摘要)", source: "daily-personal" }` | `stop` |
| `generate` | `skill: daily-report` | 生成日报 | `{ data: ${{ steps.collect-data.output }} }` | — |
| `save` | `action: internal_notification` | 通知 | `{ title: "今日日报已生成", body: ${{ steps.generate.output.summary }}, channel: personal }` | — |

`on_workflow_failure: { notify_user: true, rollback: false }`

**与 daily-summary-flow.yaml 共存验证（C8）：**

| 属性 | 晨间 9:00（已有） | 傍晚 18:00（本任务） |
|------|-------------------|---------------------|
| 文件 | `daily-summary-flow.yaml` | `daily-personal-report.yaml` |
| 数据源 | 文件 diff（轻量） | 任务+提交+Trace（多源） |
| AI 参与 | 无深度 AI | daily-report Skill + doc-summarizer |
| 输出 | 工作区内通知 | `personal/{user}/reports/daily/{date}.md` |

#### D2：创建 weekly-team-report.yaml

**文件：** `sibylla-desktop/resources/workflows/weekly-team-report.yaml`（新建）

| 属性 | 值 |
|------|------|
| `id` | `weekly-team-report` |
| `scope` | `admin` |
| `triggers` | `cron: "0 17 * * 0"` + `manual` |

步骤定义：

| Step ID | 类型 | 调用 | input | on_failure |
|---------|------|------|-------|-----------|
| `collect-team-data` | `sub_agent: team-report-curator` | 收集团队数据 | `{ task: "收集本周全体成员的工作数据(任务进展、文档贡献、协作活跃度)", source: "weekly-team" }` | `stop` |
| `generate-team-report` | `skill: daily-report` | 生成周报 | `{ data: ${{ steps.collect-team-data.output }}, mode: "weekly-team" }` | — |
| `save-team-report` | `action: internal_notification` | 通知管理员 | `{ title: "本周团队周报已生成", body: ${{ steps.generate-team-report.output.summary }}, channel: admin }` | — |

**验证：** YAML 格式与 `daily-summary-flow.yaml` 一致，WorkflowParser 可正确解析。

---

### 阶段 E：IPC Handler 与 Preload 扩展（Step 6） — 预计 0.5 天

#### E1：实现 Report IPC Handler

**文件：** `sibylla-desktop/src/main/ipc/handlers/report.ts`（新建）

继承 `IpcHandler`，namespace `'report'`。

| Handler | 通道 | 实现 |
|---------|------|------|
| `handleGenerate` | `report:generate` | `workflowScheduler.triggerManual('daily-personal-report', params)` 或 `weekly-team-report` |
| `handleList` | `report:list` | 扫描 `personal/{user}/reports/daily/` + `docs/reports/weekly/` 返回文件列表 |
| `handleGet` | `report:get` | `fileManager.readFile(relativePath)` 返回报告内容 |

`handleList` 扫描逻辑：
- 个人日报：`personal/{currentUser}/reports/daily/*.md`
- 团队周报：`docs/reports/weekly/*.md`
- 返回 `Array<{ type: 'daily' | 'weekly'; date: string; filePath: string }>`

#### E2：实现 Productivity IPC Handler

**文件：** `sibylla-desktop/src/main/ipc/handlers/productivity.ts`（新建）

继承 `IpcHandler`，namespace `'productivity'`。

| Handler | 通道 | 实现 |
|---------|------|------|
| `handleAnalyze` | `productivity:analyze` | `productivityAnalyzer.analyze({ period, memberId?, viewerId })` |
| `handleQuery` | `productivity:query` | 缓存查询（不触发重新计算，返回 null 表示未缓存） |

#### E3：扩展 shared/types.ts

追加 `IPC_CHANNELS` 常量：

```typescript
REPORT_GENERATE: 'report:generate',
REPORT_LIST: 'report:list',
REPORT_GET: 'report:get',
PRODUCTIVITY_ANALYZE: 'productivity:analyze',
PRODUCTIVITY_QUERY: 'productivity:query',
```

追加 `IPCChannelMap` 类型签名。

#### E4：扩展 preload/index.ts

追加 `report` 命名空间到 `ElectronAPI`：`generate(type)` / `list()` / `get(filePath)`。

追加 `productivity` 命名空间：`analyze(period, memberId?)` / `query(period, memberId?)`。

追加 `ALLOWED_CHANNELS` 注册全部 5 个通道名。

**验证：** IPC 通道类型安全注册、handler 正确调用服务方法。

---

### 阶段 F：UI 组件实现（Step 7） — 预计 1 天

#### F1：reportStore.ts

**文件：** `sibylla-desktop/src/renderer/store/reportStore.ts`（新建）

State: `reports / currentReport / isGenerating / generateError`

Actions: `fetchReportList / getReport / generateReport`

- `fetchReportList()` → `window.electronAPI.report.list()`
- `getReport(path)` → `window.electronAPI.report.get(path)`
- `generateReport(type)` → `window.electronAPI.report.generate(type)`，设置 isGenerating 状态
- 注册 `events.on('report.generated')` 监听，自动刷新列表

使用 `devtools` 中间件。

#### F2：productivityStore.ts

**文件：** `sibylla-desktop/src/renderer/store/productivityStore.ts`（新建）

State: `report / isLoading / period / selectedMemberId`

Actions: `analyze / setPeriod / selectMember`

- `analyze(period, memberId?)` → `window.electronAPI.productivity.analyze(period, memberId)`
- ViewerId 从当前用户 session 获取

使用 `devtools` 中间件。

#### F3：ReportViewer.tsx

**文件：** `sibylla-desktop/src/renderer/components/report/ReportViewer.tsx`（新建）

- 接收 Markdown 内容，渲染格式化视图（复用现有 Markdown 渲染组件）
- **内联图表**（纯 SVG + TailwindCSS，不引入外部图表库）：
  - 任务完成柱状图：3 列（待开始/进行中/已完成），解析报告中任务数据渲染
  - 提交活跃度折线图：7 天维度，解析报告中提交数据渲染
- 加载状态：骨架屏
- 错误状态：重试按钮

#### F4：ProductivityPanel.tsx

**文件：** `sibylla-desktop/src/renderer/components/productivity/ProductivityPanel.tsx`（新建）

布局：

- **顶部**：综合分雷达图（4 轴：任务/文档/协作/知识），SVG 实现
- **中部**：四维度详细卡片，每个显示：label、raw 分数、归一化分数(0-1)、进度条、isNA 时显示 "N/A"
- **底部**：时间段选择器（周/月/季度按钮组）
- **成员选择器**：Admin 可切换查看不同成员
- **数据不足提示条**：dataSufficient=false 时显示警告横幅
- **"管理员视图"标记**：Admin 查看他人数据时显示

**验证：** ReportViewer Markdown 渲染正确、SVG 图表正确、ProductivityPanel 四维度展示正确、数据不足提示正确。

---

### 阶段 G：报告生成后处理（Step 8） — 预计 0.3 天

#### G1：报告文件保存逻辑

报告生成完成后的后处理（通过 WorkflowExecutor 回调或独立监听 `workflow.run-completed` 事件）：

1. **个人日报保存**：
   - 路径：`personal/{userName}/reports/daily/{YYYY-MM-DD}.md`
   - `fileManager.writeFile()` 原子写入
   - 保存前校验：仅写入当前用户的 `personal/` 目录（个人空间隔离）

2. **团队周报保存**：
   - 路径：`docs/reports/weekly/{YYYY-WW}.md`
   - `fileManager.writeFile()` 原子写入

#### G2：事件触发

报告保存成功后：

- 通过 `AppEventBus.emitEvent('report.generated', { reportType, filePath, date })` 触发事件
- 通过 `NotificationEngine` 推送通知

#### G3：失败处理

Workflow 执行失败时：

- `on_workflow_failure.notify_user: true` 已在 YAML 中配置
- 通过 NotificationCenter 推送错误通知
- 日志记录完整错误栈

**验证：** 文件保存路径正确、事件正确触发、通知正确推送。

---

### 阶段 H：单元测试（Step 9） — 预计 1 天

#### H1：ProductivityAnalyzer 测试

**文件：** `sibylla-desktop/tests/main/services/productivity/productivity-analyzer.test.ts`（新建）

| 测试用例 | 覆盖场景 |
|---------|---------|
| 任务完成率-标准 | P0/P1/P2 加权正确、归一化到 [0,1] |
| 任务完成率-全完成 | normalized=1 |
| 任务完成率-无任务 | isNA=true |
| 任务完成率-部分完成 | raw 计算正确 |
| 文档贡献度-标准 | docs/ ×1.5, personal/ ×0.5 正确 |
| 文档贡献度-无 commit | isNA=true |
| 协作响应速度-标准 | 中位时延计算正确 |
| 协作响应速度-无评论 | isNA=true |
| 知识贡献度-标准 | incoming link 累加正确 |
| 知识贡献度-无引用 | isNA=true |
| 综合分-四维度等权 | 0.25 × D1 + 0.25 × D2 + 0.25 × D3 + 0.25 × D4 |
| 缓存命中 | 相同参数返回缓存 |
| 缓存失效 | TTL 过期重新计算 |
| 缓存参数变化 | memberId/viewerId 变化 miss |
| 隐私-self | 完整细节、isAnonymized=false |
| 隐私-other | 匿名化、isAnonymized=true |
| 隐私-admin | 完整细节+管理员标记 |
| 数据不足 | < 7 天显示 insufficientNotice |
| 某维度缺失 | 该维度 isNA=true |

#### H2：Workflow YAML 结构测试

**文件：** `sibylla-desktop/tests/main/services/productivity/workflow-yaml-structure.test.ts`（新建）

| 测试用例 | 覆盖场景 |
|---------|---------|
| daily-personal-report 解析 | WorkflowParser 正确解析 |
| weekly-team-report 解析 | WorkflowParser 正确解析 |
| daily-personal-report steps | sub_agent/skill/action 字段正确 |
| daily-personal-report cron | `"0 18 * * *"` |
| weekly-team-report steps | sub_agent/skill/action 字段正确 |
| weekly-team-report cron | `"0 17 * * 0"` |
| daily-personal-report scope | `personal` |
| weekly-team-report scope | `admin` |

#### H3：IPC Handler 测试

**文件：** `sibylla-desktop/tests/main/services/productivity/report-ipc.test.ts`（新建）
**文件：** `sibylla-desktop/tests/main/services/productivity/productivity-ipc.test.ts`（新建）

| 测试用例 | 覆盖场景 |
|---------|---------|
| report:generate | 调用 WorkflowScheduler.triggerManual |
| report:list | 扫描报告目录返回文件列表 |
| report:get | 读取报告文件内容 |
| productivity:analyze | 调用 ProductivityAnalyzer.analyze |
| productivity:query | 返回缓存或 null |
| 错误处理 | 服务异常 → IPCResponse 错误包装 |

**覆盖率目标：** ProductivityAnalyzer ≥ 85%、Workflow YAML 结构 ≥ 80%、IPC handler ≥ 80%。

---

## 五、验收标准追踪

### 需求 6.5 — AI 日报/周报（18 项）

| 实现位置 | 验收要点 |
|---------|---------|
| D1 daily-personal-report.yaml | `cron: "0 18 * * *"` + `manual` 触发，scope=personal |
| D1 步骤 1 collect-data | `sub_agent: doc-summarizer`，input 含 task + source |
| D1 步骤 2 generate | `skill: daily-report`，input 含 data |
| D1 步骤 3 save | `action: internal_notification`，通知"今日日报已生成" |
| C1 daily-report Skill | 5 个 section（工作摘要/任务进展/提交记录/明日计划/阻塞项） |
| G1 个人日报保存 | `personal/{userName}/reports/daily/{YYYY-MM-DD}.md` |
| G1 路径校验 | 仅写入当前用户的 personal/ |
| D2 weekly-team-report.yaml | `cron: "0 17 * * 0"` + `manual`，scope=admin |
| D2 步骤 1 collect-team-data | `sub_agent: team-report-curator` |
| D2 步骤 2 generate-team-report | `skill: daily-report`，mode="weekly-team" |
| C1 团队周报 | 5 个 section（整体进度/风险/产出概览/下周建议/活跃度） |
| G1 团队周报保存 | `docs/reports/weekly/{YYYY-WW}.md` |
| C2 隐私-生成阶段 | team-report-curator prompt 内约束隐私过滤 |
| C2 隐私-非 Admin | 匿名化"团队 X 人完成 Y 任务" |
| C2 隐私-Admin | 全部细节 |
| F3 ReportViewer | Markdown 渲染 + 柱状图 + 折线图（SVG） |
| A1 事件 | `report.generated` 正确触发 |
| D1/D2 on_workflow_failure | `notify_user: true` |

### 需求 6.6 — 工作产出分析引擎（15 项）

| 实现位置 | 验收要点 |
|---------|---------|
| B1 任务完成率 | `已完成/总分配`，P0×3/P1×2/P2×1 加权 |
| B1 文档贡献度 | `Σ(文件类型权重 × 行变更)`，docs/ ×1.5, personal/ ×0.5 |
| B1 协作响应速度 | 中位时延倒数，`1/(1+medianDelayHours)` |
| B1 知识贡献度 | `Σ(自己文档被他人引用次数)` |
| B1 归一化 | 每个维度 [0,1] |
| B1 综合分 | 等权 0.25 × 四维度 |
| B1 数据源 | KanbanService / GitAbstraction / EventLogStore / WikiLinksStore |
| B1 不新建数据库 | 仅聚合查询 |
| B1 缓存 60s | 相同参数命中、TTL 过期失效 |
| B1 缓存 key | `${period}:${memberId}:${viewerId}` |
| B1 隐私-self | 完整细节 |
| B1 隐私-other | 匿名化团队聚合 |
| B1 隐私-admin | 完整 + 管理员标记 |
| B1 数据不足 | < 7 天显示 insufficientNotice |
| B1 维度缺失 | isNA=true 显示 "N/A" |

### 性能要求

| 指标 | 目标 | 实现方式 |
|------|------|---------|
| 单成员周维度分析首次 | < 2s | 并行四维度计算 |
| 单成员周维度分析缓存命中 | < 100ms | Map 缓存直接返回 |
| 个人日报生成 | < 30s | Workflow + Skill + Sub-agent |
| 团队周报生成 | < 90s | team-report-curator 聚合 |

---

## 六、风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| tasks.md 格式变更导致任务完成率计算偏差 | 中 | KanbanService 已有解析逻辑，ProductivityAnalyzer 仅消费其结果 |
| GitAbstraction.getCommitDiff() 大量 commit 调用耗时长 | 高 | 限制日期范围；并行请求；结果缓存 60s |
| EventLogStore 评论事件语义识别不准 | 中 | 使用宽泛匹配 + 白名单过滤；无评论时返回 N/A |
| WikiLinksStore 无文件作者元数据 | 高 | 通过 GitAbstraction.getHistory() 按 author 确定文件创建者 |
| Workflow 执行超时（特别是周报聚合） | 中 | Sub-agent max_turns=5 + max_tokens=10000；on_failure notify_user |
| 隐私过滤不充分泄露成员数据 | 高 | 生成阶段过滤（Sub-agent prompt 约束）+ ProductivityAnalyzer viewerId 过滤双重保障 |
| daily-report Skill prompt 输出格式不稳定 | 中 | Skill 接受结构化 JSON input，输出为固定 section Markdown |
| 缓存与实际数据不一致 | 低 | 订阅 kanban.task-status-changed / file.updated 事件清除缓存 |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 |
|----|------|--------|
| Day 1 上午 | A1-A2 | event-bus-types.ts 扩展 + productivity/types.ts |
| Day 1 下午 | B1 | ProductivityAnalyzer.analyze() + 缓存逻辑 |
| Day 2 上午 | B1 续 | 四维度计算方法 + 隐私过滤 |
| Day 2 下午 | C1-C2 | daily-report Skill prompt + team-report-curator prompt |
| Day 3 上午 | D1-D2 | daily-personal-report.yaml + weekly-team-report.yaml |
| Day 3 下午 | E1-E4 | Report/Productivity IPC handlers + shared/types + preload 扩展 |
| Day 4 上午 | F1-F4 | reportStore + productivityStore + ReportViewer + ProductivityPanel |
| Day 4 下午 | G1-G3 | 报告文件保存 + 事件触发 + 失败处理 |
| Day 5 上午 | H1 | ProductivityAnalyzer 单元测试（19 用例） |
| Day 5 下午 | H2-H3 | Workflow YAML 测试 + IPC 测试 + 全量验证修复 |

---

## 八、涉及文件变更汇总

### 新建文件（13 个）

| 文件路径 | 说明 |
|---------|------|
| `src/main/services/productivity/types.ts` | Productivity 类型定义 |
| `src/main/services/productivity/productivity-analyzer.ts` | 四维度工作产出分析核心 |
| `resources/skills/daily-report/_index.md` | 日报/周报 Skill prompt |
| `resources/prompts/agents/team-report-curator.md` | 团队报告策展 Sub-agent |
| `resources/workflows/daily-personal-report.yaml` | 每日个人日报 Workflow |
| `resources/workflows/weekly-team-report.yaml` | 每周团队周报 Workflow |
| `src/main/ipc/handlers/report.ts` | 报告 IPC handler |
| `src/main/ipc/handlers/productivity.ts` | 产出分析 IPC handler |
| `src/renderer/store/reportStore.ts` | 报告 Zustand store |
| `src/renderer/store/productivityStore.ts` | 产出分析 Zustand store |
| `src/renderer/components/report/ReportViewer.tsx` | 报告查看组件 |
| `src/renderer/components/productivity/ProductivityPanel.tsx` | 产出分析面板 |
| `tests/main/services/productivity/` | 单元测试目录（含 4 个测试文件） |

### 修改文件（3 个）

| 文件路径 | 变更内容 |
|---------|---------|
| `src/main/services/event-bus-types.ts` | 新增 `report.generated` 事件类型 + payload |
| `src/shared/types.ts` | IPC_CHANNELS 新增 report:* / productivity:* 常量 + IPCChannelMap |
| `src/preload/index.ts` | 新增 report + productivity 命名空间 + ALLOWED_CHANNELS |

### 不修改的文件

| 文件路径 | 原因 |
|---------|------|
| `src/main/services/kanban/kanban-service.ts` | 仅调用 parseTasksMd()，不修改 |
| `src/main/services/git-abstraction.ts` | 仅调用 getHistory/getCommitDiff |
| `src/main/services/wiki-links/wiki-links-store.ts` | 仅调用 getLinkCount |
| `src/main/services/event-log-store.ts` | 仅调用 read |
| `resources/workflows/daily-summary-flow.yaml` | 共存，不修改不删除 |

### 新增依赖

无。本任务不引入新的 npm 依赖（图表使用 SVG + TailwindCSS 纯客户端实现）。

---

**文档版本**: v1.0
**最后更新**: 2026-05-01
**维护者**: Sibylla 架构团队

