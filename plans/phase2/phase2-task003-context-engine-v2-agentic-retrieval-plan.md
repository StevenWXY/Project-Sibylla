# PHASE2-TASK003: ContextEngine v2 与 AI 主动检索 — 实施计划

> 任务来源：[specs/tasks/phase2/phase2-task003_context-engine-v2-agentic-retrieval.md](../../specs/tasks/phase2/phase2-task003_context-engine-v2-agentic-retrieval.md)
> 创建日期：2026-04-28
> 最后更新：2026-04-28

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK003 |
| **任务标题** | ContextEngine v2 与 AI 主动检索 |
| **所属阶段** | Phase 2 - 跨源数据统一与上下文引擎 v2 (Sprint 4) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 5-6 工作日 |
| **前置依赖** | PHASE2-TASK001（事件总线）+ PHASE2-TASK002（统一搜索引擎）+ TASK012（ContextEngine v1）+ TASK025（MemoryIndexer）+ TASK035（PromptComposer）+ TASK017（Guardrails）+ TASK020（ToolScope）+ TASK030（AI 模式）+ TASK037（Skill v2） |

### 1.1 目标

将 ContextEngine 从 v1.5 升级到 v2，新增 L5 跨源上下文层 + AI 主动检索能力。核心交付：

1. **`assembleContextV2()` 独立方法** — 6 层上下文组装，复用现有私有方法
2. **L5 跨源层** — 关键词提取 → 统一搜索 → 去重 → Token 预算控制
3. **`unified_search` 工具** — 替换现有 `SEARCH_TOOL` placeholder，接入实际 handler
4. **`ToolCallGuard` 独立接口** — `ExcessiveSearchGuard` 防止搜索滥用
5. **`ExcessiveSearchGuard`** — 单 turn 3 次限制，超过需用户确认
6. **v2 分层 Token 预算** — always 30% / ai-mode 10% / memory 15% / skill 15% / cross-source 20% / manual 10%
7. **用户设置** — agentic retrieval 开关 + "重新搜索"命令

### 1.2 核心设计约束（来自 CLAUDE.md + 任务文档）

| 约束 | 来源 | 具体要求 |
|------|------|----------|
| 追加式扩展 | 任务文档 §核心设计约束 | `assembleContextV2()` 独立方法，`assembleContext()`/`assembleForHarness()` 签名完全保留 |
| 复用私有方法 | 任务文档 §核心设计约束 | L1/L3/L4/L6 复用 `collectAlwaysLoad`/`collectMemoryContext`/`collectSkillRefs`/`collectManualRefs`，仅 L5 为新增逻辑 |
| graceful degradation | 任务文档 §核心设计约束 | `UnifiedSearchEngine` 未注入时退化为 v1.5；L5 查询失败不影响 L1-L4/L6 |
| ToolCallGuard 独立 | 任务文档 §核心设计约束 | 不实现 `GuardrailRule`（仅支持 FileOperation），新建独立 `ToolCallGuard` 接口 |
| 替换 SEARCH_TOOL stub | 任务文档 §核心设计约束 | 现有 `SEARCH_TOOL`（id: `'search'`）替换为 `unified_search` |
| TypeScript 严格模式 | CLAUDE.md §四 | 禁止 `any`，所有新增类型必须严格 |
| AI 建议人类决策 | CLAUDE.md §二 | 不可逆操作需确认；`ExcessiveSearchGuard` 超限需用户确认 |
| 结构化日志 | CLAUDE.md §四 | 关键操作 who/what/when/result |
| 错误不可静默 | CLAUDE.md §四 | 所有异步操作必须有明确错误处理 |

### 1.3 核心交付物

