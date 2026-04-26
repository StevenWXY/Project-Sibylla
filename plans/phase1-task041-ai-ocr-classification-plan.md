# PHASE1-TASK041: AI OCR 与结构化分类 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task041_ai-ocr-classification.md](../specs/tasks/phase1/phase1-task041_ai-ocr-classification.md)
> 创建日期：2026-04-24
> 最后更新：2026-04-24

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK041 |
| **任务标题** | AI OCR 与结构化分类 |
| **所属阶段** | Phase 1 - 迁移、导入与 MCP 集成 (Sprint 3.6) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | TASK040 (导入管道) + TASK011 (AI 对话) + TASK012 (上下文引擎) |

### 1.1 目标

构建 Sprint 3.6 的 AI 智能导入增强层——OcrEngine（tesseract.js 封装）、AiClassifier（调用现有 AiGatewayClient）、以及集成两者的 PdfAdapter。让用户导入的 PDF/扫描件能被 OCR 识别文本、被 AI 自动分类到合适目录，实现"把纸质文档倒入 Sibylla，AI 帮你整理"的体验。

### 1.2 核心设计约束

| 约束 | 来源 | 说明 |
|------|------|------|
| 本地优先 | CLAUDE.md §二 | OCR 默认使用 tesseract.js，不向云端发送文件内容 |
| AI 建议，人类决策 | CLAUDE.md §二 | AI 分类建议需用户确认才写入 |
| 渐进增强 | task spec §核心设计约束 | PdfAdapter 作为 TASK040 ImportAdapter 新增适配器注册 |
| 复用 AI 基础设施 | task spec §核心设计约束 | AiClassifier 调用现有 AiGatewayClient + PromptComposer |
| TS 严格模式禁止 any | CLAUDE.md §四 | 全部代码遵循 TypeScript 严格模式 |
| 进程隔离 | CLAUDE.md §三 | 文件系统访问仅在主进程，渲染进程通过 IPC 通信 |
| 等待超 2 秒需进度反馈 | CLAUDE.md §六 | OCR 每页约 3 秒，必须显示进度 |
| 原子写入 | CLAUDE.md §六 | 先写临时文件再原子替换 |

### 1.3 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| OCR + 分类类型 | `src/main/services/import/types.ts`（扩展） | OcrOptions/OcrResult/ClassificationResult 等 |
| OCR 引擎 | `src/main/services/import/ocr-engine.ts` | OcrEngine 统一入口 |
| Tesseract 提供者 | `src/main/services/import/tesseract-ocr-provider.ts` | tesseract.js 实现 |
| AI 分类器 | `src/main/services/import/ai-classifier.ts` | AiClassifier 分类逻辑 |
| PDF 适配器 | `src/main/services/import/adapters/pdf-adapter.ts` | 集成 OcrEngine + AiClassifier |
| 分类 prompt | `resources/prompts/import/classify.md` | 分类 prompt 模板 |
| 分类确认 UI | `src/renderer/components/import/ClassificationConfirmPanel.tsx` | 分类确认面板 |
| IPC 通道扩展 | `src/main/ipc/handlers/import-pipeline.ts`（修改） | 分类确认 IPC |
| Preload API 扩展 | `src/preload/index.ts`（修改） | 分类确认方法暴露 |
| Shared Types 扩展 | `src/shared/types.ts`（修改） | 新增 IPC 通道常量 |
| 适配器注册 | `src/main/services/import/adapters/index.ts`（修改） | 导出 + 注册 PdfAdapter |
| ImportManager 改造 | `src/main/services/import-manager.ts`（修改） | convertPdfToMarkdown 委托 |
| 单元测试 | `tests/main/services/import/*.test.ts` | 覆盖率 ≥ 80% |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；文件即真相；AI 建议/人类决策；本地优先；原子写入；进程隔离 | 全局约束 |
| `specs/design/architecture.md` | AI 模型网关接口；上下文引擎架构 | AiClassifier 调用链路 |
| `specs/requirements/phase1/sprint3.6-MCP.md` | 需求 2.2（AI 结构化与 OCR）；§1.3（兼容性约束）；§6.2（架构决策） | 验收标准 + 架构约束 |
| `specs/tasks/phase1/phase1-task041_ai-ocr-classification.md` | 8 步执行路径、完整验收标准、依赖库选型、IPC 通道设计 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `electron-ipc-patterns` | 分类确认 IPC 双向通信；Preload API 安全暴露；progress 推送 | import-pipeline.ts 扩展 + preload + types |
| `ai-context-engine` | PromptComposer 调用方式；ComposeContext 构造；分类 prompt 注入 | ai-classifier.ts 构建分类 prompt |
| `typescript-strict-mode` | OcrOptions/OcrResult/ClassificationResult 严格类型；OcrProvider 策略模式泛型；AsyncIterable 类型 | types.ts + 全部 TS 文件 |

