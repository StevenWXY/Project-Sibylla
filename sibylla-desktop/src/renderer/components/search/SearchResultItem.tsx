import React from 'react'
import type { UnifiedSearchResultShared } from '../../../shared/types'

interface SearchResultItemProps {
  result: UnifiedSearchResultShared
  selected: boolean
  query: string
  onSelect: (result: UnifiedSearchResultShared) => void
  onHover: () => void
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0)
  if (terms.length === 0) return text

  const lowerText = text.toLowerCase()
  const firstTerm = terms.find(t => lowerText.includes(t))
  if (!firstTerm) return text

  const parts: React.ReactNode[] = []
  let remaining = text
  let remainingLower = lowerText
  let keyIdx = 0

  while (remaining.length > 0) {
    const idx = remainingLower.indexOf(firstTerm)
    if (idx === -1) {
      parts.push(remaining)
      break
    }
    if (idx > 0) parts.push(remaining.slice(0, idx))
    parts.push(
      <mark key={keyIdx++} className="bg-indigo-500/30 text-white rounded-sm px-0.5">
        {remaining.slice(idx, idx + firstTerm.length)}
      </mark>,
    )
    remaining = remaining.slice(idx + firstTerm.length)
    remainingLower = remaining.toLowerCase()
  }

  return parts
}

export const SearchResultItem: React.FC<SearchResultItemProps> = ({
  result,
  selected,
  query,
  onSelect,
  onHover,
}) => {
  return (
    <div
      className={`px-3 py-2 cursor-pointer rounded-lg mx-1 ${
        selected ? 'bg-indigo-500/20' : 'hover:bg-white/5'
      }`}
      onClick={() => onSelect(result)}
      onMouseEnter={onHover}
    >
      <div className="flex items-center gap-2">
        <span className="text-white text-sm font-medium truncate flex-1">
          {highlightText(result.title, query)}
        </span>
        <span className="text-sys-darkTextSecondary/60 text-xs shrink-0">
          {(result.metadata.score * 100).toFixed(0)}%
        </span>
      </div>
      <div className="text-sys-darkTextSecondary text-xs mt-0.5 line-clamp-2">
        {highlightText(result.snippet, query)}
      </div>
    </div>
  )
}
