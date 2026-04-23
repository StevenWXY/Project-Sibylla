# PHASE1-TASK039: Workflow 自动化与管理 UI 收官 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task039_workflow-management-ui.md](../specs/tasks/phase1/phase1-task039_workflow-management-ui.md)
> 创建日期：2026-04-23
> 最后更新：2026-04-23

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK039 |
| **任务标题** | Workflow 自动化与管理 UI 收官 |
| **所属阶段** | Phase 1 - AI 能力扩展体系 (Sprint 3.5) |
| **优先级** | P1 |
| **复杂度** | 非常复杂 |
| **预估工时** | 5-6 工作日 |
| **前置依赖** | TASK035 (PromptComposer) + TASK037 (SkillExecutor) + TASK038 (SubAgentExecutor) + TASK027 (Tracer) + TASK017 (Harness) + TASK032 (CommandPalette) |

### 1.1 目标

构建 Sprint 3.5 的三个收尾能力：
1. **Workflow 自动化系统** — 声明式 YAML 定义多步编排流程，串联 Skill 与 Sub-agent，响应文件变化/定时/手动触发
2. **扩展能力管理 UI** — Skill 库、Sub-agent 管理、Workflow 管理的渲染进程面板
3. **Sprint 3.5 文档收官** — CLAUDE.md 更新到 Phase 1、Prompt 版本化数据收集

### 1.2 核心设计约束

| 约束 | 来源 | 说明 |
|------|------|------|
| Workflow 使用声明式 YAML，不支持 for/while 循环 | sprint3.5 §2.5 | 避免成为小型编程语言 |
| Workflow 不自动回滚，只做"暂停-确认-继续" | sprint3.5 §5.5; CLAUDE.md §二 | AI 建议，人类决策 |
| 管理 UI 隐藏在命令面板之后，不冲击主界面 | sprint3.5 §1.2; CLAUDE.md §六 | 非技术用户友好 |
| TS 严格模式禁止 any | CLAUDE.md §四 | 全局约束 |
| 主进程与渲染进程严格隔离 | CLAUDE.md §三 | 文件系统访问仅在主进程 |
| 所有写入先临时文件再原子替换 | CLAUDE.md §六 | 文件丢失不可接受 |
| Prompt 版本化优先级 P2，MVP 仅数据收集 | task spec | A/B test 留后续 Sprint |

### 1.3 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| Workflow 共享类型 | `src/shared/types.ts`（扩展） | WorkflowDefinition / WorkflowRun / StepResult 等 + IPC 通道 |
| WorkflowParser | `src/main/services/workflow/WorkflowParser.ts` | YAML 解析与 schema 校验 |
| WorkflowRegistry | `src/main/services/workflow/WorkflowRegistry.ts` | 双源注册与查询 |
| WorkflowExecutor | `src/main/services/workflow/WorkflowExecutor.ts` | 步骤执行引擎 |
| WorkflowScheduler | `src/main/services/workflow/WorkflowScheduler.ts` | 触发器管理 |
| WorkflowRunStore | `src/main/services/workflow/WorkflowRunStore.ts` | 运行记录持久化 |
| 步骤执行器 | `src/main/services/workflow/steps/`（4 文件） | SkillStep / SubAgentStep / ConditionStep / NotifyStep |
| 内部类型 | `src/main/services/workflow/types.ts` | WorkflowRunContext / ParseResult 等 |
| 统一导出 | `src/main/services/workflow/index.ts` | 公共 API |
| 内置模板 | `resources/workflows/`（3 个 YAML） | prd-review / daily-summary / spec-publish |
| SkillLibrary 面板 | `src/renderer/components/skill-library/`（3 文件） | Skill 库浏览/搜索/导入 |
| Workflow 管理面板 | `src/renderer/components/workflow/`（4 文件） | Workflow 管理/确认/历史 |
| AgentCard | `src/renderer/components/agent/AgentCard.tsx` | Sub-agent 卡片 |
| workflowStore | `src/renderer/store/workflowStore.ts` | Zustand 状态管理 |
| IPC Handler | `src/main/ipc/handlers/workflow.ts` | 7 个 IPC 通道 |
| Preload API | `src/preload/index.ts`（扩展） | workflow 命名空间 |
| Prompt 性能收集 | `src/main/services/context-engine/PromptPerformanceCollector.ts` | JSONL append-only |
| 单元测试 | `tests/main/services/workflow/*.test.ts` + `tests/renderer/components/*.test.tsx` | 覆盖率 ≥ 80% |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；文件即真相；AI 建议/人类决策；主进程/渲染进程隔离；写入先临时文件再原子替换；等待超 2 秒需进度反馈 | 全局约束 |
| `specs/design/architecture.md` | 进程通信架构（IPC 隔离）；Electron 安全策略 | IPC 设计 + 进程隔离 |
| `specs/design/data-and-api.md` | IPC 通道命名 `namespace:action`；IPCChannelMap 类型映射 | IPC 通道注册 |
| `specs/design/ui-ux-design.md` | 色彩体系（主色 #6366F1）；按钮 6px 圆角；组件规范 | UI 组件设计 |
| `specs/requirements/phase1/sprint3.5-ai_ablities.md` | §2.5 Workflow 编排语义；§4.5 Workflow 系统；§5.5 Workflow 需求；§5.8 管理 UI 需求；§5.9 CLAUDE.md 更新；§5.10 Prompt 版本化；§12 数据模型；附录 A §17A | 验收标准 + 类型定义 |
| `specs/tasks/phase1/phase1-task039_workflow-management-ui.md` | 10 步执行路径、完整验收标准、架构图 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `zustand-state-management` | workflowStore 设计；selector 性能优化；persist 中间件 | workflowStore.ts 全文件 |
| `electron-ipc-patterns` | IPC 通道类型安全注册；IPCChannelMap 扩展；Preload API 安全暴露；Main→Renderer 推送事件 | shared/types.ts + ipc/handlers/workflow.ts + preload/index.ts |
| `frontend-design` | SkillCard / WorkflowCard / ConfirmPanel UI 设计 | renderer/components/ 全部 UI 文件 |
| `typescript-strict-mode` | WorkflowDefinition 等严格类型设计；泛型约束；联合类型 | types.ts + 全部 TS 文件 |

