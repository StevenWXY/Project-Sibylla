import { useEffect } from 'react'
import { useSyncStatusStore } from '../store/syncStatusStore'

export function useSyncStatus(): void {
  const setState = useSyncStatusStore((s) => s.setState)
  const reset = useSyncStatusStore((s) => s.reset)

  useEffect(() => {
    const syncApi = window.electronAPI?.sync
    if (!syncApi?.onStatusChange) return

    const unlisten = syncApi.onStatusChange((data) => {
      setState(data)
    })

    return () => {
      unlisten()
      reset()
    }
  }, [setState, reset])
}
