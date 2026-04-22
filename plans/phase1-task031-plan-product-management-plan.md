# PHASE1-TASK031: Plan 模式与 Plan 产物管理 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task031_plan-product-management.md](../specs/tasks/phase1/phase1-task031_plan-product-management.md)
> 创建日期：2026-04-22
> 最后更新：2026-04-22

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK031 |
| **任务标题** | Plan 模式与 Plan 产物管理 |
| **所属阶段** | Phase 1 - AI 模式系统、Plan 产物、Wiki 与能力整合 (Sprint 3.4) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | TASK030 + TASK018 + TASK021 + TASK028 + TASK027 |

### 1.1 目标

将 Plan 从"对话中的文本"升级为"文件系统中的一等公民"。构建 PlanManager（计划文件的 CRUD、解析、渲染、归档）、Plan 解析器（Markdown frontmatter + 步骤提取）、Plan 渲染器（元数据 + 步骤 Markdown 生成）、FileWatcher 变更检测、`@plan-xxx` 对话引用解析，以及渲染进程的 PlanPreviewCard / PlanList / PlanEditor UI 组件。

### 1.2 核心设计约束

| 约束 | 来源 | 说明 |
|------|------|------|
| 文件即真相 | CLAUDE.md 设计哲学 | Plan 以 Markdown 存储在 `.sibylla/plans/`，用户可直接编辑 |
| PlanManager 与 TaskStateMachine 分层 | 任务描述 | PlanManager 负责 Markdown CRUD；TSM 负责 JSON 状态跟踪 |
| PlanManager 与 ProgressLedger 联动 | 任务描述 | Plan 执行时向 PL 声明任务，checklist 同步 |
| 原子写入 | CLAUDE.md 安全红线 | 所有 Plan 文件写入先写临时文件再原子替换 |
| AI 建议，人类决策 | CLAUDE.md 设计哲学 | AI 生成计划但用户确认后才执行 |
| TS 严格模式禁止 any | CLAUDE.md 代码规范 | 全部代码遵循 TypeScript 严格模式 |

### 1.3 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| Plan 类型定义 | `src/main/services/plan/types.ts` | PlanStatus / PlanMetadata / PlanStep / ParsedPlan |
| Plan 解析器 | `src/main/services/plan/plan-parser.ts` | frontmatter 解析 + 步骤提取 |
| Plan 渲染器 | `src/main/services/plan/plan-renderer.ts` | 元数据 + 步骤 → Markdown |
| PlanManager 核心 | `src/main/services/plan/plan-manager.ts` | 中心管理器 + FileWatcher |
| 统一导出 | `src/main/services/plan/index.ts` | barrel 文件 |
| IPC Handler | `src/main/ipc/handlers/plan.ts` | Plan 查询/执行/归档通道 |
| shared/types 扩展 | `src/shared/types.ts` | Plan IPC 通道常量 + 类型 |
| Preload API 扩展 | `src/preload/index.ts` | plan 命名空间 |
| Zustand Store | `src/renderer/store/planStore.ts` | 计划状态管理 |
| PlanPreviewCard | `src/renderer/components/plan/PlanPreviewCard.tsx` | 对话气泡计划预览 |
| PlanList | `src/renderer/components/plan/PlanList.tsx` | 活动计划列表 |
| PlanEditor | `src/renderer/components/plan/PlanEditor.tsx` | 计划编辑/勾选 |
| Orchestrator 集成 | `src/main/services/harness/orchestrator.ts` | Plan 模式输出触发 |
| ContextEngine 扩展 | `src/main/services/context-engine.ts` | @plan-xxx 引用解析 |
| 单元测试 | `tests/plan/*.test.ts` | Parser / Renderer / Manager 测试 |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；UI 等待超 2 秒需进度反馈；原子写入；文件即真相 | 全局约束 |
| `specs/design/architecture.md` | 主进程与渲染进程严格隔离，通过 IPC 通信；FileManager 封装文件操作 | 进程通信架构 |
| `specs/design/ui-ux-design.md` | 主色 #6366F1；按钮圆角 6px；危险操作二次确认；状态色彩映射 | UI 组件设计 |
| `specs/requirements/phase1/sprint3.4-mode.md` | 需求 3.4.2 Plan 产物管理；验收标准 1-10 | 验收标准 |
| `specs/tasks/phase1/phase1-task031_plan-product-management.md` | 17 步执行路径、完整验收标准、技术规格 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `electron-ipc-patterns` | IPC 通道注册；Preload API 扩展；Push Event 转发 | `ipc/handlers/plan.ts` + `preload/index.ts` |
| `zustand-state-management` | planStore 设计；selector 性能优化；IPC 封装在 action | `src/renderer/store/planStore.ts` |
| `frontend-design` | PlanPreviewCard / PlanList / PlanEditor UI 设计质量 | `src/renderer/components/plan/*.tsx` |
| `typescript-strict-mode` | 全模块类型安全；泛型设计；类型守卫 | 所有 `.ts` / `.tsx` 文件 |

### 2.3 前置代码依赖

