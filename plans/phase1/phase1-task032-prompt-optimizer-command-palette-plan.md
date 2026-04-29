# PHASE1-TASK032: 一键优化提示词与命令面板 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task032_prompt-optimizer-command-palette.md](../specs/tasks/phase1/phase1-task032_prompt-optimizer-command-palette.md)
> 创建日期：2026-04-22
> 最后更新：2026-04-22

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK032 |
| **任务标题** | 一键优化提示词与命令面板 |
| **所属阶段** | Phase 1 - AI 模式系统、Plan 产物、Wiki 与能力整合 (Sprint 3.4) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | TASK030 + TASK027 + TASK011 + TASK031 |

### 1.1 目标

交付 Sprint 3.4 的两项 P0 用户级功能：(1) 一键优化提示词——帮用户把模糊需求转为清晰请求，降低 AI 沟通摩擦；(2) 命令面板——通过 Ctrl+K / Cmd+K 呼出的搜索型操作入口，统一所有常用操作的发现与执行路径。两者共同构成 Sprint 3.4 的"易用性支柱"。

### 1.2 核心设计约束

| 约束 | 来源 | 说明 |
|------|------|------|
| 优化是辅助 | 需求 3.4.4 设计原则 | 一键优化只提建议，绝不擅自修改用户输入；用户必须显式选择应用/合并/忽略 |
| AI 建议，人类决策 | CLAUDE.md 设计哲学 | 优化建议需用户确认后才应用到输入框 |
| 优化不污染对话 | 任务描述 | 优化请求不写入对话历史，但生成独立的 Trace span |
| 命令面板是统一入口 | 需求 3.4.7 | 所有可执行操作都注册到 CommandRegistry |
| UI 等待超 2 秒需进度反馈 | CLAUDE.md UI/UX 红线 | 优化进行中显示 loading spinner |
| TS 严格模式禁止 any | CLAUDE.md 代码规范 | 全部代码遵循 TypeScript 严格模式 |
| 性能要求 | 任务描述 | 优化端到端 < 5s (p95)、命令面板打开 < 100ms、搜索响应 < 50ms |

### 1.3 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| PromptOptimizer 类型 | `src/main/services/prompt-optimizer/types.ts` | OptimizeRequest / OptimizationSuggestion / OptimizeResponse |
| 优化器 System Prompt | `src/main/services/prompt-optimizer/optimizer-prompts.ts` | 优化器模板 + MODE_OPTIMIZATION_HINTS |
| PromptOptimizer 核心 | `src/main/services/prompt-optimizer/prompt-optimizer.ts` | 优化服务主类（缓存 + LLM 调用 + Trace） |
| 统一导出 | `src/main/services/prompt-optimizer/index.ts` | barrel 文件 |
| Command 类型 | `src/main/services/command/types.ts` | Command / CommandExecutionRecord |
| CommandRegistry | `src/main/services/command/command-registry.ts` | 中心注册表（搜索 + 执行 + recency） |
| 内置命令 | `src/main/services/command/builtin-commands/*.ts` | mode / conversation / plan / handbook / system |
| 统一导出 | `src/main/services/command/index.ts` | barrel 文件 |
| IPC Handler (优化器) | `src/main/ipc/handlers/prompt-optimizer.ts` | optimize + recordAction 通道 |
| IPC Handler (命令) | `src/main/ipc/handlers/command.ts` | search + execute 通道 |
| shared/types 扩展 | `src/shared/types.ts` | IPC 通道常量 + 类型映射 |
| Preload API 扩展 | `src/preload/index.ts` | promptOptimizer / command 命名空间 |
| OptimizeButton | `src/renderer/components/input/OptimizeButton.tsx` | ✨ 优化按钮 |
| SuggestionsPopover | `src/renderer/components/input/SuggestionsPopover.tsx` | 建议浮层 |
| CommandPalette | `src/renderer/components/command-palette/CommandPalette.tsx` | 命令面板主组件 |
| CommandItem | `src/renderer/components/command-palette/CommandItem.tsx` | 命令行项 |
| CommandCategory | `src/renderer/components/command-palette/CommandCategory.tsx` | 分类分组 |
| commandStore | `src/renderer/store/commandStore.ts` | Zustand 命令面板状态 |
| 单元测试 | `tests/prompt-optimizer/*.test.ts` + `tests/command/*.test.ts` | 核心逻辑 + UI 测试 |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；UI 等待超 2 秒需进度反馈；AI 建议/人类决策 | 全局约束 |
| `specs/design/architecture.md` | 主进程与渲染进程严格隔离，通过 IPC 通信；Zustand 状态管理 | 进程通信架构 + store 设计 |
| `specs/design/ui-ux-design.md` | 主色 #6366F1；按钮圆角 6px；危险操作二次确认；overlay 遮罩规范 | UI 组件设计 |
| `specs/requirements/phase1/sprint3.4-mode.md` | 需求 3.4.4 优化提示词 + 需求 3.4.7 命令面板；验收标准 1-13 / 1-10 | 验收标准 |
| `specs/tasks/phase1/phase1-task032_prompt-optimizer-command-palette.md` | 19 步执行路径、完整验收标准、技术规格 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `electron-ipc-patterns` | IPC 通道注册；Preload API 扩展；类型安全通道映射 | `ipc/handlers/prompt-optimizer.ts` + `ipc/handlers/command.ts` + `preload/index.ts` |
| `zustand-state-management` | commandStore 设计；selector 性能优化；IPC 封装在 action | `src/renderer/store/commandStore.ts` |
| `frontend-design` | OptimizeButton / SuggestionsPopover / CommandPalette UI 设计质量 | `src/renderer/components/input/*.tsx` + `src/renderer/components/command-palette/*.tsx` |
| `typescript-strict-mode` | 全模块类型安全；泛型设计；类型守卫 | 所有 `.ts` / `.tsx` 文件 |

