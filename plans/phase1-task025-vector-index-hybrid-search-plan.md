# PHASE1-TASK025: 向量索引与混合检索引擎 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task025_vector-index-hybrid-search.md](../specs/tasks/phase1/phase1-task025_vector-index-hybrid-search.md)
> 创建日期：2026-04-21
> 最后更新：2026-04-21

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK025 |
| **任务标题** | 向量索引与混合检索引擎 |
| **所属阶段** | Phase 1 - 记忆系统 v2 (Sprint 3.2) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | TASK022（数据层）+ TASK023（提取器，可并行）+ TASK024（检查点与压缩） |

### 1.1 目标

实现记忆系统的"检索与消费层"——让 TASK022-024 积累的结构化记忆真正被 AI 使用。核心交付：

1. **EmbeddingProvider 接口与 LocalEmbeddingProvider 实现**：使用 `@xenova/transformers` 加载 `all-MiniLM-L6-v2`（384 维），支持懒加载和降级
2. **MemoryIndexer**：基于 `better-sqlite3` + `sqlite-vec` + `FTS5` 的三维度混合检索引擎（`0.6 × cosine + 0.3 × bm25 + 0.1 × time_decay`）
3. **ContextEngine memory 层集成**：在 `assembleContext()` 中新增第 4 层 `memory`，Token 预算 55/15/15/15 重分配
4. **AIHandler 注入逻辑迁移**：移除手动截断，改由 ContextEngine memory 层和 MemoryIndexer 负责
5. **降级链**：`MemoryIndexer.search()` → FTS5-only → `LocalRagEngine.search()`
6. **IPC 通道行为变更**：`rag:search` / `rag:rebuild` 优先走 MemoryIndexer

### 1.2 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| 类型扩展 | `memory/types.ts` | 完善 SearchOptions/HybridSearchResult + 新增 EmbeddingProvider 接口 |
| Embedding 提供商 | `memory/embedding-provider.ts` | 新建：LocalEmbeddingProvider + CloudEmbeddingProvider 空壳 |
| 向量索引器 | `memory/memory-indexer.ts` | 新建：sqlite-vec + FTS5 混合检索、upsert/remove/search/rebuild |
| ContextEngine 扩展 | `services/context-engine.ts` | 扩展：memory 层上下文收集 + Token 预算重分配 |
| AIHandler 改造 | `ipc/handlers/ai.handler.ts` | 改造：移除 compactMemoryContext + queryRagSafely 优先用 MemoryIndexer |
| MemoryManager 填充 | `services/memory-manager.ts` | 实现 search() + V2Components 扩展 indexer 字段 |
| IPC Handler 扩展 | `ipc/handlers/memory.handler.ts` | 改造 rag:search/rag:rebuild + 新增 memory:search/rebuildIndex/getIndexHealth |
| 桶导出更新 | `memory/index.ts` | 新增 EmbeddingProvider/MemoryIndexer 等导出 |
| 单元测试 | `tests/memory/embedding-provider.test.ts` | 5 组测试 |
| 单元测试 | `tests/memory/memory-indexer.test.ts` | 8 组测试 |
| 单元测试 | `tests/memory/context-engine-memory.test.ts` | 4 组测试 |

### 1.3 范围边界

**包含：** EmbeddingProvider 接口与实现、CloudEmbeddingProvider 空壳、MemoryIndexer（向量索引 + FTS5 + 混合检索）、ContextEngine memory 层集成、AIHandler 注入逻辑迁移、LocalRagEngine 降级链、IPC 通道行为变更、MemoryManager.search() 填充、懒加载策略、打包配置、单元测试

**不包含：** MemoryPanel UI（TASK026）、CloudEmbeddingProvider 实际实现（Sprint 4）、文档语义搜索（Sprint 4）

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------| 
| `CLAUDE.md` | TS 严格模式禁止 any；记忆即演化；本地优先不上传云端；原子写入先写临时文件再替换；英文代码注释；主/渲染进程隔离 IPC 通信 | 全局约束 |
| `specs/design/architecture.md` | Electron 主进程承载 ContextEngine / LocalSearch / 文件管理；better-sqlite3 作为本地数据库；@xenova/transformers 本地 Embedding；invoke/handle IPC 模式 | 组件运行位置与技术栈选型 |
| `specs/design/memory-system-design.md` | 三层存储架构（日志→精选→归档）；向量检索引擎使用 SQLite + sqlite-vec + all-MiniLM-L6-v2（384 维）；混合检索策略（向量 + 全文）；索引存储在 `.sibylla/memory/index/` | 检索引擎架构参考 |
| `specs/design/testing-and-security.md` | 单元测试 Vitest ≥ 80% 覆盖；Mock 外部依赖（AI API、网络）；测试文件 `*.test.ts` | 测试策略 |
| `specs/requirements/phase1/sprint3.2-memory.md` | 需求 3.2.6（向量索引与混合检索）；需求 4.2.2（ContextEngine memory 层）；需求 4.2.3（AIHandler 注入迁移）；需求 4.2.5（IPC 扩展）；需求 4.2.6（LocalRagEngine 保留）；需求 4.3（懒加载与降级矩阵）；`ContextLayerType` 新增 `'memory'` | 验收标准与接口签名 |
| `specs/tasks/phase1/phase1-task025_vector-index-hybrid-search.md` | 12 步执行路径；全部验收标准；混合评分公式 `0.6 × cosine + 0.3 × bm25 + 0.1 × time_decay` | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------| 
| `sqlite-local-storage` | SQLite 架构设计、FTS5 全文索引模式、sqlite-vec 向量扩展集成、事务与批量写入优化 | MemoryIndexer 的 schema 设计（`memory_entries` + `memory_vec` + `memory_fts`）；vec0 扩展加载与降级；`Float32Array → Buffer` 序列化；FTS5 查询消毒与 BM25 评分；批量 upsert 事务包裹 |
| `ai-context-engine` | 三层上下文模型扩展为四层、Token 预算管理与分配算法、语义搜索集成 | ContextEngine.assembleContext() 新增 memory 层（L2 位置）；Token 预算从 L1 70% 调整为 L1 55% + memory 15%；`collectMemoryContext()` 方法设计；降级策略（memory 层不可用时跳过） |
| `typescript-strict-mode` | 类型安全 API 设计、泛型、类型守卫 | EmbeddingProvider 接口设计；HybridSearchResult discriminated union；SearchOptions 可选字段严格类型；`isAvailable()` 类型守卫 |

