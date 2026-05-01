# AI 日报周报与工作产出分析

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK012 |
| **任务标题** | AI 日报周报与工作产出分析 |
| **所属阶段** | Phase 2 - 项目管理闭环 (Sprint 6) |
| **优先级** | P0 (日报周报) / P1 (工作产出分析) |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

构建 Sprint 6 的 AI 自动报告与工作产出分析能力——通过 Sprint 3.5 Workflow 框架自动触发每日个人日报和每周团队周报，通过 `ProductivityAnalyzer` 从已有数据源聚合四维度工作产出指标，为管理员 Dashboard（TASK013）提供数据基础。

### 背景

Sprint 3.5 的 Workflow 系统已有 `daily-summary-flow.yaml`（晨间 9:00 轻量 diff 回顾），但缺少傍晚多源聚合报告。团队缺乏系统化的工作产出度量：

| 问题 | 现状 | 本任务解决 |
|------|------|-----------|
| 无自动日报 | 用户手写或跳过 | 傍晚 18:00 Workflow 自动生成（任务进展+提交记录+明日计划） |
| 无团队周报 | 管理员手动汇总 | 每周日 17:00 Workflow 自动聚合（进度+风险+产出概览） |
| 无产出度量 | 只能凭印象评估 | ProductivityAnalyzer 四维度量化分析 |
| 团队报告隐私风险 | 无过滤机制 | 生成时应用 PrivacyFilter，非 Admin 仅看匿名化数据 |
| 数据源分散 | 任务/提交/评论/引用分布在不同系统 | ProductivityAnalyzer 统一聚合查询 |

**核心设计约束：**

1. **严格不新建数据库**——所有指标从已有数据源聚合（tasks.md、GitAbstraction、EventLogStore、WikiLinksStore）
2. **报告生成完全走 Workflow 框架**——不新建生成器，使用 `skill:` / `sub_agent:` / `action:` step 格式（C5/D4）
3. **晨间与傍晚报告共存**——现有 `daily-summary-flow.yaml`（9:00 轻量 diff 回顾）与本任务新增的 `daily-personal-report.yaml`（18:00 多源聚合）分工不同（C8）
4. **隐私在生成阶段过滤**——团队周报通过 `team-report-curator` Sub-agent 在生成时应用 PrivacyFilter，而非渲染时
5. **ProductivityAnalyzer 纯本地实现**——不依赖云端 API，跨设备聚合为未来扩展点（C11/D7）
6. **60 秒结果缓存**——避免频繁重复计算

### 范围

**包含：**

- `ProductivityAnalyzer` — 四维度工作产出分析服务（任务完成率、文档贡献度、协作响应速度、知识贡献度）
- `daily-personal-report.yaml` Workflow — 每日 18:00 个人日报模板
- `weekly-team-report.yaml` Workflow — 每周日 17:00 团队周报模板
- `team-report-curator` Sub-agent prompt — 聚合多源数据生成团队周报
- `daily-report` Skill prompt 实装 — `resources/skills/daily-report/_index.md`（Sprint 3.5 已列为内置 Skill，本任务实装 prompt）
- `report.generated` 事件扩展
- IPC handlers（report.ts / productivity.ts）— 报告和分析相关 IPC 通道
- Zustand store（reportStore.ts / productivityStore.ts）— UI 状态
- `ReportViewer` 组件 — 报告文件格式化查看（含简单图表）
- `ProductivityPanel` 组件 — 工作产出分析可视化
- 单元测试

**不包含：**

- 管理员 Dashboard 整合（TASK013 消费 ProductivityAnalyzer 数据）
- ProactiveEngine PatrolTrigger 扩展（TASK013）
- 权限回归测试（TASK014）
- Workflow 框架核心修改
- 图表库选型（使用轻量客户端方案，不引入外部 chart 服务）

## 依赖关系

### 前置依赖

- [x] PHASE2-TASK010 — 任务看板与 AI 任务管理（`KanbanService` 提供任务完成率数据源）
- [x] PHASE2-TASK001 — 事件总线（`AppEventBus` + `SibyllaEventType`）
- [x] PHASE2-TASK004 — WikiLinks 双向链接（`WikiLinksStore.getLinkCount()` 提供知识贡献度数据源）
- [x] PHASE2-TASK006 — 通知中心（`NotificationEngine` 报告生成通知）
- [x] PHASE2-TASK007 — Presence 与协作上下文（`PrivacyFilter` 报告隐私过滤）
- [x] Sprint 3.2 — 记忆系统（MEMORY.md 上下文）
- [x] Sprint 3.3 — Trace 系统（`TraceStore` 提供 AI 协作活跃度数据源）
- [x] Sprint 3.5 — Workflow 系统（`WorkflowScheduler` + `WorkflowExecutor` + `SubAgentExecutor`）
- [x] Sprint 3.5 — Skill 系统（`SkillEngine` + `daily-report` Skill 注册）
- [x] Sprint 2 — GitAbstraction（`getHistory()` 提供提交记录数据源）
- [x] Sprint 2 — SyncManager / WorkspaceMemberDirectory（成员列表查询）