### 2.3 前置代码依赖

| 模块 | 文件路径 | 复用方式 |
|------|---------|---------|
| AiModeRegistry | `src/main/services/mode/ai-mode-registry.ts` | 获取当前模式定义（label/description），优化策略按模式调整 |
| AiModeDefinition | `src/main/services/mode/types.ts` | PromptOptimizer 构建模式上下文；内置命令注册模式切换 |
| AiGatewayClient | `src/main/services/ai-gateway-client.ts` | `createSession({ role: 'optimizer' }).chat()` 调用轻量 LLM |
| AiGatewaySession | `src/main/services/ai-gateway-client.ts:226` | session role 需扩展 `'optimizer'` 类型 |
| Tracer | `src/main/services/trace/tracer.ts` | `withSpan()` 包裹优化请求和命令执行 |
| Span / SpanContext | `src/main/services/trace/types.ts` | span.setAttributes 记录优化/命令元数据 |
| AppEventBus | `src/main/services/event-bus.ts` | 内置命令通过 `eventBus.emit()` 触发 UI 操作 |
| StudioAIPanel | `src/renderer/components/studio/StudioAIPanel.tsx` | 输入框区域挂载 OptimizeButton |
| useModeStore | `src/renderer/store/modeStore.ts` | 获取当前 activeMode 传入 OptimizeButton |
| IPC_CHANNELS | `src/shared/types.ts` | 追加优化器和命令面板通道常量 |
| Preload API | `src/preload/index.ts` | 追加 promptOptimizer / command 命名空间 |
| AiModeShared 类型 | `src/shared/types.ts` (TASK030 已添加) | 优化请求的 `currentMode: AiModeId` 引用 |
| PlanManager | `src/main/services/plan/plan-manager.ts` (TASK031) | 命令面板注册 Plan 相关命令 |

### 2.4 新增 IPC 通道清单

| 通道常量 | 通道名 | 方向 | 用途 |
|---------|--------|------|------|
| `PROMPT_OPTIMIZER_OPTIMIZE` | `promptOptimizer:optimize` | Renderer→Main | 触发提示词优化 |
| `PROMPT_OPTIMIZER_RECORD_ACTION` | `promptOptimizer:recordAction` | Renderer→Main | 记录用户操作（applied/merged/ignored） |
| `COMMAND_SEARCH` | `command:search` | Renderer→Main | 模糊搜索命令 |
| `COMMAND_EXECUTE` | `command:execute` | Renderer→Main | 执行指定命令 |

**无 Push Event**：本任务不涉及主进程→渲染进程的推送事件。命令执行结果通过 eventBus 在主进程内部处理，UI 更新由各子系统的 Push Event 驱动（如 `aiMode:changed`、`plan:created` 等）。

---

## 三、现有代码盘点与差距分析

### 3.1 主进程模块现状

