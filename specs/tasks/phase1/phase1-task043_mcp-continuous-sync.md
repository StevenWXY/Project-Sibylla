# MCP 持续同步调度

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK043 |
| **任务标题** | MCP 持续同步调度 |
| **所属阶段** | Phase 1 - 迁移、导入与 MCP 集成 (Sprint 3.6) |
| **优先级** | P1 |
| **复杂度** | 高 |
| **预估工时** | 3-4 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

构建 Sprint 3.6 的 MCP 持续同步调度器——将 MCP 工具配置为"数据订阅源"，实现从外部数据源（GitHub issues、Slack 消息等）到 Sibylla workspace 的持续性知识流入。这是 Sprint 3.6 的核心创新点，让 Sibylla 从"一次性导入工具"进化为"持续知识汇聚平台"。

### 背景

TASK042 建立了 MCP 客户端核心（连接/工具调用/权限/凭证）。本任务在其上构建持续同步调度层。当前 Sibylla 的数据流入仅有手动导入一种方式：

| 问题 | 现状 | 有持续同步后 |
|------|------|-------------|
| GitHub issue 更新 | 用户手动导入 | 每 30 分钟自动同步 |
| Slack 重要消息 | 用户复制粘贴 | 每小时自动归档 |
| 信息过时 | 静态快照 | 持续更新的活数据 |
| 人工维护成本高 | 每次手动操作 | 配置后自动运行 |

**核心设计约束**：

1. **Pull-based 架构**：采用定时拉取而非实时推送，避免对系统稳定性的冲击
2. **职责分离**：MCP Sync 独立于 Git SyncManager，通过 `FileManager.writeFile()` 写入，由现有 AutoSaveManager → GitAbstraction 自动纳入 Git 管理
3. **增量同步**：基于 `updated_at` 或 etag 避免重复拉取
4. **独立调度器**：MCP Sync 使用独立定时器，不与 SyncManager 共享调度器
5. **状态持久化**：同步状态存储于 `.sibylla/mcp/sync-state.json`，应用重启后可恢复
6. **错误容忍**：连续 3 次失败后暂停并通知用户

### 范围

**包含：**

- McpSyncManager — 持续同步调度器（Pull-based）
- 同步任务定义 — SyncTaskConfig（数据源/频率/目标路径/转换模板）
- 同步状态管理 — SyncState（last_sync_at / cursor / error_count）
- 增量同步 — 基于 updated_at / etag / cursor 避免重复拉取
- 同步写入 — FileManager.writeFile() + AutoSaveManager 自动提交
- 预置同步场景模板 — 6 个场景（GitHub issues/PRs、Slack、Discord、浏览器、Zotero）
- IPC 通道 — configureSync / triggerSync / syncProgress
- ContextEngine 引用语法扩展 — `@github:issue-123` 引用外部数据源
- 同步冲突策略 — last-write-wins + history preserved
- 单元测试

**不包含：**

- MCP 客户端核心（TASK042）
- 首次引导 UI（TASK044）
- 实时 Push 通知（未来规划，Sprint 3.6 仅 Pull-based）
- Embedding 索引自动建立（Sprint 4 的能力，本任务仅写入文件）

## 依赖关系

### 前置依赖

- [x] TASK042 — MCP 客户端核心与模板系统（MCPClient + MCPRegistry + MCPCredentials 已可用）
- [x] TASK005 — 自动保存与提交（AutoSaveManager + GitAbstraction 已可用）
- [x] TASK001 — 文件树浏览器（FileManager 已可用）

### 被依赖任务

- TASK044 — Aha Moment 首次引导体验（MCP 连接步骤可选引用同步场景）

## 参考文档

- [`specs/requirements/phase1/sprint3.6-MCP.md`](../../requirements/phase1/sprint3.6-MCP.md) — 需求 2.5、§3.1、§6.2
- [`specs/design/architecture.md`](../../design/architecture.md) — SyncManager 架构、上下文引擎
- [`CLAUDE.md`](../../../CLAUDE.md) — 文件即真相、本地优先
- `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` — TypeScript 严格模式
- `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` — IPC 类型安全设计
- `.kilocode/skills/phase1/ai-context-engine/SKILL.md` — 上下文引擎设计指南

## 验收标准

### McpSyncManager 调度器

