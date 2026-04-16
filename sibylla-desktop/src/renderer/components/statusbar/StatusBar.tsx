import { CircleDollarSign } from 'lucide-react'
import { PixelOctoIcon } from '../brand/PixelOctoIcon'
import { SyncStatusIndicator } from './SyncStatusIndicator'
import { cn } from '../../utils/cn'

export interface StatusBarProps {
  readonly className?: string
}

export function StatusBar({ className }: StatusBarProps) {
  return (
    <footer
      className={cn(
        'flex h-8 shrink-0 items-center justify-between border-t border-sys-darkBorder bg-[#050505] px-4 font-mono text-[12px] text-gray-400',
        className
      )}
    >
      <div className="flex items-center gap-4">
        <button className="inline-flex items-center gap-1.5 transition-colors hover:text-white">
          <PixelOctoIcon className="h-3.5 w-3.5 text-white" />
          <span>Plan</span>
          <span className="text-[10px]">&#9662;</span>
        </button>
        <div className="h-3 w-px bg-sys-darkBorder" />
        <button className="inline-flex items-center gap-1.5 transition-colors hover:text-white">
          <span>Claude 3.5 Sonnet</span>
          <span className="text-[10px]">&#9662;</span>
        </button>
      </div>

      <div className="flex items-center gap-4">
        <span className="inline-flex items-center gap-1.5">
          <CircleDollarSign className="h-3.5 w-3.5" />
          <span>Credits: 1,240</span>
        </span>
        <div className="h-3 w-px bg-sys-darkBorder" />
        <SyncStatusIndicator />
      </div>
    </footer>
  )
}
