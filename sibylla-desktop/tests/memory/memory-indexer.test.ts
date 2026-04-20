import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { MemoryIndexer } from '../../src/main/services/memory/memory-indexer'
import type { EmbeddingProvider, MemoryEntry } from '../../src/main/services/memory/types'

// Mock logger
vi.mock('../../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock MemoryFileManager to avoid file system access during rebuild
vi.mock('../../src/main/services/memory/memory-file-manager', () => ({
  MemoryFileManager: vi.fn().mockImplementation(() => ({
    load: vi.fn().mockResolvedValue({ metadata: {}, entries: [] }),
    loadArchive: vi.fn().mockResolvedValue([]),
  })),
}))

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    section: 'user_preference',
    content: 'User prefers dark mode for better readability',
    confidence: 0.8,
    hits: 3,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceLogIds: ['log-001'],
    locked: false,
    tags: [],
    ...overrides,
  }
}

function createMockEmbeddingProvider(available = false): EmbeddingProvider {
  return {
    dimension: 384,
    provider: 'local' as const,
    embed: vi.fn().mockResolvedValue([[...Array(384)].map(() => Math.random())]),
    isAvailable: vi.fn().mockReturnValue(available),
    initialize: vi.fn().mockResolvedValue(undefined),
  }
}