### 被依赖任务

- [ ] PHASE2-TASK013 — 管理员 Dashboard 与巡检触发器（消费 `ProductivityAnalyzer.analyze()` 数据 + `report.generated` 事件）

## 参考文档

- [`specs/requirements/phase2/sprint6-task-management.md`](../../requirements/phase2/sprint6-task-management.md) — 需求 6.5（AI 日报周报）、6.6（工作产出分析引擎）、§2.3（数据源严格限制）、§2.4（Workflow 命名空间）、§4.3（报告生成流）、§9.6（C5 Workflow step 格式冲突）、§9.8（C8 日报共存冲突）、§9.11（C11 Cloud 端限制）
- [`specs/design/workflow-system.md`](../../design/workflow-system.md) — Workflow YAML 规范、Step 类型、触发器
- [`specs/design/skill-system.md`](../../design/skill-system.md) — Skill 注册、执行模型
- [`specs/design/sub-agent-system.md`](../../design/sub-agent-system.md) — Sub-agent 注册与执行
- [`specs/design/architecture.md`](../../design/architecture.md) — 进程通信架构
- [`CLAUDE.md`](../../../CLAUDE.md) — 文件即真相、AI 建议人类决策、个人空间隔离
- `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` — Electron IPC 通信模式
- `.kilocode/skills/phase1/zustand-state-management/SKILL.md` — Zustand store 设计

## 验收标准

### 需求 6.5 — AI 日报/周报

#### 每日个人日报 Workflow

- [ ] `resources/workflows/daily-personal-report.yaml` 创建，触发器为 `cron: "0 18 * * *"` + `manual`
- [ ] Workflow scope 为 `personal`
- [ ] 步骤 1 (collect-data): 使用 `sub_agent: doc-summarizer`，input 包含 `task: "收集今日个人工作数据(任务变更、文件修改、AI 对话摘要)"`, `source: "daily-personal"`
- [ ] 步骤 2 (generate): 使用 `skill: daily-report`，input 包含 `data: ${{ steps.collect-data.output }}`
- [ ] 步骤 3 (save): 使用 `action: internal_notification`，通知"今日日报已生成"
- [ ] 步骤格式使用 `sub_agent:` / `skill:` / `action:` 字段（与现有 `daily-summary-flow.yaml` 一致，C5/D4）
- [ ] 生成失败时 `on_workflow_failure.notify_user: true`

#### 个人日报内容

- [ ] 日报包含 5 个 section：工作摘要、任务进展（从 KanbanService 获取）、提交记录（从 GitAbstraction 获取）、明日计划（从任务列表推断）、阻塞项
- [ ] 日报保存到 `personal/{userName}/reports/daily/{YYYY-MM-DD}.md`
- [ ] 日报文件路径遵守个人空间隔离写入校验（仅写入当前用户的 personal/）

#### 每周团队周报 Workflow

- [ ] `resources/workflows/weekly-team-report.yaml` 创建，触发器为 `cron: "0 17 * * 0"` + `manual`
- [ ] Workflow scope 为 `admin`
- [ ] 步骤 1 (collect-team-data): 使用 `sub_agent: team-report-curator`，input 包含 `task: "收集本周全体成员的工作数据"`, `source: "weekly-team"`
- [ ] 步骤 2 (generate-team-report): 使用 `skill: daily-report`，input 包含 `data: ${{ steps.collect-team-data.output }}`, `mode: "weekly-team"`
- [ ] 步骤 3 (save-team-report): 使用 `action: internal_notification`，通知"本周团队周报已生成"

#### 团队周报内容

- [ ] 周报包含 5 个 section：整体进度、风险任务高亮、工作产出概览（匿名化非自己数据）、下周优先级建议、成员活跃度概要
- [ ] 周报保存到 `docs/reports/weekly/{YYYY-WW}.md`

#### 团队报告隐私处理

- [ ] 非 Admin 看自己的报告：全部细节
- [ ] 非 Admin 看团队周报：匿名化的"团队 X 人完成 Y 任务"，不看到具体成员细节
- [ ] Admin 看团队周报：全部细节，但仍受 personal/ 隔离
- [ ] 隐私过滤在生成阶段（Sub-agent prompt 内约束），而非渲染阶段

