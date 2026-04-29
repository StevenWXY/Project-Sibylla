# PHASE1-TASK001: 文件树浏览器与文件操作 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task001_file-tree-browser.md](../specs/tasks/phase1/phase1-task001_file-tree-browser.md)
> 创建日期：2026-04-15
> 最后更新：2026-04-15

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK001 |
| **任务标题** | 文件树浏览器与文件操作 |
| **优先级** | P0 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **前置依赖** | ✅ Phase0 FileManager、✅ Phase0 IPC、✅ Phase0 WorkspaceManager |

### 目标

在已有的 `FileTree.tsx` 组件体系基础上，对照任务规格文档完成差距分析与功能补全，确保文件树浏览器满足需求 2.1（文件树浏览器）和需求 2.2（文件 CRUD 操作）的全部验收标准。

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 路径 | 关键约束 |
|------|------|---------|
| 项目宪法 | `CLAUDE.md` | TypeScript 严格模式禁止 any；文件即真相；Git 不可见；注释英文/commit 中文 |
| 系统架构 | `specs/design/architecture.md` | 渲染进程禁止直接访问文件系统；IPC 通信严格隔离 |
| UI/UX 规范 | `specs/design/ui-ux-design.md` | 左栏 220px 可折叠；品牌色 Indigo-500；>2s 操作需进度反馈 |
| 数据模型与 API | `specs/design/data-and-api.md` | IPC 通道定义；`FileInfo` 类型；`IPCResponse` 包装 |
| 任务规格 | `specs/tasks/phase1/phase1-task001_file-tree-browser.md` | 9 个子任务、13 条功能验收标准、4 类测试标准 |

### 2.2 需求文档依赖

| 需求 | 来源 |
|------|------|
| 需求 2.1 — 文件树浏览器 | `specs/requirements/phase1/sprint1-editor-filesystem.md` |
| 需求 2.2 — 文件 CRUD 操作 | `specs/requirements/phase1/sprint1-editor-filesystem.md` |

### 2.3 Skill 依赖

| Skill | 路径 | 使用场景 |
|-------|------|---------|
| zustand-state-management | `.kilocode/skills/phase1/zustand-state-management/SKILL.md` | fileTreeStore 扩展；selector 优化；中间件选型 |
| vercel-react-best-practices | `.kilocode/skills/common/vercel-react-best-practices/SKILL.md` | TreeNode memo 优化；flattenVisibleNodes 缓存；re-render 控制 |
| typescript-strict-mode | `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` | 严格类型守卫；泛型约束 |
| electron-ipc-patterns | `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` | IPC 调用封装；错误处理模式 |

### 2.4 前置代码依赖

| 模块 | 路径 | 状态 | 说明 |
|------|------|------|------|
| FileManager | `sibylla-desktop/src/main/services/file-manager.ts` | ✅ 已完成 | 文件读写、原子写入、路径验证 |
| FileHandler IPC | `sibylla-desktop/src/main/ipc/handlers/file.handler.ts` | ✅ 已完成 | `file:list/write/delete/move/createDir/deleteDir` |
| Preload API | `sibylla-desktop/src/preload/index.ts` | ✅ 已完成 | `window.electronAPI.file.*` 全部暴露 |
| 共享类型 | `sibylla-desktop/src/shared/types.ts` | ✅ 已完成 | `FileInfo`、`IPCResponse`、`ListFilesOptions` |
| WorkspaceManager | `sibylla-desktop/src/main/services/workspace/` | ✅ 已完成 | Workspace 打开/关闭/获取当前 |

### 2.5 被依赖任务

| 任务 | 依赖方式 |
|------|---------|
| PHASE1-TASK002（WYSIWYG 编辑器） | 文件树点击事件触发文件加载 |
| PHASE1-TASK003（多 Tab 系统） | 文件树点击事件创建新 Tab |
| PHASE1-TASK004（文件导入） | 导入完成后刷新文件树 |

---

## 三、现有代码盘点与差距分析

> **关键发现：** 任务规格中列出的全部交付物文件均已存在于代码库中，且功能覆盖度较高。本任务的核心工作是 **差距分析 + 功能补全 + 质量加固**，而非从零构建。

