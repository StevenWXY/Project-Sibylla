# PHASE2-TASK006: 智能通知中心与焦点模式 — 实施计划

> 任务来源：[specs/tasks/phase2/phase2-task006_notification-center-focus-mode.md](../../specs/tasks/phase2/phase2-task006_notification-center-focus-mode.md)
> 创建日期：2026-04-30
> 最后更新：2026-04-30

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK006 |
| **任务标题** | 智能通知中心与焦点模式 |
| **所属阶段** | Phase 2 - 智能通知与协作增强 (Sprint 5) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 5-6 工作日 |
| **前置依赖** | TASK001(事件总线) + TASK003(ContextEngine v2) + Sprint 3.2/3.3/3.4/3.5/3.6 |

### 1.1 目标

构建 Sprint 5 的通知基础设施——智能通知中心（NotificationCenter）与焦点模式（Focus Mode）。通知中心作为 `AppEventBus` 的核心消费者，将系统事件转化为按优先级排序、去重聚合、可路由跳转的用户通知；焦点模式叠加在 AiMode 上，在用户专注工作时静默非紧急通知并于退出时生成 AI 摘要；偏好学习机制通过滑动窗口统计用户行为，自动沉淀通知偏好到记忆系统。

### 1.2 核心设计约束（来自 CLAUDE.md + 任务文档）

| 约束 | 来源 | 具体要求 |
|------|------|----------|
| 不重建事件总线 | 任务文档 §核心设计约束 | 仅消费 `AppEventBus.subscribe()`，不引入新总线 |
| 焦点模式 = AiMode 叠加属性 | 任务文档 §核心设计约束 | 不是独立模式，在 `ActiveAiModeState` 上新增 `focused?: boolean` |
| 偏好走记忆系统 | 任务文档 §核心设计约束 | 通知行为通过 `MemoryExtractor` 沉淀为 `user_preference` 类型记忆 |
| 通知 Navigation 独立类型 | 任务文档 §核心设计约束 | 不复用 `UnifiedSearchResult.navigation`，通知场景含 trace/mcp 等 |
| 偏好持久化失败不阻塞展现 | 任务文档 §核心设计约束 | 降级为内存态 |
| TS 严格模式禁止 any | CLAUDE.md §四 | 所有新增类型严格 |
| 先写临时文件再原子替换 | CLAUDE.md §六 | 偏好文件写入遵循此红线 |
| 主进程渲染进程隔离 | CLAUDE.md §四 | 渲染进程不直接访问文件系统，通过 IPC |
| 结构化日志 | CLAUDE.md §四 | 关键操作有 who/what/when/result |
| 错误不可静默 | CLAUDE.md §四 | 所有异步操作有明确错误处理 |

### 1.3 核心交付物

