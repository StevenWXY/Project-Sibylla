# Phase 1 Sprint 3.4 - AI 模式系统、Plan 产物、Wiki 与能力整合

## 一、概述

### 1.1 目标与价值

Sprint 3.4 作为 Phase 1 AI 能力线的收尾 Sprint，在 Sprint 3.1-3.3 建立的
Harness、记忆、Trace 三大基础设施之上，交付用户可直接感知的价值升级：

1. **AI 模式系统**：让用户通过显式意图切换（Plan / Analyze / Review / Write / Free）获得更精准的 AI 行为
2. **Plan 产物管理**：Plan 模式产出的可执行计划作为一等公民，支持引用、跟进、归档
3. **一键优化提示词**：帮用户把模糊需求转为清晰请求，降低沟通摩擦
4. **系统级 Wiki**：内置的使用手册，AI 可检索，用户可查阅
5. **外部数据源 API**：为 Phase 2 云端能力和第三方集成准备的抽象层
6. **能力整合**：命令面板、快捷键、导出分享、模型切换器等实用功能

### 1.2 与其他 Sprint 的关系

| Sprint | 关系 |
|---|---|
| Sprint 3（前序）| 基础 AI 对话能力；模型切换器复用已有连接层 |
| Sprint 3.1（前序）| Harness 组件按模式切换配置；Guardrail / Evaluator 参数化 |
| Sprint 3.2（前序）| 模式使用偏好通过记忆系统累积；Plan 归档可进入 MEMORY.md |
| Sprint 3.3（前序）| 所有模式切换、Plan 操作、优化请求纳入 Trace；progress.md 记录当前模式 |
| Sprint 4（并行）| 外部数据源 API 将接入云端搜索；"研究模式"预留给 Sprint 4 |
| Phase 2 | Agent 系统将在模式基础上扩展；Plan 可升级为 Agent 的任务输入 |

### 1.3 设计原则

- **模式即意图**：模式是用户意图的显式化，而非 AI 人设的伪装
- **可切换可复合**：模式可随对话切换，历史消息不回溯改变
- **产物是一等公民**：Plan 等结构化产物是用户可编辑、可引用、可跟进的文件
- **优化是辅助**：一键优化只提建议，绝不擅自修改用户输入
- **Wiki 不污染工作区**：系统文档位于应用资源目录，用户工作区保持纯净
- **抽象层前置**：外部数据源先建抽象层，具体接入留给后续 Sprint

### 1.4 涉及模块

- 模块 4：AI 系统（模式注入、prompt 模板）
- 模块 15：记忆系统（模式偏好学习）
- 模块 16：Trace 系统（模式事件记录）
- 模块 17：任务台账（progress.md 模式字段）
- 模块 19（新增）：模式注册与管理
- 模块 20（新增）：Plan 产物管理
- 模块 21（新增）：提示词优化服务
- 模块 22（新增）：系统 Wiki
- 模块 23（新增）：外部数据源抽象层

### 1.5 里程碑定义

**完成标志：**
- 用户可在五种模式（Plan / Analyze / Review / Write / Free）间切换
- 每种模式有独立的 prompt 模板、Evaluator 策略、UI 提示
- Plan 模式产出可编辑的 Markdown plan，支持跟进与归档
- 一键优化提示词按钮可用，展示原文/建议对比
- 系统 Wiki 可通过命令面板访问，支持搜索
- 外部数据源抽象层 API 稳定，有默认 Provider 实现
- 命令面板（Ctrl+K）支持模式切换、Wiki 查询、快捷操作
- 对话可导出为 Markdown / JSON；可复制对话片段
- 模型切换器支持快速切换已配置的模型
- 所有新功能纳入 Trace 系统、通过 IPC 向渲染进程暴露

---

## 二、功能需求

### 需求 3.4.1 - AI 模式注册表与切换机制

**用户故事：** 作为用户，我希望能通过明确的模式选择，让 AI 知道"我现在要做的
是哪一类工作"，不必每次在 prompt 里反复说明。

#### 功能描述

> **术语说明（与已有系统解耦）**：
> 本需求中的「AI Mode」(`AiModeId`) 是用户显式选择的意图信号，控制 AI 的行为人设、
> 输出格式和后置质量提示。它与已有的 `HarnessMode`（`'single' | 'dual' | 'panel'`，
> 控制 Generator→Evaluator 执行策略）是**正交概念**，两者共存互不干扰。
> - `HarnessMode`（执行策略）→ 现有 `ModeSelector.tsx` + `harness:setMode` IPC
> - `AiMode`（意图模式）→ 新增 `AiModeSwitcher.tsx` + `aiMode:switch` IPC

AI 模式系统由 `AiModeRegistry`（中心注册表）管理。每个模式包含：

- **id**：唯一标识（`plan`、`analyze`、`review`、`write`、`free`）
- **label**：显示名称（支持国际化）
- **icon**：视觉标识
- **description**：模式说明
- **systemPromptPrefix**：系统 prompt 前缀模板（支持变量替换，作为 ContextEngine 组装的 system prompt 的开头部分）
- **outputConstraints**：AI 输出塑形参数（结构化要求、长度限制、语气等）
- **modeEvaluatorConfig**：模式特有的后置质量检查配置（软提示，非硬门控）
- **produces**：产物类型声明（如 `plan`、`analysis-report`）
- **inputPlaceholder**：输入框占位符提示
- **uiHints**：UI 展示偏好（颜色、气泡样式）

切换模式：
- 对话中随时可切换（通过 UI 下拉或快捷键）
- 切换不改变历史消息，只影响下一条消息起
- 当前模式写入 Trace attributes 和 progress.md
- 切换 AiMode 不影响 HarnessMode（执行策略由 Orchestrator 自动管理）

#### 验收标准

1. When the application starts, AiModeRegistry shall load built-in modes and any custom modes from config
2. When user selects a mode via UI, the system shall set it as current AiMode for the active conversation and emit `aiMode:changed` event
3. When user sends a message in a specific mode, the system shall apply that mode's systemPromptPrefix as the first section of the assembled system prompt, and pass outputConstraints to Generator context
4. When switching mode mid-conversation, historical messages shall retain their original mode attribute; only subsequent messages use the new mode
5. When a mode is not found (e.g. removed custom mode), the system shall fallback to `free` mode and log a warning
6. When current mode changes, the input placeholder shall update to reflect the mode's inputPlaceholder
7. When in a mode other than `free`, the conversation bubble shall display a visual indicator (icon + label) of the mode
8. When user presses `Ctrl+M` (or `Cmd+M`), the system shall open mode switcher dropdown
9. When mode is changed, a Trace span `aiMode.switch` shall be created with attributes `{from, to, triggeredBy: 'user' | 'system'}`
10. When AiMode is switched, it shall NOT change the HarnessMode (single/dual/panel); the Orchestrator continues to resolve HarnessMode independently via `resolveMode()`

#### 技术规格

```typescript
// sibylla-desktop/src/main/services/mode/types.ts

/**
 * AI Mode ID — 用户显式选择的意图模式
 *
 * 正交于 HarnessMode ('single' | 'dual' | 'panel')：
 * - AiModeId 控制行为人设、输出格式、后置质量提示
 * - HarnessMode 控制执行策略（Generator→Evaluator 循环方式）
 *
 * AiModeId 通过 AIChatRequest.aiModeId 字段传入 Orchestrator，
 * 不复用 harness:setMode 通道。
 */
export type AiModeId = 'plan' | 'analyze' | 'review' | 'write' | 'free' | string

/**
 * AI 输出塑形参数 — 控制模式特有的输出格式约束
 *
 * 与 GuardrailRule（文件操作安全层）解耦：
 * - OutputConstraints 是 AI 生成内容的格式/语气/长度约束
 * - GuardrailRule 是文件系统操作的安全检查（write/delete 边界等）
 * 两者不共享接口，不互相覆盖。
 */
export interface OutputConstraints {
  requireStructuredOutput?: boolean
  maxResponseLength?: number
  toneFilter?: 'direct' | 'formal' | 'casual'
  allowNegativeFeedback?: boolean
}

/**
 * 模式后置评估配置 — 软提示（warning/info），非硬门控
 *
 * 与现有 Evaluator（6 维度通用质量审查，pass/fail 硬门控）解耦：
 * - 现有 Evaluator 在 Dual/Panel 模式下作为前置硬门控
 * - ModeEvaluator 在所有 HarnessMode 下作为后置软提示
 * 执行流：Generator → Evaluator(硬) → ModeEvaluator(软) → 输出
 */
export interface AiModeEvaluatorConfig {
  checkExecutability?: boolean
  requireTimeEstimates?: boolean
  requireMultiPerspective?: boolean
  suppressRecommendation?: boolean
  requireIssuesFound?: boolean
  minimizeQuestions?: boolean
}

export interface AiModeDefinition {
  id: AiModeId
  label: string
  labelI18n?: Record<string, string>   // 'en' -> 'Plan', 'zh' -> '规划'
  icon: string                          // emoji or icon identifier
  color: string                         // hex color for UI accent
  description: string
  /**
   * 系统 prompt 前缀模板。
   * 作为 ContextEngine.assembleForHarness() 组装 system prompt 的第一段，
   * ContextEngine 的现有 context sections（CLAUDE.md、memory、guides）追加在模板之后。
   * 不需要 {{contextInjection}} 占位符——context sections 由 ContextEngine 自动追加。
   */
  systemPromptPrefix: string            // with {{variable}} placeholders
  outputConstraints?: OutputConstraints
  modeEvaluatorConfig?: AiModeEvaluatorConfig
  produces?: Array<'plan' | 'analysis' | 'review' | 'writing' | string>
  inputPlaceholder: string
  uiHints?: {
    bubbleStyle?: 'formal' | 'casual' | 'technical'
    responseFormatHint?: 'structured' | 'conversational' | 'concise'
  }
  requiresContext?: Array<'workspace-files' | 'selection' | 'url'>
  minModelCapability?: 'basic' | 'advanced'
  builtin: boolean
}

export interface ActiveAiModeState {
  conversationId: string
  aiModeId: AiModeId
  activatedAt: string
  activatedBy: 'user' | 'system' | 'auto-detect'
}
```

