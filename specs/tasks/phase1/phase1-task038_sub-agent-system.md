# Sub-agent 独立循环系统

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK038 |
| **任务标题** | Sub-agent 独立循环系统 |
| **所属阶段** | Phase 1 - AI 能力扩展体系 (Sprint 3.5) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

构建 Sub-agent 独立循环系统——让主 agent 能通过 `spawnSubAgent` 工具启动一个拥有独立对话上下文、独立工具白名单、独立记忆视角、独立 Trace 嵌套的子智能体。Sub-agent 返回结构化结果（符合 JSON Schema 约束），汇总回主对话，不污染主 agent 上下文。

### 背景

Sprint 3.0-3.4 建立了完整的单 agent 体系：对话、Harness、记忆、Trace、模式。但单一 agent 有其局限：

- **上下文污染**：长审查报告让主对话变得杂乱
- **工具权限粒度不够**：审查只需读工具，不需要写工具
- **并行度低**：多个独立任务只能串行处理
- **输出格式约束弱**：期望 JSON 结构化结果，但主 agent 输出自由

Sub-agent 是 Sprint 3.5 四层扩展模型的第 3 层，与 Skill 的本质区别在于：Skill 是"能力注入"（在同一主循环中增强上下文），Sub-agent 是"能力外包"（启动独立循环，返回结果）。

**核心设计约束（来自附录 A §17A.6）**：

- Sub-agent **复用现有 Generator + GuardrailEngine**，不引入 "QueryEngine" 概念
- Sub-agent 内部创建独立的 ContextEngine 实例、独立 Generator 实例（通过 AiGatewaySession）
- Sub-agent loop = Generator + GuardrailEngine 的简化循环（非完整 HarnessOrchestrator）
- 主循环通过 `spawnSubAgent` 工具触发，等待结构化结果返回
- Sub-agent 默认的 `allowed_tools` **不包含** `spawnSubAgent`（防止无限递归，深度上限 3）
- Sub-agent 的写操作仍走 GuardrailEngine 审批（不可跳过）

### 范围

**包含：**

- SubAgentDefinition 类型 — 子智能体定义（Markdown + YAML frontmatter）
- SubAgentRegistry — 子智能体注册与查询
- SubAgentExecutor — 独立循环执行器
- SubAgentContext — 独立上下文构建（独立 Generator、独立 ContextEngine、独立 GuardrailEngine）
- spawnSubAgent 工具 — 主 agent 的工具注册
- 结构化输出约束 — JSON Schema 校验 + 重试
- 5 个内置 Sub-agent 资源文件（pr-reviewer、doc-summarizer、meeting-note-writer、spec-reviewer、memory-curator）
- 并发控制 — 同一主 agent 最多 3 个活跃 Sub-agent
- 优雅退出 — 主 agent abort 时 Sub-agent 5 秒内退出
- IPC 通道（sub-agent:list / sub-agent:create / sub-agent:trace）
- Trace 嵌套 — Sub-agent 的 Trace 通过 parent_trace_id 嵌套
- 单元测试

**不包含：**

- Agent 间 P2P 通信（明确不做）
- MCP Server 集成
- Sub-agent 内部的 Hook 支持（TASK036 扩展）
- Workflow 编排（TASK039）

## 依赖关系

### 前置依赖

- [x] TASK035 — Prompt 库基础设施（PromptComposer 已可用，Sub-agent prompt 通过其加载）
- [x] TASK017 — Guardrails（GuardrailEngine 已可用，Sub-agent 权限边界检查）
- [x] TASK018 — Generator（Generator 已可用，Sub-agent 复用）
- [x] TASK027 — Tracer SDK（Trace 嵌套）

### 被依赖任务

- TASK039 — Workflow 自动化（Workflow 可调用 Sub-agent）

## 参考文档

