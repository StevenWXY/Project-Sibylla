# Sprint 3.5 — AI 能力扩展体系

**架构设计文档与需求规格说明书**

文档版本：v1.0 · 发布日期：2026-04-19 · 文档状态：正式版

---

## 第零章 阅读指引

本文档分为三大部分：

- **第一部分（第一章至第四章）**：架构设计总述。解释 Sprint 3.5 的定位、四层扩展模型、核心子系统的设计思路。
- **第二部分（第五章至第十一章）**：需求规格说明。10 个需求的详细规格，含用户故事、EARS 验收标准、TypeScript 技术接口。
- **第三部分（第十二章至第十六章）**：工程实施。目录结构、数据模型、集成方案、风险缓解、验收清单。

阅读建议：产品与设计优先读第一、三部分；工程实施优先读第二、三部分；AI 在参与任何子系统开发时需加载本文档对应章节。

---

## 第一章 Sprint 定位与目标

### 1.1 在 Phase 1 中的定位

Sprint 3.5 是 **Phase 1 AI 能力线的收官 Sprint**，完成前置 Sprint 3.0 至 3.4 所建立的"单智能体 + harness + 记忆 + trace + 模式 + plan"基线之上的扩展能力建设。

```
Phase 1 AI 能力线
│
├── Sprint 3.0 - AI 对话基线（单对话、工具调用）
├── Sprint 3.1 - Harness（Guardrail + Evaluator）
├── Sprint 3.2 - 三层记忆系统
├── Sprint 3.3 - Trace 可观测性
├── Sprint 3.4 - 模式与 Plan 产物
└── Sprint 3.5 - AI 能力扩展体系  ← 本 Sprint
```

本 Sprint 完成后，Phase 1 AI 能力线形成完整闭环：
> 对话 → 护栏 → 记忆 → 观测 → 模式 → 扩展

### 1.2 核心目标

**使命陈述**：让每个团队能够在 Sibylla 中沉淀属于自己的 AI 能力资产。

具体目标：

1. **建立 Prompt 工程基础设施**：把散落在代码里的字符串 prompt 迁移到文件化、分层化、用户可覆盖的 Prompt 库。
2. **提供四层扩展能力**：Slash Command（轻量）→ Skill（能力包）→ Sub-agent（子智能体）→ Workflow（自动化）。
3. **对齐 Claude Code 架构哲学**：Harness 不让 AI 变聪明，Harness 给 AI 手、眼、工作区。扩展能力 = 扩展工具集与上下文，而非增加流程复杂度。
4. **补齐错误恢复路径**：补齐 Sprint 3.2 缺失的 Reactive Compact 层，形成完整的 5 层上下文降级链。
5. **保持非技术用户友好**：所有扩展能力对非技术用户隐藏在命令面板与技能市场之后，不冲击主界面。

### 1.3 非目标（明确不做）

以下内容在 Sprint 3.5 **明确不做**，避免范围蔓延：

- **不做图形化 Workflow 编辑器**：Workflow 使用声明式 YAML，不做类似 n8n 的拖拽画布（违反非技术用户友好原则，且维护成本过高）。
- **不做 Agent 间的 P2P 通信**：Sub-agent 只与主 agent 通信，不做 Agent-to-Agent 网络（CLAUDE.md 第三章"Git 托管双模式"的边界，云端不介入 agent 协议）。
- **不做 MCP Server 集成**：MCP 作为外部协议留到 Phase 2。当前 Skill 与 Sub-agent 通过内部工具接口对接。
- **不做 Skill 市场的社区上传**：市场只做本地浏览和团队内共享，公共市场留给后续阶段。
- **不做 prompt 的自动生成**：Prompt 仍由人编写，但提供模板、lint、评估工具辅助。

### 1.4 与 CLAUDE.md 的对齐

本 Sprint 所有设计严格遵循 CLAUDE.md 五大设计哲学：

| 哲学 | 本 Sprint 的体现 |
|---|---|
| 文件即真相 | 所有 prompt、skill、agent、workflow 定义均为 Markdown/YAML，Git 版本化 |
| AI 建议，人类决策 | Sub-agent 写入仍走 canUseTool 审批；Workflow 执行步骤遇到写操作需用户确认 |
| Git 不可见 | UI 层使用"技能""指令""智能体""自动化"等自然语言，不暴露 Git 术语 |
| 文件级协作 | Skill 目录、Agent 文件、Workflow 文件均为文件粒度，不做实时协同编辑 |
| 记忆即演化 | Sub-agent 默认不共享主 agent 的 MEMORY.md；Skill 使用经验写入精选记忆 |

---

## 第二章 顶层架构设计

### 2.1 四层扩展能力模型

Sprint 3.5 按"轻 → 重"提供四层扩展能力。每一层都是上层的基础，但用户可以只使用轻量层而不触碰重量层。

```
┌───────────────────────────────────────────────────────────┐
│  第 4 层：Workflow（自动化编排）                             │
│  - YAML 声明式定义                                          │
│  - 事件触发（文件变化/定时/手动）                            │
│  - 串联 Skill 与 Sub-agent                                  │
├───────────────────────────────────────────────────────────┤
│  第 3 层：Sub-agent（子智能体）                              │
│  - 独立 prompt / 独立循环 / 独立状态                          │
│  - 继承权限边界                                              │
│  - 返回结构化结果                                             │
├───────────────────────────────────────────────────────────┤
│  第 2 层：Skill（能力包）                                    │
│  - Markdown 定义的可复用能力                                  │
│  - 按需加载（不占用基线 context）                             │
│  - 可绑定工具子集                                             │
├───────────────────────────────────────────────────────────┤
│  第 1 层：Slash Command（即时指令）                           │
│  - 用户输入 /xxx 触发                                         │
│  - 参数替换 + 预置 prompt 片段                                │
│  - 零状态、零副作用（默认）                                    │
├───────────────────────────────────────────────────────────┤
│  基础层：Prompt 库（所有上层的公共资源）                        │
│  - core / modes / tools / agents / hooks / contexts         │
│  - 内置 + 用户覆盖双源                                         │
│  - PromptComposer 按需组合                                    │
└───────────────────────────────────────────────────────────┘
```

### 2.2 四层能力的选择准则

给用户（与未来文档）一个清晰的选择指南：

| 场景 | 推荐层 | 原因 |
|---|---|---|
| "每次让 AI 写周报都要复制同一段 prompt" | Slash Command | 零状态，一次性转换 |
| "团队对代码审查有固定的 7 项检查清单" | Skill | 可复用，可绑定工具，可沉淀示例 |
| "我想让另一个 AI 专门审查，不要污染主对话" | Sub-agent | 独立循环，结果汇总回主对话 |
| "每当有新 PRD 被创建时，自动走审查 → 摘要 → 通知流程" | Workflow | 事件触发，多步编排 |

### 2.3 Harness 与扩展能力的关系

Sprint 3.1 建立的 Harness（Guardrail + Evaluator）在 Sprint 3.5 扩展为更细粒度的 Hook 节点。Harness 是"护栏"，Hook 是"护栏上的观察点和干预点"。

```
主循环（Main Agent Loop）
│
├─▶ [Hook: PreUserMessage]      用户消息进入前
├─▶ [Hook: PreSystemPrompt]     组装 system prompt 前
├─▶ [Hook: PreToolUse] ────────▶ Guardrail 判断 + 用户审批（已有）
├─▶ [Hook: PostToolUse]         工具返回后，Evaluator 评估
├─▶ [Hook: PreCompaction]       压缩触发前
├─▶ [Hook: PostCompaction]      压缩完成后
├─▶ [Hook: StopCheck]           模型说停止时
└─▶ [Hook: PostMessage]         assistant 消息完整后
```

每个 Hook 节点：
- 可由 Sibylla 内置实现（Guardrail / Evaluator / 记忆更新等）
- 可由用户自定义实现（文件形式，类似 Skill）
- 可被 Workflow 中的步骤触发
- 所有 Hook 执行产生 Trace（Sprint 3.3 体系内）

### 2.4 主 Agent 与 Sub-agent 的消息流

Sub-agent 的启动通过一个特殊工具 `spawnSubAgent` 进行，类似 Claude Code 的 `Task` 工具：

```
主 Agent                           Sub-agent（独立循环）
│                                   │
│ tool_use: spawnSubAgent           │
│   agentId: "pr-reviewer"          │
│   task: "审查 PR-123"            │
│   ──────────────────────────────▶│
│                                   │ 加载 agent prompt
│                                   │ 独立 query loop
│                                   │   ├── model call
│                                   │   ├── tool_use（受限集）
│                                   │   └── 循环至 completed
│                                   │ 
│                                   │ 整理结构化结果
│ tool_result: {                   ◀│
│   success: true,                  │
│   findings: [...],                │
│   summary: "..."                  │
│ }                                 │
│                                   ▼
│ 继续主循环
```

关键设计决策：

1. **Sub-agent 使用独立 Context**：不继承主 agent 的对话历史，避免污染。
2. **Sub-agent 有独立 MEMORY 视角**：可选择是否加载主 agent 的精选记忆。默认不加载。
3. **Sub-agent 权限是主 agent 权限的子集**：通过 `allowedTools` 白名单裁剪。不能提权。
4. **Sub-agent 返回结构化摘要**：不返回完整对话，只返回模式化的结果（findings、summary、errors）。
5. **Sub-agent 的 Trace 嵌套于主 Trace**：通过 `parent_trace_id` 建立父子关系，Sprint 3.3 的 Trace Viewer 支持展开/折叠。

### 2.5 Workflow 与扩展能力的编排语义

Workflow 是"声明式 YAML + 运行时执行器"的组合。运行时执行器消费 YAML，按步骤调用 Skill、Sub-agent 或内置动作。

核心语义：
- **顺序执行**：默认步骤串行
- **条件分支**：`when` 表达式，基于前置步骤输出
- **失败处理**：`on_failure` 指定跳过/停止/降级动作
- **变量传递**：每个步骤的输出写入 `${{ steps.xxx }}` 命名空间
- **无循环**：**刻意不支持 for/while** —— 循环交给主 agent 在 Plan 模式里编排，避免 Workflow 变成小型编程语言

### 2.6 PromptComposer 的核心作用

PromptComposer 是整个 Sprint 3.5 的**基础设施中枢**。所有 AI 调用都通过它组装 system prompt。

```
PromptComposer.compose({
  mode: 'plan',
  tools: [...],
  currentAgent: 'pr-reviewer',
  userPreferences: {...},
  workspaceInfo: {...}
})

│
├─▶ 1. 加载 core/identity.md      （永远加载）
├─▶ 2. 加载 core/principles.md    （永远加载）
├─▶ 3. 加载 core/tone.md          （永远加载）
├─▶ 4. 加载 modes/plan.md         （按 mode 加载）
├─▶ 5. 加载 tools/*.md            （按 tools 加载，仅对启用的工具）
├─▶ 6. 加载 agents/pr-reviewer.md （子 agent 时加载）
├─▶ 7. 渲染 contexts/*.md         （动态注入）
│
└─▶ 返回组装完成的 SystemPrompt + 溯源元信息（用于 Trace）
```

每个 prompt 片段都携带 `source`（builtin / user-override）与 `version`，随 Trace 记录，保障可审计与可回滚。

---

