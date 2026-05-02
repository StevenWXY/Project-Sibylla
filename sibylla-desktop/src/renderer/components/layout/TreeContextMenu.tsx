import { useEffect, useMemo } from 'react'
import {
  Clipboard,
  Copy,
  FilePlus2,
  FolderPlus,
  FolderOpen,
  History,
  MessageSquarePlus,
  Pencil,
  Trash2,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import type { FileTreeNode } from './file-tree.utils'

interface TreeContextMenuProps {
  x: number
  y: number
  node: FileTreeNode
  onClose: () => void
  onRename: () => void
  onCopyRelativePath: () => void
  onCopyAbsolutePath: () => void
  onDelete: () => void
  onCreateFile: () => void
  onCreateFolder: () => void
  onRevealInManager: () => void
  onAddToAIContext: () => void
  onViewHistory?: () => void
}

interface MenuItem {
  key: string
  label: string
  icon: React.ReactNode
  action: () => void
  danger?: boolean
  separator?: boolean
  shortcut?: string
}

export function TreeContextMenu({
  x,
  y,
  node,
  onClose,
  onRename,
  onCopyRelativePath,
  onCopyAbsolutePath,
  onDelete,
  onCreateFile,
  onCreateFolder,
  onRevealInManager,
  onAddToAIContext,
  onViewHistory,
}: TreeContextMenuProps) {
  const isFolder = node.type === 'folder'

  const items = useMemo<MenuItem[]>(() => {
    const baseItems: MenuItem[] = []

    if (isFolder) {
      baseItems.push(
        {
          key: 'create-file',
          label: '新建文件',
          icon: <FilePlus2 className="h-3.5 w-3.5" />,
          action: onCreateFile,
        },
        {
          key: 'create-folder',
          label: '新建子文件夹',
          icon: <FolderPlus className="h-3.5 w-3.5" />,
          action: onCreateFolder,
        },
        { key: 'sep-create', label: '', icon: null, action: () => undefined, separator: true }
      )
    }

    baseItems.push(
      {
        key: 'rename',
        label: '重命名',
        icon: <Pencil className="h-3.5 w-3.5" />,
        action: onRename,
        shortcut: 'F2',
      },
      { key: 'sep-copy', label: '', icon: null, action: () => undefined, separator: true },
      {
        key: 'copy-relative',
        label: '复制相对路径',
        icon: <Copy className="h-3.5 w-3.5" />,
        action: onCopyRelativePath,
        shortcut: '⌥⇧C',
      },
      {
        key: 'copy-absolute',
        label: '复制绝对路径',
        icon: <Clipboard className="h-3.5 w-3.5" />,
        action: onCopyAbsolutePath,
        shortcut: '⌥⇧⌘C',
      },
    )

    baseItems.push(
      { key: 'sep-actions', label: '', icon: null, action: () => undefined, separator: true },
      {
        key: 'reveal',
        label: '在文件管理器中显示',
        icon: <FolderOpen className="h-3.5 w-3.5" />,
        action: onRevealInManager,
      },
      {
        key: 'add-context',
        label: '添加至 AI 对话上下文',
        icon: <MessageSquarePlus className="h-3.5 w-3.5" />,
        action: onAddToAIContext,
      },
    )

    if (!isFolder && onViewHistory) {
      baseItems.push({
        key: 'view-history',
        label: '查看历史版本',
        icon: <History className="h-3.5 w-3.5" />,
        action: onViewHistory,
      })
    }

    baseItems.push(
      { key: 'sep-delete', label: '', icon: null, action: () => undefined, separator: true },
      {
        key: 'delete',
        label: '删除',
        icon: <Trash2 className="h-3.5 w-3.5" />,
        action: onDelete,
        danger: true,
      }
    )

    return baseItems
  }, [
    isFolder,
    onCopyRelativePath,
    onCopyAbsolutePath,
    onCreateFile,
    onCreateFolder,
    onDelete,
    onRename,
    onRevealInManager,
    onAddToAIContext,
    onViewHistory,
  ])

  useEffect(() => {
    const handleClickOutside = () => onClose()
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('click', handleClickOutside)
    window.addEventListener('contextmenu', handleClickOutside)
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('click', handleClickOutside)
      window.removeEventListener('contextmenu', handleClickOutside)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  const maxWidth = 260
  const maxHeight = 380
  const nextLeft = Math.min(x, Math.max(0, window.innerWidth - maxWidth - 12))
  const nextTop = Math.min(y, Math.max(0, window.innerHeight - maxHeight - 12))

  return (
    <div
      className="fixed z-50 w-64 rounded-lg border border-gray-200 bg-white/95 p-1 shadow-2xl backdrop-blur dark:border-white/10 dark:bg-sys-black/95"
      style={{ left: nextLeft, top: nextTop }}
      role="menu"
      aria-label="文件树操作菜单"
    >
      {items.map((item) =>
        item.separator ? (
          <div key={item.key} className="my-1 h-px bg-gray-200 dark:bg-white/10" />
        ) : (
          <button
            key={item.key}
            type="button"
            className={cn(
              'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors',
              item.danger
                ? 'text-red-600 hover:bg-red-100 hover:text-red-700 dark:text-red-300 dark:hover:bg-red-900/30 dark:hover:text-red-200'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-sys-darkMuted dark:hover:bg-sys-darkSurface dark:hover:text-white'
            )}
            onClick={(event) => {
              event.stopPropagation()
              item.action()
              onClose()
            }}
            role="menuitem"
          >
            <span className="shrink-0">{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.shortcut && (
              <span className="ml-auto text-[10px] text-gray-400 dark:text-sys-darkMuted">
                {item.shortcut}
              </span>
            )}
          </button>
        )
      )}
    </div>
  )
}
