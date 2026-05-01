# 决策日志系统

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK011 |
| **任务标题** | 决策日志系统 |
| **所属阶段** | Phase 2 - 项目管理闭环 (Sprint 6) |
| **优先级** | P0 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

构建 Sprint 6 的结构化决策日志系统——让 AI 能从对话中识别决策讨论、创建结构化决策记录文件、通过 `DecisionProjectionProcessor`（实现 `ExtractionPostProcessor` 接口）将精炼摘要投影到 MEMORY.md `technical_decision` section，并支持后续回填实际结果触发重新投影。

### 背景

Sprint 3.2 的 MEMORY.md `technical_decision` section 已记录技术决策摘要，但缺少完整的决策上下文（问题、选项、对比、理由）。团队在协作中频繁做决策，但这些决策散落在对话和文档中，无法系统化回顾：

| 问题 | 现状 | 本任务解决 |
|------|------|-----------|
| 决策上下文丢失 | MEMORY.md 仅存 50-100 字摘要 | 完整决策日志记录问题/选项/对比/理由/结果 |
| 决策无结构化存储 | 散落在对话和各文档中 | `.sibylla/memory/decisions/` 目录统一管理 |
| 决策不可检索 | MEMORY.md 摘要无反向链接 | 决策日志通过 MemoryIndexer 支持 FTS5 + sqlite-vec 检索 |
| 决策冲突无检测 | 两份矛盾决策共存不报警 | decision-contradiction 巡检触发器（TASK013）可检测 |
| 决策结果无回填 | 选了方案后无后续跟踪 | `actual_result` 字段支持回填 + 重新投影 |

**核心设计约束：**

1. **决策日志是源，MEMORY.md 是投影**——MEMORY.md 中的 `technical_decision` 条目必须带反向链接到决策日志文件
2. **不修改 MemoryExtractor**——投影通过 `DecisionProjectionProcessor` 实现 `ExtractionPostProcessor` 接口，在 `CheckpointScheduler` 后处理阶段执行（C4）
3. **决策日志走 personal/ 还是 docs/decisions/ 由用户选择**——默认根据当前对话上下文判断
4. **决策检测使用 Sub-agent**——`decision-curator` 从对话中识别决策模式，不使用启发式规则
5. **投影触发时机为 checkpoint 周期**——新增/更新决策日志后，下一个 checkpoint 自动触发 `DecisionProjectionProcessor`
6. **两份决策日志的矛盾检测由 TASK013 实现**——本任务仅定义 `decision.recorded` / `decision.outcome-updated` 事件，为巡检触发器提供数据源

### 范围

**包含：**

- `DecisionLogger` — 决策日志文件创建/更新/查询服务
- `DecisionProjectionProcessor` — 实现 `ExtractionPostProcessor` 接口，将决策日志投影到 MEMORY.md
- `decision-curator` Sub-agent prompt — 从对话中识别并结构化决策讨论
- `DecisionLogPanel` 组件 — 决策日志列表/详情/创建 UI
- `DecisionLogForm` 组件 — 手动创建决策日志表单（含模板）
- `DecisionOutcomeEditor` 组件 — 回填 actual_result 的内联编辑器
- IPC handlers（decision.ts）— 决策日志相关 IPC 通道
- Zustand store（decisionStore.ts）— 决策日志 UI 状态
- 事件类型扩展 — 新增 `decision.recorded` / `decision.outcome-updated` 到 SibyllaEventType
- 单元测试

**不包含：**

- 任务看板（TASK010）
- AI 日报/周报（TASK012）
- 管理员 Dashboard（TASK013）
- ProactiveEngine PatrolTrigger 扩展（`decision-contradiction` 触发器在 TASK013 实现）
- MemoryExtractor 核心逻辑修改
- CheckpointScheduler 核心逻辑修改（仅注册新的 ExtractionPostProcessor）

## 依赖关系

### 前置依赖

