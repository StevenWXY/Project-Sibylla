# 智能通知中心与焦点模式

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK006 |
| **任务标题** | 智能通知中心与焦点模式 |
| **所属阶段** | Phase 2 - 智能通知与协作增强 (Sprint 5) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 5-6 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

构建 Sprint 5 的通知基础设施——智能通知中心（NotificationCenter）与焦点模式（Focus Mode）。通知中心作为 `AppEventBus` 的核心消费者，将系统事件转化为按优先级排序、去重聚合、可路由跳转的用户通知；焦点模式叠加在 AiMode 上，在用户专注工作时静默非紧急通知并于退出时生成 AI 摘要；偏好学习机制通过滑动窗口统计用户行为，自动沉淀通知偏好到记忆系统。

### 背景

Sprint 1-4 已交付编辑器、Git 同步、AI 对话/Harness/记忆/Trace、AI 模式/Skill/Sub-agent/Workflow、MCP 集成、跨源搜索与 ContextEngine v2。但用户面临三个痛点：

| 问题 | 现状 | 本任务解决 |
|------|------|-----------|
| 离开电脑回来漏掉关键信息 | 无通知机制，需要主动查看各模块 | 通知中心聚合 8+ 类事件源，按优先级排序 |
| AI 知道很多但不知何时开口 | AI 完全被动，无主动建议能力 | 焦点模式为后续主动建议引擎提供静默控制 |
| 通知变成打扰源 | 无优先级、无偏好、无静默机制 | 偏好学习 + 焦点模式 + 摘要 |

**核心设计约束：**

1. **不重建事件总线**：仅消费 Sprint 4 的 `AppEventBus.subscribe()` / `subscribeAny()`，不引入新总线
2. **通知规则注册式管理**：内置 8 类规则，后续 Sprint 可追加，通过 `condition + build` 函数链处理
3. **焦点模式 = AiMode 叠加属性**：不是独立模式，而是在 `ActiveAiModeState` 上新增 `focused?: boolean`
4. **偏好走记忆系统**：用户通知行为通过 Sprint 3.2 的 `MemoryExtractor` 沉淀为 `user_preference` 类型记忆
5. **通知 Navigation 独立类型**：不复用 `UnifiedSearchResult.navigation`（通知场景含 trace/mcp 等，搜索含 handbook）
6. **通知偏好持久化失败不阻塞展现**：降级为内存态

### 范围

**包含：**

- `NotificationEngine` — 通知引擎核心（事件消费 → 规则匹配 → 去重 → 持久化 → 广播）
- `NotificationStore` — SQLite 存储（通知条目 CRUD、未读状态、归档）
- 内置 8 类通知规则（mcp-mention / mcp-assigned / mcp-urgent / collab-conflict / collab-peer-active / memory-insight / performance-alert-relay / system-indexed）
- `PreferenceLearner` — 滑动窗口统计 + 静音建议触发
- `NotificationPreferenceExtractor` — 注入 `CheckpointScheduler` 的 `ExtractionPostProcessor`
- `FocusModeController` — 焦点模式叠加属性管理（与 AiModeRegistry 集成）
- 焦点队列管理（`.sibylla/notifications/focused-queue/`）
- `focus-summary-curator` Sub-agent prompt
- 3 个 Slash Command（`/focus on`、`/focus off`、`/focus until`）
- 通知中心 UI（NotificationCenter / NotificationGroup / NotificationItem / EmptyState）
- 焦点模式 UI（FocusModeIndicator / FocusSummaryCard）
- 通知偏好设置 UI
- IPC handlers（notification.ts / focus-mode.ts）
- Zustand stores（notificationStore / focusStore）
- 事件类型注册（`git.conflict-detected`、`presence.user-online` 等替代 Sprint 4 占位）
- 单元测试

**不包含：**

- 主动建议引擎（TASK008）
- Presence 信号层（TASK007）
- 协作冲突 AI 合并（TASK009）
- 协作上下文层 L7（TASK007）
- Sprint 4 的 `AppEventBus` 核心修改（仅追加事件类型到目录）
- Sprint 3.2 的 `MemoryExtractor` 本体修改（仅注册后处理扩展器）

## 依赖关系

### 前置依赖

- [x] PHASE2-TASK001 — 事件总线基础设施（`AppEventBus.subscribe()` / `emitEvent()` / `SibyllaEventType`）
- [x] PHASE2-TASK003 — ContextEngine v2（不修改，偏好记忆通过 MEMORY.md 进入上下文）
- [x] Sprint 3.2 — 记忆系统（`MemoryExtractor` + `CheckpointScheduler` + `MEMORY.md`）
- [x] Sprint 3.3 — Trace 系统（`Tracer` + `withSpan()`）
- [x] Sprint 3.4 — AiMode 系统（`AiModeRegistry` + `ActiveAiModeState`）
- [x] Sprint 3.5 — Sub-agent 系统（`SubAgentExecutor` + `SlashCommandRegistry`）
- [x] Sprint 3.6 — MCP 同步事件源（`mcp.sync-completed` 事件）
- [x] Sprint 1 — Tiptap 编辑器（通知跳转到编辑器）

### 被依赖任务

- [ ] PHASE2-TASK007 — Presence 信号层与协作上下文（依赖通知中心注册 `collab-peer-active` 规则）
- [ ] PHASE2-TASK008 — AI 主动建议引擎（依赖通知中心发送 `system.suggestion` 类型通知）
- [ ] PHASE2-TASK009 — 协作冲突 AI 合并（依赖 `git.conflict-detected` 事件触发 `collab-conflict` 规则）

## 参考文档

- [`specs/requirements/phase2/sprint5-collaboration.md`](../../requirements/phase2/sprint5-collaboration.md) — 需求 5.1（通知中心）、5.2（焦点模式）、§3 非功能需求
- [`specs/design/architecture.md`](../../design/architecture.md) — 进程通信架构、模块划分
- [`specs/design/data-and-api.md`](../../design/data-and-api.md) — IPC 接口约定、本地 SQLite 设计
- [`specs/design/ui-ux-design.md`](../../design/ui-ux-design.md) — UI/UX 设计规范
- [`specs/design/testing-and-security.md`](../../design/testing-and-security.md) — 测试策略
- [`specs/design/memory-system-design.md`](../../design/memory-system-design.md) — 记忆系统三层存储、CheckpointScheduler
- [`CLAUDE.md`](../../../CLAUDE.md) — 设计哲学（AI 建议人类决策、本地优先、可观测）
- `.kilocode/skills/phase1/zustand-state-management/SKILL.md` — Zustand store 设计
- `.kilocode/skills/phase1/sqlite-local-storage/SKILL.md` — SQLite 本地存储设计
- `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` — Electron IPC 通信模式

## 验收标准

### 通知引擎核心

- [ ] `NotificationEngine` 在主进程启动时注入 `AppEventBus`、`NotificationStore`、`PreferenceLearner`
- [ ] 事件到达后 200ms 内完成通知条目创建（从事件到通知写入 SQLite）
- [ ] 通知规则异常隔离——单条规则抛异常不影响其他规则处理
- [ ] 相同 `groupKey` 在 60 分钟窗口内只保留最新一条（去重抑制）
- [ ] 同 `groupKey` 超过 5 条未读自动折叠分组显示
- [ ] 7 天未读通知自动归档到 `.sibylla/notifications/archive/{YYYY-MM}.jsonl`
- [ ] 通知目标失效（文件已删除、MCP 记录已移除）时标记为 `stale`，从默认视图排除
- [ ] workspace 关闭前 flush 待处理通知到磁盘
- [ ] 通知创建后广播 `notification.created` 事件供其他模块消费

