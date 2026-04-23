import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReactiveCompact } from '../../src/main/services/compact/reactive-compact'

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function createMessages(count: number): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: 'System prompt' },
  ]
  for (let i = 0; i < count; i++) {
    messages.push({ role: 'user', content: `User message ${i} with some content to make it longer` })
    messages.push({ role: 'assistant', content: `Assistant response ${i} with some content` })
  }
  return messages
}

const mockCompactFn = vi.fn(async (messages: ReadonlyArray<{ role: string; content: string }>) => {
  return [
    messages[0],
    { role: 'user', content: '[compressed] ' + messages[messages.length - 2].content },
    { role: 'assistant', content: messages[messages.length - 1].content },
  ]
})

describe('ReactiveCompact', () => {
  let compact: ReactiveCompact

  beforeEach(() => {
    mockCompactFn.mockClear()
    compact = new ReactiveCompact(estimateTokens, mockCompactFn)
  })

  // prompt_too_long

  it('should trigger autoCompact on first prompt_too_long', async () => {
    const messages = createMessages(20)
    const result = await compact.tryRecover({
      type: 'prompt_too_long',
      error: new Error('413 prompt_too_long'),
      messagesAtFailure: messages,
    })

    expect(result.recovered).toBe(true)
    expect(result.strategy).toBe('auto_compact')
    expect(mockCompactFn).toHaveBeenCalledOnce()
  })

  it('should use aggressive truncate on second prompt_too_long', async () => {
    const messages = createMessages(30)

    await compact.tryRecover({
      type: 'prompt_too_long',
      error: new Error('413 prompt_too_long'),
      messagesAtFailure: messages,
    })

    const result = await compact.tryRecover({
      type: 'prompt_too_long',
      error: new Error('413 prompt_too_long'),
      messagesAtFailure: messages,
    })

    expect(result.recovered).toBe(true)
    expect(result.strategy).toBe('aggressive_truncate')
    expect(mockCompactFn).toHaveBeenCalledOnce()
  })

  it('should preserve first user message as anchor in aggressive truncate', async () => {
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: 'System' },
      { role: 'user', content: 'Original task description' },
    ]
    for (let i = 0; i < 15; i++) {
      messages.push({ role: 'assistant', content: `Response ${i}` })
      messages.push({ role: 'user', content: `Follow-up ${i}` })
    }

    compact = new ReactiveCompact(
      estimateTokens,
      vi.fn(async () => { throw new Error('compact failed') }),
    )

    // Force compactedThisTurn = true by calling once
    await compact.tryRecover({
      type: 'prompt_too_long',
      error: new Error('413'),
      messagesAtFailure: messages,
    })

    const result = await compact.tryRecover({
      type: 'prompt_too_long',
      error: new Error('413'),
      messagesAtFailure: messages,
    })

    expect(result.recovered).toBe(true)
    const anchorMsg = result.recoveredMessages.find(m => m.content.includes('Original task description'))
    expect(anchorMsg).toBeDefined()
  })

  // max_output_tokens

  it('should escalate max_tokens on first max_output_tokens', async () => {
    const messages = createMessages(5)
    const result = await compact.tryRecover({
      type: 'max_output_tokens',
      error: new Error('max_output_tokens exceeded'),
      messagesAtFailure: messages,
      originalMaxTokens: 4096,
    })

    expect(result.recovered).toBe(true)
    expect(result.strategy).toBe('escalate_max_tokens')
    expect(result.escalatedMaxTokens).toBe(64000)
  })

  it('should inject continue meta message on second max_output_tokens', async () => {
    const messages = createMessages(5)

    await compact.tryRecover({
      type: 'max_output_tokens',
      error: new Error('max_output_tokens'),
      messagesAtFailure: messages,
    })

    const result = await compact.tryRecover({
      type: 'max_output_tokens',
      error: new Error('max_output_tokens'),
      messagesAtFailure: messages,
    })

    expect(result.recovered).toBe(true)
    expect(result.strategy).toBe('inject_continue_meta')
    expect(result.metaMessage).toBe('从上次中断处继续')
  })

  it('should fail on third max_output_tokens retry', async () => {
    const messages = createMessages(5)

    await compact.tryRecover({ type: 'max_output_tokens', error: new Error('max_output_tokens'), messagesAtFailure: messages })
    await compact.tryRecover({ type: 'max_output_tokens', error: new Error('max_output_tokens'), messagesAtFailure: messages })
    const result = await compact.tryRecover({ type: 'max_output_tokens', error: new Error('max_output_tokens'), messagesAtFailure: messages })

    expect(result.recovered).toBe(false)
  })

  // max retries

  it('should stop after 3 total retries', async () => {
    const messages = createMessages(5)

    await compact.tryRecover({ type: 'media_size', error: new Error('media_size'), messagesAtFailure: messages })
    await compact.tryRecover({ type: 'media_size', error: new Error('media_size'), messagesAtFailure: messages })
    await compact.tryRecover({ type: 'media_size', error: new Error('media_size'), messagesAtFailure: messages })

    const result = await compact.tryRecover({ type: 'prompt_too_long', error: new Error('413'), messagesAtFailure: messages })
    expect(result.recovered).toBe(false)
    expect(result.strategy).toBe('max_retries_exceeded')
  })

  // reset

  it('should reset retry count', async () => {
    const messages = createMessages(5)

    await compact.tryRecover({ type: 'media_size', error: new Error('media_size'), messagesAtFailure: messages })
    await compact.tryRecover({ type: 'media_size', error: new Error('media_size'), messagesAtFailure: messages })
    await compact.tryRecover({ type: 'media_size', error: new Error('media_size'), messagesAtFailure: messages })

    compact.resetRetryCount()

    const result = await compact.tryRecover({ type: 'media_size', error: new Error('media_size'), messagesAtFailure: messages })
    expect(result.recovered).toBe(true)
  })

  // history

  it('should record recovery attempts in history', async () => {
    const messages = createMessages(5)

    await compact.tryRecover({ type: 'media_size', error: new Error('media_size'), messagesAtFailure: messages })

    const history = compact.getRecoveryHistory()
    expect(history).toHaveLength(1)
    expect(history[0].strategy).toBe('media_truncate')
    expect(history[0].success).toBe(true)
  })
})
