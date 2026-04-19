/**
 * Shared type definitions for Sibylla Desktop Application
 * 
 * This file contains type definitions that are shared across
 * main process, renderer process, and preload scripts.
 */

import type {
  MemberRole,
  WorkspaceMember,
  InviteRequest,
  InviteResult,
} from './types/member.types'
import type { CommitInfo, HistoryOptions, FileDiff } from './types/git.types'
export type { ElectronAPI } from '../preload/index'

// Re-export member types for convenience
export type {
  MemberRole,
  WorkspaceMember,
  InviteRequest,
  InviteResult,
  PermissionCheck,
} from './types/member.types'
export { ROLE_PERMISSIONS } from './types/member.types'

// Re-export git types for convenience
export type {
  CommitInfo,
  HistoryOptions,
  FileDiff,
  DiffLine,
  DiffHunk,
} from './types/git.types'

/**
 * Application configuration
 */
export interface AppConfig {
  version: string
  environment: 'development' | 'production' | 'test'
}

/**
 * Window state for persistence
 */
export interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized: boolean
  isFullScreen: boolean
}

/**
 * IPC channel names (for type safety and consistency)
 * 
 * This constant object defines all available IPC channels in the application.
 * Using constants instead of string literals prevents typos and enables
 * better IDE autocomplete support.
 * 
 * @example
 * ```typescript
 * // In main process
 * ipcMain.handle(IPC_CHANNELS.TEST_PING, async () => 'pong')
 * 
 * // In renderer process (via preload)
 * const response = await window.electronAPI.ping()
 * ```
 */
export const IPC_CHANNELS = {
  // Test channels
  TEST_PING: 'test:ping',
  TEST_ECHO: 'test:echo',
  
  // System information
  SYSTEM_INFO: 'system:info',
  SYSTEM_PLATFORM: 'system:platform',
  SYSTEM_VERSION: 'system:version',
  
  // Window control
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_TOGGLE_FULLSCREEN: 'window:toggle-fullscreen',
  
  // File operations
  FILE_READ: 'file:read',
  FILE_WRITE: 'file:write',
  FILE_DELETE: 'file:delete',
  FILE_COPY: 'file:copy',
  FILE_MOVE: 'file:move',
  FILE_LIST: 'file:list',
  FILE_INFO: 'file:info',
  FILE_EXISTS: 'file:exists',
  
  // Directory operations
  DIR_CREATE: 'dir:create',
  DIR_DELETE: 'dir:delete',
  
  // File watching
  FILE_WATCH_START: 'file:watch:start',
  FILE_WATCH_STOP: 'file:watch:stop',
  FILE_WATCH_EVENT: 'file:watch:event',
  
  // Workspace operations
  WORKSPACE_CREATE: 'workspace:create',
  WORKSPACE_OPEN: 'workspace:open',
  WORKSPACE_CLOSE: 'workspace:close',
  WORKSPACE_GET_CURRENT: 'workspace:get-current',
  WORKSPACE_VALIDATE: 'workspace:validate',
  WORKSPACE_SELECT_FOLDER: 'workspace:select-folder',
  WORKSPACE_GET_CONFIG: 'workspace:get-config',
  WORKSPACE_UPDATE_CONFIG: 'workspace:update-config',
  WORKSPACE_GET_METADATA: 'workspace:get-metadata',

  // Workspace member management
  WORKSPACE_GET_MEMBERS: 'workspace:getMembers',
  WORKSPACE_INVITE_MEMBER: 'workspace:inviteMember',
  WORKSPACE_UPDATE_MEMBER_ROLE: 'workspace:updateMemberRole',
  WORKSPACE_REMOVE_MEMBER: 'workspace:removeMember',
  
  // Git operations (reserved for future implementation)
  GIT_STATUS: 'git:status',
  GIT_SYNC: 'git:sync',
  GIT_COMMIT: 'git:commit',
  GIT_HISTORY: 'git:history',
  GIT_DIFF: 'git:diff',

  /** Renderer → Main: Restore file to a specific version */
  GIT_RESTORE: 'git:restore',

  // Git conflict operations
  /** Renderer → Main: Get detailed conflict info for all conflicting files */
  GIT_GET_CONFLICTS: 'git:getConflicts',
  /** Renderer → Main: Resolve a conflict with chosen strategy */
  GIT_RESOLVE: 'git:resolve',
  /** Main → Renderer: Push conflict detection event (webContents.send) */
  GIT_CONFLICT_DETECTED: 'git:conflictDetected',
  
  // AI operations
  AI_CHAT: 'ai:chat',
  AI_STREAM: 'ai:stream',
  AI_STREAM_CHUNK: 'ai:stream:chunk',
  AI_STREAM_END: 'ai:stream:end',
  AI_STREAM_ERROR: 'ai:stream:error',
  AI_STREAM_ABORT: 'ai:stream:abort',
  AI_EMBED: 'ai:embed',
  AI_CONTEXT_FILES: 'ai:context:files',
  AI_SKILL_LIST: 'ai:skill:list',
  AI_SKILL_SEARCH: 'ai:skill:search',

  // Memory operations
  MEMORY_SNAPSHOT: 'memory:snapshot',
  MEMORY_UPDATE: 'memory:update',
  MEMORY_FLUSH: 'memory:flush',
  MEMORY_DAILY_LOG_QUERY: 'memory:daily-log:query',

  // RAG operations
  RAG_SEARCH: 'rag:search',
  RAG_REBUILD: 'rag:rebuild',
  
  // Sync operations (SyncManager layer — distinct from git:sync which is direct Git sync)
  /** Renderer → Main: Force trigger a sync operation */
  SYNC_FORCE: 'sync:force',
  /** Main → Renderer: Broadcast sync status changes */
  SYNC_STATUS_CHANGED: 'sync:status-changed',
  /** Renderer → Main: Get current sync state snapshot */
  SYNC_GET_STATE: 'sync:getState',

  // Auth operations
  /** Login with email/password */
  AUTH_LOGIN: 'auth:login',
  /** Register a new account */
  AUTH_REGISTER: 'auth:register',
  /** Logout and revoke tokens */
  AUTH_LOGOUT: 'auth:logout',
  /** Get currently authenticated user */
  AUTH_GET_CURRENT_USER: 'auth:get-current-user',
  /** Refresh the access token using stored refresh token */
  AUTH_REFRESH_TOKEN: 'auth:refresh-token',

  // File import operations
  FILE_IMPORT: 'file:import',
  FILE_IMPORT_PROGRESS: 'file:importProgress',

  // Auto-save operations
  /** Renderer → Main: Notify that file content has changed (send/on, one-way) */
  FILE_NOTIFY_CHANGE: 'file:notifyChange',
  /** Main → Renderer: Auto-save succeeded (webContents.send) */
  FILE_AUTO_SAVED: 'file:autoSaved',
  /** Main → Renderer: Auto-save failed (webContents.send) */
  FILE_SAVE_FAILED: 'file:saveFailed',
  /** Renderer → Main: Manual retry for a failed save (invoke/handle) */
  FILE_RETRY_SAVE: 'file:retrySave',

  // Search operations (local fulltext search via SQLite FTS5)
  SEARCH_QUERY: 'search:query',
  SEARCH_INDEX_STATUS: 'search:indexStatus',
  SEARCH_REINDEX: 'search:reindex',
  SEARCH_INDEX_PROGRESS: 'search:indexProgress',

  HARNESS_EXECUTE: 'harness:execute',
  HARNESS_SET_MODE: 'harness:setMode',
  HARNESS_GET_MODE: 'harness:getMode',
  HARNESS_DEGRADATION_OCCURRED: 'harness:degradationOccurred',

  // Harness / Guardrail operations
  /** Main → Renderer: Guardrail blocked an operation (webContents.send) */
  HARNESS_GUARDRAIL_BLOCKED: 'harness:guardrailBlocked',
  /** Renderer → Main: List all guardrail rules with enabled status */
  HARNESS_LIST_GUARDRAILS: 'harness:listGuardrails',
  /** Renderer → Main: Enable or disable a guardrail rule */
  HARNESS_SET_GUARDRAIL_ENABLED: 'harness:setGuardrailEnabled',

  // Harness / Guide operations (TASK019)
  /** Renderer → Main: List all guides with enabled status */
  HARNESS_LIST_GUIDES: 'harness:listGuides',
  /** Renderer → Main: Enable or disable a guide */
  HARNESS_SET_GUIDE_ENABLED: 'harness:setGuideEnabled',

  // Harness / Tool Scope operations (TASK020)
  /** Renderer → Main: Get tool scope for a request */
  HARNESS_GET_TOOL_SCOPE: 'harness:getToolScope',
  /** Renderer → Main: Get all intent profiles */
  HARNESS_GET_INTENT_PROFILES: 'harness:getIntentProfiles',
  /** Renderer → Main: Register a custom tool */
  HARNESS_REGISTER_TOOL: 'harness:registerTool',
  /** Renderer → Main: Unregister a tool */
  HARNESS_UNREGISTER_TOOL: 'harness:unregisterTool',

  // Harness / Task State Machine operations (TASK021)
  /** Renderer → Main: List resumeable tasks */
  HARNESS_LIST_RESUMEABLE: 'harness:listResumeable',
  /** Renderer → Main: Resume an interrupted task */
  HARNESS_RESUME_TASK: 'harness:resumeTask',
  /** Renderer → Main: Abandon a task */
  HARNESS_ABANDON_TASK: 'harness:abandonTask',
  /** Main → Renderer: Resumeable tasks detected on startup (webContents.send) */
  HARNESS_RESUMEABLE_DETECTED: 'harness:resumeableTaskDetected',

  // Event notifications (main process → renderer process)
  NOTIFICATION: 'notification',
  LOG_MESSAGE: 'log:message',
  FILE_CHANGED: 'file:changed',
  GIT_STATUS_CHANGED: 'git:status-changed',
} as const

