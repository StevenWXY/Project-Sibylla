# Generator/Evaluator 双 Agent 架构与编排器

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK018 |
| **任务标题** | Generator/Evaluator 双 Agent 架构与编排器 |
| **所属阶段** | Phase 1 - Harness 基础设施 (Sprint 3.1) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

实现 Harness 系统的核心主干——Generator/Evaluator 双 Agent 架构与 HarnessOrchestrator 编排器。将「单 Agent 直给」升级为「Generator 产出 → Evaluator 独立评审 → 反馈改进」的双轨模式，支持 Single / Dual / Panel 三种执行模式。

### 背景

Sprint 3 已实现基础的 AI 对话流式响应（TASK011），AI 直接返回结果给用户。但存在以下问题：
- AI 建议修改重要文件时，没有独立的质量审查环节
- 用户需要肉眼识别 AI 产出中的幻觉、违规、遗漏
- 没有结构化的评审报告，无法追溯 AI 的决策过程

Sprint 3.1 需要在不替换现有功能的前提下，引入双 Agent 架构作为**叠加层**。

### 范围

**包含：**
- `HarnessOrchestrator` 编排器（`src/main/services/harness/orchestrator.ts`）
- `Generator` 封装（`src/main/services/harness/generator.ts`）
- `Evaluator` 封装（`src/main/services/harness/evaluator.ts`）
- `AiGatewaySession` 独立会话层（追加到 `ai-gateway-client.ts`）
- `HarnessConfig` / `HarnessResult` / `EvaluationReport` 类型定义
- `HarnessMode` 三种模式（Single / Dual / Panel）的执行逻辑
- 模式自动解析策略（Spec 文件 → Panel，文件修改 → Dual，其余 → 用户配置）
- Evaluator 独立系统提示（强制挑错模式）
- Generator 改进循环（Evaluator 拒绝 → 反馈 → 最多 2 轮重试）
- 降级机制（Evaluator 失败 → 自动降级为 Single 模式）
- `ContextEngine.assembleForHarness()` 追加方法
- `MemoryManager.appendHarnessTrace()` 追加方法
- `AIHandler.handleHarnessStream()` 分支
- `shared/types.ts` 追加 `AIChatRequest` 可选字段和 IPC 通道常量
- `harnessStore.ts`（渲染进程 Zustand store）
- `HarnessHandler` IPC 入口（`src/main/ipc/handlers/harness.ts`）
- `main/index.ts` Harness 初始化追加
- 单元测试

**不包含：**
- Guides 前馈控制系统（属于 TASK019）
- Sensors 反馈控制系统（属于 TASK019）
- 工具范围管理（属于 TASK020）
- 状态机追踪器（属于 TASK021）
- UI 组件（EvaluationDrawer、ModeSelector 等）（属于 TASK021）

## 验收标准

- [ ] 用户发送文件修改类消息时，系统默认使用 Dual 模式
- [ ] 用户修改 `CLAUDE.md`、`design.md`、`requirements.md` 或 `_spec.md` 时，系统使用 Panel 模式
- [ ] Generator 产出建议后，系统使用独立 LLM session 调用 Evaluator
- [ ] Evaluator 拒绝时，系统将拒绝原因反馈给 Generator 改进（最多 2 轮重试）
- [ ] 所有重试耗尽后，系统展示最终建议和全部评审报告给用户
- [ ] Panel 模式展示共识状态（通过 / 存在异议 / 拒绝）
- [ ] 用户在设置中配置 Single 模式时，跳过评审层
- [ ] Evaluator API 调用失败时，系统记录错误并降级为 Single 模式，UI 显示降级指示
- [ ] `AiGatewayClient.createSession()` 提供独立 session id
- [ ] `ContextEngine.assembleForHarness()` 复用 `assembleContext()` 逻辑并叠加 Guides
- [ ] `AIHandler.handleStream()` 内部正确分支：Single → 现有逻辑，Dual/Panel → 编排路径
- [ ] `harnessStore.ts` 通过 message id 关联 `aiChatStore` 中的消息

