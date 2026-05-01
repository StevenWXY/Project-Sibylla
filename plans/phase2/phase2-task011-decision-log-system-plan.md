# PHASE2-TASK011: 决策日志系统 — 实施计划

> 任务来源：[specs/tasks/phase2/phase2-task011_decision-log-system.md](../../specs/tasks/phase2/phase2-task011_decision-log-system.md)
> 创建日期：2026-05-01
> 最后更新：2026-05-01

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK011 |
| **任务标题** | 决策日志系统 |
| **所属阶段** | Phase 2 - 项目管理闭环 (Sprint 6) |
| **优先级** | P0 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **前置依赖** | TASK001(事件总线) + TASK002(统一搜索) + TASK006(通知中心) + Sprint 3.2(三层记忆) + Sprint 3.3(Trace) + Sprint 3.5(Sub-agent) + Sprint 1(Tiptap/文件树) |

### 1.1 目标

构建 Sprint 6 的结构化决策日志系统——让 AI 能从对话中识别决策讨论、创建结构化决策记录文件、通过 `DecisionProjectionProcessor`（实现 `ExtractionPostProcessor` 接口）将精炼摘要投影到 MEMORY.md `technical_decision` section，并支持后续回填实际结果触发重新投影。

### 1.2 核心设计约束（不可违反）

| 约束 | 来源 | 具体要求 |
|------|------|----------|
| 决策日志是源，MEMORY.md 是投影 | 任务文档 §核心设计约束 | MEMORY.md 条目必须带反向链接到决策日志文件 |
| 不修改 MemoryExtractor | 任务文档 §核心设计约束 | 投影通过 `DecisionProjectionProcessor` 实现 `ExtractionPostProcessor` 接口 |
| 决策检测使用 Sub-agent | 任务文档 §核心设计约束 | `decision-curator` 从对话中识别决策模式，不使用启发式规则 |
| 投影触发时机为 checkpoint 周期 | 任务文档 §核心设计约束 | 新增/更新决策日志后，下一个 checkpoint 自动触发投影 |
| 矛盾检测由 TASK013 实现 | 任务文档 §核心设计约束 | 本任务仅定义事件，为巡检触发器提供数据源 |
| TS 严格模式禁止 any | CLAUDE.md §四 | 所有新增类型严格 |
| 先写临时文件再原子替换 | CLAUDE.md §六 | DecisionLogger 写入遵循此红线 |
| 主进程渲染进程隔离 | CLAUDE.md §四 | 渲染进程不直接访问文件系统，通过 IPC |
| 文件即真相 | CLAUDE.md §二 | 决策日志为 Markdown 明文存储 |
| AI 建议人类决策 | CLAUDE.md §二 | AI 检测到决策后推送建议，用户确认才创建 |

### 1.3 核心交付物

