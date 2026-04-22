# AI 模式系统与 Mode Evaluators

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK030 |
| **任务标题** | AI 模式系统与 Mode Evaluators |
| **所属阶段** | Phase 1 - AI 模式系统、Plan 产物、Wiki 与能力整合 (Sprint 3.4) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

构建 Sprint 3.4 的地基——AI 模式注册表（AiModeRegistry）、五种内置模式（Plan / Analyze / Review / Write / Free）、模式后置质量评估器（ModeEvaluator）、Orchestrator 最小侵入集成点、ContextEngine system prompt 前缀注入，以及渲染进程的模式切换 UI。让用户通过显式意图切换获得更精准的 AI 行为，同时保持与 HarnessMode 的正交隔离。

### 背景

Sprint 3.1-3.3 已建立 Harness（Generator/Evaluator 双轨架构）、记忆系统 v2、Trace 系统三大基础设施。当前 AI 对话只有一种"通用"行为，用户每次都需要在 prompt 里反复说明意图。Sprint 3.4 引入 AiMode 概念——用户显式选择的意图信号，控制 AI 的行为人设、输出格式和后置质量提示。

**核心设计约束：**

- `AiModeId`（意图模式）与 `HarnessMode`（执行策略 `'single' | 'dual' | 'panel'`）是**正交概念**，两者共存互不干扰
- AiMode 通过 `AIChatRequest.aiModeId` 字段传入 Orchestrator，不复用 `harness:setMode` 通道
- ModeEvaluator 是**后置软提示**（warning/info），与现有 Evaluator（6 维度通用质量审查，pass/fail 硬门控）解耦
- 执行流：Generator → Evaluator(硬门控,Dual/Panel) → ModeEvaluator(软提示) → 输出

**现有代码关键约束：**

| 维度 | 现状 | TASK030 改造 |
|------|------|-------------|
| HarnessOrchestrator | `src/main/services/harness/orchestrator.ts` — executeInternal() | 新增 AiModeRegistry 注入点：读取 aiModeId、注入 systemPromptPrefix、调用 ModeEvaluator |
| ContextEngine | `src/main/services/context-engine.ts` — assembleForHarness() | 新增 aiMode 参数，systemPromptPrefix 作为 system prompt 第一段 |
| shared/types.ts | AIChatRequest 无 aiModeId 字段 | 新增 `aiModeId?: AiModeId`、`HarnessResult.modeWarnings` |
| AIHandler | `src/main/ipc/handlers/ai.handler.ts` — IPC 通道 | 传递 aiModeId 到 Orchestrator |
| progress/types.ts | TaskRecord.mode 无 'write' 值 | 扩展 mode 联合类型支持所有 AiModeId |

### 范围

**包含：**
- `services/mode/types.ts` — AiModeId / AiModeDefinition / OutputConstraints / AiModeEvaluatorConfig / ActiveAiModeState
- `services/mode/ai-mode-registry.ts` — AiModeRegistry 中心注册表
- `services/mode/mode-evaluators.ts` — ModeEvaluator 接口 + Analyze / Review 实现
- `services/mode/builtin-modes/` — 5 个内置模式定义（free / plan / analyze / review / write）
- `services/mode/index.ts` — 统一导出
- `ipc/handlers/ai-mode.ts` — IPC 通道注册
- `shared/types.ts` 扩展 — IPC 通道常量 + AIChatRequest / HarnessResult 类型扩展
- `preload/index.ts` 扩展 — aiMode 命名空间
- `renderer/components/mode/AiModeSwitcher.tsx` — 模式切换下拉
- `renderer/components/mode/AiModeInfo.tsx` — 模式说明卡片
- `renderer/components/input/ModeIndicator.tsx` — 输入框模式指示
- `renderer/store/modeStore.ts` — Zustand 模式状态管理
- Orchestrator 集成 — 最小侵入式 AiMode 注入
- ContextEngine 集成 — systemPromptPrefix 前缀注入
- 键盘快捷键 — Ctrl+M / Cmd+M 呼出模式切换
- 单元测试

**不包含：**
- Plan 模式的 PlanManager 集成（TASK031）
- 提示词优化服务（TASK032）
- 命令面板模式切换命令注册（TASK032）
- Handbook 模式文档（TASK033）

## 验收标准

### AiModeRegistry 核心

- [ ] 应用启动时 AiModeRegistry 加载 5 个内置模式 + config 中的自定义模式
- [ ] `getAll()` 返回所有已注册模式
- [ ] `get(id)` 返回指定模式或 undefined
- [ ] `getActiveMode(conversationId)` 返回对话当前模式，无记录时返回 free
- [ ] 模式 ID 不存在时 fallback 到 free 并记录 warning
- [ ] 自定义模式 ID 与内置冲突时跳过并记录 warning

### 模式切换

- [ ] 用户通过 UI 下拉切换模式后，当前对话的 AiMode 更新并发射 `aiMode:changed` 事件
- [ ] 切换不影响 HarnessMode（single/dual/panel），Orchestrator 独立 resolve HarnessMode
- [ ] 切换后 input placeholder 更新为新模式对应的 inputPlaceholder
- [ ] 历史消息保留原始 mode 属性，仅后续消息使用新模式
- [ ] 用户按 Ctrl+M（macOS Cmd+M）打开模式切换下拉

### System Prompt 注入

- [ ] 用户在特定模式下发送消息时，systemPromptPrefix 作为 system prompt 第一段注入
- [ ] systemPromptPrefix 支持 `{{variable}}` 变量替换
- [ ] ContextEngine 的现有 context sections（CLAUDE.md、memory、guides）追加在 systemPromptPrefix 之后

### ModeEvaluator 后置评估

- [ ] Analyze 模式：分析维度 < 3 时产生 warning
- [ ] Analyze 模式：禁用词（建议、应该、推荐、最佳实践）出现 > 2 次时产生 info
- [ ] Review 模式：问题数量 < 期望值（每 500 字 2 个）时产生 warning
- [ ] Review 模式：问题数 ≥ 3 但严重度集中 < 2 层时产生 info
- [ ] ModeEvaluator warnings 附加到 `HarnessResult.modeWarnings`，不阻塞输出
- [ ] Free 模式不执行 ModeEvaluator