### 2.3 前置代码依赖

| 模块 | 文件 | 复用方式 |
|------|------|---------|
| `ImportAdapter` 接口 | `src/main/services/import/types.ts` | PdfAdapter 实现此接口 |
| `ImportPlan` / `ImportItem` | `src/main/services/import/types.ts` | 扩展 classification/ocrConfidence 字段 |
| `ImportPipelineOptions` | `src/main/services/import/types.ts` | 扩展 enableOcr/enableClassification 字段 |
| `ImportRegistry` | `src/main/services/import/import-registry.ts` | 注册 PdfAdapter |
| `ImportPipeline` | `src/main/services/import/import-pipeline.ts` | PdfAdapter 被管道调用 |
| `ImportPipelineHandler` | `src/main/ipc/handlers/import-pipeline.ts` | 扩展分类确认 IPC 通道 |
| `AiGatewayClient` | `src/main/services/ai-gateway-client.ts` | AiClassifier 通过 `chat()` 非流式调用 |
| `PromptComposer` | `src/main/services/context-engine/PromptComposer.ts` | AiClassifier 通过 `compose()` 注入分类 prompt |
| `ComposeContext` | `src/main/services/context-engine/types.ts` | 构造分类请求上下文 |
| `ImportManager` | `src/main/services/import-manager.ts` | convertPdfToMarkdown() 委托 PdfAdapter |
| `pdf-parse` | 已有依赖 | 有文本层 PDF 快速提取路径 |
| `IPC_CHANNELS` | `src/shared/types.ts` | 扩展分类相关 IPC 通道常量 |

### 2.4 新增依赖库

| 库 | 用途 | 是否已有 |
|----|------|---------|
| `tesseract.js` ^5.x | 纯 JS OCR 引擎，支持中英文，无需系统依赖 | **需新增** |
| `pdf-to-img` 或 `pdfjs-dist` | 无文本层 PDF 转图片再 OCR | **需新增**（需评估选型） |

### 2.5 新增 IPC 通道

| 通道常量 | 通道名 | 方向 | 说明 |
|---------|--------|------|------|
| `FILE_IMPORT_CLASSIFICATION` | `file:import:classification` | Main→Renderer | 推送分类建议到渲染进程 |
| `FILE_IMPORT_CONFIRM_CLASSIFICATION` | `file:import:confirmClassification` | Renderer→Main | 用户确认分类结果 |

注：复用 TASK040 已有 `file:import:progress` 通道，扩展 `stage` 字段值增加 `ocr` 和 `classifying`。

---

## 三、现有代码盘点与差距分析

### 3.1 ImportAdapter 体系现状

**TASK040 已实现：**
- `ImportAdapter` 接口完整（detect/scan/transform）
- `ImportRegistry` 含 5 个适配器（Notion/GoogleDocs/Obsidian/Markdown/Docx）
- `ImportPipeline` 三阶段管道（扫描→转换→写入），支持暂停/取消/恢复
- `ImportPipelineHandler` IPC 通道完整（7 个通道）
- `ImportHistoryManager` 导入历史 + Git tag 回滚

**缺口：**

| 缺失项 | 说明 |
|--------|------|
| PdfAdapter | 不存在，需新建 |
| OcrEngine | 不存在，需新建 |
| TesseractOcrProvider | 不存在，需新建 |
| AiClassifier | 不存在，需新建 |
| 分类 prompt 模板 | 不存在，需新建 |
| ClassificationConfirmPanel | 不存在，需新建 |
| 分类确认 IPC 通道 | 不存在，需新建 |

