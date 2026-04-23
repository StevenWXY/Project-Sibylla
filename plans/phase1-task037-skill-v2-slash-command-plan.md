# PHASE1-TASK037: Skill 系统 v2 与 Slash Command 扩展 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task037_skill-v2-slash-command.md](../specs/tasks/phase1/phase1-task037_skill-v2-slash-command.md)
> 创建日期：2026-04-23
> 最后更新：2026-04-23

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK037 |
| **任务标题** | Skill 系统 v2 与 Slash Command 扩展 |
| **所属阶段** | Phase 1 - AI 能力扩展体系 (Sprint 3.5) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | TASK035 + TASK012 + TASK027 + TASK017 + TASK030 |

### 1.1 目标

建立两个核心扩展能力：（1）Skill v2 系统——从现有 v1 扁平 `.md` 格式渐进演进到 v2 目录结构（`_index.md` + `prompt.md` + `tools.yaml` + `examples/`），支持工具白名单、触发器、示例加载、三源注册（内置/工作区/个人）；（2）Slash Command 扩展——在现有 Command 系统上新增 prompt 注入能力，让用户通过 `/xxx [args]` 触发预置 prompt 片段与参数绑定。

### 1.2 核心设计约束

| 约束 | 来源 | 说明 |
|------|------|------|
| Skill 渐进演进 | sprint3.5 §17A.2 | 不推翻现有 SkillEngine，v1 格式向后兼容 |
| Slash Command 扩展现有 Command 系统 | sprint3.5 §17A.4 | 不建独立系统，扩展 Command 接口 |
| Skill 不启动独立 agent loop | sprint3.5 §4.2.3 | "能力注入" vs "能力外包"（Sub-agent） |
| 文件即真相 | CLAUDE.md §二 | Skill 定义以 Markdown/YAML 明文存储 |
| AI 建议/人类决策 | CLAUDE.md §二 | Skill 执行的写操作仍走 Guardrail 审批 |
| 个人空间隔离 | CLAUDE.md §七 | 个人 Skill 不被其他成员加载 |
| TS 严格模式禁止 any | CLAUDE.md §四 | 全部代码遵循 TypeScript 严格模式 |
| 主进程与渲染进程严格隔离 | CLAUDE.md §三 | 文件系统访问仅在主进程 |

### 1.3 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| skill-system 类型 | `src/main/services/skill-system/types.ts` | SkillV2 / SkillTrigger / SkillToolsConfig / SkillResult |
| SkillLoader | `src/main/services/skill-system/SkillLoader.ts` | v1 + v2 统一加载 |
| SkillRegistry | `src/main/services/skill-system/SkillRegistry.ts` | 三源注册 + 触发器索引 |
| SkillExecutor | `src/main/services/skill-system/SkillExecutor.ts` | Skill 执行模型（prompt 注入） |
| SkillValidator | `src/main/services/skill-system/SkillValidator.ts` | 格式校验 + injection 扫描 |
| SlashCommandParser | `src/main/services/command/SlashCommandParser.ts` | /xxx [args] 解析 |
| SlashCommandLoader | `src/main/services/command/SlashCommandLoader.ts` | Markdown 文件加载 |
| Command 类型扩展 | `src/main/services/command/types.ts` | promptTemplate / params / isSlashCommand |
| CommandRegistry 扩展 | `src/main/services/command/command-registry.ts` | resolveBySlash / getSlashCommands |
| shared/types.ts 扩展 | `src/shared/types.ts` | SkillV2 + CommandParam + ParsedCommand + IPC 通道 |
| 内置 Skill 资源 | `resources/skills/`（8 目录） | code-review 等内置 Skill |
| 内置 Slash Command 资源 | `resources/slash-commands/`（8 文件） | /clear 等内置 Slash Command |
| IPC Handler 扩展 | `src/main/ipc/handlers/ai.handler.ts` + `command.ts` | 新增 11 个 handler |
| Preload API 扩展 | `src/preload/index.ts` | skill + slashCommand 命名空间 |
| 单元测试 | `tests/main/services/skill-system/` + `tests/main/services/command/` | 覆盖率 ≥ 80% |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；文件即真相；个人空间隔离；结构化日志 | 全局约束 |
| `specs/design/architecture.md` | 主进程与渲染进程通过 IPC 通信；SkillEngine 核心组件 | 进程通信架构 |
| `specs/requirements/phase1/sprint3.5-ai_ablities.md` | §4.2 Skill 系统；§4.3 Slash Command；附录 A §17A.2/17A.4 | 验收标准 + 架构约束 |
| `specs/design/skills-list.md` | 现有 v1 Skill 结构规范（## 描述 / ## AI 行为指令 / ## 输出格式） | v1 解析兼容 |
| `specs/tasks/phase1/phase1-task037_skill-v2-slash-command.md` | 9 步执行路径、完整验收标准、架构图 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `ai-context-engine` | PromptComposer 作为 Skill prompt 注入目标；Token 预算管理 | SkillExecutor → PromptComposer |
| `typescript-strict-mode` | 全模块类型安全；泛型设计（SkillV2 extends Skill） | 所有 `.ts` 文件 |
| `electron-ipc-patterns` | IPC 通道注册；Preload API 扩展；类型安全通道映射 | IPC Handler + preload/index.ts |