## 第三章 目录结构规划

### 3.1 应用资源目录（只读，随版本分发）

```
sibylla-desktop/resources/prompts/
├── index.yaml                      # Prompt 索引与元数据
├── core/
│   ├── identity.md                 # Sibylla AI 身份与使命
│   ├── principles.md               # 不可妥协原则（文件即真相等）
│   └── tone.md                     # 基础语气
├── modes/
│   ├── free.md                     # 自由模式
│   ├── plan.md                     # Plan 模式（Sprint 3.4 迁入）
│   ├── analyze.md                  # 分析模式
│   ├── review.md                   # 审查模式
│   └── write.md                    # 写作模式
├── tools/
│   ├── read-file.md
│   ├── write-file.md
│   ├── edit-file.md
│   ├── search.md
│   ├── list-files.md
│   ├── spawn-subagent.md
│   └── run-skill.md
├── agents/
│   ├── pr-reviewer.md              # 内置 Sub-agent 定义
│   ├── doc-summarizer.md
│   ├── meeting-note-writer.md
│   ├── spec-reviewer.md
│   └── memory-curator.md
├── hooks/
│   ├── pre-tool-use.md
│   ├── post-tool-use.md
│   ├── stop-check.md
│   ├── pre-compaction.md
│   └── post-compaction.md
├── optimizers/
│   ├── prompt-optimizer.md         # Sprint 3.4 的优化器迁入
│   ├── memory-curator.md           # Sprint 3.2 的精选器迁入
│   └── summarizer.md
└── contexts/
    ├── workspace-context.md         # 工作区信息模板
    ├── user-profile.md              # 用户偏好模板
    ├── time-context.md              # 时间上下文模板
    └── mode-history.md              # 最近模式切换历史模板

sibylla-desktop/resources/skills/      # 内置技能
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

sibylla-desktop/resources/slash-commands/    # 内置指令
├── clear.md
├── compact.md
├── loop.md
├── review.md
├── summarize.md
├── plan.md
├── mode.md
└── help.md

sibylla-desktop/resources/workflows/        # 内置工作流模板
├── prd-review-flow.yaml
├── daily-summary-flow.yaml
└── spec-publish-flow.yaml
```

### 3.2 工作区目录（用户可编辑，Git 版本化）

```
{workspace}/.sibylla/
├── prompts-local/                  # 用户覆盖的 prompt（同 resources/prompts 结构）
│   ├── core/
│   ├── modes/
│   └── ...
├── skills/                         # 用户自建技能
│   └── {skill-name}/
│       ├── _index.md
│       ├── prompt.md
│       ├── tools.yaml
│       └── examples/
├── agents/                         # 用户自建子智能体
│   └── {agent-name}.md
├── slash-commands/                 # 用户自建指令
│   └── {command-name}.md
├── workflows/                      # 用户自建工作流
│   └── {workflow-name}.yaml
└── hooks/                          # 用户自定义 hook
    └── {hook-name}.md

{workspace}/.sibylla/memory/        # 沿用 Sprint 3.2
├── daily/
├── archives/
└── workflow-runs/                  # 新增：workflow 运行记录
    └── YYYY-MM-DD/
        └── {run-id}.json
```

### 3.3 代码模块目录

```
sibylla-desktop/src/main/            # Electron 主进程
├── prompt-library/
│   ├── PromptComposer.ts
│   ├── PromptLoader.ts
│   ├── PromptRegistry.ts
│   └── templates/                  # 内部模板渲染工具
├── skill-system/
│   ├── SkillRegistry.ts
│   ├── SkillExecutor.ts
│   ├── SkillLoader.ts
│   └── SkillValidator.ts
├── slash-command/
│   ├── SlashCommandRegistry.ts
│   ├── SlashCommandParser.ts
│   └── SlashCommandExecutor.ts
├── sub-agent/
│   ├── SubAgentRegistry.ts
│   ├── SubAgentExecutor.ts
│   ├── SubAgentContext.ts
│   └── spawnSubAgentTool.ts
├── workflow/
│   ├── WorkflowRegistry.ts
│   ├── WorkflowExecutor.ts
│   ├── WorkflowParser.ts
│   ├── WorkflowScheduler.ts        # 定时/文件触发
│   └── steps/
│       ├── SkillStep.ts
│       ├── SubAgentStep.ts
│       ├── ConditionStep.ts
│       └── NotifyStep.ts
├── hooks/
│   ├── HookRegistry.ts
│   ├── HookExecutor.ts
│   └── built-in/
│       ├── guardrailHook.ts         # Sprint 3.1 迁入
│       ├── evaluatorHook.ts         # Sprint 3.1 迁入
│       └── memoryWriterHook.ts      # Sprint 3.2 迁入
└── compact/
    ├── reactiveCompact.ts           # 新增
    ├── microcompact.ts              # Sprint 3.2 已有
    ├── snipCompact.ts               # 新增
    └── CompactOrchestrator.ts       # 新增，统一调度

sibylla-desktop/src/renderer/        # 渲染进程
├── features/
│   ├── command-palette/             # Sprint 3.4 基础扩展
│   ├── skill-library/               # 新增：技能库面板
│   ├── agent-library/               # 新增：智能体管理
│   ├── workflow-library/            # 新增：工作流管理
│   └── prompt-library/              # 新增：Prompt 库浏览（只读视图）
└── components/
    ├── SkillCard.tsx
    ├── AgentCard.tsx
    ├── WorkflowCard.tsx
    └── SubAgentTraceView.tsx
```

---

## 第四章 核心子系统详细设计

### 4.1 Prompt 库与 PromptComposer

#### 4.1.1 Prompt 文件格式

所有 prompt 文件使用 Markdown + YAML frontmatter：

```markdown
---
id: modes.plan
version: 1.2.0
scope: mode
model_hint: claude-sonnet-4.5
estimated_tokens: 480
last_evaluated: 2026-04-15
performance_score: 0.87
tags: [planning, structured]
---

# Plan 模式

你现在进入 Plan 模式。在此模式下：

1. **只规划，不执行**：列出完成任务所需的步骤，不进行实际写入。
2. **结构化输出**：使用 Markdown 分级标题和列表呈现计划。
3. **预估资源**：每个步骤估算所需时间和潜在风险。

...
```

Frontmatter 字段说明：

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | 是 | Prompt 唯一标识，点号分隔 |
| `version` | 是 | 语义化版本 |
| `scope` | 是 | 作用域：core/mode/tool/agent/hook/context/optimizer |
| `model_hint` | 否 | 推荐模型（用于 PromptComposer 做 token 预算） |
| `estimated_tokens` | 否 | 估算 token 数，由 lint 工具填写 |
| `last_evaluated` | 否 | 上次性能评估日期 |
| `performance_score` | 否 | 历史 Trace 综合得分（0-1） |
| `tags` | 否 | 检索标签 |
| `requires` | 否 | 依赖的其他 prompt id 数组 |
| `conflicts` | 否 | 互斥的 prompt id 数组（组合时警告） |

#### 4.1.2 PromptComposer 核心接口

```typescript
// src/main/prompt-library/PromptComposer.ts

export interface ComposeContext {
  mode: ModeId                          // 当前模式
  tools: ToolMetadata[]                 // 启用的工具
  currentAgent?: AgentId                // 当前 Sub-agent（如在子循环中）
  userPreferences: UserProfile
  workspaceInfo: WorkspaceContext
  maxTokens?: number                    // Token 预算上限
  includeHooks?: HookId[]               // 需要注入的 hook prompt
}

export interface ComposedPrompt {
  text: string                          // 最终拼接的 prompt 文本
  parts: PromptPart[]                   // 组成部分（溯源用）
  estimatedTokens: number
  version: string                        // 组合签名，用于缓存
  warnings: string[]                    // 冲突/过长等警告
}

export interface PromptPart {
  id: string
  source: 'builtin' | 'user-override'
  path: string
  version: string
  tokens: number
  renderedAt: number                    // 渲染时间（ms）
}

export class PromptComposer {
  constructor(
    private loader: PromptLoader,
    private registry: PromptRegistry,
    private tokenCounter: TokenCounter
  ) {}

  async compose(context: ComposeContext): Promise<ComposedPrompt> {
    const parts: PromptPart[] = []
    const warnings: string[] = []

    // 1. Core（不可跳过）
    parts.push(await this.loadPart('core.identity'))
    parts.push(await this.loadPart('core.principles'))
    parts.push(await this.loadPart('core.tone'))

    // 2. Mode
    parts.push(await this.loadPart(`modes.${context.mode}`))

    // 3. Tools（按启用的工具加载）
    for (const tool of context.tools) {
      const part = await this.loadPartSafe(`tools.${tool.id}`)
      if (part) parts.push(part)
    }

    // 4. Sub-agent（如适用）
    if (context.currentAgent) {
      parts.push(await this.loadPart(`agents.${context.currentAgent}`))
    }

    // 5. Hooks（按请求注入）
    for (const hookId of context.includeHooks ?? []) {
      const part = await this.loadPartSafe(`hooks.${hookId}`)
      if (part) parts.push(part)
    }

    // 6. Contexts（动态渲染模板）
    parts.push(await this.renderPart('contexts.workspace-context', context.workspaceInfo))
    parts.push(await this.renderPart('contexts.user-profile', context.userPreferences))
    parts.push(await this.renderPart('contexts.time-context', { now: new Date() }))

    // 7. 冲突检测
    this.detectConflicts(parts, warnings)

    // 8. Token 预算检查
    const total = parts.reduce((s, p) => s + p.tokens, 0)
    if (context.maxTokens && total > context.maxTokens) {
      warnings.push(`prompt-total-${total}-exceeds-budget-${context.maxTokens}`)
    }

    return {
      text: this.join(parts),
      parts,
      estimatedTokens: total,
      version: this.signature(parts),
      warnings
    }
  }

  private async loadPart(id: string): Promise<PromptPart> {
    // 优先用户覆盖，回落内置
    const userPath = this.loader.resolveUserPath(id)
    const builtinPath = this.loader.resolveBuiltinPath(id)

    if (await fileExists(userPath)) {
      return this.loader.load(userPath, 'user-override')
    }
    return this.loader.load(builtinPath, 'builtin')
  }
  
  private detectConflicts(parts: PromptPart[], warnings: string[]): void {
    // 通过 frontmatter 的 conflicts 字段交叉检查
  }
  
  private signature(parts: PromptPart[]): string {
    // 基于 id + version 生成稳定的组合签名，用于缓存 Key
  }
}
```

#### 4.1.3 模板渲染语法

`contexts/*.md` 支持 Mustache 风格插值：

```markdown
<!-- contexts/workspace-context.md -->
---
id: contexts.workspace-context
scope: context
---

当前工作区信息：
- 名称：{{workspace.name}}
- 根路径：{{workspace.rootPath}}
- 成员：{{#workspace.members}}{{name}}({{role}}){{^last}}, {{/last}}{{/workspace.members}}
- 当前文件数：{{workspace.fileCount}}
```

**刻意约束**：模板仅支持插值与条件渲染，**不支持 JavaScript 表达式**。避免 prompt 文件变成代码。

#### 4.1.4 用户覆盖机制

用户修改 prompt 的唯一路径是创建覆盖文件：

