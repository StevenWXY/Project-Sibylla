# 一键优化提示词与命令面板

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK032 |
| **任务标题** | 一键优化提示词与命令面板 |
| **所属阶段** | Phase 1 - AI 模式系统、Plan 产物、Wiki 与能力整合 (Sprint 3.4) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

交付 Sprint 3.4 的两项 P0 用户级功能：(1) 一键优化提示词——帮用户把模糊需求转为清晰请求，降低 AI 沟通摩擦；(2) 命令面板——通过 Ctrl+K / Cmd+K 呼出的搜索型操作入口，统一所有常用操作的发现与执行路径。两者共同构成 Sprint 3.4 的"易用性支柱"。

### 背景

TASK030 已实现 AiModeRegistry 和五种模式。但用户在输入框中常常"说不清楚想要什么"，导致 AI 输出不理想。同时，随着功能增多（模式切换、Plan 管理、Handbook 搜索、Trace 查看、模型切换等），用户需要一个统一的"发现与执行"入口，而不是在 UI 各角落寻找按钮。

**核心设计约束：**

- **优化是辅助**（需求 3.4.4 设计原则）：一键优化只提建议，绝不擅自修改用户输入。用户必须显式选择"应用/合并/忽略"
- **优化不污染对话**：优化请求不写入对话历史，但生成独立的 Trace span
- **命令面板是统一入口**：所有可执行操作（模式切换、导出、Wiki 搜索等）都注册到 CommandRegistry
- **模糊搜索 + 最近使用**：命令面板支持名称/分类/关键词/快捷键搜索，最近使用的命令优先排序
- **性能要求**：优化端到端 < 5s（p95）、命令面板打开 < 100ms、搜索响应 < 50ms

**现有代码关键约束：**

| 维度 | 现状 | TASK032 改造 |
|------|------|-------------|
| AiGatewayClient | `services/ai-gateway-client.ts` — AI 调用接口 | PromptOptimizer 通过 `createSession().chat()` 标准接口调用，不改动 Gateway |
| AiModeRegistry | `services/mode/ai-mode-registry.ts` — 5 种模式 | 优化策略按当前模式调整；命令面板注册模式切换命令 |
| Tracer | Sprint 3.3 Tracer SDK | 优化请求和命令执行均纳入 Trace |
| PlanManager | TASK031 | 命令面板注册 Plan 相关命令 |
| StudioAIPanel | `renderer/components/studio/StudioAIPanel.tsx` | 输入框右侧挂载 OptimizeButton |

### 范围

**包含：**
- `services/prompt-optimizer/types.ts` — OptimizeRequest / OptimizationSuggestion / OptimizeResponse
- `services/prompt-optimizer/prompt-optimizer.ts` — PromptOptimizer 优化服务
- `services/prompt-optimizer/optimizer-prompts.ts` — 优化器 system prompt 模板
- `services/prompt-optimizer/index.ts` — 统一导出
- `services/command/types.ts` — Command / CommandExecutionRecord
- `services/command/command-registry.ts` — CommandRegistry 命令注册表
- `services/command/builtin-commands/` — 内置命令注册
- `services/command/index.ts` — 统一导出
- `ipc/handlers/prompt-optimizer.ts` — IPC 通道注册
- `ipc/handlers/command.ts` — IPC 通道注册
- `shared/types.ts` 扩展 — IPC 通道常量
- `preload/index.ts` 扩展 — promptOptimizer / command 命名空间
- `renderer/components/input/OptimizeButton.tsx` — ✨ 优化按钮
- `renderer/components/input/SuggestionsPopover.tsx` — 建议浮层
- `renderer/components/command-palette/CommandPalette.tsx` — 命令面板主组件
- `renderer/components/command-palette/CommandItem.tsx` — 命令行项
- `renderer/components/command-palette/CommandCategory.tsx` — 分类分组
- `renderer/store/commandStore.ts` — Zustand 命令面板状态
- 键盘快捷键 — Ctrl+K 命令面板 + 内置命令快捷键
- 单元测试

**不包含：**
- AiModeRegistry（TASK030）
- PlanManager（TASK031）
- Handbook 搜索（TASK033，但命令面板预留 Handbook 命令注册点）
- 对话导出（TASK034，但命令面板预留导出命令注册点）

## 验收标准

### 一键优化提示词

- [ ] ✨ 按钮在输入 ≥ 5 字符时启用，< 5 字符时 disabled + tooltip "请先输入内容"
- [ ] 优化进行中按钮显示 loading spinner，禁止重复请求
- [ ] 优化返回后输入框下方浮层展示 1-3 条建议
- [ ] 每条建议包含：优化后文本 + 优化理由 + 关键改动高亮
- [ ] 用户可"应用"（替换输入框）、"合并"（原文+补充）、"编辑后应用"、"忽略"
- [ ] 优化请求不写入对话历史
- [ ] 优化失败（API 错误、超时 > 8s）显示 error toast，保留原输入
- [ ] 优化建议缓存（60s TTL），相同输入+模式不重复请求
- [ ] 同一会话使用 5 次后显示一次性小贴士："💡 小贴士：你可以在设置中为常用场景预设输入模板"
- [ ] 优化策略按当前模式调整（Plan 补充目标/约束、Analyze 明确对象/角度等）
- [ ] 优化请求产生 `prompt.optimize` Trace span
- [ ] 用户操作（applied/merged/ignored）产生 `prompt.optimize.user-action` Trace span

### 命令面板

- [ ] `Ctrl+K`（macOS `Cmd+K`）呼出命令面板 overlay，聚焦输入框
- [ ] 输入文本触发模糊搜索（名称、分类、关键词、快捷键）
- [ ] 搜索结果按分类分组，按 recency + relevance 排序
- [ ] Enter 执行选中命令并关闭面板
- [ ] Escape 关闭面板不执行
- [ ] 命令行右侧显示快捷键（如有）
- [ ] 破坏性命令（如"清空对话"）弹出确认对话框
- [ ] 内置命令 ≥ 20 个
- [ ] 使用 10+ 次后最近命令优先排序
- [ ] 输入 `?` 开头显示帮助/教程模式
- [ ] 命令面板打开 < 100ms，搜索响应 < 50ms

