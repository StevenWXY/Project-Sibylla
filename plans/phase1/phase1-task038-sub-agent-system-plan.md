# PHASE1-TASK038: Sub-agent 独立循环系统 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task038_sub-agent-system.md](../specs/tasks/phase1/phase1-task038_sub-agent-system.md)
> 创建日期：2026-04-23
> 最后更新：2026-04-23

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK038 |
| **任务标题** | Sub-agent 独立循环系统 |
| **所属阶段** | Phase 1 - AI 能力扩展体系 (Sprint 3.5) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | TASK035 (PromptComposer) + TASK017 (Guardrails) + TASK018 (Generator) + TASK027 (Tracer) |

### 1.1 目标

构建 Sub-agent 独立循环系统——让主 agent 能通过 `spawnSubAgent` 工具启动一个拥有独立对话上下文、独立工具白名单、独立记忆视角、独立 Trace 嵌套的子智能体。Sub-agent 返回结构化结果（符合 JSON Schema 约束），汇总回主对话，不污染主 agent 上下文。

Sub-agent 是 Sprint 3.5 四层扩展模型的第 3 层（Slash Command → Skill → **Sub-agent** → Workflow），与 Skill 的本质区别在于：Skill 是"能力注入"（在同一主循环中增强上下文），Sub-agent 是"能力外包"（启动独立循环，返回结果）。

### 1.2 核心设计约束

| 约束 | 来源 | 说明 |
|------|------|------|
| 复用 Generator + GuardrailEngine | sprint3.5 §17A.6 | Sub-agent 内部创建独立 Generator 和 GuardrailEngine 实例，不引入 "QueryEngine" 概念 |
| 独立 ContextEngine 实例 | sprint3.5 §17A.6 | 不继承主 agent 对话历史，独立 PromptComposer 调用 |
| 简化循环（非完整 HarnessOrchestrator） | sprint3.5 §17A.6 | Sub-agent loop = Generator + GuardrailEngine，不走完整的 execute → evaluate → refine 流程 |
| 权限不可提权 | sprint3.5 §4.4.3 | Sub-agent allowedTools 必须是主 agent allowedTools 的子集 |
| 默认不含 spawnSubAgent | task spec §验收标准 | 防止无限递归，嵌套深度上限 3 层 |
| 写操作仍走 GuardrailEngine 审批 | sprint3.5 §4.4.3 | Sub-agent 不可跳过护栏 |
| AI 建议/人类决策 | CLAUDE.md §二 | Sub-agent 写入仍经用户审批 |
| TS 严格模式禁止 any | CLAUDE.md §四 | 全部代码遵循 TypeScript 严格模式 |
| 主进程与渲染进程严格隔离 | CLAUDE.md §三 | 文件系统访问仅在主进程 |
| 完全增量 | task spec §向后兼容 | 不修改任何现有模块的代码 |

### 1.3 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| Sub-agent 共享类型 | `src/shared/types.ts`（扩展） | SubAgentDefinition / SubAgentResult / SubAgentMetadata 等 + IPC 通道常量 |
| SubAgentRegistry | `src/main/services/sub-agent/SubAgentRegistry.ts` | 子智能体注册与查询（双源扫描） |
| SubAgentContext | `src/main/services/sub-agent/SubAgentContext.ts` | 独立上下文构建（Generator + GuardrailEngine + messages） |
| SubAgentExecutor | `src/main/services/sub-agent/SubAgentExecutor.ts` | 独立循环执行器（核心循环 + 结构化输出 + 并发控制） |
| spawnSubAgentTool | `src/main/services/sub-agent/spawnSubAgentTool.ts` | 主 agent 工具定义 + 执行函数 |
| Sub-agent 内部类型 | `src/main/services/sub-agent/types.ts` | SubAgentRunOptions / SubAgentContextData 等内部接口 |
| 统一导出 | `src/main/services/sub-agent/index.ts` | 公共 API 导出 |
| 内置 Sub-agent 资源 | `resources/prompts/agents/*.md`（5 文件） | pr-reviewer / doc-summarizer / meeting-note-writer / spec-reviewer / memory-curator |
| IPC Handler | `src/main/ipc/handlers/sub-agent.ts` | sub-agent:list / sub-agent:create / sub-agent:trace |
| Preload API 扩展 | `src/preload/index.ts`（扩展） | subAgent 命名空间 |
| 单元测试 | `tests/main/services/sub-agent/*.test.ts` | 6 个测试文件，覆盖率 ≥ 80% |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；文件即真相；AI 建议/人类决策；主进程/渲染进程隔离；结构化日志；个人空间隔离 | 全局约束 |
| `specs/design/architecture.md` | 进程通信架构（IPC 隔离）；上下文引擎架构；ContextEngine 核心差异化组件 | 进程通信 + 上下文隔离 |
| `specs/design/data-and-api.md` | IPC 通道命名规范 `namespace:action`；IPCChannelMap 类型映射 | IPC 设计 |
| `specs/requirements/phase1/sprint3.5-ai_ablities.md` | §4.4 Sub-agent 系统（定义格式、spawnSubAgent 工具、执行隔离、结构化输出、内置清单）；§2.4 主 Agent 与 Sub-agent 消息流；附录 A §17A.6 | 验收标准 + 架构约束 |
| `specs/tasks/phase1/phase1-task038_sub-agent-system.md` | 7 步执行路径、完整验收标准、架构图、IPC 通道设计 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `typescript-strict-mode` | SubAgentDefinition / SubAgentResult 等严格类型设计；泛型 withSpan 嵌套；联合类型 | types.ts + 全部 TS 文件 |
| `electron-ipc-patterns` | IPC 通道类型安全注册；IPCChannelMap 扩展；Preload API 安全暴露 | shared/types.ts + ipc/handlers/sub-agent.ts + preload/index.ts |
| `ai-context-engine` | 独立 ContextEngine 实例创建策略；PromptComposer 子模块复用；Token 预算管理 | SubAgentContext.ts |

