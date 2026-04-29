# PHASE2-TASK002: 跨源统一搜索引擎与搜索 UI — 实施计划

> 任务来源：[specs/tasks/phase2/phase2-task002_unified-search-engine-ui.md](../../specs/tasks/phase2/phase2-task002_unified-search-engine-ui.md)
> 创建日期：2026-04-28
> 最后更新：2026-04-28

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK002 |
| **任务标题** | 跨源统一搜索引擎与搜索 UI |
| **所属阶段** | Phase 2 - 跨源数据统一与上下文引擎 v2 (Sprint 4) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 5-6 工作日 |
| **前置依赖** | PHASE2-TASK001（事件总线）+ TASK015（LocalSearchEngine）+ TASK025（MemoryIndexer）+ TASK033（HandbookService） |

### 1.1 目标

构建跨源统一搜索引擎与搜索 UI，让用户用一个搜索框即可检索本地文件、AI 记忆、MCP 同步数据、归档内容等所有数据源。核心交付：

1. **统一搜索类型系统** — `SearchSource`/`UnifiedSearchQuery`/`UnifiedSearchResult`/`UnifiedSearchResponse`
2. **SearchSourceAdapter 抽象** — 4 个 Adapter 分别包装现有引擎（不修改底层代码）
3. **UnifiedSearchEngine 核心** — 并行查询 + 超时隔离 + 跨源融合排序 + 去重
4. **融合排序模块** — `ranking.ts`（加权评分 + 源优先级 + 去重 key）
5. **统一搜索 IPC handler** — `search:unified:query` / `search:unified:listSources` / `search:fuzzyFiles`
6. **UnifiedSearchPalette 组件** — Ctrl+P 唤起，150ms 防抖，按源分组，键盘导航
7. **命令面板互通** — Ctrl+K 命令面板追加搜索结果展示
8. **源前缀过滤** — `mem:`/`file:`/`mcp:` 查询语法解析

### 1.2 核心设计约束（来自 CLAUDE.md + 任务文档）

| 约束 | 来源 | 具体要求 |
|------|------|----------|
| 不重建已有索引 | 任务文档 §核心设计约束 | 每个 DataSource 通过 Adapter 模式接入，不修改 LocalSearchEngine/MemoryIndexer/HandbookService |
| 同步方法适配 | 任务文档 §核心设计约束 | `LocalSearchEngine.search()` 是同步方法，Adapter 内部 `Promise.resolve()` 包装 |
| 字段名映射 | 任务文档 §核心设计约束 | MemoryIndexer 返回 `finalScore/vecScore/bm25Score`，统一搜索使用 `score/vectorScore/bm25Score`，Adapter 负责映射 |
| 并行查询 + 超时隔离 | 需求 4.2 §验收标准 | 所有源并行查询，单源超时 >500ms 返回部分结果 |
| 跨源融合排序 | 需求 4.2 §验收标准 | 权重 `vector:0.4 / fts:0.4 / recency:0.1 / sourcePriority:0.1` |
| Ctrl+P 独立于 Ctrl+K | 任务文档 §核心设计约束 | 统一搜索与命令面板独立但互通 |
| 个人空间隔离 | CLAUDE.md §七 | 非 Admin 搜索结果不包含其他成员 `personal/[name]/` 内容 |
| TypeScript 严格模式 | CLAUDE.md §四 | 禁止 `any`，所有新增类型必须严格 |
| IPC 安全隔离 | CLAUDE.md §四 | 渲染进程不得直接访问文件系统，通过 IPC 通信 |
| 结构化日志 | CLAUDE.md §四 | 关键操作必须有 who/what/when/result 日志 |
| 错误不可静默 | CLAUDE.md §四 | 所有异步操作必须有明确错误处理 |

### 1.3 核心交付物

