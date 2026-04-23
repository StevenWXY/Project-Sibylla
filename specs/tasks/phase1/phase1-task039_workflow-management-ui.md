# Workflow 自动化与管理 UI 收官

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK039 |
| **任务标题** | Workflow 自动化与管理 UI 收官 |
| **所属阶段** | Phase 1 - AI 能力扩展体系 (Sprint 3.5) |
| **优先级** | P1 |
| **复杂度** | 非常复杂 |
| **预估工时** | 5-6 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

构建 Sprint 3.5 的三个收尾能力：（1）Workflow 自动化系统——声明式 YAML 定义多步编排流程，串联 Skill 与 Sub-agent，响应文件变化/定时/手动触发；（2）扩展能力管理 UI——Skill 库、Sub-agent 管理、Workflow 管理的渲染进程面板；（3）Sprint 3.5 文档收官——CLAUDE.md 更新到 Phase 1、Prompt 版本化数据收集。

### 背景

TASK035-038 建立了 Prompt 库、Hook、Skill、Slash Command、Sub-agent 五大扩展能力。本任务完成最后的整合层和用户触点：

**Workflow 自动化**：当前各扩展能力（Skill、Sub-agent）只能由用户手动触发或 Slash Command 触发。缺少"当 PRD 被创建时自动审查→摘要→通知"这类自动化流程。Workflow 是四层扩展模型的第 4 层（最重量级），使用声明式 YAML 编排多步骤。

**管理 UI**：当前扩展能力（Skill、Sub-agent、Workflow）缺少浏览和管理界面。非技术用户无法通过 UI 查看、启用/禁用、导入/导出这些资产。

**文档收官**：CLAUDE.md 第十章仍标记 "Phase 0"，严重滞后。Sprint 3.5 完成后需更新到 Phase 1。

**核心设计约束**：

- Workflow 使用声明式 YAML，**刻意不支持 for/while 循环**（避免成为小型编程语言）
- Workflow 不做自动回滚，只做"暂停-确认-继续"模式（CLAUDE.md "AI 建议，人类决策"）
- 所有管理 UI 对非技术用户隐藏在命令面板与技能库之后，不冲击主界面
- Prompt 版本化优先级 P2，MVP 仅实现数据收集与最基础查询

### 范围

**包含：**

- Workflow YAML 规范定义（步骤、触发器、变量、失败策略）
- WorkflowParser — YAML 解析与 schema 校验
- WorkflowRegistry — Workflow 注册与查询
- WorkflowExecutor — 步骤执行引擎（顺序执行、条件分支、变量传递）
- WorkflowScheduler — 触发器管理（文件变化、定时、手动）
- 3 个内置 Workflow 模板
- 扩展能力管理 UI — SkillCard、AgentCard、WorkflowCard 组件
- SkillLibrary 面板 — 浏览/搜索/启用 Skill
- WorkflowManager 面板 — 管理/触发 Workflow
- Workflow 确认面板 — requires_user_confirm 步骤的用户确认
- Workflow 运行记录持久化
- Zustand store（workflowStore）
- CLAUDE.md 更新到 Phase 1
- Prompt 性能数据收集（JSONL append-only）
- 单元测试

**不包含：**

- 图形化 Workflow 编辑器（明确不做）
- Skill 市场/社区上传
- Prompt 版本化 A/B test 分流
- MCP Server 集成

## 依赖关系

### 前置依赖

- [x] TASK035 — Prompt 库基础设施（PromptComposer 已可用）
- [x] TASK037 — Skill 系统 v2（SkillExecutor 可被 Workflow 调用）
- [x] TASK038 — Sub-agent 系统（SubAgentExecutor 可被 Workflow 调用）
- [x] TASK027 — Tracer SDK（Workflow 运行产生 Trace）
- [x] TASK017 — Harness（用户审批 UI 已可用）
- [x] TASK032 — 命令面板（CommandPalette 组件已可用）

### 被依赖任务

- 无（本任务是 Sprint 3.5 的收官任务）

## 参考文档

- [`specs/requirements/phase1/sprint3.5-ai_ablities.md`](../../requirements/phase1/sprint3.5-ai_ablities.md) — 需求 3.5.5（§5.5）、需求 3.5.8（§5.8）、需求 3.5.9（§5.9）、需求 3.5.10（§5.10）、§4.5
- [`specs/design/ui-ux-design.md`](../../design/ui-ux-design.md) — UI/UX 设计规范
- [`CLAUDE.md`](../../../CLAUDE.md) — 设计哲学、AI 建议/人类决策
- `.kilocode/skills/phase1/zustand-state-management/SKILL.md` — Zustand store 设计
- `.kilocode/skills/common/frontend-design/SKILL.md` — 前端设计规范

## 验收标准

### Workflow YAML 规范

