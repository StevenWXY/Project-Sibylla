# AI OCR 与结构化分类

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK041 |
| **任务标题** | AI OCR 与结构化分类 |
| **所属阶段** | Phase 1 - 迁移、导入与 MCP 集成 (Sprint 3.6) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

构建 Sprint 3.6 的 AI 智能导入增强——OcrEngine（tesseract.js 封装）和 AiClassifier（调用现有 AiGatewayClient），以及集成了两者的 PdfAdapter。让用户导入的 PDF/扫描件能被 OCR 识别文本、被 AI 自动分类到合适目录，实现"把纸质文档倒入 Sibylla，AI 帮你整理"的体验。

### 背景

TASK040 建立了导入管道基础设施（ImportAdapter + ImportPipeline + ImportRegistry）。本任务在其上构建 PDF 导入的智能化增强层。当前 `ImportManager.convertPdfToMarkdown()` 使用 `pdf-parse` 做纯文本提取，存在以下局限：

| 问题 | 现状 | 影响 |
|------|------|------|
| 扫描件无法提取文本 | pdf-parse 只能提取有文本层的 PDF | 会议纪要扫描件、合同扫描件无法导入 |
| 无版面感知 | 纯文本提取丢失表格、列表、标题结构 | 复杂 PDF 内容混乱 |
| 无智能分类 | 导入文件全部进同一目录 | 用户需手动整理大量文件 |
| 无 AI 辅助 | 用户需手动命名和归类 | 新用户上手门槛高 |

**核心设计约束**：

1. **本地优先**：OCR 默认使用 tesseract.js（纯 JS 无需系统依赖），不向云端发送文件内容
2. **AI 建议，人类决策**：AI 分类建议需用户确认才写入（高置信度一键确认，低置信度手动选择）
3. **渐进增强**：PdfAdapter 作为 TASK040 ImportAdapter 的新增适配器注册到 ImportRegistry
4. **复用现有 AI 基础设施**：AiClassifier 调用现有 `AiGatewayClient` + `ContextEngine` → `PromptComposer` 完成分类
5. **用户可控**：用户可在设置中禁用 AI 分类，使用"全部进 inbox"模式

### 范围

**包含：**

- OcrEngine — tesseract.js 封装，支持中英文 OCR，支持布局感知提取
- AiClassifier — 调用 AiGatewayClient 完成文档分类（类别、目标路径、置信度、标签）
- PdfAdapter — 集成 OcrEngine + AiClassifier 的 ImportAdapter 实现
- 分类 prompt 设计 — 注入到现有 PromptComposer
- 分类确认 UI 组件 — ClassificationConfirmPanel（渲染进程）
- 低置信度标记 — ⚠️ 待复核 标签系统
- 域模板应用 — 会议纪要/合同/技术文档/文章的差异化处理
- OcrEngine 备选方案接口 — 云端 OCR（可选，默认关闭）
- 单元测试

**不包含：**

- 导入管道基础设施（TASK040）
- MCP 相关功能（TASK042/043）
- 首次引导 UI（TASK044）
- AI 分类的自动执行模式（本任务仅实现"AI 建议 + 用户确认"模式）

## 依赖关系

### 前置依赖

- [x] TASK040 — 导入管道与多平台适配器（ImportPipeline + ImportRegistry + ImportAdapter 接口已可用）
- [x] TASK011 — AI 对话流式响应（AiGatewayClient 已可用）
- [x] TASK012 — 上下文引擎 v1（ContextEngine + PromptComposer 已可用）

### 被依赖任务

- TASK044 — Aha Moment 首次引导体验（导入 UI 复用 PdfAdapter 进度回调 + 分类确认）

## 参考文档

- [`specs/requirements/phase1/sprint3.6-MCP.md`](../../requirements/phase1/sprint3.6-MCP.md) — 需求 2.2、§1.3、§6.2
- [`specs/design/architecture.md`](../../design/architecture.md) — 上下文引擎架构、AI 模型网关
- [`CLAUDE.md`](../../../CLAUDE.md) — 文件即真相、AI 建议/人类决策、本地优先
- `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` — TypeScript 严格模式
- `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` — IPC 类型安全设计
- `.kilocode/skills/phase1/ai-context-engine/SKILL.md` — 上下文引擎设计指南
- `.kilocode/skills/phase1/llm-streaming-integration/SKILL.md` — LLM 流式响应集成

## 验收标准

### OcrEngine

