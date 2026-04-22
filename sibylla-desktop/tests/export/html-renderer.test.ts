import { describe, it, expect } from 'vitest'
import { HtmlRenderer } from '../../src/main/services/export/html-renderer'
import type { ConversationData, ExportOptions } from '../../src/main/services/export/types'

function makeData(messages: Partial<ConversationData> = {}): ConversationData {
  return {
    id: 'conv-001',
    title: 'Test Conversation',
    messages: [
      { id: 'm1', role: 'user', content: 'Hello <script>alert(1)</script>', createdAt: '2026-04-22T14:30:00.000Z' },
      { id: 'm2', role: 'assistant', content: 'Hi **bold** and `code`', createdAt: '2026-04-22T14:30:05.000Z' },
    ],
    createdAt: '2026-04-22T14:30:00.000Z',
    updatedAt: '2026-04-22T14:31:00.000Z',
    ...messages,
  }
}

function makeOptions(overrides: Partial<ExportOptions> = {}): ExportOptions {
  return {
    format: 'html',
    conversationId: 'conv-001',
    includeMetadata: true,
    includeReferencedFiles: false,
    applyRedaction: false,
    targetPath: '/tmp/test.html',
    ...overrides,
  }
}

describe('HtmlRenderer', () => {
  it('render self-contained — no external CSS/JS references', () => {
    const renderer = new HtmlRenderer()
    const result = renderer.render(makeData(), makeOptions())
    expect(result).toContain('<style>')
    expect(result).not.toMatch(/<link[^>]+stylesheet/)
    expect(result).not.toMatch(/<script[^>]+src=/)
  })

  it('render valid html — DOCTYPE + html + head + body', () => {
    const renderer = new HtmlRenderer()
    const result = renderer.render(makeData(), makeOptions())
    expect(result).toContain('<!DOCTYPE html>')
    expect(result).toContain('<html')
    expect(result).toContain('<head>')
    expect(result).toContain('<body>')
  })

  it('render attribution — contains "Sibylla"', () => {
    const renderer = new HtmlRenderer()
    const result = renderer.render(makeData(), makeOptions())
    expect(result).toContain('<strong>Sibylla</strong>')
  })

  it('escape html in content — <script> is escaped', () => {
    const renderer = new HtmlRenderer()
    const result = renderer.render(makeData(), makeOptions())
    expect(result).not.toContain('<script>alert(1)</script>')
    expect(result).toContain('&lt;script&gt;')
  })

  it('render basic markdown — bold and code', () => {
    const renderer = new HtmlRenderer()
    const result = renderer.render(makeData(), makeOptions())
    expect(result).toContain('<strong>bold</strong>')
    expect(result).toContain('<code>code</code>')
  })

  it('render message bubbles — user and assistant different classes', () => {
    const renderer = new HtmlRenderer()
    const result = renderer.render(makeData(), makeOptions())
    expect(result).toContain('class="message user"')
    expect(result).toContain('class="message assistant"')
  })
})
