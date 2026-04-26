# 导入管道与多平台适配器

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK040 |
| **任务标题** | 导入管道与多平台适配器 |
| **所属阶段** | Phase 1 - 迁移、导入与 MCP 集成 (Sprint 3.6) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 5-6 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

构建 Sprint 3.6 的导入基础设施——可插拔的 ImportAdapter 管道架构与 5 个核心平台适配器（Notion / Google Docs / Obsidian / 本地 Markdown / Word），以及导入历史与 Git 回滚机制。让新用户一键导入各平台导出包，5 分钟内完成知识迁移。

### 背景

当前 `ImportManager`（`src/main/services/import-manager.ts`）支持 .md/.txt/.csv/.docx/.pdf 五种格式的简单导入，但存在以下局限：

| 问题 | 现状 | 影响 |
|------|------|------|
| 无法导入平台导出包 | 仅支持单文件，不支持 .zip / 文件夹导入 | Notion / Google Docs 导出包无法识别 |
| 无平台格式感知 | 所有格式统一处理，丢失平台特有结构 | Notion 数据库、Obsidian wikilinks 丢失 |
| 无三阶段管道 | 扫描、转换、写入耦合在一起 | 无法暂停/取消/显示进度 |
| 无回滚能力 | 导入失败后残留文件需手动清理 | 批量导入风险高 |
| 图片处理缺失 | 不处理附件和图片引用 | 图片链接断裂 |

**核心设计约束**：

1. **渐进增强**：保留 `ImportManager` 作为兼容层，新增 `ImportPipeline` + `ImportAdapter` 注册表，通过 `@deprecated` 标记引导迁移
2. **现有 IPC 通道不变**：`file:import` 通道保持向后兼容，内部升级调用 Pipeline
3. **Git 回滚扩展**：在 `GitAbstraction` 上新增 `createTag()`/`revertCommit()` 方法，不改现有签名
4. **事务性文件系统**：导入操作通过 Git 暂存实现事务性，失败可回滚
5. **流式处理**：大包导入（>500 文件）采用流式处理 + AsyncIterable，避免内存爆炸

### 范围

**包含：**

- ImportAdapter 统一接口与 ImportPlan/ImportItem 类型定义
- ImportRegistry 适配器注册表（自动检测格式 → 匹配适配器）
- ImportPipeline 三阶段管道（扫描 → 转换 → 写入），支持暂停/取消/恢复
- NotionAdapter — .zip (Markdown+CSV / HTML) 导出包解析
- GoogleDocsAdapter — .zip (包含 .docx) 导出包解析
- ObsidianAdapter — 文件夹 / vault 导入，保留 wikilinks 和 tags
- MarkdownAdapter — 本地 Markdown 文件夹导入
- DocxAdapter — .docx / .doc 单文件或批量导入
- ImportHistoryManager — 导入历史记录与 Git tag 快照回滚
- GitAbstraction 扩展 — `createBranch()`/`createTag()`/`revertCommit()`/`getCommitHash()`
- ImportManager 兼容层改造 — `importWithPipeline()` 委托，原方法标记 `@deprecated`
- IPC 通道扩展 — `file:import:plan`/`file:import:cancel`/`file:import:pause`/`file:import:resume`
- 图片资产处理 — 复制到 `assets/` 目录，重写相对路径

**不包含：**

- PDF 导入与 OCR（TASK041）
- AI 自动分类（TASK041）
- MCP 持续同步导入（TASK043）
- 首次引导 UI（TASK044）
- Apple Notes 导入（v1.1 扩展）

## 依赖关系

### 前置依赖

- [x] TASK001 — 文件树浏览器（FileManager 已可用，文件读写基础）
- [x] TASK005 — 自动保存与提交（GitAbstraction 已可用，需扩展）
- [x] TASK004 — 文件导入（现有 ImportManager 已可用，本任务在其上增强）

### 被依赖任务

- TASK041 — AI OCR 与结构化分类（PdfAdapter 依赖 ImportPipeline + ImportRegistry）
- TASK044 — Aha Moment 首次引导体验（导入 UI 复用 ImportPipeline 进度回调）

## 参考文档

- [`specs/requirements/phase1/sprint3.6-MCP.md`](../../requirements/phase1/sprint3.6-MCP.md) — 需求 2.1、2.7、§1.3、§6.2
- [`specs/design/architecture.md`](../../design/architecture.md) — Git 抽象层接口、进程通信架构
- [`CLAUDE.md`](../../../CLAUDE.md) — 文件即真相、AI 建议/人类决策、Git 不可见
- `.kilocode/skills/phase0/isomorphic-git-integration/SKILL.md` — Git 抽象层设计指南
- `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` — IPC 类型安全设计
- `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` — TypeScript 严格模式

## 验收标准

### ImportAdapter 接口与类型

- [ ] `src/main/services/import/types.ts` 创建，定义 `ImportAdapter`、`ImportPlan`、`ImportItem`、`ImportOptions`、`ImportResult`、`ImportError` 类型
- [ ] `ImportAdapter` 接口包含 `name`、`detect(input): Promise<boolean>`、`scan(input): Promise<ImportPlan>`、`transform(plan, options): AsyncIterable<ImportItem>` 方法
- [ ] `ImportPlan` 包含 `sourceFormat`、`totalFiles`（预估）、`totalImages`（预估）、`warnings`、`estimatedDurationMs`
- [ ] `ImportItem` 包含 `sourcePath`、`targetPath`、`content`（Markdown）、`attachments`（图片等）、`metadata`（frontmatter）
- [ ] `ImportOptions` 包含 `targetDir`、`conflictStrategy`（skip/overwrite/rename）、`preserveStructure`、`signal`（AbortSignal）
- [ ] `ImportResult` 包含 `importedFiles`、`importedImages`、`skippedFiles`、`errors`、`durationMs`

