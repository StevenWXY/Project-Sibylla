# PHASE1-TASK034: 对话导出与模型快速切换 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task034_export-model-switcher.md](../specs/tasks/phase1/phase1-task034_export-model-switcher.md)
> 创建日期：2026-04-22
> 最后更新：2026-04-22

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK034 |
| **任务标题** | 对话导出与模型快速切换 |
| **所属阶段** | Phase 1 - AI 模式系统、Plan 产物、Wiki 与能力整合 (Sprint 3.4) |
| **优先级** | P1 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **前置依赖** | TASK029 + TASK030 + TASK031 + TASK032 + FileManager |

### 1.1 目标

交付 Sprint 3.4 的三项 P1 用户级功能：

1. **对话导出**：支持 Markdown / JSON / HTML 三种格式导出对话，复用 TraceExporter 的脱敏规则自动保护敏感信息
2. **模型快速切换**：对话输入框上方的下拉切换器，让用户在对话中途切换 AI 模型，历史消息保留原模型标注
3. **快速设置面板**：右上角齿轮图标旁的快速设置面板，提供主题/语言/Trace/记忆等常用开关

### 1.2 核心设计约束

| 约束 | 来源 | 说明 |
|------|------|------|
| 脱敏复用 | 需求 3.4.8 | 对话导出直接复用 `TraceExporter` 的 `RedactionRule` 和脱敏逻辑，不创建独立的 Redactor |
| 模型切换仅影响后续消息 | 需求 3.4.9 | 切换模型后，当前对话的后续 AI 响应使用新模型，历史消息保留原模型元数据 |
| 文件即真相 | CLAUDE.md | 导出结果是人类可读的文件（Markdown/HTML）或机器可读的结构（JSON） |
| 原子写入 | CLAUDE.md | 导出文件使用 `FileManager.writeFile()` 的 atomic 模式写入 |
| 性能要求 | 需求 3.4.8 | 1000 条消息导出 < 2s |
| TS 严格模式禁止 any | CLAUDE.md | 全部代码遵循 TypeScript 严格模式 |
| 主进程与渲染进程严格隔离 | CLAUDE.md 架构约束 | 文件系统访问仅在主进程，渲染进程通过 IPC 调用 |
| AI 建议/人类决策 | CLAUDE.md 设计哲学 | 脱敏预检让用户确认，不静默处理 |

### 1.3 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| Export 类型 | `src/main/services/export/types.ts` | ExportFormat / ExportOptions / ExportPreview / ConversationMessage / ConversationData / SensitiveField |
| ConversationExporter | `src/main/services/export/conversation-exporter.ts` | 导出主类（委托 TraceExporter 脱敏） |
| MarkdownRenderer | `src/main/services/export/markdown-renderer.ts` | Markdown 格式渲染 |
| JsonRenderer | `src/main/services/export/json-renderer.ts` | JSON 格式渲染 |
| HtmlRenderer | `src/main/services/export/html-renderer.ts` | HTML 格式渲染（自包含） |
| Export 统一导出 | `src/main/services/export/index.ts` | barrel 文件 |
| IPC Handler (Export) | `src/main/ipc/handlers/export.ts` | preview / execute / copyClipboard |
| IPC Handler (Model) | `src/main/ipc/handlers/model.ts` | getCurrent / getAvailable / switch / getStatus |
| IPC Handler (QuickSettings) | `src/main/ipc/handlers/quick-settings.ts` | get / update |
| shared/types.ts 扩展 | `src/shared/types.ts` | Export / Model / QuickSettings IPC 通道常量 + 类型映射 |
| Preload API 扩展 | `src/preload/index.ts` | export / model / quickSettings 命名空间 |
| ExportDialog | `src/renderer/components/export/ExportDialog.tsx` | 导出对话框（三步向导） |
| ModelSwitcher | `src/renderer/components/header/ModelSwitcher.tsx` | 模型切换下拉 |
| QuickSettingsPanel | `src/renderer/components/header/QuickSettingsPanel.tsx` | 快速设置面板 |
| modelStore | `src/renderer/store/modelStore.ts` | Zustand 模型状态管理 |
| 命令面板集成 | conversation-commands.ts 扩展 + 新增 model-commands.ts | 导出/模型命令完善 |
| 单元测试 | `tests/export/*.test.ts` + `tests/renderer/*.test.tsx` | 核心逻辑 + 组件测试 |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；UI 等待 > 2s 需进度反馈；文件即真相；原子写入；AI 建议/人类决策 | 全局约束 |
| `specs/design/architecture.md` | 主进程与渲染进程通过 IPC 通信；渲染进程不得直接访问文件系统 | 进程通信架构 |
| `specs/design/ui-ux-design.md` | 色彩体系（主色 #6366F1）；暗色模式色值；交互规范（非技术用户优先） | ExportDialog / ModelSwitcher / QuickSettingsPanel UI |
| `specs/requirements/phase1/sprint3.4-mode.md` | 需求 3.4.8 对话导出 + 需求 3.4.9 模型切换器；完整验收标准 | 验收标准 |
| `specs/tasks/phase1/phase1-task034_export-model-switcher.md` | 11 步执行路径、完整技术规格、测试计划 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `electron-ipc-patterns` | IPC 通道注册；Preload API 扩展；类型安全通道映射；Push Event 转发 | `ipc/handlers/export.ts` + `ipc/handlers/model.ts` + `ipc/handlers/quick-settings.ts` + `preload/index.ts` |
| `typescript-strict-mode` | 全模块类型安全；泛型设计（ExportOptions<T>）；类型守卫 | 所有 `.ts` / `.tsx` 文件 |
| `zustand-state-management` | modelStore 设计；selector 优化；devtools 集成 | `src/renderer/store/modelStore.ts` |
| `frontend-design` | ExportDialog / ModelSwitcher / QuickSettingsPanel UI 设计质量 | `src/renderer/components/export/*.tsx` + `src/renderer/components/header/*.tsx` |

