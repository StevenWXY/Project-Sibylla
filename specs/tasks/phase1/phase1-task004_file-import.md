# 文件导入与 CSV 查看器

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK004 |
| **任务标题** | 文件导入与 CSV 查看器 |
| **所属阶段** | Phase 1 - MVP 核心功能（Sprint 1） |
| **优先级** | P1（导入）/ P2（CSV） |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

实现文件导入功能，支持用户通过拖拽将外部文件（Markdown、Word、PDF）导入 Sibylla workspace，并自动完成格式转换。同时实现 CSV 文件的表格查看器，支持排序和虚拟滚动。

### 背景

Sibylla 的用户在首次使用时需要将已有文档迁移到 workspace 中。需求文档定义了两类需求：

- **需求 2.5（文件导入，P1）**：支持拖拽导入 Markdown、Word（.docx）、PDF 文件，非 Markdown 格式自动转换为 Markdown。
- **需求 2.6（CSV 查看器，P2）**：支持以表格形式查看 CSV 文件，支持列排序和虚拟滚动。

根据 CLAUDE.md 的"文件即真相"原则，所有导入的内容最终都存储为 Markdown 明文文件。

### 范围

**包含：**
- 拖拽导入 Drop Zone（渲染进程拖拽检测 + 视觉 overlay）
- Markdown 文件直接复制导入
- Word（.docx）文件转 Markdown（mammoth）
- PDF 文件转 Markdown（pdf-parse）
- 文件夹递归导入
- 导入结果摘要弹窗
- 导入进度反馈
- CSV 查看器组件（papaparse 解析 + 表格渲染）
- CSV 列排序
- CSV 虚拟滚动（>1000 行）
- 新增 `file:import` IPC 通道

**不包含：**
- 在线导入（URL / API 导入）— Phase 2
- Notion / 飞书导入 — Phase 1 后续迭代
- CSV 编辑功能 — 仅查看模式（基础单元格编辑为 P2 可选项）
- 图片和附件导入 — Phase 1 后续迭代
- 导入历史记录 — 暂不实现

## 技术要求

### 技术栈

- **mammoth** ^1.x — Word (.docx) 转 HTML/Markdown
- **pdf-parse** ^1.x — PDF 文本提取
- **papaparse** ^5.x — CSV 解析（流式、容错）
- **@tanstack/react-virtual** ^3.x — 虚拟滚动（大量 CSV 行）
- **React 18 + TypeScript strict mode**
- **TailwindCSS** — 样式
- **Lucide React** — 图标

### 架构设计

```
主进程 (Main Process)
├── src/main/services/
│   └── import-manager.ts          # 导入管理器（新增）
│       ├── importFiles()          # 批量导入入口
│       ├── importMarkdown()       # Markdown 直接复制
│       ├── convertWordToMarkdown()# Word 转换
│       └── convertPdfToMarkdown() # PDF 转换
└── src/main/ipc/handlers/
    └── file.handler.ts            # 扩展：新增 file:import 通道

渲染进程 (Renderer Process)
├── src/renderer/components/
│   ├── import/
│   │   ├── DropZoneOverlay.tsx     # 拖拽 overlay（新增）
│   │   └── ImportSummaryDialog.tsx # 导入结果摘要（新增）
│   └── viewer/
│       └── CsvViewer.tsx           # CSV 表格查看器（新增）
└── src/renderer/hooks/
    └── useDropZone.ts              # 拖拽检测 Hook（新增）
```

#### 核心类型定义