### 2.3 前置代码依赖

| 模块 | 文件路径 | 行数 | 复用方式 |
|------|---------|------|---------|
| SkillEngine | `services/skill-engine.ts` | 236 | 封装为 SkillRegistry 内部 legacy 引擎，不修改 |
| Skill type | `shared/types.ts:1455-1478` | 24 | 扩展为 SkillV2，原 type 保留 |
| CommandRegistry | `services/command/command-registry.ts` | 156 | 扩展 resolveBySlash / getSlashCommands 方法 |
| Command type | `services/command/types.ts` | 20 | 新增 3 个可选字段 |
| PromptComposer | `services/context-engine/PromptComposer.ts` | 265 | Skill prompt 注入目标（additionalPromptParts） |
| PromptLoader | `services/context-engine/PromptLoader.ts` | — | 复用 frontmatter 解析逻辑 |
| Tracer | `services/trace/tracer.ts` | 235 | Skill 执行 Trace 埋点 |
| FileManager | `services/file-manager.ts` | 1603 | Skill 文件读写（readFile/listFiles/exists） |
| AiModeRegistry | `services/mode/ai-mode-registry.ts` | 256 | getAvailableInMode 过滤 |
| IPC_CHANNELS | `shared/types.ts:151-152` | 2 | 追加 11 个 skill + command 通道 |
| Preload API | `preload/index.ts` | 1659 | 追加 skill + slashCommand 命名空间 |
| token-utils | `services/context-engine/token-utils.ts` | — | Token 估算函数复用 |

### 2.4 关键接口衔接点

**SkillExecutor → PromptComposer**：SkillExecutor 返回 `SkillExecutionPlan`（含 `additionalPromptParts` + `toolFilter` + `budget`），主循环接收 plan 后将其注入 PromptComposer，不直接操作 PromptComposer。

**SkillRegistry → SkillEngine**：SkillRegistry 内部持有 `legacyEngine: SkillEngine` 实例。v1 格式 Skill 通过 `legacyEngine.getSkill()` 读取后映射为 SkillV2。v1 的 `handleFileChange()` 和 `subscribeToFileChanges()` 仍然有效。

**SlashCommandParser → CommandRegistry**：SlashCommandParser 构造时接收 CommandRegistry 引用，调用新增的 `resolveBySlash()` 查找命令。

**YAML 解析**：Skill v2 的 `_index.md` frontmatter 和 `tools.yaml` 均需 YAML 解析。复用 PromptLoader 中已实现的 frontmatter 解析器（正则提取 `---` 之间内容）；`tools.yaml` 使用项目已有的 `js-yaml` 或 `yaml` 包。

### 2.5 新增 IPC 通道清单

| 通道常量 | 通道名 | 方向 | 用途 |
|---------|--------|------|------|
| `AI_SKILL_GET` | `ai:skill:get` | Renderer→Main | 获取 Skill 详情 |
| `AI_SKILL_CREATE` | `ai:skill:create` | Renderer→Main | 创建自定义 Skill |
| `AI_SKILL_EDIT` | `ai:skill:edit` | Renderer→Main | 编辑 Skill |
| `AI_SKILL_VALIDATE` | `ai:skill:validate` | Renderer→Main | 校验 Skill 格式 |
| `AI_SKILL_DELETE` | `ai:skill:delete` | Renderer→Main | 删除 Skill |
| `AI_SKILL_EXPORT` | `ai:skill:export` | Renderer→Main | 导出 Skill |
| `AI_SKILL_IMPORT` | `ai:skill:import` | Renderer→Main | 导入 Skill |
| `AI_SKILL_TEST_RUN` | `ai:skill:test-run` | Renderer→Main | 测试运行 Skill |
| `COMMAND_PARSE_SLASH` | `command:parse-slash` | Renderer→Main | 解析 Slash Command |
| `COMMAND_CREATE_SLASH` | `command:create-slash` | Renderer→Main | 创建自定义 Slash Command |
| `COMMAND_GET_SUGGESTIONS` | `command:get-suggestions` | Renderer→Main | 获取自动补全建议 |

