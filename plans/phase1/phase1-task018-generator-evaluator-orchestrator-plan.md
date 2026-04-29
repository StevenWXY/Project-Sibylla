# PHASE1-TASK018: Generator/Evaluator 双 Agent 架构与编排器 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task018_generator-evaluator-orchestrator.md](../specs/tasks/phase1/phase1-task018_generator-evaluator-orchestrator.md)
> 创建日期：2026-04-19
> 最后更新：2026-04-19

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK018 |
| **任务标题** | Generator/Evaluator 双 Agent 架构与编排器 |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | ✅ TASK017 Guardrails、✅ AiGatewayClient、✅ ContextEngine、✅ MemoryManager、✅ AIHandler |

### 1.1 目标

在 Sprint 3 的「单 Agent 直给」模式上叠加 Generator/Evaluator 双 Agent 架构。实现 `HarnessOrchestrator` 编排器，支持 Single / Dual / Panel 三种执行模式，使 AI 从「看起来能用」进化到「可信任、可追责」。

### 1.2 核心命题

当前 `AIHandler.handleStream()`（528 行）将渲染进程请求直接透传给 `AiGatewayClient.chatStream()`。Sprint 3 的 AI 对话能力已上线，但存在以下系统性缺陷：

1. **无独立审查**：AI 建议修改重要文件时，没有独立的质量审查环节
2. **无结构化评审**：用户需肉眼识别幻觉、违规、遗漏，无法追溯 AI 决策过程
3. **无降级兜底**：评审层异常时无明确的 fail-safe 路径

TASK018 在不替换现有功能的前提下，引入双 Agent 架构作为**叠加层**。

### 1.3 范围边界

**包含：**
- `HarnessOrchestrator` 编排器（`src/main/services/harness/orchestrator.ts`）
- `Generator` 封装（`src/main/services/harness/generator.ts`）
- `Evaluator` 封装（`src/main/services/harness/evaluator.ts`）
- `AiGatewaySession` 独立会话层（追加到 `ai-gateway-client.ts`）
- `HarnessConfig` / `HarnessResult` / `EvaluationReport` 共享类型
- `HarnessMode` 三种模式的执行逻辑与模式自动解析
- Evaluator 独立系统提示（强制挑错模式）
- Generator 改进循环（最多 2 轮重试）
- 降级机制（Evaluator 失败 → Single 模式）
- `ContextEngine.assembleForHarness()` 追加方法
- `MemoryManager.appendHarnessTrace()` 追加方法
- `AIHandler.handleHarnessStream()` 分支
- `shared/types.ts` 追加共享类型与 IPC 通道
- `harnessStore.ts`（渲染进程 Zustand store）
- `HarnessHandler` IPC 入口
- `main/index.ts` Harness 初始化追加
- 单元测试

**不包含：**
- Guides 前馈控制系统（TASK019）
- Sensors 反馈控制系统（TASK019）
- 工具范围管理（TASK020）
- 状态机追踪器（TASK021）
- UI 组件（EvaluationDrawer、ModeSelector 等）（TASK021）

### 1.4 叠加层集成原则

遵循 `specs/requirements/phase1/sprint3.1-harness.md` §4.5 叠加层集成策略：

| 原则 | 应用方式 |
|------|---------|
| 物理隔离优先于 prompt 隔离 | Generator 与 Evaluator 使用独立 LLM session，独立系统提示 |
| Harness 对上层透明 | 对话 UI 不感知底层模式，仅通过配置切换 |
| 失败时降级而非崩溃 | Evaluator 失败自动降级 Single 模式，UI 显示降级指示 |
| 所有改造为追加式 | 新增方法/字段/常量，不修改现有方法签名或删除现有逻辑 |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 路径 | 关键约束 | 应用场景 |
|------|------|---------|---------|
| 项目宪法 | `CLAUDE.md` | §三 架构约束：主进程与渲染进程严格隔离通过 IPC 通信；§四 代码规范：TypeScript 严格模式禁止 any，关键操作结构化日志；§六 UI/UX 红线：所有 AI UI 必须有 loading 和错误兜底 | 编排器架构定位、类型设计、日志规范、UI 集成 |
| 系统架构 | `specs/design/architecture.md` | §3.2 进程通信架构：invoke/handle 模式；§4 上下文引擎架构：三层模型 + Token 预算 | IPC 设计、ContextEngine 复用策略 |
| 数据模型 | `specs/design/data-and-api.md` | Workspace 目录结构、IPC 接口规范 | 类型设计约束 |
| 测试与安全 | `specs/design/testing-and-security.md` | §1.1 测试金字塔：单元测试 ≥80%；§3.4 客户端安全 | 测试策略、安全设计验证 |
| 需求规格 | `specs/requirements/phase1/sprint3.1-harness.md` | §1.3 设计原则；§2.1 双 Agent 架构规格；§4.5 叠加层集成策略 | 架构决策依据、接口契约 |
| 任务规格 | `specs/tasks/phase1/phase1-task018_generator-evaluator-orchestrator.md` | 17 步执行路径、验收标准 | 实施步骤蓝图 |

### 2.2 Skill 依赖

| Skill | 路径 | 使用场景 |
|-------|------|---------|
| `llm-streaming-integration` | `.kilocode/skills/phase1/llm-streaming-integration/SKILL.md` | AI 网关架构模式、流式响应在 IPC 中的传输、Token 计算与预算控制、错误处理与重试机制、多模型 session 管理 |
| `zustand-state-management` | `.kilocode/skills/phase1/zustand-state-management/SKILL.md` | `harnessStore.ts` 的 store 设计模式、TypeScript 严格类型安全、selector 优化、与 `aiChatStore` 的关联模式 |
| `ai-context-engine` | `.kilocode/skills/phase1/ai-context-engine/SKILL.md` | `assembleForHarness()` 的上下文组装策略、Token 预算管理、三层模型复用、Guide 注入叠加方式 |
| `electron-ipc-patterns` | `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` | `HarnessHandler` IPC 注册模式、`safeHandle` 包装、主进程推送事件（降级通知）、IPCChannelMap 类型映射 |
| `typescript-strict-mode` | `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` | tagged union（`EvaluationReport.verdict`）、类型守卫、泛型约束、禁止 any |

### 2.3 前置代码依赖

| 模块 | 路径 | 行数 | 状态 | 复用方式 |
|------|------|------|------|---------|
| AiGatewayClient | `src/main/services/ai-gateway-client.ts` | 157 | ⚠️ 需追加 | 新增 `AiGatewaySession` 类 + `createSession()` 方法；现有 `chat()`/`chatStream()` 不动 |
| ContextEngine | `src/main/services/context-engine.ts` | 424 | ⚠️ 需追加 | 新增 `assembleForHarness()` 方法；现有 `assembleContext()` 不动 |
| MemoryManager | `src/main/services/memory-manager.ts` | 498 | ⚠️ 需追加 | 扩展 `MemoryLogType` 新增 `'harness-trace'`；新增 `appendHarnessTrace()` |
| AIHandler | `src/main/ipc/handlers/ai.handler.ts` | 528 | ⚠️ 需追加 | 新增 `handleHarnessStream()` 分支；现有 `handleStream()` 逻辑不动 |
| IpcHandler 基类 | `src/main/ipc/handler.ts` | 221 | ✅ 不修改 | `safeHandle` 包装、`wrapResponse`/`wrapError` 模式复用 |
| GuardrailEngine | `src/main/services/harness/guardrails/engine.ts` | 132 | ✅ 不修改 | 编排器内部持有引用，调用 `check()` |
| shared/types.ts | `src/shared/types.ts` | 1275 | ⚠️ 需扩展 | `AIChatRequest` 追加可选字段；`IPC_CHANNELS` 追加 harness 通道；`IPCChannelMap` 追加类型映射 |
| aiChatStore | `src/renderer/store/aiChatStore.ts` | 230 | ⚠️ 需扩展 | `FinalizeData` 新增可选 `harnessMeta` 字段 |
| main/index.ts | `src/main/index.ts` | 396 | ⚠️ 需追加 | 在 AIHandler 创建之后追加 Harness 初始化链 |
| Logger | `src/main/utils/logger.ts` | — | ✅ 不修改 | 结构化日志输出 |

### 2.4 被依赖任务

| 任务 | 依赖方式 |
|------|---------|
| TASK019（Guides + Sensors） | Guides 注入编排器上下文，Sensors 在 Generator 产出后运行 |
| TASK020（意图分类 + 工具范围） | IntentClassifier 结果传入编排器 |
| TASK021（状态机 + Harness UI） | HarnessOrchestrator 被 TaskStateMachine 消费，UI 展示评审报告 |

