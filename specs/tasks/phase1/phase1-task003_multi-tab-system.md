# 多 Tab 编辑系统

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK003 |
| **任务标题** | 多 Tab 编辑系统 |
| **所属阶段** | Phase 1 - MVP 核心体验 (Sprint 1) |
| **优先级** | P0 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

实现浏览器/VS Code 风格的多 Tab 编辑系统，允许用户同时打开多个文件，通过 Tab 栏快速切换。包含专用 Zustand store 管理 Tab 状态，替换现有 `appStore.ts` 中的 `openFiles` / `currentFile` 状态。

### 背景

Phase 0 的 `appStore.ts` 已有基础的文件打开状态：
- `currentFile: FileInfo | null` — 当前文件
- `openFiles: FileInfo[]` — 已打开文件列表
- `addOpenFile()`, `removeOpenFile()`, `setCurrentFile()`, `clearOpenFiles()`

这套状态缺少 Tab 系统需要的能力：脏标记、Tab 排序、固定 Tab、关闭策略（关闭后激活左/右邻居）、滚动溢出等。需要创建专用 `tabStore` 替换这部分状态，同时保持 `appStore` 其余功能不受影响。

### 范围

**包含：**
- Tab 栏 UI 组件（可滚动、可拖拽排序）
- 专用 `useTabStore`（Zustand）
- 从 `appStore` 迁移 `openFiles`/`currentFile` 状态
- Tab 操作：打开、关闭、切换、固定/取消固定
- 关闭策略：未保存提示、关闭后激活邻近 Tab
- Tab 拖拽排序
- 右键菜单（关闭、关闭其他、关闭右侧、关闭全部、固定）
- Tab 溢出处理（左右滚动箭头 + 文件列表下拉）
- Tab 与文件树联动（文件树点击打开 Tab）
- Tab 与编辑器联动（脏标记显示）

**不包含：**
- Tab 分屏/拆分视图（Phase 1 后续迭代）
- Tab 持久化到磁盘（当前仅内存态，后续按需添加）
- 拖拽 Tab 到新窗口（不实现）

## 技术要求

### 技术栈

- React 18 + TypeScript strict mode
- Zustand（`devtools` 中间件）
- TailwindCSS（Notion 风格）
- Lucide React（图标）
- HTML5 Drag and Drop API（Tab 排序）

### 架构设计

```
TabBar (Tab 栏容器)
├── TabItem (单个 Tab)
│   ├── Tab 图标（按文件类型）
│   ├── 文件名
│   ├── 脏标记指示器（●）
│   └── 关闭按钮（×）
├── TabScrollButtons (左右滚动控制)
├── TabOverflowMenu (溢出文件列表)
└── TabContextMenu (右键菜单)

useTabStore (Zustand)
├── tabs: TabInfo[]
├── activeTabId: string | null
├── openTab()
├── closeTab()
├── switchTab()
├── pinTab() / unpinTab()
├── reorderTabs()
├── closeOtherTabs()
├── closeTabsToRight()
└── closeAllTabs()
```

#### 核心类型定义

```typescript
// Tab information
export interface TabInfo {
  id: string              // unique tab ID (use file path as ID)
  filePath: string        // workspace-relative file path
  fileName: string        // display name (e.g., "README.md")
  extension: string       // file extension for icon mapping
  isDirty: boolean        // unsaved changes flag
  isPinned: boolean       // pinned tab flag
  lastAccessedAt: number  // timestamp for LRU ordering
}

// Tab store state
export interface TabState {
  tabs: TabInfo[]
  activeTabId: string | null
  
  // Actions
  openTab: (filePath: string, fileName: string, extension?: string) => void
  closeTab: (tabId: string, force?: boolean) => boolean  // returns false if blocked by unsaved
  switchTab: (tabId: string) => void
  setDirty: (tabId: string, isDirty: boolean) => void
  pinTab: (tabId: string) => void
  unpinTab: (tabId: string) => void
  reorderTabs: (fromIndex: number, toIndex: number) => void
  closeOtherTabs: (tabId: string) => void
  closeTabsToRight: (tabId: string) => void
  closeAllTabs: (force?: boolean) => boolean
  getTab: (tabId: string) => TabInfo | undefined
  
  // Derived
  activeTab: () => TabInfo | undefined
  dirtyTabs: () => TabInfo[]
  pinnedTabs: () => TabInfo[]
}

// Tab context menu action
export type TabContextAction =
  | 'close'
  | 'closeOthers'
  | 'closeRight'
  | 'closeAll'
  | 'pin'
  | 'unpin'
  | 'copyPath'
  | 'revealInTree'

// Close confirm dialog
export interface CloseConfirmProps {
  fileName: string
  onSave: () => Promise<void>
  onDiscard: () => void
  onCancel: () => void
}
```

