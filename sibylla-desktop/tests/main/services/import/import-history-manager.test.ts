import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { ImportHistoryManager } from '../../../../src/main/services/import/import-history-manager'
import type { ImportPipelineResult, ImportPlan } from '../../../../src/main/services/import/types'

function createMockGitAbstraction() {
  return {
    getCommitHash: vi.fn().mockResolvedValue('abc123def456'),
    createTag: vi.fn().mockResolvedValue(undefined),
    revertCommit: vi.fn().mockResolvedValue('reverted-hash'),
  } as unknown as import('../../../../src/main/services/git-abstraction').GitAbstraction
}

describe('ImportHistoryManager', () => {
  let tmpDir: string
  let historyManager: ImportHistoryManager
  let mockGit: ReturnType<typeof createMockGitAbstraction>

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sibylla-test-history-'))
    mockGit = createMockGitAbstraction()
    historyManager = new ImportHistoryManager(tmpDir, mockGit)
    await historyManager.initialize()
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  const mockResult: ImportPipelineResult = {
    importedFiles: 5,
    importedImages: 2,
    skippedFiles: 0,
    errors: [],
    durationMs: 1000,
    importId: 'test-import-001',
  }

  const mockPlan: ImportPlan = {
    id: 'test-import-001',
    sourceFormat: 'notion',
    sourcePath: '/test/export.zip',
    totalFiles: 5,
    totalImages: 2,
    warnings: [],
    estimatedDurationMs: 500,
    entries: [],
  }

  describe('record', () => {
    it('should create an import record', async () => {
      const record = await historyManager.record(mockResult, mockPlan)

      expect(record.importId).toBe('test-import-001')
      expect(record.sourceFormat).toBe('notion')
      expect(record.preImportCommitHash).toBe('abc123def456')
      expect(record.status).toBe('active')
      expect(record.tag).toContain('sibylla-import/')
      expect(mockGit.createTag).toHaveBeenCalled()
    })

    it('should persist record to disk', async () => {
      await historyManager.record(mockResult, mockPlan)

      const recordPath = path.join(
        tmpDir,
        '.sibylla',
        'import-history',
        'test-import-001.json'
      )
      const content = await fs.readFile(recordPath, 'utf-8')
      const parsed = JSON.parse(content)
      expect(parsed.importId).toBe('test-import-001')
    })
  })

  describe('listHistory', () => {
    it('should return empty list initially', async () => {
      const history = await historyManager.listHistory()
      expect(history).toEqual([])
    })

    it('should return records in reverse chronological order', async () => {
      await historyManager.record(mockResult, mockPlan)

      // Ensure the second record has a later timestamp
      await new Promise((r) => setTimeout(r, 10))

      const result2: ImportPipelineResult = { ...mockResult, importId: 'test-import-002' }
      const plan2: ImportPlan = { ...mockPlan, id: 'test-import-002' }
      await historyManager.record(result2, plan2)

      const history = await historyManager.listHistory()
      expect(history).toHaveLength(2)
      expect(history[0]?.importId).toBe('test-import-002')
    })
  })

  describe('rollback', () => {
    it('should rollback an active import', async () => {
      await historyManager.record(mockResult, mockPlan)

      const rollbackResult = await historyManager.rollback('test-import-001')

      expect(rollbackResult.success).toBe(true)
      expect(mockGit.revertCommit).toHaveBeenCalled()
    })

    it('should update record status to rolled_back', async () => {
      await historyManager.record(mockResult, mockPlan)
      await historyManager.rollback('test-import-001')

      const history = await historyManager.listHistory()
      expect(history[0]?.status).toBe('rolled_back')
    })

    it('should throw for already rolled back import', async () => {
      await historyManager.record(mockResult, mockPlan)
      await historyManager.rollback('test-import-001')

      await expect(historyManager.rollback('test-import-001')).rejects.toThrow(
        'already rolled back'
      )
    })

    it('should throw for non-existent import', async () => {
      await expect(historyManager.rollback('non-existent')).rejects.toThrow(
        'not found'
      )
    })
  })

  describe('cleanupOldRecords', () => {
    it('should expire old active records', async () => {
      const record = await historyManager.record(mockResult, mockPlan)

      const recordPath = path.join(
        tmpDir,
        '.sibylla',
        'import-history',
        'test-import-001.json'
      )
      const oldRecord = {
        ...record,
        timestamp: Date.now() - 31 * 24 * 60 * 60 * 1000,
      }
      await fs.writeFile(recordPath, JSON.stringify(oldRecord), 'utf-8')

      const cleaned = await historyManager.cleanupOldRecords(30)
      expect(cleaned).toBe(1)

      const history = await historyManager.listHistory()
      expect(history[0]?.status).toBe('expired')
    })

    it('should not expire recent records', async () => {
      await historyManager.record(mockResult, mockPlan)

      const cleaned = await historyManager.cleanupOldRecords(30)
      expect(cleaned).toBe(0)
    })
  })
})
