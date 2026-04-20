import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
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
  snapshot: vi.fn(),
  update: vi.fn(),
  flush: vi.fn(),
  queryDailyLog: vi.fn(),
}

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

// Lazy import after mock setup
const { MemoryPanel } = await import('../../src/renderer/components/memory/MemoryPanel')

const MOCK_ENTRIES = [
  {
    id: 'entry-1',
    section: 'technical_decision' as const,
    content: 'Use TypeScript strict mode for all code',
    confidence: 0.9,
    hits: 10,
    createdAt: '2026-04-20T00:00:00Z',
    updatedAt: '2026-04-20T12:00:00Z',
    sourceLogIds: ['log-1'],
    locked: false,
    tags: ['typescript'],
  },
  {
    id: 'entry-2',
    section: 'user_preference' as const,
    content: 'User prefers dark theme',
    confidence: 0.7,
    hits: 3,
    createdAt: '2026-04-19T00:00:00Z',
    updatedAt: '2026-04-19T12:00:00Z',
    sourceLogIds: ['log-2'],
    locked: true,
    tags: ['ui'],
  },
  {
    id: 'entry-3',
    section: 'common_issue' as const,
    content: 'Hot reload breaks when editing shared types',
    confidence: 0.6,
    hits: 7,
    createdAt: '2026-04-18T00:00:00Z',
    updatedAt: '2026-04-18T12:00:00Z',
    sourceLogIds: ['log-3'],
    locked: false,
    tags: ['build'],
  },
]

describe('MemoryPanel', () => {
  beforeEach(() => {
    useMemoryStore.getState().reset()
    vi.clearAllMocks()

    // Default mock responses
    mockMemoryAPI.listEntries.mockResolvedValue({
      success: true,
      data: MOCK_ENTRIES,
      timestamp: Date.now(),
    })
    mockMemoryAPI.listArchived.mockResolvedValue({
      success: true,
      data: [],
      timestamp: Date.now(),
    })
    mockMemoryAPI.getStats.mockResolvedValue({
      success: true,
      data: { totalTokens: 5000, entryCount: 3, lastCheckpoint: '2026-04-20T10:00:00Z', sections: {} },
      timestamp: Date.now(),
    })
    mockMemoryAPI.getConfig.mockResolvedValue({
      success: true,
      data: { checkpointInterval: 7200000, interactionThreshold: 50, extractorModel: 'claude-haiku', searchWeights: { keyword: 0.4, semantic: 0.6 }, compressionThreshold: 12000, embeddingProvider: 'local' },
      timestamp: Date.now(),
    })
  })

  it('renders empty state when no entries', async () => {
    mockMemoryAPI.listEntries.mockResolvedValue({
      success: true,
      data: [],
      timestamp: Date.now(),
    })

    render(React.createElement(MemoryPanel))

    // Wait for async load
    await vi.waitFor(() => {
      expect(screen.getByText('暂无精选记忆')).toBeDefined()
    })
  })

  it('renders sections with entries after loading', async () => {
    render(React.createElement(MemoryPanel))

    await vi.waitFor(() => {
      expect(screen.getByText('技术决策')).toBeDefined()
      expect(screen.getByText('用户偏好')).toBeDefined()
      expect(screen.getByText('常见问题')).toBeDefined()
    })
  })

  it('renders token usage bar', async () => {
    render(React.createElement(MemoryPanel))

    await vi.waitFor(() => {
      expect(screen.getByText('Token 用量')).toBeDefined()
      expect(screen.getByText(/5,000/)).toBeDefined()
    })
  })

  it('renders checkpoint action button', async () => {
    render(React.createElement(MemoryPanel))

    await vi.waitFor(() => {
      expect(screen.getByText('立即检查')).toBeDefined()
    })
  })
})