### IPC 集成

- [ ] `promptOptimizer:optimize` / `promptOptimizer:recordAction` 通道类型安全
- [ ] `command:search` / `command:execute` 通道类型安全
- [ ] Preload API 暴露 promptOptimizer / command 命名空间

## 依赖关系

### 前置依赖

- [x] TASK030 — AI 模式系统（AiModeRegistry + mode IPC 通道）
- [x] TASK027 — Tracer SDK（Tracer / TraceStore）
- [x] TASK011 — AI 对话流式响应（AiGatewayClient）
- [x] TASK031 — Plan 模式与 Plan 产物管理（PlanManager，命令面板注册 Plan 命令）

### 被依赖任务

- TASK033 — 系统 Wiki 与外部数据源（命令面板注册 Handbook / DataSource 命令）
- TASK034 — 对话导出与模型切换（命令面板注册导出 / 模型切换命令）

## 参考文档

- [`specs/requirements/phase1/sprint3.4-mode.md`](../../requirements/phase1/sprint3.4-mode.md) — 需求 3.4.4 + 3.4.7
- [`specs/design/ui-ux-design.md`](../../design/ui-ux-design.md) — 色彩体系、交互规范
- [`CLAUDE.md`](../../../CLAUDE.md) — UI/UX 红线（2s 等待进度反馈、AI 建议/人类决策）
- `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` — IPC 类型安全设计
- `.kilocode/skills/phase1/zustand-state-management/SKILL.md` — Zustand store 设计
- `.kilocode/skills/common/frontend-design/SKILL.md` — 前端设计规范
- `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` — TypeScript 严格模式

## 技术执行路径

### 架构设计

```
Prompt Optimizer + Command Palette 整体架构

src/main/services/
├── prompt-optimizer/                    ← 提示词优化服务（新建目录）
│   ├── types.ts                         ← OptimizeRequest / OptimizationSuggestion / OptimizeResponse
│   ├── prompt-optimizer.ts              ← PromptOptimizer 主类
│   ├── optimizer-prompts.ts             ← 优化器 system prompt 模板
│   └── index.ts                         ← 统一导出
│
├── command/                             ← 命令注册表（新建目录）
│   ├── types.ts                         ← Command / CommandExecutionRecord
│   ├── command-registry.ts              ← CommandRegistry 中心注册表
│   ├── builtin-commands/                ← 内置命令
│   │   ├── mode-commands.ts             ← 模式切换命令
│   │   ├── conversation-commands.ts     ← 对话操作命令
│   │   ├── plan-commands.ts             ← Plan 操作命令
│   │   ├── handbook-commands.ts         ← Handbook 命令（预留，TASK033 实现）
│   │   └── system-commands.ts           ← 系统命令（设置/语言/主题/重启）
│   └── index.ts                         ← 统一导出
│
├── ipc/handlers/
│   ├── prompt-optimizer.ts              ← IPC: 优化请求/记录（新建）
│   └── command.ts                       ← IPC: 命令搜索/执行（新建）
│
└── (现有模块扩展)
    └── shared/types.ts                  ← IPC 通道常量 + 类型扩展

src/renderer/
├── store/
│   └── commandStore.ts                  ← Zustand 命令面板状态（新建）
│
├── components/
│   ├── input/
│   │   ├── OptimizeButton.tsx           ← ✨ 优化按钮（新建）
│   │   └── SuggestionsPopover.tsx       ← 建议浮层（新建）
│   │
│   └── command-palette/                 ← 命令面板目录（新建）
│       ├── CommandPalette.tsx           ← 主面板 overlay
│       ├── CommandItem.tsx              ← 命令行项
│       └── CommandCategory.tsx          ← 分类分组标题

数据流向：

一键优化：
  用户点击 ✨ 按钮
    → OptimizeButton 捕获 inputValue + currentMode + context
    → IPC promptOptimizer:optimize → PromptOptimizer.optimize()
      → Tracer.withSpan('prompt.optimize', ...)
      → 检查 LRU 缓存（60s TTL）
      → 从 AiModeRegistry 获取当前模式信息
      → 构建 optimizer system prompt（注入模式上下文）
      → AiGatewayClient.createSession().chat() → 轻量 LLM 请求
      → 解析 JSON 响应 → 构建 OptimizeResponse
      → 缓存结果
    → 渲染进程显示 SuggestionsPopover（1-3 条建议）
    → 用户选择操作：
      - "应用" → 替换输入框 → recordAction('applied')
      - "合并" → 原文+补充 → recordAction('merged')
      - "编辑后应用" → 内联编辑器 → recordAction('edited')
      - "忽略" → 关闭浮层 → recordAction('ignored')

命令面板：
  用户按 Ctrl+K
    → CommandPalette overlay 打开，聚焦搜索框
    → commandStore.search(query)
      → IPC command:search → CommandRegistry.search()
        → filterByPredicate() 过滤不可用命令
        → 若 query 为空 → rankByRecency()
        → 否则 → fuzzyMatch() 计算评分
      → 返回分组+排序后的 Command[]
    → 渲染列表（分类分组 + 快捷键 + 图标）
    → 用户按 Enter
      → IPC command:execute → CommandRegistry.execute()
        → 若需确认 → showConfirm()
        → cmd.execute()
        → recordExecution(id)
      → 面板关闭
```

### 步骤 1：定义 PromptOptimizer 共享类型

**文件：** `src/main/services/prompt-optimizer/types.ts`

1. 定义 `OptimizeRequest` 接口：
   ```typescript
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
   ```

2. 定义 `KeyChangeType` 联合类型：
   ```typescript
   export type KeyChangeType = 'added' | 'clarified' | 'removed' | 'restructured'
   ```

3. 定义 `KeyChange` 接口：
   ```typescript
   export interface KeyChange {
     type: KeyChangeType
     description: string
   }
   ```

