# PHASE1-TASK030: AI 模式系统与 Mode Evaluators — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task030_ai-mode-system.md](../specs/tasks/phase1/phase1-task030_ai-mode-system.md)
> 创建日期：2026-04-22
> 最后更新：2026-04-22

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK030 |
| **任务标题** | AI 模式系统与 Mode Evaluators |
| **所属阶段** | Phase 1 - AI 模式系统、Plan 产物、Wiki 与能力整合 (Sprint 3.4) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | TASK018 + TASK012 + TASK027 + TASK028 |

### 1.1 目标

构建 Sprint 3.4 的地基——AiModeRegistry 中心注册表、五种内置模式（Plan / Analyze / Review / Write / Free）、ModeEvaluator 后置质量评估器、Orchestrator 最小侵入集成、ContextEngine systemPromptPrefix 注入，以及渲染进程模式切换 UI。让用户通过显式意图切换获得更精准的 AI 行为。

### 1.2 核心设计约束

- `AiModeId`（意图模式）与 `HarnessMode`（执行策略 `'single' | 'dual' | 'panel'`）是**正交概念**，两者共存互不干扰
- AiMode 通过 `AIChatRequest.aiModeId` 字段传入，不复用 `harness:setMode` 通道
- ModeEvaluator 是**后置软提示**（warning/info），与现有 Evaluator（6 维度硬门控）解耦
- 执行流：Generator → Evaluator(硬门控,Dual/Panel) → ModeEvaluator(软提示) → 输出
- `aiModeId` 和 `modeWarnings` 均为可选字段，未设置时行为与现有系统完全一致

### 1.3 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| Mode 类型定义 | `src/main/services/mode/types.ts` | AiModeId / AiModeDefinition 等全部类型 |
| 内置模式 Prompt | `src/main/services/mode/builtin-modes/*.ts` | 5 个模式的 systemPromptPrefix |
| AiModeRegistry | `src/main/services/mode/ai-mode-registry.ts` | 中心注册表 |
| ModeEvaluator | `src/main/services/mode/mode-evaluators.ts` | Analyze / Review 评估器 |
| 统一导出 | `src/main/services/mode/index.ts` | barrel 文件 |
| IPC Handler | `src/main/ipc/handlers/ai-mode.ts` | 通道注册 |
| shared/types 扩展 | `src/shared/types.ts` | IPC 通道 + AIChatRequest / HarnessResult |
| Preload API 扩展 | `src/preload/index.ts` | aiMode 命名空间 |
| Orchestrator 集成 | `src/main/services/harness/orchestrator.ts` | 最小侵入注入 |
| ContextEngine 集成 | `src/main/services/context-engine.ts` | systemPromptPrefix 前缀 |
| AIHandler 集成 | `src/main/ipc/handlers/ai.handler.ts` | aiModeId 透传 |
| ProgressLedger 扩展 | `src/main/services/progress/types.ts` | mode 字段扩展 |
| 主进程初始化 | `src/main/index.ts` | 生命周期装配 |
| modeStore | `src/renderer/store/modeStore.ts` | Zustand 状态管理 |
| AiModeSwitcher | `src/renderer/components/mode/AiModeSwitcher.tsx` | 模式切换下拉 |
| AiModeInfo | `src/renderer/components/mode/AiModeInfo.tsx` | 模式说明卡片 |
| ModeIndicator | `src/renderer/components/input/ModeIndicator.tsx` | 输入框模式指示 |
| StudioAIPanel 集成 | `src/renderer/components/studio/StudioAIPanel.tsx` | 气泡模式标签 + warnings |
| 单元测试 | `tests/mode/*.test.ts` + `tests/renderer/mode*.test.tsx` | 全覆盖 |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；注释英文/doc 中文；结构化日志 who/what/when/result；渲染进程不得直接访问文件系统 | 全局约束 |
| `specs/design/architecture.md` | 主进程/渲染进程 IPC 隔离；Zustand 状态管理；Electron contextBridge | 架构约束 |
| `specs/design/ui-ux-design.md` | 色彩体系（主色 #6366F1）、布局结构、交互规范、按钮 6px 圆角 | UI 设计 |
| `specs/requirements/phase1/sprint3.4-mode.md` | 需求 3.4.1 AiMode 注册表 + 3.4.3 Analyze/Review/Write 模式完整技术规格 | 验收标准 |
| `specs/tasks/phase1/phase1-task030_ai-mode-system.md` | 20 步执行路径、全部验收标准、IPC 清单 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `electron-ipc-patterns` | AI Mode IPC 通道注册（3 通道 + 1 push event）；Preload API aiMode 命名空间；EventBus → webContents.send 事件推送 | `ai-mode.ts` + `preload/index.ts` + `main/index.ts` |
| `zustand-state-management` | modeStore 设计；activeModes Map 选择性更新；IPC 调用封装在 action 内；`aiMode:changed` 事件监听注册 | `modeStore.ts` 全文件 |
| `typescript-strict-mode` | AiModeId 联合类型 + `| string` 扩展；AiModeDefinition 完整类型守卫；禁止 any | `types.ts` + 全部实现 |
| `frontend-design` | AiModeSwitcher 下拉组件、AiModeInfo 卡片、ModeIndicator pill 标签的样式设计 | 渲染进程 3 个组件 |

### 2.3 前置代码依赖

