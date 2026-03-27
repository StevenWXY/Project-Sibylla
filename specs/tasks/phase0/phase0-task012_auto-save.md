# 自动保存机制实现

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE0-TASK012 |
| **任务标题** | 自动保存机制实现 |
| **所属阶段** | Phase 0 - 基础设施搭建 |
| **优先级** | P0 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

实现一套防抖、自动化的文件保存、提交与同步机制。确保用户在编辑文件时，系统能够在后台静默地将变更保存到本地 Git 仓库，并定期将本地仓库同步到远端 Gitea 托管服务器。该机制的实现将彻底隐藏传统的 Git 操作，为用户提供"持续保存"且"无感知"的版本控制体验。

### 背景

`CLAUDE.md` 第二节设计哲学指出："客户端在离线状态下必须可正常编辑和保存，联网后自动同步。"；"UI/UX 红线：AI 输出涉及文件修改时，必须展示 diff 预览，禁止静默写入。"

此外，系统架构描述数据流概览：
- 用户编辑文件
- 自动保存 - 防抖 1 秒
- git add + commit
- auto push - 30 秒间隔

基于前面的 TASK008 (FileManager)、TASK010 (基础 Git) 和 TASK011 (远程同步)，本任务需要实现将这三者粘合起来的自动调度层 `SyncManager`。

### 范围

**包含：**
- 文件保存后的防抖提交机制（`git add` + `commit`）
- 定时同步调度器（定期调用 `sync()`）
- `SyncManager` 类的设计与实现
- `IPC` 与前端状态同步（同步状态指示器）
- 网络在线/离线状态监测处理

**不包含：**
- 云端冲突处理的解决 UI 界面（交由 Phase 1）
- 人为强制触发同步 UI（如果前端未实现对应组件）

## 技术要求

### 技术栈

- **TypeScript:** 强类型封装
- **Node.js内置:** `timers/promises`，`events`
- **electron:** `ipcMain`, `net` 用于检测离线/在线状态

### 架构设计

新增 `SyncManager` 类，作为后台服务在主进程运行：

```typescript
// src/main/services/sync-manager.ts

export interface SyncManagerConfig {
  readonly workspaceDir: string
  readonly saveDebounceMs?: number  // 默认 1000 ms
  readonly syncIntervalMs?: number  // 默认 30000 ms
}

export class SyncManager extends EventEmitter {
  private fileManager: FileManager
  private gitAbstraction: GitAbstraction
  
  private saveDebounceMs: number
  private syncIntervalMs: number
  
  private syncTimer: NodeJS.Timeout | null = null
  private saveTimeouts: Map<string, NodeJS.Timeout> = new Map()
  
  private isOnline: boolean = true
  private isSyncing: boolean = false
  
  constructor(
    config: SyncManagerConfig, 
    fileManager: FileManager, 
    gitAbstraction: GitAbstraction
  )
  
  // 启动与停止
  public start(): void
  public stop(): void
  
  // 提供给 FileManager 触发
  public notifyFileChanged(filepath: string): void
  
  // 提供手动触发入口
  public async forceSync(): Promise<SyncResult>
  
  // 内部防抖提交逻辑
  private async autoCommitFile(filepath: string): Promise<void>
  
  // 定时器内部轮询同步逻辑
  private async scheduledSync(): Promise<void>
  
  // 监听网络状态变化
  private setupNetworkListeners(): void
}
```

### 实现细节

#### 关键实现点

1. **防抖与自动提交 (1秒延迟)**
   ```typescript
   public notifyFileChanged(filepath: string): void {
     // 如果已有定时器，清除
     if (this.saveTimeouts.has(filepath)) {
       clearTimeout(this.saveTimeouts.get(filepath)!)
     }
     
     // 重新设定定时器
     const timeout = setTimeout(async () => {
       this.saveTimeouts.delete(filepath)
       await this.autoCommitFile(filepath)
     }, this.saveDebounceMs)
     
     this.saveTimeouts.set(filepath, timeout)
   }
   
   private async autoCommitFile(filepath: string): Promise<void> {
     try {
       // 通过 FileManager 检查文件是否存在
       const exists = await this.fileManager.exists(filepath)
       if (!exists) return
       
       // 调用 Git 抽象层
       await this.gitAbstraction.stageFile(filepath)
       
       // 生成友好的提交信息，例如 "Auto-save: docs/requirements.md"
       const message = `Auto-save: ${filepath}`
       await this.gitAbstraction.commit(message)
       
       logger.debug(`[SyncManager] Auto-committed ${filepath}`)
     } catch (error) {
       logger.error(`[SyncManager] Auto-commit failed for ${filepath}: ${error.message}`)
     }
   }
   ```

2. **定期同步调度 (30秒轮询)**
   ```typescript
   public start(): void {
     if (this.syncTimer) return
     
     this.setupNetworkListeners()
     
     this.syncTimer = setInterval(async () => {
       await this.scheduledSync()
     }, this.syncIntervalMs)
     
     logger.info(`[SyncManager] Started with ${this.syncIntervalMs}ms interval`)
   }
   
   private async scheduledSync(): Promise<void> {
     // 离线状态或者正在同步中时跳过
     if (!this.isOnline || this.isSyncing) return
     
     // 检查是否有提交（可以调用 gitAbstraction.getHistory 快速判断）
     // 或者直接调用 sync
     
     try {
       this.isSyncing = true
       this.emit('sync:start')
       
       const result = await this.gitAbstraction.sync()
       
       if (result.success) {
         this.emit('sync:success')
       } else if (result.hasConflicts) {
         // 处理冲突状态，通知前端
         this.emit('sync:conflict', result.conflicts)
       } else {
         this.emit('sync:error', new Error(result.error))
       }
     } catch (error) {
       this.emit('sync:error', error)
     } finally {
       this.isSyncing = false
       this.emit('sync:end')
     }
   }
   ```

