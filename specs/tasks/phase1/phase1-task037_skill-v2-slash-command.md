# Skill 系统 v2 与 Slash Command 扩展

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK037 |
| **任务标题** | Skill 系统 v2 与 Slash Command 扩展 |
| **所属阶段** | Phase 1 - AI 能力扩展体系 (Sprint 3.5) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

建立两个核心扩展能力：（1）Skill v2 系统——从现有的 v1 扁平 `.md` 格式渐进演进到 v2 目录结构（`_index.md` + `prompt.md` + `tools.yaml` + `examples/`），支持工具白名单、触发器、示例加载、三源注册（内置/工作区/个人）；（2）Slash Command 扩展——在现有 Command 系统上新增 prompt 注入能力，让用户通过 `/xxx [args]` 触发预置 prompt 片段与参数绑定。

### 背景

**Skill 系统**：当前 `SkillEngine`（236 行）仅支持 v1 格式——扁平 `.md` 文件放在 `skills/` 目录下，通过 `## 描述`、`## AI 行为指令`、`## 输出格式` 等 Markdown 章节解析。缺少工具白名单（无法约束 Skill 使用的工具）、缺少触发器（无法通过关键词匹配触发）、缺少示例加载（无法提供 few-shot）、缺少多源注册（仅扫描 `skills/` 目录）。

**Slash Command**：当前 `CommandRegistry`（156 行）支持 action commands（执行一个函数），但不支持 prompt commands（注入一个 prompt 片段到对话中）。用户每次都要手动输入重复的 prompt 指令。

**核心设计约束**：

- Skill 系统**渐进演进**（§17A.2），不推翻现有 SkillEngine，v1 格式向后兼容
- Slash Command **扩展现有 Command 系统**（§17A.4），不建独立系统
- 现有 `Skill` type 保持，新增 `SkillV2` 扩展类型
- 现有 IPC 通道 `ai:skill:list`、`ai:skill:search` 保持，扩展返回类型
- Skill 不启动独立 agent loop（与 Sub-agent 的本质区别："能力注入" vs "能力外包"）

### 范围

**包含：**

- Skill v2 目录规范（_index.md + prompt.md + tools.yaml + examples/）
- SkillRegistry — 封装原 SkillEngine，扩展 v2 格式解析，三源注册
- SkillLoader — v1 + v2 格式统一加载
- SkillExecutor — Skill 执行模型（prompt 注入到主循环，非独立 agent）
- SkillValidator — Skill 格式校验 + prompt injection 扫描
- 8 个内置 Skill 资源文件创建
- SlashCommandParser — `/xxx [args]` 解析
- Command interface 扩展 — promptTemplate / params / isSlashCommand
- 内置 Slash Command 资源文件创建（/clear, /compact, /loop, /review, /summarize, /plan, /mode, /help）
- Slash Command 自动补全 UI
- IPC 扩展（ai:skill:* 新增 + command:* 新增）
- 单元测试

**不包含：**

- Sub-agent 系统（TASK038）
- Workflow 编排（TASK039）
- 技能市场 UI（TASK039）
- MCP Server 集成

## 依赖关系

### 前置依赖

- [x] TASK035 — Prompt 库基础设施（PromptComposer 已可用，Skill prompt 通过其注入）
- [x] TASK012 — 上下文引擎 v1（ContextEngine 已可用）
- [x] TASK027 — Tracer SDK（Skill 执行产生 Trace）
- [x] TASK017 — Guardrails（工具集管理已可用）
- [x] TASK030 — AI 模式系统（Mode 影响 Skill 加载范围）

### 被依赖任务

- TASK039 — Workflow 自动化（Workflow 可调用 Skill）

## 参考文档

- [`specs/requirements/phase1/sprint3.5-ai_ablities.md`](../../requirements/phase1/sprint3.5-ai_ablities.md) — 需求 3.5.2（§5.2）、需求 3.5.3（§5.3）、§4.2、§4.3、§17A.2、§17A.4
- [`specs/design/skills-list.md`](../../design/skills-list.md) — 现有 Skill 结构规范
- [`CLAUDE.md`](../../../CLAUDE.md) — 设计哲学、个人空间隔离
- `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` — TypeScript 严格模式
- `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` — IPC 类型安全设计

## 验收标准

### Skill v2 目录规范

