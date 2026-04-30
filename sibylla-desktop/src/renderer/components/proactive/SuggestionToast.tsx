import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Suggestion {
  id: string
  triggerId: string
  title: string
  body: string
  acceptAction: { command: string; args: Record<string, unknown> }
  declineAction: 'dismiss' | 'snooze-1h' | 'never'
  priority: 'urgent' | 'normal'
  createdAt: number
}

interface SuggestionToastProps {
  suggestion: Suggestion
  onDismiss: () => void
  onAccept: () => void
}

const AUTO_DISMISS_MS = 15000
const HOVER_RESET_MS = 5000

export function SuggestionToast({ suggestion, onDismiss, onAccept }: SuggestionToastProps) {
  const [expanded, setExpanded] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverRef = useRef(false)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const startTimer = useCallback(
    (ms: number) => {
      clearTimer()
      timerRef.current = setTimeout(() => {
        onDismiss()
      }, ms)
    },
    [onDismiss, clearTimer],
  )

  useEffect(() => {
    startTimer(AUTO_DISMISS_MS)
    return () => clearTimer()
  }, [startTimer, clearTimer])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onDismiss])

  const handleMouseEnter = () => {
    hoverRef.current = true
    clearTimer()
  }

  const handleMouseLeave = () => {
    hoverRef.current = false
    startTimer(HOVER_RESET_MS)
  }

  const handleAccept = () => {
    onAccept()
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 80 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, exit: { duration: 0.2 } }}
      className="fixed bottom-4 right-4 z-50 w-80 rounded-md border-l-4 border-l-indigo-500 bg-white shadow-lg dark:bg-gray-800"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="flex cursor-pointer items-start gap-2 p-3"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-lg leading-none">&#128161;</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {suggestion.title}
          </p>
          {!expanded && (
            <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
              {suggestion.body}
            </p>
          )}
        </div>
        <button
          className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          onClick={(e) => {
            e.stopPropagation()
            onDismiss()
          }}
        >
          &#215;
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="px-3 pb-2 text-xs text-gray-600 dark:text-gray-300">
              {suggestion.body}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2 border-t border-gray-100 px-3 py-2 dark:border-gray-700">
        <button
          className="rounded bg-indigo-500 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-600"
          onClick={handleAccept}
        >
          Accept
        </button>
        <button
          className="rounded px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          onClick={onDismiss}
        >
          Later
        </button>
      </div>
    </motion.div>
  )
}
