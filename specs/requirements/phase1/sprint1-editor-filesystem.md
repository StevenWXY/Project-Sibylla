# Phase 1 Sprint 1 - 编辑器与文件系统需求

## 一、概述

### 1.1 目标与价值

实现 Sibylla 的核心编辑体验，让用户能够在 WYSIWYG 编辑器中编辑 Markdown 文档，管理文件树，导入外部文件。这是用户与 Sibylla 交互的第一触点，决定了产品的第一印象。

### 1.2 涉及模块

- 模块1：文件系统与存储（完整实现）
- 模块2：WYSIWYG 编辑器（基础版）
- 模块14：迁移与导入（基础版）

### 1.3 里程碑定义

**完成标志：**
- 用户能够在文件树中浏览、创建、重命名、删除文件和文件夹
- 用户能够在 WYSIWYG 编辑器中编辑 Markdown 文档
- 用户能够导入 Markdown、Word、PDF 文件
- 多 Tab 文件编辑正常工作

---

## 二、功能需求

### 需求 2.1 - 文件树浏览器

**用户故事：** 作为用户，我想要在左侧栏看到文件树，以便浏览和管理我的文档。

#### 功能描述

展示 workspace 的目录结构，支持文件和文件夹的基本操作。

#### 验收标准

1. When workspace is opened, the system shall display file tree in left sidebar within 500ms
2. When user clicks folder, the system shall toggle expand/collapse state
3. When user clicks file, the system shall open file in editor
4. When user right-clicks file, the system shall show context menu with options: Rename, Delete, Copy Path
5. When user drags file to folder, the system shall move file to target folder
6. When file is being edited, the system shall show indicator dot next to filename
7. When file has unsaved changes, the system shall show asterisk in filename

#### 技术规格

**文件树组件：**
```typescript
// src/renderer/components/FileTree.tsx
interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children?: FileTreeNode[]
  isExpanded?: boolean
}

export function FileTree() {
  const [tree, setTree] = useState<FileTreeNode[]>([])
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  
  useEffect(() => {
    loadFileTree()
  }, [])
  
  const loadFileTree = async () => {
    const files = await window.api.invoke('file:list', '/')
    setTree(buildTree(files))
  }
  
  const handleFileClick = (path: string) => {
    setSelectedPath(path)
    // 触发打开文件
  }
  
  return (
    <div className="file-tree">
      {tree.map(node => (
        <TreeNode key={node.path} node={node} onClick={handleFileClick} />
      ))}
    </div>
  )
}
```

#### 依赖关系

- 前置依赖：Phase 0 文件系统基础
- 被依赖项：编辑器、搜索

#### 优先级

P0 - 必须完成

---

### 需求 2.2 - 文件 CRUD 操作

**用户故事：** 作为用户，我想要创建、重命名、删除文件和文件夹，以便组织我的文档。

#### 验收标准

1. When user clicks "New File" button, the system shall create new untitled file and open in editor
2. When user clicks "New Folder" button, the system shall create new folder with default name "New Folder"
3. When user renames file, the system shall validate filename and show error if invalid characters used
4. When user deletes file, the system shall show confirmation dialog before deletion
5. When user deletes folder, the system shall show warning if folder contains files
6. When file operation fails, the system shall show error message and rollback changes

#### 技术规格

**IPC 接口：**
```typescript
// src/main/ipc/file-handlers.ts
ipcMain.handle('file:create', async (_, path: string, content: string = '') => {
  await fileManager.writeFile(path, content)
  await gitAbstraction.stageFile(path)
  return { success: true }
})

ipcMain.handle('file:rename', async (_, oldPath: string, newPath: string) => {
  await fileManager.renameFile(oldPath, newPath)
  await gitAbstraction.stageFile(newPath)
  return { success: true }
})

ipcMain.handle('file:delete', async (_, path: string) => {
  await fileManager.deleteFile(path)
  await gitAbstraction.stageFile(path)
  return { success: true }
})
```

#### 依赖关系

- 前置依赖：需求 2.1（文件树）
- 被依赖项：编辑器

#### 优先级

P0 - 必须完成

---

### 需求 2.3 - WYSIWYG Markdown 编辑器

**用户故事：** 作为用户，我想要在所见即所得的编辑器中编辑文档，以便不需要学习 Markdown 语法。

#### 功能描述

集成 Tiptap 编辑器，支持富文本编辑，底层存储为 Markdown。

#### 验收标准

1. When user opens Markdown file, the system shall render content in WYSIWYG mode within 200ms
2. When user types text, the system shall update editor content in real-time
3. When user applies formatting, the system shall update Markdown source correctly
4. When user saves file, the system shall convert editor content to Markdown and write to file
5. When user switches to source mode, the system shall show raw Markdown
6. When user switches back to WYSIWYG mode, the system shall parse Markdown and render

#### 技术规格

