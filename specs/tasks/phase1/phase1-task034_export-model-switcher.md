# 对话导出与模型快速切换

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK034 |
| **任务标题** | 对话导出与模型快速切换 |
| **所属阶段** | Phase 1 - AI 模式系统、Plan 产物、Wiki 与能力整合 (Sprint 3.4) |
| **优先级** | P1 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

交付 Sprint 3.4 的两项 P1 用户级功能：(1) 对话导出——支持 Markdown / JSON / HTML 三种格式导出对话，复用 TraceExporter 的脱敏规则自动保护敏感信息；(2) 模型快速切换——对话输入框上方的下拉切换器，让用户在对话中途切换 AI 模型，历史消息保留原模型标注。同时实现快速设置面板。

### 背景

TASK029 已实现 TraceExporter（含 RedactionRule 和脱敏逻辑），TASK032 已实现命令面板框架。本任务将 TraceExporter 的脱敏能力复用到对话导出场景，并在命令面板中注册导出和模型切换命令。

**核心设计约束：**

- **脱敏复用**（需求 3.4.8）：对话导出直接复用 `TraceExporter` 的 `RedactionRule` 和 `scanRedaction` / `redactContent` 方法，不创建独立的 Redactor
- **模型切换仅影响后续消息**：切换模型后，当前对话的后续 AI 响应使用新模型，历史消息保留原模型元数据
- **文件即真相**（CLAUDE.md）：导出结果是人类可读的文件（Markdown/HTML）或机器可读的结构（JSON）
- **原子写入**：导出文件使用 `fileManager.atomicWrite()` 写入
- **性能要求**：1000 条消息导出 < 2s

**现有代码关键约束：**

| 维度 | 现状 | TASK034 改造 |
|------|------|-------------|
| TraceExporter | Sprint 3.3 已实现 RedactionRule + scanRedaction + redactContent | ConversationExporter 直接委托 TraceExporter 做脱敏 |
| CommandRegistry | TASK032 已注册导出/模型命令框架 | 升级为完整实现 |
| AIHandler | `ai.handler.ts` — 传递 model 参数 | 支持从 ConversationService 读取当前模型 |
| AiGatewayClient | `ai-gateway-client.ts` — 支持不同 model | 切换后 request.model 使用新模型 ID |

### 范围

**包含：**
- `services/export/types.ts` — ExportOptions / ExportPreview / ExportFormat
- `services/export/conversation-exporter.ts` — ConversationExporter 主类
- `services/export/markdown-renderer.ts` — Markdown 格式渲染
- `services/export/json-renderer.ts` — JSON 格式渲染
- `services/export/html-renderer.ts` — HTML 格式渲染（自包含）
- `services/export/index.ts` — 统一导出
- `ipc/handlers/export.ts` — IPC 通道注册
- `shared/types.ts` 扩展 — Export IPC 通道常量
- `preload/index.ts` 扩展 — export 命名空间
- `renderer/components/export/ExportDialog.tsx` — 导出对话框
- `renderer/components/header/ModelSwitcher.tsx` — 模型切换下拉
- `renderer/components/header/QuickSettingsPanel.tsx` — 快速设置面板
- `renderer/store/modelStore.ts` — Zustand 模型状态管理
- 命令面板导出/模型命令完善
- 单元测试

**不包含：**
- 云端对话同步导出（Phase 2）
- 对话加密导出（未来扩展）
- 更多导出格式（PDF 等）

## 验收标准

### 对话导出

- [ ] 用户选择"导出对话 > Markdown/JSON/HTML"时弹出导出对话框
- [ ] 导出对话框显示预检信息：消息数量、预估大小、检测到的敏感字段、引用文件列表
- [ ] 用户可勾选：包含元数据、包含引用文件内容、启用脱敏
- [ ] 用户可添加自定义脱敏规则（regex）
- [ ] 确认导出后生成文件，使用原子写入
- [ ] Markdown 格式：YAML frontmatter（标题/时间/消息数/版本）+ 消息气泡格式
- [ ] JSON 格式：完整消息结构、每条消息的 mode/model/timestamp、关联 plan/trace ID
- [ ] HTML 格式：自包含（CSS 内嵌），无需 Sibylla 即可查看，含"此对话由 Sibylla 生成"标注
- [ ] 导出过程产生 `conversation.export` Trace span
- [ ] 1000 条消息导出 < 2s
- [ ] 取消导出对话框不写入任何文件
- [ ] "复制选中消息为 Markdown"功能，格式化并复制到剪贴板

