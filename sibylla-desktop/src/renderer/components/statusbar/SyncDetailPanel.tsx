import { useEffect, useRef, useCallback } from 'react'
import { X } from 'lucide-react'
import {
  useSyncStatusStore,
  selectStatus,
  selectLastSyncedAt,
  selectErrorMessage,
  selectConflictFiles,
} from '../../store/syncStatusStore'

const STATUS_LABELS: Record<string, string> = {
  idle: '等待同步',
  synced: '已同步',
  syncing: '同步中',
  offline: '离线（本地已保存）',
  conflict: '有冲突',
  error: '同步失败',
}

function formatDateTime(timestamp: number | null): string {
  if (!timestamp) return '从未'
  return new Date(timestamp).toLocaleString('zh-CN')
}

export interface SyncDetailPanelProps {
  readonly onClose: () => void
}

export function SyncDetailPanel({ onClose }: SyncDetailPanelProps) {
  const status = useSyncStatusStore(selectStatus)
  const lastSyncedAt = useSyncStatusStore(selectLastSyncedAt)
  const errorMessage = useSyncStatusStore(selectErrorMessage)
  const conflictFiles = useSyncStatusStore(selectConflictFiles)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!panelRef.current) return
      if (!panelRef.current.contains(event.target as Node)) {
        onClose()
      }
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [onClose])

  const handleForceSync = useCallback(async () => {
    await window.electronAPI.sync.force()
    onClose()
  }, [onClose])

  return (
    <div
      ref={panelRef}
      className="absolute bottom-8 right-0 z-50 w-72 rounded-lg border border-sys-darkBorder bg-[#0A0A0A] shadow-2xl"
    >
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-white">同步详情</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">状态</span>
            <span className="text-white">{STATUS_LABELS[status] ?? status}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">上次同步</span>
            <span className="text-white">{formatDateTime(lastSyncedAt)}</span>
          </div>
        </div>

        {errorMessage && (
          <div className="rounded bg-red-900/20 p-2 text-xs text-red-400">
            {errorMessage}
          </div>
        )}

        {conflictFiles.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-red-500">冲突文件：</p>
            {conflictFiles.map((f) => (
              <p key={f} className="truncate text-xs text-gray-400">
                {f}
              </p>
            ))}
          </div>
        )}

        <div className="flex gap-2 border-t border-sys-darkBorder pt-2">
          <button
            type="button"
            className="flex-1 rounded bg-indigo-500 px-3 py-1.5 text-xs text-white transition-colors hover:bg-indigo-600"
            onClick={handleForceSync}
          >
            立即同步
          </button>
          {status === 'error' && (
            <button
              type="button"
              className="flex-1 rounded border border-sys-darkBorder px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-white/10"
              onClick={async () => {
                await window.electronAPI.sync.force()
                onClose()
              }}
            >
              重试同步
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
