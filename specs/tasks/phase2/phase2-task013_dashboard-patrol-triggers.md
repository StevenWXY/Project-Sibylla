# 管理员 Dashboard 与巡检触发器

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK013 |
| **任务标题** | 管理员 Dashboard 与巡检触发器 |
| **所属阶段** | Phase 2 - 项目管理闭环 (Sprint 6) |
| **优先级** | P1 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

构建 Sprint 6 的管理员全局视图与 AI 主动巡检能力——四象限 Dashboard 聚合任务进度、成员活跃度、风险预警和产出热力图；三个 PatrolTrigger（risk-task-delay / workload-imbalance / decision-contradiction）以定时巡检模式替代编辑器驱动的 ProactiveEngine 评估，通过 NotificationCenter 推送项目风险预警。

### 背景

Sprint 5 的 ProactiveEngine 以编辑器快照驱动评估（用户正在编辑时触发建议），适合"related-content"等编辑辅助场景。但项目管理类触发器（逾期检测、工作量失衡、决策冲突）是**数据巡检型**，与编辑器状态无关。TASK010-TASK012 已建立看板、决策日志、产出分析的数据基础，本任务将其聚合为管理员可视化面板，并新增巡检型触发机制：

| 问题 | 现状 | 本任务解决 |
|------|------|-----------|
| 管理员无全局视图 | 需分别打开看板/报告/分析查看 | Dashboard 四象限一站式展示 |
| 逾期任务无主动预警 | 依赖管理员手动检查 | risk-task-delay 巡检触发器 |
| 工作量失衡无感知 | 只能凭印象判断 | workload-imbalance 巡检触发器 |
| 决策冲突无检测 | 矛盾决策可共存 | decision-contradiction 巡检触发器 |
| 巡检型触发器无架构支撑 | ProactiveEngine 仅支持编辑器驱动 | PatrolTrigger 独立概念，共享冷却/偏好/Trace |

**核心设计约束：**

1. **PatrolTrigger 与现有 Trigger 完全分离**——巡检型不修改 `Trigger` 接口、不修改 `onSnapshot()` 路径、不产出 `SuggestionToast`（C1/D1）
2. **PatrolTrigger 通过 NotificationCenter 推送**——产出 `Notification`（类型 `system.suggestion`），而非 SuggestionToast
3. **Dashboard 不引入新数据源**——完全聚合 KanbanService、ProductivityAnalyzer、PresenceService、NotificationCenter、TraceStore、GitAbstraction 的已有接口
4. **30 秒自动刷新无全页面重载**——使用增量数据拉取 + 局部状态更新
5. **非 Admin 用户显示权限提示**——不显示 Dashboard 内容，引导到个人报告
6. **单用户简化视图**——workspace < 2 成员时隐藏团队类 widget，显示简化个人视图

### 范围

**包含：**

- `PatrolTrigger` / `PatrolResult` / `PatrolTriggerId` 类型定义
- `ProactiveEngine` 扩展：`registerPatrolTrigger()` / `startPatrol()` / `stopPatrol()`
- `TriggerRegistry` 扩展：patrol 冷却管理
- 3 个 PatrolTrigger 实现：
  - `risk-task-delay` — 逾期任务检测
  - `workload-imbalance` — 工作量失衡检测
  - `decision-contradiction` — 决策冲突检测
- `AdminDashboard` 组件 — 四象限 Dashboard 页面
- `TaskOverviewCard` 组件 — 任务概览卡片（饼图）
- `RiskAlertCard` 组件 — 风险与建议卡片
- `MemberActivityCard` 组件 — 成员活跃度卡片
- `HeatmapCard` 组件 — 7 天产出热力图
- `admin.access-personal-space` 事件定义（为 TASK014 Admin 警告预留）
- IPC handlers（dashboard.ts）— Dashboard 数据聚合
- Zustand store（dashboardStore.ts）— Dashboard UI 状态
- 单元测试

**不包含：**

- 任务看板（TASK010）
- 决策日志（TASK011）
- 日报周报/产出分析（TASK012）
- 个人空间权限回归与 Admin 警告 UI（TASK014，仅定义事件）
- ProactiveEngine 现有 4 个编辑器触发器的任何修改
- SuggestionToast 组件修改

## 依赖关系

### 前置依赖

