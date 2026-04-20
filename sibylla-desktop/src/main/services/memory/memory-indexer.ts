import type Database from 'better-sqlite3'
import { logger } from '../../utils/logger'
import type {
  MemoryEntry,
  MemorySection,
  SearchOptions,
  HybridSearchResult,
  ExtractionReport,
  EmbeddingProvider,
  SimilarityIndexProvider,
} from './types'
import { MemoryFileManager } from './memory-file-manager'

const DEFAULT_WEIGHTS = { vector: 0.6, bm25: 0.3, timeDecay: 0.1 }
const BATCH_SIZE = 32

/**
 * MemoryIndexer — hybrid search engine combining sqlite-vec vector search,
 * FTS5 full-text search, and time-decay scoring.
 *
 * Formula: finalScore = w_vec * cosine + w_bm25 * normalized_bm25 + w_td * time_decay
 *
 * Degradation chain:
 *   1. Full hybrid (vec + FTS5 + time_decay)
 *   2. FTS5-only (when embedding or sqlite-vec unavailable)
 *   3. Empty results (caller falls back to LocalRagEngine)
 */
export class MemoryIndexer implements SimilarityIndexProvider {
  private vecAvailable = false

  constructor(
    private readonly db: Database.Database,
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly workspaceRoot: string,
  ) {}

  /**
   * Initialize schema and check sqlite-vec availability.
   * Does NOT load the embedding model — that happens lazily.
   */
  async initialize(): Promise<void> {
    this.tryLoadVecExtension()
    this.createSchema()
    this.registerUDFs()
    const health = await this.verifyHealth()
    if (!health.healthy) {
      logger.warn('[MemoryIndexer] Index unhealthy after init, triggering rebuild', {
        reason: health.reason,
      })
    }
    logger.info('[MemoryIndexer] Initialized', {
      vecAvailable: this.vecAvailable,
    })
  }

  // ─── Schema ───────────────────────────────────────────────────────

  private tryLoadVecExtension(): void {
    try {
      this.db.loadExtension('vec0')
      this.vecAvailable = true
    } catch {
      this.vecAvailable = false
      logger.warn('[MemoryIndexer] sqlite-vec unavailable, FTS5-only mode')
    }
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_entries (
        id TEXT PRIMARY KEY,
        section TEXT NOT NULL,
        content TEXT NOT NULL,
        confidence REAL,
        hits INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT,
        is_archived INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_entries_section ON memory_entries(section);
      CREATE INDEX IF NOT EXISTS idx_entries_archived ON memory_entries(is_archived);
    `)

    if (this.vecAvailable) {
      try {
        this.db.exec(
          `CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec USING vec0(embedding float[384]);`,
        )
      } catch (err) {
        this.vecAvailable = false
        logger.warn('[MemoryIndexer] Failed to create vec0 table, falling back to FTS5-only', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
        id, content, section,
        tokenize='unicode61'
      );
    `)
  }

  /**
   * Register custom SQL functions for BM25 normalization and time decay.
   */
  private registerUDFs(): void {
    // normalize_bm25: convert raw BM25 score (negative, lower = better)
    // into 0..1 range (higher = better)
    this.db.function('normalize_bm25', (rawBm25: number | null): number => {
      if (rawBm25 === null || rawBm25 === 0) return 0
      // FTS5 bm25() returns negative values; negate to get positive
      const positive = Math.abs(rawBm25)
      return 1 / (1 + Math.log(1 + positive))
    })

    // time_decay: 1 / (1 + ageDays / 30)
    this.db.function('time_decay', (updatedAt: string | null): number => {
      if (!updatedAt) return 0
      const ageMs = Date.now() - new Date(updatedAt).getTime()
      const ageDays = Math.max(0, ageMs / (1000 * 60 * 60 * 24))
      return 1 / (1 + ageDays / 30)
    })
  }

  // ─── Write operations ─────────────────────────────────────────────

