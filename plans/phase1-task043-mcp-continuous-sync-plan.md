# PHASE1-TASK043: MCP 持续同步调度 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task043_mcp-continuous-sync.md](../specs/tasks/phase1/phase1-task043_mcp-continuous-sync.md)
> 创建日期：2026-04-26
> 最后更新：2026-04-26

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK043 |
| **任务标题** | MCP 持续同步调度 |
| **所属阶段** | Phase 1 - 迁移、导入与 MCP 集成 (Sprint 3.6) |
| **优先级** | P1 |
| **复杂度** | 高 |
| **预估工时** | 3-4 工作日 |
| **前置依赖** | TASK042 + TASK005 + TASK001 |

### 1.1 目标

在 TASK042 构建的 MCP 客户端核心（MCPClient + MCPRegistry + MCPCredentials）之上，构建 Pull-based 持续同步调度层 McpSyncManager，将 MCP 工具配置为"数据订阅源"，实现从外部数据源（GitHub issues、Slack 消息等）到 Sibylla workspace 的持续性知识流入。

### 1.2 核心设计约束

| # | 约束 | 来源 |
|---|------|------|
| 1 | Pull-based 架构：定时拉取而非实时推送 | sprint3.6-MCP.md §2.5 |
| 2 | 职责分离：McpSyncManager 独立于 Git SyncManager | sprint3.6-MCP.md §6.2 |
| 3 | 文件即真相：同步数据以 Markdown 明文写入 workspace | CLAUDE.md §二.1 |
| 4 | 增量同步：基于 updated_at / etag / cursor 避免重复拉取 | task043 spec |
| 5 | 错误容忍：连续 3 次失败后暂停并通知用户 | task043 spec |
| 6 | 状态持久化：sync-state.json 存于 .sibylla/mcp/，重启可恢复 | task043 spec |
| 7 | AI 建议人类决策：所有写入操作通过 FileManager，不做不可逆操作 | CLAUDE.md §二.2 |
| 8 | TypeScript 严格模式：禁止 any | CLAUDE.md §四 |

### 1.3 核心交付物

| 交付物 | 路径 | 说明 |
|--------|------|------|
| 同步类型扩展 | `services/mcp/types.ts` | SyncTaskConfig / SyncState / SyncProgress / SyncScenarioTemplate |
| McpSyncManager | `services/mcp/mcp-sync.ts` | 核心调度器 |
| SyncDataTransformer | `services/mcp/sync-data-transformer.ts` | JSON → Markdown 转换器 |
| 同步场景模板 | `resources/mcp-sync-scenarios/*.json` | 6 个预置场景 |
| 模板加载扩展 | `services/mcp/mcp-templates.ts` | 场景模板加载 |
| ContextEngine 扩展 | `services/context-engine/context-engine.ts` | @github:issue-123 引用语法 |
| IPC Handler 扩展 | `ipc/handlers/mcp.handler.ts` | 6 个同步 IPC 通道 |
| Preload 扩展 | `preload/index.ts` | 同步 API 暴露 |
| 单元测试 | `tests/main/services/mcp/*.test.ts` | 5 个测试文件，覆盖率 ≥ 80% |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；文件即真相（Markdown 明文存储）；AI 建议人类决策；异步操作必须错误处理；关键操作结构化日志 | 全局约束 |
| `specs/design/architecture.md` | 主进程/渲染进程 IPC 隔离；ContextEngine 三层上下文模型；SyncManager 架构 | 架构设计 |
| `specs/design/data-and-api.md` | Workspace 标准目录结构（`.sibylla/` 配置目录）；IPC 通信接口规范 | 数据存储 |
| `specs/requirements/phase1/sprint3.6-MCP.md` | 需求 2.5 持续导入通道；§3.1 性能要求；§6.2 SyncManager 职责分离 | 验收标准 |
| `specs/tasks/phase1/phase1-task043_mcp-continuous-sync.md` | 7 步执行路径、全部验收标准、核心架构图 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 路径 | 使用场景 | 具体应用点 |
|-------|------|---------|-----------|
| `typescript-strict-mode` | `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` | 类型定义与泛型设计 | SyncTaskConfig / SyncState / SyncProgress 等类型严格安全定义；Map 泛型参数 |
| `electron-ipc-patterns` | `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` | IPC 通道注册与双向通信 | 6 个同步 IPC 通道设计；`mcp:syncProgress` Main→Renderer 推送模式；Preload API 扩展 |
| `ai-context-engine` | `.kilocode/skills/phase1/ai-context-engine/SKILL.md` | ContextEngine 引用语法扩展 | `@github:issue-123` 外部数据源引用解析；extractFileReferences() 扩展 |

### 2.3 前置代码依赖（TASK042 / TASK005 / TASK001 产物）

