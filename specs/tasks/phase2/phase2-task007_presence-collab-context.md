# 团队 Presence 信号层与协作上下文

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK007 |
| **任务标题** | 团队 Presence 信号层与协作上下文 |
| **所属阶段** | Phase 2 - 智能通知与协作增强 (Sprint 5) |
| **优先级** | P1 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

构建 Sprint 5 的团队协作感知基础设施——Presence 信号层与协作上下文层(L7)。Presence 通过轻量 WebSocket/SSE 长连接实现软实时状态广播（谁在线、查看哪个文件、是否在编辑），与 Git 同步完全分离；协作上下文层(L7) 作为 ContextEngine v2 的新增层，仅在用户消息包含协作语义关键词时注入在线成员与最近团队活动，让 AI 能回答"刚才 Alice 改了什么"等协作场景问题。

### 背景

Sprint 2 的 Git 同步以 30 秒为周期推送文件内容变更，但不传递状态信号。团队成员无法感知彼此的实时工作状态，存在协作盲区：

| 问题 | 现状 | 本任务解决 |
|------|------|-----------|
| 不知道队友在不在 | 看不到任何状态信号 | Presence 广播 online/idle/offline |
| 不知道队友在改什么 | 等 Git 同步才知道 | Presence 广播 viewingFile + isEditing |
| AI 不知道协作上下文 | AI 只能回答文件/记忆/搜索相关问题 | L7 注入协作活动，AI 可回答"谁改了什么" |
| 团队面板缺失 | 无团队状态可视化 | TeamPanel 展示所有成员状态 |

**核心设计约束：**

1. **不引入 CRDT**：Sibylla 的"文件即真相 + Git 同步"哲学（CLAUDE.md 第二章）不允许字符级实时协作。Presence 仅传递状态信号，不传递文件内容
2. **Presence 完全独立于 Git 同步**：断线不影响本地编辑与同步，离线即视为下线，无补偿
3. **Presence 不接触文件内容**：仅传递 userId、status、viewingFile、isEditing。与 CLAUDE.md "云端不存储用户文档"红线兼容
4. **L7 仅在协作语义触发时注入**：关键词检测纯本地正则 + 成员名匹配，不调用 LLM，零开销时无 L7
5. **L5 权重从 20% 降至 15%**：为 L7 腾出 5% 空间，不压缩 L1-L4 和 L6
6. **L7 失败不影响 L1-L6**：graceful degradation，CollabContextProvider 返回空结果时不阻断整个上下文组装

### 范围

**包含：**

- `PresenceClient` — WebSocket/SSE 长连接客户端（心跳、重连、状态广播）
- `PresenceStore` — 内存中的 peer 状态映射（LRU + TTL 自动过期）
- `PrivacyFilter` — 路径脱敏（过滤 personal/ 目录、Viewer 角色 viewingFile 脱敏）
- Presence 事件发射（`presence.user-online` / `presence.user-offline` / `presence.user-editing` / `presence.user-viewing`）
- `CollabContextProvider` — ContextEngine v2 L7 协作上下文层
- `WorkspaceMemberDirectory` 集成（成员名匹配）
- `EventLogStore` 事件历史查询（最近 30 分钟活动）
- 编辑器 UI：`<PeerPresenceBadge />`（右上角头像组）
- 团队面板 UI：`<TeamPanel />` + `<PeerStatusIcon />`
- IPC handlers（presence.ts）
- Zustand store（presenceStore.ts）
- 单元测试

**不包含：**

- WebSocket/SSE 服务端（由云端团队负责，本任务仅实现客户端）
- 通知中心核心（TASK006，本任务仅注册 `collab-peer-active` 规则消费 Presence 事件）
- AI 主动建议引擎（TASK008）
- 协作冲突 AI 合并（TASK009）
- CRDT/OT 实时协同编辑

## 依赖关系

### 前置依赖

- [x] PHASE2-TASK001 — 事件总线基础设施（`AppEventBus` + `SibyllaEventType` + 事件注册）
- [x] PHASE2-TASK003 — ContextEngine v2（L1-L6 `assembleContextV2()`，本任务追加 L7）
- [x] PHASE2-TASK006 — 通知中心（`collab-peer-active` 通知规则消费 `presence.user-editing` 事件）
- [x] Sprint 2 — SyncManager / WorkspaceMemberDirectory / 角色权限
- [x] Sprint 3.3 — Tracer（Presence 行为进 Trace）
- [x] Sprint 4 — EventLogStore（事件历史查询）
- [x] Sprint 1 — Tiptap 编辑器（PeerPresenceBadge 挂载点）

### 被依赖任务

- 无（本任务不阻塞其他任务，但 TASK006 的 `collab-peer-active` 规则需要本任务的 `presence.user-editing` 事件）

## 参考文档

- [`specs/requirements/phase2/sprint5-collaboration.md`](../../requirements/phase2/sprint5-collaboration.md) — 需求 5.3（Presence）、5.7（协作上下文层）、§3 非功能需求
- [`specs/design/architecture.md`](../../design/architecture.md) — 进程通信架构、WebSocket 事件
- [`specs/design/data-and-api.md`](../../design/data-and-api.md) — WebSocket 事件规范、IPC 接口
- [`specs/design/ui-ux-design.md`](../../design/ui-ux-design.md) — UI/UX 设计规范
- [`specs/design/testing-and-security.md`](../../design/testing-and-security.md) — 安全设计（TLS、隐私保护）
- [`CLAUDE.md`](../../../CLAUDE.md) — 文件即真相、个人空间隔离、云端不存文档
- `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` — Electron IPC 通信模式
- `.kilocode/skills/phase1/zustand-state-management/SKILL.md` — Zustand store 设计
- `.kilocode/skills/phase1/ai-context-engine/SKILL.md` — AI 上下文引擎设计

