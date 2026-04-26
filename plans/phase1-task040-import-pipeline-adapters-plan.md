# PHASE1-TASK040: 导入管道与多平台适配器 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task040_import-pipeline-adapters.md](../specs/tasks/phase1/phase1-task040_import-pipeline-adapters.md)
> 创建日期：2026-04-24
> 最后更新：2026-04-24

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK040 |
| **任务标题** | 导入管道与多平台适配器 |
| **所属阶段** | Phase 1 - 迁移、导入与 MCP 集成 (Sprint 3.6) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 5-6 工作日 |
| **前置依赖** | TASK001 (FileManager) + TASK005 (GitAbstraction) + TASK004 (ImportManager) |

### 1.1 目标

构建可插拔的 ImportAdapter 管道架构与 5 个核心平台适配器（Notion / Google Docs / Obsidian / 本地 Markdown / Word），以及导入历史与 Git 回滚机制。让新用户一键导入各平台导出包，5 分钟内完成知识迁移。

### 1.2 核心设计约束

| 约束 | 来源 | 说明 |
|------|------|------|
| 渐进增强，不替换 | task spec §核心设计约束 | 保留 ImportManager 作兼容层，新增 Pipeline + Adapter |
| IPC 通道向后兼容 | task spec §核心设计约束 | `file:import` 保持不变，新增 `file:import:*` 系列 |
| GitAbstraction 纯扩展 | task spec §核心设计约束 | 新增 4 方法，不修改现有签名 |
| 文件即真相 | CLAUDE.md §二 | 所有内容以 Markdown 明文存储 |
| TS 严格模式禁止 any | CLAUDE.md §四 | 全部代码遵循 TypeScript 严格模式 |
| 进程隔离 | CLAUDE.md §三 | 文件系统访问仅在主进程 |
| 原子写入 | CLAUDE.md §六 | 先写临时文件再原子替换 |

### 1.3 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| 导入管道类型 | `src/main/services/import/types.ts` | ImportAdapter / ImportPlan / ImportItem 等核心接口 |
| 适配器注册表 | `src/main/services/import/import-registry.ts` | detectAdapter + 动态注册 |
| 三阶段管道 | `src/main/services/import/import-pipeline.ts` | 扫描→转换→写入，支持暂停/取消/恢复 |
| Notion 适配器 | `src/main/services/import/adapters/notion-adapter.ts` | .zip (MD+CSV / HTML) |
| Google Docs 适配器 | `src/main/services/import/adapters/google-docs-adapter.ts` | .zip (含 .docx) |
| Obsidian 适配器 | `src/main/services/import/adapters/obsidian-adapter.ts` | vault 文件夹 |
| Markdown 适配器 | `src/main/services/import/adapters/markdown-adapter.ts` | 本地文件夹 |
| Word 适配器 | `src/main/services/import/adapters/docx-adapter.ts` | .docx 单文件/批量 |
| 图片资产处理 | `src/main/services/import/asset-handler.ts` | 复制 + 路径重写 |
| 导入历史管理 | `src/main/services/import/import-history-manager.ts` | 记录 + Git tag + 回滚 |
| 适配器导出 | `src/main/services/import/adapters/index.ts` | 统一导出 + 注册工具 |
| 模块导出 | `src/main/services/import/index.ts` | 模块级统一导出 |
| IPC Handler | `src/main/ipc/handlers/import-pipeline.ts` | 8 个新通道注册 |
| GitAbstraction 扩展 | `src/main/services/git-abstraction.ts`（修改） | 4 个新方法 |
| ImportManager 兼容层 | `src/main/services/import-manager.ts`（修改） | importWithPipeline + @deprecated |
| Shared Types 扩展 | `src/shared/types.ts`（修改） | 新增 IPC 通道常量 + 类型 |
| Preload API 扩展 | `src/preload/index.ts`（修改） | importPipeline 命名空间 |
| 单元测试 | `tests/main/services/import/*.test.ts` | 覆盖率 ≥ 80% |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；文件即真相；AI 建议/人类决策；原子写入；进程隔离 | 全局约束 |
| `specs/design/architecture.md` | Git 抽象层接口（§3.3）；进程通信架构（§3.2）；FileManager 职责 | 管道 + Git 扩展 |
| `specs/requirements/phase1/sprint3.6-MCP.md` | 需求 2.1（导入增强）；需求 2.7（导入历史）；§1.3（兼容性约束）；§6.2（架构决策） | 验收标准 + 架构约束 |
| `specs/tasks/phase1/phase1-task040_import-pipeline-adapters.md` | 12 步执行路径、完整验收标准、依赖库选型、IPC 通道设计 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `isomorphic-git-integration` | GitAbstraction 扩展（createBranch/createTag/revertCommit/getCommitHash） | git-abstraction.ts 新增方法 |
| `electron-ipc-patterns` | IPC 通道类型安全注册；Preload API 安全暴露；progress 推送 | import-pipeline.ts + preload + types |
| `typescript-strict-mode` | ImportAdapter / ImportPlan 等严格类型设计；泛型 AsyncIterable；联合类型 | types.ts + 全部 TS 文件 |