### ImportRegistry 适配器注册表

- [ ] `ImportRegistry` 启动时自动注册所有内置适配器
- [ ] `detectAdapter(input)` 方法逐个调用适配器的 `detect()`，返回匹配的适配器（首个匹配优先）
- [ ] 支持按文件扩展名预过滤优化（.zip → Notion/Google Docs；文件夹 → Obsidian/Markdown；.docx → Docx）
- [ ] 注册表支持运行时动态注册新适配器（为未来插件铺路）

### ImportPipeline 三阶段管道

- [ ] `ImportPipeline.run(input, options)` 执行完整三阶段流程
- [ ] **扫描阶段**：调用 `adapter.scan(input)`，返回 ImportPlan 并推送到渲染进程预览
- [ ] **转换阶段**：调用 `adapter.transform(plan, options)`，返回 AsyncIterable 逐项产出 ImportItem
- [ ] **写入阶段**：逐个写入 ImportItem，更新文件树，复制附件到 assets/
- [ ] 每个阶段可独立暂停（`pipeline.pause()`）和恢复（`pipeline.resume()`）
- [ ] 取消操作（`pipeline.cancel()`）触发回滚，恢复到导入前状态
- [ ] 进度回调：每处理一个 ImportItem 推送 `{ current, total, currentFile }` 到渲染进程
- [ ] 流式处理：>500 文件时使用 AsyncIterable 逐项处理，不将全部 ImportItem 缓存在内存中

### Notion 适配器

- [ ] `NotionAdapter.detect()` 识别 .zip 文件并检查内部结构（包含 CSV + Markdown 或 HTML）
- [ ] Markdown+CSV 模式：解析 CSV 为数据库表格，解析 Markdown 页面，保留层级关系
- [ ] HTML 模式：将 HTML 转为 Markdown（使用 turndown），保留标题/列表/表格结构
- [ ] 页面层级推断：基于 zip 内目录结构重建页面树
- [ ] 图片提取：从 zip 中提取图片文件，复制到 `assets/` 并重写 Markdown 中的引用路径
- [ ] 数据库表格转换：CSV → Markdown 表格，保留列头和数据行

### Google Docs 适配器

- [ ] `GoogleDocsAdapter.detect()` 识别 .zip 文件并检查内部 .docx 文件
- [ ] 使用 mammoth.js 将 .docx 转为 Markdown
- [ ] 保留段落、标题、列表、表格格式
- [ ] 图片从 .docx 中提取，保存到 `assets/` 目录
- [ ] 多文档批量导入，每个 .docx 独立转换

### Obsidian 适配器

- [ ] `ObsidianAdapter.detect()` 识别包含 `.obsidian/` 目录的文件夹
- [ ] 保留 `[[wikilinks]]` 语法，不转换为标准链接（用户可后续选择转换）
- [ ] 保留 YAML frontmatter 中的 tags 字段
- [ ] 复制整个 vault 结构，包括附件目录
- [ ] `.obsidian/` 配置目录不导入（仅导入用户内容）
- [ ] 插件特有语法（如 Dataview 查询块）跳过并标记 warning

### Markdown 适配器

- [ ] `MarkdownAdapter.detect()` 识别包含 .md 文件的文件夹
- [ ] 递归扫描目录结构，原样复制 Markdown 文件
- [ ] 保留原有目录层级
- [ ] 非文本文件（图片等）复制到 `assets/` 对应子目录

### Word 适配器

- [ ] `DocxAdapter.detect()` 识别 .docx/.doc 单文件
- [ ] 使用 mammoth.js 转换为 Markdown
- [ ] 表格转换：简单表格保留，复杂表格尝试最佳转换
- [ ] 图片提取并保存到 `assets/`
- [ ] 支持批量 .docx 文件导入（多文件选择）

### 图片资产处理

- [ ] 所有适配器产出的图片附件统一复制到 `{targetDir}/assets/{importId}/` 目录
- [ ] Markdown 中的图片引用路径重写为相对路径 `assets/{importId}/xxx.png`
- [ ] 支持的图片格式：png / jpg / jpeg / gif / svg / webp
- [ ] 图片重名时自动重命名（追加序号）

### GitAbstraction 扩展

- [ ] `createBranch(name: string): Promise<void>` 创建分支
- [ ] `createTag(tagName: string, message?: string): Promise<void>` 创建 tag（轻量标签）
- [ ] `revertCommit(commitHash: string): Promise<string>` 创建 revert 提交，返回新 commit hash
- [ ] `getCommitHash(): Promise<string>` 获取当前 HEAD commit hash
- [ ] 现有方法签名不做任何修改（纯扩展）

### ImportHistoryManager 导入历史

- [ ] 导入前自动创建 tag 快照（命名格式：`sibylla-import/YYYY-MM-DD-{seq}`）
- [ ] 导入记录存储于 `.sibylla/import-history/{importId}.json`
- [ ] 记录结构包含：`importId`、`timestamp`、`sourceFormat`、`preImportCommitHash`、`files`、`tag`
- [ ] `listHistory()` 返回所有导入记录列表
- [ ] `rollback(importId)` 调用 `gitAbstraction.revertCommit()` 创建反转提交
- [ ] 回滚前展示受影响文件列表预览
- [ ] 导入 ≥7 天时回滚显示警告（可能已有新修改覆盖）
- [ ] 超过 30 天的记录自动清理（可配置）

