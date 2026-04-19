# 状态机追踪器与 Harness UI 集成

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK021 |
| **任务标题** | 状态机追踪器与 Harness UI 集成 |
| **所属阶段** | Phase 1 - Harness 基础设施 (Sprint 3.1) |
| **优先级** | P1 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

实现多步骤 AI 任务的状态持久化与崩溃恢复机制，并构建 Harness 系统的完整用户可见层——让所有 Harness 行为（评审报告、Guardrail 通知、Guide 指示、模式切换、任务恢复）对用户透明且可追溯。

### 背景

TASK017-020 已实现 Harness 的全部后端能力（Guardrails、编排器、Guides、Sensors、工具范围），但这些能力目前对用户不可见。同时，多步骤 AI 任务缺乏持久化机制，Electron 崩溃后无法恢复上下文。

本任务需要：
1. **状态机追踪器**：为多步骤任务分配 task ID，持久化到 `.sibylla/agents/{task-id}/state.json`，支持崩溃恢复
2. **Harness UI 组件**：让用户看到 Harness 在做什么，能切换模式、查看评审报告、处理 Guardrail 通知

### 范围

**包含：**

状态机部分：
- `TaskStateMachine` 类（`src/main/services/harness/task-state-machine.ts`）
- `TaskState` / `TaskStep` / `TaskArtifacts` 类型定义
- 任务创建、步骤推进、状态持久化（原子写入）
- 崩溃恢复：扫描未完成任务、重建 AI 上下文
- 任务完成/取消/损坏的归档机制
- 相关 IPC 通道实现

UI 组件部分：
- `EvaluationDrawer.tsx` — 评审报告抽屉（集成在 Studio 右侧栏）
- `ModeSelector.tsx` — 执行模式切换器（集成在底栏）
- `GuardrailNotification.tsx` — Guardrail 拦截通知
- `ResumeTaskDialog.tsx` — 崩溃恢复对话框
- `ActiveGuidesIndicator.tsx` — 活跃 Guides 指示器
- Guardrail 管理设置页面（启用/禁用规则）
- Guide 管理设置页面（启用/禁用 Guide）
- 单元测试

**不包含：**
- Sprint 3.2 的 `progress.md` 可视化（人类可读 Markdown 视图）
- 高级任务管理 UI（甘特图、依赖关系可视化等）

## 验收标准

### 状态机验收标准

- [ ] 多步骤 AI 任务（>=3 步或标记为 long-running）自动创建 `state.json`
- [ ] 每个步骤完成时，原子更新状态文件（temp + rename）
- [ ] 进程重启后，存在未完成任务时弹出恢复提示
- [ ] 用户恢复任务时，AI 上下文包含已完成步骤的摘要
- [ ] 任务完成/取消时，状态文件移至对应归档目录
- [ ] 状态文件写入失败时，记录错误但不阻塞 AI 执行
- [ ] 状态文件损坏时（JSON 解析错误），移至 `corrupted/` 目录并通知用户
- [ ] 状态文件路径限定在 `.sibylla/agents/`，无路径穿越

### UI 验收标准

- [ ] 评审报告抽屉可展开/收起，展示各维度评审结果
- [ ] 模式切换器集成在底栏，支持 Single/Dual/Panel 切换
- [ ] Guardrail 拦截时弹出通知，包含拦截原因
- [ ] 应用启动时检测到未完成任务，弹出恢复对话框
- [ ] AI 消息旁展示活跃 Guide 指示器
- [ ] 降级警告（Evaluator 不可用等）在消息中标注
- [ ] 设置页面可管理 Guardrail 规则和 Guide 的启用/禁用
- [ ] UI 使用「质量审查」「已自检」等自然语言，不暴露技术术语

## 依赖关系

### 前置依赖

- [x] TASK017（Guardrails）— GuardrailNotification 消费 `harness:guardrailBlocked` 事件
- [x] TASK018（编排器）— EvaluationDrawer 消费 EvaluationReport
- [x] TASK019（Guides + Sensors）— ActiveGuidesIndicator 展示活跃 Guide
- [x] FileManager — 状态文件的读写
- [x] harnessStore（TASK018 创建）— UI 组件消费 store 状态

### 被依赖任务

- Sprint 3.2 将在此基础上构建 `progress.md` 用户可见任务台账

## 参考文档