- [ ] Workflow YAML 包含 id、version、name、description、triggers、steps 必填章节
- [ ] triggers 支持 3 种类型：file_created / file_changed / schedule / manual
- [ ] steps 中每个步骤有唯一 id，支持 skill / sub_agent / condition / notify 4 种类型
- [ ] 变量传递使用 `${{ params.xxx }}` 和 `${{ steps.xxx.output }}` 语法
- [ ] 步骤支持 when 条件表达式、on_failure 策略（stop / continue）
- [ ] 步骤支持 requires_user_confirm 布尔字段
- [ ] Workflow 整体支持 on_workflow_failure 策略

### WorkflowParser

- [ ] YAML 解析成功时返回 WorkflowDefinition 类型
- [ ] 步骤 id 不唯一时校验失败
- [ ] when 表达式语法错误时校验失败
- [ ] on_failure 值不合法时校验失败
- [ ] skill / sub_agent 引用不存在时产生 warning（不阻止注册）

### WorkflowExecutor

- [ ] 顺序执行步骤，每个步骤的输出写入 `${{ steps.xxx }}` 命名空间
- [ ] when 条件评估为 false 时跳过步骤（status: 'skipped'）
- [ ] requires_user_confirm 为 true 时暂停等待用户确认
- [ ] on_failure: stop 的步骤失败时 Workflow 终止
- [ ] on_failure: continue 的步骤失败时继续下一步
- [ ] 每步执行后持久化运行记录（用于中断恢复）
- [ ] Workflow 单次运行超过 30 分钟时发出警告并允许用户中止
- [ ] 前置步骤未执行时 `${{ steps.xxx.yyy }}` 返回 undefined（不崩溃）
- [ ] 变量渲染支持模板字符串替换

### WorkflowScheduler

- [ ] 文件触发器在文件写入完成后延迟 1 秒触发（debounce）
- [ ] 同一 Workflow 同时最多 2 个运行实例（并发上限）
- [ ] 手动触发通过 IPC 调用
- [ ] 定时触发支持 cron 表达式
- [ ] 个人空间 Workflow 的文件触发器只监控该用户目录

### Workflow 运行记录

- [ ] 运行记录存储在 `.sibylla/memory/workflow-runs/YYYY-MM-DD/{run-id}.json`
- [ ] 记录包含 runId、workflowId、status、startedAt、endedAt、steps、errors
- [ ] 应用重启后可从持久化记录恢复未完成的 Workflow
- [ ] 所有运行记录纳入 Git 版本化

### 内置 Workflow 模板

- [ ] 3 个内置 Workflow 创建：prd-review-flow、daily-summary-flow、spec-publish-flow
- [ ] 每个模板包含完整的 YAML 定义和注释

### 管理 UI — Skill 库

- [ ] SkillLibrary 面板分类展示所有 Skill（内置/工作区/个人）
- [ ] 支持搜索和按 tag 过滤
- [ ] 内置 Skill 点击"编辑"时提示"是否派生副本到工作区？"
- [ ] 自定义 Skill 支持编辑、删除（二次确认 + 软删除 7 天）
- [ ] 支持导出为 `.sibylla-skill` 格式
- [ ] 支持导入 `.sibylla-skill` 并扫描潜在风险
- [ ] 所有操作有 loading 指示

### 管理 UI — Workflow

- [ ] WorkflowManager 面板展示所有 Workflow 及运行状态
- [ ] 支持"手动触发"按钮
- [ ] 支持启用/禁用自动触发（禁用后仍可手动触发）
- [ ] 显示运行历史（runId、status、time）
- [ ] requires_user_confirm 步骤弹出确认面板（步骤信息 + diff 预览 + 前置产出）
- [ ] 确认面板提供"确认 / 跳过 / 取消 Workflow"三个选项

### Workflow 确认面板

- [ ] 展示当前步骤信息（步骤名、即将执行的操作）
- [ ] 如有 diff 预览，展示 diff（CLAUDE.md 对齐）
- [ ] 展示前置步骤的产出（供用户判断）
- [ ] 未确认前 Workflow 暂停

### IPC 集成

- [ ] `workflow:list`、`workflow:trigger-manual`、`workflow:get-run`、`workflow:cancel-run`、`workflow:list-runs` 通道注册

### CLAUDE.md 更新

- [ ] 第十章更新为 "Phase 1 — AI 能力线构建（收官中）"
- [ ] 第十一章新增 5 条索引链接
- [ ] 第八章新增 5 条决策记录

### Prompt 版本化（P2）

- [ ] 每次 AI 调用完成时，记录涉及的所有 prompt 片段 id+version 到 Trace
- [ ] 按 prompt version 聚合基础指标（token 消耗、工具调用成功率）写入 `.sibylla/memory/prompt-performance.jsonl`
- [ ] MVP 不实现 A/B test 分流和 UI 对比视图

### 向后兼容

- [ ] 所有新能力默认关闭（feature flag），用户主动启用
- [ ] 现有 CommandPalette 不受影响
- [ ] 现有组件接口无修改

## 技术执行路径

### 架构设计

