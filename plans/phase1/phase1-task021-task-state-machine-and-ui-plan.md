# PHASE1-TASK021: 状态机追踪器与 Harness UI 集成 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task021_task-state-machine-and-ui.md](../specs/tasks/phase1/phase1-task021_task-state-machine-and-ui.md)
> 创建日期：2026-04-20
> 最后更新：2026-04-20

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK021 |
| **任务标题** | 状态机追踪器与 Harness UI 集成 |
| **优先级** | P1 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **前置依赖** | ✅ TASK017 Guardrails、✅ TASK018 编排器、✅ TASK019 Guides+Sensors、✅ TASK020 工具范围 |

### 1.1 目标

实现两个相互关联但独立可交付的子系统：

1. **TaskStateMachine（状态机追踪器）**：为多步骤 AI 任务提供持久化状态管理，支持崩溃恢复与任务归档。状态以 JSON 文件形式持久化到 `.sibylla/agents/{task-id}/state.json`，遵循 CLAUDE.md「文件即真相」原则。
2. **Harness UI 组件层**：构建 5 个独立 UI 组件 + 消息级内联标识，让 TASK017-020 实现的全部后端能力（Guardrails 拦截、评审报告、Guide 指示、模式切换、任务恢复）对用户透明可见。

### 1.2 核心命题

TASK017-020 已实现 Harness 全部后端能力，但存在两个缺口：

- **持久化缺口**：多步骤 AI 任务无持久化机制，Electron 进程崩溃后丢失所有上下文
- **可见性缺口**：Guardrail 拦截、评审报告、Guide 应用等行为对用户完全不可见，违反「AI 行为可追溯」原则

本任务通过状态机持久化 + UI 可见层，补齐这两个缺口。

### 1.3 范围边界

**包含：**

状态机部分：
- `TaskStateMachine` 类（`src/main/services/harness/task-state-machine.ts`）
- `TaskState` / `TaskStep` / `TaskArtifacts` 类型定义
- 任务创建、步骤推进、状态持久化（原子写入：temp + rename）
- 崩溃恢复：扫描未完成任务、重建 AI 上下文摘要
- 任务完成/取消/损坏的归档机制
- 状态机相关 IPC 通道（listResumeable / resumeTask / abandonTask）

UI 组件部分：
- `EvaluationDrawer.tsx` — 评审报告抽屉
- `ModeSelector.tsx` — 执行模式切换器
- `GuardrailNotification.tsx` — Guardrail 拦截通知
- `ResumeTaskDialog.tsx` — 崩溃恢复对话框
- `ActiveGuidesIndicator.tsx` — 活跃 Guides 指示器
- 消息级降级/验证内联标识
- harnessStore 扩展（resumeableTasks、guardrailNotifications）
- Guardrail 管理设置页 + Guide 管理设置页
- 单元测试

**不包含：**
- Sprint 3.2 的 `progress.md` 人类可读 Markdown 视图
- 高级任务管理 UI（甘特图、依赖关系可视化）

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | §二 文件即真相 — 状态以 JSON 明文存储；§二 AI 建议人类决策 — 恢复对话框需用户确认；§三 Git 不可见 — UI 中不暴露技术术语；§四 TS 严格模式禁止 any；§五 命名约定；§六 UI/UX 红线 — 原子写入、2秒反馈、diff 预览 | 状态机持久化策略、UI 措辞、类型设计、文件命名 |
| `specs/design/architecture.md` | §3.2 进程通信架构（invoke/handle IPC）；§3.1 模块划分（主进程核心层） | IPC 设计、TaskStateMachine 在主进程中的定位 |
| `specs/design/ui-ux-design.md` | §二 区域定义（底栏 32px、右栏 320px）；§三 色彩体系（错误 Red-500、警告 Amber-500、成功 Emerald-500）；§五 交互规范；§六 组件规范（Toast 右上角 3s 消失、Modal 居中 max-width 560px） | 所有 UI 组件布局、配色、交互行为 |
| `specs/design/testing-and-security.md` | §1.1 单元测试 ≥80%（Vitest）；§1.3 测试文件 `*.test.ts`；§3.3 文件写入原子替换 | 测试策略、原子写入实现 |
| `specs/requirements/phase1/sprint3.1-harness.md` | 需求 3.1.6 状态机追踪器验收标准；§4.2 集成规格表；§4.5 叠加层集成策略；§六 IPC 接口清单 | 实施蓝图、验收标准、集成方式 |
| `specs/tasks/phase1/phase1-task021_task-state-machine-and-ui.md` | 14 步执行路径 + 状态机/UI 双轨验收标准 | 步骤分解依据 |

### 2.2 Skill 依赖

| Skill | 使用场景 |
|-------|---------|
| `zustand-state-management` | harnessStore 扩展设计：State/Actions 分离定义、selector 优化、Map 序列化处理、IPC 封装模式、reset 方法、devtools 集成 |
| `electron-ipc-patterns` | 3 个新增 IPC handler 注册（listResumeable / resumeTask / abandonTask）、`safeHandle` 包装、事件广播模式 |
| `typescript-strict-mode` | TaskState tagged union 类型设计、类型守卫实现（`isResumeable()`）、禁止 any、readonly 标记 |
| `electron-desktop-app` | 主进程 FileManager 注入模式、进程隔离约束、崩溃恢复生命周期钩子 |

### 2.3 前置代码依赖

