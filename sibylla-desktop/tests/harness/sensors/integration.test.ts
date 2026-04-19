/**
 * Sensors + Guides integration tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GuideRegistry } from '../../../src/main/services/harness/guides/registry'
import { SpecComplianceSensor } from '../../../src/main/services/harness/sensors/spec-compliance'
import { ReferenceIntegritySensor } from '../../../src/main/services/harness/sensors/reference-integrity'
import { MarkdownFormatSensor } from '../../../src/main/services/harness/sensors/markdown-format'
import { SensorFeedbackLoop } from '../../../src/main/services/harness/sensors/feedback-loop'
import type { GuideMatchContext } from '../../../src/main/services/harness/guides/types'
import type { AIChatRequest, AIChatResponse, AssembledContext, WorkspaceConfig } from '../../../src/shared/types'
import type { Generator } from '../../../src/main/services/harness/generator'
import type { Sensor } from '../../../src/main/services/harness/sensors/types'

vi.mock('../../../src/main/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

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

const defaultWorkspaceConfig: WorkspaceConfig = {
  workspaceId: 'ws-test',
  name: 'Test',
  description: '',
  icon: '',
  defaultModel: 'claude-sonnet-4-20250514',
  syncInterval: 0,
  createdAt: '',
  gitProvider: 'sibylla',
  gitRemote: null,
  lastSyncAt: null,
}

const defaultMatchCtx: GuideMatchContext = {
  currentModel: 'claude-sonnet-4-20250514',
  workspaceConfig: defaultWorkspaceConfig,
  userId: 'user-1',
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

const mockFileManager = {
  exists: vi.fn(),
} as unknown as import('../../../src/main/services/file-manager').FileManager

describe('Guide → Generator → Sensor integration', () => {
  let registry: GuideRegistry

  beforeEach(() => {
    vi.clearAllMocks()
    registry = new GuideRegistry(mockLogger as never)
  })

  it('should activate SpecModificationGuide for spec file → Generator → SpecComplianceSensor passes', async () => {
    await registry.loadBuiltIn()

    const request: AIChatRequest = {
      message: 'Update the design spec',
      intent: 'modify_file',
      targetFile: 'design.md',
    }

    const resolved = registry.resolve(request, defaultMatchCtx)
    expect(resolved.some(g => g.id === 'risk.spec-modification')).toBe(true)

    const sensor = new SpecComplianceSensor()
    const cleanResponse = createResponse('The spec has been updated with new requirements.')
    const signals = await sensor.scan(cleanResponse, mockContext)
    expect(signals).toHaveLength(0)
  })

  it('should detect non-existent file reference via ReferenceIntegritySensor and correct', async () => {
    vi.mocked(mockFileManager.exists).mockImplementation(async (p: string) => {
      if (p === 'src/missing/file.ts') return false
      return true
    })

    const sensors: Sensor[] = [
      new ReferenceIntegritySensor(mockFileManager as never, null),
    ]

    const initialResponse = createResponse('See @[[src/missing/file.ts]] for the implementation.')
    const refinedResponse = createResponse('See @[[src/existing/file.ts]] for the implementation.')

    const generator = { refine: vi.fn().mockResolvedValue(refinedResponse) } as unknown as Generator
    const loop = new SensorFeedbackLoop(sensors, mockLogger as never)

    vi.mocked(mockFileManager.exists).mockImplementation(async (p: string) => {
      if (p === 'src/existing/file.ts') return true
      if (p === 'src/missing/file.ts') return false
      return true
    })

    const result = await loop.process(initialResponse, mockContext, generator, {
      message: 'Where is the helper?',
    })

    expect(result.corrections).toBe(1)
    expect(generator.refine).toHaveBeenCalledTimes(1)
  })

  it('should handle multiple guides injected with all sensors passing', async () => {
    await registry.loadBuiltIn()

    const request: AIChatRequest = {
      message: 'Modify this file',
      intent: 'modify_file',
      targetFile: 'docs/product/roadmap.md',
    }

    const resolved = registry.resolve(request, defaultMatchCtx)
    expect(resolved.length).toBeGreaterThanOrEqual(2)

    const guideIds = resolved.map(g => g.id)
    expect(guideIds).toContain('path.product-docs')
    expect(guideIds).toContain('intent.file-edit')

    const sensors: Sensor[] = [
      new SpecComplianceSensor(),
      new MarkdownFormatSensor(),
    ]

    const generator = { refine: vi.fn() } as unknown as Generator
    const loop = new SensorFeedbackLoop(sensors, mockLogger as never)

    const cleanResponse = createResponse([
      '## Product Roadmap Update',
      '',
      'Added new milestone for Q3.',
    ].join('\n'))

    const result = await loop.process(cleanResponse, mockContext, generator, request)

    expect(result.corrections).toBe(0)
    expect(generator.refine).not.toHaveBeenCalled()
  })
})