| 模块 | 文件路径 | 复用方式 |
|------|---------|---------|
| MCPClient | `src/main/services/mcp/mcp-client.ts`（TASK042） | 调用 `callTool()` 拉取外部数据 |
| MCPRegistry | `src/main/services/mcp/mcp-registry.ts`（TASK042） | 验证 serverName / toolName 可用性 |
| MCPCredentials | `src/main/services/mcp/mcp-credentials.ts`（TASK042） | 获取凭证用于同步调用参数 |
| MCPAuditLog | `src/main/services/mcp/mcp-audit.ts`（TASK042） | 同步调用审计记录 |
| MCP Types | `src/main/services/mcp/types.ts`（TASK042） | 扩展同步相关类型 |
| MCP IPC Handler | `src/main/ipc/handlers/mcp.handler.ts`（TASK042） | 扩展同步 IPC handler |
| MCP Templates | `src/main/services/mcp/mcp-templates.ts`（TASK042） | 扩展场景模板加载 |
| FileManager | `src/main/services/file-manager.ts`（TASK001） | `writeFile()` 写入同步数据 |
| AutoSaveManager | `src/main/services/auto-save-manager.ts`（TASK005） | 被动监听文件变更触发 Git 提交 |
| GitAbstraction | `src/main/services/git-abstraction.ts` | 被动被 AutoSaveManager 调用 |
| ContextEngine | `src/main/services/context-engine/context-engine.ts` | 扩展 `extractFileReferences()` 支持外部引用 |
| IPC_CHANNELS | `src/shared/types.ts` | 新增同步 IPC 通道常量 |
| Logger | `src/main/utils/logger.ts` | 结构化日志输出 |

### 2.4 新增 IPC 通道清单

| 常量 | 通道名 | 方向 | 说明 |
|------|--------|------|------|
| `MCP_CONFIGURE_SYNC` | `mcp:configureSync` | R→M | 配置/更新同步任务 |
| `MCP_TRIGGER_SYNC` | `mcp:triggerSync` | R→M | 手动触发同步 |
| `MCP_LIST_SYNC_TASKS` | `mcp:listSyncTasks` | R→M | 列出所有同步任务及状态 |
| `MCP_PAUSE_SYNC` | `mcp:pauseSync` | R→M | 暂停同步任务 |
| `MCP_RESUME_SYNC` | `mcp:resumeSync` | R→M | 恢复同步任务 |
| `MCP_SYNC_PROGRESS` | `mcp:syncProgress` | M→R | 同步进度推送（单向通知） |

---

## 三、现有代码盘点与差距分析

### 3.1 TASK042 产物现状（可直接复用）

TASK042 已建立的 MCP 基础设施构成本任务的核心依赖：

| 模块 | 能力 | 本任务复用方式 |
|------|------|--------------|
| MCPClient | `callTool(serverName, toolName, args)` 调用外部工具 | 每次同步调用此方法拉取数据 |
| MCPRegistry | 服务注册表（连接状态、工具清单） | `addTask()` 时验证 server/tool 可用性 |
| MCPCredentials | 凭证安全存储/读取 | 获取 token 作为 callTool 参数 |
| MCPAuditLog | `.sibylla/mcp/audit-log.jsonl` append-only 日志 | 同步调用自动纳入审计 |
| MCP IPC Handler | `mcp:connect` / `mcp:listTools` 等已注册 | 扩展注册同步相关 handler |
| MCP Types | `MCPServerConfig` / `MCPTool` 等类型 | 扩展 SyncTaskConfig 等类型 |
| MCP Templates | 8 个 v1 预置连接模板 | 扩展同步场景模板加载 |

### 3.2 需新建的文件

| 文件 | 说明 | 状态 |
|------|------|------|
| `src/main/services/mcp/mcp-sync.ts` | McpSyncManager 核心调度器 | **不存在**，需新建 |
| `src/main/services/mcp/sync-data-transformer.ts` | JSON → Markdown 数据转换器 | **不存在**，需新建 |
| `resources/mcp-sync-scenarios/github-issues.json` | GitHub Issues 同步场景 | **不存在**，需新建 |
| `resources/mcp-sync-scenarios/github-prs.json` | GitHub PRs 同步场景 | **不存在**，需新建 |
| `resources/mcp-sync-scenarios/slack-messages.json` | Slack 消息同步场景 | **不存在**，需新建 |
| `resources/mcp-sync-scenarios/discord-announcements.json` | Discord 公告同步场景 | **不存在**，需新建 |
| `resources/mcp-sync-scenarios/browser-read-later.json` | 浏览器稍后读同步场景 | **不存在**，需新建 |
| `resources/mcp-sync-scenarios/zotero-references.json` | Zotero 文献同步场景 | **不存在**，需新建 |
| `tests/main/services/mcp/mcp-sync.test.ts` | 调度器测试 | **不存在**，需新建 |
| `tests/main/services/mcp/sync-data-transformer.test.ts` | 转换器测试 | **不存在**，需新建 |
| `tests/main/services/mcp/sync-state.test.ts` | 状态持久化测试 | **不存在**，需新建 |
| `tests/main/services/mcp/external-reference.test.ts` | 引用语法测试 | **不存在**，需新建 |
| `tests/main/services/mcp/sync-scenario-template.test.ts` | 场景模板测试 | **不存在**，需新建 |

### 3.3 需修改的现有文件