- [x] PHASE2-TASK010 — 任务看板与 AI 任务管理（`KanbanService` 任务统计数据源 + `kanban.task-risk-detected` 事件）
- [x] PHASE2-TASK011 — 决策日志系统（`DecisionLogger.list()` 决策数据源 + `decision.recorded` / `decision.outcome-updated` 事件）
- [x] PHASE2-TASK012 — AI 日报周报与工作产出分析（`ProductivityAnalyzer` 产出数据源 + `report.generated` 事件）
- [x] PHASE2-TASK008 — ProactiveEngine（`TriggerRegistry` + 冷却机制 + 偏好学习 + Trace 记录）
- [x] PHASE2-TASK007 — Presence（`PresenceService` 在线成员数据源）
- [x] PHASE2-TASK006 — 通知中心（`NotificationEngine` 巡检结果推送 + `NotificationCenter` UI）
- [x] PHASE2-TASK001 — 事件总线（`AppEventBus`）
- [x] Sprint 3.3 — Trace 系统（巡检行为进 Trace）
- [x] Sprint 2 — GitAbstraction（提交热力图数据源）、WorkspaceMemberDirectory（成员列表）

### 被依赖任务

- [ ] PHASE2-TASK014 — 个人空间权限回归与 Admin 警告（消费 `admin.access-personal-space` 事件实现警告 UI）

## 参考文档

- [`specs/requirements/phase2/sprint6-task-management.md`](../../requirements/phase2/sprint6-task-management.md) — 需求 6.7（管理员 Dashboard）、6.8（AI 项目管理建议）、§2.4（IPC/事件命名）、§9.2（C1 ProactiveEngine 架构冲突）
- [`specs/design/architecture.md`](../../design/architecture.md) — 进程通信架构
- [`specs/design/ui-ux-design.md`](../../design/ui-ux-design.md) — UI/UX 设计规范
- [`CLAUDE.md`](../../../CLAUDE.md) — 文件即真相、AI 建议人类决策、个人空间隔离
- `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` — Electron IPC 通信模式
- `.kilocode/skills/phase1/zustand-state-management/SKILL.md` — Zustand store 设计

## 验收标准

### 需求 6.7 — 管理员 Dashboard

#### Dashboard 数据加载

- [ ] Admin 打开 Dashboard，系统在 1 秒内显示团队概览（使用缓存数据）
- [ ] Dashboard 加载时并行拉取：任务统计（KanbanService）、成员状态（PresenceService）、产出数据（ProductivityAnalyzer）、提交记录（GitAbstraction）、待处理建议数（NotificationCenter）
- [ ] Dashboard 打开期间每 30 秒自动刷新数据，无全页面重载（局部状态更新）
- [ ] 数据拉取使用 `Promise.all` 并行，总耗时取决于最慢的数据源

#### 四象限布局

- [ ] Dashboard 采用响应式四象限布局：
  - 左上：TaskOverviewCard（任务概览）
  - 右上：RiskAlertCard（风险与建议）
  - 左下：MemberActivityCard（成员活跃度）
  - 右下：HeatmapCard（产出热力图）

#### TaskOverviewCard（左上）

- [ ] 显示三列任务统计：待开始数 / 进行中数 / 已完成数
- [ ] 渲染饼图（SVG 实现，无外部图表库），显示三列占比
- [ ] 点击数字/扇区跳转到 KanbanBoard 对应列筛选
- [ ] 数据源：`KanbanService.parseTasksMd()` 统计

#### RiskAlertCard（右上）

- [ ] 显示逾期任务列表（Top 5），每项显示任务名、负责人、逾期天数
- [ ] 显示 ProactiveEngine 待处理建议数量（badge）
- [ ] 风险检测到时显示警告指示器 + badge 计数
- [ ] 点击风险条目跳转到任务详情面板或决策对比视图
- [ ] 数据源：PatrolTrigger 巡检结果 + NotificationCenter

#### MemberActivityCard（左下）

- [ ] 显示所有成员状态：在线（绿色）/ 离开（黄色）/ 离线（灰色）
- [ ] 每个成员显示近 24h 提交数
- [ ] 数据源：PresenceService + GitAbstraction

#### HeatmapCard（右下）

- [ ] 渲染 7 天 × 成员数网格，色深表示当日产出（提交数 + 文档编辑数）
- [ ] 悬浮显示详情：某成员某日的具体提交数和编辑文件数
- [ ] 数据源：GitAbstraction.getHistory()

