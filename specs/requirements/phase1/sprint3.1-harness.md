# Phase 1 Sprint 3.1 - Harness 基础设施

## 一、概述

### 1.1 目标与价值

在 Sprint 3 已交付的 AI 对话能力基础上，引入 harness 工程的核心基础设施：
将"单 Agent 直给"升级为"Generator / Evaluator 双轨架构"，引入硬性保障层、
反馈循环与状态机追踪器。目标是让 AI 从"看起来能用"进化到"可信任、可追责、
可恢复"。

本 Sprint **不替换** Sprint 3 的任何已有功能，所有新增能力以**叠加层**形式
接入。Single Agent 模式（即 Sprint 3 现有行为）仍可通过配置回退。

### 1.2 与其他 Sprint 的关系

| Sprint | 关系 |
|---|---|
| Sprint 3（前序）| 提供基础 AI 对话、上下文引擎 v1、Skill 系统 v1。Sprint 3.1 在其上叠加 |
| Sprint 3.2（后续）| Sprint 3.1 的 TaskStateMachine 是 Sprint 3.2 progress.md 机制的底层依赖 |

### 1.3 设计原则

- **物理隔离优先于 prompt 隔离**：Generator 与 Evaluator 使用独立的 LLM 调用、
  独立的系统提示、独立的 session id，不依赖单个模型"自觉分开角色"。
- **Harness 组件对上层透明**：对话 UI 不感知底层是单 agent 还是双 agent，
  仅通过配置切换。
- **Guardrails 下沉到主进程 IPC 层**：所有硬性保障在 Electron 主进程的 IPC handler 
  中执行，渲染进程无法绕过。
- **反馈信号必须可机读**：Sensors 产出的信号必须结构化，能直接注入下一轮 prompt。
- **失败时降级而非崩溃**：Evaluator 失败、Sensor 超时、Guardrail 异常时，
  整个 harness 必须有明确的降级路径，不得让用户看到白屏或 spinner 卡死。

### 1.4 涉及模块

- 模块 4：AI 系统（增强）
- 模块 6：Spec 工作流（与 Risk Guides 联动）
- 模块 12：权限系统（与 Guardrails 联动）
- 模块 15：记忆系统（Trace 信号写入日志层）
- 新增子系统：Harness 编排层（位于 `src/main/services/harness/`）

### 1.5 里程碑定义

**完成标志：**
- Generator / Evaluator 双 Agent 架构可用，默认对高风险操作（修改 Spec 文件）启用
- Guardrails 拦截器能阻止对 `.sibylla/` 与 `.git/` 的未授权写入
- 至少 3 种 Sensor（引用完整性、Markdown 格式、Spec 一致性）上线
- 至少 4 种 Guard（系统路径、敏感信息、个人空间、批量操作）上线
- 状态机追踪器可持久化任务状态，崩溃重启后可恢复上下文
- Single / Dual / Panel 三种执行模式可在设置中切换
- 所有 harness 行为对用户**可见且可追溯**（评审报告抽屉、Guardrail 通知）

---

## 二、功能需求

### 需求 3.1.1 - Generator / Evaluator 双 Agent 架构

**用户故事：** 作为用户，当 AI 建议修改重要文件时，我希望有一个独立的"质检员"
先审核一遍，而不是完全依赖我肉眼识别问题。

#### 功能描述

引入三种 AI 执行模式：

- **Single 模式**（兼容 Sprint 3 行为）：单次 LLM 调用直接返回结果
- **Dual 模式**（默认，适用于文件修改）：Generator 产出建议 → Evaluator 独立评审
  → 若评审未通过则退回 Generator 改进（最多 2 轮） → 最终交付给用户
- **Panel 模式**（适用于 Spec 文件修改）：Generator + 两个不同视角的 Evaluator
  （架构视角 + 一致性视角）→ 综合评审报告

关键设计：Evaluator 必须使用**独立的 LLM 调用**（独立 session id，
可配置使用不同模型），系统提示明确要求"严格挑错、默认不通过"。

#### 验收标准

1. When user sends a message that triggers file modification, the system shall use Dual mode by default
2. When user modifies `CLAUDE.md`, `design.md`, `requirements.md`, or any `_spec.md`, the system shall use Panel mode
3. When Generator produces a suggestion, the system shall invoke Evaluator with an independent LLM session
4. When Evaluator rejects the suggestion, the system shall feed rejection reason back to Generator for up to 2 retries
5. When all retries fail, the system shall present both the final suggestion and all evaluation reports to user
6. When mode is Panel, the system shall show panel consensus status (通过 / 存在异议 / 拒绝)
7. When user configures Single mode in settings, the system shall skip evaluation layer entirely
8. When Evaluator API call fails, the system shall log error and degrade to Single mode for this turn (with explicit indicator in UI)

#### 技术规格

**主进程组件：**

```typescript
// sibylla-desktop/src/main/services/harness/orchestrator.ts
import type { AIChatRequest, AssembledContext } from '@/shared/types'
import { Generator } from './generator'
import { Evaluator } from './evaluator'
import { GuardrailEngine } from './guardrails'
import { GuideRegistry } from './guides'
import { runSensors } from './sensors'
import { ContextEngine } from '../context-engine'
import type { Logger } from '../../utils/logger'

export type HarnessMode = 'single' | 'dual' | 'panel'

export interface HarnessConfig {
  defaultMode: HarnessMode
  maxRetries: number
  evaluatorModel?: string  // 可与 generator 不同
  panelEvaluators?: PanelEvaluatorConfig[]
}

export interface HarnessResult {
  finalResponse: AIResponse
  mode: HarnessMode
  generatorAttempts: number
  evaluations: EvaluationReport[]
  sensorSignals: SensorSignal[]
  guardrailVerdicts: GuardrailVerdict[]
  degraded: boolean  // 是否发生过降级
  degradeReason?: string
}

export class HarnessOrchestrator {
  constructor(
    private generator: Generator,
    private evaluator: Evaluator,
    private guards: GuardrailEngine,
    private guides: GuideRegistry,
    private contextEngine: ContextEngine,  // 复用现有
    private logger: Logger
  ) {}

  async execute(request: AIChatRequest): Promise<HarnessResult> {
    const mode = this.resolveMode(request)
    const guides = this.guides.resolveGuides(request)
    const context = await this.contextEngine.assembleForHarness(request, mode, guides)

    try {
      switch (mode) {
        case 'single':
          return await this.executeSingle(request, context)
        case 'dual':
          return await this.executeDual(request, context)
        case 'panel':
          return await this.executePanel(request, context)
      }
    } catch (err) {
      this.logger.error('harness.execute.failed', { mode, err })
      // Fail-safe: degrade to Single
      const result = await this.executeSingle(request, context)
      return { ...result, degraded: true, degradeReason: String(err) }
    }
  }

  private async executeDual(
    request: AIChatRequest,
    context: AssembledContext
  ): Promise<HarnessResult> {
    let attempt = 0
    let suggestion = await this.generator.generate(request, context)
    const evals: EvaluationReport[] = []

    while (attempt < this.config.maxRetries) {
      const report = await this.evaluator.evaluate({
        request,
        suggestion,
        context,
        history: evals
      })
      evals.push(report)

      if (report.verdict === 'pass') break

      // Feed rejection back to generator
      suggestion = await this.generator.refine({
        original: request,
        previous: suggestion,
        rejection: report,
        context
      })
      attempt++
    }

    // Run sensors (independent of evaluator)
    const sensorSignals = await runSensors(suggestion, context)

    return {
      finalResponse: suggestion,
      mode: 'dual',
      generatorAttempts: attempt + 1,
      evaluations: evals,
      sensorSignals,
      guardrailVerdicts: [],
      degraded: false
    }
  }

  private resolveMode(request: AIChatRequest): HarnessMode {
    // Spec files always use Panel mode
    if (this.isSpecFile(request.targetFile)) return 'panel'
    // File modifications use Dual mode by default
    if (request.intent === 'modify_file') return 'dual'
    // Others fall back to user-configured default
    return this.config.defaultMode
  }

  private isSpecFile(path?: string): boolean {
    if (!path) return false
    return /(_spec\.md|CLAUDE\.md|design\.md|requirements\.md|tasks\.md)$/.test(path)
  }
}
```

