---
name: zustand-state-management
description: >-
  Zustand 轻量状态管理最佳实践。当需要设计 Zustand store 结构、实现 TypeScript 严格类型安全的状态管理、使用中间件（persist、devtools、immer）、优化 React 组件的选择性重渲染（selector、shallow）、或在 Electron 渲染进程中管理复杂应用状态时使用此 skill。
license: MIT
metadata:
  category: development
  tags:
    - zustand
    - state-management
    - react
    - typescript
    - electron
---

# Zustand 轻量状态管理

此 skill 提供基于 Zustand 的状态管理最佳实践指南，涵盖 store 设计模式、TypeScript 类型安全集成、中间件使用、性能优化、与 React/Electron 集成等核心主题。Zustand 是 Sibylla 选定的状态管理方案，因其轻量、TypeScript 友好、零 boilerplate 的特性胜出（对比 Redux Toolkit、Jotai）。

## 何时使用此 Skill

在以下场景中使用此 skill：

- 设计 Zustand store 架构和数据结构
- 实现 TypeScript 严格模式下的类型安全 store
- 使用 Zustand 中间件（persist、devtools、immer）
- 优化 React 组件的选择性重渲染（selector、shallow equal）
- 在 Electron 渲染进程中管理应用状态
- 实现跨组件的状态共享与通信
- 处理异步操作与加载状态管理
- 设计 store 的模块化拆分策略

## 核心概念

### 1. Zustand 基础模型

