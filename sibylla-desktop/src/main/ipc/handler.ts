import { IpcMainInvokeEvent } from 'electron'
import { IPCResponse, ErrorType, AppError } from '../../shared/types'
import { logger } from '../utils/logger'

/**
 * Abstract base class for IPC handlers
 * 
 * This class provides a standardized way to implement IPC handlers with
 * built-in error handling, response wrapping, and logging capabilities.
 * 
 * All IPC handlers should extend this class and implement the required
 * abstract methods.
 * 
 * @example
 * ```typescript
 * export class FileHandler extends IpcHandler {
 *   readonly namespace = 'file'
 *   
 *   register(): void {
 *     ipcMain.handle('file:read', this.safeHandle(this.readFile.bind(this)))
 *   }
 *   
 *   private async readFile(event: IpcMainInvokeEvent, path: string): Promise<string> {
 *     return await fs.readFile(path, 'utf-8')
 *   }
 * }
 * ```
 */
export abstract class IpcHandler {
  /**
   * Namespace identifier for this handler
   * 
   * Used for logging and handler management. Should be unique across all handlers.
   * 
   * @example 'file', 'git', 'system', 'test'
   */
  abstract readonly namespace: string

  /**
   * Register all IPC handlers for this namespace
   * 
   * This method should call ipcMain.handle() for each channel this handler manages.
   * Use safeHandle() to wrap handler functions for automatic error handling.
   */
  abstract register(): void

  /**
   * Wrap successful response data in IPCResponse format
   * 
   * @template T - Type of the response data
   * @param data - The data to wrap
   * @param requestId - Optional request ID for tracking
   * @returns Wrapped success response
   * 
   * @example
   * ```typescript
   * const result = await someOperation()
   * return this.wrapResponse(result)
   * ```
   */
  protected wrapResponse<T>(data: T, requestId?: string): IPCResponse<T> {
    return {
      success: true,
      data,
      timestamp: Date.now(),
      requestId,
    }
  }

  /**
   * Wrap error in IPCResponse format
   * 
   * @param error - Error object or error message
   * @param type - Error type classification
   * @param requestId - Optional request ID for tracking
   * @returns Wrapped error response
   * 
   * @example
   * ```typescript
   * catch (error) {
   *   return this.wrapError(error, ErrorType.FILE_NOT_FOUND)
   * }
   * ```
   */
  protected wrapError<T = never>(
    error: Error | string,
    type: ErrorType = ErrorType.IPC_ERROR,
    requestId?: string
  ): IPCResponse<T> {
    const errorObj = typeof error === 'string' ? new Error(error) : error
    
    const appError: AppError = {
      type,
      message: errorObj.message,
      details: process.env.NODE_ENV === 'development' ? errorObj.stack : undefined,
    }

    // Always log full error details for debugging
    // In production, this can be sent to error tracking service (e.g., Sentry)
    logger.error(`[IPC Handler:${this.namespace}] Error:`, {
      type,
      message: errorObj.message,
      stack: errorObj.stack,
      requestId,
      timestamp: Date.now(),
    })

    return {
      success: false,
      error: appError,
      timestamp: Date.now(),
      requestId,
    }
  }

  /**
   * Wrap an async handler function with automatic error handling
   *
   * This method catches any errors thrown by the handler and automatically
   * wraps them in an IPCResponse error format. It also logs the operation
   * for debugging purposes.
   *
   * @template T - Type of the handler's return value
   * @template Args - Tuple type for handler arguments (improves type safety)
   * @param handler - The async handler function to wrap
   * @returns Wrapped handler that always returns IPCResponse
   *
   * @example
   * ```typescript
   * ipcMain.handle('file:read', this.safeHandle(async (event, path: string) => {
   *   return await fs.readFile(path, 'utf-8')
   * }))
   * ```
   */
  /**
   * Infer error type from error object
   *
   * Uses Node.js error codes (priority 1) or message matching (priority 2)
   * to determine the appropriate ErrorType classification.
   *
   * @param error - Error object to analyze
   * @returns Inferred ErrorType
   */
  private inferErrorType(error: Error): ErrorType {
    const nodeError = error as NodeJS.ErrnoException
    
    // Priority 1: Check Node.js error code
    if (nodeError.code) {
      const errorCodeMap: Record<string, ErrorType> = {
        'ENOENT': ErrorType.FILE_NOT_FOUND,
        'EACCES': ErrorType.PERMISSION_DENIED,
        'EPERM': ErrorType.PERMISSION_DENIED,
        'ECONNREFUSED': ErrorType.NETWORK_ERROR,
        'ETIMEDOUT': ErrorType.NETWORK_ERROR,
        'ENETUNREACH': ErrorType.NETWORK_ERROR,
        'ENOTFOUND': ErrorType.NETWORK_ERROR,
      }
      
      const mappedType = errorCodeMap[nodeError.code]
      if (mappedType) {
        return mappedType
      }
    }
    
    // Priority 2: Fallback to message matching (case-insensitive)
    const msg = error.message.toLowerCase()
    const messagePatterns: Array<[RegExp, ErrorType]> = [
      [/not found|enoent/, ErrorType.FILE_NOT_FOUND],
      [/permission|eacces|eperm/, ErrorType.PERMISSION_DENIED],
      [/network|econnrefused|timeout/, ErrorType.NETWORK_ERROR],
    ]
    
    for (const [pattern, errorType] of messagePatterns) {
      if (pattern.test(msg)) {
        return errorType
      }
    }
    
    return ErrorType.IPC_ERROR
  }

  protected safeHandle<T, Args extends unknown[] = unknown[]>(
    handler: (event: IpcMainInvokeEvent, ...args: Args) => Promise<T>
  ): (event: IpcMainInvokeEvent, ...args: Args) => Promise<IPCResponse<T>> {
    return async (event: IpcMainInvokeEvent, ...args: Args): Promise<IPCResponse<T>> => {
      const requestId = `${this.namespace}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
      
      try {
        logger.debug(`[IPC Handler:${this.namespace}] Processing request ${requestId}`)
        
        const result = await handler(event, ...args)
        
        logger.debug(`[IPC Handler:${this.namespace}] Request ${requestId} completed successfully`)
        
        return this.wrapResponse(result, requestId)
      } catch (error) {
        // Error logs should always be output
        logger.error(`[IPC Handler:${this.namespace}] Request ${requestId} failed:`, error)
        
        const errorType = error instanceof Error
          ? this.inferErrorType(error)
          : ErrorType.IPC_ERROR
        
        return this.wrapError(error as Error, errorType, requestId)
      }
    }
  }

  /**
   * Cleanup resources when handler is unregistered
   * 
   * Override this method if your handler needs to perform cleanup
   * (e.g., close file watchers, database connections, etc.)
   */
  cleanup(): void {
    logger.debug(`[IPC Handler:${this.namespace}] Cleanup completed`)
  }
}
