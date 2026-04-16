import React from 'react'
import {
  File,
  FileText,
  FileJson,
  FileCode,
  FileImage,
  X,
  Pin,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../utils/cn'
import type { TabInfo } from '../../store/tabStore'

function getFileIcon(extension: string): LucideIcon {
  switch (extension) {
    case 'md':
    case 'markdown':
    case 'mdx':
      return FileText
    case 'json':
    case 'yaml':
    case 'yml':
    case 'toml':
      return FileJson
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
      return FileCode
    case 'css':
    case 'scss':
      return FileCode
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'svg':
    case 'gif':
    case 'webp':
      return FileImage
    default:
      return File
  }
}

interface TabItemProps {
  tab: TabInfo
  isActive: boolean
  onContextMenu: (event: React.MouseEvent, tabId: string) => void
  onClose: (tabId: string) => void
  onSwitch: (tabId: string) => void
  onDragStart: (event: React.DragEvent, index: number) => void
  onDragOver: (event: React.DragEvent, index: number) => void
  onDrop: (event: React.DragEvent) => void
  onDragEnd: () => void
  index: number
}

export const TabItem = React.memo(function TabItem({
  tab,
  isActive,
  onContextMenu,
  onClose,
  onSwitch,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  index,
}: TabItemProps) {
  const FileIcon = getFileIcon(tab.extension)
  const [isHovered, setIsHovered] = React.useState(false)

  const handleMouseDown = React.useCallback(
    (event: React.MouseEvent) => {
      if (event.button === 1) {
        event.preventDefault()
        onClose(tab.id)
      }
    },
    [onClose, tab.id]
  )

  const handleClick = React.useCallback(() => {
    onSwitch(tab.id)
  }, [onSwitch, tab.id])

  const handleClose = React.useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      onClose(tab.id)
    },
    [onClose, tab.id]
  )

  const handleContextMenu = React.useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      onContextMenu(event, tab.id)
    },
    [onContextMenu, tab.id]
  )

  const handleDragStart = React.useCallback(
    (event: React.DragEvent) => {
      onDragStart(event, index)
    },
    [onDragStart, index]
  )

  const handleDragOver = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      onDragOver(event, index)
    },
    [onDragOver, index]
  )

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        'group relative flex min-w-[120px] max-w-[200px] shrink-0 items-center gap-1.5 px-2 py-1.5 text-[13px] transition-colors select-none',
        isActive
          ? 'border-b-2 border-indigo-500 bg-[#161616] text-white'
          : 'text-sys-darkMuted hover:bg-white/5'
      )}
      style={{ cursor: 'pointer' }}
    >
      {tab.isPinned && (
        <Pin className="h-3 w-3 shrink-0 text-indigo-400" />
      )}

      <button
        type="button"
        onClick={handleClick}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-0.5 py-0 text-left focus:outline-none"
        title={tab.filePath}
      >
        <FileIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{tab.fileName}</span>
      </button>

      {tab.isDirty && !isHovered && (
        <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-status-warning" />
      )}

      {(isHovered || isActive) && !tab.isPinned && (
        <button
          type="button"
          onClick={handleClose}
          className={cn(
            'ml-auto shrink-0 rounded p-0.5 transition-colors',
            'text-gray-500 hover:bg-white/10 hover:text-white'
          )}
          title="Close"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}, (prev, next) => {
  return (
    prev.tab.id === next.tab.id &&
    prev.tab.isDirty === next.tab.isDirty &&
    prev.tab.isPinned === next.tab.isPinned &&
    prev.tab.fileName === next.tab.fileName &&
    prev.isActive === next.isActive &&
    prev.index === next.index
  )
})
