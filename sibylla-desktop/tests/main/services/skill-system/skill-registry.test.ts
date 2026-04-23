import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SkillV2 } from '../../../../src/shared/types'
import { SkillRegistry } from '../../../../src/main/services/skill-system/SkillRegistry'

vi.mock('../../../../src/main/services/skill-engine', () => {
  const SkillEngine = vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    getSkill: vi.fn().mockReturnValue(undefined),
    handleFileChange: vi.fn(),
  }))
  return { SkillEngine }
})

vi.mock('../../../../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

function makeSkill(overrides: Partial<SkillV2> & { id: string }): SkillV2 {
  return {
    version: '1.0.0',
    name: overrides.id,
    description: `${overrides.id} description`,
    scenarios: '',
    instructions: '',
    outputFormat: '',
    examples: '',
    filePath: overrides.filePath ?? `skills/${overrides.id}.md`,
    tokenCount: 0,
    updatedAt: Date.now(),
    author: 'test',
    category: 'general',
    tags: [],
    scope: 'public',
    source: 'builtin',
    triggers: [],
    formatVersion: 2,
    ...overrides,
  }
}

function createMocks() {
  const loader = {
    loadFromDir: vi.fn().mockResolvedValue([]),
  }
  const fileManager = {}
  return { loader, fileManager }
}

describe('SkillRegistry', () => {
  let loader: ReturnType<typeof createMocks>['loader']
  let fileManager: ReturnType<typeof createMocks>['fileManager']

  beforeEach(() => {
    vi.clearAllMocks()
    const mocks = createMocks()
    loader = mocks.loader
    fileManager = mocks.fileManager
  })

  describe('discoverAll — three-source registration', () => {
    it('registers skills from builtin, workspace, legacy, and personal directories', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([makeSkill({ id: 'builtin-a', source: 'builtin' })])
        .mockResolvedValueOnce([makeSkill({ id: 'ws-b', source: 'workspace' })])
        .mockResolvedValueOnce([makeSkill({ id: 'legacy-c', source: 'workspace' })])
        .mockResolvedValueOnce([makeSkill({ id: 'personal-d', source: 'personal', filePath: 'personal/user1/skills/personal-d.md' })])

      const registry = new SkillRegistry(loader as any, fileManager as any, 'user1')
      const skills = await registry.discoverAll()

      expect(skills).toHaveLength(4)
      expect(skills.map((s) => s.id).sort()).toEqual(['builtin-a', 'legacy-c', 'personal-d', 'ws-b'])
      expect(loader.loadFromDir).toHaveBeenCalledTimes(4)
    })

    it('workspace overrides builtin for same id', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([makeSkill({ id: 'shared-skill', source: 'builtin', description: 'builtin desc' })])
        .mockResolvedValueOnce([makeSkill({ id: 'shared-skill', source: 'workspace', description: 'workspace desc' })])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const registry = new SkillRegistry(loader as any, fileManager as any)
      const skills = await registry.discoverAll()

      expect(skills).toHaveLength(1)
      expect(skills[0].description).toBe('workspace desc')
      expect(skills[0].source).toBe('workspace')
    })

    it('personal overrides workspace which overrides builtin for same id', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([makeSkill({ id: 'x', source: 'builtin', description: 'builtin' })])
        .mockResolvedValueOnce([makeSkill({ id: 'x', source: 'workspace', description: 'workspace' })])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([makeSkill({ id: 'x', source: 'personal', description: 'personal', filePath: 'personal/user1/skills/x.md' })])

      const registry = new SkillRegistry(loader as any, fileManager as any, 'user1')
      const skills = await registry.discoverAll()

      expect(skills).toHaveLength(1)
      expect(skills[0].description).toBe('personal')
      expect(skills[0].source).toBe('personal')
    })

    it('skips personal scan when no currentUser', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const registry = new SkillRegistry(loader as any, fileManager as any)
      await registry.discoverAll()

      expect(loader.loadFromDir).toHaveBeenCalledTimes(3)
    })

    it('continues when legacy engine init fails', async () => {
      const { SkillEngine: SE } = await import('../../../../src/main/services/skill-engine')
      SE.mockImplementationOnce(() => ({
        initialize: vi.fn().mockRejectedValue(new Error('init failed')),
        getSkill: vi.fn(),
        handleFileChange: vi.fn(),
      }))

      loader.loadFromDir
        .mockResolvedValueOnce([makeSkill({ id: 'a', source: 'builtin' })])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const registry = new SkillRegistry(loader as any, fileManager as any, 'user1')
      const skills = await registry.discoverAll()

      expect(skills).toHaveLength(1)
    })
  })

  describe('get — personal skill isolation', () => {
    it('returns personal skill for the owning user', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([makeSkill({ id: 'my-skill', source: 'personal', scope: 'personal', filePath: 'personal/user1/skills/my-skill.md' })])

      const registry = new SkillRegistry(loader as any, fileManager as any, 'user1')
      await registry.discoverAll()

      expect(registry.get('my-skill')).toBeDefined()
    })

    it('returns undefined for personal skill of a different user', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([makeSkill({ id: 'other-skill', source: 'personal', scope: 'personal', filePath: 'personal/user2/skills/other-skill.md' })])

      const registry = new SkillRegistry(loader as any, fileManager as any, 'user1')
      await registry.discoverAll()

      expect(registry.get('other-skill')).toBeUndefined()
    })

    it('returns undefined for non-existent id', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const registry = new SkillRegistry(loader as any, fileManager as any)
      await registry.discoverAll()

      expect(registry.get('nope')).toBeUndefined()
    })

    it('returns builtin skill regardless of user', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([makeSkill({ id: 'core-skill', source: 'builtin', scope: 'public' })])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const registry = new SkillRegistry(loader as any, fileManager as any, 'user1')
      await registry.discoverAll()

      expect(registry.get('core-skill')).toBeDefined()
      expect(registry.get('core-skill')!.source).toBe('builtin')
    })
  })

  describe('getAll — respects personal space isolation', () => {
    it('excludes personal skills of other users from getAll', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([makeSkill({ id: 'pub', source: 'builtin' })])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          makeSkill({ id: 'my-skill', source: 'personal', scope: 'personal', filePath: 'personal/user1/skills/my-skill.md' }),
          makeSkill({ id: 'alien-skill', source: 'personal', scope: 'personal', filePath: 'personal/user2/skills/alien-skill.md' }),
        ])

      const registry = new SkillRegistry(loader as any, fileManager as any, 'user1')
      await registry.discoverAll()

      const all = registry.getAll()
      expect(all).toHaveLength(2)
      expect(all.map((s) => s.id).sort()).toEqual(['my-skill', 'pub'])
    })
  })

  describe('resolveByTrigger — slash, mention, and pattern triggers', () => {
    it('matches slash trigger', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([makeSkill({ id: 'prd', source: 'builtin', triggers: [{ slash: '/prd' }] })])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const registry = new SkillRegistry(loader as any, fileManager as any)
      await registry.discoverAll()

      const result = registry.resolveByTrigger('/prd')
      expect(result).not.toBeNull()
      expect(result!.id).toBe('prd')
    })

    it('matches mention trigger', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([makeSkill({ id: 'review', source: 'builtin', triggers: [{ mention: '@reviewer' }] })])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const registry = new SkillRegistry(loader as any, fileManager as any)
      await registry.discoverAll()

      const result = registry.resolveByTrigger('@reviewer')
      expect(result).not.toBeNull()
      expect(result!.id).toBe('review')
    })

    it('matches pattern trigger via regex', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([makeSkill({ id: 'code-gen', source: 'builtin', triggers: [{ pattern: '^generate\\s+code' }] })])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const registry = new SkillRegistry(loader as any, fileManager as any)
      await registry.discoverAll()

      const result = registry.resolveByTrigger('generate code for me')
      expect(result).not.toBeNull()
      expect(result!.id).toBe('code-gen')
    })

    it('returns null when no trigger matches', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([makeSkill({ id: 'a', source: 'builtin', triggers: [{ slash: '/a' }] })])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const registry = new SkillRegistry(loader as any, fileManager as any)
      await registry.discoverAll()

      expect(registry.resolveByTrigger('/unknown')).toBeNull()
    })

    it('skips invalid regex pattern gracefully', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([makeSkill({ id: 'bad', source: 'builtin', triggers: [{ pattern: '([invalid' }] })])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const registry = new SkillRegistry(loader as any, fileManager as any)
      await registry.discoverAll()

      expect(registry.resolveByTrigger('something')).toBeNull()
    })

    it('slash trigger takes precedence over pattern', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([makeSkill({ id: 'slash', source: 'builtin', triggers: [{ slash: '/test' }] })])
        .mockResolvedValueOnce([makeSkill({ id: 'pattern', source: 'workspace', triggers: [{ pattern: '.*' }] })])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const registry = new SkillRegistry(loader as any, fileManager as any)
      await registry.discoverAll()

      const result = registry.resolveByTrigger('/test')
      expect(result!.id).toBe('slash')
    })
  })

  describe('getAvailableInMode', () => {
    it('returns all skills when no modes specified', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([makeSkill({ id: 'no-mode', source: 'builtin', loadableIn: undefined })])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const registry = new SkillRegistry(loader as any, fileManager as any)
      await registry.discoverAll()

      const result = registry.getAvailableInMode('chat')
      expect(result).toHaveLength(1)
    })

    it('returns all skills when loadableIn.modes is empty', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([makeSkill({ id: 'empty-modes', source: 'builtin', loadableIn: { modes: [] } })])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const registry = new SkillRegistry(loader as any, fileManager as any)
      await registry.discoverAll()

      expect(registry.getAvailableInMode('chat')).toHaveLength(1)
    })

    it('filters skills by mode', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([
          makeSkill({ id: 'chat-only', source: 'builtin', loadableIn: { modes: ['chat'] } }),
          makeSkill({ id: 'agent-only', source: 'builtin', loadableIn: { modes: ['agent'] } }),
          makeSkill({ id: 'both', source: 'builtin', loadableIn: { modes: ['chat', 'agent'] } }),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const registry = new SkillRegistry(loader as any, fileManager as any)
      await registry.discoverAll()

      const chatSkills = registry.getAvailableInMode('chat')
      expect(chatSkills.map((s) => s.id).sort()).toEqual(['both', 'chat-only'])

      const agentSkills = registry.getAvailableInMode('agent')
      expect(agentSkills.map((s) => s.id).sort()).toEqual(['agent-only', 'both'])
    })
  })

  describe('search — trigger index first, then fuzzy', () => {
    it('returns exact trigger match first', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([
          makeSkill({ id: 'fuzzy-match', source: 'builtin', name: 'fuzzy-match', triggers: [] }),
          makeSkill({ id: 'triggered', source: 'builtin', name: 'triggered', triggers: [{ slash: '/trigger' }] }),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const registry = new SkillRegistry(loader as any, fileManager as any)
      await registry.discoverAll()

      const result = registry.search('/trigger')
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('triggered')
    })

    it('performs fuzzy search by id, name, description, and tags', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([
          makeSkill({ id: 'code-review', source: 'builtin', name: 'Code Review', description: 'Review code quality', tags: ['review', 'code'] }),
          makeSkill({ id: 'pr-review', source: 'builtin', name: 'PR Review', description: 'Review pull requests', tags: ['review'] }),
          makeSkill({ id: 'deploy', source: 'builtin', name: 'Deploy', description: 'Deploy to production', tags: ['ci'] }),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const registry = new SkillRegistry(loader as any, fileManager as any)
      await registry.discoverAll()

      const result = registry.search('review')
      expect(result.length).toBeGreaterThanOrEqual(2)
      const ids = result.map((s) => s.id)
      expect(ids).toContain('code-review')
      expect(ids).toContain('pr-review')
      expect(ids).not.toContain('deploy')
    })

    it('exact id match scores highest', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([
          makeSkill({ id: 'test', source: 'builtin', name: 'Something else', description: 'test helper', tags: [] }),
          makeSkill({ id: 'test-helper', source: 'builtin', name: 'Test Helper', description: 'test helper tool', tags: ['test'] }),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const registry = new SkillRegistry(loader as any, fileManager as any)
      await registry.discoverAll()

      const result = registry.search('test')
      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    it('respects limit parameter', async () => {
      const skills = Array.from({ length: 20 }, (_, i) =>
        makeSkill({ id: `skill-${i}`, source: 'builtin', name: `Skill ${i}`, description: 'test description', tags: ['test'] }),
      )
      loader.loadFromDir.mockResolvedValueOnce(skills).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([])

      const registry = new SkillRegistry(loader as any, fileManager as any)
      await registry.discoverAll()

      const result = registry.search('skill', 5)
      expect(result.length).toBeLessThanOrEqual(5)
    })

    it('returns empty array for non-matching query', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([makeSkill({ id: 'alpha', source: 'builtin', name: 'Alpha', description: 'First skill', tags: ['a'] })])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const registry = new SkillRegistry(loader as any, fileManager as any)
      await registry.discoverAll()

      expect(registry.search('zzzzzzz')).toEqual([])
    })
  })

  describe('getSkillSummaries', () => {
    it('returns SkillSummary array from getAll', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([
          makeSkill({ id: 's1', source: 'builtin', name: 'Skill One', description: 'First', scenarios: 'scenario a' }),
          makeSkill({ id: 's2', source: 'builtin', name: 'Skill Two', description: 'Second', scenarios: 'scenario b' }),
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const registry = new SkillRegistry(loader as any, fileManager as any)
      await registry.discoverAll()

      const summaries = registry.getSkillSummaries()
      expect(summaries).toHaveLength(2)
      expect(summaries[0]).toEqual({
        id: expect.any(String),
        name: expect.any(String),
        description: expect.any(String),
        scenarios: expect.any(String),
      })
      const ids = summaries.map((s) => s.id).sort()
      expect(ids).toEqual(['s1', 's2'])
    })
  })

  describe('handleFileChange', () => {
    it('delegates to legacy engine', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const registry = new SkillRegistry(loader as any, fileManager as any)
      await registry.discoverAll()

      const event = { type: 'change', path: 'skills/test.md' }
      registry.handleFileChange(event)

      const engine = registry.getLegacyEngine()
      expect(engine.handleFileChange).toHaveBeenCalledWith(event)
    })
  })

  describe('getLegacyEngine', () => {
    it('returns the internal SkillEngine instance', async () => {
      loader.loadFromDir
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const registry = new SkillRegistry(loader as any, fileManager as any)
      await registry.discoverAll()

      const engine = registry.getLegacyEngine()
      expect(engine).toBeDefined()
      expect(engine.initialize).toBeDefined()
      expect(engine.handleFileChange).toBeDefined()
    })
  })

  describe('getLegacySkill', () => {
    it('delegates to legacy engine getSkill', async () => {
      const { SkillEngine: SE } = await import('../../../../src/main/services/skill-engine')
      const mockGetSkill = vi.fn().mockReturnValue({ id: 'legacy', name: 'Legacy Skill' })
      SE.mockImplementationOnce(() => ({
        initialize: vi.fn().mockResolvedValue(undefined),
        getSkill: mockGetSkill,
        handleFileChange: vi.fn(),
      }))

      loader.loadFromDir
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const registry = new SkillRegistry(loader as any, fileManager as any)
      await registry.discoverAll()

      const result = registry.getLegacySkill('legacy')
      expect(mockGetSkill).toHaveBeenCalledWith('legacy')
      expect(result).toEqual({ id: 'legacy', name: 'Legacy Skill' })
    })
  })
})
