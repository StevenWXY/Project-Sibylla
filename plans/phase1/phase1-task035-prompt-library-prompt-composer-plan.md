# PHASE1-TASK035: Prompt 库基础设施与 PromptComposer — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task035_prompt-library-prompt-composer.md](../specs/tasks/phase1/phase1-task035_prompt-library-prompt-composer.md)
> 创建日期：2026-04-23
> 最后更新：2026-04-23

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK035 |
| **任务标题** | Prompt 库基础设施与 PromptComposer |
| **所属阶段** | Phase 1 - AI 能力扩展体系 (Sprint 3.5) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | TASK012 + TASK022 + TASK027 + TASK030 |

### 1.1 目标

建立 Sprint 3.5 的基础设施中枢——Prompt 库与 PromptComposer。将当前散落在代码中的硬编码字符串 prompt 迁移到文件化、分层化、用户可覆盖的 Markdown 文件体系；实现 PromptComposer 作为 ContextEngine 的内部子模块，负责 prompt 片段的加载、渲染、冲突检测与 Token 预算管理。本任务是 Sprint 3.5 全部后续任务（TASK036-039）的地基。

### 1.2 核心设计约束

| 约束 | 来源 | 说明 |
|------|------|------|
| PromptComposer 不是独立顶层模块 | sprint3.5 §17A.1 | 作为 ContextEngine 的内部子模块，通过 `setPromptComposer()` 注入 |
| 文件即真相 | CLAUDE.md §二 | 所有 prompt 以 Markdown + YAML frontmatter 明文存储，Git 版本化 |
| AI 建议/人类决策 | CLAUDE.md §二 | 用户覆盖优先，但 core prompt 的 `<immutable>` 块强制保留 |
| 向后兼容 | sprint3.5 §17A.1 | PromptComposer 未注入时 ContextEngine 行为完全不变 |
| 模板无 JS 表达式 | sprint3.5 §4.1.3 | Mustache 风格插值，不支持 JavaScript 表达式 |
| TS 严格模式禁止 any | CLAUDE.md §四 | 全部代码遵循 TypeScript 严格模式 |
| 主进程与渲染进程严格隔离 | CLAUDE.md §三 | 文件系统访问仅在主进程，渲染进程通过 IPC 调用 |

### 1.3 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| Prompt 资源目录 | `resources/prompts/` | index.yaml + 16 个 .md prompt 文件 |
| PromptLoader | `src/main/services/context-engine/PromptLoader.ts` | prompt 文件加载（双源：内置 + 用户覆盖） |
| PromptRegistry | `src/main/services/context-engine/PromptRegistry.ts` | prompt 注册索引与元数据管理 |
| PromptComposer | `src/main/services/context-engine/PromptComposer.ts` | prompt 片段组合核心 |
| ContextEngine 内部类型 | `src/main/services/context-engine/types.ts` | ComposeContext / ComposedPrompt 等 |
| ContextEngine 目录入口 | `src/main/services/context-engine/index.ts` | 重导出入口 |
| ContextEngine 迁移 | `src/main/services/context-engine/context-engine.ts` | 现有逻辑搬迁 + PromptComposer 注入 |
| IPC Handler | `src/main/ipc/handlers/prompt-library.ts` | prompt-library:* 6 个通道 |
| shared/types.ts 扩展 | `src/shared/types.ts` | ContextLayerType 扩展 + 新增类型 + IPC 通道 |
| Preload API 扩展 | `src/preload/index.ts` | promptLibrary 命名空间 |
| Mode types 扩展 | `src/main/services/mode/types.ts` | AiModeDefinition.promptFileId |
| builtin-modes 扩展 | `src/main/services/mode/builtin-modes/*.ts` | 5 个 mode 新增 promptFileId |
| AiModeRegistry 扩展 | `src/main/services/mode/ai-mode-registry.ts` | PromptComposer 注入 + buildSystemPromptPrefix 委托 |
| 单元测试 | `tests/main/services/context-engine/*.test.ts` | 覆盖率 ≥ 80% |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；文件即真相；AI 建议/人类决策；结构化日志 | 全局约束 |
| `specs/design/architecture.md` | 主进程与渲染进程通过 IPC 通信；ContextEngine 核心差异化组件 | 进程通信架构 |
| `specs/requirements/phase1/sprint3.5-ai_ablities.md` | §4.1 Prompt 库与 PromptComposer 设计；§2.6 PromptComposer 核心作用；附录 A §17A.1/17A.3 | 验收标准 + 架构约束 |
| `specs/tasks/phase1/phase1-task035_prompt-library-prompt-composer.md` | 10 步执行路径、完整验收标准、架构图 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `ai-context-engine` | ContextEngine 拆分策略；PromptComposer 作为子模块的架构设计；Token 预算管理；组合顺序设计 | `context-engine/` 目录结构 + PromptComposer.ts |
| `typescript-strict-mode` | 全模块类型安全；泛型设计；类型守卫（PromptScope/Source） | 所有 `.ts` 文件 |
| `electron-ipc-patterns` | IPC 通道注册；Preload API 扩展；类型安全通道映射 | `ipc/handlers/prompt-library.ts` + `preload/index.ts` |

### 2.3 前置代码依赖