## 验收标准

### Presence 客户端

- [ ] 用户打开 workspace 后 3 秒内连接到 Presence 服务并广播 `online` 状态
- [ ] 心跳间隔 5 秒，心跳失败时不立即断开，等待 3 次连续失败后触发重连
- [ ] 用户查看文件时更新 `viewingFile` 字段，更新防抖 500ms
- [ ] 用户在编辑器输入时设置 `isEditing = true`，最后一次按键后 10 秒自动恢复为 `false`
- [ ] 用户空闲 5 分钟（无输入、无滚动）自动设置 status 为 `idle`
- [ ] 应用关闭或 workspace 切换后 5 秒内广播 `offline`（best-effort）
- [ ] 网络断开 30 秒后服务端标记用户为 `offline`（客户端感知后更新本地状态）
- [ ] WebSocket 连接失败时降级尝试 SSE 连接
- [ ] SSE 也失败时标记 Presence 服务不可用，UI 显示"团队感知已离线"
- [ ] 本地编辑与 Git 同步不受 Presence 服务状态影响（完全独立）

### Presence 权限与隐私

- [ ] Viewer 角色成员的 viewingFile 对其他成员不可见（隐私保护）
- [ ] 用户关闭"广播我的活动"后，其他成员看到该用户始终为 `online` 但无 `viewingFile` 和 `isEditing`
- [ ] Presence 数据传输全程 TLS
- [ ] Presence 服务不接触文件内容，仅状态信号

### Presence UI

- [ ] `<PeerPresenceBadge />` 显示在编辑器右上角，展示同时查看当前文件的成员头像
- [ ] 不显示光标位置（无内容同步，无法对齐光标坐标）
- [ ] `<TeamPanel />` 侧边栏列出所有成员状态（头像 + 姓名 + 状态图标 + 最后活动时间）
- [ ] 点击成员的 viewingFile 可跳转打开该文件
- [ ] 超过 20 个成员在线时，UI 更新节流到 1Hz 防止渲染风暴
- [ ] Presence 服务离线时显示"团队感知已离线"提示，本地功能正常

### Presence 事件

- [ ] 用户上线时发射 `presence.user-online` 事件
- [ ] 用户下线时发射 `presence.user-offline` 事件
- [ ] 用户开始编辑时发射 `presence.user-editing` 事件（被 TASK006 的 `collab-peer-active` 规则消费）
- [ ] 用户切换查看文件时发射 `presence.user-viewing` 事件
- [ ] 4 个事件类型已注册到 `SibyllaEventType` 联合类型

### 协作上下文层 L7

- [ ] `CollabContextProvider.shouldInject(userMessage)` 正确检测协作语义关键词
- [ ] 关键词包括："队友"/"团队"/"刚才"/"@xxx"/"协作"/"谁改了"/"谁在"
- [ ] 成员名匹配：用户消息中出现的 workspace 成员姓名触发 L7
- [ ] 当前对话包含 `collab.conflict` 类型通知引用时也触发 L7
- [ ] 无协作信号时 L7 被完全跳过（零开销）
- [ ] `collect()` 返回在线成员列表 + 最近 30 分钟活动事件，耗时 < 200ms
- [ ] L7 预算 5% 严格执行，超预算时按活动时间截断（最旧的先删）
- [ ] PresenceClient 离线时 `collect()` 返回空结果，不失败
- [ ] 活动事件引用 personal/ 目录文件时路径自动 redact 为 `[personal-redacted]`
- [ ] 用户引用了 workspace 外成员名时，加入 `unresolvedReferences` 字段
- [ ] L7 注入后 AI 引用格式使用 `[collab:userName:timestamp]`
- [ ] ContextEngine v2 现有 L1-L6 签名不变，L5 权重从 20% 调整为 15%

### 性能要求

- [ ] Presence 状态广播 < 1 秒（P95）
- [ ] Presence 心跳延迟 < 5 秒
- [ ] L7 协作上下文收集 < 200ms
- [ ] Presence UI 更新不造成渲染卡顿（>20 人在线时节流 1Hz）

### 单元测试

- [ ] PresenceClient 连接/重连/降级测试
- [ ] PresenceStore 状态管理 + TTL 过期测试
- [ ] PrivacyFilter 路径过滤测试
- [ ] CollabContextProvider.shouldInject() 关键词检测测试
- [ ] CollabContextProvider.collect() 数据收集与预算裁剪测试
- [ ] IPC handler 测试
- [ ] presenceStore 状态管理测试
- [ ] PeerPresenceBadge 渲染测试
- [ ] TeamPanel 渲染测试
- [ ] 覆盖率 ≥ 80%

## 技术策略

### 核心架构：WebSocket 状态广播 + 事件总线消费 + L7 按需注入

