import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MCPTemplateLoader } from '../../../../src/main/services/mcp/mcp-templates'

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

const VALID_TEMPLATE = {
  id: 'test',
  name: 'Test Template',
  description: 'A test template',
  icon: 'test',
  category: 'test',
  serverConfig: { name: 'test', transport: 'stdio' as const, command: 'test-cmd' },
  credentialFields: [],
  dependencies: [],
  tools: ['tool1', 'tool2'],
  sensitiveToolPatterns: ['delete_*'],
}

describe('MCPTemplateLoader', () => {
  let loader: MCPTemplateLoader

  beforeEach(() => {
    vi.clearAllMocks()
    loader = new MCPTemplateLoader('/resources/mcp-templates')
  })

  describe('initialize', () => {
    it('should load valid template files', async () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddir.mockResolvedValue(['test.json'])
      mockReadFile.mockResolvedValue(JSON.stringify(VALID_TEMPLATE))
      await loader.initialize()
      expect(loader.listTemplates()).toHaveLength(1)
    })

    it('should skip invalid template files', async () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddir.mockResolvedValue(['bad.json'])
      mockReadFile.mockResolvedValue('{ invalid json')
      await loader.initialize()
      expect(loader.listTemplates()).toHaveLength(0)
    })

    it('should skip non-JSON files', async () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddir.mockResolvedValue(['readme.txt', 'data.csv'])
      await loader.initialize()
      expect(loader.listTemplates()).toHaveLength(0)
    })

    it('should handle missing directory gracefully', async () => {
      mockExistsSync.mockReturnValue(false)
      await loader.initialize()
      expect(loader.listTemplates()).toHaveLength(0)
    })
  })

  describe('validateTemplate', () => {
    it('should reject template missing id', async () => {
      const badTemplate = { ...VALID_TEMPLATE, id: '' }
      mockExistsSync.mockReturnValue(true)
      mockReaddir.mockResolvedValue(['bad.json'])
      mockReadFile.mockResolvedValue(JSON.stringify(badTemplate))
      await loader.initialize()
      expect(loader.listTemplates()).toHaveLength(0)
    })

    it('should reject template missing serverConfig', async () => {
      const badTemplate = { ...VALID_TEMPLATE, serverConfig: undefined }
      mockExistsSync.mockReturnValue(true)
      mockReaddir.mockResolvedValue(['bad.json'])
      mockReadFile.mockResolvedValue(JSON.stringify(badTemplate))
      await loader.initialize()
      expect(loader.listTemplates()).toHaveLength(0)
    })

    it('should reject template with missing tools field', async () => {
      const badTemplate = { ...VALID_TEMPLATE, tools: undefined }
      mockExistsSync.mockReturnValue(true)
      mockReaddir.mockResolvedValue(['bad.json'])
      mockReadFile.mockResolvedValue(JSON.stringify(badTemplate))
      await loader.initialize()
      expect(loader.listTemplates()).toHaveLength(0)
    })
  })

  describe('getTemplate', () => {
    it('should return template by id', async () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddir.mockResolvedValue(['test.json'])
      mockReadFile.mockResolvedValue(JSON.stringify(VALID_TEMPLATE))
      await loader.initialize()
      const template = loader.getTemplate('test')
      expect(template).toBeDefined()
      expect(template!.name).toBe('Test Template')
    })

    it('should return undefined for unknown id', async () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddir.mockResolvedValue(['test.json'])
      mockReadFile.mockResolvedValue(JSON.stringify(VALID_TEMPLATE))
      await loader.initialize()
      expect(loader.getTemplate('unknown')).toBeUndefined()
    })
  })

  describe('listTemplates', () => {
    it('should list all loaded templates', async () => {
      const template2 = { ...VALID_TEMPLATE, id: 'test2', name: 'Test 2' }
      mockExistsSync.mockReturnValue(true)
      mockReaddir.mockResolvedValue(['test1.json', 'test2.json'])
      let callCount = 0
      mockReadFile.mockImplementation(async () => {
        callCount++
        return callCount === 1 ? JSON.stringify(VALID_TEMPLATE) : JSON.stringify(template2)
      })
      await loader.initialize()
      expect(loader.listTemplates()).toHaveLength(2)
    })
  })
})
