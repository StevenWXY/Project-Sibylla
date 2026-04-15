import { memo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { InlineRenameInput } from './InlineRenameInput'
import type { FileTreeNode } from './file-tree.utils'
import { toDepthPadding } from './file-tree.utils'

export interface PendingCreateState {
  parentPath: string
  type: 'file' | 'folder'
  defaultName: string
}

interface TreeNodeProps {
  node: FileTreeNode
  level: number
  selectedId: string | null
  expandedIds: ReadonlySet<string>
  openPaths: ReadonlySet<string>
  dirtyPaths: ReadonlySet<string>
  renamingPath: string | null
  pendingCreate: PendingCreateState | null
  onSelect: (node: FileTreeNode) => void
  onToggle: (path: string) => void
  onStartRename: (path: string) => void
  onSubmitRename: (path: string, nextName: string) => void
  onCancelRename: () => void
  onStartCreateFile: (parentPath: string) => void
  onStartCreateFolder: (parentPath: string) => void
  onSubmitCreate: (nextName: string) => void
  onCancelCreate: () => void
  onContextMenu: (event: React.MouseEvent, node: FileTreeNode) => void
  onDragStart: (event: React.DragEvent, node: FileTreeNode) => void
  onDragOver: (event: React.DragEvent, node: FileTreeNode) => void
  onDragEnter: (event: React.DragEvent, node: FileTreeNode) => void
  onDrop: (event: React.DragEvent, node: FileTreeNode) => void
}

export const TreeNode = memo(function TreeNode({
  node,
  level,
  selectedId,
  expandedIds,
  openPaths,
  dirtyPaths,
  renamingPath,
  pendingCreate,
  onSelect,
  onToggle,
  onStartRename,
  onSubmitRename,
  onCancelRename,
  onStartCreateFile,
  onStartCreateFolder,
  onSubmitCreate,
  onCancelCreate,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragEnter,
  onDrop,
}: TreeNodeProps) {
  const isFolder = node.type === 'folder'
  const isExpanded = expandedIds.has(node.path)
  const isSelected = selectedId === node.path
  const isOpen = openPaths.has(node.path)
  const isDirty = dirtyPaths.has(node.path)
  const hasChildren = Boolean(node.children && node.children.length > 0)
  const isRenaming = renamingPath === node.path

  const [isDragOver, setIsDragOver] = useState(false)

  return (
    <div className="space-y-0.5" role="treeitem" aria-expanded={isFolder ? isExpanded : undefined}>
      <div
        className={cn(
          'group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors',
          'hover:bg-gray-100 dark:hover:bg-sys-darkSurface',
          isSelected
            ? 'bg-indigo-50 font-semibold text-gray-900 dark:bg-white dark:text-black'
            : 'text-gray-700 dark:text-white',
          isDragOver && isFolder && 'ring-1 ring-indigo-500/50 bg-indigo-500/10'
        )}
        style={{ paddingLeft: `${toDepthPadding(level)}px` }}
        onClick={() => {
          if (isFolder) {
            onToggle(node.path)
          }
          onSelect(node)
        }}
        onDoubleClick={() => {
          if (!isFolder) {
            onSelect(node)
          }
        }}
        onContextMenu={(event) => onContextMenu(event, node)}
        draggable
        onDragStart={(event) => onDragStart(event, node)}
        onDragOver={(event) => {
          onDragOver(event, node)
          if (isFolder && event.dataTransfer.dropEffect === 'move') {
            setIsDragOver(true)
          }
        }}
        onDragEnter={(event) => {
          setIsDragOver(true)
          onDragEnter(event, node)
        }}
        onDragLeave={() => {
          setIsDragOver(false)
        }}
        onDrop={(event) => {
          setIsDragOver(false)
          onDrop(event, node)
        }}
        onDragEnd={() => {
          setIsDragOver(false)
        }}
        title={node.name}
        data-path={node.path}
      >
        {isFolder ? (
          <button
            type="button"
            className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-black/10 dark:hover:bg-black/15"
            onClick={(event) => {
              event.stopPropagation()
              onToggle(node.path)
            }}
            aria-label={isExpanded ? '折叠文件夹' : '展开文件夹'}
          >
            {isExpanded ? (
              <ChevronDown className={cn('h-3.5 w-3.5', isSelected ? 'text-gray-700 dark:text-black' : 'text-gray-400 dark:text-sys-darkMuted')} />
            ) : (
              <ChevronRight className={cn('h-3.5 w-3.5', isSelected ? 'text-gray-700 dark:text-black' : 'text-gray-400 dark:text-sys-darkMuted')} />
            )}
          </button>
        ) : (
          <span className="inline-block w-5" />
        )}

        <span className="shrink-0">
          {isFolder ? (
            isExpanded ? (
              <FolderOpen className={cn('h-4 w-4', isSelected ? 'text-indigo-600 dark:text-black' : 'text-indigo-500 dark:text-white')} />
            ) : (
              <Folder className={cn('h-4 w-4', isSelected ? 'text-indigo-600 dark:text-black' : 'text-indigo-500 dark:text-sys-darkMuted')} />
            )
          ) : (
            <File className={cn('h-4 w-4', isSelected ? 'text-gray-500 dark:text-black' : 'text-gray-400 dark:text-sys-darkMuted')} />
          )}
        </span>

        {isRenaming ? (
          <InlineRenameInput
            initialValue={node.name}
            className="h-7 border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 dark:border-white/20 dark:bg-sys-darkSurface dark:text-white"
            onCancel={onCancelRename}
            onSubmit={(nextValue) => onSubmitRename(node.path, nextValue)}
          />
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-1">
            <span className="truncate">{node.name}</span>
            {isDirty && <span className="text-amber-500 dark:text-amber-400">*</span>}
            {isOpen && <span className="h-1.5 w-1.5 rounded-full bg-green-500" />}
          </span>
        )}

        {!isRenaming && (
          <div className="hidden items-center gap-1 group-hover:flex">
            <button
              type="button"
              className={cn(
                'rounded px-1 py-0.5 text-[10px] text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:text-sys-darkMuted dark:hover:bg-black/15 dark:hover:text-white',
                !isFolder && 'hidden'
              )}
              onClick={(event) => {
                event.stopPropagation()
                onStartCreateFile(node.path)
              }}
              title="新建文件"
            >
              +F
            </button>
            <button
              type="button"
              className={cn(
                'rounded px-1 py-0.5 text-[10px] text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:text-sys-darkMuted dark:hover:bg-black/15 dark:hover:text-white',
                !isFolder && 'hidden'
              )}
              onClick={(event) => {
                event.stopPropagation()
                onStartCreateFolder(node.path)
              }}
              title="新建文件夹"
            >
              +D
            </button>
            <button
              type="button"
              className="rounded px-1 py-0.5 text-[10px] text-gray-400 hover:bg-gray-200 hover:text-gray-700 dark:text-sys-darkMuted dark:hover:bg-black/15 dark:hover:text-white"
              onClick={(event) => {
                event.stopPropagation()
                onStartRename(node.path)
              }}
              title="重命名"
            >
              F2
            </button>
          </div>
        )}
      </div>

      {isFolder && isExpanded && pendingCreate?.parentPath === node.path && (
        <div className="pr-2">
          <div
            className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 dark:border-white/10 dark:bg-sys-black/60"
            style={{ marginLeft: `${toDepthPadding(level + 1)}px` }}
          >
            {pendingCreate.type === 'file' ? (
              <File className="h-4 w-4 text-gray-400 dark:text-sys-darkMuted" />
            ) : (
              <Folder className="h-4 w-4 text-gray-400 dark:text-sys-darkMuted" />
            )}
            <InlineRenameInput
              initialValue={pendingCreate.defaultName}
              className="h-7 border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-900 dark:border-white/20 dark:bg-sys-darkSurface dark:text-white"
              onCancel={onCancelCreate}
              onSubmit={onSubmitCreate}
            />
          </div>
        </div>
      )}

      {isFolder && isExpanded && hasChildren && (
        <div role="group">
          {node.children?.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              openPaths={openPaths}
              dirtyPaths={dirtyPaths}
              renamingPath={renamingPath}
              pendingCreate={pendingCreate}
              onSelect={onSelect}
              onToggle={onToggle}
              onStartRename={onStartRename}
              onSubmitRename={onSubmitRename}
              onCancelRename={onCancelRename}
              onStartCreateFile={onStartCreateFile}
              onStartCreateFolder={onStartCreateFolder}
              onSubmitCreate={onSubmitCreate}
              onCancelCreate={onCancelCreate}
              onContextMenu={onContextMenu}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnter={onDragEnter}
              onDrop={onDrop}
            />
          ))}
        </div>
      )}
    </div>
  )
})