- [ ] `src/main/services/import/ocr-engine.ts` 创建，封装 tesseract.js
- [ ] 支持 `extractText(imageBuffer: Buffer, options: OcrOptions): Promise<OcrResult>` 方法
- [ ] 支持中英文识别（`eng` + `chi_sim` 语言包）
- [ ] 返回 `OcrResult` 包含 `text`（识别文本）、`confidence`（置信度 0-1）、`language`（检测语言）
- [ ] 置信度 < 0.7 时标记为低置信度
- [ ] 支持图片格式：png / jpg / jpeg / tiff / bmp / webp
- [ ] 默认使用本地 tesseract.js，无需系统依赖
- [ ] 备选方案接口预留：`OcrProvider` 接口支持云端 OCR 实现切换（Sprint 3.6 不实现云端 OCR）

### PdfAdapter

- [ ] `src/main/services/import/adapters/pdf-adapter.ts` 创建，实现 ImportAdapter 接口
- [ ] `detect(input)` 识别 `.pdf` 单文件
- [ ] `scan(input)` 分析 PDF 页数、是否有文本层、预估图片数
- [ ] `transform(plan, options)` 三种处理策略自动选择：
  - 有文本层的 PDF：使用 pdf-parse 提取文本（快速路径）
  - 无文本层的扫描件：使用 OcrEngine OCR 识别
  - 混合型：有文本层部分直接提取，无文本层部分 OCR
- [ ] 每页产出独立 ImportItem（支持大 PDF 流式处理）
- [ ] 布局感知：识别标题、段落、表格、列表结构并保留在 Markdown 中
- [ ] 图片提取：从 PDF 中提取嵌入图片，保存到 `assets/`

### AiClassifier

- [ ] `src/main/services/import/ai-classifier.ts` 创建
- [ ] `classify(text: string, fileName: string): Promise<ClassificationResult>` 方法
- [ ] 使用"标题 + 首段 + 关键词"作为输入（避免全文 token 消耗过大）
- [ ] 通过现有 AiGatewayClient 发送分类请求（非流式 chat）
- [ ] 通过现有 PromptComposer 注入分类 prompt（`import/classify` prompt id）
- [ ] 返回 `ClassificationResult`：`{ category, targetPath, confidence, tags }`
- [ ] 分类类别：会议纪要 / 合同文档 / 技术文档 / 文章博客 / 无法识别
- [ ] 默认分类推断规则：
  - 会议纪要 → `docs/meetings/YYYY/YYYY-MM-DD-标题.md`
  - 合同文档 → `docs/contracts/YYYY/`（附加 `⚠️ 敏感` 标签）
  - 技术文档 → `docs/tech/` 或按项目归类
  - 文章/博客 → `docs/reading/YYYY-MM/`
  - 无法识别 → `imports/untriaged/`

### 分类确认 UI

- [ ] `ClassificationConfirmPanel` 组件创建（渲染进程）
- [ ] 高置信度（≥0.6）展示建议并一键确认
- [ ] 低置信度（<0.6）让用户手动选择类别和目标路径
- [ ] 用户可修改 AI 建议的目标路径
- [ ] 用户可在设置中禁用 AI 分类（"全部进 inbox"模式）

### 低置信度标记

- [ ] OCR 置信度 < 0.7 时，导入文件 YAML frontmatter 添加 `⚠️ 待复核` 标签
- [ ] AI 分类置信度 < 0.6 时，导入到 `imports/untriaged/` 目录
- [ ] 待复核文件在文件树中以特殊图标标记

### 域模板应用

- [ ] 会议纪要模板：自动提取参会人、日期、决议、行动项
- [ ] 合同文档模板：标记为 `⚠️ 敏感`，提取关键条款摘要
- [ ] 技术文档模板：保持原始结构，提取技术栈关键词
- [ ] 文章/博客模板：提取摘要和关键词标签

### 进度反馈

- [ ] 批量导入 ≥10 个文件时显示进度条 + ETA
- [ ] 每个文件处理进度推送：OCR 阶段 / 分类阶段 / 写入阶段
- [ ] 单个大 PDF 显示页级进度（"正在处理第 3/12 页..."）

### 与 ImportManager 的关系

- [ ] `ImportManager.convertPdfToMarkdown()` 内部改为委托给 PdfAdapter
- [ ] 原有 `convertPdfToMarkdown()` 方法签名保持兼容（渐进增强）

### 单元测试

- [ ] OcrEngine 文本提取测试（使用 fixture 图片）
- [ ] OcrEngine 中英文混合测试
- [ ] OcrEngine 低置信度场景测试
- [ ] PdfAdapter 有文本层 PDF 提取测试
- [ ] PdfAdapter 无文本层 PDF OCR 测试
- [ ] AiClassifier 分类准确性测试（各类别至少 1 个测试用例）
- [ ] AiClassifier 低置信度返回 untriaged 测试
- [ ] 分类路径生成规则测试
- [ ] 域模板应用测试
- [ ] 覆盖率 ≥ 80%