/**
 * Type for IPC channel names
 * 
 * This type extracts all possible channel names from IPC_CHANNELS,
 * providing compile-time type safety for channel validation.
 * 
 * @example
 * ```typescript
 * function isValidChannel(channel: string): channel is IPCChannel {
 *   return Object.values(IPC_CHANNELS).includes(channel as IPCChannel)
 * }
 * ```
 */
export type IPCChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS]

/**
 * IPC Channel Type Map
 *
 * Provides compile-time type safety for IPC channel → params → return mapping.
 * Each entry maps a channel constant to its expected parameter tuple and return type.
 *
 * - `params`: Tuple of argument types passed from renderer to main
 * - `return`: The data type inside IPCResponse<T>
 *
 * @example
 * ```typescript
 * // Type-safe handler registration (main process)
 * type FileReadParams = IPCChannelMap[typeof IPC_CHANNELS.FILE_READ]['params']
 * // => [path: string, options?: FileReadOptions]
 *
 * type FileReadReturn = IPCChannelMap[typeof IPC_CHANNELS.FILE_READ]['return']
 * // => FileContent
 *
 * // Type-safe invoke wrapper (preload)
 * function typedInvoke<C extends IPCChannel>(
 *   channel: C,
 *   ...args: IPCChannelMap[C]['params']
 * ): Promise<IPCResponse<IPCChannelMap[C]['return']>>
 * ```
 */
export interface IPCChannelMap {
  // Test channels
  [IPC_CHANNELS.TEST_PING]: { params: []; return: string }
  [IPC_CHANNELS.TEST_ECHO]: { params: [request: EchoRequest]; return: string }

  // System information
  [IPC_CHANNELS.SYSTEM_INFO]: { params: []; return: SystemInfo }
  [IPC_CHANNELS.SYSTEM_PLATFORM]: { params: []; return: NodeJS.Platform }
  [IPC_CHANNELS.SYSTEM_VERSION]: { params: []; return: string }

