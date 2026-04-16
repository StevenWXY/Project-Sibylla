# PHASE1-TASK004: 文件导入与 CSV 查看器 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task004_file-import.md](../specs/tasks/phase1/phase1-task004_file-import.md)
> 创建日期：2026-04-16
> 最后更新：2026-04-16

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK004 |
| **任务标题** | 文件导入与 CSV 查看器 |
| **优先级** | P1（导入）/ P2（CSV） |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **前置依赖** | ✅ Phase0 FileManager、✅ Phase0 IPC 框架、🔄 PHASE1-TASK001（文件树 CRUD） |

### 目标

实现文件导入功能（拖拽 Markdown/Word/PDF → workspace），以及 CSV 文件的表格查看器（排序 + 虚拟滚动）。所有导入内容最终存储为 Markdown 明文（遵循 CLAUDE.md "文件即真相"原则）。

### 范围边界

**包含：**
- 全局拖拽 Drop Zone（`useDropZone` Hook + `DropZoneOverlay` 组件）
- Markdown 文件直接复制导入
- Word（.docx）→ Markdown 转换（mammoth）
- PDF → Markdown 转换（pdf-parse）
- 文件夹递归导入（保持目录结构）
- 导入结果摘要弹窗（`ImportSummaryDialog`）
- 导入进度实时反馈（IPC 事件推送）
- `file:import` / `file:importProgress` IPC 通道
- CSV 表格查看器（`CsvViewer`，papaparse 解析）
- CSV 列排序 + 虚拟滚动（@tanstack/react-virtual）

**不包含：**
- 在线导入（URL / API）— Phase 2
- Notion / 飞书导入 — 后续迭代
- CSV 编辑功能 — 仅查看模式
- 图片和附件导入 — 后续迭代
- 导入历史记录 — 暂不实现

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 路径 | 关键约束 |
|------|------|---------|
| 项目宪法 | `CLAUDE.md` | TypeScript 严格模式禁止 any；文件即真相；Git 不可见；注释英文/commit 中文；主进程与渲染进程严格隔离 |
| 系统架构 | `specs/design/architecture.md` | 渲染进程禁止直接访问文件系统；IPC 通信严格隔离；Zustand 状态管理；TailwindCSS 样式 |
| UI/UX 规范 | `specs/design/ui-ux-design.md` | 品牌色 Indigo-500；>2s 操作需进度反馈；文件丢失不可接受（原子写入） |
| 数据模型与 API | `specs/design/data-and-api.md` | `file:import` IPC 通道定义；`FileContent` / `FileInfo` 类型 |
| 任务规格 | `specs/tasks/phase1/phase1-task004_file-import.md` | 9 个子任务、13 条功能验收标准、7 类测试用例 |

### 2.2 Skill 依赖

| Skill | 路径 | 使用场景 |
|-------|------|---------|
| `electron-ipc-patterns` | `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` | `file:import` 通道注册（invoke/handle 模式）；`file:importProgress` 主进程→渲染进程事件推送（webContents.send）；类型安全 IPC 接口设计；错误处理与超时 |
| `typescript-strict-mode` | `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` | `ImportResult` / `ImportFileResult` 严格类型；`ImportableFileType` 联合类型；类型守卫 `isSupportedFile()`；泛型约束 |
| `zustand-state-management` | `.kilocode/skills/phase1/zustand-state-management/SKILL.md` | 导入进度状态管理；selector 优化避免重渲染；IPC 调用封装在 store action 中 |
| `vercel-react-best-practices` | `.kilocode/skills/common/vercel-react-best-practices/SKILL.md` | `CsvViewer` 虚拟列表 re-render 最小化；`useCallback` 稳定引用；`React.memo` 优化行渲染 |
| `frontend-design` | `.kilocode/skills/common/frontend-design/SKILL.md` | DropZone overlay 视觉设计；ImportSummaryDialog 弹窗设计 |
| `tiptap-wysiwyg-editor` | `.kilocode/skills/phase1/tiptap-wysiwyg-editor/SKILL.md` | CSV 回退到文本视图时可能复用只读编辑器展示 |

### 2.3 前置代码依赖

| 模块 | 路径 | 状态 | 说明 |
|------|------|------|------|
| FileManager | `sibylla-desktop/src/main/services/file-manager.ts` | ✅ 已完成 | 文件读写、原子写入、路径验证；`writeFile()` 确保原子写入；`getWorkspaceRoot()` 获取根路径 |
| FileHandler | `sibylla-desktop/src/main/ipc/handlers/file.handler.ts` | ✅ 已完成 | `file:read/write/delete/copy/move/list` 已注册；需扩展 `file:import` 通道 |
| IpcHandler 基类 | `sibylla-desktop/src/main/ipc/handler.ts` | ✅ 已完成 | `safeHandle()` 错误包装；`wrapResponse()` / `wrapError()` 响应封装 |
| Preload API | `sibylla-desktop/src/preload/index.ts` | ✅ 已完成 | `safeInvoke()` + 30s 超时 + 白名单；需扩展 `file.import` / `file.onImportProgress` |
| 共享类型 | `sibylla-desktop/src/shared/types.ts` | ✅ 已完成 | `IPC_CHANNELS`、`IPCChannelMap`、`IPCResponse<T>`、`FileInfo`、`FileContent`；需扩展导入相关类型 |
| Logger | `sibylla-desktop/src/main/utils/logger.ts` | ✅ 已完成 | 结构化日志 `logger.info()` / `logger.warn()` / `logger.error()` |
| file-manager.types | `sibylla-desktop/src/main/services/types/file-manager.types.ts` | ✅ 已完成 | `FileInfo`、`FileContent`、`WriteFileOptions` 等类型定义 |
| AppLayout | `sibylla-desktop/src/renderer/components/layout/AppLayout.tsx` | ✅ 已完成 | 应用根布局；DropZone overlay 需挂载于此（z-50 全屏覆盖） |
| WorkspaceStudioPage | `sibylla-desktop/src/renderer/pages/WorkspaceStudioPage.tsx` | ✅ 已完成 | 文件树刷新逻辑；导入完成后需触发刷新 |
| UI 组件库 | `sibylla-desktop/src/renderer/components/ui/` | ✅ 已完成 | `Modal`、`Button`、`Badge` 等复用组件 |
| tabStore | `sibylla-desktop/src/renderer/store/tabStore.ts` | ✅ 已完成 | 导入后打开文件需通过 tabStore |
| cn 工具 | `sibylla-desktop/src/renderer/utils/cn.ts` | ✅ 已完成 | `clsx` + `tailwind-merge` className 合并 |
| Lucide React | node_modules | ✅ 已安装 | `Upload`、`FileCheck`、`AlertCircle`、`ChevronUp`、`ChevronDown` 等图标 |

