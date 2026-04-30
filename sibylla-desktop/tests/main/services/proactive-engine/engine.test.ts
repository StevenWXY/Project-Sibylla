import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProactiveEngine } from '@main/services/proactive-engine/index'
import { TriggerRegistry } from '@main/services/proactive-engine/trigger-registry'
import { InterruptPolicy } from '@main/services/proactive-engine/interrupt-policy'
import { DEFAULT_PROACTIVE_CONFIG } from '@main/services/proactive-engine/constants'
import type { EditorSnapshot, TriggerDeps } from '@main/services/proactive-engine/types'

function makeSnapshot(overrides: Partial<EditorSnapshot> = {}): EditorSnapshot {
  return {
    filePath: '/plans/roadmap-plan.md',
    contentSummary: {
      length: 300,
      recentText: '这是我们的目标，需要完成这个需求并且拆解任务',
    },
    typingVelocity: 20,
    continuousTypingMinutes: 1,
    cursorPosition: 100,
    selectionLength: 0,
    lastInteractionAt: Date.now(),
    currentAiMode: 'write',
    isFocused: false,
    ...overrides,
  }
}

function makeEngine(overrides: { runResult?: unknown; runError?: boolean } = {}) {
  const sendToRenderer = vi.fn()
  const onCooldownChange = vi.fn()

  const triggerRegistry = new TriggerRegistry({ onCooldownChange, globalCooldownMinutes: 5 })
  const interruptPolicy = new InterruptPolicy(DEFAULT_PROACTIVE_CONFIG)

  const subAgentExecutor = {
    run: overrides.runError
      ? vi.fn().mockRejectedValue(new Error('timeout'))
      : vi.fn().mockResolvedValue(
          overrides.runResult ?? {
            success: true,
            structuredOutput: {
              title: '想要拆解任务吗？',
              body: '检测到您写了目标但没有任务清单',
              acceptAction: { command: 'ai.extractTasks', args: {} },
              declineAction: 'dismiss',
            },
            summary: '',
            turnsUsed: 1,
            tokensUsed: 100,
            traceId: '',
            errors: [],
          },
        ),
  }

  const subAgentRegistry = {
    get: vi.fn().mockReturnValue({
      id: 'suggestion-curator',
      allowedTools: ['reference_file', 'unified_search'],
    }),
  }

  const mockTriggerDeps: TriggerDeps = {
    searchEngine: { search: async () => ({ results: [] }) },
    memoryStore: { persistCooldown: async () => {} },
    fileStats: () => ({ updatedAt: Date.now() - 45 * 24 * 60 * 60 * 1000, size: 1024 }),
    knownMemoryPatterns: [],
  }

  const eventBus = {
    subscribe: vi.fn().mockReturnValue(vi.fn()),
  }

  const commandRegistry = { execute: vi.fn() }

  const engine = new ProactiveEngine(
    {
      triggerRegistry,
      interruptPolicy,
      subAgentExecutor: subAgentExecutor as unknown as ProactiveEngine['_deps']['subAgentExecutor'],
      subAgentRegistry: subAgentRegistry as unknown as ProactiveEngine['_deps']['subAgentRegistry'],
      eventBus: eventBus as unknown as ProactiveEngine['_deps']['eventBus'],
      tracer: null,
      triggerDeps: mockTriggerDeps,
      commandRegistry,
      sendToRenderer,
    },
    DEFAULT_PROACTIVE_CONFIG,
  )

  return {
    engine,
    sendToRenderer,
    subAgentExecutor,
    subAgentRegistry,
    eventBus,
    commandRegistry,
    triggerRegistry,
  }
}

describe('ProactiveEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('does not evaluate when disabled', async () => {
    const { engine, sendToRenderer, subAgentExecutor } = makeEngine()
    engine.updateConfig({ enabled: false })
    engine.initialize()
    engine.onSnapshot(makeSnapshot())
    await vi.advanceTimersByTimeAsync(100)
    expect(subAgentExecutor.run).not.toHaveBeenCalled()
    expect(sendToRenderer).not.toHaveBeenCalled()
  })

  it('does not call sub-agent when no triggers match', async () => {
    const { engine, sendToRenderer, subAgentExecutor } = makeEngine()
    engine.initialize()
    engine.onSnapshot(
      makeSnapshot({
        filePath: '/notes/daily.md',
        contentSummary: { length: 10, recentText: 'hi' },
      }),
    )
    await vi.advanceTimersByTimeAsync(100)
    expect(subAgentExecutor.run).not.toHaveBeenCalled()
  })

  it('dispatches suggestion when trigger matches and canInterrupt passes', async () => {
    const { engine, sendToRenderer, subAgentExecutor } = makeEngine()
    engine.initialize()
    engine.onSnapshot(makeSnapshot())
    await vi.advanceTimersByTimeAsync(100)
    expect(subAgentExecutor.run).toHaveBeenCalledTimes(1)
    expect(sendToRenderer).toHaveBeenCalledTimes(1)
    expect(sendToRenderer).toHaveBeenCalledWith(
      'proactive:suggestionShown',
      expect.objectContaining({ triggerId: 'task-decomposition' }),
    )
  })

  it('silently discards when sub-agent fails', async () => {
    const { engine, sendToRenderer } = makeEngine({ runError: true })
    engine.initialize()
    engine.onSnapshot(makeSnapshot())
    await vi.advanceTimersByTimeAsync(100)
    expect(sendToRenderer).not.toHaveBeenCalled()
  })

  it('records accepted outcome', async () => {
    const { engine, sendToRenderer, commandRegistry } = makeEngine()
    engine.initialize()
    engine.onSnapshot(makeSnapshot())
    await vi.advanceTimersByTimeAsync(100)
    expect(sendToRenderer).toHaveBeenCalledTimes(1)
    const suggestion = sendToRenderer.mock.calls[0]![1] as { id: string }
    engine.recordSuggestionOutcome(suggestion.id, 'accepted', 5000)
    expect(commandRegistry.execute).not.toHaveBeenCalled()
  })

  it('records dismissed outcome', async () => {
    const { engine, sendToRenderer } = makeEngine()
    engine.initialize()
    engine.onSnapshot(makeSnapshot())
    await vi.advanceTimersByTimeAsync(100)
    const suggestion = sendToRenderer.mock.calls[0]![1] as { id: string }
    engine.recordSuggestionOutcome(suggestion.id, 'dismissed', 2000)
  })

  it('does nothing for unknown suggestion id outcome', async () => {
    const { engine, sendToRenderer } = makeEngine()
    engine.initialize()
    engine.recordSuggestionOutcome('unknown-id', 'accepted', 1000)
    expect(sendToRenderer).not.toHaveBeenCalled()
  })

  it('sets fullscreen state', () => {
    const { engine } = makeEngine()
    engine.setFullscreen(true)
    engine.setFullscreen(false)
  })

  it('shutdown cleans up', () => {
    const { engine, eventBus } = makeEngine()
    engine.initialize()
    engine.shutdown()
    expect(eventBus.subscribe).toHaveBeenCalledTimes(3)
  })

  it('does not call sub-agent when agent not found', async () => {
    const { engine, sendToRenderer, subAgentRegistry } = makeEngine()
    subAgentRegistry.get.mockReturnValue(undefined)
    engine.initialize()
    engine.onSnapshot(makeSnapshot())
    await vi.advanceTimersByTimeAsync(100)
    expect(sendToRenderer).not.toHaveBeenCalled()
  })
})
