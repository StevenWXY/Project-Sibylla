# 文件树浏览器与文件操作

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK001 |
| **任务标题** | 文件树浏览器与文件操作 |
| **所属阶段** | Phase 1 - MVP 核心功能（Sprint 1） |
| **优先级** | P0 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

在已有的 `FileTree.tsx` 基础上，实现完整的文件树浏览器组件，支持文件和文件夹的浏览、创建、重命名、删除、移动操作，以及状态指示和键盘导航。使用户能够在左侧栏中完成所有文件管理操作。

### 背景

Phase 0 已完成 `FileManager`（文件读写、路径验证、原子写入）、`FileHandler`（IPC 通道）和基础 `FileTree.tsx` 组件。本任务在此基础上扩展文件树的交互能力，覆盖需求文档中"需求 2.1 — 文件树浏览器"和"需求 2.2 — 文件 CRUD 操作"的全部验收标准。

文件树是用户与 Sibylla 交互的第一触点，直接决定产品的第一印象。

### 范围

**包含：**
- 文件树递归渲染（展开/折叠、文件类型图标、缩进层级）
- 文件树数据加载与缓存（通过 `file:list` IPC 通道）
- 右键上下文菜单（重命名、删除、复制路径）
- 新建文件/文件夹（内联编辑命名）
- 文件重命名（内联编辑 + 校验）
- 文件/文件夹删除（确认对话框）
- 拖拽移动文件到文件夹
- 编辑中状态指示（圆点）和未保存状态指示（星号）
- 键盘导航（上下箭头、Enter 打开、Delete 删除）

**不包含：**
- 文件搜索（Phase 1 Sprint 3）
- 文件内容编辑（TASK002）
- Tab 管理（TASK003）
- 文件导入（TASK004）

## 技术要求

### 技术栈

- **React 18+**：组件渲染
- **TailwindCSS**：样式
- **Zustand**：文件树状态管理
- **lucide-react**：文件/文件夹图标
- **已有 IPC 通道**：`file:list`、`file:write`、`file:delete`、`file:move`、`file:createDir`、`file:deleteDir`

### 架构设计

```
src/renderer/
├── components/
│   └── layout/
│       ├── FileTree.tsx           # 文件树主组件（扩展现有）
│       ├── TreeNode.tsx           # 树节点组件（新增）
│       ├── TreeContextMenu.tsx    # 右键菜单组件（新增）
│       └── InlineRenameInput.tsx  # 内联重命名输入框（新增）
├── store/
│   └── fileTreeStore.ts           # 文件树专用 Zustand store（新增）
└── hooks/
    └── useFileTree.ts             # 文件树操作 hook（新增）
```

**核心数据模型：**

```typescript
// src/renderer/store/fileTreeStore.ts

/** Represents a node in the file tree */
interface FileTreeNode {
  /** File or folder name */
  name: string
  /** Relative path from workspace root */
  path: string
  /** Node type */
  type: 'file' | 'folder'
  /** Child nodes (only for folders) */
  children?: FileTreeNode[]
  /** Whether folder is expanded */
  isExpanded?: boolean
  /** Nesting depth for indentation */
  depth: number
}

/** File tree state and actions */
interface FileTreeState {
  /** Root-level tree nodes */
  tree: FileTreeNode[]
  /** Currently selected node path */
  selectedPath: string | null
  /** Path being renamed (inline edit mode) */
  renamingPath: string | null
  /** Whether tree is loading */
  isLoading: boolean
  /** Error message if tree load failed */
  error: string | null

  /** Load file tree from workspace root */
  loadTree: () => Promise<void>
  /** Toggle folder expand/collapse */
  toggleExpand: (path: string) => void
  /** Select a tree node */
  selectNode: (path: string) => void
  /** Start inline rename for a node */
  startRename: (path: string) => void
  /** Cancel inline rename */
  cancelRename: () => void
  /** Refresh a specific subtree */
  refreshSubtree: (folderPath: string) => Promise<void>
}
```

### 实现细节

#### 子任务 1.1：FileTreeNode 数据模型与树构建算法

将 `file:list` 返回的扁平 `FileInfo[]` 列表转换为嵌套的 `FileTreeNode[]` 树结构。

