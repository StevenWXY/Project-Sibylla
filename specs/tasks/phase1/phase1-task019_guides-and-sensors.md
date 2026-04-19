# Guides 前馈控制与 Sensors 反馈系统

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK019 |
| **任务标题** | Guides 前馈控制与 Sensors 反馈系统 |
| **所属阶段** | Phase 1 - Harness 基础设施 (Sprint 3.1) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

实现 Harness 系统的完整质量控制闭环：Guides 作为前馈信号在 AI 回答前注入正确指导，Sensors 作为后馈信号在 AI 回答后检测问题并驱动自纠正。两者共同构成「事前预防 + 事后检查」的双保险机制。

### 背景

TASK018 已实现 Generator/Evaluator 双 Agent 架构与编排器，但存在以下不足：
- Generator 的 system prompt 缺乏针对任务类型的精细化指导（如修改 Spec 时应引用具体条款）
- Evaluator 是 LLM 级的语义审查，成本高、延迟大，无法替代确定性检查
- AI 产出中的引用不存在文件、Markdown 格式错误、违反 CLAUDE.md 条款等问题需要轻量级确定性检查

Guides 和 Sensors 正是填补这两个缺口：
- **Guides**：在上下文组装阶段被动态注入 system prompt，让 AI 第一次就产出高质量结果（减少 Evaluator 重试）
- **Sensors**：在 AI 产出后、呈现给用户前运行确定性检查，检测到问题时驱动 Generator 自纠正（最多 2 轮）

### 范围

**包含：**
- Guides 系统：
  - `Guide` / `GuideCategory` 类型定义
  - `GuideRegistry` 注册表（加载内置 + workspace 自定义 Guide）
  - 4 类 Guide：Intent Guide、Path Guide、Model Guide、Risk Guide
  - Token budget 管控（不超过上下文 20%）
  - 优先级排序与压缩策略
- Sensors 系统：
  - `Sensor` / `SensorSignal` 类型定义
  - `SensorFeedbackLoop` 反馈循环控制器
  - 3 类 Sensor：`ReferenceIntegritySensor`、`MarkdownFormatSensor`、`SpecComplianceSensor`
  - 自纠正循环（最多 2 轮）
  - 单个 Sensor 超时保护（1 秒）
- 与 `HarnessOrchestrator` 的集成点
- 与 `ContextEngine.assembleForHarness()` 的 Guides 注入
- 单元测试

**不包含：**
- LLM 驱动的语义级 Sensor（后续迭代）
- 更多内置 Guide/Sensor（后续迭代）
- Guide/Sensor 管理 UI（属于 TASK021）

## 验收标准

### Guides 验收标准

- [ ] 上下文引擎组装时，系统根据意图、路径、模型、风险解析适用的 Guides
- [ ] 多个 Guide 同时生效时，按优先级排序合并（Risk > Path > Intent > Model）
- [ ] Guide 注入不超过上下文 budget 的 20%，超出时压缩低优先级 Guide
- [ ] 用户查看消息元数据时，可看到该消息激活了哪些 Guide
- [ ] Guide 注入后 AI 仍违反指导时，记录为 Guide failure（供 Sprint 3.3 消费）
- [ ] workspace 自定义 Guide（`.sibylla/harness/guides/*.json`）启动时自动加载
- [ ] 用户在设置中禁用某个 Guide 后，系统不再注入它

### Sensors 验收标准

- [ ] AI 产出响应后、呈现给用户前，系统运行所有适用的 Sensor
- [ ] `ReferenceIntegritySensor` 检测到不存在文件引用时，提供模糊匹配建议
- [ ] `MarkdownFormatSensor` 检测到格式错误时，定位具体行号并描述修正方式
- [ ] `SpecComplianceSensor` 检测到条款违反时，引用 CLAUDE.md 中的违反条款原文
- [ ] Sensor 触发自纠正时，限制最多 2 轮避免循环
- [ ] 所有 Sensor 通过时，消息附加「已验证」标识
- [ ] 单个 Sensor 扫描超过 1 秒时，超时跳过并记录警告
- [ ] 语义搜索不可用时，`ReferenceIntegritySensor` 降级到本地模糊匹配