### 2.3 前置代码依赖

| 模块 | 文件路径 | 行数 | 复用方式 |
|------|---------|------|---------|
| `Generator` | `src/main/services/harness/generator.ts` | ~130 | Sub-agent 创建独立实例：`new Generator(gateway, model, logger)` |
| `AiGatewayClient` | `src/main/services/ai-gateway-client.ts` | ~82 | Sub-agent 通过 `gateway.createSession({ role: 'sub-agent' })` 创建独立 session |
| `GuardrailEngine` | `src/main/services/harness/guardrails/engine.ts` | ~150 | Sub-agent 创建独立实例：`new GuardrailEngine()` |
| `ContextEngine` | `src/main/services/context-engine/context-engine.ts` | — | Sub-agent 创建独立实例（加载 agent prompt，不继承主 agent 对话） |
| `PromptComposer` | `src/main/services/context-engine/PromptComposer.ts` | — | Sub-agent prompt 通过 `compose({ currentAgent: agentId })` 加载 |
| `PromptLoader` | `src/main/services/context-engine/PromptLoader.ts` | — | 加载 `agents.{agentId}` prompt 文件 |
| `Tracer` | `src/main/services/trace/tracer.ts` | — | Sub-agent Trace 嵌套：`startSpan('sub-agent.run', { parent })` |
| `TraceStore` | `src/main/services/trace/trace-store.ts` | — | 查询子 Trace 树用于 `sub-agent:trace` IPC |
| `IPC_CHANNELS` | `src/shared/types.ts:72-280` | — | 追加 Sub-agent 通道常量 |
| `IPCChannelMap` | `src/shared/types.ts:322-474` | — | 追加 Sub-agent 通道类型映射 |
| `IpcHandler` | `src/main/ipc/handler.ts` | — | 继承基类注册 IPC handler |
| `logger` | `src/main/utils/logger.ts` | — | 结构化日志依赖 |
| `FileManager` | `src/main/services/file-manager.ts` | — | Sub-agent 的文件操作依赖（read-file / write-file） |
| `ToolScopeManager` | `src/main/services/harness/tool-scope-manager.ts` | — | 参考工具注册模式 |
| `resources/prompts/` | `sibylla-desktop/resources/prompts/` | — | 已有目录结构，新增 `agents/` 子目录 |
| `AppEventBus` | `src/main/services/event-bus.ts` | — | Sub-agent 生命周期事件发布 |

### 2.4 被依赖任务

| 任务 | 依赖内容 |
|------|---------|
| TASK039 (Workflow 自动化) | WorkflowExecutor 通过 `SubAgentExecutor.run()` 调用 Sub-agent |

---

## 三、实施阶段与步骤分解

### 阶段 A：共享类型 + SubAgentRegistry（预计 1 工作日）

> 产出可独立编译的类型定义与注册中心，不依赖其他新增模块。

#### 步骤 A1：定义 Sub-agent 共享类型

**文件：** `sibylla-desktop/src/shared/types.ts`（扩展）

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| A1.1 | 在 IPC_CHANNELS 追加 `SUB_AGENT_LIST = 'sub-agent:list'` | 命名遵循 `namespace:action` 规范 |
| A1.2 | 追加 `SUB_AGENT_CREATE = 'sub-agent:create'` | |
| A1.3 | 追加 `SUB_AGENT_TRACE = 'sub-agent:trace'` | |
| A1.4 | 定义 `SubAgentContextConfig` 接口 | `{ inheritMemory: boolean; inheritTrace: boolean; inheritWorkspaceBoundary: boolean }` |
| A1.5 | 定义 `SubAgentDefinition` 接口 | 必填：id / version / name / description / allowedTools / context / maxTurns / maxTokens；可选：model / outputSchema；元数据：builtin / filePath |
| A1.6 | 定义 `SubAgentResult` 接口 | `{ success, structuredOutput?, summary, turnsUsed, tokensUsed, traceId, errors }` |
| A1.7 | 定义 `SubAgentMetadata` 接口 | 精简元数据：id / version / name / description / model? / allowedTools / maxTurns / maxTokens / hasOutputSchema / source |
| A1.8 | 定义 `SubAgentTemplate` 接口 | `{ id, name, description, allowedTools, task, outputSchema? }` 用于 createFromTemplate |
| A1.9 | 在 IPCChannelMap 追加 3 个通道类型映射 | list → `SubAgentMetadata[]`；create → `{ agentId }`；trace → `SubAgentTrace` |
| A1.10 | 定义 `SubAgentTrace` 接口 | `{ traceId, parentTraceId, spans: SerializedSpan[], agentId, startedAt, endedAt }` |

**验证：** TypeScript 编译通过（`tsc --noEmit`）。

#### 步骤 A2：定义 Sub-agent 内部类型