| 交付物 | 文件路径 | 类型 |
|--------|---------|------|
| 通知类型系统 | `src/main/services/notifications/types.ts` | 新建 |
| 通知常量 | `src/main/services/notifications/constants.ts` | 新建 |
| NotificationStore | `src/main/services/notifications/notification-store.ts` | 新建 |
| 8 类内置规则 | `src/main/services/notifications/notification-rules.ts` | 新建 |
| NotificationEngine | `src/main/services/notifications/notification-engine.ts` | 新建 |
| PreferenceLearner | `src/main/services/notifications/preference-learner.ts` | 新建 |
| NotificationPreferenceExtractor | `src/main/services/notifications/notification-preference-extractor.ts` | 新建 |
| FocusModeController | `src/main/services/mode/focus-mode-controller.ts` | 新建 |
| Sub-agent Prompt | `resources/prompts/agents/focus-summary-curator.md` | 新建 |
| IPC handler(通知) | `src/main/ipc/handlers/notification.ts` | 新建 |
| IPC handler(焦点) | `src/main/ipc/handlers/focus-mode.ts` | 新建 |
| notificationStore | `src/renderer/store/notificationStore.ts` | 新建 |
| focusStore | `src/renderer/store/focusStore.ts` | 新建 |
| 通知中心 UI | `src/renderer/components/notifications/` (4 组件) | 新建 |
| 焦点模式 UI | `src/renderer/components/focus/` (2 组件) | 新建 |
| 偏好设置 UI | `src/renderer/components/notifications/NotificationPreferencesPanel.tsx` | 新建 |
| 事件类型扩展 | `src/main/services/event-bus-types.ts` | 修改 |
| AiMode 类型扩展 | `src/main/services/mode/types.ts` | 修改 |
| AiModeRegistry 扩展 | `src/main/services/mode/ai-mode-registry.ts` | 修改 |
| CheckpointScheduler 扩展 | `src/main/services/memory/checkpoint-scheduler.ts` | 修改 |
| Slash Command 扩展 | `src/main/ipc/handlers/command.ts` | 修改 |
| IPC 通道常量 | `src/shared/types.ts` | 修改 |
| Preload API | `src/preload/index.ts` | 修改 |
| 单元测试 | `tests/main/services/notifications/` | 新建 |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` §二 | 文件即真相；AI 建议人类决策 | 偏好文件存储、AI 摘要需确认 |
| `CLAUDE.md` §四 | TS 严格模式；IPC 隔离；结构化日志；错误处理 | 全局代码约束 |
| `CLAUDE.md` §六 | 先写临时文件再原子替换 | 偏好文件写入、焦点队列写入 |
| `specs/design/architecture.md` §2.1 | 技术栈：Electron + React + Zustand + better-sqlite3 | 技术选型 |
| `specs/design/architecture.md` §3.2 | 进程通信架构 Renderer ↔ IPC ↔ Main | IPC 通道设计 |
| `specs/requirements/phase2/sprint5-collaboration.md` §5.1 | 通知中心验收标准 9 条 + 技术规格 | 通知引擎验收 |
| `specs/requirements/phase2/sprint5-collaboration.md` §5.2 | 焦点模式验收标准 10 条 + 偏好学习规格 | 焦点模式验收 |
| `specs/requirements/phase2/sprint5-collaboration.md` §3 | 性能 < 500ms；可靠性（降级策略）；隐私（TLS） | 非功能约束 |
| `specs/requirements/phase2/sprint5-collaboration.md` §4.2 | 与现有模块集成方式（不修改 X，扩展 Y） | 集成策略 |
| `specs/design/testing-and-security.md` | 测试金字塔、覆盖率 ≥ 80% | 单元测试策略 |
| `specs/design/data-and-api.md` | IPC 接口约定、SQLite 设计 | 存储与 IPC 设计 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `sqlite-local-storage` | NotificationStore 的 SQLite schema 设计、FTS5 理解、事务与 WAL | notification-store.ts 全文件 |
| `zustand-state-management` | notificationStore / focusStore 设计；selector 优化；IPC action 封装 | 两个渲染进程 store |
| `electron-ipc-patterns` | IPC handler 注册、Preload API 扩展、M→R 推送事件桥接 | notification.ts + focus-mode.ts + preload |
| `typescript-strict-mode` | 联合类型约束（NotificationType / NotificationPriority / NotificationNavigation）、泛型 | types.ts 全文件 |

### 2.3 前置代码依赖

| 模块 | 文件路径 (sibylla-desktop/) | 关键接口 | 复用方式 |
|------|---------------------------|---------|---------|
| `SibyllaEventType` | `src/main/services/event-bus-types.ts:5-55` | 联合类型 55 种事件 | **扩展**：追加 `git.conflict-detected`/`notification.clicked`/`notification.dismissed`/`aiMode.focused-changed`/`presence.*` 等 |
| `EventPayloadMap` | `src/main/services/event-bus-types.ts:69-119` | 事件 payload 类型映射 | **扩展**：新增事件 payload 定义 |
| `AppEventBus` | `src/main/services/event-bus.ts` | `subscribe()`/`emit()`/`emitEvent()` | **不修改**，构造函数注入 |
| `ActiveAiModeState` | `src/main/services/mode/types.ts:44-49` | `{ conversationId, aiModeId, activatedAt, activatedBy }` | **扩展**：追加 `focused?` + `focusUntil?` |
| `AiModeRegistry` | `src/main/services/mode/ai-mode-registry.ts` | `getActiveMode()`/`activeStates` Map | **扩展**：新增 `setFocused()`/`getActiveModeState()` |
| `CheckpointScheduler` | `src/main/services/memory/checkpoint-scheduler.ts` | `run()` 中 `extract()`→`applyExtractionReport()` 流程 | **扩展**：构造函数追加 `postProcessors`，run() 中追加后处理 |
| `MemoryExtractor` | `src/main/services/memory/memory-extractor.ts` | `extract()` 返回 `ExtractionReport` | **不修改**，仅消费 report |
| `ExtractionReport` | `src/main/services/memory/types.ts` | `{ added, merged, discarded }` | 类型引用 |
| `SubAgentExecutor` | `src/main/services/ai/sub-agent-executor.ts` | `spawnSubAgent(agentId, params)` | **不修改**，焦点摘要调用 |
| `IPC_CHANNELS` | `src/shared/types.ts` | 已有通道常量 | **扩展**：追加通知 + 焦点 10 个通道 |
| `Preload API` | `src/preload/index.ts` | `window.electronAPI` 命名空间 | **扩展**：追加 `notifications`/`focusMode` 命名空间 |
| `modeStore` | `src/renderer/store/modeStore.ts` | `useModeStore`/`getActiveMode()` | 焦点指示器消费当前 mode |
| `AiModeSwitcher` | `src/renderer/components/mode/AiModeSwitcher.tsx` | 焦点指示器集成点 | **扩展**：在切换器旁渲染 FocusModeIndicator |

### 2.4 被依赖关系（下游消费者）

| 下游任务 | 消费的接口 | 阻塞关系 |
|---------|-----------|----------|
| PHASE2-TASK007 Presence 信号层 | `collab-peer-active` 规则注册、`presence.*` 事件类型 | 弱依赖：TASK007 会注册 presence 事件发射 |
| PHASE2-TASK008 AI 主动建议引擎 | `notification.created` 事件、`system.suggestion` 通知类型 | 弱依赖：建议引擎消费通知中心能力 |
| PHASE2-TASK009 协作冲突 AI 合并 | `git.conflict-detected` 事件触发 `collab-conflict` 规则 | 弱依赖：冲突事件桥接 |

---

## 三、现有代码盘点与差距分析

### 3.1 AppEventBus 与事件类型现状（`event-bus-types.ts`，145 行）

**已有能力：**
- `SibyllaEventType` 联合类型包含 55 种事件
- `EventPayloadMap` 提供类型安全的 payload 映射
- 已有 `notification.created` 事件（`{ notificationId: string }`）
- 已有 `collab.conflict-detected`（`{ path: string }`）和 `collab.user-joined`（`{ userId: string }`）

**差距分析：**

| 差异点 | 现状 | 本任务需要 | 处理方式 |
|--------|------|-----------|---------|
| `collab.conflict-detected` | 已有占位，payload 为 `{ path: string }` | 需重命名为 `git.conflict-detected` 并丰富 payload | **修改**：追加新类型，保留旧类型（兼容） |
| `notification.clicked`/`notification.dismissed` | 不存在 | 本任务通知交互事件 | **新增** |
| `aiMode.focused-changed` | 不存在 | 焦点模式切换事件 | **新增** |
| `presence.*` 四个事件 | 不存在 | 预留给 TASK007 | **新增**（占位） |
| `index.completed` payload | `{ documentCount: number }` | 规则检查 `fileCount > 100`，需映射 `documentCount` → `fileCount` | 规则中使用 `event.payload.documentCount` |

### 3.2 AiMode 类型与注册表现状

**已有能力（`mode/types.ts`：59 行）：**
- `ActiveAiModeState`：`{ conversationId, aiModeId, activatedAt, activatedBy }`
- `AiModeDefinition`：含 `systemPromptPrefix`、`outputConstraints` 等

**差距分析：**

| 差异点 | 现状 | 需要 | 处理 |
|--------|------|------|------|
| `focused` 属性 | 不存在 | 焦点叠加状态 | 在 `ActiveAiModeState` 追加 `focused?: boolean` |
| `focusUntil` 属性 | 不存在 | 定时解除时间 | 在 `ActiveAiModeState` 追加 `focusUntil?: string` |
| `getActiveModeState()` | 不存在，仅有 `getActiveMode()` 返回 `AiModeDefinition` | 需要获取完整 state（含 focused） | 在 `AiModeRegistry` 新增方法 |
| `setFocused()` | 不存在 | 焦点切换入口 | 在 `AiModeRegistry` 新增方法 |

### 3.3 CheckpointScheduler 现状（316 行）

**已有能力：**
- `run()` 方法：extract → applyExtractionReport → indexReport → evolutionLog
- `maybeRun()` 由定时器/交互计数/手动触发
- 构造函数接收 7 个参数

**差距分析：**

| 差异点 | 现状 | 需要 | 处理 |
|--------|------|------|------|
| 后处理扩展点 | 不存在 | `ExtractionPostProcessor[]` 在 extract 后、apply 前 | 构造函数追加可选参数 |
| `NotificationPreferenceExtractor` | 不存在 | 通知偏好提取 | 新建独立类，注册到 scheduler |

### 3.4 IPC 通道与 Preload 现状

**已有通道模式（以 `unified-search.ts` handler 为参考）：**
- handler 通过 `ipcMain.handle()` 注册
- Preload 通过 `ipcRenderer.invoke()` 封装
- M→R 推送通过 `webContents.send()`

**需新增 10 个 IPC 通道**（6 通知 + 4 焦点）+ 4 个 M→R 推送事件。

### 3.5 渲染进程 Store 现状

**已有参考：** `modeStore.ts`（125 行）— Zustand + devtools，IPC action 封装，事件监听注册。
**需新建：** `notificationStore.ts` + `focusStore.ts`，遵循相同模式。

---

## 四、实施步骤 — 阶段 A：类型系统与事件注册（步骤 1）

> 目标：建立通知模块的类型基础，扩展事件类型目录。无运行时依赖，可独立编译验证。

### 步骤 1.1：创建通知类型系统

**文件：** `sibylla-desktop/src/main/services/notifications/types.ts`（新建）

```
定义内容：
├── NotificationType = 9 种联合类型
│   'mcp.mention' | 'mcp.assigned' | 'mcp.urgent'
│   | 'collab.conflict' | 'collab.peer-active'
│   | 'memory.insight' | 'performance.alert'
│   | 'system.indexed' | 'system.suggestion'
│
├── NotificationPriority = 'urgent' | 'high' | 'normal' | 'low'
│
├── NotificationNavigation (独立类型，5 种 kind)
│   | { kind: 'file'; path: string; line?: number }
│   | { kind: 'memory'; entryId: string }
│   | { kind: 'mcp'; provider: string; recordId: string }
│   | { kind: 'trace'; traceId: string }
│   | { kind: 'external'; url: string }
│
├── NotificationAction { label: string; action: string; payload?: unknown }
│
├── Notification (核心接口)
│   { id: string (ULID), type, priority,
│     source: { provider: string; ref?: string },
│     title, body, groupKey, navigation,
│     actions?: NotificationAction[],
│     createdAt: number, readAt?, dismissedAt?,
│     metadata: Record<string, unknown> }
│
├── NotificationDraft = Omit<Notification, 'id' | 'createdAt'>
│
├── NotificationRule (规则接口)
│   { id: string, eventType: SibyllaEventType,
│     description: string, enabled: boolean,
│     condition?: (event: SibyllaEvent) => boolean,
│     build: (event: SibyllaEvent) => NotificationDraft | null }
│
├── MutedRule { type: string; sourceProvider?: string; mutedAt: number }
│
├── NotificationPreferences
│   { schemaVersion: 1; mutedRules: MutedRule[];
│     scheduledFocus?: { enabled: boolean; startHour: number; endHour: number } }
│
└── FocusState (IPC 返回类型)
    { focused: boolean; focusUntil?: string; queueLength: number }
