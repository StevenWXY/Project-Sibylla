/**
 * ConflictNotification — Toast notification for detected file conflicts
 *
 * Dual responsibility:
 * 1. useEffect listens for git:conflictDetected IPC events → updates conflictStore
 * 2. Selector subscribes to conflicts → renders floating notification
 *
 * Clicking the button triggers opening the conflict resolution panel
 * via the onOpenConflictPanel callback prop.
 */

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  useConflictStore,
  selectConflicts,
  selectConflictCount,
} from '../../store/conflictStore'
import type { ConflictInfo } from '../../../shared/types'

interface ConflictNotificationProps {
  /** Callback when user clicks "查看并解决冲突" */
  readonly onOpenConflictPanel?: () => void
}

export function ConflictNotification({ onOpenConflictPanel }: ConflictNotificationProps) {
  const setConflicts = useConflictStore((s) => s.setConflicts)
  const conflicts = useConflictStore(selectConflicts)
  const conflictCount = useConflictStore(selectConflictCount)

  useEffect(() => {
    if (typeof window.electronAPI?.git?.onConflictDetected !== 'function') {
      return
    }

    const cleanup = window.electronAPI.git.onConflictDetected((detected: ConflictInfo[]) => {
      if (detected.length > 0) {
        setConflicts(detected)
      }
    })

    return cleanup
  }, [setConflicts])

  if (conflictCount === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 w-96 rounded-lg border border-red-200 dark:border-red-800 bg-white dark:bg-gray-800 shadow-xl">
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <h3 className="font-medium">发现文件冲突</h3>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          以下文件被其他成员同时修改，需要你选择如何合并：
        </p>
        <ul className="space-y-1 max-h-32 overflow-y-auto">
          {conflicts.map((c: ConflictInfo) => (
            <li
              key={c.filePath}
              className="text-sm font-mono bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded"
            >
              {c.filePath}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="w-full bg-red-500 hover:bg-red-600 text-white rounded px-4 py-2 text-sm transition-colors"
          onClick={onOpenConflictPanel}
        >
          查看并解决冲突
        </button>
      </div>
    </div>
  )
}
