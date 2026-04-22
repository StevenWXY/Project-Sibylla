import type { AiModeId } from '../mode/types'

export interface OptimizeRequest {
  originalText: string
  currentMode: AiModeId
  conversationContext?: {
    summary: string
    recentMessages: Array<{ role: string; content: string }>
  }
  userPreferences?: {
    preferredLength?: 'short' | 'medium' | 'detailed'
    language?: string
  }
}

export type KeyChangeType = 'added' | 'clarified' | 'removed' | 'restructured'

export interface KeyChange {
  type: KeyChangeType
  description: string
}

export interface OptimizationSuggestion {
  id: string
  text: string
  rationale: string
  keyChanges: KeyChange[]
  estimatedImprovementScore: number
}

export interface OptimizeResponse {
  requestId: string
  suggestions: OptimizationSuggestion[]
  optimizationMode: 'quick' | 'thorough'
  durationMs: number
}

export class OptimizationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'OptimizationError'
  }
}

export interface OptimizerConfig {
  optimizerModel: string
  maxCacheSize: number
  cacheTtlMs: number
  timeoutMs: number
  maxSuggestions: number
}
