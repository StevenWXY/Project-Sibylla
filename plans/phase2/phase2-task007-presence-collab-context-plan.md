# PHASE2-TASK007: 团队 Presence 信号层与协作上下文 — 实施计划

> 任务来源：[specs/tasks/phase2/phase2-task007_presence-collab-context.md](../../specs/tasks/phase2/phase2-task007_presence-collab-context.md)
> 创建日期：2026-04-30
> 最后更新：2026-04-30

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK007 |
| **任务标题** | 团队 Presence 信号层与协作上下文 |
| **所属阶段** | Phase 2 - 智能通知与协作增强 (Sprint 5) |
| **优先级** | P1 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | TASK001(事件总线) + TASK003(ContextEngine v2) + TASK006(通知中心) |

### 1.1 目标

构建 Sprint 5 的团队协作感知基础设施——Presence 信号层与协作上下文层(L7)。Presence 通过轻量 WebSocket/SSE 长连接实现软实时状态广播（谁在线、查看哪个文件、是否在编辑），与 Git 同步完全分离；协作上下文层(L7) 作为 ContextEngine v2 的新增层，仅在用户消息包含协作语义关键词时注入在线成员与最近团队活动，让 AI 能回答"刚才 Alice 改了什么"等协作场景问题。

### 1.2 核心设计约束（不可违反）

1. **不引入 CRDT**：Presence 仅传递状态信号，不传递文件内容
2. **Presence 完全独立于 Git 同步**：断线不影响本地编辑与同步
3. **Presence 不接触文件内容**：仅传递 userId、status、viewingFile、isEditing
4. **L7 仅在协作语义触发时注入**：关键词检测纯本地正则 + 成员名匹配，不调用 LLM
5. **L5 权重从 20% 降至 15%**：为 L7 腾出 5% 空间，不压缩 L1-L4 和 L6
6. **L7 失败不影响 L1-L6**：graceful degradation

