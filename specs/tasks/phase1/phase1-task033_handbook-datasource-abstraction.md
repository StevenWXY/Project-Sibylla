# 系统 Wiki 与外部数据源抽象层

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK033 |
| **任务标题** | 系统 Wiki 与外部数据源抽象层 |
| **所属阶段** | Phase 1 - AI 模式系统、Plan 产物、Wiki 与能力整合 (Sprint 3.4) |
| **优先级** | P1 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

交付 Sprint 3.4 的两项 P1 基础设施：(1) Sibylla Handbook——内置于应用的使用手册，用户可通过命令面板搜索查阅，AI 回答使用问题时可自动检索引用；(2) 外部数据源 API 抽象层——统一的数据源接入接口，含限流、缓存、重试机制，为 Phase 2 云端集成和第三方接入准备可扩展的 Provider 架构。

### 背景

TASK032 已实现命令面板和 IPC 通道框架。Sibylla 的功能日益丰富（模式系统、Plan 管理、记忆系统、Trace 等），用户需要一份随时可查的内置手册。同时，Phase 2 将接入云端搜索、RSS、第三方 API，需要一个统一的抽象层避免未来重写基础设施。

**核心设计约束：**

- **Wiki 不污染工作区**（需求 3.4.5 设计原则）：Handbook 内容位于应用资源目录 `resources/handbook/`，用户工作区保持纯净。本地克隆版放在 `.sibylla/handbook-local/`
- **搜索复用已有基础设施**：Handbook 搜索复用 Sprint 2 的 LocalSearchEngine（SQLite FTS5），不引入新依赖
- **抽象层前置**：外部数据源先建抽象层和默认 Provider，不接入具体外部服务
- **本地优先**：Handbook 完全离线可用；外部数据源可完全禁用，不影响本地功能
- **AI 可引用**：当用户消息被识别为"how-to"类问题时，系统自动将 Handbook 相关条目注入 AI 上下文

**现有代码关键约束：**

| 维度 | 现状 | TASK033 改造 |
|------|------|-------------|
| LocalSearchEngine | Sprint 2 已实现 FTS5 | Handbook 内容在初始化时索引到 FTS5 表中 |
| ContextEngine | TASK030 已支持 aiMode 参数 | 扩展 suggestForQuery 检测 how-to 问题并注入 Handbook 条目 |
| CommandRegistry | TASK032 已实现 | Handbook 命令从框架升级为完整实现 |
| FileManager | atomicWrite 已完成 | Handbook 克隆使用 atomicWrite |

### 范围

**包含：**
- `services/handbook/types.ts` — HandbookEntry / HandbookIndex
- `services/handbook/handbook-service.ts` — HandbookService 主类
- `services/handbook/handbook-indexer.ts` — FTS5 索引构建器
- `services/handbook/index.ts` — 统一导出
- `resources/handbook/` — 中英文 Handbook 内容文件（框架 + 核心条目）
- `services/datasource/types.ts` — DataSourceQuery / DataSourceResult / DataSourceProvider / ProviderManifest
- `services/datasource/data-source-registry.ts` — DataSourceRegistry 管理器
- `services/datasource/rate-limiter.ts` — 限流器
- `services/datasource/providers/file-system-provider.ts` — 文件系统默认 Provider
- `services/datasource/providers/workspace-search-provider.ts` — 工作区搜索默认 Provider
- `services/datasource/index.ts` — 统一导出
- `ipc/handlers/handbook.ts` — IPC 通道注册
- `ipc/handlers/datasource.ts` — IPC 通道注册
- `shared/types.ts` 扩展 — IPC 通道常量
- `preload/index.ts` 扩展 — handbook / datasource 命名空间
- `renderer/components/handbook/HandbookViewer.tsx` — Handbook 查看器
- `renderer/components/handbook/HandbookBrowser.tsx` — Handbook 浏览器
- `renderer/components/handbook/HandbookReference.tsx` — AI 引用标记
- ContextEngine 集成 — how-to 问题自动注入
- 单元测试

**不包含：**
- 具体外部服务接入（Phase 2 Sprint 4）
- 云端语义搜索接入（Phase 2）
- Handbook 全量内容撰写（仅框架 + 核心条目）

## 验收标准

### HandbookService

- [ ] 应用启动时从 `resources/handbook/` 加载 index.yaml 并构建可搜索索引
- [ ] 支持 `search(query, { limit, language })` 全文搜索
- [ ] 搜索结果优先本地版本（`.sibylla/handbook-local/`），fallback 到内置版本
- [ ] 中文缺失时回退到英文版本
- [ ] 搜索延迟 < 100ms
- [ ] `getEntry(id, language)` 返回指定条目或 null
- [ ] `cloneToWorkspace()` 复制 Handbook 到 `.sibylla/handbook-local/`，含 `.cloned-from-version` 元数据
- [ ] 本地版本在搜索中标注 `(本地)`，内置版本标注 `(内置)`

### AI 集成

- [ ] `suggestForQuery(userQuery)` 检测 how-to 问题并返回最多 2 条相关条目
- [ ] 检测关键词：怎么/如何/什么是/为什么/how to/what is/why
- [ ] AI 回答引用 Handbook 时显示 `📖 来自用户手册：{entry title}` 标记
- [ ] 引用标记可点击打开 HandbookViewer

### Handbook UI

- [ ] 命令面板搜索显示 Handbook 条目（独立分类）
- [ ] 点击条目打开 HandbookViewer（Markdown 渲染，只读模式）
- [ ] HandbookBrowser 展示目录结构和条目列表
- [ ] 语言切换时 Handbook 自动切换对应语言版本

### DataSource 抽象层