| 交付物 | 文件路径 | 类型 |
|--------|---------|------|
| v2 类型定义 | `src/main/services/context-engine/types-v2.ts` | 新建 |
| unified_search 工具 | `src/main/services/harness/tools/unified-search-tool.ts` | 新建 |
| ToolCallGuard + ExcessiveSearchGuard | `src/main/services/harness/guardrails/excessive-search.ts` | 新建 |
| v2 IPC handler | `src/main/ipc/handlers/context-engine-v2.ts` | 新建 |
| ContextEngine v2 扩展 | `src/main/services/context-engine/context-engine.ts` | 修改（追加） |
| ToolContext 扩展 + INTENT_PROFILES 更新 | `src/main/services/harness/tool-scope.ts` | 修改 |
| SEARCH_TOOL 替换 | `src/main/services/harness/built-in-tools.ts` | 修改 |
| Orchestrator 注入 ToolCallGuard | `src/main/services/harness/orchestrator.ts` | 修改 |
| AIHandler v2 集成 | `src/main/ipc/handlers/ai.handler.ts` | 修改 |
| IPC 通道常量 | `src/shared/types.ts` | 修改 |
| Preload API | `src/preload/index.ts` | 修改 |
| 主进程装配 | `src/main/index.ts` | 修改 |
| 单元测试 | `tests/main/services/context-engine/v2/` | 新建 |
| 工具测试 | `tests/main/services/harness/tools/` | 新建 |
| Guard 测试 | `tests/main/services/harness/guardrails/excessive-search.test.ts` | 新建 |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` §二 | AI 建议人类决策——ExcessiveSearchGuard 超限需用户确认 | ToolCallGuard 设计 |
| `CLAUDE.md` §四 | TS 严格模式禁止 `any`；结构化日志；异步操作必须有错误处理 | 全局代码约束 |
| `CLAUDE.md` §四 | 主进程与渲染进程严格隔离，通过 IPC 通信 | IPC 通道 + Preload API |
| `specs/design/architecture.md` | 上下文引擎架构——三层上下文模型 | v2 6 层扩展设计 |
| `specs/requirements/phase2/sprint4-semantic-search.md` §4.4 + §4.5 | ContextEngine v2 + AI 主动检索验收标准 | 验收标准来源 |
| `specs/requirements/phase1/sprint3-ai-mvp.md` | ContextEngine v1 设计基础 | 向后兼容约束 |
| `specs/requirements/phase1/sprint3.5-ai_ablities.md` | PromptComposer + ContextEngine 子模块化 | additionalSections 协作方式 |
| `specs/requirements/phase1/sprint3.1-harness-infrastructure.md` | GuardrailEngine + ToolScope 基础 | ToolCallGuard 独立接口设计 |
| `specs/tasks/phase2/phase2-task003_context-engine-v2-agentic-retrieval.md` | 8 步技术执行路径 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `ai-context-engine` | 三层上下文模型架构参考、Token 预算分配策略、上下文组装算法 | `assembleContextV2()` 6 层组装设计 + `applyV2TokenBudget()` 分层预算 |
| `electron-ipc-patterns` | IPC 通道设计、类型安全接口 | `contextEngine:v2:preview` IPC handler + Preload API `contextEngine` 命名空间 |
| `typescript-strict-mode` | 联合类型约束、泛型接口设计 | `ContextLayerTypeV2` 联合类型、`ToolCallGuard` 接口、`AssembledContextV2` 类型 |

### 2.3 前置代码依赖

| 模块 | 文件路径 | 关键接口 | 复用方式 |
|------|---------|---------|---------|
| `ContextEngine` | `context-engine/context-engine.ts` | `assembleContext()` / `assembleForHarness()` / `collectAlwaysLoad()` / `collectMemoryContext()` / `collectSkillRefs()` / `collectManualRefs()` | **追加** v2 方法，保留 v1 签名不变 |
| `PromptComposer` | `context-engine/PromptComposer.ts` | `compose(context: ComposeContext)` | **不修改**，v2 通过 `assembledContext` 消费其输出 |
| `AiModeRegistry` | `mode/ai-mode-registry.ts` | `buildSystemPromptPrefix(modeId)` | L2 层调用 |
| `ToolScopeManager` | `harness/tool-scope.ts` | `ToolContext` 接口 / `INTENT_PROFILES` / `registerTool()` | **扩展** ToolContext + 更新 INTENT_PROFILES |
| `HarnessOrchestrator` | `harness/orchestrator.ts` | `execute()` / `executeInternal()` | **最小侵入**注入 ToolCallGuard |
| `GuardrailEngine` | `harness/guardrails/engine.ts` | `GuardrailRule` 接口 | **不修改**，ToolCallGuard 独立 |
| `GuardrailTypes` | `harness/guardrails/types.ts` | `GuardrailVerdict` tagged union | 复用 verdict 类型 |
| `built-in-tools` | `harness/built-in-tools.ts` | `SEARCH_TOOL`（id: `'search'`，stub handler） | **替换**为 `unified_search` |
| `UnifiedSearchEngine` | `unified-search/unified-search-engine.ts` | `search(query): Promise<UnifiedSearchResponse>` | 通过 `setUnifiedSearch()` 注入 |
| `UnifiedSearchTypes` | `unified-search/types.ts` | `SearchSource` / `UnifiedSearchQuery` / `UnifiedSearchResult` / `UnifiedSearchResponse` | 类型引用 |
| `Tracer` | `trace/tracer.ts` | `withSpan()` | v2 span 包装 |
| `IPC_CHANNELS` | `shared/types.ts` | 已有搜索/AI 相关通道 | **扩展** `CONTEXT_ENGINE_V2_PREVIEW` |
| `estimateTokens` | `context-engine/token-utils.ts` | `estimateTokens(text): number` | Token 预算计算 |

### 2.4 被依赖关系

本任务是 Sprint 4 AI 系统线的终点，无被依赖任务。

---

## 三、现有代码盘点与差距分析

### 3.1 ContextEngine 现状（`context-engine.ts`，955 行）

**已有能力：**
- `assembleContext(request)` — 5 源并行收集（always / memory / skill / manual / mcp）+ 单一预算
- `assembleForHarness(request)` — 在 `assembleContext` 基础上叠加 AI 模式 / Guides / Handbook
- `collectAlwaysLoad()` — CLAUDE.md + currentFile + Spec 文件
- `collectMemoryContext()` — MemoryManager.search()
- `collectSkillRefs()` — SkillEngine 活跃 Skill 资源
- `collectManualRefs()` — @引用文件 + @plan 引用
- `collectMcpContext()` — MCP 工具描述
- `allocateBudget()` — 按比例分配（55/15/15/10/10 with MCP）
- `truncateToBudget()` — 句子边界截断 + TRUNCATION_MARKER
- `setTracer/PlanManager/HandbookService/AiModeRegistry/PromptComposer/McpRegistry` — setter 注入

**v2 需追加的能力缺口：**

| 缺口 | 说明 | 本任务产出 |
|------|------|-----------|
| `setUnifiedSearch()` 注入 | 无 UnifiedSearchEngine 注入点 | 新增 setter |
| `assembleContextV2()` | 6 层组装（vs v1 的 5 源） | 新增独立方法 |
| L5 跨源层 | 不存在 | 新增关键词提取 + 统一搜索 + 去重 |
| v2 分层 Token 预算 | v1 预算权重不同（55/15/15/10/10 vs v2 的 30/10/15/15/20/10） | 新增 `applyV2TokenBudget()` |
| `assembleContextV2Fallback()` | 降级到 v1.5 | 新增降级方法 |

### 3.2 ToolScopeManager 现状（`tool-scope.ts`，187 行）

**已有能力：**
- `ToolContext` 接口：`{ workspaceRoot, sessionId, logger }`
- `INTENT_PROFILES`：5 个 profile（chat/edit_file/analyze/plan/search），均包含 `'search'`
- `ToolDefinition` 接口：`{ id, name, description, schema, tags, handler }`
- `registerTool()` / `select()` / `getToolById()`

**差距：**

| 缺口 | 现状 | 需变更为 |
|------|------|---------|
| `ToolContext.unifiedSearch?` | 不存在 | 新增可选属性 |
| `INTENT_PROFILES` 中 `'search'` | placeholder stub id | 替换为 `'unified_search'` |

### 3.3 SEARCH_TOOL 现状（`built-in-tools.ts:55-73`）

**当前实现：**
```typescript
const SEARCH_TOOL: ToolDefinition = {
  id: 'search',
  name: 'Full-text Search',
  handler: async (args, ctx) => {
    return { query, limit }  // placeholder stub — 无实际搜索
  },
}
```

**差距：** handler 仅返回参数本身，无实际搜索能力。需替换为接入 `UnifiedSearchEngine` 的 `unified_search` 工具。

### 3.4 HarnessOrchestrator 现状（`orchestrator.ts`，722 行）

**已有能力：**
- `execute()` → `executeInternal()` → `executeSingle/Dual/Panel()`
- 注入 `GuardrailEngine`（构造函数）
- 注入 `ToolScopeManager`（setter）
- 工具通过 `toolScopeManager.select()` 注入到 `AssembledContext.toolDefinitions`

**差距：**

| 缺口 | 说明 |
|------|------|
| 无 `ToolCallGuard` 注入点 | 需新增 `addToolCallGuard()` + 工具调用路径注入 |
| 无 turn 结束 `resetTurn()` 调用 | 需在 turn 结束时调用所有 guard 的 `resetTurn()` |
| `ToolContext` 构造时无 `unifiedSearch` | 需注入 UnifiedSearchEngine |

**关键发现：** 当前 Orchestrator 不直接执行工具 handler（工具定义传给 AI，AI 返回 tool_call 后由上层处理）。`ToolCallGuard` 的注入点需确认实际工具调用路径。

### 3.5 GuardrailEngine 现状（`guardrails/`，4 规则 + engine）

**已有接口：**
```typescript
interface GuardrailRule {
  readonly id: string
  readonly description: string
  check(op: FileOperation, ctx: OperationContext): Promise<GuardrailVerdict>
}
```

**差距：** `GuardrailRule.check()` 接收 `FileOperation`，不支持工具调用检查。需新建独立 `ToolCallGuard` 接口。

### 3.6 UnifiedSearchEngine 现状（`unified-search/`，TASK002 已完成）

**已有接口：**
- `search(query: UnifiedSearchQuery): Promise<UnifiedSearchResponse>` — 并行查询 + 融合排序
- `listSources(): SearchSource[]` — 已注册源列表
- 构造函数注入 LocalSearchEngine / MemoryIndexer / HandbookService / FileManager / Tracer / AppEventBus

### 3.7 PromptComposer 现状（`PromptComposer.ts`，265 行）

**已有接口：**
```typescript
compose(context: ComposeContext): Promise<ComposedPrompt>
```

`ComposeContext` 中无 `additionalSections` 字段。当前 `assembleForHarness()` 通过拼接字符串到 `base.systemPrompt` 注入。v2 同样通过字符串拼接注入（不修改 PromptComposer）。

### 3.8 不存在的文件（需新建）

| 文件 | 用途 |
|------|------|
| `src/main/services/context-engine/types-v2.ts` | v2 类型定义 |
| `src/main/services/harness/tools/unified-search-tool.ts` | unified_search 工具定义 + handler |
| `src/main/services/harness/guardrails/excessive-search.ts` | ToolCallGuard 接口 + ExcessiveSearchGuard 实现 |
| `src/main/ipc/handlers/context-engine-v2.ts` | v2 调试 IPC handler |
| `tests/main/services/context-engine/v2/` | v2 测试目录 |

---

## 四、分步实施计划

### 阶段 A：v2 类型系统（Step 1） — 预计 0.5 天

#### A1：定义 v2 类型

**文件：** `sibylla-desktop/src/main/services/context-engine/types-v2.ts`（新建）

```typescript
import type { SearchSource } from '../unified-search/types'

