# PHASE2-TASK009: 协作冲突 AI 智能合并 — 实施计划

> 任务来源：[specs/tasks/phase2/phase2-task009_ai-conflict-merge.md](../../specs/tasks/phase2/phase2-task009_ai-conflict-merge.md)
> 创建日期：2026-04-30
> 最后更新：2026-04-30

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK009 |
| **任务标题** | 协作冲突 AI 智能合并 |
| **所属阶段** | Phase 2 - 智能通知与协作增强 (Sprint 5) |
| **优先级** | P0 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **前置依赖** | TASK001 + TASK006 + Sprint 2/3.3/3.5/4 |

### 1.1 目标

在 Sprint 2 已有的 `ConflictResolver` UI 基础上，新增"AI 建议合并"作为第四个选项。当 Git 同步检测到冲突时，后台并行调用 AI Sub-agent 生成合并建议，用户可选择采用/编辑后采用/放弃。AI 合并失败时优雅降级到原三选项，敏感文件永不送入 AI。

### 1.2 核心设计约束

1. **不替换 ConflictResolver UI**：原三选项完全保留，AI 选项为新增第四按钮
2. **AI 合并通过 Sub-agent**：复用 Sprint 3.5 的 `SubAgentExecutor`，不引入新 AI 调用路径
3. **敏感文件白名单**：`secrets/`、`personal/`、`.env*` 永不送入 AI，直接禁用 AI 选项
4. **AI 建议非自动**：用户必须主动选择采用，遵循 CLAUDE.md "AI 建议人类决策"
5. **冲突文件不离开本地**：本地 LLM 调用或加密传输到云端 AI 网关
6. **失败优雅降级**：AI 合并失败/超时时，AI 选项禁用但不影响原三选项
7. **SyncManager 改造为追加式**：可选注入 `AppEventBus`，追加事件发布，保留原 `this.emit()`

### 1.3 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| MergeAssistant | `sibylla-desktop/src/main/services/sync/merge-assistant.ts` | AI 合并建议生成器 |
| Sub-agent Prompt | `sibylla-desktop/resources/prompts/agents/merge-curator.md` | 冲突合并 AI prompt |
| AI 面板 | `sibylla-desktop/src/renderer/components/sync/AIMergePanel.tsx` | AI 合并面板 UI |
| 类型扩展 | `sibylla-desktop/src/shared/types.ts` | ConflictInfo + MergeResult + IPC 通道 |
| Preload 扩展 | `sibylla-desktop/src/preload/index.ts` | sync 命名空间追加 2 方法 |
| IPC Handler | `sibylla-desktop/src/main/ipc/handlers/sync.ts`（或新建） | sync:proposeAIMerge / sync:adoptAIMerge |
| SyncManager 扩展 | `sibylla-desktop/src/main/services/sync/sync-manager.ts` | 可选注入 AppEventBus |
| ConflictResolver 扩展 | `sibylla-desktop/src/renderer/components/sync/ConflictResolver.tsx` | 追加第四按钮 + AIMergePanel |
| 单元测试 | `tests/` 目录下对应文件 | 覆盖率 ≥ 80% |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；AI 建议人类决策；Git 不可见；文件级协作；等待超 2 秒需进度反馈 | 全局约束 |
| `specs/design/architecture.md` | 主进程/渲染进程严格隔离；IPC 通信；GitAbstraction 语义化接口 | 进程通信 + Git 层 |
| `specs/design/sub-agent-system.md` | spawnSubAgent 接口；output_schema；嵌套深度 3；并发 3；5s timeout | Sub-agent 集成 |
| `specs/design/ui-ux-design.md` | 品牌色 #6366F1；冲突面板 side-by-side diff；6px 圆角；dark mode | UI 设计 |
| `specs/requirements/phase2/sprint5-collaboration.md` | 需求 5.4（AI 智能合并）；§3 非功能需求（5 秒 P95） | 验收标准 |
| `specs/tasks/phase2/phase2-task009_ai-conflict-merge.md` | 6 步执行路径；全部验收标准；技术策略 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `electron-ipc-patterns` | sync:proposeAIMerge / sync:adoptAIMerge IPC 注册；invoke/handle 模式；类型安全 | IPC Handler + preload |
| `zustand-state-management` | AI merge 状态管理；aiStatus/mergeResult 状态；IPC 调用封装在 action | ConflictResolver 状态 |
| `llm-streaming-integration` | Sub-agent 超时管理（5 秒 timeout）；错误分类与重试策略 | MergeAssistant Sub-agent 调用 |
| `typescript-strict-mode` | MergeResult / Attribution 类型定义；泛型约束；禁止 any | 全部类型文件 |

### 2.3 前置代码依赖

