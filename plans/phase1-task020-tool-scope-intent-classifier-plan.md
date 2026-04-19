# PHASE1-TASK020: 工具范围管理与意图分类 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task020_tool-scope-intent-classifier.md](../specs/tasks/phase1/phase1-task020_tool-scope-intent-classifier.md)
> 创建日期：2026-04-20
> 最后更新：2026-04-20

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK020 |
| **任务标题** | 工具范围管理与意图分类 |
| **优先级** | P1 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **前置依赖** | ✅ TASK018 编排器、✅ AIChatRequest 类型（含 intent/explicitTools 字段） |

### 1.1 目标

建立工具注册表（Tool Registry）与意图分类器（Intent Classifier），根据用户请求意图动态选择暴露给 AI 的工具子集，减少 token 浪费和误操作风险。

### 1.2 核心命题

当前 AI 对话中所有工具始终全部暴露给 LLM，带来两个问题：
1. **token 浪费**：每次请求消耗大量 token 在工具描述上，即使大部分工具与当前任务无关
2. **误操作风险**：AI 可能误调用不相关工具，增加 Guardrail 拦截负担

需根据意图分类动态收窄工具范围，同时保持用户可通过 UI 按钮显式调用任何工具。

### 1.3 范围边界

**包含：**
- `ToolDefinition` 类型定义（id、name、description、schema、tags、handler）
- `IntentProfile` 类型定义（intent、tools、maxTools）
- `ToolScopeManager` 工具范围管理器
- `IntentClassifier` 意图分类器（规则优先 + LLM 兜底）
- 5 种 Intent Profile：chat、edit_file、analyze、plan、search
- 内置工具注册（8 个工具定义）
- 用户显式工具调用覆盖机制
- 工具不可用时的错误消息格式
- 编排器集成点
- 单元测试

**不包含：**
- 工具的实际 handler 实现（复用 Sprint 3 已有能力）
- 自定义工具注册 UI（后续迭代）

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | §四 TS 严格模式禁止 any；§五 命名约定 kebab-case；§九 任务完成状态更新 | 类型设计、文件命名、日志规范 |
| `specs/design/architecture.md` | §3.2 invoke/handle IPC 模式；§四 上下文引擎三层模型 | IPC 设计、工具注入上下文 |
| `specs/design/testing-and-security.md` | §1.1 单元测试 ≥80% | 测试策略 |
| `specs/requirements/phase1/sprint3.1-harness.md` | 需求 3.1.5 工具范围管理 + §4.5 叠加层集成策略 | 验收标准、集成方式 |
| `specs/tasks/phase1/phase1-task020_tool-scope-intent-classifier.md` | 7 步执行路径 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 |
|-------|---------|
| `ai-context-engine` | 工具子集注入上下文的策略、Token 预算考量、工具描述对 context budget 的影响 |
| `electron-ipc-patterns` | `HarnessHandler` IPC 注册、`safeHandle` 包装 |
| `typescript-strict-mode` | tagged union 表达 Intent 类型、类型守卫、禁止 any、JSONSchema 类型约束 |
| `llm-streaming-integration` | `llmClassify()` 轻量 LLM 调用模式、超时管理 |

### 2.3 前置代码依赖

| 模块 | 路径 | 状态 | 复用方式 |
|------|------|------|---------|
| `HarnessOrchestrator` | `src/main/services/harness/orchestrator.ts` | ⚠️ 需改造 | 注入 `ToolScopeManager`，`execute()` 中调用 `select()` |
| `Generator` | `src/main/services/harness/generator.ts` | ✅ 不修改 | 工具子集传入 Generator 的 context |
| `Evaluator` | `src/main/services/harness/evaluator.ts` | ✅ 不修改 | 不涉及 |
| `AiGatewayClient` | `src/main/services/ai-gateway-client.ts` | ✅ 不修改 | `IntentClassifier.llmClassify()` 使用 `createSession()` |
| `ContextEngine` | `src/main/services/context-engine.ts` | ✅ 不修改 | 工具定义作为 context 的一部分 |
| `GuideRegistry` | `src/main/services/harness/guides/registry.ts` | ✅ 不修改 | Guides 与 Tool Scope 并行运作 |
| `SensorFeedbackLoop` | `src/main/services/harness/sensors/feedback-loop.ts` | ✅ 不修改 | 不涉及 |
| `shared/types.ts` | `src/shared/types.ts` | ⚠️ 需扩展 | 追加 Tool/Intent 共享类型 + IPC 通道 |
| `ipc/handlers/harness.ts` | `src/main/ipc/handlers/harness.ts` | ⚠️ 需扩展 | 追加 Tool scope 查询 handler |
| `main/index.ts` | `src/main/index.ts` | ⚠️ 需扩展 | 追加 ToolScopeManager + IntentClassifier 初始化 |
| `MemoryManager` | `src/main/services/memory-manager.ts` | ✅ 不修改 | 复用 `appendHarnessTrace()` |

### 2.4 被依赖任务

| 任务 | 依赖方式 |
|------|---------|
| TASK021（Harness UI） | 工具范围指示器、显式工具调用按钮 |
| TASK022（状态机） | 工具调用日志写入状态机记录 |

---

## 三、架构设计

### 3.1 请求处理流程