- [ ] `src/main/services/mcp/mcp-sync.ts` 创建
- [ ] 支持 Pull-based 定时拉取，每个同步任务有独立的调度间隔
- [ ] 支持手动触发同步（IPC 调用）
- [ ] 同步任务运行在独立后台进程，不阻塞用户交互
- [ ] 同一同步任务最多 1 个活跃实例（防止并发冲突）
- [ ] 应用重启后从 sync-state.json 恢复同步任务

### 同步任务配置

- [ ] SyncTaskConfig 类型定义：serverName、toolName、args、intervalMinutes、targetPath、conflictStrategy
- [ ] 支持配置同步频率：每 30 分钟 / 每小时 / 每天 / 用户触发
- [ ] 支持配置目标路径和文件名模板（如 `docs/logs/slack/YYYY-MM-DD.md`）
- [ ] 配置持久化到 `.sibylla/mcp/sync-tasks.json`

### 同步状态管理

- [ ] SyncState 类型定义：taskId、lastSyncAt、cursor、errorCount、status（active/paused/error）
- [ ] 每次同步成功后更新 lastSyncAt 和 cursor
- [ ] 同步失败时递增 errorCount
- [ ] 连续 3 次失败后暂停同步任务并通知用户
- [ ] 状态持久化到 `.sibylla/mcp/sync-state.json`

### 增量同步

- [ ] 基于 `updated_at` 时间戳的增量同步（拉取 lastSyncAt 之后的新数据）
- [ ] 基于 cursor / etag 的增量同步（支持分页数据源）
- [ ] 首次同步拉取全部数据（全量）
- [ ] 后续同步仅拉取增量数据

### 同步写入

- [ ] 同步数据通过 `FileManager.writeFile()` 写入文件系统
- [ ] 由现有 `AutoSaveManager` → `GitAbstraction.commit()` 自动纳入 Git 管理
- [ ] 同步产生的文件自动触发 `LocalSearchEngine` 索引更新
- [ ] 冲突策略：last-write-wins + history preserved（旧版本通过 Git 保留）
- [ ] 写入文件格式为 Markdown（符合"文件即真相"原则）

### 预置同步场景模板

- [ ] GitHub issues → 追加到项目 `tasks.md`，每 30 分钟
- [ ] GitHub PRs → `.sibylla/inbox/prs/`，每 30 分钟
- [ ] Slack 重要频道 → `docs/logs/slack/YYYY-MM-DD.md`，每小时
- [ ] Discord 公告 → `docs/announcements/`，每天
- [ ] 浏览器"稍后读" → `docs/reading/inbox/`，用户触发
- [ ] Zotero 新增文献 → `docs/references/`，每天

### ContextEngine 引用语法扩展

- [ ] `@github:issue-123` 语法在 `ContextEngine.extractFileReferences()` 中扩展解析
- [ ] 解析后自动加载对应的同步数据文件内容到上下文
- [ ] 不存在的引用给出提示但不崩溃

### IPC 通道

- [ ] `mcp:configureSync`（R→M）— 配置/更新同步任务
- [ ] `mcp:triggerSync`（R→M）— 手动触发同步
- [ ] `mcp:syncProgress`（M→R）— 同步进度推送
- [ ] `mcp:listSyncTasks`（R→M）— 列出所有同步任务及状态
- [ ] `mcp:pauseSync`（R→M）— 暂停同步任务
- [ ] `mcp:resumeSync`（R→M）— 恢复同步任务

### 单元测试

- [ ] McpSyncManager 定时调度测试
- [ ] 增量同步（基于 updated_at）测试
- [ ] 增量同步（基于 cursor）测试
- [ ] 连续失败暂停测试
- [ ] 状态持久化和恢复测试
- [ ] 同步写入（FileManager 集成）测试
- [ ] @github:issue-123 引用解析测试
- [ ] 覆盖率 ≥ 80%

## 技术策略

### 核心架构：Pull-based 持续同步

```
McpSyncManager
       │
       ├── 同步任务列表（从 .sibylla/mcp/sync-tasks.json 加载）
       │   └── task1: { serverName: 'github', toolName: 'list_issues', interval: 30min, ... }
       │   └── task2: { serverName: 'slack', toolName: 'get_messages', interval: 60min, ... }
       │
       ├── 独立定时器（不与 SyncManager 共享）
       │   └── setInterval per task
       │
       ├── 同步执行流程：
       │   ├── 1. MCPClient.callTool(server, tool, args) → 拉取数据
       │   ├── 2. 数据转换（JSON → Markdown）
       │   ├── 3. FileManager.writeFile(targetPath, content) → 写入文件
       │   ├── 4. AutoSaveManager → GitAbstraction.commit() → 自动提交
       │   ├── 5. LocalSearchEngine 索引更新（触发）
       │   └── 6. 更新 SyncState（lastSyncAt / cursor）
       │
       └── 错误处理：
           ├── 单次失败：记录错误，继续下次调度
           ├── 连续 3 次失败：暂停任务，通知用户
           └── 用户手动恢复后重置 errorCount
```