export type ContextLayerTypeV2 =
  | 'always' | 'ai-mode' | 'memory' | 'skill' | 'cross-source' | 'manual'

export interface ContextLayerV2 {
  type: ContextLayerTypeV2
  priority: number
  content: string
  tokens: number
  hits?: number
  sources?: Array<{ kind: string; id?: string }>
}

export interface ContextAssemblyRequestV2 {
  userMessage: string
  currentFile?: string
  manualRefs: string[]
  aiMode?: import('../mode/types').AiModeDefinition
  activeSkills?: string[]
  intent?: string
  tokenBudget?: number
  forceReSearch?: boolean
}

export interface AssembledContextV2 {
  layers: ContextLayerV2[]
  systemPrompt: string
  totalTokens: number
  sources: Array<{ kind: string; id?: string }>
  warnings: string[]
}

export const V2_BUDGET_WEIGHTS: Record<ContextLayerTypeV2, number> = {
  'always': 0.30,
  'ai-mode': 0.10,
  'memory': 0.15,
  'skill': 0.15,
  'cross-source': 0.20,
  'manual': 0.10,
}
```

**验证：** `npx tsc --noEmit` 通过，v2 类型与 v1 类型无冲突

---

### 阶段 B：ContextEngine v2 核心方法（Step 2） — 预计 1.5 天

#### B1：新增 `setUnifiedSearch()` + 私有属性

**文件：** `sibylla-desktop/src/main/services/context-engine/context-engine.ts`（修改，追加）

在现有私有属性区域追加：
```typescript
private unifiedSearch?: UnifiedSearchEngine
```

新增 setter（紧跟现有 setter 方法区域）：
```typescript
setUnifiedSearch(engine: UnifiedSearchEngine): void {
  this.unifiedSearch = engine
}
```

#### B2：实现 `assembleContextV2()` 主方法

**关键实现要点：**

1. 入口检查：`if (!this.unifiedSearch) return this.assembleContextV2Fallback(request)`
2. 包裹 `tracer.withSpan('context.assemble.v2', ...)`
3. **L1 always (30%)**：调用 `this.collectAlwaysLoad(request)` → 拼接 content → 推入 layers
4. **L2 ai-mode (10%)**：调用 `this.aiModeRegistry?.buildSystemPromptPrefix()` → 推入 layers
5. **L3 memory (15%)**：调用 `this.collectMemoryContext(request)` → 拼接 content → 推入 layers
6. **L4 skill (15%)**：调用 `this.collectSkillRefs(request.activeSkills ?? [])` → 拼接 content → 推入 layers
7. **L5 cross-source (20%)**：try/catch 包裹：
   - `this.extractSearchKeywordsHeuristic(request.userMessage)` 提取关键词
   - `this.selectRelevantSources(request.intent)` 选择数据源
   - `this.unifiedSearch.search({ query, sources, limit: 8, timeoutMs: 300 })` 执行搜索
   - 去重：过滤已在 L1/L6 中出现的 `fullPath`
   - 截断：`filtered.slice(0, 5)`
   - `this.formatCrossSourceResults()` 格式化
   - catch: `logger.warn` + 跳过 L5
8. **L6 manual (10%)**：调用 `this.collectManualRefs(request.manualRefs)` → 推入 layers
9. Token 预算：`this.applyV2TokenBudget(layers, tokenBudget)`
10. 组装 system prompt：`this.assembleV2SystemPrompt(layers)`
11. 返回 `AssembledContextV2`

#### B3：实现 `assembleContextV2Fallback()` 降级方法

调用现有 `this.assembleContext()` 获取 v1 结果，映射为 `AssembledContextV2` 格式（无 L5 层）。

#### B4：实现 `applyV2TokenBudget()` 方法

- 计算总 tokens
- 若未超预算直接返回
- 若超预算：**优先压缩 L5（cross-source）**至 `Math.floor(totalBudget * 0.20)` tokens
- 截断 content 并添加 `TRUNCATION_MARKER`

#### B5：实现 `extractSearchKeywordsHeuristic()` 方法

```typescript
private extractSearchKeywordsHeuristic(message: string): string[] {
  const STOP_WORDS = new Set([
    '的', '了', '是', '我', '你', '他', '她', '它', '们', '在', '有', '不',
    '这', '那', '就', '也', '都', '要', '会', '可以', '怎么', '如何',
    'what', 'how', 'the', 'is', 'a', 'an', 'do', 'does', 'can', 'are',
    'was', 'were', 'been', 'have', 'has', 'had', 'will', 'would',
  ])
  return message
    .toLowerCase()
    .split(/[\s,.;:!?，。；：！？、\n\r\t]+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w))
    .slice(0, 6)
}
```

#### B6：实现 `selectRelevantSources()` 方法

```typescript
private selectRelevantSources(intent?: string): SearchSource[] {
  switch (intent) {
    case 'edit_file':  return ['local-files', 'memory']
    case 'analyze':    return ['local-files', 'memory', 'memory-archive', 'mcp:github', 'mcp:slack']
    case 'plan':       return ['local-files', 'memory', 'handbook']
    default:           return ['local-files', 'memory', 'mcp:github', 'mcp:slack', 'handbook']
  }
}
```

#### B7：实现 `formatCrossSourceResults()` 方法

```typescript
private formatCrossSourceResults(results: UnifiedSearchResult[]): string {
  const SOURCE_LABELS: Record<string, string> = {
    'memory': '记忆', 'memory-archive': '归档记忆',
    'mcp:github': 'GitHub', 'mcp:slack': 'Slack',
    'local-files': '本地文件', 'handbook': '系统手册',
    'plans-archive': '归档计划',
  }
  return results.map(r =>
    `### [${SOURCE_LABELS[r.source] ?? r.source}] ${r.title}\n${r.snippet}`
  ).join('\n\n')
}
```

#### B8：实现 `assembleV2SystemPrompt()` 方法

以 `SYSTEM_PROMPT_BASE` 开头，逐层追加 `--- ${layer.type} ---\n${layer.content}`，段间 `\n\n`。

**验证：** v2 6 层组装正确；v1 `assembleContext()` / `assembleForHarness()` 签名不受影响；降级正确；预算压缩正确

---

### 阶段 C：unified_search 工具 + ToolCallGuard（Step 3） — 预计 1 天

#### C1：定义 `unified_search` 工具

**文件：** `sibylla-desktop/src/main/services/harness/tools/unified-search-tool.ts`（新建）

```typescript
import type { ToolDefinition, ToolContext } from '../tool-scope'

