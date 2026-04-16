/**
 * SyncManager Type Definitions
 *
 * This file contains all type definitions for the SyncManager service.
 * SyncManager orchestrates automatic saving and synchronization by combining
 * FileManager's file change events, GitAbstraction's commit/sync capabilities,
 * and Electron's network state detection into an automated pipeline.
 *
 * All types follow TypeScript strict mode requirements:
 * - No `any` types
 * - All interface properties are `readonly`
 * - Explicit return types on all public methods
 */

import type { SyncResult } from './git-abstraction.types'

// Re-export SyncStatus and SyncStatusData from shared/types.ts (single source of truth)
export type { SyncStatus, SyncStatusData } from '../../../shared/types'
import type { SyncStatusData } from '../../../shared/types'

/**
 * Configuration for SyncManager constructor
 *
 * Provides all necessary configuration to initialize the SyncManager service.
 */
export interface SyncManagerConfig {
  /** Absolute path to the workspace directory */
  readonly workspaceDir: string

  /**
   * Debounce delay in milliseconds before auto-committing a changed file.
   * If the same file is changed again within this window, the timer resets.
   * @default 1000
   */
  readonly saveDebounceMs?: number

  /**
   * Interval in milliseconds between automatic sync (pull + push) cycles.
   * Set to 0 to disable automatic sync (manual only).
   * @default 30000
   */
  readonly syncIntervalMs?: number

  /**
   * Delay in milliseconds before triggering sync after network reconnects.
   * @default 5000
   */
  readonly reconnectSyncDelayMs?: number

  /**
   * Delay in milliseconds before the first sync after start().
   * Set to 0 to disable initial sync.
   * @default 5000
   */
  readonly initialSyncDelayMs?: number
}

/** Default delay before sync after network reconnects (ms) */
export const DEFAULT_RECONNECT_SYNC_DELAY_MS = 5000

/** Default delay before first sync after start() (ms) */
export const DEFAULT_INITIAL_SYNC_DELAY_MS = 5000

/**
 * SyncManager event type mapping
 *
 * Defines the events emitted by SyncManager for type-safe event listening.
 * Follows the same pattern as GitSyncEvents in git-abstraction.types.ts.
 */
export interface SyncManagerEvents {
  /** Emitted when a sync operation begins */
  'sync:start': []

  /** Emitted when a sync operation completes successfully */
  'sync:success': []

  /** Emitted when a sync operation detects file conflicts */
  'sync:conflict': [conflicts: readonly string[]]

  /** Emitted when a sync operation encounters an error */
  'sync:error': [error: Error]

  /** Emitted when a sync operation ends (regardless of outcome) */
  'sync:end': []

  /** Emitted when the sync status changes (used by SyncHandler for IPC broadcast) */
  'status:changed': [data: SyncStatusData]
}

/**
 * Type alias for SyncManager event names
 */
export type SyncManagerEventName = keyof SyncManagerEvents

/**
 * Re-export SyncResult for convenience
 */
export type { SyncResult }
