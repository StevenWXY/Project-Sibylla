import React, { useMemo } from 'react'
import { usePresenceStore } from '../../store/presenceStore'
import { PeerStatusIcon } from './PeerStatusIcon'
import type { FilteredPeerState } from '../../../shared/types'

const STATUS_ORDER: Record<string, number> = {
  online: 0,
  idle: 1,
  offline: 2,
}

export const TeamPanel: React.FC = () => {
  const peers = usePresenceStore((s) => s.peers)
  const isServiceAvailable = usePresenceStore((s) => s.isServiceAvailable)
  const isLoading = usePresenceStore((s) => s.isLoading)

  const sortedPeers = useMemo(() => {
    return [...peers].sort((a: FilteredPeerState, b: FilteredPeerState) => {
      const orderDiff = (STATUS_ORDER[a.status] ?? 2) - (STATUS_ORDER[b.status] ?? 2)
      if (orderDiff !== 0) return orderDiff
      return a.displayName.localeCompare(b.displayName)
    })
  }, [peers])

  const onlineCount = peers.filter((p: FilteredPeerState) => p.status === 'online').length

  const handleFileClick = (filePath: string) => {
    window.electronAPI.file.read(filePath).catch(() => {})
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          团队
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {onlineCount} 人在线
        </span>
      </div>

      {!isServiceAvailable && !isLoading && (
        <div className="px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 text-xs">
          团队感知已离线
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {sortedPeers.map((peer: FilteredPeerState) => (
          <div
            key={peer.userId}
            className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="relative flex-shrink-0">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
                style={{ backgroundColor: getAvatarColor(peer.userId) }}
              >
                {peer.avatar ? (
                  <img
                    src={peer.avatar}
                    alt={peer.displayName}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  peer.displayName.slice(0, 2).toUpperCase()
                )}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5">
                <PeerStatusIcon status={peer.status} size="sm" />
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {peer.displayName}
              </div>
              {peer.viewingFile && (
                <button
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline truncate block text-left"
                  onClick={() => handleFileClick(peer.viewingFile!)}
                  title={peer.viewingFile}
                >
                  {peer.viewingFile}
                </button>
              )}
            </div>

            <div className="text-xs text-gray-400 dark:text-gray-500">
              {formatLastActive(peer.lastActiveAt)}
            </div>
          </div>
        ))}

        {sortedPeers.length === 0 && !isLoading && (
          <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
            暂无在线成员
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3">
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            defaultChecked={true}
            onChange={(e) => {
              window.electronAPI.presence.toggleBroadcast(e.target.checked).catch(() => {})
            }}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          广播我的活动
        </label>
      </div>
    </div>
  )
}

function getAvatarColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  const colors = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6']
  return colors[Math.abs(hash) % colors.length] ?? '#6366F1'
}

function formatLastActive(timestamp: number): string {
  const diffMs = Date.now() - timestamp
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin}分钟前`
  const diffHour = Math.floor(diffMin / 60)
  return `${diffHour}小时前`
}