- [`specs/requirements/phase1/sprint3.5-ai_ablities.md`](../../requirements/phase1/sprint3.5-ai_ablities.md) — 需求 3.5.4（§5.4）、§4.4、§17A.6
- [`specs/design/architecture.md`](../../design/architecture.md) — 进程通信架构
- [`CLAUDE.md`](../../../CLAUDE.md) — 设计哲学、个人空间隔离、AI 建议/人类决策
- `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` — TypeScript 严格模式
- `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` — IPC 类型安全设计

## 验收标准

### Sub-agent 定义与注册

- [ ] Sub-agent 定义使用 Markdown + YAML frontmatter 格式
- [ ] Frontmatter 包含必填字段：id、version、name、description、allowed_tools、max_turns、max_tokens
- [ ] Frontmatter 可选字段：model、context（inherit_memory / inherit_trace / inherit_workspace_boundary）、output_schema
- [ ] SubAgentRegistry 启动时扫描内置目录（`resources/prompts/agents/`）和工作区目录（`.sibylla/agents/`）
- [ ] 用户自建 Sub-agent 与内置同 id 时，用户版本优先

### 独立上下文隔离

- [ ] 每个 Sub-agent 拥有独立的 messages 数组（不继承主 agent 对话历史）
- [ ] 每个 Sub-agent 拥有独立的 ContextEngine 实例（独立的 PromptComposer 调用）
- [ ] 每个 Sub-agent 拥有独立的 Generator 实例（独立的 AiGatewaySession）
- [ ] `context.inherit_memory: false` 时，Sub-agent 不加载主 agent 的 MEMORY.md
- [ ] 每个 Sub-agent 拥有独立的 FileStateCache（重新建立，不继承）
- [ ] 每个 Sub-agent 拥有独立的 Usage 记账（token 与成本单独记录）

### 权限边界

- [ ] Sub-agent 的 `allowed_tools` 必须是主 agent `allowedTools` 的子集（不能提权）
- [ ] Sub-agent 试图使用未在 `allowed_tools` 中声明的工具时被拒绝
- [ ] Sub-agent 默认的 `allowed_tools` 不包含 `spawnSubAgent`（防止无限递归）
- [ ] Sub-agent 的写操作仍走 GuardrailEngine 审批
- [ ] Sub-agent 不能访问工作区边界之外的目录
- [ ] Sub-agent 访问非本人 `personal/{name}/` 时被拒绝并记录安全日志

### 执行控制

- [ ] Sub-agent 超过 `max_turns` 时中止，返回部分结果
- [ ] Sub-agent 超过 `max_tokens` 时中止，返回部分结果
- [ ] Sub-agent 超过 `timeout`（秒）时中止
- [ ] 同一主 agent 已有 3 个活跃 Sub-agent 时，第 4 个排队等待
- [ ] 主 agent 被 abort 时，所有活跃 Sub-agent 在 5 秒内优雅退出
- [ ] Sub-agent 嵌套调用深度不超过 3 层

### 结构化输出

- [ ] Sub-agent 定义了 `output_schema` 时，最终结果必须通过 JSON Schema 校验
- [ ] 校验失败时触发最多 2 次重试（追加 meta 消息让模型修正）
- [ ] 2 次重试仍失败则返回 `success: false` + 非结构化 summary（graceful degradation）

### Trace 嵌套

- [ ] Sub-agent 的 Trace 通过 `parent_trace_id` 建立父子关系
- [ ] Sprint 3.3 的 Trace Viewer 支持点击展开子 Trace
- [ ] Sub-agent 内部的 Generator 调用、工具调用均在子 Trace 中

### spawnSubAgent 工具

- [ ] `spawnSubAgent` 工具注册到主 agent 的工具列表
- [ ] 参数：agentId（必填）、task（必填）、params（可选）、timeout（可选，默认 600 秒）
- [ ] 返回结构化结果：success、structuredOutput、summary、turnsUsed、tokensUsed、traceId、errors

### 内置 Sub-agent

