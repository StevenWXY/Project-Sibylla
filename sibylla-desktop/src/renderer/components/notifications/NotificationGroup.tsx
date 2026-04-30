import { useCallback, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, CheckCheck } from 'lucide-react'
import { useNotificationStore } from '../../store/notificationStore'
import type { Notification } from '../../store/notificationStore'
import { NotificationItem } from './NotificationItem'

export function NotificationGroup({
  groupKey,
  notifications,
  defaultCollapsed,
}: {
  groupKey: string
  notifications: Notification[]
  defaultCollapsed?: boolean
}) {
  const [expanded, setExpanded] = useState(!defaultCollapsed)
  const { markRead } = useNotificationStore()

  const unreadInGroup = useMemo(
    () => notifications.filter((n) => !n.readAt).length,
    [notifications],
  )

  const handleToggle = useCallback(() => {
    setExpanded((prev) => !prev)
  }, [])

  const handleMarkAllRead = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      for (const n of notifications) {
        if (!n.readAt) {
          await markRead(n.id)
        }
      }
    },
    [markRead, notifications],
  )

  const sourceName = useMemo(() => {
    const first = notifications[0]
    return first?.source?.provider ?? groupKey
  }, [notifications, groupKey])

  return (
    <div className="rounded-lg border border-border/50">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors hover:bg-accent/30"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm font-medium text-foreground">{sourceName}</span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {notifications.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {unreadInGroup > 0 && (
            <>
              <span className="text-[10px] text-primary">{unreadInGroup} unread</span>
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Mark all as read"
              >
                <CheckCheck className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </button>
      {expanded && (
        <div className="space-y-1 px-2 pb-2">
          {notifications.map((notification) => (
            <NotificationItem key={notification.id} notification={notification} />
          ))}
        </div>
      )}
    </div>
  )
}
