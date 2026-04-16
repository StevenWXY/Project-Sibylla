/**
 * DiffHighlight — Line-level diff highlighting component
 *
 * Uses the `diff` library to compute line-level differences between
 * two text versions and renders them with colored highlights.
 * - Added lines: emerald (green) background
 * - Removed lines: red background
 *
 * Performance: React.memo + useMemo to avoid re-computing diffs
 * when props haven't changed.
 */

import { memo, useMemo } from 'react'
import { diffLines, type Change } from 'diff'

interface DiffHighlightProps {
  /** The content to display */
  readonly content: string
  /** Optional content to compare against. If omitted, plain text is shown. */
  readonly compareAgainst?: string
}

const DiffHighlightInner = memo(function DiffHighlightInner({
  content,
  compareAgainst,
}: DiffHighlightProps) {
  const changes: Change[] = useMemo(() => {
    if (!compareAgainst) return []
    return diffLines(compareAgainst, content)
  }, [compareAgainst, content])

  if (!compareAgainst) {
    return (
      <pre className="p-3 text-sm font-mono whitespace-pre-wrap overflow-auto h-full text-gray-300">
        {content}
      </pre>
    )
  }

  return (
    <pre className="p-3 text-sm font-mono whitespace-pre-wrap overflow-auto h-full">
      {changes.map((change: Change, i: number) => {
        const className = change.added
          ? 'bg-emerald-100/10 dark:bg-emerald-900/20 text-emerald-400'
          : change.removed
            ? 'bg-red-100/10 dark:bg-red-900/20 text-red-400'
            : 'text-gray-300'

        return (
          <span key={`change-${i}`} className={className}>
            {change.value}
          </span>
        )
      })}
    </pre>
  )
})

export const DiffHighlight = DiffHighlightInner
