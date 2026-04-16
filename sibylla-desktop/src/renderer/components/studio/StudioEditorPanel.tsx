import { Loader2 } from 'lucide-react'
import { cn } from '../../utils/cn'
import { ConflictResolutionPanel } from './ConflictResolutionPanel'
import { PixelOctoIcon } from '../brand/PixelOctoIcon'
import { WysiwygEditor } from '../editor/WysiwygEditor'
import { EditorErrorBoundary } from '../editor/EditorErrorBoundary'
import { CsvViewer } from '../viewer/CsvViewer'
import { TabBar } from '../layout/TabBar'
import { TabContextMenu } from '../layout/TabContextMenu'
import { CloseConfirmDialog } from '../layout/CloseConfirmDialog'
import { useTabStore } from '../../store/tabStore'
import type { EditorMode, SaveStatus } from './types'
import type { TabInfo } from '../../store/tabStore'
import { useState, useCallback, useMemo, useRef } from 'react'

interface StudioEditorPanelProps {
  editorMode: EditorMode
  saveStatus: SaveStatus
  isDirty: boolean
  isFileLoading: boolean
  editorError: string | null
  editorContent: string
  onQuickAI: () => void
  onChangeEditorMode: (mode: EditorMode) => void
  onEditorContentChange: (value: string) => void
  onOpenFile: (filePath: string) => void
  onCloseFile: (filePath: string) => void
  onSaveFile: (filePath: string) => Promise<void>
  onRevealInTree: (filePath: string) => void
  showConflictPanel: boolean
  conflictFilePath: string
  conflictYourLines?: string[]
  conflictTheirLines?: string[]
  conflictAiMergeText?: string
  onConflictAcceptYours: () => void
  onConflictAcceptTheirs: () => void
  onConflictAcceptAI: () => void
  onConflictManualEdit: () => void
}