## 依赖关系

### 前置依赖

- [x] AiGatewayClient（`src/main/services/ai-gateway-client.ts`）— 追加 `createSession` 方法
- [x] ContextEngine（`src/main/services/context-engine.ts`）— 追加 `assembleForHarness` 方法
- [x] MemoryManager（`src/main/services/memory-manager.ts`）— 追加 `appendHarnessTrace` 方法
- [x] AIHandler（`src/main/ipc/handlers/ai.handler.ts`）— 新增 `handleHarnessStream` 分支
- [x] TASK017（Guardrails）— 编排器内部持有 GuardrailEngine 引用

### 被依赖任务

- TASK019（Guides + Sensors）— Guides 注入编排器上下文，Sensors 在 Generator 产出后运行
- TASK020（意图分类 + 工具范围）— IntentClassifier 结果传入编排器
- TASK021（状态机 + Harness UI）— HarnessOrchestrator 被 TaskStateMachine 消费，UI 展示评审报告

## 参考文档

- [`specs/requirements/phase1/sprint3.1-harness.md`](../../requirements/phase1/sprint3.1-harness.md) — 需求 3.1.1 Generator/Evaluator 双 Agent 架构 + §4.5 叠加层集成策略
- [`CLAUDE.md`](../../../CLAUDE.md) — 架构约束（§三）、代码规范（§四）
- [`specs/design/architecture.md`](../../design/architecture.md) — 进程通信架构、上下文引擎架构
- `.kilocode/skills/phase1/llm-streaming-integration/SKILL.md` — LLM 流式响应集成模式
- `.kilocode/skills/phase1/zustand-state-management/SKILL.md` — Zustand store 设计模式

## 技术执行路径

### 架构设计

```
Harness 核心主干架构

渲染进程                          主进程
  │                                │
  │── AI 对话消息 ─────────────────>│
  │                                │
  │                         AIHandler.handleStream()
  │                                │
  │                     ┌──────────┴──────────┐
  │                     │ resolveHarnessMode() │
  │                     └──────────┬──────────┘
  │                                │
  │              ┌─────────┬───────┴───────┬──────────┐
  │              ▼         ▼               ▼          │
  │         Single     Dual            Panel          │
  │         (现有)   (双Agent)      (三Agent)          │
  │              │         │               │          │
  │              │    Generator       Generator       │
  │              │         │               │          │
  │              │    Evaluator     Evaluator ×2      │
  │              │    (独立session)  (架构+一致性)     │
  │              │         │               │          │
  │              │    [重试循环×2]    [综合评审]       │
  │              │         │               │          │
  │              └────┬────┴───────┬───────┘          │
  │                   │            │                  │
  │                   ▼            ▼                  │
  │             Guardrails    SensorFeedback          │
  │             (TASK017)     (TASK019)               │
  │                   │            │                  │
  │                   ▼            ▼                  │
  │              HarnessResult  HarnessResult         │
  │                   │            │                  │
  │<── stream chunk ──┘            │                  │
  │                                │                  │
  │                          MemoryManager            │
  │                          .appendHarnessTrace()    │
```

### 编排器核心状态流转

```
execute(request)
    │
    ├── resolveMode(request) → 'single' | 'dual' | 'panel'
    │
    ├── [single] → executeSingle()
    │       └── generator.generate(request, context) → 直接返回
    │
    ├── [dual] → executeDual()
    │       ├── generator.generate(request, context)
    │       ├── evaluator.evaluate(suggestion) ← 独立 session
    │       ├── verdict === 'fail' ?
    │       │     ├── YES → generator.refine(rejection) → 回到 evaluate（最多2轮）
    │       │     └── NO  → 继续
    │       └── 返回 HarnessResult
    │
    └── [panel] → executePanel()
            ├── generator.generate(request, context)
            ├── evaluator_arch.evaluate(suggestion) ← 独立 session 1
            ├── evaluator_consistency.evaluate(suggestion) ← 独立 session 2
            ├── 综合评审报告（consensus 计算）
            └── 返回 HarnessResult

    catch (任何异常) → 降级为 executeSingle() + degraded: true
```

