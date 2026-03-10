import { ipcMain } from 'electron'
import { IpcHandler } from './handler'

/**
 * IPC Manager
 * 
 * Central manager for all IPC handlers in the application.
 * Provides lifecycle management, registration, and cleanup for handlers.
 * 
 * @example
 * ```typescript
 * import { ipcManager } from './ipc'
 * import { TestHandler } from './ipc/handlers/test.handler'
 * 
 * // Initialize and register handlers
 * ipcManager.initialize()
 * ipcManager.registerHandler(new TestHandler())
 * 
 * // Later, cleanup when app quits
 * ipcManager.cleanup()
 * ```
 */
export class IpcManager {
  private handlers: Map<string, IpcHandler> = new Map()
  private initialized = false

  /**
   * Initialize the IPC manager
   * 
   * This should be called once during application startup,
   * before registering any handlers.
   */
  initialize(): void {
    if (this.initialized) {
      console.warn('[IPC Manager] Already initialized')
      return
    }

    console.log('[IPC Manager] Initializing...')
    this.initialized = true
    console.log('[IPC Manager] Initialized successfully')
  }

  /**
   * Register an IPC handler
   * 
   * @param handler - The handler instance to register
   * @throws Error if handler with same namespace already exists
   * 
   * @example
   * ```typescript
   * ipcManager.registerHandler(new TestHandler())
   * ipcManager.registerHandler(new FileHandler())
   * ```
   */
  registerHandler(handler: IpcHandler): void {
    if (!this.initialized) {
      throw new Error('[IPC Manager] Must call initialize() before registering handlers')
    }

    const namespace = handler.namespace

    if (this.handlers.has(namespace)) {
      throw new Error(`[IPC Manager] Handler with namespace '${namespace}' already registered`)
    }

    console.log(`[IPC Manager] Registering handler: ${namespace}`)
    
    try {
      handler.register()
      this.handlers.set(namespace, handler)
      console.log(`[IPC Manager] Handler '${namespace}' registered successfully`)
    } catch (error) {
      console.error(`[IPC Manager] Failed to register handler '${namespace}':`, error)
      throw error
    }
  }

  /**
   * Get a registered handler by namespace
   * 
   * @param namespace - The namespace of the handler to retrieve
   * @returns The handler instance, or undefined if not found
   * 
   * @example
   * ```typescript
   * const testHandler = ipcManager.getHandler('test')
   * ```
   */
  getHandler(namespace: string): IpcHandler | undefined {
    return this.handlers.get(namespace)
  }

  /**
   * Get all registered handler namespaces
   * 
   * @returns Array of registered handler namespaces
   */
  getRegisteredNamespaces(): string[] {
    return Array.from(this.handlers.keys())
  }

  /**
   * Cleanup all handlers and remove IPC listeners
   * 
   * This should be called when the application is shutting down
   * to properly cleanup resources.
   */
  cleanup(): void {
    console.log('[IPC Manager] Cleaning up...')

    // Cleanup each handler
    for (const [namespace, handler] of this.handlers.entries()) {
      try {
        console.log(`[IPC Manager] Cleaning up handler: ${namespace}`)
        handler.cleanup()
      } catch (error) {
        console.error(`[IPC Manager] Error cleaning up handler '${namespace}':`, error)
      }
    }

    // Remove all IPC listeners
    ipcMain.removeAllListeners()

    // Clear handlers map
    this.handlers.clear()
    this.initialized = false

    console.log('[IPC Manager] Cleanup completed')
  }
}

/**
 * Global IPC manager instance
 * 
 * Use this singleton instance throughout the application
 * to manage IPC handlers.
 */
export const ipcManager = new IpcManager()
