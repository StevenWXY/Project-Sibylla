# 双向链接系统与文档关系图谱

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK004 |
| **任务标题** | 双向链接系统与文档关系图谱 |
| **所属阶段** | Phase 2 - 跨源数据统一与上下文引擎 v2 (Sprint 4) |
| **优先级** | P0 (双向链接) + P1 (图谱) |
| **复杂度** | 非常复杂 |
| **预估工时** | 5-6 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

在 Tiptap 编辑器中实现 `[[wiki-link]]` 双向链接系统和文档关系图谱。用户在编辑文档时输入 `[[` 即可引用其他文档，系统维护双向链接索引，提供自动补全、悬停预览、反向链接面板。文件保存后自动更新链接索引（通过事件总线）。文档关系图谱可视化展示工作区的知识网络结构。

### 背景

Sprint 1 构建了 Tiptap WYSIWYG 编辑器，支持 Markdown 双向转换。Sprint 3 实现了 `LocalSearchEngine`（FTS5 全文搜索），可提供文件名模糊匹配。TASK001 扩展了 `AppEventBus`，支持 `file.updated`/`file.deleted`/`file.renamed` 事件。TASK002 实现了 `search:fuzzyFiles` IPC 通道，可用于 wiki-link 补全。

当前编辑器中的文档是孤立的——用户无法建立文档间的引用关系，无法发现"哪些文档引用了当前文档"，无法可视化工作区的知识结构。

**核心设计约束：**

1. **文件即真相**：`[[wiki-link]]` 在 Markdown 源码中保持纯文本格式（无 HTML），不破坏 Markdown 兼容性
2. **链接索引复用现有 SQLite**：与 `LocalSearchEngine` 同库，不开新数据库
3. **事件驱动更新**：文件保存时通过事件总线（`file.updated`）自动重建链接索引
4. **Tiptap 追加式扩展**：新增 `WikiLink` + `WikiLinkSuggest` 扩展，不修改现有编辑器扩展
5. **渲染进程通过 IPC 订阅事件**：反向链接面板通过 `window.electronAPI.events.on('wiki-links.updated')` 监听
6. **图谱 P1 优先级**：核心双向链接（P0）必须完成，图谱可视化（P1）尽量完成
7. **聚焦视图降级**：workspace > 500 文件时自动切换为"以当前文件为中心"的 2 度关联视图

### 范围

**包含：**

- SQLite `wiki_links` 表 schema 与索引
- `WikiLinksIndexer` — 链接提取、索引重建、事件订阅
- `WikiLinksStore` — 链接查询接口（正向/反向/图谱数据）
- Tiptap `WikiLink` 节点扩展（`[[link]]` 输入规则 + 渲染 + 点击跳转）
- Tiptap `WikiLinkSuggest` 自动补全扩展（`[[` 触发 + 文件名模糊匹配）
- `WikiLinkPicker` 补全弹出组件
- `BacklinksPanel` — 反向链接侧边栏面板
- `BacklinkCard` — 单条反向链接卡片
- 悬停预览（目标文件前 200 字符）
- 损坏链接检测（目标文件不存在时红色样式）
- 文件重命名时 backlinks 更新提示
- IPC handler（wiki-links 通道）
- `KnowledgeGraph` 图谱面板（P1，基于 d3-force 或 react-force-graph）
- 图谱聚焦视图（> 500 节点时）
- 单元测试

**不包含：**

- Tiptap 编辑器核心修改（Sprint 1）
- `LocalSearchEngine` 修改（Sprint 3）
- `AppEventBus` 修改（TASK001）
- 统一搜索引擎修改（TASK002）
- `search:fuzzyFiles` IPC 实现（TASK002 已提供）

## 依赖关系

### 前置依赖

- [x] PHASE2-TASK001 — 事件总线基础设施扩展（消费 `file.updated`/`file.deleted`/`file.renamed` 事件）
- [x] PHASE2-TASK002 — 跨源统一搜索引擎与搜索 UI（复用 `search:fuzzyFiles` IPC）
- [x] PHASE1-TASK001 — 文件树浏览器与文件操作（编辑器基础设施）
- [x] PHASE1-TASK002 — WYSIWYG Markdown 编辑器（Tiptap 集成）
- [x] PHASE1-TASK015 — 本地全文搜索（SQLite 数据库实例共享）