| 模块 | 文件路径 | 复用方式 |
|------|---------|---------|
| AiModeRegistry | `src/main/services/mode/ai-mode-registry.ts` | 检测当前 `plan` 模式，触发 PlanManager |
| HarnessOrchestrator | `src/main/services/harness/orchestrator.ts` | `executeInternal()` 返回后触发 `createFromAIOutput()` |
| TaskStateMachine | `src/main/services/harness/task-state-machine.ts` | `create(goal, steps)` 导出 Plan 步骤为任务 |
| ProgressLedger | `src/main/services/progress/progress-ledger.ts` | `declare(input)` 声明 Plan 执行任务 |
| Tracer | `src/main/services/trace/tracer.ts` | `withSpan()` 包裹 Plan 关键操作 |
| FileManager | `src/main/services/file-manager.ts` | `writeFile()` 原子写入 Plan 文件 |
| ContextEngine | `src/main/services/context-engine.ts` | `collectManualRefs()` 扩展 `@plan-xxx` 解析 |
| EventBus | 事件总线 | `emit('plan:created')` 等 Plan 事件 |
| HarnessResult | `src/shared/types.ts:1629` | 扩展 `planMetadata?` 字段 |
| IPC_CHANNELS | `src/shared/types.ts` | 追加 Plan 相关通道常量 |
| Preload API | `src/preload/index.ts` | 追加 `plan` 命名空间 |

### 2.4 新增 IPC 通道清单

| 通道常量 | 通道名 | 方向 | 用途 |
|---------|--------|------|------|
| `PLAN_GET_ACTIVE` | `plan:getActive` | Renderer→Main | 获取活动计划列表 |
| `PLAN_GET` | `plan:get` | Renderer→Main | 获取单个计划详情 |
| `PLAN_START_EXECUTION` | `plan:startExecution` | Renderer→Main | 开始执行计划 |
| `PLAN_ARCHIVE` | `plan:archive` | Renderer→Main | 归档为正式文档 |
| `PLAN_ABANDON` | `plan:abandon` | Renderer→Main | 放弃计划 |
| `PLAN_FOLLOW_UP` | `plan:followUp` | Renderer→Main | AI 跟进进度 |

**主进程→渲染进程推送事件**：

| 事件名 | 通道名 | 用途 |
|--------|--------|------|
| PLAN_CREATED | `plan:created` | 新计划创建 |
| PLAN_EXECUTION_STARTED | `plan:execution-started` | 计划开始执行 |
| PLAN_STEPS_COMPLETED | `plan:steps-completed` | 步骤完成变更 |
| PLAN_ARCHIVED | `plan:archived` | 计划归档 |
| PLAN_ABANDONED | `plan:abandoned` | 计划放弃 |

---

## 三、现有代码盘点与差距分析

### 3.1 主进程模块现状

| 模块 | 现状 | TASK031 改造 |
|------|------|-------------|
| `services/plan/` | **目录不存在**，需全新创建 | 新建 types.ts / plan-parser.ts / plan-renderer.ts / plan-manager.ts / index.ts |
| `ipc/handlers/plan.ts` | **不存在**，需新建 | 注册 6 个 handler + 5 个 Push Event 转发 |
| `services/harness/orchestrator.ts` | 已有 `setAiModeRegistry()` / `setTaskStateMachine()` | 新增 `setPlanManager()`；在 `execute()` 返回前检测 plan 模式输出 |
| `services/context-engine.ts` | `@[[path]]` 语法引用解析 | 扩展支持 `@plan-xxx` 模式引用 |
| `shared/types.ts` | ~100+ IPC 通道，无 Plan 相关 | 追加 6 个 Plan 通道 + 5 个 Push Event + `HarnessResult.planMetadata` |
| `preload/index.ts` | 16+ 命名空间，无 plan | 追加 `plan` 命名空间（6 个方法 + 4 个事件监听） |
| `services/file-manager.ts` | `writeFile()` 内建原子写入（temp+rename，3 次重试） | PlanManager 直接调用 `fileManager.writeFile()` |

