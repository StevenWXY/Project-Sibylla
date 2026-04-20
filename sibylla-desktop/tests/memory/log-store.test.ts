import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import { LogStore } from '../../src/main/services/memory/log-store'
import type { LogEntry } from '../../src/main/services/memory/types'

describe('LogStore', () => {
  let tmpDir: string
  let logStore: LogStore

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sibylla-logstore-test-'))
    logStore = new LogStore(tmpDir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
    return {
      id: `log-20260420-${Date.now().toString(36)}`,
      type: 'user-interaction',
      timestamp: '2026-04-20T10:00:00.000Z',
      sessionId: 'session-test',
      summary: 'Test log entry',
      ...overrides,
    }
  }

  describe('append()', () => {
    it('writes entry to JSONL file', async () => {
      const entry = makeEntry()
      await logStore.append(entry)

      const files = await fs.readdir(logStore.logsDir())
      expect(files).toContain('2026-04.jsonl')

      const content = await fs.readFile(path.join(logStore.logsDir(), '2026-04.jsonl'), 'utf-8')
      const lines = content.trim().split('\n')
      expect(lines).toHaveLength(1)
      const parsed = JSON.parse(lines[0])
      expect(parsed.id).toBe(entry.id)
      expect(parsed.summary).toBe('Test log entry')
    })

    it('auto-creates logs directory', async () => {
      const entry = makeEntry()
      await logStore.append(entry)
      const stat = await fs.stat(logStore.logsDir())
      expect(stat.isDirectory()).toBe(true)
    })

    it('does not throw on write failure', async () => {
      const readOnlyStore = new LogStore('/nonexistent/path')
      const entry = makeEntry()
      await expect(readOnlyStore.append(entry)).resolves.toBeUndefined()
    })
  })

  describe('getSince()', () => {
    it('returns entries after the specified timestamp', async () => {
      await logStore.append(makeEntry({ timestamp: '2026-04-19T10:00:00.000Z', id: 'log-old' }))
      await logStore.append(makeEntry({ timestamp: '2026-04-20T10:00:00.000Z', id: 'log-recent' }))
      await logStore.append(makeEntry({ timestamp: '2026-04-21T10:00:00.000Z', id: 'log-future' }))

      const results = await logStore.getSince('2026-04-20T10:00:00.000Z')
      expect(results).toHaveLength(2)
      expect(results.every((e) => e.timestamp >= '2026-04-20T10:00:00.000Z')).toBe(true)
    })

    it('reads across month boundaries', async () => {
      await logStore.append(makeEntry({ timestamp: '2026-03-25T10:00:00.000Z', id: 'log-march' }))
      await logStore.append(makeEntry({ timestamp: '2026-04-05T10:00:00.000Z', id: 'log-april' }))

      const results = await logStore.getSince('2026-03-20T00:00:00.000Z')
      expect(results).toHaveLength(2)
    })

    it('returns empty array when no logs exist', async () => {
      const results = await logStore.getSince('2026-01-01T00:00:00.000Z')
      expect(results).toHaveLength(0)
    })

    it('skips malformed JSONL lines', async () => {
      const dir = logStore.logsDir()
      await fs.mkdir(dir, { recursive: true })
      await fs.appendFile(path.join(dir, '2026-04.jsonl'), 'not-json\n', 'utf-8')
      await logStore.append(makeEntry({ timestamp: '2026-04-20T10:00:00.000Z' }))

      const results = await logStore.getSince('2026-04-01T00:00:00.000Z')
      expect(results).toHaveLength(1)
    })
  })

  describe('countByFilter()', () => {
    it('counts entries by type', async () => {
      await logStore.append(makeEntry({ type: 'user-interaction', timestamp: '2026-04-20T10:00:00.000Z' }))
      await logStore.append(makeEntry({ type: 'decision', timestamp: '2026-04-20T11:00:00.000Z' }))
      await logStore.append(makeEntry({ type: 'user-interaction', timestamp: '2026-04-20T12:00:00.000Z' }))

      const count = await logStore.countByFilter({ type: 'user-interaction' })
      expect(count).toBe(2)
    })

    it('counts entries with since filter', async () => {
      await logStore.append(makeEntry({ timestamp: '2026-04-19T10:00:00.000Z' }))
      await logStore.append(makeEntry({ timestamp: '2026-04-20T10:00:00.000Z' }))
      await logStore.append(makeEntry({ timestamp: '2026-04-21T10:00:00.000Z' }))

      const count = await logStore.countByFilter({ since: '2026-04-20T00:00:00.000Z' })
      expect(count).toBe(2)
    })

    it('counts entries with details filter', async () => {
      await logStore.append(makeEntry({
        timestamp: '2026-04-20T10:00:00.000Z',
        details: { key: 'value', other: 'data' },
      }))
      await logStore.append(makeEntry({
        timestamp: '2026-04-20T11:00:00.000Z',
        details: { key: 'different' },
      }))

      const count = await logStore.countByFilter({ details: { key: 'value' } })
      expect(count).toBe(1)
    })

    it('returns 0 when no logs directory exists', async () => {
      const count = await logStore.countByFilter({ type: 'user-interaction' })
      expect(count).toBe(0)
    })
  })
})