### UI 组件

- [ ] AiModeSwitcher 下拉显示 5 种模式（icon + label + description）
- [ ] 当前模式高亮显示，模式颜色作为 UI accent
- [ ] 非 free 模式的对话气泡显示模式 icon + label 指示器
- [ ] 模式切换加载状态 < 50ms（仅更新状态，不重载配置）

### Trace 集成

- [ ] 模式切换创建 `aiMode.switch` span，attributes 含 `{from, to, triggeredBy}`
- [ ] ModeEvaluator 评估结果记录到 Trace

### IPC 集成

- [ ] `aiMode:getAll` / `aiMode:getActive` / `aiMode:switch` 通道注册且类型安全
- [ ] `aiMode:changed` push event 正确推送到渲染进程
- [ ] Preload API 暴露 aiMode 命名空间

### 向后兼容

- [ ] `AIChatRequest.aiModeId` 为可选字段，未设置时行为与现有系统完全一致
- [ ] `HarnessResult.modeWarnings` 为可选字段，未设置时不影响现有渲染逻辑

## 依赖关系

### 前置依赖

- [x] TASK018 — Generator/Evaluator 双 Agent 架构与编排器（HarnessOrchestrator 已可用）
- [x] TASK012 — 上下文引擎 v1（ContextEngine assembleForHarness() 已可用）
- [x] TASK027 — Tracer SDK 与 Trace 持久化存储（Tracer / TraceStore 已可用）
- [x] TASK028 — progress.md 任务台账（ProgressLedger 已可用）
- [x] Zustand 状态管理已选型
- [x] IPC 通道常量注册机制已建立

### 被依赖任务

- TASK031 — Plan 模式与 Plan 产物管理（依赖 AiModeRegistry + plan 模式定义）
- TASK032 — 一键优化提示词与命令面板（依赖 AiModeRegistry + mode IPC 通道）
- TASK033 — 系统 Wiki 与外部数据源抽象层（依赖 mode IPC 通道）
- TASK034 — 对话导出与模型快速切换（依赖 mode 元数据在对话中的记录）

## 参考文档

- [`specs/requirements/phase1/sprint3.4-mode.md`](../../requirements/phase1/sprint3.4-mode.md) — 需求 3.4.1 + 3.4.3
- [`specs/design/architecture.md`](../../design/architecture.md) — 进程通信架构、模块划分
- [`specs/design/ui-ux-design.md`](../../design/ui-ux-design.md) — 色彩体系、交互规范
- [`CLAUDE.md`](../../../CLAUDE.md) — 设计哲学、AI 建议/人类决策、UI/UX 红线
- `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` — IPC 类型安全设计
- `.kilocode/skills/phase1/zustand-state-management/SKILL.md` — Zustand store 设计
- `.kilocode/skills/common/frontend-design/SKILL.md` — 前端设计规范
- `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` — TypeScript 严格模式

## 技术执行路径

### 架构设计

```
AI Mode System 整体架构

src/main/services/
├── mode/                                ← AI 模式系统（新建目录）
│   ├── types.ts                         ← AiModeId / AiModeDefinition / OutputConstraints / AiModeEvaluatorConfig
│   ├── ai-mode-registry.ts              ← AiModeRegistry 中心注册表
│   ├── mode-evaluators.ts               ← ModeEvaluator 接口 + Analyze / Review 实现
│   ├── builtin-modes/                   ← 内置模式 prompt 定义
│   │   ├── free.ts                      ← Free 模式 system prompt
│   │   ├── plan.ts                      ← Plan 模式 system prompt
│   │   ├── analyze.ts                   ← Analyze 模式 system prompt
│   │   ├── review.ts                    ← Review 模式 system prompt
│   │   └── write.ts                     ← Write 模式 system prompt
│   └── index.ts                         ← 统一导出
│
├── ipc/handlers/
│   └── ai-mode.ts                       ← IPC: 模式查询/切换（新建）
│
└── (现有模块扩展)
    ├── harness/orchestrator.ts          ← AiMode 注入点（system prompt + ModeEvaluator）
    ├── services/context-engine.ts       ← systemPromptPrefix 前缀注入
    ├── ipc/handlers/ai.handler.ts       ← aiModeId 透传
    ├── progress/types.ts                ← mode 字段扩展
    └── shared/types.ts                  ← IPC 通道常量 + 类型扩展

src/renderer/
├── store/
│   └── modeStore.ts                     ← Zustand 模式状态（新建）
│
├── components/
│   ├── mode/                            ← 模式 UI 目录（新建）
│   │   ├── AiModeSwitcher.tsx           ← 模式切换下拉
│   │   └── AiModeInfo.tsx              ← 模式说明卡片
│   │
│   └── input/
│       └── ModeIndicator.tsx            ← 输入框模式指示（新建）

数据流向：

用户切换模式
  → AiModeSwitcher → modeStore.switchMode(aiModeId)
  → IPC aiMode:switch → AiModeRegistry.switchMode()
  → Tracer.withSpan('aiMode.switch') → 记录 {from, to, triggeredBy}
  → EventBus.emit('aiMode:changed')
  → 渲染进程更新 UI 状态

用户发送消息（在特定模式下）
  → AIHandler → request.aiModeId 透传
  → Orchestrator.executeInternal()
    → AiModeRegistry.get(aiModeId) 获取模式定义
    → ContextEngine.assembleForHarness({ ..., aiMode })
      → systemPromptPrefix 作为 system prompt 第一段
      → 现有 context sections 追加在后
    → Generator 生成响应
    → Evaluator(硬门控, Dual/Panel)
    → AiModeRegistry.evaluateModeOutput() → ModeEvaluator(软提示)
    → result.modeWarnings 附加到 HarnessResult
  → 响应 + modeWarnings 返回渲染进程
  → 消息气泡显示模式指示器 + meta-warning（如有）
```

### 步骤 1：定义 Mode 共享类型

**文件：** `src/main/services/mode/types.ts`

