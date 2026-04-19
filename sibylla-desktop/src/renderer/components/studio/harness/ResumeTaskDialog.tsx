/**
 * ResumeTaskDialog — Crash recovery dialog
 *
 * Shows a centered modal (max-width 560px) when resumeable tasks are detected on startup.
 * Each task card shows: goal, progress (N/M steps), relative time, Continue/Abandon buttons.
 *
 * Uses natural language per CLAUDE.md §3 "Git invisible".
 */

import React, { useCallback } from 'react'
import { useHarnessStore, selectResumeableTasks, selectShowResumeDialog } from '../../../store/harnessStore'
import { useShallow } from 'zustand/react/shallow'
import type { TaskStateSummary } from '../../../../shared/types'

/** Format a timestamp as relative time (e.g., "10 分钟前") */
function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return '刚刚'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  return `${days} 天前`
}

const TaskCard: React.FC<{
  task: TaskStateSummary
  onResume: (taskId: string) => void
  onAbandon: (taskId: string) => void
}> = ({ task, onResume, onAbandon }) => {
  return (
    <div className="rounded-lg border border-sys-darkBorder bg-[#111111] p-4">
      <div className="mb-2">
        <p className="text-sm font-medium text-white line-clamp-2">{task.goal}</p>
      </div>
      <div className="mb-3 flex items-center gap-3 text-xs text-gray-400">
        <span>
          进度：{task.completedSteps}/{task.totalSteps} 步骤
        </span>
        <span>·</span>
        <span>{formatRelativeTime(task.updatedAt)}</span>
      </div>
      {/* Progress bar */}
      <div className="mb-3 h-1.5 w-full rounded-full bg-gray-800">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all"
          style={{
            width: `${task.totalSteps > 0 ? (task.completedSteps / task.totalSteps) * 100 : 0}%`,
          }}
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onAbandon(task.taskId)}
          className="rounded-md border border-sys-darkBorder bg-transparent px-3 py-1.5 text-xs text-gray-400 transition-colors hover:text-white"
        >
          放弃
        </button>
        <button
          type="button"
          onClick={() => onResume(task.taskId)}
          className="rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-600"
        >
          继续执行
        </button>
      </div>
    </div>
  )
}

export const ResumeTaskDialog: React.FC = () => {
  const tasks = useHarnessStore(useShallow(selectResumeableTasks))
  const showDialog = useHarnessStore(selectShowResumeDialog)
  const setResumeableTasks = useHarnessStore((s) => s.setResumeableTasks)

  const toggleResumeDialog = useHarnessStore((s) => s.toggleResumeDialog)

  const handleDismissAll = useCallback(() => {
    toggleResumeDialog()
  }, [toggleResumeDialog])

  const handleResume = useCallback(
    async (taskId: string) => {
      try {
        await window.electronAPI?.harness?.resumeTask(taskId)
      } catch {
        // Resume IPC error — non-fatal
      }
      // Remove task from list
      const remaining = tasks.filter((t) => t.taskId !== taskId)
      setResumeableTasks(remaining)
    },
    [tasks, setResumeableTasks],
  )

  const handleAbandon = useCallback(
    async (taskId: string) => {
      try {
        await window.electronAPI?.harness?.abandonTask(taskId)
      } catch {
        // Abandon IPC error — non-fatal
      }
      // Remove task from list
      const remaining = tasks.filter((t) => t.taskId !== taskId)
      setResumeableTasks(remaining)
    },
    [tasks, setResumeableTasks],
  )

  if (!showDialog || tasks.length === 0) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleDismissAll}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-[560px] rounded-xl border border-sys-darkBorder bg-[#0A0A0A] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">未完成的任务</h2>
          <button
            type="button"
            onClick={handleDismissAll}
            className="text-gray-500 transition-colors hover:text-gray-300"
            aria-label="稍后处理"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="mb-4 text-sm text-gray-400">
          检测到以下任务在上次会话中未完成，你可以选择继续执行或放弃。
        </p>
        <div className="max-h-[400px] space-y-3 overflow-y-auto">
          {tasks.map((task) => (
            <TaskCard
              key={task.taskId}
              task={task}
              onResume={handleResume}
              onAbandon={handleAbandon}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
