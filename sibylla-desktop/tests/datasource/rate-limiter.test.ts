import { describe, it, expect, vi } from 'vitest'
import { RateLimiter } from '../../src/main/services/datasource/rate-limiter'
import { RateLimitError } from '../../src/main/services/datasource/types'

describe('RateLimiter', () => {
  describe('acquire', () => {
    it('succeeds under limit', () => {
      const limiter = new RateLimiter({ requestsPerMinute: 10, concurrent: 5 })
      expect(() => limiter.acquire()).not.toThrow()
    })

    it('throws RateLimitError when concurrent exceeded', () => {
      const limiter = new RateLimiter({ concurrent: 2 })
      limiter.acquire()
      limiter.acquire()
      expect(() => limiter.acquire()).toThrow(RateLimitError)
    })

    it('throws RateLimitError when per-minute exceeded', () => {
      const limiter = new RateLimiter({ requestsPerMinute: 2 })
      limiter.acquire()
      limiter.acquire()
      expect(() => limiter.acquire()).toThrow(RateLimitError)
    })
  })

  describe('release', () => {
    it('decrements active count', () => {
      const limiter = new RateLimiter({ concurrent: 2 })
      limiter.acquire()
      limiter.acquire()
      limiter.release()

      expect(() => limiter.acquire()).not.toThrow()
    })
  })

  describe('incrementDaily', () => {
    it('increments daily count', () => {
      const limiter = new RateLimiter({ requestsPerDay: 10 })
      limiter.incrementDaily()
      limiter.incrementDaily()

      expect(limiter.getDailyCount()).toBe(2)
    })
  })

  describe('isDailyExhausted', () => {
    it('returns false when no daily limit', () => {
      const limiter = new RateLimiter({})
      expect(limiter.isDailyExhausted()).toBe(false)
    })

    it('returns true when daily quota exhausted', () => {
      const limiter = new RateLimiter({ requestsPerDay: 2 })
      limiter.incrementDaily()
      limiter.incrementDaily()
      expect(limiter.isDailyExhausted()).toBe(true)
    })

    it('resets on new day', () => {
      const limiter = new RateLimiter({ requestsPerDay: 1 })
      limiter.incrementDaily()

      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(1, 0, 0, 0)

      vi.useFakeTimers()
      vi.setSystemTime(tomorrow)

      expect(limiter.isDailyExhausted()).toBe(false)

      vi.useRealTimers()
    })
  })

  describe('getDailyResetAt', () => {
    it('returns a future timestamp', () => {
      const limiter = new RateLimiter({})
      expect(limiter.getDailyResetAt()).toBeGreaterThan(Date.now())
    })
  })
})
