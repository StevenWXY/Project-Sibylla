import { describe, it, expect, vi } from 'vitest'
import { McpAdapter } from '@main/services/unified-search/adapters/mcp-adapter'
import type { UnifiedSearchQuery } from '@main/services/unified-search/types'

vi.mock('@main/services/unified-search/adapters/../../utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

function createMockLocalSearch(results: Array<{ id: string; path: string; snippet: string; rank: number; matchCount: number }>) {
  return { search: vi.fn().mockReturnValue(results) }
}

function createMockFileManager(listResult: Array<{ name: string; path: string; isDirectory: boolean; size: number; modifiedTime: string; createdTime: string }>) {
  return { listFiles: vi.fn().mockResolvedValue(listResult) }
}

describe('McpAdapter', () => {
  const query: UnifiedSearchQuery = { query: 'slack message', limit: 10 }

  it('discovers sources from existing directories', async () => {
    const mockSearch = createMockLocalSearch([])
    const mockFM = createMockFileManager([
      { name: 'msg1.json', path: 'docs/logs/slack/msg1.json', isDirectory: false, size: 100, modifiedTime: '2026-01-01', createdTime: '2026-01-01' },
    ])

    const adapter = new McpAdapter(mockSearch as never, mockFM as never)
    const sources = await adapter.discoverSources()
    expect(sources).toContain('mcp:slack')
  })

  it('marks results with correct MCP source', async () => {
    const mockSearch = createMockLocalSearch([
      { id: 'a', path: 'docs/logs/slack/msg1.json', snippet: 'slack message', rank: 0.8, matchCount: 1 },
    ])
    const mockFM = createMockFileManager([
      { name: 'msg1.json', path: 'docs/logs/slack/msg1.json', isDirectory: false, size: 100, modifiedTime: '2026-01-01', createdTime: '2026-01-01' },
    ])

    const adapter = new McpAdapter(mockSearch as never, mockFM as never)
    await adapter.discoverSources()

    const results = await adapter.search(query)
    expect(results).toHaveLength(1)
    expect(results[0].source).toBe('mcp:slack')
    expect(results[0].type).toBe('mcp-record')
  })

  it('skips non-existent directories', async () => {
    const mockSearch = createMockLocalSearch([])
    const mockFM = createMockFileManager([])
    mockFM.listFiles.mockRejectedValue(new Error('Not found'))

    const adapter = new McpAdapter(mockSearch as never, mockFM as never)
    const sources = await adapter.discoverSources()
    expect(sources).toHaveLength(0)
  })
})
