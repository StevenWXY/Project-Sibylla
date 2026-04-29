# PHASE2-TASK004: 双向链接系统与文档关系图谱 — 实施计划

> 任务来源：[specs/tasks/phase2/phase2-task004_wiki-links-knowledge-graph.md](../../specs/tasks/phase2/phase2-task004_wiki-links-knowledge-graph.md)
> 创建日期：2026-04-28
> 最后更新：2026-04-28

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK004 |
| **任务标题** | 双向链接系统与文档关系图谱 |
| **所属阶段** | Phase 2 - 跨源数据统一与上下文引擎 v2 (Sprint 4) |
| **优先级** | P0 (双向链接) + P1 (图谱) |
| **复杂度** | 非常复杂 |
| **预估工时** | 5-6 工作日 |
| **前置依赖** | PHASE2-TASK001（事件总线）+ PHASE2-TASK002（统一搜索 + fuzzyFiles IPC）+ PHASE1-TASK002（Tiptap 编辑器）+ PHASE1-TASK015（LocalSearchEngine / SQLite） |

### 1.1 目标

在 Tiptap 编辑器中实现 `[[wiki-link]]` 双向链接系统和文档关系图谱。核心交付：

1. **WikiLinks 类型系统** — `WikiLink`/`Backlink`/`GraphData`/`ExtractedLink` 接口
2. **SQLite `wiki_links` 表** — 与 `LocalSearchEngine` 同库，`source_path`/`target_path` 索引
3. **WikiLinksIndexer** — 正则提取 + 事务重建 + 事件订阅（`file.updated`/`file.deleted`/`file.renamed`）
4. **WikiLinksStore** — 正向/反向/图谱查询接口，聚焦模式 BFS
5. **Tiptap WikiLink 节点扩展** — 输入规则 + 渲染 + 点击跳转 + 损坏链接样式
6. **Tiptap WikiLinkSuggest 补全扩展** — `[[` 触发 + `search:fuzzyFiles` IPC + WikiLinkPicker 组件
7. **悬停预览 Plugin** — 300ms 延迟弹出目标文件前 200 字符
8. **BacklinksPanel** — 反向链接侧边栏面板 + BacklinkCard 组件
9. **KnowledgeGraph** — 文档关系图谱可视化（P1，基于 react-force-graph）
10. **IPC handler** — `wikiLinks:getBacklinks` / `wikiLinks:getOutlinks` / `wikiLinks:rebuildIndex`

### 1.2 核心设计约束（来自 CLAUDE.md + 任务文档）

| 约束 | 来源 | 具体要求 |
|------|------|----------|
| 文件即真相 | CLAUDE.md §二 | `[[wiki-link]]` 在 Markdown 源码中保持纯文本，无 HTML |
| 链接索引复用 SQLite | 任务文档 §核心设计约束 | 与 `DatabaseManager` 同库，不开新数据库 |
| 事件驱动更新 | 任务文档 §核心设计约束 | 文件保存时通过 `AppEventBus` 的 `file.updated` 自动重建索引 |
| Tiptap 追加式扩展 | 任务文档 §核心设计约束 | 新增 WikiLink + WikiLinkSuggest，不修改现有编辑器扩展 |
| 渲染进程通过 IPC 订阅事件 | 任务文档 §核心设计约束 | 反向链接面板通过 `window.electronAPI.events.on('wiki-links.updated')` 监听 |
| TypeScript 严格模式 | CLAUDE.md §四 | 禁止 `any`，所有新增类型必须严格 |
| IPC 安全隔离 | CLAUDE.md §四 | 渲染进程不得直接访问文件系统，通过 IPC 通信 |
| 结构化日志 | CLAUDE.md §四 | 关键操作必须有 who/what/when/result 日志 |
| 错误不可静默 | CLAUDE.md §四 | 所有异步操作必须有明确错误处理 |

### 1.3 核心交付物

