# PHASE1-TASK003: 多 Tab 编辑系统 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task003_multi-tab-system.md](../specs/tasks/phase1/phase1-task003_multi-tab-system.md)
> 创建日期：2026-04-16
> 最后更新：2026-04-16

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK003 |
| **任务标题** | 多 Tab 编辑系统 |
| **优先级** | P0 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **前置依赖** | ✅ Phase0 appStore、✅ Phase0 IPC、🔄 PHASE1-TASK001（可并行） |

### 目标

实现浏览器/VS Code 风格的多 Tab 编辑系统，替换现有 `appStore.ts` 中的 `openFiles` / `currentFile` 状态与 `StudioEditorPanel.tsx` 中的内联 Tab 栏。核心交付物：专用 `useTabStore`（Zustand）、TabBar 组件族、从 appStore 的渐进式迁移。

### 范围边界

**包含：**
- 专用 `useTabStore`（Zustand + devtools 中间件）
- TabBar / TabItem / TabContextMenu / CloseConfirmDialog 组件族
- 从 `appStore` 迁移 `openFiles`/`currentFile` 状态，标记 `@deprecated`
- Tab 操作：打开、关闭、切换、固定/取消固定、拖拽排序
- 关闭策略：未保存提示、关闭后激活邻近 Tab
- Tab 溢出处理（左右滚动箭头 + 溢出下拉菜单）
- Tab 与文件树/编辑器联动
- 键盘快捷键：Ctrl+W / Ctrl+Tab

**不包含：**
- Tab 分屏/拆分视图（后续迭代）
- Tab 持久化到磁盘（仅内存态）
- 拖拽 Tab 到新窗口

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 路径 | 关键约束 |
|------|------|---------|
| 项目宪法 | `CLAUDE.md` | TypeScript 严格模式禁止 any；文件即真相；Git 不可见；注释英文/commit 中文 |
| 系统架构 | `specs/design/architecture.md` | 渲染进程禁止直接访问文件系统；Zustand 为选型状态管理；TailwindCSS 样式方案 |
| UI/UX 规范 | `specs/design/ui-ux-design.md` | 中栏自适应支持多 Tab；品牌色 Indigo-500；>2s 操作需进度反馈 |
| 数据模型与 API | `specs/design/data-and-api.md` | `FileInfo` 类型；IPC 通道定义 |
| 任务规格 | `specs/tasks/phase1/phase1-task003_multi-tab-system.md` | 7 个实施步骤、13 条功能验收标准、6 类测试用例 |

### 2.2 Skill 依赖

| Skill | 使用场景 |
|-------|---------|
| `zustand-state-management` | tabStore 设计：create + devtools、selector 优化、不使用 persist |
| `vercel-react-best-practices` | TabItem memo 优化；useCallback 稳定引用；overflow Hook |
| `typescript-strict-mode` | TabInfo / TabState 严格类型；泛型约束；类型守卫 |
| `electron-ipc-patterns` | 文件删除事件监听 → Tab 自动关闭 |
| `frontend-design` / `ui-ux-pro-max` | Tab 栏 Notion 暗色风格 UI |

### 2.3 前置代码依赖

| 模块 | 路径 | 状态 | 说明 |
|------|------|------|------|
| appStore | `src/renderer/store/appStore.ts` | ✅ 已完成 | 包含 `currentFile`/`openFiles` 及相关 actions，需标记废弃 |
| editorStore | `src/renderer/store/editorStore.ts` | ✅ 已完成 | 脏标记状态，Tab 脏标记需与之联动 |
| fileTreeStore | `src/renderer/store/fileTreeStore.ts` | ✅ 已完成 | 文件树选中事件，需对接 `tabStore.openTab()` |
| StudioEditorPanel | `src/renderer/components/studio/StudioEditorPanel.tsx` | ✅ 已完成 | 内联 Tab 栏（L43-91），需替换为 TabBar 组件 |
| WorkspaceStudioPage | `src/renderer/pages/WorkspaceStudioPage.tsx` | ✅ 已完成 | 页面级状态编排，需迁移至 tabStore |
| WysiwygEditor | `src/renderer/components/editor/WysiwygEditor.tsx` | ✅ 已完成 | 编辑器组件，Tab 脏标记需读取 `onDirtyChange` 回调 |
| types (studio) | `src/renderer/components/studio/types.ts` | ✅ 已完成 | `OpenFileTab` 类型，需扩展或替换为 `TabInfo` |
| MainContent | `src/renderer/components/layout/MainContent.tsx` | ✅ 已完成 | flex-1 容器，TabBar 挂载于此顶部 |
| AppLayout | `src/renderer/components/layout/AppLayout.tsx` | ✅ 已完成 | Header + MainContent + Footer 布局 |
| Lucide React | node_modules | ✅ 已安装 | 图标库（FileText, X, Pin, ChevronLeft, ChevronRight 等） |
| cn 工具 | `src/renderer/utils/cn.ts` | ✅ 已安装 | className 合并工具 |

### 2.4 被依赖任务

| 任务 | 依赖方式 |
|------|---------|
| PHASE1-TASK002（WYSIWYG 编辑器） | 编辑器嵌入 Tab 面板，每个 Tab 对应一个编辑器实例 |
| Sprint 2 版本对比 | Tab 展示 diff 视图 |

### 2.5 npm 依赖

无需新增 npm 包。所有依赖（Zustand、Lucide React、TailwindCSS、React 18）已安装。

---

## 三、现有代码盘点与差距分析

