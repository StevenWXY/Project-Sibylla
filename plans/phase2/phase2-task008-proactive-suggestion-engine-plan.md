# PHASE2-TASK008: AI 主动建议引擎与建议 UI — 实施计划

> 任务来源：[specs/tasks/phase2/phase2-task008_proactive-suggestion-engine.md](../../specs/tasks/phase2/phase2-task008_proactive-suggestion-engine.md)
> 创建日期：2026-04-30
> 最后更新：2026-04-30

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK008 |
| **任务标题** | AI 主动建议引擎与建议 UI |
| **所属阶段** | Phase 2 - 智能通知与协作增强 (Sprint 5) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | TASK001 + TASK002 + TASK006 + Sprint 3.2~3.6 |

### 1.1 目标

构建 AI 主动建议引擎——让 Sibylla 从"被动响应"升级为"在合适时机主动开口"。通过启发式触发器（不调用 LLM）评估编辑上下文，在触发条件满足且不打扰用户时，通过 Sub-agent 生成建议并以非侵入式右下角 Toast 展现。

### 1.2 核心设计约束

1. **评估不调 LLM**：触发器 condition 纯启发式，< 50ms
2. **触发后才调 LLM**：仅通过后调 `spawnSubAgent('suggestion-curator')`
3. **复用 Sub-agent**：不引入新 AI 调用路径
4. **canInterrupt 多层保护**：深度专注、焦点模式、任务执行中、冷却期
5. **建议不进通知中心**：Toast 即查即决
6. **失败静默**：Sub-agent 超时/失败静默丢弃
7. **冷却期自适应**：连续 dismiss 翻倍，连续 accept 减半

### 1.3 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| 类型系统 | `src/main/services/proactive-engine/types.ts` | EditorSnapshot / Trigger / Suggestion 类型 |
| 常量配置 | `src/main/services/proactive-engine/constants.ts` | 默认配置与阈值 |
| 触发器注册 | `src/main/services/proactive-engine/trigger-registry.ts` | 冷却期管理 |
| 打断策略 | `src/main/services/proactive-engine/interrupt-policy.ts` | canInterrupt 策略 |
| 任务拆解触发器 | `src/main/services/proactive-engine/triggers/task-decomposition.ts` | 目标关键词检测 |
| 相关内容触发器 | `src/main/services/proactive-engine/triggers/related-content.ts` | 搜索相关文档 |
| 记忆提升触发器 | `src/main/services/proactive-engine/triggers/memory-promote.ts` | 团队约定检测 |
| 过期审查触发器 | `src/main/services/proactive-engine/triggers/review-stale.ts` | 文档保鲜提醒 |
| 引擎主类 | `src/main/services/proactive-engine/index.ts` | ProactiveEngine |
| Sub-agent Prompt | `resources/prompts/agents/suggestion-curator.md` | 建议生成 AI prompt |
| IPC Handler | `src/main/ipc/handlers/proactive-engine.ts` | IPC handlers |
| Zustand Store | `src/renderer/store/proactiveStore.ts` | 建议状态管理 |
| Hook | `src/renderer/components/proactive/useEditorSnapshotCollector.ts` | 编辑器状态采集 |
| Toast | `src/renderer/components/proactive/SuggestionToast.tsx` | 右下角建议 Toast |
| 队列 | `src/renderer/components/proactive/SuggestionQueue.tsx` | 建议排队管理 |
| 覆盖协调 | `src/renderer/components/proactive/OverlayManager.tsx` | 全局覆盖层排他 |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；AI 建议人类决策；失败静默不吞异常 | 全局约束 |
| `specs/design/architecture.md` | 主进程/渲染进程严格隔离，IPC 通信 | 进程通信 |
| `specs/design/ui-ux-design.md` | Toast 右下角、6px 圆角、品牌色 #6366F1 | UI 设计 |
| `specs/design/sub-agent-system.md` | spawnSubAgent 接口、output_schema、超时 | Sub-agent 集成 |
| `specs/requirements/phase2/sprint5-collaboration.md` | 需求 5.5/5.6、§3 非功能需求 | 验收标准 |
| `specs/tasks/phase2/phase2-task008_proactive-suggestion-engine.md` | 10 步执行路径、全部验收标准 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `zustand-state-management` | proactiveStore 设计；selector 性能优化；IPC 封装在 action 中 | proactiveStore.ts |
| `electron-ipc-patterns` | Preload API 扩展；snapshot fire-and-forget 推送；推送事件注册 | preload + IPC handler |
| `llm-streaming-integration` | Sub-agent 超时管理 | ProactiveEngine Sub-agent 调用 |
| `tiptap-wysiwyg-editor` | EditorSnapshot 采集 hook 挂载 | useEditorSnapshotCollector |

### 2.3 前置代码依赖

| 模块 | 文件路径 | 复用方式 |
|------|---------|---------|
| `SubAgentExecutor` | `src/main/services/sub-agent/spawnSubAgentTool.ts` | `spawnSubAgent(agentId, params)` 生成建议 |
| `AppEventBus` | `src/main/services/event-bus.ts` | `subscribe('progress.task-running')` 判断任务状态 |
| `Tracer` | `src/main/services/trace/tracer.ts` | `withSpan()` 记录评估/建议 Trace |
| `AiModeRegistry` | `src/main/services/mode/ai-mode-registry.ts` | `getActiveModeId()` 获取当前 AiMode |
| `CommandRegistry` | `src/main/services/command/command-registry.ts` | `execute(id)` dispatch acceptAction |
| `UnifiedSearchEngine` | `src/main/services/unified-search/unified-search-engine.ts` | `search(query)` 为 related-content 触发器搜索 |
| `FocusModeController` | `src/main/services/mode/focus-mode-controller.ts` | `isFocused()` 检查焦点模式 |
| `IPC_CHANNELS` | `src/shared/types.ts` | 追加 5 个通道常量 + 1 个推送通道 |
| Preload API | `src/preload/index.ts` | 追加 proactive 命名空间 |
| Tiptap Editor | `src/renderer/components/editor/Editor.tsx` | hook 独立挂载点 |
| Zustand stores | `src/renderer/store/*.ts` | 遵循已有 devtools + action 命名规范 |

