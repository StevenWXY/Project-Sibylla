# ContextEngine v2 与 AI 主动检索

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK003 |
| **任务标题** | ContextEngine v2 与 AI 主动检索 |
| **所属阶段** | Phase 2 - 跨源数据统一与上下文引擎 v2 (Sprint 4) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 5-6 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

将 ContextEngine 从 v1.5 升级到 v2，新增 L5 跨源上下文层——AI 在回答问题时，能自动通过统一搜索引擎发现本地文件、MCP 数据、归档中与用户问题相关的内容。同时实现 AI 主动检索能力，让 AI 在对话中判断上下文不足时，主动调用 `unified_search` 工具扩展搜索范围，而不是直接编造或承认无知。

### 背景

ContextEngine 经历了多次迭代：
- **v1 (Sprint 3)**：三层上下文 — always / manual / skill
- **v1.5 (Sprint 3.2)**：加入 memory 层（向量检索的相关记忆）
- **子模块化 (Sprint 3.5)**：拆分目录结构，接入 PromptComposer

当前 v1.5 的上下文来源仅限于本地文件和记忆条目。用户问"上次讨论的认证方案"时，AI 无法检索到 MCP 同步的 GitHub Issue 或 Slack 讨论中的相关内容。

Sprint 4 通过 TASK002 构建了 `UnifiedSearchEngine`，本任务将其接入 ContextEngine 作为 L5 层，并注册为 AI 工具：

```
v2 上下文层（按优先级）:
┌────────────────────────────────────────────┐
│ L1: always          (CLAUDE.md, 当前文件)   │  权重 30%
│ L2: ai-mode         (Sprint 3.4 模式 prompt) │  权重 10%
│ L3: memory          (Sprint 3.2 相关记忆)    │  权重 15%
│ L4: skill/agent     (Sprint 3.5 技能/智能体) │  权重 15%
│ L5: cross-source    (本任务: 跨源搜索结果)    │  权重 20%  ← 新增
│ L6: manual          (@文件 显式引用)         │  权重 10%
└────────────────────────────────────────────┘
```

**核心设计约束：**

1. **追加式扩展**：`assembleContextV2()` 作为独立方法追加，`assembleContext()` 和 `assembleForHarness()` 签名完全保留
2. **复用现有私有方法**：L1/L3/L4/L6 分别复用 `collectAlwaysLoad`/`collectMemoryContext`/`collectSkillRefs`/`collectManualRefs`，仅 L5 为新增逻辑
3. **graceful degradation**：`UnifiedSearchEngine` 未注入时退化为 v1.5 行为；L5 查询失败不影响 L1-L4/L6
4. **ToolCallGuard 独立接口**：`ExcessiveSearchGuard` 不实现现有 `GuardrailRule`（仅支持 FileOperation），而是新建 `ToolCallGuard` 接口
5. **替换现有 SEARCH_TOOL**：将 placeholder stub `SEARCH_TOOL`（id: `'search'`）替换为实际可用的 `unified_search`

### 范围

**包含：**

- `ContextEngine` 扩展：`assembleContextV2()` 独立方法 + `setUnifiedSearch()` 注入
- `ContextLayerV2` 类型定义（6 层）
- L5 跨源层实现：关键词提取 → 统一搜索 → 去重 → Token 预算控制
- v2 分层 Token 预算分配（30%/10%/15%/15%/20%/10%）
- v2 降级逻辑（`assembleContextV2Fallback`）
- 与 `PromptComposer` 协作：v2 动态层通过 `additionalSections` 注入
- `unified_search` 工具定义与 handler
- `ToolContext` 接口扩展（新增 `unifiedSearch?` 属性）
- `INTENT_PROFILES` 更新（`'search'` → `'unified_search'`）
- `SEARCH_TOOL` 替换（stub → 实际 handler）
- `ToolCallGuard` 新接口
- `ExcessiveSearchGuard` 实现
- `HarnessOrchestrator` 工具调用路径注入 `ToolCallGuard`
- AI 对话集成（AIHandler 调用 `assembleContextV2()` 的入口）
- "重新搜索"命令支持
- 用户设置中禁用 agentic retrieval 选项
- 单元测试

**不包含：**

- `UnifiedSearchEngine` 本身的实现（TASK002）
- `PromptComposer` 的修改（已有 `additionalSections` 接口）
- `GuardrailEngine` 的修改（`ToolCallGuard` 是独立接口）
- 搜索 UI（TASK002）

## 依赖关系

### 前置依赖