### 2.5 npm 依赖

无需新增 npm 包。所有核心依赖已安装：
- `zustand` ^4.x — 渲染进程 store
- `vitest` ^1.2.0 — 单元测试
- `typescript` ^5.3.3 — 严格类型检查

---

## 三、架构设计

### 3.1 Harness 核心主干架构

```
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

### 3.2 编排器核心状态流转

```
execute(request)
    │
    ├── resolveMode(request) → 'single' | 'dual' | 'panel'
    │
    ├── guides.resolve(request, ctx)    ← TASK019 实现，当前返回空数组
    │
    ├── contextEngine.assembleForHarness({ ...request, mode, guides })
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

### 3.3 降级策略

| 异常场景 | 降级行为 | 用户可见提示 |
|---------|---------|------------|
| Evaluator API 调用超时 | 降级为 Single 模式 | "质量审查暂不可用，已跳过" |
| Evaluator 返回非 JSON | 降级为 Single 模式 | "质量审查返回异常，已跳过" |
| Generator 首次调用失败 | 不降级，直接抛出 | "AI 服务异常" |
| Panel 模式中一个 Evaluator 失败 | 用剩余 Evaluator 结果 + 标记部分降级 | "部分评审视角不可用" |
| 所有 Evaluator 失败 | 降级为 Single 模式 | "质量审查暂不可用，已跳过" |

### 3.4 关键设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| Generator/Evaluator 隔离方式 | 独立 LLM session（AiGatewaySession） | 物理隔离优于 prompt 隔离，防止上下文串味 |
| Evaluator 系统提示 | 严格挑错模式，默认不通过 | 确保 Evaluator 不会帮助作者润色而是独立审查 |
| 模式解析策略 | Spec 文件→Panel，文件修改→Dual，其余→用户配置 | 基于风险等级自动匹配执行模式 |
| 降级机制 | try-catch 总包裹 + executeSingle 兜底 | 需求规格 §1.3「失败时降级而非崩溃」 |
| 与 AIHandler 集成 | 内部分支（single→现有逻辑，dual/panel→编排路径） | 叠加层策略，不替换现有流式链路 |
| store 关联方式 | message id 关联，不修改 ChatMessage 类型 | 最小侵入，独立 harnessStore 通过 id 索引 |
| HarnessHandler 独立注册 | 新建独立 IPC handler 而非复用 AIHandler | 职责分离，避免 AIHandler 膨胀 |

### 3.5 文件结构

新建文件：

```
sibylla-desktop/src/main/services/harness/
├── orchestrator.ts              # NEW - HarnessOrchestrator 主编排器
├── generator.ts                 # NEW - Generator 封装
├── evaluator.ts                 # NEW - Evaluator 封装

sibylla-desktop/src/main/ipc/handlers/
└── harness.ts                   # NEW - HarnessHandler IPC 入口

sibylla-desktop/src/renderer/store/
└── harnessStore.ts              # NEW - 渲染进程 Zustand store

sibylla-desktop/tests/harness/
├── orchestrator.test.ts         # NEW - 编排器测试
├── generator.test.ts            # NEW - Generator 测试
├── evaluator.test.ts            # NEW - Evaluator 测试
└── harnessStore.test.ts         # NEW - store 测试
```

需修改的文件：

```
sibylla-desktop/src/shared/types.ts                    # MODIFY - AIChatRequest 扩展 + IPC 通道 + 类型映射
sibylla-desktop/src/main/services/ai-gateway-client.ts  # MODIFY - 追加 AiGatewaySession + createSession
sibylla-desktop/src/main/services/context-engine.ts     # MODIFY - 追加 assembleForHarness
sibylla-desktop/src/main/services/memory-manager.ts     # MODIFY - 追加 harness-trace 类型 + appendHarnessTrace
sibylla-desktop/src/main/ipc/handlers/ai.handler.ts     # MODIFY - 追加 Harness 分支
sibylla-desktop/src/main/index.ts                       # MODIFY - 追加 Harness 初始化
sibylla-desktop/src/renderer/store/aiChatStore.ts       # MODIFY - FinalizeData 追加 harnessMeta
```

### 3.6 数据流

```
渲染进程                          主进程                            Harness 层
    │                               │                                │
    │ ipcRenderer.invoke('ai:stream', request)
    │──────────────────────────────▶│                                │
    │                               │ resolveHarnessMode(request)    │
    │                               │───────────────────────────────▶│
    │                               │                                │ mode: 'dual'
    │                               │                                │
    │                               │                                │ generator.generate()
    │                               │                                │  └── session.chat()
    │                               │                                │
    │                               │                                │ evaluator.evaluate()
    │                               │                                │  └── session.chat() (独立session)
    │                               │                                │
    │                               │                                │ verdict: 'fail' → generator.refine()
    │                               │                                │  └── session.chat() (新session)
    │                               │                                │
    │                               │                                │ evaluator.evaluate() (第2轮)
    │                               │                                │  └── verdict: 'pass'
    │                               │                                │
    │                               │◀── HarnessResult ──────────────│
    │                               │                                │
    │                               │ memoryManager.appendHarnessTrace()
    │                               │                                │
    │<── stream chunks / final ─────│                                │
```

---

## 四、类型系统设计

### 4.1 共享类型扩展（`src/shared/types.ts`）

#### 4.1.1 AIChatRequest 追加可选字段

在现有 `AIChatRequest`（628-651 行）接口中追加三个可选字段。所有新增字段由主进程编排器推断填充，渲染进程现有调用链路无需改动：

```typescript
export interface AIChatRequest {
  message: string
  sessionId?: string
  model?: string
  temperature?: number
  maxTokens?: number
  useRag?: boolean
  contextWindowTokens?: number
  sessionTokenUsage?: number
  currentFile?: string
  manualRefs?: string[]
  skillRefs?: string[]
  intent?: 'chat' | 'modify_file' | 'question_answering' | 'brainstorm' | 'analyze' | 'search' | 'plan'
  targetFile?: string
  explicitTools?: string[]
}
```

#### 4.1.2 Harness 共享类型

在 `types.ts` 末尾追加以下共享类型，作为全模块唯一来源：

```typescript
export type HarnessMode = 'single' | 'dual' | 'panel'

export interface HarnessConfig {
  readonly defaultMode: HarnessMode
  readonly maxRetries: number
  readonly evaluatorModel?: string
  readonly panelEvaluators?: PanelEvaluatorConfig[]
}

export interface PanelEvaluatorConfig {
  readonly id: string
  readonly role: string
  readonly systemPromptOverride?: string
}

export interface HarnessResult {
  readonly finalResponse: AIChatResponse
  readonly mode: HarnessMode
  readonly generatorAttempts: number
  readonly evaluations: EvaluationReport[]
  readonly sensorSignals: SensorSignal[]
  readonly guardrailVerdicts: GuardrailVerdictSummary[]
  readonly degraded: boolean
  readonly degradeReason?: string
}

export interface EvaluationReport {
  readonly evaluatorId: string
  readonly verdict: 'pass' | 'fail'
  readonly dimensions: Record<string, EvaluationDimension>
  readonly criticalIssues: readonly string[]
  readonly minorIssues: readonly string[]
  readonly rationale: string
  readonly timestamp: number
}

export interface EvaluationDimension {
  readonly pass: boolean
  readonly issues: readonly string[]
}

export interface SensorSignal {
  readonly sensorId: string
  readonly severity: 'info' | 'warn' | 'error'
  readonly location?: { readonly file?: string; readonly line?: number; readonly span?: readonly [number, number] }
  readonly message: string
  readonly correctionHint: string
}

export interface GuardrailVerdictSummary {
  readonly ruleId: string
  readonly blocked: boolean
  readonly reason?: string
}

export interface DegradationWarning {
  readonly id: string
  readonly timestamp: number
  readonly reason: string
  readonly originalMode: HarnessMode
  readonly degradedTo: HarnessMode
}

export interface HarnessMeta {
  readonly mode: HarnessMode
  readonly degraded: boolean
  readonly degradeReason?: string
  readonly generatorAttempts: number
}
```

#### 4.1.3 IPC 通道常量追加

在 `IPC_CHANNELS` 对象中追加以下通道：

