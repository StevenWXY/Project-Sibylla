import React, { useEffect } from 'react'
import { useDashboardStore } from '../../store/dashboardStore'
import { useAppStore, selectCurrentUser } from '../../store/appStore'
import { TaskOverviewCard } from './TaskOverviewCard'
import { RiskAlertCard } from './RiskAlertCard'
import { MemberActivityCard } from './MemberActivityCard'
import { HeatmapCard } from './HeatmapCard'

export const AdminDashboard: React.FC = () => {
  const currentUser = useAppStore(selectCurrentUser)
  const data = useDashboardStore((s) => s.data)
  const isLoading = useDashboardStore((s) => s.isLoading)
  const fetchOverview = useDashboardStore((s) => s.fetchOverview)
  const startAutoRefresh = useDashboardStore((s) => s.startAutoRefresh)
  const stopAutoRefresh = useDashboardStore((s) => s.stopAutoRefresh)

  const viewerId = currentUser?.id ?? ''
  const isAdmin = currentUser?.name === 'admin'
  const viewerRole: string = isAdmin ? 'admin' : 'viewer'

  useEffect(() => {
    if (!isAdmin) return
    fetchOverview(viewerId, viewerRole)
    startAutoRefresh(viewerId, viewerRole)
    return () => {
      stopAutoRefresh()
    }
  }, [isAdmin, viewerId, viewerRole, fetchOverview, startAutoRefresh, stopAutoRefresh])

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">权限不足</h2>
          <p className="text-gray-500 mb-4">仅管理员可访问 Dashboard</p>
          <a
            href="#"
            className="text-indigo-500 hover:text-indigo-600 underline"
            onClick={(e) => {
              e.preventDefault()
              window.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'productivity' } }))
            }}
          >
            查看个人报告
          </a>
        </div>
      </div>
    )
  }

  if (data === null && isLoading) {
    return (
      <div className="grid grid-cols-2 grid-rows-2 gap-4 p-4 h-full">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }

  const isSingleUser = (data?.memberCount ?? 0) < 2
  const hasPersonalData = (data?.memberCount ?? 0) >= 2

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {hasPersonalData && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 px-4 py-2 rounded-lg flex items-center gap-2 text-sm text-indigo-700 dark:text-indigo-300">
          <span>👁</span>
          <span>管理员视图，包含个人空间数据</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-800">管理面板</h1>
        {!hasPersonalData && (
          <span className="text-xs text-gray-400">
            管理员视图，包含个人空间数据
          </span>
        )}
      </div>

      {isSingleUser ? (
        <div className="flex flex-col gap-4 flex-1">
          <TaskOverviewCard />
          <RiskAlertCard />
        </div>
      ) : (
        <div className="grid grid-cols-2 grid-rows-2 gap-4 flex-1">
          <TaskOverviewCard />
          <RiskAlertCard />
          <MemberActivityCard />
          <HeatmapCard />
        </div>
      )}
    </div>
  )
}
