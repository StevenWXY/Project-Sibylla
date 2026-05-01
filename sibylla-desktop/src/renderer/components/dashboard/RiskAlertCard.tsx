import React from 'react'
import { useDashboardStore } from '../../store/dashboardStore'

export const RiskAlertCard: React.FC = () => {
  const overdueTasks = useDashboardStore((s) => s.data?.overdueTasks ?? [])
  const unreadSuggestionCount = useDashboardStore((s) => s.data?.unreadSuggestionCount ?? 0)
  const hasRisk = overdueTasks.length > 0

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-600 flex items-center gap-2">
          {hasRisk && <span className="text-red-500">⚠</span>}
          风险与建议
        </h3>
        {unreadSuggestionCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-indigo-500 text-white text-xs font-medium animate-pulse">
            {unreadSuggestionCount}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {overdueTasks.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            暂无风险
          </div>
        ) : (
          <ul className="space-y-2">
            {overdueTasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('navigate', { detail: { view: 'kanban', taskId: task.id } }),
                  )
                }}
              >
                <span className="flex-1 text-sm text-gray-700 truncate">{task.title}</span>
                <span className="text-xs text-gray-500 shrink-0">
                  {task.assignee ?? '未分配'}
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 shrink-0">
                  {task.daysOverdue}天
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