- [x] PHASE2-TASK001 — 事件总线（`AppEventBus` + `SibyllaEventType`）
- [x] PHASE2-TASK002 — 统一搜索引擎（`UnifiedSearchEngine` 检索决策日志）
- [x] PHASE2-TASK006 — 通知中心（`NotificationEngine` 推送决策建议）
- [x] Sprint 3.2 — 三层记忆系统（`MemoryExtractor` + `ExtractionPostProcessor` 接口 + `CheckpointScheduler` + `MemoryIndexer`）
- [x] Sprint 3.3 — Trace 系统（决策检测/创建行为进 Trace）
- [x] Sprint 3.5 — Sub-agent 系统（`SubAgentExecutor` + `SubAgentRegistry`）
- [x] Sprint 1 — Tiptap 编辑器、文件树

### 被依赖任务

- [ ] PHASE2-TASK013 — 管理员 Dashboard 与巡检触发器（消费 `decision.recorded` / `decision.outcome-updated` 事件实现 `decision-contradiction` 巡检触发器）

## 参考文档

- [`specs/requirements/phase2/sprint6-task-management.md`](../../requirements/phase2/sprint6-task-management.md) — 需求 6.4（决策日志系统）、§2.2（决策日志与 MEMORY.md 分层）、§4.2（决策日志生命周期）、§9.5（C4 MemoryExtractor 投影机制冲突分析）
- [`specs/design/memory-system-design.md`](../../design/memory-system-design.md) — 三层记忆架构、ExtractionPostProcessor 扩展点
- [`specs/design/architecture.md`](../../design/architecture.md) — 进程通信架构
- [`specs/design/data-and-api.md`](../../design/data-and-api.md) — Workspace 文件结构
- [`specs/design/sub-agent-system.md`](../../design/sub-agent-system.md) — Sub-agent 注册与执行
- [`CLAUDE.md`](../../../CLAUDE.md) — 文件即真相、AI 建议人类决策
- `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` — Electron IPC 通信模式
- `.kilocode/skills/phase1/zustand-state-management/SKILL.md` — Zustand store 设计

## 验收标准

### 决策日志检测与创建

- [ ] `decision-curator` Sub-agent 从对话中检测到决策模式（多选项、优劣分析、最终选择）时，建议创建决策日志
- [ ] 建议通过 NotificationCenter 推送，包含：决策标题、选项摘要、来源对话片段
- [ ] 用户点击"采纳"，`DecisionLogger.create()` 在 `.sibylla/memory/decisions/{YYYY-MM-DD}-{slug}.md` 创建结构化文件
- [ ] 用户点击"修改"，打开 DecisionLogForm 预填充 AI 提取内容后创建
- [ ] 用户点击"忽略"，偏好学习降低该类建议敏感度
- [ ] 用户可通过命令面板手动触发决策创建（不依赖 AI 检测）

### 决策日志文件格式

- [ ] 决策日志使用 YAML frontmatter + Markdown 结构：
  ```markdown
  ---
  id: dec_2026_05_03_database_choice
  title: 选择主数据库
  status: decided | in-progress | reverted
  decided_at: 2026-05-03
  decided_by: [Alice, Bob]
  tags: [database, infrastructure, "#phase-2"]
  related_files: [docs/architecture/storage.md]
  ---

  # 选择主数据库

  ## 问题
  ...

  ## 选项
  ### 方案 A: PostgreSQL
  - 优势: ...
  - 劣势: ...
  ### 方案 B: MySQL
  - 优势: ...
  - 劣势: ...

  ## 决策
  **选择: 方案 A**

  ## 理由
  ...

  ## 实际结果
  <!-- 上线后回填 -->
  ```
- [ ] 文件名 slug 由标题自动生成（小写 + 短横线，截断到 60 字符）
- [ ] `id` 格式为 `dec_{YYYY}_{MM}_{DD}_{slug}`

### DecisionProjectionProcessor（C4 — ExtractionPostProcessor）

- [ ] `DecisionProjectionProcessor` 实现 `ExtractionPostProcessor` 接口
- [ ] `process()` 方法：
  1. 扫描 `.sibylla/memory/decisions/` 目录
  2. 通过文件 mtime 识别自上次 checkpoint 以来新增/更新的决策日志
  3. 解析 YAML frontmatter（`title`/`status`/`decided_at`/`tags`）和 Markdown 结构（问题/选项/决策/理由）
  4. 生成 `ExtractionCandidate[]`，section=`technical_decision`
  5. content 中包含精炼摘要（50-100 字）+ 反向链接 `source: .sibylla/memory/decisions/{filename}`