> **关键发现：** 当前代码库已有一套内联 Tab 栏实现（位于 `StudioEditorPanel.tsx` L43-91），以及 `appStore.ts` 中的 `openFiles`/`currentFile` 状态管理。本任务的核心工作是 **抽取独立 tabStore → 替换内联 Tab 栏为组件族 → 渐进式迁移消费方**，非从零构建。

### 3.1 已有文件清单与功能覆盖

| 文件 | 路径 | 行数 | 功能覆盖 |
|------|------|------|---------|
| `appStore.ts` | `src/renderer/store/appStore.ts` | 317 | ✅ `currentFile`/`openFiles`/`setCurrentFile`/`addOpenFile`/`removeOpenFile`/`clearOpenFiles`；⚠️ 缺少脏标记、固定、排序 |
| `editorStore.ts` | `src/renderer/store/editorStore.ts` | 76 | ✅ 编辑器级脏标记 `isDirty`/`setDirty`；需与 tabStore 联动 |
| `fileTreeStore.ts` | `src/renderer/store/fileTreeStore.ts` | 240 | ✅ `selectNode()` 文件树选中；需对接 `tabStore.openTab()` |
| `StudioEditorPanel.tsx` | `src/renderer/components/studio/StudioEditorPanel.tsx` | 163 | ✅ 内联 Tab 栏渲染（L43-91）；⚠️ 无拖拽、无右键菜单、无溢出处理、无固定 Tab |
| `WorkspaceStudioPage.tsx` | `src/renderer/pages/WorkspaceStudioPage.tsx` | 1350 | ✅ `openFileTabs`/`dirtyFilePaths` 计算、文件打开/关闭管线；⚠️ 全部硬编码在页面组件中 |
| `types.ts` (studio) | `src/renderer/components/studio/types.ts` | 50 | ✅ `OpenFileTab` 类型（path + name）；⚠️ 缺少 isDirty/isPinned/extension/lastAccessedAt |
| `Header.tsx` | `src/renderer/components/layout/Header.tsx` | 117 | ✅ 显示 `currentFile.name`；迁移后改为读取 `tabStore.activeTab` |
| `FileTree.tsx` | `src/renderer/components/layout/FileTree.tsx` | 650 | ✅ `onSelect` 回调；需对接 `tabStore.openTab()` |
| `WysiwygEditor.tsx` | `src/renderer/components/editor/WysiwygEditor.tsx` | — | ✅ `onDirtyChange` 回调；需驱动 `tabStore.setDirty()` |

### 3.2 不存在的文件（需新建）

| 文件 | 路径 | 说明 |
|------|------|------|
| `tabStore.ts` | `src/renderer/store/tabStore.ts` | 专用 Tab 状态管理 store |
| `TabBar.tsx` | `src/renderer/components/layout/TabBar.tsx` | Tab 栏容器组件 |
| `TabItem.tsx` | `src/renderer/components/layout/TabItem.tsx` | 单个 Tab 组件 |
| `TabContextMenu.tsx` | `src/renderer/components/layout/TabContextMenu.tsx` | 右键菜单组件 |
| `CloseConfirmDialog.tsx` | `src/renderer/components/layout/CloseConfirmDialog.tsx` | 未保存确认对话框 |
| `tabStore.test.ts` | `src/renderer/__tests__/tabStore.test.ts` | Store 单元测试 |
| `TabBar.test.tsx` | `src/renderer/__tests__/TabBar.test.tsx` | 组件渲染测试 |

### 3.3 现有内联 Tab 栏功能差距

`StudioEditorPanel.tsx` L43-91 的内联实现与任务规格对比：

| 能力 | 现有 | 规格要求 | 差距 |
|------|------|---------|------|
| 基础 Tab 渲染 | ✅ 有 | ✅ | — |
| 点击切换 | ✅ 有 | ✅ | — |
| 关闭按钮 | ✅ 有 | ✅ | — |
| 脏标记圆点 | ✅ 有 | ✅ | — |
| 中键关闭 | ❌ 无 | ✅ 需要 | **需新增** |
| 固定 Tab | ❌ 无 | ✅ 需要 | **需新增** |
| 拖拽排序 | ❌ 无 | ✅ 需要 | **需新增** |
| 右键菜单 | ❌ 无 | ✅ 需要 | **需新增** |
| 溢出滚动 | ❌ 无 | ✅ 需要 | **需新增** |
| 关闭策略（激活邻居） | ❌ 无 | ✅ 需要 | **需新增** |
| 未保存确认对话框 | ❌ 无 | ✅ 需要 | **需新增** |
| 键盘快捷键 | ❌ 无 | ✅ 需要 | **需新增** |
| 独立 store | ❌ 无（页面状态） | ✅ 需要 | **需新增** |

### 3.4 迁移影响分析

| 消费方 | 当前用法 | 迁移后用法 | 风险 |
|--------|---------|-----------|------|
| `WorkspaceStudioPage` L258-262 | `useAppStore(selectCurrentFile/selectOpenFiles)` | `useTabStore` selectors | 中 — 页面组件 1350 行，需小心拆分 |
| `WorkspaceStudioPage` L330-345 | 手动计算 `openFileTabs` | `tabStore.tabs` 直接使用 | 低 |
| `WorkspaceStudioPage` L323-328 | 手动计算 `dirtyFilePaths` | `tabStore.dirtyTabs()` | 低 |
| `StudioEditorPanel` props | `openFileTabs`/`dirtyFilePaths`/`onOpenTab`/`onCloseTab` | `TabBar` 组件直接消费 tabStore | 中 — props 接口变更 |
| `Header.tsx` L28 | `useAppStore(state => state.currentFile)` | `useTabStore` 读取 activeTab | 低 |
| `appStore.ts` L48-54/200-240 | `currentFile`/`openFiles` 及 actions | 标记 `@deprecated`，保留实现 | 低 — 不破坏现有功能 |

