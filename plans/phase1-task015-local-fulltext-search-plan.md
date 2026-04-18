# PHASE1-TASK015: 本地全文搜索 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task015_local-fulltext-search.md](../specs/tasks/phase1/phase1-task015_local-fulltext-search.md)
> 创建日期：2026-04-18
> 最后更新：2026-04-18

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK015 |
| **任务标题** | 本地全文搜索 |
| **优先级** | P1 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **前置依赖** | ✅ FileManager、✅ FileWatcher、✅ IPC 框架、⚠️ better-sqlite3（需新增） |

### 目标

实现基于 SQLite FTS5 的本地全文搜索，让用户能快速搜索 workspace 内所有文档内容。替换当前渲染进程中的暴力文本搜索（逐文件 `includes()` 匹配），将搜索逻辑下沉到主进程的 SQLite FTS5 索引引擎。

### 核心命题

当前搜索实现（`WorkspaceStudioPage.tsx:609-666`）采用渲染进程侧暴力扫描：逐文件 `readFile()` → 逐行 `toLowerCase().includes(query)`，最大扫描 260 个文件、80 条结果。这导致：

1. **性能瓶颈** — 每次搜索触发数十到数百次 IPC `file:read` 调用
2. **无排序** — 结果按文件遍历顺序返回，无相关性评分
3. **无高亮** — preview 仅展示匹配行原文，无关键词高亮标记
4. **无增量更新** — 每次搜索重新扫描全量文件

本任务通过以下方式解决：

1. **DatabaseManager** — 基于 better-sqlite3 的本地数据库，存储在 `.sibylla/index/search.db`
2. **LocalSearchEngine** — FTS5 全文索引 + BM25 排名 + snippet 高亮
3. **增量索引** — 通过 FileWatcher 事件实时更新索引（2 秒内）
4. **搜索 IPC** — `search:query` / `search:indexStatus` / `search:reindex` 通道
5. **前端改造** — 替换暴力搜索为 IPC 调用，保留现有 UI 框架

### 与 LocalRagEngine 的边界

| 特性 | LocalRagEngine | LocalSearchEngine（本任务） |
|------|---------------|--------------------------|
| 搜索范围 | `.sibylla/memory/archives/` | 全 workspace 文本文件 |
| 索引方式 | JSON 文件 + 自定义 BM25 | SQLite FTS5 |
| 存储位置 | `.sibylla/memory/index/rag-index.json` | `.sibylla/index/search.db` |
| 用途 | AI 对话前 RAG 召回 | 用户主动搜索 |
| Phase 2 归宿 | 保留为离线 RAG | 保留为离线 fallback |

**两者互不干扰，各自独立运行。**

### 范围边界

**包含：**
- DatabaseManager（better-sqlite3 封装 + WAL 模式 + Schema 初始化）
- LocalSearchEngine（FTS5 索引构建 + 搜索 + 增量更新）
- 搜索 IPC 通道 + SearchHandler
- Preload search API
- 前端 searchStore + 搜索 UI 改造（高亮 + 点击跳转）
- Mock API 扩展

**不包含：**
- 语义搜索（Phase 2 Sprint 4）
- 向量检索
- 跨 workspace 搜索
- 搜索结果排序自定义

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 路径 | 关键约束 |
|------|------|---------|
| 项目宪法 | `CLAUDE.md` | TS 严格模式禁止 any；主进程与渲染进程严格隔离；异步操作必须有错误处理；结构化日志 |
| 系统架构 | `specs/design/architecture.md` §1.2, §3.1 | LocalSearch 作为核心模块；IPC 通道 `search:query`；SQLite 搜索索引 |
| 数据模型与 API | `specs/design/data-and-api.md` §4.1 | 本地 SQLite 数据库结构：`files_fts` 虚拟表 + `files` 表；缓存策略 |
| 数据模型与 API | `specs/design/data-and-api.md` §5.4 | 搜索 IPC 接口：`ipc:search:local` / `ipc:search:buildIndex` |
| 需求规格 | `specs/requirements/phase1/sprint3-ai-mvp.md` §2.7 | 验收标准：100ms 响应 / 高亮 / 点击跳转 / 2 秒增量更新 / 后台初始索引 |
| UI/UX 规范 | `specs/design/ui-ux-design.md` §2.1 | 搜索入口在左栏，220px 宽度；搜索面板 UI 设计 |

### 2.2 Skill 依赖

| Skill | 路径 | 使用场景 |
|-------|------|---------|
| `sqlite-local-storage` | `.kilocode/skills/phase1/sqlite-local-storage/SKILL.md` | **核心参考** — DatabaseManager 初始化、FTS5 schema、索引操作、事务管理、WAL 配置、性能优化 |
| `electron-ipc-patterns` | `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` | IPC 通道设计、Preload bridge 模式、错误处理 |
| `typescript-strict-mode` | `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` | 类型严格约束、禁止 any |
| `zustand-state-management` | `.kilocode/skills/phase1/zustand-state-management/SKILL.md` | searchStore 设计模式 |
| `electron-desktop-app` | `.kilocode/skills/phase0/electron-desktop-app/SKILL.md` | 原生模块打包配置（better-sqlite3 rebuild） |

### 2.3 前置代码依赖