  // Window control
  [IPC_CHANNELS.WINDOW_MINIMIZE]: { params: []; return: void }
  [IPC_CHANNELS.WINDOW_MAXIMIZE]: { params: []; return: boolean }
  [IPC_CHANNELS.WINDOW_CLOSE]: { params: []; return: void }
  [IPC_CHANNELS.WINDOW_TOGGLE_FULLSCREEN]: { params: []; return: boolean }

  // File operations
  [IPC_CHANNELS.FILE_READ]: { params: [path: string, options?: FileReadOptions]; return: FileContent }
  [IPC_CHANNELS.FILE_WRITE]: { params: [path: string, content: string, options?: FileWriteOptions]; return: FileOperationResult | void }
  [IPC_CHANNELS.FILE_DELETE]: { params: [path: string]; return: FileOperationResult | void }
  [IPC_CHANNELS.FILE_COPY]: { params: [sourcePath: string, destPath: string]; return: void }
  [IPC_CHANNELS.FILE_MOVE]: { params: [sourcePath: string, destPath: string]; return: FileOperationResult | void }
  [IPC_CHANNELS.FILE_LIST]: { params: [path: string, options?: ListFilesOptions]; return: FileInfo[] }
  [IPC_CHANNELS.FILE_INFO]: { params: [path: string]; return: FileInfo }
  [IPC_CHANNELS.FILE_EXISTS]: { params: [path: string]; return: boolean }

  // Directory operations
  [IPC_CHANNELS.DIR_CREATE]: { params: [path: string, recursive?: boolean]; return: void }
  [IPC_CHANNELS.DIR_DELETE]: { params: [path: string, recursive?: boolean]; return: void }

  // File watching
  [IPC_CHANNELS.FILE_WATCH_START]: { params: []; return: void }
  [IPC_CHANNELS.FILE_WATCH_STOP]: { params: []; return: void }
  [IPC_CHANNELS.FILE_WATCH_EVENT]: { params: [event: FileWatchEvent]; return: void }

  // Workspace operations
  [IPC_CHANNELS.WORKSPACE_CREATE]: { params: [options: CreateWorkspaceOptions]; return: WorkspaceInfo }
  [IPC_CHANNELS.WORKSPACE_OPEN]: { params: [path: string]; return: WorkspaceInfo }
  [IPC_CHANNELS.WORKSPACE_CLOSE]: { params: []; return: void }
  [IPC_CHANNELS.WORKSPACE_GET_CURRENT]: { params: []; return: WorkspaceInfo | null }
  [IPC_CHANNELS.WORKSPACE_VALIDATE]: { params: [path: string]; return: boolean }
  [IPC_CHANNELS.WORKSPACE_SELECT_FOLDER]: { params: []; return: string | null }
  [IPC_CHANNELS.WORKSPACE_GET_CONFIG]: { params: []; return: WorkspaceConfig }
  [IPC_CHANNELS.WORKSPACE_UPDATE_CONFIG]: { params: [updates: Partial<WorkspaceConfig>]; return: void }
  [IPC_CHANNELS.WORKSPACE_GET_METADATA]: { params: []; return: WorkspaceMetadata }

  // Workspace member management
  [IPC_CHANNELS.WORKSPACE_GET_MEMBERS]: { params: [workspaceId: string]; return: WorkspaceMember[] }
  [IPC_CHANNELS.WORKSPACE_INVITE_MEMBER]: { params: [workspaceId: string, request: InviteRequest]; return: InviteResult }
  [IPC_CHANNELS.WORKSPACE_UPDATE_MEMBER_ROLE]: { params: [workspaceId: string, userId: string, role: MemberRole]; return: void }
  [IPC_CHANNELS.WORKSPACE_REMOVE_MEMBER]: { params: [workspaceId: string, userId: string]; return: void }

  // Git operations
  [IPC_CHANNELS.GIT_STATUS]: { params: []; return: unknown }
  [IPC_CHANNELS.GIT_SYNC]: { params: []; return: unknown }
  [IPC_CHANNELS.GIT_COMMIT]: { params: [message?: string]; return: unknown }
  [IPC_CHANNELS.GIT_HISTORY]: { params: [options?: HistoryOptions]; return: readonly CommitInfo[] }
  [IPC_CHANNELS.GIT_DIFF]: { params: [filepath: string, commitA?: string, commitB?: string]; return: FileDiff }
  [IPC_CHANNELS.GIT_RESTORE]: { params: [filepath: string, commitSha: string]; return: string }

  // Git conflict operations
  [IPC_CHANNELS.GIT_GET_CONFLICTS]: { params: []; return: ConflictInfo[] }
  [IPC_CHANNELS.GIT_RESOLVE]: { params: [resolution: ConflictResolution]; return: string }

  // AI operations
  [IPC_CHANNELS.AI_CHAT]: { params: [request: AIChatRequest | string]; return: AIChatResponse }
  [IPC_CHANNELS.AI_STREAM]: { params: [request: AIStreamRequest]; return: void }
  // AI_STREAM_CHUNK / END / ERROR / ABORT: send/on (event push), not in IPCChannelMap
  [IPC_CHANNELS.AI_EMBED]: { params: [request: AIEmbedRequest | string]; return: AIEmbedResponse }
  [IPC_CHANNELS.AI_CONTEXT_FILES]: { params: [query: string, limit?: number]; return: ContextFileInfo[] }

  // Skill operations
  [IPC_CHANNELS.AI_SKILL_LIST]: { params: []; return: SkillSummary[] }
  [IPC_CHANNELS.AI_SKILL_SEARCH]: { params: [params: SkillSearchParams]; return: SkillSummary[] }