- [`specs/requirements/phase1/sprint3.1-harness.md`](../../requirements/phase1/sprint3.1-harness.md) — 需求 3.1.6 状态机追踪器 + UI 相关规格
- [`CLAUDE.md`](../../../CLAUDE.md) — UI/UX 红线（§六）、Git 不可见原则（§二）
- [`specs/design/ui-ux-design.md`](../../design/ui-ux-design.md) — UI 设计规范
- `.kilocode/skills/phase1/zustand-state-management/SKILL.md` — Zustand store 设计

## 技术执行路径

### 架构设计

```
TaskStateMachine 持久化架构

.sibylla/agents/
├── {task-id-1}/
│   └── state.json         ← 进行中任务的持久化状态
├── {task-id-2}/
│   └── state.json
├── completed/              ← 已完成任务归档
│   └── {task-id}/state.json
├── cancelled/              ← 已取消任务归档
│   └── {task-id}/state.json
└── corrupted/              ← 损坏文件隔离
    └── {task-id}/state.json
```

```
Harness UI 组件集成架构

Studio 主界面
├── 底栏
│   └── ModeSelector (Single/Dual/Panel 切换)
├── AI 对话面板
│   ├── 消息气泡
│   │   ├── ActiveGuidesIndicator (活跃 Guide 标签)
│   │   ├── DegradationBadge (降级警告)
│   │   └── VerifiedBadge (Sensor 全部通过)
│   └── EvaluationDrawer (右侧抽屉，按消息展开)
├── 通知层
│   ├── GuardrailNotification (Guardrail 拦截 toast)
│   └── DegradationWarning (Evaluator 不可用提示)
└── 启动弹窗
    └── ResumeTaskDialog (未完成任务恢复选择)
```

### 状态机核心类型

```typescript
// task-state-machine.ts

export interface TaskState {
  taskId: string
  goal: string
  createdAt: number
  updatedAt: number
  status: 'planning' | 'executing' | 'awaiting_confirmation' | 'completed' | 'cancelled' | 'failed'
  steps: TaskStep[]
  currentStepIndex: number
  artifacts: TaskArtifacts
  lastSessionId?: string
}

export interface TaskStep {
  id: string
  description: string
  status: 'pending' | 'in_progress' | 'done' | 'skipped'
  startedAt?: number
  completedAt?: number
  artifacts?: string[]
  summary?: string
}

export interface TaskArtifacts {
  referencedFiles: string[]
  modifiedFiles: string[]
  evaluations: Array<{ stepId: string; verdict: string; criticalIssues: string[] }>
}
```

## 执行步骤

### 第一部分：状态机追踪器

#### 步骤 1：定义 TaskState 相关类型

**文件：** `src/main/services/harness/task-state-machine.ts`

1. 定义 `TaskState` 接口：taskId、goal、createdAt、updatedAt、status、steps、currentStepIndex、artifacts、lastSessionId
2. 定义 `TaskStep` 接口：id、description、status（pending/in_progress/done/skipped）、startedAt、completedAt、artifacts、summary
3. 定义 `TaskArtifacts` 接口：referencedFiles、modifiedFiles、evaluations
4. 定义 `AGENTS_DIR = '.sibylla/agents/'` 常量
5. 定义 `TASK_STATE_FILE = 'state.json'` 常量

#### 步骤 2：实现 `TaskStateMachine` 核心类

**文件：** `src/main/services/harness/task-state-machine.ts`

1. 创建 `TaskStateMachine` 类，注入 FileManager、workspaceRoot、Logger
2. 实现 `create(goal, plannedSteps)` 方法：
   - 生成唯一 taskId（`task-${Date.now()}-${random}`）
   - 构建 TaskState 初始对象
   - 调用 `persist(state)` 写入 `.sibylla/agents/{taskId}/state.json`
   - 返回 TaskState
3. 实现 `advance(taskId, stepSummary, artifacts)` 方法：
   - 加载 state
   - 更新当前步骤状态为 done
   - 递增 currentStepIndex
   - 若所有步骤完成，设置 status 为 completed 并归档
   - 否则调用 `persist(state)`
4. 实现 `updateStatus(taskId, status)` 方法：更新任务状态并持久化

#### 步骤 3：实现状态持久化（原子写入）

**文件：** `src/main/services/harness/task-state-machine.ts`

