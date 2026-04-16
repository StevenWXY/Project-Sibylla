/**
 * AutoSaveManager — Unit Tests
 *
 * Tests for PHASE1-TASK005: Auto-save and implicit commit.
 * Covers debounce, batch aggregation, commit message generation,
 * error retry, and lifecycle.
 *
 * Strategy:
 * - Uses vi.useFakeTimers() for deterministic timer control
 * - Mocks FileManager and GitAbstraction dependencies
 * - Target coverage ≥ 80%
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AutoSaveManager } from '../../src/main/services/auto-save-manager'
import type { BatchCommitResult, SaveResult } from '../../src/main/services/types/auto-save.types'

function createMockFileManager() {
  return {
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
    exists: vi.fn().mockResolvedValue(true),
    getWorkspaceRoot: vi.fn().mockReturnValue('/mock/workspace'),
    resolvePath: vi.fn((p: string) => `/mock/workspace/${p}`),
  }
}

function createMockGitAbstraction() {
  return {
    stageFile: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue('abc123def456789'),
    commitAll: vi.fn().mockResolvedValue('abc123def456789'),
    isInitialized: vi.fn().mockResolvedValue(true),
  }
}

describe('AutoSaveManager', () => {
  let mockFileManager: ReturnType<typeof createMockFileManager>
  let mockGitAbstraction: ReturnType<typeof createMockGitAbstraction>
  let manager: AutoSaveManager

  beforeEach(() => {
    vi.useFakeTimers()
    mockFileManager = createMockFileManager()
    mockGitAbstraction = createMockGitAbstraction()
    manager = new AutoSaveManager(
      { debounceMs: 1000, batchWindowMs: 5000, maxRetries: 3 },
      mockFileManager as never,
      mockGitAbstraction as never,
      'Alice',
    )
  })

  afterEach(() => {
    manager.destroy()
    vi.useRealTimers()
  })

  describe('onFileChanged — debounce', () => {
    it('should flush after debounce delay', async () => {
      const committedListener = vi.fn()
      manager.on('committed', committedListener)

      manager.onFileChanged('docs/prd.md', 'content')

      vi.advanceTimersByTime(999)
      expect(committedListener).not.toHaveBeenCalled()

      vi.advanceTimersByTime(2)
      await vi.runAllTimersAsync()

      expect(mockFileManager.writeFile).toHaveBeenCalledWith('docs/prd.md', 'content')
    })

    it('should debounce multiple rapid changes to a single flush', async () => {
      const committedListener = vi.fn()
      manager.on('committed', committedListener)

      for (let i = 0; i < 5; i++) {
        manager.onFileChanged('docs/prd.md', `content-${i}`)
        vi.advanceTimersByTime(200)
      }

      vi.advanceTimersByTime(1000)
      await vi.runAllTimersAsync()

      expect(mockFileManager.writeFile).toHaveBeenCalledTimes(1)
      expect(mockFileManager.writeFile).toHaveBeenCalledWith('docs/prd.md', 'content-4')
    })
  })

  describe('onFileChanged — batch aggregation', () => {
    it('should aggregate multiple files within batch window', async () => {
      const committedListener = vi.fn<[result: BatchCommitResult]>()
      manager.on('committed', committedListener)

      manager.onFileChanged('docs/a.md', 'content-a')
      vi.advanceTimersByTime(500)

      manager.onFileChanged('docs/b.md', 'content-b')
      vi.advanceTimersByTime(500)

      manager.onFileChanged('docs/c.md', 'content-c')
      vi.advanceTimersByTime(1000)
      await vi.runAllTimersAsync()

      expect(committedListener).toHaveBeenCalledTimes(1)
      const result = committedListener.mock.calls[0][0]
      expect(result.files).toHaveLength(3)
      expect(result.files).toContain('docs/a.md')
      expect(result.files).toContain('docs/b.md')
      expect(result.files).toContain('docs/c.md')
    })

    it('should create separate commits for files changed after batch window', async () => {
      const committedListener = vi.fn()
      manager.on('committed', committedListener)

      manager.onFileChanged('docs/first.md', 'content-1')
      vi.advanceTimersByTime(1000)
      await vi.runAllTimersAsync()

      expect(committedListener).toHaveBeenCalledTimes(1)

      manager.onFileChanged('docs/second.md', 'content-2')
      vi.advanceTimersByTime(1000)
      await vi.runAllTimersAsync()

      expect(committedListener).toHaveBeenCalledTimes(2)
    })

    it('should force flush when batch window expires', async () => {
      const committedListener = vi.fn()
      manager.on('committed', committedListener)

      manager.onFileChanged('docs/a.md', 'content-a')

      vi.advanceTimersByTime(400)
      manager.onFileChanged('docs/b.md', 'content-b')

      vi.advanceTimersByTime(400)
      manager.onFileChanged('docs/c.md', 'content-c')

      vi.advanceTimersByTime(5000)
      await vi.runAllTimersAsync()

      expect(committedListener).toHaveBeenCalledTimes(1)
      const result = committedListener.mock.calls[0][0]
      expect(result.files.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('generateCommitMessage', () => {
    it('should generate single file commit message', async () => {
      const committedListener = vi.fn<[result: BatchCommitResult]>()
      manager.on('committed', committedListener)

      manager.onFileChanged('docs/prd.md', 'content')
      vi.advanceTimersByTime(1000)
      await vi.runAllTimersAsync()

      expect(committedListener).toHaveBeenCalledTimes(1)
      expect(committedListener.mock.calls[0][0].message).toBe('[Alice] 更新 prd.md')
    })

    it('should generate multi-file commit message with filenames for 2-3 files', async () => {
      const committedListener = vi.fn<[result: BatchCommitResult]>()
      manager.on('committed', committedListener)

      manager.onFileChanged('docs/a.md', 'content-a')
      vi.advanceTimersByTime(500)
      manager.onFileChanged('docs/b.md', 'content-b')
      vi.advanceTimersByTime(1000)
      await vi.runAllTimersAsync()

      expect(committedListener).toHaveBeenCalledTimes(1)
      const msg = committedListener.mock.calls[0][0].message
      expect(msg).toContain('[Alice] 更新')
      expect(msg).toContain('a.md')
      expect(msg).toContain('b.md')
    })

    it('should generate count-based message for 4+ files', async () => {
      const committedListener = vi.fn<[result: BatchCommitResult]>()
      manager.on('committed', committedListener)

      manager.onFileChanged('docs/a.md', 'a')
      vi.advanceTimersByTime(200)
      manager.onFileChanged('docs/b.md', 'b')
      vi.advanceTimersByTime(200)
      manager.onFileChanged('docs/c.md', 'c')
      vi.advanceTimersByTime(200)
      manager.onFileChanged('docs/d.md', 'd')
      vi.advanceTimersByTime(200)
      manager.onFileChanged('docs/e.md', 'e')
      vi.advanceTimersByTime(1000)
      await vi.runAllTimersAsync()

      expect(committedListener).toHaveBeenCalledTimes(1)
      expect(committedListener.mock.calls[0][0].message).toBe('[Alice] 更新 5 个文件')
    })
  })

  describe('error retry', () => {
    it('should retry on write failure and succeed', async () => {
      mockFileManager.writeFile
        .mockRejectedValueOnce(new Error('disk busy'))
        .mockResolvedValueOnce(undefined)

      const committedListener = vi.fn()
      manager.on('committed', committedListener)

      manager.onFileChanged('docs/prd.md', 'content')
      vi.advanceTimersByTime(1000)

      vi.advanceTimersByTime(1000)
      await vi.runAllTimersAsync()

      expect(mockFileManager.writeFile).toHaveBeenCalledTimes(2)
      expect(committedListener).toHaveBeenCalledTimes(1)
    })

    it('should emit save-failed after max retries', async () => {
      mockFileManager.writeFile.mockRejectedValue(new Error('disk full'))

      const failedListener = vi.fn<[results: SaveResult[]]>()
      manager.on('save-failed', failedListener)

      manager.onFileChanged('docs/prd.md', 'content')
      vi.advanceTimersByTime(1000)

      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(1000 * (i + 1))
      }
      await vi.runAllTimersAsync()

      expect(failedListener).toHaveBeenCalledTimes(1)
      expect(failedListener.mock.calls[0][0][0].filePath).toBe('docs/prd.md')
      expect(failedListener.mock.calls[0][0][0].success).toBe(false)
    })

    it('should emit retry events', async () => {
      mockFileManager.writeFile
        .mockRejectedValueOnce(new Error('temp error'))
        .mockResolvedValueOnce(undefined)

      const retryListener = vi.fn()
      manager.on('retry', retryListener)

      manager.onFileChanged('docs/prd.md', 'content')
      vi.advanceTimersByTime(1000)
      vi.advanceTimersByTime(1000)
      await vi.runAllTimersAsync()

      expect(retryListener).toHaveBeenCalledWith({ filePath: 'docs/prd.md', attempt: 1 })
    })
  })

  describe('retrySave', () => {
    it('should retry save for a specific file from cache', async () => {
      manager.onFileChanged('docs/prd.md', 'cached-content')
      vi.advanceTimersByTime(1000)
      await vi.runAllTimersAsync()

      mockFileManager.writeFile.mockClear()
      mockGitAbstraction.stageFile.mockClear()
      mockGitAbstraction.commit.mockClear()

      await manager.retrySave('docs/prd.md')

      expect(mockFileManager.writeFile).toHaveBeenCalledWith('docs/prd.md', 'cached-content')
    })

    it('should throw when no cached content exists', async () => {
      await expect(manager.retrySave('unknown.md')).rejects.toThrow(
        'No cached content for file: unknown.md',
      )
    })
  })

  describe('destroy', () => {
    it('should clear all timers and ignore subsequent changes', () => {
      const committedListener = vi.fn()
      manager.on('committed', committedListener)

      manager.onFileChanged('docs/prd.md', 'content')
      manager.destroy()

      vi.advanceTimersByTime(2000)

      expect(committedListener).not.toHaveBeenCalled()
    })

    it('should ignore onFileChanged after destroy', () => {
      manager.destroy()

      manager.onFileChanged('docs/prd.md', 'content')
      vi.advanceTimersByTime(2000)

      expect(mockFileManager.writeFile).not.toHaveBeenCalled()
    })
  })

  describe('empty content', () => {
    it('should save empty string content normally', async () => {
      const committedListener = vi.fn()
      manager.on('committed', committedListener)

      manager.onFileChanged('docs/empty.md', '')
      vi.advanceTimersByTime(1000)
      await vi.runAllTimersAsync()

      expect(mockFileManager.writeFile).toHaveBeenCalledWith('docs/empty.md', '')
      expect(committedListener).toHaveBeenCalledTimes(1)
    })
  })

  describe('commit error handling', () => {
    it('should emit error event when commit fails', async () => {
      mockGitAbstraction.commit.mockRejectedValue(new Error('git lock'))

      const errorListener = vi.fn()
      manager.on('error', errorListener)

      manager.onFileChanged('docs/prd.md', 'content')
      vi.advanceTimersByTime(1000)
      await vi.runAllTimersAsync()

      expect(errorListener).toHaveBeenCalledTimes(1)
      expect(errorListener.mock.calls[0][0].type).toBe('commit')
    })
  })
})
