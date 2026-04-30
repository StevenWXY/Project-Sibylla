# AI 主动建议引擎与建议 UI

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK008 |
| **任务标题** | AI 主动建议引擎与建议 UI |
| **所属阶段** | Phase 2 - 智能通知与协作增强 (Sprint 5) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

构建 Sprint 5 的 AI 主动建议能力——让 Sibylla 从"被动响应"升级为"在合适时机主动开口"。ProactiveEngine 通过启发式规则（不调用 LLM）评估用户当前编辑上下文，在触发条件满足且不打扰用户时，通过 Sub-agent 生成具体建议并以非侵入式右下角 Toast 展现。

### 背景

Sprint 1-4 让 Sibylla 拥有"知道全部、找得到、想得清"的能力。但 AI 始终被动等待用户提问，无法在关键时刻主动提议：

| 问题 | 现状 | 本任务解决 |
|------|------|-----------|
| 写了需求不知道该不该拆解 | 用户需要自己想到"让 AI 帮忙" | task-decomposition 触发器自动识别 |
| 写过类似文档不知道 | 用户忘记历史内容 | related-content 触发器检索相关文档 |
| 团队约定没记到记忆里 | 依赖人工维护 MEMORY.md | memory-promote 触发器识别约定模式 |
| 过期文档没人审查 | 无文档保鲜机制 | review-stale 触发器提醒审查 |

**核心设计约束：**

1. **不调用 LLM 做评估**：触发器评估使用启发式规则（纯函数），评估本身 < 50ms，避免高频 LLM 调用拖慢编辑器
2. **触发后才调 LLM**：仅当触发器通过评估后，才调用 `spawnSubAgent('suggestion-curator')` 生成具体建议
3. **建议通过 Sub-agent 生成**：不引入新的 AI 调用路径，复用 Sprint 3.5 的 `SubAgentExecutor`
4. **canInterrupt 多层保护**：深度专注检测、焦点模式、任务执行中、全局冷却期、触发器独立冷却期
5. **建议不进入通知中心**：Toast 是即查即决的短暂展现，不与通知中心混淆
6. **失败静默**：Sub-agent 超时或失败时静默丢弃建议，不打扰用户
7. **冷却期自适应**：用户连续 dismiss 触发器 → 冷却期翻倍；用户连续接受 → 冷却期减半

### 范围

**包含：**

- `ProactiveEngine` — 主动建议引擎主类（接收 EditorSnapshot → 评估触发器 → 生成建议）
- `TriggerRegistry` — 触发器注册与冷却期管理
- `InterruptPolicy` — canInterrupt 策略集中判断
- 4 个内置触发器（task-decomposition / related-content / memory-promote / review-stale）
- `EditorSnapshotCollector` — 主进程端接收 IPC 推送的 snapshot
- `useEditorSnapshotCollector` — 渲染进程 hook，采集编辑器状态
- `suggestion-curator` Sub-agent prompt
- `SuggestionToast` — 右下角非侵入式 Toast 组件
- `SuggestionQueue` — 建议排队管理（同时只显示 1 条）
- `OverlayManager` — 轻量协调器（与 Sprint 3.6 Onboarding tour 排他显示）
- IPC handlers（proactive-engine.ts）
- Zustand store（proactiveStore.ts）
- 冷却期自适应 + 记忆系统持久化
- 单元测试

**不包含：**

- 通知中心（TASK006）
- Presence 信号层（TASK007）
- 协作冲突 AI 合并（TASK009）
- 协作上下文层 L7（TASK007）
- Sprint 3.5 Sub-agent 执行器修改
- Sprint 3.4 命令面板修改（仅复用其 dispatch 能力）

## 依赖关系

### 前置依赖

- [x] PHASE2-TASK001 — 事件总线（消费 `progress.task-running`、`performance.alert` 事件）
- [x] PHASE2-TASK002 — 统一搜索引擎（`UnifiedSearchEngine.search()` 被 related-content 触发器调用）
- [x] PHASE2-TASK006 — 通知中心（焦点模式状态检查、系统建议通知通道）
- [x] Sprint 3.2 — 记忆系统（冷却期调整持久化到 MEMORY.md）
- [x] Sprint 3.3 — Trace 系统（所有评估/建议行为进 Trace）
- [x] Sprint 3.4 — AiMode 系统（currentAiMode 检查）、命令面板（acceptAction dispatch）
- [x] Sprint 3.5 — Sub-agent 系统（`SubAgentExecutor` + `spawnSubAgent`）
- [x] Sprint 3.6 — MCP 集成（Onboarding tour 与 OverlayManager 排他）
- [x] Sprint 1 — Tiptap 编辑器（EditorSnapshot 采集挂载点）

### 被依赖任务

- 无（本任务是 Sprint 5 的独立功能模块）

## 参考文档

- [`specs/requirements/phase2/sprint5-collaboration.md`](../../requirements/phase2/sprint5-collaboration.md) — 需求 5.5（主动建议引擎）、5.6（建议 UI）、§3 非功能需求
- [`specs/design/architecture.md`](../../design/architecture.md) — 进程通信架构
- [`specs/design/ui-ux-design.md`](../../design/ui-ux-design.md) — UI/UX 设计规范
- [`specs/design/sub-agent-system.md`](../../design/sub-agent-system.md) — Sub-agent 系统设计
- [`CLAUDE.md`](../../../CLAUDE.md) — AI 建议人类决策、本地优先
- `.kilocode/skills/phase1/zustand-state-management/SKILL.md` — Zustand store 设计
- `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` — Electron IPC 通信模式

## 验收标准

### 触发器评估

- [ ] 用户停止输入 30 秒且上下文匹配触发器时，100ms 内完成评估
- [ ] 评估纯启发式（无 LLM 调用），整体 < 50ms（P95）
- [ ] 4 个内置触发器全部实现并可独立启用/禁用
- [ ] 触发器冷却期独立管理（默认 30 分钟）
- [ ] 全局冷却期：5 分钟内最多 1 条建议

### canInterrupt 策略

- [ ] 用户输入速度 > 50 字/分钟时抑制建议（深度专注检测）
- [ ] 距离上次建议 < 5 分钟时抑制
- [ ] 焦点模式下仅 urgent 建议可通过（内置触发器均为 normal，被抑制）
- [ ] AiMode 为 Plan/Analyze 且任务进行中时抑制
- [ ] 用户在设置中全局禁用时，无触发器评估、无 LLM 调用

