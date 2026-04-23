# Prompt 库基础设施与 PromptComposer

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK035 |
| **任务标题** | Prompt 库基础设施与 PromptComposer |
| **所属阶段** | Phase 1 - AI 能力扩展体系 (Sprint 3.5) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

建立 Sprint 3.5 的基础设施中枢——Prompt 库与 PromptComposer。将当前散落在代码中的硬编码字符串 prompt 迁移到文件化、分层化、用户可覆盖的 Markdown 文件体系；实现 PromptComposer 作为 ContextEngine 的内部子模块，负责 prompt 片段的加载、渲染、冲突检测与 Token 预算管理。本任务是 Sprint 3.5 全部后续任务（TASK036-039）的地基。

### 背景

Sprint 3.0-3.4 建立了完整的 AI 基础设施链：对话基线、Harness、记忆、Trace、模式与 Plan。当前 AI 的 system prompt 由以下来源拼装：

| 来源 | 现状 | 位置 |
|------|------|------|
| 基础身份 prompt | 硬编码常量 `SYSTEM_PROMPT_BASE` | `context-engine.ts:54-56` |
| 模式 prompt | 硬编码在 TS 文件中 | `mode/builtin-modes/*.ts`（如 `PLAN_MODE_PROMPT`） |
| Evaluator prompt | 硬编码常量 | `evaluator.ts:30-54` |
| Guide prompt | Guide 对象的 content 字段 | `harness/guides/` |
| 工具描述 | 工具定义中内嵌 | `harness/built-in-tools.ts` |

**核心问题**：

1. **不可定制**：非技术用户无法通过 UI 修改 AI 行为（需改代码重新编译）
2. **不可审计**：Trace 中无法追溯一次 AI 调用使用了哪些 prompt 片段及版本
3. **不可团队同步**：团队共享的自定义 prompt 无法通过 Git 传播
4. **不可评估**：不同 prompt 版本的效果无法对比（无版本元数据）

**核心设计约束（来自附录 A §17A.1）**：

- PromptComposer **不是**独立顶层模块，而是 ContextEngine 的内部子模块
- 现有 `AssembledContext` 接口保留，新增可选 `promptParts` 字段
- 现有 `ContextLayerType` 从 4 值扩展为 9 值，不删除已有值
- 硬编码 `SYSTEM_PROMPT_BASE` 替换为从 `resources/prompts/core/identity.md` 加载
- ContextEngine 的 `assembleContext()` 和 `assembleForHarness()` 内部委托给 PromptComposer
- Mode 的 `systemPromptPrefix` 逐步迁移到 prompt 文件（§17A.3），TS 文件仅保留 `promptFileId` 引用

### 范围

**包含：**