| 模块 | 文件路径 | 复用方式 |
|------|---------|---------|
| `ConflictResolver`（主进程服务） | `sibylla-desktop/src/main/services/conflict-resolver.ts` | 不修改，调用 `resolve(resolution)` |
| `SyncManager` | `sibylla-desktop/src/main/services/sync/sync-manager.ts` | 可选注入 AppEventBus + 追加事件 |
| `SubAgentExecutor` | `sibylla-desktop/src/main/services/sub-agent/` | `spawnSubAgent('merge-curator', params, opts)` |
| `AppEventBus` | `sibylla-desktop/src/main/services/event-bus.ts` | `emitEvent({ type: 'git.conflict-detected' })` |
| `UnifiedSearchEngine` | `sibylla-desktop/src/main/services/unified-search/` | `search(filePath, { limit: 3 })` 查找相关上下文 |
| `ConfigManager` | `sibylla-desktop/src/main/services/config/` | 获取自定义敏感文件白名单 |
| `Tracer` | `sibylla-desktop/src/main/services/trace/` | `withSpan()` 记录 Trace 子树 |
| `GitAbstraction` | `sibylla-desktop/src/main/services/git/git-abstraction.ts` | 不修改，调用 `resolveConflict()` |
| `IPC_CHANNELS` | `sibylla-desktop/src/shared/types.ts` | 追加 2 个通道常量 |
| Preload API | `sibylla-desktop/src/preload/index.ts` | 追加 proposeAIMerge / adoptAIMerge |

### 2.4 前置任务依赖

| 任务 | 提供能力 | 本任务消费方式 |
|------|---------|-------------|
| PHASE2-TASK001 事件总线 | `AppEventBus.emitEvent()` + `git.conflict-detected` 事件类型 | SyncManager 注入并发射事件 |
| PHASE2-TASK006 通知中心 | `collab-conflict` 规则消费 `git.conflict-detected` | 事件发射后通知中心自动处理 |
| Sprint 2 SyncManager | `this.emit('conflicts')` + ConflictResolver | 追加式改造，不替换原逻辑 |
| Sprint 2 ConflictInfo 接口 | `{ filePath, localContent, remoteContent, baseContent }` | 扩展 conflictId + traceId |
| Sprint 3.3 Trace | `Tracer.withSpan()` | Sub-agent Trace 子树关联 |
| Sprint 3.5 Sub-agent | `SubAgentExecutor.spawnSubAgent()` | 调用 merge-curator 生成合并 |
| Sprint 4 UnifiedSearchEngine | `search()` | 搜索相关历史决策作为上下文 |

---

## 三、现有代码盘点与差距分析

### 3.1 主进程冲突服务现状

**`conflict-resolver.ts`（255 行）：**
- `getConflicts()`：扫描工作区含 `<<<<<<<` 标记的文件，解析 ours/theirs/base 内容
- `resolve(resolution)`：写入解决内容，暂存文件，创建 commit `[冲突解决] <filename>`
- 仅支持三种策略：`'mine'` / `'theirs'` / `'manual'`
- 使用原子写入（临时文件 + 重命名）

**缺口：**

| 缺失能力 | 说明 |
|---------|------|
| 无 AI 合并策略 | `ResolutionType` 仅 `'mine' \| 'theirs' \| 'manual'` |
| 无敏感文件检查 | 不区分敏感文件与普通文件 |
| 无审计日志 | 合并决策无持久化记录 |
| 无 conflictId | `ConflictInfo` 缺少唯一标识 |

### 3.2 SyncManager 现状

**`sync-manager.ts`：**
- 使用 `this.emit('sync:conflict')` EventEmitter 模式
- 未接入 Sprint 4 `AppEventBus`
- 无 `git.conflict-detected` 事件发射

**改造方式：** 追加式 — 可选注入 `AppEventBus`，在冲突检测路径追加事件发布，原 `this.emit()` 保留不变。

### 3.3 IPC 层现状

**已有通道（`shared/types.ts:150-156`）：**

| 通道常量 | 通道名 | 方向 |
|---------|--------|------|
| `GIT_GET_CONFLICTS` | `git:getConflicts` | R→M |
| `GIT_RESOLVE` | `git:resolve` | R→M |
| `GIT_CONFLICT_DETECTED` | `git:conflictDetected` | M→R |

**已有类型（`shared/types.ts:1655-1680`）：**

```typescript
interface ConflictInfo {
  filePath: string
  localContent: string
  remoteContent: string
  baseContent: string
  remoteAuthor?: string
}
type ResolutionType = 'mine' | 'theirs' | 'manual'
interface ConflictResolution {
  filePath: string
  type: ResolutionType
  content?: string
}
```

**缺口：**

