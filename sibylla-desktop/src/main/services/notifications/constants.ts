import type { NotificationPriority } from './types'

export const PRIORITY_ORDER: Record<NotificationPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
} as const

export const DEDUP_WINDOW_MS = 3_600_000

export const COLLAPSE_THRESHOLD = 5

export const ARCHIVE_THRESHOLD_DAYS = 7

export const DISMISS_TRIGGER_COUNT = 3

export const DISMISS_WINDOW_MS = 3_600_000

export const NOTIFICATION_DB_VERSION = 1

export const PRIORITY_COLORS: Record<NotificationPriority, string> = {
  urgent: '#ef4444',
  high: '#f59e0b',
  normal: '#6366f1',
  low: '#94a3b8',
} as const
