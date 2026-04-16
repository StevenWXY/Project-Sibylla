# 自动同步 Push/Pull

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK006 |
| **任务标题** | 自动同步 Push/Pull |
| **所属阶段** | Phase 1 - MVP 核心功能（Sprint 2） |
| **优先级** | P0 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

在 Phase 0 SyncManager 和 GitAbstraction 远程同步基础之上，实现完整的自动同步闭环。包括 30 秒周期性 push/pull、离线模式完善、网络恢复即时同步、并发防护、以及与 AutoSaveManager 的事件联动。

### 背景

需求 2.2 要求："作为用户，我希望文件自动同步到云端，不需要手动操作。" Phase 0 TASK011 已实现 `push()`/`pull()`/`sync()` 和指数退避重试。TASK012 已搭建 SyncManager 的定时同步框架。本任务需要在以下方面进行升级：

1. **网络状态精细监听**：结合 Electron 的 `powerMonitor` 和 Node.js 网络检测，实现可靠的在线/离线判断
2. **网络恢复即时同步**：断网恢复后 5 秒内触发同步，而非等待下一个 30 秒周期
3. **SyncManager 与 AutoSaveManager 联动**：AutoSaveManager commit 后可触发即时同步
4. **同步并发防护**：确保同时只有一个 sync 操作在执行

这直接落实 CLAUDE.md 的"本地优先"原则：离线可编辑保存，联网自动同步。

### 范围

**包含：**
- SyncManager 升级：网络恢复即时同步
- AutoSaveManager 事件联动（commit 后触发同步）
- 网络状态监听器升级（Electron powerMonitor + net 模块）
- 同步并发防护锁机制
- IPC 同步状态事件推送
- 离线模式下本地操作不受影响的保证

**不包含：**
- 同步状态 UI 组件（TASK007）
- 冲突解决界面（TASK008）
- 版本历史浏览（TASK009）

## 技术要求

### 技术栈

- **SyncManager** — Phase 0 已有框架（`src/main/services/sync-manager.ts`）
- **GitAbstraction** — Phase 0 已有 push/pull/sync（`src/main/services/git-abstraction.ts`）
- **AutoSaveManager** — TASK005 新建（`src/main/services/auto-save-manager.ts`）
- **Electron** — `powerMonitor`、`net` 模块用于网络/电源状态检测
- **TypeScript strict mode**
- **Vitest** — 单元测试

### 架构设计

```
主进程 (Main Process)
├── src/main/services/
│   ├── sync-manager.ts              # 升级：完善同步调度逻辑
│   ├── auto-save-manager.ts         # TASK005 新建：发出 committed 事件
│   └── network-monitor.ts           # 新增：网络状态监控服务
└── src/main/ipc/handlers/
    └── sync.handler.ts              # 新增：同步相关 IPC 处理器
```

#### 核心类型定义

```typescript
// src/main/services/types/sync-manager.types.ts

/** Sync status enum for UI display */
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'conflict' | 'error'

/** Detailed sync state */
export interface SyncState {
  readonly status: SyncStatus
  readonly lastSyncedAt?: number
  readonly error?: string
  readonly pendingCommits?: number
  readonly conflictFiles?: readonly string[]
}

/** Sync manager configuration */
export interface SyncManagerConfig {
  /** Sync interval in milliseconds (default: 30000) */
  readonly syncIntervalMs: number
  /** Immediate sync delay after reconnect in milliseconds (default: 5000) */
  readonly reconnectSyncDelayMs: number
  /** Max concurrent sync operations (default: 1) */
  readonly maxConcurrentSyncs: number
}
```

### 实现细节

#### 子任务 6.1：NetworkMonitor 网络状态监控

```typescript
// src/main/services/network-monitor.ts

export class NetworkMonitor extends EventEmitter {
  private isOnline: boolean = true
  private checkInterval: NodeJS.Timeout | null = null

  constructor(
    private readonly checkUrl: string = 'https://api.sibylla.io/health'
  ) {
    super()
  }

  start(): void {
    this.checkOnlineStatus()
    this.checkInterval = setInterval(
      () => this.checkOnlineStatus(),
      10000
    )
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
  }

  getIsOnline(): boolean {
    return this.isOnline
  }

  private async checkOnlineStatus(): Promise<void> {
    const wasOnline = this.isOnline

    try {
      const response = await fetch(this.checkUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      })
      this.isOnline = response.ok
    } catch {
      this.isOnline = false
    }

    if (wasOnline !== this.isOnline) {
      this.emit('status-changed', this.isOnline)
      if (this.isOnline) {
        this.emit('reconnected')
      } else {
        this.emit('disconnected')
      }
    }
  }
}
```

