import React, { useCallback } from 'react'
import { useKanbanStore } from '../../store/kanbanStore'
import type { KanbanTask } from '../../store/kanbanStore'

export const KanbanTaskDetail: React.FC = () => {
  const selectedTaskId = useKanbanStore((s) => s.selectedTaskId)
  const model = useKanbanStore((s) => s.model)
  const updateStatus = useKanbanStore((s) => s.updateStatus)
  const dispatchToAI = useKanbanStore((s) => s.dispatchToAI)
  const selectTask = useKanbanStore((s) => s.selectTask)

  const task: KanbanTask | undefined = model?.tasks.find((t) => t.id === selectedTaskId)

  const handleDispatchToAI = useCallback(async () => {
    if (task) {
      await dispatchToAI(task.id)
    }
  }, [task, dispatchToAI])

  if (!task) {
    return (
      <div style={{
        width: 320,
        borderLeft: '1px solid #E5E7EB',
        padding: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#9CA3AF',
        fontSize: 14,
      }}>
        选择一个任务查看详情
      </div>
    )
  }

  return (
    <div style={{
      width: 320,
      borderLeft: '1px solid #E5E7EB',
      padding: 16,
      overflowY: 'auto',
      background: '#FAFAFA',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
      }}>
        <span style={{ fontSize: 12, color: '#9CA3AF', fontFamily: 'monospace' }}>
          {task.id}
        </span>
        <button
          onClick={() => selectTask(null)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 18,
            color: '#9CA3AF',
            padding: 0,
          }}
        >
          ×
        </button>
      </div>

      <h3 style={{
        fontSize: 16,
        fontWeight: 600,
        color: '#1F2937',
        margin: '0 0 16px 0',
        lineHeight: 1.4,
      }}>
        {task.title}
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <DetailRow label="状态" value={task.status} />
        {task.assignee && <DetailRow label="负责人" value={task.assignee} />}
        {task.priority && <DetailRow label="优先级" value={task.priority} />}
        {task.deadline && <DetailRow label="截止日期" value={task.deadline} />}
        {task.completedAt && <DetailRow label="完成时间" value={task.completedAt} />}
        {task.isAiLinked && <DetailRow label="AI 状态" value="AI 已认领" />}
        {task.isAiSuggested && <DetailRow label="来源" value="AI 建议" />}

        {task.relatedFiles && task.relatedFiles.length > 0 && (
          <div>
            <span style={{ fontSize: 12, color: '#6B7280' }}>关联文件</span>
            <div style={{ marginTop: 4 }}>
              {task.relatedFiles.map((f) => (
                <div key={f} style={{
                  fontSize: 12,
                  color: '#6366F1',
                  padding: '2px 0',
                  fontFamily: 'monospace',
                }}>
                  {f}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!task.isAiLinked && task.status !== '已完成' && (
          <button
            onClick={handleDispatchToAI}
            style={{
              width: '100%',
              padding: '10px 16px',
              background: '#6366F1',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            派发给 AI
          </button>
        )}

        {task.status !== '已完成' && (
          <button
            onClick={() => updateStatus(task.id, '已完成')}
            style={{
              width: '100%',
              padding: '10px 16px',
              background: '#FFFFFF',
              color: '#22C55E',
              border: '1px solid #22C55E',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            标记完成
          </button>
        )}
      </div>
    </div>
  )
}

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <span style={{ fontSize: 12, color: '#6B7280' }}>{label}</span>
    <span style={{ fontSize: 13, color: '#1F2937', fontWeight: 500 }}>{value}</span>
  </div>
)
