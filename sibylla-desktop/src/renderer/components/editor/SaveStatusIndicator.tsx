import { Check, Loader2, Circle } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'

export function SaveStatusIndicator() {
  const isDirty = useEditorStore((s) => s.isDirty)
  const isSaving = useEditorStore((s) => s.isSaving)
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt)

  if (isSaving) {
    return (
      <span className="flex items-center gap-1 text-xs text-blue-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving...
      </span>
    )
  }

  if (isDirty) {
    return (
      <span className="flex items-center gap-1 text-xs text-amber-400">
        <Circle className="h-2.5 w-2.5 fill-current" />
        Unsaved
      </span>
    )
  }

  if (lastSavedAt) {
    const timeStr = new Date(lastSavedAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-400">
        <Check className="h-3 w-3" />
        Saved {timeStr}
      </span>
    )
  }

  return null
}
