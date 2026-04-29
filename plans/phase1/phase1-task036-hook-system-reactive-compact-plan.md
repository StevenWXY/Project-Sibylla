# PHASE1-TASK036: Hook 节点系统与 Reactive Compact — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task036_hook-system-reactive-compact.md](../specs/tasks/phase1/phase1-task036_hook-system-reactive-compact.md)
> 创建日期：2026-04-23
> 最后更新：2026-04-23

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK036 |
| **任务标题** | Hook 节点系统与 Reactive Compact |
| **所属阶段** | Phase 1 - AI 能力扩展体系 (Sprint 3.5) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | TASK017 + TASK018 + TASK019 + TASK027 + TASK035 |

### 1.1 目标

构建两个横切能力：（1）Hook 节点系统——将 Sprint 3.1 的 Guardrail 与 Evaluator 扩展为 8 个细粒度主循环挂载点，允许内置 Hook（TypeScript）与用户 Hook（Markdown 声明式）在特定流程点插入逻辑；（2）Reactive Compact——补齐上下文降级链第 5 层，当 API 返回 413 / max_output_tokens 等错误时自动恢复。

### 1.2 核心设计约束

| 约束 | 来源 | 说明 |
|------|------|------|
| Hook 封装现有组件，不破坏接口 | sprint3.5 §17A.5 | GuardrailEngine/Evaluator/GuideRegistry/SensorFeedbackLoop 接口不变 |
| 用户 Hook 只允许 warn，不允许 block | sprint3.5 §5.6.6 R8 | block 权限仅限内置 Hook |
| Reactive Compact 属于 Context 层 | sprint3.5 §17A.9 | 操作 AI 对话 messages 数组，与 Memory 层压缩独立运行 |
| HookExecutor 未注入时向后兼容 | sprint3.5 §17A.5 | Orchestrator 走原逻辑 |
| TS 严格模式禁止 any | CLAUDE.md §四 | 全部代码遵循 TypeScript 严格模式 |
| 等待超 2 秒需进度反馈 | CLAUDE.md §六 | Reactive Compact 触发时 UI 显示"正在整理上下文..." |
| Hook 执行产生 Trace 事件 | sprint3.5 §4.6.3 | 每次执行记录 hook_executed 事件 |

### 1.3 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| Hook 类型 | `sibylla-desktop/src/main/services/hooks/types.ts` | HookNode / HookMetadata / HookResult / HookContext |
| HookRegistry | `sibylla-desktop/src/main/services/hooks/HookRegistry.ts` | Hook 注册、按节点查询、优先级排序 |
| HookExecutor | `sibylla-desktop/src/main/services/hooks/HookExecutor.ts` | Hook 执行引擎（超时、fail-open、block 短路） |
| GuardrailHook | `sibylla-desktop/src/main/services/hooks/built-in/guardrail-hook.ts` | PreToolUse → GuardrailEngine.check() |
| GuideHook | `sibylla-desktop/src/main/services/hooks/built-in/guide-hook.ts` | PreSystemPrompt → GuideRegistry.resolve() |
| SensorHook | `sibylla-desktop/src/main/services/hooks/built-in/sensor-hook.ts` | PostToolUse → SensorFeedbackLoop.process() |
| EvaluatorHook | `sibylla-desktop/src/main/services/hooks/built-in/evaluator-hook.ts` | PostMessage → Evaluator.evaluate() |
| 内置 Hook 工厂 | `sibylla-desktop/src/main/services/hooks/built-in/index.ts` | createBuiltinHooks() |
| UserHookLoader | `sibylla-desktop/src/main/services/hooks/user-hook-loader.ts` | Markdown 声明式 Hook 加载与 AI 评估 |
| Hook 模块入口 | `sibylla-desktop/src/main/services/hooks/index.ts` | 统一导出 |
| Compact 类型 | `sibylla-desktop/src/main/services/compact/types.ts` | ReactiveCompactTrigger / RecoveryResult |
| ReactiveCompact | `sibylla-desktop/src/main/services/compact/reactive-compact.ts` | API 错误恢复逻辑 |
| CompactOrchestrator | `sibylla-desktop/src/main/services/compact/compact-orchestrator.ts` | 5 层降级链协调 |
| Compact 模块入口 | `sibylla-desktop/src/main/services/compact/index.ts` | 统一导出 |
| IPC Handler | `sibylla-desktop/src/main/ipc/handlers/hook.ts` | hook:list / enable / disable / trace |
| shared/types.ts 扩展 | `sibylla-desktop/src/shared/types.ts` | Hook/Compact IPC 通道常量 |
| Preload API 扩展 | `sibylla-desktop/src/preload/index.ts` | hook 命名空间 |
| Orchestrator 扩展 | `sibylla-desktop/src/main/services/harness/orchestrator.ts` | HookExecutor 注入 + 各节点调用 |
| 单元测试 | `tests/main/services/hooks/*.test.ts` | 覆盖率 ≥ 80% |
| 单元测试 | `tests/main/services/compact/*.test.ts` | 覆盖率 ≥ 80% |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；文件即真相；等待 >2s 需进度反馈；所有异步操作需错误处理；结构化日志 | 全局约束 |
| `specs/requirements/phase1/sprint3.5-ai_ablities.md` | §4.6 Hook 系统设计；§4.7 Reactive Compact 设计；§5.6 需求 3.5.6；§5.7 需求 3.5.7；§17A.5 Hook 映射；§17A.9 Compact 分层 | 验收标准 + 架构约束 |
| `specs/tasks/phase1/phase1-task036_hook-system-reactive-compact.md` | 10 步执行路径、完整验收标准、架构图 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `typescript-strict-mode` | 全模块类型安全；泛型 Hook 接口设计；HookResult 联合类型判别 | 所有 `.ts` 文件 |
| `electron-ipc-patterns` | IPC 通道注册（hook:list 等）；Preload API 扩展；事件推送（compact:started 等） | `ipc/handlers/hook.ts` + `preload/index.ts` |
| `ai-context-engine` | Context 层 compact 链与 Memory 层的独立运行设计；autoCompact 函数委托 | `compact/reactive-compact.ts` |
| `llm-streaming-integration` | 用户 Hook 的 AI 评估调用（便宜模型 Haiku 级） | `hooks/user-hook-loader.ts` |