- [ ] 5 个内置 Sub-agent 创建：pr-reviewer、doc-summarizer、meeting-note-writer、spec-reviewer、memory-curator
- [ ] 每个 Sub-agent 包含完整的定义（frontmatter + prompt body）

### IPC 集成

- [ ] `sub-agent:list` 返回所有已注册 Sub-agent 元数据
- [ ] `sub-agent:create` 从模板创建自定义 Sub-agent
- [ ] `sub-agent:trace` 查询子 Trace 详情

### 向后兼容

- [ ] 主 agent 的工具列表新增 `spawnSubAgent`，不影响现有工具
- [ ] Sub-agent 系统完全增量，不修改任何现有模块的代码

## 技术执行路径

### 架构设计

```
Sub-agent 系统整体架构

sibylla-desktop/resources/prompts/agents/       ← 内置 Sub-agent 定义
├── pr-reviewer.md
├── doc-summarizer.md
├── meeting-note-writer.md
├── spec-reviewer.md
└── memory-curator.md

{workspace}/.sibylla/agents/                     ← 用户自建 Sub-agent
└── {agent-name}.md

sibylla-desktop/src/main/services/sub-agent/     ← 新增目录
├── SubAgentRegistry.ts                          ← 子智能体注册与查询
├── SubAgentExecutor.ts                          ← 独立循环执行器
├── SubAgentContext.ts                           ← 独立上下文构建
├── spawnSubAgentTool.ts                         ← spawnSubAgent 工具定义
├── types.ts                                     ← SubAgentDefinition / SubAgentResult 等
└── index.ts

Sub-agent 执行隔离模型：

主 Agent                              Sub-agent（独立循环）
│                                      │
│ tool_use: spawnSubAgent              │
│   agentId: "pr-reviewer"            │
│   task: "审查 PR-123"               │
│   ─────────────────────────────────▶│
│                                      │ 1. 加载 agent prompt（从 PromptComposer）
│                                      │ 2. 创建独立 ContextEngine
│                                      │ 3. 创建独立 Generator + AiGatewaySession
│                                      │ 4. 独立 loop:
│                                      │    ├─ Generator.chat(messages)
│                                      │    ├─ 工具调用（受限集 + Guardrail 审批）
│                                      │    ├─ 检查 max_turns / max_tokens
│                                      │    └─ 循环至 completed / 超出限制
│                                      │
│                                      │ 5. 提取结构化输出（output_schema 校验）
│ tool_result: {                      ◀│
│   success: true,                     │
│   structuredOutput: { findings },    │
│   summary: "...",                    │
│   turnsUsed: 5,                      │
│   tokensUsed: 12345,                 │
│   traceId: "sub-trace-xxx",          │
│   errors: []                         │
│ }                                    │
│                                      ▼
│ 继续主循环

Sub-agent 循环伪代码：

async SubAgentExecutor.run():
  context = SubAgentContext.create(agent, parentContext)
  messages = [systemPrompt, userMessage(task)]
  
  for turn in 1..agent.maxTurns:
    response = generator.chat(messages)
    messages.push(response)
    
    if response.stop_reason == 'end_turn':
      break
    
    for toolCall in response.tool_calls:
      // Guardrail 检查
      assessment = guardrail.check(toolCall)
      if assessment.blocked:
        messages.push(toolResult(blocked))
        continue
      
      // 执行工具
      result = await executeTool(toolCall)
      messages.push(toolResult(result))
    
    // Token 预算检查
    if totalTokens > agent.maxTokens:
      break
  
  // 提取结构化输出
  if agent.output_schema:
    output = extractStructuredOutput(messages, agent.output_schema)
  else:
    output = { summary: lastAssistantMessage }
  
  return SubAgentResult
```

### 步骤 1：定义 Sub-agent 共享类型

**文件：** `src/shared/types.ts`（扩展）

