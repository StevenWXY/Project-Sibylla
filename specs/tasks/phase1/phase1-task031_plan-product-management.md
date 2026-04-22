# Plan 模式与 Plan 产物管理

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK031 |
| **任务标题** | Plan 模式与 Plan 产物管理 |
| **所属阶段** | Phase 1 - AI 模式系统、Plan 产物、Wiki 与能力整合 (Sprint 3.4) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

构建 Sprint 3.4 的核心新能力——Plan 模式产出的结构化计划作为一等公民文件。实现 PlanManager（计划文件的 CRUD、解析、渲染、归档）、Plan 解析器（Markdown frontmatter + 步骤提取）、Plan 渲染器（元数据 + 步骤 Markdown 生成）、FileWatcher 变更检测、`@plan-xxx` 对话引用解析，以及渲染进程的 PlanPreviewCard / PlanList / PlanEditor UI 组件。让用户从 AI 对话中得到一份可编辑、可勾选、可追踪的正式计划文件。

### 背景

TASK030 已实现 AiModeRegistry 和五种内置模式，其中 Plan 模式的 systemPromptPrefix 约束 AI 输出为结构化 Markdown（frontmatter + 步骤复选框）。但 AI 的输出目前只是一段对话文本，用户无法编辑步骤、追踪进度、归档为正式文档。TASK031 将 Plan 从"对话中的文本"升级为"文件系统中的一等公民"。

**核心设计约束：**

- **文件即真相**（CLAUDE.md 设计哲学）：Plan 以 Markdown 文件存储在 `.sibylla/plans/`，用户可直接用编辑器打开修改
- **PlanManager 与 TaskStateMachine 的分层**：PlanManager 负责 Markdown 文件的 CRUD/解析/渲染/归档；TaskStateMachine 负责内部任务执行引擎的 JSON 状态跟踪；当用户点击"开始执行"时，PlanManager 将步骤导出为 TaskStateMachine 任务
- **PlanManager 与 ProgressLedger 的联动**：Plan 开始执行时，向 ProgressLedger 声明一个任务，checklist 与 Plan 步骤同步
- **原子写入**（CLAUDE.md 安全红线）：所有 Plan 文件写入先写临时文件再原子替换

**现有代码关键约束：**

| 维度 | 现状 | TASK031 改造 |
|------|------|-------------|
| AiModeRegistry | `services/mode/ai-mode-registry.ts` — Plan 模式 systemPromptPrefix 已定义 | PlanManager 在 Plan 模式 AI 输出完成后被调用 |
| HarnessOrchestrator | `services/harness/orchestrator.ts` — executeInternal() | Plan 模式输出后触发 PlanManager.createFromAIOutput() |
| TaskStateMachine | `services/harness/task-state-machine.ts` — 内部任务执行引擎 | PlanManager.startExecution() 将步骤导出为 TSM 任务 |
| ProgressLedger | `services/progress/progress-ledger.ts` — progress.md 任务台账 | PlanManager.startExecution() 向 PL 声明任务 |
| FileManager | `services/file-manager.ts` — atomicWrite | PlanManager 使用 atomicWrite 写入计划文件 |
| ContextEngine | `services/context-engine.ts` — @引用解析 | 扩展 `@plan-xxx` 引用解析 |

### 范围

**包含：**
- `services/plan/types.ts` — PlanStatus / PlanMetadata / PlanStep / ParsedPlan
- `services/plan/plan-parser.ts` — frontmatter 解析 + 步骤提取 + 风险/成功标准提取
- `services/plan/plan-renderer.ts` — Plan 元数据 + 步骤 → Markdown 渲染
- `services/plan/plan-manager.ts` — PlanManager 中心管理器
- `services/plan/index.ts` — 统一导出
- `ipc/handlers/plan.ts` — IPC 通道注册
- `shared/types.ts` 扩展 — Plan IPC 通道常量
- `preload/index.ts` 扩展 — plan 命名空间
- `renderer/components/plan/PlanPreviewCard.tsx` — 对话气泡中的计划预览卡片
- `renderer/components/plan/PlanList.tsx` — 活动计划列表
- `renderer/components/plan/PlanEditor.tsx` — 计划编辑/勾选界面
- `renderer/store/planStore.ts` — Zustand 计划状态管理
- ContextEngine 扩展 — `@plan-xxx` 引用解析
- Orchestrator 集成 — Plan 模式输出后触发 PlanManager
- 单元测试

**不包含：**
- AiModeRegistry 模式定义（TASK030）
- 命令面板 Plan 命令注册（TASK032）
- Handbook Plan 文档（TASK033）
- 对话导出中 Plan 内容的处理（TASK034）

## 验收标准

### Plan 文件格式

- [ ] Plan 文件使用标准 Markdown 格式，包含 YAML frontmatter（`---` 包裹）
- [ ] frontmatter 至少包含：id / title / mode / status / created_at / updated_at / conversation_id / trace_id / tags
- [ ] 步骤使用 `- [ ]` / `- [x]` checkbox 格式，支持嵌套在 `### 子标题` 下
- [ ] 步骤行内元数据解析：`（预计 Xh，负责：谁）` 格式

### Plan 生命周期

- [ ] `draft` — 刚生成、用户未确认
- [ ] `in_progress` — 用户开始勾选或标记为执行中
- [ ] `completed` — 所有必要步骤完成
- [ ] `archived` — 归档为正式文档（移动到 `specs/plans/`）
- [ ] `abandoned` — 用户放弃
- [ ] `draft-unparsed` — 解析失败时保留原文

### PlanManager 核心 API

- [ ] `createFromAIOutput()` 解析 AI 输出、保存到 `.sibylla/plans/plan-{timestamp}.md`、返回 PlanMetadata
- [ ] 解析失败时保存原文并标记 `status: draft-unparsed`，通知用户
- [ ] `startExecution()` 设置 `status: in_progress`、导出步骤到 TaskStateMachine、向 ProgressLedger 声明任务
- [ ] `archiveAsFormalDocument()` 复制到目标路径、更新状态为 `archived`、原位置保留 stub
- [ ] `abandon()` 设置 `status: abandoned`
- [ ] `getActivePlans()` 返回 draft 和 in_progress 状态的计划
- [ ] `getPlan()` 返回完整解析后的 ParsedPlan
- [ ] `followUp()` AI 跟进检查进度，返回进度百分比和备注

### FileWatcher 变更检测

- [ ] 监听 `.sibylla/plans/` 目录变更
- [ ] 用户勾选 checkbox 后检测变更，更新 `updated_at`
- [ ] 检测到新完成步骤时发射 `plan:steps-completed` 事件
- [ ] 变更检测不影响编辑器性能

### @plan-xxx 引用

- [ ] 用户在对话中输入 `@plan-xxx` 时，ContextEngine 解析引用并注入计划内容
- [ ] 注入内容包含计划当前状态、步骤进度、关键元数据

### 自动归档

- [ ] draft 或 abandoned 状态超过 30 天无更新的计划自动归档
- [ ] 归档操作记录到 Trace

