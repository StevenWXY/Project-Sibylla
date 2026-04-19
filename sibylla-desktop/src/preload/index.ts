import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type {
  AutoSavedPayload,
  ConflictInfo,
  ConflictResolution,
  ContextFileInfo,
  IPCResponse,
  SystemInfo,
  EchoRequest,
  IPCChannel,
  FileContent,
  FileReadOptions,
  FileWriteOptions,
  ListFilesOptions,
  FileInfo,
  FileWatchEvent,
  CreateWorkspaceOptions,
  WorkspaceInfo,
  WorkspaceConfig,
  WorkspaceMetadata,
  SyncStatusData,
  SyncResult,
  AuthLoginInput,
  AuthRegisterInput,
  AuthSession,
  AIChatRequest,
  AIChatResponse,
  AIEmbedRequest,
  AIEmbedResponse,
  AIStreamChunk,
  AIStreamEnd,
  AIStreamError,
  ImportOptions,
  ImportResult,
  ImportProgress,
  SaveFailedPayload,
  MemberRole,
  WorkspaceMember,
  InviteRequest,
  InviteResult,
  SkillSummary,
  SkillSearchParams,
  SearchQueryParams,
  SearchResult,
  SearchIndexStatus,
  SearchIndexProgress,
  MemorySnapshotResponse,
  MemoryUpdateRequest,
  MemoryFlushRequest,
  MemoryFlushResponse,
  DailyLogQueryRequest,
  DailyLogEntry,
  RagSearchRequest,
  RagSearchHit,
  HarnessMode,
  HarnessResult,
  DegradationWarning,
  GuardrailRuleSummaryShared,
  SetGuardrailEnabledRequest,
  TaskStateSummary,
  TaskResumeResultShared,
  GuardrailNotificationData,
} from '../shared/types'
import type { CommitInfo, HistoryOptions, FileDiff } from '../shared/types/git.types'
import { IPC_CHANNELS, ErrorType } from '../shared/types'

/**
 * Preload Script
 * 
 * This script runs in a privileged context with access to both Node.js APIs
 * and the renderer's DOM. It uses contextBridge to safely expose a limited
 * set of APIs to the renderer process.
 * 
 * Security principles:
 * - Only expose necessary APIs through contextBridge
 * - Validate all inputs from renderer process
 * - Never expose raw ipcRenderer or Node.js APIs directly
 * - Use invoke/handle pattern for request-response communication
 */

/**
 * Electron API exposed to renderer process
 * All methods are type-safe and validated
 */
interface ElectronAPI {
  // Test methods
  ping: () => Promise<IPCResponse<string>>
  echo: (message: string, delay?: number) => Promise<IPCResponse<string>>
  
  // System information
  getSystemInfo: () => Promise<IPCResponse<SystemInfo>>
  getPlatform: () => Promise<IPCResponse<NodeJS.Platform>>
  getVersion: () => Promise<IPCResponse<string>>
  
  // File operations
  file: {
    read: (path: string, options?: FileReadOptions) => Promise<IPCResponse<FileContent>>
    write: (path: string, content: string, options?: FileWriteOptions) => Promise<IPCResponse<void>>
    delete: (path: string) => Promise<IPCResponse<void>>
    copy: (sourcePath: string, destPath: string) => Promise<IPCResponse<void>>
    move: (sourcePath: string, destPath: string) => Promise<IPCResponse<void>>
    list: (path: string, options?: ListFilesOptions) => Promise<IPCResponse<FileInfo[]>>
    getInfo: (path: string) => Promise<IPCResponse<FileInfo>>
    exists: (path: string) => Promise<IPCResponse<boolean>>
    
    // Directory operations
    createDir: (path: string, recursive?: boolean) => Promise<IPCResponse<void>>
    deleteDir: (path: string, recursive?: boolean) => Promise<IPCResponse<void>>
    
    // File watching
    startWatching: () => Promise<IPCResponse<void>>
    stopWatching: () => Promise<IPCResponse<void>>
    onFileChange: (callback: (event: FileWatchEvent) => void) => () => void
    
    // File import
    import: (sourcePaths: string[], options?: ImportOptions) => Promise<IPCResponse<ImportResult>>
    onImportProgress: (callback: (data: ImportProgress) => void) => () => void

    // Auto-save
    notifyChange: (filePath: string, content: string) => void
    onAutoSaved: (callback: (data: AutoSavedPayload) => void) => () => void
    onSaveFailed: (callback: (data: SaveFailedPayload) => void) => () => void
    retrySave: (filePath: string) => Promise<IPCResponse<void>>
  }
  
