# PHASE1-TASK002: WYSIWYG 编辑器集成 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task002_wysiwyg-editor.md](../specs/tasks/phase1/phase1-task002_wysiwyg-editor.md)
> 创建日期：2026-04-16
> 最后更新：2026-04-16

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK002 |
| **任务标题** | WYSIWYG 编辑器集成 |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | ✅ Phase0 FileManager、✅ Phase0 IPC、✅ Phase0 SyncManager |

### 目标

集成 Tiptap v2 富文本编辑器，替换当前 `StudioEditorPanel` 中基于 `react-markdown` 的只读预览，实现 Markdown 文件的所见即所得编辑体验。核心交付物包括：Tiptap 编辑器核心、Markdown 双向转换、工具栏、斜杠命令、代码块语法高亮、表格编辑、气泡菜单、自动保存、只读模式。

### 范围边界

**包含：**
- Tiptap 编辑器核心集成（StarterKit + 全部扩展）
- Markdown ↔ 富文本双向转换（`tiptap-markdown`）
- 工具栏（固定顶部，Notion 风格）
- 斜杠命令菜单（`/` 触发）
- 代码块语法高亮（lowlight）
- 表格编辑（插入/删除行列）
- 气泡菜单（选中文本浮动工具栏）
- 文件加载（`file:read`）与自动保存（`file:write` + 1s 防抖）
- 编辑器状态管理（脏标记、保存状态）
- 只读模式支持

**不包含：**
- 实时协同编辑（CRDT/OT）
- 图片上传与管理
- AI 辅助写作
- 评论与批注
- 版本对比 diff 视图

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 路径 | 关键约束 |
|------|------|---------|
| 项目宪法 | `CLAUDE.md` | TypeScript 严格模式禁止 any；文件即真相；Git 不可见；注释英文/commit 中文 |
| 系统架构 | `specs/design/architecture.md` | 渲染进程禁止直接访问文件系统；IPC 通信严格隔离；Tiptap v2 为选型编辑器 |
| UI/UX 规范 | `specs/design/ui-ux-design.md` | 品牌色 Indigo-500；H1 28px/H2 24px/H3 20px/正文 15px；>2s 操作需进度反馈；快捷键 ⌘S 保存 |
| 数据模型与 API | `specs/design/data-and-api.md` | `ipc:file:read` / `ipc:file:write` 通道定义；`FileContent` / `FileWriteOptions` 类型 |
| 任务规格 | `specs/tasks/phase1/phase1-task002_wysiwyg-editor.md` | 10 个实施步骤、14 条功能验收标准、5 类测试标准 |

### 2.2 Skill 依赖

| Skill | 路径 | 使用场景 |
|-------|------|---------|
| tiptap-wysiwyg-editor | `.kilocode/skills/phase1/tiptap-wysiwyg-editor/SKILL.md` | Tiptap 集成模式、Markdown 双向转换、自定义扩展开发、IPC 文件操作 Hook、性能优化策略 |
| zustand-state-management | `.kilocode/skills/phase1/zustand-state-management/SKILL.md` | editorStore 设计；selector 优化脏标记/保存状态的重渲染控制 |
| vercel-react-best-practices | `.kilocode/skills/common/vercel-react-best-practices/SKILL.md` | EditorToolbar memo 优化；useCallback 稳定引用；re-render 最小化 |
| typescript-strict-mode | `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` | 严格类型守卫；泛型约束编辑器 Props/State |
| electron-ipc-patterns | `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` | `file:read`/`file:write` IPC 调用封装；错误处理模式；超时管理 |
| frontend-design | `.kilocode/skills/common/frontend-design/SKILL.md` | 编辑器 Notion 风格 UI 设计 |
| ui-ux-pro-max | `.kilocode/skills/common/ui-ux-pro-max/SKILL.md` | 编辑器组件设计系统（色彩、间距、圆角） |

### 2.3 前置代码依赖

| 模块 | 路径 | 状态 | 说明 |
|------|------|------|------|
| FileManager | `src/main/services/file-manager.ts` | ✅ 已完成 | 文件读写、原子写入、路径验证 |
| FileHandler IPC | `src/main/ipc/handlers/file.handler.ts` | ✅ 已完成 | `file:read/write/exists` 全部暴露 |
| Preload API | `src/preload/index.ts` | ✅ 已完成 | `window.electronAPI.file.*` 全部可用 |
| 共享类型 | `src/shared/types.ts` | ✅ 已完成 | `FileContent`、`IPCResponse`、`FileWriteOptions` |
| appStore | `src/renderer/store/appStore.ts` | ✅ 已完成 | `currentFile`、`openFiles`、`setCurrentFile` |
| StudioEditorPanel | `src/renderer/components/studio/StudioEditorPanel.tsx` | ✅ 已完成 | 当前使用 `react-markdown` 只读预览，需替换为 Tiptap |
| WorkspaceStudioPage | `src/renderer/pages/WorkspaceStudioPage.tsx` | ✅ 已完成 | 编辑器挂载容器、自动保存逻辑、文件监听 |
| vitest renderer config | `vitest.renderer.config.ts` | ✅ 已完成 | jsdom 环境、`tests/renderer/**/*.test.{ts,tsx}` |

### 2.4 被依赖任务

| 任务 | 依赖方式 |
|------|---------|
| PHASE1-TASK003（多 Tab 系统） | 编辑器嵌入 Tab 面板，每个 Tab 对应一个编辑器实例 |
| Sprint 2 版本历史 | 需编辑器支持只读模式展示历史版本 |
| Sprint 3 AI 系统 | 需编辑器支持 AI 插入/替换内容（`editor.commands.insertContent`） |

### 2.5 npm 依赖（需新增）