## 依赖关系

### 前置依赖

- [x] TASK018（编排器）— Guides 注入 Orchestrator 上下文，Sensors 在 Generator 产出后运行
- [x] ContextEngine（`src/main/services/context-engine.ts`）— `assembleForHarness()` 接收 Guides
- [x] FileManager（`src/main/services/file-manager.ts`）— Sensor 检查文件是否存在
- [x] LocalSearchEngine（`src/main/services/local-rag-engine.ts`）— Sensor 的模糊匹配 fallback

### 被依赖任务

- TASK021（Harness UI）— ActiveGuidesIndicator 组件展示活跃 Guide

## 参考文档

- [`specs/requirements/phase1/sprint3.1-harness.md`](../../requirements/phase1/sprint3.1-harness.md) — 需求 3.1.3 Guides + 需求 3.1.4 Sensors
- [`CLAUDE.md`](../../../CLAUDE.md) — 设计哲学（§二）、代码规范（§四）
- `.kilocode/skills/phase1/ai-context-engine/SKILL.md` — 上下文引擎设计模式
- `src/main/services/context-engine.ts` — ContextEngine 现有实现

## 技术执行路径

### 架构设计

```
Guides + Sensors 质量控制闭环

请求进入
    │
    ▼
GuideRegistry.resolve(request, ctx)
    │
    ├── 匹配 Intent Guide（基于意图：file_modify / question / brainstorm）
    ├── 匹配 Path Guide（基于路径：docs/product/** → 产品组规范）
    ├── 匹配 Model Guide（基于模型 quirks：Claude → 简洁指令）
    └── 匹配 Risk Guide（基于风险：修改 Spec → 引用条款）
    │
    ▼ 按优先级排序 + Token Budget 裁剪
    │
ContextEngine.assembleForHarness(request, mode, guides)
    │
    ▼ Guides 注入到 system prompt 前缀
    │
Generator.generate(request, context)  ← TASK018
    │
    ▼ 产出 AI Response
    │
SensorFeedbackLoop.process(response, context, generator, request)
    │
    ├── ReferenceIntegritySensor.scan() → 检查文件引用是否存在
    ├── MarkdownFormatSensor.scan()     → 检查格式错误
    ├── SpecComplianceSensor.scan()     → 检查 CLAUDE.md 条款违反
    │
    ▼ 有 error 级信号？
    │
    ├── YES → Generator.refine(correctionPrompt) → 重新 scan（最多2轮）
    └── NO  → 返回最终 response + 全部 signals
```

### Guides 分类与优先级

| 优先级 | 类别 | 说明 | 示例 |
|--------|------|------|------|
| 100 | Risk | 基于风险等级 | `risk.spec-modification`：修改 Spec 时引用具体条款 |
| 80 | Path | 基于目标路径 | `path.product-docs`：修改 docs/product/ 时加载产品规范 |
| 60 | Intent | 基于意图 | `intent.file-edit`：文件修改时注意 diff 格式 |
| 40 | Model | 基于模型 | `model.claude-verbosity`：Claude 模型注入简洁指令 |

### Sensors 检查维度

| Sensor | 检查能力 | 自纠正策略 |
|--------|---------|-----------|
| ReferenceIntegritySensor | 文件路径、Skill 名是否真实存在 | 提供模糊匹配建议 |
| MarkdownFormatSensor | 表格闭合、代码块闭合、标题层级 | 定位行号 + 修正建议 |
| SpecComplianceSensor | 是否违反 CLAUDE.md 明确条款 | 引用违反的条款原文 |

### 核心类型设计

