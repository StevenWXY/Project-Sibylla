import { describe, it, expect } from 'vitest'
import { MarkdownRenderer } from '../../src/main/services/export/markdown-renderer'
import type { ConversationData, ExportOptions } from '../../src/main/services/export/types'

function makeData(messages: Partial<ConversationData> = {}): ConversationData {
  return {
    id: 'conv-001',
    title: 'Test Conversation',
    messages: [
      { id: 'm1', role: 'user', content: 'Hello world', createdAt: '2026-04-22T14:30:00.000Z' },
      { id: 'm2', role: 'assistant', content: 'Hi there!', createdAt: '2026-04-22T14:30:05.000Z', model: 'claude-sonnet-4-20250514', aiModeId: 'chat' },
    ],
    createdAt: '2026-04-22T14:30:00.000Z',
    updatedAt: '2026-04-22T14:31:00.000Z',
    ...messages,
  }
}

function makeOptions(overrides: Partial<ExportOptions> = {}): ExportOptions {
  return {
    format: 'markdown',
    conversationId: 'conv-001',
    includeMetadata: true,
    includeReferencedFiles: false,
    applyRedaction: false,
    targetPath: '/tmp/test.md',
    ...overrides,
  }
}

describe('MarkdownRenderer', () => {
  it('render with metadata — YAML frontmatter + messages', () => {
    const renderer = new MarkdownRenderer()
    const result = renderer.render(makeData(), makeOptions())
    expect(result).toContain('---')
    expect(result).toContain('title: "Test Conversation"')
    expect(result).toContain('message_count: 2')
    expect(result).toContain('# Test Conversation')
    expect(result).toContain('**You**')
    expect(result).toContain('**AI**')
  })

  it('render without metadata — no frontmatter', () => {
    const renderer = new MarkdownRenderer()
    const result = renderer.render(makeData(), makeOptions({ includeMetadata: false }))
    expect(result).not.toContain('title:')
    expect(result).not.toContain('exported_at:')
    expect(result).toContain('# Test Conversation')
    expect(result).toContain('**You**')
    expect(result).toContain('**AI**')
  })

  it('render message roles — user shows "You", assistant shows "AI"', () => {
    const renderer = new MarkdownRenderer()
    const result = renderer.render(makeData(), makeOptions({ includeMetadata: false }))
    expect(result).toContain('**You**')
    expect(result).toContain('**AI**')
  })

  it('render mode labels when includeMetadata', () => {
    const renderer = new MarkdownRenderer()
    const result = renderer.render(makeData(), makeOptions({ includeMetadata: true }))
    expect(result).toContain('(chat)')
  })

  it('render trace links when includeMetadata', () => {
    const renderer = new MarkdownRenderer()
    const data = makeData({
      messages: [
        { id: 'm1', role: 'user', content: 'Hi', createdAt: '2026-04-22T14:30:00.000Z' },
        { id: 'm2', role: 'assistant', content: 'Hello', createdAt: '2026-04-22T14:30:05.000Z', traceId: 'trace-abc' },
      ],
    })
    const result = renderer.render(data, makeOptions({ includeMetadata: true }))
    expect(result).toContain('Trace: trace-abc')
  })
})