### 模型切换器

- [ ] 模型切换器位于对话输入框上方，显示当前模型名 + Provider 图标 + 成本指示
- [ ] 点击展开下拉，显示所有已配置模型（名称、Provider、可用状态）
- [ ] 不可用模型 disabled + tooltip 说明原因（缺 API key / 配额耗尽）
- [ ] 选择新模型后，当前对话后续消息使用新模型
- [ ] 历史消息保留原模型标注（消息元数据中 model 字段不变）
- [ ] 限流模型显示倒计时，配额重置后自动恢复
- [ ] 模型成本差异大时显示成本指示器（绿/黄/红）
- [ ] "配置更多模型..."链接打开设置页 Models 区域
- [ ] 切换模型产生 `model.switch` Trace span

### 快速设置面板

- [ ] 右上角齿轮图标旁打开面板，显示当前状态无加载延迟
- [ ] 当前主题（深色/浅色）切换立即生效
- [ ] 当前语言切换
- [ ] 当前工作区路径（只读）
- [ ] Trace 开关
- [ ] 记忆系统开关
- [ ] "详细设置"链接

### IPC 集成

- [ ] Export / Model / QuickSettings IPC 通道注册且类型安全
- [ ] Preload API 暴露 export / model / quickSettings 命名空间

## 依赖关系

### 前置依赖

- [x] TASK029 — 可观测性 UI（TraceExporter 的 RedactionRule + 脱敏逻辑）
- [x] TASK030 — AI 模式系统（消息中 aiModeId 元数据）
- [x] TASK031 — Plan 模式（导出时引用 Plan 内容）
- [x] TASK032 — 命令面板（CommandRegistry + 导出/模型命令框架）
- [x] FileManager（atomicWrite）

### 被依赖任务

- 无（Sprint 3.4 的最终交付任务）

## 参考文档

- [`specs/requirements/phase1/sprint3.4-mode.md`](../../requirements/phase1/sprint3.4-mode.md) — 需求 3.4.8 + 3.4.9
- [`specs/design/ui-ux-design.md`](../../design/ui-ux-design.md) — 色彩体系、交互规范
- [`CLAUDE.md`](../../../CLAUDE.md) — 文件即真相、原子写入、AI 建议/人类决策
- `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` — IPC 类型安全设计
- `.kilocode/skills/phase1/zustand-state-management/SKILL.md` — Zustand store 设计

## 技术执行路径

### 架构设计

```
Export + Model Switcher 整体架构

src/main/services/
├── export/                              ← 对话导出服务（新建目录）
│   ├── types.ts                         ← ExportOptions / ExportPreview
│   ├── conversation-exporter.ts         ← 导出主类（委托 TraceExporter 脱敏）
│   ├── markdown-renderer.ts             ← Markdown 格式渲染
│   ├── json-renderer.ts                 ← JSON 格式渲染
│   ├── html-renderer.ts                 ← HTML 格式渲染（自包含）
│   └── index.ts                         ← 统一导出
│
├── ipc/handlers/
│   └── export.ts                        ← IPC: 导出预检/导出/复制（新建）
│
└── (现有模块扩展)
    ├── command/builtin-commands/        ← 导出/模型命令完善
    └── shared/types.ts                  ← IPC 通道常量 + 类型扩展

src/renderer/
├── store/
│   └── modelStore.ts                    ← Zustand 模型状态（新建）
│
├── components/
│   ├── export/
│   │   └── ExportDialog.tsx             ← 导出对话框（新建）
│   └── header/
│       ├── ModelSwitcher.tsx            ← 模型切换下拉（新建）
│       └── QuickSettingsPanel.tsx       ← 快速设置面板（新建）

数据流向：

对话导出：
  用户点击"导出对话 > Markdown"
    → ExportDialog 打开
    → IPC export:preview → ConversationExporter.preview()
      → 获取对话数据
      → 调用 TraceExporter.scanRedaction() 扫描敏感字段
      → 提取引用文件列表
      → 返回 ExportPreview
    → 用户配置选项 → 确认导出
    → IPC export:export → ConversationExporter.export()
      → Tracer.withSpan('conversation.export', ...)
      → 获取对话数据
      → 若启用脱敏 → TraceExporter.redactContent()
      → 按格式调用 renderer（Markdown/JSON/HTML）
      → fileManager.atomicWrite(targetPath, content)
    → 返回成功 → 关闭对话框 → 显示成功通知

模型切换：
  用户点击 ModelSwitcher
    → 下拉展开 → 显示所有已配置模型
    → 用户选择新模型
    → IPC model:switch → 更新当前对话的模型配置
    → 发送消息时 AIHandler 使用新模型 ID
    → 消息元数据记录 model 字段

快速设置：
  用户点击齿轮图标旁
    → QuickSettingsPanel 打开
    → 显示当前设置状态（从 configStore 读取）
    → 用户切换开关 → IPC 调用 → 立即生效
```

