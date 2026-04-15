import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { FilePlus2, FolderPlus, RefreshCw } from 'lucide-react'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { InlineRenameInput } from './InlineRenameInput'
import { TreeContextMenu } from './TreeContextMenu'
import { TreeNode, type PendingCreateState } from './TreeNode'
import {
  countFolderEntries,
  findNodeByPath,
  flattenVisibleNodes,
  getBaseName,
  getParentPath,
  isCircularDrop,
  joinPath,
  type FileTreeNode,
  type VisibleTreeNode,
  validateFilename,
} from './file-tree.utils'
import { useFileTreeStore } from '../../store/fileTreeStore'

interface FileTreeProps {
  data?: FileTreeNode[]
  selectedId?: string
  defaultExpandedIds?: string[]
  onSelect?: (node: FileTreeNode) => void
  onCreateFile?: (targetPath: string) => Promise<void> | void
  onCreateFolder?: (targetPath: string) => Promise<void> | void
  onRename?: (sourcePath: string, targetPath: string) => Promise<void> | void
  onDelete?: (node: FileTreeNode) => Promise<void> | void
  onMove?: (sourcePath: string, targetFolderPath: string) => Promise<void> | void
  onRefresh?: () => Promise<void> | void
  onCopyPath?: (path: string) => Promise<void> | void
  onFolderExpand?: (folderPath: string) => Promise<void> | void
  openPaths?: string[]
  dirtyPaths?: string[]
  className?: string
}

interface ContextMenuState {
  x: number
  y: number
  node: FileTreeNode
}

const AUTO_EXPAND_DELAY_MS = 500

async function copyToClipboard(input: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(input)
    return
  }

  const textArea = document.createElement('textarea')
  textArea.value = input
  textArea.style.position = 'fixed'
  textArea.style.left = '-9999px'
  document.body.appendChild(textArea)
  textArea.focus()
  textArea.select()
  document.execCommand('copy')
  document.body.removeChild(textArea)
}