- [x] PHASE2-TASK001 — 事件总线基础设施扩展（消费事件总线）
- [x] PHASE2-TASK002 — 跨源统一搜索引擎与搜索 UI（`UnifiedSearchEngine` 来源）
- [x] PHASE1-TASK012 — 上下文引擎 v1（`ContextEngine` 基础架构）
- [x] PHASE1-TASK025 — 向量索引与混合检索引擎（`MemoryIndexer` 来源，L3 层）
- [x] PHASE1-TASK035 — Prompt 库基础设施与 PromptComposer（`PromptComposer` 协作）
- [x] PHASE1-TASK017 — Guardrails 硬性保障层（`GuardrailEngine` + `GuardrailRule` 来源）
- [x] PHASE1-TASK020 — 工具范围管理与意图分类（`ToolScopeManager` + `INTENT_PROFILES` 来源）
- [x] PHASE1-TASK030 — AI 模式系统（`AiModeRegistry` 来源，L2 层）
- [x] PHASE1-TASK037 — Skill 系统 v2（Skill 来源，L4 层）

### 被依赖任务

- 无（本任务是 Sprint 4 AI 系统线的终点）

## 参考文档

- [`specs/requirements/phase2/sprint4-semantic-search.md`](../../requirements/phase2/sprint4-semantic-search.md) — 需求 4.4 + 4.5
- [`specs/requirements/phase1/sprint3-ai-mvp.md`](../../requirements/phase1/sprint3-ai-mvp.md) — ContextEngine v1 设计
- [`specs/requirements/phase1/sprint3.2-memory.md`](../../requirements/phase1/sprint3.2-memory.md) — memory 层（L3）
- [`specs/requirements/phase1/sprint3.5-ai_ablities.md`](../../requirements/phase1/sprint3.5-ai_ablities.md) — PromptComposer + ContextEngine 子模块化
- [`specs/requirements/phase1/sprint3.1-harness-infrastructure.md`](../../requirements/phase1/sprint3.1-harness-infrastructure.md) — GuardrailEngine + ToolScope
- [`specs/design/architecture.md`](../../design/architecture.md) — 上下文引擎架构
- [`CLAUDE.md`](../../../CLAUDE.md) — AI 建议/人类决策、可观测性
- `.kilocode/skills/phase1/ai-context-engine/SKILL.md` — 上下文引擎设计最佳实践

## 验收标准

### ContextEngine v2 — 核心方法

- [ ] `setUnifiedSearch(engine)` 可选注入方法可用
- [ ] `assembleContextV2(request)` 方法返回 `AssembledContextV2`，包含 6 层上下文
- [ ] `assembleContext()` 和 `assembleForHarness()` 签名和输出完全不变（向后兼容）
- [ ] `UnifiedSearchEngine` 未注入时 `assembleContextV2()` 退化为 v1.5 行为（无 L5）

### L5 跨源层

- [ ] 用户提问时，系统从 userMessage 中提取关键词并调用 `UnifiedSearchEngine.search()`，300ms 内完成
- [ ] L5 搜索结果去重：过滤掉已在 L1（always 文件）和 L6（manual 引用）中出现的内容
- [ ] L5 结果按 Token 预算 20% 限制，最多取 5 条
- [ ] L5 结果在上下文中以 `### [sourceLabel] title` 格式标注来源
- [ ] L5 查询失败时 graceful degradation，不影响 L1-L4/L6
- [ ] MCP 来源的结果标注来源元数据（如 `[来自 GitHub Issue #234]`）

### 分层 Token 预算

- [ ] v2 权重分配：always 30% / ai-mode 10% / memory 15% / skill 15% / cross-source 20% / manual 10%
- [ ] Token 预算紧张时优先压缩 L5（cross-source），保留 L1-L4 和 L6 完整
- [ ] 压缩 L5 时截断内容并添加 `TRUNCATION_MARKER`

### 与 PromptComposer 协作

- [ ] v2 动态层通过 `PromptComposer.compose({ additionalSections: contextV2.layers })` 注入
- [ ] 最终 system prompt 中包含所有 6 层内容，且 L5 层有清晰的 section 分隔

### AI 主动检索 — 工具注册

- [ ] `unified_search` 工具注册到 `ToolScopeManager`，id 为 `'unified_search'`
- [ ] 现有 `SEARCH_TOOL`（id: `'search'` placeholder stub）已替换为 `unified_search` 并接入实际 handler
- [ ] `INTENT_PROFILES` 中所有 `'search'` 已替换为 `'unified_search'`（chat/edit_file/analyze/plan 四个 profile）
- [ ] `ToolContext` 接口扩展完成：新增 `unifiedSearch?: UnifiedSearchEngine` 属性
- [ ] 扩展后现有工具（`reference_file`/`diff_write` 等）不受影响

### AI 主动检索 — 工具行为