### 2.4 前置任务依赖

| 任务 | 提供能力 | 本任务消费方式 |
|------|---------|-------------|
| PHASE2-TASK001 事件总线 | `AppEventBus.subscribe()` | 监听 `progress.task-running` / `progress.task-completed` |
| PHASE2-TASK002 统一搜索 | `UnifiedSearchEngine.search()` | related-content 触发器调用 |
| PHASE2-TASK006 通知中心 | 焦点模式状态 + 系统通知 | 检查焦点模式、不进通知列表 |
| Sprint 3.2 记忆系统 | `MEMORY.md` 读写 | 冷却期持久化、knownMemoryPatterns |
| Sprint 3.3 Trace | `Tracer.withSpan()` | 所有评估/建议行为进 Trace |
| Sprint 3.4 AiMode | `AiModeRegistry` + 命令面板 | currentAiMode 检查、acceptAction dispatch |
| Sprint 3.5 Sub-agent | `SubAgentExecutor.spawnSubAgent()` | 生成建议内容 |
| Sprint 3.6 MCP/Onboarding | Onboarding tour | OverlayManager 排他显示 |

---

## 三、现有代码盘点与差距分析

### 3.1 主进程端现状

| 模块 | 现状 | 缺口 |
|------|------|------|
| `proactive-engine/` 目录 | **不存在**，需全新创建 | 全部：types / constants / trigger-registry / interrupt-policy / triggers / index |
| `SubAgentExecutor` | 已实现 `spawnSubAgent(agentId, params)` | 无缺口，直接调用 |
| `AppEventBus` | 已实现 `subscribe(type, handler)` | 无缺口，直接订阅 |
| `Tracer` | 已实现 `withSpan(name, fn, opts)` | 无缺口，直接调用 |
| `CommandRegistry` | 已实现 `execute(id)` | 无缺口，dispatch acceptAction |
| `UnifiedSearchEngine` | 已实现 `search(query)` → `UnifiedSearchResponse` | 无缺口，related-content 触发器调用 |
| `FocusModeController` | 已实现 `isFocused()` | 无缺口 |

### 3.2 IPC 层现状

| 项目 | 现状 | 缺口 |
|------|------|------|
| `IPC_CHANNELS` 常量 | 已有 ~150 条通道 | 需追加 5 条 proactive 通道 + 1 条推送通道 |
| `IPCChannelMap` 类型 | 已有完整类型映射 | 需追加 6 条通道的类型定义 |
| Preload API | 已有 20+ 命名空间 | 需追加 `proactive` 命名空间 |
| `ALLOWED_CHANNELS` | 已注册所有已有通道 | 需追加 6 条通道 |

### 3.3 渲染进程端现状

| 模块 | 现状 | 缺口 |
|------|------|------|
| `proactiveStore.ts` | **不存在**，需新建 | 全部 |
| `useEditorSnapshotCollector.ts` | **不存在**，需新建 | 全部 |
| `SuggestionToast.tsx` | **不存在**，需新建 | 全部 |
| `SuggestionQueue.tsx` | **不存在**，需新建 | 全部 |
| `OverlayManager.tsx` | **不存在**，需新建 | 全部 |
| `App.tsx` 全局覆盖层 | 已有 `GuardrailNotification` / `CommandPalette` / `UnifiedSearchPaletteWrapper` | 需追加 `<SuggestionQueue />` |
| Tiptap Editor | 已有 `editor.on('update')` 事件体系 | hook 独立挂载，不修改编辑器扩展 |

### 3.4 Sub-agent Prompt 现状

| 项目 | 现状 | 缺口 |
|------|------|------|
| `resources/prompts/agents/` | 已有多个 agent prompt 文件 | 需新建 `suggestion-curator.md` |
| Prompt 格式 | 已有 frontmatter 规范（id / output_schema / allowed_tools） | 需遵循格式新建 |

### 3.5 不修改的文件

- `src/main/services/sub-agent/spawnSubAgentTool.ts` — 不修改，仅调用
- `src/main/services/command/command-registry.ts` — 不修改，仅 dispatch 已有命令
- `src/renderer/components/editor/Editor.tsx` — 不修改 Tiptap 扩展，hook 独立挂载
- `src/main/services/search/unified-search-engine.ts` — 不修改，仅调用 `search()`

---

## 四、分步实施计划

### 阶段 A：类型系统与常量 + TriggerRegistry（Step 1-2） — 预计 0.5 天

#### A1：创建 types.ts

**文件：** `src/main/services/proactive-engine/types.ts`（新建）

**核心类型定义：**（严格遵循任务文档 §Step 1，全部 interface 无 any）

| 类型 | 用途 |
|------|------|
| `TriggerId` | 联合类型：`'task-decomposition' \| 'related-content' \| 'memory-promote' \| 'review-stale'` |
| `SuggestionPriority` | 联合类型：`'urgent' \| 'normal'` |
| `SuggestionOutcome` | 联合类型：`'accepted' \| 'dismissed' \| 'timeout'` |
| `EditorSnapshot` | filePath / contentSummary / typingVelocity / continuousTypingMinutes / cursorPosition / selectionLength / lastInteractionAt / currentAiMode / isFocused |
| `SuggestionDraft` | triggerId / priority / context / previewTitle |
| `Suggestion` | id / triggerId / title / body / acceptAction / declineAction / priority / createdAt |
| `TriggerDeps` | searchEngine / memoryStore / fileStats / knownMemoryPatterns（依赖注入接口） |
| `Trigger` | id / description / enabled / defaultCooldownMinutes / condition(同步) / buildDraft(可异步) |
| `InterruptContext` | snapshot / lastSuggestionAt / isFocused / isTaskRunning / isFullscreen / currentAiMode |
| `ProactiveConfig` | enabled / globalCooldownMinutes / triggerOverrides / interruptPolicy |
| `CooldownRecord` | currentMinutes / lastFiredAt |

