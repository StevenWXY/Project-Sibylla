/**
 * Git Abstraction Layer Type Definitions
 * 
 * This file contains all type definitions for the Git abstraction layer.
 * The Git abstraction layer encapsulates all Git operations behind semantic
 * interfaces, ensuring upper-layer code never directly calls isomorphic-git API.
 * 
 * All types follow TypeScript strict mode requirements:
 * - No `any` types
 * - All interface properties are `readonly`
 * - Explicit return types on all public methods
 * 
 * Design principles:
 * - Git invisible: No Git terminology exposed to users
 * - File-level collaboration: Minimum collaboration unit is file
 * - Local-first: Works offline, syncs when online
 */

/**
 * Configuration for GitAbstraction constructor
 * 
 * Provides all necessary configuration to initialize the Git abstraction layer.
 */
export interface GitAbstractionConfig {
  /** Absolute path to the workspace directory */
  readonly workspaceDir: string

  /** Author name for Git commits */
  readonly authorName: string

  /** Author email for Git commits */
  readonly authorEmail: string

  /** Default branch name (default: 'main') */
  readonly defaultBranch?: string
}

/**
 * Individual file status type
 * 
 * Represents the current state of a single file in the repository.
 */
export enum FileStatusType {
  /** File has not been modified */
  UNMODIFIED = 'unmodified',

  /** File has been modified in the working directory */
  MODIFIED = 'modified',

  /**
   * File has been staged for commit (generic).
   * Reserved for future use — currently resolveFileStatusType() returns
   * more specific values: ADDED, MODIFIED_STAGED, or DELETED_STAGED instead.
   */
  STAGED = 'staged',

  /** File is new and untracked */
  UNTRACKED = 'untracked',

  /** File has been deleted from the working directory */
  DELETED = 'deleted',

  /** File has been staged as a new addition */
  ADDED = 'added',

  /** File has been modified and staged */
  MODIFIED_STAGED = 'modified_staged',

  /** File has been deleted and staged */
  DELETED_STAGED = 'deleted_staged',
}

/**
 * Single file status information
 * 
 * Contains the status of a specific file, including its path and current state.
 */
export interface FileStatus {
  /** Relative file path from workspace root */
  readonly filepath: string

  /** Current status of the file */
  readonly status: FileStatusType
}

/**
 * Repository status overview
 * 
 * Aggregated view of all file statuses in the repository,
 * categorized by their current state.
 */
export interface GitStatus {
  /** Files modified in working directory (unstaged) */
  readonly modified: readonly string[]

  /** Files staged for commit */
  readonly staged: readonly string[]

  /** New files not yet tracked by Git */
  readonly untracked: readonly string[]

  /** Files deleted from working directory */
  readonly deleted: readonly string[]
}

/**
 * Commit information
 * 
 * Contains metadata about a single Git commit.
 * Timestamps are stored as Unix timestamps in milliseconds.
 */
export interface CommitInfo {
  /** Commit hash (SHA-1 OID) */
  readonly oid: string

  /** Commit message */
  readonly message: string

  /** Author name */
  readonly authorName: string

  /** Author email */
  readonly authorEmail: string

  /** Commit timestamp (Unix timestamp in milliseconds) */
  readonly timestamp: number

  /** Parent commit hashes */
  readonly parents: readonly string[]
}

/**
 * Options for querying commit history
 */
export interface HistoryOptions {
  /** Maximum number of commits to return (default: 50) */
  readonly depth?: number

  /** Only include commits that affect this file path */
  readonly filepath?: string

  /** Starting ref to query from (default: 'HEAD') */
  readonly ref?: string
}

/**
 * Single line in a diff hunk
 * 
 * Represents one line of change in a diff output.
 */
export interface DiffLine {
  /** Type of change: added, removed, or context (unchanged) */
  readonly type: 'add' | 'delete' | 'context'

  /** Line content */
  readonly content: string
}

/**
 * A contiguous block of changes in a diff
 * 
 * Represents a hunk in unified diff format.
 */
export interface DiffHunk {
  /** Starting line number in the old file */
  readonly oldStart: number

  /** Number of lines in the old file */
  readonly oldLines: number

  /** Starting line number in the new file */
  readonly newStart: number

  /** Number of lines in the new file */
  readonly newLines: number

  /** Lines in this hunk */
  readonly lines: readonly DiffLine[]
}

/**
 * File difference information
 * 
 * Contains the diff between two versions of a file,
 * including both the raw content and structured hunks.
 */
export interface FileDiff {
  /** Relative file path from workspace root */
  readonly filepath: string

  /** Content of the old version (empty string for new files) */
  readonly oldContent: string

  /** Content of the new version (empty string for deleted files) */
  readonly newContent: string