## 技术策略

### 核心架构：OcrEngine + AiClassifier + PdfAdapter 三层增强

```
PdfAdapter.detect(.pdf) → true
       │
       ▼
PdfAdapter.scan(pdfPath)
       │
       ├── 分析 PDF 结构：
       │   ├── pdf-parse 提取文本 → 有文本层？
       │   ├── pdf2pic/pdf-image 提取页面图片 → 有扫描图片？
       │   └── 返回 ImportPlan（含 pdfAnalysis）
       │
       ▼
PdfAdapter.transform(plan, options)
       │
       ├── 策略选择：
       │   ├── 有文本层 → 直接提取（快速路径）
       │   ├── 无文本层 → OcrEngine 逐页 OCR
       │   └── 混合型 → 分页面混合处理
       │
       ├── 对每页：
       │   ├── 布局感知解析（标题/段落/表格/列表）
       │   ├── 生成 Markdown 片段
       │   └── yield ImportItem（每页一个）
       │
       └── 对整体：
           ├── AiClassifier.classify(标题+首段+关键词)
           │   └── 返回 { category, targetPath, confidence, tags }
           ├── 设置 ImportItem.targetPath = classification.targetPath
           └── 设置 ImportItem.metadata.tags = classification.tags
```

### OcrEngine 分层设计

```
OcrEngine（统一入口）
       │
       ├── OcrProvider 接口（策略模式）
       │   ├── TesseractOcrProvider — 默认，本地 tesseract.js
       │   └── CloudOcrProvider — 预留接口，Sprint 3.6 不实现
       │
       ├── 优先级选择逻辑：
       │   1. 本地 tesseract.js（默认）
       │   2. 云端 OCR（需用户在设置中启用）
       │
       └── 输出标准化：OcrResult
```

### AiClassifier 分类流程

```
AiClassifier.classify(text, fileName)
       │
       ├── 1. 提取输入（避免全文消耗）
       │   ├── 标题 = fileName 或首行
       │   ├── 首段 = 前 500 字符
       │   └── 关键词 = 高频词 top 10（TF 简易提取）
       │
       ├── 2. PromptComposer 注入分类 prompt
       │   └── prompt id: "import/classify"
       │
       ├── 3. AiGatewayClient.chat() 非流式调用
       │   └── model: 默认模型
       │
       ├── 4. 解析 AI 返回 JSON
       │   └── { category, targetPath, confidence, tags }
       │
       └── 5. 返回 ClassificationResult
```

### 分类确认 UI 交互

```
PdfAdapter.transform() 产出 ImportItem（含 classification）
       │
       ▼
ImportPipeline.writeItem()
       │
       ├── 通过 IPC 推送分类建议到渲染进程
       │   └── file:import:classification 事件
       │
       ▼
渲染进程 ClassificationConfirmPanel
       │
       ├── 高置信度（≥0.6）：
       │   └── 展示分类建议 → [确认] / [修改]
       │
       ├── 低置信度（<0.6）：
       │   └── 展示候选类别列表 → 用户选择 + 手动输入路径
       │
       └── 用户决策通过 IPC 返回主进程
           └── file:import:confirmClassification
```

### 依赖库选型

| 用途 | 库 | 说明 |
|------|-----|------|
| OCR 引擎 | `tesseract.js` ^5.x | 纯 JS OCR，支持中英文，无需系统依赖 |
| PDF 文本提取 | `pdf-parse`（已有） | 有文本层 PDF 的快速路径 |
| PDF 页面渲染 | `pdf-to-img` 或 `pdfjs-dist` | 无文本层 PDF 转图片再 OCR |
| PDF 元数据 | `pdf-parse` | 页数、是否有文本层检测 |

## 技术执行路径

### 步骤 1：定义 OCR 和分类共享类型

**文件：** `src/main/services/import/types.ts`（扩展 TASK040 已创建的文件）

1. 新增 OCR 相关类型：
   ```typescript
   export interface OcrOptions {
     languages: string[]       // 默认 ['eng', 'chi_sim']
     minConfidence: number     // 默认 0.7
   }

   export interface OcrResult {
     text: string
     confidence: number
     language: string
     pages: OcrPageResult[]
   }

   export interface OcrPageResult {
     pageNumber: number
     text: string
     confidence: number
   }

   export interface OcrProvider {
     extractText(imageBuffer: Buffer, options: OcrOptions): Promise<OcrResult>
   }
   ```