### 2.3 前置代码依赖

| 模块 | 文件路径 | 行数 | 复用方式 |
|------|---------|------|---------|
| `SkillExecutor` | `src/main/services/skill-system/SkillExecutor.ts` | 240 | Workflow skill 步骤委托：`skillExecutor.execute(ctx)` |
| `SkillV2` | `src/shared/types.ts` | — | SkillStep 类型引用 |
| `SubAgentExecutor` | `src/main/services/sub-agent/SubAgentExecutor.ts` | 338 | Workflow sub_agent 步骤委托：`subAgentExecutor.run(opts)` |
| `SubAgentDefinition` / `SubAgentResult` | `src/shared/types.ts:2574-2627` | — | SubAgentStep 类型引用 |
| `PromptComposer` | `src/main/services/context-engine/PromptComposer.ts` | 265 | Skill 步骤的 prompt 注入 |
| `Tracer` | `src/main/services/trace/tracer.ts` | 235 | Workflow 运行产生 Trace：`startSpan('workflow.run')` |
| `TraceStore` | `src/main/services/trace/trace-store.ts` | 476 | Workflow Trace 存储 |
| `IpcHandler` | `src/main/ipc/handler.ts` | 218 | 继承基类注册 IPC handler |
| `IPC_CHANNELS` | `src/shared/types.ts:72-432` | — | 追加 Workflow 通道常量 |
| `IPCChannelMap` | `src/shared/types.ts:476-739` | — | 追加 Workflow 通道类型映射 |
| `FileManager` | `src/main/services/file-manager.ts` | — | WorkflowRunStore 文件读写 |
| `logger` | `src/main/utils/logger.ts` | — | 结构化日志依赖 |
| `CommandRegistry` | `src/main/services/command/command-registry.ts` | 175 | 注册扩展能力管理命令 |
| `CommandPalette` | `src/renderer/components/command-palette/` | 213 | 管理命令入口 |
| `DiffReviewPanel` | `src/renderer/components/studio/DiffReviewPanel.tsx` | 228 | Workflow 确认面板复用 diff 展示 |
| `memoryStore` | `src/renderer/store/memoryStore.ts` | 471 | Store 设计模式参考 |
| `modeStore` | `src/renderer/store/modeStore.ts` | 125 | Store 设计模式参考 |
| `preload/index.ts` | `src/preload/index.ts` | 1794 | 扩展 workflow 命名空间 |
| `resources/skills/` | `resources/skills/` | 8 个子目录 | SkillLibrary 数据源 |
| `resources/prompts/agents/` | `resources/prompts/agents/` | 5 个文件 | AgentCard 数据源 |

### 2.4 完全缺失、需新建的模块

| 模块 | 路径 | 说明 |
|------|------|------|
| `workflow/` 目录 | `src/main/services/workflow/` | 整个 Workflow 系统（7 个文件） |
| `workflow/steps/` 目录 | `src/main/services/workflow/steps/` | 4 个步骤执行器 |
| `resources/workflows/` 目录 | `sibylla-desktop/resources/workflows/` | 3 个内置模板 |
| `skill-library/` 目录 | `src/renderer/components/skill-library/` | 3 个组件 |
| `workflow/` UI 目录 | `src/renderer/components/workflow/` | 4 个组件 |
| `agent/` UI 目录 | `src/renderer/components/agent/` | 1 个组件 |
| `workflowStore.ts` | `src/renderer/store/workflowStore.ts` | Zustand store |
| `workflow.ts` IPC | `src/main/ipc/handlers/workflow.ts` | IPC handler |
| `PromptPerformanceCollector.ts` | `src/main/services/context-engine/` | P2 数据收集 |
| 测试目录 | `tests/main/services/workflow/` | 5+ 测试文件 |

### 2.5 新增 IPC 通道清单

| 通道常量 | 通道名 | 方向 | 说明 |
|---------|--------|------|------|
| `WORKFLOW_LIST` | `workflow:list` | Renderer→Main | 列出所有 Workflow |
| `WORKFLOW_TRIGGER_MANUAL` | `workflow:trigger-manual` | Renderer→Main | 手动触发 Workflow |
| `WORKFLOW_GET_RUN` | `workflow:get-run` | Renderer→Main | 获取运行详情 |
| `WORKFLOW_CANCEL_RUN` | `workflow:cancel-run` | Renderer→Main | 取消运行 |
| `WORKFLOW_LIST_RUNS` | `workflow:list-runs` | Renderer→Main | 列出运行历史 |
| `WORKFLOW_CONFIRMATION_REQUIRED` | `workflow:confirmation-required` | Main→Renderer | 确认请求推送 |
| `WORKFLOW_CONFIRM_STEP` | `workflow:confirm-step` | Renderer→Main | 用户确认决策 |