1. 实现 `persist(state)` 私有方法：
   - 构建目标路径 `.sibylla/agents/{taskId}/state.json`
   - 确保目录存在（`mkdir recursive`）
   - 写入临时文件 `state.json.tmp`
   - 执行原子 rename（tmp → final）
   - 写入失败时记录错误但不抛出（不阻塞 AI 执行）
2. 实现 `load(taskId)` 私有方法：
   - 读取并解析 state.json
   - JSON 解析失败时调用 `moveToCorrupted()`
3. 实现 `moveToCorrupted(statePath)` 私有方法：
   - 移动损坏文件到 `.sibylla/agents/corrupted/`
   - 记录 warn 日志
4. 实现 `archive(state)` 私有方法：
   - 移动 state 目录到 `.sibylla/agents/completed/` 或 `cancelled/`

#### 步骤 4：实现崩溃恢复

**文件：** `src/main/services/harness/task-state-machine.ts`

1. 实现 `findResumeable()` 方法：
   - 列出 `.sibylla/agents/` 下的子目录
   - 跳过 completed/、cancelled/、corrupted/ 特殊目录
   - 对每个子目录尝试读取 state.json
   - 筛选 status 为 `executing` 或 `awaiting_confirmation` 的任务
   - 损坏的 state 文件移至 corrupted/
   - 返回可恢复任务列表
2. 实现 `resume(taskId)` 方法：
   - 加载 TaskState
   - 设置 status 为 `executing`
   - 重建 AI 上下文提示（「你之前正在执行任务 X，已完成步骤 1-3，现在从步骤 4 继续」）
   - 返回 TaskState + 恢复提示
3. 实现 `abandon(taskId)` 方法：
   - 加载 TaskState
   - 设置 status 为 `cancelled`
   - 归档到 `cancelled/`

#### 步骤 5：集成到 `HarnessOrchestrator`

**文件：** `src/main/services/harness/orchestrator.ts`

1. 在 `HarnessOrchestrator` 构造函数中注入 `TaskStateMachine`
2. 在 `execute()` 中检测是否为多步骤任务：
   - 若请求包含 `plannedSteps` 且数量 >= 3 → 调用 `taskStateMachine.create()`
   - 单步骤任务不创建状态记录
3. 在每个步骤完成后调用 `taskStateMachine.advance()`
4. 在 `execute()` 结束后：
   - 成功时若存在 task → 调用 `advance()` 标记完成
   - 异常时若存在 task → 调用 `updateStatus('failed')`

### 第二部分：Harness UI 组件

#### 步骤 6：扩展 `harnessStore` 支持 UI 状态

**文件：** `src/renderer/store/harnessStore.ts`（TASK018 已创建，此处扩展）

1. 追加状态字段：
   - `resumeableTasks: TaskState[]`
   - `showResumeDialog: boolean`
   - `guardrailNotifications: GuardrailNotification[]`
2. 追加 Action：
   - `setResumeableTasks(tasks)` — 设置可恢复任务
   - `toggleResumeDialog()` — 切换恢复对话框
   - `addGuardrailNotification(verdict)` — 添加 Guardrail 通知
   - `dismissGuardrailNotification(id)` — 关闭通知
3. 在 `useEffect` 中监听 IPC 事件：
   - `harness:guardrailBlocked` → push 通知
   - `harness:degradationOccurred` → push 警告
   - `harness:resumeableTaskDetected` → 设置可恢复任务

#### 步骤 7：实现 `EvaluationDrawer` 评审报告抽屉

**文件：** `src/renderer/components/studio/harness/EvaluationDrawer.tsx`

1. Props：`messageId: string`
2. 从 `harnessStore` 读取该消息的 `EvaluationReport[]`
3. 渲染内容：
   - 模式标签（Single/Dual/Panel）
   - Generator 尝试次数
   - 每个评审维度（factual_consistency、spec_compliance 等）的通过/失败状态
   - Critical issues 列表（红色高亮）
   - Minor issues 列表（黄色）
   - Evaluator rationale（折叠展示）
4. Panel 模式额外展示：共识状态（通过/异议/拒绝）
5. 降级时展示降级原因
6. 使用自然语言：「质量审查」「自检结果」而非「evaluation」

#### 步骤 8：实现 `ModeSelector` 模式切换器

**文件：** `src/renderer/components/studio/harness/ModeSelector.tsx`

