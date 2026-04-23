# Hook 节点系统与 Reactive Compact

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK036 |
| **任务标题** | Hook 节点系统与 Reactive Compact |
| **所属阶段** | Phase 1 - AI 能力扩展体系 (Sprint 3.5) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

构建两个横切能力：（1）Hook 节点系统——将 Sprint 3.1 的 Guardrail 与 Evaluator 扩展为 8 个细粒度主循环挂载点，允许内置 Hook（TypeScript）与用户 Hook（Markdown 声明式）在特定流程点插入逻辑；（2）Reactive Compact——补齐上下文降级链的第 5 层，当 API 返回 413 / max_output_tokens 等错误时自动恢复，让用户无感知地继续对话。

### 背景

**Hook 系统**：Sprint 3.1 建立了 Harness（Guardrail + Evaluator + Guide + Sensor），但这些都是硬编码在 Orchestrator 流程中的固定组件。用户无法在"模型调用前"注入自己的环境信息，无法在"压缩前"选择保留关键信息，无法在"文件写入后"执行自定义检查。Sprint 3.5 将这些流程点抽象为 Hook 节点，允许插拔扩展。

**Reactive Compact**：Sprint 3.2 已实现前 4 层上下文降级（snipCompact → microcompact → contextCollapse → autoCompact），但缺少被动兜底。当 API 返回 prompt_too_long（413）或 max_output_tokens 时，当前系统直接报错给用户，体验很差。Reactive Compact 是第 5 层，自动处理这类错误。

**核心设计约束（来自附录 A §17A.5 + §17A.9）**：

- Hook 系统封装现有 Harness 组件，**不破坏现有接口**
- GuardrailEngine 保持现有接口，HookExecutor 在 PreToolUse 节点委托调用
- Evaluator 保持现有接口，HookExecutor 在 PostMessage 节点委托调用
- 用户 Hook 只允许返回 `warn`，**不允许 `block`**（block 权限仅限内置 Hook）
- 新增 3 个节点（PreCompaction / PostCompaction / StopCheck）为纯增量
- Reactive Compact 属于 **Context 层**（管理 AI 对话 messages 数组大小），与 Sprint 3.2 的 Memory 层压缩独立运行、互不干扰

### 范围

**包含：**

- HookNode 类型定义（8 个挂载点）
- HookMetadata / HookResult 类型
- HookRegistry — Hook 注册、按节点查询、优先级排序
- HookExecutor — Hook 执行引擎（超时、fail-open、block 短路）
- 内置 Hook 适配层 — 将现有 Harness 组件包装为 Hook
- 用户 Hook 加载器 — 解析 Markdown 声明式 Hook，使用便宜模型评估
- HarnessOrchestrator 集成 — 在关键流程点调用 HookExecutor
- ReactiveCompact — API 错误恢复逻辑（prompt_too_long / max_output_tokens / media_size）
- CompactOrchestrator — 协调 5 层降级链
- Hook IPC 通道 — hook:list / hook:enable / hook:disable / hook:trace
- 用户可见性 — Reactive Compact 触发时的 UI 进度提示
- 单元测试

**不包含：**

- 图形化 Hook 编辑器
- Hook 的在线市场
- Workflow 触发 Hook 的集成（TASK039）
- Sub-agent 内部的 Hook 支持（TASK038 扩展）

## 依赖关系

### 前置依赖

- [x] TASK017 — Guardrails 硬性保障层（GuardrailEngine 已可用，映射到 PreToolUse Hook）
- [x] TASK018 — Generator/Evaluator 双 Agent 架构（Evaluator 映射到 PostMessage Hook）
- [x] TASK019 — Guides/Sensors（Guide 映射到 PreSystemPrompt，Sensor 映射到 PostToolUse）
- [x] TASK027 — Tracer SDK（Hook 执行产生 Trace 事件）
- [x] TASK035 — Prompt 库基础设施（Hook prompt 从 Prompt 库加载）

### 被依赖任务

- TASK038 — Sub-agent 独立循环系统（Sub-agent 内部可选支持 Hook）
- TASK039 — Workflow 自动化与管理 UI 收官（Workflow 步骤可触发 Hook）

## 参考文档

- [`specs/requirements/phase1/sprint3.5-ai_ablities.md`](../../requirements/phase1/sprint3.5-ai_ablities.md) — 需求 3.5.6（§5.6）、需求 3.5.7（§5.7）、§4.6、§4.7、§17A.5、§17A.9
- [`specs/design/architecture.md`](../../design/architecture.md) — 进程通信架构、模块划分
- [`CLAUDE.md`](../../../CLAUDE.md) — 设计哲学、UI/UX 红线（2 秒反馈规则）
- `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` — TypeScript 严格模式
- `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` — IPC 类型安全设计

## 验收标准

### Hook 类型与注册

