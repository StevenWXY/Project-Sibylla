# PHASE1-TASK033: 系统 Wiki 与外部数据源抽象层 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task033_handbook-datasource-abstraction.md](../specs/tasks/phase1/phase1-task033_handbook-datasource-abstraction.md)
> 创建日期：2026-04-22
> 最后更新：2026-04-22

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK033 |
| **任务标题** | 系统 Wiki 与外部数据源抽象层 |
| **所属阶段** | Phase 1 - AI 模式系统、Plan 产物、Wiki 与能力整合 (Sprint 3.4) |
| **优先级** | P1 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | TASK030 + TASK032 + TASK015 + TASK027 |

### 1.1 目标

交付 Sprint 3.4 的两项 P1 基础设施：(1) Sibylla Handbook——内置于应用的使用手册，用户通过命令面板搜索查阅，AI 自动检索引用；(2) 外部数据源 API 抽象层——统一数据源接入接口（限流/缓存/重试），为 Phase 2 云端集成准备可扩展 Provider 架构。

### 1.2 核心设计约束

| 约束 | 来源 | 说明 |
|------|------|------|
| Wiki 不污染工作区 | 需求 3.4.5 设计原则 | Handbook 内容位于应用资源目录 `resources/handbook/`，本地克隆版在 `.sibylla/handbook-local/` |
| 搜索复用已有基础设施 | 任务描述 | 复用 `DatabaseManager.indexFileContent()` 的 FTS5 索引，不引入新依赖 |
| 抽象层前置 | 需求 3.4.6 | 先建抽象层和默认 Provider，不接入具体外部服务 |
| 本地优先 | CLAUDE.md 架构约束 | Handbook 完全离线可用；数据源可完全禁用 |
| AI 建议/人类决策 | CLAUDE.md 设计哲学 | Handbook 注入仅为 AI 上下文建议，AI 引用需用户确认 |
| TS 严格模式禁止 any | CLAUDE.md 代码规范 | 全部代码遵循 TypeScript 严格模式 |
| 主进程与渲染进程严格隔离 | CLAUDE.md 架构约束 | 文件系统访问仅在主进程，渲染进程通过 IPC 调用 |

### 1.3 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| Handbook 类型 | `src/main/services/handbook/types.ts` | HandbookEntry / HandbookIndex / HandbookIndexMeta / HandbookDiff |
| HandbookIndexer | `src/main/services/handbook/handbook-indexer.ts` | FTS5 索引构建器 |
| HandbookService | `src/main/services/handbook/handbook-service.ts` | Handbook 主类（搜索/查看/克隆/AI 注入） |
| Handbook 统一导出 | `src/main/services/handbook/index.ts` | barrel 文件 |
| Handbook 资源 | `resources/handbook/index.yaml` + `zh/*.md` + `en/*.md` | 中英文内容文件 |
| DataSource 类型 | `src/main/services/datasource/types.ts` | DataSourceQuery / DataSourceResult / DataSourceProvider / ProviderManifest / RateLimitError 等 |
| RateLimiter | `src/main/services/datasource/rate-limiter.ts` | 限流器（每分钟/每日/并发） |
| DataSourceRegistry | `src/main/services/datasource/data-source-registry.ts` | Provider 管理器 |
| FileSystemProvider | `src/main/services/datasource/providers/file-system-provider.ts` | 文件系统默认 Provider |
| WorkspaceSearchProvider | `src/main/services/datasource/providers/workspace-search-provider.ts` | 工作区搜索默认 Provider |
| DataSource 统一导出 | `src/main/services/datasource/index.ts` | barrel 文件 |
| IPC Handler (Handbook) | `src/main/ipc/handlers/handbook.ts` | search / getEntry / clone / checkUpdates |
| IPC Handler (DataSource) | `src/main/ipc/handlers/datasource.ts` | listProviders / query / getProviderStatus |
| shared/types.ts 扩展 | `src/shared/types.ts` | IPC 通道常量 + 类型映射 |
| Preload API 扩展 | `src/preload/index.ts` | handbook / datasource 命名空间 |
| HandbookViewer | `src/renderer/components/handbook/HandbookViewer.tsx` | Markdown 查看器 |
| HandbookBrowser | `src/renderer/components/handbook/HandbookBrowser.tsx` | 目录浏览器 |
| HandbookReference | `src/renderer/components/handbook/HandbookReference.tsx` | AI 引用标记 |
| ContextEngine 扩展 | `src/main/services/context-engine.ts` | how-to 问题自动注入 Handbook |
| 命令面板集成 | handbook-commands.ts 升级 | handbook.search 动态命令 |
| 单元测试 | `tests/handbook/*.test.ts` + `tests/datasource/*.test.ts` | 核心逻辑测试 |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；UI 等待 > 2s 需进度反馈；文件即真相；AI 建议/人类决策 | 全局约束 |
| `specs/design/architecture.md` | 主进程与渲染进程通过 IPC 通信；渲染进程不得直接访问文件系统 | 进程通信架构 |
| `specs/requirements/phase1/sprint3.4-mode.md` | 需求 3.4.5 系统 Wiki + 需求 3.4.6 数据源抽象层；完整验收标准 | 验收标准 |
| `specs/tasks/phase1/phase1-task033_handbook-datasource-abstraction.md` | 15 步执行路径、完整技术规格、测试计划 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `electron-ipc-patterns` | IPC 通道注册；Preload API 扩展；类型安全通道映射；Push Event 转发 | `ipc/handlers/handbook.ts` + `ipc/handlers/datasource.ts` + `preload/index.ts` |
| `typescript-strict-mode` | 全模块类型安全；泛型设计（DataSourceResult<T>）；类型守卫 | 所有 `.ts` / `.tsx` 文件 |
| `frontend-design` | HandbookViewer / HandbookBrowser / HandbookReference UI 设计质量 | `src/renderer/components/handbook/*.tsx` |
| `sqlite-local-storage` | DatabaseManager FTS5 索引操作；content sync 模式 | `handbook-indexer.ts` + `handbook-service.ts` |

### 2.3 前置代码依赖

