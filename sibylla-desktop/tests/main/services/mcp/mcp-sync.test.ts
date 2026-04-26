import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { McpSyncManager } from '../../../../src/main/services/mcp/mcp-sync'
import type { MCPClient } from '../../../../src/main/services/mcp/mcp-client'
import type { MCPRegistry } from '../../../../src/main/services/mcp/mcp-registry'
import type { FileManager } from '../../../../src/main/services/file-manager'
import type { SyncTaskConfig, SyncState, SyncProgress } from '../../../../src/main/services/mcp/types'

// ─── Module Mocks ───

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  promises: {
    readFile: vi.fn().mockResolvedValue('[]'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../../../../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../../../../src/main/services/mcp/sync-data-transformer', () => ({
  SyncDataTransformer: class {
    transform(data: unknown, _template?: string): string {
      return typeof data === 'string' ? data : JSON.stringify(data)
    }
    resolveTargetPath(template: string, _now: Date): string {
      return template
    }
  },
}))

// ─── Helpers ───

function createMockClient(): MCPClient {
  return {
    callTool: vi.fn().mockResolvedValue({
      content: JSON.stringify({ items: [{ id: 1 }, { id: 2 }] }),
      isError: false,
    }),
  } as unknown as MCPClient
}

function createMockRegistry(): MCPRegistry {
  return {
    listServers: vi.fn().mockReturnValue([
      { name: 'github-server', state: 'connected', toolCount: 3 },
    ]),
    getTool: vi.fn().mockReturnValue({
      name: 'list_issues',
      description: 'List GitHub issues',
      inputSchema: {},
      serverName: 'github-server',
    }),
  } as unknown as MCPRegistry
}

function createMockFileManager(): FileManager {
  return {
    readFile: vi.fn().mockResolvedValue({ content: '' }),
    writeFile: vi.fn().mockResolvedValue(undefined),
  } as unknown as FileManager
}

function makeTaskConfig(overrides: Partial<SyncTaskConfig> = {}): SyncTaskConfig {
  return {
    id: 'task-001',
    name: 'GitHub Issues Sync',
    serverName: 'github-server',
    toolName: 'list_issues',
    args: { repo: 'test/repo' },
    intervalMinutes: 5,
    targetPath: 'docs/issues.md',
    writeMode: 'replace',
    conflictStrategy: 'last-write-wins',
    enabled: true,
    ...overrides,
  }
}

// ─── Test Suite ───

