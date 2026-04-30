import { BellOff } from 'lucide-react'

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="mb-4 rounded-full bg-muted p-4">
        <BellOff className="h-8 w-8 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">No notifications</p>
      <p className="mt-1 text-xs text-muted-foreground">New updates will appear here</p>
    </div>
  )
}