| 交付物 | 文件路径 | 类型 |
|--------|---------|------|
| 统一搜索类型系统 | `src/main/services/unified-search/types.ts` | 新建 |
| 融合排序模块 | `src/main/services/unified-search/ranking.ts` | 新建 |
| LocalFilesAdapter | `src/main/services/unified-search/adapters/local-files-adapter.ts` | 新建 |
| MemoryAdapter | `src/main/services/unified-search/adapters/memory-adapter.ts` | 新建 |
| HandbookAdapter | `src/main/services/unified-search/adapters/handbook-adapter.ts` | 新建 |
| McpAdapter | `src/main/services/unified-search/adapters/mcp-adapter.ts` | 新建 |
| UnifiedSearchEngine | `src/main/services/unified-search/unified-search-engine.ts` | 新建 |
| IPC handler | `src/main/ipc/handlers/unified-search.ts` | 新建 |
| IPC 通道常量 | `src/shared/types.ts` | 修改（扩展） |
| Preload API | `src/preload/index.ts` | 修改（扩展） |
| 搜索面板组件 | `src/renderer/components/search/UnifiedSearchPalette.tsx` | 新建 |
| 分组展示组件 | `src/renderer/components/search/SourceGroup.tsx` | 新建 |
| 结果项组件 | `src/renderer/components/search/SearchResultItem.tsx` | 新建 |
| 空状态组件 | `src/renderer/components/search/EmptyState.tsx` | 新建 |
| 防抖 hook | `src/renderer/hooks/useDebounce.ts` | 新建 |
| 键盘导航 hook | `src/renderer/hooks/useKeyboardNavigation.ts` | 新建 |
| 命令面板互通 | `src/renderer/components/command-palette/CommandPalette.tsx` | 修改 |
| 主进程装配 | `src/main/index.ts` | 修改 |
| 单元测试（主进程） | `tests/main/services/unified-search/` | 新建 |
| 单元测试（渲染进程） | `tests/renderer/components/search/` | 新建 |
| IPC handler 测试 | `tests/main/ipc/unified-search-handler.test.ts` | 新建 |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` §二 | 文件即真相——搜索结果指向实际文件路径 | 导航跳转设计 |
| `CLAUDE.md` §四 | TS 严格模式禁止 `any`；结构化日志；异步操作必须有错误处理 | 全局代码约束 |
| `CLAUDE.md` §四 | 主进程与渲染进程严格隔离，通过 IPC 通信 | IPC 搜索通道 + Preload API |
| `CLAUDE.md` §七 | 个人空间 `personal/[name]/` 隔离 | LocalFilesAdapter 过滤逻辑 |
| `specs/design/architecture.md` §3.2 | 进程通信架构：Renderer ↔ IPC ↔ Main | IPC 通道设计与 Preload API |
| `specs/design/architecture.md` §2.1 | 技术栈：Electron + React + TypeScript + Zustand | 技术选型约束 |
| `specs/design/testing-and-security.md` | 测试金字塔、覆盖率 ≥ 80% | 单元测试策略 |
| `specs/requirements/phase2/sprint4-semantic-search.md` §4.2 | 统一搜索引擎验收标准 8 条 + 技术规格 | 验收标准来源 |
| `specs/requirements/phase2/sprint4-semantic-search.md` §4.3 | 统一搜索 UI 验收标准 8 条 + UI 规格 | UI 实施蓝图 |
| `specs/tasks/phase2/phase2-task002_unified-search-engine-ui.md` | 8 步技术执行路径、完整验收标准 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `electron-ipc-patterns` | IPC 通道设计、类型安全接口 | `search:unified:query`/`search:fuzzyFiles` IPC handler + Preload API `search` 命名空间 |
| `typescript-strict-mode` | 泛型搜索类型设计、联合类型约束、类型守卫 | `SearchSource` 联合类型、`SearchSourceAdapter` 泛型接口、`RankingWeights` 接口 |
| `sqlite-local-storage` | FTS5 查询优化、索引理解 | LocalFilesAdapter/MemoryAdapter 的底层查询理解 |

### 2.3 前置代码依赖

| 模块 | 文件路径 | 关键接口 | 复用方式 |
|------|---------|---------|---------|
| `LocalSearchEngine` | `src/main/services/local-search-engine.ts` | `search(params: SearchQueryParams): SearchResult[]`（**同步方法**） | **不修改**，LocalFilesAdapter 包装为 async |
| `SearchResult` | `src/shared/types.ts` | `{ id, path, snippet, rank, matchCount }` | 类型映射源 |
| `SearchQueryParams` | `src/shared/types.ts` | `{ query, limit }` | 查询参数类型 |
| `MemoryIndexer` | `src/main/services/memory/memory-indexer.ts` | `search(query, options?): Promise<HybridSearchResult[]>` | **不修改**，MemoryAdapter 做字段名映射 |
| `HybridSearchResult` | `src/main/services/memory/types.ts:235-245` | `{ id, section, content, confidence, hits, isArchived, vecScore, bm25Score, finalScore }` | **字段名映射**：`finalScore`→`score`、`vecScore`→`vectorScore` |
| `SearchOptions` | `src/main/services/memory/types.ts:247-253` | `{ limit, sectionFilter, includeArchived, minConfidence, weights }` | 查询参数映射 |
| `HandbookService` | `src/main/services/handbook/handbook-service.ts` | `search(query, options?): HandbookEntry[]`（**同步方法**） | **不修改**，HandbookAdapter 包装为 async 并自行计算 score/snippet |
| `HandbookEntry` | `src/main/services/handbook/types.ts` | `{ id, title, content, category, tags }` | 类型映射源 |
| `AppEventBus` | `src/main/services/event-bus.ts` | `emitEvent<T>()`、`subscribe()` | 注入，发布 `search.executed` 事件 |
| `SibyllaEventType` | `src/main/services/event-bus-types.ts` | `'search.executed'` | 事件类型引用 |
| `Tracer` | `src/main/services/trace/tracer.ts` | `withSpan()` | 注入，搜索产生 Trace span（kind='tool-call'） |
| `FileManager` | `src/main/services/file-manager.ts` | `readFile()`、`listFiles()` | McpAdapter 扫描 MCP 数据目录 |
| `CommandPalette` | `src/renderer/components/command-palette/CommandPalette.tsx` | Ctrl+K 唤起、`useCommandStore` | **扩展**：追加搜索结果展示 |
| `useCommandStore` | `src/renderer/store/commandStore.ts` | Zustand store | 命令面板互通时消费 |
| `IPC_CHANNELS` | `src/shared/types.ts` | 已有 `SEARCH_QUERY`/`SEARCH_INDEX_STATUS` 等 | **扩展**：新增 `SEARCH_UNIFIED_QUERY`/`SEARCH_UNIFIED_LIST_SOURCES`/`SEARCH_FUZZY_FILES` |
| `IPCChannelMap` | `src/shared/types.ts` | 类型映射 | **扩展**：注册新通道的类型签名 |
| `Preload API` | `src/preload/index.ts` | `ALLOWED_CHANNELS` + `safeInvoke<T>()` | **扩展**：新增 `search` 命名空间 |
| 主进程服务装配 | `src/main/index.ts` | 服务初始化顺序 | **修改**：创建 `UnifiedSearchEngine` 实例 |

### 2.4 被依赖关系（下游消费者）

| 下游任务 | 消费的接口 | 阻塞关系 |
|---------|-----------|----------|
| PHASE2-TASK003 ContextEngine v2 | `UnifiedSearchEngine` 实例（通过 `setUnifiedSearch()` 注入） | 强依赖：L5 跨源层消费搜索结果 |
| PHASE2-TASK003 AI 主动检索 | `unified_search` 工具 handler | 强依赖：工具调用链路 |
| PHASE2-TASK004 双向链接 | `search:fuzzyFiles` IPC | 强依赖：wiki-link 补全 |
| Sprint 5 通知系统 | `search.executed` 事件 | 弱依赖：搜索触发通知 |

---

## 三、现有代码盘点与差距分析

### 3.1 LocalSearchEngine 现状（`local-search-engine.ts`，251 行）

**已有能力：**
- `search(params: SearchQueryParams): SearchResult[]` — **同步方法**，基于 FTS5 全文检索
- `buildIndex()` — 扫描工作区文件建立 FTS5 索引
- `onFileChange()` — 监听文件变更更新索引
- `SearchResult` 类型：`{ id, path, snippet, rank, matchCount }`
- `EXCLUDED_PATHS` 已排除 `.git/`、`node_modules/`、`.sibylla/index/`、`.sibylla/memory/`
- `INDEXABLE_EXTENSIONS` 覆盖 `.md`、`.txt`、`.json`、`.ts`、`.css` 等

**Adapter 需处理的差异：**
| 差异点 | LocalSearchEngine 现状 | UnifiedSearchResult 要求 | Adapter 处理 |
|--------|----------------------|-------------------------|-------------|
| 返回类型 | `SearchResult[]`（同步） | `Promise<UnifiedSearchResult[]>` | `Promise.resolve()` 包装 |
| 得分字段 | `rank` | `score` + `bm25Score` | `rank` 映射到两个字段 |
| 结果 ID | `path::rank` 格式 | 跨源唯一 `local:${r.id}` | 重新生成 ID |
| 路径过滤 | 无 handbook/mcp 排除 | 需排除 `handbook/`、MCP 子目录 | `exclude` 选项过滤 |
| 标题 | 无，仅 `path` | `title` 字段 | `path.split('/').pop()` |
| 个人空间 | 无过滤逻辑 | 需按用户权限过滤 | 构造函数注入 `currentUser`/`isAdmin` |

### 3.2 MemoryIndexer 现状（`memory-indexer.ts`，649 行）

**已有能力：**
- `search(query, options?): Promise<HybridSearchResult[]>` — 混合检索（向量 + FTS5 + 时间衰减）
- 自动降级：向量不可用时退化为 FTS5-only
- `HybridSearchResult`：`{ id, section, content, confidence, hits, isArchived, vecScore, bm25Score, finalScore }`
- `SearchOptions`：`{ limit, sectionFilter, includeArchived, minConfidence, weights }`
- 默认权重：`{ vector: 0.6, bm25: 0.3, timeDecay: 0.1 }`

**Adapter 需处理的差异：**
| 差异点 | MemoryIndexer 现状 | UnifiedSearchResult 要求 | Adapter 处理 |
|--------|-------------------|-------------------------|-------------|
| 得分字段名 | `finalScore` | `score` | 字段名重映射 |
| 向量得分字段名 | `vecScore` | `vectorScore` | 字段名重映射 |
| 标题 | `content` 中可能含 `# title` | `title` 字段 | `deriveTitle()` 从 content 提取 |
| Snippet | 无，仅完整 `content` | `snippet` + 高亮 | `highlightMatch()` 截取匹配片段 |
| 活跃/归档区分 | `isArchived` 布尔字段 | `source: 'memory'` vs `'memory-archive'` | 两个 Adapter 实例，`options.archived` 控制 |
| 时间字段 | `updatedAt` 在 `memory_entries` 中但不在 `HybridSearchResult` | `metadata.updatedAt` | 设为 `undefined` |