### Sub-agent 调用

- [ ] 触发器通过评估 + canInterrupt 通过后，调用 `spawnSubAgent('suggestion-curator')`
- [ ] Sub-agent 超时 3 秒
- [ ] Sub-agent 失败或超时时静默丢弃建议（无 error toast、无日志弹窗）
- [ ] Sub-agent 输出包含 title / body / acceptAction / declineAction

### 冷却期自适应

- [ ] 用户连续 dismiss 同 triggerId 3 次（24 小时内）→ 冷却期翻倍（最长 24 小时）
- [ ] 用户连续接受同 triggerId 3 次 → 冷却期减半（最短 5 分钟）
- [ ] 冷却期调整通过 Sprint 3.2 记忆系统持久化

### Trace 集成

- [ ] 每次评估产生 `proactive.evaluate` span（kind: 'system'）
- [ ] 建议展现产生 `proactive.suggestion-shown` span，属性包含 triggerId / accepted/dismissed/timeout / dwellMs
- [ ] 后续优化触发器精度依赖此 Trace 数据

### 建议 Toast UI

- [ ] 建议派发后 100ms 内渲染到右下角
- [ ] 进入动画 300ms 滑入，离开动画 200ms 淡出
- [ ] 15 秒不交互自动淡出，悬停暂停计时，鼠标离开后重置为 5 秒
- [ ] 同时只显示 1 条建议，多条排队
- [ ] Esc 全局快捷键关闭当前建议
- [ ] 默认折叠态显示标题 + 1 行预览，点击展开看完整 body 与操作按钮
- [ ] 不与 Sprint 3.3 性能告警 toast 重叠（告警左下角，建议右下角）
- [ ] 不进入通知中心列表（即查即决）
- [ ] 全屏/演示模式下不显示
- [ ] urgent 优先级播放轻量提示音（可在设置中关闭）
- [ ] 与 Sprint 3.6 Onboarding tour 通过 OverlayManager 排他显示

### 单元测试

- [ ] 4 个触发器各自 condition 测试（多场景匹配/不匹配）
- [ ] canInterrupt 策略组合测试（4 种抑制条件排列组合）
- [ ] TriggerRegistry 冷却期管理测试（独立冷却/自适应翻倍减半）
- [ ] ProactiveEngine 端到端测试（snapshot → evaluate → canInterrupt → spawn）
- [ ] SuggestionToast 组件渲染测试
- [ ] useEditorSnapshotCollector hook 测试
- [ ] 覆盖率 ≥ 80%

## 技术策略

### 核心架构：启发式评估 → canInterrupt 门控 → Sub-agent 生成 → Toast 展现

```
渲染进程                          主进程
    │                               │
    │ useEditorSnapshotCollector    │
    │ (每秒采样, 2秒防抖)           │
    │                               │
    │── proactive:editorSnapshot ──>│ ProactiveEngine.onSnapshot(snapshot)
    │                               │
    │                               ├── TriggerRegistry: 冷却检查
    │                               │   ├── triggerId 在冷却期? → 跳过
    │                               │   └── 全局冷却 < 5 分钟? → 跳过
    │                               │
    │                               ├── 遍历注册触发器:
    │                               │   ├── trigger.condition(snapshot) → false? 跳过
    │                               │   └── true → 生成 SuggestionDraft
    │                               │
    │                               ├── InterruptPolicy.canInterrupt(context)
    │                               │   ├── typingVelocity > 50字/分? → false
    │                               │   ├── lastSuggestion < 5分钟? → false
    │                               │   ├── focused && priority < urgent? → false
    │                               │   └── AiMode=Plan && taskRunning? → false
    │                               │
    │                               ├── 通过 → spawnSubAgent('suggestion-curator')
    │                               │   ├── 输入: triggerId + snapshot 摘要
    │                               │   ├── 输出: { title, body, acceptAction, declineAction }
    │                               │   └── 超时 3 秒 / 失败 → 静默丢弃
    │                               │
    │                               └── Tracer: proactive.suggestion-shown span
    │                               │
    │<── proactive:suggestionShown ──│
    │                               │
    ▼                               │
SuggestionQueue (渲染进程)          │
    │                               │
    ├── 队列中已有建议? → 排队等待   │
    └── 队列空 → 渲染 SuggestionToast
        ├── 右下角, 300ms 滑入
        ├── 15秒自动淡出
        ├── Esc 关闭
        └── Accept → 执行 acceptAction
            Decline → 记录 dismiss
            Timeout → 静默
```

### EditorSnapshot 数据流

```
Tiptap Editor (渲染进程)
    │
    ├── editor.on('update') → 内容变更
    ├── editor.on('selectionUpdate') → 光标/选区变更
    │
    ▼
useEditorSnapshotCollector (hook)
    │
    ├── 每秒采样一次:
    │   ├── filePath: 当前打开文件
    │   ├── contentSummary: { length, recentText(最近500字符) }
    │   ├── typingVelocity: 滑动窗口(10秒)估算 字/分钟
    │   ├── continuousTypingMinutes: 连续输入时长
    │   ├── cursorPosition: 光标位置
    │   ├── selectionLength: 选区长度
    │   ├── lastInteractionAt: 最后交互时间
    │   ├── currentAiMode: 当前 AiMode
    │   └── isFocused: 焦点模式状态
    │
    ├── 2 秒防抖
    │
    └── IPC push: proactive:editorSnapshot → 主进程
```

### 冷却期自适应机制

```
用户行为                    冷却期调整
─────────────────────────────────────────
dismiss 同 triggerId 3次/24h → 冷却期 × 2 (最长 24h)
accept 同 triggerId 3次      → 冷却期 ÷ 2 (最短 5min)

持久化:
  每次冷却期变化 → 写入 MEMORY.md
    "proactive-trigger-cooldown:{triggerId}: {cooldownMinutes}min (auto-adjusted)"
  下次启动 → 从 MEMORY.md 读取恢复
```

### 建议队列管理