```typescript
// sibylla-desktop/src/main/services/mode/mode-registry.ts

const BUILTIN_MODES: AiModeDefinition[] = [
  {
    id: 'free',
    label: 'Free',
    icon: '💬',
    color: '#64748b',
    description: '自由对话，无特殊约束',
    systemPromptPrefix: DEFAULT_SYSTEM_PROMPT,
    inputPlaceholder: '问我任何事…',
    builtin: true
  },
  {
    id: 'plan',
    label: 'Plan',
    icon: '🗺️',
    color: '#3b82f6',
    description: '产出可执行的分步计划',
    systemPromptPrefix: PLAN_MODE_PROMPT,
    outputConstraints: {
      requireStructuredOutput: true,
      maxResponseLength: 8000
    },
    modeEvaluatorConfig: {
      checkExecutability: true,
      requireTimeEstimates: true
    },
    produces: ['plan'],
    inputPlaceholder: '描述你的目标，我会给你一份可执行的计划…',
    uiHints: {
      responseFormatHint: 'structured'
    },
    minModelCapability: 'advanced',
    builtin: true
  },
  {
    id: 'analyze',
    label: 'Analyze',
    icon: '📊',
    color: '#8b5cf6',
    description: '结构化分析对比，不给主观建议',
    systemPromptPrefix: ANALYZE_MODE_PROMPT,
    modeEvaluatorConfig: {
      requireMultiPerspective: true,
      suppressRecommendation: true
    },
    produces: ['analysis'],
    inputPlaceholder: '提供分析对象，我会做结构化拆解…',
    requiresContext: ['workspace-files', 'selection'],
    builtin: true
  },
  {
    id: 'review',
    label: 'Review',
    icon: '🔍',
    color: '#f59e0b',
    description: '批评性审查，主动指出问题',
    systemPromptPrefix: REVIEW_MODE_PROMPT,
    outputConstraints: {
      toneFilter: 'direct',
      allowNegativeFeedback: true
    },
    modeEvaluatorConfig: {
      requireIssuesFound: true
    },
    produces: ['review'],
    inputPlaceholder: '给我要审查的内容，我会挑刺…',
    requiresContext: ['workspace-files', 'selection'],
    builtin: true
  },
  {
    id: 'write',
    label: 'Write',
    icon: '✍️',
    color: '#10b981',
    description: '直接输出文档、邮件、公告等',
    systemPromptPrefix: WRITE_MODE_PROMPT,
    modeEvaluatorConfig: {
      minimizeQuestions: true
    },
    produces: ['writing'],
    inputPlaceholder: '告诉我写什么（主题、读者、长度），我直接写…',
    builtin: true
  }
]

export class AiModeRegistry {
  private modes: Map<AiModeId, AiModeDefinition> = new Map()
  private activeStates: Map<string, ActiveAiModeState> = new Map()

  constructor(
    private configManager: ConfigManager,
    private tracer: Tracer,
    private eventBus: EventBus,
    private logger: Logger
  ) {}

  async initialize(): Promise<void> {
    for (const mode of BUILTIN_MODES) {
      this.modes.set(mode.id, mode)
    }
    
    const customModes = await this.configManager.get('aiModes.custom', [])
    for (const mode of customModes) {
      if (this.modes.has(mode.id)) {
        this.logger.warn('aiMode.custom.conflict', { id: mode.id })
        continue
      }
      this.modes.set(mode.id, { ...mode, builtin: false })
    }
  }

  getAll(): AiModeDefinition[] {
    return Array.from(this.modes.values())
  }

  get(id: AiModeId): AiModeDefinition | undefined {
    return this.modes.get(id)
  }

  getActiveMode(conversationId: string): AiModeDefinition {
    const state = this.activeStates.get(conversationId)
    const modeId = state?.aiModeId ?? 'free'
    return this.modes.get(modeId) ?? this.modes.get('free')!
  }

  async switchMode(
    conversationId: string, 
    newModeId: AiModeId, 
    triggeredBy: ActiveAiModeState['activatedBy'] = 'user'
  ): Promise<void> {
    if (!this.modes.has(newModeId)) {
      this.logger.warn('aiMode.switch.not-found', { modeId: newModeId })
      newModeId = 'free'
    }
    
    const previous = this.activeStates.get(conversationId)
    
    await this.tracer.withSpan('aiMode.switch', async (span) => {
      span.setAttributes({
        'aiMode.from': previous?.aiModeId ?? 'none',
        'aiMode.to': newModeId,
        'aiMode.triggered_by': triggeredBy,
        'conversation.id': conversationId
      })
      
      this.activeStates.set(conversationId, {
        conversationId,
        aiModeId: newModeId,
        activatedAt: new Date().toISOString(),
        activatedBy: triggeredBy
      })
      
      this.eventBus.emit('aiMode:changed', { 
        conversationId, 
        from: previous?.aiModeId, 
        to: newModeId 
      })
    }, { kind: 'user-action', conversationId })
  }

  buildSystemPromptPrefix(aiModeId: AiModeId, variables: Record<string, string>): string {
    const mode = this.modes.get(aiModeId) ?? this.modes.get('free')!
    let prefix = mode.systemPromptPrefix
    
    for (const [key, value] of Object.entries(variables)) {
      prefix = prefix.replaceAll(`{{${key}}}`, value)
    }
    
    return prefix
  }

  async evaluateModeOutput(
    aiModeId: AiModeId, 
    output: string, 
    context?: Record<string, unknown>
  ): Promise<ModeEvaluationResult> {
    const mode = this.modes.get(aiModeId)
    if (!mode?.modeEvaluatorConfig) {
      return { warnings: [] }
    }
    const evaluator = this.resolveEvaluator(aiModeId)
    return evaluator ? evaluator.evaluate(output, context) : { warnings: [] }
  }

  private resolveEvaluator(aiModeId: AiModeId): ModeEvaluator | null {
    switch (aiModeId) {
      case 'analyze': return new AnalyzeModeEvaluator()
      case 'review': return new ReviewModeEvaluator()
      default: return null
    }
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 3.4.2 - Plan 模式与 Plan 产物管理

**用户故事：** 作为用户，当我让 AI 规划一件事时，我希望得到的不是一段对话，
而是一份结构化的计划文件，我可以编辑、勾选进度、追踪执行。

#### 功能描述

Plan 模式是 Sprint 3.4 的核心新能力。用户在 Plan 模式下发送消息后：

1. AI 按 Plan 模式的 prompt 模板生成结构化计划
2. 计划以 Markdown 格式输出，使用标准的 frontmatter + 步骤复选框
3. 系统自动将计划保存为文件（默认位置 `.sibylla/plans/plan-{id}.md`）
4. 对话气泡中显示计划预览 + "打开文件"、"归档为正式文档"、"开始执行"按钮
5. 后续对话中 AI 可引用 plan（通过 `@plan-xxx` 提及）
6. 用户可勾选步骤完成状态，AI 可跟进检查

Plan 文件格式：

```markdown
---
id: plan-20260418-103000
title: v2.0 发布前 3 天准备
mode: plan
status: in_progress    # draft | in_progress | completed | archived | abandoned
created_at: 2026-04-18T10:30:00Z
updated_at: 2026-04-18T10:35:00Z
conversation_id: conv-xxx
trace_id: trace-xxx
estimated_duration: 3d
tags: [release, v2.0]
---

# v2.0 发布前 3 天准备

## 目标
确保 v2.0 在 4 月 21 日顺利发布。

## 步骤

### 第 1 天（4 月 18 日）
- [ ] 完成所有 P0 测试（预计 4h，负责：QA）
- [ ] 修复最后一个 blocker bug（预计 2h，负责：dev）
- [ ] 起草发布公告（预计 1h，负责：PM）

### 第 2 天（4 月 19 日）
- [ ] 内部 demo（10:00，全体）
- [ ] 客服培训材料就位（预计 3h）

### 第 3 天（4 月 20 日）
- [ ] 最终 smoke test（上午）
- [ ] 发布公告定稿（中午）
- [ ] 凌晨部署准备（晚上）

## 风险与备案
- 如果 blocker 无法修复：回退到 v1.9.3，发布公告延期
- 如果部署失败：走灰度流程

## 成功标准
- 所有 P0 测试通过
- 用户首日错误率 < 0.5%
- 客服能独立处理 v2.0 相关问询
```

Plan 生命周期：

- **draft**：刚生成、用户未确认
- **in_progress**：用户开始勾选或标记为执行中
- **completed**：所有必要步骤完成
- **archived**：归档为正式文档（移动到 `specs/plans/`）
- **abandoned**：用户放弃

#### 验收标准

1. When in Plan mode, the AI's system prompt shall enforce structured output with frontmatter, sections, and checkbox steps
2. When AI generates a plan, the system shall parse the output, validate the structure, save to `.sibylla/plans/plan-{timestamp}.md`, and return the file path
3. When plan parsing fails (malformed structure), the system shall save as-is with `status: draft-unparsed` and notify user to review
4. When user clicks "开始执行" on a plan, the system shall set `status: in_progress` and link the plan to the current conversation
5. When user ticks a checkbox in the plan file, the system shall detect the change (file watcher), update `updated_at`, and optionally notify AI if tracking is enabled
6. When user clicks "归档为正式文档", the system shall prompt for target path (default `specs/plans/`), move the file, update status, and maintain cross-reference
7. When user references `@plan-xxx` in a subsequent message, the AI context shall include the current plan content and status
8. When a plan exists for > 30 days with no updates and status is `draft` or `abandoned`, the system shall auto-archive to Trace and remove from active list
9. When user explicitly says "按 plan-xxx 执行" or clicks "跟进进度", AI shall review plan, compare with recent actions (via Trace/progress.md), and report progress
10. When Plan mode produces non-plan content (e.g. user asked a side question), the system shall not force plan format; respond normally but hint "提示：Plan 模式已开启，但本次回复非计划输出"

#### 技术规格

```typescript
// sibylla-desktop/src/main/services/plan/types.ts

export type PlanStatus = 
  | 'draft' 
  | 'draft-unparsed'
  | 'in_progress' 
  | 'completed' 
  | 'archived' 
  | 'abandoned'

export interface PlanMetadata {
  id: string
  title: string
  mode: 'plan'
  status: PlanStatus
  createdAt: string
  updatedAt: string
  conversationId?: string
  traceId?: string
  estimatedDuration?: string    // ISO 8601 duration or human string
  tags: string[]
  filePath: string
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
```

```typescript
// sibylla-desktop/src/main/services/plan/plan-manager.ts

/**
 * PlanManager — 用户可见的计划文件管理器
 *
 * 与 TaskStateMachine（内部任务执行引擎）的关系：
 * - PlanManager 负责：Markdown 计划文件的 CRUD、解析、渲染、归档
 * - TaskStateMachine 负责：任务的步骤状态跟踪（JSON 格式，机器可读）
 * - 当用户点击"开始执行"时，PlanManager 将步骤导出为 TaskStateMachine 任务
 *
 * 数据模型：
 * - 用户可编辑的 Plan 文件：.sibylla/plans/plan-{id}.md（Markdown + frontmatter）
 * - 内部任务状态：.sibylla/agents/task-{id}.json（由 TaskStateMachine 管理）
 */
export class PlanManager {
  private plans: Map<string, PlanMetadata> = new Map()
  private fileWatcher?: FileWatcher

  constructor(
    private workspaceRoot: string,
    private fileManager: FileManager,
    private tracer: Tracer,
    private eventBus: EventBus,
    private progressLedger: ProgressLedger,
    private taskStateMachine: TaskStateMachine,
    private logger: Logger
  ) {}

  async initialize(): Promise<void> {
    await this.loadExistingPlans()
    this.startFileWatcher()
  }

  async createFromAIOutput(input: {
    aiContent: string
    conversationId: string
    traceId: string
  }): Promise<PlanMetadata> {
    return this.tracer.withSpan('plan.create', async (span) => {
      const id = `plan-${this.timestamp()}`
      const parsed = this.parsePlanMarkdown(input.aiContent, id)
      
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
        filePath: this.planFilePath(id)
      }
      
      const finalMarkdown = this.renderPlan(metadata, parsed)
      await this.fileManager.atomicWrite(metadata.filePath, finalMarkdown)
      
      this.plans.set(id, metadata)
      this.eventBus.emit('plan:created', metadata)
      
      span.setAttributes({
        'plan.id': id,
        'plan.parse_success': parsed.parseSuccess,
        'plan.step_count': parsed.steps.length
      })
      
      return metadata
    }, { kind: 'system' })
  }

  async startExecution(planId: string): Promise<void> {
    const plan = this.plans.get(planId)
    if (!plan) throw new Error(`Plan not found: ${planId}`)
    
    plan.status = 'in_progress'
    plan.updatedAt = new Date().toISOString()
    await this.persistMetadata(plan)
    
    // Export plan steps to TaskStateMachine (internal task engine)
    const parsed = await this.getPlan(planId)
    const steps = parsed?.steps.map(s => s.text) ?? ['Execute plan']
    const taskState = await this.taskStateMachine.create(plan.title, steps)
    
    // Link to progress ledger (Sprint 3.3)
    await this.progressLedger.declare({
      title: `执行计划: ${plan.title}`,
      mode: 'plan',
      traceId: plan.traceId,
      conversationId: plan.conversationId,
      plannedChecklist: steps
    })
    
    this.eventBus.emit('plan:execution-started', plan)
  }

  async archiveAsFormalDocument(
    planId: string, 
    targetPath: string
  ): Promise<PlanMetadata> {
    const plan = this.plans.get(planId)
    if (!plan) throw new Error(`Plan not found: ${planId}`)
    
    const absoluteTargetPath = path.isAbsolute(targetPath) 
      ? targetPath 
      : path.join(this.workspaceRoot, targetPath)
    
    // Copy content (not move—keep a link in .sibylla/plans/)
    const content = await this.fileManager.readFile(plan.filePath)
    const updatedContent = this.updateFrontmatter(content, {
      status: 'archived',
      archivedAt: new Date().toISOString(),
      archivedTo: targetPath
    })
    
    await this.fileManager.atomicWrite(absoluteTargetPath, updatedContent)
    
    // Original file in .sibylla/plans/ becomes a stub
    const stub = this.renderArchivedStub(plan, absoluteTargetPath)
    await this.fileManager.atomicWrite(plan.filePath, stub)
    
    plan.status = 'archived'
    plan.filePath = absoluteTargetPath
    plan.updatedAt = new Date().toISOString()
    this.plans.set(planId, plan)
    
    this.eventBus.emit('plan:archived', plan)
    return plan
  }