| 包名 | 版本 | 用途 |
|------|------|------|
| `@tiptap/react` | ^2.x | 编辑器 React 绑定（`useEditor`、`EditorContent`） |
| `@tiptap/starter-kit` | ^2.x | 基础扩展包（Heading/Bold/Italic/Strike/Code/Blockquote/List/History 等） |
| `@tiptap/pm` | ^2.x | ProseMirror 类型依赖 |
| `tiptap-markdown` | ^0.8.x | Markdown 序列化/反序列化扩展 |
| `@tiptap/extension-table` | ^2.x | 表格节点 |
| `@tiptap/extension-table-row` | ^2.x | 表格行 |
| `@tiptap/extension-table-cell` | ^2.x | 表格单元格 |
| `@tiptap/extension-table-header` | ^2.x | 表格头单元格 |
| `@tiptap/extension-code-block-lowlight` | ^2.x | 代码块 + 语法高亮 |
| `lowlight` | ^3.x | 语法高亮引擎（统一到 lowlight v3） |
| `@tiptap/extension-link` | ^2.x | 链接支持 |
| `@tiptap/extension-placeholder` | ^2.x | 占位符文本 |
| `@tiptap/extension-task-list` | ^2.x | 任务列表 |
| `@tiptap/extension-task-item` | ^2.x | 任务列表项 |
| `@tiptap/extension-typography` | ^2.x | 智能排版 |
| `@tiptap/extension-character-count` | ^2.x | 字符/字数统计 |
 | `@tiptap/suggestion` | ^2.x | 斜杠命令 suggestion 插件 |

---

## 三、现有代码盘点与差距分析

> **关键发现：** 当前编辑器为 `react-markdown` 只读预览模式，不支持编辑。本任务需在现有 `StudioEditorPanel` 架构基础上，新增 `src/renderer/components/editor/` 独立模块，逐步替换只读预览为 Tiptap 富文本编辑器。

### 3.1 已有文件清单与功能覆盖

| 文件 | 路径 | 行数 | 功能覆盖 |
|------|------|------|---------|
| `StudioEditorPanel.tsx` | `src/renderer/components/studio/StudioEditorPanel.tsx` | 164 | ✅ Tab 栏渲染、文件切换、关闭按钮；⚠️ 内容区为 `react-markdown` 只读渲染，无编辑能力 |
| `types.ts` | `src/renderer/components/studio/types.ts` | 50 | ✅ `EditorMode`/`SaveStatus`/`OpenFileTab` 类型定义 |
| `appStore.ts` | `src/renderer/store/appStore.ts` | 317 | ✅ `currentFile`/`openFiles`/`setCurrentFile`/`addOpenFile`/`removeOpenFile` |
| `WorkspaceStudioPage.tsx` | `src/renderer/pages/WorkspaceStudioPage.tsx` | 1350 | ✅ 自动保存管线（`AUTOSAVE_DELAY_MS=900`）、文件加载、脏标记、文件监听 |
| `MainContent.tsx` | `src/renderer/components/layout/MainContent.tsx` | 36 | ✅ 编辑器挂载容器（flex-1 overflow-hidden） |
| `fileTreeStore.ts` | `src/renderer/store/fileTreeStore.ts` | 34 | ✅ 文件树状态，无编辑器依赖 |

### 3.2 编辑器组件目录：不存在

当前代码库中 **不存在** `src/renderer/components/editor/` 目录，也不存在任何 Tiptap 相关文件。这是一个从零构建的任务。

### 3.3 WorkspaceStudioPage 现有自动保存管线分析

`WorkspaceStudioPage` 已实现完整的自动保存管线，编辑器需与之对接：

```
现有管线：
editorContent (state)
  → onEditorContentChange回调
  → debouncedAutoSave (900ms)
  → window.electronAPI.file.write(path, content, { atomic: true })
  → SyncManager file watcher → git commit
```

编辑器集成后，该管线需调整：
- 内容源从 `textarea onChange` 改为 Tiptap `onUpdate` → `getMarkdown()`
- 脏标记从手动 `isDirty` state 改为 Tiptap `editor.isDirty` + editorStore
- 保存状态从页面级 state 迁移到 editorStore 统一管理

### 3.4 验收标准差距矩阵

| # | 验收标准 | 现状 | 差距 | 改进措施 |
|---|---------|------|------|---------|
| 1 | 打开 Markdown 文件后编辑器以富文本形式展示内容 | ❌ `react-markdown` 只读渲染 | 需替换为 Tiptap | Step 1-2 |
| 2 | 支持标题/粗体/斜体/删除线/内联代码 | ❌ 无编辑能力 | 需 StarterKit 全部扩展 | Step 1 |
| 3 | 支持无序/有序/任务列表 | ❌ 无编辑能力 | 需 List + TaskList 扩展 | Step 1 |
| 4 | 支持引用块 | ❌ 无编辑能力 | StarterKit 已含 | Step 1 |
| 5 | 支持代码块并有语法高亮 | ❌ 无编辑能力 | 需 lowlight 扩展 | Step 6 |
| 6 | 支持表格的插入和编辑 | ❌ 无编辑能力 | 需 Table 扩展 | Step 7 |
| 7 | 支持链接的插入和编辑 | ❌ 无编辑能力 | 需 Link 扩展 | Step 8 |
| 8 | 支持水平分割线 | ❌ 无编辑能力 | StarterKit 已含 | Step 1 |
| 9 | 斜杠命令可触发并正确执行 | ❌ 不存在 | 需 SlashCommand 扩展 | Step 5 |
| 10 | 工具栏按钮反映当前格式状态 | ❌ 不存在 | 需 EditorToolbar 组件 | Step 4 |
| 11 | 自动保存正常工作（1s 防抖） | ⚠️ 页面级 900ms 防抖已有 | 需迁移到编辑器 Hook | Step 3 |
| 12 | Ctrl/Cmd+S 立即保存 | ❌ 未实现 | 需键盘快捷键处理 | Step 3 |
| 13 | 保存后文件内容为标准 Markdown 格式 | ❌ 不适用 | 需 tiptap-markdown 序列化 | Step 2 |
| 14 | Markdown load→edit→save 循环无损 | ❌ 不存在 | 需转换保真度测试 | Step 2 + Step 10 |

