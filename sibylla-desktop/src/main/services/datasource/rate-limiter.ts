import { RateLimitError } from './types'

interface RateLimits {
  readonly requestsPerMinute?: number
  readonly requestsPerDay?: number
  readonly concurrent?: number
}

export class RateLimiter {
  private minuteTimestamps: number[] = []
  private dailyCount = 0
  private dailyResetAt: number
  private activeCount = 0

  constructor(private limits: RateLimits) {
    this.dailyResetAt = this.nextDayStart()
  }

  acquire(): void {
    if (this.limits.concurrent && this.activeCount >= this.limits.concurrent) {
      throw new RateLimitError('concurrent', 1000)
    }

    this.cleanMinuteBucket()
    if (this.limits.requestsPerMinute && this.minuteTimestamps.length >= this.limits.requestsPerMinute) {
      const oldestTimestamp = this.minuteTimestamps[0] ?? Date.now()
      const waitMs = 60000 - (Date.now() - oldestTimestamp)
      throw new RateLimitError('per-minute', Math.max(waitMs, 1000))
    }

    this.minuteTimestamps.push(Date.now())
    this.activeCount++
  }

  release(): void {
    this.activeCount = Math.max(0, this.activeCount - 1)
  }

  incrementDaily(): void {
    if (Date.now() > this.dailyResetAt) {
      this.dailyCount = 0
      this.dailyResetAt = this.nextDayStart()
    }
    this.dailyCount++
  }

  isDailyExhausted(): boolean {
    if (!this.limits.requestsPerDay) return false
    if (Date.now() > this.dailyResetAt) {
      this.dailyCount = 0
      this.dailyResetAt = this.nextDayStart()
    }
    return this.dailyCount >= this.limits.requestsPerDay
  }

  getDailyResetAt(): number {
    return this.dailyResetAt
  }

  getDailyCount(): number {
    return this.dailyCount
  }

  private cleanMinuteBucket(): void {
    const cutoff = Date.now() - 60000
    while (this.minuteTimestamps.length > 0 && (this.minuteTimestamps[0] ?? 0) < cutoff) {
      this.minuteTimestamps.shift()
    }
  }

  private nextDayStart(): number {
    const now = new Date()
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    return tomorrow.getTime()
  }
}