- [ ] AI 在对话中可自主调用 `unified_search` 工具
- [ ] 工具返回 top 5 结果，格式包含 source/title/snippet/navigation/relevance_score
- [ ] 工具返回包含引用提示：`Found X results. Cite using [source:title] format.`
- [ ] 工具调用失败时 AI 优雅承认并基于已有上下文继续
- [ ] 每次工具调用产生 Trace span（kind='tool-call'）

### ExcessiveSearchGuard

- [ ] `ToolCallGuard` 新接口定义完成，独立于 `GuardrailRule`
- [ ] `ExcessiveSearchGuard` 实现 `ToolCallGuard` 接口
- [ ] 单个 turn 内调用 `unified_search` 3 次以内正常放行
- [ ] 单个 turn 内调用 `unified_search` 超过 3 次触发 `conditional` 判定，要求用户确认
- [ ] turn 结束时 `resetTurn()` 清零计数器
- [ ] 不修改现有 `GuardrailEngine` 和 `GuardrailRule` 接口

### 用户设置

- [ ] 用户可在设置中禁用 agentic retrieval，禁用后 `unified_search` 不出现在工具范围中
- [ ] "重新搜索"命令可强制 L5 重新评估（`contextEngine:v2:preview` IPC）

### 性能要求

- [ ] ContextEngine v2 组装 < 800ms（含 L5 跨源检索 300ms）
- [ ] `unified_search` 工具调用 < 500ms
- [ ] v2 降级（无 UnifiedSearchEngine）性能与 v1.5 一致

### 单元测试

- [ ] `assembleContextV2()` 6 层组装测试
- [ ] L5 跨源层搜索 + 去重测试
- [ ] 分层 Token 预算分配测试（正常/超限/压缩）
- [ ] v2 降级测试（无 UnifiedSearchEngine）
- [ ] `extractSearchKeywordsHeuristic()` 关键词提取测试
- [ ] `selectRelevantSources()` 意图→源选择测试
- [ ] `formatCrossSourceResults()` 格式化测试
- [ ] `unified_search` 工具 handler 测试
- [ ] `ExcessiveSearchGuard` 3 次限制测试
- [ ] `ToolCallGuard` 接口独立性测试
- [ ] `INTENT_PROFILES` 更新验证测试
- [ ] 与 PromptComposer 协作集成测试
- [ ] 覆盖率 ≥ 80%

## 技术策略

### 核心架构：独立 v2 方法 + 复用私有方法

```
ContextEngine（已有类，追加式扩展）
    │
    ├── 现有 v1 方法（完全保留）:
    │   ├── assembleContext()           → v1 五源并行收集 + 单一预算
    │   └── assembleForHarness()        → Sprint 3.1 签名不变
    │
    ├── 现有私有方法（v2 复用）:
    │   ├── collectAlwaysLoad()         → L1 always 层
    │   ├── collectMemoryContext()      → L3 memory 层
    │   ├── collectSkillRefs()          → L4 skill/agent 层
    │   └── collectManualRefs()         → L6 manual 层
    │
    ├── v2 新增:
    │   ├── setUnifiedSearch()          → 可选注入 UnifiedSearchEngine
    │   ├── assembleContextV2()         → 6 层顺序收集 + 分层预算（独立流程）
    │   ├── assembleContextV2Fallback() → 降级到 v1.5
    │   ├── applyV2TokenBudget()        → 分层预算分配
    │   ├── extractSearchKeywordsHeuristic() → 启发式关键词提取
    │   ├── selectRelevantSources()     → 意图→数据源映射
    │   ├── formatCrossSourceResults()  → 跨源结果格式化
    │   └── assembleV2SystemPrompt()    → v2 system prompt 组装
    │
    └── 关键设计:
        ├── v2 不复用 assembleContext() 内部流程（6层 vs 5源，逻辑不同）
        ├── v2 复用现有私有方法（避免重复代码）
        └── v2 为独立方法，v1 调用链完全不受影响
```

### v2 上下文组装流程

```
用户消息: "上次我们讨论的认证方案到底用了什么?"
        │
        ▼
assembleContextV2(request)
    │
    ├── L1: always (30%)
    │   └── collectAlwaysLoad() → CLAUDE.md + 当前文件
    │
    ├── L2: ai-mode (10%)
    │   └── aiModeRegistry.buildSystemPromptPrefix()
    │
    ├── L3: memory (15%)
    │   └── collectMemoryContext() → MemoryIndexer.search()
    │
    ├── L4: skill/agent (15%)
    │   └── collectSkillRefs() → 活跃 Skill 资源
    │
    ├── L5: cross-source (20%) ← 新增
    │   ├── extractSearchKeywordsHeuristic("上次我们讨论的认证方案到底用了什么?")
    │   │   → ["认证", "方案", "讨论"]
    │   ├── selectRelevantSources(intent='chat')
    │   │   → ['local-files', 'memory', 'mcp:github', 'mcp:slack', 'handbook']
    │   ├── UnifiedSearchEngine.search({ query: "认证 方案 讨论", sources, limit: 8, timeoutMs: 300 })
    │   ├── 去重: 过滤 L1/L6 中已有的文件路径
    │   ├── 截断: 取 top 5
    │   └── formatCrossSourceResults() → 格式化内容
    │
    ├── L6: manual (10%)
    │   └── collectManualRefs() → @文件引用
    │
    ├── applyV2TokenBudget() → 预算超限时压缩 L5
    │
    └── assembleV2SystemPrompt() → 组装为 system prompt
        │
        ▼
PromptComposer.compose({ additionalSections: contextV2.layers })
    → 最终 system prompt
```

