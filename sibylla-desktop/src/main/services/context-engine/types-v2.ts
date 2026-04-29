export type ContextLayerTypeV2 =
  | 'always'
  | 'ai-mode'
  | 'memory'
  | 'skill'
  | 'cross-source'
  | 'manual'

export interface ContextLayerV2 {
  type: ContextLayerTypeV2
  priority: number
  content: string
  tokens: number
  hits?: number
  sources?: ReadonlyArray<{ readonly kind: string; readonly id?: string }>
}

export interface ContextAssemblyRequestV2 {
  userMessage: string
  currentFile?: string
  manualRefs: string[]
  aiMode?: import('../mode/types').AiModeDefinition
  activeSkills?: string[]
  intent?: string
  tokenBudget?: number
  forceReSearch?: boolean
}

export interface AssembledContextV2 {
  layers: ContextLayerV2[]
  systemPrompt: string
  totalTokens: number
  sources: ReadonlyArray<{ readonly kind: string; readonly id?: string }>
  warnings: string[]
}

export const V2_BUDGET_WEIGHTS: Record<ContextLayerTypeV2, number> = {
  always: 0.30,
  'ai-mode': 0.10,
  memory: 0.15,
  skill: 0.15,
  'cross-source': 0.20,
  manual: 0.10,
} as const

export const V2_DEFAULT_TOKEN_BUDGET = 50000
