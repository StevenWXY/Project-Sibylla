import { useMemo } from 'react'
import { Sparkles, Check, Pencil, X } from 'lucide-react'
import type { MergeResult, Attribution } from '../../../shared/types'

interface AIMergePanelProps {
  readonly mergeResult: MergeResult
  readonly onAdopt: (mergedContent: string) => void
  readonly onEditAndAdopt: (mergedContent: string) => void
  readonly onDiscard: () => void
}

function isInRange(line: number, ranges: readonly (readonly [number, number])[]): boolean {
  return ranges.some(([start, end]) => line >= start && line <= end)
}

function getLineBackground(line: number, attribution: Attribution): string {
  if (isInRange(line, attribution.fromMine)) return 'bg-emerald-50 dark:bg-emerald-900/20'
  if (isInRange(line, attribution.fromTheirs)) return 'bg-blue-50 dark:bg-blue-900/20'
  if (isInRange(line, attribution.byAI)) return 'bg-amber-50 dark:bg-amber-900/20'
  return ''
}

export function AIMergePanel({
  mergeResult,
  onAdopt,
  onEditAndAdopt,
  onDiscard,
}: AIMergePanelProps) {
  const lines = useMemo(
    () => (mergeResult.mergedContent ?? '').split('\n'),
    [mergeResult.mergedContent],
  )

  return (
    <div className="flex flex-col border border-indigo-200 dark:border-indigo-800 rounded-lg overflow-hidden mt-3">
      <div className="flex items-center justify-between px-4 py-2 bg-indigo-50 dark:bg-indigo-900/30 border-b border-indigo-200 dark:border-indigo-800">
        <div className="flex items-center gap-2 text-sm font-medium text-indigo-700 dark:text-indigo-300">
          <Sparkles className="h-4 w-4" />
          AI 建议合并
        </div>
        <button
          type="button"
          onClick={onDiscard}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-4 px-4 py-1.5 text-xs border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-emerald-200 dark:bg-emerald-800" />
          你的修改
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-blue-200 dark:bg-blue-800" />
          对方修改
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-amber-200 dark:bg-amber-800" />
          AI 整合
        </span>
      </div>

      <div className="max-h-64 overflow-auto">
        <pre className="text-xs font-mono leading-relaxed">
          {lines.map((line, i) => {
            const lineNum = i + 1
            const bg = mergeResult.attribution
              ? getLineBackground(lineNum, mergeResult.attribution)
              : ''
            return (
              <div
                key={lineNum}
                className={`flex ${bg}`}
              >
                <span className="inline-block w-10 shrink-0 text-right pr-3 text-gray-400 select-none border-r border-gray-100 dark:border-gray-800">
                  {lineNum}
                </span>
                <span className="pl-3 whitespace-pre-wrap break-all">{line}</span>
              </div>
            )
          })}
        </pre>
      </div>

      {mergeResult.rationale && (
        <div className="px-4 py-2 text-xs text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
          <span className="font-medium text-indigo-600 dark:text-indigo-400">💡</span>{' '}
          {mergeResult.rationale}
        </div>
      )}

      <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <button
          type="button"
          onClick={() => onAdopt(mergeResult.mergedContent ?? '')}
          className="flex items-center gap-1.5 px-4 py-2 text-xs bg-indigo-500 hover:bg-indigo-600 text-white rounded transition-colors"
        >
          <Check className="h-3.5 w-3.5" />
          采用此方案
        </button>
        <button
          type="button"
          onClick={() => onEditAndAdopt(mergeResult.mergedContent ?? '')}
          className="flex items-center gap-1.5 px-4 py-2 text-xs bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
          编辑后采用
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="flex items-center gap-1.5 px-4 py-2 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors ml-auto"
        >
          放弃
        </button>
      </div>
    </div>
  )
}
