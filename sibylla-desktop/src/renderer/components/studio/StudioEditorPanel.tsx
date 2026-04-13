import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FileText, Loader2, X } from 'lucide-react'
import { cn } from '../../utils/cn'
import { ConflictResolutionPanel } from './ConflictResolutionPanel'
import { PixelOctoIcon } from '../brand/PixelOctoIcon'
import type { EditorMode, OpenFileTab, SaveStatus } from './types'

interface StudioEditorPanelProps {
  openFileTabs: OpenFileTab[]
  selectedFilePath: string | null
  dirtyFilePaths: string[]
  editorMode: EditorMode
  saveStatus: SaveStatus
  isDirty: boolean
  isFileLoading: boolean
  editorError: string | null
  editorContent: string
  onOpenTab: (path: string) => void
  onCloseTab: (path: string) => void
  onQuickAI: () => void
  onChangeEditorMode: (mode: EditorMode) => void
  onEditorContentChange: (value: string) => void
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
  const tabs: OpenFileTab[] = props.openFileTabs
  const activePath = props.selectedFilePath ?? (tabs.length > 0 ? tabs[0]?.path ?? null : null)
  const isEditorEmpty = tabs.length === 0 || !activePath

  return (
    <main className="noise-bg flex min-w-0 flex-1 flex-col bg-sys-darkSurface">
      <div className="relative z-10 flex h-10 items-center overflow-x-auto border-b border-sys-darkBorder bg-[#050505] px-2">
        <div className="flex items-center gap-1">
          {tabs.length === 0 && (
            <div className="px-2 text-[12px] text-sys-darkMuted">No open files</div>
          )}

          {tabs.map((tab) => {
            const isActive = tab.path === activePath
            const isTabDirty = props.dirtyFilePaths.includes(tab.path)

            return (
              <div
                key={tab.path}
                className={cn(
                  'flex min-w-[120px] max-w-[220px] items-center gap-1 rounded-t-lg px-1.5 py-1 text-[13px]',
                  isActive
                    ? 'border border-sys-darkBorder border-b-0 bg-sys-darkSurface text-white'
                    : 'text-sys-darkMuted transition-colors hover:bg-white/5'
                )}
              >
                <button
                  type="button"
                  onClick={() => props.onOpenTab(tab.path)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-0.5 text-left"
                  title={tab.path}
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{tab.name}</span>
                  {isTabDirty && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-status-warning" />}
                </button>

                <button
                  type="button"
                  className={cn(
                    'rounded p-0.5 text-gray-500 transition-colors hover:bg-white/10 hover:text-white',
                    !isActive && 'opacity-80'
                  )}
                  onClick={(event) => {
                    event.stopPropagation()
                    props.onCloseTab(tab.path)
                  }}
                  title="Close file"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          })}
        </div>

        <button
          type="button"
          onClick={props.onQuickAI}
          className="ml-2 flex items-center gap-1 rounded border border-white/20 px-2 py-1 text-[12px] font-medium text-white transition-colors hover:bg-white/10"
        >
          + AI
        </button>
      </div>

      <div className={cn('relative z-10 flex-1 overflow-y-auto p-8', isEditorEmpty && 'bg-[#1D1F23]')}>
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
          <div className="mx-auto max-w-3xl">
            {props.isFileLoading ? (
              <div className="flex items-center gap-2 text-sm text-sys-darkMuted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading file...
              </div>
            ) : props.editorError ? (
              <div className="rounded-md border border-red-700/40 bg-red-950/30 px-4 py-2 text-sm text-red-300">
                {props.editorError}
              </div>
            ) : (
              <article className="mockup-markdown text-[15px] leading-6 text-gray-300">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => (
                      <h1 className="mb-6 text-[28px] font-bold leading-[36px] text-white">{children}</h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="mb-4 mt-8 border-b border-sys-darkBorder pb-2 text-[24px] font-semibold leading-[32px] text-white">
                        {children}
                      </h2>
                    ),
                    p: ({ children }) => <p className="mb-3 text-[15px] leading-[24px] text-gray-300">{children}</p>,
                    blockquote: ({ children }) => (
                      <blockquote className="mb-6 border-l-2 border-white bg-white/5 py-1 pl-4 text-[15px] leading-[24px] text-gray-300">
                        {children}
                      </blockquote>
                    ),
                  }}
                >
                  {props.editorContent}
                </ReactMarkdown>
              </article>
            )}

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
          </div>
        )}
      </div>
    </main>
  )
}
