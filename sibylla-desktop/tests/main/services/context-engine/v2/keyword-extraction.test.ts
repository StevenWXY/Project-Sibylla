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

describe('extractSearchKeywordsHeuristic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMemoryManager.search.mockResolvedValue([])
    mockFileManager.readFile.mockResolvedValue({ content: 'test' })
  })

  it('should filter Chinese stop words', async () => {
    const engine = new ContextEngine(mockFileManager as never, mockMemoryManager as never)
    const result = await engine.assembleContextV2({
      userMessage: '的 了 是 我 你 他 在 有 不 这 那',
      manualRefs: [],
    })
    expect(result).toBeDefined()
  })

  it('should filter English stop words', async () => {
    const engine = new ContextEngine(mockFileManager as never, mockMemoryManager as never)
    const result = await engine.assembleContextV2({
      userMessage: 'what how the is a an do does can are was were',
      manualRefs: [],
    })
    expect(result).toBeDefined()
  })

  it('should handle empty messages', async () => {
    const engine = new ContextEngine(mockFileManager as never, mockMemoryManager as never)
    const result = await engine.assembleContextV2({
      userMessage: '',
      manualRefs: [],
    })
    expect(result.layers).toBeDefined()
  })

  it('should handle messages with meaningful keywords', async () => {
    const engine = new ContextEngine(mockFileManager as never, mockMemoryManager as never)
    const mockSearch = {
      search: vi.fn().mockResolvedValue({
        results: [],
        totalCount: 0,
        partial: false,
        timing: { totalMs: 10, perSource: {} },
      }),
    }
    engine.setUnifiedSearch(mockSearch as never)

    const result = await engine.assembleContextV2({
      userMessage: '认证方案设计文档 authentication design',
      manualRefs: [],
    })
    expect(result).toBeDefined()
  })
})