### 3.3 HandbookService 现状（`handbook-service.ts`，284 行）

**已有能力：**
- `search(query, options?): HandbookEntry[]` — **同步方法**，底层复用 `DatabaseManager.searchFiles()`
- `HandbookEntry`：`{ id, title, content, category, tags, language }`
- 自动加载内置 + 本地 Handbook 条目
- 通过 `HandbookIndexer` 独立索引

**Adapter 需处理的差异：**
| 差异点 | HandbookService 现状 | UnifiedSearchResult 要求 | Adapter 处理 |
|--------|---------------------|-------------------------|-------------|
| 返回类型 | `HandbookEntry[]`（同步） | `Promise<UnifiedSearchResult[]>` | `Promise.resolve()` 包装 |
| 得分 | **不返回 score** | `metadata.score` | 自行计算：关键词命中数 / 总词数 |
| Snippet | **不返回 snippet** | `snippet` 字段 | 自行截取匹配位置前后各 80 字符 |
| 导航 | `entryId` | `navigation: { kind: 'handbook', entryId }` | 构造导航对象 |

### 3.4 IPC 通道与 Preload 现状

**`shared/types.ts`（已有搜索相关通道）：**
- `SEARCH_QUERY: 'search:query'` — 已有，用于 LocalSearchEngine 直接查询
- `SEARCH_INDEX_STATUS: 'search:indexStatus'` — 已有
- `SEARCH_REINDEX: 'search:reindex'` — 已有
- `MEMORY_V2_SEARCH: 'memory:search'` — 已有
- `HANDBOOK_SEARCH: 'handbook:search'` — 已有
- **缺失：** `SEARCH_UNIFIED_QUERY`、`SEARCH_UNIFIED_LIST_SOURCES`、`SEARCH_FUZZY_FILES`

**`preload/index.ts`：**
- 已有 `search` 命名空间（直接调用 `search:query`）
- **缺失：** `search.unified()`、`search.listSources()`、`search.fuzzyFiles()` 方法

### 3.5 命令面板现状（`CommandPalette.tsx`，133 行）

**已有能力：**
- `useCommandStore` Zustand 状态管理（`isOpen`/`query`/`results`/`selectedIndex`）
- `Ctrl+K` 全局快捷键唤起
- `↑/↓` 键导航、`Enter` 执行、`ESC` 关闭
- 命令按 `category` 分组展示

**扩展需求：**
- 在搜索结果中追加统一搜索结果（限制 3 条）
- 点击搜索结果执行与 `UnifiedSearchPalette` 相同的导航
- 不影响现有命令搜索逻辑

### 3.6 不存在的文件（需新建）

| 文件 | 用途 |
|------|------|
| `src/main/services/unified-search/types.ts` | 统一搜索类型系统 |
| `src/main/services/unified-search/ranking.ts` | 融合排序与去重 |
| `src/main/services/unified-search/unified-search-engine.ts` | 统一搜索引擎核心 |
| `src/main/services/unified-search/adapters/local-files-adapter.ts` | 本地文件搜索适配 |
| `src/main/services/unified-search/adapters/memory-adapter.ts` | 记忆条目搜索适配 |
| `src/main/services/unified-search/adapters/handbook-adapter.ts` | 系统 Wiki 搜索适配 |
| `src/main/services/unified-search/adapters/mcp-adapter.ts` | MCP 数据源适配 |
| `src/main/ipc/handlers/unified-search.ts` | 统一搜索 IPC handler |
| `src/renderer/components/search/UnifiedSearchPalette.tsx` | 搜索面板主组件 |
| `src/renderer/components/search/SourceGroup.tsx` | 按源分组展示组件 |
| `src/renderer/components/search/SearchResultItem.tsx` | 单条结果组件 |
| `src/renderer/components/search/EmptyState.tsx` | 空结果状态组件 |
| `src/renderer/hooks/useDebounce.ts` | 防抖 hook |
| `src/renderer/hooks/useKeyboardNavigation.ts` | 键盘导航 hook |
| `tests/main/services/unified-search/` | 主进程测试目录 |
| `tests/renderer/components/search/` | 渲染进程测试目录 |

---

## 四、分步实施计划

