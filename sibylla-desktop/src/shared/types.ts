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

