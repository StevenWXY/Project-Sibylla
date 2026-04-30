import type { Trigger, EditorSnapshot, TriggerDeps, SuggestionDraft } from '../types'

export const taskDecompositionTrigger: Trigger = {
  id: 'task-decomposition',
  description: 'Detect when user writes goals/requirements without a task list',
  enabled: true,
  defaultCooldownMinutes: 30,

  condition: (snapshot: EditorSnapshot, _deps: TriggerDeps): boolean => {
    const text = snapshot.contentSummary.recentText
    const hasGoalKeywords = /目标|要做|需求|计划|里程碑|scope/.test(text)
    const hasListFormat = /^[-*]\s|\d+\.\s/m.test(text)
    return hasGoalKeywords && !hasListFormat && snapshot.contentSummary.length > 200
  },

  buildDraft: (snapshot: EditorSnapshot, _deps: TriggerDeps): SuggestionDraft => ({
    triggerId: 'task-decomposition',
    priority: 'normal',
    context: { filePath: snapshot.filePath, contentLength: snapshot.contentSummary.length },
    previewTitle: '想要拆解任务吗？',
  }),
}