- [ ] processor 在 `CheckpointScheduler` 构造时注册，与现有 `NotificationPreferenceExtractor` 并列
- [ ] 源文件更新（mtime 变化）时，下一个 checkpoint 自动重新投影
- [ ] `ExtractionCandidate.confidence` 基于决策日志完整度计算（有问题+选项+决策+理由 = 0.9，缺项递减）

### 决策结果回填

- [ ] 用户可通过 DecisionOutcomeEditor 内联编辑 `actual_result` 部分
- [ ] 回填后 `DecisionLogger.updateOutcome()` 更新决策日志文件的 `## 实际结果` section
- [ ] 更新触发 `decision.outcome-updated` 事件
- [ ] 下一个 checkpoint 周期 `DecisionProjectionProcessor` 自动重新投影到 MEMORY.md

### 决策日志查询与检索

- [ ] 通过 UnifiedSearch 可检索决策日志内容（FTS5 全文 + sqlite-vec 语义）
- [ ] 搜索结果包含相关性评分
- [ ] DecisionLogPanel 支持按标签过滤、按时间排序

### 手动创建表单

- [ ] DecisionLogForm 提供结构化表单（非 AI 检测场景）
- [ ] 字段：标题（必填）、问题描述、选项列表（可动态添加）、选择方案、理由、标签、关联文件
- [ ] 表单提交后调用 `DecisionLogger.create()` 创建文件
- [ ] 表单预填模板（空白模板 + 常见决策类型模板：技术选型/架构决策/流程变更）

### 事件发射

- [ ] 决策日志创建时触发 `decision.recorded` 事件，payload `{ decisionId, title, filePath }`
- [ ] 决策结果更新时触发 `decision.outcome-updated` 事件，payload `{ decisionId, newOutcome }`

### UI 组件

- [ ] DecisionLogPanel 列表视图：时间倒序显示所有决策日志，每项显示标题、日期、状态标记
- [ ] DecisionLogPanel 详情视图：完整渲染决策日志 Markdown 内容
- [ ] DecisionOutcomeEditor：`## 实际结果` section 下方显示编辑按钮，点击进入内联编辑模式
- [ ] 列表支持按标签过滤和关键词搜索

### 性能要求

- [ ] decision-curator Sub-agent 执行 < 5s（后台异步）
- [ ] DecisionProjectionProcessor 单次处理 < 500ms（< 50 个决策日志时）
- [ ] 决策日志列表渲染 < 200ms
- [ ] 全文搜索响应 < 300ms

### 单元测试

- [ ] DecisionLogger 创建/更新/查询测试
- [ ] DecisionProjectionProcessor 投影测试（新增/更新/重新投影/缺项完整度）
- [ ] decision-curator prompt 测试（有决策对话/无决策对话/多选项对话）
- [ ] 决策日志文件格式解析测试（标准格式/缺项/frontmatter 错误）
- [ ] slug 生成测试（中文标题/特殊字符/截断）
- [ ] 覆盖率 ≥ 80%

## 技术策略

### 核心架构：决策日志 → MEMORY.md 投影流