### 8 类内置规则

- [ ] `mcp-mention`：订阅 `mcp.sync-completed`，record 包含当前用户提及时生成 high 优先级通知
- [ ] `mcp-assigned`：订阅 `mcp.sync-completed`，record.assignee = 当前用户时生成 high 优先级通知
- [ ] `mcp-urgent`：订阅 `mcp.sync-completed`，record.labels 含 urgent/blocker/p0 时生成 urgent 优先级通知
- [ ] `collab-conflict`：订阅 `git.conflict-detected`（新增事件），总是生成 urgent 优先级通知
- [ ] `collab-peer-active`：订阅 `presence.user-editing`（TASK007 定义），编辑文件在我最近 7 天修改列表中时生成 normal 优先级通知
- [ ] `memory-insight`：订阅 `memory.checkpoint-completed`，report.added.length >= 3 且置信度均值 > 0.85 时生成 low 优先级通知
- [ ] `performance-alert-relay`：订阅 `performance.alert`，severity = 'critical' 时生成 high 优先级通知
- [ ] `system-indexed`：订阅 `index.completed`，fileCount > 100 时生成 normal 优先级通知

### 通知中心 UI

- [ ] 通知中心面板可打开/关闭，打开时加载速度 < 300ms
- [ ] 通知按优先级（urgent > high > normal > low）排序，同优先级按时间倒序
- [ ] 点击通知执行 `navigation` 跳转（file → 编辑器、memory → 记忆面板、mcp → 同步数据、trace → Trace Inspector）
- [ ] 点击通知后发射 `notification.clicked` 事件供偏好学习
- [ ] dismiss 通知后同 `groupKey` 60 分钟内不再出现
- [ ] 通知中心空状态展示友好提示
- [ ] 未读/已读切换正确

### 焦点模式

- [ ] `/focus on` 通过命令面板调用后设置 `AiMode.focused = true`，发射 `aiMode.focused-changed` 事件
- [ ] `/focus off` 关闭焦点模式
- [ ] `/focus until 18:00` 设置自动解除时间，到时间自动关闭
- [ ] 焦点模式下 priority < urgent 的通知进入队列（不展现 toast、不响铃）
- [ ] 焦点模式下 urgent 通知以减弱动画展现（无声、无闪烁）
- [ ] 退出焦点时，若队列长度 > 0，触发 `spawnSubAgent('focus-summary-curator')` 生成摘要
- [ ] 摘要按源分组，识别 action items（review、approve、reply、fix 等动词）
- [ ] 摘要作为 `system.suggestion` 通知展现，可点击展开
- [ ] 定时焦点（如每日 9-12 点）自动启用
- [ ] 焦点队列存储在 `.sibylla/notifications/focused-queue/{startTime}.jsonl`
- [ ] `FocusModeIndicator` 显示在 AiMode 切换器旁

### 偏好学习

- [ ] 用户连续 3 次 dismiss 同 `(type, source)` 通知（60 分钟窗口），弹出静音建议
- [ ] 用户接受静音建议后，偏好持久化到 `.sibylla/notifications/preferences.json`，100ms 内生效
- [ ] 偏好持久化失败时降级为内存态，不阻塞通知展现
- [ ] `NotificationPreferenceExtractor` 在 `MemoryExtractor` checkpoint 时被 `CheckpointScheduler` 调用
- [ ] 提取条件：7 天内 dismissalRate > 80% 且 sampleSize > 5
- [ ] 提取结果为 `ExtractionCandidate { section: 'user_preference', confidence, content }`
- [ ] 偏好记忆条目可被用户 `lock`（Sprint 3.2 锁定机制）

### 性能要求

- [ ] 通知创建到展现 < 500ms（P95）
- [ ] 通知中心打开 < 300ms
- [ ] 焦点模式切换 < 100ms
- [ ] 通知规则评估（condition 函数）< 10ms（单条）

### 单元测试

- [ ] NotificationEngine 核心逻辑测试（规则匹配、去重、聚合、归档）
- [ ] 8 类通知规则各自测试（condition + build 多场景）
- [ ] NotificationStore CRUD 测试
- [ ] PreferenceLearner 滑动窗口统计测试
- [ ] NotificationPreferenceExtractor 提取逻辑测试
- [ ] FocusModeController 焦点切换与定时测试
- [ ] 焦点队列管理测试（入队、出队、flush）
- [ ] IPC handler 测试
- [ ] notificationStore / focusStore 状态管理测试
- [ ] 通知中心 UI 组件渲染测试
- [ ] 覆盖率 ≥ 80%

## 技术策略

### 核心架构：事件消费 → 规则匹配 → 去重聚合 → 持久化 → 广播

```
AppEventBus.subscribe(eventType)
         │
         ▼
NotificationEngine.handleEvent(event)
         │
         ├── 遍历订阅了此 eventType 的 NotificationRule[]
         │   ├── rule.condition(event) → false? 跳过
         │   └── rule.build(event) → NotificationDraft | null
         │
         ├── 去重检查: groupKey + 60 分钟窗口
         │   └── 已存在 → 更新而非新建（保留原 id，刷新 body/时间）
         │
         ├── PreferenceFilter 过滤
         │   └── 用户已静音此 (type, source)? → 丢弃
         │
         ├── 焦点模式检查
         │   ├── focused=true && priority < urgent → 入焦点队列
         │   └── focused=false || priority=urgent → 正常展现
         │
         ├── NotificationStore.persist(notification) → SQLite
         │
         └── eventBus.emitEvent('notification.created', { notification })
              │
              ▼
         渲染进程通过 IPC 事件桥接接收更新
```

### 通知数据模型

```
Notification (核心接口)
    ├── id: string (ULID)
    ├── type: NotificationType (9 种)
    ├── priority: NotificationPriority (urgent/high/normal/low)
    ├── source: { provider: string; ref?: string }
    ├── title: string
    ├── body: string
    ├── groupKey: string (聚合与去重)
    ├── navigation: NotificationNavigation (独立类型，6 种 kind)
    ├── actions?: NotificationAction[]
    ├── createdAt: number
    ├── readAt?: number
    ├── dismissedAt?: number
    └── metadata: Record<string, unknown>

NotificationRule (规则接口)
    ├── id: string
    ├── eventType: SibyllaEventType
    ├── description: string
    ├── enabled: boolean
    ├── condition?: (event) => boolean (快速过滤)
    └── build: (event) => NotificationDraft | null

NotificationNavigation (独立导航类型)
    ├── { kind: 'file'; path; line? }
    ├── { kind: 'memory'; entryId }
    ├── { kind: 'mcp'; provider; recordId }
    ├── { kind: 'trace'; traceId }
    └── { kind: 'external'; url }
```

### SQLite 存储设计