### ImportManager 兼容层

- [ ] 新增 `importWithPipeline(input, options)` 方法，委托给 `ImportPipeline.run()`
- [ ] 原有 `importFiles()` 方法标记 `@deprecated`，内部改为委托给对应 Adapter
- [ ] 现有 `file:import` IPC 通道保持不变，内部升级调用 Pipeline
- [ ] 现有 `convertPdfToMarkdown()` 保留（TASK041 将替换为 PdfAdapter）

### IPC 通道

- [ ] `file:import` 保持原有签名，内部升级调用 Pipeline
- [ ] `file:import:plan`（R→M）— 扫描阶段，返回 ImportPlan 预览
- [ ] `file:import:execute`（R→M）— 执行导入，接受 ImportOptions
- [ ] `file:import:cancel`（R→M）— 取消导入并回滚
- [ ] `file:import:pause`（R→M）— 暂停导入
- [ ] `file:import:resume`（R→M）— 恢复导入
- [ ] `file:import:progress`（M→R）— 进度推送，包含 `{ current, total, currentFile, stage }`
- [ ] `file:import:history`（R→M）— 查询导入历史
- [ ] `file:import:rollback`（R→M）— 回滚指定导入

### 单元测试

- [ ] ImportPipeline 三阶段流程测试（正常完成 / 暂停恢复 / 取消回滚）
- [ ] 每个适配器的 `detect()` 测试（正确识别 / 正确拒绝）
- [ ] Notion 适配器端到端测试（使用 fixture zip）
- [ ] Obsidian 适配器 wikilinks 保留测试
- [ ] Docx 适配器格式转换测试
- [ ] 图片资产处理路径重写测试
- [ ] ImportHistoryManager 记录与回滚测试
- [ ] GitAbstraction 新方法测试
- [ ] 大文件流式处理内存测试（>500 文件不 OOM）
- [ ] 覆盖率 ≥ 80%

## 技术策略

### 核心架构：三阶段管道 + 插件化适配器

```
用户拖拽/选择文件
       │
       ▼
ImportRegistry.detectAdapter(input)
       │ ← 按优先级匹配适配器
       ▼
ImportPipeline.run(input, options)
       │
       ├── 阶段 1: scan()
       │   └── adapter.scan(input) → ImportPlan
       │       推送预览到渲染进程
       │
       ├── 阶段 2: transform()
       │   └── adapter.transform(plan, options) → AsyncIterable<ImportItem>
       │       逐项转换，支持暂停/恢复
       │
       └── 阶段 3: write()
           └── 逐项写入文件系统
               ├── FileManager.writeFile()
               ├── 图片复制到 assets/
               └── 路径重写
       │
       ▼
ImportHistoryManager.record(result)
       │ ← 创建 Git tag 快照
       ▼
AutoSaveManager → GitAbstraction.commit()
```

### 渐进增强策略

**现有 ImportManager 保留为兼容层**：

```typescript
// import-manager.ts — 兼容层改造
class ImportManager {
  private pipeline: ImportPipeline

  // 新方法：委托给 Pipeline
  async importWithPipeline(
    input: string, options: ImportOptions
  ): Promise<ImportResult> {
    return this.pipeline.run(input, options)
  }

  // 原方法标记 @deprecated，内部委托
  /** @deprecated 使用 importWithPipeline() 替代 */
  async importFiles(files: string[]): Promise<void> {
    // 委托给对应 Adapter
  }
}
```

### Git 回滚机制

导入前创建 tag 快照，回滚使用 revert（非 hard reset）以保留历史完整性：

```
导入前:
  HEAD → commit-abc123
  创建 tag: sibylla-import/2026-04-24-001

导入中:
  HEAD → commit-def456 (导入文件 commit)

导入后需要回滚:
  执行 git revert commit-def456
  HEAD → commit-ghi789 (revert commit)
  tag sibylla-import/2026-04-24-001 仍指向 commit-abc123
```

### 流式处理策略

>500 文件时采用 AsyncIterable 逐项产出，避免全量缓存：

```typescript
// 适配器使用 AsyncIterable 逐项产出
async *transform(plan: ImportPlan, options: ImportOptions): AsyncIterable<ImportItem> {
  for (const entry of plan.entries) {
    // 检查暂停/取消信号
    if (options.signal?.aborted) return
    while (this.paused) {
      await new Promise(r => setTimeout(r, 100))
    }
    yield this.convertEntry(entry)
  }
}
```

### 依赖库选型

| 用途 | 库 | 说明 |
|------|-----|------|
| .zip 解压 | `adm-zip` 或 `yauzl` | Notion / Google Docs 导出包解析 |
| .docx 转 Markdown | `mammoth` | 现有依赖，保留 |
| HTML 转 Markdown | `turndown` | Notion HTML 导出模式 |
| CSV 解析 | `papaparse` 或内置 | Notion 数据库导出 |
| 文件类型检测 | `file-type` | 基于魔数的格式检测 |

## 技术执行路径

### 步骤 1：定义导入管道共享类型

**文件：** `src/main/services/import/types.ts`（新建）

1. 定义 `ImportAdapter` 接口——所有适配器的统一契约：
   ```typescript
   export interface ImportAdapter {
     name: string
     detect(input: string | Buffer): Promise<boolean>
     scan(input: string): Promise<ImportPlan>
     transform(plan: ImportPlan, options: ImportOptions): AsyncIterable<ImportItem>
   }
   ```