```
┌─────────────────────────────────────────────────────────────┐
│                     AI 对话上下文                            │
│         用户与 AI 讨论技术方案，做出决策                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ 每 N 轮触发
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              decision-curator Sub-agent                      │
│  输入: 最近 N 轮对话                                         │
│  输出: 检测到决策? { title, problem, options[], chosen,       │
│         reason, sourceQuote } : null                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ 检测到决策
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   NotificationCenter                         │
│  推送"建议创建决策日志"通知                                    │
│  用户: 采纳 / 修改 / 忽略                                     │
└──────────┬───────────────┬──────────────────────────────────┘
           │ 采纳/修改      │ 忽略
           ▼               ▼
  ┌──────────────┐   偏好学习降低敏感度
  │DecisionLogger│
  │ .create()    │
  └──────┬───────┘
         │ 写入文件
         ▼
  .sibylla/memory/decisions/{YYYY-MM-DD}-{slug}.md
  (完整结构化记录: 问题/选项/决策/理由/实际结果)
         │
         │ 触发 decision.recorded 事件
         ▼
  ┌─────────────────────────────────────────────┐
  │       CheckpointScheduler (下一个周期)        │
  │                                              │
  │  MemoryExtractor.extract(logs) → 主提取      │
  │         │                                    │
  │         ▼                                    │
  │  ExtractionPostProcessor 链:                 │
  │    ├─ NotificationPreferenceExtractor (已有) │
  │    └─ DecisionProjectionProcessor (本任务新增)│
  │         │                                    │
  │         ├─ 扫描 .sibylla/memory/decisions/   │
  │         ├─ mtime 检测新增/更新                │
  │         ├─ 解析 frontmatter + Markdown       │
  │         └─ 返回 ExtractionCandidate[]        │
  │              section: 'technical_decision'    │
  │              content: 摘要 + 反向链接          │
  │              confidence: 基于完整度           │
  │                                              │
  │         ▼                                    │
  │  applyExtractionReport() → 更新 MEMORY.md    │
  └─────────────────────────────────────────────┘
         │
         ▼
  MEMORY.md technical_decision section
  (精炼摘要 50-100 字 + 反向链接到决策日志)
         │
         ▼
  MemoryIndexer (sqlite-vec + FTS5)
  → 支持语义检索和全文搜索
         │
         ▼
  ContextEngine 在后续 AI 对话中召回决策上下文
```

### 与现有系统的集成点

**C4 调整说明：** `MemoryExtractor.extract()` 的输入是 `LogEntry[]`（对话交互日志），不会扫描文件系统。决策日志的投影改由 `DecisionProjectionProcessor` 实现 `ExtractionPostProcessor` 接口。该接口在 `CheckpointScheduler` 的后处理扩展点（line 173-200）中被调用，每个 processor 接收 `ExtractionReport` 和 `ExtractionInput`，返回 `ExtractionCandidate[]`。这是 Sprint 3.2 预留的插件机制，不修改 `MemoryExtractor` 本身。

**DecisionProjectionProcessor 的 process() 签名对齐：**
```typescript
// 现有接口 (memory/types.ts:96-98)
interface ExtractionPostProcessor {
  process(report: ExtractionReport, context: ExtractionInput): ExtractionCandidate[]
}

// 本任务实现
class DecisionProjectionProcessor implements ExtractionPostProcessor {
  process(report: ExtractionReport, context: ExtractionInput): ExtractionCandidate[] {
    // 1. 扫描 .sibylla/memory/decisions/ 目录
    // 2. 通过 mtime 过滤新增/更新文件（对比上次处理的 snapshot）
    // 3. 解析 YAML frontmatter + Markdown 结构
    // 4. 计算 confidence（基于完整度）
    // 5. 返回 ExtractionCandidate[]
  }
}
```

**CheckpointScheduler 注册方式：** `CheckpointScheduler` 构造函数接受 `postProcessors?: ExtractionPostProcessor[]` 参数（line 40）。本任务在应用初始化时将 `DecisionProjectionProcessor` 追加到该数组，与现有 `NotificationPreferenceExtractor` 并列。

### 决策日志存储位置策略

决策日志默认存放在 `.sibylla/memory/decisions/`（系统管理目录，用户不可直接浏览）。但用户在创建时可选择存放到 `docs/decisions/`（团队文档目录，对所有人可见）。两种位置的投影逻辑相同，`DecisionProjectionProcessor` 同时扫描两个目录。

## 技术执行路径

### 步骤 1：新增 decision.* 事件类型

**文件：** `src/main/services/event-bus-types.ts`（修改）

1. 在 `SibyllaEventType` 联合类型中追加 2 个新事件：
   ```typescript
   | 'decision.recorded'
   | 'decision.outcome-updated'
   ```

2. 在 `EventPayloadMap` 中追加对应 payload：
   ```typescript
   'decision.recorded': { decisionId: string; title: string; filePath: string }
   'decision.outcome-updated': { decisionId: string; newOutcome: string }
   ```