| 交付物 | 文件路径 | 类型 |
|--------|---------|------|
| DecisionLogger 核心服务 | `src/main/services/decision/decision-logger.ts` | 新建 |
| 决策类型定义 | `src/main/services/decision/types.ts` | 新建 |
| DecisionProjectionProcessor | `src/main/services/memory/decision-projection-processor.ts` | 新建 |
| decision-curator Sub-agent | `resources/prompts/agents/decision-curator.md` | 新建 |
| IPC handler (decision) | `src/main/ipc/handlers/decision.ts` | 新建 |
| Zustand store | `src/renderer/store/decisionStore.ts` | 新建 |
| DecisionLogPanel | `src/renderer/components/decision/DecisionLogPanel.tsx` | 新建 |
| DecisionLogForm | `src/renderer/components/decision/DecisionLogForm.tsx` | 新建 |
| DecisionOutcomeEditor | `src/renderer/components/decision/DecisionOutcomeEditor.tsx` | 新建 |
| 事件类型扩展 | `src/main/services/event-bus-types.ts` | 修改 |
| IPC 通道常量 | `src/shared/types.ts` | 修改 |
| Preload API | `src/preload/index.ts` | 修改 |
| 应用初始化代码 | 服务注册模块 | 修改 |
| 单元测试 | `tests/main/services/decision/` | 新建 |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` §二 | 文件即真相；AI 建议人类决策；记忆即演化 | 决策日志存储格式、AI 检测需确认 |
| `CLAUDE.md` §四 | TS 严格模式禁止 any；IPC 隔离；结构化日志；错误处理 | 全局代码约束 |
| `CLAUDE.md` §六 | 先写临时文件再原子替换；等待超 2s 需进度反馈 | DecisionLogger 写入 |
| `specs/design/architecture.md` | 进程通信架构(§3.2)、IPC 模式 | IPC 设计 |
| `specs/design/data-and-api.md` | Workspace 文件结构（.sibylla/memory/decisions/） | 决策日志存放路径 |
| `specs/design/memory-system-design.md` | 三层存储架构、ExtractionPostProcessor 扩展点、MEMORY.md 结构 | DecisionProjectionProcessor |
| `specs/design/sub-agent-system.md` | Sub-agent 注册与执行、YAML frontmatter 格式 | decision-curator prompt |
| `specs/design/ui-ux-design.md` | 色彩体系、组件规范、交互规范 | UI 组件设计 |
| `specs/requirements/phase2/sprint6-task-management.md` | 需求 6.4（决策日志系统）、§2.2（决策日志与 MEMORY.md 分层）、§4.2（决策日志生命周期） | 验收标准 |
| `specs/tasks/phase2/phase2-task011_decision-log-system.md` | 7 步执行路径、全部验收标准 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `electron-ipc-patterns` | Decision IPC 设计；类型安全通道映射；M→R 事件推送 | `decision.ts` handler + `preload/index.ts` 扩展 |
| `zustand-state-management` | `decisionStore.ts` 设计；selector 性能优化；IPC 封装在 action 中 | `src/renderer/store/decisionStore.ts` |
| `typescript-strict-mode` | 类型安全 API 设计；泛型约束 | 全模块类型定义 |

### 2.3 前置代码依赖

| 模块 | 实际文件路径 | 复用方式 |
|------|------------|---------|
| `ExtractionPostProcessor` 接口 | `sibylla-desktop/src/main/services/memory/types.ts:96-98` | DecisionProjectionProcessor 实现此接口 |
| `ExtractionCandidate` 类型 | `sibylla-desktop/src/main/services/memory/types.ts:100-107` | `process()` 返回此类型数组 |
| `ExtractionReport` 类型 | `sibylla-desktop/src/main/services/memory/types.ts:109-115` | `process()` 第一个参数 |
| `ExtractionInput` 类型 | `sibylla-desktop/src/main/services/memory/types.ts:90-94` | `process()` 第二个参数 |
| `MemorySection` 类型 | `sibylla-desktop/src/main/services/memory/types.ts:3-9` | section=`technical_decision` |
| `CheckpointScheduler` | `sibylla-desktop/src/main/services/memory/checkpoint-scheduler.ts:30-44` | 构造时接受 `postProcessors?: ExtractionPostProcessor[]`（line 44），调用点 line 173-200 |
| `NotificationPreferenceExtractor` | `sibylla-desktop/src/main/services/notifications/notification-preference-extractor.ts` | 并列参考实现 |
| `FileManager` | `sibylla-desktop/src/main/services/file-manager.ts` | `writeFile()`（line 423，原子写入）、`readFile()`（line 299）、`listFiles()`（line 1264） |
| `AppEventBus` | `sibylla-desktop/src/main/services/event-bus.ts` | 发射 `decision.*` 事件 |
| `SibyllaEventType` | `sibylla-desktop/src/main/services/event-bus-types.ts:5-66` | 追加 2 个 `decision.*` 事件类型 |
| `EventPayloadMap` | `sibylla-desktop/src/main/services/event-bus-types.ts:81-143` | 追加 decision 事件 payload |
| `SubAgentRegistry` | `sibylla-desktop/src/main/services/sub-agent/SubAgentRegistry.ts` | 自动发现 `decision-curator.md` |
| `SubAgentExecutor` | `sibylla-desktop/src/main/services/sub-agent/SubAgentExecutor.ts` | 执行 `decision-curator` |
| `NotificationEngine` | `sibylla-desktop/src/main/services/notifications/notification-engine.ts` | 推送决策创建建议 |
| `IpcHandler` | `sibylla-desktop/src/main/ipc/handler.ts` | 新建 decision handler 继承此类 |
| `IPC_CHANNELS` | `sibylla-desktop/src/shared/types.ts` | 追加 `decision:*` 通道常量 |
| `preload/index.ts` | `sibylla-desktop/src/preload/index.ts` | 新增 decision 命名空间 |
| `MemoryIndexer` | `sibylla-desktop/src/main/services/memory/memory-indexer.ts` | 自动索引 MEMORY.md 中的 technical_decision 条目 |

### 2.4 IPC 通道清单（本任务新增）

| 通道常量 | 通道名 | 方向 | 用途 |
|---------|--------|------|------|
| `DECISION_LIST` | `decision:list` | R→M | 查询决策日志列表 |
| `DECISION_GET` | `decision:get` | R→M | 获取单个决策日志详情 |
| `DECISION_CREATE` | `decision:create` | R→M | 创建决策日志 |
| `DECISION_UPDATE_OUTCOME` | `decision:updateOutcome` | R→M | 更新决策实际结果 |
| `DECISION_DETECT` | `decision:detect` | R→M | 手动触发决策检测（调用 Sub-agent） |

---

## 三、现有代码盘点与差距分析

### 3.1 事件类型（需扩展 ⚠️）

`event-bus-types.ts` 当前包含 ~62 个事件类型，其中已有：
- `kanban.*` 前缀（TASK010 新增）
- `notification.*` 前缀（TASK006 新增）
- `memory.*` / `file.*` / `ai.*` / `trace.*` / `progress.*` 等

**缺口：** 缺少 2 个 `decision.*` 事件类型和对应 `EventPayloadMap` 条目：
- `decision.recorded`：决策创建时触发
- `decision.outcome-updated`：决策结果回填时触发

### 3.2 ExtractionPostProcessor 机制（已就绪 ✅）

`memory/types.ts:96-98` 已定义接口，`CheckpointScheduler` 构造函数（line 44）已接受 `postProcessors?: ExtractionPostProcessor[]` 可选参数，line 173-200 已实现遍历调用逻辑。`NotificationPreferenceExtractor` 作为参考实现已运行。

**结论：** 无需修改 `CheckpointScheduler` 或 `MemoryExtractor`，仅需：
1. 实现 `DecisionProjectionProcessor` 类
2. 在应用初始化时将其追加到 `postProcessors` 数组

### 3.3 IPC 通道与 Preload（需扩展 ⚠️）

- `shared/types.ts` IPC_CHANNELS 缺少 5 个 decision 通道常量
- `preload/index.ts` ElectronAPI 缺少 `decision` 命名空间
- `ALLOWED_CHANNELS` 列表需追加新通道名

### 3.4 Sub-agent 自动发现（已就绪 ✅）

`SubAgentRegistry` 在 `initialize()` 时自动扫描 `resources/prompts/agents/` 目录下的 `.md` 文件，解析 YAML frontmatter 注册。只需将 `decision-curator.md` 放入该目录即可自动注册。

### 3.5 FileManager 原子写入（已就绪 ✅）

`FileManager.writeFile()` 默认使用临时文件 + rename 的原子写入方式，符合 CLAUDE.md §六 红线要求。

### 3.6 NotificationEngine 集成（需对接 ⚠️）

`NotificationEngine` 已支持规则注册（`registerRules()`），需新增决策建议通知规则。通知触发后用户可采纳/修改/忽略，走现有 `recordAction()` + `PreferenceLearner` 偏好学习链路。

### 3.7 MemoryIndexer（已就绪 ✅）

`MemoryIndexer.indexReport()` 会自动处理 `ExtractionReport` 中的 `technical_decision` section 条目，进行 FTS5 + sqlite-vec 索引。DecisionProjectionProcessor 返回的 `ExtractionCandidate` 走现有 `applyExtractionReport()` 流程后自动被索引。

### 3.8 完全缺失的文件

| 文件 | 说明 |
|------|------|
| `src/main/services/decision/types.ts` | DecisionLog / DecisionOption / CreateDecisionInput 类型 |
| `src/main/services/decision/decision-logger.ts` | 决策日志核心服务 |
| `src/main/services/memory/decision-projection-processor.ts` | ExtractionPostProcessor 实现 |
| `resources/prompts/agents/decision-curator.md` | 决策检测 Sub-agent prompt |
| `src/main/ipc/handlers/decision.ts` | 决策 IPC handler |
| `src/renderer/store/decisionStore.ts` | Zustand store |
| `src/renderer/components/decision/DecisionLogPanel.tsx` | 列表/详情面板 |
| `src/renderer/components/decision/DecisionLogForm.tsx` | 手动创建表单 |
| `src/renderer/components/decision/DecisionOutcomeEditor.tsx` | 实际结果内联编辑器 |
| `tests/main/services/decision/` | 单元测试目录 |

---

## 四、执行路径（7 步）

### 步骤 1：新增 decision.* 事件类型

**目标：** 在事件总线中注册决策事件的类型签名。

**修改文件：** `src/main/services/event-bus-types.ts`

**操作：**

1. 在 `SibyllaEventType` 联合类型（line 5-66）末尾追加：
   ```typescript
   | 'decision.recorded'
   | 'decision.outcome-updated'
   ```

2. 在 `EventPayloadMap`（line 81-143）中追加：
   ```typescript
   'decision.recorded': { decisionId: string; title: string; filePath: string }
   'decision.outcome-updated': { decisionId: string; newOutcome: string }
   ```

**验证：** TypeScript 编译通过（`tsc --noEmit`）。

**风险：** 极低。纯类型扩展，不影响运行时。

---

### 步骤 2：实现 DecisionLogger 核心服务

**目标：** 提供决策日志文件的创建/更新/查询能力。

**新建文件：**

#### 2a. `src/main/services/decision/types.ts`

定义核心类型：

```typescript
export type DecisionStatus = 'decided' | 'in-progress' | 'reverted'

