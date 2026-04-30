# Phase 2 Sprint 5 - 智能通知与协作增强需求

## 一、概述

### 1.1 目标与价值

Sprint 1-4 与 Sprint 3.x 已交付 Sibylla 的核心闭环:编辑器、Git 同步、AI 对话与 Harness、记忆 v2、Trace、AI 模式、Plan、Skill/Sub-agent/Workflow、MCP 集成、跨源统一搜索与上下文引擎 v2。这些能力让 Sibylla 成为"知道全部、找得到、想得清"的工作伙伴。

Sprint 5 的使命是**让 Sibylla 学会主动开口**:从"被动响应"升级为"主动提醒",同时让多人协作的体验从"30 秒一次的 Git 同步盲区"升级为"几秒级的团队感知"。本 Sprint 重点解决:

1. **离开电脑回来后漏掉关键信息**(MCP 同步进来的紧急 issue / Slack @ 提及 / 协作冲突)
2. **AI 知道很多但不知道何时开口**(写完需求后该不该提议拆解任务?)
3. **多人协作时的盲区**(队友刚改了什么文件?当前在哪?)
4. **冲突处理依赖人肉对比**(Sprint 2 的冲突合并需要人工逐行决策)
5. **通知本身成为打扰源**(每条通知都同等重要 → 没有优先级 → 全部静音)

### 1.2 与已完成 Sprint 的关系

| 已完成 Sprint | 本 Sprint 的依赖与扩展 |
|---|---|
| Sprint 1(编辑器) | Tiptap 编辑器中显示 Presence(他人光标位置/选区,只显示状态不传内容)、AI 建议 toast |
| Sprint 2(Git 同步) | **冲突合并增强**:在 SyncManager 检测到冲突时调用 AI 生成合并建议(不替代 ConflictResolver UI);Presence 信号通过独立轻量信道,不走 Git |
| Sprint 3 / 3.1(AI / Harness) | AI 主动建议引擎复用 Generator + GuardrailEngine(独立 single 模式,不污染主对话) |
| Sprint 3.2(记忆 v2) | **通知偏好学习**:用户的滑动/dismiss 行为通过 `MemoryExtractor` 沉淀为 `user_preference` 类型记忆 |
| Sprint 3.3(Trace) | **核心事件源**:所有通知决策、建议触发、Presence 变更产生 Trace span;消费 `progress.task-*`、`performance.alert` 事件 |
| Sprint 3.4(AI 模式) | **焦点模式**复用 `AiModeRegistry` 与命令面板;`/focus` 作为 Slash Command 注册;通知静默规则与 AiMode 切换联动 |
| Sprint 3.5(Skill/Sub-agent) | AI 建议触发器实现为 **Sub-agent**(`suggestion-curator`),通过 `spawnSubAgent` 调用,独立 context 不污染主对话 |
| Sprint 3.6(MCP) | **主要事件生产方**:`mcp.sync-completed`、`mcp.tool-called` 是通知中心的高优先级输入源 |
| Sprint 4(跨源搜索 + ContextEngine v2) | **核心基础设施**:`AppEventBus.subscribe()` 消费事件;`UnifiedSearchEngine` 为建议引擎提供"最近相关内容"扫描;**新增协作上下文层**作为 v2 的 L7 |

### 1.3 关键设计共识

1. **不重建事件总线**:Sprint 4 的 `AppEventBus` 已是系统级事件中心。本 Sprint 仅消费,不引入新的总线。所有订阅使用 `eventBus.subscribe()` / `subscribeAny()`,不使用 `on()`(后者是 Sprint 3.3 的具名方法,已被桥接)。
2. **协作不引入 CRDT**:Sibylla 的"文件即真相 + Git 同步"哲学(CLAUDE.md 第二章)不允许字符级实时协作。本 Sprint 的"协作"指**软实时的状态感知 + AI 辅助冲突合并**,不是 Notion/Google Docs 风格的 OT/CRDT 共编。
3. **AI 建议 = Sub-agent**:不引入新的 AI 调用路径。建议引擎触发后调用 Sprint 3.5 的 `spawnSubAgent('suggestion-curator')`,独立 prompt、独立 context、独立 token 预算。
4. **焦点模式 = AiMode 子集**:不新建"模式"概念。焦点模式是 AiMode 上的一个**叠加属性**(`focused: true`),而非独立 AiMode。任何 AiMode 都可叠加焦点模式。
5. **通知偏好走记忆系统**:用户对通知的反馈(忽略/操作/静音)通过 Sprint 3.2 的 `MemoryExtractor` 写入 `MEMORY.md`,而非独立的偏好存储。
6. **冲突合并仍由用户决策**:AI 仅生成"建议合并版本"作为第三选项,Sprint 2 的"采用我的/对方的/手动合并"三个选项完全保留。

### 1.4 涉及模块

- 模块23(新增):智能通知中心(`src/main/services/notifications/`)
- 模块24(新增):AI 主动建议引擎(`src/main/services/proactive-engine/`)
- 模块25(新增):团队 Presence 信号层(`src/main/services/presence/`)
- 模块12(扩展):权限系统(Presence 受工作区角色约束)
- 模块3(扩展):Git 抽象层(冲突合并增强,新增 `mergeWithAI()` 方法)
- 模块4(扩展):AI 上下文引擎(新增 L7 协作上下文层)
- 模块15(扩展):记忆系统(注入"通知偏好"提取规则)
- 模块19(扩展):AI 模式系统(AiMode 新增 `focused` 叠加状态)

### 1.5 里程碑定义

**完成标志:**
- 通知中心运行,可聚合 8+ 类事件源,按优先级排序与去重
- 焦点模式可启用,通知队列与摘要功能可用
- AI 主动建议在合理时机弹出,4 个内置触发器生效
- 建议 UI 非侵入式,通过 Esc 一键关闭,被动观测不打断
- Presence 状态显示在编辑器与团队面板中,延迟 < 5 秒
- 协作冲突 AI 合并建议作为第三选项接入 Sprint 2 冲突解决器
- 通知偏好可学习(滑动窗口统计),静音建议触发率合理
- 协作上下文层接入 ContextEngine v2(L7)
- 与 Sprint 3.5/3.6/4 集成验证全部通过

---

## 二、功能需求

### 需求 5.1 - 智能通知中心

**用户故事:** 作为用户,我离开电脑回来后,希望快速看到这段时间发生的关键事情(GitHub 上的紧急 issue、Slack 的 @ 提及、AI 学到的新东西、协作冲突),而不是被一堆无关通知淹没。

#### 功能描述

通知中心(NotificationCenter)是 `AppEventBus` 的核心消费者之一。它根据**通知规则(NotificationRule)** 将系统事件转化为对用户有价值的通知项,并提供:

- **按优先级排序**:`urgent > high > normal > low`,基于规则动态评估
- **按源聚合**:同一来源的连续通知自动折叠(如 5 条同源 Slack 提及聚合为 1 条"Alice 在 #pm-channel 提到你 5 次")
- **去重抑制**:相同 `groupKey` 在 1 小时内的通知视为重复,只保留最新
- **路由跳转**:点击通知导航到正确目标(本地文件 / 记忆条目 / MCP 同步副本 / Trace span)
- **持久化**:通知未读状态跨重启保留,7 天未读自动归档

通知规则注册式管理。本 Sprint 内置 8 类规则,后续 Sprint 可追加。规则订阅 `AppEventBus` 的指定 `SibyllaEventType`,在事件到达时通过 `condition + build` 函数链产出通知项。

#### 验收标准

1. When event from `AppEventBus` matches notification rule, the system shall create notification entry within 200ms
2. When user opens notification center, the system shall sort by priority then recency
3. When more than 5 unread notifications share same `groupKey`, the system shall display as collapsed group with count
4. When notification is older than 7 days and unread, the system shall auto-archive to `.sibylla/notifications/archive/`
5. When user dismisses a notification, the system shall not create similar notifications (same `groupKey`) for 60 minutes
6. When notification target is no longer valid (file deleted, MCP record removed), the system shall mark as `stale` and exclude from default view
7. When user clicks notification, the system shall execute `navigation` action and emit `notification.clicked` event for learning
8. When notification rule throws exception, the system shall log and continue processing other rules (isolation)
9. When workspace is closed, the system shall flush pending notifications to disk before exit

#### 技术规格

