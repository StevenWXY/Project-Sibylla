import type {
  EditorSnapshot,
  ProactiveConfig,
  Suggestion,
  SuggestionDraft,
  SuggestionOutcome,
  TriggerDeps,
  TriggerId,
  InterruptContext,
} from './types'
import type { TriggerRegistry } from './trigger-registry'
import type { InterruptPolicy } from './interrupt-policy'
import type { SubAgentExecutor } from '../sub-agent/SubAgentExecutor'
import type { SubAgentRegistry } from '../sub-agent/SubAgentRegistry'
import type { AppEventBus } from '../event-bus'
import type { Tracer } from '../trace/tracer'
import { SUB_AGENT_TIMEOUT_MS } from './constants'
import { taskDecompositionTrigger } from './triggers/task-decomposition'
import { relatedContentTrigger } from './triggers/related-content'
import { memoryPromoteTrigger } from './triggers/memory-promote'
import { reviewStaleTrigger } from './triggers/review-stale'

interface ProactiveEngineDeps {
  triggerRegistry: TriggerRegistry
  interruptPolicy: InterruptPolicy
  subAgentExecutor: SubAgentExecutor
  subAgentRegistry: SubAgentRegistry
  eventBus: AppEventBus
  tracer: Tracer | null
  triggerDeps: TriggerDeps
  commandRegistry: { execute: (id: string) => Promise<void> }
  sendToRenderer: (channel: string, data: unknown) => void
}

interface PendingSuggestion {
  triggerId: TriggerId
  suggestion: Suggestion
}

export class ProactiveEngine {
  private _latestSnapshot: EditorSnapshot | null = null
  private _isTaskRunning = false
  private _isFullscreen = false
  private _initialized = false
  private _unsubscribers: Array<() => void> = []
  private _pendingSuggestions = new Map<string, PendingSuggestion>()

  private config: ProactiveConfig

  constructor(
    private readonly deps: ProactiveEngineDeps,
    config: ProactiveConfig,
  ) {
    this.config = config
  }

  initialize(): void {
    this.deps.triggerRegistry.register(taskDecompositionTrigger)
    this.deps.triggerRegistry.register(relatedContentTrigger)
    this.deps.triggerRegistry.register(memoryPromoteTrigger)
    this.deps.triggerRegistry.register(reviewStaleTrigger)

    const unsub1 = this.deps.eventBus.subscribe('progress.task-declared', () => {
      this._isTaskRunning = true
    })
    const unsub2 = this.deps.eventBus.subscribe('progress.task-completed', () => {
      this._isTaskRunning = false
    })
    const unsub3 = this.deps.eventBus.subscribe('progress.task-failed', () => {
      this._isTaskRunning = false
    })
    this._unsubscribers = [unsub1, unsub2, unsub3]

    this._initialized = true
  }

  onSnapshot(snapshot: EditorSnapshot): void {
    this._latestSnapshot = snapshot
    if (!this.config.enabled) return
    this._evaluate().catch(() => {})
  }

  setFullscreen(value: boolean): void {
    this._isFullscreen = value
  }

  recordSuggestionOutcome(
    suggestionId: string,
    outcome: SuggestionOutcome,
    dwellMs: number,
  ): void {
    const pending = this._pendingSuggestions.get(suggestionId)
    if (!pending) return

    const { triggerId } = pending

    switch (outcome) {
      case 'accepted':
        this.deps.triggerRegistry.recordAccept(triggerId)
        this._pendingSuggestions.delete(suggestionId)
        break
      case 'dismissed':
        this.deps.triggerRegistry.recordDismiss(triggerId)
        this._pendingSuggestions.delete(suggestionId)
        break
      case 'timeout':
        this._pendingSuggestions.delete(suggestionId)
        break
    }

    if (this.deps.tracer?.isEnabled()) {
      this.deps.tracer.startSpan('proactive.suggestion-outcome', {
        kind: 'system',
        attributes: { triggerId, outcome, dwellMs, suggestionId },
      }).setStatus('ok').end()
    }
  }

  getConfig(): ProactiveConfig {
    return { ...this.config }
  }

  updateConfig(partial: Partial<ProactiveConfig>): void {
    this.config = {
      ...this.config,
      ...partial,
      interruptPolicy: partial.interruptPolicy
        ? { ...this.config.interruptPolicy, ...partial.interruptPolicy }
        : this.config.interruptPolicy,
    }
    this.deps.interruptPolicy.updateConfig(this.config)
  }