#### daily-report Skill 实装

- [ ] `resources/skills/daily-report/_index.md` 创建（Sprint 3.5 已列为内置 Skill，本任务实装 prompt）
- [ ] Skill 接受结构化数据 input，输出 Markdown 格式报告
- [ ] 支持 `mode: "daily-personal"` 和 `mode: "weekly-team"` 两种输出格式

#### 报告查看与交互

- [ ] 用户打开报告文件时，ReportViewer 渲染格式化 Markdown
- [ ] 支持简单内联图表：任务完成柱状图、提交活跃度折线图（客户端渲染）
- [ ] 用户可通过命令面板手动触发报告生成

#### 事件与通知

- [ ] 报告生成后触发 `report.generated` 事件，payload `{ reportType: 'daily-personal' | 'weekly-team'; filePath; date }`
- [ ] 生成失败时通过 NotificationCenter 通知用户

### 需求 6.6 — 工作产出分析引擎

#### ProductivityAnalyzer 核心功能

- [ ] `ProductivityAnalyzer.analyze(opts)` 正确计算四维度指标：
  - 任务完成率：`已完成任务数 / 总分配任务数`，加权 P0×3 / P1×2 / P2×1
  - 文档贡献度：`Σ(文件类型权重 × 行变更数)`，docs/ 权重 1.5，personal/ 权重 0.5
  - 协作响应速度：评论被回复的中位时延的倒数，归一化到 [0, 1]
  - 知识贡献度：`Σ(自己创建的文档被他人引用次数)`，基于 WikiLinksStore
- [ ] 每个维度归一化到 [0, 1]
- [ ] 综合分 = 加权平均（默认权重各 0.25，Admin 可通过 Dashboard 调整，TASK013 实现）

#### 数据源严格限制

- [ ] 任务完成率数据源：`KanbanService.parseTasksMd()` 解析结果
- [ ] 文档贡献度数据源：`GitAbstraction.getHistory()` 按作者统计
- [ ] 协作响应速度数据源：`EventLogStore.read()` 评论事件流
- [ ] 知识贡献度数据源：`WikiLinksStore.getLinkCount()` 被引用次数
- [ ] 不新建任何数据库表或索引

#### 缓存与性能

- [ ] 分析结果缓存 60 秒，相同参数的重复请求命中缓存
- [ ] 缓存 key 为 `{ period, memberId, viewerId }` 的序列化字符串
- [ ] 缓存失效条件：tasks.md 变更、新 commit、超过 TTL

#### 隐私与权限

- [ ] 用户查看自己的分析：显示完整细节
- [ ] 用户查看他人的分析：仅显示匿名化团队聚合数据（通过 PrivacyFilter）
- [ ] Admin 查看分析：显示所有成员细节，带"管理员视图"标记
- [ ] `analyze()` 的 `viewerId` 参数驱动隐私过滤逻辑

#### 数据不足处理

- [ ] 历史数据 < 7 天时，显示提示"数据积累不足 7 天，以下指标仅供参考"而非误导性数字
- [ ] 某维度数据完全缺失时（如无评论事件），该维度显示为 "N/A" 而非 0

#### 性能要求

- [ ] 单成员周维度分析：首次 < 2s，缓存命中 < 100ms
- [ ] 个人日报生成：< 30s
- [ ] 团队周报生成：< 90s

### 单元测试

- [ ] ProductivityAnalyzer 四维度计算测试（各维度归一化/加权/边界情况）
- [ ] ProductivityAnalyzer 缓存测试（命中/失效/TTL 过期）
- [ ] ProductivityAnalyzer 隐私过滤测试（self/other/admin 三种 viewerId）
- [ ] ProductivityAnalyzer 数据不足测试（< 7 天/某维度缺失）
- [ ] daily-personal-report.yaml Workflow 步骤验证测试
- [ ] weekly-team-report.yaml Workflow 步骤验证测试
- [ ] daily-report Skill 输出格式测试
- [ ] 覆盖率：ProductivityAnalyzer ≥ 85%、Workflow YAML 结构验证 ≥ 80%

## 技术策略

### 报告生成架构：Workflow 驱动，不新建生成器