describe('McpSyncManager', () => {
  let manager: McpSyncManager
  let client: MCPClient
  let registry: MCPRegistry
  let fileManager: FileManager
  let onProgress: ReturnType<typeof vi.fn>

  const statePath = '/tmp/.sibylla/mcp/sync-state.json'
  const tasksPath = '/tmp/.sibylla/mcp/sync-tasks.json'

  beforeEach(() => {
    vi.useFakeTimers()
    client = createMockClient()
    registry = createMockRegistry()
    fileManager = createMockFileManager()
    onProgress = vi.fn()
    manager = new McpSyncManager(client, registry, fileManager, statePath, tasksPath, onProgress)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ─── Test 1: initialize() correctly loads tasks and states ───

  describe('initialize()', () => {
    it('correctly loads tasks and states from persisted files', async () => {
      const fs = await import('fs')
      const existsSyncMock = vi.mocked(fs.existsSync)
      const readFileMock = vi.mocked(fs.promises.readFile)

      const tasks: SyncTaskConfig[] = [
        makeTaskConfig({ id: 'task-a', enabled: true, intervalMinutes: 10 }),
        makeTaskConfig({ id: 'task-b', enabled: false, intervalMinutes: 5 }),
      ]
      const states: SyncState[] = [
        { taskId: 'task-a', lastSyncAt: null, cursor: null, errorCount: 0, status: 'active', totalSyncedItems: 0 },
        { taskId: 'task-b', lastSyncAt: null, cursor: null, errorCount: 0, status: 'active', totalSyncedItems: 0 },
      ]

      existsSyncMock.mockReturnValue(true)
      readFileMock
        .mockResolvedValueOnce(JSON.stringify(tasks))
        .mockResolvedValueOnce(JSON.stringify(states))

      await manager.initialize()

      const listed = manager.listTasks()
      expect(listed).toHaveLength(2)
      expect(listed[0]!.task.id).toBe('task-a')
      expect(listed[1]!.task.id).toBe('task-b')
      expect(listed[0]!.state.status).toBe('active')
    })
  })

  // ─── Test 2: addTask() validates server connection and tool existence ───

  describe('addTask() validation', () => {
    it('throws if server is not connected', async () => {
      vi.mocked(registry.listServers).mockReturnValue([
        { name: 'github-server', state: 'disconnected', toolCount: 0 },
      ])

      const task = makeTaskConfig()
      await expect(manager.addTask(task)).rejects.toThrow('server "github-server" is not connected')
    })

    it('throws if server does not exist', async () => {
      vi.mocked(registry.listServers).mockReturnValue([])

      const task = makeTaskConfig()
      await expect(manager.addTask(task)).rejects.toThrow('server "github-server" is not connected')
    })

    it('throws if tool is not found on server', async () => {
      vi.mocked(registry.getTool).mockReturnValue(null)

      const task = makeTaskConfig()
      await expect(manager.addTask(task)).rejects.toThrow('tool "list_issues" not found on server "github-server"')
    })
  })

  // ─── Test 3: addTask() creates initial SyncState ───

  describe('addTask() initial state', () => {
    it('creates initial SyncState with lastSyncAt=null, errorCount=0', async () => {
      const task = makeTaskConfig()
      await manager.addTask(task)

      const listed = manager.listTasks()
      expect(listed).toHaveLength(1)

      const { state } = listed[0]!
      expect(state.taskId).toBe('task-001')
      expect(state.lastSyncAt).toBeNull()
      expect(state.cursor).toBeNull()
      expect(state.errorCount).toBe(0)
      expect(state.status).toBe('active')
      expect(state.totalSyncedItems).toBe(0)
    })
  })

  // ─── Test 4: triggerSync() correctly executes ───

  describe('triggerSync()', () => {
    it('correctly calls MCPClient and FileManager, returns success progress', async () => {
      const task = makeTaskConfig()
      await manager.addTask(task)

      const result = await manager.triggerSync('task-001')

      expect(result.status).toBe('success')
      expect(result.taskId).toBe('task-001')
      expect(result.taskName).toBe('GitHub Issues Sync')
      expect(result.itemsSynced).toBe(2) // { items: [{id:1},{id:2}] }
      expect(result.durationMs).toBeGreaterThanOrEqual(0)

      // Verify MCP client was called with correct args
      expect(client.callTool).toHaveBeenCalledWith(
        'github-server',
        'list_issues',
        expect.objectContaining({ repo: 'test/repo' }),
      )

      // Verify file was written
      expect(fileManager.writeFile).toHaveBeenCalled()

      // Verify onProgress was called with running and success
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'running' }),
      )
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'success', itemsSynced: 2 }),
      )
    })
  })

  // ─── Test 5: triggerSync() concurrency guard ───

  describe('triggerSync() concurrency guard', () => {
    it('returns error status when sync is already running for the same task', async () => {
      const task = makeTaskConfig()
      await manager.addTask(task)

      // Make callTool hang to simulate an in-progress sync
      let resolveCallTool: (value: unknown) => void
      vi.mocked(client.callTool).mockImplementation(
        () => new Promise((resolve) => { resolveCallTool = resolve }),
      )

      // Start first sync (it will hang)
      const firstSync = manager.triggerSync('task-001')

      // Start second sync immediately — should be blocked by concurrency guard
      const secondResult = await manager.triggerSync('task-001')

      expect(secondResult.status).toBe('error')
      expect(secondResult.error).toBe('Sync already running for this task')
      expect(secondResult.itemsSynced).toBe(0)

      // Resolve the first sync so it doesn't leak
      resolveCallTool!({
        content: JSON.stringify({ items: [] }),
        isError: false,
      })
      await firstSync
    })
  })

  // ─── Test 6: Timer scheduling correct ───

  describe('timer scheduling', () => {
    it('schedules setInterval with intervalMs = intervalMinutes * 60000', async () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval')

      const task = makeTaskConfig({ intervalMinutes: 10 })
      await manager.addTask(task)

      const expectedMs = 10 * 60 * 1000 // 600000 ms
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), expectedMs)

      setIntervalSpy.mockRestore()
    })

    it('does not schedule timer when intervalMinutes is 0 (manual only)', async () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval')

      const task = makeTaskConfig({ intervalMinutes: 0 })
      await manager.addTask(task)

      // setInterval may have been called for other reasons, but not for this task's interval
      // The implementation skips startTimer when intervalMinutes === 0
      const callsAfterAdd = setIntervalSpy.mock.calls.length
      // Since beforeEach creates fresh manager, there should be no interval calls
      expect(callsAfterAdd).toBe(0)

      setIntervalSpy.mockRestore()
    })
  })

  // ─── Test 7: Manual trigger correct ───

  describe('manual trigger', () => {
    it('triggerSync works directly without timer dependency', async () => {
      const task = makeTaskConfig({ intervalMinutes: 0 }) // manual only
      await manager.addTask(task)

      const result = await manager.triggerSync('task-001')

      expect(result.status).toBe('success')
      expect(result.itemsSynced).toBe(2)
      expect(client.callTool).toHaveBeenCalledTimes(1)
    })
  })

  // ─── Test 8: Consecutive 3 failures pause task ───

  describe('error tolerance: auto-pause after 3 consecutive failures', () => {
    it('sets status to error and clears timer after 3 consecutive failures', async () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval')

      const task = makeTaskConfig({ intervalMinutes: 5 })
      await manager.addTask(task)

      // Make callTool always fail
      vi.mocked(client.callTool).mockRejectedValue(new Error('API rate limited'))

      // Trigger 3 syncs — each should fail
      await manager.triggerSync('task-001')
      await manager.triggerSync('task-001')
      await manager.triggerSync('task-001')

      const listed = manager.listTasks()
      const state = listed[0]!.state

      expect(state.status).toBe('error')
      expect(state.errorCount).toBe(3)
      expect(state.lastError).toBe('API rate limited')

      // Timer should have been cleared
      expect(clearIntervalSpy).toHaveBeenCalled()

      // onProgress should have been called with the auto-pause error message
      expect(onProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'error',
          error: expect.stringContaining('3'),
        }),
      )

      clearIntervalSpy.mockRestore()
    })
  })

  // ─── Test 9: pauseTask() / resumeTask() state transitions ───

  describe('pauseTask() / resumeTask()', () => {
    it('pauseTask sets status to paused and stops timer', async () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval')

      const task = makeTaskConfig({ intervalMinutes: 5 })
      await manager.addTask(task)

      await manager.pauseTask('task-001')

      const listed = manager.listTasks()
      expect(listed[0]!.state.status).toBe('paused')
      expect(clearIntervalSpy).toHaveBeenCalled()

      clearIntervalSpy.mockRestore()
    })

    it('resumeTask resets errorCount and sets status to active', async () => {
      const task = makeTaskConfig({ intervalMinutes: 5 })
      await manager.addTask(task)

      // Simulate error state
      vi.mocked(client.callTool).mockRejectedValue(new Error('fail'))
      await manager.triggerSync('task-001')
      await manager.triggerSync('task-001')
      await manager.triggerSync('task-001')

      // State should be 'error' now
      let listed = manager.listTasks()
      expect(listed[0]!.state.status).toBe('error')
      expect(listed[0]!.state.errorCount).toBe(3)

      // Resume
      await manager.resumeTask('task-001')

      listed = manager.listTasks()
      expect(listed[0]!.state.status).toBe('active')
      expect(listed[0]!.state.errorCount).toBe(0)
      expect(listed[0]!.state.lastError).toBeUndefined()
    })

    it('pauseTask throws for non-existent task', async () => {
      await expect(manager.pauseTask('non-existent')).rejects.toThrow('state for task "non-existent" not found')
    })

    it('resumeTask throws for non-existent task', async () => {
      await expect(manager.resumeTask('non-existent')).rejects.toThrow('state for task "non-existent" not found')
    })
  })

  // ─── Test 10: shutdown() cleans up properly ───

  describe('shutdown()', () => {
    it('clears all timers and persists state', async () => {
      const fs = await import('fs')
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval')
      const writeFileMock = vi.mocked(fs.promises.writeFile)

      const task1 = makeTaskConfig({ id: 'task-a', intervalMinutes: 5 })
      const task2 = makeTaskConfig({ id: 'task-b', intervalMinutes: 10 })

      await manager.addTask(task1)
      await manager.addTask(task2)

      // Clear the write call count from addTask persists
      writeFileMock.mockClear()

      await manager.shutdown()

      // Timers should be cleared (at least 2 clearInterval calls for 2 tasks)
      expect(clearIntervalSpy).toHaveBeenCalled()

      // State should have been persisted (writeFile called for tasks + states temp files)
      expect(writeFileMock).toHaveBeenCalled()

      clearIntervalSpy.mockRestore()
    })

    it('waits for active runs before persisting (up to timeout)', async () => {
      const task = makeTaskConfig({ intervalMinutes: 0 })
      await manager.addTask(task)

      // Make callTool hang
      let resolveCallTool: (value: unknown) => void
      vi.mocked(client.callTool).mockImplementation(
        () => new Promise((resolve) => { resolveCallTool = resolve }),
      )

      // Start a sync (will hang)
      const syncPromise = manager.triggerSync('task-001')

      // Start shutdown — it will wait for active runs
      const shutdownPromise = manager.shutdown()

      // Advance timers past the 100ms polling interval
      await vi.advanceTimersByTimeAsync(200)

      // Resolve the sync
      resolveCallTool!({
        content: JSON.stringify({ items: [] }),
        isError: false,
      })
      await syncPromise

      // Advance remaining shutdown polling
      await vi.advanceTimersByTimeAsync(200)

      await shutdownPromise
    })
  })

  // ─── Test 11: Incremental params built from lastSyncAt ───

  describe('incremental sync: lastSyncAt → args.since', () => {
    it('includes since ISO string when lastSyncAt is set', async () => {
      const task = makeTaskConfig()
      await manager.addTask(task)

      // First sync to set lastSyncAt
      await manager.triggerSync('task-001')

      vi.mocked(client.callTool).mockClear()

      // Second sync should include 'since' param
      await manager.triggerSync('task-001')

      const callArgs = vi.mocked(client.callTool).mock.calls[0]!
      const mergedArgs = callArgs[2] as Record<string, unknown>

      expect(mergedArgs.since).toBeDefined()
      expect(typeof mergedArgs.since).toBe('string')
      // Should be a valid ISO date string
      expect(new Date(mergedArgs.since as string).toISOString()).toBe(mergedArgs.since)
    })

    it('does not include since on first sync (lastSyncAt is null)', async () => {
      const task = makeTaskConfig()
      await manager.addTask(task)

      await manager.triggerSync('task-001')

      const callArgs = vi.mocked(client.callTool).mock.calls[0]!
      const mergedArgs = callArgs[2] as Record<string, unknown>

      expect(mergedArgs.since).toBeUndefined()
    })
  })

  // ─── Test 12: Incremental params built from cursor ───

  describe('incremental sync: cursor → args.cursor', () => {
    it('includes cursor when result contains cursor field', async () => {
      const task = makeTaskConfig()
      await manager.addTask(task)

      // First sync returns a cursor
      vi.mocked(client.callTool).mockResolvedValueOnce({
        content: JSON.stringify({ items: [{ id: 1 }], cursor: 'page-2-token' }),
        isError: false,
      })

      await manager.triggerSync('task-001')

      // Verify state has cursor
      const listedAfterFirst = manager.listTasks()
      expect(listedAfterFirst[0]!.state.cursor).toBe('page-2-token')

      // Second sync should include cursor in args
      vi.mocked(client.callTool).mockResolvedValueOnce({
        content: JSON.stringify({ items: [{ id: 3 }], cursor: 'page-3-token' }),
        isError: false,
      })

      await manager.triggerSync('task-001')

      const secondCallArgs = vi.mocked(client.callTool).mock.calls[1]!
      const mergedArgs = secondCallArgs[2] as Record<string, unknown>

      expect(mergedArgs.cursor).toBe('page-2-token')
    })

    it('includes next_cursor as cursor when result uses next_cursor field', async () => {
      const task = makeTaskConfig()
      await manager.addTask(task)

      // Return result with next_cursor
      vi.mocked(client.callTool).mockResolvedValueOnce({
        content: JSON.stringify({ items: [{ id: 1 }], next_cursor: 'nc-abc123' }),
        isError: false,
      })

      await manager.triggerSync('task-001')

      const listed = manager.listTasks()
      expect(listed[0]!.state.cursor).toBe('nc-abc123')
    })

    it('sets cursor to null when result has no cursor field', async () => {
      const task = makeTaskConfig()
      await manager.addTask(task)

      // Return result without cursor
      vi.mocked(client.callTool).mockResolvedValueOnce({
        content: JSON.stringify({ items: [{ id: 1 }] }),
        isError: false,
      })

      await manager.triggerSync('task-001')

      const listed = manager.listTasks()
      expect(listed[0]!.state.cursor).toBeNull()
    })
  })

  // ─── Additional edge case tests ───

  describe('removeTask()', () => {
    it('removes task and its state', async () => {
      const task = makeTaskConfig()
      await manager.addTask(task)
      expect(manager.listTasks()).toHaveLength(1)

      await manager.removeTask('task-001')
      expect(manager.listTasks()).toHaveLength(0)
    })
  })

  describe('updateTask()', () => {
    it('updates task config with partial patch', async () => {
      const task = makeTaskConfig({ intervalMinutes: 5 })
      await manager.addTask(task)

      await manager.updateTask('task-001', { intervalMinutes: 15 })

      const listed = manager.listTasks()
      expect(listed[0]!.task.intervalMinutes).toBe(15)
    })

    it('throws for non-existent task', async () => {
      await expect(manager.updateTask('missing', { intervalMinutes: 1 })).rejects.toThrow('task "missing" not found')
    })
  })

  describe('triggerSync() with append write mode', () => {
    it('appends to existing file content', async () => {
      const task = makeTaskConfig({ writeMode: 'append' })
      await manager.addTask(task)

      vi.mocked(fileManager.readFile).mockResolvedValue({ content: '# Existing content' } as never)

      await manager.triggerSync('task-001')

      expect(fileManager.writeFile).toHaveBeenCalledWith(
        'docs/issues.md',
        expect.stringContaining('# Existing content'),
      )
    })
  })

  describe('triggerSync() with MCP tool error', () => {
    it('handles isError flag from tool result', async () => {
      const task = makeTaskConfig()
      await manager.addTask(task)

      vi.mocked(client.callTool).mockResolvedValue({
        content: 'Something went wrong',
        isError: true,
      })

      const result = await manager.triggerSync('task-001')
      expect(result.status).toBe('error')
      expect(result.error).toContain('MCP tool returned error')
    })
  })
})