| 模块 | 路径 | 状态 | 本任务使用方式 |
|------|------|------|--------------|
| `HarnessOrchestrator` | `src/main/services/harness/orchestrator.ts` | ⚠️ 需改造 | 注入 `TaskStateMachine`；`execute()` 中检测多步骤任务并创建/推进状态 |
| `GuardrailEngine` | `src/main/services/harness/guardrails/engine.ts` | ✅ 不修改 | GuardrailNotification 消费 `harness:guardrailBlocked` 事件 |
| `GuideRegistry` | `src/main/services/harness/guides/registry.ts` | ✅ 不修改 | ActiveGuidesIndicator 展示活跃 Guide 列表 |
| `harnessStore` | `src/renderer/store/harnessStore.ts` | ⚠️ 需扩展 | 追加 `resumeableTasks`、`guardrailNotifications`、`showResumeDialog` 状态及 Actions |
| `FileManager` | `src/main/services/file-manager.ts` | ✅ 不修改 | TaskStateMachine 通过 FileManager 读写 state.json |
| `MemoryManager` | `src/main/services/memory-manager.ts` | ✅ 不修改 | 复用 `appendHarnessTrace()` 记录状态机操作日志 |
| `shared/types.ts` | `src/shared/types.ts` | ⚠️ 需扩展 | 追加 TaskState/TaskStep/TaskArtifacts 共享类型 + 3 个 IPC 通道常量 + GuardrailNotification 渲染进程类型 |
| `HarnessHandler` | `src/main/ipc/handlers/harness.ts` | ⚠️ 需扩展 | 追加 listResumeable / resumeTask / abandonTask handler |
| `main/index.ts` | `src/main/index.ts` | ⚠️ 需扩展 | 追加 TaskStateMachine 初始化 + 启动时扫描可恢复任务 |
| `harness/index.ts` | `src/main/services/harness/index.ts` | ⚠️ 需扩展 | 追加 TaskStateMachine 导出 |

### 2.4 被依赖任务

| 任务 | 依赖方式 |
|------|---------|
| Sprint 3.2 progress.md | 本任务的 `TaskStateMachine` 是 progress.md 人类可读视图的底层数据源 |

---

## 三、架构设计

### 3.1 状态机持久化架构

```
.sibylla/agents/
├── {task-id-1}/
│   └── state.json          ← 进行中任务
├── {task-id-2}/
│   └── state.json
├── completed/               ← 已完成任务归档
│   └── {task-id}/state.json
├── cancelled/               ← 已取消任务归档
│   └── {task-id}/state.json
└── corrupted/               ← 损坏文件隔离
    └── {task-id}/state.json
```

**写入流程**（原子写入，遵循 CLAUDE.md §六 UI/UX 红线）：

```
TaskStateMachine.persist(state)
│
├── 1. 确保目录存在: mkdir -p .sibylla/agents/{taskId}/
├── 2. 序列化: JSON.stringify(state, null, 2)
├── 3. 写入临时文件: state.json.tmp
├── 4. 原子替换: rename(state.json.tmp → state.json)
└── 5. 写入失败: 记录错误日志，不抛出异常（不阻塞 AI 执行）
```

**崩溃恢复流程**：

```
应用启动
│
▼
TaskStateMachine.findResumeable()
│
├── 列出 .sibylla/agents/ 子目录
├── 跳过特殊目录: completed/ cancelled/ corrupted/
├── 逐个读取 state.json
│   ├── 解析成功 → 检查 status
│   │   ├── 'executing' / 'awaiting_confirmation' → 加入可恢复列表
│   │   └── 其他状态 → 跳过
│   └── 解析失败（JSON 损坏）→ moveToCorrupted() + 日志
│
▼ 返回 TaskState[]
│
├── 列表非空 → IPC 广播 'harness:resumeableTaskDetected'
│                → harnessStore 设置 resumeableTasks
│                → ResumeTaskDialog 弹出
│
└── 列表为空 → 无操作
```

### 3.2 UI 组件集成架构

```
Studio 主界面
├── 底栏 (32px)
│   └── ModeSelector (Single/Dual/Panel 切换，集成在 AI 模式选择区)
│
├── AI 对话面板
│   ├── 消息气泡
│   │   ├── ActiveGuidesIndicator (活跃 Guide 标签组)
│   │   ├── DegradationBadge (黄色「质量审查暂不可用」)
│   │   └── VerifiedBadge (绿色「已自检 ✓」)
│   └── EvaluationDrawer (右侧抽屉，按消息 ID 关联)
│
├── 通知层 (全局)
│   └── GuardrailNotification (拦截 toast，右上角)
│       ├── block → 红色左边框，10 秒自动消失
│       └── conditional → 黄色左边框，需手动关闭
│
└── 启动弹窗层
    └── ResumeTaskDialog (Modal 居中，max-width 560px)
```

### 3.3 关键设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 状态持久化格式 | JSON 明文 | 遵循 CLAUDE.md「文件即真相」；可审计、可人工修复 |
| 写入策略 | temp + rename 原子写入 | 遵循 CLAUDE.md §六 UI/UX 红线；防止进程崩溃时写入半截文件 |
| 写入失败处理 | 记录错误但不抛出 | 状态持久化是辅助功能，不应阻塞 AI 主流程 |
| 损坏文件处理 | 移至 corrupted/ 隔离 | 不删除数据，保留可审计性；通知用户 |
| 任务 ID 格式 | `task-{timestamp}-{random}` | 时间戳保证有序，random 防碰撞；无需中心化 ID 生成 |
| 多步骤判定 | `plannedSteps.length >= 3` 或 `long-running` 标记 | 避免为简单操作创建冗余状态文件 |
| UI 术语映射 | 「质量审查」替代 evaluation；「已自检 ✓」替代 sensor passed | 遵循 CLAUDE.md §三 Git 不可见原则的精神延伸 |
| Toast 消失时间 | 10 秒（Guardrail 通知） | 安全通知比普通 toast 停留更久（普通 toast 3 秒） |
| Modal 交互 | 逐任务处理，全部完成后自动关闭 | 避免一次性信息过载 |
| Store 扩展策略 | 追加字段到现有 harnessStore | 遵循 Zustand skill 的模块化拆分原则——Harness 是单一功能域 |

### 3.5 叠加层集成原则

遵循 `sprint3.1-harness.md` §4.5：所有对现有文件的修改均为**追加式**（新增方法/字段/常量），不修改现有方法签名、不删除现有逻辑。新建 UI 组件为独立文件。