| 文件 | 变更类型 | 变更内容 |
|------|---------|---------|
| `src/main/services/mcp/types.ts` | **扩展** | 新增 SyncTaskConfig / SyncState / SyncProgress / SyncScenarioTemplate 4 个类型 |
| `src/main/services/mcp/mcp-templates.ts` | **扩展** | 新增 `loadSyncScenarioTemplates()` 和 `createSyncTaskFromScenario()` |
| `src/main/services/context-engine/context-engine.ts` | **修改** | `extractFileReferences()` 扩展 `@github:issue-123` 解析 + `resolveExternalReference()` |
| `src/main/ipc/handlers/mcp.handler.ts` | **扩展** | 注册 6 个同步 IPC handler |
| `src/shared/types.ts` | **扩展** | 新增 6 个同步 IPC 通道常量 |
| `src/preload/index.ts` | **扩展** | `mcp` 命名空间新增 6 个同步 API 方法 |
| `src/main/services/mcp/index.ts` | **扩展** | 导出 McpSyncManager 和相关类型 |

### 3.4 不修改的文件（职责分离保证）

| 文件 | 不修改原因 |
|------|-----------|
| `src/main/services/sync-manager.ts` | MCP Sync 完全独立，不与 Git 同步共享调度器 |
| `src/main/services/file-manager.ts` | 仅作为被调用方（`writeFile()`） |
| `src/main/services/auto-save-manager.ts` | 仅作为被动监听方（文件变更触发 Git 提交） |
| `src/main/services/git-abstraction.ts` | 被动被 AutoSaveManager 调用 |

---

## 四、分步实施计划

### 阶段 A：同步类型定义（Step 1） — 预计 0.3 天

> **原则：** 类型先行，后续所有模块基于这些类型构建。严格模式禁止 any。

#### A1：扩展 `src/main/services/mcp/types.ts`

在 TASK042 已创建的 types.ts 末尾新增 4 个核心类型：

**SyncTaskConfig — 同步任务配置：**

```typescript
export interface SyncTaskConfig {
  id: string                              // UUID，唯一标识
  name: string                            // 可读名称，如"GitHub Issues 同步"
  serverName: string                      // 对应 MCPRegistry 中的 server
  toolName: string                        // 对应 server 中的 tool
  args: Record<string, unknown>           // 工具调用参数
  intervalMinutes: number                 // 0 = 仅手动触发
  targetPath: string                      // 文件名模板，支持 YYYY/MM/DD 变量
  writeMode: 'append' | 'replace'         // 追加或覆盖
  transformTemplate?: string              // 数据转换模板标识
  conflictStrategy: 'last-write-wins'     // 冲突策略（MVP 仅支持 last-write-wins）
  enabled: boolean
}
```

**SyncState — 同步状态：**

```typescript
export interface SyncState {
  taskId: string
  lastSyncAt: number | null               // epoch ms，null = 从未同步
  cursor: string | null                   // 分页 cursor / etag
  errorCount: number
  status: 'active' | 'paused' | 'error'
  lastError?: string
  lastSyncDurationMs?: number
  totalSyncedItems?: number
}
```

**SyncProgress — 同步进度（IPC 推送用）：**

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

**SyncScenarioTemplate — 预置场景模板：**

```typescript
export interface SyncScenarioTemplate {
  id: string
  name: string
  description: string
  serverTemplateId: string                // 对应 TASK042 的 MCP 连接模板 ID
  toolName: string
  defaultArgs: Record<string, unknown>
  defaultIntervalMinutes: number
  targetPathTemplate: string
  writeMode: 'append' | 'replace'
  transformTemplate: string
}
```

**验证门禁：** `tsc --noEmit` 编译通过，无 any 类型。

---

### 阶段 B：McpSyncManager 调度核心（Step 2） — 预计 1 天

> **原则：** 独立定时器，不与 SyncManager 共享调度器。同一任务最多 1 个活跃实例。

#### B1：创建 `src/main/services/mcp/mcp-sync.ts`

**类成员设计：**

```typescript
export class McpSyncManager {
  private tasks = new Map<string, SyncTaskConfig>()
  private states = new Map<string, SyncState>()
  private timers = new Map<string, NodeJS.Timeout>()
  private activeRuns = new Set<string>()       // 防止并发

  constructor(
    private readonly client: MCPClient,
    private readonly registry: MCPRegistry,
    private readonly fileManager: FileManager,
    private readonly statePath: string,         // .sibylla/mcp/sync-state.json
    private readonly tasksPath: string,          // .sibylla/mcp/sync-tasks.json
    private readonly logger: Logger,
    private readonly onProgress?: (progress: SyncProgress) => void,
  ) {}
}
```

#### B2：实现 `initialize()` 方法

```
async initialize(): Promise<void>
  1. 读取 sync-tasks.json → 加载 tasks Map
  2. 读取 sync-state.json → 加载 states Map
  3. 遍历每个 task：
     - 若 enabled && status !== 'error' → startTimer(taskId)
     - 若 lastSyncAt 距今超过 intervalMinutes → 立即触发一次
  4. logger.info('McpSyncManager initialized', { taskCount })
```

#### B3：实现 `addTask()` / `removeTask()` / `updateTask()`

