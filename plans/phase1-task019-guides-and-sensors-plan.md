# PHASE1-TASK019: Guides 前馈控制与 Sensors 反馈系统 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task019_guides-and-sensors.md](../specs/tasks/phase1/phase1-task019_guides-and-sensors.md)
> 创建日期：2026-04-19
> 最后更新：2026-04-19

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK019 |
| **任务标题** | Guides 前馈控制与 Sensors 反馈系统 |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | ✅ TASK018 编排器、✅ ContextEngine、✅ FileManager、✅ LocalSearchEngine |

### 1.1 目标

实现 Harness 质量控制闭环：Guides 在 AI 回答前注入正确指导（事前预防），Sensors 在 AI 回答后检测问题并驱动自纠正（事后检查）。

### 1.2 核心命题

TASK018 已实现 Generator/Evaluator 双 Agent 编排器，但存在：(1) Generator 缺乏任务感知的精细化指导；(2) 确定性缺陷（引用不存在文件、Markdown 格式错误、违反 CLAUDE.md 条款）无自动检测。

### 1.3 范围边界

**包含：** Guide 类型系统、GuideRegistry 注册表、4 类内置 Guide、Token budget 管控；Sensor 类型系统、3 类 Sensor、SensorFeedbackLoop 控制器、自纠正循环（≤2 轮）、超时保护；编排器集成点。

**不包含：** LLM 语义级 Sensor、更多内置 Guide/Sensor、Guide/Sensor 管理 UI（TASK021）。

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | §二 AI 建议人类决策；§四 TS 严格模式禁止 any；§六 UI 红线 | 类型设计、日志规范 |
| `specs/design/architecture.md` | §3.2 invoke/handle IPC 模式 | IPC 设计 |
| `specs/design/data-and-api.md` | §1.1 Workspace 目录结构 | 类型约束 |
| `specs/design/testing-and-security.md` | §1.1 单元测试 ≥80% | 测试策略 |
| `specs/requirements/phase1/sprint3.1-harness.md` | 需求 3.1.3 + 3.1.4 | 验收标准 |
| `specs/tasks/phase1/phase1-task019_guides-and-sensors.md` | 14 步执行路径 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 |
|-------|---------|
| `ai-context-engine` | `assembleForHarness()` Guides 注入策略、Token 预算管理、三层模型 |
| `electron-ipc-patterns` | `HarnessHandler` IPC 注册、`safeHandle` 包装 |
| `typescript-strict-mode` | tagged union、类型守卫、禁止 any |
| `llm-streaming-integration` | Sensor 自纠正中 `generator.refine()` 调用模式 |

### 2.3 前置代码依赖

| 模块 | 状态 | 复用方式 |
|------|------|---------|
| `harness/orchestrator.ts` | ⚠️ 需改造 | 集成 `guideRegistry.resolve()` + `sensorFeedbackLoop.process()` |
| `harness/generator.ts` | ✅ 不修改 | SensorFeedbackLoop 调用 `generator.refine()` |
| `harness/evaluator.ts` | ✅ 不修改 | 不涉及 |
| `context-engine.ts` | ⚠️ 需改造 | `GuidePlaceholder` → `Guide` 升级 |
| `file-manager.ts` | ✅ 不修改 | `ReferenceIntegritySensor` 调用 `exists()` |
| `local-rag-engine.ts` | ✅ 不修改 | `ReferenceIntegritySensor` 模糊匹配 fallback |
| `shared/types.ts` | ⚠️ 需扩展 | 追加 Guide 共享类型 + IPC 通道 |
| `ipc/handlers/harness.ts` | ⚠️ 需扩展 | 追加 Guide 列表/启停 handler |
| `main/index.ts` | ⚠️ 需扩展 | 追加 GuideRegistry + SensorFeedbackLoop 初始化 |

### 2.4 被依赖任务

| 任务 | 依赖方式 |
|------|---------|
| TASK021（Harness UI） | `ActiveGuidesIndicator` / `SensorVerifiedBadge` / Guide 管理面板 |