  async getActivePlans(): Promise<PlanMetadata[]> {
    return Array.from(this.plans.values())
      .filter(p => p.status === 'draft' || p.status === 'in_progress')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async getPlan(id: string): Promise<ParsedPlan | null> {
    const metadata = this.plans.get(id)
    if (!metadata) return null
    
    const content = await this.fileManager.readFile(metadata.filePath)
    return this.parsePlanFile(content, metadata)
  }

  private startFileWatcher(): void {
    const watchPath = path.join(this.workspaceRoot, '.sibylla/plans/')
    this.fileWatcher = watchDirectory(watchPath, async (event) => {
      if (event.type === 'change' && event.path.endsWith('.md')) {
        await this.reloadPlan(event.path)
      }
    })
  }

  private async reloadPlan(filePath: string): Promise<void> {
    const content = await this.fileManager.readFile(filePath)
    const parsed = this.parsePlanFile(content, null)
    if (!parsed) return
    
    const existing = this.plans.get(parsed.metadata.id)
    if (existing) {
      // Detect step completion changes and emit
      const stepsBefore = this.flattenSteps(existing)
      const stepsAfter = this.flattenSteps(parsed)
      const newlyCompleted = stepsAfter.filter((s, i) => 
        s.done && !stepsBefore[i]?.done
      )
      
      if (newlyCompleted.length > 0) {
        this.eventBus.emit('plan:steps-completed', {
          planId: parsed.metadata.id,
          completed: newlyCompleted
        })
      }
    }
    
    parsed.metadata.updatedAt = new Date().toISOString()
    this.plans.set(parsed.metadata.id, parsed.metadata)
  }

  private parsePlanMarkdown(rawContent: string, id: string): ParsedPlanResult {
    try {
      const fm = parseFrontmatter(rawContent)
      const body = stripFrontmatter(rawContent)
      
      const titleMatch = body.match(/^#\s+(.+)$/m)
      const title = titleMatch?.[1] ?? fm?.title
      
      const goalMatch = body.match(/##\s*目标\s*\n([\s\S]*?)(?=\n##|$)/)
      const goal = goalMatch?.[1]?.trim()
      
      const steps = this.extractSteps(body)
      if (steps.length === 0) {
        return { parseSuccess: false, rawMarkdown: rawContent, title, id }
      }
      
      return {
        parseSuccess: true,
        title,
        goal,
        steps,
        risks: this.extractSection(body, '风险与备案'),
        successCriteria: this.extractSection(body, '成功标准'),
        tags: fm?.tags ?? [],
        rawMarkdown: rawContent,
        id
      }
    } catch (err) {
      this.logger.warn('plan.parse.failed', { err })
      return { parseSuccess: false, rawMarkdown: rawContent, id }
    }
  }

  private extractSteps(body: string): PlanStep[] {
    const steps: PlanStep[] = []
    const lines = body.split('\n')
    let currentSection: string | undefined
    
    for (const line of lines) {
      const sectionMatch = line.match(/^###\s+(.+)$/)
      if (sectionMatch) {
        currentSection = sectionMatch[1]
        continue
      }
      
      const stepMatch = line.match(/^\s*-\s+\[([ xX])\]\s+(.+)$/)
      if (stepMatch) {
        const done = stepMatch[1].toLowerCase() === 'x'
        const text = stepMatch[2]
        
        // Extract inline metadata like "(预计 4h，负责：QA)"
        const durationMatch = text.match(/预计\s*(\d+)\s*([hmd])/)
        const ownerMatch = text.match(/负责[：:]\s*([^，,)]+)/)
        
        steps.push({
          sectionTitle: currentSection,
          text,
          done,
          estimatedMinutes: durationMatch 
            ? this.parseDuration(durationMatch[1], durationMatch[2]) 
            : undefined,
          owner: ownerMatch?.[1]?.trim()
        })
      }
    }
    
    return steps
  }
}
```

Plan 模式 system prompt 模板（作为 ContextEngine 组装 system prompt 的前缀，context sections 由 ContextEngine 自动追加在后）：

```typescript
const PLAN_MODE_PROMPT = `你是 Sibylla 的 Plan 模式助手。你的任务是为用户的目标产出一份可执行的分步计划，
不要直接执行，不要过多哲学化讨论。

输出必须是严格的 Markdown 格式，包含：

1. **frontmatter**（---包裹）：至少包含 title、tags
2. **# 标题**：一行简洁的计划名
3. **## 目标**：用户目标的清晰陈述（2-4 句）
4. **## 步骤**：按时间段或阶段分组，每个步骤用 \`- [ ] 步骤描述（预计 Xh，负责：谁）\` 格式
5. **## 风险与备案**：识别 2-5 个主要风险及应对
6. **## 成功标准**：可量化的完成判断依据

要求：
- 每个步骤必须具体可执行，不要"讨论"、"思考"这类模糊词
- 步骤粒度控制在 30min-4h 之间
- 时间估算保守，加 20% buffer
- 如果信息不足以制定完整计划，在"## 前置信息请求"中列出你需要的信息
- 总步骤数建议 5-15 个，过多则拆分子计划

{{userGoal}}`
```

#### 优先级

P0 - 必须完成

---

### 需求 3.4.3 - Analyze / Review / Write 模式

**用户故事：** 作为用户，在不同工作场景下我需要 AI 扮演不同角色（分析师、
审查者、撰稿人），让我通过显式模式切换而非反复解释来获得。

#### 功能描述

**Analyze 模式**：结构化拆解、多角度对比、不给主观建议。
- 适用：竞品分析、方案对比、数据解读
- 产物：分析报告（维度表格、SWOT 或类似结构）

**Review 模式**：批评性审查、直言问题、必须找到改进点。
- 适用：文档审阅、代码审查、设计 review
- 产物：问题列表 + 严重度 + 改进建议

**Write 模式**：直接产出成稿、减少反问、注重风格一致。
- 适用：内部公告、邮件草稿、文档撰写
- 产物：可直接使用的文本

每个模式的 Evaluator 会检查模式特有的输出质量：
- Analyze：是否至少列出 3 个分析维度、是否避免主观建议词汇
- Review：是否至少列出 N 个问题（按内容长度动态）、是否区分严重度
- Write：是否符合用户指定的长度/风格、是否没有大量反问

#### 验收标准

1. When in Analyze mode, the AI's output shall contain at least 3 analysis dimensions or perspectives
2. When in Analyze mode, words like "建议"、"你应该"、"最佳实践" shall trigger Evaluator warning (soft check, not rejection)
3. When in Review mode, the AI shall produce at least 2 issues per 500 words of reviewed content
4. When in Review mode, each issue shall include severity (critical / major / minor / nit)
5. When in Write mode, the AI shall minimize clarifying questions (hard limit: max 1 question) and prefer making reasonable assumptions
6. When in Write mode with user specifying length (e.g. "300 字"), output shall be within ±15% of target
7. When mode's Evaluator finds quality issues, the response shall include a meta-warning (not block), e.g. "⚠️ Review 模式要求挑刺，但本次只找到 1 个问题，你可能需要提供更多内容"
8. When user has Analyze/Review mode on but only chats casually (e.g. "谢谢"), the system shall pass through without applying strict Evaluator

#### 技术规格

```typescript
const ANALYZE_MODE_PROMPT = `你是 Sibylla 的 Analyze 模式助手。你的任务是对用户提供的对象进行
结构化、多维度的分析，**不要**给主观建议或"你应该"式的结论。

分析框架（选择合适的）：
- 维度对比表：列出 3-6 个对比维度
- SWOT：优势 / 劣势 / 机会 / 威胁
- 利益相关方：不同角色的视角
- 时间轴：过去 / 现状 / 趋势
- 数据解读：数字背后的含义

输出格式：
1. **## 分析对象**：明确这次在分析什么
2. **## 分析框架**：说明本次使用的框架
3. **## 分析内容**：按框架展开
4. **## 关键发现**：3-5 条客观发现（不含建议）
5. **## 待澄清问题**（可选）：信息不足时列出

禁用词：建议、应该、推荐、最佳实践、最好是。如果用户明确要求建议，请切换到 Free 模式。

用户需要分析的内容：{{userInput}}`

const REVIEW_MODE_PROMPT = `你是 Sibylla 的 Review 模式助手。你的任务是对用户提供的内容
（文档/代码/设计）进行**批评性审查**。你必须挑出问题，不要奉承。

审查原则：
- 宁可严厉，不要客气
- 每个问题必须具体，指出在哪一段 / 哪一行 / 哪一处
- 给每个问题标注严重度：🔴 critical / 🟠 major / 🟡 minor / ⚪ nit
- 尽量同时给出改进建议（但改进是次要的，找问题是主要的）

输出格式：
1. **## 总体评价**（1-2 句，但不要空洞赞美）
2. **## 问题列表**：
   - 🔴 [critical] 问题描述（位置：xxx）
     - 改进建议：xxx
   - 🟠 [major] ...
3. **## 值得保留的亮点**（可选，最多 3 条）
4. **## 需要进一步澄清的问题**（可选）

要求：
- 至少列出与内容长度相称的问题数（约每 500 字/100 行 2 个问题）
- 不要总说"可以更好"，要说"如何更好"
- 严重度要分层，不要所有都是 major

审查对象：{{userInput}}`

const WRITE_MODE_PROMPT = `你是 Sibylla 的 Write 模式助手。你的任务是直接**产出成稿**的文本，
不是讨论、不是大纲、不是建议。

原则：
- 最多问 1 个关键问题；其余信息缺失时做合理假设并在末尾注明
- 严格遵守用户指定的格式、长度、风格
- 如果用户没指定，按场景推断（公告用正式、邮件用友好、内部文档用技术）
- 完成稿正文，不要加 "希望对你有帮助" 这类套话

输出格式（除非用户另有指定）：
1. **内容主体**：直接就是要写的文本
2. **---**（分隔符）
3. **修订说明**（简短）：我做了哪些假设、省略了什么、为什么这样写

写作任务：{{userInput}}`
```

```typescript
// sibylla-desktop/src/main/services/mode/mode-evaluators.ts

/**
 * ModeEvaluator — 模式后置质量检查（软提示层）
 *
 * 与现有 Evaluator（Harness 硬门控）的定位差异：
 * - 现有 Evaluator：Dual/Panel 模式下的前置质量门控，pass/fail 驱动重试
 * - ModeEvaluator：所有 AiMode 下的后置软提示，返回 warnings 不阻塞输出
 *
 * 执行流：Generator → Evaluator(硬门控,Dual/Panel) → ModeEvaluator(软提示) → 输出
 *
 * ModeEvaluator 的 warnings 会附加在 HarnessResult.modeWarnings 中，
 * 由渲染进程展示为 meta-warning（如 "⚠️ Review 模式要求挑刺，但本次只找到 1 个问题"）。
 */

export interface ModeEvaluationResult {
  warnings: ModeWarning[]
}

export interface ModeWarning {
  severity: 'info' | 'warning'
  code: string
  message: string
}

export interface ModeEvaluator {
  readonly modeId: AiModeId
  evaluate(output: string, context?: Record<string, unknown>): Promise<ModeEvaluationResult>
}

export class AnalyzeModeEvaluator implements ModeEvaluator {
  readonly modeId = 'analyze'
  
  async evaluate(output: string): Promise<ModeEvaluationResult> {
    const warnings: ModeWarning[] = []
    
    const dimensionCount = (output.match(/^##\s+|^###\s+/gm) ?? []).length
    if (dimensionCount < 3) {
      warnings.push({
        severity: 'warning',
        code: 'insufficient_dimensions',
        message: `分析维度不足（${dimensionCount} < 3）`
      })
    }
    
    const forbiddenWords = ['建议', '应该', '推荐', '最佳实践']
    for (const word of forbiddenWords) {
      const regex = new RegExp(word, 'g')
      const matches = output.match(regex) ?? []
      if (matches.length > 2) {
        warnings.push({
          severity: 'info',
          code: 'recommendation_leak',
          message: `出现 ${matches.length} 次"${word}"，Analyze 模式应避免主观建议`
        })
      }
    }
    
    return { warnings }
  }
}

export class ReviewModeEvaluator implements ModeEvaluator {
  readonly modeId = 'review'
  
  async evaluate(
    output: string, 
    context?: Record<string, unknown>
  ): Promise<ModeEvaluationResult> {
    const warnings: ModeWarning[] =    
    const issueCount = (output.match(/^\s*-\s*[🔴🟠🟡⚪]/gm) ?? []).length
    const reviewTargetLength = (context?.reviewTargetLength as number) ?? 500
    const expectedMin = Math.max(
      2, 
      Math.floor(reviewTargetLength / 500) * 2
    )
    
    if (issueCount < expectedMin) {
      warnings.push({
        severity: 'warning',
        code: 'too_few_issues',
        message: `找到 ${issueCount} 个问题，期望至少 ${expectedMin} 个`
      })
    }
    
    const severityDistribution = {
      critical: (output.match(/🔴/g) ?? []).length,
      major: (output.match(/🟠/g) ?? []).length,
      minor: (output.match(/🟡/g) ?? []).length,
      nit: (output.match(/⚪/g) ?? []).length
    }
    
    const uniqueSeverities = Object.values(severityDistribution)
      .filter(c => c > 0).length
    if (uniqueSeverities < 2 && issueCount >= 3) {
      warnings.push({
        severity: 'info',
        code: 'severity_not_layered',
        message: '所有问题严重度集中，建议分层'
      })
    }
    
    return { warnings }
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 3.4.4 - 一键优化提示词

**用户故事：** 作为用户，我经常想让 AI 帮忙但说不清楚，点一下按钮让 AI 帮我
把输入改得更清楚，我可以决定要不要采纳。

#### 功能描述

在用户输入框右侧（或下方）放置 ✨"优化"按钮。点击后：

1. 当前输入内容 + 当前模式 + 最近上下文摘要被发送给优化服务
2. 优化服务调用一个轻量 LLM 请求（独立于主对话）
3. 返回 1-3 条优化建议，展示在输入框下方浮层中
4. 每条建议包含：优化后文本、优化理由（简短）、关键改动高亮
5. 用户可：
   - **应用建议**：替换输入框内容
   - **合并建议**：保留原文 + 追加建议的补充
   - **编辑后应用**：可修改建议再使用
   - **忽略**：关闭浮层

优化策略（按当前模式调整）：
- Plan 模式：补充目标、约束、期望产物
- Analyze 模式：明确分析对象、选择分析角度
- Review 模式：指定审查重点、严厉程度
- Write 模式：指定读者、长度、风格
- Free 模式：通用澄清、补充上下文

优化请求不写入对话历史（不污染），但生成独立的 Trace span（用于调试和未来个性化学习）。

#### 验收标准

1. When user clicks "✨ 优化" button, the system shall capture current input (min 5 characters), current mode, and conversation summary
2. When input is empty or < 5 characters, the button shall be disabled with tooltip "请先输入内容"
3. When optimization is in progress, the button shall show loading state; no second request allowed
4. When optimization returns, the system shall display 1-3 suggestions in a popover below input
5. When a suggestion is displayed, key changes from original shall be highlighted (diff style or bold)
6. When user clicks "应用", the input box content shall be replaced with the suggestion's text
7. When user clicks "合并", the input box shall contain original + "\n\n补充：" + key additions from suggestion
8. When user clicks "编辑后应用", an inline editor shall open with the suggestion pre-filled
9. When user clicks "忽略" or clicks outside, the popover shall close without changes
10. When optimization fails (API error, timeout > 8s), the system shall show error toast but preserve original input
11. When user has used optimization 5+ times in one session, the system shall show a one-time hint "💡 小贴士：你可以在设置中为常用场景预设输入模板"
12. When generating optimization suggestions, the Trace span `prompt.optimize` shall record original length, suggestion count, user action (applied/merged/ignored)
13. When optimization is called, it shall NOT be recorded in the conversation message history

#### 技术规格

```typescript
// sibylla-desktop/src/main/services/prompt-optimizer/types.ts

export interface OptimizeRequest {
  originalText: string
  currentMode: AiModeId
  conversationContext?: {
    summary: string
    recentMessages: Array<{ role: string; content: string }>  // last 3
  }
  userPreferences?: {
    preferredLength?: 'short' | 'medium' | 'detailed'
    language?: string
  }
}

export interface OptimizationSuggestion {
  id: string
  text: string                           // the improved prompt
  rationale: string                      // why this is better (1-2 sentences)
  keyChanges: Array<{
    type: 'added' | 'clarified' | 'removed' | 'restructured'
    description: string
  }>
  estimatedImprovementScore: number      // 0-1
}

export interface OptimizeResponse {
  requestId: string
  suggestions: OptimizationSuggestion[]
  optimizationMode: 'quick' | 'thorough'
  durationMs: number
}
```

```typescript
// sibylla-desktop/src/main/services/prompt-optimizer/prompt-optimizer.ts

const OPTIMIZER_SYSTEM_PROMPT = `你是一个 prompt 优化助手。用户会给你一段他们打算发给 AI 的消息，
你的任务是给出 1-3 条优化建议，让这段消息更清晰、更有上下文、更容易得到好结果。

优化原则：
1. **保留用户原意**：不要改变核心诉求
2. **补充缺失信息**：读者是谁？目标是什么？约束在哪？
3. **消除歧义**：模糊词替换为具体词
4. **结构化**：长请求拆分成列表或小节
5. **适配当前模式**：{{modeContext}}

禁止：
- 不要夸大或添加用户没说的具体数字
- 不要改变用户的语气偏好（客气/直接/专业）
- 不要在优化文本里加"请"这类无意义礼貌词

输出格式（严格 JSON）：
{
  "suggestions": [
    {
      "text": "优化后的完整文本",
      "rationale": "为什么这个更好（1-2 句）",
      "keyChanges": [
        {"type": "added", "description": "补充了目标读者"},
        {"type": "clarified", "description": "把'尽快'改为具体时间"}
      ],
      "estimatedImprovementScore": 0.75
    }
  ]
}

当前模式：{{mode}}
用户当前对话摘要：{{contextSummary}}
用户原始输入：{{originalText}}`

export class PromptOptimizer {
  private cache: LRUCache<string, OptimizeResponse>   // dedupe within 60s
  private requestCount: Map<string, number> = new Map()  // per session

  constructor(
    private aiGateway: AiGatewayClient,
    private modeRegistry: AiModeRegistry,
    private tracer: Tracer,
    private config: OptimizerConfig,
    private logger: Logger
  ) {
    this.cache = new LRUCache({ max: 50, ttl: 60_000 })
  }

  async optimize(request: OptimizeRequest): Promise<OptimizeResponse> {
    return this.tracer.withSpan('prompt.optimize', async (span) => {
      span.setAttributes({
        'prompt.original_length': request.originalText.length,
        'prompt.mode': request.currentMode,
        'prompt.has_context': !!request.conversationContext
      })
      
      const cacheKey = this.buildCacheKey(request)
      const cached = this.cache.get(cacheKey)
      if (cached) {
        span.setAttribute('prompt.cache_hit', true)
        return cached
      }
      
      const mode = this.modeRegistry.get(request.currentMode)
      const modeContext = mode 
        ? `用户选择的是 ${mode.label} 模式：${mode.description}`
        : '用户在自由模式'
      
      const systemPrompt = OPTIMIZER_SYSTEM_PROMPT
        .replace('{{mode}}', request.currentMode)
        .replace('{{modeContext}}', modeContext)
        .replace('{{contextSummary}}', request.conversationContext?.summary ?? '（无）')
        .replace('{{originalText}}', request.originalText)
      
      const startTime = Date.now()
      
      try {
        // Use existing AiGatewayClient session interface
        const session = this.aiGateway.createSession({ role: 'optimizer' })
        try {
          const response = await session.chat({
            model: this.config.optimizerModel,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: 'Generate optimization suggestions.' }
            ],
            temperature: 0.3,
            maxTokens: 1200,
          })
          
          const parsed = this.parseResponse(response.content)
          const result: OptimizeResponse = {
            requestId: span.context.spanId,
            suggestions: parsed.suggestions.slice(0, 3).map((s, i) => ({
              id: `sug-${span.context.spanId}-${i}`,
              ...s
            })),
            optimizationMode: 'quick',
            durationMs: Date.now() - startTime
          }
          
          span.setAttributes({
            'prompt.suggestion_count': result.suggestions.length,
            'prompt.duration_ms': result.durationMs
          })
          
          this.cache.set(cacheKey, result)
          return result
        } finally {
          session.close()
        }
      } catch (err) {
        span.setStatus('error', String(err))
        throw new OptimizationError('优化服务暂时不可用', { cause: err })
      }
    }, { kind: 'ai-call' })
  }

  async recordUserAction(
    requestId: string, 
    action: 'applied' | 'merged' | 'edited' | 'ignored',
    suggestionId?: string
  ): Promise<void> {
    await this.tracer.withSpan('prompt.optimize.user-action', async (span) => {
      span.setAttributes({
        'prompt.optimize.request_id': requestId,
        'prompt.optimize.action': action,
        'prompt.optimize.suggestion_id': suggestionId
      })
    }, { kind: 'user-action' })
  }

  private parseResponse(content: string): { suggestions: OptimizationSuggestion[] } {
    try {
      const parsed = JSON.parse(content)
      if (!Array.isArray(parsed.suggestions)) {
        throw new Error('Invalid response structure')
      }
      return parsed
    } catch (err) {
      // Fallback: try to extract JSON from markdown code block
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (codeBlockMatch) {
        return JSON.parse(codeBlockMatch[1])
      }
      throw new Error('Cannot parse optimizer response')
    }
  }

  private buildCacheKey(req: OptimizeRequest): string {
    return hash({
      text: req.originalText.trim(),
      mode: req.currentMode,
      contextSummary: req.conversationContext?.summary ?? ''
    })
  }
}
```

```tsx
// sibylla-desktop/src/renderer/components/input/OptimizeButton.tsx

export function OptimizeButton({ 
  inputValue, 
  currentMode, 
  onApply, 
  onMerge 
}: Props) {
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<OptimizationSuggestion[] | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [hintShown, setHintShown] = useState(false)
  
  const disabled = inputValue.trim().length < 5 || loading

  const handleOptimize = async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI?.promptOptimizer?.optimize({
        originalText: inputValue,
        currentMode,
        conversationContext: await getConversationContext()
      })
      setSuggestions(result.suggestions)
      setRequestId(result.requestId)
      
      const count = incrementUsageCount()
      if (count === 5 && !hintShown) {
        showToast('💡 小贴士：你可以在设置中为常用场景预设输入模板')
        setHintShown(true)
      }
    } catch (err) {
      showToast('优化服务暂时不可用，请稍后重试', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleApply = async (suggestion: OptimizationSuggestion) => {
    onApply(suggestion.text)
    await window.electronAPI?.promptOptimizer?.recordAction(
      requestId!, 'applied', suggestion.id
    )
    setSuggestions(null)
  }

  const handleMerge = async (suggestion: OptimizationSuggestion) => {
    const additions = suggestion.keyChanges
      .filter(c => c.type === 'added')
      .map(c => c.description)
      .join('；')
    onMerge(`${inputValue}\n\n补充：${additions}`)
    await window.electronAPI?.promptOptimizer?.recordAction(
      requestId!, 'merged', suggestion.id
    )
    setSuggestions(null)
  }

  const handleIgnore = async () => {
    if (requestId) {
      await window.electronAPI?.promptOptimizer?.recordAction(requestId, 'ignored')
    }
    setSuggestions(null)
  }

  return (
    <>
      <button 
        className="optimize-btn" 
        onClick={handleOptimize} 
        disabled={disabled}
        title={disabled && !loading ? '请先输入内容（至少 5 个字符）' : '优化提示词'}
      >
        {loading ? <Spinner size="sm" /> : <span>✨ 优化</span>}
      </button>
      
      {suggestions && (
        <SuggestionsPopover
          original={inputValue}
          suggestions={suggestions}
          onApply={handleApply}
          onMerge={handleMerge}
          onEdit={(s) => openEditor(s)}
          onClose={handleIgnore}
        />
      )}
    </>
  )
}
```

#### 优先级

P0 - 必须完成

---

### 需求 3.4.5 - 系统级 Wiki（Sibylla Handbook）

**用户故事：** 作为用户，我想随时查阅"Sibylla 怎么用"、"这个功能是什么意思"，
不想每次都问 AI 或翻网上文档。AI 回答我使用问题时也应该能引用这份内置手册。

#### 功能描述

Sibylla Handbook 是**内置于应用**的使用手册，结构：

```
resources/handbook/
├── index.yaml                    # 目录结构 + 元数据
├── zh/                           # 中文
│   ├── getting-started.md
│   ├── modes/
│   │   ├── plan.md
│   │   ├── analyze.md
│   │   ├── review.md
│   │   └── write.md
│   ├── features/
│   │   ├── memory-system.md
│   │   ├── trace-inspector.md
│   │   ├── prompt-optimization.md
│   │   └── progress-ledger.md
│   ├── shortcuts.md
│   ├── faq.md
│   └── troubleshooting.md
└── en/                           # 英文
    └── ... (same structure)
```

访问方式：
- 命令面板搜索（`Ctrl+K` → 输入关键词，Handbook 条目会作为独立分类出现）
- 帮助菜单 → "用户手册"
- 设置页面的帮助链接
- AI 回答使用问题时自动检索并引用

AI 检索集成：
- 当用户消息被识别为"how-to"类问题（启发式 + 关键词）时，系统自动将 Handbook 相关条目注入上下文
- AI 回答中如果引用了 Handbook，会显示"📖 来自用户手册"的引用标记

克隆到本地：
- 用户可通过命令"将手册克隆到工作区"把 Handbook 复制到 `.sibylla/handbook-local/`
- 本地版本可编辑（添加个人笔记），但不影响内置版本
- 本地版本优先被 AI 检索（类似"用户覆盖官方"）

#### 验收标准

1. When the application starts, the system shall load Handbook index.yaml and build a searchable index
2. When user presses `Ctrl+K` (or `Cmd+K`) and types, Handbook entries matching the query shall appear in a dedicated section
3. When user opens a Handbook entry, it shall render as Markdown in a dedicated viewer (not edit mode)
4. When user language preference is 'zh', Handbook entries shall prefer Chinese version; fall back to English if Chinese missing
5. When user asks a "how-to" question (detected via keywords like "怎么", "如何", "什么是"), the system shall search Handbook and inject top 2 relevant entries as context
6. When AI response includes Handbook reference, the UI shall show "📖 来自用户手册：{entry title}" tag with click-to-open
7. When user runs "克隆手册到工作区" command, the system shall copy Handbook to `.sibylla/handbook-local/` with metadata file `.sibylla/handbook-local/.cloned-from-version`
8. When local handbook exists, it shall take precedence in search; both sources shown with tags "(内置)" / "(本地)"
9. When application updates, the system shall offer to update local handbook (diff preview) without auto-overwriting user edits
10. When Handbook content is missing (e.g. damaged installation), the system shall gracefully degrade (search returns empty, no crash) and log error

#### 技术规格

```typescript
// sibylla-desktop/src/main/services/handbook/types.ts

export interface HandbookEntry {
  id: string                       // e.g. 'modes.plan'
  path: string                     // e.g. 'modes/plan.md'
  title: string
  tags: string[]
  language: string
  version: string                  // content hash
  source: 'builtin' | 'local'
  content: string                  // Markdown
  keywords: string[]
  updatedAt: string
}

export interface HandbookIndex {
  version: string
  languages: string[]
  entries: Array<{
    id: string
    path: string
    title: Record<string, string>   // lang -> title
    tags: string[]
    keywords: string[]
  }>
}
```

```typescript
// sibylla-desktop/src/main/services/handbook/handbook-service.ts

/**
 * HandbookService — 系统内置用户手册服务
 *
 * 搜索引擎选择：复用现有 LocalSearchEngine（基于 SQLite FTS5），
 * 不引入新的 MiniSearch 依赖，保持依赖最小化。
 * Handbook 内容在初始化时索引到 SQLite FTS5 表中。
 */
export class HandbookService {
  private builtinEntries: Map<string, HandbookEntry> = new Map()
  private localEntries: Map<string, HandbookEntry> = new Map()
  private searchEngine: LocalSearchEngine | null = null

  constructor(
    private appResourcesPath: string,
    private workspaceRoot: string,
    private fileManager: FileManager,
    private configManager: ConfigManager,
    private localSearchEngine: LocalSearchEngine,
    private logger: Logger
  ) {
    this.searchEngine = localSearchEngine
  }

  async initialize(): Promise<void> {
    await this.loadBuiltin()
    await this.loadLocal()
    this.buildSearchIndex()
  }

  async search(query: string, options?: { 
    limit?: number; 
    language?: string 
  }): Promise<HandbookEntry[]> {
    const limit = options?.limit ?? 10
    const lang = options?.language ?? this.currentLanguage()
    
    // Use LocalSearchEngine (FTS5) for fulltext search
    const results = await this.localSearchEngine.query({
      query,
      limit,
      fileTypes: ['md'],
      // Filter to handbook paths only
      pathPrefix: 'handbook'
    })
    
    const entries = results
      .map(r => this.getEntry(this.pathToEntryId(r.path), lang))
      .filter((e): e is HandbookEntry => e !== null)
      .slice(0, limit)
    
    return entries
  }

  getEntry(id: string, language?: string): HandbookEntry | null {
    const lang = language ?? this.currentLanguage()
    const key = `${id}:${lang}`
    
    // Local takes precedence
    return this.localEntries.get(key) 
        ?? this.builtinEntries.get(key)
        ?? this.getEntry(id, 'en')   // fallback to English
        ?? null
  }

  async cloneToWorkspace(): Promise<{ clonedCount: number; localPath: string }> {
    const localPath = path.join(this.workspaceRoot, '.sibylla/handbook-local/')
    
    let count = 0
    for (const entry of this.builtinEntries.values()) {
      const targetPath = path.join(localPath, entry.language, entry.path)
      if (!(await this.fileManager.exists(targetPath))) {
        await this.fileManager.atomicWrite(targetPath, entry.content)
        count++
      }
    }
    
    const metadataPath = path.join(localPath, '.cloned-from-version')
    await this.fileManager.atomicWrite(metadataPath, JSON.stringify({
      version: this.getBuiltinVersion(),
      clonedAt: new Date().toISOString()
    }))
    
    await this.loadLocal()
    this.buildSearchIndex()
    
    return { clonedCount: count, localPath }
  }

  async suggestForQuery(userQuery: string): Promise<HandbookEntry[]> {
    // Heuristic: detect how-to questions
    const howToPatterns = [
      /怎么|如何|什么是|为什么|能不能|可以/,
      /how to|what is|why|can i|how can/i
    ]
    const isHowTo = howToPatterns.some(p => p.test(userQuery))
    
    if (!isHowTo) return []
    
    return this.search(userQuery, { limit: 2 })
  }

  private async loadBuiltin(): Promise<void> {
    const indexPath = path.join(this.appResourcesPath, 'handbook/index.yaml')
    if (!await this.fileManager.exists(indexPath)) {
      this.logger.error('handbook.builtin.missing')
      return
    }
    
    const index = parseYaml(await this.fileManager.readFile(indexPath)) as HandbookIndex
    
    for (const entryMeta of index.entries) {
      for (const lang of index.languages) {
        const filePath = path.join(this.appResourcesPath, 'handbook', lang, entryMeta.path)
        if (!await this.fileManager.exists(filePath)) continue
        
        const content = await this.fileManager.readFile(filePath)
        const entry: HandbookEntry = {
          id: entryMeta.id,
          path: entryMeta.path,
          title: entryMeta.title[lang] ?? entryMeta.title['en'] ?? entryMeta.id,
          tags: entryMeta.tags,
          language: lang,
          version: this.hashContent(content),
          source: 'builtin',
          content,
          keywords: entryMeta.keywords,
          updatedAt: new Date().toISOString()
        }
        this.builtinEntries.set(`${entry.id}:${lang}`, entry)
      }
    }
  }

  private async loadLocal(): Promise<void> {
    const localDir = path.join(this.workspaceRoot, '.sibylla/handbook-local/')
    if (!await this.fileManager.exists(localDir)) return
    
    // Walk local directory, parse similarly to builtin
    // Local entries override builtin in search
    // ... implementation detail ...
  }

  private buildSearchIndex(): void {
    // Index all handbook entries into LocalSearchEngine (SQLite FTS5)
    const allEntries = [
      ...this.builtinEntries.values(),
      ...this.localEntries.values()
    ]
    
    // Batch index: write entries to a temporary .md directory for FTS5 indexing
    for (const entry of allEntries) {
      this.localSearchEngine.indexDocument({
        path: `handbook/${entry.language}/${entry.path}`,
        content: `${entry.title}\n\n${entry.content}\n\n${entry.tags.join(' ')} ${entry.keywords.join(' ')}`,
        fileType: 'md'
      }).catch(() => {
        // Indexing failure should not block initialization
      })
    }
  }
}
```

AI 集成（ContextEngine 扩展）：

```typescript
// sibylla-desktop/src/main/services/context-engine.ts (扩展)

interface HarnessContextRequest {
  userMessage: string
  currentFile?: string
  manualRefs?: string[]
  skillRefs?: string[]
  mode: HarnessMode  // 'single' | 'dual' | 'panel'
  guides: Guide[]
  aiMode?: AiModeDefinition  // 新增：用户选择的 AI Mode
}

class ContextEngine {
  async assembleForHarness(request: HarnessContextRequest): Promise<AssembledContext> {
    return this.tracer.withSpan('context.assemble', async (span) => {
      const sections: ContextSection[] = []
      let systemPrompt = ''

      // NEW: AiMode system prompt prefix（作为第一段）
      if (request.aiMode) {
        const prefix = request.aiMode.systemPromptPrefix
        systemPrompt = prefix + '\n\n'
        span.setAttribute('context.ai_mode', request.aiMode.id)
      }

      // EXISTING: always-load layer (CLAUDE.md)
      // ... existing sections (memory, files, etc.) ...
      
      // NEW: Handbook integration
      const handbookEntries = await this.handbookService.suggestForQuery(
        request.userMessage
      )
      if (handbookEntries.length > 0) {
        sections.push({
          type: 'handbook',
          label: '📖 相关用户手册',
          content: handbookEntries.map(e => 
            `### ${e.title}\n\n${this.truncate(e.content, 800)}\n\n_引用时请标注：[Handbook: ${e.id}]_`
          ).join('\n\n---\n\n'),
          metadata: { entries: handbookEntries.map(e => ({ id: e.id, title: e.title })) }
        })
        
        span.setAttribute('context.handbook_entries', handbookEntries.length)
      }

      // NEW: AiMode output constraints as context section
      if (request.aiMode?.outputConstraints) {
        sections.push({
          type: 'output-constraints',
          label: '⚙️ 输出约束',
          content: this.formatOutputConstraints(request.aiMode.outputConstraints),
          metadata: { aiModeId: request.aiMode.id }
        })
      }

      return { systemPrompt, sections, totalTokens: this.estimateTokens(systemPrompt, sections) }
    })
  }
}
```

#### 优先级

P1 - 应该完成

---

### 需求 3.4.6 - 外部数据源 API 抽象层

**用户故事：** 作为系统架构师，我需要一个统一的数据源接入层，让未来接入
搜索引擎、RSS、第三方 API 时不用重写基础设施。

#### 功能描述

本 Sprint **不接入**任何具体的外部服务，只实现抽象层：

- `DataSourceProvider` 接口定义
- `DataSourceRegistry` 管理注册的 Provider
- 统一的限流、缓存、错误处理
- 与 Trace 系统集成
- 默认实现：`FileSystemProvider`（薄封装已有文件读取）、`WorkspaceSearchProvider`（封装已有搜索）

Provider 通过 manifest 注册：

```yaml
# providers/example-provider/manifest.yaml
id: example
name: Example Provider
version: 1.0.0
capabilities: [fetch, search, list]
config_schema:
  apiKey:
    type: string
    required: true
    sensitive: true
  baseUrl:
    type: string
    default: https://api.example.com
