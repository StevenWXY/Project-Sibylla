import React, { useState } from 'react'
import { ThemeProvider } from './components/providers/ThemeProvider'
import { AppLayout } from './components/layout/AppLayout'
import { ComponentShowcase } from './pages/ComponentShowcase'
import { ThemeShowcase } from './pages/ThemeShowcase'
import { LayoutShowcase } from './pages/LayoutShowcase'
import UIComponentsShowcase from './pages/UIComponentsShowcase'
import { CreateWorkspaceWizard } from './components/workspace/CreateWorkspaceWizard'
import { OpenWorkspaceDialog } from './components/workspace/OpenWorkspaceDialog'
import { useAppStore } from './store/appStore'

type Page = 'home' | 'components' | 'theme' | 'layout' | 'ui-components' | 'workspace'

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home')
  const [showCreateWizard, setShowCreateWizard] = useState(false)
  const [showOpenDialog, setShowOpenDialog] = useState(false)
  const currentWorkspace = useAppStore((state) => state.currentWorkspace)

  const renderPage = () => {
    switch (currentPage) {
      case 'components':
        return <ComponentShowcase />
      case 'theme':
        return <ThemeShowcase />
      case 'layout':
        return <LayoutShowcase />
      case 'ui-components':
        return <UIComponentsShowcase />
      case 'workspace':
        return (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold text-notion-text-primary dark:text-white">
              Workspace 管理
            </h1>
            
            {currentWorkspace ? (
              <div className="glass rounded-xl p-6">
                <h2 className="mb-4 text-xl font-semibold text-notion-text-primary dark:text-white">
                  当前 Workspace
                </h2>
                <div className="space-y-2">
                  <p className="text-notion-text-primary dark:text-white">
                    <span className="font-semibold">名称：</span>
                    {currentWorkspace.config.name}
                  </p>
                  <p className="text-notion-text-secondary dark:text-gray-400">
                    <span className="font-semibold">描述：</span>
                    {currentWorkspace.config.description || '无'}
                  </p>
                  <p className="text-notion-text-secondary dark:text-gray-400">
                    <span className="font-semibold">路径：</span>
                    {currentWorkspace.metadata.path}
                  </p>
                  <p className="text-notion-text-secondary dark:text-gray-400">
                    <span className="font-semibold">ID：</span>
                    {currentWorkspace.config.workspaceId}
                  </p>
                </div>
              </div>
            ) : (
              <div className="glass rounded-xl p-6">
                <p className="mb-4 text-notion-text-secondary dark:text-gray-400">
                  当前没有打开的 Workspace
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCreateWizard(true)}
                    className="rounded-lg bg-notion-accent px-4 py-2 text-white transition-colors hover:bg-notion-accent/90"
                  >
                    创建新 Workspace
                  </button>
                  <button
                    onClick={() => setShowOpenDialog(true)}
                    className="rounded-lg border border-notion-border-default px-4 py-2 text-notion-text-primary transition-colors hover:bg-notion-bg-secondary dark:border-gray-700 dark:text-white dark:hover:bg-gray-800"
                  >
                    打开现有 Workspace
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      default:
        return (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold text-notion-text-primary dark:text-white">
              欢迎使用 Sibylla
            </h1>
            <p className="text-notion-text-secondary dark:text-gray-400">
              一个以 AI 共享上下文为核心的团队知识协作平台
            </p>
            
            <div className="glass rounded-xl p-6">
              <h2 className="mb-4 text-xl font-semibold text-notion-text-primary dark:text-white">
                快速导航
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() => setCurrentPage('components')}
                  className="rounded-lg border border-notion-border-default p-4 text-left transition-all hover:border-notion-accent hover:bg-notion-bg-secondary dark:border-gray-700 dark:hover:bg-gray-800"
                >
                  <h3 className="font-semibold text-notion-text-primary dark:text-white">
                    基础组件展示
                  </h3>
                  <p className="mt-1 text-sm text-notion-text-secondary dark:text-gray-400">
                    查看 Button、Input、Modal 等基础组件
                  </p>
                </button>
                
                <button
                  onClick={() => setCurrentPage('ui-components')}
                  className="rounded-lg border border-notion-border-default p-4 text-left transition-all hover:border-notion-accent hover:bg-notion-bg-secondary dark:border-gray-700 dark:hover:bg-gray-800"
                >
                  <h3 className="font-semibold text-notion-text-primary dark:text-white">
                    通用 UI 组件
                  </h3>
                  <p className="mt-1 text-sm text-notion-text-secondary dark:text-gray-400">
                    查看 Textarea、Select、Checkbox、Badge 等组件
                  </p>
                </button>
                
                <button
                  onClick={() => setCurrentPage('workspace')}
                  className="rounded-lg border border-notion-border-default p-4 text-left transition-all hover:border-notion-accent hover:bg-notion-bg-secondary dark:border-gray-700 dark:hover:bg-gray-800"
                >
                  <h3 className="font-semibold text-notion-text-primary dark:text-white">
                    Workspace 管理
                  </h3>
                  <p className="mt-1 text-sm text-notion-text-secondary dark:text-gray-400">
                    创建、打开和管理 Workspace
                  </p>
                </button>
                
                <button
                  onClick={() => setCurrentPage('theme')}
                  className="rounded-lg border border-notion-border-default p-4 text-left transition-all hover:border-notion-accent hover:bg-notion-bg-secondary dark:border-gray-700 dark:hover:bg-gray-800"
                >
                  <h3 className="font-semibold text-notion-text-primary dark:text-white">
                    主题系统
                  </h3>
                  <p className="mt-1 text-sm text-notion-text-secondary dark:text-gray-400">
                    查看主题切换和配色方案
                  </p>
                </button>
                
                <button
                  onClick={() => setCurrentPage('layout')}
                  className="rounded-lg border border-notion-border-default p-4 text-left transition-all hover:border-notion-accent hover:bg-notion-bg-secondary dark:border-gray-700 dark:hover:bg-gray-800"
                >
                  <h3 className="font-semibold text-notion-text-primary dark:text-white">
                    布局组件
                  </h3>
                  <p className="mt-1 text-sm text-notion-text-secondary dark:text-gray-400">
                    查看 FileTree 和布局系统
                  </p>
                </button>
              </div>
            </div>
          </div>
        )
    }
  }

  return (
    <ThemeProvider>
      <AppLayout>
        {currentPage !== 'home' && (
          <button
            onClick={() => setCurrentPage('home')}
            className="mb-4 text-sm text-notion-accent hover:underline"
          >
            ← 返回首页
          </button>
        )}
        {renderPage()}
        
        {/* Workspace Dialogs */}
        {showCreateWizard && (
          <CreateWorkspaceWizard
            onClose={() => setShowCreateWizard(false)}
            onSuccess={() => {
              setShowCreateWizard(false)
              setCurrentPage('workspace')
            }}
          />
        )}
        
        {showOpenDialog && (
          <OpenWorkspaceDialog
            onClose={() => setShowOpenDialog(false)}
            onSuccess={() => {
              setShowOpenDialog(false)
              setCurrentPage('workspace')
            }}
          />
        )}
      </AppLayout>
    </ThemeProvider>
  )
}
