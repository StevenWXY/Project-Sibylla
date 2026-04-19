/**
 * GuardrailNotification — Toast notification for Guardrail interceptions
 *
 * Renders a stack of toast notifications in the top-right corner.
 * - block severity: Red left border, 10s auto-dismiss
 * - conditional severity: Yellow left border, manual close required
 *
 * Guard ID → display name mapping uses natural language (CLAUDE.md §3 "Git invisible").
 */

import React, { useEffect, useCallback, useRef } from 'react'
import { useHarnessStore, selectGuardrailNotifications } from '../../../store/harnessStore'
import { useShallow } from 'zustand/react/shallow'
import type { GuardrailNotificationData } from '../../../../shared/types'

/** Map guard rule IDs to human-readable Chinese names */
const GUARD_DISPLAY_NAMES: Record<string, string> = {
  'system-path': '系统路径保护',
  'secret-leak': '敏感信息检测',
  'personal-space': '个人空间保护',
  'bulk-operation': '批量操作确认',
}

/** Maximum visible notifications at once */
const MAX_VISIBLE = 3

/** Auto-dismiss timeout for block severity (ms) */
const BLOCK_DISMISS_MS = 10_000

const NotificationItem: React.FC<{
  notification: GuardrailNotificationData
  onDismiss: (id: string) => void
}> = ({ notification, onDismiss }) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (notification.severity === 'block') {
      timerRef.current = setTimeout(() => {
        onDismiss(notification.id)
      }, BLOCK_DISMISS_MS)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [notification.id, notification.severity, onDismiss])

  const borderColor = notification.severity === 'block' ? 'border-l-red-500' : 'border-l-amber-500'
  const displayName = GUARD_DISPLAY_NAMES[notification.ruleId] ?? notification.ruleName

  return (
    <div
      className={`
        relative w-80 rounded-md border border-sys-darkBorder border-l-4 ${borderColor}
        bg-[#0A0A0A] px-4 py-3 shadow-lg
      `}
      role="alert"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">{displayName}</p>
          <p className="mt-1 text-xs text-gray-400">{notification.reason}</p>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(notification.id)}
          className="ml-2 flex-shrink-0 text-gray-500 transition-colors hover:text-gray-300"
          aria-label="关闭"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export const GuardrailNotification: React.FC = () => {
  const notifications = useHarnessStore(useShallow(selectGuardrailNotifications))
  const dismissGuardrailNotification = useHarnessStore((s) => s.dismissGuardrailNotification)

  const handleDismiss = useCallback(
    (id: string) => {
      dismissGuardrailNotification(id)
    },
    [dismissGuardrailNotification],
  )

  const visible = notifications.slice(0, MAX_VISIBLE)

  if (visible.length === 0) return null

  return (
    <div className="fixed right-4 top-4 z-50 flex flex-col gap-2">
      {visible.map((n) => (
        <NotificationItem key={n.id} notification={n} onDismiss={handleDismiss} />
      ))}
      {notifications.length > MAX_VISIBLE && (
        <p className="text-center text-xs text-gray-500">
          还有 {notifications.length - MAX_VISIBLE} 条通知排队中
        </p>
      )}
    </div>
  )
}
