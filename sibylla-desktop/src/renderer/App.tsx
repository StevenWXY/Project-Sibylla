import React, { useState, useEffect } from 'react'
import { ThemeProvider } from './components/providers/ThemeProvider'
import { AppLayout } from './components/layout/AppLayout'
import { ComponentShowcase } from './pages/ComponentShowcase'
import { ThemeShowcase } from './pages/ThemeShowcase'
import { LayoutShowcase } from './pages/LayoutShowcase'
import UIComponentsShowcase from './pages/UIComponentsShowcase'
import { WorkspaceStudioPage } from './pages/WorkspaceStudioPage'
import { CreateWorkspaceWizard } from './components/workspace/CreateWorkspaceWizard'
import { OpenWorkspaceDialog } from './components/workspace/OpenWorkspaceDialog'
import { LoginPage } from './components/auth/LoginPage'
import { Button } from './components/ui/Button'
import { PixelOctoIcon } from './components/brand/PixelOctoIcon'
import { useAppStore } from './store/appStore'

type Page =
  | 'home'
  | 'components'
  | 'theme'
  | 'layout'
  | 'ui-components'
  | 'workspace'
  | 'workspace-studio'

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home')
  const [showCreateWizard, setShowCreateWizard] = useState(false)
  const [showOpenDialog, setShowOpenDialog] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const currentWorkspace = useAppStore((state) => state.currentWorkspace)
  const isAuthenticated = useAppStore((state) => state.isAuthenticated)
  const setAuthenticated = useAppStore((state) => state.setAuthenticated)

  // Check existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await window.electronAPI.auth.getCurrentUser()
        if (response.success && response.data?.isAuthenticated && response.data.user) {
          setAuthenticated(true, response.data.user)
        }
      } catch {
        // Auth check failed — user needs to login
      } finally {
        setAuthChecked(true)
      }
    }
    checkAuth()
  }, [setAuthenticated])

  // Show loading until auth check completes
  if (!authChecked) {
    return (
      <ThemeProvider>
        <div className="sibylla-shell flex min-h-screen items-center justify-center">
          <div className="sibylla-panel-subtle px-4 py-2 font-mono text-sm text-sys-darkMuted">
            Loading...
          </div>
        </div>
      </ThemeProvider>
    )
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return (
      <ThemeProvider>
        <LoginPage
          onAuthSuccess={async () => {
            try {
              const response = await window.electronAPI.auth.getCurrentUser()
              if (response.success && response.data?.isAuthenticated && response.data.user) {
                setAuthenticated(true, response.data.user)
              } else {
                // Dev skip: mark as authenticated without user data
                setAuthenticated(true, null)
              }
            } catch {
              setAuthenticated(true, null)
            }
          }}
        />
      </ThemeProvider>
    )
  }

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
      case 'workspace-studio':
        return <WorkspaceStudioPage />
      case 'workspace':
        return (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Workspace 管理
            </h1>

            {currentWorkspace ? (
              <div className="sibylla-panel p-6">
                <h2 className="mb-4 text-xl font-semibold text-white">
                  当前 Workspace
                </h2>
                <div className="space-y-2">
                  <p className="text-white">
                    <span className="font-semibold">名称：</span>
                    {currentWorkspace.config.name}
                  </p>
                  <p className="text-sys-darkMuted">
                    <span className="font-semibold">描述：</span>
                    {currentWorkspace.config.description || '无'}
                  </p>
                  <p className="text-sys-darkMuted">
                    <span className="font-semibold">路径：</span>
                    {currentWorkspace.metadata.path}
                  </p>
                  <p className="text-sys-darkMuted">
                    <span className="font-semibold">ID：</span>
                    {currentWorkspace.config.workspaceId}
                  </p>
                </div>
                <Button
                  onClick={() => setCurrentPage('workspace-studio')}
                  variant="primary"
                  className="mt-4"
                >
                  进入 Phase 1 工作台
                </Button>
              </div>
            ) : (
              <div className="sibylla-panel p-6">
                <p className="mb-4 text-sys-darkMuted">
                  当前没有打开的 Workspace
                </p>
                <div className="flex gap-3">
                  <Button
                    onClick={() => setShowCreateWizard(true)}
                    variant="primary"
                  >
                    创建新 Workspace
                  </Button>
                  <Button
                    onClick={() => setShowOpenDialog(true)}
                    variant="outline"
                  >
                    打开现有 Workspace
                  </Button>
                </div>
              </div>
            )}
          </div>
        )
      default:
        return (
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs tracking-widest text-white">
              <PixelOctoIcon className="h-3.5 w-3.5" />
              SIBYLLA_WORKSPACE
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              欢迎使用 Sibylla
            </h1>
            <p className="text-sys-darkMuted">
              一个以 AI 共享上下文为核心的团队知识协作平台
            </p>

            <div className="sibylla-panel p-6">
              <h2 className="mb-4 text-xl font-semibold text-white">
                快速导航
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() => setCurrentPage('workspace-studio')}
                  className="rounded-lg border border-white/10 bg-sys-darkSurface/60 p-4 text-left transition-all hover:bg-sys-darkSurface"
                >
                  <h3 className="font-semibold text-white">
                    Phase 1 工作台
                  </h3>
                  <p className="mt-1 text-sm text-sys-darkMuted">
                    文件树 + Markdown 双链编辑 + AI Streaming 对话
                  </p>
                </button>

                <button
                  onClick={() => setCurrentPage('components')}
                  className="rounded-lg border border-white/10 bg-sys-darkSurface/60 p-4 text-left transition-all hover:bg-sys-darkSurface"
                >
                  <h3 className="font-semibold text-white">
                    基础组件展示
                  </h3>
                  <p className="mt-1 text-sm text-sys-darkMuted">
                    查看 Button、Input、Modal 等基础组件
                  </p>
                </button>

                <button
                  onClick={() => setCurrentPage('ui-components')}
                  className="rounded-lg border border-white/10 bg-sys-darkSurface/60 p-4 text-left transition-all hover:bg-sys-darkSurface"
                >
                  <h3 className="font-semibold text-white">
                    通用 UI 组件
                  </h3>
                  <p className="mt-1 text-sm text-sys-darkMuted">
                    查看 Textarea、Select、Checkbox、Badge 等组件
                  </p>
                </button>

                <button
                  onClick={() => setCurrentPage('workspace')}
                  className="rounded-lg border border-white/10 bg-sys-darkSurface/60 p-4 text-left transition-all hover:bg-sys-darkSurface"
                >
                  <h3 className="font-semibold text-white">
                    Workspace 管理
                  </h3>
                  <p className="mt-1 text-sm text-sys-darkMuted">
                    创建、打开和管理 Workspace
                  </p>
                </button>

                <button
                  onClick={() => setCurrentPage('theme')}
                  className="rounded-lg border border-white/10 bg-sys-darkSurface/60 p-4 text-left transition-all hover:bg-sys-darkSurface"
                >
                  <h3 className="font-semibold text-white">
                    主题系统
                  </h3>
                  <p className="mt-1 text-sm text-sys-darkMuted">
                    查看主题切换和配色方案
                  </p>
                </button>

                <button
                  onClick={() => setCurrentPage('layout')}
                  className="rounded-lg border border-white/10 bg-sys-darkSurface/60 p-4 text-left transition-all hover:bg-sys-darkSurface"
                >
                  <h3 className="font-semibold text-white">
                    布局组件
                  </h3>
                  <p className="mt-1 text-sm text-sys-darkMuted">
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
            className="mb-4 rounded-lg border border-white/10 bg-sys-darkSurface/50 px-3 py-1.5 text-sm text-sys-darkMuted transition-colors hover:text-white"
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
              setCurrentPage('workspace-studio')
            }}
          />
        )}

        {showOpenDialog && (
          <OpenWorkspaceDialog
            onClose={() => setShowOpenDialog(false)}
            onSuccess={() => {
              setShowOpenDialog(false)
              setCurrentPage('workspace-studio')
            }}
          />
        )}
      </AppLayout>
    </ThemeProvider>
  )
}