2. 新增分类相关类型：
   ```typescript
   export type DocumentCategory = 'meeting' | 'contract' | 'tech_doc' | 'article' | 'unknown'

   export interface ClassificationResult {
     category: DocumentCategory
     targetPath: string
     confidence: number
     tags: string[]
   }

   export interface PdfAnalysis {
     hasTextLayer: boolean
     totalPages: number
     pagesWithText: number
     pagesWithoutText: number
     hasImages: boolean
   }
   ```

3. 扩展 ImportItem 类型：
   - 新增可选字段 `classification?: ClassificationResult`
   - 新增可选字段 `ocrConfidence?: number`

4. 扩展 ImportOptions 类型：
   - 新增 `enableOcr: boolean`（默认 true）
   - 新增 `enableClassification: boolean`（默认 true）
   - 新增 `classificationHandler?: (classification: ClassificationResult) => Promise<ClassificationResult>`（分类确认回调）

**验证：** TypeScript 编译通过，类型与 TASK040 的类型兼容。

### 步骤 2：实现 OcrEngine

**文件：** `src/main/services/import/ocr-engine.ts`（新建）

1. 构造函数：
   ```typescript
   export class OcrEngine {
     private provider: OcrProvider
     private readonly logger: Logger

     constructor(logger: Logger, provider?: OcrProvider) {
       this.logger = logger
       this.provider = provider ?? new TesseractOcrProvider(logger)
     }
   }
   ```

2. 实现 `async extractTextFromImage(imageBuffer: Buffer, options?: Partial<OcrOptions>): Promise<OcrResult>`：
   - 合并默认选项（`languages: ['eng', 'chi_sim']`, `minConfidence: 0.7`）
   - 调用 `this.provider.extractText(imageBuffer, options)`
   - 记录 OCR 结果日志（文本长度、置信度、耗时）
   - 返回 OcrResult

3. 实现 `async extractTextFromPdfPage(pdfPath: string, pageNumber: number, options?: Partial<OcrOptions>): Promise<OcrPageResult>`：
   - 使用 pdf-to-img 或 pdfjs-dist 将指定页面渲染为图片
   - 调用 `extractTextFromImage()` 进行 OCR
   - 返回 OcrPageResult

4. 实现 `async analyzePdf(pdfPath: string): Promise<PdfAnalysis>`：
   - 使用 pdf-parse 检测是否有文本层
   - 统计有文本层和无文本层的页数
   - 检测是否包含嵌入图片
   - 返回 PdfAnalysis

5. 实现 `setProvider(provider: OcrProvider): void`：
   - 运行时切换 OCR 提供者（为未来云端 OCR 预留）

**文件：** `src/main/services/import/tesseract-ocr-provider.ts`（新建）

6. 实现 `TesseractOcrProvider`（OcrProvider 接口的 tesseract.js 实现）：
   ```typescript
   import Tesseract from 'tesseract.js'

   export class TesseractOcrProvider implements OcrProvider {
     constructor(private readonly logger: Logger) {}

     async extractText(imageBuffer: Buffer, options: OcrOptions): Promise<OcrResult> {
       const worker = await Tesseract.createWorker(options.languages.join('+'))
       const result = await worker.recognize(imageBuffer)
       await worker.terminate()

       return {
         text: result.data.text,
         confidence: result.data.confidence / 100,
         language: options.languages[0],
         pages: [{
           pageNumber: 1,
           text: result.data.text,
           confidence: result.data.confidence / 100,
         }],
       }
     }
   }
   ```

7. 处理 tesseract.js 的语言包加载：
   - 首次使用时下载语言包到应用数据目录
   - 后续使用缓存的语言包
   - 下载失败时降级为仅英文识别

**验证：** OcrEngine 可正确从图片提取中英文文本、置信度计算正确、低置信度场景正确处理。

### 步骤 3：实现 AiClassifier

**文件：** `src/main/services/import/ai-classifier.ts`（新建）

1. 构造函数注入现有 AI 基础设施：
   ```typescript
   export class AiClassifier {
     constructor(
       private readonly gatewayClient: AiGatewayClient,
       private readonly promptComposer: PromptComposer,
       private readonly logger: Logger,
     ) {}
   }
   ```