```typescript
HARNESS_EXECUTE: 'harness:execute',
HARNESS_SET_MODE: 'harness:setMode',
HARNESS_GET_MODE: 'harness:getMode',
HARNESS_DEGRADATION_OCCURRED: 'harness:degradationOccurred',
```

#### 4.1.4 IPCChannelMap 类型映射追加

```typescript
[IPC_CHANNELS.HARNESS_EXECUTE]: { params: [request: AIChatRequest]; return: HarnessResult }
[IPC_CHANNELS.HARNESS_SET_MODE]: { params: [mode: HarnessMode]; return: void }
[IPC_CHANNELS.HARNESS_GET_MODE]: { params: []; return: HarnessMode }
[IPC_CHANNELS.HARNESS_DEGRADATION_OCCURRED]: { params: [warning: DegradationWarning]; return: void }
```

### 4.2 类型设计约束

| 类型 | 设计要求 | 理由 |
|------|---------|------|
| `HarnessResult` | 全字段 `readonly` | 结果为不可变快照，禁止下游篡改 |
| `EvaluationReport` | `verdict` 使用字符串字面量联合 | 严格区分 pass/fail，避免布尔歧义 |
| `EvaluationDimension` | 独立接口而非内联 | 便于未来扩展维度列表 |
| `DegradationWarning` | 含 `originalMode` + `degradedTo` | UI 可展示"从 Panel 降级到 Single" |
| `HarnessMeta` | 可选嵌入 `FinalizeData` | 向后兼容，仅 Harness 激活时存在 |
| `SensorSignal` | 本次任务保留空数组 | 类型先定义，TASK019 填充实际信号 |

### 4.3 AiGatewayClient Session 层追加

在 `src/main/services/ai-gateway-client.ts` 中追加 `AiGatewaySession` 类。**关键约束**：现有 `chat()` / `chatStream()` 方法签名和调用方完全不动。

```typescript
export class AiGatewaySession {
  readonly sessionId: string
  readonly role: 'generator' | 'evaluator'
  private readonly client: AiGatewayClient
  private readonly accessToken?: string

  constructor(client: AiGatewayClient, role: 'generator' | 'evaluator', accessToken?: string) {
    this.client = client
    this.role = role
    this.sessionId = `session-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    this.accessToken = accessToken
  }

  async chat(request: AiGatewayChatRequest): Promise<AiGatewayChatResponse> {
    return this.client.chat(request, this.accessToken)
  }

  async *chatStream(request: AiGatewayChatRequest, signal?: AbortSignal): AsyncGenerator<string, void, undefined> {
    yield* this.client.chatStream(request, this.accessToken, signal)
  }

  close(): void { /* 预留 session 资源清理 */ }
}
```

在 `AiGatewayClient` 类上追加 `createSession` 方法：

```typescript
createSession(options: { role: 'generator' | 'evaluator' }, accessToken?: string): AiGatewaySession {
  return new AiGatewaySession(this, options.role, accessToken)
}
```

### 4.4 ContextEngine 扩展类型

在 `src/main/services/context-engine.ts` 中追加请求接口和方法：

```typescript
export interface HarnessContextRequest extends ContextAssemblyRequest {
  mode: HarnessMode
  guides: Guide[]
}
```

其中 `Guide` 类型在 TASK019 中定义。当前阶段先使用最小化占位接口：

```typescript
export interface GuidePlaceholder {
  id: string
  priority: number
  content: string
}
```

### 4.5 MemoryManager 扩展类型

在 `MemoryLogType` 中追加 `'harness-trace'`：

```typescript
export type MemoryLogType =
  | 'user-interaction'
  | 'command-exec'
  | 'file-operation'
  | 'decision'
  | 'error'
  | 'system'
  | 'harness-trace'
```

追加 `HarnessTraceEvent` 接口：

```typescript
export interface HarnessTraceEvent {
  component: 'orchestrator' | 'evaluator' | 'sensor' | 'guardrail' | 'guide' | 'state-machine'
  action: string
  result: string
  details?: string[]
}
```

---

## 五、Generator 封装设计

**文件：** `src/main/services/harness/generator.ts`

### 5.1 职责

Generator 是 AI 产出的封装层，负责：
1. 接收用户请求和组装后的上下文，通过独立 session 调用 LLM 生成初始建议
2. 接收 Evaluator 拒绝报告，通过新 session 调用 LLM 进行改进
3. 所有异常向上抛出，不在 Generator 内部吞掉

### 5.2 类设计

```typescript
export interface GeneratorGenerateInput {
  readonly request: AIChatRequest
  readonly context: AssembledContext
}

export interface GeneratorRefineInput {
  readonly originalRequest: AIChatRequest
  readonly previousResponse: AIChatResponse
  readonly rejectionReport: EvaluationReport
  readonly context: AssembledContext
  readonly attemptNumber: number
}

export class Generator {
  constructor(
    private readonly gateway: AiGatewayClient,
    private readonly defaultModel: string,
    private readonly logger: typeof import('../../utils/logger').logger
  ) {}
}
```

### 5.3 generate() 方法

```
generate(input: GeneratorGenerateInput): Promise<AIChatResponse>
  │
  ├── session = gateway.createSession({ role: 'generator' })
  │
  ├── 组装 messages:
  │     ├── { role: 'system', content: context.systemPrompt }
  │     └── { role: 'user', content: input.request.message }
  │
  ├── response = session.chat({ model, messages, temperature, maxTokens })
  │
  ├── logger.info('harness.generator.generated', { sessionId, model, usage })
  │
  ├── finally: session.close()
  │
  └── return response
```

**关键约束：**
- 使用 `gateway.createSession()` 获取独立 session，避免上下文污染
- `temperature` 默认使用 `input.request.temperature` 或 0.7
- `model` 默认使用 `this.defaultModel`
- 所有异常不捕获，直接向上抛给编排器

### 5.4 refine() 方法

```
refine(input: GeneratorRefineInput): Promise<AIChatResponse>
  │
  ├── session = gateway.createSession({ role: 'generator' })  ← 新 session
  │
  ├── 组装改进提示:
  │     ├── system prompt（同 generate）
  │     ├── { role: 'user', content: 原始用户消息 }
  │     ├── { role: 'assistant', content: 上一次 AI 回复 }
  │     └── { role: 'user', content: formatRefinePrompt(input) }
  │
  ├── formatRefinePrompt():
  │     ├── "评审者拒绝了你的上次建议，原因如下："
  │     ├── 遍历 criticalIssues → "严重问题: ..."
  │     ├── 遍历 minorIssues → "次要问题: ..."
  │     ├── 遍历 dimensions 中未通过的 → "...: ..."
  │     └── "请根据以上反馈重新生成建议。这是第 {attemptNumber} 次改进。"
  │
  ├── response = session.chat({ model, messages, temperature: 0.5 })
  │
  ├── logger.info('harness.generator.refined', { sessionId, attempt: attemptNumber })
  │
  ├── finally: session.close()
  │
  └── return response
```

**关键约束：**
- 每次 refine 都创建新 session，避免历史污染
- `temperature` 降低到 0.5，提高改进的聚焦度
- 改进提示结构化呈现 Evaluator 的反馈，便于 LLM 定位问题

---

## 六、Evaluator 封装设计

**文件：** `src/main/services/harness/evaluator.ts`

### 6.1 职责

Evaluator 是独立质量审查的封装层，负责：
1. 使用独立 session 和严格系统提示对 Generator 产出进行评审
2. 使用低 temperature（0.1）提高评审一致性
3. 解析 LLM 返回的 JSON 为结构化 `EvaluationReport`
4. 任何解析失败都向上抛出，由编排器执行降级

### 6.2 类设计

```typescript
export interface EvaluatorEvaluateInput {
  readonly request: AIChatRequest
  readonly suggestion: AIChatResponse
  readonly context: AssembledContext
  readonly history: readonly EvaluationReport[]
  readonly evaluatorId?: string
}