### 2.3 前置代码依赖

| 模块 | 文件路径 | 复用方式 |
|------|---------|---------|
| `GuardrailEngine` | `sibylla-desktop/src/main/services/harness/guardrails/engine.ts` | **委托调用**：`check(op, ctx) → GuardrailVerdict`，不修改 |
| `GuardrailVerdict` | `sibylla-desktop/src/main/services/harness/guardrails/types.ts:59-72` | Hook 内部转换：allow→allow, conditional→userApproval, block→block |
| `Evaluator` | `sibylla-desktop/src/main/services/harness/evaluator.ts:56` | **委托调用**：`evaluate(input) → EvaluationReport`，不修改 |
| `EvaluatorEvaluateInput` | `sibylla-desktop/src/main/services/harness/evaluator.ts:22` | PostMessage Hook 构建评估输入 |
| `GuideRegistry` | `sibylla-desktop/src/main/services/harness/guides/registry.ts:76` | **委托调用**：`resolve(request, ctx, budget) → Guide[]`，不修改 |
| `Guide` | `sibylla-desktop/src/main/services/harness/guides/types.ts:5-14` | PreSystemPrompt Hook 注入 guide.content 为 systemPromptAppend |
| `SensorFeedbackLoop` | `sibylla-desktop/src/main/services/harness/sensors/feedback-loop.ts:14` | **委托调用**：`process(...)` → SensorFeedbackResult，不修改 |
| `HarnessOrchestrator` | `sibylla-desktop/src/main/services/harness/orchestrator.ts:39` | 最小侵入扩展：新增 `setHookExecutor()` + if-guard 调用点 |
| `Tracer` | `sibylla-desktop/src/main/services/trace/tracer.ts:25` | Hook 执行产生 Trace 事件；`withSpan()` 模式 |
| `AiGatewayClient` | `sibylla-desktop/src/main/services/ai-gateway-client.ts:32` | 用户 Hook 评估（便宜模型调用）；`chat()` 方法 |
| `ContextEngine` | `sibylla-desktop/src/main/services/context-engine/context-engine.ts` | autoCompact 函数来源（委托） |
| `IPC_CHANNELS` | `sibylla-desktop/src/shared/types.ts:72-401` | 扩展新增 Hook/Compact 通道 |
| `IpcHandler` 基类 | `sibylla-desktop/src/main/ipc/handler.ts` | 新建 `HookHandler extends IpcHandler` |
| `PromptComposer` | `sibylla-desktop/src/main/services/context-engine/PromptComposer.ts` | Hook prompt 片段从 Prompt 库加载（TASK035 产物） |

### 2.4 新增 IPC 通道清单

| 通道常量 | 通道名 | 方向 | Handler 方法 |
|---------|--------|------|-------------|
| `HOOK_LIST` | `hook:list` | Renderer→Main | `handleList()` |
| `HOOK_ENABLE` | `hook:enable` | Renderer→Main | `handleEnable()` |
| `HOOK_DISABLE` | `hook:disable` | Renderer→Main | `handleDisable()` |
| `HOOK_TRACE` | `hook:trace` | Renderer→Main | `handleTrace()` |
| `COMPACT_STARTED` | `compact:started` | Main→Renderer | 事件推送 |
| `COMPACT_COMPLETED` | `compact:completed` | Main→Renderer | 事件推送 |
| `COMPACT_FAILED` | `compact:failed` | Main→Renderer | 事件推送 |

---

## 三、现有代码盘点与差距分析

### 3.1 HarnessOrchestrator 现状

**现有 `orchestrator.ts`（643 行）核心流程：**

```
execute() → executeInternal()
  ├─ 读取 AI mode (line 114)
  ├─ Tool scope 选择 (line 122)
  ├─ 解析模式: single/dual/panel (line 138)
  ├─ 解析 guides (line 148)
  ├─ ContextEngine.assembleForHarness() (line 164)
  ├─ 多步任务检测 (line 194)
  ├─ 模式执行: executeSingle / executeDual / executePanel (line 207-217)
  ├─ Evaluator 评估 (line 225)
  ├─ Plan 模式集成 (line 233)
  └─ 降级回退 (line 295)
```