  // Memory operations
  [IPC_CHANNELS.MEMORY_SNAPSHOT]: { params: []; return: MemorySnapshotResponse }
  [IPC_CHANNELS.MEMORY_UPDATE]: { params: [request: MemoryUpdateRequest]; return: MemorySnapshotResponse }
  [IPC_CHANNELS.MEMORY_FLUSH]: { params: [request: MemoryFlushRequest]; return: MemoryFlushResponse }
  [IPC_CHANNELS.MEMORY_DAILY_LOG_QUERY]: { params: [request: DailyLogQueryRequest]; return: DailyLogEntry[] }

  // RAG operations
  [IPC_CHANNELS.RAG_SEARCH]: { params: [request: RagSearchRequest]; return: RagSearchHit[] }
  [IPC_CHANNELS.RAG_REBUILD]: { params: []; return: void }

  // Search operations
  [IPC_CHANNELS.SEARCH_QUERY]: { params: [params: SearchQueryParams]; return: SearchResult[] }
  [IPC_CHANNELS.SEARCH_INDEX_STATUS]: { params: []; return: SearchIndexStatus }
  [IPC_CHANNELS.SEARCH_REINDEX]: { params: []; return: void }
  [IPC_CHANNELS.SEARCH_INDEX_PROGRESS]: { params: [progress: SearchIndexProgress]; return: void }

  // Sync operations
  [IPC_CHANNELS.SYNC_FORCE]: { params: []; return: SyncResult }
  [IPC_CHANNELS.SYNC_STATUS_CHANGED]: { params: [data: SyncStatusData]; return: void }
  [IPC_CHANNELS.SYNC_GET_STATE]: { params: []; return: SyncStatusData }

  // Auth operations
  [IPC_CHANNELS.AUTH_LOGIN]: { params: [input: AuthLoginInput]; return: AuthSession }
  [IPC_CHANNELS.AUTH_REGISTER]: { params: [input: AuthRegisterInput]; return: AuthSession }
  [IPC_CHANNELS.AUTH_LOGOUT]: { params: []; return: void }
  [IPC_CHANNELS.AUTH_GET_CURRENT_USER]: { params: []; return: AuthSession }
  [IPC_CHANNELS.AUTH_REFRESH_TOKEN]: { params: []; return: AuthSession }

  // Event notifications
  [IPC_CHANNELS.NOTIFICATION]: { params: [message: string]; return: void }
  [IPC_CHANNELS.LOG_MESSAGE]: { params: [message: string]; return: void }
  [IPC_CHANNELS.FILE_CHANGED]: { params: [event: FileWatchEvent]; return: void }
  [IPC_CHANNELS.GIT_STATUS_CHANGED]: { params: [status: unknown]; return: void }

  // File import operations
  [IPC_CHANNELS.FILE_IMPORT]: { params: [sourcePaths: string[], options?: ImportOptions]; return: ImportResult }

  // Auto-save operations
  // FILE_NOTIFY_CHANGE: send/on (one-way), not in IPCChannelMap
  // FILE_AUTO_SAVED: Main → Renderer push, not in IPCChannelMap
  // FILE_SAVE_FAILED: Main → Renderer push, not in IPCChannelMap
  [IPC_CHANNELS.FILE_RETRY_SAVE]: { params: [filePath: string]; return: void }

  // Harness / Guardrail operations
  // HARNESS_GUARDRAIL_BLOCKED: Main → Renderer push, not in IPCChannelMap
  [IPC_CHANNELS.HARNESS_EXECUTE]: { params: [request: AIChatRequest]; return: HarnessResult }
  [IPC_CHANNELS.HARNESS_SET_MODE]: { params: [mode: HarnessMode]; return: void }
  [IPC_CHANNELS.HARNESS_GET_MODE]: { params: []; return: HarnessMode }
  // HARNESS_DEGRADATION_OCCURRED: Main → Renderer push, not in IPCChannelMap
  [IPC_CHANNELS.HARNESS_LIST_GUARDRAILS]: { params: []; return: GuardrailRuleSummaryShared[] }
  [IPC_CHANNELS.HARNESS_SET_GUARDRAIL_ENABLED]: { params: [request: SetGuardrailEnabledRequest]; return: void }
  [IPC_CHANNELS.HARNESS_LIST_GUIDES]: { params: []; return: GuideSummary[] }
  [IPC_CHANNELS.HARNESS_SET_GUIDE_ENABLED]: { params: [request: SetGuideEnabledRequest]; return: void }

  // Task State Machine operations (TASK021)
  [IPC_CHANNELS.HARNESS_LIST_RESUMEABLE]: { params: []; return: TaskStateSummary[] }
  [IPC_CHANNELS.HARNESS_RESUME_TASK]: { params: [taskId: string]; return: TaskResumeResultShared }
  [IPC_CHANNELS.HARNESS_ABANDON_TASK]: { params: [taskId: string]; return: void }
  // HARNESS_RESUMEABLE_DETECTED: Main → Renderer push, not in IPCChannelMap
}

/**
 * Helper types for extracting channel params and return types
 */
export type IPCChannelParams<C extends IPCChannel> = IPCChannelMap[C]['params']
export type IPCChannelReturn<C extends IPCChannel> = IPCChannelMap[C]['return']

/**
 * Generic IPC response wrapper
 * 
 * This interface wraps all IPC responses to provide consistent
 * error handling and request tracking across the application.
 * 
 * @template T - The type of the response data
 * 
 * @example
 * ```typescript
 * // Success response
 * const response: IPCResponse<string> = {
 *   success: true,
 *   data: 'Hello World',
 *   timestamp: Date.now()
 * }
 * 
 * // Error response
 * const errorResponse: IPCResponse = {
 *   success: false,
 *   error: {
 *     type: ErrorType.IPC_ERROR,
 *     message: 'Operation failed'
 *   },
 *   timestamp: Date.now()
 * }
 * ```
 */
export interface IPCResponse<T = unknown> {
  /** Whether the operation succeeded */
  success: boolean
  /** Response data (only present when success is true) */
  data?: T
  /** Error information (only present when success is false) */
  error?: AppError
  /** Timestamp when the response was created (milliseconds since epoch) */
  timestamp?: number
  /** Optional request ID for tracking and debugging */
  requestId?: string
}