4. 定义 `OptimizationSuggestion` 接口：
   ```typescript
   export interface OptimizationSuggestion {
     id: string
     text: string                           // the improved prompt
     rationale: string                      // why this is better (1-2 sentences)
     keyChanges: KeyChange[]
     estimatedImprovementScore: number      // 0-1
   }
   ```

5. 定义 `OptimizeResponse` 接口：
   ```typescript
   export interface OptimizeResponse {
     requestId: string
     suggestions: OptimizationSuggestion[]
     optimizationMode: 'quick' | 'thorough'
     durationMs: number
   }
   ```

6. 定义 `OptimizationError` 类：
   ```typescript
   export class OptimizationError extends Error {
     constructor(message: string, options?: { cause?: unknown }) {
       super(message, options)
       this.name = 'OptimizationError'
     }
   }
   ```

7. 定义 `OptimizerConfig` 接口：
   ```typescript
   export interface OptimizerConfig {
     optimizerModel: string                 // e.g. 'gpt-4o-mini'
     maxCacheSize: number                   // default 50
     cacheTtlMs: number                     // default 60_000
     timeoutMs: number                      // default 8_000
     maxSuggestions: number                 // default 3
   }
   ```

8. 导出所有类型

### 步骤 2：定义优化器 System Prompt 模板

**文件：** `src/main/services/prompt-optimizer/optimizer-prompts.ts`

1. 定义 `OPTIMIZER_SYSTEM_PROMPT` 常量：
   - 角色定义："你是一个 prompt 优化助手"
   - 任务说明："用户给你一段发给 AI 的消息，给出 1-3 条优化建议"
   - 优化原则（5 条）：
     - 保留用户原意
     - 补充缺失信息（读者/目标/约束）
     - 消除歧义（模糊→具体）
     - 结构化（长请求拆分）
     - 适配当前模式（`{{modeContext}}`）
   - 禁止项：
     - 不夸大/不添加用户没说的数字
     - 不改变用户语气偏好
     - 不加无意义礼貌词
   - 输出格式：严格 JSON
     ```json
     {
       "suggestions": [
         {
           "text": "优化后的完整文本",
           "rationale": "为什么更好（1-2 句）",
           "keyChanges": [
             {"type": "added", "description": "补充了目标读者"},
             {"type": "clarified", "description": "把'尽快'改为具体时间"}
           ],
           "estimatedImprovementScore": 0.75
         }
       ]
     }
     ```
   - 动态注入变量：`{{mode}}`、`{{modeContext}}`、`{{contextSummary}}`、`{{originalText}}`

2. 定义 `MODE_OPTIMIZATION_HINTS` 常量（Map<AiModeId, string>）：
   - `plan`：'补充目标、约束条件、期望产物格式、时间范围'
   - `analyze`：'明确分析对象、选择分析角度、指定输出维度'
   - `review`：'指定审查重点、严厉程度、关注的技术领域'
   - `write`：'指定读者、长度要求、风格偏好、格式模板'
   - `free`：'通用澄清：补充上下文、明确具体需求、结构化请求'

### 步骤 3：实现 PromptOptimizer 核心

**文件：** `src/main/services/prompt-optimizer/prompt-optimizer.ts`

1. 构造函数注入：
   ```typescript
   constructor(
     private aiGateway: AiGatewayClient,
     private modeRegistry: AiModeRegistry,
     private tracer: Tracer,
     private config: OptimizerConfig,
     private logger: Logger
   )
   ```

2. 内部状态：
   - `cache: LRUCache<string, OptimizeResponse>` — 缓存实例（max: config.maxCacheSize, ttl: config.cacheTtlMs）
   - `requestCount: Map<string, number>` — 每会话请求计数

3. 实现 `optimize(request: OptimizeRequest): Promise<OptimizeResponse>` 方法：
   - 包裹在 `tracer.withSpan('prompt.optimize', async (span) => { ... }, { kind: 'ai-call' })` 中
   - span.setAttributes：prompt.original_length、prompt.mode、prompt.has_context
   - **缓存检查**：
     ```typescript
     const cacheKey = this.buildCacheKey(request)
     const cached = this.cache.get(cacheKey)
     if (cached) {
       span.setAttribute('prompt.cache_hit', true)
       return cached
     }
     ```
   - **构建 system prompt**：
     ```typescript
     const mode = this.modeRegistry.get(request.currentMode)
     const modeContext = mode
       ? `用户选择的是 ${mode.label} 模式：${mode.description}。优化建议应侧重：${MODE_OPTIMIZATION_HINTS.get(request.currentMode) ?? '通用优化'}`
       : '用户在自由模式'
     const systemPrompt = OPTIMIZER_SYSTEM_PROMPT
       .replace('{{mode}}', request.currentMode)
       .replace('{{modeContext}}', modeContext)
       .replace('{{contextSummary}}', request.conversationContext?.summary ?? '（无）')
       .replace('{{originalText}}', request.originalText)
     ```
   - **调用 LLM**：
     ```typescript
     const startTime = Date.now()
     const session = this.aiGateway.createSession({ role: 'optimizer' })
     try {
       const response = await Promise.race([
         session.chat({
           model: this.config.optimizerModel,
           messages: [
             { role: 'system', content: systemPrompt },
             { role: 'user', content: 'Generate optimization suggestions.' }
           ],
           temperature: 0.3,
           maxTokens: 1200,
         }),
         this.timeout(this.config.timeoutMs)
       ])
       // ... parse and return
     } finally {
       session.close()
     }
     ```
   - **解析响应**：
     ```typescript
     const parsed = this.parseResponse(response.content)
     const result: OptimizeResponse = {
       requestId: span.context.spanId,
       suggestions: parsed.suggestions.slice(0, this.config.maxSuggestions).map((s, i) => ({
         id: `sug-${span.context.spanId}-${i}`,
         ...s
       })),
       optimizationMode: 'quick',
       durationMs: Date.now() - startTime
     }
     ```
   - span.setAttributes：prompt.suggestion_count、prompt.duration_ms
   - `this.cache.set(cacheKey, result)` — 缓存结果
   - 返回 result
   - catch → span.setStatus('error', String(err)) → throw new OptimizationError(...)