### 与 SyncManager 的职责分离

```
SyncManager（现有）                    McpSyncManager（本任务）
       │                                      │
       ├── 负责 Git push/pull 同步             ├── 负责从外部数据源拉取数据
       ├── 工作区自身的版本同步                ├── 写入文件到 workspace
       ├── 使用 SyncManager 的调度器           ├── 使用独立定时器
       │                                      ├── 通过 FileManager.writeFile() 间接纳入 Git
       │                                      └── 不直接调用 SyncManager
       │                                      │
       └────── 两者完全独立，互不影响 ──────────┘
```

### 数据流转

```
外部数据源（GitHub/Slack/...）
       │
       ▼ MCPClient.callTool()
       │
原始数据（JSON）
       │
       ▼ SyncDataTransformer.transform()
       │
Markdown 内容
       │
       ▼ FileManager.writeFile()
       │
workspace 文件（docs/logs/slack/2026-04-24.md）
       │
       ▼ AutoSaveManager（被动监听）
       │
GitAbstraction.commit()
       │
       ▼ LocalSearchEngine（被动触发）
       │
索引更新（可被 AI 上下文引擎检索）
```

### 增量同步策略

```
首次同步（全量）：
  lastSyncAt = null → 拉取全部数据
  cursor = null → 从头开始

后续同步（增量）：
  基于 updated_at：
    args.since = lastSyncAt
    → 仅拉取 lastSyncAt 之后更新的数据

  基于 cursor/etag：
    args.cursor = state.cursor
    → 仅拉取 cursor 之后的数据

  追加模式 vs 覆盖模式：
    追加模式（日志类）→ 追加到文件末尾
    覆盖模式（状态类）→ 整体替换文件（last-write-wins）
```

## 技术执行路径

### 步骤 1：定义同步共享类型

**文件：** `src/main/services/mcp/types.ts`（扩展 TASK042 已创建的文件）

1. 新增同步任务配置类型：
   ```typescript
   export interface SyncTaskConfig {
     id: string
     name: string
     serverName: string
     toolName: string
     args: Record<string, unknown>
     intervalMinutes: number           // 0 = 仅手动触发
     targetPath: string                // 文件名模板，如 docs/logs/slack/YYYY-MM-DD.md
     writeMode: 'append' | 'replace'   // 追加或覆盖
     transformTemplate?: string        // 数据转换模板
     enabled: boolean
   }
   ```

2. 新增同步状态类型：
   ```typescript
   export interface SyncState {
     taskId: string
     lastSyncAt: number | null
     cursor: string | null
     errorCount: number
     status: 'active' | 'paused' | 'error'
     lastError?: string
     lastSyncDurationMs?: number
     totalSyncedItems?: number
   }
   ```

3. 新增同步进度类型：
   ```typescript
   export interface SyncProgress {
     taskId: string
     taskName: string
     status: 'running' | 'success' | 'error'
     itemsSynced: number
     durationMs: number
     error?: string
     timestamp: number
   }
   ```

4. 新增同步场景模板类型：
   ```typescript
   export interface SyncScenarioTemplate {
     id: string
     name: string
     description: string
     serverTemplateId: string          // 对应 MCP 模板 ID
     toolName: string
     defaultArgs: Record<string, unknown>
     defaultIntervalMinutes: number
     targetPathTemplate: string
     writeMode: 'append' | 'replace'
     transformTemplate: string
   }
   ```

**验证：** TypeScript 编译通过。

### 步骤 2：实现 McpSyncManager 调度核心

**文件：** `src/main/services/mcp/mcp-sync.ts`（新建）