---

## 四、类型系统设计

> 类型定义集中放置于 `tabStore.ts` 顶部，与任务规格 `TabInfo` / `TabState` 对齐，严格遵循 TypeScript strict mode。

### 4.1 核心类型

```typescript
// src/renderer/store/tabStore.ts

export interface TabInfo {
  id: string
  filePath: string
  fileName: string
  extension: string
  isDirty: boolean
  isPinned: boolean
  lastAccessedAt: number
}
```

**设计决策：** `id` 使用文件路径（与 `FileTreeNode.path` 一致，天然唯一）；`extension` 独立字段（避免每次从 fileName 解析）；`lastAccessedAt` 支持 LRU 排序；不复用 `appStore.FileInfo`（缺少 isDirty/isPinned/extension）。

### 4.2 Store 接口

```typescript
export interface TabState {
  tabs: TabInfo[]
  activeTabId: string | null

  openTab: (filePath: string, fileName: string, extension?: string) => void
  closeTab: (tabId: string, force?: boolean) => boolean
  switchTab: (tabId: string) => void
  setDirty: (tabId: string, isDirty: boolean) => void
  pinTab: (tabId: string) => void
  unpinTab: (tabId: string) => void
  reorderTabs: (fromIndex: number, toIndex: number) => void
  closeOtherTabs: (keepTabId: string) => boolean
  closeTabsToRight: (tabId: string) => boolean
  closeAllTabs: (force?: boolean) => boolean
  getTab: (tabId: string) => TabInfo | undefined
  markTabDeleted: (filePath: string) => void

  activeTab: () => TabInfo | undefined
  dirtyTabs: () => TabInfo[]
  pinnedTabs: () => TabInfo[]
}
```

**关键设计点：** `closeTab`/`closeOtherTabs`/`closeTabsToRight`/`closeAllTabs` 返回 `boolean`（`false` = 被脏标记阻止）；`markTabDeleted` 供文件树删除时强制关闭 Tab；不使用 `persist` 中间件。

### 4.3 辅助类型

```typescript
export type TabContextAction =
  | 'close'
  | 'closeOthers'
  | 'closeRight'
  | 'closeAll'
  | 'pin'
  | 'unpin'
  | 'copyPath'
  | 'revealInTree'

export interface CloseConfirmProps {
  fileName: string
  onSave: () => Promise<void>
  onDiscard: () => void
  onCancel: () => void
}
```

---

## 五、useTabStore 实现规范

### 5.1 Store 创建模式

```typescript
export const useTabStore = create<TabState>()(
  devtools(
    (set, get) => ({
      // ... actions
    }),
    { name: 'TabStore' }
  )
)
```

- 使用 `devtools` 中间件（所有 `set` 调用传入 action name）
- **不使用** `persist` 中间件（Tab 状态是会话级的）
- **不使用** `immer` 中间件（Tab 操作逻辑简单，手动展开即可）

### 5.2 Action 实现规范

#### `openTab(filePath, fileName, extension?)`

```
输入: filePath (workspace-relative), fileName, extension (可选，从 fileName 推导)
逻辑:
  1. 计算 tabId = normalizePath(filePath)
  2. 查找现有 tab: tabs.find(t => t.id === tabId)
  3. 如已存在:
     - 更新 lastAccessedAt = Date.now()
     - 设置 activeTabId = tabId
     - 返回
  4. 如不存在:
     - 创建新 TabInfo { id, filePath, fileName, extension, isDirty: false, isPinned: false, lastAccessedAt: Date.now() }
     - 插入位置: 固定区之后、非固定区末尾
     - 设置 activeTabId = tabId
```

#### `closeTab(tabId, force?)`

```
输入: tabId, force (默认 false)
逻辑:
  1. 查找 tab = tabs.find(t => t.id === tabId)
  2. 如不存在 → return true
  3. 如 tab.isPinned && !force → return false (固定 Tab 不可关闭)
  4. 如 tab.isDirty && !force → return false (调用方需弹确认)
  5. 从 tabs 中移除
  6. 激活下一个 Tab:
     - 如关闭的是 activeTabId:
       a. 优先激活右邻居 (同位置 index)
       b. 次选左邻居 (index - 1)
       c. 无邻居 → activeTabId = null
     - 否则 activeTabId 不变
  7. return true
```

#### `switchTab(tabId)`

```
逻辑:
  1. 验证 tabId 存在于 tabs
  2. 设置 activeTabId = tabId
  3. 更新 lastAccessedAt = Date.now()
```

#### `setDirty(tabId, isDirty)`

```
逻辑:
  1. 映射 tabs: 匹配 tabId 的项更新 isDirty
  2. 其余不变
```

#### `pinTab(tabId)` / `unpinTab(tabId)`

```
pinTab:
  1. 设置 tab.isPinned = true
  2. 将 tab 移至 tabs 数组最前（固定区末尾）

unpinTab:
  1. 设置 tab.isPinned = false
  2. 将 tab 移至非固定区开头
```

#### `reorderTabs(fromIndex, toIndex)`

```
逻辑:
  1. 边界检查: fromIndex === toIndex → 无操作
  2. 源 tab = tabs[fromIndex]
  3. 约束检查:
     - 非固定 Tab 不可拖入固定区域（固定区 = tabs.filter(t => t.isPinned) 的长度范围）
     - 固定 Tab 不可拖入非固定区域
  4. 执行数组 splice 操作
```