```
notifications 表:
    ├── id TEXT PRIMARY KEY
    ├── type TEXT NOT NULL
    ├── priority TEXT NOT NULL
    ├── source_provider TEXT
    ├── source_ref TEXT
    ├── title TEXT NOT NULL
    ├── body TEXT
    ├── group_key TEXT NOT NULL
    ├── navigation_kind TEXT
    ├── navigation_payload JSON
    ├── actions JSON
    ├── metadata JSON
    ├── created_at INTEGER NOT NULL
    ├── read_at INTEGER
    ├── dismissed_at INTEGER
    ├── archived_at INTEGER
    └── stale INTEGER DEFAULT 0

notification_actions 表 (偏好学习统计):
    ├── id TEXT PRIMARY KEY
    ├── notification_id TEXT NOT NULL
    ├── notification_type TEXT NOT NULL
    ├── source_provider TEXT
    ├── action TEXT NOT NULL (click/dismiss/mute/snooze)
    └── created_at INTEGER NOT NULL

索引:
    ├── idx_notifications_type_priority (type, priority)
    ├── idx_notifications_group_key_created (group_key, created_at)
    ├── idx_notifications_archived (archived_at) WHERE archived_at IS NOT NULL
    └── idx_actions_type_source_created (notification_type, source_provider, created_at)
```

### 焦点模式状态流

```
用户 /focus on
    │
    ▼
FocusModeController.setFocused(conversationId, true)
    │
    ├── 更新 ActiveAiModeState.focused = true
    ├── 发射 aiMode.focused-changed 事件
    └── 创建焦点队列文件 focused-queue/{startTime}.jsonl
         │
         ▼  (通知到达时)
NotificationEngine 检查 focused 状态
    ├── priority < urgent → 写入队列文件，不展现
    └── priority = urgent → 减弱动画展现（无声无闪烁）
         │
         ▼  (用户 /focus off 或定时到达)
FocusModeController.setFocused(conversationId, false)
    │
    ├── 读取队列文件
    ├── 队列长度 > 0?
    │   └── spawnSubAgent('focus-summary-curator')
    │       ├── 输入: 队列中所有通知的摘要
    │       └── 输出: 按源分组的摘要 + action items
    │           └── 作为 system.suggestion 通知展现
    └── 删除队列文件
```

### 偏好学习事件链

```
用户 dismiss 通知
    │
    ▼
NotificationEngine.recordAction(notificationId, 'dismiss')
    │
    ├── 写入 notification_actions 表
    │
    ├── 滑动窗口统计 (SQLite 查询)
    │   └── 同 (type, source) 在 60 分钟内 dismiss 3 次?
    │       └── 是 → 创建 system.suggestion 通知询问是否静音
    │
    └── 每次 MemoryExtractor checkpoint
        │
        ▼
    NotificationPreferenceExtractor.process(report, context)
        │
        ├── 从 notification_actions 表聚合 7 天统计
        ├── dismissalRate > 80% && sampleSize > 5?
        │   └── 是 → 产出 ExtractionCandidate
        │       { section: 'user_preference', confidence, content }
        └── 返回 candidates[]
            │
            ▼
    CheckpointScheduler 追加到 report.added
            │
            ▼
    写入 MEMORY.md → 进入 ContextEngine 上下文
```

### 依赖库选型

| 用途 | 库 | 说明 |
|------|-----|------|
| 状态管理 | `zustand`（已有） | notificationStore / focusStore |
| 本地存储 | `better-sqlite3`（已有） | 通知 SQLite |
| ID 生成 | `ulid`（已有） | 通知 ID |
| UI 组件 | `TailwindCSS`（已有） | 所有样式 |
| 动画 | `framer-motion`（已有） | 焦点切换动画 |

## 技术执行路径

### 步骤 1：定义通知类型系统与事件注册

**文件：** `src/main/services/notifications/types.ts`（新建）

1. 定义 `NotificationType` 联合类型（9 种类型：mcp.mention / mcp.assigned / mcp.urgent / collab.conflict / collab.peer-active / memory.insight / performance.alert / system.indexed / system.suggestion）
2. 定义 `NotificationPriority` 联合类型（urgent / high / normal / low）
3. 定义 `Notification` 接口：id (ULID)、type、priority、source、title、body、groupKey、navigation、actions、createdAt、readAt、dismissedAt、metadata
4. 定义 `NotificationNavigation` 独立类型（5 种 kind：file / memory / mcp / trace / external），不复用 `UnifiedSearchResult.navigation`
5. 定义 `NotificationAction` 接口：label、action (string)、payload
6. 定义 `NotificationRule` 接口：id、eventType (SibyllaEventType)、description、enabled、condition (可选)、build
7. 定义 `NotificationDraft` 类型（Omit Notification 的 id 和 createdAt）

**文件：** `src/main/services/notifications/constants.ts`（新建）

8. 定义优先级排序权重常量：`PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 }`
9. 定义去重窗口常量：`DEDUP_WINDOW_MS = 60 * 60 * 1000`（60 分钟）
10. 定义聚合阈值：`COLLAPSE_THRESHOLD = 5`（同 groupKey 超过 5 条折叠）
11. 定义归档阈值：`ARCHIVE_THRESHOLD_DAYS = 7`
12. 定义偏好学习阈值：`DISMISS_TRIGGER_COUNT = 3`、`DISMISS_WINDOW_MS = 60 * 60 * 1000`

**文件：** `src/main/services/event-bus/types.ts`（修改 Sprint 4 的 PHASE2-TASK001）

13. 在 `SibyllaEventType` 联合类型中追加：
    - `'git.conflict-detected'`（替代预留的 `collab.conflict-detected`）
    - `'notification.created'`、`'notification.clicked'`、`'notification.dismissed'`
    - `'aiMode.focused-changed'`
    - 预留 `'presence.user-online'`、`'presence.user-offline'`、`'presence.user-editing'`、`'presence.user-viewing'`（TASK007 实际使用）
14. 删除 Sprint 4 预留的 `collab.conflict-detected` 和 `collab.user-joined`（被新事件替代）

**验证：** 类型编译通过、无 any、SibyllaEventType 无冲突。

### 步骤 2：实现 NotificationStore（SQLite 存储层）

**文件：** `src/main/services/notifications/notification-store.ts`（新建）

1. 定义 `NotificationStore` 类，构造函数接收 SQLite Database 实例
2. 实现 `initialize()` 方法：
   - 创建 `notifications` 表（id / type / priority / source_provider / source_ref / title / body / group_key / navigation_kind / navigation_payload / actions / metadata / created_at / read_at / dismissed_at / archived_at / stale）
   - 创建 `notification_actions` 表（id / notification_id / notification_type / source_provider / action / created_at）
   - 创建 4 个索引：
     - `idx_notifications_type_priority` (type, priority)
     - `idx_notifications_group_key_created` (group_key, created_at)
     - `idx_notifications_archived` (archived_at) WHERE archived_at IS NOT NULL
     - `idx_actions_type_source_created` (notification_type, source_provider, created_at)
   - 启动 `schemaVersion` 版本化检查（当前版本 1）
3. 实现 `create(draft: NotificationDraft): Notification` 方法：
   - 生成 ULID 作为 id
   - 设置 createdAt = Date.now()
   - 写入 SQLite（navigation 序列化为 JSON、actions 序列化为 JSON、metadata 序列化为 JSON）
   - 返回完整 Notification 对象
4. 实现 `getById(id: string): Notification | null` 方法：反序列化 JSON 字段
5. 实现 `getUnread(options?: { limit?: number; offset?: number }): Notification[]` 方法：
   - WHERE read_at IS NULL AND archived_at IS NULL AND stale = 0
   - ORDER BY PRIORITY_ORDER 映射 + created_at DESC
   - 支持分页
6. 实现 `getByGroupKey(groupKey: string): Notification[]` 方法
7. 实现 `markRead(id: string): void` 方法
8. 实现 `markDismissed(id: string): void` 方法：设置 dismissedAt
9. 实现 `archiveStale(): number` 方法：
   - WHERE created_at < (now - 7天) AND read_at IS NULL AND archived_at IS NULL
   - 批量 UPDATE archived_at = now
   - 同时将归档数据追加到 `.sibylla/notifications/archive/{YYYY-MM}.jsonl`
   - 返回归档数量
