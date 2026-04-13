import { Button } from '../ui/Button'

export interface DiffLine {
  type: 'add' | 'remove' | 'context'
  text: string
}

interface AIDiffPreviewCardProps {
  filename: string
  lines: DiffLine[]
  onApply?: () => void
  onEditApply?: () => void
}

export function AIDiffPreviewCard({
  filename,
  lines,
  onApply,
  onEditApply,
}: AIDiffPreviewCardProps) {
  return (
    <div className="rounded-lg border border-sys-darkBorder bg-sys-black font-mono text-xs">
      <div className="border-b border-sys-darkBorder bg-sys-darkSurface px-2 py-1 text-gray-400">
        {filename}
      </div>
      <div className="space-y-1 p-2">
        {lines.map((line, index) => {
          const classes =
            line.type === 'remove'
              ? 'bg-status-error/10 text-status-error'
              : line.type === 'add'
                ? 'bg-status-success/10 text-status-success'
                : 'text-gray-300'

          const symbol =
            line.type === 'remove'
              ? '-'
              : line.type === 'add'
                ? '+'
                : ' '

          return (
            <div key={`${line.type}-${line.text}-${index}`} className={`flex rounded px-1 ${classes}`}>
              <span className="w-4 select-none">{symbol}</span>
              <span>{line.text}</span>
            </div>
          )
        })}
      </div>

      {(onApply || onEditApply) && (
        <div className="flex items-center gap-2 border-t border-sys-darkBorder px-2 py-2">
          {onApply && (
            <Button size="sm" variant="primary" onClick={onApply} className="h-8 px-4 text-xs">
              Apply
            </Button>
          )}
          {onEditApply && (
            <Button size="sm" variant="secondary" onClick={onEditApply} className="h-8 px-4 text-xs">
              Edit & Apply
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
