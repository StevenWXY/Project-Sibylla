import { describe, it, expect, vi } from 'vitest'
import { ProactiveEngine } from '@main/services/proactive-engine/index'
import type { PatrolTrigger, PatrolResult } from '@main/services/proactive-engine/types'
import { TriggerRegistry } from '@main/services/proactive-engine/trigger-registry'
import { DEFAULT_PROACTIVE_CONFIG } from '@main/services/proactive-engine/constants'

function makePatrolTrigger(
  id: PatrolTrigger['id'],
  evaluateResult: PatrolResult | null,
): PatrolTrigger {
  return {
    id,
    description: `test patrol ${id}`,
    enabled: true,
    cooldownMs: 1000,
    evaluate: vi.fn().mockResolvedValue(evaluateResult),
  }
}

function makeEngine(): ProactiveEngine {
  const registry = new TriggerRegistry({
    onCooldownChange: async () => {},
    globalCooldownMinutes: 5,
  })

  const notificationStore = { create: vi.fn().mockReturnValue({ id: 'notif-1' }) }

  return new ProactiveEngine(
    {
      triggerRegistry: registry,
      interruptPolicy: { canInterrupt: () => ({ allowed: true }), updateConfig: vi.fn() } as never,
      subAgentExecutor: {} as never,
      subAgentRegistry: { get: vi.fn() } as never,
      eventBus: { emitEvent: vi.fn(), subscribe: vi.fn() } as never,
      tracer: null,
      triggerDeps: {
        searchEngine: { search: vi.fn().mockResolvedValue({ results: [] }) },
        memoryStore: { persistCooldown: vi.fn().mockResolvedValue(undefined) },
        fileStats: () => null,
        knownMemoryPatterns: [],
      },
      commandRegistry: { execute: vi.fn() } as never,
      sendToRenderer: vi.fn(),
      notificationEngine: { store: notificationStore },
    },
    DEFAULT_PROACTIVE_CONFIG,
  )
}

describe('ProactiveEngine patrol', () => {
  it('registerPatrolTrigger adds to patrol triggers', () => {
    const engine = makeEngine()
    const trigger = makePatrolTrigger('risk-task-delay', null)
    engine.registerPatrolTrigger(trigger)
    expect(trigger.evaluate).not.toHaveBeenCalled()
  })

  it('startPatrol sets running state', () => {
    const engine = makeEngine()
    vi.useFakeTimers()
    engine.startPatrol(60000)
    vi.useRealTimers()
  })

  it('stopPatrol clears running state', () => {
    const engine = makeEngine()
    vi.useFakeTimers()
    engine.startPatrol(60000)
    engine.stopPatrol()
    vi.useRealTimers()
  })

  it('evaluate result creates notification', async () => {
    const engine = makeEngine()
    const result: PatrolResult = {
      title: 'Test Alert',
      detail: 'Test detail',
      actions: [{ id: 'view', label: '查看' }],
      audience: ['admin'],
      priority: 'high',
      groupKey: 'test:123',
    }
    const trigger = makePatrolTrigger('risk-task-delay', result)
    engine.registerPatrolTrigger(trigger)
    await (engine as unknown as { _runPatrolCycle: () => Promise<void> })._runPatrolCycle()
    const store = (engine as unknown as { deps: { notificationEngine: { store: { create: ReturnType<typeof vi.fn> } } } }).deps.notificationEngine.store
    expect(store.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'system.suggestion',
        title: 'Test Alert',
      }),
    )
  })

  it('evaluate returning null does not create notification', async () => {
    const engine = makeEngine()
    const trigger = makePatrolTrigger('risk-task-delay', null)
    engine.registerPatrolTrigger(trigger)
    await (engine as unknown as { _runPatrolCycle: () => Promise<void> })._runPatrolCycle()
    const store = (engine as unknown as { deps: { notificationEngine: { store: { create: ReturnType<typeof vi.fn> } } } }).deps.notificationEngine.store
    expect(store.create).not.toHaveBeenCalled()
  })

  it('skips evaluate when on cooldown', async () => {
    const engine = makeEngine()
    const trigger = makePatrolTrigger('risk-task-delay', null)
    engine.registerPatrolTrigger(trigger)
    const registry = (engine as unknown as { deps: { triggerRegistry: TriggerRegistry } }).deps.triggerRegistry
    registry.markPatrolFired('risk-task-delay')
    registry.isPatrolOnCooldown('risk-task-delay')
    vi.spyOn(registry, 'isPatrolOnCooldown').mockReturnValue(true)
    await (engine as unknown as { _runPatrolCycle: () => Promise<void> })._runPatrolCycle()
    expect(trigger.evaluate).not.toHaveBeenCalled()
  })
})
