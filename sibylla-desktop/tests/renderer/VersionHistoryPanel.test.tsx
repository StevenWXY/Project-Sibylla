import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VersionHistoryPanel } from '../../src/renderer/components/version-history/VersionHistoryPanel'
import { useVersionHistoryStore } from '../../src/renderer/store/versionHistoryStore'

describe('VersionHistoryPanel', () => {
  beforeEach(() => {
    useVersionHistoryStore.getState().closePanel()
    vi.clearAllMocks()
  })

  it('does not render when closed', () => {
    const { container } = render(<VersionHistoryPanel />)
    expect(container.innerHTML).toBe('')
  })

  it('renders header with file name when open', () => {
    const mockHistory = vi.fn().mockResolvedValue({
      success: true,
      data: [],
    })
    window.electronAPI.git.history = mockHistory

    useVersionHistoryStore.getState().openPanel('docs/prd.md')

    render(<VersionHistoryPanel />)
    expect(screen.getByText('prd.md')).toBeInTheDocument()
  })

  it('shows close button', () => {
    const mockHistory = vi.fn().mockResolvedValue({
      success: true,
      data: [],
    })
    window.electronAPI.git.history = mockHistory

    useVersionHistoryStore.getState().openPanel('test.md')

    render(<VersionHistoryPanel />)
    expect(screen.getByRole('button', { name: '' })).toBeInTheDocument()
  })

  it('closes panel when close button clicked', () => {
    const mockHistory = vi.fn().mockResolvedValue({
      success: true,
      data: [],
    })
    window.electronAPI.git.history = mockHistory

    useVersionHistoryStore.getState().openPanel('test.md')

    render(<VersionHistoryPanel />)

    const closeButton = screen.getByRole('button')
    fireEvent.click(closeButton)

    expect(useVersionHistoryStore.getState().isOpen).toBe(false)
  })

  it('shows error message when error exists', async () => {
    const mockHistory = vi.fn().mockResolvedValue({
      success: false,
      error: { message: '加载失败' },
    })
    window.electronAPI.git.history = mockHistory

    useVersionHistoryStore.getState().openPanel('test.md')

    render(<VersionHistoryPanel />)

    await vi.waitFor(() => {
      expect(screen.getByText('加载失败')).toBeInTheDocument()
    })
  })

  it('shows empty state when no versions', async () => {
    const mockHistory = vi.fn().mockResolvedValue({
      success: true,
      data: [],
    })
    window.electronAPI.git.history = mockHistory

    useVersionHistoryStore.getState().openPanel('test.md')

    render(<VersionHistoryPanel />)

    await vi.waitFor(() => {
      expect(screen.getByText('暂无版本记录')).toBeInTheDocument()
    })
  })
})