**验证：** TypeScript 编译通过。

### 步骤 2：实现 DecisionLogger 核心服务

**文件：** `src/main/services/decision/decision-logger.ts`（新建）

1. 定义核心类型：
   ```typescript
   interface DecisionLog {
     id: string
     title: string
     status: 'decided' | 'in-progress' | 'reverted'
     decidedAt: string
     decidedBy: string[]
     tags: string[]
     relatedFiles: string[]
     problem: string
     options: DecisionOption[]
     chosen: string
     reason: string
     actualResult?: string
     filePath: string
     updatedAt: number
   }

   interface DecisionOption {
     name: string
     pros?: string
     cons?: string
     risks?: string
   }

   interface CreateDecisionInput {
     title: string
     problem: string
     options: DecisionOption[]
     chosen: string
     reason: string
     decidedBy?: string[]
     tags?: string[]
     relatedFiles?: string[]
     location?: 'memory' | 'docs'
   }
   ```

2. 实现 `create(input)`：
   - 生成 `id`：`dec_{YYYY}_{MM}_{DD}_{slug}`（slug 由标题生成，小写+短横线，截断 60 字符）
   - 生成文件路径：`.sibylla/memory/decisions/{YYYY-MM-DD}-{slug}.md` 或 `docs/decisions/{YYYY-MM-DD}-{slug}.md`
   - 构造完整 Markdown 内容（YAML frontmatter + 结构化 section）
   - 通过 `FileManager.writeFile()` 原子写入
   - 触发 `decision.recorded` 事件

3. 实现 `updateOutcome(decisionId, actualResult)`：
   - 定位决策日志文件
   - 替换 `## 实际结果` section 的内容
   - 更新 frontmatter 的 `status`（如果结果表示回退，改为 `reverted`）
   - 触发 `decision.outcome-updated` 事件
   - 文件 mtime 变化，下个 checkpoint 自动重新投影

4. 实现 `list(filters?)`：
   - 扫描 `.sibylla/memory/decisions/` 和 `docs/decisions/` 目录
   - 解析每个文件的 YAML frontmatter
   - 支持按标签过滤、按时间排序
   - 返回 `DecisionLog[]` 摘要列表（不加载完整内容）

5. 实现 `get(decisionId)`：
   - 通过 id 查找文件路径
   - 读取并解析完整内容
   - 返回 `DecisionLog`

6. 实现 slug 生成辅助方法：
   - 中文标题使用拼音首字母或直接 transliterate
   - 特殊字符替换为短横线
   - 截断到 60 字符
   - 文件名冲突时追加 `-2`, `-3` 后缀

**验证：** 单元测试覆盖创建（标准输入/中文标题/特殊字符）、更新结果、列表过滤、slug 生成。

### 步骤 3：实现 DecisionProjectionProcessor（C4）

**文件：** `src/main/services/memory/decision-projection-processor.ts`（新建）

1. 实现 `ExtractionPostProcessor` 接口：
   ```typescript
   export class DecisionProjectionProcessor implements ExtractionPostProcessor {
     constructor(
       private readonly fileManager: FileManager,
       private readonly workspaceRoot: string,
       private readonly logger: Logger
     ) {}

     process(report: ExtractionReport, context: ExtractionInput): ExtractionCandidate[] {
       // ...
     }
   }
   ```

2. `process()` 实现逻辑：
   - 使用 `FileManager.listFiles()` 扫描 `.sibylla/memory/decisions/` 和 `docs/decisions/`
   - 读取每个文件的 stat mtime
   - 对比内存中的 `lastProcessedMtimes` Map（构造函数初始化为空 Map，每次处理后更新）
   - 过滤出 mtime > lastProcessedMtimes[filename] 的文件
   - 对新增/更新的文件：
     a. 读取文件内容
     b. 解析 YAML frontmatter（使用 gray-matter 或正则）
     c. 解析 Markdown 结构（提取 `## 问题`、`## 选项`、`## 决策`、`## 理由` section）
     d. 计算完整度 confidence：
        - 有问题 section: +0.2
        - 有选项 section (>= 2 个选项): +0.2
        - 有决策 section: +0.2
        - 有理由 section: +0.2
        - 有实际结果: +0.1
        - 基础分: 0.1
        - 总分范围: 0.1 ~ 1.0
     e. 生成精炼摘要（50-100 字）：`{title}：{problem摘要}。选择{chosen}，理由：{reason摘要}`
     f. 在 content 中包含反向链接：`source: .sibylla/memory/decisions/{filename}`
     g. 返回 `ExtractionCandidate`：`{ section: 'technical_decision', content, confidence, reasoning, sourceLogIds: [] }`
   - 更新 `lastProcessedMtimes`

