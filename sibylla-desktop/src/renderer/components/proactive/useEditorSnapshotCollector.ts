import { useEffect, useRef, useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import { useAppStore } from '../../store/appStore'
import { useFocusStore } from '../../store/focusStore'
import { useModeStore } from '../../store/modeStore'

interface EditorSnapshot {
  filePath: string
  contentSummary: { length: number; recentText: string }
  typingVelocity: number
  continuousTypingMinutes: number
  cursorPosition: number
  selectionLength: number
  lastInteractionAt: number
  currentAiMode: string
  isFocused: boolean
}

export function useEditorSnapshotCollector(editor: Editor | null): void {
  const typingBufferRef = useRef<number[]>([])
  const continuousStartAtRef = useRef<number | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pushSnapshot = useCallback((snapshot: EditorSnapshot) => {
    try {
      window.electronAPI.proactive.pushSnapshot(snapshot as unknown as Record<string, unknown>)
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    if (!editor) return

    const handleUpdate = () => {
      const now = Date.now()
      typingBufferRef.current.push(now)
      if (continuousStartAtRef.current === null) {
        continuousStartAtRef.current = now
      }
    }

    editor.on('update', handleUpdate)

    return () => {
      editor.off('update', handleUpdate)
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return

    const interval = setInterval(() => {
      const state = editor.state
      const text = state.doc.textContent
      const recentText = text.slice(-500)
      const length = text.length

      const now = Date.now()
      typingBufferRef.current = typingBufferRef.current.filter((t) => now - t < 10000)
      const velocity = (typingBufferRef.current.length / 10) * 60

      const continuous = continuousStartAtRef.current
        ? (now - continuousStartAtRef.current) / 60000
        : 0

      if (typingBufferRef.current.length === 0) {
        continuousStartAtRef.current = null
      }

      const currentFile = useAppStore.getState().currentFile
      const filePath = currentFile?.path ?? ''
      const isFocused = useFocusStore.getState().isFocused
      const activeMode = useModeStore.getState().getActiveMode()
      const currentAiMode = activeMode?.id ?? 'free'

      const snapshot: EditorSnapshot = {
        filePath,
        contentSummary: { length, recentText },
        typingVelocity: velocity,
        continuousTypingMinutes: continuous,
        cursorPosition: state.selection.from,
        selectionLength: Math.abs(state.selection.to - state.selection.from),
        lastInteractionAt: now,
        currentAiMode,
        isFocused,
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = setTimeout(() => {
        pushSnapshot(snapshot)
      }, 2000)
    }, 1000)

    return () => {
      clearInterval(interval)
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [editor, pushSnapshot])
}