- [ ] `HookNode` 类型定义包含 8 个值：PreUserMessage、PreSystemPrompt、PreToolUse、PostToolUse、PreCompaction、PostCompaction、StopCheck、PostMessage
- [ ] `HookResult` 支持 4 种决策：allow、block、warn、modify
- [ ] HookRegistry 启动时注册内置 Hook（guardrail、guide、sensor、evaluator 的包装）
- [ ] HookRegistry 扫描 `{workspace}/.sibylla/hooks/` 加载用户 Hook
- [ ] HookRegistry 支持按节点查询：`getByNode(node)` 返回该节点所有 Hook（按 priority 降序排列）
- [ ] HookRegistry 支持 enable/disable 持久化（workspace config）

### Hook 执行

- [ ] HookExecutor.executeNode() 按 priority 降序执行所有 Hook
- [ ] 某个 Hook 返回 `block` 时，后续 Hook 不再执行（短路）
- [ ] 内置 Hook 可以返回 `block`（如 GuardrailEngine 拦截危险操作）
- [ ] 用户 Hook 只允许返回 `warn`，不允许 `block`（风险 R8 缓解）
- [ ] Hook 执行超过 5 秒超时时，跳过该 Hook 并记录 warning，不阻塞主循环
- [ ] Hook 抛出异常时，捕获并记录，视为 `decision: 'allow'`（fail-open 原则）
- [ ] Hook 的 `condition` 字段评估为 false 时跳过，不计入执行时间
- [ ] 用户 Hook 使用便宜模型评估，单次调用成本 ≤ 0.001 USD

### 内置 Hook 适配

- [ ] PreToolUse 节点委托调用 GuardrailEngine.check()
- [ ] PostToolUse 节点委托调用 SensorFeedbackLoop
- [ ] PreSystemPrompt 节点委托调用 GuideRegistry
- [ ] PostMessage 节点委托调用 Evaluator
- [ ] 所有现有 Harness 接口保持不变，Hook 仅做委托调用

### Orchestrator 集成

- [ ] HarnessOrchestrator 在 `executeInternal()` 中按流程点调用 HookExecutor.executeNode()
- [ ] 集成点顺序：PreUserMessage → PreSystemPrompt → [Generator] → PreToolUse → [Tool] → PostToolUse → PostMessage → StopCheck
- [ ] HookExecutor 未注入时，Orchestrator 行为与现有完全一致（向后兼容）
- [ ] PreCompaction / PostCompaction 节点预留（autoCompact 触发前后调用）

### Reactive Compact

- [ ] API 返回 413 错误且本轮尚未触发过 autoCompact 时，立即触发 autoCompact 并重试
- [ ] API 返回 413 且 autoCompact 已触发过，进行激进裁剪（保留最近 10 条 + 系统提示 + 首条 user message 作为任务锚点）
- [ ] API 返回 max_output_tokens 时，首次提升 max_tokens 到 64k 重试
- [ ] max_output_tokens 第二次仍失败，注入 meta 消息"从上次中断处继续"触发续写
- [ ] Reactive Compact 执行时 UI 对话区显示"正在整理上下文..."进度提示
- [ ] Reactive Compact 失败达 3 次，停止重试，给用户明确错误与可操作选项
- [ ] Reactive Compact 成功后产生 compact_boundary 消息，被 Trace 记录
- [ ] ReactiveCompact 与 Memory 层压缩（MemoryCompressor、CheckpointScheduler）独立运行、互不干扰

### IPC 集成

- [ ] `hook:list` 返回所有已注册 Hook 的元数据
- [ ] `hook:enable` / `hook:disable` 持久化启用/禁用状态
- [ ] `hook:trace` 查询指定 trace 的 Hook 执行日志

### Trace 集成

- [ ] 每个 Hook 执行产生 `hook_executed` Trace 事件，包含 node、hook_id、duration_ms、result
- [ ] Hook 执行超时在 Trace 中标记 warning

### 向后兼容

- [ ] GuardrailEngine / Evaluator / GuideRegistry / SensorFeedbackLoop 接口无任何修改
- [ ] HarnessOrchestrator 的公共 API 无变化
- [ ] HookExecutor 未注入时，Orchestrator 内部走原逻辑（直接调用 Harness 组件）

## 技术执行路径

### 架构设计

