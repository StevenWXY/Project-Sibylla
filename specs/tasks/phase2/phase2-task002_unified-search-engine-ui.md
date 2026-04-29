# 跨源统一搜索引擎与搜索 UI

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK002 |
| **任务标题** | 跨源统一搜索引擎与搜索 UI |
| **所属阶段** | Phase 2 - 跨源数据统一与上下文引擎 v2 (Sprint 4) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 5-6 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

构建跨源统一搜索引擎与搜索 UI，让用户用一个搜索框即可检索本地文件、AI 记忆、MCP 同步数据、归档内容等所有数据源。搜索引擎不重建已有索引，而是协调多个现有索引（Sprint 3 的 FTS5、Sprint 3.2 的 sqlite-vec + FTS5）并行查询并融合排序。搜索 UI 以 `Ctrl+P` 快捷键唤起，按数据源分组展示结果，支持源前缀过滤和跨源跳转。

### 背景

Sprint 3 实现了 `LocalSearchEngine`（基于 SQLite FTS5 的全文搜索），Sprint 3.2 实现了 `MemoryIndexer`（基于 sqlite-vec + FTS5 的混合检索），Sprint 3.4 实现了 `HandbookService`（系统 Wiki 的 FTS5 索引），Sprint 3.6 的 MCP 数据通过 `FileManager` 落地后自动被 `LocalSearchEngine` 索引。这些索引各自独立工作，用户需要在不同面板间切换搜索。

Sprint 4 需要一个统一查询入口：

| 数据源 | 索引提供方 | 本任务工作 |
|---|---|---|
| 本地文档 | LocalSearchEngine (FTS5, Sprint 3) | 不变，通过 LocalFilesAdapter 接入 |
| 记忆条目 | MemoryIndexer (sqlite-vec + FTS5, Sprint 3.2) | 不变，通过 MemoryAdapter 接入 |
| Handbook | LocalSearchEngine 子分区 (Sprint 3.4) | 不变，通过 HandbookAdapter 接入 |
| MCP 同步数据 | LocalSearchEngine (走 FileManager 落地) | 通过路径前缀识别为独立 Source |
| 归档（记忆归档/Plan 归档） | 各自现有索引 | 通过 Source 标签暴露 |

**核心设计约束：**

1. **不重建已有索引**：每个数据源通过 Adapter 模式接入，Adapter 负责接口适配和字段名映射
2. **并行查询 + 超时隔离**：所有源并行查询，单源超时 >500ms 返回部分结果
3. **跨源融合排序**：权重向量 `vector: 0.4 / fts: 0.4 / recency: 0.1 / source-priority: 0.1`
4. **同步方法适配**：`LocalSearchEngine.search()` 是同步方法，Adapter 内部包装为 `Promise.resolve()`
5. **字段名映射**：`MemoryIndexer` 返回 `finalScore/vecScore/bm25Score`（camelCase），统一搜索使用 `score/vectorScore/bm25Score`，Adapter 负责映射
6. **个人空间隔离**：统一搜索遵循 `personal/[name]/` 边界，不返回其他用户的个人空间内容
7. **Ctrl+P 独立于 Ctrl+K**：统一搜索（Ctrl+P）与命令面板（Ctrl+K，Sprint 3.4）独立但互通

### 范围

**包含：**

- 统一搜索类型系统（`SearchSource`/`UnifiedSearchQuery`/`UnifiedSearchResult`/`UnifiedSearchResponse`）
- `SearchSourceAdapter` 抽象接口
- `LocalFilesAdapter` — 本地文件搜索适配
- `MemoryAdapter` — 记忆条目搜索适配（活跃 + 归档）
- `HandbookAdapter` — 系统 Wiki 搜索适配
- `McpAdapter` — MCP 数据源适配（动态发现）
- `UnifiedSearchEngine` — 并行查询 + 超时控制 + 融合排序 + 去重
- 跨源融合排序模块（`ranking.ts`）
- 统一搜索 IPC handler
- `UnifiedSearchPalette` — 搜索面板组件
- `SourceGroup` — 按源分组展示组件
- `SearchResultItem` — 单条结果组件
- `EmptyState` — 空结果状态组件
- 快捷键 `Ctrl+P` 注册
- 源前缀过滤解析（`mem:`/`file:`/`mcp:`）
- 命令面板（Ctrl+K）搜索结果互通
- 单元测试

**不包含：**

- `LocalSearchEngine` 本身的修改（Sprint 3 已完成）
- `MemoryIndexer` 本身的修改（Sprint 3.2 已完成）
- `HandbookService` 本身的修改（Sprint 3.4 已完成）
- ContextEngine v2 对统一搜索的消费（TASK003）
- AI 主动检索工具 `unified_search`（TASK003）

## 依赖关系

### 前置依赖