- [ ] DataSourceRegistry 初始化时加载所有注册 Provider（内置 + config）
- [ ] `query()` 调用链：RateLimiter → Cache → Provider.fetch()
- [ ] 限流：每分钟/每日配额检查，超出抛出 RateLimitError（含 retry_after）
- [ ] 缓存：默认 5 分钟 TTL，可按 Provider 配置
- [ ] 失败重试：最多 2 次，指数退避（1s, 3s）
- [ ] Provider 不可用时返回缓存结果（带 fromCache 标记）
- [ ] FileSystemProvider 强制工作区边界（不访问 workspace 外文件）
- [ ] WorkspaceSearchProvider 复用已有 LocalSearchEngine
- [ ] 所有调用产生 `datasource.fetch` Trace span
- [ ] 敏感配置字段（apiKey）通过 SecureStorage 读取
- [ ] 每日配额耗尽时发射 `datasource:rate-limit-exhausted` 事件

### IPC 集成

- [ ] Handbook IPC 通道注册且类型安全
- [ ] DataSource IPC 通道注册且类型安全
- [ ] Preload API 暴露 handbook / datasource 命名空间

## 依赖关系

### 前置依赖

- [x] TASK030 — AI 模式系统（ContextEngine aiMode 参数）
- [x] TASK032 — 一键优化提示词与命令面板（CommandRegistry + IPC 框架）
- [x] TASK015 — 本地全文搜索（LocalSearchEngine FTS5）
- [x] TASK027 — Tracer SDK（Tracer / TraceStore）
- [x] FileManager（atomicWrite）

### 被依赖任务

- TASK034 — 对话导出（导出时需引用 DataSource 抽象）
- Phase 2 Sprint 4 — 云端搜索接入（将实现新的 DataSourceProvider）

## 参考文档

- [`specs/requirements/phase1/sprint3.4-mode.md`](../../requirements/phase1/sprint3.4-mode.md) — 需求 3.4.5 + 3.4.6
- [`specs/design/architecture.md`](../../design/architecture.md) — 模块划分、进程通信架构
- [`CLAUDE.md`](../../../CLAUDE.md) — 文件即真相、本地优先、AI 建议/人类决策
- `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` — IPC 类型安全设计
- `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` — TypeScript 严格模式

## 技术执行路径

### 架构设计

```
Handbook + DataSource 整体架构

src/main/services/
├── handbook/                            ← 系统 Wiki（新建目录）
│   ├── types.ts                         ← HandbookEntry / HandbookIndex
│   ├── handbook-service.ts              ← HandbookService 主类
│   ├── handbook-indexer.ts              ← FTS5 索引构建器
│   └── index.ts                         ← 统一导出
│
├── datasource/                          ← 外部数据源抽象层（新建目录）
│   ├── types.ts                         ← DataSourceQuery / DataSourceResult / DataSourceProvider
│   ├── data-source-registry.ts          ← DataSourceRegistry 管理器
│   ├── rate-limiter.ts                  ← 限流器
│   ├── providers/
│   │   ├── file-system-provider.ts      ← 文件系统默认 Provider
│   │   └── workspace-search-provider.ts ← 工作区搜索默认 Provider
│   └── index.ts                         ← 统一导出
│
├── ipc/handlers/
│   ├── handbook.ts                      ← IPC: Handbook 搜索/查看/克隆（新建）
│   └── datasource.ts                    ← IPC: 数据源查询/状态（新建）
│
└── (现有模块扩展)
    ├── services/context-engine.ts       ← how-to 问题自动注入 Handbook
    └── shared/types.ts                  ← IPC 通道常量 + 类型扩展

resources/handbook/                      ← Handbook 内容资源
├── index.yaml                           ← 目录结构 + 元数据
├── zh/                                  ← 中文
│   ├── getting-started.md
│   ├── modes/plan.md, analyze.md, review.md, write.md
│   ├── features/memory-system.md, prompt-optimization.md, progress-ledger.md
│   ├── shortcuts.md
│   └── faq.md
└── en/                                  ← 英文（镜像结构）

src/renderer/
├── components/
│   └── handbook/                        ← Handbook UI（新建目录）
│       ├── HandbookViewer.tsx           ← Markdown 查看器
│       ├── HandbookBrowser.tsx          ← 目录浏览器
│       └── HandbookReference.tsx        ← AI 引用标记

数据流向：

Handbook 搜索：
  用户在命令面板输入关键词
    → commandStore.search() → IPC command:search
    → CommandRegistry 搜索（Handbook 命令为框架）
    → 用户选择"搜索手册：{关键词}"
    → IPC handbook:search → HandbookService.search()
      → LocalSearchEngine.query({ query, pathPrefix: 'handbook' })
      → 从 FTS5 索引中获取匹配条目
      → 本地版本优先于内置版本
    → 返回 HandbookEntry[] → 渲染搜索结果
    → 用户点击条目 → HandbookViewer 渲染 Markdown

AI 自动注入 Handbook：
  用户发送消息："Sibylla 怎么用？"
    → ContextEngine.assembleForHarness()
      → handbookService.suggestForQuery(userMessage)
        → 检测 how-to 关键词 → 搜索 Handbook
        → 返回 top 2 相关条目
      → 注入为 context section: '📖 相关用户手册'
    → AI 回答时引用 Handbook → 渲染 HandbookReference 标记

DataSource 查询：
  AI 或用户调用 DataSource
    → DataSourceRegistry.query(providerId, query)
      → Tracer.withSpan('datasource.fetch', ...)
      → 检查每日配额 → 检查缓存 → RateLimiter.acquire()
      → Provider.query()（含 2 次重试）
      → 缓存结果 → 返回 DataSourceResult
```

### 步骤 1：定义 Handbook 共享类型

**文件：** `src/main/services/handbook/types.ts`

