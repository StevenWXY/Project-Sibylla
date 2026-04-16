import { useState, useCallback } from 'react'
import { X, Loader2, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react'
import { useVersionHistoryStore, PAGE_SIZE } from '../../store/versionHistoryStore'
import { VersionList } from './VersionList'
import { DiffHunkView } from './DiffHunkView'
import { RestoreConfirmDialog } from './RestoreConfirmDialog'
import { Button } from '../ui/Button'

export function VersionHistoryPanel() {
  const isOpen = useVersionHistoryStore((s) => s.isOpen)
  const filePath = useVersionHistoryStore((s) => s.filePath)
  const versions = useVersionHistoryStore((s) => s.versions)
  const selectedVersion = useVersionHistoryStore((s) => s.selectedVersion)
  const diff = useVersionHistoryStore((s) => s.diff)
  const isLoadingHistory = useVersionHistoryStore((s) => s.isLoadingHistory)
  const isLoadingDiff = useVersionHistoryStore((s) => s.isLoadingDiff)
  const isRestoring = useVersionHistoryStore((s) => s.isRestoring)
  const error = useVersionHistoryStore((s) => s.error)
  const page = useVersionHistoryStore((s) => s.page)
  const closePanel = useVersionHistoryStore((s) => s.closePanel)
  const selectVersion = useVersionHistoryStore((s) => s.selectVersion)
  const restoreVersion = useVersionHistoryStore((s) => s.restoreVersion)
  const setPage = useVersionHistoryStore((s) => s.setPage)
  const clearError = useVersionHistoryStore((s) => s.clearError)

  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)

  const handleRestoreConfirm = useCallback(() => {
    setShowRestoreConfirm(false)
    void restoreVersion()
  }, [restoreVersion])

  if (!isOpen || !filePath) return null

  const fileName = filePath.split('/').pop() ?? filePath
  const hasMorePages = versions.length >= PAGE_SIZE * (page + 1)

  return (
    <div className="flex flex-col h-full w-80 border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-medium truncate text-gray-900 dark:text-gray-100">
          {fileName}
        </h2>
        <button
          type="button"
          className="rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          onClick={closePanel}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          <div className="flex items-center justify-between">
            <span>{error}</span>
            <button type="button" className="ml-2 underline" onClick={clearError}>
              关闭
            </button>
          </div>
        </div>
      )}

      <VersionList
        versions={versions}
        selected={selectedVersion}
        isLoading={isLoadingHistory}
        onSelect={selectVersion}
      />

      {versions.length >= PAGE_SIZE && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
          <button
            type="button"
            disabled={page === 0}
            className="flex items-center gap-1 disabled:opacity-30"
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft className="h-3 w-3" />
            上一页
          </button>
          <span>第 {page + 1} 页</span>
          <button
            type="button"
            disabled={!hasMorePages}
            className="flex items-center gap-1 disabled:opacity-30"
            onClick={() => setPage(page + 1)}
          >
            下一页
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}

      {selectedVersion && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-700/50">
            <span className="text-xs text-gray-600 dark:text-gray-400">
              与当前版本的差异
            </span>
            <Button
              size="sm"
              onClick={() => setShowRestoreConfirm(true)}
              disabled={isRestoring}
            >
              {isRestoring ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="mr-1 h-3 w-3" />
              )}
              恢复到此版本
            </Button>
          </div>

          <div className="max-h-64 overflow-auto">
            {isLoadingDiff ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : diff ? (
              <DiffHunkView hunks={diff.hunks} />
            ) : null}
          </div>
        </div>
      )}

      {showRestoreConfirm && selectedVersion && (
        <RestoreConfirmDialog
          version={selectedVersion}
          onConfirm={handleRestoreConfirm}
          onCancel={() => setShowRestoreConfirm(false)}
        />
      )}
    </div>
  )
}
