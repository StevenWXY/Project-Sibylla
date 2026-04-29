import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { WikiLinksIndexer } from '../../../../src/main/services/wiki-links/wiki-links-indexer'
import type { AppEventBus } from '../../../../src/main/services/event-bus'

vi.mock('../../../../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

function createMockEventBus(): AppEventBus {
  const handlers = new Map<string, Set<(...args: unknown[]) => unknown>>()
  return {
    subscribe: vi.fn((type: string, handler: (...args: unknown[]) => unknown) => {
      if (!handlers.has(type)) handlers.set(type, new Set())
      handlers.get(type)!.add(handler)
      return () => handlers.get(type)?.delete(handler)
    }),
    emitEvent: vi.fn(),
    subscribeAny: vi.fn(() => () => {}),
    removeAllListeners: vi.fn(),
    flushAndShutdown: vi.fn(),
  } as unknown as AppEventBus
}

function createMockFileManager() {
  const files = new Map<string, string>()
  return {
    readFile: vi.fn(async (path: string) => {
      const content = files.get(path)
      if (content === undefined) throw new Error(`File not found: ${path}`)
      return { content, path, encoding: 'utf-8', size: content.length }
    }),
    listFiles: vi.fn(async () => {
      return Array.from(files.entries()).map(([path, content]) => ({
        name: path.split('/').pop() ?? path,
        path,
        isDirectory: false,
        size: content.length,
        modifiedTime: new Date().toISOString(),
        createdTime: new Date().toISOString(),
      }))
    }),
    _setFile(path: string, content: string) {
      files.set(path, content)
    },
  }
}

describe('WikiLinksIndexer', () => {
  let db: Database.Database
  let eventBus: ReturnType<typeof createMockEventBus>
  let fileManager: ReturnType<typeof createMockFileManager>
  let indexer: WikiLinksIndexer

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.exec(`
      CREATE TABLE IF NOT EXISTS wiki_links (
        source_path TEXT NOT NULL,
        target_path TEXT NOT NULL,
        link_text TEXT NOT NULL,
        position INTEGER,
        created_at TEXT,
        PRIMARY KEY (source_path, target_path, position)
      );
      CREATE INDEX IF NOT EXISTS idx_wiki_target ON wiki_links(target_path);
      CREATE INDEX IF NOT EXISTS idx_wiki_source ON wiki_links(source_path);
    `)

    eventBus = createMockEventBus()
    fileManager = createMockFileManager()
    indexer = new WikiLinksIndexer(db, fileManager as never, eventBus)
  })

  describe('extractLinks()', () => {
    it('should extract basic wiki links', () => {
      const links = indexer.extractLinks('Some text [[target]] more text')
      expect(links).toHaveLength(1)
      expect(links[0]).toEqual({
        target: 'target',
        text: 'target',
        position: 10,
      })
    })

    it('should extract multiple wiki links', () => {
      const links = indexer.extractLinks('[[a]] text [[b]]')
      expect(links).toHaveLength(2)
      expect(links[0].target).toBe('a')
      expect(links[1].target).toBe('b')
    })

    it('should extract links with display text using pipe syntax', () => {
      const links = indexer.extractLinks('[[path|label]]')
      expect(links).toHaveLength(1)
      expect(links[0].target).toBe('path')
      expect(links[0].text).toBe('label')
    })

    it('should return empty array for empty content', () => {
      const links = indexer.extractLinks('')
      expect(links).toHaveLength(0)
    })

    it('should return empty array for content without links', () => {
      const links = indexer.extractLinks('Just some plain text')
      expect(links).toHaveLength(0)
    })

    it('should ignore empty wiki links', () => {
      const links = indexer.extractLinks('[[]]')
      expect(links).toHaveLength(0)
    })
  })

  describe('rebuildIndexForFile()', () => {
    it('should index a markdown file with wiki links', async () => {
      fileManager._setFile('docs/a.md', 'Link to [[b]] and [[c]]')

      await indexer.rebuildIndexForFile('docs/a.md')

      const rows = db.prepare('SELECT * FROM wiki_links WHERE source_path = ?').all('docs/a.md')
      expect(rows).toHaveLength(2)
    })

    it('should skip non-markdown files', async () => {
      await indexer.rebuildIndexForFile('data.json')

      const rows = db.prepare('SELECT * FROM wiki_links').all()
      expect(rows).toHaveLength(0)
    })

    it('should replace existing links on rebuild', async () => {
      fileManager._setFile('docs/a.md', 'Link to [[b]]')

      await indexer.rebuildIndexForFile('docs/a.md')
      expect(db.prepare('SELECT * FROM wiki_links').all()).toHaveLength(1)

      fileManager._setFile('docs/a.md', 'Link to [[c]] and [[d]]')
      await indexer.rebuildIndexForFile('docs/a.md')

      const rows = db.prepare('SELECT * FROM wiki_links WHERE source_path = ?').all('docs/a.md')
      expect(rows).toHaveLength(2)
    })

    it('should emit wiki-links.updated event', async () => {
      fileManager._setFile('docs/a.md', '[[b]]')
      await indexer.rebuildIndexForFile('docs/a.md')

      expect(eventBus.emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'wiki-links.updated',
          payload: { path: 'docs/a.md' },
        }),
      )
    })
  })

  describe('markBroken()', () => {
    it('should prefix target_path with __broken__:', () => {
      db.prepare(
        'INSERT INTO wiki_links (source_path, target_path, link_text, position, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run('docs/a.md', 'docs/deleted.md', 'deleted', 0, new Date().toISOString())

      indexer.markBroken('docs/deleted.md')

      const rows = db.prepare("SELECT * FROM wiki_links WHERE target_path LIKE '__broken__:%'").all()
      expect(rows).toHaveLength(1)
      expect((rows[0] as { target_path: string }).target_path).toBe('__broken__:docs/deleted.md')
    })

    it('should not double-prefix already broken links', () => {
      db.prepare(
        'INSERT INTO wiki_links (source_path, target_path, link_text, position, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run('docs/a.md', 'docs/deleted.md', 'deleted', 0, new Date().toISOString())

      indexer.markBroken('docs/deleted.md')
      indexer.markBroken('docs/deleted.md')

      const rows = db.prepare("SELECT * FROM wiki_links WHERE target_path LIKE '__broken__:%'").all()
      expect(rows).toHaveLength(1)
    })
  })

  describe('handleRename()', () => {
    it('should update target_path for backlinks', async () => {
      db.prepare(
        'INSERT INTO wiki_links (source_path, target_path, link_text, position, created_at) VALUES (?, ?, ?, ?, ?)',
      ).run('docs/a.md', 'docs/old.md', 'old', 0, new Date().toISOString())

      await indexer.handleRename('docs/old.md', 'docs/new.md')

      const rows = db.prepare('SELECT * FROM wiki_links').all()
      expect(rows).toHaveLength(1)
      expect((rows[0] as { target_path: string }).target_path).toBe('docs/new.md')
    })

    it('should do nothing when no backlinks exist', async () => {
      await indexer.handleRename('docs/old.md', 'docs/new.md')

      const rows = db.prepare('SELECT * FROM wiki_links').all()
      expect(rows).toHaveLength(0)
    })
  })
})