### 3.5 关键差距总结

1. **编辑器组件体系缺失** — 需新建 `src/renderer/components/editor/` 整个目录
2. **Markdown 双向转换缺失** — 需集成 `tiptap-markdown` 扩展
3. **自动保存管线需迁移** — 从页面级 textarea 防抖迁移到 Tiptap `onUpdate` + `useAutoSave` Hook
4. **工具栏/斜杠命令/气泡菜单不存在** — 需全部新建
5. **代码块语法高亮/表格编辑不存在** — 需集成对应扩展
6. **编辑器状态管理缺失** — 需新建 editorStore（Zustand）
 7. **测试覆盖为零** — 需新建 `tests/renderer/` 下编辑器相关测试

---

## 四、架构设计

### 4.1 目标文件结构

```
src/renderer/
├── components/
│   ├── studio/
│   │   └── StudioEditorPanel.tsx      # [改造] Tab 栏保留，内容区替换为 WysiwygEditor
│   └── editor/                         # [新建] 编辑器组件目录
│       ├── WysiwygEditor.tsx           # 主编辑器组件（EditorProps 接口）
│       ├── EditorToolbar.tsx           # 固定顶部工具栏
│       ├── ToolbarButton.tsx           # 工具栏按钮（memo 优化）
│       ├── SlashCommandMenu.tsx        # 斜杠命令菜单（tippy.js 渲染）
│       ├── EditorBubbleMenu.tsx        # 选中文本浮动菜单
│       ├── TableInsertMenu.tsx         # 表格行列选择器
│       ├── CodeBlockLanguageSelect.tsx # 代码块语言下拉
│       ├── SaveStatusIndicator.tsx     # 保存状态指示器
│       ├── EditorErrorBoundary.tsx     # 编辑器错误边界
│       └── extensions/                 # 自定义 Tiptap 扩展
│           ├── slash-command.ts        # 斜杠命令 Extension
│           └── index.ts               # 扩展注册汇总
├── hooks/
│   ├── useAutoSave.ts                  # [新建] 自动保存 Hook（防抖 + Cmd+S + 卸载前保存）
│   └── useEditorState.ts              # [新建] 编辑器状态 Hook（脏标记 + 保存状态 + 字数统计）
├── store/
│   ├── appStore.ts                     # [保持] 无修改
│   ├── fileTreeStore.ts               # [保持] 无修改
│   └── editorStore.ts                 # [新建] 编辑器 Zustand store
├── styles/
│   └── editor.css                     # [新建] Tiptap/ProseMirror 样式（Notion 风格）
└── utils/
    └── cn.ts                          # [保持] clsx + tailwind-merge 工具

tests/renderer/
├── editor/
│   ├── markdown-roundtrip.test.ts     # Markdown 转换保真度测试
│   ├── useAutoSave.test.ts            # 自动保存 Hook 测试
│   ├── EditorToolbar.test.tsx         # 工具栏组件测试
│   ├── SlashCommandMenu.test.tsx      # 斜杠命令测试
│   └── editorStore.test.ts            # 编辑器 store 测试
```

### 4.2 组件架构图

```
StudioEditorPanel (studio层 — Tab管理)
├── TabBar (保留现有实现)
│   ├── OpenFileTab[]
│   └── + AI Button
└── WysiwygEditor (editor层 — 编辑核心)
    ├── EditorToolbar (固定顶部)
    │   ├── FormatButtons (粗体/斜体/删除线/代码)
    │   ├── HeadingSelect (H1-H6 下拉)
    │   ├── ListButtons (有序/无序/任务)
    │   ├── InsertButtons (代码块/表格/分割线/链接)
    │   └── SaveStatusIndicator (已保存/保存中/未保存)
    ├── EditorContent (Tiptap 渲染区)
    ├── EditorBubbleMenu (选中文本浮动)
    │   ├── 粗体/斜体/删除线/代码
    │   └── 链接编辑（展开 URL 输入框）
    ├── SlashCommandMenu (/ 触发弹出)
    │   └── 命令列表 + 模糊搜索 + 键盘导航
    └── useEditor (Tiptap Hook)
        ├── useAutoSave (防抖保存 + Cmd+S)
        └── editorStore (Zustand 状态)
```

### 4.3 数据模型

#### EditorProps（主编辑器组件接口）

```typescript
export interface EditorProps {
  filePath: string
  initialContent?: string
  readOnly?: boolean
  onDirtyChange?: (isDirty: boolean) => void
  onSave?: () => void
  className?: string
}
```

#### EditorState（editorStore 接口）

```typescript
interface EditorState {
  isDirty: boolean
  isSaving: boolean
  lastSavedAt: number | null
  wordCount: number
  characterCount: number
  loadError: string | null
  saveError: string | null

  setDirty: (dirty: boolean) => void
  setSaving: (saving: boolean) => void
  setSaved: () => void
  setLoadError: (error: string | null) => void
  setSaveError: (error: string | null) => void
  updateCounts: (words: number, chars: number) => void
  reset: () => void
}
```

#### SlashCommandItem（斜杠命令项）

```typescript
export interface SlashCommandItem {
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  command: (editor: Editor, range: Range) => void
  aliases?: string[]
}
```

#### AutoSaveOptions（自动保存配置）

```typescript
export interface AutoSaveOptions {
  enabled: boolean
  debounceMs: number
  onSave: (content: string) => Promise<void>
  onError: (error: Error) => void
}
```

### 4.4 IPC 调用映射

| 操作 | IPC 通道 | Preload 方法 | 说明 |
|------|---------|-------------|------|
| 加载文件 | `file:read` | `file.read(path, { encoding: 'utf-8' })` | Markdown → Tiptap content |
| 保存文件 | `file:write` | `file.write(path, markdown, { atomic: true })` | Tiptap → Markdown → 文件 |
| 检查文件 | `file:exists` | `file.exists(path)` | 切换文件前验证 |