### 2.3 前置代码依赖

| 模块 | 文件路径 | 复用方式 |
|------|---------|---------|
| TraceExporter | `src/main/services/trace/trace-exporter.ts` | `mergeRules(customRules)` 获取合并后脱敏规则；`redactSpan()` / `redactAttributes()` 做消息内容脱敏；`RedactionRule` 类型复用；`DEFAULT_RULES` 常量复用 |
| RedactionRule 类型 | `src/main/services/trace/trace-exporter.ts` (line 14) | `interface RedactionRule { id, keyPattern?, valuePattern?, reason }` — 直接 import 使用，不重新定义 |
| ConversationStore | `src/main/services/conversation-store.ts` | `getConversation(id)` 获取对话记录；`getMessages(conversationId)` 获取消息列表；`ConversationRecord` / `MessageRecord` 类型 |
| FileManager | `src/main/services/file-manager.ts` | `writeFile(relativePath, content, { atomic: true, createDirs: true })` 原子写入导出文件；`readFile()` 读取引用文件 |
| Tracer | `src/main/services/trace/tracer.ts` | `withSpan('conversation.export', ...)` / `withSpan('model.switch', ...)` 包裹关键操作 |
| Span | `src/main/services/trace/types.ts` | `span.setAttributes()` 记录元数据 |
| CommandRegistry | `src/main/services/command/command-registry.ts` | 注册 `conversation.exportHtml` / `conversation.copySelection` / `model.switch.*` 命令 |
| conversation-commands.ts | `src/main/services/command/builtin-commands/conversation-commands.ts` | 升级 `conversation.exportMarkdown` / `conversation.exportJson` 为完整实现 |
| AppEventBus | `src/main/services/event-bus.ts` | `emit('conversation:export', opts)` / `emit('model:switch', opts)` 事件传递 |
| AiGatewayClient | `src/main/services/ai-gateway-client.ts` | 获取已配置模型列表；模型切换后 `request.model` 使用新模型 ID |
| AiGatewayChatRequest | `src/main/services/ai-gateway-client.ts` | `model` 字段用于指定当前对话使用的模型 |
| IPC_CHANNELS | `src/shared/types.ts` | 追加 Export + Model + QuickSettings 通道常量 |
| Preload API | `src/preload/index.ts` | 追加 export / model / quickSettings 命名空间 |
| Logger | `src/main/utils/logger.ts` | 结构化日志 |

### 2.4 关键接口适配说明

**TraceExporter 脱敏方法适配**：TraceExporter 的 `redactSpan()` / `redactAttributes()` 是 private 方法，面向 Span 对象设计。ConversationExporter 不能直接调用这些方法。解决方案：从 TraceExporter 中提取一个公共的 `redactText(text: string, rules: RedactionRule[]): string` 静态工具方法（或在 TraceExporter 中新增），将正则替换逻辑抽离为可复用的纯函数。此方法接受原始文本 + 规则列表，返回脱敏后文本。

**ConversationStore 数据结构映射**：`MessageRecord` 字段（id, conversationId, role, content, createdAt, contextSources, traceId, memoryState, ragHits）与任务描述中的 `ConversationMessage`（id, role, content, createdAt, model?, aiModeId?, traceId?, planId?）存在差异。需在 ConversationExporter 中编写 `mapMessageRecord()` 映射函数：
- `model` 和 `aiModeId` 从 `contextSources` 或未来 MessageRecord 扩展字段中读取
- `planId` 从 `traceId` 关联查询或 contextSources 中提取
- 若字段不存在，设为 undefined

**FileManager 原子写入路径**：FileManager 的 `writeFile(relativePath)` 接受相对于 workspaceRoot 的路径。导出文件的目标路径若在工作区外（用户自选目录），需使用 Node.js `fs` 模块直接写入（仍采用原子写入模式：先写临时文件再 rename）。

**模型配置来源**：代码库中无独立的模型注册表。当前模型信息分散在：(1) AI Gateway 支持的模型列表；(2) 用户的 API key 配置。TASK034 需要从 AiGatewayClient 或配置中获取可用模型列表。若 AI Gateway 未提供模型列表 API，则从配置文件读取硬编码的模型配置（后续可扩展）。

**EventMap 类型扩展**：`AppEventBus` 的 `EventMap` 类型中不包含 `conversation:export` / `model:switch` 等事件。现有代码使用 `as never` 绕过类型检查。TASK034 需在 EventMap 中正式追加这些事件类型。

### 2.5 新增 IPC 通道清单

| 通道常量 | 通道名 | 方向 | 用途 |
|---------|--------|------|------|
| `EXPORT_PREVIEW` | `export:preview` | Renderer→Main | 导出预检（消息数/敏感字段/引用文件） |
| `EXPORT_EXECUTE` | `export:execute` | Renderer→Main | 执行对话导出 |
| `EXPORT_COPY_CLIPBOARD` | `export:copyClipboard` | Renderer→Main | 复制选中消息到剪贴板 |
| `MODEL_GET_CURRENT` | `model:getCurrent` | Renderer→Main | 获取当前对话使用的模型 |
| `MODEL_GET_AVAILABLE` | `model:getAvailable` | Renderer→Main | 获取所有已配置模型列表 |
| `MODEL_SWITCH` | `model:switch` | Renderer→Main | 切换当前对话的模型 |
| `MODEL_GET_STATUS` | `model:getStatus` | Renderer→Main | 获取指定模型可用状态 |
| `QUICK_SETTINGS_GET` | `quickSettings:get` | Renderer→Main | 获取所有快速设置项 |
| `QUICK_SETTINGS_UPDATE` | `quickSettings:update` | Renderer→Main | 更新指定设置项 |

**Push Event（主进程→渲染进程）**：

| 事件名 | 通道名 | 用途 |
|--------|--------|------|
| `model:switched` | `model:switched` | 模型切换通知（含 conversationId + oldModel + newModel） |