export interface DecisionOption {
  name: string
  pros?: string
  cons?: string
  risks?: string
}

export interface DecisionLog {
  id: string
  title: string
  status: DecisionStatus
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

export interface CreateDecisionInput {
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

export interface DecisionListFilters {
  tags?: string[]
  status?: DecisionStatus
  searchQuery?: string
  sortBy?: 'date' | 'title'
  sortOrder?: 'asc' | 'desc'
}
```

#### 2b. `src/main/services/decision/decision-logger.ts`

**构造函数注入：**
```typescript
constructor(
  private readonly fileManager: FileManager,
  private readonly eventBus: AppEventBus,
  private readonly workspaceRoot: string,
)
```

**核心方法：**

| 方法 | 签名 | 关键逻辑 |
|------|------|----------|
| `create` | `(input: CreateDecisionInput) => Promise<DecisionLog>` | slug 生成 → 路径构造 → Markdown 模板渲染 → `fileManager.writeFile()` → 发射 `decision.recorded` |
| `updateOutcome` | `(decisionId: string, actualResult: string) => Promise<void>` | 定位文件 → 替换 `## 实际结果` section → 更新 frontmatter status（reverted 检测）→ 发射 `decision.outcome-updated` |
| `list` | `(filters?: DecisionListFilters) => Promise<DecisionLog[]>` | 扫描两个目录 → 解析 frontmatter → 过滤/排序 |
| `get` | `(decisionId: string) => Promise<DecisionLog \| null>` | 遍历文件查找 id 匹配 → 完整解析 |
| `getByFilePath` | `(filePath: string) => Promise<DecisionLog \| null>` | 直接读取指定路径 |

**slug 生成规则：**
- 使用 `transliterate` 库将中文转拼音（需新增依赖 `transliteration`）
- 特殊字符替换为短横线
- 连续短横线合并
- 截断到 60 字符
- 文件名冲突追加 `-2`, `-3` 后缀

**决策日志文件模板：**

```
---
id: {id}
title: {title}
status: {status}
decided_at: {date}
decided_by: [{decidedBy}]
tags: [{tags}]
related_files: [{relatedFiles}]
---

# {title}

## 问题
{problem}

## 选项
{options 格式化}

## 决策
**选择: {chosen}**

## 理由
{reason}

## 实际结果
<!-- 上线后回填 -->
```

**目录策略：**
- `location='memory'`（默认）→ `.sibylla/memory/decisions/{YYYY-MM-DD}-{slug}.md`
- `location='docs'` → `docs/decisions/{YYYY-MM-DD}-{slug}.md`
- 创建前确保目录存在（`fileManager.mkdir()`）

**验证：** 单元测试覆盖创建/更新/列表/get/slug 边界。

---

### 步骤 3：实现 DecisionProjectionProcessor

**目标：** 实现 `ExtractionPostProcessor` 接口，将决策日志投影到 MEMORY.md。

**新建文件：** `src/main/services/memory/decision-projection-processor.ts`

**类定义：**
```typescript
export class DecisionProjectionProcessor implements ExtractionPostProcessor {
  private lastProcessedMtimes: Map<string, number> = new Map()

  constructor(
    private readonly fileManager: FileManager,
    private readonly workspaceRoot: string,
  ) {}

  process(report: ExtractionReport, context: ExtractionInput): ExtractionCandidate[]
}
```

**`process()` 逻辑：**

1. 扫描目录：
   - `.sibylla/memory/decisions/`
   - `docs/decisions/`
2. 对每个 `.md` 文件获取 `stat.mtimeMs`
3. 过滤 `mtimeMs > lastProcessedMtimes.get(filename)`
4. 对新增/更新的文件执行：
   a. 读取文件内容
   b. 解析 YAML frontmatter（使用正则，不引入 gray-matter 依赖）
   c. 提取 Markdown sections（`## 问题` / `## 选项` / `## 决策` / `## 理由` / `## 实际结果`）
   d. 计算完整度 confidence：
      - 有问题 section: +0.2
      - 有选项 section (≥2 个): +0.2
      - 有决策 section: +0.2
      - 有理由 section: +0.2
      - 有实际结果: +0.1
      - 基础分: 0.1
      - 范围: 0.1 ~ 1.0
   e. 生成精炼摘要（50-100 字）：`{title}：{problem 摘要}。选择{chosen}，理由：{reason 摘要}`
   f. 构造 `ExtractionCandidate`：
      ```typescript
      {
        section: 'technical_decision',
        content: `${摘要}\n\nsource: ${相对路径}`,
        confidence,
        reasoning: `DecisionProjectionProcessor: auto-projected from ${filename}`,
        sourceLogIds: [],
      }
      ```
5. 更新 `lastProcessedMtimes`
6. 错误处理：单文件失败跳过 + warning 日志，不影响其他文件

**frontmatter 解析方案（不引入新依赖）：**

```typescript
function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null
  // 手动解析简单 YAML（仅支持 key: value / key: [a, b] 格式）
  // 复杂场景降级返回 null
}
```

**验证：** 单元测试覆盖新增/更新/缺项 confidence/frontmatter 错误/空目录/双目录扫描。

---

### 步骤 4：注册 DecisionProjectionProcessor

**目标：** 将 processor 追加到 CheckpointScheduler 的 postProcessors 数组。

**修改文件：** 应用初始化代码（`src/main/index.ts` 或服务注册模块）

**操作：**

```typescript
import { DecisionProjectionProcessor } from './services/memory/decision-projection-processor'

// 在 CheckpointScheduler 构造或 V2Components 初始化时
const decisionProcessor = new DecisionProjectionProcessor(
  fileManager,
  workspaceRoot,
)

// 追加到现有 postProcessors 数组
const postProcessors = [
  notificationPreferenceExtractor, // 已有
  decisionProcessor,               // 新增
]
```

**注意：** 不修改 `CheckpointScheduler` 构造函数签名——它已接受 `postProcessors?: ExtractionPostProcessor[]` 可选参数。

**验证：** 集成测试——创建决策日志 → 手动触发 checkpoint → 验证 MEMORY.md 中出现 technical_decision 条目 + 反向链接。

---

### 步骤 5：创建 decision-curator Sub-agent Prompt

**目标：** 定义从对话中识别决策讨论的 Sub-agent prompt。

**新建文件：** `resources/prompts/agents/decision-curator.md`

**YAML frontmatter：**

```yaml
---
id: decision-curator
version: "1.0.0"
name: 决策策展员
description: 从对话中识别并结构化决策讨论
model: claude-haiku
allowed_tools:
  - readFile
  - searchFiles
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

**Prompt 正文核心约束：**

1. 输入：最近 N 轮对话内容
2. 检测决策模式标志：
   - 出现 2+ 个并列方案/选项
   - 有优劣分析（优势/劣势/风险）
   - 有最终选择表述（"选择"/"决定"/"采用"/"decided"/"chosen"）
3. 仅提取**明确的决策**——不确定时 `detected: false`
4. 每个检测必须包含 `sourceQuote`（引用原对话片段，10-50 字）
5. 选项需包含 `name` + 至少一项 `pros`/`cons`
6. `chosen` 必须是 `options` 中某项的 `name`
7. 返回严格 JSON，不包含 Markdown 代码块标记

**验证：** 手动测试 3 种场景（有决策对话/无决策对话/隐含决策对话）。

---

### 步骤 6：实现 IPC Handler + UI 组件

#### 6a. IPC 通道常量

**修改文件：** `src/shared/types.ts`

在 `IPC_CHANNELS` 对象中追加：
```typescript
DECISION_LIST: 'decision:list',
DECISION_GET: 'decision:get',
DECISION_CREATE: 'decision:create',
DECISION_UPDATE_OUTCOME: 'decision:updateOutcome',
DECISION_DETECT: 'decision:detect',
```

#### 6b. IPC Handler

**新建文件：** `src/main/ipc/handlers/decision.ts`

```typescript
export class DecisionIpcHandler extends IpcHandler {
  readonly namespace = 'decision'

