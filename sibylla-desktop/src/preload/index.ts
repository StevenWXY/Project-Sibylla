import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type { 
  IPCResponse, 
  SystemInfo, 
  EchoRequest,
  IPCChannel 
} from '../shared/types'
import { IPC_CHANNELS } from '../shared/types'

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
]

/**
 * Validate if a channel is allowed
 */
function isChannelAllowed(channel: string): boolean {
  return ALLOWED_CHANNELS.includes(channel as IPCChannel)
}

// Implement the API
const api: ElectronAPI = {
  // Test ping
  ping: async () => {
    try {
      return await ipcRenderer.invoke(IPC_CHANNELS.TEST_PING)
    } catch (error) {
      console.error('[Preload] Ping failed:', error)
      throw error
    }
  },
  
  // Test echo
  echo: async (message: string, delay?: number) => {
    try {
      const request: EchoRequest = { message, delay }
      return await ipcRenderer.invoke(IPC_CHANNELS.TEST_ECHO, request)
    } catch (error) {
      console.error('[Preload] Echo failed:', error)
      throw error
    }
  },
  
  // Get system information
  getSystemInfo: async () => {
    try {
      return await ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_INFO)
    } catch (error) {
      console.error('[Preload] Get system info failed:', error)
      throw error
    }
  },
  
  // Get platform
  getPlatform: async () => {
    try {
      return await ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_PLATFORM)
    } catch (error) {
      console.error('[Preload] Get platform failed:', error)
      throw error
    }
  },
  
  // Get app version
  getVersion: async () => {
    try {
      return await ipcRenderer.invoke(IPC_CHANNELS.SYSTEM_VERSION)
    } catch (error) {
      console.error('[Preload] Get version failed:', error)
      throw error
    }
  },
  
  // Event listener registration
  on: (channel: IPCChannel, callback: (...args: unknown[]) => void) => {
    if (!isChannelAllowed(channel)) {
      throw new Error(`Channel ${channel} is not allowed`)
    }
    
    const subscription = (_event: IpcRendererEvent, ...args: unknown[]) => {
      callback(...args)
    }
    
    ipcRenderer.on(channel, subscription)
    
    // Return unsubscribe function
    return () => {
      ipcRenderer.off(channel, subscription)
    }
  },
  
  // Event listener removal
  off: (channel: IPCChannel, callback: (...args: unknown[]) => void) => {
    if (!isChannelAllowed(channel)) {
      throw new Error(`Channel ${channel} is not allowed`)
    }
    ipcRenderer.off(channel, callback as never)
  },
}

// Expose API to renderer
contextBridge.exposeInMainWorld('electronAPI', api)

console.log('[Preload] Enhanced API exposed to renderer process')

export type { ElectronAPI }