**需要插入 Hook 的节点映射：**

| Hook 节点 | 插入位置（orchestrator.ts 行号） | 当前行为 |
|-----------|-------------------------------|---------|
| PreUserMessage | executeInternal 入口 (~line 112) | 无预处理 |
| PreSystemPrompt | assembleForHarness 前 (~line 160) | 无 |
| PreToolUse | Generator 工具调用前 | GuardrailEngine.check() 直接调用 |
| PostToolUse | Generator 工具返回后 | SensorFeedbackLoop 直接调用 |
| PostMessage | assistant 消息完整后 | Evaluator.evaluate() 直接调用 |
| StopCheck | 模型返回 stop 后 | 无 |
| PreCompaction | autoCompact 调用前 | 预留（当前 autoCompact 在 ContextEngine） |
| PostCompaction | autoCompact 完成后 | 预留 |

### 3.2 Harness 组件接口分析

| 组件 | 方法签名 | 返回类型 | Hook 映射策略 |
|------|---------|---------|-------------|
| `GuardrailEngine.check()` | `(op: FileOperation, ctx: OperationContext) => Promise<GuardrailVerdict>` | allow / block / conditional | 转换：allow→allow, block→block, conditional→userApprovalHandler |
| `GuideRegistry.resolve()` | `(request, ctx, budget?) => readonly Guide[]` | Guide 数组 | 转换：guide.content → systemPromptAppend modification |
| `SensorFeedbackLoop.process()` | `(initialResponse, context, generator, request) => Promise<SensorFeedbackResult>` | {response, signals, corrections} | 转换：有 corrections→warn, 无→allow |
| `Evaluator.evaluate()` | `(input: EvaluatorEvaluateInput) => Promise<EvaluationReport>` | EvaluationReport | 转换：score < threshold→warn, else→allow |

### 3.3 IPC 与 Preload 现状

**现有 harness IPC 通道（harness.ts）：** 17 个通道已注册，Hook 通道为全新新增。

**Preload harness 命名空间：** 已有 `execute`、`setMode`、`listGuardrails` 等方法，hook 命名空间为全新新增。

**ALLOWED_CHANNELS 白名单：** 需新增 `hook:list`、`hook:enable`、`hook:disable`、`hook:trace` + `compact:started`、`compact:completed`、`compact:failed`。

### 3.4 不存在的文件/目录

| 路径 | 状态 |
|------|------|
| `sibylla-desktop/src/main/services/hooks/` | **不存在**，需新建目录 |
| `sibylla-desktop/src/main/services/compact/` | **不存在**，需新建目录 |
| `sibylla-desktop/src/main/ipc/handlers/hook.ts` | **不存在**，需新建 |
| `tests/main/services/hooks/` | **不存在**，需新建 |
| `tests/main/services/compact/` | **不存在**，需新建 |

---

## 四、分步实施计划

### 阶段 A：Hook 共享类型定义（Step 1） — 预计 0.3 天

#### A1：创建 hooks/types.ts

**文件：** `sibylla-desktop/src/main/services/hooks/types.ts`（新建）

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

export interface HookMetadata {
  readonly id: string
  readonly version: string
  readonly name: string
  readonly description: string
  readonly nodes: readonly HookNode[]
  readonly priority: number
  readonly source: 'builtin' | 'user'
  readonly condition?: string
  enabled: boolean
}

export interface HookContextModifications {
  readonly systemPromptAppend?: string
  readonly userMessageOverride?: string
  readonly contextAdditions?: ReadonlyArray<{ readonly key: string; readonly value: string }>
}

export interface HookResult {
  readonly decision: 'allow' | 'block' | 'warn' | 'modify'
  readonly reason?: string
  readonly message?: string
  readonly modifications?: HookContextModifications
}

export interface HookContext {
  readonly node: HookNode
  readonly trigger: {
    readonly userMessage?: string
    readonly tool?: { readonly name: string; readonly input: Record<string, unknown> }
    readonly toolResult?: unknown
    readonly assistantMessage?: string
  }
  readonly conversationId: string
  readonly workspacePath: string
  readonly parentTraceId?: string
  readonly userApprovalHandler?: (assessment: unknown) => Promise<boolean>
}