[Zustand](https://github.com/pmndrs/zustand) 是基于 hooks 的极简状态管理库：

```
┌─────────────────────────────────────────────┐
│              React 组件树                     │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ComponentA │  │ComponentB │  │ComponentC │  │
│  │ useStore  │  │ useStore  │  │ useStore  │  │
│  │(selector) │  │(selector) │  │(selector) │  │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘  │
│        │              │              │       │
└────────┼──────────────┼──────────────┼──────┘
         │              │              │
    ┌────▼──────────────▼──────────────▼────┐
    │            Zustand Store               │
    │  ┌─────────────────────────────────┐  │
    │  │         State (不可变快照)        │  │
    │  ├─────────────────────────────────┤  │
    │  │         Actions (状态变更方法)    │  │
    │  ├─────────────────────────────────┤  │
    │  │    Middleware (persist/devtools) │  │
    │  └─────────────────────────────────┘  │
    └───────────────────────────────────────┘
```

**核心优势**（这也是 Sibylla 选择 Zustand 的原因）：
- 零 boilerplate：无 Provider、无 reducer、无 action creator
- TypeScript 原生：类型推断完整，无需额外类型定义
- 性能出色：细粒度订阅，组件仅在所选状态变化时重渲染
- 体积极小：~1KB gzipped
- 中间件灵活：persist、devtools、immer 等按需组合

### 2. 类型安全的 Store 设计

TypeScript 严格模式下的 Zustand store 定义（遵循 CLAUDE.md 禁止 any 的要求）：

```typescript
// stores/fileStore.ts

import { create } from 'zustand';

/** File tree node representation */
interface FileNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  isExpanded?: boolean;
}

/** File store state */
interface FileState {
  /** Root file tree */
  fileTree: FileNode[];
  /** Currently selected file path */
  selectedFile: string | null;
  /** Currently open file paths (tabs) */
  openFiles: string[];
  /** File content cache (path → content) */
  contentCache: Map<string, string>;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: string | null;
}

/** File store actions */
interface FileActions {
  /** Set the file tree */
  setFileTree: (tree: FileNode[]) => void;
  /** Select a file */
  selectFile: (path: string) => void;
  /** Open a file in a new tab */
  openFile: (path: string) => void;
  /** Close a file tab */
  closeFile: (path: string) => void;
  /** Toggle directory expansion */
  toggleDirectory: (path: string) => void;
  /** Update file content in cache */
  updateContent: (path: string, content: string) => void;
  /** Set loading state */
  setLoading: (loading: boolean) => void;
  /** Set error state */
  setError: (error: string | null) => void;
  /** Reset store to initial state */
  reset: () => void;
}

/** Combined store type */
type FileStore = FileState & FileActions;

/** Initial state (separated for reset functionality) */
const initialState: FileState = {
  fileTree: [],
  selectedFile: null,
  openFiles: [],
  contentCache: new Map(),
  isLoading: false,
  error: null,
};

/** File store instance */
const useFileStore = create<FileStore>()((set, get) => ({
  ...initialState,

  setFileTree: (tree) => set({ fileTree: tree }),

  selectFile: (path) => {
    set({ selectedFile: path });
    // Auto-open if not already open
    const { openFiles, openFile } = get();
    if (!openFiles.includes(path)) {
      openFile(path);
    }
  },

  openFile: (path) =>
    set((state) => ({
      openFiles: state.openFiles.includes(path)
        ? state.openFiles
        : [...state.openFiles, path],
    })),

  closeFile: (path) =>
    set((state) => {
      const newOpenFiles = state.openFiles.filter((f) => f !== path);
      return {
        openFiles: newOpenFiles,
        // If closing the selected file, select the previous tab
        selectedFile:
          state.selectedFile === path
            ? newOpenFiles[newOpenFiles.length - 1] ?? null
            : state.selectedFile,
      };
    }),

  toggleDirectory: (path) =>
    set((state) => ({
      fileTree: toggleNodeExpansion(state.fileTree, path),
    })),

  updateContent: (path, content) =>
    set((state) => {
      const newCache = new Map(state.contentCache);
      newCache.set(path, content);
      return { contentCache: newCache };
    }),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  reset: () => set(initialState),
}));

/** Helper: recursively toggle directory expansion */
function toggleNodeExpansion(
  nodes: FileNode[],
  targetPath: string
): FileNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath && node.type === 'directory') {
      return { ...node, isExpanded: !node.isExpanded };
    }
    if (node.children) {
      return {
        ...node,
        children: toggleNodeExpansion(node.children, targetPath),
      };
    }
    return node;
  });
}

export { useFileStore };
export type { FileStore, FileState, FileActions, FileNode };
```

**设计原则**：
- State 和 Actions 分离定义，提供清晰的类型边界
- 导出 store 类型，方便测试和组件类型注解
- 提供 `reset()` 方法用于测试清理和状态重置
- 分离 `initialState` 常量，确保 reset 恢复到一致的初始状态

### 3. Selector 与性能优化

Zustand 的性能关键在于正确使用 selector，避免不必要的组件重渲染：

```typescript
// components/FileExplorer.tsx

import { useFileStore } from '../stores/fileStore';
import { useShallow } from 'zustand/react/shallow';

// ❌ 错误：订阅整个 store，任何状态变化都会触发重渲染
function FileExplorerBad() {
  const store = useFileStore();
  // store.fileTree, store.selectedFile, store.isLoading...
  // 当 contentCache 变化时也会重渲染，即使组件不使用它
}

// ✅ 正确：使用 selector 订阅特定状态
function FileExplorer() {
  // Primitive values: direct selector (uses Object.is comparison)
  const selectedFile = useFileStore((state) => state.selectedFile);
  const isLoading = useFileStore((state) => state.isLoading);

  // Object/array values: use useShallow for shallow comparison
  const { fileTree, toggleDirectory } = useFileStore(
    useShallow((state) => ({
      fileTree: state.fileTree,
      toggleDirectory: state.toggleDirectory,
    }))
  );

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="file-explorer">
      <FileTree
        nodes={fileTree}
        selectedPath={selectedFile}
        onToggle={toggleDirectory}
      />
    </div>
  );
}

// ✅ Derived/computed values: use selector to compute in subscription
function FileTabBar() {
  // Only re-renders when the number of open files changes
  const openFileCount = useFileStore((state) => state.openFiles.length);

  // Shallow compare an array of open files
  const openFiles = useFileStore(
    useShallow((state) => state.openFiles)
  );

  return (
    <div className="tab-bar">
      {openFiles.map((path) => (
        <FileTab key={path} path={path} />
      ))}
      <span className="tab-count">{openFileCount}</span>
    </div>
  );
}
```

**Selector 最佳实践**：
- 原始值（string、number、boolean）直接使用 selector，`Object.is` 比较即可
- 对象/数组值使用 `useShallow` 进行浅比较，避免引用变化导致的无效重渲染
- 将计算逻辑放在 selector 内，而非组件渲染函数中
- 每个组件只订阅实际使用的状态片段

### 4. 中间件组合

Zustand 中间件按需组合，增强 store 能力：

```typescript
// stores/settingsStore.ts

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

/** Application settings */
interface SettingsState {
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  language: string;
  aiModel: string;
  sidebarWidth: number;
  recentWorkspaces: string[];
}

interface SettingsActions {
  setTheme: (theme: SettingsState['theme']) => void;
  setFontSize: (size: number) => void;
  setLanguage: (lang: string) => void;
  setAIModel: (model: string) => void;
  setSidebarWidth: (width: number) => void;
  addRecentWorkspace: (path: string) => void;
}

type SettingsStore = SettingsState & SettingsActions;

/**
 * Settings store with middleware stack:
 * - devtools: Redux DevTools integration for debugging
 * - persist: Auto-persist to localStorage
 * - immer: Immutable updates with mutable syntax
 *
 * Middleware is applied inside-out:
 * immer wraps the store creator, persist wraps immer, devtools wraps persist.
 */
const useSettingsStore = create<SettingsStore>()(
  devtools(
    persist(
      immer((set) => ({
        // Initial state
        theme: 'system',
        fontSize: 14,
        language: 'zh-CN',
        aiModel: 'claude-3-sonnet',
        sidebarWidth: 260,
        recentWorkspaces: [],

        // Actions — immer allows mutable-style updates
        setTheme: (theme) =>
          set(
            (state) => {
              state.theme = theme;
            },
            false,
            'settings/setTheme'
          ),

        setFontSize: (size) =>
          set(
            (state) => {
              state.fontSize = Math.max(10, Math.min(24, size));
            },
            false,
            'settings/setFontSize'
          ),

        setLanguage: (lang) =>
          set(
            (state) => {
              state.language = lang;
            },
            false,
            'settings/setLanguage'
          ),

        setAIModel: (model) =>
          set(
            (state) => {
              state.aiModel = model;
            },
            false,
            'settings/setAIModel'
          ),

        setSidebarWidth: (width) =>
          set(
            (state) => {
              state.sidebarWidth = width;
            },
            false,
            'settings/setSidebarWidth'
          ),

        addRecentWorkspace: (path) =>
          set(
            (state) => {
              // Remove duplicate, prepend, keep max 10
              state.recentWorkspaces = [
                path,
                ...state.recentWorkspaces.filter((p) => p !== path),
              ].slice(0, 10);
            },
            false,
            'settings/addRecentWorkspace'
          ),
      })),
      {
        name: 'sibylla-settings',
        storage: createJSONStorage(() => localStorage),
        // Only persist specific fields (exclude transient UI state)
        partialize: (state) => ({
          theme: state.theme,
          fontSize: state.fontSize,
          language: state.language,
          aiModel: state.aiModel,
          sidebarWidth: state.sidebarWidth,
          recentWorkspaces: state.recentWorkspaces,
        }),
      }
    ),
    { name: 'SettingsStore' }
  )
);

export { useSettingsStore };
export type { SettingsStore, SettingsState };
```

**中间件说明**：
- **devtools**：集成 Redux DevTools，可在开发模式下可视化状态变化。每个 `set()` 调用的第三个参数是 action name，在 DevTools 中显示
- **persist**：自动将状态持久化到 localStorage。使用 `partialize` 控制需要持久化的字段，避免存储临时 UI 状态
- **immer**：允许以可变语法编写不可变更新。复杂嵌套对象操作时比展开运算符更清晰安全

### 5. 异步操作与加载状态

处理异步 IPC 调用和 AI 请求的状态管理：

```typescript
// stores/chatStore.ts

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

/** Chat message */
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  usage?: TokenUsage;
}

/** Chat session */
interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

interface ChatState {
  /** All chat sessions */
  sessions: ChatSession[];
  /** Current active session ID */
  activeSessionId: string | null;
  /** Streaming content being received */
  streamingContent: string;
  /** Whether AI is currently generating */
  isStreaming: boolean;
  /** Error from the last request */
  error: string | null;
}

interface ChatActions {
  /** Create a new chat session */
  createSession: () => string;
  /** Switch to a session */
  setActiveSession: (id: string) => void;
  /** Add a message to the active session */
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  /** Send a message to AI (async, manages loading state) */
  sendMessage: (content: string) => Promise<void>;
  /** Update streaming content */
  updateStreamingContent: (content: string) => void;
  /** Finalize streaming into a message */
  finalizeStream: (usage?: TokenUsage) => void;
  /** Set error state */
  setError: (error: string | null) => void;
  /** Delete a session */
  deleteSession: (id: string) => void;
}

type ChatStore = ChatState & ChatActions;

const useChatStore = create<ChatStore>()(
  devtools(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      streamingContent: '',
      isStreaming: false,
      error: null,

      createSession: () => {
        const id = crypto.randomUUID();
        const session: ChatSession = {
          id,
          title: '新对话',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        set(
          (state) => ({
            sessions: [session, ...state.sessions],
            activeSessionId: id,
          }),
          false,
          'chat/createSession'
        );

        return id;
      },

      setActiveSession: (id) =>
        set({ activeSessionId: id }, false, 'chat/setActiveSession'),

      addMessage: (message) =>
        set(
          (state) => {
            const activeId = state.activeSessionId;
            if (!activeId) return state;

            const fullMessage: Message = {
              ...message,
              id: crypto.randomUUID(),
              timestamp: Date.now(),
            };

            return {
              sessions: state.sessions.map((s) =>
                s.id === activeId
                  ? {
                      ...s,
                      messages: [...s.messages, fullMessage],
                      updatedAt: Date.now(),
                    }
                  : s
              ),
            };
          },
          false,
          'chat/addMessage'
        ),

      sendMessage: async (content) => {
        const { addMessage, activeSessionId, createSession } = get();

        // Ensure active session exists
        const sessionId = activeSessionId ?? createSession();

        // Add user message
        addMessage({ role: 'user', content });

        // Start streaming
        set(
          { isStreaming: true, streamingContent: '', error: null },
          false,
          'chat/startStreaming'
        );

        try {
          const request: ChatRequest = {
            sessionId,
            model: 'claude-3-sonnet',
            mode: 'chat',
            messages: [{ role: 'user', content }],
            context: {} as AssembledContext,
          };

          const stream = window.electronAPI.chatWithAI(request);

          for await (const chunk of stream) {
            switch (chunk.type) {
              case 'content':
                set(
                  (state) => ({
                    streamingContent:
                      state.streamingContent + (chunk.content ?? ''),
                  }),
                  false,
                  'chat/streamChunk'
                );
                break;

              case 'usage':
                // Store usage for finalization
                break;

              case 'error':
                set(
                  {
                    error: chunk.error?.message ?? 'Unknown error',
                    isStreaming: false,
                  },
                  false,
                  'chat/streamError'
                );
                return;

              case 'done':
                get().finalizeStream(chunk.usage);
                return;
            }
          }
        } catch (err) {
          set(
            {
              error: `请求失败: ${String(err)}`,
              isStreaming: false,
            },
            false,
            'chat/requestError'
          );
        }
      },

      updateStreamingContent: (content) =>
        set({ streamingContent: content }, false, 'chat/updateStream'),

      finalizeStream: (usage) =>
        set(
          (state) => {
            if (!state.streamingContent) return { isStreaming: false };

            const activeId = state.activeSessionId;
            if (!activeId) return { isStreaming: false };

            const assistantMessage: Message = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: state.streamingContent,
              timestamp: Date.now(),
              usage,
            };

            return {
              isStreaming: false,
              streamingContent: '',
              sessions: state.sessions.map((s) =>
                s.id === activeId
                  ? {
                      ...s,
                      messages: [...s.messages, assistantMessage],
                      updatedAt: Date.now(),
                      // Auto-generate title from first exchange
                      title:
                        s.messages.length <= 1
                          ? s.messages[0]?.content.slice(0, 30) + '...'
                          : s.title,
                    }
                  : s
              ),
            };
          },
          false,
          'chat/finalizeStream'
        ),

      setError: (error) => set({ error }, false, 'chat/setError'),

      deleteSession: (id) =>
        set(
          (state) => ({
            sessions: state.sessions.filter((s) => s.id !== id),
            activeSessionId:
              state.activeSessionId === id ? null : state.activeSessionId,
          }),
          false,
          'chat/deleteSession'
        ),
    }),
    { name: 'ChatStore' }
  )
);

export { useChatStore };
export type { ChatStore, ChatState, Message, ChatSession };
```

### 6. Store 模块化拆分

大型应用应按功能域拆分 store，而非使用单一全局 store：

```typescript
// stores/index.ts — Store 注册表

/**
 * Sibylla store architecture:
 *
 * Each functional domain has its own independent store.
 * Stores communicate through explicit function calls,
 * not through shared state or events.
 *
 * ┌─────────────┐  ┌─────────────┐  ┌──────────────┐
 * │  fileStore   │  │  chatStore   │  │settingsStore │
 * │  文件管理     │  │  AI 对话     │  │  应用设置     │
 * └──────┬──────┘  └──────┬──────┘  └──────┬───────┘
 *        │                │                │
 *        │         ┌──────▼──────┐         │
 *        └────────►│ workspaceStore│◄───────┘
 *                  │ 工作区状态   │
 *                  └─────────────┘
 */

export { useFileStore } from './fileStore';
export { useChatStore } from './chatStore';
export { useSettingsStore } from './settingsStore';
export { useWorkspaceStore } from './workspaceStore';
export { useUIStore } from './uiStore';
```

```typescript
// stores/uiStore.ts — Transient UI state (no persistence)

import { create } from 'zustand';

interface UIState {
  /** Whether the sidebar is visible */
  sidebarVisible: boolean;
  /** Whether the AI panel is visible */
  aiPanelVisible: boolean;
  /** Active sidebar tab */
  activeSidebarTab: 'files' | 'search' | 'git' | 'tasks';
  /** Modal stack */
  modals: ModalConfig[];
  /** Toast notifications */
  toasts: Toast[];
}

interface UIActions {
  toggleSidebar: () => void;
  toggleAIPanel: () => void;
  setSidebarTab: (tab: UIState['activeSidebarTab']) => void;
  showModal: (config: ModalConfig) => void;
  closeModal: (id: string) => void;
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
}

interface ModalConfig {
  id: string;
  type: string;
  props: Record<string, unknown>;
}

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

type UIStore = UIState & UIActions;

const useUIStore = create<UIStore>()((set) => ({
  sidebarVisible: true,
  aiPanelVisible: false,
  activeSidebarTab: 'files',
  modals: [],
  toasts: [],

  toggleSidebar: () =>
    set((state) => ({ sidebarVisible: !state.sidebarVisible })),

  toggleAIPanel: () =>
    set((state) => ({ aiPanelVisible: !state.aiPanelVisible })),

  setSidebarTab: (tab) => set({ activeSidebarTab: tab }),

  showModal: (config) =>
    set((state) => ({ modals: [...state.modals, config] })),

  closeModal: (id) =>
    set((state) => ({
      modals: state.modals.filter((m) => m.id !== id),
    })),

  addToast: (toast) => {
    const id = crypto.randomUUID();
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }));
    return id;
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

export { useUIStore };
export type { UIStore, UIState, ModalConfig, Toast };
```

**模块化原则**：
- 按功能域拆分（文件、聊天、设置、UI、工作区），每个 store 独立管理
- 瞬态 UI 状态（sidebar、modal）与持久化状态（settings）分离
- Store 间通过显式函数调用通信，避免隐式依赖
- 每个 store 独立导出类型，便于测试和复用

### 7. 与 Electron IPC 集成

在 Zustand 中封装 IPC 调用，保持 store 作为渲染进程的单一数据源：

```typescript
// stores/workspaceStore.ts

import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';

interface WorkspaceState {
  /** Current workspace path */
  workspacePath: string | null;
  /** Workspace name */
  workspaceName: string | null;
  /** Sync status */
  syncStatus: 'idle' | 'syncing' | 'error' | 'offline';
  /** Last sync timestamp */
  lastSyncAt: number | null;
  /** Whether the workspace has unsaved changes */
  hasUnsavedChanges: boolean;
}

interface WorkspaceActions {
  /** Open a workspace (calls IPC) */
  openWorkspace: (path: string) => Promise<void>;
  /** Sync workspace with remote (calls IPC) */
  syncWorkspace: () => Promise<void>;
  /** Mark workspace as having unsaved changes */
  markDirty: () => void;
  /** Mark workspace as saved */
  markClean: () => void;
}

type WorkspaceStore = WorkspaceState & WorkspaceActions;

const useWorkspaceStore = create<WorkspaceStore>()(
  devtools(
    persist(
      (set, get) => ({
        workspacePath: null,
        workspaceName: null,
        syncStatus: 'idle',
        lastSyncAt: null,
        hasUnsavedChanges: false,

        openWorkspace: async (path) => {
          try {
            set({ syncStatus: 'syncing' }, false, 'workspace/opening');

            // Call Electron main process via IPC
            const workspace = await window.electronAPI.openWorkspace(path);

            set(
              {
                workspacePath: workspace.path,
                workspaceName: workspace.name,
                syncStatus: 'idle',
                lastSyncAt: Date.now(),
              },
              false,
              'workspace/opened'
            );
          } catch (error) {
            set(
              {
                syncStatus: 'error',
              },
              false,
              'workspace/openError'
            );
            throw error;
          }
        },

        syncWorkspace: async () => {
          const { workspacePath, syncStatus } = get();
          if (!workspacePath || syncStatus === 'syncing') return;

          try {
            set({ syncStatus: 'syncing' }, false, 'workspace/syncStart');

            await window.electronAPI.syncWorkspace(workspacePath);

            set(
              {
                syncStatus: 'idle',
                lastSyncAt: Date.now(),
                hasUnsavedChanges: false,
              },
              false,
              'workspace/synced'
            );
          } catch (error) {
            set(
              { syncStatus: 'error' },
              false,
              'workspace/syncError'
            );
            throw error;
          }
        },

        markDirty: () =>
          set(
            { hasUnsavedChanges: true },
            false,
            'workspace/markDirty'
          ),

        markClean: () =>
          set(
            { hasUnsavedChanges: false },
            false,
            'workspace/markClean'
          ),
      }),
      {
        name: 'sibylla-workspace',
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          workspacePath: state.workspacePath,
          workspaceName: state.workspaceName,
        }),
      }
    ),
    { name: 'WorkspaceStore' }
  )
);

export { useWorkspaceStore };
export type { WorkspaceStore, WorkspaceState };
```

**IPC 集成原则**：
- Zustand action 中调用 `window.electronAPI.*`，在 action 内管理 loading/error 状态
- action 是 store 中唯一发起 IPC 调用的地方，组件不应直接调用 IPC
- 错误状态统一在 store 中管理，组件通过 selector 订阅

### 8. 测试策略

```typescript
// __tests__/fileStore.test.ts

import { useFileStore } from '../stores/fileStore';
import { act } from '@testing-library/react';

describe('fileStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useFileStore.getState().reset();
  });

  it('should select and auto-open a file', () => {
    const { selectFile } = useFileStore.getState();

    act(() => {
      selectFile('/path/to/file.md');
    });

    const state = useFileStore.getState();
    expect(state.selectedFile).toBe('/path/to/file.md');
    expect(state.openFiles).toContain('/path/to/file.md');
  });

  it('should close file and select previous tab', () => {
    const { openFile, selectFile, closeFile } = useFileStore.getState();

    act(() => {
      openFile('/file1.md');
      openFile('/file2.md');
      selectFile('/file2.md');
      closeFile('/file2.md');
    });

    const state = useFileStore.getState();
    expect(state.selectedFile).toBe('/file1.md');
    expect(state.openFiles).not.toContain('/file2.md');
  });

  it('should not duplicate open files', () => {
    const { openFile } = useFileStore.getState();

    act(() => {
      openFile('/file1.md');
      openFile('/file1.md');
    });

    const state = useFileStore.getState();
    expect(state.openFiles.filter((f) => f === '/file1.md')).toHaveLength(1);
  });
});

// __tests__/settingsStore.test.ts

describe('settingsStore', () => {
  it('should clamp font size within valid range', () => {
    const { setFontSize } = useSettingsStore.getState();

    act(() => {
      setFontSize(5); // Below minimum
    });
    expect(useSettingsStore.getState().fontSize).toBe(10);

    act(() => {
      setFontSize(30); // Above maximum
    });
    expect(useSettingsStore.getState().fontSize).toBe(24);
  });

  it('should keep max 10 recent workspaces', () => {
    const { addRecentWorkspace } = useSettingsStore.getState();

    act(() => {
      for (let i = 0; i < 15; i++) {
        addRecentWorkspace(`/workspace-${i}`);
      }
    });

    expect(useSettingsStore.getState().recentWorkspaces).toHaveLength(10);
  });
});
```

**测试最佳实践**：
- 使用 `useStore.getState()` 在测试中直接访问 store，无需渲染组件
- 每个测试前调用 `reset()` 确保状态隔离
- 使用 `act()` 包裹状态变更，确保 React 更新队列正确处理
- 测试 action 的副作用（如 auto-open、clamp、dedup）

## 常见问题

### 1. 组件频繁重渲染

**问题**：使用 Zustand 后组件仍然频繁重渲染。

**解决方案**：
- 检查是否使用了 selector（而非订阅整个 store）
- 对象/数组类型的 selector 使用 `useShallow` 进行浅比较
- 避免在 selector 中创建新对象（每次渲染都会产生新引用）
- 使用 React DevTools Profiler 确认重渲染原因

### 2. 持久化与 Map/Set 不兼容

**问题**：`persist` 中间件无法正确序列化 `Map` 或 `Set`。

**解决方案**：
- 使用 `partialize` 排除不可序列化的字段
- 或提供自定义的 `storage` 实现，使用 `superjson` 进行序列化
- 或将 Map 转换为普通对象后再持久化

### 3. Store 间循环依赖

**问题**：Store A 调用 Store B 的 action，Store B 又调用 Store A。

**解决方案**：
- 将共享逻辑提取为独立的工具函数，两个 store 都调用它
- 使用事件总线模式解耦 store 间的通信
- 重新审视 store 拆分策略，合并过度拆分的 store

## 参考资源

- [Zustand 官方文档](https://github.com/pmndrs/zustand)
- [Zustand TypeScript 指南](https://docs.pmnd.rs/zustand/guides/typescript)
- [Zustand 中间件文档](https://docs.pmnd.rs/zustand/middlewares/introduction)
- [Immer 文档](https://immerjs.github.io/immer/)
- [React DevTools Profiler](https://react.dev/reference/react/Profiler)

## 总结

Zustand 状态管理的核心原则：

1. **类型安全**：State/Actions 分离定义，严格模式下零 any
2. **细粒度订阅**：使用 selector + useShallow 最小化重渲染范围
3. **模块化拆分**：按功能域独立 store，显式跨 store 通信
4. **中间件按需**：persist（持久化）、devtools（调试）、immer（复杂更新）
5. **IPC 封装**：action 中统一管理 IPC 调用和 loading/error 状态
6. **可测试性**：reset 方法 + getState() 直接测试，无需渲染组件
