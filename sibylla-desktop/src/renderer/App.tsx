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
  | 'profile'
  | 'workspace'
  | 'workspace-studio'

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('workspace-studio')
  const [showCreateWizard, setShowCreateWizard] = useState(false)
  const [showOpenDialog, setShowOpenDialog] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [workspaceFeedback, setWorkspaceFeedback] = useState<string | null>(null)
  const [isWorkspaceBusy, setIsWorkspaceBusy] = useState(false)
  const [isSyncingNow, setIsSyncingNow] = useState(false)
  const currentWorkspace = useAppStore((state) => state.currentWorkspace)
  const currentUser = useAppStore((state) => state.currentUser)
  const recentWorkspaces = useAppStore((state) => state.recentWorkspaces)
  const isAuthenticated = useAppStore((state) => state.isAuthenticated)
  const setAuthenticated = useAppStore((state) => state.setAuthenticated)
  const setCurrentWorkspace = useAppStore((state) => state.setCurrentWorkspace)

  // Check existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const authApi = window.electronAPI?.auth
        if (!authApi?.getCurrentUser) {
          console.warn('[App] electronAPI.auth.getCurrentUser is unavailable, fallback to unauthenticated state')
          return
        }

        const timeout = new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error('Auth check timeout')), 5000)
        })

        const response = await Promise.race([authApi.getCurrentUser(), timeout])
        if (response.success && response.data?.isAuthenticated && response.data.user) {
          setAuthenticated(true, response.data.user)
        }
      } catch (error) {
        console.error('[App] Auth check failed:', error)
      } finally {
        setAuthChecked(true)
      }
    }
    checkAuth()
  }, [setAuthenticated])

  useEffect(() => {
    if (!isAuthenticated || currentWorkspace) {
      return
    }

    let cancelled = false

    const bootstrapWorkspace = async () => {
      const workspaceApi = window.electronAPI?.workspace
      if (!workspaceApi?.getCurrent) {
        return
      }

      try {
        const result = await workspaceApi.getCurrent()
        if (!cancelled && result.success && result.data) {
          setCurrentWorkspace(result.data)
        }
      } catch {
        // Ignore bootstrap errors in renderer fallback mode.
      }
    }

    void bootstrapWorkspace()

    return () => {
      cancelled = true
    }
  }, [currentWorkspace, isAuthenticated, setCurrentWorkspace])

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

  const openWorkspaceByPath = async (workspacePath: string) => {
    if (!workspacePath || isWorkspaceBusy) {
      return
    }
    setIsWorkspaceBusy(true)
    setWorkspaceFeedback(null)
    try {
      const result = await window.electronAPI.workspace.open(workspacePath)
      if (!result.success || !result.data) {
        setWorkspaceFeedback(result.error?.message ?? '打开 Workspace 失败')
        return
      }
      setCurrentWorkspace(result.data)
      setWorkspaceFeedback(`已打开：${result.data.config.name}`)
      setCurrentPage('workspace-studio')
    } catch (error) {
      setWorkspaceFeedback(error instanceof Error ? error.message : '打开 Workspace 失败')
    } finally {
      setIsWorkspaceBusy(false)
    }
  }

  const refreshCurrentWorkspace = async () => {
    if (!currentWorkspace || isWorkspaceBusy) {
      return
    }
    setIsWorkspaceBusy(true)
    setWorkspaceFeedback(null)
    try {
      const result = await window.electronAPI.workspace.getCurrent()
      if (!result.success) {
        setWorkspaceFeedback(result.error?.message ?? '刷新 Workspace 状态失败')
        return
      }
      if (!result.data) {
        setCurrentWorkspace(null)
        setWorkspaceFeedback('当前 Workspace 已关闭')
        return
      }
      setCurrentWorkspace(result.data)
      setWorkspaceFeedback(`已刷新：${result.data.config.name}`)
    } catch (error) {
      setWorkspaceFeedback(error instanceof Error ? error.message : '刷新 Workspace 状态失败')
    } finally {
      setIsWorkspaceBusy(false)
    }
  }

  const forceSyncWorkspace = async () => {
    if (!currentWorkspace || isSyncingNow) {
      return
    }
    setIsSyncingNow(true)
    setWorkspaceFeedback(null)
    try {
      const result = await window.electronAPI.sync.force()
      if (!result.success || !result.data) {
        setWorkspaceFeedback(result.error?.message ?? '触发同步失败')
        return
      }
      if (result.data.success && !result.data.hasConflicts) {
        setWorkspaceFeedback('同步完成：无冲突')
        return
      }
      if (result.data.hasConflicts) {
        setWorkspaceFeedback(`同步发现冲突：${result.data.conflicts?.[0] ?? '未知文件'}`)
        return
      }
      setWorkspaceFeedback(result.data.error ?? '同步未完成')
    } catch (error) {
      setWorkspaceFeedback(error instanceof Error ? error.message : '触发同步失败')
    } finally {
      setIsSyncingNow(false)
    }
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
        if (!currentWorkspace) {
          return (
            <div className="flex h-full items-center justify-center bg-sys-black">
              <div className="rounded-md border border-sys-darkBorder bg-[#0A0A0A] px-4 py-2 font-mono text-xs text-sys-darkMuted">
                Loading workspace...
              </div>
            </div>
          )
        }
        return <WorkspaceStudioPage />
      case 'workspace':
        return (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Workspace 管理
            </h1>

            {workspaceFeedback && (
              <div className="rounded-lg border border-sys-darkBorder bg-[#101010] px-4 py-2 text-sm text-sys-darkMuted">
                {workspaceFeedback}
              </div>
            )}

            {currentWorkspace ? (
              <div className="rounded-xl border border-sys-darkBorder bg-[#0A0A0A] p-6">
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
                  <p className="text-sys-darkMuted">
                    <span className="font-semibold">文件数：</span>
                    {currentWorkspace.metadata.fileCount}
                  </p>
                  <p className="text-sys-darkMuted">
                    <span className="font-semibold">大小：</span>
                    {(currentWorkspace.metadata.sizeBytes / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    onClick={() => setCurrentPage('workspace-studio')}
                    variant="primary"
                  >
                    进入 Studio
                  </Button>
                  <Button
                    onClick={() => {
                      void refreshCurrentWorkspace()
                    }}
                    variant="outline"
                    disabled={isWorkspaceBusy}
                  >
                    刷新状态
                  </Button>
                  <Button
                    onClick={() => {
                      void forceSyncWorkspace()
                    }}
                    variant="outline"
                    disabled={isSyncingNow}
                  >
                    {isSyncingNow ? '同步中...' : '强制同步'}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-sys-darkBorder bg-[#0A0A0A] p-6">
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

            {recentWorkspaces.length > 0 && (
              <div className="rounded-xl border border-sys-darkBorder bg-[#0A0A0A] p-6">
                <h2 className="mb-4 text-lg font-semibold text-white">最近 Workspace</h2>
                <div className="space-y-2">
                  {recentWorkspaces.slice(0, 6).map((workspace) => (
                    <div
                      key={workspace.config.workspaceId}
                      className="flex items-center justify-between rounded-lg border border-sys-darkBorder bg-[#111111] px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-white">{workspace.config.name}</p>
                        <p className="text-xs text-sys-darkMuted">{workspace.metadata.path}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isWorkspaceBusy}
                        onClick={() => {
                          void openWorkspaceByPath(workspace.metadata.path)
                        }}
                      >
                        打开
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      case 'profile': {
        const avatarSeed = encodeURIComponent(currentUser?.name ?? currentUser?.email ?? 'Sibylla')
        const avatarUrl =
          currentUser?.avatarUrl && currentUser.avatarUrl.trim().length > 0
            ? currentUser.avatarUrl
            : `https://api.dicebear.com/7.x/avataaars/svg?seed=${avatarSeed}&backgroundColor=27272A`

        return (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold tracking-tight text-white">Profile</h1>
            <div className="rounded-xl border border-sys-darkBorder bg-[#0A0A0A] p-6">
              <div className="flex flex-wrap items-center gap-4">
                <img
                  src={avatarUrl}
                  alt="Profile avatar"
                  className="h-16 w-16 rounded-full border border-white/15 bg-sys-darkBorder object-cover"
                />
                <div>
                  <p className="text-xl font-semibold text-white">{currentUser?.name ?? 'Unnamed User'}</p>
                  <p className="text-sm text-sys-darkMuted">{currentUser?.email ?? 'No email bound'}</p>
                  <p className="text-xs text-sys-darkMuted">User ID: {currentUser?.id ?? '-'}</p>
                </div>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <button
                  onClick={() => setCurrentPage('workspace')}
                  className="rounded-md border border-sys-darkBorder bg-[#111111] px-4 py-2 text-left text-sm text-gray-200 transition-colors hover:bg-[#181818]"
                >
                  Go to Workspace Manager
                </button>
                <button
                  onClick={() => setCurrentPage('workspace-studio')}
                  className="rounded-md border border-sys-darkBorder bg-[#111111] px-4 py-2 text-left text-sm text-gray-200 transition-colors hover:bg-[#181818]"
                >
                  Back to Studio
                </button>
              </div>
            </div>
          </div>
        )
      }
      default:
        return (
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-md border border-sys-darkBorder bg-[#111111] px-3 py-1 font-mono text-xs tracking-widest text-white">
              <PixelOctoIcon className="h-3.5 w-3.5" />
              SIBYLLA_WORKSPACE
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Welcome to Sibylla
            </h1>
            <p className="text-sys-darkMuted">
              An AI-first collaborative workspace for shared team context and knowledge.
            </p>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-sys-darkBorder bg-[#0A0A0A] p-5">
                <h3 className="text-base font-semibold text-white">Current Workspace</h3>
                {currentWorkspace ? (
                  <div className="mt-3 space-y-2 text-sm">
                    <p className="text-white">{currentWorkspace.config.name}</p>
                    <p className="text-sys-darkMuted">{currentWorkspace.metadata.path}</p>
                    <p className="text-sys-darkMuted">
                      Files {currentWorkspace.metadata.fileCount} · {(currentWorkspace.metadata.sizeBytes / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <div className="pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isSyncingNow}
                        onClick={() => {
                          void forceSyncWorkspace()
                        }}
                      >
                        {isSyncingNow ? 'Syncing...' : 'Sync Now'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-sys-darkMuted">No workspace is currently open.</p>
                )}
              </div>

              <div className="rounded-xl border border-sys-darkBorder bg-[#0A0A0A] p-5">
                <h3 className="text-base font-semibold text-white">Recent Workspaces</h3>
                {recentWorkspaces.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {recentWorkspaces.slice(0, 4).map((workspace) => (
                      <div
                        key={workspace.config.workspaceId}
                        className="flex items-center justify-between rounded border border-sys-darkBorder bg-[#111111] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm text-white">{workspace.config.name}</p>
                          <p className="truncate text-xs text-sys-darkMuted">{workspace.metadata.path}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isWorkspaceBusy}
                          onClick={() => {
                            void openWorkspaceByPath(workspace.metadata.path)
                          }}
                        >
                          Open
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-sys-darkMuted">No recent workspaces yet.</p>
                )}
              </div>
            </div>
          </div>
        )
    }
  }

  const isStudioPage = currentPage === 'workspace-studio'

  return (
    <ThemeProvider>
      <AppLayout
        isWorkspaceBusy={isWorkspaceBusy}
        onSwitchWorkspace={(workspacePath) => {
          void openWorkspaceByPath(workspacePath)
        }}
        onCreateWorkspace={() => {
          setShowCreateWizard(true)
        }}
        onOpenWorkspace={() => {
          setShowOpenDialog(true)
        }}
        onOpenWorkspaceManager={() => {
          setCurrentPage('workspace')
        }}
        onOpenProfile={() => {
          setCurrentPage('profile')
        }}
      >
        {isStudioPage ? (
          renderPage()
        ) : (
          <div className="h-full overflow-y-auto px-6 py-5">
            {currentPage !== 'home' && (
              <button
                onClick={() => setCurrentPage('home')}
                className="mb-4 rounded-md border border-sys-darkBorder bg-[#111111] px-3 py-1.5 text-sm text-sys-darkMuted transition-colors hover:text-white"
              >
                ← 返回首页
              </button>
            )}
            {renderPage()}
          </div>
        )}

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