### 2.3 前置代码依赖

| 模块 | 文件 | 复用方式 |
|------|------|---------|
| `FileManager` | `src/main/services/file-manager.ts` | 管道写入阶段调用 `writeFile()`/`exists()` |
| `GitAbstraction` | `src/main/services/git-abstraction.ts` | 扩展 4 方法（createBranch/createTag/revertCommit/getCommitHash） |
| `ImportManager` | `src/main/services/import-manager.ts` | 保留为兼容层，新增委托方法 |
| `AutoSaveManager` | `src/main/services/auto-save-manager.ts` | 导入后被动触发自动提交 |
| `ImportManager 类型` | `src/main/services/types/import-manager.types.ts` | InternalImportOptions 复用 |
| `Git 类型` | `src/main/services/types/git-abstraction.types.ts` | GitAbstractionConfig 等复用 |
| `IPC_CHANNELS` | `src/shared/types.ts` | 扩展导入管道通道常量 |
| `IpcHandler` | `src/main/ipc/handler.ts` | 继承基类，使用 `safeHandle` 模式 |
| `IpcManager` | `src/main/ipc/index.ts` | 注册 import-pipeline handler |

### 2.4 新增依赖库

| 库 | 用途 | 是否已有 |
|----|------|---------|
| `adm-zip` | .zip 解压（Notion / Google Docs） | **需新增** |
| `turndown` | HTML → Markdown（Notion HTML 模式） | **需新增** |
| `@types/turndown` | turndown 类型定义 | **需新增** |
| `mammoth` | .docx → Markdown | 已有 `^1.12.0` |
| `papaparse` | CSV 解析（Notion 数据库） | 已有 `^5.5.3` |
| `isomorphic-git` | Git 操作（tag/revert/branch） | 已有 `^1.37.4` |
| `uuid` | importId 生成 | 需确认，若无则用 crypto.randomUUID() |

### 2.5 新增 IPC 通道清单

| 通道常量 | 通道名 | 方向 | 说明 |
|---------|--------|------|------|
| `FILE_IMPORT_PLAN` | `file:import:plan` | R→M | 扫描阶段，返回 ImportPlan 预览 |
| `FILE_IMPORT_EXECUTE` | `file:import:execute` | R→M | 执行导入，接受 ImportOptions |
| `FILE_IMPORT_CANCEL` | `file:import:cancel` | R→M | 取消导入并回滚 |
| `FILE_IMPORT_PAUSE` | `file:import:pause` | R→M | 暂停导入 |
| `FILE_IMPORT_RESUME` | `file:import:resume` | R→M | 恢复导入 |
| `FILE_IMPORT_PROGRESS` | `file:import:progress` | M→R | 进度推送 |
| `FILE_IMPORT_HISTORY` | `file:import:history` | R→M | 查询导入历史 |
| `FILE_IMPORT_ROLLBACK` | `file:import:rollback` | R→M | 回滚指定导入 |

---

## 三、现有代码盘点与差距分析

### 3.1 ImportManager 现状

**现有能力**（`import-manager.ts:38-350`）：
- 支持 .md/.txt/.csv/.docx/.pdf 五种格式的单文件/目录递归导入
- `importFiles(sourcePaths, options, depth)` 递归处理文件和目录
- `convertWordToMarkdown()` 使用 mammoth 转换 .docx
- `convertPdfToMarkdown()` 使用 pdf-parse 提取文本
- 最大文件 10MB 限制，最大递归深度 20 层
- 符号链接安全跳过

**缺口**：
- 不支持 .zip 导出包（Notion / Google Docs）
- 不支持 Obsidian vault（.obsidian/ 识别、wikilinks 保留）
- 无三阶段管道（扫描/转换/写入耦合）
- 无暂停/取消/回滚能力
- 无图片资产处理（复制 + 路径重写）
- 无导入历史记录

### 3.2 GitAbstraction 现状

**现有方法**（`git-abstraction.ts:69+`，2279 行）：
- `saveFile()` / `commit()` / `getStatus()` / `getHistory()` / `getFileDiff()`
- `push()` / `pull()` / `clone()` / `setRemote()`
- `resolveConflict()` / `getConflicts()`

