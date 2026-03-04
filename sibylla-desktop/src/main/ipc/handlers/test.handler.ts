import { ipcMain } from 'electron'
import { IPC_CHANNELS, IPCResponse, EchoRequest, ErrorType } from '../../../shared/types'

/**
 * Register test-related IPC handlers
 */
export function registerTestHandlers(): void {
  // Test ping handler
  ipcMain.handle(IPC_CHANNELS.TEST_PING, async () => {
    console.log('[IPC] Received ping request')
    const response: IPCResponse<string> = {
      success: true,
      data: 'pong',
      timestamp: Date.now(),
    }
    return response
  })
  
  // Test echo handler with delay
  ipcMain.handle(IPC_CHANNELS.TEST_ECHO, async (event, request: EchoRequest) => {
    console.log('[IPC] Received echo request:', request)
    
    try {
      // Simulate delay if specified
      if (request.delay && request.delay > 0) {
        await new Promise(resolve => setTimeout(resolve, request.delay))
      }
      
      const response: IPCResponse<string> = {
        success: true,
        data: `Echo: ${request.message}`,
        timestamp: Date.now(),
      }
      return response
    } catch (error) {
      const response: IPCResponse<string> = {
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
  
  console.log('[IPC] Test handlers registered')
}
