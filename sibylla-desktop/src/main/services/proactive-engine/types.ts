import type { AiModeId } from '../mode/types'
import type { NotificationPriority } from '../notifications/types'

export type TriggerId =
  | 'task-decomposition'
  | 'related-content'
  | 'memory-promote'
  | 'review-stale'

export type SuggestionPriority = 'urgent' | 'normal'

export type SuggestionOutcome = 'accepted' | 'dismissed' | 'timeout'

export interface EditorSnapshot {
  filePath: string
  contentSummary: { length: number; recentText: string }
  typingVelocity: number
  continuousTypingMinutes: number
  cursorPosition: number
  selectionLength: number
  lastInteractionAt: number
  currentAiMode: AiModeId
  isFocused: boolean
}

export interface SuggestionDraft {
  triggerId: TriggerId
  priority: SuggestionPriority
  context: Record<string, unknown>
  previewTitle: string
}

export interface Suggestion {
  id: string
  triggerId: TriggerId
  title: string
  body: string
  acceptAction: { command: string; args: Record<string, unknown> }
  declineAction: 'dismiss' | 'snooze-1h' | 'never'
  priority: SuggestionPriority
  createdAt: number
}

export interface TriggerDeps {
  searchEngine: {
    search: (
      query: string,
      options?: { limit?: number },
    ) => Promise<{ results: Array<{ filePath: string }> }>
  }
  memoryStore: {
    persistCooldown: (triggerId: TriggerId, minutes: number) => Promise<void>
  }
  fileStats: (path: string) => { updatedAt: number; size: number } | null
  knownMemoryPatterns: string[]
}

export interface Trigger {
  id: TriggerId
  description: string
  enabled: boolean
  defaultCooldownMinutes: number
  condition: (snapshot: EditorSnapshot, deps: TriggerDeps) => boolean
  buildDraft: (
    snapshot: EditorSnapshot,
    deps: TriggerDeps,
  ) => SuggestionDraft | null | Promise<SuggestionDraft | null>
}

export interface InterruptContext {
  snapshot: EditorSnapshot
  lastSuggestionAt: number | null
  isFocused: boolean
  isTaskRunning: boolean
  isFullscreen: boolean
  currentAiMode: AiModeId
}

export interface InterruptPolicyConfig {
  suppressDuringTaskExecution: boolean
  suppressInDeepFocus: boolean
  suppressDuringFocusMode: boolean
}

export interface ProactiveConfig {
  enabled: boolean
  globalCooldownMinutes: number
  triggerOverrides: Partial<Record<TriggerId, { enabled?: boolean; cooldownMinutes?: number }>>
  interruptPolicy: InterruptPolicyConfig
}

export interface CooldownRecord {
  currentMinutes: number
  lastFiredAt: number | null
}

export interface TriggerRegistryDeps {
  onCooldownChange: (triggerId: TriggerId, minutes: number) => Promise<void>
  globalCooldownMinutes: number
}

export type PatrolTriggerId =
  | 'risk-task-delay'
  | 'workload-imbalance'
  | 'decision-contradiction'

export interface PatrolTrigger {
  id: PatrolTriggerId
  description: string
  enabled: boolean
  cooldownMs: number
  evaluate(): Promise<PatrolResult | null>
}

export interface PatrolResult {
  title: string
  detail: string
  actions: Array<{ id: string; label: string }>
  audience: string[]
  priority: NotificationPriority
  groupKey: string
}