```

**验证：** `npx tsc --noEmit` 编译通过。

### 步骤 1.2：创建通知常量

**文件：** `sibylla-desktop/src/main/services/notifications/constants.ts`（新建）

```
├── PRIORITY_ORDER: Record<NotificationPriority, number>
│   { urgent: 0, high: 1, normal: 2, low: 3 }
├── DEDUP_WINDOW_MS = 3_600_000      // 60 分钟
├── COLLAPSE_THRESHOLD = 5            // 同 groupKey 折叠阈值
├── ARCHIVE_THRESHOLD_DAYS = 7
├── DISMISS_TRIGGER_COUNT = 3
├── DISMISS_WINDOW_MS = 3_600_000     // 60 分钟
└── NOTIFICATION_DB_VERSION = 1
```

### 步骤 1.3：扩展事件类型目录

**文件：** `sibylla-desktop/src/main/services/event-bus-types.ts`（修改）

在 `SibyllaEventType` 联合类型中追加：

```typescript
// 通知交互事件
| 'notification.clicked'
| 'notification.dismissed'
// 焦点模式事件
| 'aiMode.focused-changed'
// Git 冲突（替代 collab.conflict-detected 占位）
| 'git.conflict-detected'
// Presence 占位（TASK007 实际使用）
| 'presence.user-online'
| 'presence.user-offline'
| 'presence.user-editing'
| 'presence.user-viewing'
```

在 `EventPayloadMap` 中追加对应 payload 类型。

**兼容性处理：** 保留 `collab.conflict-detected` 不删除（避免破坏已有消费者），`git.conflict-detected` 是新事件，两者暂时共存。

**验证：** 编译通过，已有代码不受影响。

---

## 五、实施步骤 — 阶段 B：数据存储层（步骤 2）

> 目标：实现通知的 SQLite 持久化。独立于引擎，可通过单元测试完全覆盖。

### 步骤 2.1：实现 NotificationStore

**文件：** `sibylla-desktop/src/main/services/notifications/notification-store.ts`（新建）

**核心方法清单：**

| 方法 | 签名 | 说明 |
|------|------|------|
| `initialize()` | `() => void` | 建表 + 索引 + schema 版本检查 |
| `create()` | `(draft: NotificationDraft) => Notification` | ULID 生成 + JSON 序列化 + 写入 |
| `getById()` | `(id: string) => Notification \| null` | JSON 反序列化 |
| `getUnread()` | `(options?) => Notification[]` | 优先级排序 + 分页 |
| `getByGroupKey()` | `(groupKey: string) => Notification[]` | 聚合查询 |
| `markRead()` | `(id: string) => void` | 设置 readAt |
| `markDismissed()` | `(id: string) => void` | 设置 dismissedAt |
| `archiveStale()` | `() => number` | 7 天未读归档 + JSONL 追加 |
| `markStale()` | `(id: string) => void` | 标记失效 |
| `findByGroupKeyRecent()` | `(groupKey, windowMs) => Notification \| null` | 去重查询 |
| `updateExisting()` | `(id, updates) => void` | 去重更新 |
| `flushToDisk()` | `() => void` | WAL checkpoint |
| `recordAction()` | `(notifId, type, source, action) => void` | 写入 actions 表 |
| `getDismissStats()` | `(type, source, windowMs) => { total, dismissed }` | 偏好统计 |

**SQLite Schema：**

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  priority TEXT NOT NULL,
  source_provider TEXT,
  source_ref TEXT,
  title TEXT NOT NULL,
  body TEXT,
  group_key TEXT NOT NULL,
  navigation_kind TEXT,
  navigation_payload TEXT,  -- JSON
  actions TEXT,             -- JSON array
  metadata TEXT,            -- JSON object
  created_at INTEGER NOT NULL,
  read_at INTEGER,
  dismissed_at INTEGER,
  archived_at INTEGER,
  stale INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notification_actions (
  id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  source_provider TEXT,
  action TEXT NOT NULL,     -- click/dismiss/mute/snooze
  created_at INTEGER NOT NULL
);

-- 4 个索引（见任务文档 §SQLite 存储设计）
```

