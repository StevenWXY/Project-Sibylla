# Phase 2 Sprint 4 - 跨源数据统一与上下文引擎 v2

## 一、概述

### 1.1 目标与价值

Phase 1 的 6 个 Sprint 已交付 Sibylla 完整的工作流实例:编辑器、Git 同步、AI 对话、Harness、记忆系统 v2、Trace、AI 模式、Plan、Skill/Sub-agent/Workflow、MCP 集成、Aha Moment 引导。这些能力像多个独立的工具房间——每个都好用,但用户在房间之间走动时还需要带着钥匙。

Sprint 4 的使命是**把所有房间连起来**,让数据、上下文、事件在系统内自由流动:

1. **跨源统一搜索** - 本地文件、MEMORY.md、MCP 同步的数据、归档可一次搜索
2. **事件总线** - 系统内所有模块以统一事件流通信(后续 Sprint 5/6 的依赖)
3. **ContextEngine v2** - AI 上下文组装能跨越所有数据源智能选择
4. **AI 主动检索** - AI 在对话中自主决定何时扩展搜索范围
5. **双向链接系统** - 文档关系图谱
6. **多设备同步增强** - workspace 数据(含 MEMORY/Plans/Tasks)在多端稳定同步

完成 Sprint 4 后,Sibylla 的"AI 全局上下文"将真正闭环:你过去的笔记、团队的决议、GitHub 的 issue、Slack 的讨论、AI 学到的项目约定——任何相关信息,AI 都能自动找到并引用。

### 1.2 与已完成 Sprint 的关系

| 已完成 Sprint | 本 Sprint 的依赖与扩展 |
|---|---|
| Sprint 1(编辑器) | 双向链接 UI 集成在 Tiptap 编辑器中 |
| Sprint 2(Git 同步) | 多端同步增强基于现有 `SyncManager` |
| Sprint 3(AI MVP) | LocalSearchEngine(FTS5)作为统一搜索的本地源;ContextEngine v1 升级到 v2 |
| Sprint 3.1(Harness) | AI 主动检索集成到 Generator 的工具调用流;Sensor 消费 MCP 数据可用性 |
| Sprint 3.2(记忆 v2) | **MemoryIndexer(sqlite-vec + FTS5)直接复用**,不重建索引 |
| Sprint 3.3(Trace) | 所有跨源事件纳入 Trace;统一搜索调用产生 Span |
| Sprint 3.4(模式/外部数据源) | **DataSourceProvider 抽象扩展为 SearchProvider**;命令面板新增统一搜索入口 |
| Sprint 3.5(PromptComposer) | **ContextEngine v2 是 PromptComposer 的并列子系统**,共同构成完整 system prompt |
| Sprint 3.6(MCP/导入) | MCP 同步进来的文件通过 FileManager 落地,自动进入统一搜索;@mcp:source 引用语法扩展 |

### 1.3 关键设计共识

1. **不重建已有索引**:Sprint 3.2 的 MemoryIndexer 已有 sqlite-vec + FTS5 混合检索能力,本 Sprint 在其上构建跨源整合,**不另起炉灶**。
2. **事件总线为基础设施**:本 Sprint 引入的 `AppEventBus`(扩展自 Sprint 3.3 的 AppEventBus)是 Sprint 5(通知)、Sprint 6(工作流)的核心依赖。
3. **AI 主动检索复用 ToolScope**:不引入新的工具调用协议,在 Sprint 3.5 的 ToolScopeManager 中注册 `unified_search` 工具。
4. **MCP 数据走文件索引**:Sprint 3.6 的 `McpSyncManager` 已把 MCP 数据写入工作区文件,本 Sprint 通过 LocalSearchEngine 的现有索引能力消费它们,不引入独立 MCP 索引。
5. **ContextEngine 已被多次迭代**:v1(Sprint 3) → 子模块化(Sprint 3.5) → 接入 PromptComposer → v2(本 Sprint)。所有改造为追加式,保留现有 `assembleContext()` 与 `assembleForHarness()` 签名。
6. **同步分层**:Sprint 2 的 SyncManager 负责工作区 Git 同步;本 Sprint 引入的多端同步增强是在其上的策略层,不替代 SyncManager。

### 1.4 涉及模块

- 模块7:搜索系统(v2 升级,跨源整合)
- 模块4:AI 系统(ContextEngine v2、AI 主动检索)
- 模块3:Git 抽象层(多端同步增强)
- 模块2:WYSIWYG 编辑器(双向链接 UI)
- 新增模块:事件总线(`AppEventBus` 扩展)
- 新增模块:双向链接系统

### 1.5 里程碑定义

**完成标志:**
- 统一搜索面板可同时检索本地文件、记忆、MCP 数据,响应 < 300ms
- 事件总线运行,Sprint 1-3.6 关键模块完成对接
- ContextEngine v2 上线,支持跨源 5 层上下文组装
- AI 可在对话中自主调用 `unified_search` 工具
- `[[wiki-link]]` 语法在 Tiptap 编辑器中可用,Backlinks 视图启用
- 多端同步覆盖 MEMORY.md、plans/、agents/ 状态文件
- 与 Sprint 3.1-3.6 集成验证全部通过(冲突分析见 §六)

---

## 二、功能需求

### 需求 4.1 - 事件总线基础设施

**用户故事:** 作为系统,我需要一个统一的事件流,让记忆系统、MCP 同步、文件变更、协作动作能互相感知,而不是各自封闭。

#### 功能描述

在 Sprint 3.3 的 `AppEventBus` 基础上扩展,定义全系统级事件目录与类型契约。所有模块通过统一接口发布与订阅事件,保证类型安全、可观测、可重放。

**关键设计决策:**
- 不引入新的 EventBus 实现(避免与 Sprint 3.3 的 `AppEventBus`、Sprint 3.2 的 `MemoryEventBus` 三个事件总线并存)
- **扩展 `AppEventBus` 为系统级事件中心,采用"保留现有具名方法 + 新增通用 emit/on"的追加式改造**。现有 17 个具名方法(`emitSpanEnded` 等)全部保留,在其内部桥接到新的通用事件流
- 事件类型采用点分隔命名(`file.updated`),与现有冒号分隔 EventMap 键(`trace:span-ended`)通过内部映射表桥接,不修改现有 EventMap 类型
- `MemoryEventBus` 保持模块内事件,通过桥接器转发到 `AppEventBus`
- 所有事件自动写入 Trace(Sprint 3.3),具备可回放能力
- 事件持久化(`persist: true` → JSONL)通过构造函数可选注入 `EventLogStore`,不侵入核心分发路径

#### 验收标准

1. When module emits event via AppEventBus, the system shall deliver to all subscribers within 50ms
2. When subscriber throws exception, the system shall isolate to that subscriber and continue delivery to others
3. When event is emitted, the system shall create Trace span with kind='system' and event payload as attributes
4. When event volume exceeds 100/sec, the system shall apply backpressure and log warning
5. When module subscribes with filter, the system shall only deliver matching events
6. When app shuts down, the system shall flush in-flight event handlers within 5 seconds
7. When event has `persist: true` flag, the system shall write to event log for replay

#### 技术规格

**事件目录(本 Sprint 定义,后续 Sprint 扩展):**

```typescript
// src/main/services/event-bus.ts(扩展自 Sprint 3.3)
// 策略:保留所有现有具名方法和 EventMap,新增通用事件流

// ─── 新增:统一事件类型目录(点分隔命名) ───

export type SibyllaEventType =
  // 文件系统(Sprint 1-2,本 Sprint 新增)
  | 'file.created' | 'file.updated' | 'file.deleted' | 'file.renamed'
  // 记忆系统(Sprint 3.2,本 Sprint 桥接)
  | 'memory.entry-added' | 'memory.entry-updated' | 'memory.entry-deleted'
  | 'memory.checkpoint-completed' | 'memory.compression-completed'
  // MCP(Sprint 3.6,本 Sprint 新增)
  | 'mcp.connected' | 'mcp.disconnected' | 'mcp.sync-completed' | 'mcp.tool-called'
  // 索引(本 Sprint)
  | 'index.document-added' | 'index.document-updated' | 'index.completed'
  // AI 对话(Sprint 3, 3.1,本 Sprint 新增)
  | 'ai.message-completed' | 'ai.tool-called' | 'ai.degraded'
  // Wiki Links(本 Sprint)
  | 'wiki-links.updated'
  // 统一搜索(本 Sprint)
  | 'search.executed'
  // ── 以下为已有事件的桥接别名(内部映射到现有 EventMap key) ──
  | 'trace.span-ended'        // ← 现有 'trace:span-ended'
  | 'progress.task-declared'   // ← 现有 'progress:task-declared'
  | 'progress.task-completed'  // ← 现有 'progress:task-completed'
  | 'performance.alert'        // ← 现有 'performance:alert'
  | 'performance.metrics'      // ← 现有 'performance:metrics'
  | 'aiMode.changed'           // ← 现有 'aiMode:changed'
  | 'plan.created'             // ← 现有 'plan:created'
  | 'plan.execution-started'   // ← 现有 'plan:execution-started'
  // 后续 Sprint 预留
  | 'git.conflict-detected'     // Sprint 5:SyncManager 冲突检测
  | 'presence.user-online'      // Sprint 5:Presence 上线
  | 'presence.user-offline'     // Sprint 5:Presence 离线
  | 'presence.user-editing'     // Sprint 5:Presence 编辑中
  | 'presence.user-viewing'     // Sprint 5:Presence 查看中
  | 'task.created' | 'task.completed'
  | 'notification.created'

// ─── 新增:统一事件信封 ───

export interface SibyllaEvent<T = unknown> {
  id: string                        // ULID
  type: SibyllaEventType
  source: string                    // 发起模块,如 'memory-manager'
  timestamp: number
  payload: T
  workspaceId?: string
  traceId?: string                  // 关联 Trace span
  persist?: boolean
}

type EventHandler<T = unknown> = (event: SibyllaEvent<T>) => void

// ─── 扩展后的 AppEventBus(保留所有现有方法 + 新增通用接口) ───

export class AppEventBus extends EventEmitter {
  // ── 新增:通用事件分发基础设施 ──
  private unifiedHandlers = new Map<SibyllaEventType, Set<EventHandler>>()
  private wildcards = new Set<EventHandler>()
  private eventLogStore?: EventLogStore  // 可选注入
  private tracer?: Tracer                // 可选注入

  // ── 现有 EventMap 和具名方法全部保留(不修改) ──
  // emitSpanEnded(span) { ... }  ← 保留
  // emitTaskDeclared(task) { ... }  ← 保留
  // emitPerformanceMetrics(metrics) { ... }  ← 保留
  // ... 所有 17 个具名方法保留

  // ── 新增:注入依赖(构造后调用) ──
  setEventLogStore(store: EventLogStore): void {
    this.eventLogStore = store
  }

  setTracer(tracer: Tracer): void {
    this.tracer = tracer
  }

  // ── 新增:通用事件发布 ──
  emitEvent<T>(event: Omit<SibyllaEvent<T>, 'id' | 'timestamp'>): void {
    const fullEvent: SibyllaEvent<T> = {
      ...event,
      id: ulid(),
      timestamp: Date.now()
    }

    // 写入 Trace(Sprint 3.3)
    this.tracer?.withSpan(`event:${event.type}`, (span) => {
      span.setAttributes({
        'event.id': fullEvent.id,
        'event.source': event.source,
      })
    }, { kind: 'system' })

    // 持久化(可选)
    if (event.persist && this.eventLogStore) {
      this.eventLogStore.append(fullEvent).catch(err => {
        console.warn('[AppEventBus] event.persist.failed', { err })
      })
    }

    // 分发(隔离每个订阅者的异常)
    const targeted = this.unifiedHandlers.get(event.type) ?? new Set()
    for (const handler of [...targeted, ...this.wildcards]) {
      try {
        handler(fullEvent)
      } catch (err) {
        console.error('[AppEventBus] event.handler.failed', {
          eventType: event.type, err
        })
      }
    }
  }

  // ── 新增:通用事件订阅 ──
  subscribe<T>(type: SibyllaEventType, handler: EventHandler<T>): () => void {
    if (!this.unifiedHandlers.has(type)) {
      this.unifiedHandlers.set(type, new Set())
    }
    this.unifiedHandlers.get(type)!.add(handler as EventHandler)
    return () => this.unifiedHandlers.get(type)?.delete(handler as EventHandler)
  }

  // ── 新增:通配订阅 ──
  subscribeAny(handler: EventHandler): () => void {
    this.wildcards.add(handler)
    return () => this.wildcards.delete(handler)
  }

  // ── 新增:现有具名方法到通用流的桥接 ──
  // 在每个现有具名方法末尾追加 emitEvent 调用:
  //
  // emitSpanEnded(span: SerializedSpan): void {
  //   this.emit('trace:span-ended', span)  // 原有逻辑不变
  //   // 新增:桥接到统一事件流
  //   this.emitEvent({ type: 'trace.span-ended', source: 'tracer', payload: span })
  // }
}
```

