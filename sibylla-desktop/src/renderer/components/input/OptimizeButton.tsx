import React, { useState, useCallback } from 'react'
import type { OptimizationSuggestionShared } from '../../../shared/types'
import { SuggestionsPopover } from './SuggestionsPopover'

interface OptimizeButtonProps {
  inputValue: string
  currentMode: string
  conversationId: string
  onApply: (text: string) => void
  onMerge: (text: string) => void
}

const TIP_MESSAGE = '\uD83D\uDCA1 小贴士：你可以在设置中为常用场景预设输入模板'
const TIP_TRIGGER_COUNT = 5

export const OptimizeButton: React.FC<OptimizeButtonProps> = ({
  inputValue,
  currentMode,
  conversationId,
  onApply,
  onMerge,
}) => {
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<readonly OptimizationSuggestionShared[] | null>(null)
  const [requestId, setRequestId] = useState<string | null>(null)
  const [hintShown, setHintShown] = useState(false)

  const disabled = inputValue.trim().length < 5 || loading

  const incrementUsageCount = useCallback(() => {
    const key = `sibylla:optimizer:usage:${conversationId}`
    const current = parseInt(localStorage.getItem(key) ?? '0', 10)
    const next = current + 1
    localStorage.setItem(key, String(next))
    return next
  }, [conversationId])

  const handleOptimize = useCallback(async () => {
    if (disabled) return
    setLoading(true)
    try {
      const response = await window.electronAPI.promptOptimizer.optimize({
        originalText: inputValue,
        currentMode,
      })
      if (response.success && response.data) {
        setSuggestions(response.data.suggestions)
        setRequestId(response.data.requestId)
        const count = incrementUsageCount()
        if (count === TIP_TRIGGER_COUNT && !hintShown) {
          window.alert(TIP_MESSAGE)
          setHintShown(true)
        }
      }
    } catch {
      window.alert('优化服务暂时不可用，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [disabled, inputValue, currentMode, incrementUsageCount, hintShown])

  const handleApply = useCallback(
    async (suggestion: OptimizationSuggestionShared) => {
      onApply(suggestion.text)
      if (requestId) {
        await window.electronAPI.promptOptimizer.recordAction(requestId, 'applied', suggestion.id)
      }
      setSuggestions(null)
    },
    [onApply, requestId],
  )

  const handleMerge = useCallback(
    async (suggestion: OptimizationSuggestionShared) => {
      const additions = suggestion.keyChanges
        .filter(c => c.type === 'added')
        .map(c => c.description)
        .join('；')
      onMerge(`${inputValue}\n\n补充：${additions}`)
      if (requestId) {
        await window.electronAPI.promptOptimizer.recordAction(requestId, 'merged', suggestion.id)
      }
      setSuggestions(null)
    },
    [onMerge, inputValue, requestId],
  )

  const handleEditAndApply = useCallback(
    async (editedText: string, suggestion: OptimizationSuggestionShared) => {
      onApply(editedText)
      if (requestId) {
        await window.electronAPI.promptOptimizer.recordAction(requestId, 'edited', suggestion.id)
      }
      setSuggestions(null)
    },
    [onApply, requestId],
  )

  const handleIgnore = useCallback(async () => {
    if (requestId) {
      await window.electronAPI.promptOptimizer.recordAction(requestId, 'ignored')
    }
    setSuggestions(null)
  }, [requestId])

  return (
    <div className="relative">
      <button
        type="button"
        className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${
          disabled
            ? 'opacity-40 cursor-not-allowed text-sys-darkTextSecondary'
            : 'text-sys-darkTextSecondary hover:bg-[#1a1a1a] hover:text-white'
        }`}
        onClick={handleOptimize}
        disabled={disabled}
        title={inputValue.trim().length < 5 ? '请先输入内容（至少 5 字符）' : '优化提示词'}
      >
        {loading ? (
          <span className="inline-block w-3 h-3 border-2 border-sys-darkTextSecondary border-t-transparent rounded-full animate-spin" />
        ) : (
          <span>✨</span>
        )}
        <span>优化</span>
      </button>

      {suggestions && suggestions.length > 0 && (
        <SuggestionsPopover
          original={inputValue}
          suggestions={suggestions}
          onApply={handleApply}
          onMerge={handleMerge}
          onEdit={handleEditAndApply}
          onClose={handleIgnore}
        />
      )}
    </div>
  )
}
