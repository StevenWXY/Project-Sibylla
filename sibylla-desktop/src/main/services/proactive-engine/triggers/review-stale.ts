import type { Trigger, EditorSnapshot, TriggerDeps, SuggestionDraft } from '../types'

export const reviewStaleTrigger: Trigger = {
  id: 'review-stale',
  description: 'Remind review for Plan/Spec documents not updated in 30+ days',
  enabled: true,
  defaultCooldownMinutes: 60,

  condition: (snapshot: EditorSnapshot, deps: TriggerDeps): boolean => {
    const stats = deps.fileStats(snapshot.filePath)
    if (!stats) return false
    const daysSinceUpdate = (Date.now() - stats.updatedAt) / (1000 * 60 * 60 * 24)
    if (daysSinceUpdate < 30) return false
    const isPlanOrSpec = /plan|spec|prd|design|架构|方案/i.test(snapshot.filePath)
    return isPlanOrSpec
  },

  buildDraft: (snapshot: EditorSnapshot, deps: TriggerDeps): SuggestionDraft | null => {
    const stats = deps.fileStats(snapshot.filePath)
    if (!stats) return null
    const daysSinceUpdate = Math.floor(
      (Date.now() - stats.updatedAt) / (1000 * 60 * 60 * 24),
    )
    return {
      triggerId: 'review-stale',
      priority: 'normal',
      context: { filePath: snapshot.filePath, daysSinceUpdate },
      previewTitle: `这份文档已经 ${daysSinceUpdate} 天没更新，要不要审查一下？`,
    }
  },
}