### 2.4 被依赖任务

| 任务 | 依赖方式 |
|------|---------|
| Sprint 2 在线导入 | 复用 ImportManager 服务层，扩展 URL 导入源 |
| Sprint 2 Notion 导入 | 复用 ImportManager 框架，新增 Notion ZIP 解析 |

### 2.5 npm 依赖（需新增）

| 包名 | 版本 | 用途 | 许可证 |
|------|------|------|--------|
| `mammoth` | ^1.x | Word (.docx) → HTML/Markdown 转换 | MIT |
| `pdf-parse` | ^1.x | PDF 文本提取 | MIT |
| `papaparse` | ^5.x | CSV 解析（流式、容错） | MIT |
| `@tanstack/react-virtual` | ^3.x | CSV 大数据量虚拟滚动 | MIT |
| `@types/papaparse` | ^5.x (devDeps) | papaparse 类型定义 | MIT |

---

## 三、现有代码盘点与差距分析

### 3.1 需新建的文件

| # | 文件路径 | 类型 | 说明 |
|---|---------|------|------|
| 1 | `src/main/services/import-manager.ts` | 新增 | 导入管理器主服务（importFiles / convertWord / convertPdf / importMarkdown） |
| 2 | `src/main/services/types/import-manager.types.ts` | 新增 | ImportResult / ImportFileResult / ImportOptions 类型定义 |
| 3 | `src/renderer/hooks/useDropZone.ts` | 新增 | 全局拖拽检测 Hook（dragenter/leave/drop 计数器） |
| 4 | `src/renderer/components/import/DropZoneOverlay.tsx` | 新增 | 全屏拖拽 overlay（z-50、半透明模糊、上传图标） |
| 5 | `src/renderer/components/import/ImportSummaryDialog.tsx` | 新增 | 导入结果摘要弹窗（四类统计 + 失败详情） |
| 6 | `src/renderer/components/viewer/CsvViewer.tsx` | 新增 | CSV 表格查看器（papaparse + 虚拟滚动 + 列排序） |
| 7 | `src/renderer/components/import/index.ts` | 新增 | import 组件桶导出 |
| 8 | `src/renderer/components/viewer/index.ts` | 新增 | viewer 组件桶导出 |

### 3.2 需修改的文件

| # | 文件路径 | 修改内容 | 风险 |
|---|---------|---------|------|
| 1 | `src/shared/types.ts` | 新增 `IPC_CHANNELS.FILE_IMPORT` / `FILE_IMPORT_PROGRESS`；扩展 `IPCChannelMap`；新增 `ImportResult` / `ImportFileResult` / `ImportOptions` / `ImportProgress` 类型 | 低 — 纯新增，不改动现有类型 |
| 2 | `src/main/ipc/handlers/file.handler.ts` | 新增 `file:import` handler 注册；注入 ImportManager 实例；连接 progress 事件推送 | 中 — 扩展现有 handler |
| 3 | `src/preload/index.ts` | 扩展 `file.import()` / `file.onImportProgress()` 方法；更新 `ElectronAPI` 接口；更新白名单 | 中 — 修改 preload 桥接 |
| 4 | `src/renderer/components/layout/AppLayout.tsx` | 挂载 `<DropZoneOverlay />`；引入 `useDropZone` Hook；处理拖放 → 调用 `file.import` IPC | 低 — 新增挂载点，不改动现有布局 |
| 5 | `src/renderer/pages/WorkspaceStudioPage.tsx` | 导入完成后触发文件树刷新；CSV 文件路由到 CsvViewer | 低 — 小幅扩展文件打开逻辑 |

### 3.3 现有 IPC 架构适配分析

当前 `IPC_CHANNELS` 定义了 42 个通道，`IPCChannelMap` 提供了完整的类型安全映射。新增 `file:import` 需遵循以下约定：

```
现有模式:
  IPC_CHANNELS 中定义常量 → IPCChannelMap 中声明 params/return →
  preload safeInvoke 封装 → IpcHandler.safeHandle 包装 → 主进程业务逻辑

本任务新增:
  FILE_IMPORT: 'file:import'         → params: [sourcePaths: string[], options?: ImportOptions] → return: ImportResult
  FILE_IMPORT_PROGRESS: 'file:importProgress' → Main → Renderer 事件推送（不走 IPCChannelMap）
```