---

## 三、现有代码盘点与差距分析

### 3.1 主进程模块现状

| 模块 | 现状 | TASK034 改造 |
|------|------|-------------|
| `services/export/` | **目录不存在**，需全新创建 | 新建 types.ts / conversation-exporter.ts / markdown-renderer.ts / json-renderer.ts / html-renderer.ts / index.ts |
| `ipc/handlers/export.ts` | **不存在**，需新建 | 注册 3 个 Export handler |
| `ipc/handlers/model.ts` | **不存在**，需新建 | 注册 4 个 Model handler |
| `ipc/handlers/quick-settings.ts` | **不存在**，需新建 | 注册 2 个 QuickSettings handler |
| `services/trace/trace-exporter.ts` | Sprint 3.3 已实现，`RedactionRule` + `DEFAULT_RULES` + `mergeRules()` 已存在 | 新增公共 `redactText()` 方法供 ConversationExporter 调用 |
| `services/conversation-store.ts` | 已有 `getConversation()` / `getMessages()` + SQLite 存储 | ConversationExporter 通过 ConversationStore 获取对话数据 |
| `services/file-manager.ts` | 已有 `writeFile()` with atomic 模式 | 导出文件写入；工作区外路径需独立处理 |
| `services/command/builtin-commands/conversation-commands.ts` | TASK032 已注册 2 个框架命令（exportMarkdown / exportJson） | 升级为完整实现 + 新增 exportHtml + copySelection |
| `services/command/builtin-commands/` 模型命令 | **不存在** | 新建 model-commands.ts |
| `services/ai-gateway-client.ts` | 已有 `AiGatewayChatRequest.model` 字段 | 模型切换后 request.model 使用新模型 ID；需新增获取可用模型列表能力 |
| `shared/types.ts` | 已有 120+ IPC 通道 | 追加 9 个新通道 + 类型映射 |
| `preload/index.ts` | 已有 17+ 命名空间 | 追加 export / model / quickSettings 命名空间 |
| `services/event-bus.ts` | 已有 `AppEventBus` + `EventMap` | 追加 `conversation:export` / `model:switched` 到 EventMap |

### 3.2 渲染进程模块现状

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/renderer/components/export/` | **目录不存在**，需创建 | ExportDialog 三步向导 |
| `src/renderer/components/header/` | **目录不存在**，需创建 | ModelSwitcher + QuickSettingsPanel |
| `src/renderer/components/layout/Header.tsx` | **已存在** (144 行) | 需集成 ModelSwitcher + QuickSettingsPanel |
| `src/renderer/store/modelStore.ts` | **不存在**，需新建 | Zustand 模型状态管理 |
| `src/renderer/store/appStore.ts` | **已存在** | QuickSettings 中的主题/语言切换可能复用 appStore 现有状态 |

### 3.3 关键接口衔接点

**ConversationExporter → TraceExporter**：
- `mergeRules(customRules?: RedactionRule[])` — 获取合并后的完整规则列表（默认规则 + 用户自定义规则）
- `redactText(text, rules)` — **需新增**：从 TraceExporter 中提取纯文本脱敏方法
- `RedactionRule` 类型 — 直接 import 使用
- `DEFAULT_RULES` — 9 条内置规则（api_key, token, password, secret, credential, email, user paths）

**ConversationExporter → ConversationStore**：
- `getConversation(id)` — 获取 `ConversationRecord`（id, title, createdAt, updatedAt, messageCount）
- `getMessages(conversationId)` — 获取 `MessageRecord[]`（id, conversationId, role, content, createdAt, contextSources, traceId）
- **映射**：`MessageRecord` → `ConversationMessage`（需补充 model/aiModeId/planId 字段）

**ConversationExporter → FileManager**：
- `writeFile(relativePath, content, { atomic: true, createDirs: true })` — 工作区内文件
- 工作区外文件：使用 Node.js `fs` 直接写入（仍采用临时文件 + rename 原子模式）

**ModelSwitcher → AiGatewayClient**：
- 获取可用模型列表（需从配置或 AI Gateway 获取）
- 切换模型后，后续 `AiGatewayChatRequest.model` 使用新模型 ID
- 模型可用状态检查（API key 是否配置、配额是否耗尽）

**QuickSettingsPanel → 现有配置**：
- 主题：复用 `appStore` 的 theme 切换逻辑
- 语言：复用 `appStore` 的 locale 设置
- Trace 开关：从配置读取 `trace.enabled`
- 记忆系统开关：从配置读取 `memory.enabled`
- 工作区路径：从 `appStore` 的 workspace 信息读取

### 3.4 不存在的文件清单

| 文件 | 类型 |
|------|------|
| `src/main/services/export/types.ts` | 新建 |
| `src/main/services/export/conversation-exporter.ts` | 新建 |
| `src/main/services/export/markdown-renderer.ts` | 新建 |
| `src/main/services/export/json-renderer.ts` | 新建 |
| `src/main/services/export/html-renderer.ts` | 新建 |
| `src/main/services/export/index.ts` | 新建 |
| `src/main/ipc/handlers/export.ts` | 新建 |
| `src/main/ipc/handlers/model.ts` | 新建 |
| `src/main/ipc/handlers/quick-settings.ts` | 新建 |
| `src/main/services/command/builtin-commands/model-commands.ts` | 新建 |
| `src/renderer/components/export/ExportDialog.tsx` | 新建 |
| `src/renderer/components/header/ModelSwitcher.tsx` | 新建 |
| `src/renderer/components/header/QuickSettingsPanel.tsx` | 新建 |
| `src/renderer/store/modelStore.ts` | 新建 |
| `tests/export/conversation-exporter.test.ts` | 新建 |
| `tests/export/markdown-renderer.test.ts` | 新建 |
| `tests/export/json-renderer.test.ts` | 新建 |
| `tests/export/html-renderer.test.ts` | 新建 |
| `tests/renderer/model-store.test.ts` | 新建 |

---

## 四、分步实施计划

### 阶段 A：Export 共享类型 + TraceExporter 脱敏适配（Step 1） — 预计 0.3 天

#### A1：创建 Export 类型定义

**文件：** `src/main/services/export/types.ts`（新建）

```typescript
export type ExportFormat = 'markdown' | 'json' | 'html'