1. 新增 Sub-agent 类型：
   ```typescript
   export interface SubAgentDefinition {
     id: string
     version: string
     name: string
     description: string
     model?: string
     allowedTools: string[]
     context: SubAgentContextConfig
     maxTurns: number
     maxTokens: number
     outputSchema?: Record<string, unknown>  // JSON Schema
     builtin: boolean
     filePath: string
   }

   export interface SubAgentContextConfig {
     inheritMemory: boolean
     inheritTrace: boolean
     inheritWorkspaceBoundary: boolean
   }

   export interface SubAgentResult {
     success: boolean
     structuredOutput?: Record<string, unknown>
     summary: string
     turnsUsed: number
     tokensUsed: number
     traceId: string
     errors: string[]
   }

   export interface SubAgentMetadata {
     id: string
     version: string
     name: string
     description: string
     model?: string
     allowedTools: string[]
     maxTurns: number
     maxTokens: number
     hasOutputSchema: boolean
     source: 'builtin' | 'workspace'
   }
   ```

2. 新增 IPC 通道常量：
   ```typescript
   'sub-agent:list': 'sub-agent:list',
   'sub-agent:create': 'sub-agent:create',
   'sub-agent:trace': 'sub-agent:trace',
   ```

**验证：** TypeScript 编译通过。

### 步骤 2：实现 SubAgentRegistry

**文件：** `src/main/services/sub-agent/SubAgentRegistry.ts`

1. 内部数据结构：
   ```typescript
   private agents = new Map<string, SubAgentDefinition>()
   ```

2. 构造函数：
   ```typescript
   constructor(
     private readonly builtinDir: string,    // resources/prompts/agents/
     private readonly workspaceDir: string | null,  // .sibylla/agents/
     private readonly promptComposer: PromptComposer,
   ) {}
   ```

3. 实现 `async initialize(): Promise<void>`：
   - 扫描 `builtinDir` 下所有 `.md` 文件
   - 解析每个文件的 YAML frontmatter
   - 构建 SubAgentDefinition（frontmatter 字段 + body 作为 system prompt）
   - 扫描 `workspaceDir`（如存在），用户定义覆盖内置
   - 验证 `allowedTools` 合法性
   - 注册到 agents Map

4. 实现 `get(id: string): SubAgentDefinition | undefined`

5. 实现 `getAll(): SubAgentMetadata[]`

6. 实现 `async loadAgentPrompt(agentId: string): Promise<string>`：
   - 通过 PromptComposer 加载 `agents.{agentId}` prompt 文件
   - 如 PromptComposer 不可用，直接读取 Markdown body

7. 实现 `async createFromTemplate(template: SubAgentTemplate): Promise<{ agentId: string }>`：
   - 创建 Markdown 文件到 `.sibylla/agents/`
   - 注册到 agents Map

**验证：**
- initialize() 正确加载所有内置 Sub-agent
- 用户定义覆盖内置
- getAll() 返回完整列表

### 步骤 3：实现 SubAgentContext

**文件：** `src/main/services/sub-agent/SubAgentContext.ts`

为每个 Sub-agent 实例创建独立的执行上下文。

1. 定义 SubAgentContext：
   ```typescript
   export class SubAgentContext {
     readonly agent: SubAgentDefinition
     readonly task: string
     readonly params: Record<string, unknown>
     readonly parentTraceId: string
     readonly allowedTools: string[]
     readonly timeoutMs: number
     readonly generator: Generator
     readonly guardrailEngine: GuardrailEngine
     readonly systemPrompt: string
     readonly messages: Array<{ role: string; content: string }> = []
     readonly usage: { totalTokens: number; totalCost: number } = { totalTokens: 0, totalCost: 0 }
     readonly abortController: AbortController
     readonly startedAt: number

     private constructor(data: SubAgentContextData) { /* ... */ }
   ```