#### 权限与简化视图

- [ ] 非 Admin 用户打开 Dashboard 时显示"权限不足"提示 + 链接到个人报告
- [ ] workspace < 2 成员时隐藏团队类 widget（MemberActivityCard / HeatmapCard），显示单用户简化视图（仅 TaskOverviewCard + RiskAlertCard）
- [ ] Admin 视图涉及 personal/ 数据时显示"管理员视图，包含个人空间数据"提示

### 需求 6.8 — PatrolTrigger 巡检触发器

#### PatrolTrigger 类型系统

- [ ] `PatrolTriggerId` 类型定义：`'risk-task-delay' | 'workload-imbalance' | 'decision-contradiction'`
- [ ] `PatrolTrigger` 接口定义：`{ id, description, enabled, cooldownMs, evaluate(): Promise<PatrolResult | null> }`
- [ ] `PatrolResult` 接口定义：`{ title, detail, actions, audience, priority, groupKey }`

#### ProactiveEngine 扩展

- [ ] `ProactiveEngine` 新增 `registerPatrolTrigger(trigger)` 方法
- [ ] `ProactiveEngine` 新增 `startPatrol(intervalMs?)` 方法启动内部定时评估循环（默认 30 分钟间隔）
- [ ] `ProactiveEngine` 新增 `stopPatrol()` 方法停止定时循环
- [ ] 巡检循环中每个 PatrolTrigger 的 evaluate() 结果通过 `NotificationEngine` 创建通知（类型 `system.suggestion`）
- [ ] 巡检行为记录到 Sprint 3.3 Trace（审计可追溯）
- [ ] 现有 4 个编辑器触发器的注册和评估路径完全不变

#### risk-task-delay 触发器

- [ ] 检测条件：任务逾期（deadline < now 且 status !== '已完成'）或 deadline 临近且无进展
- [ ] 冷却期：4 小时
- [ ] evaluate() 返回 `PatrolResult`：title="{N} 个任务已逾期"，audience 包含 admin + 各任务负责人，priority='high'
- [ ] Admin 点击"查看"：打开任务详情面板
- [ ] Admin 点击"忽略"：应用 Sprint 5 偏好学习

#### workload-imbalance 触发器

- [ ] 检测条件：24h 内某成员 commit 数 > 团队均值 3 倍 或 < 1/3
- [ ] 冷却期：8 小时
- [ ] evaluate() 返回 `PatrolResult`：audience 仅 admin，priority='normal'
- [ ] Admin 点击"查看"：打开任务重分配建议表单
- [ ] Admin 点击"忽略"：偏好学习

#### decision-contradiction 触发器

- [ ] 检测条件：两份决策日志的 `chosen` 在同一 `problem` 上互斥（语义相似度 > 0.85）
- [ ] 冷却期：24 小时
- [ ] evaluate() 返回 `PatrolResult`：audience 包含两份决策的相关者 + admin，priority='high'
- [ ] Admin 点击"查看"：打开决策对比视图
- [ ] 语义相似度计算：使用 MemoryIndexer 的 sqlite-vec 向量检索，不调用 LLM

#### 偏好学习与冷却

- [ ] 同一条件模式被忽略 3 次后，自动降低触发敏感度（冷却期翻倍）
- [ ] 被采纳后冷却期减半（最小不低于原始值的一半）
- [ ] 偏好持久化到 MEMORY.md（复用 Sprint 5 PreferenceLearner）

#### admin.access-personal-space 事件

- [ ] 新增 `admin.access-personal-space` 事件类型到 SibyllaEventType
- [ ] Payload：`{ adminId, targetUser, timestamp }`
- [ ] Dashboard 数据涉及 personal/ 内容时记录此事件（为 TASK014 Admin 警告预留接口）

### 性能要求

- [ ] Dashboard 首屏 < 1s
- [ ] Dashboard 30s 自动刷新增量拉取 < 500ms
- [ ] 单次 PatrolTrigger evaluate() < 1s
- [ ] 热力图渲染（< 10 成员 × 7 天）< 200ms

### 单元测试