### AI 主动检索工具架构

```
用户: "上次讨论的认证方案用了什么?"
    │
    ├── AIHandler 调用 assembleContextV2()
    │   └── L5 自动搜索: 找到 GitHub Issue #234 + Memory "团队偏好 JWT"
    │
    ├── AI 判断: 上下文仍不足（Issue #234 只有标题，需要详情）
    │
    ├── AI 自主调用 unified_search 工具:
    │   { query: "认证方案 JWT Issue", sources: ["mcp:github"] }
    │
    │   进入 HarnessOrchestrator 工具调用路径:
    │   ├── ExcessiveSearchGuard.check('unified_search', sessionId)
    │   │   └── count=1 ≤ 3 → allow: true
    │   ├── unified_search handler 执行
    │   │   └── ctx.unifiedSearch.search(...)
    │   └── 返回结果给 AI
    │
    └── AI 回答: "根据记忆中的记录，团队选择了 JWT...(引用 [mcp:github:issue/234])"
```

### ToolCallGuard 独立接口设计

```
现有 GuardrailRule（Sprint 3.1）:
    check(operation: FileOperation) → GuardrailVerdict
    ↑ 仅能检查文件操作（write/delete/rename/read）
    ↑ 不修改

新增 ToolCallGuard（本 Sprint）:
    check(toolId: string, sessionId: string) → GuardrailVerdict
    ↑ 检查工具调用频率
    ↑ 在 HarnessOrchestrator 工具调用路径注入

注入位置:
    HarnessOrchestrator.executeToolCall()
        ├── guardrailEngine.check(fileOp)     ← 现有路径
        ├── toolCallGuard.check(toolId, sid)   ← 新增路径
        └── tool.handler(args, ctx)
```

### 意图→数据源映射

```
selectRelevantSources(request.intent):
    intent === 'edit_file'  → ['local-files', 'memory']
    intent === 'analyze'    → ['local-files', 'memory', 'memory-archive', 'mcp:github', 'mcp:slack']
    intent === 'plan'       → ['local-files', 'memory', 'handbook']
    默认 (chat)             → ['local-files', 'memory', 'mcp:github', 'mcp:slack', 'handbook']
```

### 关键词提取策略

```
extractSearchKeywordsHeuristic(message):
    1. 转小写
    2. 按空格/标点分词
    3. 过滤停用词（的/了/是/我/怎么/如何/how/what/the/is/a/an）
    4. 过滤单字符词
    5. 取前 6 个词
    6. 不依赖 LLM，纯启发式（避免额外 API 调用）
```

### 与 PromptComposer 的协作方式

```
PromptComposer（Sprint 3.5，不修改）:
    compose({ mode, tools, currentAgent, workspaceInfo, userPreferences, additionalSections })

ContextEngine v2:
    assembleContextV2() → AssembledContextV2.layers
    └── 作为 additionalSections 传入 PromptComposer

最终 system prompt:
    [PromptComposer 内置片段]
    core/identity.md + modes/chat.md + tools/*.md + agents/*.md
    +
    [ContextEngine v2 动态层]
    --- always ---
    [CLAUDE.md 内容] [当前文件内容]
    --- ai-mode ---
    [Chat 模式 prompt prefix]
    --- memory ---
    [相关记忆内容]
    --- skill ---
    [活跃 Skill 资源]
    --- cross-source ---
    ### [GitHub Issue #234] Auth flow refactor
    ...
    ### [本地文件] auth-design.md
    ...
    --- manual ---
    [@引用文件内容]
```

## 技术执行路径

### 步骤 1：定义 v2 类型系统

**文件：** `src/main/services/context-engine/types-v2.ts`（新建）

1. 定义 `ContextLayerTypeV2` 联合类型：
   ```typescript
   export type ContextLayerTypeV2 =
     | 'always' | 'ai-mode' | 'memory' | 'skill' | 'cross-source' | 'manual'
   ```

2. 定义 `ContextLayerV2` 接口：
   ```typescript
   export interface ContextLayerV2 {
     type: ContextLayerTypeV2
     priority: number              // 1-6
     content: string
     tokens: number
     hits?: number                 // 仅 cross-source 层
     sources?: Array<{ kind: string; id?: string }>  // 来源引用
   }
   ```