```
云端 Presence 服务 (WebSocket/SSE)
         │
         │ 心跳 5s / 状态变更即时
         ▼
PresenceClient (主进程)
    │
    ├── 接收 peer 状态 → PresenceStore (内存 Map)
    │   └── LRU + TTL (30s 无心跳 → 标记 offline)
    │
    ├── 广播自身状态 (viewingFile / isEditing / status)
    │   └── 防抖 500ms
    │
    └── 状态变更 → AppEventBus.emitEvent()
        ├── presence.user-online
        ├── presence.user-offline
        ├── presence.user-editing
        └── presence.user-viewing
             │
             ▼
        ┌────────────────────────────────┐
        │ TASK006 通知中心                │
        │ (collab-peer-active 规则消费)   │
        └────────────────────────────────┘
             │
             ▼
CollabContextProvider (L7)
    │
    ├── shouldInject(userMessage)?
    │   ├── 关键词检测 (正则)
    │   ├── 成员名匹配 (成员列表)
    │   └── 冲突通知上下文检查
    │
    └── collect(request, budget)
        ├── PresenceStore.getOnlineMembers()
        ├── EventLogStore.query(since: now-30min)
        ├── PrivacyFilter.redact(personal/ paths)
        └── 按预算裁剪 (oldest first)
             │
             ▼
        ContextEngine v2 L7 注入
```

### Presence 数据模型

```
PeerState (Presence 信号，不含文件内容)
    ├── userId: string
    ├── displayName: string
    ├── avatar: string (URL)
    ├── status: 'online' | 'idle' | 'offline'
    ├── viewingFile?: string (可选，受隐私设置和角色控制)
    ├── isEditing: boolean
    └── lastActiveAt: number (timestamp)

SelfState (广播内容)
    ├── userId: string
    ├── status: 'online' | 'idle' | 'offline'
    ├── viewingFile?: string
    ├── isEditing: boolean
    └── broadcastEnabled: boolean (用户设置)

PresenceMessage (WebSocket 消息格式)
    ├── type: 'heartbeat' | 'state-change' | 'bye'
    ├── payload: PeerState | SelfState
    └── timestamp: number
```

### L7 协作上下文注入流程

```
用户发送消息 "刚才 Alice 改了什么?"
         │
         ▼
ContextEngine.assembleContextV2(request)
    │
    ├── L1-L6 正常执行 (不修改)
    │
    ├── L6 之后检查 L7:
    │   if (collabContextProvider.shouldInject(request.userMessage))
    │       │
    │       ├── 关键词匹配: "刚才" ✅
    │       ├── 成员名匹配: "Alice" ✅ (workspace 成员)
    │       │
    │       ▼
    │   collabContextProvider.collect(request, budgetForL7)
    │       │
    │       ├── PresenceStore → 在线成员: [Alice(online, viewing auth.md), Bob(idle)]
    │       ├── EventLogStore → 30min 活动:
    │       │   ├── Alice 修改了 docs/auth.md (10:23)
    │       │   ├── Bob 解决了 sync 冲突 (10:18)
    │       │   └── ...
    │       ├── PrivacyFilter → personal/redacted → [personal-redacted]
    │       └── 预算检查: 5% of totalBudget → 裁剪最旧条目
    │       │
    │       ▼
    │   返回 CollabContext { layers, unresolvedReferences? }
    │       │
    │       ▼
    │   追加到 layers[] → 进入 AI prompt
    │
    └── L7 注入完成，AI 可回答协作场景问题
```

### L5 权重调整策略

```
ContextEngine v2 层权重 (本任务后):
    L1: always       30% (不变)
    L2: ai-mode      10% (不变)
    L3: memory       15% (不变)
    L4: skill/agent  15% (不变)
    L5: cross-source 15% (从 20% 降至 15%)
    L6: manual       10% (不变)
    L7: collab        5% (新增)
    总计: 100%

调整理由:
- L5(cross-source) 的搜索结果天然可截断，降 5% 不影响质量
- L7 仅在协作语义触发时注入，不会与 L5 同时占满预算
- L1-L4 和 L6 保持不变，已有稳定层不受影响
```

### 依赖库选型

| 用途 | 库 | 说明 |
|------|-----|------|
| WebSocket 客户端 | `ws`（Node.js 内置能力或已有） | Presence 长连接 |
| SSE 降级 | 原生 `EventSource` | WebSocket 失败时降级 |
| 状态管理 | `zustand`（已有） | presenceStore |
| UI 组件 | `TailwindCSS`（已有） | 所有样式 |
| 动画 | `framer-motion`（已有） | 成员上线动画 |

## 技术执行路径

### 步骤 1：定义 Presence 类型系统与事件注册

**文件：** `src/main/services/presence/types.ts`（新建）

1. 定义 `PresenceStatus` 联合类型：`'online' | 'idle' | 'offline'`
2. 定义 `PeerState` 接口：
   ```typescript
   interface PeerState {
     userId: string
     displayName: string
     avatar: string
     status: PresenceStatus
     viewingFile?: string
     isEditing: boolean
     lastActiveAt: number
   }
   ```
3. 定义 `SelfState` 接口（广播内容）：
   ```typescript
   interface SelfState {
     userId: string
     status: PresenceStatus
     viewingFile?: string
     isEditing: boolean
   }
   ```
4. 定义 `PresenceMessage` 接口（WebSocket 消息）：
   ```typescript
   interface PresenceMessage {
     type: 'heartbeat' | 'state-change' | 'bye'
     payload: PeerState | SelfState
     timestamp: number
   }
   ```
5. 定义 `PresenceConfig` 接口：
   ```typescript
   interface PresenceConfig {
     serviceUrl: string
     heartbeatIntervalMs: number   // 默认 5000
     idleTimeoutMs: number         // 默认 300000 (5 分钟)
     editingTimeoutMs: number      // 默认 10000
     viewUpdateDebounceMs: number  // 默认 500
     reconnectMaxRetries: number   // 默认 5
     reconnectBaseDelayMs: number  // 默认 1000
     broadcastEnabled: boolean     // 默认 true
   }
   ```