2. 实现 `static async create(opts: SubAgentContextOptions): Promise<SubAgentContext>`：
   ```
   a. 创建独立的 AiGatewaySession：
      session = gateway.createSession({ role: 'sub-agent' })

   b. 创建独立的 Generator：
      generator = new Generator(gateway, agent.model ?? defaultModel, logger)

   c. 创建独立的 GuardrailEngine（复用配置但独立实例）：
      guardrail = new GuardrailEngine(/* minimal config */)

   d. 加载 agent prompt：
      systemPrompt = await registry.loadAgentPrompt(agent.id)

   e. 计算允许的工具集：
      allowedTools = intersect(parentAllowedTools, agent.allowedTools)
      // 确保不包含 spawnSubAgent（除非显式声明且嵌套深度 < 3）

   f. 初始化 messages：
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: task }
      ]

   g. 创建 AbortController：
      abortController = new AbortController()
   ```

3. 权限边界硬性约束（在 create 中强制执行）：
   - `allowedTools` = 主 agent 工具 ∩ Sub-agent 声明的工具
   - 结果长度 < Sub-agent 声明长度 → 记录 warning（说明部分工具被裁剪）
   - 不包含 `spawnSubAgent`（除非显式声明且嵌套深度检查通过）
   - 工作区边界约束继承

4. 实现 `addMessage(role: string, content: string): void`
5. 实现 `addUsage(tokens: number, cost: number): void`
6. 实现 `isAborted(): boolean`
7. 实现 `getElapsedMs(): number`

**验证：**
- 独立的 Generator / GuardrailEngine / messages
- 工具集正确裁剪（交集）
- spawnSubAgent 默认不包含

### 步骤 4：实现 SubAgentExecutor

**文件：** `src/main/services/sub-agent/SubAgentExecutor.ts`

Sub-agent 的核心执行循环。

1. 构造函数：
   ```typescript
   export class SubAgentExecutor {
     private static readonly MAX_RETRIES = 2
     private static readonly MAX_CONCURRENT = 3
     private static readonly GRACEFUL_EXIT_MS = 5000
     private activeCount = 0
     private pendingQueue: Array<() => void> = []

     constructor(
       private readonly gateway: AiGatewayClient,
       private readonly defaultModel: string,
       private readonly tracer?: Tracer,
     ) {}
   ```

2. 实现 `async run(opts: SubAgentRunOptions): Promise<SubAgentResult>`：
   ```
   a. 并发控制：
      if activeCount >= MAX_CONCURRENT:
        await waitForSlot()  // 排队等待

   b. 创建上下文：
      ctx = await SubAgentContext.create(opts)

   c. 包裹在 Trace span 中：
      tracer.withSpan('sub-agent.run', async (span) => {
        span.setAttribute('agent.id', agent.id)
        span.setAttribute('parent_trace_id', parentTraceId)

        d. 执行循环：
           for turn in 1..agent.maxTurns:
             // 检查 abort
             if ctx.isAborted(): break

             // 检查超时
             if ctx.getElapsedMs() > timeoutMs: break

             // Generator 调用
             response = await ctx.generator.chat({
               messages: ctx.messages,
               maxTokens: remainingTokens,
             })

             ctx.addUsage(response.usage)
             ctx.addMessage('assistant', response.content)

             // 检查 stop_reason
             if response.stop_reason == 'end_turn': break

             // 处理工具调用
             for toolCall in response.tool_calls:
               // Guardrail 检查
               assessment = ctx.guardrailEngine.check(toolCall)
               if assessment.blocked:
                 ctx.addMessage('tool', blockedMessage)
                 continue

               // 执行工具
               result = await executeTool(toolCall, ctx)
               ctx.addMessage('tool', result)

             // Token 预算检查
             if ctx.usage.totalTokens > agent.maxTokens: break

        e. 提取结构化输出：
           if agent.outputSchema:
             output = extractStructuredOutput(ctx.messages, agent.outputSchema)
           else:
             output = { summary: lastAssistantContent }

        f. 组装结果：
           return {
             success: true,
             structuredOutput: output,
             summary: output.summary ?? lastAssistantContent,
             turnsUsed: turn,
             tokensUsed: ctx.usage.totalTokens,
             traceId: span.context.traceId,
             errors: [],
           }
      })
   ```