```typescript
// src/renderer/hooks/useFileTree.ts

/**
 * Build nested tree from flat file list.
 * Folders are sorted before files, both alphabetically.
 */
function buildTree(files: FileInfo[], basePath: string, depth: number = 0): FileTreeNode[] {
  const nodes: FileTreeNode[] = files.map(file => ({
    name: file.name,
    path: file.path,
    type: file.isDirectory ? 'folder' : 'file',
    children: file.isDirectory ? [] : undefined,
    isExpanded: false,
    depth
  }))

  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-CN')
  })
}
```

- 排序规则：文件夹在前、文件在后，各自按名称字母序排列
- 支持中文文件名排序（`localeCompare` with `'zh-CN'`）
- 懒加载：仅在展开文件夹时加载其子节点

#### 子任务 1.2：FileTree 组件递归渲染

扩展现有 `FileTree.tsx`，使用 `TreeNode` 子组件递归渲染。

```typescript
// src/renderer/components/layout/TreeNode.tsx

interface TreeNodeProps {
  node: FileTreeNode
  onSelect: (path: string) => void
  onToggle: (path: string) => void
  onContextMenu: (e: React.MouseEvent, path: string) => void
  selectedPath: string | null
  editingFiles: Set<string>  // Files currently open in editor
  dirtyFiles: Set<string>    // Files with unsaved changes
}

export function TreeNode({ node, onSelect, onToggle, ... }: TreeNodeProps) {
  const isSelected = node.path === selectedPath
  const isEditing = editingFiles.has(node.path)
  const isDirty = dirtyFiles.has(node.path)

  return (
    <div>
      <div
        className={cn(
          'flex items-center px-2 py-1 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800',
          isSelected && 'bg-indigo-50 dark:bg-indigo-900/20'
        )}
        style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
        onClick={() => node.type === 'folder' ? onToggle(node.path) : onSelect(node.path)}
        onContextMenu={(e) => onContextMenu(e, node.path)}
      >
        {/* Expand/collapse chevron for folders */}
        {node.type === 'folder' && (
          <ChevronRight className={cn('w-4 h-4 transition-transform', node.isExpanded && 'rotate-90')} />
        )}
        {/* File/folder icon */}
        {node.type === 'folder' ? <Folder className="w-4 h-4 text-indigo-500" /> : <File className="w-4 h-4 text-gray-400" />}
        {/* File name */}
        <span className="ml-2 text-sm truncate">{node.name}</span>
        {/* Status indicators */}
        {isDirty && <span className="ml-1 text-amber-500">*</span>}
        {isEditing && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-green-500" />}
      </div>
      {/* Recursive children */}
      {node.type === 'folder' && node.isExpanded && node.children?.map(child => (
        <TreeNode key={child.path} node={child} {...props} />
      ))}
    </div>
  )
}
```

- 缩进量：每层 16px
- 展开/折叠动画：chevron 旋转 90°
- 文件夹图标：Indigo-500（品牌色）
- 选中态：Indigo-50 背景（亮色模式）/ Indigo-900/20（暗色模式）

#### 子任务 1.3：文件树与 IPC 集成

```typescript
// src/renderer/hooks/useFileTree.ts

/**
 * Load children for a folder node via IPC.
 * Uses file:list channel with recursive=false for lazy loading.
 */
async function loadFolderChildren(folderPath: string): Promise<FileTreeNode[]> {
  const result = await window.electronAPI.file.list(folderPath, { recursive: false })
  if (!result.success) {
    throw new Error(result.error?.message ?? 'Failed to load folder')
  }
  return buildTree(result.data, folderPath, getDepth(folderPath))
}
```

- 根目录加载：workspace 打开时自动调用 `file:list('/')`
- 子文件夹懒加载：展开文件夹时按需调用
- 错误处理：加载失败显示错误提示，允许重试

#### 子任务 1.4：右键上下文菜单

```typescript
// src/renderer/components/layout/TreeContextMenu.tsx

interface ContextMenuItem {
  label: string
  icon: React.ReactNode
  action: () => void
  danger?: boolean
  separator?: boolean
}

/**
 * Context menu for file tree nodes.
 * Positioned at mouse click coordinates, dismissed on outside click.
 */
export function TreeContextMenu({ position, node, onClose }: TreeContextMenuProps) {
  const menuItems: ContextMenuItem[] = [
    { label: '重命名', icon: <Pencil />, action: () => startRename(node.path) },
    { label: '复制路径', icon: <Copy />, action: () => copyPathToClipboard(node.path) },
    { separator: true },
    { label: '删除', icon: <Trash />, action: () => confirmDelete(node.path), danger: true },
  ]
  // ...
}
```