export interface Hook {
  readonly metadata: HookMetadata
  execute(ctx: HookContext): Promise<HookResult>
}
```

**验证：** TypeScript 编译通过，无 any 类型。

---

### 阶段 B：HookRegistry（Step 2） — 预计 0.5 天

#### B1：创建 HookRegistry.ts

**文件：** `sibylla-desktop/src/main/services/hooks/HookRegistry.ts`（新建）

**内部数据结构：**
```typescript
private readonly hooks = new Map<string, Hook>()
private readonly nodeIndex = new Map<HookNode, Hook[]>()
private readonly disabledHooks = new Set<string>()
```

**构造函数：**
```typescript
constructor(
  private readonly userHooksDir: string | null,
  private readonly configStore: {
    get: (key: string) => unknown
    set: (key: string, val: unknown) => void
  },
)
```

**核心方法实现：**

| 方法 | 签名 | 关键逻辑 |
|------|------|---------|
| `register` | `(hook: Hook) => void` | hooks Map 插入 + nodeIndex 按 nodes 添加 + priority 降序重排 |
| `initialize` | `(builtinHooks: Hook[], userHookLoader?: UserHookLoader) => Promise<void>` | 注册内置 → 扫描用户目录 → 从 configStore 恢复 disabledHooks |
| `getByNode` | `(node: HookNode) => Hook[]` | nodeIndex 查询 → 过滤 disabledHooks |
| `get` | `(id: string) => Hook \| undefined` | hooks Map 查询 |
| `getAll` | `() => HookMetadata[]` | 遍历 hooks Map 返回 metadata |
| `enable` | `(hookId: string) => void` | disabledHooks 删除 + configStore 持久化 |
| `disable` | `(hookId: string) => void` | disabledHooks 添加 + configStore 持久化 |
| `isEnabled` | `(hookId: string) => boolean` | `!disabledHooks.has(hookId)` |

**验证点：**
- 注册 3 个 Hook 到同一节点，`getByNode` 按 priority 降序返回
- `disable` 后 `getByNode` 过滤掉该 Hook
- `getAll` 返回完整元数据列表
- configStore 持久化 enable/disable 状态

---

### 阶段 C：HookExecutor（Step 3） — 预计 0.5 天

#### C1：创建 HookExecutor.ts

**文件：** `sibylla-desktop/src/main/services/hooks/HookExecutor.ts`（新建）

```typescript
export class HookExecutor {
  private static readonly HOOK_TIMEOUT_MS = 5000

