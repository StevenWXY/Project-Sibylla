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
  onAcceptWithEdits?: (edits: Record<string, string>) => void
}

const AUTO_DISMISS_MS = 15000
const HOVER_RESET_MS = 5000

const TASK_EDITABLE_FIELDS = [
  { key: 'title', label: '标题' },
  { key: 'assignee', label: '负责人' },
  { key: 'priority', label: '优先级' },
  { key: 'deadline', label: '截止日期' },
] as const

function extractTaskFields(args: Record<string, unknown>): Record<string, string> {
  const fields: Record<string, string> = {}
  if (typeof args.title === 'string') fields.title = args.title
  if (typeof args.assignee === 'string') fields.assignee = args.assignee
  if (typeof args.priority === 'string') fields.priority = args.priority
  if (typeof args.deadline === 'string') fields.deadline = args.deadline
  return fields
}

export function SuggestionToast({ suggestion, onDismiss, onAccept, onAcceptWithEdits }: SuggestionToastProps) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editFields, setEditFields] = useState<Record<string, string>>(() =>
    extractTaskFields(suggestion.acceptAction.args),
  )
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverRef = useRef(false)

  const isTaskSuggestion = suggestion.triggerId === 'task-decomposition'

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
    if (editing && onAcceptWithEdits) {
      onAcceptWithEdits(editFields)
    } else {
      onAccept()
    }
  }

  const handleEditChange = (key: string, value: string) => {
    setEditFields((prev) => ({ ...prev, [key]: value }))
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
          {!expanded && !editing && (
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
        {expanded && !editing && (
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

      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2 flex flex-col gap-1.5">
              {TASK_EDITABLE_FIELDS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 w-14 shrink-0">{label}</span>
                  {key === 'priority' ? (
                    <select
                      value={editFields[key] ?? ''}
                      onChange={(e) => handleEditChange(key, e.target.value)}
                      className="flex-1 text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 outline-none"
                    >
                      <option value="">-</option>
                      <option value="P0">P0</option>
                      <option value="P1">P1</option>
                      <option value="P2">P2</option>
                    </select>
                  ) : (
                    <input
                      type={key === 'deadline' ? 'date' : 'text'}
                      value={editFields[key] ?? ''}
                      onChange={(e) => handleEditChange(key, e.target.value)}
                      placeholder={label}
                      className="flex-1 text-xs border border-gray-200 rounded px-1.5 py-0.5 outline-none dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                    />
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2 border-t border-gray-100 px-3 py-2 dark:border-gray-700">
        <button
          className="rounded bg-indigo-500 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-600"
          onClick={handleAccept}
        >
          采纳
        </button>
        {isTaskSuggestion && !editing && (
          <button
            className="rounded px-3 py-1 text-xs text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
            onClick={() => {
              setEditing(true)
              setExpanded(false)
            }}
          >
            修改
          </button>
        )}
        {editing && (
          <button
            className="rounded px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            onClick={() => {
              setEditing(false)
              setExpanded(true)
            }}
          >
            取消编辑
          </button>
        )}
        <button
          className="rounded px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          onClick={onDismiss}
        >
          忽略
        </button>
      </div>
    </motion.div>
  )
}