| 缺失项 | 说明 |
|--------|------|
| `conflictId` 字段 | ConflictInfo 无 ULID |
| `traceId` 字段 | 无审计关联 |
| AI merge 通道 | 无 `sync:proposeAIMerge` / `sync:adoptAIMerge` |
| `MergeResult` 类型 | 不存在 |
| `Attribution` 类型 | 不存在 |

### 3.4 Preload API 现状

**`preload/index.ts` git 命名空间（已有）：**

```typescript
git: {
  getConflicts()        → ConflictInfo[]
  resolve(resolution)   → string
  onConflictDetected(callback)
  history(options?)
  diff(filepath, commitA?, commitB?)
  restore(filepath, commitSha)
}
```

**缺口：** 无 `proposeAIMerge(conflict)` 和 `adoptAIMerge(params)` 方法。

### 3.5 渲染进程端现状

| 模块 | 现状 | 缺口 |
|------|------|------|
| `src/renderer/components/sync/` | **目录不存在** | 需创建 ConflictResolver.tsx + AIMergePanel.tsx |
| `syncStatusStore.ts` | 已有，跟踪 status/conflictFiles | 需追加 AI merge 状态 |
| ConflictResolver UI | **不存在**（Sprint 2 冲突面板未实现前端组件） | 需完整实现四选项 UI |

### 3.6 Sub-agent Prompt 现状

**`resources/prompts/agents/` 已有 7 个 agent：**
suggestion-curator、focus-summary-curator、memory-curator、spec-reviewer、meeting-note-writer、doc-summarizer、pr-reviewer

**缺口：** 无 `merge-curator.md`，需新建。

### 3.7 事件总线现状

**`event-bus-types.ts` 已定义冲突相关事件：**
- `'git.conflict-detected'` — payload `{ path: string; conflictType?: string }`
- `'collab.conflict-detected'` — payload `{ path: string }`

**无缺口**，可直接 `emitEvent({ type: 'git.conflict-detected' })`。

### 3.8 不修改的文件

- `src/main/services/git/git-abstraction.ts` — 不修改，仅调用 `resolveConflict()`
- `src/main/services/conflict-resolver.ts` — 不修改核心逻辑
- `src/main/services/sub-agent/` — 不修改，仅调用 `spawnSubAgent()`
- `src/main/services/search/unified-search-engine.ts` — 不修改，仅调用 `search()`
- `src/main/services/event-bus.ts` — 不修改，事件类型已注册

---

## 四、分步实施计划

### 阶段 A：类型系统扩展（Step 1） — 预计 0.3 天

#### A1：扩展 ConflictInfo 接口

**文件：** `sibylla-desktop/src/shared/types.ts`

**1. 在 ConflictInfo 接口追加字段：**

```typescript
interface ConflictInfo {
  filePath: string
  localContent: string
  remoteContent: string
  baseContent: string
  remoteAuthor?: string
  conflictId?: string   // 新增: ULID，SyncManager 生成
  traceId?: string      // 新增: 审计关联
}
```

**2. 新增 MergeResult 类型体系：**

```typescript
type MergeResultStatus = 'success' | 'sensitive' | 'failed' | 'timeout'

interface Attribution {
  fromMine: [number, number][]     // [startLine, endLine] 行号范围
  fromTheirs: [number, number][]
  byAI: [number, number][]
}

interface MergeResult {
  status: MergeResultStatus
  mergedContent?: string
  attribution?: Attribution
  rationale?: string
  conflictId?: string
}
```

**3. 在 ResolutionType 追加（可选，不强制）：**

保持 `'mine' | 'theirs' | 'manual'` 不变，AI merge 使用独立 IPC 通道，不经过原有 `git:resolve`。

**4. 追加 IPC 通道常量：**

```typescript
SYNC_PROPOSE_AI_MERGE: 'sync:proposeAIMerge',
SYNC_ADOPT_AI_MERGE: 'sync:adoptAIMerge',
```

**5. 追加 IPCChannelMap 类型定义。**

**验证：** 类型编译通过、无 any、原有 ConflictInfo 引用点向后兼容（新字段均为 optional）。

---

### 阶段 B：SyncManager 事件桥接（Step 2） — 预计 0.3 天

#### B1：可选注入 AppEventBus

**文件：** `sibylla-desktop/src/main/services/sync/sync-manager.ts`

**1. 构造函数新增可选参数：**

```typescript
constructor(
  private git: GitAbstraction,
  private configManager: ConfigManager,
  private eventBus?: AppEventBus,  // 新增可选注入
)
```

**2. 在冲突检测路径追加事件发布：**

在 `handleConflict()` 方法中 `this.emit('conflicts', ...)` 之后追加：

