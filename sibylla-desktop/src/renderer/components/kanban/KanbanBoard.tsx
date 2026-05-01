import React, { useCallback } from 'react'
import {
  DndContext,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useKanbanStore } from '../../store/kanbanStore'
import { KanbanTaskCard } from './KanbanTaskCard'
import { KanbanCreateForm } from './KanbanCreateForm'

const COLUMN_CONFIG: Array<{
  id: '待开始' | '进行中' | '已完成'
  label: string
  bgColor: string
  headerColor: string
}> = [
  { id: '待开始', label: '待开始', bgColor: '#F9FAFB', headerColor: '#6B7280' },
  { id: '进行中', label: '进行中', bgColor: '#EEF2FF', headerColor: '#6366F1' },
  { id: '已完成', label: '已完成', bgColor: '#F0FDF4', headerColor: '#22C55E' },
]

export const KanbanBoard: React.FC = () => {
  const model = useKanbanStore((s) => s.model)
  const parseError = useKanbanStore((s) => s.parseError)
  const isLoading = useKanbanStore((s) => s.isLoading)
  const fetchBoard = useKanbanStore((s) => s.fetchBoard)
  const updateStatus = useKanbanStore((s) => s.updateStatus)
  const selectedTaskId = useKanbanStore((s) => s.selectedTaskId)
  const selectTask = useKanbanStore((s) => s.selectTask)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  React.useEffect(() => {
    fetchBoard()
  }, [fetchBoard])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over) return

      const taskId = active.id as string
      const targetColumn = over.data.current?.columnId as '待开始' | '进行中' | '已完成' | undefined

      if (targetColumn && taskId) {
        updateStatus(taskId, targetColumn)
      }
    },
    [updateStatus],
  )

  if (isLoading && !model) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <span style={{ color: '#6B7280' }}>加载看板...</span>
      </div>
    )
  }

  if (parseError) {
    return (
      <div style={{
        padding: 16,
        background: '#FEF2F2',
        borderRadius: 8,
        border: '1px solid #FECACA',
        color: '#991B1B',
        fontSize: 14,
      }}>
        tasks.md 格式异常，看板已切换为只读模式
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%', padding: 16 }}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
      >
        {COLUMN_CONFIG.map((col) => {
          const tasks = model?.columns[col.id] ?? []
          return (
            <div
              key={col.id}
              data-column-id={col.id}
              style={{
                flex: 1,
                minWidth: 280,
                background: col.bgColor,
                borderRadius: 12,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <div style={{
                padding: '12px 16px',
                borderBottom: `2px solid ${col.headerColor}22`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: col.headerColor,
                  }}>
                    {col.label}
                  </span>
                  <span style={{
                    background: `${col.headerColor}22`,
                    color: col.headerColor,
                    fontSize: 12,
                    fontWeight: 500,
                    padding: '2px 8px',
                    borderRadius: 10,
                  }}>
                    {tasks.length}
                  </span>
                </div>
                {col.id === '待开始' && <KanbanCreateForm />}
              </div>

              <SortableContext
                items={tasks.map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <div style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '8px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}>
                  {tasks.map((task) => (
                    <KanbanTaskCard
                      key={task.id}
                      task={task}
                      columnId={col.id}
                      isSelected={task.id === selectedTaskId}
                      onSelect={() => selectTask(task.id === selectedTaskId ? null : task.id)}
                    />
                  ))}
                  {tasks.length === 0 && (
                    <div style={{
                      padding: 24,
                      textAlign: 'center',
                      color: '#9CA3AF',
                      fontSize: 13,
                    }}>
                      暂无任务
                    </div>
                  )}
                </div>
              </SortableContext>
            </div>
          )
        })}
      </DndContext>
    </div>
  )
}
