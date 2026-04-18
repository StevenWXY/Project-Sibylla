import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FileAutocomplete } from '../../src/renderer/components/studio/FileAutocomplete'

describe('FileAutocomplete', () => {
  const mockOnSelect = vi.fn()
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should not render when not visible', () => {
    render(
      <FileAutocomplete
        query="test"
        onSelect={mockOnSelect}
        onClose={mockOnClose}
        visible={false}
      />
    )

    expect(screen.queryByText('Searching...')).not.toBeInTheDocument()
  })

  it('should show loading state', () => {
    render(
      <FileAutocomplete
        query="test"
        onSelect={mockOnSelect}
        onClose={mockOnClose}
        visible={true}
      />
    )

    expect(screen.getByText('Searching...')).toBeInTheDocument()
  })

  it('should display files after loading', async () => {
    render(
      <FileAutocomplete
        query="prd"
        onSelect={mockOnSelect}
        onClose={mockOnClose}
        visible={true}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('prd.md')).toBeInTheDocument()
    })
  })

  it('should call onSelect when file is clicked', async () => {
    render(
      <FileAutocomplete
        query="prd"
        onSelect={mockOnSelect}
        onClose={mockOnClose}
        visible={true}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('prd.md')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('prd.md'))
    expect(mockOnSelect).toHaveBeenCalledWith('docs/prd.md')
  })

  it('should show no results message when query matches nothing', async () => {
    vi.mocked(window.electronAPI.ai.contextFiles).mockResolvedValueOnce({
      success: true,
      data: [],
      timestamp: Date.now(),
    })

    render(
      <FileAutocomplete
        query="zzzzz"
        onSelect={mockOnSelect}
        onClose={mockOnClose}
        visible={true}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/No files matching/)).toBeInTheDocument()
    })
  })
})