#### `closeOtherTabs(keepTabId)` / `closeTabsToRight(tabId)` / `closeAllTabs(force?)`

```
共通逻辑:
  1. 确定需要关闭的 tab 列表
  2. 过滤掉固定 Tab（固定 Tab 永远不被批量关闭）
  3. 检查是否存在脏 Tab:
     - 存在脏 Tab 且 force !== true → return false
  4. 批量移除
  5. 设置 activeTabId:
     - closeOtherTabs → activeTabId = keepTabId
     - closeTabsToRight → activeTabId 不变（除非 active 被关了）
     - closeAllTabs → activeTabId = null（固定 Tab 除外）
  6. return true
```

### 5.3 Selector 设计

```typescript
export const selectTabs = (state: TabState) => state.tabs
export const selectActiveTabId = (state: TabState) => state.activeTabId
export const selectActiveTab = (state: TabState) =>
  state.tabs.find(t => t.id === state.activeTabId)
export const selectDirtyTabIds = (state: TabState) =>
  state.tabs.filter(t => t.isDirty).map(t => t.id)
export const selectHasDirtyTabs = (state: TabState) =>
  state.tabs.some(t => t.isDirty)
```

- 所有 selector 为纯函数，不使用 `createSelector`（Tab 数组通常 < 50，无需 memo）
- 组件中使用 `useTabStore(selectActiveTab)` 模式，利用 Zustand 内置浅比较

---

## 六、组件设计规范

### 6.1 组件层级与职责

```
StudioEditorPanel (改造)
├── TabBar (新增 — src/renderer/components/layout/TabBar.tsx)
│   ├── TabItem[] (新增 — src/renderer/components/layout/TabItem.tsx)
│   │   ├── 文件图标 (按 extension 映射)
│   │   ├── 文件名 (truncate + tooltip)
│   │   ├── 脏标记 ● / 关闭按钮 × (hover 切换)
│   │   └── 固定图钉 (Pin icon)
│   ├── 溢出左箭头按钮
│   ├── 溢出右箭头按钮
│   └── 溢出下拉菜单
├── TabContextMenu (新增 — src/renderer/components/layout/TabContextMenu.tsx)
├── CloseConfirmDialog (新增 — src/renderer/components/layout/CloseConfirmDialog.tsx)
└── 编辑器区域 (WysiwygEditor / 空状态)
```

### 6.2 TabBar 组件

**文件：** `src/renderer/components/layout/TabBar.tsx`

| 属性 | 值 |
|------|------|
| 位置 | 固定在 StudioEditorPanel 顶部 |
| 高度 | 40px（h-10） |
| 背景 | `bg-[#050505]`（与现有 Tab 栏一致） |
| 底部边框 | `border-b border-sys-darkBorder` |

**溢出处理策略：**

```
1. 使用 useRef 测量容器宽度和所有 TabItem 总宽度
2. 容器宽度 < Tab 总宽度 → 显示左右滚动箭头
3. 左箭头: scrollLeft -= 150px (带 smooth)
4. 右箭头: scrollLeft += 150px (带 smooth)
5. 溢出下拉按钮: 显示所有 Tab 列表，点击可跳转
```

**Props 接口：**

```typescript
interface TabBarProps {
  onContextMenu: (event: React.MouseEvent, tabId: string) => void
  onCloseTab: (tabId: string) => void
  onSwitchTab: (tabId: string) => void
  onReorderTabs: (fromIndex: number, toIndex: number) => void
}
```

组件内部直接通过 `useTabStore` 读取 tabs 和 activeTabId，不通过 props 传递状态。

### 6.3 TabItem 组件

**文件：** `src/renderer/components/layout/TabItem.tsx`

| 属性 | 值 |
|------|------|
| 最小宽度 | 120px (`min-w-[120px]`) |
| 最大宽度 | 200px (`max-w-[200px]`) |
| 活动态 | 底部 2px accent 线 (`border-b-2 border-indigo-500`) + 白色文字 + 深色背景 |
| 非活动态 | 灰色文字 (`text-sys-darkMuted`) + hover 背景变化 |
| 固定 Tab | 显示图钉图标，宽度更紧凑 |

**交互行为：**

| 事件 | 行为 |
|------|------|
| 左键点击 | 切换到该 Tab (`switchTab`) |
| 中键点击 | 关闭该 Tab (`closeTab`) |
| 右键点击 | 打开上下文菜单 |
| 拖拽 | HTML5 DnD 排序 |
| 关闭按钮 × | 关闭该 Tab |
| 脏标记 ● | 显示未保存状态；hover 时变为关闭按钮 × |

**文件图标映射（按 extension）：**

```typescript
function getFileIcon(extension: string): LucideIcon {
  switch (extension) {
    case 'md': case 'markdown': case 'mdx': return FileText
    case 'json': case 'yaml': case 'yml': case 'toml': return FileJson
    case 'ts': case 'tsx': case 'js': case 'jsx': return FileCode
    case 'css': case 'scss': return FileCode
    case 'png': case 'jpg': case 'svg': return FileImage
    default: return File
  }
}
```

**React.memo 优化：**

```typescript
export const TabItem = React.memo(function TabItem({
  tab,
  isActive,
  onContextMenu,
  onClose,
  onSwitch,
  onDragStart,
  onDragOver,
  onDrop,
}: TabItemProps) {
  // ...
}, (prev, next) => {
  return prev.tab.id === next.tab.id
    && prev.tab.isDirty === next.tab.isDirty
    && prev.tab.isPinned === next.tab.isPinned
    && prev.isActive === next.isActive
})
```