  // Workspace operations
  workspace: {
    create: (options: CreateWorkspaceOptions) => Promise<IPCResponse<WorkspaceInfo>>
    open: (path: string) => Promise<IPCResponse<WorkspaceInfo>>
    close: () => Promise<IPCResponse<void>>
    getCurrent: () => Promise<IPCResponse<WorkspaceInfo | null>>
    validate: (path: string) => Promise<IPCResponse<boolean>>
    selectFolder: () => Promise<IPCResponse<string | null>>
    getConfig: () => Promise<IPCResponse<WorkspaceConfig>>
    updateConfig: (updates: Partial<WorkspaceConfig>) => Promise<IPCResponse<void>>
    getMetadata: () => Promise<IPCResponse<WorkspaceMetadata>>

    // Member management
    getMembers: (workspaceId: string) => Promise<IPCResponse<WorkspaceMember[]>>
    inviteMember: (workspaceId: string, request: InviteRequest) => Promise<IPCResponse<InviteResult>>
    updateMemberRole: (workspaceId: string, userId: string, role: MemberRole) => Promise<IPCResponse<void>>
    removeMember: (workspaceId: string, userId: string) => Promise<IPCResponse<void>>
  }
  
  // Sync operations
  sync: {
    force: () => Promise<IPCResponse<SyncResult>>
    getState: () => Promise<IPCResponse<SyncStatusData>>
    onStatusChange: (callback: (data: SyncStatusData) => void) => () => void
  }

  // Git conflict operations
  git: {
    /** Get detailed conflict info for all conflicting files */
    getConflicts: () => Promise<IPCResponse<ConflictInfo[]>>
    /** Resolve a conflict with chosen strategy */
    resolve: (resolution: ConflictResolution) => Promise<IPCResponse<string>>
    /** Listen for conflict detection events (pushed on sync conflict) */
    onConflictDetected: (callback: (conflicts: ConflictInfo[]) => void) => () => void
    /** Get file version history */
    history: (options?: HistoryOptions) => Promise<IPCResponse<readonly CommitInfo[]>>
    /** Get diff between two versions of a file */
    diff: (filepath: string, commitA?: string, commitB?: string) => Promise<IPCResponse<FileDiff>>
    /** Restore file to a specific version */
    restore: (filepath: string, commitSha: string) => Promise<IPCResponse<string>>
  }

  // AI operations
  ai: {
    chat: (request: AIChatRequest | string) => Promise<IPCResponse<AIChatResponse>>
    stream: (request: AIChatRequest | string) => string
    abortStream: (streamId: string) => void
    onStreamChunk: (callback: (chunk: AIStreamChunk) => void) => () => void
    onStreamEnd: (callback: (end: AIStreamEnd) => void) => () => void
    onStreamError: (callback: (error: AIStreamError) => void) => () => void
    embed: (request: AIEmbedRequest | string) => Promise<IPCResponse<AIEmbedResponse>>
    contextFiles: (query: string, limit?: number) => Promise<IPCResponse<ContextFileInfo[]>>
    skillList: () => Promise<IPCResponse<SkillSummary[]>>
    skillSearch: (params: SkillSearchParams) => Promise<IPCResponse<SkillSummary[]>>
  }

  // Memory operations
  memory: {
    snapshot: () => Promise<IPCResponse<MemorySnapshotResponse>>
    update: (request: MemoryUpdateRequest) => Promise<IPCResponse<MemorySnapshotResponse>>
    flush: (request: MemoryFlushRequest) => Promise<IPCResponse<MemoryFlushResponse>>
    queryDailyLog: (request: DailyLogQueryRequest) => Promise<IPCResponse<DailyLogEntry[]>>
  }

  // RAG operations
  rag: {
    search: (request: RagSearchRequest) => Promise<IPCResponse<RagSearchHit[]>>
    rebuild: () => Promise<IPCResponse<void>>
  }

  // Harness operations
  harness: {
    execute: (request: AIChatRequest) => Promise<IPCResponse<HarnessResult>>
    setMode: (mode: HarnessMode) => Promise<IPCResponse<void>>
    getMode: () => Promise<IPCResponse<HarnessMode>>
    listGuardrails: () => Promise<IPCResponse<GuardrailRuleSummaryShared[]>>
    setGuardrailEnabled: (request: SetGuardrailEnabledRequest) => Promise<IPCResponse<void>>
    onDegradationOccurred: (callback: (warning: DegradationWarning) => void) => () => void
    // TASK021: Task state machine operations
    listResumeable: () => Promise<IPCResponse<TaskStateSummary[]>>
    resumeTask: (taskId: string) => Promise<IPCResponse<TaskResumeResultShared>>
    abandonTask: (taskId: string) => Promise<IPCResponse<void>>
    onResumeableTaskDetected: (callback: (tasks: TaskStateSummary[]) => void) => () => void
    onGuardrailBlocked: (callback: (data: GuardrailNotificationData) => void) => () => void
  }
  
