import { describe, it, expect, vi } from 'vitest'
import { unifiedSearchTool } from '../../../../../src/main/services/harness/tools/unified-search-tool'

describe('unified_search tool', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }

  it('should return empty results when unifiedSearch is not available', async () => {
    const ctx = {
      workspaceRoot: '/test',
      sessionId: 's1',
      logger: mockLogger,
    }

    const result = await unifiedSearchTool.handler(
      { query: 'test' },
      ctx as never,
    ) as { results: unknown[]; partial: boolean; hint: string }

    expect(result.results).toEqual([])
    expect(result.partial).toBe(false)
    expect(result.hint).toContain('not available')
  })

  it('should return formatted results when unifiedSearch is available', async () => {
    const mockSearch = {
      search: vi.fn().mockResolvedValue({
        results: [
          {
            id: 'r1',
            source: 'memory',
            type: 'memory-entry',
            title: 'Team Decision',
            snippet: 'We decided to use JWT...',
            navigation: { kind: 'memory', entryId: 'e1' },
            metadata: { score: 0.95 },
          },
        ],
        totalCount: 1,
        partial: false,
      }),
    }

    const ctx = {
      workspaceRoot: '/test',
      sessionId: 's1',
      logger: mockLogger,
      unifiedSearch: mockSearch,
    }

    const result = await unifiedSearchTool.handler(
      { query: 'authentication decision' },
      ctx as never,
    ) as { results: unknown[]; partial: boolean; hint: string }

    expect(result.results).toHaveLength(1)
    expect(result.hint).toContain('Found 1')
  })

  it('should clamp limit to valid range', async () => {
    const mockSearch = {
      search: vi.fn().mockResolvedValue({
        results: [],
        totalCount: 0,
        partial: false,
      }),
    }

    const ctx = {
      workspaceRoot: '/test',
      sessionId: 's1',
      logger: mockLogger,
      unifiedSearch: mockSearch,
    }

    await unifiedSearchTool.handler(
      { query: 'test', limit: 100 },
      ctx as never,
    )

    const call = mockSearch.search.mock.calls[0]![0] as { limit: number }
    expect(call.limit).toBe(10)
  })
})