### 6.4 TabContextMenu 组件

**文件：** `src/renderer/components/layout/TabContextMenu.tsx`

**菜单项（按显示顺序）：**

| 序号 | 菜单项 | 条件 | Action |
|------|--------|------|--------|
| 1 | 关闭 | 始终显示 | `closeTab(tabId)` |
| 2 | 关闭其他 | tabs.length > 1 | `closeOtherTabs(tabId)` |
| 3 | 关闭右侧 | tab 不是最后一个 | `closeTabsToRight(tabId)` |
| 4 | 关闭全部 | tabs.length > 1 | `closeAllTabs()` |
| 5 | — 分隔线 — | | |
| 6 | 固定 / 取消固定 | 切换显示 | `pinTab` / `unpinTab` |
| 7 | — 分隔线 — | | |
| 8 | 复制路径 | 始终显示 | `navigator.clipboard.writeText(tab.filePath)` |
| 9 | 在文件树中定位 | 始终显示 | `fileTreeStore.selectNode(tab.filePath)` |

**定位：** 使用 `position: fixed` + 点击坐标，点击外部关闭。

**批量关闭脏检查：**
- "关闭其他"/"关闭右侧"/"关闭全部" 在执行前检查脏 Tab
- 如有脏 Tab，弹出 `CloseConfirmDialog`（逐个或批量确认）
- 简化策略：先调用 `closeOtherTabs(tabId)` → 返回 false → 弹出确认 → 用户确认后 `force=true` 再调用

### 6.5 CloseConfirmDialog 组件

**文件：** `src/renderer/components/layout/CloseConfirmDialog.tsx`

**UI 设计：**

```
┌─────────────────────────────────────┐
│  ⚠ 关闭未保存的文件                  │
│                                     │
│  "README.md" 有未保存的修改。         │
│  关闭前是否保存？                     │
│                                     │
│  [ 保存 (Save) ]  [ 不保存 ]  [ 取消 ] │
└─────────────────────────────────────┘
```

**交互流程：**

```
1. 保存 (Save):
   - 调用 onSave() → 触发编辑器保存 → 保存成功后 closeTab(tabId, true)
   - 保存失败则不关闭，显示错误提示

2. 不保存 (Don't Save):
   - 调用 onDiscard() → closeTab(tabId, true) 强制关闭

3. 取消 (Cancel):
   - 调用 onCancel() → 关闭对话框，不执行任何操作
```

复用现有 `Modal` 组件（`src/renderer/components/ui/Modal.tsx`）作为外层容器。

---

## 七、拖拽排序与溢出处理

### 7.1 HTML5 Drag and Drop 实现

**drag type：** `'application/sibylla-tab'`（与文件树 DnD 作用域隔离）

**状态管理：**

```typescript
// TabBar 内部 state
const [dragIndex, setDragIndex] = useState<number | null>(null)
const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
```

**事件处理：** `onDragStart` 设置 dragIndex + dataTransfer；`onDragOver` 计算插入位置 + 固定区约束；`onDrop` 调用 `reorderTabs`；`onDragEnd` 重置状态。

**插入线：** dropTargetIndex 位置渲染 2px 竖线（`indigo-500`）。

**固定区域约束：** `pinnedCount = tabs.filter(t => t.isPinned).length`；固定 Tab 只能在固定区内拖拽，非固定 Tab 只能在非固定区内拖拽。

### 7.2 溢出处理

**检测策略：**

```typescript
function useTabOverflow(
  containerRef: RefObject<HTMLDivElement>,
  tabCount: number
): { isOverflowing: boolean; canScrollLeft: boolean; canScrollRight: boolean; scrollLeft: () => void; scrollRight: () => void } {
  // 使用 ResizeObserver 监听容器宽度变化
  // 比较 scrollWidth vs clientWidth
  // scrollLeft/Right: container.scrollBy({ left: ±150, behavior: 'smooth' })
}
```

**UI 布局：**

```
┌────┬──────────────────────────────────┬────┬────┐
│ ◀  │ [Tab1] [Tab2] [Tab3] [Tab4] ... │ ▶  │ ▾  │
└────┴──────────────────────────────────┴────┴────┘
  ▲                                        ▲   ▲
  │                                        │   │
  左箭头                                 右箭头 溢出下拉
  (仅 canScrollLeft 时显示)     (仅 canScrollRight 时显示)
```

**溢出下拉菜单：** 点击 ▾ → 显示所有 Tab 列表（活动 Tab 标记 ●，脏 Tab 标记橙色圆点），点击跳转 + 自动滚动。

---

## 八、迁移策略与消费方改造

### 8.1 迁移原则

1. **一次性迁移，同步标记废弃**：所有消费方在同一批次内切换到 tabStore，appStore 旧 API 标记 `@deprecated`
2. **保留旧实现不删除**：`appStore` 中 `currentFile`/`openFiles` 相关代码标记 `@deprecated` 但保留功能实现，确保过渡期无破坏
3. **双向桥接（可选）**：如存在未迁移的第三方消费方，可在 tabStore action 中同步更新 appStore（不推荐，应一次性迁移完毕）

### 8.2 appStore 标记 @deprecated

