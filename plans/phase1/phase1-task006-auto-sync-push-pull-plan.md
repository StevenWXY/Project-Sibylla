# PHASE1-TASK006: 自动同步 Push/Pull — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task006_auto-sync-push-pull.md](../specs/tasks/phase1/phase1-task006_auto-sync-push-pull.md)
> 创建日期：2026-04-17
> 最后更新：2026-04-17

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK006 |
| **任务标题** | 自动同步 Push/Pull |
| **优先级** | P0 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **前置依赖** | ✅ Phase0 SyncManager、✅ Phase0 GitAbstraction push/pull/sync、✅ Phase0 SyncHandler IPC、✅ TASK005 AutoSaveManager `committed` 事件 |

### 目标

在 Phase 0 SyncManager 和 GitAbstraction 远程同步基础之上，实现完整的自动同步闭环。包括 30 秒周期性 push/pull、离线模式完善、网络恢复即时同步（5 秒内）、系统休眠恢复同步、AutoSaveManager 联动、以及同步并发防护。

### 核心命题

CLAUDE.md "本地优先"原则的直接实现——离线可编辑保存，联网自动同步。同时落实"Git 不可见"——用户只看到同步状态图标，不看到任何 Git 术语。

### 范围边界

**包含：**
- NetworkMonitor：独立网络状态监控服务（HEAD 探测 + 事件发射）
- SyncManager 升级：网络恢复即时同步、AutoSaveManager 联动、并发防护强化
- Electron powerMonitor 集成：系统休眠/恢复事件处理
- SyncHandler IPC 扩展：`sync:getState` 通道、状态推送完善
- Preload API 扩展：`sync.getState()` / `sync.onStateChanged()`

**不包含：**
- 同步状态 UI 组件（TASK007）
- 冲突解决界面（TASK008）
- 版本历史浏览（TASK009）

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 路径 | 关键约束 |
|------|------|---------|
| 项目宪法 | `CLAUDE.md` | TypeScript 严格模式禁止 any；本地优先；Git 不可见；注释英文/commit 中文；主进程与渲染进程严格隔离；所有异步操作必须有错误处理；关键操作结构化日志 |
| 系统架构 | `specs/design/architecture.md` | 渲染进程禁止直接访问文件系统；IPC 通信严格隔离；数据流：编辑器→防抖1秒→Git add+commit→auto push 30秒间隔 |
| UI/UX 规范 | `specs/design/ui-ux-design.md` | >2s 操作需进度反馈；文件丢失不可接受 |
| 数据模型与 API | `specs/design/data-and-api.md` | IPC 通信模式：invoke/handle + send/on；类型安全 IPCChannelMap |
| 需求规格 | `specs/requirements/phase1/sprint2-git-sync.md` | 需求 2.2 七条验收标准：30秒 push/pull、离线继续操作、5秒恢复同步、状态显示 |
| 任务规格 | `specs/tasks/phase1/phase1-task006_auto-sync-push-pull.md` | 5 个子任务、6 条功能验收标准、6 类测试用例、6 步实施计划 |

### 2.2 Skill 依赖

| Skill | 路径 | 使用场景 |
|-------|------|---------|
| `electron-ipc-patterns` | `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` | `sync:getState` invoke/handle 模式；`sync:stateChanged` webContents.send 推送；类型安全 IPC 扩展；错误处理与超时 |
| `isomorphic-git-integration` | `.kilocode/skills/phase0/isomorphic-git-integration/SKILL.md` | GitAbstraction `sync()` 调用规范；pull + push 合并操作；错误码处理（NOT_INITIALIZED / REMOTE_ERROR） |
| `typescript-strict-mode` | `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` | `SyncState` / `SyncManagerConfig` 严格类型；EventEmitter 类型安全；泛型约束 |
| `zustand-state-management` | `.kilocode/skills/phase1/zustand-state-management/SKILL.md` | 同步状态管理（idle / syncing / synced / offline / error）；selector 优化避免全局重渲染 |

### 2.3 前置代码依赖