**文件：** `sibylla-desktop/src/main/services/sub-agent/types.ts`（新建）

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| A2.1 | 定义 `SubAgentRunOptions` | `{ agent, task, params?, parentTraceId, parentAllowedTools, timeoutMs, nestingDepth? }` |
| A2.2 | 定义 `SubAgentContextData` | SubAgentContext 内部状态接口（generator / guardrailEngine / messages / usage / abortController 等） |
| A2.3 | 定义 `SubAgentContextOptions` | `{ agent, task, params, parentTraceId, parentAllowedTools, timeoutMs, gateway, defaultModel, registry, workspaceBoundary, nestingDepth, tracer?, logger }` |
| A2.4 | 定义 `ToolCallResult` | `{ success, content, error? }` |
| A2.5 | 定义 `StructuredOutputExtractionResult` | `{ valid, output?, errors }` |

**验证：** TypeScript 编译通过。

#### 步骤 A3：实现 SubAgentRegistry

**文件：** `sibylla-desktop/src/main/services/sub-agent/SubAgentRegistry.ts`（新建）

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| A3.1 | 内部数据结构 `private agents = new Map<string, SubAgentDefinition>()` | |
| A3.2 | 构造函数注入 `builtinDir` / `workspaceDir` / `promptComposer` | builtinDir = `resources/prompts/agents/`；workspaceDir = `.sibylla/agents/`（可为 null） |
| A3.3 | `async initialize(): Promise<void>` — 扫描 builtinDir 下所有 `.md` 文件 | 解析 YAML frontmatter → 构建 SubAgentDefinition（frontmatter 字段 + body 作为 prompt 参考） |
| A3.4 | initialize 续 — 扫描 workspaceDir（如存在） | 用户定义覆盖内置（同 id 时用户版本优先） |
| A3.5 | initialize 续 — 验证每个定义的 `allowedTools` 合法性 | 缺少必填字段时跳过 + 记录 warning 日志 |
| A3.6 | `get(id: string): SubAgentDefinition \| undefined` | 直接 Map 查询 |
| A3.7 | `getAll(): SubAgentMetadata[]` | 返回完整列表（Map → metadata 映射） |
| A3.8 | `async loadAgentPrompt(agentId: string): Promise<string>` | 通过 PromptComposer 加载 `agents.{agentId}` prompt；PromptComposer 不可用时直接读取 Markdown body |
| A3.9 | `async createFromTemplate(template: SubAgentTemplate): Promise<{ agentId: string }>` | 生成 Markdown 文件到 `.sibylla/agents/`；注册到 agents Map |
| A3.10 | `private parseAgentDefinition(filePath: string, content: string, builtin: boolean): SubAgentDefinition \| null` | YAML frontmatter 解析 + body 提取；格式错误时返回 null + warning |

**验证：**
- initialize() 正确加载所有内置 Sub-agent（5 个）
- 用户定义覆盖内置
- getAll() 返回完整列表
- loadAgentPrompt() 返回 prompt 文本

#### 步骤 A4：实现统一导出

**文件：** `sibylla-desktop/src/main/services/sub-agent/index.ts`（新建）

| 序号 | 操作 |
|------|------|
| A4.1 | 导出 SubAgentRegistry |
| A4.2 | 导出 SubAgentContext |
| A4.3 | 导出 SubAgentExecutor |
| A4.4 | 导出 spawnSubAgentTool 相关定义 |
| A4.5 | 导出内部类型（SubAgentRunOptions 等） |

---

### 阶段 B：SubAgentContext 独立上下文（预计 0.5 工作日）

> 为每个 Sub-agent 实例创建完全隔离的执行上下文。

#### 步骤 B1：实现 SubAgentContext

**文件：** `sibylla-desktop/src/main/services/sub-agent/SubAgentContext.ts`（新建）

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| B1.1 | 定义 `SubAgentContext` 类的 readonly 字段 | agent / task / params / parentTraceId / allowedTools / timeoutMs / generator / guardrailEngine / systemPrompt / messages / usage / abortController / startedAt |
| B1.2 | 私有构造函数 `private constructor(data: SubAgentContextData)` | 禁止外部直接实例化 |
| B1.3 | `static async create(opts: SubAgentContextOptions): Promise<SubAgentContext>` — a. 创建独立 AiGatewaySession | `gateway.createSession({ role: 'sub-agent' })` |
| B1.4 | create 续 — b. 创建独立 Generator | `new Generator(gateway, agent.model ?? defaultModel, logger)` |
| B1.5 | create 续 — c. 创建独立 GuardrailEngine | `new GuardrailEngine()`（复用配置但独立实例） |
| B1.6 | create 续 — d. 加载 agent prompt | `await registry.loadAgentPrompt(agent.id)` → systemPrompt |
| B1.7 | create 续 — e. 计算允许的工具集 | `allowedTools = intersect(parentAllowedTools, agent.allowedTools)` |
| B1.8 | create 续 — e.1 工具集裁剪警告 | 结果长度 < Sub-agent 声明长度 → 记录 warning 日志 |
| B1.9 | create 续 — e.2 spawnSubAgent 防递归检查 | allowedTools 不包含 `spawnSubAgent`（除非显式声明且 nestingDepth < 3） |
| B1.10 | create 续 — f. 初始化 messages | `[{ role: 'system', content: systemPrompt }, { role: 'user', content: task }]` |
| B1.11 | create 续 — g. 创建 AbortController | `abortController = new AbortController()` |
| B1.12 | create 续 — h. 记录 startedAt | `startedAt = Date.now()` |
| B1.13 | `addMessage(role: string, content: string): void` | 追加到 messages 数组 |
| B1.14 | `addUsage(tokens: number, cost: number): void` | 累加到 usage |
| B1.15 | `isAborted(): boolean` | `abortController.signal.aborted` |
| B1.16 | `getElapsedMs(): number` | `Date.now() - startedAt` |
| B1.17 | `abort(): void` | `abortController.abort()` |