- [ ] PatrolTrigger 类型接口编译测试
- [ ] risk-task-delay evaluate() 测试（有逾期/无逾期/部分逾期）
- [ ] workload-imbalance evaluate() 测试（失衡/均衡/单成员）
- [ ] decision-contradiction evaluate() 测试（有冲突/无冲突/相似但不冲突）
- [ ] ProactiveEngine registerPatrolTrigger/startPatrol/stopPatrol 测试
- [ ] 冷却期自适应测试（3 次忽略翻倍/采纳减半）
- [ ] Dashboard 数据聚合 IPC 测试
- [ ] 覆盖率：PatrolTrigger ≥ 80%、Dashboard 数据聚合 ≥ 80%

## 技术策略

### C1 调整：PatrolTrigger 与 Trigger 的分离架构

**冲突本质：** 现有 `Trigger` 接口（`proactive-engine/types.ts:57-67`）面向编辑器快照驱动：`condition(snapshot, deps) => boolean` + `buildDraft(snapshot, deps) => SuggestionDraft`。评估入口为 `onSnapshot(snapshot)`，由渲染进程 IPC 推送。Sprint 6 的三个触发器是**数据巡检型**——定时检查任务逾期/工作量失衡/决策冲突，与编辑器状态无关。强行塞入 `Trigger` 接口会导致 `condition()` 永远返回 `false`。

**解决方案：** 新增 `PatrolTrigger` 概念，与现有 `Trigger` 完全分离：

```
ProactiveEngine
    │
    ├─ 现有路径 (编辑器驱动)
    │   onSnapshot(snapshot)
    │       │
    │       ▼
    │   TriggerRegistry.evaluateTriggers(snapshot)
    │       │
    │       ▼
    │   4 个 Trigger (task-decomposition / related-content / ...)
    │       │
    │       ▼
    │   Sub-agent → SuggestionToast (右下角)
    │
    └─ 新增路径 (定时巡检) ──── 完全独立
        startPatrol(intervalMs=30min)
            │
            ▼
        定时循环：逐一调用 PatrolTrigger.evaluate()
            │
            ▼
        3 个 PatrolTrigger (risk-task-delay / workload-imbalance / decision-contradiction)
            │
            ▼
        NotificationEngine.create({ type: 'system.suggestion' })
            │
            ▼
        NotificationCenter 推送 (非 SuggestionToast)
```

**共享机制：**
- 冷却管理：`TriggerRegistry` 扩展支持 patrol 冷却 key（前缀 `patrol:`）
- 偏好学习：复用 `PreferenceLearner`，action type 使用 PatrolTriggerId
- Trace 记录：复用 `Tracer`，span name 使用 `patrol.{triggerId}.evaluate`

### Dashboard 数据聚合架构

```
AdminDashboard
    │
    ├─▶ dashboard:overview IPC (单次聚合调用)
    │       │
    │       ├─ KanbanService.parseTasksMd() → 任务统计
    │       ├─ PresenceService.getPeers() → 成员在线状态
    │       ├─ ProductivityAnalyzer.analyze() → 产出分数 (缓存)
    │       ├─ GitAbstraction.getHistory() → 最近 7 天提交
    │       └─ NotificationStore.getUnread({ type: 'system.suggestion' }) → 待处理建议
    │
    ├─▶ 30 秒定时增量刷新
    │       仅拉取变化的数据源（Presence 实时、Notification 计数）
    │       重数据源（ProductivityAnalyzer）走缓存
    │
    └─▶ PatrolTrigger 巡检结果
            通过 NotificationCenter 自动推送到 Dashboard 的 RiskAlertCard
```

### PatrolTrigger 独立冷却管理

```typescript
// TriggerRegistry 扩展
class TriggerRegistry {
  // 现有：编辑器触发器冷却
  private editorCooldowns: Map<TriggerId, CooldownRecord>

  // 新增：巡检触发器冷却
  private patrolCooldowns: Map<PatrolTriggerId, CooldownRecord>

  // 新增方法
  isPatrolOnCooldown(triggerId: PatrolTriggerId): boolean
  updatePatrolCooldown(triggerId: PatrolTriggerId, action: 'fired' | 'accepted' | 'dismissed'): void
}
```

冷却期自适应规则（复用 Sprint 5 逻辑）：
- 初始冷却期：各 trigger 自定义（risk: 4h, workload: 8h, decision: 24h）
- 连续 3 次 dismiss → 冷却期 × 2
- 每次 accept → 冷却期 × 0.5（不低于初始值的 50%）
- 偏好持久化到 MEMORY.md