```bash
# 用户想自定义 Plan 模式
{workspace}/.sibylla/prompts-local/modes/plan.md  ← 优先级高
sibylla-desktop/resources/prompts/modes/plan.md   ← 内置
```

UI 提供"从内置派生"按钮，复制内置 prompt 到用户目录，避免用户从零开始。

---

### 4.2 Skill 系统

#### 4.2.1 Skill 目录规范

```
{skills-dir}/{skill-name}/
├── _index.md           # 必填。元数据 + 描述
├── prompt.md           # 必填。Skill 的 system prompt 片段
├── tools.yaml          # 选填。需要的工具白名单
├── examples/           # 选填。Few-shot 示例
│   ├── example-01.md
│   └── example-02.md
└── assets/             # 选填。参考资料、模板等
```

`_index.md` 示例：

```markdown
---
id: code-review
version: 1.0.0
name: 代码审查
description: 按团队规范审查代码变更
author: Sibylla Built-in
category: development
tags: [code, review, quality]
scope: public           # public / private / personal
triggers:               # 触发方式
  - slash: /review
  - mention: "审查这个"
loadable_in:
  modes: [review, analyze]
  agents: [pr-reviewer]
estimated_tokens: 850
---

# 代码审查技能

本技能提供结构化的代码审查能力。

## 能力范围
- 检查代码风格
- 识别潜在 bug
- 建议性能优化

## 不适用场景
- 不做安全漏洞扫描（请用 security-audit 技能）
- 不做架构评审（请用 architecture-review 技能）
```

`tools.yaml` 示例：

```yaml
# 本 Skill 需要的工具白名单（是主 agent 工具的子集）
allowed_tools:
  - read-file
  - search
  - list-files
  # 不包含 write-file / edit-file - 本技能只读
  
required_context:
  - workspace.fileTree
  - workspace.recentChanges
  
budget:
  max_tokens: 8000       # 本技能单次调用的最大 token 预算
  max_tool_calls: 20
```

#### 4.2.2 Skill 注册与加载

```typescript
// src/main/skill-system/SkillRegistry.ts

export interface SkillMetadata {
  id: string
  version: string
  name: string
  description: string
  author: string
  category: string
  tags: string[]
  scope: 'public' | 'private' | 'personal'
  source: 'builtin' | 'workspace' | 'personal'
  triggers: SkillTrigger[]
  loadableIn: { modes?: ModeId[]; agents?: AgentId[] }
  estimatedTokens: number
  path: string                          // Skill 目录绝对路径
}

export class SkillRegistry {
  private skills = new Map<string, SkillMetadata>()

  async discoverAll(): Promise<SkillMetadata[]> {
    const results: SkillMetadata[] = []
    
    // 1. 扫描内置
    results.push(...await this.scanDir(BUILTIN_SKILLS_DIR, 'builtin'))
    
    // 2. 扫描工作区共享
    results.push(...await this.scanDir(workspaceSkillsDir(), 'workspace'))
    
    // 3. 扫描用户个人（受 CLAUDE.md 个人空间规则约束）
    if (userHasPersonalSpace()) {
      results.push(...await this.scanDir(personalSkillsDir(), 'personal'))
    }
    
    // 4. 注册（后扫描的覆盖先扫描的同 id）
    for (const skill of results) {
      this.skills.set(skill.id, skill)
    }
    
    return results
  }
  
  resolveByTrigger(input: string): SkillMetadata | null {
    // 根据用户输入匹配触发器
  }
  
  getAvailableInMode(mode: ModeId): SkillMetadata[] {
    return [...this.skills.values()].filter(s =>
      !s.loadableIn.modes || s.loadableIn.modes.includes(mode)
    )
  }
}
```

#### 4.2.3 Skill 执行模型

Skill 的执行通过 **系统级"提示注入"** 而非独立 agent 实现。核心思路：

1. 主 agent 的主循环识别 skill 触发
2. PromptComposer 把该 skill 的 `prompt.md` + `examples/` 注入当前 system prompt
3. 工具集按 `tools.yaml` 的 `allowed_tools` 裁剪
4. 主循环继续运行，直到该 skill 的任务完成
5. Skill 结束后，主 agent 的 system prompt 恢复到基线

```typescript
// src/main/skill-system/SkillExecutor.ts

export interface SkillExecutionContext {
  skill: SkillMetadata
  userInput: string
  parentTraceId: string
  onSkillEnd?: () => void
}

export class SkillExecutor {
  async execute(ctx: SkillExecutionContext): Promise<SkillResult> {
    // 1. 加载 skill 全部资源
    const resources = await this.loadSkillResources(ctx.skill)
    
    // 2. 生成临时的 PromptComposer context override
    const composerOverride = {
      additionalPromptParts: [
        resources.prompt,
        ...resources.examples
      ],
      toolFilter: resources.toolsYaml?.allowed_tools,
      budget: resources.toolsYaml?.budget
    }
    
    // 3. 发送给主循环（作为一个"增强上下文"的 user message）
    const result = await this.mainLoop.invokeWithSkillContext({
      userInput: ctx.userInput,
      skillId: ctx.skill.id,
      composerOverride,
      parentTraceId: ctx.parentTraceId
    })
    
    // 4. 记录到 Trace（Sprint 3.3 体系）
    await recordSkillInvocation({
      skillId: ctx.skill.id,
      skillVersion: ctx.skill.version,
      parentTraceId: ctx.parentTraceId,
      tokens: result.usage.totalTokens,
      success: result.success
    })
    
    return result
  }
}
```

**关键设计决策**：Skill 不启动独立 agent loop。这是与 Sub-agent 的本质区别。Skill 是"能力注入"，Sub-agent 是"能力外包"。

#### 4.2.4 内置 Skill 清单（Sprint 3.5 随版本分发）

| Skill ID | 名称 | 用途 |
|---|---|---|
| `code-review` | 代码审查 | 按规范审查代码 |
| `doc-summarize` | 文档摘要 | 生成 Markdown 文档摘要 |
| `meeting-notes` | 会议纪要 | 从录音/纪要草稿生成结构化纪要 |
| `prd-draft` | PRD 起草 | 按模板起草产品需求文档 |
| `spec-lint` | Spec 规范检查 | 检查 spec 文件格式与完整性 |
| `changelog-writer` | 变更日志 | 基于近期文件变化撰写 changelog |
| `task-breakdown` | 任务拆解 | 把一个目标拆解为可执行步骤 |
| `daily-report` | 日报生成 | 基于 daily 目录生成工作日报 |

---

### 4.3 Slash Command 系统

#### 4.3.1 Slash Command 文件格式

```markdown
---
id: loop
version: 1.0.0
name: 持续执行
description: 让 AI 持续工作直到任务完成或需要用户决策
aliases: ["/continue", "/go"]
scope: public
params:
  - name: task
    type: string
    required: true
    description: 要持续执行的任务
  - name: max_steps
    type: integer
    required: false
    default: 20
    description: 最大步骤数
examples:
  - input: "/loop 修复所有 TypeScript 错误"
  - input: "/loop 补全所有缺失的测试用例 max_steps=50"
---

你现在进入持续执行模式。规则：

1. 继续工作，不需要我每步批准。
2. 每完成一步，在内部记录进度。
3. 若需要用户决策才能继续，**暂停并明确询问**。
4. 若遇到不可逆操作（删除、重命名、写入外部资源），**暂停并请求确认**。
5. 最大步骤数：{{params.max_steps}}，超出时暂停汇报。
6. 任务完成时，输出：已全部完成 + 完成摘要。

本次任务：
{{params.task}}
```

#### 4.3.2 Slash Command 注册与解析

```typescript
// src/main/slash-command/SlashCommandParser.ts

export interface ParsedCommand {
  commandId: string
  commandVersion: string
  params: Record<string, unknown>
  rawInput: string
}

export class SlashCommandParser {
  parse(input: string): ParsedCommand | null {
    if (!input.startsWith('/')) return null
    
    // 支持多种参数风格:
    // /loop 修复所有错误                          → task=修复所有错误
    // /loop "修复所有错误" max_steps=50            → 显式参数
    // /loop task="修复所有错误" max_steps=50      → 命名参数
    
    const tokens = this.tokenize(input)
    const cmd = this.registry.resolve(tokens[0])
    if (!cmd) return null
    
    const params = this.bindParams(cmd.params, tokens.slice(1))
    
    return {
      commandId: cmd.id,
      commandVersion: cmd.version,
      params,
      rawInput: input
    }
  }
}
```

#### 4.3.3 Slash Command 执行流程

```
用户输入 "/loop 修复所有错误"
  ↓
SlashCommandParser.parse()
  ↓
SlashCommandExecutor.execute()
  ├─ 1. 渲染 prompt（变量替换）
  ├─ 2. 作为 isMeta=true 的 user message 塞入主循环
  ├─ 3. 主循环按常规流程跑
  └─ 4. Trace 标记 command.source = "slash-command"
```

关键差别：Slash Command 的 prompt 是**一次性注入**，不影响后续 user message；与 Skill（按需加载注入）和 Sub-agent（独立循环）有本质不同。

#### 4.3.4 内置 Slash Command 清单

| Command | 用途 | 特殊行为 |
|---|---|---|
| `/clear` | 清空当前对话 | 触发 PreCompaction hook 后清空 |
| `/compact` | 立即触发压缩 | 手动触发 autocompact |
| `/loop` | 持续执行 | 见 4.3.1 |
| `/review <target>` | 审查指定目标 | 等价于启动 pr-reviewer sub-agent |
| `/summarize <target>` | 摘要目标 | 调用 doc-summarize skill |
| `/plan` | 切换到 Plan 模式 | 等价于 Sprint 3.4 的模式切换 |
| `/mode <name>` | 切换模式 | 同上 |
| `/help` | 显示所有可用命令 | 动态扫描注册表 |

---

### 4.4 Sub-agent 系统

#### 4.4.1 Sub-agent 定义格式

```markdown
---
id: pr-reviewer
version: 1.0.0
name: PR 审查员
description: 专门审查 Pull Request 的子智能体
model: claude-sonnet-4.5            # 可与主 agent 不同
allowed_tools:                      # 白名单
  - read-file
  - search
  - list-files
  - grep
context:
  inherit_memory: false             # 是否继承主 agent 的 MEMORY.md
  inherit_trace: true               # 是否在主 Trace 下嵌套
  inherit_workspace_boundary: true  # 必须 true，不可跨边界
max_turns: 15
max_tokens: 50000
output_schema:                      # 结构化输出约束
  type: object
  required: [summary, findings]
  properties:
    summary:
      type: string
      description: 总体审查结论（1-3 段）
    findings:
      type: array
      items:
        type: object
        required: [severity, file, line, message]
        properties:
          severity:
            enum: [critical, major, minor, info]
          file: string
          line: integer
          message: string
---

# PR 审查员

你是一位专业、严格、友善的代码审查员。

## 审查流程

1. **读取变更**：使用 `read-file` 读取被审查的文件
2. **对比基线**：理解本次变更相对于基线的差异
3. **结构化检查**：按以下清单逐项检查

   - [ ] 代码风格：缩进、命名、注释
   - [ ] 逻辑正确性：边界条件、空值处理
   - [ ] 错误处理：异常捕获、错误传播
   - [ ] 性能：明显的 O(n²) 或不必要的循环
   - [ ] 测试：是否有对应的测试用例

4. **输出结构化结果**：按 output_schema 返回

## 审查原则

- 优先指出 critical 和 major 问题
- minor 和 info 只在有明确改进空间时提出
- 避免主观偏好，聚焦可验证的技术问题
- 使用建设性语言，避免批判性表达
```