```
Workflow 系统 + 管理 UI 整体架构

sibylla-desktop/resources/workflows/           ← 内置 Workflow 模板
├── prd-review-flow.yaml
├── daily-summary-flow.yaml
└── spec-publish-flow.yaml

{workspace}/.sibylla/workflows/                 ← 用户自建 Workflow
└── {workflow-name}.yaml

{workspace}/.sibylla/memory/workflow-runs/      ← 运行记录（持久化）
└── YYYY-MM-DD/
    └── {run-id}.json

sibylla-desktop/src/main/services/workflow/     ← 新增目录
├── WorkflowRegistry.ts                         ← Workflow 注册与查询
├── WorkflowParser.ts                           ← YAML 解析与 schema 校验
├── WorkflowExecutor.ts                         ← 步骤执行引擎
├── WorkflowScheduler.ts                        ← 触发器管理
├── types.ts                                    ← WorkflowDefinition / WorkflowRun 等
├── steps/
│   ├── SkillStep.ts                            ← 调用 SkillExecutor
│   ├── SubAgentStep.ts                         ← 调用 SubAgentExecutor
│   ├── ConditionStep.ts                        ← 条件评估
│   └── NotifyStep.ts                           ← 内部通知
└── index.ts

sibylla-desktop/src/renderer/components/
├── skill-library/                              ← 新增
│   ├── SkillLibrary.tsx                        ← Skill 库面板
│   ├── SkillCard.tsx                           ← Skill 卡片
│   └── SkillImportDialog.tsx                   ← 导入对话框
├── workflow/                                   ← 新增
│   ├── WorkflowManager.tsx                     ← Workflow 管理面板
│   ├── WorkflowCard.tsx                        ← Workflow 卡片
│   ├── WorkflowConfirmPanel.tsx                ← 用户确认面板
│   └── WorkflowRunHistory.tsx                  ← 运行历史
└── agent/                                      ← 新增
    └── AgentCard.tsx                           ← Sub-agent 卡片

sibylla-desktop/src/renderer/store/
└── workflowStore.ts                            ← 新增：Zustand Workflow 状态

Workflow 执行流：

WorkflowScheduler 检测触发条件
│
├─ file_created / file_changed / schedule / manual
│
├─ WorkflowParser.parse(yaml) → WorkflowDefinition
│
├─ WorkflowExecutor.run(ctx)
│   │
│   ├─ 持久化 run 记录
│   │
│   ├─ for step in workflow.steps:
│   │   ├─ 评估 when 条件 → skipped?
│   │   ├─ requires_user_confirm? → 暂停，IPC push 确认请求
│   │   ├─ executeStep(step):
│   │   │   ├─ skill → SkillExecutor
│   │   │   ├─ sub_agent → SubAgentExecutor
│   │   │   ├─ condition → evaluate expression
│   │   │   └─ notify → internal notification
│   │   ├─ 持久化 run 记录（每步后）
│   │   └─ on_failure check
│   │
│   └─ 返回 WorkflowRunResult
│
└─ Trace 记录整个 Workflow 运行
```

### 步骤 1：定义 Workflow 共享类型

**文件：** `src/shared/types.ts`（扩展）

1. 新增 Workflow 核心类型（WorkflowDefinition、WorkflowTrigger、WorkflowParam、WorkflowStep、WorkflowFailurePolicy、WorkflowRun、StepResult、WorkflowRunSummary）——接口定义见验收标准对应章节。

2. 新增 IPC 通道常量：
   ```typescript
   'workflow:list': 'workflow:list',
   'workflow:trigger-manual': 'workflow:trigger-manual',
   'workflow:get-run': 'workflow:get-run',
   'workflow:cancel-run': 'workflow:cancel-run',
   'workflow:list-runs': 'workflow:list-runs',
   'workflow:confirmation-required': 'workflow:confirmation-required',
   'workflow:confirm-step': 'workflow:confirm-step',
   ```

**验证：** TypeScript 编译通过。

### 步骤 2：实现 WorkflowParser + WorkflowRegistry

**文件：** `src/main/services/workflow/WorkflowParser.ts`（新建）

1. 实现 `parse(yamlContent: string, filePath: string): ParseResult<WorkflowDefinition>`：
   - 使用 YAML 解析器解析内容
   - 校验必填字段：id、version、name、steps
   - 校验步骤 id 唯一性
   - 校验 when 表达式可解析（简单变量引用和比较运算符）
   - 校验 on_failure 值合法性（stop / continue）
   - 检查 skill / sub_agent 引用是否存在（warning，不阻止注册）
   - 返回 `{ success, data?, errors, warnings }`

2. 实现 `renderTemplate(input, context): Record<string, unknown>`：
   - 递归遍历 input，对所有 string 值执行 `${{ ... }}` 模板替换
   - `${{ params.xxx }}` → context.params 取值
   - `${{ steps.xxx.output.yyy }}` → context.steps 取值
   - 前置步骤未执行时返回 undefined（不崩溃）