**归档 JSONL 路径：** `{workspace}/.sibylla/notifications/archive/{YYYY-MM}.jsonl`

**验证：** 单元测试覆盖 CRUD、去重查询、归档、统计查询。

---

## 六、实施步骤 — 阶段 C：通知规则（步骤 3）

> 目标：实现 8 类内置通知规则。每条规则独立测试，build 函数异常隔离。

### 步骤 3.1：实现内置规则工厂

**文件：** `sibylla-desktop/src/main/services/notifications/notification-rules.ts`（新建）

**工厂签名：**
```typescript
export function createBuiltinRules(deps: {
  currentUserId: string
  getRecentFiles: () => string[]
}): NotificationRule[]
```

**8 条规则实现要点：**

| 规则 ID | eventType | condition 要点 | build 输出 | groupKey 模式 |
|---------|-----------|---------------|-----------|--------------|
| `mcp-mention` | `mcp.sync-completed` | records 含当前用户 mention | priority=high, navigation={kind:'mcp'} | `mcp-mention:{provider}:{channelId}` |
| `mcp-assigned` | `mcp.sync-completed` | record.assignee=currentUserId | priority=high | `mcp-assigned:{provider}:{issueId}` |
| `mcp-urgent` | `mcp.sync-completed` | labels 含 urgent/blocker/p0 | priority=urgent | `mcp-urgent:{provider}:{issueId}` |
| `collab-conflict` | `git.conflict-detected` | 总是 true | priority=urgent, navigation={kind:'file'} | `collab-conflict:{filePath}` |
| `collab-peer-active` | `presence.user-editing` | editingFile 在 getRecentFiles() 中 | priority=normal | `collab-peer-active:{filePath}:{userId}` |
| `memory-insight` | `memory.checkpoint-completed` | added.length>=3 && 置信度均值>0.85 | priority=low | `memory-insight` |
| `performance-alert-relay` | `performance.alert` | severity==='critical' | priority=high | `perf-alert:{source}` |
| `system-indexed` | `index.completed` | documentCount>100 | priority=normal | `system-indexed` |