### 3.1 已有文件清单与功能覆盖

| 文件 | 路径 | 行数 | 功能覆盖 |
|------|------|------|---------|
| `FileTree.tsx` | `src/renderer/components/layout/FileTree.tsx` | 578 | ✅ 展开折叠、选中态、键盘导航（↑↓←→ Enter Delete F2 Cmd+N）、右键菜单、新建文件/文件夹、重命名、删除确认对话框、拖拽移动、循环检测、状态指示器 |
| `TreeNode.tsx` | `src/renderer/components/layout/TreeNode.tsx` | 252 | ✅ memo 递归渲染、缩进、展开/折叠 chevron、文件图标、内联重命名、内联创建、拖拽事件 |
| `TreeContextMenu.tsx` | `src/renderer/components/layout/TreeContextMenu.tsx` | 150 | ✅ 右键菜单定位、重命名/复制路径/删除、文件夹新建子项、Escape/click 外部关闭 |
| `InlineRenameInput.tsx` | `src/renderer/components/layout/InlineRenameInput.tsx` | 58 | ✅ 自动聚焦、选中文件名不含扩展名、Enter 确认/Escape 取消 |
| `file-tree.utils.ts` | `src/renderer/components/layout/file-tree.utils.ts` | 173 | ✅ buildTreeFromFiles、sortTreeNodes（文件夹在前+中文排序）、flattenVisibleNodes、validateFilename、isCircularDrop、countFolderEntries |
| `fileTreeStore.ts` | `src/renderer/store/fileTreeStore.ts` | 34 | ⚠️ 仅基础状态存取（tree/selectedPath/renamingPath/isLoading/error），缺少 toggleExpand/refreshSubtree 等语义化 action |
| `useFileTree.ts` | `src/renderer/hooks/useFileTree.ts` | 64 | ⚠️ 仅封装 loadTree（全量递归加载），缺少懒加载、子树刷新 |
| `WorkspaceStudioPage.tsx` | `src/renderer/pages/WorkspaceStudioPage.tsx` | 1362 | ✅ 集成层：文件树加载/刷新、CRUD 操作调用 IPC、自动保存、文件监听、搜索/任务/通知面板 |

### 3.2 验收标准差距矩阵

将任务规格 13 条功能验收标准逐条与现有实现比对：

| # | 验收标准 | 现状 | 差距 | 改进措施 |
|---|---------|------|------|---------|
| 1 | 打开 workspace 后文件树 500ms 内加载 | ✅ 已实现 `refreshTree()` | 当前使用 `recursive: true` 全量加载，大目录可能超限 | Step 2：懒加载优化 |
| 2 | 点击文件夹展开/折叠 | ✅ 已实现 `toggleExpand` | 无 | — |
| 3 | 点击文件在编辑器中打开 | ✅ 已实现 `onSelect → openFile` | 无 | — |
| 4 | 右键菜单：重命名/删除/复制路径 | ✅ 已实现 | 无 | — |
| 5 | 拖拽文件到文件夹移动 | ✅ 已实现 HTML5 拖拽 | 无拖拽视觉半透明反馈 | Step 5：拖拽视觉增强 |
| 6 | 编辑中文件显示圆点 | ✅ `isOpen` 绿色圆点 | 数据来源为 `openPaths` prop，由 WorkspaceStudioPage 传入 | — |
| 7 | 未保存更改显示星号 | ✅ `isDirty` 琥珀色星号 | 数据来源为 `dirtyPaths` prop | — |
| 8 | 新建文件并打开 | ✅ `createFileAtPath → refreshTree → openFile` | 无 | — |
| 9 | 新建文件夹 | ✅ `createFolderAtPath → refreshTree` | 无 | — |
| 10 | 重命名校验 | ✅ `validateFilename` | 无 | — |
| 11 | 删除前确认对话框 | ✅ Modal 确认 | 无 | — |
| 12 | 非空文件夹警告 | ✅ `countFolderEntries` 显示子项数 | 无 | — |
| 13 | 操作失败显示错误并回滚 | ⚠️ 显示错误消息 | 仅显示错误，无乐观更新回滚 | Step 6：乐观更新 |
| — | 暗色模式正确显示 | ✅ 使用 dark token（`bg-sys-black`） | 未验证亮色模式兼容性 | Step 7：亮暗色验证 |
| — | 文件名过长 tooltip | ⚠ `title={node.path}` 显示路径 | 应显示文件名 tooltip | Step 4：tooltip 修正 |
| — | 键盘导航完整 | ✅ ↑↓←→ Enter Delete F2 Cmd+N | 无 | — |

