import { useState, useEffect, useCallback } from 'react'
import { MarkdownRenderer } from '../studio/MarkdownRenderer'
import type { HandbookEntryShared } from '../../../shared/types'

interface HandbookViewerProps {
  entryId: string
  language?: string
  onClose?: () => void
}

export function HandbookViewer({ entryId, language, onClose }: HandbookViewerProps) {
  const [entry, setEntry] = useState<HandbookEntryShared | null>(null)
  const [loading, setLoading] = useState(true)

  const loadEntry = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.handbook.getEntry(entryId, language)
      if (result.success) {
        setEntry(result.data ?? null)
      }
    } finally {
      setLoading(false)
    }
  }, [entryId, language])

  useEffect(() => {
    loadEntry()
  }, [loadEntry])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-blue-400" />
      </div>
    )
  }

  if (!entry) {
    return (
      <div className="p-8 text-center text-white/50">
        <p>条目未找到</p>
      </div>
    )
  }

  const sourceLabel = entry.source === 'builtin' ? '✓ 内置' : '✎ 本地'
  const sourceColor = entry.source === 'builtin' ? 'text-emerald-400' : 'text-amber-400'

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white">{entry.title}</h2>
          <span className={`text-xs ${sourceColor}`}>{sourceLabel}</span>
          <span className="rounded bg-white/10 px-2 py-0.5 text-xs text-white/50">
            {entry.language.toUpperCase()}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <MarkdownRenderer content={entry.content} />
      </div>

      <div className="border-t border-white/10 px-4 py-2 text-xs text-white/30">
        最后更新：{entry.updatedAt}
      </div>
    </div>
  )
}