3. 错误处理：
   - 文件读取失败：跳过该文件，记录 warning 日志
   - frontmatter 解析失败：跳过该文件
   - 单个文件的错误不影响其他文件的处理

**验证：** 单元测试覆盖新增投影、更新重新投影、缺项 confidence 递减、frontmatter 错误跳过、空目录。

### 步骤 4：注册 DecisionProjectionProcessor 到 CheckpointScheduler

**文件：** 应用初始化代码（`src/main/index.ts` 或服务注册模块）（修改）

1. 在 CheckpointScheduler 构造时追加 processor：
   ```typescript
   const decisionProcessor = new DecisionProjectionProcessor(
     fileManager,
     workspaceRoot,
     logger
   )

   const checkpointScheduler = new CheckpointScheduler(
     memoryExtractor,
     memoryStore,
     fileManager,
     // ... 其他参数
     [notificationPreferenceExtractor, decisionProcessor]  // 追加到数组
   )
   ```

2. 不修改 `CheckpointScheduler` 构造函数签名——它已接受 `postProcessors?: ExtractionPostProcessor[]` 可选参数。

**验证：** 集成测试——创建决策日志 → 手动触发 checkpoint → 验证 MEMORY.md 中出现 technical_decision 条目 + 反向链接。

### 步骤 5：创建 decision-curator Sub-agent Prompt

**文件：** `resources/prompts/agents/decision-curator.md`（新建）

1. YAML frontmatter：
   ```yaml
   ---
   id: decision-curator
   version: 1.0.0
   name: 决策策展员
   description: 从对话中识别并结构化决策讨论
   model: claude-haiku
   allowed_tools:
     - read-file
     - search
   context:
     inherit_memory: false
     inherit_trace: false
     inherit_workspace_boundary: true
   max_turns: 3
   max_tokens: 3000
   output_schema:
     type: object
     required:
       - detected
     properties:
       detected:
         type: boolean
       title:
         type: string
       problem:
         type: string
       options:
         type: array
         items:
           type: object
           properties:
             name: { type: string }
             pros: { type: string }
             cons: { type: string }
       chosen:
         type: string
       reason:
         type: string
       sourceQuote:
         type: string
   ---
   ```

2. Prompt 正文核心约束：
   - 输入：最近 N 轮对话
   - 检测决策模式：出现 2+ 个选项、有优劣分析、有最终选择
   - 仅提取**明确的决策**，不臆测——`detected: false` 表示无决策
   - 每个检测必须包含 `sourceQuote`（引用具体对话片段）
   - 选项需包含 name + 至少一项 pros/cons
   - chosen 必须是 options 中某项的 name

**验证：** 手动测试 3 种场景（有决策对话/无决策对话/隐含决策对话）。

### 步骤 6：实现 Decision IPC Handler + UI 组件

**文件：** `src/main/ipc/handlers/decision.ts`（新建）

1. 新增 IPC 通道常量到 `IPC_CHANNELS`：
   ```typescript
   DECISION_LIST: 'decision:list',
   DECISION_GET: 'decision:get',
   DECISION_CREATE: 'decision:create',
   DECISION_UPDATE_OUTCOME: 'decision:updateOutcome',
   DECISION_DETECT: 'decision:detect',
   ```

2. 实现 handler（继承 `IpcHandler`，namespace `'decision'`）：
   - `decision:list` → `DecisionLogger.list(filters)`
   - `decision:get` → `DecisionLogger.get(decisionId)`
   - `decision:create` → `DecisionLogger.create(input)`
   - `decision:updateOutcome` → `DecisionLogger.updateOutcome(decisionId, result)`
   - `decision:detect` → 调用 `SubAgentExecutor.execute('decision-curator', { conversation })`

