import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HookExecutor } from '../../src/main/services/hooks/HookExecutor'
import { HookRegistry } from '../../src/main/services/hooks/HookRegistry'
import type { Hook, HookContext, HookResult } from '../../src/main/services/hooks/types'

function createMockHook(
  id: string,
  priority: number,
  executeResult: HookResult | (() => Promise<HookResult>),
): Hook {
  return {
    metadata: {
      id,
      version: '1.0.0',
      name: id,
      description: `Test hook ${id}`,
      nodes: ['PreToolUse'],
      priority,
      source: 'builtin',
      enabled: true,
    },
    execute: typeof executeResult === 'function'
      ? executeResult
      : vi.fn(async () => executeResult),
  }
}

function createCtx(): HookContext {
  return {
    node: 'PreToolUse',
    trigger: { tool: { name: 'test-tool', input: {} } },
    conversationId: 'conv-1',
    workspacePath: '/workspace',
  }
}

describe('HookExecutor', () => {
  let registry: HookRegistry
  let executor: HookExecutor

  beforeEach(() => {
    const configStore = { get: vi.fn(() => undefined), set: vi.fn() }
    registry = new HookRegistry(null, configStore)
    executor = new HookExecutor(registry)
  })

  it('should execute hooks in priority descending order', async () => {
    const order: string[] = []

    const hook1 = createMockHook('low', 100, async () => { order.push('low'); return { decision: 'allow' } })
    const hook2 = createMockHook('high', 1000, async () => { order.push('high'); return { decision: 'allow' } })

    registry.register(hook1)
    registry.register(hook2)

    await executor.executeNode('PreToolUse', createCtx())

    expect(order).toEqual(['high', 'low'])
  })

  it('should stop executing on block decision', async () => {
    const order: string[] = []

    const hook1 = createMockHook('blocker', 1000, async () => { order.push('blocker'); return { decision: 'block', reason: 'test' } })
    const hook2 = createMockHook('after', 500, async () => { order.push('after'); return { decision: 'allow' } })

    registry.register(hook1)
    registry.register(hook2)

    const results = await executor.executeNode('PreToolUse', createCtx())

    expect(order).toEqual(['blocker'])
    expect(results).toHaveLength(1)
    expect(results[0].decision).toBe('block')
  })

  it('should fail-open on hook timeout', async () => {
    const slowHook: Hook = {
      metadata: {
        id: 'slow',
        version: '1.0.0',
        name: 'slow',
        description: '',
        nodes: ['PreToolUse'],
        priority: 100,
        source: 'builtin',
        enabled: true,
      },
      execute: () => new Promise<HookResult>((_resolve) => {
        // Never resolves — will timeout
      }),
    }

    registry.register(slowHook)

    const executorShortTimeout = new HookExecutor(registry)
    const results = await executorShortTimeout.executeNode('PreToolUse', createCtx())

    expect(results).toHaveLength(1)
    expect(results[0].decision).toBe('allow')
    expect(results[0].reason).toBe('hook-error-fail-open')
  }, 10000)

  it('should fail-open on hook exception', async () => {
    const throwingHook = createMockHook('thrower', 100, async () => {
      throw new Error('Hook crashed')
    })

    registry.register(throwingHook)

    const results = await executor.executeNode('PreToolUse', createCtx())

    expect(results).toHaveLength(1)
    expect(results[0].decision).toBe('allow')
    expect(results[0].reason).toBe('hook-error-fail-open')
  })

  it('should return empty results for node with no hooks', async () => {
    const results = await executor.executeNode('PreCompaction', createCtx())
    expect(results).toHaveLength(0)
  })

  it('should return all results from multiple hooks', async () => {
    const hook1 = createMockHook('h1', 100, { decision: 'allow' })
    const hook2 = createMockHook('h2', 200, { decision: 'warn', message: 'warning' })

    registry.register(hook1)
    registry.register(hook2)

    const results = await executor.executeNode('PreToolUse', createCtx())

    expect(results).toHaveLength(2)
    expect(results[0].decision).toBe('warn')
    expect(results[1].decision).toBe('allow')
  })
})