### 3.2 渲染进程模块现状

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/renderer/store/planStore.ts` | **不存在**，需新建 | Zustand store，管理计划列表和当前计划 |
| `src/renderer/components/plan/` | **目录不存在**，需创建 | PlanPreviewCard / PlanList / PlanEditor |
| `tests/plan/` | **目录不存在**，需创建 | plan-parser / plan-renderer / plan-manager 测试 |
| `tests/renderer/plan/` | **目录不存在**，需创建 | UI 组件 + store 测试 |

### 3.3 关键接口衔接点

**Orchestrator → PlanManager**：
- `orchestrator.execute()` 返回前，若 `aiMode.id === 'plan'` 且有 `finalResponse.content`，调用 `planManager.createFromAIOutput()`
- 失败不中断响应返回（降级但继续）
- `HarnessResult` 需扩展 `planMetadata?: PlanMetadata`

**PlanManager → TaskStateMachine**：
- `startExecution()` 调用 `taskStateMachine.create(plan.title, steps.map(s => s.text))`
- TSM 负责内部 JSON 状态持久化（`.sibylla/agents/{id}/state.json`）

**PlanManager → ProgressLedger**：
- `startExecution()` 调用 `progressLedger.declare({ title, mode: 'plan', plannedChecklist })`
- PL 负责进度台账（`progress.md`）

**ContextEngine → PlanManager**：
- `collectManualRefs()` 扩展：检测 `@plan-xxx` → 调用 `planManager.getPlan(planId)` → 注入上下文
- 注入内容：标题、状态、步骤进度

### 3.4 不存在的文件清单

| 文件 | 类型 |
|------|------|
| `src/main/services/plan/types.ts` | 新建 |
| `src/main/services/plan/plan-parser.ts` | 新建 |
| `src/main/services/plan/plan-renderer.ts` | 新建 |
| `src/main/services/plan/plan-manager.ts` | 新建 |
| `src/main/services/plan/index.ts` | 新建 |
| `src/main/ipc/handlers/plan.ts` | 新建 |
| `src/renderer/store/planStore.ts` | 新建 |
| `src/renderer/components/plan/PlanPreviewCard.tsx` | 新建 |
| `src/renderer/components/plan/PlanList.tsx` | 新建 |
| `src/renderer/components/plan/PlanEditor.tsx` | 新建 |
| `tests/plan/plan-parser.test.ts` | 新建 |
| `tests/plan/plan-renderer.test.ts` | 新建 |
| `tests/plan/plan-manager.test.ts` | 新建 |
| `tests/renderer/plan/plan-store.test.ts` | 新建 |
| `tests/renderer/plan/plan-preview-card.test.tsx` | 新建 |
| `tests/renderer/plan/plan-list.test.tsx` | 新建 |
| `tests/renderer/plan/plan-editor.test.tsx` | 新建 |

---

## 四、分步实施计划

### 阶段 A：Plan 共享类型与解析器（Step 1-2） — 预计 0.5 天

#### A1：创建 Plan 类型定义

**文件：** `src/main/services/plan/types.ts`（新建）

定义以下核心类型，严格遵循 TypeScript strict 模式，禁止 `any`：

```typescript
export type PlanStatus =
  | 'draft'
  | 'draft-unparsed'
  | 'in_progress'
  | 'completed'
  | 'archived'
  | 'abandoned'

export interface PlanMetadata {
  id: string                           // plan-20260418-103000
  title: string
  mode: 'plan'
  status: PlanStatus
  createdAt: string                    // ISO 8601
  updatedAt: string                    // ISO 8601
  conversationId?: string
  traceId?: string
  estimatedDuration?: string
  tags: string[]
  filePath: string                     // 绝对路径
  archivedTo?: string
}

export interface PlanStep {
  sectionTitle?: string
  text: string
  done: boolean
  estimatedMinutes?: number
  owner?: string
  subSteps?: PlanStep[]
}

export interface ParsedPlan {
  metadata: PlanMetadata
  goal?: string
  steps: PlanStep[]
  risks?: string[]
  successCriteria?: string[]
  rawMarkdown: string
}

export interface PlanCreateInput {
  aiContent: string
  conversationId: string
  traceId: string
}

export interface PlanFollowUpResult {
  planId: string
  progress: number                     // 0-1
  completedSteps: number
  totalSteps: number
  notes: string[]
}

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

#### A2：实现 PlanParser

**文件：** `src/main/services/plan/plan-parser.ts`（新建）

**设计原则**：纯函数式，无状态，所有方法为静态或独立函数。

**核心方法**：

1. **`parsePlanMarkdown(rawContent: string, id: string): PlanParseResult`**
   - 包裹 try/catch，catch 时返回 `{ parseSuccess: false, rawMarkdown, steps: [], tags: [], id }`
   - 调用 `parseFrontmatter()` → `stripFrontmatter()` → 提取 title / goal / steps / risks / criteria
   - 若 steps.length === 0 → 返回 `parseSuccess: false`

2. **`parseFrontmatter(content: string): Record<string, unknown> | null`**
   - 正则 `^---\n([\s\S]*?)\n---` 匹配 YAML
   - 使用 `yaml` 库解析，解析失败返回 `null`

3. **`stripFrontmatter(content: string): string`**
   - 正则替换 `^---\n[\s\S]*?\n---\n*` 为空

4. **`extractSteps(body: string): PlanStep[]`**
   - 按 `\n` 分割遍历
   - `###` 子标题 → 更新 `currentSection`
   - `- [x]` / `- [ ]` checkbox → 提取 done / text / inlineMetadata
   - 返回步骤列表

5. **`parseInlineMetadata(text: string): { estimatedMinutes?: number; owner?: string }`**
   - `预计\s*(\d+)\s*([hmd])` → h×60 / m×1 / d×480
   - `负责[：:]\s*([^，,)]+)` → owner

6. **`extractSection(body: string, sectionTitle: string): string[]`**
   - 正则 `##\s*${sectionTitle}\s*\n([\s\S]*?)(?=\n##|$)`
   - 过滤空行和分隔线

7. **`parsePlanFile(content: string, metadata: PlanMetadata | null): ParsedPlan | null`**
   - 从已有文件重新解析，合并外部 metadata

**依赖**：`yaml` 库（已在项目中使用）。

#### A3：实现 PlanRenderer

**文件：** `src/main/services/plan/plan-renderer.ts`（新建）

**设计原则**：纯函数式，无状态。

**核心方法**：

1. **`renderPlan(metadata: PlanMetadata, parsed: PlanParseResult): string`**
   - 调用子方法生成 frontmatter + title + goal + steps + risks + criteria
   - 按空行拼接为完整 Markdown