**权限边界硬性约束（在 create 中强制执行）：**

```
Sub-agent allowedTools = 主 agent 工具 ∩ Sub-agent 声明工具
├── 结果 = Sub-agent 声明工具 → 正常
├── 结果 < Sub-agent 声明工具 → 裁剪 warning
├── spawnSubAgent 在结果中 → 移除（除非显式声明 + nestingDepth < 3）
└── 工作区边界约束 → 从 parent 继承
```

**验证：**
- 独立的 Generator / GuardrailEngine / messages 数组创建
- 工具集正确裁剪（交集运算）
- spawnSubAgent 默认不包含在 allowedTools 中
- inherit_memory: false 时不加载主 agent 的 MEMORY.md

---

### 阶段 C：SubAgentExecutor 核心循环（预计 1 工作日）

> Sub-agent 的核心执行逻辑：独立循环 + 结构化输出提取 + 并发控制 + 优雅退出。

#### 步骤 C1：实现 SubAgentExecutor

**文件：** `sibylla-desktop/src/main/services/sub-agent/SubAgentExecutor.ts`（新建）

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| C1.1 | 定义静态常量 | `MAX_RETRIES = 2` / `MAX_CONCURRENT = 3` / `GRACEFUL_EXIT_MS = 5000` |
| C1.2 | 内部状态：`activeCount` / `pendingQueue` / `activeContexts` | `activeContexts: Set<SubAgentContext>` 用于 gracefulAbort |
| C1.3 | 构造函数注入 | `gateway: AiGatewayClient` / `defaultModel: string` / `tracer?: Tracer` / `logger` |
| C1.4 | `async run(opts: SubAgentRunOptions): Promise<SubAgentResult>` — a. 并发控制 | `activeCount >= MAX_CONCURRENT` → `await waitForSlot()` |
| C1.5 | run 续 — b. 嵌套深度检查 | `nestingDepth >= 3` → 返回 `{ success: false, errors: ['嵌套深度超限'] }` |
| C1.6 | run 续 — c. 创建上下文 | `ctx = await SubAgentContext.create(opts)` → `activeContexts.add(ctx)` |
| C1.7 | run 续 — d. Tracer 包裹 | `tracer.withSpan('sub-agent.run', async (span) => { ... }, { parent?, kind: 'ai-call' })` |
| C1.8 | run 续 — e. 执行循环 | 见下方 C2 |
| C1.9 | run 续 — f. 提取结构化输出 | 见下方 C3 |
| C1.10 | run 续 — g. 组装结果 | `{ success, structuredOutput?, summary, turnsUsed, tokensUsed, traceId, errors }` |
| C1.11 | run 续 — finally | `activeCount--` / `activeContexts.delete(ctx)` / `releaseSlot()` |

#### 步骤 C2：执行循环（run 方法的核心）

```
for turn in 1..agent.maxTurns:
  // 检查 abort
  if ctx.isAborted(): break

  // 检查超时
  if ctx.getElapsedMs() > timeoutMs: break

  // Generator 调用
  response = await ctx.generator.generate({
    request: { messages: ctx.messages },
    context: { systemPrompt: ctx.systemPrompt }
  })

  ctx.addUsage(response.usage.totalTokens, response.usage.totalCost)
  ctx.addMessage('assistant', response.content)

  // 检查 stop_reason
  if response.stopReason === 'end_turn': break

  // 处理工具调用
  for toolCall in response.toolCalls:
    // 1. 检查是否在 allowedTools 白名单中
    if !ctx.allowedTools.includes(toolCall.name):
      ctx.addMessage('tool', `工具 ${toolCall.name} 未授权`)
      continue

    // 2. Guardrail 检查（写操作必须审批）
    if isWriteOperation(toolCall):
      assessment = ctx.guardrailEngine.check(toolCall, operationContext)
      if assessment.blocked:
        ctx.addMessage('tool', `操作被护栏拒绝: ${assessment.reason}`)
        continue

    // 3. 执行工具
    result = await executeTool(toolCall, ctx)
    ctx.addMessage('tool', result.content)

  // Token 预算检查
  if ctx.usage.totalTokens > agent.maxTokens: break

  // span 添加事件
  span.addEvent('sub-agent.turn', { turn, tokensUsed: ctx.usage.totalTokens })
```

#### 步骤 C3：结构化输出提取

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| C3.1 | `private extractStructuredOutput(messages, schema)` — 提取 JSON | 从最后一条 assistant 消息提取 `\`\`\`json ... \`\`\`` 代码块或纯 JSON |
| C3.2 | JSON Schema 校验 | 使用 Ajv 或手写校验器对 `agent.outputSchema` 校验 |
| C3.3 | 校验通过 | 返回 `{ valid: true, output }` |
| C3.4 | 校验失败 → 重试 | 追加 meta 消息 `"上次输出不符合 schema：{errors}。请重新输出，严格遵循 schema。"` → 重新 Generator 调用 |
| C3.5 | 重试上限 | 最多 2 次重试（`MAX_RETRIES = 2`） |
| C3.6 | 仍失败 → graceful degradation | 返回 `{ valid: false }` + 外部组装 `{ success: false, summary: lastAssistantContent }` |

