import fs from 'fs'
import path from 'path'
import type { AppEventBus } from '../event-bus'
import type { NotificationDraft } from '../notifications/types'
import { logger } from '../../utils/logger'

interface AiModeRegistryLike {
  getActiveMode(conversationId: string): unknown
  setFocused(conversationId: string, focused: boolean, until?: string): void
}

interface SubAgentExecutorLike {
  spawnSubAgent(agentId: string, params: Record<string, unknown>): Promise<unknown>
}

interface NotificationStoreLike {
  create(draft: NotificationDraft): { id: string }
}

interface PreferenceLearnerLike {
  getScheduledFocus(): { enabled: boolean; startHour: number; endHour: number } | undefined
}

export class FocusModeController {
  private currentQueuePath: string | null = null
  private focusUntilTimer: ReturnType<typeof setTimeout> | null = null
  private scheduledFocusTimer: ReturnType<typeof setInterval> | null = null
  private readonly queueDir: string

  constructor(
    private readonly aiModeRegistry: AiModeRegistryLike,
    private readonly eventBus: AppEventBus,
    private readonly store: NotificationStoreLike | null,
    private readonly preferenceLearner: PreferenceLearnerLike | null,
    private readonly subAgentExecutor: SubAgentExecutorLike | null,
    private readonly workspacePath: string,
  ) {
    this.queueDir = path.join(workspacePath, '.sibylla', 'notifications', 'focused-queue')
  }

  setFocused(conversationId: string, focused: boolean, until?: string): void {
    this.aiModeRegistry.setFocused(conversationId, focused, until)

    if (focused) {
      if (!fs.existsSync(this.queueDir)) {
        fs.mkdirSync(this.queueDir, { recursive: true })
      }
      this.currentQueuePath = path.join(this.queueDir, `${Date.now()}.jsonl`)

      if (until) {
        const targetTime = new Date(until).getTime()
        const delay = targetTime - Date.now()
        if (delay > 0) {
          this.focusUntilTimer = setTimeout(() => {
            this.setFocused(conversationId, false)
          }, delay)
        }
      }
    } else {
      if (this.focusUntilTimer) {
        clearTimeout(this.focusUntilTimer)
        this.focusUntilTimer = null
      }

      this.flushFocusedQueue()
      this.currentQueuePath = null
    }

    this.eventBus.emitEvent({
      type: 'aiMode.focused-changed',
      source: 'focus-mode-controller',
      payload: { conversationId, focused, focusUntil: until },
    })

    logger.info('focus-mode-controller.set', { conversationId, focused, until })
  }

  isFocused(_conversationId?: string): boolean {
    return this.currentQueuePath !== null
  }

  getCurrentQueuePath(): string | null {
    return this.currentQueuePath
  }

  getQueuePreview(): NotificationDraft[] {
    if (!this.currentQueuePath || !fs.existsSync(this.currentQueuePath)) return []

    const content = fs.readFileSync(this.currentQueuePath, 'utf-8')
    const lines = content.split('\n').filter(Boolean).slice(0, 10)

    const drafts: NotificationDraft[] = []
    for (const line of lines) {
      try {
        drafts.push(JSON.parse(line) as NotificationDraft)
      } catch {
        // skip invalid
      }
    }
    return drafts
  }

  checkScheduledFocus(): void {
    const config = this.preferenceLearner?.getScheduledFocus()
    if (!config?.enabled) return

    const now = new Date()
    const currentHour = now.getHours()

    if (currentHour >= config.startHour && currentHour < config.endHour) {
      if (!this.isFocused()) {
        this.setFocused('', true)
        logger.info('focus-mode-controller.scheduled-focus.auto-enable')
      }
    }
  }

  startScheduledFocusCheck(): void {
    this.scheduledFocusTimer = setInterval(() => {
      this.checkScheduledFocus()
    }, 60 * 1000)
  }

  private flushFocusedQueue(): void {
    if (!this.currentQueuePath || !fs.existsSync(this.currentQueuePath)) return

    const content = fs.readFileSync(this.currentQueuePath, 'utf-8')
    const lines = content.split('\n').filter(Boolean)

    if (lines.length === 0) {
      fs.unlinkSync(this.currentQueuePath)
      return
    }

    const drafts: NotificationDraft[] = []
    for (const line of lines) {
      try {
        drafts.push(JSON.parse(line) as NotificationDraft)
      } catch {
        // skip invalid
      }
    }

    if (drafts.length === 0) {
      this.deleteQueueFileAt(this.currentQueuePath)
      return
    }

    const draftsRef = [...drafts]
    const queuePath = this.currentQueuePath

    if (this.subAgentExecutor) {
      void this.generateAISummary(draftsRef).finally(() => {
        this.deleteQueueFileAt(queuePath)
      })
    } else if (this.store) {
      for (const draft of draftsRef) {
        this.store.create(draft)
      }
      this.deleteQueueFileAt(queuePath)
    }
  }

  private async generateAISummary(drafts: NotificationDraft[]): Promise<void> {
    if (!this.subAgentExecutor || !this.store) return

    const summaries = drafts.map(d => ({
      type: d.type,
      priority: d.priority,
      title: d.title,
      body: d.body,
      source: d.source,
    }))

    try {
      const result = await Promise.race([
        this.subAgentExecutor.spawnSubAgent('focus-summary-curator', {
          notifications: summaries,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Sub-agent timeout')), 10_000),
        ),
      ])

      const summaryData = result as { summary?: string; actionItems?: Array<{ verb: string; source: string; description: string }> }

      this.store.create({
        type: 'system.suggestion',
        priority: 'normal',
        source: { provider: 'focus-mode' },
        title: 'Focus mode summary',
        body: summaryData.summary ?? `${drafts.length} notifications were queued during focus mode.`,
        groupKey: 'focus-summary',
        metadata: { actionItems: summaryData.actionItems ?? [] },
      })
    } catch (err) {
      logger.warn('focus-mode-controller.ai-summary.failed', { error: err })

      for (const draft of drafts) {
        this.store.create(draft)
      }
    }
  }

  private deleteQueueFileAt(queuePath: string): void {
    try {
      if (fs.existsSync(queuePath)) {
        fs.unlinkSync(queuePath)
      }
    } catch (err) {
      logger.warn('focus-mode-controller.queue-delete.failed', { error: err })
    }
  }

  shutdown(): void {
    if (this.focusUntilTimer) {
      clearTimeout(this.focusUntilTimer)
      this.focusUntilTimer = null
    }

    if (this.scheduledFocusTimer) {
      clearInterval(this.scheduledFocusTimer)
      this.scheduledFocusTimer = null
    }

    if (this.currentQueuePath) {
      this.flushFocusedQueue()
      this.currentQueuePath = null
    }
  }
}
