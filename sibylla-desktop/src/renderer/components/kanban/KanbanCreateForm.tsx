import React, { useState, useCallback } from 'react'
import { useKanbanStore } from '../../store/kanbanStore'

export const KanbanCreateForm: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [priority, setPriority] = useState<'P0' | 'P1' | 'P2' | ''>('')
  const [deadline, setDeadline] = useState('')
  const createTask = useKanbanStore((s) => s.createTask)

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!title.trim()) return

      await createTask({
        title: title.trim(),
        assignee: assignee.trim() || undefined,
        priority: priority || undefined,
        deadline: deadline || undefined,
      })

      setTitle('')
      setAssignee('')
      setPriority('')
      setDeadline('')
      setIsOpen(false)
    },
    [title, assignee, priority, deadline, createTask],
  )

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          background: 'none',
          border: '1px dashed #D1D5DB',
          borderRadius: 6,
          padding: '2px 8px',
          fontSize: 16,
          color: '#9CA3AF',
          cursor: 'pointer',
          lineHeight: 1,
        }}
      >
        +
      </button>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={() => setIsOpen(false)}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{
          background: '#FFFFFF',
          borderRadius: 12,
          padding: 24,
          width: 400,
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        }}
      >
        <h3 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 600, color: '#1F2937' }}>
          新建任务
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="text"
            placeholder="标题（必填）"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            style={{
              padding: '8px 12px',
              border: '1px solid #E5E7EB',
              borderRadius: 6,
              fontSize: 14,
              outline: 'none',
            }}
          />

          <input
            type="text"
            placeholder="负责人"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid #E5E7EB',
              borderRadius: 6,
              fontSize: 14,
              outline: 'none',
            }}
          />

          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as 'P0' | 'P1' | 'P2' | '')}
            style={{
              padding: '8px 12px',
              border: '1px solid #E5E7EB',
              borderRadius: 6,
              fontSize: 14,
              color: priority ? '#1F2937' : '#9CA3AF',
              background: '#FFFFFF',
            }}
          >
            <option value="">优先级</option>
            <option value="P0">P0 - 紧急</option>
            <option value="P1">P1 - 重要</option>
            <option value="P2">P2 - 普通</option>
          </select>

          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid #E5E7EB',
              borderRadius: 6,
              fontSize: 14,
              color: '#1F2937',
            }}
          />
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          marginTop: 20,
        }}>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            style={{
              padding: '8px 16px',
              background: '#F3F4F6',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              cursor: 'pointer',
              color: '#374151',
            }}
          >
            取消
          </button>
          <button
            type="submit"
            disabled={!title.trim()}
            style={{
              padding: '8px 16px',
              background: title.trim() ? '#6366F1' : '#C7D2FE',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              cursor: title.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            创建
          </button>
        </div>
      </form>
    </div>
  )
}