export interface SensitiveField {
  path: string
  rule: string
  sample: string
}

export interface ExportOptions {
  format: ExportFormat
  conversationId: string
  includeMetadata: boolean
  includeReferencedFiles: boolean
  applyRedaction: boolean
  customRedactionRules?: RedactionRule[]
  targetPath: string
  messageRange?: { startIndex: number; endIndex: number }
}

export interface ExportPreview {
  estimatedSizeBytes: number
  messageCount: number
  detectedSensitiveFields: SensitiveField[]
  referencedFiles: string[]
  hasPlans: boolean
  hasTraces: boolean
}

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  model?: string
  aiModeId?: string
  traceId?: string
  planId?: string
}

export interface ConversationData {
  id: string
  title: string
  messages: ConversationMessage[]
  createdAt: string
  updatedAt: string
}
```

**关键约束：**
- `RedactionRule` 从 `trace-exporter.ts` 导入，不在本地重新定义
- `ConversationMessage` 是导出专用视图模型，与 `MessageRecord`（存储层）分离

#### A2：TraceExporter 新增公共脱敏方法

**文件：** `src/main/services/trace/trace-exporter.ts`（扩展）

在 TraceExporter 类中新增公共静态方法：

```typescript
static redactText(text: string, rules: RedactionRule[]): string {
  let result = text
  for (const rule of rules) {
    if (rule.valuePattern) {
      result = result.replace(
        new RegExp(rule.valuePattern, 'g'),
        `[REDACTED:${rule.id}]`
      )
    }
  }
  return result
}
```

**理由：** 现有 `redactSpan()` / `redactAttributes()` 面向 Span 对象，无法直接用于纯文本脱敏。提取 `redactText()` 消除重复逻辑。

#### A3：创建 Export barrel 文件

**文件：** `src/main/services/export/index.ts`（新建）

统一导出所有类型 + ConversationExporter。

---

### 阶段 B：三个 Renderer 实现（Step 3-5） — 预计 0.5 天

#### B1：MarkdownRenderer

**文件：** `src/main/services/export/markdown-renderer.ts`（新建）

**接口：**
```typescript
export class MarkdownRenderer {
  render(data: ConversationData, options: ExportOptions): string
  renderMessages(messages: ConversationMessage[], options: Partial<ExportOptions>): string
}
```

**渲染规则：**

| 场景 | 输出 |
|------|------|
| includeMetadata=true | YAML frontmatter（title / exported_at / message_count / sibylla_version）+ `# title` |
| includeMetadata=false | 仅 `# title` |
| 消息角色 | user → `**You**`，assistant → `**AI**` |
| 模式标签（includeMetadata） | `(Plan)` / `(Analyze)` 等，追加在角色后 |
| 时间戳（includeMetadata） | `_[2026-04-22 14:30:00]_`，追加在角色行末 |
| 消息间分隔 | `---` |
| Trace 链接（includeMetadata） | `Trace: {traceId}` |
| renderMessages | 仅渲染消息子集，用于剪贴板复制，不含 frontmatter |

**测试要点：** YAML frontmatter 格式合法、消息角色正确、metadata 开关控制、空对话不崩溃

#### B2：JsonRenderer

**文件：** `src/main/services/export/json-renderer.ts`（新建）

**接口：**
```typescript
export class JsonRenderer {
  render(data: ConversationData, options: ExportOptions): string
}
```

**输出结构：**
```json
{
  "version": 1,
  "exportedAt": "ISO-8601",
  "sibyllaVersion": "x.y.z",
  "conversation": {
    "id": "conv-xxx",
    "title": "...",
    "createdAt": "...",
    "updatedAt": "...",
    "messages": [
      {
        "id": "msg-xxx",
        "role": "user|assistant|system",
        "content": "...",
        "createdAt": "... (仅 includeMetadata)",
        "model": "... (仅 includeMetadata)",
        "aiModeId": "... (仅 includeMetadata)",
        "traceId": "... (仅 includeMetadata)",
        "planId": "... (仅 includeMetadata)"
      }
    ]
  }
}
```

**测试要点：** 输出可被 `JSON.parse` 解析、version=1、includeMetadata 开关控制字段

#### B3：HtmlRenderer

**文件：** `src/main/services/export/html-renderer.ts`（新建）

**接口：**
```typescript
export class HtmlRenderer {
  render(data: ConversationData, options: ExportOptions): string
}
```

**关键设计：**

1. **自包含**：所有 CSS 内联在 `<style>` 标签中，无外部引用
2. **消息气泡样式**：user 蓝色右对齐、assistant 灰色左对齐
3. **响应式**：max-width 800px，移动端适配
4. **代码块**：等宽字体 + 浅灰背景
5. **Attribution**：底部 `<footer>` 包含"此对话由 **Sibylla** 生成"
6. **HTML 转义**：`escapeHtml()` 处理用户内容中的 `<script>` 等
7. **简易 Markdown**：`renderBasicMarkdown()` 处理 **bold**、`code`、```code block```、[links]，不引入完整 Markdown 解析器

**CSS 内联常量 `INLINE_CSS`** 预定义约 80 行 CSS，涵盖容器/消息/气泡/代码/attribution。

**测试要点：** 无外部引用、DOCTYPE 结构合法、`<script>` 被转义、attribution 存在、Markdown 基本转换正确

---

### 阶段 C：ConversationExporter 核心实现（Step 2） — 预计 0.5 天

#### C1：实现 ConversationExporter 主类

**文件：** `src/main/services/export/conversation-exporter.ts`（新建）

