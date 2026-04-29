import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { WikiLinksStore } from '../../../../src/main/services/wiki-links/wiki-links-store'

describe('WikiLinksStore', () => {
  let db: Database.Database
  let store: WikiLinksStore

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
    store = new WikiLinksStore(db)
  })

  function insertLink(source: string, target: string, text: string, position: number) {
    db.prepare(
      'INSERT INTO wiki_links (source_path, target_path, link_text, position, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(source, target, text, position, new Date().toISOString())
  }

  describe('getBacklinks()', () => {
    it('should return files that link to the target', () => {
      insertLink('docs/a.md', 'docs/b.md', 'b', 10)
      insertLink('docs/c.md', 'docs/b.md', 'b', 5)

      const backlinks = store.getBacklinks('docs/b.md')
      expect(backlinks).toHaveLength(2)
      expect(backlinks[0].sourcePath).toBe('docs/a.md')
      expect(backlinks[1].sourcePath).toBe('docs/c.md')
    })

    it('should return empty array when no backlinks', () => {
      const backlinks = store.getBacklinks('docs/unknown.md')
      expect(backlinks).toHaveLength(0)
    })
  })

  describe('getOutlinks()', () => {
    it('should return all links from a source file', () => {
      insertLink('docs/a.md', 'docs/b.md', 'b', 10)
      insertLink('docs/a.md', 'docs/c.md', 'c', 20)

      const outlinks = store.getOutlinks('docs/a.md')
      expect(outlinks).toHaveLength(2)
      expect(outlinks[0].targetPath).toBe('docs/b.md')
      expect(outlinks[1].targetPath).toBe('docs/c.md')
    })
  })

  describe('getGraphData()', () => {
    it('should return full graph data without centerPath', () => {
      insertLink('docs/a.md', 'docs/b.md', 'b', 0)
      insertLink('docs/b.md', 'docs/c.md', 'c', 0)

      const graph = store.getGraphData()
      expect(graph.nodes.length).toBe(3)
      expect(graph.edges.length).toBe(2)
    })

    it('should return focused graph data with centerPath', () => {
      insertLink('docs/a.md', 'docs/b.md', 'b', 0)
      insertLink('docs/b.md', 'docs/c.md', 'c', 0)
      insertLink('docs/c.md', 'docs/d.md', 'd', 0)

      const graph = store.getGraphData('docs/a.md')
      expect(graph.nodes.length).toBeGreaterThan(0)
      expect(graph.edges.length).toBeGreaterThan(0)
    })

    it('should exclude broken links from graph', () => {
      insertLink('docs/a.md', 'docs/b.md', 'b', 0)
      insertLink('docs/a.md', '__broken__:docs/gone.md', 'gone', 1)

      const graph = store.getGraphData()
      expect(graph.edges).toHaveLength(1)
    })
  })

  describe('getLinkCount()', () => {
    it('should return correct incoming and outgoing counts', () => {
      insertLink('docs/a.md', 'docs/b.md', 'b', 0)
      insertLink('docs/c.md', 'docs/b.md', 'b', 0)
      insertLink('docs/b.md', 'docs/d.md', 'd', 0)

      const count = store.getLinkCount('docs/b.md')
      expect(count.incoming).toBe(2)
      expect(count.outgoing).toBe(1)
    })
  })

  describe('getBrokenLinks()', () => {
    it('should return all broken links', () => {
      insertLink('docs/a.md', 'docs/active.md', 'active', 0)
      insertLink('docs/a.md', '__broken__:docs/gone.md', 'gone', 1)

      const broken = store.getBrokenLinks()
      expect(broken).toHaveLength(1)
      expect(broken[0].targetPath).toBe('__broken__:docs/gone.md')
    })
  })
})
