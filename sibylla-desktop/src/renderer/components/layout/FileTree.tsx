import React, { useState, useCallback } from 'react'
import { Folder, FolderOpen, File, ChevronRight, ChevronDown } from 'lucide-react'
import { cn } from '../../utils/cn'

/**
 * 文件树节点数据结构
 */
export interface FileTreeNode {
  id: string
  name: string
  type: 'file' | 'folder'
  children?: FileTreeNode[]
  path: string
}

/**
 * FileTree - 文件树组件
 * 
 * 特性：
 * - 递归渲染文件和文件夹
 * - 支持展开/折叠文件夹
 * - 支持文件选择
 * - Notion 风格设计
 * - 键盘导航支持
 * 
 * 性能优化：
 * - 使用 Set 存储展开状态，O(1) 查找
 * - useCallback 缓存事件处理器
 * - React.memo 优化子组件渲染
 * 
 * @example
 * <FileTree
 *   data={fileTreeData}
 *   selectedId="file-1"
 *   onSelect={(node) => console.log(node)}
 * />
 */
interface FileTreeProps {
  data: FileTreeNode[]
  selectedId?: string
  defaultExpandedIds?: string[]
  onSelect?: (node: FileTreeNode) => void
  className?: string
}

export function FileTree({
  data,
  selectedId,
  defaultExpandedIds = [],
  onSelect,
  className
}: FileTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(defaultExpandedIds)
  )
  
  /**
   * 切换文件夹展开/折叠状态
   */
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])
  
  /**
   * 处理节点选择
   */
  const handleSelect = useCallback((node: FileTreeNode) => {
    if (node.type === 'folder') {
      toggleExpand(node.id)
    }
    onSelect?.(node)
  }, [onSelect, toggleExpand])
  
  return (
    <div className={cn('w-full', className)} role="tree" aria-label="文件树">
      {data.map((node) => (
        <FileTreeItem
          key={node.id}
          node={node}
          level={0}
          expandedIds={expandedIds}
          selectedId={selectedId}
          onToggle={toggleExpand}
          onSelect={handleSelect}
        />
      ))}
    </div>
  )
}

/**
 * FileTreeItem - 文件树节点组件
 *
 * 使用 React.memo 优化性能，避免不必要的重渲染
 */
interface FileTreeItemProps {
  node: FileTreeNode
  level: number
  expandedIds: Set<string>
  selectedId?: string
  onToggle: (id: string) => void
  onSelect: (node: FileTreeNode) => void
}

const FileTreeItem = React.memo(function FileTreeItem({
  node,
  level,
  expandedIds,
  selectedId,
  onToggle,
  onSelect
}: FileTreeItemProps) {
  const expanded = expandedIds.has(node.id)
  const selected = selectedId === node.id
  const isFolder = node.type === 'folder'
  const hasChildren = isFolder && node.children && node.children.length > 0
  
  /**
   * 处理点击事件
   */
  const handleClick = useCallback(() => {
    onSelect(node)
  }, [node, onSelect])
  
  /**
   * 处理展开/折叠按钮点击
   */
  const handleToggleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onToggle(node.id)
  }, [node.id, onToggle])
  
  /**
   * 处理键盘事件
   */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    } else if (e.key === 'ArrowRight' && isFolder && !expanded) {
      e.preventDefault()
      onToggle(node.id)
    } else if (e.key === 'ArrowLeft' && isFolder && expanded) {
      e.preventDefault()
      onToggle(node.id)
    }
  }, [handleClick, isFolder, expanded, node.id, onToggle])
  
  /**
   * 获取文件/文件夹图标
   */
  const getIcon = () => {
    if (isFolder) {
      return expanded ? (
        <FolderOpen size={16} className="text-notion-accent dark:text-notion-accent" />
      ) : (
        <Folder size={16} className="text-notion-text-secondary dark:text-gray-400" />
      )
    }
    return <File size={16} className="text-notion-text-secondary dark:text-gray-400" />
  }
  
  return (
    <div role="treeitem" aria-expanded={isFolder ? expanded : undefined}>
      {/* 节点内容 */}
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1.5 rounded-md cursor-pointer',
          'transition-colors duration-150',
          'hover:bg-notion-bg-secondary dark:hover:bg-gray-800',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-notion-accent',
          selected && 'bg-notion-bg-secondary dark:bg-gray-800 text-notion-accent dark:text-notion-accent font-medium',
          !selected && 'text-notion-text-primary dark:text-gray-300'
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-label={`${node.type === 'folder' ? '文件夹' : '文件'}: ${node.name}`}
        aria-selected={selected}
      >
        {/* 展开/折叠按钮 */}
        {hasChildren ? (
          <button
            onClick={handleToggleClick}
            className="shrink-0 p-0.5 rounded hover:bg-notion-border-light dark:hover:bg-gray-700 transition-colors"
            aria-label={expanded ? '折叠' : '展开'}
            tabIndex={-1}
          >
            {expanded ? (
              <ChevronDown size={14} className="text-notion-text-secondary dark:text-gray-400" />
            ) : (
              <ChevronRight size={14} className="text-notion-text-secondary dark:text-gray-400" />
            )}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        
        {/* 图标 */}
        <span className="shrink-0">{getIcon()}</span>
        
        {/* 文件/文件夹名称 */}
        <span className="text-sm truncate flex-1">{node.name}</span>
      </div>
      
      {/* 子节点（递归渲染） */}
      {isFolder && expanded && hasChildren && (
        <div role="group">
          {node.children!.map((child) => (
            <FileTreeItem
              key={child.id}
              node={child}
              level={level + 1}
              expandedIds={expandedIds}
              selectedId={selectedId}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
})