### UI 组件

- [ ] PlanPreviewCard 在对话气泡中显示计划预览 + "打开文件" / "归档为正式文档" / "开始执行" 按钮
- [ ] PlanList 展示所有活动计划（按更新时间倒序）
- [ ] PlanEditor 支持直接编辑计划文件（复用 Tiptap 编辑器）
- [ ] 所有按钮操作有 loading 状态和错误兜底（CLAUDE.md UI/UX 红线）

### Trace 集成

- [ ] Plan 创建产生 `plan.create` span
- [ ] Plan 开始执行产生 `plan.execute` span
- [ ] Plan 归档产生 `plan.archive` span
- [ ] 步骤完成产生 `plan.steps-completed` span

### IPC 集成

- [ ] `plan:getActive` / `plan:get` / `plan:startExecution` / `plan:archive` / `plan:abandon` / `plan:followUp` 通道注册且类型安全
- [ ] Push events（plan:created / plan:execution-started / plan:steps-completed / plan:archived）正确推送

## 依赖关系

### 前置依赖

- [x] TASK030 — AI 模式系统（AiModeRegistry + Plan 模式 systemPromptPrefix）
- [x] TASK018 — Generator/Evaluator 双 Agent 架构（HarnessOrchestrator）
- [x] TASK021 — 状态机追踪器（TaskStateMachine）
- [x] TASK028 — progress.md 任务台账（ProgressLedger）
- [x] TASK027 — Tracer SDK（Tracer / TraceStore）
- [x] FileManager（atomicWrite）
- [x] Zustand 状态管理已选型

### 被依赖任务

- TASK032 — 一键优化提示词与命令面板（命令面板需要注册 Plan 相关命令）
- TASK034 — 对话导出（导出时需处理 Plan 引用）

## 参考文档

- [`specs/requirements/phase1/sprint3.4-mode.md`](../../requirements/phase1/sprint3.4-mode.md) — 需求 3.4.2
- [`specs/design/architecture.md`](../../design/architecture.md) — 模块划分、进程通信架构
- [`specs/design/ui-ux-design.md`](../../design/ui-ux-design.md) — 色彩体系、交互规范
- [`CLAUDE.md`](../../../CLAUDE.md) — 文件即真相、原子写入、AI 建议/人类决策
- `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` — IPC 类型安全设计
- `.kilocode/skills/phase1/zustand-state-management/SKILL.md` — Zustand store 设计
- `.kilocode/skills/common/frontend-design/SKILL.md` — 前端设计规范
- `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` — TypeScript 严格模式

## 技术执行路径

### 架构设计

```
Plan 产物管理系统架构

src/main/services/
├── plan/                                ← Plan 产物管理（新建目录）
│   ├── types.ts                         ← PlanStatus / PlanMetadata / PlanStep / ParsedPlan
│   ├── plan-parser.ts                   ← Markdown frontmatter + 步骤提取
│   ├── plan-renderer.ts                 ← 元数据 + 步骤 → Markdown 渲染
│   ├── plan-manager.ts                  ← PlanManager 中心管理器
│   └── index.ts                         ← 统一导出
│
├── ipc/handlers/
│   └── plan.ts                          ← IPC: Plan 查询/执行/归档（新建）
│
└── (现有模块扩展)
    ├── harness/orchestrator.ts          ← Plan 模式输出后触发 PlanManager
    ├── services/context-engine.ts       ← @plan-xxx 引用解析
    └── shared/types.ts                  ← IPC 通道常量 + 类型扩展

src/renderer/
├── store/
│   └── planStore.ts                     ← Zustand 计划状态（新建）
│
├── components/
│   └── plan/                            ← Plan UI 目录（新建）
│       ├── PlanPreviewCard.tsx           ← 对话气泡计划预览
│       ├── PlanList.tsx                 ← 活动计划列表
│       └── PlanEditor.tsx              ← 计划编辑/勾选

数据流向：

AI 在 Plan 模式下生成响应
  → Orchestrator 检测到 plan 模式输出
  → PlanManager.createFromAIOutput({ aiContent, conversationId, traceId })
    → PlanParser.parsePlanMarkdown() → 提取 frontmatter + steps + risks + successCriteria
    → PlanRenderer.renderPlan() → 生成完整 Markdown
    → FileManager.atomicWrite('.sibylla/plans/plan-{id}.md')
    → EventBus.emit('plan:created')
  → 渲染进程收到 plan:created → 显示 PlanPreviewCard

用户点击"开始执行"
  → IPC plan:startExecution → PlanManager.startExecution(planId)
    → PlanParser 重新解析获取 steps
    → TaskStateMachine.create(title, steps.map(s => s.text)) → 导出步骤
    → ProgressLedger.declare({ title, mode: 'plan', plannedChecklist: steps })
    → 更新 frontmatter status → atomicWrite
    → EventBus.emit('plan:execution-started')

用户勾选 checkbox（编辑器中）
  → FileWatcher 检测 .sibylla/plans/ 变更
  → PlanManager.reloadPlan(filePath) → 重新解析 → 对比步骤完成状态
  → 新完成的步骤 → EventBus.emit('plan:steps-completed')

用户在对话中输入 @plan-xxx
  → ContextEngine 解析引用 → PlanManager.getPlan('plan-xxx')
  → 注入计划内容（标题、状态、步骤进度）到 AI 上下文

用户点击"归档为正式文档"
  → IPC plan:archive → PlanManager.archiveAsFormalDocument(planId, targetPath)
    → 读取原文件 → 更新 frontmatter status: 'archived'
    → FileManager.atomicWrite(targetPath, 更新后内容)
    → 原文件替换为 stub（指向归档位置）
    → EventBus.emit('plan:archived')

自动归档（定时任务）
  → PlanManager.cleanupStalePlans()
    → 遍历所有 draft/abandoned 计划
    → updated_at 超过 30 天 → 标记归档 + Trace 记录
```

### 步骤 1：定义 Plan 共享类型

**文件：** `src/main/services/plan/types.ts`

1. 定义 `PlanStatus` 联合类型：
   ```typescript
   export type PlanStatus =
     | 'draft'
     | 'draft-unparsed'
     | 'in_progress'
     | 'completed'
     | 'archived'
     | 'abandoned'
   ```

2. 定义 `PlanMetadata` 接口：
   ```typescript
   export interface PlanMetadata {
     id: string                          // plan-20260418-103000
     title: string
     mode: 'plan'
     status: PlanStatus
     createdAt: string                   // ISO 8601
     updatedAt: string                   // ISO 8601
     conversationId?: string
     traceId?: string
     estimatedDuration?: string          // ISO 8601 duration or human string
     tags: string[]
     filePath: string                    // 绝对路径
     archivedTo?: string                 // 归档目标路径
   }
   ```

3. 定义 `PlanStep` 接口：
   ```typescript
   export interface PlanStep {
     sectionTitle?: string               // 所属子标题（如"第 1 天"）
     text: string                        // 步骤描述（含行内元数据）
     done: boolean                       // checkbox 状态
     estimatedMinutes?: number           // 从"预计 Xh"解析
     owner?: string                      // 从"负责：谁"解析
     subSteps?: PlanStep[]               // 预留嵌套步骤
   }
   ```

