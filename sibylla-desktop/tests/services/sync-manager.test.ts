/**
 * SyncManager — Unit Tests
 *
 * Tests for Phase 0 TASK012: Auto-save mechanism implementation.
 * Covers constructor, lifecycle, debounce, scheduled sync, forceSync,
 * network status, and event emission.
 *
 * Strategy:
 * - Uses vi.useFakeTimers() for deterministic timer control
 * - Mocks FileManager and GitAbstraction dependencies
 * - Target coverage ≥ 85%
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SyncManager } from '../../src/main/services/sync-manager'
import type { NetworkStatusProvider } from '../../src/main/services/sync-manager'
import type { SyncManagerConfig } from '../../src/main/services/types/sync-manager.types'
import type { SyncStatusData } from '../../src/main/services/types/sync-manager.types'
import {
  GitAbstractionError,
  GitAbstractionErrorCode,
} from '../../src/main/services/types/git-abstraction.types'
import type { SyncResult } from '../../src/main/services/types/git-abstraction.types'

// ─── Mock Factories ─────────────────────────────────────────────────────────

/** Create a mock FileManager */
function createMockFileManager() {
  return {
    exists: vi.fn().mockResolvedValue(true),
    getWorkspaceRoot: vi.fn().mockReturnValue('/mock/workspace'),
    resolvePath: vi.fn((p: string) => `/mock/workspace/${p}`),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    startWatching: vi.fn(),
    stopWatching: vi.fn(),
  }
}

/** Create a mock GitAbstraction */
function createMockGitAbstraction() {
  return {
    stageFile: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue('mock-commit-sha'),
    sync: vi.fn().mockResolvedValue({ success: true } as SyncResult),
    isInitialized: vi.fn().mockResolvedValue(true),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  }
}

/** Create a mock NetworkStatusProvider */
function createMockNetworkProvider(online = true): NetworkStatusProvider {
  return {
    isOnline: vi.fn().mockReturnValue(online),
  }
}