| 模块 | 路径 | 行数 | 状态 | 说明 |
|------|------|------|------|------|
| SyncManager | `sibylla-desktop/src/main/services/sync-manager.ts` | 534 | ✅ 已完成 | 提供 `start()/stop()` 生命周期、`scheduledSync()` 定时同步、`forceSync()` 强制同步、`isSyncing` 并发锁、`setNetworkStatus()` 网络状态切换、`enqueueGitOp()` Git 操作串行队列、`notifyFileChanged()` 防抖提交、`status:changed` 事件；**关键缺口：无主动网络探测、无网络恢复即时同步、无 AutoSaveManager 联动、无 powerMonitor 集成** |
| SyncManagerConfig | `sibylla-desktop/src/main/services/types/sync-manager.types.ts` | 79 | ✅ 已完成 | 定义 `SyncManagerConfig`（workspaceDir/saveDebounceMs/syncIntervalMs）、`SyncManagerEvents`（6 个事件类型）；**需扩展：reconnectSyncDelayMs、首次同步延迟配置** |
| GitAbstraction | `sibylla-desktop/src/main/services/git-abstraction.ts` | 2185 | ✅ 已完成 | 提供 `sync()`（pull+push 合并）、`push()`、`pull()`、`stageFile()`、`commit()`；返回 `SyncResult`（success/hasConflicts/conflicts/error） |
| SyncResult 类型 | `sibylla-desktop/src/shared/types.ts` | 883 | ✅ 已完成 | 定义 `SyncResult`（success/hasConflicts/conflicts/error）、`SyncStatus`（6 种状态枚举）、`SyncStatusData`（status/timestamp/message/conflictFiles）、`IPC_CHANNELS.SYNC_FORCE` / `SYNC_STATUS_CHANGED` |
| SyncHandler | `sibylla-desktop/src/main/ipc/handlers/sync.handler.ts` | 130 | ✅ 已完成 | 注册 `sync:force` handle、监听 `status:changed` 广播到渲染进程；**需扩展：`sync:getState` 通道** |
| AutoSaveManager | `sibylla-desktop/src/main/services/auto-save-manager.ts` | 334 | ✅ 已完成 | 发出 `committed` 事件（含 commitOid/files/message）；**本任务需监听此事件触发即时同步** |
| Preload API | `sibylla-desktop/src/preload/index.ts` | 569 | ✅ 已完成 | `sync.force()` / `sync.onStatusChange()`；**需扩展 `sync.getState()`** |
| ElectronNetworkProvider | `sibylla-desktop/src/main/services/sync-manager.ts:79-96` | — | ✅ 已完成 | 使用 `require('electron').net.isOnline()` 检测网络；被动检测（需调用 `isOnline()`）；**缺口：无主动轮询、无状态变化事件** |
| 主进程入口 | `sibylla-desktop/src/main/index.ts` | 293 | ✅ 已完成 | workspace 打开时创建 SyncManager + AutoSaveManager，分别独立运行；**需改造：注入 NetworkMonitor、连接 AutoSaveManager→SyncManager** |
| Logger | `sibylla-desktop/src/main/utils/logger.ts` | — | ✅ 已完成 | 结构化日志 `logger.info()` / `logger.warn()` / `logger.error()` |

### 2.4 被依赖任务

| 任务 | 依赖方式 |
|------|---------|
| PHASE1-TASK007（同步状态 UI） | 依赖本任务的 `sync:stateChanged` IPC 事件推送和 `sync.getState()` API |
| PHASE1-TASK008（冲突检测与合并） | 依赖本任务检测到的 `conflict` 状态和 `conflictFiles` 列表 |

### 2.5 npm 依赖

无需新增 npm 包。所有核心依赖（isomorphic-git、electron、events）已安装。

---

## 三、现有代码盘点与差距分析

### 3.1 现有同步链路详解

> **关键发现：** SyncManager 已有完整的定时同步框架（534 行），但缺少三个关键能力：
> 1. **主动网络状态监控** — 当前仅有被动 `setNetworkStatus()` 方法和 `ElectronNetworkProvider.isOnline()`
> 2. **AutoSaveManager 联动** — SyncManager 和 AutoSaveManager 在 `index.ts` 中独立创建，无事件连接
> 3. **系统电源事件** — 无 `powerMonitor.resume` 休眠恢复处理

**现有数据流（Phase 0）：**

```
FileWatcher.change → SyncManager.notifyFileChanged() → debounce(1s) → stageFile + commit
SyncTimer(30s) → scheduledSync() → [if online && !syncing] → gitAbstraction.sync()
```

**目标数据流（Phase 1 TASK006）：**

```
AutoSaveManager.committed → SyncManager.scheduleImmediateSync() → 2s延迟 → scheduledSync()
NetworkMonitor.reconnected → SyncManager → 5s延迟 → scheduledSync()
powerMonitor.resume → SyncManager → 3s延迟 → scheduledSync()
SyncTimer(30s) → scheduledSync() → [if online && !syncing] → gitAbstraction.sync()
```

### 3.2 SyncManager 现有并发防护评估

SyncManager 已有 `isSyncing` 布尔锁（`sync-manager.ts:133`），`scheduledSync()` 在 `isSyncing=true` 时跳过。此设计已满足需求 2.2 的并发防护要求。但需确认：