- [x] PHASE2-TASK001 — 事件总线基础设施扩展（消费 `search.executed`、`index.*` 事件）
- [x] PHASE1-TASK015 — 本地全文搜索（`LocalSearchEngine` FTS5 索引）
- [x] PHASE1-TASK025 — 向量索引与混合检索引擎（`MemoryIndexer` sqlite-vec + FTS5）
- [x] PHASE1-TASK033 — 系统 Wiki 与外部数据源抽象层（`HandbookService`）
- [x] PHASE1-TASK032 — 命令面板（`Ctrl+K` 互通）
- [x] PHASE1-TASK042 — MCP 客户端核心（MCP 数据落地到工作区）

### 被依赖任务

- [ ] PHASE2-TASK003 — ContextEngine v2（通过 `setUnifiedSearch()` 注入，L5 跨源层消费搜索结果）
- [ ] PHASE2-TASK004 — 双向链接系统（wiki-link 补全复用 `search:fuzzyFiles` IPC）

## 参考文档

- [`specs/requirements/phase2/sprint4-semantic-search.md`](../../requirements/phase2/sprint4-semantic-search.md) — 需求 4.2 + 4.3
- [`specs/requirements/phase1/sprint3-ai-mvp.md`](../../requirements/phase1/sprint3-ai-mvp.md) — `LocalSearchEngine` 设计
- [`specs/requirements/phase1/sprint3.2-memory.md`](../../requirements/phase1/sprint3.2-memory.md) — `MemoryIndexer` 设计
- [`specs/requirements/phase1/sprint3.4-mode.md`](../../requirements/phase1/sprint3.4-mode.md) — `HandbookService` + 命令面板
- [`specs/requirements/phase1/sprint3.6-MCP.md`](../../requirements/phase1/sprint3.6-MCP.md) — MCP 数据落地路径
- [`specs/design/architecture.md`](../../design/architecture.md) — 进程通信架构
- [`CLAUDE.md`](../../../CLAUDE.md) — 文件即真相、本地优先、个人空间隔离
- `.kilocode/skills/phase1/sqlite-local-storage/SKILL.md` — SQLite 查询优化

## 验收标准

### 统一搜索引擎（主进程）

- [ ] `UnifiedSearchEngine.search()` 可并行查询所有注册数据源
- [ ] 跨源查询 P95 延迟 < 300ms（包含融合排序耗时）
- [ ] 单源超时 > 500ms 时返回 `partial: true` 标记和已收到结果
- [ ] 跨源融合排序权重生效：`vector: 0.4 / fts: 0.4 / recency: 0.1 / source-priority: 0.1`
- [ ] 跨源去重：相同内容（path + snippet hash）只保留得分最高的
- [ ] 用户指定 `sources` 过滤时仅查询选中的源
- [ ] 结果引用的文件不存在时标记为 stale，从默认结果中排除
- [ ] 每次搜索产生 `search.executed` 事件（通过 TASK001 的事件总线）
- [ ] 每次搜索产生 Trace span（kind='tool-call'）

### Source Adapter

- [ ] `LocalFilesAdapter` 正确包装 `LocalSearchEngine.search()` 同步方法为 async
- [ ] `LocalFilesAdapter` 按 `exclude` 选项过滤路径（排除 handbook/、mcp/ 子目录）
- [ ] `MemoryAdapter` 正确映射字段名：`finalScore`→`score`、`vecScore`→`vectorScore`、`bm25Score`→`bm25Score`
- [ ] `MemoryAdapter` 区分活跃记忆 (`memory`) 和归档记忆 (`memory-archive`)
- [ ] `HandbookAdapter` 自行计算 snippet 和 score（不修改 HandbookService）
- [ ] `McpAdapter` 基于工作区 MCP 同步目录动态发现数据源
- [ ] `McpAdapter` 通过路径前缀（`docs/logs/slack/` → `mcp:slack`）识别 Source

### 源前缀过滤

- [ ] 用户输入 `mem:xxx` 时仅查询 memory + memory-archive 源
- [ ] 用户输入 `file:xxx` 时仅查询 local-files 源
- [ ] 用户输入 `mcp:github xxx` 时仅查询 mcp:github 源
- [ ] 前缀被正确剥离，不作为搜索关键词的一部分

### 统一搜索 UI（渲染进程）

- [ ] `Ctrl+P`（Mac: `Cmd+P`）唤起统一搜索面板
- [ ] 输入防抖 150ms 后发起查询
- [ ] 搜索结果按数据源分组展示，每个分组可折叠
- [ ] `↑/↓` 键可跨组导航选中项
- [ ] `Enter` 键根据结果类型执行导航（打开文件 / 聚焦记忆条目 / 打开外部 URL）
- [ ] 结果数量超过可视区域时显示"更多结果"按钮
- [ ] 无结果时显示空状态提示（含查询模式相关建议）
- [ ] 部分数据源超时时显示信息提示条
- [ ] 搜索面板 ESC 键关闭
- [ ] 源前缀过滤在 UI 中以标签/图标方式提示当前过滤范围

