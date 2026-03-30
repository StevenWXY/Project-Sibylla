# WYSIWYG 编辑器集成

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK002 |
| **任务标题** | WYSIWYG 编辑器集成 |
| **所属阶段** | Phase 1 - MVP 核心体验 (Sprint 1) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

集成 Tiptap 富文本编辑器，实现 Markdown 文件的所见即所得编辑体验。支持常用富文本格式（标题、列表、粗体、斜体、代码块、表格、链接等），并实现 Markdown ↔ 富文本的双向无损转换。

### 背景

Sibylla 的核心交互之一是"在 workspace 中编辑文档"。用户需要一个接近 Notion 体验的编辑器：
- 所见即所得，无需手动书写 Markdown 语法
- 底层存储为 Markdown 明文（设计哲学："文件即真相"）
- 支持代码块语法高亮、表格编辑等高级功能

Phase 0 已有 `file:read` / `file:write` IPC 通道，编辑器只需对接这两个通道即可加载和保存文件内容。

### 范围

**包含：**
- Tiptap 编辑器核心集成（StarterKit + 扩展）
- Markdown ↔ 富文本双向转换（tiptap-markdown）
- 工具栏（顶部浮动或固定）
- 斜杠命令（`/` 触发块类型选择）
- 代码块语法高亮（lowlight）
- 表格编辑（插入/删除行列、合并单元格）
- 文件加载（`file:read`）与自动保存（`file:write` + 防抖）
- 编辑器状态管理（脏标记、保存状态）
- 只读模式支持

**不包含：**
- 实时协同编辑（CRDT/OT）— 设计哲学明确排除
- 图片上传与管理（Phase 1 后续迭代）
- AI 辅助写作（Sprint 3 AI 系统）
- 评论与批注（Phase 2）
- 版本对比 diff 视图（Sprint 2）

## 技术要求

### 技术栈

- `@tiptap/react` ^2.x — 编辑器 React 绑定
- `@tiptap/starter-kit` — 基础扩展包（Document, Paragraph, Text, Bold, Italic, Strike, Code, Heading, Blockquote, BulletList, OrderedList, ListItem, HardBreak, HorizontalRule, History）
- `tiptap-markdown` — Markdown 序列化/反序列化
- `@tiptap/extension-table` — 表格支持
- `@tiptap/extension-table-row`
- `@tiptap/extension-table-cell`
- `@tiptap/extension-table-header`
- `@tiptap/extension-code-block-lowlight` — 代码块语法高亮
- `lowlight` — 语法高亮引擎
- `@tiptap/extension-link` — 链接支持
- `@tiptap/extension-placeholder` — 占位符文本
- `@tiptap/extension-task-list` — 任务列表（TODO）
- `@tiptap/extension-task-item`
- `@tiptap/extension-typography` — 智能排版（引号、破折号）

### 架构设计

```
Editor (主编辑器组件)
├── EditorContent (Tiptap 渲染区)
├── EditorToolbar (格式化工具栏)
│   ├── FormatButtons (粗体/斜体/删除线等)
│   ├── HeadingSelect (标题级别选择)
│   ├── ListButtons (有序/无序/任务列表)
│   ├── InsertMenu (代码块/表格/分割线等)
│   └── SaveStatus (保存状态指示器)
├── SlashCommandMenu (斜杠命令菜单)
├── BubbleMenu (选中文本浮动菜单)
└── useEditor (Hook: 编辑器实例管理)
    ├── useMarkdownSync (Hook: Markdown ↔ 编辑器同步)
    └── useAutoSave (Hook: 自动保存逻辑)
```

#### 核心类型定义

```typescript
// Editor component props
export interface EditorProps {
  filePath: string          // workspace-relative file path
  initialContent?: string   // markdown content (if already loaded)
  readOnly?: boolean
  onDirtyChange?: (isDirty: boolean) => void
  onSave?: () => void
  className?: string
}

// Editor state exposed to parent
export interface EditorState {
  isDirty: boolean
  isSaving: boolean
  lastSavedAt: number | null
  wordCount: number
  characterCount: number
}

// Slash command item
export interface SlashCommandItem {
  title: string
  description: string
  icon: React.ComponentType<{ size?: number }>
  command: (editor: TiptapEditor) => void
  aliases?: string[]
}

// Auto-save options
export interface AutoSaveOptions {
  enabled: boolean
  debounceMs: number    // default: 1000ms
  onSave: (content: string) => Promise<void>
  onError: (error: Error) => void
}
```