```typescript
// src/main/services/types/import-manager.types.ts

/** Supported import file types */
export type ImportableFileType = '.md' | '.docx' | '.pdf' | '.csv' | '.txt'

/** Single file import result */
export interface ImportFileResult {
  /** Original file path (absolute) */
  sourcePath: string
  /** Destination path in workspace (relative) */
  destPath: string
  /** How the file was processed */
  action: 'copied' | 'converted' | 'skipped' | 'failed'
  /** Original file type */
  sourceType: ImportableFileType
  /** Error message if failed */
  error?: string
}

/** Batch import result summary */
export interface ImportResult {
  /** Successfully imported (copied as-is) */
  imported: ImportFileResult[]
  /** Successfully converted and imported */
  converted: ImportFileResult[]
  /** Skipped (unsupported format) */
  skipped: ImportFileResult[]
  /** Failed imports */
  failed: ImportFileResult[]
  /** Total processing time in milliseconds */
  durationMs: number
}

/** Import options */
export interface ImportOptions {
  /** Target directory in workspace (relative path, default: '/') */
  targetDir?: string
  /** Whether to flatten folder structure (default: false) */
  flatten?: boolean
  /** Whether to overwrite existing files (default: false) */
  overwrite?: boolean
  /** Progress callback */
  onProgress?: (current: number, total: number, fileName: string) => void
}
```

```typescript
// src/renderer/components/viewer/CsvViewer.tsx types

/** CSV viewer props */
export interface CsvViewerProps {
  /** Workspace-relative file path */
  filePath: string
  /** Optional class name */
  className?: string
}

/** Sort state for CSV columns */
export interface CsvSortState {
  /** Column index to sort by */
  columnIndex: number
  /** Sort direction */
  direction: 'asc' | 'desc'
}
```

### 实现细节

#### 子任务 4.1：拖拽导入 Drop Zone

全局拖拽检测，当用户将外部文件拖入应用窗口时显示 overlay。

```typescript
// src/renderer/hooks/useDropZone.ts

/**
 * Global drop zone hook for file import.
 * Detects external file drag events on the window.
 */
export function useDropZone(onDrop: (files: File[]) => void) {
  const [isDragging, setIsDragging] = useState(false)
  const dragCounterRef = useRef(0)

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault()
      dragCounterRef.current++
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragging(true)
      }
    }

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault()
      dragCounterRef.current--
      if (dragCounterRef.current === 0) {
        setIsDragging(false)
      }
    }

    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      dragCounterRef.current = 0
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length > 0) {
        onDrop(files)
      }
    }

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
    }

    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)
    window.addEventListener('dragover', handleDragOver)

    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
      window.removeEventListener('dragover', handleDragOver)
    }
  }, [onDrop])

  return { isDragging }
}
```

```typescript
// src/renderer/components/import/DropZoneOverlay.tsx

/**
 * Full-screen overlay shown when files are dragged into the window.
 * Displays a centered drop target with visual feedback.
 */
export function DropZoneOverlay({ isDragging }: { isDragging: boolean }) {
  if (!isDragging) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-indigo-400 bg-white/90 dark:bg-gray-900/90 p-12">
        <Upload className="h-12 w-12 text-indigo-500" />
        <p className="text-lg font-medium text-gray-700 dark:text-gray-200">
          拖放文件到此处导入
        </p>
        <p className="text-sm text-gray-500">
          支持 Markdown、Word、PDF、CSV 文件及文件夹
        </p>
      </div>
    </div>
  )
}
```

- 使用 `dragenter`/`dragleave` 计数器防止子元素触发闪烁
- 仅对外部文件拖拽（`dataTransfer.types` 包含 `'Files'`）做响应
- overlay 使用 `z-50` 覆盖全部内容，背景半透明模糊

#### 子任务 4.2：ImportManager 服务（主进程）

