import type { Hook } from '../types'
import type { GuardrailEngine } from '../../harness/guardrails/engine'
import type { GuideRegistry } from '../../harness/guides/registry'
import type { SensorFeedbackLoop } from '../../harness/sensors/feedback-loop'
import type { Evaluator } from '../../harness/evaluator'
import { GuardrailHook } from './guardrail-hook'
import { GuideHook } from './guide-hook'
import { SensorHook } from './sensor-hook'
import { EvaluatorHook } from './evaluator-hook'

export interface BuiltinHookDeps {
  guardrailEngine: GuardrailEngine
  guideRegistry?: GuideRegistry
  sensorFeedbackLoop?: SensorFeedbackLoop
  evaluator?: Evaluator
}

export function createBuiltinHooks(deps: BuiltinHookDeps): Hook[] {
  const hooks: Hook[] = [new GuardrailHook(deps.guardrailEngine)]
  if (deps.guideRegistry) hooks.push(new GuideHook(deps.guideRegistry))
  if (deps.sensorFeedbackLoop) hooks.push(new SensorHook(deps.sensorFeedbackLoop))
  if (deps.evaluator) hooks.push(new EvaluatorHook(deps.evaluator))
  return hooks
}

export { GuardrailHook } from './guardrail-hook'
export { GuideHook } from './guide-hook'
export { SensorHook } from './sensor-hook'
export { EvaluatorHook } from './evaluator-hook'
