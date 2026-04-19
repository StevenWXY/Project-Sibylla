/**
 * MarkdownFormatSensor unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MarkdownFormatSensor } from '../../../src/main/services/harness/sensors/markdown-format'
import type { AIChatResponse, AssembledContext } from '../../../src/shared/types'

const mockContext: AssembledContext = {
  layers: [],
  systemPrompt: 'System prompt',
  totalTokens: 100,
  budgetUsed: 100,
  budgetTotal: 16000,
  sources: [],
  warnings: [],
}

function createResponse(content: string): AIChatResponse {
  return {
    id: 'resp-1',
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    content,
    usage: { inputTokens: 50, outputTokens: 30, totalTokens: 80, estimatedCostUsd: 0.001 },
    intercepted: false,
    warnings: [],
    ragHits: [],
    memory: { tokenCount: 0, tokenDebt: 0, flushTriggered: false },
  }
}

describe('MarkdownFormatSensor', () => {
  let sensor: MarkdownFormatSensor

  beforeEach(() => {
    sensor = new MarkdownFormatSensor()
  })

  it('should produce no signals for valid markdown', async () => {
    const response = createResponse([
      '## Heading',
      '',
      'Some paragraph text.',
      '',
      '```ts',
      'const x = 1',
      '```',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '[Link](https://example.com)',
    ].join('\n'))

    const signals = await sensor.scan(response, mockContext)
    expect(signals).toHaveLength(0)
  })

  it('should produce error signal for unclosed code block with line number', async () => {
    const response = createResponse([
      'Some text',
      '```ts',
      'const x = 1',
    ].join('\n'))

    const signals = await sensor.scan(response, mockContext)

    expect(signals).toHaveLength(1)
    expect(signals[0]!.severity).toBe('error')
    expect(signals[0]!.location?.line).toBeDefined()
  })

  it('should produce warn signal for inconsistent table pipes', async () => {
    const response = createResponse([
      '| A | B | C |',
      '| --- | --- |',
      '| 1 | 2 |',
    ].join('\n'))

    const signals = await sensor.scan(response, mockContext)

    const tableSignal = signals.find(s => s.message.includes('pipes'))
    expect(tableSignal).toBeDefined()
    expect(tableSignal!.severity).toBe('warn')
  })

  it('should produce warn signal for heading skip H2 to H4', async () => {
    const response = createResponse([
      '## Heading 2',
      '',
      '#### Heading 4',
    ].join('\n'))

    const signals = await sensor.scan(response, mockContext)

    const headingSignal = signals.find(s => s.message.includes('Heading level skip'))
    expect(headingSignal).toBeDefined()
    expect(headingSignal!.severity).toBe('warn')
  })

  it('should produce warn signal for unclosed link', async () => {
    const response = createResponse('Check out [this link]( for details.')

    const signals = await sensor.scan(response, mockContext)

    const linkSignal = signals.find(s => s.message.includes('Unclosed link'))
    expect(linkSignal).toBeDefined()
    expect(linkSignal!.severity).toBe('warn')
  })

  it('should detect multiple issues in one response', async () => {
    const response = createResponse([
      '## Heading 2',
      '',
      '#### Heading 4',
      '',
      '```ts',
      'const x = 1',
    ].join('\n'))

    const signals = await sensor.scan(response, mockContext)

    expect(signals.length).toBeGreaterThanOrEqual(2)
    const severities = signals.map(s => s.severity)
    expect(severities).toContain('error')
    expect(severities).toContain('warn')
  })
})