### 降级策略

| 异常场景 | 降级行为 | 用户可见提示 |
|---------|---------|------------|
| Evaluator API 调用超时 | 降级为 Single 模式 | "质量审查暂不可用，已跳过" |
| Evaluator 返回非 JSON | 降级为 Single 模式 | "质量审查返回异常，已跳过" |
| Generator 首次调用失败 | 不降级，直接抛出 | "AI 服务异常" |
| Panel 模式中一个 Evaluator 失败 | 用剩余 Evaluator 结果 + 标记部分降级 | "部分评审视角不可用" |
| 所有 Evaluator 失败 | 降级为 Single 模式 | "质量审查暂不可用，已跳过" |

### 核心类型设计

```typescript
// orchestrator.ts 中的核心类型

export type HarnessMode = 'single' | 'dual' | 'panel'

export interface HarnessConfig {
  defaultMode: HarnessMode
  maxRetries: number          // default: 2
  evaluatorModel?: string     // 可与 generator 不同（推荐用 Haiku 降低成本）
  panelEvaluators?: PanelEvaluatorConfig[]
}

export interface HarnessResult {
  finalResponse: AIResponse
  mode: HarnessMode
  generatorAttempts: number
  evaluations: EvaluationReport[]
  sensorSignals: SensorSignal[]       // TASK019 填充
  guardrailVerdicts: GuardrailVerdict[] // TASK017 填充
  degraded: boolean
  degradeReason?: string
}

export interface EvaluationReport {
  evaluatorId: string
  verdict: 'pass' | 'fail'
  dimensions: Record<string, { pass: boolean; issues: string[] }>
  criticalIssues: string[]
  minorIssues: string[]
  rationale: string
  timestamp: number
}
```

## 执行步骤

### 步骤 1：扩展 `shared/types.ts` 的 Harness 契约

**文件：** `src/shared/types.ts`

1. 在现有 `AIChatRequest` 接口中追加可选字段：
   - `intent?: 'chat' | 'modify_file' | 'question_answering' | 'brainstorm' | 'analyze' | 'search' | 'plan'`
   - `targetFile?: string`
   - `explicitTools?: string[]`
2. 新增 `HarnessMode`、`HarnessConfig`、`HarnessResult`、`EvaluationReport`、`DegradationWarning` 共享类型
3. 在 `IPC_CHANNELS` 中追加：
   - `HARNESS_EXECUTE: 'harness:execute'`
   - `HARNESS_SET_MODE: 'harness:setMode'`
   - `HARNESS_GET_MODE: 'harness:getMode'`
   - `HARNESS_DEGRADATION_OCCURRED: 'harness:degradationOccurred'`
4. 所有新增字段均保持 optional，确保对 Sprint 3 现有调用链完全向后兼容

### 步骤 2：为 `AiGatewayClient` 追加独立 Session 层

**文件：** `src/main/services/ai-gateway-client.ts`

1. 新增 `AiGatewaySession` 类，包含 `sessionId`、`role`、`accessToken` 属性
2. 在 constructor 中生成唯一 `sessionId`，格式：`session-${role}-${Date.now()}-${random}`
3. 实现 `chat(request)` 方法：内部复用现有 `AiGatewayClient.chat()`
4. 实现 `chatStream(request, signal?)` 方法：内部复用现有 `AiGatewayClient.chatStream()`
5. 预留 `close()` 方法，用于未来清理 session 级资源
6. 在 `AiGatewayClient` 上追加 `createSession(options, accessToken?)` 方法
7. **关键约束**：现有 `chat()` / `chatStream()` 方法签名和调用方完全不动

### 步骤 3：实现 `Generator` 封装

**文件：** `src/main/services/harness/generator.ts`