---

## 三、现有代码盘点与差距分析

### 3.1 主进程模块现状

| 模块 | 文件 | 行数 | TASK037 改造 |
|------|------|------|-------------|
| SkillEngine | `services/skill-engine.ts` | 236 | **封装**：作为 SkillRegistry 内部 legacy 引擎，不修改源码 |
| Skill type | `shared/types.ts:1455-1478` | 24 | **扩展**：新增 SkillV2 extends Skill |
| CommandRegistry | `services/command/command-registry.ts` | 156 | **扩展**：新增 resolveBySlash / getSlashCommands |
| Command type | `services/command/types.ts` | 20 | **扩展**：新增 3 个可选字段 |
| IPC_CHANNELS | `shared/types.ts:151-152` | 2 | **追加**：11 个 skill + command 通道 |
| IPCChannelMap | `shared/types.ts` | — | **追加**：类型映射 |
| Preload API | `preload/index.ts` | 1659 | **追加**：skill + slashCommand 命名空间 |
| PromptComposer | `context-engine/PromptComposer.ts` | 265 | **不修改**：SkillExecutor 通过返回 plan 间接使用 |

### 3.2 完全缺失、需新建的模块

| 模块 | 文件路径 | 说明 |
|------|---------|------|
| skill-system 目录 | `services/skill-system/` | 整个目录新建 |
| skill-system 类型 | `services/skill-system/types.ts` | 内部类型定义 |
| SkillLoader | `services/skill-system/SkillLoader.ts` | v1 + v2 统一加载 |
| SkillRegistry | `services/skill-system/SkillRegistry.ts` | 三源注册 + 触发器 |
| SkillExecutor | `services/skill-system/SkillExecutor.ts` | prompt 注入执行模型 |
| SkillValidator | `services/skill-system/SkillValidator.ts` | 格式校验 + injection 扫描 |
| SlashCommandParser | `services/command/SlashCommandParser.ts` | /xxx 解析 |
| SlashCommandLoader | `services/command/SlashCommandLoader.ts` | Markdown 加载 |
| 内置 Skill 资源 | `resources/skills/`（8 目录） | 每个 _index.md + prompt.md + tools.yaml |
| 内置 Slash Command 资源 | `resources/slash-commands/`（8 文件） | 每个 .md 含 frontmatter + 模板 |

### 3.3 现有 SkillEngine v1 解析逻辑

SkillEngine.parseSkill() 从扁平 `.md` 文件解析，通过 Markdown `##` 标题分段：

```
## 描述 → skill.description
## 适用场景 → skill.scenarios
## AI 行为指令 → skill.instructions
## 输出格式 → skill.outputFormat
## 示例 → skill.examples
```

**v1 → SkillV2 映射策略**：
- `formatVersion: 1`
- `version: '1.0.0'`、`author: ''`、`category: 'general'`
- `tags: []`、`scope: 'public'`
- `source` 根据路径判断（`skills/` → workspace，`resources/skills/` → builtin）
- `triggers: []`、`allowedTools: undefined`

### 3.4 现有 Command 系统现状

Command 接口仅支持 action commands（`execute: () => Promise<void>`），不支持 prompt 注入。CommandRegistry 的 `search()` 和 `execute()` 方法不识别 slash 前缀。

**新增字段设计**（全部可选，向后兼容）：
```typescript
promptTemplate?: string      // prompt 模板（Mustache 风格变量替换）
params?: CommandParam[]      // 参数定义
isSlashCommand?: boolean     // 标记为 /xxx 触发
aliases?: string[]           // 别名列表
```

---

## 四、分步实施计划

### 阶段 A：共享类型扩展（Step 1） — 预计 0.5 天

