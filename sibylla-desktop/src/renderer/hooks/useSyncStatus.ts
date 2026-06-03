import { useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import { useSyncStatusStore } from '../store/syncStatusStore'

export function useSyncStatus(): void {
  const currentWorkspace = useAppStore((s) => s.currentWorkspace)
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

  useEffect(() => {
    if (!currentWorkspace) {
      reset()
      return
    }

    const syncApi = window.electronAPI?.sync
    if (!syncApi?.getState) return

    let cancelled = false

    void syncApi.getState().then((response) => {
      if (cancelled) return
      if (response.success && response.data) {
        setState(response.data)
      }
    })

    return () => {
      cancelled = true
    }
  }, [currentWorkspace, setState, reset])
}