| 交付物 | 文件路径 | 类型 |
|--------|---------|------|
| WikiLinks 类型定义 | `src/main/services/wiki-links/types.ts` | 新建 |
| 链接索引器 | `src/main/services/wiki-links/wiki-links-indexer.ts` | 新建 |
| 链接查询接口 | `src/main/services/wiki-links/wiki-links-store.ts` | 新建 |
| WikiLinks IPC handler | `src/main/ipc/handlers/wiki-links.ts` | 新建 |
| IPC 通道常量 | `src/shared/types.ts` | 修改（扩展） |
| Preload API | `src/preload/index.ts` | 修改（扩展） |
| Tiptap WikiLink 节点 | `src/renderer/components/editor/extensions/wiki-link.ts` | 新建 |
| Tiptap WikiLinkSuggest 扩展 | `src/renderer/components/editor/extensions/wiki-link-suggest.ts` | 新建 |
| 悬停预览 Plugin | `src/renderer/components/editor/extensions/wiki-link-preview.ts` | 新建 |
| 补全弹出组件 | `src/renderer/components/editor/WikiLinkPicker.tsx` | 新建 |
| 反向链接面板 | `src/renderer/components/editor/BacklinksPanel.tsx` | 新建 |
| 反向链接卡片 | `src/renderer/components/editor/BacklinkCard.tsx` | 新建 |
| 文档关系图谱 | `src/renderer/components/graph/KnowledgeGraph.tsx` | 新建（P1） |
| Tiptap 扩展索引 | `src/renderer/components/editor/extensions/index.ts` | 修改（导出） |
| 编辑器配置 | `src/renderer/components/editor/WysiwygEditor.tsx` | 修改（追加扩展） |
| 主进程装配 | `src/main/index.ts` | 修改（创建 Indexer/Store 实例） |
| 单元测试（主进程） | `tests/main/services/wiki-links/` | 新建 |
| 单元测试（渲染进程） | `tests/renderer/components/editor/` | 新建 |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` §二 | 文件即真相——wiki-link 在 Markdown 中保持 `[[text]]` 纯文本 | Markdown 序列化设计 |
| `CLAUDE.md` §四 | TS 严格模式禁止 `any`；结构化日志；异步错误处理 | 全局代码约束 |
| `CLAUDE.md` §四 | 主进程与渲染进程严格隔离，通过 IPC 通信 | IPC 通道 + Preload API |
| `specs/design/architecture.md` §3.2 | 进程通信架构：Renderer ↔ IPC ↔ Main | IPC 通道设计与 Preload API |
| `specs/design/architecture.md` §2.1 | 技术栈：Electron + React + TypeScript + Tiptap | 技术选型约束 |
| `specs/design/testing-and-security.md` | 测试金字塔、覆盖率 ≥ 80% | 单元测试策略 |
| `specs/requirements/phase2/sprint4-semantic-search.md` §4.6 | 双向链接验收标准 | 验收标准来源 |
| `specs/requirements/phase2/sprint4-semantic-search.md` §4.7 | 文档关系图谱验收标准 | 图谱验收标准来源 |
| `specs/tasks/phase2/phase2-task004_wiki-links-knowledge-graph.md` | 8 步技术执行路径、完整验收标准 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `tiptap-wysiwyg-editor` | Tiptap 节点扩展开发、ProseMirror Plugin、输入规则 | WikiLink 节点 + WikiLinkSuggest 扩展 + 悬停预览 Plugin |
| `sqlite-local-storage` | SQLite schema 设计、索引优化、事务控制 | `wiki_links` 表 schema + Indexer 事务重建 |
| `electron-ipc-patterns` | IPC 通道设计、类型安全接口、Preload API | `wikiLinks:getBacklinks`/`wikiLinks:getOutlinks` IPC handler |
| `typescript-strict-mode` | 严格类型设计、泛型、类型守卫 | 全局类型约束 |

### 2.3 前置代码依赖

| 模块 | 文件路径 | 关键接口 | 复用方式 |
|------|---------|---------|---------|
| `AppEventBus` | `src/main/services/event-bus.ts` | `emitEvent<T>()`、`subscribe()` | 注入 Indexer，订阅 `file.updated`/`file.deleted`/`file.renamed` |
| `SibyllaEventType` | `src/main/services/event-bus-types.ts` | `'file.updated'`/`'file.deleted'`/`'file.renamed'`/`'wiki-links.updated'` | 事件类型引用（`wiki-links.updated` 已定义在 L25） |
| `EventPayloadMap` | `src/main/services/event-bus-types.ts:87` | `'wiki-links.updated': { path: string }` | 事件 payload 类型（已预定义） |
| `DatabaseManager` | `src/main/services/database-manager.ts` | `db: Database`（better-sqlite3） | 复用同一 SQLite 实例，在 `initSchema` 中追加 `wiki_links` 表 |
| `LocalSearchEngine` | `src/main/services/local-search-engine.ts` | `search(params): SearchResult[]` | **不修改**，Indexer 仅使用 DatabaseManager 的 db 实例 |
| `search:fuzzyFiles` IPC | `src/main/ipc/handlers/unified-search.ts:58-71` | `SEARCH_FUZZY_FILES` handler | WikiLinkSuggest 调用 `window.electronAPI.search.fuzzyFiles()` |
| `FileManager` | `src/main/services/file-manager.ts` | `readFile()`、`writeFile()` | Indexer 读取文件内容；重命名时更新引用 |
| `Tiptap Editor` | `src/renderer/components/editor/WysiwygEditor.tsx:119-152` | `extensions` 数组 | 追加 WikiLink + WikiLinkSuggest 扩展 |
| `Tiptap Markdown` | `tiptap-markdown` | Markdown 序列化/反序列化 | WikiLink 节点的 Markdown 双向转换 |
| `tippy.js` | 已有依赖（Tiptap 依赖） | 弹出定位 | WikiLinkPicker 补全弹出 + 悬停预览弹出 |
| `EventIpcHandler` | `src/main/ipc/handlers/event.ts` | `subscribe`/`push` 机制 | BacklinksPanel 通过 `EVENT_PUSH` 接收 `wiki-links.updated` |
| `IPC_CHANNELS` | `src/shared/types.ts` | 已有 `EVENT_SUBSCRIBE`/`EVENT_PUSH` | 事件订阅通道（已有） |
| `IpcHandler` | `src/main/ipc/handler.ts` | `safeHandle()`、`wrapResponse()` | WikiLinks IPC handler 基类 |
| `Tracer` | `src/main/services/trace/tracer.ts` | `withSpan()` | Indexer/Store 操作 Trace（可选） |

### 2.4 被依赖关系（下游消费者）

| 下游任务 | 消费的接口 | 阻塞关系 |
|---------|-----------|----------|
| 无直接下游任务 | `WikiLinksStore.getGraphData()` 图谱数据 | 本任务自包含 |
| 后续 Sprint 扩展 | `wiki-links.updated` 事件 | 可选消费 |
| 图谱交互增强 | `KnowledgeGraph` 组件 | P1，可延后 |

---

## 三、现有代码盘点与差距分析

### 3.1 DatabaseManager 现状（`database-manager.ts`，202 行）

**已有能力：**
- `db: Database`（better-sqlite3 实例），WAL 模式，外键启用
- `initSchema()`：创建 `search_files` 表 + `files_fts` FTS5 虚拟表 + 触发器
- `indexFileContent()`：文件内容索引
- `searchFiles()`：FTS5 全文搜索
- `clearAllIndexes()`、`checkIntegrity()`、`close()`

**WikiLinks 需追加的差距：**

| 差距点 | 现状 | 需要做的 |
|--------|------|---------|
| `wiki_links` 表 | 不存在 | 在 `initSchema()` 追加 CREATE TABLE + INDEX |
| `db` 实例访问 | `private db`，无公开 getter | 需要暴露 `get db(): Database` 供 WikiLinksIndexer/Store 使用 |
| 事务控制 | 有 `indexFileContent` 内部使用 `prepare` | WikiLinksIndexer 自行使用 `db.transaction()` |

### 3.2 AppEventBus 现状（`event-bus.ts`，206 行）

**已有能力：**
- `emitEvent<T>(partial)`：发布事件，自动分配 `id`（ulid）和 `timestamp`
- `subscribe<T>(type, handler)`：订阅事件，返回取消函数
- `subscribeAny(handler)`：通配订阅
- 背压检测（100 事件/秒阈值）

**事件类型现状（`event-bus-types.ts`）：**
- `SibyllaEventType` 已包含 `'wiki-links.updated'`（L25）
- `EventPayloadMap` 已包含 `'wiki-links.updated': { path: string }`（L87）
- `file.updated` payload：`{ path: string; changes: string }`（L69）
- `file.deleted` payload：`{ path: string }`（L70）
- `file.renamed` payload：`{ oldPath: string; newPath: string }`（L71）

**结论：事件类型已预定义，无需修改 event-bus-types.ts。**

### 3.3 EventIpcHandler 现状（`event.ts`，108 行）

**已有能力：**
- `EVENT_SUBSCRIBE` / `EVENT_UNSUBSCRIBE` / `EVENT_PUSH` IPC 通道
- 渲染进程可订阅特定 `SibyllaEventType`
- 事件自动推送到已订阅的 `webContents`

**WikiLinks 使用方式：**
- BacklinksPanel 通过 `window.electronAPI.events.subscribe(['wiki-links.updated'])` 订阅
- Indexer 调用 `appEventBus.emitEvent({ type: 'wiki-links.updated', ... })` 即可推送
- **无需修改 EventIpcHandler**

### 3.4 Tiptap 编辑器现状（`WysiwygEditor.tsx`，308 行）

**已有扩展注册模式（L119-152）：**
```typescript
extensions: [
  StarterKit.configure({ ... }),
  TiptapMarkdown.configure({ ... }),
  Link.configure({ ... }),
  Placeholder.configure({ ... }),
  TaskList, TaskItem, Typography, CharacterCount,
  CodeBlockWithHighlight,
  Table, TableRow, TableCell, TableHeader,
  createSaveShortcutExtension(handleSaveShortcut),
  createSlashCommandExtension((cb) => slashCallbackRef.current(cb)),
]
```

**WikiLinks 扩展追加位置：**
- 在 `extensions` 数组末尾追加 `WikiLink`、`WikiLinkSuggest`、`WikiLinkPreview`
- 需导入新扩展
- 需注入 `onNavigate` 回调（点击 wiki-link 时打开文件）

**Markdown 序列化差距：**
- `TiptapMarkdown` 扩展已配置 `html: true, breaks: false, linkify: true`
- WikiLink 节点需要自定义 Markdown 序列化器（输出 `[[target]]` 纯文本）
- WikiLink 节点需要自定义 Markdown 解析器（识别 `[[target]]` 并转换为节点）

### 3.5 search:fuzzyFiles IPC 现状（`unified-search.ts:58-71`）

**已有能力：**
- `SEARCH_FUZZY_FILES` handler 已注册
- 接收 `query: string` + `options?: { limit?: number }`
- 返回 `Array<{ path: string; title: string }>`
- Preload API：`window.electronAPI.search.fuzzyFiles(query, options?)`

**WikiLinks 复用方式：**
- WikiLinkSuggest 直接调用 `window.electronAPI.search.fuzzyFiles(query, { limit: 10 })`
- **无需修改**

### 3.6 Preload API 现状（`preload/index.ts`，2111 行）

**已有相关命名空间：**
- `search.fuzzyFiles()` — 已有
- `events.subscribe()` / `events.unsubscribe()` — 已有
- `editor.openFile()` — 已有
- `file.read()` — 已有

**缺失：**
- `wikiLinks` 命名空间：`getBacklinks()`、`getOutlinks()`、`rebuildIndex()`
- 需在 `ALLOWED_CHANNELS` 注册新通道

### 3.7 IPC 通道常量现状（`shared/types.ts`）

**缺失的通道：**
- `WIKI_LINKS_GET_BACKLINKS: 'wikiLinks:getBacklinks'`
- `WIKI_LINKS_GET_OUTLINKS: 'wikiLinks:getOutlinks'`
- `WIKI_LINKS_REBUILD_INDEX: 'wikiLinks:rebuildIndex'`

### 3.8 不存在的文件（需新建）

| 文件 | 用途 |
|------|------|
| `src/main/services/wiki-links/types.ts` | WikiLinks 类型定义 |
| `src/main/services/wiki-links/wiki-links-indexer.ts` | 链接提取与索引更新 |
| `src/main/services/wiki-links/wiki-links-store.ts` | 链接查询接口 |
| `src/main/ipc/handlers/wiki-links.ts` | WikiLinks IPC handler |
| `src/renderer/components/editor/extensions/wiki-link.ts` | Tiptap WikiLink 节点扩展 |
| `src/renderer/components/editor/extensions/wiki-link-suggest.ts` | Tiptap 自动补全扩展 |
| `src/renderer/components/editor/extensions/wiki-link-preview.ts` | 悬停预览 Plugin |
| `src/renderer/components/editor/WikiLinkPicker.tsx` | 补全弹出组件 |
| `src/renderer/components/editor/BacklinksPanel.tsx` | 反向链接面板 |
| `src/renderer/components/editor/BacklinkCard.tsx` | 单条反向链接卡片 |
| `src/renderer/components/graph/KnowledgeGraph.tsx` | 文档关系图谱（P1） |
| `tests/main/services/wiki-links/` | 主进程测试目录 |
| `tests/renderer/components/editor/` | 渲染进程测试目录 |

### 3.9 主进程装配差距（`main/index.ts`）

**现状：** `onWorkspaceOpened` 回调中（L273-833）已初始化 DatabaseManager、LocalSearchEngine、AppEventBus、UnifiedSearchEngine 等服务。

**需追加的装配步骤：**
1. `WikiLinksIndexer` 创建（依赖 `DatabaseManager.db`、`FileManager`、`AppEventBus`）
2. `WikiLinksStore` 创建（依赖 `DatabaseManager.db`）
3. `WikiLinksHandler` IPC 注册
4. 首次启动全量索引：检测 `wiki_links` 表是否为空，空则 `rebuildAllIndex()`

---

## 四、分步实施计划

### 阶段 A：类型基础设施 + SQLite Schema（Step 1） — 预计 0.5 天

#### A1：定义 WikiLinks 类型系统

**文件：** `sibylla-desktop/src/main/services/wiki-links/types.ts`（新建）

```typescript
export interface WikiLink {
  sourcePath: string
  targetPath: string
  linkText: string
  position: number
  createdAt: string
}