#### A1：扩展 shared/types.ts

**文件：** `sibylla-desktop/src/shared/types.ts`

1. **新增 SkillV2 接口**（扩展现有 Skill）：
   ```typescript
   export interface SkillV2 extends Skill {
     version: string
     author: string
     category: string
     tags: string[]
     scope: 'public' | 'private' | 'personal'
     source: 'builtin' | 'workspace' | 'personal'
     triggers: SkillTrigger[]
     allowedTools?: string[]
     examplesDir?: string
     assetsDir?: string
     formatVersion: 1 | 2
   }

   export interface SkillTrigger {
     slash?: string
     mention?: string
     pattern?: string
   }

   export interface SkillToolsConfig {
     allowed_tools: string[]
     required_context?: string[]
     budget?: { max_tokens: number; max_tool_calls: number }
   }

   export interface SkillResult {
     success: boolean
     tokensUsed: number
     toolCallsCount: number
     errors: string[]
   }
   ```

2. **新增 Slash Command 相关类型**：
   ```typescript
   export interface CommandParam {
     name: string
     type: 'string' | 'integer' | 'boolean' | 'enum'
     required: boolean
     description: string
     default?: unknown
     enum?: string[]
   }

   export interface ParsedCommand {
     commandId: string
     commandVersion: string
     params: Record<string, unknown>
     rawInput: string
   }

   export interface CommandSuggestion {
     id: string
     title: string
     description: string
     matchType: 'exact' | 'prefix' | 'alias'
   }
   ```

3. **追加 IPC 通道常量**（11 个）和 `IPCChannelMap` 类型映射

**验证：** TypeScript 编译通过。

---

### 阶段 B：SkillLoader 实现（Step 2） — 预计 0.5 天

**文件：** `src/main/services/skill-system/SkillLoader.ts`（新建）

#### B1：构造函数

```typescript
export class SkillLoader {
  constructor(
    private readonly fileManager: FileManager,
    private readonly tokenEstimator: (text: string) => number,
  ) {}
```

#### B2：实现 `async loadV1(filePath: string): Promise<SkillV2>`

- 复用 SkillEngine.parseSkill() 的 Markdown 标题分段解析逻辑
- 将 v1 字段映射到 SkillV2 默认值（formatVersion=1, version='1.0.0' 等）
- `source` 根据路径判断：含 `resources/` → builtin，否则 → workspace

#### B3：实现 `async loadV2(dirPath: string, source): Promise<SkillV2>`

- 读取 `_index.md`，用正则提取 YAML frontmatter
- 读取 `prompt.md` 作为 instructions
- 读取 `tools.yaml`（如存在），解析为 SkillToolsConfig
- 扫描 `examples/` 目录（如存在），加载所有 `.md` 文件内容
- 验证必填字段（id/version/name/description），缺失则抛错

#### B4：实现 `async loadFromDir(dirPath: string, source): Promise<SkillV2[]>`

- 扫描目录下所有子目录（v2 格式）和 `.md` 文件（v1 格式）
- 对子目录调用 `loadV2()`，对 `.md` 文件调用 `loadV1()`
- 跳过 `_index.md`（不属于 v1 格式）
- 收集错误但不中断（failed skills 记录 warning）

#### B5：实现 `isV2Directory(dirPath: string): Promise<boolean>`

- 检查目录下是否存在 `_index.md`

**验证：** v1/v2 格式均可正确加载为 SkillV2。

---

### 阶段 C：SkillRegistry 实现（Step 3） — 预计 1 天

**文件：** `src/main/services/skill-system/SkillRegistry.ts`（新建）

#### C1：内部数据结构

```typescript
private skills = new Map<string, SkillV2>()
private triggerIndex = new Map<string, SkillV2>()
private legacyEngine: SkillEngine
```

#### C2：构造函数

```typescript
constructor(
  private readonly loader: SkillLoader,
  private readonly fileManager: FileManager,
  private readonly currentUser?: string,
) {
  this.legacyEngine = new SkillEngine(fileManager)
}
```

#### C3：实现 `async discoverAll(): Promise<SkillV2[]>`

扫描顺序（决定优先级覆盖方向）：
1. 内置：`resources/skills/` → `loader.loadFromDir(path, 'builtin')`
2. 工作区 v2：`.sibylla/skills/` → `loader.loadFromDir(path, 'workspace')`
3. 工作区 v1 legacy：`skills/` → `loader.loadFromDir(path, 'workspace')`
4. 个人：`personal/{user}/skills/` → `loader.loadFromDir(path, 'personal')`