  constructor(
    private readonly decisionLogger: DecisionLogger,
    private readonly subAgentExecutor: SubAgentExecutor,
  ) {}

  register(): void {
    // decision:list → decisionLogger.list(filters)
    // decision:get → decisionLogger.get(id)
    // decision:create → decisionLogger.create(input)
    // decision:updateOutcome → decisionLogger.updateOutcome(id, result)
    // decision:detect → subAgentExecutor.run('decision-curator', { conversation })
  }
}
```

#### 6c. Preload API 扩展

**修改文件：** `src/preload/index.ts`

1. 在 `ElectronAPI` 接口追加 `decision` 命名空间
2. 在 `ALLOWED_CHANNELS` 追加 5 个通道名
3. 在 `api` 对象中实现 `decision` 命名空间方法

#### 6d. Zustand Store

**新建文件：** `src/renderer/store/decisionStore.ts`

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

Store 遵循 Skill `zustand-state-management` 模式：
- IPC 调用封装在 action 中
- 使用 `create()` + `immer` 中间件
- selector 粒度拆分避免不必要重渲染

#### 6e. UI 组件

**新建目录：** `src/renderer/components/decision/`

| 组件 | 文件 | 职责 |
|------|------|------|
| DecisionLogPanel | `DecisionLogPanel.tsx` | 主面板容器：列表视图 + 详情视图切换 |
| DecisionLogForm | `DecisionLogForm.tsx` | 手动创建表单：标题/问题/选项/选择/理由/标签/位置 |
| DecisionOutcomeEditor | `DecisionOutcomeEditor.tsx` | 实际结果内联编辑器：textarea + 保存/取消 |

**DecisionLogPanel 列表视图：**
- 时间倒序卡片列表
- 每卡片：标题、日期、状态标记（decided=绿/in-progress=黄/reverted=红）、标签列表
- 顶部过滤栏：标签多选 + 关键词搜索
- 点击卡片 → 详情视图

**DecisionLogPanel 详情视图：**
- Markdown 渲染（复用现有 Markdown 渲染组件）
- `## 实际结果` section 下嵌入 `DecisionOutcomeEditor`
- 关联文件列表（可点击跳转）

**DecisionLogForm 结构：**
- 标题输入（必填）
- 问题描述 textarea
- 选项列表（动态添加/删除，每项有名称+优势+劣势）
- 选择方案下拉（从已填选项中选）
- 理由 textarea
- 标签输入（自由文本 + 常用标签建议）
- 关联文件（可从文件树选择）
- 存储位置选择（"团队文档" / "个人记忆"）
- 提交 → `decisionStore.createDecision()`

**DecisionOutcomeEditor 交互：**
- 默认显示只读文本 + "编辑"按钮
- 点击编辑 → 切换为 textarea（预填现有内容）
- 保存 → `decisionStore.updateOutcome()`
- 取消 → 恢复原内容

**验证：** 列表渲染/详情 Markdown/结果回填/手动创建表单。

---

### 步骤 7：单元测试

**新建目录：** `tests/main/services/decision/`

#### 7a. `decision-logger.test.ts`

| 测试用例 | 覆盖场景 |
|---------|---------|
| 创建决策日志（标准输入） | slug 生成、文件写入、事件发射 |
| 创建决策日志（中文标题） | transliterate → slug |
| 创建决策日志（特殊字符） | 短横线替换、截断 |
| 文件名冲突后缀 | `-2`, `-3` 递增 |
| 更新实际结果（标准） | section 替换、事件发射 |
| 更新实际结果（回退） | status 自动改为 reverted |
| 列表查询（全部） | 双目录扫描 |
| 列表查询（按标签过滤） | tags 匹配 |
| 列表查询（按时间排序） | decidedAt 排序 |
| 获取单个决策（存在） | 完整解析 |
| 获取单个决策（不存在） | 返回 null |

#### 7b. `decision-projection-processor.test.ts`

| 测试用例 | 覆盖场景 |
|---------|---------|
| 新增决策投影（完整格式） | confidence = 0.9 |
| 缺项投影（缺选项） | confidence = 0.7 |
| 缺项投影（缺理由） | confidence = 0.7 |
| 缺项投影（缺问题+选项） | confidence = 0.3 |
| 更新后重新投影 | mtime 变化触发 |
| frontmatter 解析失败 | 跳过该文件 |
| 空目录 | 返回空数组 |
| 反向链接正确生成 | content 含 source 路径 |
| 双目录扫描 | 同时扫描 memory + docs |

#### 7c. `decision-curator-prompt.test.ts`

| 测试用例 | 覆盖场景 |
|---------|---------|
| 有决策对话 | detected=true + 完整结构 |
| 无决策对话 | detected=false |
| sourceQuote 引用验证 | 引用与原文匹配 |

#### 7d. `decision-ipc.test.ts`

| 测试用例 | 覆盖场景 |
|---------|---------|
| decision:list 正确调用 | filters 传递 |
| decision:get 正确调用 | id 传递 |
| decision:create 正确调用 | input 传递 |
| decision:updateOutcome 正确调用 | id + result 传递 |
| decision:detect 正确调用 | SubAgentExecutor.run 调用 |
| 错误处理 | IPCResponse 包装 |

**覆盖率目标：** DecisionLogger ≥ 85%、DecisionProjectionProcessor ≥ 85%、IPC handler ≥ 80%

---

## 五、阶段性目标与推进策略

### 5.1 阶段划分

本任务按依赖链拆为 3 个阶段，每阶段产出一个可独立验证的增量：

```
阶段 1（后端核心）          阶段 2（投影+检测）         阶段 3（前端 UI）
┌──────────────────┐    ┌──────────────────────┐    ┌───────────────────┐
│ 步骤 1: 事件类型  │    │ 步骤 3: Projection    │    │ 步骤 6: IPC+UI    │
│ 步骤 2: Logger    │───▶│ 步骤 4: 注册          │───▶│ 步骤 7: 测试      │
│                  │    │ 步骤 5: Sub-agent      │    │                   │
└──────────────────┘    └──────────────────────┘    └───────────────────┘
     ~1 天                     ~1 天                      ~1.5 天
```

### 5.2 阶段 1：后端核心（步骤 1-2）

**交付物：** DecisionLogger 可独立创建/查询决策日志文件

**验证点：**
- [x] TypeScript 编译通过
- [ ] `DecisionLogger.create()` 在 `.sibylla/memory/decisions/` 生成正确格式的 `.md` 文件
- [ ] `DecisionLogger.list()` 返回决策列表
- [ ] `DecisionLogger.updateOutcome()` 更新 `## 实际结果` section
- [ ] `decision.recorded` / `decision.outcome-updated` 事件正确发射
- [ ] slug 生成覆盖中文/特殊字符/截断/冲突

**推进方式：** 先实现 `types.ts`，再实现 `decision-logger.ts`。事件类型扩展（步骤 1）与 Logger 实现（步骤 2）可并行开发，最后合入时验证编译。

### 5.3 阶段 2：投影与检测（步骤 3-5）

**交付物：** 决策日志自动投影到 MEMORY.md + Sub-agent 决策检测

**验证点：**
- [ ] `DecisionProjectionProcessor.process()` 正确返回 `ExtractionCandidate[]`
- [ ] confidence 基于完整度正确计算（0.1 ~ 1.0）
- [ ] 注册后 checkpoint 周期自动触发投影
- [ ] MEMORY.md `technical_decision` section 出现带反向链接的决策摘要
- [ ] `decision-curator.md` 被 SubAgentRegistry 自动发现
- [ ] Sub-agent 执行结果包含 `detected`/`title`/`options`/`chosen`/`sourceQuote`

**推进方式：** 步骤 3（ProjectionProcessor）和步骤 5（Sub-agent prompt）无依赖关系可并行。步骤 4（注册）依赖步骤 3 完成后合入。

### 5.4 阶段 3：前端 UI（步骤 6-7）

**交付物：** 完整的决策日志 UI + 单元测试

**验证点：**
- [ ] IPC 通道注册成功，preload 暴露 decision API
- [ ] DecisionLogPanel 列表渲染正确（时间倒序、状态标记、标签过滤）
- [ ] DecisionLogPanel 详情渲染正确（Markdown 渲染）
- [ ] DecisionOutcomeEditor 保存/取消正常工作
- [ ] DecisionLogForm 创建提交成功
- [ ] 单元测试覆盖率达标

**推进方式：** IPC handler（步骤 6a-6c）→ Zustand store（步骤 6d）→ UI 组件（步骤 6e）→ 测试（步骤 7）。IPC handler 是 UI 组件的前置依赖。

### 5.5 阶段间依赖图

```
步骤 1 ─┐
        ├─▶ 步骤 2 ─┐
步骤 1 ─┘            │
                     ├─▶ 步骤 3 ─▶ 步骤 4
                     │                  │
                     ├─▶ 步骤 5 ────────┤
                                        │
                                        ▼
                     步骤 6a ─▶ 6b ─▶ 6c ─▶ 6d ─▶ 6e
                                                          │
                                                          ▼
                                                        步骤 7
```

---

## 六、文件变更清单

### 6.1 新建文件

| 文件路径 | 类型 | 步骤 | 说明 |
|---------|------|------|------|
| `src/main/services/decision/types.ts` | 服务 | 2 | 决策日志类型定义 |
| `src/main/services/decision/decision-logger.ts` | 服务 | 2 | 决策日志核心服务 |
| `src/main/services/memory/decision-projection-processor.ts` | 服务 | 3 | ExtractionPostProcessor 实现 |
| `resources/prompts/agents/decision-curator.md` | Prompt | 5 | 决策检测 Sub-agent |
| `src/main/ipc/handlers/decision.ts` | IPC | 6 | 决策 IPC handler |
| `src/renderer/store/decisionStore.ts` | Store | 6 | Zustand store |
| `src/renderer/components/decision/DecisionLogPanel.tsx` | UI | 6 | 列表/详情面板 |
| `src/renderer/components/decision/DecisionLogForm.tsx` | UI | 6 | 手动创建表单 |
| `src/renderer/components/decision/DecisionOutcomeEditor.tsx` | UI | 6 | 结果内联编辑器 |
| `tests/main/services/decision/decision-logger.test.ts` | 测试 | 7 | Logger 测试 |
| `tests/main/services/decision/decision-projection-processor.test.ts` | 测试 | 7 | Projection 测试 |
| `tests/main/services/decision/decision-curator-prompt.test.ts` | 测试 | 7 | Sub-agent 测试 |
| `tests/main/services/decision/decision-ipc.test.ts` | 测试 | 7 | IPC 测试 |

### 6.2 修改文件

| 文件路径 | 步骤 | 变更说明 |
|---------|------|---------|
| `src/main/services/event-bus-types.ts` | 1 | SibyllaEventType +2 事件 + EventPayloadMap +2 条目 |
| `src/shared/types.ts` | 6 | IPC_CHANNELS +5 decision 通道常量 |
| `src/preload/index.ts` | 6 | ElectronAPI +decision 命名空间 + ALLOWED_CHANNELS +5 通道 |
| 应用初始化代码 | 4 | CheckpointScheduler 注册 DecisionProjectionProcessor |

### 6.3 不修改的文件

| 文件 | 原因 |
|------|------|
| `src/main/services/memory/memory-extractor.ts` | 投影通过 ExtractionPostProcessor 扩展点，不修改核心 |
| `src/main/services/memory/checkpoint-scheduler.ts` | 构造函数已接受 postProcessors 可选参数 |
| `src/main/services/memory/types.ts` | 接口已存在，无需扩展 |
| `src/main/services/sub-agent/SubAgentRegistry.ts` | 自动发现机制已支持 |

### 6.4 新增依赖

| 包名 | 用途 | 步骤 |
|------|------|------|
| `transliteration` | 中文标题 slug 转拼音 | 2 |

---

## 七、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| frontmatter YAML 解析复杂度超预期 | 中 | 中 | 使用手写简化解析器，仅支持 key: value 和 key: [array] 格式，复杂场景降级跳过 |
| CheckpointScheduler 实际注册点未在 main/index.ts 中 | 中 | 高 | 需定位 V2Components 初始化流程，可能需在 `memory-manager.ts` 中追加注册逻辑 |
| transliteration 库体积过大 | 低 | 低 | 评估 `pinyin-pro` 或 `tiny-pinyin` 作为轻量替代 |
| Sub-agent 执行延迟影响通知体验 | 低 | 中 | decision-curator 使用 claude-haiku 模型 + max_turns=3 控制延迟 < 5s |
| 决策日志文件与 MEMORY.md 条目不一致 | 低 | 高 | ProjectionProcessor 每次 checkpoint 基于_mtime 全量比对，非增量 |
| 中文 slug 生成质量不佳 | 中 | 低 | 回退方案：中文标题直接使用日期+序号命名（`dec_2026_05_01_001`） |

---

## 八、参考文档索引

| 文档 | 路径 | 引用场景 |
|------|------|---------|
| 任务定义 | `specs/tasks/phase2/phase2-task011_decision-log-system.md` | 实施蓝图 |
| Sprint 6 需求 | `specs/requirements/phase2/sprint6-task-management.md` §6.4 | 验收标准 |
| 系统架构 | `specs/design/architecture.md` | IPC 设计 |
| 数据模型 | `specs/design/data-and-api.md` | 文件结构 |
| 记忆系统设计 | `specs/design/memory-system-design.md` | ExtractionPostProcessor |
| Sub-agent 设计 | `specs/design/sub-agent-system.md` | Agent 定义格式 |
| UI 规范 | `specs/design/ui-ux-design.md` | 组件设计 |
| 项目宪法 | `CLAUDE.md` | 全局约束 |
| IPC 模式 Skill | `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` | IPC 设计 |
| Zustand Skill | `.kilocode/skills/phase1/zustand-state-management/SKILL.md` | Store 设计 |
| TS 严格模式 Skill | `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` | 类型设计 |

---

**创建时间：** 2026-05-01
**最后更新：** 2026-05-01
**更新记录：**
- 2026-05-01 — 创建实施计划（§1-§8，7 步执行路径，3 阶段推进策略）