### 2.3 前置代码依赖（TASK022/023/024 产物）

| 模块 | 文件 | 行号 | 状态 | 复用方式 |
|------|------|------|------|---------|
| `MemorySection` | `memory/types.ts` | L3-9 | 已定义 | 索引条目分类、FTS5 section 字段 |
| `MemoryEntry` | `memory/types.ts` | L11-22 | 已定义 | upsert/remove/search 操作目标 |
| `SearchOptions` | `memory/types.ts` | L235-240 | 骨架需扩展 | 新增 weights/includeArchived 字段 |
| `HybridSearchResult` | `memory/types.ts` | L226-233 | 骨架需扩展 | 新增 vecScore/bm25Score/finalScore/isArchived 字段 |
| `SimilarityIndexProvider` | `memory/types.ts` | L138-142 | 已定义 | MemoryIndexer 需实现此接口，同时新增独立 EmbeddingProvider |
| `ExtractionReport` | `memory/types.ts` | L105-111 | 已定义 | MemoryIndexer.indexReport() 入参 |
| `MemoryConfig` | `memory/types.ts` | L167+ | 已定义(TASK024) | 读取 searchWeights/embeddingProvider 配置 |
| `MemoryFileManager` | `memory/memory-file-manager.ts` | 532 行 | 已实现 | load()/loadArchive() 供 rebuild() 读取全量条目 |
| `EvolutionLog` | `memory/evolution-log.ts` | 298 行 | 已实现 | 索引变更记录（重建、损坏恢复） |
| `MemoryEventBus` | `memory/memory-event-bus.ts` | 已扩展(TASK024) | 已实现 | 索引重建事件广播 |
| `MemoryManager` | `services/memory-manager.ts` | L738 | search() 空壳 | 填充 search() 委托到 MemoryIndexer |
| `V2Components` | `services/memory-manager.ts` | L74-80 | 已实现(TASK024) | 需扩展 indexer/embeddingProvider 字段 |
| `ContextEngine` | `services/context-engine.ts` | L85 | assembleContext 已实现 | 新增 memory 层收集逻辑 |
| `AIHandler` | `ipc/handlers/ai.handler.ts` | L186/466/585 | compactMemory + queryRagSafely 已实现 | 移除截断逻辑 + 改造 queryRagSafely |
| `MemoryHandler` | `ipc/handlers/memory.handler.ts` | L47/51 | rag:search/rebuild 已实现 | 改造为优先 MemoryIndexer |
| `LocalRagEngine` | `services/local-rag-engine.ts` | — | 已实现 | 不修改，作为降级后备 |

### 2.4 被依赖任务

| 任务 | 依赖方式 |
|------|---------| 
| TASK024（检查点与压缩） | CheckpointScheduler.run() 中 `indexer?.indexReport(report)` 调用本任务的 MemoryIndexer；MemoryCompressor.clusterBySimilarity() 使用向量相似度 |
| TASK026（记忆面板 UI） | UI 搜索功能调用 MemoryIndexer.search()；索引健康状态展示 |

### 2.5 npm 依赖

| 包 | 用途 | 安装方式 | 风险 |
|----|------|---------|------|
| `@xenova/transformers` | 本地 ONNX 模型推理，加载 all-MiniLM-L6-v2 | `optionalDependencies` | 中：模型约 50MB，首次加载慢；安装失败不阻塞 |
| `sqlite-vec` | SQLite 向量搜索扩展（vec0） | `optionalDependencies` | 中：native 编译，跨平台兼容性；不可用时降级到 FTS5-only |
| `better-sqlite3` | SQLite 驱动（已由项目引入） | 已安装 | 无新增 |

---

## 三、现有代码盘点与差距分析

### 3.1 types.ts 骨架 vs 规范定义