```typescript
// src/main/services/import-manager.ts

import mammoth from 'mammoth'
import pdfParse from 'pdf-parse'
import * as path from 'path'
import * as fs from 'fs/promises'

/**
 * Manages file import and format conversion.
 * All conversion happens in the main process to access Node.js APIs.
 */
export class ImportManager {
  constructor(
    private readonly fileManager: FileManager,
    private readonly logger: Logger
  ) {}

  /**
   * Import multiple files into the workspace.
   * Supports .md, .docx, .pdf, .csv, .txt files.
   */
  async importFiles(
    sourcePaths: string[],
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    const startTime = Date.now()
    const targetDir = options.targetDir ?? '/'
    const result: ImportResult = {
      imported: [],
      converted: [],
      skipped: [],
      failed: [],
      durationMs: 0
    }

    let processed = 0
    for (const sourcePath of sourcePaths) {
      try {
        const stat = await fs.stat(sourcePath)
        if (stat.isDirectory()) {
          // Recursively import folder contents
          const subResult = await this.importDirectory(sourcePath, targetDir, options)
          result.imported.push(...subResult.imported)
          result.converted.push(...subResult.converted)
          result.skipped.push(...subResult.skipped)
          result.failed.push(...subResult.failed)
        } else {
          const fileResult = await this.importSingleFile(sourcePath, targetDir, options)
          this.categorizeResult(result, fileResult)
        }
      } catch (error) {
        result.failed.push({
          sourcePath,
          destPath: '',
          action: 'failed',
          sourceType: path.extname(sourcePath) as ImportableFileType,
          error: error instanceof Error ? error.message : String(error)
        })
      }

      processed++
      options.onProgress?.(processed, sourcePaths.length, path.basename(sourcePath))
    }

    result.durationMs = Date.now() - startTime
    this.logger.info('Import completed', {
      imported: result.imported.length,
      converted: result.converted.length,
      skipped: result.skipped.length,
      failed: result.failed.length,
      durationMs: result.durationMs
    })

    return result
  }

  // ... (private methods below)
}
```

- `FileManager` 注入用于文件写入（保证原子写入和路径验证）
- 结构化日志记录导入结果
- 文件夹递归导入保持原始目录结构

#### 子任务 4.3：Markdown 文件导入

```typescript
/**
 * Import a Markdown file by copying it directly to workspace.
 */
private async importMarkdown(sourcePath: string, targetDir: string): Promise<ImportFileResult> {
  const fileName = path.basename(sourcePath)
  const destPath = path.join(targetDir, fileName)

  const content = await fs.readFile(sourcePath, 'utf-8')
  await this.fileManager.writeFile(destPath, content)

  return {
    sourcePath,
    destPath,
    action: 'copied',
    sourceType: '.md'
  }
}
```

- 直接读取并写入 workspace，保持原始内容不变
- 使用 `FileManager.writeFile()` 确保原子写入

#### 子任务 4.4：Word 转 Markdown

```typescript
/**
 * Convert Word (.docx) file to Markdown using mammoth.
 * mammoth converts to HTML first, then we convert HTML to Markdown.
 */
private async convertWordToMarkdown(sourcePath: string, targetDir: string): Promise<ImportFileResult> {
  const fileName = path.basename(sourcePath, '.docx') + '.md'
  const destPath = path.join(targetDir, fileName)

  const result = await mammoth.convertToMarkdown({ path: sourcePath })

  if (result.messages.length > 0) {
    this.logger.warn('Word conversion warnings', {
      sourcePath,
      messages: result.messages.map(m => m.message)
    })
  }

  await this.fileManager.writeFile(destPath, result.value)

  return {
    sourcePath,
    destPath,
    action: 'converted',
    sourceType: '.docx'
  }
}
```

- mammoth 原生支持 `.docx` → Markdown 转换
- 转换警告记录到日志但不阻塞导入
- 输出文件扩展名从 `.docx` 改为 `.md`

#### 子任务 4.5：PDF 转 Markdown

```typescript
/**
 * Extract text from PDF file using pdf-parse.
 * PDF conversion is lossy — only text content is extracted.
 */
private async convertPdfToMarkdown(sourcePath: string, targetDir: string): Promise<ImportFileResult> {
  const fileName = path.basename(sourcePath, '.pdf') + '.md'
  const destPath = path.join(targetDir, fileName)

  const dataBuffer = await fs.readFile(sourcePath)
  const data = await pdfParse(dataBuffer)

  // Add a frontmatter header noting the source
  const markdown = [
    `# ${path.basename(sourcePath, '.pdf')}`,
    '',
    `> 从 PDF 文件导入。原始文件：${path.basename(sourcePath)}`,
    '',
    data.text
  ].join('\n')

  await this.fileManager.writeFile(destPath, markdown)

  return {
    sourcePath,
    destPath,
    action: 'converted',
    sourceType: '.pdf'
  }
}
```

- PDF 转换为有损提取（仅文本，不含格式和图片）
- 添加标题和导入来源注释
- 未来可升级为 AI 辅助 PDF 解析

#### 子任务 4.6：文件夹递归导入

```typescript
/**
 * Recursively import all supported files from a directory.
 * Preserves original folder structure in workspace.
 */