### 步骤 1：定义 Export 共享类型

**文件：** `src/main/services/export/types.ts`

1. 定义 `ExportFormat` 联合类型：
   ```typescript
   export type ExportFormat = 'markdown' | 'json' | 'html'
   ```

2. 定义 `ExportOptions` 接口：
   ```typescript
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
   ```

3. 定义 `SensitiveField` 接口：
   ```typescript
   export interface SensitiveField {
     path: string
     rule: string
     sample: string
   }
   ```

4. 定义 `ExportPreview` 接口：
   ```typescript
   export interface ExportPreview {
     estimatedSizeBytes: number
     messageCount: number
     detectedSensitiveFields: SensitiveField[]
     referencedFiles: string[]
     hasPlans: boolean
     hasTraces: boolean
   }
   ```

5. 定义 `ConversationMessage` 接口（导出用消息结构）：
   ```typescript
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
   ```

6. 定义 `ConversationData` 接口（导出用对话结构）：
   ```typescript
   export interface ConversationData {
     id: string
     title: string
     messages: ConversationMessage[]
     createdAt: string
     updatedAt: string
   }
   ```

7. 导出所有类型

### 步骤 2：实现 ConversationExporter 核心

**文件：** `src/main/services/export/conversation-exporter.ts`

1. 构造函数注入：
   ```typescript
   constructor(
     private fileManager: FileManager,
     private traceExporter: TraceExporter,
     private planManager: PlanManager | null,
     private tracer: Tracer,
     private logger: Logger
   )
   ```

2. 实现 `preview(conversationId: string, options: ExportOptions): Promise<ExportPreview>` 方法：
   - 获取对话数据：`const conversation = await this.loadConversation(conversationId)`
   - 计算预估大小：`estimatedSizeBytes = this.estimateSize(conversation, options)`
   - 扫描敏感字段（复用 TraceExporter）：
     ```typescript
     const allContent = conversation.messages.map(m => m.content).join('\n')
     const detected = options.applyRedaction
       ? this.traceExporter.scanRedaction(allContent, options.customRedactionRules ?? [])
       : []
     ```
   - 提取引用文件：`const referencedFiles = this.extractReferencedFiles(conversation)`
   - 检查是否包含 Plans/Traces：
     ```typescript
     const hasPlans = conversation.messages.some(m => m.planId)
     const hasTraces = conversation.messages.some(m => m.traceId)
     ```
   - 返回 `{ estimatedSizeBytes, messageCount, detectedSensitiveFields, referencedFiles, hasPlans, hasTraces }`

3. 实现 `export(conversationId: string, options: ExportOptions): Promise<void>` 方法：
   - 包裹在 `tracer.withSpan('conversation.export', async (span) => { ... }, { kind: 'user-action' })` 中
   - 获取对话数据
   - 脱敏处理（可选）：
     ```typescript
     let data = conversation
     if (options.applyRedaction) {
       data = await this.redactConversation(conversation, options.customRedactionRules ?? [])
     }
     ```
   - span.setAttributes：export.format、export.message_count、export.redaction_applied
   - 按格式分发：
     ```typescript
     let content: string
     switch (options.format) {
       case 'markdown': content = this.markdownRenderer.render(data, options); break
       case 'json': content = this.jsonRenderer.render(data, options); break
       case 'html': content = this.htmlRenderer.render(data, options); break
     }
     ```
   - `await this.fileManager.atomicWrite(options.targetPath, content)`

4. 实现 `redactConversation(data, rules)` 私有方法：
   - 遍历 messages，对每条消息的 content 调用 `this.traceExporter.redactContent(content, rules)`
   - 返回脱敏后的 ConversationData（深拷贝后修改）

5. 实现 `loadConversation(id)` 私有方法：
   - 从现有 ConversationService 或 Store 获取对话数据
   - 转换为 ConversationData 结构