**通知数据模型:**

```typescript
// src/main/services/notifications/types.ts

export type NotificationType =
  | 'mcp.mention'           // Slack/Discord/Telegram @ 提及
  | 'mcp.assigned'          // GitHub/Linear/Jira issue 被指派
  | 'mcp.urgent-label'      // GitHub urgent / blocker label
  | 'collab.conflict'       // 协作冲突(Sprint 2 SyncManager)
  | 'collab.peer-active'    // 团队成员开始编辑你最近修改的文件
  | 'memory.insight'        // Sprint 3.2 提取到高价值记忆
  | 'performance.alert'     // Sprint 3.3 性能告警
  | 'system.indexed'        // 大批量索引完成
  | 'system.suggestion'     // 系统建议(如"是否静音此类通知")

export type NotificationPriority = 'urgent' | 'high' | 'normal' | 'low'

export interface Notification {
  id: string                // ULID
  type: NotificationType
  priority: NotificationPriority
  source: { provider: string; ref?: string }
  title: string
  body: string
  groupKey: string          // 用于聚合与去重
  navigation:               // 独立类型,不复用 UnifiedSearchResult.navigation
    | { kind: 'file'; path: string; line?: number }
    | { kind: 'memory'; entryId: string }
    | { kind: 'mcp'; provider: string; recordId: string }
    | { kind: 'trace'; traceId: string }
    | { kind: 'external'; url: string }
  // 注意:UnifiedSearchResult.navigation 包含 handbook kind,通知场景不需要。
  // mcp kind 对应 MCP 同步数据的本地文件路径(由 McpSyncManager 落地后可知);
  // trace kind 跳转到 Trace Inspector(Sprint 3.3)。
  actions?: NotificationAction[]    // 内嵌操作按钮
  createdAt: number
  readAt?: number
  dismissedAt?: number
  metadata: Record<string, unknown>
}

export interface NotificationRule {
  id: string
  eventType: SibyllaEventType       // 来自 Sprint 4
  description: string
  enabled: boolean
  condition?: (event: SibyllaEvent) => boolean
  build: (event: SibyllaEvent) => Omit<Notification, 'id' | 'createdAt'> | null
}
```

**核心组件:**

`NotificationEngine` 在主进程启动时注入 `AppEventBus`、`NotificationStore`(SQLite 表)、`PreferenceLearner`(对接记忆系统)。每个内置规则在初始化时通过 `eventBus.subscribe(eventType, handler)` 订阅事件。Handler 内部:

1. 评估 `condition`(快速过滤,纯函数)
2. 调用 `build` 生成 `NotificationDraft`
3. 检查去重(`groupKey` + 60 分钟窗口)
4. 通过 `PreferenceFilter`(用户偏好与焦点模式)
5. 持久化并广播 `notification.created` 事件

**内置规则清单(本 Sprint):**

| 规则 ID | 订阅事件 | 触发条件 | 优先级 |
|---|---|---|---|
| `mcp-mention` | `mcp.sync-completed` | record 包含当前用户提及 | high |
| `mcp-assigned` | `mcp.sync-completed` | record.assignee = 当前用户 | high |
| `mcp-urgent` | `mcp.sync-completed` | record.labels 包含 urgent/blocker/p0 | urgent |
| `collab-conflict` | `git.conflict-detected`(新增,见需求 5.4) | 总是 | urgent |
| `collab-peer-active` | `presence.user-editing`(需求 5.3) | 编辑文件在我最近 7 天修改列表中 | normal |
| `memory-insight` | `memory.checkpoint-completed` | report.added.length >= 3 且置信度均值 > 0.85 | low |
| `performance-alert-relay` | `performance.alert` | severity = 'critical' | high |
| `system-indexed` | `index.completed` | fileCount > 100 | normal |

#### 优先级

P0 - 必须完成

---

### 需求 5.2 - 焦点模式与通知偏好学习

**用户故事:** 作为用户,在专注工作或会议时,我希望通知静默,结束后看到精炼摘要;同时希望系统能学习我的偏好,自动减少我不在乎的通知。

#### 功能描述

焦点模式不是新建的"模式",而是**叠加在 Sprint 3.4 `AiMode` 上的一个属性**。用户在 Plan/Analyze/Review/Write/Free 任一 AiMode 下都可启用焦点。命令面板新增 `/focus on`、`/focus off`、`/focus until 18:00` 三条 Slash Command(基于 Sprint 3.5 的 SlashCommand 系统)。

启用焦点后:
- 优先级 < `urgent` 的通知进入**队列**(不展现 toast,不响铃)
- 队列存储在 `.sibylla/notifications/focused-queue/{startTime}.jsonl`
- 退出焦点时,触发 **AI 摘要**:调用 Sprint 3.5 的 `spawnSubAgent('focus-summary-curator')`,产出按源分组、突出 action items 的精炼摘要
- 摘要本身展示为一条 `system.suggestion` 通知,可点击展开

通知偏好学习是**双向**的:
- **自动**:用户连续 3 次 dismiss 同 `type` + `source` 通知(60 分钟窗口),系统弹出 `system.suggestion`:"要静音此类通知吗?"
- **被动**:每次 dismiss / click / quick-action 写入滑动窗口统计(SQLite),由 Sprint 3.2 的 `MemoryExtractor` 在每次 checkpoint 时聚合:若 7 天内 dismissalRate > 80% 且 sampleSize > 5,提取为 `user_preference` 记忆条目"用户对 X 类通知不感兴趣"

被提取的记忆条目可被用户手动 `lock`(对应 Sprint 3.2 的锁定机制),防止之后被压缩或 AI 误判。

#### 验收标准

1. When user invokes `/focus on` via command palette, the system shall set current `AiMode.focused = true` and emit `aiMode.focused-changed` event
2. When focus is on, notifications with priority < urgent shall be queued instead of shown
3. When focus is on and urgent notification arrives, the system shall show with reduced animation (no sound, no flashing)
4. When user invokes `/focus until 18:00`, the system shall auto-disable focus at specified time via scheduler
5. When focus mode ends, the system shall trigger summary generation via `spawnSubAgent('focus-summary-curator')` if queue length > 0
6. When summary is generated, it shall group by source and highlight items with detected action verbs (review, approve, reply, fix)
7. When user dismisses 3 notifications of same `(type, source)` within 60 minutes, the system shall create `system.suggestion` notification asking to mute
8. When user accepts mute suggestion, the system shall persist preference to `.sibylla/notifications/preferences.json` and apply within 100ms
9. When `MemoryExtractor` runs checkpoint, it shall aggregate notification stats and emit `user_preference` candidates with appropriate confidence
10. When user has scheduled focus hours configured (e.g. 9-12 daily), the system shall auto-enable

#### 技术规格

**与 AiMode 的整合:**

```typescript
// src/main/services/mode/types.ts (扩展现有 AiModeDefinition)
export interface ActiveAiModeState {
  conversationId: string
  aiModeId: AiModeId
  activatedAt: string
  activatedBy: 'user' | 'system' | 'auto-detect'
  focused?: boolean              // 新增:焦点叠加属性
  focusUntil?: string            // 新增:焦点自动解除时间
}
```

`AiModeRegistry` 新增方法 `setFocused(conversationId, focused, until?)`,触发后:
- 写入 `ActiveAiModeState`
- 发布 `aiMode.focused-changed` 事件
- 不影响 `systemPromptPrefix` / `outputConstraints`(焦点是通知层概念,不是 AI 行为)

**摘要 Sub-agent 定义:** `resources/prompts/agents/focus-summary-curator.md`(Sprint 3.5 资源目录)。允许工具:`reference_file`、`unified_search`(可选,用于扩充上下文)。`output_schema` 为按源分组的结构化 JSON,渲染为 Markdown。

**偏好学习的事件链:**

```
用户 dismiss 通知
    ↓
NotificationEngine.recordAction() → SQLite (notification_actions 表)
    ↓
窗口统计 → 触发 system.suggestion 通知(若达阈值)
    ↓
每次 MemoryExtractor checkpoint(Sprint 3.2)
    ↓
NotificationPreferenceExtractor(本 Sprint 提供给 CheckpointScheduler 的后处理扩展)
    ↓
从 notification_actions 表聚合统计数据,产出 ExtractionCandidate[]
    ↓
追加到 ExtractionReport.added,由 CheckpointScheduler 统一 applyExtractionReport()
    ↓
ExtractionCandidate { section: 'user_preference', confidence: 计算值, content: '...' }
    ↓
归入 MEMORY.md(参与 ContextEngine 上下文)
```