```typescript
// 现有 SearchOptions（types.ts:235-240）
export interface SearchOptions {
  query: string
  limit?: number
  sections?: MemorySection[]
  minConfidence?: number
}
// 规范要求：新增 includeArchived?: boolean、weights?: { vector; bm25; timeDecay }
// 差距：缺 includeArchived 和 weights 字段；query 应从接口移到方法参数

// 现有 HybridSearchResult（types.ts:226-233）
export interface HybridSearchResult {
  id: string
  section: MemorySection
  content: string
  confidence: number
  score: number
  source: 'memory' | 'archive'
}
// 规范要求：新增 vecScore/bm25Score/finalScore/hits/isArchived 字段
// 差距：缺向量/BM25 分项分数；source 字段应改为 isArchived: boolean

// EmbeddingProvider 接口 — 不存在
// 现有 SimilarityIndexProvider（types.ts:138-142）提供 isAvailable/embed/getOrComputeEmbedding
// 决策：新增独立 EmbeddingProvider 接口（dimension/provider/embed/isAvailable/initialize），
//       MemoryIndexer 实现 SimilarityIndexProvider 接口作为 TASK023 的消费入口
```

### 3.2 不存在的文件（需新建）

| 文件 | 状态 |
|------|------|
| `memory/embedding-provider.ts` | **不存在**，需新建 |
| `memory/memory-indexer.ts` | **不存在**，需新建 |
| `tests/memory/embedding-provider.test.ts` | **不存在**，需新建 |
| `tests/memory/memory-indexer.test.ts` | **不存在**，需新建 |
| `tests/memory/context-engine-memory.test.ts` | **不存在**，需新建 |

### 3.3 ContextEngine 差距

**文件：** `src/main/services/context-engine.ts`（461 行）

- `ContextLayerType` 在 `src/shared/types.ts` 中定义，当前值为 `'always' | 'manual' | 'skill'`——缺 `'memory'`
- `assembleContext()` 在 L85，当前只处理三层上下文（always / skill / manual），**不包含 memory 层**
- 构造函数接收 `MemoryManager` 但 **未在任何方法中使用**
- Token 预算分配当前为 always ~70% / skill 15% / manual 15%——需调整为 55/15/15/15

### 3.4 AIHandler 差距

**文件：** `src/main/ipc/handlers/ai.handler.ts`（627 行）

- **L186**：`const compactMemoryContext = memorySnapshot.content.slice(0, 5000)` — 手动截断注入 system prompt
- **L466**：`handleChatLikeRequest` 中同样存在 `compactMemoryContext = memorySnapshot.content.slice(0, 5000)`
- **L585-594**：`queryRagSafely()` 仅调用 `this.ragEngine.search()`，不知道 MemoryIndexer
- 构造函数无 `memoryIndexer` 注入

### 3.5 MemoryManager.search() 差距

**文件：** `src/main/services/memory-manager.ts`（805 行）

```typescript
// L738-744 — 空壳
async search(_query: string, _options?: SearchOptions): Promise<HybridSearchResult[]> {
  if (!this.v2Components?.fileManager) {
    throw new Error('v2 not available: MemoryFileManager not initialized')
  }
  logger.info('[MemoryManager] search() stub — TASK025 will implement')
  return []
}
```

`V2Components` 接口（L74-80）缺少 `indexer` 和 `embeddingProvider` 字段。

### 3.6 IPC Handler 差距

**文件：** `src/main/ipc/handlers/memory.handler.ts`（156 行）

- `rag:search`（L47）：仅委托到 `LocalRagEngine.search()`，不知道 MemoryIndexer
- `rag:rebuild`（L51）：仅调用 `LocalRagEngine.rebuildIndex()`
- 缺少 `memory:search`、`memory:rebuildIndex`、`memory:getIndexHealth` 通道

### 3.7 memory/index.ts 导出差距

**文件：** `src/main/services/memory/index.ts`（38 行）

当前已导出 19 个类型、6 个常量值、7 个类。**缺少导出：**
- 类型：`SearchOptions`、`HybridSearchResult`、`EmbeddingProvider`（待新增）
- 类：`MemoryIndexer`（待新建）、`LocalEmbeddingProvider`（待新建）、`CloudEmbeddingProvider`（待新建）

---

## 四、类型设计变更

### 4.1 EmbeddingProvider 接口（新增）

```typescript
// memory/types.ts — 新增
export interface EmbeddingProvider {
  readonly dimension: number               // 384（local）或 1536（cloud）
  readonly provider: 'local' | 'cloud'
  embed(texts: string[]): Promise<number[][]>
  isAvailable(): boolean                   // 同步方法，避免 async 开销
  initialize(): Promise<void>
}
```

**设计决策：**
- `isAvailable()` 使用同步返回（`boolean` 而非 `Promise<boolean>`），因为状态由内部 `model !== null` 决定，无需 I/O
- 与现有 `SimilarityIndexProvider` 接口的关系：`SimilarityIndexProvider` 是面向 TASK023 提取器的消费接口（含 `getOrComputeEmbedding`），`EmbeddingProvider` 是更底层的 embedding 能力接口。`MemoryIndexer` 同时实现 `SimilarityIndexProvider`

### 4.2 SearchOptions 扩展