**设计决策**：
- 使用轻量级 HEAD 请求检测网络连通性，而非依赖 `navigator.onLine`（Electron 主进程无此 API）
- 10 秒轮询检测 + 状态变化事件
- `reconnected` 事件用于触发即时同步

#### 子任务 6.2：SyncManager 升级

在 Phase 0 SyncManager 框架上增加网络恢复即时同步和 AutoSaveManager 联动：

```typescript
// src/main/services/sync-manager.ts (升级)

export class SyncManager extends EventEmitter {
  private syncState: SyncState = { status: 'idle' }
  private syncLock: boolean = false
  private syncTimer: NodeJS.Timeout | null = null
  private readonly config: SyncManagerConfig

  constructor(
    config: SyncManagerConfig,
    private readonly gitAbstraction: GitAbstraction,
    private readonly networkMonitor: NetworkMonitor
  ) {
    super()
    this.config = config
    this.setupEventListeners()
  }

  start(): void {
    this.networkMonitor.start()

    this.syncTimer = setInterval(
      () => this.scheduledSync(),
      this.config.syncIntervalMs
    )
  }

  stop(): void {
    this.networkMonitor.stop()
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
    }
  }

  /**
   * Connect AutoSaveManager's committed event to trigger sync.
   */
  connectAutoSaveManager(autoSaveManager: AutoSaveManager): void {
    autoSaveManager.on('committed', () => {
      this.scheduleImmediateSync()
    })
  }

  private setupEventListeners(): void {
    this.networkMonitor.on('reconnected', () => {
      setTimeout(
        () => this.scheduledSync(),
        this.config.reconnectSyncDelayMs
      )
    })

    this.networkMonitor.on('disconnected', () => {
      this.updateState({ status: 'offline' })
    })
  }

  /**
   * Schedule an immediate sync (debounced).
   * Called when AutoSaveManager commits changes.
   */
  private scheduleImmediateSync(): void {
    if (!this.networkMonitor.getIsOnline()) return
    setTimeout(() => this.scheduledSync(), 2000)
  }

  private async scheduledSync(): Promise<void> {
    if (this.syncLock) return
    if (!this.networkMonitor.getIsOnline()) {
      this.updateState({ status: 'offline' })
      return
    }

    this.syncLock = true
    this.updateState({ status: 'syncing' })

    try {
      const result = await this.gitAbstraction.sync()

      if (result.success) {
        this.updateState({
          status: 'synced',
          lastSyncedAt: Date.now()
        })
      } else if (result.hasConflicts) {
        this.updateState({
          status: 'conflict',
          conflictFiles: result.conflicts
        })
      } else {
        this.updateState({
          status: 'error',
          error: result.error
        })
      }
    } catch (error) {
      this.updateState({
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      this.syncLock = false
    }
  }

  private updateState(partial: Partial<SyncState>): void {
    this.syncState = { ...this.syncState, ...partial }
    this.emit('state-changed', this.syncState)
  }
}
```

**关键设计**：
- `syncLock` 确保同时只有一个 sync 操作，防止并发导致冲突
- `connectAutoSaveManager()` 方法松耦合连接 AutoSaveManager，避免硬依赖
- 网络恢复后 5 秒触发同步，AutoSaveManager commit 后 2 秒触发同步
- 所有状态变更通过 `state-changed` 事件推送，供 IPC 层转发

#### 子任务 6.3：IPC 同步通道

```typescript
// src/main/ipc/handlers/sync.handler.ts (新增)

export function registerSyncHandlers(
  ipcMain: Electron.IpcMain,
  syncManager: SyncManager,
  mainWindow: Electron.BrowserWindow | null
): void {
  // Manual force sync
  ipcMain.handle('sync:force', async (): Promise<IPCResponse<SyncResult>> => {
    try {
      const result = await syncManager.forceSync()
      return { success: true, data: result }
    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Sync failed',
          type: 'SYNC_ERROR'
        }
      }
    }
  })

  // Get current sync state
  ipcMain.handle('sync:getState', (): SyncState => {
    return syncManager.getState()
  })

  // Push state changes to renderer
  syncManager.on('state-changed', (state: SyncState) => {
    mainWindow?.webContents.send('sync:stateChanged', state)
  })
}
```

**IPC 通道一览：**

| IPC 通道 | 方向 | 参数 | 返回值 | 说明 |
|---------|------|------|--------|------|
| `sync:force` | Renderer → Main | — | `IPCResponse<SyncResult>` | 手动强制同步 |
| `sync:getState` | Renderer → Main | — | `SyncState` | 获取当前同步状态 |
| `sync:stateChanged` | Main → Renderer | — | `SyncState` | 同步状态变更推送 |

