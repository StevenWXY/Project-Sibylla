import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GuardrailHook } from '../../src/main/services/hooks/built-in/guardrail-hook'
import type { HookContext } from '../../src/main/services/hooks/types'
import type { GuardrailEngine } from '../../src/main/services/harness/guardrails/engine'

function createMockGuardrailEngine(allowResult: boolean = true): GuardrailEngine {
  return {
    check: vi.fn(async () => allowResult ? { allow: true } as const : { allow: false, ruleId: 'test', reason: 'blocked', severity: 'block' } as const),
    listRules: vi.fn(),
    setRuleEnabled: vi.fn(),
    setTracer: vi.fn(),
  } as unknown as GuardrailEngine
}

function createCtx(overrides?: Partial<HookContext>): HookContext {
  return {
    node: 'PreToolUse',
    trigger: {
      tool: { name: 'write-file', input: { path: 'test.md', content: 'hello' } },
    },
    conversationId: 'conv-1',
    workspacePath: '/workspace',
    ...overrides,
  }
}

describe('GuardrailHook', () => {
  let engine: ReturnType<typeof createMockGuardrailEngine>
  let hook: GuardrailHook

  beforeEach(() => {
    engine = createMockGuardrailEngine()
    hook = new GuardrailHook(engine)
  })

  it('should have correct metadata', () => {
    expect(hook.metadata.id).toBe('builtin.guardrail')
    expect(hook.metadata.nodes).toEqual(['PreToolUse'])
    expect(hook.metadata.priority).toBe(1000)
    expect(hook.metadata.source).toBe('builtin')
  })

  it('should delegate to GuardrailEngine.check', async () => {
    const result = await hook.execute(createCtx())
    expect(result.decision).toBe('allow')
    expect(engine.check).toHaveBeenCalledOnce()
  })

  it('should return allow when no tool in context', async () => {
    const result = await hook.execute({
      node: 'PreToolUse',
      trigger: {},
      conversationId: 'conv-1',
      workspacePath: '/workspace',
    })
    expect(result.decision).toBe('allow')
    expect(engine.check).not.toHaveBeenCalled()
  })

  it('should return block when engine blocks', async () => {
    const blockEngine = createMockGuardrailEngine(false)
    const blockHook = new GuardrailHook(blockEngine)

    const result = await blockHook.execute(createCtx())
    expect(result.decision).toBe('block')
  })
})