**缺失方法**（本任务需新增）：

| 方法 | 签名 | 用途 |
|------|------|------|
| `createBranch` | `(name: string) => Promise<void>` | 导入前可选创建分支 |
| `createTag` | `(tagName: string, message?: string) => Promise<void>` | 导入前创建快照 |
| `revertCommit` | `(commitHash: string) => Promise<string>` | 回滚导入 |
| `getCommitHash` | `() => Promise<string>` | 获取 HEAD hash |

### 3.3 IPC / Preload 现状

- `file.handler.ts` 注册了 `file:import`（调用 `importManager.importFiles()`）
- `preload/index.ts` 暴露了 `file.import` 方法
- 无 `file:import:*` 系列通道
- 无 `importPipeline` 命名空间

### 3.4 需新建的目录和文件

| 文件 | 状态 |
|------|------|
| `src/main/services/import/` 目录 | **不存在**，需创建 |
| `src/main/services/import/types.ts` | **不存在**，需新建 |
| `src/main/services/import/import-registry.ts` | **不存在**，需新建 |
| `src/main/services/import/import-pipeline.ts` | **不存在**，需新建 |
| `src/main/services/import/import-history-manager.ts` | **不存在**，需新建 |
| `src/main/services/import/asset-handler.ts` | **不存在**，需新建 |
| `src/main/services/import/adapters/` 目录 | **不存在**，需创建 |
| `src/main/services/import/adapters/*.ts`（5 适配器 + index） | **不存在**，需新建 |
| `src/main/services/import/index.ts` | **不存在**，需新建 |
| `src/main/ipc/handlers/import-pipeline.ts` | **不存在**，需新建 |
| `tests/main/services/import/` 目录 | **不存在**，需创建 |

---

## 四、分步实施计划

> 阶段划分遵循渐进式交付：类型先行 → 注册表 → 管道核心 → 适配器逐个 → 集成 → 测试。
> 每个阶段可独立验证，不依赖后续阶段的代码。

### 阶段 A：基础设施（Step 1-3） — 预计 1 天

#### Step 1：安装新增依赖 + 定义导入管道共享类型

**前置操作：** 在 `sibylla-desktop/` 下执行：
```bash
npm install adm-zip turndown @types/turndown
```

**文件：** `sibylla-desktop/src/main/services/import/types.ts`（新建）

```typescript
export interface ImportAdapter {
  readonly name: string
  detect(input: string): Promise<boolean>
  scan(input: string): Promise<ImportPlan>
  transform(plan: ImportPlan, options: ImportPipelineOptions): AsyncIterable<ImportItem>
}

export interface ImportPlan {
  readonly id: string
  readonly sourceFormat: string
  readonly sourcePath: string
  readonly totalFiles: number
  readonly totalImages: number
  readonly warnings: ReadonlyArray<string>
  readonly estimatedDurationMs: number
  readonly entries: ReadonlyArray<ImportPlanEntry>
}

export interface ImportPlanEntry {
  readonly sourcePath: string
  readonly relativePath: string
  readonly type: 'markdown' | 'csv' | 'html' | 'docx' | 'image' | 'other'
  readonly size: number
}

export interface ImportItem {
  readonly sourcePath: string
  readonly targetPath: string
  readonly content: string
  readonly attachments: ReadonlyArray<AssetAttachment>
  readonly metadata: ImportItemMetadata
}

export interface ImportItemMetadata {
  readonly source?: string
  readonly tags?: ReadonlyArray<string>
  readonly frontmatter?: Record<string, unknown>
  readonly title?: string
}

export interface ImportPipelineOptions {
  readonly targetDir: string
  readonly conflictStrategy: 'skip' | 'overwrite' | 'rename'
  readonly preserveStructure: boolean
  readonly signal?: AbortSignal
  readonly importId: string
}

export interface ImportPipelineResult {
  readonly importedFiles: number
  readonly importedImages: number
  readonly skippedFiles: number
  readonly errors: ReadonlyArray<ImportError>
  readonly durationMs: number
  readonly importId: string
}

export interface ImportError {
  readonly filePath: string
  readonly type: 'format_unsupported' | 'conversion_failed' | 'write_failed' | 'disk_full'
  readonly message: string
  readonly originalError?: string
}

export interface ImportProgress {
  readonly current: number
  readonly total: number
  readonly currentFile: string
  readonly stage: PipelineStage
}

export type PipelineStage = 'idle' | 'scanning' | 'transforming' | 'writing' | 'completed' | 'cancelled' | 'failed'
export type PipelineState = 'idle' | 'scanning' | 'transforming' | 'writing' | 'paused' | 'completed' | 'cancelled' | 'failed'

export interface AssetAttachment {
  readonly sourcePath: string
  readonly fileName: string
  readonly buffer?: Buffer
}

export interface AssetCopyResult {
  readonly copied: number
  readonly failed: number
  readonly renamed: number
  readonly pathMapping: Map<string, string>
}

export interface ImportRecord {
  readonly importId: string
  readonly timestamp: number
  readonly sourceFormat: string
  readonly preImportCommitHash: string
  readonly files: ReadonlyArray<string>
  readonly tag: string
  readonly status: 'active' | 'rolled_back' | 'expired'
}

export interface RollbackResult {
  readonly success: boolean
  readonly affectedFiles: ReadonlyArray<string>
  readonly newCommitHash: string
}
```