---

## 三、现有代码盘点与差距分析

### 3.1 shared/types.ts 现状

**IPC_CHANNELS** (行 72-432)：已定义 ~160+ 通道，最新至 TASK038 (Sub-agent)。**不含任何 `WORKFLOW_*` 通道**，需追加 7 个。

**IPCChannelMap** (行 476-739)：已映射 Skill/Sub-agent 通道类型。**不含 Workflow 映射**，需追加。

**Workflow 类型** (行 2014-2033)：sprint3.5 需求文档定义了 `WorkflowDefinition`、`WorkflowRun` 等接口规范，但 **shared/types.ts 中尚未实现**。需根据 §12.1 规范新增。

### 3.2 主进程服务现状

| 模块 | 状态 | 与本任务的关系 |
|------|------|--------------|
| SkillExecutor (240L) | ✅ 已实现 | Workflow skill 步骤直接委托调用 |
| SubAgentExecutor (338L) | ✅ 已实现 | Workflow sub_agent 步骤直接委托调用 |
| SkillRegistry | ✅ 已实现 | SkillLibrary UI 数据来源 |
| SubAgentRegistry (231L) | ✅ 已实现 | AgentCard UI 数据来源 |
| Tracer (235L) | ✅ 已实现 | Workflow 运行 Trace 嵌套 |
| CommandRegistry (175L) | ✅ 已实现 | 注册管理命令 |
| IPC 基类 (218L) | ✅ 已实现 | 继承注册 Workflow handler |
| logger | ✅ 已实现 | 结构化日志 |

**缺口**：Workflow 整个服务层（7+ 文件）完全不存在。

### 3.3 渲染进程现状

| 模块 | 状态 | 说明 |
|------|------|------|
| CommandPalette (3 文件, 213L) | ✅ 已实现 | 扩展能力管理命令注册入口 |
| DiffReviewPanel (228L) | ✅ 已实现 | Workflow 确认面板复用 diff 展示 |
| Store (19 个) | ✅ 已实现 | 参考模式，workflowStore 需新建 |

**缺口**：

| 缺失项 | 说明 |
|--------|------|
| `workflowStore.ts` | 不存在，需新建 |
| `components/skill-library/` | 目录不存在，需创建 3 个文件 |
| `components/workflow/` | 目录不存在，需创建 4 个文件 |
| `components/agent/AgentCard.tsx` | 目录不存在，需创建 |

### 3.4 资源目录现状

| 目录 | 状态 | 说明 |
|------|------|------|
| `resources/skills/` | ✅ 存在 | 8 个内置 Skill（SkillLibrary 数据源） |
| `resources/prompts/agents/` | ✅ 存在 | 5 个 agent prompt（AgentCard 数据源） |
| `resources/workflows/` | ❌ 不存在 | 需创建，含 3 个内置 YAML 模板 |

### 3.5 Preload API 现状

现有 `preload/index.ts` (1794L) 已暴露 `memory`、`subAgent` 等命名空间。**不含 `workflow` 命名空间**，需追加。

---

## 四、分步实施计划

### 阶段 A：Workflow 共享类型与 IPC 通道（Step 1） — 预计 0.3 天

#### A1：扩展 shared/types.ts

**文件：** `sibylla-desktop/src/shared/types.ts`

**新增类型**（追加到 Sub-agent 类型之后，详细接口见 sprint3.5-ai_ablities.md §12.1）：
- `WorkflowMetadata` — id / version / name / description / scope / author?
- `WorkflowTriggerType` — `'file_created' | 'file_changed' | 'schedule' | 'manual'`
- `WorkflowTrigger` — type / pattern? / cron? / name?
- `WorkflowParam` — name / type / required? / default? / enum?
- `WorkflowStep` — id / name / type? / skill? / sub_agent? / expression? / action? / input? / when? / on_failure? / timeout? / save_output_to? / requires_user_confirm?
- `WorkflowFailurePolicy` — notify_user? / rollback: false
- `WorkflowDefinition` — metadata / triggers / params? / steps / onFailure?
- `WorkflowRunStatus` — `'running' | 'completed' | 'failed' | 'cancelled' | 'paused'`
- `StepResult` — status / output? / error? / startedAt? / endedAt?
- `WorkflowRun` — runId / workflowId / workflowVersion / status / startedAt / endedAt? / params / steps / parentTraceId? / errors?
- `WorkflowError` — stepId / message / timestamp
- `WorkflowRunSummary` — runId / workflowId / status / startedAt / endedAt? / stepCount / completedSteps
- `RunFilter` — workflowId? / status? / from? / to? / limit?
- `WorkflowConfirmationRequest` — runId / workflowId / workflowName / step / previousSteps / diffPreview?

**新增 IPC_CHANNELS 常量**（7 个）：`WORKFLOW_LIST` / `WORKFLOW_TRIGGER_MANUAL` / `WORKFLOW_GET_RUN` / `WORKFLOW_CANCEL_RUN` / `WORKFLOW_LIST_RUNS` / `WORKFLOW_CONFIRMATION_REQUIRED` / `WORKFLOW_CONFIRM_STEP`

**新增 IPCChannelMap 映射**（7 个）：对应上述通道的 params + return 类型。

**验证：** TypeScript 编译通过，`IPCChannelMap` 包含 Workflow 通道。