6. 实现 `estimateSize(conversation, options)` 私有方法：
   - 基础：所有消息 content 长度之和
   - 若 includeMetadata：加上元数据开销
   - 若 includeReferencedFiles：加上引用文件大小估算

7. 实现 `extractReferencedFiles(conversation)` 私有方法：
   - 从消息内容中正则提取文件路径引用（`@file:xxx`、`` `path/to/file` `` 等）
   - 去重后返回

8. 实现 `copyToClipboard(messageIds: string[], format: 'markdown'): Promise<string>` 方法：
   - 获取指定消息
   - 调用 `markdownRenderer.renderMessages(messages, { includeMetadata: false })`
   - 写入系统剪贴板
   - 返回格式化后的文本

### 步骤 3：实现 Markdown 渲染器

**文件：** `src/main/services/export/markdown-renderer.ts`

1. 实现 `render(data: ConversationData, options: ExportOptions): string` 方法：
   - 头部（options.includeMetadata 时）：
     ```markdown
     ---
     title: {data.title}
     exported_at: {ISO timestamp}
     message_count: {data.messages.length}
     sibylla_version: {app version}
     ---

     # {data.title}
     ```
   - 消息体：遍历 messages 调用 `renderMessage(msg, options)`
   - 消息间用 `---` 分隔

2. 实现 `renderMessage(msg: ConversationMessage, options: ExportOptions): string` 私有方法：
   - role 标签：`msg.role === 'user' ? '**You**' : '**AI**'`
   - 模式标签（includeMetadata）：`(Plan)` / `(Analyze)` 等
   - 时间戳（includeMetadata）：`_[2026-04-22 14:30:00]_`
   - 内容：直接输出 msg.content（已脱敏）
   - Trace 链接（includeMetadata）：`Trace: {msg.traceId}`

3. 实现 `renderMessages(messages: ConversationMessage[], options): string` 方法：
   - 仅渲染指定消息子集，用于剪贴板复制

### 步骤 4：实现 JSON 渲染器

**文件：** `src/main/services/export/json-renderer.ts`

1. 实现 `render(data: ConversationData, options: ExportOptions): string` 方法：
   - 构建导出对象：
     ```typescript
     const exportObj = {
       version: 1,
       exportedAt: new Date().toISOString(),
       sibyllaVersion: app.getVersion(),
       conversation: {
         id: data.id,
         title: data.title,
         createdAt: data.createdAt,
         updatedAt: data.updatedAt,
         messages: data.messages.map(msg => ({
           id: msg.id,
           role: msg.role,
           content: msg.content,
           ...(options.includeMetadata ? {
             createdAt: msg.createdAt,
             model: msg.model,
             aiModeId: msg.aiModeId,
             traceId: msg.traceId,
             planId: msg.planId,
           } : {})
         }))
       }
     }
     ```
   - `return JSON.stringify(exportObj, null, 2)`

### 步骤 5：实现 HTML 渲染器

**文件：** `src/main/services/export/html-renderer.ts`

1. 实现 `render(data: ConversationData, options: ExportOptions): string` 方法：
   - 生成自包含 HTML 文件
   - 结构：
     ```html
     <!DOCTYPE html>
     <html lang="{language}">
     <head>
       <meta charset="UTF-8">
       <title>{title} — Sibylla Export</title>
       <style>{INLINE_CSS}</style>
     </head>
     <body>
       <div class="container">
         <header>
           <h1>{title}</h1>
           <div class="meta">导出于 {timestamp} | {messageCount} 条消息</div>
         </header>
         <div class="messages">
           {每条消息的 HTML}
         </div>
         <footer>
           <p class="attribution">此对话由 <strong>Sibylla</strong> 生成</p>
         </footer>
       </div>
     </body>
     </html>
     ```

2. 定义 `INLINE_CSS` 常量：
   - 简洁的对话样式：user/assistant 消息气泡不同背景色
   - 响应式布局（max-width 800px）
   - 代码块样式
   - 无外部引用

3. 实现 `renderMessage(msg: ConversationMessage, options: ExportOptions): string` 私有方法：
   - user 消息：蓝色背景右对齐气泡
   - assistant 消息：灰色背景左对齐气泡
   - 头部标签：角色 + 模式 + 时间
   - 内容：转义 HTML + Markdown 基本渲染（加粗、代码块、链接）