1. 创建 `Generator` 类，构造函数接收 `AIGatewayClient`、默认模型名、Logger
2. 实现 `generate(request, context)` 方法：
   - 创建 `generator` 角色 session
   - 组装 system prompt + context + user message
   - 调用 `session.chat()` 返回标准化 `AIResponse`
3. 实现 `refine(input)` 方法：
   - 输入包含原始请求、上一次 suggestion、拒绝报告、上下文
   - 将 Evaluator 的 `criticalIssues` / `minorIssues` 组装为改进提示
   - 创建新 session（避免上下文污染）
   - 产出新的 `AIResponse`
4. 为 `generate()` 与 `refine()` 都增加结构化日志
5. 所有异常向上抛出，不在 Generator 内部吞掉

### 步骤 4：实现 `Evaluator` 封装

**文件：** `src/main/services/harness/evaluator.ts`

1. 创建 `Evaluator` 类，构造函数接收 `AIGatewayClient`、模型名、Logger、accessToken
2. 内置严格评审型 `SYSTEM_PROMPT`，明确要求：
   - 默认不通过，优先找错而非帮助作者润色
   - 检查事实一致性、Spec 合规、无幻觉、边界场景、无静默删除
   - 输出严格 JSON 格式
3. 实现 `evaluate(input)` 方法：
   - 调用 `gateway.createSession({ role: 'evaluator' })`
   - 使用 `temperature: 0.1` 提高评审一致性
   - 发送 system prompt + 格式化后的评审输入
   - 调用 `parseReport()` 解析为 `EvaluationReport`
   - finally 中调用 `session.close()`
4. 实现 `formatInput()`：包含原始用户请求、上下文摘要、待审查 suggestion、历史拒绝记录
5. 实现 `parseReport()`：校验 JSON 结构完整性，缺字段时抛出明确异常，映射到 `EvaluationReport`
6. 任何解析失败都向上抛出，由编排器执行降级

### 步骤 5：实现 `HarnessOrchestrator` 主编排器

**文件：** `src/main/services/harness/orchestrator.ts`

1. 创建 `HarnessOrchestrator` 类，注入 Generator、Evaluator、GuardrailEngine、GuideRegistry（保留接口，TASK019 实现）、ContextEngine、MemoryManager、Logger
2. 实现 `execute(request)` 主入口：
   - 调用 `resolveMode(request)`
   - 调用 `guides.resolve(request, ctx)`（先允许返回空数组）
   - 调用 `contextEngine.assembleForHarness({ ...request, mode, guides })`
   - 分支执行 `executeSingle` / `executeDual` / `executePanel`
3. 在 `execute()` 外层加总 try-catch：
   - 捕获任意异常
   - 记录 `harness.execute.failed`
   - 调用 `executeSingle()` 作为 fail-safe
   - 返回 `{ degraded: true, degradeReason }`
4. 每个阶段都调用 `memoryManager.appendHarnessTrace()` 记录 trace

### 步骤 6：实现模式解析逻辑

**文件：** `src/main/services/harness/orchestrator.ts`

1. 实现 `resolveMode(request)`：
   - 若 `isSpecFile(request.targetFile)` 为 true → `'panel'`
   - 若 `request.intent === 'modify_file'` → `'dual'`
   - 否则返回 `config.defaultMode`
2. 实现 `isSpecFile(path?)`：匹配 `CLAUDE.md`、`design.md`、`requirements.md`、`*_spec.md`、`tasks.md`
3. 将模式决策写入 harness trace 和结构化日志

### 步骤 7：实现 Single 模式

**文件：** `src/main/services/harness/orchestrator.ts`

1. `executeSingle(request, context)` 内直接调用 `generator.generate()`
2. 返回 `HarnessResult`：`mode: 'single'`、`generatorAttempts: 1`、`evaluations: []`、`degraded: false`
3. 该路径尽量复用 Sprint 3 的现有行为，保持体验一致

### 步骤 8：实现 Dual 模式

**文件：** `src/main/services/harness/orchestrator.ts`