```typescript
// sibylla-desktop/src/main/services/harness/evaluator.ts
import type { AIGatewayClient, AiGatewaySession } from '../ai-gateway-client'

export class Evaluator {
  // 关键：独立的系统提示，强制"挑错模式"
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

  constructor(
    private gateway: AIGatewayClient,
    private model: string,  // can differ from generator's model
    private accessToken?: string
  ) {}

  async evaluate(input: EvaluationInput): Promise<EvaluationReport> {
    // 关键：通过 createSession 获取独立 session id，防止云端缓存串味
    const session: AiGatewaySession = this.gateway.createSession(
      { role: 'evaluator' },
      this.accessToken
    )

    try {
      const response = await session.chat({
        model: this.model,
        messages: [
          { role: 'system', content: this.SYSTEM_PROMPT },
          { role: 'user', content: this.formatInput(input) }
        ],
        // Evaluator 用更低的 temperature 提高一致性
        temperature: 0.1
      })
      return this.parseReport(response)
    } finally {
      session.close()
    }
  }

  private formatInput(input: EvaluationInput): string {
    return [
      `# Original User Request\n${input.request.message}`,
      `# Context Files\n${this.summarizeContext(input.context)}`,
      `# Suggestion to Review\n${input.suggestion.content}`,
      input.history.length > 0
        ? `# Previous Rejection History\n${this.formatHistory(input.history)}`
        : ''
    ].join('\n\n')
  }
}
```

**渲染进程组件：**

```typescript
// sibylla-desktop/src/renderer/store/harnessStore.ts
import { create } from 'zustand'

interface HarnessStore {
  currentMode: HarnessMode
  setMode: (mode: HarnessMode) => void

  activeEvaluations: Map<string, EvaluationReport[]>  // by message id
  setEvaluations: (msgId: string, reports: EvaluationReport[]) => void

  activeGuides: Guide[]
  setActiveGuides: (guides: Guide[]) => void

  showEvaluationDrawer: boolean
  toggleEvaluationDrawer: () => void

  degradationWarnings: DegradationWarning[]
  pushWarning: (w: DegradationWarning) => void
  dismissWarning: (id: string) => void
}

export const useHarnessStore = create<HarnessStore>((set) => ({
  currentMode: 'dual',
  setMode: (mode) => set({ currentMode: mode }),
  activeEvaluations: new Map(),
  setEvaluations: (msgId, reports) => set((s) => {
    const next = new Map(s.activeEvaluations)
    next.set(msgId, reports)
    return { activeEvaluations: next }
  }),
  activeGuides: [],
  setActiveGuides: (guides) => set({ activeGuides: guides }),
  showEvaluationDrawer: false,
  toggleEvaluationDrawer: () => set((s) => ({ showEvaluationDrawer: !s.showEvaluationDrawer })),
  degradationWarnings: [],
  pushWarning: (w) => set((s) => ({ degradationWarnings: [...s.degradationWarnings, w] })),
  dismissWarning: (id) => set((s) => ({
    degradationWarnings: s.degradationWarnings.filter(w => w.id !== id)
  }))
}))
```

```typescript
// sibylla-desktop/src/renderer/components/studio/harness/EvaluationDrawer.tsx
// 评审报告抽屉，集成在现有 Studio 右侧栏
export function EvaluationDrawer({ messageId }: { messageId: string }) {
  const reports = useHarnessStore(s => s.activeEvaluations.get(messageId) ?? [])
  // ... 渲染评审维度、问题列表、重试历史
}
```

#### 优先级

P0 - 必须完成

---

### 需求 3.1.2 - Guardrails 硬性保障层

**用户故事：** 作为用户，我希望系统从代码层面阻止 AI 做出破坏性操作，
而不是仅依赖我审批。即使 AI 被 prompt injection 攻击，关键文件也不会被破坏。

#### 功能描述

在主进程中建立一道**确定性**（非 LLM 的、基于规则的）防线，拦截高风险操作。
这一层是**硬编码规则**，不经过 LLM，不可被 prompt injection 绕过。

MVP 实现 4 类 Guard：

| Guard | 检查内容 | 默认行为 |
|---|---|---|
| SystemPathGuard | 写入 `.sibylla/` `.git/` `node_modules/` | 阻断 |
| SecretLeakGuard | 内容中包含 API Key / 私钥模式 | 阻断并通知 |
| PersonalSpaceGuard | 非 Admin 跨 personal/ 访问 | 阻断 |
| BulkOperationGuard | 单次操作影响 > 3 个文件的删除/重命名 | 二次确认 |

后续迭代可加：RateLimitGuard、NoOpGuard、PathTraversalGuard 等。

#### 验收标准

1. When AI attempts to write to `.sibylla/` or `.git/` directories, the system shall block the operation and log attempt
2. When AI-generated content matches API key patterns (OpenAI sk-, Anthropic sk-ant-, GitHub ghp_, AWS AKIA, private key headers), the system shall block write and warn user
3. When user is not Admin and AI attempts to read another member's personal folder, the system shall return access denied
4. When AI attempts to delete or rename more than 3 files in one operation, the system shall require explicit secondary confirmation in UI
5. When Guardrail blocks an operation, the system shall inject the block reason back into AI context as a tool error for next turn
6. When all Guardrails pass, the system shall proceed transparently (no UI noise)
7. When a Guardrail's own check function throws, the system shall fail-closed (treat as block) and log the exception

#### 技术规格

```typescript
// sibylla-desktop/src/main/services/harness/guardrails/types.ts
export interface FileOperation {
  type: 'write' | 'delete' | 'rename' | 'read'
  path: string
  newPath?: string       // for rename
  content?: string       // for write
  affectedPaths?: string[]  // for bulk operations
}

export interface OperationContext {
  source: 'user' | 'ai' | 'sync'
  userId: string
  userRole: 'admin' | 'editor' | 'viewer'
  workspaceRoot: string
  sessionId?: string
}

export type GuardrailVerdict =
  | { allow: true }
  | { allow: false; ruleId: string; reason: string; severity: 'block' }
  | { allow: 'conditional'; ruleId: string; requireConfirmation: true; reason: string }

export interface GuardrailRule {
  id: string
  description: string
  check(op: FileOperation, ctx: OperationContext): Promise<GuardrailVerdict>
}
```

```typescript
// sibylla-desktop/src/main/services/harness/guardrails/engine.ts
export class GuardrailEngine {
  private rules: GuardrailRule[]

  constructor(private logger: Logger) {
    this.rules = [
      new SystemPathGuard(),
      new SecretLeakGuard(),
      new PersonalSpaceGuard(),
      new BulkOperationGuard(),
    ]
  }

  async check(op: FileOperation, ctx: OperationContext): Promise<GuardrailVerdict> {
    for (const rule of this.rules) {
      try {
        const verdict = await rule.check(op, ctx)
        if (verdict.allow !== true) {
          this.logger.warn('guardrail.triggered', {
            ruleId: rule.id,
            operation: op.type,
            path: op.path,
            verdict
          })
          return verdict
        }
      } catch (err) {
        // Fail-closed: any error in check = block
        this.logger.error('guardrail.check.failed', { ruleId: rule.id, err })
        return {
          allow: false,
          ruleId: rule.id,
          severity: 'block',
          reason: `Guardrail check failed: ${rule.id}. Defaulting to block for safety.`
        }
      }
    }
    return { allow: true }
  }

  // For Admin to inspect / configure rules
  listRules(): Array<Pick<GuardrailRule, 'id' | 'description'>> {
    return this.rules.map(r => ({ id: r.id, description: r.description }))
  }
}
```

```typescript
// sibylla-desktop/src/main/services/harness/guardrails/system-path.ts
export class SystemPathGuard implements GuardrailRule {
  id = 'system-path'
  description = 'Block AI writes to system-managed directories'