```typescript
// memory/types.ts — 重写 L235-240
export interface SearchOptions {
  limit?: number                                      // 默认 10
  sectionFilter?: MemorySection[]                     // 按 section 过滤
  includeArchived?: boolean                           // 默认 false
  minConfidence?: number                              // 最低置信度阈值
  weights?: { vector: number; bm25: number; timeDecay: number }  // 默认 {0.6, 0.3, 0.1}
}
```

**变更说明：** 移除 `query: string`（query 作为方法参数传入而非选项字段），新增 `includeArchived` 和 `weights`。

### 4.3 HybridSearchResult 扩展

```typescript
// memory/types.ts — 重写 L226-233
export interface HybridSearchResult {
  id: string
  section: MemorySection
  content: string
  confidence: number
  hits: number                   // 新增：命中次数
  isArchived: boolean            // 替代原 source 字段
  vecScore: number               // 新增：向量相似度分数
  bm25Score: number              // 新增：BM25 分数（归一化后）
  finalScore: number             // 新增：最终混合评分
}
```

### 4.4 V2Components 扩展

```typescript
// memory-manager.ts — V2Components 接口新增字段
export interface V2Components {
  fileManager: MemoryFileManager
  logStore: LogStore
  evolutionLog?: EvolutionLog
  compressor?: { compress: () => Promise<CompressionResult>; undoLastCompression: () => Promise<void> }
  scheduler?: { triggerManualCheckpoint: () => Promise<void>; getLastCheckpoint: () => Date; isCheckpointRunning: () => boolean }
  indexer?: MemoryIndexer              // 新增：向量索引器
  embeddingProvider?: EmbeddingProvider // 新增：embedding 提供商
}
```

### 4.5 ContextLayerType 扩展

```typescript
// src/shared/types.ts — 扩展
export type ContextLayerType = 'always' | 'manual' | 'skill' | 'memory'  // 新增 'memory'
```

### 4.6 向后兼容处理

- `SearchOptions` 移除 `query` 字段：检查是否有其他代码引用 `SearchOptions.query`——当前仅 `MemoryManager.search()` 空壳使用 `_query` 参数名，无下游消费者引用 `query` 字段，可安全移除
- `HybridSearchResult` 移除 `source` / `score` 字段，替换为 `isArchived` / `finalScore`：当前 search() 返回空数组，无下游消费者，可安全重写
- `ContextLayerType` 新增 `'memory'` 值：纯扩展，不破坏现有 `'always' | 'manual' | 'skill'` 的使用

---

## 五、分步实施计划

### 阶段 A：类型层扩展（Step 1） — 预计 0.5 天

#### A1：扩展 types.ts 类型定义

**文件：** `src/main/services/memory/types.ts`

**操作：**
1. 重写 `SearchOptions` 接口（移除 `query` 字段，新增 `limit`/`sectionFilter`/`includeArchived`/`weights`）
2. 重写 `HybridSearchResult` 接口（新增 `hits`/`isArchived`/`vecScore`/`bm25Score`/`finalScore`，移除 `source`/`score`）
3. 新增 `EmbeddingProvider` 接口（`dimension`/`provider`/`embed()`/`isAvailable()`/`initialize()`）
4. 扩展 `V2Components` 接口（新增 `indexer?: MemoryIndexer`/`embeddingProvider?: EmbeddingProvider`）

**文件：** `src/shared/types.ts`

**操作：**
1. `ContextLayerType` 新增 `'memory'` 值：`'always' | 'manual' | 'skill' | 'memory'`

**验证：** `npm run typecheck` 通过

---

### 阶段 B：EmbeddingProvider 实现（Steps 2-3） — 预计 0.5 天

#### B1：实现 LocalEmbeddingProvider

**文件：** `src/main/services/memory/embedding-provider.ts`（新建）

```typescript
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly dimension = 384
  readonly provider = 'local' as const
  private model: Pipeline | null = null
  private initializing: Promise<void> | null = null

  async initialize(): Promise<void> {
    if (this.model) return
    if (this.initializing) return this.initializing
    try {
      const { pipeline } = await import('@xenova/transformers')
      this.model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
    } catch (err) {
      this.model = null
      logger.warn('[LocalEmbeddingProvider] init failed, BM25-only mode', { err })
    } finally {
      this.initializing = null
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.model) throw new Error('Embedding provider not initialized')
    return Promise.all(texts.map(t => this.model!(t, { pooling: 'mean', normalize: true })))
  }

  isAvailable(): boolean {
    return this.model !== null
  }

  async ensureInitialized(): Promise<void> {
    if (this.isAvailable()) return
    this.initializing = this.initialize()
    return this.initializing
  }
}
```

#### B2：实现 CloudEmbeddingProvider 空壳

```typescript
export class CloudEmbeddingProvider implements EmbeddingProvider {
  readonly dimension = 1536
  readonly provider = 'cloud' as const

  async embed(): Promise<number[][]> {
    throw new Error('Cloud embedding not yet implemented. Use Sprint 4.')
  }
  isAvailable(): boolean { return false }
  async initialize(): Promise<void> {
    throw new Error('Cloud embedding not yet implemented. Use Sprint 4.')
  }
}
```

**验证：** `npm run typecheck`

---

### 阶段 C：MemoryIndexer 实现（Step 4） — 预计 1.5 天