- `forceSync()` 在 `isSyncing=true` 时抛出异常而非排队——**正确行为**（用户手动触发应明确失败）
- `scheduledSync()` 在 `isSyncing=true` 时静默跳过——**正确行为**（下一个周期会再尝试）
- `performSync()` 的 `finally` 块重置 `isSyncing=false`——**正确行为**（确保锁释放）

**结论：** 并发防护已完善，本任务无需额外修改锁机制。

### 3.3 网络状态检测差距

| 能力 | 现有 | 缺口 |
|------|------|------|
| 被动检测 `isOnline()` | ✅ `ElectronNetworkProvider` | — |
| 外部调用 `setNetworkStatus()` | ✅ SyncManager 方法 | 无调用者 |
| 主动轮询探测 | ❌ | 需新建 NetworkMonitor |
| 状态变化事件 | ❌ | 需 `reconnected` / `disconnected` 事件 |
| 恢复后即时同步 | ❌ | 需延迟触发机制 |

### 3.4 AutoSaveManager 与 SyncManager 联动差距

当前 `index.ts:161-168` 中 AutoSaveManager 和 SyncManager 分别创建，无任何事件连接：

```typescript
// 现状：两个独立服务
syncManager = new SyncManager(...)
syncManager.start()

autoSaveManager = new AutoSaveManager(...)
fileHandler.setAutoSaveManager(autoSaveManager)
// 缺少：autoSaveManager.committed → syncManager.scheduleImmediateSync()
```

### 3.5 需新建的文件

| # | 文件路径 | 类型 | 说明 |
|---|---------|------|------|
| 1 | `sibylla-desktop/src/main/services/network-monitor.ts` | 新增 | 独立网络状态监控服务，10 秒轮询 + 状态变化事件 |
| 2 | `sibylla-desktop/tests/services/network-monitor.test.ts` | 新增 | NetworkMonitor 单元测试 |

### 3.6 需修改的文件

| # | 文件路径 | 修改内容 | 风险 |
|---|---------|---------|------|
| 1 | `sibylla-desktop/src/main/services/sync-manager.ts` | 新增 `connectAutoSaveManager()` 方法、`scheduleImmediateSync()` 方法、`setupPowerListeners()` 方法；注入 NetworkMonitor 依赖 | 中 — 核心服务变更 |
| 2 | `sibylla-desktop/src/main/services/types/sync-manager.types.ts` | 扩展 `SyncManagerConfig` 新增 `reconnectSyncDelayMs` / `initialSyncDelayMs` | 低 — 纯新增可选字段 |
| 3 | `sibylla-desktop/src/main/ipc/handlers/sync.handler.ts` | 新增 `sync:getState` IPC 通道；扩展 `setSyncManager` 连接更多事件 | 低 — 扩展现有 handler |
| 4 | `sibylla-desktop/src/preload/index.ts` | 新增 `sync.getState()` 方法 | 低 — 扩展 preload API |
| 5 | `sibylla-desktop/src/shared/types.ts` | 新增 `SYNC_GET_STATE` IPC 通道常量；扩展 `IPCChannelMap` | 低 — 纯新增 |
| 6 | `sibylla-desktop/src/main/index.ts` | 注入 NetworkMonitor 到 SyncManager；连接 AutoSaveManager→SyncManager；注册 powerMonitor 事件 | 中 — 服务编排变更 |
| 7 | `sibylla-desktop/tests/services/sync-manager.test.ts` | 扩展测试：网络恢复同步、AutoSave 联动、powerMonitor 恢复 | 低 — 扩展测试 |

### 3.7 NetworkMonitor 与 ElectronNetworkProvider 的职责划分

| 职责 | ElectronNetworkProvider（保留） | NetworkMonitor（新增） |
|------|-------------------------------|----------------------|
| 单次 `isOnline()` 查询 | ✅ 轻量级同步检查 | — |
| 10 秒轮询网络探测 | ❌ | ✅ |
| 状态变化事件发射 | ❌ | ✅ `reconnected` / `disconnected` / `status-changed` |
| HTTP HEAD 连通性验证 | ❌ | ✅ |
| SyncManager 注入 | ✅ 作为 NetworkStatusProvider | ✅ 独立服务 + 事件驱动 |

**设计决策：** NetworkMonitor 作为独立 EventEmitter 服务，不替代 ElectronNetworkProvider。SyncManager 同时持有两者——`ElectronNetworkProvider` 用于 `scheduledSync()` 内快速在线判断，`NetworkMonitor` 用于触发即时同步事件。

---

## 四、类型系统设计

### 4.1 SyncManagerConfig 扩展（sync-manager.types.ts 修改）