export const unifiedSearchTool: ToolDefinition = {
  id: 'unified_search',
  name: 'Unified Search',
  description:
    'Search across all data sources (local files, memory, MCP data, handbook). ' +
    'Use when context seems insufficient to answer the user question. ' +
    'Do NOT use for simple file lookups (use reference_file instead).',
  schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      sources: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional source filter: local-files, memory, handbook, mcp:github, mcp:slack',
      },
      limit: { type: 'number', description: 'Max results (default: 5, max: 10)' },
    },
    required: ['query'],
  },
  tags: ['search', 'retrieval'],
  handler: async (args: unknown, ctx: ToolContext): Promise<unknown> => {
    const { query, sources, limit = 5 } = args as {
      query: string; sources?: string[]; limit?: number
    }
    const clampedLimit = Math.min(Math.max(1, limit), 10)

    if (!ctx.unifiedSearch) {
      return {
        results: [],
        partial: false,
        hint: 'Search engine not available. Answer based on existing context.',
      }
    }

    const response = await ctx.unifiedSearch.search({
      query,
      sources: sources as import('../../unified-search/types').SearchSource[] | undefined,
      limit: clampedLimit,
      timeoutMs: 500,
    })

    const formatted = response.results.map(r => ({
      source: r.source,
      title: r.title,
      snippet: r.snippet,
      navigation: r.navigation,
      relevance_score: r.metadata.score,
    }))

    return {
      results: formatted,
      partial: response.partial,
      hint: formatted.length === 0
        ? 'No results found. Try different keywords.'
        : `Found ${formatted.length} results. Cite using [${formatted[0]?.source}:${formatted[0]?.title}] format.`,
    }
  },
}
```

#### C2：定义 `ToolCallGuard` 接口 + `ExcessiveSearchGuard`

**文件：** `sibylla-desktop/src/main/services/harness/guardrails/excessive-search.ts`（新建）

```typescript
import type { GuardrailVerdict } from './types'

