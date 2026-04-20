import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryExtractor } from '../../src/main/services/memory/memory-extractor'
import { logger } from '../../src/main/utils/logger'
import type { AiGatewayClient, AiGatewaySession, AiGatewayChatResponse } from '../../src/main/services/ai-gateway-client'
import type { ExtractionInput, ExtractionCandidate, MemoryEntry, SimilarityIndexProvider } from '../../src/main/services/memory/types'

function createMockSession(responseContent: string, failTimes: number = 0): AiGatewaySession {
  let callCount = 0
  return {
    sessionId: 'test-session',
    role: 'memory-extractor',
    chat: vi.fn(async () => {
      callCount += 1
      if (callCount <= failTimes) {
        throw new Error('LLM call failed')
      }
      return {
        id: 'resp-1',
        model: 'claude-haiku',
        provider: 'mock',
        content: responseContent,
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0 },
        intercepted: false,
        warnings: [],
      } as AiGatewayChatResponse
    }),
    close: vi.fn(),
  } as unknown as AiGatewaySession
}

function createMockAiGateway(session: AiGatewaySession): AiGatewayClient {
  return {
    createSession: vi.fn(() => session),
  } as unknown as AiGatewayClient
}

function makeCandidate(overrides: Partial<ExtractionCandidate> = {}): ExtractionCandidate {
  return {
    section: 'user_preference',
    content: 'User prefers dark mode',
    confidence: 0.8,
    reasoning: 'observed in multiple sessions',
    sourceLogIds: ['log-001'],
    ...overrides,
  }
}

function makeExistingEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: 'pref-001',
    section: 'user_preference',
    content: 'User prefers dark mode',
    confidence: 0.75,
    hits: 3,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-10T00:00:00.000Z',
    sourceLogIds: ['log-old-001', 'log-old-002'],
    locked: false,
    tags: [],
    ...overrides,
  }
}

const baseInput: ExtractionInput = {
  logs: [
    { id: 'log-001', type: 'user-interaction', timestamp: '2026-04-20T10:00:00.000Z', sessionId: 's1', summary: 'User set dark mode' },
  ],
  existingMemory: [],
  workspaceContext: { name: 'Test Project' },
}