export class Evaluator {
  constructor(
    private readonly gateway: AiGatewayClient,
    private readonly model: string,
    private readonly logger: typeof import('../../utils/logger').logger,
    private readonly accessToken?: string
  ) {}
}
```

### 6.3 系统提示设计

```typescript
private readonly SYSTEM_PROMPT = `
You are a strict quality reviewer for the Sibylla project. Your role is NOT to
be helpful to the author—your role is to find problems. Default to rejection.
Only approve when you are certain there are no issues in the following dimensions:

1. Factual consistency with the provided context files
2. Compliance with project conventions in CLAUDE.md
3. Absence of hallucinated file paths, function names, or Skill names
4. Correct handling of edge cases mentioned in existing specs
5. No silent removal of existing content without explicit justification
6. Respect for "AI suggests, human decides" principle (no irreversible commands)

Output JSON:
{
  "verdict": "pass" | "fail",
  "dimensions": {
    "factual_consistency": { "pass": bool, "issues": [...] },
    "spec_compliance": { "pass": bool, "issues": [...] },
    "no_hallucination": { "pass": bool, "issues": [...] },
    "edge_cases": { "pass": bool, "issues": [...] },
    "no_silent_deletion": { "pass": bool, "issues": [...] }
  },
  "critical_issues": [...],
  "minor_issues": [...],
  "rationale": "..."
}
`.trim()
```

### 6.4 evaluate() 方法

```
evaluate(input: EvaluatorEvaluateInput): Promise<EvaluationReport>
  │
  ├── evaluatorId = input.evaluatorId ?? 'evaluator-default'
  │
  ├── session = gateway.createSession({ role: 'evaluator' }, accessToken)
  │
  ├── try:
  │     ├── response = session.chat({
  │     │     model: this.model,
  │     │     messages: [
  │     │       { role: 'system', content: SYSTEM_PROMPT },
  │     │       { role: 'user', content: formatInput(input) }
  │     │     ],
  │     │     temperature: 0.1
  │     │   })
  │     ├── report = parseReport(response.content, evaluatorId)
  │     ├── logger.info('harness.evaluator.evaluated', { evaluatorId, verdict, issues })
  │     └── return report
  │
  ├── finally: session.close()
```

### 6.5 formatInput() 方法

```
formatInput(input): string
  ├── "# Original User Request\n{input.request.message}"
  ├── "# Context Summary\n{summarizeContext(input.context)}"
  ├── "# Suggestion to Review\n{input.suggestion.content}"
  └── 若 history.length > 0:
        "# Previous Rejection History\n{formatHistory(input.history)}"
```

### 6.6 parseReport() 方法

```
parseReport(rawContent: string, evaluatorId: string): EvaluationReport
  │
  ├── 从 rawContent 中提取 JSON（支持 markdown 代码块包裹）
  │
  ├── JSON.parse() → 校验结构完整性:
  │     ├── 必须包含 verdict: 'pass' | 'fail'
  │     ├── 必须包含 dimensions: object
  │     ├── 必须包含 criticalIssues: string[]
  │     ├── 必须包含 minorIssues: string[]
  │     └── 必须包含 rationale: string
  │
  ├── 缺字段 → throw new Error('Evaluator response missing required field: ...')
  │
  └── return {
       evaluatorId,
       verdict: parsed.verdict,
       dimensions: parsed.dimensions,
       criticalIssues: parsed.critical_issues,
       minorIssues: parsed.minor_issues,
       rationale: parsed.rationale,
       timestamp: Date.now()
     }
```

**JSON 提取策略：**
1. 尝试直接 `JSON.parse(rawContent)`
2. 若失败，尝试提取 `\`\`\`json\n...\n\`\`\`` 中的内容
3. 若仍失败，尝试提取第一个 `{` 到最后一个 `}` 之间的内容
4. 全部失败则抛出明确异常

---

## 七、HarnessOrchestrator 编排器核心设计

**文件：** `src/main/services/harness/orchestrator.ts`

### 7.1 职责

编排器是 Harness 系统的核心中枢，负责：
1. 解析执行模式（Single / Dual / Panel）
2. 协调 Generator、Evaluator、GuardrailEngine 的执行顺序
3. 管理改进循环（Evaluator 拒绝 → Generator 重试）
4. 异常兜底与降级机制
5. 记录完整 harness trace 到 MemoryManager

### 7.2 类设计

```typescript
export class HarnessOrchestrator {
  private readonly config: HarnessConfig

  constructor(
    private readonly generator: Generator,
    private readonly evaluator: Evaluator,
    private readonly guards: GuardrailEngine,
    private readonly contextEngine: ContextEngine,
    private readonly memoryManager: MemoryManager,
    private readonly logger: typeof import('../../utils/logger').logger,
    config?: Partial<HarnessConfig>
  ) {
    this.config = {
      defaultMode: config?.defaultMode ?? 'dual',
      maxRetries: config?.maxRetries ?? 2,
      evaluatorModel: config?.evaluatorModel,
      panelEvaluators: config?.panelEvaluators ?? [
        { id: 'architecture', role: 'Architecture Reviewer' },
        { id: 'consistency', role: 'Consistency Reviewer' },
      ],
    }
  }
}
```

### 7.3 execute() 主入口

```
execute(request: AIChatRequest): Promise<HarnessResult>
  │
  ├── traceId = `harness-${Date.now()}-${random}`
  │
  ├── mode = resolveMode(request)
  │
  ├── memoryManager.appendHarnessTrace(traceId, {
  │     component: 'orchestrator',
  │     action: 'mode_resolved',
  │     result: mode,
  │     details: [request.targetFile, request.intent]
  │   })
  │
  ├── context = contextEngine.assembleForHarness({
  │     userMessage: request.message,
  │     currentFile: request.currentFile ?? request.targetFile,
  │     manualRefs: request.manualRefs ?? [],
  │     skillRefs: request.skillRefs,
  │     mode,
  │     guides: []   // TASK019 填充
  │   })
  │
  ├── try:
  │     switch (mode):
  │       'single' → executeSingle(request, context, traceId)
  │       'dual'   → executeDual(request, context, traceId)
  │       'panel'  → executePanel(request, context, traceId)
  │
  └── catch (err):
        logger.error('harness.execute.failed', { mode, traceId, err })
        try:
          result = executeSingle(request, context, traceId)
          return { ...result, degraded: true, degradeReason: String(err) }
        catch (fallbackErr):
          throw fallbackErr  // Generator 也失败则无降级余地
```

### 7.4 resolveMode() 模式解析

```
resolveMode(request: AIChatRequest): HarnessMode
  │
  ├── if isSpecFile(request.targetFile) → 'panel'
  │     匹配规则: /(_spec\.md|CLAUDE\.md|design\.md|requirements\.md|tasks\.md)$/
  │
  ├── if request.intent === 'modify_file' → 'dual'
  │
  ├── else → config.defaultMode
  │
  └── logger.info('harness.mode.resolved', { mode, targetFile, intent })
```

### 7.5 executeSingle()

```
executeSingle(request, context, traceId): HarnessResult
  │
  ├── response = generator.generate({ request, context })
  │
  ├── memoryManager.appendHarnessTrace(traceId, {
  │     component: 'orchestrator',
  │     action: 'single_completed',
  │     result: 'success'
  │   })
  │
  └── return {
       finalResponse: response,
       mode: 'single',
       generatorAttempts: 1,
       evaluations: [],
       sensorSignals: [],
       guardrailVerdicts: [],
       degraded: false
     }
```

### 7.6 executeDual()

```
executeDual(request, context, traceId): HarnessResult
  │
  ├── suggestion = generator.generate({ request, context })
  │
  ├── evaluations: EvaluationReport[] = []
  ├── attempt = 0
  │
  ├── while (attempt < config.maxRetries):
  │     ├── report = evaluator.evaluate({
  │     │     request, suggestion, context,
  │     │     history: evaluations
  │     │   })
  │     ├── evaluations.push(report)
  │     │
  │     ├── memoryManager.appendHarnessTrace(traceId, {
  │     │     component: 'evaluator',
  │     │     action: 'evaluate',
  │     │     result: report.verdict,
  │     │     details: [`attempt=${attempt+1}`, `criticalIssues=${report.criticalIssues.length}`]
  │     │   })
  │     │
  │     ├── if report.verdict === 'pass' → break
  │     │
  │     ├── suggestion = generator.refine({
  │     │     originalRequest: request,
  │     │     previousResponse: suggestion,
  │     │     rejectionReport: report,
  │     │     context,
  │     │     attemptNumber: attempt + 1
  │     │   })
  │     │
  │     ├── memoryManager.appendHarnessTrace(traceId, {
  │     │     component: 'orchestrator',
  │     │     action: 'generator_refined',
  │     │     result: 'retrying',
  │     │     details: [`attempt=${attempt+1}`]
  │     │   })
  │     │
  │     └── attempt++
  │
  ├── memoryManager.appendHarnessTrace(traceId, {
  │     component: 'orchestrator',
  │     action: 'dual_completed',
  │     result: evaluations[evaluations.length-1]?.verdict ?? 'unknown',
  │     details: [`totalAttempts=${attempt+1}`]
  │   })
  │
  └── return {
       finalResponse: suggestion,
       mode: 'dual',
       generatorAttempts: attempt + 1,
       evaluations,
       sensorSignals: [],
       guardrailVerdicts: [],
       degraded: false
     }
```

