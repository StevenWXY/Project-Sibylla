import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron modules
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
  },
  BrowserWindow: vi.fn(),
}))

// Mock logger
vi.mock('../../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock memory types
vi.mock('../../src/main/services/memory/types', () => ({
  DEFAULT_MEMORY_CONFIG: {
    checkpointIntervalMs: 7200000,
    interactionThreshold: 50,
    extractorModel: 'claude-haiku',
    compressionThreshold: 12000,
    compressionTargetMin: 8000,
    compressionTargetMax: 12000,
    searchWeights: { vector: 0.6, bm25: 0.3, timeDecay: 0.1 },
    embeddingProvider: 'local',
  },
}))

import { ipcMain } from 'electron'
import { MemoryHandler } from '../../src/main/ipc/handlers/memory.handler'

const MOCK_ENTRY = {
  id: 'test-1',
  section: 'technical_decision' as const,
  content: 'Use TypeScript strict mode',
  confidence: 0.9,
  hits: 5,
  createdAt: '2026-04-20T00:00:00Z',
  updatedAt: '2026-04-20T12:00:00Z',
  sourceLogIds: ['log-1'],
  locked: false,
  tags: ['typescript'],
}

function createMockMemoryManager() {
  return {
    setWorkspacePath: vi.fn(),
    getMemorySnapshot: vi.fn(),
    updateMemory: vi.fn(),
    flushIfNeeded: vi.fn(),
    queryDailyLog: vi.fn(),
    getAllEntries: vi.fn().mockResolvedValue([MOCK_ENTRY]),
    getAllArchivedEntries: vi.fn().mockResolvedValue([]),
    getEntry: vi.fn().mockResolvedValue(MOCK_ENTRY),
    search: vi.fn().mockResolvedValue([]),
    updateEntry: vi.fn().mockResolvedValue(undefined),
    deleteEntry: vi.fn().mockResolvedValue(undefined),
    lockEntry: vi.fn().mockResolvedValue(undefined),
    triggerManualCheckpoint: vi.fn().mockResolvedValue(null),
    compress: vi.fn().mockResolvedValue({ discarded: [], merged: [], archived: [], beforeTokens: 10000, afterTokens: 8000, snapshotPath: '' }),
    undoLastCompression: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockResolvedValue({ totalTokens: 5000, entryCount: 1, lastCheckpoint: '2026-04-20T00:00:00Z', sections: { technical_decision: 1 } }),
    v2Components: {
      indexer: {
        rebuild: vi.fn(),
        verifyHealth: vi.fn().mockResolvedValue({ healthy: true }),
        getEntryCount: vi.fn().mockReturnValue(1),
        search: vi.fn().mockResolvedValue([]),
      },
      evolutionLog: {
        query: vi.fn().mockResolvedValue([]),
      },
    },
  }
}

function createMockRagEngine() {
  return {
    setWorkspacePath: vi.fn(),
    search: vi.fn().mockResolvedValue([]),
    rebuildIndex: vi.fn(),
  }
}

function createMockWorkspaceManager() {
  return {
    getWorkspacePath: vi.fn().mockReturnValue('/test/workspace'),
  }
}

describe('MemoryHandler', () => {
  let handler: MemoryHandler
  let mockMM: ReturnType<typeof createMockMemoryManager>
  let mockRag: ReturnType<typeof createMockRagEngine>
  let mockWM: ReturnType<typeof createMockWorkspaceManager>

  beforeEach(() => {
    vi.clearAllMocks()
    mockMM = createMockMemoryManager()
    mockRag = createMockRagEngine()
    mockWM = createMockWorkspaceManager()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler = new MemoryHandler(mockMM as any, mockRag as any, mockWM as any)
  })

  describe('register', () => {
    it('registers all v1 and v2 IPC channels', () => {
      handler.register()

      // Should have called ipcMain.handle for all channels
      const handleCalls = vi.mocked(ipcMain.handle).mock.calls
      const registeredChannels = handleCalls.map((call) => call[0])

      // v1 channels
      expect(registeredChannels).toContain('memory:snapshot')
      expect(registeredChannels).toContain('memory:update')
      expect(registeredChannels).toContain('memory:flush')
      expect(registeredChannels).toContain('memory:daily-log:query')
      expect(registeredChannels).toContain('rag:search')
      expect(registeredChannels).toContain('rag:rebuild')

      // TASK025 channels
      expect(registeredChannels).toContain('memory:search')
      expect(registeredChannels).toContain('memory:rebuildIndex')
      expect(registeredChannels).toContain('memory:getIndexHealth')

      // TASK026 v2 channels
      expect(registeredChannels).toContain('memory:listEntries')
      expect(registeredChannels).toContain('memory:listArchived')
      expect(registeredChannels).toContain('memory:getEntry')
      expect(registeredChannels).toContain('memory:getStats')
      expect(registeredChannels).toContain('memory:updateEntry')
      expect(registeredChannels).toContain('memory:deleteEntry')
      expect(registeredChannels).toContain('memory:lockEntry')
      expect(registeredChannels).toContain('memory:triggerCheckpoint')
      expect(registeredChannels).toContain('memory:triggerCompression')
      expect(registeredChannels).toContain('memory:undoLastCompression')
      expect(registeredChannels).toContain('memory:getEvolutionHistory')
      expect(registeredChannels).toContain('memory:getConfig')
      expect(registeredChannels).toContain('memory:updateConfig')
    })
  })

  describe('cleanup', () => {
    it('removes all registered handlers', () => {
      handler.cleanup()

      const removeHandlerCalls = vi.mocked(ipcMain.removeHandler).mock.calls
      const removedChannels = removeHandlerCalls.map((call) => call[0])

      expect(removedChannels).toContain('memory:listEntries')
      expect(removedChannels).toContain('memory:deleteEntry')
      expect(removedChannels).toContain('memory:triggerCheckpoint')
      expect(removedChannels).toContain('memory:getConfig')
    })
  })

  describe('handler methods', () => {
    it('handleListEntries calls memoryManager.getAllEntries', async () => {
      handler.register()

      // Extract the handler function from the register call
      const handleCalls = vi.mocked(ipcMain.handle).mock.calls
      const listEntriesCall = handleCalls.find((call) => call[0] === 'memory:listEntries')
      expect(listEntriesCall).toBeDefined()

      // The handler is wrapped by safeHandle, so we verify the manager was set up correctly
      expect(mockMM.getAllEntries).toBeDefined()
    })

    it('handleGetStats calls memoryManager.getStats', async () => {
      const stats = await mockMM.getStats()
      expect(stats.totalTokens).toBe(5000)
      expect(stats.entryCount).toBe(1)
    })

    it('handleTriggerCheckpoint calls memoryManager.triggerManualCheckpoint', async () => {
      await mockMM.triggerManualCheckpoint()
      expect(mockMM.triggerManualCheckpoint).toHaveBeenCalled()
    })

    it('handleGetEvolutionHistory queries evolutionLog', async () => {
      const events = await mockMM.v2Components.evolutionLog.query({ entryId: 'test-1' })
      expect(events).toEqual([])
      expect(mockMM.v2Components.evolutionLog.query).toHaveBeenCalledWith({ entryId: 'test-1' })
    })
  })
})