| 模块 | 现状 | TASK032 改造 |
|------|------|-------------|
| `services/prompt-optimizer/` | **目录不存在**，需全新创建 | 新建 types.ts / optimizer-prompts.ts / prompt-optimizer.ts / index.ts |
| `services/command/` | **目录不存在**，需全新创建 | 新建 types.ts / command-registry.ts / builtin-commands/*.ts / index.ts |
| `ipc/handlers/prompt-optimizer.ts` | **不存在**，需新建 | 注册 optimize + recordAction 两个 handler |
| `ipc/handlers/command.ts` | **不存在**，需新建 | 注册 search + execute 两个 handler |
| `services/ai-gateway-client.ts` | 已有 `AiGatewaySession`，role 类型为联合类型 `AiGatewaySessionRole` | 扩展 role 联合类型追加 `'optimizer'` |
| `services/mode/ai-mode-registry.ts` | TASK030 已实现 5 种内置模式，`get(id)` 返回 `AiModeDefinition` | PromptOptimizer 只读调用 `get()`，不改动 |
| `services/trace/tracer.ts` | TASK027 已实现 `withSpan()` / `startSpan()` | 仅调用，不改动 |
| `shared/types.ts` | ~100+ IPC 通道，已有 AI_MODE / PLAN 块 | 追加 4 个新通道 + 类型映射 |
| `preload/index.ts` | 17+ 命名空间（含 aiMode / plan） | 追加 promptOptimizer + command 命名空间 |

### 3.2 渲染进程模块现状

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/renderer/store/commandStore.ts` | **不存在**，需新建 | Zustand store，管理命令面板开关、搜索、选中 |
| `src/renderer/components/input/OptimizeButton.tsx` | **不存在**，需新建 | 优化按钮 + loading 状态 + 小贴士 |
| `src/renderer/components/input/SuggestionsPopover.tsx` | **不存在**，需新建 | 建议浮层 + 操作按钮 + 内联编辑器 |
| `src/renderer/components/command-palette/` | **目录不存在**，需创建 | CommandPalette / CommandItem / CommandCategory |
| `src/renderer/components/studio/StudioAIPanel.tsx` | **已存在**，452 行 | 扩展：在输入按钮区挂载 OptimizeButton |
| `src/renderer/App.tsx` | **已存在** | 扩展：挂载全局 CommandPalette overlay |
| `src/renderer/store/modeStore.ts` | **已存在** (TASK030) | 只读引用：获取 activeMode 传入 OptimizeButton |
| `tests/prompt-optimizer/` | **目录不存在**，需创建 | 优化器核心逻辑测试 |
| `tests/command/` | **目录不存在**，需创建 | CommandRegistry + 内置命令测试 |

### 3.3 关键接口衔接点

**PromptOptimizer → AiGatewayClient**：
- `createSession({ role: 'optimizer' })` 创建独立会话（不污染对话历史）
- `session.chat({ model, messages, temperature: 0.3, maxTokens: 1200 })` 轻量请求
- 调用完成后 `session.close()` 释放资源
- 需要在 `AiGatewaySessionRole` 联合类型中追加 `'optimizer'`

**PromptOptimizer → AiModeRegistry**：
- `modeRegistry.get(request.currentMode)` 获取模式定义
- 构建 modeContext 字符串注入 system prompt
- 只读调用，不触发模式切换

**PromptOptimizer → Tracer**：
- `tracer.withSpan('prompt.optimize', ..., { kind: 'ai-call' })` 包裹整个优化流程
- `tracer.withSpan('prompt.optimize.user-action', ..., { kind: 'user-action' })` 记录用户操作
- span.setAttributes 记录 original_length / mode / suggestion_count / duration_ms

**CommandRegistry → eventBus**：
- 内置命令的 execute 函数通过 `eventBus.emit()` 触发操作
- 如 `eventBus.emit('conversation:new')`、`eventBus.emit('system:openSettings')`
- 主进程已有 eventBus 实例，命令只做桥接不做实现

**CommandRegistry → AiModeRegistry**：
- 模式切换命令调用 `modeRegistry.switchMode(conversationId, modeId)`
- 需要 CommandRegistry 持有对 modeRegistry 的引用（通过注册函数注入）

**OptimizeButton → StudioAIPanel**：
- 在 StudioAIPanel 的发送按钮旁挂载 OptimizeButton
- 传入 `inputValue`、`currentMode`（从 modeStore 获取）、`conversationId`
- `onApply` 回调替换输入框内容；`onMerge` 回调追加补充内容

**CommandPalette → App.tsx**：
- 作为全局 overlay 挂载在 App 组件最外层
- Ctrl+K 全局快捷键通过 CommandPalette 组件内部 useEffect 注册

### 3.4 不存在的文件清单

| 文件 | 类型 |
|------|------|
| `src/main/services/prompt-optimizer/types.ts` | 新建 |
| `src/main/services/prompt-optimizer/optimizer-prompts.ts` | 新建 |
| `src/main/services/prompt-optimizer/prompt-optimizer.ts` | 新建 |
| `src/main/services/prompt-optimizer/index.ts` | 新建 |
| `src/main/services/command/types.ts` | 新建 |
| `src/main/services/command/command-registry.ts` | 新建 |
| `src/main/services/command/builtin-commands/mode-commands.ts` | 新建 |
| `src/main/services/command/builtin-commands/conversation-commands.ts` | 新建 |
| `src/main/services/command/builtin-commands/plan-commands.ts` | 新建 |
| `src/main/services/command/builtin-commands/handbook-commands.ts` | 新建 |
| `src/main/services/command/builtin-commands/system-commands.ts` | 新建 |
| `src/main/services/command/index.ts` | 新建 |
| `src/main/ipc/handlers/prompt-optimizer.ts` | 新建 |
| `src/main/ipc/handlers/command.ts` | 新建 |
| `src/renderer/store/commandStore.ts` | 新建 |
| `src/renderer/components/input/OptimizeButton.tsx` | 新建 |
| `src/renderer/components/input/SuggestionsPopover.tsx` | 新建 |
| `src/renderer/components/command-palette/CommandPalette.tsx` | 新建 |
| `src/renderer/components/command-palette/CommandItem.tsx` | 新建 |
| `src/renderer/components/command-palette/CommandCategory.tsx` | 新建 |
| `tests/prompt-optimizer/prompt-optimizer.test.ts` | 新建 |
| `tests/command/command-registry.test.ts` | 新建 |
| `tests/command/builtin-commands.test.ts` | 新建 |
| `tests/renderer/optimize-button.test.tsx` | 新建 |
| `tests/renderer/suggestions-popover.test.tsx` | 新建 |
| `tests/renderer/command-palette.test.tsx` | 新建 |
| `tests/renderer/command-store.test.ts` | 新建 |

---

## 四、分步实施计划

### 阶段 A：PromptOptimizer 共享类型与优化器核心（Step 1-3） — 预计 0.5 天

#### A1：创建 PromptOptimizer 类型定义

**文件：** `src/main/services/prompt-optimizer/types.ts`（新建）

严格遵循 TypeScript strict 模式，定义以下类型（完整规格见任务描述 Step 1）：

- `OptimizeRequest` — originalText + currentMode（AiModeId）+ conversationContext? + userPreferences?
- `KeyChangeType` = `'added' | 'clarified' | 'removed' | 'restructured'`
- `KeyChange` — type + description
- `OptimizationSuggestion` — id + text + rationale + keyChanges[] + estimatedImprovementScore (0-1)
- `OptimizeResponse` — requestId + suggestions[] + optimizationMode + durationMs
- `OptimizationError extends Error` — 支持 cause 链式错误
- `OptimizerConfig` — optimizerModel / maxCacheSize(50) / cacheTtlMs(60_000) / timeoutMs(8_000) / maxSuggestions(3)

`AiModeId` 从 `../mode/types` 导入（TASK030 已定义），不重复定义。

#### A2：实现优化器 System Prompt 模板

**文件：** `src/main/services/prompt-optimizer/optimizer-prompts.ts`（新建）

定义 `OPTIMIZER_SYSTEM_PROMPT` 常量（完整 prompt 见任务描述 Step 2 / 需求 3.4.4 技术规格），包含：
- 角色定义："prompt 优化助手"
- 优化原则（5 条）：保留原意、补充缺失、消除歧义、结构化、适配模式
- 禁止项：不夸大、不改语气、不加无意义礼貌词
- 严格 JSON 输出格式
- 动态注入变量：`{{mode}}`、`{{modeContext}}`、`{{contextSummary}}`、`{{originalText}}`

定义 `MODE_OPTIMIZATION_HINTS: Map<string, string>`：
- plan → '补充目标、约束条件、期望产物格式、时间范围'
- analyze → '明确分析对象、选择分析角度、指定输出维度'
- review → '指定审查重点、严厉程度、关注的技术领域'
- write → '指定读者、长度要求、风格偏好、格式模板'
- free → '通用澄清：补充上下文、明确具体需求、结构化请求'

#### A3：实现 PromptOptimizer 核心类

**文件：** `src/main/services/prompt-optimizer/prompt-optimizer.ts`（新建）

**构造函数注入**：`aiGateway: AiGatewayClient`, `modeRegistry: AiModeRegistry`, `tracer: Tracer`, `config: OptimizerConfig`, `logger: Logger`

**内部状态**：
- `cache: Map<string, { response: OptimizeResponse; expiresAt: number }>` — 简易 LRU 缓存（Map + TTL）
- `requestCount: Map<string, number>` — 每会话请求计数

**核心方法**：

| 方法 | 职责 |
|------|------|
| `optimize(req)` | Tracer span → 缓存检查 → 构建 system prompt → LLM 调用 → 解析 JSON → 缓存结果 |
| `recordUserAction(requestId, action, suggestionId?)` | Tracer span (kind: user-action) 记录 applied/merged/edited/ignored |
| `incrementSessionCount(sessionId)` | 返回递增后计数，用于第 5 次小贴士触发 |

**`optimize()` 流程**：
1. `tracer.withSpan('prompt.optimize', ..., { kind: 'ai-call' })`
2. `buildCacheKey(req)` → 缓存命中直接返回（`span.setAttribute('prompt.cache_hit', true)`）
3. `modeRegistry.get(req.currentMode)` + `MODE_OPTIMIZATION_HINTS` → 构建 modeContext
4. `OPTIMIZER_SYSTEM_PROMPT.replace()` → 注入 mode / modeContext / contextSummary / originalText
5. `aiGateway.createSession({ role: 'optimizer' })` → `session.chat({ model, temperature: 0.3, maxTokens: 1200 })`
6. `Promise.race([llmCall, timeout(8000)])` → `session.close()` (finally)
7. `parseResponse(content)` → 构建 `OptimizeResponse` → 缓存 → 返回
8. catch → `span.setStatus('error')` → throw `OptimizationError`

**`parseResponse(content)`**：先 `JSON.parse` → 失败则正则提取 ` ```json...``` ` → 仍失败抛错

**`buildCacheKey(req)`**：`crypto.createHash('sha256').update(text+mode+summary).digest('hex')`

#### A4：创建 PromptOptimizer 统一导出

**文件：** `src/main/services/prompt-optimizer/index.ts`（新建）

导出所有类型 + PromptOptimizer 类。

---

### 阶段 B：CommandRegistry 核心与内置命令（Step 4-6） — 预计 1 天

#### B1：创建 Command 共享类型

**文件：** `src/main/services/command/types.ts`（新建）

- `Command` — id / title / titleI18n? / category / keywords? / shortcut? / icon? / requiresConfirmation? / predicate? / execute
- `CommandExecutionRecord` — commandId + executedAt

**设计要点**：`predicate` 支持同步和异步；`requiresConfirmation.destructive` 标记破坏性操作；`titleI18n` 支持多语言搜索。

#### B2：实现 CommandRegistry

**文件：** `src/main/services/command/command-registry.ts`（新建）

**构造函数**：`tracer: Tracer`, `logger: Logger`, `confirmDialogFn?`（确认对话框回调）

**内部状态**：`commands: Map<string, Command>`、`recentExecutions: CommandExecutionRecord[]`、`MAX_RECENT = 50`

**核心 API**：register（重复 ID 抛错）/ unregister / search / execute / getAll

**`search(query, language)`**：`filterByPredicate()` 异步过滤 → 空 query 按 `rankByRecency()` → 否则 `fuzzyMatch()`

**`fuzzyMatch()` 评分**：title 开头 +100 / title 包含 +50 / keywords +30 / shortcut +15 / category +10 / recency bonus。过滤 > 0 降序。

**`execute(id)`**：查找命令 → requiresConfirmation 则 `confirmDialogFn` → `tracer.withSpan('command.execute')` → `cmd.execute()` → `recordExecution(id)`

**确认对话框**：首次实现使用 Electron 原生 `dialog.showMessageBox()`，避免跨进程通信复杂度。

#### B3：注册内置命令

**5 个命令模块，每个导出 `register*Commands(registry, deps...)` 函数**：

**mode-commands.ts** — 5 个模式切换命令（plan/analyze/review/write/free），通过 `modeRegistry.switchMode()` 执行。keywords: `['模式', 'mode', '切换', 'switch']`

**conversation-commands.ts** — 4 个：new / exportMarkdown / exportJson / clear（clear 带 `requiresConfirmation: { destructive: true }`）

**plan-commands.ts** — 3 个：listActive / newBlank / archiveCompleted

**handbook-commands.ts** — 2 个（框架，TASK033 实现）：browse / cloneToWorkspace

**system-commands.ts** — 7 个：settings(Ctrl+,) / language / theme / restart(带确认) / trace.openInspector(Ctrl+Shift+T) / progress.viewLedger / performance.viewPanel

**内置命令总数**：5+4+3+2+7 = **21 个**，满足 ≥ 20 个验收标准。

**设计决策**：内置命令 execute 函数通过闭包捕获 `modeRegistry`/`eventBus` 引用；`conversationId` 在执行时动态获取。

#### B8：创建 Command 统一导出

**文件：** `src/main/services/command/index.ts`（新建）

导出 Command / CommandExecutionRecord 类型 + CommandRegistry 类 + 所有 register*Commands 函数。

---

### 阶段 C：IPC 集成与 Preload API（Step 7-9） — 预计 0.5 天

#### C1：扩展 shared/types.ts

**文件：** `src/shared/types.ts`（扩展）

**1. `IPC_CHANNELS` 追加**（PLAN_ABANDONED 之后）：
- `PROMPT_OPTIMIZER_OPTIMIZE: 'promptOptimizer:optimize'`
- `PROMPT_OPTIMIZER_RECORD_ACTION: 'promptOptimizer:recordAction'`
- `COMMAND_SEARCH: 'command:search'`
- `COMMAND_EXECUTE: 'command:execute'`

**2. `IPCChannelMap` 追加类型映射**：
- `PROMPT_OPTIMIZER_OPTIMIZE` → params: `[req: OptimizeRequestShared]`; return: `OptimizeResponseShared`
- `PROMPT_OPTIMIZER_RECORD_ACTION` → params: `[requestId, action, suggestionId?]`; return: void
- `COMMAND_SEARCH` → params: `[query, language?]`; return: `CommandShared[]`
- `COMMAND_EXECUTE` → params: `[id]`; return: void

**3. 新增共享类型**：`OptimizeRequestShared` / `OptimizationSuggestionShared` / `OptimizeResponseShared` / `CommandShared`

**类型共享策略**：主进程 `prompt-optimizer/types.ts` 定义完整类型；shared 定义 `*Shared` 序列化版本（不含函数）。IPC handler 负责类型转换。

#### C2：扩展 AiGatewaySessionRole

**文件：** `src/main/services/ai-gateway-client.ts`（扩展）

在 `AiGatewaySessionRole` 联合类型追加 `'optimizer'`。仅追加值，不修改现有值。

#### C3：实现 PromptOptimizer IPC Handler

**文件：** `src/main/ipc/handlers/prompt-optimizer.ts`（新建）

导出 `registerPromptOptimizerHandlers(ipcMain, promptOptimizer, logger)`：
- `promptOptimizer:optimize` → 构建 OptimizeRequest → optimize() → 序列化为 Shared 类型
- `promptOptimizer:recordAction` → recordUserAction()
- 所有 handler 包裹 try/catch，catch 返回结构化错误响应

#### C4：实现 Command IPC Handler

**文件：** `src/main/ipc/handlers/command.ts`（新建）

导出 `registerCommandHandlers(ipcMain, commandRegistry, logger)`：
- `command:search` → search() → 结果映射为 `CommandShared[]`（剔除 predicate/execute）
- `command:execute` → execute()

#### C5：Preload API 扩展

**文件：** `src/preload/index.ts`（扩展）

追加 `promptOptimizer` 和 `command` 命名空间到 `ElectronAPI` 接口和 `api` 对象：
- `promptOptimizer.optimize(req)` / `promptOptimizer.recordAction(requestId, action, suggestionId?)`
- `command.search(query, language?)` / `command.execute(id)`

`ALLOWED_CHANNELS` 追加 `'promptOptimizer:optimize'` / `'promptOptimizer:recordAction'` / `'command:search'` / `'command:execute'`

```typescript
'promptOptimizer:optimize', 'promptOptimizer:recordAction',
'command:search', 'command:execute',
```

---

### 阶段 D：渲染进程 UI 组件（Step 10-14） — 预计 1.5 天

#### D1：实现 commandStore（Zustand）

**文件：** `src/renderer/store/commandStore.ts`（新建）

**State**：isOpen / query / results (CommandShared[]) / selectedIndex / loading

**Actions**：open（set isOpen + 搜索空 query）/ close / toggle / setQuery（防抖 50ms + IPC search）/ selectNext / selectPrev / executeSelected（→ executeById → close）/ executeById（IPC execute → close）

**性能**：空搜索结果本地缓存 5s；setQuery debounce；devtools 中间件。

#### D2：实现 OptimizeButton 组件

**文件：** `src/renderer/components/input/OptimizeButton.tsx`（新建）

**Props**：inputValue / currentMode / conversationId / onApply(text) / onMerge(text)

**内部状态**：loading / suggestions / requestId / hintShown（localStorage 持久化）

**核心逻辑**：
- `disabled = inputValue.trim().length < 5 || loading`
- `handleOptimize`：IPC optimize → 设置 suggestions → 递增 usageCount → 第 5 次显示小贴士
- `handleApply`：onApply(suggestion.text) + recordAction('applied')
- `handleMerge`：提取 added 类型 keyChanges → onMerge(原文+补充) + recordAction('merged')
- `handleEditAndApply`：打开内联编辑器 → onApply(editedText) + recordAction('edited')
- `handleIgnore`：recordAction('ignored') + 关闭浮层
- 渲染：`<button disabled={disabled}>` + loading spinner / `✨ 优化` + tooltip
- 辅助：`getConversationContext()` 从 store 获取最近 3 条消息；`incrementUsageCount()` localStorage

#### D3：实现 SuggestionsPopover 组件

**文件：** `src/renderer/components/input/SuggestionsPopover.tsx`（新建）

**Props**：original / suggestions / onApply / onMerge / onEdit / onClose

**内部状态**：selectedSuggestionIndex / editingSuggestion / editText

**渲染**：popover 浮层（输入框下方，position: absolute，min-width: 320px，z-index: 1000）
- 每条建议：编号 + 优化文本 + keyChange pills（added=绿/+、clarified=蓝/→、removed=红/-、restructured=紫/↻）+ rationale + 评分进度条
- 操作按钮：[应用](主色) / [合并](outline) / [编辑后应用] / [忽略](灰色)
- 内联编辑器：textarea 预填 + 确认/取消
- 点击外部关闭（useEffect document click listener）

#### D4：实现 CommandPalette 主组件

**文件：** `src/renderer/components/command-palette/CommandPalette.tsx`（新建）

使用 useCommandStore。键盘注册（useEffect）：Ctrl+K/Cmd+K → toggle；面板内 Arrow/Enter/Escape。

**渲染**（isOpen 时）：
- Overlay：bg-black/50，点击 close
- 面板：居中偏上(top:20%)，560px 宽，max-height 420px，圆角 12px
- 搜索框：autoFocus，placeholder "搜索命令…"
- 帮助模式：query 以 `?` 开头显示使用指南
- 结果列表：按 category 分组 → CommandCategory + CommandItem
- 空结果 / Loading 状态

#### D5-D6：CommandItem + CommandCategory

**CommandItem**：icon + title（`<mark>` 高亮匹配）+ shortcut pill。selected 时 bg-indigo-50。hover/click → onSelect。

**CommandCategory**：分类标题（text-xs uppercase）+ 计数 badge。

---

### 阶段 E：主进程装配与 UI 集成（Step 15-17） — 预计 0.5 天

#### E1：主进程生命周期装配

**文件：** `src/main/index.ts`（扩展）

在 `onWorkspaceOpened` 回调中：
1. 创建 PromptOptimizer（注入 aiGateway / modeRegistry / tracer / config / logger）
2. 创建 CommandRegistry（注入 tracer / logger）
3. 注册全部内置命令（mode / conversation / plan / handbook / system）
4. 注册 IPC Handler（prompt-optimizer + command）
5. 注册 EventBus → UI 桥接（conversation:new → webContents.send 等）

#### E2：StudioAIPanel 集成 OptimizeButton

**文件：** `src/renderer/components/studio/StudioAIPanel.tsx`（扩展）

在输入按钮区（发送按钮旁）挂载 `<OptimizeButton>`，传入 inputValue / currentMode（从 modeStore 获取）/ conversationId。onApply 替换输入框内容；onMerge 追加补充内容。

#### E3：App.tsx 挂载 CommandPalette

**文件：** `src/renderer/App.tsx`（扩展）

在 App 最外层挂载 `<CommandPalette />`，作为全局 overlay，不影响现有布局。

---

## 五、验收标准追踪

### 一键优化提示词

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 按钮 input ≥ 5 字符启用，< 5 字符 disabled + tooltip | D2 OptimizeButton disabled 计算 | `optimize-button.test.tsx` #1-2 |
| 2 | 优化中 loading spinner，禁止重复请求 | D2 handleOptimize loading 状态 | `optimize-button.test.tsx` #3 |
| 3 | 优化返回后浮层展示 1-3 条建议 | D2 + D3 SuggestionsPopover | `optimize-button.test.tsx` #4 |
| 4 | 每条建议含优化文本 + 理由 + 关键改动高亮 | D3 SuggestionsPopover 渲染 | `suggestions-popover.test.tsx` |
| 5 | 应用/合并/编辑后应用/忽略操作 | D2 handleApply/handleMerge/handleEdit/handleIgnore | `optimize-button.test.tsx` |
| 6 | 优化请求不写入对话历史 | A3 PromptOptimizer 使用独立 session（不经过 Orchestrator） | `prompt-optimizer.test.ts` |
| 7 | 优化失败显示 error toast，保留原输入 | D2 catch → showToast | `optimize-button.test.tsx` #5 |
| 8 | 缓存 60s TTL，相同输入+模式不重复请求 | A3 cache 机制 | `prompt-optimizer.test.ts` #2 |
| 9 | 5 次后显示小贴士 | D2 incrementUsageCount | `optimize-button.test.tsx` #6 |
| 10 | 优化策略按模式调整 | A2 MODE_OPTIMIZATION_HINTS | `prompt-optimizer.test.ts` #3 |
| 11 | `prompt.optimize` Trace span | A3 tracer.withSpan | `prompt-optimizer.test.ts` #1 |
| 12 | `prompt.optimize.user-action` Trace span | A3 recordUserAction | `prompt-optimizer.test.ts` #9 |

### 命令面板

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | Ctrl+K / Cmd+K 呼出面板，聚焦输入框 | D4 CommandPalette useEffect keydown | `command-palette.test.tsx` #1 |
| 2 | 输入文本触发模糊搜索 | D4 + D1 commandStore.setQuery | `command-palette.test.tsx` #4 |
| 3 | 结果按分类分组，recency + relevance 排序 | B2 fuzzyMatch + rankByRecency | `command-registry.test.ts` #4-5 |
| 4 | Enter 执行选中命令并关闭 | D1 executeSelected | `command-palette.test.tsx` #6 |
| 5 | Escape 关闭面板 | D4 keydown handler | `command-palette.test.tsx` #2 |
| 6 | 命令行右侧显示快捷键 | D5 CommandItem shortcut 渲染 | 组件测试 |
| 7 | 破坏性命令弹出确认对话框 | B2 execute → confirmDialogFn | `command-registry.test.ts` #12-13 |
| 8 | 内置命令 ≥ 20 个 | B3-B7 内置命令注册 | `builtin-commands.test.ts` #6 |
| 9 | 10+ 次使用后最近命令优先 | B2 rankByRecency | `command-registry.test.ts` #15 |
| 10 | `?` 开头显示帮助/教程模式 | D4 帮助模式渲染 | `command-palette.test.tsx` #7 |
| 11 | 面板打开 < 100ms，搜索 < 50ms | B2 fuzzyMatch 纯计算 + D1 缓存 | 性能测试 |

### IPC 集成

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | `promptOptimizer:optimize` / `recordAction` 类型安全 | C1 + C3 | IPC handler 测试 |
| 2 | `command:search` / `execute` 类型安全 | C1 + C4 | IPC handler 测试 |
| 3 | Preload API 暴露 promptOptimizer / command 命名空间 | C5 | preload 测试 |

---

## 六、风险与缓解

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|---------|
| LLM 返回非 JSON 格式导致解析失败 | 高 | 中 | `parseResponse()` 双重回退（直接 JSON → markdown code block → 抛错）；`temperature: 0.3` 降低随机性 |
| shared/types.ts 循环依赖 | 中 | 高 | PromptOptimizer/Command 类型在各自 `types.ts` 独立定义；shared/types.ts 定义 `*Shared` 序列化版本，不反向依赖主进程模块 |
| 优化请求超时影响用户体验 | 中 | 中 | 8s timeout + loading spinner + error toast；缓存命中 < 10ms；优化端到端目标 < 5s |
| AiGatewaySessionRole 扩展破坏现有代码 | 低 | 中 | 仅追加 `'optimizer'` 到联合类型，不修改现有值；所有 switch/case 已覆盖的 role 不受影响 |
| 内置命令 eventBus 事件无人监听 | 中 | 低 | 事件发射后无消费者不影响稳定性；各子系统集成时逐步注册监听器 |
| 命令面板搜索性能不达标（> 50ms） | 低 | 中 | fuzzyMatch 是纯计算无 I/O；commandStore 本地缓存空搜索结果；可考虑 Web Worker |
| CommandRegistry.confirmDialogFn 跨进程确认复杂 | 中 | 中 | 首次实现使用 Electron 原生 `dialog.showMessageBox()`，避免跨进程通信复杂度；后续升级为自定义 UI |
| Ctrl+K 与浏览器/其他快捷键冲突 | 低 | 低 | `e.preventDefault()` 拦截；面板打开时拦截所有键盘事件 |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 | 预计工时 |
|----|------|--------|---------|
| Day 1 上午 | A1-A3 | prompt-optimizer/types.ts + optimizer-prompts.ts + prompt-optimizer.ts + index.ts | 3h |
| Day 1 下午 | B1-B2 | command/types.ts + command-registry.ts | 3h |
| Day 2 上午 | B3-B8 | 5 个内置命令模块 + command/index.ts | 3h |
| Day 2 下午 | C1-C5 | shared/types.ts 扩展 + AiGatewaySessionRole + IPC Handler + Preload API | 4h |
| Day 3 上午 | D1-D3 | commandStore + OptimizeButton + SuggestionsPopover | 4h |
| Day 3 下午 | D4-D6 | CommandPalette + CommandItem + CommandCategory | 3h |
| Day 4 上午 | E1-E3 | 主进程装配 + StudioAIPanel 集成 + App.tsx 集成 | 3h |
| Day 4 下午 | 测试 | prompt-optimizer + command-registry + builtin-commands 单元测试 | 4h |
| Day 5 上午 | 测试 | UI 组件测试 + commandStore 测试 | 4h |
| Day 5 下午 | 测试 + 修复 | 集成验证 + bug 修复 + 性能验证 | 3h |

**总预计工时**：34h（约 4.5 工作日）

---

## 八、测试计划摘要

### 单元测试文件结构

```
tests/prompt-optimizer/
├── prompt-optimizer.test.ts            ← 优化器核心逻辑测试

tests/command/
├── command-registry.test.ts            ← CommandRegistry 测试
├── builtin-commands.test.ts            ← 内置命令注册验证

tests/renderer/
├── optimize-button.test.tsx            ← OptimizeButton 组件测试
├── suggestions-popover.test.tsx        ← SuggestionsPopover 组件测试
├── command-palette.test.tsx            ← CommandPalette 组件测试
└── command-store.test.ts               ← commandStore 测试
```

### 关键测试用例

**prompt-optimizer.test.ts**：optimize 成功返回建议、缓存命中不发 LLM 请求、模式上下文注入、8s 超时抛 OptimizationError、JSON 解析（正常 + markdown code block 回退）、recordUserAction Trace span、sessionCount 递增

**command-registry.test.ts**：register/unregister、重复 ID 抛错、空 query 按 recency 排序、title/keyword/category/shortcut 匹配评分、i18n 标题匹配、execute 调用 execute 函数、requiresConfirmation 确认流程、predicate 过滤、recency 排序

**builtin-commands.test.ts**：5 类命令注册验证、总数 ≥ 21、破坏性命令有 requiresConfirmation

**optimize-button.test.tsx**：< 5 字符 disabled、≥ 5 字符 enabled、loading spinner、建议浮层、error toast、第 5 次小贴士

**command-palette.test.tsx**：Ctrl+K 打开、Escape 关闭、输入搜索、箭头导航、Enter 执行、`?` 帮助模式、overlay 点击关闭

---

**文档版本**: v1.0
**最后更新**: 2026-04-22
**维护者**: Sibylla 架构团队