3. 定义 `ContextAssemblyRequestV2` 接口：
   - 继承 v1 的关键字段：`userMessage`、`currentFile`、`manualRefs`
   - 新增：`aiMode?: AiMode`、`activeSkills?: string[]`、`intent?: string`
   - 新增：`tokenBudget?: number`（默认 50000）
   - 新增：`forceReSearch?: boolean`（"重新搜索"命令触发）

4. 定义 `AssembledContextV2` 接口：
   - `layers: ContextLayerV2[]`
   - `systemPrompt: string`
   - `totalTokens: number`
   - `sources: Array<{ kind: string; id?: string }>`

5. 定义 `V2_BUDGET_WEIGHTS` 常量：
   ```typescript
   export const V2_BUDGET_WEIGHTS: Record<ContextLayerTypeV2, number> = {
     'always': 0.30, 'ai-mode': 0.10, 'memory': 0.15,
     'skill': 0.15, 'cross-source': 0.20, 'manual': 0.10,
   }
   ```

**验证：** TypeScript 编译通过，类型与 v1 无冲突

### 步骤 2：实现 assembleContextV2 核心方法

**文件：** `src/main/services/context-engine/index.ts`（修改，追加式）

1. 新增私有属性：
   ```typescript
   private unifiedSearch?: UnifiedSearchEngine
   ```

2. 新增 `setUnifiedSearch()` 方法：
   ```typescript
   setUnifiedSearch(engine: UnifiedSearchEngine): void {
     this.unifiedSearch = engine
   }
   ```

3. 实现 `assembleContextV2()` 主方法：
   - 入口检查：`if (!this.unifiedSearch) return this.assembleContextV2Fallback(request)`
   - 包裹 `tracer.withSpan('context.assemble.v2', ...)`
   - **L1**: 调用 `this.collectAlwaysLoad(request)` → 拼接 content → 推入 layers
   - **L2**: 调用 `this.aiModeRegistry?.buildSystemPromptPrefix()` → 推入 layers
   - **L3**: 调用 `this.collectMemoryContext(request)` → 拼接 content → 推入 layers
   - **L4**: 调用 `this.collectSkillRefs(request.activeSkills)` → 拼接 content → 推入 layers
   - **L5**: try/catch 包裹的跨源搜索逻辑：
     - `extractSearchKeywordsHeuristic(request.userMessage)` 提取关键词
     - `this.unifiedSearch.search()` 执行搜索
     - 去重：过滤已在 L1/L6 中出现的 fullPath
     - 截断：`filtered.slice(0, 5)`
     - `formatCrossSourceResults()` 格式化
     - 推入 layers（含 hits 和 navigation sources）
     - catch: `logger.warn` + 跳过 L5
   - **L6**: 调用 `this.collectManualRefs(request.manualRefs)` → 推入 layers
   - Token 预算：`this.applyV2TokenBudget(layers, tokenBudget)`
   - Span attributes 设置
   - 返回 `AssembledContextV2`

4. 实现 `assembleContextV2Fallback()` 降级方法：
   - 调用现有 `this.assembleContext()` 获取 v1 结果
   - 将 v1 结果映射为 `AssembledContextV2` 格式（无 L5 层）

5. 实现 `applyV2TokenBudget()` 方法：
   - 计算总 tokens
   - 若未超预算直接返回
   - 若超预算：遍历 layers，压缩 `cross-source` 层至 `Math.floor(totalBudget * 0.20)` tokens
   - 截断 content 并添加 `TRUNCATION_MARKER`

6. 实现 `extractSearchKeywordsHeuristic()` 方法：
   - 停用词集合（中英文）
   - 小写 + 分词 + 过滤 + 截取前 6 词

7. 实现 `selectRelevantSources()` 方法：
   - 基于 `request.intent` 映射到 `SearchSource[]`
   - `'edit_file'` → `['local-files', 'memory']`
   - `'analyze'` → `['local-files', 'memory', 'memory-archive', 'mcp:github', 'mcp:slack']`
   - 默认 → `['local-files', 'memory', 'mcp:github', 'mcp:slack', 'handbook']`

8. 实现 `formatCrossSourceResults()` 方法：
   - 每个 result 格式化为 `### [sourceLabel] title\nsnippet\n引用提示`
   - sourceLabel 映射：`memory` → `记忆`、`mcp:github` → `GitHub`、`local-files` → `本地文件`

9. 实现 `assembleV2SystemPrompt()` 方法：
   - 以 `SYSTEM_PROMPT_BASE` 开头
   - 逐层追加 `--- ${layer.type} ---\n${layer.content}`
   - 段间用 `\n\n` 连接

