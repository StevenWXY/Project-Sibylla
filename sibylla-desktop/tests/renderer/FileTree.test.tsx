import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FileTree } from '../../src/renderer/components/layout/FileTree'
import type { FileTreeNode } from '../../src/renderer/components/layout/file-tree.utils'
import { useFileTreeStore } from '../../src/renderer/store/fileTreeStore'

function makeNode(
  path: string,
  type: 'file' | 'folder',
  children?: FileTreeNode[],
  isLoaded?: boolean
): FileTreeNode {
  const name = path.split('/').filter(Boolean).pop() ?? path
  return {
    id: path,
    name,
    type,
    path,
    children,
    depth: path.split('/').filter(Boolean).length - 1,
    isLoaded,
  }
}

const sampleData: FileTreeNode[] = [
  makeNode('docs', 'folder', [
    makeNode('docs/readme.md', 'file'),
    makeNode('docs/spec.md', 'file'),
  ], true),
  makeNode('notes', 'folder', [
    makeNode('notes/a.md', 'file'),
  ], true),
  makeNode('root.md', 'file'),
]

function getToolbarButton(title: string): HTMLElement {
  return screen.getAllByTitle(title).find(btn => btn.classList.contains('h-8'))!
}

describe('FileTree', () => {
  beforeEach(() => {
    useFileTreeStore.getState().reset()
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders all root-level nodes', () => {
      render(
        <FileTree
          data={sampleData}
          defaultExpandedIds={['docs', 'notes']}
        />
      )
      expect(screen.getByText('docs')).toBeInTheDocument()
      expect(screen.getByText('notes')).toBeInTheDocument()
      expect(screen.getByText('root.md')).toBeInTheDocument()
    })

    it('renders nested children when folder is expanded', () => {
      render(
        <FileTree data={sampleData} defaultExpandedIds={['docs']} />
      )
      expect(screen.getByText('readme.md')).toBeInTheDocument()
      expect(screen.getByText('spec.md')).toBeInTheDocument()
    })

    it('hides nested children when folder is collapsed', () => {
      render(<FileTree data={sampleData} defaultExpandedIds={[]} />)
      expect(screen.queryByText('readme.md')).not.toBeInTheDocument()
    })

    it('renders error message when actionError occurs', async () => {
      const onCreateFile = vi.fn().mockRejectedValue(new Error('创建失败'))
      render(
        <FileTree
          data={sampleData}
          defaultExpandedIds={[]}
          onCreateFile={onCreateFile}
        />
      )

      await userEvent.click(getToolbarButton('新建文件'))

      const input = screen.getByRole('textbox')
      await userEvent.clear(input)
      await userEvent.type(input, 'test.md')
      fireEvent.keyDown(input, { key: 'Enter' })

      await waitFor(() => {
        expect(screen.getByText('创建失败')).toBeInTheDocument()
      })
    })

    it('renders with custom className', () => {
      const { container } = render(
        <FileTree data={sampleData} className="custom-class" />
      )
      const tree = container.firstChild as HTMLElement
      expect(tree).toHaveClass('custom-class')
    })

    it('has tree role and aria-label', () => {
      render(<FileTree data={sampleData} />)
      expect(screen.getByRole('tree')).toHaveAttribute('aria-label', '文件树')
    })

    it('renders toolbar with new file, new folder, and refresh buttons', () => {
      render(<FileTree data={sampleData} />)
      expect(getToolbarButton('新建文件')).toBeInTheDocument()
      expect(getToolbarButton('新建文件夹')).toBeInTheDocument()
      expect(getToolbarButton('刷新')).toBeInTheDocument()
    })
  })

  describe('file selection', () => {
    it('calls onSelect when clicking a file node', async () => {
      const onSelect = vi.fn()
      render(
        <FileTree data={sampleData} defaultExpandedIds={['docs']} onSelect={onSelect} />
      )
      await userEvent.click(screen.getByText('readme.md'))
      expect(onSelect).toHaveBeenCalledTimes(1)
      expect(onSelect.mock.calls[0][0].path).toBe('docs/readme.md')
    })

    it('calls onSelect when clicking a folder node', async () => {
      const onSelect = vi.fn()
      render(<FileTree data={sampleData} onSelect={onSelect} />)
      await userEvent.click(screen.getByText('docs'))
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ path: 'docs' }))
    })
  })

  describe('folder expand/collapse', () => {
    it('expands folder on click', async () => {
      render(<FileTree data={sampleData} defaultExpandedIds={[]} />)
      expect(screen.queryByText('readme.md')).not.toBeInTheDocument()
      await userEvent.click(screen.getByText('docs'))
      expect(screen.getByText('readme.md')).toBeInTheDocument()
    })

    it('collapses expanded folder on click', async () => {
      const onToggle = vi.fn()
      const toggleData: FileTreeNode[] = [
        makeNode('docs', 'folder', [
          makeNode('docs/readme.md', 'file'),
        ], true),
      ]
      const { rerender } = render(
        <FileTree
          data={toggleData}
          onRename={vi.fn().mockResolvedValue(undefined)}
        />
      )
      await userEvent.click(screen.getByText('docs'))
      expect(screen.getByText('readme.md')).toBeInTheDocument()

      const collapseBtn = screen.getByLabelText('折叠文件夹')
      await userEvent.click(collapseBtn)

      expect(screen.queryByText('readme.md')).not.toBeInTheDocument()
    })

    it('calls onFolderExpand when expanding unloaded folder', async () => {
      const dataWithUnloaded: FileTreeNode[] = [
        makeNode('docs', 'folder', undefined, false),
      ]
      const onFolderExpand = vi.fn()
      render(
        <FileTree data={dataWithUnloaded} onFolderExpand={onFolderExpand} />
      )
      await userEvent.click(screen.getByText('docs'))
      expect(onFolderExpand).toHaveBeenCalledWith('docs')
    })
  })

  describe('context menu', () => {
    it('opens context menu on right-click', () => {
      render(
        <FileTree data={sampleData} defaultExpandedIds={['docs']} />
      )
      const item = screen.getByText('readme.md').closest('[data-path]') ?? screen.getByText('readme.md')
      fireEvent.contextMenu(item!)
      expect(screen.getByRole('menu')).toBeInTheDocument()
    })

    it('shows rename, delete, copy path for files', () => {
      render(<FileTree data={sampleData} defaultExpandedIds={['docs']} />)
      const item = screen.getByText('readme.md').closest('[data-path]')!
      fireEvent.contextMenu(item)
      expect(screen.getByText('重命名')).toBeInTheDocument()
      expect(screen.getByText('删除')).toBeInTheDocument()
      expect(screen.getByText('复制路径')).toBeInTheDocument()
    })

    it('shows folder-specific menu items on folder right-click', () => {
      render(<FileTree data={sampleData} />)
      const folderEl = screen.getByText('docs').closest('[data-path]')!
      fireEvent.contextMenu(folderEl)
      expect(screen.getByRole('menu', { name: '文件树操作菜单' })).toBeInTheDocument()
    })

    it('closes context menu on Escape', () => {
      render(
        <FileTree data={sampleData} defaultExpandedIds={['docs']} />
      )
      const item = screen.getByText('readme.md').closest('[data-path]')!
      fireEvent.contextMenu(item)
      expect(screen.getByRole('menu')).toBeInTheDocument()
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })
  })

  describe('create file', () => {
    it('creates file at root level via toolbar button', async () => {
      const onCreateFile = vi.fn().mockResolvedValue(undefined)
      render(
        <FileTree data={sampleData} onCreateFile={onCreateFile} />
      )

      await userEvent.click(getToolbarButton('新建文件'))

      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('untitled.md')

      await userEvent.clear(input)
      await userEvent.type(input, 'new-doc.md')
      fireEvent.keyDown(input, { key: 'Enter' })

      await waitFor(() => {
        expect(onCreateFile).toHaveBeenCalledWith('new-doc.md')
      })
    })

    it('shows validation error for invalid filename', async () => {
      const onCreateFile = vi.fn().mockResolvedValue(undefined)
      render(
        <FileTree data={sampleData} onCreateFile={onCreateFile} />
      )

      await userEvent.click(getToolbarButton('新建文件'))

      const input = screen.getByRole('textbox')
      await userEvent.clear(input)
      await userEvent.type(input, 'bad/file.md')
      fireEvent.keyDown(input, { key: 'Enter' })

      await waitFor(() => {
        expect(screen.getByText('文件名包含非法字符')).toBeInTheDocument()
      })
      expect(onCreateFile).not.toHaveBeenCalled()
    })

    it('cancels creation on Escape', async () => {
      render(<FileTree data={sampleData} onCreateFile={vi.fn()} />)

      await userEvent.click(getToolbarButton('新建文件'))
      expect(screen.getByRole('textbox')).toBeInTheDocument()

      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
  })

  describe('create folder', () => {
    it('creates folder at root level via toolbar button', async () => {
      const onCreateFolder = vi.fn().mockResolvedValue(undefined)
      render(
        <FileTree data={sampleData} onCreateFolder={onCreateFolder} />
      )

      await userEvent.click(getToolbarButton('新建文件夹'))

      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('new-folder')

      await userEvent.clear(input)
      await userEvent.type(input, 'my-folder')
      fireEvent.keyDown(input, { key: 'Enter' })

      await waitFor(() => {
        expect(onCreateFolder).toHaveBeenCalledWith('my-folder')
      })
    })
  })

  describe('rename', () => {
    it('renames a file via context menu', async () => {
      const onRename = vi.fn().mockResolvedValue(undefined)
      render(
        <FileTree
          data={sampleData}
          defaultExpandedIds={['docs']}
          onRename={onRename}
        />
      )

      const item = screen.getByText('readme.md').closest('[data-path]')!
      fireEvent.contextMenu(item)
      await userEvent.click(screen.getByText('重命名'))

      const input = screen.getByRole('textbox')
      expect(input).toHaveValue('readme.md')

      await userEvent.clear(input)
      await userEvent.type(input, 'intro.md')
      fireEvent.keyDown(input, { key: 'Enter' })

      await waitFor(() => {
        expect(onRename).toHaveBeenCalledWith('docs/readme.md', 'docs/intro.md')
      })
    })

    it('cancels rename on Escape', async () => {
      render(
        <FileTree
          data={sampleData}
          defaultExpandedIds={['docs']}
          onRename={vi.fn()}
        />
      )

      const item = screen.getByText('readme.md').closest('[data-path]')!
      fireEvent.contextMenu(item)
      await userEvent.click(screen.getByText('重命名'))

      const input = screen.getByRole('textbox')
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('shows validation error for invalid rename', async () => {
      const onRename = vi.fn().mockResolvedValue(undefined)
      render(
        <FileTree
          data={sampleData}
          defaultExpandedIds={['docs']}
          onRename={onRename}
        />
      )

      const item = screen.getByText('readme.md').closest('[data-path]')!
      fireEvent.contextMenu(item)
      await userEvent.click(screen.getByText('重命名'))

      const input = screen.getByRole('textbox')
      await userEvent.clear(input)
      await userEvent.type(input, 'bad:name.md')
      fireEvent.keyDown(input, { key: 'Enter' })

      await waitFor(() => {
        expect(screen.getByText('文件名包含非法字符')).toBeInTheDocument()
      })
      expect(onRename).not.toHaveBeenCalled()
    })
  })

  describe('delete', () => {
    it('opens confirmation modal for file deletion', async () => {
      const onDelete = vi.fn().mockResolvedValue(undefined)
      render(
        <FileTree
          data={sampleData}
          defaultExpandedIds={['docs']}
          onDelete={onDelete}
        />
      )

      const item = screen.getByText('readme.md').closest('[data-path]')!
      fireEvent.contextMenu(item)
      await userEvent.click(screen.getByText('删除'))

      expect(screen.getByText('确认删除')).toBeInTheDocument()
      expect(screen.getByText(/确认删除文件「readme.md」/)).toBeInTheDocument()
    })

    it('opens confirmation modal for folder deletion with child count', async () => {
      const onDelete = vi.fn().mockResolvedValue(undefined)
      render(
        <FileTree
          data={sampleData}
          onDelete={onDelete}
        />
      )

      const folderEl = screen.getByText('docs').closest('[data-path]')!
      fireEvent.contextMenu(folderEl)
      await userEvent.click(screen.getByText('删除'))

      expect(screen.getByText('确认删除')).toBeInTheDocument()
      expect(screen.getByText(/子项/)).toBeInTheDocument()
    })

    it('calls onDelete on confirm', async () => {
      const onDelete = vi.fn().mockResolvedValue(undefined)
      render(
        <FileTree
          data={sampleData}
          defaultExpandedIds={['docs']}
          onDelete={onDelete}
        />
      )

      const item = screen.getByText('readme.md').closest('[data-path]')!
      fireEvent.contextMenu(item)
      await userEvent.click(screen.getByText('删除'))

      const confirmButtons = screen.getAllByText('删除')
      await userEvent.click(confirmButtons[confirmButtons.length - 1])

      await waitFor(() => {
        expect(onDelete).toHaveBeenCalledTimes(1)
      })
    })

    it('cancels deletion on cancel button', async () => {
      const onDelete = vi.fn()
      render(
        <FileTree
          data={sampleData}
          defaultExpandedIds={['docs']}
          onDelete={onDelete}
        />
      )

      const item = screen.getByText('readme.md').closest('[data-path]')!
      fireEvent.contextMenu(item)
      await userEvent.click(screen.getByText('删除'))
      await userEvent.click(screen.getByText('取消'))

      expect(onDelete).not.toHaveBeenCalled()
    })
  })

  describe('copy path', () => {
    it('calls onCopyPath from context menu', async () => {
      const onCopyPath = vi.fn().mockResolvedValue(undefined)
      render(
        <FileTree
          data={sampleData}
          defaultExpandedIds={['docs']}
          onCopyPath={onCopyPath}
        />
      )

      const item = screen.getByText('readme.md').closest('[data-path]')!
      fireEvent.contextMenu(item)
      await userEvent.click(screen.getByText('复制路径'))

      expect(onCopyPath).toHaveBeenCalledWith('docs/readme.md')
    })
  })

  describe('keyboard navigation', () => {
    it('selects next node on ArrowDown', async () => {
      const onSelect = vi.fn()
      render(
        <FileTree
          data={sampleData}
          defaultExpandedIds={[]}
          onSelect={onSelect}
        />
      )

      const tree = screen.getByRole('tree')
      fireEvent.keyDown(tree, { key: 'ArrowDown' })
      expect(onSelect).toHaveBeenCalled()
    })

    it('selects previous node on ArrowUp', async () => {
      const onSelect = vi.fn()
      render(
        <FileTree
          data={sampleData}
          defaultExpandedIds={[]}
          onSelect={onSelect}
          selectedId="notes"
        />
      )

      const tree = screen.getByRole('tree')
      fireEvent.keyDown(tree, { key: 'ArrowUp' })
      expect(onSelect).toHaveBeenCalled()
    })

    it('starts rename on F2 when node is selected', () => {
      render(
        <FileTree
          data={sampleData}
          defaultExpandedIds={[]}
          onRename={vi.fn().mockResolvedValue(undefined)}
        />
      )

      const tree = screen.getByRole('tree')
      fireEvent.keyDown(tree, { key: 'ArrowDown' })
      fireEvent.keyDown(tree, { key: 'F2' })

      const input = screen.queryByRole('textbox')
      expect(input).toBeInTheDocument()
    })

    it('triggers delete confirmation on Delete key', async () => {
      render(
        <FileTree
          data={sampleData}
          defaultExpandedIds={[]}
          onDelete={vi.fn().mockResolvedValue(undefined)}
        />
      )

      const tree = screen.getByRole('tree')
      fireEvent.keyDown(tree, { key: 'ArrowDown' })
      fireEvent.keyDown(tree, { key: 'Delete' })

      await waitFor(() => {
        expect(screen.queryByText('确认删除')).toBeInTheDocument()
      })
    })
  })

  describe('drag and drop', () => {
    it('allows valid non-circular drop', async () => {
      const onMove = vi.fn().mockResolvedValue(undefined)
      render(
        <FileTree
          data={sampleData}
          defaultExpandedIds={['docs', 'notes']}
          onMove={onMove}
        />
      )

      const source = screen.getByText('root.md').closest('[data-path]')!
      const target = screen.getByText('docs').closest('[data-path]')!

      const dt = { setData: vi.fn(), getData: vi.fn(() => 'root.md'), effectAllowed: '', dropEffect: '' }
      fireEvent.dragStart(source, { dataTransfer: dt })
      fireEvent.dragOver(target, { dataTransfer: dt })
      fireEvent.drop(target, { dataTransfer: dt })

      expect(onMove).toHaveBeenCalledWith('root.md', 'docs')
    })

    it('prevents circular drop of parent into child', async () => {
      const onMove = vi.fn().mockResolvedValue(undefined)
      const nestedData: FileTreeNode[] = [
        makeNode('docs', 'folder', [
          makeNode('docs/sub', 'folder', [
            makeNode('docs/sub/deep.md', 'file'),
          ], true),
        ], true),
      ]
      render(
        <FileTree
          data={nestedData}
          defaultExpandedIds={['docs']}
          onMove={onMove}
        />
      )

      const source = screen.getByText('docs').closest('[data-path]')!
      const target = screen.getByText('sub').closest('[data-path]')!

      const dt = { setData: vi.fn(), getData: vi.fn(() => 'docs'), effectAllowed: '', dropEffect: '' }
      fireEvent.dragStart(source, { dataTransfer: dt })
      fireEvent.dragOver(target, { dataTransfer: dt })
      fireEvent.drop(target, { dataTransfer: dt })

      expect(onMove).not.toHaveBeenCalled()
    })
  })

  describe('refresh', () => {
    it('calls onRefresh when refresh button is clicked', async () => {
      const onRefresh = vi.fn().mockResolvedValue(undefined)
      render(
        <FileTree data={sampleData} onRefresh={onRefresh} />
      )

      await userEvent.click(getToolbarButton('刷新'))
      expect(onRefresh).toHaveBeenCalledTimes(1)
    })
  })

  describe('status indicators', () => {
    it('shows editing dot for files in openPaths', () => {
      render(
        <FileTree
          data={sampleData}
          defaultExpandedIds={['docs']}
          openPaths={['docs/readme.md']}
        />
      )
      const item = screen.getByText('readme.md').closest('[data-path]') ?? screen.getByText('readme.md').parentElement
      const dot = item?.querySelector('.bg-green-500')
      expect(dot).toBeInTheDocument()
    })

    it('shows dirty asterisk for files in dirtyPaths', () => {
      render(
        <FileTree
          data={sampleData}
          defaultExpandedIds={['docs']}
          dirtyPaths={['docs/readme.md']}
        />
      )
      const item = screen.getByText('readme.md').closest('[data-path]') ?? screen.getByText('readme.md').parentElement
      const asterisk = item?.querySelector('.text-amber-500')
      expect(asterisk).toBeInTheDocument()
    })

    it('does not show indicators for clean, unopened files', () => {
      render(
        <FileTree
          data={sampleData}
          defaultExpandedIds={['docs']}
          openPaths={[]}
          dirtyPaths={[]}
        />
      )
      const readmeItem = screen.getByText('readme.md').closest('[data-path]') ?? screen.getByText('readme.md').parentElement
      expect(readmeItem?.querySelector('.bg-green-500')).not.toBeInTheDocument()
      expect(readmeItem?.querySelector('.text-amber-500')).not.toBeInTheDocument()
    })
  })
})
