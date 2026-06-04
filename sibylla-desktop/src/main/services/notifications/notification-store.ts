import Database from 'better-sqlite3'
import { ulid } from 'ulid'
import path from 'path'
import fs from 'fs'
import type {
  Notification,
  NotificationDraft,
  NotificationDismissStats,
} from './types'
import { ARCHIVE_THRESHOLD_DAYS, NOTIFICATION_DB_VERSION } from './constants'
import { logger } from '../../utils/logger'

interface NotificationRow {
  id: string
  type: string
  priority: string
  source_provider: string | null
  source_ref: string | null
  title: string
  body: string | null
  group_key: string
  navigation_kind: string | null
  navigation_payload: string | null
  actions: string | null
  metadata: string | null
  created_at: number
  read_at: number | null
  dismissed_at: number | null
  archived_at: number | null
  stale: number
}

interface DismissStatsRow {
  total: number
  dismissed: number
}

function deserializeNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    type: row.type as Notification['type'],
    priority: row.priority as Notification['priority'],
    source: {
      provider: row.source_provider ?? '',
      ref: row.source_ref ?? undefined,
    },
    title: row.title,
    body: row.body ?? '',
    groupKey: row.group_key,
    navigation: row.navigation_kind
      ? { kind: row.navigation_kind, ...(row.navigation_payload ? JSON.parse(row.navigation_payload) : {}) }
      : undefined,
    actions: row.actions ? JSON.parse(row.actions) : undefined,
    createdAt: row.created_at,
    readAt: row.read_at ?? undefined,
    dismissedAt: row.dismissed_at ?? undefined,
    archivedAt: row.archived_at ?? undefined,
    stale: row.stale === 1,
    metadata: row.metadata ? JSON.parse(row.metadata) : {},
  }
}

export class NotificationStore {
  private db!: Database.Database
  private readonly dbPath: string
  private readonly archiveDir: string
  private archiveRunning = false

  constructor(workspaceRoot: string) {
    this.dbPath = path.join(workspaceRoot, '.sibylla', 'notifications', 'notifications.db')
    this.archiveDir = path.join(workspaceRoot, '.sibylla', 'notifications', 'archive')
  }