```typescript
if (this.eventBus) {
  const conflictsWithId = pullResult.conflicts.map(c => ({
    ...c,
    conflictId: c.conflictId ?? generateUlid(),
  }))
  this.eventBus.emitEvent({
    type: 'git.conflict-detected',
    source: 'sync-manager',
    payload: {
      conflicts: conflictsWithId.map(c => ({
        filePath: c.filePath,
        conflictId: c.conflictId,
        localPreview: c.localContent?.slice(0, 500),
        remotePreview: c.remoteContent?.slice(0, 500),
        basePreview: c.baseContent?.slice(0, 500),
      }))
    }
  })
}
```

**3. ULID 生成引入：**

使用 `ulid` 包或内联简易 ULID 生成器。需确认项目依赖中是否已有 `ulid`。

**关键约束：**
- 原有 `this.emit('conflicts', ...)` **完全保留不变**
- 无 `AppEventBus` 注入时（降级模式），新增代码不执行，原有逻辑不受影响
- `conflictId` 在冲突检测时就生成，传递给下游 ConflictResolver

**验证：** 有 eventBus 注入时正确发射事件；无 eventBus 时不报错；原有 `this.emit()` 行为不变。

---

### 阶段 C：MergeAssistant 核心实现（Step 3） — 预计 0.5 天

#### C1：创建 merge-assistant.ts

**文件：** `sibylla-desktop/src/main/services/sync/merge-assistant.ts`（新建）

**1. 构造函数依赖注入：**

```typescript
class MergeAssistant {
  constructor(
    private readonly subAgentExecutor: SubAgentExecutor,
    private readonly searchEngine: UnifiedSearchEngine,
    private readonly configManager: ConfigManager,
    private readonly tracer?: Tracer,
  )
}
```

**2. 敏感文件默认白名单常量：**

```typescript
const DEFAULT_SENSITIVE_PATTERNS: RegExp[] = [
  /^secrets\//,
  /^personal\//,
  /^\.env/,
  /\.key$/,
  /\.pem$/,
  /\.p12$/,
]
```

**3. isSensitiveFile(filePath: string): boolean**

- 合并默认白名单 + ConfigManager 中的自定义模式（`sensitiveFilePatterns` 字段）
- 遍历所有模式，任一匹配 → return true
- 不匹配 → return false
- 执行时间要求 < 10ms

**4. propose(conflict: ConflictInfo): Promise\<MergeResult\>**

```
Step 1: 敏感文件检查
  if isSensitiveFile(conflict.filePath) → return { status: 'sensitive' }

Step 2: 搜索相关上下文（增强合并质量，可选）
  try:
    results = await searchEngine.search(conflict.filePath, { limit: 3 })
    relatedContext = results.map(r => r.snippet).join('\n')
  catch:
    relatedContext = ''  // 搜索失败不影响合并

Step 3: 调用 Sub-agent
  try:
    result = await subAgentExecutor.spawnSubAgent('merge-curator', {
      filePath, localContent, remoteContent, baseContent, relatedContext
    }, { timeout: 5000, inheritMemory: true, parentTraceId: conflict.traceId })
  catch TimeoutError:
    return { status: 'timeout', conflictId: conflict.conflictId }
  catch:
    return { status: 'failed', conflictId: conflict.conflictId }

Step 4: 结果校验
  if mergedContent 包含 <<<<<<< 或 ======= 或 >>>>>>>
    → return { status: 'failed', conflictId: conflict.conflictId }

Step 5: 返回成功
  return { status: 'success', mergedContent, attribution, rationale, conflictId }
```

**5. adoptMerge(params): void — 审计日志**

```typescript
adoptMerge(params: {
  conflictId: string
  filePath: string
  mergedContent: string
  attribution: Attribution
  rationale: string
  userId: string
}): void
```

- 写入 `.sibylla/sync/merge-history.jsonl`（append-only）
- 条目格式：`{ conflictId, filePath, mergedContent, attribution, rationale, adoptedBy, adoptedAt }`
- 使用原子写入（先写临时文件再追加）
- 实际 commit 由 ConflictResolver 调用 GitAbstraction 完成，此方法仅记录审计

**验证：** 敏感文件检查正确、Sub-agent 调用参数正确、超时/失败返回 null 不抛异常、审计日志格式正确。

---

### 阶段 D：merge-curator Sub-agent Prompt（Step 4） — 预计 0.2 天

#### D1：创建 merge-curator.md

**文件：** `sibylla-desktop/resources/prompts/agents/merge-curator.md`（新建）

**遵循 Sprint 3.5 Sub-agent frontmatter 格式：**