#### 子任务 6.4：Electron 电源事件处理

```typescript
// 在 SyncManager 中增加电源事件监听

import { powerMonitor } from 'electron'

private setupPowerListeners(): void {
  powerMonitor.on('resume', () => {
    logger.info('[SyncManager] System resumed from sleep')
    setTimeout(() => this.scheduledSync(), 3000)
  })

  powerMonitor.on('suspend', () => {
    logger.info('[SyncManager] System suspending')
    // 系统休眠前不做特殊处理，本地 commit 已保证安全
  })
}
```

系统从休眠恢复后 3 秒触发同步，确保长时间离线后的数据一致性。

#### 子任务 6.5：Preload API 扩展

```typescript
// src/preload/index.ts (扩展)
sync: {
  force: () => safeInvoke('sync:force'),
  getState: () => safeInvoke('sync:getState'),
  onStateChanged: (callback: (state: SyncState) => void) =>
    ipcRenderer.on('sync:stateChanged', (_, state) => callback(state)),
}
```

### 数据模型

无新增数据库模型。复用 SyncState 和 SyncResult 类型。

### API 规范

见上方 IPC 通道一览表。

## 验收标准

### 功能完整性

> 以下标准直接追溯自需求 2.2。

- [ ] 在线状态下每 30 秒自动 push/pull（需求 2.2 AC1、AC2）
- [ ] 断网时本地操作正常，状态栏显示"离线"（需求 2.2 AC3）
- [ ] 网络恢复后 5 秒内自动同步（需求 2.2 AC4）
- [ ] 同步进行中状态栏显示"同步中 ↻"（需求 2.2 AC5）
- [ ] 同步完成后状态栏显示"已同步 ✓"（需求 2.2 AC6）
- [ ] 同步失败时状态栏显示"同步失败 ⚠"并提供重试（需求 2.2 AC7）

### 性能指标

- [ ] 同步周期 30 秒（可配置）
- [ ] 网络恢复后 5 秒内触发同步
- [ ] AutoSaveManager commit 后 2 秒内触发同步
- [ ] 空同步（无变更）耗时 < 1.5 秒
- [ ] 同步期间应用不卡顿

### 用户体验

- [ ] 用户无需手动触发同步
- [ ] 离线时编辑体验与在线一致
- [ ] 同步失败有清晰错误提示
- [ ] 系统休眠恢复后自动恢复同步

### 代码质量

- [ ] TypeScript strict mode 无错误
- [ ] ESLint 检查通过
- [ ] 所有公共函数有 JSDoc 注释
- [ ] 代码审查通过

## 测试标准

### 单元测试

**测试覆盖率目标：** ≥ 80%

**关键测试用例：**

1. **定时同步测试**
   - 使用 Vitest fake timers 推进 30 秒
   - 预期：gitAbstraction.sync() 被调用
   - 边界条件：sync 未完成时下一个周期到达

2. **并发防护测试**
   - 模拟 sync 执行耗时 10 秒
   - 在第 5 秒触发另一次 scheduledSync
   - 预期：第二次调用被跳过（syncLock = true）

3. **网络恢复即时同步测试**
   - 模拟断网 → 模拟恢复
   - 预期：5 秒后触发 sync
   - 边界条件：恢复后立即有新的 commit

4. **AutoSaveManager 联动测试**
   - 模拟 AutoSaveManager 发出 committed 事件
   - 预期：2 秒后 SyncManager 触发同步

5. **离线模式测试**
   - NetworkMonitor 报告离线
   - 预期：scheduledSync 不执行，状态显示 offline
   - 边界条件：离线期间 AutoSaveManager 继续本地 commit

6. **状态变更事件测试**
   - 验证 sync:stateChanged 事件在各种场景下正确发出
   - 状态序列：idle → syncing → synced / error / conflict

### 集成测试

**测试场景：**

1. 完整链路：AutoSaveManager commit → SyncManager 检测 → GitAbstraction.push() → 验证远程仓库更新
2. 网络恢复：模拟断网 → 本地编辑 → 恢复网络 → 验证同步自动执行
3. 冲突场景：模拟 pull 返回冲突 → 验证状态变更为 conflict → 验证 conflictFiles 正确传递

## 依赖关系

### 前置依赖

- [x] PHASE0-TASK010（Git 抽象层基础）— 本地 Git 操作
- [x] PHASE0-TASK011（Git 远程同步）— push/pull/sync 接口
- [x] PHASE0-TASK012（自动保存机制）— SyncManager 框架
- [x] PHASE1-TASK005（自动保存与隐式提交）— AutoSaveManager committed 事件