4. 实现 `recordUserAction(requestId: string, action: 'applied' | 'merged' | 'edited' | 'ignored', suggestionId?: string): Promise<void>` 方法：
   - 包裹在 `tracer.withSpan('prompt.optimize.user-action', ...)` 中
   - span.setAttributes：prompt.optimize.request_id、prompt.optimize.action、prompt.optimize.suggestion_id

5. 实现 `incrementSessionCount(sessionId: string): number` 方法：
   - `const count = (this.requestCount.get(sessionId) ?? 0) + 1`
   - `this.requestCount.set(sessionId, count)`
   - 返回 count

6. 实现 `parseResponse(content: string)` 私有方法：
   - 先尝试 `JSON.parse(content)`
   - 校验 `Array.isArray(parsed.suggestions)`
   - 若失败 → 尝试从 markdown code block 提取：`content.match(/```(?:json)?\s*([\s\S]*?)```/)`
   - 若仍失败 → throw Error('Cannot parse optimizer response')

7. 实现 `buildCacheKey(req: OptimizeRequest): string` 私有方法：
   - 基于 `{ text: req.originalText.trim(), mode: req.currentMode, contextSummary: req.conversationContext?.summary ?? '' }` 生成 hash

8. 实现 `timeout(ms: number): Promise<never>` 私有方法：
   - 返回 `new Promise((_, reject) => setTimeout(() => reject(new OptimizationError('优化请求超时')), ms))`

### 步骤 4：定义 Command 共享类型

**文件：** `src/main/services/command/types.ts`

1. 定义 `Command` 接口：
   ```typescript
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
     predicate?: () => boolean | Promise<boolean>
     execute: () => Promise<void> | void
   }
   ```

2. 定义 `CommandExecutionRecord` 接口：
   ```typescript
   export interface CommandExecutionRecord {
     commandId: string
     executedAt: number
   }
   ```

3. 导出所有类型

### 步骤 5：实现 CommandRegistry

**文件：** `src/main/services/command/command-registry.ts`

1. 构造函数注入：
   - `tracer: Tracer`
   - `logger: Logger`

2. 内部状态：
   - `commands: Map<string, Command>` — 所有已注册命令
   - `recentExecutions: CommandExecutionRecord[]` — 最近执行记录
   - `MAX_RECENT = 50` — 最大记录数

3. 实现 `register(command: Command): void` 方法：
   - 若 `this.commands.has(command.id)` → throw Error('Command already registered: ${command.id}')
   - `this.commands.set(command.id, command)`

4. 实现 `unregister(id: string): void` 方法：
   - `this.commands.delete(id)`

5. 实现 `search(query: string, language?: string): Promise<Command[]>` 方法：
   - `const allCommands = Array.from(this.commands.values())`
   - `const available = await this.filterByPredicate(allCommands)` — 异步过滤不可用命令
   - 若 `!query.trim()` → 返回 `this.rankByRecency(available)`
   - 否则 → 返回 `this.fuzzyMatch(available, query, language ?? 'en')`

6. 实现 `execute(id: string): Promise<void>` 方法：
   - `const cmd = this.commands.get(id)`
   - 若 `!cmd` → throw Error('Command not found: ${id}')
   - 若 `cmd.requiresConfirmation`：
     ```typescript
     const confirmed = await this.showConfirm(cmd.requiresConfirmation)
     if (!confirmed) return
     ```
   - 包裹在 `tracer.withSpan('command.execute', ...)` 中：
     - span.setAttributes：command.id、command.category
   - `await cmd.execute()`
   - `this.recordExecution(id)`

7. 实现 `getAll(): Command[]` 方法：
   - `return Array.from(this.commands.values())`

8. 实现 `filterByPredicate(commands: Command[]): Promise<Command[]>` 私有方法：
   - 对每个命令异步调用 `command.predicate?.() ?? true`
   - 过滤返回 false 的命令

9. 实现 `rankByRecency(commands: Command[]): Command[]` 私有方法：
   - 对每个命令计算 recencyIndex：`this.recentExecutions.findIndex(r => r.commandId === cmd.id)`
   - recencyIndex >= 0 时 bonus = `Math.max(0, 20 - recencyIndex)`
   - 按 bonus 降序排序

10. 实现 `fuzzyMatch(commands: Command[], query: string, language: string): Command[]` 私有方法：
    - 对每个命令计算 score（初始 0）：
      - `title = cmd.titleI18n?.[language] ?? cmd.title`
      - title 以 query 开头（忽略大小写） → score += 100
      - title 包含 query → score += 50
      - `cmd.keywords?.some(k => k.toLowerCase().includes(query))` → score += 30
      - `cmd.category.toLowerCase().includes(query)` → score += 10
      - `cmd.shortcut?.toLowerCase().includes(query)` → score += 15
      - recencyIndex bonus（同 rankByRecency）
    - 过滤 score > 0
    - 按 score 降序排序
    - 返回 Command[]

11. 实现 `recordExecution(id: string)` 私有方法：
    - `this.recentExecutions.unshift({ commandId: id, executedAt: Date.now() })`
    - 若 `this.recentExecutions.length > this.MAX_RECENT` → 截断

12. 实现 `showConfirm(config: { message: string; destructive: boolean }): Promise<boolean>` 抽象方法：
    - 通过 IPC 向渲染进程发送确认对话框请求
    - 返回用户选择（true/false）

13. 实现 `getRecentCommands(limit?: number): CommandExecutionRecord[]` 方法：
    - 返回最近 limit 条执行记录

### 步骤 6：注册内置命令

**文件：** `src/main/services/command/builtin-commands/mode-commands.ts`

