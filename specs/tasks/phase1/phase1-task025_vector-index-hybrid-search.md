# 向量索引与混合检索引擎

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK025 |
| **任务标题** | 向量索引与混合检索引擎 |
| **所属阶段** | Phase 1 - 记忆系统 v2 (Sprint 3.2) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

实现本地向量索引（MemoryIndexer）和本地 Embedding 提供商（LocalEmbeddingProvider），构建三维度混合检索引擎（向量 0.6 + BM25 0.3 + 时间衰减 0.1），并将记忆检索集成到 ContextEngine 和 AIHandler 中，使 AI 对话能消费语义相关记忆。同时完成 LocalRagEngine 降级链和 IPC 通道行为变更。

### 背景

TASK022-024 已建立数据层和智能处理层。本任务构建"检索与消费层"——让积累的记忆真正被 AI 使用。核心挑战在于：本地优先（embedding 不上传云端）、懒加载（不拖慢启动）、降级安全（sqlite-vec 不可用时回退到 FTS5/LocagRagEngine）。

### 范围

**包含：**
- `EmbeddingProvider` 接口与 `LocalEmbeddingProvider` 实现（@xenova/transformers + all-MiniLM-L6-v2）
- `CloudEmbeddingProvider` 空壳（预留接口，用户需显式启用）
- `MemoryIndexer` — SQLite + sqlite-vec 向量索引、FTS5 全文索引、混合检索
- ContextEngine memory 层集成（4.2.2）
- AIHandler 注入逻辑迁移（4.2.3）
- LocalRagEngine 降级链实现
- IPC 通道 `rag:search` / `rag:rebuild` 行为变更
- MemoryManager.search() 实际实现
- 懒加载策略与打包配置
- 单元测试

**不包含：**
- MemoryPanel UI（TASK026）
- CloudEmbeddingProvider 实际实现（Sprint 4）
- 文档语义搜索（Sprint 4）

## 验收标准

### Embedding 提供商

- [ ] LocalEmbeddingProvider 使用 @xenova/transformers 加载 all-MiniLM-L6-v2（384 维）
- [ ] `embed(texts)` 返回 384 维 Float32Array 向量数组
- [ ] `isAvailable()` 在模型加载完成前返回 false
- [ ] 懒加载：不在应用启动时初始化，首次搜索或检查点时才加载
- [ ] 模型加载失败时降级到 BM25-only 搜索

### 向量索引

- [ ] MemoryIndexer 使用 better-sqlite3 + sqlite-vec 扩展
- [ ] `upsert(entry)` 单条 < 50ms
- [ ] `search(query)` 混合检索 < 200ms（10000 条以下）
- [ ] 混合评分公式：`0.6 × cosine + 0.3 × bm25 + 0.1 × time_decay`
- [ ] 归档条目可检索，带 `source: 'archive'` 标志
- [ ] 条目删除时从索引中移除
- [ ] 索引损坏时自动重建（后台执行）

### ContextEngine 集成

- [ ] `assembleContext()` 新增第 4 层 `memory`
- [ ] memory 层调用 `memoryManager.search(userMessage, { limit: 5 })`
- [ ] Token 预算重分配：always 55% / memory 15% / skill 15% / manual 15%
- [ ] MemoryIndexer 不可用时回退到 v1 截断策略

### AIHandler 改造

- [ ] 移除手动记忆截断逻辑（compactMemoryContext）
- [ ] 记忆注入改为 ContextEngine memory 层负责
- [ ] `queryRagSafely` 优先调用 MemoryIndexer，fallback 到 LocalRagEngine

### 降级链

- [ ] MemoryIndexer.search() → embedding 不可用 → FTS5-only → FTS5 不可用 → LocalRagEngine
- [ ] `rag:search` IPC 通道行为变更：优先 MemoryIndexer，降级 LocalRagEngine
- [ ] `rag:rebuild` IPC 通道行为变更：同时触发两个子系统

### 可配置性

- [ ] 混合检索权重可配置（默认 0.6/0.3/0.1）
- [ ] Embedding 提供商可选（local / cloud）

## 依赖关系

### 前置依赖

- [x] TASK022（数据层）— types.ts 中 MemoryEntry、HybridSearchResult、SearchOptions
- [ ] TASK023（提取器）部分完成 — ExtractionReport 类型定义（可并行开发）