```
Hook 系统整体架构

src/main/services/hooks/                       ← 新增目录
├── HookRegistry.ts                             ← Hook 注册索引
├── HookExecutor.ts                             ← Hook 执行引擎
├── types.ts                                    ← HookNode / HookMetadata / HookResult / HookContext
├── built-in/                                   ← 内置 Hook（委托调用现有 Harness 组件）
│   ├── guardrail-hook.ts                       ← PreToolUse → GuardrailEngine.check()
│   ├── guide-hook.ts                           ← PreSystemPrompt → GuideRegistry
│   ├── sensor-hook.ts                          ← PostToolUse → SensorFeedbackLoop
│   ├── evaluator-hook.ts                       ← PostMessage → Evaluator
│   └── index.ts
├── user-hook-loader.ts                         ← 用户 Hook（Markdown）加载与评估
└── index.ts

src/main/services/compact/                      ← 新增目录
├── reactive-compact.ts                         ← Reactive Compact 恢复逻辑
├── compact-orchestrator.ts                      ← 5 层降级链协调
├── types.ts                                    ← ReactiveCompactTrigger / RecoveryResult
└── index.ts

Hook 节点在主循环中的位置：

主循环（HarnessOrchestrator.executeInternal）
│
├─ [Hook: PreUserMessage]       ← 用户消息进入前（意图分析等）
│
├─ [Hook: PreSystemPrompt]      ← 组装 system prompt 前（Guide 注入等）
│
├─ ContextEngine.assembleForHarness()
│
├─ Generator.generate()
│   │
│   ├─ [Hook: PreToolUse]       ← 工具调用前（Guardrail 审批）
│   ├─ Tool Execution
│   └─ [Hook: PostToolUse]      ← 工具返回后（Sensor 反馈）
│
├─ [Hook: PostMessage]          ← assistant 消息完整后（Evaluator 评估）
│
├─ [Hook: StopCheck]            ← 模型说停止时
│
└─ [Hook: PreCompaction]        ← 压缩触发前（预留）
   [Hook: PostCompaction]       ← 压缩完成后（预留）

Reactive Compact 调用链：

AiGatewayClient.call() 返回错误
│
├─ error.code === 413 (prompt_too_long)
│   ├─ hasCompactedThisTurn() === false → autoCompact + retry
│   └─ hasCompactedThisTurn() === true  → aggressiveTruncate + notify user
│
├─ error.code === max_output_tokens
│   ├─ retry 1: escalate max_tokens to 64k
│   ├─ retry 2: inject "从上次中断处继续" meta message
│   └─ retry 3: fail → user error + options
│
└─ error.code === media_size
    └─ truncate media + retry

与 Memory 层的关系（§17A.9）：

Context 层（本任务）：           Memory 层（Sprint 3.2）：
├─ snipCompact                  ├─ MemoryCompressor（精选记忆压缩）
├─ microcompact                 ├─ CheckpointScheduler（定期检查点）
├─ contextCollapse              └─ 操作 MEMORY.md 和 memory entries
├─ autoCompact
└─ reactiveCompact              两者独立运行，互不干扰
操作 AI 对话的 messages 数组
```

### 步骤 1：定义 Hook 共享类型

**文件：** `src/main/services/hooks/types.ts`（新建）

1. 定义 HookNode 联合类型：
   ```typescript
   export type HookNode =
     | 'PreUserMessage'
     | 'PreSystemPrompt'
     | 'PreToolUse'
     | 'PostToolUse'
     | 'PreCompaction'
     | 'PostCompaction'
     | 'StopCheck'
     | 'PostMessage'
   ```

2. 定义 HookMetadata：
   ```typescript
   export interface HookMetadata {
     id: string
     version: string
     name: string
     description: string
     nodes: HookNode[]
     priority: number                    // 高优先级先执行
     source: 'builtin' | 'user'
     condition?: string                  // 可选：执行条件表达式
     enabled: boolean                    // 是否启用
   }
   ```

3. 定义 HookResult：
   ```typescript
   export interface HookResult {
     decision: 'allow' | 'block' | 'warn' | 'modify'
     reason?: string
     message?: string
     modifications?: HookContextModifications
   }

   export interface HookContextModifications {
     systemPromptAppend?: string
     userMessageOverride?: string
     contextAdditions?: Array<{ key: string; value: string }>
   }
   ```

4. 定义 HookContext — 传递给 Hook 的执行上下文：
   ```typescript
   export interface HookContext {
     node: HookNode
     trigger: {
       userMessage?: string
       tool?: { name: string; input: Record<string, unknown> }
       toolResult?: unknown
       assistantMessage?: string
     }
     conversationId: string
     workspacePath: string
     parentTraceId?: string
     userApprovalHandler?: (assessment: unknown) => Promise<boolean>
   }
   ```

5. 定义 Hook 接口：
   ```typescript
   export interface Hook {
     readonly metadata: HookMetadata
     execute(ctx: HookContext): Promise<HookResult>
   }
   ```

**验证：** TypeScript 编译通过。

### 步骤 2：实现 HookRegistry

**文件：** `src/main/services/hooks/HookRegistry.ts`

1. 内部数据结构：
   ```typescript
   private hooks = new Map<string, Hook>()
   private nodeIndex = new Map<HookNode, Hook[]>()  // node → sorted hooks
   private disabledHooks = new Set<string>()         // 持久化的禁用列表
   ```

2. 构造函数接收配置路径：
   ```typescript
   constructor(
     private readonly userHooksDir: string | null,   // {workspace}/.sibylla/hooks/
     private readonly configStore: { get: (key: string) => unknown; set: (key: string, val: unknown) => void },
   ) {}
   ```

3. 实现 `register(hook: Hook): void`：
   - 将 hook 加入 `hooks` Map
   - 按 hook.metadata.nodes 更新 `nodeIndex`
   - 每次注册后对 nodeIndex 中每个 node 按 priority 降序重排序

4. 实现 `async initialize(builtinHooks: Hook[]): Promise<void>`：
   - 注册所有传入的内置 Hook
   - 扫描 userHooksDir（如存在）加载用户 Hook（委托 UserHookLoader）
   - 从 configStore 读取已禁用 Hook 列表，更新 disabledHooks