```typescript
// appStore.ts 变更

interface AppState {
  // ...其他状态不变

  /** @deprecated 使用 useTabStore.openTab() 替代 */
  currentFile: FileInfo | null
  /** @deprecated 使用 useTabStore.tabs 替代 */
  openFiles: FileInfo[]
  /** @deprecated 使用 useTabStore.switchTab() 替代 */
  setCurrentFile: (file: FileInfo | null) => void
  /** @deprecated 使用 useTabStore.openTab() 替代 */
  addOpenFile: (file: FileInfo) => void
  /** @deprecated 使用 useTabStore.closeTab() 替代 */
  removeOpenFile: (path: string) => void
  /** @deprecated 使用 useTabStore.closeAllTabs() 替代 */
  clearOpenFiles: () => void
}

// Selectors 也标记 @deprecated
/** @deprecated 使用 useTabStore(selectActiveTab) 替代 */
export const selectCurrentFile = (state: AppState) => state.currentFile
/** @deprecated 使用 useTabStore(selectTabs) 替代 */
export const selectOpenFiles = (state: AppState) => state.openFiles
```

**注意：** `partialize` 配置不变（仅持久化 theme/sidebar/recentWorkspaces），`currentFile`/`openFiles` 本来就不在持久化范围内。

### 8.3 WorkspaceStudioPage 改造

最大消费方（1350 行）。核心改造：`useAppStore(selectCurrentFile/selectOpenFiles)` → `useTabStore`；`setCurrentFile(file)` → `tabStore.openTab()`；手动 `openFileTabs`/`dirtyFilePaths` 计算 → 直接读 `tabStore.tabs`/`tabStore.dirtyTabs()`；`openFile()` 函数成功后调 `tabStore.openTab()`；`closeTab` 返回 false → 弹 `CloseConfirmDialog`。

### 8.4 StudioEditorPanel 改造

移除内联 Tab 栏（L43-91）和 `openFileTabs`/`dirtyFilePaths`/`onOpenTab`/`onCloseTab` props，挂载 `<TabBar />` 组件（内部直接消费 tabStore）。

### 8.5 Header.tsx 改造

`useAppStore(state => state.currentFile)` → `useTabStore(selectActiveTab)`。

### 8.6 FileTree.tsx 联动

`onSelect` 回调中调 `useTabStore.getState().openTab(path, name, ext)`；`fileTreeStore.deleteNode` 成功后调 `useTabStore.getState().markTabDeleted(path)`。

---

## 九、键盘快捷键与编辑器联动

### 9.1 键盘快捷键注册

在 `WorkspaceStudioPage` 或 `AppLayout` 层级注册全局快捷键：

- **Ctrl/Cmd + W**：关闭当前 Tab（脏则弹确认）
- **Ctrl/Cmd + Tab**：切换到下一个 Tab（循环）
- **Ctrl/Cmd + Shift + Tab**：切换到上一个 Tab
- **Ctrl/Cmd + Alt + P**：固定/取消固定当前 Tab

实现方式：`window.addEventListener('keydown', handler)` 中通过 `useTabStore.getState()` 读取/操作状态。

### 9.2 Tab ↔ 编辑器脏标记联动

**核心问题：** 编辑器内容变化时需要同步更新 Tab 的 `isDirty` 状态。

**方案：** `WysiwygEditor.onDirtyChange` → `WorkspaceStudioPage.handleEditorDirtyChange` → `tabStore.setDirty(activeTabId, isDirty)`。

**脏标记清除时机：** 编辑器保存成功 → `setDirty(tabId, false)`；强制关闭 Tab → 自动移除；FileWatcher 重载 → `setDirty(tabId, false)`。

### 9.3 Tab ↔ 文件树选中联动

`activeTabId` 变化时，同步调用 `useFileTreeStore.getState().selectNode(activeTab.filePath)` 保持文件树选中与活动 Tab 同步。

---

## 十、分步实施计划

> 共 7 步，每步产出可独立验证的增量。步骤 1-3 为核心骨架，步骤 4-7 为增强功能。

### Step 1：创建 tabStore（预估 3h）

**产出：** `src/renderer/store/tabStore.ts`

**实施内容：**
1. 定义 `TabInfo`、`TabState`、`TabContextAction`、`CloseConfirmProps` 类型
2. 实现 `create<TabState>()(devtools(...))` store
3. 实现全部 actions：
   - `openTab` — 已存在则切换，否则新建
   - `closeTab` — 脏/固定检查 + 激活邻居策略
   - `switchTab` — 更新 activeTabId + lastAccessedAt
   - `setDirty` — 映射 isDirty
   - `pinTab` / `unpinTab` — 标记 + 重排序
   - `reorderTabs` — splice + 固定区域约束
   - `closeOtherTabs` / `closeTabsToRight` / `closeAllTabs` — 批量 + 脏检查
   - `getTab` / `markTabDeleted`
4. 实现派生 selector：`selectActiveTab`、`selectDirtyTabIds`、`selectHasDirtyTabs`
5. 编写 `tabStore.test.ts` 全部 action 单元测试

**验证标准：**
- [ ] 全部 action 单元测试通过
- [ ] 覆盖率 ≥ 90%（store 层）
- [ ] TypeScript strict mode 无错误

### Step 2：标记 appStore @deprecated + 消费方迁移（预估 2h）

**产出：** `appStore.ts` 更新、`types.ts` 更新

**实施内容：**
1. 在 `appStore.ts` 中为 `currentFile`/`openFiles` 及相关 actions/selectors 添加 `@deprecated` JSDoc
2. 在 `types.ts` 中保留 `OpenFileTab` 类型但标记 `@deprecated`，指向 `TabInfo`
3. 不删除旧实现，不修改 `partialize` 配置

**验证标准：**
- [ ] IDE 中使用旧 API 时显示删除线
- [ ] 现有功能不受影响（旧代码仍可运行）