**验证：** 类型编译通过、无 any、AiModeId 从 `mode/types` 正确导入。

#### A2：创建 constants.ts

**文件：** `src/main/services/proactive-engine/constants.ts`（新建）

```typescript
import type { ProactiveConfig, TriggerId } from './types'

export const DEFAULT_PROACTIVE_CONFIG: ProactiveConfig = {
  enabled: true,
  globalCooldownMinutes: 5,
  triggerOverrides: {},
  interruptPolicy: {
    suppressDuringTaskExecution: true,
    suppressInDeepFocus: true,
    suppressDuringFocusMode: true,
  },
}

export const MIN_COOLDOWN_MINUTES = 5
export const MAX_COOLDOWN_MINUTES = 1440
export const DISMISS_ADJUST_COUNT = 3
export const ADJUST_WINDOW_HOURS = 24
export const DEEP_FOCUS_VELOCITY = 50
export const DEEP_FOCUS_MINUTES = 5
export const SUB_AGENT_TIMEOUT_MS = 3000
export const DEFAULT_TRIGGER_COOLDOWNS: Record<TriggerId, number> = {
  'task-decomposition': 30,
  'related-content': 30,
  'memory-promote': 60,
  'review-stale': 60,
}
```

#### A3：创建 TriggerRegistry

**文件：** `src/main/services/proactive-engine/trigger-registry.ts`（新建）

**核心职责：** 触发器注册、冷却期管理（独立 + 全局）、自适应翻倍/减半。

**实现要点：**

1. **状态管理：**
   - `triggers: Map<TriggerId, Trigger>` — 注册的触发器
   - `cooldowns: Map<TriggerId, CooldownRecord>` — 每个触发器的冷却配置
   - `dismissCounts / acceptCounts: Map<TriggerId, { count: number; windowStart: number }>` — 自适应统计
   - `lastGlobalSuggestionAt: number | null` — 全局冷却基准

2. **关键方法：**

| 方法 | 行为 |
|------|------|
| `register(trigger)` | 注册触发器，初始化冷却配置 |
| `isInCooldown(triggerId)` | 检查独立冷却期是否生效 |
| `isGlobalCooldown()` | 检查全局 5 分钟冷却期 |
| `markFired(triggerId)` | 标记触发器已触发，更新独立 + 全局冷却 |
| `recordDismiss(triggerId)` | 记录 dismiss，达到阈值调用 `_doubleCooldown()` |
| `recordAccept(triggerId)` | 记录 accept，达到阈值调用 `_halveCooldown()` |
| `restoreCooldowns(map)` | 从 MEMORY.md 恢复冷却期 |
| `getLastGlobalSuggestionAt()` | 获取全局最后触发时间 |

3. **自适应冷却期逻辑：**
   - `_doubleCooldown(triggerId)`: currentMinutes × 2，封顶 MAX_COOLDOWN_MINUTES（1440），调用 `deps.memoryStore.persistCooldown()`，记录 Trace
   - `_halveCooldown(triggerId)`: currentMinutes ÷ 2，保底 MIN_COOLDOWN_MINUTES（5），调用持久化回调
   - 滑动窗口：dismiss/accept 计数 24 小时后重置；dismiss 达到 3 次 → 翻倍并重置 accept 计数；accept 达到 3 次 → 减半并重置 dismiss 计数

4. **构造函数注入：**
   - `onCooldownChange: (triggerId: TriggerId, minutes: number) => Promise<void>` — 冷却期变化回调（写入 MEMORY.md）
   - `tracer?: Tracer` — 可选 Trace 记录

**验证：** 冷却期检查正确、翻倍减半边界正确、全局冷却独立工作、持久化回调被调用。

### 阶段 B：InterruptPolicy 与内置触发器（Step 3-4） — 预计 0.5 天

#### B1：创建 InterruptPolicy

**文件：** `src/main/services/proactive-engine/interrupt-policy.ts`（新建）

**职责：** 集中判断 canInterrupt 策略，决定是否允许展示建议。

**实现逻辑（严格按顺序检查）：**

```
canInterrupt(context: InterruptContext): { allowed: boolean; reason?: string }

Step 1: 深度专注检测（suppressInDeepFocus=true 时）
  - typingVelocity > 50 字/分钟 → { allowed: false, reason: 'deep-focus-high-velocity' }
  - continuousTypingMinutes > 5 分钟 → { allowed: false, reason: 'deep-focus-continuous' }

Step 2: 全局冷却检查
  - lastSuggestionAt !== null && elapsed < globalCooldownMinutes × 60s → { allowed: false, reason: 'global-cooldown' }

Step 3: 焦点模式检查（suppressDuringFocusMode=true 时）
  - isFocused → { allowed: false, reason: 'focus-mode-active' }

Step 4: 任务执行中检查（suppressDuringTaskExecution=true 时）
  - isTaskRunning → { allowed: false, reason: 'task-executing' }

Step 5: 全屏模式检查
  - isFullscreen → { allowed: false, reason: 'fullscreen' }

Step 6: AiMode 检查
  - currentAiMode === 'plan' && isTaskRunning → { allowed: false, reason: 'plan-mode-task-running' }

Step 7: 全部通过 → { allowed: true }
```

**配置更新：** `updateConfig(partial: Partial<ProactiveConfig>)` 允许运行时修改策略。

**验证：** 每个抑制条件独立正确、组合正确、配置热更新生效。

#### B2：创建 4 个内置触发器

**目录：** `src/main/services/proactive-engine/triggers/`（新建）

**所有触发器遵循统一接口：** `Trigger`（来自 types.ts），condition 同步（< 5ms），buildDraft 可同步或异步。

##### B2-1：task-decomposition.ts

**触发条件：** 用户写了目标/需求关键词但没有任务清单格式，且内容 > 200 字。

