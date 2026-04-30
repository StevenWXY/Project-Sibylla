/**
 * ConflictCompareView — Side-by-side conflict comparison view
 *
 * Displays local (ours) and remote (theirs) versions side by side
 * with diff highlighting. Supports tab switching between compare
 * mode and manual merge mode.
 *
 * Action buttons:
 * - 采用我的版本 (mine)
 * - 采用对方的版本 (theirs)
 * - 采用AI建议 (disabled, Phase 2)
 * - 确认手动合并 (manual, visible in manual tab)
 *
 * All UI text follows CLAUDE.md: no Git terminology.
 */

import { useState, useCallback, useEffect } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { DiffHighlight } from './DiffHighlight'
import { ConflictEditor } from './ConflictEditor'
import { AIMergePanel } from './AIMergePanel'
import type { ConflictInfo, ConflictResolution, MergeResult } from '../../../shared/types'

type AIStatus = 'loading' | 'ready' | 'failed' | 'sensitive' | 'timeout'

interface ConflictCompareViewProps {
  readonly conflict: ConflictInfo
  readonly isResolving: boolean
  readonly onResolve: (resolution: ConflictResolution) => void
}

export function ConflictCompareView({
  conflict,
  isResolving,
  onResolve,
}: ConflictCompareViewProps) {
  const [activeTab, setActiveTab] = useState<'compare' | 'manual'>('compare')
  const [manualContent, setManualContent] = useState(conflict.localContent)
  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null)
  const [aiStatus, setAiStatus] = useState<AIStatus>('loading')
  const [showAIMergePanel, setShowAIMergePanel] = useState(false)

  useEffect(() => {
    setManualContent(conflict.localContent)
    setActiveTab('compare')
  }, [conflict.filePath, conflict.localContent])

  useEffect(() => {
    if (!conflict.filePath) return

    let cancelled = false
    setAiStatus('loading')
    setMergeResult(null)
    setShowAIMergePanel(false)

    window.electronAPI.sync.proposeAIMerge(conflict).then((response) => {
      if (cancelled) return
      if (response.success && response.data) {
        const result = response.data
        setMergeResult(result)
        setAiStatus(result.status === 'success' ? 'ready' : (result.status as AIStatus))
      } else {
        setAiStatus('failed')
      }
    }).catch(() => {
      if (cancelled) return
      setAiStatus('failed')
    })

    return () => { cancelled = true }
  }, [conflict])

  const handleManualChange = useCallback((content: string) => {
    setManualContent(content)
  }, [])

  const handleAdoptAIMerge = useCallback(async (mergedContent: string) => {
    if (!mergeResult?.attribution || !conflict.conflictId) return
    await window.electronAPI.sync.adoptAIMerge({
      conflictId: conflict.conflictId,
      filePath: conflict.filePath,
      mergedContent,
      attribution: mergeResult.attribution,
      rationale: mergeResult.rationale ?? '',
    })
    setShowAIMergePanel(false)
    onResolve({ filePath: conflict.filePath, type: 'manual', content: mergedContent })
  }, [mergeResult, conflict, onResolve])

  const handleEditAndAdopt = useCallback((mergedContent: string) => {
    setManualContent(mergedContent)
    setActiveTab('manual')
    setShowAIMergePanel(false)
  }, [])

  const aiTooltip = aiStatus === 'sensitive'
    ? '敏感文件不发送给 AI'
    : aiStatus === 'failed'
      ? 'AI 建议不可用'
      : aiStatus === 'loading' || aiStatus === 'timeout'
        ? 'AI 建议生成中...'
        : '查看 AI 合并建议'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <h2 className="text-sm font-medium truncate">
            冲突: {conflict.filePath}
          </h2>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            className={`px-3 py-1 text-xs rounded transition-colors ${
              activeTab === 'compare'
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
            onClick={() => setActiveTab('compare')}
          >
            对比视图
          </button>
          <button
            type="button"
            className={`px-3 py-1 text-xs rounded transition-colors ${
              activeTab === 'manual'
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
            onClick={() => setActiveTab('manual')}
          >
            手动合并
          </button>
        </div>
      </div>

      {/* Compare View */}
      {activeTab === 'compare' && (
        <div className="flex-1 grid grid-cols-2 gap-0 overflow-hidden min-h-0">
          <div className="border-r border-gray-200 dark:border-gray-700 flex flex-col min-h-0">
            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 text-xs font-medium border-b border-gray-200 dark:border-gray-700 shrink-0">
              你的版本
            </div>
            <div className="flex-1 overflow-auto min-h-0">
              <DiffHighlight
                content={conflict.localContent}
                compareAgainst={conflict.remoteContent}
              />
            </div>
          </div>
          <div className="flex flex-col min-h-0">
            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 text-xs font-medium border-b border-gray-200 dark:border-gray-700 shrink-0">
              对方的版本{conflict.remoteAuthor ? `（${conflict.remoteAuthor}）` : ''}
            </div>
            <div className="flex-1 overflow-auto min-h-0">
              <DiffHighlight
                content={conflict.remoteContent}
                compareAgainst={conflict.localContent}
              />
            </div>
          </div>
        </div>
      )}

      {/* Manual Merge Editor */}
      {activeTab === 'manual' && (
        <div className="flex-1 min-h-0">
          <ConflictEditor
            initialContent={conflict.localContent}
            onChange={handleManualChange}
          />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0">
        <button
          type="button"
          className="px-4 py-2 text-xs bg-indigo-500 hover:bg-indigo-600 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isResolving}
          onClick={() => onResolve({ filePath: conflict.filePath, type: 'mine' })}
        >
          采用我的版本
        </button>
        <button
          type="button"
          className="px-4 py-2 text-xs bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isResolving}
          onClick={() => onResolve({ filePath: conflict.filePath, type: 'theirs' })}
        >
          采用对方的版本
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            aiStatus === 'ready'
              ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50'
              : 'bg-gray-300 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
          }`}
          disabled={aiStatus !== 'ready'}
          title={aiTooltip}
          onClick={() => setShowAIMergePanel(true)}
        >
          <span className="inline-flex items-center gap-1.5">
            {aiStatus === 'loading' && <Loader2 className="h-3 w-3 animate-spin" />}
            AI 建议合并
          </span>
        </button>
        {activeTab === 'manual' && (
          <button
            type="button"
            className="px-4 py-2 text-xs bg-emerald-500 hover:bg-emerald-600 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isResolving || !manualContent.trim()}
            onClick={() =>
              onResolve({
                filePath: conflict.filePath,
                type: 'manual',
                content: manualContent,
              })
            }
          >
            确认手动合并
          </button>
        )}
      </div>

      {showAIMergePanel && mergeResult?.status === 'success' && (
        <AIMergePanel
          mergeResult={mergeResult}
          onAdopt={handleAdoptAIMerge}
          onEditAndAdopt={handleEditAndAdopt}
          onDiscard={() => setShowAIMergePanel(false)}
        />
      )}
    </div>
  )
}