**文件：** `src/main/services/workflow/WorkflowRegistry.ts`（新建）

3. 内部数据：`private workflows = new Map<string, WorkflowDefinition>()`

4. 实现 `async initialize(): Promise<void>`：
   - 扫描 `resources/workflows/`（内置）和 `.sibylla/workflows/`（工作区）
   - WorkflowParser 解析每个 `.yaml`
   - 用户定义覆盖内置

5. 实现 `get(id)` / `getAll()` / `getByTrigger(triggerType, pattern?)`

**验证：** YAML 解析正确、校验失败返回明确错误、模板替换正确

### 步骤 3：实现 WorkflowExecutor

**文件：** `src/main/services/workflow/WorkflowExecutor.ts`（新建）

WorkflowExecutor 是 Workflow 系统的核心，负责按步骤执行并管理状态。

1. 定义执行上下文：
   ```typescript
   export interface WorkflowRunContext {
     workflow: WorkflowDefinition
     params: Record<string, unknown>
     runId: string
     parentTraceId: string
     userConfirmationHandler: (step: WorkflowStep, previousSteps: Record<string, StepResult>) => Promise<'confirm' | 'skip' | 'cancel'>
   }
   ```

2. WorkflowExecutor 类：
   ```typescript
   export class WorkflowExecutor {
     constructor(
       private readonly parser: WorkflowParser,
       private readonly skillExecutor: SkillExecutor,
       private readonly subAgentExecutor: SubAgentExecutor,
       private readonly runStore: WorkflowRunStore,
       private readonly tracer?: Tracer,
     ) {}
   ```

3. 实现 `async run(ctx: WorkflowRunContext): Promise<WorkflowRunResult>`：
   ```
   a. 初始化 result：
      result = { runId, workflowId, status: 'running', startedAt: Date.now(), steps: {}, params: ctx.params }

   b. 持久化 run 记录（用于中断恢复）

   c. 遍历 steps：
      for step of ctx.workflow.steps:
        // 1. 评估 when 条件
        if step.when && !evaluate(step.when, result.steps):
          result.steps[step.id] = { status: 'skipped' }
          continue

        // 2. 用户确认
        if step.requiresUserConfirm:
          decision = await ctx.userConfirmationHandler(step, result.steps)
          if decision === 'cancel':
            return finalize(result, 'cancelled')
          if decision === 'skip':
            result.steps[step.id] = { status: 'skipped' }
            continue

        // 3. 渲染模板变量
        input = parser.renderTemplate(step.input, { params: ctx.params, steps: result.steps })

        // 4. 执行步骤
        try:
          stepResult = await executeStep(step, input, ctx)
          result.steps[step.id] = stepResult
          // 5. 如果有 saveOutputTo → 写入文件（需用户确认已处理）
          if step.saveOutputTo:
            await writeFile(step.saveOutputTo, stepResult.output)
        catch err:
          result.steps[step.id] = { status: 'failed', error: err.message }
          if step.onFailure === 'stop':
            return finalize(result, 'failed')
          // onFailure === 'continue' → 继续下一步

        // 6. 每步后持久化
        await runStore.persist(result)

   d. 超时检查：运行超过 30 分钟时发出警告

   e. 返回 finalize(result, 'completed')
   ```

4. 实现 `private async executeStep(step, input, ctx): Promise<StepResult>`：
   ```typescript
   switch (step.type):
     case 'skill':
       // 委托到 SkillExecutor
       return await this.skillExecutor.execute({ skillId: step.skill, input })
     case 'sub_agent':
       // 委托到 SubAgentExecutor
       return await this.subAgentExecutor.run({ agentId: step.sub_agent, task: input })
     case 'condition':
       // 评估表达式
       return { status: 'completed', output: evaluate(step.expression, previousSteps) }
     case 'notify':
       // 内部通知（写入 .sibylla 通知或 IPC push）
       return await this.sendNotification(input)
   ```

5. 实现 `async cancelRun(runId: string): Promise<void>`：
   - 标记运行状态为 cancelled
   - 持久化

**验证：**
- 顺序执行步骤正确
- when 条件跳过正确
- requires_user_confirm 暂停/继续正确
- on_failure: stop 终止 / continue 继续
- 每步后持久化
- 变量传递 `${{ steps.xxx }}` 正确

### 步骤 4：实现 WorkflowScheduler + WorkflowRunStore

**文件：** `src/main/services/workflow/WorkflowScheduler.ts`（新建）

1. 实现 `async initialize(registry: WorkflowRegistry, executor: WorkflowExecutor): Promise<void>`：
   - 对每个 Workflow 的触发器注册监听

2. 实现 `watchFileTriggers(): void`：
   - 对 file_created / file_changed 触发器设置 fs.watch
   - 文件写入完成后延迟 1 秒触发（debounce）
   - 同一 Workflow 同时最多 2 个运行实例
   - 个人空间 Workflow 只监控该用户目录