### 被依赖任务

- 无（本任务自包含，图谱数据可供后续 Sprint 扩展）

## 参考文档

- [`specs/requirements/phase2/sprint4-semantic-search.md`](../../requirements/phase2/sprint4-semantic-search.md) — 需求 4.6 + 4.7
- [`specs/requirements/phase1/sprint1-editor-filesystem.md`](../../requirements/phase1/sprint1-editor-filesystem.md) — Tiptap 编辑器设计
- [`specs/design/architecture.md`](../../design/architecture.md) — 进程通信架构
- [`CLAUDE.md`](../../../CLAUDE.md) — 文件即真相、本地优先
- `.kilocode/skills/phase0/tiptap-wysiwyg-editor/SKILL.md` — Tiptap 扩展开发
- `.kilocode/skills/phase1/sqlite-local-storage/SKILL.md` — SQLite 索引设计

## 验收标准

### WikiLink 输入与渲染

- [ ] 用户在编辑器中输入 `[[xxx]]` 时，自动转换为 wiki-link 节点（蓝色链接样式）
- [ ] wiki-link 节点在 Markdown 源码中保持 `[[file-path]]` 纯文本格式（无 HTML）
- [ ] wiki-link 节点包含 `target`、`label`、`broken` 三个属性
- [ ] 损坏链接（目标文件不存在）渲染为红色样式 + 虚线下划线
- [ ] 正常链接渲染为蓝色样式 + 实线下划线

### 自动补全

- [ ] 用户输入 `[[` 时，100ms 内弹出文件名补全列表
- [ ] 补全列表基于 `search:fuzzyFiles` IPC 模糊匹配
- [ ] 用户选中文件后，插入 `[[file-path]]` 并关闭补全
- [ ] 补全列表支持 ↑/↓ 键导航 + Enter 确认 + ESC 取消
- [ ] `ESC` 或无匹配结果时关闭补全弹出框

### 点击跳转

- [ ] 用户点击正常链接时，在编辑器新 Tab 中打开目标文件
- [ ] 用户点击损坏链接时，不跳转，显示"目标文件不存在"提示
- [ ] 点击行为通过 Tiptap ProseMirror Plugin 的 `handleClick` 实现

### 悬停预览

- [ ] 鼠标悬停链接时，300ms 后显示预览弹出框
- [ ] 预览内容为目标文件前 200 字符
- [ ] 预览弹出框在鼠标移开后关闭
- [ ] 损坏链接悬停显示"文件不存在或已被删除"

### 链接索引

- [ ] `wiki_links` 表正确创建，包含 `source_path`/`target_path`/`link_text`/`position`/`created_at`
- [ ] `idx_target`（target_path）和 `idx_source`（source_path）索引创建
- [ ] 文件保存后 1 秒内完成该文件的出链索引重建
- [ ] 索引重建采用"先删后插"策略（DELETE + INSERT 在事务中）
- [ ] 仅对 `.md` 文件建立链接索引

### 损坏链接检测

- [ ] 文件删除后，指向该文件的链接标记为 broken（target_path 前缀 `__broken__:`）
- [ ] 编辑器打开含损坏链接的文件时，损坏链接渲染为红色
- [ ] 链接索引查询时自动识别 broken 状态

### 文件重命名处理

- [ ] 文件重命名时，弹出提示"是否更新所有引用此文件的链接？"
- [ ] 用户确认后，批量更新所有 backlink 的 target_path
- [ ] 用户取消后，链接标记为 broken
- [ ] 重命名事件通过 `file.renamed` 事件总线触发

### 反向链接面板

- [ ] 编辑器侧边栏显示"反向链接"面板
- [ ] 面板列出所有引用当前文件的其他文件，100ms 内返回结果
- [ ] 每条反向链接显示：源文件路径 + 链接文本 + 位置
- [ ] 点击反向链接跳转到源文件对应位置
- [ ] 当前文件无反向链接时显示"暂无引用此文档的页面"空状态
- [ ] 面板通过 IPC 事件桥接实时刷新（监听 `wiki-links.updated`）

