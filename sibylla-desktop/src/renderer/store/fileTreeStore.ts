import { create } from 'zustand'
import {
  cloneTree,
  removeNodeFromTree,
  insertNodeToTree,
  renameNodeInTree,
  findNodeByPath,
  getParentPath,
  getBaseName,
  joinPath,
  normalizePath,
} from '../components/layout/file-tree.utils'
import type { FileTreeNode } from '../components/layout/file-tree.utils'

interface FileTreeState {
  tree: FileTreeNode[]
  expandedIds: Set<string>
  selectedPath: string | null
  renamingPath: string | null
  isLoading: boolean
  error: string | null
  snapshot: FileTreeNode[] | null

  setTree: (tree: FileTreeNode[]) => void
  setExpandedIds: (ids: Set<string>) => void
  toggleExpand: (path: string) => void
  selectNode: (path: string | null) => void
  startRename: (path: string) => void
  cancelRename: () => void
  setError: (error: string | null) => void

  createFile: (targetPath: string) => Promise<void>
  createFolder: (targetPath: string) => Promise<void>
  renameNode: (sourcePath: string, targetPath: string) => Promise<void>
  deleteNode: (node: FileTreeNode) => Promise<void>
  moveNode: (sourcePath: string, targetFolderPath: string) => Promise<void>

  rollback: () => void
  reset: () => void
}

const initialState = {
  tree: [],
  expandedIds: new Set<string>(),
  selectedPath: null as string | null,
  renamingPath: null as string | null,
  isLoading: false,
  error: null as string | null,
  snapshot: null as FileTreeNode[] | null,
}

export const useFileTreeStore = create<FileTreeState>((set, get) => ({
  ...initialState,

  setTree: (tree) => set({ tree }),

  setExpandedIds: (expandedIds) => set({ expandedIds }),

  toggleExpand: (path) => {
    const current = get().expandedIds
    const next = new Set(current)
    if (next.has(path)) {
      next.delete(path)
    } else {
      next.add(path)
    }
    set({ expandedIds: next })
  },

  selectNode: (selectedPath) => set({ selectedPath }),

  startRename: (renamingPath) => set({ renamingPath }),

  cancelRename: () => set({ renamingPath: null }),

  setError: (error) => set({ error }),

  createFile: async (targetPath) => {
    const normalized = normalizePath(targetPath)
    const parentPath = getParentPath(normalized)
    const name = getBaseName(normalized)
    const newNode: FileTreeNode = {
      id: normalized,
      name,
      type: 'file',
      path: normalized,
      depth: parentPath ? (findNodeByPath(get().tree, parentPath)?.depth ?? 0) + 1 : 0,
    }

    const snapshot = cloneTree(get().tree)
    const optimisticTree = insertNodeToTree(get().tree, parentPath, newNode)
    set({ tree: optimisticTree, snapshot, error: null })

    try {
      const initialContent = `# ${name.replace(/\.md$/i, '')}\n\n`
      const response = await window.electronAPI.file.write(normalized, initialContent, {
        atomic: true,
        createDirs: true,
      })
      if (!response.success) {
        get().rollback()
        set({ error: response.error?.message ?? '创建文件失败' })
        return
      }
      set({ snapshot: null, selectedPath: normalized })
    } catch (error) {
      get().rollback()
      set({ error: error instanceof Error ? error.message : '创建文件失败' })
    }
  },

  createFolder: async (targetPath) => {
    const normalized = normalizePath(targetPath)
    const parentPath = getParentPath(normalized)
    const name = getBaseName(normalized)
    const newNode: FileTreeNode = {
      id: normalized,
      name,
      type: 'folder',
      children: [],
      path: normalized,
      depth: parentPath ? (findNodeByPath(get().tree, parentPath)?.depth ?? 0) + 1 : 0,
    }

    const snapshot = cloneTree(get().tree)
    const optimisticTree = insertNodeToTree(get().tree, parentPath, newNode)
    set({ tree: optimisticTree, snapshot, error: null })

    try {
      const response = await window.electronAPI.file.createDir(normalized, true)
      if (!response.success) {
        get().rollback()
        set({ error: response.error?.message ?? '创建文件夹失败' })
        return
      }
      set({ snapshot: null })
    } catch (error) {
      get().rollback()
      set({ error: error instanceof Error ? error.message : '创建文件夹失败' })
    }
  },

  renameNode: async (sourcePath, targetPath) => {
    const normalizedSource = normalizePath(sourcePath)
    const normalizedTarget = normalizePath(targetPath)
    const newName = getBaseName(normalizedTarget)

    const snapshot = cloneTree(get().tree)
    const optimisticTree = renameNodeInTree(get().tree, normalizedSource, normalizedTarget, newName)
    set({ tree: optimisticTree, snapshot, error: null, renamingPath: null })

    try {
      const response = await window.electronAPI.file.move(normalizedSource, normalizedTarget)
      if (!response.success) {
        get().rollback()
        set({ error: response.error?.message ?? '重命名失败' })
        return
      }
      const { selectedPath } = get()
      if (selectedPath === normalizedSource) {
        set({ selectedPath: normalizedTarget })
      }
      set({ snapshot: null })
    } catch (error) {
      get().rollback()
      set({ error: error instanceof Error ? error.message : '重命名失败' })
    }
  },

  deleteNode: async (node) => {
    const snapshot = cloneTree(get().tree)
    const optimisticTree = removeNodeFromTree(get().tree, node.path)
    set({ tree: optimisticTree, snapshot, error: null })

    try {
      const response =
        node.type === 'folder'
          ? await window.electronAPI.file.deleteDir(node.path, true)
          : await window.electronAPI.file.delete(node.path)
      if (!response.success) {
        get().rollback()
        set({ error: response.error?.message ?? '删除失败' })
        return
      }
      const { selectedPath } = get()
      if (selectedPath === node.path) {
        set({ selectedPath: null })
      }
      set({ snapshot: null })
    } catch (error) {
      get().rollback()
      set({ error: error instanceof Error ? error.message : '删除失败' })
    }
  },

  moveNode: async (sourcePath, targetFolderPath) => {
    const normalizedSource = normalizePath(sourcePath)
    const normalizedTarget = normalizePath(targetFolderPath)
    const name = getBaseName(normalizedSource)
    const newPath = joinPath(normalizedTarget, name)

    const snapshot = cloneTree(get().tree)
    const treeAfterRemove = removeNodeFromTree(get().tree, normalizedSource)
    const movedNode: FileTreeNode = {
      id: newPath,
      name,
      type: findNodeByPath(get().tree, normalizedSource)?.type ?? 'file',
      path: newPath,
      depth: (findNodeByPath(get().tree, normalizedTarget)?.depth ?? 0) + 1,
    }
    const optimisticTree = insertNodeToTree(treeAfterRemove, normalizedTarget, movedNode)
    set({ tree: optimisticTree, snapshot, error: null })

    try {
      const response = await window.electronAPI.file.move(normalizedSource, newPath)
      if (!response.success) {
        get().rollback()
        set({ error: response.error?.message ?? '移动失败' })
        return
      }
      const { selectedPath } = get()
      if (selectedPath === normalizedSource) {
        set({ selectedPath: newPath })
      }
      set({ snapshot: null })
    } catch (error) {
      get().rollback()
      set({ error: error instanceof Error ? error.message : '移动失败' })
    }
  },

  rollback: () => {
    const { snapshot } = get()
    if (snapshot) {
      set({ tree: snapshot, snapshot: null })
    }
  },

  reset: () => set(initialState),
}))