```
建议生成 (主进程 Sub-agent 返回)
    │
    ▼
IPC push: proactive:suggestionShown → 渲染进程
    │
    ▼
SuggestionQueue (渲染进程)
    ├── _currentSuggestion: Suggestion | null
    ├── _pendingQueue: Suggestion[]
    │
    ├── 收到新建议:
    │   ├── _currentSuggestion === null → 立即展示
    │   └── _currentSuggestion !== null → 入 _pendingQueue
    │
    ├── 当前建议关闭时:
    │   ├── _pendingQueue.length > 0 → 弹出下一个展示
    │   └── _pendingQueue.length === 0 → _currentSuggestion = null
    │
    └── Esc 键:
        └── 关闭 _currentSuggestion → 触发 dismiss 事件
```

### 依赖库选型

| 用途 | 库 | 说明 |
|------|-----|------|
| 状态管理 | `zustand`（已有） | proactiveStore |
| 动画 | `framer-motion`（已有） | Toast 滑入/淡出动画 |
| UI 组件 | `TailwindCSS`（已有） | 所有样式 |

## 技术执行路径

### 步骤 1：定义类型系统与配置

**文件：** `src/main/services/proactive-engine/types.ts`（新建）

1. 定义 `EditorSnapshot` 接口：
   ```typescript
   interface EditorSnapshot {
     filePath: string
     contentSummary: { length: number; recentText: string }
     typingVelocity: number
     continuousTypingMinutes: number
     cursorPosition: number
     selectionLength: number
     lastInteractionAt: number
     currentAiMode: AiModeId
     isFocused: boolean
   }
   ```
2. 定义 `TriggerId` 联合类型：`'task-decomposition' | 'related-content' | 'memory-promote' | 'review-stale'`
3. 定义 `SuggestionPriority` 联合类型：`'urgent' | 'normal'`（内置触发器均为 normal）
4. 定义 `SuggestionDraft` 接口：
   ```typescript
   interface SuggestionDraft {
     triggerId: TriggerId
     priority: SuggestionPriority
     context: Record<string, unknown>
     previewTitle: string
   }
   ```
5. 定义 `Suggestion` 接口（Sub-agent 返回的完整建议）：
   ```typescript
   interface Suggestion {
     id: string
     triggerId: TriggerId
     title: string
     body: string
     acceptAction: { command: string; args: Record<string, unknown> }
     declineAction: 'dismiss' | 'snooze-1h' | 'never'
     priority: SuggestionPriority
     createdAt: number
   }
   ```
6. 定义 `Trigger` 接口：
   ```typescript
   interface Trigger {
     id: TriggerId
     description: string
     enabled: boolean
     defaultCooldownMinutes: number
     condition: (snapshot: EditorSnapshot, deps: TriggerDeps) => boolean
     buildDraft: (snapshot: EditorSnapshot, deps: TriggerDeps) => SuggestionDraft
   }
   ```
7. 定义 `TriggerDeps` 接口（触发器依赖注入）：
   ```typescript
   interface TriggerDeps {
     searchEngine: UnifiedSearchEngine
     memoryStore: MemoryStore
     fileStats: (path: string) => { updatedAt: number; size: number } | null
     knownMemoryPatterns: string[]
   }
   ```
8. 定义 `InterruptContext` 接口：
   ```typescript
   interface InterruptContext {
     snapshot: EditorSnapshot
     lastSuggestionAt: number | null
     isFocused: boolean
     isTaskRunning: boolean
     isFullscreen: boolean
   }
   ```

**文件：** `src/main/services/proactive-engine/constants.ts`（新建）

9. 定义默认配置常量：
   ```typescript
   const DEFAULT_PROACTIVE_CONFIG: ProactiveConfig = {
     enabled: true,
     globalCooldownMinutes: 5,
     triggerOverrides: {},
     interruptPolicy: {
       suppressDuringTaskExecution: true,
       suppressInDeepFocus: true,
       suppressDuringFocusMode: true,
     },
   }
   ```
10. 定义冷却期边界：`MIN_COOLDOWN_MINUTES = 5`、`MAX_COOLDOWN_MINUTES = 1440`（24 小时）
11. 定义自适应阈值：`DISMISS_ADJUST_COUNT = 3`、`ADJUST_WINDOW_HOURS = 24`
12. 定义 TypingVelocity 阈值：`DEEP_FOCUS_VELOCITY = 50`（字/分钟）
13. 定义连续输入阈值：`DEEP_FOCUS_MINUTES = 5`

**验证：** 类型编译通过、无 any。

### 步骤 2：实现 TriggerRegistry（触发器注册与冷却管理）

**文件：** `src/main/services/proactive-engine/trigger-registry.ts`（新建）

1. 定义 `TriggerRegistry` 类，构造函数接收 `Tracer`（可选）和冷却期持久化回调
2. 内部状态：
   - `triggers: Map<TriggerId, Trigger>`
   - `cooldowns: Map<TriggerId, { currentMinutes: number; lastFiredAt: number | null }>`
   - `dismissCounts: Map<TriggerId, { count: number; windowStart: number }>`
   - `acceptCounts: Map<TriggerId, { count: number; windowStart: number }>`
   - `lastGlobalSuggestionAt: number | null`
3. 实现 `register(trigger: Trigger): void` 方法：添加到 triggers Map，初始化冷却配置
4. 实现 `getTrigger(id: TriggerId): Trigger | undefined` 方法
5. 实现 `getAllTriggers(): Trigger[]` 方法
6. 实现 `isInCooldown(triggerId: TriggerId): boolean` 方法：
   - 获取 `cooldowns.get(triggerId)`
   - 若 `lastFiredAt` 为 null → 不在冷却期
   - 计算 `elapsed = Date.now() - lastFiredAt`
   - 返回 `elapsed < currentMinutes * 60 * 1000`
7. 实现 `isGlobalCooldown(): boolean` 方法：
   - 若 `lastGlobalSuggestionAt` 为 null → false
   - 返回 `Date.now() - lastGlobalSuggestionAt < globalCooldownMinutes * 60 * 1000`
8. 实现 `markFired(triggerId: TriggerId): void` 方法：
   - 更新 `cooldowns.get(triggerId).lastFiredAt = Date.now()`
   - 更新 `lastGlobalSuggestionAt = Date.now()`
9. 实现 `recordDismiss(triggerId: TriggerId): void` 方法：
   - 更新 dismissCounts（24 小时滑动窗口）
   - 若 dismiss count 达到 `DISMISS_ADJUST_COUNT` → 调用 `_doubleCooldown(triggerId)`
   - 重置 acceptCounts
