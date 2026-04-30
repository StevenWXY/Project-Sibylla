import { useEffect } from 'react'
import type { Editor } from '@tiptap/react'

export function useEditingPresence(editor: Editor | null): void {
  useEffect(() => {
    if (!editor) return

    let editingTimer: ReturnType<typeof setTimeout> | null = null

    const handleUpdate = () => {
      window.electronAPI.presence.broadcastView(undefined).catch(() => {})

      if (editingTimer) clearTimeout(editingTimer)
      editingTimer = setTimeout(() => {
        window.electronAPI.presence.broadcastView(undefined).catch(() => {})
        editingTimer = null
      }, 10000)
    }

    editor.on('update', handleUpdate)

    return () => {
      editor.off('update', handleUpdate)
      if (editingTimer) clearTimeout(editingTimer)
    }
  }, [editor])
}