### 4.5 数据流设计

```
用户输入
  → Tiptap onUpdate
  → editorStore.setDirty(true)
  → useAutoSave 防抖计时器启动 (1000ms)
  → 防抖结束: editor.storage.markdown.getMarkdown()
  → window.electronAPI.file.write(path, markdown, { atomic: true })
  → 成功: editorStore.setSaved() → 脏标记清除
  → 失败: editorStore.setSaveError(msg) → toast 提示

文件加载
  → WorkspaceStudioPage.onSelectFile(path)
  → window.electronAPI.file.read(path)
  → markdown 字符串
  → editor.commands.setContent(markdown)  (tiptap-markdown 解析)
  → editorStore.reset()

Cmd+S 手动保存
  → Tiptap addKeyboardShortcut('Mod-s')
  → useAutoSave.flush() (跳过防抖)
  → 立即执行保存流程
```

### 4.6 Tiptap 扩展注册策略

```typescript
const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3, 4, 5, 6] },
    codeBlock: false,  // 替换为 code-block-lowlight
    history: { depth: 100 },
  }),
  TiptapMarkdown,                          // Markdown 序列化
  Table.configure({ resizable: true }),
  TableRow,
  TableCell,
  TableHeader,
  CodeBlockLowlight.configure({ lowlight }),
  Link.configure({ openOnClick: false }),
  Placeholder.configure({ placeholder: '输入 / 打开命令菜单...' }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Typography,
  CharacterCount,
  SlashCommandExtension,                   // 自定义斜杠命令
]
```

 > **关键约束：** StarterKit 的 `codeBlock` 必须禁用（`codeBlock: false`），由 `CodeBlockLowlight` 替代，否则会产生 schema 冲突。

---

## 五、实施步骤（10 步渐进式交付）

### Step 1：Tiptap 安装与基础集成 [预估 3h]

**目标：** 安装全部 Tiptap 依赖包，创建最小可用的编辑器组件，验证扩展加载无冲突。

**操作：**

1. **安装 npm 依赖**
   ```bash
   npm install @tiptap/react @tiptap/starter-kit @tiptap/pm tiptap-markdown \
     @tiptap/extension-table @tiptap/extension-table-row \
     @tiptap/extension-table-cell @tiptap/extension-table-header \
     @tiptap/extension-code-block-lowlight lowlight \
     @tiptap/extension-link @tiptap/extension-placeholder \
     @tiptap/extension-task-list @tiptap/extension-task-item \
     @tiptap/extension-typography @tiptap/extension-character-count \
     @tiptap/suggestion
   ```

2. **创建 `WysiwygEditor.tsx`**
   - 使用 `useEditor()` Hook 创建编辑器实例
   - 加载 StarterKit + Markdown + Placeholder + CharacterCount + Link + TaskList + TaskItem + Typography
   - 暂不加载 Table/CodeBlockLowlight（Step 6-7 逐步添加）
   - 设置占位符："输入 / 打开命令菜单..."
   - `onUpdate` 回调触发 `editorStore.setDirty(true)` + `updateCounts()`

3. **创建 `editorStore.ts`**
   - Zustand store 管理 `isDirty`/`isSaving`/`lastSavedAt`/`wordCount`/`characterCount`/`loadError`/`saveError`
   - Actions: `setDirty`/`setSaving`/`setSaved`/`setLoadError`/`setSaveError`/`updateCounts`/`reset`
   - 使用 `devtools` 中间件便于调试

4. **创建 `editor.css`**
   - ProseMirror 基础样式（`outline-none`、行高、段落间距）
   - Notion 风格排版：H1 28px/H2 24px/H3 20px/正文 15px
   - 占位符样式（`p.is-editor-empty:first-child::before`）
   - 列表/引用/代码基础样式

5. **验证**
   - `WysiwygEditor` 可独立渲染（传入初始 Markdown 字符串）
   - 扩展加载无报错（Console 无 warning）
   - 基础编辑可用：输入文字、粗体、斜体、标题、列表

**交付物：**
- [x] `npm install` 完成，`package.json` 更新
- [x] `src/renderer/components/editor/WysiwygEditor.tsx` 创建
- [x] `src/renderer/store/editorStore.ts` 创建
- [x] `src/renderer/styles/editor.css` 创建

---

### Step 2：Markdown 双向转换 [预估 4h]

**目标：** 配置 `tiptap-markdown` 实现 Markdown ↔ Tiptap 内容的双向无损转换。

**操作：**

1. **配置 tiptap-markdown**
   - 在 `WysiwygEditor` 扩展列表中添加 `TiptapMarkdown` 扩展
   - 配置 `html: true`、`breaks: false`、`linkify: true`
   - 验证 `editor.storage.markdown.getMarkdown()` 可正确输出

2. **加载流程**
   - `file:read` → Markdown 字符串 → `editor.commands.setContent(markdown)`
   - `tiptap-markdown` 自动将 Markdown 解析为 ProseMirror 文档
   - 加载后清空编辑器历史栈：`editor.commands.clearContent(false)` 再 `setContent`

3. **保存流程**
   - `editor.storage.markdown.getMarkdown()` → Markdown 字符串
   - 防抖后调用 `file:write`

4. **编写转换保真度测试**
   - 创建 `tests/renderer/editor/markdown-roundtrip.test.ts`
   - 测试用例：
     - 空文件
     - 纯文本（中英文混合）
     - 标题 H1-H6
     - 粗体/斜体/删除线/内联代码
     - 有序/无序列表
     - 引用块
     - 代码块（无高亮）
     - 表格（GFM）
     - 链接
     - 水平分割线
     - 复杂嵌套格式
   - 断言：`load(markdown) → getMarkdown()` 输出与输入一致（或差异在可接受范围内）
   - 记录已知限制（如 GFM 表格的边距差异）

