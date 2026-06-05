import path from 'path'
import fs from 'fs'
import { shell } from 'electron'
import type { AppEventBus } from '../event-bus'
import type { SibyllaEvent } from '../event-bus-types'
import type { NotificationDraft, NotificationRule } from './types'
import { NotificationStore } from './notification-store'
import { createBuiltinRules } from './notification-rules'
import { DEDUP_WINDOW_MS, PRIORITY_ORDER } from './constants'
import { logger } from '../../utils/logger'

interface PreferenceLearnerLike {
  isMuted(type: string, sourceProvider?: string): boolean
  checkAndSuggestMute(type: string, sourceProvider?: string): void
}

interface FocusModeControllerLike {
  isFocused(conversationId?: string): boolean
  getCurrentQueuePath(): string | null
}

export class NotificationEngine {
  private readonly rules = new Map<string, NotificationRule>()
  private readonly unsubscribers: Array<() => void> = []
  private archiveTimerRef?: ReturnType<typeof setInterval>
  private readonly ruleDeps: { currentUserId: string; getRecentFiles: () => string[] }

  constructor(
    private readonly eventBus: AppEventBus,
    readonly store: NotificationStore,
    private readonly preferenceLearner: PreferenceLearnerLike,
    private readonly focusModeController: FocusModeControllerLike | null,
    private readonly workspacePath: string,
    deps: { currentUserId: string; getRecentFiles: () => string[] },
  ) {
    this.ruleDeps = deps
  }

  async initialize(): Promise<void> {
    await this.store.initialize()
    this.registerRules(createBuiltinRules(this.ruleDeps))

    this.archiveTimerRef = setInterval(() => {
      try {
        this.store.archiveStale()
      } catch (err) {
        logger.warn('notification-engine.archive.failed', { error: err })
      }
    }, 60 * 60 * 1000)

    logger.info('notification-engine.initialized')
  }

  registerRules(rules: NotificationRule[]): void {
    for (const rule of rules) {
      if (!rule.enabled) continue

      this.rules.set(rule.id, rule)

      const handler = (event: SibyllaEvent) => {
        this.handleEvent(rule, event)
      }

      const unsub = this.eventBus.subscribe(rule.eventType, handler)
      this.unsubscribers.push(unsub)
    }
  }

  private handleEvent(rule: NotificationRule, event: SibyllaEvent): void {
    try {
      if (rule.condition && !rule.condition(event)) return

      let draft: NotificationDraft | null = null
      try {
        draft = rule.build(event)
      } catch (err) {
        logger.warn('notification-engine.rule.build.failed', {
          ruleId: rule.id,
          error: err,
        })
        return
      }

      if (!draft) return

      const existing = this.store.findByGroupKeyRecent(draft.groupKey, DEDUP_WINDOW_MS)
      if (existing) {
        this.store.updateExisting(existing.id, { title: draft.title, body: draft.body })
        logger.debug('notification-engine.dedup.updated', {
          groupKey: draft.groupKey,
          existingId: existing.id,
        })
        return
      }

      if (this.preferenceLearner.isMuted(draft.type, draft.source.provider)) {
        logger.debug('notification-engine.muted', { type: draft.type, provider: draft.source.provider })
        return
      }

      if (this.focusModeController?.isFocused() && PRIORITY_ORDER[draft.priority] > PRIORITY_ORDER.urgent) {
        this.enqueueToFocusedQueue(draft)
        return
      }

      const notification = this.store.create(draft)

      this.eventBus.emitEvent({
        type: 'notification.created',
        source: 'notification-engine',
        payload: { notificationId: notification.id, notification },
      })

      logger.debug('notification-engine.created', {
        notificationId: notification.id,
        type: notification.type,
        priority: notification.priority,
      })
    } catch (err) {
      logger.warn('notification-engine.handle.failed', {
        ruleId: rule.id,
        error: err,
      })
    }
  }

  recordAction(
    notificationId: string,
    action: 'click' | 'dismiss' | 'mute' | 'snooze',
  ): void {
    const notification = this.store.getById(notificationId)
    if (!notification) {
      logger.warn('notification-engine.recordAction.not-found', { notificationId })
      return
    }

    this.store.recordAction(
      notificationId,
      notification.type,
      notification.source.provider,
      action,
    )

    if (action === 'click') {
      this.store.markRead(notificationId)
      this.eventBus.emitEvent({
        type: 'notification.clicked',
        source: 'notification-engine',
        payload: { notificationId },
      })
    }

    if (action === 'dismiss') {
      this.store.markDismissed(notificationId)
      this.preferenceLearner.checkAndSuggestMute(
        notification.type,
        notification.source.provider,
      )
      this.eventBus.emitEvent({
        type: 'notification.dismissed',
        source: 'notification-engine',
        payload: { notificationId },
      })
    }
  }

  navigate(notificationId: string): void {
    const notification = this.store.getById(notificationId)
    if (!notification) return

    if (!notification.navigation) return

    const nav = notification.navigation
    let targetValid = true

    switch (nav.kind) {
      case 'file': {
        const fullPath = path.join(this.workspacePath, nav.path)
        targetValid = fs.existsSync(fullPath)
        break
      }
      case 'memory':
      case 'mcp':
      case 'trace':
      case 'external':
        break
    }

    if (!targetValid) {
      this.store.markStale(notificationId)
      logger.info('notification-engine.navigate.stale', { notificationId, kind: nav.kind })
      return
    }

    if (nav.kind === 'external') {
      void shell.openExternal(nav.url)
    }

    this.recordAction(notificationId, 'click')
  }

  private enqueueToFocusedQueue(draft: NotificationDraft): void {
    const queuePath = this.focusModeController?.getCurrentQueuePath()
    if (!queuePath) return

    const dir = path.dirname(queuePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.appendFile(queuePath, JSON.stringify(draft) + '\n', (err) => {
      if (err) {
        logger.warn('notification-engine.enqueued-to-focus.failed', { error: err })
      } else {
        logger.debug('notification-engine.enqueued-to-focus', { groupKey: draft.groupKey })
      }
    })
  }

  getFocusedQueuePreview(): NotificationDraft[] {
    const queuePath = this.focusModeController?.getCurrentQueuePath()
    if (!queuePath || !fs.existsSync(queuePath)) return []

    const content = fs.readFileSync(queuePath, 'utf-8')
    const lines = content.split('\n').filter(Boolean).slice(0, 10)

    const drafts: NotificationDraft[] = []
    for (const line of lines) {
      try {
        drafts.push(JSON.parse(line) as NotificationDraft)
      } catch {
        // skip invalid lines
      }
    }
    return drafts
  }

  shutdown(): void {
    if (this.archiveTimerRef) {
      clearInterval(this.archiveTimerRef)
      this.archiveTimerRef = undefined
    }

    for (const unsub of this.unsubscribers) {
      unsub()
    }
    this.unsubscribers.length = 0

    try {
      this.store.flushToDisk()
    } catch (err) {
      logger.warn('notification-engine.shutdown.flush.failed', { error: err })
    }

    logger.info('notification-engine.shutdown')
  }
}