#### 4.4.2 spawnSubAgent 工具规范

```typescript
// src/main/sub-agent/spawnSubAgentTool.ts

export const spawnSubAgentTool = defineTool({
  name: 'spawnSubAgent',
  description: '启动一个子智能体处理特定任务。子智能体拥有独立的对话上下文和工具权限，不污染当前对话。',
  
  parameters: {
    type: 'object',
    required: ['agentId', 'task'],
    properties: {
      agentId: {
        type: 'string',
        description: '子智能体 ID（如 pr-reviewer）'
      },
      task: {
        type: 'string',
        description: '委派给子智能体的任务描述'
      },
      params: {
        type: 'object',
        description: '子智能体的自定义参数（可选）'
      },
      timeout: {
        type: 'integer',
        description: '超时时间（秒），默认 600',
        default: 600
      }
    }
  },
  
  async execute({ agentId, task, params, timeout }, ctx) {
    // 1. 验证 agent 存在
    const agent = await ctx.subAgentRegistry.get(agentId)
    if (!agent) {
      return { success: false, error: `未找到智能体：${agentId}` }
    }
    
    // 2. 验证权限边界
    const grantedTools = intersect(
      ctx.parentAgent.allowedTools,
      agent.allowedTools
    )
    if (grantedTools.length < agent.allowedTools.length) {
      logWarning('sub-agent permissions intersected with parent')
    }
    
    // 3. 启动子循环
    const subExecutor = new SubAgentExecutor({
      agent,
      task,
      params,
      parentTraceId: ctx.traceId,
      allowedTools: grantedTools,
      timeout: timeout * 1000
    })
    
    const result = await subExecutor.run()
    
    // 4. 返回结构化结果
    return {
      success: result.success,
      structuredOutput: result.structuredOutput,  // 符合 output_schema
      summary: result.summary,
      turnsUsed: result.turnsUsed,
      tokensUsed: result.tokensUsed,
      traceId: result.traceId,                    // 子 Trace ID（用户可展开查看）
      errors: result.errors
    }
  }
})
```

#### 4.4.3 Sub-agent 执行隔离

Sub-agent 的独立性通过以下几个维度保障：

1. **独立 Context**：新的 QueryEngine 实例，新的 messages 数组
2. **独立 Memory**：默认不加载主 agent 的 `MEMORY.md`（除非 `inherit_memory: true`）
3. **独立 FileStateCache**：重新建立文件读取缓存（不继承），避免误用过时快照
4. **独立 Abort 控制**：主 agent 取消不会立即杀死子 agent（子 agent 有独立 timeout）
5. **独立 Usage 记账**：token 与成本单独记录，汇总到主 agent 的 result

**权限边界硬性约束**：

- Sub-agent 的 `allowedTools` 必须是主 agent 的子集
- Sub-agent 不能访问主 agent 工作区之外的目录
- Sub-agent 的个人空间隔离规则与主 agent 相同
- Sub-agent 的写操作仍走 Guardrail 审批（即使 Sub-agent 定义里声明了 allow）

#### 4.4.4 结构化输出约束（JSON Schema）

Sub-agent 的 `output_schema` 字段使用 JSON Schema 子集，强制模型返回结构化结果：

```typescript
// src/main/sub-agent/SubAgentExecutor.ts

async function extractStructuredOutput(
  messages: Message[],
  schema: JsonSchema
): Promise<StructuredOutput> {
  // 1. 优先从最后一条 assistant 消息解析代码块
  const lastAssistant = findLastAssistant(messages)
  const jsonBlock = extractJsonCodeBlock(lastAssistant)
  
  // 2. Schema 校验
  const validation = validateJsonSchema(jsonBlock, schema)
  if (validation.valid) return jsonBlock
  
  // 3. 验证失败 → 追加一轮让模型修正
  const retry = await queryModel({
    messages: [...messages, createMetaMessage(
      `上次输出不符合 schema：${validation.errors.join(', ')}。请重新输出，严格遵循 schema。`
    )],
    maxRetries: 2
  })
  
  return retry.structuredOutput
}
```

#### 4.4.5 内置 Sub-agent 清单

| Agent ID | 名称 | 核心能力 |
|---|---|---|
| `pr-reviewer` | PR 审查员 | 代码审查，结构化 findings |
| `doc-summarizer` | 文档摘要员 | 长文档 → 层次化摘要 |
| `meeting-note-writer` | 会议纪要员 | 录音/草稿 → 结构化纪要 |
| `spec-reviewer` | 规范审查员 | 检查 spec 完整性与一致性 |
| `memory-curator` | 记忆精选员 | Sprint 3.2 的精选器，此处独立化 |

---

### 4.5 Workflow 系统

#### 4.5.1 Workflow YAML 规范

```yaml
# .sibylla/workflows/prd-review-flow.yaml
id: prd-review-flow
version: 1.0.0
name: PRD 审查流程
description: 新 PRD 文档的自动审查与摘要
scope: public

# 触发器
triggers:
  - type: file_created
    pattern: "specs/prds/**/*.md"
  - type: manual
    name: 手动审查

# 输入参数
params:
  - name: file_path
    type: string
    required: true
  - name: strictness
    type: string
    enum: [loose, medium, strict]
    default: medium

# 执行步骤
steps:
  - id: format_check
    name: 检查文档格式
    skill: spec-lint
    input:
      target: ${{ params.file_path }}
    on_failure: stop
    
  - id: content_review
    name: 内容审查
    sub_agent: spec-reviewer
    input:
      file: ${{ params.file_path }}
      strictness: ${{ params.strictness }}
    on_failure: continue
    timeout: 300
    
  - id: generate_summary
    name: 生成摘要
    skill: doc-summarize
    input:
      target: ${{ params.file_path }}
    save_output_to: ${{ params.file_path }}.summary.md
    requires_user_confirm: true   # 写入前需用户确认（CLAUDE.md 对齐）
    
  - id: notify_team
    name: 通知团队
    when: ${{ steps.content_review.structuredOutput.findings.length > 0 }}
    action: internal_notification
    input:
      title: "PRD 需要审查：${{ params.file_path }}"
      body: ${{ steps.content_review.structuredOutput.summary }}
      channel: workspace

# 失败策略
on_workflow_failure:
  notify_user: true
  rollback: false   # Workflow 不自动回滚（遵循 CLAUDE.md 不可逆操作审批原则）
```

#### 4.5.2 执行器架构

```typescript
// src/main/workflow/WorkflowExecutor.ts

export interface WorkflowRunContext {
  workflow: WorkflowDefinition
  params: Record<string, unknown>
  runId: string
  parentTraceId: string
  userConfirmationHandler: (step: WorkflowStep) => Promise<boolean>
}

export interface WorkflowRunResult {
  runId: string
  status: 'completed' | 'failed' | 'cancelled' | 'partial'
  steps: Record<string, StepResult>
  startedAt: number
  endedAt: number
  errors: WorkflowError[]
}

export class WorkflowExecutor {
  async run(ctx: WorkflowRunContext): Promise<WorkflowRunResult> {
    const result: WorkflowRunResult = this.initResult(ctx)
    
    // 持久化 run 记录（用于中断恢复）
    await this.persistRun(result)
    
    for (const step of ctx.workflow.steps) {
      // 1. 评估 when 条件
      if (step.when && !this.evaluate(step.when, result.steps)) {
        result.steps[step.id] = { status: 'skipped' }
        continue
      }
      
      // 2. 如需用户确认，暂停等待
      if (step.requires_user_confirm) {
        const confirmed = await ctx.userConfirmationHandler(step)
        if (!confirmed) {
          result.steps[step.id] = { status: 'user-cancelled' }
          return this.finalize(result, 'cancelled')
        }
      }
      
      // 3. 执行步骤
      try {
        const stepResult = await this.executeStep(step, result.steps, ctx)
        result.steps[step.id] = stepResult
        await this.persistRun(result)   // 每步持久化
      } catch (err) {
        result.steps[step.id] = { status: 'failed', error: err.message }
        
        if (step.on_failure === 'stop') {
          return this.finalize(result, 'failed')
        }
        // on_failure === 'continue' → 继续下一步
      }
    }
    
    return this.finalize(result, 'completed')
  }
  
  private async executeStep(
    step: WorkflowStep,
    previousSteps: Record<string, StepResult>,
    ctx: WorkflowRunContext
  ): Promise<StepResult> {
    const input = this.renderTemplate(step.input, {
      params: ctx.params,
      steps: previousSteps
    })
    
    switch (step.type) {
      case 'skill':
        return await this.skillExecutor.execute({ skillId: step.skill, input })
      case 'sub_agent':
        return await this.subAgentExecutor.execute({ agentId: step.sub_agent, task: input })
      case 'condition':
        return { status: 'completed', output: this.evaluate(step.expression, previousSteps) }
      case 'notify':
        return await this.notifier.send(input)
      default:
        throw new Error(`未知步骤类型：${step.type}`)
    }
  }
}
```

#### 4.5.3 触发器

```typescript
// src/main/workflow/WorkflowScheduler.ts

export class WorkflowScheduler {
  // 1. 文件变化触发
  async watchFileTriggers(): Promise<void> {
    const watchers = new Map<string, FSWatcher>()
    
    for (const workflow of await this.registry.all()) {
      for (const trigger of workflow.triggers) {
        if (trigger.type === 'file_created' || trigger.type === 'file_changed') {
          this.setupFileWatcher(workflow, trigger, watchers)
        }
      }
    }
  }
  
  // 2. 定时触发
  async scheduleCronTriggers(): Promise<void> {
    for (const workflow of await this.registry.all()) {
      for (const trigger of workflow.triggers) {
        if (trigger.type === 'schedule') {
          this.cron.schedule(trigger.cron, () => this.trigger(workflow, trigger))
        }
      }
    }
  }
  
  // 3. 手动触发（来自 UI）
  async triggerManual(workflowId: string, params: Record<string, unknown>): Promise<string> {
    const workflow = await this.registry.get(workflowId)
    return await this.executor.run({ workflow, params, runId: uuid(), /* ... */ })
  }
}
```

#### 4.5.4 用户确认集成

Workflow 执行到 `requires_user_confirm: true` 的步骤时，UI 弹出确认面板，展示：
- 当前步骤信息
- 即将执行的操作（diff 预览，如有）
- 前置步骤的产出（供用户判断）
- 确认 / 跳过 / 取消 Workflow 三个选项

这是 CLAUDE.md 第二章"AI 建议，人类决策"在 Workflow 场景的具体落地。

---

### 4.6 Hook 系统

#### 4.6.1 Hook 定义

Hook 是在主循环特定点触发的可插拔函数。分为内置 Hook（TypeScript）和用户 Hook（Markdown 声明 + 模型评估）。

**内置 Hook**（TypeScript 实现，编译时绑定）：