  private readonly FORBIDDEN_PREFIXES = [
    '.sibylla/',
    '.git/',
    'node_modules/',
  ]

  // .sibylla/memory/ is partially allowed for memory manager only (uses different IPC channel)

  async check(op: FileOperation, ctx: OperationContext): Promise<GuardrailVerdict> {
    if (ctx.source !== 'ai') return { allow: true }
    if (op.type === 'read') return { allow: true }

    const normalized = op.path.replace(/^\/+/, '')
    for (const prefix of this.FORBIDDEN_PREFIXES) {
      if (normalized.startsWith(prefix)) {
        return {
          allow: false,
          ruleId: this.id,
          severity: 'block',
          reason: `AI is not permitted to ${op.type} system path: ${prefix}`
        }
      }
    }
    return { allow: true }
  }
}
```

```typescript
// sibylla-desktop/src/main/services/harness/guardrails/secret-leak.ts
export class SecretLeakGuard implements GuardrailRule {
  id = 'secret-leak'
  description = 'Detect API keys and private keys in AI-generated content'

  private patterns = [
    { name: 'OpenAI', re: /sk-[a-zA-Z0-9]{32,}/ },
    { name: 'Anthropic', re: /sk-ant-[a-zA-Z0-9\-_]{95,}/ },
    { name: 'GitHub PAT', re: /ghp_[a-zA-Z0-9]{36}/ },
    { name: 'AWS', re: /AKIA[0-9A-Z]{16}/ },
    { name: 'Private Key', re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
    { name: 'JWT', re: /eyJ[A-Za-z0-9_\-]{20,}\.eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}/ },
  ]

  async check(op: FileOperation): Promise<GuardrailVerdict> {
    if (op.type !== 'write' || !op.content) return { allow: true }

    for (const { name, re } of this.patterns) {
      if (re.test(op.content)) {
        return {
          allow: false,
          ruleId: this.id,
          severity: 'block',
          reason: `Content contains pattern matching ${name}. Refusing to write secrets to disk.`
        }
      }
    }
    return { allow: true }
  }
}
```

**关键集成点：现有 IPC handler 必须改造**

Guardrail 拦截位于 **IPC handler 层**（`file.handler.ts`），不在 `FileManager` 内部。
这样保持 FileManager 的纯净性和可测试性，同时确保渲染进程无法绕过 Guardrail。

`OperationContext.source`（`'user' | 'ai' | 'sync'`）是 Guardrail 层的概念，
与 FileManager 的 `FileOperationContext`（`USER | SYSTEM | WORKSPACE_INIT`）**完全解耦**。
前者用于判断"谁发起的操作"，后者用于"文件系统访问权限"。两层防线共存不矛盾：
FileManager 提供通用的路径安全保护，Guardrail 提供 AI 专属的语义检查。

source 推断策略：
- 从 renderer UI 发起的操作 → `source: 'user'`（默认，不触发 AI 专属 Guard）
- 通过 Harness 编排器发起的 AI 写入 → `source: 'ai'`（触发完整 Guardrail 链）
- SyncManager 触发的操作 → `source: 'sync'`（仅触发 SecretLeakGuard）

```typescript
// sibylla-desktop/src/main/ipc/handlers/file.handler.ts
// 在 FileHandler 类中注入 GuardrailEngine（不影响 FileManager）
export class FileHandler extends IpcHandler {
  private guardrailEngine: GuardrailEngine | null = null

  setGuardrailEngine(engine: GuardrailEngine): void {
    this.guardrailEngine = engine
  }

  // 改造后的 writeFile：在 handler 层拦截，FileManager 完全不动
  private async writeFile(
    event: IpcMainInvokeEvent,
    path: string,
    content: string,
    options?: FileWriteOptions
  ): Promise<void> {
    this.ensureFileManager()

    // Guardrail check — 仅对 AI source 的操作执行完整检查
    if (this.guardrailEngine) {
      const ctx = this.buildOperationContext(event, 'ai') // 从 payload 推断 source
      const verdict = await this.guardrailEngine.check(
        { type: 'write', path, content },
        ctx
      )

      if (verdict.allow === false) {
        // 通知渲染进程（非阻塞）
        this.broadcastToAllWindows('harness:guardrailBlocked', verdict)
        throw new Error(verdict.reason)
      }

      if (verdict.allow === 'conditional') {
        // 返回给渲染进程弹出二次确认弹窗
        return { status: 'pending_confirmation', verdict } as any
      }
    }

    // 以下为原有写入逻辑，完全不动
    const managerOptions: ManagerWriteOptions = {
      encoding: options?.encoding,
      atomic: options?.atomic,
      createDirs: options?.createDirs,
    }
    await this.fileManager.writeFile(path, content, managerOptions)
  }