### 3.3 关键差距总结

基于差距分析，需补全的功能点：

1. **fileTreeStore 增强** — 从纯数据容器升级为语义化状态管理（toggleExpand、refreshSubtree、乐观更新）
2. **懒加载机制** — 当前全量 `recursive: true` 加载，需支持按文件夹展开时按需加载子节点
3. **拖拽视觉反馈** — 拖拽时半透明副本、放置目标高亮
4. **文件名 tooltip** — 文件名过长时 hover 显示完整文件名（非路径）
5. **乐观更新与回滚** — CRUD 操作先更新 UI，失败时回滚
6. **亮色模式兼容** — 当前样式偏向暗色 token，需验证并补全亮色适配
7. **测试覆盖** — 当前无测试文件，需达到 ≥80% 覆盖率

---

## 四、架构设计

### 4.1 目标文件结构

```
src/renderer/
├── components/layout/
│   ├── FileTree.tsx              # [扩展] 主组件 — 接入 fileTreeStore
│   ├── TreeNode.tsx              # [扩展] 拖拽视觉反馈、亮色模式
│   ├── TreeContextMenu.tsx       # [扩展] 亮色模式适配
│   ├── InlineRenameInput.tsx     # [保持] 无需修改
│   └── file-tree.utils.ts       # [扩展] 懒加载工具函数
├── store/
│   └── fileTreeStore.ts          # [重写] 语义化 Zustand store
├── hooks/
│   └── useFileTree.ts            # [重写] 懒加载 + 子树刷新
└── pages/
    └── WorkspaceStudioPage.tsx   # [调整] 接入增强后的 store/hook
```

### 4.2 数据模型

#### FileTreeNode（保持现有定义，补充 `isLoaded` 字段）

```typescript
// file-tree.utils.ts — 扩展现有接口
interface FileTreeNode {
  id: string
  name: string
  type: 'file' | 'folder'
  children?: FileTreeNode[]
  path: string
  depth?: number
  isLoaded?: boolean  // [新增] 标记文件夹子节点是否已加载（懒加载用）
}
```

#### FileTreeState（重写 fileTreeStore.ts）

```typescript
// fileTreeStore.ts — Zustand store 完整接口
interface FileTreeState {
  // ---- State ----
  tree: FileTreeNode[]
  expandedIds: Set<string>
  selectedPath: string | null
  renamingPath: string | null
  isLoading: boolean
  error: string | null

  // ---- Actions: 数据加载 ----
  loadTree: () => Promise<void>
  refreshSubtree: (folderPath: string) => Promise<void>
  loadFolderChildren: (folderPath: string) => Promise<void>

  // ---- Actions: UI 交互 ----
  toggleExpand: (path: string) => void
  selectNode: (path: string | null) => void
  startRename: (path: string) => void
  cancelRename: () => void

  // ---- Actions: CRUD（含乐观更新） ----
  createFile: (targetPath: string) => Promise<void>
  createFolder: (targetPath: string) => Promise<void>
  renameNode: (sourcePath: string, targetPath: string) => Promise<void>
  deleteNode: (node: FileTreeNode) => Promise<void>
  moveNode: (sourcePath: string, targetFolderPath: string) => Promise<void>

  // ---- Actions: 内部辅助 ----
  setError: (error: string | null) => void
  reset: () => void
}
```

### 4.3 IPC 调用映射

