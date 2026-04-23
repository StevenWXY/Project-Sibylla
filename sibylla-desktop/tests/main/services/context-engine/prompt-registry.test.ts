import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import { PromptRegistry } from '../../../../src/main/services/context-engine/PromptRegistry'
import type { PromptLoader } from '../../../../src/main/services/context-engine/PromptLoader'

function createMockLoader(builtinRoot: string): PromptLoader {
  return {
    load: vi.fn().mockImplementation(async (id: string) => ({
      id,
      version: '1.0.0',
      scope: id.startsWith('core.') ? 'core' : 'mode',
      body: `Body of ${id}`,
      source: 'builtin',
      path: `${builtinRoot}/${id.replace('.', '/')}.md`,
      tokens: 50,
      rawFrontmatter: {
        id,
        version: '1.0.0',
        scope: id.startsWith('core.') ? 'core' : 'mode',
        tags: ['test'],
        requires: [],
        conflicts: [],
      },
    })),
    loadSafe: vi.fn(),
    readAsBuiltin: vi.fn(),
    render: vi.fn(),
    exists: vi.fn().mockResolvedValue(true),
    resolveUserPath: vi.fn().mockImplementation((id: string) => `/user/${id}.md`),
    resolveBuiltinPath: vi.fn().mockImplementation((id: string) => `${builtinRoot}/${id.replace('.', '/')}.md`),
    builtinRoot,
  } as unknown as PromptLoader
}

describe('PromptRegistry', () => {
  let tempDir: string
  let registry: PromptRegistry
  let loader: PromptLoader

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-registry-'))
    const indexContent = `version: 1
prompts:
  - id: core.identity
    scope: core
    file: core/identity.md
  - id: core.principles
    scope: core
    file: core/principles.md
  - id: modes.write
    scope: mode
    file: modes/write.md
`
    await fs.mkdir(path.join(tempDir), { recursive: true })
    await fs.writeFile(path.join(tempDir, 'index.yaml'), indexContent, 'utf-8')

    loader = createMockLoader(tempDir)
    registry = new PromptRegistry(loader)
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('should initialize and load prompts from index', async () => {
    await registry.initialize()

    const all = registry.getAll()
    expect(all.length).toBeGreaterThanOrEqual(3)
  })

  it('should get prompt by id', async () => {
    await registry.initialize()

    const metadata = registry.get('core.identity')
    expect(metadata).toBeDefined()
    expect(metadata!.id).toBe('core.identity')
  })

  it('should return undefined for nonexistent prompt', async () => {
    await registry.initialize()

    const metadata = registry.get('nonexistent')
    expect(metadata).toBeUndefined()
  })

  it('should filter prompts by scope', async () => {
    await registry.initialize()

    const corePrompts = registry.getByScope('core')
    expect(corePrompts.length).toBeGreaterThanOrEqual(2)
    expect(corePrompts.every((p) => p.scope === 'core')).toBe(true)
  })

  it('should detect user overrides', async () => {
    vi.mocked(loader.load).mockImplementation(async (id: string) => {
      if (id === 'core.identity') {
        return {
          id,
          version: '2.0.0',
          scope: 'core',
          body: 'User override',
          source: 'user-override',
          path: '/user/core/identity.md',
          tokens: 30,
          rawFrontmatter: { id, version: '2.0.0', scope: 'core' },
        }
      }
      return {
        id,
        version: '1.0.0',
        scope: id.startsWith('core.') ? 'core' : 'mode',
        body: `Body of ${id}`,
        source: 'builtin',
        path: `/builtin/${id}.md`,
        tokens: 50,
        rawFrontmatter: { id, version: '1.0.0', scope: id.startsWith('core.') ? 'core' : 'mode' },
      }
    })

    await registry.initialize()

    expect(registry.hasUserOverride('core.identity')).toBe(true)
    expect(registry.hasUserOverride('core.principles')).toBe(false)
  })

  it('should validate prompt content', async () => {
    await registry.initialize()

    const validResult = registry.validate('test', `---
id: test
version: "1.0.0"
scope: core
---

Test content.`)

    expect(validResult.valid).toBe(true)
    expect(validResult.errors).toHaveLength(0)
  })

  it('should detect missing frontmatter', async () => {
    await registry.initialize()

    const result = registry.validate('test', 'No frontmatter')

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Missing YAML frontmatter')
  })

  it('should detect missing required fields', async () => {
    await registry.initialize()

    const result = registry.validate('test', `---
id: test
---

Missing version and scope.`)

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('should warn about invalid scope', async () => {
    await registry.initialize()

    const result = registry.validate('test', `---
id: test
version: "1.0.0"
scope: invalid_scope
---

Content.`)

    expect(result.valid).toBe(false)
  })

  it('should remove override tracking', async () => {
    await registry.initialize()

    registry.removeOverride('core.identity')

    expect(registry.hasUserOverride('core.identity')).toBe(false)
  })

  it('should handle missing index.yaml gracefully', async () => {
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'empty-reg-'))
    const emptyLoader = createMockLoader(emptyDir)
    const emptyRegistry = new PromptRegistry(emptyLoader)

    await expect(emptyRegistry.initialize()).resolves.toBeUndefined()

    await fs.rm(emptyDir, { recursive: true, force: true })
  })

  it('should refresh override for a prompt', async () => {
    await registry.initialize()

    vi.mocked(loader.load).mockResolvedValue({
      id: 'core.identity',
      version: '2.0.0',
      scope: 'core',
      body: 'Updated',
      source: 'user-override',
      path: '/user/core/identity.md',
      tokens: 30,
      rawFrontmatter: { id: 'core.identity', version: '2.0.0', scope: 'core' },
    })

    await registry.refreshOverride('core.identity')
    expect(registry.hasUserOverride('core.identity')).toBe(true)
  })
})