| 模块 | 文件路径 | 复用方式 |
|------|---------|---------|
| ContextEngine | `src/main/services/context-engine.ts` (683 行) | 拆分为 `context-engine/` 目录，现有逻辑搬迁到 `context-engine.ts`，新增 PromptComposer 子模块注入点 |
| AiModeDefinition | `src/main/services/mode/types.ts` (57 行) | 新增 `promptFileId?: string` 可选字段 |
| AiModeRegistry | `src/main/services/mode/ai-mode-registry.ts` (256 行) | `buildSystemPromptPrefix()` 委托 PromptComposer；新增 `setPromptComposer()` |
| BUILTIN_MODES | `src/main/services/mode/builtin-modes/*.ts` (5 文件) | 每个 mode 新增 `promptFileId` 引用；保留 `systemPromptPrefix` 作为 fallback |
| ContextLayerType | `src/shared/types.ts:1378` | 扩展联合类型（+5 新值） |
| AssembledContext | `src/shared/types.ts:1393-1403` | 新增 `promptParts?: PromptPart[]` 可选字段 |
| Tracer | `src/main/services/trace/tracer.ts` (235 行) | `withSpan('prompt.compose', ...)` 包裹 compose 操作 |
| Token estimator | `context-engine.ts:667-672` | CJK-aware 启发式估算，提取为共享工具函数 |
| FileManager | `src/main/services/file-manager.ts` | PromptLoader 通过其获取 workspace root |
| IPC_CHANNELS | `src/shared/types.ts:72-393` | 追加 prompt-library:* 通道常量 |
| Preload API | `src/preload/index.ts` (1659 行) | 追加 promptLibrary 命名空间 |
| AppEventBus | `src/main/services/event-bus.ts` | Trace 埋点事件 |
| Logger | `src/main/utils/logger.ts` | 结构化日志 |

### 2.4 关键接口适配说明

**ContextEngine 拆分策略**：现有 `context-engine.ts`（683 行）需拆分为目录结构。由于 Node.js 解析目录时自动找 `index.ts`，大部分 `from '../context-engine'` 或 `from '../../services/context-engine'` 导入无需修改。少数直接引用 `context-engine.ts` 的测试文件需调整扩展名。

**AiModeRegistry.buildSystemPromptPrefix() 同步/异步问题**：该方法是同步的（line 193），但 PromptComposer.compose() 是异步的。解决方案：在 mode 切换时预加载 prompt 到缓存，`buildSystemPromptPrefix()` 从缓存同步读取；缓存未命中时 fallback 到硬编码。

**Token 估算器复用**：现有 `estimateTokens()` 是 ContextEngine 的 private 方法（line 667-672，CJK-aware 启发式）。需提取为独立工具函数供 PromptLoader/PromptComposer 共享使用。

**YAML frontmatter 解析**：项目无 gray-matter 依赖。本任务实现轻量级 frontmatter 解析器（正则提取 `---` 之间的 YAML + 下方 body），YAML 解析使用项目已有的 `js-yaml` 或 `yaml` 包（需检查 package.json）。若无已有依赖，则使用简单的行解析（frontmatter 字段均为标量/数组，无需复杂 YAML 特性）。

### 2.5 新增 IPC 通道清单

| 通道常量 | 通道名 | 方向 | 用途 |
|---------|--------|------|------|
| `PROMPT_LIBRARY_LIST_ALL` | `prompt-library:list-all` | Renderer→Main | 列出所有 prompt 元数据 |
| `PROMPT_LIBRARY_READ` | `prompt-library:read` | Renderer→Main | 读取指定 prompt 完整内容 |
| `PROMPT_LIBRARY_DERIVE_USER_COPY` | `prompt-library:derive-user-copy` | Renderer→Main | 从内置派生用户覆盖副本 |
| `PROMPT_LIBRARY_RESET_USER_OVERRIDE` | `prompt-library:reset-user-override` | Renderer→Main | 删除用户覆盖文件 |
| `PROMPT_LIBRARY_VALIDATE` | `prompt-library:validate` | Renderer→Main | 校验 prompt 格式/依赖/冲突 |
| `PROMPT_LIBRARY_ESTIMATE_TOKENS` | `prompt-library:estimate-tokens` | Renderer→Main | 估算 prompt 内容 token 数 |

---

## 三、现有代码盘点与差距分析

### 3.1 主进程模块现状

| 模块 | 文件 | 行数 | TASK035 改造 |
|------|------|------|-------------|
| ContextEngine | `services/context-engine.ts` | 683 | **迁移**：移入 `context-engine/` 目录，新增 PromptComposer 注入点 |
| AiModeDefinition | `services/mode/types.ts` | 57 | **扩展**：新增 `promptFileId?: string` 字段 |
| AiModeRegistry | `services/mode/ai-mode-registry.ts` | 256 | **扩展**：新增 `setPromptComposer()` + `buildSystemPromptPrefix()` 委托 |
| builtin-modes/free.ts | `services/mode/builtin-modes/free.ts` | 2 | **扩展**：新增 `promptFileId: 'modes.free'` |
| builtin-modes/plan.ts | `services/mode/builtin-modes/plan.ts` | 46 | **扩展**：新增 `promptFileId: 'modes.plan'` |
| builtin-modes/analyze.ts | `services/mode/builtin-modes/analyze.ts` | 48 | **扩展**：新增 `promptFileId: 'modes.analyze'` |
| builtin-modes/review.ts | `services/mode/builtin-modes/review.ts` | 34 | **扩展**：新增 `promptFileId: 'modes.review'` |
| builtin-modes/write.ts | `services/mode/builtin-modes/write.ts` | 27 | **扩展**：新增 `promptFileId: 'modes.write'` |
| ContextLayerType | `shared/types.ts:1378` | — | **扩展**：联合类型 +5 值 |
| AssembledContext | `shared/types.ts:1393-1403` | — | **扩展**：新增 `promptParts?` 字段 |
| IPC_CHANNELS | `shared/types.ts:72-393` | — | **追加**：6 个 prompt-library 通道 |
| Preload API | `preload/index.ts` | 1659 | **追加**：promptLibrary 命名空间 |
| 主进程 index.ts | `main/index.ts` | 889 | **扩展**：PromptLoader/Registry/Composer 创建与注入 |

### 3.2 完全缺失、需新建的模块