rate_limits:
  requests_per_minute: 60
  requests_per_day: 1000
```

API 调用路径：`AI or user → DataSourceRegistry.query() → RateLimiter → Cache → Provider.fetch()`

#### 验收标准

1. When DataSourceRegistry is initialized, it shall load all registered Providers (builtin + from config)
2. When a provider is called with `query()`, the system shall check rate limit first; if exceeded, throw `RateLimitError` with retry_after
3. When a provider call succeeds, the result shall be cached (default 5 min TTL, configurable per provider)
4. When a provider call fails, the system shall retry up to 2 times with exponential backoff (1s, 3s)
5. When provider is unavailable, the system shall return cached result if available with a "from cache" flag
6. When provider.fetch() is called, a Trace span `datasource.fetch` shall be created with attributes `{provider.id, operation, duration_ms, cache_hit, rate_limited}`
7. When sensitive config fields (e.g. apiKey) are loaded, they shall be retrieved via secure storage, not plain config file
8. When a provider's requests exceed daily limit, the system shall emit `datasource:rate-limit-exhausted` event and suppress further calls for 1 hour
9. When FileSystemProvider is queried, it shall enforce workspace boundary (no access outside workspace root)
10. When WorkspaceSearchProvider is queried, it shall reuse Sprint 2 search infrastructure without duplicate logic

#### 技术规格

```typescript
// sibylla-desktop/src/main/services/datasource/types.ts