  private buildOperationContext(
    event: IpcMainInvokeEvent,
    source: 'user' | 'ai' | 'sync'
  ): OperationContext {
    return {
      source,
      userId: 'current-user',   // 从 AuthSession 获取
      userRole: 'admin',         // 从 AuthSession 获取
      workspaceRoot: this.fileManager!.getWorkspaceRoot(),
    }
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 3.1.3 - Guides 前馈控制系统

**用户故事：** 作为系统，我希望在 AI 开始回答之前就注入正确的指导，
让它第一次尝试就产出高质量结果，而不是靠多轮对话纠正。

#### 功能描述

Guides 是针对任务类型预设的 prompt 片段，**在上下文组装阶段**被动态注入。

与 Skill 的关键区别：
- **Skill** 是用户显式选择的能力（如"#writing-prd"），由用户主动调用
- **Guide** 是系统根据任务意图自动注入的指导（如"涉及 Spec 文件时引用具体条款"），用户无需感知

Guides 按触发条件分为：

- **Intent Guides**：基于意图（file_modify / question_answering / brainstorm）
- **Path Guides**：基于目标文件路径（`docs/product/**` → 加载产品组规范）
- **Model Guides**：基于当前模型的已知 quirks（Claude 倾向啰嗦 → 注入简洁指令）
- **Risk Guides**：基于风险等级（修改 Spec → 注入"引用具体条款"指令）

#### 验收标准

1. When context engine assembles context, the system shall resolve applicable Guides based on intent, path, model, and risk
2. When multiple Guides apply, the system shall merge them with priority order: Risk > Path > Intent > Model
3. When Guide injection would exceed 20% of context budget, the system shall compress lower-priority Guides
4. When user views message metadata, the system shall display which Guides were active for that message
5. When a Guide has been injected but AI response still violates it, the system shall log this as Guide failure for later analysis (Sprint 3.3 will consume this)
6. When a workspace defines custom guides in `.sibylla/harness/guides/`, the system shall load them on startup
7. When user disables a Guide in settings, the system shall not inject it

#### 技术规格

```typescript
// sibylla-desktop/src/main/services/harness/guides/types.ts
export type GuideCategory = 'intent' | 'path' | 'model' | 'risk'

export interface Guide {
  id: string
  category: GuideCategory
  priority: number               // higher = more important
  description: string
  matches(request: AIChatRequest, ctx: GuideMatchContext): boolean
  content: string                // injected into system prompt
  tokenBudget: number            // max tokens this guide may use
  enabled: boolean
}

export interface GuideMatchContext {
  currentModel: string
  workspaceConfig: WorkspaceConfig
  userId: string
}
```

```typescript
// sibylla-desktop/src/main/services/harness/guides/registry.ts
export class GuideRegistry {
  private guides: Guide[] = []

  async loadBuiltIn(): Promise<void> {
    this.guides.push(
      SpecModificationGuide,
      ProductDocsPathGuide,
      ClaudeVerbosityGuide,
      FileEditIntentGuide,
      // ...
    )
  }

  async loadWorkspaceCustom(workspaceRoot: string): Promise<void> {
    const customDir = path.join(workspaceRoot, '.sibylla/harness/guides')
    if (!await fs.exists(customDir)) return
    
    const files = await fs.readdir(customDir)
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const guide = await this.parseGuideFile(path.join(customDir, file))
          this.guides.push(guide)
        } catch (err) {
          this.logger.warn('guide.load.failed', { file, err })
        }
      }
    }
  }

  resolve(request: AIChatRequest, ctx: GuideMatchContext): Guide[] {
    const applicable = this.guides
      .filter(g => g.enabled && g.matches(request, ctx))
      .sort((a, b) => b.priority - a.priority)
    
    return this.applyTokenBudget(applicable, MAX_GUIDE_BUDGET)
  }

  private applyTokenBudget(guides: Guide[], maxTotal: number): Guide[] {
    const result: Guide[] = []
    let used = 0
    for (const g of guides) {
      if (used + g.tokenBudget > maxTotal) continue
      result.push(g)
      used += g.tokenBudget
    }
    return result
  }
}

// Example built-in guide
export const SpecModificationGuide: Guide = {
  id: 'risk.spec-modification',
  category: 'risk',
  priority: 100,
  enabled: true,
  description: 'Enforce careful changes to spec files',
  tokenBudget: 250,
  matches: (req) => req.intent === 'modify_file'
                    && /(_spec\.md|CLAUDE\.md|design\.md|requirements\.md)$/.test(req.targetFile ?? ''),
  content: `
You are about to modify a specification file that governs project behavior.
Before proposing changes:
1. Cite the exact existing clause you are changing (by section and sentence).
2. Explain what invariant the current clause protects.
3. Explain why the new clause still protects that invariant, or why the
   invariant is no longer needed.
4. Never silently delete rules. All removals must be explicit with rationale.
5. If your change would conflict with another clause elsewhere in the file,
   raise this conflict explicitly instead of silently choosing one side.
  `.trim()
}
```

#### 优先级

P0 - 必须完成

---

### 需求 3.1.4 - Sensors 反馈控制系统

**用户故事：** 作为用户，我希望当 AI 产出有明显错误（引用不存在的文件、
格式错误、与现有规范冲突）时，系统能自动发现并让 AI 自己纠正，
而不是我手动指出。

#### 功能描述

Sensors 在 AI 响应产出之后、呈现给用户之前运行。它们是**确定性的检查器**
（非 LLM），产出结构化信号。如果检测到问题，信号被注入下一轮 prompt，
让 AI 自纠正。

MVP 实现 3 类 Sensor：

| Sensor | 检查内容 | 自纠正策略 |
|---|---|---|
| ReferenceIntegritySensor | 响应中提到的文件路径、Skill 名是否真实存在 | 提供模糊匹配建议 |
| MarkdownFormatSensor | 表格闭合、代码块闭合、标题层级连续 | 定位行号 + 修正建议 |
| SpecComplianceSensor | 响应是否违反 CLAUDE.md 中的明确条款 | 引用违反的条款原文 |

关键：Sensors 输出的错误信息必须是**为 LLM 优化的**，包含上下文和修正建议。
如果 Sprint 4 的语义搜索可用，ReferenceIntegritySensor 优先用语义搜索做模糊匹配；
否则用编辑距离作为兜底。

#### 验收标准

1. When AI produces a response, the system shall run all applicable Sensors before displaying
2. When Sensor detects reference to non-existent file, the system shall feed back: "File X referenced but not found. Did you mean Y?"
3. When Sensor detects Markdown format error, the system shall locate the specific line and describe the fix
4. When Sensor detects Spec violation, the system shall quote the violated clause from CLAUDE.md
5. When Sensors trigger self-correction, the system shall limit to 2 correction rounds to avoid loops
6. When all sensors pass, the system shall attach a "verified" indicator to the message
7. When a Sensor's scan exceeds 1 second, the system shall timeout and skip that sensor (log warning)
8. When semantic search service (Sprint 4) is unavailable, ReferenceIntegritySensor shall fall back to local fuzzy matching

#### 技术规格

```typescript
// sibylla-desktop/src/main/services/harness/sensors/types.ts
export interface Sensor {
  id: string
  description: string
  scan(response: AIResponse, context: AssembledContext): Promise<SensorSignal[]>
}

export interface SensorSignal {
  sensorId: string
  severity: 'info' | 'warn' | 'error'
  location?: { file?: string; line?: number; span?: [number, number] }
  message: string          // human-readable
  correctionHint: string   // LLM-optimized: what to do to fix
}
```

```typescript
// sibylla-desktop/src/main/services/harness/sensors/reference-integrity.ts
import { fileManager } from '../../file-manager'
import { localSearchEngine } from '../../local-search-engine'

export class ReferenceIntegritySensor implements Sensor {
  id = 'reference-integrity'
  description = 'Verify all file/skill references in AI response actually exist'

  // 引用提取正则：覆盖 @file, [[file]], `path/to/file.md`, #skill 等
  private readonly FILE_REFS = /(?:@\[\[|\[\[)([^\]]+)(?:\]\]|\]\])|`([\w\-/]+\.\w+)`/g
  private readonly SKILL_REFS = /#([a-z][a-z0-9\-]+)/g

  async scan(response: AIResponse, ctx: AssembledContext): Promise<SensorSignal[]> {
    const signals: SensorSignal[] = []

    // File references
    const fileRefs = this.extractFileRefs(response.content)
    for (const ref of fileRefs) {
      if (await fileManager.exists(ref.path)) continue

      const suggestion = await this.suggestSimilarFile(ref.path)
      signals.push({
        sensorId: this.id,
        severity: 'error',
        location: { file: ref.path, span: ref.span },
        message: `Referenced file does not exist: ${ref.path}`,
        correctionHint: suggestion
          ? `The file "${ref.path}" does not exist. Did you mean "${suggestion}"? Please verify and update the reference.`
          : `The file "${ref.path}" does not exist in this workspace. Either create it first or remove the reference.`
      })
    }

    // Skill references
    // ... similar logic for skills

    return signals
  }

  private async suggestSimilarFile(path: string): Promise<string | null> {
    // Try local fuzzy match first (cheap, no network)
    const fuzzy = await localSearchEngine.fuzzyFindFile(path, { maxDistance: 3 })
    if (fuzzy) return fuzzy

    // Fall back to semantic search if available (Sprint 4)
    try {
      const semanticHit = await this.semanticSearchClient?.findSimilarFilename(path)
      return semanticHit ?? null
    } catch {
      return null
    }
  }
}
```

```typescript
// sibylla-desktop/src/main/services/harness/sensors/feedback-loop.ts
export class SensorFeedbackLoop {
  private readonly MAX_ROUNDS = 2
  private readonly SENSOR_TIMEOUT_MS = 1000

  async process(
    initialResponse: AIResponse,
    context: AssembledContext,
    generator: Generator,
    request: AIChatRequest
  ): Promise<{ response: AIResponse; signals: SensorSignal[]; corrections: number }> {
    let current = initialResponse
    let allSignals: SensorSignal[] = []

    for (let round = 0; round < this.MAX_ROUNDS; round++) {
      const signals = await this.runAllSensorsWithTimeout(current, context)
      allSignals = signals
      const errors = signals.filter(s => s.severity === 'error')

      if (errors.length === 0) {
        return { response: current, signals: allSignals, corrections: round }
      }

      // Inject correction prompt and refine
      const correctionPrompt = this.buildCorrectionPrompt(errors)
      current = await generator.refine({
        original: request,
        previous: current,
        rejection: { critical_issues: errors.map(e => e.correctionHint) } as any,
        context
      })
    }

    return { response: current, signals: allSignals, corrections: this.MAX_ROUNDS }
  }

  private async runAllSensorsWithTimeout(
    response: AIResponse,
    context: AssembledContext
  ): Promise<SensorSignal[]> {
    const sensorPromises = this.sensors.map(s =>
      this.withTimeout(s.scan(response, context), this.SENSOR_TIMEOUT_MS, s.id)
    )
    const results = await Promise.allSettled(sensorPromises)
    return results.flatMap(r =>
      r.status === 'fulfilled' ? r.value : []
    )
  }

  private buildCorrectionPrompt(errors: SensorSignal[]): string {
    return `
Your previous response has the following issues that must be fixed:

${errors.map((e, i) => `${i + 1}. ${e.correctionHint}`).join('\n')}

Please regenerate the response, addressing each issue above.
    `.trim()
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 3.1.5 - 工具范围管理与意图分类

**用户故事：** 作为系统，我希望只给 AI 暴露当前任务真正需要的工具，
而不是一股脑把所有 Skill、所有引用方式全部塞给它。

#### 功能描述

建立**工具注册表**（Tool Registry），所有 AI 可用能力（@引用、#skill、
文件修改、搜索、模式切换等）都注册为工具。每次请求根据意图分类选择
一个工具子集暴露。

意图分类采用**轻量规则 + 关键词**优先，避免每次请求都额外调一次 LLM。
仅当规则无法明确时才调用轻量分类模型（如 Claude Haiku）。

#### 验收标准

1. When request arrives, the system shall classify intent into one of {chat, edit_file, analyze, plan, search}
2. When intent is `chat`, the system shall expose tools: [reference_file, search, skill_activate]
3. When intent is `edit_file`, the system shall expose tools: [reference_file, diff_write, search, spec_lookup]
4. When intent is `analyze`, the system shall expose tools: [reference_file, search, memory_query]
5. When tool count would exceed 8, the system shall apply compression: group similar tools, defer rarely-used ones
6. When a tool is not in current subset but AI attempts to call it, the system shall return tool error: "tool not available in this context" with list of currently available alternatives
7. When intent classification is ambiguous, the system shall default to the most permissive profile (chat)
8. When user explicitly invokes a tool via UI button, the system shall add that tool to current scope regardless of intent

#### 技术规格

```typescript
// sibylla-desktop/src/main/services/harness/tool-scope.ts
export interface ToolDefinition {
  id: string
  name: string
  description: string
  schema: JSONSchema
  tags: string[]
  handler: (args: unknown, ctx: ToolContext) => Promise<unknown>
}

export interface IntentProfile {
  intent: string
  tools: string[]           // tool ids
  maxTools: number
}

export const INTENT_PROFILES: IntentProfile[] = [
  { intent: 'chat',      tools: ['reference_file', 'search', 'skill_activate'],                 maxTools: 5 },
  { intent: 'edit_file', tools: ['reference_file', 'diff_write', 'search', 'spec_lookup'],      maxTools: 6 },
  { intent: 'analyze',   tools: ['reference_file', 'search', 'memory_query', 'graph_traverse'], maxTools: 6 },
  { intent: 'plan',      tools: ['reference_file', 'task_create', 'memory_query', 'skill_activate'], maxTools: 7 },
]

export class ToolScopeManager {
  constructor(
    private registry: Map<string, ToolDefinition>,
    private classifier: IntentClassifier
  ) {}

  async select(request: AIChatRequest): Promise<ToolDefinition[]> {
    const intent = await this.classifier.classify(request)
    const profile = INTENT_PROFILES.find(p => p.intent === intent) 
                    ?? INTENT_PROFILES[0]  // chat as default

    const tools = profile.tools
      .map(id => this.registry.get(id))
      .filter((t): t is ToolDefinition => Boolean(t))
      .slice(0, profile.maxTools)

    // Add user-explicitly-invoked tools
    if (request.explicitTools) {
      for (const id of request.explicitTools) {
        const t = this.registry.get(id)
        if (t && !tools.find(x => x.id === id)) tools.push(t)
      }
    }

    return tools
  }
}
```

```typescript
// sibylla-desktop/src/main/services/harness/intent-classifier.ts
export class IntentClassifier {
  // Rule-first, LLM as fallback
  async classify(request: AIChatRequest): Promise<string> {
    const ruleResult = this.ruleBasedClassify(request)
    if (ruleResult.confidence > 0.8) return ruleResult.intent

    // Fall back to lightweight model (e.g. Haiku)
    return await this.llmClassify(request)
  }

  private ruleBasedClassify(req: AIChatRequest): { intent: string; confidence: number } {
    const msg = req.message.toLowerCase()

    // High-confidence rules
    if (/^(修改|edit|update|change|add|删除|delete|新增).+(文件|file|to)/i.test(msg)) {
      return { intent: 'edit_file', confidence: 0.95 }
    }
    if (/^(分析|analyze|compare|对比|比较|为什么|why)/i.test(msg)) {
      return { intent: 'analyze', confidence: 0.9 }
    }
    if (/^(计划|plan|拆解|break down|路线图|roadmap)/i.test(msg)) {
      return { intent: 'plan', confidence: 0.9 }
    }
    if (/^(搜索|find|search|查找)/i.test(msg)) {
      return { intent: 'search', confidence: 0.95 }
    }
    
    return { intent: 'chat', confidence: 0.5 }
  }
}
```

#### 优先级

P1 - 应该完成

---

### 需求 3.1.6 - 状态机追踪器

**用户故事：** 作为用户，当我让 AI 处理一个多步骤任务时，我希望即使
Electron 进程崩溃或会话中断，AI 仍能从上次的进度恢复。

#### 功能描述

为每个多步骤 AI 任务分配一个 task ID，状态持久化到
`.sibylla/agents/{task-id}/state.json`。状态包含：

- 任务目标
- 已完成步骤（含产出文件、关键发现）
- 当前步骤
- 剩余步骤
- 关键引用文件列表
- 评审记录摘要

崩溃恢复时，AI 被告知"你之前正在执行任务 X，已完成步骤 1-3，
现在从步骤 4 继续"。

**与 Sprint 3.2 的衔接**：本 Sprint 仅实现状态机的**底层持久化**与
**崩溃恢复提示**。Sprint 3.2 在此基础上构建用户可见的 `progress.md` 任务
台账（人类可读的 Markdown 视图）。

#### 验收标准

1. When user initiates a multi-step AI task (>= 3 steps or marked as long-running), the system shall create a task record in `.sibylla/agents/{task-id}/state.json`
2. When each step completes, the system shall update state file atomically (write temp + rename)
3. When process restarts and an in-progress task exists, the system shall prompt user: "上次任务 X 未完成，是否继续？"
4. When user resumes, the system shall reconstruct AI context with completed steps summarized
5. When task completes or is cancelled, the system shall move state file to `.sibylla/agents/completed/` or `.sibylla/agents/cancelled/`
6. When state file write fails, the system shall log error and continue without blocking AI execution
7. When state file is corrupted (JSON parse error), the system shall move to `.sibylla/agents/corrupted/` and notify user

#### 技术规格

```typescript
// sibylla-desktop/src/main/services/harness/task-state-machine.ts
export interface TaskState {
  taskId: string
  goal: string
  createdAt: number
  updatedAt: number
  status: 'planning' | 'executing' | 'awaiting_confirmation' | 'completed' | 'cancelled' | 'failed'
  steps: TaskStep[]
  currentStepIndex: number
  artifacts: TaskArtifacts
  lastSessionId?: string
}

export interface TaskStep {
  id: string
  description: string
  status: 'pending' | 'in_progress' | 'done' | 'skipped'
  startedAt?: number
  completedAt?: number
  artifacts?: string[]      // file paths produced
  summary?: string
}

export interface TaskArtifacts {
  referencedFiles: string[]
  modifiedFiles: string[]
  evaluations: Array<{ stepId: string; verdict: string; criticalIssues: string[] }>
}

export class TaskStateMachine {
  constructor(
    private fileManager: FileManager,
    private workspaceRoot: string,
    private logger: Logger
  ) {}

  async create(goal: string, plannedSteps: string[]): Promise<TaskState> {
    const state: TaskState = {
      taskId: this.generateId(),
      goal,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'planning',
      steps: plannedSteps.map(desc => ({
        id: this.generateId(),
        description: desc,
        status: 'pending'
      })),
      currentStepIndex: 0,
      artifacts: { referencedFiles: [], modifiedFiles: [], evaluations: [] }
    }
    await this.persist(state)
    return state
  }

  async advance(taskId: string, stepSummary: string, artifacts: string[]): Promise<void> {
    const state = await this.load(taskId)
    const step = state.steps[state.currentStepIndex]
    step.status = 'done'
    step.completedAt = Date.now()
    step.summary = stepSummary
    step.artifacts = artifacts
    state.currentStepIndex++
    state.updatedAt = Date.now()

    if (state.currentStepIndex >= state.steps.length) {
      state.status = 'completed'
      await this.archive(state)
    } else {
      await this.persist(state)
    }
  }

  async findResumeable(): Promise<TaskState[]> {
    const dir = path.join(this.workspaceRoot, '.sibylla/agents/')
    const taskDirs = await this.fileManager.listDirs(dir)
    const states: TaskState[] = []

    for (const d of taskDirs) {
      const statePath = path.join(dir, d.name, 'state.json')
      try {
        const raw = await this.fileManager.readFile(statePath)
        const state = JSON.parse(raw) as TaskState
        if (state.status === 'executing' || state.status === 'awaiting_confirmation') {
          states.push(state)
        }
      } catch (err) {
        this.logger.warn('task-state.corrupted', { path: statePath, err })
        await this.moveToCorrupted(statePath)
      }
    }
    return states
  }

  private async persist(state: TaskState): Promise<void> {
    const dir = path.join(this.workspaceRoot, `.sibylla/agents/${state.taskId}/`)
    await fs.mkdir(dir, { recursive: true })
    
    const finalPath = path.join(dir, 'state.json')
    const tempPath = `${finalPath}.tmp`
    
    // Atomic write
    await fs.writeFile(tempPath, JSON.stringify(state, null, 2), 'utf-8')
    await fs.rename(tempPath, finalPath)
  }
}
```

```typescript
// sibylla-desktop/src/renderer/components/studio/harness/ResumeTaskDialog.tsx
// On app start, show resumable tasks dialog
export function ResumeTaskDialog() {
  const [tasks, setTasks] = useState<TaskState[]>([])
  
  useEffect(() => {
    window.api.invoke('harness:listResumeable').then(setTasks)
  }, [])
  
  if (tasks.length === 0) return null
  
  return (
    <Modal>
      <h2>未完成的任务</h2>
      {tasks.map(t => (
        <TaskResumeCard 
          key={t.taskId} 
          task={t} 
          onResume={() => window.api.invoke('harness:resumeTask', t.taskId)}
          onAbandon={() => window.api.invoke('harness:abandonTask', t.taskId)}
        />
      ))}
    </Modal>
  )
}
```

#### 优先级

P1 - 应该完成

---

## 三、非功能需求

### 3.1 性能要求

- Guardrails 单次检查 < 5ms（确定性规则，无 LLM 调用）
- Sensor 扫描总计 < 1 秒（带超时保护）
- Evaluator 调用延迟不超过 Generator 调用的 2 倍（默认配置使用相同模型；
  使用 Haiku 等更快模型作为 Evaluator 时可低于 1.2 倍）
- 状态机写入 < 50ms（异步持久化，不阻塞 AI 响应）
- Intent 分类 95% 由规则完成（< 5ms），仅 5% 兜底走 LLM

### 3.2 可靠性要求

- Evaluator 失败时自动降级到 Single 模式，并在消息中标注"评审不可用"
- Guardrail 组件为 fail-closed：检查器本身出错时，默认阻止操作
- 状态机写入失败不得中断 AI 执行，错误进入日志
- Sensor 超时不影响主响应，仅记录警告

### 3.3 可配置性要求

- 所有 Harness 模式可在 workspace 设置中配置（默认 Dual）
- Evaluator 可指定独立模型（例如用成本更低的模型做评审）
- 每条 Guardrail 规则可启用/禁用（仅 Admin）
- 每个 Guide 可启用/禁用（用户级配置）
- workspace 自定义 Guides 路径：`.sibylla/harness/guides/*.json`

### 3.4 可观测性要求

- 所有 harness 决策（mode 选择、guide 应用、guard 拦截、sensor 信号、
  evaluator 评审）必须写入结构化日志（who/what/when/result）
- 日志格式与现有 `memory-manager.ts` 的日志格式兼容，便于 Sprint 3.3 的
  Trace 系统统一消费

---

## 四、技术约束

### 4.1 架构约束

- Harness 组件位于主进程 `src/main/services/harness/`，渲染进程通过 IPC 访问
- Generator 和 Evaluator 共享同一个 `AIGatewayClient` 实例，但通过
  `createSession({ role })` 获得独立的 session（独立 session id 与请求头）
- 状态机文件写入必须遵循 CLAUDE.md 中的原子写入规范（temp + rename）
- 所有 IPC 入口位于 `src/main/ipc/handlers/harness.ts`

### 4.2 与现有模块的集成

| 现有文件 | 必须的改造 | 改造策略 |
|---|---|---|
| `src/shared/types.ts` | `AIChatRequest` 新增可选字段 `intent`、`targetFile`、`explicitTools`；`IPC_CHANNELS` 追加 harness 通道常量；新增 `SemanticSearchClient` 契约接口 | **扩展**：所有新字段 optional，完全向后兼容 |
| `src/main/services/context-engine.ts` | 新增 `assembleForHarness(request: HarnessContextRequest)` 方法 | **追加**：不修改现有 `assembleContext()` 签名，新方法内部复用现有逻辑 |
| `src/main/services/ai-gateway-client.ts` | 新增 `AiGatewaySession` 类和 `createSession({ role })` 方法 | **追加**：不修改现有 `chat()`/`chatStream()` 方法签名，Session 是叠加层 |
| `src/main/services/memory-manager.ts` | 扩展 `MemoryLogType` 枚举新增 `'harness-trace'`；新增 `appendHarnessTrace()` 便捷方法 | **扩展**：追加枚举值和方法，不影响现有 `appendLog()` |
| `src/main/services/file-manager.ts` | **不直接修改**。Guardrail 拦截在 IPC handler 层执行（见下方） | **不改**：保持 FileManager 纯净性，Guardrail 职责在 IPC 层 |
| `src/main/ipc/handlers/file.ts` | 注入 `GuardrailEngine` 引用；`writeFile()`/`deleteFile()`/`moveFile()` 中加入 Guardrail 前置检查 | **注入**：通过 `setGuardrailEngine()` 注入，在 handler 层拦截，不改 FileManager |
| `src/main/ipc/handlers/ai.handler.ts` | `handleStream()` 内部根据 Harness 模式分支：Single 走现有逻辑，Dual/Panel 走编排路径 | **分支**：新增 `handleHarnessStream()` 方法，现有流式逻辑完全不动 |
| `src/main/index.ts` | 追加 Harness 编排器、GuardrailEngine、HarnessHandler 的初始化代码 | **追加**：在现有 AIHandler 创建之后追加，不影响现有初始化链路 |
| `src/renderer/store/aiChatStore.ts` | `FinalizeData` 新增可选 `harnessMeta` 字段（向后兼容） | **扩展**：可选字段，不影响现有 flow |
| `src/renderer/store/harnessStore.ts` | **新建**独立 Zustand store，管理 evaluation reports、mode、degradation warnings | **新建**：通过 message id 关联 aiChatStore，不修改 ChatMessage 类型 |

### 4.3 与 CLAUDE.md 的一致性

- **遵循"文件即真相"**：所有 harness 状态以 JSON 文件形式持久化在
  `.sibylla/agents/`（系统目录，用户不可见但可审计）
- **遵循"AI 建议，人类决策"**：Evaluator 是 AI 之间的互查，不替代人类最终审批
- **遵循"Git 不可见"**：harness 文件位于 `.sibylla/` 内，不暴露给用户 UI；
  评审报告的 UI 称呼用"质量审查"而非"evaluation"
- **遵循"个人空间隔离"**：Guardrail 中的 `PersonalSpaceGuard` 在系统层强制
- **遵循 TypeScript 严格模式 + 禁止 any**：所有接口使用 tagged union 表达多态
- **遵循命名规范**：文件名 kebab-case（`harness-orchestrator.ts`），
  React 组件 PascalCase（`EvaluationDrawer.tsx`），Zustand store camelCase
  （`harnessStore.ts`）
- **遵循最小侵入集成**：所有对现有文件的改动为追加式（新增方法/字段/常量），
  不修改现有方法签名或删除现有逻辑。详见 §4.5 叠加层集成策略

### 4.4 与 Sprint 4 的接口契约

为了让 Sprint 3.1 与 Sprint 4 可独立开发上线，本 Sprint 定义以下契约接口：

```typescript
// sibylla-desktop/src/shared/types.ts (新增)
export interface SemanticSearchClient {
  isAvailable(): boolean
  searchSimilarFile(path: string): Promise<string | null>
  searchSimilarContent(query: string, limit?: number): Promise<SearchResult[]>
}
```

Sprint 4 实现该接口；Sprint 3.1 在该接口不可用时降级到本地搜索。

### 4.5 叠加层集成策略

本节明确 Harness 如何以最小侵入方式与现有系统集成。
**核心原则**：所有对现有文件的修改均为**追加式**（新增方法、新增字段、新增常量），
不修改现有方法签名、不删除现有逻辑、不改变现有调用链路。

#### 4.5.1 AIChatRequest 扩展

```typescript
// src/shared/types.ts — 在现有 AIChatRequest 接口中追加可选字段
export interface AIChatRequest {
  // ... 现有字段（message, sessionId, model 等）完全不动 ...

  /** AI-inferred intent (由主进程 IntentClassifier 填充，renderer 无需提供) */
  intent?: 'chat' | 'modify_file' | 'question_answering' | 'brainstorm' | 'analyze' | 'search' | 'plan'
  /** Target file path for file-modification intents (由主进程推断) */
  targetFile?: string
  /** Tools explicitly invoked by user via UI buttons */
  explicitTools?: string[]
}
```

这些字段由主进程的 `HarnessOrchestrator` 在接收请求后自行推断和填充，
渲染进程的现有调用链路无需做任何改动即可保持向后兼容。

#### 4.5.2 AiGatewayClient Session 层

```typescript
// src/main/services/ai-gateway-client.ts — 追加，不修改现有 chat()/chatStream()

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

// AiGatewayClient 上追加方法
export class AiGatewayClient {
  // ... 现有 chat()、chatStream() 完全不动 ...