10. 实现 `markStale(id: string): void` 方法
11. 实现 `findByGroupKeyRecent(groupKey: string, windowMs: number): Notification | null` 方法：查找指定 groupKey 在时间窗口内的最新记录
12. 实现 `updateExisting(id: string, updates: Partial<Notification>): void` 方法（用于去重更新）
13. 实现 `flushToDisk(): void` 方法：确保 SQLite WAL 刷盘
14. 实现 `recordAction(notificationId: string, notificationType: string, sourceProvider: string | undefined, action: string): void` 方法：写入 notification_actions 表
15. 实现 `getDismissStats(type: string, sourceProvider: string | undefined, windowMs: number): { total: number; dismissed: number }` 方法：从 notification_actions 表聚合统计

**验证：** 所有 CRUD 操作正确、去重查询正确、归档逻辑正确、统计查询正确。

### 步骤 3：实现内置 8 类通知规则

**文件：** `src/main/services/notifications/notification-rules.ts`（新建）

1. 定义 `createBuiltinRules(deps: { currentUserId: string; getRecentFiles: () => string[] }): NotificationRule[]` 工厂函数
2. 实现 `mcp-mention` 规则：
   - eventType: `'mcp.sync-completed'`
   - condition: 检查 event.payload.records 中是否包含当前用户名的 mention
   - build: 提及记录 → NotificationDraft(title: "xxx 在 #channel 提到你"、priority: 'high'、groupKey: `mcp-mention:${provider}:${channelId}`、navigation: { kind: 'mcp', provider, recordId })
3. 实现 `mcp-assigned` 规则：
   - eventType: `'mcp.sync-completed'`
   - condition: 检查 record.assignee === currentUserId
   - build: 指派记录 → NotificationDraft(title: "xxx 指派给你一个 issue"、priority: 'high'、groupKey: `mcp-assigned:${provider}:${issueId}`)
4. 实现 `mcp-urgent` 规则：
   - eventType: `'mcp.sync-completed'`
   - condition: 检查 record.labels 包含 'urgent' / 'blocker' / 'p0'
   - build: 紧急记录 → NotificationDraft(title: "紧急: xxx"、priority: 'urgent'、groupKey: `mcp-urgent:${provider}:${issueId}`)
5. 实现 `collab-conflict` 规则：
   - eventType: `'git.conflict-detected'`
   - condition: 总是返回 true
   - build: 冲突信息 → NotificationDraft(title: "协作冲突: {filePath}"、priority: 'urgent'、groupKey: `collab-conflict:${filePath}`、navigation: { kind: 'file', path })
6. 实现 `collab-peer-active` 规则：
   - eventType: `'presence.user-editing'`
   - condition: 检查 editingFile 是否在 `getRecentFiles()` 返回的最近 7 天修改列表中
   - build: → NotificationDraft(title: "{userName} 正在编辑 {fileName}"、priority: 'normal'、groupKey: `collab-peer-active:${filePath}:${userId}`)
7. 实现 `memory-insight` 规则：
   - eventType: `'memory.checkpoint-completed'`
   - condition: report.added.length >= 3 且置信度均值 > 0.85
   - build: → NotificationDraft(title: "发现了 {N} 条高价值记忆"、priority: 'low'、groupKey: `memory-insight`)
8. 实现 `performance-alert-relay` 规则：
   - eventType: `'performance.alert'`
   - condition: event.payload.severity === 'critical'
   - build: → NotificationDraft(title: "性能告警: {message}"、priority: 'high'、groupKey: `perf-alert:${source}`)
9. 实现 `system-indexed` 规则：
   - eventType: `'index.completed'`
   - condition: event.payload.fileCount > 100
   - build: → NotificationDraft(title: "索引完成: {fileCount} 个文件"、priority: 'normal'、groupKey: `system-indexed`)
10. 所有规则的 build 函数包裹在 try-catch 中，异常时返回 null（不阻断其他规则）

**验证：** 每条规则单独测试 condition 和 build、异常隔离正确、groupKey 生成一致。

### 步骤 4：实现 NotificationEngine（核心引擎）

**文件：** `src/main/services/notifications/notification-engine.ts`（新建）

1. 定义 `NotificationEngine` 类，构造函数注入 `AppEventBus`、`NotificationStore`、`PreferenceLearner`、`FocusModeController`（可选）
2. 实现 `initialize()` 方法：
   - 调用 `store.initialize()` 初始化 SQLite 表
   - 调用 `registerRules(createBuiltinRules(deps))` 注册内置规则
   - 启动定时器（每小时）调用 `archiveStale()`
3. 实现 `registerRules(rules: NotificationRule[])` 方法：
   - 遍历规则，对每个规则调用 `eventBus.subscribe(rule.eventType, handler)`
   - handler 为内部 `_handleEvent` 方法（带规则上下文绑定）
   - 将规则存入 `Map<ruleId, NotificationRule>`
4. 实现 `_handleEvent(rule: NotificationRule, event: SibyllaEvent)` 私有方法：
   - step 1: 若 rule.condition 存在，调用 `rule.condition(event)`，false → return
   - step 2: 调用 `rule.build(event)` 返回 draft，null → return（build 异常也返回 null）
   - step 3: 去重检查 `store.findByGroupKeyRecent(draft.groupKey, DEDUP_WINDOW_MS)`
     - 已存在 → `store.updateExisting(existing.id, { body: draft.body, title: draft.title })` → return
   - step 4: PreferenceFilter 检查 `preferenceLearner.isMuted(draft.type, draft.source.provider)`
     - 已静音 → return
   - step 5: 焦点模式检查 `focusModeController?.isFocused()`
     - focused && priority < urgent → `_enqueueToFocusedQueue(draft)` → return
   - step 6: `store.create(draft)` 创建通知
   - step 7: `eventBus.emitEvent({ type: 'notification.created', payload: notification })` 广播
5. 实现 `recordAction(notificationId: string, action: 'click' | 'dismiss' | 'mute' | 'snooze')` 方法：
   - 查询通知详情获取 type 和 source
   - `store.recordAction(notificationId, type, source.provider, action)`
   - 若 action === 'click' → `store.markRead(notificationId)`
   - 若 action === 'dismiss' → `store.markDismissed(notificationId)` + `preferenceLearner.checkAndSuggestMute(type, source.provider)`
   - 发射 `notification.clicked` 或 `notification.dismissed` 事件
6. 实现 `navigate(notificationId: string)` 方法：
   - 获取通知的 navigation 字段
   - 检查目标有效性（文件存在？MCP 记录存在？）
   - 目标失效 → `store.markStale(notificationId)` → return
   - 根据 navigation.kind 执行跳转（file → 打开编辑器、memory → 打开记忆面板、mcp → 跳转 MCP 数据、trace → 打开 Trace Inspector、external → shell.openExternal）
7. 实现 `_enqueueToFocusedQueue(draft: NotificationDraft)` 私有方法：
   - 追加写入当前焦点队列文件 `.sibylla/notifications/focused-queue/{startTime}.jsonl`
   - 每行一条 JSON（draft 序列化）
8. 实现 `getFocusedQueuePreview(): NotificationDraft[]` 方法：读取当前队列文件前 10 条预览
9. 实现 `shutdown()` 方法：
   - `store.flushToDisk()`
   - 清理定时器
   - 取消所有 eventBus 订阅

