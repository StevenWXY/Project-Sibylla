import type { AIChatResponse, AssembledContext, SensorSignal } from '../../../../shared/types'

export interface Sensor {
  readonly id: string
  readonly description: string
  scan(response: AIChatResponse, context: AssembledContext): Promise<readonly SensorSignal[]>
}

export const SENSOR_TIMEOUT_MS = 1000
export const MAX_CORRECTION_ROUNDS = 2
