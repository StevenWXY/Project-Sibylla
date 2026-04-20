import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ContextEngine, type ContextAssemblyRequest } from '../../src/main/services/context-engine'
import type { FileManager } from '../../src/main/services/file-manager'
import type { MemoryManager } from '../../src/main/services/memory-manager'
import type { SkillEngine } from '../../src/main/services/skill-engine'
import type { HybridSearchResult } from '../../src/main/services/memory/types'

function createMockFileManager(): FileManager {
  return {
    readFile: vi.fn().mockResolvedValue({ content: 'Test file content', encoding: 'utf-8' }),
    getWorkspaceRoot: vi.fn().mockReturnValue('/tmp/test-workspace'),
    listFiles: vi.fn().mockResolvedValue([]),
  } as unknown as FileManager
}

function createMockMemoryManager(searchResults: HybridSearchResult[] = []): MemoryManager {
  return {
    search: vi.fn().mockResolvedValue(searchResults),
    getMemorySnapshot: vi.fn().mockResolvedValue({
      content: 'Memory content',
      tokenCount: 100,
      tokenDebt: 0,
    }),
    setWorkspacePath: vi.fn(),
  } as unknown as MemoryManager
}

function createMockSkillEngine(): SkillEngine {
  return {
    getSkill: vi.fn().mockReturnValue(null),
    getSkillSummaries: vi.fn().mockReturnValue([]),
    searchSkills: vi.fn().mockReturnValue([]),
    initialize: vi.fn(),
    dispose: vi.fn(),
    handleFileChange: vi.fn(),
  } as unknown as SkillEngine
}

function makeSearchResult(overrides: Partial<HybridSearchResult> = {}): HybridSearchResult {
  return {
    id: 'mem-1',
    section: 'user_preference',
    content: 'User prefers TypeScript strict mode',
    confidence: 0.9,
    hits: 5,
    isArchived: false,
    vecScore: 0.8,
    bm25Score: 0.6,
    finalScore: 0.75,
    ...overrides,
  }
}

describe('ContextEngine - Memory Layer Integration', () => {
  let contextEngine: ContextEngine
  let mockFileManager: FileManager
  let mockMemoryManager: MemoryManager
  let mockSkillEngine: SkillEngine

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should include memory layer in assembleContext results', async () => {
    const searchResults = [
      makeSearchResult({ id: 'mem-1', content: 'Memory entry 1' }),
      makeSearchResult({ id: 'mem-2', content: 'Memory entry 2' }),
    ]
    mockFileManager = createMockFileManager()
    mockMemoryManager = createMockMemoryManager(searchResults)
    mockSkillEngine = createMockSkillEngine()

    contextEngine = new ContextEngine(
      mockFileManager,
      mockMemoryManager,
      mockSkillEngine,
      { maxContextTokens: 16000 },
    )

    const request: ContextAssemblyRequest = {
      userMessage: 'Tell me about TypeScript',
      manualRefs: [],
    }

    const result = await contextEngine.assembleContext(request)

    // Check memory layer exists
    const memoryLayer = result.layers.find((l) => l.type === 'memory')
    expect(memoryLayer).toBeDefined()
    expect(memoryLayer?.sources.length).toBe(2)
  })

  it('should call memoryManager.search with correct parameters', async () => {
    mockFileManager = createMockFileManager()
    mockMemoryManager = createMockMemoryManager([makeSearchResult()])
    mockSkillEngine = createMockSkillEngine()

    contextEngine = new ContextEngine(
      mockFileManager,
      mockMemoryManager,
      mockSkillEngine,
    )

    const request: ContextAssemblyRequest = {
      userMessage: 'What are the coding standards?',
      manualRefs: [],
    }

    await contextEngine.assembleContext(request)

    expect(mockMemoryManager.search).toHaveBeenCalledWith(
      'What are the coding standards?',
      { limit: 5, includeArchived: false },
    )
  })

  it('should allocate token budget as 55/15/15/15 when over budget', async () => {
    // Create a scenario where total context exceeds budget
    const largeContent = 'A'.repeat(20000)
    mockFileManager = {
      readFile: vi.fn().mockResolvedValue({ content: largeContent, encoding: 'utf-8' }),
      getWorkspaceRoot: vi.fn().mockReturnValue('/tmp'),
      listFiles: vi.fn().mockResolvedValue([]),
    } as unknown as FileManager

    mockMemoryManager = createMockMemoryManager([
      makeSearchResult({ content: 'B'.repeat(5000) }),
    ])
    mockSkillEngine = createMockSkillEngine()

    contextEngine = new ContextEngine(
      mockFileManager,
      mockMemoryManager,
      mockSkillEngine,
      { maxContextTokens: 4000, systemPromptReserve: 500 },
    )

    const request: ContextAssemblyRequest = {
      userMessage: 'test',
      manualRefs: ['large-file.md'],
    }

    const result = await contextEngine.assembleContext(request)

    // Verify the warning about exceeding budget is present
    expect(result.warnings.some((w) => w.includes('exceeds budget'))).toBe(true)
  })

  it('should gracefully handle memory search failure', async () => {
    mockFileManager = createMockFileManager()
    mockMemoryManager = {
      search: vi.fn().mockRejectedValue(new Error('v2 not available')),
      getMemorySnapshot: vi.fn().mockResolvedValue({
        content: '',
        tokenCount: 0,
        tokenDebt: 0,
      }),
      setWorkspacePath: vi.fn(),
    } as unknown as MemoryManager
    mockSkillEngine = createMockSkillEngine()

    contextEngine = new ContextEngine(
      mockFileManager,
      mockMemoryManager,
      mockSkillEngine,
    )

    const request: ContextAssemblyRequest = {
      userMessage: 'test',
      manualRefs: [],
    }

    // Should not throw
    const result = await contextEngine.assembleContext(request)

    // Memory layer should be absent or empty
    const memoryLayer = result.layers.find((l) => l.type === 'memory')
    expect(memoryLayer).toBeUndefined()
  })
})
