import React from 'react'
import { FileCheck, RefreshCw, FileX, AlertCircle } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import type { ImportResult } from '../../../shared/types'

interface ImportSummaryDialogProps {
  result: ImportResult
  onClose: () => void
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

/**
 * Modal dialog showing import results summary.
 * Groups results by action type with counts and details.
 */
export function ImportSummaryDialog({
  result,
  onClose,
}: ImportSummaryDialogProps) {
  const totalCount =
    result.imported.length +
    result.converted.length +
    result.skipped.length +
    result.failed.length

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
            <h4 className="text-sm font-medium text-red-400">失败详情</h4>
            <ul className="mt-2 space-y-1">
              {result.failed.map((f, i) => {
                const fileName = f.sourcePath.split(/[\\/]/).pop() ?? f.sourcePath
                return (
                  <li key={i} className="text-xs text-red-300">
                    {fileName}: {f.error}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={onClose}>
            确定
          </Button>
        </div>
      </div>
    </Modal>
  )
}
