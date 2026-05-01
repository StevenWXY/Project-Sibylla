import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../utils/cn'
import { useFocusStore } from '../../store/focusStore'

export function FocusSummaryCard() {
  const { summary, setSummary } = useFocusStore()
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (summary && !dismissed) {
      setVisible(true)
    } else {
      setVisible(false)
    }
  }, [summary, dismissed])

  const handleClose = useCallback(() => {
    setVisible(false)
    setDismissed(true)
    setTimeout(() => {
      setSummary('')
      setDismissed(false)
    }, 300)
  }, [setSummary])

  useEffect(() => {
    if (!visible) return

    const timer = setTimeout(() => {
      handleClose()
    }, 15000)

    return () => clearTimeout(timer)
  }, [visible, handleClose])

  if (!summary) return null

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50 w-80',
        'transition-transform duration-300 ease-out',
        visible ? 'translate-x-0' : 'translate-x-[120%]',
      )}
    >
      <div
        className={cn(
          'bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700',
          'overflow-hidden',
        )}
      >
        <div
          className={cn(
            'flex items-center justify-between px-4 py-3',
            'border-b border-gray-100 dark:border-gray-700',
            'bg-violet-50 dark:bg-violet-900/20',
          )}
        >
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: '#8b5cf6' }}
            />
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Focus Summary
            </span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className={cn(
              'p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
              'hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
              'focus:outline-none',
            )}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3">
          <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-sans leading-relaxed">
            {summary}
          </pre>
        </div>
      </div>
    </div>
  )
}