**新建**：`task-state-machine.ts` | 5 个 UI 组件 + `useHarnessEvents.ts` | 4 个测试文件

**修改**（追加式）：`shared/types.ts` | `orchestrator.ts` | `harness.ts` handler | `harnessStore.ts` | `main/index.ts` | `harness/index.ts`

---

## 四、类型系统设计

### 4.1 核心领域类型（`src/main/services/harness/task-state-machine.ts`）

```typescript
export type TaskStatus = 'planning' | 'executing' | 'awaiting_confirmation' | 'completed' | 'cancelled' | 'failed'
export type StepStatus = 'pending' | 'in_progress' | 'done' | 'skipped'

export interface TaskStep {
  readonly id: string; readonly description: string; status: StepStatus
  startedAt?: number; completedAt?: number; artifacts?: readonly string[]; summary?: string
}

export interface TaskArtifacts {
  referencedFiles: string[]; modifiedFiles: string[]
  evaluations: ReadonlyArray<{ stepId: string; verdict: string; criticalIssues: readonly string[] }>
}

export interface TaskState {
  readonly taskId: string; readonly goal: string; readonly createdAt: number
  updatedAt: number; status: TaskStatus; steps: TaskStep[]; currentStepIndex: number
  artifacts: TaskArtifacts; lastSessionId?: string
}

export interface TaskResumeResult {
  readonly state: TaskState; readonly resumePrompt: string
}

export const ARCHIVE_DIRS = ['completed', 'cancelled', 'corrupted'] as const
export const AGENTS_DIR = '.sibylla/agents'
export const TASK_STATE_FILE = 'state.json'
```

### 4.2 共享类型扩展（`src/shared/types.ts`）

在现有类型文件中追加，不修改任何现有定义：

```typescript
export interface TaskStateSummary {
  readonly taskId: string; readonly goal: string; readonly status: string
  readonly completedSteps: number; readonly totalSteps: number; readonly updatedAt: number
}

export interface GuardrailNotificationData {
  readonly id: string; readonly ruleId: string
  readonly ruleName: string     // 自然语言名称（如「系统路径保护」）
  readonly reason: string; readonly severity: 'block' | 'conditional'; readonly timestamp: number
}

export const HARNESS_LIST_RESUMEABLE = 'harness:listResumeable' as const
export const HARNESS_RESUME_TASK = 'harness:resumeTask' as const
export const HARNESS_ABANDON_TASK = 'harness:abandonTask' as const
export const HARNESS_RESUMEABLE_DETECTED = 'harness:resumeableTaskDetected' as const
```

### 4.3 类型守卫

```typescript
/** Type guard: is task in a resumeable status? */
export function isResumeableStatus(status: TaskStatus): boolean {
  return status === 'executing' || status === 'awaiting_confirmation'
}

/** Type guard: is task in a terminal status? */
export function isTerminalStatus(status: TaskStatus): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'failed'
}
```

---

## 五、TaskStateMachine 详细设计

### 5.1 类结构

```typescript
export class TaskStateMachine {
  constructor(
    private readonly fileManager: FileManager,
    private readonly workspaceRoot: string,
    private readonly logger: Logger
  ) {}

  // Public: create, advance, updateStatus, findResumeable, resume, abandon
  // Private: persist, load, archive, moveToCorrupted, generateId, getTaskDir, getStatePath, buildResumePrompt, validatePathSafety
}
```

### 5.2 create() — 任务创建

```typescript
async create(goal: string, plannedSteps: string[]): Promise<TaskState> {
  const state: TaskState = {
    taskId: this.generateId(), goal,
    createdAt: Date.now(), updatedAt: Date.now(),
    status: 'planning',
    steps: plannedSteps.map(desc => ({
      id: this.generateId(), description: desc, status: 'pending' as const,
    })),
    currentStepIndex: 0,
    artifacts: { referencedFiles: [], modifiedFiles: [], evaluations: [] },
  }
  await this.persist(state)
  this.logger.info('task-state-machine.created', { taskId: state.taskId, goal, stepCount: plannedSteps.length })
  return state
}
```

### 5.3 advance() — 步骤推进

```typescript
async advance(taskId: string, stepSummary: string, artifacts: string[]): Promise<void> {
  const state = await this.load(taskId)
  const step = state.steps[state.currentStepIndex]
  if (!step) { this.logger.warn('task-state-machine.advance.no-step', { taskId }); return }

  step.status = 'done'; step.completedAt = Date.now()
  step.summary = stepSummary; step.artifacts = artifacts
  state.currentStepIndex++; state.updatedAt = Date.now()
  state.artifacts.modifiedFiles = [...new Set([...state.artifacts.modifiedFiles, ...artifacts])]

  if (state.currentStepIndex >= state.steps.length) {
    state.status = 'completed'
    await this.archive(state)
  } else {
    state.steps[state.currentStepIndex].status = 'in_progress'
    state.steps[state.currentStepIndex].startedAt = Date.now()
    state.status = 'executing'
    await this.persist(state)
  }
}
```

### 5.4 persist() — 原子写入

```typescript
private async persist(state: TaskState): Promise<void> {
  try {
    this.validatePathSafety(state.taskId)
    const finalPath = this.getStatePath(state.taskId)
    const tempPath = `${finalPath}.tmp`
    await this.fileManager.ensureDir(this.getTaskDir(state.taskId))
    await this.fileManager.writeFile(tempPath, JSON.stringify(state, null, 2), { atomic: false })
    await this.fileManager.rename(tempPath, finalPath)
  } catch (err) {
    // CRITICAL: never throw — persistence must not block AI execution
    this.logger.error('task-state-machine.persist.failed', { taskId: state.taskId, error: String(err) })
  }
}
```

### 5.5 findResumeable() — 崩溃恢复扫描

