import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import { MemoryCompressor } from '../../src/main/services/memory/memory-compressor'
import type { MemoryManager } from '../../src/main/services/memory-manager'
import type { MemoryFileManager } from '../../src/main/services/memory/memory-file-manager'
import type { EvolutionLog } from '../../src/main/services/memory/evolution-log'
import type { AiGatewayClient, AiGatewaySession, AiGatewayChatResponse } from '../../src/main/services/ai-gateway-client'
import type { MemoryEntry, MemoryConfig, MemoryFileSnapshot } from '../../src/main/services/memory/types'
import { DEFAULT_MEMORY_CONFIG } from '../../src/main/services/memory/types'

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    section: 'user_preference',
    content: 'User prefers dark mode for better readability in low-light environments',
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

function makeOldEntry(daysAgo: number, overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
  return makeEntry({ createdAt, ...overrides })
}

function createMockSession(responseContent: string): AiGatewaySession {
  return {
    sessionId: 'test-session',
    role: 'memory-compressor',
    chat: vi.fn(async () => ({
      id: 'resp-1',
      model: 'claude-haiku',
      provider: 'mock',
      content: responseContent,
      finishReason: 'stop',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0 },
      intercepted: false,
      warnings: [],
    } as AiGatewayChatResponse)),
    close: vi.fn(),
  } as unknown as AiGatewaySession
}

function createMockAiGateway(session: AiGatewaySession): AiGatewayClient {
  return {
    createSession: vi.fn(() => session),
  } as unknown as AiGatewayClient
}

function createMockEvolutionLog(): EvolutionLog {
  return {
    append: vi.fn(async () => {}),
  } as unknown as EvolutionLog
}

function createMockMemoryManager(entries: MemoryEntry[], workspacePath: string): MemoryManager {
  return {
    getAllEntries: vi.fn(async () => entries),
    getWorkspacePathOrFail: vi.fn(() => workspacePath),
  } as unknown as MemoryManager
}

function createMockFileManager(entries: MemoryEntry[], workspacePath: string): MemoryFileManager {
  const memPath = path.join(workspacePath, '.sibylla', 'memory', 'MEMORY.md')
  return {
    memoryPath: vi.fn(() => memPath),
    load: vi.fn(async () => ({
      metadata: { version: 2, lastCheckpoint: new Date().toISOString(), totalTokens: 0, entryCount: entries.length },
      entries,
    })),
    save: vi.fn(async () => {}),
    loadArchive: vi.fn(async () => []),
    saveArchive: vi.fn(async () => {}),
    appendToArchive: vi.fn(async () => {}),
    parseSnapshot: vi.fn((content: string) => ({
      metadata: { version: 2, lastCheckpoint: new Date().toISOString(), totalTokens: 0, entryCount: 0 },
      entries: [],
    } as MemoryFileSnapshot)),
    serialize: vi.fn(() => ''),
    estimateTokens: vi.fn(() => 0),
  } as unknown as MemoryFileManager
}