```typescript
// src/main/hooks/built-in/guardrailHook.ts

export const guardrailHook: Hook = {
  id: 'builtin.guardrail',
  nodes: ['PreToolUse'],
  priority: 1000,   // 高优先级，必须最先执行
  
  async execute(ctx: HookContext): Promise<HookResult> {
    const { tool, input } = ctx.trigger
    
    // Sprint 3.1 Guardrail 逻辑迁入
    const assessment = await assessToolRisk(tool, input, ctx.agentState)
    
    if (assessment.needsUserApproval) {
      const approved = await ctx.userApprovalHandler(assessment)
      if (!approved) {
        return {
          decision: 'block',
          reason: 'user-denied',
          message: '用户拒绝了此操作'
        }
      }
    }
    
    return { decision: 'allow' }
  }
}
```

**用户 Hook**（Markdown 声明）：

```markdown
---
id: my-custom-hook
version: 1.0.0
nodes: [PostToolUse]
priority: 500
condition: tool.name == "write-file" and tool.input.path.endsWith(".md")
---

# 写入 Markdown 后的元数据更新提醒

在每次写入 .md 文件后，检查：

1. 文件 frontmatter 是否有 `updated_at` 字段
2. 若有，是否为当前时间
3. 若缺失或过时，提示用户更新

如果检测到问题，返回 `{ decision: "warn", message: "..." }`。
否则返回 `{ decision: "allow" }`。
```

用户 Hook 通过在主循环中启动一次小型 AI 调用（使用便宜模型如 Haiku）来评估。结果影响主循环的继续。

#### 4.6.2 Hook 节点与执行顺序

```typescript
// src/main/hooks/HookRegistry.ts

export type HookNode = 
  | 'PreUserMessage'
  | 'PreSystemPrompt'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PreCompaction'
  | 'PostCompaction'
  | 'StopCheck'
  | 'PostMessage'

export interface HookResult {
  decision: 'allow' | 'block' | 'warn' | 'modify'
  reason?: string
  message?: string
  modifications?: ContextModifications
}

export class HookExecutor {
  async executeNode(
    node: HookNode,
    ctx: HookContext
  ): Promise<HookResult[]> {
    const hooks = this.registry.getByNode(node)
      .sort((a, b) => b.priority - a.priority)   // 高优先级先执行
    
    const results: HookResult[] = []
    for (const hook of hooks) {
      const result = await this.runWithTimeout(hook, ctx, 5000)
      results.push(result)
      
      if (result.decision === 'block') {
        break   // 一旦 block，后续 hook 不执行
      }
      
      if (result.modifications) {
        ctx = this.applyModifications(ctx, result.modifications)
      }
    }
    
    return results
  }
}
```

#### 4.6.3 Hook Trace 集成

每个 Hook 的执行产生 Trace 事件：

```json
{
  "type": "hook_executed",
  "node": "PreToolUse",
  "hook_id": "builtin.guardrail",
  "duration_ms": 42,
  "result": {
    "decision": "allow"
  },
  "parent_trace_id": "main-trace-xxx"
}
```

Sprint 3.3 的 Trace Viewer 显示完整的 Hook 执行链。

---

### 4.7 Reactive Compact（错误恢复）

#### 4.7.1 五层上下文降级链

参考 Claude Code 的架构，Sprint 3.5 补齐完整降级链：

```
触发顺序（从轻到重）：
1. snipCompact     - 剪掉单条过大的工具结果
2. microcompact    - 局部段落压缩
3. contextCollapse - 把分散的相关段落折叠为摘要
4. autoCompact     - 主动汇总整段历史
5. reactiveCompact - 被动触发：API 返回 413 / max_output_tokens 时的兜底
```

当前 Sprint 3.2 已实现前 4 层。Sprint 3.5 补齐 reactiveCompact。

#### 4.7.2 reactiveCompact 触发条件

```typescript
// src/main/compact/reactiveCompact.ts

export interface ReactiveCompactTrigger {
  type: 'prompt_too_long' | 'max_output_tokens' | 'media_size'
  error: APIError
  messagesAtFailure: Message[]
}

export class ReactiveCompact {
  async tryRecover(trigger: ReactiveCompactTrigger): Promise<RecoveryResult> {
    switch (trigger.type) {
      case 'prompt_too_long':
        return await this.handlePromptTooLong(trigger)
      case 'max_output_tokens':
        return await this.handleMaxOutputTokens(trigger)
      case 'media_size':
        return await this.handleMediaSize(trigger)
    }
  }
  
  private async handlePromptTooLong(t: ReactiveCompactTrigger): Promise<RecoveryResult> {
    // 1. 若此轮还没触发过 autoCompact → 强制 autoCompact
    if (!this.hasCompactedThisTurn()) {
      return await this.forceAutoCompact(t.messagesAtFailure)
    }
    
    // 2. 已经压缩过但还是太长 → 裁剪最早的 N 条保留核心
    return await this.aggressiveTruncate(t.messagesAtFailure)
  }
  
  private async handleMaxOutputTokens(t: ReactiveCompactTrigger): Promise<RecoveryResult> {
    // 参考 Claude Code query.ts 的 max_output_tokens 恢复逻辑
    // 1. 首次：提升 max_tokens 到 ESCALATED_MAX_TOKENS（如 64k）重试
    // 2. 第二次：注入"从上次中断处继续"的 meta 消息
    // 3. 第三次：放弃，返回错误给用户
  }
}
```

#### 4.7.3 用户可见性

按 CLAUDE.md 第六章"UI/UX 红线"，任何超过 2 秒的操作必须有进度反馈：

- reactiveCompact 触发时，对话区显示"正在整理上下文..."
- 恢复成功，提示"已自动整理，继续刚才的任务"
- 恢复失败，给出明确错误与用户可操作的选项（/clear 或 /compact 或重写问题）

---

## 第五章 需求规格说明（需求 3.5.1）

### 需求 3.5.1 — Prompt 库与 PromptComposer

#### 5.1.1 需求描述

建立统一的 Prompt 库基础设施，替换当前散落在代码中的字符串 prompt。提供分层加载、用户覆盖、动态渲染、冲突检测、Token 预算管理能力。

#### 5.1.2 用户故事

- **US-3.5.1.1**：作为非技术用户，当 AI 行为不符合我的偏好时，我希望能通过点击"定制"按钮派生一份本地的 prompt 副本并修改，而不需要理解 prompt 的内部结构。
- **US-3.5.1.2**：作为团队管理员，我希望团队的自定义 prompt 通过 Git 同步到所有成员，保持一致的 AI 行为。
- **US-3.5.1.3**：作为工程师，我希望能在 Trace 中看到本次对话使用了哪些 prompt 片段（内置还是用户覆盖、版本号），用于故障诊断。
- **US-3.5.1.4**：作为 Prompt 工程师，我希望 lint 工具能检查 prompt 的格式错误、token 超限、互斥组合。

#### 5.1.3 EARS 验收标准

- **UC-1**：当 PromptComposer 接收 compose 请求时，系统应加载 core/identity.md、core/principles.md、core/tone.md 这三个核心片段，且这些片段不可被用户覆盖移除（仅内容可覆盖）。
- **UC-2**：当存在 `{workspace}/.sibylla/prompts-local/{scope}/{id}.md` 覆盖文件时，系统应优先加载用户覆盖版本，并在 ComposedPrompt.parts 中标记 `source: 'user-override'`。
- **UC-3**：当 prompt 的 frontmatter 包含 `requires: [otherId]` 但 `otherId` 未被加载时，系统应抛出 `PromptDependencyError` 并中止组合。
- **UC-4**：当两个 prompt 在 frontmatter 中互为 `conflicts` 时，系统应在 warnings 中记录冲突，但不阻止组合（允许用户知情选择）。
- **UC-5**：当组合后的总 token 数超过 `ComposeContext.maxTokens` 时，系统应在 warnings 中记录超限信息，但不自动裁剪（裁剪策略属于调用方职责）。
- **UC-6**：当 prompt 文件的 frontmatter 格式错误时，系统应返回明确的错误信息（文件路径 + 行号 + 错误类型），不得静默跳过。
- **UC-7**：当相同 ComposeContext 在短时间内（<100ms）被请求两次时，系统应使用缓存返回（基于 signature），缓存命中率应有埋点。
- **UC-8**：当 Trace 记录一次 AI 调用时，应包含完整的 ComposedPrompt.parts 数组，可在 Trace Viewer 中展开查看每个 prompt 片段的来源与版本。

#### 5.1.4 技术接口

```typescript
// 主进程暴露的 IPC 通道
interface PromptLibraryIPC {
  'prompt-library:list-all': () => Promise<PromptMetadata[]>
  'prompt-library:read': (id: string) => Promise<PromptContent>
  'prompt-library:derive-user-copy': (id: string) => Promise<{ userPath: string }>
  'prompt-library:reset-user-override': (id: string) => Promise<void>
  'prompt-library:validate': (id: string, content: string) => Promise<ValidationResult>
  'prompt-library:estimate-tokens': (content: string) => Promise<number>
}
```

#### 5.1.5 依赖关系

- 依赖：Sprint 3.2 的 Token 计数器
- 被依赖：需求 3.5.2 至 3.5.10 全部

#### 5.1.6 风险

- **风险 R1**：用户修改了 core/principles.md 导致 AI 不再遵守"文件即真相"等核心原则。
- **缓解**：core 目录下的 prompt 即使用户覆盖也会强制合并内置的"不可移除条款"（通过 prompt 内部的 `<immutable>` 标记）。

---

### 需求 3.5.2 — Skill 系统

#### 5.2.1 需求描述

建立 Skill 作为可复用的 AI 能力单元。Skill 是"prompt + 工具白名单 + 示例"的组合，可由主 agent 按需加载，不占用基线上下文。

#### 5.2.2 用户故事

- **US-3.5.2.1**：作为产品经理，我希望建立一个"PRD 撰写"技能，每次起草 PRD 时自动加载团队的 PRD 模板与风格指南。
- **US-3.5.2.2**：作为开发者，我希望为"代码审查"技能添加团队特有的代码规范示例，而不必每次对话都复制粘贴。
- **US-3.5.2.3**：作为非技术用户，我希望在命令面板中搜索技能并启用，而不需要编辑任何文件。

#### 5.2.3 EARS 验收标准

- **UC-1**：当系统启动时，SkillRegistry 应扫描内置、工作区、个人三个目录，合并结果并以"个人 > 工作区 > 内置"的优先级去重。
- **UC-2**：当用户在命令面板输入触发关键词且匹配到 skill 的 triggers 时，系统应在对话区显示"即将启用技能：{skill_name}"的确认面板，用户确认后才加载。
- **UC-3**：当 skill 被加载时，其 `tools.yaml` 中的 `allowed_tools` 必须是主 agent 当前工具集的子集；若 skill 要求未启用的工具，应报错而非静默忽略。
- **UC-4**：当 skill 的 `_index.md` 缺少必填字段（id、version、name、description）时，SkillRegistry 应跳过该 skill 并在启动日志中记录 warning。
- **UC-5**：当 skill 执行完成时，系统应记录一条 Trace 事件，包含 skill id、version、token 消耗、工具调用次数、成功/失败。
- **UC-6**：当个人空间的 skill 被其他成员的主 agent 加载时，系统应拒绝加载并记录安全日志（CLAUDE.md 第七章个人空间隔离）。
- **UC-7**：当 skill 的 `examples/` 总 token 数超过 skill 的 `estimated_tokens * 0.5` 时，系统应只加载与用户当前任务语义最接近的 2-3 个示例（通过向量相似度）。
- **UC-8**：当 skill 定义中 `scope: team` 被设置但工作区尚未启用团队同步时，系统应 fallback 到 `scope: workspace` 并提示用户。