### 7.7 executePanel()

```
executePanel(request, context, traceId): HarnessResult
  │
  ├── suggestion = generator.generate({ request, context })
  │
  ├── evaluations: EvaluationReport[] = []
  ├── degraded = false
  ├── degradeReason: string | undefined
  │
  ├── 准备两个 Evaluator 实例:
  │     evaluatorArch: evaluatorId = 'architecture'
  │     evaluatorConsistency: evaluatorId = 'consistency'
  │
  ├── Promise.allSettled([
  │     evaluator.evaluate({ ..., evaluatorId: 'architecture' }),
  │     evaluator.evaluate({ ..., evaluatorId: 'consistency' })
  │   ])
  │
  ├── 汇总结果:
  │     results.forEach:
  │       fulfilled → evaluations.push(value)
  │       rejected → degraded = true, logger.warn(...)
  │
  ├── if evaluations.length === 0:
  │     └── throw new Error('All evaluators failed in panel mode')
  │
  ├── consensus = computeConsensus(evaluations):
  │     全部 pass → 'passed'
  │     一 pass 一 fail → 'contested'
  │     全部 fail → 'rejected'
  │
  ├── memoryManager.appendHarnessTrace(traceId, {
  │     component: 'orchestrator',
  │     action: 'panel_evaluated',
  │     result: consensus,
  │     details: evaluations.map(e => `${e.evaluatorId}:${e.verdict}`)
  │   })
  │
  ├── if consensus !== 'passed' && attempt < maxRetries:
  │     ├── suggestion = generator.refine(...)
  │     ├── 重新执行两个 Evaluator（最多 1 轮改进，Panel 成本高）
  │     └── 更新 evaluations 和 consensus
  │
  └── return {
       finalResponse: suggestion,
       mode: 'panel',
       generatorAttempts: attempt + 1,
       evaluations,
       sensorSignals: [],
       guardrailVerdicts: [],
       degraded,
       degradeReason
     }
```

### 7.8 computeConsensus() 共识计算

```typescript
private computeConsensus(reports: EvaluationReport[]): 'passed' | 'contested' | 'rejected' {
  const verdicts = reports.map(r => r.verdict)
  const allPass = verdicts.every(v => v === 'pass')
  const allFail = verdicts.every(v => v === 'fail')

  if (allPass) return 'passed'
  if (allFail) return 'rejected'
  return 'contested'
}
```

---

## 八、服务层扩展

### 8.1 ContextEngine.assembleForHarness()

**文件：** `src/main/services/context-engine.ts`

在现有 `assembleContext()` 方法之后追加新方法。**关键约束**：不修改原有 `assembleContext()` 签名和行为。

```typescript
async assembleForHarness(request: HarnessContextRequest): Promise<AssembledContext> {
  // 复用 assembleContext 的三层组装逻辑
  const base = await this.assembleContext({
    userMessage: request.userMessage,
    currentFile: request.currentFile,
    manualRefs: request.manualRefs,
    skillRefs: request.skillRefs,
  })

  // 叠加 Guides 到 system prompt（创建新对象，不修改原对象）
  if (request.guides.length > 0) {
    const guideContent = request.guides
      .sort((a, b) => b.priority - a.priority)
      .map(g => `[Guide: ${g.id}]\n${g.content}`)
      .join('\n\n')

    return {
      ...base,
      systemPrompt: `${guideContent}\n\n${base.systemPrompt}`,
      totalTokens: base.totalTokens + this.estimateTokens(guideContent),
    }
  }

  return base
}
```

### 8.2 MemoryManager.appendHarnessTrace()

**文件：** `src/main/services/memory-manager.ts`

在 `MemoryLogType` 联合类型中追加 `'harness-trace'`，然后追加便捷方法：

```typescript
async appendHarnessTrace(traceId: string, event: HarnessTraceEvent): Promise<void> {
  await this.appendLog({
    type: 'harness-trace',
    operator: `harness:${event.component}`,
    sessionId: traceId,
    summary: `${event.component}:${event.action} → ${event.result}`,
    details: event.details,
    tags: ['harness', event.component],
  })
}
```

### 8.3 AIHandler Harness 分支

**文件：** `src/main/ipc/handlers/ai.handler.ts`

在 AIHandler 中注入 `HarnessOrchestrator` 并在 `handleStream()` 内部分支。

#### 8.3.1 注入方式

```typescript
export class AIHandler extends IpcHandler {
  private harnessOrchestrator: HarnessOrchestrator | null = null

  setHarnessOrchestrator(orchestrator: HarnessOrchestrator): void {
    this.harnessOrchestrator = orchestrator
  }
}
```

#### 8.3.2 handleStream() 分支逻辑

```
handleStream(event, input):
  │
  ├── 现有 normalizeRequest() 逻辑不变
  │
  ├── if harnessOrchestrator is null:
  │     └── 走现有 handleSingleStream() 完整逻辑（代码不变）
  │
  ├── mode = harnessOrchestrator.resolveMode(normalizedRequest)
  │
  ├── if mode === 'single':
  │     └── return handleSingleStream(event, input)  // 现有逻辑完全不动
  │
  └── return handleHarnessStream(event, input, mode)
```

#### 8.3.3 handleHarnessStream() 新方法

```
handleHarnessStream(event, input, mode):
  │
  ├── streamId = extractStreamId(input)
  │
  ├── 发送 loading 状态给渲染进程:
  │     event.sender.send(IPC_CHANNELS.AI_STREAM_CHUNK, {
  │       id: streamId,
  │       delta: '⏳ AI 正在自检中...\n'
  │     })
  │
  ├── try:
  │     ├── result = await harnessOrchestrator.execute(normalizedRequest)
  │     │
  │     ├── if result.degraded:
  │     │     broadcastToAllWindows(
  │     │       IPC_CHANNELS.HARNESS_DEGRADATION_OCCURRED,
  │     │       { id, timestamp, reason: result.degradeReason, originalMode: mode, degradedTo: 'single' }
  │     │     )
  │     │
  │     ├── 发送最终内容:
  │     │     event.sender.send(IPC_CHANNELS.AI_STREAM_CHUNK, {
  │     │       id: streamId,
  │     │       delta: result.finalResponse.content
  │     │     })
  │     │
  │     └── event.sender.send(IPC_CHANNELS.AI_STREAM_END, {
  │           id: streamId,
  │           content: result.finalResponse.content,
  │           usage: result.finalResponse.usage,
  │           harnessMeta: { mode, degraded, degradeReason, generatorAttempts }
  │         })
  │
  └── catch (err):
        event.sender.send(IPC_CHANNELS.AI_STREAM_ERROR, {
          id: streamId,
          code: 'HARNESS_ERROR',
          message: String(err),
          retryable: true
        })
```

**关键约束：**
- 现有 `handleSingleStream()` 逻辑完全不动
- `handleHarnessStream()` 是新增私有方法
- Dual/Panel 模式下不使用实时流式，而是编排完成后一次性交付
- 降级事件通过 `broadcastToAllWindows` 推送到所有窗口

---

## 九、HarnessHandler IPC 入口

**文件：** `src/main/ipc/handlers/harness.ts`

### 9.1 类设计

```typescript
export class HarnessHandler extends IpcHandler {
  readonly namespace = 'harness'

  constructor(
    private readonly orchestrator: HarnessOrchestrator,
    private readonly guardrailEngine: GuardrailEngine,
    private readonly config: { defaultMode: HarnessMode }
  ) {}
}
```

### 9.2 注册的 IPC 处理方法

| IPC 通道 | 方法 | 说明 |
|---------|------|------|
| `harness:execute` | `handleExecute` | 调用编排器执行，返回 `HarnessResult` |
| `harness:setMode` | `handleSetMode` | 设置默认执行模式 |
| `harness:getMode` | `handleGetMode` | 获取当前默认模式 |
| `harness:listGuardrails` | `handleListGuardrails` | 委托 GuardrailEngine.listRules() |
| `harness:setGuardrailEnabled` | `handleSetGuardrailEnabled` | 委托 GuardrailEngine.setRuleEnabled() |

### 9.3 register() 方法