**验证：** `npx tsc --noEmit` 编译通过，所有类型无 `any`。

#### Step 2：实现 ImportRegistry 适配器注册表

**文件：** `sibylla-desktop/src/main/services/import/import-registry.ts`（新建）

核心结构：

```typescript
export class ImportRegistry {
  private adapters: ImportAdapter[] = []

  register(adapter: ImportAdapter): void { /* 追加到 adapters 列表 */ }

  async detectAdapter(input: string): Promise<ImportAdapter | null> {
    // 1. 基于扩展名预过滤
    //    .zip → [NotionAdapter, GoogleDocsAdapter]
    //    文件夹 → [ObsidianAdapter, MarkdownAdapter]
    //    .docx → [DocxAdapter]
    // 2. 对候选适配器逐个调用 detect(input)
    // 3. 返回首个匹配，无匹配返回 null
  }

  static createDefault(): ImportRegistry {
    // 按 Notion → GoogleDocs → Obsidian → Markdown → Docx 优先级注册
  }
}
```

**实现要点**：
1. `detectAdapter` 使用扩展名预过滤减少不必要的 `detect()` 调用
2. `register` 支持运行时动态注册（为未来插件铺路）
3. `createDefault` 返回预注册所有内置适配器的实例

**验证：** 注册表对 .zip / 文件夹 / .docx 三种输入正确路由到候选适配器。

#### Step 3：实现 AssetHandler 图片资产处理工具

**文件：** `sibylla-desktop/src/main/services/import/asset-handler.ts`（新建）

```typescript
export async function copyAssets(
  attachments: ReadonlyArray<AssetAttachment>,
  targetDir: string,
  importId: string
): Promise<AssetCopyResult> {
  // 1. 创建 {targetDir}/assets/{importId}/ 目录
  // 2. 逐个复制图片（支持 png/jpg/jpeg/gif/svg/webp）
  // 3. 重名追加序号（image.png → image_1.png）
  // 4. 返回 pathMapping（旧路径 → 新路径）
}

export function rewriteImagePaths(
  content: string,
  importId: string,
  pathMapping: Map<string, string>
): string {
  // 正则匹配 ![alt](path) 和 ![[image.png]]
  // 替换为 assets/{importId}/xxx.png 相对路径
}
```

**验证：** 图片复制、路径重写、重名自动重命名功能正确。

### 阶段 B：管道核心 + Git 扩展（Step 4-5） — 预计 1 天

#### Step 4：扩展 GitAbstraction

**文件：** `sibylla-desktop/src/main/services/git-abstraction.ts`（修改）

在类末尾追加 4 个方法，不修改任何现有方法签名：

```typescript
async createBranch(name: string): Promise<void> {
  // git.branch({ fs, dir, ref: name }) — 不自动切换
}

async createTag(tagName: string, message?: string): Promise<void> {
  // 有 message → git.annotatedTag()
  // 无 message → git.tag()（轻量标签）
}

async revertCommit(commitHash: string): Promise<string> {
  // 读取目标 commit 的变更
  // 对每个文件执行反向变更
  // 创建 revert commit，返回新 hash
}

async getCommitHash(): Promise<string> {
  // git.resolveRef({ fs, dir, ref: 'HEAD' })
}
```

**验证：** 现有测试不受影响；新方法可正确创建分支/标签/回滚/获取 hash。

#### Step 5：实现 ImportPipeline 三阶段管道

**文件：** `sibylla-desktop/src/main/services/import/import-pipeline.ts`（新建）

核心类结构：

