import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ImportPipeline } from '../../../../src/main/services/import/import-pipeline'
import type { ImportRegistry } from '../../../../src/main/services/import/import-registry'
import type { ImportHistoryManager } from '../../../../src/main/services/import/import-history-manager'
import type { ImportAdapter, ImportPlan, ImportItem, ImportPipelineOptions } from '../../../../src/main/services/import/types'

function createMockRegistry(adapter: ImportAdapter | null): ImportRegistry {
  return {
    register: vi.fn(),
    detectAdapter: vi.fn().mockResolvedValue(adapter),
  } as unknown as ImportRegistry
}

function createMockFileManager() {
  return {
    writeFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
    getWorkspaceRoot: vi.fn().mockReturnValue('/workspace'),
  }
}

function createMockHistoryManager() {
  return {
    record: vi.fn().mockResolvedValue({ importId: 'test', status: 'active' }),
    rollbackLatest: vi.fn().mockResolvedValue(null),
    initialize: vi.fn(),
    listHistory: vi.fn().mockResolvedValue([]),
    rollback: vi.fn(),
  }
}

function createMockGitAbstraction() {
  return {
    getCommitHash: vi.fn().mockResolvedValue('abc123'),
    createTag: vi.fn(),
  }
}

function createMockAdapter(): ImportAdapter {
  const items: ImportItem[] = [
    {
      sourcePath: '/test/a.md',
      targetPath: '/out/a.md',
      content: '# Hello World',
      attachments: [],
      metadata: { source: 'test', title: 'a' },
    },
    {
      sourcePath: '/test/b.md',
      targetPath: '/out/b.md',
      content: '# Second File',
      attachments: [],
      metadata: { source: 'test', title: 'b' },
    },
  ]

  const plan: ImportPlan = {
    id: 'plan-001',
    sourceFormat: 'test',
    sourcePath: '/test',
    totalFiles: 2,
    totalImages: 0,
    warnings: [],
    estimatedDurationMs: 100,
    entries: [
      { sourcePath: '/test/a.md', relativePath: 'a.md', type: 'markdown', size: 100 },
      { sourcePath: '/test/b.md', relativePath: 'b.md', type: 'markdown', size: 200 },
    ],
  }

  return {
    name: 'test',
    detect: vi.fn().mockResolvedValue(true),
    scan: vi.fn().mockResolvedValue(plan),
    transform: vi.fn().mockImplementation(async function* () {
      for (const item of items) {
        yield item
      }
    }),
  }
}

const defaultOptions: ImportPipelineOptions = {
  targetDir: '/',
  conflictStrategy: 'skip',
  preserveStructure: true,
  importId: 'test-import-001',
}

