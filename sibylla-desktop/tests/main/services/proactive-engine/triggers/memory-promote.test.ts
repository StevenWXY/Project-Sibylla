import { describe, it, expect } from 'vitest'
import { memoryPromoteTrigger } from '@main/services/proactive-engine/triggers/memory-promote'
import type { EditorSnapshot, TriggerDeps } from '@main/services/proactive-engine/types'

function makeSnapshot(overrides: Partial<EditorSnapshot> = {}): EditorSnapshot {
  return {
    filePath: '/notes.md',
    contentSummary: { length: 100, recentText: '我们决定以后都用 TypeScript strict mode' },
    typingVelocity: 10,
    continuousTypingMinutes: 0.5,
    cursorPosition: 50,
    selectionLength: 0,
    lastInteractionAt: Date.now(),
    currentAiMode: 'write',
    isFocused: false,
    ...overrides,
  }
}

function makeDeps(knownPatterns: string[] = []): TriggerDeps {
  return {
    searchEngine: { search: async () => ({ results: [] }) },
    memoryStore: { persistCooldown: async () => {} },
    fileStats: () => null,
    knownMemoryPatterns: knownPatterns,
  }
}

describe('memoryPromoteTrigger', () => {
  it('matches when text has convention pattern and not in known patterns', () => {
    expect(memoryPromoteTrigger.condition(makeSnapshot(), makeDeps())).toBe(true)
  })

  it('does not match when no convention pattern', () => {
    const snapshot = makeSnapshot({
      contentSummary: { length: 100, recentText: '这是一段普通的文本' },
    })
    expect(memoryPromoteTrigger.condition(snapshot, makeDeps())).toBe(false)
  })

  it('does not match when pattern is already known', () => {
    expect(
      memoryPromoteTrigger.condition(
        makeSnapshot(),
        makeDeps(['TypeScript strict mode']),
      ),
    ).toBe(false)
  })

  it('matches various convention keywords', () => {
    const keywords = ['以后都用', '团队规则', '约定', 'standard', 'convention']
    for (const keyword of keywords) {
      const snapshot = makeSnapshot({
        contentSummary: { length: 100, recentText: `我们${keyword}这个东西` },
      })
      expect(memoryPromoteTrigger.condition(snapshot, makeDeps())).toBe(true)
    }
  })

  it('buildDraft returns correct draft', () => {
    const draft = memoryPromoteTrigger.buildDraft(makeSnapshot(), makeDeps())
    expect(draft).not.toBeNull()
    expect(draft!.triggerId).toBe('memory-promote')
    expect(draft!.previewTitle).toContain('MEMORY')
  })
})