3. 实现 `scheduleCronTriggers(): void`：
   - 对 schedule 触发器使用定时器
   - cron 表达式解析（简化版，支持基础 cron）

4. 实现 `async triggerManual(workflowId: string, params: Record<string, unknown>): Promise<string>`：
   - 查找 Workflow 定义
   - 生成 runId
   - 调用 WorkflowExecutor.run()
   - 返回 runId

**文件：** `src/main/services/workflow/WorkflowRunStore.ts`（新建）

5. 实现 WorkflowRunStore — 运行记录持久化：
   ```typescript
   export class WorkflowRunStore {
     constructor(private readonly baseDir: string) {}  // .sibylla/memory/workflow-runs/
   ```

6. 实现 `async persist(run: WorkflowRun): Promise<void>`：
   - 写入 `YYYY-MM-DD/{runId}.json`
   - 使用原子写入（先临时文件再替换）

7. 实现 `async get(runId: string): Promise<WorkflowRun | null>`：
   - 按日期目录搜索

8. 实现 `async listRuns(filter?: RunFilter): Promise<WorkflowRunSummary[]>`：
   - 扫描所有日期目录

9. 实现 `async getIncompleteRuns(): Promise<WorkflowRun[]>`：
   - 返回 status === 'running' || 'paused' 的记录（用于恢复）

**验证：**
- 文件触发器 debounce 正确
- 并发上限 2 生效
- 运行记录正确持久化和恢复

### 步骤 5：创建内置 Workflow 模板 + 步骤执行器

**目录：** `sibylla-desktop/resources/workflows/`

1. 创建 `prd-review-flow.yaml`：
   ```yaml
   id: prd-review-flow
   version: 1.0.0
   name: PRD 审查流程
   description: 新 PRD 文档的自动审查与摘要
   scope: public

   triggers:
     - type: file_created
       pattern: "specs/prds/**/*.md"
     - type: manual
       name: 手动审查

   params:
     - name: file_path
       type: string
       required: true
     - name: strictness
       type: string
       enum: [loose, medium, strict]
       default: medium

   steps:
     - id: format_check
       name: 检查文档格式
       skill: spec-lint
       input:
         target: ${{ params.file_path }}
       on_failure: stop

     - id: content_review
       name: 内容审查
       sub_agent: spec-reviewer
       input:
         file: ${{ params.file_path }}
         strictness: ${{ params.strictness }}
       on_failure: continue
       timeout: 300

     - id: generate_summary
       name: 生成摘要
       skill: doc-summarize
       input:
         target: ${{ params.file_path }}
       save_output_to: ${{ params.file_path }}.summary.md
       requires_user_confirm: true

     - id: notify_team
       name: 通知团队
       when: ${{ steps.content_review.output.findings.length > 0 }}
       action: internal_notification
       input:
         title: "PRD 需要审查：${{ params.file_path }}"
         body: ${{ steps.content_review.output.summary }}
         channel: workspace

   on_workflow_failure:
     notify_user: true
     rollback: false
   ```

2. 创建 `daily-summary-flow.yaml`：
   - triggers: [{ type: schedule, cron: "0 9 * * *" }]
   - steps: 收集 daily 目录 → 生成日报摘要

3. 创建 `spec-publish-flow.yaml`：
   - triggers: [{ type: manual }]
   - steps: spec-lint → spec-reviewer → 确认发布

**文件：** `src/main/services/workflow/steps/`（4 个步骤执行器）

4. SkillStep.ts — 委托 SkillExecutor
5. SubAgentStep.ts — 委托 SubAgentExecutor
6. ConditionStep.ts — 表达式评估
7. NotifyStep.ts — 内部通知（IPC push 或写入通知文件）

**验证：** 3 个内置模板 YAML 格式正确、可被 WorkflowParser 解析

### 步骤 6：实现管理 UI 组件

**文件：** `src/renderer/components/skill-library/SkillLibrary.tsx`（新建）

1. SkillLibrary 面板组件：
   - 顶部搜索栏 + tag 过滤下拉
   - 分类标签页：全部 / 内置 / 工作区 / 个人
   - 网格布局展示 SkillCard
   - 右上角"导入 Skill"按钮
   - 空状态提示

2. 数据获取：
   - 通过 IPC `ai:skill:list` 获取 Skill 列表
   - 搜索通过 `ai:skill:search` IPC

**文件：** `src/renderer/components/skill-library/SkillCard.tsx`

3. SkillCard 组件：
   - 显示：图标（category 映射）、名称、描述、标签、来源标识（builtin/workspace/personal）
   - 操作按钮：查看详情、编辑（内置→提示派生、自定义→直接编辑）、删除（二次确认）、导出
   - 点击卡片展开详情面板（prompt 预览、工具列表、示例）
   - 编辑操作调用 `ai:skill:edit` IPC
   - 删除操作调用 `ai:skill:delete` IPC + 二次确认对话框
   - 导出操作调用 `ai:skill:export` IPC