export interface ToolCallGuard {
  readonly id: string
  readonly description: string
  check(toolId: string, sessionId: string): Promise<GuardrailVerdict>
  resetTurn(sessionId: string): void
}

export class ExcessiveSearchGuard implements ToolCallGuard {
  readonly id = 'excessive-search'
  readonly description = 'Limits unified_search calls to 3 per turn'
  private readonly callCounter = new Map<string, number>()

  async check(toolId: string, sessionId: string): Promise<GuardrailVerdict> {
    if (toolId !== 'unified_search') return { allow: true }

    const count = (this.callCounter.get(sessionId) ?? 0) + 1
    this.callCounter.set(sessionId, count)

    if (count > 3) {
      return {
        allow: 'conditional',
        ruleId: this.id,
        requireConfirmation: true,
        reason: `Already called unified_search ${count} times this turn. Continue?`,
      }
    }
    return { allow: true }
  }

  resetTurn(sessionId: string): void {
    this.callCounter.delete(sessionId)
  }
}
```

#### C3：扩展 `ToolContext` 接口

**文件：** `sibylla-desktop/src/main/services/harness/tool-scope.ts`（修改）

```typescript
import type { UnifiedSearchEngine } from '../unified-search/unified-search-engine'

export interface ToolContext {
  readonly workspaceRoot: string
  readonly sessionId: string
  readonly logger: typeof loggerType
  readonly unifiedSearch?: UnifiedSearchEngine
}
```

#### C4：替换 `SEARCH_TOOL` + 更新 `INTENT_PROFILES`

**文件：** `sibylla-desktop/src/main/services/harness/built-in-tools.ts`（修改）

1. 导入 `unifiedSearchTool` 替换 `SEARCH_TOOL`
2. `registerBuiltInTools()` 中注册 `unifiedSearchTool` 替换 `SEARCH_TOOL`

**文件：** `sibylla-desktop/src/main/services/harness/tool-scope.ts`（修改）

更新 `INTENT_PROFILES` 中所有 `'search'` 为 `'unified_search'`：

```typescript
export const INTENT_PROFILES: readonly IntentProfile[] = [
  { intent: 'chat',      tools: ['reference_file', 'unified_search', 'skill_activate'],                       maxTools: 5 },
  { intent: 'edit_file', tools: ['reference_file', 'diff_write', 'unified_search', 'spec_lookup'],            maxTools: 6 },
  { intent: 'analyze',   tools: ['reference_file', 'unified_search', 'memory_query', 'graph_traverse'],       maxTools: 6 },
  { intent: 'plan',      tools: ['reference_file', 'task_create', 'memory_query', 'skill_activate'],          maxTools: 7 },
  { intent: 'search',    tools: ['unified_search', 'reference_file'],                                         maxTools: 4 },
] as const
```

**验证：** 工具注册正确；handler 返回格式正确；INTENT_PROFILES 更新正确

---

### 阶段 D：Orchestrator 注入 ToolCallGuard（Step 4） — 预计 0.5 天

#### D1：新增 ToolCallGuard 注入

**文件：** `sibylla-desktop/src/main/services/harness/orchestrator.ts`（修改，最小侵入）

1. 新增私有属性：`private toolCallGuards: ToolCallGuard[] = []`
2. 新增注入方法：`addToolCallGuard(guard: ToolCallGuard): void`
3. 在 `executeInternal()` 的 try 块结束时（return result 前），调用 `this.toolCallGuards.forEach(g => g.resetTurn(request.sessionId ?? ''))`

**重要设计说明：** 当前 Orchestrator 的工具调用由 AI 生成 tool_call，然后在 Generator 层处理。`ToolCallGuard` 的检查应在 Generator 的工具执行路径中注入（而非 Orchestrator 本身）。具体注入点需确认 Generator 的工具执行逻辑后调整。若 Generator 直接执行工具 handler，则在 handler 调用前插入 guard 检查。

#### D2：ToolContext 构造注入 UnifiedSearchEngine

在所有构造 `ToolContext` 的位置，追加 `unifiedSearch` 属性。需定位 Generator / Orchestrator 中 ToolContext 构造点。

**验证：** ToolCallGuard 注入路径正确；现有 GuardrailEngine 不受影响

---

### 阶段 E：AIHandler v2 集成（Step 5） — 预计 1 天

#### E1：v2 调用分支

**文件：** `sibylla-desktop/src/main/ipc/handlers/ai.handler.ts`（修改）

在对话处理流程中：
1. 检测是否启用 v2：`contextEngine` 已注入 `unifiedSearch` 且用户未禁用 agentic retrieval
2. 若启用：调用 `contextEngine.assembleContextV2(request)` → 获取 `AssembledContextV2`
3. 若未启用：保持原有调用链不变

#### E2：构建 ContextAssemblyRequestV2

从对话上下文中提取 `userMessage`、`currentFile`、`manualRefs`、`aiMode`、`activeSkills`、`intent`。

#### E3：处理 v2 返回结果

将 `AssembledContextV2.layers` 的内容拼接为 system prompt，传递给 Generator。

#### E4："重新搜索"命令支持

监听 `contextEngine:v2:preview` IPC，触发时设置 `forceReSearch: true`。

**验证：** AI 对话链路完整：用户提问 → v2 组装 → system prompt → Generator → 流式响应

---

### 阶段 F：IPC + 用户设置 + 主进程装配（Steps 6-7） — 预计 0.5 天

#### F1：IPC 通道 + Preload

**文件：** `src/shared/types.ts`（扩展）
- 新增 `CONTEXT_ENGINE_V2_PREVIEW: 'contextEngine:v2:preview'`

**文件：** `src/preload/index.ts`（扩展）
- 新增 `contextEngine` 命名空间：
  ```typescript
  contextEngine: {
    v2Preview: (request) => ipcRenderer.invoke('contextEngine:v2:preview', request),
  }
  ```

#### F2：IPC Handler

**文件：** `src/main/ipc/handlers/context-engine-v2.ts`（新建）
- 注册 `contextEngine:v2:preview` handler
- 调用 `contextEngine.assembleContextV2(request)`
- 返回 `AssembledContextV2`

#### F3：用户设置

在用户设置 store 中新增 `agenticRetrievalEnabled: boolean`（默认 `true`）。当 `false` 时 AIHandler 使用 v1 调用链，`INTENT_PROFILES` 中移除 `'unified_search'`。

#### F4：主进程装配

**文件：** `src/main/index.ts`（修改）

```typescript
contextEngine.setUnifiedSearch(unifiedSearchEngine)

