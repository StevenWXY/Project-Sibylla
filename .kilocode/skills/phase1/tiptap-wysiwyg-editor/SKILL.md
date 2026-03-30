---
name: tiptap-wysiwyg-editor
description: >-
  Tiptap v2 富文本编辑器集成与扩展最佳实践。当需要集成 Tiptap 编辑器到 React 应用、开发 ProseMirror 自定义扩展、实现 Markdown 双向转换、优化编辑器性能、创建自定义节点与标记、或处理编辑器与 Electron IPC 交互时使用此 skill。
license: MIT
metadata:
  category: development
  tags:
    - tiptap
    - prosemirror
    - wysiwyg
    - editor
    - react
    - typescript
---

# Tiptap WYSIWYG 编辑器集成

此 skill 提供基于 Tiptap v2 的富文本编辑器集成指南，涵盖 React 集成、ProseMirror 扩展开发、Markdown 双向转换、自定义节点与标记、编辑器性能优化等核心主题。

## 何时使用此 Skill

在以下场景中使用此 skill：

- 在 React + Electron 项目中集成 Tiptap v2 编辑器
- 开发 ProseMirror 自定义扩展（节点、标记、插件）
- 实现 Markdown 与富文本的双向转换
- 优化大文档的编辑器渲染性能
- 构建工具栏、浮动菜单、斜杠命令等编辑器 UI
- 处理编辑器内容与 Electron 主进程的 IPC 交互
- 实现文件的自动保存与版本历史预览

## 核心概念

### 1. Tiptap 架构模型

[Tiptap](https://tiptap.dev/) 是基于 [ProseMirror](https://prosemirror.net/) 的 WYSIWYG 编辑器框架，采用分层架构：

```
┌─────────────────────────────────────────────┐
│              Tiptap 高级 API                 │
│  - useEditor Hook                           │
│  - Extension 系统                            │
│  - 命令链式调用                               │
├─────────────────────────────────────────────┤
│             ProseMirror 核心                  │
│  - EditorState（不可变状态）                   │
│  - EditorView（DOM 渲染）                     │
│  - Transaction（状态变更）                     │
│  - Schema（文档模型定义）                      │
├─────────────────────────────────────────────┤
│             底层抽象                          │
│  - Node / Mark 定义                          │
│  - Plugin 系统                               │
│  - InputRule / PasteRule                     │
│  - Decoration                               │
└─────────────────────────────────────────────┘
```

**关键原则**：
- Tiptap 提供声明式的 Extension 接口，简化 ProseMirror 的使用
- ProseMirror 的 EditorState 是不可变的，所有修改通过 Transaction 进行
- Schema 定义了文档的合法结构，编辑器自动约束用户输入

### 2. React 集成

在 React + TypeScript 项目中集成 Tiptap：

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/pm
```

基础集成示例：

```typescript
// components/Editor.tsx
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect } from 'react';

interface EditorProps {
  initialContent: string;
  onContentChange: (content: string) => void;
  editable?: boolean;
}

export function Editor({ initialContent, onContentChange, editable = true }: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Starter kit includes common extensions:
        // heading, bold, italic, strike, code, codeBlock,
        // blockquote, bulletList, orderedList, listItem,
        // horizontalRule, hardBreak, history
        heading: {
          levels: [1, 2, 3, 4],
        },
        codeBlock: {
          HTMLAttributes: {
            class: 'code-block',
          },
        },
      }),
    ],
    content: initialContent,
    editable,
    // Content change callback with debounce handled externally
    onUpdate: ({ editor: updatedEditor }) => {
      const html = updatedEditor.getHTML();
      onContentChange(html);
    },
  });

  // Update content when prop changes (e.g., file switching)
  useEffect(() => {
    if (editor && initialContent !== editor.getHTML()) {
      editor.commands.setContent(initialContent, false);
    }
  }, [editor, initialContent]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  if (!editor) {
    return <div className="editor-loading">Loading editor...</div>;
  }

  return (
    <div className="editor-container">
      <EditorContent editor={editor} className="prose max-w-none" />
    </div>
  );
}
```

**最佳实践**：
- 使用 `useEditor` Hook 创建编辑器实例，确保与 React 生命周期正确集成
- `onUpdate` 回调会在每次内容变更时触发，对性能敏感操作应在外部进行防抖
- 切换文件时通过 `setContent` 更新内容，第二个参数 `false` 表示不触发 `onUpdate`
- 组件卸载时调用 `editor.destroy()` 释放资源

### 3. 工具栏与浮动菜单

构建编辑器工具栏和上下文菜单：

```typescript
// components/EditorToolbar.tsx
import { Editor } from '@tiptap/react';