```
┌─────────────────────────────────────────────────────────────┐
│              WorkflowScheduler (Sprint 3.5)                  │
│                                                              │
│  Cron 触发: "0 18 * * *" (每日 18:00)                        │
│     │                                                        │
│     ▼                                                        │
│  daily-personal-report.yaml                                  │
│     │                                                        │
│     ├─ Step 1: collect-data                                  │
│     │   sub_agent: doc-summarizer (已有)                     │
│     │   input: { task, source: "daily-personal" }            │
│     │   → 收集 tasks.md / Git history / Trace / 通知         │
│     │                                                        │
│     ├─ Step 2: generate                                      │
│     │   skill: daily-report (本任务实装 prompt)               │
│     │   input: { data: ${{ steps.collect-data.output }} }    │
│     │   → LLM 生成结构化 Markdown                            │
│     │                                                        │
│     └─ Step 3: save                                          │
│         action: internal_notification                        │
│         input: { title, body, channel: personal }            │
│         → 通知"今日日报已生成"                                │
│                                                              │
│  ──────────────────────────────────────────────────────      │
│                                                              │
│  Cron 触发: "0 17 * * 0" (每周日 17:00)                      │
│     │                                                        │
│     ▼                                                        │
│  weekly-team-report.yaml                                     │
│     │                                                        │
│     ├─ Step 1: collect-team-data                             │
│     │   sub_agent: team-report-curator (本任务新增)           │
│     │   input: { task, source: "weekly-team" }               │
│     │   → 聚合多成员数据 + 应用 PrivacyFilter                 │
│     │                                                        │
│     ├─ Step 2: generate-team-report                          │
│     │   skill: daily-report                                  │
│     │   input: { data, mode: "weekly-team" }                 │
│     │                                                        │
│     └─ Step 3: save-team-report                              │
│         action: internal_notification                        │
│         input: { title, body, channel: admin }               │
└─────────────────────────────────────────────────────────────┘
```

### ProductivityAnalyzer 四维度数据源映射

```
ProductivityAnalyzer.analyze({ period, memberId?, viewerId })
    │
    ├─▶ 维度 1: 任务完成率
    │   数据源: KanbanService.parseTasksMd()
    │   计算: Σ(已完成任务优先级权重) / Σ(所有分配任务优先级权重)
    │   权重: P0=3, P1=2, P2=1
    │   归一化: raw / maxPossible
    │
    ├─▶ 维度 2: 文档贡献度
    │   数据源: GitAbstraction.getHistory()
    │   计算: Σ(commits 中文件类型权重 × 行变更数)
    │   权重: docs/=1.5, personal/=0.5, 其他=1.0
    │   归一化: raw / teamMax (团队最高分)
    │
    ├─▶ 维度 3: 协作响应速度
    │   数据源: EventLogStore.read() → 过滤评论事件
    │   计算: 评论被回复的中位时延的倒数
    │   归一化: medianDelay 越小分越高, 1 / (1 + medianDelayHours)
    │
    └─▶ 维度 4: 知识贡献度
        数据源: WikiLinksStore.getLinkCount(path).incoming
        计算: Σ(自己文档被他人引用次数)
        归一化: raw / teamMax

    综合分 = 0.25 × D1 + 0.25 × D2 + 0.25 × D3 + 0.25 × D4
```

### 晨间与傍晚日报共存（C8）

| 属性 | 晨间 9:00（已有） | 傍晚 18:00（本任务新增） |
|------|-------------------|------------------------|
| 文件 | `daily-summary-flow.yaml` | `daily-personal-report.yaml` |
| 触发 | `cron: "0 9 * * *"` | `cron: "0 18 * * *"` |
| 数据源 | 文件 diff（轻量） | 任务+提交+Trace+通知（多源） |
| AI 参与 | 无深度 AI | daily-report Skill + doc-summarizer Sub-agent |
| 输出 | 工作区内通知 | `personal/{user}/reports/daily/{date}.md` |

用户可在设置中启用其中一个或两个。不删除现有 Workflow。

### 事件命名

本任务新增 `report.generated` 事件到 `SibyllaEventType`：
```typescript
'report.generated': { reportType: 'daily-personal' | 'weekly-team'; filePath: string; date: string }
```

### 隐私过滤策略

团队周报的隐私处理在 `team-report-curator` Sub-agent 的 prompt 中约束：

- **生成阶段**：Sub-agent 收集各成员数据后，根据当前生成者的角色决定输出粒度
  - Admin 触发：包含所有成员完整细节
  - 非 Admin 触发（理论上不会，scope=admin 限制）：仅聚合数据
- **渲染阶段**：无需额外过滤，因为生成时已处理
- **ProductivityAnalyzer**：通过 `viewerId` 参数在查询时过滤

## 技术执行路径

### 步骤 1：新增 report.generated 事件类型

**文件：** `src/main/services/event-bus-types.ts`（修改）

1. 在 `SibyllaEventType` 联合类型中追加：
   ```typescript
   | 'report.generated'
   ```

2. 在 `EventPayloadMap` 中追加：
   ```typescript
   'report.generated': { reportType: 'daily-personal' | 'weekly-team'; filePath: string; date: string }
   ```