**验证：** 事件消费链路完整、去重正确、异常隔离正确、焦点队列写入正确、shutdown 清理完整。

### 步骤 5：实现 PreferenceLearner（偏好学习）

**文件：** `src/main/services/notifications/preference-learner.ts`（新建）

1. 定义 `PreferenceLearner` 类，构造函数接收 `NotificationStore` 和偏好文件路径（`.sibylla/notifications/preferences.json`）
2. 定义 `MutedRule` 接口：`{ type: string; sourceProvider?: string; mutedAt: number }`
3. 定义 `NotificationPreferences` 接口：`{ schemaVersion: 1; mutedRules: MutedRule[]; scheduledFocus?: { enabled: boolean; startHour: number; endHour: number } }`
4. 实现 `load()` 方法：
   - 读取 `.sibylla/notifications/preferences.json`，不存在则创建默认空偏好
   - 解析为 `NotificationPreferences` 对象，缓存到内存
   - 文件损坏 → 使用默认偏好，记录 warning 日志
5. 实现 `isMuted(type: string, sourceProvider?: string): boolean` 方法：
   - 遍历 `cachedPreferences.mutedRules`
   - 匹配 type + sourceProvider（sourceProvider 为 undefined 时只匹配 type）
   - 返回是否被静音
6. 实现 `mute(type: string, sourceProvider?: string): void` 方法：
   - 追加 `MutedRule` 到 `cachedPreferences.mutedRules`
   - 调用 `_save()` 持久化
   - 持久化失败 → 仅更新内存缓存，记录 warning 日志（降级策略）
7. 实现 `unmute(type: string, sourceProvider?: string): void` 方法
8. 实现 `checkAndSuggestMute(type: string, sourceProvider?: string): void` 方法：
   - 调用 `store.getDismissStats(type, sourceProvider, DISMISS_WINDOW_MS)`
   - 计算：如果 dismissed >= DISMISS_TRIGGER_COUNT（3 次）且 total >= DISMISS_TRIGGER_COUNT
   - 满足条件 → 通过 NotificationEngine 创建 `system.suggestion` 类型通知
     - title: "要静音此类通知吗？"
     - body: "你最近多次忽略了来自 {source} 的 {type} 通知"
     - actions: [{ label: '静音', action: 'mute', payload: { type, sourceProvider } }, { label: '不用', action: 'dismiss' }]
     - groupKey: `suggest-mute:${type}:${sourceProvider ?? 'all'}`
     - priority: 'low'
9. 实现 `_save()` 私有方法：
   - 先写临时文件 `.sibylla/notifications/preferences.json.tmp`
   - 原子替换为 `.sibylla/notifications/preferences.json`
   - 遵循 CLAUDE.md "先写临时文件再原子替换" 红线
10. 实现 `getScheduledFocus(): NotificationPreferences['scheduledFocus']` 方法：返回定时焦点配置
11. 实现 `setScheduledFocus(config: { enabled: boolean; startHour: number; endHour: number }): void` 方法

**验证：** 静音检查正确、3 次 dismiss 触发建议、持久化降级正确、原子写入正确。

### 步骤 6：实现 FocusModeController（焦点模式控制器）

**文件：** `src/main/services/mode/focus-mode-controller.ts`（新建）

1. 定义 `FocusModeController` 类，构造函数注入 `AiModeRegistry`（Sprint 3.4）、`AppEventBus`、`SubAgentExecutor`（Sprint 3.5，可选）、`workspacePath`
2. 实现 `setFocused(conversationId: string, focused: boolean, until?: string): void` 方法：
   - 调用 `aiModeRegistry.getActiveMode(conversationId)` 获取当前 ActiveAiModeState
   - 若 focused = true：
     - 设置 `state.focused = true`
     - 若 until 存在 → `state.focusUntil = until`（ISO 时间字符串），注册一次性定时器
     - 创建焦点队列文件：`.sibylla/notifications/focused-queue/{Date.now()}.jsonl`
     - 记录 `_currentQueuePath`
   - 若 focused = false：
     - 设置 `state.focused = false`、`state.focusUntil = undefined`
     - 调用 `_flushFocusedQueue()` 处理队列
     - 清除定时器
   - 发射 `aiMode.focused-changed` 事件到 `eventBus`
3. 实现 `isFocused(conversationId?: string): boolean` 方法：
   - 获取当前 ActiveAiModeState
   - 返回 `state.focused === true`
4. 实现 `_flushFocusedQueue()` 私有方法：
   - 读取 `_currentQueuePath` 对应的 JSONL 文件
   - 解析所有行（跳过空行）为 NotificationDraft[]
   - 若队列长度 === 0 → 删除文件，return
   - 若 `subAgentExecutor` 存在：
     - 调用 `spawnSubAgent('focus-summary-curator', { notifications: drafts })`
     - 设置 10 秒超时
     - 成功 → 将摘要作为 `system.suggestion` 通知注入到 NotificationEngine
     - 失败/超时 → 记录 warning 日志，将队列中的通知批量 create 到 NotificationStore
   - 若 `subAgentExecutor` 不存在（降级）：
     - 将队列中的通知批量 create 到 NotificationStore（无 AI 摘要）
   - 删除队列文件
   - 清空 `_currentQueuePath`
5. 实现 `getQueuePreview(): NotificationDraft[]` 方法：
   - 若无活跃队列 → return []
   - 读取队列文件前 10 条
6. 实现 `checkScheduledFocus(): void` 方法：
   - 从 PreferenceLearner 读取 scheduledFocus 配置
   - 若 enabled 且当前时间在 [startHour, endHour) 范围内 → 自动 setFocused(true)
   - 注册每分钟检查的定时器
7. 实现 `shutdown()` 方法：
   - 清除所有定时器
   - 若 focused → 调用 `_flushFocusedQueue()` 刷新

**文件：** `src/main/services/mode/types.ts`（修改 Sprint 3.4 文件）

8. 在 `ActiveAiModeState` 接口中追加：
   ```typescript
   focused?: boolean              // 焦点叠加属性
   focusUntil?: string            // 焦点自动解除时间 (ISO string)
   ```

**文件：** `src/main/services/mode/ai-mode-registry.ts`（修改 Sprint 3.4 文件）

9. 实现 `setFocused(conversationId: string, focused: boolean, until?: string): void` 方法：
   - 更新 activeModeStates Map 中对应条目的 focused 和 focusUntil 字段
   - 不影响 systemPromptPrefix / outputConstraints（焦点是通知层概念）

**验证：** 焦点切换正确、定时解除正确、队列 flush 和 AI 摘要生成正确、降级路径正确。

### 步骤 7：实现 NotificationPreferenceExtractor（记忆系统集成）

**文件：** `src/main/services/notifications/notification-preference-extractor.ts`（新建）

1. 定义 `ExtractionPostProcessor` 接口（在 Sprint 3.2 的 checkpoint-scheduler.ts 中声明）：
   ```typescript
   export interface ExtractionPostProcessor {
     process(report: ExtractionReport, context: ExtractionContext): ExtractionCandidate[]
   }
   ```