5. 实现 `getByNode(node: HookNode): Hook[]`：
   - 从 nodeIndex 获取该节点所有 Hook
   - 过滤掉 disabledHooks 中的 Hook

6. 实现 `get(id: string): Hook | undefined`

7. 实现 `getAll(): HookMetadata[]`

8. 实现 `enable(hookId: string): void` / `disable(hookId: string): void`：
   - 更新 disabledHooks
   - 持久化到 configStore

9. 实现 `isEnabled(hookId: string): boolean`

**验证：**
- 注册 3 个 Hook 到同一节点，getByNode 按 priority 降序返回
- disable 后 getByNode 过滤掉该 Hook
- getAll 返回完整元数据列表

### 步骤 3：实现 HookExecutor

**文件：** `src/main/services/hooks/HookExecutor.ts`

1. 构造函数：
   ```typescript
   export class HookExecutor {
     private static readonly HOOK_TIMEOUT_MS = 5000

     constructor(
       private readonly registry: HookRegistry,
       private readonly tracer?: Tracer,
     ) {}
   ```

2. 实现 `async executeNode(node: HookNode, ctx: HookContext): Promise<HookResult[]>`：
   - 从 registry.getByNode(node) 获取该节点所有已启用 Hook
   - 按 priority 降序遍历执行
   - 每个 Hook 包裹在超时 Promise 中（5 秒）
   - 收集所有 HookResult
   - 遇到 `decision: 'block'` 时停止后续 Hook 执行
   - 遇到 `decision: 'modify'` 时应用 modifications 到 ctx
   - 每个 Hook 执行结果记录 Trace 事件
   - 返回所有 HookResult 数组

3. 实现 `private async runWithTimeout(hook: Hook, ctx: HookContext, timeoutMs: number): Promise<HookResult>`：
   ```typescript
   return Promise.race([
     hook.execute(ctx),
     new Promise<HookResult>((_, reject) =>
       setTimeout(() => reject(new Error('Hook timeout')), timeoutMs)
     ),
   ]).catch((err) => {
     logger.warn('[HookExecutor] Hook execution failed/timed out', {
       hookId: hook.metadata.id,
       error: err instanceof Error ? err.message : String(err),
     })
     // fail-open：异常视为 allow
     return { decision: 'allow', reason: 'hook-error-fail-open' }
   })
   ```

4. 实现 `private applyModifications(ctx: HookContext, mods: HookContextModifications): HookContext`：
   - 不可变更新，返回新 ctx

**验证：**
- 3 个 Hook 按 priority 1→2→3 执行，实际顺序 3→2→1
- block 短路：第 2 个返回 block，第 1 个不执行
- 超时跳过不阻塞
- 异常 fail-open 返回 allow
- Trace 事件正确记录

### 步骤 4：实现内置 Hook 适配层

**核心原则**：内置 Hook 委托调用现有 Harness 组件，**不修改**现有组件代码。

**文件：** `src/main/services/hooks/built-in/guardrail-hook.ts`

1. GuardrailHook — 映射到 PreToolUse 节点：
   ```typescript
   export class GuardrailHook implements Hook {
     readonly metadata: HookMetadata = {
       id: 'builtin.guardrail',
       version: '1.0.0',
       name: '安全护栏',
       description: '检查工具调用安全性，拦截危险操作',
       nodes: ['PreToolUse'],
       priority: 1000,
       source: 'builtin',
       enabled: true,
     }

     constructor(private readonly guardrailEngine: GuardrailEngine) {}

     async execute(ctx: HookContext): Promise<HookResult> {
       if (!ctx.trigger.tool) return { decision: 'allow' }

       const assessment = await this.guardrailEngine.check(
         ctx.trigger.tool.name,
         ctx.trigger.tool.input,
       )

       if (assessment.needsUserApproval) {
         const approved = ctx.userApprovalHandler
           ? await ctx.userApprovalHandler(assessment)
           : false
         if (!approved) {
           return { decision: 'block', reason: 'user-denied', message: '用户拒绝了此操作' }
         }
       }

       return { decision: 'allow' }
     }
   }
   ```

**文件：** `src/main/services/hooks/built-in/guide-hook.ts`

2. GuideHook — 映射到 PreSystemPrompt 节点：
   - 委托调用 GuideRegistry.resolve()
   - 将 Guide 内容作为 `systemPromptAppend` modification 注入
   - priority: 500

**文件：** `src/main/services/hooks/built-in/sensor-hook.ts`

3. SensorHook — 映射到 PostToolUse 节点：
   - 委托调用 SensorFeedbackLoop.process()
   - 将反馈作为 `warn` 或 `allow` 返回
   - priority: 500

**文件：** `src/main/services/hooks/built-in/evaluator-hook.ts`

4. EvaluatorHook — 映射到 PostMessage 节点：
   - 委托调用 Evaluator.evaluate()
   - 将评估失败作为 `warn` 返回（不 block，因为 Evaluator 的硬门控在 Orchestrator 中已处理）
   - priority: 800

**文件：** `src/main/services/hooks/built-in/index.ts`