#### 5.2.4 技术接口

```typescript
// IPC
interface SkillSystemIPC {
  'skill:list': (filter?: SkillFilter) => Promise<SkillMetadata[]>
  'skill:create': (template: SkillTemplate) => Promise<{ skillId: string; path: string }>
  'skill:edit': (skillId: string) => Promise<{ path: string }>  // 返回路径供 IDE 打开
  'skill:validate': (skillId: string) => Promise<ValidationResult>
  'skill:test-run': (skillId: string, testInput: string) => Promise<SkillResult>
  'skill:delete': (skillId: string) => Promise<void>
  'skill:export': (skillId: string) => Promise<{ bundlePath: string }>  // 导出为 tar.gz
  'skill:import': (bundlePath: string, scope: SkillScope) => Promise<{ skillId: string }>
}
```

#### 5.2.5 依赖关系

- 依赖：需求 3.5.1（PromptComposer）、Sprint 3.3（Trace）、Sprint 3.1（工具集管理）
- 被依赖：需求 3.5.3（Slash Command 可调用 Skill）、需求 3.5.5（Workflow 可调用 Skill）

#### 5.2.6 风险

- **风险 R2**：用户创建的 skill 可能包含 prompt injection 攻击，把"忽略前面的指令"塞到示例里，污染主 agent。
- **缓解**：Skill 加载前对内容进行 prompt injection 扫描（简单的关键词 + 模式匹配），触发警告。

---

### 需求 3.5.3 — Slash Command 系统

#### 5.3.1 需求描述

提供轻量级的即时指令系统。用户通过 `/command [args]` 触发预置的 prompt 片段与参数绑定，实现一键转换常见任务。

#### 5.3.2 用户故事

- **US-3.5.3.1**：作为用户，我希望输入 `/summarize` 就能对当前选中的文档生成摘要，不需要每次重复描述"请为我摘要这份文档"。
- **US-3.5.3.2**：作为团队，我们希望统一的 `/daily-report` 指令生成日报，保证格式一致。
- **US-3.5.3.3**：作为进阶用户，我希望能创建自己的 `/review-spec` 指令，组合 spec-reviewer sub-agent 与特定的参数。

#### 5.3.3 EARS 验收标准

- **UC-1**：当用户输入以 `/` 开头的消息时，SlashCommandParser 应在发送到主循环前解析命令，若识别为已注册命令则执行，否则按普通消息处理。
- **UC-2**：当命令需要参数但用户未提供时，系统应在对话区显示参数输入表单，包含类型提示与默认值。
- **UC-3**：当命令的 `aliases` 被用户输入时，系统应识别并执行对应命令（支持命令别名）。
- **UC-4**：当命令执行时，其注入的 prompt 应以 `isMeta: true` 标记，以确保 Sprint 3.2 的记忆系统不会将其视为用户的原始意图。
- **UC-5**：当 `/help` 被调用时，系统应动态扫描注册表，按类别分组展示所有可用命令与描述。
- **UC-6**：当用户输入不完整的 `/compl` 时，UI 应弹出自动补全建议，展示所有以 `compl` 开头的命令。
- **UC-7**：当命令调用 skill 或 sub-agent 时，权限与记账应归属到该命令（而非直接的 skill/sub-agent），便于审计。

#### 5.3.4 技术接口

```typescript
interface SlashCommandIPC {
  'slash-command:list': () => Promise<SlashCommandMetadata[]>
  'slash-command:parse': (input: string) => Promise<ParsedCommand | null>
  'slash-command:create': (template: SlashCommandTemplate) => Promise<{ commandId: string }>
  'slash-command:get-suggestions': (partial: string) => Promise<SlashCommandSuggestion[]>
}
```

#### 5.3.5 依赖关系

- 依赖：需求 3.5.1（PromptComposer）
- 可选依赖：需求 3.5.2（调用 Skill）、需求 3.5.4（调用 Sub-agent）

#### 5.3.6 风险

- **风险 R3**：命令参数注入可能构造恶意 prompt（例如 `/summarize "ignore previous..."`）。
- **缓解**：参数值始终作为数据占位而非指令拼接；在 prompt 模板里用 `{{params.task}}` 插入时自动做文本转义。

---

### 需求 3.5.4 — Sub-agent 系统

#### 5.4.1 需求描述

提供独立循环的子智能体能力。Sub-agent 拥有独立的对话上下文、工具白名单、输出 schema，通过 `spawnSubAgent` 工具由主 agent 启动。

#### 5.4.2 用户故事

- **US-3.5.4.1**：作为用户，我希望让一个专门的 sub-agent 审查我的 PR，结果汇总回主对话，而不是让主对话变成审查报告。
- **US-3.5.4.2**：作为开发者，我希望 sub-agent 的输出是 JSON 结构化的，便于后续步骤程序化处理。
- **US-3.5.4.3**：作为用户，我希望能在 Trace 中清晰看到主 agent 调用了哪些 sub-agent、每个 sub-agent 内部发生了什么。

#### 5.4.3 EARS 验收标准

- **UC-1**：当 spawnSubAgent 工具被调用时，系统应创建一个独立的 QueryEngine 实例，包含独立的 messages、FileStateCache、Usage 记账。
- **UC-2**：当 sub-agent 的 `context.inherit_memory: false` 时，sub-agent 的 PromptComposer 不得加载主 agent 的 MEMORY.md。
- **UC-3**：当 sub-agent 试图使用未在 `allowed_tools` 中声明的工具时，系统应拒绝并在 sub-agent 内部返回权限错误（不影响主 agent）。
- **UC-4**：当 sub-agent 的执行超过 `max_turns` 或 `max_tokens` 时，系统应中止 sub-agent 并返回部分结果（包含已完成的推理）。
- **UC-5**：当 sub-agent 的 `output_schema` 被定义时，最终结果必须通过 JSON Schema 校验；校验失败应触发最多 2 次重试，仍失败则返回 `success: false`。
- **UC-6**：当 sub-agent 的 Trace 被记录时，应包含 `parent_trace_id`，Sprint 3.3 的 Trace Viewer 必须支持点击展开子 Trace。
- **UC-7**：当主 agent 被 abort 时，所有活跃的 sub-agent 应在 5 秒内优雅退出（不能强制杀死导致状态损坏）。
- **UC-8**：当 sub-agent 尝试访问个人空间 `personal/{name}/` 且 name 不等于当前用户时，系统应拒绝并记录安全日志。
- **UC-9**：当同一主 agent 已有 3 个活跃 sub-agent 时，第 4 个 spawnSubAgent 调用应排队等待，而不是无限并发（资源控制）。

#### 5.4.4 技术接口

```typescript
// 工具定义（暴露给主 agent 的模型）
interface SpawnSubAgentTool {
  name: 'spawnSubAgent'
  parameters: {
    agentId: string
    task: string
    params?: Record<string, unknown>
    timeout?: number
  }
  returns: SubAgentResult
}

// 主进程 IPC
interface SubAgentIPC {
  'sub-agent:list': () => Promise<SubAgentMetadata[]>
  'sub-agent:create': (template: SubAgentTemplate) => Promise<{ agentId: string }>
  'sub-agent:trace': (traceId: string) => Promise<SubAgentTrace>
}
```

#### 5.4.5 依赖关系

- 依赖：需求 3.5.1（PromptComposer）、Sprint 3.1（canUseTool 护栏）、Sprint 3.3（Trace）
- 被依赖：需求 3.5.5（Workflow 可调用 Sub-agent）

#### 5.4.6 风险

- **风险 R4**：Sub-agent 嵌套调用 Sub-agent 可能导致无限递归。
- **缓解**：Sub-agent 默认的 `allowed_tools` 不包含 `spawnSubAgent`；需要嵌套时必须显式声明，且总调用深度不超过 3 层。

- **风险 R5**：Sub-agent 的 output_schema 验证失败反复重试浪费 token。
- **缓解**：硬编码最多 2 次重试；失败后 graceful degradation 返回非结构化 summary。

---

### 需求 3.5.5 — Workflow 自动化

#### 5.5.1 需求描述

提供声明式 YAML Workflow 能力，串联 Skill 与 Sub-agent，响应文件变化、定时、手动触发。

#### 5.5.2 用户故事

- **US-3.5.5.1**：作为团队，我们希望新 PRD 被创建时自动触发审查 → 摘要 → 通知流程。
- **US-3.5.5.2**：作为团队，我们希望每天早上自动生成昨日的工作日报汇总。
- **US-3.5.5.3**：作为用户，当 Workflow 中某步写入文件时，我希望能看到 diff 预览并确认（CLAUDE.md 对齐）。

#### 5.5.3 EARS 验收标准

- **UC-1**：当 Workflow YAML 加载时，WorkflowParser 应验证 schema 合法性，包括步骤 ID 唯一、`when` 表达式可解析、`on_failure` 值合法等。
- **UC-2**：当 Workflow 执行到 `requires_user_confirm: true` 的步骤时，UI 应弹出确认面板，展示步骤信息与前置产出；未确认前 Workflow 暂停。
- **UC-3**：当任一步骤的 `on_failure: stop` 且该步骤失败时，Workflow 应立即终止，标记为 `failed`，并触发 `on_workflow_failure` 钩子。
- **UC-4**：当 Workflow 执行过程中应用被关闭，下次启动时应能从 `workflow-runs/` 的持久化记录中恢复，提示用户"有未完成的 Workflow，是否继续？"
- **UC-5**：当 Workflow 的文件触发器规则匹配时，系统应在文件写入完成后（而非写入中）延迟 1 秒触发，避免对临时文件重复响应。
- **UC-6**：当 Workflow 中的步骤访问 `${{ steps.xxx.yyy }}` 变量但前置步骤未执行（skipped/failed）时，系统应返回 undefined 而非崩溃。
- **UC-7**：当个人空间的 Workflow 被定义时，其文件触发器只监控该用户自己的 personal 目录，不得监控其他用户或公共区域。
- **UC-8**：当 Workflow 单次运行超过 30 分钟时，系统应发出警告并允许用户中止（防止失控）。

#### 5.5.4 技术接口

```typescript
interface WorkflowIPC {
  'workflow:list': () => Promise<WorkflowMetadata[]>
  'workflow:trigger-manual': (workflowId: string, params: Record<string, unknown>) => Promise<{ runId: string }>
  'workflow:get-run': (runId: string) => Promise<WorkflowRunResult>
  'workflow:cancel-run': (runId: string) => Promise<void>
  'workflow:list-runs': (filter?: RunFilter) => Promise<WorkflowRunSummary[]>
}
```

#### 5.5.5 依赖关系

- 依赖：需求 3.5.2（Skill）、需求 3.5.4（Sub-agent）、Sprint 3.1（用户审批 UI）
- 被依赖：无（本 Sprint 的顶层能力）

#### 5.5.6 风险

- **风险 R6**：文件触发器可能因为频繁的文件变化触发过多 Workflow 运行，耗尽资源。
- **缓解**：实现 debounce（1 秒内多次变化仅触发一次）+ 并发上限（同一 Workflow 同时最多 2 个 run）。