const excessiveSearchGuard = new ExcessiveSearchGuard()
orchestrator.addToolCallGuard(excessiveSearchGuard)
```

**验证：** 完整装配链路可用

---

### 阶段 G：单元测试（Step 8） — 预计 1 天

#### G1：v2 核心方法测试

**文件：** `tests/main/services/context-engine/v2/assemble-context-v2.test.ts`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 6 层组装完整 | mock UnifiedSearchEngine，所有 6 层均存在 |
| 2 | L5 搜索结果去重 | 过滤 L1/L6 中已有的 fullPath |
| 3 | L5 失败 graceful degradation | 跳过 L5，L1-L4/L6 不受影响 |
| 4 | v2 降级（无 UnifiedSearchEngine） | 退化为 v1.5 行为 |
| 5 | forceReSearch=true | L5 重新评估（跳过缓存） |

**文件：** `tests/main/services/context-engine/v2/token-budget-v2.test.ts`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 正常预算不压缩 | layers 完整保留 |
| 2 | 预算超限 L5 优先压缩 | cross-source 层被截断 |
| 3 | 压缩后不超过预算 | totalTokens ≤ tokenBudget |

**文件：** `tests/main/services/context-engine/v2/keyword-extraction.test.ts`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 中文消息停用词过滤 | "的/了/是" 被过滤 |
| 2 | 英文消息停用词过滤 | "the/is/how" 被过滤 |
| 3 | 空消息返回空数组 | |
| 4 | 长消息截取前 6 词 | |

**文件：** `tests/main/services/context-engine/v2/source-selection.test.ts`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | edit_file 意图 | → local-files + memory |
| 2 | analyze 意图 | → local-files + memory + archive + mcp |
| 3 | 默认意图 | → 完整源列表 |

**文件：** `tests/main/services/context-engine/v2/cross-source-format.test.ts`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | sourceLabel 映射 | memory → 记忆，mcp:github → GitHub |
| 2 | 格式化输出 | `### [记忆] title\nsnippet` |