| 模块 | 文件路径 | 说明 |
|------|---------|------|
| Prompt 资源目录 | `resources/prompts/` | index.yaml + core/3 + modes/5 + tools/5 + contexts/3 = 17 文件 |
| context-engine 目录入口 | `services/context-engine/index.ts` | 重导出 ContextEngine |
| context-engine 主文件 | `services/context-engine/context-engine.ts` | 现有逻辑搬迁 |
| PromptLoader | `services/context-engine/PromptLoader.ts` | prompt 文件加载器 |
| PromptRegistry | `services/context-engine/PromptRegistry.ts` | prompt 注册索引 |
| PromptComposer | `services/context-engine/PromptComposer.ts` | prompt 片段组合核心 |
| 内部类型 | `services/context-engine/types.ts` | ComposeContext / ComposedPrompt 等 |
| IPC Handler | `ipc/handlers/prompt-library.ts` | 6 个 prompt-library handler |

### 3.3 现有硬编码 Prompt 分布

| 来源 | 当前位置 | 内容摘要 | 迁移目标 |
|------|---------|---------|---------|
| 基础身份 prompt | `context-engine.ts:54-56` (推测) | "你是 Sibylla 团队协作助手..." | `resources/prompts/core/identity.md` |
| Free 模式 prompt | `builtin-modes/free.ts:1-2` | "你是 Sibylla 的 AI 助手。自由对话模式..." | `resources/prompts/modes/free.md` |
| Plan 模式 prompt | `builtin-modes/plan.ts:1-46` | 结构化计划模板（目标/步骤/风险/标准） | `resources/prompts/modes/plan.md` |
| Analyze 模式 prompt | `builtin-modes/analyze.ts:1-48` | 多维分析框架（对比/SWOT/利益相关者） | `resources/prompts/modes/analyze.md` |
| Review 模式 prompt | `builtin-modes/review.ts:1-34` | 严重度审查（🔴🟠🟡⚪） | `resources/prompts/modes/review.md` |
| Write 模式 prompt | `builtin-modes/write.ts:1-27` | 直接内容生产 | `resources/prompts/modes/write.md` |
| Evaluator prompt | `harness/evaluator.ts` | 评估 prompt | 暂不迁移（TASK036 范围） |
| Guide prompt | `harness/guides/` | 各 Guide 的 content | 暂不迁移（TASK036 范围） |
| 工具描述 | `harness/built-in-tools.ts` | 工具内嵌描述 | 暂不迁移（TASK036 范围） |

### 3.4 关键接口衔接点

**PromptLoader → FileManager**：
- `fileManager.readFile(relativePath)` 读取 prompt 文件内容
- `fileManager.exists(relativePath)` 检查用户覆盖文件是否存在
- 内置路径：`app.getAppPath() + 'resources/prompts/'`
- 用户覆盖路径：`workspaceRoot + '.sibylla/prompts-local/'`

**PromptComposer → Tracer**：
- `tracer.withSpan('prompt.compose', fn, { kind: 'internal' })` 包裹 compose 操作
- span attributes: 每个 part 的 id / source / version / tokens
- `ComposedPrompt.version` 记录到 span 便于追溯

**ContextEngine → PromptComposer**：
- `contextEngine.setPromptComposer(composer)` 注入
- `assembleForHarnessInternal()` 中：PromptComposer 可用时委托 compose；不可用时走硬编码 fallback
- 输出 `AssembledContext.promptParts` 记录溯源信息

**AiModeRegistry → PromptComposer**：
- `aiModeRegistry.setPromptComposer(composer)` 注入
- `buildSystemPromptPrefix()` 优先从 PromptComposer 缓存读取；缓存未命中 fallback 到 `systemPromptPrefix`

**主进程 index.ts → 全部子模块**：
- 在 `onWorkspaceOpened` 中创建 PromptLoader → PromptRegistry → PromptComposer 链路
- 注入到 ContextEngine 和 AiModeRegistry
- 注册 prompt-library IPC handler

---

## 四、分步实施计划

### 阶段 A：共享类型扩展 + Token 估算提取（Step 1） — 预计 0.5 天

#### A1：扩展 ContextLayerType 联合类型

**文件：** `sibylla-desktop/src/shared/types.ts`（扩展，line 1378）

- `ContextLayerType` 扩展为 `'always' | 'manual' | 'skill' | 'memory' | 'mode' | 'tool' | 'agent' | 'hook' | 'context'`（纯增量，不影响现有类型收窄）
- `AssembledContext` 新增 `promptParts?: PromptPart[]`
- 新增类型：`PromptScope`, `PromptSource`, `PromptMetadata`, `PromptContent`, `PromptPart`, `PromptValidationResult`
- IPC_CHANNELS 追加 6 个 `PROMPT_LIBRARY_*` 通道 + `IPCChannelMap` 类型映射

#### A2：提取 Token 估算工具函数

**文件：** `sibylla-desktop/src/main/services/context-engine/token-utils.ts`（新建）

从 `context-engine.ts:667-672` 提取 CJK-aware `estimateTokens()` 为独立工具函数，原方法改为调用此函数。

**验证：** TypeScript 编译通过，现有测试不受影响。

---

### 阶段 B：创建内置 Prompt 资源文件（Step 3） — 预计 0.5 天

#### B1：创建 Prompt 资源目录结构

**目录：** `sibylla-desktop/resources/prompts/`

```
resources/prompts/
├── index.yaml
├── core/
│   ├── identity.md
│   ├── principles.md
│   └── tone.md
├── modes/
│   ├── free.md
│   ├── plan.md
│   ├── analyze.md
│   ├── review.md
│   └── write.md
├── tools/
│   ├── read-file.md
│   ├── write-file.md
│   ├── edit-file.md
│   ├── search.md
│   └── list-files.md
└── contexts/
    ├── workspace-context.md
    ├── user-profile.md
    └── time-context.md
```

#### B2：创建 index.yaml

**文件：** `resources/prompts/index.yaml`（新建）

包含所有 16 个内置 prompt 的 id / scope / file 映射。格式见任务描述 Step 3。

#### B3：创建 core/ 目录（3 个文件）

**`core/identity.md`**：从 `context-engine.ts` 中的 SYSTEM_PROMPT_BASE 迁移。内容为 Sibylla AI 身份描述。

Frontmatter 必填字段：`id: core.identity`, `version: 1.0.0`, `scope: core`, `estimated_tokens: ~45`