- 菜单项：重命名、复制路径、分隔线、删除（红色标记）
- 文件夹额外菜单项：新建文件、新建子文件夹
- 定位：鼠标右键坐标，超出屏幕边界时自动调整
- 关闭：点击外部区域或 Escape 键

#### 子任务 1.5：新建文件/文件夹

- 点击"新建文件"按钮或文件夹右键"新建文件"
- 在目标位置插入内联输入框，预填"未命名文件.md"
- 用户输入文件名后按 Enter 确认，调用 `file:write` 创建空文件
- 文件名校验：禁止 `/\:*?"<>|` 等非法字符，长度 ≤ 255
- 文件夹创建调用 `file:createDir`

```typescript
/**
 * Validate filename against platform restrictions.
 * @returns Error message if invalid, null if valid.
 */
function validateFilename(name: string): string | null {
  if (!name || name.trim().length === 0) return '文件名不能为空'
  if (name.length > 255) return '文件名不能超过 255 个字符'
  if (/[/\\:*?"<>|]/.test(name)) return '文件名包含非法字符'
  if (name.startsWith('.') && name.length === 1) return '文件名不能仅为点号'
  return null
}
```

#### 子任务 1.6：文件重命名与删除

**重命名：**
- 双击文件名或右键"重命名"进入内联编辑模式
- `InlineRenameInput` 组件：自动聚焦、选中文件名部分（不含扩展名）
- Enter 确认 → 调用 `file:move`（oldPath → newPath）
- Escape 取消

**删除：**
- 右键"删除"或键盘 Delete 键
- 弹出 `Modal` 确认对话框
- 文件夹删除额外警告"文件夹包含 N 个文件"
- 确认后调用 `file:delete` 或 `file:deleteDir`
- 删除失败显示错误消息并回滚文件树状态

#### 子任务 1.7：拖拽移动文件

- 使用 HTML5 原生拖拽 API（`draggable`、`onDragStart`、`onDragOver`、`onDrop`）
- 拖拽时显示半透明副本
- 拖拽悬停在文件夹上 500ms 自动展开该文件夹
- 放置后调用 `file:move` 移动文件
- 禁止将文件夹拖入自身子文件夹（循环检测）

```typescript
/**
 * Check if dropping target would create a circular reference.
 * @returns true if the drop is invalid (target is a descendant of source).
 */
function isCircularDrop(sourcePath: string, targetPath: string): boolean {
  return targetPath.startsWith(sourcePath + '/')
}
```

#### 子任务 1.8：状态指示器

- **编辑中圆点**：当文件在编辑器中打开时，文件名后显示绿色小圆点（`w-1.5 h-1.5 rounded-full bg-green-500`）
- **未保存星号**：当文件有未保存更改时，文件名后显示 `*` 号（`text-amber-500`）
- 数据来源：从 Tab store（TASK003）或 AppStore 的 `openFiles` / `dirtyFiles` 状态读取

#### 子任务 1.9：键盘导航

| 按键 | 行为 |
|------|------|
| `↑` / `↓` | 在可见节点间移动选中态 |
| `Enter` | 打开选中文件 / 展开选中文件夹 |
| `←` | 折叠选中文件夹 / 移动到父文件夹 |
| `→` | 展开选中文件夹 |
| `Delete` | 删除选中项（弹出确认） |
| `F2` | 重命名选中项 |
| `Cmd+N` | 新建文件 |

### 数据模型

复用 Phase 0 已定义的 `FileInfo` 类型（`src/shared/types.ts`）：

```typescript
interface FileInfo {
  name: string
  path: string
  isDirectory: boolean
  size: number
  modifiedTime: Date
  createdTime: Date
  extension?: string
}
```

### API 规范

本任务不涉及新增 REST API。全部通过已有 IPC 通道完成：

| IPC 通道 | 用途 | 来源 |
|---------|------|------|
| `file:list` | 加载文件列表 | Phase 0 已有 |
| `file:write` | 创建新文件 | Phase 0 已有 |
| `file:delete` | 删除文件 | Phase 0 已有 |
| `file:move` | 移动/重命名文件 | Phase 0 已有 |
| `file:createDir` | 创建文件夹 | Phase 0 已有 |
| `file:deleteDir` | 删除文件夹 | Phase 0 已有 |
| `file:getInfo` | 获取文件信息 | Phase 0 已有 |

需新增 IPC 通道：

