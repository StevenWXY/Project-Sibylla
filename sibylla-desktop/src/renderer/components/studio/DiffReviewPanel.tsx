import { memo, useCallback } from 'react'
import { Check, X, Edit3, Loader2, AlertTriangle, RotateCcw } from 'lucide-react'
import { cn } from '../../utils/cn'
import { DiffHunkView } from '../version-history/DiffHunkView'
import { DiffFileList } from './DiffFileList'
import { EditableDiffView } from './EditableDiffView'
import type { ParsedFileDiff } from './types'

interface DiffReviewPanelProps {
  proposals: readonly ParsedFileDiff[]
  activeIndex: number
  isApplying: boolean
  isEditing: boolean
  editingContent: string
  appliedPaths: readonly string[]
  failedPath: string | null
  errorMessage: string | null
  onApply: (filePath: string) => Promise<void>
  onApplyAll: () => Promise<void>
  onStartEditing: () => void
  onCancelEditing: () => void
  onEditingContentChange: (content: string) => void
  onApplyEdited: () => Promise<void>
  onRollback: () => Promise<void>
  onDismiss: () => void
  onClearError: () => void
  onSetActiveIndex: (index: number) => void
}

export const DiffReviewPanel = memo(function DiffReviewPanel({
  proposals,
  activeIndex,
  isApplying,
  isEditing,
  editingContent,
  appliedPaths,
  failedPath,
  errorMessage,
  onApply,
  onApplyAll,
  onStartEditing,
  onCancelEditing,
  onEditingContentChange,
  onApplyEdited,
  onRollback,
  onDismiss,
  onClearError: _onClearError,
  onSetActiveIndex,
}: DiffReviewPanelProps) {
  const activeProposal = proposals[activeIndex]
  const isMultiFile = proposals.length > 1
  const allApplied = proposals.every((p) => appliedPaths.includes(p.filePath))

  const handleApply = useCallback(() => {
    if (activeProposal) {
      void onApply(activeProposal.filePath)
    }
  }, [activeProposal, onApply])

  const handleApplyAll = useCallback(() => {
    void onApplyAll()
  }, [onApplyAll])

  const handleApplyEdited = useCallback(() => {
    void onApplyEdited()
  }, [onApplyEdited])

  const handleRollback = useCallback(() => {
    void onRollback()
  }, [onRollback])

  if (proposals.length === 0 || allApplied) {
    return null
  }

  return (
    <div className="rounded-lg border border-sys-darkBorder bg-[#0A0A0A]">
      <div className="flex items-center justify-between border-b border-sys-darkBorder bg-sys-darkSurface px-3 py-1.5">
        <span className="text-xs font-medium text-gray-300">
          AI 建议修改 {isMultiFile ? `${proposals.length} 个文件` : '文件'}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="text-gray-500 transition-colors hover:text-gray-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {isMultiFile && (
        <DiffFileList
          proposals={proposals}
          activeIndex={activeIndex}
          appliedPaths={appliedPaths}
          onSelect={onSetActiveIndex}
        />
      )}

      {activeProposal && (
        <div className="p-2">
          <div className="mb-2 flex items-center gap-2 text-xs text-gray-400">
            <span className="font-mono">{activeProposal.filePath}</span>
            <span className="text-emerald-400">+{activeProposal.stats.additions}</span>
            <span className="text-red-400">-{activeProposal.stats.deletions}</span>
            {appliedPaths.includes(activeProposal.filePath) && (
              <span className="flex items-center gap-1 text-emerald-400">
                <Check className="h-3 w-3" /> 已应用
              </span>
            )}
          </div>

          {errorMessage && failedPath && (
            <div className="mb-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                <div className="flex-1">
                  <p className="text-xs text-red-300">
                    {failedPath}: {errorMessage}
                  </p>
                  {appliedPaths.length > 0 && (
                    <button
                      type="button"
                      onClick={handleRollback}
                      disabled={isApplying}
                      className={cn(
                        'mt-1.5 flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-red-300 transition-colors hover:bg-red-500/20',
                        isApplying && 'opacity-50'
                      )}
                    >
                      {isApplying ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3" />
                      )}
                      回滚已应用的修改 ({appliedPaths.length})
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {isEditing ? (
            <EditableDiffView
              initialContent={editingContent}
              filePath={activeProposal.filePath}
              onContentChange={onEditingContentChange}
            />
          ) : (
            <DiffHunkView hunks={activeProposal.hunks} />
          )}

          <div className="mt-2 flex items-center gap-2">
            {!isEditing ? (
              <>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={isApplying || appliedPaths.includes(activeProposal.filePath)}
                  className={cn(
                    'flex items-center gap-1.5 rounded bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed'
                  )}
                >
                  {isApplying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  应用
                </button>
                <button
                  type="button"
                  onClick={onStartEditing}
                  disabled={isApplying}
                  className="flex items-center gap-1.5 rounded border border-sys-darkBorder bg-sys-darkSurface px-3 py-1.5 text-xs text-gray-300 transition-colors hover:text-white disabled:opacity-50"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  编辑应用
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleApplyEdited}
                  disabled={isApplying}
                  className="flex items-center gap-1.5 rounded bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
                >
                  {isApplying ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  应用编辑
                </button>
                <button
                  type="button"
                  onClick={onCancelEditing}
                  disabled={isApplying}
                  className="flex items-center gap-1.5 rounded border border-sys-darkBorder bg-sys-darkSurface px-3 py-1.5 text-xs text-gray-300 transition-colors hover:text-white disabled:opacity-50"
                >
                  取消
                </button>
              </>
            )}

            {isMultiFile && !isEditing && (
              <button
                type="button"
                onClick={handleApplyAll}
                disabled={isApplying}
                className="ml-auto flex items-center gap-1.5 rounded border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-300 transition-colors hover:bg-indigo-500/20 disabled:opacity-50"
              >
                {isApplying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                全部应用 ({proposals.length} 个文件)
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
})