**验证：** TypeScript 编译通过。

### 步骤 2：实现 ProductivityAnalyzer 核心

**文件：** `src/main/services/productivity/productivity-analyzer.ts`（新建）

1. 定义核心类型：
   ```typescript
   type AnalysisPeriod = 'week' | 'month' | 'quarter'

   interface DimensionScore {
     raw: number
     normalized: number
     weight: number
     label: string
     details?: string
   }

   interface ProductivityReport {
     period: AnalysisPeriod
     memberId?: string
     viewerId: string
     dimensions: {
       taskCompletion: DimensionScore
       docContribution: DimensionScore
       collabResponsiveness: DimensionScore
       knowledgeContribution: DimensionScore
     }
     overall: number
     generatedAt: string
     dataSufficient: boolean
     insufficientNotice?: string
     isAnonymized: boolean
   }
   ```

2. 实现构造函数——注入已有服务，不新建数据源：
   ```typescript
   constructor(
     private readonly kanbanService: KanbanService,
     private readonly gitAbstraction: GitAbstraction,
     private readonly eventLogStore: EventLogStore,
     private readonly wikiLinksStore: WikiLinksStore,
     private readonly memberDirectory: WorkspaceMemberDirectory,
     private readonly privacyFilter: PrivacyFilter,
     private readonly workspaceRoot: string,
     private readonly logger: Logger
   ) {}
   ```

3. 实现 `analyze(opts)` 主方法：
   - 参数：`{ period: AnalysisPeriod, memberId?: string, viewerId: string }`
   - 检查缓存（Map<cacheKey, { report, cachedAt }>）
   - 计算时间范围（period → 起止日期）
   - 检查数据充足性（EventLogStore 最早记录 vs 7 天阈值）
   - 并行调用 4 个维度计算方法
   - 应用隐私过滤（基于 viewerId vs memberId）
   - 计算综合分
   - 缓存结果 60 秒
   - 返回 `ProductivityReport`

4. 实现 `calculateTaskCompletion(memberId, dateRange)`：
   - 调用 `kanbanService.parseTasksMd()` 获取所有任务
   - 过滤分配给 memberId 的任务（assignee 字段匹配）
   - 按状态统计，优先级加权：P0=3, P1=2, P2=1
   - 归一化：rawScore / maxPossibleScore

5. 实现 `calculateDocContribution(memberId, dateRange)`：
   - 调用 `gitAbstraction.getHistory({ since, until })` 获取 commit 列表
   - 按 author 过滤 memberId 的 commit
   - 对每个 commit 调用 `getCommitDiff(oid)` 获取文件变更
   - 按文件路径加权计算：`docs/` ×1.5, `personal/` ×0.5, 其他 ×1.0
   - 归一化：raw / teamMax

6. 实现 `calculateCollabResponsiveness(memberId, dateRange)`：
   - 调用 `eventLogStore.read(months)` 读取事件日志
   - 过滤评论相关事件（`mcp.sync-completed` 含 mention/assigned 等）
   - 计算评论被回复的中位时延（P50）
   - 归一化：`1 / (1 + medianDelayHours)`

7. 实现 `calculateKnowledgeContribution(memberId, dateRange)`：
   - 从 `wikiLinksStore` 获取所有有 incoming link 的文件
   - 过滤由 memberId 创建的文件（通过 GitAbstraction.getHistory 确定文件作者）
   - 累加每个文件的 `getLinkCount(path).incoming`
   - 归一化：raw / teamMax

8. 实现隐私过滤：
   - `viewerId === memberId`：完整细节，不匿名
   - `viewerId !== memberId` 且 viewer 非 admin：返回匿名化报告（无具体成员名，仅"团队成员"）
   - `viewerId === 'admin'`：完整细节 + "管理员视图"标记

9. 实现缓存逻辑：
   - `Map<string, { report: ProductivityReport, cachedAt: number }>`
   - cacheKey = `${period}:${memberId || 'all'}:${viewerId}`
   - 命中条件：cachedAt + 60000 > Date.now()
   - tasks.md 变更或新 commit 事件触发缓存清除

**验证：** 单元测试覆盖四维度计算（归一化/加权/边界）、缓存命中/失效、隐私过滤（self/other/admin）、数据不足提示。

### 步骤 3：创建 daily-report Skill Prompt

**文件：** `resources/skills/daily-report/_index.md`（新建，Sprint 3.5 已注册 id 但未实装）