```typescript
async findResumeable(): Promise<TaskState[]> {
  const agentsDir = path.join(this.workspaceRoot, AGENTS_DIR)
  const resumeable: TaskState[] = []
  try {
    const entries = await this.fileManager.listDirs(agentsDir)
    for (const entry of entries) {
      if (ARCHIVE_DIRS.includes(entry.name as typeof ARCHIVE_DIRS[number])) continue
      try {
        const raw = await this.fileManager.readFile(path.join(agentsDir, entry.name, TASK_STATE_FILE))
        const state = JSON.parse(raw) as TaskState
        if (isResumeableStatus(state.status)) resumeable.push(state)
      } catch {
        this.logger.warn('task-state-machine.corrupted', { taskId: entry.name })
        await this.moveToCorrupted(entry.name)
      }
    }
  } catch {
    this.logger.info('task-state-machine.no-agents-dir')
  }
  return resumeable
}
```

### 5.6 resume() — 任务恢复

```typescript
async resume(taskId: string): Promise<TaskResumeResult> {
  const state = await this.load(taskId)
  state.status = 'executing'; state.updatedAt = Date.now()
  if (state.currentStepIndex < state.steps.length) {
    state.steps[state.currentStepIndex].status = 'in_progress'
    state.steps[state.currentStepIndex].startedAt = Date.now()
  }
  await this.persist(state)
  return { state, resumePrompt: this.buildResumePrompt(state) }
}

private buildResumePrompt(state: TaskState): string {
  const done = state.steps.filter(s => s.status === 'done')
    .map((s, i) => `${i + 1}. ${s.description} — ${s.summary ?? '已完成'}`).join('\n')
  const remaining = state.steps.filter(s => s.status !== 'done' && s.status !== 'skipped')
    .map((s, i) => `${i + 1}. ${s.description}`).join('\n')
  return `你之前正在执行任务：${state.goal}\n\n已完成步骤：\n${done || '（无）'}\n\n剩余步骤：\n${remaining || '（无）'}\n\n请从步骤 ${state.currentStepIndex + 1} 继续执行。`
}
```

### 5.7 abandon() + archive() + moveToCorrupted()

```typescript
async abandon(taskId: string): Promise<void> {
  const state = await this.load(taskId)
  state.status = 'cancelled'; state.updatedAt = Date.now()
  await this.archive(state)
}

private async archive(state: TaskState): Promise<void> {
  const subDir = state.status === 'completed' ? 'completed' : 'cancelled'
  const target = path.join(this.workspaceRoot, AGENTS_DIR, subDir, state.taskId)
  try {
    await this.fileManager.ensureDir(path.dirname(target))
    await this.fileManager.rename(this.getTaskDir(state.taskId), target)
  } catch (err) {
    this.logger.error('task-state-machine.archive.failed', { taskId: state.taskId, error: String(err) })
  }
}

private async moveToCorrupted(taskId: string): Promise<void> {
  const target = path.join(this.workspaceRoot, AGENTS_DIR, 'corrupted', taskId)
  try {
    await this.fileManager.ensureDir(path.dirname(target))
    await this.fileManager.rename(path.join(this.workspaceRoot, AGENTS_DIR, taskId), target)
  } catch (err) {
    this.logger.error('task-state-machine.move-corrupted.failed', { taskId, error: String(err) })
  }
}
```

### 5.8 路径安全校验

```typescript
private validatePathSafety(taskId: string): void {
  // Prevent path traversal attacks
  if (taskId.includes('..') || taskId.includes('/') || taskId.includes('\\')) {
    throw new Error(`Invalid taskId: path traversal detected — ${taskId}`)
  }
}

private getTaskDir(taskId: string): string {
  this.validatePathSafety(taskId)
  return path.join(this.workspaceRoot, AGENTS_DIR, taskId)
}

private getStatePath(taskId: string): string {
  return path.join(this.getTaskDir(taskId), TASK_STATE_FILE)
}

private generateId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(2, 8)
  return `task-${timestamp}-${random}`
}
```

---

## 六、harnessStore 扩展设计

### 6.1 新增状态字段

在现有 `harnessStore.ts`（已有 `currentMode`、`activeEvaluations`、`degradationWarnings` 等）基础上追加：

```typescript
// === TASK021 追加状态 ===

/** Resumeable tasks detected on startup */
resumeableTasks: TaskStateSummary[]

/** Whether resume dialog is visible */
showResumeDialog: boolean

/** Active guardrail notifications (toast queue) */
guardrailNotifications: GuardrailNotificationData[]
```

### 6.2 新增 Actions

```typescript
// === TASK021 追加 Actions ===

/** Set resumeable tasks list (called from IPC event) */
setResumeableTasks: (tasks: TaskStateSummary[]) => void

/** Toggle resume dialog visibility */
toggleResumeDialog: () => void

/** Add a guardrail notification to the queue */
addGuardrailNotification: (notification: GuardrailNotificationData) => void

/** Dismiss a guardrail notification by ID */
dismissGuardrailNotification: (id: string) => void
```

### 6.3 Action 实现

```typescript
setResumeableTasks: (tasks) => set({
  resumeableTasks: tasks,
  showResumeDialog: tasks.length > 0,
}),

toggleResumeDialog: () => set((s) => ({
  showResumeDialog: !s.showResumeDialog,
})),

addGuardrailNotification: (notification) => set((s) => ({
  guardrailNotifications: [...s.guardrailNotifications, notification],
})),

dismissGuardrailNotification: (id) => set((s) => ({
  guardrailNotifications: s.guardrailNotifications.filter(n => n.id !== id),
})),
```

### 6.4 IPC 事件监听（渲染进程初始化）

在 `hooks/useHarnessEvents.ts` 中设置 IPC 事件监听，在 App 入口调用：

```typescript
export function useHarnessEvents(): void {
  const setResumeableTasks = useHarnessStore(s => s.setResumeableTasks)
  const addGuardrailNotification = useHarnessStore(s => s.addGuardrailNotification)
  const pushWarning = useHarnessStore(s => s.pushWarning)

  useEffect(() => {
    const unsubs = [
      window.api.on('harness:resumeableTaskDetected', (_e: unknown, tasks: TaskStateSummary[]) => setResumeableTasks(tasks)),
      window.api.on('harness:guardrailBlocked', (_e: unknown, v: GuardrailNotificationData) => addGuardrailNotification(v)),
      window.api.on('harness:degradationOccurred', (_e: unknown, w: DegradationWarning) => pushWarning(w)),
    ]
    return () => unsubs.forEach(fn => fn())
  }, [setResumeableTasks, addGuardrailNotification, pushWarning])
}
```