| Store Action | IPC 通道 | 预加载方法 | 说明 |
|-------------|---------|-----------|------|
| `loadTree` | `file:list` | `file.list('', { recursive: true })` | 初始全量加载 |
| `loadFolderChildren` | `file:list` | `file.list(path, { recursive: false })` | 懒加载子节点 |
| `createFile` | `file:write` | `file.write(path, content, { atomic: true, createDirs: true })` | 原子写入 |
| `createFolder` | `dir:create` | `file.createDir(path, true)` | 递归创建 |
| `renameNode` | `file:move` | `file.move(oldPath, newPath)` | 重命名 = 移动 |
| `deleteNode` | `file:delete` / `dir:delete` | `file.delete(path)` / `file.deleteDir(path, true)` | 按类型调用 |
| `moveNode` | `file:move` | `file.move(src, dest)` | 拖拽移动 |

> **注意：** 任务规格提到需新增 `file:rename` IPC 通道，但现有 `file:move` 已可满足重命名语义（重命名 = 同目录移动），无需新增通道。

---

## 五、实施步骤（7 步渐进式交付）

### Step 1：评估现有代码并扩展 fileTreeStore [预估 3h]

**目标：** 将 fileTreeStore 从纯数据容器升级为语义化状态管理中心。

**操作：**

1. **扩展 `file-tree.utils.ts`**
   - 为 `FileTreeNode` 接口添加 `isLoaded?: boolean` 字段
   - 新增 `expandNodeInTree(nodes, path, children)` 辅助函数：在树中找到目标文件夹节点，替换其 children 并设置 `isLoaded: true`
   - 新增 `removeNodeFromTree(nodes, path)` 辅助函数：删除树中指定路径的节点
   - 新增 `insertNodeToTree(nodes, parentPath, newNode)` 辅助函数：在指定父文件夹下插入新节点
   - 新增 `renameNodeInTree(nodes, oldPath, newPath, newName)` 辅助函数：更新树中节点的路径和名称

2. **重写 `fileTreeStore.ts`**
   - 使用 Zustand `create` 定义完整的 `FileTreeState` 接口
   - 实现 `expandedIds: Set<string>` 替代现有组件内部 state，统一管理展开状态
   - 实现 `toggleExpand(path)` — Set 的 add/delete 操作
   - 实现 `selectNode(path)` — 设置 selectedPath
   - 实现 `startRename(path)` / `cancelRename()` — 重命名状态管理
   - 实现 `setError(error)` / `reset()` — 错误与重置

3. **验证**
   - 现有组件暂不修改，确保 store 编译通过
   - 单元测试：store 的 action 正确更新状态

**交付物：**
- [x] `file-tree.utils.ts` 扩展（5 个新辅助函数）
- [x] `fileTreeStore.ts` 重写（语义化 actions）

---

### Step 2：实现懒加载机制 [预估 3h]

**目标：** 文件夹展开时按需加载子节点，替代全量递归加载。

**操作：**

1. **重写 `useFileTree.ts`**
   - 实现 `loadTree()` — 首次加载仅调用 `file.list('', { recursive: false })`，获取根级节点
   - 实现 `loadFolderChildren(folderPath)` — 展开文件夹时调用 `file.list(folderPath, { recursive: false })`，获取该文件夹直接子节点
   - 在 store 中更新对应文件夹节点的 children 和 `isLoaded = true`
   - 排序规则复用 `sortTreeNodes()`（文件夹在前 + `localeCompare('zh-CN')`）

2. **在 fileTreeStore 中集成懒加载**
   - `toggleExpand(path)` 检查节点 `isLoaded`：
     - 已加载 → 仅切换 expandedIds
     - 未加载 → 调用 `loadFolderChildren(path)`，成功后加入 expandedIds
   - `refreshSubtree(folderPath)` — 将目标文件夹的 `isLoaded` 重置为 false，重新加载子节点

3. **兼容策略**
   - 保留 WorkspaceStudioPage 的 `refreshTree` 全量刷新作为 fallback
   - 懒加载为默认行为，全量刷新用于文件监听触发的全局同步

**交付物：**
- [x] `useFileTree.ts` 重写（懒加载 + 子树刷新）
- [x] `fileTreeStore.ts` 补充（loadFolderChildren 集成）

**性能目标：** 文件夹展开 < 100ms

---

### Step 3：FileTree 接入增强 Store + TreeNode 优化 [预估 4h]

**目标：** FileTree 主组件从自管理 state 切换到 fileTreeStore，TreeNode 组件补充细节。

**操作：**