1. 定义 `HandbookEntry` 接口：
   ```typescript
   export interface HandbookEntry {
     id: string                       // e.g. 'modes.plan'
     path: string                     // e.g. 'modes/plan.md'
     title: string
     tags: string[]
     language: string
     version: string                  // content hash
     source: 'builtin' | 'local'
     content: string                  // Markdown
     keywords: string[]
     updatedAt: string
   }
   ```

2. 定义 `HandbookIndexMeta` 接口（index.yaml 中单条元数据）：
   ```typescript
   export interface HandbookIndexMeta {
     id: string
     path: string
     title: Record<string, string>    // lang -> title
     tags: string[]
     keywords: string[]
   }
   ```

3. 定义 `HandbookIndex` 接口（index.yaml 顶层结构）：
   ```typescript
   export interface HandbookIndex {
     version: string
     languages: string[]
     entries: HandbookIndexMeta[]
   }
   ```

4. 定义 `HandbookDiff` 接口（更新对比）：
   ```typescript
   export interface HandbookDiff {
     added: string[]                  // 新增条目 ID
     modified: string[]               // 修改条目 ID
     removed: string[]                // 移除条目 ID
   }
   ```

5. 导出所有类型

### 步骤 2：实现 HandbookIndexer

**文件：** `src/main/services/handbook/handbook-indexer.ts`

1. 导出 `HandbookIndexer` 类

2. 构造函数注入：
   - `localSearchEngine: LocalSearchEngine`
   - `logger: Logger`

3. 实现 `indexEntries(entries: HandbookEntry[]): Promise<void>` 方法：
   - 遍历所有 entries，逐一索引到 LocalSearchEngine FTS5：
     ```typescript
     for (const entry of entries) {
       await this.localSearchEngine.indexDocument({
         path: `handbook/${entry.language}/${entry.path}`,
         content: `${entry.title}\n\n${entry.content}\n\n${entry.tags.join(' ')} ${entry.keywords.join(' ')}`,
         fileType: 'md'
       }).catch(() => {
         this.logger.warn('handbook.index.failed', { id: entry.id, language: entry.language })
       })
     }
     ```
   - 使用 catch 保证单条索引失败不阻塞整体初始化

4. 实现 `removeIndex(entries: HandbookEntry[]): Promise<void>` 方法：
   - 遍历 entries，调用 `localSearchEngine.removeDocument(path)` 移除旧索引
   - 用于更新本地 handbook 时先移除旧索引再重新索引

5. 实现 `hashContent(content: string): string` 私有方法：
   - 使用简单 hash 算法生成内容版本标识
   - 用于检测内容是否变更

### 步骤 3：实现 HandbookService 核心

**文件：** `src/main/services/handbook/handbook-service.ts`

1. 构造函数注入：
   ```typescript
   constructor(
     private appResourcesPath: string,
     private workspaceRoot: string,
     private fileManager: FileManager,
     private configManager: ConfigManager,
     private localSearchEngine: LocalSearchEngine,
     private logger: Logger
   )
   ```

2. 内部状态：
   - `builtinEntries: Map<string, HandbookEntry>` — 内置条目（key: `${id}:${lang}`）
   - `localEntries: Map<string, HandbookEntry>` — 本地克隆条目
   - `indexer: HandbookIndexer` — 索引构建器

3. 实现 `initialize()` 方法：
   - 调用 `loadBuiltin()` 加载内置 Handbook
   - 调用 `loadLocal()` 加载本地克隆版
   - 调用 `indexer.indexEntries(allEntries)` 构建 FTS5 索引
   - `this.logger.info('handbook.initialized', { builtin: this.builtinEntries.size, local: this.localEntries.size })`

4. 实现 `loadBuiltin()` 私有方法：
   - 读取 `resources/handbook/index.yaml`
   - 若文件不存在 → `this.logger.error('handbook.builtin.missing')`，return（优雅降级）
   - 解析 YAML 为 `HandbookIndex`
   - 遍历 `index.entries`：
     - 遍历 `index.languages`：
       - 构建文件路径：`path.join(appResourcesPath, 'handbook', lang, entryMeta.path)`
       - 若文件不存在 → skip
       - 读取内容
       - 构建 `HandbookEntry`：`{ id, path, title: entryMeta.title[lang] ?? entryMeta.title['en'], tags, language: lang, version: hashContent(content), source: 'builtin', content, keywords, updatedAt: now }`
       - `this.builtinEntries.set(\`${entry.id}:${lang}\`, entry)`

5. 实现 `loadLocal()` 私有方法：
   - 检查 `.sibylla/handbook-local/` 目录是否存在
   - 若不存在 → return（未克隆）
   - 遍历目录中所有 `.md` 文件：
     - 推断 entry id 和 language（从路径结构推断）
     - 读取内容
     - 构建 `HandbookEntry`（`source: 'local'`）
     - `this.localEntries.set(\`${id}:${lang}\`, entry)`

6. 实现 `search(query: string, options?: { limit?: number; language?: string }): Promise<HandbookEntry[]>` 方法：
   - limit 默认 10，language 默认 `currentLanguage()`
   - 调用 `this.localSearchEngine.query({ query, limit, fileTypes: ['md'], pathPrefix: 'handbook' })`
   - 将搜索结果映射为 HandbookEntry：
     ```typescript
     const entries = results
       .map(r => this.getEntry(this.pathToEntryId(r.path), lang))
       .filter((e): e is HandbookEntry => e !== null)
       .slice(0, limit)
     ```
   - 返回 entries

7. 实现 `getEntry(id: string, language?: string): HandbookEntry | null` 方法：
   - lang = language ?? currentLanguage()
   - key = `${id}:${lang}`
   - 本地优先：`this.localEntries.get(key) ?? this.builtinEntries.get(key)`
   - fallback 英文：`this.builtinEntries.get(\`${id}:en\`)`
   - 最终 fallback：null