### 3.2 现有 PDF 处理现状

**`ImportManager.convertPdfToMarkdown()`：**
- 使用 `pdf-parse` 做纯文本提取（有损转换）
- 无 OCR 能力——扫描件无法提取文本
- 无布局感知——丢失表格、列表、标题结构
- 无 AI 分类——所有导入文件进同一目录
- 方法签名：`private async convertPdfToMarkdown(sourcePath: string, targetDir: string): Promise<ImportFileResult>`

**改造策略：** 保留该方法签名兼容，内部委托给 PdfAdapter（渐进增强）。

### 3.3 AiGatewayClient 接口适配分析

**现有接口：**
```typescript
class AiGatewayClient {
  async chat(request: AiGatewayChatRequest, accessToken?: string): Promise<AiGatewayChatResponse>
  async *chatStream(request: AiGatewayChatRequest, ...): AsyncGenerator<string, void, undefined>
}
```

**AiClassifier 调用方式：**
- 使用 `chat()` 非流式调用（分类不需要流式）
- 构造 `AiGatewayChatRequest`：model + messages（含分类 prompt）
- 解析 `AiGatewayChatResponse.content` 为 JSON

### 3.4 PromptComposer 接口适配分析

**现有接口：**
```typescript
class PromptComposer {
  async compose(context: ComposeContext): Promise<ComposedPrompt>
}
```

**AiClassifier 调用方式：**
- `ComposeContext` 当前设计围绕 mode/tools/agent/workspace，不直接支持自由 prompt id
- **关键发现**：PromptComposer 的 `compose()` 接受 `ComposeContext`（含 mode、tools、agent 等），不是 prompt-id 模式
- **适配策略**：AiClassifier 不直接调用 PromptComposer，改为在 `resources/prompts/import/classify.md` 中存放分类 prompt 模板，AiClassifier 自行读取并替换变量。PromptComposer 用于构建 AI 对话的系统提示（复用现有能力），分类 prompt 作为 user message 注入

### 3.5 ImportPipelineOptions 类型扩展需求

**现有定义：**
```typescript
interface ImportPipelineOptions {
  readonly targetDir: string
  readonly conflictStrategy: 'skip' | 'overwrite' | 'rename'
  readonly preserveStructure: boolean
  readonly signal?: AbortSignal
  readonly importId: string
}
```

**需扩展字段：**
- `enableOcr: boolean`（默认 true）
- `enableClassification: boolean`（默认 true）
- `classificationHandler?: (classification: ClassificationResult) => Promise<ClassificationResult>`（分类确认回调）

### 3.6 ImportItem 类型扩展需求

**现有定义：**
```typescript
interface ImportItem {
  readonly sourcePath: string
  readonly targetPath: string
  readonly content: string
  readonly attachments: ReadonlyArray<AssetAttachment>
  readonly metadata: ImportItemMetadata
}
```

**需扩展字段：**
- `classification?: ClassificationResult`
- `ocrConfidence?: number`

### 3.7 不存在的文件

| 文件 | 状态 |
|------|------|
| `src/main/services/import/ocr-engine.ts` | **不存在**，需新建 |
| `src/main/services/import/tesseract-ocr-provider.ts` | **不存在**，需新建 |
| `src/main/services/import/ai-classifier.ts` | **不存在**，需新建 |
| `src/main/services/import/adapters/pdf-adapter.ts` | **不存在**，需新建 |
| `resources/prompts/import/classify.md` | **不存在**，需新建 |
| `src/renderer/components/import/` | **目录不存在**，需创建 |
| `tests/main/services/import/`（部分 fixture） | **目录存在**，需添加 fixture |

---

## 四、分步实施计划

### 阶段 A：OCR 和分类共享类型定义（Step 1） — 预计 0.3 天

#### A1：扩展 import/types.ts

**文件：** `src/main/services/import/types.ts`（修改 TASK040 已创建的文件）

**1. 新增 OCR 相关类型：** `OcrOptions`（languages/minConfidence）、`OcrResult`（text/confidence/language/pages）、`OcrPageResult`（pageNumber/text/confidence）、`OcrProvider`（extractText 策略接口）、`PdfAnalysis`（hasTextLayer/totalPages/pagesWithText/pagesWithoutText/hasImages）