- **风险 R7**：Workflow 失败恢复机制复杂，可能恢复到不一致状态。
- **缓解**：本 Sprint 只做"暂停-确认-继续"模式，不做"自动回滚"。CLAUDE.md 禁止自动不可逆操作。

---

### 需求 3.5.6 — Hook 节点扩展

#### 5.6.1 需求描述

把 Sprint 3.1 的 Guardrail 与 Evaluator 扩展为细粒度 Hook 节点。提供 8 个主循环挂载点，允许内置 Hook 与用户 Hook 插入。

#### 5.6.2 用户故事

- **US-3.5.6.1**：作为开发者，我希望能在"模型调用前"注入我的环境信息（当前 Git branch、CI 状态等）。
- **US-3.5.6.2**：作为团队管理员，我希望在"文件写入前"额外检查文件是否包含敏感词。
- **US-3.5.6.3**：作为用户，我希望在"压缩触发前"让我选择要保留的关键信息。

#### 5.6.3 EARS 验收标准

- **UC-1**：当 Hook 节点触发时，HookExecutor 应按 priority 降序执行，高优先级先跑。
- **UC-2**：当某个 Hook 返回 `decision: 'block'` 时，后续 Hook 不再执行，主循环根据节点类型处理（如 PreToolUse 的 block 则拒绝工具）。
- **UC-3**：当 Hook 执行超过 5 秒超时，系统应跳过该 Hook 并记录 warning，不阻塞主循环。
- **UC-4**：当用户 Hook（Markdown 声明式）被触发时，使用 Haiku 级别的便宜模型评估，单次调用成本预算 ≤ 0.001 USD。
- **UC-5**：当 Hook 抛出异常时，系统应捕获并记录，视为 `decision: 'allow'`（fail-open 原则，不阻塞用户）。
- **UC-6**：当 Hook 的 `condition` 字段评估为 false 时，Hook 被跳过，不计入执行时间。
- **UC-7**：当用户禁用某个 Hook 时，系统应记住该选择（持久化到 workspace config），下次启动仍生效。

#### 5.6.4 技术接口

```typescript
interface HookIPC {
  'hook:list': () => Promise<HookMetadata[]>
  'hook:enable': (hookId: string) => Promise<void>
  'hook:disable': (hookId: string) => Promise<void>
  'hook:trace': (traceId: string) => Promise<HookExecutionLog[]>
}
```

#### 5.6.5 依赖关系

- 依赖：Sprint 3.1（Guardrail 迁移）、Sprint 3.3（Trace）
- 被依赖：需求 3.5.4（Sub-agent 内部也支持 Hook）

#### 5.6.6 风险

- **风险 R8**：用户 Hook 使用便宜模型可能误判，导致主循环执行不一致。
- **缓解**：用户 Hook 只允许返回 warn，不允许 block（block 权限仅限内置 Hook）。

---

### 需求 3.5.7 — Reactive Compact 与错误恢复

#### 5.7.1 需求描述

补齐上下文降级的第 5 层：当 API 返回 413 (prompt too long)、max_output_tokens、media_size 错误时的自动恢复。

#### 5.7.2 用户故事

- **US-3.5.7.1**：作为用户，当我的对话太长导致 API 报错时，系统应自动整理并继续，而不是让我手动清空。
- **US-3.5.7.2**：作为用户，当模型输出被截断时，系统应自动让模型"接上刚才的话"继续生成。

#### 5.7.3 EARS 验收标准

- **UC-1**：当 API 返回 413 错误且本轮尚未触发过 autoCompact 时，系统应立即触发 autoCompact 并重试该请求。
- **UC-2**：当 API 返回 413 且 autoCompact 已触发过，系统应进行激进裁剪（保留最近 10 条 + 系统提示 + MEMORY.md），并提示用户"已裁剪早期对话以继续"。
- **UC-3**：当 API 返回 max_output_tokens 错误（输出被截断），系统首次应把 max_tokens 升到 64k 重试；仍失败则注入 meta 消息"从上次中断处继续"触发续写。
- **UC-4**：当 reactiveCompact 执行时，UI 对话区应显示"正在整理上下文..."进度提示（CLAUDE.md 第六章 2 秒反馈规则）。
- **UC-5**：当 reactiveCompact 失败达 3 次，系统应停止重试，给用户明确错误信息与可操作选项（/clear、/compact、重写问题）。
- **UC-6**：当 reactiveCompact 成功后，该次压缩应产生一条正常的 compact_boundary 消息，被 Trace 记录，可在历史中追溯。

#### 5.7.4 技术接口

```typescript
// 主进程内部，不暴露 IPC
class ReactiveCompact {
  async tryRecover(trigger: ReactiveCompactTrigger): Promise<RecoveryResult>
  getRecoveryHistory(turnId: string): RecoveryAttempt[]
}
```

#### 5.7.5 依赖关系

- 依赖：Sprint 3.2（autoCompact、microcompact、snipCompact）
- 被依赖：主循环错误处理

#### 5.7.6 风险

- **风险 R9**：激进裁剪可能丢失用户重要的早期上下文。
- **缓解**：裁剪时优先保留 user message，工具结果次之，系统消息最多丢弃；且保留首条 user message 作为"任务锚点"。

---

### 需求 3.5.8 — Skill/Agent/Workflow 管理 UI

#### 5.8.1 需求描述

在命令面板（Sprint 3.4）基础上扩展，提供 Skill、Sub-agent、Workflow 的管理界面，对非技术用户友好。

#### 5.8.2 用户故事

- **US-3.5.8.1**：作为非技术用户，我希望通过 UI 浏览所有可用的技能、智能体、工作流，而不需要翻文件。
- **US-3.5.8.2**：作为用户，我希望能一键启用/禁用某个工作流的自动触发。
- **US-3.5.8.3**：作为用户，我希望能从内置模板派生一个自定义的 skill/agent/workflow 作为起点。

#### 5.8.3 EARS 验收标准

- **UC-1**：当用户打开"技能库"面板时，应分类展示所有 skill（内置/工作区/个人），支持搜索、按 tag 过滤。
- **UC-2**：当用户点击某个 skill 的"编辑"时，系统应检测是否为内置 skill，若是则提示"是否派生副本到工作区？"，派生后才允许编辑。
- **UC-3**：当用户禁用某个 Workflow 的自动触发时，该 Workflow 仍可通过命令面板手动触发。
- **UC-4**：当用户删除自定义 skill 时，系统应二次确认并保留 7 天的软删除（支持恢复）。
- **UC-5**：当用户导出 skill 时，系统应打包 skill 目录为 `.sibylla-skill` 格式（本质上是 tar.gz），支持分享。
- **UC-6**：当用户导入 `.sibylla-skill` 文件时，系统应扫描内容并标记潜在风险（如包含特殊字符、超长 prompt），让用户二次确认。
- **UC-7**：所有管理操作的 UI 状态变化必须有 loading 指示（CLAUDE.md 对齐）。

#### 5.8.4 技术接口

渲染进程的 UI 组件通过 4.2/4.3/4.4/4.5 的 IPC 接口完成操作。不额外定义 IPC。

#### 5.8.5 依赖关系

- 依赖：需求 3.5.2、3.5.3、3.5.4、3.5.5 全部
- 被依赖：无

#### 5.8.6 风险

- **风险 R10**：UI 复杂度上升，非技术用户可能被众多选项淹没。
- **缓解**：默认隐藏"高级"选项卡；首次使用显示引导 tour；提供"推荐技能"卡片作为入口。

---

### 需求 3.5.9 — CLAUDE.md 更新到 Phase 1

#### 5.9.1 需求描述

CLAUDE.md 当前标记 Phase 0，与实际进展严重滞后。本 Sprint 完成后必须更新到 Phase 1，并增补新章节与决策记录。

#### 5.9.2 EARS 验收标准

- **UC-1**：第十章应更新为 "Phase 1 — AI 能力线构建。目标：..."（具体文本见第十三章建议）。
- **UC-2**：第十一章"详细设计文档索引"应新增 4 条链接：Prompt 库设计、Skill 系统设计、Sub-agent 系统设计、Workflow 系统设计。
- **UC-3**：第八章"关键决策记录"应新增至少 3 条决策（见第十三章）。
- **UC-4**：更新过程必须通过全员 PR 审批（CLAUDE.md 顶部约定"由团队共同维护，任何修改需经全员确认"）。

#### 5.9.3 不确定性

本需求的执行依赖团队全员确认，不是纯技术任务。建议 Sprint 3.5 收官时专门安排一次评审会议。

---

### 需求 3.5.10 — Prompt 版本化与评估

#### 5.10.1 需求描述

基于 Sprint 3.3 的 Trace，为每个 prompt 版本计算性能指标，支持 A/B 测试与回归检测。

#### 5.10.2 用户故事

- **US-3.5.10.1**：作为 Prompt 工程师，我希望知道修改 `modes/plan.md` 后，Plan 模式的 AI 表现是变好还是变差。
- **US-3.5.10.2**：作为团队，我希望发现某个 prompt 版本的失败率高时能自动告警。

#### 5.10.3 EARS 验收标准

- **UC-1**：当一次 AI 调用完成时，系统应把涉及的所有 prompt 片段的 id+version 记录到 Trace。
- **UC-2**：当 Trace 汇总时，系统应按 prompt version 聚合如下指标：平均 token 消耗、用户满意度（若有反馈）、工具调用成功率、任务完成率。
- **UC-3**：当同一 prompt id 存在多个 version 的 Trace 数据时，UI 应提供并列对比视图。
- **UC-4**：当某个 prompt version 的"失败率"（用户点击踩/对话被 /clear 中断）连续 5 次超过 30% 时，系统应发出警告。
- **UC-5**：本需求优先级为 P2，MVP 仅实现数据收集与最基础的查询视图，A/B test 分流留给后续 Sprint。

#### 5.10.4 依赖关系

- 依赖：需求 3.5.1（prompt 元数据）、Sprint 3.3（Trace）

---

## 第十二章 数据模型与持久化

### 12.1 新增数据模型

```typescript
// 所有模型统一在 src/shared/types/sprint-3.5.ts

// ---------- Skill ----------
export interface SkillDefinition {
  metadata: SkillMetadata
  promptPath: string
  toolsConfig?: SkillToolsConfig
  examples: SkillExample[]
  assets: AssetReference[]
}

// ---------- Sub-agent ----------
export interface SubAgentDefinition {
  metadata: SubAgentMetadata
  systemPrompt: string
  allowedTools: string[]
  context: SubAgentContextConfig
  maxTurns: number
  maxTokens: number
  outputSchema?: JsonSchema
}

// ---------- Workflow ----------
export interface WorkflowDefinition {
  metadata: WorkflowMetadata
  triggers: WorkflowTrigger[]
  params: WorkflowParam[]
  steps: WorkflowStep[]
  onFailure?: WorkflowFailurePolicy
}

export interface WorkflowRun {
  runId: string
  workflowId: string
  workflowVersion: string
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'paused'
  startedAt: number
  endedAt?: number
  params: Record<string, unknown>
  steps: Record<string, StepResult>
  parentTraceId?: string
}
```

### 12.2 持久化位置