1. 导出 `registerModeCommands(registry: CommandRegistry, modeRegistry: AiModeRegistry): void`
2. 注册 5 个模式切换命令：

   | id | title | category | shortcut | execute |
   |----|-------|----------|----------|---------|
   | mode.switch.plan | 切换到 Plan 模式 | AI 模式 | — | modeRegistry.switchMode(currentConvId, 'plan') + eventBus emit |
   | mode.switch.analyze | 切换到 Analyze 模式 | AI 模式 | — | 同上 |
   | mode.switch.review | 切换到 Review 模式 | AI 模式 | — | 同上 |
   | mode.switch.write | 切换到 Write 模式 | AI 模式 | — | 同上 |
   | mode.switch.free | 切换到 Free 模式 | AI 模式 | — | 同上 |

3. 每个命令的 keywords 包含中英文：`['模式', 'mode', '切换', 'switch']`

**文件：** `src/main/services/command/builtin-commands/conversation-commands.ts`

4. 导出 `registerConversationCommands(registry: CommandRegistry): void`
5. 注册对话操作命令：

   | id | title | category | execute |
   |----|-------|----------|---------|
   | conversation.new | 新建对话 | 对话 | eventBus.emit('conversation:new') |
   | conversation.exportMarkdown | 导出当前对话为 Markdown | 对话 | eventBus.emit('conversation:export', { format: 'markdown' })（预留 TASK034） |
   | conversation.exportJson | 导出当前对话为 JSON | 对话 | eventBus.emit('conversation:export', { format: 'json' })（预留 TASK034） |
   | conversation.clear | 清空当前对话 | 对话 | eventBus.emit('conversation:clear')（requiresConfirmation: { message: '确定清空当前对话？', destructive: true }） |

**文件：** `src/main/services/command/builtin-commands/plan-commands.ts`

6. 导出 `registerPlanCommands(registry: CommandRegistry): void`
7. 注册 Plan 命令：

   | id | title | category | execute |
   |----|-------|----------|---------|
   | plan.listActive | 查看所有活动 Plan | Plan | eventBus.emit('plan:listActive') |
   | plan.newBlank | 新建空白 Plan | Plan | eventBus.emit('plan:newBlank') |
   | plan.archiveCompleted | 归档已完成 Plan | Plan | eventBus.emit('plan:archiveCompleted') |

**文件：** `src/main/services/command/builtin-commands/handbook-commands.ts`

8. 导出 `registerHandbookCommands(registry: CommandRegistry): void`
9. 注册 Handbook 命令（框架，实际搜索逻辑在 TASK033）：

   | id | title | category | execute |
   |----|-------|----------|---------|
   | handbook.browse | 浏览用户手册 | Handbook | eventBus.emit('handbook:browse') |
   | handbook.cloneToWorkspace | 克隆手册到工作区 | Handbook | eventBus.emit('handbook:cloneToWorkspace') |

**文件：** `src/main/services/command/builtin-commands/system-commands.ts`

10. 导出 `registerSystemCommands(registry: CommandRegistry): void`
11. 注册系统命令：

    | id | title | category | shortcut | execute |
    |----|-------|----------|----------|---------|
    | system.settings | 打开设置 | 系统 | Ctrl+, | eventBus.emit('system:openSettings') |
    | system.language | 切换语言 | 系统 | — | eventBus.emit('system:toggleLanguage') |
    | system.theme | 切换主题 | 系统 | — | eventBus.emit('system:toggleTheme') |
    | system.restart | 重启应用 | 系统 | — | requiresConfirmation + app.relaunch() |
    | trace.openInspector | 打开 Trace Inspector | Trace & 进度 | Ctrl+Shift+T | eventBus.emit('trace:openInspector') |
    | progress.viewLedger | 查看任务台账 | Trace & 进度 | — | eventBus.emit('progress:viewLedger') |
    | performance.viewPanel | 查看性能面板 | Trace & 进度 | — | eventBus.emit('performance:viewPanel') |

### 步骤 7：实现统一导出

**文件：** `src/main/services/prompt-optimizer/index.ts`

1. 从 `types.ts` 导出所有类型
2. 从 `prompt-optimizer.ts` 导出 `PromptOptimizer`

**文件：** `src/main/services/command/index.ts`

1. 从 `types.ts` 导出 `Command`、`CommandExecutionRecord`
2. 从 `command-registry.ts` 导出 `CommandRegistry`
3. 从各 `builtin-commands/*.ts` 导出 `register*Commands` 函数

### 步骤 8：扩展 shared/types.ts

**文件：** `src/shared/types.ts`（扩展）

1. 在 `IPC_CHANNELS` 中追加 PromptOptimizer 相关通道：
   ```
   PROMPT_OPTIMIZER_OPTIMIZE: 'promptOptimizer:optimize'
   PROMPT_OPTIMIZER_RECORD_ACTION: 'promptOptimizer:recordAction'
   ```

2. 在 `IPC_CHANNELS` 中追加 Command 相关通道：
   ```
   COMMAND_SEARCH: 'command:search'
   COMMAND_EXECUTE: 'command:execute'
   ```

3. 在 `IPCChannelMap` 中追加类型映射：
   - `PROMPT_OPTIMIZER_OPTIMIZE` → `{ params: [req: OptimizeRequest]; return: OptimizeResponse }`
   - `PROMPT_OPTIMIZER_RECORD_ACTION` → `{ params: [requestId: string, action: string, suggestionId?: string]; return: void }`
   - `COMMAND_SEARCH` → `{ params: [query: string]; return: Command[] }`
   - `COMMAND_EXECUTE` → `{ params: [id: string]; return: void }`

### 步骤 9：实现 IPC Handler

**文件：** `src/main/ipc/handlers/prompt-optimizer.ts`（新建）

1. 导出 `registerPromptOptimizerHandlers` 函数
2. 注册 `PROMPT_OPTIMIZER_OPTIMIZE` handler：
   ```typescript
   ipcMain.handle('promptOptimizer:optimize', async (_event, req: OptimizeRequest) => {
     return promptOptimizer.optimize(req)
   })
   ```