### 文档关系图谱（P1）

- [ ] "关系图谱"命令打开图谱面板，< 500 节点时 1 秒内渲染完成
- [ ] 节点为文档，边为链接关系，可缩放和拖拽
- [ ] 点击节点显示文件预览和出链/入链列表
- [ ] 支持按路径前缀/标签过滤，实时更新图谱
- [ ] workspace > 500 文件时自动切换为"聚焦视图"（当前文件为中心，2 度关联）
- [ ] 无连接的文件簇在视觉上分离
- [ ] 节点位置可 pin，跨会话保持（可选）

### 单元测试

- [ ] `WikiLinksIndexer.extractLinks()` 链接提取测试
- [ ] `WikiLinksIndexer` 文件保存→索引更新测试
- [ ] `WikiLinksIndexer` 文件删除→broken 标记测试
- [ ] `WikiLinksStore.getBacklinks()` 查询测试
- [ ] `WikiLinksStore.getOutlinks()` 查询测试
- [ ] `WikiLinksStore.getGraphData()` 图谱数据测试
- [ ] WikiLink Tiptap 输入规则测试
- [ ] WikiLinkSuggest 补全交互测试
- [ ] BacklinksPanel 渲染和事件刷新测试
- [ ] 文件重命名 backlink 更新测试
- [ ] 覆盖率 ≥ 80%

## 技术策略

### 核心架构：事件驱动索引 + Tiptap 扩展 + IPC 桥接

```
用户在编辑器中输入 [[auth-design]]
        │
        ├── WikiLinkSuggest 扩展检测到 "[["
        │   └── 调用 search:fuzzyFiles IPC 获取匹配文件列表
        │       └── 弹出 WikiLinkPicker 补全框
        │           └── 用户选择 → 插入 [[auth-design]] 节点
        │
        ├── 用户保存文件 (Ctrl+S)
        │   │
        │   ▼ 主进程
        │   FileManager.writeFile()
        │   AutoSaveManager.commit()
        │   AppEventBus.emitEvent({ type: 'file.updated', payload: { path } })
        │       │
        │       ▼
        │   WikiLinksIndexer (订阅 file.updated)
        │       ├── 读取文件内容
        │       ├── extractLinks() → 正则匹配所有 [[xxx]]
        │       ├── DELETE + INSERT 事务重建出链
        │       └── emitEvent({ type: 'wiki-links.updated', payload: { linksTo } })
        │           │
        │           ▼ 渲染进程 (IPC 事件桥接)
        │       BacklinksPanel 收到 wiki-links.updated 事件
        │           └── 重新查询 getBacklinks() → 更新面板
        │
        └── 用户悬停 [[auth-design]]
            └── 显示预览弹出框（前 200 字符）
```

### 链接索引数据流

```
SQLite wiki_links 表:
    source_path | target_path | link_text | position | created_at
    ─────────────────────────────────────────────────────────────
    docs/a.md   | docs/b.md   | b         | 42       | 2026-04-27
    docs/a.md   | docs/c.md   | c         | 80       | 2026-04-27
    docs/b.md   | docs/a.md   | a         | 15       | 2026-04-27

查询模式:
    getBacklinks('docs/a.md')
        → SELECT * FROM wiki_links WHERE target_path = 'docs/a.md'
        → 返回 [docs/b.md] (反向引用)

    getOutlinks('docs/a.md')
        → SELECT * FROM wiki_links WHERE source_path = 'docs/a.md'
        → 返回 [docs/b.md, docs/c.md] (正向引用)

    getGraphData()
        → SELECT source_path, target_path FROM wiki_links
        → 构建邻接表 { nodes, edges }
```

### Tiptap 扩展架构