  createSession(options: { role: 'generator' | 'evaluator' }, accessToken?: string): AiGatewaySession {
    return new AiGatewaySession(this, options.role, accessToken)
  }
}
```

#### 4.5.3 ContextEngine 扩展

```typescript
// src/main/services/context-engine.ts — 追加方法，不修改 assembleContext()

export interface HarnessContextRequest extends ContextAssemblyRequest {
  mode: 'single' | 'dual' | 'panel'
  guides: import('./harness/guides/types').Guide[]
}

export class ContextEngine {
  // ... 现有 assembleContext() 完全不动 ...

  async assembleForHarness(request: HarnessContextRequest): Promise<AssembledContext> {
    // 复用 assembleContext 的三层组装逻辑
    const base = await this.assembleContext(request)

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
}
```

#### 4.5.4 MemoryManager 扩展

```typescript
// src/main/services/memory-manager.ts — 扩展枚举和追加方法

export type MemoryLogType =
  | 'user-interaction'
  | 'command-exec'
  | 'file-operation'
  | 'decision'
  | 'error'
  | 'system'
  | 'harness-trace'  // 新增

export class MemoryManager {
  // ... 现有 appendLog() 完全不动 ...

  async appendHarnessTrace(traceId: string, event: {
    component: 'orchestrator' | 'evaluator' | 'sensor' | 'guardrail' | 'guide' | 'state-machine'
    action: string
    result: string
    details?: string[]
  }): Promise<void> {
    await this.appendLog({
      type: 'harness-trace',
      operator: `harness:${event.component}`,
      sessionId: traceId,
      summary: `${event.component}:${event.action} → ${event.result}`,
      details: event.details,
      tags: ['harness', event.component],
    })
  }
}
```

#### 4.5.5 AIHandler 流式分支

```typescript
// src/main/ipc/handlers/ai.handler.ts — 内部分支，现有逻辑完全不动

export class AIHandler {
  // ... 现有 handleStream() 改名或分支 ...

