import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type {
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
} from '../shared/types'
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
  }
  
  // Sync operations
  sync: {
    force: () => Promise<IPCResponse<SyncResult>>
    onStatusChange: (callback: (data: SyncStatusData) => void) => () => void
  }

  // AI operations
  ai: {
    chat: (request: AIChatRequest | string) => Promise<IPCResponse<AIChatResponse>>
    stream: (request: AIChatRequest | string) => Promise<IPCResponse<AIChatResponse>>
    embed: (request: AIEmbedRequest | string) => Promise<IPCResponse<AIEmbedResponse>>
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
  // Sync operations
  IPC_CHANNELS.SYNC_FORCE,
  IPC_CHANNELS.SYNC_STATUS_CHANGED,
  // Auth operations
  IPC_CHANNELS.AUTH_LOGIN,
  IPC_CHANNELS.AUTH_REGISTER,
  IPC_CHANNELS.AUTH_LOGOUT,
  IPC_CHANNELS.AUTH_GET_CURRENT_USER,
  IPC_CHANNELS.AUTH_REFRESH_TOKEN,
  // AI operations
  IPC_CHANNELS.AI_CHAT,
  IPC_CHANNELS.AI_STREAM,
  IPC_CHANNELS.AI_EMBED,
  // Window control
  IPC_CHANNELS.WINDOW_MINIMIZE,
  IPC_CHANNELS.WINDOW_MAXIMIZE,
  IPC_CHANNELS.WINDOW_CLOSE,
  IPC_CHANNELS.WINDOW_TOGGLE_FULLSCREEN,
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
  },
  
  // Sync operations
  sync: {
    force: async () => {
      return await safeInvoke<SyncResult>(IPC_CHANNELS.SYNC_FORCE)
    },
    
    onStatusChange: (callback: (data: SyncStatusData) => void) => {
      return api.on(IPC_CHANNELS.SYNC_STATUS_CHANGED, callback as (...args: unknown[]) => void)
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

    stream: async (request: AIChatRequest | string) => {
      return await safeInvoke<AIChatResponse>(IPC_CHANNELS.AI_STREAM, request)
    },

    embed: async (request: AIEmbedRequest | string) => {
      return await safeInvoke<AIEmbedResponse>(IPC_CHANNELS.AI_EMBED, request)
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