**构造函数依赖注入：**
```typescript
constructor(
  private conversationStore: ConversationStore,
  private fileManager: FileManager,
  private traceExporter: TraceExporter,
  private planManager: PlanManager | null,
  private tracer: Tracer,
  private logger: Logger
)
```

**公共方法：**

| 方法 | 签名 | 说明 |
|------|------|------|
| preview | `(conversationId, options) → Promise<ExportPreview>` | 预检：消息数/大小/敏感字段/引用文件 |
| export | `(conversationId, options) → Promise<void>` | 执行导出（含 Trace span） |
| copyToClipboard | `(messageIds, format) → Promise<string>` | 格式化消息并写入剪贴板 |

**`preview()` 实现流程：**
1. `loadConversation(id)` → 获取 `ConversationData`
2. 若 `applyRedaction`：调用 `traceExporter.scanRedaction()` 扫描敏感字段
3. `estimateSize()` → 预估文件大小（content 长度 + metadata 开销 + 引用文件）
4. `extractReferencedFiles()` → 正则提取 `@file:xxx`、`` `path/to/file` `` 引用
5. 检查 `hasPlans` / `hasTraces`（遍历 messages 的 planId / traceId）
6. 返回 `ExportPreview`

**`export()` 实现流程：**
1. 包裹在 `tracer.withSpan('conversation.export', ...)` 中
2. `loadConversation(id)` → 获取 `ConversationData`
3. 若 `applyRedaction`：`redactConversation(data, rules)` → 深拷贝后逐条脱敏
4. `span.setAttributes({ export.format, export.message_count, export.redaction_applied })`
5. 按 format 分发到 renderer（Markdown / JSON / HTML）
6. 写入文件：
   - 工作区内路径 → `fileManager.writeFile(path, content, { atomic: true })`
   - 工作区外路径 → Node.js `fs`：临时文件 + `fs.rename()` 原子写入

**私有方法：**

| 方法 | 说明 |
|------|------|
| `loadConversation(id)` | 调用 `conversationStore.getConversation()` + `getMessages()` → 映射为 `ConversationData` |
| `mapMessageRecord(record)` | `MessageRecord` → `ConversationMessage`（model/aiModeId 从 contextSources 提取） |
| `redactConversation(data, rules)` | 深拷贝 ConversationData，逐条调用 `TraceExporter.redactText()` |
| `estimateSize(data, options)` | 基于 content 长度 + 格式开销估算 |
| `extractReferencedFiles(data)` | 正则提取文件引用，去重 |

---

### 阶段 D：IPC + Preload + shared/types（Step 6） — 预计 0.5 天

#### D1：扩展 shared/types.ts

**文件：** `src/shared/types.ts`（扩展）

追加 IPC 通道常量：
```typescript
EXPORT_PREVIEW: 'export:preview'
EXPORT_EXECUTE: 'export:execute'
EXPORT_COPY_CLIPBOARD: 'export:copyClipboard'

MODEL_GET_CURRENT: 'model:getCurrent'
MODEL_GET_AVAILABLE: 'model:getAvailable'
MODEL_SWITCH: 'model:switch'
MODEL_GET_STATUS: 'model:getStatus'

QUICK_SETTINGS_GET: 'quickSettings:get'
QUICK_SETTINGS_UPDATE: 'quickSettings:update'
```

追加 `IPCChannelMap` 类型映射（参数 + 返回类型）。

追加 Push Event 通道：`model:switched`。

追加 `ALLOWED_CHANNELS` 注册。

#### D2：新建 Export IPC Handler

**文件：** `src/main/ipc/handlers/export.ts`（新建）

注册 3 个 handler：

| 通道 | Handler 逻辑 |
|------|-------------|
| `export:preview` | `conversationExporter.preview(conversationId, options)` |
| `export:execute` | `conversationExporter.export(conversationId, options)` |
| `export:copyClipboard` | `conversationExporter.copyToClipboard(messageIds, format)` → `clipboard.writeText(formatted)` |

#### D3：新建 Model IPC Handler

**文件：** `src/main/ipc/handlers/model.ts`（新建）

注册 4 个 handler：

| 通道 | Handler 逻辑 |
|------|-------------|
| `model:getCurrent` | 从 ConversationService 读取当前对话的模型 ID |
| `model:getAvailable` | 从配置/AI Gateway 获取已配置模型列表（含可用状态） |
| `model:switch` | 更新当前对话的模型 ID + `tracer.withSpan('model.switch', ...)` + `eventBus.emit('model:switched', ...)` |
| `model:getStatus` | 检查指定模型可用状态（API key 配置、配额检查） |

**模型数据结构：**
```typescript
interface ConfiguredModel {
  id: string
  displayName: string
  provider: string
  available: boolean
  unavailableReason?: string
  costTier: 'low' | 'medium' | 'high'
  isRateLimited: boolean
  rateLimitResetAt?: number
}
```

#### D4：新建 QuickSettings IPC Handler

**文件：** `src/main/ipc/handlers/quick-settings.ts`（新建）

注册 2 个 handler：

| 通道 | Handler 逻辑 |
|------|-------------|
| `quickSettings:get` | 聚合当前配置：theme / language / workspacePath / trace.enabled / memory.enabled |
| `quickSettings:update` | 更新指定设置项 + 立即生效 |

**QuickSettingsItem 结构：**
```typescript
interface QuickSettingsState {
  theme: 'light' | 'dark' | 'system'
  language: 'zh' | 'en'
  workspacePath: string
  traceEnabled: boolean
  memoryEnabled: boolean
}
```

#### D5：扩展 Preload API

**文件：** `src/preload/index.ts`（扩展）

新增 3 个命名空间：

