import { describe, expect, it, beforeEach, vi } from 'vitest'
import { SyncManager } from '../../../../src/main/services/sync-manager'
import type { AppEventBus } from '../../../../src/main/services/event-bus'

function createMockFileManager() {
  return {
    on: vi.fn(),
    off: vi.fn(),
    removeAllListeners: vi.fn(),
  }
}

function createMockGitAbstraction(syncResult: Record<string, unknown>) {
  return {
    sync: vi.fn().mockResolvedValue(syncResult),
    commit: vi.fn().mockResolvedValue('test-oid'),
    stageFile: vi.fn(),
    getStatus: vi.fn().mockResolvedValue({ modified: [], staged: [], untracked: [] }),
  }
}

function createMockConfigManager() {
  return { get: vi.fn() }
}

function createMockEventBus() {
  return {
    emitEvent: vi.fn(),
    subscribe: vi.fn(),
    subscribeWithFilter: vi.fn(),
    subscribeAny: vi.fn(),
    flushAndShutdown: vi.fn(),
  }
}

describe('SyncManager event bridging', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('emits git.conflict-detected when eventBus is injected', async () => {
    const conflictData = {
      filePath: 'docs/test.md',
      localContent: 'local content',
      remoteContent: 'remote content',
      baseContent: 'base content',
    }

    const mockGit = createMockGitAbstraction({
      success: false,
      hasConflicts: true,
      conflicts: [conflictData],
    })

    const mockEventBus = createMockEventBus()

    const manager = new SyncManager(
      { workspaceDir: '/tmp/test-ws' },
      createMockFileManager() as unknown as import('../../../../src/main/services/file-manager').FileManager,
      mockGit as unknown as import('../../../../src/main/services/git-abstraction').GitAbstraction,
      { isOnline: () => true },
      undefined,
      mockEventBus as unknown as AppEventBus,
    )

    await manager.forceSync()

    expect(mockEventBus.emitEvent).toHaveBeenCalledOnce()
    const call = mockEventBus.emitEvent.mock.calls[0][0]
    expect(call.type).toBe('git.conflict-detected')
    expect(call.source).toBe('sync-manager')
    expect(call.payload.conflicts).toHaveLength(1)
    expect(call.payload.conflicts[0].filePath).toBe('docs/test.md')
    expect(call.payload.conflicts[0].conflictId).toBeDefined()
    expect(call.payload.conflicts[0].localPreview).toBe('local content')
    expect(call.payload.conflicts[0].remotePreview).toBe('remote content')
  })

  it('does not throw when eventBus is not injected', async () => {
    const mockGit = createMockGitAbstraction({
      success: false,
      hasConflicts: true,
      conflicts: [{ filePath: 'test.md', localContent: 'a', remoteContent: 'b', baseContent: '' }],
    })

    const manager = new SyncManager(
      { workspaceDir: '/tmp/test-ws' },
      createMockFileManager() as unknown as import('../../../../src/main/services/file-manager').FileManager,
      mockGit as unknown as import('../../../../src/main/services/git-abstraction').GitAbstraction,
      { isOnline: () => true },
    )

    await expect(manager.forceSync()).resolves.toBeDefined()
  })

  it('generates conflictId as ULID', async () => {
    const mockGit = createMockGitAbstraction({
      success: false,
      hasConflicts: true,
      conflicts: [{ filePath: 'test.md', localContent: 'a'.repeat(600), remoteContent: 'b', baseContent: '' }],
    })

    const mockEventBus = createMockEventBus()

    const manager = new SyncManager(
      { workspaceDir: '/tmp/test-ws' },
      createMockFileManager() as unknown as import('../../../../src/main/services/file-manager').FileManager,
      mockGit as unknown as import('../../../../src/main/services/git-abstraction').GitAbstraction,
      { isOnline: () => true },
      undefined,
      mockEventBus as unknown as AppEventBus,
    )

    await manager.forceSync()

    const call = mockEventBus.emitEvent.mock.calls[0][0]
    const conflictId: string = call.payload.conflicts[0].conflictId
    expect(conflictId).toBeTruthy()
    expect(conflictId.length).toBeGreaterThan(10)
  })

  it('truncates previews to 500 characters', async () => {
    const longContent = 'x'.repeat(600)
    const mockGit = createMockGitAbstraction({
      success: false,
      hasConflicts: true,
      conflicts: [{ filePath: 'test.md', localContent: longContent, remoteContent: longContent, baseContent: longContent }],
    })

    const mockEventBus = createMockEventBus()

    const manager = new SyncManager(
      { workspaceDir: '/tmp/test-ws' },
      createMockFileManager() as unknown as import('../../../../src/main/services/file-manager').FileManager,
      mockGit as unknown as import('../../../../src/main/services/git-abstraction').GitAbstraction,
      { isOnline: () => true },
      undefined,
      mockEventBus as unknown as AppEventBus,
    )

    await manager.forceSync()

    const call = mockEventBus.emitEvent.mock.calls[0][0]
    expect(call.payload.conflicts[0].localPreview.length).toBe(500)
    expect(call.payload.conflicts[0].remotePreview.length).toBe(500)
    expect(call.payload.conflicts[0].basePreview.length).toBe(500)
  })

  it('preserves original emit alongside eventBus emission', async () => {
    const conflictData = { filePath: 'test.md', localContent: 'a', remoteContent: 'b', baseContent: '' }
    const mockGit = createMockGitAbstraction({
      success: false,
      hasConflicts: true,
      conflicts: [conflictData],
    })

    const mockEventBus = createMockEventBus()
    const conflictListener = vi.fn()

    const manager = new SyncManager(
      { workspaceDir: '/tmp/test-ws' },
      createMockFileManager() as unknown as import('../../../../src/main/services/file-manager').FileManager,
      mockGit as unknown as import('../../../../src/main/services/git-abstraction').GitAbstraction,
      { isOnline: () => true },
      undefined,
      mockEventBus as unknown as AppEventBus,
    )

    manager.on('sync:conflict', conflictListener)
    await manager.forceSync()

    expect(conflictListener).toHaveBeenCalledOnce()
    expect(mockEventBus.emitEvent).toHaveBeenCalledOnce()
  })
})