1. **重构 `FileTree.tsx`**
   - 移除组件内部的 `expandedIds`/`selectedId`/`contextMenu`/`renamingPath`/`pendingCreate`/`deleteTarget`/`actionError` 管理
   - 从 `fileTreeStore` 读取：`tree`、`expandedIds`、`selectedPath`、`renamingPath`、`isLoading`、`error`
   - 从 `appStore` 读取：`openFiles`、`currentFile` 计算 `openPaths`/`dirtyPaths`
   - 保留现有 props 接口作为可选 override（向后兼容 WorkspaceStudioPage 旧调用）
   - 错误消息 UI 从 store.error 渲染

2. **优化 `TreeNode.tsx`**
   - 拖拽开始时添加 `opacity: 0.5` 样式（`onDragStart` 时设置 CSS class）
   - 拖拽悬停文件夹时添加高亮边框样式（`onDragOver` 时切换 CSS class）
   - 文件名 `title` 属性改为显示文件名而非路径（`title={node.name}`）
   - 亮色模式：添加 `dark:` 前缀样式适配

3. **调整 `TreeContextMenu.tsx`**
   - 添加亮色模式 CSS 适配（`dark:` 变体）
   - 菜单项 hover 样式适配亮暗色

**交付物：**
- [x] `FileTree.tsx` 重构（接入 store）
- [x] `TreeNode.tsx` 优化（拖拽视觉 + tooltip + 亮色）
- [x] `TreeContextMenu.tsx` 优化（亮色适配）

---

### Step 4：WorkspaceStudioPage 适配 [预估 2h]

**目标：** 将 WorkspaceStudioPage 中的文件树状态管理迁移到 fileTreeStore，减少页面级 state。

**操作：**

1. **简化 WorkspaceStudioPage.tsx**
   - 移除页面级 `treeNodes`/`selectedNodeId`/`isTreeLoading`/`treeError` 等 state
   - 改为从 `fileTreeStore` 读取 `tree`/`selectedPath`/`isLoading`/`error`
   - CRUD 操作回调（`createFileAtPath`/`deleteNode`/`renamePath`/`moveToFolder`）迁移到 store actions 或保留在页面层调用 store
   - 文件监听 `onFileChange` 触发 `fileTreeStore.refreshSubtree()` 替代全量 `refreshTree()`

2. **保持页面职责不变**
   - WorkspaceStudioPage 继续管理：编辑器内容、AI 对话、搜索、任务、通知、自动保存
   - 文件树相关状态全部下沉到 fileTreeStore

**交付物：**
- [x] `WorkspaceStudioPage.tsx` 精简（文件树 state 迁移到 store）

---

### Step 5：拖拽视觉增强 [预估 2h]

**目标：** 完善拖拽交互体验，满足需求 2.1 AC5 的视觉要求。

**操作：**

1. **拖拽源视觉**
   - `onDragStart`：为被拖拽节点添加 `opacity-50` class
   - `onDragEnd`：移除 `opacity-50` class
   - 使用 `dataTransfer.setData('text/plain', node.path)` 传递路径（已实现）

2. **放置目标视觉**
   - `onDragOver` 文件夹时：添加 `ring-1 ring-indigo-500/50 bg-indigo-500/10` 高亮
   - `onDragLeave` 时：移除高亮
   - `onDrop` 时：移除高亮 + 执行移动

3. **自动展开定时器（已实现）**
   - 现有 `AUTO_EXPAND_DELAY_MS = 500` 悬停自动展开，保持不变

4. **循环检测（已实现）**
   - `isCircularDrop(sourcePath, targetPath)` 已在 `file-tree.utils.ts` 中实现

**交付物：**
- [x] `TreeNode.tsx` 拖拽视觉反馈

---

### Step 6：乐观更新与错误回滚 [预估 3h]

**目标：** CRUD 操作先更新 UI（乐观），失败时回滚到操作前状态。

**操作：**

1. **乐观更新模式设计**
   ```
   操作前：snapshot = 当前 tree 的深拷贝
   操作中：立即更新 tree（insertNode / removeNode / renameNode）
   IPC 调用：
     成功 → 清除 snapshot
     失败 → 回滚 tree = snapshot，显示错误消息
   ```

