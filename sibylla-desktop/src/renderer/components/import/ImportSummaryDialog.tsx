import { useState, useCallback } from 'react'
import { FileCheck, RefreshCw, FileX, AlertCircle, SkipForward, RotateCw, Wrench } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import type { ImportResult, ImportFileResult } from '../../../shared/types'

interface ImportSummaryDialogProps {
  result: ImportResult
  onClose: () => void
  onRetry?: (sourcePath: string) => void
  onSkip?: (sourcePath: string) => void
  onManualFix?: (sourcePath: string) => void
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  count: number
  colorClass: string
}

function StatCard({ icon, label, count, colorClass }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/5 px-4 py-3">
      <span className={colorClass}>{icon}</span>
      <div>
        <p className="text-xl font-semibold text-white">{count}</p>
        <p className="text-xs text-gray-400">{label}</p>
      </div>
    </div>
  )
}

export function ImportSummaryDialog({
  result,
  onClose,
  onRetry,
  onSkip,
  onManualFix,
}: ImportSummaryDialogProps) {
  const [resolvedErrors, setResolvedErrors] = useState<Set<number>>(new Set())

  const totalCount =
    result.imported.length +
    result.converted.length +
    result.skipped.length +
    result.failed.length

  const handleRetry = useCallback(
    (item: ImportFileResult, index: number) => {
      onRetry?.(item.sourcePath)
      setResolvedErrors((prev) => new Set(prev).add(index))
    },
    [onRetry]
  )

  const handleSkip = useCallback((index: number) => {
    onSkip?.('')
    setResolvedErrors((prev) => new Set(prev).add(index))
  }, [onSkip])

  const handleManualFix = useCallback(
    (item: ImportFileResult, index: number) => {
      onManualFix?.(item.sourcePath)
      setResolvedErrors((prev) => new Set(prev).add(index))
    },
    [onManualFix]
  )

  const allErrorsResolved = result.failed.length > 0 && resolvedErrors.size >= result.failed.length

  return (
    <Modal isOpen onClose={onClose} title="导入完成" size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<FileCheck className="h-5 w-5" />}
            label="直接导入"
            count={result.imported.length}
            colorClass="text-emerald-400"
          />
          <StatCard
            icon={<RefreshCw className="h-5 w-5" />}
            label="格式转换"
            count={result.converted.length}
            colorClass="text-blue-400"
          />
          <StatCard
            icon={<FileX className="h-5 w-5" />}
            label="已跳过"
            count={result.skipped.length}
            colorClass="text-gray-400"
          />
          <StatCard
            icon={<AlertCircle className="h-5 w-5" />}
            label="导入失败"
            count={result.failed.length}
            colorClass="text-red-400"
          />
        </div>

        <p className="text-sm text-gray-400">
          共处理 {totalCount} 个文件，耗时 {(result.durationMs / 1000).toFixed(1)} 秒
        </p>

        {result.failed.length > 0 && (
          <div className="rounded-md bg-red-900/10 border border-red-900/20 p-3">
            <h4 className="text-sm font-medium text-red-400">
              失败详情 ({resolvedErrors.size}/{result.failed.length} 已处理)
            </h4>
            <ul className="mt-2 space-y-2">
              {result.failed.map((f, i) => {
                const fileName = f.sourcePath.split(/[\\/]/).pop() ?? f.sourcePath
                const isResolved = resolvedErrors.has(i)

                return (
                  <li
                    key={i}
                    className={`flex items-start justify-between gap-2 rounded-md px-2 py-1.5 text-xs transition-colors ${
                      isResolved ? 'bg-white/5 text-gray-500' : 'text-red-300'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className={isResolved ? 'line-through' : ''}>{fileName}</p>
                      <p className="mt-0.5 text-gray-500">{f.error}</p>
                    </div>
                    {!isResolved && (
                      <div className="flex shrink-0 gap-1">
                        {onSkip && (
                          <button
                            onClick={() => handleSkip(i)}
                            className="flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
                            title="跳过此文件"
                          >
                            <SkipForward className="h-3 w-3" />
                            跳过
                          </button>
                        )}
                        {onRetry && (
                          <button
                            onClick={() => handleRetry(f, i)}
                            className="flex items-center gap-1 rounded border border-indigo-500/50 bg-indigo-500/10 px-2 py-1 text-indigo-300 transition-colors hover:bg-indigo-500/20"
                            title="重新尝试导入"
                          >
                            <RotateCw className="h-3 w-3" />
                            重试
                          </button>
                        )}
                        <button
                          onClick={() => handleManualFix(f, i)}
                          className="flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
                          title="在文件管理器中查看并手动处理"
                        >
                          <Wrench className="h-3 w-3" />
                          手动修复
                        </button>
                      </div>
                    )}
                    {isResolved && (
                      <span className="shrink-0 text-gray-500">已处理</span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            onClick={onClose}
            disabled={result.failed.length > 0 && !allErrorsResolved && !onSkip}
          >
            {result.failed.length > 0 && !allErrorsResolved && !onSkip
              ? `仍有 ${result.failed.length - resolvedErrors.size} 个错误未处理`
              : '确定'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