```
Tiptap Editor (Sprint 1，不修改)
    │
    ├── 现有扩展（不修改）:
    │   ├── StarterKit
    │   ├── MarkdownSerializer
    │   ├── Placeholder
    │   └── ...
    │
    └── 新增扩展（追加）:
        ├── WikiLink (Node)
        │   ├── inline: true
        │   ├── group: 'inline'
        │   ├── attributes: { target, label, broken }
        │   ├── parseHTML: a[data-wiki-link]
        │   ├── renderHTML: <a data-wiki-link class="wiki-link">
        │   ├── addInputRules: /\[\[([^\]]+)\]\]/ → 创建节点
        │   └── addProseMirrorPlugins: handleClick → openFile
        │
        └── WikiLinkSuggest (Extension, 基于 @tiptap/suggestion)
            ├── char: '[['
            ├── items: → search:fuzzyFiles IPC
            └── render: → tippy popup + WikiLinkPicker React 组件
```

### 文件重命名 Backlink 更新流程

```
用户在文件树中重命名 docs/a.md → docs/auth.md
    │
    ▼ 主进程
AppEventBus.emitEvent({ type: 'file.renamed', payload: { oldPath, newPath } })
    │
    ▼
WikiLinksIndexer (订阅 file.renamed)
    │
    ├── 查询所有 target_path = 'docs/a.md' 的 backlinks
    │   → SELECT source_path FROM wiki_links WHERE target_path = 'docs/a.md'
    │
    ├── 通过 IPC 弹出确认对话框:
    │   "docs/auth.md 被重命名，是否更新 X 个文档中的引用？"
    │
    ├── 用户确认:
    │   ├── UPDATE wiki_links SET target_path = 'docs/auth.md' WHERE target_path = 'docs/a.md'
    │   └── 逐个打开引用文件 → 更新 [[a]] 为 [[auth]]（通过 FileManager.replaceInFile）
    │
    └── 用户取消:
        └── UPDATE wiki_links SET target_path = '__broken__:docs/a.md' WHERE target_path = 'docs/a.md'
```

### 图谱数据构建策略

```
getGraphData():
    ├── 小规模 (≤ 500 文件):
    │   └── 全量查询 wiki_links → 构建完整邻接表
    │       nodes = workspace 中所有 .md 文件
    │       edges = wiki_links 表所有行
    │
    └── 大规模 (> 500 文件，聚焦视图):
        ├── 选定中心节点（当前打开的文件）
        ├── BFS 2 度扩展:
        │   ├── 1 度: 目标文件的直接出链和入链
        │   └── 2 度: 1 度节点的出链和入链
        └── 仅渲染扩展范围内的节点和边

图谱布局:
    ├── 力导向图 (force-directed layout)
    ├── d3-force 或 react-force-graph
    ├── 节点大小 = 链接数（入链 + 出链）
    └── 边方向 = 源 → 目标（箭头指示）
```

### 依赖库选型

| 用途 | 库 | 说明 |
|------|-----|------|
| 自动补全弹出 | `tippy.js`（已有，Tiptap 依赖） | 定位弹出框 |
| 链接正则提取 | 内置 `RegExp` | `/\[\[([^\]]+)\]\]/g` |
| 图谱可视化 | `react-force-graph`（新增） | React 友好的力导向图 |
| 图谱交互 | `d3-zoom`（react-force-graph 内置） | 缩放和拖拽 |

## 技术执行路径

### 步骤 1：定义 wiki-links 类型与 SQLite schema

**文件：** `src/main/services/wiki-links/types.ts`（新建）

1. 定义 `WikiLink` 接口：
   ```typescript
   export interface WikiLink {
     sourcePath: string
     targetPath: string
     linkText: string
     position: number
     createdAt: string
   }
   ```

2. 定义 `Backlink` 接口：
   ```typescript
   export interface Backlink {
     sourcePath: string
     linkText: string
     position: number
     snippet?: string   // 引用上下文（前后各 50 字符）
   }
   ```

3. 定义 `GraphData` 接口：
   ```typescript
   export interface GraphData {
     nodes: Array<{ id: string; label: string; linkCount: number }>
     edges: Array<{ source: string; target: string }>
   }
   ```

4. 定义 `ExtractedLink` 内部接口（解析中间结果）：
   ```typescript
   export interface ExtractedLink {
     target: string
     text: string
     position: number
   }
   ```

**文件：** SQLite migration（新建或追加）

5. 创建 `wiki_links` 表：
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

**验证：** TypeScript 类型正确；SQL migration 在现有 SQLite 实例上执行成功