---

## 三、架构设计

### 3.1 质量控制闭环流程

```
请求 → GuideRegistry.resolve(intent/path/model/risk)
     → 按优先级排序 + Token Budget 裁剪（≤20%）
     → ContextEngine.assembleForHarness(guides注入system prompt)
     → Generator.generate()
     → SensorFeedbackLoop.process(response)
         ├── ReferenceIntegritySensor（文件引用检查）
         ├── MarkdownFormatSensor（格式检查）
         └── SpecComplianceSensor（CLAUDE.md条款检查）
     → 有error? → Generator.refine(correctionPrompt) → 重新scan（≤2轮）
     → 无error? → 返回最终response + signals
     → HarnessOrchestrator组装HarnessResult
     → MemoryManager.appendHarnessTrace()
```

### 3.2 Guide 分类与优先级

| 优先级 | 类别 | 示例 |
|--------|------|------|
| 100 | Risk | `risk.spec-modification`：修改 Spec 时引用具体条款 |
| 80 | Path | `path.product-docs`：修改 docs/product/ 时加载产品规范 |
| 60 | Intent | `intent.file-edit`：文件修改时注意 diff 格式 |
| 40 | Model | `model.claude-verbosity`：Claude 注入简洁指令 |

### 3.3 关键设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| Guide 匹配 | `matches()` 方法（确定性） | 零成本零延迟 |
| Guide 注入位置 | system prompt 前缀 | LLM 对开头部分注意力最高 |
| Sensor 执行 | `Promise.allSettled` 并行 | 独立检查，并行降低延迟 |
| 自纠正上限 | 2 轮 | 平衡质量与成本 |
| Sensor 超时 | 1 秒 | 防止意外卡死 |
| Guide Token 上限 | context budget 的 20% | 保证主体内容不受挤压 |

### 3.4 文件结构

新建：
```
src/main/services/harness/guides/
├── types.ts                          # Guide 类型
├── registry.ts                       # GuideRegistry
└── built-in/
    ├── spec-modification.ts          # Risk Guide
    ├── product-docs-path.ts          # Path Guide
    ├── file-edit-intent.ts           # Intent Guide
    └── claude-verbosity.ts           # Model Guide

src/main/services/harness/sensors/
├── types.ts                          # Sensor/SensorSignal 类型
├── reference-integrity.ts            # 文件引用检查
├── markdown-format.ts                # Markdown 格式检查
├── spec-compliance.ts                # CLAUDE.md 条款检查
└── feedback-loop.ts                  # 自纠正控制器

tests/harness/guides/registry.test.ts
tests/harness/sensors/
├── reference-integrity.test.ts
├── markdown-format.test.ts
├── spec-compliance.test.ts
├── feedback-loop.test.ts
└── integration.test.ts
```

修改：`orchestrator.ts`、`context-engine.ts`、`shared/types.ts`、`harness.ts`、`main/index.ts`

---

## 四、类型系统设计

### 4.1 Guides 类型（`guides/types.ts`）

```typescript
export type GuideCategory = 'intent' | 'path' | 'model' | 'risk'

export interface Guide {
  readonly id: string
  readonly category: GuideCategory
  readonly priority: number
  readonly description: string
  matches(request: AIChatRequest, ctx: GuideMatchContext): boolean
  readonly content: string
  readonly tokenBudget: number
  enabled: boolean  // 唯一 mutable 字段，支持运行时启停
}

export interface GuideMatchContext {
  readonly currentModel: string
  readonly workspaceConfig: WorkspaceConfig
  readonly userId: string
}
```

### 4.2 Sensors 类型（`sensors/types.ts`）

```typescript
export interface Sensor {
  readonly id: string
  readonly description: string
  scan(response: AIChatResponse, context: AssembledContext): Promise<SensorSignal[]>
}

export interface SensorSignal {
  readonly sensorId: string
  readonly severity: 'info' | 'warn' | 'error'
  readonly location?: { readonly file?: string; readonly line?: number; readonly span?: readonly [number, number] }
  readonly message: string
  readonly correctionHint: string  // LLM 优化的修正建议
}
```