#### C1：构造函数与 initialize()

**文件：** `src/main/services/memory/memory-indexer.ts`（新建）

```typescript
export class MemoryIndexer implements SimilarityIndexProvider {
  private vecAvailable = false

  constructor(
    private readonly db: Database.Database,
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly workspaceRoot: string,
    private readonly logger: Logger = logger,
  ) {}

  async initialize(): Promise<void> {
    try {
      this.db.loadExtension('vec0')
      this.vecAvailable = true
    } catch {
      this.vecAvailable = false
      this.logger.warn('[MemoryIndexer] sqlite-vec unavailable, FTS5-only mode')
    }
    this.createSchema()
    await this.verifyHealth()
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_entries (
        id TEXT PRIMARY KEY, section TEXT NOT NULL, content TEXT NOT NULL,
        confidence REAL, hits INTEGER, created_at TEXT, updated_at TEXT,
        is_archived INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_entries_section ON memory_entries(section);
      CREATE INDEX IF NOT EXISTS idx_entries_archived ON memory_entries(is_archived);
      ${this.vecAvailable ? `CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec USING vec0(embedding float[384]);` : ''}
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(id, content, section, tokenize='unicode61');
    `)
  }
}
```

#### C2：upsert / remove / search

```typescript
  async upsert(entry: MemoryEntry, isArchived = false): Promise<void> {
    let embedding: number[] | null = null
    try {
      embedding = (await this.embeddingProvider.embed([entry.content]))[0]
    } catch { /* skip vector */ }
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT OR REPLACE INTO memory_entries
        (id,section,content,confidence,hits,created_at,updated_at,is_archived)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(entry.id, entry.section, entry.content, entry.confidence ?? null,
             entry.hits ?? 0, entry.createdAt, new Date().toISOString(), isArchived ? 1 : 0)
      if (embedding && this.vecAvailable) {
        this.db.prepare('INSERT OR REPLACE INTO memory_vec(rowid, embedding) VALUES ((SELECT rowid FROM memory_entries WHERE id=?), ?)').run(entry.id, Buffer.from(new Float32Array(embedding).buffer))
      }
      this.db.prepare('INSERT OR REPLACE INTO memory_fts(id, content, section) VALUES (?,?,?)').run(entry.id, entry.content, entry.section)
    })()
  }

  async remove(id: string): Promise<void> {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM memory_entries WHERE id=?').run(id)
      if (this.vecAvailable) this.db.prepare('DELETE FROM memory_vec WHERE rowid=(SELECT rowid FROM memory_entries WHERE id=?)').run(id)
      this.db.prepare('DELETE FROM memory_fts WHERE id=?').run(id)
    })()
  }
}
```

#### C3：混合搜索 search()

```typescript
  async search(query: string, options: SearchOptions = {}): Promise<HybridSearchResult[]> {
    const { limit = 10, sectionFilter, includeArchived = false, weights = { vector: 0.6, bm25: 0.3, timeDecay: 0.1 } } = options
    let queryEmbedding: number[] | null = null
    if (this.embeddingProvider.isAvailable() && this.vecAvailable) {
      try { queryEmbedding = (await this.embeddingProvider.embed([query]))[0] } catch {}
    }
    if (!queryEmbedding) return this.searchFtsOnly(query, options)
    const limit3 = limit * 3
    const vecBuf = queryEmbedding ? Buffer.from(new Float32Array(queryEmbedding).buffer) : Buffer.alloc(0)
    try {
      const rows = this.db.prepare(`
        WITH vec_results AS (
          SELECT m.*, (1 - vec_distance_cosine(v.embedding, ?)) as vec_score
          FROM memory_vec v JOIN memory_entries m ON v.rowid = m.rowid
          WHERE v.embedding MATCH ? LIMIT ?
        ),
        fts_results AS (
          SELECT id, bm25(memory_fts) as bm25_score FROM memory_fts
          WHERE memory_fts MATCH ? LIMIT ?
        )
        SELECT v.id, v.section, v.content, v.confidence, v.hits, v.is_archived,
          v.vec_score, COALESCE(f.bm25_score, 0) as bm25_score,
          (0.6 * v.vec_score + 0.3 * normalize_bm25(f.bm25_score) + 0.1 * time_decay(v.updated_at)) as final_score
        FROM vec_results v LEFT JOIN fts_results f ON v.id = f.id
        ORDER BY final_score DESC LIMIT ?
      `).all(vecBuf, vecBuf, limit3, query, limit3, limit)
      return rows.map(this.rowToResult)
    } catch {
      return this.searchFtsOnly(query, options)
    }
  }