private async importDirectory(
  dirPath: string,
  targetDir: string,
  options: ImportOptions
): Promise<ImportResult> {
  const dirName = path.basename(dirPath)
  const newTargetDir = options.flatten ? targetDir : path.join(targetDir, dirName)
  const entries = await fs.readdir(dirPath, { withFileTypes: true })

  const filePaths: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      // Recursively collect from subdirectories
      filePaths.push(fullPath)
    } else if (this.isSupportedFile(entry.name)) {
      filePaths.push(fullPath)
    }
  }

  return this.importFiles(filePaths, { ...options, targetDir: newTargetDir })
}

/**
 * Check if file extension is in the supported import list.
 */
private isSupportedFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase()
  return ['.md', '.docx', '.pdf', '.csv', '.txt'].includes(ext)
}
```

- 保持原始文件夹结构（可通过 `flatten` 选项扁平化）
- 仅导入支持的文件类型，忽略其他文件
- 递归处理子文件夹

#### 子任务 4.7：导入结果摘要 UI

```typescript
// src/renderer/components/import/ImportSummaryDialog.tsx

interface ImportSummaryDialogProps {
  result: ImportResult
  onClose: () => void
}

/**
 * Modal dialog showing import results summary.
 * Groups results by action type with counts and details.
 */
