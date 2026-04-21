import React from 'react'
import type { ChecklistItemShared } from '../../../shared/types'

interface TaskChecklistProps {
  items: ChecklistItemShared[]
}

const STATUS_ICONS: Record<string, string> = {
  'pending': '⏸',
  'in_progress': '🔄',
  'done': '✅',
  'skipped': '⏭',
}

export const TaskChecklist: React.FC<TaskChecklistProps> = ({ items }) => {
  return (
    <div style={{ fontSize: '11px' }}>
      {items.map((item, idx) => (
        <div
          key={idx}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '2px 0',
            color: item.status === 'done' ? '#059669' : item.status === 'in_progress' ? '#6366F1' : '#9CA3AF',
          }}
        >
          <span style={{ width: '16px', textAlign: 'center', fontSize: '10px' }}>
            {STATUS_ICONS[item.status] ?? '•'}
          </span>
          <span style={{ textDecoration: item.status === 'done' ? 'line-through' : 'none' }}>
            {item.description}
          </span>
        </div>
      ))}
    </div>
  )
}

export default TaskChecklist