```
请求进入 (AIChatRequest)
│
▼
IntentClassifier.classify(request)
│
├── ruleBasedClassify(request)
│   ├── 关键词匹配（中英文双语）
│   ├── confidence > 0.8 → 直接返回 intent
│   └── confidence ≤ 0.8 → 进入 LLM 兜底
│
└── llmClassify(request)（仅 ~5% 请求）
    ├── createSession({ role: 'classifier' })
    ├── 轻量模型单标签分类
    ├── 3 秒超时 → fallback chat
    └── 解析失败 → fallback chat
│
▼ 返回 ClassifyResult { intent, confidence, source, elapsedMs }
│
ToolScopeManager.select(request, classifyResult)
│
├── 查找 IntentProfile → 获取 tool ID 列表
├── 从 ToolRegistry 中解析 ToolDefinition
├── 裁剪到 profile.maxTools 上限
├── 追加 request.explicitTools（用户显式调用）
└── 返回 ToolSelection { tools, intent, profile }
│
▼
传入 HarnessOrchestrator.execute()
├── request.intent = classifyResult.intent
├── context.tools = selection.tools
├── generator.generate(request, context) 使用工具子集
└── memoryManager.appendHarnessTrace() 记录分类结果
```

### 3.2 Intent Profile 配置

| Intent | 工具列表 | maxTools |
|--------|---------|----------|
| chat | reference_file, search, skill_activate | 5 |
| edit_file | reference_file, diff_write, search, spec_lookup | 6 |
| analyze | reference_file, search, memory_query, graph_traverse | 6 |
| plan | reference_file, task_create, memory_query, skill_activate | 7 |
| search | search, reference_file | 4 |

### 3.3 意图分类规则（规则优先）

| 关键词模式 | 意图 | 置信度 |
|-----------|------|--------|
| 修改/edit/update/change/删除/delete/新增 + 文件/file | edit_file | 0.95 |
| 分析/analyze/compare/对比/比较/为什么/why | analyze | 0.9 |
| 计划/plan/拆解/break down/路线图/roadmap | plan | 0.9 |
| 搜索/find/search/查找 | search | 0.95 |
| 其他 | chat | 0.5（触发 LLM 兜底） |

### 3.4 关键设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 意图分类策略 | 规则优先 + LLM 兜底 | 95% 请求 <5ms，仅 5% 走 LLM，平衡性能与覆盖 |
| LLM 兜底模型 | 可配置（默认 Haiku） | 成本低、延迟低，分类任务无需强模型 |
| LLM 超时 | 3 秒 | 分类延迟不应阻塞主流程 |
| 工具超限策略 | 裁剪到 maxTools | 硬上限防止 token 溢出 |
| 默认意图 | chat（最宽松） | 模糊时偏向暴露更多工具，减少误拦 |
| 显式工具覆盖 | 无视意图限制直接追加 | 用户显式行为优先级最高 |
| 工具不可用错误 | 返回结构化消息 + 可用替代列表 | 帮助 LLM 自纠正选择替代工具 |
| ToolRegistry 数据结构 | Map<string, ToolDefinition> | O(1) 查找，与需求规格一致 |

### 3.5 叠加层集成原则

遵循 `sprint3.1-harness.md` §4.5：
- `shared/types.ts` 追加新类型和 IPC 通道，不修改现有字段
- `orchestrator.ts` 追加 `ToolScopeManager` 注入和调用，不修改现有方法签名
- `main/index.ts` 追加初始化代码，不影响现有初始化链路
- `harness.ts` 追加新 handler，不修改现有 handler

### 3.6 文件结构

新建：
```
src/main/services/harness/
├── intent-classifier.ts       # IntentClassifier 意图分类器
├── tool-scope.ts              # ToolScopeManager + ToolDefinition + IntentProfile
└── built-in-tools.ts          # 8 个内置工具注册

tests/harness/
├── intent-classifier.test.ts  # 意图分类测试
└── tool-scope.test.ts         # 工具范围管理测试
```

修改（追加式）：
- `src/shared/types.ts` — 追加 Tool/Intent 共享类型 + IPC 通道
- `src/main/services/harness/orchestrator.ts` — 注入 ToolScopeManager
- `src/main/ipc/handlers/harness.ts` — 追加 Tool scope 查询 handler
- `src/main/index.ts` — 追加初始化代码

---

## 四、类型系统设计

### 4.1 核心类型（`src/main/services/harness/tool-scope.ts`）

```typescript
export type HarnessIntent = 'chat' | 'edit_file' | 'analyze' | 'plan' | 'search'

export interface ToolDefinition {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly schema: Readonly<Record<string, unknown>>
  readonly tags: readonly string[]
  readonly handler: (args: unknown, ctx: ToolContext) => Promise<unknown>
}

export interface ToolContext {
  readonly workspaceRoot: string
  readonly sessionId: string
  readonly logger: Logger
}

export interface IntentProfile {
  readonly intent: HarnessIntent
  readonly tools: readonly string[]
  readonly maxTools: number
}

export const INTENT_PROFILES: readonly IntentProfile[] = [
  { intent: 'chat',      tools: ['reference_file', 'search', 'skill_activate'],                    maxTools: 5 },
  { intent: 'edit_file', tools: ['reference_file', 'diff_write', 'search', 'spec_lookup'],        maxTools: 6 },
  { intent: 'analyze',   tools: ['reference_file', 'search', 'memory_query', 'graph_traverse'],   maxTools: 6 },
  { intent: 'plan',      tools: ['reference_file', 'task_create', 'memory_query', 'skill_activate'], maxTools: 7 },
  { intent: 'search',    tools: ['search', 'reference_file'],                                      maxTools: 4 },
] as const

export const TOOL_NOT_AVAILABLE_MESSAGE =
  'tool not available in this context. Available tools: {availableTools}'
```