### 实现细节

#### 关键实现点

1. **Tiptap 编辑器初始化**
   - 使用 `useEditor()` Hook 创建编辑器实例
   - 加载全部扩展（StarterKit + 表格 + 代码块 + 链接 + 任务列表 + 排版 + Markdown）
   - 配置 Markdown 序列化器（`tiptap-markdown`）
   - 设置占位符文本："输入 / 打开命令菜单..."
   - 编辑器 `onUpdate` 回调触发脏标记 + 自动保存

2. **Markdown 双向转换**
   - 加载文件时：`file:read` → Markdown 字符串 → `editor.commands.setContent(markdown)` （通过 tiptap-markdown 解析）
   - 保存文件时：`editor.storage.markdown.getMarkdown()` → Markdown 字符串 → `file:write`
   - 转换质量要求：标准 Markdown 格式经 load → edit → save 循环后内容无损

3. **自动保存（useAutoSave Hook）**
   - 编辑器内容变化后启动 1000ms 防抖计时器
   - 防抖结束后获取 Markdown 内容，调用 `file:write` 保存
   - 保存成功后清除脏标记，更新 `lastSavedAt` 时间戳
   - 保存失败时显示 toast 错误提示，保留脏标记
   - Ctrl+S / Cmd+S 触发立即保存（跳过防抖）
   - 组件卸载前如有未保存内容，触发同步保存

4. **工具栏**
   - 固定在编辑器顶部
   - 按钮组：文本格式 | 标题 | 列表 | 插入 | 保存状态
   - 按钮激活状态反映当前光标所在格式
   - 响应式：窄屏时溢出按钮收入 `...` 下拉菜单
   - Notion 风格设计：简洁、低对比度图标

5. **斜杠命令**
   - 输入 `/` 在当前光标位置弹出命令菜单
   - 支持模糊搜索过滤
   - 键盘导航（↑↓ 选择，Enter 确认，Escape 关闭）
   - 命令列表：段落、标题1-3、无序列表、有序列表、任务列表、引用、代码块、表格、分割线
   - 选择命令后自动聚焦编辑器

6. **气泡菜单（BubbleMenu）**
   - 选中文本时在光标附近显示浮动工具栏
   - 功能：粗体、斜体、删除线、代码、链接
   - 链接编辑：点击后展开 URL 输入框

7. **代码块**
   - 语法高亮（lowlight 引擎）
   - 语言选择下拉菜单
   - 支持常用语言：TypeScript, JavaScript, Python, JSON, Markdown, CSS, HTML, SQL, Bash
   - 代码块内 Tab 键输入制表符（非焦点切换）

8. **表格编辑**
   - 插入表格时选择行列数
   - 右键菜单或工具栏操作：添加/删除行、添加/删除列
   - 单元格内支持富文本格式
   - Tab 键在单元格间导航

9. **编辑器与 Tab 系统联动**
   - 每个 Tab 对应一个编辑器实例
   - 切换 Tab 时保存当前编辑器状态、加载目标文件内容
   - Tab 的脏标记（未保存指示器）由编辑器 `isDirty` 驱动

10. **错误处理**
    - 文件加载失败：显示错误页面 + 重试按钮
    - 保存失败：toast 提示，保留内容不丢失
    - 内容损坏（Markdown 解析失败）：回退到纯文本模式

### 数据模型

无新增数据库模型。内容通过 `file:read` / `file:write` 直接操作 Markdown 文件。

### API 规范

复用 Phase 0 已有 IPC 通道：

| 操作 | IPC Channel | 参数 |
|------|------------|------|
| 读取文件内容 | `file:read` | `(path, { encoding: 'utf-8' })` |
| 写入文件内容 | `file:write` | `(path, markdownContent, { atomic: true })` |
| 检查文件存在 | `file:exists` | `(path)` |

## 验收标准

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
- [ ] ESLint 检查通过，无警告
- [ ] 所有公共函数有 JSDoc 注释
- [ ] 代码审查通过

