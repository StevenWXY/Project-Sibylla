import React from 'react'
import { useDashboardStore } from '../../store/dashboardStore'

const STATUS_COLORS: Record<string, string> = {
  online: '#10B981',
  idle: '#F59E0B',
  offline: '#9CA3AF',
}

export const MemberActivityCard: React.FC = () => {
  const members = useDashboardStore((s) => s.data?.members ?? [])

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 flex flex-col">
      <h3 className="text-sm font-medium text-gray-600 mb-3">成员活跃度</h3>

      <div className="flex-1 overflow-auto">
        {members.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            暂无成员
          </div>
        ) : (
          <ul className="space-y-2">
            {members.map((member) => (
              <li key={member.userId} className="flex items-center gap-3 p-2">
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600 shrink-0">
                  {member.displayName.slice(0, 1)}
                </div>
                <span className="text-sm text-gray-700 flex-1 truncate">
                  {member.displayName}
                </span>
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: STATUS_COLORS[member.status] ?? STATUS_COLORS.offline }}
                />
                <span className="text-xs text-gray-500 shrink-0">
                  {member.commits24h} 提交/24h
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