### 被依赖任务

- PHASE1-TASK007（同步状态 UI）— 依赖本任务的 IPC 状态事件
- PHASE1-TASK008（冲突检测与合并）— 依赖本任务检测到的冲突

### 阻塞风险

- 网络监控在不同操作系统上行为可能不一致
- Electron powerMonitor 在某些 Linux 发行版上可能不可用

## 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 网络状态检测不准确 | 中 | 中 | 多重检测策略：主动探测 + 文件系统事件 + Electron API |
| 系统休眠后同步时间不准 | 低 | 中 | powerMonitor resume 事件 + 延迟执行 |
| 并发同步导致数据损坏 | 高 | 低 | syncLock 机制确保单线程执行 |
| 大仓库首次同步耗时过长 | 中 | 中 | 使用浅克隆（depth 限制），分批同步 |

### 时间风险

网络状态检测的边缘 case 调试可能超出预期。建议优先完成核心同步链路，网络监听作为增量优化。

### 资源风险

无额外依赖。

## 参考文档

- [`CLAUDE.md`](../../../CLAUDE.md) — 项目规范（"本地优先"、"Git 不可见"）
- [`specs/design/architecture.md`](../../design/architecture.md) — 系统架构（数据流概览）
- [`specs/design/data-and-api.md`](../../design/data-and-api.md) — IPC 接口定义
- [`specs/requirements/phase1/sprint2-git-sync.md`](../../requirements/phase1/sprint2-git-sync.md) — 需求 2.2
- [isomorphic-git Skill](../../../../.kilocode/skills/phase0/isomorphic-git-integration/SKILL.md)
- [Electron IPC Skill](../../../../.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md)
- `src/main/services/sync-manager.ts` — Phase 0 SyncManager
- `src/main/services/git-abstraction.ts` — Phase 0 GitAbstraction

## 实施计划

### 第 1 步：定义同步类型接口

- 创建 `src/main/services/types/sync-manager.types.ts`
- 定义 `SyncStatus`、`SyncState`、`SyncManagerConfig`
- 预计耗时：1 小时

### 第 2 步：实现 NetworkMonitor

- 创建 `src/main/services/network-monitor.ts`
- 实现网络状态轮询检测
- 实现 reconnected/disconnected 事件
- 预计耗时：2 小时

### 第 3 步：升级 SyncManager 核心

- 重构 SyncManager，注入 NetworkMonitor 依赖
- 实现 syncLock 并发防护
- 实现 connectAutoSaveManager() 联动
- 实现 scheduleImmediateSync() 延迟同步
- 预计耗时：4 小时

### 第 4 步：电源事件与边缘 case

- 集成 Electron powerMonitor
- 处理系统休眠/恢复
- 处理应用启动后首次同步
- 预计耗时：2 小时

### 第 5 步：IPC 通道注册

- 创建 `src/main/ipc/handlers/sync.handler.ts`
- 注册 sync:force、sync:getState 通道
- 实现 sync:stateChanged 事件推送
- 扩展 Preload API
- 预计耗时：2 小时

### 第 6 步：测试编写

- NetworkMonitor 单元测试
- SyncManager 单元测试（fake timers）
- 并发防护测试
- 联动测试
- 确保 ≥ 80% 覆盖率
- 预计耗时：4 小时

## 完成标准

**本任务完成的标志：**

1. 30 秒自动同步 push/pull 正常工作
2. 断网时本地操作不受影响，状态显示"离线"
3. 网络恢复后 5 秒内自动同步
4. AutoSaveManager commit 后触发即时同步
5. 并发同步被正确防护
6. 同步状态通过 IPC 实时推送
7. 单元测试覆盖率 ≥ 80%

**交付物：**

- [ ] `src/main/services/network-monitor.ts`（新增）
- [ ] `src/main/services/types/sync-manager.types.ts`（新增）
- [ ] `src/main/services/sync-manager.ts`（升级）
- [ ] `src/main/ipc/handlers/sync.handler.ts`（新增）
- [ ] `src/preload/index.ts`（扩展）
- [ ] `src/shared/types.ts`（扩展：IPC 通道常量）
- [ ] 对应的测试文件

## 备注

- 网络检测使用主动 HTTP 探测，而非 DNS 检测，避免 DNS 缓存导致误判
- 首次同步可在 SyncManager.start() 时延迟 5 秒触发，避免应用启动时阻塞
- 后续可扩展：WebSocket 长连接推送（服务端主动通知有新变更）

---

**创建时间：** 2026-04-17
**最后更新：** 2026-04-17
**更新记录：**
- 2026-04-17 — 创建任务文档