**关键约束：** `safeInvoke()` 有 30s 超时。大文件导入可能超时，需改用进度事件模式（主进程异步处理 + `webContents.send` 推送进度），`file:import` 的 invoke 本身应快速返回（仅启动导入任务），或移除超时限制。

### 3.4 文件打开路由适配

当前 `WorkspaceStudioPage` 通过 `openFile(path)` 函数处理文件打开，内部判断 `extension` 决定使用 `WysiwygEditor`。CSV 查看器需在此路由逻辑中新增分支：

```
现有路由: .md / .txt → WysiwygEditor
新增路由: .csv → CsvViewer（独立组件，不走编辑器）
```

### 3.5 不存在的目录

- `src/renderer/components/import/` — 需新建
- `src/renderer/components/viewer/` — 需新建
- `src/main/services/types/import-manager.types.ts` — 需新建（但 `types/` 目录已存在）

---

## 四、类型系统设计

> 类型定义分两处：共享类型放 `src/shared/types.ts`（IPC 通信层），服务层内部类型放 `src/main/services/types/import-manager.types.ts`。

### 4.1 共享类型（src/shared/types.ts 新增）

#### 共享类型定义（src/shared/types.ts 新增）

| 类型 | 定义 | 说明 |
|------|------|------|
| `ImportableFileType` | `'.md' \| '.docx' \| '.pdf' \| '.csv' \| '.txt'` | 支持导入的文件扩展名联合类型 |
| `ImportFileResult` | `{ sourcePath, destPath, action: 'copied'\|'converted'\|'skipped'\|'failed', sourceType, error? }` | 单文件导入结果 |
| `ImportResult` | `{ imported[], converted[], skipped[], failed[], durationMs }` | 批量导入结果摘要 |
| `ImportOptions` | `{ targetDir?, flatten?, overwrite? }` | 导入选项（不含 onProgress，不可跨 IPC 序列化） |
| `ImportProgress` | `{ current, total, fileName }` | 进度事件数据 |
| `IPC_CHANNELS` 扩展 | `FILE_IMPORT: 'file:import'` / `FILE_IMPORT_PROGRESS: 'file:importProgress'` | 新增 IPC 通道常量 |
| `IPCChannelMap` 扩展 | `[FILE_IMPORT]: { params: [sourcePaths, options?]; return: ImportResult }` | 类型安全映射 |

**设计决策：** `ImportOptions` 不含 `onProgress` 回调（不可跨 IPC 序列化）。`FILE_IMPORT_PROGRESS` 是 Main→Renderer 单向事件，不走 IPCChannelMap。

### 4.2 服务层类型（src/main/services/types/import-manager.types.ts）

`InternalImportOptions extends ImportOptions`：新增 `onProgress?: ImportProgressCallback`，仅服务层内部使用。IPC Handler 将 `ImportOptions` 转换为 `InternalImportOptions`，注入进度回调。

### 4.3 CSV 查看器类型（组件内部定义）

`CsvViewerProps { filePath: string; className?: string }`、`CsvSortState { columnIndex: number; direction: 'asc' | 'desc' }`。

### 4.4 类型守卫

`SUPPORTED_EXTENSIONS: readonly string[] = ['.md', '.docx', '.pdf', '.csv', '.txt']`；`isSupportedFileType(fileName)` 通过 `path.extname()` + `includes()` 判断。使用 `readonly string[]` 的 `includes()` 是 TypeScript 严格模式下安全的类型缩窄模式（避免 `as ImportableFileType` 断言）。

---

## 五、ImportManager 服务设计

### 5.1 类结构

`ImportManager` 构造函数注入 `FileManager`（保证原子写入和路径验证）。使用模块级 `logger` 单例（与现有 FileManager 一致）。常量：`SUPPORTED_EXTENSIONS` 白名单、`MAX_FILE_SIZE_BYTES = 10MB`。

方法清单：`importFiles()`（公开入口）、`importSingleFile()`（文件类型路由）、`importMarkdown()` / `importTxtFile()`（直接复制）、`convertWordToMarkdown()` / `convertPdfToMarkdown()`（格式转换）、`importDirectory()`（递归目录）、`isSupportedFile()` / `categorizeResult()`（工具方法）。

### 5.2 importFiles 核心流程

遍历 `sourcePaths`：对每个路径 `fs.stat()` → 目录则递归 `importDirectory()` 合并结果 → 文件则 `importSingleFile()` → 异常加入 `failed`。每处理一个路径触发 `options.onProgress(current, total, fileName)`。最终记录 `durationMs` + 结构化日志。

### 5.3 importSingleFile 路由

`ext = path.extname(sourcePath).toLowerCase()` → 不支持则 `skipped` → 大小超 10MB 则 `failed` → 目标已存在且 `overwrite=false` 则 `skipped` → 按 ext 路由：`.md/.txt/.csv` → `importMarkdown()`；`.docx` → `convertWordToMarkdown()`；`.pdf` → `convertPdfToMarkdown()`。

### 5.4 convertWordToMarkdown

`mammoth.convertToMarkdown({ path: sourcePath })` → 转换警告记录 logger → `fileManager.writeFile(destPath, result.value)` → 返回 `{ action: 'converted', sourceType: '.docx' }`。输出文件名 `.docx` → `.md`。异常处理：`InvalidZipFileError` → "无效的 Word 文件格式"，其他异常向上冒泡。

### 5.5 convertPdfToMarkdown

`pdfParse(dataBuffer)` → 拼接标题 + 来源注释 + `data.text` → `fileManager.writeFile()` → 返回 `{ action: 'converted', sourceType: '.pdf' }`。注意：扫描版 PDF `data.text` 可能为空（在摘要中标注"有损转换"），加密 PDF 捕获为 failed。