1. Skill 定义：
   ```markdown
   ---
   id: daily-report
   version: 1.0.0
   name: 工作日报/周报生成
   description: 基于结构化数据生成个人日报或团队周报
   type: prompt
   ---

   ## 输入格式

   接收结构化 JSON 数据，包含以下字段：
   - mode: "daily-personal" | "weekly-team"
   - tasks: 任务进展数据
   - commits: 提交记录
   - traces: AI 对话摘要
   - notifications: 待处理建议
   - period: 时间范围

   ## 输出格式

   ### 个人日报 (mode: daily-personal)

   生成包含以下 section 的 Markdown：

   # 工作日报 - {date}

   ## 工作摘要
   （1-2 句话总结今日工作重点）

   ## 任务进展
   （列出今日有变化的任务：新增/状态变更/完成）

   ## 提交记录
   （今日 commit 列表，含简要说明）

   ## 明日计划
   （从待开始任务和进行中任务推断）

   ## 阻塞项
   （标记为阻塞或逾期的任务）

   ### 团队周报 (mode: weekly-team)

   # 团队周报 - 第{WW}周

   ## 整体进度
   （任务完成率、本周完成任务数、新增任务数）

   ## 风险任务
   （逾期/即将到期/无进展的任务高亮）

   ## 工作产出概览
   （各成员产出概要，匿名化处理）

   ## 下周优先级建议
   （基于待开始高优先级任务推荐）

   ## 成员活跃度
   （各成员在线时长/提交数/文档编辑数概要）
   ```

**验证：** 手动测试两种 mode 的输出格式。

### 步骤 4：创建 team-report-curator Sub-agent Prompt

**文件：** `resources/prompts/agents/team-report-curator.md`（新建）

1. YAML frontmatter：
   ```yaml
   ---
   id: team-report-curator
   version: 1.0.0
   name: 团队报告策展员
   description: 聚合多源数据生成团队周报，内置隐私过滤约束
   model: claude-sonnet-4-20250514
   allowed_tools:
     - read-file
     - search
   context:
     inherit_memory: true
     inherit_trace: false
     inherit_workspace_boundary: true
   max_turns: 5
   max_tokens: 10000
   output_schema:
     type: object
     required:
       - summary
       - tasks
       - commits
       - risks
     properties:
       summary:
         type: string
       tasks:
         type: array
         items:
           type: object
           properties:
             title: { type: string }
             status: { type: string }
             assignee: { type: string }
       commits:
         type: array
         items:
           type: object
           properties:
             author: { type: string }
             count: { type: number }
             highlights: { type: array, items: { type: string } }
       risks:
         type: array
         items:
           type: object
           properties:
             taskTitle: { type: string }
             riskType: { type: string }
             detail: { type: string }
       memberActivity:
         type: array
         items:
           type: object
           properties:
             memberName: { type: string }
             onlineHours: { type: number }
             commits: { type: number }
             docEdits: { type: number }
   ---
   ```

2. Prompt 正文核心约束：
   - 输入：周报时间范围 + 团队成员列表 + 当前触发者角色
   - 数据收集：从 tasks.md（KanbanService）、Git history（GitAbstraction）、Trace Store 聚合
   - **隐私约束**：如果触发者非 Admin，成员名称替换为"成员A/B/C"，不显示具体个人数据
   - 风险识别：逾期任务、即将到期（3天内）、连续 3 天无进展
   - 输出为结构化 JSON，供 `daily-report` Skill 使用

**验证：** 手动测试 Admin 触发和非 Admin 触发的输出差异。

### 步骤 5：创建 Workflow YAML 文件

**文件：** `resources/workflows/daily-personal-report.yaml`（新建）

```yaml
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
    description: "日报日期，默认为今日"

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

**文件：** `resources/workflows/weekly-team-report.yaml`（新建）

```yaml
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

**验证：** YAML 格式与现有 `daily-summary-flow.yaml` 一致，WorkflowParser 可正确解析。

### 步骤 6：实现 Report + Productivity IPC Handlers

**文件：** `src/main/ipc/handlers/report.ts`（新建）

1. 新增 IPC 通道常量到 `IPC_CHANNELS`：
   ```typescript
   REPORT_GENERATE: 'report:generate',
   REPORT_LIST: 'report:list',
   REPORT_GET: 'report:get',
   ```

2. 实现 handler（继承 `IpcHandler`，namespace `'report'`）：
   - `report:generate` → 触发对应 Workflow（通过 `WorkflowScheduler.triggerManual(workflowId, params)`）
   - `report:list` → 扫描 `personal/{user}/reports/daily/` 和 `docs/reports/weekly/` 返回文件列表
   - `report:get` → 读取报告文件内容

**文件：** `src/main/ipc/handlers/productivity.ts`（新建）

