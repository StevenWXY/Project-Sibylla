import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { formatRelativeTime } from '../../utils/formatRelativeTime'
import type { VersionEntry } from '../../store/versionHistoryStore'

interface RestoreConfirmDialogProps {
  version: VersionEntry
  onConfirm: () => void
  onCancel: () => void
}

export function RestoreConfirmDialog({ version, onConfirm, onCancel }: RestoreConfirmDialogProps) {
  return (
    <Modal isOpen onClose={onCancel} title="恢复到历史版本" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          确定要将文件恢复到以下版本吗？这将创建一个新的版本来记录此操作。
        </p>
        <div className="rounded bg-gray-50 p-3 dark:bg-gray-700/50">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{version.summary}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {version.author} · {formatRelativeTime(version.timestamp)}
          </p>
        </div>
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={onCancel}>
            取消
          </Button>
          <Button onClick={onConfirm}>
            确认恢复
          </Button>
        </div>
      </div>
    </Modal>
  )
}