### 6.5 Selector 定义

遵循 Zustand skill 的 selector 最佳实践：

```typescript
// Primitive selectors (Object.is comparison)
export const selectShowResumeDialog = (s: HarnessStore) => s.showResumeDialog
export const selectGuardrailCount = (s: HarnessStore) => s.guardrailNotifications.length

// Array selectors (need useShallow)
export const selectResumeableTasks = (s: HarnessStore) => s.resumeableTasks
export const selectGuardrailNotifications = (s: HarnessStore) => s.guardrailNotifications
```

---

## 七、UI 组件详细设计

### 7.1 EvaluationDrawer — 评审报告抽屉

**文件**：`src/renderer/components/studio/harness/EvaluationDrawer.tsx`

**Props**：`{ messageId: string }`

**数据源**：`useHarnessStore(s => s.activeEvaluations.get(messageId) ?? [])`

**渲染结构**：右侧滑出抽屉（宽度 320px），包含：

- 标题栏：「质量审查结果」+ 收起按钮
- 模式标签（Single/Dual/Panel）+ Generator 尝试次数
- 各审查维度（factual_consistency 等）的 ✓/✗ 状态，fail 维度红色高亮 + issues 列表
- 关键问题列表（红色）+ 次要问题列表（黄色）
- 审查理由（默认折叠，点击展开）
- Panel 模式：额外显示共识状态（通过/存在异议/拒绝）
- 降级时：显示黄色「质量审查暂不可用：{原因}」

**关键交互**：
- 展开/收起动画（200ms slide-in-right）
- 审查理由默认折叠，点击展开
- 使用自然语言：「质量审查」「自检结果」，不使用 evaluation

### 7.2 ModeSelector — 模式切换器

**文件**：`src/renderer/components/studio/harness/ModeSelector.tsx`

**集成位置**：Studio 底栏（32px 高度），紧邻 AI 模型选择器

**数据源**：`useHarnessStore(s => s.currentMode)`

**渲染结构**：

```
┌─ 底栏片段 ─────────────────────────────────────┐
│ [Single | Dual | Panel]  ← 分段控制器           │
└─────────────────────────────────────────────────┘
```

**交互设计**：
- 三段式按钮组，当前模式高亮（品牌色 Indigo-500 背景 + 白色文字）
- 非选中段：透明背景 + 灰色文字
- 点击切换：`harnessStore.setMode()` → IPC `harness:setMode`
- Tooltip 说明：
  - Single：「直接回答，不进行质量审查」
  - Dual：「AI 自检后再回答（推荐）」
  - Panel：「多重审查后回答（用于规范文件修改）」

### 7.3 GuardrailNotification — Guardrail 拦截通知

**文件**：`src/renderer/components/studio/harness/GuardrailNotification.tsx`

**数据源**：`useHarnessStore(useShallow(s => s.guardrailNotifications))`

**渲染结构**：Toast 通知栈（右上角固定定位），每条通知包含：

- 规则名称（自然语言，如「系统路径保护」）+ 关闭按钮
- 拦截原因描述
- `severity: 'block'` → 红色左边框（Red-500），10 秒自动消失
- `severity: 'conditional'` → 黄色左边框（Amber-500），显示「取消」/「确认执行」按钮

**交互设计**：
- 自动消失使用 `setTimeout`，组件卸载时清理
- 最多同时显示 3 条，超出排队

**Guard ID → 显示名映射**：`system-path` → 系统路径保护 | `secret-leak` → 敏感信息检测 | `personal-space` → 个人空间保护 | `bulk-operation` → 批量操作确认

### 7.4 ResumeTaskDialog — 崩溃恢复对话框

**文件**：`src/renderer/components/studio/harness/ResumeTaskDialog.tsx`

**数据源**：`useHarnessStore(useShallow(s => ({ tasks: s.resumeableTasks, show: s.showResumeDialog })))`

**渲染结构**：Modal 居中（max-width 560px，遮罩 50%），包含：

- 标题：「未完成的任务」
- 任务卡片列表，每个卡片显示：目标（goal）、进度（N/M 步骤已完成）、上次更新（相对时间）、「放弃」（次按钮）和「继续执行」（主按钮）

**交互设计**：
- 启动时自动检测，仅在有可恢复任务时弹出
- 「继续执行」→ IPC `harness:resumeTask(taskId)` → AI 上下文恢复
- 「放弃」→ IPC `harness:abandonTask(taskId)` → 移至 cancelled/
- 所有任务处理完毕后自动关闭对话框
- 「继续执行」为主按钮（品牌色），「放弃」为次按钮
- 时间显示使用相对时间（「10 分钟前」「2 小时前」）

### 7.5 ActiveGuidesIndicator — 活跃 Guide 指示器

**文件**：`src/renderer/components/studio/harness/ActiveGuidesIndicator.tsx`

**Props**：`{ guides: GuideSummary[] }` （从消息 metadata 或 harnessStore 获取）

**渲染结构**：

```
┌─ AI 消息气泡下方 ──────────────────────────────┐
│  [规范审查模式] [简洁输出]  ← 小标签组          │
│  鼠标悬停 → tooltip 显示 Guide 描述            │
└─────────────────────────────────────────────────┘
```

**设计细节**：
- 每个 Guide 渲染为圆角小标签（12px 字号，Indigo-50 背景 + Indigo-600 文字）
- 超过 3 个 Guide 时折叠为「+N 项指导」
- 鼠标悬停显示 Guide 完整描述
- 不占用消息正文空间，作为辅助信息行

### 7.6 降级与验证内联标识