- `addTask(config)`: 验证 serverName 已连接 + toolName 存在 → 初始化 SyncState → 持久化 → 启动定时器
- `removeTask(taskId)`: 停止定时器 → 从 Map 移除 → 持久化
- `updateTask(taskId, patch)`: 合并配置 → 重建定时器（如果间隔变化）→ 持久化

#### B4：实现 `triggerSync()` — 核心同步执行流

```
async triggerSync(taskId: string): Promise<SyncProgress>
  1. 并发守卫：if activeRuns.has(taskId) → 返回 'already running'
  2. activeRuns.add(taskId)
  3. 获取 task + state
  4. 构建增量参数：
     - if state.lastSyncAt: args.since = new Date(state.lastSyncAt).toISOString()
     - if state.cursor: args.cursor = state.cursor
  5. 调用 MCPClient.callTool(task.serverName, task.toolName, mergedArgs)
  6. 数据转换：transformer.transform(rawResult, task.transformTemplate)
  7. 路径解析：transformer.resolveTargetPath(task.targetPath, new Date())
  8. 文件写入：
     - append 模式：读取现有内容 + '\n\n' + newContent
     - replace 模式：直接覆盖
     - 调用 fileManager.writeFile(targetPath, content)
  9. 更新 SyncState：lastSyncAt = Date.now(), cursor = newCursor, errorCount = 0
  10. 持久化状态
  11. 推送进度回调 onProgress({ status: 'success', ... })
  12. activeRuns.delete(taskId)
  13. return SyncProgress
  ─── 错误处理 ───
  catch: handleError(taskId, error) → activeRuns.delete(taskId) → rethrow
```

#### B5：实现 `startTimer()` / `stopTimer()`

```typescript
private startTimer(taskId: string): void {
  const task = this.tasks.get(taskId)
  if (!task || task.intervalMinutes === 0) return  // intervalMinutes=0 → 仅手动
  const intervalMs = task.intervalMinutes * 60 * 1000
  const timer = setInterval(() => void this.triggerSync(taskId), intervalMs)
  this.timers.set(taskId, timer)
}

private stopTimer(taskId: string): void {
  const timer = this.timers.get(taskId)
  if (timer) { clearInterval(timer); this.timers.delete(taskId) }
}
```

#### B6：实现 `pauseTask()` / `resumeTask()`

- `pauseTask(taskId)`: stopTimer → state.status = 'paused' → 持久化
- `resumeTask(taskId)`: state.errorCount = 0 → state.status = 'active' → startTimer → 持久化

#### B7：实现错误处理 `handleError()`

```
private handleError(taskId: string, error: Error): void
  1. state.errorCount++
  2. state.lastError = error.message
  3. if errorCount >= 3:
     - state.status = 'error'
     - stopTimer(taskId)
     - onProgress?.({ status: 'error', error: '连续 N 次同步失败，已暂停' })
     - logger.warn('Sync task paused after consecutive failures', { taskId, errorCount })
  4. 持久化状态
```

#### B8：实现 `shutdown()` + 状态持久化

```
async shutdown(): Promise<void>
  1. 清除所有定时器
  2. 等待 activeRuns 清空（超时 5 秒强制退出）
  3. persistState() — 写入 sync-state.json + sync-tasks.json

private async persistState(): Promise<void>
  1. 将 tasks Map 序列化为 JSON → writeFile(tasksPath)
  2. 将 states Map 序列化为 JSON → writeFile(statePath)
  // 注意：使用原子写入（先写临时文件再 rename），符合 CLAUDE.md §六 防数据丢失
```

**验证门禁：** 调度器初始化/停止、定时触发、手动触发、并发守卫、连续失败暂停均通过测试。

---

### 阶段 C：数据转换与写入（Step 3） — 预计 0.5 天

#### C1：创建 `src/main/services/mcp/sync-data-transformer.ts`

**核心方法：**

```typescript
export class SyncDataTransformer {
  /**
   * Transform raw MCP tool result to Markdown
   */
  transform(rawData: unknown, template?: string): string {
    if (!template || template === 'generic-list') return this.transformGenericList(rawData)
    switch (template) {
      case 'github-issues': return this.transformGitHubIssues(rawData)
      case 'github-prs': return this.transformGitHubPRs(rawData)
      case 'slack-messages': return this.transformSlackMessages(rawData)
      default: return this.transformGenericList(rawData)
    }
  }

  /**
   * Resolve target path template variables
   * docs/logs/slack/YYYY-MM-DD.md → docs/logs/slack/2026-04-26.md
   */
  resolveTargetPath(template: string, now: Date): string
}
```

#### C2：实现内置转换模板

**`transformGitHubIssues()`：**
```
输入: { items: [{ number, title, state, html_url, updated_at, labels }] }
输出:
  # GitHub Issues
  
  - #42 Fix login bug [open] https://github.com/...
    Labels: bug, P1
  - #39 Add dark mode [closed] https://github.com/...
```

**`transformGitHubPRs()`：**
```
输入: { items: [{ number, title, state, author, html_url, updated_at }] }
输出:
  # Pull Requests
  
  - #15 Refactor auth module [open] @alice https://github.com/...
  - #14 Update deps [merged] @bob https://github.com/...
```