#### 步骤 C4：并发控制

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| C4.1 | `private async waitForSlot(): Promise<void>` | 返回 Promise，resolve 推入 pendingQueue |
| C4.2 | `private releaseSlot(): void` | activeCount-- → 从 pendingQueue 取出下一个 → activeCount++ → resolve |
| C4.3 | `get activeAgentCount(): number` | 返回 activeCount（供外部查询） |

#### 步骤 C5：优雅退出

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| C5.1 | `async gracefulAbort(): Promise<void>` | 对所有 activeContexts 中的 ctx 调用 `ctx.abort()` |
| C5.2 | 等待最多 5 秒 | `Promise.race([allSettled, timeout(5000)])` |
| C5.3 | 超时后强制结束 | 超时 → 记录 warning 日志 |
| C5.4 | `abortAll(): void` | 立即 abort 所有 activeContexts，不等待 |

**验证：**
- 独立循环正确执行，返回结构化结果
- max_turns 限制生效（超出时返回部分结果）
- max_tokens 限制生效
- timeout 生效
- 并发上限 3 个（第 4 个排队等待）
- abort 后 5 秒内完成退出
- 结构化输出校验 + 最多 2 次重试 + graceful degradation

---

### 阶段 D：spawnSubAgent 工具 + IPC Handler + 内置资源文件（预计 1 工作日）

> 产出主 agent 可调用的工具定义、IPC 通道、5 个内置 Sub-agent 资源文件。

#### 步骤 D1：实现 spawnSubAgentTool

**文件：** `sibylla-desktop/src/main/services/sub-agent/spawnSubAgentTool.ts`（新建）

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| D1.1 | 定义 `SPAWN_SUB_AGENT_TOOL` 常量 | id/name/description/schema 遵循现有 built-in-tools.ts 格式 |
| D1.2 | schema 定义 — required | `['agentId', 'task']` |
| D1.3 | schema 定义 — properties | agentId(string) / task(string) / params(object,可选) / timeout(integer, default 600) |
| D1.4 | `executeSpawnSubAgent` 函数签名 | `(args, context: SpawnContext) => Promise<SubAgentResult>` |
| D1.5 | execute — 1. 验证 agent 存在 | `registry.get(args.agentId)` 不存在 → 返回 `{ success: false, errors: [...] }` |
| D1.6 | execute — 2. 调用 SubAgentExecutor.run | 传入 agent/task/params/parentTraceId/parentAllowedTools/timeoutMs |
| D1.7 | execute — 3. 返回 SubAgentResult | 直接透传 Executor 返回值 |

#### 步骤 D2：创建 IPC Handler

**文件：** `sibylla-desktop/src/main/ipc/handlers/sub-agent.ts`（新建）

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| D2.1 | 继承 `IpcHandler` 基类 | `namespace = 'sub-agent'` |
| D2.2 | 构造函数注入 | `subAgentRegistry` / `subAgentExecutor` / `traceStore?` |
| D2.3 | `register()` — 注册 `sub-agent:list` | `safeHandle` → `subAgentRegistry.getAll()` |
| D2.4 | 注册 `sub-agent:create` | `safeHandle` → `subAgentRegistry.createFromTemplate(template)` |
| D2.5 | 注册 `sub-agent:trace` | `safeHandle` → `traceStore.getTraceTree(traceId)` → 组装 `SubAgentTrace` |
| D2.6 | `cleanup()` | 移除 3 个 handler |

#### 步骤 D3：创建 5 个内置 Sub-agent 资源文件

**目录：** `sibylla-desktop/resources/prompts/agents/`（新建目录）

| 序号 | 文件名 | 核心配置 |
|------|--------|---------|
| D3.1 | `pr-reviewer.md` | allowed_tools: [read-file, search, list-files]；max_turns: 15；max_tokens: 50000；output_schema: { summary, findings[] }；inherit_memory: false |
| D3.2 | `doc-summarizer.md` | allowed_tools: [read-file, search, list-files]；max_turns: 10；max_tokens: 30000；output_schema: { summary, keyPoints[], actionItems[] }；inherit_memory: false |
| D3.3 | `meeting-note-writer.md` | allowed_tools: [read-file, write-file]；max_turns: 12；max_tokens: 40000；output_schema: { summary, decisions[], actionItems[], participants[] }；inherit_memory: false |
| D3.4 | `spec-reviewer.md` | allowed_tools: [read-file, search]；max_turns: 15；max_tokens: 50000；output_schema: { summary, issues[], suggestions[] }；inherit_memory: false |
| D3.5 | `memory-curator.md` | allowed_tools: [read-file, write-file, search]；max_turns: 10；max_tokens: 30000；output_schema: { extracted, categories[] }；inherit_memory: true |

每个文件包含完整的 YAML frontmatter + Markdown prompt body（审查流程、原则、输出格式指导）。

#### 步骤 D4：更新 resources/prompts/index.yaml

**文件：** `sibylla-desktop/resources/prompts/index.yaml`（扩展）

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| D4.1 | 追加 5 个 agents 条目 | `id: agents.pr-reviewer` / `scope: agent` / `file: agents/pr-reviewer.md` 等 |

**验证：**
- spawnSubAgent 工具定义格式与现有工具一致
- IPC Handler 注册成功，3 个通道可用
- 5 个内置 Sub-agent 资源文件格式正确（frontmatter + body）
- index.yaml 包含新增条目

---

### 阶段 E：装配与生命周期集成（预计 0.5 工作日）

> 将 Sub-agent 系统接入 Electron 应用生命周期，注册工具到主 agent，扩展 Preload API。