## 测试标准

### 单元测试

**测试覆盖率目标：** ≥ 80%

**关键测试用例：**

1. **Markdown 转换**
   - 输入：各种 Markdown 格式的字符串
   - 预期输出：load → getMarkdown() 往返后内容一致
   - 边界条件：空文件、纯文本、复杂嵌套格式、中文内容

2. **useAutoSave Hook**
   - 内容变化后 1s 内触发保存
   - 快速连续编辑只触发一次保存（防抖验证）
   - Ctrl+S 立即保存
   - 保存失败后重试逻辑
   - 卸载前同步保存

3. **EditorToolbar**
   - 按钮点击应用正确格式
   - 按钮激活状态与光标位置一致
   - 禁用状态正确（如：非选中状态下链接按钮禁用）

4. **SlashCommandMenu**
   - `/` 触发菜单显示
   - 输入过滤正确匹配
   - 键盘导航（上下选择、Enter 确认、Escape 关闭）
   - 选择后编辑器内容正确变更

5. **编辑器状态**
   - 初始状态 isDirty = false
   - 编辑后 isDirty = true
   - 保存后 isDirty = false
   - wordCount / characterCount 准确

### 集成测试

**测试场景：**

1. 完整编辑流程：打开 Markdown 文件 → 编辑内容 → 自动保存 → 关闭 → 重新打开验证内容
2. 多格式保真度：创建包含所有支持格式的文档 → 保存 → 重新加载验证无损
3. 与 Tab 系统联动：切换 Tab 时编辑器内容正确切换，脏标记正确传递

### 端到端测试

E2E 测试在 Sprint 1 整体完成后统一编写。

## 依赖关系

### 前置依赖

- [x] PHASE0-TASK006 (本地文件系统管理模块) — file:read / file:write IPC
- [x] PHASE0-TASK012 (自动保存与隐式提交) — SyncManager 自动提交管线
- [ ] PHASE1-TASK003 (多 Tab 系统) — 编辑器嵌入 Tab 面板（可并行开发，后集成）

### 被依赖任务

- Sprint 2 版本历史 — 需编辑器支持只读模式展示历史版本
- Sprint 3 AI 系统 — 需编辑器支持 AI 插入/替换内容

### 阻塞风险

- `tiptap-markdown` 的 Markdown 保真度：某些边缘格式可能转换有损。需在实现中验证并记录已知限制。

## 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| tiptap-markdown 转换损失 | 高 | 中 | 编写转换保真度测试套件，记录已知限制 |
| Tiptap 扩展冲突 | 中 | 低 | 逐个添加扩展，每步验证 |
| 代码块 lowlight 包体积 | 低 | 中 | 按需加载语言包，不捆绑全部语言 |
| 中文输入法兼容性 | 中 | 中 | 使用 compositionstart/end 事件处理，实机测试 |

### 时间风险

Markdown 转换保真度测试和边缘 case 修复可能需要额外时间。建议优先完成核心编辑功能，表格和代码块作为第二优先级。

### 资源风险

Tiptap 核心开源免费，但某些高级扩展（如协同编辑）为付费版。本任务范围内全部使用开源扩展，无许可风险。

## 参考文档

