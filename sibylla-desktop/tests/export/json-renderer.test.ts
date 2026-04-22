import { describe, it, expect } from 'vitest'
import { JsonRenderer } from '../../src/main/services/export/json-renderer'
import type { ConversationData, ExportOptions } from '../../src/main/services/export/types'

function makeData(messages: Partial<ConversationData> = {}): ConversationData {
  return {
    id: 'conv-001',
    title: 'Test Conversation',
    messages: [
      { id: 'm1', role: 'user', content: 'Hello', createdAt: '2026-04-22T14:30:00.000Z' },
      { id: 'm2', role: 'assistant', content: 'Hi!', createdAt: '2026-04-22T14:30:05.000Z', model: 'gpt-4o' },
    ],
    createdAt: '2026-04-22T14:30:00.000Z',
    updatedAt: '2026-04-22T14:31:00.000Z',
    ...messages,
  }
}

function makeOptions(overrides: Partial<ExportOptions> = {}): ExportOptions {
  return {
    format: 'json',
    conversationId: 'conv-001',
    includeMetadata: true,
    includeReferencedFiles: false,
    applyRedaction: false,
    targetPath: '/tmp/test.json',
    ...overrides,
  }
}

describe('JsonRenderer', () => {
  it('render valid json — output can be parsed', () => {
    const renderer = new JsonRenderer()
    const result = renderer.render(makeData(), makeOptions())
    const parsed = JSON.parse(result)
    expect(parsed).toBeDefined()
  })

  it('render includes version — version: 1', () => {
    const renderer = new JsonRenderer()
    const result = renderer.render(makeData(), makeOptions())
    const parsed = JSON.parse(result)
    expect(parsed.version).toBe(1)
  })

  it('render includes all messages', () => {
    const renderer = new JsonRenderer()
    const result = renderer.render(makeData(), makeOptions())
    const parsed = JSON.parse(result)
    expect(parsed.conversation.messages).toHaveLength(2)
  })

  it('render metadata when enabled — includes model/aiModeId', () => {
    const renderer = new JsonRenderer()
    const result = renderer.render(makeData(), makeOptions({ includeMetadata: true }))
    const parsed = JSON.parse(result)
    const msg = parsed.conversation.messages[1]
    expect(msg.model).toBe('gpt-4o')
  })

  it('render no metadata when disabled — only id/role/content', () => {
    const renderer = new JsonRenderer()
    const result = renderer.render(makeData(), makeOptions({ includeMetadata: false }))
    const parsed = JSON.parse(result)
    const msg = parsed.conversation.messages[1]
    expect(msg.model).toBeUndefined()
    expect(msg.createdAt).toBeUndefined()
  })
})