| 模块 | 路径 | 状态 | 说明 |
|------|------|------|------|
| FileManager | `src/main/services/file-manager.ts` | ✅ | `readFile()` / `listFiles({ recursive: true })` / `getFileInfo()` 直接复用 |
| FileWatcher | `src/main/services/file-watcher.ts` | ✅ | `FileWatchEvent` 事件复用，新增 search 事件转发 |
| IPC_CHANNELS | `src/shared/types.ts:72-193` | ⚠️ 需扩展 | 无搜索通道，需新增 `SEARCH_*` |
| IPCChannelMap | `src/shared/types.ts:235-336` | ⚠️ 需扩展 | 无搜索类型映射 |
| IpcHandler | `src/main/ipc/handler.ts` | ✅ | `safeHandle` 模式复用 |
| IpcManager | `src/main/ipc/index.ts` | ✅ | `registerHandler()` 模式复用 |
| 主进程入口 | `src/main/index.ts:206-228` | ⚠️ 需扩展 | FileWatcher 事件需转发至 LocalSearchEngine |
| Preload | `src/preload/index.ts` | ⚠️ 需扩展 | 需新增 `search` 命名空间 |
| mockElectronAPI | `src/renderer/dev/mockElectronAPI.ts` | ⚠️ 需扩展 | 需新增 search mock |
| StudioLeftPanel | `src/renderer/components/studio/StudioLeftPanel.tsx` | ⚠️ 需改造 | 搜索输入 + 结果列表改造 |
| WorkspaceStudioPage | `src/renderer/pages/WorkspaceStudioPage.tsx:609-666` | ⚠️ 需改造 | 替换暴力搜索为 IPC 调用 |
| SearchResultItem | `src/renderer/components/studio/types.ts` | ⚠️ 需扩展 | 新增高亮 snippet 字段 |
| vite.main.config | `vite.main.config.ts` | ⚠️ 需修改 | better-sqlite3 external 配置 |

### 2.4 npm 依赖

| 包 | 版本 | 说明 |
|----|------|------|
| `better-sqlite3` | ^11.x | 本地 SQLite 数据库，需 electron-rebuild |
| `@types/better-sqlite3` | ^7.x | 类型定义 |

**构建配置：** `vite.main.config.ts` 的 `external` 数组需加入 `'better-sqlite3'`；`package.json` 的 `build.asarUnpack` 需排除 `better-sqlite3`。

### 2.5 数据存储依赖

| 数据 | 位置 | 说明 |
|------|------|------|
| SQLite 数据库 | `{workspace}/.sibylla/index/search.db` | FTS5 索引 + 文件元数据 |
| WAL 文件 | `{workspace}/.sibylla/index/search.db-wal` | WAL 模式自动生成 |
| `.gitignore` | `.sibylla/index/` | 索引不入 Git，每客户端独立维护 |

---

## 三、差距分析

### 3.1 目标数据流

```
渲染进程                            主进程
  │                                  │
  │ 用户输入搜索关键词                  │
  │ StudioLeftPanel → searchStore     │
  │                                  │
  │ ipcRenderer.invoke('search:query',│
  │   { query, limit })              │
  │─────────────────────────────────▶│
  │                                  │ LocalSearchEngine.search()
  │                                  │   → FTS5 MATCH query
  │                                  │   → snippet() 高亮
  │                                  │   → BM25 rank 排序
  │                                  │
  │◀── IPCResponse<SearchResult[]> ──│
  │                                  │
  │ searchStore 更新 results          │
  │ StudioLeftPanel 渲染高亮结果       │
  │                                  │
  │ 点击结果                          │
  │ tabStore.openFile(path)           │
  │ editorStore.scrollToLine(line)    │
  │                                  │
  │ ═════════════════════════════════ │
  │                                  │
  │ 文件变更（后台）                    │
  │                                  │ FileWatcher → 'change' event
  │                                  │   → LocalSearchEngine.onFileChange()
  │                                  │   → FileManager.readFile()
  │                                  │   → FTS5 UPDATE (事务)
  │                                  │
  │ Workspace 打开（后台）             │
  │                                  │ LocalSearchEngine.initialize()
  │                                  │   → 遍历所有文本文件
  │                                  │   → 批量 INSERT INTO files_fts
  │                                  │   → webContents.send('search:indexProgress')
```

### 3.2 差距矩阵

| 能力 | 现有 | 本任务产出 |
|------|------|-----------|
| SQLite 数据库 | ❌ 不存在 | `DatabaseManager` (better-sqlite3) |
| FTS5 全文索引 | ❌ 不存在 | `LocalSearchEngine` (buildIndex + search) |
| 增量索引更新 | ❌ 不存在 | FileWatcher → onFileChange → updateIndex |
| 搜索 IPC 通道 | ❌ 不存在 | `SEARCH_QUERY` / `SEARCH_INDEX_STATUS` / `SEARCH_REINDEX` |
| SearchHandler | ❌ 不存在 | `search.handler.ts` |
| Preload search API | ❌ 不存在 | `search: { query, indexStatus, reindex, onIndexProgress }` |
| 搜索结果高亮 | ❌ 无高亮 | FTS5 `snippet()` + `<mark>` 标签渲染 |
| 点击跳转到匹配行 | ⚠️ 仅 openFile | 新增 lineNumber + scrollToLine |
| searchStore | ❌ 不存在 | `searchStore.ts` |
| better-sqlite3 依赖 | ❌ 未安装 | npm install + electron-rebuild |
| Mock search API | ❌ 不存在 | mockElectronAPI 新增 search 命名空间 |

