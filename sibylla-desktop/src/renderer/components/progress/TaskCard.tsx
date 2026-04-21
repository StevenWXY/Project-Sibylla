import React from 'react'
import type { TaskRecordShared } from '../../../shared/types'
import { TaskChecklist } from './TaskChecklist'

interface TaskCardProps {
  task: TaskRecordShared
  isActive?: boolean
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

const STATE_STYLES: Record<string, { bg: string; border: string; color: string; badge: string }> = {
  queued: { bg: '#F9FAFB', border: '#E5E7EB', color: '#6B7280', badge: '⏸' },
  running: { bg: '#EEF2FF', border: '#C7D2FE', color: '#6366F1', badge: '🔄' },
  paused: { bg: '#FEF3C7', border: '#FDE68A', color: '#D97706', badge: '⏸' },
  completed: { bg: '#ECFDF5', border: '#A7F3D0', color: '#059669', badge: '✅' },
  failed: { bg: '#FEF2F2', border: '#FECACA', color: '#DC2626', badge: '❌' },
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, isActive }) => {
  const style = STATE_STYLES[task.state] ?? STATE_STYLES.queued

  return (
    <div
      style={{
        padding: '10px 12px',
        marginBottom: '6px',
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: '8px',
        fontSize: '12px',
        transition: 'box-shadow 0.15s ease',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: style.color, display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>{style.badge}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {task.title}
            </span>
          </div>
          <div style={{ color: '#9CA3AF', fontSize: '11px', marginTop: '2px' }}>
            ID: {task.id.slice(0, 8)}...
            {task.mode && ` · ${task.mode}`}
            {' · '}{formatDuration(task.durationMs)}
          </div>
        </div>

        {task.traceId && (
          <button
            onClick={() => window.electronAPI.inspector.open(task.traceId)}
            style={{
              background: 'none',
              border: 'none',
              color: '#6366F1',
              cursor: 'pointer',
              fontSize: '11px',
              padding: '2px 6px',
              whiteSpace: 'nowrap',
              textDecoration: 'underline',
            }}
          >
            Trace →
          </button>
        )}
      </div>

      {/* Active: show checklist */}
      {isActive && task.checklist.length > 0 && (
        <div style={{ marginTop: '6px' }}>
          <TaskChecklist items={task.checklist} />
        </div>
      )}

      {/* Completed/Failed: show result */}
      {(task.state === 'completed' || task.state === 'failed') && (
        <div style={{ marginTop: '4px', fontSize: '11px', color: task.state === 'failed' ? '#DC2626' : '#059669' }}>
          {task.resultSummary ?? task.failureReason ?? ''}
        </div>
      )}
    </div>
  )
}

export default TaskCard