### Step 3：TabBar + TabItem 基础组件（预估 4h）

**产出：** `TabBar.tsx`、`TabItem.tsx`

**实施内容：**
1. 创建 `TabItem.tsx`：
   - 文件图标映射（按 extension）
   - 文件名 truncate + title tooltip
   - 脏标记 ● / 关闭按钮 × hover 切换
   - 活动态底部高亮线
   - React.memo 优化（自定义 areEqual）
2. 创建 `TabBar.tsx`：
   - flex 横向布局，`overflow-x-auto`
   - 渲染 `tabs.map(tab => <TabItem>)`
   - 空状态文案 "No open files"
   - "+ AI" 按钮保留
3. 改造 `StudioEditorPanel.tsx`：
   - 移除内联 Tab 栏（L43-91）
   - 挂载 `<TabBar />` 组件
   - 移除 `openFileTabs` / `dirtyFilePaths` / `onOpenTab` / `onCloseTab` props
4. 改造 `WorkspaceStudioPage.tsx`：
   - 替换 `useAppStore(selectCurrentFile/selectOpenFiles)` → `useTabStore`
   - 替换手动计算的 `openFileTabs` / `dirtyFilePaths`
   - `openFile()` 函数对接 `tabStore.openTab()`
   - `closeTab` 返回 false 时弹出确认（后续 Step 4 完善）
5. 改造 `Header.tsx`：读取 `tabStore.activeTab`

**验证标准：**
- [ ] 文件树点击 → TabBar 出现新 Tab
- [ ] 点击 Tab → 切换编辑器内容
- [ ] 点击 × → 关闭 Tab → 激活邻居
- [ ] 中键点击 → 关闭 Tab
- [ ] 关闭最后一个 Tab → 显示空状态

### Step 4：脏标记与未保存确认（预估 2h）

**产出：** `CloseConfirmDialog.tsx`

**实施内容：**
1. 创建 `CloseConfirmDialog.tsx`：
   - 复用 `Modal` 组件
   - 三按钮：保存 / 不保存 / 取消
   - 保存按钮触发编辑器 save → 成功后 force close
2. 在 `WorkspaceStudioPage` 中：
   - `WysiwygEditor.onDirtyChange` → `tabStore.setDirty()`
   - 保存成功后 → `tabStore.setDirty(tabId, false)`
3. TabItem 脏标记显示联动

**验证标准：**
- [ ] 编辑内容 → Tab 显示 ● 圆点
- [ ] 保存 → ● 圆点消失
- [ ] 关闭脏 Tab → 弹出确认对话框
- [ ] 保存 → 文件保存 + Tab 关闭
- [ ] 不保存 → Tab 强制关闭
- [ ] 取消 → 对话框关闭，Tab 保留

### Step 5：Tab 拖拽排序（预估 3h）

**产出：** TabBar 内 DnD 逻辑

**实施内容：**
1. TabItem 添加 `draggable` 属性
2. 实现 `onDragStart`/`onDragOver`/`onDrop`/`onDragEnd` 事件链
3. 插入线视觉反馈（2px indigo-500 竖线）
4. 固定区域约束：跨区域时 dropTargetIndex 修正到合法位置
5. 拖拽结束调用 `reorderTabs(fromIndex, toIndex)`

**验证标准：**
- [ ] 拖拽 Tab 可重新排序
- [ ] 拖拽时有插入线指示器
- [ ] 固定 Tab 不可拖入非固定区域
- [ ] 非固定 Tab 不可拖入固定区域
- [ ] 拖拽结束后 store 状态正确更新

### Step 6：右键菜单 + 溢出处理 + 键盘快捷键（预估 3h）

**产出：** `TabContextMenu.tsx`、溢出 Hook、快捷键注册

**实施内容：**
1. 创建 `TabContextMenu.tsx`：
   - 8 个菜单项（关闭/关闭其他/关闭右侧/关闭全部/固定/取消固定/复制路径/在文件树中定位）
   - 条件显示（如只有一个 Tab 时不显示"关闭其他"）
   - 批量关闭时的脏检查 → 弹 CloseConfirmDialog
2. 溢出处理：
   - `useTabOverflow` Hook（ResizeObserver + scrollWidth 比较）
   - 左右滚动箭头按钮
   - 溢出下拉菜单（ChevronDown 按钮 → 所有 Tab 列表）
3. 键盘快捷键注册：
   - `Ctrl/Cmd + W` → 关闭当前 Tab
   - `Ctrl/Cmd + Tab` → 切换到下一个 Tab
   - `Ctrl/Cmd + Shift + Tab` → 切换到上一个 Tab
   - `Ctrl/Cmd + Alt + P` → 固定/取消固定
4. 固定 Tab 视觉：
   - 显示图钉图标
   - 宽度更窄（仅图标 + 短文件名）

**验证标准：**
- [ ] 右键菜单所有项可用
- [ ] 溢出时显示滚动箭头
- [ ] 滚动箭头点击可左右滚动
- [ ] 溢出下拉菜单显示完整 Tab 列表
- [ ] Ctrl+W 关闭当前 Tab
- [ ] Ctrl+Tab 切换 Tab
- [ ] 固定 Tab 显示图钉 + 排在最前

### Step 7：测试补全 + 联调验证（预估 3h）

**产出：** 完整测试套件

**实施内容：**
1. 补全 `tabStore.test.ts`：
   - closeTab 边界（最后一个、中间、最右）
   - reorderTabs 固定区域约束
   - closeOtherTabs/closeTabsToRight 含脏 Tab
   - markTabDeleted
