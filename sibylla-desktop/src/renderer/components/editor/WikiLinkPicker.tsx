import { useEffect, useRef, useState } from 'react'

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