1. 定义 `AiModeId` 联合类型：
   ```typescript
   export type AiModeId = 'plan' | 'analyze' | 'review' | 'write' | 'free' | string
   ```
   - 使用 `| string` 预留自定义模式扩展空间
   - 与 `HarnessMode`（`'single' | 'dual' | 'panel'`）在类型层面严格分离

2. 定义 `OutputConstraints` 接口：
   ```typescript
   export interface OutputConstraints {
     requireStructuredOutput?: boolean
     maxResponseLength?: number
     toneFilter?: 'direct' | 'formal' | 'casual'
     allowNegativeFeedback?: boolean
   }
   ```
   - 控制模式特有的输出格式约束
   - 与 GuardrailRule（文件操作安全层）解耦——不共享接口

3. 定义 `AiModeEvaluatorConfig` 接口：
   ```typescript
   export interface AiModeEvaluatorConfig {
     checkExecutability?: boolean
     requireTimeEstimates?: boolean
     requireMultiPerspective?: boolean
     suppressRecommendation?: boolean
     requireIssuesFound?: boolean
     minimizeQuestions?: boolean
   }
   ```
   - 软提示配置，非硬门控
   - 与现有 Evaluator 的 6 维度质量审查配置独立

4. 定义 `UiHints` 接口：
   ```typescript
   export interface AiModeUiHints {
     bubbleStyle?: 'formal' | 'casual' | 'technical'
     responseFormatHint?: 'structured' | 'conversational' | 'concise'
   }
   ```

5. 定义 `AiModeDefinition` 接口：
   ```typescript
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
   ```
   - `systemPromptPrefix` 支持 `{{variable}}` 占位符
   - 作为 ContextEngine 组装 system prompt 的第一段，不需要 `{{contextInjection}}` 占位符

6. 定义 `ActiveAiModeState` 接口：
   ```typescript
   export interface ActiveAiModeState {
     conversationId: string
     aiModeId: AiModeId
     activatedAt: string
     activatedBy: 'user' | 'system' | 'auto-detect'
   }
   ```

7. 定义 `ModeEvaluationResult` 接口：
   ```typescript
   export interface ModeEvaluationResult {
     warnings: ModeWarning[]
   }
   ```

8. 定义 `ModeWarning` 接口：
   ```typescript
   export interface ModeWarning {
     severity: 'info' | 'warning'
     code: string
     message: string
   }
   ```

9. 导出所有类型

### 步骤 2：定义内置模式 Prompt 模板

**文件：** `src/main/services/mode/builtin-modes/free.ts`

1. 定义 `DEFAULT_SYSTEM_PROMPT` 常量：
   - 基础自由对话 prompt，无特殊约束
   - 内容简洁："你是 Sibylla 的 AI 助手。自由对话模式，无特殊约束。"

**文件：** `src/main/services/mode/builtin-modes/plan.ts`

1. 定义 `PLAN_MODE_PROMPT` 常量：
   - 明确角色："你是 Sibylla 的 Plan 模式助手"
   - 输出必须是严格的 Markdown 格式
   - 包含：frontmatter、标题、目标、步骤（checkbox）、风险与备案、成功标准
   - 步骤格式：`- [ ] 步骤描述（预计 Xh，负责：谁）`
   - 粒度控制：30min-4h，保守估算加 20% buffer
   - 总步骤数建议 5-15 个
   - 信息不足时在"前置信息请求"中列出
   - 支持 `{{userGoal}}` 变量

**文件：** `src/main/services/mode/builtin-modes/analyze.ts`

1. 定义 `ANALYZE_MODE_PROMPT` 常量：
   - 明确角色："你是 Sibylla 的 Analyze 模式助手"
   - 结构化多维度分析，不给主观建议
   - 分析框架选择：维度对比表 / SWOT / 利益相关方 / 时间轴 / 数据解读
   - 输出格式：分析对象 → 分析框架 → 分析内容 → 关键发现 → 待澄清问题
   - 禁用词：建议、应该、推荐、最佳实践
   - 支持 `{{userInput}}` 变量

**文件：** `src/main/services/mode/builtin-modes/review.ts`

1. 定义 `REVIEW_MODE_PROMPT` 常量：
   - 明确角色："你是 Sibylla 的 Review 模式助手"
   - 批评性审查，必须挑出问题
   - 审查原则：宁可严厉不客气、具体指出位置、标注严重度 emoji
   - 输出格式：总体评价 → 问题列表（含严重度和改进建议） → 亮点 → 澄清问题
   - 问题密度：约每 500 字/100 行 2 个问题
   - 支持 `{{userInput}}` 变量

**文件：** `src/main/services/mode/builtin-modes/write.ts`

1. 定义 `WRITE_MODE_PROMPT` 常量：
   - 明确角色："你是 Sibylla 的 Write 模式助手"
   - 直接产出成稿，不是讨论/大纲/建议
   - 原则：最多问 1 个关键问题、严格格式/长度/风格、推断场景
   - 输出格式：内容主体 → 分隔线 → 修订说明
   - 支持 `{{userInput}}` 变量

### 步骤 3：实现 AiModeRegistry 中心注册表

**文件：** `src/main/services/mode/ai-mode-registry.ts`

1. 定义 `BUILTIN_MODES` 常量数组：
   - 从 `builtin-modes/*.ts` 导入各模式的 systemPromptPrefix
   - 构建 5 个 `AiModeDefinition` 对象：

   | id | label | icon | color | produces | modeEvaluatorConfig | minModelCapability |
   |----|-------|------|-------|----------|---------------------|--------------------|
   | free | Free | 💬 | #64748b | — | — | basic |
   | plan | Plan | 🗺️ | #3b82f6 | ['plan'] | { checkExecutability: true, requireTimeEstimates: true } | advanced |
   | analyze | Analyze | 📊 | #8b5cf6 | ['analysis'] | { requireMultiPerspective: true, suppressRecommendation: true } | basic |
   | review | Review | 🔍 | #f59e0b | ['review'] | { requireIssuesFound: true } | basic |
   | write | Write | ✍️ | #10b981 | ['writing'] | { minimizeQuestions: true } | basic |