1. 初始化 `attempt = 0`，首次调用 `generator.generate()` 生成 suggestion
2. 进入 while 循环（`attempt < maxRetries`）：
   - 调用 `evaluator.evaluate({ request, suggestion, context, history })`
   - 将 report push 进 evals
   - 若 `report.verdict === 'pass'`，退出循环
   - 若为 `fail`，调用 `generator.refine()` 重新生成，`attempt++`
3. 循环结束后返回 `HarnessResult`
4. 若最终仍未通过，把最终 suggestion + 全部 evals 返回给用户
5. 为每轮生成和评审写入 trace：包括 attempt 编号、verdict、critical issue 数量

### 步骤 9：实现 Panel 模式

**文件：** `src/main/services/harness/orchestrator.ts`

1. 首次调用 `generator.generate()` 生成 suggestion
2. 准备两个 Evaluator 实例（`architectureEvaluator`、`consistencyEvaluator`），各自有独立 `evaluatorId`
3. 使用 `Promise.allSettled` 并行调用两个 Evaluator（各自独立 session）
4. 汇总两个报告，计算 `consensus`：
   - 全部 pass → `通过`
   - 一通过一失败 → `存在异议`
   - 全部 fail → `拒绝`
5. 若存在 fail 且未超过 maxRetries，调用 `generator.refine()` 改进（最多 2 轮）
6. 返回 `HarnessResult` 时保留两个报告，供 TASK021 的 EvaluationDrawer 展示
7. 若其中一个 Evaluator 失败，标记 `degraded: true`，用另一个 Evaluator 结果继续

### 步骤 10：追加 `ContextEngine.assembleForHarness()`

**文件：** `src/main/services/context-engine.ts`

1. 新增 `HarnessContextRequest extends ContextAssemblyRequest`，追加 `mode` 和 `guides` 字段
2. 新增 `assembleForHarness(request)` 方法：
   - 内部先调用现有 `assembleContext(request)`
   - 将 Guides 依据优先级排序，生成 `guideContent`
   - 以新对象方式返回：`systemPrompt = guideContent + '\n\n' + base.systemPrompt`
   - 更新 `totalTokens`
3. **关键约束**：不修改原有 `assembleContext()` 签名和行为

### 步骤 11：追加 `MemoryManager.appendHarnessTrace()`

**文件：** `src/main/services/memory-manager.ts`

1. 在 `MemoryLogType` 中追加 `'harness-trace'`
2. 新增 `appendHarnessTrace(traceId, event)` 方法，内部复用现有 `appendLog()`
3. 参数 `event` 包含 `component`、`action`、`result`、`details` 字段
4. 确保该方法为追加式扩展，不影响已有记忆日志逻辑

### 步骤 12：改造 `AIHandler` 进行 Harness 分支

**文件：** `src/main/ipc/handlers/ai.handler.ts`

1. 注入 `HarnessOrchestrator` 实例
2. 在 `handleStream()` 方法内部添加模式判断：
   - 若 mode 为 `single` → 走现有 `handleSingleStream()` 完整逻辑（代码不变）
   - 若 mode 为 `dual` 或 `panel` → 走 `handleHarnessStream()` 新路径
3. 新增 `handleHarnessStream()` 私有方法：
   - 调用 `harnessOrchestrator.execute(request)`
   - 前端显示「AI 正在自检...」的 loading 状态
   - 编排完成后一次性交付结果
   - 将 `HarnessResult` 通过 IPC 返回给渲染进程
4. **关键约束**：现有 `handleSingleStream()` 逻辑完全不动

### 步骤 13：创建渲染进程 `harnessStore.ts`

**文件：** `src/renderer/store/harnessStore.ts`

1. 使用 Zustand `create()` 创建独立 store
2. 状态包含：
   - `currentMode: HarnessMode`（默认 `'dual'`）
   - `activeEvaluations: Map<string, EvaluationReport[]>`（按 message id 索引）
   - `degradationWarnings: DegradationWarning[]`
   - `showEvaluationDrawer: boolean`