**`core/principles.md`**：Sibylla 五大设计哲学。包含 `<immutable>` 标记的不可妥协原则（文件即真相 / AI 建议人类决策 / 个人空间隔离），以及工作准则。

**`core/tone.md`**：基础语气约束。中文优先、不寒暄、不用 emoji。

#### B4：创建 modes/ 目录（5 个文件）

每个 mode prompt 文件的 body 从对应 `builtin-modes/*.ts` 的 `*_MODE_PROMPT` 常量迁移。

| 文件 | 来源 | 预估 tokens |
|------|------|------------|
| `modes/free.md` | `DEFAULT_SYSTEM_PROMPT` (free.ts) | ~30 |
| `modes/plan.md` | `PLAN_MODE_PROMPT` (plan.ts) | ~480 |
| `modes/analyze.md` | `ANALYZE_MODE_PROMPT` (analyze.ts) | ~500 |
| `modes/review.md` | `REVIEW_MODE_PROMPT` (review.ts) | ~400 |
| `modes/write.md` | `WRITE_MODE_PROMPT` (write.ts) | ~350 |

Frontmatter 示例（plan.md）：
```yaml
id: modes.plan
version: 1.0.0
scope: mode
model_hint: claude-sonnet-4-20250514
estimated_tokens: 480
tags: [planning, structured]
```

#### B5：创建 tools/ 目录（5 个文件）

简洁的工具使用指南，每个 ~100-200 tokens：
- `read-file.md` — 文件读取使用场景、最佳实践
- `write-file.md` — 文件写入注意事项（原子写入、确认机制）
- `edit-file.md` — 编辑操作规范
- `search.md` — 搜索工具使用指南
- `list-files.md` — 文件列表操作

#### B6：创建 contexts/ 目录（3 个模板文件）

含 Mustache 变量的动态模板：

**`contexts/workspace-context.md`**：
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

**`contexts/user-profile.md`**：用户偏好模板（语言、风格、常用操作）。
**`contexts/time-context.md`**：时间上下文模板（当前时间、时区、工作日）。

**验证：** 所有 `.md` 文件 frontmatter 格式正确，`index.yaml` 可被解析。

---

### 阶段 C：拆分 ContextEngine 为目录结构（Step 2） — 预计 0.5 天

#### C1：创建 context-engine 目录

**目录：** `sibylla-desktop/src/main/services/context-engine/`

#### C2：创建 index.ts — 重导出入口

`export { ContextEngine } from './context-engine'` + 重导出 `ContextAssemblyRequest` / `HarnessContextRequest`。

#### C3：迁移现有 context-engine.ts

**操作：** 将 `src/main/services/context-engine.ts` 移动为 `src/main/services/context-engine/context-engine.ts`

需要调整的内部相对导入路径：
- `../../shared/types` → `../../../shared/types`
- `./file-manager` → `../file-manager`
- `./memory-manager` → `../memory-manager`
- `./skill-engine` → `../skill-engine`
- `../utils/logger` → `../../utils/logger`
- `./trace/tracer` → `../trace/tracer`
- `./plan/plan-manager` → `../plan/plan-manager`
- `./plan/types` → `../plan/types`
- `./handbook/handbook-service` → `../handbook/handbook-service`
- `./mode/types` → `../mode/types`
- `./mode/ai-mode-registry` → `../mode/ai-mode-registry`

#### C4：新增 PromptComposer 可选注入

新增 `private promptComposer: PromptComposer | null = null` + `setPromptComposer(composer)` 方法。

#### C5：更新引用路径

所有导入 `from '../context-engine'` 或 `from '../../services/context-engine'` 的文件无需修改（Node.js 解析目录时自动找 index.ts）。需检查直接引用 `context-engine.ts` 扩展名的文件（如测试文件）并调整。

**关键约束：**
- 不改变 ContextEngine 的公共 API
- 不改变 assembleContext / assembleForHarness 的签名
- 现有测试路径需适配新目录结构

**验证：** 全量 TypeScript 编译 + 现有测试通过（行为无变化）。

---

### 阶段 D：实现 PromptLoader + PromptRegistry（Step 4-5） — 预计 1 天

#### D1：定义内部类型

**文件：** `src/main/services/context-engine/types.ts`（新建）

```typescript
export interface RawPromptFile {
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

export interface LoadResult {
  id: string
  version: string
  scope: string
  body: string
  source: 'builtin' | 'user-override'
  path: string
  tokens: number
  rawFrontmatter: Record<string, unknown>
}

export interface ComposeContext {
  mode: string
  tools: Array<{ id: string }>
  currentAgent?: string
  userPreferences: Record<string, unknown>
  workspaceInfo: {
    name: string
    rootPath: string
    fileCount: number
    recentChanges?: string[]
  }
  maxTokens?: number
  includeHooks?: string[]
}

export interface ComposedPrompt {
  text: string
  parts: PromptPart[]
  estimatedTokens: number
  version: string
  warnings: string[]
}
```

#### D2：实现 PromptLoader

**文件：** `src/main/services/context-engine/PromptLoader.ts`（新建）

**构造函数**：
```typescript
constructor(
  private readonly builtinRoot: string,
  private readonly userOverrideRoot: string | null,
  private readonly tokenEstimator: (text: string) => number,
) {}
```

**核心方法**：

| 方法 | 职责 |
|------|------|
| `load(id: string): Promise<LoadResult>` | id→路径映射 → 用户覆盖优先 → 解析 frontmatter → 估算 tokens |
| `loadSafe(id: string): Promise<LoadResult \| null>` | 包装 load()，文件不存在返回 null |
| `render(id: string, data: Record<string, unknown>): Promise<LoadResult>` | load() + Mustache 模板渲染（`{{var}}` + `{{#list}}...{{/list}}`） |
| `resolveUserPath(id: string): string` | `modes.plan` → `{userOverrideRoot}/modes/plan.md` |
| `resolveBuiltinPath(id: string): string` | `modes.plan` → `{builtinRoot}/modes/plan.md` |
| `exists(id: string): Promise<boolean>` | 内置或用户覆盖任一存在 |
| `readAsBuiltin(id: string): Promise<LoadResult>` | 强制读取内置版本（用于 immutable 合并） |