#### 步骤 E1：Preload API 扩展

**文件：** `sibylla-desktop/src/preload/index.ts`（扩展）

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| E1.1 | 在 `api` 对象新增 `subAgent` 命名空间 | 位置：与其他 AI 相关命名空间（ai / harness / aiMode）相邻 |
| E1.2 | `subAgent.list()` | `safeInvoke<SubAgentMetadata[]>(IPC_CHANNELS.SUB_AGENT_LIST)` |
| E1.3 | `subAgent.create(template)` | `safeInvoke<{ agentId: string }>(IPC_CHANNELS.SUB_AGENT_CREATE, template)` |
| E1.4 | `subAgent.trace(traceId)` | `safeInvoke<SubAgentTrace>(IPC_CHANNELS.SUB_AGENT_TRACE, traceId)` |
| E1.5 | `ALLOWED_CHANNELS` 白名单追加 3 个通道 | 确保安全校验通过 |

#### 步骤 E2：spawnSubAgent 工具注册到主 agent

**文件：** 主进程工具注册入口（ToolScopeManager 或 built-in-tools.ts）

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| E2.1 | 在工具列表中新增 `spawnSubAgent` | 工具定义使用 `SPAWN_SUB_AGENT_TOOL` |
| E2.2 | 工具 execute 绑定到 `executeSpawnSubAgent` | 注入 subAgentRegistry / subAgentExecutor / parentAllowedTools / parentTraceId |
| E2.3 | 验证不影响现有工具 | 现有工具列表不变，spawnSubAgent 为纯增量 |

#### 步骤 E3：主进程初始化装配

**文件：** 主进程 workspace 生命周期管理入口（如 `src/main/index.ts` 或 workspace manager）

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| E3.1 | onWorkspaceOpened 中创建 SubAgentRegistry | `new SubAgentRegistry(builtinDir, workspaceDir, promptComposer)` |
| E3.2 | await SubAgentRegistry.initialize() | 扫描内置 + 工作区 agent 文件 |
| E3.3 | 创建 SubAgentExecutor | `new SubAgentExecutor(gateway, defaultModel, tracer, logger)` |
| E3.4 | 注册 SubAgent IPC Handler | `new SubAgentHandler(subAgentRegistry, subAgentExecutor, traceStore)` → `.register()` |
| E3.5 | 将 spawnSubAgent 工具注入 HarnessOrchestrator 的工具集 | 绑定 registry + executor 上下文 |
| E3.6 | 传递 tracer 引用 | Executor 可选注入 Tracer |

#### 步骤 E4：关闭与清理

| 序号 | 操作 | 验收要点 |
|------|------|---------|
| E4.1 | onWorkspaceClosed 中 `await subAgentExecutor.gracefulAbort()` | 5 秒内所有活跃 Sub-agent 退出 |
| E4.2 | SubAgent IPC Handler `.cleanup()` | 移除 3 个 IPC handler |
| E4.3 | will-quit 事件中确保强制清理 | `subAgentExecutor.abortAll()` |

**验证：**
- 应用启动后 Sub-agent 列表可通过 IPC 查询（`subAgent.list()`）
- spawnSubAgent 工具出现在主 agent 工具列表中
- 关闭 workspace 时活跃 Sub-agent 优雅退出
- 不影响现有功能的任何行为

---

### 阶段 F：单元测试（预计 1 工作日）

> 覆盖核心模块行为，目标覆盖率 ≥ 80%。

#### 步骤 F1：sub-agent-registry.test.ts

**文件：** `tests/main/services/sub-agent/sub-agent-registry.test.ts`

| 序号 | 测试用例 | 验收要点 |
|------|---------|---------|
| F1.1 | initialize 正确加载所有内置 Sub-agent | getAll() 返回 5 个 agent |
| F1.2 | 用户定义覆盖内置同 id | workspaceDir 放置同名 .md → getAll() 返回 workspace 版本 |
| F1.3 | get(id) 返回正确的 SubAgentDefinition | 字段完整（id/version/name/allowedTools/maxTurns/maxTokens） |
| F1.4 | get(id) 不存在返回 undefined | |
| F1.5 | getAll() 返回完整元数据 | 每条包含 source 标记（builtin/workspace） |
| F1.6 | loadAgentPrompt 返回 prompt 文本 | 不含 YAML frontmatter，仅 Markdown body |
| F1.7 | loadAgentPrompt 不存在的 id 抛出错误 | |
| F1.8 | createFromTemplate 创建文件并注册 | `.sibylla/agents/` 目录下生成 .md 文件 + agents Map 更新 |
| F1.9 | 格式错误的 agent 文件被跳过 | 缺少必填字段 → warning 日志 + 不注册 |

#### 步骤 F2：sub-agent-context.test.ts

**文件：** `tests/main/services/sub-agent/sub-agent-context.test.ts`

| 序号 | 测试用例 | 验收要点 |
|------|---------|---------|
| F2.1 | 独立 Generator 实例创建 | 验证 new Generator 被调用 |
| F2.2 | 独立 GuardrailEngine 实例创建 | 验证 new GuardrailEngine 被调用 |
| F2.3 | allowed_tools 正确裁剪（交集） | parent = [a,b,c]，agent = [a,d] → 结果 = [a] |
| F2.4 | spawnSubAgent 默认不包含 | 即使 parent 和 agent 都声明了，默认仍移除 |
| F2.5 | inherit_memory: false 时不加载 MEMORY.md | 验证 ContextEngine 未读取 MEMORY.md |
| F2.6 | 工作区边界约束继承 | workspaceBoundary 从 parent 继承 |
| F2.7 | 嵌套深度 ≥ 3 时拒绝创建 | nestingDepth=3 → 抛出错误 |
| F2.8 | abort / isAborted / getElapsedMs | 行为正确 |