  async upsert(entry: MemoryEntry, isArchived = false): Promise<void> {
    // Compute embedding BEFORE the synchronous transaction.
    // better-sqlite3 transactions are synchronous, so all async work must complete first.
    let embedding: number[] | null = null
    if (this.embeddingProvider.isAvailable() && this.vecAvailable) {
      try {
        const embeddings = await this.embeddingProvider.embed([entry.content])
        embedding = embeddings[0] ?? null
      } catch (err) {
        logger.warn('[MemoryIndexer] Embedding failed for entry, skipping vector index', {
          entryId: entry.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO memory_entries
           (id, section, content, confidence, hits, created_at, updated_at, is_archived)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          entry.id,
          entry.section,
          entry.content,
          entry.confidence ?? null,
          entry.hits ?? 0,
          entry.createdAt,
          new Date().toISOString(),
          isArchived ? 1 : 0,
        )

      if (embedding && this.vecAvailable) {
        // Get the rowid from memory_entries for vec table linking
        const row = this.db
          .prepare('SELECT rowid FROM memory_entries WHERE id = ?')
          .get(entry.id) as { rowid: number } | undefined
        if (row) {
          const vecBuf = Buffer.from(new Float32Array(embedding).buffer)
          this.db
            .prepare('INSERT OR REPLACE INTO memory_vec(rowid, embedding) VALUES (?, ?)')
            .run(row.rowid, vecBuf)
        }
      }

      // FTS5: delete first, then insert to handle OR REPLACE pattern
      this.db.prepare('DELETE FROM memory_fts WHERE id = ?').run(entry.id)
      this.db
        .prepare('INSERT INTO memory_fts(id, content, section) VALUES (?, ?, ?)')
        .run(entry.id, entry.content, entry.section)
    })()
  }

  async remove(id: string): Promise<void> {
    this.db.transaction(() => {
      if (this.vecAvailable) {
        const row = this.db
          .prepare('SELECT rowid FROM memory_entries WHERE id = ?')
          .get(id) as { rowid: number } | undefined
        if (row) {
          this.db.prepare('DELETE FROM memory_vec WHERE rowid = ?').run(row.rowid)
        }
      }
      this.db.prepare('DELETE FROM memory_fts WHERE id = ?').run(id)
      this.db.prepare('DELETE FROM memory_entries WHERE id = ?').run(id)
    })()
  }

  // ─── Search operations ────────────────────────────────────────────

  /**
   * Hybrid search: vector similarity + BM25 + time decay.
   * Falls back to FTS5-only if embedding is unavailable.
   */
  async search(query: string, options: SearchOptions = {}): Promise<HybridSearchResult[]> {
    const {
      limit = 10,
      sectionFilter,
      includeArchived = false,
      weights = DEFAULT_WEIGHTS,
      minConfidence,
    } = options

    // Attempt hybrid search if both embedding and vec extension are available
    if (this.embeddingProvider.isAvailable() && this.vecAvailable) {
      try {
        const embeddings = await this.embeddingProvider.embed([query])
        const queryEmbedding = embeddings[0]
        if (queryEmbedding) {
          return this.searchHybrid(
            queryEmbedding,
            query,
            limit,
            sectionFilter,
            includeArchived,
            weights,
            minConfidence,
          )
        }
      } catch (err) {
        logger.warn('[MemoryIndexer] Hybrid search embedding failed, falling back to FTS5', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // Fallback: FTS5-only
    return this.searchFtsOnly(query, options)
  }

  /**
   * Full hybrid search combining vec + FTS5 + time_decay.
   */
  private searchHybrid(
    queryEmbedding: number[],
    queryText: string,
    limit: number,
    sectionFilter?: MemorySection[],
    includeArchived = false,
    weights = DEFAULT_WEIGHTS,
    minConfidence?: number,
  ): HybridSearchResult[] {
    const expandedLimit = limit * 3
    const vecBuf = Buffer.from(new Float32Array(queryEmbedding).buffer)
    const sanitizedQuery = this.sanitizeFtsQuery(queryText)
    if (!sanitizedQuery) {
      return []
    }

    try {
      // Step 1: Get vector similarity results
      const vecRows = this.db
        .prepare(
          `SELECT m.*, (1.0 - vec_distance_cosine(v.embedding, ?)) AS vec_score
           FROM memory_vec v
           JOIN memory_entries m ON v.rowid = m.rowid
           ORDER BY vec_distance_cosine(v.embedding, ?) ASC
           LIMIT ?`,
        )
        .all(vecBuf, vecBuf, expandedLimit) as RawEntryRow[]

      // Step 2: Get FTS5 results
      const ftsRows = this.db
        .prepare(
          `SELECT id, bm25(memory_fts) AS bm25_raw
           FROM memory_fts
           WHERE memory_fts MATCH ?
           LIMIT ?`,
        )
        .all(sanitizedQuery, expandedLimit) as Array<{ id: string; bm25_raw: number }>

      // Build BM25 score map
      const bm25Map = new Map<string, number>()
      for (const fRow of ftsRows) {
        bm25Map.set(fRow.id, fRow.bm25_raw)
      }

      // Step 3: Merge and compute final scores
      const results: HybridSearchResult[] = []
      for (const row of vecRows) {
        if (!includeArchived && row.is_archived === 1) continue
        if (sectionFilter && sectionFilter.length > 0 && !sectionFilter.includes(row.section as MemorySection)) continue
        if (minConfidence !== undefined && (row.confidence ?? 0) < minConfidence) continue

        const vecScore = row.vec_score ?? 0
        const rawBm25 = bm25Map.get(row.id) ?? 0
        const normalizedBm25 = this.normalizeBm25(rawBm25)
        const td = this.timeDecay(row.updated_at)

        const finalScore =
          weights.vector * vecScore +
          weights.bm25 * normalizedBm25 +
          weights.timeDecay * td

        results.push({
          id: row.id,
          section: row.section as MemorySection,
          content: row.content,
          confidence: row.confidence ?? 0,
          hits: row.hits ?? 0,
          isArchived: row.is_archived === 1,
          vecScore,
          bm25Score: normalizedBm25,
          finalScore,
        })
      }

      // Also include FTS-only hits not in vec results
      const vecIds = new Set(results.map((r) => r.id))
      for (const fRow of ftsRows) {
        if (vecIds.has(fRow.id)) continue

        const entryRow = this.db
          .prepare('SELECT * FROM memory_entries WHERE id = ?')
          .get(fRow.id) as RawEntryRow | undefined
        if (!entryRow) continue
        if (!includeArchived && entryRow.is_archived === 1) continue
        if (sectionFilter && sectionFilter.length > 0 && !sectionFilter.includes(entryRow.section as MemorySection)) continue
        if (minConfidence !== undefined && (entryRow.confidence ?? 0) < minConfidence) continue

        const normalizedBm25 = this.normalizeBm25(fRow.bm25_raw)
        const td = this.timeDecay(entryRow.updated_at)
        const finalScore =
          weights.bm25 * normalizedBm25 + weights.timeDecay * td

        results.push({
          id: entryRow.id,
          section: entryRow.section as MemorySection,
          content: entryRow.content,
          confidence: entryRow.confidence ?? 0,
          hits: entryRow.hits ?? 0,
          isArchived: entryRow.is_archived === 1,
          vecScore: 0,
          bm25Score: normalizedBm25,
          finalScore,
        })
      }

      results.sort((a, b) => b.finalScore - a.finalScore)
      return results.slice(0, limit)
    } catch (err) {
      logger.warn('[MemoryIndexer] Hybrid search SQL failed, falling back to FTS5', {
        error: err instanceof Error ? err.message : String(err),
      })
      return this.searchFtsOnly(queryText, { limit, sectionFilter, includeArchived, minConfidence })
    }
  }

  /**
   * FTS5-only search fallback when vector search is unavailable.
   * Weights: BM25 0.9 + time_decay 0.1
   */
  private searchFtsOnly(query: string, options: SearchOptions = {}): HybridSearchResult[] {
    const { limit = 10, sectionFilter, includeArchived = false, minConfidence } = options
    const sanitizedQuery = this.sanitizeFtsQuery(query)
    if (!sanitizedQuery) {
      return []
    }

    try {
      const ftsRows = this.db
        .prepare(
          `SELECT f.id, bm25(memory_fts) AS bm25_raw
           FROM memory_fts f
           WHERE memory_fts MATCH ?
           LIMIT ?`,
        )
        .all(sanitizedQuery, limit * 3) as Array<{ id: string; bm25_raw: number }>

      const results: HybridSearchResult[] = []
      for (const fRow of ftsRows) {
        const entryRow = this.db
          .prepare('SELECT * FROM memory_entries WHERE id = ?')
          .get(fRow.id) as RawEntryRow | undefined
        if (!entryRow) continue
        if (!includeArchived && entryRow.is_archived === 1) continue
        if (sectionFilter && sectionFilter.length > 0 && !sectionFilter.includes(entryRow.section as MemorySection)) continue
        if (minConfidence !== undefined && (entryRow.confidence ?? 0) < minConfidence) continue

        const normalizedBm25 = this.normalizeBm25(fRow.bm25_raw)
        const td = this.timeDecay(entryRow.updated_at)
        const finalScore = 0.9 * normalizedBm25 + 0.1 * td

        results.push({
          id: entryRow.id,
          section: entryRow.section as MemorySection,
          content: entryRow.content,
          confidence: entryRow.confidence ?? 0,
          hits: entryRow.hits ?? 0,
          isArchived: entryRow.is_archived === 1,
          vecScore: 0,
          bm25Score: normalizedBm25,
          finalScore,
        })
      }

      results.sort((a, b) => b.finalScore - a.finalScore)
      return results.slice(0, limit)
    } catch (err) {
      logger.warn('[MemoryIndexer] FTS5 search failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }

  // ─── Index maintenance ────────────────────────────────────────────

  /**
   * Process an ExtractionReport: index added/merged entries, remove discarded.
   */
  async indexReport(report: ExtractionReport): Promise<void> {
    for (const entry of report.added) {
      await this.upsert(entry)
    }
    for (const mergeRecord of report.merged) {
      // merged entries are also present in report.added
      // The upsert above handles them via INSERT OR REPLACE
      logger.debug('[MemoryIndexer] Merged entry indexed', {
        existing: mergeRecord.existing,
        merged: mergeRecord.merged,
      })
    }
    for (const discarded of report.discarded) {
      await this.remove(discarded.candidate)
    }
  }

  /**
   * Rebuild the entire index from MemoryFileManager data.
   */
  async rebuild(): Promise<void> {
    logger.info('[MemoryIndexer] Starting full index rebuild')

    // Clear index tables
    this.db.exec('DELETE FROM memory_fts;')
    if (this.vecAvailable) {
      this.db.exec('DELETE FROM memory_vec;')
    }
    this.db.exec('DELETE FROM memory_entries;')

    const fileManager = new MemoryFileManager(this.workspaceRoot)
    let entries: MemoryEntry[] = []
    let archivedEntries: MemoryEntry[] = []

    try {
      const snapshot = await fileManager.load()
      entries = snapshot.entries
    } catch (err) {
      logger.error('[MemoryIndexer] Failed to load entries for rebuild', {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    try {
      archivedEntries = await fileManager.loadArchive()
    } catch {
      // Archive may not exist
    }

    let count = 0
    // Index active entries in batches
    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE)
      for (const entry of batch) {
        await this.upsert(entry, false)
        count++
      }
    }

    // Index archived entries in batches
    for (let i = 0; i < archivedEntries.length; i += BATCH_SIZE) {
      const batch = archivedEntries.slice(i, i + BATCH_SIZE)
      for (const entry of batch) {
        await this.upsert(entry, true)
        count++
      }
    }

    logger.info('[MemoryIndexer] Rebuild complete', { count })
  }

  /**
   * Verify index health: check consistency between memory_entries and memory_fts.
   */
  async verifyHealth(): Promise<{ healthy: boolean; reason?: string }> {
    try {
      const entriesCount = this.db
        .prepare('SELECT COUNT(*) AS c FROM memory_entries')
        .get() as { c: number }
      const ftsCount = this.db
        .prepare('SELECT COUNT(*) AS c FROM memory_fts')
        .get() as { c: number }

      if (entriesCount.c !== ftsCount.c) {
        return {
          healthy: false,
          reason: `Index mismatch: memory_entries=${entriesCount.c} vs memory_fts=${ftsCount.c}`,
        }
      }

      if (this.vecAvailable) {
        const vecCount = this.db
          .prepare('SELECT COUNT(*) AS c FROM memory_vec')
          .get() as { c: number }
        // Vec count may be less than entries (when embedding fails for some entries)
        if (vecCount.c > entriesCount.c) {
          return {
            healthy: false,
            reason: `Vec overflow: memory_vec=${vecCount.c} > memory_entries=${entriesCount.c}`,
          }
        }
      }

      return { healthy: true }
    } catch (err) {
      return {
        healthy: false,
        reason: err instanceof Error ? err.message : String(err),
      }
    }
  }

  /**
   * Get entry count for health reporting.
   */
  getEntryCount(): number {
    try {
      const row = this.db
        .prepare('SELECT COUNT(*) AS c FROM memory_entries')
        .get() as { c: number }
      return row.c
    } catch {
      return 0
    }
  }

  // ─── SimilarityIndexProvider interface ─────────────────────────────

  isAvailable(): boolean {
    return true
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embeddingProvider.embed([text])
    return results[0] ?? []
  }

  async getOrComputeEmbedding(entry: MemoryEntry): Promise<number[]> {
    // Check if embedding already exists in memory_vec
    if (this.vecAvailable) {
      const row = this.db
        .prepare('SELECT rowid FROM memory_entries WHERE id = ?')
        .get(entry.id) as { rowid: number } | undefined
      if (row) {
        const vecRow = this.db
          .prepare('SELECT embedding FROM memory_vec WHERE rowid = ?')
          .get(row.rowid) as { embedding: Buffer } | undefined
        if (vecRow) {
          return Array.from(new Float32Array(vecRow.embedding.buffer))
        }
      }
    }

    // Compute and store
    const embeddings = await this.embeddingProvider.embed([entry.content])
    const embedding = embeddings[0] ?? []

    if (embedding.length > 0 && this.vecAvailable) {
      const entryRow = this.db
        .prepare('SELECT rowid FROM memory_entries WHERE id = ?')
        .get(entry.id) as { rowid: number } | undefined
      if (entryRow) {
        const vecBuf = Buffer.from(new Float32Array(embedding).buffer)
        this.db
          .prepare('INSERT OR REPLACE INTO memory_vec(rowid, embedding) VALUES (?, ?)')
          .run(entryRow.rowid, vecBuf)
      }
    }

    return embedding
  }

  // ─── Utility methods ──────────────────────────────────────────────

  /**
   * Sanitize user query for FTS5 MATCH to prevent syntax errors.
   */
  private sanitizeFtsQuery(query: string): string {
    // Remove FTS5 special characters that could cause syntax errors
    const sanitized = query
      .replace(/[{}()[\]^"~*:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (sanitized.length === 0) return ''

    // Quote each term for safe matching
    return sanitized
      .split(/\s+/)
      .filter((term) => term.length > 0)
      .map((term) => `"${term}"`)
      .join(' ')
  }

  /**
   * Normalize raw BM25 score to 0..1 range.
   * FTS5 bm25() returns negative values (lower = better match).
   */
  private normalizeBm25(rawBm25: number): number {
    if (rawBm25 === 0) return 0
    const positive = Math.abs(rawBm25)
    return 1 / (1 + Math.log(1 + positive))
  }

  /**
   * Time decay function: 1 / (1 + ageDays/30).
   * Recent entries score higher.
   */
  private timeDecay(updatedAt: string | null): number {
    if (!updatedAt) return 0
    const ageMs = Date.now() - new Date(updatedAt).getTime()
    const ageDays = Math.max(0, ageMs / (1000 * 60 * 60 * 24))
    return 1 / (1 + ageDays / 30)
  }
}

// ─── Internal types ─────────────────────────────────────────────────

interface RawEntryRow {
  id: string
  section: string
  content: string
  confidence: number | null
  hits: number | null
  created_at: string | null
  updated_at: string | null
  is_archived: number
  vec_score?: number
}