### 3.3 文件变更清单

**新建：**
- `src/main/services/database-manager.ts` — SQLite 数据库管理器
- `src/main/services/local-search-engine.ts` — FTS5 全文搜索引擎
- `src/main/ipc/handlers/search.handler.ts` — 搜索 IPC 处理器
- `src/renderer/store/searchStore.ts` — 搜索状态管理
- `tests/main/DatabaseManager.test.ts` — 数据库测试
- `tests/main/LocalSearchEngine.test.ts` — 搜索引擎测试

**修改：**
- `src/shared/types.ts` — +4 搜索 IPC 通道 + 搜索类型定义 + IPCChannelMap 扩展
- `src/main/index.ts` — +DatabaseManager/LocalSearchEngine 初始化 + FileWatcher 事件转发
- `src/preload/index.ts` — +search 命名空间 + ALLOWED_CHANNELS 扩展
- `src/renderer/dev/mockElectronAPI.ts` — +search mock
- `src/renderer/components/studio/StudioLeftPanel.tsx` — 搜索 UI 改造
- `src/renderer/pages/WorkspaceStudioPage.tsx` — 替换暴力搜索逻辑
- `src/renderer/components/studio/types.ts` — SearchResultItem 扩展
- `vite.main.config.ts` — better-sqlite3 external
- `package.json` — +better-sqlite3 依赖 + asarUnpack

**不修改：**
- `local-rag-engine.ts` — 保持独立，互不干扰
- `file-manager.ts` — 仅调用，不修改
- `file-watcher.ts` — 仅订阅事件，不修改
- `ai.handler.ts` — 搜索不涉及 AI 链路

---

## 四、类型系统设计

### 4.1 新增 IPC 通道

在 `src/shared/types.ts` 的 `IPC_CHANNELS` 中新增：

```typescript
// Search operations (local fulltext search via SQLite FTS5)
SEARCH_QUERY: 'search:query',
SEARCH_INDEX_STATUS: 'search:indexStatus',
SEARCH_REINDEX: 'search:reindex',
SEARCH_INDEX_PROGRESS: 'search:indexProgress',
```

### 4.2 新增共享类型

```typescript
export interface SearchQueryParams {
  query: string
  limit?: number
  fileExtensions?: string[]
}

export interface SearchResult {
  id: string
  path: string
  snippet: string
  rank: number
  lineNumber: number
  matchCount: number
}

export interface SearchIndexStatus {
  totalFiles: number
  indexedFiles: number
  indexSizeBytes: number
  lastIndexedAt: number | null
  isIndexing: boolean
}

export interface SearchIndexProgress {
  phase: 'scanning' | 'indexing' | 'complete' | 'error'
  current: number
  total: number
  filePath?: string
  error?: string
}
```

### 4.3 IPCChannelMap 扩展

```typescript
[IPC_CHANNELS.SEARCH_QUERY]: {
  params: [params: SearchQueryParams]
  return: SearchResult[]
}
[IPC_CHANNELS.SEARCH_INDEX_STATUS]: {
  params: []
  return: SearchIndexStatus
}
[IPC_CHANNELS.SEARCH_REINDEX]: {
  params: []
  return: void
}
[IPC_CHANNELS.SEARCH_INDEX_PROGRESS]: {
  params: [progress: SearchIndexProgress]
  return: void
}
```

### 4.4 扩展现有类型

`SearchResultItem`（`src/renderer/components/studio/types.ts`）扩展：

```typescript
export interface SearchResultItem {
  id: string
  path: string
  lineNumber: number
  preview: string
  snippet: string      // 新增：FTS5 snippet 带高亮标记
  rank: number         // 新增：BM25 相关性评分
  matchCount: number   // 新增：文件内匹配数
}
```

### 4.5 设计决策

| 决策 | 理由 |
|------|------|
| `SearchResult.snippet` 使用 `<mark>` 标签 | FTS5 `snippet()` 原生支持自定义高亮标记，前端直接渲染 |
| `SearchResult.lineNumber` 类型为 number | 从 snippet 内容中反推行号（匹配行偏移计算） |
| `SearchQueryParams.fileExtensions` 可选 | 默认索引所有文本文件，可选按扩展名过滤 |
| `SearchIndexProgress` 推送模型 | 大 workspace 初始索引可能耗时数秒，需进度反馈 |
| 数据库存 `.sibylla/index/` 而非 `.sibylla/search/` | 遵循 `data-and-api.md` §1.1 的目录结构定义 |
| `SEARCH_INDEX_PROGRESS` 用 webContents.send | 主进程 → 渲染进程推送，与 `SYNC_STATUS_CHANGED` 模式一致 |

---

## 五、核心模块设计

### 5.1 DatabaseManager

**文件：** `src/main/services/database-manager.ts`

基于 `sqlite-local-storage` Skill 的最佳实践。