10. 实现 `recordAccept(triggerId: TriggerId): void` 方法：
    - 更新 acceptCounts
    - 若 accept count 达到 `DISMISS_ADJUST_COUNT` → 调用 `_halveCooldown(triggerId)`
    - 重置 dismissCounts
11. 实现 `_doubleCooldown(triggerId: TriggerId)` 私有方法：
    - 当前冷却期 × 2，封顶 `MAX_COOLDOWN_MINUTES`
    - 调用持久化回调（写入 MEMORY.md）
    - 记录 Trace span
12. 实现 `_halveCooldown(triggerId: TriggerId)` 私有方法：
    - 当前冷却期 ÷ 2，保底 `MIN_COOLDOWN_MINUTES`
    - 调用持久化回调
    - 记录 Trace span
13. 实现 `restoreCooldowns(cooldownMap: Record<TriggerId, number>): void` 方法：从 MEMORY.md 恢复冷却期

**验证：** 冷却期检查正确、翻倍减半正确、全局冷却正确、持久化回调正确触发。

### 步骤 3：实现 InterruptPolicy（打断策略）

**文件：** `src/main/services/proactive-engine/interrupt-policy.ts`（新建）

1. 定义 `InterruptPolicy` 类，构造函数接收 `ProactiveConfig`
2. 实现 `canInterrupt(context: InterruptContext): { allowed: boolean; reason?: string }` 方法：
   - step 1: 深度专注检测
     ```typescript
     if (config.interruptPolicy.suppressInDeepFocus) {
       if (context.snapshot.typingVelocity > DEEP_FOCUS_VELOCITY) {
         return { allowed: false, reason: 'deep-focus-high-velocity' }
       }
       if (context.snapshot.continuousTypingMinutes > DEEP_FOCUS_MINUTES) {
         return { allowed: false, reason: 'deep-focus-continuous' }
       }
     }
     ```
   - step 2: 全局冷却检查
     ```typescript
     if (context.lastSuggestionAt !== null) {
       const elapsed = Date.now() - context.lastSuggestionAt
       if (elapsed < config.globalCooldownMinutes * 60 * 1000) {
         return { allowed: false, reason: 'global-cooldown' }
       }
     }
     ```
   - step 3: 焦点模式检查
     ```typescript
     if (config.interruptPolicy.suppressDuringFocusMode && context.isFocused) {
       return { allowed: false, reason: 'focus-mode-active' }
     }
     ```
   - step 4: 任务执行中检查
     ```typescript
     if (config.interruptPolicy.suppressDuringTaskExecution && context.isTaskRunning) {
       return { allowed: false, reason: 'task-executing' }
     }
     ```
   - step 5: 全屏模式检查
     ```typescript
     if (context.isFullscreen) {
       return { allowed: false, reason: 'fullscreen' }
     }
     ```
   - step 6: 通过所有检查
     ```typescript
     return { allowed: true }
     ```
3. 实现 `updateConfig(config: Partial<ProactiveConfig>): void` 方法

**验证：** 4 种抑制条件单独正确、组合正确、配置更新生效。

### 步骤 4：实现 4 个内置触发器

**文件：** `src/main/services/proactive-engine/triggers/task-decomposition.ts`（新建）

1. 导出 `taskDecompositionTrigger: Trigger`：
   - id: `'task-decomposition'`
   - description: '检测用户写了目标/需求但没有任务清单'
   - defaultCooldownMinutes: 30
   - condition 函数：
     ```typescript
     (snapshot, deps) => {
       const text = snapshot.contentSummary.recentText
       const hasGoalKeywords = /目标|要做|需求|计划|里程碑|scope/.test(text)
       const hasListFormat = /^[-*]\s|\d+\.\s/m.test(text)
       return hasGoalKeywords && !hasListFormat && snapshot.contentSummary.length > 200
     }
     ```
   - buildDraft 函数：
     ```typescript
     (snapshot) => ({
       triggerId: 'task-decomposition',
       priority: 'normal',
       context: { filePath: snapshot.filePath, contentLength: snapshot.contentSummary.length },
       previewTitle: '想要拆解任务吗？',
     })
     ```

**文件：** `src/main/services/proactive-engine/triggers/related-content.ts`（新建）

2. 导出 `relatedContentTrigger: Trigger`：
   - id: `'related-content'`
   - description: '用户开始写新文档时搜索相关历史文档'
   - defaultCooldownMinutes: 30
   - condition 函数：
     ```typescript
     (snapshot, deps) => {
       if (snapshot.contentSummary.length > 100) return false
       const fileName = snapshot.filePath.split('/').pop()?.replace('.md', '') ?? ''
       if (fileName.length < 2) return false
       return true // 实际搜索在 buildDraft 中执行
     }
     ```
   - buildDraft 函数：
     ```typescript
     async (snapshot, deps) => {
       const fileName = snapshot.filePath.split('/').pop()?.replace('.md', '') ?? ''
       const results = await deps.searchEngine.search(fileName, { limit: 5 })
       if (results.length < 3) return null // 不满足条件
       return {
         triggerId: 'related-content',
         priority: 'normal',
         context: { relatedFiles: results.slice(0, 5).map(r => r.filePath) },
         previewTitle: `找到 ${results.length} 篇相关文档，要不要参考？`,
       }
     }
     ```
   - 注意：此触发器的 buildDraft 是异步的（需要搜索），ProactiveEngine 需处理

**文件：** `src/main/services/proactive-engine/triggers/memory-promote.ts`（新建）

3. 导出 `memoryPromoteTrigger: Trigger`：
   - id: `'memory-promote'`
   - description: '检测当前对话中的团队约定模式'
   - defaultCooldownMinutes: 60
   - condition 函数：
     ```typescript
     (snapshot, deps) => {
       const text = snapshot.contentSummary.recentText
       const hasConventionPattern = /我们决定|以后都用|团队规则|约定|standard|convention/.test(text)
       if (!hasConventionPattern) return false
       // 检查是否已在记忆系统中
       const isKnown = deps.knownMemoryPatterns.some(p => text.includes(p))
       return !isKnown
     }
     ```
   - buildDraft 函数：
     ```typescript
     (snapshot) => ({
       triggerId: 'memory-promote',
       priority: 'normal',
       context: { filePath: snapshot.filePath },
       previewTitle: '这看起来像个团队约定，记到 MEMORY 里？',
     })
     ```

**文件：** `src/main/services/proactive-engine/triggers/review-stale.ts`（新建）

