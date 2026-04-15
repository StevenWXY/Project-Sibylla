import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AIChatResponse, FileInfo, FileWatchEvent, SyncStatusData } from '../../shared/types'
import {
  useAppStore,
  selectCurrentFile,
  selectCurrentWorkspace,
  selectOpenFiles,
} from '../store/appStore'
import {
  getBaseName,
  joinPath,
  normalizePath,
  type FileTreeNode,
} from '../components/layout/file-tree.utils'
import { useFileTreeStore } from '../store/fileTreeStore'
import {
  StudioAIPanel,
  StudioEditorPanel,
  StudioLeftPanel,
  type ChatMessage,
  type EditorMode,
  type OpenFileTab,
  type SaveStatus,
} from '../components/studio'
import type {
  DiffProposal,
  LeftToolMode,
  NotificationItem,
  NotificationLevel,
  SearchResultItem,
  TaskItem,
} from '../components/studio/types'

const AUTOSAVE_DELAY_MS = 900
const SEARCH_DEBOUNCE_MS = 260
const MAX_SEARCH_RESULTS = 80
const MAX_NOTIFICATIONS = 60
const MAX_SEARCH_FILE_SIZE = 512 * 1024
const MAX_TASK_FILE_SIZE = 768 * 1024
const QUICK_AI_PROMPT_PREFIX = 'Create file:'

const SEARCHABLE_EXTENSIONS = new Set([
  'md',
  'mdx',
  'txt',
  'json',
  'js',
  'jsx',
  'ts',
  'tsx',
  'css',
  'scss',
  'html',
  'xml',
  'yaml',
  'yml',
  'toml',
  'ini',
  'py',
  'java',
  'go',
  'rs',
  'sql',
  'sh',
])

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

function isSearchableFile(file: FileInfo): boolean {
  if (file.isDirectory) {
    return false
  }
  const extension = normalizeExtension(file.extension)
  if (!extension) {
    return true
  }
  return SEARCHABLE_EXTENSIONS.has(extension)
}