- [`CLAUDE.md`](../../../CLAUDE.md) - 项目宪法（"文件即真相"原则）
- [`specs/design/ui-ux-design.md`](../../design/ui-ux-design.md) - UI/UX 设计规范
- [Tiptap 官方文档](https://tiptap.dev/docs) - 编辑器 API 参考
- [tiptap-markdown](https://github.com/aguingand/tiptap-markdown) - Markdown 扩展
- [`src/main/ipc/handlers/file.handler.ts`](../../../sibylla-desktop/src/main/ipc/handlers/file.handler.ts) - 文件 IPC Handler
- [`src/renderer/components/layout/MainContent.tsx`](../../../sibylla-desktop/src/renderer/components/layout/MainContent.tsx) - 编辑器挂载容器

## 实施计划

### 第1步：Tiptap 安装与基础集成

- 安装 `@tiptap/react`, `@tiptap/starter-kit`, `tiptap-markdown` 及所有扩展包
- 创建 `Editor` 组件，初始化 Tiptap 编辑器实例
- 配置 StarterKit + Markdown 扩展
- 验证基础编辑功能可用
- 预计耗时：3 小时

### 第2步：Markdown 双向转换

- 配置 tiptap-markdown 序列化/反序列化
- 实现 `useMarkdownSync` Hook（加载 → 设置内容，获取 → Markdown 字符串）
- 编写转换保真度测试
- 预计耗时：4 小时

### 第3步：文件加载与自动保存

- 实现 `useAutoSave` Hook（防抖、Ctrl+S、卸载前保存）
- 对接 `file:read` / `file:write` IPC
- 实现保存状态指示器
- 脏标记管理
- 预计耗时：3 小时

### 第4步：编辑器工具栏

- 创建 `EditorToolbar` 组件
- 实现格式按钮（粗体/斜体/删除线/代码/标题/列表/引用）
- 按钮激活状态联动
- Notion 风格 UI 设计
- 预计耗时：4 小时

### 第5步：斜杠命令菜单

- 创建 `SlashCommandMenu` 组件
- 实现 Tiptap `Extension.create()` 注册 `/` 快捷键
- 命令列表渲染 + 模糊搜索
- 键盘导航
- 预计耗时：4 小时

### 第6步：代码块增强

- 集成 `@tiptap/extension-code-block-lowlight`
- 配置 lowlight 语言包（按需加载）
- 代码块语言选择器 UI
- 预计耗时：2 小时

### 第7步：表格编辑

- 集成 `@tiptap/extension-table` 系列扩展
- 表格插入 UI（行列数选择）
- 表格操作菜单（添加/删除行列）
- 预计耗时：3 小时

### 第8步：气泡菜单

- 创建 `BubbleMenu` 组件（选中文本浮动工具栏）
- 链接编辑交互
- 预计耗时：2 小时

### 第9步：样式打磨与只读模式

- 编辑器整体样式调整（Notion 风格排版）
- 只读模式实现（readOnly prop）
- 错误状态页面
- 预计耗时：2 小时

### 第10步：测试编写

- Markdown 转换保真度测试套件
- useAutoSave Hook 测试
- EditorToolbar 组件测试
- SlashCommandMenu 组件测试
- 确保覆盖率 ≥ 80%
- 预计耗时：5 小时

## 完成标准

**本任务完成的标志：**

1. Tiptap 编辑器完整集成，支持所有列出的富文本格式
2. Markdown 双向转换无损（标准格式范围内）
3. 自动保存与手动保存均正常工作
4. 测试覆盖率 ≥ 80%，ESLint 通过
5. 代码审查通过

**交付物：**

- [ ] `src/renderer/components/editor/Editor.tsx` — 主编辑器组件
- [ ] `src/renderer/components/editor/EditorToolbar.tsx` — 工具栏
- [ ] `src/renderer/components/editor/SlashCommandMenu.tsx` — 斜杠命令
- [ ] `src/renderer/components/editor/BubbleMenu.tsx` — 气泡菜单
- [ ] `src/renderer/components/editor/extensions/` — 自定义扩展
- [ ] `src/renderer/hooks/useAutoSave.ts` — 自动保存 Hook
- [ ] `src/renderer/hooks/useMarkdownSync.ts` — Markdown 同步 Hook
- [ ] `src/renderer/__tests__/Editor.test.tsx` — 编辑器测试
- [ ] `src/renderer/__tests__/useAutoSave.test.ts` — 自动保存测试

## 备注

- Tiptap 的 `StarterKit` 已包含 Undo/Redo（History 扩展），无需额外集成
- `tiptap-markdown` 对 GFM 表格的支持可能有限，需实测后记录限制
- 编辑器的样式需与 Notion 风格保持一致：大量留白、舒适行高、简洁的格式标记
- 自动保存的 Markdown 写入会被 SyncManager 的文件 watcher 自动捕获，触发 git 提交
- 中文输入法的 composition 事件需要在 autoSave 的防抖中特殊处理（composition 期间不触发保存）

---

**创建时间：** 2026-03-31
**最后更新：** 2026-03-31
**更新记录：**
- 2026-03-31 - 初始创建