| 模块 | 文件路径 | 复用方式 |
|------|---------|---------|
| DatabaseManager | `src/main/services/database-manager.ts` | `indexFileContent(path, content)` 索引 Handbook 条目到 FTS5；`removeFileIndex(path)` 清除旧索引；`searchFiles(query, limit)` 搜索 |
| LocalSearchEngine | `src/main/services/local-search-engine.ts` | `search(params)` 搜索 Handbook 内容（参数: `SearchQueryParams`） |
| ContextEngine | `src/main/services/context-engine.ts` | `assembleForHarnessInternal()` 中注入 Handbook context section |
| CommandRegistry | `src/main/services/command/command-registry.ts` | 注册 `handbook.search` 动态命令 |
| handbook-commands.ts | `src/main/services/command/builtin-commands/handbook-commands.ts` | 升级框架为实际实现 |
| Tracer | `src/main/services/trace/tracer.ts` | `withSpan('datasource.fetch', ...)` 包裹 DataSource 查询 |
| Span | `src/main/services/trace/types.ts` | span.setAttributes 记录元数据 |
| FileManager | `src/main/services/file-manager.ts` | `writeFile(path, content, { atomic: true })` 原子写入克隆文件；`readFile()` 读取 Handbook 内容；`exists()` 检查文件 |
| AppEventBus | `src/main/services/event-bus.ts` | `emit('datasource:rate-limit-exhausted')` / `emit('datasource:provider-registered')` |
| IPC_CHANNELS | `src/shared/types.ts` | 追加 Handbook + DataSource 通道常量 |
| Preload API | `src/preload/index.ts` | 追加 handbook / datasource 命名空间 |
| Logger | `src/main/utils/logger.ts` | 结构化日志 |

### 2.4 关键接口适配说明

**DatabaseManager 适配**：任务描述中提及 `localSearchEngine.indexDocument()` 但实际 LocalSearchEngine **不暴露** `indexDocument`。Handbook 索引需直接使用 `DatabaseManager.indexFileContent(path, content)` 将 Handbook 条目写入 FTS5 表。HandbookService 需持有 `DatabaseManager` 引用。

**SecureStorage 不存在**：DataSourceRegistry 的 `loadProviderConfig` 中敏感字段（apiKey）原设计通过 `SecureStorage.get()` 读取，但代码库中**尚无 SecureStorage 类**。本任务改用 `process.env` 环境变量读取敏感配置，并在类型接口中预留 `SecureStorage` 注入点，待后续任务实现后切换。

**ConfigManager 不存在**：HandbookService 中 `currentLanguage()` 原设计使用 `configManager.getSync('ui.language', 'zh')`，但代码库中无 ConfigManager。本任务使用简单的语言检测：从 `localStorage` 或 IPC 获取渲染进程语言设置，或在主进程侧使用默认 `'zh'`。

### 2.5 新增 IPC 通道清单

| 通道常量 | 通道名 | 方向 | 用途 |
|---------|--------|------|------|
| `HANDBOOK_SEARCH` | `handbook:search` | Renderer→Main | 搜索 Handbook 条目 |
| `HANDBOOK_GET_ENTRY` | `handbook:getEntry` | Renderer→Main | 获取指定条目 |
| `HANDBOOK_CLONE` | `handbook:cloneToWorkspace` | Renderer→Main | 克隆 Handbook 到本地 |
| `HANDBOOK_CHECK_UPDATES` | `handbook:checkUpdates` | Renderer→Main | 检查更新 |
| `DATASOURCE_LIST_PROVIDERS` | `datasource:listProviders` | Renderer→Main | 列出已注册 Provider |
| `DATASOURCE_QUERY` | `datasource:query` | Renderer→Main | 执行数据源查询 |
| `DATASOURCE_GET_PROVIDER_STATUS` | `datasource:getProviderStatus` | Renderer→Main | 获取 Provider 状态 |

**Push Event（主进程→渲染进程）**：

| 事件名 | 通道名 | 用途 |
|--------|--------|------|
| `datasource:rate-limit-exhausted` | `datasource:rate-limit-exhausted` | 每日配额耗尽通知 |
| `datasource:provider-registered` | `datasource:provider-registered` | 新 Provider 注册通知 |

---

## 三、现有代码盘点与差距分析

### 3.1 主进程模块现状

