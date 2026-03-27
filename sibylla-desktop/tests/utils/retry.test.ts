/**
 * Retry Utility — Unit Tests
 *
 * Tests for the retryWithBackoff utility function.
 * Uses short delays to keep tests fast.
 */

import { describe, it, expect } from 'vitest'
import { retryWithBackoff } from '../../src/main/utils/retry'

describe('retryWithBackoff', () => {
  it('should succeed immediately if operation succeeds on first attempt', async () => {
    let callCount = 0
    const result = await retryWithBackoff(async () => {
      callCount++
      return 'success'
    }, { maxRetries: 3, baseDelayMs: 10 })

    expect(result).toBe('success')
    expect(callCount).toBe(1)
  })

  it('should succeed on second attempt after first failure', async () => {
    let callCount = 0
    const result = await retryWithBackoff(async () => {
      callCount++
      if (callCount === 1) {
        throw new Error('Transient failure')
      }
      return 'recovered'
    }, { maxRetries: 3, baseDelayMs: 10 })

    expect(result).toBe('recovered')
    expect(callCount).toBe(2)
  })

  it('should throw the last error after all retries exhausted', async () => {
    let callCount = 0
    await expect(retryWithBackoff(async () => {
      callCount++
      throw new Error('Persistent failure')
    }, { maxRetries: 3, baseDelayMs: 10 })).rejects.toThrow('Persistent failure')

    expect(callCount).toBe(3)
  })

  it('should abort immediately when shouldAbort returns true', async () => {
    let callCount = 0
    await expect(retryWithBackoff(async () => {
      callCount++
      throw new Error('Fatal error')
    }, {
      maxRetries: 3,
      baseDelayMs: 10,
      shouldAbort: () => true,
    })).rejects.toThrow('Fatal error')

    expect(callCount).toBe(1) // No retry
  })

  it('should call onExhausted when all retries fail', async () => {
    let exhaustedCalled = false
    await expect(retryWithBackoff(async () => {
      throw new Error('Repeated failure')
    }, {
      maxRetries: 2,
      baseDelayMs: 10,
      onExhausted: (_error, attempts) => {
        exhaustedCalled = true
        throw new Error(`Custom error after ${attempts} attempts`)
      },
    })).rejects.toThrow('Custom error after 2 attempts')

    expect(exhaustedCalled).toBe(true)
  })

  it('should use default options when none provided', async () => {
    let callCount = 0
    const result = await retryWithBackoff(async () => {
      callCount++
      return 42
    })

    expect(result).toBe(42)
    expect(callCount).toBe(1)
  })

  it('should not call shouldAbort when operation succeeds', async () => {
    let abortCalled = false
    const result = await retryWithBackoff(async () => 'ok', {
      maxRetries: 3,
      baseDelayMs: 10,
      shouldAbort: () => {
        abortCalled = true
        return true
      },
    })

    expect(result).toBe('ok')
    expect(abortCalled).toBe(false)
  })
})