---

### 阶段 B：Workflow 内部类型 + Parser + Registry（Step 2） — 预计 0.8 天

#### B1：创建 workflow 内部类型 + 统一导出

**文件：** `sibylla-desktop/src/main/services/workflow/types.ts`（新建）

定义内部接口：`ParseResult<T>` / `WorkflowRunContext`（含 userConfirmationHandler 回调）/ `WorkflowRunResult` / `TemplateRenderContext`。

**文件：** `sibylla-desktop/src/main/services/workflow/index.ts`（新建）— 统一导出。

#### B2：实现 WorkflowParser

**文件：** `sibylla-desktop/src/main/services/workflow/WorkflowParser.ts`（新建）

**核心方法：**

| 方法 | 签名 | 逻辑 |
|------|------|------|
| `parse` | `(yamlContent, filePath) → ParseResult<WorkflowDefinition>` | yaml.load → 校验必填字段(id/version/name/steps) → 步骤id唯一性 → when表达式可解析 → on_failure合法性(stop/continue) → skill/sub_agent引用检查(warn only) |
| `renderTemplate` | `(input, context) → Record<string, unknown>` | 深度遍历input，`${{ params.xxx }}` → context.params，`${{ steps.xxx.output.yyy }}` → context.steps，前置步骤未执行返回空字符串不崩溃 |
| `evaluateWhen` | `(expression, steps) → boolean` | 替换变量为实际值，支持 > < >= <= == != 和 .length，评估失败返回 false |

#### B3：实现 WorkflowRegistry

**文件：** `sibylla-desktop/src/main/services/workflow/WorkflowRegistry.ts`（新建）

内部数据：`Map<string, WorkflowDefinition>`

| 方法 | 逻辑 |
|------|------|
| `initialize()` | 扫描 resources/workflows/(内置) + .sibylla/workflows/(用户)，Parser.parse()，用户覆盖内置 |
| `get(id)` | 按 id 查找 |
| `getAll()` | 返回全部 |
| `getByTrigger(type, pattern?)` | 过滤含指定触发器类型的 Workflow |

**验证：** 合法 YAML 解析正确；校验失败返回明确错误；用户覆盖内置；模板替换正确。

---

### 阶段 C：WorkflowExecutor（Step 3） — 预计 1 天

#### C1：实现 WorkflowExecutor

**文件：** `sibylla-desktop/src/main/services/workflow/WorkflowExecutor.ts`（新建）

**构造函数：** `(parser, skillExecutor, subAgentExecutor, runStore, tracer?, log?)`

**核心方法 `run(ctx: WorkflowRunContext) → WorkflowRunResult`：**

```
a. 初始化 result { runId, status:'completed', steps:{}, startedAt, errors:[] }
b. AbortController 注册到 activeRuns Map
c. 持久化初始 run 记录（中断恢复用）
d. 设置 30 分钟超时警告定时器
e. 遍历 steps：
   1. 检查 abort 信号 → cancelled
   2. 评估 when 条件 → skipped
   3. requires_user_confirm → await userConfirmationHandler → cancel/skip/continue
   4. renderTemplate(step.input, { params, steps })
   5. executeStep(step, renderedInput, ctx) → 成功/失败
      - skill → SkillExecutor.execute()
      - sub_agent → SubAgentExecutor.run()（timeoutMs = step.timeout * 1000）
      - condition → evaluateWhen()
      - notify → sendNotification()
   6. save_output_to → writeFile（原子替换）
   7. on_failure: stop → finalize(failed) / continue → 继续
   8. 每步后 await runStore.persist()
f. 返回 finalize(result, 'completed')
```

**辅助方法：**
- `cancelRun(runId)` → abortController.abort() + 更新状态
- `sendNotification(input)` → IPC push 或写入通知文件

**验证：** 顺序执行正确；when 跳过；用户确认暂停/继续；on_failure stop/continue；每步持久化；变量传递正确。

---

### 阶段 D：WorkflowScheduler + WorkflowRunStore（Step 4） — 预计 0.8 天

#### D1：实现 WorkflowScheduler

**文件：** `sibylla-desktop/src/main/services/workflow/WorkflowScheduler.ts`（新建）

**常量：** `MAX_CONCURRENT_PER_WORKFLOW=2`, `FILE_DEBOUNCE_MS=1000`

**核心方法：**

| 方法 | 逻辑 |
|------|------|
| `initialize()` | setupFileWatchers() + scheduleCronTriggers() + recoverIncompleteRuns() |
| `setupFileWatchers()` | chokidar.watch 监听 file_created/file_changed 触发器，debounce 1s，并发上限 2，个人空间只监控 personal/{user}/ |
| `scheduleCronTriggers()` | cron-parser 解析 schedule 触发器 |
| `triggerManual(workflowId, params)` | 获取定义 → 生成 runId → 构造 confirmationHandler(IPC push + Promise) → executor.run() → 返回 runId |
| `resolveConfirmation(runId, decision)` | resolve pendingConfirmations Map 中的 Promise |
| `recoverIncompleteRuns()` | runStore.getIncompleteRuns() → 标记 cancelled |
| `destroy()` | 关闭 watchers/cron/timers |

**关键机制：** 用户确认使用 `pendingConfirmations: Map<runId, { resolve, request }>` 实现 IPC 双向通信。

#### D2：实现 WorkflowRunStore

