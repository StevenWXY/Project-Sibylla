import { describe, it, expect, vi } from 'vitest'
import { TriggerRegistry } from '@main/services/proactive-engine/trigger-registry'

describe('Patrol cooldown', () => {
  function makeRegistry(): TriggerRegistry {
    return new TriggerRegistry({
      onCooldownChange: async () => {},
      globalCooldownMinutes: 5,
    })
  }

  it('initial state not in cooldown', () => {
    const registry = makeRegistry()
    registry.registerPatrol({ id: 'risk-task-delay', cooldownMs: 4 * 60 * 60 * 1000 })
    expect(registry.isPatrolOnCooldown('risk-task-delay')).toBe(false)
  })

  it('in cooldown after markPatrolFired', () => {
    const registry = makeRegistry()
    registry.registerPatrol({ id: 'risk-task-delay', cooldownMs: 4 * 60 * 60 * 1000 })
    registry.markPatrolFired('risk-task-delay')
    expect(registry.isPatrolOnCooldown('risk-task-delay')).toBe(true)
  })

  it('cooldown expires after duration passes', () => {
    const registry = makeRegistry()
    registry.registerPatrol({ id: 'risk-task-delay', cooldownMs: 100 })
    registry.markPatrolFired('risk-task-delay')
    expect(registry.isPatrolOnCooldown('risk-task-delay')).toBe(true)

    vi.useFakeTimers()
    vi.advanceTimersByTime(101)
    expect(registry.isPatrolOnCooldown('risk-task-delay')).toBe(false)
    vi.useRealTimers()
  })

  it('3x dismiss doubles cooldown', () => {
    const registry = makeRegistry()
    registry.registerPatrol({ id: 'risk-task-delay', cooldownMs: 4 * 60 * 60 * 1000 })
    const initialMs = registry.getPatrolCooldownMs('risk-task-delay')
    registry.recordPatrolDismiss('risk-task-delay')
    registry.recordPatrolDismiss('risk-task-delay')
    registry.recordPatrolDismiss('risk-task-delay')
    const newMs = registry.getPatrolCooldownMs('risk-task-delay')
    expect(newMs).toBe(initialMs * 2)
  })

  it('3x accept halves cooldown', () => {
    const registry = makeRegistry()
    registry.registerPatrol({ id: 'workload-imbalance', cooldownMs: 8 * 60 * 60 * 1000 })
    const initialMs = registry.getPatrolCooldownMs('workload-imbalance')
    registry.recordPatrolAccept('workload-imbalance')
    registry.recordPatrolAccept('workload-imbalance')
    registry.recordPatrolAccept('workload-imbalance')
    const newMs = registry.getPatrolCooldownMs('workload-imbalance')
    expect(newMs).toBe(Math.floor(initialMs / 2))
  })

  it('halved cooldown does not go below 50% of original', () => {
    const registry = makeRegistry()
    const originalMs = 4 * 60 * 60 * 1000
    registry.registerPatrol({ id: 'decision-contradiction', cooldownMs: originalMs })
    registry.recordPatrolAccept('decision-contradiction')
    registry.recordPatrolAccept('decision-contradiction')
    registry.recordPatrolAccept('decision-contradiction')
    const firstHalf = registry.getPatrolCooldownMs('decision-contradiction')
    registry.recordPatrolAccept('decision-contradiction')
    registry.recordPatrolAccept('decision-contradiction')
    registry.recordPatrolAccept('decision-contradiction')
    const secondHalf = registry.getPatrolCooldownMs('decision-contradiction')
    const minAllowed = (originalMs / 60000) * 0.5 * 60 * 1000
    expect(secondHalf).toBeGreaterThanOrEqual(Math.floor(minAllowed))
  })
})
