import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import { MemoryManager } from '../../src/main/services/memory-manager'
import { MemoryFileManager } from '../../src/main/services/memory/memory-file-manager'
import { LogStore } from '../../src/main/services/memory/log-store'

describe('MemoryManager v2 facade', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sibylla-mm-v2-test-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('appendLog() dual-write', () => {
    it('writes to both v1 Markdown and v2 JSONL', async () => {
      const mm = new MemoryManager()
      mm.setWorkspacePath(tmpDir)

      const v2Dir = path.join(tmpDir, '.sibylla', 'memory')
      await fs.mkdir(v2Dir, { recursive: true })
      const fileManager = new MemoryFileManager(tmpDir)
      const logStore = new LogStore(tmpDir)
      mm.setV2Components({ fileManager, logStore })

      await mm.appendLog({
        type: 'user-interaction',
        operator: 'user',
        sessionId: 'session-1',
        summary: 'Dual write test',
        timestamp: '2026-04-20T10:00:00.000Z',
      })

      const dailyDir = path.join(tmpDir, '.sibylla', 'memory', 'daily')
      const dailyFiles = await fs.readdir(dailyDir).catch(() => [] as string[])
      expect(dailyFiles.some((f) => f.endsWith('.md'))).toBe(true)

      const logsDir = path.join(tmpDir, '.sibylla', 'memory', 'logs')
      const logFiles = await fs.readdir(logsDir).catch(() => [] as string[])
      expect(logFiles.some((f) => f.endsWith('.jsonl'))).toBe(true)
    })

    it('continues v1 write when v2 LogStore fails', async () => {
      const mm = new MemoryManager()
      mm.setWorkspacePath(tmpDir)

      const brokenLogStore = new LogStore('/nonexistent/path')
      const fileManager = new MemoryFileManager(tmpDir)
      mm.setV2Components({ fileManager, logStore: brokenLogStore })

      await expect(mm.appendLog({
        type: 'user-interaction',
        operator: 'user',
        sessionId: 'session-1',
        summary: 'Fallback test',
      })).resolves.toBeUndefined()

      const dailyDir = path.join(tmpDir, '.sibylla', 'memory', 'daily')
      const dailyFiles = await fs.readdir(dailyDir).catch(() => [] as string[])
      expect(dailyFiles.some((f) => f.endsWith('.md'))).toBe(true)
    })
  })

  describe('getMemorySnapshot() delegation', () => {
    it('delegates to MemoryFileManager when v2Components available', async () => {
      const mm = new MemoryManager()
      mm.setWorkspacePath(tmpDir)

      const v2Dir = path.join(tmpDir, '.sibylla', 'memory')
      await fs.mkdir(v2Dir, { recursive: true })
      const fileManager = new MemoryFileManager(tmpDir)
      const logStore = new LogStore(tmpDir)
      mm.setV2Components({ fileManager, logStore })

      const snapshot = await mm.getMemorySnapshot()
      expect(snapshot).toHaveProperty('content')
      expect(snapshot).toHaveProperty('tokenCount')
      expect(snapshot).toHaveProperty('tokenDebt')
    })

    it('falls back to v1 when v2Components not available', async () => {
      const mm = new MemoryManager()
      mm.setWorkspacePath(tmpDir)

      const snapshot = await mm.getMemorySnapshot()
      expect(snapshot).toHaveProperty('content')
      expect(snapshot).toHaveProperty('tokenCount')
    })
  })

  describe('v2 methods — v2Components not available', () => {
    it('throws "v2 not available" for getLogsSince', async () => {
      const mm = new MemoryManager()
      mm.setWorkspacePath(tmpDir)
      await expect(mm.getLogsSince('2026-04-20T00:00:00.000Z')).rejects.toThrow('v2 not available')
    })

    it('throws "v2 not available" for getAllEntries', async () => {
      const mm = new MemoryManager()
      mm.setWorkspacePath(tmpDir)
      await expect(mm.getAllEntries()).rejects.toThrow('v2 not available')
    })

    it('throws "v2 not available" for compress', async () => {
      const mm = new MemoryManager()
      mm.setWorkspacePath(tmpDir)
      await expect(mm.compress()).rejects.toThrow('v2 not available')
    })
  })

  describe('v2 methods — v2Components available', () => {
    it('getAllEntries returns entries from MemoryFileManager', async () => {
      const mm = new MemoryManager()
      mm.setWorkspacePath(tmpDir)

      const v2Dir = path.join(tmpDir, '.sibylla', 'memory')
      await fs.mkdir(v2Dir, { recursive: true })
      const fileManager = new MemoryFileManager(tmpDir)
      const logStore = new LogStore(tmpDir)
      mm.setV2Components({ fileManager, logStore })

      const entries = await mm.getAllEntries()
      expect(Array.isArray(entries)).toBe(true)
    })

    it('getStats returns stats from MemoryFileManager', async () => {
      const mm = new MemoryManager()
      mm.setWorkspacePath(tmpDir)

      const v2Dir = path.join(tmpDir, '.sibylla', 'memory')
      await fs.mkdir(v2Dir, { recursive: true })
      const fileManager = new MemoryFileManager(tmpDir)
      const logStore = new LogStore(tmpDir)
      mm.setV2Components({ fileManager, logStore })

      const stats = await mm.getStats()
      expect(stats).toHaveProperty('totalTokens')
      expect(stats).toHaveProperty('entryCount')
      expect(stats).toHaveProperty('lastCheckpoint')
      expect(stats).toHaveProperty('sections')
    })
  })

  describe('getWorkspaceContext()', () => {
    it('returns Unknown when no config.json exists', async () => {
      const mm = new MemoryManager()
      mm.setWorkspacePath(tmpDir)

      const ctx = await mm.getWorkspaceContext()
      expect(ctx.name).toBe('Unknown')
    })

    it('reads name from .sibylla/config.json', async () => {
      const mm = new MemoryManager()
      mm.setWorkspacePath(tmpDir)

      const configDir = path.join(tmpDir, '.sibylla')
      await fs.mkdir(configDir, { recursive: true })
      await fs.writeFile(
        path.join(configDir, 'config.json'),
        JSON.stringify({ name: 'Test Project', description: 'A test' }),
        'utf-8'
      )

      const ctx = await mm.getWorkspaceContext()
      expect(ctx.name).toBe('Test Project')
      expect(ctx.description).toBe('A test')
    })
  })
})