3. **IPC 状态推送**
   主进程中，将 `SyncManager` 的事件暴露给前端，以便 UI 显示：
   ```typescript
   // src/main/ipc/handlers/sync.handler.ts (新 IPC 处理器)
   
   syncManager.on('sync:start', () => {
     windowManager.broadcast('sync-status-changed', { status: 'syncing' })
   })
   
   syncManager.on('sync:success', () => {
     windowManager.broadcast('sync-status-changed', { status: 'synced', timestamp: Date.now() })
   })
   
   syncManager.on('sync:conflict', (conflicts) => {
     windowManager.broadcast('sync-status-changed', { status: 'conflict', files: conflicts })
   })
   
   syncManager.on('sync:error', (error) => {
     windowManager.broadcast('sync-status-changed', { status: 'error', message: error.message })
   })
   ```

### API 规范

IPC 层面需要新增/扩展频道：
- `ipc:sync:force` () -> `Promise<SyncResult>`
- 发送事件给前端的频道：`sync-status-changed`

## 验收标准

### 功能完整性

- [ ] 文件内容发生改变后（且不再改变）的 1 秒钟后，触发对该文件的 `stageFile` 和 `commit`
- [ ] 如果在这 1 秒钟内文件被再次编辑，延迟将重置
- [ ] 每间隔 30 秒（可配置），系统在后台执行一次 `sync()`
- [ ] 只有在网络在线的情况下才执行自动 `sync`
- [ ] 系统能通过 IPC 向前端发送当前的同步状态（`synced`, `syncing`, `conflict`, `error`）
- [ ] 调用 `stop()` 方法时能正确清理所有定时器

### 性能指标

- [ ] 防抖计数器和定期检查不应造成 CPU 占用异常
- [ ] 确保即使在高频保存时，后台的 Node/Git 进程不会产生内存泄漏
- [ ] 同步中（`isSyncing = true`）若周期时间达到，不会重复发起 `sync` 调用（防并发）

### 用户体验

- [ ] 在前端（模拟界面）能够通过事件感知并更新右下角/左下角的"已同步"、"同步中..."图标

### 代码质量

- [ ] `SyncManager` 具有清晰的事件发送逻辑和生命周期控制
- [ ] 所有类和公共方法都有 JSDoc 注释
- [ ] 单元测试通过，尤其是定时器的 Mock（如使用 Jest/Vitest 的 Fake Timers）

## 测试标准

### 单元测试

1. **防抖逻辑测试**
   - 连续调用多次 `notifyFileChanged` 只有最后一次被触发
   - 延迟达到设定阈值后，`gitAbstraction.commit` 被正确调用，且传入的文件路径正确

2. **自动同步调度测试**
   - 验证周期定时器正常工作
   - 验证如果前一个 `sync()` 还未解决，定时器到达时不会发出重复的 `sync()` 调用
   - 验证在 `isOnline = false` 时不调用 `sync()`

### 集成测试

- 整合 `FileManager`, `GitAbstraction`, 和 `SyncManager`，启动一个临时项目。通过 `FileManager` 写入文件，推进模拟时钟（Fake Timers），确认 Git 仓库内成功生成对应提交并尝试推送。

## 依赖关系

### 前置依赖

- ✅ PHASE0-TASK008 - 文件管理器实现（文件变更事件的触发源）
- ✅ PHASE0-TASK010 - Git 抽象层基础实现（依赖 Git 操作）
- ✅ PHASE0-TASK011 - Git 远程同步实现（提供 `sync` 接口与状态）

### 被依赖任务

- Phase 1 UI 状态栏接入（前端显示同步状态）

## 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 并发修改导致的问题 | 中 | 中 | 通过 `FileManager` 配合队列原子写入；`isSyncing` 锁机制防止并行 Git 进程 |
| Windows 系统下进程阻塞 | 中 | 低 | 监控定时器负载，确保 isomorphic-git 不独占 CPU 主线程过长时间（可能后续需放入 Worker） |
| Electron 应用休眠或网络恢复的监听不准 | 低 | 中 | 结合 `electron.powerMonitor` 和 `navigator.onLine` 来增强在线判断 |

## 实施计划

1. **类结构定义与基础事件开发**（0.5天）
   - 创建 `sync-manager.ts` 和对应的配置接口
   - 集成 Node 的 EventEmitter
2. **防抖机制集成**（0.5天）
   - 开发 `notifyFileChanged` 及对应的 setTimeout 清理与调度逻辑
3. **定时调度及锁机制开发**（1天）
   - 开发 `start()` 和 `stop()` 逻辑
   - 实现 `isSyncing` 并发防御，并在内部合理调用 `gitAbstraction.sync()`
4. **IPC 对接与测试**（1天）
   - 在主进程注入 `SyncManager` 到 `WorkspaceManager` 或对应的上下文
   - 编写 IPC 桥接
   - 编写 Vitest fake timers 测试用例
   - 处理遗漏边缘情况

## 备注

为了最小化对已有模块的侵入式修改：
- `FileManager` 不需要感知 `SyncManager`，只需要提供文件写完的事件给主应用 (`index.ts` 或专门的协调器)，再由主应用调用 `SyncManager.notifyFileChanged(path)`。或者，修改 `FileWatcher` 模块通过事件派发变更消息给 `SyncManager`，这是解耦最好的做法。