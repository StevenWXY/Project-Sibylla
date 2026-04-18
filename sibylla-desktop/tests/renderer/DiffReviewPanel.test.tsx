import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DiffReviewPanel } from '../../src/renderer/components/studio/DiffReviewPanel'
import type { ParsedFileDiff } from '../../src/renderer/components/studio/types'

function createMockProposal(filePath: string, additions = 1, deletions = 0): ParsedFileDiff {
  return {
    filePath,
    hunks: [
      {
        oldStart: 1,
        oldLines: 1,
        newStart: 1,
        newLines: 1,
        lines: [
          ...(additions > 0 ? [{ type: 'add' as const, content: `new line in ${filePath}` }] : []),
          ...(deletions > 0 ? [{ type: 'delete' as const, content: `old line in ${filePath}` }] : []),
        ],
      },
    ],
    fullNewContent: `new content for ${filePath}`,
    fullOldContent: `old content for ${filePath}`,
    stats: { additions, deletions },
  }
}

function createDefaultProps(overrides: Record<string, unknown> = {}) {
  const proposal = createMockProposal('test.md')
  return {
    proposals: [proposal] as readonly ParsedFileDiff[],
    activeIndex: 0,
    isApplying: false,
    isEditing: false,
    editingContent: '',
    appliedPaths: [] as readonly string[],
    failedPath: null as string | null,
    errorMessage: null as string | null,
    onApply: vi.fn(),
    onApplyAll: vi.fn(),
    onStartEditing: vi.fn(),
    onCancelEditing: vi.fn(),
    onEditingContentChange: vi.fn(),
    onApplyEdited: vi.fn(),
    onRollback: vi.fn(),
    onDismiss: vi.fn(),
    onClearError: vi.fn(),
    onSetActiveIndex: vi.fn(),
    ...overrides,
  }
}

describe('DiffReviewPanel', () => {
  it('renders file path and stats', () => {
    render(<DiffReviewPanel {...createDefaultProps()} />)

    expect(screen.getByText('test.md')).toBeInTheDocument()
    expect(screen.getByText('+1')).toBeInTheDocument()
    expect(screen.getByText('-0')).toBeInTheDocument()
  })

  it('renders apply and edit buttons', () => {
    render(<DiffReviewPanel {...createDefaultProps()} />)

    expect(screen.getByText('应用')).toBeInTheDocument()
    expect(screen.getByText('编辑应用')).toBeInTheDocument()
  })

  it('calls onApply when apply button clicked', () => {
    const onApply = vi.fn()
    render(<DiffReviewPanel {...createDefaultProps({ onApply })} />)

    fireEvent.click(screen.getByText('应用'))
    expect(onApply).toHaveBeenCalledWith('test.md')
  })

  it('calls onStartEditing when edit button clicked', () => {
    const onStartEditing = vi.fn()
    render(<DiffReviewPanel {...createDefaultProps({ onStartEditing })} />)

    fireEvent.click(screen.getByText('编辑应用'))
    expect(onStartEditing).toHaveBeenCalled()
  })

  it('calls onDismiss when close button clicked', () => {
    const onDismiss = vi.fn()
    render(<DiffReviewPanel {...createDefaultProps({ onDismiss })} />)

    const closeButtons = screen.getAllByRole('button')
    const dismissBtn = closeButtons.find((btn) => btn.textContent === '')
    if (dismissBtn) {
      fireEvent.click(dismissBtn)
      expect(onDismiss).toHaveBeenCalled()
    }
  })

  it('shows error message when write fails', () => {
    render(
      <DiffReviewPanel
        {...createDefaultProps({
          failedPath: 'test.md',
          errorMessage: '写入失败',
        })}
      />
    )

    expect(screen.getByText(/写入失败/)).toBeInTheDocument()
  })

  it('shows rollback button when some files applied and error occurs', () => {
    render(
      <DiffReviewPanel
        {...createDefaultProps({
          proposals: [createMockProposal('a.md'), createMockProposal('b.md')],
          failedPath: 'b.md',
          errorMessage: 'fail',
          appliedPaths: ['a.md'],
        })}
      />
    )

    expect(screen.getByText(/回滚已应用的修改/)).toBeInTheDocument()
  })

  it('shows editing mode with apply edited button', () => {
    render(
      <DiffReviewPanel
        {...createDefaultProps({
          isEditing: true,
          editingContent: 'edited content',
        })}
      />
    )

    expect(screen.getByText('应用编辑')).toBeInTheDocument()
    expect(screen.getByText('取消')).toBeInTheDocument()
  })

  it('calls onCancelEditing when cancel clicked in edit mode', () => {
    const onCancelEditing = vi.fn()
    render(
      <DiffReviewPanel
        {...createDefaultProps({
          isEditing: true,
          editingContent: 'content',
          onCancelEditing,
        })}
      />
    )

    fireEvent.click(screen.getByText('取消'))
    expect(onCancelEditing).toHaveBeenCalled()
  })

  it('shows multi-file apply all button for multiple proposals', () => {
    const onApplyAll = vi.fn()
    render(
      <DiffReviewPanel
        {...createDefaultProps({
          proposals: [createMockProposal('a.md'), createMockProposal('b.md')],
          onApplyAll,
        })}
      />
    )

    const applyAllBtn = screen.getByText(/全部应用/)
    expect(applyAllBtn).toBeInTheDocument()

    fireEvent.click(applyAllBtn)
    expect(onApplyAll).toHaveBeenCalled()
  })

  it('shows file tabs for multi-file proposals', () => {
    render(
      <DiffReviewPanel
        {...createDefaultProps({
          proposals: [createMockProposal('a.md'), createMockProposal('b.md')],
        })}
      />
    )

    expect(screen.getByText('AI 建议修改 2 个文件')).toBeInTheDocument()
  })

  it('disables apply button when isApplying', () => {
    render(<DiffReviewPanel {...createDefaultProps({ isApplying: true })} />)

    const applyBtn = screen.getByText('应用').closest('button')
    expect(applyBtn).toBeDisabled()
  })

  it('returns null when all proposals are applied', () => {
    const proposal = createMockProposal('test.md')
    const { container } = render(
      <DiffReviewPanel
        {...createDefaultProps({
          proposals: [proposal],
          appliedPaths: ['test.md'],
        })}
      />
    )

    expect(container.firstChild).toBeNull()
  })

  it('returns null when proposals is empty', () => {
    const { container } = render(
      <DiffReviewPanel
        {...createDefaultProps({
          proposals: [],
        })}
      />
    )

    expect(container.firstChild).toBeNull()
  })
})
