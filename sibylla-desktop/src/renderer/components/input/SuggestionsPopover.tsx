import React, { useState, useEffect, useRef } from 'react'
import type { OptimizationSuggestionShared } from '../../../shared/types'

interface SuggestionsPopoverProps {
  original: string
  suggestions: readonly OptimizationSuggestionShared[]
  onApply: (suggestion: OptimizationSuggestionShared) => void
  onMerge: (suggestion: OptimizationSuggestionShared) => void
  onEdit: (editedText: string, suggestion: OptimizationSuggestionShared) => void
  onClose: () => void
}

const CHANGE_STYLES: Record<string, { bg: string; prefix: string; label: string }> = {
  added: { bg: 'bg-emerald-900/50 text-emerald-300', prefix: '+', label: '补充' },
  clarified: { bg: 'bg-blue-900/50 text-blue-300', prefix: '→', label: '澄清' },
  removed: { bg: 'bg-red-900/50 text-red-300', prefix: '-', label: '移除' },
  restructured: { bg: 'bg-purple-900/50 text-purple-300', prefix: '↻', label: '重构' },
}

export const SuggestionsPopover: React.FC<SuggestionsPopoverProps> = ({
  suggestions,
  onApply,
  onMerge,
  onEdit,
  onClose,
}) => {
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const [editingSuggestion, setEditingSuggestion] = useState<OptimizationSuggestionShared | null>(null)
  const [editText, setEditText] = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const selectedSuggestion = suggestions[selectedSuggestionIndex]

  const handleStartEdit = (suggestion: OptimizationSuggestionShared) => {
    setEditingSuggestion(suggestion)
    setEditText(suggestion.text)
  }

  const handleConfirmEdit = () => {
    if (editingSuggestion) {
      onEdit(editText, editingSuggestion)
    }
  }

  const handleCancelEdit = () => {
    setEditingSuggestion(null)
    setEditText('')
  }

  if (editingSuggestion) {
    return (
      <div
        ref={popoverRef}
        className="absolute bottom-full left-0 mb-2 w-full min-w-[320px] z-[1000] rounded-lg border border-sys-darkBorder bg-[#0a0a0a] shadow-2xl p-3"
      >
        <div className="text-xs text-sys-darkTextSecondary mb-2">编辑建议</div>
        <textarea
          className="w-full h-32 bg-[#111] border border-sys-darkBorder rounded-md p-2 text-sm text-white resize-none focus:outline-none focus:border-indigo-500"
          value={editText}
          onChange={e => setEditText(e.target.value)}
        />
        <div className="flex gap-2 mt-2 justify-end">
          <button
            type="button"
            className="px-3 py-1 text-xs rounded-md text-sys-darkTextSecondary hover:bg-[#1a1a1a]"
            onClick={handleCancelEdit}
          >
            取消
          </button>
          <button
            type="button"
            className="px-3 py-1 text-xs rounded-md bg-indigo-500 text-white hover:bg-indigo-600"
            onClick={handleConfirmEdit}
          >
            确认应用
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={popoverRef}
      className="absolute bottom-full left-0 mb-2 w-full min-w-[320px] z-[1000] rounded-lg border border-sys-darkBorder bg-[#0a0a0a] shadow-2xl"
    >
      <div className="p-3 border-b border-sys-darkBorder">
        <div className="text-xs text-sys-darkTextSecondary mb-1">优化建议（{suggestions.length}）</div>
        <div className="flex gap-1">
          {suggestions.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`px-2 py-0.5 text-xs rounded ${
                i === selectedSuggestionIndex
                  ? 'bg-indigo-500/20 text-indigo-300'
                  : 'text-sys-darkTextSecondary hover:bg-[#1a1a1a]'
              }`}
              onClick={() => setSelectedSuggestionIndex(i)}
            >
              建议 {i + 1}
            </button>
          ))}
        </div>
      </div>

      {selectedSuggestion && (
        <div className="p-3">
          <div className="text-sm text-white whitespace-pre-wrap mb-2 leading-relaxed">
            {selectedSuggestion.text}
          </div>

          {selectedSuggestion.keyChanges.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {selectedSuggestion.keyChanges.map((change, i) => {
                const style = CHANGE_STYLES[change.type] ?? CHANGE_STYLES.added!
                return (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded-full ${style.bg}`}
                  >
                    {style.prefix} {change.description}
                  </span>
                )
              })}
            </div>
          )}

          <div className="text-xs text-sys-darkTextSecondary mb-2">
            {selectedSuggestion.rationale}
          </div>

          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${Math.round(selectedSuggestion.estimatedImprovementScore * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-sys-darkTextSecondary">
              {Math.round(selectedSuggestion.estimatedImprovementScore * 100)}%
            </span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="px-3 py-1.5 text-xs rounded-md bg-indigo-500 text-white hover:bg-indigo-600 transition-colors"
              onClick={() => onApply(selectedSuggestion)}
            >
              应用
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-xs rounded-md border border-sys-darkBorder text-sys-darkTextSecondary hover:bg-[#1a1a1a] transition-colors"
              onClick={() => onMerge(selectedSuggestion)}
            >
              合并
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-xs rounded-md border border-sys-darkBorder text-sys-darkTextSecondary hover:bg-[#1a1a1a] transition-colors"
              onClick={() => handleStartEdit(selectedSuggestion)}
            >
              编辑后应用
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-xs rounded-md text-sys-darkTextSecondary hover:bg-[#1a1a1a] transition-colors"
              onClick={onClose}
            >
              忽略
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