| 模块 | 文件 | 复用/改造方式 |
|------|------|-------------|
| `HarnessOrchestrator` | `src/main/services/harness/orchestrator.ts` | 新增 `setAiModeRegistry()` 注入；`executeInternal()` 3 处插入点（读取 aiMode / 注入 context / 后置 evaluator） |
| `ContextEngine` | `src/main/services/context-engine.ts:29-32` | `HarnessContextRequest` 新增 `aiMode?: AiModeDefinition` 字段；`assembleForHarnessInternal()` 注入 systemPromptPrefix |
| `AIChatRequest` | `src/shared/types.ts:802-835` | 新增可选 `aiModeId?: AiModeId` 字段 |
| `HarnessResult` | `src/shared/types.ts:1614-1624` | 新增可选 `modeWarnings?: ModeWarning[]` 字段 |
| `IPC_CHANNELS` | `src/shared/types.ts:314-329` | 追加 3 个 AI_MODE 通道常量 + 1 个 push event |
| `AIHandler` | `src/main/ipc/handlers/ai.handler.ts:149-155` | 新增 `setAiModeRegistry()`；在 normalizeRequest 后注入 activeModeId |
| `Tracer` | `src/main/services/trace/tracer.ts` | `switchMode()` 内 `tracer.withSpan('aiMode.switch')` |
| `AppEventBus` | `src/main/services/event-bus.ts` | `switchMode()` 内 `eventBus.emit('aiMode:changed')` |
| `ProgressLedger` | `src/main/services/progress/types.ts:15-31` | `TaskRecord.mode` 扩展支持 `'write'` |
| `ConfigManager` | 配置读取 | `configManager.get('aiModes.custom', [])` 加载自定义模式 |
| `main/index.ts` | `src/main/index.ts:253-506` | `onWorkspaceOpened` 中创建 AiModeRegistry 并注入 |
| `preload/index.ts` | `src/preload/index.ts:111-347` | 新增 `aiMode` 命名空间到 ElectronAPI 接口 + 实现 |
| `StudioAIPanel` | `src/renderer/components/studio/StudioAIPanel.tsx` | 消息气泡新增模式标签 + modeWarnings 展示 |

### 2.4 现有代码关键发现（来自代码盘点）

| 维度 | 现状 | TASK030 改造 |
|------|------|-------------|
| `HarnessContextRequest.mode` | `context-engine.ts:29` — 已有 `mode: HarnessMode` 字段，但 `assembleForHarnessInternal()` 内**未使用** | 新增 `aiMode?: AiModeDefinition` 字段，在 system prompt 最前注入 systemPromptPrefix |
| `AIChatRequest` 无 mode 字段 | `types.ts:802-835` — mode 由 `orchestrator.resolveMode()` 内部计算 | 新增 `aiModeId?: AiModeId`，与 HarnessMode 计算逻辑正交 |
| 两个 ContextEngine 实例 | `main/index.ts:55,179` — AIHandler 内部一个，Orchestrator 一个 | 仅改造 Orchestrator 的那个（`harnessContextEngine`） |
| `TaskRecord.mode` 已有 | `progress/types.ts:19` — `'plan' \| 'analyze' \| 'review' \| 'free'` | 追加 `'write'` 值 |
| `ai.handler.ts` 无 traceId 声明 | `AIChatRequest` 接口无 `traceId`，但 `ai.handler.ts:684` 访问了它 | 不在本 TASK 范围，仅记录 |

### 2.5 IPC 通道清单（本任务新增）

| 通道常量 | 通道名 | 方向 | 签名 |
|---------|--------|------|------|
| `AI_MODE_GET_ALL` | `aiMode:getAll` | Renderer→Main | `() => AiModeDefinition[]` |
| `AI_MODE_GET_ACTIVE` | `aiMode:getActive` | Renderer→Main | `(conversationId: string) => AiModeDefinition` |
| `AI_MODE_SWITCH` | `aiMode:switch` | Renderer→Main | `(conversationId: string, aiModeId: AiModeId) => void` |
| — | `aiMode:changed` | Main→Renderer Push | `{ conversationId: string; from?: AiModeId; to: AiModeId }` |

---

## 三、现有代码盘点与差距分析

### 3.1 需要新建的文件

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/main/services/mode/types.ts` | **不存在** | AiModeId / AiModeDefinition / OutputConstraints 等全部类型 |
| `src/main/services/mode/ai-mode-registry.ts` | **不存在** | AiModeRegistry 中心注册表 |
| `src/main/services/mode/mode-evaluators.ts` | **不存在** | ModeEvaluator 接口 + Analyze / Review 实现 |
| `src/main/services/mode/builtin-modes/free.ts` | **不存在** | Free 模式 prompt |
| `src/main/services/mode/builtin-modes/plan.ts` | **不存在** | Plan 模式 prompt |
| `src/main/services/mode/builtin-modes/analyze.ts` | **不存在** | Analyze 模式 prompt |
| `src/main/services/mode/builtin-modes/review.ts` | **不存在** | Review 模式 prompt |
| `src/main/services/mode/builtin-modes/write.ts` | **不存在** | Write 模式 prompt |
| `src/main/services/mode/index.ts` | **不存在** | barrel 导出 |
| `src/main/ipc/handlers/ai-mode.ts` | **不存在** | IPC 通道注册函数 |
| `src/renderer/store/modeStore.ts` | **不存在** | Zustand 模式状态 |
| `src/renderer/components/mode/AiModeSwitcher.tsx` | **不存在** | 模式切换下拉 |
| `src/renderer/components/mode/AiModeInfo.tsx` | **不存在** | 模式说明卡片 |
| `src/renderer/components/input/ModeIndicator.tsx` | **不存在** | 输入框模式指示 |
| `tests/mode/ai-mode-registry.test.ts` | **不存在** | Registry 单元测试 |
| `tests/mode/mode-evaluators.test.ts` | **不存在** | Evaluator 单元测试 |
| `tests/mode/builtin-modes.test.ts` | **不存在** | 内置模式验证测试 |

### 3.2 需要扩展的文件

| 文件 | 改动范围 | 具体变更 |
|------|---------|---------|
| `src/shared/types.ts` | 4 处追加 | IPC_CHANNELS + IPCChannelMap + AIChatRequest.aiModeId + HarnessResult.modeWarnings |
| `src/main/services/harness/orchestrator.ts` | 3 处插入 | 新增字段 + setAiModeRegistry() + executeInternal() 内 3 个集成点 |
| `src/main/services/context-engine.ts` | 2 处扩展 | HarnessContextRequest.aiMode + assembleForHarnessInternal() 前缀注入 |
| `src/main/ipc/handlers/ai.handler.ts` | 2 处扩展 | 新增字段 + setAiModeRegistry() + aiModeId 透传 |
| `src/main/services/progress/types.ts` | 1 行修改 | TaskRecord.mode 联合类型追加 `'write'` |
| `src/main/index.ts` | 2 处追加 | onWorkspaceOpened 创建 + onWorkspaceClosed 清理 |
| `src/preload/index.ts` | 3 处追加 | 接口声明 + ALLOWED_CHANNELS + api 实现 |

### 3.3 不改动的文件（明确排除）

| 文件 | 原因 |
|------|------|
| `harness/evaluator.ts` | 保持现有 6 维度质量审查不变，ModeEvaluator 是独立后置层 |
| `harness/guardrails/` | GuardrailRule 保持文件操作安全检查，不引入输出约束 |
| `harness/mode-selector.tsx` | HarnessMode UI 保持独立，与 AiMode 切换正交 |
| `ai-gateway-client.ts` | PromptOptimizer 通过 createSession() 调用（TASK032） |

---

## 四、分步实施计划

### 阶段 A：Mode 类型定义与内置 Prompt（Step 1-2） — 预计 0.5 天

#### A1：创建 types.ts

**文件：** `sibylla-desktop/src/main/services/mode/types.ts`

**类型定义：**

```typescript
export type AiModeId = 'plan' | 'analyze' | 'review' | 'write' | 'free' | string