> **与 Sprint 3.2 的集成方式**:`MemoryExtractor` 本身不修改。扩展点在 `CheckpointScheduler.run()` 中,在 `extractor.extract()` 返回 `ExtractionReport` 后、`applyExtractionReport()` 之前,调用注册的后处理扩展器。`NotificationPreferenceExtractor` 实现接口 `ExtractionPostProcessor { process(report, context): ExtractionCandidate[] }`,由 `CheckpointScheduler` 在构造时注入。

#### 优先级

P0(焦点模式核心) + P1(偏好学习深度优化)

---

### 需求 5.3 - 团队成员存在感(Presence)

**用户故事:** 作为团队成员,我希望知道现在有谁在线、在编辑什么文件、最近改了什么,而不是要等 30 秒一次的 Git 同步才看到队友的工作。

#### 功能描述

Presence 是**软实时的状态信号**,与 Git 同步**完全分离**:

| 维度 | Git 同步(Sprint 2) | Presence(本 Sprint) |
|---|---|---|
| 内容 | 文件实际内容 | 状态信号(谁在线、查看哪个文件、是否编辑) |
| 频率 | 30 秒 | 心跳 5 秒,变化即时 |
| 通道 | Git push/pull(HTTPS) | WebSocket 或 SSE 长连接 |
| 持久化 | 完整 commit 历史 | 仅当前快照,不持久化 |
| 失败处理 | 离线缓冲,恢复后同步 | 离线即视为下线,无补偿 |

Presence 数据**不包含文件内容**,仅包含:`userId`、`displayName`、`avatar`、`status`(`online | idle | offline`)、`viewingFile?`(可选)、`isEditing`(布尔)、`lastActiveAt`。这与 CLAUDE.md 第二章"云端不存储用户文档"的红线兼容——Presence 服务只看到状态,不看到内容。

UI 集成两处:
1. **编辑器内**(Sprint 1 Tiptap):右上角显示当前同时查看本文件的成员头像组(`<PeerPresenceBadge />`)。**不显示光标位置**(因为没有内容同步,无法对齐光标坐标)
2. **团队面板**:独立侧边栏 `<TeamPanel />`,列出所有成员状态,点击成员的 `viewingFile` 可跳转打开

权限模型:
- `presence.viewMembers` 权限默认授予 workspace 所有成员(基于 Sprint 2 角色)
- Viewer 角色可见他人 Presence,但自己不广播 `viewingFile`(隐私保护)
- 用户可在设置中关闭"广播我的活动",此时其他成员看到自己始终为 `online` 但无 `viewingFile`

#### 验收标准

1. When user opens workspace, the system shall connect to presence service and broadcast `online` status within 3 seconds
2. When user views a file, the system shall update presence with `viewingFile` field; updates shall be debounced 500ms
3. When user types in editor, the system shall set `isEditing = true` for 10 seconds since last keystroke
4. When user is idle for 5 minutes (no input, no scroll), the system shall set status to `idle`
5. When app is closed or workspace switched, the system shall broadcast `offline` within 5 seconds (best-effort)
6. When network disconnects, presence service shall mark user as `offline` after 30 seconds without heartbeat
7. When team panel is opened, the system shall display current state per member with status icon and last activity time
8. When user has "broadcast activity" disabled, presence shall not include `viewingFile` field for that user
9. When Viewer role member tries to view presence, the system shall return list with `viewingFile` redacted for privacy
10. When more than 20 members are online, the system shall throttle UI updates to 1Hz to avoid render storm
11. When peer starts editing a file the user modified within last 7 days, the system shall emit `presence.user-editing` event consumed by notification rule `collab-peer-active`

#### 技术规格

**协议:** WebSocket(优先)或 SSE 降级。消息格式 JSON,包含 `type` (`heartbeat | state-change | bye`) 和 `payload`。

**主进程组件:**

```typescript
// src/main/services/presence/presence-client.ts
export class PresenceClient {
  // 与协作服务建立长连接,管理心跳与重连
  // 暴露:onPeerStateChange、broadcastSelf、disconnect
}

// src/main/services/presence/presence-store.ts
export class PresenceStore {
  // 内存中的 peer 状态映射,过期自动清理(LRU + TTL)
  // 通过 AppEventBus 发布 presence.* 事件
}
```

**事件:** 新增 `SibyllaEventType`(需注册到 Sprint 4 事件目录):
- `presence.user-online`
- `presence.user-offline`
- `presence.user-editing`
- `presence.user-viewing`

**与 Sprint 4 事件目录的协调:**
- Sprint 4 预留的 `collab.user-joined` → 由本 Sprint 的 `presence.user-online` 替代(语义更精确),删除原占位
- Sprint 4 预留的 `collab.conflict-detected` → 由需求 5.4 的 `git.conflict-detected` 替代(冲突来源是 Git 操作),删除原占位
- Sprint 4 预留的 `notification.created` → 本 Sprint 实际使用,保留不变

**降级:** Presence 服务不可用时,UI 显示"团队感知已离线"提示,本地编辑与同步不受影响(完全独立)。

#### 优先级

P1 - 应该完成(对单人使用场景非必需)

---

### 需求 5.4 - 协作冲突 AI 智能合并

**用户故事:** 作为用户,当我的修改与队友冲突时,我希望 AI 能给我一个合理的合并建议作为参考,而不是只能在"采用我的"和"采用对方的"之间二选一。

#### 功能描述

Sprint 2 已有 `ConflictResolver` UI,提供三个选项:采用我的、采用对方的、手动合并。本 Sprint **不替换**这个 UI,而是**新增第四个选项**:"AI 建议合并"。

工作流:
1. `SyncManager.pull()` 检测冲突,发出 `git.conflict-detected` 事件(新增,接入 Sprint 4 事件总线)
2. `ConflictResolver` 弹出时,后台并行调用 `MergeAssistant.propose(conflict)`,2 秒内返回建议
3. UI 在"手动合并"右侧增加"🤖 AI 建议合并"按钮(loading 状态时显示生成中)
4. 用户点击后,在右侧面板显示 AI 生成的合并版本 + **变更说明**(哪些来自我、哪些来自对方、哪些是 AI 整合的)
5. 用户可:**采用** / **编辑后采用** / **放弃**(回到原三选项)

AI 调用复用 Sprint 3.5 的 Sub-agent 系统,定义新 Sub-agent `merge-curator`:
- `allowed_tools`: `reference_file`(读上下文)、`unified_search`(查找相关历史决策)
- `inherit_memory: true`(需要团队约定与项目背景)
- `output_schema`: `{ mergedContent, attribution: { fromMine, fromTheirs, byAI }, rationale }`

冲突涉及的文件**不离开本地**——`merge-curator` 通过本地 LLM 调用(若启用)或加密传输到云端 AI 网关(继承 Sprint 3 的 API 调用路径)。**敏感文件白名单**(默认包含 `secrets/`、`personal/`、`.env*`)永不送入 AI 合并,直接降级到原三选项。

#### 验收标准

1. When `SyncManager` detects conflict, the system shall emit `git.conflict-detected` event with file path and 3-way diff
2. When `ConflictResolver` opens, the system shall trigger background `MergeAssistant.propose()` immediately
3. When `propose()` succeeds within 5 seconds, the UI shall enable "AI 建议合并" button
4. When `propose()` exceeds 5 seconds, the UI shall show "AI 建议生成中..." but allow user to choose other options without waiting
5. When `propose()` fails (LLM error, timeout), the UI shall log error and disable AI option (graceful degradation)
6. When user clicks AI suggestion, the system shall display merged content with attribution highlights (different colors for `fromMine`, `fromTheirs`, `byAI`)
7. When file matches sensitive whitelist, the system shall not invoke AI and disable AI option with tooltip "敏感文件不发送给 AI"
8. When user adopts AI merge, the system shall create commit with message `[user] AI 辅助合并 {file} (cherry-picked from 冲突 #N)` and append rationale to `.sibylla/sync/merge-history.jsonl`
9. When AI merge contains unresolved markers (`<<<<<<<`), the system shall reject and force user to manually clean up
10. When `merge-curator` references search results, the cited sources shall be included in rationale display

