import { useState, useCallback, type ReactNode } from 'react'
import {
  Check,
  Clock3,
  CloudOff,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import type { SyncStatus } from '../../../shared/types'
import {
  useSyncStatusStore,
  selectStatus,
  selectLastSyncedAt,
} from '../../store/syncStatusStore'
import { SyncDetailPanel } from './SyncDetailPanel'
import { cn } from '../../utils/cn'

interface StatusConfig {
  readonly label: string
  readonly colorClass: string
  readonly animate: boolean
}

const STATUS_CONFIG: Record<SyncStatus, StatusConfig> = {
  idle: { label: '等待同步', colorClass: 'text-gray-400', animate: false },
  synced: { label: '已同步', colorClass: 'text-emerald-500', animate: false },
  syncing: { label: '同步中', colorClass: 'text-blue-500', animate: true },
  offline: { label: '离线（本地已保存）', colorClass: 'text-gray-400', animate: false },
  conflict: { label: '有冲突', colorClass: 'text-red-500', animate: false },
  error: { label: '同步失败', colorClass: 'text-amber-500', animate: false },
}

function StatusIcon({ status }: { readonly status: SyncStatus }): ReactNode {
  const config = STATUS_CONFIG[status]
  return (
    <span className={cn('h-3.5 w-3.5', config.animate && 'animate-spin')}>
      {(() => {
        switch (status) {
          case 'syncing': return <Loader2 className="h-3.5 w-3.5" />
          case 'synced': return <Check className="h-3.5 w-3.5" />
          case 'conflict':
          case 'error': return <AlertTriangle className="h-3.5 w-3.5" />
          case 'offline': return <CloudOff className="h-3.5 w-3.5" />
          case 'idle':
          default: return <Clock3 className="h-3.5 w-3.5" />
        }
      })()}
    </span>
  )
}

function formatTime(timestamp: number | null): string {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export interface SyncStatusIndicatorProps {
  readonly variant?: 'default' | 'compact'
}

export function SyncStatusIndicator({ variant = 'default' }: SyncStatusIndicatorProps) {
  const status = useSyncStatusStore(selectStatus)
  const lastSyncedAt = useSyncStatusStore(selectLastSyncedAt)
  const [showDetail, setShowDetail] = useState(false)
  const config = STATUS_CONFIG[status]
  const timeStr = formatTime(lastSyncedAt)

  const handleCloseDetail = useCallback(() => {
    setShowDetail(false)
  }, [])

  return (
    <div className="relative">
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium transition-colors hover:bg-white/10 ${config.colorClass}`}
        onClick={() => setShowDetail((prev) => !prev)}
        title={config.label}
      >
        <StatusIcon status={status} />
        <span>{config.label}</span>
        {variant === 'default' && timeStr && (
          <span className="text-gray-500">{timeStr}</span>
        )}
      </button>

      {showDetail && <SyncDetailPanel onClose={handleCloseDetail} />}
    </div>
  )
}
