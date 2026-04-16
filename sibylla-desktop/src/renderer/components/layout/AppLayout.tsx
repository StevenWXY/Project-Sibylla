import React from 'react'
import {
  ChevronDown,
  Plus,
} from 'lucide-react'
import { useAppStore, selectCurrentWorkspace } from '../../store/appStore'
import { MainContent } from './MainContent'
import { PixelOctoIcon } from '../brand/PixelOctoIcon'
import { DropZoneOverlay } from '../import/DropZoneOverlay'
import { ImportSummaryDialog } from '../import/ImportSummaryDialog'
import { useDropZone } from '../../hooks/useDropZone'
import { StatusBar } from '../statusbar'
import { SyncStatusIndicator } from '../statusbar/SyncStatusIndicator'
import { useSyncStatus } from '../../hooks/useSyncStatus'
import type { ImportResult } from '../../../shared/types'

interface AppLayoutProps {
  children: React.ReactNode
  onSwitchWorkspace?: (workspacePath: string) => void
  onCreateWorkspace?: () => void
  onOpenWorkspace?: () => void
  onOpenWorkspaceManager?: () => void
  onOpenProfile?: () => void
  isWorkspaceBusy?: boolean
}

export function AppLayout({
  children,
  onSwitchWorkspace,
  onCreateWorkspace,
  onOpenWorkspace,
  onOpenWorkspaceManager,
  onOpenProfile,
  isWorkspaceBusy = false,
}: AppLayoutProps) {
  const currentWorkspace = useAppStore(selectCurrentWorkspace)
  const recentWorkspaces = useAppStore((state) => state.recentWorkspaces)
  const currentUser = useAppStore((state) => state.currentUser)
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = React.useState(false)
  const [importResult, setImportResult] = React.useState<ImportResult | null>(null)
  const workspaceMenuRef = React.useRef<HTMLDivElement | null>(null)

  const avatarUrl =
    currentUser?.avatarUrl && currentUser.avatarUrl.trim().length > 0
      ? currentUser.avatarUrl
      : undefined

  const handleDrop = React.useCallback(async (filePaths: string[]) => {
    const result = await window.electronAPI.file.import(filePaths)
    if (result.success && result.data) {
      setImportResult(result.data)
    }
  }, [])

  const { isDragging } = useDropZone(handleDrop)

  useSyncStatus()

  React.useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!workspaceMenuRef.current) {
        return
      }
      if (!workspaceMenuRef.current.contains(event.target as Node)) {
        setWorkspaceMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-sys-black text-white">
      <DropZoneOverlay isDragging={isDragging} />
      {importResult && (
        <ImportSummaryDialog
          result={importResult}
          onClose={() => setImportResult(null)}
        />
      )}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-sys-darkBorder bg-sys-black px-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-white">
            <PixelOctoIcon className="h-5 w-5" />
            <span className="font-mono text-sm font-bold tracking-widest">SIBYLLA</span>
          </div>
          <div className="h-4 w-px bg-sys-darkBorder" />

          <div ref={workspaceMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setWorkspaceMenuOpen((open) => !open)}
              className="inline-flex items-center gap-1.5 text-sm text-gray-300 transition-colors hover:text-white"
            >
              <span>{currentWorkspace?.config.name ?? 'Select Workspace'}</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>

            {workspaceMenuOpen && (
              <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-[340px] rounded-lg border border-sys-darkBorder bg-[#0A0A0A] p-2 shadow-2xl">
                <div className="mb-2 flex gap-2 border-b border-sys-darkBorder pb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setWorkspaceMenuOpen(false)
                      onCreateWorkspace?.()
                    }}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-sys-darkBorder bg-sys-darkSurface px-2 py-1.5 text-xs text-gray-200 transition-colors hover:text-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create Workspace
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWorkspaceMenuOpen(false)
                      onOpenWorkspace?.()
                    }}
                    className="inline-flex flex-1 items-center justify-center rounded border border-sys-darkBorder bg-sys-darkSurface px-2 py-1.5 text-xs text-gray-200 transition-colors hover:text-white"
                  >
                    Open Workspace
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceMenuOpen(false)
                    onOpenWorkspaceManager?.()
                  }}
                  className="mb-2 w-full rounded border border-sys-darkBorder bg-[#111111] px-2 py-1.5 text-left text-xs text-sys-darkMuted transition-colors hover:text-white"
                >
                  Go to Workspace Manager
                </button>

                <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                  {recentWorkspaces.length === 0 ? (
                    <p className="rounded border border-sys-darkBorder bg-[#111111] px-2 py-2 text-xs text-sys-darkMuted">
                      No recent workspaces
                    </p>
                  ) : (
                    recentWorkspaces.slice(0, 8).map((workspace) => {
                      const isCurrent =
                        workspace.config.workspaceId === currentWorkspace?.config.workspaceId
                      return (
                        <button
                          key={workspace.config.workspaceId}
                          type="button"
                          disabled={isWorkspaceBusy || isCurrent}
                          onClick={() => {
                            setWorkspaceMenuOpen(false)
                            onSwitchWorkspace?.(workspace.metadata.path)
                          }}
                          className="w-full rounded border border-sys-darkBorder bg-[#111111] px-2 py-1.5 text-left transition-colors hover:bg-[#181818] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-medium text-white">
                              {workspace.config.name}
                            </span>
                            {isCurrent && (
                              <span className="rounded bg-status-success/20 px-1.5 py-0.5 text-[10px] text-status-success">
                                Current
                              </span>
                            )}
                          </div>
                          <p className="truncate text-[10px] text-sys-darkMuted">
                            {workspace.metadata.path}
                          </p>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <SyncStatusIndicator variant="compact" />

          <button
            type="button"
            onClick={onOpenProfile}
            className="h-7 w-7 overflow-hidden rounded-full border border-white/10 bg-sys-darkBorder transition-opacity hover:opacity-90"
            title="Open Profile"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="User avatar" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[11px] font-semibold uppercase text-gray-300">
                {(currentUser?.name ?? 'S')[0]}
              </span>
            )}
          </button>
        </div>
      </header>

      <MainContent>{children}</MainContent>

      <StatusBar />
    </div>
  )
}