/** Default test config */
function createTestConfig(overrides?: Partial<SyncManagerConfig>): SyncManagerConfig {
  return {
    workspaceDir: '/mock/workspace',
    saveDebounceMs: 1000,
    syncIntervalMs: 30000,
    ...overrides,
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SyncManager', () => {
  let mockFileManager: ReturnType<typeof createMockFileManager>
  let mockGitAbstraction: ReturnType<typeof createMockGitAbstraction>
  let mockNetworkProvider: NetworkStatusProvider
  let syncManager: SyncManager

  beforeEach(() => {
    vi.useFakeTimers()
    mockFileManager = createMockFileManager()
    mockGitAbstraction = createMockGitAbstraction()
    mockNetworkProvider = createMockNetworkProvider(true)
  })

  afterEach(() => {
    if (syncManager) {
      syncManager.stop()
      syncManager.removeAllListeners()
    }
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ─── 1. Constructor Tests ──────────────────────────────────────────────

  describe('Constructor', () => {
    it('should use default config values when not specified', () => {
      const config: SyncManagerConfig = { workspaceDir: '/test/workspace' }
      syncManager = new SyncManager(
        config,
        mockFileManager as never,
        mockGitAbstraction as never,
        mockNetworkProvider,
      )

      // Verify defaults are applied (indirectly through behavior)
      expect(syncManager).toBeDefined()
      expect(syncManager.getIsStarted()).toBe(false)
      expect(syncManager.getCurrentStatus()).toBe('idle')
    })

    it('should use custom config values when specified', async () => {
      const config = createTestConfig({
        saveDebounceMs: 2000,
        syncIntervalMs: 60000,
      })
      syncManager = new SyncManager(
        config,
        mockFileManager as never,
        mockGitAbstraction as never,
        mockNetworkProvider,
      )

      expect(syncManager).toBeDefined()
      // Custom debounce: file change should trigger commit after 2000ms, not 1000ms
      syncManager.start()
      syncManager.notifyFileChanged('test.md')

      await vi.advanceTimersByTimeAsync(1500)
      expect(mockGitAbstraction.stageFile).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(600)
      expect(mockGitAbstraction.stageFile).toHaveBeenCalledWith('test.md')
    })

    it('should inject dependencies correctly', async () => {
      syncManager = new SyncManager(
        createTestConfig(),
        mockFileManager as never,
        mockGitAbstraction as never,
        mockNetworkProvider,
      )

      // Verify dependencies work by triggering a file change
      syncManager.start()
      syncManager.notifyFileChanged('file.md')
      await vi.advanceTimersByTimeAsync(1100)

      expect(mockGitAbstraction.stageFile).toHaveBeenCalledWith('file.md')
    })
  })

  // ─── 2. Lifecycle Tests ────────────────────────────────────────────────

  describe('Lifecycle', () => {
    beforeEach(() => {
      syncManager = new SyncManager(
        createTestConfig(),
        mockFileManager as never,
        mockGitAbstraction as never,
        mockNetworkProvider,
      )
    })

    it('should start the sync timer on start()', async () => {
      syncManager.start()
      expect(syncManager.getIsStarted()).toBe(true)

      // Advance timer to trigger scheduled sync (async to flush enqueueGitOp Promises)
      await vi.advanceTimersByTimeAsync(30000)
      expect(mockGitAbstraction.sync).toHaveBeenCalledTimes(1)
    })

    it('should be idempotent — repeated start() calls have no effect', async () => {
      syncManager.start()
      syncManager.start() // Should not throw or create duplicate timers

      expect(syncManager.getIsStarted()).toBe(true)

      // Only one sync timer should be running (async to flush enqueueGitOp Promises)
      await vi.advanceTimersByTimeAsync(30000)
      expect(mockGitAbstraction.sync).toHaveBeenCalledTimes(1)
    })

    it('should clear all timers on stop()', () => {
      syncManager.start()
      syncManager.notifyFileChanged('a.md')
      syncManager.notifyFileChanged('b.md')

      // Both debounce timers and sync timer should be active
      syncManager.stop()
      expect(syncManager.getIsStarted()).toBe(false)

      // Advancing time should not trigger anything
      vi.advanceTimersByTime(60000)
      expect(mockGitAbstraction.stageFile).not.toHaveBeenCalled()
      expect(mockGitAbstraction.sync).not.toHaveBeenCalled()
    })

    it('should be idempotent — repeated stop() calls have no effect', () => {
      syncManager.start()
      syncManager.stop()
      syncManager.stop() // Should not throw

      expect(syncManager.getIsStarted()).toBe(false)
    })
  })

  // ─── 3. Debounce Logic Tests ───────────────────────────────────────────

  describe('Debounce Logic', () => {
    beforeEach(() => {
      syncManager = new SyncManager(
        createTestConfig({ saveDebounceMs: 1000, syncIntervalMs: 0 }),
        mockFileManager as never,
        mockGitAbstraction as never,
        mockNetworkProvider,
      )
      syncManager.start()
    })

    it('should trigger commit 1 second after a single notifyFileChanged', async () => {
      syncManager.notifyFileChanged('test.md')

      // Before debounce expires
      vi.advanceTimersByTime(999)
      expect(mockGitAbstraction.stageFile).not.toHaveBeenCalled()

      // After debounce expires
      vi.advanceTimersByTime(2)
      // Need to flush microtasks for async autoCommitFile
      await vi.advanceTimersByTimeAsync(0)

      expect(mockGitAbstraction.stageFile).toHaveBeenCalledWith('test.md')
      expect(mockGitAbstraction.commit).toHaveBeenCalledWith('Auto-save: test.md')
    })

    it('should only trigger once for multiple rapid changes to the same file', async () => {
      syncManager.notifyFileChanged('test.md')
      vi.advanceTimersByTime(500)

      syncManager.notifyFileChanged('test.md')
      vi.advanceTimersByTime(500)

      syncManager.notifyFileChanged('test.md')
      vi.advanceTimersByTime(500)

      syncManager.notifyFileChanged('test.md')
      vi.advanceTimersByTime(500)

      syncManager.notifyFileChanged('test.md')

      // Advance past debounce from last call
      await vi.advanceTimersByTimeAsync(1100)

      // Should only have been called once (from last notifyFileChanged)
      expect(mockGitAbstraction.stageFile).toHaveBeenCalledTimes(1)
      expect(mockGitAbstraction.commit).toHaveBeenCalledTimes(1)
    })

    it('should handle different files independently', async () => {
      syncManager.notifyFileChanged('a.md')
      syncManager.notifyFileChanged('b.md')

      await vi.advanceTimersByTimeAsync(1100)

      expect(mockGitAbstraction.stageFile).toHaveBeenCalledTimes(2)
      expect(mockGitAbstraction.stageFile).toHaveBeenCalledWith('a.md')
      expect(mockGitAbstraction.stageFile).toHaveBeenCalledWith('b.md')
      expect(mockGitAbstraction.commit).toHaveBeenCalledTimes(2)
    })

    it('should silently handle NOTHING_TO_COMMIT error', async () => {
      mockGitAbstraction.commit.mockRejectedValueOnce(
        new GitAbstractionError(
          GitAbstractionErrorCode.NOTHING_TO_COMMIT,
          'No staged changes to commit',
        ),
      )

      const errorSpy = vi.fn()
      syncManager.on('sync:error', errorSpy)

      syncManager.notifyFileChanged('unchanged.md')
      await vi.advanceTimersByTimeAsync(1100)

      // Should NOT emit sync:error for NOTHING_TO_COMMIT
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('should handle NOT_INITIALIZED error gracefully', async () => {
      mockGitAbstraction.stageFile.mockRejectedValueOnce(
        new GitAbstractionError(
          GitAbstractionErrorCode.NOT_INITIALIZED,
          'Repository not initialized',
        ),
      )

      const errorSpy = vi.fn()
      syncManager.on('sync:error', errorSpy)

      syncManager.notifyFileChanged('test.md')
      await vi.advanceTimersByTimeAsync(1100)

      // Should NOT emit sync:error for NOT_INITIALIZED
      expect(errorSpy).not.toHaveBeenCalled()
    })
  })

  // ─── 4. Scheduled Sync Tests ──────────────────────────────────────────

  describe('Scheduled Sync', () => {
    beforeEach(() => {
      syncManager = new SyncManager(
        createTestConfig({ syncIntervalMs: 30000 }),
        mockFileManager as never,
        mockGitAbstraction as never,
        mockNetworkProvider,
      )
    })

    it('should call sync() when the timer fires', async () => {
      syncManager.start()

      await vi.advanceTimersByTimeAsync(30000)

      expect(mockGitAbstraction.sync).toHaveBeenCalledTimes(1)
    })

    it('should skip sync when already syncing', async () => {
      // Make sync take a long time so the next interval fires while syncing
      mockGitAbstraction.sync.mockImplementation(() => {
        return new Promise<SyncResult>((resolve) => {
          setTimeout(() => resolve({ success: true }), 35000)
        })
      })

      syncManager.start()

      // First sync starts at 30s
      await vi.advanceTimersByTimeAsync(30000)
      expect(mockGitAbstraction.sync).toHaveBeenCalledTimes(1)

      // Second interval fires at 60s, but first sync is still in progress
      await vi.advanceTimersByTimeAsync(30000)
      // sync should still only have been called once (second was skipped)
      expect(mockGitAbstraction.sync).toHaveBeenCalledTimes(1)

      // Complete the first sync
      await vi.advanceTimersByTimeAsync(5000)
    })

    it('should skip sync when offline', async () => {
      const offlineProvider = createMockNetworkProvider(false)
      syncManager = new SyncManager(
        createTestConfig({ syncIntervalMs: 30000 }),
        mockFileManager as never,
        mockGitAbstraction as never,
        offlineProvider,
      )
      syncManager.start()

      await vi.advanceTimersByTimeAsync(30000)

      expect(mockGitAbstraction.sync).not.toHaveBeenCalled()
    })

    it('should emit sync:success and status:changed on successful sync', async () => {
      const successSpy = vi.fn()
      const statusSpy = vi.fn()

      syncManager.start()
      syncManager.on('sync:success', successSpy)
      syncManager.on('status:changed', statusSpy)

      await vi.advanceTimersByTimeAsync(30000)

      expect(successSpy).toHaveBeenCalledTimes(1)

      // Find the 'synced' status change
      const syncedCall = statusSpy.mock.calls.find(
        (call: SyncStatusData[]) => call[0].status === 'synced',
      )
      expect(syncedCall).toBeDefined()
    })

    it('should emit sync:conflict and status:changed on conflict', async () => {
      mockGitAbstraction.sync.mockResolvedValueOnce({
        success: false,
        hasConflicts: true,
        conflicts: ['file1.md', 'file2.md'],
      } as SyncResult)

      const conflictSpy = vi.fn()
      const statusSpy = vi.fn()

      syncManager.start()
      syncManager.on('sync:conflict', conflictSpy)
      syncManager.on('status:changed', statusSpy)

      await vi.advanceTimersByTimeAsync(30000)

      expect(conflictSpy).toHaveBeenCalledTimes(1)
      expect(conflictSpy).toHaveBeenCalledWith(['file1.md', 'file2.md'])

      const conflictStatusCall = statusSpy.mock.calls.find(
        (call: SyncStatusData[]) => call[0].status === 'conflict',
      )
      expect(conflictStatusCall).toBeDefined()
      expect(conflictStatusCall![0].conflictFiles).toEqual(['file1.md', 'file2.md'])
    })
  })

  // ─── 5. forceSync Tests ───────────────────────────────────────────────

  describe('forceSync', () => {
    beforeEach(() => {
      syncManager = new SyncManager(
        createTestConfig({ syncIntervalMs: 0 }),
        mockFileManager as never,
        mockGitAbstraction as never,
        mockNetworkProvider,
      )
      syncManager.start()
    })

    it('should return SyncResult on successful force sync', async () => {
      const result = await syncManager.forceSync()

      expect(result).toEqual({ success: true })
      expect(mockGitAbstraction.sync).toHaveBeenCalledTimes(1)
    })

    it('should work regardless of network status', async () => {
      syncManager.setNetworkStatus(false)
      expect(syncManager.getIsOnline()).toBe(false)

      const result = await syncManager.forceSync()

      expect(result).toEqual({ success: true })
      expect(mockGitAbstraction.sync).toHaveBeenCalledTimes(1)
    })

    it('should throw when a sync is already in progress', async () => {
      // Make sync take a long time
      mockGitAbstraction.sync.mockImplementation(() => {
        return new Promise<SyncResult>((resolve) => {
          setTimeout(() => resolve({ success: true }), 5000)
        })
      })

      // Start first forceSync (don't await it)
      const firstSync = syncManager.forceSync()

      // Try to forceSync again while first is in progress
      await expect(syncManager.forceSync()).rejects.toThrow(
        'Sync operation already in progress',
      )

      // Clean up: advance time to complete the first sync
      await vi.advanceTimersByTimeAsync(5000)
      await firstSync
    })
  })

  // ─── 6. Network Status Tests ──────────────────────────────────────────

  describe('Network Status', () => {
    it('should detect initial network status on start()', () => {
      const offlineProvider = createMockNetworkProvider(false)
      syncManager = new SyncManager(
        createTestConfig(),
        mockFileManager as never,
        mockGitAbstraction as never,
        offlineProvider,
      )

      const statusSpy = vi.fn()
      syncManager.on('status:changed', statusSpy)

      syncManager.start()

      expect(syncManager.getIsOnline()).toBe(false)
      expect(syncManager.getCurrentStatus()).toBe('offline')
      expect(statusSpy).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'offline' }),
      )
    })

    it('should update status to offline when network drops', () => {
      syncManager = new SyncManager(
        createTestConfig(),
        mockFileManager as never,
        mockGitAbstraction as never,
        mockNetworkProvider,
      )
      syncManager.start()

      const statusSpy = vi.fn()
      syncManager.on('status:changed', statusSpy)

      syncManager.setNetworkStatus(false)

      expect(syncManager.getIsOnline()).toBe(false)
      expect(syncManager.getCurrentStatus()).toBe('offline')
      expect(statusSpy).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'offline' }),
      )
    })

    it('should update status to idle when network recovers', () => {
      const offlineProvider = createMockNetworkProvider(false)
      syncManager = new SyncManager(
        createTestConfig(),
        mockFileManager as never,
        mockGitAbstraction as never,
        offlineProvider,
      )
      syncManager.start()

      const statusSpy = vi.fn()
      syncManager.on('status:changed', statusSpy)

      syncManager.setNetworkStatus(true)

      expect(syncManager.getIsOnline()).toBe(true)
      expect(syncManager.getCurrentStatus()).toBe('idle')
      expect(statusSpy).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'idle' }),
      )
    })
  })

  // ─── 7. Event Emission Tests ──────────────────────────────────────────

  describe('Event Emission', () => {
    beforeEach(() => {
      syncManager = new SyncManager(
        createTestConfig({ syncIntervalMs: 0 }),
        mockFileManager as never,
        mockGitAbstraction as never,
        mockNetworkProvider,
      )
      syncManager.start()
    })

    it('should emit sync:start and sync:end as a pair', async () => {
      const startSpy = vi.fn()
      const endSpy = vi.fn()

      syncManager.on('sync:start', startSpy)
      syncManager.on('sync:end', endSpy)

      await syncManager.forceSync()

      expect(startSpy).toHaveBeenCalledTimes(1)
      expect(endSpy).toHaveBeenCalledTimes(1)
    })

    it('should emit sync:error with correct Error object on failure', async () => {
      mockGitAbstraction.sync.mockResolvedValueOnce({
        success: false,
        error: 'Network timeout',
      } as SyncResult)

      const errorSpy = vi.fn()
      syncManager.on('sync:error', errorSpy)

      await syncManager.forceSync()

      expect(errorSpy).toHaveBeenCalledTimes(1)
      const emittedError = errorSpy.mock.calls[0][0] as Error
      expect(emittedError).toBeInstanceOf(Error)
      expect(emittedError.message).toBe('Network timeout')
    })

    it('should emit status:changed with correct SyncStatusData', async () => {
      const statusSpy = vi.fn()
      syncManager.on('status:changed', statusSpy)

      await syncManager.forceSync()

      // Should have emitted at least 'syncing' and 'synced'
      expect(statusSpy).toHaveBeenCalledTimes(2)

      const syncingCall = statusSpy.mock.calls[0][0] as SyncStatusData
      expect(syncingCall.status).toBe('syncing')
      expect(typeof syncingCall.timestamp).toBe('number')

      const syncedCall = statusSpy.mock.calls[1][0] as SyncStatusData
      expect(syncedCall.status).toBe('synced')
      expect(typeof syncedCall.timestamp).toBe('number')
    })
  })

  // ─── 8. Edge Cases ────────────────────────────────────────────────────

  describe('Edge Cases', () => {
    it('should ignore notifyFileChanged when not started', () => {
      syncManager = new SyncManager(
        createTestConfig(),
        mockFileManager as never,
        mockGitAbstraction as never,
        mockNetworkProvider,
      )

      // Do not call start()
      syncManager.notifyFileChanged('test.md')

      vi.advanceTimersByTime(2000)
      expect(mockGitAbstraction.stageFile).not.toHaveBeenCalled()
    })

    it('should emit sync:error on unexpected autoCommitFile failure', async () => {
      syncManager = new SyncManager(
        createTestConfig({ syncIntervalMs: 0 }),
        mockFileManager as never,
        mockGitAbstraction as never,
        mockNetworkProvider,
      )
      syncManager.start()

      mockGitAbstraction.stageFile.mockRejectedValueOnce(
        new Error('Unexpected disk error'),
      )

      const errorSpy = vi.fn()
      syncManager.on('sync:error', errorSpy)

      syncManager.notifyFileChanged('broken.md')
      await vi.advanceTimersByTimeAsync(1100)

      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(errorSpy.mock.calls[0][0].message).toBe('Unexpected disk error')
    })

    it('should handle sync() throwing an exception', async () => {
      syncManager = new SyncManager(
        createTestConfig({ syncIntervalMs: 0 }),
        mockFileManager as never,
        mockGitAbstraction as never,
        mockNetworkProvider,
      )
      syncManager.start()

      mockGitAbstraction.sync.mockRejectedValueOnce(new Error('Connection reset'))

      const errorSpy = vi.fn()
      const endSpy = vi.fn()
      syncManager.on('sync:error', errorSpy)
      syncManager.on('sync:end', endSpy)

      const result = await syncManager.forceSync()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Connection reset')
      expect(errorSpy).toHaveBeenCalledTimes(1)
      // sync:end should still be emitted (finally block)
      expect(endSpy).toHaveBeenCalledTimes(1)
    })

    it('should restart correctly after stop() then start()', async () => {
      syncManager = new SyncManager(
        createTestConfig({ syncIntervalMs: 30000 }),
        mockFileManager as never,
        mockGitAbstraction as never,
        mockNetworkProvider,
      )

      syncManager.start()
      syncManager.stop()
      syncManager.start()

      await vi.advanceTimersByTimeAsync(30000)
      expect(mockGitAbstraction.sync).toHaveBeenCalledTimes(1)
    })

    it('should not start sync timer when syncIntervalMs is 0', () => {
      syncManager = new SyncManager(
        createTestConfig({ syncIntervalMs: 0 }),
        mockFileManager as never,
        mockGitAbstraction as never,
        mockNetworkProvider,
      )

      syncManager.start()

      vi.advanceTimersByTime(120000)
      expect(mockGitAbstraction.sync).not.toHaveBeenCalled()
    })
  })
})