```typescript
export interface SyncManagerConfig {
  readonly workspaceDir: string
  readonly saveDebounceMs?: number
  readonly syncIntervalMs?: number
  // ── TASK006 新增 ──
  /** Delay before sync after network reconnects (ms, default: 5000) */
  readonly reconnectSyncDelayMs?: number
  /** Delay before first sync after start() (ms, default: 5000) */
  readonly initialSyncDelayMs?: number
}
```

**设计决策：**
- 新增字段均为可选（`?`），保持向后兼容
- `reconnectSyncDelayMs` 默认 5000，满足需求 2.2 AC4（5 秒内同步）
- `initialSyncDelayMs` 默认 5000，避免应用启动时阻塞

### 4.2 NetworkMonitor 类型（network-monitor.ts 内部定义）

```typescript
export interface NetworkMonitorEvents {
  'status-changed': [isOnline: boolean]
  'reconnected': []
  'disconnected': []
}

export interface NetworkMonitorConfig {
  /** Health check URL for HTTP HEAD probe (default: 'https://api.sibylla.io/health') */
  readonly checkUrl: string
  /** Polling interval in milliseconds (default: 10000) */
  readonly checkIntervalMs: number
  /** Request timeout in milliseconds (default: 5000) */
  readonly requestTimeoutMs: number
}
```

**设计决策：**
- `checkUrl` 可配置，方便测试时替换为本地 mock 服务器
- 10 秒轮询间隔在网络恢复检测的及时性和资源消耗间取得平衡
- 5 秒超时确保探测不会阻塞事件循环

### 4.3 IPC 通道扩展（shared/types.ts 修改）

```typescript
// IPC_CHANNELS 新增
SYNC_GET_STATE: 'sync:getState',

// IPCChannelMap 新增
[IPC_CHANNELS.SYNC_GET_STATE]: { params: []; return: SyncStatusData }
```

---

## 五、NetworkMonitor 服务设计

### 5.1 类结构

```typescript
export class NetworkMonitor extends (EventEmitter as new () => TypedEventEmitter<NetworkMonitorEvents> & EventEmitter) {
  private isOnline: boolean = true
  private checkInterval: ReturnType<typeof setInterval> | null = null
  private readonly config: NetworkMonitorConfig

  constructor(config?: Partial<NetworkMonitorConfig>)
  start(): void
  stop(): void
  getIsOnline(): boolean
  private checkOnlineStatus(): Promise<void>
}
```

### 5.2 核心方法：checkOnlineStatus

```
签名: private async checkOnlineStatus(): Promise<void>

逻辑:
  1. wasOnline = this.isOnline（快照旧状态）
  2. try:
     - response = await fetch(config.checkUrl, { method: 'HEAD', signal: AbortSignal.timeout(config.requestTimeoutMs) })
     - this.isOnline = response.ok
  3. catch:
     - this.isOnline = false
  4. 如果 wasOnline !== this.isOnline:
     - emit('status-changed', this.isOnline)
     - 如果 this.isOnline → emit('reconnected')
     - 否则 → emit('disconnected')
```

**设计决策：**
- 使用轻量级 HTTP HEAD 请求而非 DNS 检测，避免 DNS 缓存导致误判
- `AbortSignal.timeout()` 确保探测不会无限等待
- 状态变化时才发射事件，避免重复通知
- 构造函数接受 `Partial<NetworkMonitorConfig>`，与 AutoSaveConfig 模式一致

### 5.3 生命周期

```
start():
  1. 立即执行一次 checkOnlineStatus()
  2. 启动 setInterval(checkOnlineStatus, config.checkIntervalMs)

stop():
  1. 清除 interval
  2. 保留最后已知的 isOnline 状态（不清除）
```

---

## 六、SyncManager 升级设计

### 6.1 新增依赖注入

SyncManager 构造函数新增可选的 `NetworkMonitor` 参数。保持与现有构造函数签名的兼容（networkMonitor 为可选参数，默认不使用）。

```typescript
constructor(
  config: SyncManagerConfig,
  fileManager: FileManager,
  gitAbstraction: GitAbstraction,
  networkProvider?: NetworkStatusProvider,
  networkMonitor?: NetworkMonitor,  // TASK006 新增
)
```

### 6.2 新增方法：connectAutoSaveManager

```
签名: connectAutoSaveManager(autoSaveManager: AutoSaveManager): void

逻辑:
  autoSaveManager.on('committed', () => {
    this.scheduleImmediateSync()
  })

设计决策:
  - 松耦合：AutoSaveManager 作为参数注入，非构造函数依赖
  - 监听 committed 事件而非 save-failed（失败不需要触发同步）
  - committed 事件包含 files 列表，可用于后续优化（仅 push 有变更的文件）
```

### 6.3 新增方法：scheduleImmediateSync