#### 步骤 F3：sub-agent-executor.test.ts

**文件：** `tests/main/services/sub-agent/sub-agent-executor.test.ts`

| 序号 | 测试用例 | 验收要点 |
|------|---------|---------|
| F3.1 | 独立循环执行，返回结构化结果 | Generator mock 返回 end_turn → 结果正确 |
| F3.2 | max_turns 限制：超出时返回部分结果 | 模拟 max_turns=2，Generator 持续返回 tool_use → 第 3 轮不执行 |
| F3.3 | max_tokens 限制：超出时返回部分结果 | 模拟 usage 超限 → 中止 |
| F3.4 | timeout 限制：超时时中止 | 模拟 getElapsedMs > timeoutMs → 中止 |
| F3.5 | 并发控制：第 4 个排队等待 | 3 个活跃 + 第 4 个 → 等待；1 个完成 → 第 4 个开始 |
| F3.6 | abort 优雅退出：5 秒内完成 | 调用 gracefulAbort → 所有 activeContext 被中止 |
| F3.7 | 嵌套深度限制：深度 ≥ 3 时拒绝 | nestingDepth=3 → 返回 `{ success: false, errors: [...] }` |
| F3.8 | Trace span 正确嵌套 | parent_trace_id 正确传递；span 属性包含 agent.id |

#### 步骤 F4：structured-output.test.ts

**文件：** `tests/main/services/sub-agent/structured-output.test.ts`

| 序号 | 测试用例 | 验收要点 |
|------|---------|---------|
| F4.1 | JSON 代码块正确提取 | `` ```json {"summary":"ok"} ``` `` → 提取成功 |
| F4.2 | 纯 JSON 提取 | `{"summary":"ok"}` → 提取成功 |
| F4.3 | JSON Schema 校验通过 | schema 要求 summary 字段 → 通过 |
| F4.4 | 校验失败触发重试 | 缺少必填字段 → 追加 meta 消息 → 重试 |
| F4.5 | 2 次重试仍失败返回 graceful degradation | `{ success: false, summary: lastAssistantContent }` |
| F4.6 | 无 output_schema 时返回 summary | `{ summary: lastAssistantContent }` |

#### 步骤 F5：spawn-sub-agent-tool.test.ts

**文件：** `tests/main/services/sub-agent/spawn-sub-agent-tool.test.ts`

| 序号 | 测试用例 | 验收要点 |
|------|---------|---------|
| F5.1 | agentId 存在时正确执行 | mock Executor → 返回结构化结果 |
| F5.2 | agentId 不存在时返回错误 | `{ success: false, errors: ['未找到智能体：xxx'] }` |
| F5.3 | 参数传递正确 | task / params / timeout 正确传递到 Executor.run |
| F5.4 | 默认 timeout = 600 秒 | 未传 timeout → timeoutMs = 600000 |
| F5.5 | 工具定义 schema 格式正确 | required 字段、properties 类型正确 |

#### 步骤 F6：permission-boundary.test.ts

**文件：** `tests/main/services/sub-agent/permission-boundary.test.ts`

| 序号 | 测试用例 | 验收要点 |
|------|---------|---------|
| F6.1 | Sub-agent 试图使用未声明工具时被拒绝 | allowedTools=[read-file]，调用 write-file → 工具返回权限错误 |
| F6.2 | Sub-agent 访问非本人 personal 目录时被拒绝 | GuardrailEngine 的 PersonalSpaceGuard 生效 |
| F6.3 | 写操作仍走 Guardrail 审批 | write-file → GuardrailEngine.check 被调用 |
| F6.4 | Sub-agent allowedTools 是主 agent 的子集 | parent=[a,b]，agent=[a,c] → 结果=[a]，warning 记录 |
| F6.5 | Sub-agent 不能提权 | parent=[a]，agent=[a,b,c] → 结果=[a] |

**覆盖率目标：** ≥ 80%（P0 要求）

---

## 四、关键设计决策

### 4.1 Sub-agent 复用 Generator + GuardrailEngine（非引入新引擎）

**决策**：Sub-agent 内部通过创建独立的 `Generator` + `GuardrailEngine` 实例运行简化循环，不引入 "QueryEngine" 概念，不使用完整的 `HarnessOrchestrator`。

**理由**：
- HarnessOrchestrator 包含 evaluate → refine 循环、mode dispatch、hook 执行等完整流程，对 Sub-agent 过重
- Sub-agent 只需 `Generator.chat` + 工具执行 + 护栏审批的简化循环
- 复用 Generator 保证了 AI 调用路径一致（AiGatewaySession、token 计数、错误处理）
- 复用 GuardrailEngine 保证了写操作审批一致性

### 4.2 独立实例而非共享（隔离模型）

**决策**：每个 Sub-agent 实例创建完全独立的 Generator / GuardrailEngine / messages / usage。

**理由**：
- Generator 绑定 AiGatewaySession，session 状态不可并发共享
- messages 数组独立防止上下文污染（Sub-agent 对话不回灌主对话）
- usage 独立记账便于追踪每个 Sub-agent 的 token 消耗和成本
- GuardrailEngine 独立实例可对 Sub-agent 施加更严格的规则而不影响主 agent