### 步骤 2：实现 WikiLinksIndexer 链接提取与索引更新

**文件：** `src/main/services/wiki-links/wiki-links-indexer.ts`（新建）

1. 实现 `WikiLinksIndexer` 类：
   - 构造函数接收 `db: Database`（better-sqlite3）、`fileManager: FileManager`、`eventBus: AppEventBus`
   - 构造函数中调用 `subscribeToEvents()`

2. 实现 `extractLinks(content: string): ExtractedLink[]` 方法：
   - 正则表达式：`/\[\[([^\]]+)\]\]/g`
   - 对每个匹配，提取 target（括号内文本）和 position（字符偏移）
   - linkText 默认等于 target（可后续扩展为 `[[path|显示文本]]` 语法）

3. 实现 `rebuildIndexForFile(filePath: string): Promise<void>` 方法：
   - 仅处理 `.md` 文件
   - 读取文件内容：`this.fileManager.readFile(filePath)`
   - 调用 `extractLinks()` 提取链接
   - 事务内重建：
     - `DELETE FROM wiki_links WHERE source_path = ?`
     - 逐条 `INSERT INTO wiki_links ...`
   - 发布 `wiki-links.updated` 事件

4. 实现 `subscribeToEvents()` 方法：
   - 订阅 `file.updated`：调用 `rebuildIndexForFile()`
   - 订阅 `file.deleted`：标记 broken 链接（`UPDATE wiki_links SET target_path = '__broken__:' || target_path WHERE target_path = ?`）
   - 订阅 `file.renamed`：处理 backlink 更新（弹出确认框 → 批量更新或标记 broken）

5. 实现 `handleRename(oldPath: string, newPath: string): Promise<void>` 方法：
   - 查询受影响的 backlinks 数量
   - 通过 IPC 弹出确认对话框（复用现有 dialog 机制）
   - 确认：更新 `wiki_links` 表 + 逐个更新引用文件中的 `[[]]` 文本
   - 取消：标记为 broken

6. 实现 `rebuildAllIndex(): Promise<void>` 方法（手动重建入口）：
   - 扫描 workspace 所有 `.md` 文件
   - 逐个调用 `rebuildIndexForFile()`

**验证：** 链接提取正确；索引更新在事务中完成；事件触发正确

### 步骤 3：实现 WikiLinksStore 查询接口

**文件：** `src/main/services/wiki-links/wiki-links-store.ts`（新建）

1. 实现 `WikiLinksStore` 类：
   - 构造函数接收 `db: Database`

2. 实现 `getBacklinks(targetPath: string): Promise<Backlink[]>` 方法：
   - `SELECT source_path, link_text, position FROM wiki_links WHERE target_path = ? ORDER BY source_path`
   - 可选：附加 snippet（读取源文件 position 前后各 50 字符）

3. 实现 `getOutlinks(sourcePath: string): Promise<WikiLink[]>` 方法：
   - `SELECT * FROM wiki_links WHERE source_path = ? ORDER BY position`

4. 实现 `getGraphData(centerPath?: string): Promise<GraphData>` 方法：
   - 无 centerPath（全量模式）：
     - `SELECT DISTINCT source_path, target_path FROM wiki_links WHERE target_path NOT LIKE '__broken__:%'`
     - 构建 nodes（所有出现过的路径）和 edges（所有链接关系）
     - nodes 附加 linkCount 属性
   - 有 centerPath（聚焦模式，2 度 BFS）：
     - 1 度：`SELECT target_path FROM wiki_links WHERE source_path = ?` + `SELECT source_path FROM wiki_links WHERE target_path = ?`
     - 2 度：对 1 度节点重复查询
     - 构建子图

5. 实现 `getLinkCount(filePath: string): { incoming: number; outgoing: number }` 方法：
   - 两条 COUNT 查询

6. 实现 `getBrokenLinks(): Promise<WikiLink[]>` 方法（诊断用）：
   - `SELECT * FROM wiki_links WHERE target_path LIKE '__broken__:%'`

**验证：** 查询结果正确；聚焦模式 BFS 正确；图谱数据结构符合前端渲染要求