### 被依赖任务

- TASK024（检查点与压缩）— CheckpointScheduler.run() 中调用 indexer.indexReport()
- TASK026（记忆面板 UI）— UI 搜索功能调用 MemoryIndexer.search()

## 参考文档

- [`specs/requirements/phase1/sprint3.2-memory.md`](../../requirements/phase1/sprint3.2-memory.md) — 需求 3.2.6、4.2.2、4.2.3、4.2.5、4.2.6、4.3.x
- [`specs/design/memory-system-design.md`](../../design/memory-system-design.md) — 向量检索引擎设计
- `.kilocode/skills/phase1/sqlite-local-storage/SKILL.md` — SQLite 架构、FTS5、sqlite-vec
- `.kilocode/skills/phase1/ai-context-engine/SKILL.md` — 上下文组装、Token 预算、记忆层集成

## 技术执行路径

### 架构设计

```
混合检索架构：

query: "用户偏好"
    │
    ▼
MemoryIndexer.search(query, options)
    ├── EmbeddingProvider.embed([query]) → queryEmbedding (384d)
    ├── SQLite vec0 查询 → vec_results (cosine similarity)
    ├── SQLite FTS5 查询 → fts_results (bm25 score)
    ├── 合并计算 final_score:
    │   0.6 × vec_score +
    │   0.3 × normalized_bm25 +
    │   0.1 × time_decay(1/(1+ageDays/30))
    └── 返回 top K HybridSearchResult[]

降级链：

MemoryIndexer.search()
    ↓ embedding 不可用
FTS5-only search (BM25)
    ↓ FTS5 不可用
LocalRagEngine.search()

ContextEngine memory 层集成：

assembleContext(request)
    ├── Layer 1: always_load (55%)
    ├── Layer 2: memory (15%) ← 新增
    │   └── memoryManager.search(request.userMessage, { limit: 5 })
    ├── Layer 3: skill (15%)
    └── Layer 4: manual (15%)

懒加载流程：

应用启动 → MemoryFileManager.load() (无 embedding)
    ↓ 首次搜索 or 首次检查点
触发 embedding 模型加载 (后台)
    ↓ 加载期间
搜索降级到 FTS5-only / LocalRagEngine
```

### 步骤 1：完善 SearchOptions / HybridSearchResult 类型

**文件：** `src/main/services/memory/types.ts`（扩展 TASK022 骨架）

1. 完善 `SearchOptions` 接口：
   - `limit?: number`（默认 10）
   - `sectionFilter?: MemorySection[]`
   - `includeArchived?: boolean`（默认 false）
   - `weights?: { vector: number; bm25: number; timeDecay: number }`（默认 {0.6, 0.3, 0.1}）
2. 完善 `HybridSearchResult` 接口：
   - `id: string`
   - `section: MemorySection`
   - `content: string`
   - `confidence: number`
   - `hits: number`
   - `isArchived: boolean`
   - `vecScore: number`
   - `bm25Score: number`
   - `finalScore: number`
3. 定义 `EmbeddingProvider` 接口：
   - `readonly dimension: number`
   - `readonly provider: 'local' | 'cloud'`
   - `embed(texts: string[]): Promise<number[][]>`
   - `isAvailable(): Promise<boolean>`
   - `initialize(): Promise<void>`

### 步骤 2：实现 LocalEmbeddingProvider

**文件：** `src/main/services/memory/embedding-provider.ts`

1. 实现 `LocalEmbeddingProvider` 类：
   - `readonly dimension = 384`
   - `readonly provider = 'local' as const`
   - 私有 `model: Pipeline | null = null`
   - 私有 `initializing: Promise<void> | null = null`（防止重复初始化）
2. 实现 `initialize()` 方法：
   - 检查 `@xenova/transformers` 是否已安装
   - `const { pipeline } = await import('@xenova/transformers')`
   - `this.model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')`
   - 首次运行时模型下载到 `userData/models/` 目录
   - 初始化失败 → `this.model = null`，记录 error 日志
3. 实现 `embed(texts)` 方法：
   - 检查 `this.model` 是否可用
   - 不可用 → 抛出 `Error('Embedding provider not initialized')`
   - 批量处理：`Promise.all(texts.map(t => this.model(t, { pooling: 'mean', normalize: true })))`
   - 转换结果为 `number[][]`
