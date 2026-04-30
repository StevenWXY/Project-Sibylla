import type {
  Trigger,
  TriggerId,
  CooldownRecord,
  TriggerRegistryDeps,
} from './types'
import {
  MIN_COOLDOWN_MINUTES,
  MAX_COOLDOWN_MINUTES,
  DISMISS_ADJUST_COUNT,
  ADJUST_WINDOW_HOURS,
  DEFAULT_TRIGGER_COOLDOWNS,
} from './constants'

interface AdjustWindow {
  count: number
  windowStart: number
}

export class TriggerRegistry {
  private readonly triggers = new Map<TriggerId, Trigger>()
  private readonly cooldowns = new Map<TriggerId, CooldownRecord>()
  private readonly dismissCounts = new Map<TriggerId, AdjustWindow>()
  private readonly acceptCounts = new Map<TriggerId, AdjustWindow>()
  private lastGlobalSuggestionAt: number | null = null

  constructor(private readonly deps: TriggerRegistryDeps) {}

  register(trigger: Trigger): void {
    this.triggers.set(trigger.id, trigger)
    this.cooldowns.set(trigger.id, {
      currentMinutes: trigger.defaultCooldownMinutes,
      lastFiredAt: null,
    })
  }

  getTrigger(id: TriggerId): Trigger | undefined {
    return this.triggers.get(id)
  }

  getAllTriggers(): Trigger[] {
    return Array.from(this.triggers.values())
  }

  isInCooldown(triggerId: TriggerId): boolean {
    const record = this.cooldowns.get(triggerId)
    if (!record || record.lastFiredAt === null) return false
    const elapsed = Date.now() - record.lastFiredAt
    return elapsed < record.currentMinutes * 60 * 1000
  }

  isGlobalCooldown(): boolean {
    if (this.lastGlobalSuggestionAt === null) return false
    const elapsed = Date.now() - this.lastGlobalSuggestionAt
    return elapsed < this.deps.globalCooldownMinutes * 60 * 1000
  }

  markFired(triggerId: TriggerId): void {
    const record = this.cooldowns.get(triggerId)
    if (record) {
      record.lastFiredAt = Date.now()
    }
    this.lastGlobalSuggestionAt = Date.now()
  }

  recordDismiss(triggerId: TriggerId): void {
    this.dismissCounts.set(triggerId, this._updateWindow(this.dismissCounts.get(triggerId)))
    this.acceptCounts.delete(triggerId)

    const window = this.dismissCounts.get(triggerId)
    if (window && window.count >= DISMISS_ADJUST_COUNT) {
      this._doubleCooldown(triggerId)
    }
  }

  recordAccept(triggerId: TriggerId): void {
    this.acceptCounts.set(triggerId, this._updateWindow(this.acceptCounts.get(triggerId)))
    this.dismissCounts.delete(triggerId)

    const window = this.acceptCounts.get(triggerId)
    if (window && window.count >= DISMISS_ADJUST_COUNT) {
      this._halveCooldown(triggerId)
    }
  }

  getLastGlobalSuggestionAt(): number | null {
    return this.lastGlobalSuggestionAt
  }

  restoreCooldowns(cooldownMap: Record<TriggerId, number>): void {
    for (const [triggerId, minutes] of Object.entries(cooldownMap)) {
      const record = this.cooldowns.get(triggerId as TriggerId)
      if (record) {
        record.currentMinutes = minutes
      }
    }
  }

  getCooldownMinutes(triggerId: TriggerId): number {
    return this.cooldowns.get(triggerId)?.currentMinutes ?? DEFAULT_TRIGGER_COOLDOWNS[triggerId]
  }

  private _updateWindow(current: AdjustWindow | undefined): AdjustWindow {
    const now = Date.now()
    const windowMs = ADJUST_WINDOW_HOURS * 60 * 60 * 1000
    if (!current || (now - current.windowStart) > windowMs) {
      return { count: 1, windowStart: now }
    }
    return { count: current.count + 1, windowStart: current.windowStart }
  }

  private async _doubleCooldown(triggerId: TriggerId): Promise<void> {
    const record = this.cooldowns.get(triggerId)
    if (!record) return
    const newMinutes = Math.min(record.currentMinutes * 2, MAX_COOLDOWN_MINUTES)
    record.currentMinutes = newMinutes
    this.dismissCounts.delete(triggerId)
    await this.deps.onCooldownChange(triggerId, newMinutes)
  }

  private async _halveCooldown(triggerId: TriggerId): Promise<void> {
    const record = this.cooldowns.get(triggerId)
    if (!record) return
    const newMinutes = Math.max(Math.floor(record.currentMinutes / 2), MIN_COOLDOWN_MINUTES)
    record.currentMinutes = newMinutes
    this.acceptCounts.delete(triggerId)
    await this.deps.onCooldownChange(triggerId, newMinutes)
  }
}
