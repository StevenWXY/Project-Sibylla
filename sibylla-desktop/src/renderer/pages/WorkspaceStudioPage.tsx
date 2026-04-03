import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Loader2,
  MessageSquare,
  PencilLine,
  RefreshCw,
  Save,
  Send,
  Square,
} from 'lucide-react'
import { PixelOctoIcon } from '../components/brand/PixelOctoIcon'
import { FileTree } from '../components/layout/FileTree'
import { Button } from '../components/ui/Button'
import {
  useAppStore,
  selectCurrentFile,
  selectCurrentWorkspace,
  selectOpenFiles,
} from '../store/appStore'
import { cn } from '../utils/cn'
import {
  buildTreeFromFiles,
  getBaseName,
  joinPath,
  normalizePath,
  type FileTreeNode,
} from '../components/layout/file-tree.utils'

type EditorMode = 'edit' | 'preview' | 'split'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
type ChatRole = 'user' | 'assistant'

interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
  contextSources?: string[]
  streaming?: boolean
}

interface AssistantContext {
  currentFilePath: string | null
}

const STREAM_STEP_MS = 24
const AUTOSAVE_DELAY_MS = 900

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function buildDefaultExpandedIds(nodes: FileTreeNode[]): string[] {
  return nodes
    .filter((node) => node.type === 'folder')
    .slice(0, 6)
    .map((node) => node.path)
}

function extractMentionedFiles(input: string): string[] {
  const mentions = new Set<string>()
  const mentionRegex = /@([\w./-]+)/g
  let matched = mentionRegex.exec(input)
  while (matched) {
    if (matched[1]) {
      mentions.add(matched[1])
    }
    matched = mentionRegex.exec(input)
  }
  return Array.from(mentions)
}

function createAssistantResponse(userInput: string, context: AssistantContext): string {
  const summary = userInput.length > 140 ? `${userInput.slice(0, 140)}...` : userInput
  const fileHint = context.currentFilePath
    ? `当前焦点文件是 \`${context.currentFilePath}\`。`
    : '当前没有打开具体文件。'

  const fileAction = context.currentFilePath
    ? `建议先在中栏补充该文件的目标结构，再让我继续细化内容。`
    : '建议先从左侧文件树打开一个目标文档，我会基于该文档上下文继续生成。'

  return [
    '我已经收到你的需求，以下是基于当前上下文的快速响应：',
    '',
    `你刚刚说的是：“${summary}”`,
    fileHint,
    '',
    '下一步建议：',
    '1. 先确认文档目标与受众，再拆成 3-5 个小节。',
    '2. 每个小节保留「结论 + 依据 + 待办」。',
    `3. ${fileAction}`,
    '',
    '如果你愿意，我可以继续直接给出可粘贴到 Markdown 的完整草稿。',
  ].join('\n')
}