4. 导出 `reviewStaleTrigger: Trigger`：
   - id: `'review-stale'`
   - description: '打开超过 30 天未更新的 Plan/Spec 文档时提醒审查'
   - defaultCooldownMinutes: 60
   - condition 函数：
     ```typescript
     (snapshot, deps) => {
       const stats = deps.fileStats(snapshot.filePath)
       if (!stats) return false
       const daysSinceUpdate = (Date.now() - stats.updatedAt) / (1000 * 60 * 60 * 24)
       if (daysSinceUpdate < 30) return false
       const isPlanOrSpec = /plan|spec|prd|design|架构|方案/i.test(snapshot.filePath)
       return isPlanOrSpec
     }
     ```
   - buildDraft 函数：
     ```typescript
     (snapshot, deps) => {
       const stats = deps.fileStats(snapshot.filePath)!
       const daysSinceUpdate = Math.floor((Date.now() - stats.updatedAt) / (1000 * 60 * 60 * 24))
       return {
         triggerId: 'review-stale',
         priority: 'normal',
         context: { filePath: snapshot.filePath, daysSinceUpdate },
         previewTitle: `这份文档已经 ${daysSinceUpdate} 天没更新，要不要审查一下？`,
       }
     }
     ```

5. 所有触发器的 condition 函数必须为纯同步函数（< 5ms），related-content 的 buildDraft 允许异步

**验证：** 每个触发器的 condition 在匹配/不匹配场景下行为正确、buildDraft 返回正确 draft 或 null。

### 步骤 5：实现 ProactiveEngine（核心引擎）

**文件：** `src/main/services/proactive-engine/index.ts`（新建）

1. 定义 `ProactiveEngine` 类，构造函数注入：
   - `TriggerRegistry`
   - `InterruptPolicy`
   - `SubAgentExecutor`（Sprint 3.5）
   - `AppEventBus`（监听 `progress.task-running` 判断任务状态）
   - `Tracer`（Sprint 3.3）
   - `TriggerDeps`
   - `ProactiveConfig`
2. 内部状态：
   - `_latestSnapshot: EditorSnapshot | null`
   - `_isTaskRunning: boolean`（从 `progress.task-running` 事件推断）
   - `_isFullscreen: boolean`（从 Electron API 推断）
3. 实现 `initialize(): void` 方法：
   - 注册 4 个内置触发器到 `triggerRegistry`
   - 从 MEMORY.md 恢复冷却期配置 `triggerRegistry.restoreCooldowns()`
   - 订阅 `progress.task-running` 事件更新 `_isTaskRunning`
   - 订阅 Electron window 的 `fullscreen` 事件更新 `_isFullscreen`
4. 实现 `onSnapshot(snapshot: EditorSnapshot): void` 方法（IPC 推送入口）：
   - 更新 `_latestSnapshot = snapshot`
   - 若 `!config.enabled` → return（全局禁用）
   - 调用 `_evaluate()` 异步执行（不阻塞 IPC 推送）
5. 实现 `_evaluate()` 私有异步方法：
   - step 1: 全局冷却检查 `triggerRegistry.isGlobalCooldown()` → 是则 return
   - step 2: 构建 `InterruptContext`：
     ```typescript
     const context: InterruptContext = {
       snapshot: _latestSnapshot!,
       lastSuggestionAt: triggerRegistry.getLastGlobalSuggestionAt(),
       isFocused: _latestSnapshot!.isFocused,
       isTaskRunning: _isTaskRunning,
       isFullscreen: _isFullscreen,
     }
     ```
   - step 3: 遍历所有触发器
     ```typescript
     const candidates: SuggestionDraft[] = []
     for (const trigger of triggerRegistry.getAllTriggers()) {
       if (!trigger.enabled) continue
       if (triggerRegistry.isInCooldown(trigger.id)) continue
       try {
         const matches = trigger.condition(snapshot, deps)
         if (!matches) continue
         const draft = await trigger.buildDraft(snapshot, deps)
         if (draft) candidates.push(draft)
       } catch (err) {
         // 单个触发器异常不影响其他
         continue
       }
     }
     ```
   - step 4: 若 candidates 为空 → 记录 `proactive.evaluate` span（all skipped）→ return
   - step 5: 取第一个 candidate（优先级排序后）
   - step 6: canInterrupt 检查
     ```typescript
     const interrupt = interruptPolicy.canInterrupt(context)
     if (!interrupt.allowed) {
       // 记录 span: suppressed, reason
       tracer?.withSpan('proactive.evaluate', { kind: 'system' }, (span) => {
         span.setAttributes({ result: 'suppressed', reason: interrupt.reason, triggerId: candidates[0].triggerId })
       })
       return
     }
     ```
   - step 7: 调用 Sub-agent 生成建议
     ```typescript
     try {
       const result = await subAgentExecutor.spawnSubAgent('suggestion-curator', {
         triggerId: candidates[0].triggerId,
         context: candidates[0].context,
         previewTitle: candidates[0].previewTitle,
       }, { timeout: 3000 })
       
       const suggestion: Suggestion = {
         id: generateId(),
         triggerId: candidates[0].triggerId,
         title: result.title,
         body: result.body,
         acceptAction: result.acceptAction,
         declineAction: result.declineAction ?? 'dismiss',
         priority: candidates[0].priority,
         createdAt: Date.now(),
       }
       
       triggerRegistry.markFired(candidates[0].triggerId)
       _dispatchSuggestion(suggestion)
     } catch (err) {
       // Sub-agent 失败/超时 → 静默丢弃
       tracer?.withSpan('proactive.evaluate', { kind: 'system' }, (span) => {
         span.setAttributes({ result: 'sub-agent-failed', triggerId: candidates[0].triggerId })
       })
     }
     ```
6. 实现 `_dispatchSuggestion(suggestion: Suggestion)` 私有方法：
   - 通过 `eventBus` 发射 `proactive:suggestionReady` 事件
   - 通过 IPC push 推送到渲染进程 `proactive:suggestionShown`
   - 记录 `proactive.suggestion-shown` Trace span
7. 实现 `recordSuggestionOutcome(suggestionId: string, outcome: 'accepted' | 'dismissed' | 'timeout', dwellMs: number): void` 方法：
   - 获取 suggestion 的 triggerId
   - 若 outcome === 'accepted' → `triggerRegistry.recordAccept(triggerId)` + 通过命令面板 dispatch acceptAction
   - 若 outcome === 'dismissed' → `triggerRegistry.recordDismiss(triggerId)`
   - 记录 `proactive.suggestion-outcome` Trace span
