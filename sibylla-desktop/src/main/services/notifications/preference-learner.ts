import fs from 'fs'
import path from 'path'
import type {
  NotificationPreferences,
  MutedRule,
  ScheduledFocusConfig,
  NotificationDraft,
} from './types'
import { DISMISS_TRIGGER_COUNT, DISMISS_WINDOW_MS } from './constants'
import { logger } from '../../utils/logger'

interface NotificationStoreLike {
  getDismissStats(type: string, sourceProvider: string | undefined, windowMs: number): { total: number; dismissed: number }
}

interface NotificationEngineLike {
  store: { create(draft: NotificationDraft): { id: string } }
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  schemaVersion: 1,
  mutedRules: [],
}

export class PreferenceLearner {
  private cachedPreferences: NotificationPreferences = { ...DEFAULT_PREFERENCES }
  private readonly prefsPath: string
  private readonly tmpPath: string
  private notificationEngine: NotificationEngineLike | null = null

  constructor(
    private readonly store: NotificationStoreLike,
    workspaceRoot: string,
  ) {
    const prefsDir = path.join(workspaceRoot, '.sibylla', 'notifications')
    this.prefsPath = path.join(prefsDir, 'preferences.json')
    this.tmpPath = path.join(prefsDir, 'preferences.json.tmp')
  }

  setNotificationEngine(engine: NotificationEngineLike): void {
    this.notificationEngine = engine
  }

  load(): NotificationPreferences {
    try {
      if (fs.existsSync(this.prefsPath)) {
        const content = fs.readFileSync(this.prefsPath, 'utf-8')
        const parsed = JSON.parse(content) as NotificationPreferences
        if (parsed.schemaVersion === 1 && Array.isArray(parsed.mutedRules)) {
          this.cachedPreferences = parsed
          return this.cachedPreferences
        }
      }
    } catch (err) {
      logger.warn('preference-learner.load.failed-using-defaults', { error: err })
    }

    this.cachedPreferences = { ...DEFAULT_PREFERENCES, mutedRules: [] }
    return this.cachedPreferences
  }

  isMuted(type: string, sourceProvider?: string): boolean {
    return this.cachedPreferences.mutedRules.some(rule => {
      if (rule.type !== type) return false
      if (rule.sourceProvider === undefined) return true
      return rule.sourceProvider === (sourceProvider ?? undefined)
    })
  }

  mute(type: string, sourceProvider?: string): void {
    const rule: MutedRule = {
      type,
      sourceProvider,
      mutedAt: Date.now(),
    }
    this.cachedPreferences.mutedRules.push(rule)
    this.save()
  }

  unmute(type: string, sourceProvider?: string): void {
    this.cachedPreferences.mutedRules = this.cachedPreferences.mutedRules.filter(rule => {
      if (rule.type !== type) return true
      if (sourceProvider === undefined) {
        return rule.sourceProvider !== undefined
      }
      return rule.sourceProvider !== sourceProvider
    })
    this.save()
  }

  checkAndSuggestMute(type: string, sourceProvider?: string): void {
    const stats = this.store.getDismissStats(type, sourceProvider, DISMISS_WINDOW_MS)

    if (stats.dismissed >= DISMISS_TRIGGER_COUNT && stats.total >= DISMISS_TRIGGER_COUNT) {
      if (!this.notificationEngine) return

      const sourceLabel = sourceProvider ? ` from ${sourceProvider}` : ''
      this.notificationEngine.store.create({
        type: 'system.suggestion',
        priority: 'low',
        source: { provider: 'preference-learner' },
        title: 'Mute this type of notification?',
        body: `You have dismissed ${stats.dismissed} ${type} notifications${sourceLabel} recently.`,
        groupKey: `suggest-mute:${type}:${sourceProvider ?? 'all'}`,
        actions: [
          { label: 'Mute', action: 'mute', payload: { type, sourceProvider } },
          { label: 'Dismiss', action: 'dismiss' },
        ],
        metadata: {},
      })
    }
  }

  getScheduledFocus(): ScheduledFocusConfig | undefined {
    return this.cachedPreferences.scheduledFocus
  }

  setScheduledFocus(config: ScheduledFocusConfig): void {
    this.cachedPreferences.scheduledFocus = config
    this.save()
  }

  getPreferences(): NotificationPreferences {
    return this.cachedPreferences
  }

  updatePreferences(updates: { mutedRules?: MutedRule[]; scheduledFocus?: ScheduledFocusConfig }): void {
    if (updates.mutedRules !== undefined) {
      this.cachedPreferences.mutedRules = updates.mutedRules
    }
    if (updates.scheduledFocus !== undefined) {
      this.cachedPreferences.scheduledFocus = updates.scheduledFocus
    }
    this.save()
  }

  private save(): void {
    try {
      const dir = path.dirname(this.prefsPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      const content = JSON.stringify(this.cachedPreferences, null, 2)
      fs.writeFileSync(this.tmpPath, content, 'utf-8')
      fs.renameSync(this.tmpPath, this.prefsPath)
    } catch (err) {
      logger.warn('preference-learner.save.failed-degraded-to-memory', { error: err })
    }
  }
}