export interface DataSourceQuery {
  operation: 'fetch' | 'search' | 'list'
  params: Record<string, unknown>
  timeoutMs?: number
}

export interface DataSourceResult<T = unknown> {
  data: T
  fromCache: boolean
  fetchedAt: string
  providerId: string
  truncated?: boolean
  truncationReason?: string
}

export interface DataSourceProvider {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly capabilities: Array<'fetch' | 'search' | 'list' | 'write'>
  
  initialize(config: ProviderConfig): Promise<void>
  isHealthy(): Promise<boolean>
  query(q: DataSourceQuery): Promise<DataSourceResult>
  dispose(): Promise<void>
}

export interface ProviderManifest {
  id: string
  name: string
  version: string
  capabilities: Array<'fetch' | 'search' | 'list' | 'write'>
  configSchema: Record<string, ConfigField>
  rateLimits: {
    requestsPerMinute?: number
    requestsPerDay?: number
    concurrent?: number
  }
  defaultCacheTTLSeconds: number
}
```

```typescript
// sibylla-desktop/src/main/services/datasource/data-source-registry.ts

export class DataSourceRegistry {
  private providers: Map<string, DataSourceProvider> = new Map()
  private rateLimiters: Map<string, RateLimiter> = new Map()
  private cache: LRUCache<string, DataSourceResult>
  private dailyCounts: Map<string, { count: number; resetAt: number }> = new Map()

  constructor(
    private tracer: Tracer,
    private secureStorage: SecureStorage,
    private eventBus: EventBus,
    private logger: Logger
  ) {
    this.cache = new LRUCache({ max: 500, ttl: 5 * 60 * 1000 })
  }

  async registerProvider(
    provider: DataSourceProvider, 
    manifest: ProviderManifest
  ): Promise<void> {
    if (this.providers.has(provider.id)) {
      throw new Error(`Provider already registered: ${provider.id}`)
    }
    
    const config = await this.loadProviderConfig(provider.id, manifest)
    await provider.initialize(config)
    
    this.providers.set(provider.id, provider)
    this.rateLimiters.set(provider.id, new RateLimiter(manifest.rateLimits))
    
    this.eventBus.emit('datasource:provider-registered', {
      id: provider.id,
      name: provider.name
    })
  }

  async query<T = unknown>(
    providerId: string, 
    query: DataSourceQuery
  ): Promise<DataSourceResult<T>> {
    return this.tracer.withSpan('datasource.fetch', async (span) => {
      span.setAttributes({
        'datasource.provider_id': providerId,
        'datasource.operation': query.operation
      })
      
      const provider = this.providers.get(providerId)
      if (!provider) {
        throw new Error(`Provider not found: ${providerId}`)
      }
      
      if (!provider.capabilities.includes(query.operation)) {
        throw new Error(
          `Provider ${providerId} does not support ${query.operation}`
        )
      }
      
      // Daily quota check
      const daily = this.checkDailyQuota(providerId)
      if (daily.exhausted) {
        span.setAttribute('datasource.quota_exhausted', true)
        const cached = this.getFromCache<T>(providerId, query)
        if (cached) {
          return { ...cached, fromCache: true }
        }
        throw new QuotaExhaustedError(providerId, daily.resetAt)
      }
      
      // Cache check
      const cached = this.getFromCache<T>(providerId, query)
      if (cached) {
        span.setAttribute('datasource.cache_hit', true)
        return { ...cached, fromCache: true }
      }
      
      // Rate limit check
      const limiter = this.rateLimiters.get(providerId)!
      try {
        await limiter.acquire()
      } catch (err) {
        if (err instanceof RateLimitError) {
          span.setAttribute('datasource.rate_limited', true)
          throw err
        }
        throw err
      }
      
      // Actual call with retry
      const result = await this.callWithRetry(provider, query, span)
      this.incrementDailyCount(providerId)
      this.saveToCache(providerId, query, result)
      
      return result as DataSourceResult<T>
    }, { kind: 'tool-call' })
  }