export interface OutputConstraints {
  requireStructuredOutput?: boolean
  maxResponseLength?: number
  toneFilter?: 'direct' | 'formal' | 'casual'
  allowNegativeFeedback?: boolean
}

export interface AiModeEvaluatorConfig {
  checkExecutability?: boolean
  requireTimeEstimates?: boolean
  requireMultiPerspective?: boolean
  suppressRecommendation?: boolean
  requireIssuesFound?: boolean
  minimizeQuestions?: boolean
}

export interface AiModeUiHints {
  bubbleStyle?: 'formal' | 'casual' | 'technical'
  responseFormatHint?: 'structured' | 'conversational' | 'concise'
}

export interface AiModeDefinition {
  id: AiModeId
  label: string
  labelI18n?: Record<string, string>
  icon: string
  color: string
  description: string
  systemPromptPrefix: string
  outputConstraints?: OutputConstraints
  modeEvaluatorConfig?: AiModeEvaluatorConfig
  produces?: Array<'plan' | 'analysis' | 'review' | 'writing' | string>
  inputPlaceholder: string
  uiHints?: AiModeUiHints
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

export interface ModeEvaluationResult {
  warnings: ModeWarning[]
}

export interface ModeWarning {
  severity: 'info' | 'warning'
  code: string
  message: string
}
```

**设计要点：**
- `AiModeId` 使用 `| string` 预留自定义模式扩展
- 与 `HarnessMode`（`'single' | 'dual' | 'panel'`）在类型层面严格分离
- `OutputConstraints` 与 `GuardrailRule` 解耦——前者控制 AI 输出格式，后者控制文件操作安全
- `AiModeEvaluatorConfig` 与现有 Evaluator 6 维度配置独立

#### A2：创建 5 个内置模式 Prompt

**文件：** `sibylla-desktop/src/main/services/mode/builtin-modes/free.ts`

```typescript
export const DEFAULT_SYSTEM_PROMPT =
  '你是 Sibylla 的 AI 助手。自由对话模式，无特殊约束。'
```

**文件：** `sibylla-desktop/src/main/services/mode/builtin-modes/plan.ts`

定义 `PLAN_MODE_PROMPT`，内容遵循需求 3.4.2 规格：
- 角色定位："你是 Sibylla 的 Plan 模式助手"
- 强制 Markdown 格式：frontmatter + 标题 + 目标 + 步骤（checkbox） + 风险 + 成功标准
- 步骤格式：`- [ ] 步骤描述（预计 Xh，负责：谁）`
- 粒度 30min-4h，保守加 20% buffer
- 总步骤 5-15 个
- 信息不足时在"前置信息请求"中列出
- 变量：`{{userGoal}}`

**文件：** `sibylla-desktop/src/main/services/mode/builtin-modes/analyze.ts`

定义 `ANALYZE_MODE_PROMPT`，内容遵循需求 3.4.3 规格：
- 角色定位："你是 Sibylla 的 Analyze 模式助手"
- 结构化多维度分析，不给主观建议
- 框架选择：维度对比 / SWOT / 利益相关方 / 时间轴 / 数据解读
- 输出：分析对象 → 分析框架 → 分析内容 → 关键发现 → 待澄清问题
- 禁用词：建议、应该、推荐、最佳实践
- 变量：`{{userInput}}`

**文件：** `sibylla-desktop/src/main/services/mode/builtin-modes/review.ts`

定义 `REVIEW_MODE_PROMPT`，内容遵循需求 3.4.3 规格：
- 角色定位："你是 Sibylla 的 Review 模式助手"
- 批评性审查，必须挑出问题
- 原则：宁可严厉不客气、具体位置、标注严重度 emoji
- 输出：总体评价 → 问题列表（含严重度+改进建议）→ 亮点 → 澄清问题
- 问题密度：约每 500 字/100 行 2 个
- 变量：`{{userInput}}`

**文件：** `sibylla-desktop/src/main/services/mode/builtin-modes/write.ts`

定义 `WRITE_MODE_PROMPT`，内容遵循需求 3.4.3 规格：
- 角色定位："你是 Sibylla 的 Write 模式助手"
- 直接产出成稿，不是讨论/大纲
- 原则：最多问 1 个关键问题、严格格式/长度/风格、推断场景
- 输出：内容主体 → 分隔线 → 修订说明
- 变量：`{{userInput}}`

---

### 阶段 B：AiModeRegistry + ModeEvaluator（Step 3-5） — 预计 0.5 天

#### B1：实现 AiModeRegistry

**文件：** `sibylla-desktop/src/main/services/mode/ai-mode-registry.ts`

**构造函数注入：**
```typescript
constructor(
  private configManager: ConfigManager,
  private tracer: Tracer,
  private eventBus: EventBus,
  private logger: Logger
)
```

**内部状态：**
- `modes: Map<AiModeId, AiModeDefinition>` — 所有已注册模式
- `activeStates: Map<string, ActiveAiModeState>` — 每个对话的当前模式（key = conversationId）

**BUILTIN_MODES 常量数组（5 项）：**

| id | label | icon | color | produces | modeEvaluatorConfig | minModelCapability |
|----|-------|------|-------|----------|---------------------|--------------------|
| free | Free | 💬 | #64748b | — | — | basic |
| plan | Plan | 🗺️ | #3b82f6 | ['plan'] | { checkExecutability, requireTimeEstimates } | advanced |
| analyze | Analyze | 📊 | #8b5cf6 | ['analysis'] | { requireMultiPerspective, suppressRecommendation } | basic |
| review | Review | 🔍 | #f59e0b | ['review'] | { requireIssuesFound } | basic |
| write | Write | ✍️ | #10b981 | ['writing'] | { minimizeQuestions } | basic |

**核心方法：**

1. `initialize()` — 注册内置模式 + 从 config 加载自定义模式（冲突时跳过 + warn）
2. `getAll()` — `Array.from(this.modes.values())`
3. `get(id)` — `this.modes.get(id)`
4. `getActiveMode(conversationId)` — 双重 fallback 到 free
5. `getActiveModeId(conversationId)` — `activeStates.get(id)?.aiModeId ?? 'free'`
6. `switchMode(conversationId, newModeId, triggeredBy)` — Tracer span + EventBus emit + activeStates 更新
7. `buildSystemPromptPrefix(aiModeId, variables)` — `{{variable}}` 替换
8. `evaluateModeOutput(aiModeId, output, context?)` — 委托 ModeEvaluator
9. `dispose()` — 清理 activeStates

**switchMode Trace 集成：**
```
tracer.withSpan('aiMode.switch', span => {
  span.setAttributes({ 'aiMode.from', 'aiMode.to', 'aiMode.triggered_by', 'conversation.id' })
  activeStates.set(...)
  eventBus.emit('aiMode:changed', { conversationId, from, to })
})
```

#### B2：实现 ModeEvaluator

**文件：** `sibylla-desktop/src/main/services/mode/mode-evaluators.ts`

**接口：**
```typescript
export interface ModeEvaluator {
  readonly modeId: AiModeId
  evaluate(output: string, context?: Record<string, unknown>): Promise<ModeEvaluationResult>
}
```

**AnalyzeModeEvaluator（modeId = 'analyze'）：**
- 维度检查：`output.match(/^##\s+|^###\s+/gm)` 计数 < 3 → warning `insufficient_dimensions`
- 禁用词检查：`['建议', '应该', '推荐', '最佳实践']` 每词出现 > 2 次 → info `recommendation_leak`

**ReviewModeEvaluator（modeId = 'review'）：**
- 问题数量：`output.match(/^\s*-\s*[🔴🟠🟡⚪]/gm)` 计数 vs `expectedMin = max(2, floor(reviewTargetLength/500)*2)`
- 严重度分布：uniqueSeverities < 2 && issueCount >= 3 → info `severity_not_layered`

**关键约束：** ModeEvaluator 返回 warnings 不阻塞输出，附加到 `HarnessResult.modeWarnings`

#### B3：创建 index.ts barrel

**文件：** `sibylla-desktop/src/main/services/mode/index.ts`

统一导出所有类型 + AiModeRegistry + ModeEvaluator / AnalyzeModeEvaluator / ReviewModeEvaluator

---

### 阶段 C：shared/types + IPC Handler + Preload（Step 6/9/10） — 预计 0.5 天

#### C1：扩展 shared/types.ts

**文件：** `sibylla-desktop/src/shared/types.ts`

**1. IPC_CHANNELS 追加（在 INSPECTOR_OPEN 之前）：**
```typescript
// AI Mode operations (TASK030)
AI_MODE_GET_ALL: 'aiMode:getAll',
AI_MODE_GET_ACTIVE: 'aiMode:getActive',
AI_MODE_SWITCH: 'aiMode:switch',

// AI Mode push events (Main → Renderer)
AI_MODE_CHANGED: 'aiMode:changed',
```

**2. IPCChannelMap 追加：**
```typescript
[IPC_CHANNELS.AI_MODE_GET_ALL]: { params: []; return: AiModeDefinition[] }
[IPC_CHANNELS.AI_MODE_GET_ACTIVE]: { params: [conversationId: string]; return: AiModeDefinition }
[IPC_CHANNELS.AI_MODE_SWITCH]: { params: [conversationId: string, aiModeId: AiModeId]; return: void }
```

**3. AIChatRequest 扩展（types.ts:802-835）：**
在现有字段后追加：
```typescript
aiModeId?: AiModeId
```

**4. HarnessResult 扩展（types.ts:1614-1624）：**
在现有字段后追加：
```typescript
modeWarnings?: ModeWarning[]
```

**5. Push Event 类型映射追加。**

**6. 类型导入：** 从 `mode/types.ts` 导入 `AiModeDefinition`, `AiModeId`, `ModeWarning` 用于 IPC 类型。

**向后兼容保证：** `aiModeId` 和 `modeWarnings` 均为可选字段，未设置时 `undefined`。

#### C2：实现 IPC Handler

**文件：** `sibylla-desktop/src/main/ipc/handlers/ai-mode.ts`

```typescript
export function registerAiModeHandlers(
  ipcMain: Electron.IpcMain,
  aiModeRegistry: AiModeRegistry,
  eventBus: EventBus,
  mainWindowGetter: () => BrowserWindow | null,
  logger: Logger
): void
```

**注册 3 个 handler：**

| 通道 | 实现 |
|------|------|
| `aiMode:getAll` | `aiModeRegistry.getAll()` |
| `aiMode:getActive` | `aiModeRegistry.getActiveMode(conversationId)` |
| `aiMode:switch` | `aiModeRegistry.switchMode(conversationId, aiModeId, 'user')` |

**Push Event 转发：**
```typescript
eventBus.on('aiMode:changed', (data) => {
  const win = mainWindowGetter()
  win?.webContents.send('aiMode:changed', data)
})
```

**错误处理：** 所有 handler 包裹 try/catch，`logger.error('aiMode.ipc.error', { channel, error })`。

#### C3：扩展 Preload API

**文件：** `sibylla-desktop/src/preload/index.ts`

**1. ElectronAPI 接口追加 aiMode 命名空间：**
```typescript
aiMode: {
  getAll: () => Promise<AiModeDefinition[]>
  getActive: (conversationId: string) => Promise<AiModeDefinition>
  switchMode: (conversationId: string, aiModeId: string) => Promise<void>
  onModeChanged: (callback: (event: { conversationId: string; from?: string; to: string }) => void) => () => void
}
```

**2. ALLOWED_CHANNELS 追加：**
```typescript
'aiMode:getAll', 'aiMode:getActive', 'aiMode:switch', 'aiMode:changed'
```

**3. api 实现追加：**
```typescript
aiMode: {
  getAll: () => safeInvoke<AiModeDefinition[]>('aiMode:getAll'),
  getActive: (conversationId: string) => safeInvoke<AiModeDefinition>('aiMode:getActive', conversationId),
  switchMode: (conversationId: string, aiModeId: string) => safeInvoke<void>('aiMode:switch', conversationId, aiModeId),
  onModeChanged: (callback) => {
    const handler = (_event: IpcRendererEvent, data: unknown) => callback(data as ...)
    ipcRenderer.on('aiMode:changed', handler)
    return () => ipcRenderer.removeListener('aiMode:changed', handler)
  }
}
```

---

### 阶段 D：Orchestrator / ContextEngine / AIHandler 集成（Step 7/8/11） — 预计 0.5 天

#### D1：Orchestrator 最小侵入集成

**文件：** `sibylla-desktop/src/main/services/harness/orchestrator.ts`

**原则：** 已有逻辑（resolveMode / toolScope / Generator→Evaluator 循环 / Guardrail）不做任何修改。

**1. 新增私有字段：**
```typescript
private aiModeRegistry: AiModeRegistry | null = null
```

**2. 新增注入方法：**
```typescript
setAiModeRegistry(registry: AiModeRegistry): void {
  this.aiModeRegistry = registry
}
```

**3. executeInternal() 内 3 个插入点：**

**插入点 1 — 读取 AiMode（在 ToolScope 选择之前，约 L96）：**
```typescript
const aiMode = request.aiModeId && this.aiModeRegistry
  ? this.aiModeRegistry.get(request.aiModeId)
  : undefined
```

**插入点 2 — Context 组装注入（约 L144-151，assembleForHarness 调用处）：**
```typescript
const baseContext = await this.contextEngine.assembleForHarness({
  userMessage: effectiveRequest.message,
  currentFile: effectiveRequest.currentFile ?? effectiveRequest.targetFile,
  manualRefs: effectiveRequest.manualRefs ?? [],
  skillRefs: effectiveRequest.skillRefs,
  mode,
  guides,
  aiMode,  // 新增参数
})
```

**插入点 3 — 后置 ModeEvaluator（在 return result 之前）：**
```typescript
if (aiMode && this.aiModeRegistry) {
  const modeResult = await this.aiModeRegistry.evaluateModeOutput(
    aiMode.id, result.finalResponse.content
  )
  result = { ...result, modeWarnings: modeResult.warnings }
}
```

#### D2：ContextEngine 集成

**文件：** `sibylla-desktop/src/main/services/context-engine.ts`

**1. HarnessContextRequest 扩展（约 L29-32）：**
```typescript
export interface HarnessContextRequest extends ContextAssemblyRequest {
  mode: HarnessMode
  guides: GuidePlaceholder[]
  aiMode?: AiModeDefinition  // 新增
}
```

**2. assembleForHarnessInternal() 内注入（约 L166-189）：**

在现有 `assembleContext()` 调用后、guides overlay 之前：
```typescript
if (request.aiMode) {
  const prefix = request.aiMode.systemPromptPrefix
  base = {
    ...base,
    systemPrompt: prefix + '\n\n' + base.systemPrompt,
    totalTokens: base.totalTokens + this.estimateTokens(prefix),
  }
}
```

**3. OutputConstraints 上下文段：**
```typescript
if (request.aiMode?.outputConstraints) {
  sections.push({
    type: 'output-constraints',
    label: '⚙️ 输出约束',
    content: this.formatOutputConstraints(request.aiMode.outputConstraints),
    metadata: { aiModeId: request.aiMode.id }
  })
}
```

**4. formatOutputConstraints 私有方法：**
将 OutputConstraints 序列化为自然语言文本（如 `requireStructuredOutput: true` → "输出必须是结构化格式"）。

#### D3：AIHandler aiModeId 透传

**文件：** `sibylla-desktop/src/main/ipc/handlers/ai.handler.ts`

**1. 新增字段 + 注入方法：**
```typescript
private aiModeRegistry: AiModeRegistry | null = null
setAiModeRegistry(registry: AiModeRegistry): void { this.aiModeRegistry = registry }
```

**2. 在 handleChat / handleStream 中构建 AIChatRequest 后：**
```typescript
if (this.aiModeRegistry && normalized.sessionId) {
  const activeModeId = this.aiModeRegistry.getActiveModeId(normalized.sessionId)
  if (activeModeId !== 'free') {
    normalized = { ...normalized, aiModeId: activeModeId }
  }
}
```

**3. 流式响应完成后附加 mode 信息：**
```typescript
messageMetadata.aiModeId = normalized.aiModeId
```

---

### 阶段 E：ProgressLedger 扩展 + 主进程初始化（Step 12/13/20） — 预计 0.3 天

#### E1：ProgressLedger mode 字段扩展

**文件：** `sibylla-desktop/src/main/services/progress/types.ts`

将 `TaskRecord.mode` 联合类型从 `'plan' | 'analyze' | 'review' | 'free'` 扩展为 `'plan' | 'analyze' | 'review' | 'write' | 'free'`。

同步更新 `src/shared/types.ts` 中 `TaskRecordShared.mode` 的类型定义。

#### E2：主进程初始化装配

**文件：** `sibylla-desktop/src/main/index.ts`

**onWorkspaceOpened 中追加（在 TASK029 初始化之后）：**

```typescript
// TASK030: AiModeRegistry
const aiModeRegistry = new AiModeRegistry(
  configManager, tracer, appEventBus, logger
)
await aiModeRegistry.initialize()

orchestrator.setAiModeRegistry(aiModeRegistry)
aiHandler.setAiModeRegistry(aiModeRegistry)

registerAiModeHandlers(ipcMain, aiModeRegistry, appEventBus, () => mainWindow, logger)
```

**初始化顺序验证：**
```
ConfigManager → Tracer → EventBus → Logger
  → AiModeRegistry.initialize()        ← 在 Tracer 之后
  → orchestrator.setAiModeRegistry()    ← 在 Orchestrator 之后
  → aiHandler.setAiModeRegistry()       ← 在 AIHandler 之后
  → registerAiModeHandlers()            ← 在 mainWindow 创建之前
```

**onWorkspaceClosed 中追加：**
```typescript
aiModeRegistry.dispose()
```

---

### 阶段 F：渲染进程 modeStore + UI 组件（Step 14-17） — 预计 1.5 天

#### F1：创建 modeStore（Zustand）

**文件：** `sibylla-desktop/src/renderer/store/modeStore.ts`

**State 接口：**
```typescript
interface ModeState {
  modes: AiModeDefinition[]
  activeModes: Map<string, AiModeDefinition>
  currentConversationId: string | null
  loading: boolean
  error: string | null
}
```

**Actions 接口：**
```typescript
interface ModeActions {
  fetchModes: () => Promise<void>
  fetchActiveMode: (conversationId: string) => Promise<void>
  switchMode: (conversationId: string, aiModeId: AiModeId) => Promise<void>
  setCurrentConversation: (conversationId: string) => void
  getActiveMode: () => AiModeDefinition | null
}
```

**实现要点：**
1. 所有 IPC 调用封装在 action 内（`window.electronAPI.aiMode.*`）
2. `fetchModes()` — 启动时调用 `getAll()`
3. `fetchActiveMode(conversationId)` — 调用 `getActive(conversationId)`，更新 `activeModes` Map
4. `switchMode(conversationId, aiModeId)` — 调用 IPC switch，UI 更新由 event 驱动
5. `setCurrentConversation(conversationId)` — set + 自动 fetchActiveMode
6. `getActiveMode()` — 从 activeModes Map 按 currentConversationId 查找
7. `aiMode:changed` 事件监听在 store 初始化时注册，根据 event.to 从 modes 数组查找完整定义
8. 使用 `devtools` 中间件

#### F2：实现 AiModeSwitcher

**文件：** `sibylla-desktop/src/renderer/components/mode/AiModeSwitcher.tsx`

**Props：**
```typescript
interface AiModeSwitcherProps {
  conversationId: string
}
```

**渲染逻辑：**
1. 触发按钮：显示当前模式 icon + label，背景色用 `activeMode.color` 淡色版
2. 下拉菜单：min-width 280px，每个模式一行（icon + label 粗体 + description 灰色小字），当前模式右侧 ✓
3. 模式项背景色用 `mode.color` 极淡色，hover 加深
4. 内置/自定义模式间分隔线
5. 键盘交互：Escape 关闭 / Enter 选择 / 上下箭头导航
6. 点击外部关闭（useEffect + document click listener）
7. Ctrl+M (macOS Cmd+M) 快捷键切换下拉

**快捷键实现（在组件 useEffect 中）：**
```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
      e.preventDefault()
      setOpen(prev => !prev)
    }
  }
  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}, [])
```

#### F3：实现 AiModeInfo

**文件：** `sibylla-desktop/src/renderer/components/mode/AiModeInfo.tsx`

**Props：**
```typescript
interface AiModeInfoProps {
  mode: AiModeDefinition
}
```

**渲染内容：**
- 头部：icon + label（带颜色背景 pill）
- 描述文本
- produces 标签列表
- requiresContext 标签列表
- outputConstraints 列表
- 样式：卡片布局 + 圆角阴影 + 顶部 accent bar（mode.color）

#### F4：实现 ModeIndicator

**文件：** `sibylla-desktop/src/renderer/components/input/ModeIndicator.tsx`

**Props：**
```typescript
interface ModeIndicatorProps {
  conversationId: string
}
```

**渲染逻辑：**
- 非 free 模式时在输入框旁显示小 pill：`{icon} {label} 模式`，背景色用 `activeMode.color` 淡色
- 点击可展开 AiModeSwitcher
- free 模式时不显示（free 是默认状态）
- modeWarnings 存在时在消息气泡底部显示：`⚠️ {warning.message}`，warning 橙色 / info 蓝色

---

### 阶段 G：StudioAIPanel 集成 + 键盘快捷键（Step 18-19） — 预计 0.5 天

#### G1：StudioAIPanel 集成

**文件：** `sibylla-desktop/src/renderer/components/studio/StudioAIPanel.tsx`

**改造点：**

1. **消息气泡模式标签（header 区域）：**
```tsx
{msg.aiModeId && msg.aiModeId !== 'free' && (
  <span className="mode-label" style={{ color: modeDef?.color }}>
    {modeDef?.icon} {modeDef?.label}
  </span>
)}
```

2. **消息气泡底部 modeWarnings：**
```tsx
{msg.modeWarnings && msg.modeWarnings.length > 0 && (
  <div className="mode-warnings">
    {msg.modeWarnings.map((w, i) => (
      <span key={i} className={`mode-warning ${w.severity}`}>
        ⚠️ {w.message}
      </span>
    ))}
  </div>
)}
```

3. **输入框 placeholder 动态更新：**
从 `useModeStore().getActiveMode()` 获取当前模式的 `inputPlaceholder`。

4. **输入框区域挂载 AiModeSwitcher：**
位置：输入框上方或发送按钮旁，与现有 UI 布局协调。

#### G2：键盘快捷键注册

已在 F2 AiModeSwitcher 组件内通过 useEffect 实现 Ctrl+M / Cmd+M 切换。

命令面板模式切换命令预留（TASK032）：
- 定义 5 个命令 ID：`mode.switch.plan`、`mode.switch.analyze` 等
- 每个命令调用 `modeStore.switchMode(conversationId, modeId)`
- 快捷键显示在命令面板行右侧

---

## 五、测试计划

### 5.1 测试文件结构

```
tests/mode/
├── ai-mode-registry.test.ts        ← AiModeRegistry 核心逻辑
├── mode-evaluators.test.ts         ← ModeEvaluator 测试
└── builtin-modes.test.ts           ← 内置模式定义验证

tests/renderer/
├── mode-store.test.ts              ← Zustand store 测试
├── ai-mode-switcher.test.tsx       ← 模式切换组件
└── mode-indicator.test.tsx         ← 模式指示器组件
```

### 5.2 ai-mode-registry.test.ts（18 用例）

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 1 | initialize with builtin modes | 启动后注册 5 个内置模式 |
| 2 | initialize with custom modes | 自定义模式从 config 正确加载 |
| 3 | custom mode conflict | 自定义 ID 冲突时跳过并 warn |
| 4 | get mode by id | 返回正确的 AiModeDefinition |
| 5 | get mode not found | 返回 undefined |
| 6 | get active mode default | 无记录时返回 free |
| 7 | get active mode fallback | ID 不存在时 fallback 到 free |
| 8 | switch mode | 切换后 getActiveMode 返回新模式 |
| 9 | switch mode trace | 切换产生 `aiMode.switch` span |
| 10 | switch mode event | 切换发射 `aiMode:changed` |
| 11 | switch mode not found | 不存在的 ID fallback 到 free |
| 12 | build system prompt prefix | 变量替换正确 |
| 13 | build system prompt no vars | 无变量时原样返回 |
| 14 | evaluate no config | 无 modeEvaluatorConfig 返回空 |
| 15 | evaluate analyze | 调用 AnalyzeModeEvaluator |
| 16 | evaluate free | free 模式返回空 warnings |
| 17 | dispose | 清理后 activeStates 为空 |
| 18 | independent from HarnessMode | 切换 AiMode 不改变 HarnessMode |

### 5.3 mode-evaluators.test.ts（11 用例）

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 1 | Analyze sufficient dimensions | 维度 ≥ 3 无 warning |
| 2 | Analyze insufficient dimensions | 维度 < 3 产生 warning |
| 3 | Analyze no forbidden words | 无禁用词无 info |
| 4 | Analyze forbidden over threshold | 禁用词 > 2 次产生 info |
| 5 | Analyze forbidden under threshold | 禁用词 ≤ 2 次无 info |
| 6 | Analyze mixed output | 维度不足 + 禁用词过多同时触发 |
| 7 | Review sufficient issues | 问题数 ≥ 期望无 warning |
| 8 | Review too few issues | 问题数 < 期望产生 warning |
| 9 | Review severity layered | 严重度 ≥ 2 层无 info |
| 10 | Review severity not layered | 问题数 ≥ 3 但严重度集中产生 info |
| 11 | Review context override | 自定义 reviewTargetLength 正确计算 |

### 5.4 builtin-modes.test.ts（8 用例）

| # | 用例名 | 验证内容 |
|---|--------|---------|
| 1 | all builtin modes defined | 5 个内置模式全部存在 |
| 2 | each mode has required fields | id/label/icon/color/description/systemPromptPrefix/inputPlaceholder/builtin |
| 3 | mode ids are unique | 所有模式 ID 不重复 |
| 4 | plan has evaluator config | checkExecutability + requireTimeEstimates |
| 5 | analyze has evaluator config | requireMultiPerspective + suppressRecommendation |
| 6 | review has evaluator config | requireIssuesFound |
| 7 | write has evaluator config | minimizeQuestions |
| 8 | free has no evaluator config | 无 modeEvaluatorConfig |

### 5.5 renderer 测试（7 用例）

| # | 用例名 | 组件 | 验证内容 |
|---|--------|------|---------|
| 1 | renders current mode | AiModeSwitcher | 显示 active mode icon + label |
| 2 | opens dropdown on click | AiModeSwitcher | 点击展开下拉 |
| 3 | lists all modes | AiModeSwitcher | 下拉含 5 个模式 |
| 4 | switches mode on select | AiModeSwitcher | 点击调用 switchMode |
| 5 | closes on escape | AiModeSwitcher | Escape 关闭下拉 |
| 6 | shows indicator non-free | ModeIndicator | 非 free 显示 pill |
| 7 | hides indicator free | ModeIndicator | free 不显示 |

---

## 六、验收标准追踪

### AiModeRegistry 核心

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 启动加载 5 内置 + 自定义模式 | B1 AiModeRegistry.initialize() | 5.2-1,2 |
| 2 | getAll() 返回所有模式 | B1 getAll() | 5.2-1 |
| 3 | get(id) 返回指定或 undefined | B1 get() | 5.2-4,5 |
| 4 | getActiveMode 无记录返回 free | B1 getActiveMode() | 5.2-6,7 |
| 5 | ID 不存在 fallback + warn | B1 getActiveMode() 双重 fallback | 5.2-7 |
| 6 | 自定义 ID 冲突跳过 + warn | B1 initialize() | 5.2-3 |

### 模式切换

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | UI 切换后发射 aiMode:changed | B1 switchMode() + C2 | 5.2-10 |
| 2 | 切换不影响 HarnessMode | D1 不改 resolveMode() | 5.2-18 |
| 3 | placeholder 更新 | F4 ModeIndicator + G1 | — |
| 4 | 历史消息保留原始 mode | G1 从 metadata 读取 | — |
| 5 | Ctrl+M 打开切换下拉 | F2 useEffect 快捷键 | 5.5-5 |

### System Prompt 注入

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | systemPromptPrefix 作为第一段 | D2 ContextEngine 注入 | — |
| 2 | {{variable}} 替换 | B1 buildSystemPromptPrefix() | 5.2-12,13 |
| 3 | context sections 追加在后 | D2 不改变现有 sections 逻辑 | — |

### ModeEvaluator 后置评估

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | Analyze 维度 < 3 warning | B2 AnalyzeModeEvaluator | 5.3-2 |
| 2 | Analyze 禁用词 > 2 info | B2 AnalyzeModeEvaluator | 5.3-4 |
| 3 | Review 问题 < 期望 warning | B2 ReviewModeEvaluator | 5.3-8 |
| 4 | Review 严重度集中 info | B2 ReviewModeEvaluator | 5.3-10 |
| 5 | warnings 附加到 modeWarnings | D1 插入点 3 | — |
| 6 | Free 不执行 ModeEvaluator | B1 evaluateModeOutput() | 5.2-16 |

### UI 组件

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 下拉显示 5 种模式 | F2 AiModeSwitcher | 5.5-3 |
| 2 | 当前模式高亮 | F2 ✓ 标记 | 5.5-1 |
| 3 | 非_free 气泡显示模式 icon+label | G1 模式标签 | 5.5-6,7 |
| 4 | 模式切换 < 50ms | B1 仅更新 Map | 架构保障 |

### Trace 集成

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 切换创建 aiMode.switch span | B1 switchMode() | 5.2-9 |
| 2 | ModeEvaluator 记录到 Trace | D1 插入点 3 | — |

### IPC 集成

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 3 通道类型安全注册 | C2 registerAiModeHandlers() | — |
| 2 | aiMode:changed push event | C2 eventBus.on | — |
| 3 | Preload 暴露 aiMode 命名空间 | C3 preload | — |

### 向后兼容

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | aiModeId 可选，未设置行为不变 | C1 可选字段 + D1 aiMode undefined 路径 | — |
| 2 | modeWarnings 可选，不影响渲染 | C1 可选字段 + G1 条件渲染 | — |

---

## 七、风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| AiModeRegistry 初始化顺序与 Tracer 冲突 | 高 | 在 main/index.ts 中确保 Tracer 先于 AiModeRegistry 创建 |
| IPC 通道类型不匹配 | 高 | 严格对照 IPCChannelMap 定义；编译期类型检查 |
| systemPromptPrefix 注入位置错误导致 context 截断 | 高 | 在 D2 中前缀注入在 guides overlay 之前，保证 guides 不被截断 |
| modeStore 事件监听内存泄漏 | 中 | 在 store 销毁时清理 onModeChanged unsubscribe |
| AiModeSwitcher 下拉与现有 HarnessMode UI 混淆 | 中 | 视觉隔离：AiMode 用模式色 pill，HarnessMode 用现有下拉 |
| ModeEvaluator 正则匹配误判 | 低 | 使用宽松模式匹配 + 阈值容错（如 > 2 次才触发） |
| 内置模式 prompt 模板过长导致 token 超支 | 中 | 各 prompt 控制在 500 token 内；plan 模式标记 `minModelCapability: 'advanced'` |

---

## 八、执行时间线

| 天 | 阶段 | 交付物 |
|----|------|--------|
| Day 1 上午 | A1-A2 | types.ts + 5 个 builtin-modes prompt 文件 |
| Day 1 下午 | B1-B3 | AiModeRegistry + ModeEvaluator + index.ts |
| Day 2 上午 | C1-C3 | shared/types 扩展 + IPC Handler + Preload API |
| Day 2 下午 | D1-D3 | Orchestrator + ContextEngine + AIHandler 集成 |
| Day 3 上午 | E1-E2 | ProgressLedger 扩展 + main/index.ts 初始化装配 |
| Day 3 下午 | F1-F2 | modeStore + AiModeSwitcher |
| Day 4 上午 | F3-F4 + G1-G2 | AiModeInfo + ModeIndicator + StudioAIPanel 集成 |
| Day 4 下午 | 测试 | 全部单元测试通过 |
| Day 5 | 集成验证 | 端到端验证 + 修复 |

---

**文档版本**: v1.0
**最后更新**: 2026-04-22
**维护者**: Sibylla 架构团队
