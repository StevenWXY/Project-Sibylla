import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '../ui/Button'

interface SaveFailureBannerProps {
  readonly failedFiles: ReadonlyArray<{ readonly path: string; readonly error: string }>
  readonly onRetry: (filePath: string) => void
  readonly onDismiss: () => void
}

export const SaveFailureBanner = React.memo(function SaveFailureBanner({
  failedFiles,
  onRetry,
  onDismiss,
}: SaveFailureBannerProps) {
  if (failedFiles.length === 0) return null

  return (
    <div className="sticky top-0 z-20 border-b border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/20">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            文件保存失败
          </p>
          <ul className="mt-1 space-y-0.5">
            {failedFiles.map((file) => (
              <li
                key={file.path}
                className="text-xs text-amber-700 dark:text-amber-300"
              >
                {file.path.split('/').pop() ?? file.path}: {file.error}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { onRetry(failedFiles[0].path) }}
            className="border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900/40"
          >
            重试
          </Button>
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-amber-600 hover:underline dark:text-amber-400"
          >
            忽略
          </button>
        </div>
      </div>
    </div>
  )
})