2. 定义 `NotificationPreferenceExtractor` 类实现 `ExtractionPostProcessor`
3. 构造函数注入 `NotificationStore`（读取 notification_actions 统计数据）
4. 实现 `process(report: ExtractionReport, context: ExtractionContext): ExtractionCandidate[]` 方法：
   - 从 notification_actions 表聚合最近 7 天数据：
     ```sql
     SELECT notification_type, source_provider,
            COUNT(*) as total,
            SUM(CASE WHEN action = 'dismiss' THEN 1 ELSE 0 END) as dismissed
     FROM notification_actions
     WHERE created_at > ?
     GROUP BY notification_type, source_provider
     HAVING total > 5
     ```
   - 对每组计算 dismissalRate = dismissed / total
   - 过滤：dismissalRate > 0.8 && total > 5
   - 生成 `ExtractionCandidate`：
     ```typescript
     {
       section: 'user_preference',
       confidence: Math.min(dismissalRate, 0.95), // 封顶 0.95
       content: `用户对 ${type} 类通知（来源: ${sourceProvider ?? '全部'}）不感兴趣，7 天内忽略率 ${(dismissalRate * 100).toFixed(0)}%（样本量 ${total}）`,
       metadata: { type, sourceProvider, dismissalRate, sampleSize: total }
     }
     ```
   - 返回所有 candidate

**文件：** `src/main/services/memory/checkpoint-scheduler.ts`（修改 Sprint 3.2 文件）

5. 在 `CheckpointScheduler` 构造函数中新增可选参数 `postProcessors?: ExtractionPostProcessor[]`
6. 在 `run()` 方法中，在 `extractor.extract()` 返回 report 之后、`applyExtractionReport()` 之前，追加：
   ```typescript
   if (this.postProcessors?.length) {
     for (const processor of this.postProcessors) {
       try {
         const extraCandidates = processor.process(report, context)
         report.added.push(...extraCandidates)
       } catch (err) {
         logger.warn('ExtractionPostProcessor failed', { processor: processor.constructor.name, error: err })
       }
     }
   }
   ```
   - 每个 processor 包裹 try-catch，单个失败不影响其他 processor 和主流程

**验证：** ExtractionPostProcessor 接口定义正确、NotificationPreferenceExtractor 统计查询正确、CheckpointScheduler 集成点正确、异常隔离正确。

### 步骤 8：实现 Sub-agent Prompt 与 Slash Command

**文件：** `resources/prompts/agents/focus-summary-curator.md`（新建）

1. 编写 Sub-agent prompt 文件，遵循 Sprint 3.5 的 prompt 资源格式：
   ```markdown
   ---
   name: focus-summary-curator
   description: 生成焦点模式期间积攒通知的 AI 摘要
   inherit_memory: false
   allowed_tools:
     - reference_file
   output_schema:
     type: object
     properties:
       summary:
         type: string
         description: 按源分组的摘要 Markdown
       actionItems:
         type: array
         items:
           type: object
           properties:
             verb: { type: string }
             source: { type: string }
             description: { type: string }
     required: [summary, actionItems]
   ---
   
   你是 Sibylla 的焦点摘要助手。用户刚结束焦点模式，期间积攒了一些通知。
   
   ## 输入
   你会收到一个 JSON 数组，每项是一条通知的摘要信息：
   - type: 通知类型
   - priority: 优先级
   - title: 标题
   - body: 内容
   - source: 来源
   
   ## 任务
   1. 按来源（MCP/协作/记忆/系统）分组
   2. 合并同类信息（如 5 条 Slack 提及合并为 1 句）
   3. 识别需要用户行动的项目（review/approve/reply/fix 等动词）
   4. 按重要性排序
   
   ## 输出格式
   输出结构化 JSON（遵循 output_schema），summary 字段为 Markdown 格式。
   ```
2. 确认 prompt 文件放入 `resources/prompts/agents/` 目录
3. 确认文件名与 `spawnSubAgent('focus-summary-curator')` 调用一致

**文件：** `src/main/services/commands/slash-commands.ts`（修改 Sprint 3.5 文件）

4. 注册 3 个 Slash Command：

   **`/focus on`**：
   - id: `'focus-on'`
   - pattern: `/focus on`
   - description: '启用焦点模式'
   - execute: 调用 `focusModeController.setFocused(currentConversationId, true)`
   
   **`/focus off`**：
   - id: `'focus-off'`
   - pattern: `/focus off`
   - description: '关闭焦点模式'
   - execute: 调用 `focusModeController.setFocused(currentConversationId, false)`
   
   **`/focus until`**：
   - id: `'focus-until'`
   - pattern: `/focus until {time}`
   - description: '启用焦点模式到指定时间（如 /focus until 18:00）'
   - execute: 解析时间参数，调用 `focusModeController.setFocused(currentConversationId, true, parsedTime)`
   - 时间解析：支持 HH:mm 格式（如 18:00 → 今天 18:00，若已过则明天）

**验证：** prompt 文件格式符合 Sprint 3.5 规范、Slash Command 注册成功、时间解析正确。

### 步骤 9：实现 IPC Handlers

**文件：** `src/main/ipc/handlers/notification.ts`（新建）

1. 注册通知相关 IPC handlers：

   **`notification:list`**：
   - 参数：`{ limit?: number; offset?: number }`
   - 实现：调用 `notificationEngine.store.getUnread(options)`
   - 返回：`Notification[]`

   **`notification:markRead`**：
   - 参数：`{ id: string }`
   - 实现：调用 `notificationEngine.store.markRead(id)` + `notificationEngine.recordAction(id, 'click')`
   - 返回：`void`

   **`notification:dismiss`**：
   - 参数：`{ id: string }`
   - 实现：调用 `notificationEngine.recordAction(id, 'dismiss')`
   - 返回：`void`

   **`notification:navigate`**：
   - 参数：`{ id: string }`
   - 实现：调用 `notificationEngine.navigate(id)`
   - 返回：`void`

   **`notification:getPreferences`**：
   - 参数：无
   - 实现：调用 `preferenceLearner.load()` 返回当前偏好
   - 返回：`NotificationPreferences`

   **`notification:updatePreferences`**：
   - 参数：`{ mutedRules?: MutedRule[]; scheduledFocus?: ScheduledFocusConfig }`
   - 实现：更新偏好并持久化
   - 返回：`void`

**文件：** `src/main/ipc/handlers/focus-mode.ts`（新建）

2. 注册焦点模式相关 IPC handlers：

   **`focus:toggle`**：
   - 参数：`{ conversationId: string; focused: boolean }`
   - 实现：调用 `focusModeController.setFocused(conversationId, focused)`
   - 返回：`void`

   **`focus:setUntil`**：
   - 参数：`{ conversationId: string; until: string }`
   - 实现：调用 `focusModeController.setFocused(conversationId, true, until)`
   - 返回：`void`

   **`focus:getState`**：
   - 参数：`{ conversationId: string }`
   - 实现：返回 `{ focused: boolean; focusUntil?: string; queueLength: number }`
   - 返回：`FocusState`

   **`focus:getQueuePreview`**：
   - 参数：无
   - 实现：调用 `focusModeController.getQueuePreview()`
   - 返回：`NotificationDraft[]`

**文件：** `src/shared/types.ts`（扩展）

3. 在 `IPC_CHANNELS` 中追加所有新通道常量：
   ```typescript
   NOTIFICATION_LIST: 'notification:list',
   NOTIFICATION_MARK_READ: 'notification:markRead',
   NOTIFICATION_DISMISS: 'notification:dismiss',
   NOTIFICATION_NAVIGATE: 'notification:navigate',
   NOTIFICATION_GET_PREFS: 'notification:getPreferences',
   NOTIFICATION_UPDATE_PREFS: 'notification:updatePreferences',
   FOCUS_TOGGLE: 'focus:toggle',
   FOCUS_SET_UNTIL: 'focus:setUntil',
   FOCUS_GET_STATE: 'focus:getState',
   FOCUS_GET_QUEUE_PREVIEW: 'focus:getQueuePreview',
   ```

