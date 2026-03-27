/**
 * Retry utility with exponential backoff
 *
 * Provides a reusable retry mechanism for async operations with
 * exponential backoff delay. Designed for network operations
 * where transient failures are expected.
 *
 * @module utils/retry
 */

import { logger } from './logger'

const LOG_PREFIX = '[Retry]'

/**
 * Options for retry behavior
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  readonly maxRetries?: number

  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  readonly baseDelayMs?: number

  /**
   * Predicate to determine if an error should NOT be retried.
   * Return true to abort retries immediately.
   * Default: never abort (always retry).
   */
  readonly shouldAbort?: (error: unknown) => boolean

  /**
   * Transform the final error after all retries are exhausted.
   * Default: rethrows the last error.
   */
  readonly onExhausted?: (error: unknown, attempts: number) => never
}

/**
 * Retry an async operation with exponential backoff
 *
 * Retries the operation up to `maxRetries` times with increasing delays.
 * If `shouldAbort` returns true for an error, retries stop immediately.
 *
 * Delay schedule: baseDelayMs * 2^i (e.g., 1s → 2s → 4s for base=1000)
 *
 * @param operation - The async operation to retry
 * @param options - Retry configuration
 * @returns The result of the successful operation
 * @throws The last error if all retries are exhausted, or the abort error
 *
 * @example
 * ```typescript
 * const result = await retryWithBackoff(
 *   () => fetchRemoteData(),
 *   {
 *     maxRetries: 3,
 *     shouldAbort: (err) => isAuthError(err),
 *   }
 * )
 * ```
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3
  const baseDelayMs = options.baseDelayMs ?? 1000
  const shouldAbort = options.shouldAbort ?? (() => false)
  const onExhausted = options.onExhausted

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation()
    } catch (error: unknown) {
      // Check if this error should abort retries immediately
      if (shouldAbort(error)) {
        throw error
      }

      // Last attempt also failed — give up
      if (i === maxRetries - 1) {
        if (onExhausted) {
          onExhausted(error, maxRetries)
        }
        throw error
      }

      const delay = Math.pow(2, i) * baseDelayMs
      logger.debug(`${LOG_PREFIX} Operation failed, retrying in ${delay}ms...`, {
        attempt: i + 1,
        maxRetries,
        error: error instanceof Error ? error.message : String(error),
      })
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  // TypeScript requires this — unreachable in practice
  throw new Error('Max retries exceeded')
}