### 5.6 importDirectory 递归

`newTargetDir = options.flatten ? targetDir : path.join(targetDir, dirName)` → `fs.readdir(dirPath, { withFileTypes: true })` → 仅收集 `isDirectory()` 或 `isSupportedFile()` 的条目 → 递归调用 `importFiles()`。

### 5.7 FileManager.writeFile 集成

通过 `FileManager.writeFile()` 写入，复用其原子写入、路径验证、禁止路径检查。**关键：** `destPath` 须为 workspace 相对路径（传给 fileManager），`sourcePath` 为外部绝对路径（用于读取源文件）。

---

## 六、IPC 通道设计与 Preload 扩展

### 6.1 新增 IPC 通道

| 通道 | 方向 | 参数 | 返回值 | 说明 |
|------|------|------|--------|------|
| `file:import` | Renderer → Main | `[sourcePaths: string[], options?: ImportOptions]` | `ImportResult` | 批量导入，同步等待完成 |
| `file:importProgress` | Main → Renderer | — | `ImportProgress` | 导入进度事件推送 |

**设计决策：** `file:import` 使用 `invoke/handle` 模式（渲染进程等待最终结果）。`file:importProgress` 使用 `webContents.send` 推送模式（主进程主动推送进度）。

### 6.2 FileHandler 扩展

在现有 `FileHandler` 类中新增：

```typescript
// src/main/ipc/handlers/file.handler.ts 新增

private importManager: ImportManager | null = null

setImportManager(importManager: ImportManager): void {
  this.importManager = importManager
}

// 在 register() 中新增:
ipcMain.handle(IPC_CHANNELS.FILE_IMPORT, this.safeHandle(this.importFiles.bind(this)))

// 新增方法:
private async importFiles(
  _event: IpcMainInvokeEvent,
  sourcePaths: string[],
  options?: ImportOptions
): Promise<ImportResult> {
  if (!this.importManager) throw new Error('ImportManager not initialized')

  const internalOptions: InternalImportOptions = {
    ...options,
    onProgress: (current, total, fileName) => {
      // 向所有渲染进程推送进度事件
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send(IPC_CHANNELS.FILE_IMPORT_PROGRESS, {
          current, total, fileName
        } satisfies ImportProgress)
      })
    },
  }

  return this.importManager.importFiles(sourcePaths, internalOptions)
}
```

**关键点：**
- 使用 `BrowserWindow.getAllWindows()` 而非硬编码 `mainWindow`，支持多窗口场景
- `options` 从渲染进程传入（可序列化），`internalOptions` 注入不可序列化的回调
- 复用 `safeHandle()` 自动错误包装

### 6.3 Preload API 扩展

在 `ElectronAPI` 接口的 `file` 命名空间中新增：

```typescript
// src/preload/index.ts 扩展

interface ElectronAPI {
  file: {
    // ... 现有方法保持不变
    
    // 新增
    import: (sourcePaths: string[], options?: ImportOptions) =>
      Promise<IPCResponse<ImportResult>>
    onImportProgress: (callback: (data: ImportProgress) => void) => () => void
  }
}
```

实现：

```typescript
// file 对象内新增
import: (sourcePaths: string[], options?: ImportOptions) =>
  safeInvoke<ImportResult>(IPC_CHANNELS.FILE_IMPORT, sourcePaths, options),

onImportProgress: (callback: (data: ImportProgress) => void) => {
  const handler = (_event: IpcRendererEvent, data: ImportProgress) => callback(data)
  ipcRenderer.on(IPC_CHANNELS.FILE_IMPORT_PROGRESS, handler)
  return () => {
    ipcRenderer.removeListener(IPC_CHANNELS.FILE_IMPORT_PROGRESS, handler)
  }
},
```

**设计要点：**
- `onImportProgress` 返回取消函数（cleanup），防止内存泄漏
- `safeInvoke` 白名单需新增 `IPC_CHANNELS.FILE_IMPORT`
- `onImportProgress` 使用 `ipcRenderer.on` 而非 `safeInvoke`（单向事件，不走 invoke）

### 6.4 IPC 超时处理

当前 `safeInvoke` 有 30s 超时。大文件夹导入可能超过 30s。

**方案：** 为 `file:import` 设置更长的超时（120s），或在 `safeInvoke` 中支持自定义超时：

```typescript
import: (sourcePaths: string[], options?: ImportOptions) =>
  safeInvoke<ImportResult>(IPC_CHANNELS.FILE_IMPORT, sourcePaths, options, { timeout: 120_000 }),
```

如果 `safeInvoke` 当前不支持第四参数，则需扩展其签名（见实施 Step 2 中的具体修改）。

---

## 七、渲染进程组件设计

### 7.1 组件层级

```
AppLayout (改造 — 挂载 DropZone)
├── DropZoneOverlay (新增 — src/renderer/components/import/DropZoneOverlay.tsx)
├── ImportSummaryDialog (新增 — src/renderer/components/import/ImportSummaryDialog.tsx)
└── WorkspaceStudioPage (改造 — CSV 路由)
    └── CsvViewer (新增 — src/renderer/components/viewer/CsvViewer.tsx)
```

### 7.2 useDropZone Hook

**文件：** `src/renderer/hooks/useDropZone.ts`