2. **`renderFrontmatter(metadata: PlanMetadata): string`**
   - 构建对象 → `yaml.stringify()` → `---\n...\n---`

3. **`renderSteps(steps: PlanStep[]): string`**
   - 按 `sectionTitle` 分组为 `Map<string, PlanStep[]>`
   - 每组输出 `### sectionTitle` + checkbox 步骤
   - 无 sectionTitle 的步骤平铺在 `## 步骤` 段头部

4. **`renderArchivedStub(metadata: PlanMetadata, archivedPath: string): string`**
   - 生成归档 stub（status: archived + 归档位置引用）

5. **`updateFrontmatter(content: string, updates: Record<string, unknown>): string`**
   - 解析现有 frontmatter → 合并 updates → 重新渲染
   - 若原内容无 frontmatter → 在开头插入新 frontmatter

---

### 阶段 B：PlanManager 核心与 FileWatcher（Step 3-5） — 预计 1 天

#### B1：实现 PlanManager 中心管理器

**文件：** `src/main/services/plan/plan-manager.ts`（新建）

**构造函数注入**：

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

**内部状态**：
- `plans: Map<string, PlanMetadata>` — 所有已加载计划索引
- `fileWatcher: FSWatcher | null` — 文件监听器
- `parser: PlanParser` — 解析器实例
- `renderer: PlanRenderer` — 渲染器实例
- `cleanupInterval: NodeJS.Timeout | null` — 自动归档定时器

**核心 API 实现**：

| 方法 | 职责 | 关键步骤 |
|------|------|---------|
| `initialize()` | 初始化 | `loadExistingPlans()` → `startFileWatcher()` → 注册 24h 定时清理 |
| `createFromAIOutput(input)` | 从 AI 输出创建计划 | Tracer span 包裹 → 解析 → 渲染 Markdown → atomicWrite → EventBus emit |
| `startExecution(planId)` | 开始执行 | 更新 status → TSM.create() → PL.declare() → EventBus emit |
| `archiveAsFormalDocument(planId, targetPath)` | 归档 | 读取原文件 → 更新 frontmatter → 写入目标 → 原位置替换 stub |
| `abandon(planId)` | 放弃 | 更新 status → persistMetadata → EventBus emit |
| `getActivePlans()` | 获取活动列表 | 过滤 draft + in_progress，按 updatedAt 倒序 |
| `getPlan(id)` | 获取完整计划 | 读取文件 → parsePlanFile → 返回 ParsedPlan |
| `followUp(planId)` | AI 跟进进度 | 重新解析 → 计算 completedSteps / totalSteps → 返回进度 |
| `dispose()` | 清理 | 停止 FileWatcher → 清除定时器 → 清空 plans Map |

**`createFromAIOutput()` 详细流程**：

```
1. tracer.withSpan('plan.create', ...)
2. 生成 id: plan-YYYYMMDD-HHmmss
3. parser.parsePlanMarkdown(aiContent, id)
4. 构建 PlanMetadata (status: draft | draft-unparsed)
5. renderer.renderPlan(metadata, parsed) → 完整 Markdown
6. fileManager.writeFile(metadata.filePath, markdown) ← 原子写入
7. this.plans.set(id, metadata)
8. eventBus.emit('plan:created', metadata)
9. span.setAttributes({ plan.id, plan.parse_success, plan.step_count })
10. 返回 metadata
```

**`startExecution()` 详细流程**：

```
1. 获取 plan，不存在则 throw
2. plan.status = 'in_progress', updatedAt = now
3. persistMetadata(plan) ← 原子写入更新 frontmatter
4. getPlan(planId) → 提取 steps.map(s => s.text)
5. taskStateMachine.create(plan.title, steps) ← 导出为 TSM 任务
6. progressLedger.declare({ title, mode: 'plan', plannedChecklist: steps })
7. eventBus.emit('plan:execution-started', plan)
```

#### B2：实现 FileWatcher 变更检测

**集成在 `plan-manager.ts` 中**：

**`startFileWatcher()`**：
- 监听路径：`path.join(workspaceRoot, '.sibylla/plans/')`
- 使用 `fs.watch`（Node.js 内建）或项目已有的 `fileManager.startWatching()`
- 事件：`change` 且文件为 `.md` → `reloadPlan(filePath)`

**`reloadPlan(filePath)`**：
1. 读取文件内容 → `parser.parsePlanFile(content, null)`
2. 解析失败 → `logger.warn`，return
3. 提取 plan id → 查找内存已有 metadata
4. **变更检测**（仅已有记录时）：
   - 对比 `stepsBefore` 和 `stepsAfter` 每个 step 的 `done` 状态
   - 收集 newlyCompleted steps
   - 若有新完成步骤 → `eventBus.emit('plan:steps-completed', { planId, completed })`
5. 更新内存 metadata.updatedAt → `plans.set(id, metadata)`

**`stopFileWatcher()`**：
- 关闭 watcher → `this.fileWatcher = null`

#### B3：实现自动归档与清理

**`cleanupStalePlans(): Promise<number>`**：
- 遍历 `plans` 中 status === 'draft' 或 'abandoned' 的计划
- 计算 `Date.now() - new Date(plan.updatedAt).getTime()`
- 超过 30 天（2,592,000,000 ms）：
  - `tracer.withSpan('plan.auto-archive', ...)` 包裹
  - 更新 status 为 'archived'
  - `persistMetadata(plan)`
  - `logger.info('plan.auto-archived', ...)`