  private async callWithRetry(
    provider: DataSourceProvider,
    query: DataSourceQuery,
    parentSpan: Span
  ): Promise<DataSourceResult> {
    const maxAttempts = 2
    let lastError: Error | null = null
    
    for (let attempt = 1; attempt <= maxAttempts + 1; attempt++) {
      try {
        const start = Date.now()
        const result = await provider.query(query)
        parentSpan.setAttribute('datasource.duration_ms', Date.now() - start)
        parentSpan.setAttribute('datasource.attempt', attempt)
        return result
      } catch (err) {
        lastError = err as Error
        if (attempt > maxAttempts) break
        
        const delay = 1000 * Math.pow(3, attempt - 1)
        parentSpan.addEvent('datasource.retry', { 
          attempt, 
          error: String(err), 
          delay 
        })
        await this.sleep(delay)
      }
    }
    
    throw lastError ?? new Error('Unknown error')
  }
}
```

内置 Provider 实现：

```typescript
// sibylla-desktop/src/main/services/datasource/providers/file-system-provider.ts

export class FileSystemProvider implements DataSourceProvider {
  id = 'filesystem'
  name = 'Workspace File System'
  version = '1.0.0'
  capabilities: Array<'fetch' | 'list'> = ['fetch', 'list']

  constructor(
    private fileManager: FileManager,
    private workspaceRoot: string
  ) {}

  async initialize(): Promise<void> { }
  async isHealthy(): Promise<boolean> { return true }
  async dispose(): Promise<void> { }

  async query(q: DataSourceQuery): Promise<DataSourceResult> {
    const pathParam = q.params.path as string
    const resolvedPath = this.resolveWithinWorkspace(pathParam)
    
    if (q.operation === 'fetch') {
      const content = await this.fileManager.readFile(resolvedPath)
      return {
        data: { path: resolvedPath, content },
        fromCache: false,
        fetchedAt: new Date().toISOString(),
        providerId: this.id
      }
    }
    
    if (q.operation === 'list') {
      const entries = await this.fileManager.listDir(resolvedPath)
      return {
        data: { path: resolvedPath, entries },
        fromCache: false,
        fetchedAt: new Date().toISOString(),
        providerId: this.id
      }
    }
    
    throw new Error(`Unsupported operation: ${q.operation}`)
  }

  private resolveWithinWorkspace(p: string): string {
    const resolved = path.resolve(this.workspaceRoot, p)
    if (!resolved.startsWith(this.workspaceRoot)) {
      throw new Error('Path outside workspace boundary')
    }
    return resolved
  }
}
```

#### 优先级

P1 - 应该完成

---

### 需求 3.4.7 - 命令面板（Command Palette）

**用户故事：** 作为用户，我希望通过一个快捷键呼出命令面板，搜索并执行所有
常用操作（切换模式、打开 Wiki、切换模型、执行插件命令等）。

#### 功能描述

命令面板是 `Ctrl+K` / `Cmd+K` 呼出的搜索型操作入口，类似 VS Code / Linear 的
设计。所有可用操作通过 `CommandRegistry` 注册，面板提供：

- 模糊搜索（名称、分类、关键词、快捷键）
- 分类分组（AI 模式、文件、视图、Handbook、插件）
- 最近使用优先排序
- 执行后自动关闭

内置命令（部分）：

```
AI 模式：
  - 切换到 Plan 模式
  - 切换到 Analyze 模式
  - 切换到 Review 模式
  - 切换到 Write 模式
  - 切换到 Free 模式

对话：
  - 新建对话
  - 导出当前对话为 Markdown
  - 导出当前对话为 JSON
  - 复制当前对话为链接（本地）
  - 清空当前对话

模型：
  - 切换模型：Claude Sonnet
  - 切换模型：GPT-4
  - 切换模型：Gemini Pro
  - 打开模型配置

Plan：
  - 查看所有活动 Plan
  - 新建空白 Plan
  - 归档已完成 Plan

Handbook：
  - 浏览用户手册
  - 克隆手册到工作区
  - 搜索手册：[关键词]

Trace & 进度：
  - 打开 Trace Inspector
  - 查看任务台账
  - 查看性能面板

系统：
  - 打开设置
  - 切换语言
  - 切换主题
  - 重启应用
```

#### 验收标准

1. When user presses `Ctrl+K` (or `Cmd+K`), the system shall open command palette overlay, focused input field
2. When command palette is open, typing shall filter commands using fuzzy search on name, category, and keywords
3. When command results are displayed, they shall be grouped by category and sorted by recency + relevance
4. When user presses Enter on a command, the system shall execute it and close the palette
5. When user presses Escape, the palette shall close without executing
6. When a command has a keyboard shortcut, it shall be displayed on the right side of the row
7. When a command requires confirmation (e.g. "clear conversation"), a confirm dialog shall appear
8. When a plugin registers commands (future), they shall appear in a "Plugins" category
9. When user uses command palette 10+ times, subsequent searches shall rank recent commands higher
10. When user types `?` at start, palette shall show help/tutorial mode

#### 技术规格

```typescript
// sibylla-desktop/src/main/services/command/types.ts

export interface Command {
  id: string
  title: string
  titleI18n?: Record<string, string>
  category: string
  keywords?: string[]
  shortcut?: string
  icon?: string
  requiresConfirmation?: {
    message: string
    destructive: boolean
  }
  predicate?: () => boolean | Promise<boolean>   // whether command is applicable now
  execute: () => Promise<void> | void
}

export interface CommandExecutionRecord {
  commandId: string
  executedAt: number
}
```

```typescript
// sibylla-desktop/src/main/services/command/command-registry.ts

export class CommandRegistry {
  private commands: Map<string, Command> = new Map()
  private recentExecutions: CommandExecutionRecord[] = []
  private readonly MAX_RECENT = 50

  register(command: Command): void {
    if (this.commands.has(command.id)) {
      throw new Error(`Command already registered: ${command.id}`)
    }
    this.commands.set(command.id, command)
  }

  unregister(id: string): void {
    this.commands.delete(id)
  }

  async search(
    query: string, 
    language: string = 'en'
  ): Promise<Command[]> {
    const allCommands = Array.from(this.commands.values())
    
    const available = await this.filterByPredicate(allCommands)
    
    if (!query.trim()) {
      return this.rankByRecency(available)
    }
    
    return this.fuzzyMatch(available, query, language)
  }

  async execute(id: string): Promise<void> {
    const cmd = this.commands.get(id)
    if (!cmd) throw new Error(`Command not found: ${id}`)
    
    if (cmd.requiresConfirmation) {
      const confirmed = await this.showConfirm(cmd.requiresConfirmation)
      if (!confirmed) return
    }
    
    await cmd.execute()
    
    this.recordExecution(id)
  }

  private fuzzyMatch(
    commands: Command[], 
    query: string, 
    language: string
  ): Command[] {
    const scored = commands.map(cmd => {
      const title = cmd.titleI18n?.[language] ?? cmd.title
      let score = 0
      
      if (title.toLowerCase().startsWith(query.toLowerCase())) score += 100
      else if (title.toLowerCase().includes(query.toLowerCase())) score += 50
      
      if (cmd.keywords?.some(k => k.toLowerCase().includes(query.toLowerCase()))) {
        score += 30
      }
      
      if (cmd.category.toLowerCase().includes(query.toLowerCase())) {
        score += 10
      }
      
      const recencyIndex = this.recentExecutions.findIndex(r => r.commandId === cmd.id)
      if (recencyIndex >= 0) {
        score += Math.max(0, 20 - recencyIndex)
      }
      
      return { cmd, score }
    })
    
    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(s => s.cmd)
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 3.4.8 - 对话导出与分享

**用户故事：** 作为用户，我希望把一段对话导出为文件，方便分享给同事或归档。
导出前应该能自动脱敏敏感信息。

#### 功能描述

支持三种导出格式：

- **Markdown**：人类可读，包含元数据 header + 消息气泡格式
- **JSON**：机器可读，完整保留消息结构、Trace ID、模式标签
- **片段复制**：复制选中消息到剪贴板（Markdown 格式）

脱敏与 Sprint 3.3 的 Trace 导出共用相同规则（API key、邮箱、用户路径等自动替换）。

分享模式（本地）：
- 生成一个本地 HTML 文件，打开即可查看（无需 Sibylla）
- 自包含（CSS 内嵌），可通过邮件附件发送
- 包含"此对话由 Sibylla 生成"标注

#### 验收标准

1. When user selects "导出对话 > Markdown", the system shall show export dialog with preview and redaction options
2. When user confirms export, the system shall generate file at chosen path with sanitized content
3. When exporting to JSON, the output shall include: messages, metadata (mode per message, timestamps, model used), related plan/trace IDs
4. When user selects messages and clicks "复制为 Markdown", the selection shall be formatted and copied to clipboard
5. When "分享为 HTML" is chosen, the output shall be self-contained HTML (no external refs) and open in default browser
6. When the export contains sensitive data (detected via redaction rules), user shall see warning list before proceeding
7. When exporting includes references to files/plans, the export shall include their content (optionally, user checkbox) with same redaction
8. When user cancels the export dialog, no file shall be written

#### 技术规格

```typescript
// sibylla-desktop/src/main/services/export/conversation-exporter.ts

export interface ExportOptions {
  format: 'markdown' | 'json' | 'html'
  includeMetadata: boolean
  includeReferencedFiles: boolean
  applyRedaction: boolean
  customRedactionRules?: RedactionRule[]
  targetPath: string
}

export interface ExportPreview {
  estimatedSizeBytes: number
  messageCount: number
  detectedSensitiveFields: Array<{ path: string; rule: string }>
  referencedFiles: string[]
}

export class ConversationExporter {
  constructor(
    private conversationService: ConversationService,
    private fileManager: FileManager,
    private traceExporter: TraceExporter,  // 复用 Trace 系统的 RedactionRule
    private tracer: Tracer
  ) {}

  async preview(
    conversationId: string, 
    options: ExportOptions
  ): Promise<ExportPreview> {
    const conversation = await this.conversationService.get(conversationId)
    // 复用 TraceExporter 的 scanRedaction 方法
    const detected = options.applyRedaction 
      ? this.traceExporter.scanRedaction(
          conversation.messages.map(m => m.content).join('\n'),
          options.customRedactionRules ?? []
        )
      : []

    return {
      estimatedSizeBytes: this.estimateSize(conversation, options),
      messageCount: conversation.messages.length,
      detectedSensitiveFields: detected,
      referencedFiles: this.extractReferencedFiles(conversation)
    }
  }

  async export(conversationId: string, options: ExportOptions): Promise<void> {
    return this.tracer.withSpan('conversation.export', async (span) => {
      const conversation = await this.conversationService.get(conversationId)
      // 复用 TraceExporter 的 redact 方法进行脱敏
      const sanitized = options.applyRedaction 
        ? this.traceExporter.redactContent(
            conversation,
            options.customRedactionRules ?? []
          )
        : conversation
      
      span.setAttributes({
        'export.format': options.format,
        'export.message_count': sanitized.messages.length,
        'export.redaction_applied': options.applyRedaction
      })
      
      let content: string
      switch (options.format) {
        case 'markdown':
          content = this.renderMarkdown(sanitized, options)
          break
        case 'json':
          content = this.renderJSON(sanitized, options)
          break
        case 'html':
          content = await this.renderHTML(sanitized, options)
          break
      }
      
      await this.fileManager.atomicWrite(options.targetPath, content)
    }, { kind: 'user-action' })
  }

  private renderMarkdown(conversation: Conversation, options: ExportOptions): string {
    const header = options.includeMetadata ? `---
title: ${conversation.title}
exported_at: ${new Date().toISOString()}
message_count: ${conversation.messages.length}
sibylla_version: ${app.getVersion()}
---

# ${conversation.title}

` : ''
    
    const body = conversation.messages.map(msg => {
      const roleLabel = msg.role === 'user' ? '**You**' : `**AI** (${msg.mode ?? 'free'})`
      const timestamp = options.includeMetadata 
        ? ` _[${new Date(msg.createdAt).toLocaleString()}]_` 
        : ''
      return `## ${roleLabel}${timestamp}\n\n${msg.content}\n`
    }).join('\n---\n\n')
    
    return header + body
  }
}
```

#### 优先级

P1 - 应该完成

---

### 需求 3.4.9 - 模型切换器与快速设置

**用户故事：** 作为用户，我希望在对话中快速切换模型（比如让 Claude 分析后
让 GPT 写作），不用每次都进入设置页面。

#### 功能描述

模型切换器位于对话输入框上方或 Header 区域，显示当前使用的模型。点击可展开
下拉菜单，包含：

- 所有已配置的模型（显示 Provider 图标、模型名、状态）
- 快速切换（点击即切换，当前对话后续消息使用新模型）
- 模型状态（可用、限流中、未配置）
- "配置更多模型..." 链接到设置页

切换模型对当前对话生效，历史消息保留原模型标注。

快速设置面板（右上角齿轮图标旁）：
- 当前主题（深色/浅色）
- 当前语言
- 当前工作区路径（只读）
- Trace 开关
- 记忆系统开关
- "详细设置" 链接

#### 验收标准

1. When user clicks model switcher, dropdown shall show all configured models with availability status
2. When user selects a new model, subsequent AI responses in current conversation shall use it
3. When selected model is unavailable (missing API key, quota exhausted), the option shall be disabled with reason tooltip
4. When user sends a message, the model used shall be stored in message metadata
5. When "配置更多模型..." is clicked, settings page shall open at Models section
6. When model is rate-limited, the switcher shall show a countdown; auto-resume when quota resets
7. When quick settings panel is opened, it shall show current state without loading delay
8. When user toggles a quick setting (e.g. Trace), change shall apply immediately and persist
9. When model cost varies significantly between options, an approximate cost indicator (🟢/🟡/🔴) shall be shown

#### 技术规格

```typescript
// sibylla-desktop/src/renderer/components/header/ModelSwitcher.tsx

