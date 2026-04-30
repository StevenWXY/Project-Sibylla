import type { ProactiveConfig, TriggerId } from './types'

export const DEFAULT_PROACTIVE_CONFIG: ProactiveConfig = {
  enabled: true,
  globalCooldownMinutes: 5,
  triggerOverrides: {},
  interruptPolicy: {
    suppressDuringTaskExecution: true,
    suppressInDeepFocus: true,
    suppressDuringFocusMode: true,
  },
}

export const MIN_COOLDOWN_MINUTES = 5
export const MAX_COOLDOWN_MINUTES = 1440
export const DISMISS_ADJUST_COUNT = 3
export const ADJUST_WINDOW_HOURS = 24
export const DEEP_FOCUS_VELOCITY = 50
export const DEEP_FOCUS_MINUTES = 5
export const SUB_AGENT_TIMEOUT_MS = 3000

export const DEFAULT_TRIGGER_COOLDOWNS: Record<TriggerId, number> = {
  'task-decomposition': 30,
  'related-content': 30,
  'memory-promote': 60,
  'review-stale': 60,
}