/**
 * System information
 * 
 * Contains detailed information about the system and runtime environment.
 * This is useful for debugging, analytics, and platform-specific features.
 * 
 * @example
 * ```typescript
 * const info = await window.electronAPI.getSystemInfo()
 * if (info.success && info.data) {
 *   console.log(`Running on ${info.data.platform} ${info.data.arch}`)
 * }
 * ```
 */
export interface SystemInfo {
  /** Operating system platform (darwin, win32, linux, etc.) */
  platform: NodeJS.Platform
  /** CPU architecture (x64, arm64, etc.) */
  arch: string
  /** Application version */
  version: string
  /** Electron framework version */
  electronVersion: string
  /** Chrome browser version */
  chromeVersion: string
  /** Node.js runtime version */
  nodeVersion: string
}

/**
 * Test echo request
 * 
 * Used for testing IPC communication with optional delay simulation.
 * 
 * @example
 * ```typescript
 * // Simple echo
 * const response = await window.electronAPI.echo('Hello')
 * 
 * // Echo with 1 second delay
 * const delayedResponse = await window.electronAPI.echo('Hello', 1000)
 * ```
 */
export interface EchoRequest {
  /** Message to echo back */
  message: string
  /** Optional delay in milliseconds before responding */
  delay?: number
}

/**
 * Error types for better error handling
 */
export enum ErrorType {
  UNKNOWN = 'UNKNOWN',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  IPC_ERROR = 'IPC_ERROR',
}

/**
 * Application error structure
 * 
 * Provides detailed error information for better debugging
 * and user-friendly error messages.
 */
export interface AppError {
  /** Error type classification */
  type: ErrorType
  /** Human-readable error message */
  message: string
  /** Additional error details (stack trace, context, etc.) */
  details?: unknown
}

/**
 * File operation types
 */

/**
 * File read options
 * 
 * @remarks
 * Constraints:
 * - maxSize: Must be between 1 byte and 100MB (104,857,600 bytes)
 * - Default maxSize is 10MB (10,485,760 bytes)
 * - Paths must not exceed 4096 characters (cross-platform limit)
 */
export interface FileReadOptions {
  /** File encoding (default: 'utf-8') */
  encoding?: BufferEncoding
  /** 
   * Maximum file size in bytes (default: 10MB, max: 100MB)
   * @minimum 1
   * @maximum 104857600
   */
  maxSize?: number
}

/**
 * File content response
 */
export interface FileContent {
  /** File path */
  path: string
  /** File content */
  content: string
  /** Encoding used */
  encoding: string
  /** File size in bytes */
  size: number
}

/**
 * File write options
 * 
 * @remarks
 * Constraints:
 * - Content size should not exceed 100MB for performance reasons
 * - Paths must not exceed 4096 characters (cross-platform limit)
 * - atomic write is recommended for critical files
 */
export interface FileWriteOptions {
  /** File encoding (default: 'utf-8') */
  encoding?: BufferEncoding
  /** Use atomic write (write to temp file then rename, default: true) */
  atomic?: boolean
  /** Create parent directories if they don't exist (default: true) */
  createDirs?: boolean
}

/**
 * List files options
 * 
 * @remarks
 * Constraints:
 * - Recursive depth is limited to 100 levels to prevent infinite recursion
 * - Large directories (>10,000 files) may impact performance
 * - Hidden files are excluded by default for security
 */
export interface ListFilesOptions {
  /** 
   * List files recursively (default: false)
   * @remarks Maximum depth: 100 levels
   */
  recursive?: boolean
  /** 
   * Include hidden files starting with . (default: false)
   * @remarks Excludes .git, .env, and other sensitive files by default
   */
  includeHidden?: boolean
}

/**
 * File information
 */
export interface FileInfo {
  /** File name */
  name: string
  /** Full file path */
  path: string
  /** Whether this is a directory */
  isDirectory: boolean
  /** File size in bytes */
  size: number
  /** Last modified time (ISO 8601 format) */
  modifiedTime: string
  /** Creation time (ISO 8601 format) */
  createdTime: string
  /** File extension (without dot) */
  extension?: string
}

/**
 * File watch event
 */
export interface FileWatchEvent {
  /** Event type */
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  /** File path */
  path: string
  /** File stats (only for add/change/addDir events) */
  stats?: FileInfo
}

/**
 * AI Types
 *
 * These types are shared between main and renderer processes for
 * cloud gateway communication, local memory updates, and local RAG retrieval.
 */

export interface AIChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIChatRequest {
  /** User message text */
  message: string
  /** Chat session identifier for logging */
  sessionId?: string
  /** Preferred model name */
  model?: string
  /** Sampling temperature (0-2) */
  temperature?: number
  /** Maximum response tokens */
  maxTokens?: number
  /** Whether to perform local RAG retrieval from archives */
  useRag?: boolean
  /** Context window size used for 75% flush threshold calculation */
  contextWindowTokens?: number
  /** Current session token usage before this turn */
  sessionTokenUsage?: number
  /** Current editing file path (relative to workspace root) */
  currentFile?: string
  /** Manually referenced file paths via @[[path]] syntax */
  manualRefs?: string[]
  /** Skill IDs referenced via #skill-name syntax */
  skillRefs?: string[]
  /** Classified intent for harness mode resolution */
  intent?: 'chat' | 'modify_file' | 'question_answering' | 'brainstorm' | 'analyze' | 'search' | 'plan'
  /** Target file path for file modification operations */
  targetFile?: string
  /** Explicitly requested tool IDs */
  explicitTools?: string[]
  /** Planned steps for multi-step task tracking (TASK021) */
  plannedSteps?: string[]
  /** Whether this is a long-running task (TASK021) */
  longRunning?: boolean
}

export interface AIRagHit {
  path: string
  score: number
  snippet: string
}