### 命令面板互通

- [ ] `Ctrl+K` 命令面板中输入关键词时，命令优先 + 统一搜索结果次之展示
- [ ] 命令面板中的搜索结果点击后执行与统一搜索面板相同的导航行为

### 个人空间隔离

- [ ] 非 Admin 用户搜索结果不包含其他成员 `personal/[name]/` 下的内容
- [ ] Admin 用户搜索结果包含所有个人空间内容（标记来源）

### 性能要求

- [ ] 统一搜索查询 P95 < 300ms
- [ ] 单源查询 P95 < 200ms
- [ ] 搜索面板打开到可输入 < 100ms
- [ ] 搜索面板动画流畅（60fps）

### 单元测试

- [ ] `UnifiedSearchEngine.search()` 并行查询 + 超时测试
- [ ] `mergeAndRank()` 融合排序权重测试
- [ ] 跨源去重测试
- [ ] `LocalFilesAdapter` 同步→异步包装 + 路径过滤测试
- [ ] `MemoryAdapter` 字段名映射测试
- [ ] `HandbookAdapter` snippet/score 计算测试
- [ ] `McpAdapter` 动态发现 + 路径识别测试
- [ ] 源前缀过滤解析测试（`mem:`/`file:`/`mcp:github`）
- [ ] IPC handler 测试
- [ ] 搜索面板组件测试（渲染/交互/键盘导航）
- [ ] 命令面板互通测试
- [ ] 个人空间隔离测试
- [ ] 覆盖率 ≥ 80%

## 技术策略

### 核心架构：Adapter 模式 + 并行查询 + 融合排序

```
用户输入 "认证流程"
        │
        ▼
UnifiedSearchPalette (渲染进程)
    │ Ctrl+P 唤起
    │ 150ms 防抖
    │ parseSourcePrefix("认证流程") → { cleanQuery, sources: undefined }
        │
        │ IPC: search:unified:query
        ▼
UnifiedSearchEngine (主进程)
    │ tracer.withSpan('unified-search.query')
    │
    ├── Promise.all([
    │     LocalFilesAdapter.search()    ─── Promise.resolve(localSearch.search())  ~50ms
    │     MemoryAdapter.search()        ─── memoryIndexer.search()                 ~80ms
    │     MemoryAdapter(archived).search()                                           ~60ms
    │     HandbookAdapter.search()      ─── handbookService.search()                ~40ms
    │     McpAdapter.search()           ─── 路径过滤 localSearch.search()            ~50ms
    │   ])
    │   每个 Adapter 内部 queryWithTimeout(500ms)
    │
    ├── mergeAndRank(allResults, weights)
    │   ├── 加权评分: vector*0.4 + fts*0.4 + recency*0.1 + sourcePriority*0.1
    │   ├── 跨源去重: path + snippet hash → 保留得分最高
    │   └── 排序 + 截断
    │
    ├── eventBus.emitEvent({ type: 'search.executed', ... })
    │
    └── 返回 UnifiedSearchResponse
        │
        │ IPC: 返回结果
        ▼
UnifiedSearchPalette (渲染进程)
    │ groupBySource(results)
    │ 按源分组渲染 SourceGroup
    │ ↑/↓ 导航 / Enter 跳转
```

### Adapter 接口设计

```
SearchSourceAdapter (抽象接口)
    │
    ├── async search(query: UnifiedSearchQuery): Promise<UnifiedSearchResult[]>
    │
    ├── 实现类:
    │   ├── LocalFilesAdapter   ← 包装 LocalSearchEngine 同步方法
    │   ├── MemoryAdapter       ← 映射 MemoryIndexer 字段名
    │   ├── HandbookAdapter     ← 自行计算 snippet/score
    │   └── McpAdapter          ← 路径前缀识别 Source
    │
    └── 关键约束:
        ├── LocalFilesAdapter: Promise.resolve() 包装同步 search()
        ├── MemoryAdapter: finalScore→score, vecScore→vectorScore 映射
        ├── 所有 Adapter 返回统一 UnifiedSearchResult 格式
        └── Adapter 不修改底层引擎的任何代码
```

### 融合排序权重体系

```
源优先级 (sourcePriority):
    memory:          1.0   ← AI 提炼的高价值信息
    local-files:     0.9   ← 用户直接创作的内容
    mcp:github:      0.85  ← 外部结构化数据
    mcp:notion:      0.85
    mcp:slack:       0.8   ← 对话记录价值略低
    handbook:        0.7   ← 通用参考
    memory-archive:  0.5   ← 归档内容时效性低
    plans-archive:   0.5

综合得分 = vectorScore * 0.4
         + bm25Score * 0.4
         + recencyScore * 0.1
         + sourcePriority * 0.1

去重策略:
    key = fullPath ?? (snippet 前 100 字符 hash)
    同一 key 保留得分最高的结果
```