### 步骤 4：实现 WikiLinks IPC handler

**文件：** `src/main/ipc/handlers/wiki-links.ts`（新建）

1. 注册 `wikiLinks:getBacklinks` handler：
   - 接收 `targetPath: string`
   - 调用 `wikiLinksStore.getBacklinks(targetPath)`

2. 注册 `wikiLinks:getOutlinks` handler：
   - 接收 `sourcePath: string`
   - 调用 `wikiLinksStore.getOutlinks(sourcePath)`

3. 注册 `wikiLinks:rebuildIndex` handler：
   - 调用 `wikiLinksIndexer.rebuildAllIndex()`

**文件：** `src/shared/types.ts`（修改，扩展）

4. 新增 IPC 通道常量：
   ```typescript
   WIKI_LINKS_GET_BACKLINKS: 'wikiLinks:getBacklinks',
   WIKI_LINKS_GET_OUTLINKS: 'wikiLinks:getOutlinks',
   WIKI_LINKS_REBUILD_INDEX: 'wikiLinks:rebuildIndex',
   ```

**文件：** `src/preload/index.ts`（修改，扩展）

5. 新增 `wikiLinks` 命名空间：
   ```typescript
   wikiLinks: {
     getBacklinks: (path) => ipcRenderer.invoke('wikiLinks:getBacklinks', path),
     getOutlinks: (path) => ipcRenderer.invoke('wikiLinks:getOutlinks', path),
     rebuildIndex: () => ipcRenderer.invoke('wikiLinks:rebuildIndex'),
   }
   ```

**验证：** IPC 调用链路通畅；渲染进程可查询 backlinks/outlinks

### 步骤 5：实现 WikiLink Tiptap 扩展

**文件：** `src/renderer/components/editor/extensions/wiki-link.ts`（新建）

1. 定义 `WikiLink` Node 扩展：
   - `name: 'wikiLink'`
   - `inline: true`、`group: 'inline'`
   - `addAttributes()`: 返回 `{ target: { default: null }, label: { default: null }, broken: { default: false } }`

2. 实现 `parseHTML()`：
   - `[{ tag: 'a[data-wiki-link]' }]`

3. 实现 `renderHTML()`：
   - 正常链接：`<a data-wiki-link data-target="xxx" class="wiki-link">label</a>`
   - 损坏链接：`class="wiki-link broken"`

4. 实现 `addInputRules()`：
   - 正则：`/\[\[([^\]]+)\]\]/`
   - 匹配后创建 wikiLink 节点，target = match[1].trim()

5. 实现 `addProseMirrorPlugins()`：
   - `handleClick`：检测点击目标是否 `[data-wiki-link]`，是则调用 `window.electronAPI.editor.openFile(path)`
   - `handleDoubleClick`：（可选）双击选中链接文本

6. Markdown 序列化（与 Sprint 1 的 MarkdownSerializer 集成）：
   - 序列化时输出 `[[target]]` 纯文本
   - 反序列化时保持 `[[target]]` 不变

**验证：** 输入 `[[xxx]]` 自动转换为链接节点；点击跳转正确；Markdown 双向转换保持纯文本

### 步骤 6：实现 WikiLinkSuggest 自动补全 + WikiLinkPicker + 悬停预览

**文件：** `src/renderer/components/editor/extensions/wiki-link-suggest.ts`（新建）

1. 基于 `@tiptap/suggestion`（Tiptap 内置）配置 `WikiLinkSuggest` 扩展：
   - `char: '[['`
   - `startOfLine: false`
   - `items({ query })`: 调用 `window.electronAPI.search.fuzzyFiles(query, { limit: 10 })`
   - `render`: 使用 tippy.js 创建弹出框，渲染 `WikiLinkPicker` 组件

2. 实现 `render` 生命周期：
   - `onStart`: 创建 ReactRenderer(WikiLinkPicker) + tippy popup
   - `onUpdate`: 更新 popup 位置和 query
   - `onKeyDown`: ↑/↓/Enter/ESC 键盘事件传递给 WikiLinkPicker
   - `onExit`: 销毁 popup 和 component

**文件：** `src/renderer/components/editor/WikiLinkPicker.tsx`（新建）