```
签名: private scheduleImmediateSync(): void

逻辑:
  1. 如果 !this.networkMonitor?.getIsOnline() 且 !this.isOnline → return
  2. setTimeout(() => this.scheduledSync(), 2000)

设计决策:
  - 2 秒延迟给 AutoSaveManager 的 flush 操作留出完成时间
  - scheduledSync 内部的 isSyncing 检查确保不会与定时同步冲突
  - 使用 setTimeout 而非直接调用，避免阻塞 committed 事件处理
```

### 6.4 新增方法：setupNetworkMonitorListeners

```
签名: private setupNetworkMonitorListeners(): void

逻辑:
  如果 this.networkMonitor 存在:
    networkMonitor.on('reconnected', () => {
      logger.info(`${LOG_PREFIX} Network reconnected, scheduling sync`)
      setTimeout(() => this.scheduledSync(), this.reconnectSyncDelayMs)
    })
    networkMonitor.on('disconnected', () => {
      this.isOnline = false
      this.updateStatus('offline')
    })
    networkMonitor.on('status-changed', (online) => {
      this.isOnline = online
    })
```

**关键设计：**
- `reconnected` 事件后延迟 `reconnectSyncDelayMs`（默认 5 秒）触发同步
- `disconnected` 事件立即更新状态为 `offline`，scheduledSync 将自动跳过
- `status-changed` 事件同步 `isOnline` 标志，确保与 NetworkMonitor 状态一致

### 6.5 新增方法：setupPowerListeners

```
签名: private setupPowerListeners(): void

逻辑:
  try:
    const { powerMonitor } = require('electron')
    powerMonitor.on('resume', () => {
      logger.info(`${LOG_PREFIX} System resumed from sleep`)
      setTimeout(() => this.scheduledSync(), 3000)
    })
  catch:
    logger.warn(`${LOG_PREFIX} powerMonitor unavailable (non-Electron environment)`)

设计决策:
  - 使用 require() 动态导入，避免测试环境报错
  - 系统 resume 后 3 秒延迟，给网络适配器恢复时间
  - suspend 事件不做特殊处理（本地 commit 已保证数据安全）
```

### 6.6 start() 方法改造

```
现有逻辑保持不变，新增:
  1. 如果 networkMonitor 存在 → networkMonitor.start()
  2. 调用 setupNetworkMonitorListeners()
  3. 调用 setupPowerListeners()
  4. 如果 config.initialSyncDelayMs > 0:
     setTimeout(() => this.scheduledSync(), config.initialSyncDelayMs)
```

### 6.7 stop() 方法改造

```
现有逻辑保持不变，新增:
  1. 如果 networkMonitor 存在 → networkMonitor.stop()
```

### 6.8 数据流时序（升级后）

```
触发源                         延迟      → scheduledSync() → performSync()
─────────────────────────────────────────────────────────────────────────
SyncTimer (30s 周期)          0ms       → 直接触发
NetworkMonitor.reconnected    5000ms    → 网络恢复后 5 秒
powerMonitor.resume           3000ms    → 休眠恢复后 3 秒
AutoSaveManager.committed     2000ms    → 文件提交后 2 秒
start() 初始同步              5000ms    → 应用启动后 5 秒

scheduledSync() 内部:
  if (!isOnline) → 跳过，状态设为 offline
  if (isSyncing) → 跳过，下一个周期再试
  → performSync() → gitAbstraction.sync() → 更新状态 → 推送 IPC
```

---

## 七、IPC 通道设计与 Preload 扩展

### 7.1 IPC 通道变更总览

| 通道 | 方向 | 模式 | 状态 | 说明 |
|------|------|------|------|------|
| `sync:force` | Renderer → Main | invoke/handle | ✅ 已有 | 手动强制同步 |
| `sync:status-changed` | Main → Renderer | webContents.send | ✅ 已有 | 同步状态变更推送 |
| `sync:getState` | Renderer → Main | invoke/handle | 🆕 新增 | 获取当前同步状态快照 |

**设计决策：** 仅新增一个 IPC 通道。状态变更推送复用现有的 `sync:status-changed` 通道，该通道已在 SyncHandler 中通过监听 `status:changed` 事件实现广播。

### 7.2 SyncHandler 扩展

```typescript
// sync.handler.ts 新增

register(): void {
  // 已有
  ipcMain.handle(IPC_CHANNELS.SYNC_FORCE, this.safeHandle(this.handleForceSync.bind(this)))
  // 新增
  ipcMain.handle(IPC_CHANNELS.SYNC_GET_STATE, this.safeHandle(this.handleGetState.bind(this)))
}

private handleGetState(_event: IpcMainInvokeEvent): SyncStatusData {
  if (!this.syncManager) {
    throw new Error('SyncManager not initialized')
  }
  return {
    status: this.syncManager.getCurrentStatus(),
    timestamp: Date.now(),
  }
}
```