```

**注意：** `normalize_bm25` 和 `time_decay` 为 SQLite UDF，需在 `initialize()` 中注册。

#### C4：降级 searchFtsOnly / indexReport / rebuild

```typescript
  private async searchFtsOnly(query: string, options: SearchOptions = {}): Promise<HybridSearchResult[]> {
    const { limit = 10, sectionFilter, includeArchived = false } = options
    try {
      const rows = this.db.prepare(`
        SELECT m.*, bm25(memory_fts) as bm25_score,
          (0.9 * normalize_bm25(bm25(memory_fts)) + 0.1 * time_decay(m.updated_at)) as final_score
        FROM memory_fts f JOIN memory_entries m ON f.id = m.id
        WHERE memory_fts MATCH ? AND (includeArchived=1 OR m.is_archived=0)
        ORDER BY final_score DESC LIMIT ?
      `).all(query, limit)
      return rows.map(this.rowToResult)
    } catch {
      return []
    }
  }

  async indexReport(report: ExtractionReport): Promise<void> {
    for (const e of [...report.added, ...report.merged]) await this.upsert(e)
    for (const id of report.discarded) await this.remove(id)
  }

  async rebuild(): Promise<void> {
    this.db.exec(`DELETE FROM memory_vec; DELETE FROM memory_fts;`)
    const fileManager = new MemoryFileManager(this.workspaceRoot, this.logger)
    const entries = await fileManager.load()
    const archived = await fileManager.loadArchive().catch(() => [])
    const all = [...entries, ...archived.map(e => ({ ...e, isArchived: true }))]
    for (let i = 0; i < all.length; i += 32) {
      const batch = all.slice(i, i + 32)
      for (const e of batch) await this.upsert(e as MemoryEntry, !!(e as any).isArchived)
    }
    this.logger.info('[MemoryIndexer] rebuild complete', { count: all.length })
  }

  async verifyHealth(): Promise<{ healthy: boolean; reason?: string }> {
    try {
      const [entries, fts] = await Promise.all([
        this.db.prepare('SELECT COUNT(*) as c FROM memory_entries').get() as any,
        this.db.prepare('SELECT COUNT(*) as c FROM memory_fts').get() as any,
      ])
      if (entries.c !== fts.c) return { healthy: false, reason: `index mismatch: ${entries.c} vs ${fts.c}` }
      return { healthy: true }
    } catch (err) {
      return { healthy: false, reason: String(err) }
    }
  }

  isAvailable(): boolean { return true } // SimilarityIndexProvider interface

  private rowToResult(row: any): HybridSearchResult {
    return { id: row.id, section: row.section, content: row.content,
             confidence: row.confidence ?? 0, hits: row.hits ?? 0,
             isArchived: !!row.is_archived, vecScore: row.vec_score ?? 0,
             bm25Score: row.bm25_score ?? 0, finalScore: row.final_score ?? 0 }
  }
}
```

**注意：** 需在 `memory-indexer.ts` 中注册 SQLite UDF（`normalize_bm25`、`time_decay`）和向量距离函数。

**验证：** `npm run typecheck`

---

### 阶段 D：MemoryManager.search() 填充（Step 5） — 预计 0.3 天

#### D1：实现 search() 方法

**文件：** `src/main/services/memory-manager.ts`

替换空壳（L738-744）：

```typescript
async search(query: string, options?: SearchOptions): Promise<HybridSearchResult[]> {
  if (!this.v2Components?.indexer) {
    const hits = await this.ragEngine.search(query)
    return hits.map(h => ({
      id: h.id, section: h.section as MemorySection, content: h.content,
      confidence: h.score, hits: 1, isArchived: false,
      vecScore: 0, bm25Score: h.score, finalScore: h.score,
    }))
  }
  return this.v2Components.indexer.search(query, options)
}
```

扩展 `V2Components` 接口添加 `indexer` 和 `embeddingProvider` 字段。

---

### 阶段 E：IPC Handler 改造（Step 6） — 预计 0.3 天

#### E1：改造 memory.handler.ts

**文件：** `src/main/ipc/handlers/memory.handler.ts`

```typescript
// 改造 rag:search — 优先 MemoryIndexer，降级 LocalRagEngine
ipcMain.handle('rag:search', async (_, query: string, limit?: number) => {
  if (memoryManager.v2Components?.indexer?.search) {
    try { return await memoryManager.search(query, { limit }) } catch {}
  }
  return localRagEngine.search(query, limit)
})

// 改造 rag:rebuild — 同时触发两个子系统
ipcMain.handle('rag:rebuild', async () => {
  const results = await Promise.allSettled([
    memoryManager.v2Components?.indexer?.rebuild() ?? Promise.resolve(),
    localRagEngine.rebuildIndex(),
  ])
  return results.map((r, i) => ({ subsystem: i, success: r.status === 'fulfilled', reason: r.status === 'rejected' ? String(r.reason) : undefined }))
})

// 新增 memory:search
ipcMain.handle('memory:search', async (_, query: string, options?: SearchOptions) => {
  return memoryManager.search(query, options)
})

// 新增 memory:rebuildIndex
ipcMain.handle('memory:rebuildIndex', async () => {
  return memoryManager.v2Components?.indexer?.rebuild()
})