  shutdown(): void {
    for (const unsub of this._unsubscribers) {
      unsub()
    }
    this._unsubscribers = []
    this._pendingSuggestions.clear()
    this._initialized = false
  }

  private async _evaluate(): Promise<void> {
    if (!this._latestSnapshot) return

    const snapshot = this._latestSnapshot

    if (this.deps.triggerRegistry.isGlobalCooldown()) {
      this._recordTrace('proactive.evaluate', { result: 'global-cooldown' })
      return
    }

    const context: InterruptContext = {
      snapshot,
      lastSuggestionAt: this.deps.triggerRegistry.getLastGlobalSuggestionAt(),
      isFocused: snapshot.isFocused,
      isTaskRunning: this._isTaskRunning,
      isFullscreen: this._isFullscreen,
      currentAiMode: snapshot.currentAiMode,
    }

    const candidates: SuggestionDraft[] = []
    for (const trigger of this.deps.triggerRegistry.getAllTriggers()) {
      if (!trigger.enabled) continue
      if (this.deps.triggerRegistry.isInCooldown(trigger.id)) continue
      try {
        if (!trigger.condition(snapshot, this.deps.triggerDeps)) continue
        const draft = await trigger.buildDraft(snapshot, this.deps.triggerDeps)
        if (draft) candidates.push(draft)
      } catch {
        continue
      }
    }

    if (candidates.length === 0) {
      this._recordTrace('proactive.evaluate', { result: 'no-match' })
      return
    }

    candidates.sort((a, b) => {
      if (a.priority === 'urgent' && b.priority !== 'urgent') return -1
      if (a.priority !== 'urgent' && b.priority === 'urgent') return 1
      return 0
    })

    const candidate = candidates[0]

    const interrupt = this.deps.interruptPolicy.canInterrupt(context)
    if (!interrupt.allowed) {
      this._recordTrace('proactive.evaluate', {
        result: 'suppressed',
        reason: interrupt.reason,
        triggerId: candidate.triggerId,
      })
      return
    }

    try {
      const agentDef = this.deps.subAgentRegistry.get('suggestion-curator')
      if (!agentDef) {
        this._recordTrace('proactive.evaluate', {
          result: 'sub-agent-not-found',
          triggerId: candidate.triggerId,
        })
        return
      }

      const result = await this.deps.subAgentExecutor.run({
        agent: agentDef,
        task: candidate.previewTitle,
        params: {
          triggerId: candidate.triggerId,
          context: candidate.context,
          previewTitle: candidate.previewTitle,
        },
        parentTraceId: '',
        parentAllowedTools: agentDef.allowedTools ?? [],
        timeoutMs: SUB_AGENT_TIMEOUT_MS,
      })

      if (!result.success || !result.structuredOutput) {
        this._recordTrace('proactive.evaluate', {
          result: 'sub-agent-failed',
          triggerId: candidate.triggerId,
        })
        return
      }

      const output = result.structuredOutput
      const suggestion: Suggestion = {
        id: this._generateId(),
        triggerId: candidate.triggerId,
        title: String(output.title ?? candidate.previewTitle),
        body: String(output.body ?? ''),
        acceptAction: output.acceptAction as Suggestion['acceptAction'] ?? {
          command: '',
          args: {},
        },
        declineAction: (output.declineAction as Suggestion['declineAction']) ?? 'dismiss',
        priority: candidate.priority,
        createdAt: Date.now(),
      }

      this.deps.triggerRegistry.markFired(candidate.triggerId)
      this._pendingSuggestions.set(suggestion.id, {
        triggerId: candidate.triggerId,
        suggestion,
      })
      this._dispatchSuggestion(suggestion)
    } catch {
      this._recordTrace('proactive.evaluate', {
        result: 'sub-agent-failed',
        triggerId: candidate.triggerId,
      })
    }
  }

  private _dispatchSuggestion(suggestion: Suggestion): void {
    this.deps.sendToRenderer('proactive:suggestionShown', suggestion)
    this._recordTrace('proactive.suggestion-shown', {
      triggerId: suggestion.triggerId,
      suggestionId: suggestion.id,
    })
  }

  private _recordTrace(name: string, attributes: Record<string, unknown>): void {
    if (!this.deps.tracer?.isEnabled()) return
    this.deps.tracer.startSpan(name, {
      kind: 'system',
      attributes,
    }).setStatus('ok').end()
  }

  private _generateId(): string {
    return `sug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  }
}