### 阶段 A：类型基础设施 + 融合排序（Step 1） — 预计 0.5 天

#### A1：定义统一搜索类型系统

**文件：** `sibylla-desktop/src/main/services/unified-search/types.ts`（新建）

```typescript
export type SearchSource =
  | 'local-files'
  | 'memory'
  | 'memory-archive'
  | 'handbook'
  | 'mcp:github'
  | 'mcp:slack'
  | 'mcp:notion'
  | 'plans-archive'

export interface RankingWeights {
  vector: number      // 默认 0.4
  fts: number         // 默认 0.4
  recency: number     // 默认 0.1
  sourcePriority: number  // 默认 0.1
}

export interface UnifiedSearchQuery {
  query: string
  sources?: SearchSource[]
  filters?: {
    fileTypes?: string[]
    pathPrefix?: string
    minConfidence?: number
    timeRange?: { from: Date; to: Date }
  }
  limit?: number        // 默认 20
  offset?: number
  rankingWeights?: RankingWeights
  timeoutMs?: number    // 默认 500
}

export interface UnifiedSearchResult {
  id: string            // 跨源唯一 ID（格式：`local:xxx` / `memory:xxx`）
  source: SearchSource
  type: 'file' | 'memory-entry' | 'handbook-entry' | 'mcp-record'
  title: string
  snippet: string
  fullPath?: string
  metadata: {
    score: number
    vectorScore?: number
    bm25Score?: number
    recencyScore?: number
    confidence?: number
    updatedAt?: string
    [key: string]: unknown
  }
  navigation:
    | { kind: 'file'; path: string; line?: number }
    | { kind: 'memory'; entryId: string }
    | { kind: 'handbook'; entryId: string }
    | { kind: 'external'; url: string }
}

export interface UnifiedSearchResponse {
  results: UnifiedSearchResult[]
  totalCount: number
  partial: boolean
  timing: {
    totalMs: number
    perSource: Record<string, number>
  }
}

export interface SearchSourceAdapter {
  search(query: UnifiedSearchQuery): Promise<UnifiedSearchResult[]>
}

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  vector: 0.4,
  fts: 0.4,
  recency: 0.1,
  sourcePriority: 0.1,
}
```

#### A2：实现融合排序模块

**文件：** `sibylla-desktop/src/main/services/unified-search/ranking.ts`（新建）

```typescript
import type { UnifiedSearchResult, RankingWeights, SearchSource } from './types'
import { DEFAULT_RANKING_WEIGHTS } from './types'

export const SOURCE_PRIORITY: Record<SearchSource, number> = {
  'memory': 1.0,
  'local-files': 0.9,
  'mcp:github': 0.85,
  'mcp:notion': 0.85,
  'mcp:slack': 0.8,
  'handbook': 0.7,
  'memory-archive': 0.5,
  'plans-archive': 0.5,
}

export function calculateFinalScore(
  result: UnifiedSearchResult,
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS,
): number {
  const { metadata, source } = result
  const vecScore = metadata.vectorScore ?? metadata.score
  const ftsScore = metadata.bm25Score ?? metadata.score
  const recency = metadata.recencyScore ?? 0.5
  const sourcePri = SOURCE_PRIORITY[source] ?? 0.5

  return weights.vector * vecScore
    + weights.fts * ftsScore
    + weights.recency * recency
    + weights.sourcePriority * sourcePri
}

export function dedupKey(result: UnifiedSearchResult): string {
  if (result.fullPath) return result.fullPath
  const snippetHead = result.snippet.slice(0, 100)
  let hash = 0
  for (let i = 0; i < snippetHead.length; i++) {
    hash = ((hash << 5) - hash + snippetHead.charCodeAt(i)) | 0
  }
  return `${result.source}:${Math.abs(hash)}`
}

export function mergeAndRank(
  results: UnifiedSearchResult[],
  weights?: RankingWeights,
): UnifiedSearchResult[] {
  const w = weights ?? DEFAULT_RANKING_WEIGHTS

  const scored = results.map(r => {
    const finalScore = calculateFinalScore(r, w)
    return { ...r, metadata: { ...r.metadata, score: finalScore } }
  })

  const seen = new Map<string, UnifiedSearchResult>()
  for (const r of scored.sort((a, b) => b.metadata.score - a.metadata.score)) {
    const key = dedupKey(r)
    if (!seen.has(key)) seen.set(key, r)
  }

  return Array.from(seen.values())
    .sort((a, b) => b.metadata.score - a.metadata.score)
}
```

**验证：** `npx tsc --noEmit` 类型检查通过，无 `any`

---

### 阶段 B：Adapter 实现（Steps 2-4） — 预计 1.5 天

#### B1：LocalFilesAdapter（Step 2）

**文件：** `sibylla-desktop/src/main/services/unified-search/adapters/local-files-adapter.ts`（新建）

**关键实现要点：**

1. 构造函数接收 `LocalSearchEngine`、`{ exclude: string[], currentUser: string, isAdmin: boolean }`
2. `search()` 方法：调用 `this.localSearch.search()`（同步），包装为 `Promise.resolve()`
3. 按 `exclude` 数组过滤路径前缀（排除 `handbook/`、`docs/logs/`、`.sibylla/inbox/` 等 MCP 子目录）
4. 个人空间隔离：非 Admin 过滤掉 `personal/[非当前用户]/` 路径
5. 字段映射：`r.rank` → `metadata.score` + `metadata.bm25Score`；`r.path.split('/').pop()` → `title`
6. `id` 生成：`local:${r.path}::${r.rank}`

```typescript
export class LocalFilesAdapter implements SearchSourceAdapter {
  constructor(
    private readonly localSearch: LocalSearchEngine,
    private readonly options: {
      exclude: string[]
      currentUser: string
      isAdmin: boolean
    },
  ) {}

  async search(query: UnifiedSearchQuery): Promise<UnifiedSearchResult[]> {
    const syncResults = this.localSearch.search({
      query: query.query,
      limit: (query.limit ?? 20) * 2,
    })

    return syncResults
      .filter(r => !this.options.exclude.some(e => r.path.startsWith(e)))
      .filter(r => this.filterPersonalSpace(r.path))
      .map(r => ({
        id: `local:${r.path}::${r.rank}`,
        source: 'local-files' as const,
        type: 'file' as const,
        title: r.path.split('/').pop() ?? r.path,
        snippet: r.snippet,
        fullPath: r.path,
        metadata: { score: r.rank, bm25Score: r.rank, matchCount: r.matchCount },
        navigation: { kind: 'file' as const, path: r.path },
      }))
  }

  private filterPersonalSpace(filePath: string): boolean {
    if (this.options.isAdmin) return true
    const personalPrefix = 'personal/'
    if (!filePath.startsWith(personalPrefix)) return true
    return filePath.startsWith(`personal/${this.options.currentUser}/`)
  }
}
```