3. 实现 `WikiLinkPicker` 组件：
   - Props: `items: Array<{ path: string; title: string }>`、`command: (item) => void`
   - 渲染文件列表，高亮匹配部分
   - ↑/↓ 键导航，Enter 确认，ESC 取消
   - 选中后调用 `command({ target: item.path, label: item.title })`

**文件：** `src/renderer/components/editor/extensions/wiki-link-preview.ts`（新建）

4. 实现悬停预览 ProseMirror Plugin：
   - `handleDOMEvents.mouseover`: 检测目标是否 `[data-wiki-link]`
   - 延迟 300ms 后显示预览弹出框
   - 预览内容：调用 IPC 读取目标文件前 200 字符
   - `handleDOMEvents.mouseout`: 关闭预览
   - 损坏链接显示"文件不存在或已被删除"

**验证：** 补全弹出 < 100ms；键盘导航正确；悬停预览正确显示

### 步骤 7：实现 BacklinksPanel + KnowledgeGraph

**文件：** `src/renderer/components/editor/BacklinksPanel.tsx`（新建）

1. 实现 `BacklinksPanel` 组件：
   - Props: `filePath: string`
   - 状态：`backlinks: Backlink[]`
   - `useEffect` 初始化：调用 `getBacklinks(filePath)` 加载
   - `useEffect` 事件监听：`window.electronAPI.events.on('wiki-links.updated', ...)` 刷新
   - 判断 filePath 变化时重新加载

2. 渲染逻辑：
   - 无 backlinks → EmptyState："暂无引用此文档的页面"
   - 有 backlinks → 标题 + 数量 + BacklinkCard 列表

**文件：** `src/renderer/components/editor/BacklinkCard.tsx`（新建）

3. 实现 `BacklinkCard` 组件：
   - 显示：源文件名 + 链接文本 + snippet
   - 点击 → `window.electronAPI.editor.openFile(sourcePath, { line: estimatedLine })`
   - hover 效果

**文件：** `src/renderer/components/graph/KnowledgeGraph.tsx`（新建，P1）

4. 实现 `KnowledgeGraph` 组件：
   - 使用 `react-force-graph` 渲染力导向图
   - 数据源：调用 `wikiLinks.getOutlinks` + `wikiLinks.getOutlinks` 构建本地图谱
   - 节点大小 = linkCount（入链 + 出链）
   - 节点颜色 = 按目录前缀分组
   - 边方向 = 箭头指示 source → target

5. 交互功能：
   - 缩放和拖拽（react-force-graph 内置）
   - 点击节点 → 显示文件预览弹出框 + 入链/出链列表
   - 搜索框：输入路径前缀过滤节点
   - 聚焦视图切换按钮（全量 / 2 度聚焦）

6. "关系图谱"命令注册：
   - 在 Sprint 3.4 的 CommandRegistry 中注册 `graph:open` 命令
   - 触发时打开图谱面板

**验证：** 反向链接面板正确显示；事件刷新正确；图谱渲染正确

### 步骤 8：主进程装配 + 单元测试

**文件：** `src/main/main.ts` 或服务装配文件（修改）

1. 主进程装配：
   - 执行 `wiki_links` 表 migration
   - 创建 `WikiLinksIndexer` 实例，注入 `db`、`fileManager`、`eventBus`
   - 创建 `WikiLinksStore` 实例，注入 `db`
   - 注册 `wiki-links.ts` IPC handler
   - 将 `WikiLinksIndexer` 挂载到应用生命周期

2. 首次启动全量索引：
   - 检测 `wiki_links` 表是否为空
   - 若为空，执行 `rebuildAllIndex()`

**文件：** `tests/main/services/wiki-links/`（新建目录）

3. `wiki-links-indexer.test.ts`：
   - `extractLinks()` 正则提取测试（各种 `[[xxx]]` 格式）
   - `rebuildIndexForFile()` 索引重建测试（事务正确性）
   - `file.updated` 事件触发索引更新测试
   - `file.deleted` 事件触发 broken 标记测试
   - `file.renamed` 事件 backlink 更新测试（确认/取消）
   - `rebuildAllIndex()` 全量重建测试