```
condition:
  - text = snapshot.contentSummary.recentText
  - hasGoalKeywords = /目标|要做|需求|计划|里程碑|scope/.test(text)
  - hasListFormat = /^[-*]\s|\d+\.\s/m.test(text)
  - return hasGoalKeywords && !hasListFormat && length > 200

buildDraft:
  - previewTitle: '想要拆解任务吗？'
  - context: { filePath, contentLength }
  - priority: 'normal'
  - defaultCooldownMinutes: 30
```

##### B2-2：related-content.ts

**触发条件：** 用户开始写新文档（内容 < 100 字），文件名 ≥ 2 字符。实际搜索在 buildDraft 中执行。

```
condition:
  - length > 100 → false
  - fileName < 2 字符 → false
  - return true

buildDraft (async):
  - fileName = filePath.split('/').pop().replace('.md', '')
  - results = await deps.searchEngine.search(fileName, { limit: 5 })
  - results.length < 3 → return null
  - previewTitle: `找到 ${results.length} 篇相关文档，要不要参考？`
  - context: { relatedFiles: results.slice(0, 5).map(r => r.filePath) }
  - priority: 'normal'
  - defaultCooldownMinutes: 30
```

**注意：** 此触发器的 buildDraft 是异步的（调用搜索），ProactiveEngine 需 await。

##### B2-3：memory-promote.ts

**触发条件：** 当前文本包含团队约定关键词且不在已知记忆模式中。

```
condition:
  - hasConventionPattern = /我们决定|以后都用|团队规则|约定|standard|convention/.test(text)
  - isKnown = deps.knownMemoryPatterns.some(p => text.includes(p))
  - return hasConventionPattern && !isKnown

buildDraft:
  - previewTitle: '这看起来像个团队约定，记到 MEMORY 里？'
  - context: { filePath }
  - priority: 'normal'
  - defaultCooldownMinutes: 60
```

##### B2-4：review-stale.ts

**触发条件：** 打开超过 30 天未更新且文件名含 plan/spec/prd/design 的文档。

```
condition:
  - stats = deps.fileStats(filePath) → null 则 false
  - daysSinceUpdate = (now - updatedAt) / (1000 × 60 × 60 × 24) < 30 → false
  - isPlanOrSpec = /plan|spec|prd|design|架构|方案/i.test(filePath)
  - return isPlanOrSpec

buildDraft:
  - daysSinceUpdate = Math.floor(...)
  - previewTitle: `这份文档已经 ${days} 天没更新，要不要审查一下？`
  - context: { filePath, daysSinceUpdate }
  - priority: 'normal'
  - defaultCooldownMinutes: 60
```

**验证：** 每个触发器的 condition 在匹配/不匹配场景下行为正确、buildDraft 返回正确 draft 或 null。

### 阶段 C：ProactiveEngine 核心引擎（Step 5） — 预计 0.5 天

**文件：** `src/main/services/proactive-engine/index.ts`（新建）

**核心职责：** 接收 EditorSnapshot → 冷却检查 → 遍历触发器 → canInterrupt 门控 → 调用 Sub-agent → 派发建议。

#### C1：构造函数依赖注入

```typescript
class ProactiveEngine {
  constructor(
    private readonly triggerRegistry: TriggerRegistry,
    private readonly interruptPolicy: InterruptPolicy,
    private readonly subAgentExecutor: { spawnSubAgent: (id: string, params: Record<string, unknown>) => Promise<unknown> },
    private readonly eventBus: AppEventBus,
    private readonly tracer: Tracer | null,
    private readonly deps: TriggerDeps,
    private readonly commandRegistry: { execute: (id: string) => Promise<void> },
    private config: ProactiveConfig,
    private readonly sendToRenderer: (channel: string, data: unknown) => void,
  )
}
```

#### C2：内部状态

| 状态 | 类型 | 来源 |
|------|------|------|
| `_latestSnapshot` | `EditorSnapshot \| null` | IPC 推送更新 |
| `_isTaskRunning` | `boolean` | `eventBus.subscribe('progress.task-running')` |
| `_isFullscreen` | `boolean` | Electron window fullscreen 事件 |
| `_initialized` | `boolean` | `initialize()` 调用后为 true |
| `_unsubscribers` | `Array<() => void>` | 事件订阅清理 |

#### C3：initialize() 方法

```
1. 注册 4 个内置触发器到 triggerRegistry
2. 从 MEMORY.md 恢复冷却期 → triggerRegistry.restoreCooldowns(restoredMap)
3. 订阅 AppEventBus:
   - 'progress.task-running' → _isTaskRunning = true
   - 'progress.task-completed' → _isTaskRunning = false
   - 'progress.task-failed' → _isTaskRunning = false
4. 订阅 Electron BrowserWindow 'enter-full-screen' / 'leave-full-screen'
5. _initialized = true
```

#### C4：onSnapshot(snapshot) 方法 — IPC 入口

```
1. 更新 _latestSnapshot = snapshot
2. 若 !config.enabled → return（全局禁用，不评估）
3. 异步调用 _evaluate()（不阻塞 IPC fire-and-forget）
```

#### C5：_evaluate() 核心评估链