2. 实现 `async classify(text: string, fileName: string): Promise<ClassificationResult>`：
   ```
   a. 提取输入摘要：
      title = fileName.replace(/\.(pdf|docx?)$/i, '') 或首行文本
      firstParagraph = text.slice(0, 500)
      keywords = extractKeywords(text) // 简易 TF 提取 top 10

   b. 构建分类 prompt：
      promptComposer.compose('import/classify', {
        title,
        firstParagraph,
        keywords,
        categories: ['meeting', 'contract', 'tech_doc', 'article', 'unknown'],
      })

   c. 调用 AiGatewayClient 非流式 chat：
      response = await gatewayClient.chat({
        messages: [{ role: 'user', content: prompt }],
        responseFormat: 'json',
      })

   d. 解析 AI 返回 JSON：
      parsed = JSON.parse(response.content)
      result = {
        category: parsed.category,
        targetPath: generateTargetPath(parsed.category, title),
        confidence: parsed.confidence,
        tags: parsed.tags,
      }

   e. 低置信度兜底：
      if (result.confidence < 0.6):
        result.category = 'unknown'
        result.targetPath = 'imports/untriaged/'

   f. 返回 result
   ```

3. 实现 `private extractKeywords(text: string): string[]`：
   - 中文分词（简易：按标点和空格分割，取高频词）
   - 英文分词（空格分割，过滤停用词）
   - 返回 top 10 关键词

4. 实现 `private generateTargetPath(category: DocumentCategory, title: string): string`：
   - 会议纪要 → `docs/meetings/{YYYY}/{YYYY-MM-DD}-{title}.md`
   - 合同文档 → `docs/contracts/{YYYY}/{title}.md`
   - 技术文档 → `docs/tech/{title}.md`
   - 文章/博客 → `docs/reading/{YYYY-MM}/{title}.md`
   - 无法识别 → `imports/untriaged/{title}.md`

**文件：** `resources/prompts/import/classify.md`（新建）

5. 创建分类 prompt 模板（Markdown + YAML frontmatter 格式，遵循 TASK035 的 Prompt 规范）：
   ```markdown
   ---
   id: import/classify
   version: 1.0.0
   name: 文档分类器
   description: 根据文档内容推断分类、目标路径和标签
   ---

   # 文档分类任务

   请根据以下文档信息，推断其分类。

   ## 文档信息
   - 标题：{{title}}
   - 首段内容：{{firstParagraph}}
   - 关键词：{{keywords}}

   ## 分类类别
   - meeting：会议纪要（包含参会人、决议、行动项）
   - contract：合同文档（包含条款、签署方、金额）
   - tech_doc：技术文档（包含 API、架构、代码示例）
   - article：文章/博客（包含观点、论述、引用）
   - unknown：无法识别

   ## 输出格式
   请返回 JSON：
   \`\`\`json
   {
     "category": "meeting|contract|tech_doc|article|unknown",
     "confidence": 0.0-1.0,
     "tags": ["tag1", "tag2"],
     "reason": "分类理由（一句话）"
   }
   \`\`\`
   ```

**验证：** AiClassifier 可正确分类各类文档、低置信度返回 unknown、分类路径生成规则正确。

### 步骤 4：实现 PdfAdapter

**文件：** `src/main/services/import/adapters/pdf-adapter.ts`（新建）

这是整合 OcrEngine + AiClassifier 的核心适配器。

1. 实现 `detect(input)`：
   - 检查文件扩展名是否为 `.pdf`
   - 可选：检查文件魔数（`%PDF-`）

2. 实现 `scan(input)`：
   ```typescript
   async scan(input: string): Promise<ImportPlan> {
     const analysis = await this.ocrEngine.analyzePdf(input)
     return {
       id: generateId(),
       sourceFormat: 'pdf',
       sourcePath: input,
       totalFiles: 1,
       totalImages: analysis.hasImages ? analysis.totalPages : 0,
       warnings: analysis.pagesWithoutText > 0
         ? [`检测到 ${analysis.pagesWithoutText} 页无文本层，将使用 OCR`]
         : [],
       estimatedDurationMs: analysis.pagesWithoutText > 0
         ? analysis.pagesWithoutText * 3000  // OCR 每页约 3 秒
         : 1000,                              // 纯文本提取约 1 秒
       entries: [{ sourcePath: input, type: 'pdf', analysis }],
     }
   }
   ```

