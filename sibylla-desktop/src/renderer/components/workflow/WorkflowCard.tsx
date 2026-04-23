import React from 'react'
import { Clock, Zap } from 'lucide-react'
import { cn } from '../../utils/cn'
import type { WorkflowDefinition } from '../../../shared/types'

const TRIGGER_ICONS: Record<string, string> = {
  file_created: '📄',
  file_changed: '📝',
  schedule: '⏰',
  manual: '🖐️',
}

interface WorkflowCardProps {
  workflow: WorkflowDefinition
  selected: boolean
  onSelect: () => void
  className?: string
}

export const WorkflowCard: React.FC<WorkflowCardProps> = ({
  workflow,
  selected,
  onSelect,
  className,
}) => {
  const triggerIcons = workflow.triggers.map((t) => TRIGGER_ICONS[t.type] ?? '⚙️').join(' ')

  return (
    <div
      className={cn(
        'mx-2 my-1 px-3 py-2 rounded-lg cursor-pointer transition-colors',
        selected ? 'bg-white/10 border border-white/20' : 'hover:bg-white/5 border border-transparent',
        className,
      )}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm">{triggerIcons}</span>
          <span className="text-sm text-white truncate">{workflow.metadata.name}</span>
        </div>
        <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-sys-muted">
          {workflow.steps.length} 步
        </span>
      </div>

      <div className="flex items-center gap-2 mt-1 text-[10px] text-sys-muted">
        <span>{workflow.metadata.description.slice(0, 40)}{workflow.metadata.description.length > 40 ? '...' : ''}</span>
      </div>
    </div>
  )
}
