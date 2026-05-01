import { describe, it, expect } from 'vitest'
import { taskDecompositionTrigger } from '@main/services/proactive-engine/triggers/task-decomposition'
import type { EditorSnapshot, TriggerDeps } from '@main/services/proactive-engine/types'

function makeSnapshot(overrides: Partial<EditorSnapshot> = {}): EditorSnapshot {
  return {
    filePath: '/test.md',
    contentSummary: { length: 300, recentText: '这是我们的目标，需要完成这个需求' },
    typingVelocity: 20,
    continuousTypingMinutes: 1,
    cursorPosition: 100,
    selectionLength: 0,
    lastInteractionAt: Date.now(),
    currentAiMode: 'write',
    isFocused: false,
    ...overrides,
  }
}

const mockDeps: TriggerDeps = {
  searchEngine: { search: async () => ({ results: [] }) },
  memoryStore: { persistCooldown: async () => {} },
  fileStats: () => null,
  knownMemoryPatterns: [],
}

describe('taskDecompositionTrigger', () => {
  it('matches when text has goal keywords, no list format, and length > 200', () => {
    const snapshot = makeSnapshot()
    expect(taskDecompositionTrigger.condition(snapshot, mockDeps)).toBe(true)
  })

  it('does not match when text has list format', () => {
    const snapshot = makeSnapshot({
      contentSummary: { length: 300, recentText: '这是我们的目标\n- 任务一\n- 任务二' },
    })
    expect(taskDecompositionTrigger.condition(snapshot, mockDeps)).toBe(false)
  })

  it('does not match when length <= 200', () => {
    const snapshot = makeSnapshot({
      contentSummary: { length: 100, recentText: '这是我们的目标' },
    })
    expect(taskDecompositionTrigger.condition(snapshot, mockDeps)).toBe(false)
  })

  it('does not match when no goal keywords', () => {
    const snapshot = makeSnapshot({
      contentSummary: { length: 300, recentText: '这是一段普通的文本没有任何关键词' },
    })
    expect(taskDecompositionTrigger.condition(snapshot, mockDeps)).toBe(false)
  })

  it('buildDraft returns correct draft', () => {
    const snapshot = makeSnapshot()
    const draft = taskDecompositionTrigger.buildDraft(snapshot, mockDeps)
    expect(draft).not.toBeNull()
    expect(draft!.triggerId).toBe('task-decomposition')
    expect(draft!.priority).toBe('normal')
    expect(draft!.previewTitle).toBe('检测到可能的待办任务')
  })

  it('matches various goal keywords', () => {
    const keywords = ['要做', '计划', '里程碑', 'scope']
    for (const keyword of keywords) {
      const snapshot = makeSnapshot({
        contentSummary: { length: 300, recentText: `这是我们的${keyword}内容` },
      })
      expect(taskDecompositionTrigger.condition(snapshot, mockDeps)).toBe(true)
    }
  })
})