#### 技术规格

**新增模块:** `src/main/services/sync/merge-assistant.ts`,依赖注入 `SubAgentExecutor`(Sprint 3.5)、`UnifiedSearchEngine`(Sprint 4)、`ConfigManager`(获取敏感文件白名单)。

**与 SyncManager 的集成:** Sprint 2 的 `SyncManager.handleConflict()` 使用 `this.emit('conflicts', ...)` 的 EventEmitter 模式,未接入 Sprint 4 的 `AppEventBus`。本 Sprint 需在 `SyncManager` 构造函数中可选注入 `AppEventBus`,在冲突检测路径中追加:
```typescript
// SyncManager.handleConflict() 追加(不替换原有逻辑)
if (this.eventBus) {
  this.eventBus.emitEvent({
    type: 'git.conflict-detected',
    source: 'sync-manager',
    payload: { conflicts: pullResult.conflicts.map(c => ({
      filePath: c.filePath,
      localPreview: c.localContent?.slice(0, 500),
      remotePreview: c.remoteContent?.slice(0, 500),
      basePreview: c.baseContent?.slice(0, 500)
    }))}
  })
}
```
原有的 `this.emit('conflicts', ...)` 保留不变。

**ConflictResolver UI 改造:** 在 `<ConflictResolver />` 中追加 `<AIMergePanel />` 子组件,通过 IPC 通道 `sync:proposeAIMerge` 调用主进程。原"采用我的/对方的/手动合并"逻辑完全保留。

> **Sprint 2 `ConflictInfo` 接口扩展**:现有接口 `{ filePath, localContent, remoteContent, baseContent }` 缺少 `conflictId`。本 Sprint 新增 `conflictId: string`(由 SyncManager 在检测冲突时生成的 ULID)和可选 `traceId?: string`,供 AI 合并审计使用。扩展后原三选项逻辑不受影响。

**Trace 集成:** `merge-curator` 执行产生 Sub-agent Trace 子树(Sprint 3.5),通过 `parent_trace_id` 关联到主对话或 Sync 操作的 Trace。

#### 优先级

P0 - 必须完成

---

### 需求 5.5 - AI 主动建议引擎

**用户故事:** 作为用户,我希望 AI 在合适时机主动建议(比如我写了一段需求后,提示"要不要我帮你拆解任务?"),但不要打扰我的写作流。

#### 功能描述

`ProactiveEngine` 是**触发器**集合,定期评估"是否到了开口的时机"。**关键:不调用 LLM 做评估**——评估本身使用启发式规则,只有触发后才调用 LLM 生成具体建议。这避免高频 LLM 调用拖慢编辑器。

**触发器架构:**

```
编辑器事件(键盘/选区/打开文件)
    ↓
ProactiveEngine.evaluate(context)
    ↓
对每个 Trigger:
    ├─ 是否在冷却期? (跳过)
    ├─ 是否满足启发式条件? (基于规则,纯函数)
    └─ shouldSuggest = true → 生成 SuggestionDraft
    ↓
canInterrupt(context) 检查:
    ├─ 用户输入速度 > 50字/分钟? (深度专注,不打扰)
    ├─ 距离上次建议 < 5 分钟? (不打扰)
    ├─ 焦点模式? (不打扰,除非建议优先级 = urgent)
    └─ AiMode 是 Plan/Analyze 且任务进行中? (不打扰)
    ↓
通过 → 调用 spawnSubAgent('suggestion-curator')
    ↓
Sub-agent 用上下文生成具体建议文案与执行 Action
    ↓
SuggestionToast 弹出
```

**内置触发器(本 Sprint 4 个):**

| 触发器 ID | 启发式条件 | 建议内容 |
|---|---|---|
| `task-decomposition` | 当前文档包含目标关键词("目标"/"要做"/"需求")但无清单格式且文档长度 > 200 字 | "要不要我帮你拆解任务?"(执行 → 调用 task-extractor Sub-agent,Sprint 6 衔接) |
| `related-content` | 用户开始写新文档(< 100 字),通过 `UnifiedSearchEngine.search(filename)` 找到 ≥ 3 个相关历史文档 | "你之前写过 X 篇相关文档,要不要参考?" |
| `memory-promote` | 当前对话包含项目约定模式("我们决定"/"以后都用"/"团队规则"),且非记忆系统已知 | "这看起来像个团队约定,记到 MEMORY 里?" |
| `review-stale` | 打开了 `updatedAt > 30 天` 的文档,且文档涉及 Plan/Spec | "这份文档已经 30 天没更新,要不要审查一下?" |

**冷却与频次控制:**
- 每个触发器独立冷却期(默认 30 分钟)
- 全局:5 分钟内最多 1 条建议
- 用户连续 dismiss 同 `triggerId` 3 次 → 该触发器冷却期翻倍(最长 24 小时)
- 用户接受同 `triggerId` 3 次 → 冷却期减半(最短 5 分钟)
- 冷却调整通过 Sprint 3.2 记忆系统持久化

**与 Trace 的集成:** 每次评估产生 `proactive.evaluate` span(`kind: 'system'`),记录哪些触发器被评估、为何跳过、最终是否弹出。这是后续优化触发器精度的数据基础。

#### 验收标准

1. When user pauses typing for 30 seconds and current context matches any trigger, the system shall evaluate triggers within 100ms
2. When trigger evaluation does not require LLM, the entire evaluation shall complete in < 50ms (95p)
3. When trigger fires and `canInterrupt()` returns true, the system shall invoke `spawnSubAgent('suggestion-curator')` with timeout 3 seconds
4. When sub-agent fails or times out, the system shall silently drop the suggestion (no error toast)
5. When user is in `AiMode = plan` and a task is in progress (`progress.task-running` event seen recently), suggestions shall be suppressed
6. When user is in focus mode, only `urgent` suggestions shall pass `canInterrupt()` (built-in triggers are all `normal` priority)
7. When user dismisses 3 suggestions of same trigger ID within 24 hours, the system shall double cooldown for that trigger
8. When user accepts a suggestion, the system shall execute action via existing IPC handlers (no new "accept-suggestion" channel needed)
9. When a suggestion is shown, all events shall be traced as `proactive.suggestion-shown` span with attributes `{triggerId, accepted/dismissed/timeout, dwellMs}`
10. When user explicitly disables proactive engine in settings, no triggers shall fire and no LLM calls related to suggestions shall occur

#### 技术规格

**目录:** `src/main/services/proactive-engine/`

```
proactive-engine/
├── index.ts                      # ProactiveEngine 主类
├── types.ts                      # Trigger / SuggestionDraft / EditorSnapshot
├── trigger-registry.ts           # 触发器注册与冷却管理
├── interrupt-policy.ts           # canInterrupt 策略集中点
└── triggers/
    ├── task-decomposition.ts
    ├── related-content.ts
    ├── memory-promote.ts
    └── review-stale.ts
```

**EditorSnapshot 数据结构(渲染进程定时上报):**

```typescript
interface EditorSnapshot {
  filePath: string
  contentSummary: { length: number; recentText: string }  // 仅最近 500 字符
  typingVelocity: number                  // 滑动窗口估算
  continuousTypingMinutes: number
  cursorPosition: number
  selectionLength: number
  lastInteractionAt: number
  currentAiMode: AiModeId
  isFocused: boolean
}
```

> **与 Sprint 1 编辑器的集成**:`EditorSnapshot` 由渲染进程的 `useEditorSnapshotCollector` hook 采集,挂载于 `<Editor />` 组件内部。hook 每秒采样一次编辑器状态(利用 Tiptap 的 `editor.on('update')` 和 `editor.on('selectionUpdate')` 事件),计算 `typingVelocity` 等指标,通过 2 秒防抖的 `proactive:editorSnapshot` IPC 推送到主进程。不修改 Tiptap 编辑器扩展。

**与 Sub-agent 的集成:** `suggestion-curator` 定义在 `resources/prompts/agents/suggestion-curator.md`(Sprint 3.5 资源)。`output_schema` 为:

```typescript
{
  title: string
  body: string                    // 1-2 句简明描述
  acceptAction: { command: string; args: Record<string, unknown> }    // 复用命令面板已有命令
  declineAction?: 'dismiss' | 'snooze-1h' | 'never'
}
```

**配置项:**

