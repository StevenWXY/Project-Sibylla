import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SkillAutocomplete } from '../../src/renderer/components/studio/SkillAutocomplete'

describe('SkillAutocomplete', () => {
  const mockOnSelect = vi.fn()
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should not render when not visible', () => {
    render(
      <SkillAutocomplete
        query="writing"
        onSelect={mockOnSelect}
        onClose={mockOnClose}
        visible={false}
      />
    )

    expect(screen.queryByText('Searching skills...')).not.toBeInTheDocument()
  })

  it('should show loading state', () => {
    render(
      <SkillAutocomplete
        query="writing"
        onSelect={mockOnSelect}
        onClose={mockOnClose}
        visible={true}
      />
    )

    expect(screen.getByText('Searching skills...')).toBeInTheDocument()
  })

  it('should display skills after loading', async () => {
    render(
      <SkillAutocomplete
        query="writing"
        onSelect={mockOnSelect}
        onClose={mockOnClose}
        visible={true}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('撰写 PRD')).toBeInTheDocument()
    })
  })

  it('should call onSelect with skillId and skillName when clicked', async () => {
    render(
      <SkillAutocomplete
        query="writing"
        onSelect={mockOnSelect}
        onClose={mockOnClose}
        visible={true}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('撰写 PRD')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('撰写 PRD'))
    expect(mockOnSelect).toHaveBeenCalledWith('writing-prd', '撰写 PRD')
  })

  it('should show no results message when query matches nothing', async () => {
    vi.mocked(window.electronAPI.ai.skillSearch).mockResolvedValueOnce({
      success: true,
      data: [],
      timestamp: Date.now(),
    })
    vi.mocked(window.electronAPI.ai.skillList).mockResolvedValueOnce({
      success: true,
      data: [],
      timestamp: Date.now(),
    })

    render(
      <SkillAutocomplete
        query="zzzzz"
        onSelect={mockOnSelect}
        onClose={mockOnClose}
        visible={true}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/No skills matching/)).toBeInTheDocument()
    })
  })

  it('should navigate with keyboard ArrowDown', async () => {
    render(
      <SkillAutocomplete
        query="writing"
        onSelect={mockOnSelect}
        onClose={mockOnClose}
        visible={true}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('撰写 PRD')).toBeInTheDocument()
    })

    fireEvent.keyDown(document, { key: 'ArrowDown' })
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(mockOnSelect).toHaveBeenCalled()
  })

  it('should close on Escape key', async () => {
    render(
      <SkillAutocomplete
        query="writing"
        onSelect={mockOnSelect}
        onClose={mockOnClose}
        visible={true}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('撰写 PRD')).toBeInTheDocument()
    })

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('should show skill ID in the item', async () => {
    render(
      <SkillAutocomplete
        query="writing"
        onSelect={mockOnSelect}
        onClose={mockOnClose}
        visible={true}
      />
    )

    await waitFor(() => {
      expect(screen.getByText('#writing-prd')).toBeInTheDocument()
    })
  })

  it('should display skill description', async () => {
    render(
      <SkillAutocomplete
        query="writing"
        onSelect={mockOnSelect}
        onClose={mockOnClose}
        visible={true}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/按照产品需求文档标准模板/)).toBeInTheDocument()
    })
  })
})