5. 导出工厂函数：
   ```typescript
   export function createBuiltinHooks(deps: {
     guardrailEngine: GuardrailEngine
     guideRegistry?: GuideRegistry
     sensorFeedbackLoop?: SensorFeedbackLoop
     evaluator: Evaluator
   }): Hook[]
   ```

**关键约束：**
- GuardrailEngine / Evaluator / GuideRegistry / SensorFeedbackLoop 的接口和文件不做任何修改
- 内置 Hook 只是包装层（Wrapper），委托调用现有方法
- Orchestrator 原有的直接调用 GuardrailEngine / Evaluator 逻辑保留为 fallback（HookExecutor 未注入时）

### 步骤 5：实现用户 Hook 加载器

**文件：** `src/main/services/hooks/user-hook-loader.ts`

用户 Hook 使用 Markdown + YAML frontmatter 声明，由便宜模型（Haiku 级）评估。

1. 用户 Hook 文件格式：
   ```markdown
   ---
   id: my-custom-hook
   version: 1.0.0
   name: Markdown 元数据检查
   nodes: [PostToolUse]
   priority: 500
   condition: tool.name == "write-file" and tool.input.path.endsWith(".md")
   ---

   # 写入 Markdown 后的元数据更新提醒

   在每次写入 .md 文件后，检查：

   1. 文件 frontmatter 是否有 `updated_at` 字段
   2. 若有，是否为当前时间
   3. 若缺失或过时，提示用户更新

   如果检测到问题，返回 { decision: "warn", message: "..." }。
   否则返回 { decision: "allow" }。
   ```

2. UserHookLoader 类：
   ```typescript
   export class UserHookLoader {
     constructor(
       private readonly aiGateway: AiGatewayClient,
       private readonly tokenEstimator: (text: string) => number,
     ) {}
   ```

3. 实现 `async loadFromDir(dir: string): Promise<UserHook[]>`：
   - 扫描目录下所有 `.md` 文件
   - 解析 frontmatter（id, version, name, nodes, priority, condition）
   - 验证必填字段
   - 返回 UserHook 实例数组

4. UserHook 实现 Hook 接口：
   ```typescript
   export class UserHook implements Hook {
     readonly metadata: HookMetadata
     private readonly promptBody: string      // frontmatter 下方的 Markdown 内容
     private readonly conditionExpr?: string  // 条件表达式

     async execute(ctx: HookContext): Promise<HookResult> {
       // 1. 评估 condition（如设置）
       if (this.conditionExpr && !this.evaluateCondition(this.conditionExpr, ctx)) {
         return { decision: 'allow' }  // 条件不满足，跳过
       }

       // 2. 构建评估 prompt
       const evalPrompt = this.buildEvaluationPrompt(ctx)

       // 3. 调用便宜模型（Haiku）
       const response = await this.aiGateway.chat({
         model: 'claude-3-haiku-20240307',   // 便宜模型
         messages: [
           { role: 'system', content: '你是 Hook 评估器。根据规则评估并返回 JSON。' },
           { role: 'user', content: evalPrompt },
         ],
         maxTokens: 200,
         temperature: 0,
       })

       // 4. 解析 JSON 响应
       const parsed = this.parseHookResult(response)
       // 用户 Hook 只允许 warn，不允许 block
       if (parsed.decision === 'block') {
         parsed.decision = 'warn'
         parsed.message = '(用户 Hook 无权 block，已降级为 warn) ' + (parsed.message ?? '')
       }
       return parsed
     }
   }
   ```

5. condition 表达式求值：
   - 支持 `tool.name == "xxx"`、`tool.input.path.endsWith(".md")` 等简单表达式
   - 使用安全的沙箱求值（不使用 eval）
   - 求值失败时视为 condition 不满足，跳过 Hook

6. 成本控制：
   - 单次 Haiku 调用 maxTokens=200，成本约 0.0003 USD
   - 满足 ≤ 0.001 USD 约束

**验证：**
- 加载用户 Hook Markdown 文件正确解析
- condition 匹配时执行 AI 评估
- condition 不匹配时跳过
- 用户 Hook 返回 block 时自动降级为 warn
- 成本在预算内

### 步骤 6：HarnessOrchestrator 集成

**文件：** `src/main/services/harness/orchestrator.ts`（最小侵入扩展）

核心策略：在 HookExecutor 可用时委托执行，不可用时走原逻辑。

1. 新增 HookExecutor 可选注入：
   ```typescript
   private hookExecutor: HookExecutor | null = null

   setHookExecutor(executor: HookExecutor): void {
     this.hookExecutor = executor
   }
   ```