```typescript
export class ImportPipeline {
  private state: PipelineState = 'idle'
  private paused = false
  private abortController = new AbortController()
  private currentAdapter: ImportAdapter | null = null

  constructor(
    private readonly registry: ImportRegistry,
    private readonly fileManager: FileManager,
    private readonly historyManager: ImportHistoryManager,
    private readonly gitAbstraction: GitAbstraction,
    private readonly onProgress?: (progress: ImportProgress) => void,
  ) {}

  async run(input: string, options: ImportPipelineOptions): Promise<ImportPipelineResult> {
    // a. 初始化状态和 AbortController
    // b. 阶段 1 — 扫描：
    //    adapter = await registry.detectAdapter(input)
    //    plan = await adapter.scan(input)
    //    推送 { stage: 'scanning', total: plan.totalFiles }
    //
    // c. 阶段 2+3 — 转换并写入（流式）：
    //    for await (const item of adapter.transform(plan, options)):
    //      while (this.paused && !signal.aborted): await sleep(100)
    //      if (signal.aborted): break
    //      await this.writeItem(item, options)
    //      result.importedFiles++
    //      this.onProgress?.({ current, total, currentFile, stage: 'writing' })
    //
    // d. 记录导入历史
    // e. 返回 result
  }

  private async writeItem(item: ImportItem, options: ImportPipelineOptions): Promise<void> {
    // 1. 计算目标路径
    // 2. 冲突处理（skip/overwrite/rename）
    // 3. FileManager.writeFile() 写入 Markdown
    // 4. 处理附件：copyAssets + rewriteImagePaths
  }

  pause(): void { this.paused = true }
  resume(): void { this.paused = false }
  async cancel(): Promise<void> {
    // 1. this.abortController.abort()
    // 2. await this.historyManager.rollbackLatest()
  }
  getState(): PipelineState { return this.state }
}
```

**实现要点**：
1. `run` 方法串联三阶段，`writeItem` 处理单个文件写入 + 附件
2. 暂停使用 `while (paused) await sleep(100)` 自旋等待
3. 取消通过 `AbortController.signal` 传播到 `transform` 的 AsyncIterable
4. 每个文件处理完通过 `onProgress` 回调推送进度
5. 大包（>500 文件）天然流式处理——AsyncIterable 逐项产出不缓存全量

**验证：** 三阶段管道正常完成、暂停/恢复正确、取消触发回滚、进度推送正确。

### 阶段 C：5 个平台适配器（Step 6-8） — 预计 2 天

#### Step 6：实现 Notion 适配器

**文件：** `sibylla-desktop/src/main/services/import/adapters/notion-adapter.ts`（新建）

```typescript
export class NotionAdapter implements ImportAdapter {
  readonly name = 'notion'

  async detect(input: string): Promise<boolean> {
    // 1. 检查 .zip 扩展名
    // 2. adm-zip 解压到临时目录
    // 3. 检查内部：含 *.csv + *.md → MD+CSV 模式；含 *.html → HTML 模式
    // 4. 不匹配则清理临时目录，返回 false
  }

  async scan(input: string): Promise<ImportPlan> {
    // 统计 .md/.csv/.html 文件数量 + 图片文件列表
    // 返回 ImportPlan
  }

  async *transform(plan: ImportPlan, options: ImportPipelineOptions): AsyncIterable<ImportItem> {
    // MD+CSV 模式：
    //   - 逐个 .md：fixNotionMarkdown() → yield ImportItem
    //   - 逐个 .csv：csvToMarkdownTable() → yield ImportItem（.csv → .md）
    // HTML 模式：
    //   - 逐个 .html：turndown 转 MD → yield ImportItem
    // 图片路径重写：rewriteImagePaths()
  }
}
```

**辅助方法**：
- `fixNotionMarkdown(content)` — 修复 `{{embed}}` 占位符、Notion 特有格式
- `csvToMarkdownTable(csvContent)` — 使用 papaparse 解析 → Markdown 表格
- 使用 `asset-handler.ts` 的 `copyAssets` + `rewriteImagePaths`

**验证：** Notion MD+CSV / HTML 两种导出包正确导入、CSV 表格转换、图片路径重写。

#### Step 7：实现 Google Docs + Obsidian 适配器

**文件 7a：** `sibylla-desktop/src/main/services/import/adapters/google-docs-adapter.ts`（新建）

```typescript
export class GoogleDocsAdapter implements ImportAdapter {
  readonly name = 'google-docs'

  async detect(input: string): Promise<boolean> {
    // .zip 且内部含 .docx 文件
  }

  async *transform(plan, options): AsyncIterable<ImportItem> {
    // 对每个 .docx：mammoth.convertToMarkdown({ path })
    // 收集 mammoth 警告（记录但不阻塞）
    // 提取图片作为 attachments
    // rewriteImagePaths
  }
}
```