4. 实现 `isAvailable()` 方法：
   - 返回 `this.model !== null`
5. 实现 `ensureInitialized()` 方法：
   - 若已初始化 → 直接返回
   - 若正在初始化 → 等待初始化完成
   - 若未开始 → 调用 `initialize()`

### 步骤 3：实现 CloudEmbeddingProvider 空壳

**文件：** `src/main/services/memory/embedding-provider.ts`

1. 实现 `CloudEmbeddingProvider` 类骨架：
   - `readonly dimension = 1536`（OpenAI text-embedding-3-small）
   - `readonly provider = 'cloud' as const`
   - `embed()` → 抛出 `Error('Cloud embedding not yet implemented. Use Sprint 4.')`
   - `isAvailable()` → `Promise.resolve(false)`
   - `initialize()` → 抛出相同错误

### 步骤 4：实现 MemoryIndexer

**文件：** `src/main/services/memory/memory-indexer.ts`

1. 构造函数注入：`db: Database.Database`（better-sqlite3）、`embeddingProvider: EmbeddingProvider`、`workspaceRoot: string`、`logger: Logger`
2. 实现 `initialize()` 方法：
   - 尝试加载 sqlite-vec 扩展：`this.db.loadExtension('vec0')`
   - 加载失败 → 标记 `vecAvailable = false`，记录 warning
   - 创建 schema：
     ```sql
     CREATE TABLE IF NOT EXISTS memory_entries (
       id TEXT PRIMARY KEY,
       section TEXT NOT NULL,
       content TEXT NOT NULL,
       confidence REAL,
       hits INTEGER,
       created_at TEXT,
       updated_at TEXT,
       is_archived INTEGER DEFAULT 0
     );

     CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec USING vec0(
       embedding float[384]
     );  -- 仅 vecAvailable 时创建

     CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
       id, content, section,
       tokenize='unicode61'
     );
     ```
   - 创建索引：
     ```sql
     CREATE INDEX IF NOT EXISTS idx_entries_section ON memory_entries(section);
     CREATE INDEX IF NOT EXISTS idx_entries_archived ON memory_entries(is_archived);
     ```
   - 调用 `verifyHealth()`
3. 实现 `verifyHealth()` 方法：
   - 执行 `PRAGMA integrity_check`
   - 检查 `memory_entries` 行数 vs `memory_fts` 行数一致性
   - 不一致 → 标记需要重建
   - 损坏 → 调用 `rebuild()`
4. 实现 `upsert(entry, isArchived = false)` 方法：
   - 获取 embedding：`embeddingProvider.embed([entry.content])` → `embedding[0]`
   - 在事务中执行：
     - `INSERT OR REPLACE INTO memory_entries`
     - `INSERT OR REPLACE INTO memory_vec`（仅 vecAvailable）
     - `INSERT OR REPLACE INTO memory_fts`
   - embedding 获取失败 → 仅更新 memory_entries 和 memory_fts（跳过向量索引）
5. 实现 `remove(id)` 方法：
   - 在事务中执行：
     - `DELETE FROM memory_entries WHERE id = ?`
     - `DELETE FROM memory_vec WHERE rowid = (SELECT rowid FROM memory_entries WHERE id = ?)`（仅 vecAvailable）
     - `DELETE FROM memory_fts WHERE id = ?`
6. 实现 `search(query, options)` 方法：
   - 尝试获取 query embedding
   - embedding 可用 + vecAvailable → 执行混合查询 SQL：
     ```sql
     WITH vec_results AS (
       SELECT m.*, (1 - vec_distance_cosine(v.embedding, ?)) as vec_score
       FROM memory_vec v
       JOIN memory_entries m ON v.rowid = m.rowid
       WHERE v.embedding MATCH ?
       LIMIT {limit * 3}
     ),
     fts_results AS (
       SELECT id, bm25(memory_fts) as bm25_score
       FROM memory_fts
       WHERE memory_fts MATCH ?
       LIMIT {limit * 3}
     )
     SELECT v.id, v.section, v.content, v.confidence, v.hits, v.is_archived,
       v.vec_score, COALESCE(f.bm25_score, 0) as bm25_score,
       (0.6 * v.vec_score + 0.3 * normalize(f.bm25_score) + 0.1 * time_decay(v.updated_at)) as final_score
     FROM vec_results v
     LEFT JOIN fts_results f ON v.id = f.id
     ORDER BY final_score DESC
     LIMIT ?
     ```
   - embedding 不可用 → 降级到 FTS5-only 查询
   - FTS5 也不可用 → 返回空数组（调用方回退到 LocalRagEngine）
   - 应用 sectionFilter 和 includeArchived 过滤