```
Step 1: 全局冷却检查
  if triggerRegistry.isGlobalCooldown() → record trace (result: 'global-cooldown') → return

Step 2: 构建 InterruptContext
  context = { snapshot, lastSuggestionAt, isFocused, isTaskRunning, isFullscreen, currentAiMode }

Step 3: 遍历触发器
  candidates = []
  for trigger in triggerRegistry.getAllTriggers():
    if !trigger.enabled → continue
    if triggerRegistry.isInCooldown(trigger.id) → continue
    try:
      if !trigger.condition(snapshot, deps) → continue
      draft = await trigger.buildDraft(snapshot, deps)
      if draft !== null → candidates.push(draft)
    catch:
      continue  // 单触发器异常不影响其他

Step 4: 若 candidates 为空
  → record trace 'proactive.evaluate' { result: 'no-match' } → return

Step 5: 取第一个 candidate（按优先级排序后）

Step 6: canInterrupt 检查
  interrupt = interruptPolicy.canInterrupt(context)
  if !interrupt.allowed:
    record trace 'proactive.evaluate' { result: 'suppressed', reason, triggerId }
    → return

Step 7: 调用 Sub-agent 生成建议
  try:
    result = await subAgentExecutor.spawnSubAgent('suggestion-curator', {
      triggerId, context, previewTitle
    }, { timeout: 3000 })
    suggestion = { id: generateId(), triggerId, ...result, createdAt: Date.now() }
    triggerRegistry.markFired(triggerId)
    _dispatchSuggestion(suggestion)
  catch:
    // Sub-agent 失败/超时 → 静默丢弃
    record trace 'proactive.evaluate' { result: 'sub-agent-failed', triggerId }
```

#### C6：_dispatchSuggestion(suggestion) 方法

```
1. 通过 sendToRenderer('proactive:suggestionShown', suggestion) 推送到渲染进程
2. 记录 Trace span 'proactive.suggestion-shown' { triggerId, suggestionId }
```

#### C7：recordSuggestionOutcome(suggestionId, outcome, dwellMs) 方法

```
1. 找到 suggestion 对应的 triggerId
2. switch outcome:
   - 'accepted': triggerRegistry.recordAccept(triggerId) + commandRegistry.execute(acceptAction.command)
   - 'dismissed': triggerRegistry.recordDismiss(triggerId)
   - 'timeout': 仅记录 trace
3. 记录 Trace span 'proactive.suggestion-outcome' { triggerId, outcome, dwellMs }
```

#### C8：配置管理与生命周期

| 方法 | 行为 |
|------|------|
| `getConfig()` | 返回当前 config |
| `updateConfig(partial)` | 合并更新 config + interruptPolicy.updateConfig() |
| `shutdown()` | 清理所有事件订阅、重置状态 |

**验证：** 评估链路完整、冷却期门控正确、Sub-agent 调用参数正确、失败静默丢弃、Trace span 完整记录。

### 阶段 D：Sub-agent Prompt + IPC Handlers + Preload（Step 6-7） — 预计 0.5 天

#### D1：创建 suggestion-curator.md

**文件：** `resources/prompts/agents/suggestion-curator.md`（新建）

**遵循已有 Sub-agent prompt frontmatter 格式：**

```markdown
---
id: suggestion-curator
version: "1.0.0"
name: 主动建议生成器
description: 根据触发器上下文生成 AI 主动建议的具体文案与执行动作
model: claude-sonnet-4-20250514
allowed_tools:
  - reference_file
  - unified_search
max_turns: 3
max_tokens: 5000
context:
  inherit_memory: false
output_schema:
  type: object
  required: [title, body, acceptAction]
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
---
```

**各触发器建议风格：**

| triggerId | 语气 | 示例标题 | acceptAction.command |
|-----------|------|---------|---------------------|
| task-decomposition | 帮助性、不强迫 | "想要拆解任务吗？" | `ai.extractTasks` |
| related-content | 提醒性、辅助参考 | "找到 3 篇相关文档" | `search.openResults` |
| memory-promote | 建议性、团队意识 | "这看起来是个团队约定" | `memory.addEntry` |
| review-stale | 提醒性、温和 | "这份文档该更新了" | `file.openHistory` |

#### D2：创建 IPC Handler

**文件：** `src/main/ipc/handlers/proactive-engine.ts`（新建）

**IPC 通道清单：**

| 通道常量 | 通道名 | 方向 | 用途 |
|---------|--------|------|------|
| `PROACTIVE_EDITOR_SNAPSHOT` | `proactive:editorSnapshot` | R→M (send) | 渲染进程推送编辑器快照 |
| `PROACTIVE_GET_CONFIG` | `proactive:getConfig` | R→M (invoke) | 获取配置 |
| `PROACTIVE_UPDATE_CONFIG` | `proactive:updateConfig` | R→M (invoke) | 更新配置 |
| `PROACTIVE_DISMISS_SUGGESTION` | `proactive:dismissSuggestion` | R→M (invoke) | 记录 dismiss |
| `PROACTIVE_ACCEPT_SUGGESTION` | `proactive:acceptSuggestion` | R→M (invoke) | 记录 accept |
| `PROACTIVE_SUGGESTION_SHOWN` | `proactive:suggestionShown` | M→R (push) | 推送新建议 |

**Handler 实现模式：** 遵循已有 `safeHandle` 模式：

```typescript
export class ProactiveEngineHandler {
  constructor(private readonly engine: ProactiveEngine, private readonly mainWindow: BrowserWindow | null) {}

  register(): void {
    // ipcMain.handle — invoke 模式
    ipcMain.handle('proactive:getConfig', this.safeHandle(this.handleGetConfig.bind(this)))
    ipcMain.handle('proactive:updateConfig', this.safeHandle(this.handleUpdateConfig.bind(this)))
    ipcMain.handle('proactive:dismissSuggestion', this.safeHandle(this.handleDismiss.bind(this)))
    ipcMain.handle('proactive:acceptSuggestion', this.safeHandle(this.handleAccept.bind(this)))

    // ipcMain.on — fire-and-forget 模式
    ipcMain.on('proactive:editorSnapshot', (_event, { snapshot }) => {
      this.engine.onSnapshot(snapshot)
    })
  }

  // sendToRenderer 实现（注入 ProactiveEngine）
  sendSuggestion(suggestion: Suggestion): void {
    this.mainWindow?.webContents.send('proactive:suggestionShown', suggestion)
  }
}
```

#### D3：扩展 shared/types.ts

**追加到 `IPC_CHANNELS` 常量：**

