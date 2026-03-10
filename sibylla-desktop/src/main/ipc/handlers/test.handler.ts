import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { IPC_CHANNELS, EchoRequest } from '../../../shared/types'
import { IpcHandler } from '../handler'

/**
 * Test IPC Handler
 * 
 * Provides test endpoints for validating IPC communication.
 * Includes ping/pong and echo functionality with optional delays.
 * 
 * @example
 * ```typescript
 * // In main process
 * const testHandler = new TestHandler()
 * ipcManager.registerHandler(testHandler)
 * 
 * // In renderer process
 * const response = await window.electronAPI.ping()
 * console.log(response.data) // 'pong'
 * ```
 */
export class TestHandler extends IpcHandler {
  readonly namespace = 'test'

  /**
   * Register all test-related IPC handlers
   */
  register(): void {
    console.log('[Test Handler] Registering handlers...')

    ipcMain.handle(
      IPC_CHANNELS.TEST_PING,
      this.safeHandle(this.handlePing.bind(this))
    )

    ipcMain.handle(
      IPC_CHANNELS.TEST_ECHO,
      this.safeHandle(this.handleEcho.bind(this))
    )

    console.log('[Test Handler] Handlers registered successfully')
  }

  /**
   * Handle ping request
   * 
   * Simple ping/pong test to verify IPC communication is working.
   * 
   * @param _event - IPC event (unused)
   * @returns 'pong' string
   */
  private async handlePing(_event: IpcMainInvokeEvent): Promise<string> {
    console.log('[Test Handler] Ping received')
    return 'pong'
  }

  /**
   * Handle echo request
   * 
   * Echoes back the provided message, optionally with a delay.
   * Useful for testing async operations and timeouts.
   * 
   * @param _event - IPC event (unused)
   * @param request - Echo request with message and optional delay
   * @returns Echoed message with prefix
   */
  private async handleEcho(
    _event: IpcMainInvokeEvent,
    request: EchoRequest
  ): Promise<string> {
    const { message, delay = 0 } = request

    // Validate message
    if (!message || typeof message !== 'string') {
      throw new Error('Message must be a non-empty string')
    }
    if (message.length > 10000) {
      throw new Error('Message too long (max 10000 characters)')
    }

    // Validate delay
    if (delay < 0 || delay > 30000) {
      throw new Error('Delay must be between 0 and 30000ms')
    }

    console.log('[Test Handler] Echo received:', message)

    // Simulate delay if specified
    if (delay > 0) {
      console.log(`[Test Handler] Delaying response by ${delay}ms`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }

    return `Echo: ${message}`
  }

  /**
   * Cleanup test handler resources
   */
  override cleanup(): void {
    console.log('[Test Handler] Cleaning up...')
    ipcMain.removeHandler(IPC_CHANNELS.TEST_PING)
    ipcMain.removeHandler(IPC_CHANNELS.TEST_ECHO)
    super.cleanup()
  }
}