### 1.3 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| Presence 类型 | `src/main/services/presence/types.ts` | PeerState / SelfState / PresenceMessage |
| Presence 常量 | `src/main/services/presence/constants.ts` | 默认配置与关键词列表 |
| Presence 客户端 | `src/main/services/presence/presence-client.ts` | WebSocket/SSE 客户端 |
| Presence 存储 | `src/main/services/presence/presence-store.ts` | 内存状态管理 (LRU+TTL) |
| 隐私过滤器 | `src/main/services/presence/privacy-filter.ts` | 路径脱敏与角色过滤 |
| 协作上下文 | `src/main/services/context-engine/collab-context-provider.ts` | L7 协作上下文层 |
| IPC Handlers | `src/main/ipc/handlers/presence.ts` | Presence IPC handlers |
| Zustand Store | `src/renderer/store/presenceStore.ts` | 渲染进程 Presence 状态 |
| UI-徽章 | `src/renderer/components/presence/PeerPresenceBadge.tsx` | 编辑器右上角头像组 |
| UI-团队面板 | `src/renderer/components/presence/TeamPanel.tsx` | 成员状态侧边栏 |
| UI-状态图标 | `src/renderer/components/presence/PeerStatusIcon.tsx` | 在线/空闲/离线图标 |
| 编辑状态 hook | `src/renderer/components/editor/useEditingPresence.ts` | 编辑状态上报 |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；文件即真相；云端不存文档；个人空间隔离 | 全局约束 |
| `specs/design/architecture.md` | 进程通信架构(§3.2)、WebSocket 事件(§6) | IPC 设计 |
| `specs/design/data-and-api.md` | WebSocket 事件规范、IPC 接口(§5-6) | Presence 消息格式 |
| `specs/design/ui-ux-design.md` | 色彩体系(#6366F1 主色)、组件规范(按钮 6px 圆角)、Toast 规范 | UI 组件 |
| `specs/design/testing-and-security.md` | 测试覆盖率≥80%、TLS 传输、隐私保护 | 测试与安全 |
| `specs/requirements/phase2/sprint5-collaboration.md` | 需求 5.3(Presence)、5.7(协作上下文层)、§3 非功能需求 | 验收标准 |
| `specs/tasks/phase2/phase2-task007_presence-collab-context.md` | 9 步执行路径、全部验收标准 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `electron-ipc-patterns` | Presence IPC 设计；M→R 推送(peersUpdated)；类型安全通道 | `presence.ts` handler + `preload/index.ts` 扩展 |
| `zustand-state-management` | `presenceStore.ts` 设计；selector 性能优化；IPC 封装在 action 中 | `src/renderer/store/presenceStore.ts` |
| `ai-context-engine` | L7 层设计；Token 预算裁剪策略；与 assembleContextV2() 集成模式 | `collab-context-provider.ts` + `context-engine.ts` 修改 |

### 2.3 前置代码依赖

| 模块 | 实际文件路径 | 复用方式 |
|------|------------|---------|
| `SibyllaEventType` | `src/main/services/event-bus-types.ts:5-63` | 已注册 4 个 `presence.*` 事件类型，无需修改 |
| `EventPayloadMap` | `src/main/services/event-bus-types.ts:77-135` | 已定义 `presence.user-online/offline/editing/viewing` 载荷类型 |
| `AppEventBus` | `src/main/services/event-bus.ts` | 发射 Presence 事件（subscribe/emitEvent） |
| `EventLogStore` | `src/main/services/event-log-store.ts` | 查询最近 30 分钟事件历史（read/append/flush） |
| `ContextEngine v2` | `src/main/services/context-engine/context-engine.ts` | 追加 L7 注入逻辑 + L5 权重调整 |
| `ContextLayerTypeV2` | `src/main/services/context-engine/types-v2.ts:1-7` | 扩展联合类型支持 `'collab'` |
| `V2_BUDGET_WEIGHTS` | `src/main/services/context-engine/types-v2.ts:37-44` | 调整 L5: 0.20→0.15, 新增 L7: 0.05 |
| `ContextAssemblyRequestV2` | `src/main/services/context-engine/types-v2.ts:18-27` | 新增 `unresolvedReferences?: string[]` |
| `WorkspaceMember` | `src/shared/types/member.types.ts:10-17` | 成员类型（id/name/role/avatarUrl） |
| `MemberRole` | `src/shared/types/member.types.ts:8` | `'admin' \| 'editor' \| 'viewer'` |
| `IPC_CHANNELS` | `src/shared/types.ts` | 追加 3 个 Presence 通道常量 |
| `ElectronAPI` | `src/preload/index.ts` | 追加 `presence` 命名空间 |
| `WysiwygEditor` | `src/renderer/components/editor/WysiwygEditor.tsx` | 挂载 PeerPresenceBadge + useEditingPresence |

### 2.4 IPC 通道清单（本任务新增）

| 通道常量 | 通道名 | 方向 | 用途 |
|---------|--------|------|------|
| `PRESENCE_GET_PEERS` | `presence:getPeers` | R→M | 获取所有 peer 状态（经隐私过滤） |
| `PRESENCE_BROADCAST_VIEW` | `presence:broadcastView` | R→M | 上报当前查看文件 |
| `PRESENCE_TOGGLE_BROADCAST` | `presence:toggleBroadcast` | R→M | 开关"广播我的活动" |
| — | `presence:peersUpdated` | M→R | Peer 状态变化推送（节流 1Hz） |

---

## 三、现有代码盘点与差距分析

### 3.1 事件类型（已就绪 ✅）

`event-bus-types.ts` 中已注册全部 4 个 Presence 事件：

| 事件类型 | 载荷类型 | 状态 |
|---------|---------|------|
| `presence.user-online` | `{ userId: string; userName?: string }` | ✅ 已注册 |
| `presence.user-offline` | `{ userId: string }` | ✅ 已注册 |
| `presence.user-editing` | `{ userId: string; userName?: string; filePath: string }` | ✅ 已注册 |
| `presence.user-viewing` | `{ userId: string; userName?: string; filePath: string }` | ✅ 已注册 |

**无需修改** — 事件类型已由 TASK001 和 TASK006 步骤注册完毕。

### 3.2 ContextEngine v2 层结构（需修改 ⚠️）

**现有 `types-v2.ts`:**

```typescript
export type ContextLayerTypeV2 =
  | 'always' | 'ai-mode' | 'memory' | 'skill' | 'cross-source' | 'manual'
// 缺少: 'collab'

export const V2_BUDGET_WEIGHTS: Record<ContextLayerTypeV2, number> = {
  always: 0.30, 'ai-mode': 0.10, memory: 0.15,
  skill: 0.15, 'cross-source': 0.20, manual: 0.10,
}
// L5 = 0.20，需降为 0.15，新增 collab: 0.05
```

**缺口：**
- `ContextLayerTypeV2` 联合类型缺少 `'collab'`
- `V2_BUDGET_WEIGHTS` 缺少 `collab: 0.05`，L5 需从 `0.20` 改为 `0.15`
- `ContextAssemblyRequestV2` 缺少 `unresolvedReferences?: string[]`

### 3.3 ContextEngine 主文件（需修改 ⚠️）

**现有 `context-engine.ts`（1370 行）:**
- `assembleContextV2()` 方法已实现 L1-L6 六层
- 无 `collabContextProvider` 属性
- 无 `setCollabContextProvider()` 方法
- `assembleContextV2()` 中无 L7 注入逻辑

**缺口：**
- 需新增 `collabContextProvider: CollabContextProvider | null = null` 属性
- 需新增 `setCollabContextProvider(provider)` 方法
- 需在 `assembleContextV2()` 中 L6 处理完成后追加 L7 逻辑
- 需读取 L5 预算使用量，确保总权重 = 1.0

### 3.4 IPC 通道（需扩展 ⚠️）

**现有 `shared/types.ts` IPC_CHANNELS:**
- 已有通知(`NOTIFICATION_*`)、焦点模式(`FOCUS_*`) 等通道
- **缺少** Presence 相关的 3 个通道常量
- `IPCChannelMap` 类型需追加对应签名

**现有 `preload/index.ts` ElectronAPI:**
- 已有 `notifications`、`focusMode` 等命名空间
- **缺少** `presence` 命名空间（getPeers / broadcastView / toggleBroadcast）
- `ALLOWED_CHANNELS` 列表需追加 4 个通道

### 3.5 WorkspaceMemberDirectory（不存在 ❌）

任务文档引用 `workspace-member-directory.ts`，但实际代码库中**不存在此文件**。

成员管理通过 IPC 直接调用 `workspace.getMembers()` 实现，成员类型定义在 `src/shared/types/member.types.ts`。

**决策：** `CollabContextProvider` 的成员名匹配功能改为：
- 通过 IPC 获取 `WorkspaceMember[]`（复用已有 `workspace.getMembers()`）
- 在 `CollabContextProvider` 构造函数中注入成员获取函数 `() => Promise<WorkspaceMember[]>`
- 不创建独立的 `WorkspaceMemberDirectory` 服务类

### 3.6 编辑器组件（需扩展 ⚠️）

**实际文件：** `WysiwygEditor.tsx`（非 `Editor.tsx`）

- 已有 Tiptap 编辑器 + 扩展体系
- 已有 `useAutoSave` hook 模式
- **缺少** `<PeerPresenceBadge />` 挂载点
- **缺少** `useEditingPresence` hook

### 3.7 完全缺失的文件

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/main/services/presence/` 目录 | **不存在** | 需创建整个目录 |
| `src/main/services/presence/types.ts` | **不存在** | 新建 |
| `src/main/services/presence/constants.ts` | **不存在** | 新建 |
| `src/main/services/presence/presence-client.ts` | **不存在** | 新建 |
| `src/main/services/presence/presence-store.ts` | **不存在** | 新建 |
| `src/main/services/presence/privacy-filter.ts` | **不存在** | 新建 |
| `src/main/services/context-engine/collab-context-provider.ts` | **不存在** | 新建 |
| `src/main/ipc/handlers/presence.ts` | **不存在** | 新建 |
| `src/renderer/store/presenceStore.ts` | **不存在** | 新建 |
| `src/renderer/components/presence/` 目录 | **不存在** | 需创建整个目录 |
| `src/renderer/components/presence/PeerPresenceBadge.tsx` | **不存在** | 新建 |
| `src/renderer/components/presence/TeamPanel.tsx` | **不存在** | 新建 |
| `src/renderer/components/presence/PeerStatusIcon.tsx` | **不存在** | 新建 |
| `src/renderer/components/editor/useEditingPresence.ts` | **不存在** | 新建 |

---

## 四、分步实施计划

### 阶段 A：Presence 类型系统与常量（Step 1） — 预计 0.3 天

#### A1：创建 Presence 类型定义

**文件：** `src/main/services/presence/types.ts`（新建）

```typescript
export type PresenceStatus = 'online' | 'idle' | 'offline'

export interface PeerState {
  userId: string
  displayName: string
  avatar: string
  status: PresenceStatus
  viewingFile?: string
  isEditing: boolean
  lastActiveAt: number
}

export interface SelfState {
  userId: string
  status: PresenceStatus
  viewingFile?: string
  isEditing: boolean
  broadcastEnabled: boolean
}

export interface PresenceMessage {
  type: 'heartbeat' | 'state-change' | 'bye'
  payload: PeerState | SelfState
  timestamp: number
}

export interface PresenceConfig {
  serviceUrl: string
  heartbeatIntervalMs: number
  idleTimeoutMs: number
  editingTimeoutMs: number
  viewUpdateDebounceMs: number
  reconnectMaxRetries: number
  reconnectBaseDelayMs: number
  broadcastEnabled: boolean
}

export interface FilteredPeerState {
  userId: string
  displayName: string
  avatar: string
  status: PresenceStatus
  viewingFile?: string
  isEditing: boolean
  lastActiveAt: number
}
```

#### A2：创建 Presence 常量

**文件：** `src/main/services/presence/constants.ts`（新建）

```typescript
import type { PresenceConfig } from './types'

export const DEFAULT_PRESENCE_CONFIG: PresenceConfig = {
  serviceUrl: '',
  heartbeatIntervalMs: 5000,
  idleTimeoutMs: 300000,
  editingTimeoutMs: 10000,
  viewUpdateDebounceMs: 500,
  reconnectMaxRetries: 5,
  reconnectBaseDelayMs: 1000,
  broadcastEnabled: true,
}

export const COLLAB_KEYWORDS = [
  '队友', '团队', '刚才', '协作', '谁改了', '谁在', '一起', '大家', '成员',
] as const

export const COLLAB_CONTEXT_BUDGET_RATIO = 0.05

export const ACTIVITY_WINDOW_MS = 30 * 60 * 1000

export const PEER_TTL_MS = 30000

export const PRESENCE_MAX_PEERS = 100
```

**验证：** TypeScript 编译通过，类型与 `event-bus-types.ts` 中的 `EventPayloadMap` 一致。

---

### 阶段 B：PresenceStore 内存状态管理（Step 3） — 预计 0.5 天

#### B1：实现 PresenceStore

**文件：** `src/main/services/presence/presence-store.ts`（新建）

**核心职责：** 内存中的 peer 状态映射，LRU + TTL 自动过期，事件发射。

**设计要点：**

1. 内部数据结构：`Map<userId, PeerState>`（最大容量 100）
2. TTL 过期扫描：每 30 秒遍历 Map，`lastActiveAt` 超过 30 秒且 status !== offline → 标记 offline + 发射 `presence.user-offline`
3. `updatePeer(peerState)` — 新增或更新 peer，记录状态变化
4. `removePeer(userId)` — 设置 status = offline
5. `getPeers()` — 返回所有非 offline 的 peer
6. `getOnlineMembers()` — 返回 status === 'online' 的 peer
7. `getPeersViewingFile(filePath)` — 过滤 viewingFile === filePath 的 peer
8. `getPeerById(userId)` — 单个查询
9. `setServiceAvailable(available)` — 更新服务可用性标志
10. `clear()` — 清空 Map，发射所有在线 peer 的 `presence.user-offline`
11. `shutdown()` — 清理定时器 + clear

**事件发射逻辑（关键）：**

```
updatePeer() 被调用时:
  ├── peer 不存在（新上线）→ PresenceClient 负责发射 presence.user-online
  ├── status 从 online/idle → offline → emit presence.user-offline
  ├── isEditing false → true → emit presence.user-editing
  └── viewingFile 变化 → emit presence.user-viewing
```

**验证：** 状态更新正确、过期清理正确、查询过滤正确。

---

### 阶段 C：PrivacyFilter 隐私过滤（Step 4） — 预计 0.3 天

#### C1：实现 PrivacyFilter

**文件：** `src/main/services/presence/privacy-filter.ts`（新建）

**核心方法：**

1. `redactPath(filePath?)` — `personal/` 和 `.env` 前缀的路径替换为 `[personal-redacted]`
2. `filterPeerStateForViewer(peerState, viewerRole)` — Viewer 角色 `viewingFile` 设为 undefined + `isEditing` 设为 false；Admin 可见所有
3. `shouldBroadcastViewingFile(userRole, broadcastEnabled)` — Viewer 或关闭广播时返回 false
4. `filterActivityEvents(events, forUserId)` — `personal/` 路径且不属于当前用户时 redact

**设计要点：**
- 构造函数接收可选的 `getMemberRole(userId: string): MemberRole` 函数
- 纯函数设计，无副作用，便于单元测试
- `PERSONAL_PATH_PREFIXES` 常量：`['personal/', '.env']`

**验证：** personal/ 路径正确脱敏、Viewer 角色正确隐藏 viewingFile。

---

### 阶段 D：PresenceClient WebSocket/SSE 客户端（Step 2） — 预计 1 天

#### D1：实现 PresenceClient

**文件：** `src/main/services/presence/presence-client.ts`（新建）

**核心架构：**

```
PresenceClient
  ├── 连接管理
  │   ├── connect(workspaceId, userId, token) → WebSocket 优先
  │   ├── _setupWebSocket(url) → WebSocket 连接
  │   ├── _setupSSE(url) → SSE 降级连接
  │   └── disconnect() → 发送 bye + 关闭连接
  │
  ├── 心跳与重连
  │   ├── 心跳定时器 5s 间隔
  │   ├── 空闲检测定时器 5min
  │   ├── _reconnect() → 指数退避 1s/2s/4s/8s/16s
  │   └── 3 次连续心跳失败触发重连
  │
  ├── 状态广播
  │   ├── broadcastState(partial) → 发送 PresenceMessage
  │   ├── updateViewingFile(filePath) → 防抖 500ms
  │   ├── setEditing(isEditing) → 10s 自动恢复
  │   └── 隐私过滤：broadcastEnabled=false 时隐藏 viewingFile/isEditing
  │
  └── 消息处理
      └── _handleMessage(message)
          ├── heartbeat → 更新 lastActiveAt
          ├── state-change → 更新 PresenceStore + 发射事件
          └── bye → peer 主动下线
```

**降级策略（关键）：**

```
WebSocket 连接失败
  → 降级尝试 SSE 连接（EventSource）
    → SSE 也失败
      → 标记 _serviceAvailable = false
      → 通知 PresenceStore.setServiceAvailable(false)
      → UI 显示"团队感知已离线"
```

**依赖注入：**
- 构造函数接收 `PresenceConfig`、`AppEventBus`、`PresenceStore`、`PrivacyFilter`
- `Tracer` 可选（Presence 行为进 Trace span）

**验证：** 连接建立 < 3 秒、心跳正确、重连指数退避、降级到 SSE、状态广播防抖 500ms。

---

### 阶段 E：CollabContextProvider L7 协作上下文层（Step 5-6） — 预计 1 天

#### E1：实现 CollabContextProvider

**文件：** `src/main/services/context-engine/collab-context-provider.ts`（新建）

**依赖注入：**
```typescript
constructor(
  private readonly presenceStore: PresenceStore,
  private readonly eventLogStore: EventLogStore,
  private readonly getMembers: () => Promise<WorkspaceMember[]>,
  private readonly privacyFilter: PrivacyFilter,
)
```

**`shouldInject(userMessage: string): boolean` — 三级检测：**

1. 关键词检测：`/(队友|团队|刚才|协作|谁改了|谁在|一起|大家|成员)/.test(userMessage)`
2. 成员名匹配：遍历 `getMembers()` 返回值，检查 `userMessage.includes(member.name)`
3. 冲突上下文检查：当前对话是否引用了 `collab.conflict` 类型通知（由上层传入）

均不匹配 → return false（零开销，不调用 LLM）

**`collect(request, budget): CollabContext` — 数据收集与裁剪：**

```
collect(request, budgetForL7)
  ├── PresenceStore.getOnlineMembers() → 在线成员列表
  ├── EventLogStore.read(currentMonth) → 过滤最近 30 分钟事件
  │   ├── 类型: file.updated / git.conflict-detected / presence.user-editing
  │   └── 时间: since = Date.now() - ACTIVITY_WINDOW_MS
  ├── PrivacyFilter.filterActivityEvents() → personal/ 路径脱敏
  ├── 预算裁剪: 5% of totalBudget → 超限时从最旧的活动事件开始截断
  ├── 成员名匹配: 提取 @xxx 和中文人名 → 未匹配的放入 unresolvedReferences
  └── 异常处理: catch → return { layers: [] }（graceful degradation）
```

**返回格式：**

```typescript
interface CollabContext {
  layers: ContextLayerV2[]
  unresolvedReferences?: string[]
}
```

#### E2：集成到 ContextEngine v2

**文件：** `src/main/services/context-engine/context-engine.ts`（修改）

**变更 1 — 新增属性和方法：**

```typescript
private collabContextProvider: CollabContextProvider | null = null

setCollabContextProvider(provider: CollabContextProvider): void {
  this.collabContextProvider = provider
}
```

**变更 2 — assembleContextV2() 中追加 L7（L6 之后）：**

```typescript
if (this.collabContextProvider) {
  try {
    const shouldInject = this.collabContextProvider.shouldInject(request.userMessage)
    if (shouldInject) {
      const budgetForL7 = Math.floor(totalBudget * COLLAB_CONTEXT_BUDGET_RATIO)
      const collabContext = await this.collabContextProvider.collect(request, budgetForL7)
      if (collabContext.layers.length > 0) {
        layers.push(...collabContext.layers)
      }
    }
  } catch (err) {
    logger.warn('L7 collab context failed, skipping', { error: err })
  }
}
```

**文件：** `src/main/services/context-engine/types-v2.ts`（修改）

**变更 3 — 扩展类型：**

```typescript
export type ContextLayerTypeV2 =
  | 'always' | 'ai-mode' | 'memory' | 'skill'
  | 'cross-source' | 'manual' | 'collab'  // 新增

export const V2_BUDGET_WEIGHTS = {
  always: 0.30, 'ai-mode': 0.10, memory: 0.15,
  skill: 0.15, 'cross-source': 0.15, manual: 0.10, collab: 0.05,
} as const
```

**验证：** L7 注入逻辑正确、L5 权重调整后总权重 100%、L7 失败不影响 L1-L6、`assembleContextV2()` 现有签名不变。

---

### 阶段 F：IPC Handlers 与 Preload 扩展（Step 7） — 预计 0.5 天

#### F1：实现 Presence IPC Handlers

**文件：** `src/main/ipc/handlers/presence.ts`（新建）

**Handler 清单：**

| Handler | 通道 | 实现 |
|---------|------|------|
| `handleGetPeers` | `presence:getPeers` | `presenceStore.getPeers()` → 对每个 peer 应用 `privacyFilter.filterPeerStateForViewer()` |
| `handleBroadcastView` | `presence:broadcastView` | 隐私检查 → `presenceClient.updateViewingFile(filePath)` |
| `handleToggleBroadcast` | `presence:toggleBroadcast` | 更新 `PresenceConfig.broadcastEnabled` |

**M→R 推送：**
- `presence:peersUpdated` — PresenceStore 状态变化时推送，节流 1Hz（超过 20 人在线时）

#### F2：扩展 shared/types.ts

追加 `IPC_CHANNELS` 常量：
```typescript
PRESENCE_GET_PEERS: 'presence:getPeers',
PRESENCE_BROADCAST_VIEW: 'presence:broadcastView',
PRESENCE_TOGGLE_BROADCAST: 'presence:toggleBroadcast',
```

追加 `IPCChannelMap` 类型签名。

#### F3：扩展 preload/index.ts

追加 `presence` 命名空间：
```typescript
presence: {
  getPeers: () => safeInvoke<FilteredPeerState[]>(IPC_CHANNELS.PRESENCE_GET_PEERS),
  broadcastView: (filePath: string | undefined) =>
    safeInvoke<void>(IPC_CHANNELS.PRESENCE_BROADCAST_VIEW, { filePath }),
  toggleBroadcast: (enabled: boolean) =>
    safeInvoke<void>(IPC_CHANNELS.PRESENCE_TOGGLE_BROADCAST, { enabled }),
  onPeersUpdated: (callback: (peers: FilteredPeerState[]) => void) => {
    const handler = (_: IpcRendererEvent, peers: FilteredPeerState[]) => callback(peers)
    ipcRenderer.on('presence:peersUpdated', handler)
    return () => ipcRenderer.off('presence:peersUpdated', handler)
  },
},
```

追加 `ALLOWED_CHANNELS` 注册。

**验证：** IPC 通道类型安全注册、隐私过滤在 IPC 层生效、推送节流正确。

---

### 阶段 G：渲染进程 Store 与 UI 组件（Step 8） — 预计 1.5 天

#### G1：创建 presenceStore.ts

**文件：** `src/renderer/store/presenceStore.ts`（新建）

```typescript
interface PresenceState {
  peers: FilteredPeerState[]
  isServiceAvailable: boolean
  isLoading: boolean
}

interface PresenceActions {
  fetchPeers: () => Promise<void>
  setPeers: (peers: FilteredPeerState[]) => void
  setServiceAvailable: (available: boolean) => void
  getPeersViewingFile: (filePath: string) => FilteredPeerState[]
}
```

**设计要点：**
- 使用 `devtools` 中间件
- `fetchPeers()` 调用 `window.electronAPI.presence.getPeers()`
- 初始化时注册 `onPeersUpdated` 监听，自动更新 `peers`
- `reset()` 时清理监听器
- `getPeersViewingFile` 作为 derived selector，供 PeerPresenceBadge 使用

#### G2：PeerStatusIcon.tsx

**文件：** `src/renderer/components/presence/PeerStatusIcon.tsx`（新建）

- Props：`{ status: PresenceStatus; size?: 'sm' | 'md' }`
- online: 8px 绿色圆点 (#10B981) + 脉冲动画
- idle: 8px 黄色圆点 (#F59E0B)
- offline: 8px 灰色圆点 (#9CA3AF) 半透明

#### G3：PeerPresenceBadge.tsx

**文件：** `src/renderer/components/presence/PeerPresenceBadge.tsx`（新建）

- Props：`{ filePath: string }`
- 从 `presenceStore.getPeersViewingFile(filePath)` 获取同时查看该文件的成员
- 圆形头像组（最多 3 个，超过显示 "+N"）
- hover 展开显示成员名和状态
- framer-motion 入场动画（淡入缩放）
- 空列表时不渲染（不占位）

#### G4：TeamPanel.tsx

**文件：** `src/renderer/components/presence/TeamPanel.tsx`（新建）

- 顶部标题"团队" + 在线人数
- 成员列表：头像 + 姓名 + PeerStatusIcon + 最后活动时间
- 可选显示 viewingFile（受隐私过滤控制）
- 点击 viewingFile → 打开该文件
- 排序：online > idle > offline，同状态按姓名排序
- 底部设置："广播我的活动"开关 + "团队感知已离线"提示
- 超过 20 人在线时节流 UI 更新到 1Hz

#### G5：useEditingPresence.ts

**文件：** `src/renderer/components/editor/useEditingPresence.ts`（新建）

- 监听 Tiptap `editor.on('update')` 事件
- 设置 `isEditing = true`，10 秒后恢复为 `false`
- 通过 `window.electronAPI.presence.broadcastEditing(true/false)` 上报
- 清理时 `clearTimeout` + 恢复 isEditing = false

#### G6：WysiwygEditor.tsx 修改

**文件：** `src/renderer/components/editor/WysiwygEditor.tsx`（修改）

- 编辑器右上角 absolute 定位挂载 `<PeerPresenceBadge filePath={filePath} />`
- z-index 高于编辑内容但不遮挡工具栏
- mount 时 `window.electronAPI.presence.broadcastView(filePath)`
- unmount 时 `window.electronAPI.presence.broadcastView(undefined)`
- 内部挂载 `useEditingPresence(editor)`

**验证：** PeerPresenceBadge 显示正确、TeamPanel 状态正确、编辑状态上报正确、隐私过滤在 UI 层生效。

---

## 五、验收标准追踪

### Presence 客户端

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 3 秒内连接并广播 online | D1 PresenceClient.connect() | 连接测试 |
| 2 | 心跳 5 秒，3 次连续失败触发重连 | D1 心跳管理 | 重连测试 |
| 3 | viewingFile 更新防抖 500ms | D1 updateViewingFile() | 防抖测试 |
| 4 | isEditing 10 秒自动恢复 false | D1 setEditing() / G5 hook | 编辑超时测试 |
| 5 | 空闲 5 分钟自动 idle | D1 空闲检测定时器 | 空闲测试 |
| 6 | 关闭/workspace 切换 5 秒内广播 offline | D1 disconnect() | 断连测试 |
| 7 | 网络断开 30 秒标记 offline | B1 TTL 过期扫描 | TTL 过期测试 |
| 8 | WebSocket 失败降级 SSE | D1 降级策略 | 降级测试 |
| 9 | SSE 也失败标记不可用 | D1 降级策略 | 服务不可用测试 |
| 10 | 本地编辑不受 Presence 影响 | 架构级隔离 | 独立性验证 |

### Presence 权限与隐私

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | Viewer 的 viewingFile 对他人不可见 | C1 filterPeerStateForViewer() | 隐私过滤测试 |
| 2 | 关闭广播后 viewingFile/isEditing 隐藏 | D1 broadcastState() | 广播控制测试 |
| 3 | Presence 数据传输全程 TLS | 云端服务约束 | — |
| 4 | Presence 不接触文件内容 | 架构级约束 | — |

### Presence UI

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | PeerPresenceBadge 右上角显示同时查看成员 | G3 PeerPresenceBadge | 渲染测试 |
| 2 | 不显示光标位置 | G3 设计约束 | — |
| 3 | TeamPanel 侧边栏列出所有成员状态 | G4 TeamPanel | 渲染测试 |
| 4 | 点击 viewingFile 跳转打开 | G4 TeamPanel | 交互测试 |
| 5 | 超过 20 人在线时节流 1Hz | F1 推送节流 + G4 节流 | 性能测试 |
| 6 | Presence 离线显示"团队感知已离线" | G4 TeamPanel | 离线态测试 |

### Presence 事件

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 上线发射 presence.user-online | D1 _handleMessage() | 事件测试 |
| 2 | 下线发射 presence.user-offline | D1 _handleMessage() | 事件测试 |
| 3 | 开始编辑发射 presence.user-editing | D1 setEditing() | 事件测试 |
| 4 | 切换文件发射 presence.user-viewing | D1 updateViewingFile() | 事件测试 |
| 5 | 4 个事件已注册到 SibyllaEventType | 3.1 已确认 ✅ | — |

### 协作上下文层 L7

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | shouldInject() 正确检测关键词 | E1 shouldInject() | 关键词检测测试 |
| 2 | 成员名匹配触发 L7 | E1 shouldInject() step 2 | 成员名匹配测试 |
| 3 | 冲突通知上下文触发 L7 | E1 shouldInject() step 3 | 冲突上下文测试 |
| 4 | 无协作信号时零开销跳过 | E1 return false | 零开销测试 |
| 5 | collect() 返回在线成员+30min 活动 | E1 collect() | 数据收集测试 |
| 6 | L7 预算 5% 严格执行，超预算截断 | E1 collect() 预算裁剪 | 预算裁剪测试 |
| 7 | PresenceClient 离线时返回空结果 | E1 collect() 异常处理 | 降级测试 |
| 8 | personal/ 路径自动 redact | E1 + C1 filterActivityEvents() | 隐私测试 |
| 9 | unresolvedReferences 字段正确 | E1 collect() step 6 | 引用解析测试 |
| 10 | L5 权重从 20% 调至 15% | E2 types-v2.ts 修改 | 权重验证测试 |
| 11 | L7 失败不影响 L1-L6 | E2 try-catch 包裹 | 隔离性测试 |

### 性能要求

| # | 验收标准 | 目标 | 实现方式 |
|---|---------|------|---------|
| 1 | Presence 状态广播 | < 1s (P95) | WebSocket 即时发送 |
| 2 | 心跳延迟 | < 5s | 5s 间隔定时器 |
| 3 | L7 收集 | < 200ms | 内存查询 + 30min 窗口限制 |
| 4 | UI 渲染节流 | 1Hz (>20 人) | PresenceStore 推送节流 |

### 单元测试（覆盖率目标 ≥ 80%）

| 测试文件 | 覆盖模块 | 关键用例 |
|---------|---------|---------|
| `tests/main/services/presence/presence-client.test.ts` | PresenceClient | 连接/重连/降级/心跳/防抖 |
| `tests/main/services/presence/presence-store.test.ts` | PresenceStore | 状态管理/TTL 过期/LRU 淘汰 |
| `tests/main/services/presence/privacy-filter.test.ts` | PrivacyFilter | 路径脱敏/角色过滤/广播控制 |
| `tests/main/services/context-engine/collab-context-provider.test.ts` | CollabContextProvider | 关键词检测/数据收集/预算裁剪/降级 |
| `tests/main/ipc/handlers/presence-handler.test.ts` | IPC Handler | 通道注册/隐私过滤在 IPC 层 |
| `tests/renderer/store/presenceStore.test.ts` | presenceStore | 状态管理/IPC 事件监听 |
| `tests/renderer/presence/PeerPresenceBadge.test.tsx` | PeerPresenceBadge | 渲染/空列表/头像组 |
| `tests/renderer/presence/TeamPanel.test.tsx` | TeamPanel | 渲染/排序/离线态 |

---

## 六、风险与缓解

| 风险 | 影响 | 概率 | 缓解策略 |
|------|------|------|---------|
| Presence 云端服务未就绪 | 高 | 中 | PresenceClient 设计了完整的降级路径（WS→SSE→离线），全部客户端逻辑可独立测试 |
| WebSocket 库选型冲突 | 中 | 低 | 优先使用 Node.js 内置 `ws`，降级使用原生 `EventSource`，避免引入新依赖 |
| L5 权重调整影响现有搜索质量 | 中 | 低 | L5 从 20% 降至 15%，搜索结果天然可截断；L7 仅在协作语义触发时注入，不会同时占满预算 |
| WorkspaceMemberDirectory 不存在 | 高 | 已确认 | 改用 `() => Promise<WorkspaceMember[]>` 函数注入，复用已有 IPC `workspace.getMembers()` |
| ContextEngine assembleContextV2() 方法体量大(1370 行) | 中 | 中 | 仅在方法末尾追加 L7 逻辑块，使用 try-catch 隔离，不修改现有 L1-L6 代码 |
| WysiwygEditor 组件结构不匹配任务文档 | 低 | 已确认 | Editor.tsx → WysiwygEditor.tsx，挂载点为外围组件而非 Tiptap 扩展，适配简单 |
| 超过 20 人在线时 UI 渲染卡顿 | 中 | 低 | PresenceStore 推送节流 1Hz + Zustand selector 浅比较 + React.memo |
| L7 协作关键词误触发 | 低 | 中 | 关键词列表保守设计，仅包含明确协作语义词汇；后续可通过记忆系统学习用户偏好优化 |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 |
|----|------|--------|
| Day 1 上午 | A1-A2 | types.ts + constants.ts |
| Day 1 下午 | B1 | PresenceStore 完整实现 + 单元测试 |
| Day 2 上午 | C1 | PrivacyFilter 完整实现 + 单元测试 |
| Day 2 下午 | D1 | PresenceClient 完整实现（连接/心跳/重连/降级） |
| Day 3 上午 | D1 续 | PresenceClient 单元测试 |
| Day 3 下午 | E1-E2 | CollabContextProvider + ContextEngine v2 集成 |
| Day 4 上午 | F1-F3 | IPC Handlers + shared/types + preload 扩展 |
| Day 4 下午 | G1-G6 | presenceStore + 全部 UI 组件 |
| Day 5 上午 | — | L7 单元测试 + 集成测试 |
| Day 5 下午 | — | 全量验证 + 修复 |

---

## 八、涉及文件变更汇总

### 新建文件（12 个）

| 文件路径 | 说明 |
|---------|------|
| `src/main/services/presence/types.ts` | Presence 类型定义 |
| `src/main/services/presence/constants.ts` | 常量与默认配置 |
| `src/main/services/presence/presence-client.ts` | WebSocket/SSE 客户端 |
| `src/main/services/presence/presence-store.ts` | 内存状态管理 |
| `src/main/services/presence/privacy-filter.ts` | 隐私过滤器 |
| `src/main/services/context-engine/collab-context-provider.ts` | L7 协作上下文 |
| `src/main/ipc/handlers/presence.ts` | IPC handlers |
| `src/renderer/store/presenceStore.ts` | Zustand store |
| `src/renderer/components/presence/PeerPresenceBadge.tsx` | 编辑器头像组 |
| `src/renderer/components/presence/TeamPanel.tsx` | 团队面板 |
| `src/renderer/components/presence/PeerStatusIcon.tsx` | 状态图标 |
| `src/renderer/components/editor/useEditingPresence.ts` | 编辑状态 hook |

### 修改文件（5 个）

| 文件路径 | 变更内容 |
|---------|---------|
| `src/main/services/context-engine/types-v2.ts` | ContextLayerTypeV2 追加 `'collab'`；V2_BUDGET_WEIGHTS L5 降至 0.15 + 新增 collab 0.05 |
| `src/main/services/context-engine/context-engine.ts` | 新增 collabContextProvider 属性 + setCollabContextProvider() + assembleContextV2() 中 L7 逻辑 |
| `src/shared/types.ts` | IPC_CHANNELS 追加 3 个通道 + IPCChannelMap 类型签名 |
| `src/preload/index.ts` | 追加 presence 命名空间 + ALLOWED_CHANNELS |
| `src/renderer/components/editor/WysiwygEditor.tsx` | 挂载 PeerPresenceBadge + useEditingPresence + broadcastView |

### 不修改的文件

| 文件路径 | 原因 |
|---------|------|
| `src/main/services/event-bus-types.ts` | 4 个 presence.* 事件已注册，无需修改 |
| `src/main/services/event-log-store.ts` | 仅调用其 read() 方法 |
| `src/main/services/event-bus.ts` | 仅调用其 emitEvent()/subscribe() |
| `src/shared/types/member.types.ts` | 仅复用 WorkspaceMember/MemberRole 类型 |

---

**文档版本**: v1.0
**最后更新**: 2026-04-30
**维护者**: Sibylla 架构团队