**文件：** `sibylla-desktop/src/main/services/workflow/WorkflowRunStore.ts`（新建）

**构造函数：** `(baseDir: string)` — `.sibylla/memory/workflow-runs/`

| 方法 | 逻辑 |
|------|------|
| `persist(run)` | 原子写入 `YYYY-MM-DD/{runId}.json`（先 .tmp 再 rename） |
| `get(runId)` | 扫描日期目录查找 |
| `listRuns(filter?)` | 扫描 + 过滤(workflowId/status/时间) + 降序排列 → WorkflowRunSummary[] |
| `getIncompleteRuns()` | 返回 status='running'/'paused' 的记录 |
| `updateStatus(runId, status)` | get → 修改 status → persist |

**验证：** persist+get 往返正确；getIncompleteRuns 正确；listRuns 过滤正确。

---

### 阶段 E：内置 Workflow 模板 + 步骤执行器（Step 5） — 预计 0.5 天

#### E1：创建 3 个内置 Workflow 模板

**目录：** `sibylla-desktop/resources/workflows/`（新建）

**模板规格**（完整 YAML 定义见 task spec 步骤 5）：

| 模板文件 | id | 触发器 | 步骤概要 | 说明 |
|---------|-----|--------|---------|------|
| `prd-review-flow.yaml` | prd-review-flow | file_created(`specs/prds/**/*.md`) + manual | spec-lint → spec-reviewer(sub_agent) → doc-summarize(需确认+save_output_to) → notify | 新 PRD 自动审查 |
| `daily-summary-flow.yaml` | daily-summary-flow | schedule(cron `0 9 * * *`) + manual | doc-summarize → doc-summarizer(sub_agent) → notify(需确认) | 每日工作日报 |
| `spec-publish-flow.yaml` | spec-publish-flow | manual | spec-lint → spec-reviewer(sub_agent,strict) → notify(需确认) | 规格文档发布 |

每个模板包含完整 YAML 定义、注释、params 声明、on_workflow_failure 配置。

#### E2：创建步骤执行器

**目录：** `sibylla-desktop/src/main/services/workflow/steps/`

统一接口 `StepExecutor.execute(step, input, context) → Promise<StepResult>`

| 文件 | 职责 | 委托目标 |
|------|------|---------|
| `SkillStep.ts` | 执行 skill 步骤 | `SkillExecutor.execute()` |
| `SubAgentStep.ts` | 执行 sub_agent 步骤 | `SubAgentExecutor.run()` |
| `ConditionStep.ts` | 评估条件表达式 | `WorkflowParser.evaluateWhen()` |
| `NotifyStep.ts` | 发送内部通知 | IPC push / 文件写入 |

**验证：** 3 个 YAML 被 WorkflowParser 正确解析；步骤执行器接口统一。

---

### 阶段 F：管理 UI 组件（Step 6） — 预计 2 天

**新建目录：** `components/skill-library/` / `components/workflow/` / `components/agent/`

#### F2：SkillLibrary.tsx — Skill 库主面板

**文件：** `src/renderer/components/skill-library/SkillLibrary.tsx`
- 数据：IPC `ai:skill:list` / `ai:skill:search`
- 布局：搜索栏 + tag 过滤下拉 + 分类标签页(全部/内置/工作区/个人) + 网格展示 SkillCard
- 搜索 300ms 防抖，右上角"导入"按钮，空状态提示，loading 骨架屏

#### F3：SkillCard.tsx — Skill 卡片

**文件：** `src/renderer/components/skill-library/SkillCard.tsx`
- 显示：category 图标 + 名称 + 描述(≤2行) + 标签 badges + 来源标识(内置蓝/工作区绿/个人紫)
- 操作：查看详情 | 编辑(内置→提示派生 / 自定义→直接编辑) | 删除(二次确认+软删除7天) | 导出
- IPC 调用：`ai:skill:edit` / `ai:skill:delete` / `ai:skill:export`

#### F4：SkillImportDialog.tsx — 导入对话框

**文件：** `src/renderer/components/skill-library/SkillImportDialog.tsx`
- 流程：文件选择器(.sibylla-skill) → 扫描内容(名称/prompt长度/工具列表/风险标记) → 确认导入
- 风险标记：⚠️特殊字符 / ⚠️超长 prompt / ⚠️文件写入操作

#### F5：WorkflowManager.tsx — Workflow 管理主面板（左右布局）

**文件：** `src/renderer/components/workflow/WorkflowManager.tsx`
- 左侧：Workflow 列表（WorkflowCard），含触发器图标、最后运行时间、自动触发 toggle
- 右侧：选中 Workflow 详情 + 手动触发按钮(弹出参数表单) + WorkflowRunHistory
- 数据：workflowStore，实时刷新（IPC push `workflow:run-updated`）

#### F6：WorkflowCard.tsx — Workflow 卡片

**文件：** `src/renderer/components/workflow/WorkflowCard.tsx`
- 显示：名称 + 描述 + 触发器图标(📄file/⏰schedule/🖐️manual) + 步骤数 badge + 最后运行时间
- 操作：自动触发 toggle / 手动触发按钮 → 参数表单

#### F7：WorkflowConfirmPanel.tsx — 核心安全确认面板

**文件：** `src/renderer/components/workflow/WorkflowConfirmPanel.tsx`
- Modal 弹出，不可关闭（必须选择）
- 展示：工作流名称 + 当前步骤 + 即将执行的操作 + 前置步骤产出
- 如有 diffPreview → 复用 `DiffReviewPanel` 组件
- 三按钮：确认(绿) / 跳过(黄) / 取消 Workflow(红)
- 确认后 IPC `workflow:confirm-step` 返回决策

