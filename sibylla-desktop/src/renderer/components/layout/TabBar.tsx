import React, { useCallback, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, Sparkles } from 'lucide-react'
import { cn } from '../../utils/cn'
import { useTabStore } from '../../store/tabStore'
import { TabItem } from './TabItem'

const DRAG_TYPE = 'application/sibylla-tab'

interface TabBarProps {
  onContextMenu: (event: React.MouseEvent, tabId: string) => void
  onCloseTab: (tabId: string) => void
  onSwitchTab: (tabId: string) => void
  onReorderTabs: (fromIndex: number, toIndex: number) => void
  onQuickAI?: () => void
}

function useTabOverflow(containerRef: React.RefObject<HTMLDivElement | null>, tabCount: number) {
  const [isOverflowing, setIsOverflowing] = React.useState(false)
  const [canScrollLeft, setCanScrollLeft] = React.useState(false)
  const [canScrollRight, setCanScrollRight] = React.useState(false)

  const updateScrollState = React.useCallback(() => {
    const el = containerRef.current
    if (!el) return
    setIsOverflowing(el.scrollWidth > el.clientWidth)
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [containerRef])

  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return

    updateScrollState()

    const observer = new ResizeObserver(() => {
      updateScrollState()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [containerRef, tabCount, updateScrollState])

  const scrollLeftFn = React.useCallback(() => {
    containerRef.current?.scrollBy({ left: -150, behavior: 'smooth' })
    setTimeout(updateScrollState, 300)
  }, [containerRef, updateScrollState])

  const scrollRightFn = React.useCallback(() => {
    containerRef.current?.scrollBy({ left: 150, behavior: 'smooth' })
    setTimeout(updateScrollState, 300)
  }, [containerRef, updateScrollState])

  return { isOverflowing, canScrollLeft, canScrollRight, scrollLeft: scrollLeftFn, scrollRight: scrollRightFn }
}

export function TabBar({ onContextMenu, onCloseTab, onSwitchTab, onReorderTabs, onQuickAI }: TabBarProps) {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null)
  const [showOverflowMenu, setShowOverflowMenu] = useState(false)

  const { canScrollLeft, canScrollRight, scrollLeft, scrollRight } = useTabOverflow(
    scrollContainerRef,
    tabs.length
  )

  const handleDragStart = useCallback(
    (event: React.DragEvent, index: number) => {
      setDragIndex(index)
      event.dataTransfer.setData(DRAG_TYPE, String(index))
      event.dataTransfer.effectAllowed = 'move'
    },
    []
  )

  const handleDragOver = useCallback(
    (event: React.DragEvent, index: number) => {
      event.preventDefault()
      if (dragIndex === null) return

      const pinnedCount = tabs.filter((t) => t.isPinned).length
      const sourceTab = tabs[dragIndex]
      if (!sourceTab) return

      if (!sourceTab.isPinned && index < pinnedCount) return
      if (sourceTab.isPinned && index >= pinnedCount) return

      setDropTargetIndex(index)
    },
    [dragIndex, tabs]
  )

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      if (dragIndex !== null && dropTargetIndex !== null && dragIndex !== dropTargetIndex) {
        onReorderTabs(dragIndex, dropTargetIndex)
      }
      setDragIndex(null)
      setDropTargetIndex(null)
    },
    [dragIndex, dropTargetIndex, onReorderTabs]
  )

  const handleDragEnd = useCallback(() => {
    setDragIndex(null)
    setDropTargetIndex(null)
  }, [])

  const handleOverflowSelect = useCallback(
    (tabId: string) => {
      onSwitchTab(tabId)
      setShowOverflowMenu(false)
      const el = scrollContainerRef.current
      if (el) {
        const tabEl = el.querySelector(`[data-tab-id="${tabId}"]`)
        tabEl?.scrollIntoView({ behavior: 'smooth', inline: 'center' })
      }
    },
    [onSwitchTab]
  )

  return (
    <div className="relative z-10 flex h-10 items-center border-b border-sys-darkBorder bg-[#050505]">
      {canScrollLeft && (
        <button
          type="button"
          onClick={scrollLeft}
          className="flex h-full w-7 shrink-0 items-center justify-center text-sys-darkMuted hover:bg-white/5 hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      <div
        ref={scrollContainerRef}
        className="flex min-w-0 flex-1 items-center overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
      >
        {tabs.length === 0 && (
          <div className="px-2 text-[12px] text-sys-darkMuted">No open files</div>
        )}

        {tabs.map((tab, index) => (
          <div key={tab.id} data-tab-id={tab.id} className="relative flex items-center">
            {dropTargetIndex === index && dragIndex !== null && dragIndex !== index && (
              <div className="absolute left-0 top-1 h-6 w-0.5 bg-indigo-500" />
            )}
            <TabItem
              tab={tab}
              isActive={tab.id === activeTabId}
              index={index}
              onContextMenu={onContextMenu}
              onClose={onCloseTab}
              onSwitch={onSwitchTab}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
            />
          </div>
        ))}
      </div>

      {canScrollRight && (
        <button
          type="button"
          onClick={scrollRight}
          className="flex h-full w-7 shrink-0 items-center justify-center text-sys-darkMuted hover:bg-white/5 hover:text-white"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      <div className="relative flex shrink-0 items-center gap-1 px-1">
        <button
          type="button"
          onClick={() => setShowOverflowMenu((prev) => !prev)}
          className="flex h-7 w-7 items-center justify-center rounded text-sys-darkMuted hover:bg-white/5 hover:text-white"
        >
          <ChevronDown className="h-4 w-4" />
        </button>

        {onQuickAI && (
          <button
            type="button"
            onClick={onQuickAI}
            className="flex items-center gap-1 rounded border border-white/20 px-2 py-1 text-[12px] font-medium text-white transition-colors hover:bg-white/10"
          >
            <Sparkles className="h-3 w-3" />
            AI
          </button>
        )}
      </div>

      {showOverflowMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowOverflowMenu(false)} />
          <div className="absolute right-2 top-full z-50 mt-1 max-h-64 w-56 overflow-y-auto rounded-md border border-sys-darkBorder bg-[#1A1A1A] py-1 shadow-xl">
            {tabs.length === 0 && (
              <div className="px-3 py-2 text-xs text-sys-darkMuted">No open files</div>
            )}
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleOverflowSelect(tab.id)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-white/5',
                  tab.id === activeTabId ? 'text-white' : 'text-sys-darkMuted'
                )}
              >
                {tab.id === activeTabId && <span className="text-indigo-400">●</span>}
                {tab.isDirty && tab.id !== activeTabId && (
                  <span className="h-1.5 w-1.5 rounded-full bg-status-warning" />
                )}
                <span className="truncate">{tab.fileName}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