interface ToolbarProps {
  editor: Editor;
}

export function EditorToolbar({ editor }: ToolbarProps) {
  return (
    <div className="editor-toolbar flex items-center gap-1 p-2 border-b border-gray-200">
      {/* Text formatting */}
      <ToolbarButton
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={!editor.can().chain().focus().toggleBold().run()}
        title="Bold"
      >
        B
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={!editor.can().chain().focus().toggleItalic().run()}
        title="Italic"
      >
        I
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        disabled={!editor.can().chain().focus().toggleStrike().run()}
        title="Strikethrough"
      >
        S
      </ToolbarButton>

      <div className="toolbar-divider w-px h-6 bg-gray-300 mx-1" />

      {/* Heading levels */}
      {[1, 2, 3].map((level) => (
        <ToolbarButton
          key={level}
          active={editor.isActive('heading', { level })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run()
          }
          title={`Heading ${level}`}
        >
          H{level}
        </ToolbarButton>
      ))}

      <div className="toolbar-divider w-px h-6 bg-gray-300 mx-1" />

      {/* List types */}
      <ToolbarButton
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        title="Bullet List"
      >
        UL
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        title="Ordered List"
      >
        OL
      </ToolbarButton>

      {/* Block elements */}
      <ToolbarButton
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        title="Blockquote"
      >
        Quote
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        title="Code Block"
      >
        Code
      </ToolbarButton>
    </div>
  );
}

interface ToolbarButtonProps {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}

function ToolbarButton({ active, onClick, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        px-2 py-1 rounded text-sm font-medium transition-colors
        ${active ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {children}
    </button>
  );
}
```

**最佳实践**：
- 使用 `editor.chain().focus()` 链式调用确保编辑器获得焦点
- 通过 `editor.isActive()` 检查当前格式状态，高亮活动按钮
- 使用 `editor.can()` 检查命令是否可用，禁用不可用的按钮
- 工具栏组件接收 `Editor` 实例作为 prop，保持与编辑器的解耦

### 4. Markdown 双向转换

Sibylla 以 Markdown 文件为存储格式，编辑器需要实现 Markdown 和 HTML 的双向转换：

```bash
npm install @tiptap/extension-link turndown @types/turndown
npm install showdown @types/showdown
```

```typescript
// utils/markdown-converter.ts
import TurndownService from 'turndown';
import Showdown from 'showdown';

// HTML → Markdown converter
const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined',
});

// Add custom rules for Sibylla-specific elements
turndownService.addRule('taskList', {
  filter: (node) => {
    return (
      node.nodeName === 'LI' &&
      node.parentElement?.getAttribute('data-type') === 'taskList'
    );
  },
  replacement: (content, node) => {
    const checkbox = (node as HTMLElement).querySelector('input[type="checkbox"]');
    const checked = checkbox?.hasAttribute('checked') ? 'x' : ' ';
    return `- [${checked}] ${content.trim()}\n`;
  },
});

// Markdown → HTML converter
const showdownConverter = new Showdown.Converter({
  tables: true,
  strikethrough: true,
  tasklists: true,
  ghCodeBlocks: true,
  simpleLineBreaks: false,
  openLinksInNewWindow: false,
});

export function htmlToMarkdown(html: string): string {
  return turndownService.turndown(html);
}

export function markdownToHtml(markdown: string): string {
  return showdownConverter.makeHtml(markdown);
}
```

在编辑器中使用转换器：

```typescript
// hooks/useMarkdownEditor.ts
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useRef } from 'react';
import { htmlToMarkdown, markdownToHtml } from '../utils/markdown-converter';

interface UseMarkdownEditorOptions {
  initialMarkdown: string;
  onMarkdownChange: (markdown: string) => void;
  debounceMs?: number;
}