```typescript
export class DatabaseManager {
  private db: Database.Database
  private readonly dbPath: string

  constructor(workspacePath: string)
  private openDatabase(): Database.Database
  private configure(): void
  private initSchema(): void
  close(): void

  // File metadata operations
  upsertFileMeta(path: string, contentHash: string, lastModified: number, size: number): void
  getFileMeta(path: string): FileMetaRecord | undefined
  deleteFileMeta(path: string): void
  getAllFileMeta(): FileMetaRecord[]

  // FTS5 operations
  indexFileContent(path: string, content: string): void
  removeFileIndex(path: string): void
  searchFiles(query: string, limit: number): RawSearchResult[]
  clearAllIndexes(): void

  // Integrity check
  checkIntegrity(): boolean
}
```

**Schema 设计：**

```sql
CREATE TABLE IF NOT EXISTS search_files (
  path TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  last_modified INTEGER NOT NULL,
  size INTEGER NOT NULL,
  indexed_at INTEGER NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
  path,
  content,
  content='search_files',
  content_rowid='rowid',
  tokenize='unicode61'
);

CREATE INDEX IF NOT EXISTS idx_search_files_modified ON search_files(last_modified);
```

**设计要点：**
- 使用 **content table** 模式（FTS5 外部内容表），`files_fts` 引用 `search_files` 的 rowid
- WAL 模式 + `synchronous = NORMAL`，平衡安全性与性能
- `indexed_at` 记录索引时间，用于增量更新检测
- `content_hash` 用于检测文件内容是否变化（避免无变化时重索引）

**配置参数：**

```typescript
this.db.pragma('journal_mode = WAL')
this.db.pragma('synchronous = NORMAL')
this.db.pragma('foreign_keys = ON')
this.db.pragma('cache_size = -32000')  // 32MB
this.db.pragma('mmap_size = 67108864') // 64MB
```

### 5.2 LocalSearchEngine

**文件：** `src/main/services/local-search-engine.ts`

```typescript
export class LocalSearchEngine {
  private dbManager: DatabaseManager
  private fileManager: FileManager
  private readonly workspacePath: string
  private indexStatus: SearchIndexStatus
  private sender: Electron.WebContents | null
  private isInitialized: boolean

  constructor(dbManager: DatabaseManager, fileManager: FileManager, workspacePath: string)
  
  // Lifecycle
  async initialize(sender: Electron.WebContents): Promise<void>
  dispose(): void

  // Search
  search(params: SearchQueryParams): SearchResult[]

  // Index management
  async buildIndex(): Promise<void>
  async rebuildIndex(): Promise<void>
  getIndexStatus(): SearchIndexStatus

  // Incremental update
  async onFileChange(event: FileWatchEvent): Promise<void>
  
  // Internal
  private async indexFile(relativePath: string): Promise<void>
  private isIndexableFile(filePath: string): boolean
  private sanitizeFTSQuery(query: string): string
  private computeLineNumber(content: string, snippet: string): number
  private emitProgress(progress: SearchIndexProgress): void
}
```

### 5.3 文件类型过滤

**可索引文件扩展名（`isIndexableFile`）：**

```typescript
const INDEXABLE_EXTENSIONS = new Set([
  '.md', '.txt', '.markdown',      // 文档
  '.json', '.yaml', '.yml', '.toml', // 配置/数据
  '.csv',                            // 数据文件
  '.js', '.ts', '.tsx', '.jsx',     // 代码
  '.css', '.scss', '.less',          // 样式
  '.html', '.xml', '.svg',          // 标记语言
])

const EXCLUDED_PATHS = [
  '.git/',
  'node_modules/',
  '.sibylla/index/',     // 排除索引自身
  '.sibylla/memory/',    // memory 由 LocalRagEngine 管理
]
```

**设计决策：** 仅索引文本文件。二进制文件（图片、视频等）不参与 FTS5 索引。与 `context-engine.ts` 的 `EXCLUDED_EXTENSIONS` 保持一致的排除逻辑。

### 5.4 索引构建策略

**初始构建（`buildIndex`）：**

1. 使用 `FileManager.listFiles('/', { recursive: true })` 获取所有文件
2. 过滤 `isIndexableFile()` + 排除 `EXCLUDED_PATHS`
3. 对比 `search_files` 表中已有的 `content_hash` + `last_modified`
4. 仅索引新增/修改的文件（增量构建）
5. 清理已删除文件的索引
6. 全程使用事务批量插入
7. 每 50 个文件推送一次 `SearchIndexProgress`

**增量更新（`onFileChange`）：**

```
FileWatchEvent.type
├── 'add'     → indexFile(path)
├── 'change'  → contentHash 变化 → indexFile(path)（DELETE + INSERT 事务）
├── 'unlink'  → removeFileIndex(path) + deleteFileMeta(path)
├── 'addDir'  → 忽略（buildIndex 时遍历子文件）
└── 'unlinkDir' → 忽略（FileWatcher 会逐个触发 unlink）
```

**防抖策略：** FileWatcher 已配置 `awaitWriteFinish: 300ms`，不需要额外防抖。

### 5.5 搜索查询处理

**`search()` 核心逻辑：**