  // Auth operations
  auth: {
    login: (input: AuthLoginInput) => Promise<IPCResponse<AuthSession>>
    register: (input: AuthRegisterInput) => Promise<IPCResponse<AuthSession>>
    logout: () => Promise<IPCResponse<void>>
    getCurrentUser: () => Promise<IPCResponse<AuthSession>>
    refreshToken: () => Promise<IPCResponse<AuthSession>>
  }
  
  // Window control
  window: {
    minimize: () => Promise<IPCResponse<void>>
    maximize: () => Promise<IPCResponse<boolean>>
    close: () => Promise<IPCResponse<void>>
    toggleFullscreen: () => Promise<IPCResponse<boolean>>
  }
  
  // Search operations
  search: {
    query: (params: SearchQueryParams) => Promise<IPCResponse<SearchResult[]>>
    indexStatus: () => Promise<IPCResponse<SearchIndexStatus>>
    reindex: () => Promise<IPCResponse<void>>
    onIndexProgress: (callback: (progress: SearchIndexProgress) => void) => () => void
  }
  
  // Event listeners (for future use)
  on: (channel: IPCChannel, callback: (...args: unknown[]) => void) => () => void
  off: (channel: IPCChannel, callback: (...args: unknown[]) => void) => void
}

// Whitelist of allowed channels for security
const ALLOWED_CHANNELS: IPCChannel[] = [
  IPC_CHANNELS.TEST_PING,
  IPC_CHANNELS.TEST_ECHO,
  IPC_CHANNELS.SYSTEM_INFO,
  IPC_CHANNELS.SYSTEM_PLATFORM,
  IPC_CHANNELS.SYSTEM_VERSION,
  IPC_CHANNELS.NOTIFICATION,
  IPC_CHANNELS.LOG_MESSAGE,
  IPC_CHANNELS.FILE_CHANGED,
  IPC_CHANNELS.GIT_STATUS_CHANGED,
  // File operations
  IPC_CHANNELS.FILE_READ,
  IPC_CHANNELS.FILE_WRITE,
  IPC_CHANNELS.FILE_DELETE,
  IPC_CHANNELS.FILE_COPY,
  IPC_CHANNELS.FILE_MOVE,
  IPC_CHANNELS.FILE_LIST,
  IPC_CHANNELS.FILE_INFO,
  IPC_CHANNELS.FILE_EXISTS,
  // Directory operations
  IPC_CHANNELS.DIR_CREATE,
  IPC_CHANNELS.DIR_DELETE,
  // File watching
  IPC_CHANNELS.FILE_WATCH_START,
  IPC_CHANNELS.FILE_WATCH_STOP,
  IPC_CHANNELS.FILE_WATCH_EVENT,
  // File import
  IPC_CHANNELS.FILE_IMPORT,
  IPC_CHANNELS.FILE_IMPORT_PROGRESS,
  // Auto-save
  IPC_CHANNELS.FILE_NOTIFY_CHANGE,
  IPC_CHANNELS.FILE_AUTO_SAVED,
  IPC_CHANNELS.FILE_SAVE_FAILED,
  IPC_CHANNELS.FILE_RETRY_SAVE,
  // Workspace operations
  IPC_CHANNELS.WORKSPACE_CREATE,
  IPC_CHANNELS.WORKSPACE_OPEN,
  IPC_CHANNELS.WORKSPACE_CLOSE,
  IPC_CHANNELS.WORKSPACE_GET_CURRENT,
  IPC_CHANNELS.WORKSPACE_VALIDATE,
  IPC_CHANNELS.WORKSPACE_SELECT_FOLDER,
  IPC_CHANNELS.WORKSPACE_GET_CONFIG,
  IPC_CHANNELS.WORKSPACE_UPDATE_CONFIG,
  IPC_CHANNELS.WORKSPACE_GET_METADATA,
  // Workspace member management
  IPC_CHANNELS.WORKSPACE_GET_MEMBERS,
  IPC_CHANNELS.WORKSPACE_INVITE_MEMBER,
  IPC_CHANNELS.WORKSPACE_UPDATE_MEMBER_ROLE,
  IPC_CHANNELS.WORKSPACE_REMOVE_MEMBER,
  // Sync operations
  IPC_CHANNELS.SYNC_FORCE,
  IPC_CHANNELS.SYNC_STATUS_CHANGED,
  IPC_CHANNELS.SYNC_GET_STATE,
  // Git conflict operations
  IPC_CHANNELS.GIT_GET_CONFLICTS,
  IPC_CHANNELS.GIT_RESOLVE,
  IPC_CHANNELS.GIT_CONFLICT_DETECTED,
  // Git version history operations
  IPC_CHANNELS.GIT_HISTORY,
  IPC_CHANNELS.GIT_DIFF,
  IPC_CHANNELS.GIT_RESTORE,
  // Auth operations
  IPC_CHANNELS.AUTH_LOGIN,
  IPC_CHANNELS.AUTH_REGISTER,
  IPC_CHANNELS.AUTH_LOGOUT,
  IPC_CHANNELS.AUTH_GET_CURRENT_USER,
  IPC_CHANNELS.AUTH_REFRESH_TOKEN,
  // AI operations
  IPC_CHANNELS.AI_CHAT,
  IPC_CHANNELS.AI_STREAM,
  IPC_CHANNELS.AI_STREAM_CHUNK,
  IPC_CHANNELS.AI_STREAM_END,
  IPC_CHANNELS.AI_STREAM_ERROR,
  IPC_CHANNELS.AI_STREAM_ABORT,
  IPC_CHANNELS.AI_EMBED,
  IPC_CHANNELS.AI_CONTEXT_FILES,
  IPC_CHANNELS.AI_SKILL_LIST,
  IPC_CHANNELS.AI_SKILL_SEARCH,
  // Memory operations
  IPC_CHANNELS.MEMORY_SNAPSHOT,
  IPC_CHANNELS.MEMORY_UPDATE,
  IPC_CHANNELS.MEMORY_FLUSH,
  IPC_CHANNELS.MEMORY_DAILY_LOG_QUERY,
  // RAG operations
  IPC_CHANNELS.RAG_SEARCH,
  IPC_CHANNELS.RAG_REBUILD,
  // Window control
  IPC_CHANNELS.WINDOW_MINIMIZE,
  IPC_CHANNELS.WINDOW_MAXIMIZE,
  IPC_CHANNELS.WINDOW_CLOSE,
  IPC_CHANNELS.WINDOW_TOGGLE_FULLSCREEN,
  // Search operations
  IPC_CHANNELS.SEARCH_QUERY,
  IPC_CHANNELS.SEARCH_INDEX_STATUS,
  IPC_CHANNELS.SEARCH_REINDEX,
  IPC_CHANNELS.SEARCH_INDEX_PROGRESS,
  // Harness operations
  IPC_CHANNELS.HARNESS_EXECUTE,
  IPC_CHANNELS.HARNESS_SET_MODE,
  IPC_CHANNELS.HARNESS_GET_MODE,
  IPC_CHANNELS.HARNESS_DEGRADATION_OCCURRED,
  IPC_CHANNELS.HARNESS_GUARDRAIL_BLOCKED,
  IPC_CHANNELS.HARNESS_LIST_GUARDRAILS,
  IPC_CHANNELS.HARNESS_SET_GUARDRAIL_ENABLED,
  // TASK021: Task state machine channels
  IPC_CHANNELS.HARNESS_LIST_RESUMEABLE,
  IPC_CHANNELS.HARNESS_RESUME_TASK,
  IPC_CHANNELS.HARNESS_ABANDON_TASK,
  IPC_CHANNELS.HARNESS_RESUMEABLE_DETECTED,
]