### 4.2 分类结果类型（`src/main/services/harness/intent-classifier.ts`）

```typescript
export interface ClassifyResult {
  readonly intent: HarnessIntent
  readonly confidence: number
  readonly source: 'rule' | 'llm' | 'fallback'
  readonly elapsedMs: number
}

export interface ClassifierConfig {
  readonly classifierModel: string
  readonly llmTimeoutMs: number
  readonly confidenceThreshold: number
}

export const DEFAULT_CLASSIFIER_CONFIG: ClassifierConfig = {
  classifierModel: 'claude-3-haiku-20240307',
  llmTimeoutMs: 3000,
  confidenceThreshold: 0.8,
}
```

### 4.3 工具选择结果类型（`src/main/services/harness/tool-scope.ts`）

```typescript
export interface ToolSelection {
  readonly tools: readonly ToolDefinition[]
  readonly intent: HarnessIntent
  readonly profile: IntentProfile
  readonly explicitOverrides: readonly string[]
}
```

### 4.4 共享类型扩展（`src/shared/types.ts`）

在现有 `AIChatRequest` 基础上，`intent` 和 `explicitTools` 字段已由 TASK018 追加，无需重复。新增 IPC 通道常量：

```typescript
export const IPC_CHANNELS = {
  // ... 现有通道不动 ...
  'harness:getToolScope': 'harness:getToolScope',
  'harness:getIntentProfiles': 'harness:getIntentProfiles',
  'harness:registerTool': 'harness:registerTool',
  'harness:unregisterTool': 'harness:unregisterTool',
} as const

export interface ToolSummary {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly tags: readonly string[]
}

export interface IntentProfileSummary {
  readonly intent: string
  readonly tools: readonly string[]
  readonly maxTools: number
}
```

---

## 五、IntentClassifier 详细设计

### 5.1 类结构

```typescript
export class IntentClassifier {
  constructor(
    private readonly gateway: AiGatewayClient,
    private readonly config: ClassifierConfig = DEFAULT_CLASSIFIER_CONFIG,
    private readonly logger: Logger
  ) {}

  async classify(request: AIChatRequest): Promise<ClassifyResult>
  private ruleBasedClassify(req: AIChatRequest): ClassifyResult
  private async llmClassify(req: AIChatRequest): Promise<ClassifyResult>
  private formatLlmPrompt(req: AIChatRequest): string
  private parseLlmResponse(raw: string): HarnessIntent | null
}
```

### 5.2 classify() 主方法

```typescript
async classify(request: AIChatRequest): Promise<ClassifyResult> {
  const start = performance.now()

  const ruleResult = this.ruleBasedClassify(request)
  if (ruleResult.confidence > this.config.confidenceThreshold) {
    const elapsed = performance.now() - start
    this.logger.info('intent-classifier.rule.hit', {
      intent: ruleResult.intent,
      confidence: ruleResult.confidence,
      elapsedMs: elapsed,
    })
    return { ...ruleResult, source: 'rule', elapsedMs: elapsed }
  }

  // confidence ≤ 0.8 → LLM fallback
  const llmResult = await this.llmClassify(request)
  const elapsed = performance.now() - start
  return { ...llmResult, elapsedMs: elapsed }
}
```

### 5.3 ruleBasedClassify() 规则引擎

关键设计：中英文双语关键词匹配，正则覆盖常见意图模式。

```typescript
private ruleBasedClassify(req: AIChatRequest): Omit<ClassifyResult, 'source' | 'elapsedMs'> {
  const msg = req.message.toLowerCase()

  // edit_file: 修改/编辑文件相关
  if (/(?:修改|edit|update|change|删除|delete|新增|add|创建|create|重命名|rename).*(?:文件|file|doc|文档|\.md|\.ts|\.tsx|\.json)/i.test(msg)
    || /(?:文件|file).*(?:修改|edit|update|change|删除|delete)/i.test(msg)) {
    return { intent: 'edit_file', confidence: 0.95 }
  }

  // analyze: 分析/对比相关
  if (/(?:分析|analyze|compare|对比|比较|为什么|why|评估|evaluate|审查|review|检查|check|inspect)/i.test(msg)) {
    return { intent: 'analyze', confidence: 0.9 }
  }

  // plan: 计划/拆解相关
  if (/(?:计划|plan|拆解|break.?down|路线图|roadmap|步骤|steps|方案|approach|策略|strategy)/i.test(msg)) {
    return { intent: 'plan', confidence: 0.9 }
  }

  // search: 搜索/查找相关
  if (/(?:搜索|find|search|查找|locate|定位|哪里|where|是否存在)/i.test(msg)) {
    return { intent: 'search', confidence: 0.95 }
  }

  // 默认：chat（低置信度，触发 LLM 兜底）
  return { intent: 'chat', confidence: 0.5 }
}
```