2. 构造函数注入依赖：
   - `configManager: ConfigManager` — 读取自定义模式配置
   - `tracer: Tracer` — 模式切换 Trace span
   - `eventBus: EventBus` — 发射模式变更事件
   - `logger: Logger` — 结构化日志

3. 内部状态：
   - `modes: Map<AiModeId, AiModeDefinition>` — 所有已注册模式
   - `activeStates: Map<string, ActiveAiModeState>` — 每个对话的当前模式状态（key 为 conversationId）

4. 实现 `initialize()` 方法：
   - 遍历 `BUILTIN_MODES`，逐一 `this.modes.set(mode.id, mode)`
   - 从 `configManager.get('aiModes.custom', [])` 读取自定义模式
   - 遍历自定义模式：
     - 若 `this.modes.has(mode.id)` → `logger.warn('aiMode.custom.conflict', { id })`，跳过
     - 否则 `this.modes.set(mode.id, { ...mode, builtin: false })`
   - `logger.info('aiMode.registry.initialized', { builtin: BUILTIN_MODES.length, custom: customModes.length })`

5. 实现 `getAll()` 方法：
   - `return Array.from(this.modes.values())`

6. 实现 `get(id)` 方法：
   - `return this.modes.get(id)`

7. 实现 `getActiveMode(conversationId)` 方法：
   - `const state = this.activeStates.get(conversationId)`
   - `const modeId = state?.aiModeId ?? 'free'`
   - `return this.modes.get(modeId) ?? this.modes.get('free')!`（双重 fallback）

8. 实现 `switchMode(conversationId, newModeId, triggeredBy)` 方法：
   - 若 `!this.modes.has(newModeId)` → `logger.warn('aiMode.switch.not-found', { modeId: newModeId })`，`newModeId = 'free'`
   - `const previous = this.activeStates.get(conversationId)`
   - 包裹 `this.tracer.withSpan('aiMode.switch', async (span) => { ... }, { kind: 'user-action', conversationId })`：
     - `span.setAttributes({ 'aiMode.from': previous?.aiModeId ?? 'none', 'aiMode.to': newModeId, 'aiMode.triggered_by': triggeredBy, 'conversation.id': conversationId })`
     - `this.activeStates.set(conversationId, { conversationId, aiModeId: newModeId, activatedAt: new Date().toISOString(), activatedBy: triggeredBy })`
     - `this.eventBus.emit('aiMode:changed', { conversationId, from: previous?.aiModeId, to: newModeId })`

9. 实现 `buildSystemPromptPrefix(aiModeId, variables)` 方法：
   - `const mode = this.modes.get(aiModeId) ?? this.modes.get('free')!`
   - `let prefix = mode.systemPromptPrefix`
   - 遍历 `variables`，`prefix = prefix.replaceAll('{{key}}', value)`
   - 返回替换后的 prefix

10. 实现 `evaluateModeOutput(aiModeId, output, context?)` 方法：
    - `const mode = this.modes.get(aiModeId)`
    - 若 `!mode?.modeEvaluatorConfig` → `return { warnings: [] }`
    - 调用 `this.resolveEvaluator(aiModeId)`
    - 返回 evaluator 的 evaluate 结果或 `{ warnings: [] }`

11. 实现 `resolveEvaluator(aiModeId)` 私有方法：
    - `'analyze'` → `new AnalyzeModeEvaluator()`
    - `'review'` → `new ReviewModeEvaluator()`
    - default → `null`

12. 实现 `getActiveModeId(conversationId)` 方法：
    - `return this.activeStates.get(conversationId)?.aiModeId ?? 'free'`

13. 实现 `dispose()` 方法：
    - 清理 activeStates Map

### 步骤 4：实现 ModeEvaluator 接口与具体实现

**文件：** `src/main/services/mode/mode-evaluators.ts`

1. 定义 `ModeEvaluator` 接口：
   ```typescript
   export interface ModeEvaluator {
     readonly modeId: AiModeId
     evaluate(output: string, context?: Record<string, unknown>): Promise<ModeEvaluationResult>
   }
   ```

2. 实现 `AnalyzeModeEvaluator` 类：
   - `readonly modeId = 'analyze'`
   - 实现 `async evaluate(output: string)` 方法：
     - 初始化空 `warnings: ModeWarning[]`
     - **分析维度检查**：
       - 统计 `output.match(/^##\s+|^###\s+/gm)` 匹配数作为 dimensionCount
       - 若 `dimensionCount < 3` → 推送 `{ severity: 'warning', code: 'insufficient_dimensions', message: '分析维度不足（${dimensionCount} < 3）' }`
     - **禁用词检查**：
       - 遍历禁用词列表 `['建议', '应该', '推荐', '最佳实践']`
       - 对每个词 `new RegExp(word, 'g')` 匹配 output
       - 若 `matches.length > 2` → 推送 `{ severity: 'info', code: 'recommendation_leak', message: '出现 ${matches.length} 次"${word}"，Analyze 模式应避免主观建议' }`
     - 返回 `{ warnings }`

3. 实现 `ReviewModeEvaluator` 类：
   - `readonly modeId = 'review'`
   - 实现 `async evaluate(output: string, context?: Record<string, unknown>)` 方法：
     - 初始化空 `warnings: ModeWarning[]`
     - **问题数量检查**：
       - 统计 `output.match(/^\s*-\s*[🔴🟠🟡⚪]/gm)` 匹配数作为 issueCount
       - 从 context 中取 `reviewTargetLength`（默认 500）
       - 计算 expectedMin = `Math.max(2, Math.floor(reviewTargetLength / 500) * 2)`
       - 若 `issueCount < expectedMin` → 推送 `{ severity: 'warning', code: 'too_few_issues', message: '找到 ${issueCount} 个问题，期望至少 ${expectedMin} 个' }`
     - **严重度分布检查**：
       - 统计各严重度 emoji 出现次数：🔴 critical / 🟠 major / 🟡 minor / ⚪ nit
       - 计算 uniqueSeverities = 出现次数 > 0 的种类数
       - 若 `uniqueSeverities < 2 && issueCount >= 3` → 推送 `{ severity: 'info', code: 'severity_not_layered', message: '所有问题严重度集中，建议分层' }`
     - 返回 `{ warnings }`

