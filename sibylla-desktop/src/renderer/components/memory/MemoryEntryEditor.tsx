import React, { useState, useRef, useEffect } from 'react'
import { cn } from '../../utils/cn'
import type { MemoryEntry } from '../../../shared/types'

interface MemoryEntryEditorProps {
  entry: MemoryEntry
  onSave: (newContent: string) => Promise<void>
  onCancel: () => void
}

/**
 * MemoryEntryEditor — modal-style editor for editing memory entry content.
 */
export const MemoryEntryEditor = React.memo(function MemoryEntryEditor({
  entry,
  onSave,
  onCancel,
}: MemoryEntryEditorProps) {
  const [content, setContent] = useState(entry.content)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleSave = async () => {
    if (content.trim() === entry.content.trim()) {
      onCancel()
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      await onSave(content)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setIsSaving(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel()
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      void handleSave()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className={cn(
          'w-full max-w-lg rounded-lg border border-white/10 bg-gray-900 p-4 shadow-xl',
          'animate-in fade-in zoom-in-95 duration-200',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-medium text-white mb-3">编辑记忆条目</h3>

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={8}
          className={cn(
            'w-full rounded-md border border-white/10 bg-white/5',
            'p-3 text-sm text-white placeholder-gray-500 resize-y',
            'focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500',
          )}
        />

        {error && (
          <p className="mt-2 text-xs text-red-400">{error}</p>
        )}

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Ctrl+Enter 保存 / Esc 取消
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              disabled={isSaving}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium text-gray-400',
                'border border-white/10 hover:bg-white/5 transition-colors',
                'disabled:opacity-50',
              )}
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !content.trim()}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium text-white',
                'bg-indigo-600 hover:bg-indigo-700 transition-colors',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
            >
              {isSaving ? (
                <span className="flex items-center gap-1">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border border-white border-t-transparent" />
                  保存中...
                </span>
              ) : (
                '保存'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
})