### MCP 数据源动态发现

```
工作区目录扫描:
    docs/logs/slack/       → 注册 'mcp:slack' Source
    docs/logs/discord/     → 注册 'mcp:discord' Source
    .sibylla/inbox/prs/    → 注册 'mcp:github' Source
    docs/announcements/    → 注册 'mcp:discord' Source

发现时机:
    1. UnifiedSearchEngine 构造时扫描一次
    2. 监听事件总线 'mcp.sync-completed' 事件时重新扫描
    3. 手动刷新入口（IPC: search:unified:listSources）

查询策略:
    McpAdapter 内部使用 LocalSearchEngine + 路径前缀过滤
    不引入独立的 MCP 索引
```

### 源前缀过滤解析

```
parseSourcePrefix(input):
    "mem:认证"          → { cleanQuery: "认证", sources: ['memory', 'memory-archive'] }
    "file:auth"         → { cleanQuery: "auth", sources: ['local-files'] }
    "mcp:github issue"  → { cleanQuery: "issue", sources: ['mcp:github'] }
    "mcp:slack 讨论"    → { cleanQuery: "讨论", sources: ['mcp:slack'] }
    "认证流程"          → { cleanQuery: "认证流程", sources: undefined (全部) }
```

### 命令面板互通策略

```
Ctrl+K (命令面板，Sprint 3.4):
    ├── 输入非命令关键词时
    │   ├── 先展示匹配的命令列表（优先）
    │   └── 再展示统一搜索结果（次之，限制 3 条）
    │
    └── 搜索结果点击 → 执行与统一搜索相同的导航

Ctrl+P (统一搜索):
    └── 纯搜索模式，不展示命令列表
```

### 依赖库选型

| 用途 | 库 | 说明 |
|------|-----|------|
| 防抖 | 自定义 `useDebounce` hook | 避免引入额外依赖 |
| 分组展示 | 自定义 `groupBySource()` | 按 SearchSource 分组 |
| 键盘导航 | 自定义 hook `useKeyboardNavigation` | ↑/↓/Enter/ESC |
| 搜索面板 | 基于 Sprint 3.4 `CommandPalette` 扩展 | 复用面板框架 |

## 技术执行路径

### 步骤 1：定义统一搜索类型系统

**文件：** `src/main/services/unified-search/types.ts`（新建）

1. 定义 `SearchSource` 联合类型：
   ```typescript
   export type SearchSource =
     | 'local-files' | 'memory' | 'memory-archive' | 'handbook'
     | 'mcp:github' | 'mcp:slack' | 'mcp:notion' | 'plans-archive'
   ```

2. 定义 `UnifiedSearchQuery` 接口：
   - `query: string` — 搜索关键词
   - `sources?: SearchSource[]` — 过滤源（undefined = 全部）
   - `filters?: { fileTypes, pathPrefix, minConfidence, timeRange }`
   - `limit?: number` — 默认 20
   - `offset?: number`
   - `rankingWeights?: RankingWeights`
   - `timeoutMs?: number` — 默认 500

3. 定义 `UnifiedSearchResult` 接口：
   - `id: string` — 跨源唯一 ID（格式：`local:xxx`/`memory:xxx`）
   - `source: SearchSource`
   - `type: 'file' | 'memory-entry' | 'handbook-entry' | 'mcp-record'`
   - `title: string`、`snippet: string`、`fullPath?: string`
   - `metadata: { score, vectorScore?, bm25Score?, recencyScore?, confidence?, updatedAt? }`
   - `navigation: { kind, path?/entryId?/url? }` — 跨源跳转目标

4. 定义 `UnifiedSearchResponse` 接口：
   - `results: UnifiedSearchResult[]`
   - `totalCount: number`
   - `partial: boolean` — 是否有源超时
   - `timing: { totalMs, perSource }`

5. 定义 `SearchSourceAdapter` 抽象接口：
   ```typescript
   export interface SearchSourceAdapter {
     search(query: UnifiedSearchQuery): Promise<UnifiedSearchResult[]>
   }
   ```

6. 定义 `RankingWeights` 接口：
   ```typescript
   export interface RankingWeights {
     vector: number    // 默认 0.4
     fts: number       // 默认 0.4
     recency: number   // 默认 0.1
     sourcePriority: number  // 默认 0.1
   }
   ```

**验证：** TypeScript 编译通过，类型完整且无 `any`

### 步骤 2：实现 LocalFilesAdapter

**文件：** `src/main/services/unified-search/adapters/local-files-adapter.ts`（新建）

1. 实现 `LocalFilesAdapter` 类，构造函数接收 `LocalSearchEngine` 和 `{ exclude: string[] }` 选项

