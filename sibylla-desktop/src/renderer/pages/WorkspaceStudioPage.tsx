import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FileWatchEvent } from '../../shared/types'
import type { AIStreamEnd, AIStreamError } from '../../shared/types'
import {
  useAppStore,
  selectCurrentWorkspace,
} from '../store/appStore'
import type { FileInfo } from '../store/appStore'
import {
  getBaseName,
  joinPath,
  normalizePath,
  type FileTreeNode,
} from '../components/layout/file-tree.utils'
import { useFileTreeStore } from '../store/fileTreeStore'
import { useTabStore } from '../store/tabStore'
import { useSyncStatusStore, selectStatus } from '../store/syncStatusStore'
import {
  useAIChatStore,
  selectMessages,
  selectIsStreaming,
  selectSessionTokenUsage,
  selectConversationId,
  selectHasMoreHistory,
  selectIsLoadingHistory,
} from '../store/aiChatStore'
import { useSearchStore, selectResults, selectIsSearching, selectQuery } from '../store/searchStore'
import {
  useDiffReviewStore,
  selectProposals,
  selectActiveIndex,
  selectIsApplying,
  selectIsEditing,
  selectEditingContent,
  selectAppliedPaths,
  selectFailedPath,
  selectErrorMessage,
} from '../store/diffReviewStore'
import { parseDiffBlocksWithFileRead } from '../utils/diffParser'
import { useAIStream } from '../hooks/useAIStream'
import {
  StudioAIPanel,
  StudioEditorPanel,
  StudioLeftPanel,
  type EditorMode,
  type SaveStatus,
} from '../components/studio'
import type {
  LeftToolMode,
  NotificationItem,
  NotificationLevel,
  SearchResultItem,
  TaskItem,
  ChatMessage,
} from '../components/studio/types'

const AUTOSAVE_DELAY_MS = 900
const MAX_NOTIFICATIONS = 60
const MAX_TASK_FILE_SIZE = 768 * 1024
const QUICK_AI_PROMPT_PREFIX = 'Create file:'

const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdx'])

const TASK_LINE_REGEX = /^(\s*[-*]\s\[)( |x|X)(\]\s+)(.*)$/

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function extractMentionedFiles(input: string): string[] {
  const mentions = new Set<string>()
  const mentionRegex = /@([\w./-]+)/g
  let matched = mentionRegex.exec(input)
  while (matched) {
    if (matched[1]) {
      mentions.add(normalizePath(matched[1]))
    }
    matched = mentionRegex.exec(input)
  }
  return Array.from(mentions)
}

function normalizeExtension(extension?: string): string {
  return (extension ?? '').replace(/^\./, '').toLowerCase()
}

function isMarkdownFile(file: FileInfo): boolean {
  if (file.isDirectory) {
    return false
  }
  return MARKDOWN_EXTENSIONS.has(normalizeExtension(file.extension))
}

function hasConflictMarkers(content: string): boolean {
  return content.includes('<<<<<<<') && content.includes('=======') && content.includes('>>>>>>>')
}

function mergeConflictTexts(yours: string, theirs: string): string {
  const merged: string[] = []
  const seen = new Set<string>()

  for (const line of [...yours.split('\n'), ...theirs.split('\n')]) {
    const key = line.trim()
    if (!key || seen.has(key)) {
      continue
    }
    merged.push(line)
    seen.add(key)
  }

  return merged.join('\n').trim()
}

function toPrefixedLines(text: string, prefix: '- ' | '+ ', limit: number = 6): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit)
    .map((line) => `${prefix}${line}`)
}

function resolveConflictMarkers(content: string, strategy: 'yours' | 'theirs' | 'ai'): string {
  const regex = /<<<<<<<[^\n]*\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>>[^\n]*(?:\n|$)/g

  return content.replace(regex, (_matched, yoursRaw: string, theirsRaw: string) => {
    const yours = yoursRaw.trimEnd()
    const theirs = theirsRaw.trimEnd()

    if (strategy === 'yours') {
      return `${yours}\n`
    }
    if (strategy === 'theirs') {
      return `${theirs}\n`
    }

    const merged = mergeConflictTexts(yours, theirs)
    return `${merged}\n`
  })
}

interface ConflictDraft {
  filePath: string
  yourLines: string[]
  theirLines: string[]
  aiMergeText: string
  yourResolvedText: string
  theirResolvedText: string
  aiResolvedText: string
}