按 "个人 > 工作区 > 内置" 去重（后扫描的覆盖先扫描的同 id）。构建 triggerIndex（slash/mention → skill）。

#### C4：核心查询方法

| 方法 | 职责 |
|------|------|
| `get(id)` | 按 id 查询 SkillV2 |
| `getAll()` | 返回所有已注册 Skill |
| `search(query, limit?)` | 先 triggerIndex 精确匹配，再模糊搜索 id/name/description/tags |
| `resolveByTrigger(input)` | 检查 input 是否匹配任何 Skill 的 trigger |
| `getAvailableInMode(mode)` | 过滤 loadableIn.modes 包含当前 mode 的 Skill |
| `getLegacySkill(id)` | 委托到 legacy SkillEngine.getSkill() |

#### C5：个人空间安全隔离

`discoverAll()` 扫描个人目录时，验证 `currentUser` 匹配。`get()` 返回 personal scope 的 Skill 时检查调用者身份。不匹配则拒绝并记录安全日志。

#### C6：文件变更处理

`handleFileChange(event)` 委托到 legacy SkillEngine（保持文件监听）；对 v2 目录的变更触发重新加载对应 Skill。

**验证：** 三源注册正确；个人空间隔离；trigger 匹配；v1 兼容。

---

### 阶段 D：SkillExecutor 实现（Step 4） — 预计 0.5 天

**文件：** `src/main/services/skill-system/SkillExecutor.ts`（新建）

#### D1：关键设计

SkillExecutor 返回 `SkillExecutionPlan`（含 composerOverride），**不直接运行主循环**。主循环接收 plan 后应用到 PromptComposer。

```typescript
export interface SkillExecutionPlan {
  additionalPromptParts: string[]
  toolFilter?: string[]
  budget?: { max_tokens: number; max_tool_calls: number }
}

export interface SkillExecutionContext {
  skill: SkillV2
  userInput: string
  parentTraceId: string
  onSkillEnd?: () => void
}
```

#### D2：实现 `async execute(ctx): Promise<{ plan: SkillExecutionPlan; result: SkillResult }>`

1. 加载 Skill 全部资源（prompt.md + examples/）
2. 构建 additionalPromptParts：[prompt.md, ...examples]
3. 对 examples 按 token 预算裁剪（超过 estimated_tokens × 0.5 时只保留前 2-3 个）
4. 工具过滤：按 tools.yaml 的 allowed_tools 裁剪
5. 验证 allowed_tools 是主 agent 工具集的子集（不在时报错）
6. 记录 Trace（skill.invocation span）
7. 返回 SkillExecutionPlan

#### D3：实现 `async loadSkillResources(skill): Promise<SkillResources>`

加载 prompt.md、examples/、tools.yaml，组装为结构化资源对象。

**验证：** 返回正确的 plan；工具过滤正确；examples 裁剪正确；Trace 记录。

---

### 阶段 E：SkillValidator 实现（Step 5） — 预计 0.5 天

**文件：** `src/main/services/skill-system/SkillValidator.ts`（新建）

#### E1：核心校验方法

| 方法 | 职责 |
|------|------|
| `validateMetadata(frontmatter)` | 必填字段检查（id/version/name/description）、类型检查、scope 枚举值 |
| `validateToolsConfig(toolsYaml, knownTools)` | allowed_tools 是否在已知工具中、budget.max_tokens 正整数 |
| `scanForInjection(content)` | 关键词 + 模式匹配（"忽略前面的指令"等）、超长重复字符检测 |
| `validateSkillDir(dirPath, knownTools)` | 综合校验：metadata + tools + prompt injection |

#### E2：injection 检测策略

返回 warning 级别（不阻止加载，仅警告）。检测模式：
- 常见 injection 句式（中英文）
- 超长重复字符（>100 相同字符）
- examples/ 总 token 数超过 estimated_tokens × 0.5 时发出 warning

**验证：** 必填字段缺失报错；未知工具 warning；injection 模式检测。

---

### 阶段 F：Command 系统扩展 + SlashCommandParser（Step 6） — 预计 1 天

#### F1：扩展 Command interface

**文件：** `src/main/services/command/types.ts`（扩展）