### 实现细节

#### 关键实现点

1. **useTabStore 设计**
   - 使用 Zustand `create()` + `devtools` 中间件
   - `tabs` 数组中固定 Tab（`isPinned`）排在前面
   - `openTab()` 逻辑：
     - 如果 Tab 已存在（按 filePath 匹配），仅切换到该 Tab
     - 如果 Tab 不存在，创建新 TabInfo 并追加到数组末尾（固定 Tab 之后）
     - 设置为 activeTabId
   - `closeTab()` 逻辑：
     - 如果 `isDirty` 且 `force !== true`，返回 `false`（调用方负责弹出保存确认）
     - 移除 Tab 后，激活下一个 Tab：优先右邻居 → 左邻居 → null
     - 固定 Tab 需先 unpin 才能关闭（或 `force=true`）
   - Tab ID 使用文件路径（workspace-relative），保证唯一性

2. **从 appStore 迁移**
   - `appStore.ts` 中 `openFiles` / `currentFile` / `addOpenFile` / `removeOpenFile` / `setCurrentFile` / `clearOpenFiles` 标记为 `@deprecated`
   - 相关选择器（`selectCurrentFile`, `selectOpenFiles`）也标记为 `@deprecated`
   - 新代码全部使用 `useTabStore`
   - 保持 `appStore` 持久化配置不变（仅 theme, sidebar, recentWorkspaces 持久化）
   - `useTabStore` 不持久化到 localStorage（Tab 状态是会话级的）

3. **TabBar 组件**
   - 固定在 `MainContent` 顶部
   - 高度 36px，与 Notion 标签栏一致
   - Tab 最小宽度 120px，最大宽度 200px
   - 超出容器宽度时显示左右滚动箭头
   - 活动 Tab 有底部高亮线（2px accent color）

4. **TabItem 组件**
   - 显示：文件图标 + 文件名 + 脏标记(●) + 关闭按钮(×)
   - 点击切换到该 Tab
   - 中键点击关闭 Tab
   - 关闭按钮 hover 时才显示（节省空间）
   - 脏标记：未保存时文件名旁显示圆点（●），hover 时变为关闭按钮
   - 固定 Tab 显示图钉图标，宽度更窄（仅显示图标）

5. **Tab 拖拽排序**
   - HTML5 Drag and Drop API
   - 拖拽时显示插入线指示器（Tab 之间的竖线）
   - 固定 Tab 不可被拖过（固定区域与非固定区域分隔）
   - 拖拽结束后调用 `reorderTabs(fromIndex, toIndex)`

6. **Tab 右键菜单**
   - 菜单项：关闭 | 关闭其他 | 关闭右侧 | 关闭全部 | — | 固定/取消固定 | 复制路径 | 在文件树中定位
   - "关闭全部/关闭其他/关闭右侧"需要批量检查脏标记