### 7.3 Preload API 扩展

```typescript
// ElectronAPI.sync 命名空间新增
sync: {
  force: () => Promise<IPCResponse<SyncResult>>
  getState: () => Promise<IPCResponse<SyncStatusData>>  // 🆕
  onStatusChange: (callback: (data: SyncStatusData) => void) => () => void
}

// 实现
sync: {
  // ... 现有方法保持不变
  getState: async () => {
    return await safeInvoke<SyncStatusData>(IPC_CHANNELS.SYNC_GET_STATE)
  },
}
```

### 7.4 白名单更新

```typescript
// ALLOWED_CHANNELS 新增
IPC_CHANNELS.SYNC_GET_STATE,
```

---

## 八、主进程入口编排改造

### 8.1 index.ts 变更

**变更范围：** 仅修改 `workspaceHandler.onWorkspaceOpened` 回调内的服务编排逻辑。

```typescript
// 现有代码位置: index.ts:103-196
// 变更点:

// 1. 创建 NetworkMonitor
const networkMonitor = new NetworkMonitor({
  checkUrl: 'https://api.sibylla.io/health',
})

// 2. SyncManager 注入 NetworkMonitor（构造函数新增可选参数）
syncManager = new SyncManager(
  { workspaceDir: workspacePath, saveDebounceMs: 1000, syncIntervalMs: syncInterval * 1000 },
  fileManager,
  gitAbstraction,
  undefined,  // networkProvider（保留 ElectronNetworkProvider 默认）
  networkMonitor,  // TASK006 新增
)

// 3. 连接 AutoSaveManager → SyncManager
autoSaveManager = new AutoSaveManager({}, fileManager, gitAbstraction, authorName)
syncManager.connectAutoSaveManager(autoSaveManager)  // TASK006 新增

// 4. 启动 SyncManager（内部会启动 NetworkMonitor 和 powerMonitor）
syncManager.start()
```

**workspace 关闭时的清理：**

```typescript
// 现有代码已正确处理 stop/destroy
// SyncManager.stop() 内部新增 networkMonitor.stop()
// 无需额外清理
```

---

## 九、分步实施计划

> 共 6 步，每步产出可独立验证的增量。Step 1 为类型基础，Step 2 为新增服务，Step 3 为核心升级，Step 4-5 为 IPC 和编排，Step 6 为测试。

### Step 1：类型定义扩展（预估 1h）

**产出：** 类型文件扩展、IPC 通道常量

**实施内容：**

1. 扩展 `sibylla-desktop/src/main/services/types/sync-manager.types.ts`：
   - `SyncManagerConfig` 新增 `reconnectSyncDelayMs?` / `initialSyncDelayMs?` 可选字段
   - 添加默认值常量 `DEFAULT_RECONNECT_SYNC_DELAY_MS = 5000` / `DEFAULT_INITIAL_SYNC_DELAY_MS = 5000`

2. 扩展 `sibylla-desktop/src/shared/types.ts`：
   - `IPC_CHANNELS` 新增 `SYNC_GET_STATE: 'sync:getState'`
   - `IPCChannelMap` 新增 `[IPC_CHANNELS.SYNC_GET_STATE]` 映射

**验证标准：**
- [ ] `npm run type-check` 通过
- [ ] `npm run lint` 通过

### Step 2：NetworkMonitor 服务实现（预估 2h）

**产出：** `network-monitor.ts` 完整实现

**实施内容：**

1. 创建 `sibylla-desktop/src/main/services/network-monitor.ts`：
   - `NetworkMonitorConfig` 接口 + `DEFAULT_NETWORK_MONITOR_CONFIG` 常量
   - `NetworkMonitorEvents` 事件类型（TypedEventEmitter 模式）
   - `NetworkMonitor` 类：`start()` / `stop()` / `getIsOnline()` / `checkOnlineStatus()`
   - 构造函数接受 `Partial<NetworkMonitorConfig>`

**验证标准：**
- [ ] `npm run type-check` 通过
- [ ] 手动验证：实例化 NetworkMonitor，调用 start()，观察日志输出

### Step 3：SyncManager 核心升级（预估 3h）

**产出：** SyncManager 新增 4 个方法，start/stop 改造

**实施内容：**