2. **在 fileTreeStore 中实现**
   - 每个写操作（createFile/createFolder/renameNode/deleteNode/moveNode）采用 try/catch 模式
   - `snapshot: FileTreeNode[] | null` 存储操作前快照
   - `rollback()` 方法恢复快照

3. **具体实现**
   - `createFile(targetPath)`：
     1. 在父文件夹下插入新节点（乐观）
     2. 调用 `file.write` IPC
     3. 失败 → 移除插入的节点，setError
   - `renameNode(oldPath, newPath)`：
     1. 在树中更新节点路径和名称（乐观）
     2. 调用 `file.move` IPC
     3. 失败 → 恢复原路径和名称
   - `deleteNode(node)`：
     1. 从树中移除节点（乐观）
     2. 调用 `file.delete` / `file.deleteDir` IPC
     3. 失败 → 重新插入节点
   - `moveNode(sourcePath, targetFolderPath)`：
     1. 从原位置移除，插入到目标文件夹（乐观）
     2. 调用 `file.move` IPC
     3. 失败 → 恢复原位置

**交付物：**
- [x] `fileTreeStore.ts` 乐观更新逻辑
- [x] `file-tree.utils.ts` 快照/回滚辅助函数

---

### Step 7：测试与质量验证 [预估 4h]

**目标：** 达到 ≥80% 测试覆盖率，验证亮暗色模式，通过 lint/typecheck。

**操作：**

1. **单元测试：`file-tree.utils.ts`**
   - `buildTreeFromFiles` — 扁平列表转嵌套树、文件夹在前排序、中文排序
   - `flattenVisibleNodes` — 仅返回展开节点、正确计算 depth
   - `validateFilename` — 空字符串、超长名、非法字符、点号、合法名
   - `isCircularDrop` — 子文件夹返回 true、同级返回 false、根目录边界
   - `sortTreeNodes` — 文件夹优先、字母序
   - `expandNodeInTree` / `removeNodeFromTree` / `insertNodeToTree` / `renameNodeInTree` — 乐观更新辅助
   - 边界条件：空列表、仅文件夹、深层嵌套（depth > 10）

2. **单元测试：`fileTreeStore.ts`**
   - `toggleExpand` — Set 的增删
   - `selectNode` — 路径更新
   - `startRename` / `cancelRename` — 状态切换
   - `loadTree` — mock IPC，验证 tree 更新
   - 乐观更新 + 回滚场景

3. **组件测试：`TreeNode.tsx`**
   - 渲染文件夹（展开/折叠态）
   - 渲染文件（选中/未选中态）
   - 编辑中圆点、未保存星号
   - 右键菜单触发
   - 拖拽事件

4. **组件测试：`TreeContextMenu.tsx`**
   - 文件节点：重命名/复制路径/删除
   - 文件夹节点：额外显示新建子项
   - Escape 关闭、点击外部关闭
   - 屏幕边界定位

5. **亮暗色模式验证**
   - 人工检查：文件树在亮色模式下所有状态正确显示
   - 选中态、hover 态、拖拽高亮、上下文菜单

6. **性能验证**
   - 文件树初始加载 < 500ms（1000 文件内）
   - 文件夹展开 < 100ms
   - 使用 React DevTools Profiler 确认无多余 re-render

**测试文件清单：**
- `src/renderer/components/layout/__tests__/file-tree.utils.test.ts`
- `src/renderer/store/__tests__/fileTreeStore.test.ts`
- `src/renderer/components/layout/__tests__/TreeNode.test.tsx`
- `src/renderer/components/layout/__tests__/TreeContextMenu.test.tsx`

---

## 六、风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| Store 重构导致 WorkspaceStudioPage 回归 | 高 | 中 | 保持现有 props 接口兼容，渐进迁移；每步验证页面正常运行 |
| 懒加载与文件监听冲突（监听触发全量刷新覆盖懒加载状态） | 中 | 中 | 文件监听事件改用 `refreshSubtree` 替代全量刷新；或合并两种加载模式 |
| HTML5 拖拽 macOS/Windows 行为不一致 | 中 | 中 | 核心拖拽功能已完成，视觉增强为渐进式，必要时引入 dnd-kit |
| 大量文件（>1000）时树渲染性能 | 中 | 低 | 懒加载已大幅减少初始节点数；虚拟化作为备选方案（不在本任务范围） |
| 乐观更新并发竞态 | 低 | 低 | 使用操作队列或禁用并发操作（操作期间 disable 其他操作按钮） |