1. 构造函数注入依赖：
   ```typescript
   export class McpSyncManager {
     private tasks = new Map<string, SyncTaskConfig>()
     private states = new Map<string, SyncState>()
     private timers = new Map<string, NodeJS.Timeout>()
     private activeRuns = new Set<string>()      // 正在运行的任务 ID

     constructor(
       private readonly client: MCPClient,
       private readonly registry: MCPRegistry,
       private readonly fileManager: FileManager,
       private readonly statePath: string,        // .sibylla/mcp/sync-state.json
       private readonly tasksPath: string,        // .sibylla/mcp/sync-tasks.json
       private readonly logger: Logger,
       private readonly onProgress?: (progress: SyncProgress) => void,
     ) {}
   }
   ```

2. 实现 `async initialize(): Promise<void>`：
   ```
   a. 从 sync-tasks.json 加载同步任务配置
   b. 从 sync-state.json 加载同步状态
   c. 对每个 enabled 且 status !== 'error' 的任务：
      - 启动定时器
      - 如果上次同步时间距今超过间隔，立即触发一次
   d. 记录启动日志
   ```

3. 实现 `async addTask(config: SyncTaskConfig): Promise<void>`：
   - 验证 serverName 对应的服务已连接
   - 验证 toolName 对应的工具存在
   - 创建初始 SyncState（lastSyncAt: null, cursor: null, errorCount: 0）
   - 保存配置到 sync-tasks.json
   - 启动定时器

4. 实现 `async removeTask(taskId: string): Promise<void>`：
   - 停止定时器
   - 从 tasks Map 中移除
   - 从 states Map 中移除
   - 更新 sync-tasks.json 和 sync-state.json

5. 实现 `async triggerSync(taskId: string): Promise<SyncProgress>`：
   ```
   a. 检查是否已在运行（activeRuns）
   b. 获取 task 和 state
   c. 构建增量参数：
      if state.lastSyncAt:
        args.since = state.lastSyncAt  (或 args.cursor = state.cursor)
   d. 调用 MCPClient.callTool(task.serverName, task.toolName, args)
   e. 转换数据为 Markdown
   f. 写入文件（FileManager.writeFile）
   g. 更新 SyncState（lastSyncAt = Date.now(), cursor = newCursor）
   h. 重置 errorCount = 0
   i. 推送进度回调
   j. 返回 SyncProgress
   ```

6. 实现 `private startTimer(taskId: string)`：
   ```typescript
   private startTimer(taskId: string): void {
     const task = this.tasks.get(taskId)
     if (!task || task.intervalMinutes === 0) return  // 仅手动触发

     const intervalMs = task.intervalMinutes * 60 * 1000
     const timer = setInterval(async () => {
       await this.triggerSync(taskId)
     }, intervalMs)

     this.timers.set(taskId, timer)
   }
   ```

7. 实现 `pauseTask(taskId: string)` / `resumeTask(taskId: string)`：
   - `pauseTask`：清除定时器，更新 status 为 'paused'
   - `resumeTask`：重新启动定时器，重置 errorCount，更新 status 为 'active'

8. 实现 `private handleError(taskId: string, error: Error): void`：
   ```
   state.errorCount++
   state.lastError = error.message
   if state.errorCount >= 3:
     state.status = 'error'
     this.pauseTask(taskId)
     this.onProgress?.({
       taskId, taskName: task.name,
       status: 'error', itemsSynced: 0, durationMs: 0,
       error: `连续 ${state.errorCount} 次同步失败，已暂停。最后错误: ${error.message}`,
       timestamp: Date.now(),
     })
   ```

9. 实现 `async shutdown(): Promise<void>`：
   - 清除所有定时器
   - 等待活跃运行完成（最多 5 秒）
   - 持久化状态

**验证：** 调度器正确启动/停止、定时触发正确、手动触发正确、连续失败暂停正确。

### 步骤 3：实现数据转换与写入

**文件：** `src/main/services/mcp/sync-data-transformer.ts`（新建）

1. 实现 `transform(rawData: unknown, template: string): string`：
   - 将 MCP 工具返回的 JSON 数据转换为 Markdown
   - 支持内置转换模板：
     - `github-issues` → Markdown 列表（#编号 标题 状态）
     - `github-prs` → Markdown 列表（#编号 标题 作者 状态）
     - `slack-messages` → 按日期分组的 Markdown（## 频道名 YYYY-MM-DD）
     - `generic-list` → 通用 Markdown 列表
   - 自定义模板使用简单变量替换（`{{title}}`、`{{body}}` 等）