#### G2：工具测试

**文件：** `tests/main/services/harness/tools/unified-search-tool.test.ts`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 正常调用（mock ctx.unifiedSearch） | 返回 results + hint |
| 2 | ctx.unifiedSearch 未注入 | 返回空结果 + hint |
| 3 | 返回格式 | source/title/snippet/navigation/relevance_score |

#### G3：ExcessiveSearchGuard 测试

**文件：** `tests/main/services/harness/guardrails/excessive-search.test.ts`

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 非 unified_search 工具 | 直接放行 |
| 2 | 3 次以内 | allow: true |
| 3 | 超过 3 次 | allow: 'conditional' |
| 4 | resetTurn | 清零后重新计数 |
| 5 | 多 sessionId 隔离 | 不同 session 独立计数 |

**覆盖率目标：** ≥ 80%

---

## 五、验收标准追踪

### ContextEngine v2 — 核心方法

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | `setUnifiedSearch(engine)` 可用 | B1 setter | 手动验证 |
| 2 | `assembleContextV2()` 返回 6 层 | B2 主方法 | G1-1 |
| 3 | `assembleContext()` / `assembleForHarness()` 签名不变 | 不修改 v1 方法 | 回归测试 |
| 4 | 无 UnifiedSearchEngine 退化为 v1.5 | B3 fallback | G1-4 |

### L5 跨源层

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 关键词提取 + UnifiedSearchEngine.search() 300ms | B2 + B5 + B6 | G1-1 |
| 2 | L5 去重（过滤 L1/L6 已有路径） | B2 去重逻辑 | G1-2 |
| 3 | L5 结果按 20% Token 预算限制，最多 5 条 | B4 applyV2TokenBudget | G1-5 |
| 4 | L5 结果标注来源 `### [sourceLabel] title` | B7 formatCrossSourceResults | G1-6 |
| 5 | L5 查询失败 graceful degradation | B2 try/catch | G1-3 |

### 分层 Token 预算

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | v2 权重 30/10/15/15/20/10 | A1 V2_BUDGET_WEIGHTS | G1-1 |
| 2 | 预算紧张优先压缩 L5 | B4 | G2-2 |
| 3 | 压缩后添加 TRUNCATION_MARKER | B4 | G2-3 |