2. 在 `executeInternal()` 中插入 Hook 调用点：

   **PreUserMessage**（在意图分析前）：
   ```typescript
   if (this.hookExecutor) {
     const preUserResults = await this.hookExecutor.executeNode('PreUserMessage', {
       node: 'PreUserMessage',
       trigger: { userMessage: request.message },
       conversationId: request.sessionId ?? '',
       workspacePath: request.workspaceId ?? '',
     })
     // 检查是否被 block
     const blocked = preUserResults.find(r => r.decision === 'block')
     if (blocked) {
       return { success: false, error: blocked.message ?? 'PreUserMessage hook blocked' }
     }
   }
   ```

   **PreToolUse**（在工具执行前，替代原有 GuardrailEngine 直接调用）：
   ```typescript
   // 现有代码（保留为 fallback）：
   // const assessment = await this.guards.check(toolName, toolInput)

   // 新逻辑（HookExecutor 可用时）：
   if (this.hookExecutor) {
     const preToolResults = await this.hookExecutor.executeNode('PreToolUse', {
       node: 'PreToolUse',
       trigger: { tool: { name: toolName, input: toolInput } },
       // ... ctx
       userApprovalHandler: async (assessment) => {
         // 复用现有的用户审批 UI 逻辑
       },
     })
     const blocked = preToolResults.find(r => r.decision === 'block')
     if (blocked) {
       // 返回工具被拦截的结果
     }
   } else {
     // fallback: 直接调用 GuardrailEngine
     const assessment = await this.guards.check(toolName, toolInput)
   }
   ```

   **PostToolUse**（在工具返回后）：
   ```typescript
   if (this.hookExecutor) {
     await this.hookExecutor.executeNode('PostToolUse', {
       node: 'PostToolUse',
       trigger: { tool: { name: toolName, input: toolInput }, toolResult: result },
       // ... ctx
     })
   } else {
     // fallback: 直接调用 SensorFeedbackLoop（如有）
   }
   ```

   **PostMessage**（在 assistant 消息完整后）：
   ```typescript
   if (this.hookExecutor) {
     await this.hookExecutor.executeNode('PostMessage', {
       node: 'PostMessage',
       trigger: { assistantMessage: response.content },
       // ... ctx
     })
   }
   // fallback: Evaluator 在原有位置执行（不变化）
   ```

   **PreCompaction / PostCompaction**（预留，在 autoCompact 调用前后）：
   - 当前 Sprint 3.2 的 autoCompact 不在此处触发，仅预留调用点

   **StopCheck**（在模型返回 stop 时）：
   - 检查是否有 Hook 需要模型继续（如注入补充提示）

3. 关键约束：
   - 每个 Hook 调用点都有 `if (this.hookExecutor)` 保护
   - 无 HookExecutor 时，**所有原有逻辑照常执行**
   - 不修改任何 Harness 组件的代码
   - 不修改 Orchestrator 的公共 API

**验证：**
- HookExecutor 注入后，各节点正确调用 Hook
- HookExecutor 未注入时，行为与集成前完全一致
- block 短路正确阻止后续流程
- 已有测试全部通过

### 步骤 7：实现 Reactive Compact

**文件：** `src/main/services/compact/reactive-compact.ts`（新建）

Reactive Compact 是上下文降级链的第 5 层，处理 API 返回的致命错误。

1. 定义类型：
   ```typescript
   export type ReactiveCompactTriggerType =
     | 'prompt_too_long'     // API 413
     | 'max_output_tokens'   // 输出被截断
     | 'media_size'          // 媒体文件过大

   export interface ReactiveCompactTrigger {
     type: ReactiveCompactTriggerType
     error: Error
     messagesAtFailure: ReadonlyArray<{ role: string; content: string }>
     originalMaxTokens?: number
   }

   export interface RecoveryResult {
     recovered: boolean
     strategy: string                        // 恢复策略名称
     recoveredMessages: Array<{ role: string; content: string }>
     tokensAfterRecovery: number
     warnings: string[]
     userAction?: 'retry' | 'clear' | 'compact'
   }

   export interface RecoveryAttempt {
     trigger: ReactiveCompactTrigger
     strategy: string
     success: boolean
     timestamp: number
     tokensBefore: number
     tokensAfter: number
   }
   ```

2. ReactiveCompact 类：
   ```typescript
   export class ReactiveCompact {
     private retryCount = 0
     private static readonly MAX_RETRIES = 3
     private static readonly ESCALATED_MAX_TOKENS = 64000
     private readonly attempts: RecoveryAttempt[] = []

     constructor(
       private readonly tokenEstimator: (text: string) => number,
       private readonly autoCompactFn: (messages: Array<{ role: string; content: string }>) => Promise<Array<{ role: string; content: string }>>,
       private readonly tracer?: Tracer,
     ) {}
   ```

3. 实现 `async tryRecover(trigger: ReactiveCompactTrigger): Promise<RecoveryResult>`：
   ```typescript
   switch (trigger.type) {
     case 'prompt_too_long':
       return this.handlePromptTooLong(trigger)
     case 'max_output_tokens':
       return this.handleMaxOutputTokens(trigger)
     case 'media_size':
       return this.handleMediaSize(trigger)
   }
   ```

4. 实现 `handlePromptTooLong`：
   - **策略 1**：本轮未触发过 autoCompact → 调用 `autoCompactFn(messages)` + 重试
   - **策略 2**：已压缩过但仍太长 → `aggressiveTruncate(messages)`
     - 保留首条 user message（任务锚点，R9 缓解）
     - 保留最近 10 条消息
     - 保留系统提示
     - 裁剪中间的消息
     - 提示用户"已裁剪早期对话以继续"