  constructor(
    private readonly registry: HookRegistry,
    private readonly tracer?: Tracer,
  ) {}
```

**`executeNode(node, ctx)` 核心流程：**
```
1. registry.getByNode(node) → 获取该节点已启用 Hook
2. 按 priority 降序遍历
3. 每个 Hook 包裹在 runWithTimeout() 中
4. 收集 HookResult
5. 遇到 decision='block' → 短路停止
6. 遇到 decision='modify' → applyModifications 到 ctx
7. 每个 Hook 记录 hook_executed Trace 事件
8. 返回 HookResult[]
```

**`runWithTimeout(hook, ctx, timeoutMs)` 实现：**
```typescript
return Promise.race([
  hook.execute(ctx),
  new Promise<HookResult>((_, reject) =>
    setTimeout(() => reject(new Error('Hook timeout')), timeoutMs)
  ),
]).catch((err) => {
  logger.warn('[HookExecutor] Hook failed/timed out', {
    hookId: hook.metadata.id,
    error: err instanceof Error ? err.message : String(err),
  })
  return { decision: 'allow' as const, reason: 'hook-error-fail-open' }
})
```

**Trace 事件格式：**
```typescript
span.addEvent('hook_executed', {
  node,
  hook_id: hook.metadata.id,
  duration_ms: elapsed,
  decision: result.decision,
  reason: result.reason ?? '',
})
```

**验证点：**
- 3 个 Hook 按 priority 3→2→1 执行
- block 短路：第 2 个返回 block，第 3 个不执行
- 超时跳过：5s 超时后返回 allow，不阻塞
- 异常 fail-open 返回 allow
- Trace 事件正确记录

---

### 阶段 D：内置 Hook 适配层（Step 4） — 预计 0.5 天

#### D1：guardrail-hook.ts

**文件：** `sibylla-desktop/src/main/services/hooks/built-in/guardrail-hook.ts`

**核心适配逻辑：**
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

    const op = this.toFileOperation(ctx.trigger.tool)
    const operationCtx = this.toOperationContext(ctx)
    const verdict = await this.guardrailEngine.check(op, operationCtx)

    if (verdict.allow === true) return { decision: 'allow' }
    if (verdict.allow === 'conditional' && verdict.requireConfirmation) {
      const approved = ctx.userApprovalHandler
        ? await ctx.userApprovalHandler(verdict)
        : false
      if (!approved) {
        return { decision: 'block', reason: 'user-denied', message: '用户拒绝了此操作' }
      }
      return { decision: 'allow' }
    }
    return { decision: 'block', reason: verdict.reason, message: verdict.reason }
  }
}
```

**关键：** `toFileOperation()` 和 `toOperationContext()` 为私有转换方法，将 HookContext.trigger.tool 映射到 GuardrailEngine 所需的 FileOperation/OperationContext 类型。

#### D2：guide-hook.ts

**映射到 PreSystemPrompt 节点，priority: 500**
- 委托 `GuideRegistry.resolve()` 获取匹配 Guide[]
- 将 guide.content 拼接为 `systemPromptAppend` modification
- 返回 `{ decision: 'modify', modifications: { systemPromptAppend } }`

#### D3：sensor-hook.ts

**映射到 PostToolUse 节点，priority: 500**
- 委托 `SensorFeedbackLoop`（简化版：仅收集 signals，不触发 refine 循环）
- 有 error 级别 signal → `{ decision: 'warn', message }`
- 无异常 → `{ decision: 'allow' }`

#### D4：evaluator-hook.ts

**映射到 PostMessage 节点，priority: 800**
- 委托 `Evaluator.evaluate()` 构建评估输入
- `report.score < threshold` → `{ decision: 'warn', message: report.summary }`
- 通过 → `{ decision: 'allow' }`

#### D5：built-in/index.ts

```typescript
export function createBuiltinHooks(deps: {
  guardrailEngine: GuardrailEngine
  guideRegistry?: GuideRegistry
  sensorFeedbackLoop?: SensorFeedbackLoop
  evaluator?: Evaluator
}): Hook[]
```

工厂函数按 deps 可用性创建 Hook 实例，不可用的组件跳过对应 Hook。

**验证点：**
- GuardrailHook 危险操作返回 block
- GuardrailHook 需审批时调用 userApprovalHandler
- GuideHook 返回 systemPromptAppend modification
- 所有现有 Harness 接口零修改

---

### 阶段 E：用户 Hook 加载器（Step 5） — 预计 0.5 天

#### E1：创建 user-hook-loader.ts

**文件：** `sibylla-desktop/src/main/services/hooks/user-hook-loader.ts`（新建）

**用户 Hook Markdown 格式：**
```markdown
---
id: my-custom-hook
version: 1.0.0
name: Markdown 元数据检查
nodes: [PostToolUse]
priority: 500
condition: tool.name == "write-file" and tool.input.path.endsWith(".md")
---

# 规则描述
在每次写入 .md 文件后，检查 frontmatter 是否有 updated_at 字段...
如果检测到问题，返回 { decision: "warn", message: "..." }。
否则返回 { decision: "allow" }。
```

**UserHookLoader 类：**
```typescript
export class UserHookLoader {
  constructor(
    private readonly aiGateway: AiGatewayClient,
    private readonly tokenEstimator: (text: string) => number,
  ) {}

  async loadFromDir(dir: string): Promise<UserHook[]>
}
```

**UserHook.execute() 核心流程：**
```
1. condition 存在 → evaluateCondition()，不满足返回 allow
2. 构建 evalPrompt = buildEvaluationPrompt(ctx)
3. aiGateway.chat({ model: 'claude-3-haiku-20240307', maxTokens: 200, temperature: 0 })
4. parseHookResult(response) → HookResult
5. 用户 Hook 返回 block → 强制降级为 warn + 附加说明
6. 返回 HookResult
```

**condition 表达式求值（安全沙箱）：**
- 支持 `tool.name == "xxx"`、`tool.input.path.endsWith(".md")` 等简单表达式
- 解析为 AST 后手动求值，不使用 eval
- 求值失败视为 condition 不满足，跳过

**成本控制：** maxTokens=200，Haiku 单次 ≈ 0.0003 USD ≤ 0.001 USD 预算

**验证点：**
- 加载 Markdown Hook 正确解析 frontmatter + promptBody
- condition 匹配时执行 AI 评估
- condition 不匹配时跳过
- 用户 Hook 返回 block 时自动降级为 warn
- 必填字段缺失时跳过并 warning

---

### 阶段 F：Reactive Compact（Step 7） — 预计 0.5 天

#### F1：创建 compact/types.ts

**文件：** `sibylla-desktop/src/main/services/compact/types.ts`（新建）

```typescript
export type ReactiveCompactTriggerType =
  | 'prompt_too_long'
  | 'max_output_tokens'
  | 'media_size'

export interface ReactiveCompactTrigger {
  readonly type: ReactiveCompactTriggerType
  readonly error: Error
  readonly messagesAtFailure: ReadonlyArray<{ readonly role: string; readonly content: string }>
  readonly originalMaxTokens?: number
}

export interface RecoveryResult {
  readonly recovered: boolean
  readonly strategy: string
  readonly recoveredMessages: ReadonlyArray<{ readonly role: string; readonly content: string }>
  readonly tokensAfterRecovery: number
  readonly warnings: readonly string[]
  readonly userAction?: 'retry' | 'clear' | 'compact'
}

export interface RecoveryAttempt {
  readonly trigger: ReactiveCompactTrigger
  readonly strategy: string
  readonly success: boolean
  readonly timestamp: number
  readonly tokensBefore: number
  readonly tokensAfter: number
}
```

#### F2：创建 reactive-compact.ts

**文件：** `sibylla-desktop/src/main/services/compact/reactive-compact.ts`（新建）

```typescript
export class ReactiveCompact {
  private retryCount = 0
  private static readonly MAX_RETRIES = 3
  private static readonly ESCALATED_MAX_TOKENS = 64000
  private readonly attempts: RecoveryAttempt[] = []
  private compactedThisTurn = false

  constructor(
    private readonly tokenEstimator: (text: string) => number,
    private readonly autoCompactFn: (
      messages: Array<{ role: string; content: string }>
    ) => Promise<Array<{ role: string; content: string }>>,
    private readonly tracer?: Tracer,
  ) {}
```

**`tryRecover(trigger)` 路由：**

| 触发类型 | 方法 | 策略 |
|---------|------|------|
| `prompt_too_long` | `handlePromptTooLong` | 1) 未 compact 过 → autoCompact + 重试；2) 已 compact → aggressiveTruncate |
| `max_output_tokens` | `handleMaxOutputTokens` | 1) 提升 max_tokens 到 64k；2) 注入续写 meta；3) 失败 |
| `media_size` | `handleMediaSize` | 截断过大媒体 + 重试 |

