import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SyncDetailPanel } from '../../src/renderer/components/statusbar/SyncDetailPanel'
import { useSyncStatusStore } from '../../src/renderer/store/syncStatusStore'
import type { SyncStatusData } from '../../src/shared/types'

function setStatus(data: SyncStatusData): void {
  useSyncStatusStore.getState().setState(data)
}

describe('SyncDetailPanel', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    useSyncStatusStore.getState().reset()
    mockOnClose.mockClear()
    vi.mocked(window.electronAPI.sync.force).mockResolvedValue({ success: true, data: { success: true, hasConflicts: false, conflicts: [] }, error: null })
  })

  it('displays current status label', () => {
    setStatus({ status: 'synced', timestamp: Date.now() })
    render(<SyncDetailPanel onClose={mockOnClose} />)
    expect(screen.getByText('已同步')).toBeInTheDocument()
  })

  it('displays last sync time', () => {
    const ts = new Date(2026, 3, 17, 10, 23, 45).getTime()
    setStatus({ status: 'synced', timestamp: ts })
    render(<SyncDetailPanel onClose={mockOnClose} />)
    expect(screen.getByText(/2026/)).toBeInTheDocument()
  })

  it('displays 从未 when lastSyncedAt is null', () => {
    setStatus({ status: 'idle', timestamp: Date.now() })
    render(<SyncDetailPanel onClose={mockOnClose} />)
    expect(screen.getByText('从未')).toBeInTheDocument()
  })

  it('displays error message when status is error', () => {
    setStatus({ status: 'error', timestamp: Date.now(), message: 'Network timeout' })
    render(<SyncDetailPanel onClose={mockOnClose} />)
    expect(screen.getByText('Network timeout')).toBeInTheDocument()
  })

  it('does not display error message when status is not error', () => {
    setStatus({ status: 'synced', timestamp: Date.now() })
    render(<SyncDetailPanel onClose={mockOnClose} />)
    expect(screen.queryByText('Network timeout')).not.toBeInTheDocument()
  })

  it('displays conflict files when status is conflict', () => {
    setStatus({
      status: 'conflict',
      timestamp: Date.now(),
      conflictFiles: ['/docs/readme.md', '/specs/api.md'],
    })
    render(<SyncDetailPanel onClose={mockOnClose} />)
    expect(screen.getByText('/docs/readme.md')).toBeInTheDocument()
    expect(screen.getByText('/specs/api.md')).toBeInTheDocument()
  })

  it('does not display conflict section when no conflict files', () => {
    setStatus({ status: 'synced', timestamp: Date.now() })
    render(<SyncDetailPanel onClose={mockOnClose} />)
    expect(screen.queryByText('冲突文件：')).not.toBeInTheDocument()
  })

  it('calls sync.force on 立即同步 button click', async () => {
    setStatus({ status: 'synced', timestamp: Date.now() })
    render(<SyncDetailPanel onClose={mockOnClose} />)
    const button = screen.getByText('立即同步')
    fireEvent.click(button)
    expect(window.electronAPI.sync.force).toHaveBeenCalledOnce()
  })

  it('shows 重试 button when status is error', () => {
    setStatus({ status: 'error', timestamp: Date.now(), message: 'fail' })
    render(<SyncDetailPanel onClose={mockOnClose} />)
    expect(screen.getByText('重试')).toBeInTheDocument()
  })

  it('does not show 重试 button when status is not error', () => {
    setStatus({ status: 'synced', timestamp: Date.now() })
    render(<SyncDetailPanel onClose={mockOnClose} />)
    expect(screen.queryByText('重试')).not.toBeInTheDocument()
  })

  it('calls onClose when X button is clicked', () => {
    setStatus({ status: 'synced', timestamp: Date.now() })
    render(<SyncDetailPanel onClose={mockOnClose} />)
    const closeButton = screen.getByRole('button', { name: '' })
    fireEvent.click(closeButton)
    expect(mockOnClose).toHaveBeenCalledOnce()
  })
})