4. 定义 `ParsedPlan` 接口：
   ```typescript
   export interface ParsedPlan {
     metadata: PlanMetadata
     goal?: string                       // ## 目标 段内容
     steps: PlanStep[]
     risks?: string[]                    // ## 风险与备案 段内容（按行）
     successCriteria?: string[]          // ## 成功标准 段内容（按行）
     rawMarkdown: string                 // 完整原始 Markdown
   }
   ```

5. 定义 `PlanCreateInput` 接口：
   ```typescript
   export interface PlanCreateInput {
     aiContent: string                   // AI 原始输出
     conversationId: string
     traceId: string
   }
   ```

6. 定义 `PlanFollowUpResult` 接口：
   ```typescript
   export interface PlanFollowUpResult {
     planId: string
     progress: number                    // 0-1 完成百分比
     completedSteps: number
     totalSteps: number
     notes: string[]                     // AI 分析的进度备注
   }
   ```

7. 定义 `PlanParseResult` 内部接口（解析器返回值）：
   ```typescript
   export interface PlanParseResult {
     parseSuccess: boolean
     title?: string
     goal?: string
     steps: PlanStep[]
     risks?: string[]
     successCriteria?: string[]
     tags: string[]
     rawMarkdown: string
     id: string
   }
   ```

8. 导出所有类型

### 步骤 2：实现 PlanParser

**文件：** `src/main/services/plan/plan-parser.ts`

1. 导出 `PlanParser` 类（纯函数式，无状态）

2. 实现 `parsePlanMarkdown(rawContent: string, id: string): PlanParseResult` 方法：
   - 包裹在 try/catch 中，catch 时返回 `{ parseSuccess: false, rawMarkdown: rawContent, steps: [], tags: [], id }`
   - **步骤 2a**：调用 `parseFrontmatter(rawContent)` 解析 YAML frontmatter
   - **步骤 2b**：调用 `stripFrontmatter(rawContent)` 获取 body
   - **步骤 2c**：从 body 提取 title：
     ```typescript
     const titleMatch = body.match(/^#\s+(.+)$/m)
     const title = titleMatch?.[1] ?? fm?.title
     ```
   - **步骤 2d**：从 body 提取 goal：
     ```typescript
     const goalMatch = body.match(/##\s*目标\s*\n([\s\S]*?)(?=\n##|$)/)
     const goal = goalMatch?.[1]?.trim()
     ```
   - **步骤 2e**：调用 `extractSteps(body)` 提取步骤列表
   - **步骤 2f**：若 steps.length === 0 → 返回 `{ parseSuccess: false, ... }`
   - **步骤 2g**：调用 `extractSection(body, '风险与备案')` 提取风险
   - **步骤 2h**：调用 `extractSection(body, '成功标准')` 提取成功标准
   - **步骤 2i**：从 frontmatter 提取 tags（`fm?.tags ?? []`）
   - **步骤 2j**：返回完整的 PlanParseResult

3. 实现 `parseFrontmatter(content: string)` 私有方法：
   - 正则匹配 `^---\n([\s\S]*?)\n---`
   - 若匹配到，`yaml.parse(match[1])` 解析为对象
   - 若无 frontmatter，返回 `null`

4. 实现 `stripFrontmatter(content: string)` 私有方法：
   - 正则替换 `^---\n[\s\S]*?\n---\n*` 为空字符串

5. 实现 `extractSteps(body: string): PlanStep[]` 私有方法：
   - 初始化 `steps: PlanStep[] = []` 和 `currentSection: string | undefined`
   - 按 `\n` 分割 body 为 lines
   - 遍历每一行：
     - 匹配 `###` 子标题：`line.match(/^###\s+(.+)$/)` → 更新 currentSection，continue
     - 匹配 checkbox 步骤：`line.match(/^\s*-\s+\[([ xX])\]\s+(.+)$/)`
       - `done = match[1].toLowerCase() === 'x'`
       - `text = match[2]`
       - 调用 `parseInlineMetadata(text)` 提取 estimatedMinutes 和 owner
       - 推入 steps：`{ sectionTitle: currentSection, text, done, estimatedMinutes, owner }`
   - 返回 steps

6. 实现 `parseInlineMetadata(text: string)` 私有方法：
   - duration 匹配：`text.match(/预计\s*(\d+)\s*([hmd])/)`
     - h → `parseInt(match[1]) * 60`
     - m → `parseInt(match[1])`
     - d → `parseInt(match[1]) * 480`（8h/天）
   - owner 匹配：`text.match(/负责[：:]\s*([^，,)]+)/)`
   - 返回 `{ estimatedMinutes?: number, owner?: string }`

7. 实现 `extractSection(body: string, sectionTitle: string): string[]` 私有方法：
   - 正则匹配 `##\s*${sectionTitle}\s*\n([\s\S]*?)(?=\n##|$)`
   - 取匹配到的内容，按 `\n` 分割
   - 过滤空行和纯 `-` 分隔线
   - 返回非空行数组

8. 实现 `parsePlanFile(content: string, metadata: PlanMetadata | null): ParsedPlan | null` 方法：
   - 用于从已有文件重新解析
   - 调用 `parsePlanMarkdown(content, metadata?.id ?? 'unknown')`
   - 若 metadata 不为 null，合并外部 metadata（覆盖 id、filePath 等）
   - 返回完整 ParsedPlan

### 步骤 3：实现 PlanRenderer

**文件：** `src/main/services/plan/plan-renderer.ts`

1. 导出 `PlanRenderer` 类（纯函数式，无状态）

2. 实现 `renderPlan(metadata: PlanMetadata, parsed: PlanParseResult): string` 方法：
   - 调用 `renderFrontmatter(metadata)` 生成 YAML frontmatter
   - 调用 `renderTitle(metadata.title)` 生成标题行
   - 调用 `renderGoal(parsed.goal)` 生成目标段
   - 调用 `renderSteps(parsed.steps)` 生成步骤段
   - 调用 `renderRisks(parsed.risks)` 生成风险段
   - 调用 `renderSuccessCriteria(parsed.successCriteria)` 生成成功标准段
   - 按空行拼接所有段落
   - 返回完整 Markdown 字符串

3. 实现 `renderFrontmatter(metadata: PlanMetadata): string` 私有方法：
   - 构建对象：
     ```typescript
     const fm = {
       id: metadata.id,
       title: metadata.title,
       mode: 'plan',
       status: metadata.status,
       created_at: metadata.createdAt,
       updated_at: metadata.updatedAt,
       conversation_id: metadata.conversationId,
       trace_id: metadata.traceId,
       estimated_duration: metadata.estimatedDuration,
       tags: metadata.tags,
     }
     ```
   - 使用 `yaml.stringify(fm)` 序列化
   - 包裹在 `---\n` 和 `\n---` 之间

4. 实现 `renderTitle(title: string): string` 私有方法：
   - 返回 `# ${title}\n`