- [ ] v2 格式目录包含 `_index.md`（必填）、`prompt.md`（必填）、`tools.yaml`（选填）、`examples/`（选填）
- [ ] `_index.md` frontmatter 包含 id、version、name、description 必填字段
- [ ] `_index.md` frontmatter 可选字段：author、category、tags、scope、triggers、loadable_in、estimated_tokens
- [ ] `tools.yaml` 包含 allowed_tools、required_context、budget
- [ ] v1 格式（扁平 `.md`）继续支持，自动识别并解析

### SkillRegistry 三源注册

- [ ] 启动时扫描内置目录（`resources/skills/`）、工作区目录（`.sibylla/skills/`）、个人目录（`personal/{user}/skills/`）
- [ ] 优先级：个人 > 工作区 > 内置，相同 id 后扫描的覆盖先扫描的
- [ ] v1 格式（`{workspace}/skills/*.md`）作为 legacy 路径继续扫描
- [ ] `_index.md` 缺少必填字段时跳过该 Skill 并记录 warning
- [ ] 个人空间的 Skill 被其他成员加载时拒绝并记录安全日志
- [ ] `getAvailableInMode(mode)` 返回当前模式下可用的 Skill

### SkillLoader 统一加载

- [ ] v1 格式：复用现有 `SkillEngine.parseSkill()` 逻辑
- [ ] v2 格式：解析 `_index.md` frontmatter + `prompt.md` body + `tools.yaml` + `examples/`
- [ ] 两种格式统一返回 `SkillV2` 类型（v1 字段自动填充默认值）

### SkillExecutor 执行模型

- [ ] Skill 执行时将 `prompt.md` + `examples/` 注入 PromptComposer 作为 additionalPromptParts
- [ ] 工具集按 `tools.yaml` 的 `allowed_tools` 裁剪，是主 agent 工具的子集
- [ ] Skill 要求的工具不在主 agent 工具集中时报错（不静默忽略）
- [ ] Skill 执行完成时记录 Trace 事件（skill id、version、token 消耗、工具调用次数、成功/失败）
- [ ] Skill 不启动独立 agent loop（与 Sub-agent 的本质区别）

### SkillValidator 校验