嵌入现有 AI 消息组件中（条件渲染，不新建独立文件）：

```typescript
// 在 AI 消息气泡组件中追加条件渲染
{harnessMeta?.degraded && (
  <span
    className="inline-flex items-center px-2 py-0.5 rounded text-xs
               bg-amber-50 text-amber-700 border border-amber-200"
    title={harnessMeta.degradeReason}
  >
    质量审查暂不可用
  </span>
)}

{harnessMeta && !harnessMeta.degraded && harnessMeta.mode !== 'single' && (
  <span
    className="inline-flex items-center px-2 py-0.5 rounded text-xs
               bg-emerald-50 text-emerald-700 border border-emerald-200"
  >
    已自检 ✓
  </span>
)}
```

---

## 八、IPC 与集成改造

### 8.1 新增 IPC 通道

追加到 `src/main/ipc/handlers/harness.ts` 的 `register()` 方法中：

```typescript
this.safeHandle(HARNESS_LIST_RESUMEABLE, async () => {
  const tasks = await this.taskStateMachine.findResumeable()
  return tasks.map(t => ({
    taskId: t.taskId, goal: t.goal, status: t.status,
    completedSteps: t.steps.filter(s => s.status === 'done').length,
    totalSteps: t.steps.length, updatedAt: t.updatedAt,
  } satisfies TaskStateSummary))
})

this.safeHandle(HARNESS_RESUME_TASK, async (_e, taskId: string) =>
  this.taskStateMachine.resume(taskId))

this.safeHandle(HARNESS_ABANDON_TASK, async (_e, taskId: string) =>
  this.taskStateMachine.abandon(taskId))
```

### 8.2 HarnessHandler 构造函数扩展

```typescript
export class HarnessHandler extends IpcHandler {
  private taskStateMachine: TaskStateMachine | null = null
  setTaskStateMachine(machine: TaskStateMachine): void { this.taskStateMachine = machine }
}
```

### 8.3 HarnessOrchestrator 集成

**文件**：`src/main/services/harness/orchestrator.ts`

追加 `TaskStateMachine` 注入，在 `execute()` 中管理任务生命周期：

```typescript
export class HarnessOrchestrator {
  private taskStateMachine: TaskStateMachine | null = null
  setTaskStateMachine(machine: TaskStateMachine): void { this.taskStateMachine = machine }

  async execute(request: AIChatRequest): Promise<HarnessResult> {
    // 多步骤任务检测与创建
    let taskId: string | undefined
    if (this.taskStateMachine && this.isMultiStepTask(request)) {
      const state = await this.taskStateMachine.create(request.message, request.plannedSteps ?? [])
      taskId = state.taskId
    }
    // 现有执行逻辑不变...
    try {
      const result = await this.executeByMode(request, mode, context)
      if (taskId && this.taskStateMachine) await this.taskStateMachine.advance(taskId, 'Step completed', [])
      return result
    } catch (err) {
      if (taskId && this.taskStateMachine) await this.taskStateMachine.updateStatus(taskId, 'failed')
      throw err
    }
  }

  private isMultiStepTask(request: AIChatRequest): boolean {
    return (request.plannedSteps?.length ?? 0) >= 3 || request.longRunning === true
  }
}
```

### 8.4 main/index.ts 初始化追加

```typescript
const taskStateMachine = new TaskStateMachine(fileManager, workspacePath, logger)
harnessOrchestrator.setTaskStateMachine(taskStateMachine)
harnessHandler.setTaskStateMachine(taskStateMachine)

// 启动时扫描可恢复任务并广播
taskStateMachine.findResumeable().then(tasks => {
  if (tasks.length > 0) {
    const summaries = tasks.map(t => ({
      taskId: t.taskId, goal: t.goal, status: t.status,
      completedSteps: t.steps.filter(s => s.status === 'done').length,
      totalSteps: t.steps.length, updatedAt: t.updatedAt,
    }))
    BrowserWindow.getAllWindows().forEach(win =>
      win.webContents.send(HARNESS_RESUMEABLE_DETECTED, summaries))
  }
}).catch(err => logger.error('startup.resumeable-scan.failed', { error: String(err) }))
```

### 8.5 harness/index.ts 导出追加

```typescript
// === TASK021 ===
export { TaskStateMachine } from './task-state-machine'
export type { TaskState, TaskStep, TaskArtifacts, TaskResumeResult } from './task-state-machine'
```

---

## 九、测试策略

### 9.1 TaskStateMachine 测试用例

**文件**：`tests/harness/task-state-machine.test.ts`

| # | 测试名 | 操作 | 期望结果 |
|---|--------|------|---------|
| 1 | 创建任务 → state.json 存在且格式正确 | `create('goal', ['s1','s2','s3'])` | 文件存在，status='planning'，steps.length=3 |
| 2 | 推进步骤 → currentStepIndex 递增 | `advance(taskId, 'summary', [])` | currentStepIndex=1，前一步 status='done' |
| 3 | 推进到最后一步 → 自动归档到 completed/ | 连续 advance 至所有步骤完成 | status='completed'，文件在 completed/ 目录 |
| 4 | 取消任务 → 归档到 cancelled/ | `abandon(taskId)` | status='cancelled'，文件在 cancelled/ 目录 |
| 5 | 损坏 state.json → 移至 corrupted/ | 写入非法 JSON 后调用 `findResumeable()` | 损坏文件在 corrupted/，返回列表为空 |
| 6 | 查找可恢复任务 → 仅返回 executing/awaiting_confirmation | 创建多种状态的任务 | 仅 executing 和 awaiting_confirmation 的任务返回 |
| 7 | 写入失败 → 记录错误但不抛出 | Mock FileManager.writeFile 抛错 | `persist()` 不抛出，日志有 error 记录 |
| 8 | 路径穿越 → 抛出异常 | `create` 使用 `../../../etc` 作为 taskId | 抛出 path traversal 错误 |
| 9 | resume → 恢复上下文包含已完成步骤摘要 | advance 两步后 resume | resumePrompt 包含已完成步骤描述 |
| 10 | 原子写入 → temp 文件不残留 | 正常 persist 后 | `.tmp` 文件不存在，仅 `state.json` 存在 |
| 11 | agents/ 目录不存在 → findResumeable 返回空 | 不创建 agents/ | 返回 `[]`，不抛出异常 |
| 12 | generateId → 格式为 task-{timestamp}-{random} | 调用 generateId() | 匹配 `/^task-\d+-[a-z0-9]+$/` |