4. `wiki-links-store.test.ts`：
   - `getBacklinks()` 查询测试
   - `getOutlinks()` 查询测试
   - `getGraphData()` 全量图谱数据测试
   - `getGraphData(centerPath)` 聚焦模式 BFS 测试
   - `getLinkCount()` 计数测试
   - `getBrokenLinks()` 损坏链接查询测试

**文件：** `tests/renderer/components/editor/`（新建目录）

5. `wiki-link.test.tsx`：
   - WikiLink 节点渲染测试
   - 输入规则 `[[xxx]]` 转换测试
   - 点击跳转 mock 测试
   - 损坏链接红色样式测试

6. `wiki-link-suggest.test.tsx`：
   - 补全弹出和关闭测试
   - 键盘导航测试
   - 选中插入测试

7. `backlinks-panel.test.tsx`：
   - 渲染和空状态测试
   - 事件刷新测试（mock IPC event）
   - 点击跳转测试

**覆盖率目标：** ≥ 80%

## 现有代码基础

| 已有模块 | 文件路径 | 本任务使用方式 |
|---------|---------|-------------|
| Tiptap Editor | `src/renderer/components/editor/`（Sprint 1） | 追加 WikiLink + WikiLinkSuggest 扩展 |
| LocalSearchEngine | `src/main/services/local-search.ts`（Sprint 3） | 共享 SQLite 数据库实例 |
| AppEventBus | `src/main/services/event-bus.ts`（TASK001） | 订阅 file.updated/deleted/renamed 事件 |
| search:fuzzyFiles IPC | `src/main/ipc/handlers/unified-search.ts`（TASK002） | WikiLinkSuggest 调用文件名补全 |
| FileManager | `src/main/services/file-manager.ts`（Sprint 0） | 读取文件内容 + 重命名时更新引用 |
| tippy.js | 已有依赖（Tiptap 依赖） | 补全弹出和预览弹出定位 |

**完全缺失、需新建的模块：**

| 模块 | 说明 |
|------|------|
| `wiki-links/types.ts` | 类型定义 |
| `wiki-links/wiki-links-indexer.ts` | 链接提取与索引更新 |
| `wiki-links/wiki-links-store.ts` | 链接查询接口 |
| `ipc/handlers/wiki-links.ts` | IPC handler |
| `extensions/wiki-link.ts` | Tiptap WikiLink 节点扩展 |
| `extensions/wiki-link-suggest.ts` | Tiptap 自动补全扩展 |
| `extensions/wiki-link-preview.ts` | 悬停预览 Plugin |
| `WikiLinkPicker.tsx` | 补全弹出组件 |
| `BacklinksPanel.tsx` | 反向链接面板 |
| `BacklinkCard.tsx` | 单条反向链接卡片 |
| `KnowledgeGraph.tsx` | 文档关系图谱（P1） |

## 新增 IPC 通道

| IPC 通道 | 方向 | 说明 |
|---------|------|------|
| `wikiLinks:getBacklinks` | Renderer → Main | 获取反向链接列表 |
| `wikiLinks:getOutlinks` | Renderer → Main | 获取正向链接列表 |
| `wikiLinks:rebuildIndex` | Renderer → Main | 手动重建链接索引 |

## 涉及的现有文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/shared/types.ts` | 扩展 | 新增 WIKI_LINKS_* IPC 通道常量 |
| `src/preload/index.ts` | 扩展 | 新增 wikiLinks 命名空间 |
| `src/main/main.ts`（或装配文件） | 修改 | 创建 Indexer/Store 实例 + 注册 IPC |
| Tiptap 编辑器配置 | 修改 | 追加 WikiLink + WikiLinkSuggest 扩展到 extensions 列表 |

**不修改的文件：**
- `src/main/services/local-search.ts` — 共享 SQLite 实例但不修改
- `src/main/services/event-bus.ts` — 仅订阅事件
- `src/renderer/components/editor/` 现有扩展 — 追加新扩展，不修改已有

---

**创建时间：** 2026-04-27
**最后更新：** 2026-04-27
**更新记录：**
- 2026-04-27 — 创建任务文档（含完整技术执行路径 8 步）