| IPC 通道 | 用途 | 说明 |
|---------|------|------|
| `file:rename` | 文件重命名 | 语义化封装，底层调用 FileManager.moveFile()。如 `file:move` 已可满足重命名语义，可直接复用 |

## 验收标准

### 功能完整性

> 以下标准直接追溯自需求文档 2.1 和 2.2。

- [ ] 打开 workspace 后，文件树在左侧栏 500ms 内完成加载（需求 2.1 AC1）
- [ ] 点击文件夹可切换展开/折叠状态（需求 2.1 AC2）
- [ ] 点击文件可在编辑器中打开（需求 2.1 AC3）
- [ ] 右键文件显示上下文菜单：重命名、删除、复制路径（需求 2.1 AC4）
- [ ] 拖拽文件到文件夹可移动文件（需求 2.1 AC5）
- [ ] 编辑中的文件显示指示圆点（需求 2.1 AC6）
- [ ] 有未保存更改的文件显示星号（需求 2.1 AC7）
- [ ] 点击"新建文件"可创建新文件并在编辑器中打开（需求 2.2 AC1）
- [ ] 点击"新建文件夹"可创建文件夹（需求 2.2 AC2）
- [ ] 重命名文件时校验文件名合法性（需求 2.2 AC3）
- [ ] 删除文件前弹出确认对话框（需求 2.2 AC4）
- [ ] 删除非空文件夹时显示警告（需求 2.2 AC5）
- [ ] 文件操作失败显示错误消息并回滚（需求 2.2 AC6）

### 性能指标

- [ ] 文件树初始加载 < 500ms（1000 个文件以内）
- [ ] 文件夹展开 < 100ms
- [ ] 拖拽操作帧率 ≥ 30fps

### 用户体验

- [ ] 键盘导航完整支持（↑↓←→ Enter Delete F2）
- [ ] 暗色模式下所有交互状态正确显示
- [ ] 文件名过长时文字截断并显示 tooltip
- [ ] 错误提示使用友好的中文描述

### 代码质量

- [ ] TypeScript strict mode 无错误
- [ ] ESLint 检查通过，无警告
- [ ] 所有公共函数有 JSDoc 注释
- [ ] 代码审查通过

## 测试标准

### 单元测试

**测试覆盖率目标：** ≥ 80%

**关键测试用例：**

1. **树构建算法**
   - 输入：扁平 `FileInfo[]`
   - 预期：正确嵌套的 `FileTreeNode[]`，文件夹在前文件在后
   - 边界条件：空列表、仅文件夹、深层嵌套

2. **文件名校验**
   - 输入：各类合法/非法文件名
   - 预期：合法名返回 null，非法名返回错误描述
   - 边界条件：空字符串、255 字符、特殊字符、Unicode

3. **循环拖拽检测**
   - 输入：sourcePath、targetPath
   - 预期：自身或子文件夹返回 true
   - 边界条件：同级文件夹、根目录

4. **TreeNode 渲染**
   - 输入：不同类型的 FileTreeNode
   - 预期：正确渲染图标、缩进、展开状态
   - 边界条件：深层嵌套（depth > 10）

5. **上下文菜单**
   - 输入：右键事件坐标
   - 预期：菜单正确定位并显示
   - 边界条件：屏幕右下角

### 集成测试

1. 文件树加载 → 展开文件夹 → 点击文件 → 触发打开文件事件
2. 新建文件 → 输入文件名 → 确认 → 文件出现在文件树中
3. 重命名文件 → 文件树更新 → 已打开的 Tab 标题同步更新
4. 删除文件 → 确认 → 文件从文件树移除 → 对应 Tab 关闭

### 端到端测试

1. 完整文件管理流程：创建文件夹 → 创建文件 → 重命名 → 拖拽移动 → 删除

## 依赖关系

### 前置依赖

- [x] PHASE0-TASK006 — 本地文件系统管理（FileManager 实现）
- [x] PHASE0-TASK002 — IPC 框架（FileHandler 实现）
- [x] PHASE0-TASK008 — Workspace 管理器

### 被依赖任务

- PHASE1-TASK002（WYSIWYG 编辑器）— 需要文件树的文件点击事件来触发文件加载
- PHASE1-TASK003（多 Tab 系统）— 需要文件树的文件点击事件来创建新 Tab
- PHASE1-TASK004（文件导入）— 导入完成后需要刷新文件树

### 阻塞风险

- 现有 `FileTree.tsx` 如果结构与新设计差异过大，可能需要重写而非扩展

