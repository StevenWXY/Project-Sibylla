import { useEffect } from 'react'
import { cn } from '../../utils/cn'
import { useModeStore } from '../../store/modeStore'
import type { ModeWarningShared } from '../../../shared/types'

interface ModeIndicatorProps {
  conversationId: string
  warnings?: ModeWarningShared[]
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function ModeIndicator({ conversationId, warnings }: ModeIndicatorProps) {
  const { getActiveMode, setCurrentConversation } = useModeStore()

  useEffect(() => {
    setCurrentConversation(conversationId)
  }, [conversationId, setCurrentConversation])

  const activeMode = getActiveMode()

  if (!activeMode || activeMode.id === 'free') {
    return null
  }

  return (
    <div className="flex flex-col gap-1">
      <span
        className={cn(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
        )}
        style={{
          backgroundColor: hexToRgba(activeMode.color, 0.1),
          color: activeMode.color,
        }}
      >
        <span className="text-sm">{activeMode.icon}</span>
        <span>{activeMode.label} 模式</span>
      </span>

      {warnings && warnings.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {warnings.map((w, i) => (
            <span
              key={i}
              className={cn(
                'text-xs px-2 py-0.5 rounded',
                w.severity === 'warning'
                  ? 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20'
                  : 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20',
              )}
            >
              ⚠️ {w.message}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