5. 实现 `handleMaxOutputTokens`：
   - **重试 1**：将 max_tokens 提升到 `ESCALATED_MAX_TOKENS`（64k）重试
   - **重试 2**：注入 meta 消息 `{ role: 'user', content: '从上次中断处继续' }`
   - **重试 3**：失败，返回错误 + 用户选项（/clear、/compact、重写问题）

6. 实现 `handleMediaSize`：
   - 截断过大的媒体内容（图片描述等）
   - 重试

7. 实现 `private aggressiveTruncate(messages)`：
   - 提取首条 user message 作为 anchor
   - 提取最近 N 条消息
   - 组合为：[system, anchor, ...recent_N]
   - 返回裁剪后的消息数组

8. 实现 `getRecoveryHistory(): RecoveryAttempt[]`：
   - 返回历史恢复尝试记录

9. 实现 `resetRetryCount(): void`：
   - 每轮对话开始时重置

**验证：**
- 413 首次触发 autoCompact 后恢复
- 413 第二次触发激进裁剪，保留任务锚点
- max_output_tokens 三次重试策略正确
- 3 次重试后停止，返回用户可操作选项
- 与 Memory 层压缩无干扰

### 步骤 8：实现 CompactOrchestrator

**文件：** `src/main/services/compact/compact-orchestrator.ts`（新建）

CompactOrchestrator 协调 5 层降级链，但本 Sprint 只实现第 5 层（Reactive Compact）。前 4 层已在 Sprint 3.2 中实现，本步骤仅做统一入口封装。

1. 定义 CompactOrchestrator：
   ```typescript
   export class CompactOrchestrator {
     constructor(
       private readonly reactiveCompact: ReactiveCompact,
       private readonly hookExecutor?: HookExecutor,
       private readonly tracer?: Tracer,
     ) {}
   ```

2. 实现 `async handleApiError(error: Error, messages: Array<{ role: string; content: string }>, context: { maxTokens?: number }): Promise<{ recovered: boolean; messages: Array<{ role: string; content: string }>; escalatedMaxTokens?: number; metaMessage?: string }>`：

   - 识别错误类型（413 / max_output_tokens / media_size）
   - 触发 PreCompaction Hook（如有 HookExecutor）
   - 调用 `ReactiveCompact.tryRecover()`
   - 触发 PostCompaction Hook
   - 返回恢复结果
   - 所有过程记录 Trace

3. 用户可见性集成（IPC push）：
   - Reactive Compact 开始时，通过 IPC 推送 `compact:started` 事件到渲染进程
   - 渲染进程在对话区显示"正在整理上下文..."进度提示
   - 恢复成功时推送 `compact:completed`
   - 恢复失败时推送 `compact:failed`（含错误信息与可操作选项）

**验证：**
- CompactOrchestrator 正确识别错误类型并路由到 ReactiveCompact
- Hook 节点在 compaction 前后正确触发
- UI 进度提示正确显示

### 步骤 9：IPC 通道与主进程装配

**文件：** `src/main/ipc/handlers/hook.ts`（新建）

1. 注册 `hook:list` handler：
   - 调用 `HookRegistry.getAll()` 返回 Hook 元数据列表

2. 注册 `hook:enable` handler：
   - 参数：`hookId: string`
   - 调用 `HookRegistry.enable(hookId)`

3. 注册 `hook:disable` handler：
   - 参数：`hookId: string`
   - 调用 `HookRegistry.disable(hookId)`

4. 注册 `hook:trace` handler：
   - 参数：`traceId: string`
   - 查询 TraceStore 获取 `hook_executed` 事件
   - 返回 `HookExecutionLog[]`

**文件：** `src/shared/types.ts`（扩展）

5. 新增 IPC 通道常量：
   ```typescript
   'hook:list': 'hook:list',
   'hook:enable': 'hook:enable',
   'hook:disable': 'hook:disable',
   'hook:trace': 'hook:trace',
   'compact:started': 'compact:started',
   'compact:completed': 'compact:completed',
   'compact:failed': 'compact:failed',
   ```

**文件：** 主进程初始化入口

6. 装配顺序：
   ```
   a. 创建 HookRegistry(userHooksDir, configStore)
   b. 创建内置 Hook: createBuiltinHooks({ guardrailEngine, guideRegistry, sensorFeedbackLoop, evaluator })
   c. await HookRegistry.initialize(builtinHooks)
   d. 创建 HookExecutor(registry, tracer)
   e. 创建 ReactiveCompact(tokenEstimator, autoCompactFn, tracer)
   f. 创建 CompactOrchestrator(reactiveCompact, hookExecutor, tracer)
   g. Orchestrator.setHookExecutor(hookExecutor)
   ```

**验证：** 应用启动后 Hook 系统初始化成功，Hook 列表可通过 IPC 查询。

### 步骤 10：单元测试

**文件：** `tests/main/services/hooks/` 和 `tests/main/services/compact/`