describe('ImportPipeline', () => {
  let pipeline: ImportPipeline
  let mockRegistry: ReturnType<typeof createMockRegistry>
  let mockFileManager: ReturnType<typeof createMockFileManager>
  let mockHistory: ReturnType<typeof createMockHistoryManager>
  let mockGit: ReturnType<typeof createMockGitAbstraction>
  let progressCallback: ReturnType<typeof vi.fn>
  let mockAdapter: ReturnType<typeof createMockAdapter>

  beforeEach(() => {
    mockAdapter = createMockAdapter()
    mockRegistry = createMockRegistry(mockAdapter)
    mockFileManager = createMockFileManager()
    mockHistory = createMockHistoryManager()
    mockGit = createMockGitAbstraction()
    progressCallback = vi.fn()

    pipeline = new ImportPipeline(
      mockRegistry as unknown as import('../../../../src/main/services/import/import-registry').ImportRegistry,
      mockFileManager as unknown as import('../../../../src/main/services/file-manager').FileManager,
      mockHistory as unknown as import('../../../../src/main/services/import/import-history-manager').ImportHistoryManager,
      mockGit as unknown as import('../../../../src/main/services/git-abstraction').GitAbstraction,
      progressCallback
    )
  })

  it('should complete full pipeline run', async () => {
    const result = await pipeline.run('/test/input', defaultOptions)

    expect(result.importedFiles).toBe(2)
    expect(result.errors).toHaveLength(0)
    expect(result.importId).toBe('test-import-001')
    expect(mockRegistry.detectAdapter).toHaveBeenCalledWith('/test/input')
    expect(mockAdapter.scan).toHaveBeenCalledWith('/test/input')
    expect(mockFileManager.writeFile).toHaveBeenCalledTimes(2)
  })

  it('should push progress callbacks', async () => {
    await pipeline.run('/test/input', defaultOptions)

    expect(progressCallback).toHaveBeenCalled()
    const lastCall = progressCallback.mock.calls[progressCallback.mock.calls.length - 1]
    expect(lastCall[0].stage).toBeDefined()
  })

  it('should throw when no adapter found', async () => {
    const nullRegistry = createMockRegistry(null)
    const nullPipeline = new ImportPipeline(
      nullRegistry as unknown as import('../../../../src/main/services/import/import-registry').ImportRegistry,
      mockFileManager as unknown as import('../../../../src/main/services/file-manager').FileManager,
      mockHistory as unknown as import('../../../../src/main/services/import/import-history-manager').ImportHistoryManager,
      mockGit as unknown as import('../../../../src/main/services/git-abstraction').GitAbstraction,
    )

    const result = await nullPipeline.run('/test/unknown.xyz', defaultOptions)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('should support pause and resume', async () => {
    const result = await pipeline.run('/test/input', defaultOptions)

    pipeline.pause()
    expect(pipeline.getState()).not.toBe('idle')

    pipeline.resume()

    expect(result.importedFiles).toBe(2)
  })

  it('should return correct state', () => {
    expect(pipeline.getState()).toBe('idle')
  })

  it('should skip files when conflict strategy is skip and file exists', async () => {
    const existsFileManager = {
      ...mockFileManager,
      exists: vi.fn().mockResolvedValue(true),
    }

    const skipPipeline = new ImportPipeline(
      mockRegistry as unknown as import('../../../../src/main/services/import/import-registry').ImportRegistry,
      existsFileManager as unknown as import('../../../../src/main/services/file-manager').FileManager,
      mockHistory as unknown as import('../../../../src/main/services/import/import-history-manager').ImportHistoryManager,
      mockGit as unknown as import('../../../../src/main/services/git-abstraction').GitAbstraction,
    )

    const result = await skipPipeline.run('/test/input', defaultOptions)
    expect(result.skippedFiles).toBe(2)
  })

  it('should record history on successful import', async () => {
    await pipeline.run('/test/input', defaultOptions)

    expect(mockHistory.record).toHaveBeenCalled()
  })

  it('should cancel and trigger rollback', async () => {
    // Adapter that yields slowly so we can cancel
    const slowAdapter: ImportAdapter = {
      name: 'slow',
      detect: vi.fn().mockResolvedValue(true),
      scan: vi.fn().mockResolvedValue({
        id: 'plan-001',
        sourceFormat: 'slow',
        sourcePath: '/test',
        totalFiles: 100,
        totalImages: 0,
        warnings: [],
        estimatedDurationMs: 10000,
        entries: [],
      }),
      transform: vi.fn().mockImplementation(async function* () {
        for (let i = 0; i < 100; i++) {
          await new Promise((r) => setTimeout(r, 10))
          yield {
            sourcePath: `/test/${i}.md`,
            targetPath: `/out/${i}.md`,
            content: `# File ${i}`,
            attachments: [],
            metadata: {},
          }
        }
      }),
    }

    const slowRegistry = createMockRegistry(slowAdapter)
    const cancelPipeline = new ImportPipeline(
      slowRegistry as unknown as import('../../../../src/main/services/import/import-registry').ImportRegistry,
      mockFileManager as unknown as import('../../../../src/main/services/file-manager').FileManager,
      mockHistory as unknown as import('../../../../src/main/services/import/import-history-manager').ImportHistoryManager,
      mockGit as unknown as import('../../../../src/main/services/git-abstraction').GitAbstraction,
    )

    const runPromise = cancelPipeline.run('/test/input', defaultOptions)
    // Cancel after a short delay
    setTimeout(() => cancelPipeline.cancel(), 50)
    const result = await runPromise

    // Should have fewer than 100 files
    expect(result.importedFiles).toBeLessThan(100)
    expect(mockHistory.rollbackLatest).toHaveBeenCalled()
  })

  it('should handle writeItem failure gracefully', async () => {
    const failingFileManager = {
      ...mockFileManager,
      writeFile: vi.fn().mockRejectedValue(new Error('disk full')),
      exists: vi.fn().mockResolvedValue(false),
    }

    const failPipeline = new ImportPipeline(
      mockRegistry as unknown as import('../../../../src/main/services/import/import-registry').ImportRegistry,
      failingFileManager as unknown as import('../../../../src/main/services/file-manager').FileManager,
      mockHistory as unknown as import('../../../../src/main/services/import/import-history-manager').ImportHistoryManager,
      mockGit as unknown as import('../../../../src/main/services/git-abstraction').GitAbstraction,
    )

    const result = await failPipeline.run('/test/input', defaultOptions)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]?.type).toBe('write_failed')
  })
})