```typescript
interface ProactiveConfig {
  enabled: boolean                              // 默认 true
  globalCooldownMinutes: number                 // 默认 5
  triggerOverrides: Record<TriggerId, {
    enabled: boolean
    cooldownMinutes: number
  }>
  interruptPolicy: {
    suppressDuringTaskExecution: boolean        // 默认 true
    suppressInDeepFocus: boolean                // 默认 true(>5min 连续输入)
    suppressDuringFocusMode: boolean            // 默认 true(除 urgent 外)
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 5.6 - 建议展现 UI

**用户故事:** 作为用户,我希望 AI 建议以非侵入式方式展现,不破坏我的编辑流。

#### 功能描述

建议以**右下角 toast** 形式展现,设计原则:

- **进入** 300ms 滑入动画,**离开** 200ms 淡出
- **15 秒不交互** → 自动淡出(用户悬停时暂停计时)
- **同时只显示 1 条**:多条建议时排队,前一条关闭后再显示下一条
- **单键关闭**:Esc 关闭当前建议(全局快捷键)
- **可展开**:默认折叠态显示标题+1 行预览,点击展开看完整 body 与操作按钮
- **位置稳定**:不与 Sprint 3.3 性能告警 toast 重叠(后者位于左下角)
- **声音**:默认无声;`urgent` 优先级播放轻量提示音(可在设置中关闭)

UI 组件 `<SuggestionToast />` 完全独立于通知中心(虽然内部数据流可视为通知的一种特殊展现),避免与"通知中心入口"在视觉上混淆。建议**不进入**通知中心列表,即查即决。

#### 验收标准

1. When suggestion is dispatched, the system shall render toast in bottom-right corner within 100ms
2. When toast appears, the entry animation shall complete within 300ms
3. When user does not interact for 15 seconds, the toast shall auto-fade out
4. When user hovers, the auto-fade timer shall pause; on mouse leave, timer shall reset to 5 seconds
5. When multiple suggestions are pending, only one shall be visible at a time; subsequent suggestions shall queue
6. When user presses Esc while toast is visible, the toast shall close immediately and emit `dismiss` event
7. When user clicks "展开", the toast shall expand to show full body and inline actions
8. When user clicks accept action button, the system shall execute via command palette dispatch (Sprint 3.4)
9. When toast is dismissed, the system shall record `proactive.suggestion-dismissed` Trace event
10. When user is in fullscreen / presentation mode (Electron API detected), no toast shall show until exit

#### UI 视觉规格

```
                                         ┌──────────────────────────┐
                                         │ 💡 想要拆解任务吗?       │
                                         │ 看起来你写了一个目标,   │
                                         │ 我可以拆成具体任务。     │
                                         │                          │
                                         │ [ 拆解 ]  [ 稍后 ]   [×] │
                                         └──────────────────────────┘
                                                                 (右下角)