**2. 新增分类相关类型：** `DocumentCategory = 'meeting' | 'contract' | 'tech_doc' | 'article' | 'unknown'`、`ClassificationResult`（category/targetPath/confidence/tags）

**3. 扩展 ImportItem 类型：**

在现有 `ImportItem` 中新增可选字段：
- `classification?: ClassificationResult`
- `ocrConfidence?: number`

**4. 扩展 ImportPipelineOptions 类型：**

在现有 `ImportPipelineOptions` 中新增可选字段：
- `enableOcr?: boolean`（默认 true）
- `enableClassification?: boolean`（默认 true）
- `classificationHandler?: (classification: ClassificationResult) => Promise<ClassificationResult>`

**5. 扩展 ImportPlanEntry 类型：**

在现有 `ImportPlanEntry` 的 `type` 联合类型中新增 `'pdf'`，新增可选字段：
- `analysis?: PdfAnalysis`

**6. 扩展 PipelineStage 类型：**

在现有 `PipelineStage` 联合类型中新增 `'ocr'` 和 `'classifying'`。

**验证：** TypeScript 编译通过，类型与 TASK040 的现有类型兼容。

---

### 阶段 B：OcrEngine 实现（Step 2） — 预计 1 天

#### B1：创建 TesseractOcrProvider

**文件：** `src/main/services/import/tesseract-ocr-provider.ts`（新建）

实现 `OcrProvider` 接口，封装 tesseract.js v5：
- `createWorker(languages.join('+'))` 创建 Worker
- `worker.recognize(imageBuffer)` 执行识别
- `result.data.confidence / 100` 转换为 0-1 置信度
- `finally { await worker.terminate() }` 确保资源释放
- 语言包加载：首次使用自动下载；下载失败降级为仅 `eng`，记录 warn 日志

#### B2：创建 OcrEngine

**文件：** `src/main/services/import/ocr-engine.ts`（新建）

**类结构：** `OcrEngine` — 统一入口，委托 `OcrProvider` 策略

**核心方法：**

- `extractTextFromImage(imageBuffer, options?)` — 合并默认选项（languages: ['eng','chi_sim'], minConfidence: 0.7），调用 provider，记录结构化日志
- `extractTextFromPdfPage(pdfPath, pageNumber, options?)` — 使用 pdf-to-img/pdfjs-dist 渲染页面为 PNG → 调用 `extractTextFromImage()`
- `analyzePdf(pdfPath)` — 使用 pdf-parse 检测文本层，统计 pagesWithText/pagesWithoutText，返回 `PdfAnalysis`
- `setProvider(provider)` — 运行时切换 OCR 提供者（为云端 OCR 预留）

**PDF 页面渲染选型：** 优先 `pdf-to-img`（简化封装），备选 `pdfjs-dist`（更底层控制）

**验证：** OcrEngine 可正确从图片提取中英文文本、置信度计算正确、低置信度场景正确处理。

---

### 阶段 C：AiClassifier 实现（Step 3） — 预计 1 天

#### C1：创建分类 prompt 模板

**文件：** `resources/prompts/import/classify.md`（新建）

模板包含：YAML frontmatter（id/version/name/description）、文档信息占位符（`{{title}}`/`{{firstParagraph}}`/`{{keywords}}`）、5 种分类类别说明、JSON 输出格式规范（category/confidence/tags/reason）

**PromptComposer 适配决策：** 鉴于 `PromptComposer.compose()` 接受 `ComposeContext`（含 mode/tools/agent/workspace），而非 prompt-id 模式，AiClassifier 采用以下策略：
1. 从 `resources/prompts/import/classify.md` 直接读取模板
2. 内部实现 `{{var}}` 变量替换
3. 将替换后的 prompt 作为 `user message`，通过 `AiGatewayClient.chat()` 发送
4. 不依赖 PromptComposer 的多层组装能力

#### C2：创建 AiClassifier

**文件：** `src/main/services/import/ai-classifier.ts`（新建）

**类结构：** `AiClassifier` — 注入 `AiGatewayClient` + `Logger`