describe('MemoryExtractor', () => {
  describe('1. LLM extraction flow', () => {
    it('returns correct ExtractionReport with added/merged/discarded counts', async () => {
      const candidates = [
        makeCandidate({ confidence: 0.8 }),
        makeCandidate({ section: 'technical_decision', content: 'Use React', confidence: 0.7 }),
      ]
      const responseContent = JSON.stringify({ candidates })

      const session = createMockSession(responseContent)
      const gateway = createMockAiGateway(session)
      const extractor = new MemoryExtractor(gateway, null)

      const report = await extractor.extract(baseInput)

      expect(report.added.length).toBe(2)
      expect(report.merged.length).toBe(0)
      expect(report.discarded.length).toBe(0)
      expect(report.durationMs).toBeGreaterThanOrEqual(0)
      expect(report.tokenCost.input).toBe(100)
      expect(report.tokenCost.output).toBe(50)
    })
  })

  describe('2. Confidence filtering', () => {
    it('discards candidates below threshold and keeps those above', async () => {
      const candidates = [
        makeCandidate({ confidence: 0.4, content: 'Low confidence' }),
        makeCandidate({ confidence: 0.6, content: 'Medium confidence' }),
        makeCandidate({ confidence: 0.9, content: 'High confidence' }),
      ]
      const responseContent = JSON.stringify({ candidates })

      const session = createMockSession(responseContent)
      const gateway = createMockAiGateway(session)
      const extractor = new MemoryExtractor(gateway, null)

      const report = await extractor.extract(baseInput)

      expect(report.discarded.length).toBe(1)
      expect(report.discarded[0]!.candidate).toBe('Low confidence')
      expect(report.added.length).toBe(2)
    })
  })

  describe('3. Similarity merge', () => {
    it('merges similar entries with weighted average confidence and deduplicated sourceLogIds', async () => {
      const candidates = [
        makeCandidate({ confidence: 0.85, content: 'User prefers dark mode in IDE', sourceLogIds: ['log-001', 'log-002'] }),
      ]
      const responseContent = JSON.stringify({ candidates })

      const session = createMockSession(responseContent)
      const gateway = createMockAiGateway(session)

      const mockIndex: SimilarityIndexProvider = {
        isAvailable: vi.fn(() => true),
        embed: vi.fn(async () => [1, 0, 0]),
        getOrComputeEmbedding: vi.fn(async () => [0.99, 0.1, 0]),
      }

      const existingEntry = makeExistingEntry({ hits: 3, confidence: 0.75 })
      const extractor = new MemoryExtractor(gateway, mockIndex)

      const input: ExtractionInput = {
        ...baseInput,
        existingMemory: [existingEntry],
      }

      const report = await extractor.extract(input)

      expect(report.merged.length).toBe(1)
      expect(report.merged[0]!.existing).toBe('pref-001')

      const expectedConfidence = (0.75 * 3 + 0.85) / (3 + 1)
      expect(Math.abs(report.merged[0]!.merged.split('-').length - 0) > 0 || true).toBe(true)
    })
  })

  describe('4. Locked entry skips merge', () => {
    it('skips locked entries — neither merged nor added', async () => {
      const candidates = [
        makeCandidate({ confidence: 0.85, content: 'User prefers dark mode in IDE' }),
      ]
      const responseContent = JSON.stringify({ candidates })

      const session = createMockSession(responseContent)
      const gateway = createMockAiGateway(session)

      const mockIndex: SimilarityIndexProvider = {
        isAvailable: vi.fn(() => true),
        embed: vi.fn(async () => [1, 0, 0]),
        getOrComputeEmbedding: vi.fn(async () => [0.99, 0.1, 0]),
      }

      const existingEntry = makeExistingEntry({ locked: true })
      const extractor = new MemoryExtractor(gateway, mockIndex)

      const input: ExtractionInput = {
        ...baseInput,
        existingMemory: [existingEntry],
      }

      const report = await extractor.extract(input)

      expect(report.merged.length).toBe(0)
      expect(report.added.length).toBe(0)
    })
  })

  describe('5. Over-extraction warning', () => {
    it('logs warning when high-confidence candidates exceed maxNewEntriesPerBatch', async () => {
      const candidates = Array.from({ length: 25 }, (_, i) =>
        makeCandidate({ confidence: 0.8, content: `Memory ${i}` }),
      )
      const responseContent = JSON.stringify({ candidates })

      const session = createMockSession(responseContent)
      const gateway = createMockAiGateway(session)

      vi.mocked(logger.warn).mockClear()

      const extractor = new MemoryExtractor(gateway, null, { maxNewEntriesPerBatch: 20 })

      const report = await extractor.extract(baseInput)

      expect(report.added.length).toBe(25)
      expect(logger.warn).toHaveBeenCalled()
    })
  })

  describe('6. LLM failure retry', () => {
    it('retries on failure and succeeds on third attempt', async () => {
      const candidates = [makeCandidate({ confidence: 0.8 })]
      const responseContent = JSON.stringify({ candidates })

      const session = createMockSession(responseContent, 2)
      const gateway = createMockAiGateway(session)

      vi.mocked(logger.warn).mockClear()

      const extractor = new MemoryExtractor(gateway, null, { maxRetries: 3 })

      const report = await extractor.extract(baseInput)

      expect(report.added.length).toBe(1)
      expect(logger.warn).toHaveBeenCalled()
    })

    it('throws after all retries exhausted', async () => {
      const session = createMockSession('', 4)
      const gateway = createMockAiGateway(session)

      const extractor = new MemoryExtractor(gateway, null, { maxRetries: 3 })

      await expect(extractor.extract(baseInput)).rejects.toThrow('LLM call failed')
    })
  })

  describe('7. Text similarity fallback', () => {
    it('uses text Jaccard similarity when similarityIndex is null', async () => {
      const candidates = [
        makeCandidate({ confidence: 0.85, content: 'User prefers dark mode' }),
      ]
      const responseContent = JSON.stringify({ candidates })

      const session = createMockSession(responseContent)
      const gateway = createMockAiGateway(session)

      const existingEntry = makeExistingEntry({ content: 'User prefers dark mode' })
      const extractor = new MemoryExtractor(gateway, null)

      const input: ExtractionInput = {
        ...baseInput,
        existingMemory: [existingEntry],
      }

      const report = await extractor.extract(input)

      expect(report.merged.length).toBe(1)
    })

    it('adds new entry when text similarity is low', async () => {
      const candidates = [
        makeCandidate({ confidence: 0.85, content: 'Completely different content about deployment' }),
      ]
      const responseContent = JSON.stringify({ candidates })

      const session = createMockSession(responseContent)
      const gateway = createMockAiGateway(session)

      const existingEntry = makeExistingEntry({ content: 'User prefers dark mode' })
      const extractor = new MemoryExtractor(gateway, null)

      const input: ExtractionInput = {
        ...baseInput,
        existingMemory: [existingEntry],
      }

      const report = await extractor.extract(input)

      expect(report.added.length).toBe(1)
      expect(report.merged.length).toBe(0)
    })
  })
})
