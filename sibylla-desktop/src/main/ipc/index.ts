import { ipcMain } from 'electron'
import { registerTestHandlers } from './handlers/test.handler'
import { registerSystemHandlers } from './handlers/system.handler'
import { registerWindowHandlers } from './handlers/window.handler'

/**
 * Register all IPC handlers
 * This function should be called before creating any windows
 */
export function registerAllIPCHandlers(): void {
  console.log('[IPC] Registering all IPC handlers...')
  
  try {
    // Register test handlers
    registerTestHandlers()
    
    // Register system handlers
    registerSystemHandlers()
    
    // Register window handlers (placeholder)
    registerWindowHandlers()
    
    console.log('[IPC] All handlers registered successfully')
  } catch (error) {
    console.error('[IPC] Failed to register handlers:', error)
    throw error
  }
}

/**
 * Cleanup all IPC handlers
 * This function should be called when app is quitting
 */
export function cleanupIPCHandlers(): void {
  console.log('[IPC] Cleaning up IPC handlers...')
  ipcMain.removeAllListeners()
}