3. Action 包含：
   - `setMode(mode)` — 切换执行模式
   - `setEvaluations(msgId, reports)` — 存储评审报告
   - `pushWarning(w)` — 添加降级警告
   - `dismissWarning(id)` — 关闭降级警告
   - `toggleEvaluationDrawer()` — 切换评审报告抽屉
4. store 与 `aiChatStore` 通过 message id 关联，不修改 `ChatMessage` 类型
5. `aiChatStore` 的 `FinalizeData` 新增可选 `harnessMeta` 字段（向后兼容）

### 步骤 14：创建 `HarnessHandler` IPC 入口

**文件：** `src/main/ipc/handlers/harness.ts`

1. 创建 `HarnessHandler` 类，继承 `IpcHandler`
2. 注入 `HarnessOrchestrator`、`GuardrailEngine`、`GuideRegistry`、`TaskStateMachine`
3. 注册 IPC 处理方法：
   - `harness:execute` — 调用编排器执行
   - `harness:setMode` — 设置默认模式
   - `harness:getMode` — 获取当前模式
   - `harness:listGuardrails` — 列出 Guardrail 规则
   - `harness:setGuardrailEnabled` — 启用/禁用规则
   - `harness:listGuides` — 列出 Guide
   - `harness:setGuideEnabled` — 启用/禁用 Guide
   - `harness:listResumeable` — 列出可恢复任务（预留给 TASK021）
   - `harness:resumeTask` — 恢复任务（预留给 TASK021）
   - `harness:abandonTask` — 放弃任务（预留给 TASK021）
4. 所有 IPC 输入经过类型校验

### 步骤 15：在 `main/index.ts` 追加 Harness 初始化

**文件：** `src/main/index.ts`

1. 在现有 `AIHandler` 创建之后追加初始化代码：
   - 创建 `GuardrailEngine`
   - 创建 `GuideRegistry` 并加载内置 Guides
   - 创建 `Generator`（注入 `AiGatewayClient`）
   - 创建 `Evaluator`（注入 `AiGatewayClient`、配置模型）
   - 创建 `HarnessOrchestrator`（注入上述所有组件）
   - 创建 `HarnessHandler` 并注册到 IPC
   - 调用 `fileHandler.setGuardrailEngine(engine)` 注入 Guardrail
2. **关键约束**：现有初始化链路完全不动，仅在末尾追加

### 步骤 16：编写单元测试

**文件：** `tests/harness/`

1. `orchestrator.test.ts` — 编排器测试：
   - Spec 文件请求 → Panel 模式
   - 文件修改请求 → Dual 模式
   - 普通对话 → 用户配置模式
   - Dual 模式：Evaluator 通过 → 直接返回
   - Dual 模式：Evaluator 拒绝 → Generator 重试
   - Dual 模式：重试耗尽 → 返回最终结果 + 全部报告
   - Panel 模式：共识计算（通过/异议/拒绝）
   - 降级：Evaluator 异常 → Single + degraded: true

2. `generator.test.ts` — Generator 测试：
   - 正常生成返回 AIResponse
   - refine 接收拒绝报告后改进
   - session 创建和关闭

3. `evaluator.test.ts` — Evaluator 测试：
   - 独立 session 创建（sessionId 包含 'evaluator'）
   - temperature 为 0.1
   - parseReport 正常解析
   - parseReport 异常 JSON → 抛出
   - session 在 finally 中关闭

4. `harnessStore.test.ts` — 渲染进程 store 测试：
   - 模式切换
   - 评审报告存储和检索
   - 降级警告管理

### 步骤 17：集成验证

1. 运行 `npm run typecheck` 确保类型无误
2. 运行 `npm run lint` 确保代码规范
3. 运行 `npm run test` 确保所有测试通过
4. 在开发环境中验证：通过 AI 对话触发 Dual 模式，确认 Evaluator 独立评审工作正常
5. 验证降级场景：模拟 Evaluator 失败，确认自动降级到 Single 模式

---

**创建时间：** 2026-04-18
**最后更新：** 2026-04-18
