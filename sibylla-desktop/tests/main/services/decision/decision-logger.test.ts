import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { DecisionLogger } from '@main/services/decision/decision-logger'

describe('DecisionLogger', () => {
  let tmpDir: string
  let logger: DecisionLogger
  let emitEvent: ReturnType<typeof vi.fn>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-test-'))
    emitEvent = vi.fn()
    const eventBus = { emitEvent } as never
    logger = new DecisionLogger(eventBus, tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('create', () => {
    it('creates a decision log file with standard input', async () => {
      const decision = await logger.create({
        title: 'Choose Database',
        problem: 'Need to select a database for the project',
        options: [
          { name: 'PostgreSQL', pros: 'ACID compliant', cons: 'Complex setup' },
          { name: 'MongoDB', pros: 'Flexible schema', cons: 'No ACID' },
        ],
        chosen: 'PostgreSQL',
        reason: 'Better for relational data',
        tags: ['database'],
        decidedBy: ['Alice'],
      })

      expect(decision.id).toMatch(/^dec_\d{4}_\d{2}_\d{2}_choose-database/)
      expect(decision.title).toBe('Choose Database')
      expect(decision.status).toBe('decided')
      expect(decision.chosen).toBe('PostgreSQL')
      expect(decision.filePath).toContain('.sibylla/memory/decisions/')

      const filePath = path.join(tmpDir, decision.filePath)
      expect(fs.existsSync(filePath)).toBe(true)

      const content = fs.readFileSync(filePath, 'utf-8')
      expect(content).toContain('title: Choose Database')
      expect(content).toContain('## 问题')
      expect(content).toContain('## 选项')
      expect(content).toContain('PostgreSQL')
      expect(content).toContain('## 决策')
      expect(content).toContain('## 理由')
      expect(content).toContain('## 实际结果')

      expect(emitEvent).toHaveBeenCalledTimes(1)
      expect(emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'decision.recorded',
          source: 'DecisionLogger',
        }),
      )
    })

    it('handles Chinese titles in slug generation', async () => {
      const decision = await logger.create({
        title: '选择主数据库架构',
        problem: 'test',
        options: [{ name: 'A' }, { name: 'B' }],
        chosen: 'A',
        reason: 'test',
      })

      expect(decision.id).toMatch(/^dec_\d{4}_\d{2}_\d{2}_/)
      expect(decision.filePath).toContain('.md')
    })

    it('handles special characters in title', async () => {
      const decision = await logger.create({
        title: 'API 设计: REST vs GraphQL (2026版)!',
        problem: 'test',
        options: [{ name: 'REST' }, { name: 'GraphQL' }],
        chosen: 'REST',
        reason: 'test',
      })

      expect(decision.filePath).not.toContain(':')
      expect(decision.filePath).not.toContain('!')
      expect(decision.filePath).not.toContain('(')
    })

    it('appends suffix on file name conflict', async () => {
      const d1 = await logger.create({
        title: 'Test Decision',
        problem: 'test',
        options: [{ name: 'A' }, { name: 'B' }],
        chosen: 'A',
        reason: 'test',
      })

      const d2 = await logger.create({
        title: 'Test Decision',
        problem: 'test',
        options: [{ name: 'A' }, { name: 'B' }],
        chosen: 'A',
        reason: 'test',
      })

      expect(d1.filePath).not.toBe(d2.filePath)
      expect(d2.filePath).toMatch(/-2\.md$/)
    })

    it('creates file in docs/decisions when location is docs', async () => {
      const decision = await logger.create({
        title: 'Team Decision',
        problem: 'test',
        options: [{ name: 'A' }, { name: 'B' }],
        chosen: 'A',
        reason: 'test',
        location: 'docs',
      })

      expect(decision.filePath).toContain('docs/decisions/')
    })
  })

  describe('updateOutcome', () => {
    it('updates the actual result section', async () => {
      const decision = await logger.create({
        title: 'Test Decision',
        problem: 'test',
        options: [{ name: 'A' }, { name: 'B' }],
        chosen: 'A',
        reason: 'test',
      })

      await logger.updateOutcome(decision.id, 'The result was positive')

      const updated = await logger.get(decision.id)
      expect(updated?.actualResult).toBe('The result was positive')

      expect(emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'decision.outcome-updated',
        }),
      )
    })

    it('detects reverted status from outcome', async () => {
      const decision = await logger.create({
        title: 'Test Decision',
        problem: 'test',
        options: [{ name: 'A' }, { name: 'B' }],
        chosen: 'A',
        reason: 'test',
      })

      await logger.updateOutcome(decision.id, '已回退，改为方案B')

      const updated = await logger.get(decision.id)
      expect(updated?.status).toBe('reverted')
    })

    it('throws when decision not found', async () => {
      await expect(
        logger.updateOutcome('nonexistent', 'result'),
      ).rejects.toThrow('Decision not found')
    })
  })

  describe('list', () => {
    it('returns all decisions sorted by date descending', async () => {
      await logger.create({
        title: 'Decision A',
        problem: 'test',
        options: [{ name: 'A' }, { name: 'B' }],
        chosen: 'A',
        reason: 'test',
      })
      await logger.create({
        title: 'Decision B',
        problem: 'test',
        options: [{ name: 'C' }, { name: 'D' }],
        chosen: 'C',
        reason: 'test',
      })

      const list = await logger.list()
      expect(list.length).toBeGreaterThanOrEqual(2)
      const titles = list.map((d) => d.title)
      expect(titles).toContain('Decision A')
      expect(titles).toContain('Decision B')
    })

    it('filters by tags', async () => {
      await logger.create({
        title: 'Tagged Decision',
        problem: 'test',
        options: [{ name: 'A' }, { name: 'B' }],
        chosen: 'A',
        reason: 'test',
        tags: ['database'],
      })
      await logger.create({
        title: 'Untagged Decision',
        problem: 'test',
        options: [{ name: 'A' }, { name: 'B' }],
        chosen: 'A',
        reason: 'test',
        tags: ['frontend'],
      })

      const filtered = await logger.list({ tags: ['database'] })
      expect(filtered).toHaveLength(1)
      expect(filtered[0]?.title).toBe('Tagged Decision')
    })

    it('sorts by title ascending', async () => {
      await logger.create({
        title: 'Beta Decision',
        problem: 'test',
        options: [{ name: 'A' }, { name: 'B' }],
        chosen: 'A',
        reason: 'test',
      })
      await logger.create({
        title: 'Alpha Decision',
        problem: 'test',
        options: [{ name: 'A' }, { name: 'B' }],
        chosen: 'A',
        reason: 'test',
      })

      const sorted = await logger.list({ sortBy: 'title', sortOrder: 'asc' })
      expect(sorted[0]?.title).toBe('Alpha Decision')
      expect(sorted[1]?.title).toBe('Beta Decision')
    })

    it('filters by search query', async () => {
      await logger.create({
        title: 'Database Selection',
        problem: 'Choosing the right DB for our microservices',
        options: [{ name: 'A' }, { name: 'B' }],
        chosen: 'A',
        reason: 'test',
      })

      const results = await logger.list({ searchQuery: 'microservices' })
      expect(results).toHaveLength(1)
    })
  })

  describe('get', () => {
    it('returns decision when found', async () => {
      const created = await logger.create({
        title: 'Find Me',
        problem: 'test',
        options: [{ name: 'A' }, { name: 'B' }],
        chosen: 'A',
        reason: 'test',
      })

      const found = await logger.get(created.id)
      expect(found).not.toBeNull()
      expect(found?.title).toBe('Find Me')
      expect(found?.options).toHaveLength(2)
    })

    it('returns null when not found', async () => {
      const found = await logger.get('nonexistent-id')
      expect(found).toBeNull()
    })
  })

  describe('slug generation', () => {
    it('handles long titles by truncating', async () => {
      const longTitle = 'A'.repeat(100)
      const decision = await logger.create({
        title: longTitle,
        problem: 'test',
        options: [{ name: 'A' }, { name: 'B' }],
        chosen: 'A',
        reason: 'test',
      })

      const fileName = path.basename(decision.filePath, '.md')
      const slugPart = fileName.split('-').slice(3).join('-')
      expect(slugPart.length).toBeLessThanOrEqual(60)
    })
  })
})