export function ModelSwitcher({ conversationId }: Props) {
  const [current, setCurrent] = useState<ConfiguredModel | null>(null)
  const [models, setModels] = useState<ConfiguredModel[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    loadCurrent()
    loadAvailableModels()
  }, [conversationId])

  const handleSelect = async (model: ConfiguredModel) => {
    if (!model.available) return
    
    await window.electronAPI?.ai?.chat({
      message: '',
      sessionId: conversationId,
      model: model.id,
    } as any)  // 或通过独立的 conversation.setModel IPC
    setCurrent(model)
    setOpen(false)
  }

  return (
    <div className="model-switcher">
      <button 
        className="current-model" 
        onClick={() => setOpen(!open)}
      >
        <ProviderIcon provider={current?.provider} />
        <span>{current?.displayName ?? 'No model'}</span>
        <CostIndicator tier={current?.costTier} />
        <ChevronDown />
      </button>
      
      {open && (
        <div className="model-dropdown">
          {models.map(m => (
            <ModelOption 
              key={m.id}
              model={m}
              isCurrent={m.id === current?.id}
              onClick={() => handleSelect(m)}
            />
          ))}
          <div className="dropdown-footer">
            <a onClick={() => openSettings('models')}>配置更多模型...</a>
          </div>
        </div>
      )}
    </div>
  )
}
```

#### 优先级

P1 - 应该完成

---

## 三、非功能需求

### 3.1 性能要求

- 模式切换 < 50ms（仅更新状态，不重载配置）
- 一键优化提示词端到端 < 5s（p95），超时 8s
- 命令面板打开 < 100ms，搜索响应 < 50ms
- Handbook 搜索 < 100ms（本地索引）
- Plan 生成（Plan 模式下 AI 响应）与普通 AI 响应耗时相当
- 对话导出 1000 条消息 < 2s

### 3.2 可靠性要求

- 一键优化失败不影响原输入
- 模式切换失败降级为 Free 模式
- Plan 解析失败保留原文为 draft-unparsed
- 外部数据源故障不影响本地功能
- Handbook 缺失优雅降级为空搜索结果

### 3.3 隐私与安全

- 一键优化发送的内容通过 Trace 记录，但不进入对话历史
- 对话导出默认启用脱敏
- 外部数据源的 API key 存储在系统安全存储（Keychain/Credential Manager）
- Handbook 克隆到本地不包含任何用户数据

### 3.4 可配置性

- 每种 AiMode 的 prompt 前缀用户可查看（只读）和自定义（创建衍生模式）
- 一键优化可禁用
- Handbook 默认语言可切换
- 外部数据源 Provider 可单独启用/禁用
- 命令面板快捷键可自定义
- AiMode 与 HarnessMode 的映射关系可配置（如 Plan 模式默认使用 Dual HarnessMode）

### 3.5 可观测性

- AiMode 切换、Plan 操作、优化请求、命令执行、数据源调用全部进入 Trace
- AiMode 使用频次、优化采纳率、命令热度每周聚合入记忆（用于个性化）
- `HarnessResult.modeWarnings` 作为模式后置评估的软提示记录到 Trace

---

## 四、技术约束

### 4.1 架构约束

- AI 模式系统位于 `src/main/services/mode/`（类名 `AiModeRegistry`，类型 `AiModeId`）
- Plan 管理器位于 `src/main/services/plan/`
- 提示词优化位于 `src/main/services/prompt-optimizer/`
- Handbook 位于 `src/main/services/handbook/`
- 外部数据源位于 `src/main/services/datasource/`
- 命令注册表位于 `src/main/services/command/`
- 所有新模块对 Sprint 3.1-3.3 基础设施依赖注入式使用
- `AiModeId` 与 `HarnessMode` 在类型层面严格分离，共存于 `src/shared/types.ts`

### 4.2 与现有模块的集成

| 现有模块 | 改造内容 |
|---|---|
| `shared/types.ts` | 新增 `AiModeId` 类型；`AIChatRequest` 新增 `aiModeId?: AiModeId` 字段；`HarnessResult` 新增 `modeWarnings?: ModeWarning[]` 字段 |
| `harness/orchestrator.ts` | `executeInternal()` 中读取 `request.aiModeId`，调用 `AiModeRegistry.buildSystemPromptPrefix()` 注入为 system prompt 前缀；在生成完成后调用 `AiModeRegistry.evaluateModeOutput()` 收集软提示 |
| `harness/guardrails/` | **不改动**。GuardrailRule 保持纯文件操作安全检查，不引入输出约束 |
| `harness/evaluator.ts` | **不改动**。保持现有 6 维度通用质量审查。ModeEvaluator 作为独立后置检查层 |
| `context-engine.ts` | `assembleForHarness()` 新增 `aiMode` 参数，将 `systemPromptPrefix` 作为 system prompt 的第一段 |
| `memory/memory-manager.ts` | 记录模式使用偏好（新增 `aiMode` 维度的聚合） |
| `progress/types.ts` | `TaskRecord.mode` 扩展支持 `'write'`：`mode?: 'plan' \| 'analyze' \| 'review' \| 'write' \| 'free'` |
| `progress/progress-ledger.ts` | 任务 `mode` 字段接受 `AiModeId` 值 |
| `trace/tracer.ts` | 所有新操作产生 span（span name 使用 `aiMode.*` 前缀以区分） |
| `trace/trace-exporter.ts` | 对话导出复用其 `RedactionRule` 和脱敏逻辑，不新建独立的 `Redactor` |
| `ai-gateway-client.ts` | **不改动**。PromptOptimizer 通过 `createSession().chat()` 标准接口调用 |

### 4.3 与 Sprint 3.1 的联动

AI Mode 与 Harness 系统的交互通过 Orchestrator 桥接：

```typescript
// orchestrator.ts 中新增的 AiMode 集成点（最小侵入）
class HarnessOrchestrator {
  private aiModeRegistry: AiModeRegistry | null = null

  setAiModeRegistry(registry: AiModeRegistry): void {
    this.aiModeRegistry = registry
  }

  private async executeInternal(request: AIChatRequest, rootSpan?: Span): Promise<HarnessResult> {
    // 1. 读取用户选择的 AiMode
    const aiMode = request.aiModeId && this.aiModeRegistry
      ? this.aiModeRegistry.get(request.aiModeId)
      : undefined

    // 2. 现有 ToolScope 选择（基于 IntentClassifier，不受 AiMode 影响）
    let effectiveRequest = request
    if (this.toolScopeManager) {
      const toolSelection = await this.toolScopeManager.select(request)
      effectiveRequest = { ...request, intent: toolSelection.intent === 'edit_file' ? 'modify_file' : toolSelection.intent }
    }

    // 3. 现有 HarnessMode 解析（single/dual/panel，不受 AiMode 影响）
    const harnessMode = this.resolveMode(effectiveRequest)

    // 4. Context 组装时注入 AiMode 的 systemPromptPrefix
    const baseContext = await this.contextEngine.assembleForHarness({
      ...effectiveRequest,
      mode: harnessMode,
      guides,
      aiMode,  // 新增参数
    })

    // 5. 现有 Generator → Evaluator 循环（不改动）
    let result: HarnessResult
    // ... 现有执行逻辑 ...

    // 6. 后置 ModeEvaluator（软提示，不阻塞输出）
    if (aiMode && this.aiModeRegistry) {
      const modeResult = await this.aiModeRegistry.evaluateModeOutput(
        aiMode.id, result.finalResponse.content
      )
      result = { ...result, modeWarnings: modeResult.warnings }
    }

    return result
  }
}
```

### 4.4 与 Sprint 3.2 的联动

模式使用偏好进入记忆：

```typescript
// 每周聚合
class AiModeUsagePreferenceExtractor {
  async extract(window: TimeWindow): Promise<MemoryEntry[]> {
    const usage = await this.traceStore.aggregate({
      ...window,
      spanNamePrefix: 'aiMode.'
    })
    // e.g. "该用户 80% 时间使用 Plan 模式，偏好结构化输出"
    return [this.buildPreferenceEntry(usage)]
  }
}
```

### 4.5 与 Sprint 3.3 的联动

每个用户可见动作都产生 Trace span（使用 `aiMode.*` 前缀以区分于现有 `harness.*` span）：

- `aiMode.switch`
- `plan.create` / `plan.execute` / `plan.archive`
- `prompt.optimize` / `prompt.optimize.user-action`
- `handbook.search` / `handbook.clone`
- `datasource.fetch`
- `command.execute`
- `conversation.export`

### 4.6 与 CLAUDE.md 的一致性

- **文件即真相**：Plan 是 Markdown、Handbook 是 Markdown、导出结果是 Markdown/JSON
- **用户可控**：AiMode 切换显式（用户意图）、优化建议可选、Plan 可编辑、命令有确认
- **本地优先**：所有操作不依赖云端；外部数据源可完全禁用
- **可审计**：所有操作进 Trace
- **正交设计**：AiMode（意图）与 HarnessMode（执行策略）独立，不互相干扰

### 4.7 版本兼容性

- AiMode 定义向前兼容：新增 aiMode 字段不影响旧对话
- Plan 文件格式向前兼容：新增 frontmatter 字段默认值处理
- Handbook 与应用版本松耦合：克隆版可保留旧结构
- `AIChatRequest.aiModeId` 为可选字段，未设置时行为与现有系统完全一致（向后兼容）
- `HarnessResult.modeWarnings` 为可选字段，未设置时不影响现有渲染逻辑

---

## 五、目录结构

```
sibylla-desktop/src/main/services/mode/
├── types.ts                      # AiModeId, AiModeDefinition, OutputConstraints, AiModeEvaluatorConfig
├── ai-mode-registry.ts           # AiModeRegistry class
├── mode-evaluators.ts            # ModeEvaluator interface + Analyze/Review implementations
├── builtin-modes/
│   ├── free.ts
│   ├── plan.ts
│   ├── analyze.ts
│   ├── review.ts
│   └── write.ts
└── index.ts

sibylla-desktop/src/main/services/plan/
├── types.ts
├── plan-manager.ts
├── plan-parser.ts
├── plan-renderer.ts
└── index.ts

sibylla-desktop/src/main/services/prompt-optimizer/
├── types.ts
├── prompt-optimizer.ts
├── optimizer-prompts.ts
└── index.ts

sibylla-desktop/src/main/services/handbook/
├── types.ts
├── handbook-service.ts
├── handbook-indexer.ts
└── index.ts

sibylla-desktop/src/main/services/datasource/
├── types.ts
├── data-source-registry.ts
├── rate-limiter.ts
├── providers/
│   ├── file-system-provider.ts
│   └── workspace-search-provider.ts
└── index.ts

sibylla-desktop/src/main/services/command/
├── types.ts
├── command-registry.ts
├── builtin-commands/
│   ├── mode-commands.ts
│   ├── conversation-commands.ts
│   ├── plan-commands.ts
│   ├── handbook-commands.ts
│   └── system-commands.ts
└── index.ts

sibylla-desktop/src/main/services/export/
├── types.ts
├── conversation-exporter.ts    # 复用 TraceExporter 的 RedactionRule
└── index.ts

sibylla-desktop/src/main/ipc/handlers/
├── ai-mode.ts
├── plan.ts
├── prompt-optimizer.ts
├── handbook.ts
├── datasource.ts
├── command.ts
└── export.ts

sibylla-desktop/src/renderer/components/input/
├── OptimizeButton.tsx
├── SuggestionsPopover.tsx
└── ModeIndicator.tsx

sibylla-desktop/src/renderer/components/mode/
├── AiModeSwitcher.tsx
└── AiModeInfo.tsx