1. 修改 `sibylla-desktop/src/main/services/sync-manager.ts`：
   - 构造函数新增 `networkMonitor?: NetworkMonitor` 可选参数
   - 新增 `reconnectSyncDelayMs` / `initialSyncDelayMs` 配置读取
   - 新增 `connectAutoSaveManager(autoSaveManager)` 公开方法
   - 新增 `scheduleImmediateSync()` 私有方法
   - 新增 `setupNetworkMonitorListeners()` 私有方法
   - 新增 `setupPowerListeners()` 私有方法
   - 改造 `start()` — 新增 NetworkMonitor 启动、监听器注册、初始同步
   - 改造 `stop()` — 新增 NetworkMonitor 停止
   - 导入 `AutoSaveManager` 类型（仅用于类型标注，使用 `import type`）

**验证标准：**
- [ ] `npm run type-check` 通过
- [ ] 现有 sync-manager.test.ts 全部通过（无回归）
- [ ] 新增方法可通过手动 DevTools 验证

### Step 4：IPC 通道 + Preload 扩展（预估 1.5h）

**产出：** SyncHandler 扩展、Preload API 扩展

**实施内容：**

1. 修改 `sibylla-desktop/src/main/ipc/handlers/sync.handler.ts`：
   - `register()` 新增 `sync:getState` handle
   - 新增 `handleGetState()` 私有方法
   - `cleanup()` 新增 `sync:getState` 的 removeHandler

2. 修改 `sibylla-desktop/src/preload/index.ts`：
   - `ElectronAPI.sync` 接口新增 `getState` 方法
   - `api.sync` 实现新增 `getState` 调用 `safeInvoke`
   - `ALLOWED_CHANNELS` 新增 `SYNC_GET_STATE`

**验证标准：**
- [ ] `npm run type-check` 通过
- [ ] DevTools 调用 `window.electronAPI.sync.getState()` 返回当前状态

### Step 5：主进程入口编排改造（预估 1.5h）

**产出：** index.ts 服务编排完整闭环

**实施内容：**

1. 修改 `sibylla-desktop/src/main/index.ts`：
   - 导入 `NetworkMonitor`
   - 在 `workspaceHandler.onWorkspaceOpened` 回调中：
     a. 创建 NetworkMonitor 实例
     b. SyncManager 构造函数注入 NetworkMonitor
     c. AutoSaveManager 创建后调用 `syncManager.connectAutoSaveManager(autoSaveManager)`
   - 确保 workspace 关闭和 app quit 时的清理逻辑正确

**验证标准：**
- [ ] 打开 workspace → 5 秒后首次同步触发（日志验证）
- [ ] 编辑文件 → AutoSaveManager commit → 2 秒后同步触发
- [ ] 断网 → 状态变为 offline → 恢复 → 5 秒后同步触发
- [ ] 关闭 workspace → 所有服务正确清理

### Step 6：测试编写（预估 4h）

**产出：** 完整测试套件

**实施内容：**

1. NetworkMonitor 单元测试（新文件 `tests/services/network-monitor.test.ts`）：
   - 初始状态为 online
   - 轮询探测：mock fetch 成功/失败
   - 状态变化事件：offline→online 发射 reconnected
   - 状态变化事件：online→offline 发射 disconnected
   - 无状态变化时不发射事件
   - start/stop 生命周期

2. SyncManager 升级测试（扩展现有 `tests/services/sync-manager.test.ts`）：
   - connectAutoSaveManager → committed 事件 → 2 秒后 scheduledSync
   - NetworkMonitor reconnected → 5 秒后 scheduledSync
   - NetworkMonitor disconnected → 状态更新为 offline
   - 并发防护：AutoSave commit 和定时同步同时触发 → 仅执行一次
   - 离线时 scheduleImmediateSync 不触发
   - start() 初始同步延迟
   - stop() 清理 NetworkMonitor

3. 集成测试（可选，扩展现有 `tests/integration/sync-workflow.test.ts`）：
   - 完整链路：AutoSaveManager commit → SyncManager sync → 状态推送
   - 网络恢复场景模拟

**验证标准：**
- [ ] NetworkMonitor 测试覆盖率 ≥ 80%
- [ ] SyncManager 新增方法测试覆盖率 ≥ 80%
- [ ] `npm run lint` 无警告
- [ ] `npm run type-check` 无错误

---

## 十、验收标准与风险评估

### 10.1 功能验收清单

**需求 2.2 对应验收：**

| # | 验收项 | 需求来源 | 对应 Step | 验证方式 |
|---|--------|---------|----------|---------|
| 1 | 在线状态下每 30 秒自动 push/pull | AC1、AC2 | Step 3 | 现有测试 + 日志时间戳 |
| 2 | 断网时本地操作正常，状态显示"离线" | AC3 | Step 2-3 | 手动断网 + 日志验证 |
| 3 | 网络恢复后 5 秒内自动同步 | AC4 | Step 2-3 | 单元测试（fake timers）+ 手动验证 |
| 4 | 同步进行中状态为"同步中" | AC5 | Step 3（已有） | SyncStatusData 验证 |
| 5 | 同步完成后状态为"已同步" | AC6 | Step 3（已有） | SyncStatusData 验证 |
| 6 | 同步失败时状态为"错误" | AC7 | Step 3（已有） | SyncStatusData 验证 |
| 7 | AutoSaveManager commit 后触发即时同步 | 补充 | Step 3 | 单元测试 + 日志 |
| 8 | 系统休眠恢复后自动同步 | 补充 | Step 3 | 手动休眠/恢复 + 日志 |