export function useMarkdownEditor({
  initialMarkdown,
  onMarkdownChange,
  debounceMs = 300,
}: UseMarkdownEditorOptions) {
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();

  const editor = useEditor({
    extensions: [StarterKit],
    content: markdownToHtml(initialMarkdown),
    onUpdate: ({ editor: updatedEditor }) => {
      // Debounce Markdown conversion to avoid excessive processing
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      debounceTimer.current = setTimeout(() => {
        const html = updatedEditor.getHTML();
        const markdown = htmlToMarkdown(html);
        onMarkdownChange(markdown);
      }, debounceMs);
    },
  });

  // Load new Markdown content (e.g., when switching files)
  const setMarkdown = useCallback(
    (markdown: string) => {
      if (editor) {
        const html = markdownToHtml(markdown);
        editor.commands.setContent(html, false);
      }
    },
    [editor]
  );

  // Get current content as Markdown
  const getMarkdown = useCallback((): string => {
    if (!editor) return '';
    return htmlToMarkdown(editor.getHTML());
  }, [editor]);

  return { editor, setMarkdown, getMarkdown };
}
```

**最佳实践**：
- Markdown 是 Sibylla 的文件存储格式，编辑器内部使用 HTML/ProseMirror 文档模型
- 打开文件时将 Markdown 转换为 HTML 加载到编辑器
- 保存文件时将编辑器 HTML 转换回 Markdown
- 对 Markdown 转换进行防抖处理，避免频繁转换影响性能
- 自定义 Turndown 规则以支持 Sibylla 特有的文档元素

### 5. 自定义扩展开发

开发 ProseMirror 自定义节点和标记，以支持 Sibylla 特有的功能：

#### 5.1 自定义节点示例：文件引用块

```typescript
// extensions/file-reference.ts
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { FileReferenceView } from '../components/FileReferenceView';

