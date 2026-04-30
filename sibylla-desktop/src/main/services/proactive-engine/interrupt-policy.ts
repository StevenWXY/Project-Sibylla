import type { InterruptContext, ProactiveConfig } from './types'
import { DEEP_FOCUS_VELOCITY, DEEP_FOCUS_MINUTES } from './constants'

export class InterruptPolicy {
  private config: ProactiveConfig

  constructor(config: ProactiveConfig) {
    this.config = config
  }

  canInterrupt(context: InterruptContext): { allowed: boolean; reason?: string } {
    if (this.config.interruptPolicy.suppressInDeepFocus) {
      if (context.snapshot.typingVelocity > DEEP_FOCUS_VELOCITY) {
        return { allowed: false, reason: 'deep-focus-high-velocity' }
      }
      if (context.snapshot.continuousTypingMinutes > DEEP_FOCUS_MINUTES) {
        return { allowed: false, reason: 'deep-focus-continuous' }
      }
    }

    if (context.lastSuggestionAt !== null) {
      const elapsed = Date.now() - context.lastSuggestionAt
      if (elapsed < this.config.globalCooldownMinutes * 60 * 1000) {
        return { allowed: false, reason: 'global-cooldown' }
      }
    }

    if (this.config.interruptPolicy.suppressDuringFocusMode && context.isFocused) {
      return { allowed: false, reason: 'focus-mode-active' }
    }

    if (this.config.interruptPolicy.suppressDuringTaskExecution && context.isTaskRunning) {
      return { allowed: false, reason: 'task-executing' }
    }

    if (context.isFullscreen) {
      return { allowed: false, reason: 'fullscreen' }
    }

    if (context.currentAiMode === 'plan' && context.isTaskRunning) {
      return { allowed: false, reason: 'plan-mode-task-running' }
    }

    return { allowed: true }
  }

  updateConfig(partial: Partial<ProactiveConfig>): void {
    this.config = { ...this.config, ...partial }
    if (partial.interruptPolicy) {
      this.config.interruptPolicy = {
        ...this.config.interruptPolicy,
        ...partial.interruptPolicy,
      }
    }
  }
}