8. 实现 `cloneToWorkspace(): Promise<{ clonedCount: number; localPath: string }>` 方法：
   - localPath = `path.join(workspaceRoot, '.sibylla/handbook-local/')`
   - 遍历 builtinEntries：
     - 构建目标路径：`path.join(localPath, entry.language, entry.path)`
     - 若文件已存在 → skip（不覆盖用户本地修改）
     - `await fileManager.atomicWrite(targetPath, entry.content)`
     - count++
   - 写入元数据：`fileManager.atomicWrite(path.join(localPath, '.cloned-from-version'), JSON.stringify({ version: getBuiltinVersion(), clonedAt: now }))`
   - 调用 `loadLocal()` 重新加载本地条目
   - 调用 `indexer.indexEntries(localEntries)` 重新索引
   - 返回 `{ clonedCount: count, localPath }`

9. 实现 `suggestForQuery(userQuery: string): Promise<HandbookEntry[]>` 方法：
   - 检测 how-to 问题：
     ```typescript
     const howToPatterns = [
       /怎么|如何|什么是|为什么|能不能|可以/,
       /how to|what is|why|can i|how can/i
     ]
     const isHowTo = howToPatterns.some(p => p.test(userQuery))
     if (!isHowTo) return []
     ```
   - 调用 `search(userQuery, { limit: 2 })`
   - 返回结果

10. 实现 `checkUpdates(): Promise<{ hasUpdates: boolean; diff?: HandbookDiff }>` 方法：
    - 读取本地 `.cloned-from-version` 获取克隆时版本
    - 对比当前内置版本
    - 比较内置和本地条目的 content hash
    - 构建 HandbookDiff：added / modified / removed
    - 返回对比结果

11. 实现 `currentLanguage(): string` 私有方法：
    - `return this.configManager.getSync('ui.language', 'zh')`

12. 实现 `pathToEntryId(searchPath: string): string` 私有方法：
    - 从 FTS5 搜索结果的 path 中提取 entry id
    - 格式转换：`handbook/zh/modes/plan.md` → `modes.plan`

13. 实现 `getBuiltinVersion(): string` 私有方法：
    - 读取 index.yaml 的 version 字段

### 步骤 4：定义 DataSource 共享类型

**文件：** `src/main/services/datasource/types.ts`

1. 定义 `DataSourceOperation` 联合类型：
   ```typescript
   export type DataSourceOperation = 'fetch' | 'search' | 'list' | 'write'
   ```

2. 定义 `DataSourceQuery` 接口：
   ```typescript
   export interface DataSourceQuery {
     operation: DataSourceOperation
     params: Record<string, unknown>
     timeoutMs?: number
   }
   ```

3. 定义 `DataSourceResult<T>` 接口：
   ```typescript
   export interface DataSourceResult<T = unknown> {
     data: T
     fromCache: boolean
     fetchedAt: string
     providerId: string
     truncated?: boolean
     truncationReason?: string
   }
   ```

4. 定义 `DataSourceProvider` 接口：
   ```typescript
   export interface DataSourceProvider {
     readonly id: string
     readonly name: string
     readonly version: string
     readonly capabilities: DataSourceOperation[]
     initialize(config: ProviderConfig): Promise<void>
     isHealthy(): Promise<boolean>
     query(q: DataSourceQuery): Promise<DataSourceResult>
     dispose(): Promise<void>
   }
   ```

5. 定义 `ProviderConfig` 接口：
   ```typescript
   export interface ProviderConfig {
     [key: string]: unknown
   }
   ```

6. 定义 `ConfigField` 接口：
   ```typescript
   export interface ConfigField {
     type: 'string' | 'number' | 'boolean'
     required?: boolean
     sensitive?: boolean
     default?: unknown
   }
   ```

7. 定义 `ProviderManifest` 接口：
   ```typescript
   export interface ProviderManifest {
     id: string
     name: string
     version: string
     capabilities: DataSourceOperation[]
     configSchema: Record<string, ConfigField>
     rateLimits: {
       requestsPerMinute?: number
       requestsPerDay?: number
       concurrent?: number
     }
     defaultCacheTTLSeconds: number
   }
   ```

8. 定义 `ProviderStatus` 接口：
   ```typescript
   export interface ProviderStatus {
     id: string
     healthy: boolean
     dailyQuotaUsed: number
     dailyQuotaTotal: number
     cacheSize: number
   }
   ```

9. 定义 `RateLimitError` 类：
   ```typescript
   export class RateLimitError extends Error {
     readonly retryAfterMs: number
     constructor(providerId: string, retryAfterMs: number) {
       super(`Rate limit exceeded for ${providerId}. Retry after ${retryAfterMs}ms`)
       this.name = 'RateLimitError'
       this.retryAfterMs = retryAfterMs
     }
   }
   ```

10. 定义 `QuotaExhaustedError` 类：
    ```typescript
    export class QuotaExhaustedError extends Error {
      readonly providerId: string
      readonly resetAt: number
      constructor(providerId: string, resetAt: number) {
        super(`Daily quota exhausted for ${providerId}`)
        this.name = 'QuotaExhaustedError'
        this.providerId = providerId
        this.resetAt = resetAt
      }
    }
    ```

11. 导出所有类型

### 步骤 5：实现 RateLimiter

**文件：** `src/main/services/datasource/rate-limiter.ts`

1. 构造函数：
   ```typescript
   constructor(
     private limits: {
       requestsPerMinute?: number
       requestsPerDay?: number
       concurrent?: number
     }
   )
   ```

