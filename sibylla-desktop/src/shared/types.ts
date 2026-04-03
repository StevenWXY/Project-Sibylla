/**
 * Shared type definitions for Sibylla Desktop Application
 * 
 * This file contains type definitions that are shared across
 * main process, renderer process, and preload scripts.
 */

// Re-export ElectronAPI type from preload for convenience
export type { ElectronAPI } from '../preload/index'

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
  
  // Git operations (reserved for future implementation)
  GIT_STATUS: 'git:status',
  GIT_SYNC: 'git:sync',
  GIT_COMMIT: 'git:commit',
  GIT_HISTORY: 'git:history',
  GIT_DIFF: 'git:diff',
  
  // AI operations (reserved for future implementation)
  AI_CHAT: 'ai:chat',
  AI_STREAM: 'ai:stream',
  AI_EMBED: 'ai:embed',
  
  // Sync operations (SyncManager layer — distinct from git:sync which is direct Git sync)
  /** Renderer → Main: Force trigger a sync operation */
  SYNC_FORCE: 'sync:force',
  /** Main → Renderer: Broadcast sync status changes */
  SYNC_STATUS_CHANGED: 'sync:status-changed',

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
  [IPC_CHANNELS.FILE_WRITE]: { params: [path: string, content: string, options?: FileWriteOptions]; return: void }
  [IPC_CHANNELS.FILE_DELETE]: { params: [path: string]; return: void }
  [IPC_CHANNELS.FILE_COPY]: { params: [sourcePath: string, destPath: string]; return: void }
  [IPC_CHANNELS.FILE_MOVE]: { params: [sourcePath: string, destPath: string]; return: void }
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

  // Git operations (reserved)
  [IPC_CHANNELS.GIT_STATUS]: { params: []; return: unknown }
  [IPC_CHANNELS.GIT_SYNC]: { params: []; return: unknown }
  [IPC_CHANNELS.GIT_COMMIT]: { params: [message?: string]; return: unknown }
  [IPC_CHANNELS.GIT_HISTORY]: { params: []; return: unknown }
  [IPC_CHANNELS.GIT_DIFF]: { params: []; return: unknown }

  // AI operations
  [IPC_CHANNELS.AI_CHAT]: { params: [request: AIChatRequest | string]; return: AIChatResponse }
  [IPC_CHANNELS.AI_STREAM]: { params: [request: AIChatRequest | string]; return: AIChatResponse }
  [IPC_CHANNELS.AI_EMBED]: { params: [request: AIEmbedRequest | string]; return: AIEmbedResponse }

  // Sync operations
  [IPC_CHANNELS.SYNC_FORCE]: { params: []; return: SyncResult }
  [IPC_CHANNELS.SYNC_STATUS_CHANGED]: { params: [data: SyncStatusData]; return: void }

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
