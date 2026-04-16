import { describe, expect, it, beforeEach, vi } from 'vitest'
import { useVersionHistoryStore, PAGE_SIZE } from '../../src/renderer/store/versionHistoryStore'

describe('versionHistoryStore', () => {
  beforeEach(() => {
    useVersionHistoryStore.getState().closePanel()
    vi.clearAllMocks()
  })

  it('has correct initial state', () => {
    const state = useVersionHistoryStore.getState()
    expect(state.isOpen).toBe(false)
    expect(state.filePath).toBeNull()
    expect(state.versions).toEqual([])
    expect(state.selectedVersion).toBeNull()
    expect(state.diff).toBeNull()
    expect(state.isLoadingHistory).toBe(false)
    expect(state.isLoadingDiff).toBe(false)
    expect(state.isRestoring).toBe(false)
    expect(state.error).toBeNull()
    expect(state.page).toBe(0)
  })

  describe('openPanel', () => {
    it('sets isOpen and filePath', () => {
      const mockHistory = vi.fn().mockResolvedValue({
        success: true,
        data: [],
      })
      window.electronAPI.git.history = mockHistory

      useVersionHistoryStore.getState().openPanel('docs/prd.md')

      const state = useVersionHistoryStore.getState()
      expect(state.isOpen).toBe(true)
      expect(state.filePath).toBe('docs/prd.md')
      expect(state.isLoadingHistory).toBe(true)
    })
  })

  describe('closePanel', () => {
    it('resets to initial state', async () => {
      const mockHistory = vi.fn().mockResolvedValue({
        success: true,
        data: [],
      })
      window.electronAPI.git.history = mockHistory

      useVersionHistoryStore.getState().openPanel('docs/prd.md')
      useVersionHistoryStore.getState().closePanel()

      const state = useVersionHistoryStore.getState()
      expect(state.isOpen).toBe(false)
      expect(state.filePath).toBeNull()
    })
  })

  describe('loadHistory', () => {
    it('maps CommitInfo to VersionEntry', async () => {
      const mockHistory = vi.fn().mockResolvedValue({
        success: true,
        data: [
          {
            oid: 'abc123',
            message: '更新 prd.md\n\n添加了新的需求描述',
            authorName: 'Alice',
            authorEmail: 'alice@example.com',
            timestamp: Date.now() - 60000,
            parents: ['def456'],
          },
        ],
      })
      window.electronAPI.git.history = mockHistory

      useVersionHistoryStore.getState().openPanel('prd.md')
      await vi.waitFor(() => {
        expect(useVersionHistoryStore.getState().isLoadingHistory).toBe(false)
      })

      const state = useVersionHistoryStore.getState()
      expect(state.versions).toHaveLength(1)
      expect(state.versions[0]!.oid).toBe('abc123')
      expect(state.versions[0]!.author).toBe('Alice')
      expect(state.versions[0]!.summary).toBe('更新 prd.md')
    })

    it('truncates long summary to 60 chars', async () => {
      const longMessage = 'A'.repeat(100)
      const mockHistory = vi.fn().mockResolvedValue({
        success: true,
        data: [
          {
            oid: 'abc123',
            message: longMessage,
            authorName: 'Bob',
            authorEmail: 'bob@example.com',
            timestamp: Date.now(),
            parents: [],
          },
        ],
      })
      window.electronAPI.git.history = mockHistory

      useVersionHistoryStore.getState().openPanel('test.md')
      await vi.waitFor(() => {
        expect(useVersionHistoryStore.getState().isLoadingHistory).toBe(false)
      })

      const summary = useVersionHistoryStore.getState().versions[0]!.summary
      expect(summary.length).toBeLessThanOrEqual(60)
      expect(summary.endsWith('...')).toBe(true)
    })

    it('sets error on IPC failure', async () => {
      const mockHistory = vi.fn().mockResolvedValue({
        success: false,
        error: { message: 'Network error' },
      })
      window.electronAPI.git.history = mockHistory

      useVersionHistoryStore.getState().openPanel('test.md')
      await vi.waitFor(() => {
        expect(useVersionHistoryStore.getState().isLoadingHistory).toBe(false)
      })

      expect(useVersionHistoryStore.getState().error).toBe('Network error')
    })
  })

  describe('selectVersion', () => {
    it('loads diff for selected version', async () => {
      const mockHistory = vi.fn().mockResolvedValue({
        success: true,
        data: [],
      })
      window.electronAPI.git.history = mockHistory

      const mockDiff = vi.fn().mockResolvedValue({
        success: true,
        data: {
          filepath: 'test.md',
          oldContent: 'old',
          newContent: 'new',
          hunks: [],
        },
      })
      window.electronAPI.git.diff = mockDiff

      useVersionHistoryStore.getState().openPanel('test.md')
      await vi.waitFor(() => {
        expect(useVersionHistoryStore.getState().isLoadingHistory).toBe(false)
      })

      const version = {
        oid: 'abc123',
        message: 'test',
        author: 'Alice',
        timestamp: Date.now(),
        summary: 'test',
      }

      useVersionHistoryStore.getState().selectVersion(version)

      expect(useVersionHistoryStore.getState().selectedVersion).toEqual(version)
      expect(useVersionHistoryStore.getState().isLoadingDiff).toBe(true)

      await vi.waitFor(() => {
        expect(useVersionHistoryStore.getState().isLoadingDiff).toBe(false)
      })

      expect(useVersionHistoryStore.getState().diff).not.toBeNull()
      expect(mockDiff).toHaveBeenCalledWith('test.md', 'abc123')
    })
  })

  describe('restoreVersion', () => {
    it('closes panel on success', async () => {
      const mockRestore = vi.fn().mockResolvedValue({
        success: true,
        data: 'new-oid',
      })
      window.electronAPI.git.restore = mockRestore

      useVersionHistoryStore.getState().openPanel('test.md')

      const version = {
        oid: 'abc123',
        message: 'test',
        author: 'Alice',
        timestamp: Date.now(),
        summary: 'test',
      }
      useVersionHistoryStore.getState().selectVersion(version)

      await vi.waitFor(() => {
        expect(useVersionHistoryStore.getState().isLoadingDiff).toBe(false)
      })

      await useVersionHistoryStore.getState().restoreVersion()

      expect(useVersionHistoryStore.getState().isOpen).toBe(false)
      expect(mockRestore).toHaveBeenCalledWith('test.md', 'abc123')
    })

    it('sets error on IPC failure', async () => {
      const mockRestore = vi.fn().mockResolvedValue({
        success: false,
        error: { message: 'Restore failed' },
      })
      window.electronAPI.git.restore = mockRestore

      useVersionHistoryStore.getState().openPanel('test.md')

      const version = {
        oid: 'abc123',
        message: 'test',
        author: 'Alice',
        timestamp: Date.now(),
        summary: 'test',
      }
      useVersionHistoryStore.getState().selectVersion(version)

      await useVersionHistoryStore.getState().restoreVersion()

      expect(useVersionHistoryStore.getState().error).toBe('Restore failed')
      expect(useVersionHistoryStore.getState().isRestoring).toBe(false)
    })
  })

  describe('setPage', () => {
    it('updates page and triggers loadHistory', () => {
      const mockHistory = vi.fn().mockResolvedValue({
        success: true,
        data: [],
      })
      window.electronAPI.git.history = mockHistory

      useVersionHistoryStore.getState().openPanel('test.md')
      useVersionHistoryStore.getState().setPage(2)

      expect(useVersionHistoryStore.getState().page).toBe(2)
    })
  })

  describe('clearError', () => {
    it('clears error', () => {
      const mockHistory = vi.fn().mockResolvedValue({
        success: false,
        error: { message: 'Error' },
      })
      window.electronAPI.git.history = mockHistory

      useVersionHistoryStore.getState().openPanel('test.md')

      useVersionHistoryStore.getState().clearError()
      expect(useVersionHistoryStore.getState().error).toBeNull()
    })
  })
})
