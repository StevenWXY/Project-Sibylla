import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ContextEngine, type ContextAssemblyRequest } from '../../src/main/services/context-engine'
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
    listFiles: vi.fn(async () => {
      return Array.from(files.entries()).map(([filePath, content]) => ({
        name: filePath.split('/').pop() ?? filePath,
        path: filePath,
        isDirectory: false,
        size: content.length,
        modifiedTime: new Date().toISOString(),
        createdTime: new Date().toISOString(),
        extension: filePath.split('.').pop(),
      }))
    }),
  } as unknown as FileManager
}

function createMockMemoryManager(): MemoryManager {
  return {
    setWorkspacePath: vi.fn(),
    getMemorySnapshot: vi.fn(async () => ({
      content: 'Mock memory content',
      tokenCount: 10,
      tokenDebt: 0,
    })),
  } as unknown as MemoryManager
}

describe('ContextEngine', () => {
  let fileManager: FileManager
  let memoryManager: MemoryManager

  beforeEach(() => {
    const files = new Map<string, string>([
      ['CLAUDE.md', '# Project Constitution\nThis is the project constitution file.'],
      ['docs/prd.md', '# Product Requirements\n- Feature A\n- Feature B'],
      ['docs/design.md', '# Design Spec\nArchitecture details here.'],
      ['src/app.ts', 'export const app = {}'],
      ['requirements.md', '# Requirements\nBasic requirements.'],
      ['design.md', '# Design\nSystem design.'],
      ['tasks.md', '# Tasks\n- Task 1\n- Task 2'],
    ])
    fileManager = createMockFileManager(files)
    memoryManager = createMockMemoryManager()
  })

  describe('assembleContext', () => {
    it('should always load CLAUDE.md', async () => {
      const engine = new ContextEngine(fileManager, memoryManager)
      const result = await engine.assembleContext({
        userMessage: 'Hello',
        manualRefs: [],
      })

      const claudeSource = result.sources.find((s) => s.filePath === 'CLAUDE.md')
      expect(claudeSource).toBeDefined()
      expect(claudeSource?.layer).toBe('always')
    })

    it('should load current editing file', async () => {
      const engine = new ContextEngine(fileManager, memoryManager)
      const result = await engine.assembleContext({
        userMessage: 'Hello',
        currentFile: 'docs/prd.md',
        manualRefs: [],
      })

      const currentFileSource = result.sources.find((s) => s.filePath === 'docs/prd.md')
      expect(currentFileSource).toBeDefined()
      expect(currentFileSource?.layer).toBe('always')
    })

    it('should load manually referenced files', async () => {
      const engine = new ContextEngine(fileManager, memoryManager)
      const result = await engine.assembleContext({
        userMessage: 'Hello',
        manualRefs: ['src/app.ts'],
      })

      const manualSource = result.sources.find((s) => s.filePath === 'src/app.ts')
      expect(manualSource).toBeDefined()
      expect(manualSource?.layer).toBe('manual')
    })

    it('should load spec files', async () => {
      const engine = new ContextEngine(fileManager, memoryManager)
      const result = await engine.assembleContext({
        userMessage: 'Hello',
        manualRefs: [],
      })

      const specFiles = result.sources.filter(
        (s) => ['requirements.md', 'design.md', 'tasks.md'].includes(s.filePath)
      )
      expect(specFiles.length).toBe(3)
    })

    it('should handle non-existent files gracefully', async () => {
      const engine = new ContextEngine(fileManager, memoryManager)
      const result = await engine.assembleContext({
        userMessage: 'Hello',
        manualRefs: ['nonexistent.ts'],
      })

      const manualSource = result.sources.find((s) => s.filePath === 'nonexistent.ts')
      expect(manualSource).toBeUndefined()
    })

    it('should produce warnings when context exceeds budget', async () => {
      const bigContent = 'A'.repeat(50000)
      const bigFileManager = createMockFileManager(
        new Map([
          ['CLAUDE.md', bigContent],
          ['file1.md', bigContent],
          ['file2.md', bigContent],
        ])
      )
      const engine = new ContextEngine(bigFileManager, memoryManager, {
        maxContextTokens: 1000,
        systemPromptReserve: 200,
      })

      const result = await engine.assembleContext({
        userMessage: 'Hello',
        manualRefs: ['file1.md', 'file2.md'],
      })

      expect(result.warnings.length).toBeGreaterThan(0)
    })

    it('should build system prompt with all sources', async () => {
      const engine = new ContextEngine(fileManager, memoryManager)
      const result = await engine.assembleContext({
        userMessage: 'Hello',
        manualRefs: ['src/app.ts'],
      })

      expect(result.systemPrompt).toContain('Always-Load: CLAUDE.md')
      expect(result.systemPrompt).toContain('Manual-Ref: src/app.ts')
    })

    it('should build correct layer structure', async () => {
      const engine = new ContextEngine(fileManager, memoryManager)
      const result = await engine.assembleContext({
        userMessage: 'Hello',
        manualRefs: ['src/app.ts'],
      })

      expect(result.layers.some((l) => l.type === 'always')).toBe(true)
      expect(result.layers.some((l) => l.type === 'manual')).toBe(true)
    })
  })

  describe('extractFileReferences', () => {
    it('should parse @[[path]] syntax', () => {
      const engine = new ContextEngine(fileManager, memoryManager)
      const result = engine.extractFileReferences('Please check @[[docs/prd.md]] and @[[src/app.ts]]')

      expect(result).toEqual(['docs/prd.md', 'src/app.ts'])
    })

    it('should deduplicate references', () => {
      const engine = new ContextEngine(fileManager, memoryManager)
      const result = engine.extractFileReferences(
        'Check @[[docs/prd.md]] and also @[[docs/prd.md]]'
      )

      expect(result).toEqual(['docs/prd.md'])
    })

    it('should return empty array for no references', () => {
      const engine = new ContextEngine(fileManager, memoryManager)
      const result = engine.extractFileReferences('No references here')

      expect(result).toEqual([])
    })

    it('should handle empty message', () => {
      const engine = new ContextEngine(fileManager, memoryManager)
      const result = engine.extractFileReferences('')

      expect(result).toEqual([])
    })
  })

  describe('findMatchingFiles', () => {
    it('should find files matching query', async () => {
      const engine = new ContextEngine(fileManager, memoryManager)
      const result = await engine.findMatchingFiles('prd')

      expect(result.length).toBeGreaterThan(0)
      expect(result[0]?.name).toContain('prd')
    })

    it('should return empty for no matches', async () => {
      const engine = new ContextEngine(fileManager, memoryManager)
      const result = await engine.findMatchingFiles('zzzznonexistent')

      expect(result).toEqual([])
    })

    it('should respect limit parameter', async () => {
      const engine = new ContextEngine(fileManager, memoryManager)
      const result = await engine.findMatchingFiles('', 2)

      expect(result.length).toBeLessThanOrEqual(2)
    })
  })
})
