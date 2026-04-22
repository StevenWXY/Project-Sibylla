import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkspaceSearchProvider } from '../../src/main/services/datasource/providers/workspace-search-provider'
import type { LocalSearchEngine } from '../../src/main/services/local-search-engine'

function createMockSearchEngine() {
  return {
    search: vi.fn(() => [
      { id: 'test::1', path: 'test.md', snippet: 'test match', rank: -1, matchCount: 1 },
    ]),
  } as unknown as LocalSearchEngine
}

describe('WorkspaceSearchProvider', () => {
  let provider: WorkspaceSearchProvider
  let searchEngine: ReturnType<typeof createMockSearchEngine>

  beforeEach(() => {
    searchEngine = createMockSearchEngine()
    provider = new WorkspaceSearchProvider(searchEngine)
  })

  it('has correct metadata', () => {
    expect(provider.id).toBe('workspace-search')
    expect(provider.name).toBe('Workspace Search')
    expect(provider.capabilities).toEqual(['search'])
  })

  it('delegates search to LocalSearchEngine', async () => {
    const result = await provider.query({
      operation: 'search',
      params: { query: 'test', limit: 10 },
    })

    expect(searchEngine.search).toHaveBeenCalledWith({
      query: 'test',
      limit: 10,
      fileExtensions: undefined,
    })
    expect(result.data).toHaveProperty('results')
    expect(result.providerId).toBe('workspace-search')
    expect(result.fromCache).toBe(false)
  })

  it('throws for unsupported operation', async () => {
    await expect(
      provider.query({ operation: 'fetch', params: { path: 'test.md' } }),
    ).rejects.toThrow('Unsupported operation')
  })

  it('is always healthy', async () => {
    expect(await provider.isHealthy()).toBe(true)
  })

  it('initializes and disposes without error', async () => {
    await expect(provider.initialize({})).resolves.toBeUndefined()
    await expect(provider.dispose()).resolves.toBeUndefined()
  })
})