2. 定义 `ImportPlan`——扫描阶段产物，包含预估文件数、图片数、警告、预计耗时：
   ```typescript
   export interface ImportPlan {
     id: string
     sourceFormat: string
     sourcePath: string
     totalFiles: number
     totalImages: number
     warnings: string[]
     estimatedDurationMs: number
     entries: ImportPlanEntry[]
   }
   ```

3. 定义 `ImportItem`——转换阶段逐项产出的文件单元，包含源路径、目标路径、Markdown 内容、附件列表、frontmatter 元数据。

4. 定义 `ImportOptions`——用户可配置项：`targetDir`、`conflictStrategy`（skip/overwrite/rename）、`preserveStructure`、`signal`（AbortSignal 用于取消）。

5. 定义 `ImportResult`——最终结果汇总：已导入文件数、图片数、跳过数、错误列表、耗时。

6. 定义 `ImportError`——结构化错误：包含文件路径、错误类型（format_unsupported / conversion_failed / write_failed / disk_full）、原始错误信息。

**验证：** TypeScript 编译通过，所有类型无 `any`。

### 步骤 2：实现 ImportRegistry 适配器注册表

**文件：** `src/main/services/import/import-registry.ts`（新建）

1. 构造函数注入适配器列表：
   ```typescript
   export class ImportRegistry {
     private adapters: ImportAdapter[] = []

     register(adapter: ImportAdapter): void {
       this.adapters.push(adapter)
     }

     async detectAdapter(input: string): Promise<ImportAdapter | null> {
       // 按优先级逐个调用 detect()
     }
   }
   ```

2. 实现 `register(adapter)`——运行时动态注册新适配器（为未来插件铺路）。

3. 实现 `async detectAdapter(input: string): Promise<ImportAdapter | null>`：
   - 基于文件扩展名预过滤优化（.zip → Notion/Google Docs；文件夹 → Obsidian/Markdown；.docx → Docx）
   - 对候选适配器逐个调用 `detect(input)`
   - 返回首个匹配的适配器

4. 实现 `static createDefault(): ImportRegistry` 工厂方法：
   - 创建注册表实例
   - 按 Notion → GoogleDocs → Obsidian → Markdown → Docx 优先级注册所有内置适配器
   - 返回实例

5. 导出 `createImportRegistry()` 便捷函数，供主进程装配调用。

**验证：** 注册表可正确匹配各格式输入。

### 步骤 3：实现 ImportPipeline 三阶段管道

**文件：** `src/main/services/import/import-pipeline.ts`（新建）

这是导入系统的核心调度器，串联扫描→转换→写入三个阶段。

1. 定义管道状态枚举和内部状态：
   ```typescript
   type PipelineState = 'idle' | 'scanning' | 'transforming' | 'writing' | 'completed' | 'cancelled' | 'failed'

   export class ImportPipeline {
     private state: PipelineState = 'idle'
     private paused = false
     private abortController = new AbortController()
     private currentProgress: ImportProgress = { current: 0, total: 0, currentFile: '', stage: 'idle' }
   }
   ```

2. 构造函数注入依赖：
   ```typescript
   constructor(
     private readonly registry: ImportRegistry,
     private readonly fileManager: FileManager,
     private readonly historyManager: ImportHistoryManager,
     private readonly gitAbstraction: GitAbstraction,
     private readonly logger: Logger,
     private readonly onProgress?: (progress: ImportProgress) => void,
   ) {}
   ```

3. 实现 `async run(input: string, options: ImportOptions): Promise<ImportResult>`：
   ```
   a. 初始化状态和 AbortController
   b. 阶段 1 — 扫描：
      adapter = await registry.detectAdapter(input)
      plan = await adapter.scan(input)
      推送进度 { stage: 'scanning', totalFiles: plan.totalFiles }
      将 plan 发送到渲染进程预览（通过 onProgress 回调）

   c. 阶段 2+3 — 转换并写入（流式处理）：
      result = { importedFiles: 0, importedImages: 0, skippedFiles: 0, errors: [], durationMs: 0 }
      for await (const item of adapter.transform(plan, options)):
        // 检查暂停信号
        while (this.paused && !this.abortController.signal.aborted):
          await sleep(100)

        // 检查取消信号
        if (this.abortController.signal.aborted): break

        // 写入文件
        await this.writeItem(item, options)
        result.importedFiles++

        // 推送进度
        this.onProgress?.({ current: result.importedFiles, total: plan.totalFiles, currentFile: item.targetPath, stage: 'writing' })

   d. 记录导入历史
   e. 返回 result
   ```

4. 实现 `private async writeItem(item: ImportItem, options: ImportOptions): Promise<void>`：
   - 计算目标路径（基于 `options.targetDir` + `item.targetPath`）
   - 冲突处理：根据 `options.conflictStrategy` 决定跳过/覆盖/重命名
   - 通过 `FileManager.writeFile()` 写入 Markdown 内容
   - 处理附件：复制图片到 `{targetDir}/assets/{importId}/`，重写 Markdown 中的引用路径
   - 原子写入：先写临时文件再替换

5. 实现 `pause()` / `resume()` / `cancel()`：
   - `pause()` 设置 `this.paused = true`
   - `resume()` 设置 `this.paused = false`
   - `cancel()` 调用 `this.abortController.abort()`，触发回滚（调用 `historyManager.rollbackLatest()`）

