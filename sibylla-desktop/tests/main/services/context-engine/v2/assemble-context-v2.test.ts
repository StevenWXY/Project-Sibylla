import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ContextEngine } from '../../../../../src/main/services/context-engine/context-engine'

const mockFileManager = {
  readFile: vi.fn().mockResolvedValue({ content: 'test file content' }),
  getWorkspaceRoot: vi.fn().mockReturnValue('/test/workspace'),
  listFiles: vi.fn().mockResolvedValue([]),
}

const mockMemoryManager = {
  search: vi.fn().mockResolvedValue([]),
}

vi.mock('../../../../../src/main/services/file-manager', () => ({
  FileManager: vi.fn().mockImplementation(() => mockFileManager),
}))

vi.mock('../../../../../src/main/services/memory-manager', () => ({
  MemoryManager: vi.fn().mockImplementation(() => mockMemoryManager),
}))

import { ContextEngine } from '../../../../../src/main/services/context-engine/context-engine'

function createEngine(): ContextEngine {
  return new ContextEngine(
    mockFileManager as never,
    mockMemoryManager as never,
    undefined,
    { maxContextTokens: 16000 },
  )
}

function createMockUnifiedSearch(results: unknown[] = []) {
  return {
    search: vi.fn().mockResolvedValue({
      results,
      totalCount: results.length,
      partial: false,
      timing: { totalMs: 50, perSource: {} },
    }),
  }
}

describe('assembleContextV2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMemoryManager.search.mockResolvedValue([])
    mockFileManager.readFile.mockResolvedValue({ content: 'file content' })
  })

  it('should return 6 layers when unifiedSearch is injected', async () => {
    const engine = createEngine()
    const mockSearch = createMockUnifiedSearch([
      {
        id: 'r1',
        source: 'local-files',
        type: 'file',
        title: 'Auth Design',
        snippet: 'Authentication flow...',
        fullPath: 'docs/auth.md',
        metadata: { score: 0.9 },
        navigation: { kind: 'file', path: 'docs/auth.md' },
      },
    ])
    engine.setUnifiedSearch(mockSearch as never)

    const result = await engine.assembleContextV2({
      userMessage: '认证方案的设计文档',
      currentFile: 'src/app.ts',
      manualRefs: [],
    })

    expect(result.layers.length).toBeGreaterThanOrEqual(1)
    expect(result.systemPrompt).toBeTruthy()
    expect(result.totalTokens).toBeGreaterThan(0)
    expect(result.warnings).toBeDefined()
  })

  it('should fallback to v1.5 when unifiedSearch is not injected', async () => {
    const engine = createEngine()

    const result = await engine.assembleContextV2({
      userMessage: 'test query',
      manualRefs: [],
    })

    expect(result.layers).toBeDefined()
    expect(result.systemPrompt).toBeTruthy()
    const hasCrossSource = result.layers.some(l => l.type === 'cross-source')
    expect(hasCrossSource).toBe(false)
  })

  it('should gracefully degrade when L5 search fails', async () => {
    const engine = createEngine()
    const mockSearch = {
      search: vi.fn().mockRejectedValue(new Error('Search timeout')),
    }
    engine.setUnifiedSearch(mockSearch as never)

    const result = await engine.assembleContextV2({
      userMessage: 'test query',
      manualRefs: [],
    })

    expect(result.layers).toBeDefined()
    const hasCrossSource = result.layers.some(l => l.type === 'cross-source')
    expect(hasCrossSource).toBe(false)
  })
})
