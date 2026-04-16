import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InviteMemberDialog } from '../../src/renderer/components/settings/InviteMemberDialog'
import { useMembersStore } from '../../src/renderer/store/membersStore'

function okResponse(data: unknown) {
  return { success: true as const, data, timestamp: Date.now() }
}

describe('InviteMemberDialog', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    useMembersStore.getState().reset()
    vi.clearAllMocks()

    window.electronAPI.workspace.inviteMember = vi.fn().mockResolvedValue(
      okResponse({ success: true }),
    )
    window.electronAPI.workspace.getMembers = vi.fn().mockResolvedValue(
      okResponse([]),
    )
  })

  it('renders email input and role selector', () => {
    render(<InviteMemberDialog workspaceId="ws-test" onClose={onClose} />)

    expect(screen.getByText('邀请成员')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('colleague@example.com')).toBeInTheDocument()
    expect(screen.getByText('发送邀请')).toBeInTheDocument()
  })

  it('shows validation error for empty email', async () => {
    const user = userEvent.setup()
    render(<InviteMemberDialog workspaceId="ws-test" onClose={onClose} />)

    await user.click(screen.getByText('发送邀请'))

    expect(screen.getByText('请输入邮箱地址')).toBeInTheDocument()
  })

  it('shows validation error for invalid email', async () => {
    const user = userEvent.setup()
    render(<InviteMemberDialog workspaceId="ws-test" onClose={onClose} />)

    const input = screen.getByPlaceholderText('colleague@example.com')
    await user.type(input, 'invalid-email')
    await user.click(screen.getByText('发送邀请'))

    expect(screen.getByText('请输入有效的邮箱地址')).toBeInTheDocument()
  })

  it('shows success message on successful invite', async () => {
    const user = userEvent.setup()
    render(<InviteMemberDialog workspaceId="ws-test" onClose={onClose} />)

    const input = screen.getByPlaceholderText('colleague@example.com')
    await user.type(input, 'test@example.com')
    await user.click(screen.getByText('发送邀请'))

    await waitFor(() => {
      expect(screen.getByText('邀请已发送！')).toBeInTheDocument()
    })
  })

  it('shows error message on failed invite', async () => {
    window.electronAPI.workspace.inviteMember = vi.fn().mockResolvedValue({
      success: true,
      data: { success: false, error: '用户已存在' },
      timestamp: Date.now(),
    })

    const user = userEvent.setup()
    render(<InviteMemberDialog workspaceId="ws-test" onClose={onClose} />)

    const input = screen.getByPlaceholderText('colleague@example.com')
    await user.type(input, 'existing@example.com')
    await user.click(screen.getByText('发送邀请'))

    await waitFor(() => {
      expect(screen.getByText('用户已存在')).toBeInTheDocument()
    })
  })

  it('disables submit button while submitting', async () => {
    let resolveInvite: (value: unknown) => void = () => {}
    const invitePromise = new Promise((resolve) => {
      resolveInvite = resolve
    })
    window.electronAPI.workspace.inviteMember = vi.fn().mockReturnValue(invitePromise)

    const user = userEvent.setup()
    render(<InviteMemberDialog workspaceId="ws-test" onClose={onClose} />)

    const input = screen.getByPlaceholderText('colleague@example.com')
    await user.type(input, 'test@example.com')
    await user.click(screen.getByText('发送邀请'))

    expect(screen.getByText('发送中...')).toBeInTheDocument()

    resolveInvite(okResponse({ success: true }))
  })
})