```
签名: useDropZone(onDrop: (filePaths: string[]) => void) => { isDragging: boolean }

核心逻辑:
  1. dragCounterRef = useRef(0)  // 防止子元素触发闪烁
  2. dragenter:
     - e.preventDefault()
     - dragCounterRef.current++
     - e.dataTransfer?.types.includes('Files') → setIsDragging(true)
  3. dragleave:
     - e.preventDefault()
     - dragCounterRef.current--
     - dragCounterRef.current === 0 → setIsDragging(false)
  4. drop:
     - e.preventDefault()
     - setIsDragging(false), dragCounterRef.current = 0
     - 收集 e.dataTransfer?.files → 提取 path（Electron 中 file.path 可用）
     - 调用 onDrop(filePaths)
  5. dragover: e.preventDefault() // 必须阻止默认行为才能触发 drop

  useEffect cleanup: 移除全部四个事件监听
  依赖: [onDrop]（用 useCallback 包裹 onDrop 避免频繁重建）
```

**Electron 特有：** 渲染进程中 `File.path` 属性仅在 Electron 的 `webPreferences.nodeIntegration: false` + `contextIsolation: true` 环境下可通过 `file.path` 获取本地文件绝对路径。如果不可用，需通过 `webUtils.getPathForFile(file)` 获取。

### 7.3 DropZoneOverlay 组件

**文件：** `src/renderer/components/import/DropZoneOverlay.tsx`

```
Props: { isDragging: boolean }
条件渲染: isDragging === false → return null

视觉设计:
  - fixed inset-0 z-50 全屏覆盖
  - bg-black/40 backdrop-blur-sm 半透明模糊背景
  - 居中卡片: border-2 border-dashed border-indigo-400
  - Upload 图标 (lucide-react) + "拖放文件到此处导入" 文案
  - 副标题: "支持 Markdown、Word、PDF、CSV 文件及文件夹"
  - 支持暗色模式 (dark: 变体)
```

**React.memo：** 纯展示组件，使用 `React.memo` 避免不必要的重渲染。

### 7.4 ImportSummaryDialog 组件

**文件：** `src/renderer/components/import/ImportSummaryDialog.tsx`

```
Props: { result: ImportResult; onClose: () => void }
挂载: 复用现有 Modal 组件 (src/renderer/components/ui/Modal.tsx)

布局:
  ┌─────────────────────────────────────┐
  │  导入完成                            │
  │                                     │
  │  ┌──────┐ ┌──────┐                  │
  │  │ ✅ 5  │ │ 🔄 3  │                │
  │  │直接导入│ │格式转换│                │
  │  └──────┘ └──────┘                  │
  │  ┌──────┐ ┌──────┐                  │
  │  │ ⏭ 2  │ │ ❌ 1  │                │
  │  │已跳过 │ │失败   │                 │
  │  └──────┘ └──────┘                  │
  │                                     │
  │  共处理 11 个文件，耗时 2.3 秒        │
  │                                     │
  │  ⚠ 失败详情（仅 failed.length > 0）  │
  │  ┌─────────────────────────────────┐│
  │  │ report.docx: 无效的文件格式      ││
  │  └─────────────────────────────────┘│
  │                                     │
  │                          [ 确定 ]    │
  └─────────────────────────────────────┘

统计卡片:
  - 直接导入 (FileCheck icon, green) → result.imported.length
  - 格式转换 (RefreshCw icon, blue)  → result.converted.length
  - 已跳过   (FileX icon, gray)      → result.skipped.length
  - 失败     (AlertCircle icon, red) → result.failed.length
```

### 7.5 CsvViewer 组件

**文件：** `src/renderer/components/viewer/CsvViewer.tsx`

```
Props: { filePath: string; className?: string }

状态:
  - headers: string[]       // CSV 表头
  - data: string[][]        // CSV 数据行
  - sortState: CsvSortState | null  // 排序状态
  - isLoading: boolean
  - error: string | null
  - parentRef: RefObject<HTMLDivElement>  // 虚拟滚动容器

数据加载流程:
  1. useEffect on filePath change
  2. setIsLoading(true)
  3. window.electronAPI.file.read(filePath)
  4. Papa.parse(result.data.content, { header: false, skipEmptyLines: true })
  5. parsed.errors.length > 0 → throw Error
  6. rows = parsed.data as string[][]
  7. setHeaders(rows[0] ?? []), setData(rows.slice(1))
  8. setIsLoading(false)

排序:
  - sortedData = useMemo
  - 无 sortState → 原始 data
  - 有 sortState → [...data].sort(localeCompare with { numeric: true })
  - 点击表头 → toggleSort(columnIndex)
    - 同列 → direction 翻转 (asc ↔ desc)
    - 不同列 → asc

虚拟滚动:
  - rowVirtualizer = useVirtualizer({
      count: sortedData.length,
      getScrollElement: () => parentRef.current,
      estimateSize: () => 36,
      overscan: 20
    })
  - > 0 行即启用虚拟滚动（统一路径，无需条件判断）
  - 表头 position: sticky top-0 z-10

错误回退:
  - error !== null → 显示错误信息 + "以文本方式打开" 按钮
  - 文本方式：使用 react-markdown 渲染原始 CSV 内容

横向滚动:
  - 列数 > 8 时启用 overflow-x-auto
  - 每列最小宽度 120px (min-w-[120px])
  - 单元格内容 truncate + title tooltip
```

### 7.6 AppLayout 集成

在 `AppLayout.tsx` 中新增：