```typescript
PROACTIVE_EDITOR_SNAPSHOT: 'proactive:editorSnapshot',
PROACTIVE_GET_CONFIG: 'proactive:getConfig',
PROACTIVE_UPDATE_CONFIG: 'proactive:updateConfig',
PROACTIVE_DISMISS_SUGGESTION: 'proactive:dismissSuggestion',
PROACTIVE_ACCEPT_SUGGESTION: 'proactive:acceptSuggestion',
PROACTIVE_SUGGESTION_SHOWN: 'proactive:suggestionShown',
```

**追加到 `IPCChannelMap` 类型：** 每个通道的 params 和 return 类型。

#### D4：扩展 preload/index.ts

**追加 proactive 命名空间到 ElectronAPI 接口：**

```typescript
proactive: {
  pushSnapshot: (snapshot: EditorSnapshot) => void
  getConfig: () => Promise<IPCResponse<ProactiveConfig>>
  updateConfig: (updates: Partial<ProactiveConfig>) => Promise<IPCResponse<void>>
  dismissSuggestion: (id: string, dwellMs: number) => Promise<IPCResponse<void>>
  acceptSuggestion: (id: string, dwellMs: number) => Promise<IPCResponse<void>>
  onSuggestionShown: (callback: (suggestion: Suggestion) => void) => () => void
}
```

**关键实现：**
- `pushSnapshot` 使用 `ipcRenderer.send`（fire-and-forget，不阻塞渲染进程）
- 其他使用 `safeInvoke`
- `onSuggestionShown` 使用 `ipcRenderer.on` + 返回 unsub 函数

**追加到 ALLOWED_CHANNELS 数组：** 6 个通道名。

**验证：** IPC 通道注册正确、snapshot 推送不阻塞、双向通信正确、类型安全。

### 阶段 E：渲染进程组件（Step 8-9） — 预计 1.5 天

#### E1：创建 proactiveStore.ts

**文件：** `src/renderer/store/proactiveStore.ts`（新建）

**遵循已有 Zustand store 模式：** `create<State & Actions>()(devtools((set, get) => ({...}), { name: 'ProactiveStore' }))`

**状态定义：**

```typescript
interface ProactiveState {
  currentSuggestion: Suggestion | null
  pendingQueue: Suggestion[]
  config: ProactiveConfig | null
  showAt: number | null
  _shownAt: number | null  // 用于计算 dwellMs
}

interface ProactiveActions {
  pushSuggestion: (suggestion: Suggestion) => void
  dismissCurrent: () => void
  acceptCurrent: () => void
  timeoutCurrent: () => void
  fetchConfig: () => Promise<void>
  updateConfig: (updates: Partial<ProactiveConfig>) => Promise<void>
  _popNext: () => void
}
```

**关键方法逻辑：**

| 方法 | 行为 |
|------|------|
| `pushSuggestion` | 若 `currentSuggestion === null` → 直接设置 + 记录 `_shownAt = Date.now()`；否则加入 `pendingQueue` |
| `dismissCurrent` | 计算 `dwellMs = Date.now() - _shownAt`；调用 IPC `proactive:dismissSuggestion(id, dwellMs)`；调用 `_popNext()` |
| `acceptCurrent` | 计算 dwellMs；调用 IPC `proactive:acceptSuggestion(id, dwellMs)`；调用 `_popNext()` |
| `timeoutCurrent` | 计算 dwellMs；调用 `_popNext()`（不调 IPC，由主进程 trace 记录） |
| `_popNext` | 从 `pendingQueue.shift()` → 设为 `currentSuggestion` + `_shownAt`；或置空 |

**IPC 推送监听：** 在 store 初始化时注册 `window.electronAPI.proactive.onSuggestionShown(pushSuggestion)`。

**Action 命名约定：** `set({...}, false, 'proactive/pushSuggestion')`。

#### E2：创建 useEditorSnapshotCollector.ts

**文件：** `src/renderer/components/proactive/useEditorSnapshotCollector.ts`（新建）

**签名：** `useEditorSnapshotCollector(editor: Editor | null): void`

**核心机制：**

1. **每秒采样（setInterval 1000ms）：**
   - 从 `editor.state` 获取 `doc.textContent`
   - 计算 `recentText = text.slice(-500)`、`length = text.length`
   - 计算 `typingVelocity`：滑动窗口 10 秒内的按键时间戳 → `(buffer.length / 10) × 60` 字/分钟
   - 计算 `continuousTypingMinutes`：`(Date.now() - continuousStartAt) / 60000`
   - 从 editor extension 或全局 store 获取 `currentFilePath`、`currentAiMode`、`isFocused`
   - 组装 `EditorSnapshot` → 通过 2 秒防抖调用 `window.electronAPI.proactive.pushSnapshot(snapshot)`

2. **Tiptap 事件监听：**
   - `editor.on('update', handleUpdate)`：记录时间戳到 `_typingBuffer`，更新 `_continuousStartAt`
   - `editor.on('selectionUpdate', handleSelection)`：更新 cursorPosition

3. **清理逻辑：** unmount 时清除 interval、移除事件监听、取消防抖

4. **不修改 Tiptap 扩展：** hook 完全独立，仅读取 editor 实例

**验证：** snapshot 采样频率正确、typingVelocity 计算合理、防抖推送不阻塞。

#### E3：创建 SuggestionToast.tsx

**文件：** `src/renderer/components/proactive/SuggestionToast.tsx`（新建）

**Props：** `{ suggestion: Suggestion; onDismiss: () => void; onAccept: () => void }`

**UI 结构：**

```
┌─────────────────────────────────────┐
│ 💡  {title}（粗体）        [× 关闭] │
│ {body 1 行预览...}                  │
├─────────────────────────────────────┤
│ [展开 ▼]                            │
│ (展开后: 完整 body 文本)             │
├─────────────────────────────────────┤
│ [✓ Accept 按钮]  [稍后]  [×]       │
└─────────────────────────────────────┘
```

**交互规范：**