**验证：** v2 6 层组装正确；v1 签名不受影响；降级正确；预算压缩正确

### 步骤 3：实现 unified_search 工具 + ToolCallGuard

**文件：** `src/main/services/harness/tools/unified-search-tool.ts`（新建）

1. 定义 `unified_search` 工具：
   - `id`: `'unified_search'`
   - `name`: `'unified_search'`
   - `description`: 包含使用场景和不使用场景的说明
   - `schema`: `{ query: string, sources?: string[], limit?: integer(default 5, max 10) }`
   - `tags`: `['search', 'retrieval']`

2. 实现 `handler` 函数：
   - 检查 `ctx.unifiedSearch` 是否存在，不存在返回空结果 + hint
   - 调用 `ctx.unifiedSearch.search({ query, sources, limit, timeoutMs: 500 })`
   - 格式化返回：
     - `results`: 映射为 `{ source, title, snippet, navigation, relevance_score }`
     - `partial`: 透传
     - `hint`: 无结果时提示换关键词；有结果时提示用 `[source:title]` 格式引用

**文件：** `src/main/services/harness/guardrails/excessive-search.ts`（新建）

3. 定义 `ToolCallGuard` 接口：
   ```typescript
   export interface ToolCallGuard {
     readonly id: string
     readonly description: string
     check(toolId: string, sessionId: string): Promise<GuardrailVerdict>
     resetTurn(sessionId: string): void
   }
   ```

4. 实现 `ExcessiveSearchGuard` 类：
   - 私有属性 `callCounter: Map<string, number>`（sessionId → count）
   - `check()`: 非 `unified_search` 直接放行；递增计数；> 3 返回 `conditional`
   - `resetTurn()`: 删除 sessionId 的计数

**文件：** `src/main/services/harness/tool-scope.ts`（修改）

5. 扩展 `ToolContext` 接口：
   ```typescript
   export interface ToolContext {
     readonly workspaceRoot: string
     readonly sessionId: string
     readonly logger: typeof loggerType
     readonly unifiedSearch?: UnifiedSearchEngine  // 新增
   }
   ```

**文件：** `src/main/services/harness/built-in-tools.ts`（修改）

6. 替换 `SEARCH_TOOL`：
   - 将现有 `SEARCH_TOOL`（id: `'search'`，placeholder stub）替换为从 `unified-search-tool.ts` 导入的 `unifiedSearchTool`
   - 确保 id 从 `'search'` 变更为 `'unified_search'`

**文件：** `src/main/services/harness/tool-scope.ts`（修改）

7. 更新 `INTENT_PROFILES`：
   - 所有 profile 中 `'search'` 替换为 `'unified_search'`
   - 四个 profile 均需更新：chat、edit_file、analyze、plan

**验证：** 工具注册正确；handler 返回格式正确；ExcessiveSearchGuard 3 次限制正确；INTENT_PROFILES 更新正确

### 步骤 4：HarnessOrchestrator 注入 ToolCallGuard

**文件：** `src/main/services/harness/orchestrator.ts`（修改，最小侵入）

1. 新增私有属性：
   ```typescript
   private toolCallGuards: ToolCallGuard[] = []
   ```

2. 新增注入方法：
   ```typescript
   addToolCallGuard(guard: ToolCallGuard): void {
     this.toolCallGuards.push(guard)
   }
   ```

3. 在工具调用路径中注入检查：
   - 定位现有 `executeToolCall()` 或类似方法
   - 在实际调用 `tool.handler()` 之前，遍历 `this.toolCallGuards`
   - 对每个 guard 调用 `check(toolId, sessionId)`
   - 若任一 guard 返回 `allow: 'conditional'`，触发用户确认流程
   - 若返回 `allow: false`，拒绝调用

4. 在 turn 结束时调用所有 guard 的 `resetTurn()`：
   - 在现有的 turn 结束逻辑中追加
   - `this.toolCallGuards.forEach(g => g.resetTurn(sessionId))`

**验证：** ToolCallGuard 在工具调用路径生效；现有 GuardrailEngine 不受影响

### 步骤 5：AIHandler 集成 v2

**文件：** `src/main/ipc/handlers/ai.handler.ts`（修改）

1. 在 AI 对话处理流程中，检测是否启用了 v2：
   - 条件：`contextEngine` 已注入 `unifiedSearch` 且用户未禁用 agentic retrieval
   - 若启用：调用 `contextEngine.assembleContextV2(request)`
   - 若未启用：保持原有 `contextEngine.assembleContext(request)` 调用

2. 构建 `ContextAssemblyRequestV2`：
   - 从对话上下文中提取 `userMessage`、`currentFile`、`manualRefs`
   - 从 AI 模式系统中获取 `aiMode`
   - 从 Skill 系统中获取 `activeSkills`
   - 从意图分类中获取 `intent`

