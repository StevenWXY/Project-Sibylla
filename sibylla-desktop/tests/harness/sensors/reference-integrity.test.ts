/**
 * ReferenceIntegritySensor unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReferenceIntegritySensor } from '../../../src/main/services/harness/sensors/reference-integrity'
import type { AIChatResponse, AssembledContext } from '../../../src/shared/types'
import type { LocalRagSearchHit } from '../../../src/main/services/local-rag-engine'

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

describe('ReferenceIntegritySensor', () => {
  let mockFileManager: { exists: ReturnType<typeof vi.fn> }
  let mockRagEngine: { search: ReturnType<typeof vi.fn> } | null

  beforeEach(() => {
    vi.clearAllMocks()
    mockFileManager = { exists: vi.fn() }
    mockRagEngine = { search: vi.fn() }
  })

  it('should produce no signals for existing file references', async () => {
    mockFileManager.exists.mockResolvedValue(true)
    const sensor = new ReferenceIntegritySensor(
      mockFileManager as never,
      mockRagEngine as never,
    )

    const response = createResponse('See @[[src/utils/helper.ts]] for details.')
    const signals = await sensor.scan(response, mockContext)

    expect(signals).toHaveLength(0)
  })

  it('should produce error signal for non-existing file reference', async () => {
    mockFileManager.exists.mockResolvedValue(false)
    mockRagEngine!.search.mockResolvedValue([])
    const sensor = new ReferenceIntegritySensor(
      mockFileManager as never,
      mockRagEngine as never,
    )

    const response = createResponse('See @[[src/nonexistent/file.ts]] for details.')
    const signals = await sensor.scan(response, mockContext)

    expect(signals).toHaveLength(1)
    expect(signals[0]!.severity).toBe('error')
    expect(signals[0]!.message).toContain('src/nonexistent/file.ts')
    expect(signals[0]!.correctionHint).toBeDefined()
  })

  it('should produce no signals for existing skill reference', async () => {
    mockFileManager.exists.mockImplementation(async (p: string) => {
      if (p === '.sibylla/skills/my-skill/_index.md') return true
      return false
    })
    const sensor = new ReferenceIntegritySensor(
      mockFileManager as never,
      null,
    )

    const response = createResponse('Use the #my-skill skill for this.')
    const signals = await sensor.scan(response, mockContext)

    expect(signals).toHaveLength(0)
  })

  it('should produce error signal for non-existing skill reference', async () => {
    mockFileManager.exists.mockResolvedValue(false)
    const sensor = new ReferenceIntegritySensor(
      mockFileManager as never,
      null,
    )

    const response = createResponse('Use the #unknown-skill for this.')
    const signals = await sensor.scan(response, mockContext)

    expect(signals).toHaveLength(1)
    expect(signals[0]!.severity).toBe('error')
    expect(signals[0]!.message).toContain('#unknown-skill')
  })

  it('should produce no signals when response has no references', async () => {
    const sensor = new ReferenceIntegritySensor(
      mockFileManager as never,
      null,
    )

    const response = createResponse('This is a plain response with no references.')
    const signals = await sensor.scan(response, mockContext)

    expect(signals).toHaveLength(0)
  })

  it('should include RAG suggestion in correctionHint when similar file found', async () => {
    mockFileManager.exists.mockResolvedValue(false)
    const ragHits: LocalRagSearchHit[] = [
      { path: 'src/utils/helpers.ts', score: 0.85, snippet: 'export function helper()' },
    ]
    mockRagEngine!.search.mockResolvedValue(ragHits)

    const sensor = new ReferenceIntegritySensor(
      mockFileManager as never,
      mockRagEngine as never,
    )

    const response = createResponse('See @[[src/utils/helper.ts]] for details.')
    const signals = await sensor.scan(response, mockContext)

    expect(signals).toHaveLength(1)
    expect(signals[0]!.correctionHint).toContain('src/utils/helpers.ts')
  })
})