- 返回归档数量

**定时注册**（在 `initialize()` 中）：
- `setInterval(() => cleanupStalePlans(), 24 * 60 * 60 * 1000)` — 每 24h
- 存储 intervalId 以便 `dispose()` 清理

#### B4：创建统一导出

**文件：** `src/main/services/plan/index.ts`（新建）

导出所有类型 + PlanParser + PlanRenderer + PlanManager。

---

### 阶段 C：IPC 集成与 Preload API（Step 6-8） — 预计 0.5 天

#### C1：扩展 shared/types.ts

**文件：** `src/shared/types.ts`（扩展）

**1. 在 `IPC_CHANNELS` 中追加 Plan 通道**（在现有 AI_MODE 块之后）：

```typescript
// Plan management
PLAN_GET_ACTIVE: 'plan:getActive',
PLAN_GET: 'plan:get',
PLAN_START_EXECUTION: 'plan:startExecution',
PLAN_ARCHIVE: 'plan:archive',
PLAN_ABANDON: 'plan:abandon',
PLAN_FOLLOW_UP: 'plan:followUp',
```

**2. 在 `IPCChannelMap` 中追加类型映射**：

```typescript
[IPC_CHANNELS.PLAN_GET_ACTIVE]: { params: []; return: PlanMetadata[] }
[IPC_CHANNELS.PLAN_GET]: { params: [id: string]; return: ParsedPlan | null }
[IPC_CHANNELS.PLAN_START_EXECUTION]: { params: [id: string]; return: void }
[IPC_CHANNELS.PLAN_ARCHIVE]: { params: [id: string, targetPath: string]; return: PlanMetadata }
[IPC_CHANNELS.PLAN_ABANDON]: { params: [id: string]; return: void }
[IPC_CHANNELS.PLAN_FOLLOW_UP]: { params: [id: string]; return: PlanFollowUpResult }
```

**3. 扩展 HarnessResult 接口**（约 line 1629）：

```typescript
planMetadata?: PlanMetadata
```

**4. 新增 Push Event 常量和类型映射**：

```typescript
PLAN_CREATED: 'plan:created'
PLAN_EXECUTION_STARTED: 'plan:execution-started'
PLAN_STEPS_COMPLETED: 'plan:steps-completed'
PLAN_ARCHIVED: 'plan:archived'
PLAN_ABANDONED: 'plan:abandoned'
```

**5. 类型导入**：从 `../../main/services/plan/types` 导入 `PlanMetadata`, `ParsedPlan`, `PlanFollowUpResult`（或使用 `import type` 前向声明避免循环依赖）。

> **注意**：`shared/types.ts` 与 `services/plan/types.ts` 的类型共享策略——在 `shared/types.ts` 中 `import type` 从 plan 类型文件，或直接在 shared 中定义共享类型后让 plan/types.ts re-export。需检查现有项目的类型共享模式（如 memory 类型是如何处理的）。

#### C2：实现 IPC Handler

**文件：** `src/main/ipc/handlers/plan.ts`（新建）

```typescript
export function registerPlanHandlers(
  ipcMain: Electron.IpcMain,
  planManager: PlanManager,
  eventBus: EventBus,
  mainWindowGetter: () => BrowserWindow | null,
  logger: Logger
): void
```

**Handler 注册**：

| 通道 | 实现 |
|------|------|
| `plan:getActive` | `planManager.getActivePlans()` |
| `plan:get` | `planManager.getPlan(id)` |
| `plan:startExecution` | `planManager.startExecution(id)` |
| `plan:archive` | `planManager.archiveAsFormalDocument(id, targetPath)` |
| `plan:abandon` | `planManager.abandon(id)` |
| `plan:followUp` | `planManager.followUp(id)` |

**错误处理**：
- 所有 handler 包裹 try/catch
- catch 中 `logger.error('plan.ipc.error', { channel, error })`
- 返回结构化错误响应

**Push Event 转发**：

```typescript
eventBus.on('plan:created', (plan) => {
  mainWindowGetter()?.webContents.send('plan:created', plan)
})
eventBus.on('plan:execution-started', (plan) => {
  mainWindowGetter()?.webContents.send('plan:execution-started', plan)
})
eventBus.on('plan:steps-completed', (data) => {
  mainWindowGetter()?.webContents.send('plan:steps-completed', data)
})
eventBus.on('plan:archived', (plan) => {
  mainWindowGetter()?.webContents.send('plan:archived', plan)
})
eventBus.on('plan:abandoned', (plan) => {
  mainWindowGetter()?.webContents.send('plan:abandoned', plan)
})
```

#### C3：Preload API 扩展

**文件：** `src/preload/index.ts`（扩展）

**1. 在 `contextBridge.exposeInMainWorld` 的 `api` 对象中追加 `plan` 命名空间**：

