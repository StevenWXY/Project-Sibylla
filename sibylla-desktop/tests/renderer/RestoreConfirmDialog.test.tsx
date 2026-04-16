import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RestoreConfirmDialog } from '../../src/renderer/components/version-history/RestoreConfirmDialog'
import type { VersionEntry } from '../../src/renderer/store/versionHistoryStore'

const MOCK_VERSION: VersionEntry = {
  oid: 'abc123',
  message: '更新 prd.md',
  author: 'Alice',
  timestamp: Date.now() - 180000,
  summary: '更新 prd.md',
}

describe('RestoreConfirmDialog', () => {
  it('renders version summary and author', () => {
    render(
      <RestoreConfirmDialog
        version={MOCK_VERSION}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    expect(screen.getByText('更新 prd.md')).toBeInTheDocument()
    expect(screen.getByText(/Alice/)).toBeInTheDocument()
    expect(screen.getByText(/确定要将文件恢复到以下版本吗？/)).toBeInTheDocument()
  })

  it('calls onConfirm when confirm button clicked', () => {
    const onConfirm = vi.fn()
    render(
      <RestoreConfirmDialog
        version={MOCK_VERSION}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    )

    fireEvent.click(screen.getByText('确认恢复'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when cancel button clicked', () => {
    const onCancel = vi.fn()
    render(
      <RestoreConfirmDialog
        version={MOCK_VERSION}
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    )

    fireEvent.click(screen.getByText('取消'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