| 模块 | 现状 | TASK033 改造 |
|------|------|-------------|
| `services/handbook/` | **目录不存在**，需全新创建 | 新建 types.ts / handbook-indexer.ts / handbook-service.ts / index.ts |
| `services/datasource/` | **目录不存在**，需全新创建 | 新建 types.ts / data-source-registry.ts / rate-limiter.ts / providers/*.ts / index.ts |
| `ipc/handlers/handbook.ts` | **不存在**，需新建 | 注册 4 个 Handbook handler |
| `ipc/handlers/datasource.ts` | **不存在**，需新建 | 注册 3 个 DataSource handler + 2 个 Push Event |
| `resources/handbook/` | **目录不存在**，需创建 | index.yaml + zh/*.md + en/*.md |
| `services/context-engine.ts` | TASK030 已实现 `assembleForHarnessInternal()` | 扩展注入 Handbook context section |
| `services/command/builtin-commands/handbook-commands.ts` | TASK032 已有 2 个框架命令 | 升级 + 新增 handbook.search 命令 |
| `services/local-search-engine.ts` | Sprint 2 已实现，暴露 `search()` | Handbook 直接使用 `DatabaseManager.indexFileContent()` 建索引 |
| `services/database-manager.ts` | 已有 FTS5 索引方法 | HandbookIndexer 直接调用 `indexFileContent()` / `removeFileIndex()` |
| `shared/types.ts` | 已有 100+ IPC 通道 | 追加 7 个新通道 + 类型映射 |
| `preload/index.ts` | 已有 17+ 命名空间 | 追加 handbook + datasource 命名空间 |
| `services/event-bus.ts` | 已有 `AppEventBus` | 追加 `datasource:*` 事件到 EventMap |

### 3.2 渲染进程模块现状

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/renderer/components/handbook/` | **目录不存在**，需创建 | HandbookViewer / HandbookBrowser / HandbookReference |
| `src/renderer/components/command-palette/` | **已存在** (TASK032) | 命令面板搜索结果已含 Handbook 分类 |
| `src/renderer/components/studio/StudioAIPanel.tsx` | **已存在** | 需在 AI 回复中识别 `[Handbook: xxx]` 标记并渲染 HandbookReference |

### 3.3 关键接口衔接点

**HandbookService → DatabaseManager**：
- `indexFileContent('handbook/zh/modes/plan.md', content)` 索引到 FTS5
- `removeFileIndex('handbook/zh/modes/plan.md')` 清除旧索引
- `searchFiles(query, limit)` 搜索 Handbook 内容
- **路径约定**：FTS5 中 Handbook 条目 path 格式为 `handbook/{lang}/{entry.path}`

**HandbookService → FileManager**：
- `readFile()` 读取内置 Handbook 文件和本地克隆版
- `writeFile(path, content, { atomic: true, createDirs: true })` 原子写入克隆文件
- `exists()` 检查文件/目录是否存在
- **内置路径**：通过 `app.getPath('userData')` + `resources/handbook/` 解析
- **克隆路径**：`workspaceRoot + '.sibylla/handbook-local/'`

**HandbookService → LocalSearchEngine**：
- `search({ query, limit })` 搜索（返回 `SearchResult[]`）
- 搜索结果 `path` 字段用于反查 `HandbookEntry`
- **注意**：LocalSearchEngine 是同步 `search()`，HandbookService 包装为 async

**ContextEngine → HandbookService**：
- `assembleForHarnessInternal()` 中调用 `handbookService?.suggestForQuery(userMessage)`
- 返回 top 2 相关条目作为 context section 注入
- 需注入 `HandbookService` 引用：`contextEngine.setHandbookService(hs)`

**DataSourceRegistry → Tracer**：
- `tracer.withSpan('datasource.fetch', fn, { kind: 'tool-call' })` 包裹每次查询
- span attributes: provider_id, operation, duration_ms, cache_hit, rate_limited

**DataSourceRegistry → AppEventBus**：
- `emit('datasource:provider-registered', { id, name })`
- `emit('datasource:rate-limit-exhausted', { providerId, resetAt })`

### 3.4 不存在的文件清单

| 文件 | 类型 |
|------|------|
| `src/main/services/handbook/types.ts` | 新建 |
| `src/main/services/handbook/handbook-indexer.ts` | 新建 |
| `src/main/services/handbook/handbook-service.ts` | 新建 |
| `src/main/services/handbook/index.ts` | 新建 |
| `src/main/services/datasource/types.ts` | 新建 |
| `src/main/services/datasource/rate-limiter.ts` | 新建 |
| `src/main/services/datasource/data-source-registry.ts` | 新建 |
| `src/main/services/datasource/providers/file-system-provider.ts` | 新建 |
| `src/main/services/datasource/providers/workspace-search-provider.ts` | 新建 |
| `src/main/services/datasource/index.ts` | 新建 |
| `src/main/ipc/handlers/handbook.ts` | 新建 |
| `src/main/ipc/handlers/datasource.ts` | 新建 |
| `resources/handbook/index.yaml` | 新建 |
| `resources/handbook/zh/*.md` (10 files) | 新建 |
| `resources/handbook/en/*.md` (10 files) | 新建 |
| `src/renderer/components/handbook/HandbookViewer.tsx` | 新建 |
| `src/renderer/components/handbook/HandbookBrowser.tsx` | 新建 |
| `src/renderer/components/handbook/HandbookReference.tsx` | 新建 |
| `tests/handbook/handbook-service.test.ts` | 新建 |
| `tests/handbook/handbook-indexer.test.ts` | 新建 |
| `tests/datasource/data-source-registry.test.ts` | 新建 |
| `tests/datasource/rate-limiter.test.ts` | 新建 |
| `tests/datasource/file-system-provider.test.ts` | 新建 |
| `tests/datasource/workspace-search-provider.test.ts` | 新建 |

---

## 四、分步实施计划

### 阶段 A：Handbook 类型与索引器（Step 1-2） — 预计 0.5 天

#### A1：创建 Handbook 类型定义

**文件：** `src/main/services/handbook/types.ts`（新建）

完整规格见任务描述 Step 1。核心类型：
- `HandbookEntry` — id / path / title / tags / language / version / source ('builtin'|'local') / content / keywords / updatedAt
- `HandbookIndexMeta` — id / path / title (Record<string,string>) / tags / keywords
- `HandbookIndex` — version / languages / entries[]
- `HandbookDiff` — added[] / modified[] / removed[]

#### A2：实现 HandbookIndexer

**文件：** `src/main/services/handbook/handbook-indexer.ts`（新建）

**构造函数注入**：`dbManager: DatabaseManager`, `logger: Logger`

**核心方法**：

| 方法 | 职责 |
|------|------|
| `indexEntries(entries: HandbookEntry[]): Promise<void>` | 遍历 entries，调用 `dbManager.indexFileContent(path, content)` 索引到 FTS5 |
| `removeEntries(entries: HandbookEntry[]): Promise<void>` | 遍历 entries，调用 `dbManager.removeFileIndex(path)` 清除旧索引 |
| `hashContent(content: string): string` (private) | `crypto.createHash('sha256').update(content).digest('hex').slice(0, 12)` |

**FTS5 路径约定**：`handbook/${entry.language}/${entry.path}`

**索引内容格式**：`${entry.title}\n\n${entry.content}\n\n${entry.tags.join(' ')} ${entry.keywords.join(' ')}`

**错误处理**：单条索引失败 `catch` + `logger.warn`，不阻塞整体初始化。

#### A3：创建 Handbook 统一导出

**文件：** `src/main/services/handbook/index.ts`（新建）

导出所有类型 + HandbookIndexer + HandbookService。

---

### 阶段 B：HandbookService 核心（Step 3） — 预计 0.5 天

#### B1：实现 HandbookService

**文件：** `src/main/services/handbook/handbook-service.ts`（新建）

**构造函数注入**：
```typescript
constructor(
  private appResourcesPath: string,
  private workspaceRoot: string,
  private fileManager: FileManager,
  private dbManager: DatabaseManager,
  private logger: Logger
)
```

**内部状态**：
- `builtinEntries: Map<string, HandbookEntry>` — key: `${id}:${lang}`
- `localEntries: Map<string, HandbookEntry>` — key: `${id}:${lang}`
- `indexer: HandbookIndexer`
- `indexData: HandbookIndex | null` — 缓存 index.yaml 数据

**核心方法**：

| 方法 | 职责 |
|------|------|
| `initialize()` | `loadBuiltin()` → `loadLocal()` → `indexer.indexEntries(allEntries)` → 日志 |
| `search(query, options?)` | 搜索 Handbook，返回匹配条目 |
| `getEntry(id, language?)` | 获取指定条目（本地优先 → 内置 → 英文 fallback） |
| `cloneToWorkspace()` | 复制内置条目到 `.sibylla/handbook-local/` |
| `suggestForQuery(userQuery)` | 检测 how-to 问题，返回 top 2 相关条目 |
| `checkUpdates()` | 对比本地与内置版本差异 |

**`initialize()` 流程**：
1. `await this.loadBuiltin()` — 读取 `resources/handbook/index.yaml` + 各语言文件
2. `await this.loadLocal()` — 读取 `.sibylla/handbook-local/` 下的本地克隆
3. `await this.indexer.indexEntries([...builtinEntries.values(), ...localEntries.values()])`
4. `this.logger.info('handbook.initialized', { builtin, local })`

**`loadBuiltin()`**：读取 `index.yaml` → 解析 → 遍历 entries × languages → 读取 `.md` 文件 → 构建 HandbookEntry（source: 'builtin'）。文件不存在时 `logger.error` + return。

**`loadLocal()`**：检查 `.sibylla/handbook-local/` → 遍历语言子目录 → 从路径推断 entry id → 构建 HandbookEntry（source: 'local'）。

**`search(query, { limit, language })`**：`dbManager.searchFiles(query, limit*2)` → 过滤 `handbook/{lang}/` 前缀 → 映射为 HandbookEntry → 截取 limit 条。

**`getEntry(id, language)` 查找链**：
1. `localEntries.get(\`${id}:${lang}\`)`
2. `builtinEntries.get(\`${id}:${lang}\`)`
3. `builtinEntries.get(\`${id}:en\`)` — 英文 fallback
4. `null`

**`cloneToWorkspace()` 流程**：
1. `localPath = path.join(workspaceRoot, '.sibylla/handbook-local/')`
2. 遍历 `builtinEntries.values()`
3. 目标路径：`path.join(localPath, entry.language, entry.path)`
4. 文件已存在 → skip（不覆盖用户修改）
5. `await fileManager.writeFile(relativePath, entry.content, { atomic: true, createDirs: true })`
6. 写入元数据 `.cloned-from-version`
7. 重新加载 `loadLocal()` + 重新索引
8. 返回 `{ clonedCount, localPath }`

**`suggestForQuery(userQuery)` 实现**：
- how-to 检测正则：`/怎么|如何|什么是|为什么|能不能|可以/` + `/how to|what is|why|can i|how can/i`
- 非 how-to → return `[]`
- 调用 `search(userQuery, { limit: 2 })`

**`checkUpdates()` 实现**：
- 读取本地 `.cloned-from-version` 获取克隆版本
- 遍历内置条目，对比本地条目是否存在和 hash 一致
- 构建 `HandbookDiff`：added（本地无）/ modified（hash 不同）/ removed（本地有但内置无）

**`pathToEntryId(searchPath)` 实现**：
- `handbook/zh/modes/plan.md` → 去掉前缀 `handbook/zh/` 和后缀 `.md` → `modes/plan` → `modes.plan`

**`currentLanguage()` 实现**：
- 默认返回 `'zh'`（无 ConfigManager，预留注入接口）

---

### 阶段 C：DataSource 类型与限流器（Step 4-5） — 预计 0.5 天

#### C1：创建 DataSource 类型定义

**文件：** `src/main/services/datasource/types.ts`（新建）

完整类型规格见任务描述 Step 4。核心类型：
- `DataSourceOperation` = `'fetch' | 'search' | 'list' | 'write'`
- `DataSourceQuery` — operation + params + timeoutMs?
- `DataSourceResult<T>` — data + fromCache + fetchedAt + providerId
- `DataSourceProvider` — id / name / version / capabilities + initialize / isHealthy / query / dispose
- `ProviderConfig` — `Record<string, unknown>`
- `ConfigField` — type / required? / sensitive? / default?
- `ProviderManifest` — id / name / version / capabilities / configSchema / rateLimits / defaultCacheTTLSeconds
- `ProviderStatus` — id / healthy / dailyQuotaUsed / dailyQuotaTotal / cacheSize
- `RateLimitError extends Error` — retryAfterMs
- `QuotaExhaustedError extends Error` — providerId / resetAt

#### C2：实现 RateLimiter

**文件：** `src/main/services/datasource/rate-limiter.ts`（新建）

**构造函数**：`limits: { requestsPerMinute?, requestsPerDay?, concurrent? }`

**内部状态**：
- `minuteTimestamps: number[]` — 每分钟请求时间戳
- `dailyCount: number` — 当日累计
- `dailyResetAt: number` — 当日配额重置时间
- `activeCount: number` — 当前并发数

**核心方法**：

| 方法 | 职责 |
|------|------|
| `acquire()` | 检查并发 → 检查每分钟 → 通过后记录时间戳 + activeCount++ |
| `release()` | activeCount-- |
| `incrementDaily()` | 检查跨日重置 → dailyCount++ |
| `isDailyExhausted()` | 判断是否超出日配额 |
| `getDailyResetAt()` | 返回日配额重置时间戳 |
| `cleanMinuteBucket()` (private) | 移除 60s 前的时间戳 |
| `nextDayStart()` (private) | 明天 0:00 时间戳 |

**并发检查**：超出时 throw `RateLimitError('concurrent', 1000)`

**每分钟检查**：超出时计算 waitMs → throw `RateLimitError('per-minute', waitMs)`

---

### 阶段 D：DataSourceRegistry 与 Provider（Step 6-7） — 预计 1 天

#### D1：实现 DataSourceRegistry

**文件：** `src/main/services/datasource/data-source-registry.ts`（新建）

**构造函数注入**：`tracer: Tracer`, `eventBus: AppEventBus`, `logger: Logger`

**内部状态**：
- `providers: Map<string, DataSourceProvider>`
- `rateLimiters: Map<string, RateLimiter>`
- `manifests: Map<string, ProviderManifest>`
- `cache: Map<string, { result: DataSourceResult; expiresAt: number }>` — max 500, TTL 5min
- `dailyCounts: Map<string, { count: number; resetAt: number }>`

**核心方法**：

| 方法 | 职责 |
|------|------|
| `registerProvider(provider, manifest)` | 初始化 + 注册 + 创建限流器 + emit 事件 |
| `query<T>(providerId, query)` | Tracer span → 配额检查 → 缓存检查 → 限流 → 调用（含重试）→ 缓存 |
| `getProviderStatus(id)` | 返回 Provider 状态 |
| `listProviders()` | 返回已注册 Provider 列表 |
| `dispose()` | 清理所有 Provider |

**`registerProvider()` 流程**：
1. 检查重复 ID → throw
2. 加载配置（预留 SecureStorage 接口，当前从环境变量读取）
3. `await provider.initialize(config)`
4. 注册到 providers / rateLimiters / manifests
5. `eventBus.emit('datasource:provider-registered', { id, name })`

**`query<T>()` 流程**（包裹在 `tracer.withSpan('datasource.fetch')`）：
1. 查找 provider → 不存在 throw
2. 能力检查 → 不支持 throw
3. **每日配额检查**：`isDailyExhausted()` → true 时尝试返回缓存 → 无缓存 throw `QuotaExhaustedError`
4. **缓存检查**：cacheKey = `hash({ providerId, operation, params })` → 命中返回
5. **限流**：`limiter.acquire()` → catch RateLimitError → span.setAttribute + throw
6. **实际调用**：`callWithRetry(provider, query, span)` — 最多 3 次（1 + 2 重试），间隔 1s/3s
7. `limiter.release()` + `limiter.incrementDaily()`
8. 缓存结果 → 返回

**`callWithRetry()` 实现**：
- maxRetries = 2，共 3 次尝试
- delay = `1000 * Math.pow(3, attempt - 1)` → 1s, 3s
- 每次 retry 记录 `span.addEvent('datasource.retry', { attempt, error, delay })`
- 工具函数 `sleep(ms)`

**缓存实现**（Map + TTL，不引入外部 LRU 库）：
- `getFromCache()`: 检查过期时间 → 过期则删除并返回 null
- `saveToCache()`: TTL 使用 manifest.defaultCacheTTLSeconds × 1000
- 缓存容量控制：超过 500 条目时清除最早 100 条

#### D2：实现 FileSystemProvider

**文件：** `src/main/services/datasource/providers/file-system-provider.ts`（新建）

```typescript
export class FileSystemProvider implements DataSourceProvider {
  readonly id = 'filesystem'
  readonly name = 'Workspace File System'
  readonly version = '1.0.0'
  readonly capabilities: DataSourceOperation[] = ['fetch', 'list']
}
```

**构造函数**：`fileManager: FileManager`, `workspaceRoot: string`

**`query()` 实现**：
- `fetch` → `fileManager.readFile(path)` → 返回 `{ data: { path, content }, ... }`
- `list` → `fileManager.listFiles(path)` → 返回 `{ data: { path, entries }, ... }`
- 其他 operation → throw Error

**`resolveWithinWorkspace(p)` 安全检查**：
- `path.resolve(workspaceRoot, p)`
- `!resolved.startsWith(workspaceRoot)` → throw Error('Path outside workspace boundary')

#### D3：实现 WorkspaceSearchProvider

**文件：** `src/main/services/datasource/providers/workspace-search-provider.ts`（新建）

```typescript
export class WorkspaceSearchProvider implements DataSourceProvider {
  readonly id = 'workspace-search'
  readonly name = 'Workspace Search'
  readonly version = '1.0.0'
  readonly capabilities: DataSourceOperation[] = ['search']
}
```

**构造函数**：`localSearchEngine: LocalSearchEngine`

**`query()` 实现**：
- `search` → `localSearchEngine.search({ query: q.params.query, limit, fileExtensions })` → 映射为 `DataSourceResult`
- 其他 operation → throw Error

#### D4：创建 DataSource 统一导出

**文件：** `src/main/services/datasource/index.ts`（新建）

导出所有类型 + DataSourceRegistry + RateLimiter + FileSystemProvider + WorkspaceSearchProvider + 默认 manifest 常量。

**默认 Manifest 常量**：

```typescript
export const FILESYSTEM_MANIFEST: ProviderManifest = {
  id: 'filesystem', name: 'Workspace File System', version: '1.0.0',
  capabilities: ['fetch', 'list'],
  configSchema: {},
  rateLimits: { requestsPerMinute: 120 },
  defaultCacheTTLSeconds: 60,
}

export const WORKSPACE_SEARCH_MANIFEST: ProviderManifest = {
  id: 'workspace-search', name: 'Workspace Search', version: '1.0.0',
  capabilities: ['search'],
  configSchema: {},
  rateLimits: { requestsPerMinute: 30 },
  defaultCacheTTLSeconds: 300,
}
```

---

### 阶段 E：IPC 集成与 Preload API（Step 8-10） — 预计 0.5 天

#### E1：扩展 shared/types.ts

**文件：** `src/shared/types.ts`（扩展）

**1. `IPC_CHANNELS` 追加**：

```typescript
// Handbook
HANDBOOK_SEARCH: 'handbook:search',
HANDBOOK_GET_ENTRY: 'handbook:getEntry',
HANDBOOK_CLONE: 'handbook:cloneToWorkspace',
HANDBOOK_CHECK_UPDATES: 'handbook:checkUpdates',

// DataSource
DATASOURCE_LIST_PROVIDERS: 'datasource:listProviders',
DATASOURCE_QUERY: 'datasource:query',
DATASOURCE_GET_PROVIDER_STATUS: 'datasource:getProviderStatus',
```

**2. `IPCChannelMap` 追加类型映射**（参照已有模式）。

**3. 新增共享类型**：`HandbookEntryShared` / `HandbookSearchResultShared` / `ProviderInfoShared` / `ProviderStatusShared` — 序列化版本（不含 function）。

#### E2：实现 Handbook IPC Handler

**文件：** `src/main/ipc/handlers/handbook.ts`（新建）

采用**函数式**注册模式（与 TASK032 的 `command.ts` 一致）：

```typescript
export function registerHandbookHandlers(
  ipcMain: Electron.IpcMain,
  handbookService: HandbookService,
): () => void {
  // handbook:search → handbookService.search(query, options)
  // handbook:getEntry → handbookService.getEntry(id, language)
  // handbook:cloneToWorkspace → handbookService.cloneToWorkspace()
  // handbook:checkUpdates → handbookService.checkUpdates()
  // 所有 handler 包裹 try/catch，catch 返回 { error: message }
  return cleanup
}
```

#### E3：实现 DataSource IPC Handler

**文件：** `src/main/ipc/handlers/datasource.ts`（新建）

```typescript
export function registerDatasourceHandlers(
  ipcMain: Electron.IpcMain,
  dataSourceRegistry: DataSourceRegistry,
): () => void {
  // datasource:listProviders → registry.listProviders()
  // datasource:query → registry.query(providerId, query)
  // datasource:getProviderStatus → registry.getProviderStatus(id)
  return cleanup
}
```

#### E4：扩展 AppEventBus EventMap

**文件：** `src/main/services/event-bus.ts`（扩展）

在 `EventMap` 类型中追加：
```typescript
'datasource:rate-limit-exhausted': [payload: { providerId: string; resetAt: number }]
'datasource:provider-registered': [payload: { id: string; name: string }]
```

#### E5：Preload API 扩展

**文件：** `src/preload/index.ts`（扩展）

追加 `handbook` 和 `datasource` 命名空间到 `ElectronAPI` 接口和 `api` 对象：

```typescript
handbook: {
  search: (query: string, options?) => ipcRenderer.invoke('handbook:search', query, options),
  getEntry: (id: string, language?) => ipcRenderer.invoke('handbook:getEntry', id, language),
  cloneToWorkspace: () => ipcRenderer.invoke('handbook:cloneToWorkspace'),
  checkUpdates: () => ipcRenderer.invoke('handbook:checkUpdates'),
}

datasource: {
  listProviders: () => ipcRenderer.invoke('datasource:listProviders'),
  query: (providerId: string, query) => ipcRenderer.invoke('datasource:query', providerId, query),
  getProviderStatus: (id: string) => ipcRenderer.invoke('datasource:getProviderStatus', id),
}
```

`ALLOWED_CHANNELS` 追加 7 个新通道 + 2 个 Push Event 通道。

---

### 阶段 F：ContextEngine 集成（Step 11） — 预计 0.3 天

#### F1：扩展 ContextEngine

**文件：** `src/main/services/context-engine.ts`（扩展）

**1. 新增依赖**：

```typescript
private handbookService: HandbookService | null = null

setHandbookService(hs: HandbookService): void {
  this.handbookService = hs
}
```

**2. 在 `assembleForHarnessInternal()` 中插入 Handbook 注入**：

在现有 AiMode systemPromptPrefix 注入之后、Guides overlay 之前，插入：

```typescript
if (this.handbookService) {
  const handbookEntries = await this.handbookService.suggestForQuery(request.userMessage)
  if (handbookEntries.length > 0) {
    const handbookSection = handbookEntries.map(e =>
      `### ${e.title}\n\n${this.truncate(e.content, 800)}\n\n_引用时请标注：[Handbook: ${e.id}]_`
    ).join('\n\n---\n\n')

    base = {
      ...base,
      systemPrompt: base.systemPrompt + '\n\n## 📖 相关用户手册\n\n' + handbookSection,
      totalTokens: base.totalTokens + this.estimateTokens(handbookSection),
    }
  }
}
```

**设计决策**：Handbook 内容直接追加到 systemPrompt 末尾（而非作为独立 section），与现有 AiMode/Guide 注入模式一致。

---

### 阶段 G：Handbook UI 组件（Step 12） — 预计 1 天

#### G1：HandbookViewer

**文件：** `src/renderer/components/handbook/HandbookViewer.tsx`（新建）

**Props**：`entryId: string`, `language?: string`, `onClose?: () => void`

**内部状态**：`entry: HandbookEntryShared | null`, `loading: boolean`

**挂载时**：`window.electronAPI.handbook.getEntry(entryId, language)`

**渲染**：
- loading → spinner
- null → "条目未找到"
- entry 存在 →
  - **头部**：标题 + 来源标签 `✓ 内置` / `✎ 本地` + 语言标签
  - **内容区**：Markdown 渲染（复用 `dangerouslySetInnerHTML` + `marked` 或项目已有的 Markdown 渲染方案）
  - **底部**：最后更新时间 + 相关条目链接（基于 tags 匹配）

#### G2：HandbookBrowser

**文件：** `src/renderer/components/handbook/HandbookBrowser.tsx`（新建）

**功能**：展示 Handbook 目录结构和搜索

**内部状态**：`searchQuery: string`, `searchResults: HandbookEntryShared[]`, `categories: Map<string, HandbookEntryShared[]>`, `selectedEntry: HandbookEntryShared | null`

**渲染**：
- **搜索框**：输入 → `window.electronAPI.handbook.search(query)` → 展示结果列表
- **目录树**：按 category 分组（`快速开始` / `AI 模式` / `功能` / `参考`）
- **条目列表**：点击 → `setSelectedEntry(entry)` → 显示 HandbookViewer
- **空状态**：无结果时显示提示

**设计要点**：复用命令面板的搜索交互模式，HandbookBrowser 作为侧面板打开。

#### G3：HandbookReference

**文件：** `src/renderer/components/handbook/HandbookReference.tsx`（新建）

**Props**：`entryId: string`, `title: string`

**渲染**：可点击标签 `📖 来自用户手册：{title}`

- 样式：`bg-blue-50 text-blue-700 rounded-full px-3 py-1 text-sm hover:underline cursor-pointer`
- 点击 → 触发事件打开 HandbookViewer（通过 eventBus 或 callback）

**使用场景**：AI 回答中包含 `[Handbook: xxx]` 标记时，StudioAIPanel 渲染时替换为 `<HandbookReference entryId="xxx" title="yyy" />`

#### G4：StudioAIPanel Handbook 引用渲染

**文件：** `src/renderer/components/studio/StudioAIPanel.tsx`（扩展）

在 AI 消息渲染中，检测 `[Handbook: xxx]` 模式并替换为 `<HandbookReference>` 组件。

正则替换：`/\[Handbook:\s*([^\]]+)\]/g` → 解析 entryId → 从 HandbookService 获取 title → 渲染 HandbookReference。

---

### 阶段 H：Handbook 资源文件（Step 13） — 预计 0.5 天

#### H1：创建 index.yaml

**文件：** `resources/handbook/index.yaml`（新建）

完整结构见任务描述 Step 13。包含 10 个条目定义（getting-started / 4 个 mode / 3 个 feature / shortcuts / faq）。

#### H2：创建中文条目文件

**目录：** `resources/handbook/zh/`（新建）

10 个 `.md` 文件，每个 200-500 字框架内容：
- `getting-started.md` — 快速开始指南
- `modes/plan.md` — Plan 模式使用说明
- `modes/analyze.md` — Analyze 模式使用说明
- `modes/review.md` — Review 模式使用说明
- `modes/write.md` — Write 模式使用说明
- `features/memory-system.md` — 记忆系统说明
- `features/prompt-optimization.md` — 提示词优化说明
- `features/progress-ledger.md` — 任务台账说明
- `shortcuts.md` — 快捷键列表
- `faq.md` — 常见问题

#### H3：创建英文条目文件

**目录：** `resources/handbook/en/`（新建）

镜像结构，英文内容可暂时为占位符。

---

### 阶段 I：命令面板集成 + 主进程装配（Step 14-15） — 预计 0.5 天

#### I1：升级 handbook-commands.ts

**文件：** `src/main/services/command/builtin-commands/handbook-commands.ts`（扩展）

1. 升级 `handbook.browse` → `eventBus.emit('handbook:browse')` 触发渲染进程打开 HandbookBrowser 面板
2. 升级 `handbook.cloneToWorkspace` → 通过回调调用 HandbookService.cloneToWorkspace()
3. 新增 `handbook.search` 动态命令：
   - id: `handbook.search`
   - title: "搜索手册"
   - category: "Handbook"
   - keywords: `['手册', 'handbook', '搜索', 'search']`
   - execute: 打开命令面板 → 切换到 handbook 搜索模式

**设计决策**：命令注册函数签名从 `(registry, eventBus)` 扩展为 `(registry, eventBus, handbookService?)` — handbookService 可选，不存在时命令仍可注册但 execute 为空操作。

#### I2：主进程生命周期装配

**文件：** `src/main/index.ts`（扩展）

在 `onWorkspaceOpened` 回调中（TASK032 的 CommandRegistry 注册之后）：

```typescript
// 1. 创建 HandbookService
const handbookService = new HandbookService(
  appResourcesPath, workspaceRoot, fileManager, databaseManager, logger
)
await handbookService.initialize()

// 2. 创建 DataSourceRegistry
const dataSourceRegistry = new DataSourceRegistry(tracer, appEventBus, logger)
const fsProvider = new FileSystemProvider(fileManager, workspaceRoot)
const wsProvider = new WorkspaceSearchProvider(localSearchEngine)
await dataSourceRegistry.registerProvider(fsProvider, FILESYSTEM_MANIFEST)
await dataSourceRegistry.registerProvider(wsProvider, WORKSPACE_SEARCH_MANIFEST)

// 3. 注入到 ContextEngine
contextEngine.setHandbookService(handbookService)

// 4. 注册 IPC Handler
registerHandbookHandlers(ipcMain, handbookService)
registerDatasourceHandlers(ipcMain, dataSourceRegistry)

// 5. 注册 EventBus → Renderer 推送
forwardToRenderer('datasource:rate-limit-exhausted', 'datasource:rate-limit-exhausted')
forwardToRenderer('datasource:provider-registered', 'datasource:provider-registered')

// 6. 重新注册 Handbook 命令（传入 handbookService）
registerHandbookCommands(commandRegistry, appEventBus, handbookService)
```

**资源路径解析**：`appResourcesPath` 使用 `app.getPath('userData')` 或 `process.resourcesPath`，取决于打包配置。开发环境使用项目根目录下的 `resources/handbook/`。

---

## 五、验收标准追踪

### HandbookService

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 应用启动时从 `resources/handbook/` 加载 index.yaml 并构建可搜索索引 | B1 `initialize()` → `loadBuiltin()` → `indexer.indexEntries()` | `handbook-service.test.ts` #1 |
| 2 | 支持 `search(query, { limit, language })` 全文搜索 | B1 `search()` + A2 `indexer` | `handbook-service.test.ts` #4-6 |
| 3 | 搜索结果优先本地版本 | B1 `getEntry()` 查找链 local → builtin → en | `handbook-service.test.ts` #3 |
| 4 | 中文缺失时回退英文 | B1 `getEntry()` fallback chain | `handbook-service.test.ts` #8 |
| 5 | 搜索延迟 < 100ms | DatabaseManager FTS5 同步搜索 | 性能测试 |
| 6 | `getEntry(id, language)` 返回指定条目或 null | B1 `getEntry()` | `handbook-service.test.ts` #7-9 |
| 7 | `cloneToWorkspace()` 复制 Handbook 到本地 | B1 `cloneToWorkspace()` | `handbook-service.test.ts` #10-12 |
| 8 | 本地版本标注 `(本地)`，内置标注 `(内置)` | G1 HandbookViewer 渲染 | 组件测试 |

### AI 集成

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | `suggestForQuery()` 检测 how-to 问题返回最多 2 条 | B1 `suggestForQuery()` | `handbook-service.test.ts` #13-15 |
| 2 | 检测关键词：怎么/如何/什么是/为什么/how to/what is/why | B1 howToPatterns 正则 | `handbook-service.test.ts` #13-14 |
| 3 | AI 回答引用 Handbook 时显示标记 | G3 HandbookReference + G4 StudioAIPanel 集成 | 组件测试 |
| 4 | 引用标记可点击打开 HandbookViewer | G3 HandbookReference onClick | 组件测试 |

### Handbook UI

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 命令面板搜索显示 Handbook 条目 | I1 handbook-commands + TASK032 CommandPalette | 集成测试 |
| 2 | 点击条目打开 HandbookViewer（Markdown 渲染） | G1 HandbookViewer | 组件测试 |
| 3 | HandbookBrowser 展示目录结构 | G2 HandbookBrowser | 组件测试 |
| 4 | 语言切换时自动切换版本 | HandbookService.getEntry() + UI 语言状态 | 集成测试 |

### DataSource 抽象层

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | DataSourceRegistry 初始化加载 Provider | D1 `registerProvider()` | `data-source-registry.test.ts` #1 |
| 2 | `query()` 调用链：RateLimiter → Cache → Provider.fetch() | D1 `query()` | `data-source-registry.test.ts` #3-4 |
| 3 | 限流：每分钟/每日配额检查，超出抛 RateLimitError | C2 RateLimiter | `rate-limiter.test.ts` #2-3 |
| 4 | 缓存：默认 5 分钟 TTL | D1 cache 实现 | `data-source-registry.test.ts` #4 |
| 5 | 失败重试：最多 2 次，指数退避（1s, 3s） | D1 `callWithRetry()` | `data-source-registry.test.ts` #10-11 |
| 6 | Provider 不可用时返回缓存结果 | D1 配额耗尽 → 返回缓存 | `data-source-registry.test.ts` #8 |
| 7 | FileSystemProvider 强制工作区边界 | D2 `resolveWithinWorkspace()` | `file-system-provider.test.ts` #2 |
| 8 | WorkspaceSearchProvider 复用 LocalSearchEngine | D3 实现 | `workspace-search-provider.test.ts` #1 |
| 9 | 所有调用产生 `datasource.fetch` Trace span | D1 `query()` Tracer 包裹 | `data-source-registry.test.ts` #12 |
| 10 | 每日配额耗尽发射 `datasource:rate-limit-exhausted` 事件 | D1 + E4 EventMap | `data-source-registry.test.ts` #7 |

### IPC 集成

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | Handbook IPC 通道注册且类型安全 | E1 + E2 | IPC handler 测试 |
| 2 | DataSource IPC 通道注册且类型安全 | E1 + E3 | IPC handler 测试 |
| 3 | Preload API 暴露 handbook / datasource 命名空间 | E5 | preload 测试 |

---

## 六、风险与缓解

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|---------|
| Handbook 资源路径在不同环境（开发/打包）不一致 | 高 | 高 | 封装 `resolveResourcesPath()` 函数，开发环境 fallback 到 `process.cwd()/resources/`；打包环境使用 `process.resourcesPath` |
| FTS5 索引 Handbook 内容与工作区文件搜索冲突 | 中 | 中 | Handbook 索引 path 使用 `handbook/` 前缀；搜索时通过 path prefix 过滤 |
| YAML 解析引入新依赖 | 低 | 低 | 使用 Node.js 内置或项目已有的 YAML 解析方案；若无可使用简单的行解析 |
| HandbookService 资源读取阻塞启动 | 中 | 中 | `loadBuiltin()` 中文件不存在时优雅降级（logger.error + return）；索引失败不阻塞 |
| DataSourceRegistry 缓存容量失控 | 低 | 中 | Map 缓存 + 容量上限 500 + LRU 清除策略 |
| SecureStorage 缺失影响敏感配置读取 | 低 | 中 | 预留接口 + 当前使用环境变量 fallback；不影响内置 Provider |
| HandbookBrowser 与命令面板搜索重复 | 低 | 低 | 两者使用相同 HandbookService.search()，UI 层面不同（面板 vs overlay） |
| ContextEngine 注入 Handbook 增加 token 消耗 | 中 | 中 | 限制最多 2 条 + 每条截断 800 字符；仅在 how-to 问题时触发 |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 | 预计工时 |
|----|------|--------|---------|
| Day 1 上午 | A1-A3 | handbook/types.ts + handbook-indexer.ts + index.ts | 3h |
| Day 1 下午 | B1 | handbook-service.ts 完整实现 | 3h |
| Day 2 上午 | C1-C2 | datasource/types.ts + rate-limiter.ts | 3h |
| Day 2 下午 | D1-D4 | data-source-registry.ts + providers + index.ts | 4h |
| Day 3 上午 | E1-E5 | shared/types.ts + IPC handlers + Preload API + EventMap | 3h |
| Day 3 下午 | F1 + I1-I2 | ContextEngine 集成 + 命令面板 + 主进程装配 | 3h |
| Day 4 上午 | G1-G4 | HandbookViewer + Browser + Reference + StudioAIPanel 集成 | 4h |
| Day 4 下午 | H1-H3 | resources/handbook/ 全部内容文件 | 3h |
| Day 5 上午 | 测试 | Handbook + DataSource 单元测试 | 4h |
| Day 5 下午 | 测试 + 修复 | 集成验证 + bug 修复 + lint + typecheck | 3h |

**总预计工时**：33h（约 4.5 工作日）

---

## 八、测试计划摘要

### 单元测试文件结构

```
tests/handbook/
├── handbook-service.test.ts            ← HandbookService 核心逻辑
└── handbook-indexer.test.ts            ← 索引构建器

tests/datasource/
├── data-source-registry.test.ts        ← DataSourceRegistry
├── rate-limiter.test.ts                ← RateLimiter
├── file-system-provider.test.ts        ← FileSystemProvider
└── workspace-search-provider.test.ts   ← WorkspaceSearchProvider
```

### handbook-service.test.ts 关键用例

1. initialize loads builtin — 正确加载所有内置条目
2. initialize graceful degradation — 资源不存在时不崩溃
3. load local overrides — 本地版本优先
4. search returns results — 全文搜索匹配
5. search respects limit — 限制数量
6. search respects language — 按语言过滤
7. get entry by id — 返回指定条目
8. get entry fallback to english — 中文缺失回退英文
9. get entry not found — 返回 null
10. clone to workspace — 复制到本地
11. clone preserves existing — 不覆盖已有
12. clone writes metadata — 元数据文件
13. suggest for how-to query — "怎么"触发
14. suggest ignores non-how-to — 非问题返回空
15. suggest limits to 2 — 最多 2 条
16. check updates detects changes — 版本差异检测

### data-source-registry.test.ts 关键用例

1. register provider — 注册成功
2. register duplicate — 重复 ID 抛错
3. query success — 查询成功
4. query caches result — 缓存命中
5. query capability check — 不支持 operation 抛错
6. query not found — Provider 不存在抛错
7. daily quota exhausted — QuotaExhaustedError
8. daily quota fallback to cache — 返回缓存
9. rate limit exceeded — RateLimitError
10. retry on failure — 重试 2 次
11. retry exponential backoff — 间隔 1s/3s
12. all queries produce trace span — datasource.fetch

### rate-limiter.test.ts 关键用例

1. acquire under limit — 成功
2. per minute exceeded — RateLimitError
3. concurrent exceeded — RateLimitError
4. release decrements active — activeCount 递减
5. daily count increments — 计数正确
6. daily exhausted — isDailyExhausted true
7. daily reset on new day — 跨日重置

---

**文档版本**: v1.0
**最后更新**: 2026-04-22
**维护者**: Sibylla 架构团队