```

**与现有组件的关系:**
- 不复用 Sprint 3.3 的 `<PerformanceAlertToast />`(语义不同)
- 不复用 Sprint 3.4 的 `<ExportDialog />`、`<CommandPalette />` 等模态组件
- 与 Sprint 3.6 的 Onboarding tour 通过全局 `OverlayManager`(本 Sprint 新增的轻量协调器)排他显示

#### 优先级

P0 - 必须完成

---

### 需求 5.7 - 协作上下文层接入 ContextEngine v2

**用户故事:** 作为用户,我问 AI"刚才 Alice 改了什么?"或"团队对认证方案是怎么决定的?"时,AI 应该能识别出我在问协作场景,并自动包含相关 Presence 与最近团队活动作为上下文。

#### 功能描述

Sprint 4 的 `ContextEngine v2` 已有 6 层(L1-L6)。本 Sprint **新增 L7: collab**(协作上下文层),作为 `assembleContextV2()` 的可选层:

```
v2 上下文层(本 Sprint 后):
┌───────────────────────────────────────┐
│ L1: always       (CLAUDE.md, 当前文件) │ 30%
│ L2: ai-mode      (Sprint 3.4)          │ 10%
│ L3: memory       (Sprint 3.2)          │ 15%
│ L4: skill/agent  (Sprint 3.5)          │ 15%
│ L5: cross-source (Sprint 4)            │ 15%  ← 从 20% 降至 15%
│ L6: manual       (@文件)               │ 10%
│ L7: collab       (本 Sprint)           │  5%  ← 新增
└───────────────────────────────────────┘
注:L5(cross-source)权重从 Sprint 4 的 20% 降至 15%,为 L7 腾出 5% 空间。总权重 100%。
```

L7 由 `CollabContextProvider` 提供,内容:
- 当前在线团队成员列表(姓名 + 角色)
- 最近 30 分钟内的团队活动事件(从 `AppEventBus` 历史读取):谁修改了哪个文件、谁解决了哪个冲突
- 用户消息中提到的成员名(如"Alice")的最近活动

**仅在以下条件触发** L7 注入(避免无意义膨胀):
- 用户消息包含协作语义关键词("队友"/"团队"/"刚才"/"@xxx"/"协作")
- 或用户消息引用了某个成员名(与 workspace 成员列表匹配)
- 或当前对话上下文包含 `collab.conflict` 类型通知的引用

L7 的内容**不包含**任何 Presence 之外的私有数据(不读其他成员的 personal/ 目录),严格遵守 Sprint 1 的个人空间隔离规则。

#### 验收标准

1. When user message contains collaboration keywords or member name references, `ContextEngine.assembleContextV2()` shall invoke `CollabContextProvider.collect()`
2. When `collect()` is called, it shall return online members + activity events within last 30 minutes within 200ms
3. When L7 budget is exceeded (5% of total), the system shall truncate by activity recency (oldest first)
4. When no collaboration signal detected in user message, L7 shall be skipped (zero overhead)
5. When `PresenceClient` is offline, `CollabContextProvider` shall return empty result and not fail entire assembly
6. When activity events reference files in another member's personal/ folder, the system shall redact path to `[personal-redacted]`
7. When user explicitly references a member name not in current workspace, the system shall include this in `unresolvedReferences` field for AI to acknowledge gracefully
8. When L7 is included, AI response citation format shall use `[collab:userName:timestamp]` per Sprint 4 navigation conventions

#### 技术规格

**新增模块:** `src/main/services/context-engine/collab-context-provider.ts`

依赖注入:`PresenceStore`、`AppEventBus`(用于读取最近事件历史)、`WorkspaceMemberDirectory`(Sprint 2)、`PrivacyFilter`(本 Sprint 新增的薄封装,确保 personal/ 路径被过滤)。

**事件历史读取:** 利用 Sprint 4 的 `EventLogStore`(JSONL 日志),通过 `query({ type: ['file.updated', 'git.conflict-detected', 'presence.user-editing'], since: now-30min })` 高效检索。

**关键词检测:** 简单正则 + 成员名匹配,**不调用 LLM**(性能要求)。

**与现有 v2 流程的集成:** 在 `assembleContextV2()` 中新增一段逻辑:

```typescript
// 伪代码,放在 L6 之后
if (this.collabContextProvider) {
  const shouldInject = this.collabContextProvider.shouldInject(request.userMessage)
  if (shouldInject) {
    const collab = await this.collabContextProvider.collect(request, budgetForL7)
    if (collab.layers.length > 0) layers.push(...collab.layers)
  }
}
```

不修改 `assembleContextV2()` 的现有 L1-L6 逻辑。

#### 优先级

P1 - 应该完成

---

## 三、非功能需求

### 3.1 性能要求

| 操作 | 目标(P95) |
|---|---|
| 通知创建到展现 | < 500ms |
| 通知中心打开 | < 300ms |
| 焦点模式切换 | < 100ms |
| Presence 状态广播 | < 1 秒 |
| Presence 心跳延迟 | < 5 秒 |
| 主动建议触发评估(无 LLM) | < 50ms |
| 主动建议端到端(含 Sub-agent) | < 3 秒 |
| 协作冲突 AI 合并建议 | < 5 秒 |
| 协作上下文层(L7)收集 | < 200ms |
| 建议 toast 弹出动画 | 300ms |

### 3.2 可靠性要求

- 通知服务挂掉时,事件可从 Sprint 4 的 `EventLogStore` 重放,不丢失
- Presence 服务断线不影响本地编辑与 Git 同步
- AI 建议失败静默(不打扰用户),错误进入 Trace 不进入 toast
- 协作冲突 AI 合并失败优雅降级到 Sprint 2 原三选项
- 通知偏好持久化失败不阻塞通知展现(降级为内存态)

### 3.3 隐私与安全

- Presence 数据传输全程 TLS
- Presence 服务**不接触文件内容**,仅状态信号
- AI 合并涉及的文件遵守敏感白名单(默认 `secrets/`、`personal/`、`.env*`)
- 协作上下文层(L7)严格过滤 personal/ 路径
- 通知偏好的 SQLite 存储遵守 workspace 个人空间规则
- 焦点摘要中的 MCP 同步内容遵循 Sprint 3.6 的脱敏规则

### 3.4 兼容性

- 通知中心数据格式 `notification.json` 版本化(`schemaVersion: 1`)
- 旧版本会话恢复时,无 `presence` 字段视为离线状态(默认值)
- 关闭主动建议引擎后,系统行为与 Sprint 4 完全一致

---

## 四、技术约束

### 4.1 架构约束

- 通知中心位于主进程 `src/main/services/notifications/`
- AI 主动建议引擎位于主进程 `src/main/services/proactive-engine/`
- Presence 客户端位于主进程,UI 通过 IPC 订阅状态变化
- **不引入新的事件总线**——所有事件流复用 Sprint 4 的 `AppEventBus.subscribe()`
- **不引入新的 AI 调用路径**——AI 建议与冲突合并均通过 Sprint 3.5 的 `SubAgentExecutor`
- **不引入 CRDT 库**——协作通过 Git(Sprint 2) + Presence 信号实现

### 4.2 与现有模块的集成

| 现有模块 | 改造方式 |
|---|---|
| Sprint 4 `AppEventBus` | **不修改核心**,仅消费(`subscribe()` / `subscribeAny()`)。**事件目录追加**:注册 `git.conflict-detected`(替代预留的 `collab.conflict-detected`)、`presence.user-online`(替代预留的 `collab.user-joined`)、`presence.user-offline`、`presence.user-editing`、`presence.user-viewing` 五个新事件类型到 `SibyllaEventType` 联合类型 |
| Sprint 4 `UnifiedSearchEngine` | **不修改**,Proactive Engine 与 Collab Context 调用其 `search()` |
| Sprint 4 `ContextEngine` | **追加 L7 层**:新增 `setCollabContextProvider()` 注入,`assembleContextV2()` 中追加 L7 收集逻辑;L5 权重从 20% 调整为 15% 为 L7 腾出空间;v1/v2 现有签名不变 |
| Sprint 3.6 `McpSyncManager` | **不修改**,通知规则订阅其 `mcp.sync-completed` 事件 |
| Sprint 3.5 `SubAgentExecutor` | **不修改**,本 Sprint 新增 2 个 Sub-agent prompt 文件(`suggestion-curator.md`、`focus-summary-curator.md`、`merge-curator.md`)与 v1.1 模板分批 |
| Sprint 3.5 `SlashCommandRegistry` | **追加** 3 个 Slash Command:`/focus on`、`/focus off`、`/focus until` |
| Sprint 3.4 `AiModeRegistry` | **扩展 ActiveAiModeState**:新增 `focused?: boolean` + `focusUntil?: string`;新增 `setFocused()` 方法;现有 5 个 builtin AiMode 不修改 |
| Sprint 3.4 `CommandRegistry` | 新增 4 个命令:`focus.toggle`、`notifications.openCenter`、`team.openPanel`、`suggestions.muteCurrentTrigger` |
| Sprint 3.3 `Tracer` | **不修改**,所有新事件通过 `withSpan()` 接入 |
| Sprint 3.3 `AppEventBus`(具名方法) | **不修改**,本 Sprint 仅使用通用 `subscribe()` |
| Sprint 3.2 `MemoryExtractor` | **不修改 `MemoryExtractor` 本身**。新增 `ExtractionPostProcessor` 接口和 `NotificationPreferenceExtractor` 实现,注册到 `CheckpointScheduler` 的后处理扩展点(在 `extract()` 之后、`applyExtractionReport()` 之前调用) |
| Sprint 2 `SyncManager` | **追加事件桥接**:构造函数可选注入 `AppEventBus`,在 `handleConflict()` 中追加 `git.conflict-detected` 事件发布;原 `this.emit()` 保留。`ConflictResolver` UI 追加 AI 选项;`ConflictInfo` 接口扩展 `conflictId` 字段 |
| Sprint 2 `GitAbstraction` | **不修改** |
| Sprint 1 Tiptap 编辑器 | **追加** `<PeerPresenceBadge />`(不引入新扩展,作为编辑器外围组件);追加 `useEditorSnapshotCollector` hook 挂载于 `<Editor />` 内,通过 `proactive:editorSnapshot` IPC 推送给 Proactive Engine |

### 4.3 与 CLAUDE.md 的一致性

- **文件即真相**:Presence 是状态信号不是真相;真相仍在 Git
- **AI 建议,人类决策**:所有 AI 建议(主动建议、合并建议、静音建议)都需用户确认
- **本地优先**:Proactive Engine 评估在本地;LLM 调用通过现有 AI 网关
- **Git 不可见**:UI 用"团队成员"、"协作冲突"等术语,不出现 `branch`/`merge` 等
- **个人空间隔离**:Presence 不暴露 personal/ 内容;L7 协作上下文严格过滤
- **可观测**:所有 Sprint 5 行为(通知决策、建议触发、合并建议生成)进 Trace
- **本地数据安全**:通知偏好、Presence 缓存均在本地 SQLite,加密随用户密码

### 4.4 未来扩展预留

- 通知规则注册机制对未来 Sprint 7+ 的工作流自动化开放
- Sub-agent 模板分批策略与 Sprint 3.6 一致(v1 内置 + 后续社区扩展)
- L7 协作上下文层格式版本化,便于未来增加 AI 对话协作摘要

---

## 五、目录结构

```
src/main/services/
├── notifications/                       # 新增
│   ├── notification-engine.ts
│   ├── notification-store.ts            # SQLite 存储
│   ├── notification-rules.ts            # 内置 8 类规则
│   ├── preference-learner.ts            # 滑动窗口统计与建议触发
│   ├── notification-preference-extractor.ts  # 注入 MemoryExtractor
│   └── types.ts
├── proactive-engine/                    # 新增
│   ├── index.ts
│   ├── trigger-registry.ts
│   ├── interrupt-policy.ts
│   ├── editor-snapshot-collector.ts     # 接收 IPC 推送
│   ├── triggers/
│   │   ├── task-decomposition.ts
│   │   ├── related-content.ts
│   │   ├── memory-promote.ts
│   │   └── review-stale.ts
│   └── types.ts
├── presence/                            # 新增
│   ├── presence-client.ts               # WebSocket / SSE
│   ├── presence-store.ts
│   ├── privacy-filter.ts
│   └── types.ts
├── sync/                                # Sprint 4 已有,扩展
│   └── merge-assistant.ts               # 新增
├── context-engine/                      # Sprint 4 已有,扩展
│   └── collab-context-provider.ts       # 新增 L7 提供方
└── mode/                                # Sprint 3.4 已有,扩展
    └── focus-mode-controller.ts         # 焦点模式叠加属性管理

src/main/ipc/handlers/
├── notification.ts                      # 新增
├── proactive-engine.ts                  # 新增
├── presence.ts                          # 新增
└── focus-mode.ts                        # 新增

src/renderer/store/
├── notificationStore.ts                 # 新增 Zustand store
├── presenceStore.ts                     # 新增
└── proactiveStore.ts                    # 新增

src/renderer/components/
├── notifications/                       # 新增
│   ├── NotificationCenter.tsx           # 主面板
│   ├── NotificationGroup.tsx
│   ├── NotificationItem.tsx
│   └── EmptyState.tsx
├── proactive/                           # 新增
│   ├── SuggestionToast.tsx
│   ├── SuggestionQueue.tsx
│   ├── OverlayManager.tsx               # 与 Sprint 3.6 onboarding tour 协调
│   └── useEditorSnapshotCollector.ts    # 新增:EditorSnapshot 采集 hook
├── presence/                            # 新增
│   ├── PeerPresenceBadge.tsx            # 编辑器右上角
│   ├── TeamPanel.tsx                    # 团队成员侧边栏
│   └── PeerStatusIcon.tsx
├── focus/                               # 新增
│   ├── FocusModeIndicator.tsx           # AiMode 切换器旁的焦点叠加
│   └── FocusSummaryCard.tsx
└── sync/                                # Sprint 2 已有,扩展
    └── AIMergePanel.tsx                 # 新增,接入 ConflictResolver

