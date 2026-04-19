import type { AIChatRequest, AIChatResponse, AssembledContext, SensorSignal } from '../../../../shared/types'
import type { Sensor } from './types'
import { SENSOR_TIMEOUT_MS, MAX_CORRECTION_ROUNDS } from './types'
import type { Generator } from '../generator'
import type { logger as loggerType } from '../../../utils/logger'

export interface SensorFeedbackResult {
  readonly response: AIChatResponse
  readonly signals: readonly SensorSignal[]
  readonly corrections: number
}

export class SensorFeedbackLoop {
  constructor(
    private readonly sensors: readonly Sensor[],
    private readonly logger: typeof loggerType,
  ) {}

  async process(
    initialResponse: AIChatResponse,
    context: AssembledContext,
    generator: Generator,
    request: AIChatRequest,
  ): Promise<SensorFeedbackResult> {
    let current = initialResponse
    const allSignals: SensorSignal[] = []

    for (let round = 0; round < MAX_CORRECTION_ROUNDS; round++) {
      const roundSignals = await this.runAllSensorsWithTimeout(current, context)
      allSignals.push(...roundSignals)

      const errors = roundSignals.filter(s => s.severity === 'error')

      if (errors.length === 0) {
        return { response: current, signals: allSignals, corrections: round }
      }

      try {
        const correctionPrompt = this.buildCorrectionPrompt(errors)
        current = await generator.refine({
          originalRequest: request,
          previousResponse: current,
          rejectionReport: {
            evaluatorId: 'sensor-feedback-loop',
            verdict: 'fail',
            dimensions: {},
            criticalIssues: errors.map(e => e.message),
            minorIssues: [],
            rationale: correctionPrompt,
            timestamp: Date.now(),
          },
          context,
          attemptNumber: round + 1,
        })
      } catch (err) {
        this.logger.warn('sensor.feedback_loop.refine_failed', {
          error: err instanceof Error ? err.message : String(err),
          round,
        })
        return { response: current, signals: allSignals, corrections: round }
      }
    }

    return { response: current, signals: allSignals, corrections: MAX_CORRECTION_ROUNDS }
  }

  async runAllSensorsWithTimeout(
    response: AIChatResponse,
    context: AssembledContext,
  ): Promise<readonly SensorSignal[]> {
    const results = await Promise.allSettled(
      this.sensors.map(sensor => this.withTimeout(sensor, response, context)),
    )

    const signals: SensorSignal[] = []
    for (const result of results) {
      if (result.status === 'fulfilled') {
        signals.push(...result.value)
      } else {
        this.logger.warn('sensor.feedback_loop.sensor_failed', {
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        })
      }
    }

    return signals
  }

  private async withTimeout(
    sensor: Sensor,
    response: AIChatResponse,
    context: AssembledContext,
  ): Promise<readonly SensorSignal[]> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Sensor '${sensor.id}' timed out after ${SENSOR_TIMEOUT_MS}ms`)), SENSOR_TIMEOUT_MS),
    )

    try {
      return await Promise.race([sensor.scan(response, context), timeout])
    } catch (err) {
      this.logger.warn('sensor.feedback_loop.sensor_timeout_or_error', {
        sensorId: sensor.id,
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }

  buildCorrectionPrompt(errors: readonly SensorSignal[]): string {
    const parts: string[] = ['The following issues were detected in your response:\n']

    for (const [index, error] of errors.entries()) {
      parts.push(`${index + 1}. [${error.sensorId}] ${error.message}`)
      if (error.correctionHint) {
        parts.push(`   → Fix: ${error.correctionHint}`)
      }
      if (error.location?.line !== undefined) {
        parts.push(`   → Location: line ${error.location.line}`)
      }
    }

    parts.push('\nPlease revise your response to fix all the issues above.')
    return parts.join('\n')
  }
}