6. 定义 `PresenceEventType` 常量：4 个事件类型字符串

**文件：** `src/main/services/presence/constants.ts`（新建）

7. 定义默认配置常量：`DEFAULT_PRESENCE_CONFIG`
8. 定义关键词列表：`COLLAB_KEYWORDS = ['队友', '团队', '刚才', '协作', '谁改了', '谁在', '一起', '大家', '成员']`
9. 定义 L7 预算比例：`COLLAB_CONTEXT_BUDGET_RATIO = 0.05`（5%）
10. 定义活动查询窗口：`ACTIVITY_WINDOW_MS = 30 * 60 * 1000`（30 分钟）

**文件：** `src/main/services/event-bus/types.ts`（修改，TASK006 步骤 1 中已追加）

11. 确认 4 个 Presence 事件类型已注册到 `SibyllaEventType`：
    - `'presence.user-online'`
    - `'presence.user-offline'`
    - `'presence.user-editing'`
    - `'presence.user-viewing'`

**验证：** 类型编译通过、事件类型与 TASK006 不冲突。

### 步骤 2：实现 PresenceClient（WebSocket/SSE 客户端）

**文件：** `src/main/services/presence/presence-client.ts`（新建）

1. 定义 `PresenceClient` 类，构造函数注入 `PresenceConfig`、`AppEventBus`、`PresenceStore`、`Tracer`（可选）
2. 实现 `connect(workspaceId: string, userId: string, token: string): Promise<void>` 方法：
   - 构建 WebSocket URL：`${config.serviceUrl}/presence?workspaceId=${workspaceId}&token=${token}`
   - 尝试 WebSocket 连接
   - WebSocket 失败 → 降级尝试 SSE 连接（`${config.serviceUrl}/presence/stream?...`）
   - SSE 也失败 → 标记 `_serviceAvailable = false`，通知 PresenceStore 服务不可用
   - 连接成功后：
     - 发送初始状态（`online`）
     - 启动心跳定时器（5 秒间隔）
     - 启动空闲检测定时器（5 分钟间隔检查最后活动时间）
3. 实现 `_setupWebSocket(url: string)` 私有方法：
   - 创建 WebSocket 实例
   - `onopen`：标记 `_serviceAvailable = true`，发送初始状态
   - `onmessage`：解析 JSON 为 `PresenceMessage`，调用 `_handleMessage(message)`
   - `onclose`：若非主动关闭 → 触发重连 `_reconnect()`
   - `onerror`：记录日志，不直接断开（等待 onclose）
4. 实现 `_setupSSE(url: string)` 私有方法（降级路径）：
   - 创建 `EventSource` 实例
   - 监听 `message` 事件
   - SSE 仅支持接收（无法发送心跳），心跳改为 HTTP POST 定时发送
5. 实现 `_handleMessage(message: PresenceMessage)` 私有方法：
   - `type === 'heartbeat'`：更新 peer 的 `lastActiveAt`
   - `type === 'state-change'`：
     - 解析为 `PeerState`
     - 调用 `store.updatePeer(peerState)`
     - 根据状态变化发射对应 AppEventBus 事件：
       - 新上线（之前 offline → online）→ `presence.user-online`
       - 下线（online/idle → offline）→ `presence.user-offline`
       - isEditing 从 false → true → `presence.user-editing`
       - viewingFile 变化 → `presence.user-viewing`
   - `type === 'bye'`：peer 主动下线，标记为 offline
6. 实现 `broadcastState(state: Partial<SelfState>): void` 方法：
   - 若 `!config.broadcastEnabled` → 仅更新 status，不发送 viewingFile 和 isEditing
   - 防抖 500ms（viewingFile 更新场景）
   - 通过 WebSocket send 发送 `PresenceMessage { type: 'state-change', payload }`
   - 更新本地 `_lastBroadcastState`
7. 实现 `updateViewingFile(filePath: string | undefined): void` 方法：
   - 调用 `broadcastState({ viewingFile: filePath })`（带 500ms 防抖）
   - 记录 `_lastActivityAt = Date.now()`
8. 实现 `setEditing(isEditing: boolean): void` 方法：
   - 调用 `broadcastState({ isEditing })`
   - 若 isEditing → 启动 10 秒自动恢复定时器
   - 记录 `_lastActivityAt`
9. 实现 `_reconnect()` 私有方法：
   - 指数退避重连：`baseDelay * 2^attempt`，最大 `config.reconnectMaxRetries` 次
   - 每次 `attempt` 间隔：1s、2s、4s、8s、16s
   - 超过最大重试 → 标记服务不可用
10. 实现 `disconnect(): Promise<void>` 方法：
    - 发送 `bye` 消息（best-effort）
    - 关闭 WebSocket/SSE 连接
    - 清理所有定时器
    - 标记 `_serviceAvailable = false`
11. 实现 `isServiceAvailable(): boolean` 方法
12. 实现 `shutdown(): void` 方法：清理所有资源

**验证：** 连接建立 < 3 秒、心跳正确、重连指数退避正确、降级到 SSE 正确、状态广播防抖正确。

### 步骤 3：实现 PresenceStore（内存状态管理）

**文件：** `src/main/services/presence/presence-store.ts`（新建）

1. 定义 `PresenceStore` 类，构造函数注入 `AppEventBus`
2. 内部数据结构：`Map<userId, PeerState>`（LRU 缓存，最大容量 100）
3. 实现 `initialize(): void` 方法：
   - 清空 Map
   - 设置 30 秒过期扫描定时器：遍历 Map，`lastActiveAt` 超过 30 秒且 status !== offline → 标记为 offline，发射 `presence.user-offline`