**文件 7b：** `sibylla-desktop/src/main/services/import/adapters/obsidian-adapter.ts`（新建）

```typescript
export class ObsidianAdapter implements ImportAdapter {
  readonly name = 'obsidian'

  async detect(input: string): Promise<boolean> {
    // 文件夹 + 含 .obsidian/ 目录
    // 或含大量 .md + [[wikilinks]] 语法
  }

  async *transform(plan, options): AsyncIterable<ImportItem> {
    // 逐个 .md（排除 .obsidian/ 目录）：
    //   - 保留 [[wikilinks]] 不转换
    //   - 保留 YAML frontmatter 中的 tags
    //   - 检测 Dataview / Templater 语法 → 标记 warning
    //   - ![[image.png]] → ![](assets/{importId}/image.png)
    //   - yield ImportItem
  }
}
```

**Obsidian 特殊处理**：
1. `.obsidian/` 配置目录不导入
2. `![[image.png]]` 重写为标准 Markdown 图片语法
3. 插件特有语法（Dataview 查询块、Templater 模板）跳过并标记 warning

**验证：** Google Docs 导出包正确转换；Obsidian vault 正确导入，wikilinks/tags 保留。

#### Step 8：实现 Markdown + Docx 适配器 + 统一导出

**文件 8a：** `sibylla-desktop/src/main/services/import/adapters/markdown-adapter.ts`（新建）

```typescript
export class MarkdownAdapter implements ImportAdapter {
  readonly name = 'markdown'

  async detect(input: string): Promise<boolean> {
    // 文件夹 + 含 .md 文件 + 不含 .obsidian/
  }

  async *transform(plan, options): AsyncIterable<ImportItem> {
    // 逐个 .md 原样复制，保留目录层级
    // 非文本文件收集为 attachments → copyAssets
  }
}
```

**文件 8b：** `sibylla-desktop/src/main/services/import/adapters/docx-adapter.ts`（新建）

```typescript
export class DocxAdapter implements ImportAdapter {
  readonly name = 'docx'

  async detect(input: string): Promise<boolean> {
    // .docx 扩展名（.doc 返回 false + warning）
  }

  async *transform(plan, options): AsyncIterable<ImportItem> {
    // mammoth.convertToMarkdown() + 图片提取
  }
}
```

**文件 8c：** `sibylla-desktop/src/main/services/import/adapters/index.ts`（新建）

```typescript
export { NotionAdapter } from './notion-adapter'
export { GoogleDocsAdapter } from './google-docs-adapter'
export { ObsidianAdapter } from './obsidian-adapter'
export { MarkdownAdapter } from './markdown-adapter'
export { DocxAdapter } from './docx-adapter'

export function registerDefaultAdapters(registry: ImportRegistry): void {
  registry.register(new NotionAdapter())
  registry.register(new GoogleDocsAdapter())
  registry.register(new ObsidianAdapter())
  registry.register(new MarkdownAdapter())
  registry.register(new DocxAdapter())
}
```

**文件 8d：** `sibylla-desktop/src/main/services/import/index.ts`（新建）

统一导出所有导入模块（types + registry + pipeline + adapters + asset-handler + history-manager）。

**验证：** 5 个适配器可独立使用，registerDefaultAdapters 正确注册。

### 阶段 D：历史管理 + 兼容层（Step 9-10） — 预计 1 天

#### Step 9：实现 ImportHistoryManager

**文件：** `sibylla-desktop/src/main/services/import/import-history-manager.ts`（新建）

```typescript
export class ImportHistoryManager {
  constructor(
    private readonly baseDir: string,          // workspace/.sibylla/import-history/
    private readonly gitAbstraction: GitAbstraction,
  ) {}

  async record(result: ImportPipelineResult, plan: ImportPlan, preImportCommitHash: string): Promise<ImportRecord> {
    // 1. 生成 tag：sibylla-import/YYYY-MM-DD-{seq}
    // 2. await gitAbstraction.createTag(tag)
    // 3. 写入 {baseDir}/{importId}.json
    // 返回 ImportRecord
  }

  async listHistory(): Promise<ImportRecord[]> {
    // 扫描 baseDir 目录，按时间倒序
  }

  async rollback(importId: string): Promise<RollbackResult> {
    // 1. 读取记录获取 preImportCommitHash
    // 2. 获取受影响文件列表（tag commit 与其父 commit 的 diff）
    // 3. 执行 gitAbstraction.revertCommit()
    // 4. 更新记录状态为 rolled_back
  }

  async getAffectedFiles(importId: string): Promise<string[]> {
    // 对比 tag 指向的 commit 与其父 commit 之间的 diff
  }

  async cleanupOldRecords(maxAgeDays = 30): Promise<number> {
    // 超过 30 天的记录标记为 expired
  }
}
```

