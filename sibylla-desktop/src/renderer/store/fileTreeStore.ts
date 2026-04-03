import { create } from 'zustand'
import type { FileTreeNode } from '../components/layout/file-tree.utils'

interface FileTreeState {
  tree: FileTreeNode[]
  selectedPath: string | null
  renamingPath: string | null
  isLoading: boolean
  error: string | null
  setTree: (tree: FileTreeNode[]) => void
  setSelectedPath: (path: string | null) => void
  setRenamingPath: (path: string | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  reset: () => void
}

const initialState = {
  tree: [],
  selectedPath: null,
  renamingPath: null,
  isLoading: false,
  error: null,
}

export const useFileTreeStore = create<FileTreeState>((set) => ({
  ...initialState,
  setTree: (tree) => set({ tree }),
  setSelectedPath: (selectedPath) => set({ selectedPath }),
  setRenamingPath: (renamingPath) => set({ renamingPath }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  reset: () => set(initialState),
}))