describe('MemoryIndexer', () => {
  let db: Database.Database
  let indexer: MemoryIndexer
  let mockEmbedding: EmbeddingProvider

  beforeEach(async () => {
    // Use in-memory database for testing
    db = new Database(':memory:')
    mockEmbedding = createMockEmbeddingProvider(false) // Start with embedding unavailable
    indexer = new MemoryIndexer(db, mockEmbedding, '/tmp/test-workspace')

    // Initialize without vec extension (not available in test env)
    await indexer.initialize()
  })

  afterEach(() => {
    db.close()
  })

  describe('upsert', () => {
    it('should write entry to memory_entries and memory_fts', async () => {
      const entry = makeEntry({ id: 'test-1', content: 'Test content for search' })
      await indexer.upsert(entry)

      const row = db.prepare('SELECT * FROM memory_entries WHERE id = ?').get('test-1') as Record<string, unknown>
      expect(row).toBeDefined()
      expect(row.content).toBe('Test content for search')
      expect(row.section).toBe('user_preference')

      const ftsRow = db.prepare('SELECT * FROM memory_fts WHERE id = ?').get('test-1') as Record<string, unknown>
      expect(ftsRow).toBeDefined()
      expect(ftsRow.content).toBe('Test content for search')
    })

    it('should handle archived entries', async () => {
      const entry = makeEntry({ id: 'archived-1' })
      await indexer.upsert(entry, true)

      const row = db.prepare('SELECT * FROM memory_entries WHERE id = ?').get('archived-1') as Record<string, unknown>
      expect(row.is_archived).toBe(1)
    })
  })

  describe('remove', () => {
    it('should delete entry from all tables', async () => {
      const entry = makeEntry({ id: 'to-delete' })
      await indexer.upsert(entry)

      // Verify it exists first
      const before = db.prepare('SELECT * FROM memory_entries WHERE id = ?').get('to-delete')
      expect(before).toBeDefined()

      await indexer.remove('to-delete')

      const afterEntries = db.prepare('SELECT * FROM memory_entries WHERE id = ?').get('to-delete')
      expect(afterEntries).toBeUndefined()

      const afterFts = db.prepare('SELECT * FROM memory_fts WHERE id = ?').get('to-delete')
      expect(afterFts).toBeUndefined()
    })
  })

  describe('search (FTS5-only mode)', () => {
    beforeEach(async () => {
      // Insert test entries
      await indexer.upsert(makeEntry({ id: 'e1', content: 'TypeScript strict mode configuration', section: 'technical_decision' }))
      await indexer.upsert(makeEntry({ id: 'e2', content: 'User prefers dark mode interface', section: 'user_preference' }))
      await indexer.upsert(makeEntry({ id: 'e3', content: 'Risk of memory overflow in production', section: 'risk_note' }))
      await indexer.upsert(makeEntry({ id: 'e4', content: 'Archived old decision about API design', section: 'technical_decision' }), true)
    })

    it('should return results matching the query', async () => {
      const results = await indexer.search('TypeScript')
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].id).toBe('e1')
      expect(results[0].content).toContain('TypeScript')
    })

    it('should respect sectionFilter', async () => {
      const results = await indexer.search('mode', {
        sectionFilter: ['user_preference'],
      })
      expect(results.every((r) => r.section === 'user_preference')).toBe(true)
    })

    it('should exclude archived entries by default', async () => {
      const results = await indexer.search('decision')
      const archivedResult = results.find((r) => r.id === 'e4')
      expect(archivedResult).toBeUndefined()
    })

    it('should include archived entries when includeArchived=true', async () => {
      const results = await indexer.search('decision', { includeArchived: true })
      const archivedResult = results.find((r) => r.id === 'e4')
      expect(archivedResult).toBeDefined()
      expect(archivedResult?.isArchived).toBe(true)
    })

    it('should respect limit parameter', async () => {
      const results = await indexer.search('mode', { limit: 1 })
      expect(results.length).toBeLessThanOrEqual(1)
    })

    it('should return empty for empty query', async () => {
      const results = await indexer.search('')
      expect(results).toEqual([])
    })

    it('should return finalScore > 0 for matching results', async () => {
      const results = await indexer.search('dark mode')
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].finalScore).toBeGreaterThan(0)
    })
  })

  describe('indexReport', () => {
    it('should upsert added entries from ExtractionReport', async () => {
      const addedEntry = makeEntry({ id: 'report-added-1', content: 'New insight from extraction' })
      await indexer.indexReport({
        added: [addedEntry],
        merged: [],
        discarded: [],
        durationMs: 100,
        tokenCost: { input: 50, output: 20 },
      })

      const row = db.prepare('SELECT * FROM memory_entries WHERE id = ?').get('report-added-1')
      expect(row).toBeDefined()
    })

    it('should remove discarded entries', async () => {
      const entry = makeEntry({ id: 'to-discard' })
      await indexer.upsert(entry)

      await indexer.indexReport({
        added: [],
        merged: [],
        discarded: [{ candidate: 'to-discard', reason: 'Low confidence' }],
        durationMs: 50,
        tokenCost: { input: 10, output: 5 },
      })

      const row = db.prepare('SELECT * FROM memory_entries WHERE id = ?').get('to-discard')
      expect(row).toBeUndefined()
    })
  })

  describe('rebuild', () => {
    it('should clear and rebuild all tables', async () => {
      // Insert some entries
      await indexer.upsert(makeEntry({ id: 'before-rebuild' }))
      const before = db.prepare('SELECT COUNT(*) AS c FROM memory_entries').get() as { c: number }
      expect(before.c).toBe(1)

      // Rebuild clears everything, then loads from (mocked) file manager
      await indexer.rebuild()

      const after = db.prepare('SELECT COUNT(*) AS c FROM memory_entries').get() as { c: number }
      expect(after.c).toBe(0) // Mock returns empty entries
    })
  })

  describe('verifyHealth', () => {
    it('should return healthy when tables are consistent', async () => {
      await indexer.upsert(makeEntry({ id: 'h1' }))
      await indexer.upsert(makeEntry({ id: 'h2' }))

      const health = await indexer.verifyHealth()
      expect(health.healthy).toBe(true)
    })

    it('should return unhealthy when tables are inconsistent', async () => {
      await indexer.upsert(makeEntry({ id: 'h1' }))
      // Manually delete from one table to create inconsistency
      db.prepare('DELETE FROM memory_fts WHERE id = ?').run('h1')

      const health = await indexer.verifyHealth()
      expect(health.healthy).toBe(false)
      expect(health.reason).toContain('mismatch')
    })
  })

  describe('SimilarityIndexProvider interface', () => {
    it('should return isAvailable()=true', () => {
      expect(indexer.isAvailable()).toBe(true)
    })

    it('should delegate embed() to embeddingProvider', async () => {
      const mockProvider = createMockEmbeddingProvider(true)
      const testIndexer = new MemoryIndexer(db, mockProvider, '/tmp/test')

      const result = await testIndexer.embed('test text')
      expect(mockProvider.embed).toHaveBeenCalledWith(['test text'])
      expect(result).toHaveLength(384)
    })
  })

  describe('getEntryCount', () => {
    it('should return correct count', async () => {
      expect(indexer.getEntryCount()).toBe(0)

      await indexer.upsert(makeEntry({ id: 'count-1' }))
      await indexer.upsert(makeEntry({ id: 'count-2' }))

      expect(indexer.getEntryCount()).toBe(2)
    })
  })
})