3. 实现 `private extractStructuredOutput(messages, schema): Promise<Record<string, unknown>>`：
   - 从最后一条 assistant 消息提取 JSON（代码块 `\`\`\`json ... \`\`\`` 或纯 JSON）
   - 使用 JSON Schema 校验
   - 校验失败 → 追加 meta 消息让模型修正，重试最多 2 次
   - 仍失败 → 返回 `{ summary: lastAssistantContent }` + `success: false`

4. 实现 `async gracefulAbort(): Promise<void>`：
   - 对所有活跃 Sub-agent 的 AbortController 发出 abort
   - 等待最多 5 秒
   - 超时后强制结束

5. 并发控制实现：
   ```typescript
   private async waitForSlot(): Promise<void> {
     return new Promise((resolve) => {
       this.pendingQueue.push(resolve)
     })
   }

   private releaseSlot(): void {
     this.activeCount--
     const next = this.pendingQueue.shift()
     if (next) {
       this.activeCount++
       next()
     }
   }
   ```

**验证：**
- 独立循环正确执行
- max_turns 限制生效
- max_tokens 限制生效
- timeout 生效
- 并发上限 3 个
- abort 后 5 秒内退出
- 结构化输出校验 + 重试

### 步骤 5：实现 spawnSubAgent 工具

**文件：** `src/main/services/sub-agent/spawnSubAgentTool.ts`

1. 工具定义（遵循现有 built-in-tools.ts 格式）：
   ```typescript
   export const SPAWN_SUB_AGENT_TOOL = {
     id: 'spawnSubAgent',
     name: 'spawnSubAgent',
     description: '启动一个子智能体处理特定任务。子智能体拥有独立的对话上下文和工具权限，不污染当前对话。',
     schema: {
       type: 'object',
       required: ['agentId', 'task'],
       properties: {
         agentId: {
           type: 'string',
           description: '子智能体 ID（如 pr-reviewer）',
         },
         task: {
           type: 'string',
           description: '委派给子智能体的任务描述',
         },
         params: {
           type: 'object',
           description: '子智能体的自定义参数（可选）',
         },
         timeout: {
           type: 'integer',
           description: '超时时间（秒），默认 600',
           default: 600,
         },
       },
     },
   }
   ```

2. 执行函数：
   ```typescript
   export async function executeSpawnSubAgent(
     args: { agentId: string; task: string; params?: Record<string, unknown>; timeout?: number },
     context: {
       subAgentRegistry: SubAgentRegistry
       subAgentExecutor: SubAgentExecutor
       parentAllowedTools: string[]
       parentTraceId: string
     },
   ): Promise<SubAgentResult> {
     // 1. 验证 agent 存在
     const agent = context.subAgentRegistry.get(args.agentId)
     if (!agent) {
       return { success: false, summary: '', turnsUsed: 0, tokensUsed: 0, traceId: '', errors: [`未找到智能体：${args.agentId}`] }
     }

     // 2. 执行
     const result = await context.subAgentExecutor.run({
       agent,
       task: args.task,
       params: args.params ?? {},
       parentTraceId: context.parentTraceId,
       parentAllowedTools: context.parentAllowedTools,
       timeoutMs: (args.timeout ?? 600) * 1000,
     })

     return result
   }
   ```

3. 注册到 HarnessOrchestrator 的工具列表：
   - 在 `built-in-tools.ts` 或工具注册入口新增 `spawnSubAgent`
   - 工具的 execute 函数绑定到 SubAgentExecutor

**验证：**
- 工具定义格式正确
- 从主 agent 调用 `spawnSubAgent` 返回结构化结果
- 不存在的 agentId 返回错误

### 步骤 6：创建内置 Sub-agent 资源文件 + IPC + 装配

**目录：** `sibylla-desktop/resources/prompts/agents/`

