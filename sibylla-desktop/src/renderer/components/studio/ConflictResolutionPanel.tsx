import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { PixelOctoIcon } from '../brand/PixelOctoIcon'
import { cn } from '../../utils/cn'

type MergeChoice = 'yours' | 'theirs' | 'ai' | 'manual'

interface ConflictResolutionPanelProps {
  path: string
  yourLines?: string[]
  theirLines?: string[]
  aiMergeText?: string
  onApplyYours?: () => void
  onApplyTheirs?: () => void
  onApplyAI?: () => void
  onManualEdit?: () => void
}

const YOUR_LINES = [
  'Members are divided into three tiers:',
  '- Basic Member',
  '- Premium Member',
  '- Enterprise Member',
]

const THEIR_LINES = [
  'Members are divided into four tiers:',
  '+ Free User',
  '- Basic Member',
  '- Premium Member',
  '- Enterprise Member',
]

const AI_MERGE = 'Members are divided into four tiers: Free User, Basic Member, Premium Member, Enterprise Member.'

function toSummary(lines: string[]): string {
  return lines
    .map((line) => line.replace(/^[-+]\s*/, '').trim())
    .filter(Boolean)
    .join(' ')
}

export function ConflictResolutionPanel({
  path,
  yourLines = YOUR_LINES,
  theirLines = THEIR_LINES,
  aiMergeText = AI_MERGE,
  onApplyYours,
  onApplyTheirs,
  onApplyAI,
  onManualEdit,
}: ConflictResolutionPanelProps) {
  const [choice, setChoice] = useState<MergeChoice>('ai')

  const mergeText = useMemo(() => {
    if (choice === 'yours') {
      return toSummary(yourLines)
    }
    if (choice === 'theirs') {
      return toSummary(theirLines)
    }
    if (choice === 'manual') {
      return 'Manual mode enabled. You can edit the merge result directly in the document.'
    }
    return aiMergeText
  }, [aiMergeText, choice, theirLines, yourLines])

  return (
    <section className="my-8 overflow-hidden rounded-xl border border-status-warning bg-[#1A1500] shadow-lg">
      <div className="flex items-center gap-2 border-b border-status-warning/30 bg-status-warning/10 px-4 py-2 text-sm font-medium text-status-warning">
        <AlertTriangle className="h-4 w-4" />
        File Conflict: {path}
      </div>

      <div className="grid grid-cols-2 border-b border-status-warning/20">
        <div className="border-r border-status-warning/20 p-4">
          <div className="mb-3 font-mono text-xs uppercase text-gray-500">Your Version</div>
          <div className="space-y-1 font-mono text-[13px] text-gray-300">
            {yourLines.map((line, index) => {
              const isRemove = line.startsWith('-')
              return (
                <p
                  key={`your-${line}-${index}`}
                  className={cn(isRemove && 'rounded bg-status-error/10 px-1 text-status-error')}
                >
                  {line}
                </p>
              )
            })}
          </div>
        </div>

        <div className="p-4">
          <div className="mb-3 font-mono text-xs uppercase text-gray-500">Their Version (Bob)</div>
          <div className="space-y-1 font-mono text-[13px] text-gray-300">
            {theirLines.map((line, index) => {
              const isAdd = line.startsWith('+')
              return (
                <p
                  key={`their-${line}-${index}`}
                  className={cn(isAdd && 'rounded bg-status-success/10 px-1 text-status-success')}
                >
                  {line}
                </p>
              )
            })}
          </div>
        </div>
      </div>

      <div className="border-b border-status-warning/20 bg-sys-black/50 p-4">
        <div className="mb-2 flex items-center gap-2 font-mono text-xs text-white">
          <PixelOctoIcon className="h-4 w-4" />
          AI Suggested Merge:
        </div>
        <div className="font-mono text-[13px] text-gray-200">{mergeText}</div>
      </div>

      <div className="flex flex-wrap gap-2 bg-[#111111] p-3">
        <button
          type="button"
          onClick={() => {
            setChoice('yours')
            onApplyYours?.()
          }}
          className="rounded border border-sys-darkBorder bg-sys-darkSurface px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
        >
          Accept Yours
        </button>
        <button
          type="button"
          onClick={() => {
            setChoice('theirs')
            onApplyTheirs?.()
          }}
          className="rounded border border-sys-darkBorder bg-sys-darkSurface px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
        >
          Accept Theirs
        </button>
        <button
          type="button"
          onClick={() => {
            setChoice('ai')
            onApplyAI?.()
          }}
          className="rounded bg-white px-3 py-1.5 text-xs font-medium text-black shadow-[0_0_15px_rgba(255,255,255,0.2)] transition-colors hover:bg-gray-200"
        >
          Accept AI Suggestion
        </button>
        <button
          type="button"
          onClick={() => {
            setChoice('manual')
            onManualEdit?.()
          }}
          className="ml-auto rounded border border-transparent bg-transparent px-3 py-1.5 text-xs font-medium text-sys-darkMuted transition-colors hover:text-white"
        >
          Edit Manually
        </button>
      </div>
    </section>
  )
}