  async initialize(): Promise<void> {
    const dir = path.dirname(this.dbPath)
    fs.mkdirSync(dir, { recursive: true })
    fs.mkdirSync(this.archiveDir, { recursive: true })

    this.db = new Database(this.dbPath, {
      verbose: process.env.NODE_ENV === 'development'
        ? (msg?: unknown) => {
            if (typeof msg === 'string' && !msg.startsWith('PRAGMA')) {
              logger.debug('notification-store.sql', { msg })
            }
          }
        : undefined,
    })

    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('cache_size = -16000')

    this.initSchema()
    logger.info('notification-store.initialized', { path: this.dbPath })
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        priority TEXT NOT NULL,
        source_provider TEXT,
        source_ref TEXT,
        title TEXT NOT NULL,
        body TEXT,
        group_key TEXT NOT NULL,
        navigation_kind TEXT,
        navigation_payload TEXT,
        actions TEXT,
        metadata TEXT,
        created_at INTEGER NOT NULL,
        read_at INTEGER,
        dismissed_at INTEGER,
        archived_at INTEGER,
        stale INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS notification_actions (
        id TEXT PRIMARY KEY,
        notification_id TEXT NOT NULL,
        notification_type TEXT NOT NULL,
        source_provider TEXT,
        action TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_type_priority
        ON notifications(type, priority);
      CREATE INDEX IF NOT EXISTS idx_notifications_group_key_created
        ON notifications(group_key, created_at);
      CREATE INDEX IF NOT EXISTS idx_notifications_archived
        ON notifications(archived_at) WHERE archived_at IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_actions_type_source_created
        ON notification_actions(notification_type, source_provider, created_at);
    `)

    const row = this.db.prepare(
      "SELECT value FROM schema_meta WHERE key = 'version'"
    ).get() as { value: number } | undefined

    if (!row) {
      this.db.prepare(
        "INSERT INTO schema_meta (key, value) VALUES ('version', ?)"
      ).run(String(NOTIFICATION_DB_VERSION))
    }
  }

  create(draft: NotificationDraft): Notification {
    const id = ulid()
    const createdAt = Date.now()

    const navigationKind = draft.navigation?.kind ?? null
    const navigationPayload = draft.navigation
      ? JSON.stringify(
          Object.fromEntries(
            Object.entries(draft.navigation).filter(([k]) => k !== 'kind')
          )
        )
      : null

    this.db.prepare(`
      INSERT INTO notifications (
        id, type, priority, source_provider, source_ref,
        title, body, group_key, navigation_kind, navigation_payload,
        actions, metadata, created_at, stale
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      id,
      draft.type,
      draft.priority,
      draft.source.provider ?? null,
      draft.source.ref ?? null,
      draft.title,
      draft.body ?? null,
      draft.groupKey,
      navigationKind,
      navigationPayload,
      draft.actions ? JSON.stringify(draft.actions) : null,
      draft.metadata ? JSON.stringify(draft.metadata) : null,
      createdAt,
    )

    return {
      ...draft,
      id,
      createdAt,
      stale: false,
    }
  }

  getById(id: string): Notification | null {
    const row = this.db.prepare(
      'SELECT * FROM notifications WHERE id = ?'
    ).get(id) as NotificationRow | undefined

    return row ? deserializeNotification(row) : null
  }

  getUnread(options?: { limit?: number; offset?: number }): Notification[] {
    const limit = options?.limit ?? 50
    const offset = options?.offset ?? 0

    const rows = this.db.prepare(`
      SELECT * FROM notifications
      WHERE read_at IS NULL AND archived_at IS NULL AND stale = 0
      ORDER BY
        CASE priority
          WHEN 'urgent' THEN 0
          WHEN 'high' THEN 1
          WHEN 'normal' THEN 2
          WHEN 'low' THEN 3
        END,
        created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as NotificationRow[]

    return rows.map(deserializeNotification)
  }

  getByGroupKey(groupKey: string): Notification[] {
    const rows = this.db.prepare(
      'SELECT * FROM notifications WHERE group_key = ? ORDER BY created_at DESC'
    ).all(groupKey) as NotificationRow[]

    return rows.map(deserializeNotification)
  }

  markRead(id: string): void {
    this.db.prepare(
      'UPDATE notifications SET read_at = ? WHERE id = ?'
    ).run(Date.now(), id)
  }

  markDismissed(id: string): void {
    this.db.prepare(
      'UPDATE notifications SET dismissed_at = ? WHERE id = ?'
    ).run(Date.now(), id)
  }

  markStale(id: string): void {
    this.db.prepare(
      'UPDATE notifications SET stale = 1 WHERE id = ?'
    ).run(id)
  }

  archiveStale(): number {
    if (this.archiveRunning) return 0
    this.archiveRunning = true

    try {
      const threshold = Date.now() - ARCHIVE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000

      const rows = this.db.prepare(`
        SELECT * FROM notifications
        WHERE created_at < ? AND read_at IS NULL AND archived_at IS NULL
      `).all(threshold) as NotificationRow[]

      if (rows.length === 0) return 0

      const now = Date.now()
      const archiveMonth = new Date().toISOString().slice(0, 7)
      const archivePath = path.join(this.archiveDir, `${archiveMonth}.jsonl`)

      const appendLines = rows.map(row => JSON.stringify(deserializeNotification(row))).join('\n') + '\n'

      const tmpPath = archivePath + '.tmp'
      if (fs.existsSync(archivePath)) {
        fs.copyFileSync(archivePath, tmpPath)
      }
      fs.appendFileSync(tmpPath, appendLines)
      fs.renameSync(tmpPath, archivePath)

      const ids = rows.map(r => r.id)
      const placeholders = ids.map(() => '?').join(',')
      this.db.prepare(
        `UPDATE notifications SET archived_at = ? WHERE id IN (${placeholders})`
      ).run(now, ...ids)

      logger.info('notification-store.archived', { count: rows.length })
      return rows.length
    } finally {
      this.archiveRunning = false
    }
  }

  findByGroupKeyRecent(groupKey: string, windowMs: number): Notification | null {
    const threshold = Date.now() - windowMs
    const row = this.db.prepare(`
      SELECT * FROM notifications
      WHERE group_key = ? AND created_at > ?
      ORDER BY created_at DESC LIMIT 1
    `).get(groupKey, threshold) as NotificationRow | undefined

    return row ? deserializeNotification(row) : null
  }

  updateExisting(id: string, updates: Partial<Pick<Notification, 'title' | 'body'>>): void {
    const sets: string[] = []
    const values: unknown[] = []

    if (updates.title !== undefined) {
      sets.push('title = ?')
      values.push(updates.title)
    }
    if (updates.body !== undefined) {
      sets.push('body = ?')
      values.push(updates.body)
    }

    if (sets.length === 0) return

    values.push(id)
    this.db.prepare(
      `UPDATE notifications SET ${sets.join(', ')} WHERE id = ?`
    ).run(...values)
  }

  flushToDisk(): void {
    this.db.pragma('wal_checkpoint(TRUNCATE)')
  }

  recordAction(
    notificationId: string,
    notificationType: string,
    sourceProvider: string | undefined,
    action: string,
  ): void {
    this.db.prepare(`
      INSERT INTO notification_actions (id, notification_id, notification_type, source_provider, action, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(ulid(), notificationId, notificationType, sourceProvider ?? null, action, Date.now())
  }

  getDismissStats(
    type: string,
    sourceProvider: string | undefined,
    windowMs: number,
  ): NotificationDismissStats {
    const threshold = Date.now() - windowMs

    const row = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN action = 'dismiss' THEN 1 ELSE 0 END) as dismissed
      FROM notification_actions
      WHERE notification_type = ?
        AND (source_provider = ? OR (? IS NULL AND source_provider IS NULL))
        AND created_at > ?
    `).get(type, sourceProvider ?? null, sourceProvider ?? null, threshold) as DismissStatsRow

    return {
      total: row?.total ?? 0,
      dismissed: row?.dismissed ?? 0,
    }
  }

  getUnreadCount(): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM notifications WHERE read_at IS NULL AND archived_at IS NULL AND stale = 0'
    ).get() as { count: number }
    return row.count
  }

  close(): void {
    if (this.db.open) {
      this.db.pragma('optimize')
      this.db.close()
    }
  }
}