**验证：** 同步→异步包装正确；路径排除正确；个人空间隔离正确

#### B2：MemoryAdapter（Step 3）

**文件：** `sibylla-desktop/src/main/services/unified-search/adapters/memory-adapter.ts`（新建）

**关键实现要点：**

1. 构造函数接收 `MemoryIndexer` 和 `{ archived: boolean }`
2. 调用 `this.indexer.search(query, { limit, includeArchived })` 复用现有搜索接口
3. **字段名映射**（关键）：
   - `h.finalScore` → `metadata.score`
   - `h.vecScore` → `metadata.vectorScore`
   - `h.bm25Score` → `metadata.bm25Score`
   - `h.confidence` → `metadata.confidence`
   - `updatedAt` → `undefined`（`HybridSearchResult` 不提供）
4. `deriveTitle()`：从 content 提取首个 `# ` 标题行，无标题则取前 50 字符
5. `highlightMatch()`：在 content 中定位 query 关键词，截取前后各 80 字符

```typescript
export class MemoryAdapter implements SearchSourceAdapter {
  constructor(
    private readonly indexer: MemoryIndexer,
    private readonly options: { archived: boolean },
  ) {}

  async search(query: UnifiedSearchQuery): Promise<UnifiedSearchResult[]> {
    const hits = await this.indexer.search(query.query, {
      limit: (query.limit ?? 20) * 2,
      includeArchived: this.options.archived,
    })

    return hits.map(h => ({
      id: `memory:${h.id}`,
      source: (this.options.archived ? 'memory-archive' : 'memory') as SearchSource,
      type: 'memory-entry' as const,
      title: this.deriveTitle(h.content),
      snippet: this.highlightMatch(h.content, query.query),
      metadata: {
        score: h.finalScore,
        vectorScore: h.vecScore,
        bm25Score: h.bm25Score,
        confidence: h.confidence,
        section: h.section,
        updatedAt: undefined,
      },
      navigation: { kind: 'memory' as const, entryId: h.id },
    }))
  }
}
```

**验证：** 字段名映射正确（`finalScore`→`score`）；活跃/归档区分正确

#### B3：HandbookAdapter + McpAdapter（Step 4）

**HandbookAdapter 文件：** `sibylla-desktop/src/main/services/unified-search/adapters/handbook-adapter.ts`（新建）

**关键实现要点：**

1. 构造函数接收 `HandbookService`
2. 调用 `this.handbookService.search(query)` — 同步方法，包装为 `Promise.resolve()`
3. **自行计算 score**：关键词命中数 / 总词数（`matchCount / totalTerms`）
4. **自行计算 snippet**：在 content 中定位首个关键词位置，截取前后各 80 字符

```typescript
export class HandbookAdapter implements SearchSourceAdapter {
  constructor(private readonly handbookService: HandbookService) {}

  async search(query: UnifiedSearchQuery): Promise<UnifiedSearchResult[]> {
    const entries = this.handbookService.search(query.query, {
      limit: (query.limit ?? 20) * 2,
    })

    return entries.map(entry => ({
      id: `handbook:${entry.id}`,
      source: 'handbook' as const,
      type: 'handbook-entry' as const,
      title: entry.title,
      snippet: this.computeSnippet(entry.content, query.query),
      metadata: {
        score: this.computeScore(entry.content, query.query),
        category: entry.category,
      },
      navigation: { kind: 'handbook' as const, entryId: entry.id },
    }))
  }

  private computeScore(content: string, query: string): number {
    const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0)
    if (terms.length === 0) return 0
    const lowerContent = content.toLowerCase()
    const hits = terms.filter(t => lowerContent.includes(t)).length
    return hits / terms.length
  }

  private computeSnippet(content: string, query: string): string {
    const firstTerm = query.toLowerCase().split(/\s+/).find(t => t.length > 0) ?? ''
    const idx = content.toLowerCase().indexOf(firstTerm)
    if (idx === -1) return content.slice(0, 160)
    const start = Math.max(0, idx - 80)
    const end = Math.min(content.length, idx + firstTerm.length + 80)
    return (start > 0 ? '...' : '') + content.slice(start, end) + (end < content.length ? '...' : '')
  }
}
```

**McpAdapter 文件：** `sibylla-desktop/src/main/services/unified-search/adapters/mcp-adapter.ts`（新建）

**关键实现要点：**

1. 定义 MCP 路径到 Source 的映射常量：
   ```typescript
   const MCP_PATH_MAP: ReadonlyArray<{ prefix: string; source: SearchSource }> = [
     { prefix: 'docs/logs/slack/', source: 'mcp:slack' },
     { prefix: 'docs/logs/discord/', source: 'mcp:discord' },
     { prefix: '.sibylla/inbox/prs/', source: 'mcp:github' },
     { prefix: 'docs/announcements/', source: 'mcp:discord' },
   ]
   ```
2. `discoverSources()`：扫描工作区目录，检测映射表中的路径是否存在，返回 `SearchSource[]`
3. `search()`：使用 `LocalSearchEngine` + 路径前缀过滤，按路径将结果标记为对应 MCP Source
4. 每个 MCP Source 结果 `type` 为 `'mcp-record'`，`navigation` 为 `{ kind: 'file', path }`

**验证：** HandbookAdapter score/snippet 自行计算正确；McpAdapter 路径识别和 Source 标记正确

---

### 阶段 C：UnifiedSearchEngine 核心 + IPC（Steps 5-6） — 预计 1 天

#### C1：UnifiedSearchEngine（Step 5）

**文件：** `sibylla-desktop/src/main/services/unified-search/unified-search-engine.ts`（新建）

**关键实现要点：**

1. 构造函数注入 `LocalSearchEngine`、`MemoryIndexer`、`HandbookService`、`FileManager`、`Tracer`、`AppEventBus` + 用户身份信息
2. `registerBuiltinSources()`：创建并注册 4 个内置 Adapter + 调用 `discoverMcpSources()`
3. `search(query)` 核心方法：