**文件：** `src/preload/index.ts`（扩展）

4. 在 `window.electronAPI` 中追加 `notifications` 和 `focusMode` 命名空间：
   ```typescript
   notifications: {
     list: (options?) => ipcRenderer.invoke('notification:list', options),
     markRead: (id) => ipcRenderer.invoke('notification:markRead', { id }),
     dismiss: (id) => ipcRenderer.invoke('notification:dismiss', { id }),
     navigate: (id) => ipcRenderer.invoke('notification:navigate', { id }),
     getPreferences: () => ipcRenderer.invoke('notification:getPreferences'),
     updatePreferences: (updates) => ipcRenderer.invoke('notification:updatePreferences', updates),
   },
   focusMode: {
     toggle: (conversationId, focused) => ipcRenderer.invoke('focus:toggle', { conversationId, focused }),
     setUntil: (conversationId, until) => ipcRenderer.invoke('focus:setUntil', { conversationId, until }),
     getState: (conversationId) => ipcRenderer.invoke('focus:getState', { conversationId }),
     getQueuePreview: () => ipcRenderer.invoke('focus:getQueuePreview'),
   },
   ```

**文件：** IPC 推送事件（M→R）

5. 注册主进程到渲染进程的推送事件：
   - `notification:created` — 新通知创建时推送
   - `notification:updated` — 通知状态更新时推送
   - `focus:modeChanged` — 焦点模式切换时推送
   - `focus:summaryReady` — 焦点摘要生成完毕时推送

**验证：** 所有 IPC 通道注册正确、preload 暴露命名空间正确、双向通信正确。

### 步骤 10：实现渲染进程 Zustand Stores

**文件：** `src/renderer/store/notificationStore.ts`（新建）

1. 定义 `NotificationState` 接口：
   ```typescript
   interface NotificationState {
     notifications: Notification[]
     isLoading: boolean
     unreadCount: number
     preferences: NotificationPreferences | null

     fetchNotifications: (options?: { limit?: number; offset?: number }) => Promise<void>
     markRead: (id: string) => Promise<void>
     dismiss: (id: string) => Promise<void>
     navigate: (id: string) => Promise<void>
     fetchPreferences: () => Promise<void>
     updatePreferences: (updates: Partial<NotificationPreferences>) => Promise<void>
     addNotification: (notification: Notification) => void
     updateNotification: (id: string, updates: Partial<Notification>) => void
   }
   ```
2. 创建 Zustand store，使用 `create` + 无 persist（通知数据每次启动从 SQLite 重新加载）
3. `fetchNotifications`：调用 `window.electronAPI.notifications.list()`
4. `addNotification`：监听 IPC 推送 `notification:created`，追加到 notifications 数组头部
5. `updateNotification`：监听 IPC 推送 `notification:updated`，更新对应条目
6. 在 store 初始化时注册 IPC 推送监听器

**文件：** `src/renderer/store/focusStore.ts`（新建）

7. 定义 `FocusState` 接口：
   ```typescript
   interface FocusState {
     isFocused: boolean
     focusUntil: string | null
     queueLength: number
     queuePreview: NotificationDraft[]
     summary: string | null

     toggle: (conversationId: string, focused: boolean) => Promise<void>
     setUntil: (conversationId: string, until: string) => Promise<void>
     fetchState: (conversationId: string) => Promise<void>
     fetchQueuePreview: () => Promise<void>
     setSummary: (summary: string) => void
   }
   ```
8. 创建 Zustand store，监听 `focus:modeChanged` 和 `focus:summaryReady` IPC 推送

**验证：** Store 状态管理正确、IPC 推送监听正确、状态同步正确。

### 步骤 11：实现通知中心 UI 组件

**文件：** `src/renderer/components/notifications/NotificationCenter.tsx`（新建）

1. 通知中心主面板组件，定位为侧边栏抽屉或模态面板（参考 UI/UX 设计规范）
2. 顶部：
   - 标题 "通知"
   - 未读数量 badge
   - "全部已读" 按钮
3. 通知列表区域：
   - 使用 `notificationStore.notifications` 渲染
   - 按 groupKey 聚合显示：同 groupKey 超过 COLLAPSE_THRESHOLD(5) 条时使用 `<NotificationGroup />` 折叠
   - 未超过阈值使用 `<NotificationItem />` 单条展示
4. 空状态：`<EmptyState />` 展示 "暂无通知"
5. 底部：偏好设置入口（齿轮图标，点击展开偏好面板）
6. 打开时调用 `notificationStore.fetchNotifications()`
7. 性能：虚拟滚动（若通知数量 > 50）

**文件：** `src/renderer/components/notifications/NotificationGroup.tsx`（新建）

8. 通知分组组件：
   - 显示组标题（基于 groupKey 解析出友好名称）
   - 折叠态：显示 "{N} 条来自 {source} 的通知"
   - 展开态：列出所有子通知
   - 折叠/展开切换按钮
   - "全部标记已读" 按钮

**文件：** `src/renderer/components/notifications/NotificationItem.tsx`（新建）

9. 单条通知组件：
   - 左侧：优先级颜色指示条（urgent=红色、high=橙色、normal=蓝色、low=灰色）
   - 中间：标题（粗体）+ body（1-2 行预览）
   - 右侧：时间戳（相对时间："5 分钟前"）
   - 底部：action 按钮组（若 notification.actions 存在）
   - 交互：
     - 点击整条 → `notificationStore.navigate(id)`
     - 右键或 hover 显示操作菜单："标记已读"、"忽略"
     - dismiss 按钮（×）→ `notificationStore.dismiss(id)`
   - stale 通知半透明展示，标记"已失效"
   - 未读通知背景色微高亮

**文件：** `src/renderer/components/notifications/EmptyState.tsx`（新建）

10. 空状态组件：
    - 居中图标（bell-off 或 inbox）
    - 文案："暂无通知"
    - 副文案："有新动态时会在这里提醒你"

**文件：** `src/renderer/components/notifications/NotificationPreferencesPanel.tsx`（新建）

11. 通知偏好设置面板：
    - 已静音规则列表（显示 type + source，支持取消静音）
    - 定时焦点设置（启用/禁用、开始时间、结束时间）
    - 保存按钮 → `notificationStore.updatePreferences()`

**验证：** 通知列表渲染正确、分组折叠/展开正确、优先级颜色正确、跳转正确、空状态展示正确。

### 步骤 12：实现焦点模式 UI 组件

**文件：** `src/renderer/components/focus/FocusModeIndicator.tsx`（新建）

1. 焦点模式指示器组件，显示在 AiMode 切换器旁：
   - 未启用焦点：小图标（可选，不影响布局）
   - 焦点激活态：
     - 蓝紫色发光圆点 + 脉冲动画
     - 显示 "专注中" 文字
     - 若设置了 focusUntil → 显示倒计时（如 "还剩 2:30"）
     - hover 显示队列预览（tooltip）
   - 点击 → 弹出快捷操作：关闭焦点 / 查看队列预览
2. 使用 `focusStore` 获取状态
3. 监听 `focus:modeChanged` IPC 推送更新 UI

**文件：** `src/renderer/components/focus/FocusSummaryCard.tsx`（新建）