2. 实现 `transformGitHubIssues(data: unknown): string`：
   ```typescript
   private transformGitHubIssues(data: { items: GitHubIssue[] }): string {
     return data.items.map(issue =>
       `- #${issue.number} ${issue.title} [${issue.state}] ${issue.html_url}`
     ).join('\n')
   }
   ```

3. 实现 `transformSlackMessages(data: unknown): string`：
   - 按频道分组
   - 每条消息：`> **@author** (HH:mm): message_text`
   - 日期作为文件名的一部分

4. 实现 `resolveTargetPath(template: string, now: Date): string`：
   - 替换模板变量：`YYYY` → 年、`MM` → 月、`DD` → 日
   - 例：`docs/logs/slack/YYYY-MM-DD.md` → `docs/logs/slack/2026-04-24.md`

**文件：** `src/main/services/mcp/mcp-sync.ts`（步骤 2 已创建，此处扩展）

5. 在 `triggerSync()` 中集成数据转换和写入：
   ```
   d. 调用 MCPClient.callTool() → rawResult
   e. 转换数据：
      transformer = new SyncDataTransformer()
      markdown = transformer.transform(rawResult, task.transformTemplate)
   f. 解析目标路径：
      targetPath = transformer.resolveTargetPath(task.targetPath, new Date())
   g. 写入文件：
      if task.writeMode === 'append':
        existingContent = await fileManager.readFile(targetPath) ?? ''
        content = existingContent + '\n\n' + markdown
      else:
        content = markdown
      await fileManager.writeFile(targetPath, content)
      // AutoSaveManager 会自动检测变更并触发 GitAbstraction.commit()
   ```

**验证：** GitHub issues 转换为 Markdown 正确、Slack 消息转换正确、目标路径解析正确、追加/覆盖模式正确。

### 步骤 4：实现预置同步场景模板 + ContextEngine 引用语法扩展

**文件：** `resources/mcp-sync-scenarios/`（新建目录）

1. 创建 6 个预置同步场景模板（JSON 格式）：

   **github-issues.json**：
   ```json
   {
     "id": "github-issues",
     "name": "GitHub Issues 同步",
     "description": "定期同步指定仓库的 issues 到工作区",
     "serverTemplateId": "github",
     "toolName": "list_issues",
     "defaultArgs": { "state": "open", "sort": "updated", "direction": "desc" },
     "defaultIntervalMinutes": 30,
     "targetPathTemplate": "docs/github/{repo}/issues.md",
     "writeMode": "replace",
     "transformTemplate": "github-issues"
   }
   ```

   **github-prs.json**：类似，toolName = "list_prs"，targetPath = ".sibylla/inbox/prs/{repo}.md"

   **slack-messages.json**：interval = 60min，targetPath = "docs/logs/slack/YYYY-MM-DD.md"，writeMode = "append"

   **discord-announcements.json**：interval = 1440min（每天），targetPath = "docs/announcements/YYYY-MM.md"

   **browser-read-later.json**：interval = 0（仅手动触发），targetPath = "docs/reading/inbox/YYYY-MM-DD.md"

   **zotero-references.json**：interval = 1440min，targetPath = "docs/references/YYYY-MM.md"

**文件：** `src/main/services/mcp/mcp-templates.ts`（扩展 TASK042 或新建）

2. 实现 `loadSyncScenarioTemplates(): SyncScenarioTemplate[]`：
   - 扫描 `resources/mcp-sync-scenarios/` 目录
   - 解析每个 JSON 文件为 SyncScenarioTemplate

3. 实现 `createSyncTaskFromScenario(scenario: SyncScenarioTemplate, userConfig: Partial<SyncTaskConfig>): SyncTaskConfig`：
   - 合并默认配置和用户自定义配置
   - 生成唯一 taskId

**文件：** `src/main/services/context-engine/context-engine.ts`（修改）

4. 扩展 `extractFileReferences()` 方法支持 `@github:issue-123` 语法：
   ```typescript
   // 原有：@文件名 → 文件引用
   // 新增：@github:issue-123 → MCP 同步数据引用

   private extractExternalReferences(text: string): ExternalReference[] {
     const pattern = /@(github|slack|gitlab|notion):([\w-]+)\/?(#\d+)?/g
     const refs: ExternalReference[] = []
     let match
     while ((match = pattern.exec(text)) !== null) {
       refs.push({
         source: match[1],       // github
         resource: match[2],     // issue
         identifier: match[3],   // #123
       })
     }
     return refs
   }
   ```

5. 实现 `private resolveExternalReference(ref: ExternalReference): string | null`：
   - 根据引用查找对应的同步数据文件
   - `@github:issue-123` → 查找 `docs/github/{repo}/issues.md` 中匹配 #123 的内容
   - 找到则返回相关内容片段
   - 找不到返回 null（不崩溃，给出提示）

**验证：** 6 个场景模板格式正确、场景创建同步任务正确、@github:issue-123 引用解析正确。

### 步骤 5：实现 IPC 通道 + 渲染进程 API

**文件：** `src/main/ipc/handlers/mcp.ts`（修改 TASK042 创建的文件）

1. 注册 `mcp:configureSync` handler：
   ```typescript
   ipcMain.handle('mcp:configureSync', async (_, config: SyncTaskConfig) => {
     if (config.id) {
       await syncManager.addTask(config)
     } else {
       await syncManager.updateTask(config)
     }
     return { success: true }
   })
   ```

2. 注册 `mcp:triggerSync` handler：
   ```typescript
   ipcMain.handle('mcp:triggerSync', async (_, taskId: string) => {
     const progress = await syncManager.triggerSync(taskId)
     return progress
   })
   ```

3. 注册 `mcp:listSyncTasks` handler：
   - 返回所有同步任务及其状态

4. 注册 `mcp:pauseSync` / `mcp:resumeSync` handler

5. `mcp:syncProgress` push 事件（Main → Renderer）：
   - syncManager 的 onProgress 回调中推送
   - `mainWindow.webContents.send('mcp:syncProgress', progress)`

**文件：** `src/shared/types.ts`（扩展）

6. 新增同步 IPC 通道常量：
   ```typescript
   MCP_CONFIGURE_SYNC: 'mcp:configureSync',
   MCP_TRIGGER_SYNC: 'mcp:triggerSync',
   MCP_SYNC_PROGRESS: 'mcp:syncProgress',
   MCP_LIST_SYNC_TASKS: 'mcp:listSyncTasks',
   MCP_PAUSE_SYNC: 'mcp:pauseSync',
   MCP_RESUME_SYNC: 'mcp:resumeSync',
   ```

**文件：** `src/preload/index.ts`（扩展）

7. 扩展 `mcp` 命名空间：
   ```typescript
   mcp: {
     // ... TASK042 已有的方法

     configureSync: (config: SyncTaskConfig) =>
       ipcRenderer.invoke('mcp:configureSync', config),
     triggerSync: (taskId: string) =>
       ipcRenderer.invoke('mcp:triggerSync', taskId),
     listSyncTasks: () =>
       ipcRenderer.invoke('mcp:listSyncTasks'),
     pauseSync: (taskId: string) =>
       ipcRenderer.invoke('mcp:pauseSync', taskId),
     resumeSync: (taskId: string) =>
       ipcRenderer.invoke('mcp:resumeSync', taskId),
     onSyncProgress: (callback: (progress: SyncProgress) => void) =>
       ipcRenderer.on('mcp:syncProgress', (_, data) => callback(data)),
   }
   ```

**验证：** IPC 通道注册正确、同步任务可通过 IPC 配置和触发、进度推送正确。

### 步骤 6：单元测试

**文件：** `tests/main/services/mcp/`（扩展 TASK042 创建的目录）

1. `mcp-sync.test.ts`：
   - initialize() 正确加载任务和状态
   - addTask() 验证服务连接和工具存在
   - triggerSync() 正确执行同步（mock MCPClient + FileManager）
   - 定时调度正确（mock setInterval）
   - 手动触发正确
   - 连续 3 次失败后暂停任务
   - pauseTask / resumeTask 状态切换正确
   - shutdown() 正确清理

2. `sync-data-transformer.test.ts`：
   - GitHub issues 转换为 Markdown 正确
   - Slack messages 转换正确
   - 通用列表转换正确
   - 目标路径模板变量替换正确（YYYY/MM/DD）
   - 追加模式：文件存在时追加到末尾
   - 覆盖模式：文件存在时整体替换

3. `sync-state.test.ts`：
   - 状态持久化到 sync-state.json 正确
   - 应用重启后恢复状态正确
   - cursor 更新正确
   - errorCount 递增和重置正确

4. `external-reference.test.ts`：
   - @github:issue-123 解析正确
   - @slack:general 解析正确
   - 不存在的引用返回 null 不崩溃
   - 混合引用（文件引用 + 外部引用）共存测试

5. `sync-scenario-template.test.ts`：
   - 6 个模板 JSON 格式正确
   - 从场景创建同步任务正确

**覆盖率目标：** ≥ 80%

### 步骤 7：主进程装配 + 统一导出

**文件：** `src/main/services/mcp/mcp-sync.ts`（已创建，此处为装配说明）

1. 主进程初始化入口装配顺序（扩展 TASK042 的装配步骤）：
   ```
   // TASK042 装配已完成：
   // MCPAuditLog → MCPClient → MCPCredentials → MCPPermission → MCPRegistry

   // TASK043 新增装配：
   f. McpSyncManager(client, registry, fileManager, statePath, tasksPath, logger, onProgress)
   g. await syncManager.initialize()
   h. 注册同步相关 IPC handler
   ```

2. 进度回调集成：
   ```typescript
   const onSyncProgress = (progress: SyncProgress) => {
     mainWindow?.webContents.send('mcp:syncProgress', progress)
   }
   ```

3. 应用关闭时清理：
   ```typescript
   app.on('before-quit', async () => {
     await syncManager.shutdown()
   })
   ```

**文件：** `src/main/services/mcp/index.ts`（修改 TASK042 创建的文件）

4. 新增导出 McpSyncManager 和相关类型。

**验证：** 应用启动后 MCP 同步任务正确恢复、定时调度正常、IPC 可触发同步、关闭时正确清理。

## 现有代码基础

| 已有模块 | 文件路径 | 本任务使用方式 |
|---------|---------|-------------|
| MCPClient | `src/main/services/mcp/mcp-client.ts`（TASK042） | 调用 MCP 工具拉取数据 |
| MCPRegistry | `src/main/services/mcp/mcp-registry.ts`（TASK042） | 验证服务/工具可用性 |
| MCPCredentials | `src/main/services/mcp/mcp-credentials.ts`（TASK042） | 获取凭证用于调用参数 |
| FileManager | `src/main/services/file-manager.ts` | 同步数据写入文件系统 |
| AutoSaveManager | `src/main/services/auto-save-manager.ts` | 被动监听文件变更并触发 Git 提交 |
| GitAbstraction | `src/main/services/git-abstraction.ts` | 被动被 AutoSaveManager 调用 |
| ContextEngine | `src/main/services/context-engine.ts` | 扩展引用语法支持外部数据源 |

**完全缺失、需新建的模块：**

| 模块 | 说明 |
|------|------|
| `mcp/mcp-sync.ts` | McpSyncManager 调度器 |
| `mcp/sync-data-transformer.ts` | 数据转换器 |
| `mcp/mcp-templates.ts`（扩展） | 同步场景模板加载 |
| `resources/mcp-sync-scenarios/`（6 文件） | 预置同步场景 |

## 新增 IPC 通道

| IPC 通道 | 方向 | 说明 |
|---------|------|------|
| `mcp:configureSync` | Renderer → Main | 配置/更新同步任务 |
| `mcp:triggerSync` | Renderer → Main | 手动触发同步 |
| `mcp:syncProgress` | Main → Renderer | 同步进度推送 |
| `mcp:listSyncTasks` | Renderer → Main | 列出所有同步任务及状态 |
| `mcp:pauseSync` | Renderer → Main | 暂停同步任务 |
| `mcp:resumeSync` | Renderer → Main | 恢复同步任务 |

## 涉及的现有文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/main/services/mcp/types.ts` | 扩展 | 新增 SyncTaskConfig/SyncState/SyncProgress 等类型 |
| `src/main/services/context-engine/context-engine.ts` | 修改 | 扩展 extractFileReferences() 支持外部引用语法 |
| `src/main/ipc/handlers/mcp.ts` | 扩展 | 新增同步相关 IPC handler |
| `src/shared/types.ts` | 扩展 | 新增同步相关 IPC 通道常量 |
| `src/preload/index.ts` | 扩展 | 新增同步相关 IPC 方法 |

**不修改的文件：**
- `src/main/services/sync-manager.ts` — MCP Sync 完全独立
- `src/main/services/file-manager.ts` — 仅作为被调用方
- `src/main/services/auto-save-manager.ts` — 仅作为被动监听方

---

**创建时间：** 2026-04-24
**最后更新：** 2026-04-24
**更新记录：**
- 2026-04-24 — 创建任务文档（含完整技术执行路径 7 步）
