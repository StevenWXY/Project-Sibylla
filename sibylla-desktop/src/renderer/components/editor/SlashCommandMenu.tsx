import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import type { SlashCommandItem, SlashCommandCallback } from './extensions/slash-command'

interface SlashCommandMenuProps {
  items: SlashCommandItem[]
  selectedIndex: number
  onSelect: (index: number) => void
  position: { top: number; left: number } | null
}

export const SlashCommandMenu = forwardRef(function SlashCommandMenu(
  { items, selectedIndex, onSelect, position }: SlashCommandMenuProps,
  ref
) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [hoveredIndex, setHoveredIndex] = useState(-1)

  useImperativeHandle(ref, () => ({
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp') {
        onSelect((selectedIndex - 1 + items.length) % items.length)
        return true
      }
      if (event.key === 'ArrowDown') {
        onSelect((selectedIndex + 1) % items.length)
        return true
      }
      if (event.key === 'Enter') {
        onSelect(selectedIndex)
        return true
      }
      if (event.key === 'Escape') {
        return true
      }
      return false
    },
  }))

  useEffect(() => {
    if (menuRef.current && selectedIndex >= 0 && selectedIndex < items.length) {
      const selectedEl = menuRef.current.children[selectedIndex] as HTMLElement
      selectedEl?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex, items.length])

  if (items.length === 0 || !position) return null

  return (
    <div
      className="slash-command-menu fixed z-50"
      style={{ top: position.top, left: position.left }}
      ref={menuRef}
    >
      {items.map((item, index) => (
        <div
          key={item.title}
          className={`slash-command-item ${index === selectedIndex || index === hoveredIndex ? 'is-selected' : ''}`}
          onClick={() => onSelect(index)}
          onMouseEnter={() => setHoveredIndex(index)}
          onMouseLeave={() => setHoveredIndex(-1)}
        >
          <span className="command-icon">{item.icon}</span>
          <div className="command-info">
            <div className="command-title">{item.title}</div>
            <div className="command-desc">{item.description}</div>
          </div>
        </div>
      ))}
    </div>
  )
})

export function useSlashCommandState() {
  const [items, setItems] = useState<SlashCommandItem[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const commandRef = useRef<(item: SlashCommandItem) => void>(() => {})
  const menuRef = useRef<{ onKeyDown: (event: KeyboardEvent) => boolean } | null>(null)

  const handleCallback: SlashCommandCallback = useCallback(
    ({ items: newItems, command, range }) => {
      setItems(newItems)
      setSelectedIndex(0)
      commandRef.current = command

      if (newItems.length > 0 && range) {
        const selection = window.getSelection()
        if (selection && selection.rangeCount > 0) {
          const rect = selection.getRangeAt(0).getBoundingClientRect()
          setPosition({
            top: rect.bottom + 4,
            left: rect.left,
          })
        }
      } else {
        setPosition(null)
      }
    },
    []
  )

  const handleSelect = useCallback(
    (index: number) => {
      if (index >= 0 && index < items.length) {
        commandRef.current(items[index])
        setItems([])
        setPosition(null)
      }
    },
    [items]
  )

  useEffect(() => {
    setSelectedIndex(0)
  }, [items])

  return {
    items,
    selectedIndex,
    position,
    handleCallback,
    handleSelect,
    menuRef,
  }
}