2. 实现 `search()` 方法：
   - 调用 `this.localSearch.search({ query, limit })`（**同步方法**）
   - 将返回值包装为 `Promise.resolve()` 以适配 async 接口
   - 按 `exclude` 选项过滤路径（排除 `handbook/`、`mcp/` 子目录）
   - 映射为 `UnifiedSearchResult[]`：
     - `id`: `local:${r.id}`
     - `source`: `'local-files'`
     - `type`: `'file'`
     - `title`: 文件名（path 最后一段）
     - `snippet`: 原始 snippet
     - `metadata.score` / `metadata.bm25Score`: 均使用 `r.rank`
     - `navigation`: `{ kind: 'file', path: r.path }`

3. 个人空间过滤：
   - 如果当前用户非 Admin，过滤掉 `personal/[其他用户]/` 路径的结果
   - 通过构造函数注入 `{ currentUser: string, isAdmin: boolean }` 选项

**验证：** 同步方法正确包装为 async；路径排除正确；字段映射正确

### 步骤 3：实现 MemoryAdapter

**文件：** `src/main/services/unified-search/adapters/memory-adapter.ts`（新建）

1. 实现 `MemoryAdapter` 类，构造函数接收 `MemoryIndexer` 和 `{ archived: boolean }` 选项

2. 实现 `search()` 方法：
   - 调用 `this.indexer.search(query.query, { limit, includeArchived })` 复用现有搜索接口
   - 映射为 `UnifiedSearchResult[]`：
     - `id`: `memory:${h.id}`
     - `source`: `this.options.archived ? 'memory-archive' : 'memory'`
     - `type`: `'memory-entry'`
     - `title`: 从 content 中提取标题（首行或前 50 字符）
     - `snippet`: 高亮匹配片段
     - **字段名映射**（关键）：
       - `h.finalScore` → `metadata.score`
       - `h.vecScore` → `metadata.vectorScore`
       - `h.bm25Score` → `metadata.bm25Score`
       - `h.confidence` → `metadata.confidence`
       - `h.section` → `metadata.section`
       - `updatedAt` → `undefined`（HybridSearchResult 不提供此字段）
     - `navigation`: `{ kind: 'memory', entryId: h.id }`

3. 实现 `deriveTitle()` 辅助方法：
   - 从 content 中提取第一个 `# ` 标题行
   - 如无标题，取前 50 字符 + "..."

4. 实现 `highlightMatch()` 辅助方法：
   - 在 content 中定位 query 关键词位置
   - 截取关键词前后各 80 字符作为 snippet
   - 高亮关键词（用 `<mark>` 标记或 `**` 包裹）

**验证：** 字段名映射正确；活跃/归档区分正确；snippet 高亮正确

### 步骤 4：实现 HandbookAdapter + McpAdapter

**文件：** `src/main/services/unified-search/adapters/handbook-adapter.ts`（新建）

1. 实现 `HandbookAdapter` 类，构造函数接收 `HandbookService`

2. 实现 `search()` 方法：
   - 调用 `this.handbookService.search(query.query, { limit })` 复用现有搜索接口
   - HandbookService 的搜索结果可能不含 `score` 和 `snippet`，Adapter 需自行计算：
     - `score`: 基于匹配度估算（关键词命中数 / 总词数）
     - `snippet`: 截取匹配位置前后各 80 字符
   - 映射为 `UnifiedSearchResult[]`：
     - `source`: `'handbook'`
     - `type`: `'handbook-entry'`
     - `navigation`: `{ kind: 'handbook', entryId }`

**文件：** `src/main/services/unified-search/adapters/mcp-adapter.ts`（新建）

3. 定义 MCP 路径到 Source 的映射表：
   ```typescript
   const MCP_PATH_MAP: Record<string, SearchSource> = {
     'docs/logs/slack/': 'mcp:slack',
     'docs/logs/discord/': 'mcp:discord',
     '.sibylla/inbox/prs/': 'mcp:github',
     'docs/announcements/': 'mcp:discord',
   }
   ```

4. 实现 `McpAdapter` 类，构造函数接收 `LocalSearchEngine` 和 `FileManager`

5. 实现 `discoverSources()` 方法：
   - 扫描工作区目录，检测 MCP_PATH_MAP 中的路径是否存在
   - 为每个存在的路径创建一个子 Adapter 实例
   - 返回已发现的 `SearchSource[]`

6. 实现 `search()` 方法：
   - 遍历已发现的子 Adapter，每个执行路径前缀过滤的 `LocalSearchEngine.search()`
   - 根据路径前缀将结果标记为对应的 MCP Source
   - 映射为 `UnifiedSearchResult[]`，`type` 为 `'mcp-record'`
   - `navigation` 为 `{ kind: 'file', path }` + 附加原始 URL metadata（如有）