// 新增 memory:getIndexHealth
ipcMain.handle('memory:getIndexHealth', async () => {
  return memoryManager.v2Components?.indexer?.verifyHealth() ?? { healthy: false, reason: 'indexer not initialized' }
})
```

---

### 阶段 F：ContextEngine memory 层（Step 7） — 预计 0.5 天

#### F1：新增 memory 层到 assembleContext

**文件：** `src/main/services/context-engine.ts`

```typescript
async assembleContext(request: ContextAssembleRequest): Promise<ContextResult> {
  const { alwaysLoad, manualRef, skill } = request
  const budget = this.tokenBudget
  const alwaysTokens = Math.floor(budget * 0.55)
  const memoryTokens = Math.floor(budget * 0.15)
  const skillTokens = Math.floor(budget * 0.15)
  const manualTokens = budget - alwaysTokens - memoryTokens - skillTokens

  const [alwaysCtx, memoryCtx, skillCtx, manualCtx] = await Promise.all([
    this.assembleAlwaysLayer(alwaysLoad, alwaysTokens),
    this.collectMemoryContext(request, memoryTokens),
    this.assembleSkillLayer(skill, skillTokens),
    this.assembleManualLayer(manualRef, manualTokens),
  ])

  return { segments: [...alwaysCtx, ...memoryCtx, ...skillCtx, ...manualCtx], totalTokens: budget }
}

private async collectMemoryContext(request: ContextAssembleRequest, tokenBudget: number): Promise<ContextSegment[]> {
  try {
    const results = await this.memoryManager.search(request.userMessage, { limit: 5 })
    const texts = results.map(r => r.content)
    let used = 0
    const segments: ContextSegment[] = []
    for (const r of results) {
      const est = this.estimateTokens(r.content)
      if (used + est > tokenBudget) break
      segments.push({ content: r.content, layer: 'memory', relevanceScore: r.finalScore, source: 'memory', tokenCount: est })
      used += est
    }
    return segments
  } catch {
    return []
  }
}
```

---

### 阶段 G：AIHandler 注入迁移（Step 8） — 预计 0.5 天

#### G1：移除 compactMemoryContext + 改造 queryRagSafely

**文件：** `src/main/ipc/handlers/ai.handler.ts`

1. 移除 L186 和 L466 的 `compactMemoryContext = memorySnapshot.content.slice(0, 5000)` 及相关注入逻辑
2. 构造函数注入 `memoryIndexer: MemoryIndexer | undefined`
3. 改造 `queryRagSafely`：

```typescript
private async queryRagSafely(query: string, limit = 5): Promise<RagSearchHit[]> {
  if (this.memoryIndexer?.embeddingProvider?.isAvailable()) {
    try {
      const results = await this.memoryIndexer.search(query, { limit })
      return results.map(r => ({ id: r.id, content: r.content, section: r.section as any, score: r.finalScore }))
    } catch {}
  }
  return this.ragEngine.search(query, limit)
}
```

---

### 阶段 H：打包配置 + IPC 初始化（Steps 9-10） — 预计 0.2 天

#### H1：package.json optionalDependencies

```json
{
  "optionalDependencies": {
    "@xenova/transformers": "^2.17.0",
    "sqlite-vec": "^0.1.0"
  }
}
```

#### H2：主进程初始化逻辑

在 `main/index.ts` 或 `services/memory-manager.ts` 初始化流程中：

```typescript
// 启动时：仅 schema + health check（不加载模型）
const indexer = new MemoryIndexer(db, embeddingProvider, workspaceRoot, logger)
await indexer.initialize()