function isMarkdownFile(file: FileInfo): boolean {
  if (file.isDirectory) {
    return false
  }
  return MARKDOWN_EXTENSIONS.has(normalizeExtension(file.extension))
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractFirstCodeBlock(text: string): string | null {
  const matched = text.match(/```(?:[\w+-]+)?\n([\s\S]*?)```/)
  const block = matched?.[1]?.trim()
  return block && block.length > 0 ? block : null
}

function buildDiffProposal(
  userInput: string,
  response: AIChatResponse,
  targetPath: string | null,
  currentContent: string
): DiffProposal | null {
  if (!targetPath) {
    return null
  }

  const fullRewrite = extractFirstCodeBlock(response.content)
  if (fullRewrite && fullRewrite !== currentContent) {
    return {
      targetPath,
      before: currentContent,
      after: fullRewrite,
    }
  }

  const replaceMatch = userInput.match(
    /(?:将|把)[“"']([\s\S]+?)[”"'](?:替换为|替换成|改为|改成)[“"']([\s\S]+?)[”"']/
  )
  const beforeText = replaceMatch?.[1]
  const afterText = replaceMatch?.[2]
  if (beforeText && afterText && currentContent.includes(beforeText)) {
    return {
      targetPath,
      before: beforeText,
      after: afterText,
    }
  }

  return null
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

function applyProposalToContent(currentContent: string, proposal: DiffProposal): string {
  if (proposal.before && currentContent.includes(proposal.before)) {
    return currentContent.replace(new RegExp(escapeRegex(proposal.before)), proposal.after)
  }
  if (proposal.before === currentContent) {
    return proposal.after
  }
  return proposal.after
}

export function WorkspaceStudioPage() {
  const currentWorkspace = useAppStore(selectCurrentWorkspace)
  const currentFile = useAppStore(selectCurrentFile)
  const openFiles = useAppStore(selectOpenFiles)
  const setCurrentFile = useAppStore((state) => state.setCurrentFile)
  const removeOpenFile = useAppStore((state) => state.removeOpenFile)

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
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [isTasksLoading, setIsTasksLoading] = useState(false)

  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [syncStatus, setSyncStatus] = useState<SyncStatusData | null>(null)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [sessionTokenUsage, setSessionTokenUsage] = useState(0)
  const [focusComposerSignal, setFocusComposerSignal] = useState(0)

  const [conflictDraft, setConflictDraft] = useState<ConflictDraft | null>(null)

  const activeAIRequestRef = useRef<string | null>(null)
  const selectedFileRef = useRef<string | null>(null)
  const isDirtyRef = useRef(false)
  const editorContentRef = useRef('')

  const workspaceId = currentWorkspace?.config.workspaceId ?? null

  const selectedFilePath = useMemo(() => currentFile?.path ?? null, [currentFile?.path])
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
    () => openFiles.map((file) => normalizePath(file.path)),
    [openFiles]
  )

  const dirtyFilePaths = useMemo(() => {
    if (!isDirty || !selectedFilePath) {
      return []
    }
    return [normalizePath(selectedFilePath)]
  }, [isDirty, selectedFilePath])

  const openFileTabs = useMemo(() => {
    const map = new Map<string, OpenFileTab>()
    for (const file of openFiles) {
      map.set(normalizePath(file.path), {
        path: normalizePath(file.path),
        name: file.name,
      })
    }
    if (currentFile) {
      map.set(normalizePath(currentFile.path), {
        path: normalizePath(currentFile.path),
        name: currentFile.name,
      })
    }
    return Array.from(map.values())
  }, [currentFile, openFiles])

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
          setCurrentFile(null)
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
  }, [currentWorkspace, setCurrentFile])

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

        setCurrentFile({
          path: normalizedPath,
          name: filename,
          lastModified: Date.now(),
        })
      } catch (error) {
        setEditorError(error instanceof Error ? error.message : '文件读取失败')
      } finally {
        setIsFileLoading(false)
      }
    },
    [setCurrentFile]
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
          setCurrentFile({
            path: targetPath,
            name: updatedName,
            lastModified: Date.now(),
          })
        }
      } catch (error) {
        useFileTreeStore.getState().setError(error instanceof Error ? error.message : '重命名失败')
        throw error
      }
    },
    [loadTasks, refreshTree, selectedFilePath, setCurrentFile]
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
          setCurrentFile(null)
          setEditorContent('')
          setSavedContentSnapshot('')
          setSelectedNodeId(undefined)
        }
      } catch (error) {
        useFileTreeStore.getState().setError(error instanceof Error ? error.message : '删除失败')
        throw error
      }
    },
    [loadTasks, refreshTree, selectedFilePath, setCurrentFile]
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
          setCurrentFile({
            path: nextPath,
            name: getBaseName(nextPath),
            lastModified: Date.now(),
          })
        }
      } catch (error) {
        useFileTreeStore.getState().setError(error instanceof Error ? error.message : '移动失败')
        throw error
      }
    },
    [loadTasks, refreshTree, selectedFilePath, setCurrentFile]
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
      const matchedPath = openFiles.find((file) => normalizePath(file.path) === normalizedPath)?.path ?? path
      removeOpenFile(matchedPath)
      if (normalizePath(selectedFilePath ?? '') !== normalizedPath) {
        return
      }

      const nextTabs = openFiles
        .map((file) => normalizePath(file.path))
        .filter((item) => item !== normalizedPath)

      if (nextTabs.length > 0) {
        void openFile(nextTabs[0]!)
        return
      }

      setCurrentFile(null)
      setEditorContent('')
      setSavedContentSnapshot('')
      setSelectedNodeId(undefined)
      setSaveStatus('idle')
    },
    [openFile, openFiles, removeOpenFile, selectedFilePath, setCurrentFile]
  )

  const runSearch = useCallback(
    async (query: string) => {
      if (!currentWorkspace) {
        setSearchResults([])
        return
      }

      const normalizedQuery = query.trim().toLowerCase()
      if (!normalizedQuery) {
        setSearchResults([])
        setIsSearching(false)
        return
      }

      setIsSearching(true)

      try {
        const searchableFiles = workspaceFileEntries.filter(isSearchableFile).slice(0, 260)
        const nextResults: SearchResultItem[] = []

        for (const file of searchableFiles) {
          if (nextResults.length >= MAX_SEARCH_RESULTS) {
            break
          }

          const readResult = await window.electronAPI.file.read(file.path, {
            maxSize: MAX_SEARCH_FILE_SIZE,
          })
          if (!readResult.success || !readResult.data) {
            continue
          }

          const lines = readResult.data.content.split('\n')
          for (const [index, line] of lines.entries()) {
            if (nextResults.length >= MAX_SEARCH_RESULTS) {
              break
            }

            if (!line.toLowerCase().includes(normalizedQuery)) {
              continue
            }

            nextResults.push({
              id: `${file.path}:${index + 1}:${nextResults.length}`,
              path: normalizePath(file.path),
              lineNumber: index + 1,
              preview: line.trim() || '(空行)',
            })
          }
        }

        setSearchResults(nextResults)
      } finally {
        setIsSearching(false)
      }
    },
    [currentWorkspace, workspaceFileEntries]
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

  const stopStreaming = useCallback(() => {
    activeAIRequestRef.current = null
    setIsStreaming(false)
    setMessages((previous) =>
      previous.map((message) =>
        message.streaming
          ? {
              ...message,
              streaming: false,
              content: message.content || '[请求已停止]',
            }
          : message
      )
    )
    pushNotification('info', 'AI 请求已停止', '你可以继续发送下一条消息。')
  }, [pushNotification])

  const sendChatMessage = useCallback(async () => {
    const trimmed = chatInput.trim()
    if (!trimmed || isStreaming) {
      return
    }

    const mentions = extractMentionedFiles(trimmed)
    const userMessage: ChatMessage = {
      id: createId('user'),
      role: 'user',
      content: trimmed,
      createdAt: Date.now(),
    }

    const assistantId = createId('assistant')
    const initialSources = Array.from(new Set([...(selectedFilePath ? [selectedFilePath] : []), ...mentions]))

    const assistantPlaceholder: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      contextSources: initialSources,
      streaming: true,
      diffProposal: null,
    }

    setMessages((previous) => [...previous, userMessage, assistantPlaceholder])
    setChatInput('')
    setIsStreaming(true)

    const requestId = createId('ai-request')
    activeAIRequestRef.current = requestId

    try {
      const request = {
        message: trimmed,
        sessionId: `desktop-${workspaceId ?? 'workspace'}`,
        model: currentWorkspace?.config.defaultModel,
        useRag: true,
        contextWindowTokens: 16000,
        sessionTokenUsage,
      }

      const response = await window.electronAPI.ai.stream(request)

      if (activeAIRequestRef.current !== requestId) {
        return
      }

      if (!response.success || !response.data) {
        throw new Error(response.error?.message ?? 'AI 网关调用失败')
      }

      const ai = response.data
      const ragSources = ai.ragHits.map((hit) => normalizePath(hit.path))
      const contextSources = Array.from(new Set([...initialSources, ...ragSources]))
      const proposal = buildDiffProposal(trimmed, ai, selectedFilePath, editorContentRef.current)

      setSessionTokenUsage((previous) => previous + ai.usage.totalTokens)
      setMessages((previous) =>
        previous.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: ai.content,
                contextSources,
                streaming: false,
                diffProposal: proposal,
              }
            : message
        )
      )

      if (ai.intercepted) {
        pushNotification('warning', 'LLM 网关已拦截请求', ai.warnings.join('；') || '请检查策略和提示词')
      }

      if (ai.memory.flushTriggered) {
        pushNotification(
          'warning',
          'MEMORY 已触发压缩',
          `token=${ai.memory.tokenCount} debt=${ai.memory.tokenDebt}`
        )
      }

      if (ai.warnings.length > 0) {
        pushNotification('warning', 'AI 返回警告', ai.warnings.join('；'))
      }

      if (!ai.intercepted && ai.warnings.length === 0) {
        pushNotification(
          'success',
          'AI 响应完成',
          `${ai.provider}/${ai.model} · ${ai.usage.totalTokens} tokens`
        )
      }
    } catch (error) {
      if (activeAIRequestRef.current !== requestId) {
        return
      }

      const message = error instanceof Error ? error.message : 'AI 调用失败'
      setMessages((previous) =>
        previous.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                content: `请求失败：${message}`,
                streaming: false,
              }
            : item
        )
      )
      pushNotification('error', 'AI 请求失败', message)
    } finally {
      if (activeAIRequestRef.current === requestId) {
        activeAIRequestRef.current = null
      }
      setIsStreaming(false)
    }
  }, [
    chatInput,
    currentWorkspace?.config.defaultModel,
    isStreaming,
    pushNotification,
    selectedFilePath,
    sessionTokenUsage,
    workspaceId,
  ])

  const applyDiffProposal = useCallback(
    async (messageId: string, editFirst: boolean) => {
      const message = messages.find((item) => item.id === messageId)
      const proposal = message?.diffProposal
      if (!proposal) {
        pushNotification('warning', '无法应用修改', '未找到可用的 Diff 提案')
        return
      }

      const targetPath = normalizePath(proposal.targetPath)
      const readResult = await window.electronAPI.file.read(targetPath)
      if (!readResult.success || !readResult.data) {
        pushNotification('error', 'Diff 应用失败', readResult.error?.message ?? '读取目标文件失败')
        return
      }

      const nextContent = applyProposalToContent(readResult.data.content, proposal)

      if (editFirst) {
        if (selectedFileRef.current !== targetPath) {
          await openFile(targetPath)
        }
        setEditorMode('edit')
        setEditorContent(nextContent)
        setConflictDraft(null)
        pushNotification('info', '已写入编辑区', '请确认后等待自动保存或继续手动编辑')
        return
      }

      const writeResult = await window.electronAPI.file.write(targetPath, nextContent, {
        atomic: true,
        createDirs: true,
      })

      if (!writeResult.success) {
        pushNotification('error', 'Diff 应用失败', writeResult.error?.message ?? '写入目标文件失败')
        return
      }

      if (selectedFileRef.current === targetPath) {
        setEditorContent(nextContent)
        setSavedContentSnapshot(nextContent)
        setSaveStatus('saved')
        window.setTimeout(() => setSaveStatus('idle'), 800)
      }

      await refreshTree()
      await loadTasks()
      pushNotification('success', '修改已应用', targetPath)
    },
    [loadTasks, messages, openFile, pushNotification, refreshTree]
  )

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
      setSearchResults([])
      setIsSearching(false)
      return
    }

    const timer = window.setTimeout(() => {
      void runSearch(trimmed)
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [activeTool, runSearch, searchQuery])

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
          setCurrentFile(null)
          setEditorContent('')
          setSavedContentSnapshot('')
          setSelectedNodeId(undefined)
        }
      })

      unlistenSync = window.electronAPI.sync.onStatusChange((data: SyncStatusData) => {
        setSyncStatus(data)

        if (data.status === 'error') {
          pushNotification('error', '同步失败', data.message ?? '请检查网络与仓库状态')
          return
        }

        if (data.status === 'synced') {
          pushNotification('success', '同步完成', '工作区已与云端保持一致')
          return
        }

        if (data.status === 'conflict') {
          const conflictPathRaw = data.conflictFiles?.[0]
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
  }, [loadTasks, openFile, pushNotification, refreshTree, setCurrentFile, workspaceId])

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
      activeAIRequestRef.current = null
    }
  }, [])

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
        onSearchQueryChange={setSearchQuery}
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
        openFileTabs={openFileTabs}
        selectedFilePath={selectedFilePathNormalized}
        dirtyFilePaths={dirtyFilePaths}
        editorMode={editorMode}
        saveStatus={saveStatus}
        isDirty={isDirty}
        isFileLoading={isFileLoading}
        editorError={editorError}
        editorContent={editorContent}
        onOpenTab={(path) => {
          void openFile(path)
        }}
        onCloseTab={closeOpenFileTab}
        onQuickAI={quickStartAIPrompt}
        onChangeEditorMode={setEditorMode}
        onEditorContentChange={setEditorContent}
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
        onSendMessage={() => {
          void sendChatMessage()
        }}
        onStopStreaming={stopStreaming}
        onNewSession={() => {
          activeAIRequestRef.current = null
          setMessages([])
          setSessionTokenUsage(0)
          pushNotification('info', '会话已重置', '新的 AI 上下文会从零开始。')
        }}
        onApplyDiffProposal={(messageId) => {
          void applyDiffProposal(messageId, false)
        }}
        onEditAndApplyDiffProposal={(messageId) => {
          void applyDiffProposal(messageId, true)
        }}
        focusComposerSignal={focusComposerSignal}
      />

      {syncStatus && (
        <div className="pointer-events-none absolute bottom-10 right-6 rounded border border-sys-darkBorder bg-[#090909]/90 px-3 py-1 text-[11px] text-sys-darkMuted">
          Sync: {syncStatus.status}
        </div>
      )}
    </div>
  )
}
