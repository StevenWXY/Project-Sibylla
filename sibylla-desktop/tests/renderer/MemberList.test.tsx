import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemberList } from '../../src/renderer/components/settings/MemberList'
import { useMembersStore } from '../../src/renderer/store/membersStore'
import { useAppStore } from '../../src/renderer/store/appStore'
import type { WorkspaceMember } from '../../src/shared/types'

const MOCK_MEMBERS: WorkspaceMember[] = [
  { id: 'user-1', name: 'Admin User', email: 'admin@example.com', role: 'admin', joinedAt: '2026-01-01T00:00:00Z' },
  { id: 'user-2', name: 'Editor User', email: 'editor@example.com', role: 'editor', joinedAt: '2026-01-02T00:00:00Z' },
]

function okResponse(data: unknown) {
  return { success: true as const, data, timestamp: Date.now() }
}

function setupWorkspace() {
  useAppStore.getState().setCurrentWorkspace({
    config: {
      workspaceId: 'ws-test',
      name: 'Test',
      description: '',
      icon: '🧠',
      defaultModel: 'claude',
      syncInterval: 30,
      createdAt: '',
      gitProvider: 'sibylla',
      gitRemote: null,
      lastSyncAt: null,
    },
    metadata: {
      path: '/test',
      sizeBytes: 0,
      fileCount: 0,
      lastModifiedAt: '',
      isSyncing: false,
      hasUncommittedChanges: false,
    },
  })
}

describe('MemberList', () => {
  beforeEach(() => {
    useMembersStore.getState().reset()
    useAppStore.getState().clearAuth()
    vi.clearAllMocks()
  })

  it('shows loading state while members are being fetched', () => {
    setupWorkspace()
    useMembersStore.setState({ isLoading: true })

    render(<MemberList />)
    expect(screen.getByText('加载中...')).toBeInTheDocument()
  })

  it('renders member list with names and emails', async () => {
    window.electronAPI.workspace.getMembers = vi.fn().mockResolvedValue(
      okResponse(MOCK_MEMBERS),
    )

    useAppStore.getState().setAuthenticated(true, {
      id: 'user-1',
      email: 'admin@example.com',
      name: 'Admin User',
    })
    setupWorkspace()

    render(<MemberList />)

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument()
    })
    expect(screen.getByText('admin@example.com')).toBeInTheDocument()
    expect(screen.getByText('Editor User')).toBeInTheDocument()
    expect(screen.getByText('editor@example.com')).toBeInTheDocument()
  })

  it('shows invite button for admin users', async () => {
    window.electronAPI.workspace.getMembers = vi.fn().mockResolvedValue(
      okResponse(MOCK_MEMBERS),
    )

    useAppStore.getState().setAuthenticated(true, {
      id: 'user-1',
      email: 'admin@example.com',
      name: 'Admin User',
    })
    setupWorkspace()

    render(<MemberList />)

    await waitFor(() => {
      expect(screen.getByText('邀请成员')).toBeInTheDocument()
    })
  })

  it('hides invite button for non-admin users', async () => {
    window.electronAPI.workspace.getMembers = vi.fn().mockResolvedValue(
      okResponse(MOCK_MEMBERS),
    )

    useAppStore.getState().setAuthenticated(true, {
      id: 'user-2',
      email: 'editor@example.com',
      name: 'Editor User',
    })
    setupWorkspace()

    render(<MemberList />)

    await waitFor(() => {
      expect(screen.getByText('Editor User')).toBeInTheDocument()
    })
    expect(screen.queryByText('邀请成员')).not.toBeInTheDocument()
  })

  it('shows "(你)" label for current user', async () => {
    window.electronAPI.workspace.getMembers = vi.fn().mockResolvedValue(
      okResponse(MOCK_MEMBERS),
    )

    useAppStore.getState().setAuthenticated(true, {
      id: 'user-1',
      email: 'admin@example.com',
      name: 'Admin User',
    })
    setupWorkspace()

    render(<MemberList />)

    await waitFor(() => {
      expect(screen.getByText('(你)')).toBeInTheDocument()
    })
  })

  it('shows empty state when no members', async () => {
    window.electronAPI.workspace.getMembers = vi.fn().mockResolvedValue(
      okResponse([]),
    )

    useAppStore.getState().setAuthenticated(true, {
      id: 'user-1',
      email: 'admin@example.com',
      name: 'Admin',
    })
    setupWorkspace()

    render(<MemberList />)

    await waitFor(() => {
      expect(screen.getByText('暂无成员')).toBeInTheDocument()
    })
  })
})
