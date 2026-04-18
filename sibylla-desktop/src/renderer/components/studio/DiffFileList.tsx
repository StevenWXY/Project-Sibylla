import { memo } from 'react'
import { cn } from '../../utils/cn'
import type { ParsedFileDiff } from './types'

interface DiffFileListProps {
  proposals: readonly ParsedFileDiff[]
  activeIndex: number
  appliedPaths: readonly string[]
  onSelect: (index: number) => void
}

function getBaseName(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] ?? filePath
}

export const DiffFileList = memo(function DiffFileList({
  proposals,
  activeIndex,
  appliedPaths,
  onSelect,
}: DiffFileListProps) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-sys-darkBorder px-2 py-1">
      {proposals.map((proposal, index) => {
        const isActive = index === activeIndex
        const isApplied = appliedPaths.includes(proposal.filePath)

        return (
          <button
            key={proposal.filePath}
            type="button"
            onClick={() => onSelect(index)}
            className={cn(
              'shrink-0 rounded px-2.5 py-1 text-xs font-mono transition-colors',
              isActive
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                : 'text-gray-400 hover:text-gray-200 border border-transparent',
              isApplied && 'opacity-50 line-through'
            )}
          >
            {getBaseName(proposal.filePath)}
            <span className="ml-1.5 text-[10px]">
              <span className="text-emerald-400">+{proposal.stats.additions}</span>
              <span className="mx-0.5 text-gray-500">/</span>
              <span className="text-red-400">-{proposal.stats.deletions}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
})
