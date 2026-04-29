import React, { useState } from 'react'
import type { SearchSourceShared, UnifiedSearchResultShared } from '../../../shared/types'
import { SearchResultItem } from './SearchResultItem'

interface SourceGroupProps {
  source: SearchSourceShared
  results: UnifiedSearchResultShared[]
  selectedIndex: number
  globalOffset: number
  query: string
  onSelect: (result: UnifiedSearchResultShared) => void
  onHover: (index: number) => void
}

const SOURCE_LABELS: Record<string, string> = {
  'memory': '记忆',
  'memory-archive': '归档记忆',
  'local-files': '文件',
  'handbook': '系统 Wiki',
  'mcp:github': 'GitHub',
  'mcp:slack': 'Slack',
  'mcp:notion': 'Notion',
  'plans-archive': '计划归档',
}

const SOURCE_ICONS: Record<string, string> = {
  'memory': '\u{1F9E0}',
  'memory-archive': '\u{1F4DA}',
  'local-files': '\u{1F4C4}',
  'handbook': '\u{1F4D6}',
  'mcp:github': '\u{1F50C}',
  'mcp:slack': '\u{1F50C}',
  'mcp:notion': '\u{1F50C}',
  'plans-archive': '\u{1F4CB}',
}

export const SourceGroup: React.FC<SourceGroupProps> = ({
  source,
  results,
  selectedIndex,
  globalOffset,
  query,
  onSelect,
  onHover,
}) => {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="mb-1">
      <button
        className="flex items-center gap-2 px-3 py-1.5 w-full text-left hover:bg-white/5 rounded-lg"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="text-xs">{collapsed ? '\u25B6' : '\u25BC'}</span>
        <span className="text-xs">{SOURCE_ICONS[source] ?? '\u{1F50D}'}</span>
        <span className="text-sys-darkTextSecondary text-xs font-medium">
          {SOURCE_LABELS[source] ?? source}
        </span>
        <span className="text-sys-darkTextSecondary/50 text-xs">
          ({results.length})
        </span>
      </button>
      {!collapsed &&
        results.map((result, i) => {
          const globalIndex = globalOffset + i
          return (
            <SearchResultItem
              key={result.id}
              result={result}
              selected={globalIndex === selectedIndex}
              query={query}
              onSelect={onSelect}
              onHover={() => onHover(globalIndex)}
            />
          )
        })}
    </div>
  )
}