### 5.4 llmClassify() LLM 兜底

使用 `AiGatewayClient.createSession()` 获取独立会话，调用轻量模型分类。

```typescript
private async llmClassify(req: AIChatRequest): Promise<Omit<ClassifyResult, 'elapsedMs'>> {
  const session = this.gateway.createSession({ role: 'evaluator' })

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.config.llmTimeoutMs)

    const response = await session.chat({
      model: this.config.classifierModel,
      messages: [
        { role: 'system', content: this.CLASSIFIER_SYSTEM_PROMPT },
        { role: 'user', content: this.formatLlmPrompt(req) },
      ],
      temperature: 0,
      maxTokens: 10,
    }, { signal: controller.signal })

    clearTimeout(timeoutId)

    const parsed = this.parseLlmResponse(response.content)
    if (parsed) {
      this.logger.info('intent-classifier.llm.success', { intent: parsed })
      return { intent: parsed, confidence: 0.85, source: 'llm' }
    }

    this.logger.warn('intent-classifier.llm.parse-failed', { raw: response.content })
    return { intent: 'chat', confidence: 0.5, source: 'fallback' }
  } catch (err) {
    this.logger.warn('intent-classifier.llm.failed', { err })
    return { intent: 'chat', confidence: 0.5, source: 'fallback' }
  } finally {
    session.close()
  }
}
```

### 5.5 LLM Prompt 设计

```typescript
private readonly CLASSIFIER_SYSTEM_PROMPT = `Classify the user message into exactly one intent:
- chat: general conversation, greeting, casual question
- edit_file: wants to modify, create, delete, or rename a file
- analyze: wants analysis, comparison, evaluation, or explanation
- plan: wants planning, task breakdown, roadmap, or strategy
- search: wants to search, find, or locate something

Reply with ONLY the intent label, nothing else.`

private formatLlmPrompt(req: AIChatRequest): string {
  return `User message: "${req.message}"`
}
```

### 5.6 parseLlmResponse() 解析

```typescript
private parseLlmResponse(raw: string): HarnessIntent | null {
  const trimmed = raw.trim().toLowerCase()
  const validIntents: HarnessIntent[] = ['chat', 'edit_file', 'analyze', 'plan', 'search']

  // 直接匹配
  if (validIntents.includes(trimmed as HarnessIntent)) {
    return trimmed as HarnessIntent
  }

  // 提取第一个匹配的关键词
  for (const intent of validIntents) {
    if (trimmed.includes(intent)) return intent
  }

  return null
}
```

---

## 六、ToolScopeManager 详细设计

### 6.1 类结构

```typescript
export class ToolScopeManager {
  private readonly registry: Map<string, ToolDefinition>

  constructor(
    private readonly classifier: IntentClassifier,
    private readonly logger: Logger
  ) {
    this.registry = new Map()
  }

  async select(request: AIChatRequest): Promise<ToolSelection>
  getToolError(unavailableToolId: string, availableTools: readonly ToolDefinition[]): string
  registerTool(tool: ToolDefinition): void
  unregisterTool(id: string): boolean
  getRegisteredTools(): readonly ToolDefinition[]
  getToolById(id: string): ToolDefinition | undefined
}
```

### 6.2 select() 主方法

```typescript
async select(request: AIChatRequest): Promise<ToolSelection> {
  // 1. 意图分类
  const classifyResult = await this.classifier.classify(request)

  // 2. 查找 IntentProfile，未找到时 fallback 到 chat
  const profile = INTENT_PROFILES.find(p => p.intent === classifyResult.intent)
    ?? INTENT_PROFILES.find(p => p.intent === 'chat')!

  // 3. 从 registry 中解析 tool id → ToolDefinition
  const resolvedTools: ToolDefinition[] = []
  for (const toolId of profile.tools) {
    const def = this.registry.get(toolId)
    if (def) resolvedTools.push(def)
  }

  // 4. 裁剪到 maxTools
  const trimmed = resolvedTools.slice(0, profile.maxTools)

  // 5. 追加用户显式调用的工具（无视意图限制）
  const explicitOverrides: string[] = []
  if (request.explicitTools) {
    for (const id of request.explicitTools) {
      if (!trimmed.find(t => t.id === id)) {
        const def = this.registry.get(id)
        if (def) {
          trimmed.push(def)
          explicitOverrides.push(id)
        }
      }
    }
  }

  this.logger.info('tool-scope.select', {
    intent: classifyResult.intent,
    confidence: classifyResult.confidence,
    source: classifyResult.source,
    toolCount: trimmed.length,
    explicitOverrides,
  })

  return {
    tools: trimmed,
    intent: classifyResult.intent,
    profile,
    explicitOverrides,
  }
}
```

### 6.3 getToolError() 错误消息

```typescript
getToolError(unavailableToolId: string, availableTools: readonly ToolDefinition[]): string {
  const availableNames = availableTools.map(t => t.name).join(', ')
  return TOOL_NOT_AVAILABLE_MESSAGE.replace('{availableTools}', availableNames)
}
```

### 6.4 注册表管理

