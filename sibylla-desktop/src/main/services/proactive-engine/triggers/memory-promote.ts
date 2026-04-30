import type { Trigger, EditorSnapshot, TriggerDeps, SuggestionDraft } from '../types'

export const memoryPromoteTrigger: Trigger = {
  id: 'memory-promote',
  description: 'Detect team convention patterns in current text',
  enabled: true,
  defaultCooldownMinutes: 60,

  condition: (snapshot: EditorSnapshot, deps: TriggerDeps): boolean => {
    const text = snapshot.contentSummary.recentText
    const hasConventionPattern =
      /我们决定|以后都用|团队规则|约定|standard|convention/.test(text)
    if (!hasConventionPattern) return false
    const isKnown = deps.knownMemoryPatterns.some((p) => text.includes(p))
    return !isKnown
  },

  buildDraft: (snapshot: EditorSnapshot, _deps: TriggerDeps): SuggestionDraft => ({
    triggerId: 'memory-promote',
    priority: 'normal',
    context: { filePath: snapshot.filePath },
    previewTitle: '这看起来像个团队约定，记到 MEMORY 里？',
  }),
}
