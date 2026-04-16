import { describe, expect, it, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePermission } from '../../src/renderer/hooks/usePermission'
import { useMembersStore } from '../../src/renderer/store/membersStore'
import { useAppStore } from '../../src/renderer/store/appStore'
import type { WorkspaceMember } from '../../src/shared/types'

const MOCK_MEMBERS: WorkspaceMember[] = [
  { id: 'user-1', name: 'Admin', email: 'admin@example.com', role: 'admin', joinedAt: '2026-01-01T00:00:00Z' },
  { id: 'user-2', name: 'Editor', email: 'editor@example.com', role: 'editor', joinedAt: '2026-01-01T00:00:00Z' },
  { id: 'user-3', name: 'Viewer', email: 'viewer@example.com', role: 'viewer', joinedAt: '2026-01-01T00:00:00Z' },
]

describe('usePermission', () => {
  beforeEach(() => {
    useMembersStore.getState().reset()
    useAppStore.getState().clearAuth()
    vi.clearAllMocks()
  })

  it('returns all true for admin', () => {
    useAppStore.getState().setAuthenticated(true, { id: 'user-1', email: 'admin@example.com', name: 'Admin' })
    useMembersStore.setState({ members: MOCK_MEMBERS })

    const { result } = renderHook(() => usePermission())
    const perm = result.current
    expect(perm.canEdit).toBe(true)
    expect(perm.canCreate).toBe(true)
    expect(perm.canDelete).toBe(true)
    expect(perm.canComment).toBe(true)
    expect(perm.canManageMembers).toBe(true)
    expect(perm.canManageSettings).toBe(true)
  })

  it('returns correct permissions for editor', () => {
    useAppStore.getState().setAuthenticated(true, { id: 'user-2', email: 'editor@example.com', name: 'Editor' })
    useMembersStore.setState({ members: MOCK_MEMBERS })

    const { result } = renderHook(() => usePermission())
    const perm = result.current
    expect(perm.canEdit).toBe(true)
    expect(perm.canCreate).toBe(true)
    expect(perm.canDelete).toBe(true)
    expect(perm.canComment).toBe(true)
    expect(perm.canManageMembers).toBe(false)
    expect(perm.canManageSettings).toBe(false)
  })

  it('returns correct permissions for viewer', () => {
    useAppStore.getState().setAuthenticated(true, { id: 'user-3', email: 'viewer@example.com', name: 'Viewer' })
    useMembersStore.setState({ members: MOCK_MEMBERS })

    const { result } = renderHook(() => usePermission())
    const perm = result.current
    expect(perm.canEdit).toBe(false)
    expect(perm.canCreate).toBe(false)
    expect(perm.canDelete).toBe(false)
    expect(perm.canComment).toBe(true)
    expect(perm.canManageMembers).toBe(false)
    expect(perm.canManageSettings).toBe(false)
  })

  it('returns viewer permissions when not logged in', () => {
    const { result } = renderHook(() => usePermission())
    const perm = result.current
    expect(perm.canEdit).toBe(false)
    expect(perm.canCreate).toBe(false)
    expect(perm.canManageMembers).toBe(false)
  })
})