  private async handleStream(event: Electron.IpcMainEvent, input: unknown): Promise<void> {
    const mode = this.resolveHarnessMode(input)

    if (mode === 'single') {
      // 现有 handleStream 完整逻辑作为 Single 路径，代码不变
      return this.handleSingleStream(event, input)
    }

    // Dual/Panel: harness 编排路径
    return this.handleHarnessStream(event, input, mode)
  }

  private async handleHarnessStream(
    event: Electron.IpcMainEvent,
    input: unknown,
    mode: 'dual' | 'panel'
  ): Promise<void> {
    // Dual/Panel 模式：缓冲 Generator 输出，经 Evaluator 审查后一次性交付
    // 前端显示"AI 正在自检..."的 loading 状态
    // 纯对话场景仍走 Single 模式的流式体验
    // ... 编排逻辑 ...
  }
}
```

#### 4.5.6 main/index.ts 初始化追加

```typescript
// src/main/index.ts — 在 AIHandler 创建之后追加，不影响现有初始化

// 现有代码完全不动：
const aiHandler = new AIHandler(aiGatewayClient, memoryManager, ...)

// 追加 Harness 初始化：
const guardrailEngine = new GuardrailEngine(logger)
const guideRegistry = new GuideRegistry()
const taskStateMachine = new TaskStateMachine(fileManager, workspacePath, logger)

const harnessOrchestrator = new HarnessOrchestrator(
  new Generator(aiGatewayClient),
  new Evaluator(aiGatewayClient, workspace.config.defaultModel),
  guardrailEngine,
  guideRegistry,
  contextEngine,  // 复用 AIHandler 中的同一实例
  taskStateMachine,
  logger
)

const harnessHandler = new HarnessHandler(harnessOrchestrator, guardrailEngine, guideRegistry, taskStateMachine)
ipcManager.registerHandler(harnessHandler)

// 注入 Guardrail 到 FileHandler
fileHandler.setGuardrailEngine(guardrailEngine)
```

#### 4.5.7 渲染进程：独立 harnessStore

新建 `src/renderer/store/harnessStore.ts`（见需求 3.1.1 技术规格），
通过 message id 关联 `aiChatStore` 中的消息。
`ChatMessage` 类型不做修改，`aiChatStore` 仅在 `FinalizeData` 中新增可选 `harnessMeta` 字段：

```typescript
interface FinalizeData {
  // ... 现有字段完全不动 ...