function buildConflictDraft(filePath: string, fileContent: string, currentEditorContent: string): ConflictDraft {
  if (hasConflictMarkers(fileContent)) {
    const firstBlockRegex = /<<<<<<<[^\n]*\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>>[^\n]*/
    const matched = fileContent.match(firstBlockRegex)
    const yours = matched?.[1]?.trim() ?? ''
    const theirs = matched?.[2]?.trim() ?? ''
    const ai = mergeConflictTexts(yours, theirs)

    return {
      filePath,
      yourLines: toPrefixedLines(yours, '- '),
      theirLines: toPrefixedLines(theirs, '+ '),
      aiMergeText: ai || 'AI 建议保留双方关键信息并去重。',
      yourResolvedText: resolveConflictMarkers(fileContent, 'yours'),
      theirResolvedText: resolveConflictMarkers(fileContent, 'theirs'),
      aiResolvedText: resolveConflictMarkers(fileContent, 'ai'),
    }
  }

  const yoursFallback = currentEditorContent || fileContent
  const theirsFallback = fileContent
  const aiFallback = mergeConflictTexts(yoursFallback, theirsFallback) || theirsFallback

  return {
    filePath,
    yourLines: toPrefixedLines(yoursFallback, '- '),
    theirLines: toPrefixedLines(theirsFallback, '+ '),
    aiMergeText: aiFallback,
    yourResolvedText: yoursFallback,
    theirResolvedText: theirsFallback,
    aiResolvedText: aiFallback,
  }
}

