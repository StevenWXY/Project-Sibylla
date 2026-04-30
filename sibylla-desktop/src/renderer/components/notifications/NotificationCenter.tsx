import { useCallback, useEffect, useMemo } from 'react'
import { X, Settings, CheckCheck } from 'lucide-react'
import { cn } from '../../utils/cn'
import { useNotificationStore } from '../../store/notificationStore'
import { NotificationItem } from './NotificationItem'
import { NotificationGroup } from './NotificationGroup'
import { EmptyState } from './EmptyState'

export function NotificationCenter({
  isOpen,
  onClose,
  onOpenPreferences,
}: {
  isOpen: boolean
  onClose: () => void
  onOpenPreferences?: () => void
}) {
  const { notifications, unreadCount, fetchNotifications, markRead } =
    useNotificationStore()

  useEffect(() => {
    if (isOpen) {
      fetchNotifications()
    }
  }, [isOpen, fetchNotifications])

  const grouped = useMemo(() => {
    const map = new Map<string, typeof notifications>()
    for (const n of notifications) {
      if (n.dismissedAt) continue
      const existing = map.get(n.groupKey) ?? []
      existing.push(n)
      map.set(n.groupKey, existing)
    }
    return map
  }, [notifications])

  const activeNotifications = useMemo(
    () => notifications.filter((n) => !n.dismissedAt),
    [notifications],
  )

  const handleMarkAllRead = useCallback(async () => {
    for (const n of activeNotifications) {
      if (!n.readAt) {
        await markRead(n.id)
      }
    }
  }, [markRead, activeNotifications])

  const GROUP_COLLAPSE_THRESHOLD = 5

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={onClose}
        />
      )}
      <div
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-background shadow-xl transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Mark all as read"
              >
                <CheckCheck className="h-4 w-4" />
              </button>
            )}
            {onOpenPreferences && (
              <button
                type="button"
                onClick={onOpenPreferences}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Notification preferences"
              >
                <Settings className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close notifications"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {activeNotifications.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-2">
              {Array.from(grouped.entries()).map(([groupKey, items]) => {
                if (items.length >= GROUP_COLLAPSE_THRESHOLD) {
                  return (
                    <NotificationGroup
                      key={groupKey}
                      groupKey={groupKey}
                      notifications={items}
                      defaultCollapsed
                    />
                  )
                }
                return (
                  <div key={groupKey} className="space-y-1">
                    {items.map((notification) => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                      />
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
