import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { McpSyncManager } from '../../../../src/main/services/mcp/mcp-sync'
import type { MCPClient } from '../../../../src/main/services/mcp/mcp-client'
import type { MCPRegistry } from '../../../../src/main/services/mcp/mcp-registry'
import type { FileManager } from '../../../../src/main/services/file-manager'
import type { SyncTaskConfig, SyncState } from '../../../../src/main/services/mcp/types'
import * as fs from 'fs'

// ─── Module mocks ───

vi.mock('fs', () => ({
  ...vi.importActual('fs'),
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    promises: {
      readFile: vi.fn().mockResolvedValue('[]'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
    },
  },
  existsSync: vi.fn().mockReturnValue(false),
  promises: {
    readFile: vi.fn().mockResolvedValue('[]'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
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

// ─── Helper factories ───

function createMockClient(): MCPClient {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    callTool: vi.fn().mockResolvedValue({
      content: JSON.stringify({ items: [{ id: 1, title: 'item-1' }] }),
      isError: false,
    }),
    getTools: vi.fn().mockReturnValue([]),
    getCachedTools: vi.fn().mockReturnValue([]),
    onServerEvent: vi.fn(),
    removeServerEventHandler: vi.fn(),
    dispose: vi.fn().mockResolvedValue(undefined),
  } as unknown as MCPClient
}

function createMockRegistry(): MCPRegistry {
  return {
    listServers: vi.fn().mockReturnValue([
      { name: 'test-server', state: 'connected' },
    ]),
    getTool: vi.fn().mockReturnValue({
      name: 'fetch-data',
      description: 'Fetch data',
      inputSchema: {},
      serverName: 'test-server',
    }),
    addServer: vi.fn(),
    removeServer: vi.fn(),
  } as unknown as MCPRegistry
}

function createMockFileManager(): FileManager {
  return {
    readFile: vi.fn().mockResolvedValue({ content: '', metadata: {} }),
    writeFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    listFiles: vi.fn().mockResolvedValue([]),
    exists: vi.fn().mockResolvedValue(false),
  } as unknown as FileManager
}

function makeTaskConfig(overrides?: Partial<SyncTaskConfig>): SyncTaskConfig {
  return {
    id: 'task-1',
    name: 'Test Sync Task',
    serverName: 'test-server',
    toolName: 'fetch-data',
    args: {},
    intervalMinutes: 0, // manual only — no timers to worry about
    targetPath: '/tmp/sync-output.md',
    writeMode: 'replace',
    conflictStrategy: 'last-write-wins',
    enabled: true,
    ...overrides,
  }
}

const STATE_PATH = '/tmp/.sibylla/mcp/sync-state.json'
const TASKS_PATH = '/tmp/.sibylla/mcp/sync-tasks.json'

// ─── Tests ───

describe('McpSyncManager — state persistence', () => {
  let manager: McpSyncManager
  let client: MCPClient
  let registry: MCPRegistry
  let fileManager: FileManager

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()

    // Default: fs.existsSync returns false (no pre-existing state files)
    ;(fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false)
    ;(fs.promises.writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    ;(fs.promises.rename as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    ;(fs.promises.mkdir as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    ;(fs.promises.readFile as ReturnType<typeof vi.fn>).mockResolvedValue('[]')

    client = createMockClient()
    registry = createMockRegistry()
    fileManager = createMockFileManager()

    manager = new McpSyncManager(
      client,
      registry,
      fileManager,
      STATE_PATH,
      TASKS_PATH,
    )
  })

  afterEach(async () => {
    await manager.shutdown()
    vi.useRealTimers()
  })

  // ─── Test 1 ───
  it('persists state to sync-state.json after adding a task', async () => {
    const task = makeTaskConfig()
    await manager.addTask(task)

    // persistState does atomic writes: first to .tmp, then rename to final path
    const writeFileCalls = (fs.promises.writeFile as ReturnType<typeof vi.fn>).mock.calls

    // Expect at least one writeFile call targeting the state .tmp path
    const stateWriteCall = writeFileCalls.find(
      (call: unknown[]) => (call[0] as string) === STATE_PATH + '.tmp',
    )
    expect(stateWriteCall).toBeDefined()

    // Parse the written JSON and verify SyncState structure
    const writtenJson = JSON.parse(stateWriteCall![1] as string) as SyncState[]
    expect(writtenJson).toHaveLength(1)

    const persisted = writtenJson[0]!
    expect(persisted.taskId).toBe('task-1')
    expect(persisted.lastSyncAt).toBeNull()
    expect(persisted.cursor).toBeNull()
    expect(persisted.errorCount).toBe(0)
    expect(persisted.status).toBe('active')
    expect(persisted.totalSyncedItems).toBe(0)

    // Verify rename was called to move .tmp → final path (atomic write)
    const renameCalls = (fs.promises.rename as ReturnType<typeof vi.fn>).mock.calls
    const stateRename = renameCalls.find(
      (call: unknown[]) =>
        (call[0] as string) === STATE_PATH + '.tmp' &&
        (call[1] as string) === STATE_PATH,
    )
    expect(stateRename).toBeDefined()
  })

  // ─── Test 2 ───
  it('recovers tasks and states from disk on initialize()', async () => {
    const existingTasks: SyncTaskConfig[] = [
      makeTaskConfig({ id: 'restored-1', name: 'Restored Task' }),
    ]
    const existingStates: SyncState[] = [
      {
        taskId: 'restored-1',
        lastSyncAt: 1700000000000,
        cursor: 'cursor-abc',
        errorCount: 0,
        status: 'active',
        totalSyncedItems: 42,
      },
    ]

    // fs.existsSync returns true for both state and task files
    ;(fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true)

    // readFile returns different content based on the path
    ;(fs.promises.readFile as ReturnType<typeof vi.fn>).mockImplementation(
      (filePath: string) => {
        if (filePath === TASKS_PATH) {
          return Promise.resolve(JSON.stringify(existingTasks))
        }
        if (filePath === STATE_PATH) {
          return Promise.resolve(JSON.stringify(existingStates))
        }
        return Promise.resolve('[]')
      },
    )

    await manager.initialize()

    const listed = manager.listTasks()
    expect(listed).toHaveLength(1)

    const entry = listed[0]!
    expect(entry.task.id).toBe('restored-1')
    expect(entry.task.name).toBe('Restored Task')
    expect(entry.state.taskId).toBe('restored-1')
    expect(entry.state.cursor).toBe('cursor-abc')
    expect(entry.state.lastSyncAt).toBe(1700000000000)
    expect(entry.state.totalSyncedItems).toBe(42)
  })

  // ─── Test 3 ───
  it('updates cursor after a successful sync', async () => {
    const task = makeTaskConfig({ id: 'cursor-task' })
    await manager.addTask(task)

    // Mock callTool to return data with a cursor field
    ;(client.callTool as ReturnType<typeof vi.fn>).mockResolvedValue({
      content: JSON.stringify({
        items: [{ id: 1 }],
        cursor: 'new-cursor-xyz',
      }),
      isError: false,
    })

    const progress = await manager.triggerSync('cursor-task')
    expect(progress.status).toBe('success')

    // Verify the state has the updated cursor
    const listed = manager.listTasks()
    const entry = listed.find(e => e.task.id === 'cursor-task')!
    expect(entry.state.cursor).toBe('new-cursor-xyz')

    // Also verify the persisted JSON contains the new cursor
    const writeFileCalls = (fs.promises.writeFile as ReturnType<typeof vi.fn>).mock.calls
    const lastStateWrite = [...writeFileCalls]
      .reverse()
      .find((call: unknown[]) => (call[0] as string) === STATE_PATH + '.tmp')

    expect(lastStateWrite).toBeDefined()
    const persistedStates = JSON.parse(lastStateWrite![1] as string) as SyncState[]
    const cursorState = persistedStates.find(s => s.taskId === 'cursor-task')
    expect(cursorState).toBeDefined()
    expect(cursorState!.cursor).toBe('new-cursor-xyz')
  })

  // ─── Test 4 ───
  it('increments errorCount on failures and resets on resume', async () => {
    const task = makeTaskConfig({ id: 'error-task' })
    await manager.addTask(task)

    // Mock callTool to throw an error
    ;(client.callTool as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('network timeout'),
    )

    // First failure
    const progress1 = await manager.triggerSync('error-task')
    expect(progress1.status).toBe('error')

    let entry = manager.listTasks().find(e => e.task.id === 'error-task')!
    expect(entry.state.errorCount).toBe(1)
    expect(entry.state.lastError).toBe('network timeout')

    // Second failure
    const progress2 = await manager.triggerSync('error-task')
    expect(progress2.status).toBe('error')

    entry = manager.listTasks().find(e => e.task.id === 'error-task')!
    expect(entry.state.errorCount).toBe(2)

    // Third failure — should auto-pause (MAX_CONSECUTIVE_ERRORS = 3)
    const progress3 = await manager.triggerSync('error-task')
    expect(progress3.status).toBe('error')

    entry = manager.listTasks().find(e => e.task.id === 'error-task')!
    expect(entry.state.errorCount).toBe(3)
    expect(entry.state.status).toBe('error')

    // Resume the task — errorCount should reset to 0
    await manager.resumeTask('error-task')

    entry = manager.listTasks().find(e => e.task.id === 'error-task')!
    expect(entry.state.errorCount).toBe(0)
    expect(entry.state.status).toBe('active')
    expect(entry.state.lastError).toBeUndefined()
  })

  // ─── Test 5 ───
  it('initializes with empty state when files do not exist (no crash)', async () => {
    // fs.existsSync returns false for all paths
    ;(fs.existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false)

    // initialize() should complete without error
    await expect(manager.initialize()).resolves.toBeUndefined()

    // No tasks or states should be loaded
    const listed = manager.listTasks()
    expect(listed).toEqual([])
  })
})