export interface Backlink {
  sourcePath: string
  linkText: string
  position: number
  snippet?: string
}

export interface GraphData {
  nodes: Array<{ id: string; label: string; linkCount: number }>
  edges: Array<{ source: string; target: string }>
}

export interface ExtractedLink {
  target: string
  text: string
  position: number
}

export interface LinkCount {
  incoming: number
  outgoing: number
}
```

#### A2：扩展 DatabaseManager — 暴露 db 实例 + 追加 wiki_links 表

**文件：** `sibylla-desktop/src/main/services/database-manager.ts`（修改）

**修改点 1：** 暴露 `db` getter

```typescript
get database(): Database.Database {
  return this.db
}
```

**修改点 2：** 在 `initSchema()` 末尾追加 `wiki_links` 表创建

```sql
CREATE TABLE IF NOT EXISTS wiki_links (
  source_path TEXT NOT NULL,
  target_path TEXT NOT NULL,
  link_text TEXT NOT NULL,
  position INTEGER,
  created_at TEXT,
  PRIMARY KEY (source_path, target_path, position)
);
CREATE INDEX IF NOT EXISTS idx_wiki_target ON wiki_links(target_path);
CREATE INDEX IF NOT EXISTS idx_wiki_source ON wiki_links(source_path);
```

**设计说明：**
- `PRIMARY KEY (source_path, target_path, position)` — 允许同一源文件到同一目标文件有多个链接（不同位置）
- `idx_wiki_target` — 反向链接查询索引（`WHERE target_path = ?`）
- `idx_wiki_source` — 正向链接查询索引（`WHERE source_path = ?`）
- broken 链接用 `__broken__:` 前缀标记 `target_path`，查询时可 `LIKE '__broken__:%'` 过滤

**验证：** `npx tsc --noEmit` 类型检查通过；启动应用后 `wiki_links` 表创建成功

---

### 阶段 B：WikiLinksIndexer + WikiLinksStore（Steps 2-3） — 预计 1.5 天

#### B1：实现 WikiLinksIndexer

**文件：** `sibylla-desktop/src/main/services/wiki-links/wiki-links-indexer.ts`（新建）

**关键实现要点：**

1. **构造函数** 接收 `db: Database`、`fileManager: FileManager`、`eventBus: AppEventBus`
   - 构造函数中调用 `subscribeToEvents()`

2. **`extractLinks(content: string): ExtractedLink[]`** 方法：
   - 正则：`/\[\[([^\]]+)\]\]/g`
   - 每个匹配提取 `target`（括号内文本 trim 后的值）、`text`（等于 target）、`position`（字符偏移）
   - 支持 `[[path|显示文本]]` 语法：`|` 分割后取 `target` 和 `text`

3. **`rebuildIndexForFile(filePath: string): Promise<void>`** 方法：
   - 仅处理 `.md` 文件（`filePath.endsWith('.md')`）
   - `this.fileManager.readFile(filePath)` 读取内容
   - `extractLinks()` 提取链接
   - 事务内重建：
     ```
     DELETE FROM wiki_links WHERE source_path = ?
     逐条 INSERT INTO wiki_links (source_path, target_path, link_text, position, created_at)
     ```
   - 发布 `wiki-links.updated` 事件

4. **`subscribeToEvents()`** 方法：
   - `subscribe('file.updated')` → `rebuildIndexForFile(payload.path)`
   - `subscribe('file.deleted')` → 标记 broken：`UPDATE wiki_links SET target_path = '__broken__:' || target_path WHERE target_path = ?`（事务中）
   - `subscribe('file.renamed')` → `handleRename(payload.oldPath, payload.newPath)`

5. **`handleRename(oldPath: string, newPath: string): Promise<void>`** 方法：
   - 查询受影响的 backlinks 数量：`SELECT COUNT(*) FROM wiki_links WHERE target_path = ?`
   - 若 count > 0，通过 `BrowserWindow` 弹出确认对话框
   - 用户确认：`UPDATE wiki_links SET target_path = ? WHERE target_path = ?` + 逐个更新引用文件中 `[[]]` 文本
   - 用户取消：标记为 broken

6. **`rebuildAllIndex(): Promise<void>`** 方法：
   - 扫描 workspace 所有 `.md` 文件（`fileManager.listFiles()`）
   - 逐个调用 `rebuildIndexForFile()`
   - 日志记录进度和耗时

**关键模式参考：** Indexer 不新建 SQLite 实例，使用注入的 `db` 引用，与 `LocalSearchEngine` 共享同一连接。

**验证：** 链接提取正确；事务重建索引；事件触发正确；broken 标记正确

#### B2：实现 WikiLinksStore

**文件：** `sibylla-desktop/src/main/services/wiki-links/wiki-links-store.ts`（新建）

**关键实现要点：**

1. **构造函数** 接收 `db: Database`

2. **`getBacklinks(targetPath: string): Promise<Backlink[]>`** 方法：
   ```sql
   SELECT source_path, link_text, position FROM wiki_links
   WHERE target_path = ? ORDER BY source_path
   ```
   - 可选：附加 snippet（读取源文件 position 前后各 50 字符）

3. **`getOutlinks(sourcePath: string): Promise<WikiLink[]>`** 方法：
   ```sql
   SELECT * FROM wiki_links WHERE source_path = ? ORDER BY position
   ```

4. **`getGraphData(centerPath?: string): Promise<GraphData>`** 方法：
   - **全量模式**（无 centerPath）：
     ```sql
     SELECT DISTINCT source_path, target_path FROM wiki_links
     WHERE target_path NOT LIKE '__broken__:%'
     ```
     构建 nodes（所有出现过的路径 + linkCount）和 edges（所有链接关系）
   - **聚焦模式**（有 centerPath，2 度 BFS）：
     1. 1 度：`WHERE source_path = ?` 出链 + `WHERE target_path = ?` 入链
     2. 2 度：对 1 度节点重复查询
     3. 构建子图 nodes + edges

5. **`getLinkCount(filePath: string): LinkCount`** 方法：
   ```sql
   SELECT COUNT(*) FROM wiki_links WHERE target_path = ?  -- incoming
   SELECT COUNT(*) FROM wiki_links WHERE source_path = ?  -- outgoing
   ```

6. **`getBrokenLinks(): Promise<WikiLink[]>`** 方法：
   ```sql
   SELECT * FROM wiki_links WHERE target_path LIKE '__broken__:%'
   ```

**验证：** 查询结果正确；聚焦模式 BFS 正确；图谱数据结构符合前端渲染要求

---

### 阶段 C：WikiLinks IPC Handler + 通道扩展（Step 4） — 预计 0.5 天

#### C1：实现 WikiLinks IPC Handler

**文件：** `sibylla-desktop/src/main/ipc/handlers/wiki-links.ts`（新建）

```typescript
import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { IpcHandler } from '../handler'
import { IPC_CHANNELS } from '../../../shared/types'
import type { WikiLinksIndexer } from '../../services/wiki-links/wiki-links-indexer'
import type { WikiLinksStore } from '../../services/wiki-links/wiki-links-store'