```typescript
search(params: SearchQueryParams): SearchResult[] {
  const sanitizedQuery = this.sanitizeFTSQuery(params.query)
  if (!sanitizedQuery) return []

  // 前缀匹配：每个词加 * 号
  const prefixQuery = sanitizedQuery
    .split(/\s+/)
    .filter(t => t.length > 0)
    .map(t => `"${t}"*`)
    .join(' ')

  const rawResults = this.dbManager.searchFiles(prefixQuery, params.limit ?? 20)
  
  return rawResults.map(r => ({
    id: `${r.path}::${r.lineNumber}`,
    path: r.path,
    snippet: r.snippet,        // 包含 <mark> 高亮标记
    rank: r.rank,
    lineNumber: r.lineNumber,
    matchCount: r.matchCount,
  }))
}
```

**`sanitizeFTSQuery` — 安全清理：**

```typescript
private sanitizeFTSQuery(query: string): string {
  return query
    .replace(/[{}()\[\]^"~*:]/g, ' ')  // 移除 FTS5 特殊操作符
    .replace(/'/g, '')                   // 移除引号
    .replace(/\s+/g, ' ')
    .trim()
}
```

### 5.6 snippet 与行号计算

FTS5 `snippet()` 函数返回匹配上下文片段，包含高亮标记：

```sql
snippet(files_fts, 1, '<mark>', '</mark>', '...', 32) as snippet
```

**行号计算策略：**

```typescript
private computeLineNumber(content: string, snippet: string): number {
  // 从 snippet 中提取第一个 <mark> 之前的不重复文本
  const plainSnippet = snippet.replace(/<\/?mark>/g, '').replace(/\.\.\./g, '')
  const snippetStart = plainSnippet.substring(0, 32).trim()
  
  // 在文件内容中定位 snippet 起始位置
  const contentIndex = content.indexOf(snippetStart)
  if (contentIndex === -1) return 1
  
  // 统计换行符数量 = 行号 - 1
  const lineNumber = content.substring(0, contentIndex).split('\n').length
  return lineNumber
}
```

**更精确的方案：** 在 `indexFileContent` 时额外存储行偏移表到 `search_files`，搜索时直接查表。但 MVP 阶段使用文本匹配方案足够。

### 5.7 初始化时序

```
main/index.ts onWorkspaceOpened:
  1. GitAbstraction → FileManager → ImportManager → SyncManager → ...
  2. FileWatcher.start(callback)                    // 已有
  3. memoryManager.setWorkspacePath()                // 已有
  4. localRagEngine.setWorkspacePath() + rebuildIndex() // 已有
  5. [NEW] databaseManager = new DatabaseManager(workspacePath)
  6. [NEW] localSearchEngine = new LocalSearchEngine(dbManager, fileManager, workspacePath)
  7. [NEW] await localSearchEngine.initialize(mainWindow.webContents)
  8. [NEW] 在 FileWatcher callback 中新增 localSearchEngine.onFileChange(event)
  9. [NEW] searchHandler = new SearchHandler(localSearchEngine)
  10. [NEW] ipcManager.registerHandler(searchHandler)
```

---

## 六、IPC 接口与 Preload

### 6.1 SearchHandler

**文件：** `src/main/ipc/handlers/search.handler.ts`

遵循 `IpcHandler` 基类模式（同 `file.handler.ts` / `ai.handler.ts`）：

```typescript
export class SearchHandler extends IpcHandler {
  readonly namespace = 'search'
  private localSearchEngine: LocalSearchEngine

  constructor(localSearchEngine: LocalSearchEngine)

  register(): void {
    ipcMain.handle(IPC_CHANNELS.SEARCH_QUERY,
      this.safeHandle(this.handleSearchQuery.bind(this)))
    ipcMain.handle(IPC_CHANNELS.SEARCH_INDEX_STATUS,
      this.safeHandle(this.handleIndexStatus.bind(this)))
    ipcMain.handle(IPC_CHANNELS.SEARCH_REINDEX,
      this.safeHandle(this.handleReindex.bind(this)))
  }

  private async handleSearchQuery(_event, params: SearchQueryParams): Promise<SearchResult[]>
  private async handleIndexStatus(): Promise<SearchIndexStatus>
  private async handleReindex(): Promise<void>
}
```

**错误处理：** `safeHandle` 已自动包裹 try/catch + `wrapError`。`handleSearchQuery` 需额外处理 FTS5 语法错误（`sanitizeFTSQuery` 后仍可能失败）→ 捕获后返回空结果而非抛异常。

### 6.2 Preload Bridge

**文件：** `src/preload/index.ts` 扩展

在 `ElectronAPI` 接口中新增 `search` 命名空间：

```typescript
interface ElectronAPI {
  // ...existing...
  search: {
    query: (params: SearchQueryParams) => Promise<IPCResponse<SearchResult[]>>
    indexStatus: () => Promise<IPCResponse<SearchIndexStatus>>
    reindex: () => Promise<IPCResponse<void>>
    onIndexProgress: (callback: (progress: SearchIndexProgress) => void) => () => void
  }
}
```

**实现：**