**验证：** HandbookAdapter 自行计算 score/snippet 正确；McpAdapter 路径识别和 Source 标记正确

### 步骤 5：实现 UnifiedSearchEngine 核心

**文件：** `src/main/services/unified-search/unified-search-engine.ts`（新建）

1. 实现 `UnifiedSearchEngine` 类：
   - 构造函数注入 `LocalSearchEngine`、`MemoryIndexer`、`HandbookService`、`FileManager`、`Tracer`、`AppEventBus`
   - 构造函数中调用 `registerBuiltinSources()` 注册所有内置 Adapter

2. 实现 `registerBuiltinSources()` 方法：
   ```typescript
   this.sources.set('local-files', new LocalFilesAdapter(this.localSearch, { exclude: ['handbook/', 'mcp/'], currentUser, isAdmin }))
   this.sources.set('memory', new MemoryAdapter(this.memoryIndexer, { archived: false }))
   this.sources.set('memory-archive', new MemoryAdapter(this.memoryIndexer, { archived: true }))
   this.sources.set('handbook', new HandbookAdapter(this.handbookService))
   this.discoverMcpSources() // 动态注册 MCP 源
   ```

3. 实现 `search(query)` 方法：
   - 使用 `tracer.withSpan('unified-search.query', ...)` 包裹，kind='tool-call'
   - 确定启用的源列表：`query.sources ?? this.sources.keys()`
   - `Promise.all` 并行查询所有启用源，每个源带 `queryWithTimeout(adapter, query, timeoutMs)`
   - 收集结果，标记 `partial`（是否有源超时）
   - 调用 `mergeAndRank()` 融合排序
   - 分页截断：`offset` + `limit`
   - 发布 `search.executed` 事件到事件总线
   - 返回 `UnifiedSearchResponse`

4. 实现 `queryWithTimeout()` 方法：
   - `Promise.race([adapter.search(query), timeout reject])`
   - 超时后 reject 被外层 catch 捕获，标记 partial

5. 实现 `mergeAndRank()` 方法：
   - 计算每个结果的加权得分（`vector*0.4 + fts*0.4 + recency*0.1 + sourcePriority*0.1`）
   - 跨源去重：`dedupKey(r)` = `r.fullPath ?? hash(r.snippet.slice(0, 100))`
   - 按得分降序排序

6. 实现 `discoverMcpSources()` 方法：
   - 创建 `McpAdapter` 实例，调用其 `discoverSources()`
   - 将发现的 MCP 源注册到 `this.sources`
   - 监听事件总线 `mcp.sync-completed` 事件，触发重新发现

7. 实现 `listSources()` 方法：
   - 返回所有注册的 `SearchSource[]` 及其状态

**文件：** `src/main/services/unified-search/ranking.ts`（新建）

8. 实现 `DEFAULT_RANKING_WEIGHTS` 常量和 `SOURCE_PRIORITY` 映射
9. 实现 `calculateFinalScore(result, weights)` 纯函数
10. 实现 `dedupKey(result)` 纯函数

**验证：** 并行查询 + 超时隔离正确；融合排序权重生效；去重正确；事件发布正确

### 步骤 6：实现统一搜索 IPC handler

**文件：** `src/main/ipc/handlers/unified-search.ts`（新建）

1. 注册 `search:unified:query` handler：
   ```typescript
   ipcMain.handle('search:unified:query', async (_event, query: UnifiedSearchQuery) => {
     return this.unifiedSearch.search(query)
   })
   ```

2. 注册 `search:unified:listSources` handler：
   - 返回所有注册的 `SearchSource[]`

3. 注册 `search:fuzzyFiles` handler（供 wiki-link 补全使用）：
   - 接收 `query: string` + `options: { limit: number }`
   - 调用 `LocalSearchEngine.search()` 模糊匹配文件名
   - 返回 `{ path: string; title: string }[]`

**文件：** `src/shared/types.ts`（修改，扩展）

4. 新增 IPC 通道常量：
   ```typescript
   SEARCH_UNIFIED_QUERY: 'search:unified:query',
   SEARCH_UNIFIED_LIST_SOURCES: 'search:unified:listSources',
   SEARCH_FUZZY_FILES: 'search:fuzzyFiles',
   ```

**文件：** `src/preload/index.ts`（修改，扩展）

5. 新增 `search` 命名空间的 `unified` 和 `fuzzyFiles` 方法：
   ```typescript
   search: {
     unified: (query) => ipcRenderer.invoke('search:unified:query', query),
     listSources: () => ipcRenderer.invoke('search:unified:listSources'),
     fuzzyFiles: (query, options?) => ipcRenderer.invoke('search:fuzzyFiles', query, options),
   }
   ```

**文件：** `src/main/main.ts` 或服务装配文件（修改）