**frontmatter 解析**：
- 正则提取 `---\n` 之间的 YAML + 下方 body
- 必填字段校验：id / version / scope
- 格式错误时抛出 `PromptFormatError`（含文件路径 + 行号 + 错误类型）

**Mustache 模板渲染**：
- 支持 `{{variable}}` 简单插值
- 支持 `{{#list}}...{{/list}}` 条件/循环渲染
- **不支持** JavaScript 表达式或复杂逻辑
- 渲染后重新估算 tokens

#### D3：实现 PromptRegistry

**文件：** `src/main/services/context-engine/PromptRegistry.ts`（新建）

**内部数据结构**：
```typescript
private prompts = new Map<string, PromptMetadata>()
private userOverrides = new Set<string>()
```

**构造函数**：`constructor(private readonly loader: PromptLoader) {}`

**核心方法**：

| 方法 | 职责 |
|------|------|
| `initialize(): Promise<void>` | 读取 index.yaml → 逐个 load → 检查用户覆盖 → 验证 requires 依赖 → 注册 |
| `get(id: string): PromptMetadata \| undefined` | 按 id 查询 |
| `getAll(): PromptMetadata[]` | 返回所有已注册 prompt 元数据 |
| `getByScope(scope: string): PromptMetadata[]` | 按作用域过滤 |
| `hasUserOverride(id: string): boolean` | 检查是否有用户覆盖 |
| `validate(id: string, content: string): PromptValidationResult` | 解析 frontmatter + 检查必填字段 + requires + conflicts + tokens |
| `refreshOverride(id: string): Promise<void>` | 重新加载指定 prompt 的用户覆盖状态 |
| `removeOverride(id: string): void` | 移除用户覆盖标记 |

**initialize() 流程**：
1. `fs.readFileSync(builtinRoot + 'index.yaml')` → 解析获取 prompt 列表
2. 对每个 builtin prompt：`loader.load(id)` → 获取元数据
3. 检查 userOverrideRoot 下是否有对应文件 → 标记 `source: 'user-override'`
4. 验证 `requires` 依赖：A 依赖 B 但 B 不存在 → 记录 warning
5. 注册到 `prompts` Map

**validate() 流程**：
1. 解析 content 的 frontmatter
2. 检查必填字段：id / version / scope
3. 检查 requires 依赖是否存在
4. 检查 conflicts 列表中是否有已加载的 prompt
5. 估算 tokens
6. 返回 `PromptValidationResult`

**验证：**
- initialize() 正确加载所有内置 prompt
- 用户覆盖正确标记
- getByScope('core') 返回 3 个 prompt
- frontmatter 格式错误时返回明确错误

---

### 阶段 E：实现 PromptComposer 核心（Step 6） — 预计 1 天

#### E1：实现 PromptComposer

**文件：** `src/main/services/context-engine/PromptComposer.ts`（新建）

**构造函数**：
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

**核心方法 `compose(context: ComposeContext): Promise<ComposedPrompt>`**：

执行流程（严格按顺序）：1. 缓存检查 → 2. core 加载（不可跳过：identity/principles/tone）→ 3. mode 加载 → 4. tools 加载（逐个，不存在跳过）→ 5. agent 加载（如适用）→ 6. hooks 加载（按需，TASK036 扩展）→ 7. contexts 渲染（动态模板：workspace-context/user-profile/time-context）→ 8. 冲突检测 → 9. Token 预算检查（超限 warning 不阻止）→ 10. 拼接（`\n\n---\n\n` 分隔）→ 11. 缓存写入 → 12. 返回 ComposedPrompt

**私有辅助方法**：

| 方法 | 职责 |
|------|------|
| `loadPart(id: string): Promise<PromptPart>` | loader.load(id) → 对 core scope 强制合并 `<immutable>` → 返回 PromptPart |
| `loadPartSafe(id: string): Promise<PromptPart \| null>` | try-catch 包装，不存在返回 null |
| `renderPart(id: string, data: Record<string, unknown>): Promise<PromptPart>` | loader.render(id, data) → 返回 PromptPart |
| `detectConflicts(parts: PromptPart[], warnings: string[]): void` | 收集 frontmatter conflicts → 交叉检查 → 追加 warning |
| `mergeImmutable(userBody: string, builtinBody: string): string` | 从 builtin 提取 `<immutable>...</immutable>` → 若 user 缺失则合并回去 |
| `signature(context: ComposeContext): string` | mode + tools(sorted) + agent + hooks(sorted) → 稳定字符串 → hash |
| `getCachedPart(promptId: string): PromptPart \| null` | 遍历缓存找包含该 id 的 part（供 AiModeRegistry 同步读取） |
| `invalidateCache(id?: string): void` | 清空全部或移除包含指定 id 的缓存条目 |

**`loadPart()` 的 `<immutable>` 合并逻辑**：
1. `loader.load(id)` 获取用户覆盖或内置内容
2. 若 id scope 为 `core` 且来源为 `user-override`：
   - `loader.readAsBuiltin(id)` 获取内置版本
   - 提取内置版本的 `<immutable>...</immutable>` 块
   - 若用户覆盖中缺失该块，强制追加到 body 开头
3. 返回 PromptPart

**验证：**
- compose() 返回正确拼装文本
- core 三个片段始终存在
- 用户覆盖优先级正确
- conflicts 检测 warning 正确
- maxTokens 超限时 warning（不阻止）
- 缓存命中：相同 context 5s 内第二次 compose 返回缓存
- core 的 `<immutable>` 块被强制保留

---

### 阶段 F：ContextEngine 集成 + Mode Prompt 迁移（Step 7） — 预计 0.5 天