```typescript
export interface Command {
  // ... 现有字段不变 ...
  promptTemplate?: string
  params?: CommandParam[]
  isSlashCommand?: boolean
  aliases?: string[]
}
```

#### F2：扩展 CommandRegistry

**文件：** `src/main/services/command/command-registry.ts`（扩展）

新增方法：
- `resolveBySlash(prefix)` — 查找 id === prefix 或 aliases 包含 prefix 的 isSlashCommand 命令
- `getSlashCommands()` — 返回所有 isSlashCommand === true 的命令

#### F3：实现 SlashCommandParser

**文件：** `src/main/services/command/SlashCommandParser.ts`（新建）

`parse(input: string): ParsedCommand | null`：
1. 非 `/` 开头返回 null
2. tokenize：按空格分割，支持引号包裹（`"修复所有错误"` 作为单个值）
3. `registry.resolveBySlash(tokens[0])` 查找命令
4. 绑定参数：位置参数赋给第一个 required string param；`key=value` 命名参数；未识别 `/xxx` 返回 null

`getSuggestions(partial: string): CommandSuggestion[]`：
1. 去除 `/` 前缀
2. 匹配 id / aliases（prefix 匹配）
3. 返回 CommandSuggestion[] 含 matchType

#### F4：实现 SlashCommandLoader

**文件：** `src/main/services/command/SlashCommandLoader.ts`（新建）

从 Markdown 文件加载 Slash Command：
- 解析 YAML frontmatter（id、params、aliases、version 等）
- body 作为 promptTemplate
- 注册到 CommandRegistry（isSlashCommand=true）

**验证：** `/loop 修复所有错误` 正确解析；`/compl` 返回建议；别名映射正确；未识别返回 null。

---

### 阶段 G：创建内置资源文件（Step 7） — 预计 0.5 天

#### G1：创建 8 个内置 Skill 目录

**目录：** `sibylla-desktop/resources/skills/`

| Skill ID | 目录 | _index.md 关键字段 | tools.yaml allowed_tools |
|----------|------|-------------------|-------------------------|
| code-review | `code-review/` | triggers=[{slash: /review}], loadable_in.modes=[review, analyze] | read-file, search, list-files |
| doc-summarize | `doc-summarize/` | category=documentation | read-file, search, list-files |
| meeting-notes | `meeting-notes/` | category=documentation | read-file, write-file |
| prd-draft | `prd-draft/` | category=product | read-file, write-file, search, list-files |
| spec-lint | `spec-lint/` | category=development | read-file, search |
| changelog-writer | `changelog-writer/` | category=development | read-file, write-file, search, list-files |
| task-breakdown | `task-breakdown/` | category=planning | read-file, search, list-files |
| daily-report | `daily-report/` | category=productivity | read-file, search, list-files |

每个目录包含：`_index.md` + `prompt.md` + `tools.yaml`。code-review 额外包含 `examples/`（2 个示例）。

#### G2：创建 8 个内置 Slash Command 文件

**目录：** `sibylla-desktop/resources/slash-commands/`

| 文件 | id | 关键 params |
|------|-----|------------|
| loop.md | loop | task(string,required), max_steps(integer,default=20) |
| clear.md | clear | —（触发 PreCompaction hook 后清空） |
| compact.md | compact | —（手动触发压缩） |
| review.md | review | target(string,required) |
| summarize.md | summarize | target(string,required) |
| plan.md | plan | task(string,optional) |
| mode.md | mode | name(string,required) |
| help.md | help | —（动态合并所有命令） |

**验证：** 所有资源文件格式正确，可被 Loader 正确加载。

---

### 阶段 H：IPC 集成 + 主进程装配（Step 8） — 预计 1 天

#### H1：扩展 ai.handler.ts

**文件：** `src/main/ipc/handlers/ai.handler.ts`

- 扩展 `ai:skill:list`：返回 `SkillV2[]`（通过 SkillRegistry.getAll()）
- 扩展 `ai:skill:search`：委托 SkillRegistry.search()
- 新增 7 个 handler：get / create / edit / validate / delete / export / import / test-run

#### H2：新增 command handler

**文件：** `src/main/ipc/handlers/command.ts`（或新建 `slash-command.handler.ts`）

- `command:parse-slash`：调用 SlashCommandParser.parse()
- `command:create-slash`：创建 .md 到 `.sibylla/slash-commands/`
- `command:get-suggestions`：调用 SlashCommandParser.getSuggestions()