### unified_search 工具

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | id 为 `'unified_search'` | C1 | G2-1 |
| 2 | SEARCH_TOOL stub 已替换 | C4 built-in-tools | 回归测试 |
| 3 | INTENT_PROFILES 全部更新 | C4 tool-scope | 回归测试 |
| 4 | ToolContext 新增 unifiedSearch | C3 | G2-2 |
| 5 | 工具返回 top 5 + hint | C1 handler | G2-1 |
| 6 | 工具调用产生 Trace span | C1 handler | 手动验证 |

### ExcessiveSearchGuard

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | ToolCallGuard 独立于 GuardrailRule | C2 接口定义 | G3-1 |
| 2 | 3 次以内放行 | C2 check() | G3-2 |
| 3 | 超过 3 次 conditional | C2 check() | G3-3 |
| 4 | resetTurn 清零 | C2 resetTurn() | G3-4 |
| 5 | 多 sessionId 隔离 | C2 callCounter Map | G3-5 |

### 性能要求

| # | 验收标准 | 目标 | 验证方式 |
|---|---------|------|---------|
| 1 | v2 组装含 L5 | < 800ms | 性能测试 |
| 2 | unified_search 工具调用 | < 500ms | 性能测试 |
| 3 | v2 降级性能 | 与 v1.5 一致 | 对比测试 |

---

## 六、风险与缓解

| # | 风险 | 影响 | 概率 | 缓解策略 |
|---|------|------|------|---------|
| 1 | **L5 搜索延迟超标** — UnifiedSearchEngine 300ms 超时可能不够，导致 L5 层经常返回部分结果 | 中 | 中 | L5 有 graceful degradation，搜索失败不影响 L1-L4/L6；可调整超时参数 |
| 2 | **关键词提取质量差** — 启发式提取可能提取出无意义词汇，导致搜索结果不相关 | 中 | 中 | v2 仅做辅助增强，搜索结果不理想时 AI 仍可基于 L1-L4 上下文回答；后续可引入 LLM 辅助提取 |
| 3 | **v1 向后兼容破坏** — 追加方法可能意外修改现有类属性导致 v1 行为变化 | 高 | 低 | v2 为独立方法，不复用 v1 内部流程；所有 v1 测试必须回归通过 |
| 4 | **ToolCallGuard 注入点不明确** — Orchestrator 不直接执行工具，guard 实际注入点需在 Generator 层 | 中 | 中 | 先在 Orchestrator 层提供 guard 实例，Generator 执行工具时调用；需确认 Generator 工具执行路径 |
| 5 | **INTENT_PROFILES 更新影响现有工具** — 将 `'search'` 替换为 `'unified_search'` 可能影响其他引用 | 中 | 低 | `SEARCH_TOOL` stub 本身无实际功能，替换为有实际功能的 `unified_search` 是纯增强 |
| 6 | **Token 预算不足导致 L5 被过度压缩** — 20% 预算在总预算较小时几乎无空间 | 低 | 中 | 最低保留 500 tokens 给 L5；总预算过小时跳过 L5 |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 | 验证方式 |
|----|------|--------|---------|
| Day 1 上午 | A1 | `types-v2.ts` 完成 | `npx tsc --noEmit` 通过 |
| Day 1 下午 | B1-B3 | `assembleContextV2()` + `setUnifiedSearch()` + fallback 完成 | 单元测试 |
| Day 2 上午 | B4-B8 | 辅助方法（预算/关键词/源选择/格式化）完成 | 单元测试 |
| Day 2 下午 | C1-C4 | unified_search 工具 + ToolCallGuard + INTENT_PROFILES 更新 | 单元测试 |
| Day 3 上午 | D1-D2 | Orchestrator 注入 ToolCallGuard | 集成验证 |
| Day 3 下午 | E1-E4 | AIHandler v2 集成 | 端到端验证 |
| Day 4 上午 | F1-F4 | IPC + Preload + 用户设置 + 主进程装配 | IPC 链路验证 |
| Day 4 下午 | G1 | v2 核心方法测试 | `npx vitest run` |
| Day 5 | G2-G3 | 工具测试 + Guard 测试 + 覆盖率 ≥ 80% | `npx vitest run --coverage` |
| Day 6 | — | 集成验证 + Bug 修复 + 性能测试 | 全量回归 |

### 关键里程碑

| 里程碑 | 时间点 | 判定标准 |
|--------|--------|---------|
| M1: v2 类型就绪 | Day 1 结束 | `ContextLayerTypeV2` + `AssembledContextV2` 类型完成，`tsc --noEmit` 通过 |
| M2: v2 核心方法就绪 | Day 2 结束 | `assembleContextV2()` 6 层组装正确，降级正确，预算压缩正确 |
| M3: 工具系统就绪 | Day 3 结束 | unified_search 工具 + ExcessiveSearchGuard + Orchestrator 注入完成 |
| M4: AI 对话链路贯通 | Day 4 结束 | v2 → PromptComposer → Generator → 流式响应完整 |
| M5: 全量验收通过 | Day 5 结束 | 所有单元测试通过，覆盖率 ≥ 80% |

---

**文档版本**: v1.0
**最后更新**: 2026-04-28
**维护者**: Sibylla 架构团队