3. 实现 `async *transform(plan, options)`：
   ```
   for each entry in plan.entries:
     analysis = entry.analysis

     // 1. 提取/OCR 文本
     markdown = ''
     ocrConfidence = 1.0

     if analysis.hasTextLayer && analysis.pagesWithoutText === 0:
       // 快速路径：纯文本提取
       markdown = await this.extractTextFromPdf(entry.sourcePath)
     else if !analysis.hasTextLayer:
       // OCR 路径：逐页 OCR
       for page in 1..analysis.totalPages:
         pageResult = await this.ocrEngine.extractTextFromPdfPage(entry.sourcePath, page)
         markdown += pageResult.text + '\n\n---\n\n'
         ocrConfidence = Math.min(ocrConfidence, pageResult.confidence)
     else:
       // 混合路径
       for page in 1..analysis.totalPages:
         if page has text layer:
           markdown += extractPageText(page)
         else:
           pageResult = await ocrEngine.extractTextFromPdfPage(...)
           markdown += pageResult.text

     // 2. AI 分类（如果启用）
     classification = null
     if options.enableClassification:
       classification = await this.aiClassifier.classify(markdown, path.basename(entry.sourcePath))
       // 如果有分类确认回调，调用它
       if options.classificationHandler:
         classification = await options.classificationHandler(classification)

     // 3. 应用域模板
     markdown = applyDomainTemplate(classification?.category, markdown)

     // 4. 构建元数据
     metadata = {
       source: 'pdf',
       ocrConfidence,
       classification,
     }
     if ocrConfidence < 0.7:
       metadata.tags = [...(metadata.tags || []), '⚠️ 待复核']
     if classification?.category === 'contract':
       metadata.tags = [...(metadata.tags || []), '⚠️ 敏感']

     // 5. 产出 ImportItem
     yield {
       sourcePath: entry.sourcePath,
       targetPath: classification?.targetPath ?? `imports/${path.basename(entry.sourcePath, '.pdf')}.md`,
       content: markdown,
       attachments: [],  // PDF 内嵌图片在 OCR 阶段已处理
       metadata,
       classification,
       ocrConfidence,
     }
   ```

4. 实现 `private applyDomainTemplate(category: DocumentCategory | null, content: string): string`：
   - 会议纪要：添加 `## 参会人` / `## 决议` / `## 行动项` 占位标题
   - 合同文档：添加 `## 关键条款` 占位 + `⚠️ 敏感` 标记
   - 技术文档：保持原始结构
   - 文章/博客：添加 `## 摘要` 占位
   - unknown：不添加额外结构

**验证：** PdfAdapter 正确处理有文本层/无文本层/混合型 PDF、AI 分类正确集成、域模板正确应用。

### 步骤 5：实现分类确认 UI 组件

**文件：** `src/renderer/components/import/ClassificationConfirmPanel.tsx`（新建）

1. 组件 props 定义：
   ```typescript
   interface ClassificationConfirmPanelProps {
     classification: ClassificationResult
     fileName: string
     onConfirm: (result: ClassificationResult) => void
     onModify: (result: ClassificationResult) => void
     onSkip: () => void
   }
   ```

2. 高置信度渲染（confidence ≥ 0.6）：
   - 展示 AI 建议卡片：
     - 类别：`会议纪要`（带对应图标）
     - 目标路径：`docs/meetings/2026/2026-04-24-项目周会.md`
     - 标签：`周会` `项目A`
     - 置信度：`87%`（进度条样式）
   - 两个操作按钮：[确认导入] / [修改]
   - 点击确认直接使用 AI 建议
   - 点击修改进入编辑模式

3. 低置信度渲染（confidence < 0.6）：
   - 展示 AI 建议但标记为"低置信度"
   - 类别下拉选择框（5 种类别 + 手动输入）
   - 目标路径文本输入框（可手动编辑）
   - 标签多选/输入框
   - 操作按钮：[确认] / [跳过分类]

4. 用户修改后通过回调返回新的 `ClassificationResult`

**验证：** 高/低置信度场景渲染正确、确认/修改/跳过操作正确。

### 步骤 6：集成 PdfAdapter 到 ImportRegistry + ImportManager 改造

**文件：** `src/main/services/import/adapters/index.ts`（修改 TASK040 创建的文件）

1. 导出 PdfAdapter：
   ```typescript
   export { PdfAdapter } from './pdf-adapter'
   ```

2. 在 `registerDefaultAdapters()` 中添加 PdfAdapter 注册：
   - 优先级：Notion → GoogleDocs → Obsidian → **Pdf** → Markdown → Docx
   - PdfAdapter 需要注入 OcrEngine 和 AiClassifier

**文件：** `src/main/services/import-manager.ts`（修改）