1. 创建 5 个内置 Sub-agent 定义文件：

   **pr-reviewer.md**（PR 审查员）：
   ```markdown
   ---
   id: pr-reviewer
   version: 1.0.0
   name: PR 审查员
   description: 专门审查 Pull Request 的子智能体
   model: claude-sonnet-4-20250514
   allowed_tools:
     - read-file
     - search
     - list-files
   context:
     inherit_memory: false
     inherit_trace: true
     inherit_workspace_boundary: true
   max_turns: 15
   max_tokens: 50000
   output_schema:
     type: object
     required: [summary, findings]
     properties:
       summary:
         type: string
       findings:
         type: array
         items:
           type: object
           required: [severity, file, line, message]
           properties:
             severity:
               enum: [critical, major, minor, info]
             file: { type: string }
             line: { type: integer }
             message: { type: string }
   ---

   # PR 审查员

   你是一位专业、严格、友善的代码审查员。

   ## 审查流程
   1. 读取变更：使用 read-file 读取被审查的文件
   2. 对比基线：理解本次变更的差异
   3. 结构化检查：
      - [ ] 代码风格：缩进、命名、注释
      - [ ] 逻辑正确性：边界条件、空值处理
      - [ ] 错误处理：异常捕获、错误传播
      - [ ] 性能：明显的性能问题
      - [ ] 测试：是否有对应测试用例
   4. 按 output_schema 返回结构化结果

   ## 审查原则
   - 优先指出 critical 和 major 问题
   - 使用建设性语言
   ```

   **doc-summarizer.md**（文档摘要员）：
   - allowed_tools: [read-file, search, list-files]
   - max_turns: 10, max_tokens: 30000
   - output_schema: { summary, keyPoints, actionItems }

   **meeting-note-writer.md**（会议纪要员）：
   - allowed_tools: [read-file, write-file]
   - max_turns: 12, max_tokens: 40000
   - output_schema: { summary, decisions, actionItems, participants }

   **spec-reviewer.md**（规范审查员）：
   - allowed_tools: [read-file, search]
   - max_turns: 15, max_tokens: 50000
   - output_schema: { summary, issues, suggestions }

   **memory-curator.md**（记忆精选员）：
   - allowed_tools: [read-file, write-file, search]
   - max_turns: 10, max_tokens: 30000
   - output_schema: { extracted, categories }
   - inherit_memory: true（需要访问现有记忆）

**文件：** `src/main/ipc/handlers/sub-agent.ts`（新建）

2. 注册 `sub-agent:list` handler：
   - 返回 SubAgentRegistry.getAll()

3. 注册 `sub-agent:create` handler：
   - 创建 Markdown 文件到 `.sibylla/agents/`
   - 注册到 SubAgentRegistry

4. 注册 `sub-agent:trace` handler：
   - 查询 TraceStore 获取指定 traceId 的子 Trace 树
   - 返回 SubAgentTrace

**文件：** `src/preload/index.ts`（扩展）

5. 新增 `subAgent` 命名空间：
   ```typescript
   subAgent: {
     list: () => Promise<SubAgentMetadata[]>
     create: (template: SubAgentTemplate) => Promise<{ agentId: string }>
     trace: (traceId: string) => Promise<SubAgentTrace>
   }
   ```

**文件：** 主进程初始化入口

6. 装配顺序：
   ```
   a. SubAgentRegistry(builtinDir, workspaceDir, promptComposer)
   b. await SubAgentRegistry.initialize()
   c. SubAgentExecutor(gateway, defaultModel, tracer)
   d. 注册 SPAWN_SUB_AGENT_TOOL 到工具列表
   e. 注册 sub-agent IPC handler
   ```

**验证：** 应用启动后 Sub-agent 列表可通过 IPC 查询，spawnSubAgent 工具可用。

### 步骤 7：单元测试

**文件：** `tests/main/services/sub-agent/`

