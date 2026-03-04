import { ipcMain, app } from 'electron'
import { IPC_CHANNELS, IPCResponse, SystemInfo, ErrorType } from '../../../shared/types'

/**
 * Register system-related IPC handlers
 */
export function registerSystemHandlers(): void {
  // Get system information
  ipcMain.handle(IPC_CHANNELS.SYSTEM_INFO, async () => {
    console.log('[IPC] Received system info request')
    
    try {
      const systemInfo: SystemInfo = {
        platform: process.platform,
        arch: process.arch,
        version: app.getVersion(),
        electronVersion: process.versions.electron,
        chromeVersion: process.versions.chrome,
        nodeVersion: process.versions.node,
      }
      
      const response: IPCResponse<SystemInfo> = {
        success: true,
        data: systemInfo,
        timestamp: Date.now(),
      }
      return response
    } catch (error) {
      const response: IPCResponse<SystemInfo> = {
        success: false,
        error: {
          type: ErrorType.IPC_ERROR,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: Date.now(),
      }
      return response
    }
  })
  
  // Get platform
  ipcMain.handle(IPC_CHANNELS.SYSTEM_PLATFORM, async () => {
    const response: IPCResponse<NodeJS.Platform> = {
      success: true,
      data: process.platform,
      timestamp: Date.now(),
    }
    return response
  })
  
  // Get app version
  ipcMain.handle(IPC_CHANNELS.SYSTEM_VERSION, async () => {
    const response: IPCResponse<string> = {
      success: true,
      data: app.getVersion(),
      timestamp: Date.now(),
    }
    return response
  })
  
  console.log('[IPC] System handlers registered')
}
