import { describe, it, expect } from 'vitest'
import { reviewStaleTrigger } from '@main/services/proactive-engine/triggers/review-stale'
import type { EditorSnapshot, TriggerDeps } from '@main/services/proactive-engine/types'

function makeSnapshot(overrides: Partial<EditorSnapshot> = {}): EditorSnapshot {
  return {
    filePath: '/plans/roadmap-plan.md',
    contentSummary: { length: 500, recentText: '这是一份计划文档' },
    typingVelocity: 10,
    continuousTypingMinutes: 0.5,
    cursorPosition: 100,
    selectionLength: 0,
    lastInteractionAt: Date.now(),
    currentAiMode: 'write',
    isFocused: false,
    ...overrides,
  }
}

function makeDeps(updatedAtDaysAgo: number | null): TriggerDeps {
  return {
    searchEngine: { search: async () => ({ results: [] }) },
    memoryStore: { persistCooldown: async () => {} },
    fileStats: () =>
      updatedAtDaysAgo !== null
        ? { updatedAt: Date.now() - updatedAtDaysAgo * 24 * 60 * 60 * 1000, size: 1024 }
        : null,
    knownMemoryPatterns: [],
  }
}

describe('reviewStaleTrigger', () => {
  it('matches when file > 30 days old and path contains plan keyword', () => {
    expect(reviewStaleTrigger.condition(makeSnapshot(), makeDeps(45))).toBe(true)
  })

  it('does not match when file < 30 days old', () => {
    expect(reviewStaleTrigger.condition(makeSnapshot(), makeDeps(10))).toBe(false)
  })

  it('does not match when fileStats returns null', () => {
    expect(reviewStaleTrigger.condition(makeSnapshot(), makeDeps(null))).toBe(false)
  })

  it('does not match when path does not contain plan/spec keywords', () => {
    const snapshot = makeSnapshot({ filePath: '/notes/daily.md' })
    expect(reviewStaleTrigger.condition(snapshot, makeDeps(45))).toBe(false)
  })

  it('matches various plan keywords in path', () => {
    const paths = ['/spec/api.md', '/prd/v1.md', '/design/arch.md', '/方案/v2.md']
    for (const path of paths) {
      const snapshot = makeSnapshot({ filePath: path })
      expect(reviewStaleTrigger.condition(snapshot, makeDeps(45))).toBe(true)
    }
  })

  it('buildDraft returns correct draft with days', () => {
    const draft = reviewStaleTrigger.buildDraft(makeSnapshot(), makeDeps(45))
    expect(draft).not.toBeNull()
    expect(draft!.triggerId).toBe('review-stale')
    expect(draft!.previewTitle).toContain('45')
  })

  it('buildDraft returns null when fileStats returns null', () => {
    const draft = reviewStaleTrigger.buildDraft(makeSnapshot(), makeDeps(null))
    expect(draft).toBeNull()
  })
})