**与现有 EventBus 的关系:**

```typescript
// src/main/services/memory/memory-event-bus.ts(Sprint 3.2,不修改)
// 内部继续工作

// 桥接:MemoryEventBus → AppEventBus(新增文件)
// src/main/services/event-bus-bridges.ts
class MemoryEventBusBridge {
  constructor(memBus: MemoryEventBus, appBus: AppEventBus) {
    memBus.on('checkpoint-completed', (record) => {
      appBus.emitEvent({
        type: 'memory.checkpoint-completed',
        source: 'memory-manager',
        payload: record
      })
    })
    // ... 其他事件桥接
  }
}
```

#### 持久化与重放

```typescript
// 事件日志(用于调试与未来"事件回放"功能)
.sibylla/events/2026-04.jsonl
.sibylla/events/2026-05.jsonl
```

每个事件包含完整 payload,可作为系统状态变迁的"完整历史",与 Trace 互补(Trace 关注执行性能,事件关注状态变化)。

#### 优先级

P0 - 必须完成

---

### 需求 4.2 - 跨源统一搜索引擎

**用户故事:** 作为用户,我想用一个搜索框找到任何东西——本地文档、AI 学到的项目约定、上周 GitHub 上的 issue,而不是在三个面板间来回切换。

#### 功能描述

在已有索引基础设施上构建**统一查询入口**:

| 数据源 | 索引提供方 | 本 Sprint 工作 |
|---|---|---|
| 本地文档 | LocalSearchEngine(FTS5,Sprint 3) | 不变,作为 Source 之一接入 |
| 记忆条目 | MemoryIndexer(sqlite-vec + FTS5,Sprint 3.2) | 不变,作为 Source 之一接入 |
| Handbook | LocalSearchEngine 子分区(Sprint 3.4) | 不变,作为独立 Source |
| MCP 同步数据 | LocalSearchEngine(走 FileManager 落地) | 通过路径过滤识别为独立 Source |
| 归档(Plans 归档/Memory 归档) | 各自现有索引 | 通过 Source 标签暴露 |

**统一搜索引擎不重建索引**,而是协调多个索引的查询并融合结果。

#### 验收标准

1. When user issues unified query, the system shall query all enabled sources in parallel and merge results within 300ms (P95)
2. When source returns within 200ms, the system shall include results in response
3. When source times out (>500ms), the system shall return partial results with `partial: true` flag
4. When merging results, the system shall apply cross-source ranking with weights (vector 0.4 / fts 0.4 / recency 0.1 / source-priority 0.1)
5. When user filters by source, the system shall only query selected sources
6. When result references file no longer exists, the system shall mark as stale and exclude from default results
7. When user types `@mcp:github` in query, the system shall scope to MCP GitHub source only
8. When index is being rebuilt for a source, queries to that source shall return cached results with `from-cache` flag

#### 技术规格

**统一搜索接口:**

```typescript
// src/main/services/unified-search/types.ts

export type SearchSource = 
  | 'local-files'      // LocalSearchEngine
  | 'memory'           // MemoryIndexer
  | 'memory-archive'   // 归档记忆
  | 'handbook'         // Sibylla Handbook
  | 'mcp:github'       // 各 MCP 数据源(动态识别)
  | 'mcp:slack'
  | 'mcp:notion'
  | 'plans-archive'

export interface UnifiedSearchQuery {
  query: string
  sources?: SearchSource[]      // undefined = 所有启用的 Source
  filters?: {
    fileTypes?: string[]
    pathPrefix?: string
    minConfidence?: number      // 仅对 memory 生效
    timeRange?: { from: Date; to: Date }
  }
  limit?: number                // 默认 20
  offset?: number
  rankingWeights?: RankingWeights
  timeoutMs?: number            // 默认 500
}

export interface UnifiedSearchResult {
  id: string                    // 跨源唯一 ID
  source: SearchSource
  type: 'file' | 'memory-entry' | 'handbook-entry' | 'mcp-record'
  title: string
  snippet: string               // 高亮片段
  fullPath?: string             // 文件路径(可点击打开)
  metadata: {
    score: number               // 0-1 综合得分
    vectorScore?: number
    bm25Score?: number
    recencyScore?: number
    confidence?: number         // memory only
    updatedAt?: string
    [key: string]: unknown
  }
  // 跨源跳转:点击后打开对应位置
  navigation: 
    | { kind: 'file'; path: string; line?: number }
    | { kind: 'memory'; entryId: string }
    | { kind: 'handbook'; entryId: string }
    | { kind: 'external'; url: string }   // MCP 原始链接
}

export interface UnifiedSearchResponse {
  results: UnifiedSearchResult[]
  totalCount: number
  partial: boolean              // 是否有源超时
  timing: { 
    totalMs: number
    perSource: Record<SearchSource, number>
  }
}
```

**实现:**

```typescript
// src/main/services/unified-search/unified-search-engine.ts

export class UnifiedSearchEngine {
  private sources = new Map<SearchSource, SearchSourceAdapter>()
  
  constructor(
    private localSearch: LocalSearchEngine,
    private memoryIndexer: MemoryIndexer,
    private handbookService: HandbookService,
    private fileManager: FileManager,
    private tracer: Tracer,
    private eventBus: AppEventBus
  ) {
    this.registerBuiltinSources()
  }
  
  private registerBuiltinSources() {
    this.sources.set('local-files', 
      new LocalFilesAdapter(this.localSearch, { exclude: ['handbook/', 'mcp/'] }))
    this.sources.set('memory', 
      new MemoryAdapter(this.memoryIndexer, { archived: false }))
    this.sources.set('memory-archive', 
      new MemoryAdapter(this.memoryIndexer, { archived: true }))
    this.sources.set('handbook', 
      new HandbookAdapter(this.handbookService))
    
    // 动态发现 MCP 数据源(基于工作区中已存在的 MCP 同步目录)
    this.discoverMcpSources()
  }
  
  async search(query: UnifiedSearchQuery): Promise<UnifiedSearchResponse> {
    return this.tracer.withSpan('unified-search.query', async (span) => {
      const enabledSources = (query.sources ?? Array.from(this.sources.keys()))
        .filter(s => this.sources.has(s))
      
      span.setAttributes({
        'search.query': query.query,
        'search.sources': enabledSources.join(','),
        'search.limit': query.limit ?? 20
      })
      
      const timeoutMs = query.timeoutMs ?? 500
      const timing: Record<string, number> = {}
      let partial = false
      
      // 并行查询所有源,各自带超时
      const sourceResults = await Promise.all(
        enabledSources.map(async (source) => {
          const start = Date.now()
          try {
            const result = await this.queryWithTimeout(
              this.sources.get(source)!,
              query,
              timeoutMs
            )
            timing[source] = Date.now() - start
            return { source, results: result, success: true }
          } catch (err) {
            timing[source] = Date.now() - start
            partial = true
            this.logger.warn('search.source.timeout', { source, err })
            return { source, results: [], success: false }
          }
        })
      )
      
      // 跨源融合排序
      const merged = this.mergeAndRank(
        sourceResults.flatMap(r => r.results),
        query.rankingWeights
      )
      
      const final = merged.slice(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 20))
      
      this.eventBus.emitEvent({
        type: 'search.executed',
        source: 'unified-search',
        payload: { query: query.query, resultCount: final.length, partial }
      })
      
      return {
        results: final,
        totalCount: merged.length,
        partial,
        timing: { totalMs: Date.now() - span.startTimeMs, perSource: timing }
      }
    }, { kind: 'tool-call' })
  }
  
  private mergeAndRank(
    results: UnifiedSearchResult[],
    weights?: RankingWeights
  ): UnifiedSearchResult[] {
    const w = weights ?? { vector: 0.4, fts: 0.4, recency: 0.1, sourcePriority: 0.1 }
    const sourcePriority: Record<SearchSource, number> = {
      'memory': 1.0,
      'local-files': 0.9,
      'mcp:github': 0.85,
      'mcp:slack': 0.8,
      'mcp:notion': 0.85,
      'handbook': 0.7,
      'memory-archive': 0.5,
      'plans-archive': 0.5
    }
    
    const scored = results.map(r => {
      const finalScore = 
        w.vector * (r.metadata.vectorScore ?? r.metadata.score) +
        w.fts * (r.metadata.bm25Score ?? r.metadata.score) +
        w.recency * (r.metadata.recencyScore ?? 0.5) +
        w.sourcePriority * (sourcePriority[r.source] ?? 0.5)
      
      return { ...r, metadata: { ...r.metadata, score: finalScore } }
    })
    
    // 跨源去重:相同内容(由 hash + path 判定)只保留得分最高的
    const seen = new Map<string, UnifiedSearchResult>()
    for (const r of scored.sort((a, b) => b.metadata.score - a.metadata.score)) {
      const key = this.dedupKey(r)
      if (!seen.has(key)) seen.set(key, r)
    }
    
    return Array.from(seen.values())
      .sort((a, b) => b.metadata.score - a.metadata.score)
  }
  
  private async queryWithTimeout(
    adapter: SearchSourceAdapter,
    query: UnifiedSearchQuery,
    timeoutMs: number
  ): Promise<UnifiedSearchResult[]> {
    return Promise.race([
      adapter.search(query),
      new Promise<UnifiedSearchResult[]>((_, reject) => 
        setTimeout(() => reject(new Error('source timeout')), timeoutMs))
    ])
  }
}
```