3. 新增 IPC 通道常量：
   ```typescript
   PRODUCTIVITY_ANALYZE: 'productivity:analyze',
   PRODUCTIVITY_QUERY: 'productivity:query',
   ```

4. 实现 handler（继承 `IpcHandler`，namespace `'productivity'`）：
   - `productivity:analyze` → `ProductivityAnalyzer.analyze({ period, memberId?, viewerId })`
   - `productivity:query` → 缓存查询（不触发重新计算）

5. 在 `preload/index.ts` 新增 `report` 和 `productivity` 命名空间。

**验证：** IPC 通道类型安全。

### 步骤 7：实现 UI 组件

**文件：** `src/renderer/store/reportStore.ts`（新建）

1. Zustand store：
   ```typescript
   interface ReportState {
     reports: Array<{ type: 'daily' | 'weekly'; date: string; filePath: string }>
     currentReport: string | null
     isGenerating: boolean
     generateError: string | null

     fetchReportList: () => Promise<void>
     getReport: (filePath: string) => Promise<string>
     generateReport: (type: 'daily-personal' | 'weekly-team') => Promise<void>
   }
   ```

**文件：** `src/renderer/store/productivityStore.ts`（新建）

2. Zustand store：
   ```typescript
   interface ProductivityState {
     report: ProductivityReport | null
     isLoading: boolean
     period: AnalysisPeriod
     selectedMemberId: string | null

     analyze: (period: AnalysisPeriod, memberId?: string) => Promise<void>
     setPeriod: (period: AnalysisPeriod) => void
     selectMember: (memberId: string | null) => void
   }
   ```

**文件：** `src/renderer/components/report/ReportViewer.tsx`（新建）

3. 报告查看组件：
   - 接收 Markdown 内容，渲染格式化视图
   - 复用现有 Markdown 渲染组件
   - 支持内联图表渲染：
     - 任务完成柱状图：3 列（待开始/进行中/已完成），纯 CSS/SVG 实现
     - 提交活跃度折线图：7 天/30 天维度，纯 CSS/SVG 实现
   - 不引入外部图表库（使用 SVG + TailwindCSS 实现）

**文件：** `src/renderer/components/productivity/ProductivityPanel.tsx`（新建）

4. 工作产出分析面板：
   - 顶部：综合分雷达图（4 轴：任务/文档/协作/知识），SVG 实现
   - 中部：四维度详细卡片，每个显示原始分数、归一化分数、趋势箭头
   - 底部：时间段选择器（周/月/季度）
   - 成员选择器（Admin 可切换查看不同成员）
   - 数据不足提示条（< 7 天时显示）
   - "管理员视图"标记（Admin 查看他人数据时显示）

**验证：** ReportViewer Markdown 渲染正确、图表 SVG 正确、ProductivityPanel 四维度展示正确、数据不足提示正确。

### 步骤 8：实现报告生成后处理

**文件：** 报告生成完成回调（WorkflowExecutor 扩展或独立监听）

1. 报告文件保存逻辑：
   - 个人日报：`FileManager.writeFile()` 保存到 `personal/{userName}/reports/daily/{YYYY-MM-DD}.md`
   - 团队周报：`FileManager.writeFile()` 保存到 `docs/reports/weekly/{YYYY-WW}.md`
   - 保存前校验路径：个人日报仅写入当前用户的 `personal/` 目录

2. 触发 `report.generated` 事件

3. NotificationCenter 推送通知

**验证：** 文件保存路径正确、事件正确触发、通知正确推送。

### 步骤 9：单元测试

**文件：** `tests/main/services/productivity/`（新建目录）

1. `productivity-analyzer.test.ts`：
   - 任务完成率计算（P0/P1/P2 加权、无任务、全完成、部分完成）
   - 文档贡献度计算（docs/ 权重 1.5、personal/ 权重 0.5、无 commit）
   - 协作响应速度计算（中位时延、无评论事件 → N/A）
   - 知识贡献度计算（有引用/无引用/自引用不算）
   - 综合分计算（四维度等权）
   - 缓存命中和失效（60s TTL、参数变化 miss）
   - 隐私过滤（self 完整、other 匿名、admin 完整+标记）
   - 数据不足提示（< 7 天、某维度完全缺失 → N/A）

2. `workflow-yaml-structure.test.ts`：
   - daily-personal-report.yaml 可被 WorkflowParser 正确解析
   - weekly-team-report.yaml 可被 WorkflowParser 正确解析
   - step 字段格式正确（sub_agent/skill/action）
   - cron 表达式正确

3. `report-ipc.test.ts` + `productivity-ipc.test.ts`：
   - 各 IPC 通道正确调用对应服务方法