4. 实现 `updatePeer(peerState: PeerState): void` 方法：
   - 若 userId 不存在 → 新增（上线事件在 PresenceClient 中发射）
   - 若已存在 → 更新字段，记录状态变化
   - 更新 LRU 顺序
5. 实现 `removePeer(userId: string): void` 方法：设置 status = offline
6. 实现 `getPeers(): PeerState[]` 方法：返回所有非 offline 的 peer
7. 实现 `getOnlineMembers(): PeerState[]` 方法：返回 status === 'online' 的 peer
8. 实现 `getPeersViewingFile(filePath: string): PeerState[]` 方法：过滤 viewingFile === filePath 的 peer
9. 实现 `getPeerById(userId: string): PeerState | undefined` 方法
10. 实现 `setServiceAvailable(available: boolean): void` 方法：更新内部标志
11. 实现 `isServiceAvailable(): boolean` 方法
12. 实现 `clear(): void` 方法：清空 Map，发射所有在线 peer 的 `presence.user-offline` 事件
13. 实现 `shutdown(): void` 方法：清理定时器，调用 clear

**验证：** 状态更新正确、过期清理正确、查询过滤正确、LRU 淘汰正确。

### 步骤 4：实现 PrivacyFilter（隐私过滤器）

**文件：** `src/main/services/presence/privacy-filter.ts`（新建）

1. 定义 `PrivacyFilter` 类，构造函数接收可选的 `getMemberRole(userId: string): string` 函数
2. 定义 `PERSONAL_PATH_PREFIXES` 常量：`['personal/', '.env']`
3. 实现 `redactPath(filePath: string | undefined): string | undefined` 方法：
   - 若 filePath 为 undefined → return undefined
   - 若 filePath 以任一 `PERSONAL_PATH_PREFIXES` 开头 → return `'[personal-redacted]'`
   - 否则 → return filePath
4. 实现 `filterPeerStateForViewer(peerState: PeerState, viewerRole: string): FilteredPeerState` 方法：
   - 若 viewerRole === 'admin' → 返回完整状态（admin 可见所有）
   - 若 viewerRole === 'viewer' → 返回 `{ ...peerState, viewingFile: undefined, isEditing: false }`
   - 否则 → 返回完整状态
5. 实现 `shouldBroadcastViewingFile(userRole: string, broadcastEnabled: boolean): boolean` 方法：
   - 若 !broadcastEnabled → return false
   - 若 userRole === 'viewer' → return false
   - 否则 → return true
6. 实现 `filterActivityEvents(events: ActivityEvent[], forUserId: string): ActivityEvent[]` 方法：
   - 遍历事件列表
   - 若事件的 filePath 以 `personal/` 开头且不属于 forUserId → redact 为 `[personal-redacted]`
   - 返回过滤后列表

**验证：** personal/ 路径正确脱敏、Viewer 角色正确隐藏 viewingFile、广播设置正确控制。

### 步骤 5：实现 CollabContextProvider（L7 协作上下文层）

**文件：** `src/main/services/context-engine/collab-context-provider.ts`（新建）

1. 定义 `CollabContextProvider` 类，构造函数注入 `PresenceStore`、`EventLogStore`、`WorkspaceMemberDirectory`、`PrivacyFilter`
2. 定义 `CollabContext` 接口：
   ```typescript
   interface CollabContext {
     layers: ContextLayer[]
     unresolvedReferences?: string[]
   }
   ```
3. 实现 `shouldInject(userMessage: string): boolean` 方法：
   - step 1: 关键词检测——使用 `COLLAB_KEYWORDS` 正则匹配用户消息
     ```typescript
     const keywordPattern = /(队友|团队|刚才|协作|谁改了|谁在|一起|大家|成员)/
     if (keywordPattern.test(userMessage)) return true
     ```
   - step 2: 成员名匹配——遍历 `WorkspaceMemberDirectory.getMembers()`，检查用户消息是否包含任一成员的 displayName
     ```typescript
     const members = this.memberDirectory.getMembers()
     for (const member of members) {
       if (userMessage.includes(member.displayName)) return true
     }
     ```
   - step 3: 冲突上下文检查——检查当前对话是否引用了 `collab.conflict` 类型通知（由上层传入 context）
   - step 4: 均不匹配 → return false（零开销）
   - 注意：此方法为纯函数，不调用 LLM，不调用网络