#### H3：Preload API 扩展

**文件：** `src/preload/index.ts`

追加 `skill` 命名空间（get/create/validate/delete/export/import/testRun）和 `slashCommand` 命名空间（parse/create/getSuggestions）。ALLOWED_CHANNELS 追加 11 个新通道。

#### H4：主进程装配

在 `onWorkspaceOpened` 中按顺序创建：
```
a. SkillLoader(fileManager, tokenEstimator)
b. SkillRegistry(loader, fileManager, currentUser)
c. await SkillRegistry.discoverAll()
d. SkillExecutor(promptComposer, tracer)
e. SkillValidator(knownTools)
f. SlashCommandLoader(commandRegistry, fileManager)
g. await SlashCommandLoader.loadBuiltins(resources/slash-commands/)
h. await SlashCommandLoader.loadUser(workspace/.sibylla/slash-commands/)
i. SlashCommandParser(commandRegistry)
```

**验证：** IPC 通道全部注册，可通过 DevTools 调用。

---

## 五、验收标准追踪

### Skill v2 目录规范

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | v2 目录包含 _index.md + prompt.md + tools.yaml(选填) + examples/(选填) | G1 | skill-loader.test.ts |
| 2 | _index.md frontmatter 包含 id/version/name/description 必填字段 | B3 | skill-validator.test.ts |
| 3 | v1 格式继续支持，自动识别 | B2 | skill-loader.test.ts |

### SkillRegistry 三源注册

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 三源扫描：内置 → 工作区 → 个人 | C3 | skill-registry.test.ts |
| 2 | 优先级：个人 > 工作区 > 内置，同 id 后者覆盖 | C3 | skill-registry.test.ts |
| 3 | 个人空间 Skill 被其他成员加载时拒绝 | C5 | skill-registry.test.ts |
| 4 | getAvailableInMode(mode) 过滤正确 | C4 | skill-registry.test.ts |
| 5 | 现有 v1 Skill 功能不受影响 | C6 | skill-registry.test.ts（回归） |

### SkillExecutor 执行模型

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | prompt.md + examples 注入为 additionalPromptParts | D2 | skill-executor.test.ts |
| 2 | 工具集按 tools.yaml 裁剪 | D2 | skill-executor.test.ts |
| 3 | Skill 不启动独立 agent loop | D1 设计 | 架构级保障 |
| 4 | Trace 事件记录 | D2 | skill-executor.test.ts |

### SkillValidator 校验

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 必填字段缺失报错 | E1 | skill-validator.test.ts |
| 2 | 未知工具 warning | E1 | skill-validator.test.ts |
| 3 | prompt injection 模式检测 | E2 | skill-validator.test.ts |

### 内置 Skill + Slash Command

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 8 个内置 Skill 目录创建 | G1 | 手动验证 |
| 2 | 8 个内置 Slash Command 文件创建 | G2 | slash-command-loader.test.ts |

### Slash Command 解析

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | /xxx 开头解析正确 | F3 | slash-command-parser.test.ts |
| 2 | 多参数风格支持（位置/命名/引号） | F3 | slash-command-parser.test.ts |
| 3 | 别名正确识别 | F3 | slash-command-parser.test.ts |
| 4 | 未识别 /xxx 返回 null | F3 | slash-command-parser.test.ts |
| 5 | /compl 返回自动补全建议 | F3 | slash-command-parser.test.ts |

### Command 系统扩展

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | Command interface 新增字段全部可选 | F1 | command-registry-slash.test.ts |
| 2 | resolveBySlash() 正确查找 | F2 | command-registry-slash.test.ts |
| 3 | 现有 action commands 不受影响 | F2 | command-registry-slash.test.ts（回归） |

### IPC 集成

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 11 个新 IPC 通道注册且类型安全 | H1-H2 | 编译期保障 |
| 2 | Preload API 暴露 skill + slashCommand 命名空间 | H3 | 编译期保障 |
| 3 | 现有 ai:skill:list/search 返回类型扩展 | H1 | 集成测试 |

### 向后兼容

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 现有 Skill type 保持不变 | A1 | TypeScript 编译 |
| 2 | 现有 Command interface 新增字段全部可选 | F1 | TypeScript 编译 |
| 3 | v1 格式 Skill 继续正常加载 | B2 | skill-loader.test.ts |
| 4 | 现有 IPC 通道签名不变 | H1 | 集成测试 |

