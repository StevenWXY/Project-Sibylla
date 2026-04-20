import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMemoryStore } from '../../src/renderer/store/memoryStore'

// Mock window.electronAPI.memory
const mockMemoryAPI = {
  listEntries: vi.fn(),
  listArchived: vi.fn(),
  search: vi.fn(),
  getEntry: vi.fn(),
  getStats: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  lockEntry: vi.fn(),
  triggerCheckpoint: vi.fn(),
  triggerCompression: vi.fn(),
  undoLastCompression: vi.fn(),
  getEvolutionHistory: vi.fn(),
  rebuildIndex: vi.fn(),
  getIndexHealth: vi.fn(),
  getConfig: vi.fn(),
  updateConfig: vi.fn(),
  onCheckpointStarted: vi.fn(() => vi.fn()),
  onCheckpointCompleted: vi.fn(() => vi.fn()),
  onCheckpointFailed: vi.fn(() => vi.fn()),
  onEntryAdded: vi.fn(() => vi.fn()),
  onEntryUpdated: vi.fn(() => vi.fn()),
  onEntryDeleted: vi.fn(() => vi.fn()),
  // v1 methods
  snapshot: vi.fn(),
  update: vi.fn(),
  flush: vi.fn(),
  queryDailyLog: vi.fn(),
}

// Set up global mock
Object.defineProperty(globalThis, 'window', {
  value: {
    electronAPI: {
      memory: mockMemoryAPI,
      on: vi.fn(() => vi.fn()),
      off: vi.fn(),
    },
  },
  writable: true,
})

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

describe('memoryStore', () => {
  beforeEach(() => {
    useMemoryStore.getState().reset()
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('has empty entries and no loading/error', () => {
      const state = useMemoryStore.getState()
      expect(state.entries).toEqual([])
      expect(state.archivedEntries).toEqual([])
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
      expect(state.searchResults).toBeNull()
      expect(state.searchQuery).toBe('')
      expect(state.totalTokens).toBe(0)
      expect(state.isCheckpointRunning).toBe(false)
    })
  })

  describe('loadEntries', () => {
    it('loads entries from IPC and updates state', async () => {
      mockMemoryAPI.listEntries.mockResolvedValueOnce({
        success: true,
        data: [MOCK_ENTRY],
        timestamp: Date.now(),
      })

      await useMemoryStore.getState().loadEntries()

      const state = useMemoryStore.getState()
      expect(state.entries).toHaveLength(1)
      expect(state.entries[0]).toEqual(MOCK_ENTRY)
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('handles IPC error response', async () => {
      mockMemoryAPI.listEntries.mockResolvedValueOnce({
        success: false,
        error: { type: 'IPC_ERROR', message: 'Failed to load' },
        timestamp: Date.now(),
      })

      await useMemoryStore.getState().loadEntries()

      const state = useMemoryStore.getState()
      expect(state.entries).toEqual([])
      expect(state.isLoading).toBe(false)
      expect(state.error).toBe('Failed to load')
    })
  })

  describe('searchEntries', () => {
    it('calls IPC search and stores results', async () => {
      const searchResult = {
        id: 'test-1',
        section: 'technical_decision',
        content: 'Use TypeScript strict mode',
        confidence: 0.9,
        score: 0.85,
        source: 'memory',
      }

      mockMemoryAPI.search.mockResolvedValueOnce({
        success: true,
        data: [searchResult],
        timestamp: Date.now(),
      })

      await useMemoryStore.getState().searchEntries('typescript')

      const state = useMemoryStore.getState()
      expect(state.searchResults).toHaveLength(1)
      expect(state.searchQuery).toBe('typescript')
      expect(state.isLoading).toBe(false)
    })
  })

  describe('editEntry', () => {
    it('calls updateEntry IPC and reloads', async () => {
      // Pre-populate entries
      mockMemoryAPI.listEntries.mockResolvedValue({
        success: true,
        data: [MOCK_ENTRY],
        timestamp: Date.now(),
      })
      mockMemoryAPI.getStats.mockResolvedValue({
        success: true,
        data: { totalTokens: 100, entryCount: 1, lastCheckpoint: '', sections: {} },
        timestamp: Date.now(),
      })

      await useMemoryStore.getState().loadEntries()

      mockMemoryAPI.updateEntry.mockResolvedValueOnce({
        success: true,
        timestamp: Date.now(),
      })

      useMemoryStore.getState().setEditingEntry('test-1')
      await useMemoryStore.getState().editEntry('test-1', 'Updated content')

      expect(mockMemoryAPI.updateEntry).toHaveBeenCalledWith('test-1', { content: 'Updated content' })
      expect(useMemoryStore.getState().editingEntryId).toBeNull()
    })
  })

  describe('deleteEntry', () => {
    it('calls deleteEntry IPC and reloads', async () => {
      mockMemoryAPI.deleteEntry.mockResolvedValueOnce({
        success: true,
        timestamp: Date.now(),
      })
      mockMemoryAPI.listEntries.mockResolvedValue({
        success: true,
        data: [],
        timestamp: Date.now(),
      })
      mockMemoryAPI.getStats.mockResolvedValue({
        success: true,
        data: { totalTokens: 0, entryCount: 0, lastCheckpoint: '', sections: {} },
        timestamp: Date.now(),
      })

      await useMemoryStore.getState().deleteEntry('test-1')

      expect(mockMemoryAPI.deleteEntry).toHaveBeenCalledWith('test-1')
    })
  })

  describe('lockEntry', () => {
    it('locks an entry optimistically', async () => {
      // Pre-populate
      useMemoryStore.setState({ entries: [MOCK_ENTRY] })

      mockMemoryAPI.lockEntry.mockResolvedValueOnce({
        success: true,
        timestamp: Date.now(),
      })

      await useMemoryStore.getState().lockEntry('test-1', true)

      const state = useMemoryStore.getState()
      expect(state.entries[0].locked).toBe(true)
    })
  })

  describe('triggerCheckpoint', () => {
    it('sets isCheckpointRunning to true', async () => {
      mockMemoryAPI.triggerCheckpoint.mockResolvedValueOnce({
        success: true,
        data: { id: 'chk-1', trigger: 'manual', startedAt: new Date().toISOString(), status: 'running' },
        timestamp: Date.now(),
      })

      await useMemoryStore.getState().triggerCheckpoint()

      expect(useMemoryStore.getState().isCheckpointRunning).toBe(true)
    })
  })

  describe('clearSearch', () => {
    it('clears search results and query', () => {
      useMemoryStore.setState({ searchResults: [], searchQuery: 'test' })
      useMemoryStore.getState().clearSearch()

      const state = useMemoryStore.getState()
      expect(state.searchResults).toBeNull()
      expect(state.searchQuery).toBe('')
    })
  })

  describe('reset', () => {
    it('resets all state to initial values', () => {
      useMemoryStore.setState({
        entries: [MOCK_ENTRY],
        totalTokens: 1000,
        isCheckpointRunning: true,
        error: 'some error',
      })

      useMemoryStore.getState().reset()

      const state = useMemoryStore.getState()
      expect(state.entries).toEqual([])
      expect(state.totalTokens).toBe(0)
      expect(state.isCheckpointRunning).toBe(false)
      expect(state.error).toBeNull()
    })
  })
})