/**
 * Check if running in development mode
 */
const isDev = process.env.NODE_ENV === 'development'

/**
 * Validate if a channel is allowed
 *
 * This function checks if a given channel is in the whitelist
 * to prevent unauthorized IPC communication.
 *
 * @param channel - The channel name to validate
 * @returns true if the channel is allowed, false otherwise
 */
function isChannelAllowed(channel: string): boolean {
  const isAllowed = ALLOWED_CHANNELS.includes(channel as IPCChannel)
  
  if (!isAllowed) {
    console.warn(`[Preload] Attempted to use unauthorized channel: ${channel}`)
  }
  
  return isAllowed
}

/**
 * Create a safe IPC invoke wrapper with logging, error handling, and timeout protection
 *
 * This function handles both business logic errors (from main process handlers)
 * and IPC communication errors (network failures, process crashes, etc.)
 *
 * @param channel - The IPC channel to invoke
 * @param args - Arguments to pass to the handler (last arg can be timeout config)
 * @returns Promise resolving to the IPC response
 */
async function safeInvoke<T>(
  channel: IPCChannel,
  ...args: unknown[]
): Promise<IPCResponse<T>> {
  // Default timeout: 30 seconds
  const DEFAULT_TIMEOUT = 30000
  const timeout = DEFAULT_TIMEOUT
  
  if (isDev) {
    console.debug(`[Preload] Invoking channel: ${channel}`, args.length > 0 ? args : '')
  }
  
  try {
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`IPC timeout after ${timeout}ms`))
      }, timeout)
    })
    
    // Race between actual IPC call and timeout
    const response = await Promise.race([
      ipcRenderer.invoke(channel, ...args),
      timeoutPromise
    ])
    
    if (isDev) {
      console.debug(`[Preload] Response from ${channel}:`, response.success ? 'success' : 'error')
    }
    
    return response
  } catch (error) {
    // Catch IPC communication layer errors (not business logic errors)
    const isTimeout = error instanceof Error && error.message.includes('timeout')
    console.error(
      `[Preload] IPC ${isTimeout ? 'timeout' : 'communication error'} on channel ${channel}:`,
      error
    )
    return {
      success: false,
      error: {
        type: ErrorType.IPC_ERROR,
        message: error instanceof Error ? error.message : 'IPC communication failed',
      },
      timestamp: Date.now(),
    }
  }
}