#### F8：WorkflowRunHistory.tsx — 运行历史

**文件：** `src/renderer/components/workflow/WorkflowRunHistory.tsx`
- 表格：runId(前8位) + status 颜色标记(✅绿/❌红/🔄蓝/⏸黄/⏹灰) + 时间 + 步骤进度
- 点击行展开详细步骤结果，运行中状态实时刷新

#### F9：AgentCard.tsx — Sub-agent 卡片

**文件：** `src/renderer/components/agent/AgentCard.tsx`
- 显示：名称 + 描述 + 模型标签 + 工具列表(truncate) + max_turns badge + 来源标识

**验证：** 所有组件渲染正确；IPC 调用正确；loading/error 状态正确。

---

### 阶段 G：workflowStore + IPC Handler + Preload + 集成（Step 7） — 预计 1 天

#### G1：实现 workflowStore

**文件：** `sibylla-desktop/src/renderer/store/workflowStore.ts`（新建）

遵循 `zustand-state-management` skill 规范。

**State：** `workflows[]` / `runs[]` / `selectedWorkflowId` / `loading` / `error` / `confirmationRequest`

**Actions：** `fetchWorkflows()` / `triggerManual()` / `fetchRuns()` / `getRun()` / `cancelRun()` / `confirmStep()` / `selectWorkflow()` / `reset()`

- 所有 IPC 调用封装在 action 内部，使用 `devtools` 中间件
- IPC 事件监听 `workflow:confirmation-required` → 设置 confirmationRequest
- IPC 事件监听 `workflow:run-updated` → 刷新 runs
- `reset()` 清理所有事件监听器

#### G2：实现 Workflow IPC Handler

**文件：** `sibylla-desktop/src/main/ipc/handlers/workflow.ts`（新建）

继承 `IpcHandler` 基类，namespace = `'workflow'`

| Handler 方法 | IPC 通道 | 委托 |
|-------------|---------|------|
| `handleList` | `workflow:list` | `registry.getAll()` |
| `handleTriggerManual` | `workflow:trigger-manual` | `scheduler.triggerManual(id, params)` |
| `handleGetRun` | `workflow:get-run` | `runStore.get(runId)` |
| `handleCancelRun` | `workflow:cancel-run` | `executor.cancelRun()` + `runStore.updateStatus()` |
| `handleListRuns` | `workflow:list-runs` | `runStore.listRuns(filter)` |
| `handleConfirmStep` | `workflow:confirm-step` | `scheduler.resolveConfirmation(runId, decision)` |

#### G3：扩展 Preload API

**文件：** `sibylla-desktop/src/preload/index.ts`

- 新增 `workflow` 命名空间（6 个方法：list/triggerManual/getRun/cancelRun/listRuns/confirmStep）
- 注册 7 个 IPC 通道 + 2 个推送事件到 `ALLOWED_CHANNELS`
- 使用 `safeInvoke` 模式实现

#### G4：扩展 CommandPalette

**文件：** `sibylla-desktop/src/main/services/command/command-registry.ts`

注册 3 个命令：`open-skill-library` / `open-workflow-manager` / `trigger-workflow`

#### G5：主进程初始化装配

**装配顺序：** WorkflowParser → WorkflowRegistry.initialize() → WorkflowRunStore(baseDir) → WorkflowExecutor(parser, skillExecutor, subAgentExecutor, runStore, tracer) → WorkflowScheduler.initialize() → WorkflowHandler.register()

**验证：** IPC 通道注册成功；Workflow 可通过 UI 手动触发；确认面板正确弹出。

---

### 阶段 H：Prompt 版本化数据收集 P2（Step 8） — 预计 0.3 天

#### H1：实现 PromptPerformanceCollector

**文件：** `sibylla-desktop/src/main/services/context-engine/PromptPerformanceCollector.ts`（新建）

**接口：** `PromptPerformanceEntry` — timestamp / traceId / promptParts[] / totalTokens / model / toolCallSuccessRate

**方法：**
- `record(entry)` — 追加一行 JSON 到 `.sibylla/memory/prompt-performance.jsonl`（append-only）
- `query({ promptId, version? })` — 扫描 JSONL 过滤匹配条目（MVP 级别）

**集成点：** ContextEngine/HarnessOrchestrator AI 调用完成后，仅在 feature flag 启用时收集。

---

### 阶段 I：更新 CLAUDE.md（Step 9） — 预计 0.3 天

#### I1：第十章 — 替换为 "Phase 1 — AI 能力线构建（收官中）"

列出已完成 Sprint（3.0~3.4）+ 进行中（3.5）+ 即将进入 Phase 2。

#### I2：第十一章 — 新增 5 条索引链接

Prompt 库设计 / Skill 系统设计 / Sub-agent 系统设计 / Workflow 自动化设计 / Hook 节点与错误恢复设计。

#### I3：第八章 — 新增 5 条决策记录

| 日期 | 决策 | 理由 |
|---|---|---|
| 2026-04-19 | AI 能力扩展采用四层模型 | 保持非技术用户友好；调试复杂度更低 |
| 2026-04-19 | Workflow 声明式 YAML，不提供图形化编辑器 | 避免成为小型编程平台 |
| 2026-04-19 | Sub-agent 默认不继承 MEMORY.md | 避免记忆污染 |
| 2026-04-19 | Prompt 作为 Markdown 文件存储，纳入 Git | 文件即真相原则 |
| 2026-04-19 | 暂不实现 MCP 协议支持 | MCP 涉及外部协议，留到 Phase 2 |

