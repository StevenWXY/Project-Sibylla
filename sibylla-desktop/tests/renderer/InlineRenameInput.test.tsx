import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InlineRenameInput } from '../../src/renderer/components/layout/InlineRenameInput'

describe('InlineRenameInput', () => {
  it('renders with initial value', () => {
    render(
      <InlineRenameInput initialValue="readme.md" onSubmit={vi.fn()} onCancel={vi.fn()} />
    )
    const input = screen.getByRole('textbox')
    expect(input).toBeInTheDocument()
    expect(input).toHaveValue('readme.md')
  })

  it('auto-focuses the input on mount', async () => {
    render(
      <InlineRenameInput initialValue="readme.md" onSubmit={vi.fn()} onCancel={vi.fn()} />
    )
    const input = screen.getByRole('textbox')
    await waitFor(() => {
      expect(input).toHaveFocus()
    })
  })

  it('selects filename without extension on mount', async () => {
    render(
      <InlineRenameInput initialValue="readme.md" onSubmit={vi.fn()} onCancel={vi.fn()} />
    )
    const input = screen.getByRole('textbox')
    await waitFor(() => {
      expect(input.selectionStart).toBe(0)
      expect(input.selectionEnd).toBe(6)
    })
  })

  it('selects full name when no extension exists', async () => {
    render(
      <InlineRenameInput initialValue="README" onSubmit={vi.fn()} onCancel={vi.fn()} />
    )
    const input = screen.getByRole('textbox')
    await waitFor(() => {
      expect(input.selectionStart).toBe(0)
      expect(input.selectionEnd).toBe(6)
    })
  })

  it('selects full name when extension is at position 0', async () => {
    render(
      <InlineRenameInput initialValue=".gitignore" onSubmit={vi.fn()} onCancel={vi.fn()} />
    )
    const input = screen.getByRole('textbox')
    await waitFor(() => {
      expect(input.selectionStart).toBe(0)
      expect(input.selectionEnd).toBe('.gitignore'.length)
    })
  })

  it('calls onSubmit with current value when Enter is pressed', async () => {
    const onSubmit = vi.fn()
    render(
      <InlineRenameInput initialValue="readme.md" onSubmit={onSubmit} onCancel={vi.fn()} />
    )
    const input = screen.getByRole('textbox')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('readme.md')
  })

  it('calls onCancel when Escape is pressed', () => {
    const onCancel = vi.fn()
    render(
      <InlineRenameInput initialValue="readme.md" onSubmit={vi.fn()} onCancel={onCancel} />
    )
    const input = screen.getByRole('textbox')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onSubmit with updated value after typing', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <InlineRenameInput initialValue="old.md" onSubmit={onSubmit} onCancel={vi.fn()} />
    )
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, 'new-name.md')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('new-name.md')
  })

  it('calls onSubmit on blur', () => {
    const onSubmit = vi.fn()
    render(
      <InlineRenameInput initialValue="readme.md" onSubmit={onSubmit} onCancel={vi.fn()} />
    )
    const input = screen.getByRole('textbox')
    fireEvent.blur(input)
    expect(onSubmit).toHaveBeenCalledWith('readme.md')
  })

  it('applies custom className', () => {
    render(
      <InlineRenameInput
        initialValue="readme.md"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        className="custom-class"
      />
    )
    const input = screen.getByRole('textbox')
    expect(input).toHaveClass('custom-class')
  })

  it('updates value on input change', async () => {
    const user = userEvent.setup()
    render(
      <InlineRenameInput initialValue="old.md" onSubmit={vi.fn()} onCancel={vi.fn()} />
    )
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, 'renamed.md')
    expect(input).toHaveValue('renamed.md')
  })

  it('handles Chinese characters in filename', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <InlineRenameInput initialValue="文档.md" onSubmit={onSubmit} onCancel={vi.fn()} />
    )
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, '需求文档.md')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledWith('需求文档.md')
  })
})