export function WorkspaceStudioPage() {
  const currentWorkspace = useAppStore(selectCurrentWorkspace)
  const currentFile = useAppStore(selectCurrentFile)
  const openFiles = useAppStore(selectOpenFiles)
  const setCurrentFile = useAppStore((state) => state.setCurrentFile)

  const [treeNodes, setTreeNodes] = useState<FileTreeNode[]>([])
  const [defaultExpandedIds, setDefaultExpandedIds] = useState<string[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(undefined)

  const [editorMode, setEditorMode] = useState<EditorMode>('split')
  const [editorContent, setEditorContent] = useState('')
  const [savedContentSnapshot, setSavedContentSnapshot] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  const [isTreeLoading, setIsTreeLoading] = useState(false)
  const [isFileLoading, setIsFileLoading] = useState(false)
  const [treeError, setTreeError] = useState<string | null>(null)
  const [editorError, setEditorError] = useState<string | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)

  const streamTimerRef = useRef<number | null>(null)

  const selectedFilePath = useMemo(() => currentFile?.path ?? null, [currentFile?.path])

  const isDirty = useMemo(() => {
    if (!selectedFilePath) {
      return false
    }
    return editorContent !== savedContentSnapshot
  }, [editorContent, savedContentSnapshot, selectedFilePath])

  const openFilePaths = useMemo(
    () => openFiles.map((file) => normalizePath(file.path)),
    [openFiles]
  )

  const dirtyFilePaths = useMemo(() => {
    if (!isDirty || !selectedFilePath) {
      return []
    }
    return [normalizePath(selectedFilePath)]
  }, [isDirty, selectedFilePath])

  const refreshTree = useCallback(async () => {
    if (!currentWorkspace) {
      setTreeNodes([])
      setDefaultExpandedIds([])
      return
    }

    setIsTreeLoading(true)
    setTreeError(null)

    try {
      const response = await window.electronAPI.file.list('', {
        recursive: true,
        includeHidden: false,
      })

      if (!response.success || !response.data) {
        setTreeError(response.error?.message ?? '文件树加载失败')
        setTreeNodes([])
        setDefaultExpandedIds([])
        return
      }

      const tree = buildTreeFromFiles(response.data)
      setTreeNodes(tree)
      setDefaultExpandedIds(buildDefaultExpandedIds(tree))
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : '文件树加载失败')
      setTreeNodes([])
      setDefaultExpandedIds([])
    } finally {
      setIsTreeLoading(false)
    }
  }, [currentWorkspace])

  const openFile = useCallback(async (filePath: string) => {
    setIsFileLoading(true)
    setEditorError(null)

    try {
      const response = await window.electronAPI.file.read(filePath)
      if (!response.success || !response.data) {
        setEditorError(response.error?.message ?? '文件读取失败')
        return
      }

      const content = response.data.content
      const filename = filePath.split('/').filter(Boolean).pop() ?? filePath

      setSelectedNodeId(filePath)
      setEditorContent(content)
      setSavedContentSnapshot(content)
      setSaveStatus('idle')

      setCurrentFile({
        path: filePath,
        name: filename,
        lastModified: Date.now(),
      })
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : '文件读取失败')
    } finally {
      setIsFileLoading(false)
    }
  }, [setCurrentFile])

  const createFileAtPath = useCallback(async (targetPath: string) => {
    try {
      const filename = getBaseName(targetPath)
      const initialContent = `# ${filename.replace(/\.md$/i, '')}\n\n`
      const response = await window.electronAPI.file.write(targetPath, initialContent, {
        atomic: true,
        createDirs: true,
      })

      if (!response.success) {
        setTreeError(response.error?.message ?? '创建文件失败')
        return
      }

      await refreshTree()
      await openFile(targetPath)
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : '创建文件失败')
    }
  }, [openFile, refreshTree])

  const createFolderAtPath = useCallback(async (targetPath: string) => {
    try {
      const response = await window.electronAPI.file.createDir(targetPath, true)
      if (!response.success) {
        setTreeError(response.error?.message ?? '创建文件夹失败')
        return
      }
      await refreshTree()
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : '创建文件夹失败')
    }
  }, [refreshTree])

  const renamePath = useCallback(async (sourcePath: string, targetPath: string) => {
    try {
      const response = await window.electronAPI.file.move(sourcePath, targetPath)
      if (!response.success) {
        throw new Error(response.error?.message ?? '重命名失败')
      }
      await refreshTree()

      if (selectedFilePath === sourcePath) {
        const updatedName = getBaseName(targetPath)
        setCurrentFile({
          path: targetPath,
          name: updatedName,
          lastModified: Date.now(),
        })
      }
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : '重命名失败')
      throw error
    }
  }, [refreshTree, selectedFilePath, setCurrentFile])

  const deleteNode = useCallback(async (node: FileTreeNode) => {
    try {
      const response = node.type === 'folder'
        ? await window.electronAPI.file.deleteDir(node.path, true)
        : await window.electronAPI.file.delete(node.path)

      if (!response.success) {
        throw new Error(response.error?.message ?? '删除失败')
      }

      await refreshTree()

      if (selectedFilePath === node.path) {
        setCurrentFile(null)
        setEditorContent('')
        setSavedContentSnapshot('')
        setSelectedNodeId(undefined)
      }
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : '删除失败')
      throw error
    }
  }, [refreshTree, selectedFilePath, setCurrentFile])

  const moveToFolder = useCallback(async (sourcePath: string, targetFolderPath: string) => {
    const nextPath = joinPath(targetFolderPath, getBaseName(sourcePath))
    try {
      const response = await window.electronAPI.file.move(sourcePath, nextPath)
      if (!response.success) {
        throw new Error(response.error?.message ?? '移动失败')
      }

      await refreshTree()
      if (selectedFilePath === sourcePath) {
        setCurrentFile({
          path: nextPath,
          name: getBaseName(nextPath),
          lastModified: Date.now(),
        })
      }
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : '移动失败')
      throw error
    }
  }, [refreshTree, selectedFilePath, setCurrentFile])

  const copyPath = useCallback(async (path: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(path)
      }
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : '复制路径失败')
      throw error
    }
  }, [])

  const stopStreaming = useCallback(() => {
    if (streamTimerRef.current !== null) {
      window.clearInterval(streamTimerRef.current)
      streamTimerRef.current = null
    }

    setIsStreaming(false)
    setMessages((previous) =>
      previous.map((message) => {
        if (message.streaming) {
          return {
            ...message,
            streaming: false,
            content: `${message.content}\n\n[回答已暂停]`,
          }
        }
        return message
      })
    )
  }, [])

  const sendChatMessage = useCallback(() => {
    const trimmed = chatInput.trim()
    if (!trimmed || isStreaming) {
      return
    }

    const mentions = extractMentionedFiles(trimmed)
    const contextSources = Array.from(
      new Set([
        'CLAUDE.md',
        ...(selectedFilePath ? [selectedFilePath] : []),
        ...mentions,
      ])
    )

    const userMessage: ChatMessage = {
      id: createId('user'),
      role: 'user',
      content: trimmed,
      createdAt: Date.now(),
    }

    const assistantId = createId('assistant')
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      contextSources,
      streaming: true,
    }

    const fullAnswer = createAssistantResponse(trimmed, {
      currentFilePath: selectedFilePath,
    })
    const chunks = fullAnswer.match(/.{1,6}/gs) ?? [fullAnswer]

    setChatInput('')
    setMessages((previous) => [...previous, userMessage, assistantMessage])
    setIsStreaming(true)

    let index = 0
    streamTimerRef.current = window.setInterval(() => {
      const chunk = chunks[index]
      if (!chunk) {
        if (streamTimerRef.current !== null) {
          window.clearInterval(streamTimerRef.current)
          streamTimerRef.current = null
        }
        setIsStreaming(false)
        setMessages((previous) =>
          previous.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  streaming: false,
                }
              : message
          )
        )
        return
      }

      setMessages((previous) =>
        previous.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: `${message.content}${chunk}`,
              }
            : message
        )
      )

      index += 1
    }, STREAM_STEP_MS)
  }, [chatInput, isStreaming, selectedFilePath])

  useEffect(() => {
    void refreshTree()
  }, [refreshTree])

  useEffect(() => {
    if (!selectedFilePath || !isDirty) {
      return
    }

    setSaveStatus('saving')

    const timer = window.setTimeout(async () => {
      try {
        const response = await window.electronAPI.file.write(selectedFilePath, editorContent, {
          atomic: true,
          createDirs: true,
        })

        if (!response.success) {
          setSaveStatus('error')
          setEditorError(response.error?.message ?? '自动保存失败')
          return
        }

        setSavedContentSnapshot(editorContent)
        setSaveStatus('saved')
        window.setTimeout(() => setSaveStatus('idle'), 800)
      } catch (error) {
        setSaveStatus('error')
        setEditorError(error instanceof Error ? error.message : '自动保存失败')
      }
    }, AUTOSAVE_DELAY_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [editorContent, isDirty, selectedFilePath])

  useEffect(() => {
    return () => {
      if (streamTimerRef.current !== null) {
        window.clearInterval(streamTimerRef.current)
      }
    }
  }, [])

  if (!currentWorkspace) {
    return (
      <div className="sibylla-panel p-8">
        <h2 className="text-xl font-semibold text-white">工作台未就绪</h2>
        <p className="mt-2 text-sm text-sys-darkMuted">
          请先在「Workspace 管理」里创建或打开一个工作区，然后再进入 TASK016/017/018 的集成视图。
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Phase 1 工作台</h1>
          <p className="mt-1 text-sm text-sys-darkMuted">
            模块一完成态：文件树 + Markdown 双链编辑 + AI Streaming 对话
          </p>
        </div>
        <div className="rounded-lg border border-sys-darkBorder bg-sys-darkSurface/80 px-3 py-2 font-mono text-xs text-sys-darkMuted">
          {currentWorkspace.config.name}
        </div>
      </div>

      <div className="grid h-[calc(100vh-12.5rem)] min-h-[560px] grid-cols-[280px_minmax(0,1fr)_360px] gap-4">
        <section className="sibylla-panel flex min-h-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <PencilLine className="h-4 w-4" />
              文件树
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => void refreshTree()} title="刷新文件树">
                <RefreshCw className={cn('h-4 w-4', isTreeLoading && 'animate-spin')} />
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-2">
            {isTreeLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-sys-darkMuted">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                加载文件树中...
              </div>
            ) : treeError ? (
              <div className="rounded-lg border border-red-700/60 bg-red-950/40 p-3 text-sm text-red-300">
                {treeError}
              </div>
            ) : treeNodes.length === 0 ? (
              <div className="rounded-lg border border-dashed border-sys-darkBorder p-4 text-sm text-sys-darkMuted">
                这个 workspace 里还没有可见文件，先新建一个 Markdown 文件吧。
              </div>
            ) : (
              <FileTree
                data={treeNodes}
                selectedId={selectedNodeId}
                defaultExpandedIds={defaultExpandedIds}
                openPaths={openFilePaths}
                dirtyPaths={dirtyFilePaths}
                onRefresh={refreshTree}
                onCreateFile={createFileAtPath}
                onCreateFolder={createFolderAtPath}
                onRename={renamePath}
                onDelete={deleteNode}
                onMove={moveToFolder}
                onCopyPath={copyPath}
                onSelect={(node) => {
                  setSelectedNodeId(node.path)
                  if (node.type === 'file') {
                    void openFile(node.path)
                  }
                }}
              />
            )}
          </div>
        </section>

        <section className="sibylla-panel flex min-h-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-white">
                {currentFile?.name ?? '未打开文件'}
                {isDirty ? ' *' : ''}
              </h2>
              <p className="font-mono text-[11px] text-sys-darkMuted">
                {selectedFilePath ?? '从左侧选择文件开始编辑'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="rounded-xl border border-sys-darkBorder bg-sys-black p-1">
                {(['edit', 'preview', 'split'] as EditorMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setEditorMode(mode)}
                    className={cn(
                      'rounded px-2 py-1 text-xs font-medium transition-colors',
                      editorMode === mode
                        ? 'bg-white text-black shadow-sm'
                        : 'text-sys-darkMuted hover:text-white'
                    )}
                  >
                    {mode === 'edit' ? '编辑' : mode === 'preview' ? '预览' : '分栏'}
                  </button>
                ))}
              </div>

              <div className="flex min-w-[88px] items-center justify-end text-xs text-sys-darkMuted">
                {saveStatus === 'saving' && (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> 保存中
                  </span>
                )}
                {saveStatus === 'saved' && (
                  <span className="inline-flex items-center gap-1 text-white">
                    <Save className="h-3.5 w-3.5" /> 已保存
                  </span>
                )}
                {saveStatus === 'error' && <span className="text-red-300">保存失败</span>}
                {saveStatus === 'idle' && !isDirty && <span>已同步</span>}
              </div>
            </div>
          </div>

          {editorError && (
            <div className="border-b border-red-700/40 bg-red-950/30 px-4 py-2 text-sm text-red-300">
              {editorError}
            </div>
          )}

          <div
            className={cn(
              'min-h-0 flex-1 gap-0',
              editorMode === 'split' ? 'grid grid-cols-2' : 'grid grid-cols-1'
            )}
          >
            {(editorMode === 'edit' || editorMode === 'split') && (
              <div className="min-h-0 border-r border-white/10">
                {isFileLoading ? (
                  <div className="flex h-full items-center justify-center text-sm text-sys-darkMuted">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 正在加载文件...
                  </div>
                ) : (
                  <textarea
                    className="h-full w-full resize-none border-0 bg-sys-black/60 p-4 font-mono text-sm leading-6 text-white focus:outline-none"
                    placeholder="打开一个 Markdown 文件后即可编辑"
                    value={editorContent}
                    onChange={(event) => setEditorContent(event.target.value)}
                    disabled={!selectedFilePath}
                  />
                )}
              </div>
            )}

            {(editorMode === 'preview' || editorMode === 'split') && (
              <div className="min-h-0 overflow-auto bg-sys-black/70 p-4">
                {selectedFilePath ? (
                  <article className="markdown-preview prose-sm max-w-none text-sm leading-7 text-white">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {editorContent || '*空文档*'}
                    </ReactMarkdown>
                  </article>
                ) : (
                  <p className="text-sm text-sys-darkMuted">
                    预览区：请先选择一个 Markdown 文件。
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="sibylla-panel flex min-h-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <PixelOctoIcon className="h-4 w-4" />
              AI 对话
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMessages([])}
                disabled={isStreaming || messages.length === 0}
              >
                新会话
              </Button>
              {isStreaming && (
                <Button size="sm" variant="ghost" onClick={stopStreaming}>
                  <Square className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
            {messages.length === 0 ? (
              <div className="rounded-lg border border-dashed border-sys-darkBorder p-4 text-sm text-sys-darkMuted">
                <p className="inline-flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  这里会展示流式回答。输入消息后按 Enter 发送。
                </p>
                <p className="mt-2 text-xs">支持在输入中使用 @文件名 引用额外上下文。</p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                    className={cn(
                      'rounded-lg px-3 py-2 text-sm leading-6',
                      message.role === 'user'
                        ? 'ml-8 bg-white text-black'
                        : 'mr-8 border border-white/10 bg-sys-black/70 text-white'
                    )}
                  >
                  <p className="whitespace-pre-wrap">{message.content || (message.streaming ? '...' : '')}</p>
                  {message.role === 'assistant' && message.contextSources && message.contextSources.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {message.contextSources.map((source) => (
                        <span
                          key={`${message.id}-${source}`}
                          className="rounded border border-white/10 bg-sys-darkSurface px-1.5 py-0.5 font-mono text-[10px] text-sys-darkMuted"
                        >
                          {source}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="border-t border-white/10 p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    sendChatMessage()
                  }
                }}
                className="max-h-40 min-h-[44px] flex-1 resize-y rounded-xl border border-sys-darkBorder bg-sys-black/70 px-3 py-2 text-sm text-white focus:border-white/70 focus:outline-none"
                placeholder="输入消息，回车发送（Shift+Enter 换行）"
              />
              <Button
                variant="primary"
                onClick={sendChatMessage}
                disabled={!chatInput.trim() || isStreaming}
                title="发送"
              >
                {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
