import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import type { SerializedSpan, TraceQueryFilter, SpanEvent } from './types'
import { logger } from '../../utils/logger'

export interface TraceStats {
  totalSpans: number
  totalTraces: number
  dbSizeBytes: number
}

export interface RecentTraceInfo {
  traceId: string
  startTime: number
  spanCount: number
}

export interface TraceExportBundle {
  version: 1
  exportedAt: number
  workspaceId: string
  spans: SerializedSpan[]
  checksum: string
}

interface SpanRow {
  trace_id: string
  span_id: string
  parent_span_id: string | null
  name: string
  kind: string
  start_time_ms: number
  end_time_ms: number
  duration_ms: number
  status: string
  status_message: string | null
  attributes: string
  events: string
  conversation_id: string | null
  task_id: string | null
  workspace_id: string | null
}

export class TraceStore {
  private db!: Database.Database
  private readonly dbPath: string
  private readonly workspaceRoot: string

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot
    this.dbPath = path.join(workspaceRoot, '.sibylla', 'trace', 'trace.db')
  }

  storePath(): string {
    return this.dbPath
  }

  async initialize(): Promise<void> {
    const dir = path.dirname(this.dbPath)
    fs.mkdirSync(dir, { recursive: true })

    this.runIntegrityCheck()

    this.db = new Database(this.dbPath, {
      verbose: process.env.NODE_ENV === 'development'
        ? (msg: string) => {
            if (typeof msg === 'string' && !msg.startsWith('PRAGMA')) {
              logger.debug('trace-store.sql', { msg })
            }
          }
        : undefined,
    })

    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('cache_size = -16000')

    this.initSchema()
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS spans (
        trace_id TEXT NOT NULL,
        span_id TEXT PRIMARY KEY,
        parent_span_id TEXT,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        start_time_ms INTEGER NOT NULL,
        end_time_ms INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        status TEXT NOT NULL,
        status_message TEXT,
        attributes TEXT NOT NULL,
        events TEXT NOT NULL,
        conversation_id TEXT,
        task_id TEXT,
        workspace_id TEXT
      );

      CREATE TABLE IF NOT EXISTS locked_traces (
        trace_id TEXT PRIMARY KEY,
        locked_at INTEGER NOT NULL,
        reason TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_trace_id ON spans(trace_id);
      CREATE INDEX IF NOT EXISTS idx_start_time ON spans(start_time_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_conversation ON spans(conversation_id, start_time_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_task ON spans(task_id);
      CREATE INDEX IF NOT EXISTS idx_status_duration ON spans(status, duration_ms DESC);
      CREATE INDEX IF NOT EXISTS idx_name_time ON spans(name, start_time_ms DESC);
    `)
  }

  async write(span: SerializedSpan): Promise<void> {
    this.db.prepare(`
      INSERT OR REPLACE INTO spans (
        trace_id, span_id, parent_span_id, name, kind,
        start_time_ms, end_time_ms, duration_ms,
        status, status_message, attributes, events,
        conversation_id, task_id, workspace_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      span.traceId,
      span.spanId,
      span.parentSpanId ?? null,
      span.name,
      span.kind,
      span.startTimeMs,
      span.endTimeMs,
      span.durationMs,
      span.status,
      span.statusMessage ?? null,
      JSON.stringify(span.attributes),
      JSON.stringify(span.events),
      span.conversationId ?? null,
      span.taskId ?? null,
      span.workspaceId ?? null,
    )
  }

  writeSync(span: SerializedSpan): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO spans (
        trace_id, span_id, parent_span_id, name, kind,
        start_time_ms, end_time_ms, duration_ms,
        status, status_message, attributes, events,
        conversation_id, task_id, workspace_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      span.traceId,
      span.spanId,
      span.parentSpanId ?? null,
      span.name,
      span.kind,
      span.startTimeMs,
      span.endTimeMs,
      span.durationMs,
      span.status,
      span.statusMessage ?? null,
      JSON.stringify(span.attributes),
      JSON.stringify(span.events),
      span.conversationId ?? null,
      span.taskId ?? null,
      span.workspaceId ?? null,
    )
  }

  async writeBatch(spans: SerializedSpan[]): Promise<void> {
    if (spans.length === 0) return
    const batchInsert = this.db.transaction(() => {
      for (const span of spans) {
        this.writeSync(span)
      }
    })
    batchInsert()
  }

  getTraceTree(traceId: string): SerializedSpan[] {
    const rows = this.db.prepare(
      'SELECT * FROM spans WHERE trace_id = ? ORDER BY start_time_ms ASC'
    ).all(traceId) as SpanRow[]
    return rows.map(row => this.rowToSpan(row))
  }

  getMultipleTraces(traceIds: string[]): SerializedSpan[] {
    if (traceIds.length === 0) return []
    if (traceIds.length > 100) {
      const result: SerializedSpan[] = []
      for (let i = 0; i < traceIds.length; i += 100) {
        const batch = traceIds.slice(i, i + 100)
        result.push(...this.getMultipleTraces(batch))
      }
      return result
    }
    const placeholders = traceIds.map(() => '?').join(',')
    const rows = this.db.prepare(
      `SELECT * FROM spans WHERE trace_id IN (${placeholders}) ORDER BY start_time_ms ASC`
    ).all(...traceIds) as SpanRow[]
    return rows.map(row => this.rowToSpan(row))
  }

  query(filter: TraceQueryFilter): SerializedSpan[] {
    const { sql, params } = this.buildQuery(filter)
    const rows = this.db.prepare(sql).all(...params) as SpanRow[]
    return rows.map(row => this.rowToSpan(row))
  }

  private buildQuery(filter: TraceQueryFilter): { sql: string; params: unknown[] } {
    const conditions: string[] = []
    const params: unknown[] = []

    if (filter.traceId !== undefined) {
      conditions.push('trace_id = ?')
      params.push(filter.traceId)
    }
    if (filter.spanName !== undefined) {
      conditions.push('name LIKE ?')
      params.push(`%${filter.spanName}%`)
    }
    if (filter.kind !== undefined) {
      conditions.push('kind = ?')
      params.push(filter.kind)
    }
    if (filter.status !== undefined) {
      conditions.push('status = ?')
      params.push(filter.status)
    }
    if (filter.conversationId !== undefined) {
      conditions.push('conversation_id = ?')
      params.push(filter.conversationId)
    }
    if (filter.taskId !== undefined) {
      conditions.push('task_id = ?')
      params.push(filter.taskId)
    }
    if (filter.startTimeFrom !== undefined) {
      conditions.push('start_time_ms >= ?')
      params.push(filter.startTimeFrom)
    }
    if (filter.startTimeTo !== undefined) {
      conditions.push('start_time_ms <= ?')
      params.push(filter.startTimeTo)
    }
    if (filter.minDurationMs !== undefined) {
      conditions.push('duration_ms >= ?')
      params.push(filter.minDurationMs)
    }
    if (filter.attributeFilters !== undefined) {
      for (const af of filter.attributeFilters) {
        conditions.push("CAST(json_extract(attributes, ?) AS TEXT) = ?")
        params.push(`$.${af.key}`, af.value)
      }
    }

    let sql = 'SELECT * FROM spans'
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ')
    }
    sql += ' ORDER BY start_time_ms DESC'

    if (filter.limit !== undefined) {
      sql += ' LIMIT ?'
      params.push(filter.limit)
    }
    if (filter.offset !== undefined) {
      sql += ' OFFSET ?'
      params.push(filter.offset)
    }

    return { sql, params }
  }

  lockTrace(traceId: string, reason?: string): void {
    this.db.prepare(
      'INSERT OR REPLACE INTO locked_traces (trace_id, locked_at, reason) VALUES (?, ?, ?)'
    ).run(traceId, Date.now(), reason ?? null)
  }

  unlockTrace(traceId: string): void {
    this.db.prepare('DELETE FROM locked_traces WHERE trace_id = ?').run(traceId)
  }

  cleanup(retentionDays: number): { deleted: number } {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    const deleteLockedStale = this.db.prepare(
      'DELETE FROM locked_traces WHERE locked_at < ?'
    ).run(cutoff)
    void deleteLockedStale
    const result = this.db.prepare(`
      DELETE FROM spans
      WHERE start_time_ms < ?
        AND trace_id NOT IN (SELECT trace_id FROM locked_traces)
    `).run(cutoff)
    return { deleted: result.changes }
  }

  getStats(): TraceStats {
    const row = this.db.prepare(
      'SELECT COUNT(*) as totalSpans, COUNT(DISTINCT trace_id) as totalTraces FROM spans'
    ).get() as { totalSpans: number; totalTraces: number }

    let dbSizeBytes = 0
    try {
      const stat = fs.statSync(this.dbPath)
      const walStat = fs.statSync(this.dbPath + '-wal', { throwIfNoEntry: false })
      dbSizeBytes = stat.size + (walStat?.size ?? 0)
    } catch {
      dbSizeBytes = 0
    }

    if (dbSizeBytes > 500 * 1024 * 1024) {
      logger.warn('trace-store.db.size-exceeds-500mb', { dbSizeBytes })
    }

    return {
      totalSpans: row.totalSpans,
      totalTraces: row.totalTraces,
      dbSizeBytes,
    }
  }

  getRecentTraces(limit: number): RecentTraceInfo[] {
    const rows = this.db.prepare(`
      SELECT trace_id AS traceId, MIN(start_time_ms) AS startTime, COUNT(*) AS spanCount
      FROM spans
      GROUP BY trace_id
      ORDER BY startTime DESC
      LIMIT ?
    `).all(limit) as RecentTraceInfo[]
    return rows
  }

  exportTrace(traceIds: string[], workspaceId?: string): TraceExportBundle {
    const spans = this.getMultipleTraces(traceIds)
    const checksum = crypto
      .createHash('sha256')
      .update(JSON.stringify(spans))
      .digest('hex')

    return {
      version: 1,
      exportedAt: Date.now(),
      workspaceId: workspaceId ?? '',
      spans,
      checksum,
    }
  }

  private runIntegrityCheck(): void {
    if (!fs.existsSync(this.dbPath)) return

    try {
      const tempDb = new Database(this.dbPath, { readonly: true })
      const result = tempDb.pragma('integrity_check') as Array<{ integrity_check: string }>
      tempDb.close()

      const isOk = result.length === 1 && result[0].integrity_check === 'ok'
      if (!isOk) {
        const corruptedName = `trace.db.corrupted-${Date.now()}`
        const corruptedPath = path.join(path.dirname(this.dbPath), corruptedName)
        logger.error('trace-store.integrity-check.failed', { corruptedName })
        fs.renameSync(this.dbPath, corruptedPath)
      }
    } catch {
      const corruptedName = `trace.db.corrupted-${Date.now()}`
      const corruptedPath = path.join(path.dirname(this.dbPath), corruptedName)
      logger.error('trace-store.integrity-check.open-failed', { corruptedName })
      try {
        fs.renameSync(this.dbPath, corruptedPath)
      } catch {
        // File may not exist, ignore
      }
    }
  }

  close(): void {
    if (this.db?.open) {
      this.db.pragma('optimize')
      this.db.close()
    }
  }

  private rowToSpan(row: SpanRow): SerializedSpan {
    let attributes: Record<string, unknown> = {}
    let events: SpanEvent[] = []

    try {
      attributes = JSON.parse(row.attributes)
    } catch {
      attributes = {}
    }
    try {
      events = JSON.parse(row.events)
    } catch {
      events = []
    }

    return {
      traceId: row.trace_id,
      spanId: row.span_id,
      parentSpanId: row.parent_span_id ?? undefined,
      name: row.name,
      kind: row.kind as import('./types').SpanKind,
      startTimeMs: row.start_time_ms,
      endTimeMs: row.end_time_ms,
      durationMs: row.duration_ms,
      status: row.status as import('./types').SpanStatus,
      statusMessage: row.status_message ?? undefined,
      attributes,
      events,
      conversationId: row.conversation_id ?? undefined,
      taskId: row.task_id ?? undefined,
      workspaceId: row.workspace_id ?? undefined,
    }
  }
}