4. 注意事项：
   - ModeEvaluator 是**后置软提示**，返回 warnings 不阻塞输出
   - 与现有 Evaluator（硬门控）独立运行
   - 执行流：Generator → Evaluator(硬) → ModeEvaluator(软) → 输出
   - Free 模式和 Write 模式暂无 ModeEvaluator 实现（返回空 warnings）

### 步骤 5：实现统一导出

**文件：** `src/main/services/mode/index.ts`

1. 从 `types.ts` 导出所有类型：
   - `AiModeId`, `AiModeDefinition`, `OutputConstraints`, `AiModeEvaluatorConfig`, `AiModeUiHints`
   - `ActiveAiModeState`, `ModeEvaluationResult`, `ModeWarning`
2. 从 `ai-mode-registry.ts` 导出 `AiModeRegistry`
3. 从 `mode-evaluators.ts` 导出 `ModeEvaluator`, `AnalyzeModeEvaluator`, `ReviewModeEvaluator`

### 步骤 6：扩展 shared/types.ts

**文件：** `src/shared/types.ts`（扩展）

1. 在 `IPC_CHANNELS` 中追加 AI Mode 相关通道：
   ```
   AI_MODE_GET_ALL: 'aiMode:getAll'
   AI_MODE_GET_ACTIVE: 'aiMode:getActive'
   AI_MODE_SWITCH: 'aiMode:switch'
   ```

2. 在 `IPCChannelMap` 中追加类型映射：
   - `AI_MODE_GET_ALL` → `{ params: []; return: AiModeDefinition[] }`
   - `AI_MODE_GET_ACTIVE` → `{ params: [conversationId: string]; return: AiModeDefinition }`
   - `AI_MODE_SWITCH` → `{ params: [conversationId: string, aiModeId: AiModeId]; return: void }`

3. 新增 Push Event 常量（Main → Renderer）：
   ```
   AI_MODE_CHANGED: 'aiMode:changed'
   ```

4. 扩展 `AIChatRequest` 接口：
   - 新增可选字段 `aiModeId?: AiModeId`
   - 注释说明：用户显式选择的意图模式，正交于 HarnessMode

5. 扩展 `HarnessResult` 接口：
   - 新增可选字段 `modeWarnings?: ModeWarning[]`
   - 注释说明：ModeEvaluator 后置软提示，不阻塞输出

6. 新增 Push Event 类型映射：
   - `'aiMode:changed'` → `(event: { conversationId: string; from?: AiModeId; to: AiModeId }) => void`

7. 向后兼容保证：
   - `aiModeId` 为可选字段，未设置时 `undefined`，Orchestrator 行为不变
   - `modeWarnings` 为可选字段，未设置时不影响现有渲染逻辑

### 步骤 7：Orchestrator 最小侵入集成

**文件：** `src/main/services/harness/orchestrator.ts`（扩展）

1. 新增私有字段：
   ```typescript
   private aiModeRegistry: AiModeRegistry | null = null
   ```

2. 新增 `setAiModeRegistry(registry: AiModeRegistry): void` 方法：
   - `this.aiModeRegistry = registry`

3. 在 `executeInternal()` 方法中插入 AiMode 集成点（在现有 ToolScope 选择之前）：

   **3a. 读取用户选择的 AiMode**（在 executeInternal 开头）：
   ```typescript
   const aiMode = request.aiModeId && this.aiModeRegistry
     ? this.aiModeRegistry.get(request.aiModeId)
     : undefined
   ```
   - `aiModeId` 为可选字段，未设置时 aiMode 为 undefined，不影响现有逻辑

   **3b. Context 组装时注入 AiMode**（在 contextEngine.assembleForHarness 调用处）：
   ```typescript
   const baseContext = await this.contextEngine.assembleForHarness({
     ...effectiveRequest,
     mode: harnessMode,
     guides,
     aiMode,  // 新增参数
   })
   ```

   **3c. 后置 ModeEvaluator**（在现有 Evaluator 循环之后，return 之前）：
   ```typescript
   if (aiMode && this.aiModeRegistry) {
     const modeResult = await this.aiModeRegistry.evaluateModeOutput(
       aiMode.id, result.finalResponse.content
     )
     result = { ...result, modeWarnings: modeResult.warnings }
   }
   ```

4. 关键不变点（已有逻辑不做任何修改）：
   - `resolveMode()` — HarnessMode 解析逻辑不变
   - `toolScopeManager.select()` — ToolScope 选择不变
   - Generator → Evaluator 循环 — 执行流程不变
   - Guardrail 检查 — 安全检查不变

### 步骤 8：ContextEngine 集成

**文件：** `src/main/services/context-engine.ts`（扩展）

1. 扩展 `HarnessContextRequest` 接口：
   - 新增可选字段 `aiMode?: AiModeDefinition`
   - 注释说明：用户选择的 AI Mode 定义

2. 在 `assembleForHarness()` 方法中注入 systemPromptPrefix：
   - **位置**：在构建 systemPrompt 变量的最开始处
   - **逻辑**：
     ```typescript
     let systemPrompt = ''
     if (request.aiMode) {
       const prefix = request.aiMode.systemPromptPrefix
       systemPrompt = prefix + '\n\n'
       span.setAttribute('context.ai_mode', request.aiMode.id)
     }
     ```
   - systemPromptPrefix 之后追加的现有 context sections 不变（CLAUDE.md、memory、guides 等）

3. 新增 OutputConstraints 上下文段：
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

4. 新增 `formatOutputConstraints(constraints)` 私有方法：
   - 将 OutputConstraints 序列化为自然语言文本
   - 例如：`requireStructuredOutput: true` → "输出必须是结构化格式"
   - 例如：`maxResponseLength: 8000` → "输出不超过 8000 字符"
   - 例如：`toneFilter: 'direct'` → "语气要求：直接、不客气"

### 步骤 9：实现 IPC Handler

**文件：** `src/main/ipc/handlers/ai-mode.ts`（新建）

