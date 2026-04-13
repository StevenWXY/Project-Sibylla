import type { FileInfo as WorkspaceFileInfo } from '../../../shared/types'

export interface FileTreeNode {
  id: string
  name: string
  type: 'file' | 'folder'
  children?: FileTreeNode[]
  path: string
  depth?: number
}

export interface VisibleTreeNode {
  node: FileTreeNode
  depth: number
}

export function normalizePath(inputPath: string): string {
  return inputPath.replaceAll('\\', '/').replace(/^\/+/, '')
}

export function getParentPath(inputPath: string): string {
  const normalized = normalizePath(inputPath)
  const segments = normalized.split('/').filter(Boolean)
  if (segments.length <= 1) {
    return ''
  }
  return segments.slice(0, -1).join('/')
}

export function joinPath(parentPath: string, childName: string): string {
  const cleanParent = normalizePath(parentPath)
  const cleanChild = normalizePath(childName)
  if (!cleanParent) {
    return cleanChild
  }
  return `${cleanParent}/${cleanChild}`
}

export function getBaseName(inputPath: string): string {
  const normalized = normalizePath(inputPath)
  const segments = normalized.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? normalized
}

export function buildTreeFromFiles(files: WorkspaceFileInfo[]): FileTreeNode[] {
  const nodeMap = new Map<string, FileTreeNode>()

  for (const file of files) {
    const normalizedPath = normalizePath(file.path)
    const depth = normalizedPath.split('/').filter(Boolean).length - 1

    nodeMap.set(normalizedPath, {
      id: normalizedPath,
      name: file.name,
      path: normalizedPath,
      type: file.isDirectory ? 'folder' : 'file',
      children: file.isDirectory ? [] : undefined,
      depth: Math.max(0, depth),
    })
  }

  const roots: FileTreeNode[] = []
  for (const [nodePath, node] of nodeMap) {
    const parentPath = getParentPath(nodePath)
    if (!parentPath) {
      roots.push(node)
      continue
    }

    const parentNode = nodeMap.get(parentPath)
    if (parentNode?.type === 'folder') {
      const children = parentNode.children ?? []
      children.push(node)
      parentNode.children = children
      continue
    }

    roots.push(node)
  }

  return sortTreeNodes(roots)
}

export function sortTreeNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children: node.children ? sortTreeNodes(node.children) : undefined,
    }))
    .sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1
      }
      return a.name.localeCompare(b.name, 'zh-CN')
    })
}

export function flattenVisibleNodes(
  nodes: FileTreeNode[],
  expandedIds: ReadonlySet<string>
): VisibleTreeNode[] {
  const output: VisibleTreeNode[] = []

  const visit = (inputNodes: FileTreeNode[]) => {
    for (const node of inputNodes) {
      output.push({ node, depth: node.depth ?? 0 })

      const isExpanded = expandedIds.has(node.id)
      if (node.type === 'folder' && isExpanded && node.children && node.children.length > 0) {
        visit(node.children)
      }
    }
  }

  visit(nodes)
  return output
}

export function findNodeByPath(nodes: FileTreeNode[], targetPath: string): FileTreeNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) {
      return node
    }
    if (node.children && node.children.length > 0) {
      const matched = findNodeByPath(node.children, targetPath)
      if (matched) {
        return matched
      }
    }
  }
  return null
}

export function countFolderEntries(node: FileTreeNode): number {
  if (node.type !== 'folder') {
    return 0
  }

  let count = node.children?.length ?? 0
  for (const child of node.children ?? []) {
    if (child.type === 'folder') {
      count += countFolderEntries(child)
    }
  }
  return count
}

export function validateFilename(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) {
    return '文件名不能为空'
  }
  if (trimmed.length > 255) {
    return '文件名不能超过 255 个字符'
  }
  if (/[/\\:*?"<>|]/.test(trimmed)) {
    return '文件名包含非法字符'
  }
  if (trimmed === '.') {
    return '文件名不能仅为点号'
  }
  return null
}

export function isCircularDrop(sourcePath: string, targetPath: string): boolean {
  const source = normalizePath(sourcePath)
  const target = normalizePath(targetPath)
  return target.startsWith(`${source}/`)
}

export function toDepthPadding(depth: number): number {
  return depth * 16 + 8
}