#### F1：修改 ContextEngine.assembleForHarnessInternal()

**文件：** `src/main/services/context-engine/context-engine.ts`（扩展）

在 system prompt 构建逻辑中新增 PromptComposer 分支：PromptComposer 可用时调用 `composer.compose(...)` 替代 SYSTEM_PROMPT_BASE + modePrefix 拼装；不可用时走原有硬编码逻辑。最终返回 `{ ...base, promptParts }`。

**关键约束：**
- `SYSTEM_PROMPT_BASE` 常量保留（用于 fallback），标记 `@deprecated`
- `AssembledContext.promptParts` 为可选字段

#### F2：AiModeDefinition 新增 promptFileId

**文件：** `src/main/services/mode/types.ts`（扩展）

```typescript
export interface AiModeDefinition {
  // ... 现有字段不变 ...
  promptFileId?: string   // 如 'modes.plan'
}
```

#### F3：builtin-modes 新增 promptFileId

**文件：** `src/main/services/mode/builtin-modes/*.ts`（扩展 5 个文件）

每个内置 mode 定义新增 `promptFileId` 字段，保留 `systemPromptPrefix` 作为 fallback：

| 文件 | 新增字段 |
|------|---------|
| `free.ts` | `promptFileId: 'modes.free'` |
| `plan.ts` | `promptFileId: 'modes.plan'` |
| `analyze.ts` | `promptFileId: 'modes.analyze'` |
| `review.ts` | `promptFileId: 'modes.review'` |
| `write.ts` | `promptFileId: 'modes.write'` |

注意：`BUILTIN_MODES` 数组在 `ai-mode-registry.ts:22-96` 中定义，需在每个 mode 对象中追加 `promptFileId`。

#### F4：AiModeRegistry 新增 PromptComposer 注入

新增 `private promptComposer: PromptComposer | null = null` + `setPromptComposer()` 方法。

#### F5：修改 buildSystemPromptPrefix()

**文件：** `src/main/services/mode/ai-mode-registry.ts`（扩展，line 193）

```typescript
buildSystemPromptPrefix(aiModeId, variables?) {
  const mode = this.get(aiModeId)
  if (!mode) return ''
  // 优先从 PromptComposer 缓存同步读取
  if (mode.promptFileId && this.promptComposer) {
    const cached = this.promptComposer.getCachedPart(mode.promptFileId)
    if (cached) return this.renderTemplate(cached.body, variables ?? {})
  }
  // Fallback
  return this.renderTemplate(mode.systemPromptPrefix, variables ?? {})
}
```

**预加载策略**：在 `switchMode()` 时，若 PromptComposer 可用，异步调用 `composer.loadPart(mode.promptFileId)` 预加载到缓存，使后续同步 `buildSystemPromptPrefix()` 可命中缓存。

**验证：**
- PromptComposer 可用时 system prompt 从文件加载
- PromptComposer 不可用时行为与迁移前完全一致
- mode 切换后 system prompt 正确更新
- 已有测试全部通过

---

### 阶段 G：IPC 集成 + Preload API + 主进程装配 + 测试（Step 8-10） — 预计 1.5 天

#### G1：实现 prompt-library IPC Handler

函数式注册 `registerPromptLibraryHandlers(ipcMain, loader, registry, composer, workspaceRoot)`：
- `prompt-library:list-all` → `registry.getAll()`
- `prompt-library:read` → `loader.load(id)` → `PromptContent`
- `prompt-library:derive-user-copy` → 复制内置到用户目录 + `registry.refreshOverride(id)` + `composer.invalidateCache(id)`
- `prompt-library:reset-user-override` → `fs.unlink` + `registry.removeOverride(id)` + `composer.invalidateCache(id)`
- `prompt-library:validate` → `registry.validate(id, content)`
- `prompt-library:estimate-tokens` → `tokenEstimator(content)`

#### G2：扩展 Preload API

ElectronAPI 接口和 api 对象追加 `promptLibrary` 命名空间（listAll / read / deriveUserCopy / resetUserOverride / validate / estimateTokens），ALLOWED_CHANNELS 追加 6 个新通道。

#### G3：主进程生命周期装配

在 `onWorkspaceOpened` 回调中 AiModeRegistry 初始化之后：创建 PromptLoader → PromptRegistry.initialize() → PromptComposer → 注入 ContextEngine + AiModeRegistry → 注册 IPC Handler。

#### G4：单元测试

**文件结构：**
```
tests/main/services/context-engine/
├── prompt-loader.test.ts
├── prompt-registry.test.ts
├── prompt-composer.test.ts
├── context-engine-integration.test.ts
└── mode-prompt-migration.test.ts
```

**prompt-loader.test.ts 关键用例**：

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | load builtin prompt | frontmatter 正确解析 + source='builtin' |
| 2 | load user override | 用户覆盖存在时 source='user-override' |
| 3 | load fallback to builtin | 用户覆盖不存在时回落内置 |
| 4 | frontmatter format error | 抛出 PromptFormatError（含文件路径+行号） |
| 5 | template render variable | `{{workspace.name}}` 正确替换 |
| 6 | template render conditional | `{{#list}}...{{/list}}` 正确渲染 |
| 7 | template no JS expression | 不支持表达式（返回原文或抛错） |
| 8 | loadSafe returns null | 不存在的 id 返回 null |
| 9 | contexts template with data | 动态数据正确注入 |

**prompt-registry.test.ts 关键用例**：

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | initialize loads all | 正确加载 index.yaml 中所有 prompt |
| 2 | getAll returns complete | 返回完整列表 |
| 3 | get by id | 返回指定 prompt |
| 4 | getByScope core | 返回 3 个 prompt |
| 5 | user override marking | 正确标记 user-override |
| 6 | requires dependency missing | 记录 warning |
| 7 | validate correct content | valid=true |
| 8 | validate missing fields | errors 包含必填字段提示 |
| 9 | validate conflicts detection | warnings 包含冲突提示 |