```markdown
---
id: merge-curator
version: "1.0.0"
name: 冲突合并助手
description: 为 Git 冲突生成 AI 合并建议
model: claude-sonnet-4-20250514
allowed_tools:
  - reference_file
  - unified_search
max_turns: 5
max_tokens: 10000
context:
  inherit_memory: true
output_schema:
  type: object
  required: [mergedContent, attribution, rationale]
  properties:
    mergedContent:
      type: string
      description: 合并后的完整文件内容（不含冲突标记）
    attribution:
      type: object
      properties:
        fromMine:
          type: array
          items: { type: array, items: { type: number } }
        fromTheirs:
          type: array
          items: { type: array, items: { type: number } }
        byAI:
          type: array
          items: { type: array, items: { type: number } }
      required: [fromMine, fromTheirs, byAI]
    rationale:
      type: string
      description: 合并策略的 2-3 句说明
---
```

**Prompt 主体核心原则：**
1. 优先保留双方实质性修改，不丢弃任何一方的有效工作
2. 双方修改同一段落时整合两者意图
3. 无法判断时保留远程版本（已提交优先）
4. 保持文档结构和格式一致性
5. 引用搜索结果时标注来源
6. Attribution 按行号范围标注来源
7. mergedContent 必须是完整文件，**禁止包含** `<<<<<<<` / `=======` / `>>>>>>>` 标记

**验证：** frontmatter 格式符合已有 agent 规范；output_schema 与 MergeAssistant 的解析逻辑匹配；合并原则覆盖常见冲突场景。

---

### 阶段 E：IPC Handlers + Preload 扩展（Step 5） — 预计 0.3 天

#### E1：创建/扩展 IPC Handler

**文件：** `sibylla-desktop/src/main/ipc/handlers/sync.ts`（扩展或新建）

**1. sync:proposeAIMerge handler（invoke 模式）：**

```typescript
ipcMain.handle('sync:proposeAIMerge', safeHandle(async (_event, { conflict }) => {
  return mergeAssistant.propose(conflict)
}))
```

- 参数：`{ conflict: ConflictInfo }`
- 返回：`MergeResult`
- 耗时可能 5 秒，使用 `invoke`（非 fire-and-forget）

**2. sync:adoptAIMerge handler（invoke 模式）：**

```typescript
ipcMain.handle('sync:adoptAIMerge', safeHandle(async (_event, params) => {
  // 1. 写审计日志
  mergeAssistant.adoptMerge(params)
  // 2. 执行 Git 合并
  await gitAbstraction.resolveConflict(params.filePath, params.mergedContent)
  // 3. commit message
  const shortId = params.conflictId.slice(0, 8)
  const commitMsg = `[user] AI 辅助合并 ${params.filePath} (cherry-picked from 冲突 #${shortId})`
  await gitAbstraction.commit(commitMsg)
  return { success: true }
}))
```

**验证：** proposeAIMerge 返回正确 MergeResult；adoptAIMerge 写审计 + 执行合并 + commit 格式正确。

#### E2：扩展 Preload API

**文件：** `sibylla-desktop/src/preload/index.ts`

**1. 在 sync 命名空间追加方法：**

```typescript
sync: {
  // ... 已有方法保留
  proposeAIMerge: (conflict: ConflictInfo) =>
    ipcRenderer.invoke('sync:proposeAIMerge', { conflict }),
  adoptAIMerge: (params: {
    conflictId: string
    filePath: string
    mergedContent: string
    attribution: Attribution
    rationale: string
  }) => ipcRenderer.invoke('sync:adoptAIMerge', params),
}
```

**2. 追加到 ALLOWED_CHANNELS 数组：** `'sync:proposeAIMerge'`、`'sync:adoptAIMerge'`。

**验证：** Preload API 类型安全、通道注册到白名单。

---

### 阶段 F：AIMergePanel 与 ConflictResolver UI（Step 6） — 预计 1.5 天

#### F1：创建 AIMergePanel.tsx

**文件：** `sibylla-desktop/src/renderer/components/sync/AIMergePanel.tsx`（新建，需先创建目录）

**Props 接口：**

```typescript
interface AIMergePanelProps {
  mergeResult: MergeResult
  onAdopt: (mergedContent: string) => void
  onEditAndAdopt: (mergedContent: string) => void
  onDiscard: () => void
}
```

**UI 布局：**

```
┌──────────────────────────────────────────────┐
│ AI 建议合并                            [×]   │
├──────────────────────────────────────────────┤
│ 图例: ■ 绿色=你的修改 ■ 蓝色=对方修改 ■ 橙色=AI整合 │
├──────────────────────────────────────────────┤
│ ┌─ 合并内容预览 ──────────────────────────┐  │
│ │ 1 | ...                    (绿底)        │  │
│ │ 2 | ...                    (蓝底)        │  │
│ │ 3 | ...                    (橙底)        │  │
│ │ ...                                     │  │
│ └─────────────────────────────────────────┘  │
├──────────────────────────────────────────────┤
│ 💡 rationale 说明文字...                      │
├──────────────────────────────────────────────┤
│ [采用此方案]  [编辑后采用]  [放弃]            │
└──────────────────────────────────────────────┘
```

**Attribution 高亮渲染：**

```typescript
function getLineBackground(line: number, attr: Attribution): string {
  if (isInRange(line, attr.fromMine))
    return 'bg-green-100 dark:bg-green-900/30'
  if (isInRange(line, attr.fromTheirs))
    return 'bg-blue-100 dark:bg-blue-900/30'
  if (isInRange(line, attr.byAI))
    return 'bg-orange-100 dark:bg-orange-900/30'
  return ''
}