export interface AIMemoryState {
  tokenCount: number
  tokenDebt: number
  flushTriggered: boolean
}

export interface AIChatResponse {
  id: string
  model: string
  provider: 'openai' | 'anthropic' | 'mock'
  content: string
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    estimatedCostUsd: number
  }
  intercepted: boolean
  warnings: string[]
  ragHits: AIRagHit[]
  memory: AIMemoryState
}

export interface AIStreamChunk {
  id: string
  delta: string
}

export interface AIStreamEnd {
  id: string
  content: string
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    estimatedCostUsd: number
  }
  ragHits: AIRagHit[]
  memory: AIMemoryState
  provider: 'openai' | 'anthropic' | 'mock'
  model: string
  intercepted: boolean
  warnings: string[]
}

export interface AIStreamError {
  id: string
  code: 'rate_limit' | 'context_length' | 'timeout' | 'auth' | 'network' | 'unknown'
  message: string
  retryable: boolean
  partialContent: string
}

export interface AIStreamRequest extends AIChatRequest {
  streamId: string
}

export interface AIEmbedRequest {
  text: string
  dimensions?: number
}

export interface AIEmbedResponse {
  model: string
  vector: number[]
}

/**
 * Workspace Types
 * 
 * These types are shared between main and renderer processes for workspace operations.
 */

/**
 * Workspace configuration stored in .sibylla/config.json
 */
export interface WorkspaceConfig {
  /** Unique workspace identifier (format: ws-xxxxx) */
  workspaceId: string
  
  /** Workspace display name */
  name: string
  
  /** Workspace description */
  description: string
  
  /** Workspace icon (emoji or URL) */
  icon: string
  
  /** Default AI model to use (Phase 1+: BYOK mode will allow user-provided API keys) */
  defaultModel: string
  
  /** Auto-sync interval in seconds (0 = manual only) */
  syncInterval: number
  
  /** Workspace creation timestamp (ISO 8601) */
  createdAt: string
  
  /** Git provider: 'sibylla' (default) or 'github' (user-provided) */
  gitProvider: 'sibylla' | 'github'
  
  /** Git remote URL */
  gitRemote: string | null
  
  /** Last sync timestamp (ISO 8601) */
  lastSyncAt: string | null
}

/**
 * Workspace metadata (runtime information, not persisted)
 */
export interface WorkspaceMetadata {
  /** Absolute path to workspace root directory */
  path: string
  
  /** Workspace size in bytes */
  sizeBytes: number
  
  /** Number of files in workspace */
  fileCount: number
  
  /** Last modified timestamp (ISO 8601) */
  lastModifiedAt: string
  
  /** Whether workspace is currently syncing */
  isSyncing: boolean
  
  /** Whether workspace has uncommitted changes */
  hasUncommittedChanges: boolean
}

/**
 * Options for creating a new workspace
 */
export interface CreateWorkspaceOptions {
  /** Workspace display name */
  name: string
  
  /** Workspace description */
  description: string
  
  /** Workspace icon (emoji or URL) */
  icon: string
  
  /** Absolute path where workspace should be created */
  path: string
  
  /** Owner information */
  owner: {
    name: string
    email: string
  }
  
  /** Whether to enable cloud sync (requires authentication) */
  enableCloudSync?: boolean
  
  /** Git provider (default: 'sibylla') */
  gitProvider?: 'sibylla' | 'github'
  
  /** Custom git remote URL (for GitHub provider) */
  gitRemoteUrl?: string
  
  /** Default AI model (default: 'claude-sonnet-4-20250514'). Phase 1+: BYOK mode will allow user-provided API keys */
  defaultModel?: string
  
  /** Auto-sync interval in seconds (default: 30, 0 = manual only) */
  syncInterval?: number
}

/**
 * Complete workspace information (config + metadata)
 */
export interface WorkspaceInfo {
  /** Workspace configuration */
  config: WorkspaceConfig
  
  /** Workspace metadata */
  metadata: WorkspaceMetadata
}

/**
 * Sync Status Types
 *
 * These types are shared between main and renderer processes for sync operations.
 */

/**
 * Sync status enumeration
 *
 * Represents the current synchronization state of the workspace.
 */
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'conflict' | 'error' | 'offline'

/**
 * Sync status data pushed to the renderer process
 */
export interface SyncStatusData {
  /** Current synchronization status */
  readonly status: SyncStatus

  /** Timestamp when the status was generated (milliseconds since epoch) */
  readonly timestamp: number

  /** Human-readable error message (only present when status is 'error') */
  readonly message?: string

  /** List of conflicting file paths (only present when status is 'conflict') */
  readonly conflictFiles?: readonly string[]
}


/**
 * Sync Result Types
 *
 * These types are shared between main and renderer processes for sync operations.
 * Canonical definition — git-abstraction.types.ts re-exports from here.
 */

/**
 * Result of a sync (pull + push) operation
 *
 * Used by SyncManager.forceSync() return value and SyncHandler IPC response.
 */
export interface SyncResult {
  /** Whether the sync operation completed successfully */
  readonly success: boolean

  /** Whether there are file conflicts that need resolution */
  readonly hasConflicts?: boolean

  /** List of conflicting file paths */
  readonly conflicts?: readonly string[]

  /** Error message if the sync failed */
  readonly error?: string
}


/**
 * Auth Types
 *
 * These types are shared between main and renderer processes for authentication.
 */

/**
 * Login credentials
 */
export interface AuthLoginInput {
  /** User email address */
  readonly email: string
  /** User password */
  readonly password: string
}

/**
 * Registration input
 */
export interface AuthRegisterInput {
  /** User email address */
  readonly email: string
  /** User password */
  readonly password: string
  /** User display name */
  readonly name: string
}

/**
 * Authenticated user information
 */
export interface AuthUser {
  /** User unique identifier */
  readonly id: string
  /** User email address */
  readonly email: string
  /** User display name */
  readonly name: string
  /** User avatar URL */
  readonly avatarUrl?: string
}