**`aggressiveTruncate(messages)` 核心逻辑：**
```
1. 提取 system 消息（保留）
2. 提取首条 user message 作为"任务锚点"（R9 缓解）
3. 提取最近 N=10 条消息
4. 组合：[system, anchor, ...recent_10]
5. 添加 compact_boundary 标记
6. 产生 compact_boundary 消息供 Trace 记录
```

**`resetRetryCount()` / `resetTurnState()`：** 每轮对话开始时调用。

**与 Memory 层的隔离：**
- ReactiveCompact 操作的是 AI 对话 messages 数组
- MemoryCompressor/CheckpointScheduler 操作的是 MEMORY.md 和 memory entries
- 两者无共享状态，互不干扰

**验证点：**
- 413 首次触发 autoCompact 后恢复
- 413 第二次触发 aggressiveTruncate，保留任务锚点
- max_output_tokens 三次重试策略（64k → 续写 → 失败）
- 3 次重试后停止，返回用户可操作选项

#### F3：创建 compact-orchestrator.ts

**文件：** `sibylla-desktop/src/main/services/compact/compact-orchestrator.ts`（新建）

```typescript
export class CompactOrchestrator {
  constructor(
    private readonly reactiveCompact: ReactiveCompact,
    private readonly hookExecutor?: HookExecutor,
    private readonly tracer?: Tracer,
  ) {}
```

**`handleApiError(error, messages, context)` 流程：**
```
1. 识别错误类型 → ReactiveCompactTriggerType
2. PreCompaction Hook（如有 HookExecutor）
3. ReactiveCompact.tryRecover(trigger)
4. PostCompaction Hook
5. 返回 { recovered, messages, escalatedMaxTokens?, metaMessage? }
6. 全过程记录 Trace
```

**IPC 推送（用户可见性）：**
- 开始 → `compact:started` 事件
- 成功 → `compact:completed` 事件
- 失败 → `compact:failed` 事件（含错误信息与可操作选项）

---

### 阶段 G：Orchestrator 集成 + IPC + 测试（Step 6/8/9/10） — 预计 2 天

#### G1：HarnessOrchestrator 最小侵入扩展

**文件：** `sibylla-desktop/src/main/services/harness/orchestrator.ts`（修改）

**新增字段和方法：**
```typescript
private hookExecutor: HookExecutor | null = null

setHookExecutor(executor: HookExecutor): void {
  this.hookExecutor = executor
}
```

**各节点插入模式（统一 if-guard 模式）：**

```typescript
// 模式：HookExecutor 可用时委托，不可用时走原逻辑
if (this.hookExecutor) {
  const results = await this.hookExecutor.executeNode('PreToolUse', hookCtx)
  const blocked = results.find(r => r.decision === 'block')
  if (blocked) { /* 返回被拦截结果 */ }
  // 应用 modify 类结果的 modifications
} else {
  // fallback: 原有 GuardrailEngine 直接调用（不变化）
}
```

**8 个节点插入位置：**

| 节点 | 位置 | if-guard 保护 | fallback |
|------|------|-------------|---------|
| PreUserMessage | `executeInternal()` 入口后 | ✓ | 无（原无预处理） |
| PreSystemPrompt | `assembleForHarness()` 前 | ✓ | 无（原无预处理） |
| PreToolUse | Generator 工具调用前 | ✓ | GuardrailEngine.check() |
| PostToolUse | Generator 工具返回后 | ✓ | SensorFeedbackLoop.process() |
| PostMessage | assistant 消息完整后 | ✓ | Evaluator.evaluate() |
| StopCheck | 模型 stop 后 | ✓ | 无 |
| PreCompaction | autoCompact 前 | ✓ | 预留 |
| PostCompaction | autoCompact 后 | ✓ | 预留 |

**关键约束：**
- 每个 Hook 调用点都有 `if (this.hookExecutor)` 保护
- 无 HookExecutor 时所有原有逻辑照常执行
- 不修改任何 Harness 组件代码
- 不修改 Orchestrator 的公共 API

#### G2：IPC Handler 注册

**文件：** `sibylla-desktop/src/main/ipc/handlers/hook.ts`（新建）

```typescript
export class HookHandler extends IpcHandler {
  readonly namespace = 'hook'

  constructor(
    private readonly hookRegistry: HookRegistry,
    private readonly tracerStore?: TraceStore,
  )

  register(): void {
    // hook:list
    ipcMain.handle('hook:list', this.safeHandle(this.handleList.bind(this)))
    // hook:enable
    ipcMain.handle('hook:enable', this.safeHandle(this.handleEnable.bind(this)))
    // hook:disable
    ipcMain.handle('hook:disable', this.safeHandle(this.handleDisable.bind(this)))
    // hook:trace
    ipcMain.handle('hook:trace', this.safeHandle(this.handleTrace.bind(this)))
  }
}
```

**Handler 方法实现：**

| 方法 | 输入 | 输出 | 实现 |
|------|------|------|------|
| `handleList` | 无 | `HookMetadata[]` | `registry.getAll()` |
| `handleEnable` | `hookId: string` | `void` | `registry.enable(hookId)` |
| `handleDisable` | `hookId: string` | `void` | `registry.disable(hookId)` |
| `handleTrace` | `traceId: string` | `HookExecutionLog[]` | 从 TraceStore 查询 `hook_executed` 事件 |

