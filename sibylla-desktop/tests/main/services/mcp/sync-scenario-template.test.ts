import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadSyncScenarioTemplates, createSyncTaskFromScenario } from '../../../../src/main/services/mcp/mcp-templates'
import type { SyncScenarioTemplate } from '../../../../src/main/services/mcp/types'

// Mock logger to avoid side effects
vi.mock('../../../../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// Mock fs module
const mockExistsSync = vi.fn()
const mockReaddir = vi.fn()
const mockReadFile = vi.fn()

vi.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  promises: {
    readdir: (...args: unknown[]) => mockReaddir(...args),
    readFile: (...args: unknown[]) => mockReadFile(...args),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    appendFile: vi.fn().mockResolvedValue(undefined),
  },
}))

// ─── All 6 scenario template JSON contents ───

const SCENARIO_FILES: Record<string, SyncScenarioTemplate> = {
  'github-issues.json': {
    id: 'github-issues',
    name: 'GitHub Issues 同步',
    description: '定期同步指定仓库的 issues 到工作区',
    serverTemplateId: 'github',
    toolName: 'list_issues',
    defaultArgs: { state: 'open', sort: 'updated', direction: 'desc' },
    defaultIntervalMinutes: 30,
    targetPathTemplate: 'docs/github/{repo}/issues.md',
    writeMode: 'replace',
    transformTemplate: 'github-issues',
  },
  'github-prs.json': {
    id: 'github-prs',
    name: 'GitHub Pull Requests 同步',
    description: '定期同步指定仓库的 pull requests 到工作区',
    serverTemplateId: 'github',
    toolName: 'list_prs',
    defaultArgs: { state: 'open', sort: 'updated', direction: 'desc' },
    defaultIntervalMinutes: 30,
    targetPathTemplate: '.sibylla/inbox/prs/{repo}.md',
    writeMode: 'replace',
    transformTemplate: 'github-prs',
  },
  'slack-messages.json': {
    id: 'slack-messages',
    name: 'Slack 频道消息同步',
    description: '定期同步 Slack 重要频道的消息到工作区日志',
    serverTemplateId: 'slack',
    toolName: 'get_messages',
    defaultArgs: { limit: 100 },
    defaultIntervalMinutes: 60,
    targetPathTemplate: 'docs/logs/slack/YYYY-MM-DD.md',
    writeMode: 'append',
    transformTemplate: 'slack-messages',
  },
  'discord-announcements.json': {
    id: 'discord-announcements',
    name: 'Discord 公告同步',
    description: '每天同步 Discord 服务器公告到工作区',
    serverTemplateId: 'discord',
    toolName: 'get_announcements',
    defaultArgs: { limit: 50 },
    defaultIntervalMinutes: 1440,
    targetPathTemplate: 'docs/announcements/YYYY-MM.md',
    writeMode: 'append',
    transformTemplate: 'generic-list',
  },
  'browser-read-later.json': {
    id: 'browser-read-later',
    name: '浏览器稍后读同步',
    description: '手动触发将浏览器保存的页面同步到工作区阅读收件箱',
    serverTemplateId: 'browser',
    toolName: 'save_page',
    defaultArgs: {},
    defaultIntervalMinutes: 0,
    targetPathTemplate: 'docs/reading/inbox/YYYY-MM-DD.md',
    writeMode: 'append',
    transformTemplate: 'generic-list',
  },
  'zotero-references.json': {
    id: 'zotero-references',
    name: 'Zotero 文献同步',
    description: '每天同步 Zotero 新增文献引用到工作区参考文献目录',
    serverTemplateId: 'zotero',
    toolName: 'list_items',
    defaultArgs: { sort: 'dateAdded', direction: 'desc', limit: 50 },
    defaultIntervalMinutes: 1440,
    targetPathTemplate: 'docs/references/YYYY-MM.md',
    writeMode: 'append',
    transformTemplate: 'generic-list',
  },
}

const ALL_FILE_NAMES = Object.keys(SCENARIO_FILES)