```typescript
plan: {
  getActivePlans: () => ipcRenderer.invoke('plan:getActive'),
  getPlan: (id: string) => ipcRenderer.invoke('plan:get', id),
  startExecution: (id: string) => ipcRenderer.invoke('plan:startExecution', id),
  archive: (id: string, targetPath: string) => ipcRenderer.invoke('plan:archive', id, targetPath),
  abandon: (id: string) => ipcRenderer.invoke('plan:abandon', id),
  followUp: (id: string) => ipcRenderer.invoke('plan:followUp', id),
  onPlanCreated: (callback) => { ... return unsub },
  onPlanExecutionStarted: (callback) => { ... return unsub },
  onStepsCompleted: (callback) => { ... return unsub },
  onPlanArchived: (callback) => { ... return unsub },
  onPlanAbandoned: (callback) => { ... return unsub },
}
```

**2. 在 `ALLOWED_CHANNELS` 中追加**：

```typescript
'plan:getActive', 'plan:get', 'plan:startExecution',
'plan:archive', 'plan:abandon', 'plan:followUp',
'plan:created', 'plan:execution-started', 'plan:steps-completed',
'plan:archived', 'plan:abandoned',
```

**3. 在 `ElectronAPI` 接口声明中追加 `plan` 字段**。

---

### 阶段 D：Orchestrator 与 ContextEngine 集成（Step 9-10） — 预计 0.5 天

#### D1：Orchestrator 集成

**文件：** `src/main/services/harness/orchestrator.ts`（扩展）

**1. 新增私有字段**：

```typescript
private planManager: PlanManager | null = null
```

**2. 新增 setter 方法**（与现有 `setTaskStateMachine()` / `setAiModeRegistry()` 模式一致）：

```typescript
setPlanManager(pm: PlanManager): void {
  this.planManager = pm
}
```

**3. 在 `execute()` 方法的 return 之前，插入 Plan 模式检测逻辑**：

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

**设计要点**：
- 仅当 `aiMode.id === 'plan'` 时触发，其他模式完全无影响
- 失败不中断响应返回（降级但继续）
- `planMetadata` 附加到 `HarnessResult`，渲染进程据此显示 `PlanPreviewCard`

**4. Plan 模式非计划输出处理**：
- 若 AI 输出不含 `## 步骤` 且不含 `- [ ]` checkbox，`PlanParser` 返回 `parseSuccess: false`
- `PlanManager` 保存为 `draft-unparsed`
- `result.modeWarnings` 追加：`"Plan 模式已开启，但本次回复非计划输出"`

#### D2：ContextEngine 扩展

**文件：** `src/main/services/context-engine.ts`（扩展）

**1. 新增 PlanManager 依赖注入**：

```typescript
private planManager: PlanManager | null = null

setPlanManager(pm: PlanManager): void {
  this.planManager = pm
}
```

**2. 扩展 `collectManualRefs(manualRefs: string[])` 方法**：

在现有 `@[[path]]` 引用处理之后，追加 `@plan-xxx` 检测：

```typescript
for (const ref of manualRefs) {
  if (ref.startsWith('@plan-')) {
    const planId = ref.replace('@plan-', 'plan-')
    const parsed = await this.planManager?.getPlan(planId)
    if (parsed) {
      sources.push({
        type: 'plan-reference',
        label: `🗺️ 计划: ${parsed.metadata.title}`,
        content: this.formatPlanReference(parsed),
        metadata: { planId },
        tokenEstimate: estimateTokens(parsed.rawMarkdown),
      })
    }
  }
}
```

**3. 新增 `formatPlanReference(parsed: ParsedPlan): string`**：

```
状态: {metadata.status}
创建: {metadata.createdAt}
进度: {completedSteps}/{totalSteps} 步骤完成

## 步骤
{每个步骤的 checkbox + text}

## 目标
{goal}
```

**4. Token 预算**：Plan 引用内容从 manual 层（15% 预算）中扣除。

---

### 阶段 E：主进程初始化与装配（Step 11） — 预计 0.3 天

#### E1：主进程生命周期装配

**文件：** `src/main/index.ts`（扩展）

**在 `onWorkspaceOpened` 回调中**：

```typescript
// 1. 创建 PlanManager
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

// 2. 注入到 Orchestrator
orchestrator.setPlanManager(planManager)

// 3. 注入到 ContextEngine
contextEngine.setPlanManager(planManager)

// 4. 注册 Plan IPC Handler
registerPlanHandlers(ipcMain, planManager, appEventBus, () => mainWindow, logger)
```

**在 `onWorkspaceClosed` 回调中**：

```typescript
planManager.dispose()
```

---

### 阶段 F：planStore 与 UI 组件（Step 12-15） — 预计 1.5 天

#### F1：实现 planStore

**文件：** `src/renderer/store/planStore.ts`（新建）

**类型定义**：

```typescript
interface PlanState {
  activePlans: PlanMetadata[]
  currentPlan: ParsedPlan | null
  loading: boolean
  error: string | null
}

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

**实现要点**：
1. 所有 IPC 调用封装在 action 内部，调用 `window.sibylla.plan.*`
2. `fetchActivePlans()` → `set({ loading: true })` → IPC → `set({ activePlans, loading: false })`
3. `startExecution()` → IPC 调用 → 从 activePlans 中更新对应 plan status
4. `archive()` → IPC 调用 → 从 activePlans 中移除已归档 plan
5. `abandon()` → IPC 调用 → 从 activePlans 中移除
6. 使用 `devtools` 中间件便于调试

**IPC Push Event 监听**（Store 初始化时注册）：

```typescript
const unsubscribers: Array<() => void> = []