6. 创建 `UnifiedSearchEngine` 实例并注入所有依赖

**验证：** IPC 调用链路通畅；渲染进程可发起搜索并收到结果

### 步骤 7：实现统一搜索 UI

**文件：** `src/renderer/components/search/UnifiedSearchPalette.tsx`（新建）

1. 实现 `UnifiedSearchPalette` 组件：
   - 状态：`query`、`response`、`loading`、`selectedIndex`
   - 使用 `useDebounce(query, 150)` 防抖
   - `useEffect` 监听 debouncedQuery 变化 → 调用 `window.electronAPI.search.unified()`
   - `useMemo` 计算 `groupBySource(results)` 分组结果
   - 渲染：`SearchInput` → `SourceGroup[]` → `EmptyState` / "更多结果"

2. 实现 `parseSourcePrefix()` 工具函数：
   - 解析 `mem:`/`file:`/`mcp:xxx` 前缀
   - 返回 `{ cleanQuery, sources }`

3. 实现 `groupBySource()` 工具函数：
   - 按 `SearchSource` 分组
   - 分组排序：memory → local-files → mcp:* → handbook → *-archive

4. 快捷键注册：
   - `Ctrl+P`（Mac: `Cmd+P`）全局注册，唤起搜索面板
   - `ESC` 关闭面板

**文件：** `src/renderer/components/search/SourceGroup.tsx`（新建）

5. 实现 `SourceGroup` 组件：
   - Props: `source: SearchSource`、`results: UnifiedSearchResult[]`
   - 渲染分组标题（源图标 + 源名称 + 结果数量）
   - 可折叠（点击标题展开/收起）
   - 内部渲染 `SearchResultItem[]`

6. 源图标映射：
   - `memory` → 🧠 / `local-files` → 📄 / `mcp:github` → 🔌 / `handbook` → 📖

**文件：** `src/renderer/components/search/SearchResultItem.tsx`（新建）

7. 实现 `SearchResultItem` 组件：
   - 渲染：标题 + snippet（关键词高亮）+ metadata（score/confidence/time）
   - 点击 → 执行 `handleNavigate(result.navigation)`
   - 高亮当前选中项（背景色变化）

8. 实现 `handleNavigate()` 导航函数：
   - `kind: 'file'` → `window.electronAPI.editor.openFile(path, { line })`
   - `kind: 'memory'` → 聚焦记忆面板到指定条目
   - `kind: 'handbook'` → 打开 Handbook viewer
   - `kind: 'external'` → `shell.openExternal(url)`

**文件：** `src/renderer/components/search/EmptyState.tsx`（新建）

9. 实现 `EmptyState` 组件：
   - 显示"未找到匹配结果"
   - 根据查询模式提供建议（如"试试 `mem:` 搜索记忆"）
   - 提供快捷操作（清除搜索/搜索全部源）

**文件：** `src/renderer/hooks/useDebounce.ts`（新建）

10. 实现 `useDebounce` hook

**文件：** `src/renderer/hooks/useKeyboardNavigation.ts`（新建）

11. 实现 `useKeyboardNavigation` hook：
    - 管理 `selectedIndex` 状态
    - `↑` → selectedIndex - 1（跨组）
    - `↓` → selectedIndex + 1（跨组）
    - `Enter` → 执行当前选中项的导航
    - `ESC` → 关闭面板

**验证：** 搜索面板 UI 渲染正确；防抖、分组、键盘导航、跨源跳转全部可用

### 步骤 8：命令面板互通 + 主进程装配 + 单元测试

**文件：** `src/renderer/components/command-palette/CommandPalette.tsx`（修改，Sprint 3.4）

1. 在命令面板的搜索逻辑中追加统一搜索结果：
   - 用户输入非命令关键词时，先展示命令列表（优先）
   - 追加 3 条统一搜索结果（次之），标注"[搜索结果]"
   - 点击搜索结果 → 执行与 `UnifiedSearchPalette` 相同的导航

**文件：** `src/main/main.ts` 或服务装配文件（修改）

2. 主进程装配：
   - 创建 `UnifiedSearchEngine` 实例
   - 注入 `LocalSearchEngine`、`MemoryIndexer`、`HandbookService`、`FileManager`、`Tracer`、`AppEventBus`
   - 将实例传递给 `ContextEngine`（TASK003 将通过 `setUnifiedSearch()` 注入）
   - 注册 `unified-search.ts` IPC handler

**文件：** `tests/main/services/unified-search/`（新建目录）

3. `unified-search-engine.test.ts`：
   - 并行查询 + 部分超时测试（mock 一个慢源）
   - `mergeAndRank()` 权重计算验证
   - 跨源去重验证
   - `listSources()` 返回正确的源列表

4. `local-files-adapter.test.ts`：
   - 同步→异步包装验证
   - 路径排除过滤验证
   - 个人空间隔离验证