```typescript
// guides/types.ts

export type GuideCategory = 'intent' | 'path' | 'model' | 'risk'

export interface Guide {
  id: string
  category: GuideCategory
  priority: number
  description: string
  matches(request: AIChatRequest, ctx: GuideMatchContext): boolean
  content: string
  tokenBudget: number
  enabled: boolean
}

export interface GuideMatchContext {
  currentModel: string
  workspaceConfig: WorkspaceConfig
  userId: string
}
```

```typescript
// sensors/types.ts

export interface Sensor {
  id: string
  description: string
  scan(response: AIResponse, context: AssembledContext): Promise<SensorSignal[]>
}

export interface SensorSignal {
  sensorId: string
  severity: 'info' | 'warn' | 'error'
  location?: { file?: string; line?: number; span?: [number, number] }
  message: string
  correctionHint: string
}
```

## 执行步骤

### 第一部分：Guides 前馈控制系统

#### 步骤 1：定义 Guides 类型

**文件：** `src/main/services/harness/guides/types.ts`

1. 定义 `GuideCategory` 字面量联合类型：`'intent' | 'path' | 'model' | 'risk'`
2. 定义 `Guide` 接口：包含 id、category、priority、description、matches()、content、tokenBudget、enabled
3. 定义 `GuideMatchContext` 接口：包含 currentModel、workspaceConfig、userId
4. 定义 `MAX_GUIDE_BUDGET_PERCENT = 0.2` 常量（Guide 不超过上下文 20%）

#### 步骤 2：实现 `GuideRegistry` 注册表

**文件：** `src/main/services/harness/guides/registry.ts`

1. 创建 `GuideRegistry` 类，维护 `guides: Guide[]` 数组
2. 实现 `loadBuiltIn()` 方法：加载 4 个内置 Guide（见步骤 3-6）
3. 实现 `loadWorkspaceCustom(workspaceRoot)` 方法：
   - 读取 `.sibylla/harness/guides/` 目录下的 `*.json` 文件
   - 每个 JSON 文件解析为 `Guide` 对象
   - 解析失败的文件记录 warn 日志并跳过
   - 目录不存在时静默跳过
4. 实现 `resolve(request, ctx)` 方法：
   - 过滤 `enabled` 且 `matches()` 为 true 的 Guide
   - 按 priority 降序排序
   - 调用 `applyTokenBudget()` 裁剪
5. 实现 `applyTokenBudget(guides, maxTotal)` 方法：
   - 从高优先级开始累加 tokenBudget
   - 超过上限时停止加入
6. 实现 `listGuides()` 和 `setGuideEnabled(id, enabled)` 方法（供 IPC 调用）

#### 步骤 3：实现 Risk Guide — `SpecModificationGuide`

**文件：** `src/main/services/harness/guides/built-in/spec-modification.ts`

1. id: `risk.spec-modification`，category: `risk`，priority: 100
2. `matches()` 条件：`request.intent === 'modify_file'` 且 `targetFile` 匹配 Spec 文件模式
3. content 指导 AI：
   - 修改前引用当前条款的精确位置（章节和句子）
   - 解释当前条款保护的不变量
   - 解释新条款是否仍保护该不变量
   - 禁止静默删除规则，所有移除必须明确说明理由
   - 如与其他条款冲突，显式声明而非静默选择
4. tokenBudget: 250

#### 步骤 4：实现 Path Guide — `ProductDocsPathGuide`

**文件：** `src/main/services/harness/guides/built-in/product-docs-path.ts`

1. id: `path.product-docs`，category: `path`，priority: 80
2. `matches()` 条件：`targetFile` 以 `docs/product/` 开头
3. content 指导 AI：修改产品文档时注意引用现有 spec、保持术语一致、标注文档状态
4. tokenBudget: 150

#### 步骤 5：实现 Intent Guide — `FileEditIntentGuide`

**文件：** `src/main/services/harness/guides/built-in/file-edit-intent.ts`

1. id: `intent.file-edit`，category: `intent`，priority: 60
2. `matches()` 条件：`request.intent === 'modify_file'`
3. content 指导 AI：使用 diff 格式输出修改、保留未修改部分、标注新增/删除
4. tokenBudget: 150