**prompt-composer.test.ts 关键用例**：

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | compose returns correct text | 包含 core + mode + contexts |
| 2 | core parts always present | identity + principles + tone 始终存在 |
| 3 | mode part loaded by context | 按 context.mode 加载对应 mode |
| 4 | tools parts loaded by list | 按启用工具列表加载，无文件时跳过 |
| 5 | contexts rendered with data | 动态数据正确注入 |
| 6 | conflicts detected as warning | conflicts 互指的 prompt 产生 warning |
| 7 | maxTokens exceeded warning | 超限时 warning（不阻止组合） |
| 8 | cache hit within TTL | 相同 context 5s 内第二次 compose 返回缓存 |
| 9 | cache invalidation | invalidateCache 后重新加载 |
| 10 | immutable block preserved | 用户覆盖移除 `<immutable>` 时强制合并回来 |
| 11 | dependency error | requires 未满足时抛 PromptDependencyError |

**context-engine-integration.test.ts 关键用例**：

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | with PromptComposer | assembleForHarness() 使用文件化 prompt |
| 2 | without PromptComposer | assembleForHarness() 使用硬编码 fallback |
| 3 | promptParts populated | AssembledContext.promptParts 正确填充 |
| 4 | regression test | 迁移前后 system prompt 内容一致 |

**mode-prompt-migration.test.ts 关键用例**：

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | mode promptFileId points correct | 5 个内置 mode 的 promptFileId 指向正确 |
| 2 | file content matches original | PromptComposer 加载内容与 systemPromptPrefix 一致 |
| 3 | fallback on missing file | promptFileId 文件不存在时 fallback 到 systemPromptPrefix |

**覆盖率目标：** ≥ 80%

---

## 五、验收标准追踪

### Prompt 文件体系

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | `resources/prompts/index.yaml` 索引文件创建 | B2 | 手动验证 |
| 2 | `core/identity.md` 创建（替代 SYSTEM_PROMPT_BASE） | B3 | G4-4 |
| 3 | `core/principles.md` 创建（含 `<immutable>` 块） | B3 | E1 immutable 合并测试 |
| 4 | `core/tone.md` 创建 | B3 | 手动验证 |
| 5 | 5 个 mode prompt 文件创建（内容从 TS 迁移） | B4 | G4-1/2 |
| 6 | 5 个 tool prompt 文件创建 | B5 | 手动验证 |
| 7 | 3 个 context 模板文件创建（含 Mustache 变量） | B6 | D2 render 测试 |
| 8 | 每个 prompt 文件 frontmatter 含 id/version/scope | B3-B6 | D3 validate 测试 |

### PromptLoader 双源加载

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 解析 Markdown + YAML frontmatter | D2 load() | G4 loader-1 |
| 2 | 内置路径解析 `resources/prompts/{scope}/{id}.md` | D2 resolveBuiltinPath() | G4 loader-1 |
| 3 | 用户覆盖路径解析 `{workspace}/.sibylla/prompts-local/{scope}/{id}.md` | D2 resolveUserPath() | G4 loader-2 |
| 4 | 用户覆盖优先 | D2 load() | G4 loader-2/3 |
| 5 | frontmatter 错误返回明确错误 | D2 load() | G4 loader-4 |
| 6 | Mustache 模板渲染 | D2 render() | G4 loader-5/6 |
| 7 | 不支持 JS 表达式 | D2 render() | G4 loader-7 |

### PromptRegistry 注册索引

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 启动时扫描内置 + 用户覆盖 | D3 initialize() | G4 registry-1 |
| 2 | getAll() 返回元数据（不含 body） | D3 getAll() | G4 registry-2 |
| 3 | get(id) 返回完整元数据 | D3 get() | G4 registry-3 |
| 4 | getByScope(scope) 返回指定作用域 | D3 getByScope() | G4 registry-4 |
| 5 | 覆盖时标记 user-override | D3 initialize() | G4 registry-5 |
| 6 | requires 依赖验证 | D3 initialize() | G4 registry-6 |

### PromptComposer 核心组合

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | compose() 返回 ComposedPrompt | E1 compose() | G4 composer-1 |
| 2 | 组合顺序 core→mode→tools→agent→hooks→contexts | E1 compose() | G4 composer-1/2/3/4 |
| 3 | core 三片段始终加载 | E1 compose() | G4 composer-2 |
| 4 | core 的 `<immutable>` 强制保留 | E1 loadPart() | G4 composer-10 |
| 5 | mode 按 ComposeContext.mode 加载 | E1 compose() | G4 composer-3 |
| 6 | tools 按列表加载，无文件跳过 | E1 compose() | G4 composer-4 |
| 7 | contexts 使用模板渲染 | E1 compose() | G4 composer-5 |
| 8 | conflicts 检测产生 warning | E1 detectConflicts() | G4 composer-6 |
| 9 | requires 未满足抛 PromptDependencyError | E1 compose() | G4 composer-11 |

### Token 预算与缓存

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 超预算 warning（不自动裁剪） | E1 compose() | G4 composer-7 |
| 2 | 每个 PromptPart 记录 tokens | E1 loadPart() | G4 composer-1 |
| 3 | 相同 context 5s 内缓存命中 | E1 cache | G4 composer-8 |
| 4 | 缓存命中率埋点（Trace） | E1 compose() | 集成测试 |

### ContextEngine 集成

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | context-engine.ts 拆分为目录结构 | C1-C3 | TypeScript 编译 |
| 2 | PromptComposer 可选注入 | C4 setPromptComposer() | G4 integration-1/2 |
| 3 | 未注入时行为完全一致 | C4 fallback 分支 | G4 integration-2 |
| 4 | assembleForHarness 委托 PromptComposer | F1 | G4 integration-1 |
| 5 | SYSTEM_PROMPT_BASE 标记 @deprecated | F1 | 代码检查 |
| 6 | AssembledContext.promptParts 填充 | F1 | G4 integration-3 |

