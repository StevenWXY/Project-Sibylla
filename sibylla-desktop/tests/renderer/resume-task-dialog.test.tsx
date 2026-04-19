/**
 * ResumeTaskDialog component tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ResumeTaskDialog } from '../../src/renderer/components/studio/harness/ResumeTaskDialog'
import { useHarnessStore } from '../../src/renderer/store/harnessStore'
import type { TaskStateSummary } from '../../src/shared/types'

const mockTasks: TaskStateSummary[] = [
  {
    taskId: 'task-1',
    goal: 'Build authentication module',
    status: 'executing',
    completedSteps: 2,
    totalSteps: 5,
    updatedAt: Date.now() - 10 * 60 * 1000, // 10 minutes ago
  },
  {
    taskId: 'task-2',
    goal: 'Fix database migration',
    status: 'awaiting_confirmation',
    completedSteps: 1,
    totalSteps: 3,
    updatedAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
  },
]

describe('ResumeTaskDialog', () => {
  beforeEach(() => {
    useHarnessStore.getState().reset()
  })

  it('does not render when resumeableTasks is empty', () => {
    const { container } = render(<ResumeTaskDialog />)
    expect(container.firstChild).toBeNull()
  })

  it('renders task list when tasks exist', () => {
    useHarnessStore.getState().setResumeableTasks(mockTasks)
    render(<ResumeTaskDialog />)

    expect(screen.getByText('未完成的任务')).toBeInTheDocument()
    expect(screen.getByText('Build authentication module')).toBeInTheDocument()
    expect(screen.getByText('Fix database migration')).toBeInTheDocument()
  })

  it('triggers resume IPC on Continue button click', async () => {
    useHarnessStore.getState().setResumeableTasks(mockTasks)
    render(<ResumeTaskDialog />)

    const continueButtons = screen.getAllByText('继续执行')
    fireEvent.click(continueButtons[0]!)

    // After clicking, task should be removed from list
    await waitFor(() => {
      const state = useHarnessStore.getState()
      expect(state.resumeableTasks).toHaveLength(1)
      expect(state.resumeableTasks[0]?.taskId).toBe('task-2')
    })
  })

  it('triggers abandon IPC on Abandon button click', async () => {
    useHarnessStore.getState().setResumeableTasks(mockTasks)
    render(<ResumeTaskDialog />)

    const abandonButtons = screen.getAllByText('放弃')
    fireEvent.click(abandonButtons[0]!)

    await waitFor(() => {
      const state = useHarnessStore.getState()
      expect(state.resumeableTasks).toHaveLength(1)
    })
  })

  it('auto-closes when all tasks are processed', async () => {
    useHarnessStore.getState().setResumeableTasks([mockTasks[0]!])
    render(<ResumeTaskDialog />)

    const abandonButton = screen.getByText('放弃')
    fireEvent.click(abandonButton)

    await waitFor(() => {
      const state = useHarnessStore.getState()
      expect(state.resumeableTasks).toHaveLength(0)
      expect(state.showResumeDialog).toBe(false)
    })
  })
})
