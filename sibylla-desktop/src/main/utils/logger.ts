/**
 * Logger Utility
 *
 * Provides structured logging for the main process.
 * Supports different log levels and contextual information.
 */

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

class Logger {
  private minLevel: LogLevel = LogLevel.INFO

  /**
   * Set minimum log level
   */
  setLevel(level: LogLevel): void {
    this.minLevel = level
  }

  /**
   * Check if a log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR]
    return levels.indexOf(level) >= levels.indexOf(this.minLevel)
  }

  /**
   * Format log message with timestamp and level
   */
  private format(level: LogLevel, message: string, context?: unknown): string {
    const timestamp = new Date().toISOString()
    let contextStr = ''
    
    if (context) {
      if (context instanceof Error) {
        contextStr = ` ${context.message} ${context.stack || ''}`
      } else if (typeof context === 'string') {
        contextStr = ` ${context}`
      } else {
        contextStr = ` ${JSON.stringify(context, this.errorReplacer)}`
      }
    }
    
    return `[${timestamp}] [${level}] ${message}${contextStr}`
  }

  /**
   * JSON replacer that serializes Error objects with their message and stack.
   *
   * Without this, `JSON.stringify(new Error('x'))` produces `{}` because
   * Error properties (message, stack, name) are non-enumerable.
   */
  private errorReplacer(_key: string, value: unknown): unknown {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      }
    }
    return value
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: unknown): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.format(LogLevel.DEBUG, message, context))
    }
  }

  /**
   * Log info message
   */
  info(message: string, context?: unknown): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.format(LogLevel.INFO, message, context))
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: unknown): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.format(LogLevel.WARN, message, context))
    }
  }

  /**
   * Log error message
   */
  error(message: string, context?: unknown): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.format(LogLevel.ERROR, message, context))
    }
  }
}

// Export singleton instance
export const logger = new Logger()

// Set debug level in development
if (process.env.NODE_ENV === 'development') {
  logger.setLevel(LogLevel.DEBUG)
}

// Silence logger in test environment to prevent stderr noise.
// The vi.mock in tests/setup.ts is the primary mechanism; this is a safety net
// in case the mock fails to apply (e.g., due to module resolution edge cases).
if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
  logger.setLevel(LogLevel.ERROR)
  // Replace console methods with no-ops so even ERROR-level logs stay silent
  const noop = () => {}
  logger.debug = noop
  logger.info = noop
  logger.warn = noop
  logger.error = noop
}