```typescript
registerTool(tool: ToolDefinition): void {
  if (this.registry.has(tool.id)) {
    this.logger.warn('tool-scope.register.duplicate', { id: tool.id })
  }
  this.registry.set(tool.id, tool)
  this.logger.info('tool-scope.register', { id: tool.id, name: tool.name })
}

unregisterTool(id: string): boolean {
  const result = this.registry.delete(id)
  if (result) {
    this.logger.info('tool-scope.unregister', { id })
  }
  return result
}

getRegisteredTools(): readonly ToolDefinition[] {
  return Array.from(this.registry.values())
}

getToolById(id: string): ToolDefinition | undefined {
  return this.registry.get(id)
}
```

---

## 七、内置工具注册（`src/main/services/harness/built-in-tools.ts`）

### 7.1 注册函数

```typescript
export function registerBuiltInTools(manager: ToolScopeManager): void {
  manager.registerTool(REFERENCE_FILE_TOOL)
  manager.registerTool(DIFF_WRITE_TOOL)
  manager.registerTool(SEARCH_TOOL)
  manager.registerTool(SKILL_ACTIVATE_TOOL)
  manager.registerTool(SPEC_LOOKUP_TOOL)
  manager.registerTool(MEMORY_QUERY_TOOL)
  manager.registerTool(TASK_CREATE_TOOL)
  manager.registerTool(GRAPH_TRAVERSE_TOOL)
}
```

### 7.2 工具定义明细

| 工具 ID | name | schema 参数 | tags | handler 引用 |
|---------|------|------------|------|-------------|
| `reference_file` | Reference File | `{ filePath: string }` | ['file', 'reference'] | 复用 FileManager |
| `diff_write` | Diff Write | `{ filePath: string, diffContent: string }` | ['file', 'write', 'diff'] | 复用 AIHandler diff 逻辑 |
| `search` | Full-text Search | `{ query: string, limit?: number }` | ['search', 'query'] | 复用 LocalSearchEngine |
| `skill_activate` | Activate Skill | `{ skillId: string }` | ['skill', 'activate'] | 复用 SkillEngine |
| `spec_lookup` | Spec Lookup | `{ specPath: string, section?: string }` | ['spec', 'lookup'] | 复用 ContextEngine |
| `memory_query` | Memory Query | `{ query: string, timeRange?: { start: number; end: number } }` | ['memory', 'query'] | 复用 MemoryManager |
| `task_create` | Create Task | `{ title: string, description?: string }` | ['task', 'create'] | 复用 TaskStateMachine |
| `graph_traverse` | Graph Traverse | `{ nodeId: string, depth?: number }` | ['graph', 'traverse'] | 预留接口（Phase 2） |

### 7.3 示例定义

```typescript
const REFERENCE_FILE_TOOL: ToolDefinition = {
  id: 'reference_file',
  name: 'Reference File',
  description: 'Reference a file by path to include its content in the AI context',
  schema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Relative path to the file' },
    },
    required: ['filePath'],
  },
  tags: ['file', 'reference'],
  handler: async (args, ctx) => {
    const { filePath } = args as { filePath: string }
    // 实际实现委托给 FileManager，本任务仅定义元数据
    ctx.logger.info('tool.reference_file', { filePath })
    return { referenced: filePath }
  },
}

const SEARCH_TOOL: ToolDefinition = {
  id: 'search',
  name: 'Full-text Search',
  description: 'Search workspace files for a query string',
  schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', description: 'Max results', default: 10 },
    },
    required: ['query'],
  },
  tags: ['search', 'query'],
  handler: async (args, ctx) => {
    const { query, limit = 10 } = args as { query: string; limit?: number }
    ctx.logger.info('tool.search', { query, limit })
    return { query, limit }
  },
}
```

> **注**：handler 实现仅做日志记录和参数透传，实际执行逻辑在后续迭代中替换为调用已有服务。本任务聚焦于工具元数据定义和范围管理机制。

---

## 八、集成改造详细设计

### 8.1 HarnessOrchestrator 改造

**文件**：`src/main/services/harness/orchestrator.ts`

改造原则：**追加式**，不修改现有方法签名。

#### 8.1.1 构造函数扩展

```typescript
export class HarnessOrchestrator {
  private toolScopeManager: ToolScopeManager | null = null

  // 现有构造函数不动，追加 setter 注入
  setToolScopeManager(manager: ToolScopeManager): void {
    this.toolScopeManager = manager
  }
}
```

#### 8.1.2 execute() 改造

在现有 `execute()` 方法的开头追加工具范围选择逻辑：

```typescript
async execute(request: AIChatRequest): Promise<HarnessResult> {
  // === 追加：工具范围选择 ===
  let toolSelection: ToolSelection | undefined
  if (this.toolScopeManager) {
    toolSelection = await this.toolScopeManager.select(request)
    // 回写 intent 到 request（向后兼容）
    request.intent = toolSelection.intent
  }

  // 现有 mode 解析逻辑不变
  const mode = this.resolveMode(request)
  const guides = this.guides.resolveGuides(request)
  const context = await this.contextEngine.assembleForHarness(request, mode, guides)

  // === 追加：工具子集注入 context ===
  if (toolSelection) {
    context.toolDefinitions = toolSelection.tools.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      schema: t.schema,
    }))
  }

  // 现有执行逻辑不变
  try { ... } catch (err) { ... }
}
```

#### 8.1.3 resolveMode() 联动