## 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| HTML5 拖拽在不同 OS 上行为不一致 | 中 | 中 | 做 macOS/Windows 双平台测试，必要时引入 dnd-kit |
| 大量文件时树渲染性能问题 | 中 | 低 | 使用懒加载（仅展开时加载子节点）+ 虚拟化备选方案 |
| 现有 FileTree.tsx 结构不兼容 | 低 | 中 | 评估后决定扩展还是重写 |

### 时间风险

拖拽功能和键盘导航的细节调试可能超出预期，建议在核心功能完成后再做这两项。

### 资源风险

无特殊资源依赖。

## 参考文档

- [`CLAUDE.md`](../../../CLAUDE.md) — 项目规范
- [`specs/design/architecture.md`](../../design/architecture.md) — 系统架构
- [`specs/design/ui-ux-design.md`](../../design/ui-ux-design.md) — UI/UX 设计规范
- [`specs/design/data-and-api.md`](../../design/data-and-api.md) — IPC 接口定义
- [`specs/requirements/phase1/sprint1-editor-filesystem.md`](../../requirements/phase1/sprint1-editor-filesystem.md) — 需求 2.1、2.2
- `src/renderer/components/layout/FileTree.tsx` — 现有文件树组件
- `src/main/services/file-manager.ts` — FileManager 服务
- `src/main/ipc/handlers/file.handler.ts` — 文件 IPC 处理器

## 实施计划

### 第 1 步：评估现有 FileTree.tsx 并设计 Store

- 阅读现有 `FileTree.tsx` 代码，评估扩展可行性
- 创建 `fileTreeStore.ts`（Zustand store）
- 定义 `FileTreeNode` 数据模型
- 实现 `buildTree()` 算法
- 预计耗时：3 小时

### 第 2 步：实现 TreeNode 递归渲染

- 创建 `TreeNode.tsx` 组件
- 实现展开/折叠、文件图标、缩进
- 集成 IPC 懒加载子节点
- 实现选中态样式
- 预计耗时：4 小时

### 第 3 步：实现右键菜单和文件操作

- 创建 `TreeContextMenu.tsx`
- 实现重命名（`InlineRenameInput.tsx`）
- 实现删除（确认对话框）
- 实现复制路径
- 预计耗时：4 小时

### 第 4 步：实现新建文件/文件夹

- 在文件树头部添加"新建文件""新建文件夹"按钮
- 在文件夹右键菜单添加"新建文件""新建子文件夹"
- 实现内联命名输入 + 文件名校验
- 调用 IPC 创建文件/文件夹
- 预计耗时：3 小时

### 第 5 步：实现拖拽移动

- 添加 HTML5 拖拽属性
- 实现拖拽视觉反馈
- 实现循环拖拽检测
- 调用 `file:move` IPC
- 预计耗时：4 小时

### 第 6 步：实现状态指示器和键盘导航

- 接入 openFiles / dirtyFiles 状态
- 实现编辑中圆点和未保存星号
- 实现键盘导航（↑↓←→ Enter Delete F2）
- 预计耗时：3 小时

### 第 7 步：测试与调试

- 编写单元测试（树构建、文件名校验、循环检测）
- 编写组件测试（TreeNode、ContextMenu）
- 暗色模式验证
- 性能验证（500ms 加载目标）
- 预计耗时：4 小时

## 完成标准

**本任务完成的标志：**

1. 文件树在左侧栏正确渲染 workspace 目录结构
2. 所有文件 CRUD 操作（创建、重命名、删除、移动）可正常执行
3. 右键菜单、拖拽、键盘导航全部可用
4. 状态指示器正确反映文件编辑状态
5. 单元测试覆盖率 ≥ 80%
6. 亮色/暗色模式均正常显示

**交付物：**

- [ ] `src/renderer/components/layout/FileTree.tsx`（扩展）
- [ ] `src/renderer/components/layout/TreeNode.tsx`（新增）
- [ ] `src/renderer/components/layout/TreeContextMenu.tsx`（新增）
- [ ] `src/renderer/components/layout/InlineRenameInput.tsx`（新增）
- [ ] `src/renderer/store/fileTreeStore.ts`（新增）
- [ ] `src/renderer/hooks/useFileTree.ts`（新增）
- [ ] 对应的测试文件

---

**创建时间：** 2026-03-31
**最后更新：** 2026-03-31
**更新记录：**
- 2026-03-31 — 创建任务文档，含 9 个子任务