#### G3：shared/types.ts 扩展

**新增 IPC 通道常量：**
```typescript
HOOK_LIST: 'hook:list',
HOOK_ENABLE: 'hook:enable',
HOOK_DISABLE: 'hook:disable',
HOOK_TRACE: 'hook:trace',
COMPACT_STARTED: 'compact:started',
COMPACT_COMPLETED: 'compact:completed',
COMPACT_FAILED: 'compact:failed',
```

**新增 IPCChannelMap 类型映射。**

#### G4：Preload API 扩展

**文件：** `sibylla-desktop/src/preload/index.ts`（修改）

新增 `hook` 命名空间：
```typescript
hook: {
  list: () => Promise<IPCResponse<HookMetadata[]>>
  enable: (hookId: string) => Promise<IPCResponse<void>>
  disable: (hookId: string) => Promise<IPCResponse<void>>
  trace: (traceId: string) => Promise<IPCResponse<HookExecutionLog[]>>
  onCompactStarted: (callback: () => void) => () => void
  onCompactCompleted: (callback: () => void) => () => void
  onCompactFailed: (callback: (error: string) => void) => () => void
}
```

**ALLOWED_CHANNELS 白名单新增 7 个通道。**

#### G5：主进程装配

**在主进程初始化入口中按顺序装配：**
```
1. HookRegistry(userHooksDir, configStore)
2. createBuiltinHooks({ guardrailEngine, guideRegistry, sensorFeedbackLoop, evaluator })
3. await HookRegistry.initialize(builtinHooks, userHookLoader?)
4. HookExecutor(registry, tracer)
5. ReactiveCompact(tokenEstimator, autoCompactFn, tracer)
6. CompactOrchestrator(reactiveCompact, hookExecutor, tracer)
7. orchestrator.setHookExecutor(hookExecutor)
8. HookHandler(hookRegistry, traceStore).register()
```

#### G6：单元测试

**`tests/main/services/hooks/hook-registry.test.ts`：**
- 注册 3 个 Hook 到同一节点，按 priority 降序返回
- 注册到不同节点，getByNode 各自返回正确子集
- enable/disable 持久化
- disabled Hook 不出现在 getByNode 结果中
- getAll 返回完整元数据

**`tests/main/services/hooks/hook-executor.test.ts`：**
- 按 priority 降序执行
- block 短路：第 2 个返回 block，第 1 个不执行
- 超时跳过：模拟 6 秒 Hook，5 秒超时后返回 allow
- 异常 fail-open：Hook 抛异常，返回 allow
- modify 注入：Hook 返回 modifications，后续 Hook 看到更新后的 ctx
- Trace 事件记录

**`tests/main/services/hooks/guardrail-hook.test.ts`：**
- 危险操作返回 block
- 安全操作返回 allow
- 需要用户审批时正确调用 userApprovalHandler

**`tests/main/services/hooks/user-hook-loader.test.ts`：**
- 解析 Markdown Hook 文件
- condition 匹配时触发 AI 评估
- condition 不匹配时跳过
- 用户 Hook 返回 block 时降级为 warn
- 必填字段缺失时跳过并 warning

**`tests/main/services/compact/reactive-compact.test.ts`：**
- prompt_too_long 首次触发 autoCompact 后恢复
- prompt_too_long 已压缩过触发 aggressiveTruncate
- aggressiveTruncate 保留首条 user message（任务锚点）
- max_output_tokens 首次提升 max_tokens
- max_output_tokens 第二次注入续写 meta 消息
- max_output_tokens 第三次返回失败
- 3 次重试后停止

**`tests/main/services/compact/compact-orchestrator.test.ts`：**
- 识别 413 错误类型并路由到 handlePromptTooLong
- PreCompaction Hook 正确触发
- 恢复成功后返回正确结果

**`tests/main/services/hooks/orchestrator-hook-integration.test.ts`：**
- HookExecutor 注入后，executeInternal 中各节点被调用
- HookExecutor 未注入时，executeInternal 走原逻辑
- block 在 PreToolUse 正确阻止工具调用
- 已有测试不受影响（回归测试）

---

## 五、验收标准追踪

### Hook 类型与注册

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | HookNode 包含 8 个值 | A1 types.ts | 编译时验证 |
| 2 | HookResult 支持 4 种决策 | A1 types.ts | C6 hook-executor.test.ts |
| 3 | HookRegistry 启动时注册内置 Hook | B1 HookRegistry.ts + D5 built-in/index.ts | G5 装配验证 |
| 4 | 扫描 `.sibylla/hooks/` 加载用户 Hook | B1 HookRegistry.initialize | E1 user-hook-loader.test.ts |
| 5 | getByNode 按 priority 降序 | B1 HookRegistry.getByNode | G6 hook-registry.test.ts #1 |
| 6 | enable/disable 持久化 | B1 HookRegistry.enable/disable | G6 hook-registry.test.ts #3 |