1. 集成在 Studio 底栏（AI 对话输入框旁边）
2. 渲染三个模式选项：Single / Dual / Panel
3. 当前模式高亮显示
4. 切换时调用 `harnessStore.setMode()` → IPC `harness:setMode`
5. 提供 tooltip 说明各模式差异：
   - Single：「直接回答，不进行质量审查」
   - Dual：「AI 自检后再回答（推荐）」
   - Panel：「多重审查后回答（用于规范文件修改）」

#### 步骤 9：实现 `GuardrailNotification` 拦截通知

**文件：** `src/renderer/components/studio/harness/GuardrailNotification.tsx`

1. 从 `harnessStore` 读取 `guardrailNotifications`
2. 渲染为 toast 通知（右上角或底部）
3. 内容包含：
   - 拦截规则名称（用自然语言：「系统路径保护」「敏感信息检测」等）
   - 拦截原因
   - 关闭按钮
4. 自动消失（10 秒），也可手动关闭
5. 颜色编码：block → 红色，conditional → 黄色

#### 步骤 10：实现 `ResumeTaskDialog` 恢复对话框

**文件：** `src/renderer/components/studio/harness/ResumeTaskDialog.tsx`

1. 应用启动时，从 `harnessStore` 读取 `resumeableTasks`
2. 若列表非空，弹出 Modal 对话框
3. 对话框标题：「未完成的任务」
4. 每个任务显示：
   - 任务目标（goal）
   - 已完成步骤 / 总步骤
   - 上次更新时间
   - 「继续」和「放弃」按钮
5. 点击「继续」→ IPC `harness:resumeTask` → 关闭对话框 → AI 上下文恢复
6. 点击「放弃」→ IPC `harness:abandonTask` → 关闭对话框
7. 所有任务处理完毕后自动关闭对话框

#### 步骤 11：实现 `ActiveGuidesIndicator` 指示器

**文件：** `src/renderer/components/studio/harness/ActiveGuidesIndicator.tsx`

1. 从 `harnessStore` 或消息 metadata 读取活跃 Guide 列表
2. 渲染为 AI 消息气泡下方的标签组
3. 每个 Guide 显示为小标签（如「规范审查模式」「简洁输出」）
4. 鼠标悬停显示 Guide 描述
5. 不占用过多空间，可折叠

#### 步骤 12：实现降级与验证标识

1. 在 AI 消息气泡中添加条件渲染：
   - `harnessMeta.degraded === true` → 显示黄色「质量审查暂不可用」标签
   - `harnessMeta.degradeReason` → tooltip 显示降级原因
   - Sensor 全部通过 → 显示绿色「已自检 ✓」标识
2. 这些标识直接嵌入现有 AI 消息组件中，不新建独立文件
3. 使用 TailwindCSS 样式，遵循 `ui-ux-design.md` 规范

#### 步骤 13：编写单元测试

**文件：** `tests/harness/task-state-machine.test.ts` + `tests/harness/ui/`

1. `task-state-machine.test.ts`：
   - 创建任务 → state.json 存在且格式正确
   - 推进步骤 → currentStepIndex 递增
   - 所有步骤完成 → status 变为 completed + 文件移至 completed/
   - 取消任务 → 文件移至 cancelled/
   - 损坏 state.json → 移至 corrupted/
   - 查找可恢复任务 → 仅返回 executing/awaiting_confirmation 状态
   - 写入失败 → 记录错误但不抛出

2. `ui/evaluation-drawer.test.tsx`：
   - 渲染评审报告（pass/fail 维度）
   - Panel 模式共识展示
   - 降级警告展示

3. `ui/mode-selector.test.tsx`：
   - 当前模式高亮
   - 切换模式触发 IPC

4. `ui/resume-task-dialog.test.tsx`：
   - 无任务时不渲染
   - 有任务时显示列表
   - 点击继续/放弃触发 IPC

#### 步骤 14：集成验证

1. 运行 `npm run typecheck` 确保类型无误
2. 运行 `npm run lint` 确保代码规范
3. 运行 `npm run test` 确保所有测试通过
4. 端到端验证：
   - 触发 Guardrail 拦截 → Notification 弹出
   - 切换模式 → 底栏更新
   - 查看 EvaluationDrawer → 展示评审报告
   - 模拟崩溃恢复 → ResumeTaskDialog 弹出

---

**创建时间：** 2026-04-18
**最后更新：** 2026-04-18