- Prompt 文件格式规范（Markdown + YAML frontmatter）
- 内置 prompt 资源文件创建（core/、modes/、tools/、contexts/）
- PromptLoader — prompt 文件加载（双源：内置 + 用户覆盖）
- PromptRegistry — prompt 注册索引与元数据管理
- PromptComposer — prompt 片段组合（组合顺序、模板渲染、冲突检测、Token 预算）
- ContextEngine 集成 — 拆分为目录结构，PromptComposer 作为子模块
- Mode prompt 混合迁移 — builtin-modes/*.ts 新增 promptFileId，提取 prompt 到文件
- shared/types.ts 扩展 — ContextLayerType、AssembledContext、新增 Prompt 类型
- IPC 通道 — prompt-library:* 命名空间（列表/读取/派生/重置/验证/估算）
- 单元测试

**不包含：**

- Skill v2 的 prompt 注入（TASK037）
- Sub-agent 的独立 PromptComposer 实例（TASK038）
- Hook 系统的 prompt 模板（TASK036）
- Prompt 性能评估 UI（TASK039，P2）
- 图形化 prompt 编辑器

## 依赖关系

### 前置依赖

- [x] TASK012 — 上下文引擎 v1（ContextEngine 已可用，本任务在其上拆分演进）
- [x] TASK027 — Tracer SDK（Tracer / TraceStore 已可用，PromptComposer 组合结果需记录 Trace）
- [x] TASK030 — AI 模式系统（AiModeRegistry 已可用，mode prompt 需迁移到文件）
- [x] TASK022 — 记忆系统 v2（Token 计数器已可用）

### 被依赖任务

- TASK036 — Hook 节点系统与 Reactive Compact（Hook prompt 从 Prompt 库加载）
- TASK037 — Skill 系统 v2 与 Slash Command 扩展（Skill prompt 注入通过 PromptComposer）
- TASK038 — Sub-agent 独立循环系统（Sub-agent 使用独立 PromptComposer 实例）
- TASK039 — Workflow 自动化与管理 UI 收官（Prompt 库浏览面板）

## 参考文档

- [`specs/requirements/phase1/sprint3.5-ai_ablities.md`](../../requirements/phase1/sprint3.5-ai_ablities.md) — 需求 3.5.1（§5.1）、第 4.1 节、第 17A.1/17A.3 节
- [`specs/design/architecture.md`](../../design/architecture.md) — 进程通信架构、模块划分
- [`CLAUDE.md`](../../../CLAUDE.md) — 设计哲学、文件即真相、AI 建议/人类决策
- `.kilocode/skills/phase1/ai-context-engine/SKILL.md` — 上下文引擎设计指南
- `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` — TypeScript 严格模式
- `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` — IPC 类型安全设计

## 验收标准

### Prompt 文件体系

- [ ] `resources/prompts/index.yaml` 索引文件创建，列出所有内置 prompt 的 id、scope、路径
- [ ] `resources/prompts/core/identity.md` 创建，内容为现有 `SYSTEM_PROMPT_BASE` 的文件化版本
- [ ] `resources/prompts/core/principles.md` 创建，包含 Sibylla 五大设计哲学
- [ ] `resources/prompts/core/tone.md` 创建，包含基础语气约束
- [ ] `resources/prompts/modes/free.md` 创建，内容为 free 模式的 prompt
- [ ] `resources/prompts/modes/plan.md` 创建，内容从 `builtin-modes/plan.ts` 的 `PLAN_MODE_PROMPT` 迁移
- [ ] `resources/prompts/modes/analyze.md`、`review.md`、`write.md` 分别创建
- [ ] `resources/prompts/tools/read-file.md`、`search.md`、`list-files.md` 等 7 个工具 prompt 创建
- [ ] `resources/prompts/contexts/workspace-context.md`、`user-profile.md`、`time-context.md` 模板创建
- [ ] 每个 prompt 文件的 frontmatter 包含 `id`、`version`、`scope` 必填字段

### PromptLoader 双源加载

- [ ] PromptLoader 支持解析 Markdown + YAML frontmatter 格式
- [ ] PromptLoader 内置路径解析：`resources/prompts/{scope}/{id}.md`
- [ ] PromptLoader 用户覆盖路径解析：`{workspace}/.sibylla/prompts-local/{scope}/{id}.md`
- [ ] 用户覆盖文件存在时优先加载，返回 `source: 'user-override'`
- [ ] 用户覆盖文件不存在时回落内置，返回 `source: 'builtin'`
- [ ] frontmatter 格式错误时返回明确错误（文件路径 + 行号 + 错误类型），不静默跳过
- [ ] PromptLoader 支持模板渲染（Mustache 风格 `{{variable}}` 插值 + `{{#condition}}...{{/condition}}` 条件渲染）
- [ ] 模板渲染不支持 JavaScript 表达式（刻意约束）

### PromptRegistry 注册索引

- [ ] 应用启动时扫描 `resources/prompts/` 下所有 `.md` 文件并注册
- [ ] 应用启动时扫描 `{workspace}/.sibylla/prompts-local/` 下所有覆盖文件
- [ ] `getAll()` 返回所有已注册 prompt 的元数据（不含 body 内容）
- [ ] `get(id)` 返回指定 prompt 的完整元数据（含 frontmatter 所有字段）
- [ ] `getByScope(scope)` 返回指定作用域下所有 prompt
- [ ] 相同 id 的 prompt 被覆盖时，registry 中标记为 user-override
- [ ] prompt 的 frontmatter 包含 `requires` 字段时，PromptRegistry 验证依赖是否存在

### PromptComposer 核心组合

- [ ] `compose(context: ComposeContext)` 返回 `ComposedPrompt`，包含 `text`、`parts`、`estimatedTokens`、`version`、`warnings`
- [ ] 组合顺序严格为：core → mode → tools → agent → hooks → contexts
- [ ] core/identity.md、core/principles.md、core/tone.md 三个片段**始终加载**，不可跳过
- [ ] core 目录下的 prompt 即使用户覆盖，也会强制合并内置的 `<immutable>` 标记内容（R1 缓解）
- [ ] mode 片段按 `ComposeContext.mode` 加载对应的 `modes/{mode}.md`
- [ ] tools 片段按 `ComposeContext.tools` 列表逐个加载，工具无对应 prompt 文件时跳过（不报错）
- [ ] contexts 片段使用模板渲染，注入 `workspaceInfo`、`userPreferences`、时间等动态数据
- [ ] 两个 prompt 在 frontmatter 中互为 `conflicts` 时，在 `warnings` 中记录冲突但不阻止组合
- [ ] prompt 的 frontmatter 包含 `requires` 但依赖未加载时，抛出 `PromptDependencyError`

### Token 预算与缓存

- [ ] 组合后总 token 数超过 `ComposeContext.maxTokens` 时，在 `warnings` 中记录超限信息，不自动裁剪
- [ ] 每个 `PromptPart` 记录其 `tokens` 数
- [ ] 相同 ComposeContext 在 100ms 内被请求两次时，使用缓存返回（基于 `version` signature）
- [ ] 缓存命中率有埋点（记录到 Trace）

### ContextEngine 集成

- [ ] `context-engine.ts` 拆分为 `context-engine/index.ts` + 子模块
- [ ] ContextEngine 构造函数可选注入 PromptComposer
- [ ] 未注入 PromptComposer 时，行为与现有系统完全一致（向后兼容）
- [ ] 注入 PromptComposer 后，`assembleForHarness()` 内部委托给 PromptComposer 做 system prompt 组合
- [ ] 现有 `SYSTEM_PROMPT_BASE` 硬编码常量在 PromptComposer 可用时不再使用
- [ ] `AssembledContext` 新增可选字段 `promptParts?: PromptPart[]`

### Mode Prompt 混合迁移

- [ ] `AiModeDefinition` interface 新增 `promptFileId?: string` 字段
- [ ] 5 个内置 mode 的 `promptFileId` 分别指向 `modes/free`、`modes/plan`、`modes/analyze`、`modes/review`、`modes/write`
- [ ] `AiModeRegistry.buildSystemPromptPrefix()` 优先从 PromptComposer 加载 prompt 文件
- [ ] PromptComposer 不可用时，fallback 到现有 `systemPromptPrefix` 硬编码
- [ ] `outputConstraints`、`modeEvaluatorConfig`、`uiHints` 等结构化配置保留在 TS 文件中

### shared/types.ts 扩展

- [ ] `ContextLayerType` 从 `'always' | 'manual' | 'skill' | 'memory'` 扩展为 `'always' | 'manual' | 'skill' | 'memory' | 'mode' | 'tool' | 'agent' | 'hook' | 'context'`
- [ ] `AssembledContext` 新增 `promptParts?: PromptPart[]`
- [ ] 新增 `PromptMetadata`、`PromptContent`、`PromptPart`、`ComposeContext`、`ComposedPrompt` 类型

### IPC 集成

- [ ] `prompt-library:list-all` → `PromptMetadata[]`
- [ ] `prompt-library:read` → `PromptContent`（含 body + frontmatter）
- [ ] `prompt-library:derive-user-copy` → 将内置 prompt 复制到用户覆盖目录并返回路径
- [ ] `prompt-library:reset-user-override` → 删除用户覆盖文件
- [ ] `prompt-library:validate` → 校验 prompt 文件格式、token、冲突
- [ ] `prompt-library:estimate-tokens` → 返回 prompt 内容的 token 估算
- [ ] 所有 IPC 注册在 preload API 的 `promptLibrary` 命名空间下

### Trace 集成

- [ ] PromptComposer.compose() 在 Tracer 可用时包裹为 `prompt.compose` span
- [ ] span attributes 记录每个 part 的 id、source、version、tokens
- [ ] `ComposedPrompt.version`（组合签名）记录到 Trace，便于追溯

### 向后兼容

- [ ] `AssembledContext.promptParts` 为可选字段，未设置时不影响现有渲染逻辑
- [ ] `ContextLayerType` 新增值不影响已有代码的类型收窄
- [ ] `AiModeDefinition.promptFileId` 为可选字段，现有 mode 定义不设置时走原逻辑
- [ ] PromptComposer 未注入时，ContextEngine 行为与拆分前完全一致

## 技术执行路径

### 架构设计

```
Prompt 库基础设施整体架构

sibylla-desktop/resources/prompts/              ← 内置 prompt 资源（只读，随版本分发）
├── index.yaml                                   ← Prompt 索引与元数据
├── core/
│   ├── identity.md                              ← Sibylla AI 身份（替代 SYSTEM_PROMPT_BASE）
│   ├── principles.md                            ← 五大设计哲学（不可移除条款）
│   └── tone.md                                  ← 基础语气
├── modes/
│   ├── free.md                                  ← Free 模式 prompt
│   ├── plan.md                                  ← Plan 模式 prompt（从 builtin-modes/plan.ts 迁移）
│   ├── analyze.md                               ← Analyze 模式 prompt
│   ├── review.md                                ← Review 模式 prompt
│   └── write.md                                 ← Write 模式 prompt
├── tools/
│   ├── read-file.md                             ← 工具使用指南
│   ├── write-file.md
│   ├── edit-file.md
│   ├── search.md
│   ├── list-files.md
│   ├── spawn-subagent.md                        ← 预留给 TASK038
│   └── run-skill.md                             ← 预留给 TASK037
└── contexts/
    ├── workspace-context.md                     ← 动态模板：工作区信息
    ├── user-profile.md                          ← 动态模板：用户偏好
    └── time-context.md                          ← 动态模板：时间上下文

{workspace}/.sibylla/prompts-local/              ← 用户覆盖（可编辑，Git 版本化）
├── core/                                        ← 同名文件覆盖内置
├── modes/
└── ...

sibylla-desktop/src/main/services/
├── context-engine/                              ← 从 context-engine.ts 拆分为目录
│   ├── index.ts                                 ← ContextEngine 入口（重导出）
│   ├── context-engine.ts                        ← ContextEngine 主类（现有逻辑搬迁）
│   ├── PromptComposer.ts                        ← 新增：prompt 片段组合
│   ├── PromptLoader.ts                          ← 新增：prompt 文件加载
│   ├── PromptRegistry.ts                        ← 新增：prompt 注册索引
│   └── types.ts                                 ← 内部类型（ComposeContext、PromptPart 等）
│
├── mode/
│   ├── types.ts                                 ← AiModeDefinition 新增 promptFileId
│   ├── ai-mode-registry.ts                      ← buildSystemPromptPrefix 委托 PromptComposer
│   └── builtin-modes/*.ts                       ← 删除内嵌 prompt 字符串，改为 promptFileId 引用
│
└── ipc/handlers/
    └── prompt-library.ts                        ← 新增：prompt-library:* IPC 通道

sibylla-desktop/src/shared/types.ts              ← 扩展 ContextLayerType、AssembledContext、新增类型

数据流：

PromptComposer.compose(context)
│
├─ 1. PromptLoader.load('core.identity')         ← 用户覆盖优先，回落内置
├─ 2. PromptLoader.load('core.principles')       ← 不可移除，强制合并 <immutable>
├─ 3. PromptLoader.load('core.tone')
├─ 4. PromptLoader.load('modes.{mode}')          ← 按当前模式加载
├─ 5. for tool in tools: loadSafe('tools.{tool}')← 按启用工具加载
├─ 6. render('contexts.workspace-context', data) ← 动态模板渲染
├─ 7. render('contexts.user-profile', data)
├─ 8. render('contexts.time-context', { now })
├─ 9. detectConflicts(parts) → warnings
├─ 10. checkBudget(parts, maxTokens) → warnings
│
└─ 返回 ComposedPrompt { text, parts, estimatedTokens, version, warnings }

ContextEngine.assembleForHarness(request)
│
├─ PromptComposer 可用？
│   ├─ 是 → PromptComposer.compose(context) → 替代 SYSTEM_PROMPT_BASE + modePrefix 拼装
│   └─ 否 → 走原有逻辑（SYSTEM_PROMPT_BASE + aiMode.systemPromptPrefix）
│
├─ 收集 memory/skill/manual 层（现有逻辑不变）
├─ 合并为 AssembledContext（新增 promptParts 字段）
│
└─ 返回 AssembledContext
```

### 步骤 1：定义 Prompt 共享类型

**文件：** `src/shared/types.ts`（扩展）

1. 扩展 `ContextLayerType` 联合类型：
   ```typescript
   export type ContextLayerType =
     | 'always' | 'manual' | 'skill' | 'memory'    // 已有
     | 'mode' | 'tool' | 'agent' | 'hook' | 'context'  // 新增
   ```

2. 在 `AssembledContext` 接口新增可选字段：
   ```typescript
   export interface AssembledContext {
     // ... 现有字段不变 ...
     /** Prompt composition parts for traceability (TASK035) */
     promptParts?: PromptPart[]
   }
   ```

3. 新增 Prompt 相关类型：
   ```typescript
   export interface PromptMetadata {
     id: string
     version: string
     scope: 'core' | 'mode' | 'tool' | 'agent' | 'hook' | 'context' | 'optimizer'
     source: 'builtin' | 'user-override'
     modelHint?: string
     estimatedTokens?: number
     lastEvaluated?: string
     performanceScore?: number
     tags: string[]
     requires?: string[]
     conflicts?: string[]
     builtinPath: string
     userOverridePath?: string
   }

   export interface PromptContent {
     metadata: PromptMetadata
     body: string
     rawFrontmatter: string
   }

   export interface PromptPart {
     id: string
     source: 'builtin' | 'user-override'
     path: string
     version: string
     tokens: number
     renderedAt: number
   }
   ```

4. 新增 IPC 通道常量（在现有 `IPC_CHANNELS` 对象中追加）：
   ```typescript
   // 在 IPC_CHANNELS 对象中追加
   'prompt-library:list-all': 'prompt-library:list-all',
   'prompt-library:read': 'prompt-library:read',
   'prompt-library:derive-user-copy': 'prompt-library:derive-user-copy',
   'prompt-library:reset-user-override': 'prompt-library:reset-user-override',
   'prompt-library:validate': 'prompt-library:validate',
   'prompt-library:estimate-tokens': 'prompt-library:estimate-tokens',
   ```

5. 新增 PromptLibraryIPC 接口：
   ```typescript
   export interface PromptLibraryIPC {
     'prompt-library:list-all': () => Promise<PromptMetadata[]>
     'prompt-library:read': (id: string) => Promise<PromptContent>
     'prompt-library:derive-user-copy': (id: string) => Promise<{ userPath: string }>
     'prompt-library:reset-user-override': (id: string) => Promise<void>
     'prompt-library:validate': (id: string, content: string) => Promise<PromptValidationResult>
     'prompt-library:estimate-tokens': (content: string) => Promise<number>
   }

   export interface PromptValidationResult {
     valid: boolean
     errors: string[]
     warnings: string[]
   }
   ```

**验证：** TypeScript 编译通过，现有代码的类型收窄不受影响。

### 步骤 2：拆分 ContextEngine 为目录结构

**目标：** 将 `context-engine.ts`（683 行）拆分为 `context-engine/` 目录，保持对外接口不变。

1. 创建目录 `src/main/services/context-engine/`

2. 创建 `context-engine/index.ts` — 重导出入口：
   ```typescript
   export { ContextEngine } from './context-engine'
   export type {
     ContextAssemblyRequest,
     HarnessContextRequest,
   } from './context-engine'
   ```

3. 将现有 `context-engine.ts` 移动为 `context-engine/context-engine.ts`：
   - 调整内部相对导入路径（如 `../../shared/types` → `../../../shared/types`）
   - 将内部辅助函数（`estimateTokens`、`buildSystemPrompt`、`allocateBudget`、`truncateToBudget` 等）保留在原位
   - 在类中新增 `private promptComposer?: PromptComposer` 属性

4. 新增 `setPromptComposer(composer: PromptComposer): void` 方法

5. 更新所有引用 `context-engine` 的导入路径：
   - 由于 `context-engine/index.ts` 重导出了 `ContextEngine`，**大部分导入无需修改**（Node.js 解析目录时自动找 index.ts）
   - 少数直接引用 `context-engine.ts` 的测试文件需调整

**关键约束：**
- 不改变 ContextEngine 的公共 API
- 不改变 assembleContext / assembleForHarness 的签名
- 现有导入 `from '../context-engine'` 或 `from '../../services/context-engine'` 仍然有效

**验证：** 全量 TypeScript 编译 + 现有测试通过（行为无变化）

### 步骤 3：创建内置 Prompt 资源文件

**目录：** `sibylla-desktop/resources/prompts/`

1. 创建 `index.yaml`：
   ```yaml
   version: 1
   prompts:
     - id: core.identity
       scope: core
       file: core/identity.md
     - id: core.principles
       scope: core
       file: core/principles.md
     - id: core.tone
       scope: core
       file: core/tone.md
     - id: modes.free
       scope: mode
       file: modes/free.md
     - id: modes.plan
       scope: mode
       file: modes/plan.md
     - id: modes.analyze
       scope: mode
       file: modes/analyze.md
     - id: modes.review
       scope: mode
       file: modes/review.md
     - id: modes.write
       scope: mode
       file: modes/write.md
     - id: tools.read-file
       scope: tool
       file: tools/read-file.md
     - id: tools.write-file
       scope: tool
       file: tools/write-file.md
     - id: tools.edit-file
       scope: tool
       file: tools/edit-file.md
     - id: tools.search
       scope: tool
       file: tools/search.md
     - id: tools.list-files
       scope: tool
       file: tools/list-files.md
     - id: contexts.workspace-context
       scope: context
       file: contexts/workspace-context.md
     - id: contexts.user-profile
       scope: context
       file: contexts/user-profile.md
     - id: contexts.time-context
       scope: context
       file: contexts/time-context.md
   ```

2. 创建 `core/identity.md` — 从 `SYSTEM_PROMPT_BASE` 迁移：
   ```markdown
   ---
   id: core.identity
   version: 1.0.0
   scope: core
   estimated_tokens: 45
   tags: [identity, core]
   ---

   你是 Sibylla 团队协作助手。回答要直接、可执行、中文优先。
   请在必要时引用上下文，不要伪造不存在的文件。
   ```

3. 创建 `core/principles.md`：
   ```markdown
   ---
   id: core.principles
   version: 1.0.0
   scope: core
   estimated_tokens: 320
   tags: [principles, core]
   ---

   # 不可妥协原则

   <immutable>
   1. **文件即真相**：所有用户内容以 Markdown/CSV 明文存储。
   2. **AI 建议，人类决策**：AI 不得自动执行不可逆操作。
   3. **个人空间隔离**：个人空间内容不进入其他成员上下文。
   </immutable>

   ## 工作准则
   - 优先使用上下文中已有的信息，不猜测
   - 对不确定的内容明确标注"待确认"
   - 代码修改必须展示 diff 预览
   ```

4. 创建 `core/tone.md`：
   ```markdown
   ---
   id: core.tone
   version: 1.0.0
   scope: core
   estimated_tokens: 80
   tags: [tone, core]
   ---

   ## 语气风格
   - 中文优先，技术术语保留英文
   - 直接回答，不寒暄
   - 不确定的回答明确标注置信度
   - 禁止使用 emoji（除非用户要求）
   ```

5. 创建 5 个 mode prompt 文件 — 从 `builtin-modes/*.ts` 迁移：
   - `modes/plan.md`：内容来自 `PLAN_MODE_PROMPT`（`builtin-modes/plan.ts`）
   - `modes/free.md`：空或最少约束
   - `modes/analyze.md`、`modes/review.md`、`modes/write.md`：从对应 TS 文件提取

   每个 mode prompt 文件格式：
   ```markdown
   ---
   id: modes.plan
   version: 1.0.0
   scope: mode
   model_hint: claude-sonnet-4-20250514
   estimated_tokens: 480
   tags: [planning, structured]
   ---

   （从 builtin-modes/plan.ts 的 PLAN_MODE_PROMPT 值迁移）
   ```

6. 创建 5 个工具 prompt 文件 — 简洁的工具使用指南：
   - 每个文件描述工具的使用场景、参数、最佳实践
   - 预估 tokens 各约 100-200

7. 创建 3 个 context 模板文件 — 含 Mustache 变量：
   - `contexts/workspace-context.md`：
     ```markdown
     ---
     id: contexts.workspace-context
     version: 1.0.0
     scope: context
     estimated_tokens: 120
     ---

     ## 当前工作区
     - 名称：{{workspace.name}}
     - 根路径：{{workspace.rootPath}}
     - 文件数：{{workspace.fileCount}}
     ```
   - `contexts/user-profile.md`：用户偏好模板
   - `contexts/time-context.md`：时间上下文模板

**验证：** 所有 `.md` 文件 frontmatter 格式正确，`index.yaml` 可解析

### 步骤 4：实现 PromptLoader

**文件：** `src/main/services/context-engine/PromptLoader.ts`

PromptLoader 负责从磁盘加载单个 prompt 文件，解析 frontmatter，渲染模板。

1. 定义 PromptLoader 内部接口：
   ```typescript
   interface RawPromptFile {
     frontmatter: {
       id: string
       version: string
       scope: string
       model_hint?: string
       estimated_tokens?: number
       last_evaluated?: string
       performance_score?: number
       tags?: string[]
       requires?: string[]
       conflicts?: string[]
     }
     body: string
   }

   interface LoadResult {
     id: string
     version: string
     scope: string
     body: string
     source: 'builtin' | 'user-override'
     path: string
     tokens: number
     rawFrontmatter: Record<string, unknown>
   }
   ```

2. 构造函数接收配置：
   ```typescript
   constructor(
     private readonly builtinRoot: string,     // resources/prompts/
     private readonly userOverrideRoot: string | null,  // {workspace}/.sibylla/prompts-local/ 或 null
     private readonly tokenEstimator: (text: string) => number,
   ) {}
   ```

3. 实现 `load(id: string): Promise<LoadResult>`：
   - 将 prompt id（如 `modes.plan`）转换为文件路径（`modes/plan.md`）
   - 检查用户覆盖路径是否存在
   - 存在则加载用户版本（`source: 'user-override'`），否则加载内置版本
   - 解析 YAML frontmatter + Markdown body（使用 gray-matter 或手动解析）
   - 调用 `tokenEstimator(body)` 估算 tokens
   - frontmatter 格式错误时抛出 `PromptFormatError`（含文件路径 + 行号）

4. 实现 `loadSafe(id: string): Promise<LoadResult | null>`：
   - 包装 `load()`，文件不存在时返回 `null`（用于可选片段如 tools）

5. 实现 `render(id: string, data: Record<string, unknown>): Promise<LoadResult>`：
   - 先 `load(id)` 获取原始内容
   - 对 body 执行 Mustache 风格模板渲染（`{{var}}`、`{{#list}}...{{/list}}`）
   - **不支持** JavaScript 表达式或复杂逻辑
   - 渲染后重新估算 tokens

6. 实现 `resolveUserPath(id: string): string` 和 `resolveBuiltinPath(id: string): string`：
   - id → 路径的映射函数

7. 实现 `exists(id: string): Promise<boolean>`：
   - 检查内置或用户覆盖是否存在

**验证：**
- 加载内置 prompt 成功
- 用户覆盖优先级正确
- frontmatter 错误抛出明确异常
- 模板渲染 `{{variable}}` 正确替换
- 不存在的 id 返回 null（loadSafe）

### 步骤 5：实现 PromptRegistry

**文件：** `src/main/services/context-engine/PromptRegistry.ts`

PromptRegistry 管理 prompt 索引，提供按 id / scope 查询。

1. 内部数据结构：
   ```typescript
   private prompts = new Map<string, PromptMetadata>()
   private userOverrides = new Set<string>()  // 记录哪些 id 有用户覆盖
   ```

2. 构造函数：
   ```typescript
   constructor(
     private readonly loader: PromptLoader,
   ) {}
   ```

3. 实现 `async initialize(): Promise<void>`：
   - 读取 `resources/prompts/index.yaml` 获取所有内置 prompt 列表
   - 对每个内置 prompt，调用 `loader.load(id)` 获取元数据（不缓存 body）
   - 检查用户覆盖目录（如存在），扫描并标记 `user-override`
   - 验证 `requires` 依赖：如果 prompt A 依赖 prompt B，但 B 不存在，记录 warning
   - 注册到 `prompts` Map

4. 实现 `get(id: string): PromptMetadata | undefined`

5. 实现 `getAll(): PromptMetadata[]`

6. 实现 `getByScope(scope: string): PromptMetadata[]`

7. 实现 `hasUserOverride(id: string): boolean`

8. 实现 `validate(id: string, content: string): PromptValidationResult`：
   - 解析 frontmatter 格式
   - 检查必填字段（id、version、scope）
   - 检查 requires 依赖是否存在
   - 检查 conflicts 列表中是否有已加载的 prompt
   - 估算 tokens 是否合理

**验证：**
- initialize() 正确加载所有内置 prompt
- 用户覆盖正确标记
- requires 依赖缺失时 warning
- getByScope('core') 返回 3 个 prompt

### 步骤 6：实现 PromptComposer

**文件：** `src/main/services/context-engine/PromptComposer.ts`

PromptComposer 是本任务的核心，负责将多个 prompt 片段组合为最终的 system prompt。

1. 定义 ComposeContext 接口（在 `types.ts` 内部）：
   ```typescript
   export interface ComposeContext {
     mode: string                              // 当前 AiModeId
     tools: Array<{ id: string }>              // 启用的工具列表
     currentAgent?: string                     // 当前 Sub-agent id（如在子循环中）
     userPreferences: Record<string, unknown>
     workspaceInfo: {
       name: string
       rootPath: string
       fileCount: number
       recentChanges?: string[]
     }
     maxTokens?: number                        // Token 预算上限
     includeHooks?: string[]                   // 需要注入的 hook prompt id
   }
   ```

2. 定义 ComposedPrompt 接口（对应 spec §4.1.2）：
   ```typescript
   export interface ComposedPrompt {
     text: string
     parts: PromptPart[]
     estimatedTokens: number
     version: string                            // 组合签名，用于缓存
     warnings: string[]
   }
   ```

3. PromptComposer 类：
   ```typescript
   export class PromptComposer {
     private cache = new Map<string, { result: ComposedPrompt; timestamp: number }>()
     private static readonly CACHE_TTL_MS = 5000

     constructor(
       private readonly loader: PromptLoader,
       private readonly registry: PromptRegistry,
       private readonly tokenEstimator: (text: string) => number,
     ) {}
   ```

4. 实现 `async compose(context: ComposeContext): Promise<ComposedPrompt>`：
   - **缓存检查**：基于 context 生成 signature，命中缓存且 < 5s 时直接返回
   - **core 加载**（不可跳过）：
     ```
     parts.push(await this.loadPart('core.identity'))
     parts.push(await this.loadPart('core.principles'))   // 强制合并 <immutable>
     parts.push(await this.loadPart('core.tone'))
     ```
   - **mode 加载**：
     ```
     parts.push(await this.loadPart(`modes.${context.mode}`))
     ```
   - **tools 加载**（按启用工具逐个）：
     ```
     for (const tool of context.tools) {
       const part = await this.loadPartSafe(`tools.${tool.id}`)
       if (part) parts.push(part)
     }
     ```
   - **agent 加载**（如适用）：
     ```
     if (context.currentAgent) {
       parts.push(await this.loadPart(`agents.${context.currentAgent}`))
     }
     ```
   - **hooks 加载**（按需）：
     ```
     for (const hookId of context.includeHooks ?? []) {
       const part = await this.loadPartSafe(`hooks.${hookId}`)
       if (part) parts.push(part)
     }
     ```
   - **contexts 渲染**（动态模板）：
     ```
     parts.push(await this.renderPart('contexts.workspace-context', context.workspaceInfo))
     parts.push(await this.renderPart('contexts.user-profile', context.userPreferences))
     parts.push(await this.renderPart('contexts.time-context', { now: new Date().toISOString() }))
     ```
   - **冲突检测**：`detectConflicts(parts, warnings)`
   - **Token 预算检查**：总 tokens > maxTokens 时追加 warning
   - **拼接**：用 `\n\n---\n\n` 分隔各 part body
   - **缓存写入**：以 signature 为 key
   - **返回** ComposedPrompt

5. 实现 `private async loadPart(id: string): Promise<PromptPart>`：
   - 调用 `this.loader.load(id)`
   - 对于 scope=core 的 prompt，检查用户覆盖是否移除了 `<immutable>` 块
   - 如果移除了，强制从内置版本提取 `<immutable>` 块合并回去（R1 缓解）
   - 返回 PromptPart

6. 实现 `private async loadPartSafe(id: string): Promise<PromptPart | null>`：
   - try-catch 包装，文件不存在返回 null

7. 实现 `private async renderPart(id: string, data: Record<string, unknown>): Promise<PromptPart>`：
   - 调用 `this.loader.render(id, data)`

8. 实现 `private detectConflicts(parts: PromptPart[], warnings: string[]): void`：
   - 收集所有 part 的 frontmatter `conflicts` 列表
   - 交叉检查是否有两个 part 互为 conflict
   - 有则 push warning

9. 实现 `private signature(context: ComposeContext): string`：
   - 基于 mode + tools sorted + agent + hooks sorted 生成稳定字符串
   - 用于缓存 key

10. 实现 `invalidateCache(id?: string): void`：
    - id 为空时清空全部缓存
    - id 有值时移除包含该 id part 的缓存条目

**验证：**
- compose() 返回正确的拼装文本
- core 片段始终存在
- 用户覆盖优先级正确
- conflicts 检测 warning 正确
- maxTokens 超限时 warning
- 缓存命中率正常

### 步骤 7：ContextEngine 集成与 Mode Prompt 迁移

本步骤将 PromptComposer 接入 ContextEngine，完成从硬编码到文件化的迁移。

**文件：** `src/main/services/context-engine/context-engine.ts`

1. 新增 PromptComposer 可选注入：
   ```typescript
   private promptComposer: PromptComposer | null = null

   setPromptComposer(composer: PromptComposer): void {
     this.promptComposer = composer
   }
   ```

2. 修改 `assembleForHarnessInternal()` 中的 system prompt 构建逻辑：

   **现有逻辑**（需保留为 fallback）：
   ```typescript
   // 现有：硬编码 SYSTEM_PROMPT_BASE + aiMode.systemPromptPrefix
   ```

   **新逻辑**：
   ```typescript
   let promptParts: PromptPart[] | undefined

   if (this.promptComposer) {
     const composed = await this.promptComposer.compose({
       mode: request.aiMode?.id ?? 'free',
       tools: assembledContext.toolDefinitions?.map(t => ({ id: t.id })) ?? [],
       userPreferences: {},   // 从 workspace config 注入
       workspaceInfo: {
         name: /* workspace name */,
         rootPath: this.fileManager.getWorkspaceRoot(),
         fileCount: /* 计算 */,
       },
       maxTokens: totalBudget,
       includeHooks: [],  // TASK036 扩展
     })
     promptParts = composed.parts

     // 用 composed.text 替代 SYSTEM_PROMPT_BASE + modePrefix + constraints
     base = {
       ...base,
       systemPrompt: composed.text + '\n\n' + /* memory/skill/manual 层 */,
       totalTokens: /* recalculate */,
     }
   } else {
     // fallback: 走原有硬编码逻辑
   }

   // 最终写入 promptParts
   return { ...base, promptParts }
   ```

3. 移除 `SYSTEM_PROMPT_BASE` 常量的直接使用（在 PromptComposer 可用时）：
   - 保留常量定义（用于 fallback），但标记 `@deprecated`

**文件：** `src/main/services/mode/types.ts`

4. AiModeDefinition 新增 `promptFileId` 可选字段：
   ```typescript
   export interface AiModeDefinition {
     // ... 现有字段不变 ...
     /** Prompt file ID for loading from PromptComposer (TASK035) */
     promptFileId?: string   // 如 'modes.plan'
   }
   ```

**文件：** `src/main/services/mode/builtin-modes/plan.ts`（以及其他 4 个 mode）

5. 为每个内置 mode 添加 `promptFileId`：
   ```typescript
   export const PLAN_MODE: AiModeDefinition = {
     id: 'plan',
     // ... 现有字段 ...
     promptFileId: 'modes.plan',   // 新增
     systemPromptPrefix: PLAN_MODE_PROMPT,  // 保留为 fallback
   }
   ```

**文件：** `src/main/services/mode/ai-mode-registry.ts`

6. 修改 `buildSystemPromptPrefix()` 方法：
   ```typescript
   buildSystemPromptPrefix(modeId: AiModeId, variables?: Record<string, string>): string {
     const mode = this.get(modeId)
     if (!mode) return ''

     // 优先从 PromptComposer 加载
     if (mode.promptFileId && this.promptComposer) {
       // 注意：buildSystemPromptPrefix 是同步方法
       // 如果 PromptComposer.compose 是异步的，需要提供同步版本或缓存机制
       // 策略：在 mode 切换时预加载 prompt，此处从缓存读取
       const cached = this.promptComposer.getCachedPart(mode.promptFileId)
       if (cached) {
         return this.renderTemplate(cached.body, variables ?? {})
       }
     }

     // Fallback: 使用内嵌的 systemPromptPrefix
     return this.renderTemplate(mode.systemPromptPrefix, variables ?? {})
   }
   ```

7. AiModeRegistry 新增 PromptComposer 注入：
   ```typescript
   private promptComposer: PromptComposer | null = null

   setPromptComposer(composer: PromptComposer): void {
     this.promptComposer = composer
   }
   ```

**验证：**
- PromptComposer 可用时，system prompt 从文件加载
- PromptComposer 不可用时，行为与迁移前完全一致
- mode 切换后 system prompt 正确更新
- 已有测试全部通过

### 步骤 8：实现 IPC 通道

**文件：** `src/main/ipc/handlers/prompt-library.ts`（新建）

1. 注册 `prompt-library:list-all` handler：
   - 调用 `PromptRegistry.getAll()`
   - 返回 `PromptMetadata[]`

2. 注册 `prompt-library:read` handler：
   - 参数：`id: string`
   - 调用 `PromptLoader.load(id)` 获取完整内容
   - 返回 `PromptContent`（含 metadata + body + rawFrontmatter）
   - id 不存在时返回空响应（IPC 错误处理）

3. 注册 `prompt-library:derive-user-copy` handler：
   - 参数：`id: string`
   - 从内置路径读取原始 prompt 文件
   - 复制到用户覆盖路径（`{workspace}/.sibylla/prompts-local/{scope}/{name}.md`）
   - 确保目标目录存在（mkdir recursive）
   - 返回 `{ userPath: string }`
   - 用户覆盖已存在时返回提示"已存在覆盖文件"

4. 注册 `prompt-library:reset-user-override` handler：
   - 参数：`id: string`
   - 删除用户覆盖文件
   - 调用 `PromptRegistry` 刷新索引（移除 user-override 标记）
   - 调用 `PromptComposer.invalidateCache(id)` 清除缓存

5. 注册 `prompt-library:validate` handler：
   - 参数：`id: string, content: string`
   - 解析 content 的 frontmatter
   - 校验必填字段、requires 依赖、conflicts
   - 估算 tokens
   - 返回 `PromptValidationResult`

6. 注册 `prompt-library:estimate-tokens` handler：
   - 参数：`content: string`
   - 调用 token 估算器
   - 返回 `number`

**文件：** `src/preload/index.ts`

7. 在 `ElectronAPI` 接口中扩展 `promptLibrary` 命名空间：
   ```typescript
   promptLibrary: {
     listAll: () => Promise<PromptMetadata[]>
     read: (id: string) => Promise<PromptContent>
     deriveUserCopy: (id: string) => Promise<{ userPath: string }>
     resetUserOverride: (id: string) => Promise<void>
     validate: (id: string, content: string) => Promise<PromptValidationResult>
     estimateTokens: (content: string) => Promise<number>
   }
   ```

**文件：** `src/main/ipc/handlers/index.ts`（或注册入口）

8. 注册 prompt-library handler 到 IPC 主循环

**验证：** 通过 Electron DevTools 控制台调用 `window.electronAPI.promptLibrary.listAll()` 返回 prompt 列表

### 步骤 9：主进程装配与初始化

**文件：** 主进程初始化入口（`src/main/index.ts` 或 services 工厂）

1. 在服务初始化阶段创建 PromptLoader：
   ```typescript
   const promptLoader = new PromptLoader(
     path.join(app.getAppPath(), 'resources', 'prompts'),
     workspacePath ? path.join(workspacePath, '.sibylla', 'prompts-local') : null,
     tokenEstimator,
   )
   ```

2. 创建 PromptRegistry 并初始化：
   ```typescript
   const promptRegistry = new PromptRegistry(promptLoader)
   await promptRegistry.initialize()
   ```

3. 创建 PromptComposer：
   ```typescript
   const promptComposer = new PromptComposer(promptLoader, promptRegistry, tokenEstimator)
   ```

4. 注入到 ContextEngine：
   ```typescript
   contextEngine.setPromptComposer(promptComposer)
   ```

5. 注入到 AiModeRegistry：
   ```typescript
   aiModeRegistry.setPromptComposer(promptComposer)
   ```

6. 注册 IPC handler：
   ```typescript
   registerPromptLibraryIPC(promptLoader, promptRegistry, promptComposer)
   ```

**验证：** 应用启动后，AI 对话的 system prompt 从文件加载（可通过 Trace span `prompt.compose` 确认）

### 步骤 10：单元测试

**文件：** `tests/main/services/context-engine/`

1. `prompt-loader.test.ts` 测试用例：
   - 加载内置 prompt 文件，frontmatter 正确解析
   - 用户覆盖文件存在时返回 user-override
   - 用户覆盖文件不存在时返回 builtin
   - frontmatter 格式错误时抛出 PromptFormatError
   - 模板渲染正确替换 `{{variable}}`
   - 模板渲染不支持表达式
   - 不存在的 id 返回 null（loadSafe）
   - contexts 模板渲染注入动态数据

2. `prompt-registry.test.ts` 测试用例：
   - initialize() 正确加载 index.yaml 中所有 prompt
   - getAll() 返回完整列表
   - get(id) 返回指定 prompt
   - getByScope('core') 返回 3 个 prompt
   - 用户覆盖正确标记为 user-override
   - requires 依赖缺失时记录 warning
   - conflicts 检测正确

3. `prompt-composer.test.ts` 测试用例：
   - compose() 返回正确拼装文本，包含 core + mode + contexts
   - core 三个片段始终存在（identity + principles + tone）
   - mode 片段按 context.mode 加载
   - tools 片段按启用工具列表加载，无对应文件时跳过
   - contexts 片段正确渲染动态数据
   - conflicts 检测产生 warning
   - maxTokens 超限时产生 warning
   - 缓存命中：相同 context 100ms 内第二次 compose 直接返回缓存
   - 缓存失效：invalidateCache 后重新加载
   - core 的 `<immutable>` 块被强制保留即使用户覆盖移除

4. `context-engine-integration.test.ts` 测试用例：
   - PromptComposer 注入后 assembleForHarness() 使用文件化 prompt
   - PromptComposer 未注入时 assembleForHarness() 使用硬编码 fallback
   - AssembledContext.promptParts 正确填充
   - 迁移前后 system prompt 内容一致（回归测试）

5. `mode-prompt-migration.test.ts` 测试用例：
   - 5 个内置 mode 的 promptFileId 指向正确文件
   - PromptComposer 加载 mode prompt 内容与原 systemPromptPrefix 一致
   - promptFileId 对应文件不存在时 fallback 到 systemPromptPrefix

**覆盖率目标：** ≥ 80%（P0 要求）

## 现有代码基础

| 已有模块 | 文件路径 | 行数 | 本任务使用方式 |
|---------|---------|------|-------------|
| ContextEngine | `context-engine.ts` | 683 | 拆分为目录结构，新增 PromptComposer 子模块 |
| AiModeRegistry | `mode/ai-mode-registry.ts` | ~200 | 新增 PromptComposer 注入，buildSystemPromptPrefix 委托 |
| AiModeDefinition | `mode/types.ts` | 57 | 新增 `promptFileId` 可选字段 |
| builtin-modes/*.ts | `mode/builtin-modes/`（5 文件） | 各 ~46 行 | 保留现有字段，新增 `promptFileId` 引用 |
| AssembledContext | `shared/types.ts:1393` | — | 新增 `promptParts` 可选字段 |
| ContextLayerType | `shared/types.ts:1378` | — | 扩展联合类型（5 个新值） |
| Tracer | `trace/tracer.ts` | — | PromptComposer 可选注入 |
| estimateTokens() | `context-engine.ts` 内部 | — | 提取为共享工具函数 |
| FileManager | `file-manager.ts` | — | PromptLoader 通过其获取 workspace root |

**完全缺失、需新建的模块：**

| 模块 | 说明 |
|------|------|
| `resources/prompts/` | 内置 prompt 资源目录（~16 个 .md 文件 + index.yaml） |
| `context-engine/PromptLoader.ts` | Prompt 文件加载器 |
| `context-engine/PromptRegistry.ts` | Prompt 注册索引 |
| `context-engine/PromptComposer.ts` | Prompt 片段组合器 |
| `context-engine/types.ts` | 内部类型定义 |
| `context-engine/index.ts` | 目录入口（重导出） |
| `ipc/handlers/prompt-library.ts` | Prompt 库 IPC 通道 |

## 新增 IPC 通道

| IPC 通道 | 方向 | 说明 |
|---------|------|------|
| `prompt-library:list-all` | Renderer → Main | 列出所有 prompt 元数据 |
| `prompt-library:read` | Renderer → Main | 读取指定 prompt 完整内容 |
| `prompt-library:derive-user-copy` | Renderer → Main | 从内置派生用户覆盖副本 |
| `prompt-library:reset-user-override` | Renderer → Main | 删除用户覆盖文件 |
| `prompt-library:validate` | Renderer → Main | 校验 prompt 格式/依赖/冲突 |
| `prompt-library:estimate-tokens` | Renderer → Main | 估算 prompt 内容 token 数 |

## 涉及的现有文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `context-engine.ts` | 迁移 | 移入 `context-engine/` 目录，新增 PromptComposer 注入点 |
| `shared/types.ts` | 扩展 | ContextLayerType 扩展、AssembledContext 新增字段、新增类型 |
| `mode/types.ts` | 扩展 | AiModeDefinition 新增 `promptFileId` |
| `mode/ai-mode-registry.ts` | 扩展 | 新增 PromptComposer 注入，buildSystemPromptPrefix 委托 |
| `mode/builtin-modes/*.ts` | 扩展 | 每个 mode 新增 `promptFileId` 字段 |
| `preload/index.ts` | 扩展 | 新增 promptLibrary 命名空间 |
| IPC 注册入口 | 扩展 | 注册 prompt-library handler |