/**
 * Auth token pair returned from login/register
 */
export interface AuthTokens {
  /** JWT access token */
  readonly accessToken: string
  /** Refresh token for token rotation */
  readonly refreshToken: string
  /** Access token expiry in seconds */
  readonly expiresIn: number
}

/**
 * Auth session state exposed to renderer
 */
export interface AuthSession {
  /** Whether the user is authenticated */
  readonly isAuthenticated: boolean
  /** Currently authenticated user (null if not authenticated) */
  readonly user: AuthUser | null
}

/**
 * Import Types
 *
 * Shared types for file import functionality.
 * All imported content is stored as Markdown (CLAUDE.md "file as truth" principle).
 */

/** Supported import file extensions */
export type ImportableFileType = '.md' | '.docx' | '.pdf' | '.csv' | '.txt'

/** Single file import result */
export interface ImportFileResult {
  /** Original absolute file path */
  readonly sourcePath: string
  /** Destination path in workspace (relative) */
  readonly destPath: string
  /** How the file was processed */
  readonly action: 'copied' | 'converted' | 'skipped' | 'failed'
  /** Original file extension */
  readonly sourceType: ImportableFileType
  /** Error message (only present when action is 'failed') */
  readonly error?: string
}

/** Batch import result summary */
export interface ImportResult {
  /** Successfully imported (copied as-is) */
  readonly imported: ImportFileResult[]
  /** Successfully converted and imported */
  readonly converted: ImportFileResult[]
  /** Skipped (unsupported format) */
  readonly skipped: ImportFileResult[]
  /** Failed imports */
  readonly failed: ImportFileResult[]
  /** Total processing time in milliseconds */
  readonly durationMs: number
}

/** Import options (IPC-serializable, no callbacks) */
export interface ImportOptions {
  /** Target directory in workspace (relative path, default: '/') */
  readonly targetDir?: string
  /** Whether to flatten folder structure (default: false) */
  readonly flatten?: boolean
  /** Whether to overwrite existing files (default: false) */
  readonly overwrite?: boolean
}

/** Import progress event data (Main → Renderer) */
export interface ImportProgress {
  /** Current file index (1-based) */
  readonly current: number
  /** Total number of files */
  readonly total: number
  /** Name of the file currently being processed */
  readonly fileName: string
}

/**
 * Auto-Save Types
 *
 * Shared types for auto-save event payloads exchanged via IPC.
 */

/** Payload for file:autoSaved event (Main → Renderer) */
export interface AutoSavedPayload {
  /** List of file paths that were successfully saved and committed */
  readonly files: readonly string[]
  /** Timestamp when the save completed (milliseconds since epoch) */
  readonly timestamp: number
}

/** Payload for file:saveFailed event (Main → Renderer) */
export interface SaveFailedPayload {
  /** List of files that failed to save with error details */
  readonly files: ReadonlyArray<{ readonly path: string; readonly error: string }>
}

/**
 * Conflict Types
 *
 * Shared types for Git conflict detection and resolution.
 * Defined here (shared/types.ts) following the same pattern as SyncStatus/SyncResult.
 */

/** Single file conflict information */
export interface ConflictInfo {
  /** Workspace-relative file path */
  readonly filePath: string
  /** Local (ours) version content — extracted from <<<<<<< HEAD section */
  readonly localContent: string
  /** Remote (theirs) version content — extracted from >>>>>>> section */
  readonly remoteContent: string
  /** Common ancestor (base) version content */
  readonly baseContent: string
  /** Name of the remote author (if available) */
  readonly remoteAuthor?: string
}

/** Conflict resolution strategy */
export type ResolutionType = 'mine' | 'theirs' | 'manual'

/** Resolution request — sent from renderer via IPC */
export interface ConflictResolution {
  /** Workspace-relative file path */
  readonly filePath: string
  /** Resolution strategy */
  readonly type: ResolutionType
  /** Required when type is 'manual' */
  readonly content?: string
}

/**
 * Context Engine Types
 *
 * Types for the AI context assembly system, supporting three-layer
 * context model (always-load, semantic, manual-reference).
 */

export type ContextLayerType = 'always' | 'manual' | 'skill'

export interface ContextSource {
  filePath: string
  content: string
  tokenCount: number
  layer: ContextLayerType
}

export interface ContextLayer {
  type: ContextLayerType
  sources: ContextSource[]
  totalTokens: number
}

export interface AssembledContext {
  layers: ContextLayer[]
  systemPrompt: string
  totalTokens: number
  budgetUsed: number
  budgetTotal: number
  sources: ContextSource[]
  warnings: string[]
  /** Tool definitions available in the current scope (TASK020) */
  toolDefinitions?: readonly ToolDefinitionSummary[]
}

export interface ContextEngineConfig {
  maxContextTokens?: number
  systemPromptReserve?: number
  alwaysLoadFiles?: string[]
}

export interface ContextFileInfo {
  path: string
  name: string
  type: 'file' | 'directory'
  extension?: string
}

export interface Skill {
  id: string
  name: string
  description: string
  scenarios: string
  instructions: string
  outputFormat: string
  examples: string
  filePath: string
  tokenCount: number
  updatedAt: number
}

export interface SkillSummary {
  id: string
  name: string
  description: string
  scenarios: string
}

export interface SkillSearchParams {
  query: string
  limit?: number
}

export interface SearchQueryParams {
  query: string
  limit?: number
  fileExtensions?: string[]
}

export interface SearchResult {
  id: string
  path: string
  snippet: string
  rank: number
  lineNumber?: number
  matchCount: number
}

export interface SearchIndexStatus {
  totalFiles: number
  indexedFiles: number
  indexSizeBytes: number
  lastIndexedAt: number | null
  isIndexing: boolean
}

export interface SearchIndexProgress {
  phase: 'scanning' | 'indexing' | 'complete' | 'error'
  current: number
  total: number
  filePath?: string
  error?: string
}

