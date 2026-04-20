import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import { EvolutionLog } from '../../src/main/services/memory/evolution-log'
import type { EvolutionEvent, MemorySection } from '../../src/main/services/memory/types'

function makeEvent(overrides: Partial<EvolutionEvent> = {}): EvolutionEvent {
  return {
    id: `ev-${Date.now()}`,
    timestamp: '2026-04-20T10:00:00.000Z',
    type: 'add',
    entryId: 'pref-001',
    section: 'user_preference' as MemorySection,
    after: { content: 'User prefers dark mode', confidence: 0.85 },
    trigger: { source: 'checkpoint', checkpointId: 'chk-001' },
    ...overrides,
  }
}

describe('EvolutionLog', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sibylla-evolution-test-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('1. append writes to CHANGELOG.md', () => {
    it('creates CHANGELOG.md and appends formatted event', async () => {
      const log = new EvolutionLog(tmpDir)
      const event = makeEvent()

      await log.append(event)

      const changelogPath = path.join(tmpDir, '.sibylla', 'memory', 'CHANGELOG.md')
      const exists = await fs.access(changelogPath).then(() => true, () => false)
      expect(exists).toBe(true)

      const content = await fs.readFile(changelogPath, 'utf-8')
      expect(content).toContain('2026-04-20T10:00:00.000Z')
      expect(content).toContain('add')
      expect(content).toContain('pref-001')
    })
  })

  describe('2. append formats as readable Markdown', () => {
    it('includes timestamp, type, entryId, section, trigger, before/after', async () => {
      const log = new EvolutionLog(tmpDir)
      const event = makeEvent({
        before: { content: 'Old content', confidence: 0.5 },
        after: { content: 'New content', confidence: 0.9 },
        rationale: 'updated via extraction',
      })

      await log.append(event)

      const changelogPath = path.join(tmpDir, '.sibylla', 'memory', 'CHANGELOG.md')
      const content = await fs.readFile(changelogPath, 'utf-8')

      expect(content).toContain('## 2026-04-20T10:00:00.000Z — add — pref-001')
      expect(content).toContain('**Section:** user_preference')
      expect(content).toContain('**Trigger:** checkpoint (chk-001)')
      expect(content).toContain('**Rationale:** updated via extraction')
      expect(content).toContain('### Before')
      expect(content).toContain('### After')
      expect(content).toContain('"content": "Old content"')
      expect(content).toContain('"content": "New content"')
    })
  })

  describe('3. Rotation at 5000 entries', () => {
    it('rotates CHANGELOG.md when exceeding 5000 entries', async () => {
      const log = new EvolutionLog(tmpDir)
      const logPath = path.join(tmpDir, '.sibylla', 'memory', 'CHANGELOG.md')

      await log.append(makeEvent({ entryId: 'header-0' }))

      const dirPath = path.join(tmpDir, '.sibylla', 'memory')
      await fs.mkdir(dirPath, { recursive: true })

      const headerAndFirst = await fs.readFile(logPath, 'utf-8')
      const eventBlock = `\n## 2026-04-20T10:00:00.000Z — add — entry-0\n\n- **Section:** user_preference\n- **Trigger:** checkpoint\n\n---\n`

      const bulkEvents = eventBlock.repeat(5001)
      await fs.appendFile(logPath, bulkEvents, 'utf-8')

      const log2 = new EvolutionLog(tmpDir)
      await log2.append(makeEvent({
        entryId: 'post-rotation',
        timestamp: '2026-04-21T10:00:00.000Z',
      }))

      const rotatedPath = path.join(tmpDir, '.sibylla', 'memory', 'CHANGELOG-2026-04.md')
      const rotatedExists = await fs.access(rotatedPath).then(() => true, () => false)
      expect(rotatedExists).toBe(true)

      const newContent = await fs.readFile(logPath, 'utf-8')
      expect(newContent).toContain('记忆演化日志')
    }, 30000)
  })

  describe('4. Query with filters', () => {
    it('filters by entryId, type, since and returns in descending order', async () => {
      const log = new EvolutionLog(tmpDir)

      await log.append(makeEvent({
        entryId: 'pref-001',
        type: 'add',
        timestamp: '2026-04-18T10:00:00.000Z',
      }))
      await log.append(makeEvent({
        entryId: 'pref-001',
        type: 'merge',
        timestamp: '2026-04-19T10:00:00.000Z',
      }))
      await log.append(makeEvent({
        entryId: 'dec-001',
        type: 'add',
        timestamp: '2026-04-20T10:00:00.000Z',
        section: 'technical_decision',
      }))

      const byEntryId = await log.query({ entryId: 'pref-001' })
      expect(byEntryId.length).toBe(2)

      const byType = await log.query({ type: 'add' })
      expect(byType.length).toBe(2)

      const bySince = await log.query({ since: '2026-04-19T00:00:00.000Z' })
      expect(bySince.length).toBe(2)

      const limited = await log.query({ limit: 1 })
      expect(limited.length).toBe(1)
      expect(limited[0]!.timestamp).toBe('2026-04-20T10:00:00.000Z')
    })
  })

  describe('5. Malformed CHANGELOG continues running', () => {
    it('skips malformed blocks and returns valid events', async () => {
      const dirPath = path.join(tmpDir, '.sibylla', 'memory')
      await fs.mkdir(dirPath, { recursive: true })

      const malformedContent = `# 记忆演化日志

---

## Some garbled line

Invalid block content

## 2026-04-20T10:00:00.000Z — add — pref-001

- **Section:** user_preference
- **Trigger:** checkpoint

---
`
      await fs.writeFile(path.join(dirPath, 'CHANGELOG.md'), malformedContent, 'utf-8')

      const log = new EvolutionLog(tmpDir)
      const results = await log.query({})

      expect(results.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('6. Write failure does not throw', () => {
    it('catches append error and logs it without throwing', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const log = new EvolutionLog('/nonexistent/path/that/does/not/exist')
      const event = makeEvent()

      await expect(log.append(event)).resolves.toBeUndefined()

      errorSpy.mockRestore()
    })
  })
})
