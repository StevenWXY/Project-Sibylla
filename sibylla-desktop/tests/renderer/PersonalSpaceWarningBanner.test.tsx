import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PersonalSpaceWarningBanner } from '../../src/renderer/components/common/PersonalSpaceWarningBanner'

describe('PersonalSpaceWarningBanner', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('renders warning text with target user name', () => {
    render(<PersonalSpaceWarningBanner targetUser="bob" />)

    expect(screen.getByText(/您正在访问 bob 的个人空间/)).toBeInTheDocument()
    expect(screen.getByText(/管理员模式/)).toBeInTheDocument()
  })

  it('renders dismiss button with aria-label', () => {
    render(<PersonalSpaceWarningBanner targetUser="bob" />)

    expect(screen.getByLabelText('关闭警告')).toBeInTheDocument()
  })

  it('hides banner when dismiss button is clicked', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()

    render(<PersonalSpaceWarningBanner targetUser="bob" onDismiss={onDismiss} />)

    await user.click(screen.getByLabelText('关闭警告'))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/您正在访问 bob 的个人空间/)).not.toBeInTheDocument()
  })

  it('persists dismissal in sessionStorage', async () => {
    const user = userEvent.setup()

    render(<PersonalSpaceWarningBanner targetUser="bob" />)

    await user.click(screen.getByLabelText('关闭警告'))

    expect(sessionStorage.getItem('personal-space-warning-dismissed:bob')).toBe('true')
  })

  it('does not render if already dismissed in sessionStorage', () => {
    sessionStorage.setItem('personal-space-warning-dismissed:bob', 'true')

    render(<PersonalSpaceWarningBanner targetUser="bob" />)

    expect(screen.queryByText(/您正在访问 bob 的个人空间/)).not.toBeInTheDocument()
  })

  it('renders for a different user even if another user was dismissed', () => {
    sessionStorage.setItem('personal-space-warning-dismissed:bob', 'true')

    render(<PersonalSpaceWarningBanner targetUser="charlie" />)

    expect(screen.getByText(/您正在访问 charlie 的个人空间/)).toBeInTheDocument()
  })
})