### 4.3 共享类型扩展（`shared/types.ts`）

```typescript
export interface GuideSummary {
  readonly id: string; readonly category: string; readonly priority: number
  readonly description: string; readonly enabled: boolean
}
export interface SetGuideEnabledRequest { readonly guideId: string; readonly enabled: boolean }
```

IPC 通道：`HARNESS_LIST_GUIDES`、`HARNESS_SET_GUIDE_ENABLED`

---

## 五、Guides 系统详细设计

### 5.1 GuideRegistry

**职责：** 维护 guides 数组、加载内置/自定义 Guide、resolve() 匹配+排序+裁剪。

关键方法：
- `loadBuiltIn()` — 注册 4 个内置 Guide
- `loadWorkspaceCustom(workspaceRoot)` — 读取 `.sibylla/harness/guides/*.json`，try-catch 跳过格式错误
- `resolve(request, ctx)` — filter(enabled+matches) → sort(priority desc) → applyTokenBudget
- `applyTokenBudget(guides, maxTotal)` — 从高优先级累加 tokenBudget，超 maxTotal 停止
- `listGuides()` / `setGuideEnabled(id, enabled)` — 管理 API

自定义 Guide JSON 格式：
```json
{ "id": "custom.my-guide", "category": "intent", "priority": 50,
  "content": "...", "tokenBudget": 100,
  "matches": { "intent": ["modify_file"], "pathPattern": "docs/**" } }
```

`parseCustomGuide()` 将声明式 `matches` 转为函数（基于 intent 数组 + minimatch 路径模式）。

### 5.2 四个内置 Guide

| Guide | id | category | priority | matches 条件 | content 要点 |
|-------|-----|----------|----------|-------------|-------------|
| SpecModificationGuide | `risk.spec-modification` | risk | 100 | `intent=modify_file` + SPEC_FILE_PATTERN | 引用具体条款、解释 invariant、禁止静默删除规则 |
| ProductDocsPathGuide | `path.product-docs` | path | 80 | `targetFile.startsWith('docs/product/')` | 保持术语一致、标记文档状态 |
| FileEditIntentGuide | `intent.file-edit` | intent | 60 | `intent=modify_file` | 使用 diff 格式、保留未修改部分 |
| ClaudeVerbosityGuide | `model.claude-verbosity` | model | 40 | `currentModel.includes('claude')` | 简洁直接、不重复上下文 |

---

## 六、Sensors 系统详细设计

### 6.1 ReferenceIntegritySensor

**职责：** 检测 AI 响应中引用的文件路径和 Skill 名是否存在。

引用提取正则：`@\[\[(\S+)\]\]`、`` `path/to/file.ext` ``、`#skill-name`

scan() 逻辑：提取文件引用 → `fileManager.exists()` 检查 → 不存在则 `suggestSimilarFile()`（localRagEngine 模糊匹配 → 语义搜索 fallback） → 构建 error 信号含 correctionHint。

### 6.2 MarkdownFormatSensor

**职责：** 检测 Markdown 格式错误。

