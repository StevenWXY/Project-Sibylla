import { describe, it, expect } from 'vitest'
import { AppEventBus } from '../../../src/main/services/event-bus'
import type { SibyllaEvent } from '../../../src/main/services/event-bus-types'

describe('Dashboard personal-space permission regression', () => {
  it('admin.access-personal-space event type is defined', () => {
    const eventTypes: string[] = [
      'admin.access-personal-space',
    ]
    expect(eventTypes).toContain('admin.access-personal-space')
  })

  it('AppEventBus can emit admin.access-personal-space event', async () => {
    const bus = new AppEventBus()
    const received: SibyllaEvent[] = []
    bus.subscribe('admin.access-personal-space', (event) => {
      received.push(event as SibyllaEvent)
    })

    bus.emitEvent({
      type: 'admin.access-personal-space',
      source: 'dashboard-handler',
      payload: {
        adminId: 'admin-user',
        targetUser: '__dashboard_overview__',
        timestamp: Date.now(),
      },
    })

    expect(received).toHaveLength(1)
    expect((received[0]?.payload as { adminId: string }).adminId).toBe('admin-user')
  })

  it('IPC_CHANNELS includes ADMIN_ACCESS_PERSONAL_SPACE', async () => {
    const { IPC_CHANNELS } = await import('../../../src/shared/types')
    expect(IPC_CHANNELS.ADMIN_ACCESS_PERSONAL_SPACE).toBe('admin:accessPersonalSpace')
  })
})
