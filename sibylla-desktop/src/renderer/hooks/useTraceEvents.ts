import { useEffect } from 'react'
import { useTraceStore } from '../store/traceStore'
import { useProgressStore } from '../store/progressStore'

export function useTraceKeyboardShortcut(): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 't') {
        e.preventDefault()
        const selectedTraceId = useTraceStore.getState().selectedTraceId
        window.electronAPI.inspector.open(selectedTraceId ?? undefined)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}

export function useTraceEvents(): void {
  useEffect(() => {
    const traceApi = window.electronAPI?.trace
    if (!traceApi) return

    const unsubs: Array<() => void> = []

    if (traceApi.onTraceUpdate) {
      unsubs.push(
        traceApi.onTraceUpdate((traceId: string) => {
          const selectedId = useTraceStore.getState().selectedTraceId
          if (selectedId === traceId) {
            useTraceStore.getState().fetchTraceTree(traceId)
          }
        }),
      )
    }

    return () => {
      unsubs.forEach(fn => fn())
    }
  }, [])
}

export function useProgressEvents(): void {
  const updateTaskInSnapshot = useProgressStore(s => s.updateTaskInSnapshot)

  useEffect(() => {
    const progressApi = window.electronAPI?.progress
    if (!progressApi) return

    const unsubs: Array<() => void> = []

    if (progressApi.onTaskEvent) {
      unsubs.push(progressApi.onTaskEvent(() => {
        useProgressStore.getState().fetchSnapshot()
      }))
    }

    return () => {
      unsubs.forEach(fn => fn())
    }
  }, [updateTaskInSnapshot])
}