```typescript
// 顶部导入
import { useDropZone } from '../hooks/useDropZone'
import { DropZoneOverlay } from '../import/DropZoneOverlay'
import { ImportSummaryDialog } from '../import/ImportSummaryDialog'

// 组件内部
const [importResult, setImportResult] = useState<ImportResult | null>(null)
const [isImporting, setIsImporting] = useState(false)
const [progress, setProgress] = useState<ImportProgress | null>(null)

const handleDrop = useCallback(async (filePaths: string[]) => {
  setIsImporting(true)
  const result = await window.electronAPI.file.import(filePaths)
  if (result.success && result.data) {
    setImportResult(result.data)
  }
  setIsImporting(false)
}, [])

const { isDragging } = useDropZone(handleDrop)

// 进度监听
useEffect(() => {
  const cleanup = window.electronAPI.file.onImportProgress(setProgress)
  return cleanup
}, [])

// JSX
return (
  <div className="...">
    {/* 现有布局不变 */}
    <DropZoneOverlay isDragging={isDragging} />
    {importResult && (
      <ImportSummaryDialog result={importResult} onClose={() => setImportResult(null)} />
    )}
    {/* 可选：进度条 */}
  </div>
)
```

**设计决策：** 拖拽逻辑挂在 `AppLayout` 而非 `WorkspaceStudioPage`，确保全局生效（包括无 workspace 打开时也有反馈）。导入结果弹窗同样全局级别。文件树刷新由导入完成后 IPC 层自动触发 file watcher 事件。

---

## 八、分步实施计划

> 共 8 步，每步产出可独立验证的增量。Step 1-3 为核心骨架（Markdown 导入链路端到端跑通），Step 4-5 为格式转换，Step 6-7 为 CSV 查看器，Step 8 为测试。

### Step 1：安装依赖 + 类型定义（预估 1.5h）

**产出：** 依赖安装、类型文件、IPC_CHANNELS 扩展

**实施内容：**
1. 安装 npm 依赖：
   ```bash
   cd sibylla-desktop
   npm install mammoth pdf-parse papaparse @tanstack/react-virtual
   npm install -D @types/papaparse
   ```
2. 在 `src/shared/types.ts` 中：
   - 新增 `ImportableFileType`、`ImportFileResult`、`ImportResult`、`ImportOptions`、`ImportProgress` 类型
   - 扩展 `IPC_CHANNELS`：新增 `FILE_IMPORT` / `FILE_IMPORT_PROGRESS`
   - 扩展 `IPCChannelMap`：新增 `file:import` 映射
3. 创建 `src/main/services/types/import-manager.types.ts`：
   - `ImportProgressCallback` 接口
   - `InternalImportOptions` 接口

**验证标准：**
- [ ] `npm run type-check` 通过
- [ ] `npm run lint` 通过
- [ ] `mammoth` / `pdf-parse` / `papaparse` / `@tanstack/react-virtual` 在 `package.json` 中可见

### Step 2：ImportManager 服务骨架 + Markdown 导入（预估 2h）

**产出：** `import-manager.ts`（Markdown 直接导入路径）

**实施内容：**
1. 创建 `src/main/services/import-manager.ts`：
   - `ImportManager` 类骨架（构造函数、`importFiles` 入口）
   - `importMarkdown()` — 读取外部 .md 文件内容 → `fileManager.writeFile()` 写入
   - `importTxtFile()` — 同 .md 逻辑
   - `importSingleFile()` — 文件类型路由 + 大小检查
   - `isSupportedFile()` — 扩展名白名单检查
   - `categorizeResult()` — 按 action 分类到 result 四个数组
2. 编写基础单元测试：
   - `importMarkdown()` 读取 .md 并写入 workspace
   - `isSupportedFile()` 各扩展名判断
   - 大小超限检查

**验证标准：**
- [ ] 导入单个 .md 文件到 workspace 成功
- [ ] 不支持的文件类型返回 `skipped`
- [ ] 超过 10MB 的文件返回 `failed`
- [ ] 单元测试通过

### Step 3：IPC 通道 + Preload + Drop Zone 端到端（预估 3h）

**产出：** `file:import` IPC 通道打通、拖拽导入基础链路

**实施内容：**
1. 扩展 `src/main/ipc/handlers/file.handler.ts`：
   - 新增 `importManager` 属性和 `setImportManager()` 方法
   - 注册 `FILE_IMPORT` handler
   - 实现 `importFiles` 方法（注入 onProgress 回调推送进度）
2. 扩展 `src/preload/index.ts`：
   - `ElectronAPI.file.import` 方法
   - `ElectronAPI.file.onImportProgress` 方法（返回 cleanup 函数）
   - 更新白名单
3. 创建 `src/renderer/hooks/useDropZone.ts`
4. 创建 `src/renderer/components/import/DropZoneOverlay.tsx`
5. 改造 `src/renderer/components/layout/AppLayout.tsx`：
   - 引入 `useDropZone`
   - 挂载 `DropZoneOverlay`
   - 拖放 → 调用 `window.electronAPI.file.import` → 显示结果
6. 创建 `src/renderer/components/import/index.ts` 桶导出

**验证标准：**
- [ ] 拖拽 .md 文件到窗口 → DropZone overlay 显示
- [ ] 放置后 .md 文件被复制到 workspace
- [ ] 导入完成后文件树刷新显示新文件
- [ ] `npm run type-check` 通过

### Step 4：Word + PDF 转换（预估 3h）

**产出：** `convertWordToMarkdown()` / `convertPdfToMarkdown()`

**实施内容：**
1. 在 `import-manager.ts` 中实现 `convertWordToMarkdown()`：
   - mammoth.convertToMarkdown()
   - 转换警告记录到 logger
   - 输出 .md 文件
2. 实现 `convertPdfToMarkdown()`：
   - pdf-parse 文本提取
   - 添加标题和来源注释
   - 输出 .md 文件