#### 步骤 6：实现 Model Guide — `ClaudeVerbosityGuide`

**文件：** `src/main/services/harness/guides/built-in/claude-verbosity.ts`

1. id: `model.claude-verbosity`，category: `model`，priority: 40
2. `matches()` 条件：`ctx.currentModel` 包含 `'claude'`
3. content 指导 AI：简洁回答、避免重复已有上下文、直接给出修改建议
4. tokenBudget: 100

### 第二部分：Sensors 反馈控制系统

#### 步骤 7：定义 Sensors 类型

**文件：** `src/main/services/harness/sensors/types.ts`

1. 定义 `Sensor` 接口：包含 id、description、`scan()` 方法
2. 定义 `SensorSignal` 接口：包含 sensorId、severity（info/warn/error）、location（可选）、message、correctionHint
3. 定义 `SENSOR_TIMEOUT_MS = 1000` 常量
4. 定义 `MAX_CORRECTION_ROUNDS = 2` 常量

#### 步骤 8：实现 `ReferenceIntegritySensor`

**文件：** `src/main/services/harness/sensors/reference-integrity.ts`

1. 实现 `Sensor` 接口，id: `reference-integrity`
2. 定义引用提取正则：
   - 文件引用：`@[[file]]`、`[[file]]`、`` `path/to/file.ext` ``
   - Skill 引用：`#skill-name`
3. 实现 `scan(response, context)` 方法：
   - 提取响应中所有文件引用
   - 对每个引用检查文件是否存在于 workspace
   - 不存在时调用 `suggestSimilarFile()` 获取模糊匹配
   - 产出 error 级 SensorSignal，correctionHint 包含建议替代文件
4. 实现 `suggestSimilarFile(path)` 方法：
   - 先调用 `localSearchEngine.fuzzyFindFile()` 本地模糊匹配
   - 本地无结果时尝试语义搜索（`SemanticSearchClient` 接口，Sprint 4 实现）
   - 语义搜索不可用时返回 null
   - 使用编辑距离阈值 maxDistance: 3

#### 步骤 9：实现 `MarkdownFormatSensor`

**文件：** `src/main/services/harness/sensors/markdown-format.ts`