**异常隔离：** 每条规则的 `build` 包裹 try-catch，异常时返回 `null`，不阻断其他规则。

**注意：** `mcp.sync-completed` 的 payload 现状为 `{ taskId: string }`，实际 record 数据需从 McpSyncManager 获取或扩展 payload。初期规则实现以 payload 中可获取的数据为准，`mcp-mention`/`mcp-assigned`/`mcp-urgent` 规则的完整实现依赖后续 Sprint 3.6 对 `mcp.sync-completed` payload 的丰富（当前可做骨架，待 payload 扩展后补全）。

**验证：** 每条规则独立测试 condition + build 多场景。

---

## 七、实施步骤 — 阶段 D：核心引擎（步骤 4）

> 目标：实现通知引擎核心——事件消费→规则匹配→去重→偏好过滤→焦点检查→持久化→广播。

### 步骤 4.1：实现 NotificationEngine

**文件：** `sibylla-desktop/src/main/services/notifications/notification-engine.ts`（新建）

**核心流程（与任务文档一致）：**

```
AppEventBus.subscribe(eventType)
    │
    ▼
_handleEvent(rule, event)
    ├── step 1: rule.condition?.(event) → false → return
    ├── step 2: rule.build(event) → null → return (try-catch 包裹)
    ├── step 3: 去重检查 store.findByGroupKeyRecent(groupKey, DEDUP_WINDOW_MS)
    │   └── 已存在 → store.updateExisting() → return
    ├── step 4: preferenceLearner.isMuted(type, source.provider) → return
    ├── step 5: focusModeController?.isFocused()
    │   └── focused && priority < urgent → _enqueueToFocusedQueue() → return
    ├── step 6: store.create(draft)
    └── step 7: eventBus.emit('notification.created', { notification })
```

**关键方法：**

| 方法 | 说明 |
|------|------|
| `initialize()` | 初始化 store + 注册规则 + 启动归档定时器 |
| `registerRules(rules)` | 遍历规则调用 `eventBus.subscribe()` |
| `_handleEvent(rule, event)` | 核心处理链（7 步） |
| `recordAction(id, action)` | 写入 action + 偏好检查 |
| `navigate(id)` | 检查目标有效性 → 执行跳转 |
| `_enqueueToFocusedQueue(draft)` | 追加写入焦点队列 JSONL |
| `getFocusedQueuePreview()` | 读取队列前 10 条 |
| `shutdown()` | flush + 清理定时器 + 取消订阅 |

**依赖注入：** 构造函数接收 `AppEventBus`、`NotificationStore`、`PreferenceLearner`、`FocusModeController`(可选)。

**验证：** 事件消费链路完整测试、去重正确、异常隔离、焦点队列写入。

---

## 八、实施步骤 — 阶段 E：偏好学习与焦点模式（步骤 5-6）

> 目标：实现偏好学习器（静音建议）和焦点模式控制器（队列管理 + AI 摘要）。

### 步骤 5.1：实现 PreferenceLearner

**文件：** `sibylla-desktop/src/main/services/notifications/preference-learner.ts`（新建）

**核心方法：**

| 方法 | 说明 |
|------|------|
| `load()` | 读取 `preferences.json`，文件损坏用默认值 |
| `isMuted(type, source?)` | 遍历 mutedRules 匹配 |
| `mute(type, source?)` | 追加规则 + `_save()` 持久化（原子替换） |
| `unmute(type, source?)` | 移除规则 + `_save()` |
| `checkAndSuggestMute(type, source?)` | 查询 dismiss 统计，>=3 次触发静音建议通知 |
| `_save()` | 先写 `.tmp` 再原子 `rename` |
| `getScheduledFocus()` | 读取定时焦点配置 |
| `setScheduledFocus(config)` | 更新 + `_save()` |