**交付物：**
- [x] `WysiwygEditor.tsx` 集成 tiptap-markdown
- [x] `tests/renderer/editor/markdown-roundtrip.test.ts` 创建

---

### Step 3：文件加载与自动保存 [预估 3h]

**目标：** 实现 `useAutoSave` Hook 和文件加载逻辑，对接 `file:read`/`file:write` IPC。

**操作：**

1. **创建 `useAutoSave.ts`**
   - 参数：`editor` 实例、`filePath`、`AutoSaveOptions`
   - 防抖保存：`onUpdate` 触发后启动 1000ms 计时器
   - 计时器到期：`editor.storage.markdown.getMarkdown()` → `onSave(markdown)`
   - 保存成功：`editorStore.setSaved()` → 清除脏标记 → 更新 `lastSavedAt`
   - 保存失败：`editorStore.setSaveError(msg)` → 保留脏标记
   - 中文输入法处理：监听 `compositionstart`/`compositionend`，composition 期间不触发保存

2. **Cmd+S 快捷键**
   - 在 Tiptap 扩展中注册 `addKeyboardShortcut('Mod-s')`
   - 调用 `useAutoSave.flush()` 跳过防抖，立即保存
   - 阻止浏览器默认行为（`preventDefault`）

3. **卸载前保存**
   - `useEffect` cleanup 中检查 `editor.isDirty`
   - 如有未保存内容，同步调用 `onSave`
   - 使用 `beforeunload` 事件作为额外保障

4. **文件加载**
   - 在 `WysiwygEditor` 的 `useEffect([filePath])` 中：
     - 调用 `window.electronAPI.file.read(filePath)`
     - 成功：`editor.commands.setContent(markdown)` → `editorStore.reset()`
     - 失败：`editorStore.setLoadError(msg)` → 显示错误页面 + 重试按钮

5. **SaveStatusIndicator 组件**
   - 读取 `editorStore` 中的 `isSaving`/`lastSavedAt`/`isDirty`
   - 显示状态："已保存 ✓" / "保存中..." / "未保存 ●"
   - 使用 UI 规范色彩：Emerald 已保存、Blue 保存中、Amber 未保存

**交付物：**
- [x] `src/renderer/hooks/useAutoSave.ts` 创建
- [x] `src/renderer/components/editor/SaveStatusIndicator.tsx` 创建
- [x] `WysiwygEditor.tsx` 集成文件加载 + 自动保存

---

### Step 4：编辑器工具栏 [预估 4h]

**目标：** 创建 Notion 风格的固定顶部工具栏，按钮状态与光标位置联动。

**操作：**

1. **创建 `ToolbarButton.tsx`**
   - `React.memo` 包裹，接收 `active`/`disabled`/`onClick`/`title`/`icon`
   - Notion 风格样式：
     - 默认：`text-gray-400 hover:text-gray-200 hover:bg-white/5`
     - 激活：`bg-white/10 text-white`
     - 禁用：`opacity-30 cursor-not-allowed`
   - 圆角 `rounded-md`，大小 `p-1.5`

2. **创建 `EditorToolbar.tsx`**
   - 接收 `editor` 实例作为 prop
   - 按钮分组（用分割线隔开）：
     - 文本格式：粗体(B) / 斜体(I) / 删除线(S) / 内联代码(`)
     - 标题：H1 / H2 / H3（或下拉选择 H1-H6）
     - 列表：无序(•) / 有序(1.) / 任务(☐)
     - 插入：代码块(```) / 表格(⊞) / 分割线(—) / 链接(🔗)
     - 保存状态：`<SaveStatusIndicator />`
   - 按钮激活状态使用 `editor.isActive('bold')` / `editor.isActive('heading', { level: 2 })` 等
   - 禁用状态使用 `editor.can().chain().focus().toggleBold().run()` 检查
   - 点击使用 `editor.chain().focus().toggleBold().run()` 链式调用

3. **集成到 WysiwygEditor**
   - 工具栏固定在编辑器顶部
   - 使用 `useEditorState` (Tiptap v2) 或 `editor.on('transaction')` 驱动工具栏状态更新
   - 避免每次 transaction 都重渲染：使用 `editor.on('selectionUpdate')` 仅在选择变化时更新

4. **性能优化**
   - `EditorToolbar` 使用 `React.memo`
   - 按钮点击回调使用 `useCallback` 稳定引用
   - 工具栏状态更新频率：仅 selection 变化时，非每次 transaction

**交付物：**
- [x] `src/renderer/components/editor/ToolbarButton.tsx` 创建
- [x] `src/renderer/components/editor/EditorToolbar.tsx` 创建
 - [x] `WysiwygEditor.tsx` 集成工具栏

---

### Step 5：斜杠命令菜单 [预估 4h]

**目标：** 实现输入 `/` 触发的命令菜单，支持模糊搜索和键盘导航。

**操作：**

1. **创建 `extensions/slash-command.ts`**
   - 使用 `Extension.create()` + `@tiptap/suggestion` 插件
   - 触发字符：`/`
   - `items({ query })` 返回过滤后的命令列表
   - 命令执行后 `deleteRange(range)` 清除 `/` 字符
   - 支持别名（aliases）搜索

2. **命令列表定义**

   | 命令 | 描述 | Tiptap 命令 |
   |------|------|------------|
   | 段落 | 普通文本 | `setParagraph()` |
   | 标题 1 | 大标题 | `setHeading({ level: 1 })` |
   | 标题 2 | 中标题 | `setHeading({ level: 2 })` |
   | 标题 3 | 小标题 | `setHeading({ level: 3 })` |
   | 无序列表 | 圆点列表 | `toggleBulletList()` |
   | 有序列表 | 数字列表 | `toggleOrderedList()` |
   | 任务列表 | 待办事项 | `toggleTaskList()` |
   | 引用块 | 引用文本 | `toggleBlockquote()` |
   | 代码块 | 代码片段 | `toggleCodeBlock()` |
   | 表格 | 插入表格 | `insertTable({ rows: 3, cols: 3 })` |
   | 分割线 | 水平线 | `setHorizontalRule()` |