```typescript
register(): void {
  // harness:execute
  ipcMain.handle(IPC_CHANNELS.HARNESS_EXECUTE,
    this.safeHandle(async (_event, request: AIChatRequest) => {
      return this.orchestrator.execute(request)
    })
  )

  // harness:setMode
  ipcMain.handle(IPC_CHANNELS.HARNESS_SET_MODE,
    this.safeHandle(async (_event, mode: HarnessMode) => {
      this.config.defaultMode = mode
    })
  )

  // harness:getMode
  ipcMain.handle(IPC_CHANNELS.HARNESS_GET_MODE,
    this.safeHandle(async () => {
      return this.config.defaultMode
    })
  )

  // harness:listGuardrails (已有 IPC 通道，从 HarnessHandler 统一暴露)
  ipcMain.handle(IPC_CHANNELS.HARNESS_LIST_GUARDRAILS,
    this.safeHandle(async () => {
      return this.guardrailEngine.listRules()
    })
  )

  // harness:setGuardrailEnabled
  ipcMain.handle(IPC_CHANNELS.HARNESS_SET_GUARDRAIL_ENABLED,
    this.safeHandle(async (_event, request: SetGuardrailEnabledRequest) => {
      this.guardrailEngine.setRuleEnabled(request.ruleId, request.enabled)
    })
  )
}
```

### 9.4 预留给 TASK019-021 的 IPC 通道

在 `IPC_CHANNELS` 和 `HarnessHandler` 中预留（本任务不实现）：
- `harness:listGuides` — TASK019
- `harness:setGuideEnabled` — TASK019
- `harness:listResumeable` — TASK021
- `harness:resumeTask` — TASK021
- `harness:abandonTask` — TASK021

---

## 十、渲染进程 harnessStore

**文件：** `src/renderer/store/harnessStore.ts`

### 10.1 Store 设计

遵循 `zustand-state-management` Skill 的最佳实践：

```typescript
import { create } from 'zustand'
import type { HarnessMode, EvaluationReport, DegradationWarning } from '@shared/types'

interface HarnessState {
  currentMode: HarnessMode
  activeEvaluations: Map<string, EvaluationReport[]>
  degradationWarnings: DegradationWarning[]
  showEvaluationDrawer: boolean
}

interface HarnessActions {
  setMode: (mode: HarnessMode) => void
  setEvaluations: (msgId: string, reports: EvaluationReport[]) => void
  getEvaluations: (msgId: string) => EvaluationReport[]
  pushWarning: (warning: DegradationWarning) => void
  dismissWarning: (id: string) => void
  toggleEvaluationDrawer: () => void
  reset: () => void
}

export type HarnessStore = HarnessState & HarnessActions
```

### 10.2 Store 实现

```typescript
export const useHarnessStore = create<HarnessStore>()((set, get) => ({
  currentMode: 'dual',

  activeEvaluations: new Map(),
  degradationWarnings: [],
  showEvaluationDrawer: false,

  setMode: (mode) => set({ currentMode: mode }),

  setEvaluations: (msgId, reports) => set((state) => {
    const next = new Map(state.activeEvaluations)
    next.set(msgId, reports)
    return { activeEvaluations: next }
  }),

  getEvaluations: (msgId) => get().activeEvaluations.get(msgId) ?? [],

  pushWarning: (warning) => set((state) => ({
    degradationWarnings: [...state.degradationWarnings, warning]
  })),

  dismissWarning: (id) => set((state) => ({
    degradationWarnings: state.degradationWarnings.filter(w => w.id !== id)
  })),

  toggleEvaluationDrawer: () => set((state) => ({
    showEvaluationDrawer: !state.showEvaluationDrawer
  })),

  reset: () => set({
    currentMode: 'dual',
    activeEvaluations: new Map(),
    degradationWarnings: [],
    showEvaluationDrawer: false,
  }),
}))
```

### 10.3 与 aiChatStore 的关联策略

`harnessStore` 通过 message id 与 `aiChatStore` 关联，不修改 `ChatMessage` 类型：

- `aiChatStore` 的 `FinalizeData` 新增可选 `harnessMeta` 字段：
  ```typescript
  interface FinalizeData {
    content: string
    ragHits: AIRagHit[]
    usage: { inputTokens; outputTokens; totalTokens; estimatedCostUsd }
    memory: AIMemoryState
    provider: string
    model: string
    intercepted: boolean
    warnings: string[]
    contextSources?: string[]
    harnessMeta?: {
      mode: HarnessMode
      degraded: boolean
      degradeReason?: string
      generatorAttempts: number
    }
  }
  ```

- 渲染进程在收到 `AI_STREAM_END` 事件时：
  1. `aiChatStore.finalizeAssistant()` 接收含 `harnessMeta` 的 FinalizeData
  2. 若 `harnessMeta` 存在，渲染进程调用 `window.api.invoke('harness:execute')` 获取完整 `HarnessResult`
  3. 将 `result.evaluations` 存入 `harnessStore.setEvaluations(messageId, evaluations)`
  4. 若 `harnessMeta.degraded` 为 true，构造 `DegradationWarning` 并 push

### 10.4 preload 层扩展

在现有 preload 文件中追加 harness API 暴露：

```typescript
harness: {
  execute: (request) => ipcRenderer.invoke('harness:execute', request),
  setMode: (mode) => ipcRenderer.invoke('harness:setMode', mode),
  getMode: () => ipcRenderer.invoke('harness:getMode'),
  onDegradationOccurred: (callback) => {
    ipcRenderer.on('harness:degradationOccurred', (_event, warning) => callback(warning))
    return () => ipcRenderer.removeAllListeners('harness:degradationOccurred')
  },
}
```

---

## 十一、主进程初始化追加

**文件：** `src/main/index.ts`

在现有 AIHandler 创建之后追加 Harness 初始化代码。**关键约束**：现有初始化链路完全不动，仅在末尾追加。

### 11.1 初始化顺序

```typescript
// ====== 现有代码完全不动 ======
const aiHandler = new AIHandler(aiGatewayClient, memoryManager, localRagEngine, tokenStorage, workspaceManager, fileManager)

// ====== 追加 Harness 初始化 ======

// 1. GuardrailEngine（已在 TASK017 中创建，直接复用）
// const guardrailEngine = new GuardrailEngine(logger)  // 已存在

// 2. 创建 Generator
const generator = new Generator(
  aiGatewayClient,
  workspaceConfig?.defaultModel ?? 'claude-sonnet-4-20250514',
  logger
)

// 3. 创建 Evaluator（推荐使用更快/更便宜的模型）
const evaluator = new Evaluator(
  aiGatewayClient,
  workspaceConfig?.evaluatorModel ?? 'claude-sonnet-4-20250514',
  logger
)

// 4. 创建 HarnessOrchestrator
const harnessOrchestrator = new HarnessOrchestrator(
  generator,
  evaluator,
  guardrailEngine,
  contextEngine,    // 复用 AIHandler 中的同一实例
  memoryManager,    // 复用同一实例
  logger,
  {
    defaultMode: workspaceConfig?.harnessMode ?? 'dual',
    maxRetries: 2,
    evaluatorModel: workspaceConfig?.evaluatorModel,
  }
)

// 5. 注入到 AIHandler
aiHandler.setHarnessOrchestrator(harnessOrchestrator)

// 6. 创建 HarnessHandler 并注册
const harnessConfig = { defaultMode: workspaceConfig?.harnessMode ?? 'dual' }
const harnessHandler = new HarnessHandler(
  harnessOrchestrator,
  guardrailEngine,
  harnessConfig
)
ipcManager.registerHandler(harnessHandler)
```

### 11.2 workspace 配置读取

`harnessMode` 和 `evaluatorModel` 从 workspace 配置中读取。workspace 配置路径为 `.sibylla/config.json`，当前阶段若该文件不存在或无对应字段，使用默认值。

### 11.3 生命周期管理

- `HarnessOrchestrator` 随主进程生命周期存在，无需额外清理
- `Generator` / `Evaluator` 的 `AiGatewaySession` 在每次调用后 `close()`
- `HarnessHandler.cleanup()` 调用 `IpcHandler` 默认清理

---

## 十二、测试策略

### 12.1 测试分层

