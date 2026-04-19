/**
 * useHarnessEvents — Hook to subscribe to Harness IPC events
 *
 * Subscribes to main process push events:
 * - harness:resumeableTaskDetected → sets resumeable tasks in store
 * - harness:guardrailBlocked → adds guardrail notification to store
 * - harness:degradationOccurred → pushes degradation warning to store
 *
 * Call this hook once at the App root level.
 */

import { useEffect } from 'react'
import { useHarnessStore } from '../store/harnessStore'
import type { TaskStateSummary, GuardrailNotificationData, DegradationWarning } from '../../shared/types'

export function useHarnessEvents(): void {
  const setResumeableTasks = useHarnessStore((s) => s.setResumeableTasks)
  const addGuardrailNotification = useHarnessStore((s) => s.addGuardrailNotification)
  const pushWarning = useHarnessStore((s) => s.pushWarning)

  useEffect(() => {
    const harnessApi = window.electronAPI?.harness
    if (!harnessApi) return

    const unsubs: Array<() => void> = []

    if (harnessApi.onResumeableTaskDetected) {
      unsubs.push(
        harnessApi.onResumeableTaskDetected((tasks: TaskStateSummary[]) => {
          setResumeableTasks(tasks)
        }),
      )
    }

    if (harnessApi.onGuardrailBlocked) {
      unsubs.push(
        harnessApi.onGuardrailBlocked((data: GuardrailNotificationData) => {
          addGuardrailNotification(data)
        }),
      )
    }

    if (harnessApi.onDegradationOccurred) {
      unsubs.push(
        harnessApi.onDegradationOccurred((warning: DegradationWarning) => {
          pushWarning(warning)
        }),
      )
    }

    return () => {
      unsubs.forEach((fn) => fn())
    }
  }, [setResumeableTasks, addGuardrailNotification, pushWarning])
}