现有 `resolveMode()` 已使用 `request.intent === 'modify_file'` 判断。TASK020 的意图分类将 `edit_file` 写入 `request.intent`，需确认映射关系：

| IntentClassifier 输出 | resolveMode() 匹配 | 模式 |
|----------------------|--------------------|----|
| `edit_file` | `request.intent === 'modify_file'` → 匹配 `dual` | Dual |
| `chat` / `analyze` / `plan` / `search` | 落入 `this.config.defaultMode` | Single（默认） |

> **兼容处理**：在 `execute()` 中追加 `request.intent = request.intent === 'edit_file' ? 'modify_file' : request.intent` 映射，使 IntentClassifier 的 `edit_file` 兼容 `resolveMode()` 的 `modify_file` 判断。

### 8.2 HarnessHandler IPC 扩展

**文件**：`src/main/ipc/handlers/harness.ts`

追加 3 个 handler，不修改现有 handler：

```typescript
// 追加到 HarnessHandler.register() 方法中
this.register('harness:getToolScope', async (_e, request: AIChatRequest) => {
  return this.toolScopeManager.select(request)
})

this.register('harness:getIntentProfiles', async () => {
  return INTENT_PROFILES.map(p => ({
    intent: p.intent,
    tools: p.tools,
    maxTools: p.maxTools,
  }))
})

this.register('harness:registerTool', async (_e, tool: ToolDefinition) => {
  this.toolScopeManager.registerTool(tool)
})
```

### 8.3 main/index.ts 初始化追加

**文件**：`src/main/index.ts`

在现有 Harness 初始化块之后追加，不影响现有初始化链路：

```typescript
// === TASK020: ToolScopeManager + IntentClassifier 初始化 ===
const intentClassifier = new IntentClassifier(
  aiGatewayClient,
  DEFAULT_CLASSIFIER_CONFIG,
  logger
)

const toolScopeManager = new ToolScopeManager(intentClassifier, logger)
registerBuiltInTools(toolScopeManager)

harnessOrchestrator.setToolScopeManager(toolScopeManager)
harnessHandler.setToolScopeManager(toolScopeManager)
```

### 8.4 AssembledContext 类型扩展

**文件**：`src/shared/types.ts` 或 `context-engine.ts` 内部类型

在 `AssembledContext` 接口中追加可选字段（向后兼容）：

```typescript
export interface AssembledContext {
  // ... 现有字段不动 ...
  readonly toolDefinitions?: readonly ToolDefinitionSummary[]
}

export interface ToolDefinitionSummary {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly schema: Readonly<Record<string, unknown>>
}
```

---

## 九、测试策略

### 9.1 测试文件结构

```
tests/harness/
├── intent-classifier.test.ts   # 意图分类器测试
└── tool-scope.test.ts          # 工具范围管理测试
```

### 9.2 IntentClassifier 测试用例

**文件**：`tests/harness/intent-classifier.test.ts`

| # | 测试名 | 输入 | 期望输出 | 分类来源 |
|---|--------|------|---------|---------|
| 1 | 修改文件 → edit_file | "修改文件 src/foo.ts" | `{ intent: 'edit_file', confidence: 0.95 }` | rule |
| 2 | edit + file → edit_file | "edit the config file" | `{ intent: 'edit_file', confidence: 0.95 }` | rule |
| 3 | 分析 → analyze | "分析一下这个设计" | `{ intent: 'analyze', confidence: 0.9 }` | rule |
| 4 | compare → analyze | "compare these two approaches" | `{ intent: 'analyze', confidence: 0.9 }` | rule |
| 5 | 拆解 → plan | "帮我拆解这个任务" | `{ intent: 'plan', confidence: 0.9 }` | rule |
| 6 | roadmap → plan | "create a roadmap for v2" | `{ intent: 'plan', confidence: 0.9 }` | rule |
| 7 | 搜索 → search | "搜索关于 auth 的内容" | `{ intent: 'search', confidence: 0.95 }` | rule |
| 8 | find → search | "find all spec files" | `{ intent: 'search', confidence: 0.95 }` | rule |
| 9 | 你好 → chat + LLM fallback | "你好" | `{ intent: 'chat' }`，触发 LLM mock | llm/fallback |
| 10 | LLM 返回有效 intent | "这该怎么处理" | LLM mock 返回 "plan" → `{ intent: 'plan', source: 'llm' }` | llm |
| 11 | LLM 超时 → fallback | "随便聊聊" | mock AbortController → `{ intent: 'chat', source: 'fallback' }` | fallback |
| 12 | LLM 返回无效 intent → fallback | "今天天气如何" | LLM mock 返回 "invalid" → `{ intent: 'chat', source: 'fallback' }` | fallback |
| 13 | 性能：规则分类 < 5ms | "修改文件" | `elapsedMs < 5` | rule |
| 14 | 中英文混合 | "update 这个 file" | `{ intent: 'edit_file', confidence: 0.95 }` | rule |

Mock 策略：
- `AiGatewayClient` 使用 jest mock，`createSession()` 返回 mock session
- `MemoryManager` 不涉及（trace 由 orchestrator 层调用）
- LLM 超时通过 mock `AbortController` + 延迟模拟

### 9.3 ToolScopeManager 测试用例

**文件**：`tests/harness/tool-scope.test.ts`

