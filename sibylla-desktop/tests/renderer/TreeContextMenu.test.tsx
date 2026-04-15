import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { TreeContextMenu } from '../../src/renderer/components/layout/TreeContextMenu'
import type { FileTreeNode } from '../../src/renderer/components/layout/file-tree.utils'

function makeNode(path: string, type: 'file' | 'folder'): FileTreeNode {
  const name = path.split('/').filter(Boolean).pop() ?? path
  return { id: path, name, type, path, depth: 0 }
}

describe('TreeContextMenu', () => {
  const onClose = vi.fn()
  const onRename = vi.fn()
  const onCopyPath = vi.fn()
  const onDelete = vi.fn()
  const onCreateFile = vi.fn()
  const onCreateFolder = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders rename and delete menu items for files', () => {
    const node = makeNode('readme.md', 'file')
    render(
      <TreeContextMenu
        x={100}
        y={100}
        node={node}
        onClose={onClose}
        onRename={onRename}
        onCopyPath={onCopyPath}
        onDelete={onDelete}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
      />
    )
    expect(screen.getByText('重命名')).toBeInTheDocument()
    expect(screen.getByText('复制路径')).toBeInTheDocument()
    expect(screen.getByText('删除')).toBeInTheDocument()
  })

  it('renders additional create menu items for folders', () => {
    const node = makeNode('docs', 'folder')
    render(
      <TreeContextMenu
        x={100}
        y={100}
        node={node}
        onClose={onClose}
        onRename={onRename}
        onCopyPath={onCopyPath}
        onDelete={onDelete}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
      />
    )
    expect(screen.getByText('新建文件')).toBeInTheDocument()
    expect(screen.getByText('新建子文件夹')).toBeInTheDocument()
    expect(screen.getByText('重命名')).toBeInTheDocument()
    expect(screen.getByText('删除')).toBeInTheDocument()
  })

  it('does not show create options for files', () => {
    const node = makeNode('readme.md', 'file')
    render(
      <TreeContextMenu
        x={100}
        y={100}
        node={node}
        onClose={onClose}
        onRename={onRename}
        onCopyPath={onCopyPath}
        onDelete={onDelete}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
      />
    )
    expect(screen.queryByText('新建文件')).not.toBeInTheDocument()
    expect(screen.queryByText('新建子文件夹')).not.toBeInTheDocument()
  })

  it('calls onRename and onClose when rename is clicked', async () => {
    const node = makeNode('readme.md', 'file')
    render(
      <TreeContextMenu
        x={100}
        y={100}
        node={node}
        onClose={onClose}
        onRename={onRename}
        onCopyPath={onCopyPath}
        onDelete={onDelete}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
      />
    )
    fireEvent.click(screen.getByText('重命名'))
    expect(onRename).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onDelete and onClose when delete is clicked', () => {
    const node = makeNode('readme.md', 'file')
    render(
      <TreeContextMenu
        x={100}
        y={100}
        node={node}
        onClose={onClose}
        onRename={onRename}
        onCopyPath={onCopyPath}
        onDelete={onDelete}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
      />
    )
    fireEvent.click(screen.getByText('删除'))
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onCopyPath and onClose when copy path is clicked', () => {
    const node = makeNode('readme.md', 'file')
    render(
      <TreeContextMenu
        x={100}
        y={100}
        node={node}
        onClose={onClose}
        onRename={onRename}
        onCopyPath={onCopyPath}
        onDelete={onDelete}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
      />
    )
    fireEvent.click(screen.getByText('复制路径'))
    expect(onCopyPath).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onCreateFile and onClose when create file is clicked', () => {
    const node = makeNode('docs', 'folder')
    render(
      <TreeContextMenu
        x={100}
        y={100}
        node={node}
        onClose={onClose}
        onRename={onRename}
        onCopyPath={onCopyPath}
        onDelete={onDelete}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
      />
    )
    fireEvent.click(screen.getByText('新建文件'))
    expect(onCreateFile).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onCreateFolder and onClose when create folder is clicked', () => {
    const node = makeNode('docs', 'folder')
    render(
      <TreeContextMenu
        x={100}
        y={100}
        node={node}
        onClose={onClose}
        onRename={onRename}
        onCopyPath={onCopyPath}
        onDelete={onDelete}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
      />
    )
    fireEvent.click(screen.getByText('新建子文件夹'))
    expect(onCreateFolder).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('positions menu at specified coordinates', () => {
    const node = makeNode('readme.md', 'file')
    render(
      <TreeContextMenu
        x={200}
        y={300}
        node={node}
        onClose={onClose}
        onRename={onRename}
        onCopyPath={onCopyPath}
        onDelete={onDelete}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
      />
    )
    const menu = screen.getByRole('menu')
    expect(menu).toHaveStyle({ left: '200px', top: '300px' })
  })

  it('adjusts position to avoid going off-screen right', () => {
    const node = makeNode('readme.md', 'file')
    const originalInnerWidth = window.innerWidth
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(300)

    render(
      <TreeContextMenu
        x={500}
        y={100}
        node={node}
        onClose={onClose}
        onRename={onRename}
        onCopyPath={onCopyPath}
        onDelete={onDelete}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
      />
    )
    const menu = screen.getByRole('menu')
    const left = parseInt(menu.style.left, 10)
    expect(left).toBeLessThan(500)

    vi.restoreAllMocks()
  })

  it('adjusts position to avoid going off-screen bottom', () => {
    const node = makeNode('readme.md', 'file')
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(300)

    render(
      <TreeContextMenu
        x={100}
        y={500}
        node={node}
        onClose={onClose}
        onRename={onRename}
        onCopyPath={onCopyPath}
        onDelete={onDelete}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
      />
    )
    const menu = screen.getByRole('menu')
    const top = parseInt(menu.style.top, 10)
    expect(top).toBeLessThan(500)

    vi.restoreAllMocks()
  })

  it('closes when Escape key is pressed', () => {
    const node = makeNode('readme.md', 'file')
    render(
      <TreeContextMenu
        x={100}
        y={100}
        node={node}
        onClose={onClose}
        onRename={onRename}
        onCopyPath={onCopyPath}
        onDelete={onDelete}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
      />
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes when clicking outside the menu', () => {
    const node = makeNode('readme.md', 'file')
    render(
      <TreeContextMenu
        x={100}
        y={100}
        node={node}
        onClose={onClose}
        onRename={onRename}
        onCopyPath={onCopyPath}
        onDelete={onDelete}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
      />
    )
    fireEvent.click(window)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders delete item with danger styling', () => {
    const node = makeNode('readme.md', 'file')
    render(
      <TreeContextMenu
        x={100}
        y={100}
        node={node}
        onClose={onClose}
        onRename={onRename}
        onCopyPath={onCopyPath}
        onDelete={onDelete}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
      />
    )
    const deleteButton = screen.getByText('删除').closest('button')
    expect(deleteButton).toHaveClass('text-red-600')
  })

  it('has menu role and aria-label', () => {
    const node = makeNode('readme.md', 'file')
    render(
      <TreeContextMenu
        x={100}
        y={100}
        node={node}
        onClose={onClose}
        onRename={onRename}
        onCopyPath={onCopyPath}
        onDelete={onDelete}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
      />
    )
    const menu = screen.getByRole('menu')
    expect(menu).toHaveAttribute('aria-label', '文件树操作菜单')
  })

  it('renders separator between create and rename actions for folders', () => {
    const node = makeNode('docs', 'folder')
    const { container } = render(
      <TreeContextMenu
        x={100}
        y={100}
        node={node}
        onClose={onClose}
        onRename={onRename}
        onCopyPath={onCopyPath}
        onDelete={onDelete}
        onCreateFile={onCreateFile}
        onCreateFolder={onCreateFolder}
      />
    )
    const separators = container.querySelectorAll('.bg-gray-200')
    expect(separators.length).toBeGreaterThanOrEqual(1)
  })
})