// plan:created → 追加到 activePlans
window.sibylla.plan.onPlanCreated((plan) => {
  set(state => ({ activePlans: [plan, ...state.activePlans] }))
})

// plan:execution-started → 更新对应 plan status
window.sibylla.plan.onPlanExecutionStarted((plan) => {
  set(state => ({
    activePlans: state.activePlans.map(p =>
      p.id === plan.id ? plan : p
    )
  }))
})

// plan:steps-completed → 若 currentPlan 匹配，重新 fetchPlan
window.sibylla.plan.onStepsCompleted(({ planId }) => {
  const current = get().currentPlan
  if (current && current.metadata.id === planId) {
    get().fetchPlan(planId)
  }
})

// plan:archived / plan:abandoned → 从 activePlans 中移除
window.sibylla.plan.onPlanArchived((plan) => {
  set(state => ({
    activePlans: state.activePlans.filter(p => p.id !== plan.id)
  }))
})
```

**应用启动时**自动调用 `fetchActivePlans()`。

#### F2：PlanPreviewCard 组件

**文件：** `src/renderer/components/plan/PlanPreviewCard.tsx`（新建）

**Props**：

```typescript
interface PlanPreviewCardProps {
  planMetadata: PlanMetadata
  conversationId: string
}
```

**渲染布局**：
- **头部区域**：🗺️ 图标 + 标题（粗体）+ 状态 pill（draft=蓝 / in_progress=绿 / completed=灰 / abandoned=红）+ tags
- **进度概览**：步骤进度条 `completedSteps / totalSteps 步骤完成`
- **操作按钮区**（根据 status 条件渲染）：
  - `draft` → [开始执行]（绿色）+ [打开文件]
  - `in_progress` → [跟进进度] + [归档为正式文档] + [放弃]
  - `draft-unparsed` → ⚠️ 提示 + [打开文件]
- **跟进进度面板**（展开/折叠）：进度百分比 + 未完成步骤 + AI 备注

**设计约束**：
- 所有按钮有 loading 状态和 error 兜底（CLAUDE.md UI/UX 红线）
- 主色使用 `#3b82f6`（plan 模式色）而非品牌色 `#6366F1`
- 危险操作（放弃）需二次确认

**挂载位置**：AI 消息气泡中，若 `result.planMetadata` 存在 → 渲染 `<PlanPreviewCard />`

#### F3：PlanList 组件

**文件：** `src/renderer/components/plan/PlanList.tsx`（新建）

**Props**：

```typescript
interface PlanListProps {
  onSelect?: (planId: string) => void
}
```

**渲染布局**：
- **头部**：🗺️ 活动计划 + 计划数量 badge
- **空状态**：`暂无活动计划。在 Plan 模式下让 AI 生成计划。`
- **列表条目**：
  - 标题（粗体）+ 状态 pill
  - 创建时间（相对时间格式）
  - 步骤进度（`3/7 步骤完成`）
  - 对话链接
  - hover 效果 + 点击 `onSelect`

**自动刷新**：监听 `plan:created` / `plan:steps-completed` / `plan:archived` → `fetchActivePlans()`

#### F4：PlanEditor 组件

**文件：** `src/renderer/components/plan/PlanEditor.tsx`（新建）

**Props**：

```typescript
interface PlanEditorProps {
  planId: string
}
```

**渲染布局**（只读元数据 + 可交互步骤）：
- **元数据区**（只读）：标题、状态、创建/更新时间、tags
- **目标区**（只读）：`ParsedPlan.goal`
- **步骤区**（可交互）：
  - 按 `sectionTitle` 分组
  - 每个步骤 checkbox + text
  - checkbox 点击 → 切换 done 状态 → 修改 rawMarkdown → `file:writeContent` IPC 写入
  - FileWatcher 检测变更 → PlanManager 重新解析 → 事件推送 → UI 自动刷新
- **风险区**（只读）：risks 列表
- **成功标准区**（只读）：successCriteria 列表
- **底部操作栏**：
  - [在编辑器中打开] → 打开外部 Markdown 编辑器
  - [归档为正式文档]（仅 in_progress 状态）
  - [放弃]（需确认对话框）

**自动刷新**：监听 `plan:steps-completed` → 若 planId 匹配 → `fetchPlan(planId)`

---

## 五、验收标准追踪

### Plan 文件格式

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | Plan 文件使用标准 Markdown + YAML frontmatter | A2 PlanParser + A3 PlanRenderer | `plan-parser.test.ts` #1-3 |
| 2 | frontmatter 包含 id/title/mode/status/created_at/updated_at/conversation_id/trace_id/tags | A3 renderFrontmatter | `plan-renderer.test.ts` #2 |
| 3 | 步骤使用 `- [ ]` / `- [x]` checkbox 格式 | A2 extractSteps | `plan-parser.test.ts` #5 |
| 4 | 步骤行内元数据解析（预计 Xh，负责：谁） | A2 parseInlineMetadata | `plan-parser.test.ts` #6 |

### Plan 生命周期

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 5 | draft → in_progress → completed → archived 流转 | B1 PlanManager | `plan-manager.test.ts` #3,6,8 |
| 6 | 解析失败时保存原文 status: draft-unparsed | B1 createFromAIOutput | `plan-manager.test.ts` #4 |
| 7 | abandoned 状态支持 | B1 abandon() | `plan-manager.test.ts` #10 |

