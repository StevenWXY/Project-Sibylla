import type { SibyllaEvent, SibyllaEventType } from '../event-bus-types'

export type NotificationType =
  | 'mcp.mention'
  | 'mcp.assigned'
  | 'mcp.urgent'
  | 'collab.conflict'
  | 'collab.peer-active'
  | 'memory.insight'
  | 'performance.alert'
  | 'system.indexed'
  | 'system.suggestion'
  | 'kanban.status-suggestion'
  | 'kanban.task-risk'

export type NotificationPriority = 'urgent' | 'high' | 'normal' | 'low'

export type NotificationNavigation =
  | { kind: 'file'; path: string; line?: number }
  | { kind: 'memory'; entryId: string }
  | { kind: 'mcp'; provider: string; recordId: string }
  | { kind: 'trace'; traceId: string }
  | { kind: 'external'; url: string }

export interface NotificationAction {
  label: string
  action: string
  payload?: unknown
}

export interface NotificationSource {
  provider: string
  ref?: string
}

export interface Notification {
  id: string
  type: NotificationType
  priority: NotificationPriority
  source: NotificationSource
  title: string
  body: string
  groupKey: string
  navigation?: NotificationNavigation
  actions?: NotificationAction[]
  createdAt: number
  readAt?: number
  dismissedAt?: number
  archivedAt?: number
  stale: boolean
  metadata: Record<string, unknown>
}

export type NotificationDraft = Omit<Notification, 'id' | 'createdAt' | 'stale'> & {
  stale?: boolean
}

export interface NotificationRule {
  id: string
  eventType: SibyllaEventType
  description: string
  enabled: boolean
  condition?: (event: SibyllaEvent) => boolean
  build: (event: SibyllaEvent) => NotificationDraft | null
}

export interface MutedRule {
  type: string
  sourceProvider?: string
  mutedAt: number
}

export interface ScheduledFocusConfig {
  enabled: boolean
  startHour: number
  endHour: number
}

export interface NotificationPreferences {
  schemaVersion: 1
  mutedRules: MutedRule[]
  scheduledFocus?: ScheduledFocusConfig
}

export interface FocusState {
  focused: boolean
  focusUntil?: string
  queueLength: number
}

export interface NotificationDismissStats {
  total: number
  dismissed: number
}
