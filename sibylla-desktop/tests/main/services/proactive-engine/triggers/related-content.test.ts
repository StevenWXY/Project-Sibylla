import { describe, it, expect } from 'vitest'
import { relatedContentTrigger } from '@main/services/proactive-engine/triggers/related-content'
import type { EditorSnapshot, TriggerDeps } from '@main/services/proactive-engine/types'

function makeSnapshot(overrides: Partial<EditorSnapshot> = {}): EditorSnapshot {
  return {
    filePath: '/my-plan.md',
    contentSummary: { length: 50, recentText: '刚开始写' },
    typingVelocity: 10,
    continuousTypingMinutes: 0.5,
    cursorPosition: 10,
    selectionLength: 0,
    lastInteractionAt: Date.now(),
    currentAiMode: 'write',
    isFocused: false,
    ...overrides,
  }
}

const mockDeps: TriggerDeps = {
  searchEngine: {
    search: async () => ({
      results: [
        { filePath: '/plan-a.md' },
        { filePath: '/plan-b.md' },
        { filePath: '/plan-c.md' },
        { filePath: '/plan-d.md' },
      ],
    }),
  },
  memoryStore: { persistCooldown: async () => {} },
  fileStats: () => null,
  knownMemoryPatterns: [],
}

describe('relatedContentTrigger', () => {
  it('matches when length < 100 and fileName >= 2 chars', () => {
    const snapshot = makeSnapshot()
    expect(relatedContentTrigger.condition(snapshot, mockDeps)).toBe(true)
  })

  it('does not match when length > 100', () => {
    const snapshot = makeSnapshot({
      contentSummary: { length: 200, recentText: 'x'.repeat(200) },
    })
    expect(relatedContentTrigger.condition(snapshot, mockDeps)).toBe(false)
  })

  it('does not match when fileName < 2 chars', () => {
    const snapshot = makeSnapshot({ filePath: '/a.md' })
    expect(relatedContentTrigger.condition(snapshot, mockDeps)).toBe(false)
  })

  it('buildDraft returns null when search results < 3', async () => {
    const deps: TriggerDeps = {
      ...mockDeps,
      searchEngine: {
        search: async () => ({ results: [{ filePath: '/one.md' }] }),
      },
    }
    const snapshot = makeSnapshot()
    const draft = await relatedContentTrigger.buildDraft(snapshot, deps)
    expect(draft).toBeNull()
  })

  it('buildDraft returns draft when search results >= 3', async () => {
    const snapshot = makeSnapshot()
    const draft = await relatedContentTrigger.buildDraft(snapshot, mockDeps)
    expect(draft).not.toBeNull()
    expect(draft!.triggerId).toBe('related-content')
    expect(draft!.previewTitle).toContain('相关文档')
  })
})