7. 实现 `searchFtsOnly(query, options)` 降级方法：
   - 仅使用 FTS5 BM25 + 时间衰减
   - 权重调整：BM25 0.9 + time_decay 0.1
8. 实现 `indexReport(report: ExtractionReport)` 方法：
   - 遍历 `report.added` → `upsert(entry)`
   - 遍历 `report.merged` → `upsert(mergedEntry)`
9. 实现 `rebuild()` 方法：
   - 清空 `memory_vec` 和 `memory_fts`
   - 从 MemoryFileManager 加载所有条目
   - 从 ARCHIVE.md 加载归档条目
   - 批量 embedding（batch size = 32）：
     ```
     for (i = 0; i < entries.length; i += 32) {
       batch = entries.slice(i, i+32)
       embeddings = await embed(batch.map(e => e.content))
       for each (entry, embedding) → upsert(entry)
     }
     ```
   - 记录重建完成日志
10. 实现 `getOrComputeEmbedding(entry)` 方法：
    - 缓存机制：先从 memory_vec 查询已有 embedding
    - 未找到 → 重新计算并存储

### 步骤 5：实现 MemoryManager.search()

**文件：** `src/main/services/memory-manager.ts`（填充 TASK022 空壳）

1. 实现 `search(query, options?)` 方法：
   - `if (this.v2Components?.indexer)` → `indexer.search(query, options)`
   - 否则 → 降级到 `LocalRagEngine.search(query)`
   - 将 `RagSearchHit` 映射为 `HybridSearchResult` 格式

### 步骤 6：改造 IPC 通道行为

**文件：** `src/main/ipc/handlers/memory.handler.ts`（扩展）

1. 改造 `rag:search` handler：
   - 优先调用 `MemoryIndexer.search()`（混合检索）
   - MemoryIndexer 未初始化 → 降级到 `LocalRagEngine.search()`
   - 返回统一的 `HybridSearchResult[]` 格式
2. 改造 `rag:rebuild` handler：
   - 同时触发 `MemoryIndexer.rebuild()` 和 `LocalRagEngine.rebuildIndex()`
   - 返回两个子系统的状态
3. 新增 `memory:search` handler：
   - 直接调用 `memoryManager.search(query, options)`
4. 新增 `memory:rebuildIndex` handler：
   - 调用 `MemoryIndexer.rebuild()`
5. 新增 `memory:getIndexHealth` handler：
   - 调用 `MemoryIndexer.verifyHealth()`
   - 返回 `{ healthy: boolean; entryCount: number }`

### 步骤 7：ContextEngine memory 层集成

**文件：** `src/main/services/context-engine.ts`（扩展）

1. 在 `ContextLayerType` 中新增 `'memory'` 类型
2. 在 `assembleContext()` 中新增 memory 层收集：
   - 调用 `this.memoryManager.search(request.userMessage, { limit: 5, includeArchived: false })`
   - 将搜索结果转换为 `ContextSegment[]`，layer = 'memory'
3. 调整 Token 预算分配：
   - always_load: 55%（原 ~70% 降为 55%）
   - memory: 15%（新增）
   - skill: 15%（保持）
   - manual_ref: 15%（保持）
4. 实现 `collectMemoryContext(request)` 私有方法：
   - 调用 `memoryManager.search()`
   - 转换结果为 ContextSegment
   - 设置 relevanceScore = finalScore
5. 降级策略：
   - `memoryManager.search()` 抛出 "v2 not available" → 跳过 memory 层
   - 回退到 v1 的 compactMemoryContext（由 AIHandler 注入）

### 步骤 8：AIHandler 注入逻辑迁移

**文件：** `src/main/ipc/handlers/ai.handler.ts`（改造）

1. 移除 `compactMemoryContext` 手动截断逻辑：
   - 删除 `const compactMemory = memorySnapshot.content.slice(0, 5000)` 代码
   - 删除将 memory 内容硬编码注入 system prompt 的逻辑
