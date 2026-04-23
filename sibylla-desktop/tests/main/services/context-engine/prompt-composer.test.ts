import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PromptComposer } from '../../../../src/main/services/context-engine/PromptComposer'
import type { PromptLoader } from '../../../../src/main/services/context-engine/PromptLoader'
import type { PromptRegistry } from '../../../../src/services/context-engine/PromptRegistry'
import { PromptDependencyError } from '../../../../src/main/services/context-engine/types'

function createMockLoader(): PromptLoader {
  return {
    load: vi.fn().mockImplementation(async (id: string) => ({
      id,
      version: '1.0.0',
      scope: id.startsWith('core.') ? 'core' : 'mode',
      body: `Body of ${id}`,
      source: 'builtin',
      path: `/builtin/${id}.md`,
      tokens: 50,
      rawFrontmatter: {},
    })),
    loadSafe: vi.fn(),
    readAsBuiltin: vi.fn().mockImplementation(async (id: string) => ({
      id,
      version: '1.0.0',
      scope: 'core',
      body: `<immutable>Core content for ${id}</immutable>`,
      source: 'builtin',
      path: `/builtin/${id}.md`,
      tokens: 50,
      rawFrontmatter: {},
    })),
    render: vi.fn().mockImplementation(async (id: string) => ({
      id,
      version: '1.0.0',
      scope: 'context',
      body: `Rendered ${id}`,
      source: 'builtin',
      path: `/builtin/${id}.md`,
      tokens: 30,
      rawFrontmatter: {},
    })),
    exists: vi.fn().mockResolvedValue(true),
    resolveUserPath: vi.fn().mockImplementation((id: string) => `/user/${id}.md`),
    resolveBuiltinPath: vi.fn().mockImplementation((id: string) => `/builtin/${id}.md`),
  } as unknown as PromptLoader
}

function createMockRegistry(): PromptRegistry {
  return {
    get: vi.fn().mockReturnValue(undefined),
    getAll: vi.fn().mockReturnValue([]),
    getByScope: vi.fn().mockReturnValue([]),
    hasUserOverride: vi.fn().mockReturnValue(false),
    refreshOverride: vi.fn(),
    removeOverride: vi.fn(),
    validate: vi.fn().mockReturnValue({ valid: true, errors: [], warnings: [] }),
  } as unknown as PromptRegistry
}

const mockTokenEstimator = (text: string) => Math.ceil(text.length / 4)

describe('PromptComposer', () => {
  let composer: PromptComposer
  let loader: PromptLoader
  let registry: PromptRegistry

  beforeEach(() => {
    loader = createMockLoader()
    registry = createMockRegistry()
    composer = new PromptComposer(loader, registry, mockTokenEstimator)
  })

  it('should load core three fragments always', async () => {
    const result = await composer.compose({
      mode: 'free',
      tools: [],
      workspaceInfo: { name: 'test', rootPath: '/tmp', fileCount: 0 },
      userPreferences: {},
    })

    const coreIds = ['core.identity', 'core.principles', 'core.tone']
    for (const coreId of coreIds) {
      expect(result.parts.some((p) => p.id === coreId)).toBe(true)
    }
  })

  it('should include mode prompt when available', async () => {
    const result = await composer.compose({
      mode: 'write',
      tools: [],
      workspaceInfo: { name: 'test', rootPath: '/tmp', fileCount: 0 },
      userPreferences: {},
    })

    expect(result.parts.some((p) => p.id === 'modes.write')).toBe(true)
  })

  it('should include tool prompts', async () => {
    const result = await composer.compose({
      mode: 'free',
      tools: [{ id: 'readFile' }, { id: 'writeFile' }],
      workspaceInfo: { name: 'test', rootPath: '/tmp', fileCount: 0 },
      userPreferences: {},
    })

    expect(result.parts.some((p) => p.id === 'tools.readFile')).toBe(true)
    expect(result.parts.some((p) => p.id === 'tools.writeFile')).toBe(true)
  })

  it('should return text composed of all parts', async () => {
    const result = await composer.compose({
      mode: 'free',
      tools: [],
      workspaceInfo: { name: 'test', rootPath: '/tmp', fileCount: 0 },
      userPreferences: {},
    })

    expect(result.text).toContain('Body of core.identity')
    expect(result.text).toContain('Body of core.principles')
    expect(result.text).toContain('Body of core.tone')
  })

  it('should track estimated tokens', async () => {
    const result = await composer.compose({
      mode: 'free',
      tools: [],
      workspaceInfo: { name: 'test', rootPath: '/tmp', fileCount: 0 },
      userPreferences: {},
    })

    expect(result.estimatedTokens).toBeGreaterThan(0)
  })

  it('should include warnings when token budget exceeded', async () => {
    const result = await composer.compose({
      mode: 'free',
      tools: [],
      maxTokens: 1,
      workspaceInfo: { name: 'test', rootPath: '/tmp', fileCount: 0 },
      userPreferences: {},
    })

    expect(result.warnings.some((w) => w.includes('token budget'))).toBe(true)
  })

  it('should cache results based on signature', async () => {
    const ctx = {
      mode: 'free',
      tools: [],
      workspaceInfo: { name: 'test', rootPath: '/tmp', fileCount: 0 },
      userPreferences: {},
    }

    const result1 = await composer.compose(ctx)
    const result2 = await composer.compose(ctx)

    expect(result1.version).toBe(result2.version)
  })

  it('should invalidate cache by id', async () => {
    const ctx = {
      mode: 'free',
      tools: [],
      workspaceInfo: { name: 'test', rootPath: '/tmp', fileCount: 0 },
      userPreferences: {},
    }

    await composer.compose(ctx)
    composer.invalidateCache('core.identity')
    await composer.compose(ctx)
  })

  it('should clear all cache when no id provided', () => {
    composer.invalidateCache()
  })

  it('should throw PromptDependencyError for missing requires', async () => {
    vi.mocked(registry.get).mockImplementation((id: string) => {
      if (id === 'core.identity') {
        return { id, requires: ['nonexistent.prompt'] }
      }
      return undefined
    })

    await expect(composer.compose({
      mode: 'free',
      tools: [],
      workspaceInfo: { name: 'test', rootPath: '/tmp', fileCount: 0 },
      userPreferences: {},
    })).rejects.toThrow(PromptDependencyError)
  })
})