3. 在 `preload/index.ts` 新增 `decision` 命名空间。

**文件：** `src/renderer/store/decisionStore.ts`（新建）

4. Zustand store：
   ```typescript
   interface DecisionState {
     decisions: DecisionLog[]
     selectedDecision: DecisionLog | null
     isLoading: boolean
     filterTags: string[]
     searchQuery: string

     fetchDecisions: () => Promise<void>
     getDecision: (id: string) => Promise<void>
     createDecision: (input: CreateDecisionInput) => Promise<void>
     updateOutcome: (id: string, result: string) => Promise<void>
     setFilterTags: (tags: string[]) => void
     setSearchQuery: (query: string) => void
   }
   ```

**文件：** `src/renderer/components/decision/DecisionLogPanel.tsx`（新建）

5. 列表视图：
   - 时间倒序卡片列表
   - 每个卡片：标题、日期、状态标记（decided 绿色/in-progress 黄色/reverted 红色）、标签列表
   - 顶部过滤栏：标签多选、关键词搜索输入
   - 点击卡片进入详情视图

6. 详情视图：
   - 渲染完整 Markdown 内容（复用现有 Markdown 渲染组件）
   - `## 实际结果` section 下方显示编辑按钮
   - 关联文件列表（可点击跳转）

**文件：** `src/renderer/components/decision/DecisionOutcomeEditor.tsx`（新建）

7. 内联编辑器：
   - 点击编辑按钮切换为 textarea
   - 保存调用 `decision:updateOutcome` IPC
   - 取消恢复原内容

**文件：** `src/renderer/components/decision/DecisionLogForm.tsx`（新建）

8. 手动创建表单：
   - 标题输入（必填）
   - 问题描述 textarea
   - 选项列表（动态添加/删除，每项有名称+优势+劣势）
   - 选择方案下拉（从已填选项中选）
   - 理由 textarea
   - 标签输入（支持自由文本 + 常用标签建议）
   - 关联文件（可从文件树选择）
   - 存储位置选择（"团队文档" / "个人记忆"，默认根据上下文）
   - 提交调用 `decision:create` IPC

**验证：** 列表渲染正确、详情 Markdown 渲染正确、结果回填保存正确、手动创建表单提交正确。

### 步骤 7：单元测试

**文件：** `tests/main/services/decision/`（新建目录）

1. `decision-logger.test.ts`：
   - 创建决策日志（标准输入/中文标题 slug/特殊字符/文件名冲突后缀）
   - 更新实际结果（标准更新/回退状态自动标记 reverted）
   - 列表查询（全部/按标签过滤/按时间排序）
   - 获取单个决策（存在/不存在）
   - slug 生成边界情况

2. `decision-projection-processor.test.ts`：
   - 新增决策日志投影（完整格式 → confidence 0.9）
   - 缺项投影（缺选项 → confidence 0.7，缺理由 → 0.7，缺问题和选项 → 0.3）
   - 更新后重新投影（mtime 变化触发）
   - frontmatter 解析失败跳过
   - 空目录无输出
   - 反向链接正确生成
   - 同时扫描 `.sibylla/memory/decisions/` 和 `docs/decisions/`

3. `decision-curator-prompt.test.ts`：
   - 有决策对话 → detected: true + 完整结构
   - 无决策对话 → detected: false
   - sourceQuote 引用正确性验证

4. `decision-ipc.test.ts`：
   - 各 IPC 通道正确调用 DecisionLogger 方法
   - 错误处理和 IPCResponse 包装

**覆盖率目标：** DecisionLogger ≥ 85%、DecisionProjectionProcessor ≥ 85%、IPC handler ≥ 80%

## 现有代码基础