1. 导出 `registerAiModeHandlers` 函数：
   ```typescript
   export function registerAiModeHandlers(
     ipcMain: Electron.IpcMain,
     aiModeRegistry: AiModeRegistry,
     logger: Logger
   ): void
   ```

2. 注册 `AI_MODE_GET_ALL` handler：
   ```typescript
   ipcMain.handle('aiMode:getAll', async () => {
     return aiModeRegistry.getAll()
   })
   ```

3. 注册 `AI_MODE_GET_ACTIVE` handler：
   ```typescript
   ipcMain.handle('aiMode:getActive', async (_event, conversationId: string) => {
     return aiModeRegistry.getActiveMode(conversationId)
   })
   ```

4. 注册 `AI_MODE_SWITCH` handler：
   ```typescript
   ipcMain.handle('aiMode:switch', async (_event, conversationId: string, aiModeId: AiModeId) => {
     await aiModeRegistry.switchMode(conversationId, aiModeId, 'user')
   })
   ```

5. 注册 Push Event 转发（在 eventBus 监听中）：
   ```typescript
   eventBus.on('aiMode:changed', (data) => {
     webContents.send('aiMode:changed', data)
   })
   ```
   - 需要在注册时接收 BrowserWindow 或 webContents 引用
   - 在 `src/main/index.ts` 中初始化时传入

6. 错误处理：
   - 所有 handler 包裹 try/catch
   - catch 中 `logger.error('aiMode.ipc.error', { channel, error })`
   - 重新抛出以让渲染进程处理

7. 在 `src/main/index.ts` 中注册：
   ```typescript
    registerAiModeHandlers(ipcMain, aiModeRegistry, logger)
    ```

### 步骤 10：Preload API 扩展

**文件：** `src/preload/index.ts`（扩展）

1. 在 `window.sibylla` 命名空间下新增 `aiMode` 对象：
   ```typescript
   aiMode: {
     getAll: () => ipcRenderer.invoke('aiMode:getAll'),
     getActive: (conversationId: string) => ipcRenderer.invoke('aiMode:getActive', conversationId),
     switchMode: (conversationId: string, aiModeId: string) => ipcRenderer.invoke('aiMode:switch', conversationId, aiModeId),
     onModeChanged: (callback: (event: { conversationId: string; from?: string; to: string }) => void) => {
       const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data as typeof event)
       ipcRenderer.on('aiMode:changed', handler)
       return () => ipcRenderer.removeListener('aiMode:changed', handler)
     },
   }
   ```

2. 在 `contextBridge.exposeInMainWorld` 的类型声明中追加 `aiMode` 字段

### 步骤 11：AIHandler 集成（aiModeId 透传）

**文件：** `src/main/ipc/handlers/ai.handler.ts`（扩展）

1. 新增 `private aiModeRegistry: AiModeRegistry | null = null` 字段

2. 新增 `setAiModeRegistry(registry: AiModeRegistry): void` 方法

3. 在 `handleChat` / `handleStream` 方法中构建 `AIChatRequest` 时：
   - 从请求参数中提取 `aiModeId`
   - 若 `this.aiModeRegistry` 可用，获取当前对话的 active mode：
     ```typescript
     const activeModeId = request.aiModeId ?? this.aiModeRegistry?.getActiveModeId(request.sessionId) ?? undefined
     ```
   - 将 `aiModeId: activeModeId` 传入 `AIChatRequest`

4. 在流式响应完成后，将 mode 信息附加到消息元数据：
   ```typescript
   messageMetadata.aiModeId = activeModeId
   ```

5. 不修改流式传输路径的核心逻辑——仅在外围包装

### 步骤 12：ProgressLedger mode 字段扩展

**文件：** `src/main/services/progress/types.ts`（扩展）

1. 扩展 `TaskRecord.mode` 联合类型：
   ```typescript
   mode?: 'plan' | 'analyze' | 'review' | 'write' | 'free'
   ```
   - 新增 `'write'` 值（原有仅支持 plan / analyze / review / free）

**文件：** `src/main/services/progress/progress-ledger.ts`（扩展）

1. 在 `declare()` 方法中：
   - 新增可选参数 `mode?: AiModeId`
   - 创建 TaskRecord 时设置 `mode` 字段
   - 从当前对话的 active AiMode 自动填充（若未显式指定）

2. 在 `formatMode(mode)` 辅助方法中：
   - 新增 `'write'` → `'撰写'` 映射

### 步骤 13：主进程初始化与装配

**文件：** `src/main/index.ts`（扩展）

1. 在 `onWorkspaceOpened` 中创建 AiModeRegistry：
   ```typescript
   const aiModeRegistry = new AiModeRegistry(
     configManager, tracer, appEventBus, logger
   )
   await aiModeRegistry.initialize()
   ```

2. 注入到 Orchestrator：
   ```typescript
   orchestrator.setAiModeRegistry(aiModeRegistry)
   ```

3. 注入到 AIHandler：
   ```typescript
   aiHandler.setAiModeRegistry(aiModeRegistry)
   ```

4. 注册 AI Mode IPC Handler：
   ```typescript
   registerAiModeHandlers(ipcMain, aiModeRegistry, logger)
   ```

5. 注册 EventBus → Renderer 推送：
   ```typescript
   appEventBus.on('aiMode:changed', (data) => {
     mainWindow.webContents.send('aiMode:changed', data)
   })
   ```

6. 在 `onWorkspaceClosed` 中：
   - `aiModeRegistry.dispose()`

### 步骤 14：实现 modeStore（Zustand）

**文件：** `src/renderer/store/modeStore.ts`（新建）

1. 定义 `ModeState` 接口：
   ```typescript
   interface ModeState {
     modes: AiModeDefinition[]
     activeModes: Map<string, AiModeDefinition>  // conversationId → mode
     currentConversationId: string | null
     loading: boolean
     error: string | null
   }
   ```

2. 定义 `ModeActions` 接口：
   ```typescript
   interface ModeActions {
     fetchModes: () => Promise<void>
     fetchActiveMode: (conversationId: string) => Promise<void>
     switchMode: (conversationId: string, aiModeId: AiModeId) => Promise<void>
     setCurrentConversation: (conversationId: string) => void
     getActiveMode: () => AiModeDefinition | null
   }
   ```

