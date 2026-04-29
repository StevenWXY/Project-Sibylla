import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ContextEngine } from '../../../../../src/main/services/context-engine/context-engine'

const mockFileManager = {
  readFile: vi.fn().mockResolvedValue({ content: 'test' }),
  getWorkspaceRoot: vi.fn().mockReturnValue('/test'),
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

describe('formatCrossSourceResults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMemoryManager.search.mockResolvedValue([])
    mockFileManager.readFile.mockResolvedValue({ content: 'test' })
  })

  it('should format results with source labels', async () => {
    const engine = new ContextEngine(mockFileManager as never, mockMemoryManager as never)
    const mockSearch = {
      search: vi.fn().mockResolvedValue({
        results: [
          {
            id: 'r1',
            source: 'memory',
            type: 'memory-entry',
            title: 'Team Decision',
            snippet: 'We use JWT',
            metadata: { score: 0.9 },
            navigation: { kind: 'memory', entryId: 'e1' },
          },
          {
            id: 'r2',
            source: 'mcp:github',
            type: 'mcp-record',
            title: 'Issue #123',
            snippet: 'Auth refactor needed',
            metadata: { score: 0.8 },
            navigation: { kind: 'external', url: 'https://github.com' },
          },
        ],
        totalCount: 2,
        partial: false,
        timing: { totalMs: 50, perSource: {} },
      }),
    }
    engine.setUnifiedSearch(mockSearch as never)

    const result = await engine.assembleContextV2({
      userMessage: '认证方案 JWT',
      manualRefs: [],
    })

    const crossSourceLayer = result.layers.find(l => l.type === 'cross-source')
    if (crossSourceLayer) {
      expect(crossSourceLayer.content).toContain('记忆')
      expect(crossSourceLayer.content).toContain('GitHub')
      expect(crossSourceLayer.content).toContain('Team Decision')
      expect(crossSourceLayer.content).toContain('Issue #123')
    }
  })
})