export function FileTree({
  data: dataProp,
  selectedId: selectedIdProp,
  defaultExpandedIds = [],
  onSelect,
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
  onMove,
  onRefresh,
  onCopyPath,
  onFolderExpand,
  openPaths = [],
  dirtyPaths = [],
  className,
}: FileTreeProps) {
  const storeTree = useFileTreeStore((s) => s.tree)
  const storeExpandedIds = useFileTreeStore((s) => s.expandedIds)
  const storeSelectedPath = useFileTreeStore((s) => s.selectedPath)
  const storeRenamingPath = useFileTreeStore((s) => s.renamingPath)
  const storeError = useFileTreeStore((s) => s.error)
  const storeToggleExpand = useFileTreeStore((s) => s.toggleExpand)
  const storeSelectNode = useFileTreeStore((s) => s.selectNode)
  const storeStartRename = useFileTreeStore((s) => s.startRename)
  const storeCancelRename = useFileTreeStore((s) => s.cancelRename)
  const storeSetExpandedIds = useFileTreeStore((s) => s.setExpandedIds)

  const useStore = dataProp === undefined

  const data = useStore ? storeTree : dataProp

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [pendingCreate, setPendingCreate] = useState<PendingCreateState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FileTreeNode | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [localExpandedIds, setLocalExpandedIds] = useState<Set<string>>(
    () => new Set(defaultExpandedIds)
  )
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(selectedIdProp ?? null)
  const [localRenamingPath, setLocalRenamingPath] = useState<string | null>(null)

  const effectiveExpandedIds = useStore ? storeExpandedIds : localExpandedIds
  const effectiveSelectedId = useStore
    ? (selectedIdProp ?? storeSelectedPath)
    : (selectedIdProp ?? localSelectedId)
  const effectiveRenamingPath = useStore ? storeRenamingPath : localRenamingPath

  const dragSourcePathRef = useRef<string | null>(null)
  const expandTimerRef = useRef<number | null>(null)

  const openPathSet = useMemo(() => new Set(openPaths), [openPaths])
  const dirtyPathSet = useMemo(() => new Set(dirtyPaths), [dirtyPaths])

  const visibleNodes = useMemo<VisibleTreeNode[]>(
    () => flattenVisibleNodes(data, effectiveExpandedIds),
    [data, effectiveExpandedIds]
  )

  const nodeMap = useMemo(() => {
    const map = new Map<string, FileTreeNode>()
    const visit = (nodes: FileTreeNode[]) => {
      for (const node of nodes) {
        map.set(node.path, node)
        if (node.children && node.children.length > 0) {
          visit(node.children)
        }
      }
    }
    visit(data)
    return map
  }, [data])

  useEffect(() => {
    return () => {
      if (expandTimerRef.current !== null) {
        window.clearTimeout(expandTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (defaultExpandedIds.length > 0 && effectiveExpandedIds.size === 0) {
      if (useStore) {
        storeSetExpandedIds(new Set(defaultExpandedIds))
      } else {
        setLocalExpandedIds(new Set(defaultExpandedIds))
      }
    }
  }, [defaultExpandedIds, effectiveExpandedIds.size, useStore, storeSetExpandedIds])

  const handleSelect = useCallback((node: FileTreeNode): void => {
    setActionError(null)
    if (useStore) {
      storeSelectNode(node.path)
    } else {
      setLocalSelectedId(node.path)
    }
    onSelect?.(node)
  }, [useStore, storeSelectNode, onSelect])

  const toggleExpand = useCallback((path: string): void => {
    const node = findNodeByPath(data, path)
    if (node?.type === 'folder' && !node.isLoaded) {
      onFolderExpand?.(path)
    }

    if (useStore) {
      storeToggleExpand(path)
    } else {
      setLocalExpandedIds((prev) => {
        const next = new Set(prev)
        if (next.has(path)) {
          next.delete(path)
        } else {
          next.add(path)
        }
        return next
      })
    }
  }, [useStore, storeToggleExpand, data, onFolderExpand])

  const closeContextMenu = useCallback((): void => {
    setContextMenu(null)
  }, [])

  const beginCreate = useCallback((type: 'file' | 'folder', parentPath: string): void => {
    setActionError(null)
    if (useStore) {
      storeCancelRename()
    } else {
      setLocalRenamingPath(null)
    }
    if (parentPath) {
      if (useStore) {
        const next = new Set(effectiveExpandedIds)
        next.add(parentPath)
        storeSetExpandedIds(next)
      } else {
        setLocalExpandedIds((prev) => {
          const next = new Set(prev)
          next.add(parentPath)
          return next
        })
      }
    }
    setPendingCreate({
      parentPath,
      type,
      defaultName: type === 'file' ? 'untitled.md' : 'new-folder',
    })
  }, [useStore, storeCancelRename, storeSetExpandedIds, effectiveExpandedIds])

  const beginRename = useCallback((path: string): void => {
    setActionError(null)
    setPendingCreate(null)
    if (useStore) {
      storeStartRename(path)
    } else {
      setLocalRenamingPath(path)
    }
  }, [useStore, storeStartRename])

  const submitCreate = useCallback(async (nextName: string): Promise<void> => {
    if (!pendingCreate) {
      return
    }

    const validationError = validateFilename(nextName)
    if (validationError) {
      setActionError(validationError)
      return
    }

    const targetPath = joinPath(pendingCreate.parentPath, nextName.trim())
    try {
      if (pendingCreate.type === 'file') {
        if (!onCreateFile) {
          throw new Error('当前不支持新建文件')
        }
        await onCreateFile(targetPath)
      } else {
        if (!onCreateFolder) {
          throw new Error('当前不支持新建文件夹')
        }
        await onCreateFolder(targetPath)
      }
      setPendingCreate(null)
      setActionError(null)
      if (useStore) {
        storeSelectNode(targetPath)
      } else {
        setLocalSelectedId(targetPath)
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '创建失败')
    }
  }, [pendingCreate, onCreateFile, onCreateFolder, useStore, storeSelectNode])

  const submitRename = useCallback(async (sourcePath: string, nextName: string): Promise<void> => {
    const validationError = validateFilename(nextName)
    if (validationError) {
      setActionError(validationError)
      return
    }

    const parentPath = getParentPath(sourcePath)
    const targetPath = joinPath(parentPath, nextName.trim())
    if (targetPath === sourcePath) {
      if (useStore) {
        storeCancelRename()
      } else {
        setLocalRenamingPath(null)
      }
      return
    }

    try {
      if (!onRename) {
        throw new Error('当前不支持重命名')
      }
      await onRename(sourcePath, targetPath)
      if (useStore) {
        storeCancelRename()
      } else {
        setLocalRenamingPath(null)
      }
      setActionError(null)
      if (effectiveSelectedId === sourcePath) {
        if (useStore) {
          storeSelectNode(targetPath)
        } else {
          setLocalSelectedId(targetPath)
        }
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '重命名失败')
    }
  }, [useStore, storeCancelRename, storeSelectNode, onRename, effectiveSelectedId])

  const confirmDelete = useCallback(async (): Promise<void> => {
    if (!deleteTarget) {
      return
    }

    try {
      if (!onDelete) {
        throw new Error('当前不支持删除')
      }
      await onDelete(deleteTarget)
      setDeleteTarget(null)
      setActionError(null)
      if (effectiveSelectedId === deleteTarget.path) {
        if (useStore) {
          storeSelectNode(null)
        } else {
          setLocalSelectedId(null)
        }
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '删除失败')
    }
  }, [deleteTarget, onDelete, useStore, storeSelectNode, effectiveSelectedId])

  const handleCopyPath = useCallback(async (path: string): Promise<void> => {
    try {
      if (onCopyPath) {
        await onCopyPath(path)
      } else {
        await copyToClipboard(path)
      }
      setActionError(null)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '复制路径失败')
    }
  }, [onCopyPath])

  const handleKeyNavigation = useCallback(async (event: React.KeyboardEvent): Promise<void> => {
    if (effectiveRenamingPath || pendingCreate) {
      return
    }

    const selectedPath = effectiveSelectedId
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (visibleNodes.length === 0) {
        return
      }

      const currentIndex = visibleNodes.findIndex((item) => item.node.path === selectedPath)
      const delta = event.key === 'ArrowDown' ? 1 : -1
      const nextIndex = currentIndex === -1 ? 0 : Math.max(0, Math.min(visibleNodes.length - 1, currentIndex + delta))
      const nextNode = visibleNodes[nextIndex]?.node
      if (nextNode) {
        handleSelect(nextNode)
      }
      return
    }

    if (!selectedPath) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        beginCreate('file', '')
      }
      return
    }

    const currentNode = nodeMap.get(selectedPath)
    if (!currentNode) {
      return
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      if (currentNode.type === 'folder' && !effectiveExpandedIds.has(currentNode.path)) {
        toggleExpand(currentNode.path)
      }
      return
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      if (currentNode.type === 'folder' && effectiveExpandedIds.has(currentNode.path)) {
        toggleExpand(currentNode.path)
        return
      }
      const parentPath = getParentPath(currentNode.path)
      if (!parentPath) {
        return
      }
      const parentNode = findNodeByPath(data, parentPath)
      if (parentNode) {
        handleSelect(parentNode)
      }
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      if (currentNode.type === 'folder') {
        toggleExpand(currentNode.path)
      } else {
        handleSelect(currentNode)
      }
      return
    }

    if (event.key === 'Delete') {
      event.preventDefault()
      setDeleteTarget(currentNode)
      return
    }

    if (event.key === 'F2') {
      event.preventDefault()
      beginRename(currentNode.path)
      return
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
      event.preventDefault()
      const basePath = currentNode.type === 'folder' ? currentNode.path : getParentPath(currentNode.path)
      beginCreate('file', basePath)
    }
  }, [effectiveRenamingPath, pendingCreate, effectiveSelectedId, visibleNodes, nodeMap, data, effectiveExpandedIds, handleSelect, toggleExpand, beginCreate, beginRename])

  const handleDragStart = useCallback((event: React.DragEvent, node: FileTreeNode): void => {
    dragSourcePathRef.current = node.path
    event.dataTransfer.setData('text/plain', node.path)
    event.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleDragOver = useCallback((event: React.DragEvent, node: FileTreeNode): void => {
    if (node.type !== 'folder') {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDragEnter = useCallback((_event: React.DragEvent, node: FileTreeNode): void => {
    if (node.type !== 'folder' || effectiveExpandedIds.has(node.path)) {
      return
    }
    if (expandTimerRef.current !== null) {
      window.clearTimeout(expandTimerRef.current)
    }
    expandTimerRef.current = window.setTimeout(() => {
      if (useStore) {
        const next = new Set(useFileTreeStore.getState().expandedIds)
        next.add(node.path)
        storeSetExpandedIds(next)
      } else {
        setLocalExpandedIds((prev) => {
          const next = new Set(prev)
          next.add(node.path)
          return next
        })
      }
    }, AUTO_EXPAND_DELAY_MS)
  }, [effectiveExpandedIds, useStore, storeSetExpandedIds])

  const handleDrop = useCallback(async (event: React.DragEvent, node: FileTreeNode): Promise<void> => {
    if (node.type !== 'folder') {
      return
    }
    event.preventDefault()

    const sourcePath = dragSourcePathRef.current ?? event.dataTransfer.getData('text/plain')
    if (!sourcePath || sourcePath === node.path) {
      return
    }

    if (isCircularDrop(sourcePath, node.path)) {
      setActionError('不能将文件夹拖入其子目录')
      return
    }

    try {
      if (!onMove) {
        throw new Error('当前不支持拖拽移动')
      }
      await onMove(sourcePath, node.path)
      setActionError(null)
      const newPath = joinPath(node.path, getBaseName(sourcePath))
      if (useStore) {
        storeSelectNode(newPath)
      } else {
        setLocalSelectedId(newPath)
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '移动失败')
    }
  }, [onMove, useStore, storeSelectNode])

  const rootCreateActive = pendingCreate && pendingCreate.parentPath === ''

  const displayError = actionError ?? (useStore ? storeError : null)

  return (
    <div
      className={className ?? 'w-full'}
      role="tree"
      aria-label="文件树"
      tabIndex={0}
      onKeyDown={(event) => void handleKeyNavigation(event)}
    >
      <div className="mb-2 flex items-center justify-end gap-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            beginCreate('file', '')
          }}
          title="新建文件"
        >
          <FilePlus2 className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            beginCreate('folder', '')
          }}
          title="新建文件夹"
        >
          <FolderPlus className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void onRefresh?.()
          }}
          title="刷新"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {displayError && (
        <div className="mb-2 rounded-md border border-red-700/60 bg-red-950/30 px-2 py-1 text-xs text-red-300 dark:border-red-500/40 dark:bg-red-900/20 dark:text-red-400">
          {displayError}
        </div>
      )}

      {rootCreateActive && pendingCreate && (
        <div className="mb-2 rounded-md border border-gray-200 bg-white px-2 py-1 dark:border-white/10 dark:bg-sys-black/60">
          <InlineRenameInput
            initialValue={pendingCreate.defaultName}
            className="h-7 border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-900 dark:border-white/20 dark:bg-sys-darkSurface dark:text-white"
            onCancel={() => setPendingCreate(null)}
            onSubmit={(value) => void submitCreate(value)}
          />
        </div>
      )}

      <div className="space-y-0.5">
        {data.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            level={0}
            selectedId={effectiveSelectedId}
            expandedIds={effectiveExpandedIds}
            openPaths={openPathSet}
            dirtyPaths={dirtyPathSet}
            renamingPath={effectiveRenamingPath}
            pendingCreate={pendingCreate}
            onSelect={handleSelect}
            onToggle={toggleExpand}
            onStartRename={beginRename}
            onSubmitRename={(path, nextName) => void submitRename(path, nextName)}
            onCancelRename={() => {
              if (useStore) {
                storeCancelRename()
              } else {
                setLocalRenamingPath(null)
              }
            }}
            onStartCreateFile={(parentPath) => beginCreate('file', parentPath)}
            onStartCreateFolder={(parentPath) => beginCreate('folder', parentPath)}
            onSubmitCreate={(nextName) => void submitCreate(nextName)}
            onCancelCreate={() => setPendingCreate(null)}
            onContextMenu={(event, targetNode) => {
              event.preventDefault()
              setContextMenu({
                x: event.clientX,
                y: event.clientY,
                node: targetNode,
              })
              handleSelect(targetNode)
            }}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDrop={(event, targetNode) => void handleDrop(event, targetNode)}
          />
        ))}
      </div>

      {contextMenu && (
        <TreeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          onClose={closeContextMenu}
          onRename={() => beginRename(contextMenu.node.path)}
          onCopyPath={() => void handleCopyPath(contextMenu.node.path)}
          onDelete={() => setDeleteTarget(contextMenu.node)}
          onCreateFile={() => beginCreate('file', contextMenu.node.type === 'folder' ? contextMenu.node.path : getParentPath(contextMenu.node.path))}
          onCreateFolder={() => beginCreate('folder', contextMenu.node.type === 'folder' ? contextMenu.node.path : getParentPath(contextMenu.node.path))}
        />
      )}

      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="确认删除"
        description={
          deleteTarget
            ? deleteTarget.type === 'folder'
              ? `将删除文件夹「${deleteTarget.name}」及其 ${countFolderEntries(deleteTarget)} 个子项。`
              : `确认删除文件「${deleteTarget.name}」？`
            : undefined
        }
      >
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
            取消
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              void confirmDelete()
            }}
          >
            删除
          </Button>
        </div>
      </Modal>
    </div>
  )
}

export type { FileTreeNode } from './file-tree.utils'