6. 实现 `getState(): PipelineState` 返回当前管道状态。

**验证：** 三阶段管道正常完成、暂停恢复正确、取消回滚正确、进度推送正确。

### 步骤 4：实现 Notion 适配器

**文件：** `src/main/services/import/adapters/notion-adapter.ts`（新建）

Notion 导出包是最复杂的适配器，支持两种模式：Markdown+CSV 和 HTML。

1. 实现 `detect(input)`：
   - 检查是否为 `.zip` 文件
   - 解压到临时目录，检查内部结构
   - 包含 `*.csv` + `*.md` → Markdown+CSV 模式
   - 包含 `*.html` → HTML 模式
   - 不匹配则清理临时目录返回 false

2. 实现 `scan(input)`：
   - 解压 zip 到临时目录
   - Markdown+CSV 模式：统计 `.md` 和 `.csv` 文件数量，解析目录层级推断页面树
   - HTML 模式：统计 `.html` 文件数量，收集图片文件列表
   - 返回 ImportPlan（含预估文件数和图片数）

3. 实现 `async *transform(plan, options)`：
   - Markdown+CSV 模式处理逻辑：
     ```
     for each .md file:
       读取内容
       修复 Notion 特有格式（如 {{embed}} 占位符 → 原文链接）
       yield { sourcePath, targetPath, content, attachments: [], metadata: { source: 'notion' } }

     for each .csv file:
       解析 CSV 为表格
       转为 Markdown 表格格式
       yield { sourcePath, targetPath: csvPath.replace('.csv', '.md'), content: markdownTable }
     ```
   - HTML 模式处理逻辑：
     ```
     for each .html file:
       使用 turndown 转为 Markdown
       保留标题/列表/表格结构
       提取图片引用
       yield { sourcePath, targetPath, content, attachments: images }
     ```
   - 图片路径重写：所有图片引用改为 `assets/{importId}/{filename}` 相对路径

4. 内部辅助方法：
   - `private fixNotionMarkdown(content: string): string` — 修复 Notion 特有格式
   - `private csvToMarkdownTable(csvContent: string): string` — CSV 转 Markdown 表格
   - `private rewriteImagePaths(content: string, importId: string): string` — 图片路径重写

**验证：** Notion Markdown+CSV 导出包正确导入、HTML 导出包正确导入、图片路径正确重写、页面层级正确保留。

### 步骤 5：实现 Google Docs 适配器

**文件：** `src/main/services/import/adapters/google-docs-adapter.ts`（新建）

1. 实现 `detect(input)`：
   - 检查是否为 `.zip` 文件
   - 解压检查是否包含 `.docx` 文件
   - 匹配返回 true，否则清理临时目录返回 false

2. 实现 `scan(input)`：
   - 解压 zip 到临时目录
   - 统计 `.docx` 文件数量
   - 返回 ImportPlan

3. 实现 `async *transform(plan, options)`：
   ```
   for each .docx file:
     使用 mammoth.convertToMarkdown({ path: docxPath }) 转换
     收集 mammoth 警告（记录但不阻塞）
     提取图片：
       mammoth.extractRawImages({ path: docxPath })
       图片保存为 attachments
     重写图片引用路径
     yield { sourcePath, targetPath, content, attachments, metadata }
   ```

4. 图片处理：
   - 从 mammoth 提取的图片写入 `attachments` 数组
   - 图片格式支持：png / jpg / gif / svg / webp
   - 重名图片自动追加序号

**验证：** Google Docs 导出包正确导入、段落/标题/列表/表格保留、图片正确提取和路径重写。

### 步骤 6：实现 Obsidian 适配器

**文件：** `src/main/services/import/adapters/obsidian-adapter.ts`（新建）

1. 实现 `detect(input)`：
   - 检查是否为文件夹
   - 检查文件夹内是否包含 `.obsidian/` 目录（Obsidian 配置目录的特征标记）
   - 或者包含大量 `.md` 文件 + `[[wikilinks]]` 语法

2. 实现 `scan(input)`：
   - 递归扫描目录，统计 `.md` 文件数量
   - 排除 `.obsidian/` 配置目录
   - 检测附件目录（通常为附件设置中配置的路径）
   - 返回 ImportPlan

3. 实现 `async *transform(plan, options)`：
   ```
   for each .md file (排除 .obsidian/ 目录):
     读取内容
     保留 [[wikilinks]] 语法不转换
     保留 YAML frontmatter 中的 tags 字段
     检测插件特有语法（Dataview 查询块等），标记 warning
     yield { sourcePath, targetPath: 保持相对路径, content, attachments: [], metadata: { tags, frontmatter } }
   ```

4. 附件处理：
   - 复制附件目录到 `assets/{importId}/`
   - 重写 `![[image.png]]` 为 `![](assets/{importId}/image.png)`

5. 插件特有语法处理：
   - Dataview 查询块（```dataview ... ```）：跳过并标记 warning
   - Templater 模板语法：跳过并标记 warning
   - 其他未知插件语法：原样保留，标记 warning

**验证：** Obsidian vault 正确导入、wikilinks 保留、tags 保留、附件正确复制、插件语法警告正确。

### 步骤 7：实现 Markdown 和 Word 适配器

**文件：** `src/main/services/import/adapters/markdown-adapter.ts`（新建）

1. 实现 `detect(input)`：
   - 检查是否为文件夹
   - 检查文件夹内是否包含 `.md` 文件
   - 排除已被 ObsidianAdapter 匹配的情况（优先级低于 ObsidianAdapter）

