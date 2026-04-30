import { useCallback, useEffect, useRef, useState } from 'react'
import { EyeOff } from 'lucide-react'
import { cn } from '../../utils/cn'
import { useFocusStore } from '../../store/focusStore'

interface FocusModeIndicatorProps {
  conversationId: string
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '0:00'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export function FocusModeIndicator({ conversationId }: FocusModeIndicatorProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [countdown, setCountdown] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { isFocused, focusUntil, queuePreview, toggle, fetchState, fetchQueuePreview } =
    useFocusStore()

  useEffect(() => {
    fetchState(conversationId)
  }, [conversationId, fetchState])

  useEffect(() => {
    if (!isFocused || !focusUntil) {
      setCountdown(null)
      return
    }

    const update = () => {
      const remaining = new Date(focusUntil).getTime() - Date.now()
      if (remaining <= 0) {
        setCountdown(null)
      } else {
        setCountdown(formatCountdown(remaining))
      }
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [isFocused, focusUntil])

  useEffect(() => {
    if (!dropdownOpen) return
    fetchQueuePreview()
  }, [dropdownOpen, fetchQueuePreview])

  useEffect(() => {
    if (!dropdownOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [dropdownOpen])

  const handleExitFocus = useCallback(async () => {
    await toggle(conversationId, false)
    setDropdownOpen(false)
  }, [toggle, conversationId])

  if (!isFocused) {
    return <EyeOff className="w-3.5 h-3.5 text-muted-foreground opacity-50" />
  }

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setDropdownOpen((prev) => !prev)}
        className={cn(
          'group inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full',
          'bg-violet-500/10 text-violet-600 dark:text-violet-400',
          'hover:bg-violet-500/20 transition-colors focus:outline-none',
        )}
        title={`${queuePreview.length} notifications queued`}
      >
        <span className="relative flex h-2 w-2">
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
            style={{ backgroundColor: '#8b5cf6' }}
          />
          <span
            className="relative inline-flex h-2 w-2 rounded-full"
            style={{ backgroundColor: '#8b5cf6' }}
          />
        </span>
        <span className="text-xs font-medium">Focus</span>
        {countdown && (
          <span className="text-xs opacity-70">{countdown} left</span>
        )}
      </button>

      {dropdownOpen && (
        <div
          className={cn(
            'absolute top-full right-0 mt-1 z-50 min-w-[200px]',
            'bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700',
            'py-1 overflow-hidden',
          )}
        >
          <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
            {queuePreview.length} notification{queuePreview.length !== 1 ? 's' : ''} queued
          </div>
          <button
            type="button"
            onClick={handleExitFocus}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 text-left text-sm',
              'text-red-600 dark:text-red-400',
              'hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors',
            )}
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>Exit focus</span>
          </button>
        </div>
      )}
    </div>
  )
}
