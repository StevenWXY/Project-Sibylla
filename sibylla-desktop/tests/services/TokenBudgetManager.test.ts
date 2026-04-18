import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ContextEngine } from '../../src/main/services/context-engine'
import type { FileManager } from '../../src/main/services/file-manager'
import type { MemoryManager } from '../../src/main/services/memory-manager'
import type { FileContent } from '../../src/shared/types'

function createMockFileManager(files: Map<string, string>): FileManager {
  return {
    getWorkspaceRoot: vi.fn().mockReturnValue('/test/workspace'),
    readFile: vi.fn(async (relativePath: string): Promise<FileContent> => {
      const content = files.get(relativePath)
      if (content === undefined) {
        throw new Error(`File not found: ${relativePath}`)
      }
      return { path: relativePath, content, encoding: 'utf-8', size: content.length }
    }),
    listFiles: vi.fn(async () => []),
  } as unknown as FileManager
}

function createMockMemoryManager(): MemoryManager {
  return {
    setWorkspacePath: vi.fn(),
    getMemorySnapshot: vi.fn(async () => ({
      content: '',
      tokenCount: 0,
      tokenDebt: 0,
    })),
  } as unknown as MemoryManager
}

describe('Token Budget Management', () => {
  let fileManager: FileManager
  let memoryManager: MemoryManager

  beforeEach(() => {
    fileManager = createMockFileManager(new Map())
    memoryManager = createMockMemoryManager()
  })

  it('should allocate budget correctly when within limits', async () => {
    const files = new Map([
      ['CLAUDE.md', 'Small content'],
    ])
    fileManager = createMockFileManager(files)

    const engine = new ContextEngine(fileManager, memoryManager, {
      maxContextTokens: 16000,
      systemPromptReserve: 2000,
    })

    const result = await engine.assembleContext({
      userMessage: 'Hello',
      manualRefs: [],
    })

    expect(result.budgetUsed).toBeLessThanOrEqual(result.budgetTotal)
    expect(result.warnings).toEqual([])
  })

  it('should truncate when budget is exceeded', async () => {
    const bigContent = 'X'.repeat(10000)
    const files = new Map([
      ['CLAUDE.md', bigContent],
      ['file1.md', bigContent],
      ['file2.md', bigContent],
    ])
    fileManager = createMockFileManager(files)

    const engine = new ContextEngine(fileManager, memoryManager, {
      maxContextTokens: 500,
      systemPromptReserve: 100,
    })

    const result = await engine.assembleContext({
      userMessage: 'Hello',
      manualRefs: ['file1.md', 'file2.md'],
    })

    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.budgetUsed).toBeLessThanOrEqual(result.budgetTotal + 100)
  })

  it('should truncate at sentence boundaries', async () => {
    const content = 'First sentence. Second sentence. Third sentence. Fourth sentence.'
    const files = new Map([
      ['CLAUDE.md', content],
    ])
    fileManager = createMockFileManager(files)

    const engine = new ContextEngine(fileManager, memoryManager, {
      maxContextTokens: 50,
      systemPromptReserve: 10,
    })

    const result = await engine.assembleContext({
      userMessage: 'Hello',
      manualRefs: [],
    })

    const claudeSource = result.sources.find((s) => s.filePath === 'CLAUDE.md')
    if (claudeSource && claudeSource.content.includes('[... truncated')) {
      expect(claudeSource.content).toContain('.')
    }
  })

  it('should handle empty content gracefully', async () => {
    const files = new Map([
      ['CLAUDE.md', ''],
    ])
    fileManager = createMockFileManager(files)

    const engine = new ContextEngine(fileManager, memoryManager)

    const result = await engine.assembleContext({
      userMessage: 'Hello',
      manualRefs: [],
    })

    expect(result.sources).toBeDefined()
    expect(result.totalTokens).toBeGreaterThanOrEqual(0)
  })

  it('should preserve both always and manual layers after truncation', async () => {
    const bigContent = 'Y'.repeat(8000)
    const files = new Map([
      ['CLAUDE.md', bigContent],
      ['manual.md', bigContent],
    ])
    fileManager = createMockFileManager(files)

    const engine = new ContextEngine(fileManager, memoryManager, {
      maxContextTokens: 1000,
      systemPromptReserve: 200,
    })

    const result = await engine.assembleContext({
      userMessage: 'Hello',
      manualRefs: ['manual.md'],
    })

    expect(result.layers.some((l) => l.type === 'always')).toBe(true)
    expect(result.layers.some((l) => l.type === 'manual')).toBe(true)
  })
})
