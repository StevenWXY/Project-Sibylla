import {
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Code2,
  Circle,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react'
import React from 'react'
import {
  findNodeByPath,
  getParentPath,
  joinPath,
  normalizePath,
  type FileTreeNode,
} from '../layout/file-tree.utils'
import { cn } from '../../utils/cn'
import type {
  LeftToolMode,
  NotificationItem,
  SearchResultItem,
  TaskItem,
} from './types'

interface StudioLeftPanelProps {
  treeNodes: FileTreeNode[]
  selectedNodeId?: string
  openFilePaths: string[]
  dirtyFilePaths: string[]
  isTreeLoading: boolean
  treeError: string | null
  onRefresh: () => Promise<void> | void
  onCreateFile: (targetPath: string) => Promise<void> | void
  onCreateFolder: (targetPath: string) => Promise<void> | void
  onRename: (sourcePath: string, targetPath: string) => Promise<void> | void
  onDelete: (node: FileTreeNode) => Promise<void> | void
  onMove: (sourcePath: string, targetFolderPath: string) => Promise<void> | void
  onCopyPath: (path: string) => Promise<void> | void
  onSelect: (node: FileTreeNode) => void

  activeTool: LeftToolMode
  onChangeTool: (mode: LeftToolMode) => void

  searchQuery: string
  onSearchQueryChange: (query: string) => void
  isSearching: boolean
  searchResults: SearchResultItem[]
  onOpenSearchResult: (result: SearchResultItem) => void

  tasks: TaskItem[]
  isTasksLoading: boolean
  onToggleTask: (task: TaskItem) => void
  onOpenTask: (task: TaskItem) => void

  notifications: NotificationItem[]
  unreadNotificationCount: number
  onMarkNotificationRead: (id: string) => void
  onClearNotifications: () => void
}

function iconForFile(name: string) {
  if (/\.(ts|tsx|js|jsx|json|yaml|yml|css|scss|html)$/i.test(name)) {
    return Code2
  }
  return FileText
}

function collectFolderIds(nodes: FileTreeNode[], output: Set<string>) {
  for (const node of nodes) {
    if (node.type === 'folder') {
      output.add(node.path)
      if (node.children && node.children.length > 0) {
        collectFolderIds(node.children, output)
      }
    }
  }
}

function sortNodesForSidebar(nodes: FileTreeNode[]): FileTreeNode[] {
  return [...nodes]
    .sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1
      }
      return a.name.localeCompare(b.name, 'en')
    })
    .map((node) => ({
      ...node,
      children: node.children ? sortNodesForSidebar(node.children) : undefined,
    }))
}