5. 实现 `renderGoal(goal?: string): string` 私有方法：
   - 若 goal 为空 → 返回空字符串
   - 返回 `## 目标\n\n${goal}\n`

6. 实现 `renderSteps(steps: PlanStep[]): string` 私有方法：
   - 初始化 `sections: Map<string, PlanStep[]>` — 按 sectionTitle 分组
   - 遍历 steps：
     - key = step.sectionTitle ?? '__default__'
     - 推入对应 sections 数组
   - 遍历 sections：
     - 若 key !== '__default__' → 追加 `### ${key}\n`
     - 遍历该组 steps：
       - checkbox = step.done ? '- [x]' : '- [ ]'
       - 追加 `${checkbox} ${step.text}\n`
   - 头部追加 `## 步骤\n\n`
   - 返回拼接结果

7. 实现 `renderRisks(risks?: string[]): string` 私有方法：
   - 若 risks 为空或 length === 0 → 返回空字符串
   - 返回 `## 风险与备案\n\n${risks.join('\n')}\n`

8. 实现 `renderSuccessCriteria(criteria?: string[]): string` 私有方法：
   - 若 criteria 为空或 length === 0 → 返回空字符串
   - 返回 `## 成功标准\n\n${criteria.join('\n')}\n`

9. 实现 `renderArchivedStub(metadata: PlanMetadata, archivedPath: string): string` 方法：
   - 生成归档 stub 文件内容：
     ```markdown
     ---
     id: {metadata.id}
     status: archived
     archived_to: {archivedPath}
     archived_at: {now}
     ---
     
     # {metadata.title}
     
     > 此计划已归档为正式文档。
     > 归档位置：{archivedPath}
     ```

10. 实现 `updateFrontmatter(content: string, updates: Record<string, unknown>): string` 方法：
    - 解析现有 frontmatter
    - 合并 updates 到 frontmatter 对象
    - 重新渲染 frontmatter
    - 替换原 content 中的 frontmatter 段
     - 若原 content 无 frontmatter → 在开头插入新 frontmatter

### 步骤 4：实现 PlanManager 核心

**文件：** `src/main/services/plan/plan-manager.ts`

1. 构造函数注入：
   ```typescript
   constructor(
     private workspaceRoot: string,
     private fileManager: FileManager,
     private tracer: Tracer,
     private eventBus: EventBus,
     private progressLedger: ProgressLedger,
     private taskStateMachine: TaskStateMachine,
     private logger: Logger
   )
   ```

2. 内部状态：
   - `plans: Map<string, PlanMetadata>` — 所有已加载的计划元数据索引
   - `fileWatcher: FileWatcher | null` — 文件监听器
   - `parser: PlanParser` — 解析器实例
   - `renderer: PlanRenderer` — 渲染器实例

3. 实现 `initialize()` 方法：
   - 调用 `loadExistingPlans()` — 扫描 `.sibylla/plans/` 目录加载已有计划
   - 调用 `startFileWatcher()` — 启动文件变更监听
   - `logger.info('plan.manager.initialized', { count: this.plans.size })`

4. 实现 `loadExistingPlans()` 私有方法：
   - 检查 `.sibylla/plans/` 目录是否存在，不存在则创建
   - 列出目录中所有 `plan-*.md` 文件
   - 对每个文件：
     - 读取内容
     - 调用 `parser.parseFrontmatter(content)` 提取元数据
     - 构建临时 PlanMetadata（从 frontmatter 字段映射）
     - 推入 `this.plans` Map
   - 跳过无 frontmatter 或解析失败的文件（logger.warn）

5. 实现 `createFromAIOutput(input: PlanCreateInput): Promise<PlanMetadata>` 方法：
   - 包裹在 `tracer.withSpan('plan.create', async (span) => { ... }, { kind: 'system' })` 中
   - 生成 id：`plan-${this.timestamp()}`（格式 `plan-YYYYMMDD-HHmmss`）
   - 调用 `parser.parsePlanMarkdown(input.aiContent, id)` 解析 AI 输出
   - 构建 PlanMetadata：
     ```typescript
     const metadata: PlanMetadata = {
       id,
       title: parsed.title ?? 'Untitled Plan',
       mode: 'plan',
       status: parsed.parseSuccess ? 'draft' : 'draft-unparsed',
       createdAt: new Date().toISOString(),
       updatedAt: new Date().toISOString(),
       conversationId: input.conversationId,
       traceId: input.traceId,
       tags: parsed.tags ?? [],
       filePath: this.planFilePath(id),
     }
     ```
   - 调用 `renderer.renderPlan(metadata, parsed)` 生成完整 Markdown
   - 调用 `fileManager.atomicWrite(metadata.filePath, finalMarkdown)` — 原子写入
   - `this.plans.set(id, metadata)`
   - `this.eventBus.emit('plan:created', metadata)`
   - span.setAttributes：plan.id、plan.parse_success、plan.step_count
   - 返回 metadata

6. 实现 `startExecution(planId: string): Promise<void>` 方法：
   - 获取 plan：`const plan = this.plans.get(planId)`
   - 若 `!plan` → throw `Error('Plan not found: ${planId}')`
   - 更新状态：
     ```typescript
     plan.status = 'in_progress'
     plan.updatedAt = new Date().toISOString()
     ```
   - 调用 `persistMetadata(plan)` 写入更新
   - 重新解析获取步骤：
     ```typescript
     const parsed = await this.getPlan(planId)
     const steps = parsed?.steps.map(s => s.text) ?? ['Execute plan']
     ```
   - 导出到 TaskStateMachine：
     ```typescript
     const taskState = await this.taskStateMachine.create(plan.title, steps)
     ```
   - 向 ProgressLedger 声明任务：
     ```typescript
     await this.progressLedger.declare({
       title: `执行计划: ${plan.title}`,
       mode: 'plan',
       traceId: plan.traceId,
       conversationId: plan.conversationId,
       plannedChecklist: steps,
     })
     ```
   - `this.eventBus.emit('plan:execution-started', plan)`

7. 实现 `archiveAsFormalDocument(planId: string, targetPath: string): Promise<PlanMetadata>` 方法：
   - 获取 plan
   - 计算绝对路径：`path.isAbsolute(targetPath) ? targetPath : path.join(this.workspaceRoot, targetPath)`
   - 读取原文件内容
   - 调用 `renderer.updateFrontmatter(content, { status: 'archived', archivedAt: new Date().toISOString(), archivedTo: targetPath })`
   - `fileManager.atomicWrite(absoluteTargetPath, updatedContent)` — 写入归档位置
   - 生成 stub：`renderer.renderArchivedStub(plan, absoluteTargetPath)`
   - `fileManager.atomicWrite(plan.filePath, stub)` — 原位置替换为 stub
   - 更新内存状态：`plan.status = 'archived'`、`plan.filePath = absoluteTargetPath`、`plan.updatedAt = now`
   - `this.eventBus.emit('plan:archived', plan)`
   - 返回更新后的 metadata