```typescript
export: {
  preview: (conversationId: string, options: ExportOptions) =>
    ipcRenderer.invoke('export:preview', conversationId, options),
  execute: (conversationId: string, options: ExportOptions) =>
    ipcRenderer.invoke('export:execute', conversationId, options),
  copyToClipboard: (messageIds: string[], format: string) =>
    ipcRenderer.invoke('export:copyClipboard', messageIds, format),
},
model: {
  getCurrent: (conversationId: string) =>
    ipcRenderer.invoke('model:getCurrent', conversationId),
  getAvailable: () =>
    ipcRenderer.invoke('model:getAvailable'),
  switchModel: (conversationId: string, modelId: string) =>
    ipcRenderer.invoke('model:switch', conversationId, modelId),
  getStatus: (modelId: string) =>
    ipcRenderer.invoke('model:getStatus', modelId),
  onSwitched: (callback) => { /* webContents.send listener */ },
},
quickSettings: {
  get: () =>
    ipcRenderer.invoke('quickSettings:get'),
  update: (patch: Partial<QuickSettingsState>) =>
    ipcRenderer.invoke('quickSettings:update', patch),
},
```

**ALLOWED_CHANNELS 注册：** 追加 9 个 invoke 通道 + 1 个 push 事件通道。

#### D6：扩展 EventMap

**文件：** `src/main/services/event-bus.ts`（扩展）

在 `EventMap` 中追加：
```typescript
'conversation:export': { format: ExportFormat; conversationId: string }
'model:switched': { conversationId: string; oldModel: string; newModel: string }
```

---

### 阶段 E：UI 组件 — ExportDialog + modelStore + ModelSwitcher（Step 7-8） — 预计 1.5 天

#### E1：创建 modelStore（Zustand）

**文件：** `src/renderer/store/modelStore.ts`（新建）

**类型定义：**
```typescript
interface ModelInfo {
  id: string
  displayName: string
  provider: string
  available: boolean
  unavailableReason?: string
  costTier: 'low' | 'medium' | 'high'
  isRateLimited: boolean
  rateLimitResetAt?: number
}

interface ModelState {
  models: ModelInfo[]
  currentModelId: string | null
  loading: boolean
  error: string | null
}

interface ModelActions {
  fetchModels: () => Promise<void>
  fetchCurrent: (conversationId: string) => Promise<void>
  switchModel: (conversationId: string, modelId: string) => Promise<void>
  reset: () => void
}
```

**实现要点：**
1. 所有 IPC 调用封装在 action 内部
2. `fetchModels()` 调用 `model.getAvailable()` + `model.getStatus()` 并行
3. `switchModel()` 调用 `model.switchModel()` 后更新 `currentModelId`
4. 使用 `devtools` 中间件便于调试
5. `onSwitched` 事件监听更新 store

#### E2：创建 ExportDialog

**文件：** `src/renderer/components/export/ExportDialog.tsx`（新建）

**Props：**
```typescript
interface ExportDialogProps {
  conversationId: string
  messageCount: number
  onClose: () => void
}
```

**内部状态：**
- `format: ExportFormat`（默认 'markdown'）
- `includeMetadata: boolean`（默认 true）
- `includeReferencedFiles: boolean`（默认 false）
- `applyRedaction: boolean`（默认 true）
- `customRedactionRules: { pattern: string; reason: string }[]`
- `preview: ExportPreview | null`
- `step: 'config' | 'preview' | 'exporting' | 'done'`
- `targetPath: string`
- `loading: boolean`
- `error: string | null`

**三步向导布局：**

| Step | 内容 |
|------|------|
| config | 格式选择（radio：Markdown/JSON/HTML）+ 选项勾选（metadata / referenced files / redaction）+ 自定义脱敏规则区 |
| preview | 消息数量 / 预估大小 / 敏感字段列表 / 引用文件列表 / Plans & Traces 引用提示 |
| exporting | 输出路径选择（dialog.showSaveDialog）+ 进度指示 + 成功/失败反馈 |

**交互流程：**
1. 挂载时 → `export.preview()` → 显示预检信息
2. 用户配置选项 → 点"下一步"→ Step 2
3. 预览确认 → 点"导出"→ `dialog.showSaveDialog()` → `export.execute()` → Step 3
4. 成功 → toast + 打开文件所在目录；失败 → error toast + 保留对话框
5. 取消 → `onClose()`，不写入任何文件

**设计要点：**
- 遵循 ui-ux-design.md 色彩体系（主色 #6366F1）
- 敏感字段列表红色高亮
- 所有按钮有 loading 状态
- 自定义脱敏规则支持动态添加/删除

#### E3：创建 ModelSwitcher

**文件：** `src/renderer/components/header/ModelSwitcher.tsx`（新建）

**Props：** `{ conversationId: string }`

**触发按钮渲染：**
```
[ProviderIcon] 模型名  [成本指示器 🟢/🟡/🔴]  [▾]
```

**下拉菜单：**
- 每行：Provider icon + displayName + 成本指示器
- 不可用模型：`disabled` + tooltip 说明原因（缺 API key / 配额耗尽）
- 限流模型：显示倒计时（`rateLimitResetAt - now`）
- 当前模型 ✓ 标记
- 底部："配置更多模型..." 链接 → 打开设置页 Models 区域

**交互：**
1. 点击触发按钮 → 展开/折叠下拉
2. 选择模型 → `modelStore.switchModel()` → 关闭下拉
3. 点击外部 → 关闭下拉
4. 成本指示器颜色：low=🟢 / medium=🟡 / high=🔴

---

### 阶段 F：QuickSettingsPanel + 命令面板集成（Step 9-10） — 预计 0.5 天

#### F1：创建 QuickSettingsPanel

**文件：** `src/renderer/components/header/QuickSettingsPanel.tsx`（新建）

**Props：** `{ open: boolean; onClose: () => void }`

**设置项列表：**

| 设置项 | 类型 | 交互 |
|--------|------|------|
| 主题 | Toggle（深色/浅色/跟随系统） | 立即切换 |
| 语言 | Toggle（中文/English） | 立即切换 |
| 工作区路径 | 只读文本 | 复制按钮 |
| Trace | Toggle | 立即生效 |
| 记忆系统 | Toggle | 立即生效 |
| "详细设置" | 链接 | 打开设置页 |

