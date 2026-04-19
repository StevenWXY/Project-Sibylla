import type { AIChatRequest, WorkspaceConfig } from '../../../../shared/types'

export type GuideCategory = 'intent' | 'path' | 'model' | 'risk'

export interface Guide {
  readonly id: string
  readonly category: GuideCategory
  readonly priority: number
  readonly description: string
  matches(request: AIChatRequest, ctx: GuideMatchContext): boolean
  readonly content: string
  readonly tokenBudget: number
  enabled: boolean
}

export interface GuideMatchContext {
  readonly currentModel: string
  readonly workspaceConfig: WorkspaceConfig
  readonly userId: string
}

export const MAX_GUIDE_BUDGET_PERCENT = 0.2