1. 实现 `Sensor` 接口，id: `markdown-format`
2. 实现 `scan(response, context)` 方法，检查以下格式问题：
   - **表格未闭合**：`|` 行数非 0 且管道符数量不一致
   - **代码块未闭合**：反引号 ``` 出现奇数次
   - **标题层级跳跃**：从 H2 直接跳到 H4（缺少 H3）
   - **链接未闭合**：`[text](` 无对应 `)`
3. 对每个问题产出 SensorSignal：
   - `location.line` 定位到具体行号
   - `correctionHint` 描述修正方式（如 "Table row 5 has 4 pipes but header has 3"）
4. severity 根据影响程度判定：代码块未闭合 → error，其他 → warn

#### 步骤 10：实现 `SpecComplianceSensor`

**文件：** `src/main/services/harness/sensors/spec-compliance.ts`

1. 实现 `Sensor` 接口，id: `spec-compliance`
2. 加载 CLAUDE.md 中的关键条款（硬编码检查规则，非 LLM）：
   - 「文件即真相」：检查是否建议引入私有二进制格式
   - 「AI 建议，人类决策」：检查是否包含不可逆命令
   - 「禁止 any」：检查是否生成含 `any` 类型的 TypeScript 代码
   - 「原子写入」：检查是否直接覆盖文件而非 temp + rename
3. 检测到违反时产出 error 级 SensorSignal：
   - `message` 引用被违反的条款原文
   - `correctionHint` 指出应如何修正
4. 条款匹配采用正则 + 关键词模式，保持确定性（非 LLM）

#### 步骤 11：实现 `SensorFeedbackLoop` 控制器

**文件：** `src/main/services/harness/sensors/feedback-loop.ts`

1. 创建 `SensorFeedbackLoop` 类，注入 sensors 数组和 Logger
2. 实现 `process(initialResponse, context, generator, request)` 方法：
   - 初始化 `current = initialResponse`，`allSignals = []`
   - 进入 for 循环（`round < MAX_CORRECTION_ROUNDS`）：
     - 调用 `runAllSensorsWithTimeout(current, context)`
     - 过滤 error 级信号
     - 若无 error → 返回 `{ response: current, signals: allSignals, corrections: round }`
     - 有 error → 调用 `buildCorrectionPrompt(errors)` 构建修正提示
     - 调用 `generator.refine()` 生成改进版本
   - 循环耗尽后返回最终结果
3. 实现 `runAllSensorsWithTimeout(response, context)` 方法：
   - 使用 `Promise.allSettled` 并行执行所有 Sensor
   - 每个 Sensor 包裹 `withTimeout()`（SENSOR_TIMEOUT_MS）
   - 超时的 Sensor 跳过，记录 warn 日志
   - settled 状态为 rejected 时跳过，不中断其他 Sensor
4. 实现 `buildCorrectionPrompt(errors)` 方法：
   - 将所有 error 级信号编号排列
   - 生成 LLM 优化的修正提示文本

#### 步骤 12：集成到 `HarnessOrchestrator`

**文件：** `src/main/services/harness/orchestrator.ts`

1. 在 `executeDual()` / `executePanel()` 中，Generator 产出 suggestion 后：
   - 调用 `sensorFeedbackLoop.process(suggestion, context, generator, request)`
   - 用 `process()` 返回的 response 替换原始 suggestion
   - 将 `signals` 写入 `HarnessResult.sensorSignals`
2. 在 `execute()` 主入口中：
   - 调用 `guideRegistry.resolve(request, ctx)` 获取适用的 Guides
   - 将 Guides 传入 `contextEngine.assembleForHarness()`
3. 所有 Guides 和 Sensors 的决策写入 harness trace

#### 步骤 13：编写单元测试

**文件：** `tests/harness/sensors/` + `tests/harness/guides/`

1. `guides/registry.test.ts` — GuideRegistry 测试：
   - 内置 Guide 加载
   - workspace 自定义 Guide 加载（正常 + JSON 格式错误）
   - resolve() 按优先级排序
   - token budget 裁剪（超过 20% 时丢弃低优先级）
   - Guide 禁用后不参与 resolve

2. `sensors/reference-integrity.test.ts`：
   - 引用存在的文件 → 无信号
   - 引用不存在的文件 → error + 模糊匹配建议
   - 引用 Skill 名 → 检查是否存在
   - 无引用 → 无信号

3. `sensors/markdown-format.test.ts`：
   - 正常 Markdown → 无信号
   - 表格未闭合 → warn/error + 行号
   - 代码块未闭合 → error
   - 标题跳跃 → warn

4. `sensors/spec-compliance.test.ts`：
   - 正常建议 → 无信号
   - 包含 `any` 类型 → error + 条款引用
   - 直接覆盖文件 → error + 条款引用

5. `sensors/feedback-loop.test.ts`：
   - 所有 Sensor 通过 → 0 corrections
   - 首轮检测 error → 自纠正 → 二轮通过 → 1 correction
   - 两轮都未通过 → 2 corrections + 最终结果
   - Sensor 超时 → 跳过该 Sensor
   - Sensor 异常 → 跳过该 Sensor

6. 集成测试：Guide 注入 → Generator → Sensor 检查 → 自纠正全流程

### 步骤 14：集成验证

1. 运行 `npm run typecheck` 确保类型无误
2. 运行 `npm run lint` 确保代码规范
3. 运行 `npm run test` 确保所有测试通过
4. 在开发环境中验证：修改 Spec 文件时 SpecModificationGuide 激活
5. 验证 ReferenceIntegritySensor：AI 引用不存在文件时触发自纠正

---

**创建时间：** 2026-04-18
**最后更新：** 2026-04-18