**记录结构**（`.sibylla/import-history/{importId}.json`）：
```json
{
  "importId": "uuid",
  "timestamp": 1713945600000,
  "sourceFormat": "notion",
  "preImportCommitHash": "abc123",
  "files": ["docs/page1.md", "assets/import-uuid/img.png"],
  "tag": "sibylla-import/2026-04-24-001",
  "status": "active"
}
```

**验证：** 记录正确创建/读取、回滚正确创建 revert commit、旧记录自动清理。

#### Step 10：ImportManager 兼容层改造

**文件：** `sibylla-desktop/src/main/services/import-manager.ts`（修改）

改造策略——保留所有现有方法，新增委托入口：

```typescript
export class ImportManager {
  private pipeline: ImportPipeline | null = null

  setPipeline(pipeline: ImportPipeline): void {
    this.pipeline = pipeline
  }

  async importWithPipeline(
    input: string,
    options?: ImportPipelineOptions
  ): Promise<ImportPipelineResult> {
    if (!this.pipeline) throw new Error('Pipeline not initialized')
    return this.pipeline.run(input, options ?? defaultOptions)
  }

  /** @deprecated 使用 importWithPipeline() 替代 */
  async importFiles(sourcePaths, options, depth): Promise<ImportResult> {
    // 保留原有实现不变，后续版本可改为委托
  }
}
```

**原则**：不删除任何现有方法、不修改任何签名，仅新增 `setPipeline` 和 `importWithPipeline`。

**验证：** 现有 `file:import` 通道仍可正常工作。

### 阶段 E：IPC 集成 + 主进程装配（Step 11-12） — 预计 1 天

#### Step 11：实现 IPC Handler + Preload API 扩展

**文件 11a：** `sibylla-desktop/src/main/ipc/handlers/import-pipeline.ts`（新建）

继承 `IpcHandler`，`namespace = 'import-pipeline'`，注册 8 个通道：

| 方法 | 通道 | 实现 |
|------|------|------|
| `handlePlan` | `file:import:plan` | `registry.detectAdapter()` + `adapter.scan()` → ImportPlan |
| `handleExecute` | `file:import:execute` | 创建 Pipeline，注入 progress → `event.sender.send('file:import:progress')` |
| `handleCancel` | `file:import:cancel` | `pipeline.cancel()` |
| `handlePause` | `file:import:pause` | `pipeline.pause()` |
| `handleResume` | `file:import:resume` | `pipeline.resume()` |
| `handleHistory` | `file:import:history` | `historyManager.listHistory()` |
| `handleRollback` | `file:import:rollback` | `historyManager.rollback(importId)` + 返回受影响文件 |

progress 推送使用 `event.sender.send('file:import:progress', data)` 模式（参考 memory handler 的事件推送）。

**注意**：Pipeline 实例按会话持有在 handler 中，cancel/pause/resume 操作需要引用当前活跃的 Pipeline 实例。

**文件 11b：** `sibylla-desktop/src/shared/types.ts`（修改）

在 `IPC_CHANNELS` 对象中追加 8 个通道常量：
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

**文件 11c：** `sibylla-desktop/src/preload/index.ts`（修改）

追加 `importPipeline` 命名空间：
```typescript
importPipeline: {
  plan: (input: string) => ipcRenderer.invoke('file:import:plan', input),
  execute: (input: string, options?: ImportPipelineOptions) =>
    ipcRenderer.invoke('file:import:execute', input, options),
  cancel: () => ipcRenderer.invoke('file:import:cancel'),
  pause: () => ipcRenderer.invoke('file:import:pause'),
  resume: () => ipcRenderer.invoke('file:import:resume'),
  onProgress: (callback: (data: ImportProgress) => void) =>
    ipcRenderer.on('file:import:progress', (_event, data) => callback(data)),
  history: () => ipcRenderer.invoke('file:import:history'),
  rollback: (importId: string) => ipcRenderer.invoke('file:import:rollback', importId),
}
```

**验证：** IPC 通道注册正确、渲染进程可通过 preload 调用、progress 推送正常。

#### Step 12：主进程装配 + 端到端验证

**主进程初始化入口修改**（`src/main/index.ts` 或相关初始化文件）：