---

### 阶段 J：单元测试（Step 10） — 预计 0.5 天

**测试目录：** `tests/main/services/workflow/` + `tests/renderer/components/`

#### J1：workflow-parser.test.ts

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 合法 YAML 正确解析 | 返回 success=true + WorkflowDefinition |
| 2 | 缺少必填字段 | 返回 errors 包含具体缺失字段 |
| 3 | 步骤 id 重复 | 返回 errors |
| 4 | when 表达式语法错误 | 返回 errors |
| 5 | on_failure 值不合法 | 返回 errors |
| 6 | 模板变量 `${{ params.xxx }}` 替换 | renderTemplate 输出正确 |
| 7 | 前置步骤 skipped 时变量返回 undefined | 不崩溃，返回空字符串 |

#### J2：workflow-registry.test.ts

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | initialize() 加载内置 Workflow | getAll() 包含内置模板 |
| 2 | 用户定义覆盖内置 | 同 id 时用户优先 |
| 3 | getByTrigger() 正确过滤 | file_created 触发器匹配 |

#### J3：workflow-executor.test.ts

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 顺序执行步骤 | steps 按序完成 |
| 2 | when 条件跳过 | 条件 false 的步骤 status='skipped' |
| 3 | requires_user_confirm 暂停 | 调用 userConfirmationHandler |
| 4 | on_failure: stop 终止 | 失败步骤后续不执行 |
| 5 | on_failure: continue 继续 | 失败步骤后续仍执行 |
| 6 | 变量传递 `${{ steps.xxx }}` 正确 | 后续步骤获取前置输出 |
| 7 | 超时警告 | 30 分钟后发出警告 |
| 8 | 每步持久化 | runStore.persist 调用次数 = 步骤数 |

#### J4：workflow-scheduler.test.ts

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 文件触发器 debounce | 1 秒内多次变化仅触发一次 |
| 2 | 并发上限 2 | 第 3 个排队等待 |
| 3 | 手动触发 | triggerManual 返回 runId |

#### J5：workflow-run-store.test.ts

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | persist + get 往返 | 数据一致 |
| 2 | getIncompleteRuns | 返回 running/paused 记录 |
| 3 | listRuns 过滤 | workflowId/status 过滤正确 |

#### J6：workflow-confirm-panel.test.tsx

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 渲染步骤信息 | 显示步骤名和前置产出 |
| 2 | 三个按钮调用正确 IPC | confirmStep 被调用 |

#### J7：skill-card.test.tsx

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 内置 Skill 显示"派生"按钮 | 按钮文案为"派生副本" |
| 2 | 自定义 Skill 显示"编辑"和"删除" | 按钮可见 |
| 3 | 删除时二次确认 | 确认对话框出现 |

#### J8：prompt-performance-collector.test.ts

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | AI 调用后 JSONL 正确追加 | 文件新增一行 JSON |
| 2 | query 过滤正确 | 按 promptId 过滤 |

**覆盖率目标：** 主进程 ≥ 80%；渲染进程组件 ≥ 60%

---

## 五、验收标准追踪

### Workflow YAML 规范

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | YAML 包含 id/version/name/triggers/steps 必填章节 | B3 WorkflowParser.parse() | J1-1, J1-2 |
| 2 | triggers 支持 file_created/file_changed/schedule/manual | A1 WorkflowTriggerType | J1-1 |
| 3 | 步骤有唯一 id，支持 skill/sub_agent/condition/notify | A1 WorkflowStep | J1-3 |
| 4 | 变量传递 `${{ params.xxx }}` 和 `${{ steps.xxx.output }}` | B3 renderTemplate() | J1-6, J3-6 |
| 5 | 步骤支持 when 条件、on_failure 策略 | A1 WorkflowStep | J1-4, J1-5, J3-2, J3-4, J3-5 |
| 6 | 步骤支持 requires_user_confirm | A1 WorkflowStep | J3-3 |
| 7 | Workflow 整体支持 on_workflow_failure | A1 WorkflowFailurePolicy | B3 parse 校验 |

### WorkflowParser

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | YAML 解析成功返回 WorkflowDefinition | B3 parse() | J1-1 |
| 2 | 步骤 id 不唯一时校验失败 | B3 parse() | J1-3 |
| 3 | when 表达式语法错误时校验失败 | B3 parse() | J1-4 |
| 4 | on_failure 值不合法时校验失败 | B3 parse() | J1-5 |
| 5 | skill/sub_agent 引用不存在产生 warning | B3 parse() | J1-1 |

### WorkflowExecutor

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 顺序执行步骤，输出写入 steps 命名空间 | C1 run() | J3-1 |
| 2 | when 条件 false 时跳过 | C1 run() | J3-2 |
| 3 | requires_user_confirm 暂停等待确认 | C1 run() | J3-3 |
| 4 | on_failure: stop 终止 | C1 run() | J3-4 |
| 5 | on_failure: continue 继续 | C1 run() | J3-5 |
| 6 | 每步执行后持久化 | C1 run() | J3-8 |
| 7 | 超过 30 分钟警告 | C1 run() | J3-7 |
| 8 | 前置步骤未执行时变量不崩溃 | B3 renderTemplate() | J1-7 |