8. 实现 `abandon(planId: string): Promise<void>` 方法：
   - 获取 plan
   - 更新 frontmatter status → 'abandoned'
   - `plan.status = 'abandoned'`、`plan.updatedAt = now`
   - 调用 `persistMetadata(plan)`
   - `this.eventBus.emit('plan:abandoned', plan)`

9. 实现 `getActivePlans(): Promise<PlanMetadata[]>` 方法：
   - 过滤 `status === 'draft' || status === 'in_progress'`
   - 按 `updatedAt` 降序排序
   - 返回数组

10. 实现 `getPlan(id: string): Promise<ParsedPlan | null>` 方法：
    - 获取 metadata：`const metadata = this.plans.get(id)`
    - 若 `!metadata` → 返回 null
    - 读取文件内容：`fileManager.readFile(metadata.filePath)`
    - 调用 `parser.parsePlanFile(content, metadata)`
    - 返回 ParsedPlan

11. 实现 `followUp(planId: string): Promise<PlanFollowUpResult>` 方法：
    - 获取 ParsedPlan：`const parsed = await this.getPlan(planId)`
    - 若 `!parsed` → throw Error
    - 计算进度：
      ```typescript
      const totalSteps = parsed.steps.length
      const completedSteps = parsed.steps.filter(s => s.done).length
      const progress = totalSteps > 0 ? completedSteps / totalSteps : 0
      ```
    - 生成备注：比较最近 actions（通过 Trace/progress.md）与步骤
    - 返回 `{ planId, progress, completedSteps, totalSteps, notes }`

12. 实现 `persistMetadata(plan: PlanMetadata)` 私有方法：
    - 读取当前文件内容
    - 调用 `renderer.updateFrontmatter(content, { status: plan.status, updated_at: plan.updatedAt })`
    - `fileManager.atomicWrite(plan.filePath, updatedContent)`

13. 实现 `planFilePath(id: string): string` 私有方法：
    - `return path.join(this.workspaceRoot, '.sibylla/plans', '${id}.md')`

14. 实现 `timestamp(): string` 私有方法：
     - 格式 `YYYYMMDD-HHmmss`

### 步骤 5：实现 FileWatcher 变更检测

**文件：** `src/main/services/plan/plan-manager.ts`（续）

1. 实现 `startFileWatcher()` 私有方法：
   - 监听路径：`path.join(this.workspaceRoot, '.sibylla/plans/')`
   - 使用 Node.js `fs.watch` 或项目已有的 `watchDirectory` 工具
   - 事件处理：
     ```typescript
     this.fileWatcher = watchDirectory(watchPath, async (event) => {
       if (event.type === 'change' && event.path.endsWith('.md')) {
         await this.reloadPlan(event.path)
       }
     })
     ```
   - `fileWatcher` 赋值到 `this.fileWatcher` 字段

2. 实现 `reloadPlan(filePath: string): Promise<void>` 私有方法：
   - 读取文件内容：`fileManager.readFile(filePath)`
   - 调用 `parser.parsePlanFile(content, null)` 重新解析
   - 若解析失败 → `logger.warn('plan.reload.parse-failed', { filePath })`，return
   - 从解析结果中提取 plan id
   - 查找内存中已有的 metadata：`this.plans.get(parsedId)`
   - **变更检测**（仅在已有记录时执行）：
     - 调用 `flattenSteps(existing)` 和 `flattenSteps(parsed)` 获取扁平化步骤列表
     - 对比每个步骤的 `done` 状态
     - 收集 newlyCompleted：`stepsAfter.filter((s, i) => s.done && !stepsBefore[i]?.done)`
     - 若 `newlyCompleted.length > 0` → `this.eventBus.emit('plan:steps-completed', { planId: parsedId, completed: newlyCompleted })`
   - 更新内存 metadata：`parsed.metadata.updatedAt = new Date().toISOString()`
   - `this.plans.set(parsedId, parsed.metadata)`

3. 实现 `flattenSteps(parsedOrMetadata: ParsedPlan | PlanMetadata): PlanStep[]` 私有方法：
   - 若为 ParsedPlan → 直接返回 `parsed.steps`
   - 若为 PlanMetadata → 重新解析文件获取步骤（缓存优化可选）

4. 实现 `stopFileWatcher()` 方法：
   - 若 `this.fileWatcher` 存在 → `this.fileWatcher.close()`
   - `this.fileWatcher = null`

### 步骤 6：实现自动归档与清理

**文件：** `src/main/services/plan/plan-manager.ts`（续）

1. 实现 `cleanupStalePlans(): Promise<number>` 方法：
   - 遍历 `this.plans` 中所有 `status === 'draft' || status === 'abandoned'` 的计划
   - 对每个计划计算 `Date.now() - new Date(plan.updatedAt).getTime()`
   - 若超过 30 天（`30 * 24 * 60 * 60 * 1000` ms）：
     - `tracer.withSpan('plan.auto-archive', ...)` 包裹
     - 更新 status 为 'archived'
     - 调用 `persistMetadata(plan)`
     - `logger.info('plan.auto-archived', { planId: plan.id, staleDays })`
   - 返回归档数量

2. 注册定时清理（在 `initialize()` 中）：
   - `setInterval(() => this.cleanupStalePlans(), 24 * 60 * 60 * 1000)` — 每 24 小时检查一次
   - 存储 intervalId 以便 `dispose()` 时清理

3. 实现 `dispose()` 方法：
   - `this.stopFileWatcher()`
   - 清理定时 interval
   - `this.plans.clear()`

### 步骤 7：实现 @plan-xxx 引用解析

**文件：** `src/main/services/context-engine.ts`（扩展）

1. 在 `resolveManualRefs(refs: string[])` 方法中扩展：
   - 遍历 refs，检测 `@plan-` 前缀的引用
   - 对每个 `@plan-xxx` 引用：
     - 提取 planId：`ref.replace('@plan-', 'plan-')`
     - 调用 `planManager.getPlan(planId)` 获取 ParsedPlan
     - 若存在 → 构建 context section：
       ```typescript
       sections.push({
         type: 'plan-reference',
         label: `🗺️ 计划: ${parsed.metadata.title}`,
         content: this.formatPlanReference(parsed),
         metadata: { planId }
       })
       ```
     - 若不存在 → 忽略（logger.debug）

2. 新增 `formatPlanReference(parsed: ParsedPlan): string` 私有方法：
   - 构建引用文本：
     ```
     状态: {metadata.status}
     创建: {metadata.createdAt}
     进度: {completedSteps}/{totalSteps} 步骤完成

     ## 步骤
     {每个步骤的 checkbox + text，保持原格式}

     ## 目标
     {goal}

     ## 风险与备案
     {risks}
     ```

3. 注入 PlanManager 依赖：
   - ContextEngine 构造函数新增可选参数 `planManager?: PlanManager`
   - 或通过 `setPlanManager(pm)` 方法注入

### 步骤 8：实现统一导出

**文件：** `src/main/services/plan/index.ts`