装配顺序：
```
1. ImportHistoryManager(baseDir, gitAbstraction)
2. ImportRegistry.createDefault() → 注册 5 个适配器
3. ImportPipeline(registry, fileManager, historyManager, gitAbstraction)
4. importManager.setPipeline(pipeline)
5. new ImportPipelineHandler(registry, pipeline, historyManager) → ipcManager.registerHandler()
```

**端到端验证流程**：
1. 应用启动后导入管道可通过 IPC 调用
2. 拖拽 .zip 文件 → `file:import:plan` → 返回 ImportPlan 预览
3. `file:import:execute` → 三阶段管道运行 → progress 推送 → 返回 ImportResult
4. `file:import:pause` / `file:import:resume` → 暂停恢复正确
5. `file:import:cancel` → 回滚到导入前状态
6. `file:import:history` → 列出导入记录
7. `file:import:rollback` → revert commit 创建成功

---

## 五、测试策略

### 5.1 测试文件清单

| 测试文件 | 覆盖内容 |
|---------|---------|
| `tests/main/services/import/import-registry.test.ts` | detectAdapter 路由、动态注册、空输入 |
| `tests/main/services/import/import-pipeline.test.ts` | 三阶段流程、暂停/恢复、取消回滚、进度回调 |
| `tests/main/services/import/notion-adapter.test.ts` | detect (MD+CSV/HTML)、scan、transform、CSV 表格 |
| `tests/main/services/import/google-docs-adapter.test.ts` | detect、mammoth 转换、图片提取 |
| `tests/main/services/import/obsidian-adapter.test.ts` | detect（.obsidian/）、wikilinks 保留、tags、插件语法 warning |
| `tests/main/services/import/markdown-adapter.test.ts` | detect、原样复制、目录层级 |
| `tests/main/services/import/docx-adapter.test.ts` | detect、mammoth 转换、批量 |
| `tests/main/services/import/asset-handler.test.ts` | copyAssets、rewriteImagePaths、重名重命名 |
| `tests/main/services/import/import-history-manager.test.ts` | record、listHistory、rollback、cleanup |
| `tests/main/services/import/git-abstraction-extension.test.ts` | createBranch、createTag、revertCommit、getCommitHash |

### 5.2 测试 Fixture

需准备以下 fixture 文件（`tests/fixtures/import/`）：
- `notion-export.zip` — 包含 .md + .csv + 图片的 Notion 导出包
- `notion-html-export.zip` — 包含 .html + 图片的 Notion HTML 导出包
- `gdocs-export.zip` — 包含 .docx 文件的 Google Docs 导出包
- `obsidian-vault/` — 含 `.obsidian/` + .md + wikilinks 的模拟 vault
- `markdown-folder/` — 纯 .md 文件夹
- `sample.docx` — Word 文档 fixture

### 5.3 覆盖率目标

≥ 80%，重点覆盖：
- ImportPipeline 的三阶段流程 + 暂停/取消/恢复状态机
- 每个适配器的 detect() 正确识别/正确拒绝
- AssetHandler 的路径重写边界情况
- ImportHistoryManager 的记录和回滚

---

## 六、风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| adm-zip 解压大文件内存溢出 | 中 | 高 | 流式解压，限制单次解压大小（≤100MB） |
| turndown 转换 Notion HTML 质量不佳 | 中 | 中 | 预置 fallback：复杂 HTML 原样保留代码块 |
| Git revert 在导入后有新提交时冲突 | 低 | 高 | 回滚前检查是否有新提交，有则警告用户 |
| mammoth 图片提取不完整 | 低 | 中 | 收集 mammoth warnings，图片缺失时标记 warning |
| 适配器 detect 互相冲突（Notion vs Google Docs） | 低 | 中 | 优先级明确：Notion 先检测，通过内部结构区分 |

---

## 七、执行时间线

| 天数 | 阶段 | 交付物 |
|------|------|--------|
| Day 1 | 阶段 A（Step 1-3） | types.ts + import-registry.ts + asset-handler.ts |
| Day 2 | 阶段 B（Step 4-5） | git-abstraction 扩展 + import-pipeline.ts |
| Day 3-4 | 阶段 C（Step 6-8） | 5 个适配器 + adapters/index.ts + import/index.ts |
| Day 4-5 | 阶段 D（Step 9-10） | import-history-manager.ts + import-manager 兼容层 |
| Day 5 | 阶段 E（Step 11-12） | IPC handler + preload + 主进程装配 |
| Day 5-6 | 测试 | 10 个测试文件 + fixture，覆盖率 ≥ 80% |

---

**创建时间：** 2026-04-24
**最后更新：** 2026-04-24
