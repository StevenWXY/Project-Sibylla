/**
 * Harness module barrel exports
 *
 * Re-exports all public types and classes from the Harness subsystem.
 */

export { HarnessOrchestrator } from './orchestrator'
export { Generator } from './generator'
export { Evaluator } from './evaluator'
export { IntentClassifier, DEFAULT_CLASSIFIER_CONFIG } from './intent-classifier'
export type { ClassifyResult, ClassifierConfig } from './intent-classifier'
export { ToolScopeManager, INTENT_PROFILES, TOOL_NOT_AVAILABLE_MESSAGE } from './tool-scope'
export type { HarnessIntent, ToolDefinition, ToolContext, IntentProfile, ToolSelection } from './tool-scope'
export { registerBuiltInTools } from './built-in-tools'

// === TASK021 ===
export { TaskStateMachine } from './task-state-machine'
export type { TaskState, TaskStep, TaskArtifacts, TaskResumeResult } from './task-state-machine'
export { isResumeableStatus, isTerminalStatus } from './task-state-machine'
