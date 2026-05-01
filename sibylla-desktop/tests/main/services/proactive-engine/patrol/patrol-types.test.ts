import { describe, it, expect } from 'vitest'
import type {
  PatrolTriggerId,
  PatrolTrigger,
  PatrolResult,
} from '@main/services/proactive-engine/types'
import type { NotificationPriority } from '@main/services/notifications/types'

describe('PatrolTrigger types', () => {
  it('PatrolTriggerId accepts valid values', () => {
    const ids: PatrolTriggerId[] = [
      'risk-task-delay',
      'workload-imbalance',
      'decision-contradiction',
    ]
    expect(ids).toHaveLength(3)
  })

  it('PatrolTrigger interface compiles', () => {
    const trigger: PatrolTrigger = {
      id: 'risk-task-delay',
      description: 'Test trigger',
      enabled: true,
      cooldownMs: 1000,
      evaluate: async () => null,
    }
    expect(trigger.id).toBe('risk-task-delay')
  })

  it('PatrolResult interface compiles', () => {
    const result: PatrolResult = {
      title: 'Test',
      detail: 'Detail',
      actions: [{ id: 'view', label: '查看' }],
      audience: ['admin'],
      priority: 'high',
      groupKey: 'test:1',
    }
    expect(result.title).toBe('Test')
  })

  it('NotificationPriority accepts valid values', () => {
    const priorities: NotificationPriority[] = ['urgent', 'high', 'normal', 'low']
    expect(priorities).toHaveLength(4)
  })
})