4. 焦点摘要卡片组件：
   - 焦点退出后，摘要 ready 时以 notification toast 形式展示
   - 卡片内容：
     - 标题："专注模式摘要"
     - 按源分组的摘要（Markdown 渲染）
     - action items 列表（带高亮动词）
     - "查看详情" 链接 → 展开完整摘要
   - 进入动画：300ms 滑入
   - 15 秒不操作自动淡出
   - 手动关闭按钮

**验证：** 焦点指示器状态同步正确、倒计时正确、摘要卡片渲染正确、动画流畅。

### 步骤 13：集成测试与验证

1. **通知端到端测试：**
   - 模拟 `mcp.sync-completed` 事件 → 验证通知创建
   - 验证去重（同 groupKey 60 分钟内只保留最新）
   - 验证聚合（5 条同源折叠）
   - 验证归档（7 天未读自动归档）

2. **焦点模式端到端测试：**
   - `/focus on` → 验证非 urgent 通知进入队列
   - `/focus until 18:00` → 验证定时解除
   - `/focus off` → 验证 AI 摘要生成（mock Sub-agent）
   - 验证 urgent 通知穿透焦点模式

3. **偏好学习端到端测试：**
   - 连续 dismiss 3 次同 type+source → 验证静音建议弹出
   - 接受静音 → 验证偏好持久化
   - 验证 NotificationPreferenceExtractor 在 checkpoint 中被调用

4. **与已有模块集成验证：**
   - Sprint 4 AppEventBus：验证 subscribe / emitEvent 正确对接
   - Sprint 3.4 AiMode：验证 focused 叠加属性不影响现有 AiMode 行为
   - Sprint 3.5 SlashCommand：验证 3 个 /focus 命令注册
   - Sprint 3.2 MemoryExtractor：验证 NotificationPreferenceExtractor 注入正确

5. **性能测试：**
   - 通知创建到展现 < 500ms
   - 通知中心打开 < 300ms
   - 焦点模式切换 < 100ms
   - 规则评估 < 10ms/条

## 现有代码基础

| 已有模块 | 文件路径 | 本任务使用方式 |
|---------|---------|-------------|
| AppEventBus | `src/main/services/event-bus/` | 订阅事件、广播通知事件、追加事件类型 |
| EventLogStore | `src/main/services/event-bus/event-log-store.ts` | 事件重放恢复通知 |
| AiModeRegistry | `src/main/services/mode/ai-mode-registry.ts` | 扩展 ActiveAiModeState.focused 属性 |
| ActiveAiModeState | `src/main/services/mode/types.ts` | 追加 focused + focusUntil 字段 |
| SubAgentExecutor | `src/main/services/ai/sub-agent-executor.ts` | 调用 spawnSubAgent 生成焦点摘要 |
| SlashCommandRegistry | `src/main/services/commands/slash-commands.ts` | 注册 3 个 /focus 命令 |
| MemoryExtractor | `src/main/services/memory/memory-extractor.ts` | 不修改，仅注册后处理扩展器 |
| CheckpointScheduler | `src/main/services/memory/checkpoint-scheduler.ts` | 追加 postProcessors 扩展点 |
| Tracer | `src/main/services/trace/tracer.ts` | 通知操作通过 withSpan 接入 Trace |
| SyncManager | `src/main/services/sync/sync-manager.ts` | 不修改，消费其 git.conflict-detected 事件 |
| McpSyncManager | `src/main/services/mcp/mcp-sync-manager.ts` | 不修改，消费其 mcp.sync-completed 事件 |
| IPC 类型注册 | `src/shared/types.ts` | 追加 IPC_CHANNELS 常量 |
| Preload 暴露 | `src/preload/index.ts` | 追加 notifications / focusMode 命名空间 |

## 新增文件清单

| 模块 | 文件路径 | 说明 |
|------|---------|------|
| 通知类型 | `src/main/services/notifications/types.ts` | Notification / NotificationRule / NotificationNavigation 类型 |
| 通知常量 | `src/main/services/notifications/constants.ts` | 阈值常量 |
| 通知存储 | `src/main/services/notifications/notification-store.ts` | SQLite CRUD |
| 通知规则 | `src/main/services/notifications/notification-rules.ts` | 8 类内置规则 |
| 通知引擎 | `src/main/services/notifications/notification-engine.ts` | 核心引擎 |
| 偏好学习 | `src/main/services/notifications/preference-learner.ts` | 滑动窗口统计 |
| 偏好提取器 | `src/main/services/notifications/notification-preference-extractor.ts` | 记忆系统集成 |
| 焦点控制器 | `src/main/services/mode/focus-mode-controller.ts` | 焦点模式管理 |
| Sub-agent | `resources/prompts/agents/focus-summary-curator.md` | 焦点摘要 AI prompt |
| IPC-通知 | `src/main/ipc/handlers/notification.ts` | 通知 IPC handlers |
| IPC-焦点 | `src/main/ipc/handlers/focus-mode.ts` | 焦点 IPC handlers |
| Store-通知 | `src/renderer/store/notificationStore.ts` | Zustand 通知状态 |
| Store-焦点 | `src/renderer/store/focusStore.ts` | Zustand 焦点状态 |
| UI-通知中心 | `src/renderer/components/notifications/NotificationCenter.tsx` | 通知中心面板 |
| UI-分组 | `src/renderer/components/notifications/NotificationGroup.tsx` | 通知分组 |
| UI-条目 | `src/renderer/components/notifications/NotificationItem.tsx` | 通知条目 |
| UI-空状态 | `src/renderer/components/notifications/EmptyState.tsx` | 空状态 |
| UI-偏好 | `src/renderer/components/notifications/NotificationPreferencesPanel.tsx` | 偏好设置 |
| UI-焦点指示器 | `src/renderer/components/focus/FocusModeIndicator.tsx` | 焦点状态指示 |
| UI-摘要卡片 | `src/renderer/components/focus/FocusSummaryCard.tsx` | 焦点摘要展示 |

## 涉及的现有文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/main/services/event-bus/types.ts` | 扩展 | SibyllaEventType 追加 8 个新事件类型，删除 2 个预留占位 |
| `src/main/services/mode/types.ts` | 扩展 | ActiveAiModeState 追加 focused? + focusUntil? |
| `src/main/services/mode/ai-mode-registry.ts` | 扩展 | 新增 setFocused() 方法 |
| `src/main/services/commands/slash-commands.ts` | 扩展 | 注册 3 个 /focus Slash Command |
| `src/main/services/memory/checkpoint-scheduler.ts` | 扩展 | 追加 postProcessors 扩展点 |
| `src/shared/types.ts` | 扩展 | IPC_CHANNELS 追加 10 个通道常量 |
| `src/preload/index.ts` | 扩展 | 追加 notifications / focusMode 命名空间 |
| `src/main/services/notifications/index.ts` | 新建 | 模块导出 |

**不修改的文件：**

- `src/main/services/event-bus/event-bus.ts` — 不修改 AppEventBus 核心代码
- `src/main/services/memory/memory-extractor.ts` — 不修改 MemoryExtractor 本体
- `src/main/services/ai/sub-agent-executor.ts` — 不修改 Sub-agent 执行器
- `src/main/services/sync/sync-manager.ts` — 不修改（仅消费其事件）
- `src/main/services/mcp/mcp-sync-manager.ts` — 不修改

---

**创建时间：** 2026-04-30
**最后更新：** 2026-04-30
**更新记录：**
- 2026-04-30 — 创建任务文档（含完整技术执行路径 13 步）
