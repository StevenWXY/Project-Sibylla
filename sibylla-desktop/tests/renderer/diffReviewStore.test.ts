import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  useDiffReviewStore,
  selectProposals,
  selectIsApplying,
  selectAppliedPaths,
  selectFailedPath,
  selectErrorMessage,
} from '../../src/renderer/store/diffReviewStore'
import type { ParsedFileDiff } from '../../src/renderer/components/studio/types'

function createMockProposal(filePath: string): ParsedFileDiff {
  return {
    filePath,
    hunks: [],
    fullNewContent: `new content for ${filePath}`,
    fullOldContent: `old content for ${filePath}`,
    stats: { additions: 1, deletions: 0 },
  }
}

describe('diffReviewStore', () => {
  beforeEach(() => {
    useDiffReviewStore.getState().dismiss()
  })

  describe('initial state', () => {
    it('has empty proposals and no active state', () => {
      const state = useDiffReviewStore.getState()
      expect(state.proposals).toEqual([])
      expect(state.activeIndex).toBe(0)
      expect(state.isApplying).toBe(false)
      expect(state.isEditing).toBe(false)
      expect(state.appliedPaths).toEqual([])
      expect(state.failedPath).toBeNull()
      expect(state.errorMessage).toBeNull()
    })
  })

  describe('setProposals', () => {
    it('sets proposals and resets state', () => {
      const proposals = [createMockProposal('file1.md')]
      useDiffReviewStore.getState().setProposals(proposals)

      const state = useDiffReviewStore.getState()
      expect(state.proposals).toEqual(proposals)
      expect(state.activeIndex).toBe(0)
    })

    it('resets appliedPaths and errors when setting new proposals', () => {
      useDiffReviewStore.setState({
        appliedPaths: ['old.md'],
        failedPath: 'old.md',
        errorMessage: 'some error',
      })

      useDiffReviewStore.getState().setProposals([createMockProposal('new.md')])

      const state = useDiffReviewStore.getState()
      expect(state.appliedPaths).toEqual([])
      expect(state.failedPath).toBeNull()
      expect(state.errorMessage).toBeNull()
    })
  })

  describe('setActiveIndex', () => {
    it('changes active index and exits editing mode', () => {
      useDiffReviewStore.getState().setProposals([
        createMockProposal('a.md'),
        createMockProposal('b.md'),
      ])
      useDiffReviewStore.setState({ isEditing: true })

      useDiffReviewStore.getState().setActiveIndex(1)

      const state = useDiffReviewStore.getState()
      expect(state.activeIndex).toBe(1)
      expect(state.isEditing).toBe(false)
    })
  })

  describe('applyProposal', () => {
    it('writes file and marks as applied', async () => {
      const mockWrite = vi.fn().mockResolvedValue({
        success: true,
      })
      window.electronAPI = { file: { write: mockWrite } } as unknown as typeof window.electronAPI

      const proposal = createMockProposal('test.md')
      useDiffReviewStore.getState().setProposals([proposal])

      await useDiffReviewStore.getState().applyProposal('test.md')

      expect(mockWrite).toHaveBeenCalledWith(
        'test.md',
        proposal.fullNewContent,
        { atomic: true, createDirs: true }
      )

      const state = useDiffReviewStore.getState()
      expect(state.appliedPaths).toContain('test.md')
      expect(state.isApplying).toBe(false)
    })

    it('handles write failure', async () => {
      const mockWrite = vi.fn().mockResolvedValue({
        success: false,
        error: { message: 'disk full' },
      })
      window.electronAPI = { file: { write: mockWrite } } as unknown as typeof window.electronAPI

      const proposal = createMockProposal('fail.md')
      useDiffReviewStore.getState().setProposals([proposal])

      await useDiffReviewStore.getState().applyProposal('fail.md')

      const state = useDiffReviewStore.getState()
      expect(state.appliedPaths).toEqual([])
      expect(state.failedPath).toBe('fail.md')
      expect(state.errorMessage).toBe('disk full')
      expect(state.isApplying).toBe(false)
    })

    it('handles write exception', async () => {
      const mockWrite = vi.fn().mockRejectedValue(new Error('IPC error'))
      window.electronAPI = { file: { write: mockWrite } } as unknown as typeof window.electronAPI

      useDiffReviewStore.getState().setProposals([createMockProposal('err.md')])

      await useDiffReviewStore.getState().applyProposal('err.md')

      const state = useDiffReviewStore.getState()
      expect(state.failedPath).toBe('err.md')
      expect(state.errorMessage).toBe('IPC error')
    })
  })

  describe('applyAll', () => {
    it('applies all proposals sequentially', async () => {
      const mockWrite = vi.fn().mockResolvedValue({ success: true })
      window.electronAPI = { file: { write: mockWrite } } as unknown as typeof window.electronAPI

      const proposals = [createMockProposal('a.md'), createMockProposal('b.md')]
      useDiffReviewStore.getState().setProposals(proposals)

      await useDiffReviewStore.getState().applyAll()

      expect(mockWrite).toHaveBeenCalledTimes(2)
      const state = useDiffReviewStore.getState()
      expect(state.appliedPaths).toEqual(['a.md', 'b.md'])
    })

    it('stops on first failure and tracks partial progress', async () => {
      const mockWrite = vi
        .fn()
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: { message: 'fail on b' } })
      window.electronAPI = { file: { write: mockWrite } } as unknown as typeof window.electronAPI

      useDiffReviewStore.getState().setProposals([
        createMockProposal('a.md'),
        createMockProposal('b.md'),
        createMockProposal('c.md'),
      ])

      await useDiffReviewStore.getState().applyAll()

      const state = useDiffReviewStore.getState()
      expect(state.appliedPaths).toEqual(['a.md'])
      expect(state.failedPath).toBe('b.md')
      expect(state.errorMessage).toBe('fail on b')
      expect(mockWrite).toHaveBeenCalledTimes(2)
    })
  })

  describe('editing', () => {
    it('starts editing with current proposal content', () => {
      const proposal = createMockProposal('edit.md')
      useDiffReviewStore.getState().setProposals([proposal])

      useDiffReviewStore.getState().startEditing()

      const state = useDiffReviewStore.getState()
      expect(state.isEditing).toBe(true)
      expect(state.editingContent).toBe(proposal.fullNewContent)
    })

    it('cancels editing and clears content', () => {
      useDiffReviewStore.setState({ isEditing: true, editingContent: 'something' })

      useDiffReviewStore.getState().cancelEditing()

      const state = useDiffReviewStore.getState()
      expect(state.isEditing).toBe(false)
      expect(state.editingContent).toBe('')
    })

    it('updates editing content', () => {
      useDiffReviewStore.getState().updateEditingContent('modified content')

      expect(useDiffReviewStore.getState().editingContent).toBe('modified content')
    })

    it('applies edited content', async () => {
      const mockWrite = vi.fn().mockResolvedValue({ success: true })
      window.electronAPI = { file: { write: mockWrite } } as unknown as typeof window.electronAPI

      useDiffReviewStore.getState().setProposals([createMockProposal('edit.md')])
      useDiffReviewStore.getState().startEditing()
      useDiffReviewStore.getState().updateEditingContent('edited content')

      await useDiffReviewStore.getState().applyEdited()

      expect(mockWrite).toHaveBeenCalledWith('edit.md', 'edited content', {
        atomic: true,
        createDirs: true,
      })

      const state = useDiffReviewStore.getState()
      expect(state.isEditing).toBe(false)
      expect(state.appliedPaths).toContain('edit.md')
    })
  })

  describe('rollbackApplied', () => {
    it('restores old content for all applied files', async () => {
      const mockWrite = vi.fn().mockResolvedValue({ success: true })
      window.electronAPI = { file: { write: mockWrite } } as unknown as typeof window.electronAPI

      const proposals = [createMockProposal('a.md'), createMockProposal('b.md')]
      useDiffReviewStore.getState().setProposals(proposals)
      useDiffReviewStore.setState({ appliedPaths: ['a.md', 'b.md'] })

      await useDiffReviewStore.getState().rollbackApplied()

      expect(mockWrite).toHaveBeenCalledTimes(2)
      expect(mockWrite).toHaveBeenCalledWith('a.md', 'old content for a.md', { atomic: true })
      expect(mockWrite).toHaveBeenCalledWith('b.md', 'old content for b.md', { atomic: true })

      const state = useDiffReviewStore.getState()
      expect(state.appliedPaths).toEqual([])
      expect(state.failedPath).toBeNull()
    })
  })

  describe('dismiss', () => {
    it('resets to initial state', () => {
      useDiffReviewStore.getState().setProposals([createMockProposal('x.md')])
      useDiffReviewStore.setState({ isEditing: true, appliedPaths: ['x.md'] })

      useDiffReviewStore.getState().dismiss()

      const state = useDiffReviewStore.getState()
      expect(state.proposals).toEqual([])
      expect(state.isEditing).toBe(false)
      expect(state.appliedPaths).toEqual([])
    })
  })

  describe('clearError', () => {
    it('clears error state', () => {
      useDiffReviewStore.setState({
        failedPath: 'err.md',
        errorMessage: 'some error',
      })

      useDiffReviewStore.getState().clearError()

      const state = useDiffReviewStore.getState()
      expect(state.failedPath).toBeNull()
      expect(state.errorMessage).toBeNull()
    })
  })

  describe('selectors', () => {
    it('selectProposals returns proposals', () => {
      const proposals = [createMockProposal('sel.md')]
      useDiffReviewStore.getState().setProposals(proposals)
      expect(selectProposals(useDiffReviewStore.getState())).toEqual(proposals)
    })

    it('selectIsApplying returns applying state', () => {
      expect(selectIsApplying(useDiffReviewStore.getState())).toBe(false)
      useDiffReviewStore.setState({ isApplying: true })
      expect(selectIsApplying(useDiffReviewStore.getState())).toBe(true)
    })

    it('selectAppliedPaths returns applied paths', () => {
      useDiffReviewStore.setState({ appliedPaths: ['a.md'] })
      expect(selectAppliedPaths(useDiffReviewStore.getState())).toEqual(['a.md'])
    })

    it('selectFailedPath returns failed path', () => {
      useDiffReviewStore.setState({ failedPath: 'fail.md' })
      expect(selectFailedPath(useDiffReviewStore.getState())).toBe('fail.md')
    })

    it('selectErrorMessage returns error message', () => {
      useDiffReviewStore.setState({ errorMessage: 'err' })
      expect(selectErrorMessage(useDiffReviewStore.getState())).toBe('err')
    })
  })
})