```typescript
async search(query: UnifiedSearchQuery): Promise<UnifiedSearchResponse> {
  return this.tracer.withSpan('unified-search.query', async (span) => {
    const enabledSources = (query.sources ?? Array.from(this.sources.keys()))
      .filter(s => this.sources.has(s))

    span.setAttributes({
      'search.query': query.query,
      'search.sources': enabledSources.join(','),
      'search.limit': query.limit ?? 20,
    })

    const timeoutMs = query.timeoutMs ?? 500
    const timing: Record<string, number> = {}
    let partial = false

    const sourceResults = await Promise.all(
      enabledSources.map(async (source) => {
        const start = Date.now()
        try {
          const result = await this.queryWithTimeout(
            this.sources.get(source)!,
            query,
            timeoutMs,
          )
          timing[source] = Date.now() - start
          return { source, results: result, success: true }
        } catch (err) {
          timing[source] = Date.now() - start
          partial = true
          return { source, results: [] as UnifiedSearchResult[], success: false }
        }
      }),
    )

    const merged = mergeAndRank(
      sourceResults.flatMap(r => r.results),
      query.rankingWeights,
    )

    const offset = query.offset ?? 0
    const final = merged.slice(offset, offset + (query.limit ?? 20))

    this.eventBus.emitEvent({
      type: 'search.executed',
      source: 'unified-search',
      payload: { query: query.query, resultCount: final.length, partial },
    })

    return {
      results: final,
      totalCount: merged.length,
      partial,
      timing: { totalMs: Date.now() - Date.now(), perSource: timing },
    }
  }, { kind: 'tool-call' })
}
```

4. `queryWithTimeout()`：`Promise.race([adapter.search(query), timeout reject])`
5. `discoverMcpSources()`：创建 `McpAdapter` 实例，调用 `discoverSources()`，注册到 `this.sources`；监听 `mcp.sync-completed` 事件触发重新发现
6. `listSources()`：返回所有注册的 `SearchSource[]`

**验证：** 并行查询 + 超时隔离正确；融合排序权重生效；去重正确；事件发布正确

#### C2：IPC Handler + 通道扩展 + Preload API（Step 6）

**文件：** `sibylla-desktop/src/main/ipc/handlers/unified-search.ts`（新建）

1. 注册 `search:unified:query` handler：调用 `unifiedSearch.search(query)`
2. 注册 `search:unified:listSources` handler：调用 `unifiedSearch.listSources()`
3. 注册 `search:fuzzyFiles` handler：调用 `LocalSearchEngine.search()` 模糊匹配文件名，返回 `{ path, title }[]`

**文件：** `sibylla-desktop/src/shared/types.ts`（扩展）

在 `IPC_CHANNELS` 中新增：
```typescript
SEARCH_UNIFIED_QUERY: 'search:unified:query',
SEARCH_UNIFIED_LIST_SOURCES: 'search:unified:listSources',
SEARCH_FUZZY_FILES: 'search:fuzzyFiles',
```

在 `IPCChannelMap` 中新增类型签名。

**文件：** `sibylla-desktop/src/preload/index.ts`（扩展）

1. 在 `ALLOWED_CHANNELS` 白名单注册 3 个新通道
2. 在 `ElectronAPI` 接口中新增/扩展 `search` 命名空间：
```typescript
search: {
  unified: (query: UnifiedSearchQuery) => ipcRenderer.invoke('search:unified:query', query),
  listSources: () => ipcRenderer.invoke('search:unified:listSources'),
  fuzzyFiles: (query: string, options?: { limit?: number }) =>
    ipcRenderer.invoke('search:fuzzyFiles', query, options),
}
```

**验证：** IPC 调用链路通畅；渲染进程可发起搜索并收到结果

---

### 阶段 D：搜索 UI（Step 7） — 预计 1.5 天

#### D1：工具函数与 Hooks

**文件：** `sibylla-desktop/src/renderer/hooks/useDebounce.ts`（新建）

```typescript
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}
```

**文件：** `sibylla-desktop/src/renderer/hooks/useKeyboardNavigation.ts`（新建）

管理 `selectedIndex` 状态，`↑/↓` 跨组导航，`Enter` 执行当前选中项导航，`ESC` 关闭。

**工具函数 `parseSourcePrefix()`：**
```
"mem:认证"          → { cleanQuery: "认证", sources: ['memory', 'memory-archive'] }
"file:auth"         → { cleanQuery: "auth", sources: ['local-files'] }
"mcp:github issue"  → { cleanQuery: "issue", sources: ['mcp:github'] }
"认证流程"          → { cleanQuery: "认证流程", sources: undefined (全部) }
```

**工具函数 `groupBySource()`：**
按 `SearchSource` 分组，排序：memory → local-files → mcp:* → handbook → *-archive

#### D2：UnifiedSearchPalette 主组件

**文件：** `sibylla-desktop/src/renderer/components/search/UnifiedSearchPalette.tsx`（新建）

**关键实现要点：**

1. 状态：`query`、`response`、`loading`、`selectedIndex`
2. `useDebounce(query, 150)` 防抖
3. `useEffect` 监听 `debouncedQuery` → `parseSourcePrefix()` → `window.electronAPI.search.unified()`
4. `useMemo` 计算 `groupBySource(results)` 分组结果
5. `useKeyboardNavigation` 管理键盘交互
6. `Ctrl+P`（Mac: `Cmd+P`）全局快捷键注册

#### D3：子组件

**`SourceGroup.tsx`：** 按 `SearchSource` 分组展示，可折叠标题（源图标 + 名称 + 数量）

源图标映射：
| Source | 图标 |
|--------|------|
| `memory` / `memory-archive` | 🧠 |
| `local-files` | 📄 |
| `mcp:*` | 🔌 |
| `handbook` | 📖 |
| `plans-archive` | 📋 |

**`SearchResultItem.tsx`：** 渲染标题 + snippet（关键词高亮）+ metadata，点击执行 `handleNavigate()`

**`handleNavigate()` 导航函数：**
- `kind: 'file'` → `window.electronAPI.editor.openFile(path, { line })`
- `kind: 'memory'` → 聚焦记忆面板到指定条目
- `kind: 'handbook'` → 打开 Handbook viewer
- `kind: 'external'` → `shell.openExternal(url)`

**`EmptyState.tsx`：** 无结果提示，根据查询模式提供建议

