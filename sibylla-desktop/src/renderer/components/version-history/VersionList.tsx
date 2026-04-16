import { Loader2 } from 'lucide-react'
import { cn } from '../../utils/cn'
import { formatRelativeTime } from '../../utils/formatRelativeTime'
import type { VersionEntry } from '../../store/versionHistoryStore'

interface VersionListProps {
  versions: readonly VersionEntry[]
  selected: VersionEntry | null
  isLoading: boolean
  onSelect: (version: VersionEntry) => void
}

export function VersionList({ versions, selected, isLoading, onSelect }: VersionListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    )
  }

  if (versions.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-8 text-xs text-gray-400 dark:text-gray-500">
        暂无版本记录
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {versions.map((version) => (
        <button
          key={version.oid}
          type="button"
          className={cn(
            'w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700 transition-colors',
            selected?.oid === version.oid
              ? 'bg-indigo-50 dark:bg-indigo-900/20'
              : 'hover:bg-gray-50 dark:hover:bg-gray-700/50',
          )}
          onClick={() => onSelect(version)}
        >
          <p className="text-sm font-medium truncate text-gray-900 dark:text-gray-100">
            {version.summary}
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span>{version.author}</span>
            <span>·</span>
            <span>{formatRelativeTime(version.timestamp)}</span>
          </div>
        </button>
      ))}
    </div>
  )
}
