import React, { useState, useMemo } from 'react'
import { cn } from '../../utils/cn'
import { formatRelativeTime } from '../../utils/formatRelativeTime'
import type { MemoryEntry } from '../../../shared/types'

interface MemoryEntryCardProps {
  entry: MemoryEntry
  searchQuery?: string
  onEdit: () => void
  onLock: (locked: boolean) => void
  onDelete: () => void
  onViewHistory: () => void
}

/**
 * MemoryEntryCard — renders a single memory entry with content preview,
 * confidence bar, hit count, timestamps, and action buttons.
 */
export const MemoryEntryCard = React.memo(function MemoryEntryCard({
  entry,
  searchQuery,
  onEdit,
  onLock,
  onDelete,
  onViewHistory,
}: MemoryEntryCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Confidence bar color
  const confidenceColor =
    entry.confidence >= 0.8
      ? 'bg-green-500'
      : entry.confidence >= 0.5
        ? 'bg-yellow-500'
        : 'bg-red-500'

  // Content with search highlight
  const displayContent = useMemo(() => {
    const content = expanded ? entry.content : truncateContent(entry.content, 3)
    if (!searchQuery) return content
    return highlightMatches(content, searchQuery)
  }, [entry.content, expanded, searchQuery])

  const needsTruncation = entry.content.split('\n').length > 3 || entry.content.length > 200

  const handleDelete = () => {
    if (confirmDelete) {
      onDelete()
      setConfirmDelete(false)
    } else {
      setConfirmDelete(true)
      // Auto-dismiss confirmation after 3s
      setTimeout(() => setConfirmDelete(false), 3000)
    }
  }

  return (
    <div className={cn(
      'rounded-md border border-white/10 bg-white/5 p-3 mb-2',
      'transition-colors hover:border-white/20',
    )}>
      {/* Content */}
      <div className="text-sm text-gray-200 whitespace-pre-wrap break-words mb-2">
        {typeof displayContent === 'string' ? (
          displayContent
        ) : (
          displayContent
        )}
      </div>

      {needsTruncation && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-indigo-400 hover:text-indigo-300 mb-2 transition-colors"
        >
          {expanded ? '收起' : '展开'}
        </button>
      )}

      {/* Metadata row */}
      <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
        {/* Confidence bar */}
        <div className="flex items-center gap-1.5" title={`置信度: ${(entry.confidence * 100).toFixed(0)}%`}>
          <span>置信度</span>
          <div className="h-1 w-12 overflow-hidden rounded-full bg-white/10">
            <div
              className={cn('h-full rounded-full', confidenceColor)}
              style={{ width: `${entry.confidence * 100}%` }}
            />
          </div>
          <span>{(entry.confidence * 100).toFixed(0)}%</span>
        </div>

        {/* Hit count */}
        <span className="rounded bg-white/10 px-1.5 py-0.5">
          命中 {entry.hits}
        </span>

        {/* Locked */}
        {entry.locked && (
          <span className="text-amber-400" title="已锁定">
            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
          </span>
        )}

        {/* Updated time */}
        <span title={entry.updatedAt}>
          {formatRelativeTime(entry.updatedAt)}
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        <ActionButton onClick={onEdit} title="编辑">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </ActionButton>

        <ActionButton
          onClick={() => onLock(!entry.locked)}
          title={entry.locked ? '解锁' : '锁定'}
        >
          {entry.locked ? (
            <svg className="h-3.5 w-3.5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
            </svg>
          )}
        </ActionButton>

        <ActionButton onClick={onViewHistory} title="查看历史">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </ActionButton>

        <ActionButton
          onClick={handleDelete}
          title={confirmDelete ? '确认删除?' : '删除'}
          className={confirmDelete ? 'text-red-400 hover:text-red-300' : ''}
        >
          {confirmDelete ? (
            <span className="text-xs font-medium">确认?</span>
          ) : (
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          )}
        </ActionButton>
      </div>
    </div>
  )
})

/** Small icon button for card actions */
function ActionButton({
  onClick,
  title,
  className,
  children,
}: {
  onClick: () => void
  title: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'rounded p-1 text-gray-500 transition-colors',
        'hover:bg-white/10 hover:text-white',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-400',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** Truncate content to N lines */
function truncateContent(content: string, maxLines: number): string {
  const lines = content.split('\n')
  if (lines.length <= maxLines && content.length <= 200) return content
  const truncated = lines.slice(0, maxLines).join('\n')
  return truncated.length > 200 ? truncated.slice(0, 200) + '...' : truncated + '...'
}

/** Highlight search matches — uses case-insensitive test without global flag to avoid lastIndex state */
function highlightMatches(content: string, query: string): React.ReactNode {
  if (!query) return content

  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const splitRegex = new RegExp(`(${escaped})`, 'gi')
  const testRegex = new RegExp(`^${escaped}$`, 'i') // no 'g' flag — avoids lastIndex bug
  const parts = content.split(splitRegex)

  return (
    <>
      {parts.map((part, i) =>
        testRegex.test(part) ? (
          <mark key={i} className="bg-yellow-500/30 text-yellow-200 rounded px-0.5">
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </>
  )
}
