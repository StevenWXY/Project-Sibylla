import React from 'react'
import { useDashboardStore } from '../../store/dashboardStore'
import { useKanbanStore } from '../../store/kanbanStore'

const COLORS = {
  pending: '#F59E0B',
  inProgress: '#6366F1',
  completed: '#10B981',
} as const

export const TaskOverviewCard: React.FC = () => {
  const taskStats = useDashboardStore((s) => s.data?.taskStats)
  const selectColumn = useKanbanStore((s) => s.setSelectedColumn)

  const pending = taskStats?.pending ?? 0
  const inProgress = taskStats?.inProgress ?? 0
  const completed = taskStats?.completed ?? 0
  const total = pending + inProgress + completed

  const radius = 40
  const circumference = 2 * Math.PI * radius

  const pendingPct = total > 0 ? pending / total : 0
  const inProgressPct = total > 0 ? inProgress / total : 0
  const completedPct = total > 0 ? completed / total : 0

  const pendingDash = pendingPct * circumference
  const inProgressDash = inProgressPct * circumference
  const completedDash = completedPct * circumference

  const offset1 = 0
  const offset2 = pendingDash
  const offset3 = pendingDash + inProgressDash

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 flex flex-col">
      <h3 className="text-sm font-medium text-gray-600 mb-3">任务概览</h3>

      <div className="flex items-center gap-6 flex-1">
        <svg width="100" height="100" viewBox="0 0 100 100" className="shrink-0">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#F3F4F6" strokeWidth="8" />
          {pending > 0 && (
            <circle
              cx="50" cy="50" r={radius} fill="none"
              stroke={COLORS.pending} strokeWidth="8"
              strokeDasharray={`${pendingDash} ${circumference - pendingDash}`}
              strokeDashoffset={-offset1}
              transform="rotate(-90 50 50)"
              className="cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => selectColumn?.('待开始')}
            />
          )}
          {inProgress > 0 && (
            <circle
              cx="50" cy="50" r={radius} fill="none"
              stroke={COLORS.inProgress} strokeWidth="8"
              strokeDasharray={`${inProgressDash} ${circumference - inProgressDash}`}
              strokeDashoffset={-offset2}
              transform="rotate(-90 50 50)"
              className="cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => selectColumn?.('进行中')}
            />
          )}
          {completed > 0 && (
            <circle
              cx="50" cy="50" r={radius} fill="none"
              stroke={COLORS.completed} strokeWidth="8"
              strokeDasharray={`${completedDash} ${circumference - completedDash}`}
              strokeDashoffset={-offset3}
              transform="rotate(-90 50 50)"
              className="cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => selectColumn?.('已完成')}
            />
          )}
        </svg>

        <div className="flex flex-col gap-3 flex-1">
          <button
            className="flex items-center gap-2 text-left hover:bg-gray-50 rounded px-2 py-1 transition-colors"
            onClick={() => selectColumn?.('待开始')}
          >
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.pending }} />
            <span className="text-sm text-gray-600">待开始</span>
            <span className="text-lg font-semibold text-gray-800 ml-auto">{pending}</span>
          </button>
          <button
            className="flex items-center gap-2 text-left hover:bg-gray-50 rounded px-2 py-1 transition-colors"
            onClick={() => selectColumn?.('进行中')}
          >
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.inProgress }} />
            <span className="text-sm text-gray-600">进行中</span>
            <span className="text-lg font-semibold text-gray-800 ml-auto">{inProgress}</span>
          </button>
          <button
            className="flex items-center gap-2 text-left hover:bg-gray-50 rounded px-2 py-1 transition-colors"
            onClick={() => selectColumn?.('已完成')}
          >
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS.completed }} />
            <span className="text-sm text-gray-600">已完成</span>
            <span className="text-lg font-semibold text-gray-800 ml-auto">{completed}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
