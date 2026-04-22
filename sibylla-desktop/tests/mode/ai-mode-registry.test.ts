import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AiModeRegistry } from '../../src/main/services/mode/ai-mode-registry'
import type { AiModeDefinition } from '../../src/main/services/mode/types'
import { EventEmitter } from 'events'

function createMockTracer() {
  const spans: Array<{
    name: string
    attrs: Record<string, unknown>
  }> = []

  return {
    isEnabled: vi.fn().mockReturnValue(true),
    withSpan: vi.fn(async (name: string, fn: (span: {
      setAttributes: (attrs: Record<string, unknown>) => void
    }) => Promise<void>, _opts?: unknown) => {
      const span = {
        setAttributes: (attrs: Record<string, unknown>) => {
          spans.push({ name, attrs })
        },
      }
      await fn(span)
    }),
    _spans: spans,
  }
}

function createMockConfigManager(customModes: AiModeDefinition[] = []) {
  return {
    get: vi.fn((_key: string, defaultValue: unknown) => {
      return defaultValue
    }).mockImplementation((_key: string, defaultValue: unknown) => {
      if (_key === 'aiModes.custom') return customModes
      return defaultValue
    }),
  }
}

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    setLevel: vi.fn(),
  }
}

describe('AiModeRegistry', () => {
  let registry: AiModeRegistry
  let mockTracer: ReturnType<typeof createMockTracer>
  let mockConfig: ReturnType<typeof createMockConfigManager>
  let mockLogger: ReturnType<typeof createMockLogger>
  let mockEventBus: EventEmitter

  beforeEach(async () => {
    mockTracer = createMockTracer()
    mockConfig = createMockConfigManager()
    mockLogger = createMockLogger()
    mockEventBus = new EventEmitter()

    registry = new AiModeRegistry(
      mockConfig as unknown as { get: <T>(k: string, d: T) => T },
      mockTracer as unknown as import('../../src/main/services/trace/tracer').Tracer,
      mockEventBus as unknown as import('../../src/main/services/event-bus').AppEventBus,
      mockLogger as unknown as import('../../src/main/utils/logger').logger,
    )
    await registry.initialize()
  })

  it('initializes with 5 builtin modes', () => {
    const all = registry.getAll()
    expect(all).toHaveLength(5)
    const ids = all.map(m => m.id)
    expect(ids).toContain('free')
    expect(ids).toContain('plan')
    expect(ids).toContain('analyze')
    expect(ids).toContain('review')
    expect(ids).toContain('write')
  })

  it('loads custom modes from config', async () => {
    const customMode: AiModeDefinition = {
      id: 'custom-test',
      label: 'Custom',
      icon: '🧪',
      color: '#ff0000',
      description: 'Test custom mode',
      systemPromptPrefix: 'Custom prompt',
      inputPlaceholder: 'Custom placeholder',
      builtin: false,
    }
    const configWithCustom = createMockConfigManager([customMode])
    const reg = new AiModeRegistry(
      configWithCustom as unknown as { get: <T>(k: string, d: T) => T },
      mockTracer as unknown as import('../../src/main/services/trace/tracer').Tracer,
      mockEventBus as unknown as import('../../src/main/services/event-bus').AppEventBus,
      mockLogger as unknown as import('../../src/main/utils/logger').logger,
    )
    await reg.initialize()
    expect(reg.getAll()).toHaveLength(6)
    expect(reg.get('custom-test')).toBeDefined()
  })

  it('skips custom mode on ID conflict and logs warning', async () => {
    const conflictMode: AiModeDefinition = {
      id: 'plan',
      label: 'Conflict',
      icon: '❌',
      color: '#000',
      description: 'conflict',
      systemPromptPrefix: 'conflict',
      inputPlaceholder: 'conflict',
      builtin: false,
    }
    const configWithConflict = createMockConfigManager([conflictMode])
    const reg = new AiModeRegistry(
      configWithConflict as unknown as { get: <T>(k: string, d: T) => T },
      mockTracer as unknown as import('../../src/main/services/trace/tracer').Tracer,
      mockEventBus as unknown as import('../../src/main/services/event-bus').AppEventBus,
      mockLogger as unknown as import('../../src/main/utils/logger').logger,
    )
    await reg.initialize()
    expect(reg.getAll()).toHaveLength(5)
    expect(mockLogger.warn).toHaveBeenCalledWith('aiMode.custom.conflict', { id: 'plan' })
  })

  it('get returns correct mode by id', () => {
    const plan = registry.get('plan')
    expect(plan).toBeDefined()
    expect(plan!.id).toBe('plan')
    expect(plan!.label).toBe('Plan')
  })

  it('get returns undefined for unknown id', () => {
    expect(registry.get('nonexistent')).toBeUndefined()
  })

  it('getActiveMode returns free by default', () => {
    const mode = registry.getActiveMode('conv-1')
    expect(mode.id).toBe('free')
  })

  it('getActiveMode falls back to free when mode ID not found', async () => {
    const bus = new EventEmitter()
    const reg = new AiModeRegistry(
      createMockConfigManager() as unknown as { get: <T>(k: string, d: T) => T },
      mockTracer as unknown as import('../../src/main/services/trace/tracer').Tracer,
      bus as unknown as import('../../src/main/services/event-bus').AppEventBus,
      mockLogger as unknown as import('../../src/main/utils/logger').logger,
    )
    await reg.initialize()

    const mode = reg.getActiveMode('conv-x')
    expect(mode.id).toBe('free')
  })

  it('switchMode updates active mode', async () => {
    await registry.switchMode('conv-1', 'analyze', 'user')
    const mode = registry.getActiveMode('conv-1')
    expect(mode.id).toBe('analyze')
  })

  it('switchMode creates trace span', async () => {
    await registry.switchMode('conv-1', 'plan', 'user')
    expect(mockTracer.withSpan).toHaveBeenCalledWith(
      'aiMode.switch',
      expect.any(Function),
      expect.objectContaining({ kind: 'user-action', conversationId: 'conv-1' }),
    )
  })

  it('switchMode emits aiMode:changed event', async () => {
    const handler = vi.fn()
    mockEventBus.on('aiMode:changed', handler)
    await registry.switchMode('conv-1', 'review', 'user')
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        to: 'review',
      }),
    )
  })

  it('switchMode falls back to free for unknown ID', async () => {
    await registry.switchMode('conv-1', 'nonexistent', 'user')
    const mode = registry.getActiveMode('conv-1')
    expect(mode.id).toBe('free')
    expect(mockLogger.warn).toHaveBeenCalledWith('aiMode.switch.not-found', { modeId: 'nonexistent' })
  })

  it('buildSystemPromptPrefix replaces variables', () => {
    const prefix = registry.buildSystemPromptPrefix('plan', { userGoal: 'Build a feature' })
    expect(prefix).toContain('Build a feature')
    expect(prefix).not.toContain('{{userGoal}}')
  })

  it('buildSystemPromptPrefix returns unchanged prefix without variables', () => {
    const prefix = registry.buildSystemPromptPrefix('free')
    expect(prefix).toContain('Sibylla')
  })

  it('evaluateModeOutput returns empty for mode without evaluator config', async () => {
    const result = await registry.evaluateModeOutput('free', 'content')
    expect(result.warnings).toHaveLength(0)
  })

  it('evaluateModeOutput calls AnalyzeModeEvaluator for analyze', async () => {
    const result = await registry.evaluateModeOutput('analyze', 'No dimensions here')
    expect(result.warnings.some(w => w.code === 'insufficient_dimensions')).toBe(true)
  })

  it('evaluateModeOutput returns empty for unknown mode', async () => {
    const result = await registry.evaluateModeOutput('unknown', 'content')
    expect(result.warnings).toHaveLength(0)
  })

  it('dispose clears active states', async () => {
    await registry.switchMode('conv-1', 'plan', 'user')
    registry.dispose()
    const mode = registry.getActiveMode('conv-1')
    expect(mode.id).toBe('free')
  })

  it('getActiveModeId returns free by default', () => {
    expect(registry.getActiveModeId('conv-1')).toBe('free')
  })

  it('getActiveModeId returns switched mode', async () => {
    await registry.switchMode('conv-1', 'write', 'user')
    expect(registry.getActiveModeId('conv-1')).toBe('write')
  })
})
