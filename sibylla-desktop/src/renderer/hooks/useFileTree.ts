import { useCallback } from 'react'
import { useFileTreeStore } from '../store/fileTreeStore'
import {
  buildTreeFromFiles,
  sortTreeNodes,
  expandNodeInTree,
  findNodeByPath,
  normalizePath,
  validateFilename,
  isCircularDrop,
} from '../components/layout/file-tree.utils'
import type { FileTreeNode } from '../components/layout/file-tree.utils'

export function useFileTree() {
  const tree = useFileTreeStore((s) => s.tree)
  const expandedIds = useFileTreeStore((s) => s.expandedIds)
  const selectedPath = useFileTreeStore((s) => s.selectedPath)
  const renamingPath = useFileTreeStore((s) => s.renamingPath)
  const isLoading = useFileTreeStore((s) => s.isLoading)
  const error = useFileTreeStore((s) => s.error)

  const loadTree = useCallback(async () => {
    const store = useFileTreeStore.getState()
    store.setError(null)
    useFileTreeStore.setState({ isLoading: true })

    try {
      const result = await window.electronAPI.file.list('', {
        recursive: false,
        includeHidden: false,
      })
      if (!result.success || !result.data) {
        useFileTreeStore.setState({ tree: [], error: result.error?.message ?? '文件树加载失败' })
        return
      }

      const built = buildTreeFromFiles(result.data)
      useFileTreeStore.setState({ tree: built, expandedIds: new Set<string>() })
    } catch (err) {
      useFileTreeStore.setState({
        tree: [],
        error: err instanceof Error ? err.message : '文件树加载失败',
      })
    } finally {
      useFileTreeStore.setState({ isLoading: false })
    }
  }, [])

  const loadFolderChildren = useCallback(async (folderPath: string) => {
    const normalized = normalizePath(folderPath)
    const store = useFileTreeStore.getState()
    const node = findNodeByPath(store.tree, normalized)
    if (!node || node.type !== 'folder') return

    if (node.isLoaded) {
      store.toggleExpand(normalized)
      return
    }

    try {
      const result = await window.electronAPI.file.list(normalized, {
        recursive: false,
        includeHidden: false,
      })
      if (!result.success || !result.data) {
        store.setError(result.error?.message ?? '文件夹加载失败')
        return
      }

      const children: FileTreeNode[] = result.data.map((f) => ({
        id: normalizePath(f.path),
        name: f.name,
        type: f.isDirectory ? 'folder' : 'file',
        children: f.isDirectory ? [] : undefined,
        path: normalizePath(f.path),
        depth: (node.depth ?? 0) + 1,
      }))

      const sortedChildren = sortTreeNodes(children)
      const updatedTree = expandNodeInTree(store.tree, normalized, sortedChildren)
      const nextExpanded = new Set(store.expandedIds)
      nextExpanded.add(normalized)

      useFileTreeStore.setState({
        tree: updatedTree,
        expandedIds: nextExpanded,
      })
    } catch (err) {
      store.setError(err instanceof Error ? err.message : '文件夹加载失败')
    }
  }, [])

  const refreshSubtree = useCallback(async (folderPath: string) => {
    const normalized = normalizePath(folderPath)
    const store = useFileTreeStore.getState()
    const node = findNodeByPath(store.tree, normalized)
    if (!node || node.type !== 'folder') return

    try {
      const result = await window.electronAPI.file.list(normalized, {
        recursive: false,
        includeHidden: false,
      })
      if (!result.success || !result.data) {
        store.setError(result.error?.message ?? '刷新文件夹失败')
        return
      }

      const children: FileTreeNode[] = result.data.map((f) => ({
        id: normalizePath(f.path),
        name: f.name,
        type: f.isDirectory ? 'folder' : 'file',
        children: f.isDirectory ? [] : undefined,
        path: normalizePath(f.path),
        depth: (node.depth ?? 0) + 1,
      }))

      const sortedChildren = sortTreeNodes(children)
      const updatedTree = expandNodeInTree(store.tree, normalized, sortedChildren)
      useFileTreeStore.setState({ tree: updatedTree })
    } catch (err) {
      store.setError(err instanceof Error ? err.message : '刷新文件夹失败')
    }
  }, [])

  const refreshTree = useCallback(async () => {
    const store = useFileTreeStore.getState()
    store.setError(null)
    useFileTreeStore.setState({ isLoading: true })

    try {
      const result = await window.electronAPI.file.list('', {
        recursive: true,
        includeHidden: false,
      })
      if (!result.success || !result.data) {
        useFileTreeStore.setState({ error: result.error?.message ?? '文件树加载失败' })
        return
      }
      const built = buildTreeFromFiles(result.data)
      useFileTreeStore.setState({ tree: built })
    } catch (err) {
      useFileTreeStore.setState({
        error: err instanceof Error ? err.message : '文件树加载失败',
      })
    } finally {
      useFileTreeStore.setState({ isLoading: false })
    }
  }, [])

  return {
    tree,
    expandedIds,
    selectedPath,
    renamingPath,
    isLoading,
    error,
    loadTree,
    loadFolderChildren,
    refreshSubtree,
    refreshTree,
    validateFilename,
    isCircularDrop,
  }
}