function isInRange(line: number, ranges: [number, number][]): boolean {
  return ranges.some(([start, end]) => line >= start && line <= end)
}
```

**样式：** 遵循 ui-ux-design.md 规范 — 品牌色 #6366F1 边框、6px 圆角、dark mode 支持。

#### F2：创建/扩展 ConflictResolver.tsx

**文件：** `sibylla-desktop/src/renderer/components/sync/ConflictResolver.tsx`（新建或扩展）

**状态管理：**

```typescript
const [mergeResult, setMergeResult] = useState<MergeResult | null>(null)
const [aiStatus, setAiStatus] = useState<
  'loading' | 'ready' | 'failed' | 'sensitive' | 'timeout'
>('loading')
const [showAIMergePanel, setShowAIMergePanel] = useState(false)
```

**ConflictResolver 打开时并行触发 AI 合并：**

```typescript
useEffect(() => {
  if (!conflict) return
  window.electronAPI.sync.proposeAIMerge(conflict).then(result => {
    setMergeResult(result)
    setAiStatus(result.status === 'success' ? 'ready' : result.status)
  }).catch(() => {
    setAiStatus('failed')
  })
}, [conflict])
```

**第四按钮渲染（追加在"手动合并"右侧）：**

```tsx
<button
  disabled={aiStatus !== 'ready'}
  onClick={() => setShowAIMergePanel(true)}
  title={
    aiStatus === 'sensitive' ? '敏感文件不发送给 AI' :
    aiStatus === 'failed'   ? 'AI 建议不可用' :
    aiStatus === 'loading'  ? 'AI 建议生成中...' :
    aiStatus === 'timeout'  ? 'AI 建议生成中...' :
    '查看 AI 合并建议'
  }
>
  AI 建议合并
  {aiStatus === 'loading' && <Spinner />}
