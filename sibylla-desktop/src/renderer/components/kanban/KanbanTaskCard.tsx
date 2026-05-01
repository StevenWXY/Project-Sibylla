import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { KanbanTask } from '../../store/kanbanStore'

const PRIORITY_COLORS: Record<string, string> = {
  P0: '#EF4444',
  P1: '#F97316',
  P2: '#3B82F6',
}

interface KanbanTaskCardProps {
  task: KanbanTask
  columnId: string
  isSelected: boolean
  onSelect: () => void
}

export const KanbanTaskCard: React.FC<KanbanTaskCardProps> = ({
  task,
  columnId,
  isSelected,
  onSelect,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { columnId } })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: isSelected ? '#EEF2FF' : '#FFFFFF',
    border: isSelected ? '1px solid #6366F1' : '1px solid #E5E7EB',
    borderRadius: 8,
    padding: 12,
    cursor: 'grab',
    boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.05)',
    position: 'relative' as const,
  }

  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== '已完成'
  const priorityColor = task.priority ? PRIORITY_COLORS[task.priority] : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onSelect}
    >
      {priorityColor && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          borderRadius: '8px 8px 0 0',
          background: priorityColor,
        }} />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{
          fontSize: 13,
          fontWeight: 500,
          color: '#1F2937',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: '18px',
        }}>
          {task.title}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {task.isAiLinked && (
            <span title="AI 已认领" style={{ fontSize: 14 }}>🤖</span>
          )}
          {task.isAiSuggested && !task.isAiLinked && (
            <span title="AI 建议" style={{ fontSize: 14 }}>✨</span>
          )}
        </div>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginTop: 8,
        fontSize: 11,
        color: '#6B7280',
        flexWrap: 'wrap',
      }}>
        {task.assignee && (
          <span style={{
            background: '#F3F4F6',
            padding: '1px 6px',
            borderRadius: 4,
          }}>
            {task.assignee}
          </span>
        )}
        {task.priority && (
          <span style={{
            color: priorityColor,
            fontWeight: 600,
          }}>
            {task.priority}
          </span>
        )}
        {task.deadline && (
          <span style={{
            color: isOverdue ? '#EF4444' : '#6B7280',
            fontWeight: isOverdue ? 600 : 400,
          }}>
            {task.deadline}
          </span>
        )}
      </div>
    </div>
  )
}
