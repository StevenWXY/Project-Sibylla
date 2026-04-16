/**
 * AutoSaveManager Type Definitions
 *
 * Type definitions for the AutoSaveManager service which handles
 * automatic file saving with debouncing, batch aggregation, and
 * implicit Git commits.
 *
 * All types follow TypeScript strict mode requirements:
 * - No `any` types
 * - All interface properties are `readonly`
 * - Explicit return types on all public methods
 */

/**
 * Auto-save configuration
 *
 * Controls debounce timing, batch aggregation window, and retry behavior.
 */
export interface AutoSaveConfig {
  /** Debounce delay in milliseconds before triggering save (default: 1000) */
  readonly debounceMs: number

  /** Batch window for aggregating multiple file changes into one commit (default: 5000) */
  readonly batchWindowMs: number

  /** Maximum retry attempts on write failure (default: 3) */
  readonly maxRetries: number
}

/**
 * Single file save result
 */
export interface SaveResult {
  /** File path that was saved */
  readonly filePath: string

  /** Whether the save succeeded */
  readonly success: boolean

  /** Error message if save failed */
  readonly error?: string
}

/**
 * Batch commit result emitted after a successful commit
 */
export interface BatchCommitResult {
  /** Git commit OID */
  readonly commitOid: string

  /** List of file paths included in this commit */
  readonly files: readonly string[]

  /** Human-readable commit message */
  readonly message: string
}

/**
 * AutoSaveManager event type mapping
 *
 * Defines the events emitted by AutoSaveManager for type-safe event listening.
 * Follows the same pattern as SyncManagerEvents.
 */
export interface AutoSaveManagerEvents {
  /** Emitted when files are successfully committed */
  committed: [result: BatchCommitResult]

  /** Emitted when one or more files fail to save */
  'save-failed': [failedResults: SaveResult[]]

  /** Emitted when an internal error occurs (write or commit) */
  error: [data: { type: 'commit' | 'write'; error: Error }]

  /** Emitted when a retry attempt is made */
  retry: [data: { filePath: string; attempt: number }]
}

/**
 * Type alias for AutoSaveManager event names
 */
export type AutoSaveManagerEventName = keyof AutoSaveManagerEvents

/**
 * Default auto-save configuration values
 */
export const DEFAULT_AUTO_SAVE_CONFIG: AutoSaveConfig = {
  debounceMs: 1000,
  batchWindowMs: 5000,
  maxRetries: 3,
} as const
