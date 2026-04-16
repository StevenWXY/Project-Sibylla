import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VersionList } from '../../src/renderer/components/version-history/VersionList'
import type { VersionEntry } from '../../src/renderer/store/versionHistoryStore'

const MOCK_VERSIONS: readonly VersionEntry[] = [
  {
    oid: 'abc123',
    message: '更新 prd.md',
    author: 'Alice',
    timestamp: Date.now() - 180000,
    summary: '更新 prd.md',
  },
  {
    oid: 'def456',
    message: '添加需求描述',
    author: 'Bob',
    timestamp: Date.now() - 86400000,
    summary: '添加需求描述',
  },
]

describe('VersionList', () => {
  it('renders version entries with summary, author and time', () => {
    render(
      <VersionList
        versions={MOCK_VERSIONS}
        selected={null}
        isLoading={false}
        onSelect={() => {}}
      />,
    )

    expect(screen.getByText('更新 prd.md')).toBeInTheDocument()
    expect(screen.getByText('添加需求描述')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('calls onSelect when clicking a version', () => {
    const onSelect = vi.fn()
    render(
      <VersionList
        versions={MOCK_VERSIONS}
        selected={null}
        isLoading={false}
        onSelect={onSelect}
      />,
    )

    fireEvent.click(screen.getByText('更新 prd.md'))
    expect(onSelect).toHaveBeenCalledWith(MOCK_VERSIONS[0])
  })

  it('shows loading state', () => {
    render(
      <VersionList
        versions={[]}
        selected={null}
        isLoading={true}
        onSelect={() => {}}
      />,
    )

    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('shows empty state when no versions', () => {
    render(
      <VersionList
        versions={[]}
        selected={null}
        isLoading={false}
        onSelect={() => {}}
      />,
    )

    expect(screen.getByText('暂无版本记录')).toBeInTheDocument()
  })

  it('highlights selected version', () => {
    render(
      <VersionList
        versions={MOCK_VERSIONS}
        selected={MOCK_VERSIONS[0]!}
        isLoading={false}
        onSelect={() => {}}
      />,
    )

    const selectedButton = screen.getByText('更新 prd.md').closest('button')
    expect(selectedButton?.className).toContain('bg-indigo-50')
  })
})