2. 内部状态：
   - `minuteBucket: { timestamps: number[] }` — 每分钟请求时间戳
   - `dailyCount: number` — 当日累计请求数
   - `dailyResetAt: number` — 当日配额重置时间戳
   - `activeCount: number` — 当前并发请求数

3. 实现 `acquire(): Promise<void>` 方法：
   - 检查并发限制：
     ```typescript
     if (this.limits.concurrent && this.activeCount >= this.limits.concurrent) {
       throw new RateLimitError('concurrent', 1000)
     }
     ```
   - 检查每分钟限制：
     ```typescript
     this.cleanMinuteBucket()
     if (this.limits.requestsPerMinute && this.minuteBucket.timestamps.length >= this.limits.requestsPerMinute) {
       const waitMs = 60000 - (Date.now() - this.minuteBucket.timestamps[0])
       throw new RateLimitError('per-minute', Math.max(waitMs, 1000))
     }
     ```
   - 通过所有检查后：
     - `this.minuteBucket.timestamps.push(Date.now())`
     - `this.activeCount++`

4. 实现 `release(): void` 方法：
   - `this.activeCount--`

5. 实现 `incrementDaily(): void` 方法：
   - 检查是否需要重置日计数：`if (Date.now() > this.dailyResetAt)`
   - 重置 `dailyCount = 0`，`dailyResetAt = nextDayStart()`
   - `this.dailyCount++`

6. 实现 `isDailyExhausted(): boolean` 方法：
   - `return this.limits.requestsPerDay ? this.dailyCount >= this.limits.requestsPerDay : false`

7. 实现 `cleanMinuteBucket()` 私有方法：
   - 移除 60 秒前的时间戳

8. 实现 `nextDayStart(): number` 私有方法：
   - 计算明天 0:00 的时间戳

### 步骤 6：实现 DataSourceRegistry 核心

**文件：** `src/main/services/datasource/data-source-registry.ts`

1. 构造函数注入：
   ```typescript
   constructor(
     private tracer: Tracer,
     private secureStorage: SecureStorage,
     private eventBus: EventBus,
     private logger: Logger
   )
   ```

2. 内部状态：
   - `providers: Map<string, DataSourceProvider>` — 已注册 Provider
   - `rateLimiters: Map<string, RateLimiter>` — 每 Provider 限流器
   - `cache: LRUCache<string, DataSourceResult>` — 缓存（max 500, ttl 5min）
   - `manifests: Map<string, ProviderManifest>` — Provider manifest 注册表

3. 实现 `registerProvider(provider: DataSourceProvider, manifest: ProviderManifest): Promise<void>` 方法：
   - 若 `this.providers.has(provider.id)` → throw Error('Provider already registered')
   - 加载配置：`const config = await this.loadProviderConfig(provider.id, manifest)`
   - `await provider.initialize(config)`
   - `this.providers.set(provider.id, provider)`
   - `this.rateLimiters.set(provider.id, new RateLimiter(manifest.rateLimits))`
   - `this.manifests.set(provider.id, manifest)`
   - `this.eventBus.emit('datasource:provider-registered', { id: provider.id, name: provider.name })`

4. 实现 `query<T>(providerId: string, query: DataSourceQuery): Promise<DataSourceResult<T>>` 方法：
   - 包裹在 `tracer.withSpan('datasource.fetch', async (span) => { ... }, { kind: 'tool-call' })` 中
   - span.setAttributes：datasource.provider_id、datasource.operation
   - 查找 provider：`const provider = this.providers.get(providerId)`
   - 若不存在 → throw Error('Provider not found')
   - 能力检查：`if (!provider.capabilities.includes(query.operation))` → throw Error
   - **每日配额检查**：
     ```typescript
     const limiter = this.rateLimiters.get(providerId)!
     if (limiter.isDailyExhausted()) {
       span.setAttribute('datasource.quota_exhausted', true)
       const cached = this.getFromCache<T>(providerId, query)
       if (cached) return { ...cached, fromCache: true }
       throw new QuotaExhaustedError(providerId, limiter.getDailyResetAt())
     }
     ```
   - **缓存检查**：
     ```typescript
     const cached = this.getFromCache<T>(providerId, query)
     if (cached) {
       span.setAttribute('datasource.cache_hit', true)
       return { ...cached, fromCache: true }
     }
     ```
   - **限流**：`await limiter.acquire()`（catch RateLimitError → span.setAttribute + throw）
   - **实际调用（含重试）**：`const result = await this.callWithRetry(provider, query, span)`
   - `limiter.release()`、`limiter.incrementDaily()`
   - 缓存结果：`this.saveToCache(providerId, query, result)`
   - 返回 result

5. 实现 `callWithRetry(provider, query, parentSpan)` 私有方法：
   - maxAttempts = 2（最多重试 2 次）
   - 循环 attempt 1..3：
     - try → `const result = await provider.query(query)` → span.setAttribute duration_ms, attempt → return result
     - catch → 若 attempt > maxAttempts → break
     - delay = `1000 * Math.pow(3, attempt - 1)`（1s, 3s）
     - `parentSpan.addEvent('datasource.retry', { attempt, error, delay })`
     - `await sleep(delay)`
   - throw lastError

6. 实现 `getProviderStatus(id: string): ProviderStatus` 方法：
   - 返回 `{ id, healthy, dailyQuotaUsed, dailyQuotaTotal, cacheSize }`

7. 实现 `listProviders(): Array<{ id: string; name: string; capabilities: string[] }>` 方法

8. 实现 `loadProviderConfig(providerId, manifest)` 私有方法：
   - 遍历 manifest.configSchema
   - 对 sensitive 字段通过 `secureStorage.get()` 读取
   - 对非 sensitive 字段从 configManager 读取
   - 返回 ProviderConfig

