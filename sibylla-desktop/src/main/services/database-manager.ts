import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

export interface FileMetaRecord {
  path: string
  content_hash: string
  last_modified: number
  size: number
  indexed_at: number
}

export interface RawSearchResult {
  path: string
  snippet: string
  rank: number
  matchCount: number
}

export class DatabaseManager {
  private db: Database.Database
  private readonly dbPath: string

  constructor(workspacePath: string) {
    const indexDir = path.join(workspacePath, '.sibylla', 'index')
    fs.mkdirSync(indexDir, { recursive: true })

    this.dbPath = path.join(indexDir, 'search.db')
    this.db = this.openDatabase()
    this.configure()
    this.initSchema()
  }

  private openDatabase(): Database.Database {
    return new Database(this.dbPath, {
      verbose: process.env.NODE_ENV === 'development' ? (msg: string) => {
        if (typeof msg === 'string' && !msg.startsWith('PRAGMA')) {
          console.debug('[DatabaseManager]', msg)
        }
      } : undefined,
    })
  }

  private configure(): void {
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('cache_size = -32000')
    this.db.pragma('mmap_size = 67108864')
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS search_files (
        path TEXT PRIMARY KEY,
        content_hash TEXT NOT NULL,
        last_modified INTEGER NOT NULL,
        size INTEGER NOT NULL,
        indexed_at INTEGER NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
        path,
        content,
        content='search_files',
        content_rowid='rowid',
        tokenize='unicode61'
      );

      CREATE INDEX IF NOT EXISTS idx_search_files_modified
        ON search_files(last_modified);
    `)

    const triggerExists = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name='search_files_ai'"
    ).get()

    if (!triggerExists) {
      this.db.exec(`
        CREATE TRIGGER search_files_ai AFTER INSERT ON search_files BEGIN
          INSERT INTO files_fts(rowid, path, content) VALUES (new.rowid, new.path, '');
        END;
        CREATE TRIGGER search_files_ad AFTER DELETE ON search_files BEGIN
          INSERT INTO files_fts(files_fts, rowid, path, content) VALUES('delete', old.rowid, old.path, '');
        END;
        CREATE TRIGGER search_files_au AFTER UPDATE ON search_files BEGIN
          INSERT INTO files_fts(files_fts, rowid, path, content) VALUES('delete', old.rowid, old.path, '');
          INSERT INTO files_fts(rowid, path, content) VALUES (new.rowid, new.path, '');
        END;
      `)
    }
  }

  upsertFileMeta(filePath: string, contentHash: string, lastModified: number, size: number): void {
    this.db.prepare(`
      INSERT INTO search_files (path, content_hash, last_modified, size, indexed_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET
        content_hash = excluded.content_hash,
        last_modified = excluded.last_modified,
        size = excluded.size,
        indexed_at = excluded.indexed_at
    `).run(filePath, contentHash, lastModified, size, Date.now())
  }

  getFileMeta(filePath: string): FileMetaRecord | undefined {
    return this.db.prepare(
      'SELECT * FROM search_files WHERE path = ?'
    ).get(filePath) as FileMetaRecord | undefined
  }

  deleteFileMeta(filePath: string): void {
    this.db.prepare('DELETE FROM search_files WHERE path = ?').run(filePath)
  }

  getAllFileMeta(): FileMetaRecord[] {
    return this.db.prepare('SELECT * FROM search_files').all() as FileMetaRecord[]
  }

  indexFileContent(filePath: string, content: string): void {
    const hash = computeHash(content)
    const existing = this.getFileMeta(filePath)
    if (existing && existing.content_hash === hash) {
      return
    }

    const stat = { size: Buffer.byteLength(content), lastModified: Date.now() }
    this.upsertFileMeta(filePath, hash, stat.lastModified, stat.size)
    this.db.prepare(
      'UPDATE files_fts SET content = ? WHERE path = ?'
    ).run(content, filePath)
  }

  removeFileIndex(filePath: string): void {
    this.deleteFileMeta(filePath)
  }

  searchFiles(query: string, limit: number): RawSearchResult[] {
    const stmt = this.db.prepare(`
      SELECT
        f.path,
        snippet(files_fts, 1, '<mark>', '</mark>', '...', 32) as snippet,
        rank
      FROM files_fts f
      WHERE files_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `)

    try {
      const rows = stmt.all(query, limit) as Array<{ path: string; snippet: string; rank: number }>
      return rows.map((r) => ({
        path: r.path,
        snippet: r.snippet,
        rank: r.rank,
        matchCount: 1,
      }))
    } catch {
      return []
    }
  }

  clearAllIndexes(): void {
    this.db.exec('DELETE FROM files_fts')
    this.db.exec('DELETE FROM search_files')
  }

  getIndexedFileCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM search_files').get() as { count: number }
    return row.count
  }

  getDatabaseSize(): number {
    try {
      const stat = fs.statSync(this.dbPath)
      return stat.size
    } catch {
      return 0
    }
  }

  checkIntegrity(): boolean {
    try {
      const result = this.db.pragma('integrity_check') as Array<{ integrity_check: string }>
      return result.length === 1 && result[0].integrity_check === 'ok'
    } catch {
      return false
    }
  }

  close(): void {
    if (this.db.open) {
      this.db.pragma('optimize')
      this.db.close()
    }
  }
}

function computeHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16)
}
