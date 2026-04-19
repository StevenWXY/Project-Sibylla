/**
 * SpecComplianceSensor unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SpecComplianceSensor } from '../../../src/main/services/harness/sensors/spec-compliance'
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

describe('SpecComplianceSensor', () => {
  let sensor: SpecComplianceSensor

  beforeEach(() => {
    sensor = new SpecComplianceSensor()
  })

  it('should produce no signals for clean response', async () => {
    const response = createResponse([
      'function greet(name: string): string {',
      '  return `Hello, ${name}!`',
      '}',
    ].join('\n'))

    const signals = await sensor.scan(response, mockContext)
    expect(signals).toHaveLength(0)
  })

  it('should produce error signal for `any` type usage', async () => {
    const response = createResponse('const value: any = getData()')

    const signals = await sensor.scan(response, mockContext)

    expect(signals).toHaveLength(1)
    expect(signals[0]!.severity).toBe('error')
    expect(signals[0]!.message).toContain('any')
    expect(signals[0]!.correctionHint).toBeDefined()
  })

  it('should produce error signal for `rm -rf` command', async () => {
    const response = createResponse('Run rm -rf /tmp/old-builds to clean up.')

    const signals = await sensor.scan(response, mockContext)

    expect(signals).toHaveLength(1)
    expect(signals[0]!.severity).toBe('error')
    expect(signals[0]!.message).toContain('irreversible')
  })

  it('should produce error signal for direct writeFileSync without temp', async () => {
    const response = createResponse("writeFileSync('/data/config.json', JSON.stringify(config))")

    const signals = await sensor.scan(response, mockContext)

    expect(signals).toHaveLength(1)
    expect(signals[0]!.severity).toBe('error')
    expect(signals[0]!.message).toContain('Atomic Write')
  })

  it('should produce no signal for writeFileSync with temp in args', async () => {
    const response = createResponse("writeFileSync('/data/temp-config.json', JSON.stringify(config))")

    const signals = await sensor.scan(response, mockContext)

    const atomicSignal = signals.find(s => s.message.includes('Atomic Write'))
    expect(atomicSignal).toBeUndefined()
  })

  it('should produce error signal for private binary format suggestion', async () => {
    const response = createResponse('We should use a private binary format for storage.')

    const signals = await sensor.scan(response, mockContext)

    expect(signals).toHaveLength(1)
    expect(signals[0]!.severity).toBe('error')
    expect(signals[0]!.message).toContain('File as Truth')
  })
})