export function WorkspaceStudioPage() {
  const currentWorkspace = useAppStore(selectCurrentWorkspace)
  const tabState = useTabStore()
  const activeTabId = tabState.activeTabId
  const tabs = tabState.tabs

  const [workspaceFiles, setWorkspaceFiles] = useState<FileInfo[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(undefined)

  const storeTree = useFileTreeStore((s) => s.tree)
  const storeIsLoading = useFileTreeStore((s) => s.isLoading)
  const storeError = useFileTreeStore((s) => s.error)

  const [editorMode, setEditorMode] = useState<EditorMode>('split')
  const [editorContent, setEditorContent] = useState('')
  const [savedContentSnapshot, setSavedContentSnapshot] = useState('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')

  const [isFileLoading, setIsFileLoading] = useState(false)
  const [editorError, setEditorError] = useState<string | null>(null)

  const [activeTool, setActiveTool] = useState<LeftToolMode>(null)
  const searchStore = useSearchStore()
  const searchQuery = useSearchStore(selectQuery)
  const searchResults = useSearchStore(selectResults)
  const isSearching = useSearchStore(selectIsSearching)

  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [isTasksLoading, setIsTasksLoading] = useState(false)

  const [notifications, setNotifications] = useState<NotificationItem[]>([])

  const syncStatusValue = useSyncStatusStore(selectStatus)

  const messages = useAIChatStore(selectMessages)
  const isStreaming = useAIChatStore(selectIsStreaming)
  const sessionTokenUsage = useAIChatStore(selectSessionTokenUsage)
  const conversationId = useAIChatStore(selectConversationId)
  const hasMoreHistory = useAIChatStore(selectHasMoreHistory)
  const isLoadingHistory = useAIChatStore(selectIsLoadingHistory)
  const aiChatStore = useAIChatStore()
  const [chatInput, setChatInput] = useState('')
  const [focusComposerSignal, setFocusComposerSignal] = useState(0)

  const [conflictDraft, setConflictDraft] = useState<ConflictDraft | null>(null)

  const selectedFileRef = useRef<string | null>(null)
  const isDirtyRef = useRef(false)
  const editorContentRef = useRef('')
  const conversationIdRef = useRef<string | null>(null)

  const workspaceId = currentWorkspace?.config.workspaceId ?? null

  const selectedFilePath = useMemo(() => activeTabId ?? null, [activeTabId])
  const selectedFilePathNormalized = useMemo(
    () => (selectedFilePath ? normalizePath(selectedFilePath) : null),
    [selectedFilePath]
  )

  const isDirty = useMemo(() => {
    if (!selectedFilePath) {
      return false
    }
    return editorContent !== savedContentSnapshot
  }, [editorContent, savedContentSnapshot, selectedFilePath])

  const openFilePaths = useMemo(
    () => tabs.map((tab) => tab.filePath),
    [tabs]
  )

  const dirtyFilePaths = useMemo(
    () => tabs.filter((t) => t.isDirty).map((t) => t.filePath),
    [tabs]
  )

  const unreadNotificationCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications]
  )

  const workspaceFileEntries = useMemo(
    () => workspaceFiles.filter((file) => !file.isDirectory),
    [workspaceFiles]
  )

  useEffect(() => {
    selectedFileRef.current = selectedFilePathNormalized
  }, [selectedFilePathNormalized])

  useEffect(() => {
    isDirtyRef.current = isDirty
  }, [isDirty])

  useEffect(() => {
    editorContentRef.current = editorContent
  }, [editorContent])

  useEffect(() => {
    conversationIdRef.current = conversationId
  }, [conversationId])

  useEffect(() => {
    if (!window.electronAPI?.conversation) return
    const store = useAIChatStore.getState()
    if (store.conversationId || store.messages.length > 0) return

    window.electronAPI.conversation.loadLatest().then((response) => {
      if (!response.success || !response.data) return
      const { conversationId: convId, messages: loaded, hasMore } = response.data
      if (loaded.length === 0) return

      useAIChatStore.getState().setConversationId(convId)
      useAIChatStore.getState().setHasMoreHistory(hasMore)
      const chatMessages: ChatMessage[] = loaded.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        contextSources: m.contextSources,
        traceId: m.traceId ?? undefined,
        memoryState: m.memoryState,
        ragHits: m.ragHits ?? undefined,
      }))
      useAIChatStore.getState().prependHistoryMessages(chatMessages)
    }).catch(() => { /* ignore */ })
  }, [])

  const loadMoreHistory = useCallback(async () => {
    if (!window.electronAPI?.conversation) return
    const store = useAIChatStore.getState()
    if (!store.conversationId || store.isLoadingHistory || !store.hasMoreHistory) return

    store.setIsLoadingHistory(true)
    try {
      const oldestTimestamp = store.messages.length > 0
        ? store.messages[0].createdAt
        : undefined
      const response = await window.electronAPI.conversation.getMessages(
        store.conversationId,
        30,
        oldestTimestamp
      )
      if (!response.success || !response.data) return

      const { messages: loaded, hasMore } = response.data
      useAIChatStore.getState().setHasMoreHistory(hasMore)
      if (loaded.length === 0) return

      const chatMessages: ChatMessage[] = loaded.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        contextSources: m.contextSources,
        traceId: m.traceId ?? undefined,
        memoryState: m.memoryState,
        ragHits: m.ragHits ?? undefined,
      }))
      useAIChatStore.getState().prependHistoryMessages(chatMessages)
    } finally {
      useAIChatStore.getState().setIsLoadingHistory(false)
    }
  }, [])

  const pushNotification = useCallback(
    (level: NotificationLevel, title: string, description: string) => {
      const item: NotificationItem = {
        id: createId('notice'),
        level,
        title,
        description,
        read: false,
        timestamp: Date.now(),
      }
      setNotifications((previous) => [item, ...previous].slice(0, MAX_NOTIFICATIONS))
    },
    []
  )

  const refreshTree = useCallback(async () => {
    if (!currentWorkspace) {
      useFileTreeStore.getState().setTree([])
      setWorkspaceFiles([])
      return
    }

    const store = useFileTreeStore.getState()
    store.setError(null)
    useFileTreeStore.setState({ isLoading: true })

    try {
      const response = await window.electronAPI.file.list('', {
        recursive: true,
        includeHidden: false,
      })

      if (!response.success || !response.data) {
        store.setError(response.error?.message ?? '文件树加载失败')
        setWorkspaceFiles([])
        return
      }

      const { buildTreeFromFiles } = await import('../components/layout/file-tree.utils')
      const tree = buildTreeFromFiles(response.data)
      useFileTreeStore.getState().setTree(tree)
      setWorkspaceFiles(response.data)

      if (selectedFileRef.current) {
        const stillExists = response.data.some(
          (file) => !file.isDirectory && normalizePath(file.path) === selectedFileRef.current
        )
        if (!stillExists) {
          useTabStore.getState().markTabDeleted(selectedFileRef.current)
          setSelectedNodeId(undefined)
          setEditorContent('')
          setSavedContentSnapshot('')
          setSaveStatus('idle')
        }
      }
    } catch (error) {
      store.setError(error instanceof Error ? error.message : '文件树加载失败')
      setWorkspaceFiles([])
    } finally {
      useFileTreeStore.setState({ isLoading: false })
    }
  }, [currentWorkspace])

  const openFile = useCallback(
    async (filePath: string) => {
      const normalizedPath = normalizePath(filePath)
      setIsFileLoading(true)
      setEditorError(null)

      try {
        const response = await window.electronAPI.file.read(normalizedPath)
        if (!response.success || !response.data) {
          setEditorError(response.error?.message ?? '文件读取失败')
          return
        }

        const content = response.data.content
        const filename = normalizedPath.split('/').filter(Boolean).pop() ?? normalizedPath

        setSelectedNodeId(normalizedPath)
        setEditorContent(content)
        setSavedContentSnapshot(content)
        setSaveStatus('idle')

        useTabStore.getState().openTab(normalizedPath, filename)
      } catch (error) {
        setEditorError(error instanceof Error ? error.message : '文件读取失败')
      } finally {
        setIsFileLoading(false)
      }
    },
    []
  )

  const loadTasks = useCallback(async () => {
    if (!currentWorkspace) {
      setTasks([])
      return
    }

    setIsTasksLoading(true)

    try {
      const markdownFiles = workspaceFileEntries.filter(isMarkdownFile).slice(0, 240)
      const nextTasks: TaskItem[] = []

      for (const file of markdownFiles) {
        if (nextTasks.length >= 300) {
          break
        }

        const readResult = await window.electronAPI.file.read(file.path, {
          maxSize: MAX_TASK_FILE_SIZE,
        })
        if (!readResult.success || !readResult.data) {
          continue
        }

        const lines = readResult.data.content.split('\n')
        for (const [index, line] of lines.entries()) {
          if (nextTasks.length >= 300) {
            break
          }

          const matched = line.match(TASK_LINE_REGEX)
          if (!matched) {
            continue
          }

          nextTasks.push({
            id: `${file.path}:${index + 1}`,
            path: normalizePath(file.path),
            lineNumber: index + 1,
            text: matched[4]?.trim() ?? '(空任务)',
            completed: matched[2]?.toLowerCase() === 'x',
          })
        }
      }

      setTasks(nextTasks)
    } catch (error) {
      pushNotification(
        'error',
        '任务面板加载失败',
        error instanceof Error ? error.message : '无法解析 Markdown 任务项'
      )
    } finally {
      setIsTasksLoading(false)
    }
  }, [currentWorkspace, pushNotification, workspaceFileEntries])

  const createFileAtPath = useCallback(
    async (targetPath: string) => {
      try {
        const filename = getBaseName(targetPath)
        const initialContent = `# ${filename.replace(/\.md$/i, '')}\n\n`
        const response = await window.electronAPI.file.write(targetPath, initialContent, {
          atomic: true,
          createDirs: true,
        })

        if (!response.success) {
          useFileTreeStore.getState().setError(response.error?.message ?? '创建文件失败')
          return
        }

        await refreshTree()
        await loadTasks()
        await openFile(targetPath)
      } catch (error) {
        useFileTreeStore.getState().setError(error instanceof Error ? error.message : '创建文件失败')
      }
    },
    [loadTasks, openFile, refreshTree]
  )

  const createFolderAtPath = useCallback(
    async (targetPath: string) => {
      try {
        const response = await window.electronAPI.file.createDir(targetPath, true)
        if (!response.success) {
          useFileTreeStore.getState().setError(response.error?.message ?? '创建文件夹失败')
          return
        }
        await refreshTree()
      } catch (error) {
        useFileTreeStore.getState().setError(error instanceof Error ? error.message : '创建文件夹失败')
      }
    },
    [refreshTree]
  )

  const renamePath = useCallback(
    async (sourcePath: string, targetPath: string) => {
      try {
        const response = await window.electronAPI.file.move(sourcePath, targetPath)
        if (!response.success) {
          throw new Error(response.error?.message ?? '重命名失败')
        }
        await refreshTree()
        await loadTasks()

        if (selectedFilePath === sourcePath) {
          const updatedName = getBaseName(targetPath)
          const tabStore = useTabStore.getState()
          tabStore.closeTab(normalizePath(sourcePath), true)
          tabStore.openTab(normalizePath(targetPath), updatedName)
        }
      } catch (error) {
        useFileTreeStore.getState().setError(error instanceof Error ? error.message : '重命名失败')
        throw error
      }
    },
    [loadTasks, refreshTree, selectedFilePath]
  )

  const deleteNode = useCallback(
    async (node: FileTreeNode) => {
      try {
        const response =
          node.type === 'folder'
            ? await window.electronAPI.file.deleteDir(node.path, true)
            : await window.electronAPI.file.delete(node.path)

        if (!response.success) {
          throw new Error(response.error?.message ?? '删除失败')
        }

        await refreshTree()
        await loadTasks()

        if (selectedFilePath === node.path) {
          useTabStore.getState().markTabDeleted(node.path)
          setEditorContent('')
          setSavedContentSnapshot('')
          setSelectedNodeId(undefined)
        }
      } catch (error) {
        useFileTreeStore.getState().setError(error instanceof Error ? error.message : '删除失败')
        throw error
      }
    },
    [loadTasks, refreshTree, selectedFilePath]
  )

  const moveToFolder = useCallback(
    async (sourcePath: string, targetFolderPath: string) => {
      const nextPath = joinPath(targetFolderPath, getBaseName(sourcePath))
      try {
        const response = await window.electronAPI.file.move(sourcePath, nextPath)
        if (!response.success) {
          throw new Error(response.error?.message ?? '移动失败')
        }

        await refreshTree()
        await loadTasks()
        if (selectedFilePath === sourcePath) {
          const tabStore = useTabStore.getState()
          tabStore.closeTab(normalizePath(sourcePath), true)
          tabStore.openTab(normalizePath(nextPath), getBaseName(nextPath))
        }
      } catch (error) {
        useFileTreeStore.getState().setError(error instanceof Error ? error.message : '移动失败')
        throw error
      }
    },
    [loadTasks, refreshTree, selectedFilePath]
  )

  const copyPath = useCallback(async (path: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(path)
      }
    } catch (error) {
      useFileTreeStore.getState().setError(error instanceof Error ? error.message : '复制路径失败')
      throw error
    }
  }, [])

  const closeOpenFileTab = useCallback(
    (path: string) => {
      const normalizedPath = normalizePath(path)
      useTabStore.getState().closeTab(normalizedPath, true)

      const remainingTabs = useTabStore.getState().tabs
      if (remainingTabs.length > 0) {
        const nextActive = useTabStore.getState().activeTabId
        if (nextActive) {
          void openFile(nextActive)
        }
      } else {
        setEditorContent('')
        setSavedContentSnapshot('')
        setSelectedNodeId(undefined)
        setSaveStatus('idle')
      }
    },
    [openFile]
  )

  const openSearchResult = useCallback(
    async (result: SearchResultItem) => {
      await openFile(result.path)
      setActiveTool('search')
      setEditorMode('split')
      pushNotification('info', '已定位搜索结果', `${result.path}:${result.lineNumber}`)
    },
    [openFile, pushNotification]
  )

  const toggleTask = useCallback(
    async (task: TaskItem) => {
      const readResult = await window.electronAPI.file.read(task.path, { maxSize: MAX_TASK_FILE_SIZE })
      if (!readResult.success || !readResult.data) {
        pushNotification('error', '任务更新失败', readResult.error?.message ?? '读取任务文件失败')
        return
      }

      const lines = readResult.data.content.split('\n')
      const lineIndex = task.lineNumber - 1
      const originalLine = lines[lineIndex]
      if (!originalLine) {
        pushNotification('warning', '任务更新失败', '目标任务行不存在，文件可能已变化')
        return
      }

      const matched = originalLine.match(TASK_LINE_REGEX)
      if (!matched) {
        pushNotification('warning', '任务更新失败', '目标行不再是有效的任务项')
        return
      }

      lines[lineIndex] = `${matched[1]}${task.completed ? ' ' : 'x'}${matched[3]}${matched[4]}`
      const nextContent = lines.join('\n')

      const writeResult = await window.electronAPI.file.write(task.path, nextContent, {
        atomic: true,
        createDirs: true,
      })

      if (!writeResult.success) {
        pushNotification('error', '任务更新失败', writeResult.error?.message ?? '写入失败')
        return
      }

      if (selectedFileRef.current === normalizePath(task.path)) {
        setEditorContent(nextContent)
        setSavedContentSnapshot(nextContent)
        setSaveStatus('saved')
        window.setTimeout(() => setSaveStatus('idle'), 800)
      }

      await loadTasks()
      pushNotification('success', '任务已更新', `${task.text} → ${task.completed ? '未完成' : '已完成'}`)
    },
    [loadTasks, pushNotification]
  )

  const openTaskFile = useCallback(
    async (task: TaskItem) => {
      await openFile(task.path)
      setActiveTool('tasks')
      setEditorMode('split')
      pushNotification('info', 'Task opened', `${task.path}:${task.lineNumber}`)
    },
    [openFile, pushNotification]
  )

  const quickStartAIPrompt = useCallback(() => {
    setChatInput((previous) => {
      const trimmed = previous.trim()
      if (!trimmed) {
        return QUICK_AI_PROMPT_PREFIX
      }
      if (trimmed.startsWith(QUICK_AI_PROMPT_PREFIX)) {
        return previous
      }
      return `${QUICK_AI_PROMPT_PREFIX}\n${previous}`
    })
    setFocusComposerSignal((value) => value + 1)
  }, [])

  const { startStream, abortStream } = useAIStream({
    onStreamEnd: (end: AIStreamEnd) => {
      void (async () => {
        const currentPath = selectedFileRef.current
        const currentContent = editorContentRef.current

        const diffProposals = await parseDiffBlocksWithFileRead(
          end.content,
          currentPath ?? '',
          currentContent
        )

        if (diffProposals.length > 0) {
          useDiffReviewStore.getState().setProposals(diffProposals)

          const state = useAIChatStore.getState()
          const msgId = end.id
          useAIChatStore.setState({
            messages: state.messages.map((m) =>
              m.id === msgId ? { ...m, diffProposals } : m
            ),
          })
        }

        const convId = conversationIdRef.current
        if (convId && window.electronAPI?.conversation) {
          try {
            await window.electronAPI.conversation.appendMessage({
              id: end.id,
              conversationId: convId,
              role: 'assistant',
              content: end.content,
              createdAt: Date.now(),
              contextSources: end.ragHits?.map((h) => h.path) ?? [],
              traceId: null,
              memoryState: {
                tokenCount: end.memory.tokenCount,
                tokenDebt: end.memory.tokenDebt,
                flushTriggered: end.memory.flushTriggered,
              },
              ragHits: end.ragHits ?? null,
            })
          } catch { /* non-blocking */ }
        }
      })()

      if (end.intercepted) {
        pushNotification('warning', 'LLM 网关已拦截请求', end.warnings.join('；') || '请检查策略和提示词')
      }

      if (end.memory.flushTriggered) {
        pushNotification(
          'warning',
          'MEMORY 已触发压缩',
          `token=${end.memory.tokenCount} debt=${end.memory.tokenDebt}`
        )
      }

      if (end.warnings.length > 0) {
        pushNotification('warning', 'AI 返回警告', end.warnings.join('；'))
      }

      if (!end.intercepted && end.warnings.length === 0) {
        pushNotification(
          'success',
          'AI 响应完成',
          `${end.provider}/${end.model} · ${end.usage.totalTokens} tokens`
        )
      }
    },
    onStreamError: (error: AIStreamError) => {
      pushNotification('error', 'AI 请求失败', error.message)
    },
  })

  const stopStreaming = useCallback(() => {
    const state = useAIChatStore.getState()
    const streamId = state.activeStreamId ?? state.messages.find((m) => m.streaming)?.id
    if (streamId) {
      abortStream(streamId)
    }
    pushNotification('info', 'AI 请求已停止', '你可以继续发送下一条消息。')
  }, [abortStream, pushNotification])

  const sendChatMessage = useCallback((manualRefs?: string[], skillRefs?: string[]) => {
    const trimmed = chatInput.trim()
    if (!trimmed || isStreaming) {
      return
    }

    const mentions = extractMentionedFiles(trimmed)
    const initialSources = Array.from(
      new Set([
        ...(selectedFilePath ? [selectedFilePath] : []),
        ...mentions,
        ...(skillRefs ?? []).map((id) => `⚡ skills/${id}.md`),
      ])
    )

    const userMsgId = useAIChatStore.getState().addUserMessage(trimmed)

    const assistantId = createId('assistant')
    useAIChatStore.getState().addAssistantPlaceholder(assistantId, initialSources)
    setChatInput('')

    void (async () => {
      try {
        const store = useAIChatStore.getState()
        let convId = store.conversationId

        if (!convId && window.electronAPI?.conversation) {
          convId = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
          await window.electronAPI.conversation.create(convId)
          useAIChatStore.getState().setConversationId(convId)
        }

        if (convId && window.electronAPI?.conversation) {
          await window.electronAPI.conversation.appendMessage({
            id: userMsgId,
            conversationId: convId,
            role: 'user',
            content: trimmed,
            createdAt: Date.now(),
            contextSources: [],
            traceId: null,
            memoryState: null,
            ragHits: null,
          })
        }
      } catch { /* non-blocking */ }
    })()

    const request = {
      message: trimmed,
      sessionId: `desktop-${workspaceId ?? 'workspace'}`,
      model: currentWorkspace?.config.defaultModel,
      useRag: true,
      contextWindowTokens: 16000,
      sessionTokenUsage,
      streamId: assistantId,
      currentFile: selectedFilePath ?? undefined,
      manualRefs,
      skillRefs,
    }

    startStream(request)
  }, [
    chatInput,
    currentWorkspace?.config.defaultModel,
    isStreaming,
    selectedFilePath,
    sessionTokenUsage,
    startStream,
    workspaceId,
  ])

  const diffReviewStore = useDiffReviewStore()
  const diffReviewProposals = useDiffReviewStore(selectProposals)
  const diffReviewActiveIndex = useDiffReviewStore(selectActiveIndex)
  const diffReviewIsApplying = useDiffReviewStore(selectIsApplying)
  const diffReviewIsEditing = useDiffReviewStore(selectIsEditing)
  const diffReviewEditingContent = useDiffReviewStore(selectEditingContent)
  const diffReviewAppliedPaths = useDiffReviewStore(selectAppliedPaths)
  const diffReviewFailedPath = useDiffReviewStore(selectFailedPath)
  const diffReviewErrorMessage = useDiffReviewStore(selectErrorMessage)

  const handleDiffApply = useCallback(
    async (filePath: string) => {
      await diffReviewStore.applyProposal(filePath)
      await refreshTree()
      await loadTasks()

      if (selectedFileRef.current === filePath) {
        const proposal = diffReviewStore.proposals.find((p) => p.filePath === filePath)
        if (proposal) {
          setEditorContent(proposal.fullNewContent)
          setSavedContentSnapshot(proposal.fullNewContent)
          setSaveStatus('saved')
          window.setTimeout(() => setSaveStatus('idle'), 800)
        }
      }

      pushNotification('success', '修改已应用', filePath)
    },
    [diffReviewStore, loadTasks, pushNotification, refreshTree]
  )

  const handleDiffApplyAll = useCallback(async () => {
    await diffReviewStore.applyAll()
    await refreshTree()
    await loadTasks()
    pushNotification('success', '全部修改已应用', `${diffReviewStore.proposals.length} 个文件`)
  }, [diffReviewStore, loadTasks, pushNotification, refreshTree])

  const handleDiffApplyEdited = useCallback(async () => {
    await diffReviewStore.applyEdited()
    await refreshTree()
    await loadTasks()
    pushNotification('success', '编辑后修改已应用', '')
  }, [diffReviewStore, loadTasks, pushNotification, refreshTree])

  const handleDiffRollback = useCallback(async () => {
    await diffReviewStore.rollbackApplied()
    await refreshTree()
    await loadTasks()
    pushNotification('info', '已回滚修改', '已恢复到修改前的内容')
  }, [diffReviewStore, loadTasks, pushNotification, refreshTree])

  const diffReviewPanelProps = useMemo(() => {
    if (diffReviewProposals.length === 0) return null
    return {
      proposals: diffReviewProposals,
      activeIndex: diffReviewActiveIndex,
      isApplying: diffReviewIsApplying,
      isEditing: diffReviewIsEditing,
      editingContent: diffReviewEditingContent,
      appliedPaths: diffReviewAppliedPaths,
      failedPath: diffReviewFailedPath,
      errorMessage: diffReviewErrorMessage,
      onApply: handleDiffApply,
      onApplyAll: handleDiffApplyAll,
      onStartEditing: () => diffReviewStore.startEditing(),
      onCancelEditing: () => diffReviewStore.cancelEditing(),
      onEditingContentChange: (content: string) => diffReviewStore.updateEditingContent(content),
      onApplyEdited: handleDiffApplyEdited,
      onRollback: handleDiffRollback,
      onDismiss: () => diffReviewStore.dismiss(),
      onClearError: () => diffReviewStore.clearError(),
      onSetActiveIndex: (index: number) => diffReviewStore.setActiveIndex(index),
    }
  }, [
    diffReviewProposals,
    diffReviewActiveIndex,
    diffReviewIsApplying,
    diffReviewIsEditing,
    diffReviewEditingContent,
    diffReviewAppliedPaths,
    diffReviewFailedPath,
    diffReviewErrorMessage,
    handleDiffApply,
    handleDiffApplyAll,
    handleDiffApplyEdited,
    handleDiffRollback,
    diffReviewStore,
  ])

  const resolveConflictBy = useCallback(
    (strategy: 'yours' | 'theirs' | 'ai' | 'manual') => {
      if (!conflictDraft) {
        return
      }

      if (strategy === 'manual') {
        setEditorMode('edit')
        pushNotification('info', '已切换手动编辑', '你可以在编辑区手动处理冲突内容。')
        return
      }

      const source = editorContentRef.current
      let resolved = source

      if (hasConflictMarkers(source)) {
        resolved = resolveConflictMarkers(source, strategy)
      } else if (strategy === 'yours') {
        resolved = conflictDraft.yourResolvedText
      } else if (strategy === 'theirs') {
        resolved = conflictDraft.theirResolvedText
      } else {
        resolved = conflictDraft.aiResolvedText
      }

      setEditorContent(resolved)
      setConflictDraft(null)
      setSaveStatus('saving')
      pushNotification('success', '冲突方案已应用', `策略：${strategy}`)
    },
    [conflictDraft, pushNotification]
  )

  useEffect(() => {
    void refreshTree()
  }, [refreshTree])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  useEffect(() => {
    if (activeTool !== 'search') {
      return
    }

    const trimmed = searchQuery.trim()
    if (!trimmed) {
      searchStore.clearResults()
      return
    }

    searchStore.setQuery(trimmed)
  }, [activeTool, searchQuery, searchStore])

  useEffect(() => {
    if (!workspaceId) {
      return
    }

    let unlistenFile: (() => void) | null = null
    let unlistenSync: (() => void) | null = null
    let disposed = false

    const setup = async () => {
      try {
        const watchResult = await window.electronAPI.file.startWatching()
        if (!watchResult.success) {
          pushNotification('warning', '文件监听不可用', watchResult.error?.message ?? '监听启动失败')
        }
      } catch (error) {
        pushNotification(
          'warning',
          '文件监听不可用',
          error instanceof Error ? error.message : '监听启动失败'
        )
      }

      if (disposed) {
        return
      }

      unlistenFile = window.electronAPI.file.onFileChange((event: FileWatchEvent) => {
        const changedPath = normalizePath(event.path)

        void refreshTree()
        if (changedPath.toLowerCase().endsWith('.md')) {
          void loadTasks()
        }

        if (selectedFileRef.current === changedPath && !isDirtyRef.current && event.type === 'change') {
          void openFile(changedPath)
        }

        if (event.type === 'unlink' && selectedFileRef.current === changedPath) {
          useTabStore.getState().markTabDeleted(changedPath)
          setEditorContent('')
          setSavedContentSnapshot('')
          setSelectedNodeId(undefined)
        }
      })

      unlistenSync = useSyncStatusStore.subscribe((state, prevState) => {
        if (state.status === prevState.status) return

        if (state.status === 'error') {
          pushNotification('error', '同步失败', state.errorMessage ?? '请检查网络与仓库状态')
          return
        }

        if (state.status === 'synced') {
          pushNotification('success', '同步完成', '工作区已与云端保持一致')
          return
        }

        if (state.status === 'conflict') {
          const conflictPathRaw = state.conflictFiles[0]
          if (!conflictPathRaw) {
            pushNotification('warning', '出现冲突', '检测到冲突但未返回具体文件')
            return
          }

          const conflictPath = normalizePath(conflictPathRaw)
          pushNotification('warning', '发现文件冲突', conflictPath)

          void (async () => {
            const readResult = await window.electronAPI.file.read(conflictPath)
            if (!readResult.success || !readResult.data) {
              return
            }

            const preview = buildConflictDraft(
              conflictPath,
              readResult.data.content,
              selectedFileRef.current === conflictPath ? editorContentRef.current : readResult.data.content
            )
            setConflictDraft(preview)

            if (selectedFileRef.current !== conflictPath) {
              await openFile(conflictPath)
            }
          })()
        }
      })
    }

    void setup()

    return () => {
      disposed = true
      unlistenFile?.()
      unlistenSync?.()
      void window.electronAPI.file.stopWatching().catch(() => undefined)
    }
  }, [loadTasks, openFile, pushNotification, refreshTree, workspaceId])

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
          pushNotification('error', '自动保存失败', response.error?.message ?? '写入失败')
          return
        }

        setSavedContentSnapshot(editorContent)
        setSaveStatus('saved')
        window.setTimeout(() => setSaveStatus('idle'), 800)
      } catch (error) {
        setSaveStatus('error')
        setEditorError(error instanceof Error ? error.message : '自动保存失败')
        pushNotification('error', '自动保存失败', error instanceof Error ? error.message : '写入失败')
      }
    }, AUTOSAVE_DELAY_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [editorContent, isDirty, pushNotification, selectedFilePath])

  useEffect(() => {
    return () => {
      const streamId = aiChatStore.activeStreamId
      if (streamId) {
        abortStream(streamId)
      }
    }
  }, [abortStream, aiChatStore])

  if (!currentWorkspace) {
    return (
      <div className="flex h-full items-center justify-center bg-sys-black p-8">
        <div className="w-full max-w-xl rounded-xl border border-sys-darkBorder bg-[#0A0A0A] p-6">
          <h2 className="text-xl font-semibold text-white">工作台未就绪</h2>
          <p className="mt-2 text-sm text-sys-darkMuted">
            请先在「Workspace 管理」里创建或打开一个工作区，然后再进入 Studio 视图。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 bg-sys-black">
      <StudioLeftPanel
        treeNodes={storeTree}
        selectedNodeId={selectedNodeId}
        openFilePaths={openFilePaths}
        dirtyFilePaths={dirtyFilePaths}
        isTreeLoading={storeIsLoading}
        treeError={storeError}
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
        activeTool={activeTool}
        onChangeTool={setActiveTool}
        searchQuery={searchQuery}
        onSearchQueryChange={(query) => searchStore.setQuery(query)}
        isSearching={isSearching}
        searchResults={searchResults}
        onOpenSearchResult={openSearchResult}
        tasks={tasks}
        isTasksLoading={isTasksLoading}
        onToggleTask={(task) => {
          void toggleTask(task)
        }}
        onOpenTask={(task) => {
          void openTaskFile(task)
        }}
        notifications={notifications}
        unreadNotificationCount={unreadNotificationCount}
        onMarkNotificationRead={(id) => {
          setNotifications((previous) =>
            previous.map((item) => (item.id === id ? { ...item, read: true } : item))
          )
        }}
        onClearNotifications={() => setNotifications([])}
      />

      <StudioEditorPanel
        editorMode={editorMode}
        saveStatus={saveStatus}
        isDirty={isDirty}
        isFileLoading={isFileLoading}
        editorError={editorError}
        editorContent={editorContent}
        onQuickAI={quickStartAIPrompt}
        onChangeEditorMode={setEditorMode}
        onEditorContentChange={setEditorContent}
        onOpenFile={(path) => {
          void openFile(path)
        }}
        onCloseFile={(path) => {
          closeOpenFileTab(path)
        }}
        onSaveFile={async (filePath) => {
          try {
            const response = await window.electronAPI.file.write(filePath, editorContentRef.current, {
              atomic: true,
              createDirs: true,
            })
            if (!response.success) {
              throw new Error(response.error?.message ?? '保存失败')
            }
          } catch (error) {
            pushNotification('error', '保存失败', error instanceof Error ? error.message : '保存失败')
            throw error
          }
        }}
        onRevealInTree={(filePath) => {
          setSelectedNodeId(filePath)
          useFileTreeStore.getState().selectNode(filePath)
        }}
        showConflictPanel={Boolean(conflictDraft)}
        conflictFilePath={conflictDraft?.filePath ?? ''}
        conflictYourLines={conflictDraft?.yourLines}
        conflictTheirLines={conflictDraft?.theirLines}
        conflictAiMergeText={conflictDraft?.aiMergeText}
        onConflictAcceptYours={() => resolveConflictBy('yours')}
        onConflictAcceptTheirs={() => resolveConflictBy('theirs')}
        onConflictAcceptAI={() => resolveConflictBy('ai')}
        onConflictManualEdit={() => resolveConflictBy('manual')}
      />

      <StudioAIPanel
        messages={messages}
        isStreaming={isStreaming}
        chatInput={chatInput}
        onChatInputChange={setChatInput}
        onSendMessage={sendChatMessage}
        onStopStreaming={stopStreaming}
        onNewSession={() => {
          aiChatStore.reset()
          diffReviewStore.dismiss()
          pushNotification('info', '会话已重置', '新的 AI 上下文会从零开始。')
        }}
        onLoadMoreHistory={loadMoreHistory}
        hasMoreHistory={hasMoreHistory}
        isLoadingHistory={isLoadingHistory}
        diffReviewProps={diffReviewPanelProps}
        focusComposerSignal={focusComposerSignal}
      />

      {syncStatusValue !== 'idle' && (
        <div className="pointer-events-none absolute bottom-10 right-6 rounded border border-sys-darkBorder bg-[#090909]/90 px-3 py-1 text-[11px] text-sys-darkMuted">
          Sync: {syncStatusValue}
        </div>
      )}
    </div>
  )
}