| 层级 | 目标 | 文件位置 |
|------|------|---------|
| 单元测试 - Generator | 生成与改进逻辑 | `tests/harness/generator.test.ts` |
| 单元测试 - Evaluator | 评审与解析逻辑 | `tests/harness/evaluator.test.ts` |
| 单元测试 - Orchestrator | 模式解析 + 三种模式执行 + 降级 | `tests/harness/orchestrator.test.ts` |
| 单元测试 - Store | 状态管理正确性 | `tests/harness/harnessStore.test.ts` |

### 12.2 Generator 测试用例

| 用例 | 输入 | 预期 |
|------|------|------|
| 正常生成 | 合法 request + context | 返回 `AIChatResponse`，session 被创建并关闭 |
| session 角色 | 任意输入 | `createSession` 参数 `role: 'generator'` |
| refine 接收拒绝 | 含 criticalIssues 的 rejection report | 调用 `createSession` 创建新 session，改进提示包含问题列表 |
| refine temperature | refine 调用 | temperature 为 0.5（低于 generate 的默认值） |
| gateway 异常 | `chat()` 抛出错误 | 异常向上抛出，session 在 finally 中关闭 |

### 12.3 Evaluator 测试用例

| 用例 | 输入 | 预期 |
|------|------|------|
| 独立 session | 任意输入 | `createSession({ role: 'evaluator' })`，sessionId 包含 'evaluator' |
| temperature | 任意输入 | 传给 `chat()` 的 temperature 为 0.1 |
| 正常解析 | 合法 JSON 响应 | 返回 `EvaluationReport`，verdict 为 'pass' 或 'fail' |
| 维度完整性 | 缺少 dimensions 字段 | 抛出明确异常 |
| verdict 缺失 | 无 verdict 字段 | 抛出 `'Evaluator response missing required field: verdict'` |
| JSON 包裹在代码块 | `\`\`\`json\n{...}\n\`\`\`` | 正确提取并解析 |
| session 关闭 | 正常/异常路径 | `session.close()` 在 finally 中被调用 |
| 历史注入 | history 含 1 条之前报告 | formatInput 包含 "# Previous Rejection History" |

### 12.4 Orchestrator 测试用例

| 用例 | 输入 | 预期 |
|------|------|------|
| Spec 文件请求 | `targetFile: 'specs/design_spec.md'` | `resolveMode` 返回 `'panel'` |
| CLAUDE.md 请求 | `targetFile: 'CLAUDE.md'` | `resolveMode` 返回 `'panel'` |
| 文件修改请求 | `intent: 'modify_file'` | `resolveMode` 返回 `'dual'` |
| 普通对话 | `intent: 'chat'`, 无 targetFile | 返回 `config.defaultMode` |
| Single 模式 | `mode: 'single'` | 直接调用 generator.generate()，evaluations 为空 |
| Dual - 一次通过 | Evaluator 返回 pass | generatorAttempts=1，evaluations 含 1 条 pass 报告 |
| Dual - 拒绝后通过 | 第 1 次 fail，第 2 次 pass | generatorAttempts=2，evaluations 含 2 条报告 |
| Dual - 重试耗尽 | 连续 2 次 fail | generatorAttempts=3（初始+2次重试），返回最终 suggestion |
| Panel - 全通过 | 两个 Evaluator 都 pass | consensus='passed'，evaluations 含 2 条报告 |
| Panel - 存在异议 | 一 pass 一 fail | consensus='contested' |
| Panel - 全拒绝 | 两个 Evaluator 都 fail | consensus='rejected' |
| Panel - 单侧降级 | 一个 Evaluator 抛异常 | degraded=true，用另一个结果继续 |
| Panel - 全失败 | 两个 Evaluator 都抛异常 | 降级为 Single，degraded=true |
| 总降级 | executeDual 中抛异常 | degraded=true，degradeReason 有值 |
| Generator 失败 | generator.generate() 抛异常 | 不降级，直接抛出 |
| trace 记录 | 任意模式执行 | memoryManager.appendHarnessTrace 被正确调用 |

### 12.5 harnessStore 测试用例

| 用例 | 操作 | 预期 |
|------|------|------|
| 初始状态 | 创建 store | `currentMode='dual'`，evaluations 为空 Map |
| 模式切换 | `setMode('single')` | `currentMode='single'` |
| 存储评审 | `setEvaluations('msg1', [report])` | `getEvaluations('msg1')` 返回 [report] |
| 降级警告 | `pushWarning(w)` | warnings 数组长度 +1 |
| 关闭警告 | `dismissWarning(id)` | 对应 warning 被移除 |
| 切换抽屉 | `toggleEvaluationDrawer()` | boolean 翻转 |
| 重置 | `reset()` | 所有状态回到初始值 |

### 12.6 Mock 策略

| 被测模块 | Mock 对象 | Mock 方式 |
|---------|----------|----------|
| Generator | `AiGatewayClient` | vi.fn() mock `createSession().chat()` |
| Evaluator | `AiGatewayClient` | vi.fn() mock `createSession().chat()`，返回预设 JSON |
| Orchestrator | `Generator`, `Evaluator`, `ContextEngine`, `MemoryManager` | vi.fn() mock 各方法 |
| harnessStore | 无外部依赖 | 纯状态测试，无需 mock |

### 12.7 性能验证要点

虽然单元测试难以精准断言延迟阈值，但需验证：
- Evaluator 使用 `temperature: 0.1`（确定性评审）
- Generator 的 refine 使用 `temperature: 0.5`（聚焦改进）
- 编排器不在热路径上做 I/O 操作
- 所有 session 在 finally 中关闭，无资源泄漏

---

## 十三、实施步骤与阶段目标

### 阶段 1：类型与骨架搭建

**目标：** 先建立最小可编译骨架，锁定类型边界。

**步骤：**
1. 在 `src/shared/types.ts` 中追加 Harness 共享类型（`HarnessMode`、`HarnessConfig`、`HarnessResult`、`EvaluationReport` 等）
2. 在 `AIChatRequest` 中追加 `intent`、`targetFile`、`explicitTools` 可选字段
3. 在 `IPC_CHANNELS` 中追加 4 个 harness 通道常量
4. 在 `IPCChannelMap` 中追加类型映射
5. 新建 `src/main/services/harness/orchestrator.ts` 空骨架
6. 新建 `src/main/services/harness/generator.ts` 空骨架
7. 新建 `src/main/services/harness/evaluator.ts` 空骨架
8. 新建测试目录与空测试文件

**阶段完成标志：**
- `npm run typecheck` 通过
- 新增文件均能被 TypeScript 正确解析
- 现有代码零报错

### 阶段 2：AiGatewaySession 层

**目标：** 为 Generator/Evaluator 提供独立 session 能力。

**步骤：**
1. 在 `src/main/services/ai-gateway-client.ts` 中追加 `AiGatewaySession` 类
2. 在 `AiGatewayClient` 上追加 `createSession()` 方法
3. 验证现有 `chat()` / `chatStream()` 调用方不受影响

**阶段完成标志：**
- `createSession()` 返回的 session 有独立 `sessionId`
- session 的 `chat()` 正确复用底层 client
- `session.close()` 可调用（当前为空实现）

### 阶段 3：Generator 实现

**目标：** 完成 AI 产出封装。

**步骤：**
1. 实现 `Generator.generate()` 方法
2. 实现 `Generator.refine()` 方法
3. 实现 `formatRefinePrompt()` 辅助方法
4. 补齐 Generator 单元测试

**阶段完成标志：**
- `tests/harness/generator.test.ts` 全绿
- generate 和 refine 各使用独立 session
- refine 提示正确包含 rejection report 信息

### 阶段 4：Evaluator 实现

**目标：** 完成独立质量审查封装。

**步骤：**
1. 实现 `Evaluator.evaluate()` 方法
2. 实现 `SYSTEM_PROMPT` 常量
3. 实现 `formatInput()` 辅助方法
4. 实现 `parseReport()` JSON 解析与校验
5. 补齐 Evaluator 单元测试

**阶段完成标志：**
- `tests/harness/evaluator.test.ts` 全绿
- temperature 固定 0.1
- parseReport 正确处理合法/非法 JSON
- session 在 finally 中关闭

### 阶段 5：服务层扩展

**目标：** 为编排器准备基础服务支撑。

**步骤：**
1. 在 `ContextEngine` 中追加 `assembleForHarness()` 方法
2. 在 `MemoryManager` 中扩展 `MemoryLogType` 并追加 `appendHarnessTrace()`
3. 验证现有 `assembleContext()` 和 `appendLog()` 不受影响

**阶段完成标志：**
- `assembleForHarness()` 正确复用 `assembleContext()`
- `appendHarnessTrace()` 正确写入 harness-trace 类型日志
- 现有方法签名零变更