```typescript
search: {
  query: (params) => safeInvoke<SearchResult[]>(IPC_CHANNELS.SEARCH_QUERY, params),
  indexStatus: () => safeInvoke<SearchIndexStatus>(IPC_CHANNELS.SEARCH_INDEX_STATUS),
  reindex: () => safeInvoke<void>(IPC_CHANNELS.SEARCH_REINDEX),
  onIndexProgress: (callback) => {
    api.on(IPC_CHANNELS.SEARCH_INDEX_PROGRESS, (_event, progress) => callback(progress))
    return () => api.off(IPC_CHANNELS.SEARCH_INDEX_PROGRESS, callback)
  },
}
```

**ALLOWED_CHANNELS 新增：**

```typescript
IPC_CHANNELS.SEARCH_QUERY,
IPC_CHANNELS.SEARCH_INDEX_STATUS,
IPC_CHANNELS.SEARCH_REINDEX,
IPC_CHANNELS.SEARCH_INDEX_PROGRESS,
```

### 6.3 Mock API

**文件：** `src/renderer/dev/mockElectronAPI.ts` 扩展

```typescript
search: {
  query: async (params: SearchQueryParams): Promise<IPCResponse<SearchResult[]>> => {
    await delay(50)
    // 简单文本匹配 mock
    const results: SearchResult[] = []
    for (const [path, content] of mockFiles.entries()) {
      if (!params.query) continue
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(params.query.toLowerCase())) {
          results.push({
            id: `${path}::${i + 1}`,
            path,
            snippet: lines[i].replace(
              new RegExp(params.query, 'gi'),
              '<mark>$&</mark>'
            ),
            rank: 1 - (i / lines.length),
            lineNumber: i + 1,
            matchCount: 1,
          })
        }
      }
    }
    return ok(results.slice(0, params.limit ?? 20))
  },
  indexStatus: async () => ok<SearchIndexStatus>({
    totalFiles: mockFiles.size,
    indexedFiles: mockFiles.size,
    indexSizeBytes: 0,
    lastIndexedAt: Date.now(),
    isIndexing: false,
  }),
  reindex: async () => ok(void 0),
  onIndexProgress: () => () => {},
},
```

---

## 七、前端搜索 Store 与 UI 改造

### 7.1 searchStore

**文件：** `src/renderer/store/searchStore.ts`

遵循 Zustand 模式（参考 `useSyncStatusStore`、`useAIChatStore`）：

```typescript
interface SearchState {
  query: string
  results: SearchResultItem[]
  isSearching: boolean
  indexStatus: SearchIndexStatus | null
  isIndexing: boolean
  selectedIndex: number
  error: string | null
}

interface SearchActions {
  setQuery: (query: string) => void
  search: (query: string) => Promise<void>
  selectResult: (index: number) => void
  clearResults: () => void
  fetchIndexStatus: () => Promise<void>
  reindex: () => Promise<void>
  setIndexProgress: (progress: SearchIndexProgress) => void
}
```

**关键设计：**
- `search` 方法内置 260ms debounce（与当前 `SEARCH_DEBOUNCE_MS` 一致）
- `search` 方法调用 `window.electronAPI.search.query()`
- `selectedIndex` 用于键盘上下箭头导航
- 不使用 `persist` 中间件（搜索状态无需持久化）

### 7.2 StudioLeftPanel 搜索改造

**文件：** `src/renderer/components/studio/StudioLeftPanel.tsx`

**改造范围：** 搜索输入框（383-387 行）+ 结果列表（389-408 行）

**改造内容：**

1. **替换数据源：** 从 `WorkspaceStudioPage` 的 `runSearch` props 改为 `searchStore` 直接调用
2. **高亮渲染：** 使用 `dangerouslySetInnerHTML` 渲染 `<mark>` 标签（XSS 安全：FTS5 snippet 由主进程生成，不包含用户 HTML）
3. **结果展示：** 每条结果显示 `文件路径:行号` + 高亮 snippet
4. **键盘导航：** ↑↓ 箭头选择 + Enter 打开文件
5. **索引状态：** 搜索框下方显示索引进度条（`isIndexing` 时）

**UI 细节：**

```
┌─────────────────────────────┐
│ 🔍 搜索文档...    ⌘⇧F       │
├─────────────────────────────┤
│ 📄 docs/product/prd.md:42   │
│ ...会分为三个<mark>等级</mark>...  │
│                             │
│ 📄 docs/engineering/api.md:15│
│ ...API <mark>等级</mark>设计...    │
│                             │
│ 📄 tasks.md:8               │
│ ...完成<mark>等级</mark>规划...     │
├─────────────────────────────┤
│ 索引完成 · 42 个文件         │
└─────────────────────────────┘
```

### 7.3 WorkspaceStudioPage 改造

**文件：** `src/renderer/pages/WorkspaceStudioPage.tsx`

**删除：** `runSearch` 回调（609-666 行）及其所有相关状态

**修改：** `StudioLeftPanel` 的 `searchResults` props 改为直接从 `searchStore` 读取

**保留：**
- `Cmd+Shift+F` 快捷键绑定
- `SEARCH_DEBOUNCE_MS` 常量（迁移到 searchStore）
- `SearchResultItem` 类型（扩展后复用）

### 7.4 点击跳转实现

**现有能力：** `tabStore.openTab(path)` 可打开文件到编辑器

**新增能力：** 搜索结果点击后跳转到匹配行