**降级策略：** `_save()` 失败时仅更新内存缓存，记录 warning 日志。

### 步骤 5.2：实现 FocusModeController

**文件：** `sibylla-desktop/src/main/services/mode/focus-mode-controller.ts`（新建）

**核心方法：**

| 方法 | 说明 |
|------|------|
| `setFocused(convId, focused, until?)` | 更新 state + 创建/flush 队列 + 发射事件 |
| `isFocused(convId?)` | 查询 ActiveAiModeState.focused |
| `_flushFocusedQueue()` | 读队列 → AI 摘要（或降级批量 create） → 删除文件 |
| `getQueuePreview()` | 读取前 10 条 |
| `checkScheduledFocus()` | 检查定时焦点，每分钟轮询 |
| `shutdown()` | 清理定时器 + flush 队列 |

**AI 摘要降级：**
- `subAgentExecutor` 存在 → `spawnSubAgent('focus-summary-curator')` 10s 超时
- 失败/超时 → 队列中通知批量 create（无 AI 摘要）
- `subAgentExecutor` 不存在 → 直接批量 create

### 步骤 5.3：扩展 AiMode 类型与注册表

**文件：** `sibylla-desktop/src/main/services/mode/types.ts`（修改）

```typescript
export interface ActiveAiModeState {
  conversationId: string
  aiModeId: AiModeId
  activatedAt: string
  activatedBy: 'user' | 'system' | 'auto-detect'
  focused?: boolean       // 新增
  focusUntil?: string     // 新增
}
```

**文件：** `sibylla-desktop/src/main/services/mode/ai-mode-registry.ts`（修改）

新增方法：
```typescript
setFocused(conversationId: string, focused: boolean, until?: string): void
getActiveModeState(conversationId: string): ActiveAiModeState | undefined
```

**关键：** `switchMode()` 在重置 activeState 时需保留 `focused` 和 `focusUntil` 字段（焦点跨 AiMode 切换保持）。

---

## 九、实施步骤 — 阶段 F：记忆系统集成（步骤 7）

> 目标：将通知偏好提取器注入 CheckpointScheduler 后处理链。

### 步骤 7.1：定义 ExtractionPostProcessor 接口

**文件：** `sibylla-desktop/src/main/services/memory/types.ts`（修改）

```typescript
export interface ExtractionContext {
  logs: LogEntry[]
  existingMemory: MemoryEntry[]
  workspaceContext: string
}

export interface ExtractionPostProcessor {
  process(report: ExtractionReport, context: ExtractionContext): ExtractionCandidate[]
}
```

### 步骤 7.2：实现 NotificationPreferenceExtractor

**文件：** `sibylla-desktop/src/main/services/notifications/notification-preference-extractor.ts`（新建）

**核心逻辑：**
```sql
SELECT notification_type, source_provider,
       COUNT(*) as total,
       SUM(CASE WHEN action = 'dismiss' THEN 1 ELSE 0 END) as dismissed
FROM notification_actions
WHERE created_at > ?
GROUP BY notification_type, source_provider
HAVING total > 5
```

过滤条件：`dismissalRate > 0.8 && total > 5`
输出：`ExtractionCandidate { section: 'user_preference', confidence: min(rate, 0.95), content, metadata }`

### 步骤 7.3：扩展 CheckpointScheduler

**文件：** `sibylla-desktop/src/main/services/memory/checkpoint-scheduler.ts`（修改）

- 构造函数追加可选参数 `postProcessors?: ExtractionPostProcessor[]`
- `run()` 方法中，在 `extract()` 返回 report 之后、`applyExtractionReport()` 之前追加后处理调用
- 每个 processor 包裹 try-catch，单个失败不影响主流程

---

## 十、实施步骤 — 阶段 G：Sub-agent 与 Slash Command（步骤 8）

### 步骤 8.1：创建焦点摘要 Sub-agent Prompt

**文件：** `sibylla-desktop/resources/prompts/agents/focus-summary-curator.md`（新建）

遵循现有 `resources/prompts/agents/*.md` 格式（参考 `memory-curator.md`）：
- frontmatter：`name`、`description`、`inherit_memory: false`、`allowed_tools`、`output_schema`
- body：按源分组 → 合并同类 → 识别 action items → 按重要性排序
- output_schema 为结构化 JSON：`{ summary: string, actionItems: [{ verb, source, description }] }`

### 步骤 8.2：注册 3 个 Slash Command

**文件：** `sibylla-desktop/src/main/ipc/handlers/command.ts`（修改）

| 命令 | pattern | 执行 |
|------|---------|------|
| `/focus on` | `/focus on` | `focusModeController.setFocused(convId, true)` |
| `/focus off` | `/focus off` | `focusModeController.setFocused(convId, false)` |
| `/focus until` | `/focus until {time}` | 解析 HH:mm → `setFocused(convId, true, parsedTime)` |

时间解析：`HH:mm` 格式，已过则推到明天。

---

## 十一、实施步骤 — 阶段 H：IPC 层（步骤 9）

### 步骤 9.1：注册通知 IPC Handler