**Source Adapter 示例(以 Memory 为例):**

```typescript
// src/main/services/unified-search/adapters/memory-adapter.ts

export class MemoryAdapter implements SearchSourceAdapter {
  constructor(
    private indexer: MemoryIndexer,    // Sprint 3.2 的现有组件
    private options: { archived: boolean }
  ) {}
   
  async search(query: UnifiedSearchQuery): Promise<UnifiedSearchResult[]> {
    // 复用 Sprint 3.2 的 search 接口,不重建索引
    const hits = await this.indexer.search(query.query, {
      limit: (query.limit ?? 20) * 2,    // 多取一些用于融合排序
      includeArchived: this.options.archived
    })
     
    return hits.map(h => ({
      id: `memory:${h.id}`,
      source: this.options.archived ? 'memory-archive' : 'memory',
      type: 'memory-entry',
      title: this.deriveTitle(h.content),
      snippet: this.highlightMatch(h.content, query.query),
      metadata: {
        // 注意:HybridSearchResult 字段名为 camelCase(finalScore/vecScore/bm25Score)
        // 与 UnifiedSearchResult.metadata 的 key 名(score/vectorScore/bm25Score)不同
        // Adapter 负责字段名映射,不修改 MemoryIndexer
        score: h.finalScore,
        vectorScore: h.vecScore,
        bm25Score: h.bm25Score,
        confidence: h.confidence,
        section: h.section,
        // HybridSearchResult 不提供 updatedAt,设为 undefined
        updatedAt: undefined,
      },
      navigation: { kind: 'memory', entryId: h.id }
    }))
  }
}
```

#### MCP 数据源的特殊处理

Sprint 3.6 的 MCP 数据已通过 `FileManager.writeFile()` 落地到工作区(典型路径如 `docs/logs/slack/2026-04-25.md`、`docs/announcements/`)。本 Sprint 通过路径前缀识别和元数据标记将其作为独立 Source:

```typescript
// 工作区目录约定(Sprint 3.6 已确立)
docs/logs/slack/         → SearchSource: 'mcp:slack'
docs/logs/discord/       → SearchSource: 'mcp:discord'
.sibylla/inbox/prs/      → SearchSource: 'mcp:github'
docs/announcements/      → SearchSource: 'mcp:discord'

// LocalSearchEngine 索引时已自动覆盖这些路径
// 本 Sprint 仅在搜索结果上附加 source 标签
```

#### LocalFilesAdapter 的同步方法适配

> **重要约束**: `LocalSearchEngine.search()` 是**同步方法**(返回 `SearchResult[]`,非 Promise)。
> 但 `UnifiedSearchEngine.queryWithTimeout()` 使用 `Promise.race` 实现超时控制。
> `LocalFilesAdapter` 需在内部将同步调用包装为 `Promise.resolve()`,使接口统一为 async。
> FTS5 同步查询通常 < 50ms,`queryWithTimeout` 的超时对它不生效,但不影响正确性。

```typescript
// src/main/services/unified-search/adapters/local-files-adapter.ts

export class LocalFilesAdapter implements SearchSourceAdapter {
  constructor(
    private localSearch: LocalSearchEngine,  // Sprint 3 现有组件
    private options: { exclude: string[] }
  ) {}

  async search(query: UnifiedSearchQuery): Promise<UnifiedSearchResult[]> {
    // LocalSearchEngine.search() 是同步方法,包装为 async 以适配统一接口
    const syncResults = this.localSearch.search({
      query: query.query,
      limit: (query.limit ?? 20) * 2,
    })
    return syncResults
      .filter(r => !this.options.exclude.some(e => r.path.startsWith(e)))
      .map(r => ({
        id: `local:${r.id}`,
        source: 'local-files' as SearchSource,
        type: 'file' as const,
        title: r.path.split('/').pop() ?? r.path,
        snippet: r.snippet,
        fullPath: r.path,
        metadata: {
          score: r.rank,
          bm25Score: r.rank,
          matchCount: r.matchCount,
        },
        navigation: { kind: 'file' as const, path: r.path },
      }))
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 4.3 - 统一搜索 UI

**用户故事:** 作为用户,我希望按 Ctrl+P 就能开始搜索,看到结果按数据源分组,跨源跳转流畅。

#### 验收标准

1. When user presses `Ctrl+P` (or `Cmd+P`), the system shall open unified search palette
2. When user types, the system shall debounce 150ms then issue query
3. When results return, the system shall group by source with collapsible sections
4. When user presses `↑/↓`, the system shall navigate selection across groups
5. When user presses `Enter`, the system shall execute navigation based on result type (open file / focus memory entry / open external URL)
6. When user prefixes query with `mem:`, `file:`, `mcp:`, the system shall filter to that source only
7. When result count exceeds visible area, the system shall show "更多结果"按钮 with pagination
8. When no results found, the system shall show empty state with hint based on query pattern

#### UI 规格

```
┌─ 统一搜索 ────────────────────────────── ESC ─┐
│ 🔍 [认证流程的设计_______________________]   │
├─────────────────────────────────────────────┤
│ 📄 本地文件 (3)                              │
│   docs/auth-design.md                        │
│   认证流程的设计基于 OAuth2 ...               │
│   ─                                          │
│   docs/specs/auth-flow.md                    │
│   ...                                        │
│                                              │
│ 🧠 记忆 (2)                                  │
│   团队偏好用 JWT 而非 session                 │
│   confidence: 0.92  ·  hits: 8              │
│   ─                                          │
│   ...                                        │
│                                              │
│ 🔌 MCP · GitHub (1)                          │
│   Issue #234: Auth flow refactor             │
│   2026-04-22 · 由 Alice 创建                 │
│                                              │
│ ─────                                        │
│ 提示:`mem:` 仅查记忆 · `file:` 仅查文件     │
└──────────────────────────────────────────────┘
```

**实现:**

```tsx
// src/renderer/components/search/UnifiedSearchPalette.tsx

export function UnifiedSearchPalette() {
  const [query, setQuery] = useState('')
  const [response, setResponse] = useState<UnifiedSearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  
  const debouncedQuery = useDebounce(query, 150)
  
  useEffect(() => {
    if (!debouncedQuery.trim()) { setResponse(null); return }
    
    const sourceFilter = parseSourcePrefix(debouncedQuery)
    
    setLoading(true)
    window.electronAPI.search.unified({
      query: sourceFilter.cleanQuery,
      sources: sourceFilter.sources,
      limit: 30
    }).then(setResponse).finally(() => setLoading(false))
  }, [debouncedQuery])
  
  const grouped = useMemo(() => 
    groupBySource(response?.results ?? []), [response]
  )
  
  return (
    <CommandPalette open onClose={onClose}>
      <SearchInput value={query} onChange={setQuery} loading={loading} />
      
      {response?.partial && (
        <Banner severity="info">部分数据源响应较慢,先展示已收到结果</Banner>
      )}
      
      {Object.entries(grouped).map(([source, results]) => (
        <SourceGroup key={source} source={source as SearchSource} results={results} />
      ))}
      
      {response && response.totalCount === 0 && (
        <EmptyState query={query} />
      )}
    </CommandPalette>
  )
}
```

#### 与命令面板的关系

Sprint 3.4 已实现命令面板(`Ctrl+K`)。本 Sprint 的统一搜索是**独立但互通**的:
- `Ctrl+P` 直接打开统一搜索
- `Ctrl+K` 打开命令面板,在命令面板中输入搜索关键词时,系统按命令优先 + 统一搜索结果次之的方式展示

#### 优先级

P0 - 必须完成

---

### 需求 4.4 - 上下文引擎 v2

**用户故事:** 作为用户,我问 AI 关于"上次的认证决策"时,我希望它能同时考虑我的本地笔记、记忆中沉淀的项目约定、Slack 上的讨论——而不只是当前打开的文件。

#### 功能描述

在 Sprint 3.5 已建立的 ContextEngine 子模块化基础上,扩展为 v2:

**ContextEngine v1(Sprint 3)**: 三层 - always / manual / skill
**ContextEngine v1.5(Sprint 3.2)**: 加入 memory 层(向量检索的相关记忆)
**ContextEngine v2(本 Sprint)**: 加入 5 层 + 跨源智能选择

```
v2 上下文层(按优先级):
┌────────────────────────────────────────────┐
│ L1: always          (CLAUDE.md, 当前文件)   │  权重 30%
│ L2: ai-mode         (Sprint 3.4 模式 prompt) │  权重 10%
│ L3: memory          (Sprint 3.2 相关记忆)    │  权重 15%
│ L4: skill/agent     (Sprint 3.5 技能/智能体) │  权重 15%
│ L5: cross-source    (本 Sprint 跨源相关内容) │  权重 20%
│ L6: manual          (@文件 显式引用)         │  权重 10%
└────────────────────────────────────────────┘
```

L5 是本 Sprint 的新层:**通过统一搜索发现与用户问题相关的跨源内容**,智能筛选纳入上下文。这层包括:
- 与当前问题相似的历史文档
- MCP 同步数据中的相关 issue/PR/讨论
- Plans 中相关的计划
- 已归档但仍可能相关的内容

#### 验收标准

1. When user asks question, the system shall extract intent keywords and call unified search for L5 sources within 300ms
2. When L5 results found, the system shall apply token budget (default 20% of total) and rank by score
3. When token budget is tight, the system shall preserve L1-L4 fully and compress L5 first
4. When result is from MCP source, the system shall include source metadata in context label (e.g. "[来自 GitHub Issue #234]")
5. When AI references L5 content in response, the system shall enable navigation back to source
6. When ContextEngine v2 fails, the system shall fall back to v1.5 behavior (no L5)
7. When user invokes "重新搜索" command, the system shall force L5 re-evaluation with current question

#### 技术规格

**与 PromptComposer 的协作:**

```
用户消息进入
    ↓