### Mode Prompt 混合迁移

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | AiModeDefinition.promptFileId 新增 | F2 | G4 mode-1 |
| 2 | 5 个内置 mode promptFileId 指向正确 | F3 | G4 mode-1 |
| 3 | buildSystemPromptPrefix 委托 PromptComposer | F5 | G4 mode-2 |
| 4 | 缓存未命中时 fallback 到 systemPromptPrefix | F5 | G4 mode-3 |

### IPC 集成

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 6 个 IPC 通道注册且类型安全 | G1 | 编译期保障 |
| 2 | Preload API 暴露 promptLibrary 命名空间 | G2 | 编译期保障 |
| 3 | derive-user-copy 复制到用户目录 | G1 | 手动验证 |
| 4 | reset-user-override 删除 + 刷新缓存 | G1 | 手动验证 |

### Trace 集成

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | compose() 产生 prompt.compose span | E1 | 集成测试 |
| 2 | span 记录每个 part 的 id/source/version/tokens | E1 | 集成测试 |
| 3 | ComposedPrompt.version 记录到 Trace | E1 | 集成测试 |

### 向后兼容

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | promptParts 为可选，不影响现有渲染 | A2 | G4 integration-2 |
| 2 | ContextLayerType 新增值不影响收窄 | A1 | TypeScript 编译 |
| 3 | promptFileId 为可选，不设时走原逻辑 | F2/F5 | G4 mode-3 |
| 4 | PromptComposer 未注入时行为一致 | C4/F1 | G4 integration-2 |

---

## 六、风险与缓解

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|---------|
| ContextEngine 拆分破坏导入路径 | 中 | 高 | 由于 index.ts 重导出，大部分导入无需修改；测试文件直接引用 `.ts` 扩展名的需逐一修复 |
| frontmatter 解析引入新依赖 | 低 | 中 | 实现轻量级正则解析器，不引入 gray-matter；YAML 字段均为标量/数组，无需复杂解析 |
| buildSystemPromptPrefix 同步/异步冲突 | 高 | 高 | mode 切换时预加载到缓存（异步），buildSystemPromptPrefix 从缓存同步读取；缓存未命中 fallback 硬编码 |
| Mustache 模板渲染边界情况 | 中 | 低 | 仅支持 `{{var}}` 和 `{{#list}}...{{/list}}` 两种语法；不支持的标记保留原文 |
| Token 估算精度不足 | 低 | 中 | 复用现有 CJK-aware 启发式估算（已在线上运行）；精确计数留给 TASK037 的 tiktoken 集成 |
| 用户覆盖文件编码问题 | 低 | 中 | PromptLoader 强制 UTF-8 读取；BOM 头自动剥离 |
| index.yaml 与实际文件不同步 | 中 | 中 | PromptRegistry.initialize() 中验证 index.yaml 列出的文件是否都存在；缺失文件记录 warning |
| 缓存失效时机不当 | 中 | 中 | 用户覆盖变更时立即 invalidateCache；mode 切换时预加载刷新缓存 |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 | 关键里程碑 |
|----|------|--------|-----------|
| Day 1 上午 | A1-A5 | shared/types 扩展 + token-utils.ts | 类型基础就绪 |
| Day 1 下午 | B1-B6 | resources/prompts/ 全部 17 文件 | Prompt 资源就绪 |
| Day 2 上午 | C1-C5 | context-engine/ 目录结构 | ContextEngine 拆分完成 |
| Day 2 下午 | D1-D3 | types.ts + PromptLoader + PromptRegistry | 加载/索引层完成 |
| Day 3 上午 | E1 | PromptComposer 核心实现 | 组合核心完成 |
| Day 3 下午 | F1-F5 | ContextEngine 集成 + Mode 迁移 | 端到端集成完成 |
| Day 4 上午 | G1-G3 | IPC Handler + Preload + 主进程装配 | IPC 打通 |
| Day 4 下午 | G4 | 全部单元测试 | 测试通过 |
| Day 5 | — | 集成验证 + 修复 + lint + typecheck | 验收通过 |

---

## 八、测试计划摘要

### 测试文件结构

```
tests/main/services/context-engine/
├── prompt-loader.test.ts          ← PromptLoader 核心逻辑（9 用例）
├── prompt-registry.test.ts        ← PromptRegistry 注册索引（9 用例）
├── prompt-composer.test.ts        ← PromptComposer 组合核心（11 用例）
├── context-engine-integration.test.ts  ← ContextEngine 集成（4 用例）
└── mode-prompt-migration.test.ts  ← Mode Prompt 迁移（3 用例）
```

### 测试基础设施

每个测试文件需要：
- **临时目录**：`os.tmpdir()` + `mkdtemp()` 创建测试用 prompt 目录
- **Mock PromptLoader**：测试 PromptRegistry/Composer 时可注入 mock loader
- **内置 prompt 副本**：从 `resources/prompts/` 复制到临时目录用于测试
- **用户覆盖模拟**：在临时目录创建 `.sibylla/prompts-local/` 覆盖文件

### 关键测试场景详解

**PromptComposer 缓存测试**：
1. 首次 compose → 执行完整加载
2. 100ms 内第二次相同 context → 返回缓存
3. 6s 后第三次 → 缓存过期，重新加载
4. `invalidateCache('modes.plan')` → 仅移除含 `modes.plan` 的缓存条目

**`<immutable>` 合并测试**：
1. 用户覆盖保留 `<immutable>` → 正常使用覆盖版本
2. 用户覆盖移除 `<immutable>` → 强制从内置合并回来
3. 用户覆盖修改 `<immutable>` 内部内容 → 仍使用内置版本（R1 缓解策略）

**回归测试**：
1. 迁移前：记录 `assembleForHarness()` 的完整 system prompt 输出
2. 迁移后（PromptComposer 注入）：对比输出应语义等价（格式可能不同，但核心内容一致）
3. 迁移后（PromptComposer 未注入）：输出应完全一致

---

**文档版本**: v1.0
**最后更新**: 2026-04-23
**维护者**: Sibylla 架构团队