// 懒加载：首次使用时触发
embeddingProvider.ensureInitialized().catch(err => logger.warn('[EmbeddingProvider] lazy init failed', { err }))
```

---

### 阶段 I：单元测试（Step 11） — 预计 1.0 天

#### I1：embedding-provider.test.ts

| # | 名称 | 验证点 |
|---|------|--------|
| 1 | initialize 成功 | mock pipeline → model 非 null → isAvailable() === true |
| 2 | initialize 失败降级 | mock pipeline 抛错 → model === null → isAvailable() === false |
| 3 | embed 返回 384 维 | embed(['test']) → result[0].length === 384 |
| 4 | 未初始化时 embed 抛错 | isAvailable() false → embed() → Error |
| 5 | ensureInitialized 幂等 | 多次调用 → pipeline 仅执行一次 |

#### I2：memory-indexer.test.ts

| # | 名称 | 验证点 |
|---|------|--------|
| 1 | upsert 写入三表 | upsert 后 → memory_entries + memory_fts 有记录，vec 有记录（若可用）|
| 2 | remove 删除干净 | remove 后 → 三表均无记录 |
| 3 | search 混合排序 | 混合评分 = 0.6×cosine + 0.3×bm25 + 0.1×time_decay |
| 4 | searchFtsOnly 降级 | embedding 不可用 → 走 FTS5 |
| 5 | indexReport 更新 | ExtractionReport → upsert/discard 正确调用 |
| 6 | rebuild 全量重建 | 清空 → 重新加载 → 全部重建 |
| 7 | verifyHealth 检测不一致 | entries≠fts → unhealthy |
| 8 | sectionFilter + includeArchived | 过滤正确生效 |

#### I3：context-engine-memory.test.ts

| # | 名称 | 验证点 |
|---|------|--------|
| 1 | assembleContext 含 memory 层 | segments.some(s => s.layer === 'memory') |
| 2 | memory 层调用 search | mock memoryManager.search → 验证调用参数 |
| 3 | Token 预算 55/15/15/15 | 验证各层 token 分配 |
| 4 | indexer 不可用降级 | mock search 抛错 → memory 层返回空数组 |

---

### 阶段 J：集成验证（Step 12） — 预计 0.2 天

```bash
npm run typecheck
npm run lint
npm run test
```

手动验证：
1. 插入条目 → 语义搜索 → 确认向量+BM25+时间衰减综合评分
2. 卸载 sqlite-vec → 确认降级 FTS5-only
3. 卸载 @xenova/transformers → 确认降级 LocalRagEngine
4. AI 对话 → 确认 memory 层出现在 prompt 中

---

## 六、验收标准追踪

### Embedding 提供商

| # | 验收标准 | 实现位置 | 测试 |
|---|---------|---------|------|
| 1 | all-MiniLM-L6-v2（384 维）| B1 initialize() | I1-3 |
| 2 | embed() 返回 384 维向量 | B1 embed() | I1-3 |
| 3 | isAvailable() 初始化前 false | B1 isAvailable() | I1-2 |
| 4 | 懒加载：首次使用才加载 | H2 ensureInitialized() | 手动 |
| 5 | 失败时 BM25-only | B1 catch 块 | I1-2 |

### 向量索引

| # | 验收标准 | 实现位置 | 测试 |
|---|---------|---------|------|
| 1 | better-sqlite3 + sqlite-vec | C1 initialize() | I2-1 |
| 2 | upsert < 50ms | C2 upsert() | I2-1 |
| 3 | search < 200ms（<10k 条）| C3 search() | I2-3 |
| 4 | 混合评分 0.6+0.3+0.1 | C3 SQL 公式 | I2-3 |
| 5 | 归档条目可检索 | C2/C3 includeArchived | I2-8 |
| 6 | 删除时索引移除 | C2 remove() | I2-2 |
| 7 | 损坏时自动重建 | C4 rebuild() | I2-6 |

### ContextEngine 集成

| # | 验收标准 | 实现位置 | 测试 |
|---|---------|---------|------|
| 1 | assembleContext 新增 memory 层 | F1 collectMemoryContext | I3-1 |
| 2 | memory 层调用 search(limit=5) | F1 | I3-2 |
| 3 | Token 预算 55/15/15/15 | F1 | I3-3 |
| 4 | indexer 不可用时降级 | F1 catch | I3-4 |

### AIHandler 改造

| # | 验收标准 | 实现位置 | 测试 |
|---|---------|---------|------|
| 1 | 移除 compactMemoryContext | G1 | 手动 |
| 2 | queryRagSafely 优先 indexer | G1 | I2-3 |
| 3 | fallback 到 LocalRagEngine | G1 | I2-4 |

### 降级链

| # | 验收标准 | 实现位置 | 测试 |
|---|---------|---------|------|
| 1 | indexer → FTS5 → LocalRagEngine | C3/C4 | I2-4 |
| 2 | rag:search 优先 indexer | E1 | 手动 |
| 3 | rag:rebuild 触发两个子系统 | E1 | 手动 |

### 可配置性

| # | 验收标准 | 实现位置 | 测试 |
|---|---------|---------|------|
| 1 | 混合权重可配置 | C3 SearchOptions.weights | I2-3 |
| 2 | Embedding 提供商可选 | H2 LocalEmbeddingProvider | I1-1 |

---

## 七、风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| sqlite-vec native 编译失败 | 中 | 降级到 FTS5-only；LocalRagEngine兜底 |
| @xenova/transformers 模型下载慢/失败 | 中 | 懒加载 + 可选依赖；启动不阻塞 |
| SQLite UDF vec_distance_cosine 不存在 | 高 | vec0 扩展加载失败时降级；UDF 注册前检查 vecAvailable |
| FTS5 MATCH 查询语法注入 | 高 | 使用参数化查询 + SQLITE_DML 模式避免 FTS5 MATCH 注入 |
| BM25 归一化除零 | 低 | normalize_bm25 UDF 中 `bm25=0 → 0`，非零时 `1/(1+log(1+bm25))` |
| ContextEngine memory 层 token 超预算 | 中 | 硬性截断：`used + est > tokenBudget` break |
| 向量索引与记忆文件不一致 | 中 | rebuild 时清空重填；verifyHealth 定期检查 |
| 混合检索权重不合理 | 低 | 默认 0.6/0.3/0.1；可通过 MemoryConfig 调整 |

---

## 八、执行时间线

| 天 | 阶段 | 交付物 |
|----|------|--------|
| Day 1 上午 | A1 | types.ts 全部类型扩展完成 |
| Day 1 下午 | B1-B2 | embedding-provider.ts（Local + Cloud）|
| Day 2 - Day 3 上午 | C1-C4 | memory-indexer.ts（schema/search/rebuild）|
| Day 3 下午 | D1 | MemoryManager.search() 填充 |
| Day 4 上午 | E1 | IPC Handler 改造（memory.handler.ts）|
| Day 4 下午 | F1 | ContextEngine memory 层集成 |
| Day 5 上午 | G1 | AIHandler 注入迁移 + 打包配置 |
| Day 5 下午 | I1-I3 | 3 个测试文件 |
| Day 5 下午 | J1 | 集成验证（typecheck/lint/test）|

---

**文档版本**: v1.0
**最后更新**: 2026-04-21
**维护者**: Sibylla 架构团队