**`classify()` 核心逻辑：**

1. **提取输入摘要**：title = fileName 去扩展名、firstParagraph = text.slice(0,500)、keywords = extractKeywords(text)（简易 TF 提取 top 10）
2. **构建分类请求**：加载 prompt 模板 → 替换变量 → `gatewayClient.chat({ model, messages: [{ role: 'user', content: renderedPrompt }] })`
3. **解析 AI 返回**：从 `AiGatewayChatResponse.content` 提取 JSON → 验证 category/confidence/tags → 调用 `generateTargetPath()`
4. **低置信度兜底**：confidence < 0.6 → category='unknown', targetPath='imports/untriaged/'
5. **错误处理**：AI 调用失败/JSON 解析失败 → 返回 unknown + confidence=0，记录 warn 日志

**`extractKeywords()`：** 中文按标点分割取高频词（≥2字符）；英文空格分割过滤停用词；合并去重返回 top 10

**`generateTargetPath()` 路径规则：**

| category | 路径 |
|----------|------|
| meeting | `docs/meetings/{YYYY}/{YYYY-MM-DD}-{title}.md` |
| contract | `docs/contracts/{YYYY}/{title}.md` |
| tech_doc | `docs/tech/{title}.md` |
| article | `docs/reading/{YYYY-MM}/{title}.md` |
| unknown | `imports/untriaged/{title}.md` |

**验证：** AiClassifier 可正确分类各类文档、低置信度返回 unknown、分类路径生成规则正确。

---

### 阶段 D：PdfAdapter 实现（Step 4） — 预计 1 天

#### D1：创建 PdfAdapter

**文件：** `src/main/services/import/adapters/pdf-adapter.ts`（新建）

**类结构：** `PdfAdapter implements ImportAdapter` — 注入 OcrEngine + AiClassifier(可 null) + Logger

**`detect(input)`：** 检查扩展名 `.pdf` + 可选魔数 `%PDF-`

**`scan(input)`：** 调用 `ocrEngine.analyzePdf()` → 构建 `ImportPlan`（含 PdfAnalysis、warnings、预估耗时）

**`transform(plan, options)` 核心逻辑：**

1. **文本提取/OCR** — 三种策略：
   - 全文本层 → `pdf-parse` 直接提取（快速路径）
   - 无文本层 → 逐页 `ocrEngine.extractTextFromPdfPage()`
   - 混合型 → 逐页判断混合处理
2. **AI 分类**（若 `enableClassification !== false` 且 `aiClassifier` 非 null）→ `aiClassifier.classify()` → 若有 `classificationHandler` 则调用等待用户确认
3. **域模板** → `applyDomainTemplate(category, markdown)`
4. **元数据构建** → ocrConfidence < 0.7 添加 `⚠️ 待复核`；contract 添加 `⚠️ 敏感`
5. **yield ImportItem** — 含 classification + ocrConfidence

**域模板 `applyDomainTemplate()`：** meeting→追加参会人/决议/行动项占位标题；contract→追加关键条款+⚠️敏感；tech_doc→保持原结构；article→追加摘要占位；unknown/null→不追加

**验证：** PdfAdapter 正确处理有文本层/无文本层/混合型 PDF、AI 分类正确集成、域模板正确应用。

---

### 阶段 E：分类确认 IPC + UI（Step 5-6） — 预计 1 天

#### E1：IPC 通道扩展

**文件：** `src/shared/types.ts`（修改）

新增通道常量：`FILE_IMPORT_CLASSIFICATION: 'file:import:classification'`、`FILE_IMPORT_CONFIRM_CLASSIFICATION: 'file:import:confirmClassification'`
扩展 `PipelineStage` 联合类型新增 `'ocr' | 'classifying'`。

#### E2：ImportPipelineHandler 扩展

**文件：** `src/main/ipc/handlers/import-pipeline.ts`（修改）

