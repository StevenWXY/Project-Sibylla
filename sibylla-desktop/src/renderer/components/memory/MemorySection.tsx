import React, { useState } from 'react'
import { cn } from '../../utils/cn'
import { MemoryEntryCard } from './MemoryEntryCard'
import type { MemoryEntry, MemorySection as MemorySectionType } from '../../../shared/types'

/** Chinese labels for section types */
const MEMORY_SECTION_LABELS: Record<MemorySectionType, string> = {
  user_preference: '用户偏好',
  technical_decision: '技术决策',
  common_issue: '常见问题',
  project_convention: '项目约定',
  risk_note: '风险提示',
  glossary: '关键术语',
}

interface MemorySectionProps {
  section: MemorySectionType
  entries: MemoryEntry[]
  searchQuery?: string
  onEdit: (entry: MemoryEntry) => void
  onLock: (entry: MemoryEntry, locked: boolean) => void
  onDelete: (entry: MemoryEntry) => void
  onViewHistory: (entry: MemoryEntry) => void
}

/**
 * MemorySection — collapsible section grouping entries by type.
 * Entries are sorted by confidence × log(hits + 1) descending.
 */
export const MemorySection = React.memo(function MemorySection({
  section,
  entries,
  searchQuery,
  onEdit,
  onLock,
  onDelete,
  onViewHistory,
}: MemorySectionProps) {
  const [collapsed, setCollapsed] = useState(false)

  // Sort entries by relevance score: confidence × log(hits + 1)
  const sortedEntries = React.useMemo(
    () =>
      [...entries].sort((a, b) => {
        const scoreA = a.confidence * Math.log(a.hits + 1)
        const scoreB = b.confidence * Math.log(b.hits + 1)
        return scoreB - scoreA
      }),
    [entries],
  )

  if (entries.length === 0) return null

  const label = MEMORY_SECTION_LABELS[section] ?? section

  return (
    <div className="mb-3">
      {/* Section header — clickable to collapse/expand */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-4 py-2',
          'text-left text-sm font-medium text-gray-300',
          'hover:bg-white/5 transition-colors',
        )}
      >
        {/* Chevron */}
        <svg
          className={cn(
            'h-3 w-3 text-gray-500 transition-transform duration-200',
            collapsed ? '' : 'rotate-90',
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>

        <span>{label}</span>

        {/* Entry count badge */}
        <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-xs text-gray-500">
          {entries.length}
        </span>
      </button>

      {/* Entries */}
      {!collapsed && (
        <div className="px-4 pt-1">
          {sortedEntries.map((entry) => (
            <MemoryEntryCard
              key={entry.id}
              entry={entry}
              searchQuery={searchQuery}
              onEdit={() => onEdit(entry)}
              onLock={(locked) => onLock(entry, locked)}
              onDelete={() => onDelete(entry)}
              onViewHistory={() => onViewHistory(entry)}
            />
          ))}
        </div>
      )}
    </div>
  )
})