4. 实现 `escapeHtml(text: string): string` 私有方法：
   - 替换 `&` `<` `>` `"` `'` 为 HTML entities

5. 实现 `renderBasicMarkdown(text: string): string` 私有方法：
   - 简易 Markdown → HTML 转换（**bold**、`` `code` ``、```code block```、[links]）
   - 不引入完整 Markdown 解析器，仅处理常见格式

### 步骤 6：统一导出 + shared/types 扩展 + IPC + Preload

**文件：** `src/main/services/export/index.ts`

1. 从 `types.ts` 导出所有类型
2. 从 `conversation-exporter.ts` 导出 `ConversationExporter`

**文件：** `src/shared/types.ts`（扩展）

3. 追加 Export IPC 通道：
   ```
   EXPORT_PREVIEW: 'export:preview'
   EXPORT_EXECUTE: 'export:execute'
   EXPORT_COPY_CLIPBOARD: 'export:copyClipboard'
   ```

4. 追加 Model IPC 通道：
   ```
   MODEL_GET_CURRENT: 'model:getCurrent'
   MODEL_GET_AVAILABLE: 'model:getAvailable'
   MODEL_SWITCH: 'model:switch'
   MODEL_GET_STATUS: 'model:getStatus'
   ```

5. 追加 QuickSettings IPC 通道：
   ```
   QUICK_SETTINGS_GET: 'quickSettings:get'
   QUICK_SETTINGS_UPDATE: 'quickSettings:update'
   ```

6. 追加 IPCChannelMap 类型映射

**文件：** `src/main/ipc/handlers/export.ts`（新建）

7. 注册 `EXPORT_PREVIEW`：`conversationExporter.preview(conversationId, options)`
8. 注册 `EXPORT_EXECUTE`：`conversationExporter.export(conversationId, options)`
9. 注册 `EXPORT_COPY_CLIPBOARD`：`conversationExporter.copyToClipboard(messageIds, format)`
10. 注册 `MODEL_GET_CURRENT`：返回当前对话的模型配置
11. 注册 `MODEL_GET_AVAILABLE`：返回所有已配置模型列表
12. 注册 `MODEL_SWITCH`：切换当前对话的模型
13. 注册 `MODEL_GET_STATUS`：返回模型可用状态
14. 注册 `QUICK_SETTINGS_GET`：返回所有快速设置项
15. 注册 `QUICK_SETTINGS_UPDATE`：更新指定设置项

**文件：** `src/preload/index.ts`（扩展）

16. 新增 `export` 对象：
    ```typescript
    export: {
      preview: (conversationId: string, options: ExportOptions) =>
        ipcRenderer.invoke('export:preview', conversationId, options),
      execute: (conversationId: string, options: ExportOptions) =>
        ipcRenderer.invoke('export:execute', conversationId, options),
      copyToClipboard: (messageIds: string[], format: string) =>
        ipcRenderer.invoke('export:copyClipboard', messageIds, format),
    }
    ```

17. 新增 `model` 对象：
    ```typescript
    model: {
      getCurrent: (conversationId: string) =>
        ipcRenderer.invoke('model:getCurrent', conversationId),
      getAvailable: () =>
        ipcRenderer.invoke('model:getAvailable'),
      switchModel: (conversationId: string, modelId: string) =>
        ipcRenderer.invoke('model:switch', conversationId, modelId),
      getStatus: (modelId: string) =>
        ipcRenderer.invoke('model:getStatus', modelId),
    }
    ```

### 步骤 7：实现 ExportDialog UI

**文件：** `src/renderer/components/export/ExportDialog.tsx`（新建）

1. Props 接口：
   ```typescript
   interface ExportDialogProps {
     conversationId: string
     messageCount: number
     onClose: () => void
   }
   ```

2. 内部状态：
   - `format: ExportFormat`（默认 'markdown'）
   - `includeMetadata: boolean`（默认 true）
   - `includeReferencedFiles: boolean`（默认 false）
   - `applyRedaction: boolean`（默认 true）
   - `preview: ExportPreview | null`
   - `loading: boolean`
   - `step: 'config' | 'preview' | 'exporting' | 'done'`

3. 挂载时获取预检信息：
   ```typescript
   useEffect(() => {
     const p = await window.sibylla.export.preview(conversationId, { ...options, targetPath: '' })
     setPreview(p)
   }, [conversationId])
   ```