resources/prompts/agents/                # Sprint 3.5 资源,追加
├── suggestion-curator.md                # 新增
├── focus-summary-curator.md             # 新增
└── merge-curator.md                     # 新增

# Workspace 运行时
{workspace}/.sibylla/
├── notifications/
│   ├── store.db                         # SQLite
│   ├── preferences.json
│   ├── focused-queue/
│   │   └── {startTime}.jsonl
│   └── archive/
│       └── {YYYY-MM}.jsonl
└── sync/
    └── merge-history.jsonl              # AI 合并审计
```

---

## 六、IPC 接口清单

```typescript
// 通知
NOTIFICATION_LIST: 'notification:list'
NOTIFICATION_MARK_READ: 'notification:markRead'
NOTIFICATION_DISMISS: 'notification:dismiss'
NOTIFICATION_NAVIGATE: 'notification:navigate'
NOTIFICATION_GET_PREFS: 'notification:getPreferences'
NOTIFICATION_UPDATE_PREFS: 'notification:updatePreferences'

// Proactive Engine
PROACTIVE_EDITOR_SNAPSHOT: 'proactive:editorSnapshot'         // R→M
PROACTIVE_GET_CONFIG: 'proactive:getConfig'
PROACTIVE_UPDATE_CONFIG: 'proactive:updateConfig'
PROACTIVE_DISMISS_SUGGESTION: 'proactive:dismissSuggestion'
PROACTIVE_ACCEPT_SUGGESTION: 'proactive:acceptSuggestion'

// Presence
PRESENCE_GET_PEERS: 'presence:getPeers'
PRESENCE_BROADCAST_VIEW: 'presence:broadcastView'              // R→M
PRESENCE_TOGGLE_BROADCAST: 'presence:toggleBroadcast'

// Focus Mode
FOCUS_TOGGLE: 'focus:toggle'
FOCUS_SET_UNTIL: 'focus:setUntil'
FOCUS_GET_STATE: 'focus:getState'
FOCUS_GET_QUEUE_PREVIEW: 'focus:getQueuePreview'

// AI Merge
SYNC_PROPOSE_AI_MERGE: 'sync:proposeAIMerge'
SYNC_ADOPT_AI_MERGE: 'sync:adoptAIMerge'