**文件：** `sibylla-desktop/src/main/ipc/handlers/notification.ts`（新建）

| 通道 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `notification:list` | `{ limit?, offset? }` | `Notification[]` | 调用 store.getUnread |
| `notification:markRead` | `{ id }` | `void` | markRead + recordAction('click') |
| `notification:dismiss` | `{ id }` | `void` | recordAction('dismiss') |
| `notification:navigate` | `{ id }` | `void` | engine.navigate(id) |
| `notification:getPreferences` | 无 | `NotificationPreferences` | preferenceLearner.load() |
| `notification:updatePreferences` | `{ mutedRules?, scheduledFocus? }` | `void` | 更新偏好 |

### 步骤 9.2：注册焦点 IPC Handler

**文件：** `sibylla-desktop/src/main/ipc/handlers/focus-mode.ts`（新建）

| 通道 | 参数 | 返回 |
|------|------|------|
| `focus:toggle` | `{ conversationId, focused }` | `void` |
| `focus:setUntil` | `{ conversationId, until }` | `void` |
| `focus:getState` | `{ conversationId }` | `FocusState` |
| `focus:getQueuePreview` | 无 | `NotificationDraft[]` |

### 步骤 9.3：M→R 推送事件

注册 4 个主进程→渲染进程推送：
- `notification:created` — 新通知创建时
- `notification:updated` — 通知状态更新时
- `focus:modeChanged` — 焦点模式切换时
- `focus:summaryReady` — 焦点摘要生成完毕时

### 步骤 9.4：扩展 IPC_CHANNELS 与 Preload API

**文件：** `sibylla-desktop/src/shared/types.ts`（修改）
- 追加 10 个通道常量到 `IPC_CHANNELS`
- 追加类型到 `IPCChannelMap`

**文件：** `sibylla-desktop/src/preload/index.ts`（修改）
- 追加 `window.electronAPI.notifications` 命名空间（6 方法）
- 追加 `window.electronAPI.focusMode` 命名空间（4 方法）
- 追加 4 个 M→R 事件监听注册方法

---

## 十二、实施步骤 — 阶段 I：渲染进程 Store（步骤 10）

### 步骤 10.1：notificationStore

**文件：** `sibylla-desktop/src/renderer/store/notificationStore.ts`（新建）

```typescript
interface NotificationState {
  notifications: Notification[]
  isLoading: boolean
  unreadCount: number
  preferences: NotificationPreferences | null
}
interface NotificationActions {
  fetchNotifications: (options?) => Promise<void>
  markRead: (id: string) => Promise<void>
  dismiss: (id: string) => Promise<void>
  navigate: (id: string) => Promise<void>
  fetchPreferences: () => Promise<void>
  updatePreferences: (updates) => Promise<void>
  addNotification: (notification: Notification) => void
  updateNotification: (id: string, updates: Partial<Notification>) => void
}
```

- Zustand + devtools（无 persist，每次启动从 SQLite 重新加载）
- 初始化时注册 `notification:created`/`notification:updated` IPC 推送监听

### 步骤 10.2：focusStore

**文件：** `sibylla-desktop/src/renderer/store/focusStore.ts`（新建）

```typescript
interface FocusState {
  isFocused: boolean
  focusUntil: string | null
  queueLength: number
  queuePreview: NotificationDraft[]
  summary: string | null
}
interface FocusActions {
  toggle: (conversationId: string, focused: boolean) => Promise<void>
  setUntil: (conversationId: string, until: string) => Promise<void>
  fetchState: (conversationId: string) => Promise<void>
  fetchQueuePreview: () => Promise<void>
  setSummary: (summary: string) => void
}
```

- 监听 `focus:modeChanged` 和 `focus:summaryReady` IPC 推送

---

## 十三、实施步骤 — 阶段 J：UI 组件（步骤 11-12）

### 步骤 11.1：通知中心 UI（5 组件）

**目录：** `sibylla-desktop/src/renderer/components/notifications/`

| 组件 | 文件 | 核心功能 |
|------|------|---------|
| `NotificationCenter` | `NotificationCenter.tsx` | 侧边栏抽屉主面板；未读 badge；"全部已读"按钮；偏好设置入口 |
| `NotificationGroup` | `NotificationGroup.tsx` | 同 groupKey 折叠/展开；"全部标记已读" |
| `NotificationItem` | `NotificationItem.tsx` | 优先级色条 + 标题/body + 相对时间 + action 按钮；stale 半透明；点击跳转 |
| `EmptyState` | `EmptyState.tsx` | bell-off 图标 + "暂无通知" |
| `NotificationPreferencesPanel` | `NotificationPreferencesPanel.tsx` | 静音规则列表 + 定时焦点设置 |