3. 创建 `useModeStore = create<ModeState & ModeActions>()((set, get) => ({...}))`

4. 实现 `fetchModes` action：
   - `const modes = await window.sibylla.aiMode.getAll()`
   - `set({ modes })`

5. 实现 `fetchActiveMode` action：
   - `const mode = await window.sibylla.aiMode.getActive(conversationId)`
   - 更新 `activeModes` Map 中对应的 entry

6. 实现 `switchMode` action：
   - `await window.sibylla.aiMode.switchMode(conversationId, aiModeId)`
   - 注意：UI 更新由 `aiMode:changed` event 驱动，此处不直接 set

7. 实现 `setCurrentConversation` action：
   - `set({ currentConversationId: conversationId })`
   - 自动调用 `fetchActiveMode(conversationId)`

8. 实现 `getActiveMode` action：
   - 从 `activeModes` Map 中获取 `currentConversationId` 对应的 mode

9. 监听 `aiMode:changed` IPC 事件：
   - 注册 `window.sibylla.aiMode.onModeChanged(callback)`
   - callback 中：根据 `event.conversationId` 和 `event.to` 更新 `activeModes` Map
   - 从 `modes` 数组中查找 `event.to` 对应的完整 AiModeDefinition

10. 应用启动时自动调用 `fetchModes()`

### 步骤 15：实现 AiModeSwitcher UI 组件

**文件：** `src/renderer/components/mode/AiModeSwitcher.tsx`（新建）

1. Props 接口：
   ```typescript
   interface AiModeSwitcherProps {
     conversationId: string
   }
   ```

2. 使用 `useModeStore` 获取状态：
   - `const { modes, getActiveMode, switchMode } = useModeStore()`
   - `const activeMode = getActiveMode()`

3. 内部状态：
   - `open: boolean`（下拉展开状态）

4. 渲染触发按钮：
   - 显示当前模式的 icon + label
   - 按钮背景色使用 `activeMode.color` 的淡色版本
   - 点击切换 `open` 状态
   - `title` 属性显示模式 description

5. 渲染下拉菜单（`open` 时）：
   - 定位：按钮下方，左对齐
   - 宽度：至少 280px
   - 每个模式一行：
     - icon + label（粗体）+ description（灰色小字）
     - 当前模式右侧显示 ✓ 勾选标记
     - 背景色使用 `mode.color` 的极淡色（hover 时加深）
     - 点击调用 `switchMode(conversationId, mode.id)` 并关闭下拉
   - 分隔线：内置模式与自定义模式之间
   - 自定义模式区域（如有）

6. 键盘交互：
   - `Escape` 关闭下拉
   - `Enter` 选择当前高亮项
   - 上下箭头导航

7. 点击外部关闭：
   - `useEffect` 中注册 document click listener
   - 点击非 dropdown 区域时 `setOpen(false)`

### 步骤 16：实现 AiModeInfo 模式说明卡片

**文件：** `src/renderer/components/mode/AiModeInfo.tsx`（新建）

1. Props 接口：
   ```typescript
   interface AiModeInfoProps {
     mode: AiModeDefinition
   }
   ```

2. 渲染内容：
   - 头部：icon + label（带颜色背景 pill）
   - 描述文本
   - 产物类型（produces 标签列表）
   - 上下文需求（requiresContext 标签列表）
   - 输出约束（outputConstraints 列表）

3. 样式：
   - 卡片式布局，带圆角和阴影
   - 顶部 accent bar 使用 mode.color

### 步骤 17：实现 ModeIndicator 输入框模式指示

**文件：** `src/renderer/components/input/ModeIndicator.tsx`（新建）

1. Props 接口：
   ```typescript
   interface ModeIndicatorProps {
     conversationId: string
   }
   ```

2. 使用 `useModeStore` 获取当前模式：
   - `const activeMode = useModeStore(s => s.getActiveMode())`

3. 渲染逻辑：
   - 若 activeMode 且 `activeMode.id !== 'free'`：
     - 在输入框左上角（或 placeholder 区域旁）显示小 pill 标签
     - 内容：`{icon} {label} 模式`
     - 背景色使用 `activeMode.color` 的淡色版本
     - 点击可展开 AiModeSwitcher
   - 若 activeMode 为 free 或 null：
     - 不显示任何指示器（free 是默认状态，无需提示）

4. 当 activeMode 有 modeWarnings 时：
   - 在消息气泡底部显示 meta-warning 标签
   - 格式：`⚠️ {warning.message}`
   - severity='warning' 时橙色，severity='info' 时蓝色
   - 点击可展开查看完整 ModeEvaluator 反馈

### 步骤 18：StudioAIPanel 集成

**文件：** `src/renderer/components/studio/StudioAIPanel.tsx`（扩展）

1. 消息气泡新增 `aiModeId` 属性：
   - 从消息元数据中读取 `aiModeId`
   - 传递给 ModeIndicator

2. 在 AI 消息气泡下方挂载 ModeIndicator：
   ```tsx
   {msg.role === 'assistant' && msg.aiModeId && msg.aiModeId !== 'free' && (
     <ModeIndicator conversationId={conversationId} />
   )}
   ```

3. 在 AI 消息气泡 header 区域显示模式标签：
   - 格式：`{icon} {label}`
   - 字体小、灰色、在模型名旁边

4. 在消息气泡底部显示 modeWarnings（如有）：
   - 从 HarnessResult 或 AIStreamEnd 事件中提取 `modeWarnings`
   - 渲染为 meta-warning 标签列表
   - 每个 warning 独立一行

5. 输入框 placeholder 动态更新：
   - 从 `useModeStore().getActiveMode()` 获取当前模式
   - 若模式有 `inputPlaceholder`，使用它作为 placeholder
   - 否则使用默认 placeholder

6. 在输入框区域挂载 AiModeSwitcher：
   - 位置：输入框上方或发送按钮旁
   - 与现有 UI 布局协调

### 步骤 19：键盘快捷键注册

1. 在渲染进程注册 `Ctrl+M`（macOS `Cmd+M`）快捷键：
   - 打开 AiModeSwitcher 下拉
   - 若已打开则关闭