### PlanManager 核心 API

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 8 | createFromAIOutput() 解析 + 保存 + 返回 | B1 createFromAIOutput | `plan-manager.test.ts` #3-4 |
| 9 | startExecution() 导出 TSM + PL 声明 | B1 startExecution | `plan-manager.test.ts` #6 |
| 10 | archiveAsFormalDocument() 复制 + stub | B1 archive | `plan-manager.test.ts` #8-9 |
| 11 | getActivePlans() 过滤 + 排序 | B1 getActivePlans | `plan-manager.test.ts` #11 |
| 12 | followUp() 进度计算 | B1 followUp | `plan-manager.test.ts` #14 |

### FileWatcher

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 13 | 监听 .sibylla/plans/ 变更 | B2 startFileWatcher | `plan-manager.test.ts` #15 |
| 14 | 检测 checkbox 变更发射 plan:steps-completed | B2 reloadPlan | `plan-manager.test.ts` #15 |
| 15 | 变更检测不影响编辑器性能 | B2（架构级保障，fs.watch 非阻塞） | — |

### @plan-xxx 引用

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 16 | @plan-xxx 注入计划内容到上下文 | D2 ContextEngine 扩展 | 集成测试 |
| 17 | 注入包含状态、进度、元数据 | D2 formatPlanReference | 集成测试 |

### 自动归档

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 18 | 30 天无更新自动归档 | B3 cleanupStalePlans | `plan-manager.test.ts` #16-17 |
| 19 | 归档操作记录到 Trace | B3 tracer span | `plan-manager.test.ts` #16 |

### UI 组件

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 20 | PlanPreviewCard 预览 + 操作按钮 | F2 PlanPreviewCard | `plan-preview-card.test.tsx` |
| 21 | PlanList 活动计划列表 | F3 PlanList | `plan-list.test.tsx` |
| 22 | PlanEditor 可编辑步骤 | F4 PlanEditor | `plan-editor.test.tsx` |
| 23 | 所有按钮有 loading + error 兜底 | F2-F4 所有组件 | 组件测试 |

### Trace 集成

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 24 | plan.create / plan.execute / plan.archive span | B1 PlanManager | `plan-manager.test.ts` #5 |
| 25 | plan.steps-completed span | B2 reloadPlan | `plan-manager.test.ts` #15 |

### IPC 集成

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 26 | 6 个 IPC 通道类型安全注册 | C2 registerPlanHandlers | `plan-manager.test.ts` |
| 27 | 5 个 Push Event 正确推送 | C2 eventBus→webContents | 集成测试 |

---

## 六、风险与缓解

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|---------|
| shared/types.ts 循环依赖 | 高 | 高 | Plan 类型在 `services/plan/types.ts` 独立定义；shared/types.ts 仅 `import type` 引用，不反向依赖 |
| AI 输出格式不稳定导致解析失败 | 中 | 中 | PlanParser 包裹 try/catch，失败时保存为 `draft-unparsed` 原文；Plan 模式 systemPromptPrefix 约束输出格式 |
| FileWatcher 性能影响编辑器 | 低 | 高 | 使用 `fs.watch` 仅监听 `.sibylla/plans/` 目录；变更检测在 reloadPlan 中快速完成（仅解析 frontmatter） |
| Orchestrator 集成侵入性过大 | 中 | 中 | 通过 `setPlanManager()` setter 注入，仅在 plan 模式下触发，其他模式零影响；失败不中断响应 |
| IPC 通道命名冲突 | 低 | 中 | 严格使用 `plan:` 前缀命名空间，与现有通道不重叠 |
| PlanManager 与 TaskStateMachine 职责边界模糊 | 中 | 中 | 明确分层：PlanManager 管理 Markdown 文件生命周期；TSM 管理 JSON 状态执行跟踪；仅在 startExecution 时单向导出 |
| 自动归档误删用户计划 | 低 | 高 | 仅归档 draft/abandoned 状态且超过 30 天的计划；归档操作写 Trace 可追溯 |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 | 预计工时 |
|----|------|--------|---------|
| Day 1 上午 | A1-A2 | types.ts + plan-parser.ts 完整实现 | 3h |
| Day 1 下午 | A3 | plan-renderer.ts 完整实现 | 3h |
| Day 2 | B1-B4 | plan-manager.ts（核心 API + FileWatcher + 自动归档 + index.ts） | 7h |
| Day 3 上午 | C1-C3 | shared/types.ts 扩展 + IPC Handler + Preload API | 4h |
| Day 3 下午 | D1-D2 + E1 | Orchestrator 集成 + ContextEngine 扩展 + 主进程装配 | 3h |
| Day 4 | F1-F4 | planStore + PlanPreviewCard + PlanList + PlanEditor | 7h |
| Day 5 上午 | 测试 | plan-parser / plan-renderer / plan-manager 单元测试 | 4h |
| Day 5 下午 | 测试 + 修复 | UI 组件测试 + 集成验证 + bug 修复 | 3h |

**总预计工时**：34h（约 4.5 工作日）

---

**文档版本**: v1.0
**最后更新**: 2026-04-22
**维护者**: Sibylla 架构团队