  /** Harness 执行元数据（可选，仅 Harness 激活时存在） */
  harnessMeta?: {
    mode: 'single' | 'dual' | 'panel'
    degraded: boolean
    degradeReason?: string
    generatorAttempts: number
  }
}
```

#### 4.5.8 双层路径防御共存

FileManager 的 `CORE_FORBIDDEN_PATHS`（`USER` context 下的基础安全）与
Guardrail 的 `SystemPathGuard`（AI source 的额外语义检查）**共存不冲突**：

| 防线 | 位置 | 保护对象 | 检查能力 |
|---|---|---|---|
| FileManager `checkForbiddenPaths()` | FileManager 内部 | 所有 USER context 操作 | 路径遍历、系统目录访问（不可绕过） |
| Guardrail `SystemPathGuard` | IPC handler 层 | 仅 AI source 操作 | 更严格的 `.sibylla/` 写入限制、内容级检查 |
| Guardrail `SecretLeakGuard` | IPC handler 层 | 仅 AI source 操作 | API Key / 私钥内容检测（FileManager 不做内容检查） |
| Guardrail `PersonalSpaceGuard` | IPC handler 层 | 仅 AI source 操作 | 用户角色 + 路径组合检查（FileManager 不感知角色） |

---

## 五、目录结构（新增部分）

```
sibylla-desktop/src/main/services/harness/
├── orchestrator.ts                 # 主编排器
├── generator.ts                    # Generator 封装
├── evaluator.ts                    # Evaluator 封装
├── intent-classifier.ts            # 意图分类
├── tool-scope.ts                   # 工具范围管理
├── task-state-machine.ts           # 任务状态机
├── guides/
│   ├── registry.ts
│   ├── types.ts
│   ├── built-in/
│   │   ├── spec-modification.ts
│   │   ├── product-docs-path.ts
│   │   ├── claude-verbosity.ts
│   │   └── file-edit-intent.ts
├── guardrails/
│   ├── engine.ts
│   ├── types.ts
│   ├── system-path.ts
│   ├── secret-leak.ts
│   ├── personal-space.ts
│   └── bulk-operation.ts
├── sensors/
│   ├── feedback-loop.ts
│   ├── types.ts
│   ├── reference-integrity.ts
│   ├── markdown-format.ts
│   └── spec-compliance.ts
└── index.ts                         # 统一导出

sibylla-desktop/src/main/ipc/handlers/
└── harness.ts                       # 新增 IPC 入口

sibylla-desktop/src/renderer/store/
└── harnessStore.ts                  # 新增 Zustand store

sibylla-desktop/src/renderer/components/studio/harness/
├── EvaluationDrawer.tsx             # 评审报告抽屉
├── ModeSelector.tsx                 # 模式切换器
├── GuardrailNotification.tsx        # Guardrail 拦截通知
├── ResumeTaskDialog.tsx             # 恢复任务对话框
└── ActiveGuidesIndicator.tsx        # 活跃 Guides 指示器

sibylla-desktop/tests/harness/
├── orchestrator.test.ts
├── guardrails/
│   ├── system-path.test.ts
│   ├── secret-leak.test.ts
│   └── ...
├── sensors/
│   ├── reference-integrity.test.ts
│   └── ...
└── task-state-machine.test.ts

# Workspace 用户侧（运行时生成）
.sibylla/
├── agents/
│   ├── {task-id}/
│   │   └── state.json
│   ├── completed/
│   ├── cancelled/
│   └── corrupted/
└── harness/
    └── guides/                      # 用户自定义 Guide（可选）
        └── *.json
```

---

## 六、IPC 接口清单

```typescript
// sibylla-desktop/src/shared/types.ts (新增 IPC 契约)

// Harness 主入口
'harness:execute': (request: AIChatRequest) => Promise<HarnessResult>
'harness:setMode': (mode: HarnessMode) => Promise<void>
'harness:getMode': () => Promise<HarnessMode>

// 状态机
'harness:listResumeable': () => Promise<TaskState[]>
'harness:resumeTask': (taskId: string) => Promise<TaskState>
'harness:abandonTask': (taskId: string) => Promise<void>

// Guardrails
'harness:listGuardrails': () => Promise<GuardrailRuleSummary[]>
'harness:setGuardrailEnabled': (ruleId: string, enabled: boolean) => Promise<void>

// Guides
'harness:listGuides': () => Promise<Guide[]>
'harness:setGuideEnabled': (guideId: string, enabled: boolean) => Promise<void>

// Events (主进程 → 渲染进程)
'harness:degradationOccurred': (warning: DegradationWarning) => void
'harness:guardrailBlocked': (verdict: GuardrailVerdict) => void
'harness:resumeableTaskDetected': (tasks: TaskState[]) => void
```

---

## 七、验收检查清单

### 功能验收
- [ ] Single / Dual / Panel 三种模式可用
- [ ] 修改 Spec 文件时自动触发 Panel 模式
- [ ] Evaluator 使用独立 LLM session
- [ ] Guardrail 阻止对 `.sibylla/` 的写入
- [ ] Guardrail 检测 API Key 泄漏
- [ ] Guardrail 阻止跨 personal 空间访问
- [ ] BulkOperationGuard 在 >3 文件操作时要求二次确认
- [ ] Intent Guides 正确匹配
- [ ] Risk Guides 在 Spec 修改时激活
- [ ] 用户自定义 Guide（`.sibylla/harness/guides/`）可加载
- [ ] ReferenceIntegritySensor 检测不存在的文件引用
- [ ] MarkdownFormatSensor 检测格式错误
- [ ] SpecComplianceSensor 检测条款违反
- [ ] Sensor 触发的自纠正不超过 2 轮
- [ ] Sensor 超时不影响主响应
- [ ] 工具范围按意图动态选择
- [ ] 工具范围超出时正确返回 tool error
- [ ] 状态机持久化任务进度
- [ ] 崩溃恢复对话框可用
- [ ] 状态文件损坏时移至 corrupted 目录

### 集成验收
- [ ] `context-engine.ts` 的 `assembleForHarness` 方法工作（复用 `assembleContext`，叠加 Guides）
- [ ] `ai-gateway-client.ts` 的 `createSession` 提供独立 session id（`AiGatewaySession` 叠加层）
- [ ] `file.handler.ts` 的 writeFile/deleteFile/moveFile 经过 Guardrail 拦截（IPC 层，非 FileManager 层）
- [ ] `ai.handler.ts` 的 handleStream 内部正确分支：Single → 现有逻辑，Dual/Panel → 编排路径
- [ ] `memory-manager.ts` 的 `appendHarnessTrace` 可写入 harness-trace 类型日志
- [ ] `shared/types.ts` 的 `AIChatRequest` 新增 `intent`/`targetFile`/`explicitTools` 可选字段
- [ ] `harnessStore.ts` 通过 message id 正确关联 `aiChatStore` 中的消息
- [ ] 评审报告抽屉在 UI 中可展开/收起
- [ ] 模式切换器集成在底栏（参考 CLAUDE.md UI 红线）
- [ ] `main/index.ts` 正确初始化 Harness 编排器并注入 Guardrail 到 FileHandler

### 降级验收
- [ ] Evaluator 失败时降级 Single 并标注
- [ ] Guardrail check 异常时 fail-closed
- [ ] Sensor 超时时跳过该 sensor
- [ ] 状态机写入失败不阻塞 AI

### 性能验收
- [ ] Guardrail 检查 < 5ms
- [ ] Sensor 总扫描 < 1 秒
- [ ] Intent 分类 95% < 5ms
- [ ] 状态机写入 < 50ms

### 安全验收
- [ ] 所有 IPC 输入经过类型校验
- [ ] Guardrail 不可被渲染进程绕过
- [ ] Evaluator session 独立，不与 Generator 共享 token
- [ ] 状态文件写入路径限定在 `.sibylla/agents/`，无路径穿越漏洞

---

## 八、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|---|---|---|---|
| Evaluator 翻倍 token 成本 | 高 | 中 | 默认仅对 file_modify 启用 Dual；提供 Single 模式选项；推荐 Evaluator 用 Haiku |
| Guardrails 误拦正常操作 | 中 | 中 | 每条规则独立可禁用；记录所有拦截到 trace；提供"申诉"通道（用户提交反馈） |
| Pre-prompt Guides 占用过多 token | 中 | 低 | 实现 token budget 机制；低优先级 Guide 可压缩 |
| Sensor 自纠正陷入循环 | 低 | 低 | 硬编码 MAX_ROUNDS=2；记录所有循环案例 |
| 状态机文件膨胀 | 低 | 低 | 定期归档 completed 任务；MaxAge 配置 |
| 用户对"质量审查"概念不理解 | 中 | 中 | UI 中用"AI 已自检 ✓"等友好措辞；提供新手引导 |

---

## 九、参考资料

- [CLAUDE.md](../../CLAUDE.md) - 项目宪法
- [sprint3-ai-mvp.md](./sprint3-ai-mvp.md) - 前序 Sprint
- [sprint4-semantic-search.md](../phase2/sprint4-semantic-search.md) - 并行 Sprint（接口对接）
- [memory-system-design.md](../../design/memory-system-design.md) - 记忆系统设计
- [architecture.md](../../design/architecture.md) - 整体架构（需追加 harness 章节）
```

---