import { useCallback } from 'react'
import { useFileTreeStore } from '../store/fileTreeStore'
import {
  buildTreeFromFiles,
  isCircularDrop,
  validateFilename,
} from '../components/layout/file-tree.utils'

/**
 * useFileTree
 *
 * Small helper hook around file tree state + IPC loading.
 * This keeps file tree loading and error handling reusable across pages.
 */
export function useFileTree() {
  const tree = useFileTreeStore((state) => state.tree)
  const selectedPath = useFileTreeStore((state) => state.selectedPath)
  const renamingPath = useFileTreeStore((state) => state.renamingPath)
  const isLoading = useFileTreeStore((state) => state.isLoading)
  const error = useFileTreeStore((state) => state.error)
  const setTree = useFileTreeStore((state) => state.setTree)
  const setSelectedPath = useFileTreeStore((state) => state.setSelectedPath)
  const setRenamingPath = useFileTreeStore((state) => state.setRenamingPath)
  const setLoading = useFileTreeStore((state) => state.setLoading)
  const setError = useFileTreeStore((state) => state.setError)

  const loadTree = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.file.list('', {
        recursive: true,
        includeHidden: false,
      })

      if (!result.success || !result.data) {
        setTree([])
        setError(result.error?.message ?? '文件树加载失败')
        return
      }

      setTree(buildTreeFromFiles(result.data))
    } catch (error) {
      setTree([])
      setError(error instanceof Error ? error.message : '文件树加载失败')
    } finally {
      setLoading(false)
    }
  }, [setError, setLoading, setTree])

  return {
    tree,
    selectedPath,
    renamingPath,
    isLoading,
    error,
    setSelectedPath,
    setRenamingPath,
    setError,
    loadTree,
    validateFilename,
    isCircularDrop,
  }
}
