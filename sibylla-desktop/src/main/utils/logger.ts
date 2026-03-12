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
        contextStr = ` ${JSON.stringify(context)}`
      }
    }
    
    return `[${timestamp}] [${level}] ${message}${contextStr}`
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