export function ImportSummaryDialog({ result, onClose }: ImportSummaryDialogProps) {
  const totalCount = result.imported.length + result.converted.length
    + result.skipped.length + result.failed.length

  return (
    <Modal open onClose={onClose} title="导入完成">
      <div className="space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<FileCheck />}
            label="直接导入"
            count={result.imported.length}
            color="green"
          />
          <StatCard
            icon={<RefreshCw />}
            label="格式转换"
            count={result.converted.length}
            color="blue"
          />
          <StatCard
            icon={<FileQuestion />}
            label="已跳过"
            count={result.skipped.length}
            color="gray"
          />
          <StatCard
            icon={<AlertCircle />}
            label="导入失败"
            count={result.failed.length}
            color="red"
          />
        </div>

        {/* Duration */}
        <p className="text-sm text-gray-500">
          共处理 {totalCount} 个文件，耗时 {(result.durationMs / 1000).toFixed(1)} 秒
        </p>

        {/* Failed files detail */}
        {result.failed.length > 0 && (
          <div className="rounded-md bg-red-50 dark:bg-red-900/10 p-3">
            <h4 className="text-sm font-medium text-red-700 dark:text-red-400">失败详情</h4>
            <ul className="mt-2 space-y-1">
              {result.failed.map((f, i) => (
                <li key={i} className="text-xs text-red-600 dark:text-red-300">
                  {path.basename(f.sourcePath)}: {f.error}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Close button */}
        <div className="flex justify-end">
          <Button onClick={onClose}>确定</Button>
        </div>
      </div>
    </Modal>
  )
}
```

- 分四类展示导入结果（导入/转换/跳过/失败）
- 失败项展示具体错误信息
- 显示总处理时间

#### 子任务 4.8：CSV 查看器

```typescript
// src/renderer/components/viewer/CsvViewer.tsx

import Papa from 'papaparse'
import { useVirtualizer } from '@tanstack/react-virtual'

/**
 * CSV file viewer with table display, column sorting, and virtual scrolling.
 * Supports large CSV files (>1000 rows) via virtualization.
 */
export function CsvViewer({ filePath, className }: CsvViewerProps) {
  const [headers, setHeaders] = useState<string[]>([])
  const [data, setData] = useState<string[][]>([])
  const [sortState, setSortState] = useState<CsvSortState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const parentRef = useRef<HTMLDivElement>(null)

  // Load and parse CSV file
  useEffect(() => {
    loadCsv()
  }, [filePath])

  const loadCsv = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.file.read(filePath)
      if (!result.success) throw new Error(result.error?.message ?? 'Failed to read CSV')

      const parsed = Papa.parse<string[]>(result.data.content, {
        header: false,
        skipEmptyLines: true
      })

      if (parsed.errors.length > 0) {
        throw new Error(`CSV 解析错误: ${parsed.errors[0].message}`)
      }

      const rows = parsed.data as string[][]
      setHeaders(rows[0] ?? [])
      setData(rows.slice(1))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CSV 加载失败')
    } finally {
      setIsLoading(false)
    }
  }

  // Sorted data
  const sortedData = useMemo(() => {
    if (!sortState) return data
    const { columnIndex, direction } = sortState
    return [...data].sort((a, b) => {
      const valA = a[columnIndex] ?? ''
      const valB = b[columnIndex] ?? ''
      const cmp = valA.localeCompare(valB, 'zh-CN', { numeric: true })
      return direction === 'asc' ? cmp : -cmp
    })
  }, [data, sortState])

  // Virtual scrolling for large datasets
  const rowVirtualizer = useVirtualizer({
    count: sortedData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36, // row height
    overscan: 20
  })

  // ... render
}
```

- 使用 `papaparse` 解析 CSV（容错、支持多种分隔符）
- 列排序支持数字感知（`{ numeric: true }`）
- 超过 1000 行自动启用 `@tanstack/react-virtual` 虚拟滚动
- 解析失败回退到纯文本视图

#### 子任务 4.9：CSV 虚拟滚动

- 使用 `@tanstack/react-virtual` 的 `useVirtualizer`
- 预估行高 36px，overscan 20 行
- 表头固定（`position: sticky`），数据区域滚动
- 支持横向滚动（列数较多时）

```typescript
// Virtual scrolling table body
<div ref={parentRef} className="overflow-auto max-h-[calc(100vh-200px)]">
  <table className="w-full border-collapse text-sm">
    <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
      <tr>
        {headers.map((header, i) => (
          <th
            key={i}
            className="cursor-pointer select-none border-b px-3 py-2 text-left font-medium"
            onClick={() => handleSort(i)}
          >
            <span className="flex items-center gap-1">
              {header}
              {sortState?.columnIndex === i && (
                sortState.direction === 'asc'
                  ? <ChevronUp className="h-3 w-3" />
                  : <ChevronDown className="h-3 w-3" />
              )}
            </span>
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      <tr style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
        <td colSpan={headers.length} className="relative p-0">
          {rowVirtualizer.getVirtualItems().map(virtualRow => (
            <tr
              key={virtualRow.key}
              className="absolute flex w-full"
              style={{ height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` }}
            >
              {sortedData[virtualRow.index]?.map((cell, j) => (
                <td key={j} className="border-b px-3 py-2 truncate">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

### 数据模型

无新增数据库模型。导入文件通过 `FileManager.writeFile()` 直接写入 workspace 文件系统。

### API 规范

**新增 IPC 通道：**

| IPC 通道 | 方向 | 参数 | 返回值 | 说明 |
|---------|------|------|--------|------|
| `file:import` | Renderer → Main | `(sourcePaths: string[], options?: ImportOptions)` | `IPCResponse<ImportResult>` | 批量导入文件 |
| `file:importProgress` | Main → Renderer | — | `{ current: number, total: number, fileName: string }` | 导入进度事件（通过 IPC event push） |

**IPC Handler 实现：**

```typescript
// src/main/ipc/handlers/file.handler.ts (扩展)

ipcMain.handle('file:import', async (_, sourcePaths: string[], options?: ImportOptions) => {
  try {
    const importManager = new ImportManager(fileManager, logger)

    // Wire up progress callback to send events to renderer
    const optionsWithProgress: ImportOptions = {
      ...options,
      onProgress: (current, total, fileName) => {
        mainWindow?.webContents.send('file:importProgress', { current, total, fileName })
      }
    }

    const result = await importManager.importFiles(sourcePaths, optionsWithProgress)
    return { success: true, data: result }
  } catch (error) {
    return {
      success: false,
      error: { message: error instanceof Error ? error.message : 'Import failed', type: 'IMPORT_ERROR' }
    }
  }
})
```

**Preload API 扩展：**

```typescript
// src/preload/index.ts (扩展)

file: {
  // ... existing methods
  import: (sourcePaths: string[], options?: ImportOptions) =>
    safeInvoke('file:import', sourcePaths, options),
  onImportProgress: (callback: (data: ImportProgress) => void) =>
    ipcRenderer.on('file:importProgress', (_, data) => callback(data)),
}
```

**共享类型扩展：**

```typescript
// src/shared/types.ts (扩展 IPC_CHANNELS)

export const IPC_CHANNELS = {
  // ... existing channels
  FILE_IMPORT: 'file:import',
  FILE_IMPORT_PROGRESS: 'file:importProgress',
} as const
```

**复用已有 IPC 通道：**

| IPC 通道 | 用途 |
|---------|------|
| `file:read` | CSV 查看器读取文件内容 |
| `file:write` | 导入后写入 workspace |
| `file:list` | 导入后刷新文件树 |

## 验收标准

### 功能完整性

> 以下标准直接追溯自需求文档 2.5 和 2.6。

**文件导入（需求 2.5）：**
- [ ] 拖拽文件到窗口时显示 Drop Zone overlay（需求 2.5 AC1）
- [ ] 拖放 Markdown 文件后文件被复制到 workspace（需求 2.5 AC2）
- [ ] 拖放 Word 文件后自动转换为 Markdown 并导入（需求 2.5 AC3）
- [ ] 拖放 PDF 文件后自动提取文本并转换为 Markdown（需求 2.5 AC4）
- [ ] 拖放文件夹后递归导入所有支持的文件（需求 2.5 AC5）
- [ ] 导入完成后显示摘要：X 文件导入、Y 文件转换（需求 2.5 AC6）
- [ ] 导入过程有进度反馈
- [ ] 导入失败显示具体错误信息
- [ ] 导入后文件树自动刷新

**CSV 查看器（需求 2.6）：**
- [ ] 打开 CSV 文件时以表格形式渲染（需求 2.6 AC1）
- [ ] 点击列标题可排序（需求 2.6 AC2）
- [ ] 超过 1000 行时使用虚拟滚动（需求 2.6 AC3）
- [ ] CSV 解析失败时显示错误并回退到文本视图（需求 2.6 AC5）

### 性能指标

- [ ] 10 个文件导入 < 5 秒（需求文档非功能需求）
- [ ] CSV 查看器打开 10000 行文件 < 2 秒
- [ ] CSV 虚拟滚动帧率 ≥ 30fps
- [ ] Drop Zone overlay 响应 < 100ms

### 用户体验

- [ ] Drop Zone overlay 有清晰的视觉引导
- [ ] 导入进度有实时反馈（当前/总数 + 文件名）
- [ ] 导入摘要分类清晰（导入/转换/跳过/失败）
- [ ] CSV 排序方向有图标指示
- [ ] 暗色模式下所有组件正确显示

### 代码质量

- [ ] TypeScript strict mode 无错误
- [ ] ESLint 检查通过，无警告
- [ ] 所有公共函数有 JSDoc 注释
- [ ] 代码审查通过

## 测试标准

### 单元测试

**测试覆盖率目标：** ≥ 60%（P1/P2 任务标准）

**关键测试用例：**

1. **ImportManager.importFiles()**
   - 输入：混合文件类型列表（.md, .docx, .pdf, .csv）
   - 预期：各类型文件正确分类处理，结果分类正确
   - 边界条件：空列表、全部失败、单文件

2. **ImportManager.convertWordToMarkdown()**
   - 输入：有效 .docx 文件路径
   - 预期：返回 Markdown 字符串
   - 边界条件：空 Word 文件、包含图片的 Word 文件（图片应被忽略或替换为占位符）

3. **ImportManager.convertPdfToMarkdown()**
   - 输入：有效 PDF 文件路径
   - 预期：返回文本内容
   - 边界条件：扫描版 PDF（无文本层）、加密 PDF

4. **isSupportedFile()**
   - 输入：各种文件名
   - 预期：支持的扩展名返回 true，不支持的返回 false
   - 边界条件：大小写扩展名（.DOCX vs .docx）、无扩展名、多点号文件名

5. **CSV 解析**
   - 输入：各种格式的 CSV 内容
   - 预期：正确解析为 headers + data
   - 边界条件：空文件、仅表头无数据、包含引号的字段、包含换行的字段

6. **CSV 排序**
   - 输入：数据数组 + 排序状态
   - 预期：按指定列和方向排序
   - 边界条件：数字排序 vs 字符串排序、空值排序

7. **useDropZone Hook**
   - 模拟 dragenter/dragleave/drop 事件
   - 预期：isDragging 状态正确切换
   - 边界条件：快速多次 enter/leave（计数器正确）

### 集成测试

**测试场景：**

1. 完整导入流程：拖拽文件 → Drop Zone 显示 → 放置 → IPC 调用 → 进度更新 → 摘要展示 → 文件树刷新
2. Word 转换流程：拖入 .docx → 转换 → 打开转换后的 .md 验证内容
3. CSV 查看流程：文件树点击 .csv → CSV 查看器渲染 → 排序 → 滚动

### 端到端测试

E2E 测试在 Sprint 1 整体完成后统一编写。

## 依赖关系

### 前置依赖

- [x] PHASE0-TASK006（本地文件系统管理）— FileManager 提供文件写入
- [x] PHASE0-TASK002（IPC 框架）— IPC Handler 注册机制
- [ ] PHASE1-TASK001（文件树 CRUD）— 导入后需要刷新文件树

### 被依赖任务

- 无直接被依赖任务

### 阻塞风险

- `mammoth` 和 `pdf-parse` 为 Node.js 原生模块，需确认在 Electron 主进程中正常运行
- PDF 文本提取对于扫描版 PDF（无文本层）效果差，需要在 UI 中提示用户

## 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| mammoth Word 转换质量不稳定 | 中 | 中 | 测试多种 Word 文件格式，记录已知限制 |
| pdf-parse 对复杂 PDF 支持不足 | 中 | 高 | 仅承诺文本提取，在导入摘要中标注"有损转换" |
| 大文件导入内存占用 | 中 | 低 | 文件大小限制（单文件 < 10MB，遵循非功能需求） |
| Electron 打包后 mammoth/pdf-parse 不兼容 | 高 | 低 | 早期验证打包后的模块加载，必要时使用 spawn 子进程 |
| CSV papaparse 对非 UTF-8 编码支持 | 低 | 中 | 默认 UTF-8，加载失败时提示用户转换编码 |

### 时间风险

Word 和 PDF 转换的边缘 case 调试可能超出预期。建议优先完成 Markdown 直接导入和 Drop Zone 框架，转换功能作为增量迭代。CSV 查看器作为 P2 可延后至 Sprint 1 末尾或 Sprint 2。

### 资源风险

- `mammoth`（MIT）和 `pdf-parse`（MIT）均为开源免费
- `papaparse`（MIT）和 `@tanstack/react-virtual`（MIT）均为开源免费

## 参考文档

- [`CLAUDE.md`](../../../CLAUDE.md) — 项目规范（"文件即真相"原则）
- [`specs/design/architecture.md`](../../design/architecture.md) — 系统架构
- [`specs/design/ui-ux-design.md`](../../design/ui-ux-design.md) — UI/UX 设计规范
- [`specs/design/data-and-api.md`](../../design/data-and-api.md) — IPC 接口定义
- [`specs/requirements/phase1/sprint1-editor-filesystem.md`](../../requirements/phase1/sprint1-editor-filesystem.md) — 需求 2.5、2.6
- [mammoth.js 文档](https://github.com/mwilliamson/mammoth.js) — Word 转换库
- [pdf-parse 文档](https://www.npmjs.com/package/pdf-parse) — PDF 解析库
- [papaparse 文档](https://www.papaparse.com/) — CSV 解析库
- [@tanstack/react-virtual 文档](https://tanstack.com/virtual/latest) — 虚拟滚动
- `src/main/services/file-manager.ts` — FileManager 服务
- `src/main/ipc/handlers/file.handler.ts` — 文件 IPC 处理器
- `src/preload/index.ts` — Preload API

## 实施计划

### 第 1 步：安装依赖并创建 ImportManager 骨架

- 安装 `mammoth`、`pdf-parse`、`papaparse`、`@tanstack/react-virtual`
- 创建 `ImportManager` 类骨架
- 定义类型文件 `import-manager.types.ts`
- 预计耗时：2 小时

### 第 2 步：实现 Markdown 直接导入

- 实现 `importMarkdown()` — 最简导入路径
- 编写 `file:import` IPC Handler
- 扩展 Preload API
- 扩展 `IPC_CHANNELS` 和 `IPCChannelMap`
- 预计耗时：3 小时

### 第 3 步：实现 Drop Zone 和导入触发

- 实现 `useDropZone` Hook
- 创建 `DropZoneOverlay` 组件
- 集成到 `AppLayout` 或根组件
- 拖放后调用 `file:import` IPC
- 预计耗时：3 小时

### 第 4 步：实现 Word 和 PDF 转换

- 实现 `convertWordToMarkdown()`（mammoth 集成）
- 实现 `convertPdfToMarkdown()`（pdf-parse 集成）
- 文件类型路由逻辑
- 测试多种格式文件
- 预计耗时：4 小时

### 第 5 步：实现文件夹递归导入

- 实现 `importDirectory()` 递归逻辑
- 目录结构保持
- 支持的文件类型过滤
- 预计耗时：2 小时

### 第 6 步：实现导入进度和摘要 UI

- 实现 `file:importProgress` 事件推送
- 创建导入进度 UI（可选：进度条 / toast）
- 创建 `ImportSummaryDialog` 组件
- 导入完成后触发文件树刷新
- 预计耗时：3 小时

### 第 7 步：实现 CSV 查看器

- 创建 `CsvViewer` 组件
- 集成 papaparse 解析
- 实现列排序
- 实现表头固定
- 预计耗时：3 小时

### 第 8 步：实现 CSV 虚拟滚动

- 集成 `@tanstack/react-virtual`
- 实现虚拟化表格渲染
- 测试 10000 行 CSV 性能
- 解析失败回退到文本视图
- 预计耗时：2 小时

### 第 9 步：测试编写

- ImportManager 单元测试
- useDropZone Hook 测试
- CSV 解析和排序测试
- IPC 集成测试
- 确保覆盖率 ≥ 60%
- 预计耗时：4 小时

## 完成标准

**本任务完成的标志：**

1. 拖拽 Markdown / Word / PDF 文件到窗口可成功导入
2. 导入过程有进度反馈，完成后显示结果摘要
3. CSV 文件可在表格查看器中正确展示，支持排序和虚拟滚动
4. 所有新增 IPC 通道类型安全
5. 单元测试覆盖率 ≥ 60%
6. 亮色/暗色模式均正常显示

**交付物：**

- [ ] `src/main/services/import-manager.ts`（新增）
- [ ] `src/main/services/types/import-manager.types.ts`（新增）
- [ ] `src/main/ipc/handlers/file.handler.ts`（扩展：file:import 通道）
- [ ] `src/preload/index.ts`（扩展：import API）
- [ ] `src/shared/types.ts`（扩展：IPC_CHANNELS + 类型）
- [ ] `src/renderer/hooks/useDropZone.ts`（新增）
- [ ] `src/renderer/components/import/DropZoneOverlay.tsx`（新增）
- [ ] `src/renderer/components/import/ImportSummaryDialog.tsx`（新增）
- [ ] `src/renderer/components/viewer/CsvViewer.tsx`（新增）
- [ ] 对应的测试文件

## 备注

- 文件大小限制：单文件 < 10MB（遵循非功能需求 3.2）
- 导入文件类型白名单：`.md`、`.docx`、`.pdf`、`.csv`、`.txt`
- PDF 转换是有损的（仅文本提取），需在导入摘要中向用户说明
- mammoth 对 `.doc`（旧格式）不支持，仅支持 `.docx`（Office Open XML）
- 后续可扩展：Notion 导出 ZIP 导入、飞书文档导入、在线 URL 导入
- CSV 编辑功能（需求 2.6 AC4）标记为 P2 可选，本任务优先实现只读查看

---

**创建时间：** 2026-03-31
**最后更新：** 2026-03-31
**更新记录：**
- 2026-03-31 — 创建任务文档，含 9 个子任务