**编辑器组件：**
```typescript
// src/renderer/components/Editor.tsx
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'

export function Editor({ filePath }: { filePath: string }) {
  const [content, setContent] = useState('')
  const [mode, setMode] = useState<'wysiwyg' | 'source'>('wysiwyg')
  
  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown
    ],
    content,
    onUpdate: ({ editor }) => {
      const markdown = editor.storage.markdown.getMarkdown()
      handleContentChange(markdown)
    }
  })
  
  useEffect(() => {
    loadFile()
  }, [filePath])
  
  const loadFile = async () => {
    const fileContent = await window.api.invoke('file:read', filePath)
    setContent(fileContent)
    editor?.commands.setContent(fileContent)
  }
  
  const handleContentChange = debounce((markdown: string) => {
    // 触发自动保存
    window.api.invoke('file:write', filePath, markdown)
  }, 1000)
  
  return (
    <div className="editor-container">
      <EditorToolbar editor={editor} />
      {mode === 'wysiwyg' ? (
        <EditorContent editor={editor} />
      ) : (
        <textarea value={content} onChange={handleSourceChange} />
      )}
    </div>
  )
}
```

**支持的格式：**
- 标题（H1-H6）
- 粗体、斜体、删除线
- 有序列表、无序列表、任务列表
- 引用块
- 代码块（带语法高亮）
- 链接、图片
- 表格（基础版）

#### 依赖关系

- 前置依赖：需求 2.1（文件树）、需求 2.2（文件操作）
- 被依赖项：AI 文档侧边栏

#### 优先级

P0 - 必须完成

---

### 需求 2.4 - 多 Tab 文件编辑

**用户故事：** 作为用户，我想要同时打开多个文件，以便在不同文档间快速切换。

#### 验收标准

1. When user opens file, the system shall create new tab if file not already open
2. When user clicks tab, the system shall switch to corresponding file
3. When user closes tab, the system shall prompt to save if file has unsaved changes
4. When user closes tab with unsaved changes and chooses "Don't Save", the system shall discard changes
5. When user drags tab, the system shall reorder tabs
6. When user middle-clicks tab, the system shall close tab

#### 技术规格

**Tab 管理：**
```typescript
// src/renderer/store/tabs.ts
interface Tab {
  id: string
  filePath: string
  filename: string
  isDirty: boolean
  content: string
}

interface TabsState {
  tabs: Tab[]
  activeTabId: string | null
  openTab: (filePath: string) => void
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  updateTabContent: (tabId: string, content: string) => void
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  
  openTab: (filePath) => {
    const existing = get().tabs.find(t => t.filePath === filePath)
    if (existing) {
      set({ activeTabId: existing.id })
    } else {
      const newTab: Tab = {
        id: nanoid(),
        filePath,
        filename: path.basename(filePath),
        isDirty: false,
        content: ''
      }
      set(state => ({
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id
      }))
    }
  },
  
  closeTab: (tabId) => {
    const tab = get().tabs.find(t => t.id === tabId)
    if (tab?.isDirty) {
      // 显示保存确认对话框
      showSaveDialog(tab)
    } else {
      set(state => ({
        tabs: state.tabs.filter(t => t.id !== tabId)
      }))
    }
  }
}))
```

#### 依赖关系

- 前置依赖：需求 2.3（编辑器）
- 被依赖项：无

#### 优先级

P0 - 必须完成

---

### 需求 2.5 - 文件导入

**用户故事：** 作为用户，我想要导入现有文件，以便将我的文档迁移到 Sibylla。

#### 功能描述

支持拖拽导入文件和文件夹，自动转换非 Markdown 格式。

#### 验收标准

1. When user drags files into window, the system shall show drop zone overlay
2. When user drops Markdown files, the system shall copy files to workspace
3. When user drops Word files, the system shall convert to Markdown and import
4. When user drops PDF files, the system shall extract text and convert to Markdown
5. When user drops folder, the system shall recursively import all supported files
6. When import completes, the system shall show summary: X files imported, Y files converted

#### 技术规格

**导入处理：**
```typescript
// src/main/services/import-manager.ts
export class ImportManager {
  async importFiles(files: string[]): Promise<ImportResult> {
    const results: ImportResult = {
      imported: [],
      converted: [],
      failed: []
    }
    
    for (const file of files) {
      try {
        const ext = path.extname(file)
        
        if (ext === '.md') {
          await this.copyFile(file)
          results.imported.push(file)
        } else if (ext === '.docx') {
          const markdown = await this.convertWordToMarkdown(file)
          await this.saveMarkdown(file, markdown)
          results.converted.push(file)
        } else if (ext === '.pdf') {
          const markdown = await this.convertPdfToMarkdown(file)
          await this.saveMarkdown(file, markdown)
          results.converted.push(file)
        }
      } catch (error) {
        results.failed.push({ file, error: error.message })
      }
    }
    
    return results
  }
  
  private async convertWordToMarkdown(file: string): Promise<string> {
    // 使用 mammoth 或 pandoc 转换
    const result = await mammoth.convertToMarkdown({ path: file })
    return result.value
  }
  
  private async convertPdfToMarkdown(file: string): Promise<string> {
    // 使用 pdf-parse 提取文本
    const dataBuffer = await fs.readFile(file)
    const data = await pdfParse(dataBuffer)
    return data.text
  }
}
```

