import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { HandbookService } from '../../src/main/services/handbook/handbook-service'
import type { DatabaseManager } from '../../src/main/services/database-manager'

vi.mock('../../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    setLevel: vi.fn(),
  },
}))

function createMockDbManager() {
  return {
    indexFileContent: vi.fn(),
    removeFileIndex: vi.fn(),
    searchFiles: vi.fn(() => []),
    getFileMeta: vi.fn(),
    upsertFileMeta: vi.fn(),
    deleteFileMeta: vi.fn(),
    getAllFileMeta: vi.fn(() => []),
    clearAllIndexes: vi.fn(),
    getIndexedFileCount: vi.fn(() => 0),
    getDatabaseSize: vi.fn(() => 0),
    checkIntegrity: vi.fn(() => true),
    close: vi.fn(),
  } as unknown as DatabaseManager
}

function createMockFileManager() {
  return {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    getWorkspaceRoot: vi.fn(() => ''),
  }
}

describe('HandbookService', () => {
  let tmpDir: string
  let resourcesDir: string
  let workspaceDir: string
  let dbManager: DatabaseManager
  let fileManager: ReturnType<typeof createMockFileManager>
  let service: HandbookService

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'handbook-test-'))
    resourcesDir = path.join(tmpDir, 'resources')
    workspaceDir = path.join(tmpDir, 'workspace')
    fs.mkdirSync(resourcesDir, { recursive: true })
    fs.mkdirSync(workspaceDir, { recursive: true })

    dbManager = createMockDbManager()
    fileManager = createMockFileManager()
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function setupHandbookFiles(lang: string = 'zh', entries: Array<{ path: string; content: string }> = []) {
    const langDir = path.join(resourcesDir, 'handbook', lang)
    fs.mkdirSync(langDir, { recursive: true })

    const entriesYaml = entries.length > 0
      ? entries.map(e => `  - id: ${e.path.replace(/\.md$/, '').replace(/\//g, '.')}
    path: ${e.path}
    title: { zh: "${e.path}", en: "${e.path}" }
    tags: [test]
    keywords: [test]`).join('\n')
      : '  []'

    const yamlContent = `version: "1.0.0"
languages: [zh, en]
entries:
${entriesYaml}
`
    fs.writeFileSync(path.join(resourcesDir, 'handbook', 'index.yaml'), yamlContent, 'utf-8')

    for (const entry of entries) {
      const dir = path.join(langDir, path.dirname(entry.path))
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(langDir, entry.path), entry.content, 'utf-8')
    }
  }

  describe('initialize', () => {
    it('loads builtin entries from resources', async () => {
      setupHandbookFiles('zh', [
        { path: 'getting-started.md', content: '# Getting Started\n\nWelcome!' },
      ])

      service = new HandbookService(resourcesDir, workspaceDir, fileManager, dbManager)
      await service.initialize()

      service.search('Welcome', { limit: 5 })
      expect(dbManager.indexFileContent).toHaveBeenCalled()
    })

    it('gracefully degrades when resources missing', async () => {
      service = new HandbookService('/nonexistent', workspaceDir, fileManager, dbManager)
      await service.initialize()

      expect(service.getEntry('any')).toBeNull()
    })
  })

  describe('getEntry', () => {
    it('returns entry by id and language', async () => {
      setupHandbookFiles('zh', [
        { path: 'modes/plan.md', content: 'Plan mode content' },
      ])

      service = new HandbookService(resourcesDir, workspaceDir, fileManager, dbManager)
      await service.initialize()

      const entry = service.getEntry('modes.plan', 'zh')
      expect(entry).not.toBeNull()
      expect(entry?.id).toBe('modes.plan')
      expect(entry?.source).toBe('builtin')
    })

    it('falls back to English when Chinese missing', async () => {
      const langDirZh = path.join(resourcesDir, 'handbook', 'zh')
      const langDirEn = path.join(resourcesDir, 'handbook', 'en')
      fs.mkdirSync(langDirZh, { recursive: true })
      fs.mkdirSync(langDirEn, { recursive: true })

      const yamlContent = `version: "1.0.0"
languages: [zh, en]
entries:
  - id: modes.plan
    path: modes/plan.md
    title: { zh: "Plan", en: "Plan" }
    tags: [mode]
    keywords: [plan]
`
      fs.writeFileSync(path.join(resourcesDir, 'handbook', 'index.yaml'), yamlContent, 'utf-8')

      fs.mkdirSync(path.join(langDirEn, 'modes'), { recursive: true })
      fs.writeFileSync(path.join(langDirEn, 'modes/plan.md'), 'Plan mode English', 'utf-8')

      service = new HandbookService(resourcesDir, workspaceDir, fileManager, dbManager)
      await service.initialize()

      const entry = service.getEntry('modes.plan', 'zh')
      expect(entry).not.toBeNull()
      expect(entry?.language).toBe('en')
    })

    it('returns null when entry not found', async () => {
      setupHandbookFiles('zh', [])
      service = new HandbookService(resourcesDir, workspaceDir, fileManager, dbManager)
      await service.initialize()

      expect(service.getEntry('nonexistent', 'zh')).toBeNull()
    })
  })

  describe('search', () => {
    it('returns matching entries', async () => {
      setupHandbookFiles('zh', [
        { path: 'getting-started.md', content: 'Quick start guide' },
        { path: 'faq.md', content: 'Frequently asked questions' },
      ])

      dbManager = {
        ...createMockDbManager(),
        searchFiles: vi.fn(() => [
          { path: 'handbook/zh/getting-started.md', snippet: 'Quick start', rank: -1, matchCount: 1 },
        ]),
      } as unknown as DatabaseManager

      service = new HandbookService(resourcesDir, workspaceDir, fileManager, dbManager)
      await service.initialize()

      const results = service.search('Quick start', { limit: 5 })
      expect(results.length).toBeGreaterThan(0)
      expect(results[0]?.id).toBe('getting-started')
    })
  })

  describe('suggestForQuery', () => {
    it('detects how-to questions in Chinese', async () => {
      setupHandbookFiles('zh', [
        { path: 'getting-started.md', content: '如何使用 Sibylla' },
      ])

      dbManager = {
        ...createMockDbManager(),
        searchFiles: vi.fn(() => [
          { path: 'handbook/zh/getting-started.md', snippet: '如何', rank: -1, matchCount: 1 },
        ]),
      } as unknown as DatabaseManager

      service = new HandbookService(resourcesDir, workspaceDir, fileManager, dbManager)
      await service.initialize()

      const results = service.suggestForQuery('Sibylla 怎么用？')
      expect(results.length).toBeLessThanOrEqual(2)
    })

    it('detects how-to questions in English', async () => {
      setupHandbookFiles('zh', [])
      service = new HandbookService(resourcesDir, workspaceDir, fileManager, dbManager)
      await service.initialize()

      service.suggestForQuery('How to use Sibylla?')
      expect(dbManager.searchFiles).toHaveBeenCalled()
    })

    it('returns empty for non-how-to questions', async () => {
      setupHandbookFiles('zh', [])
      service = new HandbookService(resourcesDir, workspaceDir, fileManager, dbManager)
      await service.initialize()

      const results = service.suggestForQuery('The weather is nice today')
      expect(results).toEqual([])
    })

    it('limits results to 2', async () => {
      setupHandbookFiles('zh', [])
      service = new HandbookService(resourcesDir, workspaceDir, fileManager, dbManager)
      await service.initialize()

      service.suggestForQuery('如何做这件事？')
      expect(dbManager.searchFiles).toHaveBeenCalledWith(expect.any(String), 4)
    })
  })

  describe('cloneToWorkspace', () => {
    it('copies builtin entries to local directory', async () => {
      setupHandbookFiles('zh', [
        { path: 'getting-started.md', content: 'Welcome content' },
      ])

      service = new HandbookService(resourcesDir, workspaceDir, fileManager, dbManager)
      await service.initialize()

      const result = await service.cloneToWorkspace()

      expect(result.clonedCount).toBeGreaterThan(0)
      expect(fs.existsSync(path.join(workspaceDir, '.sibylla', 'handbook-local'))).toBe(true)
    })

    it('preserves existing local files', async () => {
      setupHandbookFiles('zh', [
        { path: 'existing.md', content: 'Original content' },
      ])

      const localDir = path.join(workspaceDir, '.sibylla', 'handbook-local', 'zh')
      fs.mkdirSync(localDir, { recursive: true })
      fs.writeFileSync(path.join(localDir, 'existing.md'), 'User modified content', 'utf-8')

      service = new HandbookService(resourcesDir, workspaceDir, fileManager, dbManager)
      await service.initialize()

      await service.cloneToWorkspace()

      const content = fs.readFileSync(path.join(localDir, 'existing.md'), 'utf-8')
      expect(content).toBe('User modified content')
    })

    it('writes metadata file', async () => {
      setupHandbookFiles('zh', [
        { path: 'test.md', content: 'Test' },
      ])

      service = new HandbookService(resourcesDir, workspaceDir, fileManager, dbManager)
      await service.initialize()

      await service.cloneToWorkspace()

      const metaPath = path.join(workspaceDir, '.sibylla', 'handbook-local', '.cloned-from-version')
      expect(fs.existsSync(metaPath)).toBe(true)

      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
      expect(meta.version).toBe('1.0.0')
      expect(meta.clonedAt).toBeDefined()
    })
  })

  describe('checkUpdates', () => {
    it('returns hasUpdates false when no local clone', async () => {
      setupHandbookFiles('zh', [])
      service = new HandbookService(resourcesDir, workspaceDir, fileManager, dbManager)
      await service.initialize()

      const result = service.checkUpdates()
      expect(result.hasUpdates).toBe(false)
    })
  })
})
