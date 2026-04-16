import type { DiffHunk } from '../../../shared/types/git.types'
import { cn } from '../../utils/cn'

interface DiffHunkViewProps {
  hunks: readonly DiffHunk[]
}

const LINE_STYLES: Record<string, string> = {
  add: 'bg-emerald-50 text-emerald-800 border-l-2 border-emerald-400 dark:bg-emerald-900/20 dark:text-emerald-300',
  delete: 'bg-red-50 text-red-800 border-l-2 border-red-400 dark:bg-red-900/20 dark:text-red-300',
  context: 'text-gray-600 border-l-2 border-transparent dark:text-gray-400',
}

const LINE_PREFIX: Record<string, string> = {
  add: '+',
  delete: '-',
  context: ' ',
}

export function DiffHunkView({ hunks }: DiffHunkViewProps) {
  if (hunks.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
        无差异
      </div>
    )
  }

  return (
    <div className="font-mono text-xs whitespace-pre-wrap">
      {hunks.map((hunk, hunkIndex) => (
        <div key={hunkIndex}>
          <div className="px-3 py-1 bg-gray-100 text-gray-500 text-[10px] dark:bg-gray-700/50 dark:text-gray-400">
            @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
          </div>
          {hunk.lines.map((line, lineIndex) => (
            <div
              key={lineIndex}
              className={cn('px-3 py-0.5', LINE_STYLES[line.type] ?? LINE_STYLES.context)}
            >
              <span className="select-none opacity-60">{LINE_PREFIX[line.type] ?? ' '}</span>
              {line.content}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