| 已有模块 | 文件路径 | 本任务使用方式 |
|---------|---------|-------------|
| FileManager | `src/main/services/file-manager.ts` | DecisionLogger 读写决策日志文件 |
| ExtractionPostProcessor 接口 | `src/main/services/memory/types.ts:96-98` | DecisionProjectionProcessor 实现此接口 |
| ExtractionCandidate 类型 | `src/main/services/memory/types.ts:100-107` | process() 返回此类型数组 |
| ExtractionReport 类型 | `src/main/services/memory/types.ts:109-115` | process() 第一个参数 |
| CheckpointScheduler | `src/main/services/memory/checkpoint-scheduler.ts` | 构造时注册 processor（line 40 postProcessors 参数，line 173-200 调用点） |
| NotificationPreferenceExtractor | `src/main/services/notifications/notification-preference-extractor.ts` | 并列参考实现 |
| MemoryIndexer | `src/main/services/memory/memory-indexer.ts` | 自动索引 MEMORY.md 中的 technical_decision 条目 |
| AppEventBus | `src/main/services/event-bus.ts` | 发射 decision.* 事件 |
| SibyllaEventType | `src/main/services/event-bus-types.ts` | 追加 decision.* 事件类型 |
| SubAgentRegistry | `src/main/services/sub-agent/SubAgentRegistry.ts` | 自动发现 decision-curator.md |
| SubAgentExecutor | `src/main/services/sub-agent/SubAgentExecutor.ts` | 执行 decision-curator |
| NotificationEngine | `src/main/services/notifications/notification-engine.ts` | 推送决策创建建议 |
| IpcHandler | `src/main/ipc/handler.ts` | 新建 decision handler 继承此类 |
| IPC_CHANNELS | `src/shared/types.ts` | 追加 decision:* 通道常量 |
| preload/index.ts | `src/preload/index.ts` | 新增 decision 命名空间 |

**完全缺失、需新建的模块：**

| 模块 | 说明 |
|------|------|
| `services/decision/decision-logger.ts` | 决策日志核心服务（创建/更新/查询） |
| `services/memory/decision-projection-processor.ts` | ExtractionPostProcessor 实现（投影到 MEMORY.md） |
| `resources/prompts/agents/decision-curator.md` | 决策检测 Sub-agent prompt |
| `ipc/handlers/decision.ts` | 决策日志 IPC handler |
| `renderer/store/decisionStore.ts` | 决策日志 Zustand store |
| `renderer/components/decision/DecisionLogPanel.tsx` | 决策日志列表/详情面板 |
| `renderer/components/decision/DecisionOutcomeEditor.tsx` | 实际结果内联编辑器 |
| `renderer/components/decision/DecisionLogForm.tsx` | 手动创建表单 |
| `tests/main/services/decision/` | 单元测试目录 |

## 新增 IPC 通道

| IPC 通道 | 方向 | 说明 |
|---------|------|------|
| `decision:list` | Renderer → Main | 查询决策日志列表 |
| `decision:get` | Renderer → Main | 获取单个决策日志详情 |
| `decision:create` | Renderer → Main | 创建决策日志 |
| `decision:updateOutcome` | Renderer → Main | 更新决策实际结果 |
| `decision:detect` | Renderer → Main | 手动触发决策检测（调用 Sub-agent） |

## 涉及的现有文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/main/services/event-bus-types.ts` | 扩展 | 新增 2 个 decision.* 事件类型 + payload |
| `src/shared/types.ts` | 扩展 | IPC_CHANNELS 新增 decision:* 常量 |
| `src/preload/index.ts` | 扩展 | 新增 decision 命名空间 |
| 应用初始化代码 | 修改 | CheckpointScheduler 注册 DecisionProjectionProcessor |

**不修改的文件：**

- `src/main/services/memory/memory-extractor.ts` — 完全不动，投影通过 ExtractionPostProcessor 扩展点
- `src/main/services/memory/checkpoint-scheduler.ts` — 不修改，构造函数已接受 postProcessors 可选参数
- `src/main/services/memory/types.ts` — 不修改，ExtractionPostProcessor 接口已存在
- `src/main/services/sub-agent/SubAgentRegistry.ts` — 自动发现机制已支持

---

**创建时间：** 2026-05-01
**最后更新：** 2026-05-01
**更新记录：**
- 2026-05-01 — 创建任务文档（含完整技术执行路径 7 步）