**实现：**
1. 挂载时 → `quickSettings.get()` 获取当前状态（无加载延迟）
2. 切换 → `quickSettings.update({ key, value })` → 立即生效
3. 点击外部 → `onClose()`
4. 面板定位：右上角齿轮图标旁，绝对定位

#### F2：命令面板集成 — 导出命令完善

**文件：** `src/main/services/command/builtin-commands/conversation-commands.ts`（扩展）

| 命令 ID | 操作 |
|---------|------|
| `conversation.exportMarkdown` | 升级为完整实现：`eventBus.emit('conversation:export', { format: 'markdown', conversationId })` |
| `conversation.exportJson` | 升级为完整实现：`eventBus.emit('conversation:export', { format: 'json', conversationId })` |
| `conversation.exportHtml` | **新增**：`eventBus.emit('conversation:export', { format: 'html', conversationId })` |
| `conversation.copySelection` | **新增**：`eventBus.emit('conversation:copySelection', { messageIds })` |

#### F3：命令面板集成 — 模型命令

**文件：** `src/main/services/command/builtin-commands/model-commands.ts`（新建）

对每个已配置模型注册一个切换命令：
- `id: model.switch.{modelId}`
- `title: 切换模型：{displayName}`
- `category: 模型`
- `execute: eventBus.emit('model:switch', { conversationId, modelId })`
- 模型列表从配置动态加载

---

### 阶段 G：主进程装配 + 单元测试（Step 11） — 预计 0.5 天

#### G1：主进程初始化

**文件：** `src/main/index.ts`（扩展）

在 `onWorkspaceOpened` 中：
1. 创建 ConversationExporter 实例
2. 注册 Export / Model / QuickSettings IPC Handler
3. 注册 EventBus → Renderer 桥接事件
4. 注册命令面板模型命令

#### G2：Header 集成

**文件：** `src/renderer/components/layout/Header.tsx`（扩展）

在 Header 区域集成 ModelSwitcher + QuickSettingsPanel 触发按钮。

#### G3：单元测试

**文件结构：**
```
tests/export/
├── conversation-exporter.test.ts
├── markdown-renderer.test.ts
├── json-renderer.test.ts
└── html-renderer.test.ts

tests/renderer/
├── model-store.test.ts
```

**conversation-exporter.test.ts 测试用例：**

| # | 用例 | 验证点 |
|---|------|--------|
| 1 | preview returns metadata | 消息数量、预估大小、敏感字段正确 |
| 2 | preview with redaction disabled | detectedSensitiveFields 为空 |
| 3 | preview detects referenced files | 文件引用正则提取正确 |
| 4 | export markdown | 生成合法 Markdown 文件 |
| 5 | export json | 生成合法 JSON，含 version/messages |
| 6 | export html | 生成自包含 HTML，无外部引用 |
| 7 | export with redaction | 敏感字段被替换为 [REDACTED] |
| 8 | export without metadata | 不含时间戳/模型等元数据 |
| 9 | export produces trace span | 产生 conversation.export span |
| 10 | export uses atomic write | 调用 fileManager.writeFile with atomic |
| 11 | copy to clipboard | 格式化消息并写入剪贴板 |
| 12 | export empty conversation | 空对话导出不崩溃 |
| 13 | performance 1000 messages | 1000 条消息导出 < 2s |

**markdown-renderer.test.ts 测试用例：**

| # | 用例 |
|---|------|
| 1 | render with metadata — YAML frontmatter + 消息体 |
| 2 | render without metadata — 直接消息体 |
| 3 | render message roles — user 显示 "You"，assistant 显示 "AI" |
| 4 | render mode labels — 消息包含模式标签 |
| 5 | render trace links — 消息包含 Trace ID |

**json-renderer.test.ts 测试用例：**

| # | 用例 |
|---|------|
| 1 | render valid json — 输出可被 JSON.parse 解析 |
| 2 | render includes version — version: 1 |
| 3 | render includes all messages — 消息数量正确 |
| 4 | render metadata when enabled — 含 model/aiModeId/timestamp |
| 5 | render no metadata when disabled — 仅 id/role/content |

**html-renderer.test.ts 测试用例：**

| # | 用例 |
|---|------|
| 1 | render self-contained — 无外部 CSS/JS 引用 |
| 2 | render valid html — DOCTYPE + html + head + body |
| 3 | render attribution — 包含 "Sibylla" 标注 |
| 4 | escape html in content — `<script>` 被转义 |
| 5 | render basic markdown — bold/code 转换正确 |
| 6 | render message bubbles — user/assistant 不同样式 |

---

## 五、验收标准追踪

### 对话导出

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 用户选择"导出对话 > Markdown/JSON/HTML"时弹出导出对话框 | E2 ExportDialog | 手动验证 |
| 2 | 导出对话框显示预检信息：消息数量、预估大小、敏感字段、引用文件列表 | C1 preview() + E2 Step 2 | G3-1/2/3 |
| 3 | 用户可勾选：包含元数据、包含引用文件、启用脱敏 | E2 Step 1 config | 手动验证 |
| 4 | 用户可添加自定义脱敏规则（regex） | E2 Step 1 + C1 customRedactionRules | 手动验证 |
| 5 | 确认导出后生成文件，使用原子写入 | C1 export() → fileManager.writeFile({atomic}) | G3-10 |
| 6 | Markdown 格式：YAML frontmatter + 消息气泡格式 | B1 MarkdownRenderer | G3-markdown-1/2/3 |
| 7 | JSON 格式：完整消息结构 + mode/model/timestamp + plan/trace ID | B2 JsonRenderer | G3-json-1/2/3/4 |
| 8 | HTML 格式：自包含（CSS 内嵌）+ "此对话由 Sibylla 生成" 标注 | B3 HtmlRenderer | G3-html-1/2/3 |
| 9 | 导出过程产生 `conversation.export` Trace span | C1 export() → tracer.withSpan | G3-9 |
| 10 | 1000 条消息导出 < 2s | C1 ConversationExporter + B1-B3 | G3-13 |
| 11 | 取消导出对话框不写入任何文件 | E2 onClose() → 无 IPC 调用 | 手动验证 |
| 12 | "复制选中消息为 Markdown" 功能 | C1 copyToClipboard() + F2 copySelection | G3-11 |