### 阶段 6：HarnessOrchestrator 实现

**目标：** 完成核心编排逻辑。

**步骤：**
1. 实现 `execute()` 主入口（try-catch 总包裹 + 降级）
2. 实现 `resolveMode()` 模式解析
3. 实现 `executeSingle()` — 直接委托 Generator
4. 实现 `executeDual()` — 双 Agent 循环
5. 实现 `executePanel()` — 并行 Evaluator + 共识计算
6. 实现 `computeConsensus()` 辅助方法
7. 为每个阶段追加 `appendHarnessTrace()` 调用
8. 补齐编排器测试

**阶段完成标志：**
- `tests/harness/orchestrator.test.ts` 全绿
- 三种模式正确执行
- 降级机制工作正常
- trace 记录完整

### 阶段 7：AIHandler 分支 + HarnessHandler

**目标：** 将编排器接入真实 IPC 链路。

**步骤：**
1. 在 `AIHandler` 中追加 `setHarnessOrchestrator()` 和 `handleHarnessStream()`
2. 改造 `handleStream()` 内部分支逻辑
3. 新建 `HarnessHandler` IPC 入口
4. 实现 5 个 IPC 处理方法
5. 验证现有流式链路不受影响

**阶段完成标志：**
- Single 模式走现有逻辑，完全不变
- Dual/Panel 模式走 `handleHarnessStream()`
- HarnessHandler 注册的 IPC 方法可调用

### 阶段 8：渲染进程 Store + 集成

**目标：** 完成渲染进程侧状态管理。

**步骤：**
1. 新建 `src/renderer/store/harnessStore.ts`
2. 扩展 `aiChatStore` 的 `FinalizeData` 追加 `harnessMeta`
3. 扩展 preload 层追加 harness API
4. 补齐 harnessStore 测试

**阶段完成标志：**
- `tests/harness/harnessStore.test.ts` 全绿
- store 通过 message id 正确关联 aiChatStore

### 阶段 9：主进程初始化 + 回归验证

**目标：** 全链路集成与质量验证。

**步骤：**
1. 在 `main/index.ts` 追加 Harness 初始化链
2. 运行 `npm run typecheck`
3. 运行 `npm run lint`
4. 运行 `npm run test`
5. 人工验证降级场景

**阶段完成标志：**
- 全量 typecheck / lint / test 通过
- 验收标准具备逐条映射证据

### 13.10 推荐开发顺序

为降低返工，建议严格按以下顺序提交代码：

```
1. shared/types.ts        ← 类型基础，所有后续文件依赖
2. ai-gateway-client.ts   ← Session 层，Generator/Evaluator 依赖
3. generator.ts           ← 编排器依赖
4. evaluator.ts           ← 编排器依赖
5. context-engine.ts      ← 编排器依赖
6. memory-manager.ts      ← 编排器依赖
7. orchestrator.ts        ← 核心中枢
8. ai.handler.ts          ← IPC 分支
9. harness.ts (IPC)       ← IPC 入口
10. harnessStore.ts       ← 渲染进程
11. aiChatStore.ts        ← FinalizeData 扩展
12. main/index.ts         ← 最后装配
13. tests/                ← 每阶段同步补齐
```

---

## 十四、风险、验证与交付标准

### 14.1 主要风险

| 风险 | 表现 | 缓解策略 |
|------|------|---------|
| Evaluator 翻倍 token 成本 | Dual 模式每次请求调用 2 次 LLM | 默认仅对 modify_file 启用 Dual；推荐 Evaluator 用更快模型 |
| Evaluator JSON 解析不稳定 | LLM 偶尔输出非法 JSON | 多层提取策略（直接解析→代码块提取→首尾括号提取） |
| 编排器超时卡死 | Dual/Panel 多轮调用总时长过长 | 编排器外层 try-catch 兜底降级；未来可加总超时限制 |
| Panel 成本过高 | 3 次 LLM 调用 + 改进循环 | Panel 仅对 Spec 文件生效，默认不触发 |
| 模式解析误判 | 普通对话被识别为 modify_file | 基于显式字段（targetFile, intent）判断，不依赖消息内容猜测 |
| 叠加层破坏现有流式 | Single 模式性能退化 | 分支逻辑在 orchestrator 为 null 时直接走现有路径 |

### 14.2 验收标准映射

| 验收项 | 实现位置 | 验证方式 |
|------|---------|---------|
| 文件修改类消息默认 Dual | `resolveMode()` | 单测 + 集成测试 |
| Spec 文件请求触发 Panel | `resolveMode()` + `isSpecFile()` | 单测 |
| Evaluator 独立 session | `Evaluator.evaluate()` | 单测验证 sessionId 含 'evaluator' |
| Evaluator 拒绝 → Generator 重试（最多2轮） | `executeDual()` | 单测 |
| 重试耗尽后展示最终建议+全部报告 | `executeDual()` 返回值 | 单测 |
| Panel 共识状态计算 | `computeConsensus()` | 单测 |
| Single 模式跳过评审 | `executeSingle()` | 单测 |
| Evaluator 失败降级 Single | `execute()` catch 块 | 单测 |
| `createSession()` 提供独立 session | `AiGatewaySession` | 单测 |
| `assembleForHarness()` 复用 `assembleContext()` | `ContextEngine` | 单测 |
| AIHandler 正确分支 | `handleStream()` 内部分支 | 集成测试 |
| harnessStore 通过 message id 关联 | `harnessStore` | 单测 |

### 14.3 完成定义（Definition of Done）

以下条件全部满足，方可判定 TASK018 完成：

1. 新建 3 个主进程文件（generator.ts, evaluator.ts, orchestrator.ts）全部落地
2. 新建 1 个 IPC handler（harness.ts）全部落地
3. 新建 1 个渲染进程 store（harnessStore.ts）全部落地
4. 修改 7 个现有文件完成叠加式扩展
5. 4 个测试文件全部绿色（覆盖率 ≥ 80%）
6. `npm run typecheck` 通过
7. `npm run lint` 通过
8. `npm run test` 通过
9. 人工验证至少覆盖 3 条典型降级路径
10. 任务状态文件按 `CLAUDE.md` §九 要求更新完成

### 14.4 最终交付物清单

**新建文件：**
- `sibylla-desktop/src/main/services/harness/orchestrator.ts`
- `sibylla-desktop/src/main/services/harness/generator.ts`
- `sibylla-desktop/src/main/services/harness/evaluator.ts`
- `sibylla-desktop/src/main/ipc/handlers/harness.ts`
- `sibylla-desktop/src/renderer/store/harnessStore.ts`
- `sibylla-desktop/tests/harness/orchestrator.test.ts`
- `sibylla-desktop/tests/harness/generator.test.ts`
- `sibylla-desktop/tests/harness/evaluator.test.ts`
- `sibylla-desktop/tests/harness/harnessStore.test.ts`

**修改文件：**
- `sibylla-desktop/src/shared/types.ts`
- `sibylla-desktop/src/main/services/ai-gateway-client.ts`
- `sibylla-desktop/src/main/services/context-engine.ts`
- `sibylla-desktop/src/main/services/memory-manager.ts`
- `sibylla-desktop/src/main/ipc/handlers/ai.handler.ts`
- `sibylla-desktop/src/main/index.ts`
- `sibylla-desktop/src/renderer/store/aiChatStore.ts`

---

## 十五、结论

本任务的本质是建立 Harness 系统的**核心主干**——一个能协调 Generator、Evaluator、GuardrailEngine 三大组件的编排器，将「单 Agent 直给」升级为「Generator 产出 → Evaluator 独立评审 → 反馈改进」的双轨模式。

实施时必须坚持四条底线：

1. **叠加层策略**：所有对现有文件的改造为追加式（新增方法/字段/常量），不修改现有方法签名或删除现有逻辑
2. **物理隔离**：Generator 与 Evaluator 使用独立 LLM session，不依赖单个模型「自觉分开角色」
3. **降级优先**：任何异常都有明确的降级路径，不得让用户看到白屏或 spinner 卡死
4. **完整追溯**：所有 harness 决策都通过 `appendHarnessTrace()` 记录，便于 TASK021 的 UI 展示和后续审计

按本计划推进，可在不破坏现有 AI 对话主链路的前提下，为后续 TASK019（Guides + Sensors）、TASK020（工具范围）、TASK021（状态机 + UI）提供稳定、可扩展的编排基础设施。
