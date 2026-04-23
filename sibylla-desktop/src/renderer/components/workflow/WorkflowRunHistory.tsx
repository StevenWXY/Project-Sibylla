import React from 'react'
import { Clock, CheckCircle2, XCircle, Loader2, Pause, StopCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '../../utils/cn'
import type { WorkflowRunSummary, WorkflowRunStatus } from '../../../shared/types'

const STATUS_CONFIG: Record<WorkflowRunStatus, { icon: React.ReactNode; color: string; label: string }> = {
  completed: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: 'text-status-success', label: '完成' },
  failed: { icon: <XCircle className="w-3.5 h-3.5" />, color: 'text-status-error', label: '失败' },
  running: { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, color: 'text-status-info', label: '运行中' },
  paused: { icon: <Pause className="w-3.5 h-3.5" />, color: 'text-status-warning', label: '暂停' },
  cancelled: { icon: <StopCircle className="w-3.5 h-3.5" />, color: 'text-sys-muted', label: '已取消' },
}

interface WorkflowRunHistoryProps {
  runs: WorkflowRunSummary[]
  onRefresh: () => void
  className?: string
}

export const WorkflowRunHistory: React.FC<WorkflowRunHistoryProps> = ({ runs, onRefresh, className }) => {
  if (runs.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-32 text-sys-muted text-sm', className)}>
        暂无运行记录
      </div>
    )
  }

  return (
    <div className={cn('p-4', className)}>
      <div className="space-y-2">
        {runs.map((run) => {
          const config = STATUS_CONFIG[run.status]
          const progress = run.stepCount > 0 ? (run.completedSteps / run.stepCount) * 100 : 0

          return (
            <RunRow key={run.runId} run={run} config={config} progress={progress} />
          )
        })}
      </div>
    </div>
  )
}

const RunRow: React.FC<{
  run: WorkflowRunSummary
  config: { icon: React.ReactNode; color: string; label: string }
  progress: number
}> = ({ run, config, progress }) => {
  const [expanded, setExpanded] = React.useState(false)

  return (
    <div
      className="rounded-lg border border-sys-darkBorder bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
    >
      <div
        className="flex items-center gap-3 px-3 py-2 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <button className="p-0 text-sys-muted">
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>

        <div className={cn('flex items-center gap-1.5', config.color)}>
          {config.icon}
          <span className="text-xs">{config.label}</span>
        </div>

        <span className="text-xs font-mono text-sys-muted">
          {run.runId.slice(0, 8)}
        </span>

        <div className="flex-1" />

        <span className="text-[10px] text-sys-muted">
          {run.completedSteps}/{run.stepCount} 步
        </span>

        <div className="w-16 h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-status-success transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        <span className="text-[10px] text-sys-muted flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {new Date(run.startedAt).toLocaleTimeString()}
        </span>
      </div>

      {expanded && (
        <div className="px-3 pb-2 text-xs text-sys-muted border-t border-sys-darkBorder pt-2">
          <div className="grid grid-cols-2 gap-2">
            <div>Run ID: {run.runId}</div>
            <div>Workflow: {run.workflowId}</div>
            <div>开始: {new Date(run.startedAt).toLocaleString()}</div>
            <div>
              结束: {run.endedAt ? new Date(run.endedAt).toLocaleString() : '-'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