---

## 六、风险与缓解

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|---------|
| v1/v2 格式歧义（目录下同时有 .md 和 _index.md） | 中 | 中 | isV2Directory() 优先检测 _index.md，存在则整个目录按 v2 处理；.md 文件在 v2 模式下忽略 |
| YAML 解析引入新依赖 | 低 | 中 | 复用 PromptLoader 的 frontmatter 正则解析器；tools.yaml 使用已有 js-yaml 包 |
| frontmatter 字段缺失导致运行时崩溃 | 中 | 高 | SkillLoader.loadV2() 中严格校验必填字段，缺失时 skip + warning，不阻断其他 Skill |
| Slash Command 参数解析边界情况 | 中 | 低 | 仅支持三种风格（位置/命名/引号），不支持嵌套引号或转义 |
| 个人空间隔离绕过 | 低 | 高 | SkillRegistry.get() 中检查 scope + currentUser；安全日志记录每次拒绝 |
| Skill prompt 注入与 PromptComposer 缓存冲突 | 中 | 中 | SkillExecutor 返回 plan 时由主循环调用 invalidateCache()；Skill 结束后恢复缓存 |
| examples 总 token 超预算 | 中 | 低 | 裁剪策略：按 estimated_tokens × 0.5 上限，优先保留前 2-3 个 |

---

## 七、测试计划摘要

### 测试文件结构

```
tests/main/services/skill-system/
├── skill-loader.test.ts          ← v1 + v2 加载（5 用例）
├── skill-registry.test.ts        ← 三源注册 + 触发器 + 隔离（7 用例）
├── skill-executor.test.ts        ← 执行计划 + 工具过滤 + Trace（5 用例）
└── skill-validator.test.ts       ← 校验 + injection 检测（4 用例）

tests/main/services/command/
├── slash-command-parser.test.ts   ← 解析 + 建议（6 用例）
├── slash-command-loader.test.ts   ← Markdown 加载（3 用例）
└── command-registry-slash.test.ts ← resolveBySlash + 兼容（3 用例）
```

### 关键测试场景

**SkillLoader**：v1 扁平 .md 解析为 SkillV2(formatVersion=1) / v2 目录解析(formatVersion=2) / 必填字段缺失跳过 / tools.yaml 不存在时 allowedTools=undefined / examples 空目录不报错

**SkillRegistry**：三源注册优先级 / 个人空间拒绝 / trigger slash/mention/pattern 匹配 / getAvailableInMode / search 模糊搜索 / v1 兼容回归

**SkillExecutor**：additionalPromptParts 包含 prompt + examples / toolFilter 正确 / examples 裁剪（超 50% 预算） / Trace span 记录 / 工具不在主 agent 工具集时报错

**SlashCommandParser**：`/loop 修复所有错误` → task / `/loop task="修复" max_steps=50` → 命名参数 / `/compl` → 建议 / 别名 `/continue` → loop / `/unknown` → null / 非 `/` 开头 → null

**覆盖率目标：** ≥ 80%

---

## 八、执行时间线

| 天 | 阶段 | 交付物 | 关键里程碑 |
|----|------|--------|-----------|
| Day 1 上午 | A1 | shared/types.ts 扩展 | 类型基础就绪 |
| Day 1 下午 | B1-B5 | SkillLoader 完成 | v1 + v2 加载打通 |
| Day 2 上午 | C1-C6 | SkillRegistry 完成 | 三源注册 + 触发器就绪 |
| Day 2 下午 | D1-D3 + E1-E2 | SkillExecutor + SkillValidator | 执行模型 + 校验完成 |
| Day 3 上午 | F1-F4 | Command 扩展 + SlashCommandParser + Loader | Slash Command 解析完成 |
| Day 3 下午 | G1-G2 | 8 内置 Skill + 8 内置 Slash Command 资源 | 资源文件就绪 |
| Day 4 上午 | H1-H4 | IPC + Preload + 主进程装配 | IPC 打通 |
| Day 4 下午 | — | 全部单元测试 | 测试通过 |
| Day 5 | — | 集成验证 + 修复 + lint + typecheck | 验收通过 |

---

**文档版本**: v1.0
**最后更新**: 2026-04-23
**维护者**: Sibylla 架构团队
