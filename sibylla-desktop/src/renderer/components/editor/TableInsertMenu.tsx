import { useState, useRef, useEffect } from 'react'
import { cn } from '../../utils/cn'

interface TableInsertMenuProps {
  onSelect: (rows: number, cols: number) => void
  onClose: () => void
  position: { top: number; left: number }
}

const MAX_GRID = 6

export function TableInsertMenu({ onSelect, onClose, position }: TableInsertMenuProps) {
  const [hoveredRow, setHoveredRow] = useState(1)
  const [hoveredCol, setHoveredCol] = useState(1)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="fixed z-50 rounded-lg border border-sys-darkBorder bg-[#1D1F23] p-3 shadow-xl"
      style={{ top: position.top, left: position.left }}
    >
      <div className="mb-2 text-xs text-gray-400">
        {hoveredRow} x {hoveredCol}
      </div>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${MAX_GRID}, 1fr)` }}>
        {Array.from({ length: MAX_GRID }, (_, row) =>
          Array.from({ length: MAX_GRID }, (_, col) => (
            <div
              key={`${row}-${col}`}
              className={cn(
                'h-5 w-5 rounded-sm border transition-colors',
                row <= hoveredRow && col <= hoveredCol
                  ? 'border-indigo-400 bg-indigo-500/30'
                  : 'border-sys-darkBorder bg-white/5'
              )}
              onMouseEnter={() => {
                setHoveredRow(row + 1)
                setHoveredCol(col + 1)
              }}
              onClick={() => onSelect(hoveredRow, hoveredCol)}
            />
          ))
        )}
      </div>
    </div>
  )
}