describe('MemoryCompressor', () => {
  let tempDir: string
  let config: MemoryConfig

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comp-test-'))
    config = { ...DEFAULT_MEMORY_CONFIG }

    // Create the MEMORY.md file for createSnapshot
    const memDir = path.join(tempDir, '.sibylla', 'memory')
    await fs.mkdir(memDir, { recursive: true })
    await fs.writeFile(path.join(memDir, 'MEMORY.md'), '---\nversion: 2\n---\n# Test Memory\n', 'utf-8')
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('1. Three-stage compression executes in order', () => {
    it('runs discard, merge, archive stages in sequence', async () => {
      // Create entries that span all three stages:
      // Low confidence + 0 hits + old => discard
      // Similar content => merge (need high Jaccard similarity)
      // 0 hits + very old => archive
      const entries: MemoryEntry[] = [
        makeOldEntry(40, { id: 'discard-1', confidence: 0.3, hits: 0 }),
        makeEntry({ id: 'sim-1', content: 'User prefers dark mode interface', section: 'user_preference', confidence: 0.9, hits: 5 }),
        makeEntry({ id: 'sim-2', content: 'User prefers dark mode interface', section: 'user_preference', confidence: 0.85, hits: 4 }),
        makeOldEntry(100, { id: 'archive-1', hits: 0, confidence: 0.7 }),
      ]

      const session = createMockSession('Merged content about dark mode')
      const gateway = createMockAiGateway(session)
      const evolutionLog = createMockEvolutionLog()
      const mockManager = createMockMemoryManager(entries, tempDir)
      const mockFileManager = createMockFileManager(entries, tempDir)

      // Set TARGET_MAX very low so after discard, tokens still exceed limit
      const compressor = new MemoryCompressor(
        mockManager,
        gateway,
        null,
        evolutionLog,
        mockFileManager,
        { ...config, compressionTargetMax: 1 },
      )

      const result = await compressor.compress()

      // discard stage should have caught the low-confidence old entry
      expect(result.discarded.length).toBe(1)
      expect(result.discarded[0].id).toBe('discard-1')

      // merge stage should have merged the two similar entries
      expect(result.merged.length).toBe(1)

      // archive stage should have caught the 0-hit very old entry
      expect(result.archived.length).toBe(1)
      expect(result.archived[0].id).toBe('archive-1')

      expect(result.beforeTokens).toBeGreaterThanOrEqual(0)
      expect(result.snapshotPath).toMatch(/snapshots/)
    })
  })

  describe('2. Discard stage', () => {
    it('discards entries with confidence < 0.5, hits = 0, and age > 30d', async () => {
      const entries: MemoryEntry[] = [
        makeOldEntry(40, { id: 'should-discard', confidence: 0.3, hits: 0 }),
        makeEntry({ id: 'should-keep', confidence: 0.9, hits: 5 }),
      ]

      const session = createMockSession('')
      const gateway = createMockAiGateway(session)
      const mockManager = createMockMemoryManager(entries, tempDir)
      const mockFileManager = createMockFileManager(entries, tempDir)

      const compressor = new MemoryCompressor(
        mockManager, gateway, null, createMockEvolutionLog(), mockFileManager, config,
      )

      const result = await compressor.compress()

      expect(result.discarded.length).toBe(1)
      expect(result.discarded[0].id).toBe('should-discard')
    })
  })

  describe('3. Discard exemption for locked entries', () => {
    it('does not discard locked entries even if they meet discard criteria', async () => {
      const entries: MemoryEntry[] = [
        makeOldEntry(40, { id: 'locked-entry', confidence: 0.3, hits: 0, locked: true }),
        makeEntry({ id: 'normal-entry', confidence: 0.9, hits: 5 }),
      ]

      const session = createMockSession('')
      const gateway = createMockAiGateway(session)
      const mockManager = createMockMemoryManager(entries, tempDir)
      const mockFileManager = createMockFileManager(entries, tempDir)

      const compressor = new MemoryCompressor(
        mockManager, gateway, null, createMockEvolutionLog(), mockFileManager, config,
      )

      const result = await compressor.compress()

      expect(result.discarded.length).toBe(0)
    })
  })

  describe('4. Merge stage: similar entries are merged', () => {
    it('merges entries with high text similarity', async () => {
      // Create entries with identical content so Jaccard similarity is 1.0
      const entries: MemoryEntry[] = [
        makeEntry({ id: 'sim-1', content: 'User prefers dark mode interface', section: 'user_preference' }),
        makeEntry({ id: 'sim-2', content: 'User prefers dark mode interface', section: 'user_preference' }),
      ]

      const session = createMockSession('User prefers dark mode interface for better UX')
      const gateway = createMockAiGateway(session)
      const mockManager = createMockMemoryManager(entries, tempDir)
      const mockFileManager = createMockFileManager(entries, tempDir)

      const compressor = new MemoryCompressor(
        mockManager, gateway, null, createMockEvolutionLog(), mockFileManager,
        { ...config, compressionTargetMax: 1 }, // Force past Stage 1 into Stage 2
      )

      const result = await compressor.compress()

      expect(result.merged.length).toBe(1)
      expect(result.merged[0].original.length).toBe(2)
      expect(result.merged[0].merged.content).toBe('User prefers dark mode interface for better UX')
    })
  })

  describe('5. LLM merge call and result format', () => {
    it('calls AiGatewaySession.chat() with correct params and returns proper merged entry', async () => {
      const entries: MemoryEntry[] = [
        makeEntry({ id: 'merge-a', content: 'User prefers dark mode interface', section: 'user_preference', hits: 3, confidence: 0.8, sourceLogIds: ['log-a'], tags: ['theme'] }),
        makeEntry({ id: 'merge-b', content: 'User prefers dark mode interface', section: 'user_preference', hits: 2, confidence: 0.7, sourceLogIds: ['log-b'], tags: ['ui'] }),
      ]

      const session = createMockSession('User consistently prefers dark mode')
      const gateway = createMockAiGateway(session)
      const mockManager = createMockMemoryManager(entries, tempDir)
      const mockFileManager = createMockFileManager(entries, tempDir)

      const compressor = new MemoryCompressor(
        mockManager, gateway, null, createMockEvolutionLog(), mockFileManager,
        { ...config, compressionTargetMax: 1 }, // Force merge stage
      )

      const result = await compressor.compress()

      expect(session.chat).toHaveBeenCalled()
      expect(result.merged.length).toBe(1)

      const merged = result.merged[0].merged
      expect(merged.id).toMatch(/^merged-/)
      expect(merged.section).toBe('user_preference')
      expect(merged.hits).toBe(5) // 3 + 2
      expect(merged.locked).toBe(false)
      expect(merged.sourceLogIds).toContain('log-a')
      expect(merged.sourceLogIds).toContain('log-b')
      expect(merged.tags).toContain('theme')
      expect(merged.tags).toContain('ui')
      expect(session.close).toHaveBeenCalled()
    })
  })

  describe('6. Archive stage', () => {
    it('archives entries with hits = 0 and age > 90d', async () => {
      const entries: MemoryEntry[] = [
        makeOldEntry(100, { id: 'stale-1', hits: 0, confidence: 0.7, content: 'Old stale info about deprecated API', section: 'technical_decision' }),
        makeEntry({ id: 'active-1', hits: 5, confidence: 0.8, content: 'Current project uses React framework', section: 'project_convention' }),
      ]

      const session = createMockSession('')
      const gateway = createMockAiGateway(session)
      const mockManager = createMockMemoryManager(entries, tempDir)
      const mockFileManager = createMockFileManager(entries, tempDir)

      const compressor = new MemoryCompressor(
        mockManager, gateway, null, createMockEvolutionLog(), mockFileManager,
        { ...config, compressionTargetMax: 1 }, // Force all stages including archive
      )

      const result = await compressor.compress()

      expect(result.archived.length).toBe(1)
      expect(result.archived[0].id).toBe('stale-1')
      expect(mockFileManager.appendToArchive).toHaveBeenCalled()
    })
  })

  describe('7. Token threshold: skip stages when within target', () => {
    it('skips Stage 2/3 if tokens <= TARGET_MAX after Stage 1', async () => {
      // Short content entries — after discard, tokens should be well within limit
      const entries: MemoryEntry[] = [
        makeOldEntry(40, { id: 'discard-me', confidence: 0.2, hits: 0, content: 'x'.repeat(100) }),
        makeEntry({ id: 'keep-me', content: 'Short entry', confidence: 0.9, hits: 5 }),
      ]

      const session = createMockSession('')
      const gateway = createMockAiGateway(session)
      const mockManager = createMockMemoryManager(entries, tempDir)
      const mockFileManager = createMockFileManager(entries, tempDir)

      const compressor = new MemoryCompressor(
        mockManager, gateway, null, createMockEvolutionLog(), mockFileManager,
        { ...config, compressionTargetMax: 99999 }, // Very high target — should skip merge/archive
      )

      const result = await compressor.compress()

      expect(result.discarded.length).toBe(1)
      expect(result.merged.length).toBe(0) // Skipped
      expect(result.archived.length).toBe(0) // Skipped
    })
  })

  describe('8. Snapshot creation', () => {
    it('creates a snapshot file in .sibylla/memory/snapshots/ before compression', async () => {
      const entries: MemoryEntry[] = [
        makeEntry({ id: 'e1', content: 'Some content' }),
      ]

      const session = createMockSession('')
      const gateway = createMockAiGateway(session)
      const mockManager = createMockMemoryManager(entries, tempDir)
      const mockFileManager = createMockFileManager(entries, tempDir)

      const compressor = new MemoryCompressor(
        mockManager, gateway, null, createMockEvolutionLog(), mockFileManager, config,
      )

      const result = await compressor.compress()

      expect(result.snapshotPath).toBeDefined()

      const snapshotExists = await fs.access(result.snapshotPath).then(() => true).catch(() => false)
      expect(snapshotExists).toBe(true)
    })
  })

  describe('9. undoLastCompression succeeds within 24h', () => {
    it('restores from the most recent snapshot within 24 hours', async () => {
      const entries: MemoryEntry[] = [makeEntry({ id: 'e1' })]
      const session = createMockSession('')
      const gateway = createMockAiGateway(session)
      const evolutionLog = createMockEvolutionLog()
      const mockManager = createMockMemoryManager(entries, tempDir)
      const mockFileManager = createMockFileManager(entries, tempDir)

      const compressor = new MemoryCompressor(
        mockManager, gateway, null, evolutionLog, mockFileManager, config,
      )

      // Create a recent snapshot manually
      const snapshotsDir = path.join(tempDir, '.sibylla', 'memory', 'snapshots')
      await fs.mkdir(snapshotsDir, { recursive: true })
      const recentTimestamp = Date.now()
      const snapshotContent = '---\nversion: 2\n---\n# Snapshot\n'
      await fs.writeFile(path.join(snapshotsDir, `${recentTimestamp}.md`), snapshotContent, 'utf-8')

      await compressor.undoLastCompression()

      expect(mockFileManager.parseSnapshot).toHaveBeenCalledWith(snapshotContent)
      expect(mockFileManager.save).toHaveBeenCalled()
      expect(evolutionLog.append).toHaveBeenCalled()
    })
  })

  describe('10. undoLastCompression rejects after 24h', () => {
    it('throws error when snapshot is older than 24 hours', async () => {
      const entries: MemoryEntry[] = [makeEntry({ id: 'e1' })]
      const session = createMockSession('')
      const gateway = createMockAiGateway(session)
      const mockManager = createMockMemoryManager(entries, tempDir)
      const mockFileManager = createMockFileManager(entries, tempDir)

      const compressor = new MemoryCompressor(
        mockManager, gateway, null, createMockEvolutionLog(), mockFileManager, config,
      )

      // Create an old snapshot (> 24h ago)
      const snapshotsDir = path.join(tempDir, '.sibylla', 'memory', 'snapshots')
      await fs.mkdir(snapshotsDir, { recursive: true })
      const oldTimestamp = Date.now() - 25 * 60 * 60 * 1000
      await fs.writeFile(path.join(snapshotsDir, `${oldTimestamp}.md`), 'old snapshot', 'utf-8')

      await expect(compressor.undoLastCompression()).rejects.toThrow('Snapshot older than 24 hours')
    })
  })

  describe('11. compressions.jsonl persistence', () => {
    it('persists compression record to compressions.jsonl after compress', async () => {
      const entries: MemoryEntry[] = [
        makeEntry({ id: 'e1', content: 'Some content to compress' }),
      ]

      const session = createMockSession('')
      const gateway = createMockAiGateway(session)
      const mockManager = createMockMemoryManager(entries, tempDir)
      const mockFileManager = createMockFileManager(entries, tempDir)

      const compressor = new MemoryCompressor(
        mockManager, gateway, null, createMockEvolutionLog(), mockFileManager, config,
      )

      await compressor.compress()

      const compressionsPath = path.join(tempDir, '.sibylla', 'memory', 'compressions.jsonl')
      const exists = await fs.access(compressionsPath).then(() => true).catch(() => false)
      expect(exists).toBe(true)

      const content = await fs.readFile(compressionsPath, 'utf-8')
      const lines = content.split('\n').filter((l) => l.trim().length > 0)
      expect(lines.length).toBeGreaterThanOrEqual(1)

      const record = JSON.parse(lines[0]) as { timestamp: string; beforeTokens: number; afterTokens: number }
      expect(record.timestamp).toBeDefined()
      expect(typeof record.beforeTokens).toBe('number')
      expect(typeof record.afterTokens).toBe('number')
    })
  })
})