2. 实现 `scan(input)`：
   - 递归扫描 `.md` 文件
   - 统计非文本文件（图片等）
   - 返回 ImportPlan

3. 实现 `async *transform(plan, options)`：
   - 逐个读取 `.md` 文件，原样复制
   - 保留原有目录层级
   - 非文本文件收集为 attachments，复制到 `assets/` 对应子目录
   - yield ImportItem

**文件：** `src/main/services/import/adapters/docx-adapter.ts`（新建）

4. 实现 `detect(input)`：
   - 检查文件扩展名是否为 `.docx` 或 `.doc`
   - 对于 `.doc` 格式：返回 false 并记录 warning（不支持旧格式）

5. 实现 `scan(input)`：
   - 支持单文件和批量文件（多文件选择场景）
   - 返回 ImportPlan

6. 实现 `async *transform(plan, options)`：
   - 使用 mammoth 转换为 Markdown
   - 表格转换：简单表格保留，复杂表格尝试最佳转换
   - 图片提取保存到 `assets/`
   - yield ImportItem

**验证：** Markdown 文件夹原样导入、目录层级保留、Docx 格式转换正确、图片提取正确。

### 步骤 8：实现图片资产处理统一工具

**文件：** `src/main/services/import/asset-handler.ts`（新建）

各适配器共用的图片资产处理逻辑抽离为独立工具模块。

1. 实现 `async copyAssets(attachments: AssetAttachment[], targetDir: string, importId: string): Promise<AssetCopyResult>`：
   - 创建目标目录 `{targetDir}/assets/{importId}/`
   - 逐个复制图片文件
   - 支持格式：png / jpg / jpeg / gif / svg / webp
   - 重名时自动追加序号（`image.png` → `image_1.png`）
   - 返回复制结果（成功数 / 失败数 / 重命名数）

2. 实现 `rewriteImagePaths(content: string, importId: string, pathMapping: Map<string, string>): string`：
   - 正则匹配 Markdown 图片语法 `![alt](path)`
   - 根据路径映射表替换为新的相对路径
   - 处理 Obsidian 格式 `![[image.png]]` → `![](assets/{importId}/image.png)`

3. 定义 `AssetAttachment` 类型：
   ```typescript
   export interface AssetAttachment {
     sourcePath: string
     fileName: string
     buffer?: Buffer
   }
   ```

4. 定义 `AssetCopyResult` 类型：
   ```typescript
   export interface AssetCopyResult {
     copied: number
     failed: number
     renamed: number
     pathMapping: Map<string, string>
   }
   ```

**验证：** 图片正确复制、路径正确重写、重名自动重命名、不支持的格式跳过。

### 步骤 9：扩展 GitAbstraction + 实现 ImportHistoryManager

**文件：** `src/main/services/git-abstraction.ts`（修改）

在现有 GitAbstraction 上新增 4 个方法，纯扩展不改现有签名。

1. 实现 `async createBranch(name: string): Promise<void>`：
   - 使用 `git.branch({ fs, dir, ref: name })` 创建分支
   - 不自动切换到新分支

2. 实现 `async createTag(tagName: string, message?: string): Promise<void>`：
   - 如果提供 message，使用 `git.annotatedTag()` 创建附注标签
   - 否则使用 `git.tag()` 创建轻量标签
   - 标签名格式：`sibylla-import/YYYY-MM-DD-{seq}`

3. 实现 `async revertCommit(commitHash: string): Promise<string>`：
   - 读取目标 commit 的变更文件列表
   - 对每个文件执行反向变更
   - 创建 revert commit，返回新 commit hash
   - commit message 格式：`还原导入操作`

4. 实现 `async getCommitHash(): Promise<string>`：
   - 使用 `git.resolveRef({ fs, dir, ref: 'HEAD' })` 获取当前 HEAD hash

**文件：** `src/main/services/import/import-history-manager.ts`（新建）

5. 构造函数注入依赖：
   ```typescript
   export class ImportHistoryManager {
     constructor(
       private readonly baseDir: string,    // .sibylla/import-history/
       private readonly gitAbstraction: GitAbstraction,
       private readonly logger: Logger,
     ) {}
   }
   ```

6. 实现 `async record(importResult: ImportResult, plan: ImportPlan, tag: string): Promise<ImportRecord>`：
   - 生成 importId（UUID）
   - 获取当前 commit hash 作为 `preImportCommitHash`
   - 创建 tag 快照
   - 写入记录文件 `.sibylla/import-history/{importId}.json`
   - 记录结构：`{ importId, timestamp, sourceFormat, preImportCommitHash, files: string[], tag }`

7. 实现 `async listHistory(): Promise<ImportRecord[]>`：
   - 扫描 `.sibylla/import-history/` 目录
   - 按时间倒序返回所有记录

8. 实现 `async rollback(importId: string): Promise<RollbackResult>`：
   - 读取记录获取 `preImportCommitHash`
   - 获取导入产生的所有 commit（tag 到 HEAD 之间）
   - 展示受影响文件列表预览（供渲染进程展示确认对话框）
   - 执行 `gitAbstraction.revertCommit()` 创建反转提交
   - 更新记录状态为 `rolled_back`
   - 返回 RollbackResult（成功/失败 + 受影响文件列表）

9. 实现 `async cleanupOldRecords(maxAgeDays: number = 30): Promise<number>`：
   - 扫描所有记录
   - 超过 30 天的记录标记为已过期
   - 返回清理数量

