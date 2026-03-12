/**
 * File Manager Type Definitions
 * 
 * This file contains all type definitions for the file management system.
 * All types follow TypeScript strict mode requirements.
 */

/**
 * File information metadata
 * 
 * Contains comprehensive metadata about a file or directory.
 * All fields are readonly to prevent accidental modification.
 * Timestamps are stored as Unix timestamps (milliseconds) for immutability.
 */
export interface FileInfo {
  /** File or directory name (without path) */
  readonly name: string
  /** Relative path from workspace root */
  readonly path: string
  /** Whether this is a directory */
  readonly isDirectory: boolean
  /** File size in bytes (0 for directories) */
  readonly size: number
  /** Last modified timestamp (Unix timestamp in milliseconds) */
  readonly modifiedTime: number
  /** Creation timestamp (Unix timestamp in milliseconds) */
  readonly createdTime: number
  /** File extension (e.g., '.md', '.json'), undefined for directories */
  readonly extension?: string
}

/**
 * File content with metadata
 * 
 * Returned when reading a file, includes both content and metadata.
 */
export interface FileContent {
  /** Relative path from workspace root */
  readonly path: string
  /** File content as string */
  readonly content: string
  /** Encoding used to read the file */
  readonly encoding: string
  /** File size in bytes */
  readonly size: number
}

/**
 * Options for writing files
 */
export interface WriteFileOptions {
  /** Text encoding (default: 'utf-8') */
  encoding?: BufferEncoding
  /** Use atomic write (temp file + rename) (default: true) */
  atomic?: boolean
  /** Create parent directories if they don't exist (default: true) */
  createDirs?: boolean
}

/**
 * Options for reading files
 */
export interface ReadFileOptions {
  /** Text encoding (default: 'utf-8') */
  encoding?: BufferEncoding
  /** Maximum file size in bytes (default: 10MB) */
  maxSize?: number
}

/**
 * Options for listing files
 */
export interface ListFilesOptions {
  /** Recursively list subdirectories (default: false) */
  recursive?: boolean
  /** Include hidden files (starting with '.') (default: false) */
  includeHidden?: boolean
  /** Custom filter function */
  filter?: (file: FileInfo) => boolean
}

/**
 * File watch event types
 */
export type FileWatchEventType = 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'

/**
 * File watch event
 * 
 * Emitted when a file or directory changes in the workspace.
 */
export interface FileWatchEvent {
  /** Event type */
  readonly type: FileWatchEventType
  /** Relative path from workspace root */
  readonly path: string
  /** File metadata (only for 'add' and 'change' events) */
  readonly stats?: FileInfo
}

/**
 * File manager error codes
 * 
 * Standardized error codes for file operations.
 */
export const FILE_ERROR_CODES = {
  PATH_OUTSIDE_WORKSPACE: 'PATH_OUTSIDE_WORKSPACE',
  ACCESS_FORBIDDEN: 'ACCESS_FORBIDDEN',
  PATH_TOO_LONG: 'PATH_TOO_LONG',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  DISK_FULL: 'DISK_FULL',
  INVALID_ENCODING: 'INVALID_ENCODING',
  DIRECTORY_NOT_EMPTY: 'DIRECTORY_NOT_EMPTY',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  IS_DIRECTORY: 'IS_DIRECTORY',
  IS_FILE: 'IS_FILE',
  NOT_A_DIRECTORY: 'NOT_A_DIRECTORY',
  OPERATION_TIMEOUT: 'OPERATION_TIMEOUT',
  CONCURRENT_MODIFICATION: 'CONCURRENT_MODIFICATION',
  WATCHER_ALREADY_STARTED: 'WATCHER_ALREADY_STARTED',
} as const

/**
 * Type for error codes
 */
export type FileErrorCode = typeof FILE_ERROR_CODES[keyof typeof FILE_ERROR_CODES]

/**
 * File manager error class
 * 
 * Custom error class for file operations with structured error information.
 */
export class FileManagerError extends Error {
  /**
   * Create a new FileManagerError
   * 
   * @param code - Error code from FILE_ERROR_CODES
   * @param message - Human-readable error message
   * @param details - Additional error details (file path, etc.)
   */
  constructor(
    public readonly code: FileErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'FileManagerError'
    
    // Maintain proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FileManagerError)
    }
  }
}