**Mock 策略**：
- `FileManager` 使用内存实现（模拟文件系统操作）
- `Logger` 使用 jest mock，验证日志调用

### 9.2 UI 组件测试用例

#### EvaluationDrawer 测试

**文件**：`tests/harness/ui/evaluation-drawer.test.tsx`

| # | 测试名 | 前置条件 | 期望 |
|---|--------|---------|------|
| 1 | 渲染 pass 维度 | mock report 全部 pass | 所有维度显示 ✓，无红色高亮 |
| 2 | 渲染 fail 维度 | mock report 含 fail 维度 | fail 维度红色高亮，显示 issues |
| 3 | Panel 模式共识展示 | mode='panel'，两个 evaluator reports | 显示共识状态 |
| 4 | 降级警告展示 | harnessMeta.degraded=true | 显示「质量审查暂不可用」 |
| 5 | 折叠/展开审查理由 | 点击「展开详情」 | rationale 区域可见性切换 |

#### ModeSelector 测试

**文件**：`tests/harness/ui/mode-selector.test.tsx`

| # | 测试名 | 前置条件 | 期望 |
|---|--------|---------|------|
| 1 | 当前模式高亮 | currentMode='dual' | Dual 按钮高亮样式 |
| 2 | 切换模式 → 调用 setMode | 点击 Panel 按钮 | harnessStore.setMode('panel') 被调用 |
| 3 | Tooltip 内容正确 | 悬停 Single 按钮 | 显示「直接回答，不进行质量审查」 |

#### ResumeTaskDialog 测试

**文件**：`tests/harness/ui/resume-task-dialog.test.tsx`

| # | 测试名 | 前置条件 | 期望 |
|---|--------|---------|------|
| 1 | 无任务时不渲染 | resumeableTasks=[] | 组件返回 null |
| 2 | 有任务时显示列表 | resumeableTasks=[2 tasks] | 渲染 2 个任务卡片 |
| 3 | 点击「继续」触发 IPC | 点击第一个任务「继续执行」 | IPC `harness:resumeTask` 被调用 |
| 4 | 点击「放弃」触发 IPC | 点击第一个任务「放弃」 | IPC `harness:abandonTask` 被调用 |
| 5 | 所有任务处理后自动关闭 | 逐个处理所有任务 | 对话框关闭 |

### 9.3 测试覆盖率目标与 Mock 策略

| 模块 | 目标 | Mock 策略 |
|------|------|----------|
| `task-state-machine.ts` | ≥ 90% | FileManager 内存实现 + Logger mock |
| UI 组件（5 个） | ≥ 80% | `window.api.invoke`/`on` mock |
| `harnessStore` 扩展 | ≥ 85% | Zustand `getState()` 直接操作 |

---

## 十、执行步骤

### 阶段 1：类型定义与共享契约（~0.3 天）

| 步骤 | 产出 | 文件 |
|------|------|------|
| 1.1 | 定义 `TaskStatus`、`StepStatus`、`TaskStep`、`TaskArtifacts`、`TaskState`、`TaskResumeResult` 类型 | `src/main/services/harness/task-state-machine.ts` |
| 1.2 | 定义 `AGENTS_DIR`、`TASK_STATE_FILE`、`ARCHIVE_DIRS` 常量 | 同上 |
| 1.3 | 定义 `isResumeableStatus()`、`isTerminalStatus()` 类型守卫 | 同上 |
| 1.4 | 追加 `TaskStateSummary`、`GuardrailNotificationData` 共享类型 | `src/shared/types.ts` |
| 1.5 | 追加 `HARNESS_LIST_RESUMEABLE`、`HARNESS_RESUME_TASK`、`HARNESS_ABANDON_TASK`、`HARNESS_RESUMEABLE_DETECTED` IPC 通道常量 | `src/shared/types.ts` |
| 1.6 | 运行 `npm run typecheck` 验证类型一致性 | — |

### 阶段 2：TaskStateMachine 核心实现（~1 天）

| 步骤 | 产出 | 文件 |
|------|------|------|
| 2.1 | 类骨架 + 构造函数 + `generateId()`/`validatePathSafety()`/`getTaskDir()`/`getStatePath()` | `task-state-machine.ts` |
| 2.2 | `persist()` 原子写入 + `load()` 读取解析 | 同上 |
| 2.3 | `create()` 构建初始 TaskState + `advance()` 更新步骤 + `updateStatus()` | 同上 |
| 2.4 | `archive()` 归档 + `moveToCorrupted()` 隔离 | 同上 |
| 2.5 | `findResumeable()` 扫描 + `resume()` + `buildResumePrompt()` + `abandon()` | 同上 |
| 2.6 | 追加 TaskStateMachine 导出至 `harness/index.ts`；运行 `npm run typecheck` | — |

### 阶段 3：IPC 集成（~0.3 天）

| 步骤 | 产出 | 文件 |
|------|------|------|
| 3.1 | HarnessHandler 追加 `setTaskStateMachine()` + 3 个新 handler | `harness.ts` |
| 3.2 | HarnessOrchestrator 追加 `setTaskStateMachine()` + `execute()` 集成 | `orchestrator.ts` |
| 3.3 | main/index.ts 追加初始化 + 启动扫描；运行 typecheck | `main/index.ts` |

### 阶段 4：harnessStore 扩展（~0.3 天）