**验证：** 搜索面板 UI 渲染正确；防抖、分组、键盘导航、跨源跳转全部可用

---

### 阶段 E：命令面板互通 + 主进程装配 + 测试（Step 8） — 预计 1.5 天

#### E1：命令面板互通

**文件：** `sibylla-desktop/src/renderer/components/command-palette/CommandPalette.tsx`（修改）

1. 在命令面板搜索逻辑中追加统一搜索结果
2. 用户输入非命令关键词时：先展示命令列表（优先），再展示 3 条搜索结果（标注 `[搜索结果]`）
3. 点击搜索结果 → 执行与 `UnifiedSearchPalette` 相同的导航

**实现策略：** 在 `useCommandStore` 的搜索 `effect` 中，当 `query` 非命令匹配时，并行调用 `window.electronAPI.search.unified()` 获取搜索结果，追加到 `results` 列表末尾。

#### E2：主进程装配

**文件：** `sibylla-desktop/src/main/index.ts`（修改）

在 workspace 初始化阶段，按以下顺序装配：

```typescript
// 在 LocalSearchEngine/MemoryIndexer/HandbookService 初始化完成后
const unifiedSearch = new UnifiedSearchEngine(
  localSearchEngine,
  memoryIndexer,
  handbookService,
  fileManager,
  tracer,
  appEventBus,
  { currentUser: userName, isAdmin: userRole === 'admin' },
)

// 注册 IPC handler
const searchHandler = new UnifiedSearchHandler(unifiedSearch, localSearchEngine)
searchHandler.register()
```

#### E3：单元测试

**`tests/main/services/unified-search/unified-search-engine.test.ts`：**

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 并行查询正确性 | 所有源被查询，结果合并 |
| 2 | 部分超时 | mock 慢源，返回 `partial: true` + 已收到结果 |
| 3 | `mergeAndRank()` 权重 | 计算结果符合公式 |
| 4 | 跨源去重 | 相同 `fullPath` 保留得分最高的 |
| 5 | `listSources()` | 返回正确的源列表 |
| 6 | 事件发布 | `search.executed` 事件被 `emitEvent()` |

**`tests/main/services/unified-search/local-files-adapter.test.ts`：**

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 同步→异步包装 | 返回值为 Promise |
| 2 | 路径排除 | `exclude` 选项过滤生效 |
| 3 | 个人空间隔离 | 非 Admin 不返回其他用户内容 |
| 4 | 字段映射 | `rank` → `score` + `bm25Score` |

**`tests/main/services/unified-search/memory-adapter.test.ts`：**

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 字段名映射 | `finalScore`→`score`，`vecScore`→`vectorScore` |
| 2 | 活跃/归档区分 | `archived: false` → `source: 'memory'` |
| 3 | `deriveTitle()` | 提取 `# ` 标题或前 50 字符 |
| 4 | `highlightMatch()` | 截取匹配片段 |

**`tests/main/services/unified-search/handbook-adapter.test.ts`：**

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 自行计算 score | 关键词命中数 / 总词数 |
| 2 | 自行计算 snippet | 匹配位置前后截取 |

**`tests/main/services/unified-search/mcp-adapter.test.ts`：**

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 路径到 Source 映射 | `docs/logs/slack/` → `mcp:slack` |
| 2 | 动态发现 | 目录存在时注册对应 Source |

**`tests/main/services/unified-search/ranking.test.ts`：**

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | `calculateFinalScore()` | 加权公式正确 |
| 2 | `dedupKey()` | `fullPath` 存在时用 `fullPath`，否则用 snippet hash |

**`tests/renderer/components/search/unified-search-palette.test.tsx`：**

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 渲染 | 搜索面板正确显示 |
| 2 | 防抖 | 150ms 内多次输入仅触发一次查询 |
| 3 | 源前缀过滤 | `mem:` 仅查询 memory 源 |
| 4 | 键盘导航 | `↑/↓/Enter/ESC` 行为正确 |

**`tests/main/ipc/unified-search-handler.test.ts`：**

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | `search:unified:query` | 调用链路通畅 |
| 2 | `search:fuzzyFiles` | 返回文件名匹配结果 |

**覆盖率目标：** ≥ 80%

---

## 五、验收标准追踪

### 统一搜索引擎（主进程）

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 并行查询所有注册数据源 | C1 `Promise.all` | E3-1 |
| 2 | P95 延迟 < 300ms | C1 并行 + 超时 | 性能测试 |
| 3 | 单源超时返回 `partial: true` | C1 `queryWithTimeout` | E3-2 |
| 4 | 融合排序权重生效 | A2 `mergeAndRank` | E3-3 |
| 5 | 跨源去重 | A2 `dedupKey` | E3-4 |
| 6 | `sources` 过滤生效 | C1 `enabledSources` | E3-1 |
| 7 | stale 文件排除 | C1 结果过滤 | E3-4 |
| 8 | 产生 `search.executed` 事件 | C1 `emitEvent` | E3-6 |
| 9 | 产生 Trace span | C1 `withSpan` | E3-6 |

### Source Adapter

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | LocalFilesAdapter 同步→异步 | B1 `Promise.resolve` | E3-adapter-1 |
| 2 | LocalFilesAdapter 路径排除 | B1 `exclude` 过滤 | E3-adapter-2 |
| 3 | MemoryAdapter 字段映射 | B2 重映射 | E3-adapter-1 |
| 4 | MemoryAdapter 活跃/归档区分 | B2 `options.archived` | E3-adapter-2 |
| 5 | HandbookAdapter 自行计算 score/snippet | B3 `computeScore`/`computeSnippet` | E3-adapter-1 |
| 6 | McpAdapter 动态发现 | B3 `discoverSources` | E3-adapter-2 |

### 源前缀过滤

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | `mem:xxx` → memory 源 | D1 `parseSourcePrefix` | E3-UI-3 |
| 2 | `file:xxx` → local-files 源 | D1 `parseSourcePrefix` | E3-UI-3 |
| 3 | `mcp:github xxx` → mcp:github 源 | D1 `parseSourcePrefix` | E3-UI-3 |
| 4 | 前缀正确剥离 | D1 `parseSourcePrefix` | E3-UI-3 |

