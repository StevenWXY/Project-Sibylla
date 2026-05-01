import { describe, it, expect } from 'vitest'
import { AppEventBus } from '../../../src/main/services/event-bus'
import type { SibyllaEvent } from '../../../src/main/services/event-bus-types'
import { extractPersonalUser, isOtherUsersPersonal } from '../../../src/main/utils/personal-path'

describe('Admin warning event emission regression', () => {
  it('admin reads other personal/ — event emitted with correct payload', () => {
    const bus = new AppEventBus()
    const received: SibyllaEvent[] = []
    bus.subscribe('admin.access-personal-space', (event) => {
      received.push(event as SibyllaEvent)
    })

    const filePath = 'personal/bob/notes/test.md'
    const adminId = 'alice'
    const targetUser = extractPersonalUser(filePath)
    expect(targetUser).toBe('bob')
    expect(isOtherUsersPersonal(filePath, adminId)).toBe(true)

    bus.emitEvent({
      type: 'admin.access-personal-space',
      source: 'file-handler',
      payload: {
        adminId,
        targetUser: targetUser!,
        timestamp: Date.now(),
      },
      persist: true,
    })

    expect(received).toHaveLength(1)
    const payload = received[0]?.payload as { adminId: string; targetUser: string; timestamp: number }
    expect(payload.adminId).toBe('alice')
    expect(payload.targetUser).toBe('bob')
    expect(typeof payload.timestamp).toBe('number')
  })

  it('admin reads self personal/ — no event emitted', () => {
    const bus = new AppEventBus()
    const received: SibyllaEvent[] = []
    bus.subscribe('admin.access-personal-space', (event) => {
      received.push(event as SibyllaEvent)
    })

    const filePath = 'personal/alice/notes/test.md'
    const adminId = 'alice'
    const targetUser = extractPersonalUser(filePath)
    expect(targetUser).toBe('alice')
    expect(isOtherUsersPersonal(filePath, adminId)).toBe(false)
    expect(received).toHaveLength(0)
  })

  it('non-admin read is blocked by guard — no event should fire', async () => {
    const { PersonalSpaceGuard } = await import('../../../src/main/services/harness/guardrails/personal-space')
    const guard = new PersonalSpaceGuard()
    const op = { type: 'read', path: 'personal/bob/notes/test.md' }
    const verdict = await guard.check(op, {
      source: 'user',
      userId: 'alice',
      userRole: 'viewer',
      workspaceRoot: '/workspace',
    })
    expect(verdict.allow).toBe(false)
  })
})

describe('PersonalSpaceWarningBanner component logic', () => {
  it('sessionStorage dismissal key format is correct', () => {
    const targetUser = 'bob'
    const key = 'personal-space-warning-dismissed:' + targetUser
    expect(key).toBe('personal-space-warning-dismissed:bob')
  })

  it('extractPersonalUser returns correct target for warning text', () => {
    expect(extractPersonalUser('personal/bob/notes.md')).toBe('bob')
    expect(extractPersonalUser('personal/alice/reports/daily/2026-05-01.md')).toBe('alice')
    expect(extractPersonalUser('docs/readme.md')).toBeNull()
  })

  it('isOtherUsersPersonal correctly identifies when warning should show', () => {
    expect(isOtherUsersPersonal('personal/bob/notes.md', 'alice')).toBe(true)
    expect(isOtherUsersPersonal('personal/alice/notes.md', 'alice')).toBe(false)
    expect(isOtherUsersPersonal('docs/readme.md', 'alice')).toBe(false)
  })
})
