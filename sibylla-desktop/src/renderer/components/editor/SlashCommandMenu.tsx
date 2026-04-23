import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react'
import type { SlashCommandItem, SlashCommandCallback } from './extensions/slash-command'

interface CommandParam {
  name: string
  type: 'string' | 'integer' | 'boolean' | 'enum'
  required: boolean
  description: string
  default?: unknown
  enum?: string[]
}

interface MissingParams {
  commandId: string
  commandTitle: string
  missingParams: CommandParam[]
  providedParams: Record<string, unknown>
}

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

export const SlashCommandParamForm: React.FC<{
  missingParams: MissingParams
  onSubmit: (params: Record<string, unknown>) => void
  onCancel: () => void
}> = ({ missingParams, onSubmit, onCancel }) => {
  const [formValues, setFormValues] = useState<Record<string, unknown>>({})

  const handleSubmit = useCallback(() => {
    const merged = { ...missingParams.providedParams, ...formValues }
    onSubmit(merged)
  }, [missingParams.providedParams, formValues, onSubmit])

  const handleChange = useCallback((name: string, value: unknown) => {
    setFormValues((prev) => ({ ...prev, [name]: value }))
  }, [])

  return (
    <div className="fixed z-50 bg-sys-darkSurface border border-sys-darkBorder rounded-lg shadow-xl p-4 min-w-[320px]">
      <div className="text-sm font-medium text-white mb-3">
        参数补全: {missingParams.commandTitle}
      </div>
      <div className="space-y-3">
        {missingParams.missingParams.map((param) => (
          <div key={param.name}>
            <label className="block text-xs text-sys-muted mb-1">
              {param.description || param.name}
              {param.required && <span className="text-status-error ml-1">*</span>}
            </label>
            {param.type === 'boolean' ? (
              <select
                className="w-full px-2 py-1.5 text-sm bg-white/5 border border-sys-darkBorder rounded text-white"
                value={String(formValues[param.name] ?? param.default ?? 'false')}
                onChange={(e) => handleChange(param.name, e.target.value === 'true')}
              >
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            ) : param.type === 'enum' && param.enum ? (
              <select
                className="w-full px-2 py-1.5 text-sm bg-white/5 border border-sys-darkBorder rounded text-white"
                value={String(formValues[param.name] ?? param.default ?? '')}
                onChange={(e) => handleChange(param.name, e.target.value)}
              >
                <option value="">选择...</option>
                {param.enum.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type={param.type === 'integer' ? 'number' : 'text'}
                className="w-full px-2 py-1.5 text-sm bg-white/5 border border-sys-darkBorder rounded text-white"
                placeholder={param.description || param.name}
                value={String(formValues[param.name] ?? param.default ?? '')}
                onChange={(e) => handleChange(
                  param.name,
                  param.type === 'integer' ? parseInt(e.target.value, 10) || 0 : e.target.value,
                )}
              />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button
          className="px-3 py-1.5 text-sm rounded hover:bg-white/10 text-sys-muted"
          onClick={onCancel}
        >
          取消
        </button>
        <button
          className="px-3 py-1.5 text-sm rounded bg-white/15 text-white hover:bg-white/20"
          onClick={handleSubmit}
        >
          确认
        </button>
      </div>
    </div>
  )
}