```typescript
// 在 StudioLeftPanel 的结果点击回调中
const handleResultClick = (result: SearchResultItem) => {
  tabStore.openTab(result.path)
  // 通过自定义事件或 editorStore 方法传递行号
  editorStore.scrollToLine(result.lineNumber)
}
```

**scrollToLine 实现策略：** Tiptap 编辑器通过 `editor.commands.setTextSelection(position)` + `editor.commands.scrollIntoView()` 实现。需要在 `useEditorStore` 中新增 `scrollToLine(lineNumber: number)` 方法，通过 Tiptap 的 `prosemirror-model` 计算文档位置。

---

## 八、分步实施计划

> 共 6 步，每步可独立验证，渐进式推进。

### Step 1：依赖安装 + 构建配置（0.5h）

**产出：** better-sqlite3 可用

1. `npm install better-sqlite3 @types/better-sqlite3`
2. `npx electron-rebuild` 重新编译原生模块
3. `vite.main.config.ts` 的 `external` 数组加入 `'better-sqlite3'`
4. `package.json` 的 `build.asarUnpack` 加入 `node_modules/better-sqlite3`
5. 验证：`require('better-sqlite3')` 在主进程中可用

- [ ] `npm run dev` 主进程启动无报错
- [ ] better-sqlite3 可正常 require

### Step 2：类型系统扩展（0.5h）

**产出：** `src/shared/types.ts` 新增搜索类型 + IPC 通道

1. `IPC_CHANNELS` 新增 4 个 `SEARCH_*` 通道
2. 新增 `SearchQueryParams`、`SearchResult`、`SearchIndexStatus`、`SearchIndexProgress` 类型
3. `IPCChannelMap` 新增 4 个映射
4. `SearchResultItem` 扩展 +3 字段

- [ ] `npm run type-check` 通过

### Step 3：DatabaseManager（1.5h）

**产出：** `src/main/services/database-manager.ts`

1. 构造函数：接收 workspacePath，创建 `.sibylla/index/` 目录
2. `openDatabase()` + `configure()` — WAL 模式、缓存、mmap
3. `initSchema()` — `search_files` 表 + `files_fts` 虚拟表 + 索引
4. `upsertFileMeta()` / `getFileMeta()` / `deleteFileMeta()` / `getAllFileMeta()`
5. `indexFileContent()` — 事务：DELETE + INSERT（FTS5 外部内容表模式）
6. `removeFileIndex()` — DELETE from both tables
7. `searchFiles()` — FTS5 MATCH + snippet() + rank
8. `clearAllIndexes()` — 清空表 + rebuild FTS
9. `checkIntegrity()` — `PRAGMA integrity_check`
10. `close()` — PRAGMA optimize + close

- [ ] 单元测试：open/close cycle、insert/search/delete 正确性
- [ ] type-check + lint 通过

### Step 4：LocalSearchEngine（2h）

**产出：** `src/main/services/local-search-engine.ts`

1. 构造函数：接收 DatabaseManager + FileManager + workspacePath
2. `initialize(sender)` — 后台 buildIndex + emitProgress
3. `buildIndex()` — listFiles + isIndexableFile + 批量 indexFile + 增量检测
4. `search(params)` — sanitizeFTSQuery + 前缀查询 + lineNumber 计算 + 结果组装
5. `onFileChange(event)` — add/change/unlink 处理
6. `isIndexableFile()` — INDEXABLE_EXTENSIONS + EXCLUDED_PATHS
7. `rebuildIndex()` — clearAllIndexes + buildIndex
8. `dispose()` — 清理引用

- [ ] 单元测试：index + search 基本流程
- [ ] 搜索结果包含 `<mark>` 高亮
- [ ] 增量更新：文件修改后重索引
- [ ] type-check + lint 通过

### Step 5：IPC + Preload + Mock（1h）

**产出：** SearchHandler + Preload search API + Mock API

1. `search.handler.ts` — 3 个 handler 方法 + register
2. `preload/index.ts` — search 命名空间 + ALLOWED_CHANNELS
3. `mockElectronAPI.ts` — search mock
4. `main/index.ts` — DatabaseManager + LocalSearchEngine 初始化 + FileWatcher 转发 + registerHandler

- [ ] 渲染进程 `window.electronAPI.search.query()` 可调用
- [ ] Mock 模式搜索返回结果
- [ ] `npm run dev` 全链路启动无报错

### Step 6：前端 UI 改造（2h）

**产出：** searchStore + StudioLeftPanel 改造 + 跳转功能

1. `searchStore.ts` — 状态管理 + debounce search
2. `StudioLeftPanel.tsx` — 搜索框 + 高亮结果 + 键盘导航 + 索引状态
3. `WorkspaceStudioPage.tsx` — 删除暴力搜索 + 改用 searchStore
4. `types.ts` — SearchResultItem 扩展字段
5. 点击跳转：openTab + scrollToLine（editorStore 扩展）
6. 暗色/亮色模式适配

- [ ] 搜索关键词高亮正常显示
- [ ] 点击结果打开文件并跳转到行
- [ ] 键盘导航 ↑↓ + Enter 正常
- [ ] 索引进度条正常显示
- [ ] type-check + lint + 全部测试通过

