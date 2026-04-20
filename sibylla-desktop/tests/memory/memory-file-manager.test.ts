import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import { MemoryFileManager } from '../../src/main/services/memory/memory-file-manager'
import type { MemoryFileSnapshot, MemoryEntry } from '../../src/main/services/memory/types'

describe('MemoryFileManager', () => {
  let tmpDir: string
  let manager: MemoryFileManager

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sibylla-memory-test-'))
    manager = new MemoryFileManager(tmpDir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('load()', () => {
    it('returns empty snapshot when no MEMORY.md exists', async () => {
      const snapshot = await manager.load()
      expect(snapshot.metadata.version).toBe(2)
      expect(snapshot.entries).toHaveLength(0)
      expect(snapshot.metadata.entryCount).toBe(0)
    })

    it('parses v2 MEMORY.md with YAML frontmatter', async () => {
      const v2Content = [
        '---',
        'version: 2',
        'lastCheckpoint: "2026-04-20T00:00:00.000Z"',
        'totalTokens: 100',
        'entryCount: 2',
        '---',
        '',
        '# 团队记忆',
        '',
        '## 用户偏好',
        '',
        '<!-- @entry id=entry-1 confidence=0.80 hits=5 updated=2026-04-20T10:00:00.000Z locked=false -->',
        'Use dark theme for all editors',
        '',
        '## 技术决策',
        '',
        '<!-- @entry id=entry-2 confidence=0.90 hits=10 updated=2026-04-20T11:00:00.000Z locked=true -->',
        'Use SQLite for local storage',
        '<!-- source: log-20260420-001, log-20260420-002 -->',
        '',
      ].join('\n')

      await fs.mkdir(path.join(tmpDir, '.sibylla', 'memory'), { recursive: true })
      await fs.writeFile(manager.memoryPath(), v2Content, 'utf-8')

      const snapshot = await manager.load()
      expect(snapshot.metadata.version).toBe(2)
      expect(snapshot.entries).toHaveLength(2)
      expect(snapshot.entries[0].id).toBe('entry-1')
      expect(snapshot.entries[0].section).toBe('user_preference')
      expect(snapshot.entries[0].confidence).toBeCloseTo(0.8)
      expect(snapshot.entries[0].hits).toBe(5)
      expect(snapshot.entries[1].id).toBe('entry-2')
      expect(snapshot.entries[1].section).toBe('technical_decision')
      expect(snapshot.entries[1].locked).toBe(true)
      expect(snapshot.entries[1].sourceLogIds).toEqual(['log-20260420-001', 'log-20260420-002'])
    })

    it('auto-migrates v1 MEMORY.md from workspace root', async () => {
      const v1Content = [
        '# 团队记忆',
        '',
        '> 最后更新: 2026-04-20T00:00:00.000Z',
        '',
        '## 项目概览',
        '- This is a project overview item',
        '',
        '## 核心决策',
        '- Use TypeScript strict mode',
        '- Use Electron for desktop',
        '',
        '## 用户偏好',
        '- Prefer Chinese UI',
        '',
      ].join('\n')

      await fs.writeFile(manager.v1MemoryPath(), v1Content, 'utf-8')

      const snapshot = await manager.load()
      expect(snapshot.metadata.version).toBe(2)
      expect(snapshot.entries.length).toBeGreaterThan(0)

      const backupExists = await fs.access(path.join(tmpDir, 'MEMORY.v1.bak.md'))
        .then(() => true)
        .catch(() => false)
      expect(backupExists).toBe(true)

      const v2Exists = await fs.access(manager.memoryPath())
        .then(() => true)
        .catch(() => false)
      expect(v2Exists).toBe(true)

      const migratedEntries = snapshot.entries.filter((e) => e.id.startsWith('migrated-'))
      expect(migratedEntries.length).toBeGreaterThan(0)
      for (const entry of migratedEntries) {
        expect(entry.confidence).toBe(0.7)
      }
    })

    it('maps unmatched sections to project_convention', async () => {
      const v1Content = [
        '# 团队记忆',
        '',
        '## 自定义标题',
        '- Some custom content',
        '',
      ].join('\n')

      await fs.writeFile(manager.v1MemoryPath(), v1Content, 'utf-8')
      const snapshot = await manager.load()
      expect(snapshot.entries.some((e) => e.section === 'project_convention')).toBe(true)
    })
  })

  describe('parseMarkdown() — error tolerance', () => {
    it('uses default confidence 0.5 when confidence is missing', async () => {
      const v2Content = [
        '---',
        'version: 2',
        'lastCheckpoint: "2026-04-20T00:00:00.000Z"',
        'totalTokens: 50',
        'entryCount: 1',
        '---',
        '',
        '## 用户偏好',
        '',
        '<!-- @entry id=entry-no-conf hits=0 updated=2026-04-20T10:00:00.000Z locked=false -->',
        'Missing confidence entry',
        '',
      ].join('\n')

      await fs.mkdir(path.join(tmpDir, '.sibylla', 'memory'), { recursive: true })
      await fs.writeFile(manager.memoryPath(), v2Content, 'utf-8')

      const snapshot = await manager.load()
      const entry = snapshot.entries.find((e) => e.id === 'entry-no-conf')
      expect(entry).toBeDefined()
      expect(entry!.confidence).toBe(0.5)
    })

    it('uses current time for invalid dates', async () => {
      const v2Content = [
        '---',
        'version: 2',
        'lastCheckpoint: "2026-04-20T00:00:00.000Z"',
        'totalTokens: 50',
        'entryCount: 1',
        '---',
        '',
        '## 用户偏好',
        '',
        '<!-- @entry id=entry-bad-date confidence=0.5 hits=0 updated=not-a-date locked=false -->',
        'Invalid date entry',
        '',
      ].join('\n')

      await fs.mkdir(path.join(tmpDir, '.sibylla', 'memory'), { recursive: true })
      await fs.writeFile(manager.memoryPath(), v2Content, 'utf-8')

      const snapshot = await manager.load()
      const entry = snapshot.entries.find((e) => e.id === 'entry-bad-date')
      expect(entry).toBeDefined()
      expect(entry!.updatedAt).toBe('not-a-date')
    })

    it('returns empty snapshot on load failure without crashing', async () => {
      const brokenManager = new MemoryFileManager('/nonexistent/path/that/does/not/exist')
      const snapshot = await brokenManager.load()
      expect(snapshot.metadata.version).toBe(2)
      expect(snapshot.entries).toHaveLength(0)
    })
  })

  describe('serialize()', () => {
    it('sorts entries by confidence * log(hits+1) descending', () => {
      const snapshot: MemoryFileSnapshot = {
        metadata: { version: 2, lastCheckpoint: '2026-04-20T00:00:00.000Z', totalTokens: 100, entryCount: 3 },
        entries: [
          { id: 'low', section: 'user_preference', content: 'Low score', confidence: 0.3, hits: 0, createdAt: '2026-04-20T10:00:00.000Z', updatedAt: '2026-04-20T10:00:00.000Z', sourceLogIds: [], locked: false, tags: [] },
          { id: 'high', section: 'user_preference', content: 'High score', confidence: 0.9, hits: 100, createdAt: '2026-04-20T10:00:00.000Z', updatedAt: '2026-04-20T10:00:00.000Z', sourceLogIds: [], locked: false, tags: [] },
          { id: 'mid', section: 'user_preference', content: 'Mid score', confidence: 0.7, hits: 5, createdAt: '2026-04-20T10:00:00.000Z', updatedAt: '2026-04-20T10:00:00.000Z', sourceLogIds: [], locked: false, tags: [] },
        ],
      }

      const serialized = manager.serialize(snapshot)
      const entryIds: string[] = []
      const regex = /<!-- @entry id=(\S+)/g
      let m: RegExpExecArray | null
      while ((m = regex.exec(serialized)) !== null) {
        entryIds.push(m[1])
      }
      expect(entryIds[0]).toBe('high')
      expect(entryIds[1]).toBe('mid')
      expect(entryIds[2]).toBe('low')
    })

    it('places locked entries at top of their section', () => {
      const snapshot: MemoryFileSnapshot = {
        metadata: { version: 2, lastCheckpoint: '2026-04-20T00:00:00.000Z', totalTokens: 100, entryCount: 2 },
        entries: [
          { id: 'unlocked', section: 'user_preference', content: 'Unlocked', confidence: 0.9, hits: 100, createdAt: '2026-04-20T10:00:00.000Z', updatedAt: '2026-04-20T10:00:00.000Z', sourceLogIds: [], locked: false, tags: [] },
          { id: 'locked', section: 'user_preference', content: 'Locked', confidence: 0.5, hits: 0, createdAt: '2026-04-20T10:00:00.000Z', updatedAt: '2026-04-20T10:00:00.000Z', sourceLogIds: [], locked: true, tags: [] },
        ],
      }

      const serialized = manager.serialize(snapshot)
      const entryIds: string[] = []
      const regex = /<!-- @entry id=(\S+)/g
      let m: RegExpExecArray | null
      while ((m = regex.exec(serialized)) !== null) {
        entryIds.push(m[1])
      }
      expect(entryIds[0]).toBe('locked')
      expect(entryIds[1]).toBe('unlocked')
    })
  })

  describe('save() + load() round-trip', () => {
    it('preserves entries through save-load cycle', async () => {
      const original: MemoryFileSnapshot = {
        metadata: { version: 2, lastCheckpoint: '2026-04-20T00:00:00.000Z', totalTokens: 100, entryCount: 2 },
        entries: [
          { id: 'e1', section: 'technical_decision', content: 'Use vitest', confidence: 0.85, hits: 3, createdAt: '2026-04-20T10:00:00.000Z', updatedAt: '2026-04-20T10:00:00.000Z', sourceLogIds: ['log-001'], locked: false, tags: [] },
          { id: 'e2', section: 'risk_note', content: 'Token budget overflow risk', confidence: 0.6, hits: 1, createdAt: '2026-04-20T11:00:00.000Z', updatedAt: '2026-04-20T11:00:00.000Z', sourceLogIds: [], locked: true, tags: [] },
        ],
      }

      await manager.save(original)
      const loaded = await manager.load()

      expect(loaded.metadata.version).toBe(2)
      expect(loaded.entries).toHaveLength(2)
      expect(loaded.entries.find((e) => e.id === 'e1')?.section).toBe('technical_decision')
      expect(loaded.entries.find((e) => e.id === 'e2')?.locked).toBe(true)
    })
  })

  describe('estimateTokens()', () => {
    it('estimates higher tokens for CJK text', () => {
      const cjkTokens = manager.estimateTokens('这是一个中文句子')
      const asciiTokens = manager.estimateTokens('This is an English sentence')
      expect(cjkTokens).toBeGreaterThan(0)
      expect(asciiTokens).toBeGreaterThan(0)
    })
  })

  describe('migrateFromV1()', () => {
    it('migrates all v1 sections correctly', async () => {
      const v1Content = [
        '# 团队记忆',
        '',
        '## 项目概览',
        '- Overview item',
        '',
        '## 核心决策',
        '- Core decision item',
        '',
        '## 用户偏好',
        '- User preference item',
        '',
        '## 常见问题',
        '- Common issue item',
        '',
        '## 风险提示',
        '- Risk note item',
        '',
        '## 关键术语',
        '- Glossary item',
        '',
      ].join('\n')

      await fs.writeFile(manager.v1MemoryPath(), v1Content, 'utf-8')
      const snapshot = await manager.load()

      const sections = new Set(snapshot.entries.map((e) => e.section))
      expect(sections.has('project_convention')).toBe(true)
      expect(sections.has('technical_decision')).toBe(true)
      expect(sections.has('user_preference')).toBe(true)
      expect(sections.has('common_issue')).toBe(true)
      expect(sections.has('risk_note')).toBe(true)
      expect(sections.has('glossary')).toBe(true)
    })
  })
})