export function StudioLeftPanel({
  treeNodes,
  selectedNodeId,
  openFilePaths,
  dirtyFilePaths,
  isTreeLoading,
  treeError,
  onRefresh,
  onCreateFile,
  onCreateFolder,
  onSelect,
  activeTool,
  onChangeTool,
  searchQuery,
  onSearchQueryChange,
  isSearching,
  searchResults,
  onOpenSearchResult,
  tasks,
  isTasksLoading,
  onToggleTask,
  onOpenTask,
  notifications,
  unreadNotificationCount,
  onMarkNotificationRead,
  onClearNotifications,
}: StudioLeftPanelProps) {
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(() => {
    const initial = new Set<string>()
    collectFolderIds(treeNodes, initial)
    for (const node of treeNodes.filter((n) => n.type === 'folder').slice(0, 6)) {
      initial.add(node.path)
    }
    return initial
  })
  const sortedTree = React.useMemo(() => sortNodesForSidebar(treeNodes), [treeNodes])

  React.useEffect(() => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      const existingFolders = new Set<string>()
      collectFolderIds(sortedTree, existingFolders)
      for (const node of sortedTree.filter((n) => n.type === 'folder').slice(0, 6)) {
        if (existingFolders.has(node.path)) {
          next.add(node.path)
        }
      }
      return next
    })
  }, [sortedTree])

  React.useEffect(() => {
    if (!selectedNodeId) {
      return
    }

    const normalized = normalizePath(selectedNodeId)
    const segments = normalized.split('/').filter(Boolean)
    if (segments.length <= 1) {
      return
    }

    setExpandedIds((prev) => {
      const next = new Set(prev)
      for (let index = 1; index < segments.length; index += 1) {
        next.add(segments.slice(0, index).join('/'))
      }
      return next
    })
  }, [selectedNodeId])

  const selectedNode = React.useMemo(
    () => (selectedNodeId ? findNodeByPath(sortedTree, selectedNodeId) : null),
    [selectedNodeId, sortedTree]
  )

  const getCreationBase = React.useCallback(() => {
    if (!selectedNode) {
      return ''
    }
    return selectedNode.type === 'folder'
      ? normalizePath(selectedNode.path)
      : normalizePath(getParentPath(selectedNode.path))
  }, [selectedNode])

  const handleCreateFile = React.useCallback(() => {
    const filename = window.prompt('New file name', 'new-file.md')?.trim()
    if (!filename) {
      return
    }
    const targetPath = joinPath(getCreationBase(), filename)
    void onCreateFile(targetPath)
  }, [getCreationBase, onCreateFile])

  const handleCreateFolder = React.useCallback(() => {
    const folderName = window.prompt('New folder name', 'new-folder')?.trim()
    if (!folderName) {
      return
    }
    const targetPath = joinPath(getCreationBase(), folderName)
    void onCreateFolder(targetPath)
  }, [getCreationBase, onCreateFolder])

  const toggleFolder = React.useCallback((folderPath: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(folderPath)) {
        next.delete(folderPath)
      } else {
        next.add(folderPath)
      }
      return next
    })
  }, [])

  const renderTreeNode = (node: FileTreeNode, depth: number): React.ReactNode => {
    const isFolder = node.type === 'folder'
    const isExpanded = expandedIds.has(node.path)
    const isSelected = selectedNodeId === node.path
    const isDirty = dirtyFilePaths.includes(node.path)
    const isOpen = openFilePaths.includes(node.path)
    const indent = depth * 14 + 8
    const FileIcon = iconForFile(node.name)

    return (
      <React.Fragment key={node.path}>
        <button
          type="button"
          onClick={() => {
            if (isFolder) {
              onSelect(node)
              toggleFolder(node.path)
            } else {
              onSelect(node)
            }
          }}
          className={cn(
            'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[13px] transition-colors',
            isSelected
              ? 'bg-white font-medium text-black shadow-[0_0_10px_rgba(255,255,255,0.1)]'
              : 'text-sys-darkMuted hover:bg-white/5 hover:text-gray-200'
          )}
          style={{ paddingLeft: `${indent}px` }}
          title={node.path}
        >
          {isFolder ? (
            <>
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              )}
              {isExpanded ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0" />
              )}
            </>
          ) : (
            <>
              <span className="w-3.5 shrink-0" />
              <FileIcon className="h-3.5 w-3.5 shrink-0" />
            </>
          )}

          <span className="truncate">{node.name}</span>
          {!isFolder && isDirty && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-status-warning" />}
          {!isFolder && !isDirty && isOpen && !isSelected && (
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-status-success" />
          )}
        </button>

        {isFolder && isExpanded && node.children && node.children.length > 0
          ? node.children.map((child) => renderTreeNode(child, depth + 1))
          : null}
      </React.Fragment>
    )
  }

  return (
    <aside className="flex w-[220px] min-h-0 flex-col border-r border-sys-darkBorder bg-[#050505]">
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <div className="mb-4 space-y-0.5">
          <div className="flex w-full items-center gap-2 rounded-md bg-sys-darkBorder/50 px-2 py-1.5 text-[13px] font-medium text-white">
            <Folder className="h-4 w-4 text-gray-400" />
            <span className="flex-1">Files</span>
            <button
              type="button"
              className="text-gray-400 transition-colors hover:text-white"
              title="Refresh file tree"
              onClick={() => {
                void onRefresh()
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="text-gray-400 transition-colors hover:text-white"
              title="Create file"
              onClick={handleCreateFile}
            >
              <FilePlus2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="text-gray-400 transition-colors hover:text-white"
              title="Create folder"
              onClick={handleCreateFolder}
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-1 space-y-0.5">
            {isTreeLoading && (
              <div className="flex items-center gap-2 px-2 py-1 text-[13px] text-sys-darkMuted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading...
              </div>
            )}

            {treeError && <div className="px-2 py-1 text-[11px] text-status-error">{treeError}</div>}

            {!isTreeLoading && !treeError && sortedTree.length === 0 && (
              <div className="px-2 py-1 text-[12px] text-sys-darkMuted">No files</div>
            )}

            {!isTreeLoading && !treeError && sortedTree.map((node) => renderTreeNode(node, 0))}
          </div>
        </div>

        <div className="space-y-0.5 border-t border-sys-darkBorder/50 pt-2">
          <button
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors',
              activeTool === 'search'
                ? 'bg-sys-darkBorder/50 text-white'
                : 'text-sys-darkMuted hover:bg-white/5 hover:text-gray-200'
            )}
            onClick={() => onChangeTool(activeTool === 'search' ? null : 'search')}
          >
            <Search className="h-4 w-4" />
            Search
            <span className="ml-auto rounded bg-sys-darkBorder px-1 font-mono text-[10px] text-gray-500">⌘⇧F</span>
          </button>

          <button
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors',
              activeTool === 'tasks'
                ? 'bg-sys-darkBorder/50 text-white'
                : 'text-sys-darkMuted hover:bg-white/5 hover:text-gray-200'
            )}
            onClick={() => onChangeTool(activeTool === 'tasks' ? null : 'tasks')}
          >
            <ClipboardList className="h-4 w-4" />
            Tasks
          </button>

          <button
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors',
              activeTool === 'notifications'
                ? 'bg-sys-darkBorder/50 text-white'
                : 'text-sys-darkMuted hover:bg-white/5 hover:text-gray-200'
            )}
            onClick={() => onChangeTool(activeTool === 'notifications' ? null : 'notifications')}
          >
            <Bell className="h-4 w-4" />
            Notifications
            <span className="ml-auto flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-bold text-black shadow-[0_0_8px_rgba(255,255,255,0.4)]">
              {Math.min(unreadNotificationCount, 9)}
            </span>
          </button>
        </div>

        {activeTool && (
          <div className="mt-2 rounded-md border border-sys-darkBorder bg-[#0A0A0A] p-2">
            {activeTool === 'search' && (
              <div className="space-y-2">
                <input
                  value={searchQuery}
                  onChange={(event) => onSearchQueryChange(event.target.value)}
                  placeholder="Search text..."
                  className="h-8 w-full rounded border border-sys-darkBorder bg-sys-black px-2 text-xs text-white outline-none"
                />
                <div className="max-h-36 space-y-1 overflow-y-auto">
                  {isSearching && <p className="text-xs text-sys-darkMuted">Searching...</p>}
                  {!isSearching && searchResults.length === 0 && (
                    <p className="text-xs text-sys-darkMuted">No results</p>
                  )}
                  {!isSearching &&
                    searchResults.slice(0, 12).map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        className="w-full rounded border border-sys-darkBorder bg-[#111111] px-2 py-1 text-left text-[11px] text-gray-300"
                        onClick={() => onOpenSearchResult(result)}
                      >
                        <div className="truncate font-mono text-[10px] text-sys-darkMuted">
                          {result.path}:{result.lineNumber}
                        </div>
                        <div className="truncate">{result.preview}</div>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {activeTool === 'tasks' && (
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {isTasksLoading && <p className="text-xs text-sys-darkMuted">Loading tasks...</p>}
                {!isTasksLoading && tasks.length === 0 && <p className="text-xs text-sys-darkMuted">No tasks</p>}
                {!isTasksLoading &&
                  tasks.slice(0, 12).map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-1 rounded border border-sys-darkBorder bg-[#111111] px-1.5 py-1"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenTask(task)}
                        className="min-w-0 flex-1 rounded px-1 py-0.5 text-left text-[11px] text-gray-300 transition-colors hover:bg-white/5"
                        title={`Open ${task.path}:${task.lineNumber}`}
                      >
                        <p className={cn('truncate', task.completed && 'line-through text-sys-darkMuted')}>
                          {task.text}
                        </p>
                        <p className="truncate font-mono text-[10px] text-sys-darkMuted">
                          {task.path}:{task.lineNumber}
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => onToggleTask(task)}
                        title={task.completed ? 'Mark as todo' : 'Mark as done'}
                        className="rounded p-1 text-sys-darkMuted transition-colors hover:bg-white/5 hover:text-white"
                      >
                        {task.completed ? (
                          <CheckCircle2 className="h-4 w-4 text-status-success drop-shadow-[0_0_6px_rgba(52,211,153,0.45)]" />
                        ) : (
                          <Circle className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  ))}
              </div>
            )}

            {activeTool === 'notifications' && (
              <div className="space-y-1">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={onClearNotifications}
                    className="text-[10px] text-sys-darkMuted hover:text-white"
                  >
                    Clear
                  </button>
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {notifications.length === 0 && <p className="text-xs text-sys-darkMuted">No notifications</p>}
                  {notifications.slice(0, 12).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onMarkNotificationRead(item.id)}
                      className={cn(
                        'w-full rounded border px-2 py-1 text-left text-[11px]',
                        item.read
                          ? 'border-sys-darkBorder bg-[#101010] text-sys-darkMuted'
                          : 'border-white/20 bg-[#151515] text-white'
                      )}
                    >
                      <p className="truncate font-medium">{item.title}</p>
                      <p className="line-clamp-2 text-[10px]">{item.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </nav>
    </aside>
  )
}