**覆盖率目标：** ProductivityAnalyzer ≥ 85%、Workflow YAML 结构 ≥ 80%、IPC handler ≥ 80%

## 现有代码基础

| 已有模块 | 文件路径 | 本任务使用方式 |
|---------|---------|-------------|
| WorkflowScheduler | Sprint 3.5 | 触发 daily-personal-report / weekly-team-report Workflow |
| WorkflowExecutor | Sprint 3.5 | 执行 Workflow 步骤 |
| WorkflowParser | Sprint 3.5 | 解析 YAML 格式校验 |
| SubAgentExecutor | Sprint 3.5 | 执行 team-report-curator Sub-agent |
| SkillEngine | Sprint 3.5 | 执行 daily-report Skill |
| doc-summarizer | `resources/prompts/agents/doc-summarizer.md` | 日报 Step 1 数据收集 |
| SubAgentRegistry | `src/main/services/sub-agent/SubAgentRegistry.ts` | 自动发现 team-report-curator |
| KanbanService | `src/main/services/kanban/kanban-service.ts`（TASK010） | 任务完成率数据源 |
| GitAbstraction | `src/main/services/git-abstraction.ts` | getHistory() 提交记录 + getCommitDiff() 文件变更 |
| EventLogStore | `src/main/services/event-log-store.ts` | read() 评论事件流 |
| WikiLinksStore | `src/main/services/wiki-links/wiki-links-store.ts` | getLinkCount() 被引用次数 |
| PrivacyFilter | `src/main/services/presence/privacy-filter.ts` | 报告隐私过滤 |
| WorkspaceMemberDirectory | Sprint 2 | 成员列表查询 |
| FileManager | `src/main/services/file-manager.ts` | 报告文件读写 |
| AppEventBus | `src/main/services/event-bus.ts` | 发射 report.generated 事件 |
| NotificationEngine | `src/main/services/notifications/notification-engine.ts` | 报告生成通知 |
| IpcHandler | `src/main/ipc/handler.ts` | 新建 report/productivity handler |
| daily-summary-flow.yaml | `resources/workflows/daily-summary-flow.yaml` | 共存参考，不修改 |

**完全缺失、需新建的模块：**

| 模块 | 说明 |
|------|------|
| `services/productivity/productivity-analyzer.ts` | 四维度工作产出分析核心服务 |
| `resources/skills/daily-report/_index.md` | 日报/周报 Skill prompt 实装 |
| `resources/prompts/agents/team-report-curator.md` | 团队报告策展 Sub-agent |
| `resources/workflows/daily-personal-report.yaml` | 每日个人日报 Workflow |
| `resources/workflows/weekly-team-report.yaml` | 每周团队周报 Workflow |
| `ipc/handlers/report.ts` | 报告 IPC handler |
| `ipc/handlers/productivity.ts` | 产出分析 IPC handler |
| `renderer/store/reportStore.ts` | 报告 Zustand store |
| `renderer/store/productivityStore.ts` | 产出分析 Zustand store |
| `renderer/components/report/ReportViewer.tsx` | 报告查看组件 |
| `renderer/components/productivity/ProductivityPanel.tsx` | 产出分析面板 |
| `tests/main/services/productivity/` | 单元测试目录 |

## 新增 IPC 通道

| IPC 通道 | 方向 | 说明 |
|---------|------|------|
| `report:generate` | Renderer → Main | 手动触发报告生成 |
| `report:list` | Renderer → Main | 查询报告文件列表 |
| `report:get` | Renderer → Main | 获取报告文件内容 |
| `productivity:analyze` | Renderer → Main | 执行工作产出分析 |
| `productivity:query` | Renderer → Main | 查询缓存的产出数据 |

## 涉及的现有文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/main/services/event-bus-types.ts` | 扩展 | 新增 report.generated 事件类型 + payload |
| `src/shared/types.ts` | 扩展 | IPC_CHANNELS 新增 report:* / productivity:* 常量 |
| `src/preload/index.ts` | 扩展 | 新增 report + productivity 命名空间 |

**不修改的文件：**

- `src/main/services/kanban/kanban-service.ts`（TASK010）— 仅调用，不修改
- `src/main/services/git-abstraction.ts` — 仅调用 getHistory/getCommitDiff
- `src/main/services/wiki-links/wiki-links-store.ts` — 仅调用 getLinkCount
- `src/main/services/event-log-store.ts` — 仅调用 read
- `resources/workflows/daily-summary-flow.yaml` — 共存，不修改不删除

---

**创建时间：** 2026-05-01
**最后更新：** 2026-05-01
**更新记录：**
- 2026-05-01 — 创建任务文档（含完整技术执行路径 9 步）