7. **未保存确认对话框**
   - 关闭脏 Tab 时弹出 Modal
   - 三个选项：保存(Save) / 不保存(Don't Save) / 取消(Cancel)
   - "保存"触发编辑器保存后再关闭
   - "不保存"强制关闭（`force=true`）
   - "取消"取消关闭操作

## 验收标准

### 功能完整性

- [ ] 从文件树点击文件可打开新 Tab
- [ ] 已打开的文件再次点击切换到对应 Tab（不重复打开）
- [ ] 点击 Tab 切换编辑器内容
- [ ] 点击 Tab 关闭按钮关闭 Tab
- [ ] 中键点击关闭 Tab
- [ ] 关闭最后一个 Tab 后显示空状态
- [ ] 关闭 Tab 后自动激活相邻 Tab
- [ ] 脏 Tab 关闭时弹出保存确认
- [ ] Tab 可拖拽排序
- [ ] 右键菜单操作全部可用
- [ ] Tab 溢出时显示滚动控件
- [ ] 固定 Tab 排在最前且显示图钉图标
- [ ] `appStore` 的 openFiles/currentFile 已标记 @deprecated

### 性能指标

- [ ] 打开 Tab 操作 < 50ms
- [ ] 切换 Tab < 100ms（不含编辑器内容加载）
- [ ] 支持同时打开 50+ Tab 无性能问题

### 用户体验

- [ ] Tab 宽度自适应，过长文件名截断并显示 tooltip
- [ ] 关闭按钮 hover 时才显示
- [ ] 脏标记清晰可见（●圆点）
- [ ] 拖拽排序有视觉反馈（插入线）
- [ ] 键盘快捷键：Ctrl+W 关闭当前 Tab，Ctrl+Tab 切换 Tab

### 代码质量

- [ ] TypeScript strict mode 无错误
- [ ] ESLint 检查通过，无警告
- [ ] 所有公共函数有 JSDoc 注释
- [ ] 代码审查通过

## 测试标准

### 单元测试

**测试覆盖率目标：** ≥ 80%

**关键测试用例：**

1. **useTabStore — openTab()**
   - 新文件：创建新 Tab 并设为 active
   - 已打开文件：切换到已有 Tab，不重复创建
   - 边界：路径含特殊字符

2. **useTabStore — closeTab()**
   - 普通 Tab：移除并激活邻居
   - 脏 Tab（force=false）：返回 false
   - 脏 Tab（force=true）：强制关闭
   - 最后一个 Tab：activeTabId 设为 null
   - 关闭中间 Tab：激活右邻居
   - 关闭最右 Tab：激活左邻居

3. **useTabStore — reorderTabs()**
   - 正常排序：fromIndex → toIndex
   - 固定 Tab 区域边界：不允许非固定 Tab 拖入固定区域
   - 边界：fromIndex === toIndex（无操作）

4. **useTabStore — closeOtherTabs() / closeTabsToRight()**
   - 保留目标 Tab，关闭其他
   - 含脏 Tab 时返回 false（需调用方处理）
   - 固定 Tab 不被关闭

5. **TabBar 组件**
   - 渲染正确数量的 Tab
   - 活动 Tab 有高亮样式
   - 点击 Tab 触发 switchTab
   - 关闭按钮触发 closeTab

6. **TabContextMenu**
   - 右键菜单显示正确项
   - 固定 Tab 显示"取消固定"而非"固定"

### 集成测试

**测试场景：**

1. 文件树 → Tab 联动：点击文件树中的文件 → 新 Tab 打开并激活
2. Tab → 编辑器联动：切换 Tab → 编辑器加载对应文件内容
3. 脏标记流转：编辑内容 → Tab 显示脏标记 → 保存 → 脏标记消失
4. 删除文件 → Tab 关闭：文件树中删除已打开文件 → 对应 Tab 自动关闭

### 端到端测试

E2E 测试在 Sprint 1 整体完成后统一编写。

## 依赖关系

### 前置依赖

- [x] PHASE0-TASK001 (项目初始化) — Zustand 已安装
- [x] PHASE0-TASK002 (桌面端架构) — 布局组件已就位
- [ ] PHASE1-TASK001 (文件树 CRUD) — 文件树点击事件触发 openTab（可并行开发）

### 被依赖任务

- PHASE1-TASK002 (WYSIWYG 编辑器) — 编辑器嵌入 Tab 面板
- Sprint 2 版本对比 — Tab 展示 diff 视图

### 阻塞风险

- 与 `appStore` 的 `openFiles` 状态迁移需小心处理，避免在过渡期出现状态冲突。建议一次性迁移，同步标记废弃。

## 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| appStore 迁移破坏现有功能 | 高 | 低 | 标记 @deprecated 但保留实现，新代码使用 tabStore |
| Tab 拖拽与 FileTree 拖拽冲突 | 低 | 低 | 两者 DnD 作用域隔离（不同 dragType） |
| 大量 Tab 性能 | 低 | 低 | Tab 栏虚拟化（50+ Tab 时启用） |

### 时间风险

核心功能（打开/关闭/切换）可在 1 天内完成。拖拽排序和右键菜单可作为第二优先级。

### 资源风险

无外部资源依赖。

## 参考文档

- [`CLAUDE.md`](../../../CLAUDE.md) - 项目宪法
- [`specs/design/ui-ux-design.md`](../../design/ui-ux-design.md) - UI/UX 设计规范
- [`src/renderer/store/appStore.ts`](../../../sibylla-desktop/src/renderer/store/appStore.ts) - 现有 app store（含 openFiles 状态）
- [`src/renderer/components/layout/MainContent.tsx`](../../../sibylla-desktop/src/renderer/components/layout/MainContent.tsx) - Tab 栏挂载容器
- VS Code Tab 行为参考 — 关闭策略、固定 Tab、拖拽排序

## 实施计划

### 第1步：useTabStore 创建

- 创建 `src/renderer/store/tabStore.ts`
- 实现 `TabInfo` 类型和全部 actions
- 实现关闭策略（激活邻居逻辑）
- 预计耗时：3 小时

### 第2步：appStore 迁移

- 在 `appStore.ts` 中标记 `openFiles`/`currentFile` 相关 API 为 `@deprecated`
- 更新现有消费方使用 `useTabStore`
- 预计耗时：2 小时

### 第3步：TabBar + TabItem 组件

- 创建 `TabBar.tsx` 和 `TabItem.tsx`
- 集成到 `MainContent.tsx` 顶部
- 实现基础交互：点击切换、关闭、中键关闭
- 预计耗时：4 小时

### 第4步：脏标记与未保存确认

- 实现 `setDirty()` action
- 创建 `CloseConfirmDialog` 组件（复用 Modal）
- 关闭脏 Tab 时弹出确认
- 预计耗时：2 小时

### 第5步：Tab 拖拽排序

- HTML5 DnD 实现 Tab 拖拽
- 插入线视觉反馈
- 固定 Tab 区域约束
- 预计耗时：3 小时

### 第6步：右键菜单 + 溢出处理

- 创建 `TabContextMenu` 组件
- Tab 溢出检测 + 滚动箭头
- 溢出文件列表下拉菜单
- 预计耗时：3 小时

### 第7步：测试编写

- useTabStore 全部 actions 测试
- TabBar/TabItem 组件渲染测试
- 关闭策略边界测试
- 确保覆盖率 ≥ 80%
- 预计耗时：3 小时

## 完成标准

**本任务完成的标志：**

1. 多 Tab 系统完整可用，支持打开/关闭/切换/排序/固定
2. `appStore` 的 `openFiles`/`currentFile` 已标记 `@deprecated`
3. 测试覆盖率 ≥ 80%，ESLint 通过
4. 代码审查通过

**交付物：**

- [ ] `src/renderer/store/tabStore.ts` — Tab 状态管理 store
- [ ] `src/renderer/components/layout/TabBar.tsx` — Tab 栏容器
- [ ] `src/renderer/components/layout/TabItem.tsx` — 单个 Tab 组件
- [ ] `src/renderer/components/layout/TabContextMenu.tsx` — Tab 右键菜单
- [ ] `src/renderer/components/layout/CloseConfirmDialog.tsx` — 未保存确认
- [ ] `src/renderer/store/appStore.ts` — 更新（@deprecated 标记）
- [ ] `src/renderer/__tests__/tabStore.test.ts` — Store 测试
- [ ] `src/renderer/__tests__/TabBar.test.tsx` — 组件测试

## 备注

- Tab ID 使用文件的 workspace-relative 路径作为唯一标识，与 `FileTreeNode.path` 保持一致
- `useTabStore` 不使用 `persist` 中间件 — Tab 状态是会话级的，应用重启后从空开始
- 固定 Tab 的行为参考 VS Code：固定 Tab 排在最前、不显示关闭按钮（需右键取消固定后才能关闭）、宽度更窄
- 如果将来需要 Tab 持久化（"恢复上次打开的文件"），只需在 `useTabStore` 上添加 `persist` 中间件即可，架构已预留

---

**创建时间：** 2026-03-31
**最后更新：** 2026-03-31
**更新记录：**
- 2026-03-31 - 初始创建