export function StudioEditorPanel(props: StudioEditorPanelProps) {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const switchTab = useTabStore((s) => s.switchTab)
  const closeTab = useTabStore((s) => s.closeTab)
  const reorderTabs = useTabStore((s) => s.reorderTabs)
  const setDirty = useTabStore((s) => s.setDirty)

  const activePath = activeTabId ?? null
  const isEditorEmpty = tabs.length === 0 || !activePath
  const isReadOnly = props.editorMode === 'preview'

  const isCsvFile = useMemo(() => {
    if (!activePath) return false
    return activePath.toLowerCase().endsWith('.csv')
  }, [activePath])

  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    tab: TabInfo
  } | null>(null)

  const [confirmClose, setConfirmClose] = useState<{
    tabId: string
    fileName: string
  } | null>(null)

  const handleContextMenu = useCallback((event: React.MouseEvent, tabId: string) => {
    const tab = useTabStore.getState().getTab(tabId)
    if (tab) {
      setContextMenu({ x: event.clientX, y: event.clientY, tab })
    }
  }, [])

  /* [W5-FIX] Extract stable refs to avoid depending on the full `props` object */
  const onCloseFileRef = useRef(props.onCloseFile)
  onCloseFileRef.current = props.onCloseFile
  const onOpenFileRef = useRef(props.onOpenFile)
  onOpenFileRef.current = props.onOpenFile
  const onSaveFileRef = useRef(props.onSaveFile)
  onSaveFileRef.current = props.onSaveFile

  const handleCloseTab = useCallback((tabId: string) => {
    const closed = closeTab(tabId)
    if (!closed) {
      const tab = useTabStore.getState().getTab(tabId)
      if (tab) {
        setConfirmClose({ tabId, fileName: tab.fileName })
      }
    } else {
      const currentTab = useTabStore.getState().activeTab()
      if (currentTab) {
        onCloseFileRef.current(currentTab.filePath)
      }
    }
  }, [closeTab])

  const handleSwitchTab = useCallback((tabId: string) => {
    switchTab(tabId)
    const tab = useTabStore.getState().getTab(tabId)
    if (tab) {
      onOpenFileRef.current(tab.filePath)
    }
  }, [switchTab])

  const handleReorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    reorderTabs(fromIndex, toIndex)
  }, [reorderTabs])

  const handleSave = useCallback(async () => {
    if (!confirmClose) return
    const { tabId } = confirmClose
    try {
      await onSaveFileRef.current(tabId)
      setDirty(tabId, false)
      closeTab(tabId, true)
    } catch {
      // save failed — don't close
    }
    setConfirmClose(null)
  }, [confirmClose, closeTab, setDirty])

  const handleDiscard = useCallback(() => {
    if (!confirmClose) return
    closeTab(confirmClose.tabId, true)
    setConfirmClose(null)
  }, [confirmClose, closeTab])

  const handleCancel = useCallback(() => {
    setConfirmClose(null)
  }, [])

  return (
    <main className="noise-bg flex min-w-0 flex-1 flex-col bg-sys-darkSurface">
      <TabBar
        onContextMenu={handleContextMenu}
        onCloseTab={handleCloseTab}
        onSwitchTab={handleSwitchTab}
        onReorderTabs={handleReorderTabs}
        onQuickAI={props.onQuickAI}
      />

      <div className={cn('relative z-10 flex-1 overflow-hidden', isEditorEmpty && 'bg-[#1D1F23]')}>
        {isEditorEmpty ? (
          <div className="flex h-full min-h-[260px] items-center justify-center">
            <div className="flex flex-col items-center gap-4 opacity-75">
              <div className="flex items-center gap-3 rounded-full border border-white/15 bg-black/30 px-4 py-3 text-white">
                <PixelOctoIcon className="h-6 w-6" />
                <span className="font-mono text-sm font-bold tracking-[0.28em]">SIBYLLA</span>
              </div>
              <p className="text-xs text-sys-darkMuted">Open a file from the left panel</p>
            </div>
          </div>
        ) : (
          <>
            {props.isFileLoading ? (
              <div className="flex h-full items-center justify-center">
                <div className="flex items-center gap-2 text-sm text-sys-darkMuted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading file...
                </div>
              </div>
            ) : props.editorError ? (
              <div className="flex h-full items-center justify-center p-8">
                <div className="rounded-md border border-red-700/40 bg-red-950/30 px-4 py-2 text-sm text-red-300">
                  {props.editorError}
                </div>
              </div>
            ) : (
              <EditorErrorBoundary>
                {isCsvFile ? (
                  <CsvViewer filePath={activePath ?? ''} className="h-full" />
                ) : (
                  <WysiwygEditor
                    filePath={activePath ?? ''}
                    initialContent={props.editorContent}
                    readOnly={isReadOnly}
                    onDirtyChange={(isDirty) => {
                      if (activePath) {
                        setDirty(activePath, isDirty)
                      }
                    }}
                    onSave={() => {
                      props.onChangeEditorMode(props.editorMode)
                    }}
                  />
                )}
              </EditorErrorBoundary>
            )}

            {props.showConflictPanel && (
              <ConflictResolutionPanel
                path={props.conflictFilePath || 'docs/product/prd.md'}
                yourLines={props.conflictYourLines}
                theirLines={props.conflictTheirLines}
                aiMergeText={props.conflictAiMergeText}
                onApplyYours={props.onConflictAcceptYours}
                onApplyTheirs={props.onConflictAcceptTheirs}
                onApplyAI={props.onConflictAcceptAI}
                onManualEdit={props.onConflictManualEdit}
              />
            )}
          </>
        )}
      </div>

      {contextMenu && (
        <TabContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          tab={contextMenu.tab}
          onClose={() => setContextMenu(null)}
          onForceClose={handleCloseTab}
          onRevealInTree={props.onRevealInTree}
        />
      )}

      {confirmClose && (
        <CloseConfirmDialog
          isOpen={true}
          fileName={confirmClose.fileName}
          onSave={handleSave}
          onDiscard={handleDiscard}
          onCancel={handleCancel}
        />
      )}
    </main>
  )
}