**`transformSlackMessages()`：**
```
输入: { messages: [{ user, text, ts, channel }] }
输出:
  ## #general — 2026-04-26
  
  > **@alice** (10:30): We should review the new design
  > **@bob** (10:45): Agreed, let me create a task
```

**`transformGenericList()`：** 通用 JSON → Markdown 列表（递归展开嵌套对象，深度上限 3 层）

#### C3：实现 `resolveTargetPath()`

```typescript
resolveTargetPath(template: string, now: Date): string {
  return template
    .replace(/YYYY/g, String(now.getFullYear()))
    .replace(/MM/g, String(now.getMonth() + 1).padStart(2, '0'))
    .replace(/DD/g, String(now.getDate()).padStart(2, '0'))
}
```

**验证门禁：** 各转换模板输入/输出断言通过；路径变量替换正确；追加/覆盖模式行为正确。

---

### 阶段 D：预置同步场景模板（Step 4） — 预计 0.3 天

#### D1：创建 `resources/mcp-sync-scenarios/` 目录下 6 个 JSON 文件

每个文件遵循 `SyncScenarioTemplate` 类型定义：

| 文件名 | serverTemplateId | toolName | interval | targetPath | writeMode |
|--------|-----------------|----------|----------|------------|-----------|
| `github-issues.json` | `github` | `list_issues` | 30 | `docs/github/{repo}/issues.md` | replace |
| `github-prs.json` | `github` | `list_prs` | 30 | `.sibylla/inbox/prs/{repo}.md` | replace |
| `slack-messages.json` | `slack` | `get_messages` | 60 | `docs/logs/slack/YYYY-MM-DD.md` | append |
| `discord-announcements.json` | `discord` | `get_announcements` | 1440 | `docs/announcements/YYYY-MM.md` | append |
| `browser-read-later.json` | `browser` | `save_page` | 0 | `docs/reading/inbox/YYYY-MM-DD.md` | append |
| `zotero-references.json` | `zotero` | `list_items` | 1440 | `docs/references/YYYY-MM.md` | append |

#### D2：扩展 `src/main/services/mcp/mcp-templates.ts`

新增两个方法：

```typescript
/**
 * Load all sync scenario templates from resources/mcp-sync-scenarios/
 */
export function loadSyncScenarioTemplates(): SyncScenarioTemplate[]

/**
 * Create a SyncTaskConfig from scenario template + user overrides
 */
export function createSyncTaskFromScenario(
  scenario: SyncScenarioTemplate,
  userConfig: Partial<SyncTaskConfig>,
): SyncTaskConfig
```

- `loadSyncScenarioTemplates()`: 扫描 `resources/mcp-sync-scenarios/` → 解析 JSON → 返回数组
- `createSyncTaskFromScenario()`: 合并默认配置 + 用户自定义 → 生成 UUID → 返回完整 SyncTaskConfig

**验证门禁：** 6 个 JSON 文件格式校验通过；模板→任务转换正确。

---

### 阶段 E：ContextEngine 引用语法扩展（Step 5） — 预计 0.3 天

#### E1：修改 `src/main/services/context-engine/context-engine.ts`

新增外部引用解析能力，与现有文件引用共存：

**新增类型：**

```typescript
interface ExternalReference {
  source: string       // 'github' | 'slack' | 'gitlab' | 'notion'
  resource: string     // 'issue' | 'pr' | 'message' | 'general'
  identifier: string   // '123' | 'channel-name'
}
```

**新增方法 `extractExternalReferences()`：**

```typescript
private extractExternalReferences(text: string): ExternalReference[] {
  const pattern = /@(github|slack|gitlab|notion):([\w-]+)(?:-([\w-]+))?/g
  // @github:issue-123 → { source: 'github', resource: 'issue', identifier: '123' }
  // @slack:general → { source: 'slack', resource: 'general', identifier: '' }
}
```

**新增方法 `resolveExternalReference()`：**

```typescript
private async resolveExternalReference(ref: ExternalReference): Promise<string | null>
  1. 根据 source + resource 推断同步数据文件路径
     - @github:issue-123 → 搜索 docs/github/*/issues.md 中包含 #123 的内容
  2. 找到 → 提取相关段落返回
  3. 找不到 → logger.debug('External reference not found') → return null
```

#### E2：在 `extractFileReferences()` 中集成

```
原有逻辑：@文件名 → 文件引用
新增逻辑：@source:resource-id → 外部引用
合并：两种引用共存，统一返回上下文内容
```

**关键约束：** 不存在的引用给出 debug 日志提示，但**不崩溃**，不中断上下文组装流程。

**验证门禁：** `@github:issue-123` 解析正确；`@slack:general` 解析正确；不存在引用返回 null；混合引用共存。

---

### 阶段 F：IPC 通道 + Preload 扩展（Step 6） — 预计 0.5 天

#### F1：扩展 `src/shared/types.ts`

新增 6 个 IPC 通道常量（在现有 MCP 通道常量之后追加）：