// Push events (M→R)
NOTIFICATION_CREATED: 'notification:created'
NOTIFICATION_UPDATED: 'notification:updated'
PROACTIVE_SUGGESTION_SHOWN: 'proactive:suggestionShown'
PRESENCE_PEERS_UPDATED: 'presence:peersUpdated'
FOCUS_MODE_CHANGED: 'focus:modeChanged'
FOCUS_SUMMARY_READY: 'focus:summaryReady'
```

所有通道注册到 `IPC_CHANNELS` 与 `IPCChannelMap`(Sprint 3.4 约定),Preload 暴露在 `window.electronAPI.notifications`、`window.electronAPI.proactive` 等命名空间。

---

## 七、验收检查清单

### 通知中心
- [ ] 8 类内置规则全部生效
- [ ] 通知按优先级排序与去重(60 分钟窗口)
- [ ] 同 `groupKey` 超过 5 条自动折叠分组
- [ ] 7 天未读自动归档到 JSONL
- [ ] 点击通知正确路由到目标(file/memory/mcp/trace)
- [ ] 规则异常隔离(单条不影响其他)
- [ ] 通知中心 SQLite 表迁移与版本化生效

### 焦点模式与偏好学习
- [ ] `/focus on/off/until` 三个 Slash Command 注册成功
- [ ] AiMode 叠加 `focused` 属性,所有 5 个内置 AiMode 兼容
- [ ] 焦点模式下非 urgent 通知进入队列
- [ ] 退出焦点触发 `focus-summary-curator` Sub-agent 摘要
- [ ] 摘要按源分组,识别 action items
- [ ] 滑动窗口统计 dismissalRate 准确
- [ ] 3 次连续 dismiss 触发静音建议
- [ ] `NotificationPreferenceExtractor` 在 MemoryExtractor checkpoint 中被调用
- [ ] 提取的偏好以 `user_preference` 类型进入 MEMORY.md

### Presence
- [ ] WebSocket 连接建立 < 3 秒
- [ ] 心跳 5 秒,状态变更即时广播
- [ ] 5 分钟空闲转 `idle`
- [ ] 网络断开 30 秒后标记 offline
- [ ] `PeerPresenceBadge` 显示在编辑器右上角(不显示光标)
- [ ] `TeamPanel` 列出所有成员状态
- [ ] Viewer 角色看不到他人 `viewingFile`(隐私)
- [ ] 用户可关闭"广播我的活动"
- [ ] Presence 服务离线时编辑器与同步不受影响
- [ ] `presence.user-editing` 事件触发 `collab-peer-active` 通知

### AI 主动建议
- [ ] 4 个内置触发器全部生效
- [ ] 评估纯启发式,< 50ms(P95)
- [ ] `canInterrupt` 正确抑制(深度专注、焦点、任务执行中)
- [ ] 触发到 toast 端到端 < 3 秒
- [ ] 接受/忽略行为通过冷却调整
- [ ] 冷却调整持久化到记忆系统
- [ ] 失败静默(不打扰用户)
- [ ] 全部行为进 Trace(`proactive.*` span)
- [ ] 设置中可全局禁用

### 建议 UI
- [ ] 右下角 toast 进入 300ms 动画
- [ ] 15 秒不交互自动淡出
- [ ] 悬停暂停计时
- [ ] Esc 全局快捷键关闭
- [ ] 多条建议排队,同时只显示 1 条
- [ ] 与 Sprint 3.3 性能告警 toast 不重叠
- [ ] 不进入通知中心列表
- [ ] 全屏/演示模式不显示

### 协作冲突 AI 合并
- [ ] `git.conflict-detected` 事件正确发出
- [ ] `MergeAssistant.propose()` 在 ConflictResolver 打开时并行触发
- [ ] AI 选项作为第四按钮接入(原三选项保留)
- [ ] 5 秒未返回不阻塞用户其他选择
- [ ] 失败优雅降级
- [ ] 敏感文件白名单生效(secrets/、personal/、.env*)
- [ ] AI 合并产出包含 attribution 元数据
- [ ] 合并审计日志写入 `merge-history.jsonl`
- [ ] `merge-curator` Trace 子树通过 `parent_trace_id` 关联

### 协作上下文层(L7)
- [ ] 关键词与成员名检测纯本地(无 LLM)
- [ ] L7 budget 5% 严格执行
- [ ] L7 失败不影响 L1-L6(graceful degradation)
- [ ] personal/ 路径自动 redact
- [ ] 集成到 ContextEngine v2 不破坏现有签名

### 集成验证
- [ ] 与 Sprint 4 `AppEventBus` 通用接口对接(subscribe/emitEvent)
- [ ] `git.conflict-detected` 和 `presence.*` 事件正确注册到 `SibyllaEventType` 目录(替换 Sprint 4 的 `collab.*` 占位)
- [ ] 与 Sprint 4 `UnifiedSearchEngine` 集成(related-content 触发器)
- [ ] 与 Sprint 4 `ContextEngine v2` 集成(L7 追加 + L5 权重调整 20%→15%)
- [ ] 与 Sprint 3.6 `McpSyncManager` 事件对接
- [ ] 与 Sprint 3.5 `SubAgentExecutor` 集成(3 个 Sub-agent prompt)
- [ ] 与 Sprint 3.5 `SlashCommandRegistry` 集成(/focus 命令)
- [ ] 与 Sprint 3.4 `AiModeRegistry` 焦点叠加属性
- [ ] 与 Sprint 3.3 `Tracer` 集成(所有新行为进 Trace)
- [ ] `NotificationPreferenceExtractor` 作为 `ExtractionPostProcessor` 在 `CheckpointScheduler` 中被正确调用
- [ ] `SyncManager` 可选注入 `AppEventBus` 并正确发布 `git.conflict-detected`
- [ ] `useEditorSnapshotCollector` hook 挂载于编辑器并正确推送 snapshot
- [ ] `ConflictInfo` 接口扩展 `conflictId` 字段,AI 合并审计日志关联正确
- [ ] 与 Sprint 2 `SyncManager` ConflictResolver 集成
- [ ] 与 Sprint 1 Tiptap 编辑器集成(PeerPresenceBadge + EditorSnapshot)

### 性能
- [ ] 通知创建展现 < 500ms
- [ ] Presence 心跳 < 5 秒
- [ ] 主动建议评估 < 50ms
- [ ] AI 合并 < 5 秒
- [ ] L7 收集 < 200ms

### 隐私
- [ ] Presence 不传输内容
- [ ] L7 严格过滤 personal/
- [ ] 通知偏好仅本地
- [ ] 焦点摘要遵守 MCP 脱敏规则

---

## 八、风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 通知频率过高变成打扰源 | 高 | 高 | 多层过滤(优先级/去重/聚合/偏好学习);默认仅 urgent + high 弹 toast,其余仅入中心 |
| 主动建议触发不精准让用户烦躁 | 高 | 高 | 启发式 + 冷却 + 用户反馈学习;3 次 dismiss 自动延长冷却;一键禁用整个引擎 |
| Presence 服务可用性影响主流程 | 中 | 中 | Presence 完全独立于 Git 同步,服务挂掉只影响团队感知 UI |
| AI 合并建议质量不稳定 | 中 | 高 | 仅作为第四选项,Sprint 2 原三选项保留;敏感文件白名单 |
| 协作上下文层(L7)拖慢上下文组装 | 低 | 中 | 严格 200ms 超时;失败 graceful;预算 5% 严格 |
| Sub-agent 调用费用累积 | 中 | 中 | `suggestion-curator` 默认 Haiku 级别;失败静默不重试 |
| Presence WebSocket 长连接成本 | 中 | 低 | 多用户共享单连接;心跳 5 秒非 1 秒;支持 SSE 降级 |
| 焦点模式被遗忘导致漏关键通知 | 中 | 中 | `/focus until` 自动解除;通知中心仍保留所有未展示通知 |
| Sprint 4 事件总线消息洪流 | 低 | 中 | 通知规则订阅前 condition 过滤,避免无效构建 |
| 用户在新设备无 MEMORY.md 偏好 | 低 | 低 | 偏好通过 Sprint 4 加密同步选项可选携带 |

---

## 九、参考资料

- [CLAUDE.md](../../../CLAUDE.md) - 项目宪法
- [`sprint2-git-sync.md`](../phase1/sprint2-git-sync.md) - SyncManager / ConflictResolver
- [`sprint3.2-memory.md`](../phase1/sprint3.2-memory.md) - MemoryExtractor 与扩展提取器机制
- [`sprint3.3-trace.md`](../phase1/sprint3.3-trace.md) - AppEventBus 具名方法 / Tracer
- [`sprint3.4-mode.md`](../phase1/sprint3.4-mode.md) - AiMode / 命令面板
- [`sprint3.5-ai_ablities.md`](../phase1/sprint3.5-ai_ablities.md) - SubAgentExecutor / SlashCommand / 资源目录
- [`sprint3.6-MCP.md`](../phase1/sprint3.6-MCP.md) - MCP 同步事件源
- [`sprint4-semantic-search.md`](./sprint4-semantic-search.md) - AppEventBus 通用接口 / ContextEngine v2 / UnifiedSearchEngine

---

## 十、交付物清单

### 代码
- 主进程:`notifications/`(6 文件)、`proactive-engine/`(4 + 4 触发器)、`presence/`(4 文件)、`sync/merge-assistant.ts`、`context-engine/collab-context-provider.ts`、`mode/focus-mode-controller.ts`
- IPC handlers:`notification.ts`、`proactive-engine.ts`、`presence.ts`、`focus-mode.ts`
- 渲染进程:Notification Center、Suggestion Toast、Team Panel、Peer Presence Badge、AI Merge Panel、Focus Mode Indicator
- 现有文件追加:`SyncManager` 事件发布、`ConflictResolver` AI 选项、`AiModeRegistry` 焦点叠加、`ContextEngine v2` L7 钩子、`MemoryExtractor` 偏好提取器注册、`SlashCommandRegistry` /focus 注册

### 资源
- `resources/prompts/agents/suggestion-curator.md`
- `resources/prompts/agents/focus-summary-curator.md`
- `resources/prompts/agents/merge-curator.md`

### 测试
- 通知规则单测(8 个规则 × 多场景)
- Proactive Engine 触发器单测
- canInterrupt 策略组合测试
- AI Merge 端到端测试(含敏感文件降级)
- L7 协作上下文层与 ContextEngine v2 集成测试
- Presence 重连恢复测试
- 焦点模式队列与摘要测试
- 与 Sprint 3.5 / Sprint 4 兼容性回归

### 文档
- 本 Sprint 文档
- `notification-rule-design.md` - 通知规则编写指南
- `proactive-trigger-guide.md` - 触发器扩展指南
- 更新 CLAUDE.md "通知与协作"章节(从"将实现"改为"已实现")

---

## 十一、冲突分析与架构调整记录

> 本节记录 Sprint 5 需求与前序 Sprint 规格之间的冲突分析结果,以及据此对本文档的调整。分析基于 Sprint 1/2/3.2-3.6/4 的需求规格交叉比对。

### 11.1 冲突总览

共识别 8 大类冲突,按影响程度排序:

| # | 冲突 | 影响范围 | 破坏风险 | 调整措施 |
|---|------|---------|---------|---------|
| 1 | ContextEngine v2 层预算溢出(L1-L6=100%,L7 需额外 5%) | 上下文组装 | 高 | L5 从 20% 降至 15%,为 L7 腾出空间;总权重 100% |
| 2 | Navigation 类型不一致(Sprint 4 的 kind 与 Sprint 5 需求不同) | 通知跳转 | 中 | 定义独立的 `NotificationNavigation` 类型,不复用 `UnifiedSearchResult.navigation` |
| 3 | 事件类型命名冲突(`git.conflict-detected` vs Sprint 4 预留的 `collab.conflict-detected`) | 事件路由 | 高 | 统一为 `git.conflict-detected`,替换 Sprint 4 占位;`presence.*` 注册到事件目录 |
| 4 | MemoryExtractor 扩展机制缺失(单体设计无插件点) | 偏好学习 | 中 | 新增 `ExtractionPostProcessor` 接口在 `CheckpointScheduler` 层注入,不修改 `MemoryExtractor` |
| 5 | SyncManager 事件桥接缺失(未接入 AppEventBus) | 冲突通知 | 高 | 可选注入 `AppEventBus`,追加 `emitEvent()` 调用,保留原 `this.emit()` |
| 6 | EditorSnapshot 采集机制缺失(Sprint 1 编辑器无上报) | 主动建议 | 中 | 新增 `useEditorSnapshotCollector` hook,利用 Tiptap 事件 2 秒防抖推送 |
| 7 | ConflictInfo 缺少 conflictId(AI 合并审计需要) | AI 合并 | 低 | 扩展 `ConflictInfo` 接口追加 `conflictId` 和 `traceId` |
| 8 | Sub-agent prompt 资源路径确认 | Sub-agent 调用 | 低 | 确认放入 `resources/prompts/agents/`,与 Sprint 3.5 注册机制一致 |

### 11.2 关键架构决策

1. **L7 权重从 L5 划拨**:不压缩 L1-L4 和 L6(这些是已有稳定层),仅从 L5(cross-source)调整。原因是 L5 的搜索结果天然可截断,且 L7 触发条件有语义门槛(需协作关键词),两者不会同时占满预算。
2. **独立 Navigation 类型**:通知的导航目标(Trace、MCP 记录)与搜索结果(Handbook)有本质差异,强行复用会增加类型复杂度。
3. **后处理扩展而非修改 MemoryExtractor**:`MemoryExtractor` 的 LLM 提取链是闭环的,在其内部插入逻辑会破坏增量提取的一致性。后处理模式在 `CheckpointScheduler` 层面追加,侵入最小。
4. **可选注入 AppEventBus 到 SyncManager**:`SyncManager` 可能在无 Sprint 4 基础设施的环境中运行(如降级模式),使用可选注入保证向后兼容。