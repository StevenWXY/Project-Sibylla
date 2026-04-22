import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HandbookIndexer } from '../../src/main/services/handbook/handbook-indexer'
import type { HandbookEntry } from '../../src/main/services/handbook/types'

vi.mock('../../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    setLevel: vi.fn(),
  },
}))

function createMockDbManager() {
  return {
    indexFileContent: vi.fn(),
    removeFileIndex: vi.fn(),
    searchFiles: vi.fn(() => []),
    getFileMeta: vi.fn(),
    upsertFileMeta: vi.fn(),
    deleteFileMeta: vi.fn(),
    getAllFileMeta: vi.fn(() => []),
    clearAllIndexes: vi.fn(),
    getIndexedFileCount: vi.fn(() => 0),
    getDatabaseSize: vi.fn(() => 0),
    checkIntegrity: vi.fn(() => true),
    close: vi.fn(),
  }
}

function createEntry(overrides: Partial<HandbookEntry> = {}): HandbookEntry {
  return {
    id: 'test.entry',
    path: 'test/entry.md',
    title: 'Test Entry',
    tags: ['test'],
    language: 'zh',
    version: 'abc123',
    source: 'builtin',
    content: 'Test content',
    keywords: ['test'],
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('HandbookIndexer', () => {
  let indexer: HandbookIndexer
  let dbManager: ReturnType<typeof createMockDbManager>

  beforeEach(() => {
    dbManager = createMockDbManager()
    indexer = new HandbookIndexer(dbManager)
  })

  describe('indexEntries', () => {
    it('indexes all entries to FTS5', async () => {
      const entries = [
        createEntry({ id: 'a', path: 'a.md', language: 'zh' }),
        createEntry({ id: 'b', path: 'b.md', language: 'en' }),
      ]

      await indexer.indexEntries(entries)

      expect(dbManager.indexFileContent).toHaveBeenCalledTimes(2)
      expect(dbManager.indexFileContent).toHaveBeenCalledWith(
        'handbook/zh/a.md',
        expect.any(String),
      )
      expect(dbManager.indexFileContent).toHaveBeenCalledWith(
        'handbook/en/b.md',
        expect.any(String),
      )
    })

    it('continues on single entry failure', async () => {
      dbManager.indexFileContent.mockImplementationOnce(() => {
        throw new Error('Index error')
      })

      const entries = [
        createEntry({ id: 'fail', path: 'fail.md' }),
        createEntry({ id: 'ok', path: 'ok.md' }),
      ]

      await indexer.indexEntries(entries)

      expect(dbManager.indexFileContent).toHaveBeenCalledTimes(2)
    })

    it('builds index content with title, content, tags, keywords', async () => {
      const entry = createEntry({
        title: 'Title',
        content: 'Body',
        tags: ['tag1'],
        keywords: ['kw1'],
      })

      await indexer.indexEntries([entry])

      const call = dbManager.indexFileContent.mock.calls[0]
      expect(call?.[1]).toContain('Title')
      expect(call?.[1]).toContain('Body')
      expect(call?.[1]).toContain('tag1')
      expect(call?.[1]).toContain('kw1')
    })

    it('handles empty entries array', async () => {
      await indexer.indexEntries([])
      expect(dbManager.indexFileContent).not.toHaveBeenCalled()
    })
  })

  describe('removeEntries', () => {
    it('removes entries from FTS5', async () => {
      const entries = [createEntry({ id: 'a', path: 'a.md', language: 'zh' })]
      await indexer.removeEntries(entries)

      expect(dbManager.removeFileIndex).toHaveBeenCalledWith('handbook/zh/a.md')
    })

    it('continues on removal failure', async () => {
      dbManager.removeFileIndex.mockImplementationOnce(() => {
        throw new Error('Remove error')
      })

      const entries = [
        createEntry({ id: 'fail', path: 'fail.md' }),
        createEntry({ id: 'ok', path: 'ok.md' }),
      ]

      await indexer.removeEntries(entries)
      expect(dbManager.removeFileIndex).toHaveBeenCalledTimes(2)
    })
  })

  describe('hashContent', () => {
    it('returns consistent 12-char hash', () => {
      const hash = indexer.hashContent('test content')
      expect(hash).toHaveLength(12)
      expect(hash).toMatch(/^[0-9a-f]+$/)
    })

    it('returns different hashes for different content', () => {
      const hash1 = indexer.hashContent('content A')
      const hash2 = indexer.hashContent('content B')
      expect(hash1).not.toBe(hash2)
    })
  })
})
