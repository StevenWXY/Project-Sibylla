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
  
  // File operations (reserved for future implementation)
  FILE_READ: 'file:read',
  FILE_WRITE: 'file:write',
  FILE_DELETE: 'file:delete',
  FILE_LIST: 'file:list',
  FILE_WATCH: 'file:watch',
  
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
 */
export type IPCChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS]

/**
 * Generic IPC response wrapper
 */
export interface IPCResponse<T = unknown> {
  success: boolean
  data?: T
  error?: AppError
  timestamp?: number
}

/**
 * System information
 */
export interface SystemInfo {
  platform: NodeJS.Platform
  arch: string
  version: string
  electronVersion: string
  chromeVersion: string
  nodeVersion: string
}

/**
 * Test echo request
 */
export interface EchoRequest {
  message: string
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
 */
export interface AppError {
  type: ErrorType
  message: string
  details?: unknown
}