1. **分类确认 IPC 注册**：`ipcMain.on('file:import:confirmClassification', (event, importId, result) => {...})`
2. **等待机制**：`pendingClassifications: Map<string, PromiseResolver>` + `waitForClassificationConfirmation(importId): Promise<ClassificationResult>`
3. **管道集成**：PdfAdapter.transform() 需要分类确认时 → `BrowserWindow.webContents.send('file:import:classification', classification)` → `waitForClassificationConfirmation(importId)` → 用用户确认结果继续
4. **进度推送扩展**：`ImportProgress.stage` 支持 `'ocr'`（含 pageNumber/totalPages）和 `'classifying'`

#### E3：Preload API 扩展

**文件：** `src/preload/index.ts`（修改）

在 `importPipeline` 命名空间新增：`onClassification(callback)` → 监听 `file:import:classification`；`confirmClassification(importId, result)` → invoke `file:import:confirmClassification`
注册新通道到 `ALLOWED_CHANNELS`。

#### E4：ClassificationConfirmPanel 组件

**文件：** `src/renderer/components/import/ClassificationConfirmPanel.tsx`（新建）

**Props：** classification / fileName / onConfirm / onModify / onSkip

**高置信度（≥0.6）：** 展示 AI 建议卡片（类别图标+目标路径+标签+置信度进度条）→ [确认导入]/[修改] 按钮
**低置信度（<0.6）：** 标记"低置信度" + 类别下拉框 + 目标路径输入框 + 标签输入 → [确认]/[跳过分类] 按钮

**验证：** 高/低置信度场景渲染正确、确认/修改/跳过操作正确、IPC 双向通信正常。

---

### 阶段 F：集成注册 + ImportManager 改造（Step 7） — 预计 0.5 天

#### F1：PdfAdapter 注册

**文件：** `src/main/services/import/adapters/index.ts`（修改）

导出 PdfAdapter；在 `registerDefaultAdapters()` 中注册，优先级：Notion→GoogleDocs→Obsidian→**Pdf**→Markdown→Docx。注入 OcrEngine + AiClassifier（AI 未启用时传 null）。

#### F2：ImportManager 改造

**文件：** `src/main/services/import-manager.ts`（修改）

`convertPdfToMarkdown()` 内部：若 `this.pdfAdapter` 可用 → 委托 PdfAdapter 运行（enableOcr:true, enableClassification:false）；否则降级为原有 pdf-parse 逻辑。方法签名保持兼容。

#### F3：主进程初始化装配

装配顺序：OcrEngine(logger) → AiClassifier(gatewayClient, logger) 或 null → PdfAdapter(ocrEngine, aiClassifier, logger) → registry.register(pdfAdapter)

**验证：** PdfAdapter 通过 ImportRegistry 正确注册、PDF 文件可被正确识别和处理。

---

### 阶段 G：单元测试（Step 8） — 预计 1 天

#### G1：OcrEngine + TesseractOcrProvider 测试

**文件：** `tests/main/services/import/ocr-engine.test.ts` + `tesseract-ocr-provider.test.ts`

关键用例：英文/中文/中英文混合图片提取、空白图片、置信度计算、analyzePdf 有/无文本层、setProvider 切换、Worker 创建销毁、语言包降级

#### G2：AiClassifier 测试

**文件：** `tests/main/services/import/ai-classifier.test.ts`

关键用例：5 种分类各 1 个（meeting/contract/tech_doc/article/unknown）、低置信度兜底、路径生成规则各类别、AI 调用失败返回 unknown、关键词提取（中文/英文/空文本）

#### G3：PdfAdapter 测试

**文件：** `tests/main/services/import/pdf-adapter.test.ts`

关键用例：detect 正/反、scan 返回 PdfAnalysis、有文本层直接提取、无文本层触发 OCR（mock）、混合型分页面、AI 分类集成（mock）、域模板应用、⚠️待复核/⚠️敏感标记、分类禁用

#### G4：ClassificationConfirmPanel 测试

**文件：** `tests/renderer/import/ClassificationConfirmPanel.test.tsx`

关键用例：高/低置信度渲染、onConfirm/onModify/onSkip 回调

#### G5：测试 fixture

**目录：** `tests/fixtures/import/`

| 文件 | 用途 |
|------|------|
| `test-image-eng.png` | 英文文本图片 |
| `test-image-chi.png` | 中文文本图片 |
| `test-text-layer.pdf` | 有文本层 PDF |
| `test-scan.pdf` | 扫描件 PDF |