#### 依赖关系

- 前置依赖：需求 2.1（文件树）、需求 2.2（文件操作）
- 被依赖项：无

#### 优先级

P1 - 应该完成

---

### 需求 2.6 - CSV 查看器

**用户故事：** 作为用户，我想要查看 CSV 文件，以便浏览表格数据。

#### 功能描述

提供基础的 CSV 表格查看功能，支持排序和筛选。

#### 验收标准

1. When user opens CSV file, the system shall render as table
2. When user clicks column header, the system shall sort by that column
3. When table has > 1000 rows, the system shall use virtual scrolling
4. When user edits cell, the system shall update CSV file
5. When CSV parsing fails, the system shall show error and fallback to text view

#### 技术规格

**CSV 查看器组件：**
```typescript
// src/renderer/components/CsvViewer.tsx
import { useVirtualizer } from '@tanstack/react-virtual'
import Papa from 'papaparse'

export function CsvViewer({ filePath }: { filePath: string }) {
  const [data, setData] = useState<string[][]>([])
  const [headers, setHeaders] = useState<string[]>([])
  
  useEffect(() => {
    loadCsv()
  }, [filePath])
  
  const loadCsv = async () => {
    const content = await window.api.invoke('file:read', filePath)
    const parsed = Papa.parse(content, { header: false })
    setHeaders(parsed.data[0] as string[])
    setData(parsed.data.slice(1) as string[][])
  }
  
  return (
    <div className="csv-viewer">
      <table>
        <thead>
          <tr>
            {headers.map((header, i) => (
              <th key={i}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

#### 依赖关系

- 前置依赖：需求 2.1（文件树）
- 被依赖项：无

#### 优先级

P2 - 可以延后

---

## 三、非功能需求

### 3.1 性能要求

- 文件树加载 < 500ms（1000 个文件以内）
- 编辑器打开文件 < 200ms（1MB 以内）
- 编辑器输入延迟 < 16ms（60fps）
- Tab 切换 < 100ms
- 文件导入 < 5 秒（10 个文件）

### 3.2 安全要求

- 文件路径验证防止目录遍历
- 文件大小限制（单文件 < 10MB）
- 导入文件类型白名单验证

### 3.3 可用性要求

- 编辑器支持常用快捷键（Ctrl+B 粗体、Ctrl+S 保存等）
- 文件树支持键盘导航（上下箭头、Enter 打开）
- 错误提示清晰友好
- 长时间操作有进度反馈

---

## 四、技术约束

### 4.1 架构约束

- 编辑器必须支持 Markdown 双向转换
- 文件操作必须通过 IPC，渲染进程不直接访问文件系统
- 所有文件写入必须触发 Git 操作

### 4.2 技术选型

- 编辑器：Tiptap v2（基于 ProseMirror）
- Markdown 解析：tiptap-markdown
- CSV 解析：papaparse
- Word 转换：mammoth
- PDF 解析：pdf-parse

### 4.3 兼容性要求

- 支持标准 Markdown 语法（CommonMark）
- 支持 GitHub Flavored Markdown（GFM）扩展
- CSV 支持 UTF-8 编码

---

## 五、验收检查清单

### 5.1 功能完整性

- [ ] 文件树正常展示和交互
- [ ] 文件 CRUD 操作正常
- [ ] WYSIWYG 编辑器正常工作
- [ ] Markdown 双向转换正确
- [ ] 多 Tab 编辑正常
- [ ] 文件导入功能可用
- [ ] CSV 查看器正常显示

### 5.2 测试覆盖

- [ ] 文件树组件有单元测试
- [ ] 编辑器 Markdown 转换有测试
- [ ] 文件导入转换有测试
- [ ] CSV 解析有测试

### 5.3 文档完备

- [ ] 编辑器快捷键文档
- [ ] 支持的 Markdown 语法文档
- [ ] 文件导入格式支持文档

### 5.4 性能达标

- [ ] 文件树加载 < 500ms
- [ ] 编辑器打开 < 200ms
- [ ] 输入延迟 < 16ms
- [ ] Tab 切换 < 100ms

---

## 六、参考资料

- [Tiptap 文档](https://tiptap.dev/)
- [CommonMark 规范](https://commonmark.org/)
- [`architecture.md`](../../design/architecture.md) - 系统架构
- [`ui-ux-design.md`](../../design/ui-ux-design.md) - UI/UX 设计