2. 实现方式：
   - 在 AiModeSwitcher 组件中通过 `useEffect` 注册 `keydown` listener
   - 检测 `event.ctrlKey && event.key === 'm'`（或 `event.metaKey` on macOS）
   - 触发 `setOpen(prev => !prev)`
   - `event.preventDefault()` 阻止浏览器默认行为

3. 在命令面板注册模式切换命令（预留给 TASK032）：
   - 定义 5 个命令 ID：`mode.switch.plan`、`mode.switch.analyze` 等
   - 每个命令调用 `modeStore.switchMode(conversationId, modeId)`
   - 快捷键显示在命令面板行右侧

### 步骤 20：主进程初始化回顾与验证

**文件：** `src/main/index.ts`（最终验证）

1. 验证 `onWorkspaceOpened` 中的初始化顺序：
   ```
   ConfigManager → Tracer → EventBus → Logger
     → AiModeRegistry.initialize()
     → ... other services ...
     → Orchestrator.setAiModeRegistry(aiModeRegistry)
     → AIHandler.setAiModeRegistry(aiModeRegistry)
     → registerAiModeHandlers(ipcMain, aiModeRegistry, logger)
     → EventBus.on('aiMode:changed', → webContents.send)
   ```

2. 验证 `onWorkspaceClosed` 中的清理：
   - `aiModeRegistry.dispose()` 在所有依赖它的服务之后执行

3. 验证启动日志输出：
   - `aiMode.registry.initialized` 包含 builtin 和 custom 模式数量

## 测试计划

### 单元测试文件结构

```
tests/mode/
├── ai-mode-registry.test.ts        ← AiModeRegistry 核心逻辑测试
├── mode-evaluators.test.ts         ← ModeEvaluator 测试
└── builtin-modes.test.ts           ← 内置模式定义验证测试

tests/renderer/
├── ai-mode-switcher.test.tsx       ← 模式切换组件测试
├── mode-indicator.test.tsx         ← 模式指示器组件测试
└── mode-store.test.ts              ← Zustand store 测试
```

### ai-mode-registry.test.ts 测试用例

1. **initialize with builtin modes** — 启动后注册 5 个内置模式
2. **initialize with custom modes** — 自定义模式从 config 正确加载
3. **custom mode conflict** — 自定义模式 ID 与内置冲突时跳过并 warn
4. **get mode by id** — 返回正确的 AiModeDefinition
5. **get mode not found** — 返回 undefined
6. **get active mode default** — 无记录时返回 free 模式
7. **get active mode fallback** — 模式 ID 不存在时 fallback 到 free
8. **switch mode** — 切换后 getActiveMode 返回新模式
9. **switch mode trace** — 切换产生 `aiMode.switch` span，attributes 正确
10. **switch mode event** — 切换发射 `aiMode:changed` 事件
11. **switch mode not found** — 不存在的模式 ID fallback 到 free
12. **build system prompt prefix** — 变量替换正确
13. **build system prompt prefix no variables** — 无变量时原样返回
14. **evaluate mode output no config** — 无 modeEvaluatorConfig 时返回空 warnings
15. **evaluate mode output analyze** — 调用 AnalyzeModeEvaluator
16. **evaluate mode output free** — free 模式返回空 warnings
17. **dispose** — 清理后 activeStates 为空
18. **independent from HarnessMode** — 切换 AiMode 不改变 HarnessMode

### mode-evaluators.test.ts 测试用例

1. **AnalyzeModeEvaluator - sufficient dimensions** — 维度 ≥ 3 无 warning
2. **AnalyzeModeEvaluator - insufficient dimensions** — 维度 < 3 产生 warning
3. **AnalyzeModeEvaluator - no forbidden words** — 无禁用词无 info
4. **AnalyzeModeEvaluator - forbidden words over threshold** — 禁用词 > 2 次产生 info
5. **AnalyzeModeEvaluator - forbidden words under threshold** — 禁用词 ≤ 2 次无 info
6. **AnalyzeModeEvaluator - mixed output** — 维度不足 + 禁用词过多同时触发
7. **ReviewModeEvaluator - sufficient issues** — 问题数 ≥ 期望无 warning
8. **ReviewModeEvaluator - too few issues** — 问题数 < 期望产生 warning
9. **ReviewModeEvaluator - severity layered** — 严重度 ≥ 2 层无 info
10. **ReviewModeEvaluator - severity not layered** — 问题数 ≥ 3 但严重度集中产生 info
11. **ReviewModeEvaluator - context override** — 自定义 reviewTargetLength 正确计算

### builtin-modes.test.ts 测试用例

1. **all builtin modes defined** — 5 个内置模式全部存在
2. **each mode has required fields** — id/label/icon/color/description/systemPromptPrefix/inputPlaceholder/builtin
3. **mode ids are unique** — 所有模式 ID 不重复
4. **plan mode has evaluator config** — checkExecutability + requireTimeEstimates
5. **analyze mode has evaluator config** — requireMultiPerspective + suppressRecommendation
6. **review mode has evaluator config** — requireIssuesFound
7. **write mode has evaluator config** — minimizeQuestions
8. **free mode has no evaluator config** — 无 modeEvaluatorConfig

### ai-mode-switcher.test.tsx 测试用例

1. **renders current mode** — 显示当前 active mode 的 icon + label
2. **opens dropdown on click** — 点击按钮展开下拉
3. **lists all modes** — 下拉中包含 5 个模式
4. **highlights active mode** — 当前模式有 ✓ 标记
5. **switches mode on select** — 点击模式项调用 switchMode
6. **closes on escape** — Escape 键关闭下拉
7. **closes on outside click** — 点击外部关闭下拉
8. **closes after selection** — 选择后自动关闭
9. **Ctrl+M toggles dropdown** — 快捷键切换下拉状态

### mode-indicator.test.tsx 测试用例

1. **shows indicator for non-free mode** — 非 free 模式显示 pill 标签
2. **hides indicator for free mode** — free 模式不显示
3. **shows mode warnings** — 有 warnings 时显示 meta-warning
4. **click opens mode switcher** — 点击打开模式切换
