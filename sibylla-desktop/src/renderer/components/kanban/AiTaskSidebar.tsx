import React, { useEffect, useState } from 'react'
import { useKanbanStore } from '../../store/kanbanStore'

interface AiTask {
  id: string
  title: string
  state: string
  createdAt: string
}

export const AiTaskSidebar: React.FC = () => {
  const aiSidebarOpen = useKanbanStore((s) => s.aiSidebarOpen)
  const toggleAiSidebar = useKanbanStore((s) => s.toggleAiSidebar)
  const promoteFromLedger = useKanbanStore((s) => s.promoteFromLedger)
  const [tasks, setTasks] = useState<AiTask[]>([])

  useEffect(() => {
    if (aiSidebarOpen) {
      window.electronAPI.kanban.aiSidebar().then((response) => {
        if (response.success && response.data) {
          setTasks(response.data as AiTask[])
        }
      })
    }
  }, [aiSidebarOpen])

  if (!aiSidebarOpen) {
    return (
      <button
        onClick={toggleAiSidebar}
        style={{
          position: 'fixed',
          right: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          background: '#6366F1',
          color: '#FFFFFF',
          border: 'none',
          borderRadius: '8px 0 0 8px',
          padding: '12px 8px',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          writingMode: 'vertical-rl',
          zIndex: 100,
        }}
      >
        AI 工作中
      </button>
    )
  }

  return (
    <div style={{
      width: 280,
      borderLeft: '1px solid #E5E7EB',
      background: '#FAFAFA',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #E5E7EB',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#6366F1' }}>
          AI 工作中
        </span>
        <button
          onClick={toggleAiSidebar}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 16,
            color: '#9CA3AF',
            padding: 0,
          }}
        >
          ×
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
        {tasks.length === 0 && (
          <div style={{
            padding: 24,
            textAlign: 'center',
            color: '#9CA3AF',
            fontSize: 13,
          }}>
            AI 暂无活跃任务
          </div>
        )}

        {tasks.map((task) => (
          <div
            key={task.id}
            style={{
              background: '#FFFFFF',
              border: '1px solid #E5E7EB',
              borderRadius: 8,
              padding: 12,
              marginBottom: 8,
            }}
          >
            <div style={{
              fontSize: 13,
              fontWeight: 500,
              color: '#1F2937',
              marginBottom: 4,
            }}>
              {task.title}
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: 11, color: '#6B7280' }}>
                {task.state}
              </span>
              <button
                onClick={() => promoteFromLedger(task.id)}
                style={{
                  padding: '3px 8px',
                  background: '#EEF2FF',
                  color: '#6366F1',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                提升为正式任务
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
