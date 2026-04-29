import { useCallback, useEffect, useRef, useState } from 'react'

export interface WikiLinkPickerItem {
  path: string
  title: string
}

export interface WikiLinkPickerProps {
  items: WikiLinkPickerItem[]
  command: (item: WikiLinkPickerItem) => void
}

export function WikiLinkPickerElement({ items, command }: WikiLinkPickerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev + items.length - 1) % items.length)
        return true
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % items.length)
        return true
      }
      if (event.key === 'Enter') {
        if (items.length > 0) {
          command(items[selectedIndex])
        }
        return true
      }
      return false
    },
    [items, selectedIndex, command],
  )

  useEffect(() => {
    setSelectedIndex(0)
  }, [items])

  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const selectedEl = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    selectedEl?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (items.length === 0) {
    return (
      <div className="wiki-link-picker">
        <div className="wiki-link-picker-empty">No matching files</div>
      </div>
    )
  }

  return (
    <div className="wiki-link-picker" ref={listRef}>
      {items.map((item, index) => (
        <button
          key={item.path}
          className={`wiki-link-picker-item ${index === selectedIndex ? 'selected' : ''}`}
          onClick={() => command(item)}
          onMouseEnter={() => setSelectedIndex(index)}
          type="button"
        >
          <span className="wiki-link-picker-title">{item.title}</span>
          <span className="wiki-link-picker-path">{item.path}</span>
        </button>
      ))}
    </div>
  )
}

export { WikiLinkPickerElement as default }
