import type {
  SkillV2,
  SkillToolsConfig,
  SkillExecutionPlan,
  SkillResult,
} from '../../../shared/types'

export type { SkillV2, SkillToolsConfig, SkillExecutionPlan, SkillResult }

export interface SkillResources {
  prompt: string
  examples: string[]
  toolsConfig: SkillToolsConfig | null
  totalTokens: number
}

export interface SkillExecutionContext {
  skill: SkillV2
  userInput: string
  parentTraceId: string
  onSkillEnd?: () => void
}

export type SkillSource = 'builtin' | 'workspace' | 'personal'

export interface IndexFrontmatter {
  id: string
  version: string
  name: string
  description: string
  author?: string
  category?: string
  tags?: string[]
  scope?: 'public' | 'private' | 'personal' | 'team'
  triggers?: Array<{ slash?: string; mention?: string; pattern?: string }>
  loadable_in?: { modes?: string[] }
  estimated_tokens?: number
}

export interface SkillConfirmationRequest {
  skillId: string
  skillName: string
  triggerType: 'slash' | 'pattern' | 'mention'
  userInput: string
}