### 统一搜索 UI（渲染进程）

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | Ctrl+P 唤起 | D2 全局快捷键 | 手动验证 |
| 2 | 150ms 防抖 | D1 `useDebounce` | E3-UI-2 |
| 3 | 按源分组 + 可折叠 | D3 `SourceGroup` | 手动验证 |
| 4 | ↑/↓ 跨组导航 | D1 `useKeyboardNavigation` | E3-UI-4 |
| 5 | Enter 导航跳转 | D3 `handleNavigate` | 手动验证 |
| 6 | "更多结果"按钮 | D2 分页 | 手动验证 |
| 7 | 空状态提示 | D3 `EmptyState` | 手动验证 |
| 8 | 部分超时信息条 | D2 Banner | 手动验证 |
| 9 | ESC 关闭 | D2 键盘事件 | E3-UI-4 |
| 10 | 源前缀过滤提示 | D2 UI 标签 | 手动验证 |

### 命令面板互通

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | Ctrl+K 搜索结果展示 | E1 CommandPalette 扩展 | 手动验证 |
| 2 | 点击搜索结果导航 | E1 复用 `handleNavigate` | 手动验证 |

### 个人空间隔离

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 非 Admin 不返回他人 personal/ | B1 `filterPersonalSpace` | E3-adapter-3 |
| 2 | Admin 可见所有 | B1 `isAdmin` 判断 | E3-adapter-3 |

### 性能要求

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 统一搜索 P95 < 300ms | C1 并行 + 超时 | 性能测试 |
| 2 | 单源 P95 < 200ms | Adapter 各自优化 | 性能测试 |
| 3 | 面板打开 < 100ms | D2 懒加载 | 手动验证 |

---

## 六、风险与缓解

| # | 风险 | 影响 | 概率 | 缓解策略 |
|---|------|------|------|---------|
| 1 | **LocalSearchEngine 同步方法阻塞事件循环** — `search()` 是同步 FTS5 查询，在 `Promise.all` 并行中仍会阻塞主线程 | 中 | 低 | FTS5 同步查询通常 < 50ms（实测），对 300ms 总目标影响可忽略；若未来数据量增大，可考虑将 LocalSearchEngine 迁移到 Worker 线程 |
| 2 | **MemoryIndexer 字段名不一致** — `finalScore` vs `score`、`vecScore` vs `vectorScore` 的映射关系复杂，容易遗漏 | 中 | 中 | 映射集中在 MemoryAdapter 单一文件中，测试用例显式验证每个字段映射；不修改 MemoryIndexer |
| 3 | **HandbookService 不返回 score/snippet** — Adapter 需自行计算，计算逻辑可能不够准确 | 低 | 中 | score 使用简单的关键词命中率，snippet 使用位置截取；均为近似值，不影响核心排序（排序主要依赖其他源的精确分数） |
| 4 | **MCP 数据源路径约定变更** — 如果后续 Sprint 修改了 MCP 同步数据的目录结构，`MCP_PATH_MAP` 会失效 | 中 | 低 | 映射表集中在 `MCP_PATH_MAP` 常量中，单点维护；监听 `mcp.sync-completed` 事件时重新扫描 |
| 5 | **跨源去重误判** — `dedupKey` 基于 `fullPath` 或 snippet hash，不同源可能引用相同文件但 path 不同 | 低 | 中 | `fullPath` 为第一去重 key（精确），snippet hash 为兜底（允许少量误判）；实际场景中同一文件不太可能出现在多个源 |
| 6 | **命令面板互通影响命令搜索性能** — 额外的搜索 IPC 调用可能拖慢命令面板响应 | 中 | 中 | 搜索结果限制 3 条；IPC 查询默认 500ms 超时；搜索结果异步加载，不阻塞命令列表渲染 |
| 7 | **个人空间隔离绕过** — 通过 `search:unified:query` IPC 直接传入 `sources` 参数可能绕过前端过滤 | 高 | 低 | 隔离逻辑在 LocalFilesAdapter（主进程侧）实现，不依赖前端过滤；IPC handler 层面也做二次校验 |
| 8 | **Ctrl+P 与浏览器/系统快捷键冲突** — macOS 上 `Cmd+P` 可能被系统打印功能占用 | 低 | 中 | Electron 可拦截 `Cmd+P` 并 `preventDefault()`；如仍有问题可提供自定义快捷键设置 |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 | 验证方式 |
|----|------|--------|---------|
| Day 1 上午 | A1-A2 | `types.ts` + `ranking.ts` 完成 | `npx tsc --noEmit` 通过 |
| Day 1 下午 | B1 | `LocalFilesAdapter` 完成 | 单元测试 E3-adapter |
| Day 2 上午 | B2-B3 | `MemoryAdapter` + `HandbookAdapter` + `McpAdapter` 完成 | 单元测试 E3-adapter |
| Day 2 下午 | C1 | `UnifiedSearchEngine` 核心完成 | 单元测试 E3-engine |
| Day 3 上午 | C2 | IPC handler + 通道扩展 + Preload API 完成 | IPC 调用链路验证 |
| Day 3 下午 | D1-D2 | Hooks + `UnifiedSearchPalette` 组件完成 | UI 手动验证 |
| Day 4 上午 | D3 | `SourceGroup` + `SearchResultItem` + `EmptyState` 完成 | UI 交互验证 |
| Day 4 下午 | E1-E2 | 命令面板互通 + 主进程装配 | 集成验证 |
| Day 5 | E3 | 全部单元测试通过 | `npx vitest run` 覆盖率 ≥ 80% |
| Day 6 | — | 集成验证 + Bug 修复 + 性能测试 | 全量回归 |

### 关键里程碑

| 里程碑 | 时间点 | 判定标准 |
|--------|--------|---------|
| M1: 类型与排序就绪 | Day 1 结束 | `SearchSource` 联合类型 + `mergeAndRank` 纯函数完成，`tsc --noEmit` 通过 |
| M2: Adapter 层就绪 | Day 2 结束 | 4 个 Adapter 全部完成，字段映射正确，同步→异步包装正确 |
| M3: 主进程搜索链路可用 | Day 3 结束 | `UnifiedSearchEngine` + IPC handler 工作，渲染进程可发起搜索 |
| M4: UI 全量交付 | Day 4 结束 | 搜索面板 + 命令面板互通全部工作 |
| M5: 全量验收通过 | Day 5 结束 | 所有单元测试通过，覆盖率 ≥ 80% |

---

**文档版本**: v1.0
**最后更新**: 2026-04-28
**维护者**: Sibylla 架构团队
