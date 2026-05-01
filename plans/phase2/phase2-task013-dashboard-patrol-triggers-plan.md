# PHASE2-TASK013: 管理员 Dashboard 与巡检触发器 — 实施计划

> 任务来源：[specs/tasks/phase2/phase2-task013_dashboard-patrol-triggers.md](../../specs/tasks/phase2/phase2-task013_dashboard-patrol-triggers.md)
> 创建日期：2026-05-01
> 最后更新：2026-05-01

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK013 |
| **任务标题** | 管理员 Dashboard 与巡检触发器 |
| **所属阶段** | Phase 2 - 项目管理闭环 (Sprint 6) |
| **优先级** | P1 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | TASK010(看板) + TASK011(决策日志) + TASK012(产出分析) + TASK008(ProactiveEngine) + TASK007(Presence) + TASK006(通知中心) + TASK001(事件总线) + Sprint 3.3(Trace) + Sprint 2(GitAbstraction) |

### 1.1 目标

构建 Sprint 6 的管理员全局视图与 AI 主动巡检能力——四象限 Dashboard 聚合任务进度、成员活跃度、风险预警和产出热力图；三个 PatrolTrigger（risk-task-delay / workload-imbalance / decision-contradiction）以定时巡检模式替代编辑器驱动的 ProactiveEngine 评估，通过 NotificationCenter 推送项目风险预警。

### 1.2 核心设计约束（不可违反）

1. **PatrolTrigger 与现有 Trigger 完全分离**——巡检型不修改 `Trigger` 接口、不修改 `onSnapshot()` 路径、不产出 `SuggestionToast`
2. **PatrolTrigger 通过 NotificationCenter 推送**——产出 `Notification`（类型 `system.suggestion`），而非 SuggestionToast
3. **Dashboard 不引入新数据源**——完全聚合 KanbanService、ProductivityAnalyzer、PresenceService、NotificationCenter、TraceStore、GitAbstraction 的已有接口
4. **30 秒自动刷新无全页面重载**——使用增量数据拉取 + 局部状态更新
5. **非 Admin 用户显示权限提示**——不显示 Dashboard 内容，引导到个人报告
6. **单用户简化视图**——workspace < 2 成员时隐藏团队类 widget，显示简化个人视图

