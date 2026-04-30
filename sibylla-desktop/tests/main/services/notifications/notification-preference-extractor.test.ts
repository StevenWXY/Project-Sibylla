import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import Database from 'better-sqlite3'
import { NotificationPreferenceExtractor } from '../../../../src/main/services/notifications/notification-preference-extractor'
import type { ExtractionReport, ExtractionInput } from '../../../../src/main/services/memory/types'
import type { MemoryEntry } from '../../../../src/main/services/memory/types'

describe('NotificationPreferenceExtractor', () => {
  let db: Database.Database
  let extractor: NotificationPreferenceExtractor

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('journal_mode = WAL')

    db.exec(`
      CREATE TABLE notification_actions (
        id TEXT PRIMARY KEY,
        notification_id TEXT NOT NULL,
        notification_type TEXT NOT NULL,
        source_provider TEXT,
        action TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `)

    extractor = new NotificationPreferenceExtractor(db)
  })

  afterEach(() => {
    db.close()
  })

  function insertAction(type: string, provider: string | null, action: string, createdAt: number) {
    db.prepare(
      'INSERT INTO notification_actions (id, notification_id, notification_type, source_provider, action, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(`act-${Date.now()}-${Math.random()}`, 'notif-1', type, provider, action, createdAt)
  }

  const mockReport: ExtractionReport = {
    added: [],
    merged: [],
    discarded: [],
    durationMs: 100,
    tokenCost: { input: 0, output: 0 },
  }

  const mockContext: ExtractionInput = {
    logs: [],
    existingMemory: [],
    workspaceContext: { name: 'test' },
  }

  it('should return empty candidates when no data', () => {
    const candidates = extractor.process(mockReport, mockContext)
    expect(candidates).toHaveLength(0)
  })

  it('should return candidates for high dismissal rate types', () => {
    const now = Date.now()

    for (let i = 0; i < 8; i++) {
      insertAction('system.indexed', 'indexer', 'dismiss', now - 1000 * i)
    }
    insertAction('system.indexed', 'indexer', 'click', now)

    const candidates = extractor.process(mockReport, mockContext)
    expect(candidates).toHaveLength(1)
    expect(candidates[0].section).toBe('user_preference')
    expect(candidates[0].confidence).toBeLessThanOrEqual(0.95)
    expect(candidates[0].content).toContain('system.indexed')
  })

  it('should not return candidates for low dismissal rate', () => {
    const now = Date.now()

    for (let i = 0; i < 6; i++) {
      insertAction('system.indexed', 'indexer', 'click', now - 1000 * i)
    }
    insertAction('system.indexed', 'indexer', 'dismiss', now)

    const candidates = extractor.process(mockReport, mockContext)
    expect(candidates).toHaveLength(0)
  })

  it('should not return candidates when sample size <= 5', () => {
    const now = Date.now()
    for (let i = 0; i < 5; i++) {
      insertAction('system.indexed', 'indexer', 'dismiss', now - 1000 * i)
    }

    const candidates = extractor.process(mockReport, mockContext)
    expect(candidates).toHaveLength(0)
  })
})