// ─── Memory IPC Types ───

export interface MemorySnapshotResponse {
  content: string
  tokenCount: number
  tokenDebt: number
}

export interface MemoryUpdateRequest {
  updates: MemoryUpdateItem[]
}

export interface MemoryUpdateItem {
  section: string
  content: string
  priority?: 'P0' | 'P1' | 'P2'
  tags?: string[]
}

export interface MemoryFlushRequest {
  sessionTokens: number
  contextWindowTokens: number
  pendingInsights: string[]
}

export interface MemoryFlushResponse {
  triggered: boolean
  thresholdTokens: number
  sessionTokens: number
  snapshot: MemorySnapshotResponse
}

export interface DailyLogQueryRequest {
  date: string
}

export interface DailyLogEntry {
  timestamp: string
  type: string
  operator: string
  sessionId: string
  summary: string
  details: string[]
  tags: string[]
  relatedFiles: string[]
}

// ─── RAG IPC Types ───

export interface RagSearchRequest {
  query: string
  limit?: number
}

export interface RagSearchHit {
  path: string
  score: number
  snippet: string
}

// ─── Guardrail Shared Types ───

/**
 * Event payload broadcast when a guardrail blocks an operation.
 * Consumed by renderer process for user notifications (TASK021).
 */
export interface GuardrailBlockedEvent {
  readonly ruleId: string
  readonly reason: string
  readonly severity: 'block'
  readonly path?: string
  readonly operationType?: 'write' | 'delete' | 'rename' | 'read'
}

/**
 * Request to enable or disable a guardrail rule.
 */
export interface SetGuardrailEnabledRequest {
  readonly ruleId: string
  readonly enabled: boolean
}

/**
 * Summary of a guardrail rule (returned by harness:listGuardrails).
 */
export interface GuardrailRuleSummaryShared {
  readonly id: string
  readonly description: string
  readonly enabled: boolean
}

/**
 * Result of a file operation that may be blocked or require confirmation.
 * Extends existing void returns to support guardrail conditional flow.
 */
export type FileOperationResult =
  | { readonly status: 'completed' }
  | {
      readonly status: 'blocked'
      readonly ruleId: string
      readonly reason: string
    }
  | {
      readonly status: 'pending_confirmation'
      readonly ruleId: string
      readonly reason: string
    }

// ─── Harness Shared Types ───

export type HarnessMode = 'single' | 'dual' | 'panel'

export interface HarnessConfig {
  readonly defaultMode: HarnessMode
  readonly maxRetries: number
  readonly evaluatorModel?: string
  readonly panelEvaluators?: PanelEvaluatorConfig[]
}

export interface PanelEvaluatorConfig {
  readonly id: string
  readonly role: string
  readonly systemPromptOverride?: string
}

export interface HarnessResult {
  readonly finalResponse: AIChatResponse
  readonly mode: HarnessMode
  readonly generatorAttempts: number
  readonly evaluations: EvaluationReport[]
  readonly sensorSignals: SensorSignal[]
  readonly guardrailVerdicts: GuardrailVerdictSummary[]
  readonly degraded: boolean
  readonly degradeReason?: string
}

export interface EvaluationReport {
  readonly evaluatorId: string
  readonly verdict: 'pass' | 'fail'
  readonly dimensions: Record<string, EvaluationDimension>
  readonly criticalIssues: readonly string[]
  readonly minorIssues: readonly string[]
  readonly rationale: string
  readonly timestamp: number
}

export interface EvaluationDimension {
  readonly pass: boolean
  readonly issues: readonly string[]
}

export interface SensorSignal {
  readonly sensorId: string
  readonly severity: 'info' | 'warn' | 'error'
  readonly location?: { readonly file?: string; readonly line?: number; readonly span?: readonly [number, number] }
  readonly message: string
  readonly correctionHint: string
}

export interface GuardrailVerdictSummary {
  readonly ruleId: string
  readonly blocked: boolean
  readonly reason?: string
}

export interface DegradationWarning {
  readonly id: string
  readonly timestamp: number
  readonly reason: string
  readonly originalMode: HarnessMode
  readonly degradedTo: HarnessMode
}

export interface HarnessMeta {
  readonly mode: HarnessMode
  readonly degraded: boolean
  readonly degradeReason?: string
  readonly generatorAttempts: number
}

// ─── Guide Shared Types (TASK019) ───

export interface GuideSummary {
  readonly id: string
  readonly category: string
  readonly priority: number
  readonly description: string
  readonly enabled: boolean
}

export interface SetGuideEnabledRequest {
  readonly guideId: string
  readonly enabled: boolean
}

// ─── Tool Scope Shared Types (TASK020) ───

/** Summary of a tool definition for renderer-side display */
export interface ToolSummary {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly tags: readonly string[]
}

/** Summary of an intent profile for renderer-side display */
export interface IntentProfileSummary {
  readonly intent: string
  readonly tools: readonly string[]
  readonly maxTools: number
}

/** Tool definition summary for context injection (no handler) */
export interface ToolDefinitionSummary {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly schema: Readonly<Record<string, unknown>>
}

// ─── Task State Machine Shared Types (TASK021) ───

/** Summary of a task state for renderer-side display */
export interface TaskStateSummary {
  readonly taskId: string
  readonly goal: string
  readonly status: string
  readonly completedSteps: number
  readonly totalSteps: number
  readonly updatedAt: number
}

/** Guardrail notification data for renderer-side display */
export interface GuardrailNotificationData {
  readonly id: string
  readonly ruleId: string
  /** Human-readable rule name (e.g. "系统路径保护") */
  readonly ruleName: string
  readonly reason: string
  readonly severity: 'block' | 'conditional'
  readonly timestamp: number
}

/** IPC-serializable result of task resume operation */
export interface TaskResumeResultShared {
  readonly state: TaskStateSummary
  readonly resumePrompt: string
}
