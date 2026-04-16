/**
 * ConflictResolutionPanel — Upgraded conflict resolution UI
 *
 * Connects to conflictStore for conflict data and provides
 * multi-file navigation + ConflictCompareView integration.
 *
 * Falls back to prop-based rendering when no store conflicts
 * are available (backward compatibility with existing WorkspaceStudioPage).
 */

import { useCallback } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import { ConflictCompareView } from '../conflict/ConflictCompareView'
import {
  useConflictStore,
  selectActiveConflict,
  selectActiveIndex,
  selectConflictCount,
  selectIsResolving,
  selectResolveError,
} from '../../store/conflictStore'
import type { ConflictResolution } from '../../../shared/types'

interface ConflictResolutionPanelProps {
  /** Legacy prop: conflict file path (used when conflictStore is empty) */
  readonly path?: string
  /** Legacy prop: your lines */
  readonly yourLines?: string[]
  /** Legacy prop: their lines */
  readonly theirLines?: string[]
  /** Legacy prop: AI merge text */
  readonly aiMergeText?: string
  /** Legacy callback: accept yours */
  readonly onApplyYours?: () => void
  /** Legacy callback: accept theirs */
  readonly onApplyTheirs?: () => void
  /** Legacy callback: accept AI */
  readonly onApplyAI?: () => void
  /** Legacy callback: manual edit */
  readonly onManualEdit?: () => void
}

export function ConflictResolutionPanel({
  path,
  yourLines,
  theirLines,
  aiMergeText,
  onApplyYours,
  onApplyTheirs,
  onApplyAI,
  onManualEdit,
}: ConflictResolutionPanelProps) {
  const storeActiveConflict = useConflictStore(selectActiveConflict)
  const storeActiveIndex = useConflictStore(selectActiveIndex)
  const storeConflictCount = useConflictStore(selectConflictCount)
  const storeIsResolving = useConflictStore(selectIsResolving)
  const storeResolveError = useConflictStore(selectResolveError)
  const setActiveIndex = useConflictStore((s) => s.setActiveIndex)
  const resolveConflict = useConflictStore((s) => s.resolveConflict)

  const handleStoreResolve = useCallback(
    async (resolution: ConflictResolution) => {
      await resolveConflict(resolution)
    },
    [resolveConflict],
  )

  const handlePrev = useCallback(() => {
    if (storeActiveIndex > 0) {
      setActiveIndex(storeActiveIndex - 1)
    }
  }, [storeActiveIndex, setActiveIndex])

  const handleNext = useCallback(() => {
    if (storeActiveIndex < storeConflictCount - 1) {
      setActiveIndex(storeActiveIndex + 1)
    }
  }, [storeActiveIndex, storeConflictCount, setActiveIndex])

  // Store-driven mode: use ConflictCompareView with real data
  if (storeConflictCount > 0 && storeActiveConflict) {
    return (
      <div className="my-4 overflow-hidden rounded-xl border border-amber-500/30 bg-[#0D0D0D] shadow-lg">
        {/* Multi-file navigation */}
        {storeConflictCount > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-amber-500/20 bg-amber-500/5">
            <button
              type="button"
              className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={storeActiveIndex === 0}
              onClick={handlePrev}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-gray-400">
              {storeActiveIndex + 1} / {storeConflictCount}
            </span>
            <button
              type="button"
              className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
              disabled={storeActiveIndex === storeConflictCount - 1}
              onClick={handleNext}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="h-80">
          <ConflictCompareView
            conflict={storeActiveConflict}
            isResolving={storeIsResolving}
            onResolve={handleStoreResolve}
          />
        </div>

        {storeResolveError && (
          <div className="px-4 py-2 text-xs text-red-400 border-t border-red-500/20 bg-red-500/5">
            {storeResolveError}
          </div>
        )}
      </div>
    )
  }

  // Legacy fallback: render the old-style panel using props
  if (!path) return null

  return (
    <section className="my-8 overflow-hidden rounded-xl border border-status-warning bg-[#1A1500] shadow-lg">
      <div className="flex items-center gap-2 border-b border-status-warning/30 bg-status-warning/10 px-4 py-2 text-sm font-medium text-status-warning">
        <AlertTriangle className="h-4 w-4" />
        冲突: {path}
      </div>

      <div className="grid grid-cols-2 border-b border-status-warning/20">
        <div className="border-r border-status-warning/20 p-4">
          <div className="mb-3 font-mono text-xs uppercase text-gray-500">你的版本</div>
          <div className="space-y-1 font-mono text-[13px] text-gray-300">
            {(yourLines ?? []).map((line, index) => (
              <p
                key={`your-${index}`}
                className={
                  line.startsWith('-')
                    ? 'rounded bg-status-error/10 px-1 text-status-error'
                    : ''
                }
              >
                {line}
              </p>
            ))}
          </div>
        </div>

        <div className="p-4">
          <div className="mb-3 font-mono text-xs uppercase text-gray-500">对方的版本</div>
          <div className="space-y-1 font-mono text-[13px] text-gray-300">
            {(theirLines ?? []).map((line, index) => (
              <p
                key={`their-${index}`}
                className={
                  line.startsWith('+')
                    ? 'rounded bg-status-success/10 px-1 text-status-success'
                    : ''
                }
              >
                {line}
              </p>
            ))}
          </div>
        </div>
      </div>

      {aiMergeText && (
        <div className="border-b border-status-warning/20 bg-sys-black/50 p-4">
          <div className="mb-2 font-mono text-xs text-white">AI 建议合并:</div>
          <div className="font-mono text-[13px] text-gray-200">{aiMergeText}</div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 bg-[#111111] p-3">
        <button
          type="button"
          onClick={onApplyYours}
          className="rounded border border-sys-darkBorder bg-sys-darkSurface px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
        >
          采用我的版本
        </button>
        <button
          type="button"
          onClick={onApplyTheirs}
          className="rounded border border-sys-darkBorder bg-sys-darkSurface px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
        >
          采用对方的版本
        </button>
        <button
          type="button"
          onClick={onApplyAI}
          className="rounded bg-white px-3 py-1.5 text-xs font-medium text-black shadow-[0_0_15px_rgba(255,255,255,0.2)] transition-colors hover:bg-gray-200 disabled:opacity-40"
          disabled
          title="Phase 2 可用"
        >
          采用AI建议
        </button>
        <button
          type="button"
          onClick={onManualEdit}
          className="ml-auto rounded border border-transparent bg-transparent px-3 py-1.5 text-xs font-medium text-sys-darkMuted transition-colors hover:text-white"
        >
          手动编辑
        </button>
      </div>
    </section>
  )
}