9. 缓存辅助方法：
   - `getFromCache<T>(providerId, query): DataSourceResult<T> | null`
   - `saveToCache(providerId, query, result): void`
   - cacheKey = `hash({ providerId, operation, params })`

### 步骤 7：实现默认 Provider

**文件：** `src/main/services/datasource/providers/file-system-provider.ts`

1. 实现 `FileSystemProvider`：
   - `id = 'filesystem'`、`name = 'Workspace File System'`、`version = '1.0.0'`
   - `capabilities = ['fetch', 'list']`
   - `initialize()` → 空实现
   - `isHealthy()` → return true
   - `dispose()` → 空实现
   - `query(q)` 方法：
     - `operation === 'fetch'` → 读取文件内容，返回 `{ data: { path, content }, fromCache: false, fetchedAt: now, providerId }`
     - `operation === 'list'` → 列出目录，返回 `{ data: { path, entries }, ... }`
   - `resolveWithinWorkspace(p)` 私有方法：
     - `resolved = path.resolve(workspaceRoot, p)`
     - 若 `!resolved.startsWith(workspaceRoot)` → throw Error('Path outside workspace boundary')
     - 返回 resolved

**文件：** `src/main/services/datasource/providers/workspace-search-provider.ts`

2. 实现 `WorkspaceSearchProvider`：
   - `id = 'workspace-search'`、`name = 'Workspace Search'`、`version = '1.0.0'`
   - `capabilities = ['search']`
   - 构造函数注入 `localSearchEngine: LocalSearchEngine`
   - `query(q)` 方法：
     - `operation === 'search'` → 调用 `localSearchEngine.query({ query: q.params.query, ...q.params })`
     - 返回搜索结果作为 DataSourceResult

### 步骤 8：实现统一导出 + shared/types 扩展

**文件：** `src/main/services/handbook/index.ts`

1. 从 `types.ts` 导出所有类型
2. 从 `handbook-service.ts` 导出 `HandbookService`

**文件：** `src/main/services/datasource/index.ts`

3. 从 `types.ts` 导出所有类型
4. 从 `data-source-registry.ts` 导出 `DataSourceRegistry`
5. 从 `rate-limiter.ts` 导出 `RateLimiter`
6. 从 `providers/` 导出 `FileSystemProvider`、`WorkspaceSearchProvider`

**文件：** `src/shared/types.ts`（扩展）

7. 追加 Handbook IPC 通道：
   ```
   HANDBOOK_SEARCH: 'handbook:search'
   HANDBOOK_GET_ENTRY: 'handbook:getEntry'
   HANDBOOK_CLONE: 'handbook:cloneToWorkspace'
   HANDBOOK_CHECK_UPDATES: 'handbook:checkUpdates'
   ```

8. 追加 DataSource IPC 通道：
   ```
   DATASOURCE_LIST_PROVIDERS: 'datasource:listProviders'
   DATASOURCE_QUERY: 'datasource:query'
   DATASOURCE_GET_PROVIDER_STATUS: 'datasource:getProviderStatus'
   ```

9. 追加 IPCChannelMap 类型映射

10. 追加 Push Event 常量：
    ```
    DATASOURCE_RATE_LIMIT_EXHAUSTED: 'datasource:rate-limit-exhausted'
    DATASOURCE_PROVIDER_REGISTERED: 'datasource:provider-registered'
    ```

### 步骤 9：实现 IPC Handler

**文件：** `src/main/ipc/handlers/handbook.ts`（新建）

1. 注册 `HANDBOOK_SEARCH`：`handbookService.search(query, options)`
2. 注册 `HANDBOOK_GET_ENTRY`：`handbookService.getEntry(id, language)`
3. 注册 `HANDBOOK_CLONE`：`handbookService.cloneToWorkspace()`
4. 注册 `HANDBOOK_CHECK_UPDATES`：`handbookService.checkUpdates()`
5. 所有 handler 包裹 try/catch

**文件：** `src/main/ipc/handlers/datasource.ts`（新建）

6. 注册 `DATASOURCE_LIST_PROVIDERS`：`dataSourceRegistry.listProviders()`
7. 注册 `DATASOURCE_QUERY`：`dataSourceRegistry.query(providerId, query)`
8. 注册 `DATASOURCE_GET_PROVIDER_STATUS`：`dataSourceRegistry.getProviderStatus(id)`
9. 注册 Push Event 转发：
   - `datasource:rate-limit-exhausted`
   - `datasource:provider-registered`

### 步骤 10：Preload API 扩展

**文件：** `src/preload/index.ts`（扩展）

1. 新增 `handbook` 对象：
   ```typescript
   handbook: {
     search: (query: string, options?: { limit?: number; language?: string }) =>
       ipcRenderer.invoke('handbook:search', query, options),
     getEntry: (id: string, language?: string) =>
       ipcRenderer.invoke('handbook:getEntry', id, language),
     cloneToWorkspace: () =>
       ipcRenderer.invoke('handbook:cloneToWorkspace'),
     checkUpdates: () =>
       ipcRenderer.invoke('handbook:checkUpdates'),
   }
   ```

2. 新增 `datasource` 对象：
   ```typescript
   datasource: {
     listProviders: () =>
       ipcRenderer.invoke('datasource:listProviders'),
     query: (providerId: string, query: DataSourceQuery) =>
       ipcRenderer.invoke('datasource:query', providerId, query),
     getProviderStatus: (id: string) =>
       ipcRenderer.invoke('datasource:getProviderStatus', id),
   }
   ```

### 步骤 11：ContextEngine 集成（Handbook 自动注入）

**文件：** `src/main/services/context-engine.ts`（扩展）

1. 注入 HandbookService 依赖：
   - 新增 `setHandbookService(hs: HandbookService): void` 方法

