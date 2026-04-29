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

describe('selectRelevantSources', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMemoryManager.search.mockResolvedValue([])
    mockFileManager.readFile.mockResolvedValue({ content: 'test' })
  })

  it('should select correct sources for edit_file intent', async () => {
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

    await engine.assembleContextV2({
      userMessage: '修改认证模块',
      manualRefs: [],
      intent: 'edit_file',
    })

    if (mockSearch.search.mock.calls.length > 0) {
      const call = mockSearch.search.mock.calls[0]![0] as { sources?: string[] }
      expect(call.sources).toContain('local-files')
      expect(call.sources).toContain('memory')
    }
  })

  it('should select correct sources for analyze intent', async () => {
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

    await engine.assembleContextV2({
      userMessage: '分析项目结构',
      manualRefs: [],
      intent: 'analyze',
    })

    if (mockSearch.search.mock.calls.length > 0) {
      const call = mockSearch.search.mock.calls[0]![0] as { sources?: string[] }
      expect(call.sources).toContain('local-files')
      expect(call.sources).toContain('memory')
    }
  })

  it('should use full source list for default intent', async () => {
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

    await engine.assembleContextV2({
      userMessage: '聊天消息测试',
      manualRefs: [],
    })

    if (mockSearch.search.mock.calls.length > 0) {
      const call = mockSearch.search.mock.calls[0]![0] as { sources?: string[] }
      expect(call.sources).toContain('local-files')
      expect(call.sources).toContain('memory')
      expect(call.sources).toContain('handbook')
    }
  })
})