---

## 七、时间线总览

| 步骤 | 内容 | 预估工时 | 累计 |
|------|------|---------|------|
| Step 1 | fileTreeStore 语义化 + utils 扩展 | 3h | 3h |
| Step 2 | 懒加载机制 | 3h | 6h |
| Step 3 | FileTree 接入 Store + TreeNode 优化 | 4h | 10h |
| Step 4 | WorkspaceStudioPage 适配 | 2h | 12h |
| Step 5 | 拖拽视觉增强 | 2h | 14h |
| Step 6 | 乐观更新与回滚 | 3h | 17h |
| Step 7 | 测试与质量验证 | 4h | 21h |

**总计预估：21 小时（约 3 个工作日）**

---

## 八、验收清单

### 功能完整性（对照需求 2.1 / 2.2）

- [ ] 打开 workspace 后，文件树在左侧栏 500ms 内完成加载
- [ ] 点击文件夹切换展开/折叠
- [ ] 点击文件在编辑器中打开
- [ ] 右键文件显示上下文菜单：重命名、删除、复制路径
- [ ] 拖拽文件到文件夹可移动，有视觉反馈
- [ ] 编辑中的文件显示绿色圆点
- [ ] 未保存更改的文件显示琥珀色星号
- [ ] 新建文件可创建并在编辑器中打开
- [ ] 新建文件夹可创建
- [ ] 重命名时校验文件名合法性
- [ ] 删除前弹出确认对话框
- [ ] 非空文件夹显示子项数量警告
- [ ] 操作失败显示错误消息并回滚

### 性能指标

- [ ] 文件树初始加载 < 500ms（1000 文件以内）
- [ ] 文件夹展开 < 100ms
- [ ] 拖拽操作帧率 ≥ 30fps

### 代码质量

- [ ] TypeScript strict mode 无错误
- [ ] ESLint 检查通过
- [ ] 单元测试覆盖率 ≥ 80%
- [ ] 亮色/暗色模式均正确显示

---

## 九、交付物清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `sibylla-desktop/src/renderer/components/layout/file-tree.utils.ts` | 扩展 | +5 辅助函数，FileTreeNode 增加 isLoaded |
| `sibylla-desktop/src/renderer/store/fileTreeStore.ts` | 重写 | 语义化 Zustand store + 乐观更新 |
| `sibylla-desktop/src/renderer/hooks/useFileTree.ts` | 重写 | 懒加载 + 子树刷新 |
| `sibylla-desktop/src/renderer/components/layout/FileTree.tsx` | 重构 | 接入 store，移除内部 state |
| `sibylla-desktop/src/renderer/components/layout/TreeNode.tsx` | 扩展 | 拖拽视觉、tooltip 修正、亮色适配 |
| `sibylla-desktop/src/renderer/components/layout/TreeContextMenu.tsx` | 扩展 | 亮色模式适配 |
| `sibylla-desktop/src/renderer/pages/WorkspaceStudioPage.tsx` | 调整 | 文件树 state 迁移到 store |
| `sibylla-desktop/src/renderer/components/layout/__tests__/file-tree.utils.test.ts` | 新增 | utils 单元测试 |
| `sibylla-desktop/src/renderer/store/__tests__/fileTreeStore.test.ts` | 新增 | store 单元测试 |
| `sibylla-desktop/src/renderer/components/layout/__tests__/TreeNode.test.tsx` | 新增 | TreeNode 组件测试 |
| `sibylla-desktop/src/renderer/components/layout/__tests__/TreeContextMenu.test.tsx` | 新增 | ContextMenu 组件测试 |

---

**创建时间：** 2026-04-15
**最后更新：** 2026-04-15
**更新记录：**
- 2026-04-15 — 创建实施计划，含 7 个步骤、差距分析、依赖矩阵
