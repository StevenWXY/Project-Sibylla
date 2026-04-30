import { describe, it, expect } from 'vitest'
import { InterruptPolicy } from '@main/services/proactive-engine/interrupt-policy'
import { DEFAULT_PROACTIVE_CONFIG } from '@main/services/proactive-engine/constants'
import type { InterruptContext } from '@main/services/proactive-engine/types'

function makeContext(overrides: Partial<InterruptContext> = {}): InterruptContext {
  return {
    snapshot: {
      filePath: '/test.md',
      contentSummary: { length: 100, recentText: 'test' },
      typingVelocity: 20,
      continuousTypingMinutes: 1,
      cursorPosition: 10,
      selectionLength: 0,
      lastInteractionAt: Date.now(),
      currentAiMode: 'write',
      isFocused: false,
    },
    lastSuggestionAt: null,
    isFocused: false,
    isTaskRunning: false,
    isFullscreen: false,
    currentAiMode: 'write',
    ...overrides,
  }
}

describe('InterruptPolicy', () => {
  it('allows when all conditions pass', () => {
    const policy = new InterruptPolicy(DEFAULT_PROACTIVE_CONFIG)
    const result = policy.canInterrupt(makeContext())
    expect(result.allowed).toBe(true)
  })

  it('suppresses when typing velocity > 50', () => {
    const policy = new InterruptPolicy(DEFAULT_PROACTIVE_CONFIG)
    const result = policy.canInterrupt(
      makeContext({
        snapshot: {
          ...makeContext().snapshot,
          typingVelocity: 60,
        },
      }),
    )
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('deep-focus-high-velocity')
  })

  it('suppresses when continuous typing > 5 minutes', () => {
    const policy = new InterruptPolicy(DEFAULT_PROACTIVE_CONFIG)
    const result = policy.canInterrupt(
      makeContext({
        snapshot: {
          ...makeContext().snapshot,
          continuousTypingMinutes: 6,
        },
      }),
    )
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('deep-focus-continuous')
  })

  it('suppresses when last suggestion < 5 minutes ago', () => {
    const policy = new InterruptPolicy(DEFAULT_PROACTIVE_CONFIG)
    const result = policy.canInterrupt(
      makeContext({ lastSuggestionAt: Date.now() - 60000 }),
    )
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('global-cooldown')
  })

  it('allows when last suggestion >= 5 minutes ago', () => {
    const policy = new InterruptPolicy(DEFAULT_PROACTIVE_CONFIG)
    const result = policy.canInterrupt(
      makeContext({ lastSuggestionAt: Date.now() - 6 * 60 * 1000 }),
    )
    expect(result.allowed).toBe(true)
  })

  it('suppresses when focused', () => {
    const policy = new InterruptPolicy(DEFAULT_PROACTIVE_CONFIG)
    const result = policy.canInterrupt(makeContext({ isFocused: true }))
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('focus-mode-active')
  })

  it('suppresses when task is running', () => {
    const policy = new InterruptPolicy(DEFAULT_PROACTIVE_CONFIG)
    const result = policy.canInterrupt(makeContext({ isTaskRunning: true }))
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('task-executing')
  })

  it('suppresses when fullscreen', () => {
    const policy = new InterruptPolicy(DEFAULT_PROACTIVE_CONFIG)
    const result = policy.canInterrupt(makeContext({ isFullscreen: true }))
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('fullscreen')
  })

  it('suppresses when aiMode=plan and task running', () => {
    const policy = new InterruptPolicy({
      ...DEFAULT_PROACTIVE_CONFIG,
      interruptPolicy: {
        suppressDuringTaskExecution: false,
        suppressInDeepFocus: false,
        suppressDuringFocusMode: true,
      },
    })
    const result = policy.canInterrupt(
      makeContext({ currentAiMode: 'plan', isTaskRunning: true }),
    )
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('plan-mode-task-running')
  })

  it('returns first matching suppression reason', () => {
    const policy = new InterruptPolicy(DEFAULT_PROACTIVE_CONFIG)
    const result = policy.canInterrupt(
      makeContext({
        snapshot: { ...makeContext().snapshot, typingVelocity: 60 },
        isFullscreen: true,
      }),
    )
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('deep-focus-high-velocity')
  })

  it('updateConfig changes behavior', () => {
    const policy = new InterruptPolicy(DEFAULT_PROACTIVE_CONFIG)
    policy.updateConfig({
      interruptPolicy: { suppressInDeepFocus: false, suppressDuringFocusMode: true, suppressDuringTaskExecution: true },
    })
    const result = policy.canInterrupt(
      makeContext({
        snapshot: { ...makeContext().snapshot, typingVelocity: 60 },
      }),
    )
    expect(result.allowed).toBe(true)
  })
})