3. 注册 `PROMPT_OPTIMIZER_RECORD_ACTION` handler：
   ```typescript
   ipcMain.handle('promptOptimizer:recordAction', async (_event, requestId: string, action: string, suggestionId?: string) => {
     await promptOptimizer.recordUserAction(requestId, action as any, suggestionId)
   })
   ```
4. 错误处理包裹

**文件：** `src/main/ipc/handlers/command.ts`（新建）

5. 导出 `registerCommandHandlers` 函数
6. 注册 `COMMAND_SEARCH` handler：
   ```typescript
   ipcMain.handle('command:search', async (_event, query: string) => {
     return commandRegistry.search(query)
   })
   ```
7. 注册 `COMMAND_EXECUTE` handler：
   ```typescript
   ipcMain.handle('command:execute', async (_event, id: string) => {
     await commandRegistry.execute(id)
   })
   ```
8. 错误处理包裹

### 步骤 10：Preload API 扩展

**文件：** `src/preload/index.ts`（扩展）

1. 新增 `promptOptimizer` 对象：
   ```typescript
   promptOptimizer: {
     optimize: (req: OptimizeRequest) => ipcRenderer.invoke('promptOptimizer:optimize', req),
     recordAction: (requestId: string, action: string, suggestionId?: string) =>
       ipcRenderer.invoke('promptOptimizer:recordAction', requestId, action, suggestionId),
   }
   ```

2. 新增 `command` 对象：
   ```typescript
   command: {
     search: (query: string) => ipcRenderer.invoke('command:search', query),
     execute: (id: string) => ipcRenderer.invoke('command:execute', id),
   }
   ```

### 步骤 11：实现 OptimizeButton 组件

**文件：** `src/renderer/components/input/OptimizeButton.tsx`（新建）

1. Props 接口：
   ```typescript
   interface OptimizeButtonProps {
     inputValue: string
     currentMode: AiModeId
     conversationId: string
     onApply: (text: string) => void
     onMerge: (text: string) => void
   }
   ```

2. 内部状态：
   - `loading: boolean`（默认 false）
   - `suggestions: OptimizationSuggestion[] | null`（默认 null）
   - `requestId: string | null`（默认 null）
   - `hintShown: boolean`（默认 false，5 次后显示小贴士）

3. 计算 `disabled`：
   ```typescript
   const disabled = inputValue.trim().length < 5 || loading
   ```

4. 实现 `handleOptimize` 方法：
   - `setLoading(true)`
   - try：
     - 构建请求：
       ```typescript
       const result = await window.sibylla.promptOptimizer.optimize({
         originalText: inputValue,
         currentMode,
         conversationContext: await getConversationContext()
       })
       ```
     - `setSuggestions(result.suggestions)`、`setRequestId(result.requestId)`
     - 递增使用计数：
       ```typescript
       const count = incrementUsageCount()
       if (count === 5 && !hintShown) {
         showToast('💡 小贴士：你可以在设置中为常用场景预设输入模板')
         setHintShown(true)
       }
       ```
   - catch → `showToast('优化服务暂时不可用，请稍后重试', 'error')`
   - finally → `setLoading(false)`

5. 实现 `handleApply` 方法：
   - `onApply(suggestion.text)`
   - `await window.sibylla.promptOptimizer.recordAction(requestId!, 'applied', suggestion.id)`
   - `setSuggestions(null)`

6. 实现 `handleMerge` 方法：
   - 提取 additions：`suggestion.keyChanges.filter(c => c.type === 'added').map(c => c.description).join('；')`
   - `onMerge('${inputValue}\n\n补充：${additions}')`
   - `await window.sibylla.promptOptimizer.recordAction(requestId!, 'merged', suggestion.id)`
   - `setSuggestions(null)`

7. 实现 `handleEditAndApply` 方法：
   - 打开内联编辑器（textarea 预填 suggestion.text）
   - 用户编辑后确认 → `onApply(editedText)`
   - `await window.sibylla.promptOptimizer.recordAction(requestId!, 'edited', suggestion.id)`

8. 实现 `handleIgnore` 方法：
   - `await window.sibylla.promptOptimizer.recordAction(requestId!, 'ignored')`
   - `setSuggestions(null)`

9. 渲染逻辑：
   - 按钮：`<button className="optimize-btn" onClick={handleOptimize} disabled={disabled} title={...}>`
     - loading 时：`<Spinner size="sm" />`
     - 否则：`<span>✨ 优化</span>`
   - suggestions 非空时渲染 `<SuggestionsPopover />`

10. 实现 `getConversationContext` 辅助函数：
    - 获取当前对话最近 3 条消息的摘要
    - 调用 `window.sibylla.ai?.getRecentMessages?.(conversationId, 3)` 或从 store 获取

11. 实现 `incrementUsageCount` 辅助函数：
    - localStorage 存储 `sibylla:optimizer:usage:${conversationId}`
    - 返回递增后的计数

### 步骤 12：实现 SuggestionsPopover 组件

**文件：** `src/renderer/components/input/SuggestionsPopover.tsx`（新建）

1. Props 接口：
   ```typescript
   interface SuggestionsPopoverProps {
     original: string
     suggestions: OptimizationSuggestion[]
     onApply: (suggestion: OptimizationSuggestion) => void
     onMerge: (suggestion: OptimizationSuggestion) => void
     onEdit: (suggestion: OptimizationSuggestion) => void
     onClose: () => void
   }
   ```

2. 内部状态：
   - `selectedSuggestionIndex: number`（默认 0）
   - `editingSuggestion: OptimizationSuggestion | null`（默认 null）
   - `editText: string`（编辑器内容）

3. 渲染布局（popover 浮层）：
   - 定位：输入框正下方，左对齐
   - 宽度：与输入框同宽，最小 320px
   - z-index：高层级（避免被遮挡）

4. 每条建议渲染：
   - **建议编号**：`建议 ${index + 1}`
   - **优化后文本**：完整展示（截断过长内容，可展开）
   - **关键改动高亮**：
     - 遍历 `suggestion.keyChanges`
     - 每个 keyChange 渲染为小 pill：
       - added → 绿色 `+ ${description}`
       - clarified → 蓝色 `→ ${description}`
       - removed → 红色 `- ${description}`
       - restructured → 紫色 `↻ ${description}`
   - **优化理由**：灰色小字 `${suggestion.rationale}`
   - **评分指示器**：`${Math.round(suggestion.estimatedImprovementScore * 100)}%` 进度条