// Implement the API
const api: ElectronAPI = {
  // Test ping
  ping: async () => {
    return await safeInvoke<string>(IPC_CHANNELS.TEST_PING)
  },
  
  // Test echo
  echo: async (message: string, delay?: number) => {
    const request: EchoRequest = { message, delay }
    return await safeInvoke<string>(IPC_CHANNELS.TEST_ECHO, request)
  },
  
  // Get system information
  getSystemInfo: async () => {
    return await safeInvoke<SystemInfo>(IPC_CHANNELS.SYSTEM_INFO)
  },
  
  // Get platform
  getPlatform: async () => {
    return await safeInvoke<NodeJS.Platform>(IPC_CHANNELS.SYSTEM_PLATFORM)
  },
  
  // Get app version
  getVersion: async () => {
    return await safeInvoke<string>(IPC_CHANNELS.SYSTEM_VERSION)
  },
  
  // File operations
  file: {
    read: async (path: string, options?: FileReadOptions) => {
      return await safeInvoke<FileContent>(IPC_CHANNELS.FILE_READ, path, options)
    },
    
    write: async (path: string, content: string, options?: FileWriteOptions) => {
      return await safeInvoke<void>(IPC_CHANNELS.FILE_WRITE, path, content, options)
    },
    
    delete: async (path: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.FILE_DELETE, path)
    },
    
    copy: async (sourcePath: string, destPath: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.FILE_COPY, sourcePath, destPath)
    },
    
    move: async (sourcePath: string, destPath: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.FILE_MOVE, sourcePath, destPath)
    },
    
    list: async (path: string, options?: ListFilesOptions) => {
      return await safeInvoke<FileInfo[]>(IPC_CHANNELS.FILE_LIST, path, options)
    },
    
    getInfo: async (path: string) => {
      return await safeInvoke<FileInfo>(IPC_CHANNELS.FILE_INFO, path)
    },
    
    exists: async (path: string) => {
      return await safeInvoke<boolean>(IPC_CHANNELS.FILE_EXISTS, path)
    },
    
    createDir: async (path: string, recursive?: boolean) => {
      return await safeInvoke<void>(IPC_CHANNELS.DIR_CREATE, path, recursive)
    },
    
    deleteDir: async (path: string, recursive?: boolean) => {
      return await safeInvoke<void>(IPC_CHANNELS.DIR_DELETE, path, recursive)
    },
    
    startWatching: async () => {
      return await safeInvoke<void>(IPC_CHANNELS.FILE_WATCH_START)
    },
    
    stopWatching: async () => {
      return await safeInvoke<void>(IPC_CHANNELS.FILE_WATCH_STOP)
    },
    
    onFileChange: (callback: (event: FileWatchEvent) => void) => {
      return api.on(IPC_CHANNELS.FILE_WATCH_EVENT, callback as (...args: unknown[]) => void)
    },
    
    import: async (sourcePaths: string[], options?: ImportOptions) => {
      return await safeInvoke<ImportResult>(IPC_CHANNELS.FILE_IMPORT, sourcePaths, options)
    },
    
    onImportProgress: (callback: (data: ImportProgress) => void) => {
      const handler = (_event: IpcRendererEvent, data: ImportProgress) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.FILE_IMPORT_PROGRESS, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.FILE_IMPORT_PROGRESS, handler)
      }
    },

    notifyChange: (filePath: string, content: string) => {
      ipcRenderer.send(IPC_CHANNELS.FILE_NOTIFY_CHANGE, filePath, content)
    },

    onAutoSaved: (callback: (data: AutoSavedPayload) => void) => {
      const handler = (_event: IpcRendererEvent, data: AutoSavedPayload) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.FILE_AUTO_SAVED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.FILE_AUTO_SAVED, handler)
      }
    },

    onSaveFailed: (callback: (data: SaveFailedPayload) => void) => {
      const handler = (_event: IpcRendererEvent, data: SaveFailedPayload) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.FILE_SAVE_FAILED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.FILE_SAVE_FAILED, handler)
      }
    },

    retrySave: (filePath: string) => {
      return safeInvoke<void>(IPC_CHANNELS.FILE_RETRY_SAVE, filePath)
    },
  },
  
  // Workspace operations
  workspace: {
    create: async (options: CreateWorkspaceOptions) => {
      return await safeInvoke<WorkspaceInfo>(IPC_CHANNELS.WORKSPACE_CREATE, options)
    },
    
    open: async (path: string) => {
      return await safeInvoke<WorkspaceInfo>(IPC_CHANNELS.WORKSPACE_OPEN, path)
    },
    
    close: async () => {
      return await safeInvoke<void>(IPC_CHANNELS.WORKSPACE_CLOSE)
    },
    
    getCurrent: async () => {
      return await safeInvoke<WorkspaceInfo | null>(IPC_CHANNELS.WORKSPACE_GET_CURRENT)
    },
    
    validate: async (path: string) => {
      return await safeInvoke<boolean>(IPC_CHANNELS.WORKSPACE_VALIDATE, path)
    },
    
    selectFolder: async () => {
      return await safeInvoke<string | null>(IPC_CHANNELS.WORKSPACE_SELECT_FOLDER)
    },
    
    getConfig: async () => {
      return await safeInvoke<WorkspaceConfig>(IPC_CHANNELS.WORKSPACE_GET_CONFIG)
    },
    
    updateConfig: async (updates: Partial<WorkspaceConfig>) => {
      return await safeInvoke<void>(IPC_CHANNELS.WORKSPACE_UPDATE_CONFIG, updates)
    },
    
    getMetadata: async () => {
      return await safeInvoke<WorkspaceMetadata>(IPC_CHANNELS.WORKSPACE_GET_METADATA)
    },

    getMembers: async (workspaceId: string) => {
      return await safeInvoke<WorkspaceMember[]>(IPC_CHANNELS.WORKSPACE_GET_MEMBERS, workspaceId)
    },

    inviteMember: async (workspaceId: string, request: InviteRequest) => {
      return await safeInvoke<InviteResult>(IPC_CHANNELS.WORKSPACE_INVITE_MEMBER, workspaceId, request)
    },

    updateMemberRole: async (workspaceId: string, userId: string, role: MemberRole) => {
      return await safeInvoke<void>(IPC_CHANNELS.WORKSPACE_UPDATE_MEMBER_ROLE, workspaceId, userId, role)
    },

    removeMember: async (workspaceId: string, userId: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.WORKSPACE_REMOVE_MEMBER, workspaceId, userId)
    },
  },
  
  // Sync operations
  sync: {
    force: async () => {
      return await safeInvoke<SyncResult>(IPC_CHANNELS.SYNC_FORCE)
    },

    getState: async () => {
      return await safeInvoke<SyncStatusData>(IPC_CHANNELS.SYNC_GET_STATE)
    },
    
    onStatusChange: (callback: (data: SyncStatusData) => void) => {
      return api.on(IPC_CHANNELS.SYNC_STATUS_CHANGED, callback as (...args: unknown[]) => void)
    },
  },

  // Git conflict operations
  git: {
    getConflicts: async () => {
      return await safeInvoke<ConflictInfo[]>(IPC_CHANNELS.GIT_GET_CONFLICTS)
    },

    resolve: async (resolution: ConflictResolution) => {
      return await safeInvoke<string>(IPC_CHANNELS.GIT_RESOLVE, resolution)
    },

    onConflictDetected: (callback: (conflicts: ConflictInfo[]) => void) => {
      const handler = (_event: IpcRendererEvent, conflicts: ConflictInfo[]) => callback(conflicts)
      ipcRenderer.on(IPC_CHANNELS.GIT_CONFLICT_DETECTED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.GIT_CONFLICT_DETECTED, handler)
      }
    },

    history: async (options?: HistoryOptions) => {
      return await safeInvoke<readonly CommitInfo[]>(IPC_CHANNELS.GIT_HISTORY, options)
    },

    diff: async (filepath: string, commitA?: string, commitB?: string) => {
      return await safeInvoke<FileDiff>(IPC_CHANNELS.GIT_DIFF, filepath, commitA, commitB)
    },

    restore: async (filepath: string, commitSha: string) => {
      return await safeInvoke<string>(IPC_CHANNELS.GIT_RESTORE, filepath, commitSha)
    },
  },
  
  // Auth operations
  auth: {
    login: async (input: AuthLoginInput) => {
      return await safeInvoke<AuthSession>(IPC_CHANNELS.AUTH_LOGIN, input)
    },
    
    register: async (input: AuthRegisterInput) => {
      return await safeInvoke<AuthSession>(IPC_CHANNELS.AUTH_REGISTER, input)
    },
    
    logout: async () => {
      return await safeInvoke<void>(IPC_CHANNELS.AUTH_LOGOUT)
    },
    
    getCurrentUser: async () => {
      return await safeInvoke<AuthSession>(IPC_CHANNELS.AUTH_GET_CURRENT_USER)
    },
    
    refreshToken: async () => {
      return await safeInvoke<AuthSession>(IPC_CHANNELS.AUTH_REFRESH_TOKEN)
    },
  },

  // AI operations
  ai: {
    chat: async (request: AIChatRequest | string) => {
      return await safeInvoke<AIChatResponse>(IPC_CHANNELS.AI_CHAT, request)
    },

    stream: (request: AIChatRequest | string) => {
      const streamId = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const payload = typeof request === 'string'
        ? { message: request, streamId }
        : { ...request, streamId }
      ipcRenderer.send(IPC_CHANNELS.AI_STREAM, payload)
      return streamId
    },

    abortStream: (streamId: string) => {
      ipcRenderer.send(IPC_CHANNELS.AI_STREAM_ABORT, streamId)
    },

    onStreamChunk: (callback: (chunk: AIStreamChunk) => void) => {
      return api.on(
        IPC_CHANNELS.AI_STREAM_CHUNK,
        callback as (...args: unknown[]) => void
      )
    },

    onStreamEnd: (callback: (end: AIStreamEnd) => void) => {
      return api.on(
        IPC_CHANNELS.AI_STREAM_END,
        callback as (...args: unknown[]) => void
      )
    },

    onStreamError: (callback: (error: AIStreamError) => void) => {
      return api.on(
        IPC_CHANNELS.AI_STREAM_ERROR,
        callback as (...args: unknown[]) => void
      )
    },

    embed: async (request: AIEmbedRequest | string) => {
      return await safeInvoke<AIEmbedResponse>(IPC_CHANNELS.AI_EMBED, request)
    },

    contextFiles: async (query: string, limit?: number) => {
      return await safeInvoke<ContextFileInfo[]>(IPC_CHANNELS.AI_CONTEXT_FILES, query, limit)
    },

    skillList: async () => {
      return await safeInvoke<SkillSummary[]>(IPC_CHANNELS.AI_SKILL_LIST)
    },

    skillSearch: async (params: SkillSearchParams) => {
      return await safeInvoke<SkillSummary[]>(IPC_CHANNELS.AI_SKILL_SEARCH, params)
    },
  },

  // Memory operations
  memory: {
    snapshot: async () => {
      return await safeInvoke<MemorySnapshotResponse>(IPC_CHANNELS.MEMORY_SNAPSHOT)
    },

    update: async (request: MemoryUpdateRequest) => {
      return await safeInvoke<MemorySnapshotResponse>(IPC_CHANNELS.MEMORY_UPDATE, request)
    },

    flush: async (request: MemoryFlushRequest) => {
      return await safeInvoke<MemoryFlushResponse>(IPC_CHANNELS.MEMORY_FLUSH, request)
    },

    queryDailyLog: async (request: DailyLogQueryRequest) => {
      return await safeInvoke<DailyLogEntry[]>(IPC_CHANNELS.MEMORY_DAILY_LOG_QUERY, request)
    },
  },

  // RAG operations
  rag: {
    search: async (request: RagSearchRequest) => {
      return await safeInvoke<RagSearchHit[]>(IPC_CHANNELS.RAG_SEARCH, request)
    },

    rebuild: async () => {
      return await safeInvoke<void>(IPC_CHANNELS.RAG_REBUILD)
    },
  },

  // Harness operations
  harness: {
    execute: async (request: AIChatRequest) => {
      return await safeInvoke<HarnessResult>(IPC_CHANNELS.HARNESS_EXECUTE, request)
    },

    setMode: async (mode: HarnessMode) => {
      return await safeInvoke<void>(IPC_CHANNELS.HARNESS_SET_MODE, mode)
    },

    getMode: async () => {
      return await safeInvoke<HarnessMode>(IPC_CHANNELS.HARNESS_GET_MODE)
    },

    listGuardrails: async () => {
      return await safeInvoke<GuardrailRuleSummaryShared[]>(IPC_CHANNELS.HARNESS_LIST_GUARDRAILS)
    },

    setGuardrailEnabled: async (request: SetGuardrailEnabledRequest) => {
      return await safeInvoke<void>(IPC_CHANNELS.HARNESS_SET_GUARDRAIL_ENABLED, request)
    },

    onDegradationOccurred: (callback: (warning: DegradationWarning) => void) => {
      const handler = (_event: IpcRendererEvent, warning: DegradationWarning) => callback(warning)
      ipcRenderer.on(IPC_CHANNELS.HARNESS_DEGRADATION_OCCURRED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.HARNESS_DEGRADATION_OCCURRED, handler)
      }
    },

    // TASK021: Task state machine operations
    listResumeable: async () => {
      return await safeInvoke<TaskStateSummary[]>(IPC_CHANNELS.HARNESS_LIST_RESUMEABLE)
    },

    resumeTask: async (taskId: string) => {
      return await safeInvoke<TaskResumeResultShared>(IPC_CHANNELS.HARNESS_RESUME_TASK, taskId)
    },

    abandonTask: async (taskId: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.HARNESS_ABANDON_TASK, taskId)
    },

    onResumeableTaskDetected: (callback: (tasks: TaskStateSummary[]) => void) => {
      const handler = (_event: IpcRendererEvent, tasks: TaskStateSummary[]) => callback(tasks)
      ipcRenderer.on(IPC_CHANNELS.HARNESS_RESUMEABLE_DETECTED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.HARNESS_RESUMEABLE_DETECTED, handler)
      }
    },

    onGuardrailBlocked: (callback: (data: GuardrailNotificationData) => void) => {
      const handler = (_event: IpcRendererEvent, data: GuardrailNotificationData) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.HARNESS_GUARDRAIL_BLOCKED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.HARNESS_GUARDRAIL_BLOCKED, handler)
      }
    },
  },
  
  // Window control
  window: {
    minimize: async () => {
      return await safeInvoke<void>(IPC_CHANNELS.WINDOW_MINIMIZE)
    },
    
    maximize: async () => {
      return await safeInvoke<boolean>(IPC_CHANNELS.WINDOW_MAXIMIZE)
    },
    
    close: async () => {
      return await safeInvoke<void>(IPC_CHANNELS.WINDOW_CLOSE)
    },
    
    toggleFullscreen: async () => {
      return await safeInvoke<boolean>(IPC_CHANNELS.WINDOW_TOGGLE_FULLSCREEN)
    },
  },

  // Search operations
  search: {
    query: async (params: SearchQueryParams) => {
      return await safeInvoke<SearchResult[]>(IPC_CHANNELS.SEARCH_QUERY, params)
    },

    indexStatus: async () => {
      return await safeInvoke<SearchIndexStatus>(IPC_CHANNELS.SEARCH_INDEX_STATUS)
    },

    reindex: async () => {
      return await safeInvoke<void>(IPC_CHANNELS.SEARCH_REINDEX)
    },

    onIndexProgress: (callback: (progress: SearchIndexProgress) => void) => {
      const handler = (_event: IpcRendererEvent, progress: SearchIndexProgress) => callback(progress)
      ipcRenderer.on(IPC_CHANNELS.SEARCH_INDEX_PROGRESS, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.SEARCH_INDEX_PROGRESS, handler)
      }
    },
  },
  
  // Event listener registration
  on: (channel: IPCChannel, callback: (...args: unknown[]) => void) => {
    if (!isChannelAllowed(channel)) {
      const error = new Error(`Channel ${channel} is not allowed`)
      console.error('[Preload] Event listener registration failed:', error)
      throw error
    }
    
    const subscription = (_event: IpcRendererEvent, ...args: unknown[]) => {
      try {
        if (isDev) {
          console.debug(`[Preload] Event received on channel: ${channel}`)
        }
        callback(...args)
      } catch (error) {
        console.error(`[Preload] Error in event callback for ${channel}:`, error)
      }
    }
    
    ipcRenderer.on(channel, subscription)
    if (isDev) {
      console.debug(`[Preload] Event listener registered for channel: ${channel}`)
    }
    
    // Return unsubscribe function
    return () => {
      ipcRenderer.off(channel, subscription)
      if (isDev) {
        console.debug(`[Preload] Event listener unregistered for channel: ${channel}`)
      }
    }
  },
  
  // Event listener removal
  off: (channel: IPCChannel, callback: (...args: unknown[]) => void) => {
    if (!isChannelAllowed(channel)) {
      const error = new Error(`Channel ${channel} is not allowed`)
      console.error('[Preload] Event listener removal failed:', error)
      throw error
    }
    
    ipcRenderer.off(channel, callback as never)
    if (isDev) {
      console.debug(`[Preload] Event listener removed for channel: ${channel}`)
    }
  },
}

// Expose API to renderer
contextBridge.exposeInMainWorld('electronAPI', api)

console.log('[Preload] Enhanced API exposed to renderer process')

// Export type for use in other modules
export type { ElectronAPI }