## 技术执行路径

### 步骤 1：新增 PatrolTrigger 类型 + admin 事件类型

**文件：** `src/main/services/proactive-engine/types.ts`（修改）

1. 在文件末尾追加新类型定义：
   ```typescript
   export type PatrolTriggerId = 'risk-task-delay' | 'workload-imbalance' | 'decision-contradiction'

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

**文件：** `src/main/services/event-bus-types.ts`（修改）

2. 在 `SibyllaEventType` 追加：
   ```typescript
   | 'admin.access-personal-space'
   ```

3. 在 `EventPayloadMap` 追加：
   ```typescript
   'admin.access-personal-space': { adminId: string; targetUser: string; timestamp: number }
   ```

**验证：** TypeScript 编译通过；现有 Trigger/TriggerId 类型不受影响。

### 步骤 2：扩展 TriggerRegistry 支持 Patrol 冷却

**文件：** `src/main/services/proactive-engine/trigger-registry.ts`（修改）

1. 新增 patrol 冷却存储：
   ```typescript
   private patrolCooldowns: Map<PatrolTriggerId, CooldownRecord> = new Map()
   ```

2. 新增方法：
   - `isPatrolOnCooldown(triggerId: PatrolTriggerId): boolean` — 检查是否在冷却期内
   - `updatePatrolCooldown(triggerId: PatrolTriggerId, action: 'fired' | 'accepted' | 'dismissed'): void` — 更新冷却状态
   - `getPatrolCooldown(triggerId: PatrolTriggerId): CooldownRecord | undefined` — 获取当前冷却记录

3. 冷却期自适应逻辑（复用现有 `CooldownRecord` 类型）：
   - `fired`：记录 `lastFiredAt = Date.now()`
   - `accepted`：`currentMinutes *= 0.5`（不低于 `defaultCooldownMinutes * 0.5`）
   - `dismissed`：累计 dismissCount，达到 3 时 `currentMinutes *= 2`

4. 不修改现有编辑器触发器的冷却管理方法。

**验证：** TypeScript 编译通过；现有编辑器触发器冷却不受影响。

### 步骤 3：扩展 ProactiveEngine 支持 PatrolTrigger

**文件：** `src/main/services/proactive-engine/index.ts`（修改）

1. 新增私有属性：
   ```typescript
   private patrolTriggers: Map<PatrolTriggerId, PatrolTrigger> = new Map()
   private patrolTimer?: NodeJS.Timeout
   private patrolRunning: boolean = false
   ```

2. 新增 `registerPatrolTrigger(trigger)` 方法：
   - 注册到 `patrolTriggers` Map
   - 不影响现有 `registerTrigger()` / `onSnapshot()` 路径

3. 新增 `startPatrol(intervalMs = 30 * 60 * 1000)` 方法：
   - 启动 `setInterval` 定时循环
   - 每次循环：遍历所有已注册的 PatrolTrigger
   - 对每个 trigger：
     a. 检查 `enabled` 和冷却状态（`triggerRegistry.isPatrolOnCooldown`）
     b. 调用 `trigger.evaluate()`
     c. 如果返回 `PatrolResult`：
        - 通过 `NotificationEngine.create()` 创建 `system.suggestion` 类型通知
        - 更新冷却状态为 `fired`
        - 记录 Trace span（`patrol.{triggerId}.evaluate`）
     d. 如果返回 null：跳过

4. 新增 `stopPatrol()` 方法：
   - 清除 `setInterval`
   - 设置 `patrolRunning = false`

5. 不修改 `initialize()` / `onSnapshot()` / `dispose()` 的现有逻辑。

**验证：** `startPatrol()` 启动后定时循环正确执行；`stopPatrol()` 正确停止；现有编辑器触发器路径完全不变。

### 步骤 4：实现 risk-task-delay PatrolTrigger

**文件：** `src/main/services/proactive-engine/triggers/risk-task-delay.ts`（新建）

1. 实现 PatrolTrigger 对象：
   ```typescript
   export const riskTaskDelayTrigger: PatrolTrigger = {
     id: 'risk-task-delay',
     description: '检测逾期或即将到期且无进展的任务',
     enabled: true,
     cooldownMs: 4 * 60 * 60 * 1000, // 4 小时

     async evaluate(): Promise<PatrolResult | null> {
       const tasks = await kanbanService.parseTasksMd(workspacePath)
       const overdueTasks = tasks.filter(t =>
         t.deadline && new Date(t.deadline) < new Date() && t.status !== '已完成'
       )
       if (overdueTasks.length === 0) return null

       return {
         title: `${overdueTasks.length} 个任务已逾期`,
         detail: overdueTasks.map(t => `${t.title} (${t.assignee || '未分配'}, 逾期 ${daysOverdue(t.deadline)} 天)`).join('\n'),
         actions: [
           { id: 'view', label: '查看' },
           { id: 'dismiss', label: '忽略' }
         ],
         audience: ['admin', ...new Set(overdueTasks.map(t => t.assignee).filter(Boolean) as string[])],
         priority: 'high',
         groupKey: `patrol:risk-task-delay:${overdueTasks.map(t => t.id).sort().join(',')}`,
       }
     }
   }
   ```

2. 依赖注入：trigger 通过闭包或工厂函数获取 `kanbanService` 和 `workspacePath`。

**验证：** 测试有逾期/无逾期/部分逾期场景。

### 步骤 5：实现 workload-imbalance PatrolTrigger

**文件：** `src/main/services/proactive-engine/triggers/workload-imbalance.ts`（新建）

1. 实现 evaluate()：
   - 调用 `GitAbstraction.getHistory({ since: last24h })` 获取最近 24h 提交
   - 按作者分组统计 commit 数
   - 计算团队均值
   - 检测 > 均值 × 3 或 < 均值 / 3 的成员
   - 返回 `PatrolResult`（audience 仅 admin，priority 'normal'）

**验证：** 测试失衡/均衡/单成员（无法计算均值）场景。

### 步骤 6：实现 decision-contradiction PatrolTrigger

**文件：** `src/main/services/proactive-engine/triggers/decision-contradiction.ts`（新建）

1. 实现 evaluate()：
   - 调用 `DecisionLogger.list()` 获取所有决策日志
   - 按 `problem` 字段分组（使用 MemoryIndexer 的 sqlite-vec 向量检索做语义相似度）
   - 同一 problem 下的多个 `chosen` 进行比较
   - 如果两份日志的 chosen 互斥（语义相似度 > 0.85），标记为冲突
   - 返回 `PatrolResult`（audience 包含相关者 + admin，priority 'high'）

2. 语义相似度计算策略：
   - 使用 `MemoryIndexer` 已有的 sqlite-vec 向量检索能力
   - 将 `problem + chosen` 拼接为文本，查询向量相似度
   - 不调用 LLM，纯向量计算
   - 阈值 > 0.85 标记为冲突

**验证：** 测试有冲突/无冲突/相似但不冲突场景。

### 步骤 7：实现 Dashboard IPC Handler

**文件：** `src/main/ipc/handlers/dashboard.ts`（新建）

1. 新增 IPC 通道常量到 `IPC_CHANNELS`：
   ```typescript
   DASHBOARD_OVERVIEW: 'dashboard:overview',
   ```

2. 实现 `dashboard:overview` handler：
   - 并行拉取 5 个数据源（`Promise.all`）：
     a. `KanbanService.parseTasksMd()` → 任务统计 `{ pending, inProgress, completed }`
     b. `PresenceService.getPeers()` → 成员在线状态列表
     c. `ProductivityAnalyzer.analyze({ period: 'week', viewerId: adminUserId })` → 产出分数（走缓存）
     d. `GitAbstraction.getHistory({ since: 7daysAgo })` → 最近 7 天提交记录
     e. `NotificationStore.getUnread({ type: 'system.suggestion' })` → 待处理建议数
   - 聚合为 `DashboardData` 对象返回
   - 缓存 30 秒（Dashboard 打开期间增量刷新使用）

3. 在 `preload/index.ts` 新增 `dashboard` 命名空间。

**验证：** IPC 返回数据结构正确、并行拉取无竞态。

### 步骤 8：实现 Dashboard UI 组件

**文件：** `src/renderer/store/dashboardStore.ts`（新建）

1. Zustand store：
   ```typescript
   interface DashboardState {
     data: DashboardData | null
     isLoading: boolean
     lastRefreshedAt: number | null
     autoRefreshInterval: number // 默认 30s

     fetchOverview: () => Promise<void>
     startAutoRefresh: () => void
     stopAutoRefresh: () => void
   }
   ```

**文件：** `src/renderer/components/dashboard/AdminDashboard.tsx`（新建）

2. 主 Dashboard 页面：
   - 权限检查：非 Admin 显示"权限不足" + 链接到个人报告
   - 成员数检查：< 2 人显示简化视图
   - 响应式四象限网格布局（2×2 grid，`grid-cols-2 grid-rows-2`）
   - 30 秒自动刷新（store.startAutoRefresh()）
   - 数据加载中显示骨架屏
   - Admin 视图涉及 personal/ 数据时显示"管理员视图"提示

3. TaskOverviewCard 组件（左上）：
   - 三个统计数字卡片（待开始/进行中/已完成）
   - SVG 饼图（纯手写 SVG，不引入图表库）
   - 点击跳转看板对应列

4. RiskAlertCard 组件（右上）：
   - 逾期任务列表（Top 5），红色标记逾期天数
   - 待处理建议 badge 计数
   - 警告指示器动画（脉冲效果）
   - 点击跳转任务详情/决策对比

5. MemberActivityCard 组件（左下）：
   - 成员列表，每行显示头像 + 名称 + 状态圆点 + 24h 提交数
   - 在线（绿）/ 离开（黄）/ 离线（灰）
   - 数据源：PresenceService peers

6. HeatmapCard 组件（右下）：
   - 7 天 × 成员数网格
   - 色深映射：0 提交=浅灰，1-3=浅蓝，4-6=蓝，7+=深蓝
   - 悬浮 tooltip 显示详情
   - SVG 渲染，无外部图表库

**验证：** 四象限渲染正确、权限检查正确、自动刷新无全页面重载、热力图悬浮交互正确。

### 步骤 9：注册 PatrolTrigger + 初始化 + 单元测试

**文件：** 应用初始化代码（修改）

1. 注册 3 个 PatrolTrigger：
   ```typescript
   const riskTrigger = createRiskTaskDelayTrigger(kanbanService, workspaceRoot)
   const workloadTrigger = createWorkloadImbalanceTrigger(gitAbstraction, memberDirectory)
   const decisionTrigger = createDecisionContradictionTrigger(decisionLogger, memoryIndexer)

   proactiveEngine.registerPatrolTrigger(riskTrigger)
   proactiveEngine.registerPatrolTrigger(workloadTrigger)
   proactiveEngine.registerPatrolTrigger(decisionTrigger)
   proactiveEngine.startPatrol(30 * 60 * 1000) // 30 分钟
   ```

2. 确保在 `ProactiveEngine.initialize()` 之后注册，不影响现有初始化流程。

**测试文件：** `tests/main/services/proactive-engine/patrol/`（新建目录）

3. `risk-task-delay.test.ts`：
   - 有逾期任务 → 返回 PatrolResult
   - 无逾期任务 → 返回 null
   - 部分逾期 → audience 包含 admin + 各负责人
   - groupKey 正确生成

4. `workload-imbalance.test.ts`：
   - 某成员 > 3× 均值 → 检测到失衡
   - 某成员 < 1/3 均值 → 检测到失衡
   - 均衡状态 → 返回 null
   - 单成员（均值=自身）→ 返回 null

5. `decision-contradiction.test.ts`：
   - 两份日志 chosen 互斥且 problem 相似 > 0.85 → 检测到冲突
   - 不同 problem → 不冲突
   - 相似 problem 但相同 chosen → 不冲突
   - 单份日志 → 返回 null

6. `patrol-engine.test.ts`：
   - registerPatrolTrigger 正确注册
   - startPatrol 启动定时循环
   - stopPatrol 停止循环
   - evaluate() 返回结果时创建 Notification
   - evaluate() 返回 null 时不创建 Notification
   - 冷却期内跳过 evaluate

7. `dashboard-ipc.test.ts`：
   - dashboard:overview 返回聚合数据
   - 并行拉取无竞态

**覆盖率目标：** PatrolTrigger ≥ 80%、Dashboard 数据聚合 ≥ 80%、ProactiveEngine 扩展 ≥ 80%

## 现有代码基础

| 已有模块 | 文件路径 | 本任务使用方式 |
|---------|---------|-------------|
| ProactiveEngine | `src/main/services/proactive-engine/index.ts` | 新增 registerPatrolTrigger/startPatrol/stopPatrol |
| TriggerRegistry | `src/main/services/proactive-engine/trigger-registry.ts` | 扩展 patrol 冷却管理 |
| Trigger / TriggerId | `src/main/services/proactive-engine/types.ts` | 不修改，新增 PatrolTrigger 并列 |
| PreferenceLearner | `src/main/services/notifications/preference-learner.ts` | 复用偏好学习（patrol action type） |
| Tracer | Sprint 3.3 | 巡检行为进 Trace |
| NotificationEngine | `src/main/services/notifications/notification-engine.ts` | 巡检结果创建 system.suggestion 通知 |
| KanbanService | TASK010 | 任务统计数据源 |
| DecisionLogger | TASK011 | 决策日志数据源 |
| ProductivityAnalyzer | TASK012 | 产出分数数据源 |
| PresenceService | TASK007 | 在线成员数据源 |
| GitAbstraction | Sprint 2 | 提交历史数据源 |
| WorkspaceMemberDirectory | Sprint 2 | 成员列表 |
| MemoryIndexer | Sprint 3.2 | sqlite-vec 向量检索（decision-contradiction） |
| NotificationStore | TASK006 | 待处理建议数查询 |
| IpcHandler | `src/main/ipc/handler.ts` | 新建 dashboard handler |
| SuggestionToast | TASK008 | 不修改，PatrolTrigger 不使用此组件 |

**完全缺失、需新建的模块：**

| 模块 | 说明 |
|------|------|
| `proactive-engine/triggers/risk-task-delay.ts` | 逾期任务检测 PatrolTrigger |
| `proactive-engine/triggers/workload-imbalance.ts` | 工作量失衡检测 PatrolTrigger |
| `proactive-engine/triggers/decision-contradiction.ts` | 决策冲突检测 PatrolTrigger |
| `ipc/handlers/dashboard.ts` | Dashboard 数据聚合 IPC handler |
| `renderer/store/dashboardStore.ts` | Dashboard Zustand store |
| `renderer/components/dashboard/AdminDashboard.tsx` | Dashboard 主页面 |
| `renderer/components/dashboard/TaskOverviewCard.tsx` | 任务概览卡片 |
| `renderer/components/dashboard/RiskAlertCard.tsx` | 风险与建议卡片 |
| `renderer/components/dashboard/MemberActivityCard.tsx` | 成员活跃度卡片 |
| `renderer/components/dashboard/HeatmapCard.tsx` | 7 天产出热力图 |
| `tests/main/services/proactive-engine/patrol/` | 单元测试目录 |

## 新增 IPC 通道

| IPC 通道 | 方向 | 说明 |
|---------|------|------|
| `dashboard:overview` | Renderer → Main | 聚合 Dashboard 所需全部数据 |

## 涉及的现有文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/main/services/proactive-engine/types.ts` | 扩展 | 新增 PatrolTrigger / PatrolResult / PatrolTriggerId 类型 |
| `src/main/services/proactive-engine/index.ts` | 扩展 | 新增 registerPatrolTrigger / startPatrol / stopPatrol 方法 |
| `src/main/services/proactive-engine/trigger-registry.ts` | 扩展 | 新增 patrol 冷却管理方法 |
| `src/main/services/event-bus-types.ts` | 扩展 | 新增 admin.access-personal-space 事件类型 + payload |
| `src/shared/types.ts` | 扩展 | IPC_CHANNELS 新增 dashboard:* 常量 |
| `src/preload/index.ts` | 扩展 | 新增 dashboard 命名空间 |
| 应用初始化代码 | 修改 | 注册 3 个 PatrolTrigger + startPatrol |

**不修改的文件：**

- `src/main/services/proactive-engine/triggers/task-decomposition.ts` — TASK010 已修改，不再改动
- `src/main/services/proactive-engine/triggers/related-content.ts` — 现有编辑器触发器不变
- `src/main/services/proactive-engine/triggers/memory-promote.ts` — 现有编辑器触发器不变
- `src/main/services/proactive-engine/triggers/review-stale.ts` — 现有编辑器触发器不变
- `src/renderer/components/proactive/SuggestionToast.tsx` — PatrolTrigger 不使用此组件

---

**创建时间：** 2026-05-01
**最后更新：** 2026-05-01
**更新记录：**
- 2026-05-01 — 创建任务文档（含完整技术执行路径 9 步）