**文件：** `src/renderer/components/skill-library/SkillImportDialog.tsx`

4. SkillImportDialog 组件：
   - 文件选择器（接受 `.sibylla-skill` 格式）
   - 扫描结果显示（prompt 长度、工具列表、潜在风险标记）
   - 确认导入 / 取消

**文件：** `src/renderer/components/workflow/WorkflowManager.tsx`

5. WorkflowManager 面板组件：
   - 左侧：Workflow 列表（名称、触发器类型、自动触发开关）
   - 右侧：选中 Workflow 详情 + 运行历史
   - 操作：手动触发、启用/禁用自动触发
   - 运行历史列表（runId、status、时间、步骤进度）

**文件：** `src/renderer/components/workflow/WorkflowCard.tsx`

6. WorkflowCard 组件：
   - 显示：名称、描述、触发器图标、步骤数、最后运行时间
   - 自动触发 toggle 开关
   - "手动触发"按钮 → 弹出参数表单

**文件：** `src/renderer/components/workflow/WorkflowConfirmPanel.tsx`

7. WorkflowConfirmPanel 组件（核心安全 UI）：
   - 显示当前步骤名称和描述
   - 展示即将执行的操作
   - 如有 diff 预览，展示 diff（复用现有 DiffReviewPanel 组件）
   - 展示前置步骤的产出（JSON 展示或摘要）
   - 三个操作按钮：确认（绿色） / 跳过（黄色） / 取消 Workflow（红色）
   - 确认后通过 IPC `workflow:confirm-step` 返回决策

**文件：** `src/renderer/components/workflow/WorkflowRunHistory.tsx`

8. WorkflowRunHistory 组件：
   - 表格展示：runId、status（颜色标记）、startedAt、endedAt、步骤进度条
   - 点击行展开详细步骤结果
   - 运行中状态实时刷新（通过 IPC push 事件）

**文件：** `src/renderer/components/agent/AgentCard.tsx`

9. AgentCard 组件（复用于 Sub-agent 列表）：
   - 显示：名称、描述、模型、工具列表、max_turns
   - 来源标识（builtin/workspace）

**验证：** 所有组件渲染正确，IPC 调用正确，loading 状态正确

### 步骤 7：实现 WorkflowStore + IPC + 集成

**文件：** `src/renderer/store/workflowStore.ts`（新建）

1. Zustand store：
   ```typescript
   interface WorkflowState {
     workflows: WorkflowDefinition[]
     runs: WorkflowRunSummary[]
     selectedWorkflowId: string | null
     loading: boolean
     error: string | null
     confirmationRequest: WorkflowConfirmationRequest | null

     fetchWorkflows: () => Promise<void>
     triggerManual: (workflowId: string, params: Record<string, unknown>) => Promise<string>
     fetchRuns: (workflowId?: string) => Promise<void>
     getRun: (runId: string) => Promise<WorkflowRun | null>
     cancelRun: (runId: string) => Promise<void>
     confirmStep: (runId: string, decision: 'confirm' | 'skip' | 'cancel') => Promise<void>
   }
   ```

2. 使用 Zustand persist 中间件缓存 workflow 列表（减少 IPC 调用）

**文件：** `src/main/ipc/handlers/workflow.ts`（新建）

3. 注册 Workflow IPC handler：
   - `workflow:list` → WorkflowRegistry.getAll()
   - `workflow:trigger-manual` → WorkflowScheduler.triggerManual()
   - `workflow:get-run` → WorkflowRunStore.get()
   - `workflow:cancel-run` → WorkflowExecutor.cancelRun()
   - `workflow:list-runs` → WorkflowRunStore.listRuns()
   - `workflow:confirmation-required` → Main → Renderer push event
   - `workflow:confirm-step` → Renderer → Main（用户确认决策）

4. 用户确认集成：
   - WorkflowExecutor 在 requires_user_confirm 步骤暂停
   - 通过 IPC push `workflow:confirmation-required` 到渲染进程
   - 渲染进程显示 WorkflowConfirmPanel
   - 用户选择后通过 IPC `workflow:confirm-step` 返回决策
   - 使用 Promise 机制：Executor await 一个 Promise，IPC handler resolve 该 Promise

**文件：** CommandPalette 扩展

5. 在 CommandPalette 中注册 Workflow 管理命令：
   - "打开技能库" → 打开 SkillLibrary 面板
   - "打开 Workflow 管理" → 打开 WorkflowManager 面板
   - "手动触发 Workflow: xxx" → triggerManual

**文件：** `src/preload/index.ts`（扩展）

6. 新增 workflow 命名空间：
   ```typescript
   workflow: {
     list: () => Promise<WorkflowDefinition[]>
     triggerManual: (id: string, params: Record<string, unknown>) => Promise<{ runId: string }>
     getRun: (runId: string) => Promise<WorkflowRun | null>
     cancelRun: (runId: string) => Promise<void>
     listRuns: (filter?: RunFilter) => Promise<WorkflowRunSummary[]>
     confirmStep: (runId: string, decision: 'confirm' | 'skip' | 'cancel') => Promise<void>
   }
   ```