| 行为 | 实现 |
|------|------|
| 进入动画 | `framer-motion` 从右侧滑入 + 淡入，300ms |
| 离开动画 | 淡出 200ms |
| 位置 | `fixed bottom-4 right-4`，z-index 高于编辑器低于模态框 |
| 自动淡出 | 15 秒无交互 → `onDismiss()` |
| 悬停暂停 | `onMouseEnter` 暂停计时器 |
| 鼠标离开 | `onMouseLeave` 重置为 5 秒 |
| Esc 快捷键 | `window.addEventListener('keydown', handler)` → `onDismiss()` |
| Accept 按钮 | 调用 `onAccept()`，由 store 触发 `commandRegistry.execute(acceptAction)` |
| 展开/折叠 | 点击标题区域切换，默认折叠态 |
| 声音 | priority === 'urgent' 时播放提示音（config 可关闭） |

**TailwindCSS 样式：** 品牌色 #6366F1 作为左边框色，6px 圆角，灰色背景，白色卡片。

#### E4：创建 SuggestionQueue.tsx

**文件：** `src/renderer/components/proactive/SuggestionQueue.tsx`（新建）

**职责：** 从 proactiveStore 获取 currentSuggestion，管理 Toast 生命周期。

```tsx
export function SuggestionQueue() {
  const currentSuggestion = useProactiveStore(state => state.currentSuggestion)
  const dismissCurrent = useProactiveStore(state => state.dismissCurrent)
  const acceptCurrent = useProactiveStore(state => state.acceptCurrent)

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

**挂载位置：** `App.tsx` 根组件，不在编辑器内部。

**与性能告警 toast 不重叠：** 告警在左下角（已有），建议在右下角。

#### E5：创建 OverlayManager.tsx

**文件：** `src/renderer/components/proactive/OverlayManager.tsx`（新建）

**职责：** 管理全局覆盖层的排他显示（SuggestionToast vs Onboarding tour）。

**Zustand store 设计：**

```typescript
interface OverlayState {
  activeOverlay: 'onboarding' | 'suggestion' | null
  requestOverlay: (id: string) => boolean  // 返回是否获得展示权
  releaseOverlay: (id: string) => void
}
```

**逻辑：**
- `requestOverlay('suggestion')`：若 `activeOverlay === null` → 设为 `'suggestion'`，返回 true；否则返回 false
- `releaseOverlay('suggestion')`：若 `activeOverlay === 'suggestion'` → 设为 null
- SuggestionToast 在展示前调用 `requestOverlay('suggestion')`
- Onboarding tour 调用 `requestOverlay('onboarding')`
- 已有覆盖层时，新的请求被拒绝（建议排队等待）

#### E6：修改 App.tsx

**文件：** `src/renderer/App.tsx`（修改）

**变更：** 在全局覆盖层区域追加 `<SuggestionQueue />`：

```tsx
{/* Global overlays */}
<GuardrailNotification />
<ResumeTaskDialog />
<CommandPalette />
<UnifiedSearchPaletteWrapper />
<SuggestionQueue />       {/* ← 新增 */}
```

**验证：** Toast 动画流畅、自动淡出正确、Esc 关闭正确、排队展示正确、OverlayManager 排他正确、不与性能告警重叠。

### 阶段 F：单元测试与验收（Step 10） — 预计 1 天

#### F1：触发器单元测试

**文件：** `tests/main/proactive-engine/triggers/task-decomposition.test.ts`（+ 其余 3 个触发器）

每个触发器测试矩阵：

| 触发器 | 匹配场景 | 不匹配场景 |
|--------|---------|-----------|
| task-decomposition | text 含"目标" + length > 200 + 无列表 | 有列表格式 / length < 200 / 无关键词 |
| related-content | length < 100 + fileName ≥ 2 | length > 100 / fileName < 2 |
| memory-promote | 含"我们决定" + 不在 knownPatterns | 无约定词 / 已在 knownPatterns |
| review-stale | daysSinceUpdate > 30 + filePath 含"plan" | daysSinceUpdate < 30 / 文件名不匹配 |

#### F2：InterruptPolicy 组合测试

**文件：** `tests/main/proactive-engine/interrupt-policy.test.ts`

测试用例：

| # | 条件组合 | 预期结果 |
|---|---------|---------|
| 1 | velocity > 50 | suppressed: deep-focus |
| 2 | continuousMinutes > 5 | suppressed: deep-focus |
| 3 | lastSuggestion < 5min | suppressed: global-cooldown |
| 4 | isFocused | suppressed: focus-mode |
| 5 | isTaskRunning | suppressed: task-executing |
| 6 | isFullscreen | suppressed: fullscreen |
| 7 | aiMode=plan + isTaskRunning | suppressed: plan-mode |
| 8 | 全部条件通过 | allowed: true |
| 9 | 条件 1+3+5 组合 | suppressed（第一个命中的 reason） |

#### F3：TriggerRegistry 冷却期测试

**文件：** `tests/main/proactive-engine/trigger-registry.test.ts`

| # | 测试场景 |
|---|---------|
| 1 | 新触发器不在冷却期 |
| 2 | markFired 后 isInCooldown=true |
| 3 | 冷却期过期后 isInCooldown=false |
| 4 | 全局冷却 5 分钟内 isGlobalCooldown=true |
| 5 | 连续 dismiss 3 次 → 冷却期翻倍 |
| 6 | 翻倍不超过 1440 分钟 |
| 7 | 连续 accept 3 次 → 冷却期减半 |
| 8 | 减半不低于 5 分钟 |
| 9 | restoreCooldowns 正确恢复 |
| 10 | 持久化回调被正确调用 |

#### F4：ProactiveEngine 端到端测试

**文件：** `tests/main/proactive-engine/engine.test.ts`

| # | 测试场景 | mock 方式 |
|---|---------|-----------|
| 1 | 全局禁用 → 不评估 | config.enabled=false |
| 2 | 全局冷却中 → 不评估 | mock isGlobalCooldown=true |
| 3 | 无触发器匹配 → 不调用 Sub-agent | mock condition 全 false |
| 4 | 触发器匹配 + canInterrupt=false → 记录 trace | mock canInterrupt |
| 5 | 触发器匹配 + canInterrupt=true → 调用 Sub-agent | mock spawnSubAgent |
| 6 | Sub-agent 超时 → 静默丢弃 | mock spawnSubAgent throw |
| 7 | Sub-agent 返回 → 派发建议 | mock 返回值 |
| 8 | recordSuggestionOutcome accepted → recordAccept + execute | — |
| 9 | recordSuggestionOutcome dismissed → recordDismiss | — |

#### F5：UI 组件测试

**文件：** `tests/renderer/proactive/SuggestionToast.test.tsx`

| # | 测试场景 |
|---|---------|
| 1 | 渲染折叠态：标题 + 1 行预览 |
| 2 | 点击展开显示完整 body |
| 3 | 15 秒后自动调用 onDismiss |
| 4 | 悬停暂停计时 |
| 5 | Esc 键关闭 |
| 6 | Accept 按钮点击 |

**文件：** `tests/renderer/proactive/proactiveStore.test.ts`

| # | 测试场景 |
|---|---------|
| 1 | pushSuggestion 立即展示 |
| 2 | pushSuggestion 排队 |
| 3 | dismissCurrent 弹出下一个 |
| 4 | acceptCurrent 弹出下一个 |
| 5 | pendingQueue 空后 currentSuggestion=null |

---

## 五、验收标准追踪

### 触发器评估

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 停止输入 30 秒后上下文匹配，100ms 内完成评估 | C4 onSnapshot + C5 _evaluate | F4-3 |
| 2 | 评估纯启发式 < 50ms | B2 四个触发器 condition | F1 |
| 3 | 4 个触发器可独立启用/禁用 | A3 TriggerRegistry + trigger.enabled | F4-3 |
| 4 | 触发器冷却期独立管理 | A3 isInCooldown | F3-2~4 |
| 5 | 全局冷却 5 分钟内最多 1 条 | A3 isGlobalCooldown | F3-4 |

### canInterrupt 策略

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | velocity > 50 抑制 | B1 step 1 | F2-1 |
| 2 | 距上次建议 < 5 分钟抑制 | B1 step 2 | F2-3 |
| 3 | 焦点模式抑制 normal | B1 step 3 | F2-4 |
| 4 | AiMode=Plan + 任务中抑制 | B1 step 6 | F2-7 |
| 5 | 全局禁用时无评估无调用 | C4 config.enabled | F4-1 |

### Sub-agent 调用

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 触发 + canInterrupt 通过后调用 | C5 step 7 | F4-5 |
| 2 | 超时 3 秒 | constants SUB_AGENT_TIMEOUT_MS | F4-6 |
| 3 | 失败/超时静默丢弃 | C5 catch block | F4-6 |
| 4 | 输出含 title/body/acceptAction/declineAction | D1 prompt output_schema | F4-7 |

### 冷却期自适应

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 连续 dismiss 3 次/24h → 翻倍 | A3 _doubleCooldown | F3-5~6 |
| 2 | 连续 accept 3 次 → 减半 | A3 _halveCooldown | F3-7~8 |
| 3 | 通过记忆系统持久化 | A3 onCooldownChange 回调 | F3-9~10 |

### Toast UI

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 派发后 100ms 内渲染 | E4 SuggestionQueue | F5-1 |
| 2 | 300ms 滑入 / 200ms 淡出 | E3 framer-motion | — |
| 3 | 15 秒自动淡出 / 悬停暂停 | E3 计时器逻辑 | F5-3~4 |
| 4 | 同时只显示 1 条 | E1 pushSuggestion 排队 | F5-2 |
| 5 | Esc 全局关闭 | E3 keydown listener | F5-5 |
| 6 | 默认折叠 / 点击展开 | E3 展开/折叠态 | F5-1~2 |
| 7 | 右下角 / 不与告警重叠 | E3 position: fixed | — |
| 8 | 不进通知中心 | 架构设计：独立 IPC 通道 | — |
| 9 | 全屏/演示不显示 | B1 step 5 fullscreen | F2-6 |
| 10 | 与 Onboarding 排他 | E5 OverlayManager | — |

---

## 六、风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| Sub-agent spawnSubAgent 接口与预期不符 | 高 | 实现前先确认 `spawnSubAgentTool.ts` 的实际调用签名，必要时写 adapter |
| TriggerDeps 依赖的 search/memory 接口未就绪 | 高 | 使用 interface 注入，主流程 mock 推进；接口就绪后替换 |
| framer-motion 版本兼容问题 | 中 | 确认项目已有 framer-motion 依赖版本，AniamtePresence 用法匹配 |
| 全局覆盖层（OverlayManager）与 Onboarding 集成 | 中 | OverlayManager 设计为独立 store，Onboarding 侧需配合调用 requestOverlay |
| typingVelocity 计算不准确 | 低 | 滑动窗口 10 秒足够稳定；极端场景由 canInterrupt 兜底 |
| 性能告警 toast 与建议 toast 位置冲突 | 低 | 告警左下角 vs 建议右下角，明确分区 |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 |
|----|------|--------|
| Day 1 上午 | A1-A3 | types.ts + constants.ts + trigger-registry.ts |
| Day 1 下午 | B1-B2 | interrupt-policy.ts + 4 个触发器 |
| Day 2 | C1-C8 | ProactiveEngine 完整实现 |
| Day 3 上午 | D1-D4 | Sub-agent prompt + IPC handler + shared/types + preload |
| Day 3 下午 | E1-E2 | proactiveStore.ts + useEditorSnapshotCollector.ts |
| Day 4 上午 | E3-E6 | SuggestionToast + SuggestionQueue + OverlayManager + App.tsx 集成 |
| Day 4 下午 | F1-F5 | 全部单元测试 |
| Day 5 | 集成验证 | 端到端测试 + 修复 + Trace 数据验证 |

---

**文档版本**: v1.0
**最后更新**: 2026-04-30
**维护者**: Sibylla 架构团队
