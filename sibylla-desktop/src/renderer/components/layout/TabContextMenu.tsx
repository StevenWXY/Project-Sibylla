import React, { useEffect, useRef } from 'react'
import { Pin, PinOff, Copy, FolderTree } from 'lucide-react'
import { cn } from '../../utils/cn'
import { useTabStore } from '../../store/tabStore'
import type { TabInfo } from '../../store/tabStore'

interface TabContextMenuProps {
  x: number
  y: number
  tab: TabInfo
  onClose: () => void
  onForceClose: (tabId: string) => void
  onRevealInTree: (filePath: string) => void
}

export function TabContextMenu({ x, y, tab, onClose, onForceClose, onRevealInTree }: TabContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const tabs = useTabStore((s) => s.tabs)
  const closeOtherTabs = useTabStore((s) => s.closeOtherTabs)
  const closeTabsToRight = useTabStore((s) => s.closeTabsToRight)
  const closeAllTabs = useTabStore((s) => s.closeAllTabs)
  const pinTab = useTabStore((s) => s.pinTab)
  const unpinTab = useTabStore((s) => s.unpinTab)

  const tabIndex = tabs.findIndex((t) => t.id === tab.id)
  const isLast = tabIndex === tabs.length - 1
  const hasMultipleTabs = tabs.length > 1

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(tab.filePath)
    } catch {
      // fallback: ignore
    }
    onClose()
  }

  const handleRevealInTree = () => {
    onRevealInTree(tab.filePath)
    onClose()
  }

  const handlePinToggle = () => {
    if (tab.isPinned) {
      unpinTab(tab.id)
    } else {
      pinTab(tab.id)
    }
    onClose()
  }

  const handleClose = () => {
    onForceClose(tab.id)
    onClose()
  }

  const handleCloseOthers = () => {
    const result = closeOtherTabs(tab.id)
    if (!result) {
      // dirty tabs present — caller should handle confirmation
    }
    onClose()
  }

  const handleCloseRight = () => {
    const result = closeTabsToRight(tab.id)
    if (!result) {
      // dirty tabs present — caller should handle confirmation
    }
    onClose()
  }

  const handleCloseAll = () => {
    const result = closeAllTabs()
    if (!result) {
      // dirty tabs present — caller should handle confirmation
    }
    onClose()
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] rounded-md border border-sys-darkBorder bg-[#1A1A1A] py-1 shadow-xl"
      style={{ left: x, top: y }}
    >
      <MenuItem label="关闭" shortcut="⌘W" onClick={handleClose} />
      {hasMultipleTabs && (
        <MenuItem label="关闭其他" onClick={handleCloseOthers} />
      )}
      {!isLast && (
        <MenuItem label="关闭右侧" onClick={handleCloseRight} />
      )}
      {hasMultipleTabs && (
        <MenuItem label="关闭全部" onClick={handleCloseAll} />
      )}

      <div className="my-1 border-t border-sys-darkBorder" />

      <MenuItem
        label={tab.isPinned ? '取消固定' : '固定'}
        icon={tab.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
        onClick={handlePinToggle}
      />

      <div className="my-1 border-t border-sys-darkBorder" />

      <MenuItem
        label="复制路径"
        icon={<Copy className="h-3.5 w-3.5" />}
        onClick={handleCopyPath}
      />
      <MenuItem
        label="在文件树中定位"
        icon={<FolderTree className="h-3.5 w-3.5" />}
        onClick={handleRevealInTree}
      />
    </div>
  )
}

function MenuItem({
  label,
  shortcut,
  icon,
  onClick,
}: {
  label: string
  shortcut?: string
  icon?: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-gray-300',
        'hover:bg-white/5 hover:text-white'
      )}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="flex-1">{label}</span>
      {shortcut && (
        <span className="text-[11px] text-sys-darkMuted">{shortcut}</span>
      )}
    </button>
  )
}