### Hook 执行

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 7 | executeNode 按 priority 降序执行 | C1 HookExecutor.executeNode | G6 hook-executor.test.ts #1 |
| 8 | block 短路 | C1 executeNode | G6 hook-executor.test.ts #2 |
| 9 | 内置 Hook 可以 block | D1 GuardrailHook | G6 guardrail-hook.test.ts #1 |
| 10 | 用户 Hook 只允许 warn | E1 UserHook.execute | G6 user-hook-loader.test.ts #4 |
| 11 | 超时 5s 跳过不阻塞 | C1 runWithTimeout | G6 hook-executor.test.ts #3 |
| 12 | 异常 fail-open | C1 runWithTimeout catch | G6 hook-executor.test.ts #4 |
| 13 | condition false 跳过 | E1 evaluateCondition | G6 user-hook-loader.test.ts #3 |
| 14 | 用户 Hook 成本 ≤ 0.001 USD | E1 maxTokens=200 | 成本估算验证 |

### 内置 Hook 适配

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 15 | PreToolUse → GuardrailEngine.check() | D1 guardrail-hook.ts | G6 guardrail-hook.test.ts |
| 16 | PostToolUse → SensorFeedbackLoop | D3 sensor-hook.ts | — |
| 17 | PreSystemPrompt → GuideRegistry | D2 guide-hook.ts | — |
| 18 | PostMessage → Evaluator | D4 evaluator-hook.ts | — |
| 19 | 现有接口保持不变 | D1-D5 全部委托调用 | G6 回归测试 |

### Orchestrator 集成

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 20 | executeInternal 按流程点调用 HookExecutor | G1 orchestrator.ts 扩展 | G6 integration.test.ts #1 |
| 21 | 集成点顺序正确 | G1 各 if-guard 位置 | G6 integration.test.ts #1 |
| 22 | HookExecutor 未注入时向后兼容 | G1 if-guard fallback | G6 integration.test.ts #2 |
| 23 | PreCompaction/PostCompaction 预留 | G1 预留调用点 | — |

### Reactive Compact

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 24 | 413 首次 → autoCompact + 重试 | F2 handlePromptTooLong | G6 reactive-compact.test.ts #1 |
| 25 | 413 已 compact → aggressiveTruncate | F2 handlePromptTooLong | G6 reactive-compact.test.ts #2 |
| 26 | max_output_tokens 三次重试 | F2 handleMaxOutputTokens | G6 reactive-compact.test.ts #4-6 |
| 27 | UI 显示"正在整理上下文..." | F3 IPC 推送 compact:started | — |
| 28 | 3 次失败停止，给用户选项 | F2 MAX_RETRIES | G6 reactive-compact.test.ts #7 |
| 29 | compact_boundary 消息被 Trace 记录 | F2 aggressiveTruncate | — |
| 30 | 与 Memory 层独立运行 | F2 架构隔离 | 设计审查 |

### IPC 集成

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 31 | hook:list 返回元数据 | G2 HookHandler.handleList | — |
| 32 | hook:enable/disable 持久化 | G2 + B1 | — |
| 33 | hook:trace 查询日志 | G2 HookHandler.handleTrace | — |

### Trace 集成

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 34 | hook_executed 事件含 node/hook_id/duration_ms/result | C1 Trace 记录 | G6 hook-executor.test.ts #6 |
| 35 | 超时标记 warning | C1 runWithTimeout | — |

---

## 六、风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| R8: 用户 Hook 误判阻塞主循环 | 高 | 用户 Hook 只能 warn 不能 block；内置 Hook 有 block 权限 |
| R9: aggressiveTruncate 丢失重要上下文 | 高 | 保留首条 user message 作任务锚点；裁剪优先丢弃工具结果 |
| Hook 执行拖慢主循环 | 中 | 5 秒超时硬限制；fail-open 原则；condition 不满足时跳过 |
| 内置 Hook 委托调用接口不兼容 | 高 | 类型转换层在 Hook 内部实现；GuardrailEngine 原接口不变 |
| 用户 Hook AI 评估返回非法 JSON | 中 | 解析失败时视为 allow（fail-open）；maxTokens 限制输出 |
| Hook/Compact 目录不存在导致启动失败 | 低 | userHooksDir 可为 null；不存在时跳过用户 Hook 扫描 |
| CompactOrchestrator 与 Memory 层冲突 | 低 | 明确分层：Context 层操作 messages 数组，Memory 层操作 MEMORY.md |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 |
|----|------|--------|
| Day 1 上午 | A1 + B1 | types.ts + HookRegistry.ts |
| Day 1 下午 | C1 | HookExecutor.ts |
| Day 2 上午 | D1-D5 | 4 个内置 Hook + 工厂函数 |
| Day 2 下午 | E1 | UserHookLoader.ts |
| Day 3 上午 | F1-F3 | compact 全部文件 |
| Day 3 下午 | G1 | Orchestrator 集成 |
| Day 4 上午 | G2-G5 | IPC + Preload + 装配 |
| Day 4 下午 | G6 | Hook 相关单元测试 |
| Day 5 上午 | G6 | Compact + 集成测试 |
| Day 5 下午 | — | 回归验证 + 修复 |

---

**文档版本**: v1.0
**最后更新**: 2026-04-23
**维护者**: Sibylla 架构团队