**交互：**
- 点击通知 → `notificationStore.navigate(id)`
- dismiss → `notificationStore.dismiss(id)`
- 优先级颜色：urgent=红(#ef4444)、high=橙(#f59e0b)、normal=蓝(#6366f1)、low=灰(#94a3b8)

### 步骤 11.2：焦点模式 UI（2 组件）

**目录：** `sibylla-desktop/src/renderer/components/focus/`

| 组件 | 文件 | 核心功能 |
|------|------|---------|
| `FocusModeIndicator` | `FocusModeIndicator.tsx` | 显示在 AiModeSwitcher 旁；激活态蓝紫发光脉冲 + 倒计时 + hover 队列预览 tooltip |
| `FocusSummaryCard` | `FocusSummaryCard.tsx` | 焦点退出后 toast 展示；按源分组 Markdown + action items；300ms 滑入；15s 自动淡出 |

**集成点：** `FocusModeIndicator` 嵌入 `AiModeSwitcher.tsx` 的返回 JSX 中，位于 mode 下拉按钮旁。

---

## 十四、实施步骤 — 阶段 K：测试（步骤 13）

### 14.1 测试文件清单

| 测试文件 | 覆盖模块 |
|---------|---------|
| `tests/main/services/notifications/notification-store.test.ts` | CRUD、去重查询、归档、统计 |
| `tests/main/services/notifications/notification-rules.test.ts` | 8 条规则 condition + build |
| `tests/main/services/notifications/notification-engine.test.ts` | 核心链路、去重、焦点队列 |
| `tests/main/services/notifications/preference-learner.test.ts` | 静音/解除、3 次 dismiss 触发、原子写入 |
| `tests/main/services/notifications/notification-preference-extractor.test.ts` | SQL 聚合、dismissalRate 计算 |
| `tests/main/mode/focus-mode-controller.test.ts` | 焦点切换、定时解除、队列 flush、AI 摘要降级 |
| `tests/main/ipc/notification-handler.test.ts` | IPC 通道注册与调用 |
| `tests/main/ipc/focus-mode-handler.test.ts` | IPC 通道注册与调用 |
| `tests/renderer/store/notificationStore.test.ts` | Store 状态管理 |
| `tests/renderer/store/focusStore.test.ts` | Store 状态管理 |
| `tests/renderer/components/notifications/NotificationCenter.test.tsx` | 组件渲染 |

### 14.2 测试策略

- **主进程逻辑：** 使用内存 SQLite（`:memory:`）测试 NotificationStore
- **规则测试：** mock event payload，验证 condition 返回值 + build 输出
- **引擎测试：** mock eventBus/store/learner/controller，验证处理链路
- **IPC 测试：** 参考 `tests/main/ipc/unified-search-handler.test.ts` 模式
- **UI 测试：** React Testing Library + mock store
- **覆盖率目标：** ≥ 80%

---

## 十五、集成验证与风险

### 15.1 集成检查点

| 检查项 | 验证方式 |
|--------|---------|
| 事件消费链路 | 发射 `mcp.sync-completed` → 验证通知创建 |
| 去重 | 同 groupKey 60 分钟内只保留最新 |
| 聚合 | 5 条同源折叠显示 |
| 归档 | 7 天未读自动归档 |
| 焦点模式 | `/focus on` → 非 urgent 入队列 → `/focus off` → AI 摘要 |
| 偏好学习 | 连续 3 次 dismiss → 静音建议弹出 |
| 记忆集成 | NotificationPreferenceExtractor 在 checkpoint 中被调用 |
| AiMode 兼容 | 焦点叠加不影响现有 5 个 AiMode 行为 |

### 15.2 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| `mcp.sync-completed` payload 不含 record 详情 | mcp-mention/assigned/urgent 规则无法完整实现 | 初期做骨架，待 Sprint 3.6 丰富 payload 后补全 |
| Sub-agent 执行超时 | 焦点摘要生成失败 | 10s 超时 + 降级批量 create |
| SQLite WAL 锁冲突 | 并发写入性能 | better-sqlite3 同步写入，无 WAL 并发问题 |
| 焦点队列文件损坏 | 退出焦点时无法读取队列 | 解析时跳过无效行，记录 warning |

---

## 十六、里程碑与执行顺序

```
Day 1 ─── 阶段 A + B
  ├── 步骤 1: 类型系统 + 常量 + 事件类型扩展
  └── 步骤 2: NotificationStore (SQLite)

Day 2 ─── 阶段 C + D
  ├── 步骤 3: 8 类内置规则
  └── 步骤 4: NotificationEngine 核心

Day 3 ─── 阶段 E
  ├── 步骤 5: PreferenceLearner
  ├── 步骤 6: FocusModeController + AiMode 扩展
  └── 步骤 7: NotificationPreferenceExtractor + CheckpointScheduler 扩展

Day 4 ─── 阶段 F + G + H
  ├── 步骤 8: Sub-agent prompt + Slash Command
  ├── 步骤 9: IPC handlers + Preload API
  └── 步骤 10: Zustand stores

Day 5 ─── 阶段 I + J
  ├── 步骤 11: 通知中心 UI (5 组件)
  ├── 步骤 12: 焦点模式 UI (2 组件)
  └── 步骤 13: 单元测试 + 集成验证

Day 6 ─── Buffer
  └── 测试补充 + 性能验证 + 遗留修复
```

### 关键路径

```
类型系统 → Store → 规则 → Engine → (PreferenceLearner + FocusModeController) → IPC → Store → UI
                        ↘ NotificationPreferenceExtractor → CheckpointScheduler
                        ↘ Sub-agent prompt → Slash Command
```

**最短阻塞链：** 类型 → Store → 规则 → Engine（Day 1-2 完成后即可并行开发后续模块）。