10. 实现 `async getAffectedFiles(importId: string): Promise<string[]>`：
    - 对比 tag 指向的 commit 和其父 commit 之间的 diff
    - 返回变更文件列表

**验证：** Git 新方法正确、导入记录正确创建和存储、回滚正确创建 revert commit、旧记录自动清理。

### 步骤 10：实现 ImportManager 兼容层 + IPC 通道

**文件：** `src/main/services/import-manager.ts`（修改）

1. 新增 `importWithPipeline(input, options)` 方法：
   ```typescript
   async importWithPipeline(input: string, options?: ImportOptions): Promise<ImportResult> {
     return this.pipeline.run(input, options ?? {})
   }
   ```

2. 原有 `importFiles()` 方法标记 `@deprecated`，内部改为委托：
   ```typescript
   /** @deprecated 使用 importWithPipeline() 替代 */
   async importFiles(files: string[], options?: ImportOptions): Promise<ImportResult> {
     // 单文件委托给 DocxAdapter/MarkdownAdapter
     // 多文件委托给 ImportPipeline
   }
   ```

3. 保留 `convertPdfToMarkdown()` 方法（TASK041 将替换为 PdfAdapter）。

**文件：** `src/main/ipc/handlers/import-pipeline.ts`（新建）

4. 注册 `file:import:plan` handler：
   - 调用 `registry.detectAdapter(input)` + `adapter.scan(input)`
   - 返回 ImportPlan 给渲染进程预览

5. 注册 `file:import:execute` handler：
   - 创建 ImportPipeline 实例
   - 注入 progress 回调，通过 `event.sender.send('file:import:progress', data)` 推送进度
   - 调用 `pipeline.run(input, options)`
   - 返回 ImportResult

6. 注册 `file:import:cancel` handler：
   - 调用 `pipeline.cancel()` 触发回滚

7. 注册 `file:import:pause` / `file:import:resume` handler：
   - 调用 `pipeline.pause()` / `pipeline.resume()`

8. 注册 `file:import:history` handler：
   - 调用 `historyManager.listHistory()`

9. 注册 `file:import:rollback` handler：
   - 调用 `historyManager.rollback(importId)`
   - 返回受影响文件列表

10. 保持现有 `file:import` handler 不变，内部升级为调用 Pipeline。

**文件：** `src/shared/types.ts`（扩展）

11. 新增导入管道相关 IPC 通道常量：
    ```typescript
    FILE_IMPORT_PLAN: 'file:import:plan',
    FILE_IMPORT_EXECUTE: 'file:import:execute',
    FILE_IMPORT_CANCEL: 'file:import:cancel',
    FILE_IMPORT_PAUSE: 'file:import:pause',
    FILE_IMPORT_RESUME: 'file:import:resume',
    FILE_IMPORT_PROGRESS: 'file:import:progress',
    FILE_IMPORT_HISTORY: 'file:import:history',
    FILE_IMPORT_ROLLBACK: 'file:import:rollback',
    ```

**文件：** `src/preload/index.ts`（扩展）

12. 新增 `importPipeline` 命名空间：
    ```typescript
    importPipeline: {
      plan: (input: string) => ipcRenderer.invoke('file:import:plan', input),
      execute: (input: string, options?: ImportOptions) => ipcRenderer.invoke('file:import:execute', input, options),
      cancel: () => ipcRenderer.invoke('file:import:cancel'),
      pause: () => ipcRenderer.invoke('file:import:pause'),
      resume: () => ipcRenderer.invoke('file:import:resume'),
      onProgress: (callback: (data: ImportProgress) => void) =>
        ipcRenderer.on('file:import:progress', (_, data) => callback(data)),
      history: () => ipcRenderer.invoke('file:import:history'),
      rollback: (importId: string) => ipcRenderer.invoke('file:import:rollback', importId),
    }
    ```

**验证：** IPC 通道注册正确、渲染进程可通过 IPC 调用导入管道、进度推送正确。

### 步骤 11：单元测试

**文件：** `tests/main/services/import/`（新建目录）

1. `import-registry.test.ts`：
   - `detectAdapter()` 对各种格式的输入正确匹配适配器
   - `.zip` 文件优先尝试 Notion/GoogleDocs 适配器
   - 文件夹优先尝试 Obsidian，其次 Markdown
   - `.docx` 单文件匹配 DocxAdapter
   - 不支持的格式返回 null
   - 运行时动态注册新适配器正常工作

2. `import-pipeline.test.ts`：
   - 正常三阶段流程完成导入
   - 暂停后恢复继续导入
   - 取消触发回滚
   - 进度回调正确推送
   - 流式处理（>500 文件）不 OOM

3. `notion-adapter.test.ts`：
   - detect() 正确识别 Notion Markdown+CSV 导出包（使用 fixture zip）
   - detect() 正确识别 Notion HTML 导出包
   - scan() 返回正确的文件数和图片数
   - transform() 正确产出 ImportItem，图片路径重写正确
   - CSV 数据库转 Markdown 表格正确

4. `google-docs-adapter.test.ts`：
   - detect() 正确识别 Google Docs 导出包
   - transform() mammoth 转换正确

5. `obsidian-adapter.test.ts`：
   - detect() 正确识别包含 `.obsidian/` 的文件夹
   - wikilinks 保留测试
   - tags 保留测试
   - 插件特有语法标记 warning

6. `markdown-adapter.test.ts` + `docx-adapter.test.ts`：
   - 基本格式转换测试

