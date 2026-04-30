import { useCallback, useMemo } from 'react'
import { X, ExternalLink } from 'lucide-react'
import { cn } from '../../utils/cn'
import { useNotificationStore } from '../../store/notificationStore'
import type { Notification } from '../../store/notificationStore'

const PRIORITY_BORDER: Record<string, string> = {
  urgent: 'border-l-[3px] border-l-red-500',
  high: 'border-l-[3px] border-l-amber-500',
  normal: 'border-l-[3px] border-l-indigo-500',
  low: 'border-l-[3px] border-l-slate-400',
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function NotificationItem({ notification }: { notification: Notification }) {
  const { dismiss, navigate } = useNotificationStore()

  const handleClick = useCallback(() => {
    navigate(notification.id)
  }, [navigate, notification.id])

  const handleDismiss = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      dismiss(notification.id)
    },
    [dismiss, notification.id],
  )

  const priorityClass = useMemo(
    () => PRIORITY_BORDER[notification.priority] ?? PRIORITY_BORDER.normal,
    [notification.priority],
  )

  const isUnread = !notification.readAt

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleClick()
      }}
      className={cn(
        'group relative flex cursor-pointer items-start gap-3 rounded-lg border border-transparent px-4 py-3 transition-colors hover:bg-accent/50',
        priorityClass,
        isUnread && 'bg-blue-50/50 dark:bg-blue-950/20',
        notification.stale && 'opacity-50',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {notification.title}
          </p>
          {notification.stale && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Expired
            </span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {notification.body}
        </p>
        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground/70">
          <span>{formatRelativeTime(notification.createdAt)}</span>
          {notification.navigation && (
            <ExternalLink className="h-3 w-3" />
          )}
        </div>
        {notification.actions && notification.actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {notification.actions.map((action) => (
              <button
                key={action.action}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                }}
                className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 rounded-md p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
