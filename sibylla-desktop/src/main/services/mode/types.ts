export type AiModeId = 'plan' | 'analyze' | 'review' | 'write' | 'free' | string

export interface OutputConstraints {
  requireStructuredOutput?: boolean
  maxResponseLength?: number
  toneFilter?: 'direct' | 'formal' | 'casual'
  allowNegativeFeedback?: boolean
}

export interface AiModeEvaluatorConfig {
  checkExecutability?: boolean
  requireTimeEstimates?: boolean
  requireMultiPerspective?: boolean
  suppressRecommendation?: boolean
  requireIssuesFound?: boolean
  minimizeQuestions?: boolean
}

export interface AiModeUiHints {
  bubbleStyle?: 'formal' | 'casual' | 'technical'
  responseFormatHint?: 'structured' | 'conversational' | 'concise'
}

export interface AiModeDefinition {
  id: AiModeId
  label: string
  labelI18n?: Record<string, string>
  icon: string
  color: string
  description: string
  systemPromptPrefix: string
  outputConstraints?: OutputConstraints
  modeEvaluatorConfig?: AiModeEvaluatorConfig
  produces?: Array<'plan' | 'analysis' | 'review' | 'writing' | string>
  inputPlaceholder: string
  uiHints?: AiModeUiHints
  requiresContext?: Array<'workspace-files' | 'selection' | 'url'>
  minModelCapability?: 'basic' | 'advanced'
  builtin: boolean
}

export interface ActiveAiModeState {
  conversationId: string
  aiModeId: AiModeId
  activatedAt: string
  activatedBy: 'user' | 'system' | 'auto-detect'
}

export interface ModeEvaluationResult {
  warnings: ModeWarning[]
}

export interface ModeWarning {
  severity: 'info' | 'warning'
  code: string
  message: string
}
