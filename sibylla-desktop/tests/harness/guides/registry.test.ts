/**
 * GuideRegistry unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GuideRegistry } from '../../../src/main/services/harness/guides/registry'
import type { GuideMatchContext } from '../../../src/main/services/harness/guides/types'
import type { AIChatRequest, WorkspaceConfig } from '../../../src/shared/types'
import { promises as fs } from 'fs'

vi.mock('fs', () => ({
  promises: {
    readdir: vi.fn(),
    readFile: vi.fn(),
  },
}))

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}

const defaultWorkspaceConfig: WorkspaceConfig = {
  workspaceId: 'ws-test',
  name: 'Test',
  description: '',
  icon: '',
  defaultModel: 'claude-sonnet-4-20250514',
  syncInterval: 0,
  createdAt: '',
  gitProvider: 'sibylla',
  gitRemote: null,
  lastSyncAt: null,
}

const defaultMatchCtx: GuideMatchContext = {
  currentModel: 'claude-sonnet-4-20250514',
  workspaceConfig: defaultWorkspaceConfig,
  userId: 'user-1',
}

describe('GuideRegistry', () => {
  let registry: GuideRegistry

  beforeEach(() => {
    vi.clearAllMocks()
    registry = new GuideRegistry(mockLogger as never)
  })

  describe('loadBuiltIn()', () => {
    it('should load 4 built-in guides', async () => {
      await registry.loadBuiltIn()

      const guides = registry.listGuides()
      expect(guides).toHaveLength(4)
      expect(guides.map(g => g.id)).toEqual([
        'risk.spec-modification',
        'path.product-docs',
        'intent.file-edit',
        'model.claude-verbosity',
      ])
    })
  })

  describe('loadWorkspaceCustom()', () => {
    it('should load workspace custom guides from .sibylla/harness/guides/*.json', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['custom-guide.json', 'other.txt'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({
        id: 'custom.test-guide',
        category: 'intent',
        priority: 30,
        content: 'Custom guide content',
        tokenBudget: 80,
        matches: { intent: ['modify_file'] },
      }))

      await registry.loadWorkspaceCustom('/workspace')

      expect(fs.readdir).toHaveBeenCalledWith('/workspace/.sibylla/harness/guides')
      const guides = registry.listGuides()
      const customGuide = guides.find(g => g.id === 'custom.test-guide')
      expect(customGuide).toBeDefined()
      expect(customGuide!.category).toBe('intent')
      expect(customGuide!.priority).toBe(30)
    })

    it('should silently skip when workspace directory not found', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'))

      await registry.loadWorkspaceCustom('/nonexistent')

      expect(mockLogger.info).toHaveBeenCalledWith(
        'guide.registry.workspace_custom_skip',
        { reason: 'directory_not_found' },
      )
    })

    it('should warn and skip invalid JSON in custom guide', async () => {
      vi.mocked(fs.readdir).mockResolvedValue(['broken.json'] as unknown as string[])
      vi.mocked(fs.readFile).mockResolvedValue('{ invalid json')

      await registry.loadWorkspaceCustom('/workspace')

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'guide.registry.workspace_custom_parse_failed',
        expect.objectContaining({ file: 'broken.json' }),
      )
    })
  })

  describe('resolve()', () => {
    it('should sort matched guides by priority descending', async () => {
      await registry.loadBuiltIn()

      const request: AIChatRequest = {
        message: 'Edit the file',
        intent: 'modify_file',
        targetFile: 'CLAUDE.md',
      }
      const ctx: GuideMatchContext = {
        ...defaultMatchCtx,
        currentModel: 'claude-sonnet-4-20250514',
      }

      const resolved = registry.resolve(request, ctx)

      const priorities = resolved.map(g => g.priority)
      for (let i = 1; i < priorities.length; i++) {
        expect(priorities[i]).toBeLessThanOrEqual(priorities[i - 1]!)
      }
    })
  })

  describe('applyTokenBudget()', () => {
    it('should trim low priority guides when over budget', async () => {
      await registry.loadBuiltIn()

      const request: AIChatRequest = {
        message: 'Edit the file',
        intent: 'modify_file',
        targetFile: 'CLAUDE.md',
      }
      const ctx: GuideMatchContext = {
        ...defaultMatchCtx,
        currentModel: 'claude-sonnet-4-20250514',
      }

      const allMatched = registry.resolve(request, ctx, 500)
      const totalBudget = Math.floor(500 * 0.2)

      let cumulative = 0
      for (const guide of allMatched) {
        cumulative += guide.tokenBudget
        expect(cumulative).toBeLessThanOrEqual(totalBudget + guide.tokenBudget)
      }
    })
  })

  describe('setGuideEnabled()', () => {
    it('should exclude disabled guide from resolve() results', async () => {
      await registry.loadBuiltIn()

      registry.setGuideEnabled('risk.spec-modification', false)

      const request: AIChatRequest = {
        message: 'Edit the file',
        intent: 'modify_file',
        targetFile: 'CLAUDE.md',
      }
      const resolved = registry.resolve(request, defaultMatchCtx)
      expect(resolved.some(g => g.id === 'risk.spec-modification')).toBe(false)
    })

    it('should throw on unknown guide id', () => {
      expect(() => registry.setGuideEnabled('non-existent-guide', true)).toThrow(
        "Unknown guide ID: 'non-existent-guide'",
      )
    })
  })
})