8. 实现 `getConfig(): ProactiveConfig` 方法
9. 实现 `updateConfig(updates: Partial<ProactiveConfig>): void` 方法
10. 实现 `shutdown(): void` 方法：取消所有订阅

**验证：** 评估链路完整、冷却期门控正确、Sub-agent 调用正确、失败静默、Trace 完整。

### 步骤 6：实现 Sub-agent Prompt

**文件：** `resources/prompts/agents/suggestion-curator.md`（新建）

1. 编写 Sub-agent prompt 文件，遵循 Sprint 3.5 的 prompt 资源格式：
   ```markdown
   ---
   name: suggestion-curator
   description: 根据触发器上下文生成 AI 主动建议的具体文案与执行动作
   inherit_memory: false
   allowed_tools:
     - reference_file
     - unified_search
   output_schema:
     type: object
     properties:
       title:
         type: string
         description: 简明建议标题（10字以内）
       body:
         type: string
         description: 1-2 句简明描述说明为什么建议
       acceptAction:
         type: object
         properties:
           command: { type: string }
           args: { type: object }
         required: [command]
       declineAction:
         type: string
         enum: [dismiss, snooze-1h, never]
     required: [title, body, acceptAction]
   ---
   
   你是 Sibylla 的主动建议助手。用户正在编辑器中工作，系统检测到一个合适时机，需要你生成一条简明建议。
   
   ## 输入
   你会收到：
   - triggerId: 触发器 ID（task-decomposition / related-content / memory-promote / review-stale）
   - context: 触发器上下文数据
   - previewTitle: 预览标题提示
   
   ## 各触发器的建议风格
   
   ### task-decomposition
   - 语气：帮助性的、不强迫
   - 示例标题："想要拆解任务吗？"
   - acceptAction: { command: "ai.extractTasks", args: { filePath: "..." } }
   
   ### related-content
   - 语气：提醒性的、辅助参考
   - 示例标题："找到 3 篇相关文档"
   - acceptAction: { command: "search.openResults", args: { query: "..." } }
   
   ### memory-promote
   - 语气：建议性的、团队意识
   - 示例标题："这看起来是个团队约定"
   - acceptAction: { command: "memory.addEntry", args: { content: "..." } }
   
   ### review-stale
   - 语气：提醒性的、温和
   - 示例标题："这份文档该更新了"
   - acceptAction: { command: "file.openHistory", args: { path: "..." } }
   
   ## 输出格式
   输出结构化 JSON（遵循 output_schema）。标题简洁（10 字以内），body 1-2 句话。
   ```
2. 确认 prompt 文件放入 `resources/prompts/agents/` 目录
3. 确认 acceptAction 的 command 复用已有命令面板命令（Sprint 3.4 CommandRegistry）

**验证：** prompt 格式符合 Sprint 3.5 规范、output_schema 正确、各触发器风格指导清晰。

### 步骤 7：实现 IPC Handlers 与 Preload

**文件：** `src/main/ipc/handlers/proactive-engine.ts`（新建）

1. 注册 IPC handlers：

   **`proactive:editorSnapshot`**（R→M，渲染进程推送）：
   - 参数：`{ snapshot: EditorSnapshot }`
   - 实现：调用 `proactiveEngine.onSnapshot(snapshot)`
   - 返回：`void`（fire-and-forget，不阻塞渲染进程）

   **`proactive:getConfig`**：
   - 参数：无
   - 实现：返回 `proactiveEngine.getConfig()`
   - 返回：`ProactiveConfig`

   **`proactive:updateConfig`**：
   - 参数：`{ updates: Partial<ProactiveConfig> }`
   - 实现：调用 `proactiveEngine.updateConfig(updates)`
   - 返回：`void`

   **`proactive:dismissSuggestion`**：
   - 参数：`{ suggestionId: string; dwellMs: number }`
   - 实现：调用 `proactiveEngine.recordSuggestionOutcome(suggestionId, 'dismissed', dwellMs)`
   - 返回：`void`

   **`proactive:acceptSuggestion`**：
   - 参数：`{ suggestionId: string; dwellMs: number }`
   - 实现：调用 `proactiveEngine.recordSuggestionOutcome(suggestionId, 'accepted', dwellMs)`
   - 返回：`void`

2. 注册 M→R 推送事件：
   - `proactive:suggestionShown` — 新建议生成时推送（携带 Suggestion 对象）

**文件：** `src/shared/types.ts`（扩展）

3. 在 `IPC_CHANNELS` 中追加：
   ```typescript
   PROACTIVE_EDITOR_SNAPSHOT: 'proactive:editorSnapshot',
   PROACTIVE_GET_CONFIG: 'proactive:getConfig',
   PROACTIVE_UPDATE_CONFIG: 'proactive:updateConfig',
   PROACTIVE_DISMISS_SUGGESTION: 'proactive:dismissSuggestion',
   PROACTIVE_ACCEPT_SUGGESTION: 'proactive:acceptSuggestion',
   ```

**文件：** `src/preload/index.ts`（扩展）

4. 追加 `proactive` 命名空间：
   ```typescript
   proactive: {
     pushSnapshot: (snapshot) => ipcRenderer.send('proactive:editorSnapshot', { snapshot }),
     getConfig: () => ipcRenderer.invoke('proactive:getConfig'),
     updateConfig: (updates) => ipcRenderer.invoke('proactive:updateConfig', { updates }),
     dismissSuggestion: (id, dwellMs) => ipcRenderer.invoke('proactive:dismissSuggestion', { suggestionId: id, dwellMs }),
     acceptSuggestion: (id, dwellMs) => ipcRenderer.invoke('proactive:acceptSuggestion', { suggestionId: id, dwellMs }),
   },
   ```
   - 注意 `pushSnapshot` 使用 `ipcRenderer.send`（fire-and-forget），不使用 `invoke`（避免阻塞）

**验证：** IPC 通道注册正确、snapshot 推送不阻塞、双向通信正确。

### 步骤 8：实现 useEditorSnapshotCollector Hook

**文件：** `src/renderer/components/proactive/useEditorSnapshotCollector.ts`（新建）

1. 定义 `useEditorSnapshotCollector` hook：
   ```typescript
   export function useEditorSnapshotCollector(editor: Editor | null)
   ```
