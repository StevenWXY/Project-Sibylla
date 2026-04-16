import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DiffHunkView } from '../../src/renderer/components/version-history/DiffHunkView'
import type { DiffHunk } from '../../src/main/services/types/git-abstraction.types'

const MOCK_HUNKS: readonly DiffHunk[] = [
  {
    oldStart: 1,
    oldLines: 2,
    newStart: 1,
    newLines: 3,
    lines: [
      { type: 'context', content: 'unchanged line' },
      { type: 'delete', content: 'removed line' },
      { type: 'add', content: 'added line' },
    ],
  },
]

describe('DiffHunkView', () => {
  it('renders hunk header with line numbers', () => {
    render(<DiffHunkView hunks={MOCK_HUNKS} />)

    expect(screen.getByText(/@@ -1,2 \+1,3 @@/)).toBeInTheDocument()
  })

  it('renders add/delete/context lines', () => {
    render(<DiffHunkView hunks={MOCK_HUNKS} />)

    expect(screen.getByText('unchanged line')).toBeInTheDocument()
    expect(screen.getByText('removed line')).toBeInTheDocument()
    expect(screen.getByText('added line')).toBeInTheDocument()
  })

  it('renders empty state for no hunks', () => {
    render(<DiffHunkView hunks={[]} />)

    expect(screen.getByText('无差异')).toBeInTheDocument()
  })

  it('shows line prefixes', () => {
    const { container } = render(<DiffHunkView hunks={MOCK_HUNKS} />)

    const prefixes = container.querySelectorAll('.select-none')
    expect(prefixes.length).toBe(3)
  })
})