**覆盖率目标：** ≥ 80%

---

### 阶段 H：集成验证 + 边界处理 — 预计 0.5 天

#### H1：端到端导入验证

1. 有文本层 PDF → 纯文本提取 → AI 分类 → 分类确认 → 写入
2. 扫描件 PDF → OCR → AI 分类 → 分类确认 → 写入
3. 混合型 PDF → 混合处理 → AI 分类 → 分类确认 → 写入
4. AI 分类禁用 → 不调用 AiClassifier → 默认路径
5. 批量导入 ≥10 个 PDF → 进度条 + ETA

#### H2：错误边界处理

| 场景 | 处理方式 |
|------|---------|
| tesseract.js 语言包下载失败 | 降级为仅 eng，记录 warn |
| AI 调用超时/失败 | classification 返回 unknown，不阻塞 |
| PDF 页面渲染失败 | 跳过该页，记录 error，继续后续页 |
| 分类确认超时（用户无响应） | 30 秒超时，使用 AI 建议直接写入 |
| 空 PDF（0 页） | scan() 返回警告，transform() 不产出 |

#### H3：性能验证

单页 OCR < 5s / 有文本层提取 < 1s / AI 分类 < 3s / 批量 10 个 PDF 显示进度条和 ETA

---

## 五、验收标准追踪

### OcrEngine（8 项）

| # | 验收标准 | 位置 | 测试 |
|---|---------|------|------|
| 1 | ocr-engine.ts 创建，封装 tesseract.js | B2 | G1 |
| 2 | extractTextFromImage(imageBuffer, options) | B2 | G1 |
| 3 | 支持中英文（eng + chi_sim） | B1 | G1 |
| 4 | OcrResult 含 text/confidence/language | A1 | G1 |
| 5 | 置信度 < 0.7 标记低置信度 | D1 | G3 |
| 6 | 支持 png/jpg/jpeg/tiff/bmp/webp | B1+B2 | G1 |
| 7 | 默认本地 tesseract.js | B1 | G1 |
| 8 | OcrProvider 接口预留云端 OCR | A1+B2 | G1 |

### PdfAdapter（7 项）

| # | 验收标准 | 位置 | 测试 |
|---|---------|------|------|
| 1 | pdf-adapter.ts 创建 | D1 | G3 |
| 2 | detect() 识别 .pdf | D1 | G3 |
| 3 | scan() 返回 PdfAnalysis | D1 | G3 |
| 4 | transform() 三种策略自动选择 | D1 | G3 |
| 5 | 每页产出独立 ImportItem | D1 | G3 |
| 6 | 布局感知保留结构 | D1 | G3 |
| 7 | 图片提取到 assets/ | D1 | — |

### AiClassifier（8 项）

| # | 验收标准 | 位置 | 测试 |
|---|---------|------|------|
| 1 | ai-classifier.ts 创建 | C2 | G2 |
| 2 | classify(text, fileName) 方法 | C2 | G2 |
| 3 | "标题+首段+关键词"作为输入 | C2 | G2 |
| 4 | AiGatewayClient.chat() 非流式调用 | C2 | G2 |
| 5 | 返回 { category, targetPath, confidence, tags } | C2 | G2 |
| 6 | 5 种分类类别 | C2+C1 | G2 |
| 7 | 分类路径生成规则 | C2 | G2 |
| 8 | 低置信度 → imports/untriaged/ | C2 | G2 |

### 分类确认 UI（5 项）

| # | 验收标准 | 位置 | 测试 |
|---|---------|------|------|
| 1 | ClassificationConfirmPanel 创建 | E4 | G4 |
| 2 | 高置信度（≥0.6）一键确认 | E4 | G4 |
| 3 | 低置信度（<0.6）手动选择 | E4 | G4 |
| 4 | 用户可修改目标路径 | E4 | G4 |
| 5 | 用户可禁用 AI 分类 | F3+D1 | G3 |

### 低置信度标记 + 域模板 + 进度反馈 + ImportManager 兼容