| 步骤 | 产出 | 文件 |
|------|------|------|
| 4.1 | 追加 `resumeableTasks`/`showResumeDialog`/`guardrailNotifications` 状态 + 对应 actions + selectors | `harnessStore.ts` |
| 4.2 | 实现 `useHarnessEvents` hook（IPC 事件监听）；运行 typecheck | `useHarnessEvents.ts` |

### 阶段 5：UI 组件实现（~1 天）

| 步骤 | 产出 | 文件 |
|------|------|------|
| 5.1 | `ModeSelector.tsx` — 三段式按钮组 + tooltip | `harness/ModeSelector.tsx` |
| 5.2 | `GuardrailNotification.tsx` — toast + 自动消失 + Guard 名称映射 | `harness/GuardrailNotification.tsx` |
| 5.3 | `ResumeTaskDialog.tsx` — Modal + 任务卡片 + 相对时间 | `harness/ResumeTaskDialog.tsx` |
| 5.4 | `ActiveGuidesIndicator.tsx` — 标签组 + 折叠 + tooltip | `harness/ActiveGuidesIndicator.tsx` |
| 5.5 | `EvaluationDrawer.tsx` — 右侧抽屉 + 维度列表 + 共识状态 | `harness/EvaluationDrawer.tsx` |
| 5.6 | AI 消息组件追加降级/验证标识 + 底栏集成 ModeSelector | 现有组件 |
| 5.7 | App 入口集成 `useHarnessEvents` + 全局通知/恢复弹窗；运行 typecheck | `App.tsx` |

### 阶段 6：单元测试（~0.5 天）

| 步骤 | 产出 |
|------|------|
| 6.1 | TaskStateMachine 12 个测试用例（`task-state-machine.test.ts`） |
| 6.2 | EvaluationDrawer 5 + ModeSelector 3 + ResumeTaskDialog 5 个测试用例 |
| 6.3 | 运行 `npm run test`，确保全部通过 + 覆盖率达标 |

### 阶段 7：最终验证（~0.2 天）

运行 `npm run typecheck` + `npm run lint` + `npm run test` 全部通过，更新任务状态为已完成。

---

## 十一、验收检查清单

### 状态机验收

- [ ] 多步骤 AI 任务（>=3 步或 long-running）自动创建 `state.json`
- [ ] 每个步骤完成时，原子更新状态文件（temp + rename）
- [ ] 进程重启后，存在未完成任务时弹出恢复提示
- [ ] 用户恢复任务时，AI 上下文包含已完成步骤的摘要
- [ ] 任务完成/取消时，状态文件移至对应归档目录
- [ ] 状态文件写入失败时，记录错误但不阻塞 AI 执行
- [ ] 状态文件损坏时（JSON 解析错误），移至 `corrupted/` 目录并通知用户
- [ ] 状态文件路径限定在 `.sibylla/agents/`，无路径穿越

### UI 验收

- [ ] 评审报告抽屉可展开/收起，展示各维度评审结果
- [ ] 模式切换器集成在底栏，支持 Single/Dual/Panel 切换
- [ ] Guardrail 拦截时弹出通知，包含拦截原因（自然语言）
- [ ] 应用启动时检测到未完成任务，弹出恢复对话框
- [ ] AI 消息旁展示活跃 Guide 指示器
- [ ] 降级警告（Evaluator 不可用等）在消息中标注黄色标签
- [ ] Sensor 全部通过时显示绿色「已自检 ✓」标识
- [ ] UI 使用「质量审查」「已自检」等自然语言，不暴露技术术语

### 集成验收

- [ ] `orchestrator.ts` 的 `setTaskStateMachine()` 注入正确
- [ ] `execute()` 中多步骤任务自动创建状态记录
- [ ] `execute()` 中每步完成后调用 `advance()`
- [ ] `execute()` 异常时调用 `updateStatus('failed')`
- [ ] `harness.ts` IPC handler 可查询 listResumeable / resumeTask / abandonTask
- [ ] `harnessStore` 新增状态（resumeableTasks、guardrailNotifications）正常工作
- [ ] `main/index.ts` 初始化链路：TaskStateMachine 创建 → 注入 → 启动扫描
- [ ] IPC 事件（guardrailBlocked、resumeableTaskDetected、degradationOccurred）正确到达渲染进程

### 降级 & 性能验收

- [ ] 状态机写入失败 → 不阻塞 AI 执行
- [ ] agents/ 目录不存在 → findResumeable 返回空数组
- [ ] state.json 损坏 → 移至 corrupted/，不影响其他任务
- [ ] 状态机写入 < 50ms；findResumeable 扫描 < 100ms

### 类型验收

- [ ] `npm run typecheck` + `npm run lint` + `npm run test` 全部通过
- [ ] 测试覆盖率 ≥ 80%

---

## 十二、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 状态文件膨胀（大量 artifacts） | 低 | 低 | 定期归档 completed 任务；state.json 仅存摘要，不存文件内容；MaxAge 配置后续迭代 |
| 原子写入在某些文件系统上不保证原子性 | 低 | 中 | rename 在 POSIX 系统上保证原子性；Windows 需 MOVEFILE_REPLACE_EXISTING 标志；FileManager 已处理跨平台差异 |
| agents/ 目录权限不足导致写入失败 | 低 | 中 | 写入失败不阻塞 AI；日志记录供排查；`.sibylla/` 在 workspace init 时预创建 |
| 用户对「质量审查」概念不理解 | 中 | 低 | tooltip 提供详细说明；新手引导后续迭代补充 |
| 多窗口场景下 IPC 广播不一致 | 低 | 低 | 使用 `BrowserWindow.getAllWindows()` 广播；store 状态由各窗口独立维护 |
| ResumeTaskDialog 与其他启动弹窗冲突 | 低 | 低 | 使用 z-index 层级管理；恢复对话框优先于非关键通知 |
| Guardrail 通知堆积（频繁拦截） | 低 | 低 | block 类通知 10 秒自动消失；最多同时显示 3 条，超出排队 |

**创建时间：** 2026-04-20 | **最后更新：** 2026-04-20