| 检查项 | 逻辑 | severity |
|--------|------|----------|
| 代码块未闭合 | 反引号 ``` 出现奇数次 | error |
| 表格未闭合 | 含 `|` 行管道符数量不一致 | warn |
| 标题跳跃 | H2 直接到 H4（缺 H3） | warn |
| 链接未闭合 | `[text](` 无 `)` | warn |

所有检查项均定位到具体行号，correctionHint 包含修正描述。

### 6.3 SpecComplianceSensor

**职责：** 检测 AI 响应是否违反 CLAUDE.md 明确条款。

| 规则 | 正则 | severity |
|------|------|----------|
| 文件即真相 | `/private.*format\|binary.*storage/` | error |
| AI 建议人类决策 | `/rm\s+-rf\|DROP\s+TABLE/` | error |
| 禁止 any | `/:\s*any\b\|<any>\|as\s+any/` | error |
| 原子写入 | `/writeFileSync(?!.*temp)/` | error |

每条规则的 correctionHint 引用 CLAUDE.md 对应条款原文。

### 6.4 SensorFeedbackLoop

**职责：** 协调并行 Sensor 执行、管理自纠正循环、超时/异常处理。

process() 流程：
1. `runAllSensorsWithTimeout()` 并行执行，单个超时 1 秒跳过
2. 过滤 error 级信号 → 无 error 则返回
3. 有 error → `buildCorrectionPrompt()` → `generator.refine()` → 重新 scan
4. 最多 2 轮，耗尽返回当前最佳版本

关键常量：`SENSOR_TIMEOUT_MS = 1000`、`MAX_CORRECTION_ROUNDS = 2`

---

## 七、编排器集成设计

### 7.1 HarnessOrchestrator 改造

**构造函数追加：** `guideRegistry: GuideRegistry`、`sensorFeedbackLoop: SensorFeedbackLoop`

**execute() 插桩：**
```
guides = guideRegistry.resolve(request, ctx)
→ trace('guide.resolved', guides.map(g => g.id))
→ contextEngine.assembleForHarness({ ...request, mode, guides })
→ 现有 switch(mode) 不变
```

**executeDual()/executePanel() 插桩：**
```
suggestion = evaluator 通过后的最终版本
→ sensorResult = sensorFeedbackLoop.process(suggestion, context, generator, request)
→ trace('sensor.feedback_completed', signals.length, corrections)
→ HarnessResult.finalResponse = sensorResult.response
→ HarnessResult.sensorSignals = sensorResult.signals
```

### 7.2 ContextEngine 升级

`GuidePlaceholder` 从 `{ id, priority, content }` 升级为完整 `Guide` 类型（`export type GuidePlaceholder = import('./harness/guides/types').Guide`）。`assembleForHarness()` 内部逻辑不变。

### 7.3 IPC + 初始化

HarnessHandler 追加 `harness:listGuides` 和 `harness:setGuideEnabled` handler。

main/index.ts 在 TASK018 初始化链中追加：
```typescript
const guideRegistry = new GuideRegistry(fileManager, logger)
await guideRegistry.loadBuiltIn()
await guideRegistry.loadWorkspaceCustom(workspaceRoot)

const sensorFeedbackLoop = new SensorFeedbackLoop(
  [new ReferenceIntegritySensor(fileManager, localRagEngine),
   new MarkdownFormatSensor(), new SpecComplianceSensor()],
  logger
)