2. 编写 `TabBar.test.tsx`：
   - 渲染正确数量 Tab
   - 活动 Tab 高亮样式
   - 点击切换、关闭按钮、中键关闭
3. 编写 `TabContextMenu.test.tsx`：
   - 右键菜单项条件显示
   - 固定/取消固定切换
4. 集成测试场景（手动验证）：
   - 文件树 → Tab 联动
   - Tab → 编辑器联动
   - 脏标记流转
   - 删除文件 → Tab 关闭

**验证标准：**
- [ ] 测试覆盖率 ≥ 80%
- [ ] ESLint 通过，无警告
- [ ] TypeScript strict mode 无错误

---

## 十一、验收标准与风险评估

### 11.1 功能验收清单

**核心功能：**

| # | 验收项 | 对应 Step | 验证方式 |
|---|--------|----------|---------|
| 1 | 从文件树点击文件可打开新 Tab | Step 3 | 手动 + 单元测试 |
| 2 | 已打开的文件再次点击切换到对应 Tab（不重复打开） | Step 3 | tabStore 测试 |
| 3 | 点击 Tab 切换编辑器内容 | Step 3 | 手动验证 |
| 4 | 点击 Tab 关闭按钮关闭 Tab | Step 3 | 手动 + 单元测试 |
| 5 | 中键点击关闭 Tab | Step 3 | 手动验证 |
| 6 | 关闭最后一个 Tab 后显示空状态 | Step 3 | 手动验证 |
| 7 | 关闭 Tab 后自动激活相邻 Tab（右 → 左 → null） | Step 3 | tabStore 测试 |
| 8 | 脏 Tab 关闭时弹出保存确认 | Step 4 | 手动 + 单元测试 |
| 9 | Tab 可拖拽排序 | Step 5 | 手动验证 |
| 10 | 右键菜单操作全部可用 | Step 6 | 手动 + 单元测试 |
| 11 | Tab 溢出时显示滚动控件 | Step 6 | 手动验证 |
| 12 | 固定 Tab 排在最前且显示图钉图标 | Step 6 | 手动验证 |
| 13 | `appStore` 的 openFiles/currentFile 已标记 @deprecated | Step 2 | 代码审查 |

**性能指标：**

| # | 指标 | 目标 | 验证方式 |
|---|------|------|---------|
| 1 | 打开 Tab 操作 | < 50ms | Performance tab |
| 2 | 切换 Tab | < 100ms（不含编辑器加载） | Performance tab |
| 3 | 同时打开 50+ Tab | 无性能问题 | 手动压力测试 |

**用户体验：**

| # | 验收项 | 验证方式 |
|---|--------|---------|
| 1 | Tab 宽度自适应，过长文件名截断 + tooltip | 手动验证 |
| 2 | 关闭按钮 hover 时才显示 | 手动验证 |
| 3 | 脏标记 ● 清晰可见 | 手动验证 |
| 4 | 拖拽排序有插入线视觉反馈 | 手动验证 |
| 5 | Ctrl+W / Ctrl+Tab 快捷键可用 | 手动验证 |

### 11.2 交付物清单

| # | 文件 | 类型 | 状态 |
|---|------|------|------|
| 1 | `src/renderer/store/tabStore.ts` | 新增 | 待创建 |
| 2 | `src/renderer/components/layout/TabBar.tsx` | 新增 | 待创建 |
| 3 | `src/renderer/components/layout/TabItem.tsx` | 新增 | 待创建 |
| 4 | `src/renderer/components/layout/TabContextMenu.tsx` | 新增 | 待创建 |
| 5 | `src/renderer/components/layout/CloseConfirmDialog.tsx` | 新增 | 待创建 |
| 6 | `src/renderer/store/appStore.ts` | 更新 | @deprecated 标记 |
| 7 | `src/renderer/components/studio/StudioEditorPanel.tsx` | 更新 | 替换内联 Tab 栏 |
| 8 | `src/renderer/pages/WorkspaceStudioPage.tsx` | 更新 | 迁移到 tabStore |
| 9 | `src/renderer/components/layout/Header.tsx` | 更新 | 读取 activeTab |
| 10 | `src/renderer/__tests__/tabStore.test.ts` | 新增 | 待创建 |
| 11 | `src/renderer/__tests__/TabBar.test.tsx` | 新增 | 待创建 |

### 11.3 风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| appStore 迁移破坏现有功能 | 高 | 低 | 标记 @deprecated 但保留实现；新代码使用 tabStore；完整回归测试 |
| WorkspaceStudioPage 1350 行大改容易引入 bug | 高 | 中 | 逐步迁移，每步验证；优先保持功能不变 |
| Tab 拖拽与 FileTree 拖拽冲突 | 低 | 低 | DnD dragType 隔离（`application/sibylla-tab` vs 文件树的 type） |
| 大量 Tab（50+）渲染性能 | 低 | 低 | TabItem React.memo + 自定义 areEqual；必要时虚拟化 |
| 脏标记与 editorStore 双写不一致 | 中 | 中 | 单一写入点：只在 `WorkspaceStudioPage` 的 `handleEditorDirtyChange` 中写入 tabStore |

### 11.4 回滚策略

如果迁移出现严重问题：
1. `appStore` 旧实现未删除，可直接恢复旧代码路径
2. `StudioEditorPanel` 内联 Tab 栏代码注释保留（不删除，注释标记）
3. `tabStore` 为新增文件，可安全删除而不影响现有功能

---

**创建时间：** 2026-04-16
**最后更新：** 2026-04-16
**更新记录：**
- 2026-04-16 - 初始创建