5. 操作按钮区：
   - **[应用]** 按钮（主色）→ `onApply(suggestion)`
   - **[合并]** 按钮（次色）→ `onMerge(suggestion)`
   - **[编辑后应用]** 按钮 → 设置 `editingSuggestion = suggestion`，打开内联编辑器
   - **[忽略]** 按钮 → `onClose()`

6. 内联编辑器模式（editingSuggestion 非 null 时）：
   - textarea 预填 `suggestion.text`
   - [确认] → `onApply({ ...editingSuggestion, text: editText })`
   - [取消] → `editingSuggestion = null`

7. 点击外部关闭：
   - useEffect 注册 document click listener
   - 检测点击不在 popover 内 → `onClose()`

### 步骤 13：实现 commandStore（Zustand）

**文件：** `src/renderer/store/commandStore.ts`（新建）

1. 定义 `CommandPaletteState` 接口：
   ```typescript
   interface CommandPaletteState {
     isOpen: boolean
     query: string
     results: Command[]
     selectedIndex: number
     loading: boolean
   }
   ```

2. 定义 `CommandPaletteActions` 接口：
   ```typescript
   interface CommandPaletteActions {
     open: () => void
     close: () => void
     toggle: () => void
     setQuery: (query: string) => Promise<void>
     selectNext: () => void
     selectPrev: () => void
     executeSelected: () => Promise<void>
     executeById: (id: string) => Promise<void>
   }
   ```

3. 创建 `useCommandStore = create<CommandPaletteState & CommandPaletteActions>()((set, get) => ({...}))`

4. 实现 `open` action：
   - `set({ isOpen: true, query: '', selectedIndex: 0 })`
   - 自动搜索空 query → `fetchResults('')`

5. 实现 `close` action：
   - `set({ isOpen: false, query: '', results: [] })`

6. 实现 `toggle` action：
   - `get().isOpen ? get().close() : get().open()`

7. 实现 `setQuery` action：
   - `set({ query, loading: true })`
   - `const results = await window.sibylla.command.search(query)`
   - `set({ results, selectedIndex: 0, loading: false })`
   - catch → `set({ loading: false })`

8. 实现 `selectNext` action：
   - `set({ selectedIndex: Math.min(get().selectedIndex + 1, get().results.length - 1) })`

9. 实现 `selectPrev` action：
   - `set({ selectedIndex: Math.max(get().selectedIndex - 1, 0) })`

10. 实现 `executeSelected` action：
    - `const cmd = get().results[get().selectedIndex]`
    - 若 cmd → `await get().executeById(cmd.id)`
    - `get().close()`

11. 实现 `executeById` action：
    - `await window.sibylla.command.execute(id)`
    - 执行后自动 `close()`

### 步骤 14：实现 CommandPalette 主组件

**文件：** `src/renderer/components/command-palette/CommandPalette.tsx`（新建）

1. 使用 `useCommandStore` 获取全部状态和 actions

2. 键盘快捷键注册（useEffect）：
   ```typescript
   useEffect(() => {
     const handler = (e: KeyboardEvent) => {
       if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
         e.preventDefault()
         toggle()
       }
     }
     document.addEventListener('keydown', handler)
     return () => document.removeEventListener('keydown', handler)
   }, [toggle])
   ```

3. 面板内部键盘导航（useEffect，isOpen 时激活）：
   ```typescript
   useEffect(() => {
     if (!isOpen) return
     const handler = (e: KeyboardEvent) => {
       if (e.key === 'ArrowDown') { e.preventDefault(); selectNext() }
       else if (e.key === 'ArrowUp') { e.preventDefault(); selectPrev() }
       else if (e.key === 'Enter') { e.preventDefault(); executeSelected() }
       else if (e.key === 'Escape') { close() }
     }
     document.addEventListener('keydown', handler)
     return () => document.removeEventListener('keydown', handler)
   }, [isOpen, selectNext, selectPrev, executeSelected, close])
   ```

4. 渲染逻辑（isOpen 时）：
   - **Overlay 背景**：半透明深色遮罩，点击 → `close()`
   - **面板容器**：居中偏上，宽度 560px，最大高度 420px，圆角，阴影
   - **搜索输入框**：面板顶部， autoFocus， placeholder "搜索命令…"， value={query}
   - **帮助模式**：query 以 `?` 开头时，显示帮助/教程内容：
     ```
     💡 命令面板使用指南：
     - 输入关键词搜索命令
     - ↑↓ 箭头选择，Enter 执行
     - Esc 关闭面板
     - Ctrl+K 随时呼出
     ```
   - **结果列表**：按 category 分组渲染：
     - 遍历 results，按 `cmd.category` 分组
     - 每组渲染 `<CommandCategory title={category} />` 标题
     - 组内渲染 `<CommandItem />` 列表
   - **空结果**："未找到匹配命令"
   - **Loading**：搜索中显示 spinner

### 步骤 15：实现 CommandItem 组件

**文件：** `src/renderer/components/command-palette/CommandItem.tsx`（新建）

1. Props 接口：
   ```typescript
   interface CommandItemProps {
     command: Command
     selected: boolean
     query: string
     onSelect: (id: string) => void
   }
   ```

2. 渲染内容：
   - 左侧：icon（如有）+ title（匹配文本高亮）
   - 右侧：shortcut 徽章（如有，灰色背景）
   - selected 时：背景色变化（高亮行）

3. 匹配文本高亮：
   - 在 title 中查找 query 子串
   - 匹配部分用 `<mark>` 或粗体标记

4. 交互：
   - hover → onSelect(command.id)
   - click → onSelect(command.id)

### 步骤 16：实现 CommandCategory 组件