| # | 测试名 | 前置条件 | 操作 | 期望输出 |
|---|--------|---------|------|---------|
| 1 | chat intent → 3 个工具 | 注册 8 个内置工具，classifier mock 返回 chat | `select(request)` | `tools` 包含 reference_file, search, skill_activate |
| 2 | edit_file intent → 4 个工具 | classifier mock 返回 edit_file | `select(request)` | `tools` 包含 reference_file, diff_write, search, spec_lookup |
| 3 | analyze intent → 4 个工具 | classifier mock 返回 analyze | `select(request)` | `tools` 包含 reference_file, search, memory_query, graph_traverse |
| 4 | 用户显式调用 diff_write 在 chat 模式 | classifier mock 返回 chat，request.explicitTools=['diff_write'] | `select(request)` | `tools` 包含 reference_file, search, skill_activate + diff_write，`explicitOverrides=['diff_write']` |
| 5 | 未知 intent → chat profile | classifier mock 返回 'unknown'（非法值） | `select(request)` | fallback 到 chat profile |
| 6 | 工具超过 maxTools → 裁剪 | chat profile maxTools=5，注册 5+ 工具 | `select(request)` | `tools.length <= 5` |
| 7 | getToolError 格式化 | - | `getToolError('diff_write', [ref, search])` | 包含 "tool not available" 和可用工具名 |
| 8 | registerTool 注册 | - | `registerTool(newTool)` | `getToolById(newTool.id)` 返回 newTool |
| 9 | unregisterTool 注销 | 注册后 | `unregisterTool(id)` | `getToolById(id)` 返回 undefined |
| 10 | 重复注册覆盖 | 已有 id | `registerTool(sameIdDifferentDef)` | 日志 warn，registry 中为新定义 |
| 11 | 注册表中不存在的 tool id | chat profile 引用不存在的 id | `select(request)` | 跳过该 id，不报错 |
| 12 | search intent → 2 个工具 | classifier mock 返回 search | `select(request)` | `tools` 包含 search, reference_file |

Mock 策略：
- `IntentClassifier` 使用 jest mock，直接返回指定 `ClassifyResult`
- 8 个内置工具使用简化版 `ToolDefinition`（handler 为空函数）
- `Logger` 使用 jest mock

### 9.4 测试覆盖率目标

- `intent-classifier.ts`：≥ 90%（规则引擎 + LLM 兜底 + 解析逻辑）
- `tool-scope.ts`：≥ 90%（选择逻辑 + 注册表管理 + 错误消息）
- `built-in-tools.ts`：≥ 80%（注册函数覆盖）

---

## 十、执行步骤

### 阶段 1：类型与核心定义（~0.5 天）

| 步骤 | 产出 | 文件 |
|------|------|------|
| 1.1 | 定义 `HarnessIntent`、`ToolDefinition`、`ToolContext`、`IntentProfile`、`INTENT_PROFILES`、`TOOL_NOT_AVAILABLE_MESSAGE` | `src/main/services/harness/tool-scope.ts` |
| 1.2 | 定义 `ClassifyResult`、`ClassifierConfig`、`DEFAULT_CLASSIFIER_CONFIG` | `src/main/services/harness/intent-classifier.ts` |
| 1.3 | 定义 `ToolSelection` | `src/main/services/harness/tool-scope.ts` |
| 1.4 | 追加 `ToolSummary`、`IntentProfileSummary`、`ToolDefinitionSummary` 类型 + IPC 通道常量 | `src/shared/types.ts` |
| 1.5 | 运行 `npm run typecheck` 验证类型一致性 | - |

### 阶段 2：IntentClassifier 实现（~0.5 天）

| 步骤 | 产出 | 文件 |
|------|------|------|
| 2.1 | 实现 `IntentClassifier` 类骨架 + `classify()` 主方法 | `src/main/services/harness/intent-classifier.ts` |
| 2.2 | 实现 `ruleBasedClassify()` — 中英文双语关键词匹配 | 同上 |
| 2.3 | 实现 `llmClassify()` — LLM 兜底 + 超时 + fallback | 同上 |
| 2.4 | 实现 `formatLlmPrompt()` + `parseLlmResponse()` | 同上 |
| 2.5 | 实现 `CLASSIFIER_SYSTEM_PROMPT` 常量 | 同上 |
| 2.6 | 运行 `npm run typecheck` 验证 | - |

### 阶段 3：ToolScopeManager 实现（~0.5 天）

| 步骤 | 产出 | 文件 |
|------|------|------|
| 3.1 | 实现 `ToolScopeManager` 类骨架 + 构造函数 | `src/main/services/harness/tool-scope.ts` |
| 3.2 | 实现 `select()` 主方法 — 分类 + profile 查找 + 工具解析 + 裁剪 + 显式覆盖 | 同上 |
| 3.3 | 实现 `getToolError()` — 格式化错误消息 | 同上 |
| 3.4 | 实现 `registerTool()`、`unregisterTool()`、`getRegisteredTools()`、`getToolById()` | 同上 |
| 3.5 | 运行 `npm run typecheck` 验证 | - |

### 阶段 4：内置工具注册（~0.3 天）

| 步骤 | 产出 | 文件 |
|------|------|------|
| 4.1 | 实现 `registerBuiltInTools()` 函数 | `src/main/services/harness/built-in-tools.ts` |
| 4.2 | 定义 8 个 `ToolDefinition` 常量（含 schema、tags、placeholder handler） | 同上 |
| 4.3 | 运行 `npm run typecheck` 验证 | - |