```typescript
MCP_CONFIGURE_SYNC: 'mcp:configureSync',
MCP_TRIGGER_SYNC: 'mcp:triggerSync',
MCP_SYNC_PROGRESS: 'mcp:syncProgress',
MCP_LIST_SYNC_TASKS: 'mcp:listSyncTasks',
MCP_PAUSE_SYNC: 'mcp:pauseSync',
MCP_RESUME_SYNC: 'mcp:resumeSync',
```

同步扩展 `IPCChannelMap` 类型映射（遵循 electron-ipc-patterns skill 的类型安全模式）。

#### F2：扩展 `src/main/ipc/handlers/mcp.handler.ts`

在 TASK042 的 `register()` 方法末尾追加 5 个 invoke handler + 1 个 push 通道：

```typescript
// mcp:configureSync — 新增/更新同步任务
ipcMain.handle(IPC_CHANNELS.MCP_CONFIGURE_SYNC, this.safeHandle(async (_, config) => {
  await this.syncManager.addTask(config)
  return { success: true }
}))

// mcp:triggerSync — 手动触发
ipcMain.handle(IPC_CHANNELS.MCP_TRIGGER_SYNC, this.safeHandle(async (_, taskId) => {
  return await this.syncManager.triggerSync(taskId)
}))

// mcp:listSyncTasks — 列出所有任务+状态
ipcMain.handle(IPC_CHANNELS.MCP_LIST_SYNC_TASKS, this.safeHandle(async () => {
  return this.syncManager.listTasks()
}))

// mcp:pauseSync / mcp:resumeSync
ipcMain.handle(IPC_CHANNELS.MCP_PAUSE_SYNC, this.safeHandle(async (_, taskId) => {
  await this.syncManager.pauseTask(taskId)
}))
ipcMain.handle(IPC_CHANNELS.MCP_RESUME_SYNC, this.safeHandle(async (_, taskId) => {
  await this.syncManager.resumeTask(taskId)
}))
```

**进度推送集成（M→R）：**

```typescript
// McpSyncManager 构造时传入 onProgress 回调
const onSyncProgress = (progress: SyncProgress) => {
  mainWindow?.webContents.send(IPC_CHANNELS.MCP_SYNC_PROGRESS, progress)
}
```

#### F3：扩展 `src/preload/index.ts`

在现有 `mcp` 命名空间末尾追加：

```typescript
mcp: {
  // ... TASK042 已有方法 ...

  // TASK043 同步方法
  configureSync: (config: SyncTaskConfig) =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_CONFIGURE_SYNC, config),
  triggerSync: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_TRIGGER_SYNC, taskId),
  listSyncTasks: () =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_LIST_SYNC_TASKS),
  pauseSync: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_PAUSE_SYNC, taskId),
  resumeSync: (taskId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_RESUME_SYNC, taskId),
  onSyncProgress: (callback: (progress: SyncProgress) => void) => {
    const handler = (_: IpcRendererEvent, data: SyncProgress) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.MCP_SYNC_PROGRESS, handler)
    return () => ipcRenderer.off(IPC_CHANNELS.MCP_SYNC_PROGRESS, handler)
  },
}
```

将 `MCP_SYNC_PROGRESS` 注册到 `ALLOWED_CHANNELS`。

**验证门禁：** IPC 通道注册正确；类型安全映射完整；Preload API 可调用。

---

### 阶段 G：主进程装配 + 导出（Step 7） — 预计 0.2 天

#### G1：主进程初始化装配

在主进程初始化流程中，紧接 TASK042 的 MCP 装配之后：

```
// TASK042 装配（已完成）:
// a. MCPAuditLog
// b. MCPClient
// c. MCPCredentials
// d. MCPPermission
// e. MCPRegistry

// TASK043 新增装配:
f. const syncManager = new McpSyncManager(
     client, registry, fileManager,
     path.join(workspacePath, '.sibylla/mcp/sync-state.json'),
     path.join(workspacePath, '.sibylla/mcp/sync-tasks.json'),
     logger, onSyncProgress,
   )
g. await syncManager.initialize()
h. 注册同步相关 IPC handler（传入 syncManager 引用）
```

#### G2：应用关闭清理

```typescript
app.on('before-quit', async () => {
  await syncManager.shutdown()
})
```

#### G3：扩展 `src/main/services/mcp/index.ts`

```typescript
export { McpSyncManager } from './mcp-sync'
export { SyncDataTransformer } from './sync-data-transformer'
export type { SyncTaskConfig, SyncState, SyncProgress, SyncScenarioTemplate } from './types'
```

**验证门禁：** 应用启动后同步任务恢复；定时调度正常；关闭时状态持久化。

---

### 阶段 H：单元测试（Step 8） — 预计 0.7 天

#### H1：`tests/main/services/mcp/mcp-sync.test.ts`

