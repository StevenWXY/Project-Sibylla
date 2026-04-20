import React, { useState } from 'react'
import { cn } from '../../utils/cn'
import { CheckpointStatusIndicator } from './CheckpointStatusIndicator'

interface MemoryHeaderProps {
  totalTokens: number
  threshold?: number
  isCheckpointRunning: boolean
  lastCheckpoint: string | null
  canUndoCompression: boolean
  onRunCheckpoint: () => Promise<void>
  onCompress: () => Promise<void>
  onUndoCompression: () => Promise<void>
}

/**
 * MemoryHeader — top section of the memory panel showing
 * token usage bar, checkpoint status, and action buttons.
 */
export const MemoryHeader = React.memo(function MemoryHeader({
  totalTokens,
  threshold = 12000,
  isCheckpointRunning,
  lastCheckpoint,
  canUndoCompression,
  onRunCheckpoint,
  onCompress,
  onUndoCompression,
}: MemoryHeaderProps) {
  const [checkpointLoading, setCheckpointLoading] = useState(false)
  const [compressLoading, setCompressLoading] = useState(false)
  const [undoLoading, setUndoLoading] = useState(false)

  const percentage = Math.min((totalTokens / threshold) * 100, 100)

  // Token bar color thresholds
  const barColor =
    totalTokens > threshold
      ? 'bg-red-500'
      : totalTokens > 10000
        ? 'bg-yellow-500'
        : totalTokens > 8000
          ? 'bg-green-500'
          : 'bg-gray-500'

  const handleCheckpoint = async () => {
    setCheckpointLoading(true)
    try {
      await onRunCheckpoint()
    } finally {
      setCheckpointLoading(false)
    }
  }

  const handleCompress = async () => {
    setCompressLoading(true)
    try {
      await onCompress()
    } finally {
      setCompressLoading(false)
    }
  }

  const handleUndo = async () => {
    setUndoLoading(true)
    try {
      await onUndoCompression()
    } finally {
      setUndoLoading(false)
    }
  }

  return (
    <div className="border-b border-white/10 px-4 py-3">
      {/* Token usage bar */}
      <div className="mb-2">
        <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
          <span>Token 用量</span>
          <span>
            {totalTokens.toLocaleString()} / {threshold.toLocaleString()}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={cn('h-full rounded-full transition-all duration-300', barColor)}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Checkpoint status */}
      <div className="flex items-center justify-between mb-2">
        <CheckpointStatusIndicator
          isRunning={isCheckpointRunning}
          lastCheckpoint={lastCheckpoint}
        />
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleCheckpoint}
          disabled={isCheckpointRunning || checkpointLoading}
          className={cn(
            'rounded-md px-3 py-1 text-xs font-medium transition-colors',
            'bg-indigo-600 text-white hover:bg-indigo-700',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
          )}
        >
          {checkpointLoading || isCheckpointRunning ? (
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
              运行中...
            </span>
          ) : (
            '立即检查'
          )}
        </button>

        {totalTokens > 10000 && (
          <button
            onClick={handleCompress}
            disabled={compressLoading}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-colors',
              'bg-amber-600 text-white hover:bg-amber-700',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {compressLoading ? (
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
                压缩中...
              </span>
            ) : (
              '压缩'
            )}
          </button>
        )}

        {canUndoCompression && (
          <button
            onClick={handleUndo}
            disabled={undoLoading}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-colors',
              'bg-gray-600 text-white hover:bg-gray-700',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {undoLoading ? '撤销中...' : '撤销压缩'}
          </button>
        )}
      </div>
    </div>
  )
})