7. `asset-handler.test.ts`：
   - 图片复制正确
   - 路径重写正确
   - 重名自动重命名

8. `import-history-manager.test.ts`：
   - 记录创建和读取正确
   - 回滚正确创建 revert commit
   - 旧记录清理正确

9. `git-abstraction-extension.test.ts`：
   - createBranch / createTag / revertCommit / getCommitHash 正确工作

**覆盖率目标：** ≥ 80%

### 步骤 12：创建适配器统一导出 + 主进程装配

**文件：** `src/main/services/import/adapters/index.ts`（新建）

1. 导出所有适配器类：
   ```typescript
   export { NotionAdapter } from './notion-adapter'
   export { GoogleDocsAdapter } from './google-docs-adapter'
   export { ObsidianAdapter } from './obsidian-adapter'
   export { MarkdownAdapter } from './markdown-adapter'
   export { DocxAdapter } from './docx-adapter'
   ```

2. 导出 `registerDefaultAdapters(registry: ImportRegistry): void` 工具函数。

**文件：** `src/main/services/import/index.ts`（新建）

3. 统一导出所有导入模块。

**文件：** 主进程初始化入口（修改）

4. 装配顺序：
   ```
   a. ImportRegistry.createDefault() → 注册所有内置适配器
   b. ImportHistoryManager(baseDir, gitAbstraction, logger)
   c. ImportPipeline(registry, fileManager, historyManager, gitAbstraction, logger)
   d. 修改 ImportManager 注入 pipeline
   e. 注册 import-pipeline IPC handler
   f. 恢复未完成的导入（如有）
   ```

**验证：** 应用启动后导入管道可通过 IPC 调用，完整导入流程可用。

## 现有代码基础

| 已有模块 | 文件路径 | 本任务使用方式 |
|---------|---------|-------------|
| ImportManager | `src/main/services/import-manager.ts` | 保留为兼容层，新增 `importWithPipeline()` 委托 |
| FileManager | `src/main/services/file-manager.ts` | 导入管道写入文件的核心依赖 |
| GitAbstraction | `src/main/services/git-abstraction.ts` | 扩展 4 个方法（createBranch/createTag/revertCommit/getCommitHash） |
| AutoSaveManager | `src/main/services/auto-save-manager.ts` | 导入后触发自动提交（被动调用方） |
| mammoth | 已有依赖 | Google Docs / Docx 适配器使用 |
| pdf-parse | 已有依赖 | TASK041 将替换，本任务不改动 |

**完全缺失、需新建的模块：**

| 模块 | 说明 |
|------|------|
| `import/types.ts` | ImportAdapter/ImportPlan/ImportItem 等类型定义 |
| `import/import-registry.ts` | 适配器注册表 |
| `import/import-pipeline.ts` | 三阶段管道核心 |
| `import/import-history-manager.ts` | 导入历史与回滚 |
| `import/asset-handler.ts` | 图片资产处理工具 |
| `import/adapters/notion-adapter.ts` | Notion 导出包适配器 |
| `import/adapters/google-docs-adapter.ts` | Google Docs 导出包适配器 |
| `import/adapters/obsidian-adapter.ts` | Obsidian vault 适配器 |
| `import/adapters/markdown-adapter.ts` | Markdown 文件夹适配器 |
| `import/adapters/docx-adapter.ts` | Word 文档适配器 |
| `import/adapters/index.ts` | 适配器统一导出 |
| `import/index.ts` | 模块统一导出 |
| `ipc/handlers/import-pipeline.ts` | 导入管道 IPC 处理器 |
| `tests/fixtures/import/` | 测试用 fixture 文件 |

## 新增 IPC 通道

| IPC 通道 | 方向 | 说明 |
|---------|------|------|
| `file:import` | Renderer → Main | 保持原有签名，内部升级调用 Pipeline |
| `file:import:plan` | Renderer → Main | 扫描阶段，返回 ImportPlan 预览 |
| `file:import:execute` | Renderer → Main | 执行导入，接受 ImportOptions |
| `file:import:cancel` | Renderer → Main | 取消导入并回滚 |
| `file:import:pause` | Renderer → Main | 暂停导入 |
| `file:import:resume` | Renderer → Main | 恢复导入 |
| `file:import:progress` | Main → Renderer | 进度推送（包含 current/total/currentFile/stage） |
| `file:import:history` | Renderer → Main | 查询导入历史 |
| `file:import:rollback` | Renderer → Main | 回滚指定导入 |

## 涉及的现有文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/main/services/git-abstraction.ts` | 扩展 | 新增 createBranch/createTag/revertCommit/getCommitHash 4 个方法 |
| `src/main/services/import-manager.ts` | 扩展 | 新增 `importWithPipeline()`，标记旧方法 `@deprecated` |
| `src/shared/types.ts` | 扩展 | 新增导入相关类型 + IPC 通道常量 |
| `src/preload/index.ts` | 扩展 | 新增 importPipeline 命名空间 |
| `src/main/ipc/handlers/import-pipeline.ts` | 新建 | 导入管道 IPC 处理器 |
| IPC 注册入口 | 扩展 | 注册 import-pipeline handler |

**不修改的文件：**
- `src/main/services/file-manager.ts` — 仅作为被调用方
- `src/main/services/auto-save-manager.ts` — 仅作为被调用方
- `src/main/services/sync-manager.ts` — 不涉及

---

**创建时间：** 2026-04-24
**最后更新：** 2026-04-24
**更新记录：**
- 2026-04-24 — 创建任务文档（含完整技术执行路径 12 步）