sibylla-desktop/src/renderer/components/plan/
├── PlanPreviewCard.tsx
├── PlanList.tsx
└── PlanEditor.tsx

sibylla-desktop/src/renderer/components/handbook/
├── HandbookViewer.tsx
├── HandbookBrowser.tsx
└── HandbookReference.tsx

sibylla-desktop/src/renderer/components/command-palette/
├── CommandPalette.tsx
├── CommandItem.tsx
└── CommandCategory.tsx

sibylla-desktop/src/renderer/components/header/
├── ModelSwitcher.tsx
└── QuickSettings.tsx

sibylla-desktop/src/renderer/components/export/
└── ExportDialog.tsx

sibylla-desktop/resources/handbook/
├── index.yaml
├── zh/
│   ├── getting-started.md
│   ├── modes/*.md
│   ├── features/*.md
│   ├── shortcuts.md
│   ├── faq.md
│   └── troubleshooting.md
└── en/
    └── ... (mirror)

sibylla-desktop/tests/
├── mode/
├── plan/
├── prompt-optimizer/
├── handbook/
├── datasource/
├── command/
└── export/
```

---

## 六、IPC 接口清单

> 所有新 IPC 通道必须注册到 `src/shared/types.ts` 的 `IPC_CHANNELS` 常量和
> `IPCChannelMap` 类型映射中，确保编译期类型安全。
> Preload bridge 在 `src/preload/index.ts` 中暴露对应命名空间。

```typescript
// === 新增到 IPC_CHANNELS ===

// AI Mode — 正交于 HarnessMode (harness:setMode/getMode)，使用独立命名空间
AI_MODE_GET_ALL: 'aiMode:getAll'
AI_MODE_GET_ACTIVE: 'aiMode:getActive'
AI_MODE_SWITCH: 'aiMode:switch'

// Plan
PLAN_GET_ACTIVE: 'plan:getActive'
PLAN_GET: 'plan:get'
PLAN_START_EXECUTION: 'plan:startExecution'
PLAN_ARCHIVE: 'plan:archive'
PLAN_ABANDON: 'plan:abandon'
PLAN_FOLLOW_UP: 'plan:followUp'

// Prompt Optimizer
PROMPT_OPTIMIZER_OPTIMIZE: 'promptOptimizer:optimize'
PROMPT_OPTIMIZER_RECORD_ACTION: 'promptOptimizer:recordAction'

// Handbook
HANDBOOK_SEARCH: 'handbook:search'
HANDBOOK_GET_ENTRY: 'handbook:getEntry'
HANDBOOK_CLONE: 'handbook:cloneToWorkspace'
HANDBOOK_CHECK_UPDATES: 'handbook:checkUpdates'

// DataSource
DATASOURCE_LIST_PROVIDERS: 'datasource:listProviders'
DATASOURCE_QUERY: 'datasource:query'
DATASOURCE_GET_PROVIDER_STATUS: 'datasource:getProviderStatus'

// Command
COMMAND_SEARCH: 'command:search'
COMMAND_EXECUTE: 'command:execute'

// Export
EXPORT_PREVIEW: 'export:preview'
EXPORT_EXECUTE: 'export:execute'

// === 新增到 IPCChannelMap ===
// (按 IPC_CHANNELS 中的 key 注册 params 和 return 类型)

// === Push Events (Main → Renderer, webContents.send) ===
AI_MODE_CHANGED: 'aiMode:changed'               // { conversationId, from?, to }
PLAN_CREATED: 'plan:created'                     // PlanMetadata
PLAN_EXECUTION_STARTED: 'plan:execution-started' // PlanMetadata
PLAN_STEPS_COMPLETED: 'plan:steps-completed'     // { planId, completed: PlanStep[] }
PLAN_ARCHIVED: 'plan:archived'                   // PlanMetadata
DATASOURCE_RATE_LIMIT_EXHAUSTED: 'datasource:rate-limit-exhausted'
DATASOURCE_PROVIDER_REGISTERED: 'datasource:provider-registered'
```

```typescript
// === IPC 通道签名 ===

// AI Mode（独立于 harness:setMode，不复用 HarnessMode 通道）
'aiMode:getAll': () => Promise<AiModeDefinition[]>
'aiMode:getActive': (conversationId: string) => Promise<AiModeDefinition>
'aiMode:switch': (conversationId: string, aiModeId: AiModeId) => Promise<void>

// Plan
'plan:getActive': () => Promise<PlanMetadata[]>
'plan:get': (id: string) => Promise<ParsedPlan | null>
'plan:startExecution': (id: string) => Promise<void>
'plan:archive': (id: string, targetPath: string) => Promise<PlanMetadata>
'plan:abandon': (id: string) => Promise<void>
'plan:followUp': (id: string) => Promise<{ progress: number; notes: string[] }>

// Prompt Optimizer
'promptOptimizer:optimize': (req: OptimizeRequest) => Promise<OptimizeResponse>
'promptOptimizer:recordAction': (requestId: string, action: string, suggestionId?: string) => Promise<void>

// Handbook
'handbook:search': (query: string, options?: SearchOptions) => Promise<HandbookEntry[]>
'handbook:getEntry': (id: string, language?: string) => Promise<HandbookEntry | null>
'handbook:cloneToWorkspace': () => Promise<{ clonedCount: number; localPath: string }>
'handbook:checkUpdates': () => Promise<{ hasUpdates: boolean; diff?: HandbookDiff }>

// DataSource
'datasource:listProviders': () => Promise<Array<{ id: string; name: string; capabilities: string[] }>>
'datasource:query': (providerId: string, query: DataSourceQuery) => Promise<DataSourceResult>
'datasource:getProviderStatus': (id: string) => Promise<ProviderStatus>

// Command
'command:search': (query: string) => Promise<Command[]>
'command:execute': (id: string) => Promise<void>

// Export
'export:preview': (conversationId: string, options: ExportOptions) => Promise<ExportPreview>
'export:execute': (conversationId: string, options: ExportOptions) => Promise<void>

// Events (Main → Renderer push)
'aiMode:changed': (event: { conversationId: string; from?: AiModeId; to: AiModeId }) => void
'plan:created': (plan: PlanMetadata) => void
'plan:execution-started': (plan: PlanMetadata) => void
'plan:steps-completed': (event: { planId: string; completed: PlanStep[] }) => void
'plan:archived': (plan: PlanMetadata) => void
'datasource:rate-limit-exhausted': (event: { providerId: string; resetAt: number }) => void
'datasource:provider-registered': (event: { id: string; name: string }) => void
```

---

## 七、验收检查清单

### 模式系统
- [ ] 5 种内置模式注册正常
- [ ] 模式切换 UI 可用（下拉 + 快捷键）
- [ ] 模式切换写入 Trace
- [ ] 每种模式的 system prompt 模板生效
- [ ] Guardrail / Evaluator overrides 应用正确
- [ ] 历史消息保留原模式标签
- [ ] 用户自定义模式从 config 加载

### Plan 产物
- [ ] Plan 模式生成结构化 Markdown
- [ ] Plan 文件保存到 `.sibylla/plans/`
- [ ] Plan 解析提取 steps、risks、success criteria
- [ ] 解析失败降级为 draft-unparsed
- [ ] "开始执行" 按钮创建 progress ledger 任务
- [ ] 复选框变更通过 file watcher 检测
- [ ] "归档为正式文档" 移动文件 + 保留 stub
- [ ] `@plan-xxx` 引用在对话中解析

### Analyze / Review / Write 模式
- [ ] Analyze 至少 3 个分析维度
- [ ] Review 按内容长度要求问题数量
- [ ] Review 问题含严重度标记
- [ ] Write 最多 1 个反问
- [ ] 各模式的 Evaluator 运行正常

### 一键优化提示词
- [ ] ✨ 按钮在输入有内容时启用
- [ ] 优化请求 5s 内返回（p95）
- [ ] 1-3 条建议展示带差异高亮
- [ ] 应用 / 合并 / 编辑 / 忽略四种操作可用
- [ ] 优化不进入对话历史
- [ ] Trace 记录原始长度、建议数、用户动作
- [ ] 5 次后显示小贴士

### 系统 Wiki
- [ ] Handbook 从 resources 加载
- [ ] 命令面板搜索 Handbook
- [ ] 多语言回退（中文缺失回退英文）
- [ ] how-to 问题自动注入上下文
- [ ] "来自用户手册" 引用标记
- [ ] 克隆到工作区功能
- [ ] 本地优先于内置

### 外部数据源
- [ ] DataSourceRegistry 注册机制可用
- [ ] 限流器实施每分钟 / 每日配额
- [ ] 缓存层 5 分钟 TTL
- [ ] 失败重试 2 次（1s、3s）
- [ ] FileSystemProvider 强制工作区边界
- [ ] WorkspaceSearchProvider 复用现有搜索
- [ ] Secure storage 存储 API key
- [ ] 所有调用进 Trace

### 命令面板
- [ ] `Ctrl+K` 打开
- [ ] 模糊搜索多字段
- [ ] 分组 + 最近使用排序
- [ ] 内置命令 20+ 个
- [ ] 快捷键显示
- [ ] 破坏性命令确认对话框
- [ ] 10 次使用后最近命令优先

### 导出
- [ ] 三种格式（Markdown / JSON / HTML）可用
- [ ] 脱敏预览显示敏感字段
- [ ] 片段复制到剪贴板
- [ ] HTML 自包含（无外链）

### 模型切换器
- [ ] 下拉显示所有已配置模型
- [ ] 切换立即生效（仅影响后续消息）
- [ ] 不可用模型禁用 + 原因 tooltip
- [ ] 限流显示倒计时
- [ ] 成本分级指示器（🟢/🟡/🔴）

### 集成
- [ ] Sprint 3.1 Harness 按模式切换配置
- [ ] Sprint 3.2 记忆捕获模式偏好
- [ ] Sprint 3.3 Trace 记录所有新动作
- [ ] progress.md 的 mode 字段生效

---

## 八、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| 用户不知道切换模式带来的影响 | 高 | 中 | UI 气泡明显标注当前模式；Handbook 首次使用弹窗说明 |
| Plan 模式下 AI 仍闲聊 | 中 | 中 | 模式 system prompt 强约束 + Evaluator 提醒 |
| Plan 文件用户编辑与 AI 跟进冲突 | 中 | 中 | file watcher + CHANGELOG.md 记录双方变更 |
| 一键优化改变用户原意 | 中 | 高 | 总是保留原文选项 + 明确显示差异 + 用户测试反馈调优 |
| 优化服务成本飙升（频繁调用）| 中 | 中 | 缓存 + 速率限制 + 使用统计面板 |
| Handbook 与产品功能不同步 | 高 | 低 | CI 检查 + 每个功能 PR 必须更新 Handbook |
| 外部数据源抽象层未来接入具体 Provider 时不够用 | 中 | 中 | 预留 hooks 和 capability 字段 + Phase 2 开始时 review |
| 命令面板命令爆炸后难以发现 | 中 | 低 | 分类 + 最近使用 + 搜索 + 帮助模式 |
| 导出脱敏漏掉自定义敏感字段 | 中 | 高 | 预览强制确认 + 自定义规则接口 + 与 Sprint 3.3 共用规则库 |
| 模型切换中断中对话 | 低 | 低 | 仅应用于下条消息；历史消息保留原模型标签 |

---

## 九、参考资料

- [CLAUDE.md](../../../CLAUDE.md) - 项目宪法
- [sprint3-ai-mvp.md](./sprint3-ai-mvp.md) - 基础 AI
- [sprint3.1-harness-infrastructure.md](./sprint3.1-harness-infrastructure.md) - Harness
- [sprint3.2-memory-system-v2.md](./sprint3.2-memory-system-v2.md) - 记忆演化
- [sprint3.3-trace-observability.md](./sprint3.3-trace-observability.md) - Trace 系统
- [VS Code Command Palette 设计](https://code.visualstudio.com/api/extension-guides/command) - 命令面板参考
- [Linear Cmd-K](https://linear.app/changelog) - 命令面板 UX 参考

---

## 十、交付物清单

### 代码
- `services/mode/` 6+ 文件
- `services/plan/` 4 文件
- `services/prompt-optimizer/` 3 文件
- `services/handbook/` 3 文件
- `services/datasource/` 5+ 文件
- `services/command/` 6+ 文件
- `services/export/` 3 文件
- IPC handlers 7 个
- Renderer 组件 20+ 个

### 资源
- `resources/handbook/` 中英文文档 20+ 篇

### 测试
- 各模块单元测试
- 模式切换集成测试
- Plan 端到端测试
- 一键优化回归测试
- 命令面板 UX 测试
- 目标覆盖率 ≥ 80%（主进程）、≥ 70%（渲染进程）

### 文档
- Sprint 3.4 设计文档（本文）
- `mode-system-design.md` 详细设计
- `plan-system-design.md` 详细设计
- `prompt-optimization-design.md` 详细设计
- `datasource-api-spec.md` Provider 接入规范
- 更新 CLAUDE.md 中的模式、Plan 章节（从"将实现"改为"已实现"）

### 配置
- 默认配置新增模式、优化器、Handbook、数据源相关字段
- 设置面板新增"模式"、"模型"、"数据源"三个 Tab
```