**文件：** 主进程初始化入口

7. 装配顺序：
   ```
   a. WorkflowParser
   b. WorkflowRegistry → await initialize()
   c. WorkflowRunStore(baseDir)
   d. WorkflowExecutor(parser, skillExecutor, subAgentExecutor, runStore, tracer)
   e. WorkflowScheduler → initialize(registry, executor)
   f. 注册 workflow IPC handler
   g. 恢复未完成的 Workflow（如有）
   ```

**验证：** IPC 通道注册，Workflow 可通过 UI 手动触发

### 步骤 8：实现 Prompt 版本化数据收集（P2）

**文件：** `src/main/services/context-engine/PromptPerformanceCollector.ts`（新建）

MVP 实现：每次 AI 调用完成后，收集 prompt 片段数据并追加到 JSONL 文件。

1. 定义 PromptPerformanceEntry：
   ```typescript
   interface PromptPerformanceEntry {
     timestamp: number
     traceId: string
     promptParts: Array<{ id: string; version: string; source: string }>
     totalTokens: number
     model: string
     toolCallSuccessRate: number
     mode?: string
   }
   ```

2. 实现 `async record(entry: PromptPerformanceEntry): Promise<void>`：
   - 追加到 `.sibylla/memory/prompt-performance.jsonl`（append-only）
   - 每行一个 JSON 对象
   - 文件不存在时创建

3. 集成到 ContextEngine / HarnessOrchestrator：
   - AI 调用完成后，如果 AssembledContext 包含 promptParts，调用 `record()`
   - 仅在 feature flag 启用时收集

4. 实现 `async query(filter: { promptId: string; version?: string }): Promise<PromptPerformanceEntry[]>`：
   - 扫描 JSONL 文件，过滤匹配条目
   - MVP 级别，不做复杂索引

**验证：** AI 调用后 JSONL 文件正确追加、查询返回正确结果

### 步骤 9：更新 CLAUDE.md

**文件：** `CLAUDE.md`

1. 更新第十章（替换全文）：
   ```markdown
   ## 十、当前阶段

   Phase 1 — AI 能力线构建（收官中）。

   已完成：
   - Sprint 3.0 - AI 对话基线
   - Sprint 3.1 - Harness（Guardrail + Evaluator）
   - Sprint 3.2 - 三层记忆系统
   - Sprint 3.3 - Trace 可观测性
   - Sprint 3.4 - 模式与 Plan 产物

   进行中：
   - Sprint 3.5 - AI 能力扩展体系（Prompt 库、Skill、Sub-agent、Workflow）

   即将进入 Phase 2 — 团队协作与云端能力。
   ```

2. 第十一章新增索引项（追加到现有列表末尾）：
   ```markdown
   ### AI 能力扩展（Phase 1 Sprint 3.5）
   - [Prompt 库与组合器设计](specs/design/prompt-library.md) - 分层结构、用户覆盖、动态渲染、冲突检测
   - [Skill 系统设计](specs/design/skill-system.md) - Skill 规范、注册加载、执行模型、内置清单
   - [Sub-agent 系统设计](specs/design/sub-agent-system.md) - 独立循环、权限隔离、结构化输出
   - [Workflow 自动化设计](specs/design/workflow-system.md) - YAML 规范、执行器、触发器、用户确认
   - [Hook 节点与错误恢复设计](specs/design/hooks-and-recovery.md) - 8 个挂载点、Reactive Compact
   ```

3. 第八章新增决策记录（追加到现有表格）：

   | 日期 | 决策 | 理由 |
   |---|---|---|
   | 2026-04-19 | AI 能力扩展采用 Claude Code 风格四层模型 | 保持非技术用户友好；调试复杂度更低 |
   | 2026-04-19 | Workflow 使用声明式 YAML，不提供图形化编辑器 | 避免成为小型编程平台 |
   | 2026-04-19 | Sub-agent 默认不继承主 agent 的 MEMORY.md | 避免记忆污染 |
   | 2026-04-19 | Prompt 作为 Markdown 文件存储，纳入 Git | 文件即真相原则 |
   | 2026-04-19 | 暂不实现 MCP 协议支持 | MCP 涉及外部协议，留到 Phase 2 |

**验证：** CLAUDE.md 更新后格式正确、内容完整

### 步骤 10：单元测试

**文件：** `tests/main/services/workflow/` 和 `tests/renderer/components/`

1. `workflow-parser.test.ts` 测试用例：
   - 合法 YAML 正确解析为 WorkflowDefinition
   - 缺少必填字段时校验失败
   - 步骤 id 重复时校验失败
   - when 表达式语法错误时校验失败
   - 模板变量 `${{ params.xxx }}` 正确替换
   - 前置步骤 skipped 时变量返回 undefined

