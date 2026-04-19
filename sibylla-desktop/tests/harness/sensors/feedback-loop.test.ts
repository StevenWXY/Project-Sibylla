/**
 * SensorFeedbackLoop unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SensorFeedbackLoop } from '../../../src/main/services/harness/sensors/feedback-loop'
import type { Sensor } from '../../../src/main/services/harness/sensors/types'
import type { AIChatRequest, AIChatResponse, AssembledContext, SensorSignal } from '../../../src/shared/types'
import type { Generator } from '../../../src/main/services/harness/generator'
import { SENSOR_TIMEOUT_MS, MAX_CORRECTION_ROUNDS } from '../../../src/main/services/harness/sensors/types'

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

const mockRequest: AIChatRequest = {
  message: 'Edit the spec file',
  intent: 'modify_file',
  targetFile: 'CLAUDE.md',
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

function makeErrorSignal(sensorId: string, message: string): SensorSignal {
  return {
    sensorId,
    severity: 'error',
    message,
    correctionHint: `Fix: ${message}`,
  }
}

function createPassSensor(id: string): Sensor {
  return {
    id,
    description: `Pass sensor ${id}`,
    scan: vi.fn().mockResolvedValue([]),
  }
}

function createFailSensor(id: string, signals: SensorSignal[]): Sensor {
  return {
    id,
    description: `Fail sensor ${id}`,
    scan: vi.fn().mockResolvedValue(signals),
  }
}

describe('SensorFeedbackLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 0 corrections when all sensors pass', async () => {
    const sensors: Sensor[] = [
      createPassSensor('sensor-a'),
      createPassSensor('sensor-b'),
    ]
    const loop = new SensorFeedbackLoop(sensors, mockLogger as never)
    const generator = { refine: vi.fn() } as unknown as Generator

    const result = await loop.process(
      createResponse('Clean response'),
      mockContext,
      generator,
      mockRequest,
    )

    expect(result.corrections).toBe(0)
    expect(result.signals).toHaveLength(0)
    expect(generator.refine).not.toHaveBeenCalled()
  })

  it('should refine and pass on second round → 1 correction', async () => {
    const errorSignal = makeErrorSignal('sensor-a', 'Problem found')
    const failThenPass = vi.fn()
      .mockResolvedValueOnce([errorSignal])
      .mockResolvedValueOnce([])

    const sensors: Sensor[] = [
      { id: 'sensor-a', description: 'test', scan: failThenPass },
    ]
    const refinedResponse = createResponse('Fixed response')
    const generator = { refine: vi.fn().mockResolvedValue(refinedResponse) } as unknown as Generator

    const loop = new SensorFeedbackLoop(sensors, mockLogger as never)
    const result = await loop.process(
      createResponse('Initial response'),
      mockContext,
      generator,
      mockRequest,
    )

    expect(result.corrections).toBe(1)
    expect(generator.refine).toHaveBeenCalledTimes(1)
  })

  it('should return 2 corrections when both rounds have errors', async () => {
    const errorSignal = makeErrorSignal('sensor-a', 'Persistent problem')
    const alwaysFail = vi.fn().mockResolvedValue([errorSignal])

    const sensors: Sensor[] = [
      { id: 'sensor-a', description: 'test', scan: alwaysFail },
    ]
    const refinedResponse = createResponse('Still broken')
    const generator = { refine: vi.fn().mockResolvedValue(refinedResponse) } as unknown as Generator

    const loop = new SensorFeedbackLoop(sensors, mockLogger as never)
    const result = await loop.process(
      createResponse('Initial response'),
      mockContext,
      generator,
      mockRequest,
    )

    expect(result.corrections).toBe(MAX_CORRECTION_ROUNDS)
    expect(generator.refine).toHaveBeenCalledTimes(MAX_CORRECTION_ROUNDS)
  })

  it('should skip sensor on timeout', async () => {
    const slowSensor: Sensor = {
      id: 'slow-sensor',
      description: 'Slow sensor',
      scan: vi.fn().mockDelayedValue?.bind(vi.fn()) ?? (() => new Promise<never>(() => {})),
    }
    const fastPassSensor = createPassSensor('fast-sensor')

    const sensors: Sensor[] = [slowSensor, fastPassSensor]
    const loop = new SensorFeedbackLoop(sensors, mockLogger as never)
    const generator = { refine: vi.fn() } as unknown as Generator

    const result = await loop.process(
      createResponse('Response'),
      mockContext,
      generator,
      mockRequest,
    )

    expect(result.corrections).toBe(0)
  })

  it('should skip sensor on exception', async () => {
    const throwingSensor: Sensor = {
      id: 'throwing-sensor',
      description: 'Throwing sensor',
      scan: vi.fn().mockRejectedValue(new Error('Sensor crashed')),
    }
    const passSensor = createPassSensor('pass-sensor')

    const sensors: Sensor[] = [throwingSensor, passSensor]
    const loop = new SensorFeedbackLoop(sensors, mockLogger as never)
    const generator = { refine: vi.fn() } as unknown as Generator

    const result = await loop.process(
      createResponse('Response'),
      mockContext,
      generator,
      mockRequest,
    )

    expect(result.corrections).toBe(0)
    expect(mockLogger.warn).toHaveBeenCalled()
  })

  it('should return current response and signals when generator.refine() throws', async () => {
    const errorSignal = makeErrorSignal('sensor-a', 'Bad content')
    const failSensor: Sensor = {
      id: 'sensor-a',
      description: 'test',
      scan: vi.fn().mockResolvedValue([errorSignal]),
    }

    const sensors: Sensor[] = [failSensor]
    const generator = {
      refine: vi.fn().mockRejectedValue(new Error('Refine failed')),
    } as unknown as Generator

    const loop = new SensorFeedbackLoop(sensors, mockLogger as never)
    const result = await loop.process(
      createResponse('Initial response'),
      mockContext,
      generator,
      mockRequest,
    )

    expect(result.corrections).toBe(0)
    expect(result.signals.length).toBeGreaterThan(0)
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'sensor.feedback_loop.refine_failed',
      expect.objectContaining({ error: 'Refine failed' }),
    )
  })
})