const REQUIRED_FIELDS: ReadonlyArray<keyof SyncScenarioTemplate> = [
  'id', 'name', 'description', 'serverTemplateId', 'toolName',
  'defaultArgs', 'defaultIntervalMinutes', 'targetPathTemplate',
  'writeMode', 'transformTemplate',
]

function setupMockFs(): void {
  mockExistsSync.mockReturnValue(true)
  mockReaddir.mockResolvedValue(ALL_FILE_NAMES)
  mockReadFile.mockImplementation(async (filePath: string) => {
    const fileName = ALL_FILE_NAMES.find(f => filePath.endsWith(f))
    if (fileName && SCENARIO_FILES[fileName]) {
      return JSON.stringify(SCENARIO_FILES[fileName])
    }
    throw new Error(`File not found: ${filePath}`)
  })
}

describe('Sync Scenario Templates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loadSyncScenarioTemplates', () => {
    it('should load all 6 template JSON files with valid format', async () => {
      setupMockFs()

      const templates = await loadSyncScenarioTemplates('/resources/mcp-sync-scenarios')

      expect(templates).toHaveLength(6)

      for (const template of templates) {
        for (const field of REQUIRED_FIELDS) {
          expect(template[field]).toBeDefined()
          expect(template[field]).not.toBeNull()
        }

        expect(typeof template.id).toBe('string')
        expect(template.id.length).toBeGreaterThan(0)
        expect(typeof template.name).toBe('string')
        expect(typeof template.description).toBe('string')
        expect(typeof template.serverTemplateId).toBe('string')
        expect(typeof template.toolName).toBe('string')
        expect(typeof template.defaultArgs).toBe('object')
        expect(typeof template.defaultIntervalMinutes).toBe('number')
        expect(typeof template.targetPathTemplate).toBe('string')
        expect(['append', 'replace']).toContain(template.writeMode)
        expect(typeof template.transformTemplate).toBe('string')
      }
    })

    it('should return 6 templates when all scenario files are present', async () => {
      setupMockFs()

      const templates = await loadSyncScenarioTemplates('/resources/mcp-sync-scenarios')

      expect(templates).toHaveLength(6)

      const ids = templates.map(t => t.id)
      expect(ids).toContain('github-issues')
      expect(ids).toContain('github-prs')
      expect(ids).toContain('slack-messages')
      expect(ids).toContain('discord-announcements')
      expect(ids).toContain('browser-read-later')
      expect(ids).toContain('zotero-references')
    })
  })

  describe('createSyncTaskFromScenario', () => {
    const baseScenario: SyncScenarioTemplate = {
      id: 'github-issues',
      name: 'GitHub Issues 同步',
      description: '定期同步指定仓库的 issues 到工作区',
      serverTemplateId: 'github',
      toolName: 'list_issues',
      defaultArgs: { state: 'open', sort: 'updated', direction: 'desc' },
      defaultIntervalMinutes: 30,
      targetPathTemplate: 'docs/github/{repo}/issues.md',
      writeMode: 'replace',
      transformTemplate: 'github-issues',
    }

    it('should correctly merge scenario defaults with user overrides', () => {
      const userConfig = {
        name: 'My Custom Sync',
        intervalMinutes: 60,
      }

      const task = createSyncTaskFromScenario(baseScenario, userConfig)

      // User overrides take precedence
      expect(task.name).toBe('My Custom Sync')
      expect(task.intervalMinutes).toBe(60)

      // Defaults from scenario fill the rest
      expect(task.serverName).toBe('github')
      expect(task.toolName).toBe('list_issues')
      expect(task.args).toEqual({ state: 'open', sort: 'updated', direction: 'desc' })
      expect(task.targetPath).toBe('docs/github/{repo}/issues.md')
      expect(task.writeMode).toBe('replace')
      expect(task.transformTemplate).toBe('github-issues')
      expect(task.conflictStrategy).toBe('last-write-wins')
      expect(task.enabled).toBe(true)
    })

    it('should generate a UUID-format task id when no id is provided', () => {
      const task = createSyncTaskFromScenario(baseScenario, {})

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      expect(task.id).toMatch(uuidRegex)
    })
  })
})