  /** Structured diff hunks */
  readonly hunks: readonly DiffHunk[]
}

/**
 * Git abstraction error codes
 * 
 * Standardized error codes for Git operations.
 * Follows the same pattern as FileManagerError and WorkspaceError.
 */
export enum GitAbstractionErrorCode {
  /** Repository has not been initialized */
  NOT_INITIALIZED = 'NOT_INITIALIZED',

  /** Repository has already been initialized */
  ALREADY_INITIALIZED = 'ALREADY_INITIALIZED',

  /** The specified file path is invalid or not found */
  INVALID_PATH = 'INVALID_PATH',

  /** The specified commit reference is invalid or not found */
  INVALID_REF = 'INVALID_REF',

  /** No files are staged for commit */
  NOTHING_TO_COMMIT = 'NOTHING_TO_COMMIT',

  /** Failed to stage a file */
  STAGE_FAILED = 'STAGE_FAILED',

  /** Failed to create a commit */
  COMMIT_FAILED = 'COMMIT_FAILED',

  /** Failed to read file content from a commit */
  READ_BLOB_FAILED = 'READ_BLOB_FAILED',

  /** Failed to query commit history */
  LOG_FAILED = 'LOG_FAILED',

  /** Failed to compute diff */
  DIFF_FAILED = 'DIFF_FAILED',

  /** Failed to get repository status */
  STATUS_FAILED = 'STATUS_FAILED',

  /** Failed to read or write Git configuration */
  CONFIG_FAILED = 'CONFIG_FAILED',

  /** An unknown error occurred */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',

  /** Failed to configure remote repository */
  REMOTE_CONFIG_FAILED = 'REMOTE_CONFIG_FAILED',

  /** Remote repository is not configured */
  REMOTE_NOT_CONFIGURED = 'REMOTE_NOT_CONFIGURED',

  /** Push operation failed */
  PUSH_FAILED = 'PUSH_FAILED',

  /** Pull operation failed */
  PULL_FAILED = 'PULL_FAILED',

  /** Sync operation failed */
  SYNC_FAILED = 'SYNC_FAILED',

  /** Authentication failed - 401/403 */
  AUTH_FAILED = 'AUTH_FAILED',

  /** Network error during remote operation */
  NETWORK_ERROR = 'NETWORK_ERROR',
}

/**
 * Git abstraction error class
 * 
 * Custom error class for Git abstraction layer operations
 * with structured error information. Follows the same pattern
 * as FileManagerError and WorkspaceError.
 */
export class GitAbstractionError extends Error {
  /**
   * Create a new GitAbstractionError
   * 
   * @param code - Error code from GitAbstractionErrorCode
   * @param message - Human-readable error message
   * @param details - Additional error details (file path, original error, etc.)
   */
  constructor(
    public readonly code: GitAbstractionErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'GitAbstractionError'

    // Maintain proper stack trace for where error was thrown (V8 only)
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, GitAbstractionError)
    }
  }
}

/**
 * Default .gitignore entries for Sibylla workspaces
 * 
 * These patterns are automatically added when initializing a new Git repository.
 */
export const DEFAULT_GITIGNORE_ENTRIES: readonly string[] = [
  '# Sibylla system files',
  '.sibylla/index/',
  '.sibylla/cache/',
  '',
  '# Node.js',
  'node_modules/',
  '',
  '# OS files',
  '.DS_Store',
  'Thumbs.db',
  '',
  '# IDE files',
  '.vscode/',
  '.idea/',
  '*.swp',
  '*.swo',
  '',
  '# Temporary files',
  '*.tmp',
  '*.temp',
  '~*',
] as const

// ─── Remote Sync Result Types ─────────────────────────────────

/** Push operation result */
export interface PushResult {
  readonly success: boolean
  readonly error?: string
}

/** Pull operation result */
export interface PullResult {
  readonly success: boolean
  readonly hasConflicts?: boolean
  readonly conflicts?: readonly string[]
  readonly error?: string
}

/** Sync operation result (combined pull + push result) */
export interface SyncResult {
  readonly success: boolean
  readonly hasConflicts?: boolean
  readonly conflicts?: readonly string[]
  readonly error?: string
}

/** Remote repository configuration */
export interface GitRemoteConfig {
  readonly url: string
  readonly token: string
}

// ─── Sync Progress Events ─────────────────────────────────────

/** Sync progress data emitted during remote operations */
export interface SyncProgressData {
  readonly phase: 'fetch' | 'push'
  readonly loaded: number
  readonly total: number
}

/** GitAbstraction event type mapping for type-safe event listening */
export interface GitSyncEvents {
  'sync:progress': [progress: SyncProgressData]
  'sync:error': [error: Error]
}