| # | 测试用例 | 断言重点 |
|---|---------|---------|
| 1 | `initialize()` 正确加载任务和状态 | tasks/states Map 大小一致 |
| 2 | `addTask()` 验证 server 连接和 tool 存在 | 不存在时抛错 |
| 3 | `addTask()` 创建初始 SyncState | lastSyncAt=null, errorCount=0 |
| 4 | `triggerSync()` 正确执行（mock MCPClient + FileManager） | callTool 被调用 + writeFile 被调用 |
| 5 | `triggerSync()` 并发守卫 | 第二次调用返回 'already running' |
| 6 | 定时调度正确（mock setInterval） | intervalMs = intervalMinutes × 60000 |
| 7 | 手动触发正确 | triggerSync 直接调用无定时器依赖 |
| 8 | 连续 3 次失败后暂停任务 | status='error', timer 已清除 |
| 9 | `pauseTask()` / `resumeTask()` 状态切换 | status 字段正确；errorCount 重置 |
| 10 | `shutdown()` 正确清理 | 所有 timer 清除；状态已持久化 |
| 11 | 增量参数构建（基于 lastSyncAt） | args.since 存在且正确 |
| 12 | 增量参数构建（基于 cursor） | args.cursor 存在且正确 |

#### H2：`tests/main/services/mcp/sync-data-transformer.test.ts`

| # | 测试用例 |
|---|---------|
| 1 | GitHub issues 转换为 Markdown 列表格式正确 |
| 2 | GitHub PRs 转换格式正确 |
| 3 | Slack messages 按频道分组格式正确 |
| 4 | 通用列表转换（嵌套 JSON）格式正确 |
| 5 | `resolveTargetPath()` YYYY/MM/DD 替换正确 |
| 6 | 空数据输入不崩溃，返回空字符串 |

#### H3：`tests/main/services/mcp/sync-state.test.ts`

| # | 测试用例 |
|---|---------|
| 1 | 状态持久化到 sync-state.json 正确（JSON 格式） |
| 2 | 应用重启后恢复状态正确（读取 JSON） |
| 3 | cursor 更新正确 |
| 4 | errorCount 递增和重置正确 |
| 5 | 文件不存在时初始化空状态（不崩溃） |

#### H4：`tests/main/services/mcp/external-reference.test.ts`

| # | 测试用例 |
|---|---------|
| 1 | `@github:issue-123` 解析为 `{ source:'github', resource:'issue', identifier:'123' }` |
| 2 | `@slack:general` 解析正确 |
| 3 | `@gitlab:mr-45` 解析正确 |
| 4 | 不存在的引用返回 null，不崩溃 |
| 5 | 混合引用（文件引用 `@filename` + 外部引用 `@github:issue-1`）共存 |
| 6 | 无匹配文本不产生引用 |

#### H5：`tests/main/services/mcp/sync-scenario-template.test.ts`

| # | 测试用例 |
|---|---------|
| 1 | 6 个模板 JSON 文件格式合法（符合 SyncScenarioTemplate） |
| 2 | `loadSyncScenarioTemplates()` 返回 6 个模板 |
| 3 | `createSyncTaskFromScenario()` 正确合并默认值 + 用户覆盖 |
| 4 | 生成的 taskId 为 UUID 格式 |

**覆盖率目标：** ≥ 80%

---

## 五、验收标准追踪

### McpSyncManager 调度器

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | `mcp-sync.ts` 创建 | B1 | — |
| 2 | Pull-based 定时拉取，每任务独立调度间隔 | B5 startTimer | H1-6 |
| 3 | 支持手动触发同步（IPC 调用） | B4 + F2 | H1-7 |
| 4 | 同步任务后台运行，不阻塞用户交互 | B4 async 执行 | H1-4 |
| 5 | 同一任务最多 1 个活跃实例（并发守卫） | B4 activeRuns | H1-5 |
| 6 | 重启后从 sync-state.json 恢复 | B2 initialize | H1-1, H3-2 |

### 同步任务配置

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | SyncTaskConfig 类型定义完整 | A1 | 编译门禁 |
| 2 | 支持 30min / 1h / 1day / 手动 频率 | A1 intervalMinutes | H1-6 |
| 3 | 支持目标路径和文件名模板 | C3 resolveTargetPath | H2-5 |
| 4 | 配置持久化到 sync-tasks.json | B8 persistState | H3-1 |

### 同步状态管理

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | SyncState 类型定义完整 | A1 | 编译门禁 |
| 2 | 成功后更新 lastSyncAt 和 cursor | B4 步骤 9 | H1-11, H1-12 |
| 3 | 失败时递增 errorCount | B7 handleError | H1-8 |
| 4 | 连续 3 次失败暂停并通知 | B7 | H1-8 |
| 5 | 状态持久化到 sync-state.json | B8 | H3-1 |

### 增量同步

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 基于 updated_at 增量同步 | B4 步骤 4 | H1-11 |
| 2 | 基于 cursor/etag 增量同步 | B4 步骤 4 | H1-12 |
| 3 | 首次同步拉取全量 | B4 lastSyncAt=null 分支 | H1-4 |

### 同步写入

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 通过 FileManager.writeFile() 写入 | B4 步骤 8 | H1-4 |
| 2 | AutoSaveManager 自动纳入 Git | 被动触发（不修改） | 集成验证 |
| 3 | 冲突策略 last-write-wins | B4 replace 模式 | H2-6 |
| 4 | 写入格式为 Markdown | C1-C2 transform | H2-1~4 |

