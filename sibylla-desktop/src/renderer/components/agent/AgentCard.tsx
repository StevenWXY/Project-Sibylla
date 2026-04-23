import React from 'react'
import { Bot, Wrench } from 'lucide-react'
import { Badge } from '../ui'
import { cn } from '../../utils/cn'

interface AgentCardProps {
  agent: {
    id: string
    name: string
    description: string
    model?: string
    allowedTools: string[]
    maxTurns: number
    source: 'builtin' | 'workspace'
  }
  className?: string
}

export const AgentCard: React.FC<AgentCardProps> = ({ agent, className }) => {
  return (
    <div
      className={cn(
        'rounded-lg border border-sys-darkBorder bg-sys-darkSurface p-3',
        'hover:border-white/20 transition-colors',
        className,
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-sys-muted" />
          <h3 className="text-sm font-medium text-white">{agent.name}</h3>
        </div>
        <Badge
          className={cn(
            'text-[10px] px-1.5 py-0.5',
            agent.source === 'builtin'
              ? 'bg-blue-500/20 text-blue-400'
              : 'bg-green-500/20 text-green-400',
          )}
        >
          {agent.source === 'builtin' ? '内置' : '工作区'}
        </Badge>
      </div>

      <p className="text-xs text-sys-muted line-clamp-2 mb-2">
        {agent.description}
      </p>

      <div className="flex items-center gap-3 text-[10px] text-sys-muted">
        {agent.model && (
          <span className="px-1.5 py-0.5 rounded bg-white/5">{agent.model}</span>
        )}
        <span className="px-1.5 py-0.5 rounded bg-white/5">
          {agent.maxTurns} turns
        </span>
        {agent.allowedTools.length > 0 && (
          <div className="flex items-center gap-1">
            <Wrench className="w-3 h-3" />
            <span className="truncate max-w-[120px]">
              {agent.allowedTools.slice(0, 3).join(', ')}
              {agent.allowedTools.length > 3 ? ` +${agent.allowedTools.length - 3}` : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
