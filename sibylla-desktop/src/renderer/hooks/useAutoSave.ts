import { useCallback, useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditorStore } from '../store/editorStore'

export interface AutoSaveOptions {
  enabled: boolean
  debounceMs: number
  onSave: (content: string) => Promise<void>
  onError: (error: Error) => void
}

export function useAutoSave(
  editor: Editor | null,
  filePath: string,
  options: AutoSaveOptions
) {
  const { enabled, debounceMs, onSave, onError } = options
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isComposingRef = useRef(false)
  const flushRef = useRef<() => Promise<void>>(async () => {})

  const setSaving = useEditorStore((s) => s.setSaving)
  const setSaved = useEditorStore((s) => s.setSaved)
  const setSaveError = useEditorStore((s) => s.setSaveError)
  const setDirty = useEditorStore((s) => s.setDirty)

  const doSave = useCallback(
    async (content: string) => {
      setSaving(true)
      try {
        await onSave(content)
        setSaved()
        setDirty(false)
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        setSaveError(error.message)
        onError(error)
      }
    },
    [onSave, onError, setSaving, setSaved, setSaveError, setDirty]
  )

  const scheduleSave = useCallback(
    (content: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
      timerRef.current = setTimeout(() => {
        void doSave(content)
      }, debounceMs)
    },
    [debounceMs, doSave]
  )

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (!editor) return
    const markdown = editor.storage.markdown?.getMarkdown?.() ?? ''
    await doSave(markdown)
  }, [editor, doSave])

  flushRef.current = flush

  useEffect(() => {
    if (!editor || !enabled || !filePath) return

    const handleUpdate = () => {
      if (isComposingRef.current) return
      const markdown: string = editor.storage.markdown?.getMarkdown?.() ?? ''
      scheduleSave(markdown)
    }

    const handleCompositionStart = () => {
      isComposingRef.current = true
    }

    const handleCompositionEnd = () => {
      isComposingRef.current = false
      handleUpdate()
    }

    editor.on('update', handleUpdate)
    const view = editor.view
    view.dom.addEventListener('compositionstart', handleCompositionStart)
    view.dom.addEventListener('compositionend', handleCompositionEnd)

    return () => {
      editor.off('update', handleUpdate)
      view.dom.removeEventListener('compositionstart', handleCompositionStart)
      view.dom.removeEventListener('compositionend', handleCompositionEnd)
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [editor, enabled, filePath, scheduleSave])

  /* [C4-FIX] Use editorStore.isDirty (content-level) instead of TipTap's editor.isDirty
     (undo-history-level) to determine whether content needs flushing on unmount. */
  const storeIsDirty = useEditorStore((s) => s.isDirty)

  useEffect(() => {
    return () => {
      if (editor && !editor.isDestroyed && storeIsDirty) {
        const markdown: string = editor.storage.markdown?.getMarkdown?.() ?? ''
        void onSave(markdown)
      }
    }
  }, [editor, onSave, storeIsDirty])

  return { flush }
}