| # | 验收标准 | 位置 | 测试 |
|---|---------|------|------|
| 1 | OCR < 0.7 → ⚠️ 待复核 | D1 | G3 |
| 2 | AI < 0.6 → imports/untriaged/ | C2 | G2 |
| 3 | 会议纪要/合同/技术/文章模板 | D1 | G3 |
| 4 | 批量 ≥10 文件进度条+ETA | E2 | H1 |
| 5 | 每文件 OCR/分类/写入阶段进度 | E2 | — |
| 6 | 大 PDF 页级进度 | E2 | — |
| 7 | convertPdfToMarkdown() 委托 PdfAdapter | F2 | H1 |

---

## 六、风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| tesseract.js v5 语言包首次下载耗时 | 中 | 首次使用时后台预加载；下载失败降级为 eng；UI 显示下载进度 |
| tesseract.js Worker 内存占用 | 中 | 每次识别后立即 terminate Worker；单页处理避免全 PDF 加载到内存 |
| PDF 页面渲染库选型不稳定 | 低 | 优先 pdf-to-img，备选 pdfjs-dist；在 B2 步骤中预留抽象 |
| PromptComposer 接口不直接支持 prompt-id | 中 | AiClassifier 自行读取 prompt 模板文件并替换变量，不依赖 PromptComposer |
| AiGatewayClient.chat() 非流式调用延迟 | 中 | 超时 10 秒；失败返回 unknown 分类，不阻塞导入流程 |
| 分类确认 IPC 双向通信复杂度 | 中 | 使用 Promise + Map 模式；30 秒超时兜底 |
| ImportPipelineOptions 类型扩展破坏兼容性 | 低 | 新增字段均为可选（`?`），提供默认值 |
| PDF 内嵌图片提取路径 | 中 | 复用 TASK040 AssetHandler.copyAssets() + rewriteImagePaths() |
| tesseract.js 不支持某些 PDF 加密 | 低 | scan() 检测加密状态，返回 warnings；transform() 跳过加密页 |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 |
|----|------|--------|
| Day 1 上午 | A1 | types.ts 扩展完成，TypeScript 编译通过 |
| Day 1 下午 | B1 + B2 | TesseractOcrProvider + OcrEngine 完整实现 |
| Day 2 | C1 + C2 | 分类 prompt 模板 + AiClassifier 完整实现 |
| Day 3 | D1 + F1 + F2 | PdfAdapter 完整实现 + 注册 + ImportManager 改造 |
| Day 4 上午 | E1-E4 | IPC 扩展 + Preload + ClassificationConfirmPanel |
| Day 4 下午 | G1-G7 | 单元测试全部通过 |
| Day 5 | H1-H3 | 端到端验证 + 错误边界 + 性能验证 |

---

## 八、涉及文件变更总览

### 新建文件（16 个）

`import/ocr-engine.ts` / `import/tesseract-ocr-provider.ts` / `import/ai-classifier.ts` / `import/adapters/pdf-adapter.ts` / `resources/prompts/import/classify.md` / `renderer/components/import/ClassificationConfirmPanel.tsx` + 4 个测试文件 + 4 个 fixture 文件

### 修改文件（7 个）

| 文件 | 变更说明 |
|------|---------|
| `import/types.ts` | 新增 OcrOptions/OcrResult/ClassificationResult/PdfAnalysis；扩展 ImportItem/ImportPipelineOptions/ImportPlanEntry/PipelineStage |
| `import/adapters/index.ts` | 导出 PdfAdapter + 注册到默认列表 |
| `import-manager.ts` | convertPdfToMarkdown() 委托 PdfAdapter |
| `import-pipeline.ts`（IPC handler） | 新增分类确认 IPC + 进度推送扩展 |
| `shared/types.ts` | 新增 2 个 IPC 通道常量 |
| `preload/index.ts` | 新增分类确认 API + ALLOWED_CHANNELS |
| 主进程初始化入口 | 装配 OcrEngine + AiClassifier + PdfAdapter |

### 不修改

`ai-gateway-client.ts`（仅接口调用）/ `context-engine/`（不依赖 PromptComposer）/ `file-manager.ts`/`import-pipeline.ts`/`import-registry.ts`

---

**文档版本**: v1.0
**最后更新**: 2026-04-24
**维护者**: Sibylla 架构团队