- [ ] 校验 `_index.md` frontmatter 格式（必填字段、类型）
- [ ] 校验 `tools.yaml` 中 `allowed_tools` 是否是已知工具
- [ ] 校验 `prompt.md` 内容不含 prompt injection 攻击模式
- [ `examples/` 总 token 数超过 `estimated_tokens * 0.5` 时发出 warning

### 内置 Skill

- [ ] 8 个内置 Skill 资源目录创建：code-review、doc-summarize、meeting-notes、prd-draft、spec-lint、changelog-writer、task-breakdown、daily-report
- [ ] 每个内置 Skill 包含完整的 `_index.md` + `prompt.md` + `tools.yaml`

### Slash Command 解析

- [ ] 用户输入以 `/` 开头时，SlashCommandParser 在发送到主循环前解析
- [ ] 支持多种参数风格：`/loop 任务描述`、`/loop "任务" max_steps=50`、`/loop task="任务" max_steps=50`
- [ ] 命令别名（aliases）被正确识别
- [ ] 未识别的 `/xxx` 按普通消息处理
- [ ] 命令需要参数但用户未提供时，显示参数输入表单

### Command 系统扩展

- [ ] `Command` interface 新增可选字段：`promptTemplate`、`params`、`isSlashCommand`
- [ ] Slash Command 的 prompt 以 `isMeta: true` 标记注入
- [ ] `/help` 动态合并 action commands 和 prompt commands
- [ ] 用户输入不完整的 `/compl` 时弹出自动补全建议

### 内置 Slash Command

- [ ] 8 个内置 Slash Command 创建：/clear、/compact、/loop、/review、/summarize、/plan、/mode、/help
- [ ] 每个 Command 以 Markdown 文件定义（含 frontmatter 参数声明 + prompt 模板）

### IPC 集成

- [ ] `ai:skill:get`、`ai:skill:create`、`ai:skill:validate`、`ai:skill:delete`、`ai:skill:export`、`ai:skill:import` 通道注册
- [ ] `command:parse-slash`、`command:create-slash`、`command:get-suggestions` 通道注册
- [ ] 现有 `ai:skill:list`、`ai:skill:search` 返回类型扩展为 `SkillV2[]`

### 向后兼容

- [ ] 现有 `Skill` type 保持不变，新增 `SkillV2` 扩展类型
- [ ] 现有 `Command` interface 新增字段全部可选
- [ ] v1 格式 Skill 继续正常加载和使用
- [ ] 现有 IPC 通道签名不变

## 技术执行路径

### 架构设计

```
Skill v2 + Slash Command 整体架构

sibylla-desktop/resources/skills/              ← 内置技能资源（v2 目录格式）
├── code-review/
│   ├── _index.md
│   ├── prompt.md
│   ├── tools.yaml
│   └── examples/
│       ├── example-01.md
│       └── example-02.md
├── doc-summarize/
├── meeting-notes/
├── prd-draft/
├── spec-lint/
├── changelog-writer/
├── task-breakdown/
└── daily-report/

sibylla-desktop/resources/slash-commands/      ← 内置 Slash Command 资源
├── clear.md
├── compact.md
├── loop.md
├── review.md
├── summarize.md
├── plan.md
├── mode.md
└── help.md

sibylla-desktop/src/main/services/
├── skill-system/                               ← 从 skill-engine.ts 演进
│   ├── SkillRegistry.ts                        ← 封装原 SkillEngine，扩展 v2 格式
│   ├── SkillLoader.ts                          ← v1 + v2 统一加载
│   ├── SkillExecutor.ts                        ← Skill 执行模型
│   ├── SkillValidator.ts                       ← 格式校验 + injection 扫描
│   └── types.ts                                ← SkillV2 / SkillTrigger / SkillToolsConfig
│
├── command/                                    ← 扩展现有目录
│   ├── command-registry.ts                     ← 已有，新增 slash 解析方法
│   ├── types.ts                                ← 已有，扩展 Command interface
│   ├── SlashCommandParser.ts                   ← 新增：/xxx [args] 解析
│   ├── SlashCommandLoader.ts                   ← 新增：从 Markdown 文件加载
│   └── builtin-commands/                       ← 已有，新增 slash command 类型

Skill 执行模型（与 Sub-agent 的区别）：

主 Agent 循环
│
├─ 识别 Skill 触发（trigger 匹配或显式调用）
│
├─ SkillExecutor.execute()
│   ├─ 加载 prompt.md + examples/
│   ├─ 注入到 PromptComposer 作为 additionalPromptParts
│   ├─ 工具集按 tools.yaml 裁剪
│   └─ 返回 composerOverride → 主循环继续
│
├─ 主循环按增强后的 context 继续运行
│   ├─ 模型调用（使用 Skill 的 prompt + 裁剪后的工具）
│   ├─ 工具调用（仅限 allowed_tools）
│   └─ 循环至任务完成
│
└─ Skill 结束，主 agent 恢复基线 prompt

Slash Command 执行模型：

用户输入 "/loop 修复所有错误"
│
├─ SlashCommandParser.parse()
│   ├─ 识别为 /loop 命令
│   ├─ 解析参数：task="修复所有错误"
│   └─ 返回 ParsedCommand
│
├─ 渲染 prompt 模板（变量替换）
│
├─ 作为 isMeta=true 的 user message 塞入主循环
│
└─ 主循环按常规流程运行（一次性注入）
```

### 步骤 1：定义 Skill v2 共享类型

**文件：** `src/shared/types.ts`（扩展）

1. 新增 SkillV2 接口（扩展现有 Skill）：
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
     budget?: {
       max_tokens: number
       max_tool_calls: number
     }
   }

   export interface SkillResult {
     success: boolean
     tokensUsed: number
     toolCallsCount: number
     errors: string[]
   }
   ```

2. 新增 Slash Command 相关类型：
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

3. 新增 IPC 通道常量：
   ```typescript
   // ai:skill:* 扩展
   'ai:skill:get': 'ai:skill:get',
   'ai:skill:create': 'ai:skill:create',
   'ai:skill:validate': 'ai:skill:validate',
   'ai:skill:delete': 'ai:skill:delete',
   'ai:skill:export': 'ai:skill:export',
   'ai:skill:import': 'ai:skill:import',
   'ai:skill:test-run': 'ai:skill:test-run',
   'ai:skill:edit': 'ai:skill:edit',
   // command:* 扩展
   'command:parse-slash': 'command:parse-slash',
   'command:create-slash': 'command:create-slash',
   'command:get-suggestions': 'command:get-suggestions',
   ```

**验证：** TypeScript 编译通过。

### 步骤 2：实现 SkillLoader

**文件：** `src/main/services/skill-system/SkillLoader.ts`

统一加载 v1（扁平 .md）和 v2（目录结构）格式。

1. 构造函数：
   ```typescript
   export class SkillLoader {
     constructor(
       private readonly fileManager: FileManager,
       private readonly tokenEstimator: (text: string) => number,
     ) {}
   ```

2. 实现 `async loadV1(filePath: string): Promise<SkillV2>`：
   - 复用现有 `SkillEngine.parseSkill()` 的解析逻辑
   - 将 v1 字段映射到 SkillV2：
     - `formatVersion: 1`
     - `version: '1.0.0'`、`author: ''`、`category: 'general'`、`tags: []`、`scope: 'public'`
     - `source` 根据路径判断（`skills/` → workspace, `resources/skills/` → builtin）
     - `triggers: []`、`allowedTools: undefined`

3. 实现 `async loadV2(dirPath: string, source: 'builtin' | 'workspace' | 'personal'): Promise<SkillV2>`：
   - 读取 `_index.md`，解析 YAML frontmatter
   - 读取 `prompt.md` 作为 instructions
   - 读取 `tools.yaml`（如存在），解析为 SkillToolsConfig
   - 扫描 `examples/` 目录（如存在），加载所有 `.md` 文件
   - 验证必填字段
   - 组装 SkillV2 对象

4. 实现 `async loadFromDir(dirPath: string, source: 'builtin' | 'workspace' | 'personal'): Promise<SkillV2[]>`：
   - 扫描目录下所有子目录（v2 格式）和 `.md` 文件（v1 格式）
   - 对子目录调用 `loadV2()`
   - 对 `.md` 文件调用 `loadV1()`
   - 跳过 `_index.md`（不属于 v1 格式）
   - 收集错误但不中断（failed skills 记录 warning）

5. 实现 `isV2Directory(dirPath: string): Promise<boolean>`：
   - 检查目录下是否存在 `_index.md`

**验证：**
- v1 格式 `skills/code-review.md` 正确解析为 SkillV2（formatVersion=1）
- v2 格式 `skills/code-review/_index.md` + `prompt.md` 正确解析（formatVersion=2）
- 缺少必填字段的 Skill 被跳过并 warning

### 步骤 3：实现 SkillRegistry

**文件：** `src/main/services/skill-system/SkillRegistry.ts`

封装现有 SkillEngine，扩展三源注册和触发器匹配。

1. 内部数据结构：
   ```typescript
   private skills = new Map<string, SkillV2>()
   private triggerIndex = new Map<string, SkillV2>()  // slash/mention → skill
   private legacyEngine: SkillEngine                   // 现有 v1 引擎，保持向后兼容
   ```

2. 构造函数：
   ```typescript
   constructor(
     private readonly loader: SkillLoader,
     private readonly fileManager: FileManager,
     private readonly currentUser?: string,           // 用于个人空间隔离
   ) {
     this.legacyEngine = new SkillEngine(fileManager)
   }
   ```

3. 实现 `async discoverAll(): Promise<SkillV2[]>`：
   - 初始化 legacy SkillEngine（向后兼容）
   - 扫描内置：`resources/skills/` → `loader.loadFromDir(path, 'builtin')`
   - 扫描工作区：`.sibylla/skills/` → `loader.loadFromDir(path, 'workspace')`
   - 扫描工作区 legacy：`skills/` → `loader.loadFromDir(path, 'workspace')`（v1 格式）
   - 扫描个人：`personal/{user}/skills/` → `loader.loadFromDir(path, 'personal')`
   - 按 "个人 > 工作区 > 内置" 去重（后覆盖前）
   - 构建 triggerIndex

4. 实现 `get(id: string): SkillV2 | undefined`

5. 实现 `getAll(): SkillV2[]`

6. 实现 `search(query: string, limit?: number): SkillV2[]`：
   - 先尝试 triggerIndex 精确匹配
   - 再 fallback 到模糊搜索（id/name/description/tags）

7. 实现 `resolveByTrigger(input: string): SkillV2 | null`：
   - 检查 input 是否匹配任何 Skill 的 trigger（slash command / mention / pattern）

8. 实现 `getAvailableInMode(mode: string): SkillV2[]`：
   - 过滤 `loadableIn.modes` 包含当前 mode 的 Skill

9. 实现 `getLegacySkill(id: string): Skill | undefined`：
   - 委托到 legacy SkillEngine.getSkill()

10. 实现 `handleFileChange(event: FileChangeEvent): void`：
    - 委托到 legacy SkillEngine（保持文件监听）
    - 对 v2 目录的变更触发重新加载

**验证：**
- 三源注册正确，优先级正确
- 个人空间 Skill 被其他用户加载时拒绝
- trigger 匹配正确
- 现有 v1 Skill 功能不受影响

### 步骤 4：实现 SkillExecutor

**文件：** `src/main/services/skill-system/SkillExecutor.ts`

Skill 执行的核心——将 Skill 的 prompt 注入主循环，而非启动独立 agent。

1. 构造函数：
   ```typescript
   export class SkillExecutor {
     constructor(
       private readonly promptComposer: PromptComposer,
       private readonly tracer?: Tracer,
     ) {}
   ```

2. 定义 SkillExecutionContext：
   ```typescript
   export interface SkillExecutionContext {
     skill: SkillV2
     userInput: string
     parentTraceId: string
     onSkillEnd?: () => void
   }
   ```

3. 实现 `async execute(ctx: SkillExecutionContext): Promise<SkillResult>`：
   ```
   a. 加载 Skill 全部资源
      - prompt.md 的内容
      - examples/ 下所有 .md 文件的内容
      - tools.yaml 的 allowed_tools 和 budget

   b. 构建 composerOverride：
      {
        additionalPromptParts: [prompt, ...examples],
        toolFilter: allowed_tools,
        budget: toolsYaml.budget
      }

   c. 返回 SkillExecutionPlan（包含 composerOverride）
      - 调用方（主循环）负责应用 override 到 PromptComposer
      - SkillExecutor 不直接运行主循环

   d. 记录 Trace：
      - skill.invocation span（含 skillId、version、tokens）
   ```

4. 关键设计决策：
   - SkillExecutor 返回的是 `SkillExecutionPlan`（含 composerOverride），不是直接执行结果
   - 主循环接收 plan 后，将其注入到 PromptComposer，然后继续常规循环
   - Skill 结束时（主循环检测到任务完成），主 agent 恢复基线 prompt

5. 实现 `async loadSkillResources(skill: SkillV2): Promise<SkillResources>`：
   - 加载 prompt.md、examples/、tools.yaml
   - 对 examples 按 token 预算裁剪（超过 estimated_tokens * 0.5 时选最相关的 2-3 个）

**验证：**
- 返回 SkillExecutionPlan 包含正确的 prompt 和工具过滤
- examples 裁剪正确
- Trace 事件记录

### 步骤 5：实现 SkillValidator

**文件：** `src/main/services/skill-system/SkillValidator.ts`

1. 实现 `validateMetadata(frontmatter: Record<string, unknown>): ValidationResult`：
   - 检查必填字段：id、version、name、description
   - 检查字段类型：id (string)、version (semver string)、tags (string[])
   - 检查 scope 枚举值

2. 实现 `validateToolsConfig(toolsYaml: unknown, knownTools: string[]): ValidationResult`：
   - 检查 allowed_tools 中的工具是否在 knownTools 中
   - 检查 budget.max_tokens 为正整数

3. 实现 `scanForInjection(content: string): InjectionWarning[]`：
   - 简单的关键词 + 模式匹配
   - 检测 "忽略前面的指令" 等常见 injection 模式
   - 检测超长重复字符
   - 返回 warning 级别（不阻止加载，仅警告）

4. 实现 `validateSkillDir(dirPath: string, knownTools: string[]): Promise<ValidationResult>`：
   - 综合校验：metadata + tools + prompt injection

**验证：**
- 必填字段缺失报错
- prompt injection 模式检测
- 未知工具 warning

### 步骤 6：扩展 Command 系统与 SlashCommandParser

**文件：** `src/main/services/command/types.ts`（扩展）

1. 扩展 Command 接口：
   ```typescript
   export interface Command {
     // ... 现有字段不变 ...
     /** Prompt template for slash commands (injected into conversation) */
     promptTemplate?: string
     /** Parameter definitions for slash commands */
     params?: CommandParam[]
     /** Whether this is a /xxx triggered command */
     isSlashCommand?: boolean
     /** Aliases for slash command matching */
     aliases?: string[]
   }
   ```

**文件：** `src/main/services/command/SlashCommandParser.ts`（新建）

2. SlashCommandParser 类：
   ```typescript
   export class SlashCommandParser {
     constructor(private readonly registry: CommandRegistry) {}
   ```

3. 实现 `parse(input: string): ParsedCommand | null`：
   - 非 `/` 开头返回 null
   - tokenize：`/loop 修复所有错误 max_steps=50`
     → tokens: ['loop', '修复所有错误', 'max_steps=50']
   - 从 registry 查找 command：`resolveBySlash(tokens[0])`
   - 绑定参数：按 command.params 定义解析剩余 tokens
     - 位置参数：第一个未命名的值赋给第一个 required string param
     - 命名参数：`max_steps=50` → `{ max_steps: 50 }`
     - 引号包裹：`"修复所有错误"` 作为单个参数值
   - 返回 ParsedCommand

4. 实现 `getSuggestions(partial: string): CommandSuggestion[]`：
   - 输入 `/compl` 时，返回所有以 `compl` 开头的 slash command
   - 匹配 id、aliases
   - 返回 CommandSuggestion[]（含 matchType）

**文件：** `src/main/services/command/command-registry.ts`（扩展）

5. 新增 `resolveBySlash(prefix: string): Command | undefined`：
   - 查找 id === prefix 或 aliases 包含 prefix 的 command
   - 仅查找 isSlashCommand === true 的命令

6. 新增 `getSlashCommands(): Command[]`：
   - 返回所有 isSlashCommand === true 的命令

**文件：** `src/main/services/command/SlashCommandLoader.ts`（新建）

7. 从 Markdown 文件加载 Slash Command：
   - 解析 YAML frontmatter（id、params、aliases、examples 等）
   - body 作为 promptTemplate
   - 注册到 CommandRegistry

**验证：**
- `/loop 修复所有错误` 正确解析
- `/compl` 返回 compact 相关建议
- 别名 `/continue` 映射到 `/loop`
- 未识别的 `/xxx` 返回 null

### 步骤 7：创建内置 Skill 和 Slash Command 资源文件

**目录：** `sibylla-desktop/resources/skills/`

1. 创建 8 个内置 Skill 目录。每个包含：

   **code-review/**（代码审查）：
   - `_index.md`：id=code-review, category=development, triggers=[{slash: /review}], loadable_in.modes=[review, analyze]
   - `prompt.md`：代码审查的 system prompt 片段（检查风格、逻辑、错误处理、性能、测试）
   - `tools.yaml`：allowed_tools=[read-file, search, list-files]（只读）
   - `examples/`：2 个示例（Python 代码审查、TypeScript 代码审查）

   **doc-summarize/**（文档摘要）：
   - `tools.yaml`：allowed_tools=[read-file, search, list-files]

   **meeting-notes/**（会议纪要）：
   - `tools.yaml`：allowed_tools=[read-file, write-file]

   **prd-draft/**（PRD 起草）：
   - `tools.yaml`：allowed_tools=[read-file, write-file, search, list-files]

   **spec-lint/**（Spec 规范检查）：
   - `tools.yaml`：allowed_tools=[read-file, search]（只读）

   **changelog-writer/**（变更日志）：
   - `tools.yaml`：allowed_tools=[read-file, write-file, search, list-files]

   **task-breakdown/**（任务拆解）：
   - `tools.yaml`：allowed_tools=[read-file, search, list-files]（只读）

   **daily-report/**（日报生成）：
   - `tools.yaml`：allowed_tools=[read-file, search, list-files]

**目录：** `sibylla-desktop/resources/slash-commands/`

2. 创建 8 个内置 Slash Command 文件：

   **loop.md**：
   ```markdown
   ---
   id: loop
   version: 1.0.0
   name: 持续执行
   aliases: ["/continue", "/go"]
   params:
     - name: task
       type: string
       required: true
     - name: max_steps
       type: integer
       default: 20
   ---

   你现在进入持续执行模式。规则：
   1. 继续工作，不需要每步批准。
   2. 若需要用户决策才能继续，暂停并明确询问。
   3. 最大步骤数：{{params.max_steps}}。
   4. 任务完成时输出完成摘要。
   本次任务：{{params.task}}
   ```

   **clear.md**：清空对话（触发 PreCompaction hook）
   **compact.md**：立即触发压缩
   **review.md**：审查指定目标（委托 pr-reviewer sub-agent）
   **summarize.md**：摘要目标（调用 doc-summarize skill）
   **plan.md**：切换到 Plan 模式
   **mode.md**：切换模式
   **help.md**：显示所有可用命令

**验证：** 所有资源文件格式正确，可被 SkillLoader / SlashCommandLoader 正确加载

### 步骤 8：IPC 扩展与主进程装配

**文件：** `src/main/ipc/handlers/ai.handler.ts`（扩展 skill 相关 IPC）

1. 扩展 `ai:skill:list` handler：
   - 现有：返回 `SkillSummary[]`
   - 扩展：返回 `SkillV2[]`（通过 SkillRegistry.getAll()）

2. 扩展 `ai:skill:search` handler：
   - 委托到 `SkillRegistry.search(query, limit)`

3. 新增 `ai:skill:get` handler：
   - 参数：`skillId: string`
   - 返回 `SkillV2 | null`

4. 新增 `ai:skill:create` handler：
   - 参数：`template: SkillTemplate`
   - 创建 v2 目录结构到 `.sibylla/skills/`
   - 返回 `{ skillId: string; path: string }`

5. 新增 `ai:skill:validate` handler：
   - 参数：`skillId: string`
   - 调用 SkillValidator
   - 返回 `ValidationResult`

6. 新增 `ai:skill:delete` handler：
   - 参数：`skillId: string`
   - 二次确认
   - 删除 skill 目录

7. 新增 `ai:skill:export` handler：
   - 打包 skill 目录为 `.sibylla-skill`（tar.gz）
   - 返回 `{ bundlePath: string }`

8. 新增 `ai:skill:import` handler：
   - 解压 `.sibylla-skill` 到 `.sibylla/skills/`
   - 扫描内容标记潜在风险
   - 返回 `{ skillId: string }`

**文件：** `src/main/ipc/handlers/command.ts`（扩展）

9. 新增 `command:parse-slash` handler：
   - 参数：`input: string`
   - 调用 SlashCommandParser.parse()
   - 返回 `ParsedCommand | null`

10. 新增 `command:create-slash` handler：
    - 参数：`template: SlashCommandTemplate`
    - 创建 .md 文件到 `.sibylla/slash-commands/`
    - 注册到 CommandRegistry

11. 新增 `command:get-suggestions` handler：
    - 参数：`partial: string`
    - 调用 SlashCommandParser.getSuggestions()
    - 返回 `CommandSuggestion[]`

**文件：** 主进程初始化入口

12. 装配顺序：
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

**验证：** IPC 通道全部注册，可通过 DevTools 调用

### 步骤 9：单元测试

**文件：** `tests/main/services/skill-system/` 和 `tests/main/services/command/`

1. `skill-loader.test.ts` 测试用例：
   - v1 格式加载（扁平 .md，复用 SkillEngine 解析逻辑）
   - v2 格式加载（目录结构 _index.md + prompt.md + tools.yaml + examples）
   - 缺少必填字段时跳过并 warning
   - tools.yaml 不存在时 allowedTools 为 undefined
   - examples 目录为空时不报错

2. `skill-registry.test.ts` 测试用例：
   - 三源注册：内置、工作区、个人
   - 优先级：个人 > 工作区 > 内置，同 id 后者覆盖前者
   - 个人空间 Skill 被其他用户加载时拒绝
   - trigger 匹配：slash / mention / pattern
   - getAvailableInMode 过滤正确
   - search 模糊搜索正确
   - 现有 v1 Skill 功能不受影响（回归）

3. `skill-executor.test.ts` 测试用例：
   - 返回 SkillExecutionPlan 包含正确的 additionalPromptParts
   - 工具过滤正确
   - examples 裁剪：超过 estimated_tokens * 0.5 时只保留 2-3 个
   - Trace 事件记录

4. `skill-validator.test.ts` 测试用例：
   - 必填字段缺失报错
   - 未知工具 warning
   - prompt injection 模式检测
   - 格式正确时返回 valid

5. `slash-command-parser.test.ts` 测试用例：
   - `/loop 修复所有错误` → { commandId: 'loop', params: { task: '修复所有错误' } }
   - `/loop task="修复" max_steps=50` → 命名参数
   - `/compl` → getSuggestions 返回 compact 相关
   - 别名 `/continue` 映射到 `/loop`
   - `/unknown` → 返回 null
   - 非 `/` 开头 → 返回 null

6. `slash-command-loader.test.ts` 测试用例：
   - 从 Markdown 文件加载 promptTemplate 和 params
   - 注册到 CommandRegistry
   - aliases 正确注册

7. `command-registry-slash.test.ts` 测试用例：
   - resolveBySlash() 正确查找
   - getSlashCommands() 返回所有 slash command
   - 现有 action commands 不受影响

**覆盖率目标：** ≥ 80%（P0 要求）

## 现有代码基础

| 已有模块 | 文件路径 | 行数 | 本任务使用方式 |
|---------|---------|------|-------------|
| SkillEngine | `skill-engine.ts` | 236 | 封装为 SkillRegistry 内部 legacy 引擎，不修改 |
| Skill type | `shared/types.ts:1418` | 11 | 扩展为 SkillV2，原 type 保留 |
| CommandRegistry | `command/command-registry.ts` | 156 | 扩展 slash 解析方法 |
| Command type | `command/types.ts` | 20 | 新增可选字段 |
| PromptComposer | `context-engine/PromptComposer.ts` | — | Skill prompt 注入目标 |
| ContextEngine | `context-engine/` | — | Skill 作为 context layer 注入 |
| FileManager | `file-manager.ts` | — | Skill 文件读写 |

**完全缺失、需新建的模块：**

| 模块 | 说明 |
|------|------|
| `skill-system/SkillRegistry.ts` | 三源 Skill 注册 |
| `skill-system/SkillLoader.ts` | v1 + v2 统一加载 |
| `skill-system/SkillExecutor.ts` | Skill 执行模型 |
| `skill-system/SkillValidator.ts` | 格式校验 + injection 扫描 |
| `skill-system/types.ts` | SkillV2 等内部类型 |
| `command/SlashCommandParser.ts` | /xxx 解析 |
| `command/SlashCommandLoader.ts` | Markdown 文件加载 |
| `resources/skills/`（8 目录） | 内置 Skill 资源 |
| `resources/slash-commands/`（8 文件） | 内置 Slash Command 资源 |

## 新增 IPC 通道

| IPC 通道 | 方向 | 说明 |
|---------|------|------|
| `ai:skill:get` | Renderer → Main | 获取 Skill 详情 |
| `ai:skill:create` | Renderer → Main | 创建自定义 Skill |
| `ai:skill:edit` | Renderer → Main | 编辑 Skill |
| `ai:skill:validate` | Renderer → Main | 校验 Skill 格式 |
| `ai:skill:delete` | Renderer → Main | 删除 Skill |
| `ai:skill:export` | Renderer → Main | 导出 Skill |
| `ai:skill:import` | Renderer → Main | 导入 Skill |
| `ai:skill:test-run` | Renderer → Main | 测试运行 Skill |
| `command:parse-slash` | Renderer → Main | 解析 Slash Command |
| `command:create-slash` | Renderer → Main | 创建自定义 Slash Command |
| `command:get-suggestions` | Renderer → Main | 获取自动补全建议 |

## 涉及的现有文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `shared/types.ts` | 扩展 | 新增 SkillV2、SkillTrigger、CommandParam、ParsedCommand 等类型 |
| `command/types.ts` | 扩展 | Command interface 新增 3 个可选字段 |
| `command/command-registry.ts` | 扩展 | 新增 resolveBySlash / getSlashCommands 方法 |
| `ipc/handlers/ai.handler.ts` | 扩展 | 扩展 skill IPC，新增 7 个 handler |
| `preload/index.ts` | 扩展 | 新增 skill 和 slash command 命名空间 |
| `skill-engine.ts` | 保留 | 不修改，被 SkillRegistry 封装引用 |