3. **创建 `SlashCommandMenu.tsx`**
   - 由 `@tiptap/suggestion` 的 `render` 回调驱动显示/隐藏
   - 使用绝对定位，跟随光标位置
   - 模糊搜索：`query` 过滤 `title` + `aliases`
   - 键盘导航：`↑`/`↓` 选择、`Enter` 确认、`Escape` 关闭
   - 最大高度 320px，超出滚动
   - 每个命令项显示：图标 + 标题 + 描述
   - Notion 风格：暗色背景 `bg-[#1D1F23]`、选中项 `bg-white/10`

4. **渲染方式**
   - `@tiptap/suggestion` 的 `render` 回调接收 `props`/`editor`/`range`
   - 使用 React Portal 或 tippy.js 渲染菜单（建议直接用 React state 控制）
   - 菜单组件通过 ref 暴露 `onKeyDown` 方法给 suggestion 插件

**交付物：**
- [x] `src/renderer/components/editor/extensions/slash-command.ts` 创建
- [x] `src/renderer/components/editor/SlashCommandMenu.tsx` 创建

---

### Step 6：代码块语法高亮 [预估 2h]

**目标：** 集成 `CodeBlockLowlight` 扩展，实现代码块语法高亮和语言选择。

**操作：**

1. **集成 CodeBlockLowlight**
   - 在 `WysiwygEditor` 扩展列表中替换 StarterKit 的 `codeBlock: false`
   - 添加 `CodeBlockLowlight.configure({ lowlight })`
   - 配置 lowlight：按需注册常用语言
   ```typescript
   import { lowlight } from 'lowlight'
   import javascript from 'highlight.js/lib/languages/javascript'
   import typescript from 'highlight.js/lib/languages/typescript'
   import python from 'highlight.js/lib/languages/python'
   import json from 'highlight.js/lib/languages/json'
   import markdown from 'highlight.js/lib/languages/markdown'
   import css from 'highlight.js/lib/languages/css'
   import html from 'highlight.js/lib/languages/xml'
   import sql from 'highlight.js/lib/languages/sql'
   import bash from 'highlight.js/lib/languages/bash'

   lowlight.registerLanguage('javascript', javascript)
   lowlight.registerLanguage('typescript', typescript)
   // ... 其他语言
   ```

2. **创建 `CodeBlockLanguageSelect.tsx`**
   - 代码块顶部显示语言标签
   - 点击展开下拉菜单选择语言
   - 语言列表：TypeScript, JavaScript, Python, JSON, Markdown, CSS, HTML, SQL, Bash
   - 选择后调用 `editor.commands.updateAttributes('codeBlock', { language: lang })`

3. **代码块样式**
   - 暗色背景 `bg-[#0D0D0D]`、`rounded-lg`、`p-4`
   - 使用 `highlight.js` 的暗色主题 CSS（如 `github-dark`）
   - 代码块内 Tab 键输入制表符：`Tab` 快捷键 → `editor.commands.insertContent('\t')`

**交付物：**
- [x] `WysiwygEditor.tsx` 集成 CodeBlockLowlight
- [x] `src/renderer/components/editor/CodeBlockLanguageSelect.tsx` 创建

---

### Step 7：表格编辑 [预估 3h]

**目标：** 集成 Tiptap Table 扩展系列，实现表格插入和基础编辑操作。

**操作：**

1. **集成 Table 扩展**
   - 在 `WysiwygEditor` 扩展列表中添加 `Table`/`TableRow`/`TableCell`/`TableHeader`
   - 配置 `Table.configure({ resizable: true })`
   - 添加 Tiptap 表格所需 CSS

2. **创建 `TableInsertMenu.tsx`**
   - 点击工具栏表格按钮 → 显示网格选择器（类似 Notion 5×5 网格）
   - 鼠标悬停高亮选中区域
   - 点击后调用 `editor.commands.insertTable({ rows, cols, withHeaderRow: true })`

3. **表格操作**
   - 右键菜单或工具栏按钮：
     - 添加行（上方/下方）
     - 添加列（左侧/右侧）
     - 删除行/列
     - 删除表格
   - Tab 键在单元格间导航
   - 单元格内支持富文本格式

4. **表格样式**
   - 边框：`border border-sys-darkBorder`
   - 表头：`bg-white/5 font-semibold`
   - 单元格：`p-2 min-w-[80px]`
   - 选中单元格：`bg-indigo-500/20`

**交付物：**
- [x] `WysiwygEditor.tsx` 集成 Table 扩展
- [x] `src/renderer/components/editor/TableInsertMenu.tsx` 创建

---

### Step 8：气泡菜单 [预估 2h]

**目标：** 实现选中文本时出现的浮动工具栏，提供快捷格式化和链接编辑。

**操作：**

1. **创建 `EditorBubbleMenu.tsx`**
   - 使用 Tiptap 内置的 `BubbleMenu` 组件
   - 触发条件：选中非空文本时显示
   - 功能按钮：粗体 / 斜体 / 删除线 / 内联代码 / 链接
   - 按钮激活状态与光标位置一致
   - Notion 风格样式：暗色圆角浮层 `bg-[#1D1F23] shadow-xl rounded-lg`

2. **链接编辑交互**
   - 点击链接按钮：
     - 如已有链接：显示 URL，可编辑
     - 如无链接：展开 URL 输入框
   - 确认：`editor.chain().focus().setLink({ href: url }).run()`
   - 取消/移除：`editor.chain().focus().unsetLink().run()`

3. **集成到 WysiwygEditor**
   - 在 `EditorContent` 下方添加 `<BubbleMenu>` 组件
   - `shouldShow` 条件：`state.selection.empty === false && state.selection instanceof TextSelection`