3. 改造 `convertPdfToMarkdown()` 方法：
   ```typescript
   private async convertPdfToMarkdown(sourcePath: string, targetDir: string): Promise<ImportFileResult> {
     // 如果 PdfAdapter 可用，委托给它
     if (this.pdfAdapter) {
       const pipeline = new SingleFilePipeline(this.pdfAdapter, this.fileManager, this.logger)
       const result = await pipeline.run(sourcePath, { targetDir, enableOcr: true, enableClassification: false })
       return result
     }
     // 降级：原有 pdf-parse 逻辑
     // ...保持现有代码不变
   }
   ```

**文件：** 主进程初始化入口（修改）

4. 装配 OcrEngine + AiClassifier + PdfAdapter：
   ```
   a. OcrEngine(logger) — 使用默认 TesseractOcrProvider
   b. AiClassifier(gatewayClient, promptComposer, logger)
   c. PdfAdapter(ocrEngine, aiClassifier, logger)
   d. 注册 PdfAdapter 到 ImportRegistry
   ```

**验证：** PdfAdapter 通过 ImportRegistry 正确注册、PDF 文件可被正确识别和处理。

### 步骤 7：IPC 通道扩展 + 进度反馈

**文件：** `src/main/ipc/handlers/import-pipeline.ts`（修改 TASK040 创建的文件）

1. 新增分类确认 IPC 通道：
   - `file:import:classification`（M→R）—— 推送分类建议到渲染进程
   - `file:import:confirmClassification`（R→M）—— 用户确认分类结果

2. 在导入管道执行过程中集成分类确认：
   ```
   PdfAdapter.transform() 中：
     if classification:
       // 暂停管道
       // 通过 IPC 推送分类建议
       event.sender.send('file:import:classification', classification)
       // 等待用户确认（Promise + Map 存储待确认请求）
       const userDecision = await waitForClassificationConfirmation(importId)
       // 恢复管道，使用用户确认的结果
   ```

3. 实现 `waitForClassificationConfirmation(importId)` 机制：
   - 使用 `Map<string, PromiseResolver<ClassificationResult>>` 存储待确认请求
   - `confirmClassification` handler 中 resolve 对应的 Promise

4. 增强 `file:import:progress` 推送：
   - 新增 `stage` 字段值：`ocr` / `classifying` / `writing`
   - OCR 进度：`{ stage: 'ocr', pageNumber: 3, totalPages: 12 }`
   - 分类进度：`{ stage: 'classifying', fileName: '...' }`

**文件：** `src/shared/types.ts`（扩展）

5. 新增 IPC 通道常量：
   ```typescript
   FILE_IMPORT_CLASSIFICATION: 'file:import:classification',
   FILE_IMPORT_CONFIRM_CLASSIFICATION: 'file:import:confirmClassification',
   ```

**文件：** `src/preload/index.ts`（扩展）

6. 新增分类确认 IPC 方法：
   ```typescript
   onClassification: (callback: (data: ClassificationResult) => void) =>
     ipcRenderer.on('file:import:classification', (_, data) => callback(data)),
   confirmClassification: (importId: string, result: ClassificationResult) =>
     ipcRenderer.invoke('file:import:confirmClassification', importId, result),
   ```

**验证：** 分类建议通过 IPC 正确推送、用户确认后正确返回主进程、进度反馈包含 OCR 和分类阶段。

### 步骤 8：单元测试 + 资源文件

**文件：** `tests/main/services/import/`（扩展 TASK040 创建的目录）

1. `ocr-engine.test.ts`：
   - 英文图片文本提取正确（使用 fixture 图片）
   - 中文图片文本提取正确
   - 中英文混合图片文本提取正确
   - 空白图片返回空文本
   - 置信度计算正确
   - analyzePdf 正确检测有/无文本层

2. `tesseract-ocr-provider.test.ts`：
   - TesseractWorker 正确创建和销毁
   - 语言包加载正确（或降级处理）

3. `ai-classifier.test.ts`：
   - 会议纪要分类正确（包含"参会人""决议"等关键词）
   - 合同文档分类正确（包含"甲方""签署"等关键词）
   - 技术文档分类正确（包含"API""架构"等关键词）
   - 文章/博客分类正确（包含"观点""引用"等关键词）
   - 无关键词文本返回 unknown
   - 低置信度返回 untriaged 路径
   - 分类路径生成规则各类别正确

4. `pdf-adapter.test.ts`：
   - detect() 正确识别 .pdf 文件
   - scan() 返回正确的 PdfAnalysis
   - 有文本层 PDF 直接提取文本
   - 无文本层 PDF 触发 OCR（mock OcrEngine）
   - 混合型 PDF 分页面处理
   - AI 分类集成（mock AiClassifier）
   - 域模板正确应用
   - 低置信度标记 `⚠️ 待复核`
   - 合同标记 `⚠️ 敏感`