2. `workflow-registry.test.ts` 测试用例：
   - initialize() 加载内置和工作区 Workflow
   - 用户定义覆盖内置
   - getByTrigger() 正确过滤

3. `workflow-executor.test.ts` 测试用例：
   - 顺序执行步骤正确
   - when 条件跳过
   - requires_user_confirm 暂停/继续
   - on_failure: stop 终止 / continue 继续
   - 变量传递 `${{ steps.xxx }}` 正确
   - 超时警告
   - 每步持久化

4. `workflow-scheduler.test.ts` 测试用例：
   - 文件触发器 debounce（1 秒内多次变化仅触发一次）
   - 并发上限 2（第 3 个排队）
   - 手动触发正确

5. `workflow-run-store.test.ts` 测试用例：
   - persist + get 往返正确
   - getIncompleteRuns 返回未完成记录
   - listRuns 过滤正确

6. `workflow-confirm-panel.test.tsx` 测试用例：
   - 渲染步骤信息和前置产出
   - 确认/跳过/取消三个按钮调用正确 IPC

7. `skill-card.test.tsx` 测试用例：
   - 内置 Skill 显示"派生"按钮
   - 自定义 Skill 显示"编辑"和"删除"按钮
   - 删除时二次确认

8. `prompt-performance-collector.test.ts` 测试用例：
   - AI 调用后 JSONL 正确追加
   - query 过滤正确

**覆盖率目标：** ≥ 80%（P0）/ ≥ 60%（P1）

## 现有代码基础

| 已有模块 | 文件路径 | 本任务使用方式 |
|---------|---------|-------------|
| SkillExecutor | `skill-system/SkillExecutor.ts`（TASK037） | Workflow 的 skill 步骤委托调用 |
| SubAgentExecutor | `sub-agent/SubAgentExecutor.ts`（TASK038） | Workflow 的 sub_agent 步骤委托调用 |
| PromptComposer | `context-engine/PromptComposer.ts`（TASK035） | Skill 步骤的 prompt 注入 |
| CommandPalette | `components/command-palette/` | 扩展能力管理命令注册入口 |
| CommandRegistry | `command/command-registry.ts` | 注册 workflow/skill 管理命令 |
| Tracer | `trace/tracer.ts` | Workflow 运行产生 Trace |
| FileManager | `file-manager.ts` | Workflow 运行记录文件读写 |
| DiffReviewPanel | `components/studio/AIDiffPreviewCard.tsx` | Workflow 确认面板复用 diff 展示 |
| traceStore | `store/traceStore.ts` | Trace 查询 |
| modeStore | `store/modeStore.ts` | 模式状态参考（store 设计模式） |

**完全缺失、需新建的模块：**

| 模块 | 说明 |
|------|------|
| `workflow/WorkflowParser.ts` | YAML 解析与校验 |
| `workflow/WorkflowRegistry.ts` | Workflow 注册 |
| `workflow/WorkflowExecutor.ts` | 步骤执行引擎 |
| `workflow/WorkflowScheduler.ts` | 触发器管理 |
| `workflow/WorkflowRunStore.ts` | 运行记录持久化 |
| `workflow/steps/`（4 文件） | 步骤执行器 |
| `workflow/types.ts` + `index.ts` | 类型和导出 |
| `resources/workflows/`（3 文件） | 内置 Workflow 模板 |
| `components/skill-library/`（3 文件） | Skill 库面板 |
| `components/workflow/`（4 文件） | Workflow 管理面板 |
| `components/agent/AgentCard.tsx` | Sub-agent 卡片 |
| `store/workflowStore.ts` | Zustand Workflow 状态 |
| `ipc/handlers/workflow.ts` | Workflow IPC |
| `context-engine/PromptPerformanceCollector.ts` | Prompt 版本化数据收集 |
| `ipc/handlers/prompt-library.ts` | Prompt 库浏览（只读视图） |

## 新增 IPC 通道

| IPC 通道 | 方向 | 说明 |
|---------|------|------|
| `workflow:list` | Renderer → Main | 列出所有 Workflow |
| `workflow:trigger-manual` | Renderer → Main | 手动触发 Workflow |
| `workflow:get-run` | Renderer → Main | 获取运行详情 |
| `workflow:cancel-run` | Renderer → Main | 取消运行 |
| `workflow:list-runs` | Renderer → Main | 列出运行历史 |
| `workflow:confirmation-required` | Main → Renderer | 确认请求推送 |
| `workflow:confirm-step` | Renderer → Main | 用户确认决策 |

## 涉及的现有文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `shared/types.ts` | 扩展 | 新增 Workflow 相关类型 + IPC 通道常量 |
| `preload/index.ts` | 扩展 | 新增 workflow 命名空间 |
| `command/command-registry.ts` | 扩展 | 注册扩展能力管理命令 |
| `CLAUDE.md` | 更新 | 第十/十一/八章内容更新 |
| IPC 注册入口 | 扩展 | 注册 workflow handler |