**交付物：**
- [x] `src/renderer/components/editor/EditorBubbleMenu.tsx` 创建
 - [x] `WysiwygEditor.tsx` 集成气泡菜单

---

### Step 9：StudioEditorPanel 集成 + 样式打磨 + 只读模式 [预估 3h]

**目标：** 将 WysiwygEditor 集成到 StudioEditorPanel，完成 Notion 风格样式打磨，实现只读模式。

**操作：**

1. **改造 `StudioEditorPanel.tsx`**
   - Tab 栏保留现有实现（`OpenFileTab[]` + 关闭按钮 + + AI 按钮）
   - 内容区从 `<ReactMarkdown>` 替换为 `<WysiwygEditor>`
   - 传递 props：`filePath`、`initialContent={editorContent}`、`readOnly={editorMode === 'preview'}`、`onDirtyChange`、`onSave`
   - 保留 `ConflictResolutionPanel` 不变

2. **WorkspaceStudioPage 适配**
   - 将页面级 `editorContent`/`isDirty`/`saveStatus` 管理迁移到 editorStore
   - `onEditorContentChange` 回调改为更新 editorStore
   - 自动保存管线从页面防抖改为调用 `useAutoSave` 的 `flush()` 方法
   - 文件切换时通过 editorStore 重置状态

3. **只读模式**
   - `WysiwygEditor` 接收 `readOnly` prop
   - `readOnly=true` 时：
     - `editor.setEditable(false)`
     - 隐藏工具栏和气泡菜单
     - 内容区仅展示，不可编辑
   - 用于后续版本历史查看、diff 预览等场景

4. **错误边界**
   - 创建 `EditorErrorBoundary.tsx`
   - 捕获编辑器渲染错误，显示友好提示 + 重试按钮
   - 内容损坏（Markdown 解析失败）时回退到纯文本模式

5. **样式打磨**
   - 编辑器整体样式调整：
     - 左右边距 `px-12`（Notion 风格大量留白）
     - 最大宽度 `max-w-3xl mx-auto`
     - 行高 `leading-[1.6]`
   - 暗色模式为主（当前 UI 全暗色），同时预留亮色模式 CSS 变量
   - 滚动条样式自定义（`scrollbar-thin`）

**交付物：**
- [x] `StudioEditorPanel.tsx` 改造（集成 WysiwygEditor）
- [x] `WorkspaceStudioPage.tsx` 适配（迁移到 editorStore）
- [x] `src/renderer/components/editor/EditorErrorBoundary.tsx` 创建
- [x] 只读模式实现

---

### Step 10：测试编写与质量验证 [预估 5h]

**目标：** 达到 ≥80% 测试覆盖率，通过 lint/typecheck。

**操作：**

1. **单元测试：Markdown 转换保真度**（Step 2 已创建骨架，此处完善）
   - `tests/renderer/editor/markdown-roundtrip.test.ts`
   - 空文件、纯文本（中英文）、标题 H1-H6、粗体/斜体/删除线/内联代码
   - 有序/无序列表、引用块、代码块、表格、链接、分割线
   - 复杂嵌套格式（列表中的引用、代码块中的特殊字符）
   - 断言 `load → getMarkdown` 往返一致

2. **单元测试：useAutoSave Hook**
   - `tests/renderer/editor/useAutoSave.test.ts`
   - 内容变化后 1s 内触发保存
   - 快速连续编辑只触发一次保存（防抖验证）
   - Cmd+S 立即保存（跳过防抖）
   - 保存失败后保留脏标记
   - 卸载前同步保存
   - 中文输入法 composition 期间不触发保存

3. **组件测试：EditorToolbar**
   - `tests/renderer/editor/EditorToolbar.test.tsx`
   - 按钮点击应用正确格式
   - 按钮激活状态与光标位置一致
   - 禁用状态正确

4. **组件测试：SlashCommandMenu**
   - `tests/renderer/editor/SlashCommandMenu.test.tsx`
   - `/` 触发菜单显示
   - 输入过滤正确匹配
   - 键盘导航（上下选择、Enter 确认、Escape 关闭）
   - 选择后编辑器内容正确变更

5. **Store 测试：editorStore**
   - `tests/renderer/editor/editorStore.test.ts`
   - 初始状态验证
   - setDirty / setSaving / setSaved 状态流转
   - reset 恢复初始状态
   - updateCounts 正确更新

6. **性能验证**
   - 10KB Markdown 文件加载 + 渲染 < 500ms
   - 编辑操作输入延迟 < 50ms
   - 自动保存写入 < 200ms

7. **质量检查**
   - `npm run type-check` 通过
   - `npm run lint` 通过
   - 测试覆盖率 ≥ 80%

**测试文件清单：**
- `tests/renderer/editor/markdown-roundtrip.test.ts`
- `tests/renderer/editor/useAutoSave.test.ts`
- `tests/renderer/editor/EditorToolbar.test.tsx`
- `tests/renderer/editor/SlashCommandMenu.test.tsx`
- `tests/renderer/editor/editorStore.test.ts`

---

## 六、风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| tiptap-markdown 转换损失（GFM 表格、嵌套列表） | 高 | 中 | Step 2 编写保真度测试套件，记录已知限制；必要时添加自定义 Turndown 规则补丁 |
| Tiptap 扩展冲突（StarterKit codeBlock vs CodeBlockLowlight） | 高 | 低 | StarterKit 显式禁用 `codeBlock: false`；逐个添加扩展验证 |
| 中文输入法 composition 事件与自动保存冲突 | 中 | 中 | useAutoSave 监听 compositionstart/end，composition 期间暂停防抖计时器 |
| lowlight 语言包体积过大 | 低 | 中 | 按需注册 9 种常用语言，不使用 `lowlight.all()` 全量加载 |
| 工具栏频繁重渲染影响性能 | 中 | 中 | 仅监听 `selectionUpdate` 而非 `transaction`；React.memo + useCallback |
| WorkspaceStudioPage 改造引发回归 | 高 | 低 | 分步改造，保留旧 props 接口兼容；每步验证页面正常 |

