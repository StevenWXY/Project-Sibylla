/**
 * HarnessOrchestrator unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HarnessOrchestrator } from '../../src/main/services/harness/orchestrator'
import type { Generator } from '../../src/main/services/harness/generator'
import type { Evaluator } from '../../src/main/services/harness/evaluator'
import type { GuardrailEngine } from '../../src/main/services/harness/guardrails/engine'
import type { ContextEngine } from '../../src/main/services/context-engine'
import type { MemoryManager } from '../../src/main/services/memory-manager'
import type { AIChatRequest, AIChatResponse, AssembledContext, EvaluationReport } from '../../src/shared/types'

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}

const mockContext: AssembledContext = {
  layers: [],
  systemPrompt: 'System prompt',
  totalTokens: 100,
  budgetUsed: 100,
  budgetTotal: 16000,
  sources: [],
  warnings: [],
}

const mockResponse: AIChatResponse = {
  id: 'resp-1',
  model: 'claude-sonnet-4-20250514',
  provider: 'anthropic',
  content: 'AI response',
  usage: { inputTokens: 50, outputTokens: 30, totalTokens: 80, estimatedCostUsd: 0.001 },
  intercepted: false,
  warnings: [],
  ragHits: [],
  memory: { tokenCount: 0, tokenDebt: 0, flushTriggered: false },
}

function createPassReport(evaluatorId: string = 'evaluator-default'): EvaluationReport {
  return {
    evaluatorId,
    verdict: 'pass',
    dimensions: {},
    criticalIssues: [],
    minorIssues: [],
    rationale: 'All good',
    timestamp: Date.now(),
  }
}

function createFailReport(evaluatorId: string = 'evaluator-default'): EvaluationReport {
  return {
    evaluatorId,
    verdict: 'fail',
    dimensions: { factual_consistency: { pass: false, issues: ['Wrong info'] } },
    criticalIssues: ['Critical problem'],
    minorIssues: [],
    rationale: 'Found issues',
    timestamp: Date.now(),
  }
}

function createMocks() {
  const generator = {
    generate: vi.fn().mockResolvedValue(mockResponse),
    refine: vi.fn().mockResolvedValue(mockResponse),
  } as unknown as Generator

  const evaluator = {
    evaluate: vi.fn().mockResolvedValue(createPassReport()),
  } as unknown as Evaluator

  const guards = {
    check: vi.fn().mockResolvedValue({ allow: true }),
    listRules: vi.fn().mockReturnValue([]),
    setRuleEnabled: vi.fn(),
  } as unknown as GuardrailEngine

  const contextEngine = {
    assembleContext: vi.fn().mockResolvedValue(mockContext),
    assembleForHarness: vi.fn().mockResolvedValue(mockContext),
  } as unknown as ContextEngine

  const memoryManager = {
    appendHarnessTrace: vi.fn().mockResolvedValue(undefined),
    appendLog: vi.fn().mockResolvedValue(undefined),
  } as unknown as MemoryManager

  return { generator, evaluator, guards, contextEngine, memoryManager }
}

describe('HarnessOrchestrator', () => {
  let mocks: ReturnType<typeof createMocks>

  beforeEach(() => {
    vi.clearAllMocks()
    mocks = createMocks()
  })

  describe('resolveMode()', () => {
    it('should return panel for spec files', () => {
      const orchestrator = new HarnessOrchestrator(
        mocks.generator, mocks.evaluator, mocks.guards,
        mocks.contextEngine, mocks.memoryManager, mockLogger as never
      )

      expect(orchestrator.resolveMode({ message: 'Edit', targetFile: 'CLAUDE.md' })).toBe('panel')
      expect(orchestrator.resolveMode({ message: 'Edit', targetFile: 'docs/design.md' })).toBe('panel')
      expect(orchestrator.resolveMode({ message: 'Edit', targetFile: 'specs/requirements.md' })).toBe('panel')
      expect(orchestrator.resolveMode({ message: 'Edit', targetFile: 'specs/tasks.md' })).toBe('panel')
      expect(orchestrator.resolveMode({ message: 'Edit', targetFile: 'module_spec.md' })).toBe('panel')
    })

    it('should return dual for modify_file intent', () => {
      const orchestrator = new HarnessOrchestrator(
        mocks.generator, mocks.evaluator, mocks.guards,
        mocks.contextEngine, mocks.memoryManager, mockLogger as never
      )

      expect(orchestrator.resolveMode({ message: 'Edit', intent: 'modify_file' })).toBe('dual')
    })

    it('should return default mode for normal chat', () => {
      const orchestrator = new HarnessOrchestrator(
        mocks.generator, mocks.evaluator, mocks.guards,
        mocks.contextEngine, mocks.memoryManager, mockLogger as never,
        { defaultMode: 'single' }
      )

      expect(orchestrator.resolveMode({ message: 'Hello' })).toBe('single')
    })
  })

  describe('execute() — Single mode', () => {
    it('should call generator.generate and return single mode result', async () => {
      const orchestrator = new HarnessOrchestrator(
        mocks.generator, mocks.evaluator, mocks.guards,
        mocks.contextEngine, mocks.memoryManager, mockLogger as never,
        { defaultMode: 'single' }
      )

      const result = await orchestrator.execute({ message: 'Hello' })

      expect(result.mode).toBe('single')
      expect(result.generatorAttempts).toBe(1)
      expect(result.evaluations).toHaveLength(0)
      expect(result.degraded).toBe(false)
      expect(mocks.generator.generate).toHaveBeenCalledTimes(1)
    })
  })

  describe('execute() — Dual mode', () => {
    it('should pass through on first evaluation pass', async () => {
      const orchestrator = new HarnessOrchestrator(
        mocks.generator, mocks.evaluator, mocks.guards,
        mocks.contextEngine, mocks.memoryManager, mockLogger as never,
        { defaultMode: 'dual' }
      )

      const result = await orchestrator.execute({ message: 'Hello' })

      expect(result.mode).toBe('dual')
      expect(result.evaluations).toHaveLength(1)
      expect(result.evaluations[0].verdict).toBe('pass')
      expect(mocks.generator.refine).not.toHaveBeenCalled()
    })

    it('should retry on evaluation fail', async () => {
      vi.mocked(mocks.evaluator.evaluate)
        .mockResolvedValueOnce(createFailReport())
        .mockResolvedValueOnce(createPassReport())

      const orchestrator = new HarnessOrchestrator(
        mocks.generator, mocks.evaluator, mocks.guards,
        mocks.contextEngine, mocks.memoryManager, mockLogger as never,
        { defaultMode: 'dual', maxRetries: 2 }
      )

      const result = await orchestrator.execute({ message: 'Hello' })

      expect(result.evaluations).toHaveLength(2)
      expect(result.evaluations[0].verdict).toBe('fail')
      expect(result.evaluations[1].verdict).toBe('pass')
      expect(mocks.generator.refine).toHaveBeenCalledTimes(1)
    })

    it('should return all reports when retries exhausted', async () => {
      vi.mocked(mocks.evaluator.evaluate)
        .mockResolvedValue(createFailReport())

      const orchestrator = new HarnessOrchestrator(
        mocks.generator, mocks.evaluator, mocks.guards,
        mocks.contextEngine, mocks.memoryManager, mockLogger as never,
        { defaultMode: 'dual', maxRetries: 2 }
      )

      const result = await orchestrator.execute({ message: 'Hello' })

      expect(result.evaluations).toHaveLength(2)
      expect(result.evaluations.every(e => e.verdict === 'fail')).toBe(true)
      expect(mocks.generator.refine).toHaveBeenCalledTimes(2)
    })
  })

  describe('execute() — Panel mode', () => {
    it('should run two evaluators in parallel', async () => {
      vi.mocked(mocks.evaluator.evaluate)
        .mockResolvedValueOnce(createPassReport('architecture'))
        .mockResolvedValueOnce(createPassReport('consistency'))

      const orchestrator = new HarnessOrchestrator(
        mocks.generator, mocks.evaluator, mocks.guards,
        mocks.contextEngine, mocks.memoryManager, mockLogger as never,
        { defaultMode: 'dual' }
      )

      const result = await orchestrator.execute({ message: 'Edit', targetFile: 'CLAUDE.md' })

      expect(result.mode).toBe('panel')
      expect(result.evaluations).toHaveLength(2)
      expect(mocks.evaluator.evaluate).toHaveBeenCalledTimes(2)
    })
  })

  describe('degradation', () => {
    it('should degrade to single on evaluator error', async () => {
      vi.mocked(mocks.evaluator.evaluate).mockRejectedValue(new Error('Evaluator timeout'))

      const orchestrator = new HarnessOrchestrator(
        mocks.generator, mocks.evaluator, mocks.guards,
        mocks.contextEngine, mocks.memoryManager, mockLogger as never,
        { defaultMode: 'dual' }
      )

      const result = await orchestrator.execute({ message: 'Hello' })

      expect(result.degraded).toBe(true)
      expect(result.mode).toBe('single')
      expect(result.degradeReason).toContain('Evaluator timeout')
    })

    it('should throw if generator also fails during degradation', async () => {
      vi.mocked(mocks.evaluator.evaluate).mockRejectedValue(new Error('Eval error'))
      vi.mocked(mocks.generator.generate).mockRejectedValue(new Error('Generator error'))

      const orchestrator = new HarnessOrchestrator(
        mocks.generator, mocks.evaluator, mocks.guards,
        mocks.contextEngine, mocks.memoryManager, mockLogger as never,
        { defaultMode: 'dual' }
      )

      await expect(orchestrator.execute({ message: 'Hello' })).rejects.toThrow('Generator error')
    })
  })
})
