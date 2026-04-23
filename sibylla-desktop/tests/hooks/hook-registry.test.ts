import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HookRegistry } from '../../src/main/services/hooks/HookRegistry'
import type { Hook, HookContext, HookMetadata, HookResult } from '../../src/main/services/hooks/types'

function createMockHook(id: string, nodes: Array<'PreToolUse' | 'PostToolUse' | 'PreUserMessage'>, priority: number): Hook {
  return {
    metadata: {
      id,
      version: '1.0.0',
      name: id,
      description: `Test hook ${id}`,
      nodes,
      priority,
      source: 'builtin',
      enabled: true,
    },
    execute: vi.fn(async (): Promise<HookResult> => ({ decision: 'allow' })),
  }
}

describe('HookRegistry', () => {
  let registry: HookRegistry
  let configStore: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    configStore = {
      get: vi.fn(() => undefined),
      set: vi.fn(),
    }
    registry = new HookRegistry(null, configStore)
  })

  it('should register hooks and retrieve by node', () => {
    const hook1 = createMockHook('h1', ['PreToolUse'], 100)
    const hook2 = createMockHook('h2', ['PreToolUse'], 200)
    const hook3 = createMockHook('h3', ['PostToolUse'], 100)

    registry.register(hook1)
    registry.register(hook2)
    registry.register(hook3)

    const preToolHooks = registry.getByNode('PreToolUse')
    expect(preToolHooks).toHaveLength(2)
    expect(preToolHooks[0].metadata.id).toBe('h2')
    expect(preToolHooks[1].metadata.id).toBe('h1')
  })

  it('should return hooks sorted by priority descending', () => {
    const hook1 = createMockHook('low', ['PreToolUse'], 100)
    const hook2 = createMockHook('mid', ['PreToolUse'], 500)
    const hook3 = createMockHook('high', ['PreToolUse'], 1000)

    registry.register(hook1)
    registry.register(hook2)
    registry.register(hook3)

    const hooks = registry.getByNode('PreToolUse')
    expect(hooks.map(h => h.metadata.id)).toEqual(['high', 'mid', 'low'])
  })

  it('should filter disabled hooks from getByNode', () => {
    const hook1 = createMockHook('h1', ['PreToolUse'], 100)
    const hook2 = createMockHook('h2', ['PreToolUse'], 200)

    registry.register(hook1)
    registry.register(hook2)
    registry.disable('h1')

    const hooks = registry.getByNode('PreToolUse')
    expect(hooks).toHaveLength(1)
    expect(hooks[0].metadata.id).toBe('h2')
  })

  it('should getAll return all hook metadata', () => {
    const hook1 = createMockHook('h1', ['PreToolUse'], 100)
    const hook2 = createMockHook('h2', ['PostToolUse'], 200)

    registry.register(hook1)
    registry.register(hook2)

    const all = registry.getAll()
    expect(all).toHaveLength(2)
    expect(all.map(m => m.id).sort()).toEqual(['h1', 'h2'])
  })

  it('should persist disabled hooks to configStore', () => {
    const hook = createMockHook('h1', ['PreToolUse'], 100)
    registry.register(hook)

    registry.disable('h1')
    expect(configStore.set).toHaveBeenCalledWith('hooks.disabled', ['h1'])
  })

  it('should load disabled hooks from configStore on initialize', async () => {
    configStore.get = vi.fn(() => ['h1'])

    const hook1 = createMockHook('h1', ['PreToolUse'], 100)
    const hook2 = createMockHook('h2', ['PreToolUse'], 200)

    await registry.initialize([hook1, hook2])

    expect(registry.isEnabled('h1')).toBe(false)
    expect(registry.isEnabled('h2')).toBe(true)
  })

  it('should re-enable disabled hooks', () => {
    const hook = createMockHook('h1', ['PreToolUse'], 100)
    registry.register(hook)

    registry.disable('h1')
    expect(registry.isEnabled('h1')).toBe(false)

    registry.enable('h1')
    expect(registry.isEnabled('h1')).toBe(true)
  })

  it('should get hook by id', () => {
    const hook = createMockHook('h1', ['PreToolUse'], 100)
    registry.register(hook)

    expect(registry.get('h1')).toBe(hook)
    expect(registry.get('nonexistent')).toBeUndefined()
  })
})