### 10.2 性能指标

| # | 指标 | 目标 | 验证方式 |
|---|------|------|---------|
| 1 | 同步周期 | 30 秒（可配置） | 日志时间戳差 |
| 2 | 网络恢复后同步触发 | ≤ 5 秒 | fake timers 测试 |
| 3 | AutoSave commit 后同步触发 | ≤ 2 秒 | fake timers 测试 |
| 4 | 空同步（无变更）耗时 | < 1.5 秒 | 主进程日志 |
| 5 | NetworkMonitor 轮询间隔 | 10 秒 | 配置验证 |
| 6 | HTTP HEAD 探测超时 | 5 秒 | 配置验证 |

### 10.3 代码质量验收

| # | 验收项 | 验证方式 |
|---|--------|---------|
| 1 | TypeScript strict mode 无错误 | `npm run type-check` |
| 2 | ESLint 检查通过 | `npm run lint` |
| 3 | 所有公共函数有 JSDoc 注释 | 代码审查 |
| 4 | NetworkManager + SyncManager 新增代码测试覆盖率 ≥ 80% | Vitest 覆盖率 |
| 5 | 现有测试全部通过 | `npm run test` |

### 10.4 交付物清单

| # | 文件 | 类型 | 状态 |
|---|------|------|------|
| 1 | `sibylla-desktop/src/main/services/network-monitor.ts` | 新增 | 待创建 |
| 2 | `sibylla-desktop/src/main/services/sync-manager.ts` | 更新 | 扩展 4 个方法 + 改造 start/stop |
| 3 | `sibylla-desktop/src/main/services/types/sync-manager.types.ts` | 更新 | 扩展 SyncManagerConfig |
| 4 | `sibylla-desktop/src/main/ipc/handlers/sync.handler.ts` | 更新 | 新增 sync:getState |
| 5 | `sibylla-desktop/src/preload/index.ts` | 更新 | 新增 sync.getState |
| 6 | `sibylla-desktop/src/shared/types.ts` | 更新 | 新增 SYNC_GET_STATE |
| 7 | `sibylla-desktop/src/main/index.ts` | 更改 | 编排改造 |
| 8 | `sibylla-desktop/tests/services/network-monitor.test.ts` | 新增 | 待创建 |
| 9 | `sibylla-desktop/tests/services/sync-manager.test.ts` | 更新 | 扩展测试用例 |

### 10.5 风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| HTTP HEAD 探测在某些网络环境下被拦截 | 中 | 中 | checkUrl 可配置；探测失败视为离线，不影响本地操作 |
| powerMonitor 在某些 Linux 发行版不可用 | 低 | 低 | try/catch 包裹 require('electron').powerMonitor，降级为仅依赖 NetworkMonitor |
| NetworkMonitor 的 10 秒轮询增加网络流量 | 低 | 低 | HEAD 请求极小（< 1KB）；可后续优化为 WebSocket 长连接 |
| AutoSaveManager.committed 与定时同步冲突 | 中 | 低 | scheduledSync 的 isSyncing 锁确保同时只有一个 sync 执行 |
| SyncManager 构造函数签名变更破坏现有调用 | 高 | 低 | networkMonitor 为可选参数，现有调用无需修改 |
| fetch API 在旧版 Electron 中不支持 AbortSignal.timeout | 中 | 低 | 可降级为 AbortController + setTimeout 模式 |

### 10.6 回滚策略

1. `NetworkMonitor` 为独立新增服务，可安全删除
2. `SyncManager` 新增方法均为非破坏性扩展：
   - `connectAutoSaveManager()` — 不调用即不生效
   - `scheduleImmediateSync()` — 仅被 `connectAutoSaveManager` 触发
   - `setupNetworkMonitorListeners()` — networkMonitor 为 null 时跳过
   - `setupPowerListeners()` — require 失败时静默跳过
3. `SyncManagerConfig` 新增字段均为可选，不影响现有配置
4. `SYNC_GET_STATE` IPC 通道为纯新增，不影响现有通道
5. `index.ts` 编排变更为新增代码行，可逐行回退

---

**创建时间：** 2026-04-17
**最后更新：** 2026-04-17
**更新记录：**
- 2026-04-17 — 初始创建
