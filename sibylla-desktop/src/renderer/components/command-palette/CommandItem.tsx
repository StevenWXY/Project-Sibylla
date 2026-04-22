import React, { useCallback } from 'react'
import type { CommandShared } from '../../../shared/types'

interface CommandItemProps {
  command: CommandShared
  selected: boolean
  query: string
  onSelect: (id: string) => void
  onHover?: (id: string) => void
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const index = lowerText.indexOf(lowerQuery)
  if (index === -1) return text
  return (
    <>
      {text.slice(0, index)}
      <mark className="bg-indigo-500/30 text-white rounded-sm px-0.5">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  )
}

export const CommandItem: React.FC<CommandItemProps> = ({
  command,
  selected,
  query,
  onSelect,
  onHover,
}) => {
  const handleClick = useCallback(() => {
    onSelect(command.id)
  }, [onSelect, command.id])

  const handleMouseEnter = useCallback(() => {
    onHover?.(command.id)
  }, [onHover, command.id])

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors ${
        selected ? 'bg-indigo-500/10 text-white' : 'text-sys-darkTextSecondary hover:bg-[#1a1a1a]'
      }`}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
    >
      {command.icon && <span className="text-sm">{command.icon}</span>}
      <span className="flex-1 text-sm truncate">
        {highlightMatch(command.title, query)}
      </span>
      {command.shortcut && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a1a1a] text-sys-darkTextSecondary font-mono">
          {command.shortcut}
        </span>
      )}
    </div>
  )
}