### 4.3 权限交集（不可提权）

**决策**：Sub-agent 的 `allowedTools` = 主 agent 工具 ∩ Sub-agent 声明工具，硬性约束。

**理由**：
- 安全原则：Sub-agent 不能拥有超过主 agent 的权限
- 即使 Sub-agent 声明了主 agent 没有的工具，也会被裁剪
- 裁剪时记录 warning（便于调试但不阻止执行）

### 4.4 结构化输出的 graceful degradation

**决策**：output_schema 校验失败最多重试 2 次，仍失败返回 `success: false` + 非结构化 summary。

**理由**：
- 避免 token 浪费（硬编码上限 2 次）
- graceful degradation 保证 Sub-agent 总有返回值，不会因 schema 问题而完全失败
- summary 包含最后一条 assistant 消息内容，保留推理结果

### 4.5 完全增量（不修改现有模块代码）

**决策**：Sub-agent 系统的所有代码在 `src/main/services/sub-agent/` 新目录中，仅在 `shared/types.ts`（类型扩展）和 `preload/index.ts`（API 扩展）以及工具注册入口做最小化增量修改。

**理由**：
- Generator / GuardrailEngine / AiGatewayClient 的代码不做任何修改，仅通过创建新实例复用
- 向后兼容性：现有功能零影响
- 降低回归风险

---

## 五、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Sub-agent 嵌套无限递归 | 资源耗尽 | 默认 allowedTools 不含 spawnSubAgent；显式声明时嵌套深度上限 3 层 |
| output_schema 反复重试浪费 token | 成本超预期 | 硬编码最多 2 次重试；失败后 graceful degradation |
| 并发 Sub-agent 过多导致资源竞争 | 系统卡顿 | 同一主 agent 最多 3 个活跃 Sub-agent（MAX_CONCURRENT）；超出排队 |
| Sub-agent 超时无法退出 | 主 agent 阻塞 | AbortController + 5 秒优雅退出 + 强制 abort 兜底 |
| Sub-agent 写操作绕过护栏 | 安全风险 | 写操作必须走 GuardrailEngine.check（不可跳过） |
| 独立实例创建开销 | 性能 | Generator 构造轻量（仅引用 gateway + model）；GuardrailEngine 无参数构造 |
| 用户自定义 agent 的 prompt injection | AI 行为异常 | 加载前不做自动扫描（与 Skill 系统一致），依赖 GuardrailEngine 的护栏检查 |
| workspace 关闭时 Sub-agent 未完成 | 数据丢失 | gracefulAbort 5 秒等待 + will-quit 强制 abort |

---

## 六、执行顺序总览

```
阶段 A (1d): 共享类型 + Registry
  A1: shared/types.ts 扩展      ──→ A2: sub-agent/types.ts (内部类型)
                                     A3: SubAgentRegistry.ts
                                     A4: index.ts

阶段 B (0.5d): 独立上下文
  B1: SubAgentContext.ts          (依赖 A1 + A2 + A3)

阶段 C (1d): 核心循环
  C1-C2: SubAgentExecutor.ts     (依赖 B1)
  C3: extractStructuredOutput     (依赖 C1)
  C4-C5: 并发控制 + 优雅退出      (依赖 C1)

阶段 D (1d): 工具 + IPC + 资源
  D1: spawnSubAgentTool.ts       (依赖 A3 + C1)
  D2: ipc/handlers/sub-agent.ts  (依赖 A3 + D1)
  D3: resources/prompts/agents/*  (独立，可并行)
  D4: index.yaml 更新             (依赖 D3)

阶段 E (0.5d): 装配 + 生命周期
  E1: preload/index.ts           (依赖 A1 + D2)
  E2: 工具注册                    (依赖 D1)
  E3: 主进程初始化                 (依赖 A3 + C1 + D2 + E2)
  E4: 关闭清理                    (依赖 C5 + D2)

阶段 F (1d): 单元测试
  F1: registry.test.ts           (依赖 A3)
  F2: context.test.ts            (依赖 B1)
  F3: executor.test.ts           (依赖 C1)
  F4: structured-output.test.ts  (依赖 C3)
  F5: tool.test.ts               (依赖 D1)
  F6: permission.test.ts         (依赖 B1 + C1)
```

**总预估：5 工作日（含测试）。核心路径 A → B → C → D → E，F 可与 D/E 并行推进。**

### 涉及的现有文件变更汇总

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/shared/types.ts` | 扩展 | 新增 SubAgent* 类型 + 3 个 IPC 通道常量 + IPCChannelMap 映射 |
| `src/preload/index.ts` | 扩展 | 新增 subAgent 命名空间 + ALLOWED_CHANNELS 白名单 |
| `resources/prompts/index.yaml` | 扩展 | 新增 5 个 agents 条目 |
| 工具注册入口 | 扩展 | 注册 spawnSubAgent 到主 agent 工具列表 |
| 主进程初始化入口 | 扩展 | Sub-agent 组件装配 + 生命周期 |
| `src/main/services/sub-agent/` | 新增 | 6 个文件（types / Registry / Context / Executor / Tool / index） |
| `src/main/ipc/handlers/sub-agent.ts` | 新增 | Sub-agent IPC Handler |
| `resources/prompts/agents/` | 新增 | 5 个内置 Sub-agent 定义文件 |
| `tests/main/services/sub-agent/` | 新增 | 6 个测试文件 |

注：Generator / GuardrailEngine / AiGatewayClient / ContextEngine 的代码不做任何修改，仅通过创建新实例复用。