### 1.3 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| PatrolTrigger 类型 | `src/main/services/proactive-engine/types.ts`（扩展） | PatrolTriggerId / PatrolTrigger / PatrolResult |
| 巡检冷却常量 | `src/main/services/proactive-engine/constants.ts`（扩展） | PATROL_TRIGGER_COOLDOWNS / PATROL_* 常量 |
| TriggerRegistry 扩展 | `src/main/services/proactive-engine/trigger-registry.ts`（扩展） | patrol 冷却管理 |
| ProactiveEngine 扩展 | `src/main/services/proactive-engine/index.ts`（扩展） | registerPatrolTrigger / startPatrol / stopPatrol |
| risk-task-delay | `src/main/services/proactive-engine/triggers/risk-task-delay.ts`（新建） | 逾期任务检测 |
| workload-imbalance | `src/main/services/proactive-engine/triggers/workload-imbalance.ts`（新建） | 工作量失衡检测 |
| decision-contradiction | `src/main/services/proactive-engine/triggers/decision-contradiction.ts`（新建） | 决策冲突检测 |
| Dashboard IPC | `src/main/ipc/handlers/dashboard.ts`（新建） | dashboard:overview 聚合 |
| Dashboard Store | `src/renderer/store/dashboardStore.ts`（新建） | Dashboard Zustand store |
| AdminDashboard | `src/renderer/components/dashboard/AdminDashboard.tsx`（新建） | Dashboard 主页面 |
| TaskOverviewCard | `src/renderer/components/dashboard/TaskOverviewCard.tsx`（新建） | 任务概览卡片 |
| RiskAlertCard | `src/renderer/components/dashboard/RiskAlertCard.tsx`（新建） | 风险与建议卡片 |
| MemberActivityCard | `src/renderer/components/dashboard/MemberActivityCard.tsx`（新建） | 成员活跃度卡片 |
| HeatmapCard | `src/renderer/components/dashboard/HeatmapCard.tsx`（新建） | 7 天产出热力图 |
| 事件类型扩展 | `src/main/services/event-bus-types.ts`（扩展） | admin.access-personal-space |
| 单元测试 | `tests/main/services/proactive-engine/patrol/`（新建） | 7 个测试文件 |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；文件即真相；AI 建议人类决策；personal/ 隔离 | 全局约束 |
| `specs/design/architecture.md` | 进程通信架构(§3.2)、IPC 模式 | IPC 设计 |
| `specs/design/ui-ux-design.md` | 色彩体系(#6366F1 主色)、四象限布局、组件规范 | UI 组件设计 |
| `specs/design/testing-and-security.md` | 测试覆盖率≥80%、隐私保护 | 测试与安全 |
| `specs/requirements/phase2/sprint6-task-management.md` | 需求 6.7(管理员 Dashboard)、6.8(AI 项目管理建议)、§2.4(命名空间) | 验收标准 |
| `specs/tasks/phase2/phase2-task013_dashboard-patrol-triggers.md` | 9 步执行路径、全部验收标准 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `electron-ipc-patterns` | Dashboard IPC 设计；M→R 推送；类型安全通道映射 | `dashboard.ts` + `preload/index.ts` |
| `zustand-state-management` | dashboardStore 设计；selector 性能优化；30s 自动刷新 | `src/renderer/store/dashboardStore.ts` |
| `typescript-strict-mode` | PatrolTrigger 类型安全；泛型约束 | 全部 TS 文件 |

### 2.3 前置代码依赖

| 模块 | 实际文件路径 | 复用方式 |
|------|------------|---------|
| `ProactiveEngine` | `sibylla-desktop/src/main/services/proactive-engine/index.ts` | 新增 registerPatrolTrigger / startPatrol / stopPatrol |
| `TriggerRegistry` | `sibylla-desktop/src/main/services/proactive-engine/trigger-registry.ts` | 扩展 patrol 冷却管理 |
| `Trigger` / `TriggerId` / `CooldownRecord` | `sibylla-desktop/src/main/services/proactive-engine/types.ts:1-99` | 不修改，新增 PatrolTrigger 并列 |
| `constants.ts` | `sibylla-desktop/src/main/services/proactive-engine/constants.ts` | 追加 PATROL_* 常量 |
| `NotificationEngine` | `sibylla-desktop/src/main/services/notifications/notification-engine.ts:22-257` | 巡检结果通过 store.create() 创建 system.suggestion 通知 |
| `NotificationStore` | `sibylla-desktop/src/main/services/notifications/notification-store.ts` | getUnread() + getUnreadCount() + getByGroupKey() |
| `NotificationType` | `sibylla-desktop/src/main/services/notifications/types.ts:13` | 复用 `system.suggestion` 类型 |
| `PreferenceLearner` | `sibylla-desktop/src/main/services/notifications/preference-learner.ts:25-151` | 复用偏好学习（patrol action type） |
| `KanbanService` | `sibylla-desktop/src/main/services/kanban/kanban-service.ts` | `parseTasksMd()` 任务统计数据源 |
| `KanbanTask` / `KanbanColumn` | `sibylla-desktop/src/main/services/kanban/types.ts` | 任务结构类型 |
| `DecisionLogger` | `sibylla-desktop/src/main/services/decision/decision-logger.ts` | `list()` 决策日志数据源 |
| `DecisionLog` | `sibylla-desktop/src/main/services/decision/types.ts` | 决策结构类型 |
| `ProductivityAnalyzer` | `sibylla-desktop/src/main/services/productivity/productivity-analyzer.ts` | `analyze()` 产出分数数据源（走缓存） |
| `PresenceService` | TASK007 | `getPeers()` 在线成员数据源 |
| `GitAbstraction` | Sprint 2 | `getHistory()` 提交热力图数据源 |
| `WorkspaceMemberDirectory` | Sprint 2 | 成员列表查询 |
| `AppEventBus` | `sibylla-desktop/src/main/services/event-bus.ts` | 事件订阅与发射 |
| `SibyllaEventType` / `EventPayloadMap` | `sibylla-desktop/src/main/services/event-bus-types.ts` | 追加 admin.access-personal-space |
| `Tracer` | Sprint 3.3 | 巡检行为进 Trace span |
| `IPC_CHANNELS` | `sibylla-desktop/src/shared/types.ts:88-578` | 追加 DASHBOARD_OVERVIEW 常量 |
| `preload/index.ts` | `sibylla-desktop/src/preload/index.ts:187-670` | 新增 dashboard 命名空间 |

### 2.4 IPC 通道清单（本任务新增）

| 通道常量 | 通道名 | 方向 | 用途 |
|---------|--------|------|------|
| `DASHBOARD_OVERVIEW` | `dashboard:overview` | R→M | 聚合 Dashboard 所需全部数据（任务统计 + 成员状态 + 产出数据 + 提交记录 + 待处理建议） |

---

## 三、现有代码盘点与差距分析

### 3.1 ProactiveEngine 核心模块（已就绪 ✅，需扩展 ⚠️）

| 文件 | 状态 | 现有内容 | 本任务变更 |
|------|------|---------|-----------|
| `proactive-engine/types.ts` | ✅ 已实现 | `Trigger` / `TriggerId` / `EditorSnapshot` / `SuggestionDraft` / `CooldownRecord` / `TriggerRegistryDeps`（99 行） | 追加 `PatrolTriggerId` / `PatrolTrigger` / `PatrolResult` 类型定义 |
| `proactive-engine/constants.ts` | ✅ 已实现 | `DEFAULT_TRIGGER_COOLDOWNS` / `MIN/MAX_COOLDOWN` / `DISMISS_ADJUST_COUNT=3` / `ADJUST_WINDOW_HOURS=24` | 追加 `PATROL_TRIGGER_COOLDOWNS` / `DEFAULT_PATROL_INTERVAL_MS` |
| `proactive-engine/trigger-registry.ts` | ✅ 已实现 | 编辑器触发器冷却：`register()` / `isInCooldown()` / `markFired()` / `recordDismiss()` / `recordAccept()` + `_doubleCooldown` / `_halveCooldown`（129 行） | 追加 patrol 冷却 Map + `isPatrolOnCooldown()` / `markPatrolFired()` / `recordPatrolDismiss()` / `recordPatrolAccept()` |
| `proactive-engine/index.ts` | ✅ 已实现 | `ProactiveEngine` 类：`initialize()` 注册 4 个编辑器触发器 + `onSnapshot()` 驱动评估 + `recordSuggestionOutcome()` + `shutdown()`（277 行） | 追加 `patrolTriggers` Map + `registerPatrolTrigger()` / `startPatrol()` / `stopPatrol()` |
| `proactive-engine/interrupt-policy.ts` | ✅ 已实现 | `canInterrupt()` 打断策略 | 不修改 |

### 3.2 数据源服务（已就绪 ✅）

| 服务 | 方法 | 状态 | Dashboard 使用方式 | PatrolTrigger 使用方式 |
|------|------|------|-------------------|----------------------|
| `KanbanService` | `parseTasksMd(workspacePath)` | ✅ TASK010 | → 任务统计 `{ pending, inProgress, completed }` | risk-task-delay: 逾期任务检测 |
| `PresenceService` | `getPeers()` | ✅ TASK007 | → 成员在线状态列表 | — |
| `ProductivityAnalyzer` | `analyze(opts)` | ✅ TASK012 | → 产出分数（走 60s 缓存） | — |
| `GitAbstraction` | `getHistory(options?)` | ✅ Sprint 2 | → 最近 7 天提交记录 | workload-imbalance: 24h commit 统计 |
| `NotificationStore` | `getUnread()` / `getUnreadCount()` | ✅ TASK006 | → 待处理建议数（按 type 筛选） | — |
| `DecisionLogger` | `list(filters?)` | ✅ TASK011 | — | decision-contradiction: 决策日志对比 |
| `PreferenceLearner` | `checkAndSuggestMute()` | ✅ TASK006 | — | 巡检偏好学习复用 |

### 3.3 事件类型（需扩展 ⚠️）

`event-bus-types.ts` 当前包含 69 个事件类型（含 TASK010-012 新增的 kanban/decision/report 事件）。

**缺口：** 缺少 `admin.access-personal-space` 事件类型和对应的 `EventPayloadMap` 条目。

### 3.4 IPC 通道与 Preload（需扩展 ⚠️）

- `shared/types.ts` IPC_CHANNELS 已有 kanban / decision / report / productivity / presence 通道，缺少 `DASHBOARD_OVERVIEW` 常量
- `preload/index.ts` ElectronAPI 已有对应命名空间，缺少 `dashboard` 命名空间
- `ALLOWED_CHANNELS` 列表需追加 `DASHBOARD_OVERVIEW` 通道名
- NotificationStore 缺少按 `type` 筛选 unread 的方法，需新增或通过现有 `getUnread()` 返回后客户端过滤

### 3.5 完全缺失的文件

| 文件 | 说明 |
|------|------|
| `src/main/services/proactive-engine/triggers/risk-task-delay.ts` | 逾期任务检测 PatrolTrigger |
| `src/main/services/proactive-engine/triggers/workload-imbalance.ts` | 工作量失衡检测 PatrolTrigger |
| `src/main/services/proactive-engine/triggers/decision-contradiction.ts` | 决策冲突检测 PatrolTrigger |
| `src/main/ipc/handlers/dashboard.ts` | Dashboard 数据聚合 IPC handler |
| `src/renderer/store/dashboardStore.ts` | Dashboard Zustand store |
| `src/renderer/components/dashboard/AdminDashboard.tsx` | Dashboard 主页面 |
| `src/renderer/components/dashboard/TaskOverviewCard.tsx` | 任务概览卡片 |
| `src/renderer/components/dashboard/RiskAlertCard.tsx` | 风险与建议卡片 |
| `src/renderer/components/dashboard/MemberActivityCard.tsx` | 成员活跃度卡片 |
| `src/renderer/components/dashboard/HeatmapCard.tsx` | 7 天产出热力图 |
| `tests/main/services/proactive-engine/patrol/` | 单元测试目录（7 个测试文件） |

---

## 四、分步实施计划

### 阶段 A：PatrolTrigger 类型扩展 + 事件类型 + 常量 — 预计 0.3 天

#### A1：新增 PatrolTrigger 类型定义

**文件：** `sibylla-desktop/src/main/services/proactive-engine/types.ts`（修改）

在文件末尾（第 99 行 `TriggerRegistryDeps` 之后）追加：

```typescript
export type PatrolTriggerId =
  | 'risk-task-delay'
  | 'workload-imbalance'
  | 'decision-contradiction'

export interface PatrolTrigger {
  id: PatrolTriggerId
  description: string
  enabled: boolean
  cooldownMs: number
  evaluate(): Promise<PatrolResult | null>
}

export interface PatrolResult {
  title: string
  detail: string
  actions: Array<{ id: string; label: string }>
  audience: string[]
  priority: NotificationPriority
  groupKey: string
}
```

需新增 import：从 `../notifications/types` 引入 `NotificationPriority`（值：`'urgent' | 'high' | 'normal' | 'low'`）。

**零破坏保证：** 新增类型与现有 `Trigger` / `TriggerId` / `EditorSnapshot` 完全并列，不修改任何已有类型。

#### A2：新增 admin.access-personal-space 事件类型

**文件：** `sibylla-desktop/src/main/services/event-bus-types.ts`（修改）

1. 在 `SibyllaEventType` 联合类型（第 69 行 `| 'report.generated'` 之后）追加：

```typescript
| 'admin.access-personal-space'
```

2. 在 `EventPayloadMap`（第 148 行 `'report.generated'` 之后）追加：

```typescript
'admin.access-personal-space': { adminId: string; targetUser: string; timestamp: number }
```

**零破坏保证：** 新增事件类型不影响现有事件订阅。

#### A3：新增 Patrol 常量

**文件：** `sibylla-desktop/src/main/services/proactive-engine/constants.ts`（修改）

追加以下常量：

```typescript
export const PATROL_TRIGGER_COOLDOWNS: Record<PatrolTriggerId, number> = {
  'risk-task-delay': 4 * 60 * 60 * 1000,
  'workload-imbalance': 8 * 60 * 60 * 1000,
  'decision-contradiction': 24 * 60 * 60 * 1000,
}

export const DEFAULT_PATROL_INTERVAL_MS = 30 * 60 * 1000
export const PATROL_MIN_COOLDOWN_RATIO = 0.5
```

需新增 import：`PatrolTriggerId` from `./types`。

**验证：** TypeScript 编译通过。

---

### 阶段 B：扩展 TriggerRegistry 支持 Patrol 冷却 — 预计 0.5 天

#### B1：新增 Patrol 冷却存储与方法

**文件：** `sibylla-desktop/src/main/services/proactive-engine/trigger-registry.ts`（修改）

1. 新增导入：`PatrolTriggerId` from `./types`，`PATROL_TRIGGER_COOLDOWNS` / `PATROL_MIN_COOLDOWN_RATIO` from `./constants`

2. 新增私有属性：

```typescript
private readonly patrolCooldowns = new Map<PatrolTriggerId, CooldownRecord>()
private readonly patrolDismissCounts = new Map<PatrolTriggerId, AdjustWindow>()
private readonly patrolAcceptCounts = new Map<PatrolTriggerId, AdjustWindow>()
```

3. 新增方法（6 个）：

| 方法 | 签名 | 实现 |
|------|------|------|
| `registerPatrol` | `(trigger: { id: PatrolTriggerId; cooldownMs: number }) => void` | 初始化 `patrolCooldowns` 为 `{ currentMinutes: ms / 60000, lastFiredAt: null }` |
| `isPatrolOnCooldown` | `(triggerId: PatrolTriggerId) => boolean` | 同 `isInCooldown` 逻辑，但查 `patrolCooldowns` |
| `markPatrolFired` | `(triggerId: PatrolTriggerId) => void` | 同 `markFired` 逻辑，**不更新 `lastGlobalSuggestionAt`**（与编辑器触发器隔离） |
| `recordPatrolDismiss` | `(triggerId: PatrolTriggerId) => void` | 同 `recordDismiss` 逻辑，使用 `patrolDismissCounts` + `patrolAcceptCounts` |
| `recordPatrolAccept` | `(triggerId: PatrolTriggerId) => void` | 同 `recordAccept` 逻辑 |
| `getPatrolCooldownMs` | `(triggerId: PatrolTriggerId) => number` | 返回 `patrolCooldowns.get(id)?.currentMinutes * 60 * 1000` |

4. 冷却自适应逻辑复用 `_updateWindow` / `_doubleCooldown` / `_halveCooldown` 的模式：

- `patrolDismiss` 达到 `DISMISS_ADJUST_COUNT=3` → 冷却期 × 2
- `patrolAccept` 达到 `DISMISS_ADJUST_COUNT=3` → 冷却期 × 0.5（不低于原始值的 `PATROL_MIN_COOLDOWN_RATIO`）

5. **不修改**现有编辑器触发器的冷却管理方法（`register` / `isInCooldown` / `markFired` / `recordDismiss` / `recordAccept`）。

**验证：** TypeScript 编译通过；现有编辑器触发器冷却不受影响。

---

### 阶段 C：扩展 ProactiveEngine + 实现 3 个 PatrolTrigger — 预计 1.5 天

#### C1：扩展 ProactiveEngine

**文件：** `sibylla-desktop/src/main/services/proactive-engine/index.ts`（修改）

1. 新增导入：`PatrolTrigger` / `PatrolTriggerId` / `PatrolResult` from `./types`，`DEFAULT_PATROL_INTERVAL_MS` from `./constants`

2. 扩展 `ProactiveEngineDeps` 接口，追加：

```typescript
notificationEngine: {
  store: { create(draft: NotificationDraft): { id: string } }
}
```

3. 新增私有属性：

```typescript
private patrolTriggers = new Map<PatrolTriggerId, PatrolTrigger>()
private patrolTimer: ReturnType<typeof setInterval> | null = null
private patrolRunning = false
```

4. 新增 `registerPatrolTrigger(trigger: PatrolTrigger)` 方法：
   - 注册到 `patrolTriggers` Map
   - 调用 `this.deps.triggerRegistry.registerPatrol(trigger)`
   - 不影响现有 `registerTrigger()` 路径

5. 新增 `startPatrol(intervalMs = DEFAULT_PATROL_INTERVAL_MS)` 方法：

```typescript
startPatrol(intervalMs: number = DEFAULT_PATROL_INTERVAL_MS): void {
  if (this.patrolRunning) return
  this.patrolRunning = true
  this.patrolTimer = setInterval(() => {
    this._runPatrolCycle().catch(() => {})
  }, intervalMs)
  this._runPatrolCycle().catch(() => {})
}
```

`_runPatrolCycle()` 内部逻辑：

```
for each trigger in patrolTriggers.values():
  if (!trigger.enabled) continue
  if (triggerRegistry.isPatrolOnCooldown(trigger.id)) continue
  try:
    result = await trigger.evaluate()
    if result !== null:
      // 创建 system.suggestion 通知
      deps.notificationEngine.store.create({
        type: 'system.suggestion',
        priority: result.priority,
        source: { provider: `patrol:${trigger.id}` },
        title: result.title,
        body: result.detail,
        groupKey: result.groupKey,
        actions: result.actions.map(a => ({ label: a.label, action: a.id })),
        metadata: { audience: result.audience, patrolTriggerId: trigger.id },
      })
      // 更新冷却
      triggerRegistry.markPatrolFired(trigger.id)
      // 记录 Trace
      if tracer?.isEnabled():
        tracer.startSpan('patrol.{triggerId}.evaluate', { kind: 'system', attributes: { result: 'fired' } }).setStatus('ok').end()
      // 发射通知事件
      eventBus.emitEvent({ type: 'notification.created', source: 'patrol-engine', payload: { patrolTriggerId: trigger.id } })
  catch:
    // 失败静默，记录 Trace
```

6. 新增 `stopPatrol()` 方法：

```typescript
stopPatrol(): void {
  if (this.patrolTimer) {
    clearInterval(this.patrolTimer)
    this.patrolTimer = null
  }
  this.patrolRunning = false
}
```

7. 修改 `shutdown()` 方法：追加 `this.stopPatrol()`

8. **不修改** `initialize()` / `onSnapshot()` / `recordSuggestionOutcome()` 的现有逻辑。

**验证：** `startPatrol()` 启动后定时循环正确执行；`stopPatrol()` 正确停止；现有编辑器触发器路径完全不变。

#### C2：实现 risk-task-delay PatrolTrigger

**文件：** `sibylla-desktop/src/main/services/proactive-engine/triggers/risk-task-delay.ts`（新建）

工厂函数签名：

```typescript
export function createRiskTaskDelayTrigger(
  kanbanService: KanbanService,
  workspaceRoot: string,
): PatrolTrigger
```

`evaluate()` 逻辑：

```
1. kanbanService.parseTasksMd(workspaceRoot) → KanbanModel
2. 过滤逾期任务: task.deadline && new Date(task.deadline) < new Date() && task.status !== '已完成'
3. if overdueTasks.length === 0 → return null
4. 计算每个任务的逾期天数: Math.ceil((Date.now() - new Date(task.deadline).getTime()) / 86400000)
5. 排序: 按逾期天数降序
6. 取 Top 5
7. 返回 PatrolResult:
   - title: `${overdueTasks.length} 个任务已逾期`
   - detail: 取 Top 5 的 "{task.title} ({task.assignee || '未分配'}, 逾期 {days} 天)" join '\n'
   - actions: [{ id: 'view', label: '查看' }, { id: 'dismiss', label: '忽略' }]
   - audience: ['admin', ...new Set(overdueTasks.map(t => t.assignee).filter(Boolean))]
   - priority: 'high'
   - groupKey: `patrol:risk-task-delay:${overdueTasks.map(t => t.id).sort().join(',')}`
```

**验证：** 测试有逾期/无逾期/部分逾期场景。

#### C3：实现 workload-imbalance PatrolTrigger

**文件：** `sibylla-desktop/src/main/services/proactive-engine/triggers/workload-imbalance.ts`（新建）

工厂函数签名：

```typescript
export function createWorkloadImbalanceTrigger(
  gitAbstraction: GitAbstraction,
  memberDirectory: MemberDirectory,
): PatrolTrigger
```

`evaluate()` 逻辑：

```
1. since = new Date(Date.now() - 24 * 60 * 60 * 1000)
2. commits = await gitAbstraction.getHistory({ since })
3. 按 author 分组统计 commit 数 → Map<string, number>
4. members = memberDirectory.getAllMembers()
5. if members.length < 2 → return null（单成员无法失衡）
6. 计算 teamAvg = totalCommits / members.length
7. if teamAvg === 0 → return null
8. 检测失衡: 某成员 > teamAvg * 3 或 < teamAvg / 3
9. if 无失衡 → return null
10. 返回 PatrolResult:
    - title: `检测到工作量分布不均`
    - detail: 列出失衡成员 "{name}: {count} 次提交 (团队均值 {avg})"
    - actions: [{ id: 'view', label: '查看' }, { id: 'dismiss', label: '忽略' }]
    - audience: ['admin']
    - priority: 'normal'
    - groupKey: `patrol:workload-imbalance:${Date.now().toString().slice(0, -5)}`
```

**验证：** 测试失衡/均衡/单成员场景。

#### C4：实现 decision-contradiction PatrolTrigger

**文件：** `sibylla-desktop/src/main/services/proactive-engine/triggers/decision-contradiction.ts`（新建）

工厂函数签名：

```typescript
export function createDecisionContradictionTrigger(
  decisionLogger: DecisionLogger,
): PatrolTrigger
```

`evaluate()` 逻辑：

```
1. decisions = await decisionLogger.list({ status: 'decided' })
2. if decisions.length < 2 → return null
3. 对所有 decision 对进行两两比较:
   a. 跳过 id 相同的
   b. 使用文本相似度比较 problem 字段（简单词频 Jaccard 相似度，避免 sqlite-vec 依赖复杂度）
   c. if problemSimilarity > 0.85 && d1.chosen !== d2.chosen → 标记为潜在冲突
4. if 无冲突 → return null
5. 返回 PatrolResult:
   - title: `检测到 ${conflicts.length} 对可能矛盾的决策`
   - detail: 每对冲突 "{d1.title} ↔ {d2.title}:\n 问题相似度 {similarity}\n 选择A: {d1.chosen}\n 选择B: {d2.chosen}"
   - actions: [{ id: 'view', label: '查看' }, { id: 'dismiss', label: '忽略' }]
   - audience: ['admin', ...union(d1.decidedBy, d2.decidedBy)]
   - priority: 'high'
   - groupKey: `patrol:decision-contradiction:${conflicts.map(c => `${c.d1.id}-${c.d2.id}`).join(',')}`
```

**语义相似度实现策略**（不依赖 sqlite-vec，降低复杂度）：
- 中文分词：按字符 bigram 切分（简单且无需外部分词库）
- 相似度：Jaccard 系数 = `|A ∩ B| / |A ∪ B|`
- 阈值 > 0.85 标记为相似
- 此方案满足 TASK 规格中的"不调用 LLM"要求

**验证：** 测试有冲突/无冲突/相似但不冲突场景。

---

### 阶段 D：Dashboard IPC Handler + 共享类型 + Preload — 预计 0.5 天

#### D1：新增 Dashboard IPC 通道常量

**文件：** `sibylla-desktop/src/shared/types.ts`（修改）

1. 在 `IPC_CHANNELS` 对象中（`PRODUCTIVITY_QUERY` 之后）追加：

```typescript
DASHBOARD_OVERVIEW: 'dashboard:overview',
```

2. 在 `IPCChannelMap` 中追加类型签名：

```typescript
[IPC_CHANNELS.DASHBOARD_OVERVIEW]: { params: [viewerId: string, viewerRole: string]; return: DashboardOverviewData }
```

3. 新增 `DashboardOverviewData` 接口（在 `IPCChannelMap` 之前定义）：

```typescript
export interface DashboardOverviewData {
  taskStats: { pending: number; inProgress: number; completed: number }
  members: Array<{ userId: string; displayName: string; status: string; commits24h: number }>
  productivityScore: number | null
  commits7d: Array<{ author: string; date: string; count: number }>
  unreadSuggestionCount: number
  overdueTasks: Array<{ id: string; title: string; assignee?: string; daysOverdue: number }>
  memberCount: number
  fetchedAt: number
}
```

#### D2：实现 Dashboard IPC Handler

**文件：** `sibylla-desktop/src/main/ipc/handlers/dashboard.ts`（新建）

遵循 `productivity.ts` 的模式（函数式注册，返回 dispose 函数）：

```typescript
export function registerDashboardHandlers(
  ipcMainInstance: Electron.IpcMain,
  deps: DashboardHandlerDeps,
): () => void
```

`DashboardHandlerDeps` 接口：

```typescript
interface DashboardHandlerDeps {
  kanbanService: KanbanService
  presenceService: PresenceService
  productivityAnalyzer: ProductivityAnalyzer
  gitAbstraction: GitAbstraction
  notificationStore: NotificationStore
  memberDirectory: MemberDirectory
  workspaceRoot: string
  eventBus: AppEventBus
}
```

`dashboard:overview` handler 实现：

```
1. 并行拉取 5 个数据源（Promise.all）:
   a. kanbanService.parseTasksMd(workspaceRoot) → 统计 { pending, inProgress, completed } + 提取逾期任务
   b. presenceService.getPeers() → 成员在线状态列表
   c. productivityAnalyzer.analyze({ period: 'week', viewerId }) → overall 分数（走缓存 < 100ms）
   d. gitAbstraction.getHistory({ since: 7daysAgo }) → 按 author+date 分组统计
   e. notificationStore.getUnread() → 过滤 type === 'system.suggestion' → count

2. 聚合为 DashboardOverviewData 返回

3. Admin 涉及 personal/ 数据时发射 admin.access-personal-space 事件

4. 错误处理：单个数据源失败不阻塞整体，降级为 null 字段
```

**30 秒缓存策略：** handler 内部维护 `lastFetchResult` + `lastFetchAt`，若 `Date.now() - lastFetchAt < 30000` 直接返回缓存。

#### D3：扩展 preload/index.ts

1. 在 `ElectronAPI` 接口追加 `dashboard` 命名空间：

```typescript
dashboard: {
  overview: (viewerId: string, viewerRole: string) => Promise<IPCResponse<DashboardOverviewData>>
}
```

2. 在实现部分追加 `safeInvoke` 调用：

```typescript
dashboard: {
  overview: async (viewerId: string, viewerRole: string) => {
    return await safeInvoke<DashboardOverviewData>(IPC_CHANNELS.DASHBOARD_OVERVIEW, viewerId, viewerRole)
  }
}
```

3. 在 `ALLOWED_CHANNELS` 数组追加 `IPC_CHANNELS.DASHBOARD_OVERVIEW`。

**验证：** IPC 通道类型安全注册、handler 正确聚合数据、并行拉取无竞态。

---

### 阶段 E：Dashboard Zustand Store — 预计 0.3 天

#### E1：实现 dashboardStore

**文件：** `sibylla-desktop/src/renderer/store/dashboardStore.ts`（新建）

遵循 `productivityStore.ts` 的模式（create + devtools）：

```typescript
interface DashboardState {
  data: DashboardOverviewData | null
  isLoading: boolean
  lastRefreshedAt: number | null
  autoRefreshInterval: number
  error: string | null
}

interface DashboardActions {
  fetchOverview: (viewerId: string, viewerRole: string) => Promise<void>
  startAutoRefresh: (viewerId: string, viewerRole: string) => void
  stopAutoRefresh: () => void
  reset: () => void
}
```

核心实现：

- `fetchOverview(viewerId, viewerRole)` → `window.electronAPI.dashboard.overview(viewerId, viewerRole)`
- `startAutoRefresh(viewerId, viewerRole)` → 启动 `setInterval(fetchOverview, 30000)`，将 timer ref 存入 store
- `stopAutoRefresh()` → 清除 timer
- 注册 `events.on('notification.created')` 监听，收到 `system.suggestion` 类型时自动刷新 `unreadSuggestionCount`
- 使用 `devtools` 中间件

**验证：** Store action 正确调用 IPC、30s 自动刷新正确启停。

---

### 阶段 F：Dashboard UI 组件实现 — 预计 1.5 天

#### F1：AdminDashboard.tsx — 主页面

**文件：** `sibylla-desktop/src/renderer/components/dashboard/AdminDashboard.tsx`（新建）

布局逻辑：

```
1. 权限检查：从 appStore 获取 currentUser.role
   - 非 admin → 显示"权限不足"提示 + 链接到个人报告页面
   - admin → 继续

2. 成员数检查：从 dashboardStore.data.memberCount 判断
   - < 2 → 简化视图（仅 TaskOverviewCard + RiskAlertCard，垂直排列）
   - ≥ 2 → 完整四象限视图

3. 四象限布局（TailwindCSS grid）:
   <div className="grid grid-cols-2 grid-rows-2 gap-4 p-4 h-full">
     <TaskOverviewCard />   <!-- 左上 -->
     <RiskAlertCard />      <!-- 右上 -->
     <MemberActivityCard /> <!-- 左下 -->
     <HeatmapCard />        <!-- 右下 -->
   </div>

4. 生命周期：
   - mount: store.fetchOverview() + store.startAutoRefresh()
   - unmount: store.stopAutoRefresh()

5. 加载状态：data === null && isLoading → 骨架屏（4 个灰色矩形块）

6. Admin 视图涉及 personal/ 数据时显示"管理员视图，包含个人空间数据"横幅
```

#### F2：TaskOverviewCard.tsx — 任务概览（左上）

**文件：** `sibylla-desktop/src/renderer/components/dashboard/TaskOverviewCard.tsx`（新建）

- 三个统计数字卡片：`待开始` / `进行中` / `已完成`，使用 `data.taskStats`
- SVG 饼图：纯手写 SVG `<circle>` + `stroke-dasharray` 实现弧形，三色分段
  - 待开始：`#F59E0B` (Amber)
  - 进行中：`#6366F1` (Indigo)
  - 已完成：`#10B981` (Emerald)
- 点击数字/扇区调用 `kanbanStore` 的筛选跳转

#### F3：RiskAlertCard.tsx — 风险与建议（右上）

**文件：** `sibylla-desktop/src/renderer/components/dashboard/RiskAlertCard.tsx`（新建）

- 逾期任务列表（Top 5），每行显示：任务名 + 负责人 + 红色逾期天数 badge
- 待处理建议数 badge（`data.unreadSuggestionCount`），使用脉冲动画 `animate-pulse`
- 风险指示器：有逾期任务时标题显示红色警告图标
- 点击跳转：任务详情面板或决策对比视图

#### F4：MemberActivityCard.tsx — 成员活跃度（左下）

**文件：** `sibylla-desktop/src/renderer/components/dashboard/MemberActivityCard.tsx`（新建）

- 成员列表，每行：头像占位 + 名称 + 状态圆点 + 24h 提交数
- 状态色：在线（`#10B981` 绿）/ 离开（`#F59E0B` 黄）/ 离线（`#9CA3AF` 灰）
- 数据源：`data.members` 数组

#### F5：HeatmapCard.tsx — 7 天产出热力图（右下）

**文件：** `sibylla-desktop/src/renderer/components/dashboard/HeatmapCard.tsx`（新建）

- 7 天 × 成员数 SVG 网格
- 色深映射：0 提交=`#F3F4F6`（浅灰），1-3=`#C7D2FE`（浅蓝），4-6=`#818CF8`（蓝），7+=`#4F46E5`（深蓝）
- 悬浮 tooltip：使用 CSS `group-hover` + 绝对定位 div 显示 `{member} {date}: {count} 次提交`
- 数据源：`data.commits7d` 数组

**UI 组件通用约束：**
- 所有图表使用 SVG + TailwindCSS，不引入外部图表库
- 遵循 `ui-ux-design.md` 色彩体系
- 组件使用 `useShallow` selector 优化渲染性能

---

### 阶段 G：PatrolTrigger 注册与初始化 — 预计 0.3 天

#### G1：应用初始化代码注册

**文件：** 应用主进程初始化代码（修改）

在 `ProactiveEngine.initialize()` 之后、应用就绪之前，注册 3 个 PatrolTrigger：

```typescript
const riskTrigger = createRiskTaskDelayTrigger(kanbanService, workspaceRoot)
const workloadTrigger = createWorkloadImbalanceTrigger(gitAbstraction, memberDirectory)
const decisionTrigger = createDecisionContradictionTrigger(decisionLogger)

proactiveEngine.registerPatrolTrigger(riskTrigger)
proactiveEngine.registerPatrolTrigger(workloadTrigger)
proactiveEngine.registerPatrolTrigger(decisionTrigger)
proactiveEngine.startPatrol(30 * 60 * 1000)
```

确保：
1. 在 `ProactiveEngine.initialize()` 之后注册（编辑器触发器已先初始化）
2. `workspaceRoot` 参数通过工作区管理器获取
3. 不影响现有初始化流程

#### G2：Dashboard IPC Handler 注册

在 IPC handler 注册流程中追加 `registerDashboardHandlers()` 调用，注入 6 个服务依赖。

#### G3：shutdown 清理

在应用退出流程中确保 `proactiveEngine.stopPatrol()` 被调用（已由 C1 的 `shutdown()` 修改保证）。

**验证：** 3 个 PatrolTrigger 成功注册并首次 evaluate；Dashboard IPC 正常返回数据。

---

### 阶段 H：单元测试 — 预计 1 天

#### H1：risk-task-delay.test.ts

**文件：** `sibylla-desktop/tests/main/services/proactive-engine/patrol/risk-task-delay.test.ts`（新建）

| 测试用例 | 覆盖场景 |
|---------|---------|
| 有逾期任务 | 返回 PatrolResult，title 含正确数量，audience 含 admin + 负责人 |
| 无逾期任务 | 返回 null |
| 部分逾期 | audience 仅包含逾期任务的 assignee |
| Top 5 截断 | 10 个逾期任务仅显示 Top 5 |
| groupKey 去重 | 相同任务集产生相同 groupKey |
| 逾期天数计算 | deadline 跨天正确计算 |

#### H2：workload-imbalance.test.ts

**文件：** `sibylla-desktop/tests/main/services/proactive-engine/patrol/workload-imbalance.test.ts`（新建）

| 测试用例 | 覆盖场景 |
|---------|---------|
| 某成员 > 3× 均值 | 检测到失衡，audience 仅 admin |
| 某成员 < 1/3 均值 | 检测到失衡 |
| 均衡状态 | 返回 null |
| 单成员 | 返回 null（无法计算失衡） |
| 全员无 commit | 返回 null |

#### H3：decision-contradiction.test.ts

**文件：** `sibylla-desktop/tests/main/services/proactive-engine/patrol/decision-contradiction.test.ts`（新建）

| 测试用例 | 覆盖场景 |
|---------|---------|
| 两份日志 chosen 不同且 problem 相似 > 0.85 | 检测到冲突 |
| 不同 problem | 不冲突 |
| 相似 problem 但相同 chosen | 不冲突 |
| 单份日志 | 返回 null |
| Jaccard 阈值边界 | 0.84 不冲突，0.86 冲突 |

#### H4：patrol-engine.test.ts

**文件：** `sibylla-desktop/tests/main/services/proactive-engine/patrol/patrol-engine.test.ts`（新建）

| 测试用例 | 覆盖场景 |
|---------|---------|
| registerPatrolTrigger 正确注册 | patrolTriggers Map 包含 trigger |
| startPatrol 启动定时循环 | patrolRunning = true |
| stopPatrol 停止循环 | patrolRunning = false |
| evaluate() 返回结果时创建 Notification | store.create 被调用 |
| evaluate() 返回 null 时不创建 Notification | store.create 未被调用 |
| 冷却期内跳过 evaluate | isPatrolOnCooldown = true 时跳过 |
| Trace 记录 | patrol.{id}.evaluate span 正确创建 |

#### H5：patrol-cooldown.test.ts

**文件：** `sibylla-desktop/tests/main/services/proactive-engine/patrol/patrol-cooldown.test.ts`（新建）

| 测试用例 | 覆盖场景 |
|---------|---------|
| 初始状态不在冷却期 | isPatrolOnCooldown → false |
| markPatrolFired 后在冷却期 | isPatrolOnCooldown → true |
| 冷却期过期后恢复 | elapsed > cooldown → false |
| 3 次 dismiss 翻倍 | 冷却期 × 2 |
| 3 次 accept 减半 | 冷却期 × 0.5 |
| 减半不低于原始 50% | 最低值边界 |

#### H6：dashboard-ipc.test.ts

**文件：** `sibylla-desktop/tests/main/services/proactive-engine/patrol/dashboard-ipc.test.ts`（新建）

| 测试用例 | 覆盖场景 |
|---------|---------|
| dashboard:overview 返回聚合数据 | 5 个数据源正确聚合 |
| 并行拉取无竞态 | Promise.all 全部 resolve |
| 单数据源失败降级 | 失败字段为 null，不阻塞整体 |
| 30 秒缓存命中 | 重复请求返回缓存 |

#### H7：patrol-types.test.ts

**文件：** `sibylla-desktop/tests/main/services/proactive-engine/patrol/patrol-types.test.ts`（新建）

| 测试用例 | 覆盖场景 |
|---------|---------|
| PatrolTriggerId 类型编译 | 3 个合法值 |
| PatrolTrigger 接口编译 | id/description/enabled/cooldownMs/evaluate |
| PatrolResult 接口编译 | title/detail/actions/audience/priority/groupKey |
| NotificationPriority 联合类型 | urgent/high/normal/low |

**覆盖率目标：** PatrolTrigger ≥ 80%、Dashboard 数据聚合 ≥ 80%、ProactiveEngine 扩展 ≥ 80%

---

## 五、验收标准追踪

### 需求 6.7 — 管理员 Dashboard（20 项）

| 实现位置 | 验收要点 |
|---------|---------|
| D1 DashboardOverviewData | Dashboard 数据结构含 taskStats / members / productivityScore / commits7d / unreadSuggestionCount |
| D2 dashboard:overview | 1 秒内返回（缓存命中 < 100ms），并行拉取 5 个数据源 |
| E1 dashboardStore | 30 秒自动刷新 + 局部状态更新（无全页面重载） |
| F1 AdminDashboard | 响应式四象限 grid-cols-2 grid-rows-2 |
| F1 权限检查 | 非 Admin → "权限不足" + 链接到个人报告 |
| F1 简化视图 | memberCount < 2 → 仅 TaskOverviewCard + RiskAlertCard |
| F1 管理员提示 | 涉及 personal/ → "管理员视图" 横幅 |
| F2 TaskOverviewCard | 三列统计 + SVG 饼图 + 点击跳转看板 |
| F3 RiskAlertCard | Top 5 逾期任务 + 待处理建议 badge + 脉冲动画 |
| F3 RiskAlertCard | 点击跳转任务详情/决策对比 |
| F4 MemberActivityCard | 成员状态列表（绿/黄/灰）+ 24h 提交数 |
| F5 HeatmapCard | 7 天 × 成员网格 + 色深映射 + 悬浮 tooltip |
| D2 缓存 | 30 秒服务端缓存 + 增量刷新 |
| D2 admin.access-personal-space | Admin 涉及 personal/ 数据时发射事件 |

### 需求 6.8 — PatrolTrigger 巡检触发器（18 项）

| 实现位置 | 验收要点 |
|---------|---------|
| A1 PatrolTriggerId | `'risk-task-delay' \| 'workload-imbalance' \| 'decision-contradiction'` |
| A1 PatrolTrigger | `{ id, description, enabled, cooldownMs, evaluate() }` |
| A1 PatrolResult | `{ title, detail, actions, audience, priority, groupKey }` |
| C1 registerPatrolTrigger | 注册到 patrolTriggers Map |
| C1 startPatrol | 启动 setInterval 定时循环（默认 30 分钟） |
| C1 stopPatrol | 清除 interval + patrolRunning = false |
| C1 通知创建 | evaluate() 结果通过 NotificationEngine.store.create() → system.suggestion |
| C1 Trace | 巡检行为记录到 `patrol.{triggerId}.evaluate` span |
| C2 risk-task-delay | 冷却 4h / audience 含 admin + 负责人 / priority=high |
| C3 workload-imbalance | 冷却 8h / audience 仅 admin / priority=normal |
| C4 decision-contradiction | 冷却 24h / audience 含相关者 + admin / priority=high |
| B1 冷却自适应 | 3 次 dismiss → ×2 / 3 次 accept → ×0.5 |
| B1 偏好持久化 | 复用 PreferenceLearner |
| A2 admin.access-personal-space | 事件类型 + payload 定义 |
| G1 初始化注册 | 3 个 trigger 注册 + startPatrol(30min) |

### 性能要求

| 指标 | 目标 | 实现方式 |
|------|------|---------|
| Dashboard 首屏 | < 1s | Promise.all 并行 + 30s 服务端缓存 |
| Dashboard 30s 增量刷新 | < 500ms | 缓存命中直接返回 |
| 单次 PatrolTrigger evaluate() | < 1s | 纯计算，不调 LLM |
| 热力图渲染 | < 200ms | SVG 静态渲染，< 10 成员 × 7 天 |

---

## 六、风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| ProactiveEngine 扩展影响编辑器触发器 | 高 | patrol 路径完全独立：独立 Map、独立 timer、独立冷却；现有 initialize/onSnapshot 代码路径零修改 |
| NotificationStore 无按 type 筛选 unread 的方法 | 中 | D2 handler 中调用 `getUnread()` 后在主进程侧过滤 `type === 'system.suggestion'`，或新增 `getUnreadByType(type)` 方法 |
| decision-contradiction 语义相似度不准 | 中 | 使用 bigram Jaccard 系数，中文场景表现良好；阈值 0.85 经过测试调优；误报通过 dismiss 偏好学习抑制 |
| Dashboard 数据源某个服务失败 | 低 | Promise.allSettled 替代 Promise.all，失败字段降级为 null，不阻塞整体 |
| 热力图成员多时 SVG 节点过多 | 低 | 成员 < 10 时性能无问题（70 个 SVG rect）；超 10 人时截取 Top 10 活跃成员 |
| 30s 自动刷新频率过高导致性能问题 | 低 | 服务端 30s 缓存兜底；重复请求直接返回缓存 < 100ms |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 |
|----|------|--------|
| Day 1 上午 | A1-A3 | types.ts 扩展 + event-bus-types 扩展 + constants 扩展 |
| Day 1 下午 | B1 + C1 | trigger-registry.ts patrol 冷却 + proactive-engine/index.ts registerPatrolTrigger/startPatrol/stopPatrol |
| Day 2 上午 | C2-C4 | risk-task-delay.ts + workload-imbalance.ts + decision-contradiction.ts |
| Day 2 下午 | D1-D3 | shared/types.ts + dashboard.ts IPC handler + preload 扩展 |
| Day 3 上午 | E1 + F1-F2 | dashboardStore.ts + AdminDashboard.tsx + TaskOverviewCard.tsx |
| Day 3 下午 | F3-F5 | RiskAlertCard.tsx + MemberActivityCard.tsx + HeatmapCard.tsx |
| Day 4 上午 | G1-G3 | 初始化注册 + IPC 注册 + shutdown 清理 |
| Day 4 下午 | H1-H4 | risk-task-delay + workload-imbalance + decision-contradiction + patrol-engine 测试 |
| Day 5 上午 | H5-H7 | patrol-cooldown + dashboard-ipc + patrol-types 测试 |
| Day 5 下午 | — | 全量验证 + lint + typecheck + 修复 |

---

## 八、涉及文件变更汇总

### 新建文件（17 个）

| 文件路径 | 说明 |
|---------|------|
| `src/main/services/proactive-engine/triggers/risk-task-delay.ts` | 逾期任务检测 PatrolTrigger |
| `src/main/services/proactive-engine/triggers/workload-imbalance.ts` | 工作量失衡检测 PatrolTrigger |
| `src/main/services/proactive-engine/triggers/decision-contradiction.ts` | 决策冲突检测 PatrolTrigger |
| `src/main/ipc/handlers/dashboard.ts` | Dashboard 数据聚合 IPC handler |
| `src/renderer/store/dashboardStore.ts` | Dashboard Zustand store |
| `src/renderer/components/dashboard/AdminDashboard.tsx` | Dashboard 主页面 |
| `src/renderer/components/dashboard/TaskOverviewCard.tsx` | 任务概览卡片 |
| `src/renderer/components/dashboard/RiskAlertCard.tsx` | 风险与建议卡片 |
| `src/renderer/components/dashboard/MemberActivityCard.tsx` | 成员活跃度卡片 |
| `src/renderer/components/dashboard/HeatmapCard.tsx` | 7 天产出热力图 |
| `tests/main/services/proactive-engine/patrol/risk-task-delay.test.ts` | 逾期检测测试 |
| `tests/main/services/proactive-engine/patrol/workload-imbalance.test.ts` | 失衡检测测试 |
| `tests/main/services/proactive-engine/patrol/decision-contradiction.test.ts` | 决策冲突测试 |
| `tests/main/services/proactive-engine/patrol/patrol-engine.test.ts` | 引擎扩展测试 |
| `tests/main/services/proactive-engine/patrol/patrol-cooldown.test.ts` | 冷却自适应测试 |
| `tests/main/services/proactive-engine/patrol/dashboard-ipc.test.ts` | Dashboard IPC 测试 |
| `tests/main/services/proactive-engine/patrol/patrol-types.test.ts` | 类型编译测试 |

### 修改文件（6 个）

| 文件路径 | 变更内容 |
|---------|---------|
| `src/main/services/proactive-engine/types.ts` | 新增 PatrolTriggerId / PatrolTrigger / PatrolResult 类型 |
| `src/main/services/proactive-engine/constants.ts` | 新增 PATROL_TRIGGER_COOLDOWNS / DEFAULT_PATROL_INTERVAL_MS 常量 |
| `src/main/services/proactive-engine/trigger-registry.ts` | 新增 patrol 冷却管理 6 个方法 |
| `src/main/services/proactive-engine/index.ts` | 新增 registerPatrolTrigger / startPatrol / stopPatrol / _runPatrolCycle |
| `src/main/services/event-bus-types.ts` | 新增 admin.access-personal-space 事件类型 + payload |
| `src/shared/types.ts` | IPC_CHANNELS 新增 DASHBOARD_OVERVIEW + DashboardOverviewData 接口 + IPCChannelMap |
| `src/preload/index.ts` | 新增 dashboard 命名空间 + ALLOWED_CHANNELS |

### 不修改的文件

| 文件路径 | 原因 |
|---------|------|
| `src/main/services/proactive-engine/triggers/task-decomposition.ts` | 现有编辑器触发器不变 |
| `src/main/services/proactive-engine/triggers/related-content.ts` | 现有编辑器触发器不变 |
| `src/main/services/proactive-engine/triggers/memory-promote.ts` | 现有编辑器触发器不变 |
| `src/main/services/proactive-engine/triggers/review-stale.ts` | 现有编辑器触发器不变 |
| `src/main/services/proactive-engine/interrupt-policy.ts` | 巡检不经过打断策略 |
| `src/renderer/components/proactive/SuggestionToast.tsx` | PatrolTrigger 不使用此组件 |

### 新增依赖

无。本任务不引入新的 npm 依赖（图表使用 SVG + TailwindCSS 纯客户端实现）。

---

**文档版本**: v1.0
**最后更新**: 2026-05-01
**维护者**: Sibylla 架构团队
