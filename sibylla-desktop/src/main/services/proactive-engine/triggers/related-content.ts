import type { Trigger, EditorSnapshot, TriggerDeps, SuggestionDraft } from '../types'

export const relatedContentTrigger: Trigger = {
  id: 'related-content',
  description: 'Search for related documents when user starts writing a new document',
  enabled: true,
  defaultCooldownMinutes: 30,

  condition: (snapshot: EditorSnapshot, _deps: TriggerDeps): boolean => {
    if (snapshot.contentSummary.length > 100) return false
    const fileName = snapshot.filePath.split('/').pop()?.replace('.md', '') ?? ''
    if (fileName.length < 2) return false
    return true
  },

  buildDraft: async (
    snapshot: EditorSnapshot,
    deps: TriggerDeps,
  ): Promise<SuggestionDraft | null> => {
    const fileName = snapshot.filePath.split('/').pop()?.replace('.md', '') ?? ''
    const response = await deps.searchEngine.search(fileName, { limit: 5 })
    const results = response.results ?? response
    if (!Array.isArray(results) || results.length < 3) return null
    return {
      triggerId: 'related-content',
      priority: 'normal',
      context: { relatedFiles: results.slice(0, 5).map((r: { filePath: string }) => r.filePath) },
      previewTitle: `找到 ${results.length} 篇相关文档，要不要参考？`,
    }
  },
}
