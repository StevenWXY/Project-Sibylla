import { describe, it, expect, vi } from 'vitest'
import { TriggerRegistry } from '@main/services/proactive-engine/trigger-registry'
import type { Trigger, TriggerDeps, EditorSnapshot } from '@main/services/proactive-engine/types'
import { DEFAULT_TRIGGER_COOLDOWNS } from '@main/services/proactive-engine/constants'

function makeTrigger(id: Trigger['id'] = 'task-decomposition'): Trigger {
  return {
    id,
    description: `test trigger ${id}`,
    enabled: true,
    defaultCooldownMinutes: DEFAULT_TRIGGER_COOLDOWNS[id] ?? 30,
    condition: () => true,
    buildDraft: () => null,
  }
}

function makeSnapshot(): EditorSnapshot {
  return {
    filePath: '/test.md',
    contentSummary: { length: 100, recentText: 'test' },
    typingVelocity: 20,
    continuousTypingMinutes: 1,
    cursorPosition: 10,
    selectionLength: 0,
    lastInteractionAt: Date.now(),
    currentAiMode: 'write',
    isFocused: false,
  }
}

describe('TriggerRegistry', () => {
  it('new trigger is not in cooldown', () => {
    const onCooldownChange = vi.fn()
    const registry = new TriggerRegistry({ onCooldownChange, globalCooldownMinutes: 5 })
    registry.register(makeTrigger('task-decomposition'))
    expect(registry.isInCooldown('task-decomposition')).toBe(false)
  })

  it('isInCooldown=true after markFired', () => {
    const onCooldownChange = vi.fn()
    const registry = new TriggerRegistry({ onCooldownChange, globalCooldownMinutes: 5 })
    registry.register(makeTrigger('task-decomposition'))
    registry.markFired('task-decomposition')
    expect(registry.isInCooldown('task-decomposition')).toBe(true)
  })

  it('isInCooldown=false after cooldown expires', () => {
    const onCooldownChange = vi.fn()
    const registry = new TriggerRegistry({ onCooldownChange, globalCooldownMinutes: 5 })
    registry.register(makeTrigger('task-decomposition'))
    registry.markFired('task-decomposition')
    expect(registry.isInCooldown('task-decomposition')).toBe(true)
  })

  it('isGlobalCooldown=true within 5 minutes', () => {
    const onCooldownChange = vi.fn()
    const registry = new TriggerRegistry({ onCooldownChange, globalCooldownMinutes: 5 })
    registry.register(makeTrigger('task-decomposition'))
    registry.markFired('task-decomposition')
    expect(registry.isGlobalCooldown()).toBe(true)
  })

  it('isGlobalCooldown=false when never fired', () => {
    const onCooldownChange = vi.fn()
    const registry = new TriggerRegistry({ onCooldownChange, globalCooldownMinutes: 5 })
    expect(registry.isGlobalCooldown()).toBe(false)
  })

  it('doubles cooldown after 3 dismisses', () => {
    const onCooldownChange = vi.fn()
    const registry = new TriggerRegistry({ onCooldownChange, globalCooldownMinutes: 5 })
    registry.register(makeTrigger('memory-promote'))
    const initialMinutes = registry.getCooldownMinutes('memory-promote')
    expect(initialMinutes).toBe(60)

    registry.recordDismiss('memory-promote')
    registry.recordDismiss('memory-promote')
    registry.recordDismiss('memory-promote')

    expect(registry.getCooldownMinutes('memory-promote')).toBe(120)
    expect(onCooldownChange).toHaveBeenCalledWith('memory-promote', 120)
  })

  it('does not exceed max cooldown 1440 minutes', () => {
    const onCooldownChange = vi.fn()
    const registry = new TriggerRegistry({ onCooldownChange, globalCooldownMinutes: 5 })
    registry.register(makeTrigger('memory-promote'))

    for (let i = 0; i < 10; i++) {
      registry.recordDismiss('memory-promote')
      registry.recordDismiss('memory-promote')
      registry.recordDismiss('memory-promote')
    }

    expect(registry.getCooldownMinutes('memory-promote')).toBeLessThanOrEqual(1440)
  })

  it('halves cooldown after 3 accepts', () => {
    const onCooldownChange = vi.fn()
    const registry = new TriggerRegistry({ onCooldownChange, globalCooldownMinutes: 5 })
    registry.register(makeTrigger('task-decomposition'))
    const initialMinutes = registry.getCooldownMinutes('task-decomposition')
    expect(initialMinutes).toBe(30)

    registry.recordAccept('task-decomposition')
    registry.recordAccept('task-decomposition')
    registry.recordAccept('task-decomposition')

    expect(registry.getCooldownMinutes('task-decomposition')).toBe(15)
    expect(onCooldownChange).toHaveBeenCalledWith('task-decomposition', 15)
  })

  it('does not go below min cooldown 5 minutes', () => {
    const onCooldownChange = vi.fn()
    const registry = new TriggerRegistry({ onCooldownChange, globalCooldownMinutes: 5 })
    registry.register(makeTrigger('task-decomposition'))

    for (let i = 0; i < 10; i++) {
      registry.recordAccept('task-decomposition')
      registry.recordAccept('task-decomposition')
      registry.recordAccept('task-decomposition')
    }

    expect(registry.getCooldownMinutes('task-decomposition')).toBeGreaterThanOrEqual(5)
  })

  it('restoreCooldowns correctly restores', () => {
    const onCooldownChange = vi.fn()
    const registry = new TriggerRegistry({ onCooldownChange, globalCooldownMinutes: 5 })
    registry.register(makeTrigger('task-decomposition'))
    registry.register(makeTrigger('memory-promote'))

    registry.restoreCooldowns({
      'task-decomposition': 120,
      'memory-promote': 480,
    })

    expect(registry.getCooldownMinutes('task-decomposition')).toBe(120)
    expect(registry.getCooldownMinutes('memory-promote')).toBe(480)
  })

  it('calls onCooldownChange callback', async () => {
    const onCooldownChange = vi.fn()
    const registry = new TriggerRegistry({ onCooldownChange, globalCooldownMinutes: 5 })
    registry.register(makeTrigger('task-decomposition'))

    registry.recordDismiss('task-decomposition')
    registry.recordDismiss('task-decomposition')
    registry.recordDismiss('task-decomposition')

    expect(onCooldownChange).toHaveBeenCalledTimes(1)
    expect(onCooldownChange).toHaveBeenCalledWith('task-decomposition', 60)
  })
})