1. 从 `types.ts` 导出所有类型：
   - `PlanStatus`, `PlanMetadata`, `PlanStep`, `ParsedPlan`, `PlanCreateInput`, `PlanFollowUpResult`, `PlanParseResult`
2. 从 `plan-parser.ts` 导出 `PlanParser`
3. 从 `plan-renderer.ts` 导出 `PlanRenderer`
4. 从 `plan-manager.ts` 导出 `PlanManager`

### 步骤 9：扩展 shared/types.ts

**文件：** `src/shared/types.ts`（扩展）

1. 在 `IPC_CHANNELS` 中追加 Plan 相关通道：
   ```
   PLAN_GET_ACTIVE: 'plan:getActive'
   PLAN_GET: 'plan:get'
   PLAN_START_EXECUTION: 'plan:startExecution'
   PLAN_ARCHIVE: 'plan:archive'
   PLAN_ABANDON: 'plan:abandon'
   PLAN_FOLLOW_UP: 'plan:followUp'
   ```

2. 在 `IPCChannelMap` 中追加类型映射：
   - `PLAN_GET_ACTIVE` → `{ params: []; return: PlanMetadata[] }`
   - `PLAN_GET` → `{ params: [id: string]; return: ParsedPlan | null }`
   - `PLAN_START_EXECUTION` → `{ params: [id: string]; return: void }`
   - `PLAN_ARCHIVE` → `{ params: [id: string, targetPath: string]; return: PlanMetadata }`
   - `PLAN_ABANDON` → `{ params: [id: string]; return: void }`
   - `PLAN_FOLLOW_UP` → `{ params: [id: string]; return: PlanFollowUpResult }`

3. 新增 Push Event 常量（Main → Renderer）：
   ```
   PLAN_CREATED: 'plan:created'
   PLAN_EXECUTION_STARTED: 'plan:execution-started'
   PLAN_STEPS_COMPLETED: 'plan:steps-completed'
   PLAN_ARCHIVED: 'plan:archived'
   PLAN_ABANDONED: 'plan:abandoned'
   ```

4. 新增 Push Event 类型映射：
   - `'plan:created'` → `(plan: PlanMetadata) => void`
   - `'plan:execution-started'` → `(plan: PlanMetadata) => void`
   - `'plan:steps-completed'` → `(event: { planId: string; completed: PlanStep[] }) => void`
   - `'plan:archived'` → `(plan: PlanMetadata) => void`
   - `'plan:abandoned'` → `(plan: PlanMetadata) => void`

### 步骤 10：实现 IPC Handler

**文件：** `src/main/ipc/handlers/plan.ts`（新建）

1. 导出 `registerPlanHandlers` 函数：
   ```typescript
   export function registerPlanHandlers(
     ipcMain: Electron.IpcMain,
     planManager: PlanManager,
     logger: Logger
   ): void
   ```

2. 注册 `PLAN_GET_ACTIVE` handler：
   ```typescript
   ipcMain.handle('plan:getActive', async () => {
     return planManager.getActivePlans()
   })
   ```

3. 注册 `PLAN_GET` handler：
   ```typescript
   ipcMain.handle('plan:get', async (_event, id: string) => {
     return planManager.getPlan(id)
   })
   ```

4. 注册 `PLAN_START_EXECUTION` handler：
   ```typescript
   ipcMain.handle('plan:startExecution', async (_event, id: string) => {
     await planManager.startExecution(id)
   })
   ```

5. 注册 `PLAN_ARCHIVE` handler：
   ```typescript
   ipcMain.handle('plan:archive', async (_event, id: string, targetPath: string) => {
     return planManager.archiveAsFormalDocument(id, targetPath)
   })
   ```

6. 注册 `PLAN_ABANDON` handler：
   ```typescript
   ipcMain.handle('plan:abandon', async (_event, id: string) => {
     await planManager.abandon(id)
   })
   ```

7. 注册 `PLAN_FOLLOW_UP` handler：
   ```typescript
   ipcMain.handle('plan:followUp', async (_event, id: string) => {
     return planManager.followUp(id)
   })
   ```

8. 注册 Push Event 转发：
   ```typescript
   eventBus.on('plan:created', (plan) => webContents.send('plan:created', plan))
   eventBus.on('plan:execution-started', (plan) => webContents.send('plan:execution-started', plan))
   eventBus.on('plan:steps-completed', (data) => webContents.send('plan:steps-completed', data))
   eventBus.on('plan:archived', (plan) => webContents.send('plan:archived', plan))
   eventBus.on('plan:abandoned', (plan) => webContents.send('plan:abandoned', plan))
   ```

9. 错误处理：
   - 所有 handler 包裹 try/catch
   - catch 中 `logger.error('plan.ipc.error', { channel, error })`

10. 在 `src/main/index.ts` 中注册：
    ```typescript
    registerPlanHandlers(ipcMain, planManager, logger)
    ```

### 步骤 11：Preload API 扩展

**文件：** `src/preload/index.ts`（扩展）

1. 在 `window.sibylla` 命名空间下新增 `plan` 对象：
   ```typescript
   plan: {
     getActivePlans: () => ipcRenderer.invoke('plan:getActive'),
     getPlan: (id: string) => ipcRenderer.invoke('plan:get', id),
     startExecution: (id: string) => ipcRenderer.invoke('plan:startExecution', id),
     archive: (id: string, targetPath: string) => ipcRenderer.invoke('plan:archive', id, targetPath),
     abandon: (id: string) => ipcRenderer.invoke('plan:abandon', id),
     followUp: (id: string) => ipcRenderer.invoke('plan:followUp', id),
     onPlanCreated: (callback: (plan: PlanMetadata) => void) => {
       const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data as PlanMetadata)
       ipcRenderer.on('plan:created', handler)
       return () => ipcRenderer.removeListener('plan:created', handler)
     },
     onPlanExecutionStarted: (callback: (plan: PlanMetadata) => void) => {
       const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data as PlanMetadata)
       ipcRenderer.on('plan:execution-started', handler)
       return () => ipcRenderer.removeListener('plan:execution-started', handler)
     },
     onStepsCompleted: (callback: (event: { planId: string; completed: PlanStep[] }) => void) => {
       const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data as typeof event)
       ipcRenderer.on('plan:steps-completed', handler)
       return () => ipcRenderer.removeListener('plan:steps-completed', handler)
     },
     onPlanArchived: (callback: (plan: PlanMetadata) => void) => {
       const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data as PlanMetadata)
       ipcRenderer.on('plan:archived', handler)
       return () => ipcRenderer.removeListener('plan:archived', handler)
     },
   }
   ```

2. 在 `contextBridge.exposeInMainWorld` 的类型声明中追加 `plan` 字段

### 步骤 12：Orchestrator 集成（Plan 模式输出触发）

**文件：** `src/main/services/harness/orchestrator.ts`（扩展）

1. 新增私有字段：
   ```typescript
   private planManager: PlanManager | null = null
   ```

2. 新增 `setPlanManager(pm: PlanManager): void` 方法：
   - `this.planManager = pm`