---

## 七、时间线总览

| 步骤 | 内容 | 预估工时 | 累计 |
|------|------|---------|------|
| Step 1 | Tiptap 安装与基础集成 | 3h | 3h |
| Step 2 | Markdown 双向转换 | 4h | 7h |
| Step 3 | 文件加载与自动保存 | 3h | 10h |
| Step 4 | 编辑器工具栏 | 4h | 14h |
| Step 5 | 斜杠命令菜单 | 4h | 18h |
| Step 6 | 代码块语法高亮 | 2h | 20h |
| Step 7 | 表格编辑 | 3h | 23h |
| Step 8 | 气泡菜单 | 2h | 25h |
| Step 9 | 集成 + 样式打磨 + 只读模式 | 3h | 28h |
| Step 10 | 测试编写与质量验证 | 5h | 33h |

**总计预估：33 小时（约 4-5 个工作日）**

---

## 八、验收清单

### 功能完整性

- [ ] 打开 Markdown 文件后编辑器以富文本形式展示内容
- [ ] 支持标题（H1-H6）、粗体、斜体、删除线、内联代码
- [ ] 支持无序列表、有序列表、任务列表
- [ ] 支持引用块
- [ ] 支持代码块并有语法高亮
- [ ] 支持表格的插入和编辑
- [ ] 支持链接的插入和编辑
- [ ] 支持水平分割线
- [ ] 斜杠命令可触发并正确执行
- [ ] 工具栏按钮反映当前格式状态
- [ ] 自动保存正常工作（1s 防抖）
- [ ] Ctrl/Cmd+S 立即保存
- [ ] 保存后文件内容为标准 Markdown 格式
- [ ] Markdown 经 load → edit（无修改）→ save 循环后内容无损

### 性能指标

- [ ] 10KB Markdown 文件加载 + 渲染 < 500ms
- [ ] 编辑操作（打字、格式化）输入延迟 < 50ms
- [ ] 自动保存写入 < 200ms（不阻塞 UI）

### 用户体验

- [ ] 占位符文本引导用户操作
- [ ] 保存状态指示器（保存中/已保存/未保存）
- [ ] 代码块语言选择器可用
- [ ] 表格操作直观
- [ ] 斜杠命令支持模糊搜索
- [ ] 气泡菜单在选中文本时自动出现

### 代码质量

- [ ] TypeScript strict mode 无错误
- [ ] ESLint 检查通过
- [ ] 测试覆盖率 ≥ 80%

---

## 九、交付物清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `sibylla-desktop/package.json` | 修改 | 新增 17 个 Tiptap 相关依赖 |
| `sibylla-desktop/src/renderer/components/editor/WysiwygEditor.tsx` | 新增 | 主编辑器组件 |
| `sibylla-desktop/src/renderer/components/editor/EditorToolbar.tsx` | 新增 | 固定顶部工具栏 |
| `sibylla-desktop/src/renderer/components/editor/ToolbarButton.tsx` | 新增 | 工具栏按钮（memo） |
| `sibylla-desktop/src/renderer/components/editor/SlashCommandMenu.tsx` | 新增 | 斜杠命令菜单 |
| `sibylla-desktop/src/renderer/components/editor/EditorBubbleMenu.tsx` | 新增 | 气泡菜单 |
| `sibylla-desktop/src/renderer/components/editor/TableInsertMenu.tsx` | 新增 | 表格行列选择器 |
| `sibylla-desktop/src/renderer/components/editor/CodeBlockLanguageSelect.tsx` | 新增 | 代码块语言下拉 |
| `sibylla-desktop/src/renderer/components/editor/SaveStatusIndicator.tsx` | 新增 | 保存状态指示器 |
| `sibylla-desktop/src/renderer/components/editor/EditorErrorBoundary.tsx` | 新增 | 错误边界 |
| `sibylla-desktop/src/renderer/components/editor/extensions/slash-command.ts` | 新增 | 斜杠命令扩展 |
| `sibylla-desktop/src/renderer/components/editor/extensions/index.ts` | 新增 | 扩展注册汇总 |
| `sibylla-desktop/src/renderer/store/editorStore.ts` | 新增 | 编辑器 Zustand store |
| `sibylla-desktop/src/renderer/hooks/useAutoSave.ts` | 新增 | 自动保存 Hook |
| `sibylla-desktop/src/renderer/hooks/useEditorState.ts` | 新增 | 编辑器状态 Hook |
| `sibylla-desktop/src/renderer/styles/editor.css` | 新增 | 编辑器 Notion 风格样式 |
| `sibylla-desktop/src/renderer/components/studio/StudioEditorPanel.tsx` | 改造 | 替换 react-markdown 为 WysiwygEditor |
| `sibylla-desktop/src/renderer/pages/WorkspaceStudioPage.tsx` | 调整 | 迁移到 editorStore |
| `sibylla-desktop/tests/renderer/editor/markdown-roundtrip.test.ts` | 新增 | Markdown 转换测试 |
| `sibylla-desktop/tests/renderer/editor/useAutoSave.test.ts` | 新增 | 自动保存测试 |
| `sibylla-desktop/tests/renderer/editor/EditorToolbar.test.tsx` | 新增 | 工具栏测试 |
| `sibylla-desktop/tests/renderer/editor/SlashCommandMenu.test.tsx` | 新增 | 斜杠命令测试 |
| `sibylla-desktop/tests/renderer/editor/editorStore.test.ts` | 新增 | store 测试 |

---

**创建时间：** 2026-04-16
**最后更新：** 2026-04-16
**更新记录：**
- 2026-04-16 — 创建实施计划，含 10 个步骤、差距分析、依赖矩阵、23 个交付物
