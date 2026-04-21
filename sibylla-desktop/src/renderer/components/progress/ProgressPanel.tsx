import React, { useEffect, useRef } from 'react'
import { useProgressStore, selectSnapshot, selectProgressLoading } from '../../store/progressStore'
import type { TaskRecordShared } from '../../../shared/types'
import { TaskCard } from './TaskCard'

function formatElapsed(startedAt: string): string {
  const start = new Date(startedAt).getTime()
  const diff = Date.now() - start
  if (diff < 60000) return `${Math.floor(diff / 1000)}s`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ${Math.floor((diff % 60000) / 1000)}s`
  return `${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m`
}

const ActiveElapsed: React.FC<{ startedAt: string }> = ({ startedAt }) => {
  const [elapsed, setElapsed] = React.useState(() => formatElapsed(startedAt))
  useEffect(() => {
    const timer = setInterval(() => setElapsed(formatElapsed(startedAt)), 1000)
    return () => clearInterval(timer)
  }, [startedAt])
  return <>{elapsed}</>
}

export const ProgressPanel: React.FC = () => {
  const snapshot = useProgressStore(selectSnapshot)
  const loading = useProgressStore(selectProgressLoading)
  const { fetchSnapshot, updateTaskInSnapshot } = useProgressStore()

  useEffect(() => {
    fetchSnapshot()
  }, [fetchSnapshot])

  useEffect(() => {
    const unsubscribe = window.electronAPI.progress.onTaskEvent((event) => {
      updateTaskInSnapshot(event.task)
    })
    return unsubscribe
  }, [updateTaskInSnapshot])

  if (loading && !snapshot) {
    return <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>加载中...</div>
  }

  if (!snapshot) {
    return <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF', fontSize: '13px' }}>暂无任务</div>
  }

  return (
    <div style={{ padding: '12px', fontSize: '13px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Active tasks */}
      {snapshot.active.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 600, color: '#1F2937', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🔄 进行中 <span style={{ color: '#9CA3AF', fontWeight: 400 }}>({snapshot.active.length})</span>
          </h4>
          {snapshot.active.map(task => (
            <TaskCard key={task.id} task={task} isActive />
          ))}
        </div>
      )}

      {/* Completed tasks */}
      {snapshot.completedRecent.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 600, color: '#1F2937', display: 'flex', alignItems: 'center', gap: '6px' }}>
            ✅ 已完成 <span style={{ color: '#9CA3AF', fontWeight: 400 }}>({snapshot.completedRecent.length})</span>
          </h4>
          {snapshot.completedRecent.map(task => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}

      {/* Queued tasks */}
      {snapshot.queued.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 600, color: '#1F2937', display: 'flex', alignItems: 'center', gap: '6px' }}>
            📋 排队中 <span style={{ color: '#9CA3AF', fontWeight: 400 }}>({snapshot.queued.length})</span>
          </h4>
          {snapshot.queued.map(task => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}

      {snapshot.active.length === 0 && snapshot.completedRecent.length === 0 && snapshot.queued.length === 0 && (
        <div style={{ textAlign: 'center', color: '#9CA3AF', padding: '20px' }}>暂无任务</div>
      )}
    </div>
  )
}

export default ProgressPanel
