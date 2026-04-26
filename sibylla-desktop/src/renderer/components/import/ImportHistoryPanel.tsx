import React, { useState, useEffect, useCallback } from 'react'
import {
  History,
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  FileText,
  XCircle,
} from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

interface ImportRecord {
  importId: string
  timestamp: number
  sourceFormat: string
  preImportCommitHash: string
  files: string[]
  tag: string
  status: 'active' | 'rolled_back' | 'expired'
}

interface RollbackWarning {
  importId: string
  isOld: boolean
  daysAgo: number
}

export function ImportHistoryPanel({ onClose }: { onClose: () => void }) {
  const [records, setRecords] = useState<ImportRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [rollbackWarning, setRollbackWarning] = useState<RollbackWarning | null>(null)
  const [rollbackConfirming, setRollbackConfirming] = useState(false)
  const [rollingBack, setRollingBack] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    setLoading(true)
    try {
      const response = await window.electronAPI.importPipeline.history()
      if (response.success && response.data) {
        setRecords(response.data as ImportRecord[])
      }
    } catch {
      setError('加载导入历史失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const handleRollbackClick = useCallback((record: ImportRecord) => {
    const daysAgo = Math.floor((Date.now() - record.timestamp) / (1000 * 60 * 60 * 24))
    if (daysAgo >= 7) {
      setRollbackWarning({
        importId: record.importId,
        isOld: true,
        daysAgo,
      })
    } else {
      setRollbackWarning({
        importId: record.importId,
        isOld: false,
        daysAgo,
      })
    }
  }, [])

  const handleConfirmRollback = useCallback(async () => {
    if (!rollbackWarning) return

    setRollingBack(rollbackWarning.importId)
    setError(null)
    try {
      const response = await window.electronAPI.importPipeline.rollback(
        rollbackWarning.importId
      )
      if (response.success) {
        setSuccessMessage('回滚成功，导入的文件已恢复')
        await loadHistory()
      } else if (
        response.error?.message?.startsWith('ROLLBACK_AGE_WARNING:')
      ) {
        setRollbackWarning({
          importId: rollbackWarning.importId,
          isOld: true,
          daysAgo: rollbackWarning.daysAgo,
        })
      } else {
        setError(response.error?.message || '回滚失败')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '回滚失败'
      if (msg.startsWith('ROLLBACK_AGE_WARNING:')) {
        setRollbackWarning({
          importId: rollbackWarning.importId,
          isOld: true,
          daysAgo: rollbackWarning.daysAgo,
        })
      } else {
        setError(msg)
      }
    } finally {
      setRollingBack(null)
    }
  }, [rollbackWarning, loadHistory])

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const statusConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
    active: { icon: <CheckCircle className="h-3.5 w-3.5" />, label: '有效', color: 'text-emerald-400' },
    rolled_back: { icon: <RotateCcw className="h-3.5 w-3.5" />, label: '已回滚', color: 'text-gray-500' },
    expired: { icon: <Clock className="h-3.5 w-3.5" />, label: '已过期', color: 'text-gray-600' },
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-white">导入历史</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          关闭
        </Button>
      </div>

      {successMessage && (
        <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
          <CheckCircle className="h-4 w-4 shrink-0" />
          {successMessage}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <XCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-300 hover:text-white">×</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-lg border border-white/5 bg-white/5 py-8 text-center">
          <History className="mx-auto mb-3 h-8 w-8 text-gray-600" />
          <p className="text-sm text-gray-400">暂无导入记录</p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((record) => {
            const cfg = statusConfig[record.status]
            const config = cfg ? { icon: cfg.icon, label: cfg.label, color: cfg.color } : { icon: <CheckCircle className="h-3.5 w-3.5" />, label: '有效', color: 'text-emerald-400' }
            const daysAgo = Math.floor((Date.now() - record.timestamp) / (1000 * 60 * 60 * 24))

            return (
              <div
                key={record.importId}
                className="rounded-lg border border-white/10 bg-white/5 p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-400" />
                      <span className="text-sm font-medium text-white">
                        {record.sourceFormat}
                      </span>
                      <span className={`flex items-center gap-1 text-xs ${config.color}`}>
                        {config.icon}
                        {config.label}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                      <span>{formatDate(record.timestamp)}</span>
                      <span>{record.tag}</span>
                      {daysAgo > 0 && <span>{daysAgo} 天前</span>}
                    </div>
                  </div>

                  {record.status === 'active' && (
                    <Button
                      variant="outline"
                      size="sm"
                      icon={<RotateCcw className="h-3.5 w-3.5" />}
                      onClick={() => handleRollbackClick(record)}
                      disabled={rollingBack === record.importId}
                    >
                      {rollingBack === record.importId ? '回滚中...' : '回滚'}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {rollbackWarning && (
        <Modal
          isOpen
          onClose={() => { setRollbackWarning(null); setRollbackConfirming(false) }}
          title={rollbackConfirming ? '最终确认' : '确认回滚'}
          size="md"
        >
          <div className="space-y-4">
            {rollbackWarning.isOld && !rollbackConfirming && (
              <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>此导入记录距今已 {rollbackWarning.daysAgo} 天，回滚可能影响近期文件修改。</span>
              </div>
            )}

            <p className="text-sm text-gray-300">
              {rollbackConfirming
                ? '确定要继续回滚吗？此操作将恢复导入前的文件状态，创建一个新的还原提交。'
                : '确定要回滚此导入操作吗？这将恢复导入前的文件状态。'}
            </p>

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setRollbackWarning(null); setRollbackConfirming(false) }}
              >
                取消
              </Button>
              {rollbackWarning.isOld && !rollbackConfirming ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setRollbackConfirming(true)}
                >
                  我了解风险，继续
                </Button>
              ) : (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleConfirmRollback}
                >
                  确认回滚
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