3. 在 `executeInternal()` 方法的 return 之前，插入 Plan 模式检测逻辑：
   ```typescript
   if (aiMode?.id === 'plan' && this.planManager && result.finalResponse.content) {
     try {
       const planMetadata = await this.planManager.createFromAIOutput({
         aiContent: result.finalResponse.content,
         conversationId: request.sessionId,
         traceId: rootSpan?.context()?.traceId ?? '',
       })
       result = {
         ...result,
         planMetadata,
       }
     } catch (err) {
       this.logger.warn('plan.create.failed', { error: String(err) })
     }
   }
   ```
   - 仅当 `aiMode.id === 'plan'` 时触发
   - 失败不中断响应返回（降级但继续）
   - `planMetadata` 附加到 HarnessResult 以便渲染进程显示 PlanPreviewCard

4. 扩展 `HarnessResult` 接口（在 `shared/types.ts` 中）：
   - 新增可选字段 `planMetadata?: PlanMetadata`

5. **Plan 模式非计划输出处理**（需求 3.4.2 验收标准 10）：
   - 若 AI 输出不含 `## 步骤` 且不含 `- [ ]` checkbox，PlanParser 返回 parseSuccess=false
   - PlanManager 保存为 `draft-unparsed`
   - result.modeWarnings 追加提示："Plan 模式已开启，但本次回复非计划输出"

### 步骤 13：实现 planStore（Zustand）

**文件：** `src/renderer/store/planStore.ts`（新建）

1. 定义 `PlanState` 接口：
   ```typescript
   interface PlanState {
     activePlans: PlanMetadata[]
     currentPlan: ParsedPlan | null
     loading: boolean
     error: string | null
   }
   ```

2. 定义 `PlanActions` 接口：
   ```typescript
   interface PlanActions {
     fetchActivePlans: () => Promise<void>
     fetchPlan: (id: string) => Promise<void>
     startExecution: (id: string) => Promise<void>
     archive: (id: string, targetPath: string) => Promise<void>
     abandon: (id: string) => Promise<void>
     followUp: (id: string) => Promise<PlanFollowUpResult>
     clearError: () => void
   }
   ```

3. 创建 `usePlanStore = create<PlanState & PlanActions>()((set, get) => ({...}))`

4. 实现 `fetchActivePlans` action：
   - `set({ loading: true, error: null })`
   - `const plans = await window.sibylla.plan.getActivePlans()`
   - `set({ activePlans: plans, loading: false })`
   - catch → `set({ error: String(err), loading: false })`

5. 实现 `fetchPlan` action：
   - `const plan = await window.sibylla.plan.getPlan(id)`
   - `set({ currentPlan: plan })`

6. 实现 `startExecution` action：
   - `await window.sibylla.plan.startExecution(id)`
   - 从 `activePlans` 中更新对应 plan 的 status 为 'in_progress'

7. 实现 `archive` action：
   - `const updated = await window.sibylla.plan.archive(id, targetPath)`
   - 从 `activePlans` 中移除该 plan（已归档不再活动）

8. 实现 `abandon` action：
   - `await window.sibylla.plan.abandon(id)`
   - 从 `activePlans` 中移除该 plan

9. 实现 `followUp` action：
   - `return await window.sibylla.plan.followUp(id)`

10. 监听 IPC Push Events：
    - `plan:created` → 追加到 activePlans
    - `plan:execution-started` → 更新对应 plan status
    - `plan:steps-completed` → 若 currentPlan 匹配，重新 fetchPlan
    - `plan:archived` → 从 activePlans 中移除

11. 应用启动时自动调用 `fetchActivePlans()`

### 步骤 14：实现 PlanPreviewCard UI 组件

**文件：** `src/renderer/components/plan/PlanPreviewCard.tsx`（新建）

1. Props 接口：
   ```typescript
   interface PlanPreviewCardProps {
     planMetadata: PlanMetadata
     conversationId: string
   }
   ```

2. 使用 `usePlanStore` 获取 actions

3. 渲染布局：
   - **头部区域**：
     - 🗺️ 计划图标 + 标题（粗体）
     - 状态 pill（颜色映射：draft=蓝、in_progress=绿、completed=灰、abandoned=红）
     - 标签列表（tags）
   - **进度概览**：
     - 显示步骤进度条：`completedSteps / totalSteps 步骤完成`
     - 进度条使用 `plan.color`（#3b82f6）作为填充色
   - **操作按钮区**（根据 status 条件渲染）：
     - **status === 'draft'**：
       - [开始执行] 按钮（绿色） → `planStore.startExecution(planId)`
       - [打开文件] 按钮 → 调用 `file:open` IPC 打开 `.sibylla/plans/plan-xxx.md`
     - **status === 'in_progress'**：
       - [跟进进度] 按钮 → 调用 `planStore.followUp(planId)` → 显示进度报告
       - [归档为正式文档] 按钮 → 打开路径选择对话框 → `planStore.archive(planId, targetPath)`
       - [放弃] 按钮（灰色，需确认） → `planStore.abandon(planId)`
     - **status === 'draft-unparsed'**：
       - 提示文本："⚠️ 计划格式解析失败，请手动编辑"
       - [打开文件] 按钮
   - 所有按钮有 loading 状态和 error 兜底

4. 跟进进度面板（展开/折叠）：
   - 显示 followUp 返回的进度百分比
   - 显示未完成步骤列表
   - 显示 AI 生成的备注

5. 在 StudioAIPanel 中挂载：
   - AI 消息气泡中若 `result.planMetadata` 存在 → 渲染 `<PlanPreviewCard />`

### 步骤 15：实现 PlanList 活动计划列表

**文件：** `src/renderer/components/plan/PlanList.tsx`（新建）

1. Props 接口：
   ```typescript
   interface PlanListProps {
     onSelect?: (planId: string) => void
   }
   ```

2. 使用 `usePlanStore` 获取状态：
   - `const { activePlans, loading, fetchActivePlans } = usePlanStore()`

3. 挂载时调用 `fetchActivePlans()`

4. 渲染布局：
   - **头部**：`🗺️ 活动计划` + 计划数量 badge
   - **空状态**：`暂无活动计划。在 Plan 模式下让 AI 生成计划。`
   - **列表**：遍历 `activePlans`，每个条目渲染：
     - 标题（粗体）+ 状态 pill
     - 创建时间（相对时间格式，如"2 小时前"）
     - 步骤进度（如有）：`3/7 步骤完成`
     - 对话链接（跳转到对应对话）
     - hover 效果
     - 点击调用 `onSelect?.(plan.id)` 或直接打开 PlanEditor

5. 自动刷新：
   - 监听 `plan:created` / `plan:steps-completed` / `plan:archived` events
   - 收到事件后调用 `fetchActivePlans()`

### 步骤 16：实现 PlanEditor 计划编辑/勾选界面

**文件：** `src/renderer/components/plan/PlanEditor.tsx`（新建）

1. Props 接口：
   ```typescript
   interface PlanEditorProps {
     planId: string
   }
   ```

2. 使用 `usePlanStore` 获取 currentPlan