3. 更新 `importSingleFile()` 路由：.docx → convertWord, .pdf → convertPdf
4. 单元测试：
   - 准备测试用 .docx 和 .pdf fixture 文件
   - 验证转换输出为有效 Markdown

**验证标准：**
- [ ] 拖拽 .docx 文件 → 自动转换为 .md 并导入
- [ ] 拖拽 .pdf 文件 → 自动提取文本并转换为 .md
- [ ] 转换后文件树显示 .md 文件（非 .docx/.pdf）
- [ ] 空内容 / 无效文件返回 `failed` 并显示错误信息

### Step 5：文件夹递归导入 + 导入摘要 UI（预估 2h）

**产出：** `importDirectory()`、`ImportSummaryDialog`

**实施内容：**
1. 在 `import-manager.ts` 中实现 `importDirectory()`：
   - 递归读取目录
   - 保持目录结构（或 flatten）
   - 过滤仅支持的文件类型
2. 创建 `src/renderer/components/import/ImportSummaryDialog.tsx`：
   - 四类统计卡片（导入/转换/跳过/失败）
   - 处理总数 + 耗时
   - 失败详情列表
   - PDF 转换标注"有损提取"
3. 集成到 AppLayout：导入完成后弹出摘要

**验证标准：**
- [ ] 拖拽文件夹 → 递归导入所有支持的文件
- [ ] 目录结构在 workspace 中保持一致
- [ ] 导入完成后显示摘要弹窗（分类统计 + 失败详情）
- [ ] 关闭弹窗后可正常操作

### Step 6：导入进度反馈（预估 1.5h）

**产出：** 实时进度 UI

**实施内容：**
1. 在 `AppLayout` 中：
   - 监听 `onImportProgress` 事件
   - 显示进度条（当前/总数 + 文件名）
   - 导入完成后隐藏进度条
2. 进度 UI 设计：
   - 固定在页面顶部或右下角（toast 样式）
   - 使用现有 UI 组件（Badge/Progress 或自定义）
3. 边界情况：
   - 单文件导入：进度直接从 0→1
   - 导入失败：进度 UI 显示错误状态
   - 导入中途关闭窗口：IPC handler 自然完成，进度 UI 不再更新

**验证标准：**
- [ ] 导入 5+ 文件时进度条实时更新
- [ ] 进度显示当前文件名
- [ ] 导入完成后进度 UI 消失

### Step 7：CSV 查看器（预估 3h）

**产出：** `CsvViewer` 组件（papaparse + 虚拟滚动 + 排序）

**实施内容：**
1. 创建 `src/renderer/components/viewer/CsvViewer.tsx`：
   - `useEffect` 加载并解析 CSV（`window.electronAPI.file.read` + `Papa.parse`）
   - 状态管理：headers / data / sortState / isLoading / error
   - 排序逻辑：`useMemo` + `localeCompare({ numeric: true })`
   - 虚拟滚动：`useVirtualizer`（@tanstack/react-virtual）
   - 表头 sticky + 列宽自适应
2. 创建 `src/renderer/components/viewer/index.ts` 桶导出
3. 改造 `WorkspaceStudioPage.tsx` 文件打开路由：
   - `.csv` 扩展名 → 渲染 `<CsvViewer filePath={path} />`
   - 替代默认的 WysiwygEditor
4. 错误回退：
   - 解析失败 → 显示错误信息 + "以文本方式查看" 按钮
   - 文本方式使用 `react-markdown` 渲染原始内容

**验证标准：**
- [ ] 文件树点击 .csv 文件 → CsvViewer 以表格形式渲染
- [ ] 点击列标题 → 排序（升序/降序切换）+ 排序方向图标
- [ ] 10000 行 CSV 文件流畅滚动（虚拟滚动生效）
- [ ] 解析失败的 CSV 显示错误信息
- [ ] 暗色模式下正确显示

### Step 8：测试补全 + 联调验证（预估 3h）

**产出：** 完整测试套件

**实施内容：**
1. ImportManager 单元测试：
   - `importFiles()` 混合文件类型
   - `convertWordToMarkdown()` 有效/无效 .docx
   - `convertPdfToMarkdown()` 有效/空文本/加密 PDF
   - `isSupportedFile()` 大小写扩展名、无扩展名
   - `importDirectory()` 递归 + flatten
   - 大小限制、overwrite 冲突检查
2. useDropZone Hook 测试（vitest + jsdom）：
   - 模拟 dragenter/dragleave/drop 事件
   - 计数器正确性（快速多次 enter/leave）
3. CSV 解析和排序测试：
   - 空文件、仅表头、含引号字段、含换行字段
   - 数字排序 vs 字符串排序、空值排序
4. 集成测试（手动验证）：
   - 完整导入流程：拖拽 → overlay → 放置 → 进度 → 摘要 → 文件树刷新
   - CSV 查看流程：文件树点击 → 表格渲染 → 排序 → 滚动

**验证标准：**
- [ ] 测试覆盖率 ≥ 60%
- [ ] `npm run lint` 无警告
- [ ] `npm run type-check` 无错误
- [ ] 所有验收标准项通过

---

## 九、验收标准与风险评估

### 9.1 功能验收清单

**文件导入（需求 2.5）：**