5. `memory-adapter.test.ts`：
   - 字段名映射验证（finalScore→score 等）
   - 活跃/归档区分验证
   - deriveTitle 和 highlightMatch 验证

6. `handbook-adapter.test.ts`：
   - 自行计算 score/snippet 验证

7. `mcp-adapter.test.ts`：
   - 路径到 Source 映射验证
   - 动态发现验证

8. `ranking.test.ts`：
   - 加权得分计算纯函数测试
   - 去重 key 生成测试

**文件：** `tests/renderer/components/search/`（新建目录）

9. `unified-search-palette.test.tsx`：
   - 搜索面板渲染测试
   - 防抖行为测试
   - 源前缀过滤解析测试
   - 键盘导航测试（↑/↓/Enter/ESC）

10. `source-group.test.tsx`：
    - 分组渲染和折叠测试

11. `search-result-item.test.tsx`：
    - 结果渲染和点击导航测试

**文件：** `tests/main/ipc/unified-search-handler.test.ts`

12. IPC handler 测试：
    - `search:unified:query` 调用链路测试
    - `search:fuzzyFiles` 调用测试

**覆盖率目标：** ≥ 80%

## 现有代码基础

| 已有模块 | 文件路径 | 本任务使用方式 |
|---------|---------|-------------|
| LocalSearchEngine | `src/main/services/local-search.ts`（Sprint 3） | 不修改，通过 LocalFilesAdapter 包装同步 search() 接入 |
| MemoryIndexer | `src/main/services/memory/memory-indexer.ts`（Sprint 3.2） | 不修改，通过 MemoryAdapter 做字段名映射接入 |
| HandbookService | `src/main/services/handbook/`（Sprint 3.4） | 不修改，通过 HandbookAdapter 接入 |
| FileManager | `src/main/services/file-manager.ts`（Sprint 0） | McpAdapter 用于扫描 MCP 数据目录 |
| AppEventBus | `src/main/services/event-bus.ts`（Sprint 3.3 + TASK001） | 注入，发布 search.executed 事件 |
| Tracer | `src/main/services/trace/tracer.ts`（Sprint 3.3） | 注入，搜索产生 Trace span |
| CommandPalette | `src/renderer/components/command-palette/`（Sprint 3.4） | 扩展，追加搜索结果展示 |

**完全缺失、需新建的模块：**

| 模块 | 说明 |
|------|------|
| `unified-search/types.ts` | 统一搜索类型系统 |
| `unified-search/unified-search-engine.ts` | 统一搜索引擎核心 |
| `unified-search/ranking.ts` | 融合排序与去重 |
| `unified-search/adapters/local-files-adapter.ts` | 本地文件搜索适配 |
| `unified-search/adapters/memory-adapter.ts` | 记忆条目搜索适配 |
| `unified-search/adapters/handbook-adapter.ts` | 系统 Wiki 搜索适配 |
| `unified-search/adapters/mcp-adapter.ts` | MCP 数据源适配 |
| `ipc/handlers/unified-search.ts` | 统一搜索 IPC handler |
| `search/UnifiedSearchPalette.tsx` | 搜索面板主组件 |
| `search/SourceGroup.tsx` | 按源分组展示组件 |
| `search/SearchResultItem.tsx` | 单条结果组件 |
| `search/EmptyState.tsx` | 空结果状态组件 |
| `hooks/useDebounce.ts` | 防抖 hook |
| `hooks/useKeyboardNavigation.ts` | 键盘导航 hook |

## 新增 IPC 通道

| IPC 通道 | 方向 | 说明 |
|---------|------|------|
| `search:unified:query` | Renderer → Main | 统一搜索查询 |
| `search:unified:listSources` | Renderer → Main | 列出所有注册数据源 |
| `search:fuzzyFiles` | Renderer → Main | 文件名模糊匹配（wiki-link 补全用） |

## 涉及的现有文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/shared/types.ts` | 扩展 | 新增 SEARCH_* IPC 通道常量 |
| `src/preload/index.ts` | 扩展 | 新增 search.unified / search.fuzzyFiles |
| `src/main/main.ts`（或装配文件） | 修改 | 创建 UnifiedSearchEngine 实例 |
| `src/renderer/components/command-palette/CommandPalette.tsx` | 扩展 | 追加搜索结果展示 |

**不修改的文件：**
- `src/main/services/local-search.ts` — 通过 Adapter 包装接入
- `src/main/services/memory/memory-indexer.ts` — 通过 Adapter 映射字段接入
- `src/main/services/handbook/` — 通过 Adapter 接入
- `src/main/services/file-manager.ts` — 仅读取目录结构

---

**创建时间：** 2026-04-27
**最后更新：** 2026-04-27
**更新记录：**
- 2026-04-27 — 创建任务文档（含完整技术执行路径 8 步）