### WorkflowScheduler

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 文件触发器 debounce 1 秒 | D1 setupFileWatchers() | J4-1 |
| 2 | 同一 Workflow 并发上限 2 | D1 MAX_CONCURRENT | J4-2 |
| 3 | 手动触发通过 IPC | D1 triggerManual() | J4-3 |
| 4 | 定时触发支持 cron | D1 scheduleCronTriggers() | — |
| 5 | 个人空间只监控该用户目录 | D1 scope 检查 | — |

### Workflow 运行记录

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 存储在 workflow-runs/YYYY-MM-DD/{run-id}.json | D2 persist() | J5-1 |
| 2 | 记录包含 runId/workflowId/status/steps/errors | D2 persist() | J5-1 |
| 3 | 应用重启后可恢复未完成 | D1 recoverIncompleteRuns() | J5-2 |
| 4 | 所有记录纳入 Git | .sibylla/memory/ 已在 .gitignore 白名单 | — |

### 内置模板

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 3 个内置 Workflow 模板 | E2-E4 | — |
| 2 | 每个模板含完整 YAML + 注释 | E2-E4 | — |

### 管理 UI — Skill 库

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 分类展示所有 Skill（内置/工作区/个人） | F2 SkillLibrary | J7-1, J7-2 |
| 2 | 支持搜索和按 tag 过滤 | F2 SkillLibrary | — |
| 3 | 内置 Skill 编辑提示派生 | F3 SkillCard | J7-1 |
| 4 | 自定义 Skill 支持编辑/删除 | F3 SkillCard | J7-2, J7-3 |
| 5 | 支持导出为 .sibylla-skill | F3 SkillCard | — |
| 6 | 支持导入并扫描风险 | F4 SkillImportDialog | — |
| 7 | 所有操作有 loading 指示 | F2-F4 所有组件 | — |

### 管理 UI — Workflow

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 展示所有 Workflow 及运行状态 | F5 WorkflowManager | — |
| 2 | 支持"手动触发"按钮 | F6 WorkflowCard | — |
| 3 | 支持启用/禁用自动触发 | F6 WorkflowCard | — |
| 4 | 显示运行历史 | F8 WorkflowRunHistory | — |
| 5 | 确认面板展示 diff 预览 | F7 WorkflowConfirmPanel | J6-1 |
| 6 | 确认面板三个选项 | F7 WorkflowConfirmPanel | J6-2 |

### IPC 集成

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 7 个 IPC 通道注册 | G2 WorkflowHandler | — |
| 2 | Preload 暴露 workflow 命名空间 | G3 preload | — |

### 向后兼容

| # | 验收标准 | 实现位置 |
|---|---------|---------|
| 1 | 所有新能力默认关闭（feature flag） | G5 初始化时 flag 检查 |
| 2 | 现有 CommandPalette 不受影响 | G4 仅追加命令 |
| 3 | 现有组件接口无修改 | 全增量开发 |

---

## 六、风险与缓解

| 风险 | 概率 | 影响 | 缓解策略 |
|------|------|------|---------|
| YAML 解析复杂度超预期 | 中 | 中 | 使用成熟的 js-yaml 库；schema 校验分层（先结构后语义） |
| 文件触发器频繁触发导致资源耗尽 | 中 | 高 | debounce 1 秒 + 并发上限 2 + 个人空间隔离 |
| 用户确认面板阻塞 UI 线程 | 低 | 高 | 使用 Promise 机制异步等待；IPC 推送不阻塞主进程 |
| Workflow 运行中断恢复状态不一致 | 中 | 中 | 仅恢复 running/paused 状态；不自动重试，提示用户手动处理 |
| IPC 通道类型不匹配 | 低 | 高 | 严格对照 IPCChannelMap；TypeScript 编译检查 |
| Store 事件监听内存泄漏 | 低 | 中 | reset() 中清理所有监听器；组件卸载时调用 reset |
| UI 组件复杂度导致非技术用户困惑 | 中 | 中 | 默认隐藏高级选项；引导提示；自然语言文案 |
| SkillExecutor/SubAgentExecutor 接口变更 | 低 | 高 | 仅依赖公共接口，不访问内部实现 |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 |
|----|------|--------|
| Day 1 上午 | A1 | shared/types.ts Workflow 类型 + IPC 通道 |
| Day 1 下午 | B1-B4 | WorkflowParser + WorkflowRegistry 完整实现 |
| Day 2 | C1 + D1 | WorkflowExecutor + WorkflowScheduler 核心 |
| Day 3 上午 | D2 + E1-E5 | WorkflowRunStore + 内置模板 + 步骤执行器 |
| Day 3 下午 | G1-G3 | workflowStore + IPC Handler + Preload |
| Day 4 上午 | G4-G5 | CommandPalette 扩展 + 主进程装配 |
| Day 4 下午 | F2-F4 | SkillLibrary + SkillCard + SkillImportDialog |
| Day 5 上午 | F5-F8 | WorkflowManager + WorkflowCard + ConfirmPanel + RunHistory |
| Day 5 下午 | F9 + H1 + I1-I3 | AgentCard + PromptPerformanceCollector + CLAUDE.md 更新 |
| Day 6 | J1-J8 | 全部单元测试通过 |

---

**文档版本**: v1.0
**最后更新**: 2026-04-23
**维护者**: Sibylla 架构团队