3. 处理 v2 返回结果：
   - 将 `AssembledContextV2.layers` 传递给 `PromptComposer.compose({ additionalSections })`
   - 将组装后的 system prompt 传递给 Generator

4. "重新搜索"命令支持：
   - 监听 `contextEngine:v2:preview` IPC
   - 触发时设置 `forceReSearch: true`，跳过 L5 缓存

**文件：** `src/main/ipc/handlers/unified-search.ts`（修改，TASK002）

5. 在创建 `UnifiedSearchEngine` 实例后，注入到 `ContextEngine`：
   ```typescript
   contextEngine.setUnifiedSearch(unifiedSearchEngine)
   ```

**文件：** `src/main/services/harness/orchestrator.ts`（修改）

6. 创建 `ExcessiveSearchGuard` 实例并注入：
   ```typescript
   orchestrator.addToolCallGuard(new ExcessiveSearchGuard())
   ```

7. 在工具调用时注入 `UnifiedSearchEngine` 到 `ToolContext`：
   - 构造 `ToolContext` 时传入 `unifiedSearch: unifiedSearchEngine`

**验证：** AI 对话链路完整：用户提问 → v2 组装 → PromptComposer → Generator → 流式响应

### 步骤 6：IPC 调试入口 + 用户设置

**文件：** `src/main/ipc/handlers/context-engine-v2.ts`（新建）

1. 注册 `contextEngine:v2:preview` handler：
   - 接收 `ContextAssemblyRequestV2` 参数
   - 调用 `contextEngine.assembleContextV2(request)`
   - 返回 `AssembledContextV2`（用于调试 UI 或"重新搜索"命令）

**文件：** `src/shared/types.ts`（修改，扩展）

2. 新增 IPC 通道常量：
   ```typescript
   CONTEXT_ENGINE_V2_PREVIEW: 'contextEngine:v2:preview',
   ```

**文件：** `src/preload/index.ts`（修改，扩展）

3. 新增 `contextEngine` 命名空间：
   ```typescript
   contextEngine: {
     v2Preview: (request) => ipcRenderer.invoke('contextEngine:v2:preview', request),
   }
   ```

**文件：** 用户设置相关文件（修改）

4. 新增 agentic retrieval 开关：
   - 在用户设置 store 中新增 `agenticRetrievalEnabled: boolean`（默认 `true`）
   - 当 `false` 时，`INTENT_PROFILES` 中移除 `'unified_search'`，AIHandler 使用 v1 `assembleContext()`

**验证：** IPC 调试入口可用；用户设置开关生效

### 步骤 7：主进程装配

**文件：** `src/main/main.ts` 或服务装配文件（修改）

1. 确保 `UnifiedSearchEngine` 实例注入到 `ContextEngine`：
   ```typescript
   contextEngine.setUnifiedSearch(unifiedSearchEngine)
   ```

2. 创建 `ExcessiveSearchGuard` 并注入 `HarnessOrchestrator`：
   ```typescript
   const excessiveSearchGuard = new ExcessiveSearchGuard()
   orchestrator.addToolCallGuard(excessiveSearchGuard)
   ```

3. 在 `ToolContext` 构造时注入 `UnifiedSearchEngine`：
   - 定位所有构造 `ToolContext` 的位置
   - 追加 `unifiedSearch: unifiedSearchEngine`

4. 注册 `contextEngine:v2:preview` IPC handler

**验证：** 完整装配链路：UnifiedSearchEngine → ContextEngine → AIHandler → Generator

### 步骤 8：单元测试

**文件：** `tests/main/services/context-engine/v2/`（新建目录）

1. `assemble-context-v2.test.ts`：
   - 6 层组装完整测试（mock UnifiedSearchEngine 返回 L5 数据）
   - L5 搜索结果去重测试（过滤 L1/L6 中已有的路径）
   - L5 失败 graceful degradation 测试
   - v2 降级测试（无 UnifiedSearchEngine → 退化为 v1.5）
   - forceReSearch=true 时 L5 重新评估测试

2. `token-budget-v2.test.ts`：
   - 正常预算下不压缩测试
   - 预算超限时 L5 优先压缩测试
   - 压缩后 tokens 不超过预算测试

3. `keyword-extraction.test.ts`：
   - 中文消息关键词提取测试（停用词过滤正确）
   - 英文消息关键词提取测试
   - 空消息/纯停用词消息返回空数组测试
   - 长消息截取前 6 词测试

4. `source-selection.test.ts`：
   - edit_file 意图 → local-files + memory
   - analyze 意图 → local-files + memory + archive + mcp
   - 默认意图 → 完整源列表