### 阶段 5：集成改造（~0.5 天）

| 步骤 | 产出 | 文件 |
|------|------|------|
| 5.1 | `HarnessOrchestrator` 追加 `setToolScopeManager()` + `execute()` 中调用 `select()` | `src/main/services/harness/orchestrator.ts` |
| 5.2 | `execute()` 中追加 `edit_file → modify_file` 兼容映射 | 同上 |
| 5.3 | `execute()` 中追加工具子集注入 `context.toolDefinitions` | 同上 |
| 5.4 | `HarnessHandler` 追加 3 个 Tool scope IPC handler | `src/main/ipc/handlers/harness.ts` |
| 5.5 | `main/index.ts` 追加 IntentClassifier + ToolScopeManager 初始化 | `src/main/index.ts` |
| 5.6 | `AssembledContext` 追加 `toolDefinitions` 可选字段 | `src/shared/types.ts` |
| 5.7 | `harness/index.ts` 追加新模块导出 | `src/main/services/harness/index.ts` |
| 5.8 | 运行 `npm run typecheck` 验证 | - |

### 阶段 6：单元测试（~0.5 天）

| 步骤 | 产出 | 文件 |
|------|------|------|
| 6.1 | `intent-classifier.test.ts` — 14 个测试用例 | `tests/harness/intent-classifier.test.ts` |
| 6.2 | `tool-scope.test.ts` — 12 个测试用例 | `tests/harness/tool-scope.test.ts` |
| 6.3 | 运行 `npm run test` 确保全部通过 | - |
| 6.4 | 检查覆盖率达标 | - |

### 阶段 7：最终验证（~0.2 天）

| 步骤 | 产出 | 文件 |
|------|------|------|
| 7.1 | `npm run typecheck` 通过 | - |
| 7.2 | `npm run lint` 通过 | - |
| 7.3 | `npm run test` 通过 | - |
| 7.4 | 更新任务状态为已完成 | `specs/tasks/.../task-list.md` |

---

## 十一、验收检查清单

### 功能验收

- [ ] 请求到达时，系统将意图分类为 {chat, edit_file, analyze, plan, search} 之一
- [ ] 意图为 `chat` 时，暴露工具：[reference_file, search, skill_activate]
- [ ] 意图为 `edit_file` 时，暴露工具：[reference_file, diff_write, search, spec_lookup]
- [ ] 意图为 `analyze` 时，暴露工具：[reference_file, search, memory_query, graph_traverse]
- [ ] 工具数超过 profile.maxTools 时，执行裁剪
- [ ] AI 尝试调用不在当前子集中的工具时，返回错误："tool not available in this context"并列出可用替代
- [ ] 意图分类模糊时，默认选择最宽松的 profile（chat）
- [ ] 用户通过 UI 按钮显式调用工具时，无视意图限制直接加入当前范围
- [ ] 意图分类 95% 由规则完成（< 5ms），仅 5% 兜底走轻量 LLM
- [ ] `IntentClassifier` 的结果传入 `HarnessOrchestrator.execute()`

### 集成验收

- [ ] `orchestrator.ts` 的 `setToolScopeManager()` 注入正确
- [ ] `execute()` 中调用 `toolScopeManager.select()` 并将 intent 回写 request
- [ ] `execute()` 中 `edit_file → modify_file` 兼容映射生效
- [ ] 工具子集信息传入 context（`context.toolDefinitions`）
- [ ] `harness.ts` IPC handler 可查询 Tool scope 和 Intent profiles
- [ ] `main/index.ts` 初始化链路正确：IntentClassifier → ToolScopeManager → registerBuiltInTools → 注入 Orchestrator

### 降级验收

- [ ] LLM 兜底超时 → fallback chat
- [ ] LLM 返回无效 intent → fallback chat
- [ ] IntentProfile 未找到 → fallback chat profile
- [ ] 注册表中不存在的 tool id → 跳过，不报错

### 性能验收

- [ ] 规则分类 < 5ms
- [ ] LLM 兜底 < 3 秒（含超时保护）

### 类型验收

- [ ] `npm run typecheck` 零错误
- [ ] `npm run lint` 零错误
- [ ] `npm run test` 全部通过
- [ ] 测试覆盖率 ≥ 80%

---

## 十二、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 规则匹配误分类（如"搜索文件并修改"同时命中 search 和 edit_file） | 中 | 中 | 规则按优先级排序（edit_file > analyze > plan > search > chat），首个命中即返回；复杂意图走 LLM 兜底 |
| LLM 兜底增加延迟 | 低 | 低 | 3 秒超时 + fallback chat，仅 ~5% 请求触发 |
| 工具裁剪导致必要工具缺失 | 低 | 中 | 用户显式调用覆盖机制 + chat 作为最宽松 fallback + maxTools 上限宽松 |
| 工具 handler placeholder 未替换 | 中 | 低 | 日志记录 + 后续迭代替换为实际服务调用 |
| `edit_file` 与 `modify_file` 映射遗漏 | 低 | 中 | 在 orchestrator 层集中处理映射，单点维护 |

---

**创建时间：** 2026-04-20
**最后更新：** 2026-04-20