// Custom node for embedding file references in documents
export const FileReference = Node.create({
  name: 'fileReference',

  group: 'block',

  atom: true, // Non-editable, single unit

  addAttributes() {
    return {
      filePath: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-file-path'),
        renderHTML: (attributes) => ({
          'data-file-path': attributes.filePath,
        }),
      },
      fileName: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-file-name'),
        renderHTML: (attributes) => ({
          'data-file-name': attributes.fileName,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="file-reference"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'file-reference' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileReferenceView);
  },

  addCommands() {
    return {
      insertFileReference:
        (attrs: { filePath: string; fileName: string }) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },
});
```

#### 5.2 自定义标记示例：AI 高亮

```typescript
// extensions/ai-highlight.ts
import { Mark, mergeAttributes } from '@tiptap/core';

// Mark for highlighting AI-suggested content
export const AIHighlight = Mark.create({
  name: 'aiHighlight',

  addAttributes() {
    return {
      type: {
        default: 'suggestion',
        parseHTML: (element) => element.getAttribute('data-ai-type'),
        renderHTML: (attributes) => ({
          'data-ai-type': attributes.type,
        }),
      },
      confidence: {
        default: 1.0,
        parseHTML: (element) => parseFloat(element.getAttribute('data-confidence') || '1'),
        renderHTML: (attributes) => ({
          'data-confidence': attributes.confidence,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-ai-highlight]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-ai-highlight': '',
        class: 'ai-highlight',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setAIHighlight:
        (attributes: { type: string; confidence: number }) =>
        ({ commands }) => {
          return commands.setMark(this.name, attributes);
        },
      unsetAIHighlight:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});
```

**最佳实践**：
- 自定义节点使用 `Node.create()`，自定义标记使用 `Mark.create()`
- 原子节点（`atom: true`）适合不可编辑的嵌入内容，如文件引用卡片
- 使用 `ReactNodeViewRenderer` 渲染复杂的自定义节点视图
- 通过 `addCommands()` 暴露命令给工具栏和快捷键使用
- 为自定义属性定义 `parseHTML` 和 `renderHTML` 方法，确保序列化/反序列化一致

### 6. 斜杠命令

实现编辑器内的斜杠命令菜单（类似 Notion）：

```typescript
// extensions/slash-commands.ts
import { Extension } from '@tiptap/core';
import Suggestion, { SuggestionOptions } from '@tiptap/suggestion';

interface CommandItem {
  title: string;
  description: string;
  icon: string;
  command: (props: { editor: Editor; range: Range }) => void;
}

const defaultCommands: CommandItem[] = [
  {
    title: 'Heading 1',
    description: 'Large section heading',
    icon: 'H1',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run();
    },
  },
  {
    title: 'Heading 2',
    description: 'Medium section heading',
    icon: 'H2',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run();
    },
  },
  {
    title: 'Bullet List',
    description: 'Create a simple bulleted list',
    icon: 'List',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: 'Task List',
    description: 'Track tasks with checkboxes',
    icon: 'CheckSquare',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    title: 'Code Block',
    description: 'Insert a code snippet',
    icon: 'Code',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: 'Blockquote',
    description: 'Insert a quote block',
    icon: 'Quote',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
];

export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: false,
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: CommandItem }) => {
          props.command({ editor, range });
        },
        items: ({ query }: { query: string }): CommandItem[] => {
          return defaultCommands.filter((item) =>
            item.title.toLowerCase().includes(query.toLowerCase())
          );
        },
      } as Partial<SuggestionOptions>,
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
```

**最佳实践**：
- 使用 `@tiptap/suggestion` 扩展实现命令菜单
- 支持模糊搜索过滤命令列表
- 在命令列表中提供清晰的标题、描述和图标
- 命令执行时先删除斜杠触发字符（`deleteRange(range)`）

### 7. 编辑器与 Electron IPC 集成

编辑器运行在渲染进程，文件操作通过 IPC 与主进程交互：

```typescript
// hooks/useFileEditor.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMarkdownEditor } from './useMarkdownEditor';

interface UseFileEditorOptions {
  filePath: string;
}

export function useFileEditor({ filePath }: UseFileEditorOptions) {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingContent = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  // Auto-save handler with debounce
  const handleSave = useCallback(
    async (markdown: string) => {
      pendingContent.current = markdown;

      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }

      saveTimer.current = setTimeout(async () => {
        if (pendingContent.current === null) return;

        setIsSaving(true);
        setError(null);

        try {
          // Write file through Electron IPC
          await window.electronAPI.writeFile(filePath, pendingContent.current);
          setLastSaved(Date.now());
          pendingContent.current = null;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown save error';
          setError(message);
          console.error('Failed to save file:', err);
        } finally {
          setIsSaving(false);
        }
      }, 1000); // 1 second debounce for auto-save
    },
    [filePath]
  );

  // Load file content from main process
  const [initialMarkdown, setInitialMarkdown] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadFile() {
      try {
        const content = await window.electronAPI.readFile(filePath);
        if (!cancelled) {
          setInitialMarkdown(content);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unknown load error';
          setError(message);
          console.error('Failed to load file:', err);
        }
      }
    }

    loadFile();

    return () => {
      cancelled = true;
    };
  }, [filePath]);

  const { editor, setMarkdown, getMarkdown } = useMarkdownEditor({
    initialMarkdown,
    onMarkdownChange: handleSave,
    debounceMs: 300,
  });

  return {
    editor,
    isSaving,
    lastSaved,
    error,
    setMarkdown,
    getMarkdown,
  };
}
```

**最佳实践**：
- 通过 `window.electronAPI` 调用主进程的文件操作（由 preload 脚本暴露）
- 自动保存使用 1 秒防抖，避免频繁写入
- 提供 `isSaving` 和 `error` 状态给 UI 显示保存指示器
- 文件切换时自动加载新文件内容
- 取消已过期的文件加载请求（通过 `cancelled` 标志）

### 8. 编辑器性能优化

处理大文档时的性能优化策略：

```typescript
// extensions/performance.ts
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// Virtual scrolling plugin for large documents
export const VirtualScroll = Extension.create({
  name: 'virtualScroll',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('virtualScroll'),
        props: {
          // Only render visible portion of the document
          decorations(state) {
            // Implementation depends on document structure
            // This is a simplified concept
            return DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
```

**性能优化策略**：

1. **防抖内容变更回调**：避免每次按键都触发 Markdown 转换和文件保存
2. **延迟加载扩展**：非核心扩展（如代码高亮、Markdown 快捷键）延迟加载
3. **文档分片渲染**：超大文档考虑分段渲染
4. **减少不必要的重新渲染**：
   ```typescript
   // Use React.memo for static toolbar buttons
   const MemoizedToolbar = React.memo(EditorToolbar);

   // Use useCallback for event handlers
   const handleContentChange = useCallback((content: string) => {
     // handle change
   }, []);
   ```
5. **合理使用 `editor.can()`**：仅在必要时检查命令可用性

### 9. TailwindCSS 编辑器样式

配合 TailwindCSS 的编辑器排版样式：

```css
/* styles/editor.css */

/* Editor container */
.editor-container {
  @apply relative w-full h-full overflow-auto;
}

/* ProseMirror base styles */
.ProseMirror {
  @apply outline-none min-h-full px-16 py-8;
}

.ProseMirror > * + * {
  @apply mt-4;
}

/* Headings */
.ProseMirror h1 {
  @apply text-3xl font-bold mt-8 mb-4;
}

.ProseMirror h2 {
  @apply text-2xl font-semibold mt-6 mb-3;
}

.ProseMirror h3 {
  @apply text-xl font-medium mt-4 mb-2;
}

/* Lists */
.ProseMirror ul {
  @apply list-disc pl-6;
}

.ProseMirror ol {
  @apply list-decimal pl-6;
}

.ProseMirror li {
  @apply my-1;
}

/* Code blocks */
.ProseMirror pre {
  @apply bg-gray-900 text-gray-100 rounded-lg p-4 my-4 overflow-x-auto;
}

.ProseMirror code {
  @apply bg-gray-100 text-gray-800 rounded px-1.5 py-0.5 text-sm font-mono;
}

/* Blockquotes */
.ProseMirror blockquote {
  @apply border-l-4 border-gray-300 pl-4 italic text-gray-600;
}

/* AI highlight */
.ProseMirror .ai-highlight {
  @apply bg-blue-50 border-b border-blue-300 border-dashed;
}

/* Placeholder */
.ProseMirror p.is-editor-empty:first-child::before {
  @apply text-gray-400 float-left h-0 pointer-events-none;
  content: attr(data-placeholder);
}
```

**最佳实践**：
- 使用 TailwindCSS 的 `@apply` 指令保持样式一致性
- 为 ProseMirror 提供清晰的排版样式（间距、字号、颜色）
- 使用 `prose` 类名配合 `@tailwindcss/typography` 插件可简化基础排版
- 为自定义节点（如 AI 高亮、文件引用）定义专属样式

## 与 Sibylla 架构的关系

- **文件即真相**：编辑器以 Markdown 文件为基础，所有内容最终存储为 `.md` 文件
- **AI 上下文引擎**：当前编辑的文件属于 L1（始终加载）上下文层
- **Git 版本控制**：编辑器保存触发 Git 自动提交（通过 IPC → 主进程 → GitAbstraction）
- **进程隔离**：编辑器运行在渲染进程，文件操作通过 IPC 委托给主进程

## 与现有 Skills 的关系

- 与 [`frontend-design`](../../common/frontend-design/SKILL.md) 互补：`frontend-design` 负责整体 UI 设计，此 skill 专注于编辑器实现
- 与 [`ui-ux-pro-max`](../../common/ui-ux-pro-max/SKILL.md) 互补：`ui-ux-pro-max` 提供设计系统，此 skill 负责编辑器组件的具体实现
- 与 [`electron-ipc-patterns`](../../phase0/electron-ipc-patterns/SKILL.md) 互补：编辑器通过 IPC 与主进程交互
- 与 [`vercel-react-best-practices`](../../common/vercel-react-best-practices/SKILL.md) 互补：编辑器组件遵循 React 最佳实践

## 常见问题

### 1. Markdown 转换丢失格式

**问题**：HTML → Markdown → HTML 往返转换后，部分格式丢失。

**解决方案**：
- 为 Turndown 添加自定义规则，处理 Sibylla 特有的节点类型
- 测试所有支持的格式的往返转换一致性
- 对于无法在 Markdown 中表示的格式，使用 HTML 内联标签保留

### 2. 编辑器在大文档中卡顿

**问题**：编辑超过 10000 字的文档时出现明显延迟。

**解决方案**：
- 增加 `onUpdate` 回调的防抖时间
- 延迟加载非必需的扩展
- 检查自定义扩展是否存在性能问题（如过度 DOM 查询）
- 考虑对超大文档禁用实时 Markdown 转换

### 3. 编辑器与 React 状态不同步

**问题**：外部状态变更后编辑器内容未更新。

**解决方案**：
- 使用 `editor.commands.setContent()` 显式更新内容
- 确保 `useEffect` 的依赖数组正确包含相关状态
- 避免直接操作 ProseMirror 的 DOM

## 参考资源

- [Tiptap 官方文档](https://tiptap.dev/docs/editor/introduction)
- [ProseMirror 指南](https://prosemirror.net/docs/guide/)
- [ProseMirror 参考](https://prosemirror.net/docs/ref/)
- [Tiptap StarterKit](https://tiptap.dev/docs/editor/extensions/functionality/starterkit)
- [Tiptap React 集成](https://tiptap.dev/docs/editor/getting-started/install/react)
- [Turndown - HTML to Markdown](https://github.com/mixmark-io/turndown)
- [Showdown - Markdown to HTML](https://github.com/showdownjs/showdown)

## 总结

遵循以下核心原则开发 Tiptap 编辑器：

1. **Markdown 优先**：Markdown 是存储格式，编辑器是渲染和编辑工具
2. **类型安全**：使用 TypeScript 严格模式定义编辑器接口和扩展
3. **进程隔离**：编辑器在渲染进程，文件操作在主进程，通过 IPC 通信
4. **性能意识**：防抖回调、延迟加载、减少不必要的重新渲染
5. **扩展性**：通过自定义节点和标记支持 Sibylla 特有功能
6. **用户体验**：提供保存状态反馈、错误提示、斜杠命令等交互增强