4. 渲染布局（三步向导）：
   - **Step 1 - 配置**：
     - 格式选择：Markdown / JSON / HTML（radio group）
     - 选项勾选：包含元数据、包含引用文件、启用脱敏
     - 自定义脱敏规则输入区（动态添加 regex）
   - **Step 2 - 预检**：
     - 消息数量
     - 预估文件大小
     - 敏感字段列表（每条显示 path + rule）
     - 引用文件列表
     - 若有 Plans/Traces 引用 → 提示
   - **Step 3 - 执行**：
     - 选择输出路径（文件选择器）
     - 进度指示
     - 成功/失败反馈

5. 操作按钮：
   - [取消] → `onClose()`
   - [上一步] → step 回退
   - [下一步 / 导出] → 推进 step

6. 导出执行：
   - `await window.sibylla.export.execute(conversationId, { ...options, targetPath })`
   - 成功 → toast 通知 + 打开文件所在目录
   - 失败 → error toast + 保留对话框

### 步骤 8：实现 ModelSwitcher UI + modelStore

**文件：** `src/renderer/store/modelStore.ts`（新建）

1. 定义 `ModelInfo` 接口：
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
   ```

2. 定义 `ModelState` 接口：
   ```typescript
   interface ModelState {
     models: ModelInfo[]
     currentModelId: string | null
     loading: boolean
   }
   ```

3. 定义 `ModelActions` 接口：
   ```typescript
   interface ModelActions {
     fetchModels: () => Promise<void>
     fetchCurrent: (conversationId: string) => Promise<void>
     switchModel: (conversationId: string, modelId: string) => Promise<void>
   }
   ```

4. 创建 `useModelStore`
5. 实现 `fetchModels`：`window.sibylla.model.getAvailable()`
6. 实现 `fetchCurrent`：`window.sibylla.model.getCurrent(conversationId)`
7. 实现 `switchModel`：
   ```typescript
   await window.sibylla.model.switchModel(conversationId, modelId)
   set({ currentModelId: modelId })
   ```

**文件：** `src/renderer/components/header/ModelSwitcher.tsx`（新建）

8. Props：`{ conversationId: string }`
9. 使用 `useModelStore`
10. 渲染触发按钮：
    - Provider 图标 + 模型名 + 成本指示器（🟢/🟡/🔴）
    - 下拉箭头
11. 下拉菜单：
    - 每个模型一行：Provider icon + displayName + 成本指示
    - 不可用模型：disabled + tooltip 说明原因
    - 限流模型：显示倒计时
    - 当前模型 ✓ 标记
    - 底部："配置更多模型..." 链接 → 打开设置页
12. 选择后调用 `modelStore.switchModel()`
13. 切换产生 `model.switch` Trace span（在 IPC handler 侧）

### 步骤 9：实现 QuickSettingsPanel

**文件：** `src/renderer/components/header/QuickSettingsPanel.tsx`（新建）

1. Props：`{ open: boolean; onClose: () => void }`
2. 挂载时从 IPC 获取当前设置：`window.sibylla.quickSettings.get()`
3. 渲染设置项列表：
   - 主题：深色/浅色切换（Toggle）
   - 语言：中文/English 切换
   - 工作区路径：只读文本
   - Trace：开关（Toggle）
   - 记忆系统：开关（Toggle）
   - "详细设置"链接
4. 切换立即调用 `window.sibylla.quickSettings.update({ key, value })`
5. 点击外部关闭

### 步骤 10：命令面板导出/模型命令完善

**文件：** `src/main/services/command/builtin-commands/conversation-commands.ts`（扩展 TASK032 框架）

1. 将 `conversation.exportMarkdown` 升级为完整实现：
   - execute: `eventBus.emit('conversation:export', { format: 'markdown', conversationId: getCurrentConversationId() })`
2. 将 `conversation.exportJson` 升级：
   - execute: `eventBus.emit('conversation:export', { format: 'json', conversationId: getCurrentConversationId() })`
3. 新增 `conversation.exportHtml` 命令：
   - id: `conversation.exportHtml`
   - title: "导出当前对话为 HTML"
   - category: "对话"
   - execute: `eventBus.emit('conversation:export', { format: 'html' })`
4. 新增 `conversation.copySelection` 命令：
   - id: `conversation.copySelection`
   - title: "复制选中消息为 Markdown"
   - category: "对话"
   - predicate: `() => hasSelectedMessages()`

**文件：** `src/main/services/command/builtin-commands/` — 新增模型命令

5. 新增 `model-commands.ts`，注册模型切换命令：
   - 对每个已配置模型注册一个切换命令
   - id: `model.switch.{modelId}`
   - title: `切换模型：{displayName}`
   - category: "模型"
   - execute: `eventBus.emit('model:switch', { modelId })`

### 步骤 11：主进程初始化与装配

**文件：** `src/main/index.ts`（扩展）

1. 在 `onWorkspaceOpened` 中创建 ConversationExporter：
   ```typescript
   const conversationExporter = new ConversationExporter(
     fileManager, traceExporter, planManager, tracer, logger
   )
   ```

2. 注册 Export IPC Handler：
   ```typescript
   registerExportHandlers(ipcMain, conversationExporter, aiGateway, configManager, logger)
   ```

3. 注册 EventBus → Renderer 导出事件桥接：
   ```typescript
   appEventBus.on('conversation:export', (opts) => mainWindow.webContents.send('conversation:export-request', opts))
   ```

4. 注入 ModelSwitcher 相关的模型配置读取：
   - `model:getCurrent` handler 从 configManager + conversationService 获取
   - `model:getAvailable` handler 从 configManager 读取已配置模型列表
   - `model:switch` handler 更新 conversationService 中的当前模型

5. 在 `onWorkspaceClosed` 中清理

## 测试计划

### 单元测试文件结构

```
tests/export/
├── conversation-exporter.test.ts       ← 导出核心逻辑测试
├── markdown-renderer.test.ts           ← Markdown 渲染测试
├── json-renderer.test.ts               ← JSON 渲染测试
└── html-renderer.test.ts               ← HTML 渲染测试