### 预置同步场景模板

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | GitHub issues → tasks.md，每 30 分钟 | D1 github-issues.json | H5-1 |
| 2 | GitHub PRs → .sibylla/inbox/prs/，每 30 分钟 | D1 github-prs.json | H5-1 |
| 3 | Slack 重要频道 → docs/logs/slack/YYYY-MM-DD.md，每小时 | D1 slack-messages.json | H5-1 |
| 4 | Discord 公告 → docs/announcements/，每天 | D1 discord-announcements.json | H5-1 |
| 5 | 浏览器"稍后读" → docs/reading/inbox/，用户触发 | D1 browser-read-later.json | H5-1 |
| 6 | Zotero 新增文献 → docs/references/，每天 | D1 zotero-references.json | H5-1 |

### ContextEngine 引用语法

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | `@github:issue-123` 语法解析 | E1 extractExternalReferences | H4-1 |
| 2 | 解析后加载同步数据到上下文 | E1 resolveExternalReference | H4-2~3 |
| 3 | 不存在的引用提示但不崩溃 | E1 return null | H4-4 |

### IPC 通道

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | `mcp:configureSync` 可用 | F2 | 集成验证 |
| 2 | `mcp:triggerSync` 可用 | F2 | 集成验证 |
| 3 | `mcp:syncProgress` 推送可用 | F2 onSyncProgress | 集成验证 |
| 4 | `mcp:listSyncTasks` 可用 | F2 | 集成验证 |
| 5 | `mcp:pauseSync` / `mcp:resumeSync` 可用 | F2 | 集成验证 |

### 单元测试

| # | 验收标准 | 实现位置 |
|---|---------|---------|
| 1 | McpSyncManager 定时调度测试 | H1 |
| 2 | 增量同步（updated_at）测试 | H1-11 |
| 3 | 增量同步（cursor）测试 | H1-12 |
| 4 | 连续失败暂停测试 | H1-8 |
| 5 | 状态持久化和恢复测试 | H3 |
| 6 | 同步写入（FileManager 集成）测试 | H1-4 |
| 7 | @github:issue-123 引用解析测试 | H4 |
| 8 | 覆盖率 ≥ 80% | H1~H5 |

---

## 六、风险与缓解

| 风险 | 影响 | 概率 | 缓解策略 |
|------|------|------|---------|
| TASK042 产物未就绪 | 高 | 低 | 本任务类型和 mock 可先行开发；同步核心逻辑不直接依赖 TASK042 实现细节，仅依赖接口 |
| MCPClient.callTool() 返回格式不统一 | 中 | 中 | SyncDataTransformer 使用防御性解析（`unknown` 类型入参 + 类型守卫），增加 `transformGenericList()` 兜底 |
| 定时器在 Electron 长时间挂起后漂移 | 中 | 中 | `initialize()` 中检查 lastSyncAt 距今是否超过间隔，超过则立即触发一次补偿同步 |
| sync-state.json / sync-tasks.json 文件损坏 | 高 | 低 | 持久化使用原子写入（写临时文件 → rename）；读取时 JSON.parse 异常则初始化空状态并 logger.error |
| FileManager.writeFile() 频繁调用导致 AutoSaveManager Git 提交风暴 | 中 | 中 | 同步写入完成后添加短暂延迟（debounce 效果由 AutoSaveManager 自身防抖机制保证，不需要额外处理） |
| 外部 MCP Server 响应超时 | 中 | 中 | MCPClient.callTool() 已有超时机制（TASK042 实现）；triggerSync 的 catch 分支正确处理超时错误 |
| ContextEngine 扩展引入回归 | 中 | 低 | 外部引用解析作为独立方法，不修改现有 `@file` 解析逻辑；新逻辑 return null 不影响上下文组装 |
| 大数据量同步内存占用 | 低 | 低 | MVP 阶段同步数据量有限（issues/messages 级别）；未来可考虑流式写入 |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 | 验证 |
|----|------|--------|------|
| Day 1 上午 | A：同步类型定义 | types.ts 扩展完成 | `tsc --noEmit` |
| Day 1 下午 | B1-B4：McpSyncManager 核心 | mcp-sync.ts 基础框架 + triggerSync | 手动测试 |
| Day 2 上午 | B5-B8：定时器/暂停/错误/持久化 | mcp-sync.ts 完整实现 | H1 测试通过 |
| Day 2 下午 | C：数据转换与写入 | sync-data-transformer.ts | H2 测试通过 |
| Day 3 上午 | D + E：场景模板 + ContextEngine | 6 个 JSON + 引用语法 | H4 + H5 通过 |
| Day 3 下午 | F + G：IPC + 装配 | 6 个 IPC 通道 + 主进程装配 | 集成验证 |
| Day 4 | H：测试补全 + 集成验证 | 全部 5 个测试文件 ≥ 80% 覆盖率 | CI 通过 |

**关键里程碑：**

- **Day 2 结束：** McpSyncManager + SyncDataTransformer 核心完成，可独立运行
- **Day 3 结束：** 全部功能完成，包括 IPC 通道和 ContextEngine 扩展
- **Day 4 结束：** 测试覆盖率达标，集成验证通过

---

**文档版本**: v1.0
**最后更新**: 2026-04-26
**维护者**: Sibylla 架构团队