// 注入到 HarnessOrchestrator 构造
```

---

## 八、测试策略与用例矩阵

### 8.1 测试分层

| 层级 | 文件 | 覆盖目标 |
|------|------|---------|
| GuideRegistry | `tests/harness/guides/registry.test.ts` | 加载/解析/排序/budget裁剪/启停 |
| ReferenceIntegritySensor | `tests/harness/sensors/reference-integrity.test.ts` | 文件引用检测+模糊匹配 |
| MarkdownFormatSensor | `tests/harness/sensors/markdown-format.test.ts` | 4项格式检查 |
| SpecComplianceSensor | `tests/harness/sensors/spec-compliance.test.ts` | 4条条款规则 |
| SensorFeedbackLoop | `tests/harness/sensors/feedback-loop.test.ts` | 自纠正循环+超时+异常 |
| 集成测试 | `tests/harness/sensors/integration.test.ts` | Guide→Generator→Sensor全流程 |

### 8.2 GuideRegistry 测试

| 用例 | 预期 |
|------|------|
| 4 个内置 Guide 加载 | guides.length = 4 |
| workspace 自定义加载（正常/格式错误/目录不存在） | 正确加载/跳过/静默 |
| resolve() 优先级排序 | Risk > Path > Intent > Model |
| Token budget 裁剪 | 超限的低优先级被裁剪 |
| setGuideEnabled(false) 后 resolve 不含该 Guide | 验证禁用生效 |
| setGuideEnabled(未知id) 抛错 | 明确错误信息 |

### 8.3 Sensor 测试

**ReferenceIntegritySensor：** 存在文件无信号 / 不存在文件→error+建议 / Skill 检测 / 模糊匹配降级

**MarkdownFormatSensor：** 正常MD无信号 / 未闭合代码块→error+行号 / 表格不一致→warn / 标题跳跃→warn / 链接未闭合→warn

**SpecComplianceSensor：** 正常建议无信号 / `any` 类型→error / `rm -rf`→error / 非原子写入→error

**SensorFeedbackLoop：** 全通过→0 corrections / 首轮error→refine→二轮通过→1 correction / 两轮不过→2 corrections / Sensor超时跳过+warn日志 / Sensor异常跳过不中断

### 8.4 集成测试

| 用例 | 流程 | 预期 |
|------|------|------|
| Spec 修改全流程 | SpecModificationGuide 激活 → Generator → SpecComplianceSensor 通过 | Guide 注入，0 corrections |
| 文件引用纠正 | Generator 引用不存在文件 → Sensor error → refine 纠正 | 1 correction |
| Guide + Sensor 联合 | 多 Guide 注入 + Sensor 通过 | Guides 正确排序合并 |

### 8.5 Mock 策略

| 被测模块 | Mock |
|---------|------|
| GuideRegistry | `FileManager`（exists/readdir/readFile） |
| ReferenceIntegritySensor | `FileManager`（exists）、`LocalSearchEngine`（fuzzyFindFile） |
| MarkdownFormatSensor | 无外部依赖 |
| SpecComplianceSensor | 无外部依赖 |
| SensorFeedbackLoop | `Sensor[]`（scan）、`Generator`（refine） |

---

## 九、实施步骤与阶段目标

### 阶段 1：类型与骨架（目标：可编译）

1. 新建 `guides/types.ts` + `sensors/types.ts`
2. `shared/types.ts` 追加 GuideSummary、SetGuideEnabledRequest、IPC 通道
3. 新建 registry.ts / feedback-loop.ts / 4 Guide / 3 Sensor 空骨架
4. 新建测试目录与空文件

**标志：** `npm run typecheck` 通过

### 阶段 2：GuideRegistry + 内置 Guide

1. 实现 registry 全部方法（loadBuiltIn/loadWorkspaceCustom/resolve/applyTokenBudget/listGuides/setGuideEnabled）
2. 实现 4 个内置 Guide 的 matches() + content
3. 补齐 `registry.test.ts`

**标志：** registry 测试全绿，4 Guide 独立可用

### 阶段 3：三个 Sensor

1. 实现 ReferenceIntegritySensor（含 suggestSimilarFile 降级）
2. 实现 MarkdownFormatSensor（4 项检查）
3. 实现 SpecComplianceSensor（4 条规则）
4. 补齐 3 个 Sensor 测试

**标志：** 3 个 Sensor 测试全绿

### 阶段 4：SensorFeedbackLoop

1. 实现 process() / runAllSensorsWithTimeout() / withTimeout() / buildCorrectionPrompt()
2. 补齐 feedback-loop.test.ts

**标志：** 自纠正循环、超时跳过行为稳定

### 阶段 5：编排器集成

1. orchestrator.ts 构造追加 + execute()/executeDual()/executePanel() 插桩
2. context-engine.ts GuidePlaceholder 升级
3. harness.ts 追加 Guide 管理 IPC handler
4. main/index.ts 追加初始化

**标志：** 全链路 Guide 注入 + Sensor 检查通畅

### 阶段 6：集成测试 + 回归验证

1. integration.test.ts
2. typecheck / lint / test
3. 人工验证 3 条典型路径

**标志：** 全量验证通过

### 推荐开发顺序

```
1. types (guides + sensors) → 2. shared/types.ts → 3. 4 built-in Guide
→ 4. registry.ts → 5. 3 Sensor → 6. feedback-loop.ts
→ 7. orchestrator.ts → 8. context-engine.ts → 9. harness.ts (IPC)
→ 10. main/index.ts → 11. tests（每阶段同步）
```

---

## 十、风险、验证与交付标准

### 10.1 主要风险

| 风险 | 缓解策略 |
|------|---------|
| Guide Token 占比过高 | `MAX_GUIDE_BUDGET_PERCENT=0.2` 硬上限 |
| Sensor 误报过多 | severity 严格分级；格式问题默认 warn |
| 自纠正无限循环 | `MAX_CORRECTION_ROUNDS=2` 硬上限 |
| Sensor 阻塞主流程 | 1 秒超时 + `Promise.allSettled` 隔离 |
| 自定义 Guide JSON 解析失败 | try-catch + warn 日志 + 跳过 |
| Generator.refine() 在循环中失败 | try-catch 返回当前版本 + 全部 signals |

### 10.2 验收标准映射

**Guides（7 条）：**
1. 根据意图/路径/模型/风险解析 Guide → `resolve()` 单测
2. 多 Guide 按优先级排序 → `resolve()` 单测
3. 不超过 budget 20% → `applyTokenBudget()` 单测
4. 消息元数据展示活跃 Guide → trace + 集成测试
5. Guide 注入后仍违反 → `SpecComplianceSensor` 记录 failure
6. workspace 自定义 Guide 自动加载 → `loadWorkspaceCustom()` 单测
7. 禁用后不再注入 → `setGuideEnabled()` + `resolve()` 单测

**Sensors（8 条）：**
1. AI 产出后运行所有 Sensor → `process()` 集成测试
2. 引用不存在文件给出建议 → `suggestSimilarFile()` 单测
3. Markdown 错误定位行号 → 各检查方法单测
4. Spec 违规引用条款原文 → `SpecComplianceSensor` 单测
5. 自纠正最多 2 轮 → feedback-loop 单测
6. 全通过附加「已验证」标识 → 集成测试
7. 超时跳过+warn → feedback-loop 单测
8. 语义搜索不可用降级本地匹配 → reference-integrity 单测

### 10.3 完成定义

1. 新建 11 个主进程文件全部落地
2. 修改 5 个现有文件完成叠加式扩展
3. 6 个测试文件全绿（覆盖率 ≥80%）
4. `npm run typecheck` 通过
5. `npm run lint` 通过
6. `npm run test` 通过
7. 人工验证至少 3 条典型路径
8. 任务状态文件按 `CLAUDE.md` §九 更新

### 10.4 最终交付物清单

**新建（17 文件）：**
- `src/main/services/harness/guides/` — types.ts, registry.ts, built-in/{spec-modification,product-docs-path,file-edit-intent,claude-verbosity}.ts
- `src/main/services/harness/sensors/` — types.ts, reference-integrity.ts, markdown-format.ts, spec-compliance.ts, feedback-loop.ts
- `tests/harness/guides/registry.test.ts`
- `tests/harness/sensors/` — {reference-integrity,markdown-format,spec-compliance,feedback-loop,integration}.test.ts

**修改（5 文件）：**
- `src/main/services/harness/orchestrator.ts`
- `src/main/services/context-engine.ts`
- `src/shared/types.ts`
- `src/main/ipc/handlers/harness.ts`
- `src/main/index.ts`

---

## 十一、结论

本任务建立 Harness 的**质量控制闭环**。实施底线：

1. **确定性优先**：Guides 匹配和 Sensors 检查全部为确定性代码，不依赖 LLM
2. **降级而非崩溃**：Sensor 超时跳过、异常跳过、语义搜索降级、纠正轮次耗尽返回当前最佳
3. **最小侵入集成**：对现有文件的改造为注入式，不修改现有方法签名
4. **完整追溯**：Guide 解析和 Sensor 信号全部通过 `appendHarnessTrace()` 记录

按本计划推进，为 TASK021（Harness UI）提供稳定的 Guides + Sensors 基础设施。