ContextEngine v2 .assembleContextV2()
    ├─ L1: 加载 always 文件(已有)
    ├─ L2: AiMode prompt prefix(Sprint 3.4 已有)
    ├─ L3: MemoryIndexer.search()(Sprint 3.2 已有)
    ├─ L4: Skill/Sub-agent 资源(Sprint 3.5 已有)
    ├─ L5: UnifiedSearchEngine.search() 跨源筛选 ← 新增
    └─ L6: extractFileReferences()(Sprint 3 已有)
    ↓
PromptComposer .compose()
    ├─ 加载 core/identity.md, modes/*.md, tools/*.md
    └─ 与上述层组装为最终 system prompt
```

**实现:**

> **架构说明:** `assembleContextV2()` 作为**独立方法**追加到 `ContextEngine`,不复用 `assembleContext()` 内部流程。
> 原因:现有 `assembleContext()` 内部是 5 类源(always/memory/skill/manual/mcp)的并行收集 + 单一预算分配;
> v2 需要 6 层优先级顺序收集 + 分层预算(30%/10%/15%/15%/20%/10%)。
> 但 v2 **复用**现有私有方法(`collectAlwaysLoad`, `collectMemoryContext`, `collectManualRefs`, `collectSkillRefs`),
> 仅 L5(cross-source)为新增逻辑。这样既不破坏 v1 签名,又避免大量重复代码。

```typescript
// src/main/services/context-engine/index.ts(扩展)

export class ContextEngine {
  // ── 现有 v1 方法完全保留,不修改 ──
  async assembleContext(request: ContextAssemblyRequest): Promise<AssembledContext> {
    // 不变
  }
   
  async assembleForHarness(request: HarnessContextRequest): Promise<AssembledContext> {
    // 不变(Sprint 3.1)
  }
   
  // ── v2 新增方法(独立流程,不复用 assembleContext 内部流程) ──
  private unifiedSearch?: UnifiedSearchEngine  // 可选注入

  setUnifiedSearch(engine: UnifiedSearchEngine): void {
    this.unifiedSearch = engine
  }

  async assembleContextV2(request: ContextAssemblyRequestV2): Promise<AssembledContextV2> {
    // v2 降级:如果 unifiedSearch 未注入,退化为 v1.5 行为
    if (!this.unifiedSearch) {
      return this.assembleContextV2Fallback(request)
    }

    return this.tracer.withSpan('context.assemble.v2', async (span) => {
      const layers: ContextLayerV2[] = []
      const tokenBudget = request.tokenBudget ?? 50000
      
      // L1: always(复用现有 collectAlwaysLoad 私有方法)
      const alwaysSources = await this.collectAlwaysLoad(request)
      const alwaysContent = alwaysSources.map(s => s.content).join('\n\n')
      layers.push({ type: 'always', priority: 1, content: alwaysContent, tokens: this.estimateTokens(alwaysContent) })
      
      // L2: ai-mode(复用现有 aiModeRegistry.buildSystemPromptPrefix)
      if (request.aiMode) {
        const modePrompt = this.aiModeRegistry
          ? this.aiModeRegistry.buildSystemPromptPrefix(request.aiMode.id, {
              mode: request.aiMode.label,
              language: '中文',
            })
          : request.aiMode.systemPromptPrefix
        layers.push({ 
          type: 'ai-mode', 
          priority: 2, 
          content: modePrompt,
          tokens: this.estimateTokens(modePrompt)
        })
      }
      
      // L3: memory(复用现有 collectMemoryContext 私有方法)
      const memorySources = await this.collectMemoryContext(request)
      if (memorySources.length > 0) {
        const memoryContent = memorySources.map(s => s.content).join('\n\n')
        layers.push({
          type: 'memory',
          priority: 3,
          content: memoryContent,
          tokens: this.estimateTokens(memoryContent),
          sources: memorySources.map(s => ({ kind: 'memory' as const, id: s.filePath }))
        })
      }
      
      // L4: skill/agent(复用现有 collectSkillRefs 私有方法)
      if (request.activeSkills && request.activeSkills.length > 0) {
        const skillSources = await this.collectSkillRefs(request.activeSkills)
        if (skillSources.length > 0) {
          const skillContent = skillSources.map(s => s.content).join('\n\n')
          layers.push({ type: 'skill', priority: 4, content: skillContent, tokens: this.estimateTokens(skillContent) })
        }
      }
      
      // L5: cross-source(本 Sprint 新增,调用 UnifiedSearchEngine)
      try {
        const keywords = this.extractSearchKeywordsHeuristic(request.userMessage)
        if (keywords.length > 0 && this.unifiedSearch) {
          const searchResult = await this.unifiedSearch.search({
            query: keywords.join(' '),
            sources: this.selectRelevantSources(request),
            limit: 8,
            timeoutMs: 300
          })
          
          // 过滤掉已在 L1/L6 中的文件(去重)
          const alwaysPaths = new Set(alwaysSources.map(s => s.filePath))
          const manualPaths = new Set(request.manualRefs)
          const filtered = searchResult.results.filter(r =>
            !alwaysPaths.has(r.fullPath ?? '') && !manualPaths.has(r.fullPath ?? '')
          )
          
          const selected = filtered.slice(0, 5)
          if (selected.length > 0) {
            const crossContent = this.formatCrossSourceResults(selected)
            layers.push({
              type: 'cross-source',
              priority: 5,
              content: crossContent,
              tokens: this.estimateTokens(crossContent),
              hits: selected.length,
              sources: selected.map(r => r.navigation)
            })
          }
        }
      } catch (err) {
        // L5 失败不影响 L1-L4/L6,graceful degradation
        logger.warn('[ContextEngine] L5 cross-source failed, skipping', { err })
      }
      
      // L6: manual references(复用现有 collectManualRefs 私有方法)
      const manualSources = await this.collectManualRefs(request.manualRefs)
      if (manualSources.length > 0) {
        const manualContent = manualSources.map(s => s.content).join('\n\n')
        layers.push({ type: 'manual', priority: 6, content: manualContent, tokens: this.estimateTokens(manualContent) })
      }
      
      // Token 预算分配:按 v2 权重 30%/10%/15%/15%/20%/10%
      const final = this.applyV2TokenBudget(layers, tokenBudget)
      
      span.setAttributes({
        'context.layer_count': final.length,
        'context.total_tokens': final.reduce((s, l) => s + l.tokens, 0),
        'context.has_cross_source': final.some(l => l.type === 'cross-source'),
      })
      
      return {
        layers: final,
        systemPrompt: this.assembleV2SystemPrompt(final),
        totalTokens: final.reduce((s, l) => s + l.tokens, 0),
        sources: final.flatMap(l => l.sources ?? [])
      }
    }, { kind: 'system' })
  }
  
  // v2 降级:无 UnifiedSearchEngine 时退化为 v1.5
  private async assembleContextV2Fallback(request: ContextAssemblyRequestV2): Promise<AssembledContextV2> {
    const v1Result = await this.assembleContext({
      userMessage: request.userMessage,
      currentFile: request.currentFile,
      manualRefs: request.manualRefs,
      skillRefs: request.activeSkills,
    })
    return {
      layers: v1Result.layers.map((l, i) => ({
        type: l.type as ContextLayerV2['type'],
        priority: i + 1,
        content: l.sources.map(s => s.content).join('\n\n'),
        tokens: l.totalTokens,
      })),
      systemPrompt: v1Result.systemPrompt,
      totalTokens: v1Result.totalTokens,
      sources: [],
    }
  }

  // v2 预算分配:预算紧张时优先压缩 L5
  private applyV2TokenBudget(layers: ContextLayerV2[], totalBudget: number): ContextLayerV2[] {
    const weights: Record<string, number> = {
      'always': 0.30, 'ai-mode': 0.10, 'memory': 0.15,
      'skill': 0.15, 'cross-source': 0.20, 'manual': 0.10,
    }
    const totalUsed = layers.reduce((s, l) => s + l.tokens, 0)
    if (totalUsed <= totalBudget) return layers

    // 预算超限时:先压缩 L5(cross-source),保留 L1-L4 和 L6
    return layers.map(l => {
      if (l.type === 'cross-source') {
        const maxTokens = Math.floor(totalBudget * weights[l.type])
        if (l.tokens > maxTokens) {
          return { ...l, content: l.content.slice(0, maxTokens * 2) + TRUNCATION_MARKER, tokens: maxTokens }
        }
      }
      return l
    })
  }

  // v2 System Prompt 组装
  private assembleV2SystemPrompt(layers: ContextLayerV2[]): string {
    const segments: string[] = [SYSTEM_PROMPT_BASE]
    for (const layer of layers) {
      segments.push(`--- ${layer.type} ---\n${layer.content}`)
    }
    return segments.join('\n\n')
  }
  
  // 启发式关键词提取(不依赖 LLM,从用户消息中提取)
  private extractSearchKeywordsHeuristic(message: string): string[] {
    const stopwords = new Set([
      '的', '了', '是', '我', '怎么', '如何', 'how', 'what', 'the', 'is', 'a', 'an'
    ])
    return message.toLowerCase()
      .split(/\s+/)
      .filter(t => t.length > 1 && !stopwords.has(t))
      .slice(0, 6)
  }
  
  private selectRelevantSources(request: ContextAssemblyRequestV2): SearchSource[] {
    // 基于意图选择数据源
    if (request.intent === 'edit_file') {
      return ['local-files', 'memory']
    }
    if (request.intent === 'analyze') {
      return ['local-files', 'memory', 'memory-archive', 'mcp:github', 'mcp:slack']
    }
    // 默认包含活跃数据源
    return ['local-files', 'memory', 'mcp:github', 'mcp:slack', 'handbook']
  }
  
  private formatCrossSourceResults(results: UnifiedSearchResult[]): string {
    return results.map(r => 
      `### [${this.sourceLabel(r.source)}] ${r.title}\n${r.snippet}\n` +
      `_引用时请标注: ${r.navigation.kind}:${this.formatNavRef(r.navigation)}_`
    ).join('\n\n---\n\n')
  }
  
  private async extractSearchKeywords(message: string): Promise<string[]> {
    // 启发式优先,LLM 兜底
    const stopwords = new Set(['的', '了', '是', '我', '怎么', '如何', 'how', 'what', ...])
    const tokens = message.toLowerCase()
      .split(/\s+/)
      .filter(t => t.length > 1 && !stopwords.has(t))
    
    if (tokens.length >= 2 && tokens.length <= 6) {
      return tokens
    }
    
    // 太长或太短时调用 LLM 提取
    return await this.llmExtractKeywords(message)
  }
}
```

**与 Sprint 3.5 PromptComposer 的协作:**

PromptComposer 负责加载内置 prompt 片段(core/modes/tools/agents),ContextEngine v2 负责动态内容注入(memory/cross-source/files)。两者最终合并:

```typescript
async finalSystemPrompt(request): Promise<string> {
  const contextV2 = await this.contextEngine.assembleContextV2(request)
  
  const composed = await this.promptComposer.compose({
    mode: request.aiMode,
    tools: request.tools,
    currentAgent: request.activeAgent,
    workspaceInfo: this.workspaceInfo,
    userPreferences: this.userPreferences,
    additionalSections: contextV2.layers   // 动态层注入
  })
  
  return composed.text
}
```

#### 优先级

P0 - 必须完成

---

### 需求 4.5 - AI 主动检索(Agentic Retrieval)

**用户故事:** 作为用户,当我问 AI 一个超出当前上下文的问题时,我希望它能主动说"让我查一下相关的内容",而不是直接编造或承认无知。

#### 功能描述

在 Sprint 3.5 的 ToolScopeManager 基础上,注册新工具 `unified_search`。AI 在对话中可以主动调用此工具进行**多轮检索**:

```
用户:上次我们讨论的认证方案到底用了什么?
    ↓
AI:[判断需要主动检索]
    ↓
调用 unified_search({ query: "认证方案 决定" })
    ↓
检索结果返回(Memory: "团队偏好 JWT" + GitHub Issue #234)
    ↓
AI:根据记忆中的记录,团队选择了 JWT...(引用 [Issue #234])
```

**关键设计:**
- 工具调用走 Sprint 3.5 的 ToolScope 协议
- 受 Sprint 3.1 的 Guardrail 监管(避免无限循环检索)
- 每次检索产生 Trace span(Sprint 3.3)
- 检索结果按 Token 预算限制(避免一次拉太多)

#### 验收标准

1. When AI determines context insufficient, the system shall allow `unified_search` tool call
2. When `unified_search` is called, the system shall execute query and return top 5 results within 500ms
3. When AI calls `unified_search` 3+ times in single turn, the system shall trigger Guardrail (excessive search) and require user confirmation
4. When tool result is returned, the system shall format with source labels and citation hints
5. When AI cites a search result in response, the system shall verify the citation exists (Sprint 3.1 ReferenceIntegritySensor extension)
6. When user disables agentic retrieval in settings, the system shall not include `unified_search` in tool scope
7. When tool call fails, the AI shall gracefully acknowledge and continue with available context

#### 技术规格

**工具定义:**

> **约束说明:** 现有 `ToolContext`(来自 `src/main/services/harness/tool-scope.ts`)仅包含
> `workspaceRoot`、`sessionId`、`logger` 三个字段,无 `unifiedSearch` 属性。
> 本 Sprint 需扩展 `ToolContext` 接口,可选注入 `UnifiedSearchEngine`。
> 同时,现有 `SEARCH_TOOL`(id: `'search'`)为 placeholder stub,需替换为 `unified_search`。

```typescript
// src/main/services/harness/tools/unified-search-tool.ts

export const unifiedSearchTool: ToolDefinition = {
  id: 'unified_search',   // 替代现有 SEARCH_TOOL(id: 'search')
  name: 'unified_search',
  description: `Search across all data sources (local files, memory, MCP-synced data) when current context is insufficient. Use when:
- User asks about something not in current files or recent memory
- Question references past decisions, discussions, or external data (GitHub issues, Slack messages, etc.)
- You need to verify a fact across multiple sources

Do NOT use when:
- The answer is clearly in the current open file
- The question is about general knowledge (use your training)
- You've already searched in this turn`,
  
  schema: {
    type: 'object',
    required: ['query'],
    properties: {
      query: { 
        type: 'string', 
        description: 'Search query in natural language' 
      },
      sources: { 
        type: 'array',
        items: { type: 'string', enum: [...SEARCH_SOURCES] },
        description: 'Optional: limit to specific sources'
      },
      limit: { type: 'integer', default: 5, maximum: 10 }
    }
  },
  
  tags: ['search', 'retrieval'],
  
  async handler(args, ctx) {
    // ctx.unifiedSearch 为扩展后的 ToolContext 新增属性(可选注入)
    if (!ctx.unifiedSearch) {
      return { results: [], hint: 'Search engine not available' }
    }
    const result = await ctx.unifiedSearch.search({
      query: args.query,
      sources: args.sources,
      limit: args.limit ?? 5,
      timeoutMs: 500
    })
    
    // 格式化为 AI 友好的输出
    return {
      results: result.results.map(r => ({
        source: r.source,
        title: r.title,
        snippet: r.snippet,
        navigation: r.navigation,
        relevance_score: r.metadata.score
      })),
      partial: result.partial,
      hint: result.totalCount === 0 
        ? 'No results found. Try different keywords.' 
        : `Found ${result.totalCount} results. Cite using [source:title] format.`
    }
  }
}
```

**接入 ToolScopeManager:**

> **迁移策略:** 现有 `INTENT_PROFILES`(来自 `src/main/services/harness/tool-scope.ts`)中所有包含 `'search'` 的 profile
> 都需要将 `'search'` 替换为 `'unified_search'`。同时 `built-in-tools.ts` 中需将 `SEARCH_TOOL` 的 id 从 `'search'`
> 改为 `'unified_search'` 并接入实际 handler。`ToolContext` 接口扩展为包含可选 `unifiedSearch` 属性。

```typescript
// 现有 INTENT_PROFILES(来自 tool-scope.ts)→ 替换 'search' 为 'unified_search'
// 修改 src/main/services/harness/tool-scope.ts
// 修改 src/main/services/harness/built-in-tools.ts

// 扩展 ToolContext(新增 unifiedSearch 属性):
export interface ToolContext {
  readonly workspaceRoot: string
  readonly sessionId: string
  readonly logger: typeof loggerType
  readonly unifiedSearch?: UnifiedSearchEngine  // 新增:可选注入
}

// 更新后的 INTENT_PROFILES(对比现有版本,仅 'search' → 'unified_search'):
export const INTENT_PROFILES: readonly IntentProfile[] = [
  { 
    intent: 'chat',      
    tools: ['reference_file', 'unified_search', 'skill_activate'],
    maxTools: 6
  },
  { 
    intent: 'edit_file', 
    tools: ['reference_file', 'diff_write', 'unified_search', 'spec_lookup'],
    maxTools: 7
  },
  { 
    intent: 'analyze',   
    tools: ['reference_file', 'unified_search', 'memory_query', 'graph_traverse'],
    maxTools: 7
  },
  { 
    intent: 'plan',      
    tools: ['reference_file', 'unified_search', 'task_create', 'memory_query'],
    maxTools: 7
  }
]
```

**Guardrail:防止滥用**

> **架构说明:** 现有 `GuardrailRule` 接口(来自 `src/main/services/harness/guardrails/types.ts`)的 `check()` 方法
> 接收 `FileOperation` 参数(类型为 `write|delete|rename|read`),无法检查 `ToolCall` 操作。
> 因此 `ExcessiveSearchGuard` 不实现 `GuardrailRule`,而是实现新的 `ToolCallGuard` 接口,
> 在 `HarnessOrchestrator` 的工具调用路径中注入,而非复用 `GuardrailEngine`。

```typescript
// src/main/services/harness/guardrails/excessive-search.ts(本 Sprint 新增)

// 新增:工具调用级别的守卫接口(独立于 GuardrailRule)
export interface ToolCallGuard {
  readonly id: string
  readonly description: string
  check(toolId: string, sessionId: string): Promise<GuardrailVerdict>
  resetTurn(sessionId: string): void
}

export class ExcessiveSearchGuard implements ToolCallGuard {
  readonly id = 'excessive-search'
  readonly description = 'Prevent AI from calling unified_search more than 3 times per turn'
   
  private callCounter = new Map<string, number>()  // sessionId → count
   
  async check(toolId: string, sessionId: string): Promise<GuardrailVerdict> {
    if (toolId !== 'unified_search') {
      return { allow: true }
    }
     
    const count = (this.callCounter.get(sessionId) ?? 0) + 1
    this.callCounter.set(sessionId, count)
     
    if (count > 3) {
      return {
        allow: 'conditional',
        ruleId: this.id,
        requireConfirmation: true,
        reason: `AI has called unified_search ${count} times in this turn. Continue?`
      }
    }
     
    return { allow: true }
  }
   
  // HarnessOrchestrator 在 turn 结束时调用
  resetTurn(sessionId: string): void {
    this.callCounter.delete(sessionId)
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 4.6 - 双向链接系统

**用户故事:** 作为用户,我希望在文档 A 中链接到文档 B 后,在文档 B 中能反向看到"哪些文档引用了我",形成知识网络。

#### 功能描述

在 Tiptap 编辑器(Sprint 1)中支持 `[[wiki-link]]` 语法。系统维护双向链接索引,提供:

- 输入 `[[` 时弹出文件名补全(模糊匹配)
- 链接保存为 `[[file-name]]` 在 Markdown 中
- 鼠标悬停链接时显示目标文件预览
- 文档侧边栏显示"反向链接"面板(谁引用了当前文档)
- 跨链接的语义搜索:点击 [[xxx]] 跳转到目标 + 显示相关链接

**实现策略:**
- 链接索引存储在 SQLite 中,与 LocalSearchEngine 同库
- 文件保存时自动更新链接索引(通过事件总线监听 `file.updated`)
- Tiptap 扩展处理 `[[link]]` 渲染与交互

#### 验收标准

1. When user types `[[` in editor, the system shall show autocomplete of matching files within 100ms
2. When user selects file, the system shall insert `[[file-path]]` with link styling
3. When user clicks `[[link]]`, the system shall open target file in new tab
4. When user hovers `[[link]]`, the system shall show preview popup with first 200 chars
5. When file is saved, the system shall update bidirectional link index within 1 second
6. When file is deleted, the system shall mark links pointing to it as broken (red styling)
7. When user opens "反向链接"面板, the system shall list all files that link to current within 100ms
8. When file is renamed, the system shall offer to update all backlinks pointing to old name

#### 技术规格

**链接索引 schema:**

```sql
CREATE TABLE wiki_links (
  source_path TEXT NOT NULL,         -- 包含链接的文件
  target_path TEXT NOT NULL,         -- 被链接的文件
  link_text TEXT NOT NULL,           -- 显示文本(可与 target_path 不同)
  position INTEGER,                  -- 在源文件中的字符位置
  created_at TEXT,
  PRIMARY KEY (source_path, target_path, position)
);

CREATE INDEX idx_target ON wiki_links(target_path);
CREATE INDEX idx_source ON wiki_links(source_path);
```

**Tiptap 扩展:**

```typescript
// src/renderer/components/editor/extensions/wiki-link.ts

export const WikiLink = Node.create({
  name: 'wikiLink',
  inline: true,
  group: 'inline',
  
  addAttributes() {
    return {
      target: { default: null },
      label: { default: null },
      broken: { default: false }
    }
  },
  
  parseHTML() {
    return [{ tag: 'a[data-wiki-link]' }]
  },
  
  renderHTML({ node, HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes, {
      'data-wiki-link': '',
      'data-target': node.attrs.target,
      class: node.attrs.broken ? 'wiki-link broken' : 'wiki-link',
      href: '#'
    }), node.attrs.label ?? node.attrs.target]
  },
  
  addInputRules() {
    return [
      // 输入 [[xxx]] 时自动转换为 wiki-link 节点
      new InputRule({
        find: /\[\[([^\]]+)\]\]/,
        handler: ({ state, range, match }) => {
          const target = match[1].trim()
          state.tr.replaceWith(range.from, range.to, this.type.create({ target }))
        }
      })
    ]
  },
  
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleClick: (view, pos, event) => {
            const target = (event.target as HTMLElement)
            if (target.matches('[data-wiki-link]')) {
              const path = target.dataset.target
              window.electronAPI.editor.openFile(path)
              return true
            }
            return false
          }
        }
      })
    ]
  }
})
```

**自动补全:**

```typescript
// src/renderer/components/editor/extensions/wiki-link-suggest.ts

export const WikiLinkSuggest = Suggestion.configure({
  char: '[[',
  startOfLine: false,
  
  async items({ query }) {
    return await window.electronAPI.search.fuzzyFiles(query, { limit: 10 })
  },
  
  render: () => {
    let component, popup
    return {
      onStart: props => {
        component = new ReactRenderer(WikiLinkPicker, { props })
        popup = tippy('body', { 
          getReferenceClientRect: props.clientRect,
          content: component.element,
          showOnCreate: true,
          interactive: true
        })
      },
      // ...
    }
  }
})
```

**反向链接面板:**

```tsx
// src/renderer/components/editor/BacklinksPanel.tsx

// 注意:渲染进程无法直接订阅 AppEventBus(主进程 EventEmitter)
// 通过 IPC 事件桥接:主进程 emitEvent → webContents.send('event:push') → 渲染进程回调
export function BacklinksPanel({ filePath }: { filePath: string }) {
  const [backlinks, setBacklinks] = useState<Backlink[]>([])
   
  useEffect(() => {
    window.electronAPI.wikiLinks.getBacklinks(filePath).then(setBacklinks)
    
    // 通过 IPC 事件桥接监听文件变更(非直接订阅 AppEventBus)
    const unsub = window.electronAPI.events.on('wiki-links.updated', (e) => {
      if (e.payload.linksTo?.includes(filePath)) {
        window.electronAPI.wikiLinks.getBacklinks(filePath).then(setBacklinks)
      }
    })
    return unsub
  }, [filePath])
  
  if (backlinks.length === 0) {
    return <EmptyState>暂无引用此文档的页面</EmptyState>
  }
  
  return (
    <div className="backlinks-panel">
      <h3>引用此文档的页面 ({backlinks.length})</h3>
      {backlinks.map(b => (
        <BacklinkCard key={b.sourcePath} backlink={b} />
      ))}
    </div>
  )
}
```

**索引更新通过事件总线:**

```typescript
// src/main/services/wiki-links/wiki-links-indexer.ts

export class WikiLinksIndexer {
  constructor(
    private db: SQLiteDB,
    private fileManager: FileManager,
    private eventBus: AppEventBus
  ) {
    this.subscribeToEvents()
  }
   
  private subscribeToEvents() {
    // 使用扩展后的 subscribe 方法(非原有 EventMap 的 on)
    this.eventBus.subscribe('file.updated', async (event) => {
      const { path } = event.payload as { path: string }
      if (!path.endsWith('.md')) return
      
      const content = await this.fileManager.readFile(path)
      const links = this.extractLinks(content)
      
      // 重建该文件的所有出链
      this.db.transaction(() => {
        this.db.prepare('DELETE FROM wiki_links WHERE source_path = ?').run(path)
        for (const link of links) {
          this.db.prepare(`
            INSERT INTO wiki_links (source_path, target_path, link_text, position, created_at)
            VALUES (?, ?, ?, ?, ?)
          `).run(path, link.target, link.text, link.position, new Date().toISOString())
        }
      })()
      
      // 通知 backlinks 面板刷新(通过统一事件流)
      this.eventBus.emitEvent({
        type: 'wiki-links.updated',
        source: 'wiki-links-indexer',
        payload: { path, linksTo: links.map((l: { target: string }) => l.target) }
      })
    })
    
    this.eventBus.subscribe('file.deleted', async (event) => {
      // 标记指向已删除文件的链接为 broken
      const { path } = event.payload as { path: string }
      this.db.prepare(`
        UPDATE wiki_links SET target_path = ? WHERE target_path = ?
      `).run(`__broken__:${path}`, path)
    })
  }
  
  async getBacklinks(targetPath: string): Promise<Backlink[]> {
    return this.db.prepare(`
      SELECT source_path, link_text, position 
      FROM wiki_links 
      WHERE target_path = ?
      ORDER BY source_path
    `).all(targetPath) as Backlink[]
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 4.7 - 文档关系图谱

**用户故事:** 作为用户,我想看到我的工作区是一张知识地图,而不是一堆孤立文件,这样我能发现意外的连接。

#### 功能描述

基于双向链接索引(需求 4.6)与跨源关系数据,提供可视化图谱面板。节点为文档,边为链接关系,可缩放、过滤、搜索。

#### 验收标准

1. When user opens "关系图谱" command, the system shall render graph within 1 second for workspaces with < 500 nodes
2. When user clicks node, the system shall show file preview and outgoing/incoming link list
3. When user filters by tag/path, the system shall update graph in real-time
4. When workspace exceeds 500 files, the system shall offer "聚焦视图"(以当前文件为中心,2 度内的关联)
5. When two clusters of files have no connection, the system shall visually separate them
6. When user pins nodes, the system shall maintain positions across sessions

#### 优先级

P1 - 应该完成

---

### 需求 4.8 - 多端同步增强

**用户故事:** 作为用户,我在公司笔记本上整理了 Plan、记忆、任务,回家用台式机打开同一个 workspace,我希望这些都已经同步好了。

#### 功能描述

Sprint 2 的 SyncManager 已实现工作区 Git 同步。本 Sprint 在其上扩展同步范围与策略:

| 数据类型 | 同步状态(Sprint 2 之后) | 本 Sprint 处理 |
|---|---|---|
| 用户文档 | 已同步(Git) | 不变 |
| MEMORY.md | **未同步**(在 .gitignore 中) | 提供"加密同步"选项 |
| .sibylla/plans/ | **未同步** | 默认同步 |
| .sibylla/agents/ | **未同步** | 默认同步(任务状态多端续传) |
| .sibylla/trace/ | 不应同步 | 保持本地 |
| .sibylla/events/ | 不应同步 | 保持本地 |
| .sibylla/index/ | 不应同步 | 保持本地 |
| .sibylla/mcp/ | 不应同步 | 保持本地 |

**关键设计:**
- 同步分级:**核心数据**(必须多端一致) / **个人偏好**(可选) / **本地缓存**(永不同步)
- MEMORY.md 因含敏感信息,提供端到端加密选项(用户密码派生密钥)
- 同步冲突复用 Sprint 2 的合并界面

#### 验收标准

1. When sync runs, the system shall include `plans/`, `agents/` directories by default
2. When user enables "记忆同步"(opt-in), the system shall encrypt MEMORY.md before pushing
3. When MEMORY.md syncs from another device, the system shall decrypt with user's key
4. When key is missing or wrong, the system shall mark MEMORY.md as "未解锁" and continue with empty memory
5. When `agents/{taskId}/state.json` syncs, the system shall validate JSON structure before applying
6. When task state from another device conflicts with local, the system shall use last-write-wins by `updatedAt`
7. When `.sibylla/trace/` accidentally synced (legacy data), the system shall warn and offer to .gitignore

#### 技术规格

**.gitignore 规则更新:**

```
# .sibylla 子目录默认同步策略
.sibylla/trace/        # 不同步
.sibylla/events/       # 不同步
.sibylla/index/        # 不同步
.sibylla/mcp/          # 不同步
.sibylla/snapshots/    # 不同步
.sibylla/handbook-local/  # 不同步(可在设备上重建)

# 不在 .gitignore 中(默认同步):
# .sibylla/plans/
# .sibylla/agents/
# .sibylla/handbook/(用户克隆版)
# .sibylla/MEMORY.md(可选,加密)
```

**MEMORY.md 加密同步:**

```typescript
// src/main/services/sync/memory-sync.ts

export class MemorySyncManager {
  async beforePush(): Promise<void> {
    if (!this.config.syncMemory) return
    
    const memoryPath = '.sibylla/memory/MEMORY.md'
    const plaintext = await this.fileManager.readFile(memoryPath)
    
    const key = await this.deriveKeyFromPassword(this.userPassword)
    const ciphertext = await this.encrypt(plaintext, key)
    
    // 写入加密版本到同步路径,本地版本保持明文
    await this.fileManager.writeFile(
      '.sibylla/memory/MEMORY.encrypted', 
      ciphertext.toString('base64')
    )
    
    // .gitignore 中:.sibylla/memory/MEMORY.md(本地)
    // Git tracked:    .sibylla/memory/MEMORY.encrypted
  }
  
  async afterPull(): Promise<void> {
    if (!this.config.syncMemory) return
    
    const encryptedPath = '.sibylla/memory/MEMORY.encrypted'
    if (!await this.fileManager.exists(encryptedPath)) return
    
    const ciphertext = Buffer.from(
      await this.fileManager.readFile(encryptedPath), 
      'base64'
    )
    
    try {
      const key = await this.deriveKeyFromPassword(this.userPassword)
      const plaintext = await this.decrypt(ciphertext, key)
      await this.fileManager.atomicWrite('.sibylla/memory/MEMORY.md', plaintext)
    } catch (err) {
      this.logger.error('memory.sync.decrypt-failed', { err })
      this.eventBus.emitEvent({
        type: 'memory.sync-locked',
        source: 'memory-sync',
        payload: { reason: 'decryption-failed' }
      })
    }
  }
  
  private async deriveKeyFromPassword(password: string): Promise<Buffer> {
    return scryptSync(password, this.workspaceId, 32)
  }
}
```

**任务状态多端续传:**

```typescript
// 与 Sprint 3.1 TaskStateMachine 协作
export class TaskStateMachineSync {
  constructor(
    private taskStateMachine: TaskStateMachine,
    private eventBus: AppEventBus
  ) {
    this.eventBus.subscribe('git.pull-completed', async () => {
      // 检测从远端同步过来的任务状态
      const remoteTasks = await this.taskStateMachine.findResumeable()
      
      for (const task of remoteTasks) {
        if (task.lastSessionId !== this.currentSessionId) {
          this.eventBus.emitEvent({
            type: 'task.cross-device-resumeable',
            source: 'task-sync',
            payload: { task }
          })
        }
      }
    })
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 4.9 - 跨源引用追溯

**用户故事:** 作为用户,AI 给我的回答中如果引用了"GitHub Issue #234",我希望点一下就能看到原文,而不是去 GitHub 翻找。

#### 功能描述

AI 响应中的所有引用使用统一格式:`[source:identifier]`,系统自动渲染为可点击链接,点击后:
- 本地文件 → 在编辑器中打开
- 记忆条目 → 在记忆面板中聚焦
- MCP 数据 → 打开本地副本(已通过 Sprint 3.6 同步落地)+ 提供"查看原始来源"链接
- Handbook → 在 Handbook viewer 中打开

#### 验收标准

1. When AI response contains `[file:path/to/file.md]`, the system shall render as clickable link
2. When user clicks link, the system shall navigate based on source type
3. When citation is broken (target not found), the system shall show with warning style and offer search alternatives
4. When AI response cites memory entry, the system shall include confidence score in tooltip
5. When AI response cites MCP record, the system shall show source provider icon (GitHub/Slack/Notion)
6. When user shares conversation export, the system shall preserve citation links in Markdown

#### 引用格式约定

```
本地文件:        [file:docs/auth-design.md]
本地文件 + 行号: [file:docs/auth-design.md#L42]
记忆条目:        [memory:dec-001]
Handbook:        [handbook:modes/plan]
MCP GitHub:      [mcp:github:issue/234]
MCP Slack:       [mcp:slack:channel/msg-id]
MCP Notion:      [mcp:notion:page-id]
Plan:           [plan:plan-20260418-103000]
```

#### 优先级

P0 - 必须完成

---

## 三、非功能需求

### 3.1 性能要求

- 统一搜索查询 < 300ms (P95,所有源)
- 单源查询 < 200ms (P95)
- 事件总线分发 < 50ms (单事件)
- ContextEngine v2 组装 < 800ms (含 L5 跨源检索)
- 双向链接索引更新 < 1 秒 (单文件保存后)
- 双向链接补全 < 100ms

### 3.2 可靠性要求

- 任一搜索源故障不影响其他源
- 事件总线订阅者异常隔离,不影响其他订阅者
- ContextEngine v2 失败自动降级到 v1.5
- 多端同步失败保留本地完整状态

### 3.3 隐私与安全

- 跨源搜索默认在本地执行,不上传查询语句到云端
- MEMORY.md 加密同步使用 AES-256-GCM
- 加密密钥从用户密码派生(scrypt),永不离开本地
- AI 主动检索的 query 内容写入 Trace,但敏感模式被脱敏

### 3.4 兼容性

- ContextEngine v1 / v1.5 / v2 三版本共存,通过参数切换
- 现有 IPC 通道全部保留
- `[[wiki-link]]` 在 Markdown 源码中保持纯文本格式(无 HTML)

---

## 四、技术约束

### 4.1 架构约束

- 事件总线(`AppEventBus`)位于主进程,渲染进程通过 IPC 订阅
- 统一搜索引擎位于 `src/main/services/unified-search/`
- ContextEngine v2 在现有 `src/main/services/context-engine/` 内扩展
- 双向链接索引复用现有 SQLite 实例,不开新数据库
- 多端同步基于 Sprint 2 的 SyncManager,不重新实现 Git 操作

### 4.2 与现有模块的集成

| 现有模块 | 改造方式 |
|---|---|
| Sprint 3.3 `AppEventBus` | 追加式扩展:保留全部 17 个具名方法 + EventMap,新增 `emitEvent()`/`subscribe()`/`subscribeAny()` 通用接口 + 桥接映射 |
| Sprint 3.2 `MemoryEventBus` | 不修改,通过新增 `MemoryEventBusBridge` 桥接器转发到 `AppEventBus` |
| Sprint 3.2 `MemoryIndexer` | 不修改,通过 `MemoryAdapter` 做字段名映射(`finalScore`→`score` 等)接入统一搜索 |
| Sprint 3 `LocalSearchEngine` | 不修改,通过 `LocalFilesAdapter` 包装同步 `search()` 为 async 接入统一搜索 |
| Sprint 3.4 `HandbookService` | 不修改,通过 `HandbookAdapter` 自行计算 snippet/score 接入统一搜索 |
| Sprint 3.5 `ContextEngine` | 追加 `assembleContextV2()` 独立方法 + `setUnifiedSearch()` 注入,v1/v1.5 方法签名完全保留 |
| Sprint 3.5 `PromptComposer` | 不修改,接收 v2 的动态层作为 `additionalSections` 参数(已有接口) |
| Sprint 3.5 `ToolScopeManager` | 扩展 `ToolContext` 新增 `unifiedSearch?` 属性;将 `SEARCH_TOOL`(id:`search`)替换为 `unified_search` |
| Sprint 3.1 `GuardrailRule` | 不修改,`ExcessiveSearchGuard` 实现新的 `ToolCallGuard` 独立接口,在工具调用路径注入 |
| Sprint 3.6 `McpSyncManager` | 不修改,其落地的文件自动被 LocalSearchEngine 索引 |
| Sprint 2 `SyncManager` | 不修改,新增 `MemorySyncManager` 与 `TaskStateMachineSync` 作为 hooks |
| Sprint 1 Tiptap 编辑器 | 新增 `WikiLink` 与 `WikiLinkSuggest` 扩展(追加式,不修改现有扩展) |

### 4.3 与 CLAUDE.md 的一致性

- **文件即真相**:双向链接以 `[[file]]` 文本存在 Markdown 中
- **本地优先**:跨源搜索默认本地执行
- **可观测**:所有跨源操作进 Trace
- **个人空间隔离**:统一搜索遵循 personal/ 边界

---

## 五、目录结构

```
src/main/services/
├── unified-search/                    # 新增
│   ├── unified-search-engine.ts
│   ├── types.ts
│   ├── adapters/
│   │   ├── local-files-adapter.ts
│   │   ├── memory-adapter.ts
│   │   ├── handbook-adapter.ts
│   │   └── mcp-adapter.ts
│   └── ranking.ts
├── event-bus.ts                       # Sprint 3.3 已有,本 Sprint 扩展
├── event-log-store.ts                 # 新增,事件持久化
├── event-bus-bridges.ts               # 新增,MemoryEventBus→AppEventBus 桥接
├── context-engine/                    # Sprint 3.5 已建,本 Sprint 扩展
│   ├── index.ts                       # 新增 assembleContextV2
│   ├── PromptComposer.ts              # Sprint 3.5,不变
│   ├── PromptLoader.ts                # Sprint 3.5,不变
│   └── cross-source-layer.ts          # 新增,L5 实现
├── wiki-links/                        # 新增
│   ├── wiki-links-indexer.ts
│   ├── wiki-links-store.ts
│   └── types.ts
├── sync/                              # 新增子目录
│   ├── memory-sync.ts
│   ├── task-state-machine-sync.ts
│   └── encryption.ts
└── harness/
    ├── guardrails/
    │   ├── types.ts                   # Sprint 3.1 已有,本 Sprint 不修改
    │   └── excessive-search.ts        # 新增,实现 ToolCallGuard 接口(非 GuardrailRule)
    └── tools/
        ├── built-in-tools.ts          # Sprint 3.1 已有,修改:search→unified_search
        ├── tool-scope.ts              # Sprint 3.1 已有,修改:扩展 ToolContext
        └── unified-search-tool.ts     # 新增,接入 Sprint 3.5 ToolScope

src/renderer/components/
├── search/                            # 新增
│   ├── UnifiedSearchPalette.tsx
│   ├── SourceGroup.tsx
│   ├── SearchResultItem.tsx
│   └── EmptyState.tsx
├── editor/
│   ├── extensions/
│   │   ├── wiki-link.ts               # 新增
│   │   └── wiki-link-suggest.ts       # 新增
│   ├── BacklinksPanel.tsx             # 新增
│   └── WikiLinkPicker.tsx             # 新增
└── graph/                             # 可选 P1
    └── KnowledgeGraph.tsx
```

---

## 六、IPC 接口清单

新增 IPC 通道(全部追加到 `IPC_CHANNELS`):

```typescript
// 统一搜索
SEARCH_UNIFIED_QUERY: 'search:unified:query'
SEARCH_UNIFIED_LIST_SOURCES: 'search:unified:listSources'
SEARCH_FUZZY_FILES: 'search:fuzzyFiles'   // wiki-link 补全用

// 双向链接
WIKI_LINKS_GET_BACKLINKS: 'wikiLinks:getBacklinks'
WIKI_LINKS_GET_OUTLINKS: 'wikiLinks:getOutlinks'
WIKI_LINKS_REBUILD_INDEX: 'wikiLinks:rebuildIndex'

// 事件总线(渲染进程订阅)
EVENT_SUBSCRIBE: 'event:subscribe'
EVENT_UNSUBSCRIBE: 'event:unsubscribe'
EVENT_PUSH: 'event:push'   // M→R

// 多端同步增强
SYNC_MEMORY_ENABLE: 'sync:memory:enable'
SYNC_MEMORY_DISABLE: 'sync:memory:disable'
SYNC_MEMORY_SET_PASSWORD: 'sync:memory:setPassword'
SYNC_TASK_LIST_CROSS_DEVICE: 'sync:task:listCrossDevice'

// ContextEngine v2(主要内部使用,暴露调试入口)
CONTEXT_ENGINE_V2_PREVIEW: 'contextEngine:v2:preview'
```

---

## 七、验收检查清单

### 事件总线
- [ ] AppEventBus 扩展完成:现有 17 个具名方法全部保留且正常工作
- [ ] 新增通用接口 `emitEvent()`/`subscribe()`/`subscribeAny()` 可用
- [ ] 现有 EventMap 事件到统一事件流的桥接映射生效(如 `trace:span-ended` → `trace.span-ended`)
- [ ] MemoryEventBus 桥接到 AppEventBus(通过 `event-bus-bridges.ts`)
- [ ] 事件订阅异常隔离生效(单个 handler 异常不影响其他)
- [ ] 事件持久化(可选 persist:true)写入 `.sibylla/events/` JSONL
- [ ] 所有事件产生 Trace span
- [ ] 渲染进程可通过 IPC 事件桥接(`event:subscribe`/`event:push`)订阅事件

### 统一搜索
- [ ] 跨源查询 P95 < 300ms
- [ ] 多源融合排序权重生效
- [ ] 单源超时不影响其他源
- [ ] 命令面板 Ctrl+P 入口可用
- [ ] 源前缀过滤(`mem:` `file:` `mcp:`)生效
- [ ] MCP 数据通过路径前缀正确分组

### ContextEngine v2
- [ ] 5 层上下文模型生效
- [ ] L5 跨源层 Token 预算 20%
- [ ] 跨源失败降级到 v1.5
- [ ] 与 PromptComposer 协作正常
- [ ] 上下文层去重(L1/L6 与 L5 不重复)

### AI 主动检索
- [ ] `ToolContext` 扩展完成:新增 `unifiedSearch?` 属性
- [ ] 现有 `SEARCH_TOOL`(id:`search`)已替换为 `unified_search`,旧 stub handler 已接入 UnifiedSearchEngine
- [ ] INTENT_PROFILES 中所有 `'search'` 已替换为 `'unified_search'`
- [ ] unified_search 工具注册到 ToolScopeManager
- [ ] AI 可在对话中主动调用
- [ ] ExcessiveSearchGuard 实现 `ToolCallGuard` 接口(非 `GuardrailRule`),在工具调用路径注入
- [ ] ExcessiveSearchGuard 在 3+ 次后触发
- [ ] 检索结果引用可追溯
- [ ] 用户可设置中禁用

### 双向链接
- [ ] [[link]] 输入规则生效
- [ ] 自动补全 < 100ms
- [ ] 反向链接面板显示正确
- [ ] 文件保存后链接索引更新 < 1 秒
- [ ] 重命名时提示更新所有 backlinks
- [ ] 鼠标悬停预览

### 多端同步增强
- [ ] plans/ agents/ 默认纳入 Git
- [ ] trace/ events/ index/ 默认排除
- [ ] MEMORY.md 加密同步可选
- [ ] 任务状态多端续传可用
- [ ] 解密失败优雅降级

### 跨源引用
- [ ] 6 种引用格式渲染正确
- [ ] 点击跳转到对应源
- [ ] 损坏引用警告显示
- [ ] 导出对话保留引用

### 集成验证
- [ ] 与 Sprint 3.2 MemoryIndexer 对接(MemoryAdapter 字段名映射正确:finalScore→score 等)
- [ ] 与 Sprint 3 LocalSearchEngine 对接(LocalFilesAdapter 包装同步方法为 async)
- [ ] 与 Sprint 3.5 PromptComposer 协作正常(v2 动态层通过 additionalSections 注入)
- [ ] 与 Sprint 3.6 MCP 数据自动接入搜索(通过路径前缀识别)
- [ ] 与 Sprint 3.1 Guardrail 不冲突(ExcessiveSearchGuard 使用独立 ToolCallGuard 接口)
- [ ] 与 Sprint 3.3 AppEventBus 兼容(现有具名方法 + EventMap 不受影响)
- [ ] 与 Sprint 2 SyncManager 不冲突(MemorySyncManager 作为 hook,不修改 SyncManager)
- [ ] ContextEngine v1 / assembleContext() / assembleForHarness() 签名和输出不变
- [ ] ToolScopeManager 现有工具(reference_file/diff_write 等)不受 unified_search 注册影响

---

## 八、风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 跨源搜索延迟过高影响体验 | 中 | 高 | 单源超时 + 部分结果返回 + 客户端流式渲染 |
| ContextEngine v2 上下文过载导致 token 超限 | 中 | 高 | L5 严格 token 预算 + 渐进式加载 + Reactive Compact 兜底(Sprint 3.5) |
| AI 主动检索陷入循环 | 中 | 中 | Guardrail 限制 3 次/turn + Trace 监控 |
| MCP 数据爆炸式增长拖慢搜索 | 中 | 中 | 索引时按时间窗口截断 + 默认仅最近 30 天 |
| MEMORY.md 加密同步丢密码导致数据不可读 | 低 | 高 | 启用前强制提示、提供导出明文备份选项 |
| 双向链接索引与文件不一致 | 中 | 低 | 启动时校验 + 手动重建入口 |
| Sprint 3.2 MemoryIndexer 与统一搜索接口语义差异 | 中 | 中 | MemoryAdapter 做适配层(字段名 camelCase 映射 + 缺失字段处理),不修改 MemoryIndexer |
| Sprint 3 LocalSearchEngine 同步方法与异步并行查询不兼容 | 低 | 低 | LocalFilesAdapter 内部包装 `Promise.resolve()`,FTS5 同步查询 < 50ms 无超时风险 |
| Sprint 3.1 GuardrailRule 不支持 ToolCall 检查 | 低 | 中 | ExcessiveSearchGuard 使用独立 ToolCallGuard 接口,不修改 GuardrailEngine |
| Sprint 3.5 ToolContext 缺少 UnifiedSearchEngine 引用 | 低 | 中 | 扩展 ToolContext 新增 `unifiedSearch?` 可选属性,不破坏现有 handler |
| 事件总线流量过大成性能瓶颈 | 低 | 中 | 背压机制 + 采样持久化 + 高频事件批处理 |

---

## 九、参考资料

- [CLAUDE.md](../../../CLAUDE.md) - 项目宪法
- [`sprint3.2-memory.md`](./sprint3.2-memory.md) - MemoryIndexer 来源
- [`sprint3.3-trace.md`](./sprint3.3-trace.md) - AppEventBus 与 Tracer
- [`sprint3.4-mode.md`](./sprint3.4-mode.md) - DataSourceProvider 抽象
- [`sprint3.5-ai_ablities.md`](./sprint3.5-ai_ablities.md) - PromptComposer 与 ContextEngine 子模块化
- [`sprint3.6-MCP.md`](./sprint3.6-MCP.md) - MCP 数据落地路径

---

## 十、交付物清单

### 代码
- 主进程:`unified-search/`(8 文件)、`event-log-store.ts`、`event-bus-bridges.ts`、`context-engine/cross-source-layer.ts`、`wiki-links/`(3 文件)、`sync/`(3 文件)、`harness/tools/unified-search-tool.ts`、`harness/guardrails/excessive-search.ts`
- 主进程修改(现有文件):`event-bus.ts`(追加通用接口)、`harness/tool-scope.ts`(扩展 ToolContext)、`harness/built-in-tools.ts`(search→unified_search)、`context-engine/context-engine.ts`(追加 assembleContextV2)、`shared/types.ts`(追加 IPC 通道)
- 渲染进程:统一搜索面板组件、双向链接 Tiptap 扩展、Backlinks 面板
- IPC handlers:`unified-search.ts`、`wiki-links.ts`、`event.ts`(新增 IPC 事件桥接)、`sync-extra.ts`

### 测试
- 跨源融合排序单测
- ContextEngine v2 集成测试
- 双向链接索引一致性测试
- 多端同步加密往返测试
- AI 主动检索 Guardrail 测试
- 与 Sprint 3.2-3.6 兼容性回归测试
