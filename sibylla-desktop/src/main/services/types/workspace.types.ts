/**
 * Workspace Type Definitions
 * 
 * This file defines internal TypeScript types for Workspace management
 * that are only used in the main process.
 * 
 * Shared types (WorkspaceConfig, WorkspaceInfo, etc.) are defined in
 * src/shared/types.ts for use across main and renderer processes.
 * 
 * Design principles:
 * - All user content stored as plain text files (Markdown/CSV)
 * - Configuration stored in JSON format
 * - Workspace structure follows the standard defined in specs/design/data-and-api.md
 */

// Re-export shared types for convenience
export type {
  WorkspaceConfig,
  WorkspaceMetadata,
  WorkspaceInfo,
  CreateWorkspaceOptions,
} from '../../../shared/types'

/**
 * Member information stored in .sibylla/members.json
 */
export interface WorkspaceMember {
  /** User ID */
  id: string
  
  /** User display name */
  name: string
  
  /** User email */
  email: string
  
  /** User role: 'admin' | 'editor' | 'viewer' */
  role: 'admin' | 'editor' | 'viewer'
  
  /** User avatar URL */
  avatar?: string
  
  /** Join timestamp (ISO 8601) */
  joinedAt: string
}

/**
 * Pending invitation stored in .sibylla/members.json
 */
export interface WorkspaceInvite {
  /** Invitee email */
  email: string
  
  /** Assigned role */
  role: 'admin' | 'editor' | 'viewer'
  
  /** Inviter user ID */
  invitedBy: string
  
  /** Invitation expiration timestamp (ISO 8601) */
  expiresAt: string
}

/**
 * Members configuration file structure
 */
export interface MembersConfig {
  /** List of workspace members */
  members: WorkspaceMember[]
  
  /** List of pending invitations */
  invites: WorkspaceInvite[]
}

/**
 * Points configuration stored in .sibylla/points.json
 */
export interface PointsConfig {
  /** Points source weights */
  weights: {
    taskCompletion: number
    documentContribution: number
    collaborationContribution: number
    qualityBonus: number
  }
  
  /** Settlement cycle in days */
  settlementCycle: number
  
  /** Distribution model: 'linear' | 'quadratic' */
  distributionModel: 'linear' | 'quadratic'
  
  /** Last settlement timestamp (ISO 8601) */
  lastSettlementAt: string | null
}

/**
 * Workspace validation result
 */
export interface WorkspaceValidationResult {
  /** Whether workspace is valid */
  isValid: boolean
  
  /** Validation errors (if any) */
  errors: string[]
  
  /** Validation warnings (if any) */
  warnings: string[]
}

/**
 * Workspace error codes
 */
export enum WorkspaceErrorCode {
  // Path errors
  PATH_INVALID = 'PATH_INVALID',
  PATH_NOT_FOUND = 'PATH_NOT_FOUND',
  PATH_NOT_DIRECTORY = 'PATH_NOT_DIRECTORY',
  PATH_NOT_EMPTY = 'PATH_NOT_EMPTY',
  PATH_NO_PERMISSION = 'PATH_NO_PERMISSION',
  
  // Workspace errors
  WORKSPACE_NOT_FOUND = 'WORKSPACE_NOT_FOUND',
  WORKSPACE_INVALID = 'WORKSPACE_INVALID',
  WORKSPACE_ALREADY_EXISTS = 'WORKSPACE_ALREADY_EXISTS',
  WORKSPACE_NOT_OPEN = 'WORKSPACE_NOT_OPEN',
  WORKSPACE_ALREADY_OPEN = 'WORKSPACE_ALREADY_OPEN',
  
  // Configuration errors
  CONFIG_INVALID = 'CONFIG_INVALID',
  CONFIG_PARSE_ERROR = 'CONFIG_PARSE_ERROR',
  CONFIG_WRITE_ERROR = 'CONFIG_WRITE_ERROR',
  
  // Git errors
  GIT_INIT_FAILED = 'GIT_INIT_FAILED',
  GIT_REMOTE_FAILED = 'GIT_REMOTE_FAILED',
  
  // Cloud sync errors
  CLOUD_AUTH_REQUIRED = 'CLOUD_AUTH_REQUIRED',
  CLOUD_CREATE_FAILED = 'CLOUD_CREATE_FAILED',
  CLOUD_SYNC_FAILED = 'CLOUD_SYNC_FAILED',
  
  // Generic errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Workspace error class
 */
export class WorkspaceError extends Error {
  constructor(
    public code: WorkspaceErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'WorkspaceError'
    
    // Maintain proper stack trace for where error was thrown (V8 only)
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, WorkspaceError)
    }
  }
}

/**
 * Standard workspace directory structure
 */
export const WORKSPACE_STRUCTURE = {
  // System directories (hidden from user)
  SYSTEM_DIR: '.sibylla',
  SYSTEM_CONFIG: '.sibylla/config.json',
  SYSTEM_MEMBERS: '.sibylla/members.json',
  SYSTEM_POINTS: '.sibylla/points.json',
  SYSTEM_INDEX_DIR: '.sibylla/index',
  SYSTEM_CACHE_DIR: '.sibylla/cache',
  SYSTEM_COMMENTS_DIR: '.sibylla/comments',
  SYSTEM_MEMORY_DIR: '.sibylla/memory',
  SYSTEM_MEMORY_DAILY_DIR: '.sibylla/memory/daily',
  SYSTEM_MEMORY_ARCHIVES_DIR: '.sibylla/memory/archives',
  
  // Root documents
  ROOT_CLAUDE: 'CLAUDE.md',
  ROOT_MEMORY: 'MEMORY.md',
  ROOT_REQUIREMENTS: 'requirements.md',
  ROOT_DESIGN: 'design.md',
  ROOT_TASKS: 'tasks.md',
  ROOT_CHANGELOG: 'changelog.md',
  ROOT_TOKENOMICS: 'tokenomics.md',
  
  // Main directories
  SKILLS_DIR: 'skills',
  SKILLS_INDEX: 'skills/_index.md',
  DOCS_DIR: 'docs',
  PERSONAL_DIR: 'personal',
  DATA_DIR: 'data',
  ASSETS_DIR: 'assets',
} as const

/**
 * Default workspace configuration values
 */
export const DEFAULT_WORKSPACE_CONFIG = {
  DEFAULT_MODEL: 'claude-sonnet-4-20250514',
  DEFAULT_SYNC_INTERVAL: 30,
  DEFAULT_GIT_PROVIDER: 'sibylla' as const,
  DEFAULT_ICON: '🧠',
} as const

/**
 * Default points configuration
 */
export const DEFAULT_POINTS_CONFIG: PointsConfig = {
  weights: {
    taskCompletion: 0.4,
    documentContribution: 0.3,
    collaborationContribution: 0.2,
    qualityBonus: 0.1,
  },
  settlementCycle: 7, // Weekly
  distributionModel: 'quadratic',
  lastSettlementAt: null,
}