2. 在 `assembleForHarness()` 方法中扩展：
   - 在现有 context sections 构建过程中，插入 Handbook 自动注入逻辑：
   ```typescript
   const handbookEntries = await this.handbookService?.suggestForQuery(request.userMessage)
   if (handbookEntries && handbookEntries.length > 0) {
     sections.push({
       type: 'handbook',
       label: '📖 相关用户手册',
       content: handbookEntries.map(e =>
         `### ${e.title}\n\n${this.truncate(e.content, 800)}\n\n_引用时请标注：[Handbook: ${e.id}]_`
       ).join('\n\n---\n\n'),
       metadata: { entries: handbookEntries.map(e => ({ id: e.id, title: e.title })) }
     })
     span.setAttribute('context.handbook_entries', handbookEntries.length)
   }
   ```

3. AI 引用 Handbook 的渲染处理（渲染进程侧）：
    - 当 AI 回答中包含 `[Handbook: xxx]` 标记时，渲染进程替换为可点击的 `<HandbookReference />` 组件

### 步骤 12：实现 Handbook UI 组件

**文件：** `src/renderer/components/handbook/HandbookViewer.tsx`（新建）

1. Props 接口：
   ```typescript
   interface HandbookViewerProps {
     entryId: string
     language?: string
   }
   ```

2. 内部状态：
   - `entry: HandbookEntry | null`
   - `loading: boolean`

3. 挂载时获取条目：
   - `const entry = await window.sibylla.handbook.getEntry(entryId, language)`
   - `setEntry(entry)`

4. 渲染逻辑：
   - loading 时显示 spinner
   - entry 为 null 时显示 "条目未找到"
   - entry 存在时：
     - **头部**：标题 + 来源标签 `(内置)` / `(本地)` + 语言标签
     - **内容区**：Markdown 渲染（复用已有的 Markdown 渲染组件或 Tiptap 只读模式）
     - **底部**：最后更新时间 + 相关条目链接（基于 tags 匹配）

**文件：** `src/renderer/components/handbook/HandbookBrowser.tsx`（新建）

5. 功能：展示 Handbook 目录结构和条目列表
6. 渲染逻辑：
   - **目录树**：按 `modes/`、`features/`、`shortcuts`、`faq` 分组
   - **搜索框**：输入关键词 → 调用 `window.sibylla.handbook.search(query)`
   - **搜索结果**：条目列表，点击打开 HandbookViewer
   - **空状态**：无搜索结果时显示提示

**文件：** `src/renderer/components/handbook/HandbookReference.tsx`（新建）

7. Props 接口：
   ```typescript
   interface HandbookReferenceProps {
     entryId: string
     title: string
   }
   ```

8. 渲染逻辑：
   - 渲染为可点击标签：`📖 来自用户手册：{title}`
   - 点击 → 打开 HandbookViewer（侧面板或新窗口）
   - 样式：蓝色背景 pill，hover 下划线

### 步骤 13：创建 Handbook 资源文件框架

**目录：** `resources/handbook/`

1. 创建 `index.yaml`：
   ```yaml
   version: "1.0.0"
   languages: [zh, en]
   entries:
     - id: getting-started
       path: getting-started.md
       title: { zh: "快速开始", en: "Getting Started" }
       tags: [intro, basics]
       keywords: [开始, 入门, 安装, setup, install]
     - id: modes.plan
       path: modes/plan.md
       title: { zh: "Plan 模式", en: "Plan Mode" }
       tags: [mode, plan]
       keywords: [计划, 规划, 步骤, plan, steps]
     - id: modes.analyze
       path: modes/analyze.md
       title: { zh: "Analyze 模式", en: "Analyze Mode" }
       tags: [mode, analyze]
       keywords: [分析, 对比, analyze, compare]
     - id: modes.review
       path: modes/review.md
       title: { zh: "Review 模式", en: "Review Mode" }
       tags: [mode, review]
       keywords: [审查, review, code review]
     - id: modes.write
       path: modes/write.md
       title: { zh: "Write 模式", en: "Write Mode" }
       tags: [mode, write]
       keywords: [撰写, 写作, write, document]
     - id: features.memory-system
       path: features/memory-system.md
       title: { zh: "记忆系统", en: "Memory System" }
       tags: [feature, memory]
       keywords: [记忆, 上下文, memory, context]
     - id: features.prompt-optimization
       path: features/prompt-optimization.md
       title: { zh: "提示词优化", en: "Prompt Optimization" }
       tags: [feature, optimization]
       keywords: [优化, 提示词, prompt, optimize]
     - id: features.progress-ledger
       path: features/progress-ledger.md
       title: { zh: "任务台账", en: "Progress Ledger" }
       tags: [feature, progress]
       keywords: [任务, 进度, task, progress]
     - id: shortcuts
       path: shortcuts.md
       title: { zh: "快捷键", en: "Keyboard Shortcuts" }
       tags: [shortcuts, reference]
       keywords: [快捷键, 键盘, shortcut, keyboard]
     - id: faq
       path: faq.md
       title: { zh: "常见问题", en: "FAQ" }
       tags: [faq, help]
       keywords: [FAQ, 常见问题, 问题, question]
   ```

2. 创建核心中文条目文件（`zh/` 下）：
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

3. 每个条目文件为简短框架（200-500 字），包含：
   - 标题
   - 简介（1-2 句）
   - 使用步骤
   - 提示与注意事项

4. 英文版（`en/` 下）为镜像结构，可暂时为空或占位

### 步骤 14：命令面板 Handbook 命令完善

**文件：** `src/main/services/command/builtin-commands/handbook-commands.ts`（扩展 TASK032 框架）

1. 将 `handbook.browse` 命令的 execute 升级为实际实现：
   - `eventBus.emit('handbook:browse')` → 触发渲染进程打开 HandbookBrowser 面板

2. 将 `handbook.cloneToWorkspace` 命令升级：
   - 调用 `handbookService.cloneToWorkspace()` → 返回克隆结果 → 通知渲染进程

3. 新增 `handbook.search` 命令（动态搜索）：
   - id: `handbook.search`
   - title: "搜索手册：{输入关键词}"
   - category: "Handbook"
   - execute: 打开命令面板搜索 handbook 条目

### 步骤 15：主进程初始化与装配

**文件：** `src/main/index.ts`（扩展）

1. 在 `onWorkspaceOpened` 中创建 HandbookService：
   ```typescript
   const handbookService = new HandbookService(
     appResourcesPath, workspaceRoot, fileManager, configManager, localSearchEngine, logger
   )
   await handbookService.initialize()
   ```

2. 在 `onWorkspaceOpened` 中创建 DataSourceRegistry：
   ```typescript
   const dataSourceRegistry = new DataSourceRegistry(tracer, secureStorage, appEventBus, logger)
   const fsProvider = new FileSystemProvider(fileManager, workspaceRoot)
   const wsProvider = new WorkspaceSearchProvider(localSearchEngine)
   await dataSourceRegistry.registerProvider(fsProvider, FILESYSTEM_MANIFEST)
   await dataSourceRegistry.registerProvider(wsProvider, WORKSPACE_SEARCH_MANIFEST)
   ```

3. 注入到 ContextEngine：
   ```typescript
   contextEngine.setHandbookService(handbookService)
   ```

4. 注册 IPC Handler：
   ```typescript
   registerHandbookHandlers(ipcMain, handbookService, logger)
   registerDatasourceHandlers(ipcMain, dataSourceRegistry, logger)
   ```

5. 注册 EventBus → Renderer 推送：
   ```typescript
   appEventBus.on('datasource:rate-limit-exhausted', (data) => mainWindow.webContents.send('datasource:rate-limit-exhausted', data))
   appEventBus.on('datasource:provider-registered', (data) => mainWindow.webContents.send('datasource:provider-registered', data))
   ```

## 测试计划

### 单元测试文件结构

```
tests/handbook/
├── handbook-service.test.ts            ← HandbookService 核心逻辑测试
└── handbook-indexer.test.ts            ← 索引构建器测试

