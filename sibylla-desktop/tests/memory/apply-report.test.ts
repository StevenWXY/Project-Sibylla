import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import { MemoryManager } from '../../src/main/services/memory-manager'
import { MemoryFileManager } from '../../src/main/services/memory/memory-file-manager'
import { LogStore } from '../../src/main/services/memory/log-store'
import { EvolutionLog } from '../../src/main/services/memory/evolution-log'
import type { ExtractionReport, MemoryEntry, MemorySection } from '../../src/main/services/memory/types'

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: 'pref-001',
    section: 'user_preference' as MemorySection,
    content: 'User prefers dark mode',
    confidence: 0.85,
    hits: 0,
    createdAt: '2026-04-20T10:00:00.000Z',
    updatedAt: '2026-04-20T10:00:00.000Z',
    sourceLogIds: ['log-001'],
    locked: false,
    tags: [],
    ...overrides,
  }
}

describe('applyExtractionReport', () => {
  let tmpDir: string
  let mm: MemoryManager
  let evolutionLog: EvolutionLog

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sibylla-apply-report-test-'))
    const v2Dir = path.join(tmpDir, '.sibylla', 'memory')
    await fs.mkdir(v2Dir, { recursive: true })

    const fileManager = new MemoryFileManager(tmpDir)
    const logStore = new LogStore(tmpDir)
    evolutionLog = new EvolutionLog(tmpDir)

    mm = new MemoryManager()
    mm.setWorkspacePath(tmpDir)
    mm.setV2Components({ fileManager, logStore, evolutionLog })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('1. Correctly updates snapshot', () => {
    it('adds new entries and updates merged entries in MemoryFileManager', async () => {
      const newEntry = makeEntry({ id: 'pref-002', content: 'New preference' })
      const report: ExtractionReport = {
        added: [newEntry],
        merged: [],
        discarded: [],
        durationMs: 100,
        tokenCost: { input: 50, output: 20 },
      }

      const result = await mm.applyExtractionReport(report)
      expect(result.compressionNeeded).toBe(false)

      const entries = await mm.getAllEntries()
      expect(entries.some((e) => e.id === 'pref-002')).toBe(true)
    })
  })

  describe('2. Added entries trigger EvolutionLog type=add', () => {
    it('appends add event to CHANGELOG.md', async () => {
      const newEntry = makeEntry({ id: 'pref-003', content: 'Another preference' })
      const report: ExtractionReport = {
        added: [newEntry],
        merged: [],
        discarded: [],
        durationMs: 100,
        tokenCost: { input: 50, output: 20 },
      }

      await mm.applyExtractionReport(report)

      const events = await evolutionLog.query({ entryId: 'pref-003' })
      expect(events.length).toBe(1)
      expect(events[0]!.type).toBe('add')
    })
  })

  describe('3. Merged entries trigger EvolutionLog type=merge', () => {
    it('appends merge event with before/after', async () => {
      const existingEntry = makeEntry({ id: 'pref-004', content: 'Old content', confidence: 0.7 })
      const fileManager = new MemoryFileManager(tmpDir)
      const snapshot = await fileManager.load()
      snapshot.entries.push(existingEntry)
      await fileManager.save(snapshot)

      const mergedEntry = makeEntry({ id: 'pref-004-merged', content: 'Updated content', confidence: 0.85 })
      const report: ExtractionReport = {
        added: [mergedEntry],
        merged: [{ existing: 'pref-004', merged: 'pref-004-merged' }],
        discarded: [],
        durationMs: 100,
        tokenCost: { input: 50, output: 20 },
      }

      await mm.applyExtractionReport(report)

      const events = await evolutionLog.query({ entryId: 'pref-004' })
      expect(events.some((e) => e.type === 'merge')).toBe(true)
    })
  })

  describe('4. Discarded entries only trigger EvolutionLog type=delete', () => {
    it('does not write discarded entries to MEMORY.md', async () => {
      const report: ExtractionReport = {
        added: [],
        merged: [],
        discarded: [{ candidate: 'Low confidence content', reason: 'confidence 0.3 below threshold 0.5' }],
        durationMs: 100,
        tokenCost: { input: 50, output: 20 },
      }

      const entriesBefore = await mm.getAllEntries()
      await mm.applyExtractionReport(report)
      const entriesAfter = await mm.getAllEntries()

      expect(entriesAfter.length).toBe(entriesBefore.length)

      const events = await evolutionLog.query({ type: 'delete' })
      expect(events.length).toBe(1)
    })
  })

  describe('5. totalTokens exceeding threshold marks compression needed', () => {
    it('returns compressionNeeded=true when totalTokens > 12000', async () => {
      const fileManager = new MemoryFileManager(tmpDir)
      const snapshot = await fileManager.load()

      const longContent = 'A'.repeat(50000)
      const bigEntry: MemoryEntry = {
        id: 'pref-big',
        section: 'user_preference' as MemorySection,
        content: longContent,
        confidence: 0.9,
        hits: 0,
        createdAt: '2026-04-20T10:00:00.000Z',
        updatedAt: '2026-04-20T10:00:00.000Z',
        sourceLogIds: ['log-001'],
        locked: false,
        tags: [],
      }

      const report: ExtractionReport = {
        added: [bigEntry],
        merged: [],
        discarded: [],
        durationMs: 100,
        tokenCost: { input: 50, output: 20 },
      }

      const result = await mm.applyExtractionReport(report)
      expect(result.compressionNeeded).toBe(true)
    })
  })
})