### 模型切换器

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 模型切换器位于对话输入框上方，显示当前模型名 + Provider 图标 + 成本指示 | E3 ModelSwitcher trigger button | 手动验证 |
| 2 | 点击展开下拉，显示所有已配置模型 | E3 dropdown | 手动验证 |
| 3 | 不可用模型 disabled + tooltip 说明原因 | E3 ModelOption + ModelInfo.unavailableReason | 手动验证 |
| 4 | 选择新模型后，当前对话后续消息使用新模型 | E1 modelStore.switchModel() → D3 model:switch | 手动验证 |
| 5 | 历史消息保留原模型标注 | model:switch 仅更新后续请求，不修改历史 MessageRecord | 架构级保障 |
| 6 | 限流模型显示倒计时，配额重置后自动恢复 | E3 rateLimitResetAt 倒计时 + modelStore 刷新 | 手动验证 |
| 7 | 模型成本差异大时显示成本指示器（绿/黄/红） | E3 CostIndicator component | 手动验证 |
| 8 | "配置更多模型..."链接打开设置页 Models 区域 | E3 dropdown footer | 手动验证 |
| 9 | 切换模型产生 `model.switch` Trace span | D3 model:switch handler → tracer.withSpan | IPC handler 级 |

### 快速设置面板

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 右上角齿轮图标旁打开面板，无加载延迟 | F1 QuickSettingsPanel → quickSettings.get() | 手动验证 |
| 2 | 当前主题切换立即生效 | F1 theme toggle → quickSettings.update | 手动验证 |
| 3 | 当前语言切换 | F1 language toggle | 手动验证 |
| 4 | 当前工作区路径（只读） | F1 workspacePath display | 手动验证 |
| 5 | Trace 开关 | F1 traceEnabled toggle | 手动验证 |
| 6 | 记忆系统开关 | F1 memoryEnabled toggle | 手动验证 |
| 7 | "详细设置"链接 | F1 link → openSettings | 手动验证 |

### IPC 集成

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | Export / Model / QuickSettings IPC 通道注册且类型安全 | D1-D4 + IPCChannelMap | 编译期保障 |
| 2 | Preload API 暴露 export / model / quickSettings 命名空间 | D5 | 编译期保障 |
| 3 | Push Event `model:switched` 正确推送 | D3 handler → webContents.send | 手动验证 |

---

## 六、风险与缓解

| 风险 | 影响 | 概率 | 缓解策略 |
|------|------|------|---------|
| TraceExporter 的 `redactText()` 需新增公共方法，可能影响现有接口 | 高 | 低 | A2 步骤明确：新增 `static redactText()` 方法，不修改现有 `redactSpan()` / `redactAttributes()` 签名，向后兼容 |
| `MessageRecord` 缺少 `model` / `aiModeId` / `planId` 字段 | 高 | 中 | C1 `mapMessageRecord()` 中从 `contextSources` / `traceId` 关联提取；若字段不存在设为 undefined；导出仍可完成但元数据不完整 |
| 工作区外导出路径的原子写入实现 | 中 | 低 | Node.js `fs` 模块：`fs.writeFile(tmpPath)` + `fs.rename(tmpPath, targetPath)` 原子替换 |
| 模型配置来源不明确（无独立模型注册表） | 高 | 中 | 从 AiGatewayClient 或 config 读取已配置模型列表；若 AI Gateway 无模型列表 API，则从配置文件硬编码模型配置（预留扩展点） |
| HTML 渲染器 Markdown 转换不完整 | 低 | 高 | 仅处理 bold/code/code-block/links 四种常见格式，不引入完整 Markdown 解析器；复杂格式保留原文 |
| EventMap 类型扩展可能影响其他模块 | 中 | 低 | 追加事件类型（不修改现有类型），其他模块不受影响 |
| 1000 条消息导出性能瓶颈 | 中 | 低 | 内存中完成渲染（无 I/O 中间步骤），仅最后一次原子写入；预估 < 2s；若超时考虑流式渲染 |
| 导出文件名冲突 | 低 | 中 | `dialog.showSaveDialog()` 让用户确认路径；自动追加序号避免覆盖 |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 | 关键里程碑 |
|----|------|--------|-----------|
| Day 1 上午 | A1-A3 | types.ts + TraceExporter.redactText() + index.ts | 类型基础就绪 |
| Day 1 下午 | B1-B3 | MarkdownRenderer + JsonRenderer + HtmlRenderer | 三种格式渲染完成 |
| Day 2 上午 | C1 | ConversationExporter 核心实现 | 导出核心逻辑完成 |
| Day 2 下午 | D1-D6 | shared/types + 3 个 IPC Handler + Preload + EventMap | 全部 IPC 通道打通 |
| Day 3 上午 | E1-E2 | modelStore + ExportDialog | 导出 UI 完成 |
| Day 3 下午 | E3 + F1 | ModelSwitcher + QuickSettingsPanel | 模型切换 + 快速设置 UI 完成 |
| Day 4 上午 | F2-F3 + G1-G2 | 命令集成 + 主进程装配 + Header 集成 | 端到端集成完成 |
| Day 4 下午 | G3 | 全部单元测试 | 测试通过 |
| Day 5 | — | 集成验证 + 修复 + 性能测试 | 验收通过 |

---

**文档版本**: v1.0
**最后更新**: 2026-04-22
**维护者**: Sibylla 架构团队