tests/renderer/
├── export-dialog.test.tsx              ← ExportDialog 组件测试
├── model-switcher.test.tsx             ← ModelSwitcher 组件测试
└── model-store.test.ts                 ← modelStore 测试
```

### conversation-exporter.test.ts 测试用例

1. **preview returns metadata** — 返回消息数量、预估大小、敏感字段
2. **preview with redaction disabled** — applyRedaction=false 时 detectedSensitiveFields 为空
3. **preview detects referenced files** — 消息中的文件引用被正确提取
4. **export markdown** — 生成合法 Markdown 文件
5. **export json** — 生成合法 JSON，含 version/messages/metadata
6. **export html** — 生成自包含 HTML，无外部引用
7. **export with redaction** — 敏感字段被替换为 [REDACTED]
8. **export without metadata** — 不含时间戳/模型/模式等元数据
9. **export produces trace span** — 产生 conversation.export span
10. **export uses atomic write** — 调用 fileManager.atomicWrite
11. **copy to clipboard** — 格式化消息并写入剪贴板
12. **export empty conversation** — 空对话导出不崩溃
13. **performance 1000 messages** — 1000 条消息导出 < 2s

### markdown-renderer.test.ts 测试用例

1. **render with metadata** — YAML frontmatter + 消息体
2. **render without metadata** — 无 frontmatter，直接消息体
3. **render message roles** — user 显示 "You"，assistant 显示 "AI"
4. **render mode labels** — 消息包含模式标签
5. **render trace links** — 消息包含 Trace ID

### json-renderer.test.ts 测试用例

1. **render valid json** — 输出可被 JSON.parse 解析
2. **render includes version** — version: 1
3. **render includes all messages** — 消息数量正确
4. **render metadata when enabled** — 每条消息含 model/aiModeId/timestamp
5. **render no metadata when disabled** — 仅 id/role/content

### html-renderer.test.ts 测试用例

1. **render self-contained** — 无外部 CSS/JS 引用
2. **render valid html** — DOCTYPE + html + head + body 结构
3. **render attribution** — 包含 "Sibylla" 标注
4. **escape html in content** — 消息中的 `<script>` 被转义
5. **render basic markdown** — **bold** 和 `code` 转换正确
6. **render message bubbles** — user/assistant 不同样式

### model-switcher.test.tsx 测试用例

1. **shows current model** — 显示当前模型名
2. **opens dropdown on click** — 点击展开下拉
3. **lists available models** — 列出所有已配置模型
4. **disables unavailable model** — 不可用模型 disabled
5. **shows cost indicator** — 模型旁显示成本指示
6. **switches model on select** — 选择后调用 switchModel
7. **shows rate limit countdown** — 限流模型显示倒计时