2. 内部状态管理：
   - `_typingBuffer: number[]` — 滑动窗口记录最近 10 秒的字符输入时间戳
   - `_lastUpdateAt: number` — 最后编辑器更新时间
   - `_continuousStartAt: number | null` — 连续输入起始时间
3. 每秒采样逻辑（setInterval 1 秒）：
   - 获取编辑器当前状态：
     ```typescript
     const state = editor.state
     const text = state.doc.textContent
     const recentText = text.slice(-500)
     const length = text.length
     ```
   - 计算 typingVelocity（滑动窗口 10 秒）：
     ```typescript
     const now = Date.now()
     _typingBuffer = _typingBuffer.filter(t => now - t < 10000)
     const velocity = (_typingBuffer.length / 10) * 60 // 字/分钟
     ```
   - 计算 continuousTypingMinutes：
     ```typescript
     const continuous = _continuousStartAt
       ? (now - _continuousStartAt) / 60000
       : 0
     ```
   - 组装 EditorSnapshot：
     ```typescript
     const snapshot: EditorSnapshot = {
       filePath: currentFilePath,
       contentSummary: { length, recentText },
       typingVelocity: velocity,
       continuousTypingMinutes: continuous,
       cursorPosition: state.selection.from,
       selectionLength: Math.abs(state.selection.to - state.selection.from),
       lastInteractionAt: now,
       currentAiMode: getCurrentAiMode(),
       isFocused: getFocusModeState(),
     }
     ```
   - 通过 2 秒防抖后推送到主进程：
     ```typescript
     debouncedPush(snapshot) // 2 秒防抖
     ```
4. 监听 Tiptap 事件：
   - `editor.on('update', handleUpdate)`：记录字符到 typingBuffer、更新 continuousStartAt
   - `editor.on('selectionUpdate', handleSelection)`：更新 cursorPosition
5. 清理逻辑（unmount）：清除 interval、移除事件监听
6. 不修改 Tiptap 编辑器扩展

**验证：** snapshot 采样频率正确、typingVelocity 计算正确、防抖推送正确、不修改编辑器扩展。

### 步骤 9：实现 SuggestionToast / SuggestionQueue / OverlayManager

**文件：** `src/renderer/store/proactiveStore.ts`（新建）

1. 定义 `ProactiveState` 接口：
   ```typescript
   interface ProactiveState {
     currentSuggestion: Suggestion | null
     pendingQueue: Suggestion[]
     config: ProactiveConfig | null
     showAt: number | null

     pushSuggestion: (suggestion: Suggestion) => void
     dismissCurrent: () => void
     acceptCurrent: () => void
     clearCurrent: () => void
     fetchConfig: () => Promise<void>
     updateConfig: (updates: Partial<ProactiveConfig>) => Promise<void>
   }
   ```
2. 创建 Zustand store：
   - `pushSuggestion`：若 `currentSuggestion === null` → 直接设置；否则加入 `pendingQueue`
   - `dismissCurrent`：调用 IPC `proactive:dismissSuggestion`，然后弹出 pendingQueue 下一个或置空
   - `acceptCurrent`：调用 IPC `proactive:acceptSuggestion`，然后弹出下一个
   - `clearCurrent`：直接置空（timeout 场景）
3. 监听 IPC 推送 `proactive:suggestionShown`，自动调用 `pushSuggestion`

**文件：** `src/renderer/components/proactive/SuggestionToast.tsx`（新建）

4. 建议 Toast 组件（右下角）：
   - Props：`{ suggestion: Suggestion; onDismiss: () => void; onAccept: () => void }`
   - 默认折叠态：
     - 图标（💡）+ 标题（粗体）+ 1 行 body 预览
     - 右侧关闭按钮（×）
     - 底部操作栏：`[Accept 按钮] [稍后] [×]`
   - 展开态（点击标题或"展开"）：
     - 完整 body 文本
     - acceptAction 按钮文案（来自 suggestion.acceptAction.command 的友好映射）
   - 进入动画：`framer-motion`，从右侧滑入 + 淡入，300ms
   - 离开动画：淡出，200ms
   - 位置：`fixed bottom-4 right-4`，z-index 高于编辑器但低于模态框
   - 自动淡出计时器：
     - 15 秒无交互 → 自动关闭（调用 onDismiss）
     - 鼠标悬停 → 暂停计时
     - 鼠标离开 → 重置为 5 秒
   - Esc 全局快捷键：
     ```typescript
     useEffect(() => {
       const handler = (e: KeyboardEvent) => {
         if (e.key === 'Escape') onDismiss()
       }
       window.addEventListener('keydown', handler)
       return () => window.removeEventListener('keydown', handler)
     }, [])
     ```
   - Accept 按钮点击：
     ```typescript
     const handleAccept = () => {
       // 通过命令面板 dispatch acceptAction
       window.electronAPI.commandPalette.dispatch(suggestion.acceptAction.command, suggestion.acceptAction.args)
       onAccept()
     }
     ```
   - 声音：priority === 'urgent' 时播放轻量提示音（可通过 config 关闭）

**文件：** `src/renderer/components/proactive/SuggestionQueue.tsx`（新建）

5. 建议队列容器组件：
   - 从 `proactiveStore` 获取 `currentSuggestion`
   - 若 `currentSuggestion !== null` → 渲染 `<SuggestionToast />`
   - 使用 `AnimatePresence` 管理进出动画
   - 渲染逻辑：
     ```typescript
     export function SuggestionQueue() {
       const { currentSuggestion, dismissCurrent, acceptCurrent } = useProactiveStore()
       
       if (!currentSuggestion) return null
       
       return (
         <AnimatePresence>
           <SuggestionToast
             key={currentSuggestion.id}
             suggestion={currentSuggestion}
             onDismiss={dismissCurrent}
             onAccept={acceptCurrent}
           />
         </AnimatePresence>
       )
     }
     ```
   - 挂载于应用根组件（App.tsx），不在编辑器内部

**文件：** `src/renderer/components/proactive/OverlayManager.tsx`（新建）