1. `hook-registry.test.ts` 测试用例：
   - 注册 3 个 Hook 到同一节点，按 priority 降序返回
   - 注册到不同节点，getByNode 各自返回正确子集
   - enable/disable 持久化
   - disabled Hook 不出现在 getByNode 结果中
   - 扫描用户 Hook 目录正确加载

2. `hook-executor.test.ts` 测试用例：
   - 按 priority 降序执行
   - block 短路：第 2 个返回 block，第 1 个不执行
   - 超时跳过：模拟 6 秒 Hook，5 秒超时后返回 allow
   - 异常 fail-open：Hook 抛异常，返回 allow
   - modify 注入：Hook 返回 modifications，后续 Hook 看到更新后的 ctx
   - Trace 事件记录

3. `guardrail-hook.test.ts` 测试用例：
   - 危险操作返回 block
   - 安全操作返回 allow
   - 需要用户审批时正确调用 userApprovalHandler

4. `user-hook-loader.test.ts` 测试用例：
   - 解析 Markdown Hook 文件
   - condition 匹配时触发 AI 评估
   - condition 不匹配时跳过
   - 用户 Hook 返回 block 时降级为 warn
   - 必填字段缺失时跳过并 warning

5. `reactive-compact.test.ts` 测试用例：
   - prompt_too_long 首次触发 autoCompact 后恢复
   - prompt_too_long 已压缩过触发激进裁剪
   - 激进裁剪保留首条 user message（任务锚点）
   - max_output_tokens 首次提升 max_tokens
   - max_output_tokens 第二次注入续写 meta 消息
   - max_output_tokens 第三次返回失败
   - 3 次重试后停止

6. `compact-orchestrator.test.ts` 测试用例：
   - 识别 413 错误类型并路由到 handlePromptTooLong
   - PreCompaction Hook 正确触发
   - 恢复成功后返回正确结果

7. `orchestrator-hook-integration.test.ts` 测试用例：
   - HookExecutor 注入后，executeInternal 中各节点被调用
   - HookExecutor 未注入时，executeInternal 走原逻辑
   - block 在 PreToolUse 正确阻止工具调用
   - 已有测试不受影响（回归测试）

**覆盖率目标：** ≥ 80%（P0 要求）

## 现有代码基础

| 已有模块 | 文件路径 | 行数 | 本任务使用方式 |
|---------|---------|------|-------------|
| GuardrailEngine | `harness/guardrails/engine.ts` | ~150 | 委托调用，**不修改** |
| Evaluator | `harness/evaluator.ts` | 227 | 委托调用，**不修改** |
| GuideRegistry | `harness/guides/registry.ts` | ~100 | 委托调用，**不修改** |
| SensorFeedbackLoop | `harness/sensors/feedback-loop.ts` | ~80 | 委托调用，**不修改** |
| HarnessOrchestrator | `harness/orchestrator.ts` | 643 | 最小侵入扩展：新增 HookExecutor 注入点 |
| Tracer | `trace/tracer.ts` | — | Hook 执行产生 Trace |
| AiGatewayClient | `ai-gateway-client.ts` | 82 | Reactive Compact 需要重试 API 调用 |
| ContextEngine | `context-engine/` | — | autoCompact 函数来源（委托） |

**完全缺失、需新建的模块：**

| 模块 | 说明 |
|------|------|
| `hooks/types.ts` | Hook 类型定义 |
| `hooks/HookRegistry.ts` | Hook 注册索引 |
| `hooks/HookExecutor.ts` | Hook 执行引擎 |
| `hooks/built-in/`（4 个文件） | 内置 Hook 适配层 |
| `hooks/user-hook-loader.ts` | 用户 Hook 加载与评估 |
| `hooks/index.ts` | 统一导出 |
| `compact/types.ts` | Compact 类型定义 |
| `compact/reactive-compact.ts` | Reactive Compact 恢复逻辑 |
| `compact/compact-orchestrator.ts` | 5 层降级链协调器 |
| `compact/index.ts` | 统一导出 |
| `ipc/handlers/hook.ts` | Hook IPC 通道 |

## 新增 IPC 通道

| IPC 通道 | 方向 | 说明 |
|---------|------|------|
| `hook:list` | Renderer → Main | 列出所有 Hook 元数据 |
| `hook:enable` | Renderer → Main | 启用指定 Hook |
| `hook:disable` | Renderer → Main | 禁用指定 Hook |
| `hook:trace` | Renderer → Main | 查询 Hook 执行日志 |
| `compact:started` | Main → Renderer | Reactive Compact 开始事件 |
| `compact:completed` | Main → Renderer | Reactive Compact 完成事件 |
| `compact:failed` | Main → Renderer | Reactive Compact 失败事件 |

## 涉及的现有文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `harness/orchestrator.ts` | 最小扩展 | 新增 `setHookExecutor()` + 各节点 if-guard 调用 |
| `shared/types.ts` | 扩展 | 新增 Hook/Compact IPC 通道常量 |
| `preload/index.ts` | 扩展 | 新增 hook 命名空间 |
| IPC 注册入口 | 扩展 | 注册 hook handler |