tests/datasource/
├── data-source-registry.test.ts        ← DataSourceRegistry 测试
├── rate-limiter.test.ts                ← 限流器测试
├── file-system-provider.test.ts        ← FileSystemProvider 测试
└── workspace-search-provider.test.ts   ← WorkspaceSearchProvider 测试
```

### handbook-service.test.ts 测试用例

1. **initialize loads builtin** — 从 resources/handbook/ 正确加载所有内置条目
2. **initialize graceful degradation** — resources 不存在时不崩溃，日志 error
3. **load local overrides** — 本地版本优先于内置版本
4. **search returns results** — 全文搜索返回匹配条目
5. **search respects limit** — 限制返回数量
6. **search respects language** — 按语言过滤结果
7. **get entry by id** — 返回指定 id + language 的条目
8. **get entry fallback to english** — 中文缺失时回退英文
9. **get entry not found** — id 不存在时返回 null
10. **clone to workspace** — 复制所有内置条目到本地目录
11. **clone preserves existing** — 已存在的本地文件不被覆盖
12. **clone writes metadata** — .cloned-from-version 文件包含版本和时间戳
13. **suggest for how-to query** — "怎么"关键词触发搜索
14. **suggest ignores non-how-to** — 非问题类输入返回空
15. **suggest limits to 2** — 最多返回 2 条
16. **check updates detects changes** — 内置与本地版本不同时返回 diff
17. **local entry tagged as local** — 本地条目 source='local'

### data-source-registry.test.ts 测试用例

1. **register provider** — 注册后 listProviders 包含该 Provider
2. **register duplicate** — 重复 ID 抛错
3. **query success** — 调用成功返回 DataSourceResult
4. **query caches result** — 第二次相同查询命中缓存
5. **query capability check** — 不支持的 operation 抛错
6. **query not found** — Provider 不存在时抛错
7. **daily quota exhausted** — 超出日配额时抛 QuotaExhaustedError
8. **daily quota fallback to cache** — 配额耗尽时返回缓存结果
9. **rate limit exceeded** — 超出每分钟限制时抛 RateLimitError
10. **retry on failure** — Provider 失败后重试 2 次
11. **retry exponential backoff** — 重试间隔为 1s, 3s
12. **all queries produce trace** — 每次查询产生 datasource.fetch span
13. **sensitive config from secure storage** — sensitive 字段通过 SecureStorage 读取
14. **daily quota reset** — 跨日后配额重置

### rate-limiter.test.ts 测试用例

1. **acquire under limit** — 未超限时 acquire 成功
2. **acquire per minute exceeded** — 超出每分钟限制时抛 RateLimitError
3. **acquire concurrent exceeded** — 超出并发限制时抛 RateLimitError
4. **release decrements active** — release 后 activeCount 递减
5. **daily count increments** — incrementDaily 后计数正确
6. **daily exhausted** — 达到日配额时 isDailyExhausted 返回 true
7. **daily reset on new day** — 跨日后 dailyCount 重置

### file-system-provider.test.ts 测试用例

1. **fetch file within workspace** — 读取工作区内文件成功
2. **fetch file outside workspace** — 路径超出工作区时抛错
3. **list directory** — 列出目录内容成功
4. **unsupported operation** — write 操作抛错
5. **is healthy** — 始终返回 true

### workspace-search-provider.test.ts 测试用例

1. **search delegates to engine** — 查询委托给 LocalSearchEngine
2. **search returns results** — 返回搜索结果
3. **unsupported operation** — fetch 操作抛错
