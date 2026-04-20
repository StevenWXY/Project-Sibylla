import React from 'react'
import { formatRelativeTime } from '../../utils/formatRelativeTime'

interface CheckpointStatusIndicatorProps {
  isRunning: boolean
  lastCheckpoint: string | null
}

/**
 * Checkpoint status indicator — shows real-time checkpoint running state
 * and relative time since last checkpoint.
 */
export const CheckpointStatusIndicator = React.memo(function CheckpointStatusIndicator({
  isRunning,
  lastCheckpoint,
}: CheckpointStatusIndicatorProps) {
  if (isRunning) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-blue-400">
        <span className="inline-block h-2 w-2 animate-spin rounded-full border border-blue-400 border-t-transparent" />
        <span>检查点运行中...</span>
      </div>
    )
  }

  if (!lastCheckpoint) {
    return (
      <span className="text-xs text-gray-500">尚未运行检查点</span>
    )
  }

  return (
    <span className="text-xs text-gray-400" title={lastCheckpoint}>
      上次检查点: {formatRelativeTime(lastCheckpoint)}
    </span>
  )
})