**文件：** `src/renderer/components/command-palette/CommandCategory.tsx`（新建）

1. Props 接口：
   ```typescript
   interface CommandCategoryProps {
     title: string
     count: number
   }
   ```

2. 渲染内容：
   - 分类标题：小号粗体灰色文字
   - 计数 badge：`(count)`

### 步骤 17：StudioAIPanel 集成

**文件：** `src/renderer/components/studio/StudioAIPanel.tsx`（扩展）

1. 在输入框区域挂载 OptimizeButton：
   - 位置：输入框右侧（发送按钮旁）
   - 传递 props：inputValue、currentMode、conversationId
   - `onApply` 回调：替换输入框内容
   - `onMerge` 回调：追加补充内容

2. 在应用根组件挂载 CommandPalette：
   - `<CommandPalette />` 作为全局 overlay 组件
   - 放置在 App 组件最外层，确保全局 Ctrl+K 生效

### 步骤 18：主进程初始化与装配

**文件：** `src/main/index.ts`（扩展）

1. 在 `onWorkspaceOpened` 中创建 PromptOptimizer：
   ```typescript
   const promptOptimizer = new PromptOptimizer(
     aiGateway, aiModeRegistry, tracer, optimizerConfig, logger
   )
   ```

2. 在 `onWorkspaceOpened` 中创建 CommandRegistry 并注册内置命令：
   ```typescript
   const commandRegistry = new CommandRegistry(tracer, logger)
   registerModeCommands(commandRegistry, aiModeRegistry)
   registerConversationCommands(commandRegistry)
   registerPlanCommands(commandRegistry)
   registerHandbookCommands(commandRegistry)
   registerSystemCommands(commandRegistry)
   ```

3. 注册 IPC Handler：
   ```typescript
   registerPromptOptimizerHandlers(ipcMain, promptOptimizer, logger)
   registerCommandHandlers(ipcMain, commandRegistry, logger)
   ```

4. 注册 EventBus → Command 执行的桥接：
   - 监听命令 execute 中的 eventBus 事件
   - 转发到对应的 UI 操作（打开面板、切换模式等）

### 步骤 19：性能验证要点

1. 命令面板打开延迟 < 100ms：
   - CommandRegistry.search('') 不调用 IPC，结果从缓存返回
   - 或首次调用后本地缓存 Command 列表

2. 搜索响应 < 50ms：
   - fuzzyMatch 是纯计算，无 I/O
   - predicate 过滤可异步但不阻塞渲染

3. 优化端到端 < 5s（p95）：
   - LLM 调用 timeout 8s
   - 缓存命中 < 10ms

## 测试计划

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

### prompt-optimizer.test.ts 测试用例

1. **optimize success** — 返回 1-3 条建议，每条含 text/rationale/keyChanges
2. **optimize with cache hit** — 相同输入+模式命中缓存，不发 LLM 请求
3. **optimize with mode context** — 不同模式注入不同的 modeContext
4. **optimize timeout** — 超过 8s 抛出 OptimizationError
5. **optimize LLM error** — LLM 返回错误时抛出 OptimizationError
6. **optimize parse JSON** — 正常 JSON 响应解析
7. **optimize parse code block** — JSON 包裹在 markdown code block 中时解析
8. **optimize parse failure** — 无法解析时抛错
9. **record user action** — 记录 applied/merged/edited/ignored action，产生 Trace span
10. **session count** — 递增使用计数，第 5 次返回 5

### command-registry.test.ts 测试用例

1. **register command** — 注册命令后 getAll 包含该命令
2. **register duplicate** — 重复 ID 抛错
3. **unregister command** — 注销后 getAll 不包含
4. **search empty query** — 返回按 recency 排序的全部命令
5. **search by title** — 标题匹配的命令 score 最高
6. **search by keyword** — keywords 匹配的命令 score += 30
7. **search by category** — category 匹配的命令 score += 10
8. **search by shortcut** — shortcut 匹配的命令 score += 15
9. **search no match** — 无匹配返回空数组
10. **search i18n title** — 使用 titleI18n 中对应语言的标题匹配
11. **execute command** — 执行命令的 execute 函数
12. **execute with confirmation** — requiresConfirmation 时弹出确认
13. **execute confirmation denied** — 用户拒绝确认不执行
14. **execute not found** — 命令不存在抛错
15. **recency ranking** — 最近执行的命令排名更高
16. **predicate filtering** — predicate 返回 false 的命令不出现

### builtin-commands.test.ts 测试用例

1. **mode commands registered** — 5 个模式切换命令全部注册
2. **conversation commands registered** — 对话操作命令全部注册
3. **plan commands registered** — Plan 命令全部注册
4. **handbook commands registered** — Handbook 命令框架注册
5. **system commands registered** — 系统命令全部注册
6. **total command count >= 20** — 内置命令总数 ≥ 20
7. **destructive commands have confirmation** — 清空对话、重启等有 requiresConfirmation

### optimize-button.test.tsx 测试用例

1. **disabled when input < 5 chars** — 输入不足 5 字符时按钮 disabled
2. **enabled when input >= 5 chars** — 输入 ≥ 5 字符时按钮 enabled
3. **shows loading during optimize** — 优化中显示 spinner
4. **shows suggestions after optimize** — 优化成功显示 SuggestionsPopover
5. **shows error on failure** — 优化失败显示 error toast
6. **5th usage shows tip** — 第 5 次使用显示小贴士

### command-palette.test.tsx 测试用例

1. **opens on Ctrl+K** — 快捷键打开面板
2. **closes on Escape** — Escape 关闭面板
3. **toggles on Ctrl+K** — 再次按 Ctrl+K 关闭面板
4. **searches on input** — 输入文本触发搜索
5. **navigates with arrows** — 上下箭头切换选中项
6. **executes on Enter** — Enter 执行选中命令
7. **shows help on ? prefix** — 输入 `?` 显示帮助模式
8. **closes on overlay click** — 点击遮罩关闭
9. **shows empty state** — 无匹配时显示空状态
10. **groups by category** — 结果按分类分组显示