5. `cross-source-format.test.ts`：
   - 多源结果格式化测试
   - sourceLabel 映射测试
   - 引用提示格式测试

**文件：** `tests/main/services/harness/tools/unified-search-tool.test.ts`（新建）

6. `unified-search-tool.test.ts`：
   - 工具 handler 正常调用测试（mock ctx.unifiedSearch）
   - ctx.unifiedSearch 未注入时返回空结果测试
   - 返回格式验证（source/title/snippet/navigation/relevance_score/hint）

**文件：** `tests/main/services/harness/guardrails/excessive-search.test.ts`（新建）

7. `excessive-search.test.ts`：
   - 非统一搜索工具直接放行测试
   - 3 次以内放行测试
   - 超过 3 次触发 conditional 测试
   - resetTurn 清零测试
   - 多 sessionId 隔离测试

**文件：** `tests/main/ipc/context-engine-v2-handler.test.ts`（新建）

8. IPC handler 测试：
   - `contextEngine:v2:preview` 调用链路测试

**覆盖率目标：** ≥ 80%

## 现有代码基础

| 已有模块 | 文件路径 | 本任务使用方式 |
|---------|---------|-------------|
| ContextEngine | `src/main/services/context-engine/index.ts`（Sprint 3/3.2/3.5） | 追加 `assembleContextV2()` + `setUnifiedSearch()`，保留 v1 方法 |
| PromptComposer | `src/main/services/context-engine/PromptComposer.ts`（Sprint 3.5） | 不修改，通过 `additionalSections` 接收 v2 动态层 |
| AiModeRegistry | `src/main/services/mode/ai-mode-registry.ts`（Sprint 3.4） | L2 层调用 `buildSystemPromptPrefix()` |
| ToolScopeManager | `src/main/services/harness/tool-scope.ts`（Sprint 3.1） | 扩展 ToolContext + 更新 INTENT_PROFILES |
| HarnessOrchestrator | `src/main/services/harness/orchestrator.ts`（Sprint 3.1） | 最小侵入注入 ToolCallGuard |
| GuardrailEngine | `src/main/services/harness/guardrails/engine.ts`（Sprint 3.1） | 不修改，ToolCallGuard 独立 |
| built-in-tools | `src/main/services/harness/built-in-tools.ts`（Sprint 3.1） | 替换 SEARCH_TOOL stub |
| AIHandler | `src/main/ipc/handlers/ai.handler.ts`（Sprint 3） | 新增 v2 调用分支 |
| UnifiedSearchEngine | `src/main/services/unified-search/`（TASK002） | 通过 `setUnifiedSearch()` 注入 |

**完全缺失、需新建的模块：**

| 模块 | 说明 |
|------|------|
| `context-engine/types-v2.ts` | v2 类型定义 |
| `harness/tools/unified-search-tool.ts` | unified_search 工具定义 + handler |
| `harness/guardrails/excessive-search.ts` | ToolCallGuard 接口 + ExcessiveSearchGuard 实现 |
| `ipc/handlers/context-engine-v2.ts` | v2 调试 IPC handler |

## 新增 IPC 通道

| IPC 通道 | 方向 | 说明 |
|---------|------|------|
| `contextEngine:v2:preview` | Renderer → Main | v2 上下文预览（调试/重新搜索） |

## 涉及的现有文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/main/services/context-engine/index.ts` | 扩展（追加） | 新增 assembleContextV2 + setUnifiedSearch |
| `src/main/services/harness/tool-scope.ts` | 扩展 | ToolContext 新增 unifiedSearch?；INTENT_PROFILES 更新 |
| `src/main/services/harness/built-in-tools.ts` | 修改 | SEARCH_TOOL → unifiedSearchTool |
| `src/main/services/harness/orchestrator.ts` | 最小侵入 | 新增 addToolCallGuard + 工具调用路径注入 |
| `src/main/ipc/handlers/ai.handler.ts` | 修改 | 新增 v2 调用分支 |
| `src/shared/types.ts` | 扩展 | 新增 CONTEXT_ENGINE_V2_PREVIEW 常量 |
| `src/preload/index.ts` | 扩展 | 新增 contextEngine 命名空间 |
| `src/main/main.ts`（或装配文件） | 修改 | 注入 UnifiedSearchEngine + ExcessiveSearchGuard |

**不修改的文件：**
- `src/main/services/context-engine/PromptComposer.ts` — 已有 `additionalSections` 接口
- `src/main/services/harness/guardrails/engine.ts` — ToolCallGuard 独立于 GuardrailEngine
- `src/main/services/unified-search/` — 通过 setter 注入，不修改搜索引擎

---

**创建时间：** 2026-04-27
**最后更新：** 2026-04-27
**更新记录：**
- 2026-04-27 — 创建任务文档（含完整技术执行路径 8 步）