3. 挂载时调用 `fetchPlan(planId)`

4. 渲染布局（只读元数据 + 可编辑步骤）：
   - **元数据区**（只读）：
     - 标题、状态、创建/更新时间
     - 标签列表
   - **目标区**（只读）：
     - 渲染 ParsedPlan.goal
   - **步骤区**（可交互）：
     - 按 sectionTitle 分组渲染
     - 每个步骤渲染为 checkbox + text
     - checkbox 点击 → 切换 done 状态 → 直接修改 plan 文件内容 → 保存
     - **交互方式**：
       - 读取 ParsedPlan.rawMarkdown
       - 在 rawMarkdown 中找到对应的 `- [ ] text` 或 `- [x] text`
       - 切换 checkbox 状态
       - 调用 `file:writeContent` IPC 写入更新后的 Markdown
       - FileWatcher 检测变更 → PlanManager 重新解析 → 事件推送 → UI 自动刷新
   - **风险区**（只读）：
     - 渲染 risks 列表
   - **成功标准区**（只读）：
     - 渲染 successCriteria 列表
   - **底部操作栏**：
     - [在编辑器中打开] 按钮 → 打开外部 Markdown 编辑器
     - [归档为正式文档] 按钮（仅 in_progress 状态）
     - [放弃] 按钮（需确认对话框）

5. 自动刷新：
   - 监听 `plan:steps-completed` event
   - 若 planId 匹配 → 重新 `fetchPlan(planId)`

### 步骤 17：主进程初始化与装配

**文件：** `src/main/index.ts`（扩展）

1. 在 `onWorkspaceOpened` 中创建 PlanManager：
   ```typescript
   const planManager = new PlanManager(
     workspaceRoot,
     fileManager,
     tracer,
     appEventBus,
     progressLedger,
     taskStateMachine,
     logger
   )
   await planManager.initialize()
   ```

2. 注入到 Orchestrator：
   ```typescript
   orchestrator.setPlanManager(planManager)
   ```

3. 注入到 ContextEngine：
   ```typescript
   contextEngine.setPlanManager(planManager)
   ```

4. 注册 Plan IPC Handler：
   ```typescript
   registerPlanHandlers(ipcMain, planManager, logger)
   ```

5. 注册 EventBus → Renderer 推送：
   ```typescript
   appEventBus.on('plan:created', (plan) => mainWindow.webContents.send('plan:created', plan))
   appEventBus.on('plan:execution-started', (plan) => mainWindow.webContents.send('plan:execution-started', plan))
   appEventBus.on('plan:steps-completed', (data) => mainWindow.webContents.send('plan:steps-completed', data))
   appEventBus.on('plan:archived', (plan) => mainWindow.webContents.send('plan:archived', plan))
   appEventBus.on('plan:abandoned', (plan) => mainWindow.webContents.send('plan:abandoned', plan))
   ```

6. 在 `onWorkspaceClosed` 中：
   - `planManager.dispose()`

## 测试计划

### 单元测试文件结构

```
tests/plan/
├── plan-parser.test.ts                ← PlanParser 解析逻辑测试
├── plan-renderer.test.ts              ← PlanRenderer 渲染逻辑测试
└── plan-manager.test.ts              ← PlanManager 核心 API 测试

tests/renderer/
├── plan-preview-card.test.tsx         ← PlanPreviewCard 组件测试
├── plan-list.test.tsx                 ← PlanList 组件测试
├── plan-editor.test.tsx               ← PlanEditor 组件测试
└── plan-store.test.ts                 ← Zustand store 测试
```

### plan-parser.test.ts 测试用例

1. **parse full plan** — 完整结构计划解析成功，提取 title / goal / steps / risks / criteria
2. **parse plan with frontmatter** — YAML frontmatter 正确解析，tags 提取正确
3. **parse plan without frontmatter** — 无 frontmatter 时 title 从 # 标题提取
4. **parse plan with sections** — `### 第 1 天` 子标题正确分组到 sectionTitle
5. **parse steps checkbox** — `- [ ]` 和 `- [x]` 正确映射到 done 状态
6. **parse inline metadata** — `（预计 4h，负责：QA）` 正确提取 estimatedMinutes=240 和 owner='QA'
7. **parse step no metadata** — 无行内元数据的步骤 estimatedMinutes=undefined
8. **parse empty steps** — 无 checkbox 步骤时 parseSuccess=false
9. **parse goal section** — `## 目标` 段正确提取
10. **parse risks section** — `## 风险与备案` 段正确提取为行数组
11. **parse success criteria section** — `## 成功标准` 段正确提取
12. **parse malformed frontmatter** — 格式错误的 YAML 不崩溃，返回 null
13. **parse plan file with external metadata** — 外部 metadata 覆盖解析结果的 id/filepath
14. **parse multiple duration units** — h/m/d 三种时间单位正确转换为分钟

### plan-renderer.test.ts 测试用例

1. **render full plan** — 完整 metadata + parsed 渲染为合法 Markdown
2. **render frontmatter** — YAML frontmatter 包含所有必要字段
3. **render steps with sections** — 按 sectionTitle 分组，每组有 ### 子标题
4. **render steps without sections** — 无子标题时所有步骤平铺
5. **render checkbox states** — done=true 渲染 `- [x]`，done=false 渲染 `- [ ]`
6. **render risks** — risks 非空时渲染 `## 风险与备案` 段
7. **render no risks** — risks 为空时不渲染风险段
8. **render success criteria** — criteria 非空时渲染 `## 成功标准` 段
9. **render archived stub** — 归档 stub 包含正确引用路径
10. **update frontmatter** — 修改 status 后 frontmatter 更新，body 不变
11. **update frontmatter add new** — 无 frontmatter 的文件插入新 frontmatter

### plan-manager.test.ts 测试用例

1. **initialize loads existing plans** — 目录中已有 plan 文件时正确加载
2. **initialize creates plans dir** — 目录不存在时创建
3. **create from AI output success** — 解析成功，保存文件，发射 plan:created
4. **create from AI output unparsed** — 解析失败，保存为 draft-unparsed
5. **create generates trace span** — plan.create span 包含正确 attributes
6. **start execution** — 状态更新为 in_progress，TSM 任务创建，PL 声明
7. **start execution plan not found** — 抛出 Error
8. **archive as formal document** — 文件复制到目标路径，原位置替换为 stub
9. **archive relative path** — 相对路径拼接 workspaceRoot
10. **abandon** — 状态更新为 abandoned
11. **get active plans** — 返回 draft + in_progress，按 updatedAt 倒序
12. **get plan by id** — 返回完整 ParsedPlan
13. **get plan not found** — 返回 null
14. **follow up progress** — 正确计算 completedSteps/totalSteps/progress
15. **file watcher detect checkbox change** — 检测到 checkbox 变更发射 plan:steps-completed
16. **cleanup stale plans** — 30 天无更新的 draft/abandoned 自动归档
17. **cleanup does not affect recent plans** — 近期计划不受影响
18. **dispose stops watcher** — dispose 后 fileWatcher 关闭