6. 轻量覆盖层协调器：
   - 管理全局覆盖层的排他显示：
     - Sprint 3.6 Onboarding tour（如果正在展示）
     - Sprint 5 SuggestionToast
   - 使用 Zustand store 管理：
     ```typescript
     interface OverlayState {
       activeOverlay: 'onboarding' | 'suggestion' | null
       requestOverlay: (id: string) => boolean // 返回是否获得展示权
       releaseOverlay: (id: string) => void
     }
     ```
   - SuggestionToast 在展示前检查 `overlayManager.requestOverlay('suggestion')`
   - Onboarding tour 在展示前检查 `overlayManager.requestOverlay('onboarding')`
   - 已有覆盖层时，新的请求被拒绝（排队等待）

**文件：** `src/renderer/App.tsx`（修改）

7. 在应用根组件中挂载 `<SuggestionQueue />`

**验证：** Toast 动画流畅、自动淡出正确、Esc 关闭正确、排队展示正确、OverlayManager 排他正确。

### 步骤 10：集成测试与验证

1. **触发器评估端到端测试：**
   - 模拟 EditorSnapshot（含目标关键词、文档 > 200 字、无清单格式）→ task-decomposition 触发
   - 模拟 EditorSnapshot（文档 < 100 字，mock searchEngine 返回 5 条结果）→ related-content 触发
   - 模拟 EditorSnapshot（含"我们决定"、不在 knownMemoryPatterns 中）→ memory-promote 触发
   - 模拟 EditorSnapshot（文件 > 30 天未更新、路径含 "plan"）→ review-stale 触发

2. **canInterrupt 策略组合测试：**
   - 深度专注（velocity > 50）→ 抑制
   - 焦点模式 + normal priority → 抑制
   - AiMode=Plan + taskRunning → 抑制
   - 全局冷却 < 5 分钟 → 抑制
   - 所有条件通过 → 允许

3. **冷却期自适应测试：**
   - 连续 dismiss 3 次 → 冷却期翻倍
   - 连续 accept 3 次 → 冷却期减半
   - 边界：翻倍不超过 24 小时、减半不低于 5 分钟

4. **Sub-agent 调用测试：**
   - mock SubAgentExecutor → 验证调用参数正确
   - mock 超时 → 验证静默丢弃
   - mock 失败 → 验证静默丢弃

5. **UI 组件测试：**
   - SuggestionToast 渲染、动画、自动淡出、Esc 关闭
   - SuggestionQueue 排队逻辑
   - OverlayManager 排他逻辑

6. **性能测试：**
   - 触发器评估 < 50ms（P95）
   - 端到端建议生成 < 3 秒
   - Toast 渲染 < 100ms

## 现有代码基础

| 已有模块 | 文件路径 | 本任务使用方式 |
|---------|---------|-------------|
| SubAgentExecutor | `src/main/services/ai/sub-agent-executor.ts` | 调用 spawnSubAgent 生成建议 |
| AppEventBus | `src/main/services/event-bus/` | 监听 progress.task-running 事件 |
| Tracer | `src/main/services/trace/tracer.ts` | 所有评估/建议行为进 Trace |
| AiModeRegistry | `src/main/services/mode/ai-mode-registry.ts` | 获取当前 AiMode |
| CommandRegistry | `src/main/services/commands/command-registry.ts` | acceptAction dispatch 执行 |
| UnifiedSearchEngine | `src/main/services/search/unified-search-engine.ts` | related-content 触发器调用搜索 |
| FocusModeController | `src/main/services/mode/focus-mode-controller.ts` | 检查焦点模式状态 |
| Tiptap Editor | `src/renderer/components/editor/Editor.tsx` | hook 挂载点 |
| IPC 类型注册 | `src/shared/types.ts` | 追加 IPC_CHANNELS 常量 |
| Preload 暴露 | `src/preload/index.ts` | 追加 proactive 命名空间 |

## 新增文件清单

| 模块 | 文件路径 | 说明 |
|------|---------|------|
| 类型系统 | `src/main/services/proactive-engine/types.ts` | EditorSnapshot / Trigger / Suggestion 类型 |
| 常量 | `src/main/services/proactive-engine/constants.ts` | 默认配置与阈值 |
| 触发器注册 | `src/main/services/proactive-engine/trigger-registry.ts` | 冷却期管理 |
| 打断策略 | `src/main/services/proactive-engine/interrupt-policy.ts` | canInterrupt 策略 |
| 任务拆解触发器 | `src/main/services/proactive-engine/triggers/task-decomposition.ts` | 目标关键词检测 |
| 相关内容触发器 | `src/main/services/proactive-engine/triggers/related-content.ts` | 搜索相关文档 |
| 记忆提升触发器 | `src/main/services/proactive-engine/triggers/memory-promote.ts` | 团队约定检测 |
| 过期审查触发器 | `src/main/services/proactive-engine/triggers/review-stale.ts` | 文档保鲜提醒 |
| 引擎主类 | `src/main/services/proactive-engine/index.ts` | ProactiveEngine |
| Sub-agent | `resources/prompts/agents/suggestion-curator.md` | 建议生成 AI prompt |
| IPC | `src/main/ipc/handlers/proactive-engine.ts` | IPC handlers |
| Store | `src/renderer/store/proactiveStore.ts` | Zustand 建议状态 |
| Hook | `src/renderer/components/proactive/useEditorSnapshotCollector.ts` | 编辑器状态采集 |
| Toast | `src/renderer/components/proactive/SuggestionToast.tsx` | 右下角建议 Toast |
| 队列 | `src/renderer/components/proactive/SuggestionQueue.tsx` | 建议排队管理 |
| 覆盖协调 | `src/renderer/components/proactive/OverlayManager.tsx` | 全局覆盖层排他 |

## 涉及的现有文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/shared/types.ts` | 扩展 | IPC_CHANNELS 追加 5 个通道常量 |
| `src/preload/index.ts` | 扩展 | 追加 proactive 命名空间 |
| `src/renderer/App.tsx` | 扩展 | 挂载 SuggestionQueue |

**不修改的文件：**

- `src/main/services/ai/sub-agent-executor.ts` — 不修改 Sub-agent 执行器
- `src/main/services/commands/command-registry.ts` — 不修改，仅 dispatch 已有命令
- `src/renderer/components/editor/Editor.tsx` — 不修改 Tiptap 扩展，hook 独立挂载
- `src/main/services/search/unified-search-engine.ts` — 不修改，仅调用 search()

---

**创建时间：** 2026-04-30
**最后更新：** 2026-04-30
**更新记录：**
- 2026-04-30 — 创建任务文档（含完整技术执行路径 10 步）