| # | 验收项 | 对应 Step | 验证方式 |
|---|--------|----------|---------|
| 1 | 拖拽文件到窗口时显示 Drop Zone overlay | Step 3 | 手动验证 |
| 2 | 拖放 Markdown 文件后被复制到 workspace | Step 2-3 | 手动 + 单元测试 |
| 3 | 拖放 Word 文件后自动转换为 Markdown 并导入 | Step 4 | 手动 + 单元测试 |
| 4 | 拖放 PDF 文件后自动提取文本并转换为 Markdown | Step 4 | 手动 + 单元测试 |
| 5 | 拖放文件夹后递归导入所有支持的文件 | Step 5 | 手动验证 |
| 6 | 导入完成后显示摘要：X 文件导入、Y 文件转换 | Step 5 | 手动验证 |
| 7 | 导入过程有进度反馈 | Step 6 | 手动验证 |
| 8 | 导入失败显示具体错误信息 | Step 5 | 手动验证 |
| 9 | 导入后文件树自动刷新 | Step 3 | 手动验证 |

**CSV 查看器（需求 2.6）：**

| # | 验收项 | 对应 Step | 验证方式 |
|---|--------|----------|---------|
| 10 | 打开 CSV 文件时以表格形式渲染 | Step 7 | 手动验证 |
| 11 | 点击列标题可排序 | Step 7 | 手动验证 |
| 12 | 超过 1000 行时使用虚拟滚动 | Step 7 | 性能测试 |
| 13 | CSV 解析失败时显示错误并回退到文本视图 | Step 7 | 手动验证 |

### 9.2 性能指标

| # | 指标 | 目标 | 验证方式 |
|---|------|------|---------|
| 1 | 10 个文件导入 | < 5 秒 | 手动计时 |
| 2 | CSV 查看器打开 10000 行文件 | < 2 秒 | Performance tab |
| 3 | CSV 虚拟滚动帧率 | ≥ 30fps | Chrome DevTools |
| 4 | Drop Zone overlay 响应 | < 100ms | 手动感知 |

### 9.3 用户体验验收

| # | 验收项 | 验证方式 |
|---|--------|---------|
| 1 | Drop Zone overlay 有清晰的视觉引导（图标 + 文案） | 手动验证 |
| 2 | 导入进度有实时反馈（当前/总数 + 文件名） | 手动验证 |
| 3 | 导入摘要分类清晰（导入/转换/跳过/失败） | 手动验证 |
| 4 | CSV 排序方向有图标指示（ChevronUp/Down） | 手动验证 |
| 5 | 暗色模式下所有组件正确显示 | 手动验证 |

### 9.4 交付物清单

| # | 文件 | 类型 | 状态 |
|---|------|------|------|
| 1 | `src/main/services/import-manager.ts` | 新增 | 待创建 |
| 2 | `src/main/services/types/import-manager.types.ts` | 新增 | 待创建 |
| 3 | `src/renderer/hooks/useDropZone.ts` | 新增 | 待创建 |
| 4 | `src/renderer/components/import/DropZoneOverlay.tsx` | 新增 | 待创建 |
| 5 | `src/renderer/components/import/ImportSummaryDialog.tsx` | 新增 | 待创建 |
| 6 | `src/renderer/components/import/index.ts` | 新增 | 待创建 |
| 7 | `src/renderer/components/viewer/CsvViewer.tsx` | 新增 | 待创建 |
| 8 | `src/renderer/components/viewer/index.ts` | 新增 | 待创建 |
| 9 | `src/shared/types.ts` | 更新 | 扩展 IPC_CHANNELS + 导入类型 |
| 10 | `src/main/ipc/handlers/file.handler.ts` | 更新 | 新增 file:import handler |
| 11 | `src/preload/index.ts` | 更新 | 扩展 file.import / onImportProgress |
| 12 | `src/renderer/components/layout/AppLayout.tsx` | 更新 | 挂载 DropZone + 摘要弹窗 |
| 13 | `src/renderer/pages/WorkspaceStudioPage.tsx` | 更新 | CSV 文件路由 |
| 14 | 测试文件（__tests__/） | 新增 | 待创建 |

### 9.5 风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| mammoth Word 转换质量不稳定 | 中 | 中 | 测试多种 Word 文件格式；转换警告记录日志不阻塞；在摘要中标注"有损转换" |
| pdf-parse 对复杂 PDF 支持不足 | 中 | 高 | 仅承诺文本提取；扫描版 PDF 结果可能为空——在摘要中向用户说明"PDF 仅提取文本层" |
| Electron 打包后 mammoth/pdf-parse 不兼容 | 高 | 低 | Step 1 安装后立即验证 dev 模式可用；必要时用 `child_process.fork` 隔离 |
| safeInvoke 30s 超时 vs 大文件夹导入 | 中 | 中 | 扩展 safeInvoke 支持自定义超时（120s）或改为 fire-and-forget 模式 |
| 渲染进程 `File.path` 不可用 | 中 | 低 | 使用 `webUtils.getPathForFile(file)` 作为备选方案 |
| CSV 非 UTF-8 编码导致乱码 | 低 | 中 | papaparse 默认 UTF-8；加载失败时提示用户转换编码 |
| 大文件导入内存占用 | 中 | 低 | 单文件限制 < 10MB；逐文件处理不预加载全部 |

### 9.6 回滚策略

1. `file:import` 为新增 IPC 通道，可安全移除而不影响现有功能
2. `ImportManager` 为新增服务类，可安全删除
3. `DropZoneOverlay` 挂载在 AppLayout 中，移除挂载代码即可回退
4. `CsvViewer` 为独立组件，移除路由分支即可回退到默认编辑器
5. `src/shared/types.ts` 扩展为纯新增，删除新增部分不影响现有类型

---

**创建时间：** 2026-04-16
**最后更新：** 2026-04-16
**更新记录：**
- 2026-04-16 — 初始创建
