import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CompactOrchestrator } from '../../src/main/services/compact/compact-orchestrator'
import { ReactiveCompact } from '../../src/main/services/compact/reactive-compact'

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

const mockCompactFn = vi.fn(async (messages: ReadonlyArray<{ role: string; content: string }>) => {
  return messages.slice(-3)
})

describe('CompactOrchestrator', () => {
  let orchestrator: CompactOrchestrator
  let reactiveCompact: ReactiveCompact

  beforeEach(() => {
    mockCompactFn.mockClear()
    reactiveCompact = new ReactiveCompact(estimateTokens, mockCompactFn)
    orchestrator = new CompactOrchestrator(reactiveCompact)
  })

  it('should identify 413 error as prompt_too_long', async () => {
    const result = await orchestrator.handleApiError(
      new Error('413 prompt_too_long'),
      [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hello' }],
      { conversationId: 'conv-1', workspacePath: '/workspace' },
    )

    expect(result.recovered).toBe(true)
    expect(mockCompactFn).toHaveBeenCalledOnce()
  })

  it('should identify max_output_tokens error', async () => {
    const result = await orchestrator.handleApiError(
      new Error('max_output_tokens exceeded'),
      [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hello' }],
      { conversationId: 'conv-1', workspacePath: '/workspace' },
    )

    expect(result.recovered).toBe(true)
    expect(result.escalatedMaxTokens).toBe(64000)
  })

  it('should return recovered=false for unrecognized errors', async () => {
    const messages = [{ role: 'user', content: 'hello' }]
    const result = await orchestrator.handleApiError(
      new Error('some random error'),
      messages,
      { conversationId: 'conv-1', workspacePath: '/workspace' },
    )

    expect(result.recovered).toBe(false)
    expect(result.messages).toEqual(messages)
  })

  it('should reset reactive compact for new turn', () => {
    orchestrator.resetForNewTurn()
    expect(reactiveCompact.hasCompactedThisTurn()).toBe(false)
  })
})