export class WikiLinksHandler extends IpcHandler {
  readonly namespace = 'wiki-links'

  constructor(
    private readonly indexer: WikiLinksIndexer,
    private readonly store: WikiLinksStore,
  ) {
    super()
  }

  register(): void {
    ipcMain.handle(
      IPC_CHANNELS.WIKI_LINKS_GET_BACKLINKS,
      this.safeHandle(this.handleGetBacklinks.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.WIKI_LINKS_GET_OUTLINKS,
      this.safeHandle(this.handleGetOutlinks.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.WIKI_LINKS_REBUILD_INDEX,
      this.safeHandle(this.handleRebuildIndex.bind(this)),
    )
  }

  override cleanup(): void {
    ipcMain.removeHandler(IPC_CHANNELS.WIKI_LINKS_GET_BACKLINKS)
    ipcMain.removeHandler(IPC_CHANNELS.WIKI_LINKS_GET_OUTLINKS)
    ipcMain.removeHandler(IPC_CHANNELS.WIKI_LINKS_REBUILD_INDEX)
  }

  private async handleGetBacklinks(
    _event: IpcMainInvokeEvent,
    targetPath: string,
  ) {
    return this.store.getBacklinks(targetPath)
  }

  private async handleGetOutlinks(
    _event: IpcMainInvokeEvent,
    sourcePath: string,
  ) {
    return this.store.getOutlinks(sourcePath)
  }

  private async handleRebuildIndex() {
    await this.indexer.rebuildAllIndex()
    return { success: true }
  }
}
```

#### C2：扩展 IPC 通道常量

**文件：** `sibylla-desktop/src/shared/types.ts`（修改）

在 `IPC_CHANNELS` 对象中追加：
```typescript
WIKI_LINKS_GET_BACKLINKS: 'wikiLinks:getBacklinks',
WIKI_LINKS_GET_OUTLINKS: 'wikiLinks:getOutlinks',
WIKI_LINKS_REBUILD_INDEX: 'wikiLinks:rebuildIndex',
```

#### C3：扩展 Preload API

**文件：** `sibylla-desktop/src/preload/index.ts`（修改）

1. 在 `ALLOWED_CHANNELS` 白名单注册 3 个新通道
2. 在 `ElectronAPI` 接口中新增 `wikiLinks` 命名空间：
```typescript
wikiLinks: {
  getBacklinks: (path: string) => ipcRenderer.invoke('wikiLinks:getBacklinks', path),
  getOutlinks: (path: string) => ipcRenderer.invoke('wikiLinks:getOutlinks', path),
  rebuildIndex: () => ipcRenderer.invoke('wikiLinks:rebuildIndex'),
}
```

**验证：** IPC 调用链路通畅；渲染进程可查询 backlinks/outlinks

---

### 阶段 D：Tiptap WikiLink 扩展 + 自动补全 + 悬停预览（Steps 5-6） — 预计 2 天

#### D1：WikiLink Tiptap 节点扩展

**文件：** `sibylla-desktop/src/renderer/components/editor/extensions/wiki-link.ts`（新建）

**关键实现要点：**

1. **节点定义：**
   ```typescript
   import { Node, mergeAttributes } from '@tiptap/core'
   import { inputRules } from 'prosemirror-inputrules'

   export interface WikiLinkOptions {
     HTMLAttributes: Record<string, unknown>
     onNavigate: (target: string) => void
   }

   declare module '@tiptap/core' {
     interface Commands<ReturnType> {
       wikiLink: {
         setWikiLink: (attrs: { target: string; label?: string }) => ReturnType
         unsetWikiLink: () => ReturnType
       }
     }
   }
   ```

2. **`addAttributes()`：**
   ```typescript
   { target: { default: null }, label: { default: null }, broken: { default: false } }
   ```

3. **`parseHTML()`：** `[{ tag: 'a[data-wiki-link]' }]`

4. **`renderHTML()`：**
   - 正常链接：`<a data-wiki-link data-target="xxx" class="wiki-link">label</a>`
   - 损坏链接：`class="wiki-link broken"`

5. **`addInputRules()`：**
   - 正则：`/\[\[([^\]]+)\]\]$/`
   - 匹配后创建 wikiLink 节点，`target = match[1].trim()`

6. **`addProseMirrorPlugins()`：**
   - `handleClick`：检测点击目标是否 `[data-wiki-link]`，是则调用 `options.onNavigate(target)`
   - 双击选中链接文本（可选）

7. **Markdown 序列化：**
   - 序列化：`node.attrs.target` → `[[${target}]]`
   - 反序列化：保持 `[[target]]` 纯文本格式，通过输入规则在编辑器中转换

#### D2：WikiLinkSuggest 自动补全扩展

**文件：** `sibylla-desktop/src/renderer/components/editor/extensions/wiki-link-suggest.ts`（新建）

**关键实现要点：**

1. 基于 `@tiptap/suggestion` 配置：
   ```typescript
   import { Extension } from '@tiptap/core'
   import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion'
   ```

2. **Suggestion 配置：**
   - `char: '[['`
   - `startOfLine: false`
   - `items({ query })`：调用 `window.electronAPI.search.fuzzyFiles(query, { limit: 10 })`
   - `render`：创建 tippy popup + ReactRenderer(WikiLinkPicker)

3. **render 生命周期：**
   - `onStart`：创建 ReactRenderer + tippy popup
   - `onUpdate`：更新 popup 位置和 query
   - `onKeyDown`：↑/↓/Enter/ESC 键盘事件传递给 WikiLinkPicker
   - `onExit`：销毁 popup 和 component

#### D3：WikiLinkPicker 补全弹出组件

**文件：** `sibylla-desktop/src/renderer/components/editor/WikiLinkPicker.tsx`（新建）

**关键实现要点：**

1. Props：`items: Array<{ path: string; title: string }>`、`command: (item) => void`
2. 状态：`selectedIndex: number`
3. 渲染文件列表，高亮匹配部分
4. ↑/↓ 键导航（`useEffect` 监听 keyDown），Enter 确认，ESC 取消
5. 选中后调用 `command({ target: item.path, label: item.title })`

#### D4：WikiLinkPreview 悬停预览 Plugin

**文件：** `sibylla-desktop/src/renderer/components/editor/extensions/wiki-link-preview.ts`（新建）

**关键实现要点：**

1. ProseMirror Plugin：
   - `handleDOMEvents.mouseover`：检测目标是否 `[data-wiki-link]`
   - 延迟 300ms 后显示 tippy 弹出框
   - 预览内容：调用 `window.electronAPI.file.read(targetPath)` 读取前 200 字符
   - `handleDOMEvents.mouseout`：关闭预览
   - 损坏链接（`data-broken="true"`）显示"文件不存在或已被删除"

#### D5：编辑器配置修改

**文件：** `sibylla-desktop/src/renderer/components/editor/WysiwygEditor.tsx`（修改）

在 `extensions` 数组末尾追加：
```typescript
WikiLink.configure({
  onNavigate: (target) => {
    window.electronAPI.editor.openFile(target)
  },
}),
WikiLinkSuggest,
WikiLinkPreview,
```

**文件：** `src/renderer/components/editor/extensions/index.ts`（修改）

追加导出：
```typescript
export { WikiLink } from './wiki-link'
export { WikiLinkSuggest } from './wiki-link-suggest'
export { WikiLinkPreview } from './wiki-link-preview'
```

**验证：** 输入 `[[xxx]]` 自动转换为链接节点；点击跳转正确；Markdown 双向转换保持纯文本；补全弹出 < 100ms；键盘导航正确；悬停预览正确显示

---

### 阶段 E：BacklinksPanel + KnowledgeGraph + 主进程装配 + 测试（Steps 7-8） — 预计 2.5 天

#### E1：BacklinksPanel 反向链接面板

**文件：** `sibylla-desktop/src/renderer/components/editor/BacklinksPanel.tsx`（新建）

**关键实现要点：**

1. Props：`filePath: string`
2. 状态：`backlinks: Backlink[]`、`loading: boolean`
3. `useEffect([filePath])`：调用 `window.electronAPI.wikiLinks.getBacklinks(filePath)` 加载
4. `useEffect([])` 事件监听：
   ```typescript
   window.electronAPI.events.subscribe(['wiki-links.updated'])
   // 收到事件且 path 与当前文件相关时，重新加载 backlinks
   ```
5. 渲染逻辑：
   - loading → Skeleton
   - 无 backlinks → EmptyState："暂无引用此文档的页面"
   - 有 backlinks → 标题"反向链接 (N)" + BacklinkCard 列表

#### E2：BacklinkCard 组件

**文件：** `sibylla-desktop/src/renderer/components/editor/BacklinkCard.tsx`（新建）

**关键实现要点：**

1. Props：`backlink: Backlink`
2. 显示：源文件名 + 链接文本 + snippet（引用上下文）
3. 点击 → `window.electronAPI.editor.openFile(sourcePath)`
4. hover 效果：TailwindCSS `hover:bg-white/5` 过渡

#### E3：KnowledgeGraph 文档关系图谱（P1）

**文件：** `sibylla-desktop/src/renderer/components/graph/KnowledgeGraph.tsx`（新建）

**关键实现要点：**

1. **依赖安装：** `react-force-graph`（新增依赖）
2. 数据源：调用 `window.electronAPI.wikiLinks.getOutlinks` 对当前可见文件批量查询，构建邻接表
3. 节点大小 = linkCount（入链 + 出链）
4. 节点颜色 = 按目录前缀分组（使用 d3 scale ordinal 配色）
5. 边方向 = 箭头指示 source → target
6. 交互功能：
   - 缩放和拖拽（react-force-graph 内置）
   - 点击节点 → 显示文件预览弹出框 + 入链/出链列表
   - 搜索框：输入路径前缀过滤节点
   - 聚焦视图切换按钮（全量 / 2 度聚焦）
7. **聚焦模式：** workspace > 500 文件时自动切换为以当前文件为中心的 2 度关联视图
8. **命令注册：** 在 `CommandRegistry` 中注册 `graph:open` 命令

#### E4：主进程装配

**文件：** `sibylla-desktop/src/main/index.ts`（修改）

在 `onWorkspaceOpened` 回调中，`UnifiedSearchEngine` 初始化之后（约 L681），追加：

```typescript
// ── Phase2-TASK004: Initialize WikiLinks system ──
const { WikiLinksIndexer } = await import('./services/wiki-links/wiki-links-indexer')
const { WikiLinksStore } = await import('./services/wiki-links/wiki-links-store')
const { WikiLinksHandler } = await import('./ipc/handlers/wiki-links')

const wikiLinksIndexer = new WikiLinksIndexer(
  databaseManager.database,
  fileManager,
  appEventBus,
)
const wikiLinksStore = new WikiLinksStore(databaseManager.database)

const wikiLinksHandler = new WikiLinksHandler(wikiLinksIndexer, wikiLinksStore)
ipcManager.registerHandler(wikiLinksHandler)

// First-run: rebuild all index if wiki_links table is empty
const linkCount = databaseManager.database
  .prepare('SELECT COUNT(*) as count FROM wiki_links')
  .get() as { count: number }
if (linkCount.count === 0) {
  wikiLinksIndexer.rebuildAllIndex().catch((err: unknown) => {
    logger.error('[Main] WikiLinks initial index rebuild failed', { error: String(err) })
  })
}
```

#### E5：单元测试

**`tests/main/services/wiki-links/wiki-links-indexer.test.ts`：**

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | `extractLinks()` 基础提取 | `[[b]]` → `{ target: 'b', text: 'b', position }` |
| 2 | `extractLinks()` 多链接 | `[[a]] text [[b]]` → 2 个结果 |
| 3 | `extractLinks()` 显示文本 | `[[path\|label]]` → `{ target: 'path', text: 'label' }` |
| 4 | `extractLinks()` 空内容 | 空字符串 → `[]` |
| 5 | `rebuildIndexForFile()` 索引重建 | 文件内容变更后索引正确更新 |
| 6 | `rebuildIndexForFile()` 非 .md 跳过 | `.json` 文件不建索引 |
| 7 | `file.updated` 事件触发索引更新 | 模拟事件触发后索引更新 |
| 8 | `file.deleted` 事件 broken 标记 | 删除后 target_path 前缀 `__broken__:` |
| 9 | `handleRename()` 用户确认 | backlink target_path 更新 |
| 10 | `handleRename()` 用户取消 | backlink 标记为 broken |
| 11 | `rebuildAllIndex()` 全量重建 | 多文件全部索引正确 |

**`tests/main/services/wiki-links/wiki-links-store.test.ts`：**

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | `getBacklinks()` 查询 | 返回引用指定文件的所有源文件 |
| 2 | `getOutlinks()` 查询 | 返回指定文件的所有出链 |
| 3 | `getGraphData()` 全量 | 正确构建 nodes + edges |
| 4 | `getGraphData(centerPath)` 聚焦 | 2 度 BFS 扩展正确 |
| 5 | `getLinkCount()` 计数 | incoming + outgoing 数值正确 |
| 6 | `getBrokenLinks()` 查询 | 返回所有 `__broken__:` 前缀链接 |

**`tests/renderer/components/editor/wiki-link.test.tsx`：**

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | WikiLink 节点渲染 | 正常链接蓝色样式 |
| 2 | 输入规则转换 | 输入 `[[xxx]]` 自动创建节点 |
| 3 | 点击跳转 mock | 调用 `onNavigate` 回调 |
| 4 | 损坏链接样式 | `broken: true` → 红色 + 虚线 |

**`tests/renderer/components/editor/wiki-link-suggest.test.tsx`：**

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 补全弹出和关闭 | `[[` 触发弹出，ESC 关闭 |
| 2 | 键盘导航 | ↑/↓ 切换选中项 |
| 3 | 选中插入 | Enter 确认后插入 wikiLink 节点 |

**`tests/renderer/components/editor/backlinks-panel.test.tsx`：**

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 渲染和空状态 | 无 backlinks 时显示空状态文案 |
| 2 | 列表渲染 | 有 backlinks 时渲染 BacklinkCard 列表 |
| 3 | 事件刷新 | mock `wiki-links.updated` 事件触发重新查询 |
| 4 | 点击跳转 | 点击 BacklinkCard 调用 `openFile` |

**覆盖率目标：** ≥ 80%

---

## 五、验收标准追踪

### WikiLink 输入与渲染

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 输入 `[[xxx]]` 自动转换为 wiki-link 节点 | D1 `addInputRules` | E5-renderer-2 |
| 2 | Markdown 源码保持 `[[file-path]]` 纯文本 | D1 Markdown 序列化 | E5-renderer-2 |
| 3 | 节点包含 target/label/broken 属性 | D1 `addAttributes` | E5-renderer-1 |
| 4 | 损坏链接红色样式 + 虚线下划线 | D1 `renderHTML` broken class | E5-renderer-4 |
| 5 | 正常链接蓝色样式 + 实线下划线 | D1 `renderHTML` wiki-link class | E5-renderer-1 |

### 自动补全

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | `[[` 触发 100ms 内弹出补全列表 | D2 Suggestion char | E5-suggest-1 |
| 2 | 基于 `search:fuzzyFiles` 模糊匹配 | D2 `items()` | E5-suggest-1 |
| 3 | 选中后插入 `[[file-path]]` 并关闭 | D3 `command()` | E5-suggest-3 |
| 4 | ↑/↓/Enter/ESC 键盘导航 | D2/D3 onKeyDown | E5-suggest-2 |

### 点击跳转

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 点击正常链接打开目标文件 | D1 `handleClick` + `onNavigate` | E5-renderer-3 |
| 2 | 点击损坏链接不跳转 + 提示 | D1 `handleClick` broken check | E5-renderer-4 |

### 悬停预览

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 悬停 300ms 后显示预览 | D4 mouseover + setTimeout | 手动验证 |
| 2 | 预览内容为前 200 字符 | D4 file.read + slice | 手动验证 |
| 3 | 损坏链接显示"文件不存在" | D4 broken check | 手动验证 |

### 链接索引

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | `wiki_links` 表正确创建 | A2 schema | 集成验证 |
| 2 | 索引包含正确字段 | A2 schema | 集成验证 |
| 3 | 文件保存后 1 秒内索引重建 | B1 `rebuildIndexForFile` | E5-indexer-5 |
| 4 | 先删后插事务策略 | B1 事务 | E5-indexer-5 |
| 5 | 仅 .md 文件建立索引 | B1 `.md` 检查 | E5-indexer-6 |

### 损坏链接检测

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 文件删除后链接标记 broken | B1 `file.deleted` handler | E5-indexer-8 |
| 2 | 编辑器正确渲染红色损坏链接 | D1 renderHTML | E5-renderer-4 |

### 文件重命名处理

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 弹出确认对话框 | B1 `handleRename` | E5-indexer-9 |
| 2 | 确认后批量更新 backlink | B1 UPDATE + replaceInFile | E5-indexer-9 |
| 3 | 取消后标记 broken | B1 broken 前缀 | E5-indexer-10 |

### 反向链接面板

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 侧边栏显示反向链接面板 | E1 BacklinksPanel | E5-panel-1 |
| 2 | 100ms 内返回结果 | C1 IPC + B2 query | 性能测试 |
| 3 | 显示源文件路径 + 链接文本 + 位置 | E2 BacklinkCard | E5-panel-2 |
| 4 | 点击跳转源文件 | E2 openFile | E5-panel-4 |
| 5 | 空状态文案 | E1 EmptyState | E5-panel-1 |
| 6 | 事件实时刷新 | E1 subscribe | E5-panel-3 |

### 文档关系图谱（P1）

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | < 500 节点 1 秒渲染 | E3 react-force-graph | 性能测试 |
| 2 | 节点可缩放拖拽 | E3 内置交互 | 手动验证 |
| 3 | 点击节点显示预览 | E3 onClick | 手动验证 |
| 4 | > 500 文件聚焦视图 | B2 centerPath BFS | 手动验证 |

---

## 六、风险与缓解

| # | 风险 | 影响 | 概率 | 缓解策略 |
|---|------|------|------|---------|
| 1 | **DatabaseManager.db 为 private** — 需要暴露 db 实例给 Indexer/Store | 低 | 低 | 新增 `get database()` getter，不破坏封装性 |
| 2 | **Tiptap Markdown 序列化兼容** — WikiLink 节点的 `[[text]]` 格式可能与 tiptap-markdown 冲突 | 中 | 中 | 在 WikiLink 扩展中显式注册 `serializeMarkdown` / `parseMarkdown`，优先级高于通用规则 |
| 3 | **@tiptap/suggestion 依赖版本** — 项目可能未安装 `@tiptap/suggestion` | 中 | 低 | 检查 package.json，若缺失则 `npm install @tiptap/suggestion` |
| 4 | **react-force-graph 新增依赖** — P1 图谱引入新包体积 | 低 | 中 | 使用动态 import 懒加载，不影响核心双向链接功能 |
| 5 | **文件重命名批量更新引用文件** — 逐个打开文件替换 `[[]]` 文本可能耗时 | 中 | 中 | 限制批量更新为 50 文件以内，超出则提示用户手动更新；异步执行不阻塞 UI |
| 6 | **全量索引首次启动耗时** — 大 workspace 数千 .md 文件的全量索引 | 中 | 中 | 后台异步执行，不阻塞 workspace 打开；记录进度日志；增量更新后续文件 |
| 7 | **正则提取边界情况** — `[[a[[b]]c]]` 嵌套括号、`[[]]` 空链接 | 低 | 中 | 使用非贪婪匹配 `[^\]]+`，空链接忽略不建索引 |
| 8 | **tippy.js 弹出层 z-index 冲突** — WikiLinkPicker 弹出可能与 SlashCommandMenu 重叠 | 低 | 低 | WikiLinkPicker 和 SlashCommandMenu 互斥——输入 `[[` 时不会触发 `/`；z-index 设为 100 |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 | 验证方式 |
|----|------|--------|---------|
| Day 1 上午 | A1-A2 | `types.ts` + DatabaseManager 扩展 | `npx tsc --noEmit` 通过 |
| Day 1 下午 | B1 | `WikiLinksIndexer` 完成 | E5-indexer-1~6 单元测试 |
| Day 2 上午 | B2 | `WikiLinksStore` 完成 | E5-store-1~6 单元测试 |
| Day 2 下午 | C1-C3 | IPC handler + 通道扩展 + Preload API | IPC 调用链路验证 |
| Day 3 上午 | D1 | WikiLink Tiptap 节点扩展 | 输入规则 + 渲染验证 |
| Day 3 下午 | D2-D3 | WikiLinkSuggest + WikiLinkPicker | 补全弹出 + 键盘导航验证 |
| Day 4 上午 | D4-D5 | WikiLinkPreview + 编辑器配置修改 | 悬停预览 + 集成验证 |
| Day 4 下午 | E1-E2 | BacklinksPanel + BacklinkCard | 面板渲染 + 事件刷新验证 |
| Day 5 上午 | E3 | KnowledgeGraph 图谱（P1） | 图谱渲染验证 |
| Day 5 下午 | E4 | 主进程装配 + 首次全量索引 | 集成验证 |
| Day 6 | E5 | 全部单元测试通过 | `npx vitest run` 覆盖率 ≥ 80% |

### 关键里程碑

| 里程碑 | 时间点 | 判定标准 |
|--------|--------|---------|
| M1: 类型与 Schema 就绪 | Day 1 结束 | `WikiLink` 类型 + `wiki_links` 表创建，`tsc --noEmit` 通过 |
| M2: 索引与查询可用 | Day 2 结束 | Indexer + Store 单元测试全部通过 |
| M3: IPC 链路通畅 | Day 2 结束 | 渲染进程可查询 backlinks/outlinks |
| M4: Tiptap 扩展交付 | Day 4 结束 | 输入/补全/预览/跳转全部工作 |
| M5: UI 全量交付 | Day 5 结束 | 反向链接面板 + 图谱全部工作 |
| M6: 全量验收通过 | Day 6 结束 | 所有单元测试通过，覆盖率 ≥ 80% |

---

**文档版本**: v1.0
**最后更新**: 2026-04-28
**维护者**: Sibylla 架构团队