</button>
```

**AI 面板展开：**

```tsx
{showAIMergePanel && mergeResult?.status === 'success' && (
  <AIMergePanel
    mergeResult={mergeResult}
    onAdopt={handleAdoptAIMerge}
    onEditAndAdopt={handleEditAndAdopt}
    onDiscard={() => setShowAIMergePanel(false)}
  />
)}
```

**采用 AI 合并处理：**

```typescript
async function handleAdoptAIMerge(mergedContent: string) {
  await window.electronAPI.sync.adoptAIMerge({
    conflictId: conflict.conflictId,
    filePath: conflict.filePath,
    mergedContent,
    attribution: mergeResult.attribution,
    rationale: mergeResult.rationale,
  })
  onClose()
}
```

**关键约束：**
- 原"采用我的/对方的/手动合并"逻辑**完全保留**，不修改任何现有分支
- AI 按钮初始 loading 状态，不阻塞原三选项
- 敏感文件时 AI 按钮禁用 + tooltip 提示
- 失败/超时时 AI 按钮禁用，原三选项正常可用

**验证：** AI 按钮状态正确切换（loading → ready/failed/sensitive/timeout）；敏感文件禁用正确；面板展示 attribution 高亮正确；采用流程完整；原三选项回归测试通过。

---

### 阶段 G：单元测试（Step 7） — 预计 1 天

#### G1：MergeAssistant 单元测试

**文件：** `tests/main/sync/merge-assistant.test.ts`（新建）

| # | 测试场景 | 预期 |
|---|---------|------|
| 1 | 普通文件冲突 | `propose()` 调用 Sub-agent，返回 `{ status: 'success' }` |
| 2 | 敏感文件（secrets/） | 返回 `{ status: 'sensitive' }`，不调用 Sub-agent |
| 3 | 敏感文件（.env） | 返回 `{ status: 'sensitive' }` |
| 4 | 敏感文件（.key） | 返回 `{ status: 'sensitive' }` |
| 5 | Sub-agent 超时 | 返回 `{ status: 'timeout' }`，不抛异常 |
| 6 | Sub-agent 失败 | 返回 `{ status: 'failed' }`，不抛异常 |
| 7 | Sub-agent 返回含 `<<<<<<<` | 返回 `{ status: 'failed' }`（校验拒绝） |
| 8 | 搜索引擎失败 | 不影响合并，relatedContext 为空 |
| 9 | ConfigManager 自定义白名单 | 合并生效 |
| 10 | adoptMerge 审计日志 | jsonl 正确追加 |

**Mock 方式：** mock `SubAgentExecutor.spawnSubAgent()`、`UnifiedSearchEngine.search()`、`ConfigManager.get()`。

#### G2：SyncManager 事件桥接测试

**文件：** `tests/main/sync/sync-manager-bridge.test.ts`（新建）

| # | 测试场景 | 预期 |
|---|---------|------|
| 1 | 有 AppEventBus 注入 | 正确发射 `git.conflict-detected` |
| 2 | 无 AppEventBus 注入 | 不报错，原有逻辑正常 |
| 3 | conflictId 生成 | ULID 格式正确、唯一 |
| 4 | payload 字段完整 | filePath + previews（500 字符截断） |
| 5 | 原有 emit 保留 | `this.emit('conflicts')` 仍被调用 |

#### G3：AIMergePanel 组件测试

**文件：** `tests/renderer/sync/AIMergePanel.test.tsx`（新建）

| # | 测试场景 | 预期 |
|---|---------|------|
| 1 | 渲染合并内容 | 行号 + mergedContent 展示 |
| 2 | Attribution 高亮 | 绿/蓝/橙背景色正确应用 |
| 3 | rationale 显示 | 策略说明可见 |
| 4 | "采用"按钮 | 触发 onAdopt(mergedContent) |
| 5 | "编辑后采用"按钮 | 触发 onEditAndAdopt(mergedContent) |
| 6 | "放弃"按钮 | 触发 onDiscard() |

#### G4：ConflictResolver 回归测试

**文件：** `tests/renderer/sync/ConflictResolver.test.tsx`（新建或扩展）

| # | 测试场景 | 预期 |
|---|---------|------|
| 1 | 原三选项可用 | 采用我的/对方的/手动合并 不受影响 |
| 2 | AI 按钮 loading → ready | 状态切换正确 |
| 3 | AI 按钮 loading → failed | 按钮禁用 + tooltip |
| 4 | 敏感文件 | AI 按钮禁用 + tooltip "敏感文件不发送给 AI" |
| 5 | 点击 AI 按钮 | 展开 AIMergePanel |
| 6 | 采用 AI 合并 | 调用 adoptAIMerge + onClose |

#### G5：审计日志测试

**文件：** `tests/main/sync/merge-history.test.ts`（新建）

| # | 测试场景 | 预期 |
|---|---------|------|
| 1 | 单次合并 | jsonl 正确追加 1 行 |
| 2 | 多次合并 | jsonl 追加多行，不覆盖 |
| 3 | 条目字段完整 | conflictId / filePath / rationale / attribution / timestamp / userId |
| 4 | commit message 格式 | `[user] AI 辅助合并 {file} (cherry-picked from 冲突 #{shortId})` |

---

## 五、验收标准追踪

### SyncManager 事件桥接

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | SyncManager 构造函数可选注入 AppEventBus | B1 sync-manager.ts | G2-1 |
| 2 | 冲突检测路径追加 `git.conflict-detected` 事件发布 | B1 handleConflict() | G2-1 |
| 3 | 事件 payload 含 filePath + 三方 preview（500 字符） | B1 payload 构建 | G2-4 |
| 4 | 原有 `this.emit('conflicts')` 完全保留 | B1 不修改原有行 | G2-5 |
| 5 | 无 AppEventBus 注入时原有逻辑不受影响 | B1 if-guards | G2-2 |

### ConflictInfo 接口扩展

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | ConflictInfo 新增 `conflictId: string`（ULID） | A1 shared/types.ts | G2-3 |
| 2 | ConflictInfo 新增 `traceId?: string` | A1 shared/types.ts | — |
| 3 | 原三选项逻辑不受影响 | E1/E2 独立 IPC 通道 | G4-1 |

### MergeAssistant

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 敏感文件白名单检查（6 个默认模式） | C1 isSensitiveFile() | G1-2~4 |
| 2 | 白名单可通过 ConfigManager 配置扩展 | C1 合并自定义模式 | G1-9 |
| 3 | 调用 spawnSubAgent('merge-curator')，超时 5 秒 | C1 propose() step 3 | G1-1 |
| 4 | Sub-agent 输入含 local/remote/base + 上下文 | C1 propose() params | G1-1 |
| 5 | Sub-agent 输出含 mergedContent + attribution + rationale | C1 propose() 返回 | G1-1 |
| 6 | AI 结果含 `<<<<<<<` 标记时拒绝 | C1 step 4 校验 | G1-7 |
| 7 | 失败时返回 null（不抛异常） | C1 catch blocks | G1-5~6 |

### AI 合并 UI

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | ConflictResolver 新增"AI 建议合并"按钮 | F2 第四按钮 | G4-2 |
| 2 | 按钮初始 loading 状态 | F2 useState('loading') | G4-2 |
| 3 | 5 秒内未返回 → "AI 建议生成中..." | F2 tooltip 文案 | G4-2 |
| 4 | AI 成功 → 按钮激活 | F2 aiStatus='ready' | G4-2 |
| 5 | AI 失败 → 按钮禁用 + tooltip | F2 aiStatus='failed' | G4-3 |
| 6 | 敏感文件 → 按钮禁用 + tooltip | F2 aiStatus='sensitive' | G4-4 |
| 7 | 点击 AI 选项展示 AIMergePanel | F2 showAIMergePanel | G4-5 |
| 8 | Attribution 高亮（绿/蓝/橙） | F1 getLineBackground() | G3-2 |
| 9 | 三个操作：采用/编辑后采用/放弃 | F1 按钮组 | G3-4~6 |

### 审计日志

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 采用后 commit message 格式正确 | E1 adoptAIMerge | G5-4 |
| 2 | 审计记录追加到 merge-history.jsonl | C1 adoptMerge() | G5-1~2 |
| 3 | 审计字段完整 | C1 entry 构建 | G5-3 |
| 4 | Sub-agent Trace 通过 parent_trace_id 关联 | C1 spawnSubAgent opts | — |

### 性能要求

| # | 指标 | 验证方式 |
|---|------|---------|
| 1 | AI 合并建议生成 < 5 秒（P95） | Sub-agent timeout: 5000ms |
| 2 | 敏感文件检查 < 10ms | 正则遍历，无需 I/O |
| 3 | AI 结果校验 < 5ms | String.includes() 级别 |

### 单元测试

| # | 验收标准 | 测试文件 |
|---|---------|---------|
| 1 | MergeAssistant 敏感文件白名单测试 | G1-2~4 |
| 2 | MergeAssistant AI 合并调用测试（mock） | G1-1 |
| 3 | MergeAssistant 结果校验测试 | G1-7 |
| 4 | SyncManager 事件桥接测试 | G2-1~5 |
| 5 | AIMergePanel 组件渲染测试 | G3-1~6 |
| 6 | ConflictResolver 原三选项回归测试 | G4-1 |
| 7 | 审计日志写入测试 | G5-1~4 |
| 8 | 覆盖率 ≥ 80% | 全部测试文件 |

---

## 六、风险与缓解

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|---------|
| SubAgentExecutor.spawnSubAgent 签名与预期不符 | 中 | 高 | 实现前先确认 `sub-agent/` 目录的实际 API；必要时写 adapter |
| ConflictResolver UI 不存在，需从零实现 | 高 | 高 | 按任务文档，Sprint 2 已有 UI；若不存在则先实现基础三选项面板再追加 AI 选项 |
| merge-curator Sub-agent 输出格式不稳定 | 中 | 中 | output_schema 严格约束 + result 校验（标记检测）双保险 |
| 5 秒 timeout 不足（大文件冲突） | 低 | 中 | Sub-agent max_tokens 限制内容长度；超时优雅降级 |
| merge-history.jsonl 并发写入冲突 | 低 | 低 | append-only + 原子写入（临时文件 + rename） |
| 敏感文件白名单遗漏 | 低 | 高 | 默认 6 个模式 + ConfigManager 可扩展 + 文档明确 |
| framer-motion 动画库未安装 | 低 | 低 | AIMergePanel 使用 CSS transition 即可，不强制依赖 framer-motion |
| ULID 依赖未安装 | 低 | 低 | 确认 package.json 或使用简易替代（Date.now + random） |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 |
|----|------|--------|
| Day 1 上午 | A1 | shared/types.ts 类型扩展 + IPC 通道 |
| Day 1 下午 | B1 + C1 | SyncManager 事件桥接 + MergeAssistant 核心 |
| Day 2 上午 | D1 + E1 + E2 | merge-curator prompt + IPC handler + preload |
| Day 2 下午 | F1 | AIMergePanel.tsx 组件 |
| Day 3 上午 | F2 | ConflictResolver.tsx 四选项集成 |
| Day 3 下午 | G1 + G2 + G5 | MergeAssistant + SyncManager + 审计日志测试 |
| Day 4 上午 | G3 + G4 | AIMergePanel + ConflictResolver 测试 |
| Day 4 下午 | — | 集成验证 + 修复 + 覆盖率达标 |

---

**文档版本**: v1.0
**最后更新**: 2026-04-30
**维护者**: Sibylla 架构团队