4. 实现 `collect(request: ContextRequest, budget: number): CollabContext` 方法：
   - step 1: 收集在线成员列表
     ```typescript
     const onlineMembers = this.presenceStore.getOnlineMembers()
       .map(peer => `${peer.displayName} (${peer.status}${peer.viewingFile ? ', 查看: ' + peer.viewingFile : ''})`)
     ```
   - step 2: 查询最近 30 分钟活动事件
     ```typescript
     const since = Date.now() - ACTIVITY_WINDOW_MS
     const events = this.eventLogStore.query({
       type: ['file.updated', 'git.conflict-detected', 'presence.user-editing', 'presence.user-online'],
       since
     })
     ```
   - step 3: 格式化活动事件为可读文本
     ```typescript
     const activityLines = events.map(e => {
       const actor = e.payload?.userName ?? '系统'
       const action = e.type === 'file.updated' ? '修改了'
         : e.type === 'git.conflict-detected' ? '遇到冲突'
         : e.type === 'presence.user-editing' ? '正在编辑'
         : '上线了'
       const target = e.payload?.filePath ?? ''
       return `- ${actor} ${action} ${target} (${formatRelativeTime(e.timestamp)})`
     })
     ```
   - step 4: PrivacyFilter 脱敏
     ```typescript
     const filteredLines = this.privacyFilter.filterActivityEvents(
       activityLines.map(line => ({ content: line })),
       request.userId
     ).map(e => e.content)
     ```
   - step 5: 预算裁剪
     ```typescript
     const maxTokens = budget // 由 ContextEngine 传入的 5% 预算
     let content = `## 团队协作上下文\n### 在线成员\n${onlineMembers.join('\n')}\n### 最近活动\n${filteredLines.join('\n')}`
     // 若超过预算，从最旧的活动事件开始截断
     while (estimateTokens(content) > maxTokens && filteredLines.length > 1) {
       filteredLines.shift() // 移除最旧的
       content = `## 团队协作上下文\n### 在线成员\n${onlineMembers.join('\n')}\n### 最近活动\n${filteredLines.join('\n')}`
     }
     ```
   - step 6: 检查未解析引用（用户消息中提到的非成员名字）
     ```typescript
     const memberNames = this.memberDirectory.getMembers().map(m => m.displayName)
     const mentionedNames = extractMentionedNames(userMessage)
     const unresolvedReferences = mentionedNames.filter(n => !memberNames.includes(n))
     ```
   - step 7: 组装返回
     ```typescript
     return {
       layers: [{
         id: 'collab',
         source: 'presence+events',
         content,
         tokenEstimate: estimateTokens(content),
         priority: 7 // L7
       }],
       unresolvedReferences: unresolvedReferences.length > 0 ? unresolvedReferences : undefined
     }
     ```
   - 异常处理：PresenceStore 或 EventLogStore 抛异常 → 捕获，返回 `{ layers: [] }`（graceful degradation）
5. 实现 `extractMentionedNames(text: string): string[]` 辅助函数：
   - 使用 `@xxx` 模式匹配
   - 也匹配中文人名（2-3 字的常见中文姓名模式）
   - 返回去重列表

**验证：** 关键词检测准确、成员名匹配准确、预算裁剪正确、隐私过滤正确、异常降级正确。

### 步骤 6：集成 CollabContextProvider 到 ContextEngine v2

**文件：** `src/main/services/context-engine/context-engine.ts`（修改 Sprint 4 的 PHASE2-TASK003）

1. 在 `ContextEngine` 类中新增可选属性 `collabContextProvider: CollabContextProvider | null`，初始为 null
2. 新增 `setCollabContextProvider(provider: CollabContextProvider): void` 方法：
   ```typescript
   setCollabContextProvider(provider: CollabContextProvider): void {
     this.collabContextProvider = provider
   }
   ```
3. 在 `assembleContextV2()` 方法中，L6 (manual) 处理完成后、最终 token 预算分配前，追加 L7 逻辑：
   ```typescript
   // L7: Collab Context (本 Sprint 新增)
   if (this.collabContextProvider) {
     try {
       const shouldInject = this.collabContextProvider.shouldInject(request.userMessage)
       if (shouldInject) {
         const budgetForL7 = Math.floor(totalBudget * COLLAB_CONTEXT_BUDGET_RATIO) // 5%
         const collabContext = await this.collabContextProvider.collect(request, budgetForL7)
         if (collabContext.layers.length > 0) {
           layers.push(...collabContext.layers)
           if (collabContext.unresolvedReferences) {
             request.unresolvedReferences = collabContext.unresolvedReferences
           }
         }
       }
     } catch (err) {
       logger.warn('L7 collab context failed, skipping', { error: err })
       // 不阻断 L1-L6
     }
   }
   ```
4. 调整 L5 权重配置：
   - 在 ContextEngine 的层权重配置中，将 L5 从 0.20 改为 0.15
   - 新增 L7 权重 0.05
   - 确保总权重 = 1.0

**文件：** `src/main/services/context-engine/types.ts`（修改 Sprint 4）

5. 在 `ContextLayer` 接口中确认 `id` 字段支持 `'collab'` 值
6. 在 `ContextRequest` 接口中新增可选字段 `unresolvedReferences?: string[]`

**验证：** L7 注入逻辑正确、L5 权重调整后总权重 100%、L7 失败不影响 L1-L6、不修改 `assembleContextV2()` 现有签名。

### 步骤 7：实现 IPC Handlers 与 Preload

**文件：** `src/main/ipc/handlers/presence.ts`（新建）

1. 注册 Presence 相关 IPC handlers：

   **`presence:getPeers`**：
   - 参数：无
   - 实现：
     - 获取 `presenceStore.getPeers()`
     - 获取当前用户角色
     - 对每个 peer 应用 `privacyFilter.filterPeerStateForViewer(peer, viewerRole)`
   - 返回：`FilteredPeerState[]`

   **`presence:broadcastView`**（R→M，渲染进程推送）：
   - 参数：`{ filePath: string | undefined }`
   - 实现：
     - 获取当前用户角色和 broadcastEnabled 设置
     - 若 `!privacyFilter.shouldBroadcastViewingFile(role, broadcastEnabled)` → return
     - 调用 `presenceClient.updateViewingFile(filePath)`
   - 返回：`void`

   **`presence:toggleBroadcast`**：
   - 参数：`{ enabled: boolean }`
   - 实现：更新 PresenceConfig.broadcastEnabled
   - 返回：`void`

2. 注册 M→R 推送事件：
   - `presence:peersUpdated` — PresenceStore 状态变化时推送（节流 1Hz）

**文件：** `src/shared/types.ts`（扩展）

3. 在 `IPC_CHANNELS` 中追加：
   ```typescript
   PRESENCE_GET_PEERS: 'presence:getPeers',
   PRESENCE_BROADCAST_VIEW: 'presence:broadcastView',
   PRESENCE_TOGGLE_BROADCAST: 'presence:toggleBroadcast',
   ```

**文件：** `src/preload/index.ts`（扩展）

4. 追加 `presence` 命名空间：
   ```typescript
   presence: {
     getPeers: () => ipcRenderer.invoke('presence:getPeers'),
     broadcastView: (filePath) => ipcRenderer.invoke('presence:broadcastView', { filePath }),
     toggleBroadcast: (enabled) => ipcRenderer.invoke('presence:toggleBroadcast', { enabled }),
   },
   ```

**验证：** IPC 通道注册正确、隐私过滤在 IPC 层生效、推送节流正确。

### 步骤 8：实现渲染进程 Zustand Store 与 UI 组件

**文件：** `src/renderer/store/presenceStore.ts`（新建）

1. 定义 `PresenceState` 接口：
   ```typescript
   interface PresenceState {
     peers: FilteredPeerState[]
     isServiceAvailable: boolean
     isLoading: boolean

     fetchPeers: () => Promise<void>
     setPeers: (peers: FilteredPeerState[]) => void
     setServiceAvailable: (available: boolean) => void
     getPeersViewingFile: (filePath: string) => FilteredPeerState[]
   }
   ```
2. 创建 Zustand store，监听 `presence:peersUpdated` IPC 推送

**文件：** `src/renderer/components/presence/PeerPresenceBadge.tsx`（新建）

3. 编辑器右上角 Presence 徽章组件：
   - Props：`{ filePath: string }`
   - 从 `presenceStore.getPeersViewingFile(filePath)` 获取同时查看该文件的成员
   - 渲染为圆形头像组（最多显示 3 个，超过显示 "+N"）
   - hover 展开显示成员名和状态
   - 不显示光标位置（与 Google Docs 等协作工具不同）
   - 使用 framer-motion 入场动画（淡入缩放）
   - 空列表时不渲染（不占位）
   - 挂载于 `<Editor />` 组件的右上角区域，不引入新 Tiptap 扩展

**文件：** `src/renderer/components/presence/TeamPanel.tsx`（新建）

4. 团队面板侧边栏组件：
   - 顶部标题 "团队" + 在线人数
   - 成员列表（从 `presenceStore.peers` 获取）：
     - 每行：头像 + 姓名 + 状态图标 + 最后活动时间
     - 状态图标：
       - online: 绿色圆点
       - idle: 黄色圆点
       - offline: 灰色圆点
     - 可选显示 viewingFile（受隐私过滤控制）
     - 点击 viewingFile → 打开该文件
   - 排序：online > idle > offline，同状态按姓名排序
   - 底部设置：
     - "广播我的活动" 开关
     - "团队感知已离线" 提示（服务不可用时）
   - 超过 20 个成员在线时节流 UI 更新到 1Hz（在 presenceStore 层面控制）

**文件：** `src/renderer/components/presence/PeerStatusIcon.tsx`（新建）

5. 状态图标组件：
   - Props：`{ status: PresenceStatus; size?: 'sm' | 'md' }`
   - online: 8px 绿色圆点 + 微弱脉冲动画
   - idle: 8px 黄色圆点
   - offline: 8px 灰色圆点（半透明）

**文件：** `src/renderer/components/editor/Editor.tsx`（修改 Sprint 1 文件）

6. 在编辑器组件中挂载 `<PeerPresenceBadge filePath={currentFilePath} />`：
   - 位置：编辑器右上角，使用 absolute 定位
   - z-index 高于编辑内容但不遮挡工具栏
   - 编辑器组件 mount 时调用 `window.electronAPI.presence.broadcastView(filePath)`
   - 编辑器组件 unmount 时调用 `window.electronAPI.presence.broadcastView(undefined)`

**文件：** `src/renderer/components/editor/useEditingPresence.ts`（新建）

7. 编辑状态上报 hook：
   ```typescript
   export function useEditingPresence(editor: Editor | null) {
     useEffect(() => {
       if (!editor) return

       let editingTimer: ReturnType<typeof setTimeout> | null = null

       const handleUpdate = () => {
         window.electronAPI.presence.broadcastEditing(true)
         if (editingTimer) clearTimeout(editingTimer)
         editingTimer = setTimeout(() => {
           window.electronAPI.presence.broadcastEditing(false)
         }, 10000) // 10 秒无输入恢复
       }

       editor.on('update', handleUpdate)
       return () => {
         editor.off('update', handleUpdate)
         if (editingTimer) clearTimeout(editingTimer)
       }
     }, [editor])
   }
   ```
   - 挂载于 `<Editor />` 组件内部
   - 监听 Tiptap `editor.on('update')` 事件
   - 设置 `isEditing = true`，10 秒后恢复为 `false`

**验证：** PeerPresenceBadge 显示正确、TeamPanel 状态正确、编辑状态上报正确、隐私过滤在 UI 层生效。

### 步骤 9：集成测试与验证

1. **Presence 端到端测试：**
   - 模拟 WebSocket 连接建立 → 验证 online 状态广播
   - 模拟心跳失败 → 验证重连指数退避
   - 模拟 WebSocket 连接失败 → 验证 SSE 降级
   - 模拟断线 30 秒 → 验证 peer 标记 offline
   - 验证 5 分钟空闲 → idle 状态

2. **L7 协作上下文端到端测试：**
   - 输入 "刚才 Alice 改了什么?" → 验证 L7 注入
   - 输入 "帮我写个函数" → 验证 L7 跳过（零开销）
   - 验证 L7 预算超限时裁剪最旧事件
   - 验证 personal/ 路径自动 redact
   - 验证 L7 失败时 L1-L6 正常工作

3. **隐私与权限测试：**
   - Viewer 角色看不到他人 viewingFile
   - 关闭广播后 viewingFile 和 isEditing 不再广播
   - TLS 传输验证（mock WebSocket）

4. **与已有模块集成验证：**
   - Sprint 4 AppEventBus：验证 4 个 presence.* 事件正确注册和发射
   - Sprint 4 ContextEngine v2：验证 L7 注入不影响 L1-L6、L5 权重调整正确
   - Sprint 4 EventLogStore：验证事件历史查询正确
   - Sprint 2 WorkspaceMemberDirectory：验证成员名匹配
   - Sprint 1 编辑器：验证 PeerPresenceBadge 挂载正确
   - TASK006 通知中心：验证 `collab-peer-active` 规则消费 `presence.user-editing` 事件

5. **性能测试：**
   - Presence 状态广播 < 1 秒
   - L7 收集 < 200ms
   - 20+ 人在线 UI 更新节流 1Hz

## 现有代码基础

| 已有模块 | 文件路径 | 本任务使用方式 |
|---------|---------|-------------|
| AppEventBus | `src/main/services/event-bus/` | 发射 4 个 presence.* 事件 |
| EventLogStore | `src/main/services/event-bus/event-log-store.ts` | 查询最近 30 分钟事件历史 |
| ContextEngine v2 | `src/main/services/context-engine/context-engine.ts` | 追加 L7 注入逻辑 + L5 权重调整 |
| ContextEngine types | `src/main/services/context-engine/types.ts` | 扩展 ContextLayer.id 支持 'collab' |
| WorkspaceMemberDirectory | `src/main/services/sync/workspace-member-directory.ts` | 成员名匹配、角色查询 |
| AiModeRegistry | `src/main/services/mode/ai-mode-registry.ts` | 不修改 |
| Tiptap 编辑器 | `src/renderer/components/editor/Editor.tsx` | 挂载 PeerPresenceBadge + editing hook |
| PrivacyFilter | `src/main/services/presence/privacy-filter.ts`（本任务新建） | 路径脱敏与角色过滤 |
| IPC 类型注册 | `src/shared/types.ts` | 追加 IPC_CHANNELS 常量 |
| Preload 暴露 | `src/preload/index.ts` | 追加 presence 命名空间 |

## 新增文件清单

| 模块 | 文件路径 | 说明 |
|------|---------|------|
| Presence 类型 | `src/main/services/presence/types.ts` | PeerState / SelfState / PresenceMessage 类型 |
| Presence 常量 | `src/main/services/presence/constants.ts` | 默认配置与关键词列表 |
| Presence 客户端 | `src/main/services/presence/presence-client.ts` | WebSocket/SSE 客户端 |
| Presence 存储 | `src/main/services/presence/presence-store.ts` | 内存状态管理 (LRU+TTL) |
| 隐私过滤器 | `src/main/services/presence/privacy-filter.ts` | 路径脱敏与角色过滤 |
| 协作上下文 | `src/main/services/context-engine/collab-context-provider.ts` | L7 协作上下文层 |
| IPC-Presence | `src/main/ipc/handlers/presence.ts` | Presence IPC handlers |
| Store-Presence | `src/renderer/store/presenceStore.ts` | Zustand Presence 状态 |
| UI-徽章 | `src/renderer/components/presence/PeerPresenceBadge.tsx` | 编辑器右上角头像组 |
| UI-团队面板 | `src/renderer/components/presence/TeamPanel.tsx` | 成员状态侧边栏 |
| UI-状态图标 | `src/renderer/components/presence/PeerStatusIcon.tsx` | 在线/空闲/离线图标 |
| 编辑状态 hook | `src/renderer/components/editor/useEditingPresence.ts` | 编辑状态上报 |

## 涉及的现有文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/main/services/context-engine/context-engine.ts` | 扩展 | 追加 setCollabContextProvider() + assembleContextV2() 中 L7 逻辑 + L5 权重调整 |
| `src/main/services/context-engine/types.ts` | 扩展 | ContextLayer.id 支持 'collab'、ContextRequest 追加 unresolvedReferences |
| `src/shared/types.ts` | 扩展 | IPC_CHANNELS 追加 3 个通道常量 |
| `src/preload/index.ts` | 扩展 | 追加 presence 命名空间 |
| `src/renderer/components/editor/Editor.tsx` | 扩展 | 挂载 PeerPresenceBadge + useEditingPresence hook |

**不修改的文件：**

- `src/main/services/event-bus/event-bus.ts` — 不修改 AppEventBus 核心
- `src/main/services/event-bus/event-log-store.ts` — 不修改，仅调用其 query() 方法
- `src/main/services/sync/sync-manager.ts` — 不修改
- `src/main/services/sync/workspace-member-directory.ts` — 不修改，仅调用其 getMembers()
- `src/main/services/mode/ai-mode-registry.ts` — 不修改
- `src/renderer/components/editor/Tiptap 扩展` — 不引入新 Tiptap 扩展，PeerPresenceBadge 为外围组件

---

**创建时间：** 2026-04-30
**最后更新：** 2026-04-30
**更新记录：**
- 2026-04-30 — 创建任务文档（含完整技术执行路径 9 步）
