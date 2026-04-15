import { describe, expect, it, vi, beforeEach } from 'vitest'
import { useFileTreeStore } from '../../src/renderer/store/fileTreeStore'
import type { FileTreeNode } from '../../src/renderer/components/layout/file-tree.utils'

function makeNode(path: string, type: 'file' | 'folder', children?: FileTreeNode[]): FileTreeNode {
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

const sampleTree: FileTreeNode[] = [
  makeNode('docs', 'folder', [
    makeNode('docs/readme.md', 'file'),
    makeNode('docs/spec.md', 'file'),
  ]),
  makeNode('notes', 'folder', [
    makeNode('notes/a.md', 'file'),
  ]),
  makeNode('root.md', 'file'),
]

describe('fileTreeStore', () => {
  beforeEach(() => {
    useFileTreeStore.getState().reset()
  })

  describe('basic state', () => {
    it('initializes with empty state', () => {
      const state = useFileTreeStore.getState()
      expect(state.tree).toEqual([])
      expect(state.selectedPath).toBeNull()
      expect(state.renamingPath).toBeNull()
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
      expect(state.expandedIds.size).toBe(0)
    })

    it('setTree updates tree', () => {
      useFileTreeStore.getState().setTree(sampleTree)
      expect(useFileTreeStore.getState().tree).toEqual(sampleTree)
    })

    it('selectNode updates selectedPath', () => {
      useFileTreeStore.getState().selectNode('docs/readme.md')
      expect(useFileTreeStore.getState().selectedPath).toBe('docs/readme.md')
    })

    it('selectNode(null) clears selection', () => {
      useFileTreeStore.getState().selectNode('docs/readme.md')
      useFileTreeStore.getState().selectNode(null)
      expect(useFileTreeStore.getState().selectedPath).toBeNull()
    })

    it('startRename / cancelRename manage renamingPath', () => {
      useFileTreeStore.getState().startRename('docs/readme.md')
      expect(useFileTreeStore.getState().renamingPath).toBe('docs/readme.md')
      useFileTreeStore.getState().cancelRename()
      expect(useFileTreeStore.getState().renamingPath).toBeNull()
    })

    it('setError sets error message', () => {
      useFileTreeStore.getState().setError('something went wrong')
      expect(useFileTreeStore.getState().error).toBe('something went wrong')
    })

    it('reset restores initial state', () => {
      useFileTreeStore.getState().setTree(sampleTree)
      useFileTreeStore.getState().selectNode('docs')
      useFileTreeStore.getState().setError('err')
      useFileTreeStore.getState().reset()
      const state = useFileTreeStore.getState()
      expect(state.tree).toEqual([])
      expect(state.selectedPath).toBeNull()
      expect(state.error).toBeNull()
    })
  })

  describe('toggleExpand', () => {
    it('adds path to expandedIds', () => {
      useFileTreeStore.getState().toggleExpand('docs')
      expect(useFileTreeStore.getState().expandedIds.has('docs')).toBe(true)
    })

    it('removes path from expandedIds on second toggle', () => {
      useFileTreeStore.getState().toggleExpand('docs')
      useFileTreeStore.getState().toggleExpand('docs')
      expect(useFileTreeStore.getState().expandedIds.has('docs')).toBe(false)
    })

    it('manages multiple expanded paths independently', () => {
      useFileTreeStore.getState().toggleExpand('docs')
      useFileTreeStore.getState().toggleExpand('notes')
      const expanded = useFileTreeStore.getState().expandedIds
      expect(expanded.has('docs')).toBe(true)
      expect(expanded.has('notes')).toBe(true)
      useFileTreeStore.getState().toggleExpand('docs')
      expect(useFileTreeStore.getState().expandedIds.has('docs')).toBe(false)
      expect(useFileTreeStore.getState().expandedIds.has('notes')).toBe(true)
    })
  })

  describe('setExpandedIds', () => {
    it('replaces expandedIds', () => {
      useFileTreeStore.getState().setExpandedIds(new Set(['a', 'b']))
      expect(useFileTreeStore.getState().expandedIds).toEqual(new Set(['a', 'b']))
    })
  })

  describe('createFile (optimistic)', () => {
    beforeEach(() => {
      useFileTreeStore.getState().setTree(sampleTree)
    })

    it('optimistically adds file to tree', async () => {
      vi.mocked(window.electronAPI.file.write).mockResolvedValue({
        success: true,
        data: undefined,
      } as never)

      await useFileTreeStore.getState().createFile('docs/new-file.md')

      const tree = useFileTreeStore.getState().tree
      const docs = tree.find((n) => n.path === 'docs')
      expect(docs?.children?.some((c) => c.name === 'new-file.md')).toBe(true)
      expect(useFileTreeStore.getState().selectedPath).toBe('docs/new-file.md')
      expect(useFileTreeStore.getState().snapshot).toBeNull()
    })

    it('rolls back on failure', async () => {
      vi.mocked(window.electronAPI.file.write).mockResolvedValue({
        success: false,
        error: { type: 'IPC_ERROR' as const, message: 'write failed' },
      } as never)

      await useFileTreeStore.getState().createFile('docs/fail.md')

      expect(useFileTreeStore.getState().tree).toEqual(sampleTree)
      expect(useFileTreeStore.getState().error).toBe('write failed')
    })
  })

  describe('createFolder (optimistic)', () => {
    beforeEach(() => {
      useFileTreeStore.getState().setTree(sampleTree)
    })

    it('optimistically adds folder to tree', async () => {
      vi.mocked(window.electronAPI.file.createDir).mockResolvedValue({
        success: true,
        data: undefined,
      } as never)

      await useFileTreeStore.getState().createFolder('docs/new-folder')

      const tree = useFileTreeStore.getState().tree
      const docs = tree.find((n) => n.path === 'docs')
      expect(docs?.children?.some((c) => c.name === 'new-folder' && c.type === 'folder')).toBe(true)
    })

    it('rolls back on failure', async () => {
      vi.mocked(window.electronAPI.file.createDir).mockResolvedValue({
        success: false,
        error: { type: 'IPC_ERROR' as const, message: 'mkdir failed' },
      } as never)

      await useFileTreeStore.getState().createFolder('docs/fail')

      expect(useFileTreeStore.getState().tree).toEqual(sampleTree)
      expect(useFileTreeStore.getState().error).toBe('mkdir failed')
    })
  })

  describe('renameNode (optimistic)', () => {
    beforeEach(() => {
      useFileTreeStore.getState().setTree(sampleTree)
    })

    it('optimistically renames node', async () => {
      vi.mocked(window.electronAPI.file.move).mockResolvedValue({
        success: true,
        data: undefined,
      } as never)

      await useFileTreeStore.getState().renameNode('docs/readme.md', 'docs/intro.md')

      const tree = useFileTreeStore.getState().tree
      const docs = tree.find((n) => n.path === 'docs')
      expect(docs?.children?.some((c) => c.name === 'intro.md')).toBe(true)
      expect(docs?.children?.some((c) => c.name === 'readme.md')).toBe(false)
      expect(useFileTreeStore.getState().renamingPath).toBeNull()
    })

    it('updates selectedPath when renaming selected node', async () => {
      useFileTreeStore.getState().selectNode('docs/readme.md')

      vi.mocked(window.electronAPI.file.move).mockResolvedValue({
        success: true,
        data: undefined,
      } as never)

      await useFileTreeStore.getState().renameNode('docs/readme.md', 'docs/intro.md')
      expect(useFileTreeStore.getState().selectedPath).toBe('docs/intro.md')
    })

    it('rolls back on failure', async () => {
      vi.mocked(window.electronAPI.file.move).mockResolvedValue({
        success: false,
        error: { type: 'IPC_ERROR' as const, message: 'move failed' },
      } as never)

      await useFileTreeStore.getState().renameNode('docs/readme.md', 'docs/intro.md')

      expect(useFileTreeStore.getState().tree).toEqual(sampleTree)
      expect(useFileTreeStore.getState().error).toBe('move failed')
    })
  })

  describe('deleteNode (optimistic)', () => {
    beforeEach(() => {
      useFileTreeStore.getState().setTree(sampleTree)
    })

    it('optimistically removes file from tree', async () => {
      vi.mocked(window.electronAPI.file.delete).mockResolvedValue({
        success: true,
        data: undefined,
      } as never)

      await useFileTreeStore.getState().deleteNode(makeNode('root.md', 'file'))

      const tree = useFileTreeStore.getState().tree
      expect(tree.some((n) => n.path === 'root.md')).toBe(false)
    })

    it('optimistically removes folder from tree', async () => {
      vi.mocked(window.electronAPI.file.deleteDir).mockResolvedValue({
        success: true,
        data: undefined,
      } as never)

      await useFileTreeStore.getState().deleteNode(makeNode('docs', 'folder'))

      const tree = useFileTreeStore.getState().tree
      expect(tree.some((n) => n.path === 'docs')).toBe(false)
    })

    it('clears selectedPath when deleting selected node', async () => {
      useFileTreeStore.getState().selectNode('root.md')

      vi.mocked(window.electronAPI.file.delete).mockResolvedValue({
        success: true,
        data: undefined,
      } as never)

      await useFileTreeStore.getState().deleteNode(makeNode('root.md', 'file'))
      expect(useFileTreeStore.getState().selectedPath).toBeNull()
    })

    it('rolls back on failure', async () => {
      vi.mocked(window.electronAPI.file.delete).mockResolvedValue({
        success: false,
        error: { type: 'IPC_ERROR' as const, message: 'delete failed' },
      } as never)

      await useFileTreeStore.getState().deleteNode(makeNode('root.md', 'file'))

      expect(useFileTreeStore.getState().tree).toEqual(sampleTree)
      expect(useFileTreeStore.getState().error).toBe('delete failed')
    })
  })

  describe('moveNode (optimistic)', () => {
    beforeEach(() => {
      useFileTreeStore.getState().setTree(sampleTree)
    })

    it('optimistically moves node to target folder', async () => {
      vi.mocked(window.electronAPI.file.move).mockResolvedValue({
        success: true,
        data: undefined,
      } as never)

      await useFileTreeStore.getState().moveNode('root.md', 'docs')

      const tree = useFileTreeStore.getState().tree
      expect(tree.some((n) => n.path === 'root.md')).toBe(false)
      const docs = tree.find((n) => n.path === 'docs')
      expect(docs?.children?.some((c) => c.name === 'root.md')).toBe(true)
    })

    it('updates selectedPath after move', async () => {
      useFileTreeStore.getState().selectNode('root.md')

      vi.mocked(window.electronAPI.file.move).mockResolvedValue({
        success: true,
        data: undefined,
      } as never)

      await useFileTreeStore.getState().moveNode('root.md', 'docs')
      expect(useFileTreeStore.getState().selectedPath).toBe('docs/root.md')
    })

    it('rolls back on failure', async () => {
      vi.mocked(window.electronAPI.file.move).mockResolvedValue({
        success: false,
        error: { type: 'IPC_ERROR' as const, message: 'move failed' },
      } as never)

      await useFileTreeStore.getState().moveNode('root.md', 'docs')

      expect(useFileTreeStore.getState().tree).toEqual(sampleTree)
      expect(useFileTreeStore.getState().error).toBe('move failed')
    })
  })

  describe('rollback', () => {
    it('restores snapshot and clears it', () => {
      useFileTreeStore.getState().setTree(sampleTree)
      const snapshotBefore = sampleTree
      useFileTreeStore.getState().rollback()
      expect(useFileTreeStore.getState().tree).toEqual(snapshotBefore)
    })
  })
})
