import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TreeNode } from '../../src/renderer/components/layout/TreeNode'
import type { FileTreeNode } from '../../src/renderer/components/layout/file-tree.utils'

function makeNode(
  path: string,
  type: 'file' | 'folder',
  children?: FileTreeNode[]
): FileTreeNode {
  const name = path.split('/').filter(Boolean).pop() ?? path
  return {
    id: path,
    name,
    type,
    path,
    children,
    depth: path.split('/').filter(Boolean).length - 1,
  }
}

const noop = vi.fn()
const defaultHandlers = {
  onSelect: noop,
  onToggle: noop,
  onStartRename: noop,
  onSubmitRename: noop,
  onCancelRename: noop,
  onStartCreateFile: noop,
  onStartCreateFolder: noop,
  onSubmitCreate: noop,
  onCancelCreate: noop,
  onContextMenu: noop,
  onDragStart: noop,
  onDragOver: noop,
  onDragEnter: noop,
  onDrop: noop,
}

describe('TreeNode', () => {
  it('renders file node with correct name', () => {
    const node = makeNode('readme.md', 'file')
    render(
      <TreeNode
        node={node}
        level={0}
        selectedId={null}
        expandedIds={new Set()}
        openPaths={new Set()}
        dirtyPaths={new Set()}
        conflictPaths={new Set()}
        renamingPath={null}
        pendingCreate={null}
        {...defaultHandlers}
      />
    )
    expect(screen.getByText('readme.md')).toBeInTheDocument()
  })

  it('renders folder node with correct name', () => {
    const node = makeNode('docs', 'folder')
    render(
      <TreeNode
        node={node}
        level={0}
        selectedId={null}
        expandedIds={new Set()}
        openPaths={new Set()}
        dirtyPaths={new Set()}
        conflictPaths={new Set()}
        renamingPath={null}
        pendingCreate={null}
        {...defaultHandlers}
      />
    )
    expect(screen.getByText('docs')).toBeInTheDocument()
  })

  it('applies selected styles when selectedId matches node path', () => {
    const node = makeNode('readme.md', 'file')
    render(
      <TreeNode
        node={node}
        level={0}
        selectedId="readme.md"
        expandedIds={new Set()}
        openPaths={new Set()}
        dirtyPaths={new Set()}
        conflictPaths={new Set()}
        renamingPath={null}
        pendingCreate={null}
        {...defaultHandlers}
      />
    )
    const row = screen.getByRole('treeitem').querySelector('[data-path]') as HTMLElement
    expect(row).toHaveClass('bg-indigo-50')
  })

  it('does not apply selected styles when node is not selected', () => {
    const node = makeNode('readme.md', 'file')
    render(
      <TreeNode
        node={node}
        level={0}
        selectedId="other.md"
        expandedIds={new Set()}
        openPaths={new Set()}
        dirtyPaths={new Set()}
        conflictPaths={new Set()}
        renamingPath={null}
        pendingCreate={null}
        {...defaultHandlers}
      />
    )
    const row = screen.getByRole('treeitem')
    expect(row).not.toHaveClass('bg-indigo-50')
  })

  it('shows green dot indicator for open files', () => {
    const node = makeNode('readme.md', 'file')
    render(
      <TreeNode
        node={node}
        level={0}
        selectedId={null}
        expandedIds={new Set()}
        openPaths={new Set(['readme.md'])}
        dirtyPaths={new Set()}
        conflictPaths={new Set()}
        renamingPath={null}
        pendingCreate={null}
        {...defaultHandlers}
      />
    )
    const dot = screen.getByRole('treeitem').querySelector('.bg-green-500')
    expect(dot).toBeInTheDocument()
  })

  it('does not show green dot for files not in openPaths', () => {
    const node = makeNode('readme.md', 'file')
    render(
      <TreeNode
        node={node}
        level={0}
        selectedId={null}
        expandedIds={new Set()}
        openPaths={new Set()}
        dirtyPaths={new Set()}
        conflictPaths={new Set()}
        renamingPath={null}
        pendingCreate={null}
        {...defaultHandlers}
      />
    )
    const dot = screen.getByRole('treeitem').querySelector('.bg-green-500')
    expect(dot).not.toBeInTheDocument()
  })

  it('shows amber asterisk for dirty (unsaved) files', () => {
    const node = makeNode('readme.md', 'file')
    render(
      <TreeNode
        node={node}
        level={0}
        selectedId={null}
        expandedIds={new Set()}
        openPaths={new Set()}
        dirtyPaths={new Set(['readme.md'])}
        conflictPaths={new Set()}
        renamingPath={null}
        pendingCreate={null}
        {...defaultHandlers}
      />
    )
    const asterisk = screen.getByRole('treeitem').querySelector('.text-amber-500')
    expect(asterisk).toBeInTheDocument()
    expect(asterisk?.textContent).toBe('*')
  })

  it('does not show amber asterisk for clean files', () => {
    const node = makeNode('readme.md', 'file')
    render(
      <TreeNode
        node={node}
        level={0}
        selectedId={null}
        expandedIds={new Set()}
        openPaths={new Set()}
        dirtyPaths={new Set()}
        conflictPaths={new Set()}
        renamingPath={null}
        pendingCreate={null}
        {...defaultHandlers}
      />
    )
    const asterisk = screen.getByRole('treeitem').querySelector('.text-amber-500')
    expect(asterisk).not.toBeInTheDocument()
  })

  it('applies correct indentation based on level', () => {
    const node = makeNode('docs/a.md', 'file')
    render(
      <TreeNode
        node={node}
        level={2}
        selectedId={null}
        expandedIds={new Set()}
        openPaths={new Set()}
        dirtyPaths={new Set()}
        conflictPaths={new Set()}
        renamingPath={null}
        pendingCreate={null}
        {...defaultHandlers}
      />
    )
    const row = screen.getByRole('treeitem').firstChild as HTMLElement
    expect(row).toHaveStyle({ paddingLeft: '40px' })
  })

  it('renders children when folder is expanded', () => {
    const node = makeNode('docs', 'folder', [
      makeNode('docs/readme.md', 'file'),
      makeNode('docs/spec.md', 'file'),
    ])
    render(
      <TreeNode
        node={node}
        level={0}
        selectedId={null}
        expandedIds={new Set(['docs'])}
        openPaths={new Set()}
        dirtyPaths={new Set()}
        conflictPaths={new Set()}
        renamingPath={null}
        pendingCreate={null}
        {...defaultHandlers}
      />
    )
    expect(screen.getByText('readme.md')).toBeInTheDocument()
    expect(screen.getByText('spec.md')).toBeInTheDocument()
  })

  it('does not render children when folder is collapsed', () => {
    const node = makeNode('docs', 'folder', [
      makeNode('docs/readme.md', 'file'),
    ])
    render(
      <TreeNode
        node={node}
        level={0}
        selectedId={null}
        expandedIds={new Set()}
        openPaths={new Set()}
        dirtyPaths={new Set()}
        conflictPaths={new Set()}
        renamingPath={null}
        pendingCreate={null}
        {...defaultHandlers}
      />
    )
    expect(screen.queryByText('readme.md')).not.toBeInTheDocument()
  })

  it('calls onToggle when folder is clicked', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    const node = makeNode('docs', 'folder')
    render(
      <TreeNode
        node={node}
        level={0}
        selectedId={null}
        expandedIds={new Set()}
        openPaths={new Set()}
        dirtyPaths={new Set()}
        conflictPaths={new Set()}
        renamingPath={null}
        pendingCreate={null}
        {...defaultHandlers}
        onToggle={onToggle}
      />
    )
    await user.click(screen.getByText('docs'))
    expect(onToggle).toHaveBeenCalledWith('docs')
  })

  it('calls onSelect when file is clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const node = makeNode('readme.md', 'file')
    render(
      <TreeNode
        node={node}
        level={0}
        selectedId={null}
        expandedIds={new Set()}
        openPaths={new Set()}
        dirtyPaths={new Set()}
        conflictPaths={new Set()}
        renamingPath={null}
        pendingCreate={null}
        {...defaultHandlers}
        onSelect={onSelect}
      />
    )
    await user.click(screen.getByText('readme.md'))
    expect(onSelect).toHaveBeenCalledWith(node)
  })

  it('calls onContextMenu on right-click', () => {
    const onContextMenu = vi.fn()
    const node = makeNode('readme.md', 'file')
    render(
      <TreeNode
        node={node}
        level={0}
        selectedId={null}
        expandedIds={new Set()}
        openPaths={new Set()}
        dirtyPaths={new Set()}
        conflictPaths={new Set()}
        renamingPath={null}
        pendingCreate={null}
        {...defaultHandlers}
        onContextMenu={onContextMenu}
      />
    )
    const row = screen.getByRole('treeitem').querySelector('[data-path]') as HTMLElement
    fireEvent.contextMenu(row)
    expect(onContextMenu).toHaveBeenCalled()
  })

  it('has draggable attribute for drag support', () => {
    const node = makeNode('readme.md', 'file')
    render(
      <TreeNode
        node={node}
        level={0}
        selectedId={null}
        expandedIds={new Set()}
        openPaths={new Set()}
        dirtyPaths={new Set()}
        conflictPaths={new Set()}
        renamingPath={null}
        pendingCreate={null}
        {...defaultHandlers}
      />
    )
    const row = screen.getByRole('treeitem').firstChild as HTMLElement
    expect(row.draggable).toBe(true)
  })

  it('calls onDragStart when drag begins', () => {
    const onDragStart = vi.fn()
    const node = makeNode('readme.md', 'file')
    render(
      <TreeNode
        node={node}
        level={0}
        selectedId={null}
        expandedIds={new Set()}
        openPaths={new Set()}
        dirtyPaths={new Set()}
        conflictPaths={new Set()}
        renamingPath={null}
        pendingCreate={null}
        {...defaultHandlers}
        onDragStart={onDragStart}
      />
    )
    const row = screen.getByRole('treeitem').firstChild as HTMLElement
    fireEvent.dragStart(row)
    expect(onDragStart).toHaveBeenCalled()
  })

  it('shows InlineRenameInput when renamingPath matches node path', () => {
    const node = makeNode('readme.md', 'file')
    render(
      <TreeNode
        node={node}
        level={0}
        selectedId={null}
        expandedIds={new Set()}
        openPaths={new Set()}
        dirtyPaths={new Set()}
        conflictPaths={new Set()}
        renamingPath="readme.md"
        pendingCreate={null}
        {...defaultHandlers}
      />
    )
    const input = screen.getByRole('textbox')
    expect(input).toBeInTheDocument()
    expect(input).toHaveValue('readme.md')
  })

  it('does not show InlineRenameInput when renamingPath does not match', () => {
    const node = makeNode('readme.md', 'file')
    render(
      <TreeNode
        node={node}
        level={0}
        selectedId={null}
        expandedIds={new Set()}
        openPaths={new Set()}
        dirtyPaths={new Set()}
        conflictPaths={new Set()}
        renamingPath="other.md"
        pendingCreate={null}
        {...defaultHandlers}
      />
    )
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('sets title attribute for tooltip on long names', () => {
    const node = makeNode('readme.md', 'file')
    render(
      <TreeNode
        node={node}
        level={0}
        selectedId={null}
        expandedIds={new Set()}
        openPaths={new Set()}
        dirtyPaths={new Set()}
        conflictPaths={new Set()}
        renamingPath={null}
        pendingCreate={null}
        {...defaultHandlers}
      />
    )
    const row = screen.getByRole('treeitem').firstChild as HTMLElement
    expect(row).toHaveAttribute('title', 'readme.md')
  })

  it('sets data-path attribute for identification', () => {
    const node = makeNode('docs/readme.md', 'file')
    render(
      <TreeNode
        node={node}
        level={1}
        selectedId={null}
        expandedIds={new Set()}
        openPaths={new Set()}
        dirtyPaths={new Set()}
        conflictPaths={new Set()}
        renamingPath={null}
        pendingCreate={null}
        {...defaultHandlers}
      />
    )
    const row = screen.getByRole('treeitem').firstChild as HTMLElement
    expect(row).toHaveAttribute('data-path', 'docs/readme.md')
  })

  it('renders pending create input inside expanded folder', () => {
    const node = makeNode('docs', 'folder', [])
    render(
      <TreeNode
        node={node}
        level={0}
        selectedId={null}
        expandedIds={new Set(['docs'])}
        openPaths={new Set()}
        dirtyPaths={new Set()}
        conflictPaths={new Set()}
        renamingPath={null}
        pendingCreate={{ parentPath: 'docs', type: 'file', defaultName: 'untitled.md' }}
        {...defaultHandlers}
      />
    )
    const input = screen.getByRole('textbox')
    expect(input).toBeInTheDocument()
    expect(input).toHaveValue('untitled.md')
  })

  it('does not render pending create input when parentPath does not match', () => {
    const node = makeNode('docs', 'folder', [])
    render(
      <TreeNode
        node={node}
        level={0}
        selectedId={null}
        expandedIds={new Set(['docs'])}
        openPaths={new Set()}
        dirtyPaths={new Set()}
        conflictPaths={new Set()}
        renamingPath={null}
        pendingCreate={{ parentPath: 'other', type: 'file', defaultName: 'untitled.md' }}
        {...defaultHandlers}
      />
    )
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('sets aria-expanded on folder nodes', () => {
    const node = makeNode('docs', 'folder')
    const { rerender } = render(
      <TreeNode
        node={node}
        level={0}
        selectedId={null}
        expandedIds={new Set()}
        openPaths={new Set()}
        dirtyPaths={new Set()}
        conflictPaths={new Set()}
        renamingPath={null}
        pendingCreate={null}
        {...defaultHandlers}
      />
    )
    expect(screen.getByRole('treeitem')).toHaveAttribute('aria-expanded', 'false')

    rerender(
      <TreeNode
        node={node}
        level={0}
        selectedId={null}
        expandedIds={new Set(['docs'])}
        openPaths={new Set()}
        dirtyPaths={new Set()}
        conflictPaths={new Set()}
        renamingPath={null}
        pendingCreate={null}
        {...defaultHandlers}
      />
    )
    expect(screen.getByRole('treeitem')).toHaveAttribute('aria-expanded', 'true')
  })

  it('does not set aria-expanded on file nodes', () => {
    const node = makeNode('readme.md', 'file')
    render(
      <TreeNode
        node={node}
        level={0}
        selectedId={null}
        expandedIds={new Set()}
        openPaths={new Set()}
        dirtyPaths={new Set()}
        conflictPaths={new Set()}
        renamingPath={null}
        pendingCreate={null}
        {...defaultHandlers}
      />
    )
    expect(screen.getByRole('treeitem')).not.toHaveAttribute('aria-expanded')
  })

  describe('deep nesting (depth > 10)', () => {
    it('renders deeply nested nodes correctly', () => {
      let node: FileTreeNode = makeNode('level11.md', 'file')
      for (let i = 10; i >= 0; i--) {
        const folderNode = makeNode(`level${i}`, 'folder', [node])
        node = folderNode
      }
      render(
        <TreeNode
          node={node}
          level={0}
          selectedId={null}
          expandedIds={new Set(['level0', 'level1', 'level2', 'level3', 'level4', 'level5', 'level6', 'level7', 'level8', 'level9', 'level10'])}
          openPaths={new Set()}
          dirtyPaths={new Set()}
          conflictPaths={new Set()}
          renamingPath={null}
          pendingCreate={null}
          {...defaultHandlers}
        />
      )
      expect(screen.getByText('level11.md')).toBeInTheDocument()
    })
  })
})