2. 改造 `queryRagSafely` 方法：
   - 优先调用 `this.memoryIndexer?.search(query, { limit: 5 })`
   - MemoryIndexer 不可用 → 回退到 `this.ragEngine.search(query)`
3. 构造函数新增 `memoryIndexer: MemoryIndexer | undefined` 依赖注入
4. 修改 `getMemorySnapshot()` 返回值：
   - 新增 `entryCount`、`lastCheckpoint`、`sections` 字段
   - 由 `MemoryFileManager.load()` 的 metadata 提供

### 步骤 9：懒加载策略实现

**文件：** `src/main/services/memory/memory-indexer.ts` + 主进程初始化逻辑

1. `MemoryIndexer` 初始化时机：
   - 应用启动 → 仅创建 SQLite 实例和 schema（不加载 embedding 模型）
   - `MemoryIndexer.initialize()` 中仅执行 schema 创建和 health check
2. `LocalEmbeddingProvider` 初始化时机：
   - 首次调用 `MemoryIndexer.search()` 或 `MemoryIndexer.upsert()` 时
   - 在后台异步初始化：`embeddingProvider.ensureInitialized()`
   - 初始化期间搜索降级到 FTS5-only
3. 主进程初始化流程：
   ```typescript
   // 启动时
   const memoryIndexer = new MemoryIndexer(db, embeddingProvider, workspaceRoot, logger)
   await memoryIndexer.initialize()  // 仅 schema，不加载模型

   // 首次使用时
   embeddingProvider.ensureInitialized()  // 后台加载模型
   ```

### 步骤 10：打包配置

**文件：** `package.json` + `electron-builder.yml`

1. 将 `@xenova/transformers` 添加为 `optionalDependencies`：
   - 安装时不可用 → 不阻塞应用启动
   - 运行时 import 失败 → LocalEmbeddingProvider 降级
2. 将 `sqlite-vec` 添加为 `optionalDependencies`：
   - 同上策略
3. `electron-builder.yml` 配置：
   - `@xenova/transformers` 模型文件不打包进 asar
   - 模型下载路径设为 `userData/models/`
   - `sqlite-vec` native 扩展纳入 `extraResources`
4. `package.json` 的 `build.asarUnpack` 中排除 `better-sqlite3`（已有）和 `sqlite-vec`

### 步骤 11：编写单元测试

**文件：** `tests/memory/embedding-provider.test.ts`

1. 测试 LocalEmbeddingProvider.initialize()（mock @xenova/transformers）
2. 测试 embed() 返回正确维度向量
3. 测试 isAvailable() 在初始化前返回 false
4. 测试 embed() 在未初始化时抛出错误
5. 测试初始化失败降级

**文件：** `tests/memory/memory-indexer.test.ts`

1. 测试 upsert 条目写入 memory_entries + memory_fts + memory_vec
2. 测试 remove 从三表中删除
3. 测试 search 混合检索结果排序
4. 测试 searchFtsOnly 降级搜索
5. 测试 indexReport 从 ExtractionReport 更新索引
6. 测试 rebuild 全量重建
7. 测试 verifyHealth 检测不一致
8. 测试 sectionFilter 和 includeArchived 过滤

**文件：** `tests/memory/context-engine-memory.test.ts`

1. 测试 assembleContext 包含 memory 层
2. 测试 memory 层使用 search() 结果
3. 测试 Token 预算 55/15/15/15 分配
4. 测试 MemoryIndexer 不可用时降级

### 步骤 12：集成验证

1. 运行 `npm run typecheck` 确保类型无误
2. 运行 `npm run lint` 确保代码规范
3. 运行 `npm run test` 确保所有测试通过
4. 手动验证混合检索：
   - 插入测试条目到 MemoryIndexer
   - 执行语义搜索
   - 确认结果包含向量+BM25+时间衰减综合评分
5. 手动验证 ContextEngine 集成：
   - AI 对话中 @reference 触发记忆搜索
   - 确认 memory 层内容出现在最终 prompt 中
6. 手动验证降级链：
   - 卸载 sqlite-vec → 确认回退到 FTS5-only
   - 卸载 @xenova/transformers → 确认回退到 LocalRagEngine

---

**创建时间：** 2026-04-20
**最后更新：** 2026-04-20