1. `sub-agent-registry.test.ts` 测试用例：
   - initialize() 正确加载所有内置 Sub-agent
   - 用户定义覆盖内置
   - get(id) 返回正确的 SubAgentDefinition
   - getAll() 返回完整元数据
   - loadAgentPrompt() 返回 prompt 文本

2. `sub-agent-context.test.ts` 测试用例：
   - 独立 Generator 实例创建
   - 独立 GuardrailEngine 实例创建
   - allowed_tools 正确裁剪（交集）
   - spawnSubAgent 默认不包含
   - inherit_memory: false 时不加载 MEMORY.md
   - 工作区边界约束继承

3. `sub-agent-executor.test.ts` 测试用例：
   - 独立循环执行，返回结构化结果
   - max_turns 限制：超出时返回部分结果
   - max_tokens 限制：超出时返回部分结果
   - timeout 限制：超时时中止
   - 并发控制：第 4 个排队等待
   - abort 优雅退出：5 秒内完成
   - 嵌套深度限制：深度 ≥ 3 时拒绝

4. `structured-output.test.ts` 测试用例：
   - JSON 代码块正确提取
   - JSON Schema 校验通过
   - 校验失败触发重试
   - 2 次重试仍失败返回 graceful degradation

5. `spawn-sub-agent-tool.test.ts` 测试用例：
   - agentId 存在时正确执行
   - agentId 不存在时返回错误
   - 参数传递正确

6. `permission-boundary.test.ts` 测试用例：
   - Sub-agent 试图使用未声明工具时被拒绝
   - Sub-agent 访问非本人 personal 目录时被拒绝
   - 写操作仍走 Guardrail 审批

**覆盖率目标：** ≥ 80%（P0 要求）

## 现有代码基础

| 已有模块 | 文件路径 | 行数 | 本任务使用方式 |
|---------|---------|------|-------------|
| Generator | `harness/generator.ts` | 130 | Sub-agent 复用（创建独立实例） |
| GuardrailEngine | `harness/guardrails/engine.ts` | ~150 | Sub-agent 复用（创建独立实例） |
| AiGatewayClient | `ai-gateway-client.ts` | 82 | Sub-agent 通过其创建独立 session |
| PromptComposer | `context-engine/PromptComposer.ts` | — | Sub-agent 的 prompt 加载 |
| Tracer | `trace/tracer.ts` | — | Sub-agent Trace 嵌套 |
| ContextEngine | `context-engine/` | — | Sub-agent 创建独立实例 |

**完全缺失、需新建的模块：**

| 模块 | 说明 |
|------|------|
| `sub-agent/types.ts` | Sub-agent 类型定义 |
| `sub-agent/SubAgentRegistry.ts` | 子智能体注册 |
| `sub-agent/SubAgentExecutor.ts` | 独立循环执行器 |
| `sub-agent/SubAgentContext.ts` | 独立上下文构建 |
| `sub-agent/spawnSubAgentTool.ts` | spawnSubAgent 工具 |
| `sub-agent/index.ts` | 统一导出 |
| `resources/prompts/agents/`（5 文件） | 内置 Sub-agent 定义 |
| `ipc/handlers/sub-agent.ts` | Sub-agent IPC 通道 |

## 新增 IPC 通道

| IPC 通道 | 方向 | 说明 |
|---------|------|------|
| `sub-agent:list` | Renderer → Main | 列出所有 Sub-agent |
| `sub-agent:create` | Renderer → Main | 创建自定义 Sub-agent |
| `sub-agent:trace` | Renderer → Main | 查询子 Trace 详情 |

## 涉及的现有文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `shared/types.ts` | 扩展 | 新增 SubAgent* 类型 + IPC 通道常量 |
| `harness/built-in-tools.ts` | 扩展 | 注册 spawnSubAgent 工具 |
| `preload/index.ts` | 扩展 | 新增 subAgent 命名空间 |
| IPC 注册入口 | 扩展 | 注册 sub-agent handler |

注：Generator / GuardrailEngine / AiGatewayClient 的代码不做任何修改，仅通过创建新实例复用。