5. `classification-confirm-panel.test.tsx`：
   - 高置信度展示分类建议
   - 低置信度展示手动选择界面
   - 确认按钮调用 onConfirm
   - 修改按钮进入编辑模式
   - 跳过按钮调用 onSkip

6. `keyword-extraction.test.ts`：
   - 中文关键词提取正确
   - 英文关键词提取正确（停用词过滤）
   - 空文本返回空数组

**文件：** `tests/fixtures/import/`（扩展）

7. 创建测试 fixture 文件：
   - `test-image-eng.png` — 包含英文文本的测试图片
   - `test-image-chi.png` — 包含中文文本的测试图片
   - `test-text-layer.pdf` — 有文本层的 PDF
   - `test-scan.pdf` — 扫描件 PDF（无文本层）
   - `test-mixed.pdf` — 混合型 PDF

**文件：** `resources/prompts/import/classify.md`（已在步骤 3 创建）

8. 验证 prompt 模板格式正确、PromptComposer 可加载。

**覆盖率目标：** ≥ 80%

## 现有代码基础

| 已有模块 | 文件路径 | 本任务使用方式 |
|---------|---------|-------------|
| ImportPipeline | `src/main/services/import/import-pipeline.ts`（TASK040） | PdfAdapter 注册到 ImportRegistry 后被管道调用 |
| ImportRegistry | `src/main/services/import/import-registry.ts`（TASK040） | 注册 PdfAdapter |
| ImportAdapter 接口 | `src/main/services/import/types.ts`（TASK040） | PdfAdapter 实现此接口 |
| AiGatewayClient | `src/main/services/ai-gateway-client.ts` | AiClassifier 通过其发送分类请求 |
| PromptComposer | `src/main/services/context-engine/PromptComposer.ts`（TASK035） | AiClassifier 通过其注入分类 prompt |
| ContextEngine | `src/main/services/context-engine.ts` | PromptComposer 的依赖 |
| ImportManager | `src/main/services/import-manager.ts` | convertPdfToMarkdown() 改为委托 PdfAdapter |
| pdf-parse | 已有依赖 | 有文本层 PDF 的快速提取路径 |
| mammoth | 已有依赖 | 不涉及（非 Docx 任务） |

**完全缺失、需新建的模块：**

| 模块 | 说明 |
|------|------|
| `import/ocr-engine.ts` | OcrEngine 统一入口 |
| `import/tesseract-ocr-provider.ts` | tesseract.js OCR 实现 |
| `import/ai-classifier.ts` | AI 文档分类器 |
| `import/adapters/pdf-adapter.ts` | PDF 导入适配器 |
| `resources/prompts/import/classify.md` | 分类 prompt 模板 |
| `renderer/components/import/ClassificationConfirmPanel.tsx` | 分类确认 UI |
| `tests/fixtures/import/` | 测试 fixture 文件 |

## 新增 IPC 通道

| IPC 通道 | 方向 | 说明 |
|---------|------|------|
| `file:import:classification` | Main → Renderer | 推送分类建议到渲染进程 |
| `file:import:confirmClassification` | Renderer → Main | 用户确认分类结果 |

注：复用 TASK040 已有的 `file:import:progress` 通道，扩展 `stage` 字段值增加 `ocr` 和 `classifying`。

## 涉及的现有文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/main/services/import/types.ts` | 扩展 | 新增 OcrOptions/OcrResult/ClassificationResult 等类型 |
| `src/main/services/import/adapters/index.ts` | 扩展 | 导出 PdfAdapter + 注册到默认列表 |
| `src/main/services/import-manager.ts` | 扩展 | convertPdfToMarkdown() 委托 PdfAdapter |
| `src/main/ipc/handlers/import-pipeline.ts` | 扩展 | 新增分类确认 IPC 处理 |
| `src/shared/types.ts` | 扩展 | 新增分类相关 IPC 通道常量 |
| `src/preload/index.ts` | 扩展 | 新增分类确认 IPC 暴露 |
| IPC 注册入口 | 扩展 | 注册分类确认 handler |

**不修改的文件：**
- `src/main/services/ai-gateway-client.ts` — AiClassifier 仅通过其接口调用，不修改实现
- `src/main/services/context-engine/` — AiClassifier 通过 PromptComposer 接口调用
- `src/main/services/file-manager.ts` — 仅作为被调用方
- `src/main/services/sync-manager.ts` — 不涉及

---

**创建时间：** 2026-04-24
**最后更新：** 2026-04-24
**更新记录：**
- 2026-04-24 — 创建任务文档（含完整技术执行路径 8 步）