---

## 九、验收标准与交付物

### 9.1 功能验收

| # | 验收项 | 对应 Step | 验证方式 |
|---|--------|----------|---------|
| 1 | 搜索关键词后 100ms 内返回结果 | 4,5 | 输入搜索词观察响应时间 |
| 2 | 搜索结果高亮匹配关键词 | 6 | 检查 `<mark>` 标签渲染 |
| 3 | 点击搜索结果打开文件并滚动到匹配位置 | 6 | 点击结果观察跳转 |
| 4 | 文件修改后 2 秒内更新索引 | 4,5 | 修改文件后立即搜索验证 |
| 5 | Workspace 打开时后台构建初始索引 | 4,5 | 打开 workspace 观察索引进度 |
| 6 | 仅索引文本文件 | 4 | 检查图片/视频不出现在搜索结果 |
| 7 | 索引进度可见 | 5,6 | 大 workspace 初始索引时显示进度 |

### 9.2 性能指标

| 指标 | 目标 | 验证方式 |
|------|------|---------|
| 搜索响应 | < 100ms | `console.time` 测量 `search:query` IPC 延迟 |
| 初始索引（100 文件） | < 3 秒 | `console.time` 测量 `buildIndex()` |
| 增量索引（单文件） | < 500ms | 修改文件后搜索验证 |
| 索引数据库大小 | < 2x 文件总大小 | 检查 `.sibylla/index/search.db` 大小 |

### 9.3 代码质量

| 指标 | 要求 |
|------|------|
| TypeScript strict | 零错误 |
| ESLint | 通过 |
| 测试覆盖率 | ≥ 70%（DatabaseManager + LocalSearchEngine） |
| 现有测试 | 全部通过 |
| `any` 使用 | 零 |

### 9.4 交付物清单

| # | 文件 | 类型 |
|---|------|------|
| 1 | `src/shared/types.ts` | 扩展 +4 通道+4 类型 |
| 2 | `src/main/services/database-manager.ts` | 新增 |
| 3 | `src/main/services/local-search-engine.ts` | 新增 |
| 4 | `src/main/ipc/handlers/search.handler.ts` | 新增 |
| 5 | `src/main/index.ts` | 扩展 +初始化+FileWatcher 转发 |
| 6 | `src/preload/index.ts` | 扩展 +search 命名空间 |
| 7 | `src/renderer/store/searchStore.ts` | 新增 |
| 8 | `src/renderer/dev/mockElectronAPI.ts` | 扩展 +search mock |
| 9 | `src/renderer/components/studio/StudioLeftPanel.tsx` | 改造 搜索 UI |
| 10 | `src/renderer/pages/WorkspaceStudioPage.tsx` | 改造 删除暴力搜索 |
| 11 | `src/renderer/components/studio/types.ts` | 扩展 SearchResultItem |
| 12 | `vite.main.config.ts` | 修改 external |
| 13 | `package.json` | +dependencies +asarUnpack |
| 14 | `tests/main/DatabaseManager.test.ts` | 新增 |
| 15 | `tests/main/LocalSearchEngine.test.ts` | 新增 |

---

## 十、风险与回滚

### 10.1 技术风险

| 风险 | 影响 | 概率 | 缓解 |
|------|------|------|------|
| better-sqlite3 打包失败（Electron 原生模块） | 高 | 中 | `electron-rebuild` + `asarUnpack`；备选方案 `sql.js`（纯 WASM，性能略低） |
| FTS5 中文分词效果差 | 中 | 中 | `unicode61` tokenizer 支持基本中文分词；Phase 2 可替换为 `jieba` tokenizer |
| 大 workspace 初始索引慢 | 中 | 低 | 增量构建（仅索引新增/修改文件）；后台线程不阻塞 UI |
| 数据库文件损坏 | 高 | 低 | WAL 模式强容错；启动时 `integrity_check`；损坏时自动 rebuild |
| `snippet()` 行号不精确 | 低 | 中 | MVP 使用文本匹配反推行号；后续可改为存储行偏移表 |

### 10.2 回滚策略

| 变更 | 回滚方式 |
|------|---------|
| `types.ts` 新增 | 删除新增行，无破坏性 |
| `database-manager.ts` | 独立文件，安全删除 |
| `local-search-engine.ts` | 独立文件，安全删除 |
| `search.handler.ts` | 独立文件，安全删除 + 注销 registerHandler |
| `main/index.ts` 初始化 | git revert 新增行 |
| `preload/index.ts` | 删除 search 命名空间 |
| `StudioLeftPanel.tsx` | git revert 恢复暴力搜索 |
| `WorkspaceStudioPage.tsx` | git revert 恢复 runSearch |
| `better-sqlite3` | `npm uninstall` + 还原 vite config |

**最小回滚（前端回退）：** 仅回滚 `StudioLeftPanel.tsx` + `WorkspaceStudioPage.tsx` 恢复暴力搜索，后端模块可保留。

**完全回滚：** 删除所有新增文件 + git revert 所有修改文件 + `npm uninstall better-sqlite3 @types/better-sqlite3`。

---

**创建时间：** 2026-04-18
**最后更新：** 2026-04-18
**更新记录：**
- 2026-04-18 — 初始创建
