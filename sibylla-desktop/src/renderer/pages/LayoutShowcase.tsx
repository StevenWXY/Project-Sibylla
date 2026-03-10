import React, { useState } from 'react'
import { FileTree, FileTreeNode } from '../components/layout/FileTree'
import { Button } from '../components/ui'

/**
 * LayoutShowcase - 布局组件展示页面
 * 
 * 展示内容：
 * - FileTree 文件树组件
 * - 响应式布局验证
 * - 玻璃拟态效果展示
 */
export function LayoutShowcase() {
  const [selectedNode, setSelectedNode] = useState<FileTreeNode | null>(null)
  
  // 模拟文件树数据
  const mockFileTree: FileTreeNode[] = [
    {
      id: 'root',
      name: 'Sibylla Workspace',
      type: 'folder',
      path: '/',
      children: [
        {
          id: 'docs',
          name: 'docs',
          type: 'folder',
          path: '/docs',
          children: [
            {
              id: 'readme',
              name: 'README.md',
              type: 'file',
              path: '/docs/README.md'
            },
            {
              id: 'guide',
              name: 'guide.md',
              type: 'file',
              path: '/docs/guide.md'
            }
          ]
        },
        {
          id: 'specs',
          name: 'specs',
          type: 'folder',
          path: '/specs',
          children: [
            {
              id: 'design',
              name: 'design',
              type: 'folder',
              path: '/specs/design',
              children: [
                {
                  id: 'architecture',
                  name: 'architecture.md',
                  type: 'file',
                  path: '/specs/design/architecture.md'
                },
                {
                  id: 'ui-ux',
                  name: 'ui-ux-design.md',
                  type: 'file',
                  path: '/specs/design/ui-ux-design.md'
                }
              ]
            },
            {
              id: 'requirements',
              name: 'requirements',
              type: 'folder',
              path: '/specs/requirements',
              children: [
                {
                  id: 'phase0',
                  name: 'phase0',
                  type: 'folder',
                  path: '/specs/requirements/phase0',
                  children: [
                    {
                      id: 'infra',
                      name: 'infrastructure-setup.md',
                      type: 'file',
                      path: '/specs/requirements/phase0/infrastructure-setup.md'
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          id: 'personal',
          name: 'personal',
          type: 'folder',
          path: '/personal',
          children: [
            {
              id: 'notes',
              name: 'notes.md',
              type: 'file',
              path: '/personal/notes.md'
            }
          ]
        },
        {
          id: 'claude',
          name: 'CLAUDE.md',
          type: 'file',
          path: '/CLAUDE.md'
        }
      ]
    }
  ]
  
  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <div>
        <h1 className="text-3xl font-bold text-notion-text-primary dark:text-white mb-2">
          布局组件展示
        </h1>
        <p className="text-notion-text-secondary dark:text-gray-400">
          展示 Sibylla 的核心布局组件和交互效果
        </p>
      </div>
      
      {/* FileTree 组件展示 */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-notion-text-primary dark:text-white mb-1">
            FileTree 文件树组件
          </h2>
          <p className="text-sm text-notion-text-secondary dark:text-gray-400">
            支持展开/折叠、文件选择、键盘导航（Enter/Space 选择，← → 展开/折叠）
          </p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 文件树 */}
          <div className="glass rounded-lg p-4 border border-notion-border-light dark:border-gray-700">
            <h3 className="text-sm font-medium text-notion-text-primary dark:text-white mb-3">
              文件树
            </h3>
            <div className="max-h-96 overflow-y-auto">
              <FileTree
                data={mockFileTree}
                selectedId={selectedNode?.id}
                onSelect={setSelectedNode}
              />
            </div>
          </div>
          
          {/* 选中信息 */}
          <div className="glass rounded-lg p-4 border border-notion-border-light dark:border-gray-700">
            <h3 className="text-sm font-medium text-notion-text-primary dark:text-white mb-3">
              选中节点信息
            </h3>
            {selectedNode ? (
              <div className="space-y-3">
                <div>
                  <span className="text-xs text-notion-text-secondary dark:text-gray-400">类型</span>
                  <p className="text-sm text-notion-text-primary dark:text-white mt-1">
                    {selectedNode.type === 'folder' ? '📁 文件夹' : '📄 文件'}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-notion-text-secondary dark:text-gray-400">名称</span>
                  <p className="text-sm text-notion-text-primary dark:text-white mt-1 font-mono">
                    {selectedNode.name}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-notion-text-secondary dark:text-gray-400">路径</span>
                  <p className="text-sm text-notion-text-primary dark:text-white mt-1 font-mono break-all">
                    {selectedNode.path}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-notion-text-secondary dark:text-gray-400">ID</span>
                  <p className="text-xs text-notion-text-secondary dark:text-gray-400 mt-1 font-mono">
                    {selectedNode.id}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedNode(null)}
                  className="w-full mt-2"
                >
                  清除选择
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 text-notion-text-secondary dark:text-gray-400">
                <p className="text-sm">点击文件树中的节点查看详情</p>
              </div>
            )}
          </div>
        </div>
      </section>
      
      {/* 玻璃拟态效果展示 */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-notion-text-primary dark:text-white mb-1">
            玻璃拟态效果
          </h2>
          <p className="text-sm text-notion-text-secondary dark:text-gray-400">
            Notion 风格的玻璃拟态设计，支持亮色/暗色主题
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass rounded-lg p-6 border border-notion-border-light dark:border-gray-700">
            <h3 className="text-sm font-medium text-notion-text-primary dark:text-white mb-2">
              卡片 1
            </h3>
            <p className="text-sm text-notion-text-secondary dark:text-gray-400">
              backdrop-filter: blur(20px)
            </p>
          </div>
          
          <div className="glass rounded-lg p-6 border border-notion-border-light dark:border-gray-700">
            <h3 className="text-sm font-medium text-notion-text-primary dark:text-white mb-2">
              卡片 2
            </h3>
            <p className="text-sm text-notion-text-secondary dark:text-gray-400">
              background: rgba(255, 255, 255, 0.7)
            </p>
          </div>
          
          <div className="glass rounded-lg p-6 border border-notion-border-light dark:border-gray-700">
            <h3 className="text-sm font-medium text-notion-text-primary dark:text-white mb-2">
              卡片 3
            </h3>
            <p className="text-sm text-notion-text-secondary dark:text-gray-400">
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05)
            </p>
          </div>
        </div>
      </section>
      
      {/* 响应式布局验证 */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-notion-text-primary dark:text-white mb-1">
            响应式布局
          </h2>
          <p className="text-sm text-notion-text-secondary dark:text-gray-400">
            支持多种屏幕尺寸：375px（移动端）、768px（平板）、1024px（桌面）、1440px（大屏）
          </p>
        </div>
        
        <div className="glass rounded-lg p-6 border border-notion-border-light dark:border-gray-700">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-notion-bg-secondary dark:bg-gray-800 rounded-lg">
              <p className="text-xs text-notion-text-secondary dark:text-gray-400 mb-1">移动端</p>
              <p className="text-sm font-medium text-notion-text-primary dark:text-white">≥ 375px</p>
            </div>
            <div className="p-4 bg-notion-bg-secondary dark:bg-gray-800 rounded-lg">
              <p className="text-xs text-notion-text-secondary dark:text-gray-400 mb-1">平板</p>
              <p className="text-sm font-medium text-notion-text-primary dark:text-white">≥ 768px</p>
            </div>
            <div className="p-4 bg-notion-bg-secondary dark:bg-gray-800 rounded-lg">
              <p className="text-xs text-notion-text-secondary dark:text-gray-400 mb-1">桌面</p>
              <p className="text-sm font-medium text-notion-text-primary dark:text-white">≥ 1024px</p>
            </div>
            <div className="p-4 bg-notion-bg-secondary dark:bg-gray-800 rounded-lg">
              <p className="text-xs text-notion-text-secondary dark:text-gray-400 mb-1">大屏</p>
              <p className="text-sm font-medium text-notion-text-primary dark:text-white">≥ 1440px</p>
            </div>
          </div>
        </div>
      </section>
      
      {/* 性能优化说明 */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-notion-text-primary dark:text-white mb-1">
            性能优化
          </h2>
          <p className="text-sm text-notion-text-secondary dark:text-gray-400">
            应用 Vercel React 最佳实践
          </p>
        </div>
        
        <div className="glass rounded-lg p-6 border border-notion-border-light dark:border-gray-700">
          <ul className="space-y-2 text-sm text-notion-text-primary dark:text-white">
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>使用 React.memo 优化组件重渲染</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>使用 useCallback 缓存事件处理器</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>使用 Zustand 选择器最小化状态订阅</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>CSS transitions 替代 JS 动画</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>使用 Set 数据结构实现 O(1) 查找</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✓</span>
              <span>避免不必要的 DOM 操作和重排</span>
            </li>
          </ul>
        </div>
      </section>
    </div>
  )
}