| 数据 | 位置 | 格式 |
|---|---|---|
| Prompt（内置）| `sibylla-desktop/resources/prompts/` | Markdown + Frontmatter |
| Prompt（用户覆盖）| `{workspace}/.sibylla/prompts-local/` | Markdown + Frontmatter |
| Skill（内置）| `sibylla-desktop/resources/skills/` | 目录 |
| Skill（工作区）| `{workspace}/.sibylla/skills/` | 目录 |
| Skill（个人）| `{workspace}/personal/{user}/skills/` | 目录 |
| Slash Command | 类似 Skill | Markdown |
| Sub-agent | `.sibylla/agents/` | Markdown |
| Workflow 定义 | `.sibylla/workflows/` | YAML |
| Workflow 运行记录 | `.sibylla/memory/workflow-runs/YYYY-MM-DD/{run-id}.json` | JSON |
| Hook 定义 | `.sibylla/hooks/` | Markdown 或 TS（内置）|
| Prompt 性能数据 | `.sibylla/memory/prompt-performance.jsonl` | JSONL（append-only） |

### 12.3 Git 管理

- `.sibylla/prompts-local/`、`.sibylla/skills/`、`.sibylla/agents/`、`.sibylla/workflows/`、`.sibylla/hooks/`：**纳入 Git**（团队共享）
- `.sibylla/memory/workflow-runs/`：**纳入 Git**（运行历史可审计）
- `.sibylla/memory/prompt-performance.jsonl`：**纳入 Git**（团队评估资产）
- `personal/{user}/skills/` 等个人空间：**仅本人 Git push**（受 Sprint 1 的个人空间隔离规则约束）

---

## 第十三章 CLAUDE.md 更新建议

### 13.1 第十章替换为

```markdown
## 十、当前阶段

Phase 1 — AI 能力线构建（收官中）。

已完成：
- Sprint 3.0 - AI 对话基线
- Sprint 3.1 - Harness（Guardrail + Evaluator）
- Sprint 3.2 - 三层记忆系统
- Sprint 3.3 - Trace 可观测性
- Sprint 3.4 - 模式与 Plan 产物

进行中：
- Sprint 3.5 - AI 能力扩展体系（Prompt 库、Skill、Sub-agent、Workflow）

即将进入 Phase 2 — 团队协作与云端能力。
```

### 13.2 第十一章新增索引项

```markdown
### AI 能力扩展（Phase 1 Sprint 3.5）
- [Prompt 库与组合器设计](specs/design/prompt-library.md) - 分层结构、用户覆盖、动态渲染、冲突检测
- [Skill 系统设计](specs/design/skill-system.md) - Skill 规范、注册加载、执行模型、内置清单
- [Sub-agent 系统设计](specs/design/sub-agent-system.md) - 独立循环、权限隔离、结构化输出
- [Workflow 自动化设计](specs/design/workflow-system.md) - YAML 规范、执行器、触发器、用户确认
- [Hook 节点与错误恢复设计](specs/design/hooks-and-recovery.md) - 8 个挂载点、Reactive Compact
```

### 13.3 第八章新增决策记录

| 日期 | 决策 | 理由 |
|---|---|---|
| 2026-04-19 | AI 能力扩展采用 Claude Code 风格（Skill/Sub-agent/Workflow 四层），不采用 LangGraph 图模型 | 保持非技术用户友好；与 CLAUDE.md "AI 建议，人类决策"原则一致；调试复杂度更低 |
| 2026-04-19 | Workflow 使用声明式 YAML，不提供图形化编辑器 | 避免成为小型编程平台；维护成本与 CLAUDE.md 精神偏离 |
| 2026-04-19 | Sub-agent 默认不继承主 agent 的 MEMORY.md | 避免记忆污染；保持 Sub-agent 的独立性与可重用性 |
| 2026-04-19 | Prompt 作为 Markdown 文件存储，纳入 Git 版本管理 | 文件即真相原则；支持团队共享与回滚 |
| 2026-04-19 | 暂不实现 MCP 协议支持，留到 Phase 2 | MCP 涉及外部协议，与"云端不存储用户文档"需统筹设计 |

---

## 第十四章 与前序 Sprint 的集成

### 14.1 集成清单

| 前序 Sprint | 集成点 | 具体工作 |
|---|---|---|
| Sprint 1（工作区）| 工作区边界 | Skill/Sub-agent/Workflow 均受工作区边界约束 |
| Sprint 2（Git 抽象）| 文件版本化 | 所有扩展能力文件通过 Git 抽象层保存 |
| Sprint 3.0（AI 对话）| 主循环 | Hook 节点嵌入主循环；Skill 作为 system prompt 扩展 |
| Sprint 3.1（Harness）| Guardrail/Evaluator | 迁移为内置 Hook，保持向后兼容 |
| Sprint 3.2（记忆）| MEMORY.md | Sub-agent 的 inherit_memory 开关；Workflow 运行记录进 memory |
| Sprint 3.3（Trace）| 可观测性 | 所有扩展能力的执行产生 Trace 事件 |
| Sprint 3.4（模式）| Plan 模式 | Plan 模式的 prompt 迁移到 Prompt 库；模式切换影响 Skill 加载 |

### 14.2 兼容性破坏点（需要迁移的代码）

- `src/main/ai/modePrompts.ts`（Sprint 3.4）：删除，内容迁移到 `resources/prompts/modes/`
- `src/main/ai/guardrail.ts`（Sprint 3.1）：保留逻辑，封装为 `hooks/built-in/guardrailHook.ts`
- `src/main/ai/evaluator.ts`（Sprint 3.1）：类似处理
- `src/main/ai/memoryCurator.ts`（Sprint 3.2）：保留为内置 Sub-agent 实现，prompt 迁移到 `resources/prompts/agents/memory-curator.md`

### 14.3 向后兼容策略

- Sprint 3.4 的 "mode" 字段保持不变，但内部从代码常量改为 PromptComposer 查询
- Sprint 3.1 的 Guardrail IPC 接口保持不变
- 所有新能力默认关闭（feature flag），用户主动启用

---

## 第十五章 测试策略

### 15.1 测试金字塔

```
                ┌─────────────────┐
                │   E2E（10%）      │ - 端到端 Workflow 场景
                ├─────────────────┤
                │  集成（30%）      │ - PromptComposer + Skill + Trace
                ├─────────────────┤
                │  单元（60%）      │ - 每个子系统独立测试
                └─────────────────┘
```

### 15.2 关键测试场景

**PromptComposer**：
- 用户覆盖优先级
- core 不可移除
- 冲突检测
- Token 预算警告
- 缓存命中

**Skill**：
- 内置/工作区/个人三源合并
- 工具白名单裁剪
- 个人空间隔离
- Prompt injection 扫描

**Sub-agent**：
- 权限边界继承
- 独立 Context 隔离
- output_schema 校验重试
- 超时处理
- 并发上限
- 嵌套递归防护

**Workflow**：
- 步骤间变量传递
- when 条件评估
- 失败策略（stop/continue）
- 中断恢复
- 用户确认流程
- 文件触发器 debounce

**Hook**：
- 优先级排序
- block 短路
- 超时跳过
- fail-open 原则

**Reactive Compact**：
- 413 自动恢复
- max_output_tokens 重试
- 激进裁剪保留锚点

### 15.3 测试数据

- 内置 20+ 个 golden prompts 用于回归
- 5 个完整的 Sub-agent 测试场景
- 3 个 Workflow E2E 场景（PRD 审查、日报生成、Spec 发布）

---

## 第十六章 风险总览与缓解

| 风险 ID | 描述 | 级别 | 缓解策略 |
|---|---|---|---|
| R1 | 用户覆盖 core/principles 导致违反设计哲学 | 高 | core 不可移除机制 + `<immutable>` 标签 |
| R2 | Skill 中的 prompt injection 污染主 agent | 中 | 加载前 prompt injection 扫描 |
| R3 | Slash Command 参数注入 | 中 | 参数作为数据占位，文本转义 |
| R4 | Sub-agent 无限递归 | 高 | 默认无 spawnSubAgent 权限，深度上限 3 |
| R5 | output_schema 反复校验失败浪费 token | 中 | 最多 2 次重试，graceful degradation |
| R6 | Workflow 触发器风暴 | 中 | debounce + 并发上限 |
| R7 | Workflow 失败状态不一致 | 高 | 不做自动回滚，只做暂停-确认模式 |
| R8 | 用户 Hook 误判阻塞主循环 | 中 | 用户 Hook 只能 warn 不能 block |
| R9 | Reactive Compact 激进裁剪丢失重要信息 | 中 | 保留首条 user message 作任务锚点 |
| R10 | 管理 UI 复杂度淹没非技术用户 | 中 | 默认隐藏高级选项，引导 tour |

### 特别注意事项

**CLAUDE.md 安全红线合规性**：

- [x] 个人空间隔离：Sub-agent 访问、Workflow 触发器、Skill 加载均受约束
- [x] 文件写入原子性：所有新能力的文件写入走 Sprint 1 的原子替换机制
- [x] Diff 预览：Workflow 写入步骤、Skill 的 write-file 调用均走 Sprint 3.1 的 diff 预览
- [x] API Key 本地加密：本 Sprint 不引入新的 API Key 存储

---

## 第十七章 验收清单

### 17.1 功能验收

- [ ] PromptComposer 成功加载 core + mode + tools + contexts 组合
- [ ] 用户覆盖一个 mode prompt，重启后仍生效
- [ ] 创建自定义 Skill，在对话中触发，Trace 显示 skill id
- [ ] 创建自定义 Slash Command，输入 `/xxx` 成功触发
- [ ] 创建自定义 Sub-agent，主对话中调用，返回结构化结果
- [ ] 创建自定义 Workflow，手动触发完整运行
- [ ] Workflow 文件触发器正确响应文件创建事件
- [ ] Hook 在 PreToolUse 正确拦截并展示审批面板
- [ ] 413 错误自动触发 Reactive Compact 并恢复
- [ ] 管理 UI 可浏览、编辑、导入导出所有扩展资产

### 17.2 非功能验收

- [ ] PromptComposer 单次 compose 耗时 < 50ms（缓存命中 < 5ms）
- [ ] Sub-agent 启动开销 < 500ms（不含首次 API 调用）
- [ ] Workflow 单步骤执行超时提示友好
- [ ] 所有 UI 操作 > 2 秒有 loading 指示
- [ ] Trace 覆盖率：所有扩展能力的执行均有对应事件

### 17.3 文档验收

- [ ] `specs/design/prompt-library.md` 提交
- [ ] `specs/design/skill-system.md` 提交
- [ ] `specs/design/sub-agent-system.md` 提交
- [ ] `specs/design/workflow-system.md` 提交
- [ ] `specs/design/hooks-and-recovery.md` 提交
- [ ] CLAUDE.md 第十章更新到 Phase 1
- [ ] CLAUDE.md 第十一章新增 5 个索引
- [ ] CLAUDE.md 第八章新增 5 条决策

### 17.4 CLAUDE.md 红线检查

- [ ] 所有用户数据仍在本地文件 / Git 仓库（没有引入数据库独占内容）
- [ ] 所有写入操作仍经用户明确确认
- [ ] UI 中仍无 branch/merge/commit 术语
- [ ] 个人空间隔离在新能力中继续有效
- [ ] append-only 日志特性未被破坏